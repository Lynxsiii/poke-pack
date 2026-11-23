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
import { createCoinflip } from "./coinflip.js?v=10";
import { createJackpot } from "./jackpot.js?v=7";
import { createUpgrader } from "./upgrader.js?v=5";
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
    ).join("")}</div>
    <p class="cs-free">Free play with virtual coins. Nothing here costs real money, can be cashed out or wins a prize. <a href="/terms" data-casino-terms>Terms</a></p>`;
  }
  bar?.addEventListener("click", (e) => {
    if (e.target.closest("[data-casino-terms]")) return; // the app's own link handler opens /terms
    const a = e.target.closest("[data-casino-link]");
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
    e.preventDefault();
    navigate(a.getAttribute("href"));
  });

  // ---- The hub ------------------------------------------------------------
  // What is live first: the open tables and the latest wins. The four games sit
  // beside them as plain rows, each with its own object, for a first visit.
  const game = ({ href, key, title, line, n, word, art }) => `<li data-game="${key}">
      <a class="hub-game" href="${href}" data-hub-link>
        <span class="hub-game-art" aria-hidden="true">${art}</span>
        <span class="hub-game-copy"><b>${esc(title)}</b><span>${esc(line)}</span></span>
        <span class="hub-game-fig">${n == null ? "" : `<b>${Number(n).toLocaleString("en-US")}</b>${esc(word)}`}</span>
      </a>
    </li>`;

  const leftWords = (ms) => {
    const left = timeLeft(ms);
    return left ? `, ${left} left` : "";
  };

  const openRow = (t) => {
    const user = deps.user?.();
    if (t.kind === "coinflip") {
      const f = t.row;
      const mine = Boolean(user && f.host?.userId === user.id);
      const href = `/casino/coinflip/${esc(f.id)}`;
      return `<article class="cs-row hub-row">
        <a class="cs-row-main" href="${href}" data-hub-link>
          ${seatAvatar(f.host)}
          <span class="cs-row-line"><b>${esc(playerName(f.host))}</b><small>Coinflip, ${countLine(f.hostStake, f.hostSlabs)}${leftWords(f.expiresAt - clock.now())}</small></span>
          ${stakeStack(f.hostStake, 3, "", f.hostSlabs)}
        </a>
        <span class="cs-row-end">${coinTag(f.hostValue)}<a class="cs-act" href="${href}" data-hub-link>${mine ? "Open" : "Match"}</a></span>
      </article>`;
    }
    const p = t.row;
    const host = p.entries[0]?.player;
    const inside = Boolean(user && p.entries.some((e) => e.player.userId === user.id));
    const href = `/casino/jackpot/${esc(p.id)}`;
    return `<article class="cs-row hub-row">
        <a class="cs-row-main" href="${href}" data-hub-link>
          <span class="hub-seats" role="img" aria-label="${plural(p.entries.length, "seat")} taken of ${p.maxPlayers}">${p.entries.slice(0, 3).map((e) => seatAvatar(e.player)).join("")}</span>
          <span class="cs-row-line"><b>${esc(playerName(host))}'s pot</b><small>Jackpot, ${p.entries.length} of ${p.maxPlayers} seats${leftWords(p.expiresAt - clock.now())}</small></span>
        </a>
        <span class="cs-row-end">${coinTag(p.pot)}<a class="cs-act" href="${href}" data-hub-link>${inside ? "Open" : "Join"}</a></span>
      </article>`;
  };

  const winRow = (f) => {
    if (f.kind === "upgrader") {
      const img = f.target.small || f.target.image;
      return `<a class="cs-row cs-row-link hub-win" href="/casino/upgrader/${esc(f.id)}" data-hub-link>
        <span class="cs-row-main">${seatAvatar(f.player)}<span class="cs-row-line"><span><b>${esc(playerName(f.player))}</b> won ${esc(f.target.grade ? `RIP ${f.target.grade}${f.target.blackLabel ? " Black Label" : ""} ` : "")}${esc(f.target.name)}</span><small>Upgrader, ${esc(chanceText(f.chance))} chance</small></span>
        ${img ? `<span class="cs-stack"><img src="${esc(img)}" alt="" loading="lazy" decoding="async" /></span>` : ""}</span>
        <span class="cs-row-end">${coinTag(f.targetValue ?? f.target.value ?? f.stakeValue)}</span></a>`;
    }
    if (f.kind === "jackpot") {
      const w = f.entries.find((e) => e.won)?.player;
      const lost = f.entries.filter((e) => !e.won);
      const n = f.entries.reduce((m, e) => m + (e.slabs?.length || 0), 0);
      return `<a class="cs-row cs-row-link hub-win" href="/casino/jackpot/${esc(f.id)}" data-hub-link>
        <span class="cs-row-main">${seatAvatar(w)}<span class="cs-row-line"><span><b>${esc(playerName(w))}</b> took the pot</span><small>Jackpot, ${plural(f.entries.length, "player")}${n ? `, ${plural(n, "slab")}` : ""}</small></span>
        ${stakeStack(lost.flatMap((e) => e.stake), 3, "", lost.flatMap((e) => e.slabs || []))}</span>
        <span class="cs-row-end">${coinTag(f.pot)}</span></a>`;
    }
    const w = f.winner === "host" ? f.host : f.guest;
    const l = f.winner === "host" ? f.guest : f.host;
    const slabs = [...(f.hostSlabs || []), ...(f.guestSlabs || [])];
    return `<a class="cs-row cs-row-link hub-win" href="/casino/coinflip/${esc(f.id)}" data-hub-link>
        <span class="cs-row-main">${seatAvatar(w)}<span class="cs-row-line"><span><b>${esc(playerName(w))}</b> beat ${esc(playerName(l))}</span><small>Coinflip${slabs.length ? `, ${plural(slabs.length, "slab")}` : ""}</small></span>
        ${stakeStack([...(f.hostStake || []), ...(f.guestStake || [])], 3, "", slabs)}</span>
        <span class="cs-row-end">${coinTag(f.hostValue + f.guestValue)}</span></a>`;
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
    const featured = deps.featuredSetId?.() || "";
    const record = [
      ["Coinflip", hubData?.record],
      ["Jackpot", jackData?.record],
      ["Upgrader", upgradeData?.record],
    ].filter(([, rec]) => rec?.played);
    // Under 18 the hub says so first and drops the call to play (js/gate-notice.js; the Worker refuses anyway).
    const ageLock = gateLock("coinflip", deps.user?.());
    const ageShut = Boolean(ageLock?.age);
    pages.hub.innerHTML = `<div class="cs-page cs-hub">
      <header class="cs-head hub-head">
        <h1 class="page-title">Casino</h1>
        ${ageShut ? "" : `<a class="solid hub-primary" href="/casino/coinflip" data-hub-link>Flip a coin</a>`}
      </header>
      ${ageShut ? gateNoticeHTML(ageLock) : ""}
      <div class="cs-cols">
        <div class="cs-col-play">
          <ul class="rows hub-games" aria-label="The games">
            ${game({ href: "/casino/coinflip", key: "coinflip", title: "Coinflip", line: "Your pile against theirs, one toss.", n: hubData ? (hubData.open || []).length : null, word: "open", art: coinArtHTML({ size: 60 }) })}
            ${game({ href: "/casino/jackpot", key: "jackpot", title: "Jackpot", line: "One pot, one draw, weighted by value.", n: jackData ? (jackData.open || []).length : null, word: "open", art: potArtHTML({ size: 60 }) })}
            ${game({ href: "/casino/upgrader", key: "upgrader", title: "Upgrader", line: "Aim higher, the odds drop.", art: upgraderArtHTML({ size: 60 }) })}
            ${game({ href: "/battles", key: "battles", title: "Pack battles", line: "Same packs, best pulls take the pot.", art: battlesArtHTML({ setId: featured, size: 60 }) })}
          </ul>
          ${record.length ? `<section class="plate hub-record" aria-labelledby="hub-rec"><div class="plate-head"><h2 id="hub-rec">Your record</h2></div>
            <dl class="cs-facts">${record.map(([name, rec]) => `<div><dt>${name}</dt><dd>${rec.won} won of ${rec.played}</dd></div>`).join("")}</dl></section>` : ""}
        </div>
        <div class="cs-col-live">
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
