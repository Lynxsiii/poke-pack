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
 *   signedIn()          whether there is an account (a match against a friend needs one)
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

import { ACTIVE, FORMATS, RuleError, abilityBlock, abilityOn, apply, canRetreat, conditionsOn, createGame, damageAfterTyping, defOf, energyOf, hpLeft, legalActions, markOn, marksOn, maxHp, other, retreatCost, stadiumBlock, toolOf, trainerBlock, usableAttacks } from "./tcg/engine.js";
import { ENERGY_TYPES, FREE_ENERGY, createDefs, isFreeEnergy } from "./tcg/cards.js";
import { botAction } from "./tcg/bot.js";
import { MAX_DECKS, buildBotDeck, buildDeck, checkDeck, deckList, deckSize, roomFor } from "./tcg/decks.js";
import { LESSON, LESSON_CARDS, LESSON_SET, createLesson } from "./tcg/tutorial.js";
import { coinStageHTML, flipCoin } from "./coin.js?v=6";
import { api } from "./api.js";

/** The seats on the table. A match against a friend can put you in seat 1 (worker/tcg.js), so these follow the match. */
let ME = 0;
let BOT = 1;
const BOT_NAME = "House bot";
/** The move clock of a match against a friend (worker/tcg.js TCG_TIMING.DECISION_MS). */
const TCG_MOVE_SECONDS = 90;
/**
 * Energy symbols: the real printed symbols, self-hosted as transparent PNGs under
 * assets/tcg/energy/ (source: pokewiki.de "<Type>Symbol_TCG.png" files). "A|B" units show as Any.
 */
const EN_FILE = { Grass: "grass", Fire: "fire", Water: "water", Lightning: "lightning", Psychic: "psychic", Fighting: "fighting", Darkness: "darkness", Metal: "metal", Fairy: "fairy", Dragon: "dragon", Colorless: "colorless", Any: "any" };
const enIcon = (type) => (EN_FILE[type] ? `<img src="/assets/tcg/energy/${EN_FILE[type]}-v1.png" alt="" draggable="false">` : "?");

const COND_NAME = { asleep: "Asleep", burned: "Burned", confused: "Confused", paralyzed: "Paralyzed", poisoned: "Poisoned" };

/** What a turn-long effect is called on a name plate. */
const markLabel = (m) => ({ noAttack: "Can't attack", noUse: `No ${m.name}`, less: `-${m.n} damage`, shield: "Protected", guard: "No damage", noRetreat: "Can't retreat", mustFlip: "Flips to attack" })[m.kind] || "";

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
  const saveMatch = () => !match?.online && write("match", match && match.state.phase !== "over" ? { state: match.state, deckId: match.deckId, botSet: match.botSet, botTheme: match.botTheme || "", lesson: match.lesson ?? null } : null);

  /* ---------- loading ---------- */

  function load() {
    loading ||= (async () => {
      const json = (url) =>
        fetch(url, { cache: "no-cache" }).then((r) => {
          if (!r.ok) throw new Error(r.status);
          return r.json();
        });
      const [table, trainerText] = await Promise.all([json("data/tcg/rules.json"), json("data/tcg/trainers.json"), deps.loadOwnedSets()]);
      rules = table;
      defs = createDefs(deps.findCard, rules, trainerText);
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

  // "Any" is every type at once (Rainbow Energy); "Fire|Water" is one of those, one at a time.
  const pip = (type) => {
    const one = type.includes("|") ? "Any" : type;
    const title = type === "Any" ? "Any type" : type.split("|").join(" or ");
    return `<i class="tg-en" data-en="${esc(one)}" title="${esc(title)}" role="img" aria-label="${esc(title)}">${enIcon(one)}</i>`;
  };
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
      if (def?.kind === "energy" && def.basic) def.provides.forEach((t) => seen.add(t));
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
    // Only the empty hub prints the count; the draft only asks whether there is one. A big collection is
    // thousands of cards to read the rules of, so don't count them all when no one will see the number.
    const canPlay = ([id, n]) => n > 0 && defs(id)?.kind === "pokemon" && defs(id).playable;
    const playable = !decks.length ? Object.entries(owned()).filter(canPlay).length : draft.open ? Number(Object.entries(owned()).some(canPlay)) : 0;
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
      <div class="rt-box tg-learn tg-friend-entry">
        <p><b>Play a friend</b>${lobby.matches?.incoming.length ? `${plural(lobby.matches.incoming.length, "challenge")} waiting for you.` : lobby.matches?.live.length ? `${lobby.matches.live.length === 1 ? "A match is" : `${lobby.matches.live.length} matches are`} on.` : "Challenge a friend with one of your decks."}</p>
        <button type="button" class="${lobby.matches?.incoming.length || lobby.matches?.live.length ? "solid" : "ghost"} sm" data-go="/play/friends">${lobby.matches?.incoming.length ? "See challenges" : lobby.matches?.live.length ? "Back to it" : "Challenge"}</button>
      </div>
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
          <li>Trainers: Items and Supporters that draw, search your deck, heal, switch or pull a Pokémon forward. More with each update.</li>
          <li>Pokémon Tools that change HP, Retreat Cost, damage or Weakness can be attached, one to a Pokémon.</li>
          <li>Stadiums stay in play for both players. Tap the Stadium on the table to read it or use it.</li>
          <li>Not yet: Abilities, and some attack text (the printed damage still lands).</li>
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
      // Pokémon, Trainers and Special Energy come from the collection; basic Energy has its own box.
      if (!def || !def.playable || (def.kind !== "pokemon" && def.kind !== "trainer" && !(def.kind === "energy" && !def.basic))) continue;
      if (editor.tab === "deck" && !deck.cards[id]) continue;
      if (editor.type && !(def.types || []).includes(editor.type)) continue;
      if (q && !def.name.toLowerCase().includes(q)) continue;
      rows.push({ id, def, owned: have[id] || 0, inDeck: deck.cards[id] || 0 });
    }
    const typeAt = (def) => (def.kind === "energy" ? 101 : def.kind === "trainer" ? 100 : ENERGY_TYPES.indexOf(def.types[0]) + 1 || 99);
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
      <span class="tg-tile-meta">${def.kind === "energy" ? "Special Energy" : def.kind === "trainer" ? (def.sub === "supporter" ? "Supporter" : def.sub === "tool" ? "Tool" : def.sub === "stadium" ? "Stadium" : "Item") : `${def.stage === "basic" ? "Basic" : "Evolution"}, ${def.hp} HP`}</span>
      ${stepHtml(id, row.inDeck, room, def.name, `of ${row.owned}`)}
    </div>`;
  }

  function energyHtml(deck) {
    const have = owned();
    const rows = FREE_ENERGY.filter((e) => cardOf(e.id)).map((e) => ({ id: e.id, type: e.type, n: deck.cards[e.id] || 0 }));
    // Energy prints the player owns sit in decks made before; they still count.
    for (const [id, n] of Object.entries(deck.cards)) {
      const def = defs(id);
      if (def?.kind === "energy" && def.basic && !isFreeEnergy(id)) rows.push({ id, type: def.provides[0], n, ownedPrint: have[id] || 0 });
    }
    return `<div class="rt-box tg-energy">
      <h3>Basic Energy <small>free, as many as you need</small></h3>
      ${rows.map((r) => `<div class="tg-energy-row">${pip(r.type)}<span>${esc(r.type)}</span>${stepHtml(r.id, r.n, roomFor(deck, r.id, have, defs), `${r.type} Energy`)}</div>`).join("")}
    </div>`;
  }

  function summaryHtml(deck) {
    const check = checkDeck(deck, owned(), defs);
    const pct = Math.min(1, check.size / check.need);
    const tally = (kind) => Object.entries(deck.cards).reduce((n, [id, c]) => n + (defs(id)?.kind === kind ? c : 0), 0);
    const mons = tally("pokemon");
    const trainers = tally("trainer");
    return `<div class="tg-sum-top">
        <span class="tg-sum-count"><b>${check.size}</b> of ${check.need}</span>
        <span class="tg-sum-split">${mons} Pokémon, ${trainers ? `${plural(trainers, "Trainer")}, ` : ""}${check.size - mons - trainers} Energy</span>
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
      ${def.ability ? `<p class="tg-look-text tg-ability-text"><b>${esc(def.ability.kind)}: ${esc(def.ability.name)}</b> ${esc(def.ability.text)}</p>` : ""}
      ${def.attacks.length ? `<ul class="tg-look-attacks">${def.attacks.map((a) => `<li><span class="tg-pips">${a.cost.length ? pips(a.cost) : "Free"}</span><b>${esc(a.name)}</b><em>${a.damage || ""}</em>${a.text ? `<p>${esc(a.text)}</p>` : ""}</li>`).join("")}</ul>` : ""}
      ${def.prizes > 1 ? `<p class="tg-look-note">Gives up ${def.prizes} prize cards when Knocked Out.</p>` : ""}
      ${def.notes.map((n) => `<p class="tg-look-note">${esc(n)}.</p>`).join("")}`;
    return `<div class="tg-sheet-bg" data-close></div>
      <div class="tg-sheet tg-look" role="dialog" aria-label="${esc(def.name)}">
        <div class="tg-look-face">${deps.face(card)}</div>
        <div class="tg-look-side">
          <h3>${esc(def.name)}</h3>
          ${def.kind === "pokemon" ? `<p class="tg-look-meta">${stageName(def)}, ${def.hp} HP</p>` : ""}
          ${def.kind === "trainer" ? `<p class="tg-look-meta">${{ item: "Item", supporter: "Supporter: one a turn", stadium: "Stadium", tool: "Pokémon Tool" }[def.sub]}</p>${def.text ? `<p class="tg-look-text">${esc(def.text)}</p>` : ""}${def.why ? `<p class="tg-look-note">${esc(def.why)}</p>` : ""}` : ""}
          ${def.kind === "energy" && !def.basic ? `<p class="tg-look-meta">Special Energy</p>${def.text ? `<p class="tg-look-text">${esc(def.text)}</p>` : ""}${def.why ? `<p class="tg-look-note">${esc(def.why)}</p>` : ""}` : ""}
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
    botSeats();
    const state = createGame({ decks: [deckList(deck), deckList(botDeck)], names: [deps.playerName(), BOT_NAME], format: deck.format, seed }, defs);
    match = { state, deckId, botSet, botTheme: botDeck.theme || "", sel: null, sheet: "", busy: false, line: "", setup: { active: null, bench: [] }, opening: true, over: false };
    // The bot sets up at once; its cards stay face down until both are ready.
    apply(state, botAction(state, BOT, defs), defs);
    saveMatch();
    deps.navigate("/play/match");
  }

  /** Against the bot you are always seat 0. */
  function botSeats() {
    ME = 0;
    BOT = 1;
  }

  /** The lesson: a stacked practice match on borrowed cards, with the coach (js/tcg/tutorial.js). */
  async function startLesson() {
    await deps.loadSet(LESSON_SET).catch(() => null);
    if (!LESSON_CARDS.every((id) => defs(id))) return toast("Couldn't load the lesson. Check your connection and try again.");
    botSeats();
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
    if (!step || step.free || action.type === "promote" || action.type === "pick") return true;
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
    botSeats();
    match = { state: saved.state, deckId: saved.deckId, botSet: saved.botSet, botTheme: saved.botTheme || "", lesson: saved.lesson ?? null, sel: null, sheet: "", busy: false, line: "", setup: { active: null, bench: [] }, opening: false, over: false };
    return true;
  }

  const S = () => match.shownState || match.state;
  // A match against a friend holds only your view: their hand and both decks are placeholders, so a card may be unknown.
  const d = (uid) => (match.state.cards[uid] ? defOf(match.state, uid, defs) : null);
  const myTurn = () => match.state.phase === "main" && match.state.current === ME && !match.state.pending.length && !match.state.ending;
  // Online, the Worker says what is legal (it alone sees the whole state); against the bot the page asks the engine.
  const legal = () => (match.busy ? [] : match.online ? match.online.legal : legalActions(match.state, ME, defs));
  const serverLegal = (test) => (match.online.legal || []).some(test);
  const usableNow = (state) => (match.online ? match.online.legal.filter((a) => a.type === "attack").map((a) => a.index) : usableAttacks(state, ME, defs));
  const canRetreatNow = (state) => (match.online ? serverLegal((a) => a.type === "retreat") : canRetreat(state, ME, defs));
  const abilityWhy = (state, spot) => (match.online ? (serverLegal((a) => a.type === "ability" && a.spot === spot) ? "" : "Can't be used right now.") : abilityBlock(state, ME, spot, defs));
  const stadiumWhy = (state) => (match.online ? (serverLegal((a) => a.type === "stadium") ? "" : "Can't be used right now.") : stadiumBlock(state, ME, defs));
  const trainerWhy = (state, def) => (match.online ? "" : trainerBlock(state, ME, def, defs));
  /** Who sits across the table: the house bot, or the friend you're playing. */
  const foeName = () => (match?.online ? match.state.players[BOT]?.name || "They" : BOT_NAME);

  function monHtml(state, p, slot, spot, { big = false, target = false, chosen = false } = {}) {
    const def = defOf(state, slot.uid, defs);
    const left = hpLeft(state, slot, defs);
    const full = maxHp(state, slot, defs);
    const toolName = slot.tool ? defOf(state, slot.tool, defs).name : "";
    const ready = p === ME && state.phase === "main" && !match.busy && myTurn() && !state.pending.length && !abilityWhy(state, spot);
    const label = `${p === ME ? "Your" : "Their"} ${def.name}, ${left} of ${full} HP${toolName ? `, holding ${toolName}` : ""}${ready ? `, ${def.ability.name} ready` : ""}`;
    return `<button type="button" class="tg-mon${ready ? " has-ability" : ""}${big ? " big" : ""}${target ? " is-target" : ""}${chosen ? " is-chosen" : ""}" data-p="${p}" data-spot="${spot}" aria-label="${esc(label)}">
      <img src="${img(state.cards[slot.uid], big)}" alt="" draggable="false" decoding="async" />
      ${slot.damage ? `<span class="tg-dmg">${slot.damage}</span>` : ""}
      ${big ? (slot.energy.length ? `<span class="tg-pips tg-on">${pips(energyOf(state, slot, defs))}</span>` : "") : `${hpBar(left, full)}<span class="tg-pips">${pips(energyOf(state, slot, defs))}${toolName ? `<i class="tg-en tg-toolpip" title="${esc(toolName)}">T</i>` : ""}</span>`}
      ${ready ? `<span class="tg-abil-tag">${esc(def.ability.kind === "Ability" ? "Ability" : "Power")}</span>` : ""}
    </button>`;
  }

  function hudHtml(state, p) {
    const slot = state.players[p].active;
    if (!slot || !slot.uid) return `<div class="tg-hud" data-p="${p}"></div>`;
    const def = defOf(state, slot.uid, defs);
    const left = hpLeft(state, slot, defs);
    const energy = energyOf(state, slot, defs);
    // How the Pokémon facing it fares: its type against this one's Weakness and Resistance.
    const facing = state.players[other(p)].active;
    const typing = facing?.uid ? damageAfterTyping(100, defOf(state, facing.uid, defs), def) : null;
    const edge = typing?.weak ? `<i class="tg-cond" data-cond="weak">Weak ${def.weakness.op === "x" ? "×" : "+"}${def.weakness.n}</i>` : typing?.resist ? `<i class="tg-cond" data-cond="resist">Resists -${def.resistance.n}</i>` : "";
    return `<div class="tg-hud" data-p="${p}">
      <b class="tg-hud-name">${esc(def.name)}</b>
      <span class="tg-pips">${energy.length ? pips(energy) : `<small>No Energy</small>`}</span>
      <span class="tg-hud-hp"><em>HP</em>${hpBar(left, maxHp(state, slot, defs))}<span class="num">${left}/${maxHp(state, slot, defs)}</span></span>
      ${conditionsOn(slot).length || marksOn(state, slot).length || edge || slot.tool || def.ability ? `<span class="tg-conds">${edge}${def.ability ? `<i class="tg-cond" data-cond="ability"${abilityOn(state, slot, defs) ? "" : " data-off"}>${esc(def.ability.name)}</i>` : ""}${slot.tool ? `<i class="tg-cond" data-cond="tool">${esc(defOf(state, slot.tool, defs).name)}</i>` : ""}${conditionsOn(slot).map((c) => `<i class="tg-cond" data-cond="${c}">${COND_NAME[c]}</i>`).join("")}${marksOn(state, slot).map((m) => `<i class="tg-cond" data-cond="mark" data-mark="${m.kind}">${esc(markLabel(m))}</i>`).join("")}</span>` : ""}
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
      if (match.online && state.players[ME].placed) return { text: `Waiting for ${foeName()} to set up.`, keys: "" };
      if (!match.setup.active) return { text: "Choose your Active Pokémon from your hand.", keys: "" };
      return { text: "Add Benched Pokémon if you like.", keys: `<button type="button" class="solid sm" data-act="start">Start</button>` };
    }
    const waiting = state.pending[0];
    if (waiting?.player === ME && waiting.type === "choose") return { text: "Choose from the cards shown.", keys: "" };
    if (waiting?.player === ME && waiting.type === "pick") {
      const op = waiting.effect.op;
      const whose = waiting.side === ME ? "your" : "their";
      if (op === "ability") {
        const asked = d(slotOf(ME, waiting.spots[0]).uid);
        return { text: `Use ${asked.name}'s ${asked.ability.name}?`, keys: `<button type="button" class="solid sm" data-act="ability-yes">Use it</button><button type="button" class="ghost sm" data-act="pick-skip">Not now</button>` };
      }
      const fx = waiting.effect;
      const moving = {
        moveEnergyFrom: () => `Choose the Pokémon to move ${fx.type ? `a ${fx.type}` : "an"} Energy from.`,
        moveEnergyTo: () => `Choose the Pokémon that gets the ${d(fx.uid)?.name || "Energy"}.`,
        moveCountersFrom: () => "Choose the Pokémon to move damage counters from.",
        moveCountersTo: () => `Choose ${whose === "your" ? "another of your" : "one of their"} Pokémon to take the damage counters.`,
        attachHeld: () => `Choose the Pokémon that gets ${fx.uids.length > 1 ? "the Energy" : `the ${d(fx.uids[0])?.name || "Energy"}`}.`,
        bounce: () => "Choose the Pokémon to put back into your hand.",
        evolveHeld: () => `Choose the Pokémon that evolves into ${d(fx.uid)?.name || "it"}.`,
      }[op]?.();
      if (op === "gatherFrom") return { text: `Choose a Pokémon to move ${fx.type ? `a ${fx.type}` : "an"} Energy from, or finish.`, keys: `<button type="button" class="ghost sm" data-act="pick-skip">Done</button>` };
      if (moving) return { text: moving, keys: "" };
      if (op === "switch" && waiting.side === ME && waiting.player === ME && state.current !== ME) return { text: "Your Active Pokémon is pushed out. Choose the Benched Pokémon that comes in.", keys: "" };
      const text = op === "attachFrom" ? `Choose the Pokémon that gets the ${d(waiting.effect.uid).name}.` : op === "switch" ? (waiting.side === ME ? "Choose the Benched Pokémon that comes in." : "Choose which of their Benched Pokémon to pull forward.") : op === "heal" ? (waiting.effect.n >= 999 ? "Choose one of your Pokémon to heal all its damage." : `Choose one of your Pokémon to heal ${waiting.effect.n}.`) : op === "discardEnergy" ? `Choose one of ${whose} Pokémon to lose an Energy.` : `Choose ${waiting.side === ME ? "one of your" : "one of their"} Pokémon for ${waiting.effect.n} damage${waiting.left > 1 ? ` (${waiting.left} to choose)` : ""}.`;
      return { text, keys: waiting.optional ? `<button type="button" class="ghost sm" data-act="pick-skip">Stay in</button>` : "" };
    }
    if (waiting?.player === ME) return { text: "Choose your new Active Pokémon.", keys: "" };
    if (!myTurn()) return { text: match.line || `${foeName()} is thinking`, keys: "" };
    const sel = match.sel;
    if (sel?.kind === "retreat") return { text: "Who comes in? Tap a Benched Pokémon.", keys: `<button type="button" class="ghost sm" data-act="cancel">Cancel</button>` };
    if (sel?.kind === "hand") {
      const def = d(sel.uid);
      const acts = legal().filter((a) => a.uid === sel.uid || (a.type !== "end" && state.cards[a.uid] === state.cards[sel.uid]));
      let text = `${def.name} can't be played right now.`;
      if (acts.some((a) => a.type === "bench")) text = `${def.name}: tap your Bench to play it.`;
      else if (acts.some((a) => a.type === "evolve")) text = `${def.name}: tap the Pokémon it evolves from.`;
      else if (acts.some((a) => a.type === "attach" || a.type === "tool")) text = `${def.name}: tap a Pokémon to attach it.`;
      else if (acts.some((a) => a.type === "play")) return { text: def.text || `Play ${def.name}?`, keys: `<button type="button" class="solid sm" data-act="play-card">Play</button><button type="button" class="ghost sm" data-act="look">View</button>` };
      else if (def.kind === "trainer") text = trainerWhy(state, def) || `${def.name} can't be played right now.`;
      else if (def.kind === "energy") text = "One Energy a turn, and you've attached yours.";
      else if (def.kind === "pokemon" && def.stage === "basic") text = "Your Bench is full.";
      else if (def.kind === "pokemon") text = `${def.name} evolves from ${def.evolvesFrom}, a turn after it comes into play.`;
      return { text, keys: `<button type="button" class="ghost sm" data-act="look">View</button>` };
    }
    const canAttack = usableNow(state).length > 0;
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
    const acts = legal().filter((a) => !coach?.want || a.type === "promote" || a.type === "pick" || coach.want(a));
    const sel = match.sel;
    const selId = sel?.kind === "hand" ? real.cards[sel.uid] : "";
    const targets = new Set();
    if (sel?.kind === "hand") for (const a of acts) if ((a.type === "evolve" || a.type === "attach" || a.type === "tool") && real.cards[a.uid] === selId) targets.add(a.spot);
    if (sel?.kind === "retreat") for (const a of acts) if (a.type === "retreat") targets.add(a.to);
    if (real.pending[0]?.player === ME) for (const a of acts) if (a.type === "promote") targets.add(a.spot);
    // A choice an attack left open: the Pokémon that may be picked, on either side.
    const foeTargets = new Set();
    const picking = real.pending[0]?.type === "pick" && real.pending[0].player === ME ? real.pending[0] : null;
    if (picking) for (const a of acts) if (a.spot != null) (picking.side === ME ? targets : foeTargets).add(a.spot);
    const benchOpen = sel?.kind === "hand" && acts.some((a) => a.type === "bench" && real.cards[a.uid] === selId);

    // During setup your picks show where they will stand; theirs stay face down.
    const myActive = setup ? (match.setup.active ? { uid: match.setup.active, under: [], energy: [], damage: 0 } : null) : me.active;
    const myBench = setup ? match.setup.bench.map((uid) => ({ uid, under: [], energy: [], damage: 0 })) : me.bench;
    // Cards about to be drawn stay out of the hand until their draw is played.
    const hand = setup ? me.hand.filter((uid) => uid !== match.setup.active && !match.setup.bench.includes(uid)) : match.unseen?.size ? me.hand.filter((uid) => !match.unseen.has(uid)) : me.hand;
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
        <b class="tg-who">${esc(foe.name)}${match.botTheme && !setup ? `<small>${esc(match.botTheme)} deck</small>` : ""}</b>
        ${prizesHtml(state, BOT)}
        <span class="tg-count" title="Cards in hand"><i class="tg-ic hand"></i>${foe.hand.length}</span>
        <span class="tg-count" title="Cards in deck"><i class="tg-ic deck"></i>${foe.deck.length}</span>
      </div>
      <div class="tg-bench tg-bench-foe">
        ${(setup && match.online ? Array(match.online.hidden.bench).fill(null) : foe.bench).map((slot, i) => (setup ? foeBack : monHtml(state, BOT, slot, i, { target: foeTargets.has(i) }))).join("")}
      </div>
      <div class="tg-arena">
        ${state.stadium ? `<button type="button" class="tg-stadium" data-act="stadium" aria-label="Stadium in play: ${esc(defOf(state, state.stadium.uid, defs).name)}"><img src="${img(state.cards[state.stadium.uid])}" alt="" draggable="false" /><b>Stadium</b></button>` : ""}
        <span class="tg-slab" aria-hidden="true"></span>
        <div class="tg-spot tg-spot-foe" data-p="${BOT}">${foe.active || (setup && match.online?.hidden.active) ? (setup ? foeBack : monHtml(state, BOT, foe.active, ACTIVE, { big: true, target: foeTargets.has(ACTIVE) })) : ""}</div>
        <div class="tg-info tg-info-foe">
          ${setup ? `<div class="tg-hud" data-p="${BOT}"><b class="tg-hud-name">${esc(foe.name)}</b><span class="tg-pips"><small>${match.online ? (match.online.hidden.placed ? "Ready" : "Choosing their Pokémon") : "Ready when you are"}</small></span></div>` : hudHtml(state, BOT)}
        </div>
        <div class="tg-spot tg-spot-me" data-p="${ME}">${myActive ? monHtml(state, ME, myActive, ACTIVE, { big: true, target: targets.has(ACTIVE) }) : `<span class="tg-hole">Active</span>`}</div>
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
        ${match.online && real.phase !== "over" ? clockHtml() : ""}
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

  /** The Stadium in play: what it says, who played it, and its once-a-turn use when it has one. */
  const slotOf = (p, spot) => (spot === ACTIVE ? match.state.players[p].active : match.state.players[p].bench[spot]);

  /** An Ability as a row: its name and text, and a key when it is one the player uses. */
  function abilityRowHtml(spot) {
    const state = match.state;
    const slot = slotOf(ME, spot);
    const ability = d(slot.uid).ability;
    if (!ability) return "";
    const why = !ability.use ? "" : !myTurn() ? "Wait for your turn." : abilityWhy(state, spot);
    const off = !abilityOn(state, slot, defs);
    return `<div class="tg-abil${off ? " off" : ""}">
      <span class="tg-abil-top"><em>${esc(ability.kind)}</em><b>${esc(ability.name)}</b>${ability.use ? `<button type="button" class="solid sm" data-act="ability-use" data-spot="${spot}"${why ? " disabled" : ""}>Use</button>` : ""}</span>
      <span class="tg-atk-text">${esc(ability.text)}</span>
      ${why ? `<span class="tg-atk-why">${esc(why)}</span>` : !ability.use && !ability.enter ? `<span class="tg-atk-why on">${off ? "Not working right now" : "Always on"}</span>` : ""}
    </div>`;
  }

  /** A Benched Pokémon with an Ability to use: read it, use it, or look at the card. */
  function abilitySheetHtml() {
    const state = match.state;
    const slot = slotOf(ME, match.sheetSpot);
    if (!slot) return "";
    const def = d(slot.uid);
    return `<div class="tg-sheet-bg" data-act="cancel"></div>
      <div class="tg-sheet tg-stadium-sheet tg-abil-sheet" role="dialog" aria-label="${esc(def.name)}">
        <img src="${img(state.cards[slot.uid], true)}" alt="" draggable="false" />
        <div>
          <h3>${esc(def.name)}</h3>
          ${abilityRowHtml(match.sheetSpot)}
          <div class="tg-sheet-keys"><button type="button" class="ghost sm" data-act="look-spot">View card</button><button type="button" class="ghost sm" data-act="cancel">Close</button></div>
        </div>
      </div>`;
  }

  function stadiumSheetHtml() {
    const state = match.state;
    const def = defOf(state, state.stadium.uid, defs);
    const why = def.stadium?.use ? (myTurn() ? stadiumWhy(state) : "Wait for your turn.") : "";
    return `<div class="tg-sheet-bg" data-act="cancel"></div>
      <div class="tg-sheet tg-stadium-sheet" role="dialog" aria-label="${esc(def.name)}">
        <img src="${img(state.cards[state.stadium.uid], true)}" alt="" draggable="false" />
        <div>
          <h3>${esc(def.name)}</h3>
          <p class="tg-look-meta">Stadium, played by ${state.stadium.owner === ME ? "you" : foeName()}. It affects both players.</p>
          <p class="tg-look-text">${esc(def.text)}</p>
          ${why && def.stadium?.use ? `<p class="tg-look-note">${esc(why)}</p>` : ""}
          <div class="tg-sheet-keys">${def.stadium?.use ? `<button type="button" class="solid sm" data-act="stadium-use"${why ? " disabled" : ""}>Use</button>` : ""}<button type="button" class="ghost sm" data-act="cancel">Close</button></div>
        </div>
      </div>`;
  }

  function attackSheetHtml() {
    const state = match.state;
    const slot = state.players[ME].active;
    const def = d(slot.uid);
    const usable = new Set(usableNow(state));
    const units = energyOf(state, slot, defs);
    const retreat = canRetreatNow(state) && myTurn();
    const held = conditionsOn(slot).find((c) => c === "asleep" || c === "paralyzed");
    const barred = (attack) => (slot.marks || []).some((m) => m.kind === "noUse" && m.turn === state.turn && m.name === attack.name);
    // What each attack will really do to the Pokémon in front of it: Weakness, Resistance and what last turn left on it.
    const foeSlot = state.players[BOT].active;
    const foeDef = foeSlot?.uid ? defOf(state, foeSlot.uid, defs) : null;
    const preview = (attack) => {
      const base = parseInt(attack.damage, 10) || 0;
      if (!foeDef || !base) return { html: esc(attack.damage || ""), note: "" };
      const more = /[+×x]/i.test(String(attack.damage)) ? String(attack.damage).replace(/^\d+/, "") : "";
      const mine = toolOf(state, slot, defs);
      const theirs = toolOf(state, foeSlot, defs);
      const typed = damageAfterTyping(base + (mine.plus || 0), def, foeDef, { noWeakness: Boolean(theirs.noWeakness) });
      const blocked = markOn(state, foeSlot, "shield") || markOn(state, foeSlot, "guard");
      const less = (markOn(state, foeSlot, "less")?.n || 0) + (theirs.less || 0);
      const real = blocked ? 0 : Math.max(0, typed.amount - less);
      const notes = [];
      if (mine.plus) notes.push(`${slot.tool && defOf(state, slot.tool, defs).tool?.plus ? defOf(state, slot.tool, defs).name : "Boost"} +${mine.plus}`);
      if (abilityOn(state, foeSlot, defs)?.dodge) notes.push(`${foeDef.ability.name}: coin flip to block`);
      if (abilityOn(state, foeSlot, defs)?.wall) notes.push(`${foeDef.ability.name} may block this`);
      if (typed.weak) notes.push(`Weakness ${foeDef.weakness.op === "x" ? "×" : "+"}${foeDef.weakness.n}`);
      if (typed.resist) notes.push(`Resistance -${foeDef.resistance.n}`);
      if (blocked) notes.push("Blocked this turn");
      else if (less) notes.push(`${less} less${theirs.less ? "" : " this turn"}`);
      if (!blocked && real >= hpLeft(state, foeSlot, defs)) notes.push(`Knocks out ${foeDef.name}`);
      const tone = real > base ? "up" : real < base ? "down" : "";
      return {
        html: tone ? `<s>${base}</s><span class="${tone}">${real}${esc(more)}</span>` : esc(attack.damage),
        note: notes.length ? `<span class="tg-atk-note ${tone || (notes.length ? "ko" : "")}">${esc(notes.join(" · "))}</span>` : "",
      };
    };
    const whyNot = (attack) => (state.turn === 1 ? "No attack on the first turn" : held ? `${COND_NAME[held]}: can't attack` : markOn(state, slot, "noAttack") ? "Can't attack this turn" : barred(attack) ? "Can't be used this turn" : "Not enough Energy");
    return `<div class="tg-sheet-bg" data-act="cancel"></div>
      <div class="tg-sheet tg-attacks" role="dialog" aria-label="${esc(def.name)}">
        <header><h3>${esc(def.name)}</h3><span class="tg-pips">${units.length ? pips(units) : "<small>No Energy attached</small>"}</span></header>
        ${abilityRowHtml(ACTIVE)}
        ${def.attacks.map((attack, i) => `<button type="button" class="tg-atk" data-attack="${i}"${usable.has(i) && myTurn() ? "" : " disabled"}>
          <span class="tg-atk-top"><span class="tg-pips">${attack.cost.length ? pips(attack.cost) : "<small>Free</small>"}</span><b>${esc(attack.name)}</b><em>${preview(attack).html}</em></span>
          ${preview(attack).note}
          ${attack.text ? `<span class="tg-atk-text${attack.plain ? " off" : ""}">${attack.plain ? "Text not live yet: " : ""}${esc(attack.text)}</span>` : ""}
          ${usable.has(i) || !myTurn() ? "" : `<span class="tg-atk-why">${whyNot(attack)}</span>`}
        </button>`).join("")}
        <div class="tg-sheet-keys">
          <button type="button" class="ghost sm" data-act="retreat"${retreat ? "" : " disabled"}>${markOn(state, slot, "noRetreat") ? "Can't retreat" : `Retreat ${retreatCost(state, slot, defs) ? pips(Array(retreatCost(state, slot, defs)).fill("Colorless")) : "(free)"}`}</button>
          <button type="button" class="ghost sm" data-act="look-active">View card</button>
        </div>
      </div>`;
  }

  function overHtml() {
    const state = match.state;
    const won = state.winner === ME;
    const tie = state.winner == null;
    let why = {
      prizes: won ? "You took your last prize card." : `${foeName()} took ${match.online ? "their" : "its"} last prize card.`,
      bench: won ? "They had no Pokémon left to send out." : "You had no Pokémon left to send out.",
      deck: won ? "Their deck ran out." : "Your deck ran out.",
      concede: won ? `${foeName()} gave up.` : "You conceded.",
      tie: "Both sides finished at once.",
    }[state.reason];
    const clock = match.online?.summary.reason;
    if (clock === "timeout") why = won ? `${foeName()} ran out of time.` : "You ran out of time.";
    if (clock === "abandoned") why = "Neither of you set up in time.";
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
          <button type="button" class="solid rt-go" data-act="again">${match.online ? "Challenge again" : "Play again"}</button>
          <button type="button" class="ghost" data-go="/play">Decks</button>
        </div>
      </div>`;
  }

  function openingHtml() {
    const state = match.state;
    const faces = deps.coinFaces();
    const mull = state.players.map((s, p) => {
      if (!s.mulligans) return "";
      const extra = s.mulligans - state.players[other(p)].mulligans;
      return `${p === ME ? "You" : foeName()} had no Basic Pokémon ${s.mulligans === 1 ? "once" : `${s.mulligans} times`} and drew a new hand${extra > 0 ? `, so ${p === ME ? foeName() : "you"} will draw ${plural(extra, "extra card")}` : ""}.`;
    }).filter(Boolean);
    return `<div class="tg-sheet-bg"></div>
      <div class="tg-sheet tg-opening" role="dialog" aria-label="Coin flip">
        <p class="tg-opening-lab">Flip for the first turn</p>
        <div class="tg-coin">${coinStageHTML({ heads: faces?.heads || null, tails: faces?.tails || null, size: 132, rest: "heads" })}</div>
        <h2 id="tg-first">&nbsp;</h2>
        ${mull.map((m) => `<p>${esc(m)}</p>`).join("")}
        <p class="tg-opening-note" hidden>Whoever goes first can't attack or play a Supporter on that turn.</p>
        <div class="tg-sheet-keys">${state.flipWinner === ME
          ? `<button type="button" class="solid rt-go" data-act="go-first" disabled>Go first</button><button type="button" class="ghost" data-act="go-second" disabled>Go second</button>`
          : `<button type="button" class="solid rt-go" data-act="opened" disabled>Choose your Pokémon</button>`}</div>
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
    if (match.sheet === "stadium" && match.state.stadium) return stadiumSheetHtml();
    if (match.sheet === "ability") return abilitySheetHtml();
    if (match.sheet === "flip") return flipSheetHtml();
    const waiting = match.state.pending[0];
    if (waiting?.type === "choose" && waiting.player === ME && !match.busy) return chooseSheetHtml(waiting);
    return "";
  }

  /** A choice of cards: a deck search, cards back from the discard pile, or a price paid from the hand. */
  function chooseSheetHtml(waiting) {
    const state = match.state;
    match.choice = new Set([...(match.choice || [])].filter((uid) => waiting.uids.includes(uid)));
    const { min, max } = waiting;
    // "basic:Water" reads as "Basic Water Pokémon", "name=Deoxys" as "Deoxys".
    const [what, type = ""] = String(waiting.what).split(":");
    const named = /^name[=^]/.test(what) ? what.slice(5) : "";
    const label = { basic: "Basic Pokémon", evolution: "Evolution Pokémon", pokemon: "Pokémon", basicEnergy: "basic Energy", energy: "Energy", supporter: "Supporter", item: "Item", trainer: "Trainer", tool: "Pokémon Tool", stadium: "Stadium", any: "card" }[what] || "card";
    const kind = named || (type ? label.replace(/(Pokémon|Energy)$/, `${type} $1`) : label);
    const energyCard = /Energy$/.test(kind);
    const many = (n) => (kind === "card" ? plural(n, "card") : n === 1 ? `1 ${kind}${energyCard ? " card" : ""}` : `${n} ${kind}${energyCard ? " cards" : ""}`);
    const title = waiting.effect.op === "discard" ? `Discard ${many(min)} from your hand`
      : waiting.effect.op === "toBench" ? `Choose ${max > 1 ? `up to ${many(max)}` : "a Basic Pokémon"} for your Bench`
      : waiting.effect.op === "attach" && waiting.zone !== "deck" ? `Attach ${max > 1 ? `up to ${many(max)}` : many(1)} from your ${waiting.zone === "hand" ? "hand" : "discard pile"}`
      : waiting.effect.op === "attach" ? `Attach ${max > 1 ? `up to ${many(max)}` : many(1)} from your ${waiting.top ? `top ${waiting.top} cards` : "deck"}`
      : waiting.effect.op === "swapIn" ? `Switch in ${kind} from your deck`
      : waiting.effect.op === "toDeck" ? `Shuffle ${min < max ? "up to " : ""}${many(max)} into your deck`
      : waiting.effect.op === "evolveFrom" ? `Choose the card to evolve with from your ${waiting.zone === "deck" ? "deck" : "hand"}`
      : waiting.effect.op === "dropInPlay" ? `Discard ${min < max ? "up to " : ""}${plural(max, "card")} in play`
      : waiting.effect.op === "toTop" ? `Put ${many(max)} from your hand on top of your deck`
      : waiting.effect.op === "toBottom" ? `${waiting.shuffle ? "Shuffle" : "Put"} ${many(max)} from your hand ${waiting.shuffle ? "into" : "on the bottom of"} your deck`
      : waiting.zone === "discard" ? `Take ${min < max ? "up to " : ""}${many(max)} from your discard pile`
      : `Take ${max > 1 ? `up to ${many(max)}` : many(1)} from your deck`;
    const cards = waiting.uids.slice().sort((a, b) => d(a).name.localeCompare(d(b).name) || state.cards[a].localeCompare(state.cards[b]));
    const none = waiting.zone === "deck" ? `No ${kind === "card" ? "cards" : kind} ${waiting.top ? `in the top ${waiting.top} cards` : "left in your deck"}.` : "Nothing to choose.";
    const picked = match.choice.size;
    return `<div class="tg-sheet-bg"></div>
      <div class="tg-sheet tg-choose" role="dialog" aria-label="${esc(title)}" data-min="${min}" data-max="${max}">
        <header><h3>${esc(title)}</h3>${waiting.zone === "deck" ? `<p>Your deck is shuffled afterwards.</p>` : ""}</header>
        ${cards.length ? `<div class="tg-choose-grid">${cards.map((uid) => `<button type="button" class="tg-choose-card${match.choice.has(uid) ? " is-chosen" : ""}" data-choose="${uid}" aria-pressed="${match.choice.has(uid)}" aria-label="${esc(d(uid).name)}"><img src="${img(state.cards[uid])}" alt="" draggable="false" decoding="async" /></button>`).join("")}</div>` : `<p class="tg-choose-none">${esc(none)}</p>`}
        <div class="tg-sheet-keys"><button type="button" class="solid rt-go" data-act="choose-done"${picked >= min ? "" : " disabled"}>${chooseLabel(picked, min)}</button></div>
      </div>`;
  }
  const chooseLabel = (picked, min) => (picked < min ? (picked ? `Choose ${min - picked} more` : `Choose ${min}`) : picked ? `Confirm ${picked}` : "Take none");

  function tapChoice(uid) {
    const sheet = root.querySelector(".tg-choose");
    if (!sheet || match.busy) return;
    const min = Number(sheet.dataset.min);
    const max = Number(sheet.dataset.max);
    const chosen = (match.choice ||= new Set());
    if (chosen.has(uid)) chosen.delete(uid);
    else {
      // With one card to take, a tap on another swaps the choice.
      if (max === 1) chosen.clear();
      if (chosen.size >= max) return toast(`${max} at most.`);
      chosen.add(uid);
    }
    // No repaint: the sheet would play its entrance again and lose its scroll.
    sheet.querySelectorAll("[data-choose]").forEach((el) => {
      const on = chosen.has(el.dataset.choose);
      el.classList.toggle("is-chosen", on);
      el.setAttribute("aria-pressed", String(on));
    });
    const key = sheet.querySelector('[data-act="choose-done"]');
    key.disabled = chosen.size < min;
    key.textContent = chooseLabel(chosen.size, min);
  }

  function paintTable() {
    if (!shown || (route.name !== "match" && route.name !== "online")) return;
    const scroll = root.querySelector(".tg-hand")?.scrollLeft || 0;
    fxLayer(true);
    root.innerHTML = tableHtml();
    const hand = root.querySelector(".tg-hand");
    if (hand) hand.scrollLeft = scroll;
    if (match.opening && !match.openingRun) runOpening();
    else if (match.opening && match.openingDone) openingLanded();
  }

  async function runOpening() {
    match.openingRun = true;
    const coin = root.querySelector(".tg-opening .cf-coin");
    const mine = (match.state.flipWinner ?? match.state.first) === ME;
    await sleep(350);
    // Heads is yours: the coin lands on the side of whoever goes first.
    await flipCoin(coin, mine ? "heads" : "tails", { ms: 1700, motion: !deps.reduceMotion() });
    if (!match?.opening) return;
    match.openingDone = true;
    openingLanded();
  }

  /** The flip has landed: say who won and let the keys work. Again after a repaint (a friend's move can repaint the table mid-flip). */
  function openingLanded() {
    const mine = (match.state.flipWinner ?? match.state.first) === ME;
    const text = root.querySelector("#tg-first");
    if (text) text.textContent = mine ? "You won the flip" : `${foeName()} won the flip and goes first`;
    const lab = root.querySelector(".tg-opening-lab");
    if (lab) lab.textContent = mine ? "Heads" : "Tails";
    root.querySelector(".tg-opening-note")?.removeAttribute("hidden");
    root.querySelectorAll(".tg-opening .tg-sheet-keys button").forEach((key) => key.removeAttribute("disabled"));
  }

  /* ---------- telling what happened ---------- */

  function tell(event) {
    const state = match.state;
    const who = (p) => (p === ME ? "You" : foeName());
    const name = (uid) => d(uid)?.name || "a card";
    switch (event.t) {
      case "turn": return event.p === ME ? "Your turn." : `${foeName()}'s turn.`;
      case "draw": return event.p === ME ? `You drew ${event.uids.length === 1 ? name(event.uids[0]) : plural(event.uids.length, "card")}.` : `${foeName()} drew ${event.uids.length === 1 ? "a card" : plural(event.uids.length, "card")}.`;
      case "bench": return `${who(event.p)} benched ${name(event.uid)}.`;
      case "evolve": return `${who(event.p)} evolved into ${name(event.uid)}.`;
      case "attach": return `${who(event.p)} attached ${name(event.uid)}.`;
      case "stadium": return `${who(event.p)} played ${name(event.uid)}. It stays in play for both players.`;
      case "ability": return `${name(event.uid)}: ${event.name}.`;
      case "stadium-use": return `${who(event.p)} used ${name(event.uid)}.`;
      case "tool": return `${who(event.p)} attached ${name(event.uid)}, a Pokémon Tool.`;
      case "play": return `${who(event.p)} played ${name(event.uid)}.`;
      case "shuffle-hand": return `${who(event.p)} shuffled ${event.p === ME ? "your" : "its"} hand into the deck.`;
      case "search": {
        const names = event.uids.map(name);
        const list = names.length > 2 ? plural(names.length, "card") : names.join(" and ");
        const pile = event.from === "discard" ? "discard pile" : "deck";
        if (!names.length) return `${who(event.p)} took nothing from ${event.p === ME ? "your" : "its"} ${pile}.`;
        return event.to === "bench" ? `${who(event.p)} put ${list} on ${event.p === ME ? "your" : "its"} Bench.` : `${who(event.p)} took ${list} from ${event.p === ME ? "your" : "its"} ${pile}.`;
      }
      case "discard-hand": return `${who(event.p)} discarded ${plural(event.uids.length, "card")} from hand.`;
      case "retreat": return `${who(event.p)} retreated.`;
      case "attack": return `${name(event.uid)} used ${event.name}.`;
      case "condition": return `${event.p === ME ? "Your" : "Their"} Active Pokémon is now ${COND_NAME[event.kind]}.`;
      case "cure": return `${event.p === ME ? "Your" : "Their"} Active Pokémon is no longer ${COND_NAME[event.kind]}.`;
      case "flip": return event.results.length === 1 ? (event.results[0] ? "Heads." : "Tails.") : `${event.results.filter(Boolean).length} heads of ${event.results.length}.`;
      case "miss": return "The attack did nothing.";
      case "blocked": return "No damage got through.";
      case "mark": {
        const whose = event.p === ME ? "Your" : "Their";
        return {
          noAttack: `${whose} Active Pokémon can't attack next turn.`,
          noUse: `${whose} Active Pokémon can't use ${event.name} next turn.`,
          less: `${whose} Active Pokémon takes ${event.n} less damage next turn.`,
          shield: `${whose} Active Pokémon is protected next turn.`,
          guard: `${whose} Active Pokémon takes no damage next turn.`,
          noRetreat: `${whose} Active Pokémon can't retreat next turn.`,
          mustFlip: `${whose} Active Pokémon must flip to attack next turn.`,
        }[event.kind] || "";
      }
      case "discard-energy": return `${plural(event.uids.length, "Energy card")} discarded from ${event.p === ME ? "your" : "their"} Active Pokémon.`;
      case "mill": return `${plural(event.uids.length, "card")} discarded from ${event.p === ME ? "your" : "their"} deck.`;
      case "recycle": return `${who(event.p)} shuffled ${plural(event.uids.length, "card")} from the discard pile into the deck.`;
      case "bounce": return `${who(event.p)} put ${name(event.uid)} back into ${event.p === ME ? "your" : "its"} hand.`;
      case "boost": return `${event.p === ME ? "Your" : "Their"} attacks can do ${event.n} more damage this turn.`;
      case "energy-to-hand": return `${plural(event.uids.length, "Energy card")} went back to ${event.p === ME ? "your" : "their"} hand.`;
      case "stadium-gone": return `${name(event.uid)} was discarded.`;
      case "discard-tool": return `${name(event.uid)} was discarded from ${event.p === ME ? "your" : "their"} Pokémon.`;
      case "hand-to-deck": return `${who(event.p)} put ${plural(event.uids.length, "card")} from ${event.p === ME ? "your" : "its"} hand ${event.at === "top" ? "on top of" : event.at === "bottom" ? "on the bottom of" : "into"} the deck.`;
      case "damage":
        if (event.why === "poisoned" || event.why === "burned") return `${COND_NAME[event.why]}: ${event.n} damage to ${event.p === ME ? "your" : "their"} Active Pokémon.`;
        if (event.why === "confused") return "Confused: it hurt itself for 30.";
        if (event.why === "energy") return `The Energy put ${event.n / 10 === 1 ? "a damage counter" : `${event.n / 10} damage counters`} on it.`;
        return `${event.n} damage${event.weak ? ", it's weak to that" : ""}${event.resist ? ", resisted" : ""}${event.self ? " to itself" : ""}.`;
      case "heal": return event.why === "move" ? "" : event.why === "ability" ? `${event.p === ME ? "Your" : "Their"} Pokémon healed ${event.n} between turns.` : `Healed ${event.n}.`;
      case "move-energy": return `${who(event.p)} moved ${name(event.uid)}.`;
      case "form": return `${who(event.p)} switched in ${name(event.uid)}.`;
      case "turn-ends": return `${event.name} ends the turn.`;
      case "ko": return `${name(event.uid)} was Knocked Out.`;
      case "ko-hand": return `${name(event.uid)} went back to ${event.p === ME ? "your" : "their"} hand.`;
      case "prize": return `${who(event.p)} took ${plural(event.uids.length, "prize card")}.`;
      case "switch": return `${event.p === ME ? "Your" : "Their"} Active Pokémon was switched out.`;
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

  function popDamage(p, text, tone = "", at = ACTIVE) {
    const spot = root.querySelector(at === ACTIVE || at === -1 ? `.tg-spot[data-p="${p}"]` : `.tg-bench .tg-mon[data-p="${p}"][data-spot="${at}"]`);
    if (!spot) return;
    const el = document.createElement("span");
    el.className = `tg-pop ${tone}`;
    el.textContent = text;
    spot.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  /* ---------- motion ----------
     The table is repainted whole, so anything that has to outlive a repaint (a card in
     flight, the turn banner, an impact) lives in a layer of its own beside it. Transform,
     opacity and filter only. */

  let fx = null;
  const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";
  const still = () => deps.reduceMotion();
  const rectOf = (selector) => root.querySelector(selector)?.getBoundingClientRect() || null;
  const monSel = (p, spot) => (spot === ACTIVE ? `.tg-spot[data-p="${p}"] .tg-mon` : `.tg-bench .tg-mon[data-p="${p}"][data-spot="${spot}"]`);
  const centre = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

  function fxLayer(on) {
    if (on && !fx) {
      fx = document.createElement("div");
      fx.className = "tg-fx rt-dark";
      fx.setAttribute("aria-hidden", "true");
      document.body.appendChild(fx);
    } else if (!on && fx) {
      fx.remove();
      fx = null;
    }
  }

  /** A card image travels from one rect to another. `absorb`: it sinks into what it lands on. */
  function ghost(src, from, to, { ms = 340, width = 0, absorb = false, show = false, delay = 0 } = {}) {
    if (!src || !from || !to || !fx || still() || !to.width) return;
    const w = width || to.width;
    const h = w * 1.4;
    const a = centre(from);
    const b = centre(to);
    const el = document.createElement("img");
    el.className = "tg-ghost";
    el.alt = "";
    el.src = src;
    el.style.cssText = `left:${b.x - w / 2}px;top:${b.y - h / 2}px;width:${w}px;height:${h}px`;
    fx.appendChild(el);
    const from0 = `translate(${a.x - b.x}px, ${a.y - b.y}px) scale(${Math.max(0.16, Math.min(1.4, from.width / w)).toFixed(3)})`;
    const frames = show
      ? [{ transform: from0, opacity: 1 }, { transform: "none", opacity: 1, offset: 0.28 }, { transform: "none", opacity: 1, offset: 0.82 }, { transform: "scale(1.06)", opacity: 0 }]
      : absorb
      ? [{ transform: from0, opacity: 1 }, { transform: "scale(0.9)", opacity: 1, offset: 0.7 }, { transform: "scale(0.4)", opacity: 0 }]
      : [{ transform: from0, opacity: 1 }, { transform: "none", opacity: 1 }];
    el.animate(frames, { duration: ms, delay, easing: EASE, fill: "both" }).finished.catch(() => {}).then(() => el.remove());
  }

  /**
   * A played Trainer or Stadium, held large over the arena long enough to read.
   * A tap anywhere puts it away early. Resolves once it has gone.
   */
  let showing = null;
  function showCard(src, from, to, hold) {
    if (!src || !from || !to || !fx || still() || !to.width) return null;
    const w = to.width;
    const h = w * 1.4;
    const a = centre(from);
    const b = centre(to);
    const el = document.createElement("img");
    el.className = "tg-ghost tg-shown";
    el.alt = "";
    el.src = src;
    el.style.cssText = `left:${b.x - w / 2}px;top:${b.y - h / 2}px;width:${w}px;height:${h}px`;
    fx.appendChild(el);
    const from0 = `translate(${a.x - b.x}px, ${a.y - b.y}px) scale(${Math.max(0.16, Math.min(1.4, from.width / w)).toFixed(3)})`;
    el.animate([{ transform: from0 }, { transform: "none" }], { duration: 300, easing: EASE, fill: "both" });
    return new Promise((resolve) => {
      let timer = 0;
      const done = () => {
        clearTimeout(timer);
        document.removeEventListener("pointerdown", done, true);
        el.animate([{ transform: "none", opacity: 1 }, { transform: "scale(1.05)", opacity: 0 }], { duration: 220, easing: EASE, fill: "both" })
          .finished.catch(() => {}).then(() => (el.remove(), resolve()));
      };
      timer = setTimeout(done, 300 + hold);
      // A press only counts once the card has landed, so the tap that played it doesn't close it.
      setTimeout(() => document.addEventListener("pointerdown", done, true), 300);
    });
  }

  /** Something on the table arrives from elsewhere: its picture flies in, and it shows when the picture lands. */
  function flyIn(from, el, { ms = 340, delay = 0 } = {}) {
    const pic = el?.querySelector("img");
    if (!pic || !from || still()) return;
    ghost(pic.currentSrc || pic.src, from, pic.getBoundingClientRect(), { ms, delay });
    el.animate([{ opacity: 0 }, { opacity: 0 }], { duration: ms + delay });
  }

  function banner(text, tone, sub = "") {
    if (!fx || still()) return;
    fx.querySelector(".tg-banner")?.remove();
    const el = document.createElement("div");
    el.className = `tg-banner ${tone}${sub ? " call" : ""}`;
    el.innerHTML = `<b>${sub ? `<small>${esc(sub)}</small>` : ""}${esc(text)}</b>`;
    const arena = rectOf(".tg-arena");
    if (arena) el.style.top = `${arena.top + arena.height / 2}px`;
    fx.appendChild(el);
    setTimeout(() => el.remove(), 1000);
  }

  /** The flash where an attack lands, in the attacker's colour. */
  function burst(p, type, big) {
    const at = rectOf(`.tg-spot[data-p="${p}"]`);
    if (!at || !fx || still()) return;
    const el = document.createElement("span");
    el.className = `tg-burst tg-en${big ? " big" : ""}`;
    el.dataset.en = type || "Colorless";
    const c = centre(at);
    el.style.cssText = `left:${c.x}px;top:${c.y}px;--s:${Math.round(at.width * 1.25)}px`;
    el.innerHTML = "<i></i><i></i>";
    fx.appendChild(el);
    setTimeout(() => el.remove(), 620);
  }

  /** The HP bar on a name plate runs down (or up) from where it stood. */
  function slideHp(p, before, after, max) {
    const bar = root.querySelector(`.tg-hud[data-p="${p}"] .tg-hp i`);
    if (!bar || !max || still()) return;
    bar.animate([{ transform: `scaleX(${(before / max).toFixed(3)})` }, { transform: `scaleX(${(after / max).toFixed(3)})` }], { duration: 460, easing: EASE });
  }

  const handSpot = (p) => (p === ME ? rectOf(".tg-hand") : rectOf(".tg-bar-foe .tg-count"));
  const deckSpot = (p) => (p === ME ? rectOf(".tg-bar-me .tg-mini") : rectOf(".tg-bar-foe .tg-ic.deck"));
  /** A rect the size of a Bench card in the middle of a Bench: where a Pokémon walks in from. */
  function benchSpot(p) {
    const r = rectOf(p === ME ? ".tg-bench-me" : ".tg-bench-foe");
    if (!r) return null;
    const w = r.height / 1.6;
    return { left: r.left + r.width / 2 - w / 2, top: r.top, width: w, height: r.height };
  }

  /** How one event moves, once the table shows what it led to. Returns how long to let it play. */
  function animate(event, from) {
    if (still()) return 0;
    if (event.t === "turn") {
      banner(event.p === ME ? "Your turn" : `${foeName()}'s turn`, event.p === ME ? "me" : "foe");
      return 0;
    }
    if (event.t === "draw" || (event.t === "search" && event.to === "hand")) {
      if (!event.uids.length) return 0;
      if (event.p === BOT) {
        cue(".tg-bar-foe .tg-count", "bump", 400);
        return 0;
      }
      const cards = [...root.querySelectorAll(".tg-hand .tg-card")].slice(-event.uids.length);
      cards.forEach((card, i) => flyIn(deckSpot(ME), card, { ms: 320, delay: i * 90 }));
      return 320 + (cards.length - 1) * 90;
    }
    const src = from || (event.from === "deck" ? deckSpot(event.p) : handSpot(event.p));
    if (event.t === "bench") {
      flyIn(src, root.querySelector(monSel(event.p, event.spot)), { ms: 300 });
      return 300;
    }
    if (event.t === "evolve") {
      const el = root.querySelector(monSel(event.p, event.spot));
      flyIn(src, el, { ms: 300 });
      setTimeout(() => cue(monSel(event.p, event.spot), "evolved", 560), 290);
      return 620;
    }
    if (event.t === "play" || event.t === "stadium") {
      // The card is shown large over the arena for a beat, so both players read what was played.
      const arena = rectOf(".tg-arena");
      if (!arena) return 0;
      const w = Math.min(arena.width * 0.5, arena.height * 0.62);
      const to = { left: arena.left + arena.width / 2 - w / 2, top: arena.top + arena.height / 2 - w * 0.7, width: w, height: w * 1.4 };
      showing = showCard(img(match.state.cards[event.uid]), src, to, event.p === ME ? 1300 : 2600);
      return 0;
    }
    if (event.t === "move-energy") {
      const at = rectOf(`${monSel(event.p, event.from)} img`);
      const to = rectOf(`${monSel(event.p, event.spot)} img`);
      if (at && to) ghost(img(match.state.cards[event.uid]), at, to, { ms: 360, width: to.width * 0.5, absorb: true });
      setTimeout(() => cue(monSel(event.p, event.spot), "charged", 460), 260);
      return 440;
    }
    if (event.t === "form") {
      cue(monSel(event.p, event.spot), "evolved", 560);
      return 560;
    }
    if (event.t === "attach" || event.t === "tool") {
      const to = rectOf(`${monSel(event.p, event.spot)} img`);
      if (to) ghost(img(match.state.cards[event.uid]), src, to, { ms: 320, width: to.width * 0.62, absorb: true });
      setTimeout(() => cue(monSel(event.p, event.spot), "charged", 460), 230);
      return 420;
    }
    if (event.t === "promote" || event.t === "retreat" || event.t === "switch") {
      flyIn(benchSpot(event.p), root.querySelector(monSel(event.p, ACTIVE)), { ms: 320 });
      return 320;
    }
    if (event.t === "prize") {
      const to = handSpot(event.p);
      const at = rectOf(`.tg-bar-${event.p === ME ? "me" : "foe"} .tg-prizes`);
      const arena = rectOf(".tg-arena");
      if (event.p === ME && at && arena) {
        // Your prize cards turn up face up over the arena for a beat before they join your hand.
        const n = event.uids.length;
        const w = Math.min(arena.width * (n > 1 ? 0.3 : 0.4), arena.height * 0.5);
        event.uids.forEach((uid, i) => {
          const left = arena.left + arena.width / 2 + (i - (n - 1) / 2) * (w + 8) - w / 2;
          ghost(img(match.state.cards[uid]), at, { left, top: arena.top + arena.height / 2 - w * 0.7, width: w, height: w * 1.4 }, { ms: 950, width: w, show: true, delay: i * 90 });
        });
        cue(".tg-bar-me .tg-prizes", "bump", 420);
        return 900 + (n - 1) * 90;
      }
      if (to && at) {
        const width = event.p === ME ? to.height / 1.6 : 26;
        event.uids.forEach((_, i) => ghost("assets/cards/shared/card-back-sm.webp", at, to, { ms: 420, width, absorb: true, delay: i * 110 }));
      }
      cue(`.tg-bar-${event.p === ME ? "me" : "foe"} .tg-prizes`, "bump", 420);
      return 300;
    }
    if (event.t === "ability") {
      banner(event.name, event.p === ME ? "me" : "foe", d(event.uid).name);
      cue(monSel(event.p, event.spot), "charged", 460);
      return 620;
    }
    if (event.t === "condition") cue(`.tg-hud[data-p="${event.p}"] .tg-cond[data-cond="${event.kind}"]`, "bump", 420);
    if (event.t === "mark") cue(`.tg-hud[data-p="${event.p}"] .tg-cond[data-mark="${event.kind}"]`, "bump", 420);
    return 0;
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
  /** An attack, or the choice an attack left open, is played in beats on the table as it stood. */
  const inBeats = (action) => action.type === "attack" || (action.type === "pick" && action.spot != null);

  async function run(action) {
    if (match.online) return runOnline(action);
    const state = match.state;
    if (action.player === ME && !coachAllows(action)) return false;
    const before = inBeats(action) ? JSON.parse(JSON.stringify(state)) : null;
    // Where the card being played sits in the hand, before the hand is redrawn without it.
    const played = action.player === ME && action.uid ? dropFrom || rectOf(`.tg-hand [data-hand="${action.uid}"]`) : null;
    dropFrom = null;
    let events;
    try {
      events = apply(state, action, defs);
    } catch (err) {
      if (err instanceof RuleError) toast(err.message);
      else throw err;
      return false;
    }
    return playBack(action, events, before, played);
  }

  /** Play one action's events on the table. `match.state` already holds the state after it; `before` the state before an attack. */
  async function playBack(action, events, before, played) {
    const fast = deps.reduceMotion();
    const wait = (ms) => sleep(fast ? Math.min(ms, 120) : ms);
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
      if (action.type === "attack") {
        say(events.find((e) => e.t === "attack"));
        paintTable();
        // The attack is called out by name before it lands, so a bot's turn can be followed.
        const user = before.players[p].active;
        const used = user && defOf(before, user.uid, defs);
        if (used?.attacks[action.index]) {
          banner(used.attacks[action.index].name, p === ME ? "me" : "foe", used.name);
          await wait(430);
        }
        cue(`.tg-spot[data-p="${p}"] .tg-mon`, p === ME ? "lunge-up" : "lunge-down", 420);
        await wait(380);
      }
      for (const flips of events.filter((e) => e.t === "flip")) {
        say(flips);
        await showFlips(flips.results);
      }
      for (const event of events) {
        if (event.why === "poisoned" || event.why === "burned") continue; // the checkup, told after the attack
        if (event.t === "damage" || event.t === "heal") {
          const benched = event.spot >= 0;
          const slot = benched ? before.players[event.p].bench[event.spot] : before.players[event.p].active;
          const max = slot ? maxHp(before, slot, defs) : 0;
          const was = slot ? Math.max(0, max - slot.damage) : 0;
          if (slot) slot.damage = Math.max(0, slot.damage + (event.t === "heal" ? -event.n : event.n));
          say(event);
          paintTable();
          if (slot && !benched) slideHp(event.p, was, Math.max(0, max - slot.damage), max);
          popDamage(event.p, event.t === "heal" ? `+${event.n}` : `-${event.n}`, event.t === "heal" ? "heal" : event.weak ? "weak" : "", event.spot);
          if (event.t === "damage") {
            const heavy = !benched && (event.weak || (max && event.n * 2 >= max));
            if (!event.self && !event.why && !benched) burst(event.p, defOf(before, before.players[p].active.uid, defs).types?.[0], heavy);
            cue(monSel(event.p, benched ? event.spot : ACTIVE), "hit", 420);
            if (heavy) cue(".tg-arena", "shake", 420);
            deps.buzz?.(event.weak ? [18, 30, 18] : 14);
          }
          await wait(620);
        } else if (event.t === "miss" || event.t === "blocked") {
          say(event);
          paintTable();
          await wait(520);
        } else if (event.t === "ko") {
          say(event);
          paintTable();
          cue(event.spot === ACTIVE ? `.tg-spot[data-p="${event.p}"] .tg-mon` : `.tg-bench .tg-mon[data-p="${event.p}"][data-spot="${event.spot}"]`, "ko", 700);
          banner("Knocked Out", event.p === ME ? "foe" : "me");
          deps.buzz?.([24, 40, 24]);
          await wait(680);
          // It leaves the table as it stood, so the beats that follow don't bring it back.
          if (event.spot === ACTIVE) before.players[event.p].active = null;
          else before.players[event.p].bench[event.spot] = null;
        } else if (event.t === "prize") {
          for (const side of before.players) side.bench = side.bench.filter(Boolean);
          say(event);
          paintTable();
          await wait(Math.max(460, animate(event)));
        }
      }
      match.shownState = null;
    }

    const toHand = (e) => (e.t === "draw" || e.t === "prize" || (e.t === "search" && e.to === "hand")) && e.p === ME;
    match.unseen = new Set(events.filter(toHand).flatMap((e) => e.uids));
    for (const event of events) {
      if (toHand(event)) event.uids.forEach((uid) => match.unseen.delete(uid));
      if (before && ["attack", "flip", "damage", "heal", "miss", "blocked", "ko", "prize"].includes(event.t) && !["poisoned", "burned"].includes(event.why)) continue;
      if (event.t === "over") continue;
      say(event);
      paintTable();
      const moving = animate(event, event.p === ME ? played : null);
      if (event.t === "turn") {
        cue(".tg-table", event.p === ME ? "turn-me" : "turn-foe", 900);
        await wait(still() ? 520 : 760);
      } else if (event.why === "poisoned" || event.why === "burned" || event.t === "cure" || event.t === "condition" || event.t === "mark" || event.t === "discard-energy" || event.t === "mill") {
        if (event.t === "damage") {
          cue(`.tg-spot[data-p="${event.p}"] .tg-mon`, "hit", 420);
          popDamage(event.p, `-${event.n}`, event.why);
        }
        await wait(620);
      } else if (event.t === "flip") {
        await showFlips(event.results);
      } else if (event.t === "heal") {
        popDamage(event.p, `+${event.n}`, "heal", event.spot);
        await wait(520);
      } else if (showing) {
        const shown = showing;
        showing = null;
        await shown;
      } else if (event.t === "search") {
        await wait(event.p === BOT ? 900 : Math.max(420, moving + 100));
      } else if (event.t === "shuffle-hand" || event.t === "discard-hand") {
        await wait(event.p === BOT ? 620 : 380);
      } else if (event.t === "damage") {
        // Damage from a choice made after the attack: the table already shows it.
        cue(monSel(event.p, event.spot >= 0 ? event.spot : ACTIVE), "hit", 420);
        popDamage(event.p, `-${event.n}`, event.weak ? "weak" : "", event.spot);
        await wait(560);
      } else if (event.p === BOT || event.t === "promote" || event.t === "switch") {
        await wait(Math.max(480, moving + 120));
      } else if (moving) {
        await wait(moving);
      }
    }

    match.unseen = null;
    match.busy = false;
    if (match.state.phase === "over") return finish();
    paintTable();
    botTurn();
    return true;
  }

  function finish() {
    if (match.over) return true;
    match.over = true;
    match.busy = false;
    // A match against a friend is kept by the Worker, and no record or reward comes of it here.
    if (match.online) return paintTable(), true;
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
    if (match.online) return;
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

  /* ---------- a match against a friend (worker/tcg.js) ----------
     The Worker runs the rules. The page sends an action, gets back the steps
     since the last one it has shown ({ seq, action, events, view }) and plays
     each through playBack, the same path a bot match takes. While it isn't the
     player's move it polls for the other player's steps. Nothing is kept on
     the device and nothing is won. */

  const POLL_MS = 1500;
  const POLL_IDLE_MS = 4000;
  let pollTimer = 0;
  let clockTimer = 0;

  /** The engine's view with counts turned back into lists, so the table can count them; the cards stay unknown. */
  function hydrate(view, online) {
    const hidden = { active: false, bench: 0, placed: false };
    view.players.forEach((side, p) => {
      const fill = (n, tag) => (typeof n === "number" ? Array.from({ length: n }, (_, i) => `?${tag}${p}-${i}`) : n);
      side.hand = fill(side.hand, "h");
      side.deck = fill(side.deck, "d");
      side.prizes = fill(side.prizes, "p");
      if (view.phase === "setup" && p !== ME) {
        // Their picks stay face down until both are ready; the table only shows that there are some.
        hidden.active = Boolean(side.active);
        hidden.bench = side.bench.length;
        hidden.placed = Boolean(side.placed);
        side.active = null;
        side.bench = [];
      }
    });
    if (online) online.hidden = hidden;
    return view;
  }

  /** Your placed Pokémon, as the setup screen draws them, once the Worker has them. */
  function setupFrom(state) {
    const me = state.players[ME];
    return state.phase === "setup" && me.placed && me.active?.uid ? { active: me.active.uid, bench: me.bench.map((s) => s.uid) } : { active: null, bench: [] };
  }

  function takeSummary(online, summary) {
    if (!summary) return;
    online.summary = summary;
    online.skew = summary.now - Date.now();
  }

  /** Load a match from the Worker onto the table. Resolves the match, `{ waiting }` for a challenge not yet answered, or null. */
  async function openOnline(id) {
    const res = await api(`/api/tcg/matches/${id}`);
    if (res.match.status === "open") return { waiting: res.match };
    if (!res.view) return null;
    ME = res.match.seat;
    BOT = 1 - ME;
    await ensureCards(Object.values(res.view.cards));
    const online = { id, seq: res.seq, legal: res.legal || [], summary: null, hidden: null, queue: Promise.resolve() };
    takeSummary(online, res.match);
    const state = hydrate(res.view, online);
    const me = state.players[ME];
    // The flip is shown to its winner until they choose who goes first, and to the other player when they arrive.
    const opening = state.phase === "setup" && !me.placed && (state.flipWinner !== ME || !res.match.ordered);
    match = { online, state, deckId: null, botSet: "", sel: null, sheet: "", busy: false, line: "", setup: setupFrom(state), opening, over: false };
    if (state.phase === "over" || res.match.status === "over") {
      state.phase = "over";
      state.winner ??= res.match.winner;
      match.over = true;
    }
    return match;
  }

  /** Steps from the Worker, played one after another, in order, never two at once. */
  function playSteps(res, played = null) {
    const mine = match;
    const online = mine.online;
    online.queue = online.queue
      .then(async () => {
        if (mine !== match) return;
        takeSummary(online, res.match);
        const fresh = (res.steps || []).filter((step) => step.seq > online.seq);
        if (res.view && !fresh.length && res.seq !== online.seq) {
          // The Worker couldn't replay the steps (its rules changed mid-match): take the table as it is now.
          match.state = hydrate(res.view, online);
          online.seq = res.seq;
        }
        for (const step of fresh) {
          if (mine !== match) return;
          const before = inBeats(step.action) ? JSON.parse(JSON.stringify(match.state)) : null;
          const ours = step.action.player === ME;
          await ensureCards(Object.values(step.view.cards));
          match.state = hydrate(step.view, online);
          online.seq = step.seq;
          online.legal = step.seq === res.seq ? res.legal || [] : [];
          match.setup = setupFrom(match.state);
          if (!ours) match.sel = null;
          await playBack(step.action, step.events, before, ours ? played : null);
        }
        if (online.seq === res.seq) online.legal = res.legal || [];
        // Neither player set up in time: the Worker ends the match without a step.
        if (res.match?.status === "over" && match.state.phase !== "over") {
          match.state.phase = "over";
          match.state.winner = res.match.winner;
          finish();
        }
        if ((fresh.length || res.view || match.over) && shown && mine === match && !match.busy && route.name === "online") paintTable();
      })
      .catch((err) => console.error("tcg online", err));
    return online.queue;
  }

  async function runOnline(action) {
    const online = match.online;
    if (online.sending && action.type !== "concede") return false;
    const played = action.player === ME && action.uid ? dropFrom || rectOf(`.tg-hand [data-hand="${action.uid}"]`) : null;
    dropFrom = null;
    online.sending = true;
    match.sel = null;
    match.sheet = "";
    match.leaving = false;
    const mine = match;
    let res;
    try {
      res = await api(`/api/tcg/matches/${online.id}/action`, { method: "POST", body: JSON.stringify({ action, since: online.seq }) });
    } catch (err) {
      online.sending = false;
      if (mine !== match) return false;
      toast(err.message || "That didn't go through.");
      paintTable();
      pollSoon(200);
      return false;
    }
    online.sending = false;
    if (mine !== match) return false;
    await playSteps(res, played);
    pollSoon();
    return true;
  }

  const myMove = () => Boolean(match?.online && (match.online.summary?.toMove || []).includes(ME));

  function pollSoon(ms = myMove() ? POLL_IDLE_MS : POLL_MS) {
    clearTimeout(pollTimer);
    if (!match?.online || match.over) return;
    pollTimer = setTimeout(poll, ms);
  }

  async function poll() {
    const mine = match;
    if (!shown || route.name !== "online" || !mine?.online || mine.over) return;
    if (mine.busy || mine.online.sending) return pollSoon(500);
    try {
      const res = await api(`/api/tcg/matches/${mine.online.id}?since=${mine.online.seq}`);
      if (mine !== match) return;
      if (!mine.online.sending) await playSteps(res);
    } catch {
      /* a dropped poll: the next one catches up */
    }
    if (mine === match) pollSoon();
  }

  /** The move clock on the table: how long is left for whoever owes the move. Text only, no repaint. */
  function tickClock() {
    clearInterval(clockTimer);
    clockTimer = setInterval(() => {
      if (!shown || route.name !== "online") return clearInterval(clockTimer);
      const el = root.querySelector("[data-clock]");
      const clock = clockNow();
      if (!el || !clock) return;
      el.textContent = clock.text;
      el.classList.toggle("is-mine", clock.mine);
      el.classList.toggle("is-low", clock.low);
      el.title = clock.title;
      if (!clock.secs) pollSoon(400);
    }, 1000);
  }

  /** Whose move it is and how long they have left, from the Worker's clock. */
  function clockNow() {
    const summary = match?.online?.summary;
    if (!summary) return null;
    const secs = Math.max(0, Math.round((summary.deadline - (Date.now() + (match.online.skew || 0))) / 1000));
    const mine = summary.toMove.includes(ME);
    return { secs, mine, low: mine && secs <= 20, text: `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`, title: mine ? "Your time for this move" : `${foeName()}'s time for this move` };
  }
  function clockHtml() {
    const clock = clockNow();
    if (!clock) return "";
    return `<span class="tg-clock${clock.mine ? " is-mine" : ""}${clock.low ? " is-low" : ""}" data-clock title="${esc(clock.title)}">${clock.text}</span>`;
  }

  /* ---------- the friends page: challenges and matches ---------- */

  const lobby = { friends: null, matches: null, deckId: "", loading: false, error: "", known: new Set() };
  let lobbyTimer = 0;

  const readyDecks = () => decks.filter((deck) => checkDeck(deck, owned(), defs).ok);
  const timeLeft = (ms) => (ms < 60000 ? "under a minute" : `${Math.round(ms / 60000)} min`);
  const handleOf = (u) => (u?.handle ? `@${u.handle}` : u?.name || "A trainer");

  async function loadLobby() {
    if (lobby.loading) return;
    if (!deps.signedIn?.()) {
      lobby.error = "Sign in to play your friends.";
      if (shown && route.name === "friends") root.innerHTML = friendsHtml();
      return;
    }
    lobby.loading = true;
    try {
      const [friends, matches] = await Promise.all([lobby.friends ? Promise.resolve(lobby.friends) : api("/api/friends"), api("/api/tcg/matches")]);
      lobby.friends = friends;
      // A challenge you sent was just accepted: go to the table.
      const started = matches.live.find((m) => m.challenger && lobby.known.has(m.id));
      lobby.known = new Set(matches.outgoing.map((m) => m.id));
      lobby.matches = matches;
      lobby.error = "";
      if (started && shown && route.name === "friends") {
        lobby.loading = false;
        return deps.navigate(`/play/online/${started.id}`);
      }
    } catch (err) {
      lobby.error = err.status === 401 ? "Sign in to play your friends." : err.message || "Couldn't load your friends.";
    }
    lobby.loading = false;
    if (shown && route.name === "friends") root.innerHTML = friendsHtml();
  }

  function lobbySoon() {
    clearTimeout(lobbyTimer);
    lobbyTimer = setTimeout(async () => {
      if (!shown || route.name !== "friends") return;
      await loadLobby();
      lobbySoon();
    }, 4000);
  }

  const markHtml = (u, on = false) => `<span class="tg-pvp-mark${on ? " on" : ""}" aria-hidden="true">${esc((u?.handle || u?.name || "?").slice(0, 1).toUpperCase())}</span>`;

  function matchRowHtml(m, keys, line) {
    return `<article class="rt-box tg-deck tg-pvp-row">
      ${markHtml(m.them)}
      <div class="tg-deck-main"><h3>${esc(handleOf(m.them))}</h3><p>${line}</p></div>
      <div class="tg-deck-keys">${keys}</div>
    </article>`;
  }

  function resultOf(x) {
    const how = x.reason === "timeout" ? " on time" : x.reason === "concede" ? (x.winner === x.seat ? ", they conceded" : ", you conceded") : "";
    if (x.status === "over") return x.reason === "abandoned" ? "Nobody set up in time" : x.winner == null ? "A tie" : x.winner === x.seat ? `You won${how}` : `You lost${how}`;
    return x.status === "declined" ? "Declined" : x.status === "expired" ? "Nobody answered" : "Called off";
  }

  function friendsHtml() {
    const ready = readyDecks();
    if (!ready.some((deck) => deck.id === lobby.deckId)) lobby.deckId = ready[0]?.id || "";
    const chosen = ready.find((deck) => deck.id === lobby.deckId);
    const m = lobby.matches;
    const now = Date.now();
    const fmt = (id) => FORMATS[id]?.name || "Deck";
    const busyWith = new Set(m ? [...m.incoming, ...m.outgoing, ...m.live].map((x) => x.them.handle) : []);
    const friends = lobby.friends?.friends || [];
    return `<div class="tg-page tg-pvp">
      <header class="tg-head">
        <button type="button" class="tlink tg-back" data-go="/play">Your decks</button>
        <h1 class="page-title tg-title">Play a friend</h1>
        <p class="tg-lede">Challenge a friend with one of your decks. Each move has ${TCG_MOVE_SECONDS} seconds on the clock. Just for fun: nothing is won or lost.</p>
      </header>
      ${lobby.error ? `<p class="rt-empty tg-none">${esc(lobby.error)}</p>` : ""}
      <div class="tg-pvp-deck">
        <span>Your deck</span>
        ${ready.length ? `<select class="filter" id="tg-pvp-deck" aria-label="Your deck">${ready.map((deck) => `<option value="${esc(deck.id)}"${deck.id === lobby.deckId ? " selected" : ""}>${esc(deck.name)}, ${fmt(deck.format)}</option>`).join("")}</select>` : `<p>No deck is ready yet. <button type="button" class="tlink" data-go="/play">Build one</button></p>`}
      </div>
      ${!m ? (lobby.error ? "" : `<div class="rt-skel tg-loading">Loading</div>`) : `
      ${m.incoming.length ? `<section class="tg-block"><h2 class="tg-h2">Challenges for you</h2>
        ${m.incoming.map((x) => matchRowHtml(x, `<button type="button" class="solid sm" data-accept="${x.id}"${chosen?.format === x.format ? "" : " disabled"}>Accept</button><button type="button" class="ghost sm" data-decline="${x.id}">Decline</button>`, `${fmt(x.format)}, ${timeLeft(x.deadline - now)} to answer${chosen?.format === x.format ? "" : `. Pick a ${fmt(x.format)} to accept`}`)).join("")}
      </section>` : ""}
      ${m.live.length ? `<section class="tg-block"><h2 class="tg-h2">Matches on</h2>
        ${m.live.map((x) => matchRowHtml(x, `<button type="button" class="solid sm" data-go="/play/online/${x.id}">Play</button>`, `${fmt(x.format)}, ${x.toMove.includes(x.seat) ? "your move" : "their move"}`)).join("")}
      </section>` : ""}
      ${m.outgoing.length ? `<section class="tg-block"><h2 class="tg-h2">Waiting for an answer</h2>
        ${m.outgoing.map((x) => matchRowHtml(x, `<button type="button" class="ghost sm" data-call-off="${x.id}">Call off</button>`, `${esc(x.deckName)}, ${timeLeft(x.deadline - now)} left`)).join("")}
      </section>` : ""}
      <section class="tg-block"><h2 class="tg-h2">Friends</h2>
        ${friends.length ? friends.map((f) => `<article class="rt-box tg-deck tg-pvp-row">
          ${markHtml(f, f.online)}
          <div class="tg-deck-main"><h3>${esc(f.name || handleOf(f))}</h3><p>@${esc(f.handle)}${f.online ? ", online now" : ""}</p></div>
          <div class="tg-deck-keys"><button type="button" class="ghost sm" data-challenge="${esc(f.handle)}"${chosen && !busyWith.has(f.handle) ? "" : " disabled"}>${busyWith.has(f.handle) ? "Playing" : "Challenge"}</button></div>
        </article>`).join("") : `<p class="rt-empty tg-none">No friends yet. Add some from their profile, then challenge them here.</p>`}
      </section>
      ${m.recent.length ? `<section class="tg-block tg-pvp-recent"><h2 class="tg-h2">Lately</h2>
        <ul>${m.recent.map((x) => `<li><b>${esc(handleOf(x.them))}</b><span>${esc(resultOf(x))}</span></li>`).join("")}</ul>
      </section>` : ""}`}
    </div>`;
  }

  async function lobbyAct(kind, id) {
    const deck = decks.find((x) => x.id === lobby.deckId);
    const send = deck ? { name: deck.name, format: deck.format, cards: deck.cards } : null;
    try {
      if (kind === "challenge") {
        await api("/api/tcg/challenge", { method: "POST", body: JSON.stringify({ to: id, deck: send }) });
        toast(`Challenge sent to @${id}.`);
      } else if (kind === "accept") {
        const res = await api(`/api/tcg/matches/${id}/accept`, { method: "POST", body: JSON.stringify({ deck: send }) });
        return deps.navigate(`/play/online/${res.match.id}`);
      } else {
        await api(`/api/tcg/matches/${id}/${kind}`, { method: "POST", body: "{}" });
      }
    } catch (err) {
      toast(err.message || "That didn't go through.");
    }
    return loadLobby();
  }

  /* ---------- taps on the table ---------- */

  function tapHand(uid) {
    const state = match.state;
    if (match.busy) return;
    if (state.phase === "setup" && match.online && state.players[ME].placed) return;
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
      if (p !== ME || inLesson() || (match.online && state.players[ME].placed)) return;
      // Tap a placed Pokémon to take it back.
      if (spot === ACTIVE) match.setup = { active: match.setup.bench.shift() || null, bench: match.setup.bench };
      else match.setup.bench.splice(spot, 1);
      return paintTable();
    }
    const slot = p === ME ? (spot === ACTIVE ? state.players[ME].active : state.players[ME].bench[spot]) : spot === ACTIVE ? state.players[BOT].active : state.players[BOT].bench[spot];
    if (!slot) return;
    const acts = legal();
    const waiting = state.pending[0];
    if (waiting?.type === "pick" && waiting.player === ME) {
      if (waiting.side === p && waiting.spots.includes(spot)) return run({ type: "pick", player: ME, spot });
      return lookAtSlot(slot);
    }
    if (p === ME) {
      if (waiting?.type === "promote" && waiting.player === ME && spot !== ACTIVE) return run({ type: "promote", player: ME, spot });
      const sel = match.sel;
      if (sel?.kind === "retreat" && spot !== ACTIVE) return run({ type: "retreat", player: ME, to: spot });
      if (sel?.kind === "hand") {
        const id = state.cards[sel.uid];
        const hit = acts.find((a) => (a.type === "evolve" || a.type === "attach" || a.type === "tool") && a.spot === spot && state.cards[a.uid] === id);
        if (hit) return run({ ...hit, uid: sel.uid });
      }
      if (spot === ACTIVE && myTurn() && !sel) {
        match.sheet = "attacks";
        return paintTable();
      }
      if (spot !== ACTIVE && myTurn() && !sel && !waiting && d(slot.uid).ability?.use) {
        match.sheet = "ability";
        match.sheetSpot = spot;
        return paintTable();
      }
    }
    lookAtSlot(slot);
  }

  function lookAtSlot(slot) {
    const state = match.state;
    const def = d(slot.uid);
    const energy = energyOf(state, slot, defs);
    openLook(state.cards[slot.uid], `<p class="tg-look-meta">${hpLeft(state, slot, defs)} of ${maxHp(state, slot, defs)} HP left${energy.length ? `, ${pips(energy)}` : ", no Energy"}</p>${slot.tool ? `<p class="tg-look-note">${esc(defOf(state, slot.tool, defs).name)}: ${esc(defOf(state, slot.tool, defs).text)}</p>` : ""}`);
  }

  /* ---------- dragging a card out of the hand ----------
     Press a hand card and pull: it follows the finger or the mouse, the places it can go
     light up as they do for a tap, and letting go over one plays it. A press that doesn't
     move stays a tap. */

  let drag = null;
  /** Where a dropped card was let go, so its flight starts there and not back in the hand. */
  let dropFrom = null;
  let dragEndedAt = 0;
  const LIFT = 46; // a finger hides what is under it: the card rides above the touch
  const HOLD_MS = 450; // held still this long: the card opens to read instead of being dragged
  const STILL = 9; // px a press may wander and still count as held in place

  function dropPoint(e) {
    return { x: e.clientX, y: e.clientY - (drag.touch ? LIFT : 0) };
  }

  /** What is under the dragged card: one of your Pokémon, your Bench, or just the field. */
  function dropTarget(e) {
    const { x, y } = dropPoint(e);
    const el = document.elementFromPoint(x, y);
    const mon = el?.closest?.(`.tg-mon[data-p="${ME}"]`);
    if (mon) return { el: mon, spot: Number(mon.dataset.spot) };
    const active = el?.closest?.(".tg-spot-me");
    if (active) return { el: active, spot: ACTIVE, empty: true };
    const bench = el?.closest?.("[data-bench]");
    if (bench) return { el: root.querySelector(".tg-bench-me"), bench: true };
    const hand = rectOf(".tg-hand");
    return { el: null, field: !hand || y < hand.top };
  }

  function dragStart(e) {
    const card = e.target.closest?.("[data-hand]");
    if (!card || !match || route.name !== "match" || match.over || (e.pointerType === "mouse" && e.button !== 0)) return;
    const setup = match.state.phase === "setup";
    // Holding a card still opens it to read, any time; pulling it plays it, on your own turn.
    const still = match.busy || (!setup && !myTurn());
    drag = { uid: card.dataset.hand, x: e.clientX, y: e.clientY, id: e.pointerId, touch: e.pointerType !== "mouse", live: false, still, ghost: null, over: null, src: card.querySelector("img")?.src || "", w: card.getBoundingClientRect().width };
    const held = drag;
    held.timer = setTimeout(() => {
      if (drag !== held || held.live) return;
      held.examined = true;
      card.classList.add("is-held");
      setTimeout(() => card.classList.remove("is-held"), 260);
      deps.buzz?.(10);
      openLook(match.state.cards[held.uid]);
    }, HOLD_MS);
    document.addEventListener("pointermove", dragMove, { passive: false });
    document.addEventListener("pointerup", dragEnd);
    document.addEventListener("pointercancel", dragCancel);
  }

  function dragMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    if (drag.examined) return void e.preventDefault();
    if (!drag.live) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < STILL) return;
      clearTimeout(drag.timer);
      if (drag.still || match.busy) return dragCancel();
      drag.live = true;
      // Selecting it lights the places it can go, exactly as a tap would.
      // The places it can go light up as they would for a tap. The table is not repainted here:
      // replacing the card under a finger would end the touch.
      const state = match.state;
      const card = root.querySelector(`.tg-hand [data-hand="${drag.uid}"]`);
      root.querySelectorAll(".tg-hand .is-chosen").forEach((el) => el.classList.remove("is-chosen"));
      card?.classList.add("is-dragging");
      if (state.phase !== "setup") {
        match.sel = { kind: "hand", uid: drag.uid };
        const id = state.cards[drag.uid];
        for (const a of legal()) {
          if (!a.uid || state.cards[a.uid] !== id) continue;
          if (a.type === "evolve" || a.type === "attach" || a.type === "tool") root.querySelector(monSel(ME, a.spot))?.classList.add("is-target");
          if (a.type === "bench") {
            root.querySelector(".tg-bench-me")?.classList.add("is-open");
            root.querySelector(".tg-bench-me .tg-hole")?.classList.add("is-target");
          }
        }
        const text = root.querySelector(".tg-prompt p");
        if (text) text.textContent = promptOf().text;
      }
      const ghost = document.createElement("img");
      ghost.className = "tg-drag";
      ghost.alt = "";
      ghost.src = drag.src;
      ghost.style.width = `${Math.round(drag.w * 1.12)}px`;
      fx?.appendChild(ghost);
      drag.ghost = ghost;
    }
    e.preventDefault();
    const { x, y } = dropPoint(e);
    const w = drag.w * 1.12;
    if (drag.ghost) drag.ghost.style.transform = `translate(${Math.round(x - w / 2)}px, ${Math.round(y - w * 0.7)}px) rotate(-3deg)`;
    const over = dropTarget(e).el;
    if (over !== drag.over) {
      drag.over?.classList.remove("drop-over");
      over?.classList.add("drop-over");
      drag.over = over;
    }
  }

  function dragDone() {
    document.removeEventListener("pointermove", dragMove);
    document.removeEventListener("pointerup", dragEnd);
    document.removeEventListener("pointercancel", dragCancel);
    const was = drag;
    drag = null;
    clearTimeout(was?.timer);
    was?.over?.classList.remove("drop-over");
    const rect = was?.ghost?.getBoundingClientRect() || null;
    was?.ghost?.remove();
    return { was, rect };
  }

  function dragCancel() {
    const { was } = dragDone();
    if (!was?.live || !match) return;
    match.sel = null;
    paintTable();
  }

  function dragEnd(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const live = drag.live;
    const target = live ? dropTarget(e) : null;
    const { was, rect } = dragDone();
    // A hold that opened the card: letting go leaves it open, and isn't a tap.
    if (was.examined) return void (dragEndedAt = Date.now());
    if (!live || !match) return; // it never moved: the click that follows is a tap
    dragEndedAt = Date.now();
    const state = match.state;
    const uid = was.uid;
    if (state.phase === "setup") {
      // Anywhere on the field places it: the first one down is the Active Pokémon.
      if (target.el || target.field) tapHand(uid);
      else paintTable();
      return;
    }
    const id = state.cards[uid];
    const acts = legal().filter((a) => a.uid && state.cards[a.uid] === id);
    const onto = target.spot != null && !target.empty ? acts.find((a) => (a.type === "evolve" || a.type === "attach" || a.type === "tool") && a.spot === target.spot) : null;
    const down = acts.find((a) => a.type === "bench" || a.type === "play");
    const play = onto || ((target.el || target.field) && down) || null;
    if (play) {
      dropFrom = rect;
      return run({ ...play, uid });
    }
    // Let go over nothing it can use: back in the hand, or still held if it was dropped on the field.
    if (!(target.field || target.el) || !acts.length) match.sel = null;
    paintTable();
  }

  root.addEventListener("pointerdown", dragStart);
  // A long press would otherwise bring up the browser's own menu over the card.
  root.addEventListener("contextmenu", (e) => {
    if (e.target.closest?.(".tg-hand [data-hand]")) e.preventDefault();
  });

  function tapBench() {
    const sel = match.sel;
    if (match.busy || sel?.kind !== "hand") return;
    const state = match.state;
    const id = state.cards[sel.uid];
    if (legal().some((a) => a.type === "bench" && state.cards[a.uid] === id)) run({ type: "bench", player: ME, uid: sel.uid });
  }

  function tableAct(act) {
    const state = match.state;
    if ((act === "go-first" || act === "go-second") && match.online) {
      match.opening = false;
      match.line = act === "go-first" ? "You go first." : `${foeName()} goes first.`;
      return run({ type: "order", player: ME, first: act === "go-first" });
    }
    if (act === "go-first" || act === "go-second") {
      apply(state, { type: "order", player: ME, first: act === "go-first" }, defs);
      saveMatch();
      match.line = act === "go-first" ? "You go first." : `${foeName()} goes first.`;
      match.opening = false;
      return paintTable();
    }
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
    if (act === "again" && match.online) return deps.navigate("/play/friends");
    if (act === "again") {
      const id = match.deckId;
      match = null;
      return startMatch(id).then(() => paint());
    }
    if (act === "leave") {
      if (state.phase === "over") return deps.navigate(match.online ? "/play/friends" : "/play");
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
      if (match.online) return run({ type: "concede", player: ME });
      apply(state, { type: "concede", player: ME }, defs);
      return finish();
    }
    if (match.busy) return;
    if (act === "cancel") {
      match.sel = null;
      match.sheet = "";
      return paintTable();
    }
    if (act === "stadium") {
      if (match.busy) return;
      match.sheet = "stadium";
      return paintTable();
    }
    if (act === "stadium-use") return run({ type: "stadium", player: ME });
    if (act === "ability-use") return run({ type: "ability", player: ME, spot: match.sheet === "ability" ? match.sheetSpot : ACTIVE });
    if (act === "ability-yes") return run({ type: "pick", player: ME, spot: state.pending[0].spots[0] });
    if (act === "look-spot") return lookAtSlot(slotOf(ME, match.sheetSpot));
    if (act === "choose-done") {
      const uids = [...(match.choice || [])];
      match.choice = null;
      return run({ type: "choose", player: ME, uids });
    }
    if (act === "play-card" && match.sel?.kind === "hand") return run({ type: "play", player: ME, uid: match.sel.uid });
    if (act === "pick-skip") return run({ type: "pick", player: ME, spot: null });
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
    const table = (route.name === "match" && match && !match.online) || (route.name === "online" && match?.online);
    document.body.classList.toggle("tg-playing", Boolean(table));
    if (table) return paintTable();
    fxLayer(false);
    if (route.name === "friends") {
      root.innerHTML = friendsHtml();
      return;
    }
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

    if (route.name === "friends") {
      const key = t.closest("[data-challenge], [data-accept], [data-decline], [data-call-off]");
      if (!key || key.disabled) return;
      key.disabled = true;
      if (key.dataset.challenge) return lobbyAct("challenge", key.dataset.challenge);
      if (key.dataset.accept) return lobbyAct("accept", key.dataset.accept);
      if (key.dataset.decline) return lobbyAct("decline", key.dataset.decline);
      return lobbyAct("cancel", key.dataset.callOff);
    }
    if ((route.name === "match" || route.name === "online") && match) {
      const act = t.closest("[data-act]");
      if (act) return tableAct(act.dataset.act);
      const choice = t.closest("[data-choose]");
      if (choice) return tapChoice(choice.dataset.choose);
      const attack = t.closest("[data-attack]");
      if (attack && !attack.disabled) return run({ type: "attack", player: ME, index: Number(attack.dataset.attack) });
      const hand = t.closest("[data-hand]");
      if (hand) return Date.now() - dragEndedAt < 350 ? undefined : tapHand(hand.dataset.hand);
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
    if (route.name === "friends" && e.target.id === "tg-pvp-deck") {
      lobby.deckId = e.target.value;
      root.innerHTML = friendsHtml();
      return;
    }
    const deck = route.name === "deck" ? deckById(route.id) : null;
    if (deck && e.target.id === "tg-type") {
      editor.type = e.target.value;
      repaintEditor(deck);
    }
  });
  document.addEventListener("keydown", (e) => {
    if (!shown || e.key !== "Escape") return;
    if (root.querySelector(".tg-look-holder")) return closeLook();
    if (match && (route.name === "match" || route.name === "online") && (match.sel || match.sheet === "attacks")) tableAct("cancel");
  });

  function parse(path) {
    const deck = path.match(/^\/play\/deck\/([a-z0-9]+)$/);
    if (deck) return { name: "deck", id: deck[1] };
    if (path === "/play/match") return { name: "match" };
    if (path === "/play/friends") return { name: "friends" };
    const online = path.match(/^\/play\/online\/([a-f0-9]{20})$/);
    if (online) return { name: "online", id: online[1] };
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
    // A match against a friend and one against the bot never share the table.
    if (route.name === "match" && match?.online) match = null;
    if (route.name === "online" && (!match?.online || match.online.id !== route.id)) {
      let opened = null;
      try {
        opened = await openOnline(route.id);
      } catch (err) {
        toast(err.message || "Couldn't open that match.");
      }
      if (!shown) return;
      if (!opened || opened.waiting) {
        if (opened?.waiting) toast(`Waiting for ${handleOf(opened.waiting.them)} to accept.`);
        deps.navigate("/play/friends");
        return;
      }
    }
    if (route.name === "friends") {
      await ensureCards(decks.flatMap((deck) => Object.keys(deck.cards)));
      if (!shown) return;
      paint();
      loadLobby().then(lobbySoon);
      return;
    }
    if (route.name === "hub" && deps.signedIn?.()) loadLobby().then(() => shown && route.name === "hub" && lobby.matches && (lobby.matches.incoming.length || lobby.matches.live.length) && paint());
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
    if (route.name === "online" && match?.online) {
      tickClock();
      pollSoon(300);
    }
  }

  function hide() {
    shown = false;
    clearTimeout(pollTimer);
    clearTimeout(lobbyTimer);
    clearInterval(clockTimer);
    closeLook();
    if (drag) dragDone();
    fxLayer(false);
    document.body.classList.remove("tg-playing");
  }

  return { show, hide };
}
