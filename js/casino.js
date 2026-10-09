/* The casino: the router and the hub.

   /casino                 the hub: the tables and what is happening at them
   /casino/coinflip[/<id>] cards against cards, one toss (js/coinflip.js)
   /casino/jackpot[/<id>]  3 to 10 players, one pot, one draw (js/jackpot.js)
   /casino/upgrader[/<id>] cards or slabs against a target, one roll (js/upgrader.js)
   /battles...             pack battles keep their own routes and modules
                           (js/battles.js); the casino only links to them and
                           draws the sub-nav above them.

   Every game settles in the Worker (worker/casino.js, worker/battles.js). These
   modules present what it returns. */
import { api, esc, coins, coinTag, icon, plural, playerName, playerChip, emptyLine, seatAvatar, stakeStack, tagHTML, timeLeft, countLine, coinArtHTML, potArtHTML, battlesArtHTML, upgraderArtHTML } from "./casino-kit.js";
import { createStakePicker } from "./stake-picker.js?v=9";
import { createCoinflip } from "./coinflip.js?v=9";
import { createJackpot } from "./jackpot.js?v=6";
import { createUpgrader } from "./upgrader.js?v=4";
import { chanceText } from "./upgrader-rules.js?v=3";
import { gateLock, gateNoticeHTML } from "./gate-notice.js";

const HUB_POLL_MS = 8000;
const ROUTE = /^\/casino(?:\/(coinflip|jackpot|upgrader)(?:\/([a-zA-Z0-9-]{1,80}))?)?$/;

/** Where each game lives, in the order the sub-nav shows them. */
export const CASINO_LINKS = [
  { key: "hub", href: "/casino", label: "Casino" },
  { key: "coinflip", href: "/casino/coinflip", label: "Coinflip" },
  { key: "jackpot", href: "/casino/jackpot", label: "Jackpot" },
  { key: "upgrader", href: "/casino/upgrader", label: "Upgrader" },
  { key: "battles", href: "/battles", label: "Battles" },
];

export function initCasino(deps = {}) {
  const root = deps.root;
  const bar = deps.bar;
  if (!root) return { show() {}, hide() {}, paintBar() {}, path: "/casino" };
  root.classList.add("casino-view");

  // One server clock for every casino page: expiries are the server's.
  let offset = 0;
  const clock = {
    now: () => Date.now() + offset,
    sync(serverNow) {
      if (Number.isFinite(serverNow)) offset = serverNow - Date.now();
    },
  };
  const motion = () =>
    deps.settings?.()?.motion !== false &&
    !matchMedia("(prefers-reduced-motion: reduce)").matches &&
    !document.body.classList.contains("no-motion");
  const navigate = (path) => deps.navigate?.(path);
  // The stake picker's last lists, so a game can draw what the player just picked without asking the save again.
  const owned = { cards: [], slabs: [] };
  const picker = createStakePicker({
    ownedCards: async () => (owned.cards = await deps.ownedCards()),
    ownedSlabs: async () => (owned.slabs = (await deps.ownedSlabs?.()) ?? []),
  });
  const ctx = { ...deps, clock, motion, navigate, picker, owned: () => owned };

  const pages = {
    hub: document.createElement("div"),
    coinflip: document.createElement("div"),
    jackpot: document.createElement("div"),
    upgrader: document.createElement("div"),
  };
  for (const [key, el] of Object.entries(pages)) {
    el.className = `casino-page casino-page-${key} hidden`;
    root.append(el);
  }
  const coinflip = createCoinflip({ ...ctx, root: pages.coinflip });
  const jackpot = createJackpot({ ...ctx, root: pages.jackpot });
  const upgrader = createUpgrader({ ...ctx, root: pages.upgrader });
  const games = { coinflip, jackpot, upgrader };

  let visible = false;
  let current = "";
  let hubTimer = 0;
  let hubToken = 0;
  let hubData = null;
  let jackData = null;
  let upgradeData = null;

  // ---- The sub-nav --------------------------------------------------------
  function paintBar(active) {
    if (!bar) return;
    bar.hidden = !active;
    if (!active) return;
    bar.innerHTML = `<div class="cs-words" role="navigation" aria-label="Casino">${CASINO_LINKS.map(
      (l) => `<a class="cs-word${l.key === active ? " on" : ""}" href="${l.href}" data-casino-link${l.key === active ? ' aria-current="page"' : ""}>${esc(l.label)}</a>`
    ).join("")}</div>`;
  }
  bar?.addEventListener("click", (e) => {
    const a = e.target.closest("[data-casino-link]");
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
    e.preventDefault();
    navigate(a.getAttribute("href"));
  });

  // ---- The hub ------------------------------------------------------------
  // What is live first: the open tables and the latest wins. The four games sit
  // beside them as plain rows, each with its own object, for a first visit.
  const game = ({ href, key, title, line, status, art }) => `<li class="hub-game-row" data-game="${key}">
      <a class="hub-game-art" href="${href}" data-hub-link tabindex="-1" aria-hidden="true">${art}</a>
      <span class="hub-game-copy"><a href="${href}" data-hub-link><b>${esc(title)}</b></a><span>${esc(line)}</span><small>${status}</small></span>
    </li>`;

  const openRow = (t) => {
    const user = deps.user?.();
    if (t.kind === "coinflip") {
      const f = t.row;
      const mine = Boolean(user && f.host?.userId === user.id);
      const left = timeLeft(f.expiresAt - clock.now());
      return `<article class="cs-row hub-row">
        <a class="cs-row-main" href="/casino/coinflip/${esc(f.id)}" data-hub-link>
          <span class="hub-kind">Coinflip</span>
          ${playerChip(f.host)}
          <span class="hub-stake">${stakeStack(f.hostStake, 5, "is-lg", f.hostSlabs)}<span class="hub-figs">${tagHTML(f.hostValue)}<small>${countLine(f.hostStake, f.hostSlabs)}${left ? `, ${left} left` : ""}</small></span></span>
        </a>
        <a class="ghost sm hub-go" href="/casino/coinflip/${esc(f.id)}" data-hub-link>${mine ? "Open" : "Match"}</a>
      </article>`;
    }
    const p = t.row;
    const host = p.entries[0]?.player;
    const inside = Boolean(user && p.entries.some((e) => e.player.userId === user.id));
    const left = timeLeft(p.expiresAt - clock.now());
    const all = p.entries.flatMap((e) => e.stake);
    const slabs = p.entries.flatMap((e) => e.slabs || []);
    return `<article class="cs-row hub-row">
        <a class="cs-row-main" href="/casino/jackpot/${esc(p.id)}" data-hub-link>
          <span class="hub-kind">Jackpot</span>
          <span class="cs-player"><span class="hub-seats" role="img" aria-label="${plural(p.entries.length, "seat")} taken of ${p.maxPlayers}">${p.entries.slice(0, 4).map((e) => seatAvatar(e.player)).join("")}<b>${p.entries.length}/${p.maxPlayers}</b></span>
            <span class="cs-player-copy"><b>${esc(playerName(host))}'s pot</b><small>${plural(p.seatsOpen, "seat")} open</small></span></span>
          <span class="hub-stake">${stakeStack(all, 5, "is-lg", slabs)}<span class="hub-figs">${tagHTML(p.pot)}<small>${countLine(all, slabs)}${left ? `, ${left} left` : ""}</small></span></span>
        </a>
        <a class="ghost sm hub-go" href="/casino/jackpot/${esc(p.id)}" data-hub-link>${inside ? "Open" : "Join"}</a>
      </article>`;
  };

  const winRow = (f) => {
    if (f.kind === "upgrader") {
      const img = f.target.small || f.target.image;
      return `<a class="cs-row cs-row-link hub-win" href="/casino/upgrader/${esc(f.id)}" data-hub-link>
        <span class="cs-row-main">${seatAvatar(f.player)}<span class="cs-row-line"><span><b>${esc(playerName(f.player))}</b> turned ${coinTag(f.stakeValue)} into ${esc(f.target.grade ? `RIP ${f.target.grade}${f.target.blackLabel ? " Black Label" : ""} ` : "")}${esc(f.target.name)}</span><small>Upgrader, ${esc(chanceText(f.chance))} chance</small></span></span>
        ${img ? `<span class="cs-stack is-lg"><img src="${esc(img)}" alt="" loading="lazy" decoding="async" style="--i:2" /></span>` : ""}</a>`;
    }
    if (f.kind === "jackpot") {
      const w = f.entries.find((e) => e.won)?.player;
      const lost = f.entries.filter((e) => !e.won);
      const n = f.entries.reduce((m, e) => m + (e.slabs?.length || 0), 0);
      return `<a class="cs-row cs-row-link hub-win" href="/casino/jackpot/${esc(f.id)}" data-hub-link>
        <span class="cs-row-main">${seatAvatar(w)}<span class="cs-row-line"><span><b>${esc(playerName(w))}</b> took the pot of ${coinTag(f.pot)}</span><small>Jackpot, ${plural(f.entries.length, "player")}${n ? `, ${plural(n, "slab")}` : ""}</small></span></span>
        ${stakeStack(lost.flatMap((e) => e.stake), 4, "is-lg", lost.flatMap((e) => e.slabs || []))}</a>`;
    }
    const w = f.winner === "host" ? f.host : f.guest;
    const l = f.winner === "host" ? f.guest : f.host;
    const slabs = [...(f.hostSlabs || []), ...(f.guestSlabs || [])];
    return `<a class="cs-row cs-row-link hub-win" href="/casino/coinflip/${esc(f.id)}" data-hub-link>
        <span class="cs-row-main">${seatAvatar(w)}<span class="cs-row-line"><span><b>${esc(playerName(w))}</b> took ${coinTag(f.hostValue + f.guestValue)} from ${esc(playerName(l))}</span><small>Coinflip${slabs.length ? `, ${plural(slabs.length, "slab")}` : ""}</small></span></span>
        ${stakeStack([...(f.hostStake || []), ...(f.guestStake || [])], 4, "is-lg", slabs)}</a>`;
  };

  function paintHub() {
    const done = hubData?.done || [];
    const tables = [
      ...(hubData?.open || []).map((row) => ({ kind: "coinflip", row, at: row.createdAt || 0 })),
      ...(jackData?.open || []).map((row) => ({ kind: "jackpot", row, at: row.createdAt || 0 })),
    ].sort((a, b) => b.at - a.at).slice(0, 8);
    const feed = [
      ...done.map((f) => ({ ...f, kind: "coinflip", at: f.flippedAt || 0 })),
      ...(jackData?.done || []).map((j) => ({ ...j, kind: "jackpot", at: j.drawnAt || 0 })),
      // Only the wins make the hub's feed; every upgrade is on the Upgrader's own page.
      ...(upgradeData?.recent || []).filter((u) => u.won).map((u) => ({ ...u, kind: "upgrader", at: u.createdAt || 0 })),
    ].sort((a, b) => b.at - a.at).slice(0, 6);
    const rec = hubData?.record;
    const featured = deps.featuredSetId?.() || "";
    const played = [
      rec?.played ? `${rec.won} of ${rec.played} flips` : "",
      jackData?.record?.played ? `${jackData.record.won} of ${jackData.record.played} pots` : "",
      upgradeData?.record?.played ? `${upgradeData.record.won} of ${upgradeData.record.played} upgrades` : "",
    ].filter(Boolean);
    // Under 18 the hub says so first and drops the call to play (js/gate-notice.js; the Worker refuses anyway).
    const ageLock = gateLock("coinflip", deps.user?.());
    const ageShut = Boolean(ageLock?.age);
    pages.hub.innerHTML = `<div class="cs-page cs-hub">
      <header class="cs-head hub-head">
        <div><h1 class="page-title">Casino</h1>${played.length ? `<p class="cs-lede">You've won ${played.join(", ")}.</p>` : ""}</div>
        ${ageShut ? "" : `<a class="solid hub-primary" href="/casino/coinflip" data-hub-link>Flip a coin</a>`}
      </header>
      ${ageShut ? gateNoticeHTML(ageLock) : ""}
      <div class="hub-grid">
        <div class="hub-live">
          <section class="cs-section" aria-labelledby="cs-open">
            <h2 class="cs-h" id="cs-open">Open tables${tables.length ? ` <span>${tables.length}</span>` : ""}</h2>
            <div class="cs-rows">${
              tables.length ? tables.map(openRow).join("") : emptyLine(hubData ? "No open tables. Put up cards and wait for a match, or call a free bot." : "Loading the tables.")
            }</div>
          </section>
          <section class="cs-section" aria-labelledby="cs-live">
            <h2 class="cs-h" id="cs-live">Recent wins</h2>
            <div class="cs-rows">${feed.length ? feed.map(winRow).join("") : emptyLine(hubData ? "No wins to show. Start a coinflip or a pot." : "Loading the tables.")}</div>
          </section>
        </div>
        <aside class="hub-rail" aria-label="The games">
          <ul class="hub-games">
            ${game({ href: "/casino/coinflip", key: "coinflip", title: "Coinflip", line: "A player matches your pile and one toss takes both.", status: hubData ? plural((hubData.open || []).length, "open flip") : "&nbsp;", art: coinArtHTML({ size: 76 }) })}
            ${game({ href: "/casino/jackpot", key: "jackpot", title: "Jackpot", line: "Everyone throws into one pot and the draw is weighted by value.", status: jackData ? plural((jackData.open || []).length, "open pot") : "&nbsp;", art: potArtHTML({ size: 76 }) })}
            ${game({ href: "/casino/upgrader", key: "upgrader", title: "Upgrader", line: "The bigger the card you aim for, the lower the odds.", status: upgradeData?.record?.played ? `You've won ${upgradeData.record.won} of ${upgradeData.record.played}` : "&nbsp;", art: upgraderArtHTML({ size: 76 }) })}
            ${game({ href: "/battles", key: "battles", title: "Pack battles", line: "Rip the same packs side by side and the best pulls take the pot.", status: "Free bots, quick battles", art: battlesArtHTML({ setId: featured, size: 76 }) })}
          </ul>
        </aside>
      </div>
    </div>`;
  }

  async function loadHub() {
    const at = ++hubToken;
    try {
      const [data, jack, up] = await Promise.all([api("/api/casino/coinflips"), api("/api/casino/jackpots").catch(() => null), api("/api/casino/upgrades").catch(() => null)]);
      if (at !== hubToken || !visible || current !== "hub") return;
      clock.sync(data.serverNow);
      hubData = data;
      jackData = jack;
      upgradeData = up;
      paintHub();
    } catch {
      /* the tiles still work without the live line */
    }
    if (visible && current === "hub") hubTimer = setTimeout(loadHub, HUB_POLL_MS);
  }

  pages.hub.addEventListener("click", (e) => {
    const a = e.target.closest("[data-hub-link]");
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
    e.preventDefault();
    navigate(a.getAttribute("href"));
  });

  // ---- Routing ------------------------------------------------------------
  function show(path = "/casino") {
    const clean = path.replace(/\/$/, "") || "/casino";
    const m = clean.match(ROUTE);
    const game = m?.[1] || "hub";
    const id = m?.[2] || "";
    visible = true;
    if (current !== game) {
      games[current]?.hide();
      clearTimeout(hubTimer);
      hubToken++;
    }
    current = game;
    for (const [key, el] of Object.entries(pages)) el.classList.toggle("hidden", key !== game);
    paintBar(game);
    if (games[game]) games[game].show(id);
    else {
      paintHub();
      clearTimeout(hubTimer);
      loadHub();
    }
  }

  function hide() {
    visible = false;
    current = "";
    clearTimeout(hubTimer);
    hubToken++;
    coinflip.hide();
    jackpot.hide();
    upgrader.hide();
    picker.close();
  }

  return { show, hide, paintBar, path: "/casino" };
}
