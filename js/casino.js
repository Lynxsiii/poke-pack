/* The casino: the router and the hub.

   /casino                 the hub: the tables and what is happening at them
   /casino/coinflip[/<id>] cards against cards, one toss (js/coinflip.js)
   /casino/jackpot[/<id>]  3 to 10 players, one pot, one draw (js/jackpot.js)
   /battles...             pack battles keep their own routes and modules
                           (js/battles.js); the casino only links to them and
                           draws the sub-nav above them.

   Every game settles in the Worker (worker/casino.js, worker/battles.js). These
   modules present what it returns. */
import { api, esc, coins, coinTag, icon, plural, playerName, emptyLine, seatAvatar, coinArtHTML, potArtHTML, battlesArtHTML } from "./casino-kit.js";
import { createStakePicker } from "./stake-picker.js?v=5";
import { createCoinflip } from "./coinflip.js?v=6";
import { createJackpot } from "./jackpot.js?v=4";

const HUB_POLL_MS = 8000;
const ROUTE = /^\/casino(?:\/(coinflip|jackpot)(?:\/([a-zA-Z0-9-]{1,80}))?)?$/;

/** Where each game lives, in the order the sub-nav shows them. */
export const CASINO_LINKS = [
  { key: "hub", href: "/casino", label: "Casino" },
  { key: "coinflip", href: "/casino/coinflip", label: "Coinflip" },
  { key: "jackpot", href: "/casino/jackpot", label: "Jackpot" },
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
  const picker = createStakePicker({ ownedCards: () => deps.ownedCards(), ownedSlabs: () => deps.ownedSlabs?.() ?? [] });
  const ctx = { ...deps, clock, motion, navigate, picker };

  const pages = {
    hub: document.createElement("div"),
    coinflip: document.createElement("div"),
    jackpot: document.createElement("div"),
  };
  for (const [key, el] of Object.entries(pages)) {
    el.className = `casino-page casino-page-${key} hidden`;
    root.append(el);
  }
  const coinflip = createCoinflip({ ...ctx, root: pages.coinflip });
  const jackpot = createJackpot({ ...ctx, root: pages.jackpot });
  const games = { coinflip, jackpot };

  let visible = false;
  let current = "";
  let hubTimer = 0;
  let hubToken = 0;
  let hubData = null;
  let jackData = null;

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
  const tile = ({ href, key, title, line, status, art }) => `<a class="cs-tile" href="${href}" data-hub-link data-game="${key}">
      <span class="cs-tile-art">${art}</span>
      <span class="cs-tile-copy"><h2>${esc(title)}</h2><p>${esc(line)}</p><small>${status}</small></span>
    </a>`;

  function paintHub() {
    const open = hubData?.open || [];
    const done = hubData?.done || [];
    const feed = [
      ...done.map((f) => ({ ...f, kind: "coinflip", at: f.flippedAt || 0 })),
      ...(jackData?.done || []).map((j) => ({ ...j, kind: "jackpot", at: j.drawnAt || 0 })),
    ].sort((a, b) => b.at - a.at).slice(0, 5);
    const rec = hubData?.record;
    const featured = deps.featuredSetId?.() || "";
    pages.hub.innerHTML = `<div class="cs-page cs-hub">
      <header class="cs-head">
        <h1 class="page-title">Casino</h1>
        <p class="cs-lede">Put cards or graded slabs on the table. Every flip and every draw is decided by the server at the moment it happens, so nobody can tilt it from a browser.</p>
      </header>
      <div class="cs-tiles">
        ${tile({
          href: "/casino/coinflip", key: "coinflip", title: "Coinflip",
          line: "Put up cards or graded slabs, a player matches the value, one toss takes both piles. Or call a free bot.",
          status: hubData ? `${plural(open.length, "open flip")}${rec ? `, you have won ${rec.won} of ${rec.played}` : ""}` : "&nbsp;",
          art: coinArtHTML({ size: 76 }),
        })}
        ${tile({
          href: "/casino/jackpot", key: "jackpot", title: "Jackpot",
          line: "Three to ten players toss cards or slabs into one pot. One entry is drawn, weighted by value, and takes all.",
          status: jackData ? `${plural((jackData.open || []).length, "open pot")}${jackData.record ? `, you have won ${jackData.record.won} of ${jackData.record.played}` : ""}` : "&nbsp;",
          art: potArtHTML({ size: 76 }),
        })}
        ${tile({
          href: "/battles", key: "battles", title: "Pack battles",
          line: "Rip the same packs side by side. The best pulls take every card in the pot.",
          status: "Free bots, quick battles",
          art: battlesArtHTML({ setId: featured, size: 76 }),
        })}
      </div>
      <section class="cs-section" aria-labelledby="cs-live">
        <h2 class="cs-h" id="cs-live">At the tables</h2>
        <div class="cs-rows">${
          feed.length
            ? feed.map((f) => {
                if (f.kind === "jackpot") {
                  const w = f.entries.find((e) => e.won)?.player;
                  return `<a class="cs-row cs-row-link" href="/casino/jackpot/${esc(f.id)}" data-hub-link>
                  <span class="cs-row-main">${seatAvatar(w)}<span class="cs-row-line"><span><b>${esc(playerName(w))}</b> took the pot of ${coinTag(f.pot)}</span><small>Jackpot, ${plural(f.entries.length, "player")}${f.entries.some((e) => e.slabs?.length) ? `, ${plural(f.entries.reduce((n, e) => n + (e.slabs?.length || 0), 0), "slab")}` : ""}</small></span></span></a>`;
                }
                const w = f.winner === "host" ? f.host : f.guest;
                const l = f.winner === "host" ? f.guest : f.host;
                return `<a class="cs-row cs-row-link" href="/casino/coinflip/${esc(f.id)}" data-hub-link>
                  <span class="cs-row-main">${seatAvatar(w)}<span class="cs-row-line"><span><b>${esc(playerName(w))}</b> took ${coinTag(f.hostValue + f.guestValue)} from ${esc(playerName(l))}</span><small>Coinflip${(f.hostSlabs?.length || 0) + (f.guestSlabs?.length || 0) ? `, ${plural((f.hostSlabs?.length || 0) + (f.guestSlabs?.length || 0), "slab")}` : ""}</small></span></span></a>`;
              }).join("")
            : emptyLine(hubData ? "It is quiet. Be the first to put up cards." : "Loading the tables.")
        }</div>
      </section>
    </div>`;
  }

  async function loadHub() {
    const at = ++hubToken;
    try {
      const [data, jack] = await Promise.all([api("/api/casino/coinflips"), api("/api/casino/jackpots").catch(() => null)]);
      if (at !== hubToken || !visible || current !== "hub") return;
      clock.sync(data.serverNow);
      hubData = data;
      jackData = jack;
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
    picker.close();
  }

  return { show, hide, paintBar, path: "/casino" };
}
