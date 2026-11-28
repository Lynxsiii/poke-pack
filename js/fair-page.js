/* The Fairness page (/casino/fair and /casino/fair/<tab or kind-id>).

   Four tabs: your seed pair (and rotating it), your last bets with a check for each, a tool that replays any bet from
   its seeds, and the odds of every game. Nothing here decides anything: the Worker rolls (worker/fair.js) and this page
   replays the same functions (js/fair.js) in the browser, so a result can be checked without trusting the server.

   show(id):  ""                     the seeds tab
              "seeds|bets|verify|odds"  that tab
              "<kind>-<gameId>"      the verify tab with that game's own seed loaded (coinflip, jackpot, battle)

   Styles: css/pages/fair.css (.fr-*). */
import { api, esc, icon, emptyBox, loadingRows } from "./casino-kit.js";
import { fairStream, hashSeed, cleanClientSeed, flipWinner, jackpotTicket, upgradeRoll, grassBoard, tinPicks } from "./fair.js";
import { GAME_ODDS } from "./fair-odds.js";
import { GRASS } from "./beta-rules.js";
import { oddsBodyHTML, wireOdds, pctText } from "./fair-sheet.js";

const TABS = [["seeds", "Seeds"], ["bets", "Bets"], ["verify", "Verify"], ["odds", "Odds"]];
const GAME_KINDS = ["coinflip", "jackpot", "battle"];
/** What the verify tool can replay, in the order its picker lists them. */
const TOOL_GAMES = [["upgrader", "Upgrader"], ["grass", "Tall Grass"], ["tins", "Mystery Tins"], ["coinflip", "Coinflip"], ["jackpot", "Jackpot"]];
const SHORT = { upgrader: "Upgrader", grass: "Grass", tins: "Tins", coinflip: "Coinflip", packs: "Packs", jackpot: "Jackpot", battle: "Battle" };
const FULL = { upgrader: "Upgrader", grass: "Tall Grass", tins: "Mystery Tins", coinflip: "Coinflip", packs: "Packs and boxes", jackpot: "Jackpot", battle: "Pack battle" };

const num = (n) => Number(n).toLocaleString("en-US");
const same = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]);
const shortHex = (s) => (String(s).length > 20 ? `${String(s).slice(0, 8)}…${String(s).slice(-6)}` : String(s));
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayText = (ms) => { const d = new Date(ms); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };
function agoText(ms, now) {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return dayText(ms);
}

// ---- Replaying ------------------------------------------------------------------------------------------------------
/**
 * Replay one game from its seeds. `p` holds what the game needs (chance, mines, odds, count, totalCents, seats).
 * Returns `{ text, more, board, value }`: a line for the reader, an optional second line, the Voltorb tiles for the
 * small board, and `value` in the shape the Worker logs so it can be compared.
 */
function replay(game, serverSeed, clientSeed, nonce, p = {}) {
  const s = fairStream(serverSeed, clientSeed, nonce);
  let out;
  if (game === "upgrader") {
    const roll = upgradeRoll(s);
    const chance = Number.isFinite(p.chance) && p.chance > 0 ? p.chance : null;
    const won = chance == null ? null : roll < chance;
    out = { text: `Roll ${num(roll)}`, more: chance == null ? "A roll under your chance in millionths wins." : `${won ? "A win" : "A miss"}: it needed a roll under ${num(chance)} (${pctText(chance / 1e6)}).`, value: { roll, won } };
  } else if (game === "grass") {
    const mines = Math.max(GRASS.minMines, Math.min(GRASS.maxMines, Math.floor(p.mines) || GRASS.minMines));
    const board = grassBoard(s, GRASS.tiles, mines);
    out = { text: `Voltorb under ${board.length === 1 ? "tile" : "tiles"} ${board.map((t) => t + 1).join(", ")}`, more: "Tiles count from 1 at the top left, row by row.", board, value: { board } };
  } else if (game === "tins") {
    const odds = (p.odds || []).filter((x) => Number.isFinite(x) && x >= 0);
    if (!odds.length) return { need: "Paste the tin's odds list to replay it." };
    const picks = tinPicks(s, odds, Math.max(1, Math.min(100, Math.floor(p.count) || 1)));
    out = { text: `${picks.length === 1 ? "Card" : "Cards"} ${picks.map((i) => i + 1).join(", ")} of the tin's list`, more: (p.cards || []).length ? p.cards.join(", ") : "Counted from 1 at the top of the tin's list.", value: { picks } };
  } else if (game === "coinflip") {
    const winner = flipWinner(s);
    out = { text: winner === "host" ? "The host's side wins" : "The challenger's side wins", value: { winner } };
  } else if (game === "jackpot") {
    const seats = Array.isArray(p.seats) ? p.seats : null;
    const total = seats ? seats.reduce((n, x) => n + (Math.floor(x.value) || 0), 0) : Math.floor(p.totalCents);
    if (!(total >= 1)) return { need: "Enter the pot's value to draw its ticket." };
    const ticket = jackpotTicket(s, total);
    let winnerSeat = null;
    if (seats) {
      let run = 0;
      for (const x of seats) { run += Math.floor(x.value) || 0; if (ticket < run) { winnerSeat = x.seat; break; } }
    }
    out = { text: `Ticket ${num(ticket)} of ${num(total)}`, more: winnerSeat == null ? "Seats hold one ticket per cent, in seat order. The seat holding this ticket takes the pot." : `Seat ${num(winnerSeat)} holds that ticket and takes the pot.`, value: { ticket, winnerSeat } };
  } else {
    return { need: "" };
  }
  out.used = s.used();
  return out;
}

/** Does a replayed value say the same as what the Worker logged? null when there is nothing logged to compare. */
function agrees(game, value, logged) {
  if (!logged || !value) return null;
  if (game === "upgrader") return value.roll === logged.roll && (value.won == null || value.won === Boolean(logged.won));
  if (game === "grass") return same(value.board, logged.board);
  if (game === "tins") return same(value.picks, logged.picks);
  if (game === "coinflip") return value.winner === logged.winner;
  if (game === "jackpot") return value.ticket === logged.ticket && (value.winnerSeat == null || logged.winnerSeat == null || value.winnerSeat === logged.winnerSeat);
  return null;
}

/** A logged bet in a line: what the row says before it is checked. */
function rollLine(r) {
  const res = r.result || {};
  const p = r.params || {};
  if (r.game === "upgrader") return `Rolled ${num(res.roll ?? 0)}, ${res.won ? "won" : "missed"}`;
  if (r.game === "grass") return `${num(p.mines ?? (res.board || []).length)} Voltorb hidden`;
  if (r.game === "tins") return (res.cards || []).length ? res.cards.join(", ") : `${num((res.picks || []).length)} tins opened`;
  if (r.game === "coinflip") return res.winner === "host" ? "You won the toss" : "The bot won the toss";
  if (r.game === "packs") return `${num(res.draws ?? 0)} draws`;
  return "Bet";
}

/** The 25 tiles small, the Voltorb marked. */
function boardHTML(board) {
  const hit = new Set(board);
  return `<span class="fr-board" role="img" aria-label="The patch, Voltorb under ${board.length === 1 ? "tile" : "tiles"} ${board.map((t) => t + 1).join(", ")}">${Array.from({ length: GRASS.tiles }, (_, i) => `<i${hit.has(i) ? ' class="is-volt"' : ""}></i>`).join("")}</span>`;
}

const checkHTML = (ok, text) => `<li class="${ok ? "is-ok" : "is-bad"}">${icon(ok ? "check" : "close")}<span>${text}</span></li>`;
const copyBtn = (value, what) => `<button class="fr-copy" type="button" data-fr-copy="${esc(value)}" aria-label="Copy ${esc(what)}">${icon("copy")}</button>`;
/** A seed or a hash with its name over it and a copy key beside it. */
const hexHTML = (label, value, what = label.toLowerCase()) => `<div class="fr-seed"><span class="fr-k">${esc(label)}</span><code class="fr-hex">${esc(value)}</code>${copyBtn(value, what)}</div>`;

export function createFairPage(ctx) {
  const root = ctx.root;
  let visible = false;
  let token = 0; // bumped on every show, so a slow answer never paints over a newer page
  let tab = "seeds";
  let data = null; // GET /api/fair
  let failed = "";
  let revealed = null; // the pair the last rotation revealed
  let rotating = false;
  let rotateError = "";
  const open = new Set(); // bets whose check is open
  let tool = blankTool();
  let loaded = null; // { kind, id, state: "loading" | "open" | "done" | "error", game, error }
  let fresh = true; // the next paint of the panel rises in

  function blankTool() {
    return { game: "upgrader", serverSeed: "", clientSeed: "", nonce: "0", chance: "", mines: "3", odds: "", count: "1", total: "", hash: "", logged: null, seats: null, cards: null, from: "" };
  }
  const signedIn = () => Boolean(ctx.user?.());
  const now = () => ctx.clock?.now?.() ?? Date.now();
  const motion = () => (ctx.motion ? ctx.motion() : true);

  // ---- Seeds ---------------------------------------------------------------------------------------------------------
  function signInHTML(what) {
    return `<div class="rt-empty cs-empty-box fr-signin"><span class="rt-ball e" aria-hidden="true"></span><p>Sign in to see ${what}. The verify tool and the odds work without an account.</p><button class="ghost sm" type="button" data-fr-signin>Sign in</button></div>`;
  }
  const failHTML = () => `<div class="rt-empty cs-empty-box"><span class="rt-ball e" aria-hidden="true"></span><p>${esc(failed)}</p><button class="ghost sm" type="button" data-fr-retry>Try again</button></div>`;

  function revealedHTML() {
    if (!revealed) return "";
    const ok = hashSeed(revealed.serverSeed) === revealed.serverHash;
    return `<section class="rt-box fr-box fr-revealed" aria-labelledby="fr-rev-h">
      <h2 class="fr-h" id="fr-rev-h">Old server seed revealed</h2>
      ${hexHTML("Server seed", revealed.serverSeed)}
      <ul class="fr-checks">${checkHTML(ok, ok ? "Its SHA-256 is the hash you were shown before you bet." : "Its SHA-256 is not the hash you were shown. Tell us on Discord.")}</ul>
      <p class="fr-fine">Used for ${num(revealed.nonces)} ${revealed.nonces === 1 ? "bet" : "bets"} with the client seed <code class="fr-inline">${esc(revealed.clientSeed)}</code>.</p>
      ${revealed.nonces > 0 ? `<button class="fr-link" type="button" data-fr-tab="bets">Check those bets</button>` : ""}
    </section>`;
  }

  function seedsHTML() {
    if (!signedIn()) return signInHTML("your seeds");
    if (failed) return failHTML();
    if (!data) return `<div class="cs-rows">${loadingRows(3)}</div>`;
    const s = data.seed;
    const past = data.history || [];
    return `${revealedHTML()}
      <section class="rt-box fr-box fr-pair" aria-labelledby="fr-pair-h">
        <h2 class="fr-h" id="fr-pair-h">Your seed pair</h2>
        <p class="fr-lede">The server seed is locked in before you bet. You see its hash now, so it can't be swapped later. Rotating reveals it, so you can check every bet made with it.</p>
        ${hexHTML("Server seed, hashed", s.serverHash, "server seed hash")}
        <div class="fr-seed"><span class="fr-k">Client seed</span><code class="fr-hex is-text">${esc(s.clientSeed)}</code>${copyBtn(s.clientSeed, "client seed")}</div>
        <div class="fr-seed is-fig"><span class="fr-k">Bets made with this pair</span><b>${num(s.nonce)}</b></div>
        ${hexHTML("Next server seed, hashed", s.nextHash, "next server seed hash")}
        <form class="fr-rotate" data-fr-rotate novalidate>
          <label class="fr-field"><span class="fr-k">New client seed, if you want your own</span>
            <input class="fr-input" name="clientSeed" type="text" maxlength="64" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Leave empty for a random one" aria-describedby="fr-rot-msg" /></label>
          <p class="fr-msg" id="fr-rot-msg" role="alert">${esc(rotateError)}</p>
          <button class="solid" type="submit"${rotating ? " disabled" : ""}>${rotating ? "Rotating" : "Rotate seeds"}</button>
        </form>
      </section>
      ${past.length ? `<section class="cs-section fr-pasts"><h2 class="cs-h">Past seeds <span>${num(past.length)}</span></h2>
        <div class="fr-past-list">${past.map((h, i) => `<details class="fr-past"${revealed && h.serverHash === revealed.serverHash ? " open" : ""}>
          <summary><span class="fr-past-main"><b>Retired ${esc(dayText(h.retiredAt))}</b><small>${num(h.nonces)} ${h.nonces === 1 ? "bet" : "bets"}, seed ${esc(shortHex(h.serverSeed))}</small></span></summary>
          <div class="fr-past-body">
            ${hexHTML("Server seed", h.serverSeed)}
            ${hexHTML("Its hash", h.serverHash, "server seed hash")}
            <div class="fr-seed"><span class="fr-k">Client seed</span><code class="fr-hex is-text">${esc(h.clientSeed)}</code>${copyBtn(h.clientSeed, "client seed")}</div>
            <button class="fr-link" type="button" data-fr-past="${i}">Use this seed in the verify tool</button>
          </div></details>`).join("")}</div></section>` : ""}`;
  }

  // ---- Bets ----------------------------------------------------------------------------------------------------------
  function proofHTML(r) {
    const hashOk = hashSeed(r.serverSeed) === r.serverHash;
    const lines = [checkHTML(hashOk, hashOk ? "The server seed hashes to what you were shown before the bet." : "The server seed does not hash to what you were shown.")];
    let extra = "";
    if (r.game === "packs") {
      lines.push(`<li class="is-note">${icon("minus")}<span>${num(r.result?.draws ?? 0)} draws came from this nonce, in order. The full pull isn't replayed here.</span></li>`);
    } else {
      const p = r.params || {};
      const out = replay(r.game, r.serverSeed, r.clientSeed, r.nonce, { chance: p.chance, mines: p.mines, odds: p.odds, count: p.count, cards: r.result?.cards });
      const ok = out.value ? agrees(r.game, out.value, r.result) : null;
      if (ok == null) lines.push(`<li class="is-note">${icon("minus")}<span>This kind of bet isn't replayed here.</span></li>`);
      else lines.push(checkHTML(ok, ok ? `Replayed here, it gives the same result. ${esc(out.text)}.${r.game === "upgrader" && out.more ? ` ${esc(out.more)}` : ""}` : `Replayed here, it gives a different result. ${esc(out.text)}.`));
      if (out.board) extra = boardHTML(out.board);
    }
    return `<div class="fr-proof"><ul class="fr-checks">${lines.join("")}</ul>${extra}
      ${r.game === "packs" ? "" : `<button class="fr-link" type="button" data-fr-tool="${esc(r.id)}">Open in the verify tool</button>`}</div>`;
  }

  function betsHTML() {
    if (!signedIn()) return signInHTML("your bets");
    if (failed) return failHTML();
    if (!data) return `<div class="cs-rows">${loadingRows(4)}</div>`;
    const rolls = data.rolls || [];
    if (!rolls.length) return emptyBox("No bets yet. Play a game and it shows up here with its nonce.");
    const sealed = rolls.some((r) => !r.serverSeed);
    const t = now();
    return `${sealed ? `<p class="fr-lede fr-bets-note">Bets on your active pair stay sealed until you rotate it. <button class="fr-link" type="button" data-fr-tab="seeds">Rotate seeds</button></p>` : ""}
      <div class="cs-rows fr-rolls">${rolls.map((r, i) => {
        const isOpen = open.has(String(r.id)) && r.serverSeed;
        return `<div class="fr-roll${isOpen ? " is-open" : ""}"${fresh && i < 8 ? ` data-new style="--i:${i}"` : ""}>
          <div class="rt-row fr-roll-row">
            <span class="rt-row-lab">${esc(SHORT[r.game] || r.game)}</span>
            <span class="rt-row-name">${esc(rollLine(r))}<small>Nonce ${num(r.nonce)}, ${esc(agoText(r.createdAt, t))}</small></span>
            <span class="rt-row-val">${r.serverSeed
              ? `<button class="ghost sm" type="button" data-fr-verify="${esc(r.id)}" aria-expanded="${isOpen ? "true" : "false"}">${isOpen ? "Hide" : "Verify"}</button>`
              : `<button class="fr-link fr-sealed" type="button" data-fr-tab="seeds">Rotate to reveal</button>`}</span>
          </div>${isOpen ? proofHTML(r) : ""}</div>`;
      }).join("")}</div>`;
  }

  // ---- The verify tool -------------------------------------------------------------------------------------------------
  const field = (label, name, attrs = "", cls = "") => `<label class="fr-field ${cls}"><span class="fr-k">${label}</span><input class="fr-input" name="${name}" value="${esc(tool[name])}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" ${attrs} /></label>`;

  function toolExtraHTML() {
    const g = tool.game;
    if (g === "upgrader") return field("Your chance, in percent", "chance", 'type="text" inputmode="decimal" placeholder="45.2"');
    if (g === "grass") return field("Voltorb in the patch", "mines", `type="number" inputmode="numeric" min="${GRASS.minMines}" max="${GRASS.maxMines}"`);
    if (g === "tins") return `<label class="fr-field is-wide"><span class="fr-k">The tin's odds, top to bottom</span><textarea class="fr-input fr-area" name="odds" rows="2" autocomplete="off" spellcheck="false" placeholder="0.5, 0.3, 0.15, 0.05">${esc(tool.odds)}</textarea></label>${field("Tins opened at once", "count", 'type="number" inputmode="numeric" min="1" max="100"')}`;
    if (g === "jackpot") return tool.seats ? "" : field("The pot's value, in coins", "total", 'type="text" inputmode="decimal" placeholder="125.50"');
    return "";
  }

  function toolResultHTML() {
    const seed = tool.serverSeed.trim();
    const client = tool.clientSeed.trim();
    const nonce = Number(tool.nonce);
    if (!seed || !client) return `<p class="fr-fine fr-wait">Enter a server seed and a client seed. The result appears as you type.</p>`;
    if (!Number.isInteger(nonce) || nonce < 0) return `<p class="fr-fine fr-wait">The nonce is a whole number, 0 or more.</p>`;
    const hash = hashSeed(seed);
    const shown = tool.hash.trim().toLowerCase();
    const p = {
      chance: Math.round(Number(String(tool.chance).replace("%", "")) * 10000),
      mines: Number(tool.mines),
      odds: tool.odds.split(/[\s,;]+/).filter(Boolean).map(Number),
      count: Number(tool.count),
      totalCents: Math.round(Number(String(tool.total).replace(/,/g, "")) * 100),
      seats: tool.seats, cards: tool.cards,
    };
    const out = tool.game === "battle" ? { need: "A battle's packs aren't replayed here. The seed and its hash are what you can check." } : replay(tool.game, seed, client, nonce, p);
    const ok = out.value ? agrees(tool.game, out.value, tool.logged) : null;
    const checks = [
      shown ? checkHTML(hash === shown, hash === shown ? "The seed hashes to the hash you were shown." : "The seed does not hash to the hash you were shown.") : "",
      ok == null ? "" : checkHTML(ok, ok ? "The same as the result the game logged." : "Not the result the game logged."),
    ].join("");
    return `${out.value ? `<p class="fr-out-fig">${esc(out.text)}</p>${out.more ? `<p class="fr-fine">${esc(out.more)}</p>` : ""}${out.board ? boardHTML(out.board) : ""}` : out.need ? `<p class="fr-fine fr-wait">${esc(out.need)}</p>` : ""}
      ${checks ? `<ul class="fr-checks">${checks}</ul>` : ""}
      ${hexHTML("SHA-256 of the server seed", hash, "hash")}
      ${out.used ? `<p class="fr-fine">${num(out.used)} ${out.used === 1 ? "draw" : "draws"} read from the stream.</p>` : ""}`;
  }

  function loadedHTML() {
    if (!loaded) return "";
    const name = `${FULL[loaded.kind] || loaded.kind} ${shortHex(loaded.id)}`;
    if (loaded.state === "loading") return `<div class="fr-loaded rt-skel" aria-hidden="true"></div><p class="sr-only">Loading.</p>`;
    if (loaded.state === "error") return `<div class="rt-box fr-box fr-loaded"><h2 class="fr-h">${esc(name)}</h2><p class="fr-fine">${esc(loaded.error)}</p></div>`;
    if (loaded.state === "open") return `<div class="rt-box fr-box fr-loaded"><h2 class="fr-h">${esc(name)}</h2>
      <p class="fr-fine">This game is still running. Its seed is locked in and shown here as a hash. The seed itself is revealed when the game ends.</p>
      ${hexHTML("Server seed, hashed", loaded.game.serverHash, "server seed hash")}</div>`;
    return `<p class="fr-lede fr-loaded-note">Loaded the seed of <b>${esc(name)}</b>. It is checked below.</p>`;
  }

  function verifyHTML() {
    const picks = tool.game === "battle" ? [...TOOL_GAMES, ["battle", "Pack battle"]] : TOOL_GAMES;
    return `${loadedHTML()}
      <form class="rt-box fr-box fr-tool" data-fr-toolform novalidate>
        <h2 class="fr-h">Replay a bet</h2>
        <p class="fr-lede">It runs in your browser with the same code the server rolls with. Nothing is sent anywhere.</p>
        <label class="fr-field is-wide"><span class="fr-k">Game</span>
          <span class="fr-select"><select class="fr-input" name="game">${picks.map(([k, n]) => `<option value="${k}"${k === tool.game ? " selected" : ""}>${esc(n)}</option>`).join("")}</select></span></label>
        <label class="fr-field is-wide"><span class="fr-k">Server seed, revealed</span><textarea class="fr-input fr-area fr-mono" name="serverSeed" rows="3" autocomplete="off" autocapitalize="off" spellcheck="false">${esc(tool.serverSeed)}</textarea></label>
        ${field("Client seed", "clientSeed", 'type="text"', "is-wide")}
        <div class="fr-cols" data-fr-extra>${field("Nonce", "nonce", 'type="number" inputmode="numeric" min="0"')}${toolExtraHTML()}</div>
        <label class="fr-field is-wide"><span class="fr-k">Hash you were shown, if you have it</span><input class="fr-input fr-mono" name="hash" value="${esc(tool.hash)}" autocomplete="off" autocapitalize="off" spellcheck="false" /></label>
        <div class="fr-out" data-fr-out aria-live="polite">${toolResultHTML()}</div>
        ${tool.serverSeed || tool.clientSeed ? `<button class="fr-link" type="button" data-fr-clear>Clear the tool</button>` : ""}
      </form>`;
  }

  // ---- Odds ----------------------------------------------------------------------------------------------------------
  function oddsHTML() {
    return `<p class="fr-lede">Payback is what a game returns on average. The figures come from the rules the server settles with.</p>
      <div class="fr-games">${GAME_ODDS.map((g) => `<details class="fr-game" data-game="${esc(g.key)}">
        <summary><span class="fr-past-main"><b>${esc(g.name)}</b><small>${g.seed === "yours" ? "Uses your seed pair" : "Has its own seed"}</small></span></summary>
        <div class="fr-game-body">${oddsBodyHTML(g)}<a class="fr-link" href="${esc(g.href)}" data-fr-go>Play ${esc(g.name)}</a></div>
      </details>`).join("")}</div>`;
  }

  // ---- Painting ------------------------------------------------------------------------------------------------------
  const panelHTML = () => (tab === "bets" ? betsHTML() : tab === "verify" ? verifyHTML() : tab === "odds" ? oddsHTML() : seedsHTML());

  function paintPanel() {
    const panel = root.querySelector("[data-fr-panel]");
    if (!panel) return paint();
    // An open game in the odds list stays open across a repaint.
    const openGames = [...panel.querySelectorAll(".fr-game[open]")].map((d) => d.dataset.game);
    panel.innerHTML = panelHTML();
    panel.classList.toggle("is-fresh", fresh && motion());
    for (const key of openGames) panel.querySelector(`.fr-game[data-game="${key}"]`)?.setAttribute("open", "");
    fresh = false;
  }

  function paint() {
    root.innerHTML = `<div class="cs-page fr-page">
      <header class="cs-head"><h1 class="page-title">Fairness</h1>
        <p class="cs-lede">Every result comes from seeds that are fixed before you bet. Check any of them here.</p></header>
      <div class="fr-tabs" role="tablist" aria-label="Fairness">${TABS.map(([k, n]) => `<button class="rt-word${k === tab ? " on" : ""}" type="button" role="tab" id="fr-tab-${k}" aria-selected="${k === tab}" aria-controls="fr-panel" tabindex="${k === tab ? 0 : -1}" data-fr-tab="${k}">${n}</button>`).join("")}</div>
      <div class="fr-panel" id="fr-panel" role="tabpanel" aria-labelledby="fr-tab-${tab}" data-fr-panel></div>
    </div>`;
    paintPanel();
  }

  function setTab(next, focusTab = false) {
    if (!TABS.some(([k]) => k === next)) return;
    const changed = next !== tab;
    tab = next;
    fresh = true;
    for (const b of root.querySelectorAll(".fr-tabs [data-fr-tab]")) {
      const on = b.dataset.frTab === tab;
      b.classList.toggle("on", on);
      b.classList.toggle("is-pick", on && changed);
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
      if (on && focusTab) b.focus();
    }
    root.querySelector("[data-fr-panel]")?.setAttribute("aria-labelledby", `fr-tab-${tab}`);
    paintPanel();
  }

  // ---- Data ----------------------------------------------------------------------------------------------------------
  function take(res) {
    data = { seed: res.seed, history: res.history || [], rolls: res.rolls || [] };
    if (res.serverNow) ctx.clock?.sync?.(res.serverNow);
  }

  async function load() {
    if (!signedIn()) { data = null; return; }
    const mine = token;
    try {
      const res = await api("/api/fair");
      if (mine !== token || !visible) return;
      failed = "";
      take(res);
    } catch (err) {
      if (mine !== token || !visible) return;
      if (err?.status === 401) { data = null; failed = ""; } else failed = err?.message || "Couldn't load your seeds.";
    }
    if (tab === "seeds" || tab === "bets") paintPanel();
  }

  async function loadGame(kind, id) {
    const mine = token;
    loaded = { kind, id, state: "loading" };
    try {
      const res = await api(`/api/fair/game/${kind}/${encodeURIComponent(id)}`);
      if (mine !== token || !visible) return;
      const g = res.game;
      if (!g.done || !g.serverSeed) loaded = { kind, id, state: "open", game: g };
      else {
        loaded = { kind, id, state: "done", game: g };
        tool = { ...blankTool(), game: kind, serverSeed: g.serverSeed, clientSeed: g.clientSeed || "", nonce: String(g.nonce ?? 0), hash: g.serverHash,
          logged: g.result || null, seats: kind === "jackpot" && Array.isArray(g.params?.seats) ? g.params.seats : null, from: `${kind}-${id}` };
      }
    } catch (err) {
      if (mine !== token || !visible) return;
      loaded = { kind, id, state: "error", error: err?.status === 404 ? "There's no seed for that game. Check the link." : err?.message || "Couldn't load that game." };
    }
    if (tab === "verify") paintPanel();
  }

  async function rotate(form) {
    if (rotating) return;
    const raw = String(new FormData(form).get("clientSeed") || "").trim();
    const input = form.querySelector('[name="clientSeed"]');
    if (raw && !cleanClientSeed(raw)) {
      rotateError = "A client seed is 1 to 64 letters, numbers or symbols, with no spaces.";
      form.querySelector(".fr-msg").textContent = rotateError;
      input.setAttribute("aria-invalid", "true");
      input.focus();
      return;
    }
    rotating = true;
    rotateError = "";
    const mine = token;
    paintPanel();
    try {
      const res = await api("/api/fair/rotate", { method: "POST", body: JSON.stringify({ clientSeed: raw }) });
      if (mine !== token) return;
      take(res);
      revealed = res.revealed || null;
      fresh = true;
      ctx.toast?.("Seeds rotated. Your old server seed is revealed.");
    } catch (err) {
      if (mine !== token) return;
      rotateError = err?.message || "Couldn't rotate your seeds. Try again.";
    } finally {
      rotating = false;
    }
    if (!visible || mine !== token) return;
    if (tab === "seeds") {
      paintPanel();
      if (rotateError) { const again = root.querySelector('[name="clientSeed"]'); if (again) again.value = raw; }
      else root.querySelector(".fr-revealed")?.scrollIntoView({ block: "nearest", behavior: motion() ? "smooth" : "auto" });
    }
  }

  /** Fill the tool from a logged bet. */
  function toolFromRoll(r) {
    const p = r.params || {};
    tool = { ...blankTool(), game: r.game, serverSeed: r.serverSeed || "", clientSeed: r.clientSeed, nonce: String(r.nonce), hash: r.serverHash, logged: r.result || null,
      chance: p.chance != null ? String(Number((p.chance / 10000).toFixed(4))) : "", mines: String(p.mines ?? 3), odds: Array.isArray(p.odds) ? p.odds.join(", ") : "", count: String(p.count ?? 1),
      cards: r.result?.cards || null, from: `bet-${r.id}` };
    loaded = null;
  }

  // ---- Events --------------------------------------------------------------------------------------------------------
  async function copy(btn) {
    const text = btn.dataset.frCopy;
    try {
      await navigator.clipboard.writeText(text);
      btn.classList.add("is-done");
      btn.innerHTML = icon("check");
      setTimeout(() => { if (btn.isConnected) { btn.classList.remove("is-done"); btn.innerHTML = icon("copy"); } }, 1400);
      ctx.toast?.("Copied.");
    } catch {
      ctx.toast?.(text);
    }
  }

  root.addEventListener("click", (e) => {
    const el = e.target.closest("[data-fr-copy], [data-fr-tab], [data-fr-verify], [data-fr-tool], [data-fr-past], [data-fr-clear], [data-fr-signin], [data-fr-retry], [data-fr-go]");
    if (!el || !root.contains(el)) return;
    if (el.dataset.frCopy != null) return void copy(el);
    if (el.dataset.frTab) { setTab(el.dataset.frTab, !el.closest(".fr-tabs")); if (!el.closest(".fr-tabs")) root.querySelector(".fr-tabs")?.scrollIntoView({ block: "nearest" }); return; }
    if (el.dataset.frVerify != null) {
      const id = el.dataset.frVerify;
      if (open.has(id)) open.delete(id); else open.add(id);
      fresh = false;
      paintPanel();
      root.querySelector(`[data-fr-verify="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
      return;
    }
    if (el.dataset.frTool != null) {
      const r = (data?.rolls || []).find((x) => String(x.id) === el.dataset.frTool);
      if (r) { toolFromRoll(r); setTab("verify", true); root.querySelector(".fr-tabs")?.scrollIntoView({ block: "nearest" }); }
      return;
    }
    if (el.dataset.frPast != null) {
      const h = (data?.history || [])[Number(el.dataset.frPast)];
      if (h) { tool = { ...blankTool(), serverSeed: h.serverSeed, clientSeed: h.clientSeed, hash: h.serverHash }; loaded = null; setTab("verify", true); root.querySelector(".fr-tabs")?.scrollIntoView({ block: "nearest" }); }
      return;
    }
    if (el.dataset.frClear != null) { tool = blankTool(); loaded = null; fresh = false; paintPanel(); root.querySelector('[name="game"]')?.focus(); return; }
    if (el.dataset.frSignin != null) return void ctx.signIn?.();
    if (el.dataset.frRetry != null) { failed = ""; data = null; paintPanel(); return void load(); }
    if (el.dataset.frGo != null) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
      e.preventDefault();
      ctx.navigate?.(el.getAttribute("href"));
    }
  });

  // The tabs move with the arrow keys, as a tab list does.
  root.addEventListener("keydown", (e) => {
    const t = e.target.closest?.(".fr-tabs [data-fr-tab]");
    if (!t || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const i = TABS.findIndex(([k]) => k === tab);
    const next = e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + TABS.length) % TABS.length;
    setTab(TABS[next][0], true);
  });

  root.addEventListener("input", (e) => {
    const form = e.target.closest("[data-fr-toolform]");
    if (form) {
      const name = e.target.name;
      if (!(name in tool)) return;
      tool[name] = e.target.value;
      // Typing over a loaded bet: what it logged no longer belongs to these seeds.
      if (name === "game") { tool.logged = null; tool.seats = null; tool.cards = null; form.querySelector("[data-fr-extra]").innerHTML = field("Nonce", "nonce", 'type="number" inputmode="numeric" min="0"') + toolExtraHTML(); }
      form.querySelector("[data-fr-out]").innerHTML = toolResultHTML();
      return;
    }
    if (e.target.name === "clientSeed" && e.target.closest("[data-fr-rotate]")) {
      e.target.removeAttribute("aria-invalid");
      if (rotateError) { rotateError = ""; root.querySelector(".fr-msg").textContent = ""; }
    }
  });

  root.addEventListener("submit", (e) => {
    e.preventDefault();
    if (e.target.matches("[data-fr-rotate]")) rotate(e.target);
  });

  wireOdds(root);

  return {
    show(id) {
      visible = true;
      token++;
      fresh = true;
      loaded = null;
      const key = String(id || "");
      const game = key.match(/^([a-z]+)-([a-zA-Z0-9-]{1,80})$/);
      if (game && GAME_KINDS.includes(game[1])) {
        tab = "verify";
        if (tool.from !== key) tool = blankTool();
        paint();
        loadGame(game[1], game[2]);
      } else {
        tab = TABS.some(([k]) => k === key) ? key : "seeds";
        paint();
      }
      load();
    },
    hide() {
      visible = false;
      token++;
      rotating = false;
    },
  };
}
