/**
 * Play: the card game's pages (/play). Decks, the deck editor, and the table.
 *
 * The rules live in js/tcg/ (engine, cards, effects, bot, decks) and know
 * nothing about the page; this file is the screen. docs/tcg-plan.md says
 * where it goes next.
 *
 *   initTcg(deps) -> { show(path), hide() }
 *
 * deps (all from js/app.js)
 *   root                the view's section
 *   esc, toast, buzz, navigate(path), reduceMotion()
 *   playerName()        "@handle" or "You"
 *   storeKey()          a per-account suffix for what is kept on this device
 *   owned()             { cardId: copies } raw and graded together
 *   findCard(id)        a loaded card, or null
 *   loadOwnedSets()     loads every set the player holds cards from
 *   loadSet(setId)      loads one set, resolves its card list
 *   setOf(cardId)       the catalog set a card belongs to
 *   face(card)          the full card face as HTML (foil and all), for the close look
 *   backHtml()          a face-down card: the equipped sleeve, else the printed back
 *   coinFaces()         { heads, tails } art of the equipped coin, or null for the house coin
 */

import { ACTIVE, FORMATS, RuleError, apply, canRetreat, conditionsOn, createGame, defOf, energyOf, hpLeft, legalActions, other, usableAttacks } from "./tcg/engine.js";
import { ENERGY_TYPES, FREE_ENERGY, createDefs, isFreeEnergy } from "./tcg/cards.js";
import { botAction } from "./tcg/bot.js";
import { MAX_DECKS, buildBotDeck, buildDeck, checkDeck, deckList, deckSize, roomFor } from "./tcg/decks.js";
import { LESSON, LESSON_CARDS, LESSON_SET, createLesson } from "./tcg/tutorial.js";
import { coinStageHTML, flipCoin } from "./coin.js?v=5";

const ME = 0;
const BOT = 1;
const BOT_NAME = "House bot";
const EN_CODE = { Grass: "G", Fire: "R", Water: "W", Lightning: "L", Psychic: "P", Fighting: "F", Darkness: "D", Metal: "M", Fairy: "Y", Dragon: "N", Colorless: "C" };

const COND_NAME = { asleep: "Asleep", burned: "Burned", confused: "Confused", paralyzed: "Paralyzed", poisoned: "Poisoned" };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function initTcg(deps) {
  const { root, esc, toast } = deps;

  let rules = null;
  let defs = null;
  let loading = null;
  let shown = false;
  let route = { name: "hub" };
  let decks = [];
  let record = { wins: 0, losses: 0 };
  let draft = { open: false, format: "half" };
  let editor = { tab: "cards", query: "", type: "" };
  /** The match on the table: { state, deckId, botSet, sel, sheet, busy, line, setup, shownState, over } */
  let match = null;

  /* ---------- what is kept on this device ---------- */

  const key = (name) => `pp-tcg-${name}-v1:${deps.storeKey()}`;
  function read(name, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key(name))) ?? fallback;
    } catch {
      return fallback;
    }
  }
  function write(name, value) {
    try {
      if (value == null) localStorage.removeItem(key(name));
      else localStorage.setItem(key(name), JSON.stringify(value));
    } catch {
      /* private mode: the session still works, it just isn't kept */
    }
  }
  const saveDecks = () => write("decks", decks);
  const saveMatch = () => write("match", match && match.state.phase !== "over" ? { state: match.state, deckId: match.deckId, botSet: match.botSet, lesson: match.lesson ?? null } : null);

  /* ---------- loading ---------- */

  function load() {
    loading ||= (async () => {
      const [table] = await Promise.all([
        fetch("data/tcg/rules.json", { cache: "no-cache" }).then((r) => {
          if (!r.ok) throw new Error(r.status);
          return r.json();
        }),
        deps.loadOwnedSets(),
      ]);
      rules = table;
      defs = createDefs(deps.findCard, rules);
      decks = read("decks", []).filter((d) => d && d.cards && FORMATS[d.format]);
      record = read("record", record);
    })().catch((err) => {
      loading = null;
      throw err;
    });
    return loading;
  }

  /** Make sure every card of these ids is loaded (a deck can outlive the cards being in memory). */
  async function ensureCards(ids) {
    const missing = new Set();
    for (const id of ids) {
      if (deps.findCard(id)) continue;
      const set = deps.setOf(id);
      if (set) missing.add(set.id);
    }
    await Promise.all([...missing].map((id) => deps.loadSet(id).catch(() => null)));
  }

  const owned = () => deps.owned();
  const cardOf = (id) => deps.findCard(id);
  const img = (id, big = false) => {
    const card = cardOf(id);
    return card ? esc(big ? card.image : card.imageSmall || card.image) : "";
  };

  /* ---------- small parts ---------- */

  const pip = (type) => `<i class="tg-en" data-en="${esc(type)}" title="${esc(type)}">${EN_CODE[type] || "?"}</i>`;
  const pips = (types) => types.map(pip).join("");
  const stageName = (def) => (def.stage === "basic" ? "Basic" : `Evolves from ${def.evolvesFrom}`);

  function hpBar(left, max) {
    const pct = max ? Math.round((left / max) * 100) : 0;
    const tone = pct > 50 ? "" : pct > 20 ? " mid" : " low";
    return `<span class="tg-hp${tone}"><i style="transform:scaleX(${(pct / 100).toFixed(3)})"></i></span>`;
  }

  /* ====================================================================
     Decks
     ==================================================================== */

  function typesOf(deck) {
    const seen = new Set();
    for (const id of Object.keys(deck.cards)) {
      const def = defs(id);
      if (def?.kind === "energy") def.provides.forEach((t) => seen.add(t));
    }
    return [...seen];
  }

  function deckRowHtml(deck) {
    const check = checkDeck(deck, owned(), defs);
    const rulesOf = FORMATS[deck.format];
    const lead = Object.keys(deck.cards).find((id) => defs(id)?.kind === "pokemon");
    return `<article class="rt-box tg-deck" data-deck="${esc(deck.id)}">
      <span class="tg-deck-art">${lead ? `<img src="${img(lead)}" alt="" loading="lazy" decoding="async" />` : ""}</span>
      <div class="tg-deck-main">
        <h3>${esc(deck.name)}</h3>
        <p>${rulesOf.name}, ${check.size} of ${rulesOf.deckSize} cards ${pips(typesOf(deck))}</p>
        <p class="tg-deck-state${check.ok ? " ok" : ""}">${check.ok ? "Ready to play" : esc(check.problems[0])}</p>
      </div>
      <div class="tg-deck-keys">
        <button type="button" class="solid sm" data-play="${esc(deck.id)}"${check.ok ? "" : " disabled"}>Play</button>
        <button type="button" class="ghost sm" data-edit="${esc(deck.id)}">Edit</button>
      </div>
    </article>`;
  }

  function hubHtml() {
    const resume = read("match", null);
    const playable = Object.entries(owned()).filter(([id, n]) => n > 0 && defs(id)?.kind === "pokemon" && defs(id).playable).length;
    const played = record.wins + record.losses;
    return `<div class="tg-page">
      <header class="tg-head">
        <span class="rt-tag">Early build</span>
        <h1 class="page-title tg-title">Play</h1>
        <p class="tg-lede">Build a deck from the cards you own, then take it to the table against the house bot.${played ? ` You've won ${record.wins} of ${plural(played, "match")}.` : ""}</p>
      </header>
      ${resume?.state && resume.state.phase !== "over" ? `<div class="rt-box tg-resume">
        <p><b>${resume.lesson != null ? "Your lesson is waiting" : "A match is waiting"}</b>Turn ${Math.max(1, resume.state.turn)} against the ${BOT_NAME}.</p>
        <button type="button" class="solid sm" data-go="/play/match">Back to the table</button>
      </div>` : ""}
      ${read("learned", false) ? "" : `<div class="rt-box tg-learn">
        <p><b>New to the card game?</b>A practice match on borrowed cards, with a coach for the first turns. About three minutes.</p>
        <button type="button" class="solid sm" data-lesson>Start lesson</button>
      </div>`}
      <section class="tg-block">
        <h2 class="tg-h2">Your decks</h2>
        ${decks.length ? decks.map(deckRowHtml).join("") : `<p class="rt-empty tg-none">No decks yet. ${playable ? `You own ${playable} Pokémon you can play.` : "Rip a few packs first: a deck needs Pokémon you own."}</p>`}
        ${draft.open ? draftHtml(playable) : decks.length < MAX_DECKS ? `<button type="button" class="${decks.length ? "ghost" : "solid rt-go"} tg-new" data-new>New deck</button>` : ""}
      </section>
      <section class="tg-block tg-notes">
        <h2 class="tg-h2">What's in so far</h2>
        <ul>
          <li>Basic Pokémon, evolution, Energy, attacks, Weakness and Resistance, Special Conditions, retreat, prizes.</li>
          <li>Your own cards only, as many copies as you own. Basic Energy is free.</li>
          <li>Your sleeve is your card back and your coin makes the flips.</li>
          <li>Not yet: Trainers, Abilities, and some attack text (the printed damage still lands). Matches against other players come later.</li>
        </ul>
        ${read("learned", false) ? `<button type="button" class="tlink tg-relearn" data-lesson>Run the lesson again</button>` : ""}
      </section>
    </div>`;
  }

  function draftHtml(playable) {
    return `<div class="rt-box tg-draft">
      <h3>New deck</h3>
      <div class="seg tg-seg" role="group" aria-label="Deck size">
        ${Object.values(FORMATS).map((f) => `<button type="button" class="seg-btn${draft.format === f.id ? " on" : ""}" data-format="${f.id}" aria-pressed="${draft.format === f.id}">${f.name}</button>`).join("")}
      </div>
      <p class="tg-draft-note">${draft.format === "half" ? "30 cards, 3 prizes, up to 2 of a card. Quick matches." : "60 cards, 6 prizes, up to 4 of a card. The full game."}</p>
      <div class="tg-draft-keys">
        <button type="button" class="solid" data-build${playable ? "" : " disabled"}>Build it for me</button>
        <button type="button" class="ghost" data-empty>Start empty</button>
        <button type="button" class="tlink" data-cancel>Cancel</button>
      </div>
    </div>`;
  }

  function newDeck(cards, types = []) {
    const base = types.length ? `${types.join(" and ")} deck` : "New deck";
    let name = base;
    for (let n = 2; decks.some((d) => d.name === name); n += 1) name = `${base} ${n}`;
    const deck = { id: `d${Date.now().toString(36)}`, name, format: draft.format, cards };
    decks.push(deck);
    saveDecks();
    draft.open = false;
    return deck;
  }

  function ownedPool() {
    return Object.entries(owned())
      .filter(([, n]) => n > 0)
      .map(([id, n]) => ({ def: defs(id), owned: n }))
      .filter((p) => p.def);
  }

  /* ---------- the editor ---------- */

  const deckById = (id) => decks.find((d) => d.id === id) || null;

  function editorRows(deck) {
    const have = owned();
    const q = editor.query.trim().toLowerCase();
    const rows = [];
    const ids = new Set([...Object.keys(have).filter((id) => have[id] > 0), ...Object.keys(deck.cards)]);
    for (const id of ids) {
      const def = defs(id);
      if (!def || def.kind !== "pokemon" || !def.playable) continue;
      if (editor.tab === "deck" && !deck.cards[id]) continue;
      if (editor.type && !def.types.includes(editor.type)) continue;
      if (q && !def.name.toLowerCase().includes(q)) continue;
      rows.push({ id, def, owned: have[id] || 0, inDeck: deck.cards[id] || 0 });
    }
    const typeAt = (def) => ENERGY_TYPES.indexOf(def.types[0]) + 1 || 99;
    rows.sort((a, b) => typeAt(a.def) - typeAt(b.def) || a.def.name.localeCompare(b.def.name) || a.id.localeCompare(b.id));
    return rows;
  }

  function stepHtml(id, count, room, label, of = "") {
    return `<span class="tg-step">
      <button type="button" data-less="${esc(id)}" aria-label="Take one ${esc(label)} out"${count ? "" : " disabled"}>&minus;</button>
      <b>${count}</b>${of ? `<small>${of}</small>` : ""}
      <button type="button" data-more="${esc(id)}" aria-label="Add one ${esc(label)}"${room > 0 ? "" : " disabled"}>+</button>
    </span>`;
  }

  function tileHtml(deck, row) {
    const { id, def } = row;
    const room = roomFor(deck, id, owned(), defs);
    return `<div class="tg-tile${row.inDeck ? " in" : ""}">
      <button type="button" class="tg-tile-face" data-look="${esc(id)}" aria-label="Look at ${esc(def.name)}">
        <img src="${img(id)}" alt="" loading="lazy" decoding="async" />
        ${row.inDeck ? `<span class="tg-tile-n">${row.inDeck}</span>` : ""}
      </button>
      <b class="tg-tile-name">${esc(def.name)}</b>
      <span class="tg-tile-meta">${def.stage === "basic" ? "Basic" : "Evolution"}, ${def.hp} HP</span>
      ${stepHtml(id, row.inDeck, room, def.name, `of ${row.owned}`)}
    </div>`;
  }

  function energyHtml(deck) {
    const have = owned();
    const rows = FREE_ENERGY.filter((e) => cardOf(e.id)).map((e) => ({ id: e.id, type: e.type, n: deck.cards[e.id] || 0 }));
    // Energy prints the player owns sit in decks made before; they still count.
    for (const [id, n] of Object.entries(deck.cards)) {
      const def = defs(id);
      if (def?.kind === "energy" && !isFreeEnergy(id)) rows.push({ id, type: def.provides[0], n, ownedPrint: have[id] || 0 });
    }
    return `<div class="rt-box tg-energy">
      <h3>Basic Energy <small>free, as many as you need</small></h3>
      ${rows.map((r) => `<div class="tg-energy-row">${pip(r.type)}<span>${esc(r.type)}</span>${stepHtml(r.id, r.n, roomFor(deck, r.id, have, defs), `${r.type} Energy`)}</div>`).join("")}
    </div>`;
  }

  function summaryHtml(deck) {
    const check = checkDeck(deck, owned(), defs);
    const pct = Math.min(1, check.size / check.need);
    const mons = Object.entries(deck.cards).reduce((n, [id, c]) => n + (defs(id)?.kind === "pokemon" ? c : 0), 0);
    return `<div class="tg-sum-top">
        <span class="tg-sum-count"><b>${check.size}</b> of ${check.need}</span>
        <span class="tg-sum-split">${mons} Pokémon, ${check.size - mons} Energy</span>
        <button type="button" class="solid sm" data-play="${esc(deck.id)}"${check.ok ? "" : " disabled"}>Play</button>
      </div>
      <span class="bar tg-sum-bar${check.size > check.need ? " over" : ""}"><i style="transform:scaleX(${pct.toFixed(3)})"></i></span>
      <p class="tg-sum-state${check.ok ? " ok" : ""}">${check.ok ? "Ready to play." : esc(check.problems.slice(0, 2).join(" "))}</p>`;
  }

  function gridHtml(deck) {
    const rows = editorRows(deck);
    const body = rows.length
      ? `<div class="tg-grid">${rows.map((row) => tileHtml(deck, row)).join("")}</div>`
      : `<p class="rt-empty tg-none">${editor.tab === "deck" ? "No Pokémon in this deck yet. They're under Your cards." : editor.query || editor.type ? "Nothing matches that." : "You don't own any Pokémon that can be played yet."}</p>`;
    return `${body}${energyHtml(deck)}`;
  }

  function editorHtml(deck) {
    const have = owned();
    const types = ENERGY_TYPES.concat("Dragon", "Colorless").filter((t) => Object.keys(have).some((id) => have[id] > 0 && defs(id)?.kind === "pokemon" && defs(id).types.includes(t)));
    const inDeck = Object.keys(deck.cards).filter((id) => defs(id)?.kind === "pokemon").length;
    return `<div class="tg-page tg-editor" data-deck="${esc(deck.id)}">
      <header class="tg-head">
        <button type="button" class="tlink tg-back" data-go="/play">Decks</button>
        <label class="tg-name"><span class="sr-only">Deck name</span><input type="text" class="search" id="tg-name" maxlength="32" value="${esc(deck.name)}" autocomplete="off" /></label>
        <p class="tg-lede">${FORMATS[deck.format].name}: ${FORMATS[deck.format].deckSize} cards, ${FORMATS[deck.format].prizes} prizes, up to ${FORMATS[deck.format].copies} of a card.</p>
      </header>
      <div class="rt-box tg-sum rt-still" id="tg-sum">${summaryHtml(deck)}</div>
      <div class="tg-tools">
        <div class="seg tg-seg" role="group" aria-label="Show">
          <button type="button" class="seg-btn${editor.tab === "cards" ? " on" : ""}" data-tab="cards" aria-pressed="${editor.tab === "cards"}">Your cards</button>
          <button type="button" class="seg-btn${editor.tab === "deck" ? " on" : ""}" data-tab="deck" aria-pressed="${editor.tab === "deck"}">In the deck${inDeck ? ` (${inDeck})` : ""}</button>
        </div>
        <div class="tg-find">
          <input type="search" class="search" id="tg-q" placeholder="Search your Pokémon" value="${esc(editor.query)}" autocomplete="off" aria-label="Search your Pokémon" />
          <select class="filter" id="tg-type" aria-label="Type">
            <option value="">All types</option>
            ${types.map((t) => `<option value="${t}"${editor.type === t ? " selected" : ""}>${t}</option>`).join("")}
          </select>
        </div>
      </div>
      <div id="tg-grid">${gridHtml(deck)}</div>
      <div class="tg-foot">
        <button type="button" class="ghost sm" data-fill>Fill the rest with Energy</button>
        <button type="button" class="ghost sm danger" data-delete>Delete deck</button>
      </div>
    </div>`;
  }

  function repaintEditor(deck, { tools = false } = {}) {
    if (tools) return paint();
    const sum = root.querySelector("#tg-sum");
    const grid = root.querySelector("#tg-grid");
    if (sum) sum.innerHTML = summaryHtml(deck);
    if (grid) grid.innerHTML = gridHtml(deck);
  }

  function changeCount(deck, id, by) {
    if (by > 0 && roomFor(deck, id, owned(), defs) < 1) return;
    const next = Math.max(0, (deck.cards[id] || 0) + by);
    if (next) deck.cards[id] = next;
    else delete deck.cards[id];
    saveDecks();
    repaintEditor(deck);
  }

  /** Top the deck up with Energy, split by what its attacks ask for. */
  function fillEnergy(deck) {
    const space = FORMATS[deck.format].deckSize - deckSize(deck);
    if (space <= 0) return toast("The deck is full.");
    const asks = {};
    for (const [id, n] of Object.entries(deck.cards)) {
      const def = defs(id);
      if (def?.kind !== "pokemon") continue;
      for (const attack of def.attacks) for (const c of attack.cost) if (c !== "Colorless" && FREE_ENERGY.some((e) => e.type === c)) asks[c] = (asks[c] || 0) + n;
    }
    const kinds = Object.keys(asks).sort((a, b) => asks[b] - asks[a]).slice(0, 2);
    if (!kinds.length) kinds.push("Grass");
    const total = kinds.reduce((n, t) => n + asks[t], 0) || 1;
    let left = space;
    kinds.forEach((type, i) => {
      const n = i === kinds.length - 1 ? left : Math.round((space * (asks[type] || 1)) / total);
      const id = FREE_ENERGY.find((e) => e.type === type).id;
      deck.cards[id] = (deck.cards[id] || 0) + Math.min(left, n);
      left -= Math.min(left, n);
    });
    saveDecks();
    repaintEditor(deck);
  }

  /* ---------- the close look at one card ---------- */

  function lookHtml(id, extra = "") {
    const def = defs(id);
    const card = cardOf(id);
    if (!def || !card) return "";
    const side = (s) => (s ? `${pip(s.type)} ${s.op === "x" ? "×" : s.op}${s.n}` : "None");
    const body = def.kind !== "pokemon" ? "" : `
      <dl class="tg-look-facts">
        <div><dt>Weakness</dt><dd>${side(def.weakness)}</dd></div>
        <div><dt>Resistance</dt><dd>${side(def.resistance)}</dd></div>
        <div><dt>Retreat</dt><dd>${def.retreat ? pips(Array(def.retreat).fill("Colorless")) : "Free"}</dd></div>
      </dl>
      ${def.prizes > 1 ? `<p class="tg-look-note">Gives up ${def.prizes} prize cards when Knocked Out.</p>` : ""}
      ${def.notes.map((n) => `<p class="tg-look-note">${esc(n)}.</p>`).join("")}`;
    return `<div class="tg-sheet-bg" data-close></div>
      <div class="tg-sheet tg-look" role="dialog" aria-label="${esc(def.name)}">
        <div class="tg-look-face">${deps.face(card)}</div>
        <div class="tg-look-side">
          <h3>${esc(def.name)}</h3>
          ${def.kind === "pokemon" ? `<p class="tg-look-meta">${stageName(def)}, ${def.hp} HP</p>` : ""}
          ${extra}${body}
          <button type="button" class="ghost sm" data-close>Close</button>
        </div>
      </div>`;
  }

  function openLook(id, extra = "") {
    closeLook();
    const holder = document.createElement("div");
    holder.className = `tg-look-holder${match && route.name === "match" ? " rt-dark" : ""}`;
    holder.innerHTML = lookHtml(id, extra);
    if (!holder.firstChild) return;
    (root.querySelector(".tg-table") || root).appendChild(holder);
  }
  function closeLook() {
    root.querySelector(".tg-look-holder")?.remove();
  }

  /* ====================================================================
     The table
     ==================================================================== */

  async function startMatch(deckId) {
    const deck = deckById(deckId);
    if (!deck) return;
    await ensureCards(Object.keys(deck.cards));
    const check = checkDeck(deck, owned(), defs);
    if (!check.ok) return toast(check.problems[0]);
    // The bot plays the ordinary cards of the set most of your Pokémon come from, so the eras match.
    const count = {};
    for (const [id, n] of Object.entries(deck.cards)) {
      const set = defs(id)?.kind === "pokemon" && deps.setOf(id);
      if (set) count[set.id] = (count[set.id] || 0) + n;
    }
    const sets = Object.keys(count).sort((a, b) => count[b] - count[a]);
    let botDeck = null;
    let botSet = "";
    for (const setId of sets) {
      const list = await deps.loadSet(setId).catch(() => null);
      botDeck = list && buildBotDeck(list.map((c) => defs(c.id)), deck.format);
      if (botDeck) {
        botSet = setId;
        break;
      }
    }
    if (!botDeck) return toast("Couldn't build the bot a deck from your sets. Try another deck.");
    const seed = (Math.random() * 0xffffffff) >>> 0;
    const state = createGame({ decks: [deckList(deck), deckList(botDeck)], names: [deps.playerName(), BOT_NAME], format: deck.format, seed }, defs);
    match = { state, deckId, botSet, sel: null, sheet: "", busy: false, line: "", setup: { active: null, bench: [] }, opening: true, over: false };
    // The bot sets up at once; its cards stay face down until both are ready.
    apply(state, botAction(state, BOT, defs), defs);
    saveMatch();
    deps.navigate("/play/match");
  }

  /** The lesson: a stacked practice match on borrowed cards, with the coach (js/tcg/tutorial.js). */
  async function startLesson() {
    await deps.loadSet(LESSON_SET).catch(() => null);
    if (!LESSON_CARDS.every((id) => defs(id))) return toast("Couldn't load the lesson. Check your connection and try again.");
    const state = createLesson([deps.playerName(), BOT_NAME], defs);
    match = { state, deckId: null, botSet: LESSON_SET, lesson: 0, sel: null, sheet: "", busy: false, line: "", setup: { active: null, bench: [] }, opening: false, over: false };
    apply(state, botAction(state, BOT, defs), defs);
    saveMatch();
    if (route.name === "match") paint();
    else deps.navigate("/play/match");
  }

  const inLesson = () => match?.lesson != null && match.lesson < LESSON.length;
  const lessonStep = () => (inLesson() ? LESSON[match.lesson] : null);
  /** The step on show: the coach keeps quiet while cards are moving or the bot is playing. */
  function coachStep() {
    const step = lessonStep();
    if (!step || match.busy || match.over || match.state.phase === "over") return null;
    return match.state.phase === "setup" || (myTurn() && !match.state.pending.length) ? step : null;
  }
  function lessonNext() {
    match.lesson += 1;
    saveMatch();
  }
  /** While the coach is waiting for one thing, only that thing goes through. */
  function coachAllows(action) {
    const step = lessonStep();
    if (!step || step.free || action.type === "promote") return true;
    if (step.want?.(action)) return true;
    toast(step.want || step.pick ? step.nudge : "Tap Next when you've read it.");
    return false;
  }

  function coachHtml() {
    const step = coachStep();
    if (!step) return "";
    const talk = !step.want && !step.pick;
    return `<div class="tg-coach" role="status">
      <span class="tg-coach-bar" aria-hidden="true"><i style="transform:scaleX(${((match.lesson + 1) / LESSON.length).toFixed(3)})"></i></span>
      <p>${esc(step.say)}</p>
      ${talk ? `<button type="button" class="solid sm" data-act="coach-next">${step.free ? "Got it" : "Next"}</button>` : ""}
    </div>`;
  }

  async function resumeMatch() {
    const saved = read("match", null);
    if (!saved?.state || saved.state.phase === "over") return false;
    await ensureCards(Object.values(saved.state.cards));
    if (saved.lesson != null) await deps.loadSet(LESSON_SET).catch(() => null);
    if (!Object.values(saved.state.cards).every((id) => defs(id))) {
      write("match", null);
      return false;
    }
    match = { state: saved.state, deckId: saved.deckId, botSet: saved.botSet, lesson: saved.lesson ?? null, sel: null, sheet: "", busy: false, line: "", setup: { active: null, bench: [] }, opening: false, over: false };
    return true;
  }

  const S = () => match.shownState || match.state;
  const d = (uid) => defOf(match.state, uid, defs);
  const myTurn = () => match.state.phase === "main" && match.state.current === ME && !match.state.pending.length && !match.state.ending;
  const legal = () => (match.busy ? [] : legalActions(match.state, ME, defs));

  function monHtml(state, p, slot, spot, { big = false, target = false, chosen = false } = {}) {
    const def = defOf(state, slot.uid, defs);
    const left = hpLeft(state, slot, defs);
    const label = `${p === ME ? "Your" : "Their"} ${def.name}, ${left} of ${def.hp} HP`;
    return `<button type="button" class="tg-mon${big ? " big" : ""}${target ? " is-target" : ""}${chosen ? " is-chosen" : ""}" data-p="${p}" data-spot="${spot}" aria-label="${esc(label)}">
      <img src="${img(state.cards[slot.uid], big)}" alt="" draggable="false" decoding="async" />
      ${slot.damage ? `<span class="tg-dmg">${slot.damage}</span>` : ""}
      ${big ? "" : `${hpBar(left, def.hp)}<span class="tg-pips">${pips(energyOf(state, slot, defs))}</span>`}
    </button>`;
  }

  function hudHtml(state, p) {
    const slot = state.players[p].active;
    if (!slot || !slot.uid) return `<div class="tg-hud" data-p="${p}"></div>`;
    const def = defOf(state, slot.uid, defs);
    const left = hpLeft(state, slot, defs);
    const energy = energyOf(state, slot, defs);
    return `<div class="tg-hud" data-p="${p}">
      <b class="tg-hud-name">${esc(def.name)}</b>
      <span class="tg-pips">${energy.length ? pips(energy) : `<small>No Energy</small>`}</span>
      <span class="tg-hud-hp"><em>HP</em>${hpBar(left, def.hp)}<span class="num">${left}/${def.hp}</span></span>
      ${conditionsOn(slot).length ? `<span class="tg-conds">${conditionsOn(slot).map((c) => `<i class="tg-cond" data-cond="${c}">${COND_NAME[c]}</i>`).join("")}</span>` : ""}
    </div>`;
  }

  function prizesHtml(state, p) {
    const left = state.phase === "setup" ? state.rules.prizes : state.players[p].prizes.length;
    return `<span class="tg-prizes" aria-label="${plural(left, "prize card")} left">${Array.from({ length: state.rules.prizes }, (_, i) => `<i class="rt-ball${i < left ? "" : " e"}"></i>`).join("")}</span>`;
  }

  /** What the player is being asked to do, and the keys for it. */
  function promptOf() {
    const state = match.state;
    if (match.busy) return { text: match.line || "", keys: "" };
    if (state.phase === "setup") {
      if (!match.setup.active) return { text: "Choose your Active Pokémon from your hand.", keys: "" };
      return { text: "Add Benched Pokémon if you like.", keys: `<button type="button" class="solid sm" data-act="start">Start</button>` };
    }
    if (state.pending[0]?.player === ME) return { text: "Choose your new Active Pokémon.", keys: "" };
    if (!myTurn()) return { text: match.line || `${BOT_NAME} is thinking`, keys: "" };
    const sel = match.sel;
    if (sel?.kind === "retreat") return { text: "Who comes in? Tap a Benched Pokémon.", keys: `<button type="button" class="ghost sm" data-act="cancel">Cancel</button>` };
    if (sel?.kind === "hand") {
      const def = d(sel.uid);
      const acts = legal().filter((a) => a.uid === sel.uid || (a.type !== "end" && state.cards[a.uid] === state.cards[sel.uid]));
      let text = `${def.name} can't be played right now.`;
      if (acts.some((a) => a.type === "bench")) text = `${def.name}: tap your Bench to play it.`;
      else if (acts.some((a) => a.type === "evolve")) text = `${def.name}: tap the Pokémon it evolves from.`;
      else if (acts.some((a) => a.type === "attach")) text = `${def.name}: tap a Pokémon to attach it.`;
      else if (def.kind === "energy") text = "One Energy a turn, and you've attached yours.";
      else if (def.kind === "pokemon" && def.stage === "basic") text = "Your Bench is full.";
      else if (def.kind === "pokemon") text = `${def.name} evolves from ${def.evolvesFrom}, a turn after it comes into play.`;
      return { text, keys: `<button type="button" class="ghost sm" data-act="look">View</button>` };
    }
    const canAttack = usableAttacks(state, ME, defs).length > 0;
    return {
      text: state.turn === 1 ? "Going first: no attack this turn." : canAttack ? "Tap your Active Pokémon to attack." : "Play cards, then end your turn.",
      keys: `<button type="button" class="${canAttack ? "ghost" : "solid"} sm" data-act="end">End turn</button>`,
    };
  }

  function tableHtml() {
    const state = S();
    const real = match.state;
    const me = state.players[ME];
    const foe = state.players[BOT];
    const setup = real.phase === "setup";
    const coach = coachStep();
    // With the coach waiting on one action, only that action's cards and targets light up.
    const acts = legal().filter((a) => !coach?.want || a.type === "promote" || coach.want(a));
    const sel = match.sel;
    const selId = sel?.kind === "hand" ? real.cards[sel.uid] : "";
    const targets = new Set();
    if (sel?.kind === "hand") for (const a of acts) if ((a.type === "evolve" || a.type === "attach") && real.cards[a.uid] === selId) targets.add(a.spot);
    if (sel?.kind === "retreat") for (const a of acts) if (a.type === "retreat") targets.add(a.to);
    if (real.pending[0]?.player === ME) for (const a of acts) if (a.type === "promote") targets.add(a.spot);
    const benchOpen = sel?.kind === "hand" && acts.some((a) => a.type === "bench" && real.cards[a.uid] === selId);

    // During setup your picks show where they will stand; theirs stay face down.
    const myActive = setup ? (match.setup.active ? { uid: match.setup.active, under: [], energy: [], damage: 0 } : null) : me.active;
    const myBench = setup ? match.setup.bench.map((uid) => ({ uid, under: [], energy: [], damage: 0 })) : me.bench;
    const hand = setup ? me.hand.filter((uid) => uid !== match.setup.active && !match.setup.bench.includes(uid)) : me.hand;
    const back = deps.backHtml();
    const foeBack = `<span class="tg-back"><img src="assets/cards/shared/card-back-sm.webp" alt="" /></span>`;
    const prompt = promptOf();
    const playable = new Set();
    if (setup) {
      for (const uid of hand) if (d(uid).kind === "pokemon" && d(uid).stage === "basic" && (!inLesson() || lessonStep().pick?.(d(uid)))) playable.add(uid);
    } else if (coach && !coach.want && !coach.free) {
      /* the coach is talking: nothing to play yet */
    } else {
      for (const a of acts) if (a.uid) for (const uid of hand) if (real.cards[uid] === real.cards[a.uid]) playable.add(uid);
    }

    const point = coach && !sel && !match.sheet ? coach : null;
    const pointHand = point && (point.pick || point.want?.({ type: "attach", spot: ACTIVE }) || point.want?.({ type: "attach", spot: 0 }) || point.want?.({ type: "evolve" }));
    const pointActive = point?.want?.({ type: "attack" });
    return `<div class="tg-table rt-dark rt-still${myTurn() ? " my-turn" : ""}${coach ? " has-coach" : ""}${pointHand ? " coach-hand" : ""}${pointActive ? " coach-active" : ""}${coach?.want?.({ type: "end" }) || coach?.want?.({ type: "place" }) ? " coach-key" : ""}" data-phase="${real.phase}">
      <div class="tg-bar tg-bar-foe">
        <button type="button" class="tg-leave" data-act="leave" aria-label="Leave the match">${match.leaving ? "Concede?" : "Leave"}</button>
        <b class="tg-who">${esc(foe.name)}</b>
        ${prizesHtml(state, BOT)}
        <span class="tg-count" title="Cards in hand"><i class="tg-ic hand"></i>${foe.hand.length}</span>
        <span class="tg-count" title="Cards in deck"><i class="tg-ic deck"></i>${foe.deck.length}</span>
      </div>
      <div class="tg-bench tg-bench-foe">
        ${foe.bench.map((slot, i) => (setup ? foeBack : monHtml(state, BOT, slot, i))).join("")}
      </div>
      <div class="tg-arena">
        <span class="tg-slab" aria-hidden="true"></span>
        <div class="tg-spot tg-spot-foe" data-p="1">${foe.active ? (setup ? foeBack : monHtml(state, BOT, foe.active, ACTIVE, { big: true })) : ""}</div>
        <div class="tg-info tg-info-foe">
          ${setup ? `<div class="tg-hud" data-p="1"><b class="tg-hud-name">${esc(foe.name)}</b><span class="tg-pips"><small>Ready when you are</small></span></div>` : hudHtml(state, BOT)}
        </div>
        <div class="tg-spot tg-spot-me" data-p="0">${myActive ? monHtml(state, ME, myActive, ACTIVE, { big: true, target: targets.has(ACTIVE) }) : `<span class="tg-hole">Active</span>`}</div>
        <div class="tg-info tg-info-me">
          <p class="tg-line" aria-live="polite">${esc(match.busy || !myTurn() ? "" : match.line || "")}</p>
          ${setup ? "" : hudHtml(state, ME)}
        </div>
      </div>
      <div class="tg-bench tg-bench-me${benchOpen ? " is-open" : ""}" data-bench>
        ${myBench.map((slot, i) => monHtml(state, ME, slot, i, { target: targets.has(i) })).join("")}
        ${myBench.length < state.rules.bench ? `<span class="tg-hole${benchOpen ? " is-target" : ""}" data-bench>${benchOpen ? "Play here" : "Bench"}</span>` : ""}
      </div>
      <div class="tg-bar tg-bar-me">
        <b class="tg-who">${esc(me.name)}</b>
        ${prizesHtml(state, ME)}
        <span class="tg-count" title="Cards in your deck"><span class="tg-mini">${back}</span>${me.deck.length}</span>
        <span class="tg-count" title="Cards in your discard pile"><i class="tg-ic bin"></i>${me.discard.length}</span>
      </div>
      <div class="tg-hand" style="--n:${hand.length}">
        ${hand.map((uid) => `<button type="button" class="tg-card${sel?.kind === "hand" && sel.uid === uid ? " is-chosen" : ""}${playable.has(uid) ? " can" : ""}" data-hand="${uid}" aria-label="${esc(d(uid).name)}"><img src="${img(real.cards[uid])}" alt="" draggable="false" /></button>`).join("")}
      </div>
      <div class="tg-prompt">
        <p>${esc(prompt.text)}</p>
        <div class="tg-keys">${prompt.keys}</div>
      </div>
      ${coachHtml()}
      ${sheetHtml()}
    </div>`;
  }

  function attackSheetHtml() {
    const state = match.state;
    const slot = state.players[ME].active;
    const def = d(slot.uid);
    const usable = new Set(usableAttacks(state, ME, defs));
    const units = energyOf(state, slot, defs);
    const retreat = canRetreat(state, ME, defs) && myTurn();
    const held = conditionsOn(slot).find((c) => c === "asleep" || c === "paralyzed");
    const why = state.turn === 1 ? "No attack on the first turn" : held ? `${COND_NAME[held]}: can't attack` : "Not enough Energy";
    return `<div class="tg-sheet-bg" data-act="cancel"></div>
      <div class="tg-sheet tg-attacks" role="dialog" aria-label="${esc(def.name)}">
        <header><h3>${esc(def.name)}</h3><span class="tg-pips">${units.length ? pips(units) : "<small>No Energy attached</small>"}</span></header>
        ${def.attacks.map((attack, i) => `<button type="button" class="tg-atk" data-attack="${i}"${usable.has(i) && myTurn() ? "" : " disabled"}>
          <span class="tg-atk-top"><span class="tg-pips">${attack.cost.length ? pips(attack.cost) : "<small>Free</small>"}</span><b>${esc(attack.name)}</b><em>${attack.damage || ""}</em></span>
          ${attack.text ? `<span class="tg-atk-text${attack.plain ? " off" : ""}">${attack.plain ? "Text not live yet: " : ""}${esc(attack.text)}</span>` : ""}
          ${usable.has(i) || !myTurn() ? "" : `<span class="tg-atk-why">${why}</span>`}
        </button>`).join("")}
        <div class="tg-sheet-keys">
          <button type="button" class="ghost sm" data-act="retreat"${retreat ? "" : " disabled"}>Retreat ${def.retreat ? pips(Array(def.retreat).fill("Colorless")) : "(free)"}</button>
          <button type="button" class="ghost sm" data-act="look-active">View card</button>
        </div>
      </div>`;
  }

  function overHtml() {
    const state = match.state;
    const won = state.winner === ME;
    const tie = state.winner == null;
    const why = {
      prizes: won ? "You took your last prize card." : `${BOT_NAME} took its last prize card.`,
      bench: won ? "They had no Pokémon left to send out." : "You had no Pokémon left to send out.",
      deck: won ? "Their deck ran out." : "Your deck ran out.",
      concede: won ? `${BOT_NAME} gave up.` : "You conceded.",
      tie: "Both sides finished at once.",
    }[state.reason];
    if (match.lesson != null) {
      return `<div class="tg-sheet-bg"></div>
      <div class="tg-sheet tg-over" role="dialog" aria-label="Lesson over">
        <h2>${won ? "Lesson done" : "Lesson over"}</h2>
        <p>${esc(why)} ${won ? "That's the whole loop: Energy, evolve, attack, prizes. Build a deck from your own cards and play it for real." : "Run it again, or build a deck from your own cards and learn as you go."}</p>
        <div class="tg-sheet-keys">
          <button type="button" class="solid rt-go" data-go="/play">Build a deck</button>
          <button type="button" class="ghost" data-act="again">Run it again</button>
        </div>
      </div>`;
    }
    return `<div class="tg-sheet-bg"></div>
      <div class="tg-sheet tg-over" role="dialog" aria-label="Match over">
        <h2>${tie ? "A tie" : won ? "You win" : "You lose"}</h2>
        <p>${esc(why)} ${plural(state.turn, "turn")}.</p>
        <div class="tg-sheet-keys">
          <button type="button" class="solid rt-go" data-act="again">Play again</button>
          <button type="button" class="ghost" data-go="/play">Decks</button>
        </div>
      </div>`;
  }

  function openingHtml() {
    const state = match.state;
    const faces = deps.coinFaces();
    const mull = state.players.map((s, p) => (s.mulligans ? `${p === ME ? "You" : BOT_NAME} had no Basic Pokémon ${s.mulligans === 1 ? "once" : `${s.mulligans} times`}, so ${p === ME ? BOT_NAME : "you"} will draw ${plural(s.mulligans, "extra card")}.` : "")).filter(Boolean);
    return `<div class="tg-sheet-bg"></div>
      <div class="tg-sheet tg-opening" role="dialog" aria-label="Coin flip">
        <p class="tg-opening-lab">Flip for the first turn</p>
        <div class="tg-coin">${coinStageHTML({ heads: faces?.heads || null, tails: faces?.tails || null, size: 132, rest: "heads" })}</div>
        <h2 id="tg-first">&nbsp;</h2>
        ${mull.map((m) => `<p>${esc(m)}</p>`).join("")}
        <div class="tg-sheet-keys"><button type="button" class="solid rt-go" data-act="opened" disabled>Choose your Pokémon</button></div>
      </div>`;
  }

  function flipSheetHtml() {
    const faces = deps.coinFaces();
    return `<div class="tg-sheet tg-flip" role="status">
        <div class="tg-coin">${coinStageHTML({ heads: faces?.heads || null, tails: faces?.tails || null, size: 104, rest: "heads" })}</div>
        <h2 id="tg-flip-text">&nbsp;</h2>
      </div>`;
  }

  function sheetHtml() {
    if (match.state.phase === "over" && match.over) return overHtml();
    if (match.opening) return openingHtml();
    if (match.sheet === "attacks") return attackSheetHtml();
    if (match.sheet === "flip") return flipSheetHtml();
    return "";
  }

  function paintTable() {
    if (!shown || route.name !== "match") return;
    const scroll = root.querySelector(".tg-hand")?.scrollLeft || 0;
    root.innerHTML = tableHtml();
    const hand = root.querySelector(".tg-hand");
    if (hand) hand.scrollLeft = scroll;
    if (match.opening && !match.openingRun) runOpening();
  }

  async function runOpening() {
    match.openingRun = true;
    const coin = root.querySelector(".tg-opening .cf-coin");
    const mine = match.state.first === ME;
    await sleep(350);
    // Heads is yours: the coin lands on the side of whoever goes first.
    await flipCoin(coin, mine ? "heads" : "tails", { ms: 1700, motion: !deps.reduceMotion() });
    if (!match?.opening) return;
    const text = root.querySelector("#tg-first");
    if (text) text.textContent = mine ? "You go first" : `${BOT_NAME} goes first`;
    const lab = root.querySelector(".tg-opening-lab");
    if (lab) lab.textContent = mine ? "Heads" : "Tails";
    root.querySelector('[data-act="opened"]')?.removeAttribute("disabled");
  }

  /* ---------- telling what happened ---------- */

  function tell(event) {
    const state = match.state;
    const who = (p) => (p === ME ? "You" : BOT_NAME);
    const name = (uid) => d(uid)?.name || "a card";
    switch (event.t) {
      case "turn": return event.p === ME ? "Your turn." : `${BOT_NAME}'s turn.`;
      case "draw": return event.p === ME ? `You drew ${event.uids.length === 1 ? name(event.uids[0]) : plural(event.uids.length, "card")}.` : `${BOT_NAME} drew ${event.uids.length === 1 ? "a card" : plural(event.uids.length, "card")}.`;
      case "bench": return `${who(event.p)} benched ${name(event.uid)}.`;
      case "evolve": return `${who(event.p)} evolved into ${name(event.uid)}.`;
      case "attach": return `${who(event.p)} attached ${name(event.uid)}.`;
      case "retreat": return `${who(event.p)} retreated.`;
      case "attack": return `${name(event.uid)} used ${event.name}.`;
      case "condition": return `${event.p === ME ? "Your" : "Their"} Active Pokémon is now ${COND_NAME[event.kind]}.`;
      case "cure": return `${event.p === ME ? "Your" : "Their"} Active Pokémon is no longer ${COND_NAME[event.kind]}.`;
      case "flip": return event.results.length === 1 ? (event.results[0] ? "Heads." : "Tails.") : `${event.results.filter(Boolean).length} heads of ${event.results.length}.`;
      case "miss": return "The attack did nothing.";
      case "damage":
        if (event.why === "poisoned" || event.why === "burned") return `${COND_NAME[event.why]}: ${event.n} damage to ${event.p === ME ? "your" : "their"} Active Pokémon.`;
        if (event.why === "confused") return "Confused: it hurt itself for 30.";
        return `${event.n} damage${event.weak ? ", it's weak to that" : ""}${event.resist ? ", resisted" : ""}${event.self ? " to itself" : ""}.`;
      case "heal": return `Healed ${event.n}.`;
      case "ko": return `${name(event.uid)} was Knocked Out.`;
      case "prize": return `${who(event.p)} took ${plural(event.uids.length, "prize card")}.`;
      case "promote": return `${who(event.p)} sent out ${name(state.players[event.p].active.uid)}.`;
      default: return "";
    }
  }

  function cue(selector, cls, ms = 520) {
    const el = root.querySelector(selector);
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), ms);
  }

  function popDamage(p, text, tone = "") {
    const spot = root.querySelector(`.tg-spot[data-p="${p}"]`);
    if (!spot) return;
    const el = document.createElement("span");
    el.className = `tg-pop ${tone}`;
    el.textContent = text;
    spot.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  async function showFlips(results) {
    for (const heads of results.slice(0, 4)) {
      match.sheet = "flip";
      paintTable();
      const coin = root.querySelector(".tg-flip .cf-coin");
      await flipCoin(coin, heads ? "heads" : "tails", { ms: 1100, motion: !deps.reduceMotion() });
      const text = root.querySelector("#tg-flip-text");
      if (text) text.textContent = heads ? "Heads" : "Tails";
      await sleep(420);
    }
    match.sheet = "";
  }

  /**
   * Do one action and play it back. An attack is shown in beats: the lunge,
   * any coin, the hit on the board as it was, then the board as it is now.
   */
  async function run(action) {
    const state = match.state;
    const fast = deps.reduceMotion();
    const wait = (ms) => sleep(fast ? Math.min(ms, 120) : ms);
    if (action.player === ME && !coachAllows(action)) return false;
    const before = action.type === "attack" ? JSON.parse(JSON.stringify(state)) : null;
    let events;
    try {
      events = apply(state, action, defs);
    } catch (err) {
      if (err instanceof RuleError) toast(err.message);
      else throw err;
      return false;
    }
    if (action.player === ME && lessonStep()?.want?.(action)) match.lesson += 1;
    match.busy = true;
    match.sel = null;
    match.sheet = "";
    match.leaving = false;
    saveMatch();
    const say = (event) => {
      const text = tell(event);
      if (text) match.line = text;
    };

    if (before) {
      const p = action.player;
      match.shownState = before;
      say(events.find((e) => e.t === "attack"));
      paintTable();
      cue(`.tg-spot[data-p="${p}"] .tg-mon`, p === ME ? "lunge-up" : "lunge-down", 420);
      await wait(380);
      for (const flips of events.filter((e) => e.t === "flip")) {
        say(flips);
        await showFlips(flips.results);
      }
      for (const event of events) {
        if (event.why === "poisoned" || event.why === "burned") continue; // the checkup, told after the attack
        if (event.t === "damage" || event.t === "heal") {
          const slot = before.players[event.p].active;
          if (slot) slot.damage = Math.max(0, slot.damage + (event.t === "heal" ? -event.n : event.n));
          say(event);
          paintTable();
          popDamage(event.p, event.t === "heal" ? `+${event.n}` : `-${event.n}`, event.t === "heal" ? "heal" : event.weak ? "weak" : "");
          if (event.t === "damage") {
            cue(`.tg-spot[data-p="${event.p}"] .tg-mon`, "hit", 420);
            deps.buzz?.(event.weak ? [18, 30, 18] : 14);
          }
          await wait(620);
        } else if (event.t === "miss") {
          say(event);
          paintTable();
          await wait(520);
        } else if (event.t === "ko") {
          say(event);
          paintTable();
          cue(event.spot === ACTIVE ? `.tg-spot[data-p="${event.p}"] .tg-mon` : `.tg-bench .tg-mon[data-p="${event.p}"][data-spot="${event.spot}"]`, "ko", 700);
          await wait(640);
        } else if (event.t === "prize") {
          say(event);
          paintTable();
          await wait(420);
        }
      }
      match.shownState = null;
    }

    for (const event of events) {
      if (before && ["attack", "flip", "damage", "heal", "miss", "ko", "prize"].includes(event.t) && !["poisoned", "burned"].includes(event.why)) continue;
      if (event.t === "over") continue;
      say(event);
      paintTable();
      if (event.t === "turn") {
        cue(".tg-table", event.p === ME ? "turn-me" : "turn-foe", 900);
        await wait(520);
      } else if (event.why === "poisoned" || event.why === "burned" || event.t === "cure" || event.t === "condition") {
        if (event.t === "damage") cue(`.tg-spot[data-p="${event.p}"] .tg-mon`, "hit", 420);
        await wait(620);
      } else if (event.p === BOT || event.t === "promote") {
        await wait(480);
      } else if (event.t === "draw" && event.p === ME) {
        cue(".tg-hand .tg-card:last-child", "drawn", 500);
        await wait(260);
      }
    }

    match.busy = false;
    if (state.phase === "over") return finish();
    paintTable();
    botTurn();
    return true;
  }

  function finish() {
    if (match.over) return true;
    match.over = true;
    match.busy = false;
    if (match.lesson != null) write("learned", true);
    else if (match.state.winner === ME) record.wins += 1;
    else if (match.state.winner === BOT) record.losses += 1;
    write("record", record);
    write("match", null);
    paintTable();
    return true;
  }

  /** The bot plays while it has something to do: its turn, or its new Active Pokémon. */
  async function botTurn() {
    const state = match.state;
    const mine = match;
    while (mine === match && shown && state.phase === "main" && !match.busy) {
      const waiting = state.pending[0];
      const botsMove = waiting ? waiting.player === BOT : state.current === BOT;
      if (!botsMove) return;
      const action = botAction(state, BOT, defs);
      if (!action) return;
      match.busy = true;
      paintTable();
      await sleep(deps.reduceMotion() ? 150 : 560);
      if (mine !== match) return;
      match.busy = false;
      // run() calls back into botTurn when it is done, so one step is enough here.
      await run(action);
      return;
    }
  }

  /* ---------- taps on the table ---------- */

  function tapHand(uid) {
    const state = match.state;
    if (match.busy) return;
    if (state.phase === "setup") {
      const def = d(uid);
      if (def.kind !== "pokemon" || def.stage !== "basic") return toast("Only Basic Pokémon can start in play.");
      const step = lessonStep();
      if (step && !step.pick?.(def)) return toast(step.pick || step.want ? step.nudge : "Tap Next when you've read it.");
      if (step) lessonNext();
      if (!match.setup.active) match.setup.active = uid;
      else if (match.setup.bench.length < state.rules.bench) match.setup.bench.push(uid);
      else return toast("Your Bench is full.");
      return paintTable();
    }
    if (!myTurn()) return openLook(state.cards[uid]);
    match.sel = match.sel?.kind === "hand" && match.sel.uid === uid ? null : { kind: "hand", uid };
    paintTable();
  }

  function tapMon(p, spot) {
    const state = match.state;
    if (match.busy) return;
    if (state.phase === "setup") {
      if (p !== ME || inLesson()) return;
      // Tap a placed Pokémon to take it back.
      if (spot === ACTIVE) match.setup = { active: match.setup.bench.shift() || null, bench: match.setup.bench };
      else match.setup.bench.splice(spot, 1);
      return paintTable();
    }
    const slot = p === ME ? (spot === ACTIVE ? state.players[ME].active : state.players[ME].bench[spot]) : spot === ACTIVE ? state.players[BOT].active : state.players[BOT].bench[spot];
    if (!slot) return;
    const acts = legal();
    if (p === ME) {
      if (state.pending[0]?.player === ME && spot !== ACTIVE) return run({ type: "promote", player: ME, spot });
      const sel = match.sel;
      if (sel?.kind === "retreat" && spot !== ACTIVE) return run({ type: "retreat", player: ME, to: spot });
      if (sel?.kind === "hand") {
        const id = state.cards[sel.uid];
        const hit = acts.find((a) => (a.type === "evolve" || a.type === "attach") && a.spot === spot && state.cards[a.uid] === id);
        if (hit) return run({ ...hit, uid: sel.uid });
      }
      if (spot === ACTIVE && myTurn() && !sel) {
        match.sheet = "attacks";
        return paintTable();
      }
    }
    lookAtSlot(slot);
  }

  function lookAtSlot(slot) {
    const state = match.state;
    const def = d(slot.uid);
    const energy = energyOf(state, slot, defs);
    openLook(state.cards[slot.uid], `<p class="tg-look-meta">${hpLeft(state, slot, defs)} of ${def.hp} HP left${energy.length ? `, ${pips(energy)}` : ", no Energy"}</p>`);
  }

  function tapBench() {
    const sel = match.sel;
    if (match.busy || sel?.kind !== "hand") return;
    const state = match.state;
    const id = state.cards[sel.uid];
    if (legal().some((a) => a.type === "bench" && state.cards[a.uid] === id)) run({ type: "bench", player: ME, uid: sel.uid });
  }

  function tableAct(act) {
    const state = match.state;
    if (act === "opened") {
      match.opening = false;
      return paintTable();
    }
    if (act === "coach-next") {
      if (lessonStep() && !lessonStep().want && !lessonStep().pick) lessonNext();
      return paintTable();
    }
    if (act === "again" && match.lesson != null) {
      match = null;
      return startLesson();
    }
    if (act === "again") {
      const id = match.deckId;
      match = null;
      return startMatch(id).then(() => paint());
    }
    if (act === "leave") {
      if (state.phase === "over") return deps.navigate("/play");
      if (!match.leaving) {
        match.leaving = true;
        paintTable();
        setTimeout(() => {
          if (match?.leaving) {
            match.leaving = false;
            if (!match.busy) paintTable();
          }
        }, 3200);
        return;
      }
      apply(state, { type: "concede", player: ME }, defs);
      return finish();
    }
    if (match.busy) return;
    if (act === "cancel") {
      match.sel = null;
      match.sheet = "";
      return paintTable();
    }
    if (act === "start") return run({ type: "place", player: ME, active: match.setup.active, bench: match.setup.bench });
    if (act === "end") return run({ type: "end", player: ME });
    if (act === "look" && match.sel?.kind === "hand") return openLook(state.cards[match.sel.uid]);
    if (act === "look-active") return lookAtSlot(state.players[ME].active);
    if (act === "retreat") {
      match.sheet = "";
      match.sel = { kind: "retreat" };
      return paintTable();
    }
  }

  /* ====================================================================
     Painting and events
     ==================================================================== */

  function paint() {
    if (!shown) return;
    document.body.classList.toggle("tg-playing", route.name === "match" && Boolean(match));
    if (route.name === "match" && match) return paintTable();
    if (route.name === "deck") {
      const deck = deckById(route.id);
      if (deck) {
        root.innerHTML = editorHtml(deck);
        return;
      }
    }
    root.innerHTML = hubHtml();
  }

  root.addEventListener("click", (e) => {
    const t = e.target;
    if (t.closest("[data-close]")) return closeLook();
    const go = t.closest("[data-go]");
    if (go) return deps.navigate(go.dataset.go);
    const look = t.closest("[data-look]");
    if (look) return openLook(look.dataset.look);

    if (route.name === "match" && match) {
      const act = t.closest("[data-act]");
      if (act) return tableAct(act.dataset.act);
      const attack = t.closest("[data-attack]");
      if (attack && !attack.disabled) return run({ type: "attack", player: ME, index: Number(attack.dataset.attack) });
      const hand = t.closest("[data-hand]");
      if (hand) return tapHand(hand.dataset.hand);
      const mon = t.closest(".tg-mon");
      if (mon) return tapMon(Number(mon.dataset.p), Number(mon.dataset.spot));
      if (t.closest("[data-bench]")) return tapBench();
      return;
    }

    if (t.closest("[data-lesson]")) return startLesson();
    const play = t.closest("[data-play]");
    if (play) return startMatch(play.dataset.play);
    const edit = t.closest("[data-edit]");
    if (edit) return deps.navigate(`/play/deck/${edit.dataset.edit}`);
    if (t.closest("[data-new]")) {
      draft.open = true;
      return paint();
    }
    if (t.closest("[data-cancel]")) {
      draft.open = false;
      return paint();
    }
    const format = t.closest("[data-format]");
    if (format) {
      draft.format = format.dataset.format;
      return paint();
    }
    if (t.closest("[data-build]")) {
      const built = buildDeck(ownedPool(), draft.format);
      if (!built) return toast("You need at least one Basic Pokémon that can be played.");
      const deck = newDeck(built.cards, built.types);
      return deps.navigate(`/play/deck/${deck.id}`);
    }
    if (t.closest("[data-empty]")) return deps.navigate(`/play/deck/${newDeck({}).id}`);

    const deck = route.name === "deck" ? deckById(route.id) : null;
    if (!deck) return;
    const more = t.closest("[data-more]");
    if (more) return changeCount(deck, more.dataset.more, 1);
    const less = t.closest("[data-less]");
    if (less) return changeCount(deck, less.dataset.less, -1);
    const tab = t.closest("[data-tab]");
    if (tab) {
      editor.tab = tab.dataset.tab;
      return repaintEditor(deck, { tools: true });
    }
    if (t.closest("[data-fill]")) return fillEnergy(deck);
    const del = t.closest("[data-delete]");
    if (del) {
      if (del.dataset.sure !== "1") {
        del.dataset.sure = "1";
        del.textContent = "Tap again to delete";
        return;
      }
      decks = decks.filter((x) => x.id !== deck.id);
      saveDecks();
      return deps.navigate("/play");
    }
  });

  root.addEventListener("input", (e) => {
    const deck = route.name === "deck" ? deckById(route.id) : null;
    if (!deck) return;
    if (e.target.id === "tg-q") {
      editor.query = e.target.value;
      repaintEditor(deck);
    } else if (e.target.id === "tg-name") {
      deck.name = e.target.value.trim().slice(0, 32) || "Deck";
      saveDecks();
    }
  });
  root.addEventListener("change", (e) => {
    const deck = route.name === "deck" ? deckById(route.id) : null;
    if (deck && e.target.id === "tg-type") {
      editor.type = e.target.value;
      repaintEditor(deck);
    }
  });
  document.addEventListener("keydown", (e) => {
    if (!shown || e.key !== "Escape") return;
    if (root.querySelector(".tg-look-holder")) return closeLook();
    if (match && route.name === "match" && (match.sel || match.sheet === "attacks")) tableAct("cancel");
  });

  function parse(path) {
    const deck = path.match(/^\/play\/deck\/([a-z0-9]+)$/);
    if (deck) return { name: "deck", id: deck[1] };
    if (path === "/play/match") return { name: "match" };
    return { name: "hub" };
  }

  async function show(path) {
    shown = true;
    route = parse(path || "/play");
    if (!defs) root.innerHTML = `<div class="tg-page"><div class="rt-skel tg-loading">Loading</div></div>`;
    try {
      await load();
    } catch {
      root.innerHTML = `<div class="tg-page"><p class="rt-empty tg-none">Couldn't load the game. Check your connection and try again.</p></div>`;
      return;
    }
    if (!shown) return;
    if (route.name === "match" && !match && !(await resumeMatch())) {
      deps.navigate("/play");
      return;
    }
    if (route.name === "deck") {
      const deck = deckById(route.id);
      if (!deck) {
        deps.navigate("/play");
        return;
      }
      await ensureCards(Object.keys(deck.cards));
    }
    if (route.name === "hub") await ensureCards(decks.flatMap((deck) => Object.keys(deck.cards)));
    paint();
    if (route.name === "match" && match && !match.busy) botTurn();
  }

  function hide() {
    shown = false;
    closeLook();
    document.body.classList.remove("tg-playing");
  }

  return { show, hide };
}
