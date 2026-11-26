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
import { api, esc, coins, coinTag, icon, plural, playerName, playerChip, emptyLine, emptyBox, loadingRows, seatAvatar, stakeStack, tagHTML, timeLeft, countLine, coinArtHTML, potArtHTML, battlesArtHTML, upgraderArtHTML } from "./casino-kit.js";
import { createStakePicker } from "./stake-picker.js?v=11";
import { createCoinflip } from "./coinflip.js?v=13";
import { createJackpot } from "./jackpot.js?v=9";
import { createUpgrader } from "./upgrader.js?v=10";
import { chanceText } from "./upgrader-rules.js?v=3";
import { gateLock, gateNoticeHTML } from "./gate-notice.js";
import { createBetaPages, BETA_KEYS, BETA_ART } from "./beta.js?v=8";

const HUB_POLL_MS = 8000;
const ROUTE = /^\/casino(?:\/(coinflip|jackpot|upgrader|beta|grass|rocket|tins)(?:\/([a-zA-Z0-9-]{1,80}))?)?$/;

/** Where each game lives, in the order the sub-nav shows them. */
export const CASINO_LINKS = [
  { key: "hub", href: "/casino", label: "Casino" },
  { key: "coinflip", href: "/casino/coinflip", label: "Coinflip" },
  { key: "jackpot", href: "/casino/jackpot", label: "Jackpot" },
  { key: "upgrader", href: "/casino/upgrader", label: "Upgrader" },
  { key: "battles", href: "/battles", label: "Battles" },
  { key: "beta", href: "/casino/beta", label: "Beta" },
];
/** The beta games light up the Beta word in the sub-nav. */
const BAR_KEY = { grass: "beta", rocket: "beta", tins: "beta" };

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
    ...Object.fromEntries(BETA_KEYS.map((k) => [k, document.createElement("div")])),
  };
  for (const [key, el] of Object.entries(pages)) {
    el.className = `casino-page casino-page-${key} hidden`;
    root.append(el);
  }
  const coinflip = createCoinflip({ ...ctx, root: pages.coinflip });
  const jackpot = createJackpot({ ...ctx, root: pages.jackpot });
  const upgrader = createUpgrader({ ...ctx, root: pages.upgrader });
  const games = { coinflip, jackpot, upgrader, ...createBetaPages(ctx, pages) };

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
      (l) => `<a class="cs-word rt-word${l.key === active ? " on" : ""}" href="${l.href}" data-casino-link${l.key === active ? ' aria-current="page"' : ""}>${esc(l.label)}</a>`
    ).join("")}</div>
    <p class="cs-free">Free play with virtual coins. Nothing here costs real money, can be cashed out or wins a prize. <a href="/terms" data-casino-terms>Terms</a></p>`;
    // A phone scrolls the words sideways: keep the chosen one in view, and fade whichever edge has more.
    const words = bar.querySelector(".cs-words");
    const on = words?.querySelector(".on");
    if (words && on && words.scrollWidth > words.clientWidth) words.scrollLeft = Math.max(0, on.offsetLeft - (words.clientWidth - on.offsetWidth) / 2);
    fadeBar();
  }
  function fadeBar() {
    const words = bar?.querySelector(".cs-words");
    if (!words) return;
    const more = words.scrollWidth - words.clientWidth;
    words.classList.toggle("fade-l", more > 4 && words.scrollLeft > 4);
    words.classList.toggle("fade-r", more > 4 && words.scrollLeft < more - 4);
  }
  bar?.addEventListener("scroll", fadeBar, { capture: true, passive: true });
  window.addEventListener("resize", () => { if (bar && !bar.hidden) fadeBar(); }, { passive: true });
  bar?.addEventListener("click", (e) => {
    if (e.target.closest("[data-casino-terms]")) return; // the app's own link handler opens /terms
    const a = e.target.closest("[data-casino-link]");
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
    e.preventDefault();
    navigate(a.getAttribute("href"));
  });

  // ---- The hub ------------------------------------------------------------
  // The mode select: four games as big tiles, each with its object drawn large.
  // Under them, what is live: the open tables and the latest wins as rows.
  // `fresh` is on for the first paint after the hub opens (the tiles deal in);
  // rows that were not on the last paint slide in, so a poll only moves what is new.
  let hubFresh = false;
  let hubSeen = null; // row keys on the last paint with data; null until the first one
  let hubFigs = {};
  const game = ({ href, key, title, line, n, word, art }) => {
    const fig = n == null ? "" : `${Number(n).toLocaleString("en-US")} ${word}`;
    const bump = n != null && hubFigs[key] != null && hubFigs[key] !== n;
    if (n != null) hubFigs[key] = n;
    return `<li class="hub-tile" data-game="${key}">
      <a class="hub-game" href="${href}" data-hub-link>
        <span class="hub-game-art" aria-hidden="true"><span class="hub-game-obj">${art}</span></span>
        <span class="hub-game-copy"><b>${esc(title)}</b><span>${esc(line)}</span></span>
        ${fig ? `<span class="hub-game-fig${bump ? " is-bump" : ""}">${esc(fig)}</span>` : ""}
        <i class="hub-game-go" aria-hidden="true"></i>
      </a>
    </li>`;
  };

  const leftWords = (ms) => {
    const left = timeLeft(ms);
    return left ? `, ${left} left` : "";
  };

  /** Row attributes: its key, and whether it slides in (new since the last paint, staggered on the first). */
  let rowIndex = 0;
  const rowAttrs = (key) => {
    const isNew = !hubSeen || !hubSeen.has(key);
    const i = rowIndex++;
    return ` data-k="${esc(key)}"${isNew ? ` class-new style="--i:${Math.min(i, 8)}"` : ""}`;
  };
  const rowClass = (html) => html.replace(/ class="([^"]*)"([^>]*) class-new/, ' class="$1 is-new"$2');

  const openRow = (t) => {
    const user = deps.user?.();
    if (t.kind === "coinflip") {
      const f = t.row;
      const mine = Boolean(user && f.host?.userId === user.id);
      const href = `/casino/coinflip/${esc(f.id)}`;
      return rowClass(`<article class="rt-row cs-row hub-row"${rowAttrs(`f${f.id}`)}>
        <a class="rt-row-lab cs-row-lab" href="${href}" data-hub-link tabindex="-1" aria-hidden="true">${seatAvatar(f.host)}</a>
        <a class="cs-row-main" href="${href}" data-hub-link>
          <span class="cs-row-line"><b>${esc(playerName(f.host))}</b><small>Coinflip, ${countLine(f.hostStake, f.hostSlabs)}${leftWords(f.expiresAt - clock.now())}</small></span>
          ${stakeStack(f.hostStake, 3, "cs-row-stack", f.hostSlabs)}
        </a>
        <span class="cs-row-end"><span class="cs-row-fig">${coinTag(f.hostValue)}</span><a class="ghost sm cs-act" href="${href}" data-hub-link>${mine ? "Open" : "Match"}</a></span>
      </article>`);
    }
    const p = t.row;
    const host = p.entries[0]?.player;
    const inside = Boolean(user && p.entries.some((e) => e.player.userId === user.id));
    const href = `/casino/jackpot/${esc(p.id)}`;
    return rowClass(`<article class="rt-row cs-row hub-row"${rowAttrs(`j${p.id}`)}>
        <a class="rt-row-lab cs-row-lab" href="${href}" data-hub-link tabindex="-1" aria-hidden="true">${seatAvatar(host)}</a>
        <a class="cs-row-main" href="${href}" data-hub-link>
          <span class="cs-row-line"><b>${esc(playerName(host))}'s pot</b><small>Jackpot, ${p.entries.length} of ${p.maxPlayers} seats${leftWords(p.expiresAt - clock.now())}</small></span>
          <span class="hub-seats cs-row-stack" role="img" aria-label="${plural(p.entries.length, "seat")} taken of ${p.maxPlayers}">${p.entries.slice(0, 3).map((e) => seatAvatar(e.player)).join("")}</span>
        </a>
        <span class="cs-row-end"><span class="cs-row-fig">${coinTag(p.pot)}</span><a class="ghost sm cs-act" href="${href}" data-hub-link>${inside ? "Open" : "Join"}</a></span>
      </article>`);
  };

  const winRow = (f) => {
    if (f.kind === "upgrader") {
      const img = f.target.small || f.target.image;
      return rowClass(`<a class="rt-row cs-row cs-row-link hub-win" href="/casino/upgrader/${esc(f.id)}" data-hub-link${rowAttrs(`u${f.id}`)}>
        <span class="rt-row-lab cs-row-lab">${seatAvatar(f.player)}</span>
        <span class="cs-row-main"><span class="cs-row-line"><span><b>${esc(playerName(f.player))}</b> won ${esc(f.target.grade ? `RIP ${f.target.grade}${f.target.blackLabel ? " Black Label" : ""} ` : "")}${esc(f.target.name)}</span><small>Upgrader, ${esc(chanceText(f.chance))} chance</small></span>
        ${img ? `<span class="cs-stack cs-row-stack"><img src="${esc(img)}" alt="" loading="lazy" decoding="async" /></span>` : ""}</span>
        <span class="cs-row-end"><span class="cs-row-fig">${coinTag(f.targetValue ?? f.target.value ?? f.stakeValue)}</span></span></a>`);
    }
    if (f.kind === "jackpot") {
      const w = f.entries.find((e) => e.won)?.player;
      const lost = f.entries.filter((e) => !e.won);
      const n = f.entries.reduce((m, e) => m + (e.slabs?.length || 0), 0);
      return rowClass(`<a class="rt-row cs-row cs-row-link hub-win" href="/casino/jackpot/${esc(f.id)}" data-hub-link${rowAttrs(`J${f.id}`)}>
        <span class="rt-row-lab cs-row-lab">${seatAvatar(w)}</span>
        <span class="cs-row-main"><span class="cs-row-line"><span><b>${esc(playerName(w))}</b> took the pot</span><small>Jackpot, ${plural(f.entries.length, "player")}${n ? `, ${plural(n, "slab")}` : ""}</small></span>
        ${stakeStack(lost.flatMap((e) => e.stake), 3, "cs-row-stack", lost.flatMap((e) => e.slabs || []))}</span>
        <span class="cs-row-end"><span class="cs-row-fig">${coinTag(f.pot)}</span></span></a>`);
    }
    const w = f.winner === "host" ? f.host : f.guest;
    const l = f.winner === "host" ? f.guest : f.host;
    const slabs = [...(f.hostSlabs || []), ...(f.guestSlabs || [])];
    return rowClass(`<a class="rt-row cs-row cs-row-link hub-win" href="/casino/coinflip/${esc(f.id)}" data-hub-link${rowAttrs(`F${f.id}`)}>
        <span class="rt-row-lab cs-row-lab">${seatAvatar(w)}</span>
        <span class="cs-row-main"><span class="cs-row-line"><span><b>${esc(playerName(w))}</b> beat ${esc(playerName(l))}</span><small>Coinflip${slabs.length ? `, ${plural(slabs.length, "slab")}` : ""}</small></span>
        ${stakeStack([...(f.hostStake || []), ...(f.guestStake || [])], 3, "cs-row-stack", slabs)}</span>
        <span class="cs-row-end"><span class="cs-row-fig">${coinTag(f.hostValue + f.guestValue)}</span></span></a>`);
  };

  /** The record as HP bars: wins out of games played. */
  const recordRow = ([name, rec]) => `<div class="hub-rec-row"><dt>${name}</dt>
      <dd><span class="rt-hp"><em>${Math.round((rec.won / rec.played) * 100)}%</em><span class="rt-track"><i style="width:${Math.max(0, Math.min(100, (rec.won / rec.played) * 100))}%"></i></span></span><small>${Number(rec.won).toLocaleString("en-US")} won of ${Number(rec.played).toLocaleString("en-US")}</small></dd></div>`;

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
    const loaded = Boolean(hubData);
    rowIndex = 0;
    const openHTML = tables.length
      ? tables.map(openRow).join("")
      : loaded
        ? emptyBox("No open tables right now. Put up cards and wait for a match, or call a free bot.", ageShut ? "" : `<a class="ghost sm" href="/casino/coinflip" data-hub-link>Start a flip</a>`)
        : loadingRows(2);
    rowIndex = 0;
    const feedHTML = feed.length
      ? feed.map(winRow).join("")
      : loaded ? emptyBox("No wins yet. The first coinflip or pot to finish shows up here.") : loadingRows(3);
    const tiles = [
      game({ href: "/casino/coinflip", key: "coinflip", title: "Coinflip", line: "Your pile against theirs, one toss.", n: hubData ? (hubData.open || []).length : null, word: "open", art: coinArtHTML({ size: 92 }) }),
      game({ href: "/casino/jackpot", key: "jackpot", title: "Jackpot", line: "One pot, one draw, weighted by value.", n: jackData ? (jackData.open || []).length : null, word: "open", art: potArtHTML({ size: 92 }) }),
      game({ href: "/casino/upgrader", key: "upgrader", title: "Upgrader", line: "Aim higher, the odds drop.", art: upgraderArtHTML({ size: 92 }) }),
      game({ href: "/battles", key: "battles", title: "Pack battles", line: "Same packs, best pulls take the pot.", art: battlesArtHTML({ setId: featured, size: 92 }) }),
    ];
    const live = `<section class="cs-section" aria-labelledby="cs-open">
          <h2 class="cs-h" id="cs-open">Open tables${tables.length ? ` <span>${tables.length}</span>` : ""}</h2>
          <div class="cs-rows">${openHTML}</div>
        </section>
        <section class="cs-section" aria-labelledby="cs-live">
          <h2 class="cs-h" id="cs-live">Recent wins</h2>
          <div class="cs-rows">${feedHTML}</div>
        </section>`;
    const recordHTML = record.length ? `<section class="rt-box hub-record" aria-labelledby="hub-rec"><h2 class="cs-h" id="hub-rec">Your record</h2>
        <dl class="hub-rec">${record.map(recordRow).join("")}</dl></section>` : "";
    const shut = ageShut ? "1" : "0";
    const page = pages.hub.querySelector(".cs-hub");
    if (page && page.dataset.shut === shut) {
      // Already on screen: only the live parts change, so the tiles never deal in twice.
      page.querySelectorAll(".hub-tile").forEach((li, i) => {
        const fresh = document.createElement("ul");
        fresh.innerHTML = tiles[i];
        const next = fresh.querySelector(".hub-game-fig");
        const now = li.querySelector(".hub-game-fig");
        if (next && now) now.replaceWith(next);
        else if (next) li.querySelector(".hub-game-go")?.before(next);
      });
      page.querySelector(".hub-live").innerHTML = live;
      const rec = page.querySelector(".hub-record");
      if (rec) rec.outerHTML = recordHTML;
      else if (recordHTML) page.insertAdjacentHTML("beforeend", recordHTML);
    } else {
      pages.hub.innerHTML = `<div class="cs-page cs-hub${hubFresh ? " is-fresh" : ""}" data-shut="${shut}">
      <header class="cs-head hub-head">
        <h1 class="page-title">Casino</h1>
        ${ageShut ? "" : `<a class="solid rt-go hub-primary" href="/casino/coinflip" data-hub-link>Flip a coin</a>`}
      </header>
      ${ageShut ? gateNoticeHTML(ageLock) : ""}
      <ul class="hub-games" aria-label="The games">${tiles.join("")}</ul>
      <a class="rt-box hub-beta" href="/casino/beta" data-hub-link><span class="hub-beta-art" aria-hidden="true">${BETA_ART.rocket}</span><span class="hub-beta-copy"><b>Beta testing <span class="rt-tag">Beta</span></b><span>Five new games for invited testers: Tall Grass, Poké Ball Drop, Rocket, Higher or Lower and Mystery Tins.</span></span><i class="hub-game-go" aria-hidden="true"></i></a>
      <div class="cs-cols hub-live">${live}</div>
      ${recordHTML}
    </div>`;
    }
    hubFresh = false;
    if (loaded) hubSeen = new Set([...pages.hub.querySelectorAll("[data-k]")].map((el) => el.dataset.k));
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
      if (game === "hub") { hubFresh = true; hubSeen = null; hubFigs = {}; pages.hub.innerHTML = ""; }
      clearTimeout(hubTimer);
      hubToken++;
    }
    current = game;
    for (const [key, el] of Object.entries(pages)) el.classList.toggle("hidden", key !== game);
    paintBar(BAR_KEY[game] || game);
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
    for (const k of BETA_KEYS) games[k].hide();
    picker.close();
  }

  return { show, hide, paintBar, path: "/casino" };
}
