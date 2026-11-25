/**
 * Friends list (in the top bar), home lounge (online + global chat), and
 * trainer tooltips. Presence is a heartbeat against D1 — no sockets yet.
 */
import { api } from "./api.js";
import { mountDock, bindDock } from "./header-docks.js?v=2";
import { avatarColor } from "./accounts.js";
import { avatarSrc, avatarStyle, bannerVars } from "./cosmetics.js";
import { frameHtml, levelBadgeHtml, userFrame } from "./level-badge.js";
import { bannerBlockHtml } from "./mastery-banner.js";

let hooks = {
  getUser: () => null,
  toast: () => {},
  openProfile: () => {},
  openAuth: () => {},
  openDm: () => {},
  onTick: () => {},
};

let friendsState = { friends: [], incoming: [], outgoing: [], onlineNow: 0, trades: 0 };
let loungeState = { online: [], chat: [], me: null };
let pollTimer = 0;
let tipUser = null;
const chatSeen = {};

/** A short age for a chat line: now, 4m, 2h, 3d. */
function ago(at) {
  const s = Math.max(0, (Date.now() - Number(at)) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function initSocial(next) {
  hooks = { ...hooks, ...next };
  mountFriends();
  mountTip();
  if (!pollTimer) pollTimer = window.setInterval(() => tickSocial(), 5000);
  tickSocial();
}

export function notifySignedIn() {
  return tickSocial(true);
}

/** A face in the frame its trainer wears (none when the row carries no level). `opts.frame === false` leaves it bare, for stacked faces. */
export function faceHtml(user, size = "md", opts = {}) {
  const color = avatarColor(user?.color).hex;
  const src = avatarSrc(user?.avatar, user?.avatarStyle);
  const pixel = avatarStyle(user?.avatarStyle) === "pixel" ? " pixel" : "";
  const frame = opts.frame === false ? null : userFrame(user);
  const cls = `user-face ${size}${user?.online && !frame ? " on" : ""}${pixel}`;
  const face = `<span class="${cls}" style="--avatar:${esc(color)}"><img src="${esc(src)}" alt="" /></span>`;
  return frame ? frameHtml(face, frame, { size, color, online: Boolean(user?.online) }) : face;
}

/** The level stamp for a list row, or nothing when the row has no level. */
export const levelTag = (user, size = "sm") => levelBadgeHtml(user?.level, { size, prestige: user?.prestige });

export function currentFriends() {
  return friendsState;
}

export function currentLounge() {
  return loungeState;
}

async function tickSocial(force = false) {
  if (!force && document.visibilityState !== "visible") return;
  const signed = Boolean(hooks.getUser());
  const home = document.body.classList.contains("on-home") || Boolean(document.getElementById("social-chat-log")?.isConnected && document.body.classList.contains("on-social"));
  try {
    if (signed) await refreshFriends();
    if (home || force) await refreshLounge();
    hooks.onTick?.();
  } catch {
    /* lounge is optional chrome */
  }
}

function mountFriends() {
  if (document.getElementById("friends")) return;
  const root = document.createElement("aside");
  root.id = "friends";
  root.className = "friends";
  root.setAttribute("aria-label", "Friends");
  root.innerHTML = `
    <button type="button" class="friends-peek" id="friends-peek" aria-expanded="false" aria-controls="friends-panel" aria-label="Friends">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8.5" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><circle cx="16.5" cy="9.5" r="2.4"/><path d="M15.5 14.2a4.5 4.5 0 0 1 5 4.3"/></svg>
      <span class="friends-peek-live" id="friends-peek-live" hidden></span>
      <span class="friends-peek-count" id="friends-peek-count" aria-hidden="true" hidden>0</span>
    </button>
    <div class="friends-panel" id="friends-panel" role="region" aria-label="Friends">
      <div class="friends-now">
        <div class="friends-plate">
          <p class="friends-kicker">Friends</p>
          <b id="friends-title">Friends</b>
        </div>
        <small id="friends-sub">Sign in to add trainers</small>
        <button type="button" class="friends-hide" id="friends-hide" aria-label="Hide friends">–</button>
      </div>
      <form class="friends-add" id="friends-add">
        <input name="handle" maxlength="16" placeholder="@handle" autocapitalize="off" spellcheck="false" aria-label="Add by handle" />
        <button class="solid sm" type="submit">Add</button>
      </form>
      <a class="friends-trades" id="friends-trades" href="/trades">Trades<b id="friends-trades-count" hidden>0</b></a>
      <div class="friends-tabs">
        <button type="button" class="on" data-friends-tab="list">List</button>
        <button type="button" data-friends-tab="inbox">Inbox</button>
      </div>
      <div class="friends-list" id="friends-list"></div>
    </div>
  `;
  mountDock(root);

  const peek = root.querySelector("#friends-peek");
  const hide = root.querySelector("#friends-hide");
  const isOpen = () => root.classList.contains("is-open");
  const toggle = (open) => {
    if (open === isOpen()) return;
    root.classList.toggle("is-open", open);
    peek.setAttribute("aria-expanded", String(open));
    if (open) refreshFriends().catch(() => {});
  };
  peek.addEventListener("click", () => toggle(!isOpen()));
  hide.addEventListener("click", () => toggle(false));
  bindDock(root, { name: "friends", peek, isOpen, setOpen: toggle, focusOnOpen: hide });

  let tab = "list";
  root.querySelector(".friends-tabs").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-friends-tab]");
    if (!btn) return;
    tab = btn.dataset.friendsTab;
    root.querySelectorAll("[data-friends-tab]").forEach((el) => el.classList.toggle("on", el === btn));
    paintFriends(tab);
  });

  root.querySelector("#friends-add").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!hooks.getUser()) {
      hooks.openAuth("signin");
      return;
    }
    const input = e.target.handle;
    const handle = String(input.value || "").replace(/^@/, "").trim();
    if (handle.length < 3) return;
    try {
      const data = await api("/api/friends/request", {
        method: "POST",
        body: JSON.stringify({ handle }),
      });
      input.value = "";
      hooks.toast(data.status === "accepted" ? `You and @${handle} are friends.` : `Request sent to @${handle}.`);
      await refreshFriends();
    } catch (err) {
      hooks.toast(err.message || "Couldn't send that request.");
    }
  });

  root.addEventListener("click", onFriendsClick);
  paintFriends(tab);
}

async function onFriendsClick(e) {
  const dm = e.target.closest("[data-open-dm]");
  if (dm) {
    e.preventDefault();
    hooks.openDm(dm.dataset.openDm);
    return;
  }
  const accept = e.target.closest("[data-friend-accept]");
  const deny = e.target.closest("[data-friend-deny]");
  const remove = e.target.closest("[data-friend-remove]");
  const handle = accept?.dataset.friendAccept || deny?.dataset.friendDeny || remove?.dataset.friendRemove;
  if (!handle) return;
  e.preventDefault();
  try {
    if (remove) {
      await api("/api/friends/remove", { method: "POST", body: JSON.stringify({ handle }) });
      hooks.toast(`Removed @${handle}.`);
    } else {
      await api("/api/friends/respond", {
        method: "POST",
        body: JSON.stringify({ handle, accept: Boolean(accept) }),
      });
      hooks.toast(accept ? `You and @${handle} are friends.` : "Request declined.");
    }
    await refreshFriends();
  } catch (err) {
    hooks.toast(err.message || "Couldn't update friends.");
  }
}

async function refreshFriends() {
  const signed = hooks.getUser();
  const root = document.getElementById("friends");
  if (!root) return;
  if (!signed) {
    friendsState = { friends: [], incoming: [], outgoing: [], onlineNow: 0, trades: 0 };
    paintFriends(root.querySelector("[data-friends-tab].on")?.dataset.friendsTab || "list");
    return;
  }
  const data = await api("/api/friends");
  friendsState = {
    friends: data.friends || [],
    incoming: data.incoming || [],
    outgoing: data.outgoing || [],
    onlineNow: data.onlineNow || 0,
    trades: Number(data.trades) || 0, // trades: open offers waiting on this player
  };
    paintFriends(root.querySelector("[data-friends-tab].on")?.dataset.friendsTab || "list");
}

function paintFriends(tab) {
  const root = document.getElementById("friends");
  if (!root) return;
  const signed = hooks.getUser();
  const online = friendsState.friends.filter((row) => row.online);
  const peekLive = root.querySelector("#friends-peek-live");
  const peekCount = root.querySelector("#friends-peek-count");
  const badge = friendsState.incoming.length;
  // trades: offers waiting on the player count toward the corner number and sit on the Trades link.
  const offers = signed ? friendsState.trades || 0 : 0;
  const tradesCount = root.querySelector("#friends-trades-count");
  if (tradesCount) {
    tradesCount.hidden = offers < 1;
    tradesCount.textContent = String(offers);
    root.querySelector("#friends-trades").setAttribute("aria-label", offers ? `Trades, ${offers} waiting` : "Trades");
  }
  peekCount.hidden = badge + offers < 1;
  peekCount.textContent = String(badge + offers);
  // The count takes the corner when there is one; otherwise a green dot says someone is on.
  peekLive.hidden = badge + offers > 0 || online.length < 1;
  const said = [online.length ? `${online.length} online` : "", badge ? `${badge} ${badge === 1 ? "request" : "requests"}` : "", offers ? `${offers} trade ${offers === 1 ? "offer" : "offers"}` : ""].filter(Boolean);
  root.querySelector("#friends-peek").setAttribute("aria-label", said.length ? `Friends, ${said.join(", ")}` : "Friends");

  root.querySelector("#friends-title").textContent = "Friends";
  root.querySelector("#friends-sub").textContent = signed
    ? `${friendsState.friends.length} ${friendsState.friends.length === 1 ? "friend" : "friends"}, ${online.length} online`
    : "Sign in to add trainers";

  const inboxBtn = root.querySelector("[data-friends-tab='inbox']");
  if (inboxBtn) inboxBtn.textContent = badge ? `Inbox (${badge})` : "Inbox";

  const list = root.querySelector("#friends-list");
  if (!signed) {
    list.innerHTML = `<p class="friends-empty"><i class="soc-ball" aria-hidden="true"></i>Sign in to keep a friends list, send DMs, and comment on profiles.</p>
      <button type="button" class="solid" data-friends-signin>Sign in</button>`;
    list.querySelector("[data-friends-signin]")?.addEventListener("click", () => hooks.openAuth("signin"));
    return;
  }

  if (tab === "inbox") {
    const incoming = friendsState.incoming
      .map(
        (row) => `<div class="friends-row is-ask">
          <a href="/u/${esc(row.handle)}"><span class="dm-lab">${faceHtml(row, "sm")}</span><span class="dm-copy"><b>${levelTag(row)}<span class="dm-name">${esc(row.name)}</span></b><small>@${esc(row.handle)}</small></span></a>
          <div class="friends-row-actions">
            <button type="button" class="solid" data-friend-accept="${esc(row.handle)}">Accept</button>
            <button type="button" class="ghost" data-friend-deny="${esc(row.handle)}">No</button>
          </div>
        </div>`
      )
      .join("");
    const outgoing = friendsState.outgoing
      .map(
        (row) => `<div class="friends-row dim">
          <a href="/u/${esc(row.handle)}"><span class="dm-lab">${faceHtml(row, "sm")}</span><span class="dm-copy"><b>${levelTag(row)}<span class="dm-name">${esc(row.name)}</span></b><small>Waiting on them</small></span></a>
        </div>`
      )
      .join("");
    list.innerHTML =
      incoming || outgoing
        ? `${incoming}${outgoing ? `<p class="friends-label">Sent</p>${outgoing}` : ""}`
        : `<p class="friends-empty"><i class="soc-ball" aria-hidden="true"></i>No requests. Add someone by handle.</p>`;
    return;
  }

  if (!friendsState.friends.length) {
    list.innerHTML = `<p class="friends-empty"><i class="soc-ball" aria-hidden="true"></i>No friends yet. Add a trainer by handle above.</p>`;
    return;
  }
  list.innerHTML = friendsState.friends
    .map(
      (row) => `<div class="friends-row${row.online ? " is-live" : ""}">
        <a href="/u/${esc(row.handle)}"><span class="dm-lab">${faceHtml({ ...row, online: row.online }, "sm")}</span><span class="dm-copy"><b>${levelTag(row)}<span class="dm-name">${esc(row.name)}</span></b><small>${row.online ? `<i class="live-dot" aria-hidden="true"></i><em class="live-word">Online</em>` : `@${esc(row.handle)}`}</small></span></a>
        <button type="button" class="ghost tiny" data-open-dm="${esc(row.handle)}" aria-label="Message @${esc(row.handle)}">DM</button>
        <a class="ghost tiny" href="/trades/new/${esc(row.handle)}" aria-label="Trade with @${esc(row.handle)}">Trade</a>
        <button type="button" class="ghost tiny" data-friend-remove="${esc(row.handle)}" aria-label="Remove @${esc(row.handle)}">×</button>
      </div>`
    )
    .join("");
}

/** The lounge is drawn on Home and on Social's Lounge; each place has the same parts under its own ids. */
const LOUNGE_SPOTS = [
  { online: "home-online-list", count: "home-online-count", chat: "home-chat-log", form: "home-chat-form" },
  { online: "social-online-list", count: "social-online-count", chat: "social-chat-log", form: "social-chat-form" },
];

export async function refreshLounge() {
  if (!LOUNGE_SPOTS.some((spot) => document.getElementById(spot.online) || document.getElementById(spot.chat))) return;
  const data = await api("/api/lounge");
  loungeState = { online: data.online || [], chat: data.chat || [], me: data.me || null };
  paintLounge();
}

export function paintLounge() {
  for (const spot of LOUNGE_SPOTS) paintLoungeSpot(spot);
}

function paintLoungeSpot(spot) {
  const onlineEl = document.getElementById(spot.online);
  const countEl = document.getElementById(spot.count);
  const chatEl = document.getElementById(spot.chat);
  if (countEl) countEl.textContent = String(loungeState.online.length);
  if (onlineEl) {
    onlineEl.innerHTML = loungeState.online.length
      ? loungeState.online
          .map(
            (row) => `<button type="button" class="online-chip" data-user-tip="${esc(row.handle)}">
              ${faceHtml({ ...row, online: true }, "sm")}
              <span>${esc(row.name)}</span><i class="live-dot" aria-hidden="true"></i>
            </button>`
          )
          .join("")
      : `<p class="lounge-empty"><i class="soc-ball" aria-hidden="true"></i>Nobody is online. Sign in to show up here.</p>`;
  }
  if (chatEl) {
    const pin = chatEl.scrollHeight - chatEl.scrollTop < chatEl.clientHeight + 48;
    // Lines this spot has not drawn before rise in; the first paint staggers its last few.
    const seen = (chatSeen[spot.chat] ||= { first: true, ids: new Set() });
    const meHandle = loungeState.me?.handle || hooks.getUser()?.handle || "";
    const total = loungeState.chat.length;
    chatEl.innerHTML = total
      ? loungeState.chat
          .map((msg, i) => {
            const mine = meHandle && msg.user.handle === meHandle;
            const fresh = seen.first ? i >= total - 8 : !seen.ids.has(msg.id);
            const lag = seen.first ? i - Math.max(0, total - 8) : 0;
            return `<div class="chat-line${mine ? " mine" : ""}${fresh ? " is-new" : ""}"${fresh && lag ? ` style="--i:${lag}"` : ""}>
              <button type="button" class="chat-who" data-user-tip="${esc(msg.user.handle)}">${faceHtml(msg.user, "xs")}</button>
              <div class="chat-say">
                <p class="chat-meta"><b data-user-tip="${esc(msg.user.handle)}">${levelTag(msg.user, "xs")}${esc(mine ? "You" : msg.user.name)}</b>${msg.at ? `<time>${esc(ago(msg.at))}</time>` : ""}</p>
                <span>${esc(msg.body)}</span>
              </div>
            </div>`;
          })
          .join("")
      : `<p class="lounge-empty"><i class="soc-ball" aria-hidden="true"></i>The chat is empty. Say hi to the whole site.</p>`;
    seen.first = false;
    seen.ids = new Set(loungeState.chat.map((msg) => msg.id));
    if (pin) chatEl.scrollTop = chatEl.scrollHeight;
  }
  const form = document.getElementById(spot.form);
  if (form) form.classList.toggle("is-locked", !hooks.getUser());
}

function mountTip() {
  if (document.getElementById("player-tip")) return;
  const tip = document.createElement("div");
  tip.id = "player-tip";
  tip.className = "player-tip hidden";
  tip.setAttribute("role", "dialog");
  document.body.appendChild(tip);

  document.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-user-tip]");
    if (chip) {
      e.preventDefault();
      e.stopPropagation();
      openTip(chip.dataset.userTip, chip);
      return;
    }
    if (!e.target.closest("#player-tip")) closeTip();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeTip();
  });
  tip.addEventListener("click", (e) => {
    const go = e.target.closest("[data-open-profile]");
    if (go) {
      e.preventDefault();
      closeTip();
      hooks.openProfile(go.dataset.openProfile);
      return;
    }
    const dm = e.target.closest("[data-open-dm]");
    if (dm) {
      e.preventDefault();
      closeTip();
      hooks.openDm(dm.dataset.openDm);
      return;
    }
    const add = e.target.closest("[data-tip-add]");
    if (add) {
      e.preventDefault();
      addFriend(add.dataset.tipAdd);
    }
  });
}

async function openTip(handle, anchor) {
  const tip = document.getElementById("player-tip");
  if (!tip) return;
  tipUser = handle;
  tip.classList.remove("hidden");
  tip.innerHTML = `<p class="lounge-empty">Loading @${esc(handle)}…</p>`;
  placeTip(tip, anchor);
  try {
    const data = await api(`/api/u/${encodeURIComponent(handle)}`);
    if (tipUser !== handle) return;
    const user = data.user;
    const stats = data.stats || {};
    const bits = [
      stats.packs != null ? `${stats.packs} packs` : null,
      stats.unique != null ? `${stats.unique} unique` : null,
      data.friends ? `${data.friends} friends` : null,
    ].filter(Boolean);
    const signed = hooks.getUser();
    const mine = data.relation === "self";
    const action =
      !signed
        ? `<button type="button" class="ghost" data-open-auth="signin">Sign in to add</button>`
        : mine
          ? ``
          : data.relation === "friends"
            ? `<button type="button" class="solid" data-open-dm="${esc(user.handle)}">Message</button>`
            : data.relation === "pending-out"
              ? `<span class="tip-status">Request sent</span>`
              : data.relation === "pending-in"
                ? `<button type="button" class="solid" data-friend-accept="${esc(user.handle)}">Accept</button>`
                : `<button type="button" class="solid" data-tip-add="${esc(user.handle)}">Add friend</button>`;
    tip.innerHTML = `
      ${bannerBlockHtml(user.banner, { className: "tip-banner" })}
      <div class="tip-id">
        ${faceHtml({ ...user, online: data.online }, "md")}
        <div>
          <p class="account-title">${esc(user.title || "Rookie")}</p>
          <b>${levelTag(user)}${esc(user.name)}</b>
          <small>@${esc(user.handle)}${data.online ? `, <i class="live-dot" aria-hidden="true"></i>online` : ""}</small>
        </div>
      </div>
      ${user.bio ? `<p class="tip-bio">${esc(user.bio)}</p>` : ""}
      <p class="tip-stats">${esc(bits.join(", ") || "A trainer on poke-pack.rip")}</p>
      <div class="tip-actions">
        <button type="button" class="solid" data-open-profile="${esc(user.handle)}">Open profile</button>
        ${action}
      </div>`;
    placeTip(tip, anchor);
    tip.querySelector("[data-friend-accept]")?.addEventListener("click", async (ev) => {
      ev.preventDefault();
      try {
        await api("/api/friends/respond", {
          method: "POST",
          body: JSON.stringify({ handle: user.handle, accept: true }),
        });
        hooks.toast(`You and @${user.handle} are friends.`);
        closeTip();
        await refreshFriends();
      } catch (err) {
        hooks.toast(err.message || "Couldn't accept.");
      }
    });
  } catch (err) {
    tip.innerHTML = `<p class="lounge-empty">${esc(err.message || "Couldn't load that trainer.")}</p>`;
  }
}

function placeTip(tip, anchor) {
  const box = anchor.getBoundingClientRect();
  const pad = 12;
  const w = Math.min(320, window.innerWidth - pad * 2);
  tip.style.width = `${w}px`;
  let left = box.left;
  if (left + w > window.innerWidth - pad) left = window.innerWidth - w - pad;
  if (left < pad) left = pad;
  let top = box.bottom + 10;
  requestAnimationFrame(() => {
    const h = tip.offsetHeight || 220;
    if (top + h > window.innerHeight - pad) top = Math.max(pad, box.top - h - 10);
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  });
}

function closeTip() {
  tipUser = null;
  document.getElementById("player-tip")?.classList.add("hidden");
}

async function addFriend(handle) {
  if (!hooks.getUser()) {
    hooks.openAuth("signin");
    return;
  }
  try {
    const data = await api("/api/friends/request", {
      method: "POST",
      body: JSON.stringify({ handle }),
    });
    hooks.toast(data.status === "accepted" ? `You and @${handle} are friends.` : `Request sent to @${handle}.`);
    closeTip();
    await refreshFriends();
  } catch (err) {
    hooks.toast(err.message || "Couldn't add them.");
  }
}

export async function sendChat(body) {
  await api("/api/chat", { method: "POST", body: JSON.stringify({ body }) });
  await refreshLounge();
}

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}
