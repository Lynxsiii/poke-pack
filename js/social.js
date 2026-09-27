/**
 * Friends dock, home lounge (online + global chat), and trainer tooltips.
 * Presence is a heartbeat against D1 — no sockets yet.
 */
import { api } from "./api.js";
import { avatarColor } from "./accounts.js";
import { avatarSrc, avatarStyle, bannerVars } from "./cosmetics.js";

let hooks = {
  getUser: () => null,
  toast: () => {},
  openProfile: () => {},
  openAuth: () => {},
  openDm: () => {},
  onTick: () => {},
};

let friendsState = { friends: [], incoming: [], outgoing: [], onlineNow: 0 };
let loungeState = { online: [], chat: [], me: null };
let pollTimer = 0;
let tipUser = null;

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

export function faceHtml(user, size = "md") {
  const color = avatarColor(user?.color).hex;
  const src = avatarSrc(user?.avatar, user?.avatarStyle);
  const pixel = avatarStyle(user?.avatarStyle) === "pixel" ? " pixel" : "";
  const cls = `user-face ${size}${user?.online ? " on" : ""}${pixel}`;
  return `<span class="${cls}" style="--avatar:${esc(color)}"><img src="${esc(src)}" alt="" /></span>`;
}

export function currentFriends() {
  return friendsState;
}

export function currentLounge() {
  return loungeState;
}

async function tickSocial(force = false) {
  if (!force && document.visibilityState !== "visible") return;
  const signed = Boolean(hooks.getUser());
  const home = document.body.classList.contains("on-home");
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
    <button type="button" class="friends-peek" id="friends-peek" aria-expanded="false" aria-controls="friends-panel">
      <span class="friends-peek-faces" id="friends-peek-faces"></span>
      <span class="friends-peek-count" id="friends-peek-count" hidden>0</span>
    </button>
    <div class="friends-panel" id="friends-panel" role="region" aria-label="Friends">
      <div class="friends-now">
        <div>
          <p class="friends-kicker">Friends</p>
          <b id="friends-title">Friends</b>
          <small id="friends-sub">Sign in to add trainers</small>
        </div>
        <button type="button" class="friends-hide" id="friends-hide" aria-label="Hide friends">–</button>
      </div>
      <form class="friends-add" id="friends-add">
        <input name="handle" maxlength="16" placeholder="@handle" autocapitalize="off" spellcheck="false" aria-label="Add by handle" />
        <button class="solid" type="submit">Add</button>
      </form>
      <div class="friends-tabs">
        <button type="button" class="on" data-friends-tab="list">List</button>
        <button type="button" data-friends-tab="inbox">Inbox</button>
      </div>
      <div class="friends-list" id="friends-list"></div>
    </div>
  `;
  document.body.appendChild(root);

  const peek = root.querySelector("#friends-peek");
  const hide = root.querySelector("#friends-hide");
  const toggle = (open) => {
    root.classList.toggle("is-open", open);
    peek.setAttribute("aria-expanded", String(open));
    if (open) refreshFriends().catch(() => {});
  };
  peek.addEventListener("click", () => toggle(!root.classList.contains("is-open")));
  hide.addEventListener("click", () => toggle(false));

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
    friendsState = { friends: [], incoming: [], outgoing: [], onlineNow: 0 };
    paintFriends(root.querySelector("[data-friends-tab].on")?.dataset.friendsTab || "list");
    return;
  }
  const data = await api("/api/friends");
  friendsState = {
    friends: data.friends || [],
    incoming: data.incoming || [],
    outgoing: data.outgoing || [],
    onlineNow: data.onlineNow || 0,
  };
    paintFriends(root.querySelector("[data-friends-tab].on")?.dataset.friendsTab || "list");
}

function paintFriends(tab) {
  const root = document.getElementById("friends");
  if (!root) return;
  const signed = hooks.getUser();
  const online = friendsState.friends.filter((row) => row.online);
  const peekFaces = root.querySelector("#friends-peek-faces");
  const peekCount = root.querySelector("#friends-peek-count");
  const faces = (online.length ? online : friendsState.friends).slice(0, 3);
  peekFaces.innerHTML = faces.length
    ? faces.map((row) => faceHtml(row, "xs")).join("")
    : `<span class="user-face xs empty">+</span>`;
  const badge = friendsState.incoming.length;
  peekCount.hidden = badge < 1;
  peekCount.textContent = String(badge);

  root.querySelector("#friends-title").textContent = "Friends";
  root.querySelector("#friends-sub").textContent = signed
    ? `${friendsState.friends.length} friends · ${online.length} online`
    : "Sign in to add trainers";

  const inboxBtn = root.querySelector("[data-friends-tab='inbox']");
  if (inboxBtn) inboxBtn.textContent = badge ? `Inbox (${badge})` : "Inbox";

  const list = root.querySelector("#friends-list");
  if (!signed) {
    list.innerHTML = `<p class="friends-empty">Sign in to keep a friends list, send DMs, and comment on profiles.</p>
      <button type="button" class="solid" data-friends-signin>Sign in</button>`;
    list.querySelector("[data-friends-signin]")?.addEventListener("click", () => hooks.openAuth("signin"));
    return;
  }

  if (tab === "inbox") {
    const incoming = friendsState.incoming
      .map(
        (row) => `<div class="friends-row">
          <a href="/u/${esc(row.handle)}">${faceHtml(row, "sm")}<span><b>${esc(row.name)}</b><small>@${esc(row.handle)}</small></span></a>
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
          <a href="/u/${esc(row.handle)}">${faceHtml(row, "sm")}<span><b>${esc(row.name)}</b><small>pending</small></span></a>
        </div>`
      )
      .join("");
    list.innerHTML =
      incoming || outgoing
        ? `${incoming}${outgoing ? `<p class="friends-label">Sent</p>${outgoing}` : ""}`
        : `<p class="friends-empty">No requests. Add someone by handle.</p>`;
    return;
  }

  if (!friendsState.friends.length) {
    list.innerHTML = `<p class="friends-empty">No friends yet. Drop a handle above.</p>`;
    return;
  }
  list.innerHTML = friendsState.friends
    .map(
      (row) => `<div class="friends-row">
        <a href="/u/${esc(row.handle)}">${faceHtml({ ...row, online: row.online }, "sm")}<span><b>${esc(row.name)}</b><small>${row.online ? "online" : `@${esc(row.handle)}`}</small></span></a>
        <button type="button" class="ghost tiny" data-open-dm="${esc(row.handle)}" aria-label="Message @${esc(row.handle)}">DM</button>
        <button type="button" class="ghost tiny" data-friend-remove="${esc(row.handle)}" aria-label="Remove @${esc(row.handle)}">×</button>
      </div>`
    )
    .join("");
}

export async function refreshLounge() {
  const onlineEl = document.getElementById("home-online-list");
  const chatEl = document.getElementById("home-chat-log");
  if (!onlineEl && !chatEl) return;
  const data = await api("/api/lounge");
  loungeState = { online: data.online || [], chat: data.chat || [], me: data.me || null };
  paintLounge();
}

function paintLounge() {
  const onlineEl = document.getElementById("home-online-list");
  const countEl = document.getElementById("home-online-count");
  const chatEl = document.getElementById("home-chat-log");
  if (countEl) countEl.textContent = String(loungeState.online.length);
  if (onlineEl) {
    onlineEl.innerHTML = loungeState.online.length
      ? loungeState.online
          .map(
            (row) => `<button type="button" class="online-chip" data-user-tip="${esc(row.handle)}">
              ${faceHtml({ ...row, online: true }, "sm")}
              <span>${esc(row.name)}</span>
            </button>`
          )
          .join("")
      : `<p class="lounge-empty">Nobody on the floor right now. Sign in and you show up here.</p>`;
  }
  if (chatEl) {
    const pin = chatEl.scrollHeight - chatEl.scrollTop < chatEl.clientHeight + 48;
    chatEl.innerHTML = loungeState.chat.length
      ? loungeState.chat
          .map(
            (msg) => `<div class="chat-line">
              <button type="button" class="chat-who" data-user-tip="${esc(msg.user.handle)}">${faceHtml(msg.user, "xs")}</button>
              <div>
                <b data-user-tip="${esc(msg.user.handle)}">${esc(msg.user.name)}</b>
                <span>${esc(msg.body)}</span>
              </div>
            </div>`
          )
          .join("")
      : `<p class="lounge-empty">Say hi. This is the whole site in one thread.</p>`;
    if (pin) chatEl.scrollTop = chatEl.scrollHeight;
  }
  const form = document.getElementById("home-chat-form");
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
    const banner = bannerVars(user.banner);
    tip.innerHTML = `
      <div class="tip-banner banner-wash" data-motion="${esc(banner.motion)}" style="${esc(banner.style)}"></div>
      <div class="tip-id">
        ${faceHtml({ ...user, online: data.online }, "md")}
        <div>
          <p class="account-title">${esc(user.title || "Rookie")}</p>
          <b>${esc(user.name)}</b>
          <small>@${esc(user.handle)}${data.online ? " · online" : ""}</small>
        </div>
      </div>
      ${user.bio ? `<p class="tip-bio">${esc(user.bio)}</p>` : ""}
      <p class="tip-stats">${esc(bits.join(" · ") || "A trainer on poke-pack.rip")}</p>
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
