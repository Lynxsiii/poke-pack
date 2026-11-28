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

import { ACTIVE, FORMATS, RuleError, abilityBlock, abilityOn, apply, attacksOf, canRetreat, costFor, dropBlock, conditionsOn, createGame, damageAfterTyping, defOf, energyOf, hpLeft, legalActions, markOn, marksOn, maxHp, other, retreatCost, shieldOn, stadiumBlock, toolOf, trainerBlock, unpaid, usableAttacks } from "./tcg/engine.js";
import { ENERGY_TYPES, FREE_ENERGY, createDefs, isFreeEnergy } from "./tcg/cards.js";
import { botAction } from "./tcg/bot.js";
import { MAX_DECKS, buildBotDeck, buildDeck, checkDeck, deckList, deckSize, notLegal, roomFor, rulesOf } from "./tcg/decks.js";
import { BOT_FALLBACK, DECK_FORMATS, FORMAT_NOTES } from "./tcg/formats.js";
import { LESSON, LESSON_CARDS, LESSON_SET, createLesson } from "./tcg/tutorial.js";
import { coinStageHTML, flipCoin } from "./coin.js?v=9";
import { api } from "./api.js";
import { XP_WEIGHTS } from "./xp.js";

/** The seats on the table. A match against a friend can put you in seat 1 (worker/tcg.js), so these follow the match. */
let ME = 0;
let BOT = 1;
const BOT_NAME = "House bot";
/** How hard the house bot plays (js/tcg/bot.js botAction, js/tcg/decks.js buildBotDeck). */
const LEVELS = [
  { id: "easy", name: "Easy", note: "The house bot plays a beginner's deck and misses plays.", line: "A beginner's deck, misses plays" },
  { id: "normal", name: "Normal", note: "The house bot plays a sound one-prize deck from your main set.", line: "A sound deck from your main set" },
  { id: "hard", name: "Hard", note: "The house bot plays the best deck your main set can make, Pokémon ex and V included.", line: "Your set's best deck, ex and V too" },
];
const levelName = (id) => LEVELS.find((l) => l.id === id)?.name || "Normal";
/** XP a win pays at each level (worker/tcg.js counts at most BOT_DAILY_WINS a day, and only after two minutes). */
const levelXp = (id) => XP_WEIGHTS[{ easy: "tcgEasy", normal: "tcgNormal", hard: "tcgHard" }[id] || "tcgNormal"];
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
const markLabel = (m) => ({ noAttack: "Can't attack", noUse: `No ${m.name}`, costMore: `Attacks +${m.n} Colorless`, retreatMore: `Retreat +${m.n}`, ward: "Protected", dodge: "Flips to dodge", endure: `Survives at ${m.n} HP`, doomCond: `${COND_NAME[m.name] || "Condition"} at turn end`, lostKo: "Lost Zone if KO'd", less: `-${m.n} damage`, shield: "Protected", guard: "No damage", noRetreat: "Can't retreat", mustFlip: "Flips to attack", stronger: `+${m.n} damage`, weaker: `Does -${m.n}`, exposed: `Takes +${m.n}`, harden: `Ignores ${m.n} or less`, noWeakness: "No Weakness", spite: m.mirror ? "Hits back in kind" : `Hits back ${m.n / 10}`, bounty: `+${m.n} Prize if KO`, base: `${m.name}: ${m.n}`, noHeal: "Can't be healed", noAbility: m.from === "Ability" ? "No Abilities" : "No Poké-Powers", doom: `${m.n / 10} counters at turn end`, noEnergy: "No Energy from hand", noEvolve: "Can't evolve", attachEnds: "Energy ends turn" })[m.kind] || "";

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
  /** The bot's level for the next match, kept on the device. */
  let level = "normal";
  let draft = { open: false, format: "standard" };
  let editor = { tab: "cards", query: "", type: "", bumped: "" };
  /** Where the editor's bar last stood for each deck, so the next paint slides from there. */
  const meterWas = new Map();
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
  const saveMatch = () => !match?.online && write("match", match && match.state.phase !== "over" ? { state: match.state, deckId: match.deckId, botSet: match.botSet, botTheme: match.botTheme || "", level: match.level || "normal", ticket: match.ticket || "", lesson: match.lesson ?? null } : null);

  /* ---------- loading ---------- */

  function load() {
    loading ||= (async () => {
      const json = (url) =>
        fetch(url, { cache: "no-cache" }).then((r) => {
          if (!r.ok) throw new Error(r.status);
          return r.json();
        });
      const [table, trainerText, legal] = await Promise.all([json("data/tcg/rules.json"), json("data/tcg/trainers.json"), json("data/tcg/legal.json"), deps.loadOwnedSets()]);
      rules = table;
      defs = createDefs(deps.findCard, rules, trainerText, legal);
      decks = read("decks", []).filter((d) => d && d.cards && FORMATS[d.format]);
      // Decks from before the tournament formats (no `v`): the old "Full deck" took any card, which is
      // Unlimited now. An old Half deck stays as it is and shows as not legal until it is switched.
      for (const d of decks) {
        if (d.v) continue;
        if (d.format === "standard") d.format = "unlimited";
        d.v = 2;
      }
      record = read("record", record);
      record.levels ||= {};
      level = LEVELS.some((l) => l.id === read("level", "")) ? read("level", "") : "normal";
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
  /** Attached Energy, never overlapped: every symbol while there are few, then one symbol and a count for each type. */
  const pipRow = (types, max = 4) => {
    if (types.length <= max) return pips(types);
    const n = new Map();
    for (const type of types) n.set(type, (n.get(type) || 0) + 1);
    return [...n].map(([type, count]) => `${pip(type)}${count > 1 ? `<b class="tg-pip-n">${count}</b>` : ""}`).join("");
  };
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

  const leadOf = (deck) => (deck.lead && deck.cards[deck.lead] && deck.lead) || Object.keys(deck.cards).find((id) => defs(id)?.kind === "pokemon");
  /** The chosen deck: the one last tapped, played, edited or made (kept as "pick"), else the newest. */
  const pickedDeck = () => deckById(read("pick", "")) || decks[decks.length - 1] || null;
  const pickDeck = (id) => deckById(id) && write("pick", id);

  /** Three of a deck's Pokémon for the fan: its lead in the middle, the two it runs most either side. */
  function fanIds(deck) {
    const lead = leadOf(deck);
    const names = new Set(lead ? [defs(lead)?.name] : []);
    const rest = [];
    for (const [id] of Object.entries(deck.cards).sort((a, b) => b[1] - a[1])) {
      const def = defs(id);
      if (id === lead || def?.kind !== "pokemon" || names.has(def.name)) continue;
      names.add(def.name);
      rest.push(id);
    }
    return [rest[0], lead, rest[1]].filter((id) => id && cardOf(id));
  }

  function fanHtml(ids) {
    if (!ids.length) return `<span class="tg-fan is-empty" aria-hidden="true"><i></i><i></i><i></i></span>`;
    return `<span class="tg-fan" data-n="${ids.length}" aria-hidden="true">${ids.map((id) => `<img src="${img(id)}" alt="" decoding="async" draggable="false" />`).join("")}</span>`;
  }

  /** A deck in "Your decks": a flat tile. Tapping it chooses it (`data-pick`); the chosen one wears the yellow shadow. */
  function deckRowHtml(deck, chosen = false) {
    const check = checkDeck(deck, owned(), defs);
    const lead = leadOf(deck);
    return `<button type="button" class="tg-dk${chosen ? " on" : ""}${check.ok ? "" : " bad"}" data-pick="${esc(deck.id)}" aria-pressed="${chosen}">
      <span class="tg-dk-art">${lead && cardOf(lead) ? `<img src="${img(lead)}" alt="" loading="lazy" decoding="async" draggable="false" />` : ""}</span>
      <b class="tg-dk-name">${esc(deck.name)}</b>
      ${check.ok ? "" : `<small class="tg-dk-state">${esc(check.problems[0])}</small>`}
    </button>`;
  }

  /** The hero: the chosen deck, its fan, and the one yellow key. */
  function heroHtml(deck) {
    const check = checkDeck(deck, owned(), defs);
    const played = record.wins + record.losses;
    return `<section class="rt-box tg-hero">
      ${fanHtml(fanIds(deck))}
      <div class="tg-hero-main">
        <h2 class="tg-hero-name">${esc(deck.name)}</h2>
        <p class="tg-meta"><span class="tg-pips">${pips(typesOf(deck))}</span>${deck.theme ? "Pre-made, " : ""}${FORMATS[deck.format].name}, ${check.size} of ${check.need} cards</p>
        ${check.ok ? (played ? `<p class="tg-meta">Won ${record.wins} of ${played} against the bot</p>` : "") : `<p class="tg-hero-why">${esc(check.problems[0])}</p>`}
        <div class="tg-hero-keys">
          <button type="button" class="solid rt-go" data-play="${esc(deck.id)}"${check.ok ? "" : " disabled"}>Play</button>
          <button type="button" class="tlink" data-edit="${esc(deck.id)}">Edit</button>
        </div>
      </div>
    </section>`;
  }

  /** The cards of a saved match the hero shows: your Active Pokémon in the middle, two of your Bench beside it. */
  function resumeIds(resume) {
    const side = resume?.state?.players?.[0];
    const id = (slot) => (slot?.uid ? resume.state.cards[slot.uid] : null);
    return [id(side?.bench?.[0]), id(side?.active), id(side?.bench?.[1])].filter(Boolean);
  }

  /** A match is waiting: it takes the hero's place, and its key goes back to the table. */
  function resumeHtml(resume) {
    // Before anything is in play (the opening), the fan shows the deck the match is played with.
    const inPlay = resumeIds(resume).filter((id) => cardOf(id));
    const deck = deckById(resume.deckId);
    return `<section class="rt-box tg-hero tg-hero-resume">
      ${fanHtml(inPlay.length ? inPlay : deck ? fanIds(deck) : [])}
      <div class="tg-hero-main">
        <h2 class="tg-hero-name">${resume.lesson != null ? "Your lesson is waiting" : "A match is waiting"}</h2>
        <p class="tg-meta">Turn ${Math.max(1, resume.state.turn)} against the ${BOT_NAME}</p>
        <div class="tg-hero-keys"><button type="button" class="solid rt-go" data-go="/play/match">Back to it</button></div>
      </div>
    </section>`;
  }

  /** One row of "Who to play": an ink label cut on the slant, a name, one line, an action word. */
  const rowHtml = (attrs, lab, name, line, val, cls = "") =>
    `<button type="button" class="rt-row tg-row${cls}" ${attrs}><span class="rt-row-lab">${lab}</span><span class="rt-row-name">${name}<small>${line}</small></span><span class="rt-row-val">${val}</span></button>`;

  function hubHtml() {
    const resume = read("match", null);
    const waiting = resume?.state && resume.state.phase !== "over";
    // Only the empty hub prints the count; the draft only asks whether there is one. A big collection is
    // thousands of cards to read the rules of, so don't count them all when no one will see the number.
    const canPlay = ([id, n]) => n > 0 && defs(id)?.kind === "pokemon" && defs(id).playable;
    const playable = !decks.length ? Object.entries(owned()).filter(canPlay).length : draft.open ? Number(Object.entries(owned()).some(canPlay)) : 0;
    const learned = read("learned", false);
    const chosen = pickedDeck();
    const incoming = lobby.matches?.incoming.length || 0;
    const live = lobby.matches?.live.length || 0;
    const learnLink = learned ? `<button type="button" class="tlink tg-relearn" data-lesson>Learn to play</button>` : "";
    const hero = waiting
      ? resumeHtml(resume)
      : chosen
        ? heroHtml(chosen)
        : `<section class="rt-box tg-hero tg-hero-empty">
          ${fanHtml([])}
          <div class="tg-hero-main">
            <h2 class="tg-hero-name">No deck yet</h2>
            <p class="tg-meta">${playable ? `You own ${playable} Pokémon you can play.` : "Rip a few packs first: a deck needs Pokémon you own."}</p>
            ${draft.open ? "" : `<div class="tg-hero-keys"><button type="button" class="solid rt-go" data-new>New deck</button></div>`}
          </div>
        </section>`;
    return `<div class="tg-page tg-hub">
      <header class="tg-head"><h1 class="page-title tg-title">Play</h1></header>
      ${hero}
      ${!decks.length && draft.open ? draftHtml(playable) : ""}
      <section class="tg-block tg-who">
        <div class="tg-hd"><h2 class="tg-h2">Who to play</h2>${decks.length ? "" : learnLink}</div>
        ${learned ? "" : rowHtml("data-lesson", "Lesson", `Learn to play <span class="rt-tag">New</span>`, "Borrowed cards and a coach, about three minutes", "Start")}
        ${levelPickHtml()}
        ${rowHtml('data-go="/play/friends"', "Online", "Quick match", live ? `${live === 1 ? "A match is" : `${live} matches are`} on` : "Any trainer, same format", live && !incoming ? "Back to it" : "Find")}
        ${rowHtml('data-go="/play/friends"', "Friend", `Challenge a friend${incoming ? ` <span class="rt-tag">${incoming}</span>` : ""}`, incoming ? `${plural(incoming, "challenge")} waiting for you` : "Pick a friend and a deck", incoming ? "See" : "Open")}
      </section>
      ${decks.length ? `<section class="tg-block tg-decks">
        <div class="tg-hd"><h2 class="tg-h2">Your decks</h2>${learnLink}</div>
        <div class="tg-dks">
          ${decks.map((deck) => deckRowHtml(deck, deck.id === chosen?.id)).join("")}
          ${decks.length < MAX_DECKS && !draft.open ? `<button type="button" class="tg-dk tg-dk-new" data-new><span>New deck</span></button>` : ""}
        </div>
        ${draft.open ? draftHtml(playable) : ""}
      </section>` : ""}
    </div>`;
  }

  /** The house bot's row in "Who to play", with its level folded in as slanted words (`data-level`) and that level's record. */
  function levelPickHtml() {
    const now = LEVELS.find((l) => l.id === level) || LEVELS[1];
    const at = record.levels?.[now.id];
    const tally = at && at.wins + at.losses ? `, won ${at.wins} of ${at.wins + at.losses}${at.streak > 1 ? `, ${at.streak} in a row` : ""}` : "";
    return `<div class="rt-row tg-row tg-row-bot">
        <span class="rt-row-lab">Bot</span>
        <span class="rt-row-name">${BOT_NAME}<small>${esc(now.line)}${tally}${deps.signedIn?.() ? `. A win pays ${levelXp(now.id)} XP, up to 10 wins a day` : ""}</small>
          <span class="tg-levels" role="group" aria-label="House bot level">
            ${LEVELS.map((l) => `<button type="button" class="rt-word${l.id === now.id ? " on" : ""}" data-level="${l.id}" aria-pressed="${l.id === now.id}">${l.name}</button>`).join("")}
          </span>
        </span>
        <span class="rt-row-val">Chosen</span>
      </div>`;
  }

  /** The three tournament formats (js/tcg/formats.js) as a segmented choice; `data-format` sets the draft's or the open deck's. */
  function formatSegHtml(current) {
    return `<div class="seg tg-seg" role="group" aria-label="Format">
        ${DECK_FORMATS.map((id) => `<button type="button" class="seg-btn${current === id ? " on" : ""}" data-format="${id}" aria-pressed="${current === id}">${FORMATS[id].name}</button>`).join("")}
      </div>`;
  }

  const formatNote = (format) => `${FORMAT_NOTES[format] || ""} 60 cards, 6 prizes, up to 4 of a card by name.`;

  function draftHtml(playable) {
    return `<div class="rt-box tg-draft">
      <h3>New deck</h3>
      ${formatSegHtml(draft.format)}
      <p class="tg-draft-note">${formatNote(draft.format)}</p>
      <p class="tg-draft-note">Want one ready to play? Theme Decks and Battle Decks in the shop arrive here as decks.</p>
      <div class="tg-draft-keys">
        <button type="button" class="solid" data-empty>Start building</button>
        <button type="button" class="tlink" data-cancel>Cancel</button>
      </div>
    </div>`;
  }

  function newDeck(cards, types = []) {
    const base = types.length ? `${types.join(" and ")} deck` : "New deck";
    let name = base;
    for (let n = 2; decks.some((d) => d.name === name); n += 1) name = `${base} ${n}`;
    const deck = { id: `d${Date.now().toString(36)}`, name, format: draft.format, cards, v: 2 };
    decks.push(deck);
    saveDecks();
    write("pick", deck.id);
    draft.open = false;
    return deck;
  }

  /**
   * Pre-made decks the player opened in the shop (js/app.js keepThemeDeck):
   * each becomes a deck under its own name, made of the cards that came in it.
   * Buying one is the only way to get a ready-made deck.
   */
  async function takeThemeDecks() {
    const inboxKey = `pp-tcg-inbox-v1:${deps.storeKey()}`;
    let inbox = [];
    try {
      inbox = JSON.parse(localStorage.getItem(inboxKey) || "[]");
    } catch {
      return;
    }
    if (!Array.isArray(inbox) || !inbox.length) return;
    await ensureCards(inbox.flatMap((item) => Object.keys(item.cards || {})));
    for (const item of inbox) {
      if (!item?.cards || !item.name) continue;
      let name = item.name;
      for (let n = 2; decks.some((d) => d.name === name); n += 1) name = `${item.name} ${n}`;
      const ids = Object.keys(item.cards);
      const lead = (defs(ids[0])?.kind === "pokemon" && ids[0]) || ids.find((id) => defs(id)?.kind === "pokemon" && defs(id)?.stage !== "basic") || ids.find((id) => defs(id)?.kind === "pokemon") || null;
      decks.push({ id: `t${(item.at || Date.now()).toString(36)}${decks.length}`, v: 2, name, format: themeFormat(item.cards), cards: { ...item.cards }, theme: item.product || true, lead });
    }
    saveDecks();
    try {
      localStorage.removeItem(inboxKey);
    } catch {
      /* it is read again next time; the names keep their number */
    }
  }

  /** The format a pre-made deck is played in as printed: the newest one its cards are all legal in. */
  function themeFormat(cards) {
    for (const id of ["standard", "expanded", "unlimited"]) {
      if (!FORMATS[id]) continue;
      if (checkDeck({ format: id, cards }, cards, defs).ok) return id;
    }
    return FORMATS.unlimited ? "unlimited" : "standard";
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
    return `<span class="tg-step${editor.bumped === id ? " is-bump" : ""}">
      <button type="button" data-less="${esc(id)}" aria-label="Take one ${esc(label)} out"${count ? "" : " disabled"}>&minus;</button>
      <b>${count}</b>${of ? `<small>${of}</small>` : ""}
      <button type="button" data-more="${esc(id)}" aria-label="Add one ${esc(label)}"${room > 0 ? "" : " disabled"}>+</button>
    </span>`;
  }

  function tileHtml(deck, row) {
    const { id, def } = row;
    const room = roomFor(deck, id, owned(), defs);
    // A card the deck's format doesn't allow stays in view, greyed, with the reason.
    const why = notLegal(def, deck.format);
    const n = row.inDeck;
    const name = esc(def.name);
    // The count strip on its ink plate: minus, the count, plus. A card you own but left out says Add instead.
    return `<div class="tg-tile${n ? " in" : ""}${why ? " off" : ""}">
      <button type="button" class="tg-tile-face" data-look="${esc(id)}" aria-label="Look at ${name}">
        <img src="${img(id)}" alt="" loading="lazy" decoding="async" draggable="false" />
      </button>
      <span class="tg-ct${editor.bumped === id ? " is-bump" : ""}" title="${n} in the deck, ${row.owned} owned">
        <button type="button" data-less="${esc(id)}" aria-label="Take one ${name} out"${n ? "" : " disabled"}>&minus;</button>
        ${n ? `<b>${n}</b>` : `<button type="button" class="tg-ct-add" data-more="${esc(id)}" aria-label="Add one ${name}"${room > 0 ? "" : " disabled"}>Add</button>`}
        <button type="button" data-more="${esc(id)}" aria-label="Add one ${name}, ${row.owned} owned"${room > 0 ? "" : " disabled"}>+</button>
      </span>
      <b class="sr-only">${name}, ${n} of ${row.owned}</b>
      ${why ? `<span class="tg-tile-why" title="${esc(why)}">Not in ${esc(FORMATS[deck.format].name)}</span>` : ""}
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
      <h3>Basic Energy <small>Free, as many as you need</small></h3>
      ${rows.map((r) => `<div class="tg-energy-row">${pip(r.type)}<span>${esc(r.type)}</span>${stepHtml(r.id, r.n, roomFor(deck, r.id, have, defs), `${r.type} Energy`)}</div>`).join("")}
    </div>`;
  }

  function summaryHtml(deck) {
    const check = checkDeck(deck, owned(), defs);
    const tally = (kind) => Object.entries(deck.cards).reduce((n, [id, c]) => n + (defs(id)?.kind === kind ? c : 0), 0);
    const mons = tally("pokemon");
    const trainers = tally("trainer");
    const energy = check.size - mons - trainers;
    // One bar filling toward the deck size, split by kind. Each part is a full-width layer scaled from the left,
    // so a change slides from where it was (--f0) to where it is (--f): transform only.
    const of = (n) => Number((n / Math.max(check.need, check.size, 1)).toFixed(4));
    const now = { p: of(mons), t: of(mons + trainers), e: of(check.size) };
    const was = meterWas.get(deck.id) || { p: 0, t: 0, e: 0 };
    meterWas.set(deck.id, now);
    const part = (k) => `<i class="tg-meter-${k}" style="--f:${now[k]};--f0:${was[k]}"></i>`;
    const cut = (k, next) => (now[k] > 0 && now[next] > now[k] ? `<b class="tg-meter-cut" style="--f:${now[k]};--f0:${was[k]}"></b>` : "");
    return `<div class="tg-meter${check.size > check.need ? " over" : ""}">
        <span class="tg-meter-track" aria-hidden="true"><span>${part("e")}${part("t")}${part("p")}${cut("p", "e")}${cut("t", "e")}</span></span>
        <span class="tg-meter-n${editor.bumped ? " is-bump" : ""}"><b>${check.size}</b>/${check.need}</span>
      </div>
      <p class="tg-legend"><span class="p">${mons} Pokémon</span><span class="t">${plural(trainers, "Trainer")}</span><span class="e">${energy} Energy</span></p>
      <div class="tg-sum-foot">
        <p class="tg-sum-state${check.ok ? " ok" : ""}">${check.ok ? "Ready to play." : esc(check.problems.slice(0, 2).join(" "))}</p>
        <button type="button" class="solid sm" data-play="${esc(deck.id)}"${check.ok ? "" : " disabled"}>Play</button>
      </div>`;
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
      <header class="tg-head tg-ed-head">
        <label class="tg-name"><span class="sr-only">Deck name</span><input type="text" id="tg-name" maxlength="32" value="${esc(deck.name)}" autocomplete="off" spellcheck="false" /></label>
        <button type="button" class="tlink tg-done" data-go="/play">Done</button>
      </header>
      <div class="tg-ed-format">
        ${formatSegHtml(deck.format)}
        <p class="tg-ed-note">${FORMATS[deck.format].pick ? formatNote(deck.format) : `${esc(FORMATS[deck.format].name)}s are retired. Pick a format above, then fill the deck to 60 cards.`}</p>
      </div>
      <div class="rt-box tg-sum rt-still" id="tg-sum">${summaryHtml(deck)}</div>
      <div class="tg-tools">
        <div class="tg-tabs" role="group" aria-label="Show">
          <button type="button" class="rt-word${editor.tab === "cards" ? " on" : ""}" data-tab="cards" aria-pressed="${editor.tab === "cards"}">Your cards</button>
          <button type="button" class="rt-word${editor.tab === "deck" ? " on" : ""}" data-tab="deck" aria-pressed="${editor.tab === "deck"}">In the deck${inDeck ? ` (${inDeck})` : ""}</button>
          <button type="button" class="tlink tg-fill" data-fill>Fill with Energy</button>
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
    // The count that changed pops as it lands.
    editor.bumped = id;
    repaintEditor(deck);
    editor.bumped = "";
  }

  /** Top the deck up with Energy, split by what its attacks ask for. */
  function fillEnergy(deck) {
    const space = rulesOf(deck.format).deckSize - deckSize(deck);
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
      ${def.attacks.length ? `<ul class="tg-look-attacks">${def.attacks.map((a) => `<li><span class="tg-pips">${a.cost.length ? pips(a.cost) : "Free"}</span><b>${esc(a.name)}</b><em>${a.damage || ""}</em>${a.text ? `<p${a.plain ? ' class="off"' : ""}>${a.plain ? "<b>Text not live yet:</b> only the printed damage lands. " : ""}${esc(a.text)}</p>` : ""}</li>`).join("")}</ul>` : ""}
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
          <div class="tg-links"><button type="button" class="tg-link" data-close>Close</button></div>
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
    // Its deck is legal in your deck's format too; when none of your sets gives one (a Standard deck
    // of old reprints), it takes a set that does (js/tcg/formats.js BOT_FALLBACK).
    const sets = Object.keys(count).sort((a, b) => count[b] - count[a]);
    for (const setId of BOT_FALLBACK[deck.format] || []) if (!sets.includes(setId)) sets.push(setId);
    let botDeck = null;
    let botSet = "";
    for (const setId of sets) {
      const list = await deps.loadSet(setId).catch(() => null);
      botDeck = list && buildBotDeck(list.map((c) => defs(c.id)), deck.format, Math.random, { level });
      if (botDeck) {
        botSet = setId;
        break;
      }
    }
    if (!botDeck) return toast("Couldn't build the bot a deck from your sets. Try another deck.");
    const seed = (Math.random() * 0xffffffff) >>> 0;
    botSeats();
    // The flip comes before the deal: its winner chooses who goes first without seeing a hand.
    const state = createGame({ decks: [deckList(deck), deckList(botDeck)], names: [deps.playerName(), BOT_NAME], format: deck.format, seed, chooseFirst: true }, defs);
    // A signed-in player's win can pay XP: the Worker hands out a ticket now and takes it back at the end.
    const ticket = deps.signedIn?.() ? await api("/api/tcg/bot/start", { method: "POST", body: JSON.stringify({ level }) }).then((r) => r.id || "").catch(() => "") : "";
    match = { state, deckId, botSet, botTheme: botDeck.theme || "", level, ticket, sel: null, sheet: "", busy: false, line: "", setup: { active: null, bench: [] }, opening: true, over: false };
    if (state.flipWinner === BOT) apply(state, botMove(state), defs);
    // The bot sets up as soon as there are hands; its cards stay face down until both are ready.
    if (state.dealt !== false) apply(state, botMove(state), defs);
    saveMatch();
    deps.navigate("/play/match");
  }

  /** The bot's next action at the match's level (the lesson's bot always plays it straight). */
  const botMove = (state) => botAction(state, BOT, defs, { level: match?.lesson != null ? "normal" : match?.level || "normal" });

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
      <span class="tg-coach-top"><em class="tg-coach-lab">Coach</em><span class="tg-coach-bar" aria-hidden="true"><i style="transform:scaleX(${((match.lesson + 1) / LESSON.length).toFixed(3)})"></i></span><small>${match.lesson + 1} of ${LESSON.length}</small></span>
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
    match = { state: saved.state, deckId: saved.deckId, botSet: saved.botSet, botTheme: saved.botTheme || "", level: saved.level || "normal", ticket: saved.ticket || "", lesson: saved.lesson ?? null, sel: null, sheet: "", busy: false, line: "", setup: { active: null, bench: [] }, opening: saved.state.dealt === false, over: false };
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
  const dropWhy = (state, spot) => (match.online ? (serverLegal((a) => a.type === "drop" && a.spot === spot) ? "" : "Can't be discarded right now.") : dropBlock(state, ME, spot, defs));
  /** A Trainer played as a Pokémon (a Fossil): the key that discards it from play. */
  function dropRowHtml(spot) {
    const slot = slotOf(ME, spot);
    const how = slot && d(slot.uid).fossil?.drop;
    if (!how) return "";
    const why = !myTurn() ? "Wait for your turn." : dropWhy(match.state, spot);
    return `<button type="button" class="tg-atk tg-abil" data-act="drop" data-spot="${spot}"${why ? " disabled" : ""}>
      <span class="tg-atk-top"><i class="tg-tag">Trainer</i><b>${how === "bottom" ? "To the bottom of your deck" : "Discard from play"}</b><em class="tg-atk-do">${how === "bottom" ? "Put back" : "Discard"}</em></span>
      <span class="tg-atk-text">${how === "bottom" ? "Its cards go to the discard pile and it goes to the bottom of your deck." : "It and its cards go to the discard pile. This isn't a Knock Out: no Prize card."}</span>
      ${why ? `<span class="tg-atk-why">${esc(why)}</span>` : ""}
    </button>`;
  }
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
    return `<button type="button" class="tg-mon${ready ? " has-ability" : ""}${big ? " big" : ""}${target ? " is-target" : ""}${chosen ? " is-chosen" : ""}" data-p="${p}" data-spot="${spot}"${big && conditionsOn(slot).length ? ` data-conds="${conditionsOn(slot).join(" ")}"` : ""} aria-label="${esc(label)}">
      <img src="${img(state.cards[slot.uid], big)}" alt="" draggable="false" decoding="async" />
      ${slot.damage ? `<span class="tg-dmg">${slot.damage}</span>` : ""}
      ${big ? "" : `${hpBar(left, full)}<span class="tg-pips">${pipRow(energyOf(state, slot, defs), toolName ? 2 : 3)}${toolName ? `<i class="tg-en tg-toolpip" title="${esc(toolName)}">T</i>` : ""}</span>`}
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
      <span class="tg-hud-hp">${hpBar(left, maxHp(state, slot, defs))}</span>
      <span class="tg-pips">${energy.length ? pipRow(energy, 5) : `<small>No Energy</small>`}</span>
      <span class="num"><b>${left}</b>/${maxHp(state, slot, defs)}</span>
      ${conditionsOn(slot).length || marksOn(state, slot).length || edge || slot.tool || (slot.held || []).length || def.ability ? `<span class="tg-conds">${edge}${def.ability ? `<i class="tg-cond" data-cond="ability"${abilityOn(state, slot, defs) ? "" : " data-off"}>${esc(def.ability.name)}</i>` : ""}${slot.tool ? `<i class="tg-cond" data-cond="tool">${esc(defOf(state, slot.tool, defs).name)}</i>` : ""}${(slot.held || []).map((h) => `<i class="tg-cond" data-cond="tool">${esc(defOf(state, h.uid, defs).name)}</i>`).join("")}${conditionsOn(slot).map((c) => `<i class="tg-cond" data-cond="${c}">${COND_NAME[c]}</i>`).join("")}${marksOn(state, slot).map((m) => `<i class="tg-cond" data-cond="mark" data-mark="${m.kind}">${esc(markLabel(m))}</i>`).join("")}</span>` : ""}
    </div>`;
  }

  /** Prize cards laid out face down beside the Bench, the way they sit on a mat. One leaves each time a prize is taken. */
  function prizesHtml(state, p) {
    const left = state.phase === "setup" ? state.rules.prizes : state.players[p].prizes.length;
    const all = Math.max(state.rules.prizes, left);
    // Prize cards turned face up (Team Rocket's Bother-Bot) show what they are.
    const up = state.phase === "setup" ? [] : (state.players[p].prizesUp || []).filter((uid) => state.cards[uid]);
    return `<span class="tg-pile tg-prizes" data-p="${p}" style="--rows:${Math.ceil(all / 2)}" aria-label="${p === ME ? "Your" : "Their"} prize cards: ${left} left">
      <span class="tg-prize-grid">${Array.from({ length: all }, (_, i) => (i < up.length ? `<i class="up" title="${esc(d(up[i]).name)}, face up" style="background:center/cover url(${img(state.cards[up[i]])})"></i>` : `<i${i < left ? "" : ` class="e"`}></i>`)).join("")}</span>
      <b class="tg-pile-n">${left}</b>
    </span>`;
  }

  /** The deck, with its count, and the discard pile's count under it. */
  function deckHtml(state, p, back) {
    const side = state.players[p];
    return `<span class="tg-pile tg-deckpile" data-p="${p}">
      <span class="tg-stack${side.deck.length ? "" : " e"}" title="${p === ME ? "Cards in your deck" : "Cards in their deck"}"><span class="tg-mini">${back}</span><b class="tg-pile-n">${side.deck.length}</b></span>
      <small class="tg-bin" title="${p === ME ? "Cards in your discard pile" : "Cards in their discard pile"}">Discard ${side.discard.length}</small>
    </span>`;
  }

  /** What you still have this turn: one Energy, one Supporter, one retreat. */
  function trackHtml(state) {
    if (state.phase !== "main" || state.current !== ME) return "";
    const side = state.players[ME];
    const mark = (used, label) => `<span${used ? ` class="used"` : ""}>${label}<i class="sr-only">${used ? ", used" : ", still to use"}</i></span>`;
    return `<span class="tg-track" aria-label="This turn">${mark(side.energyUsed, "Energy")}${mark(side.supporterUsed || (state.turn === 1 && state.first === ME), "Supporter")}${mark(side.retreated, "Retreat")}</span>`;
  }

  /** What the player is being asked to do, and the keys for it. */
  function promptOf() {
    const state = match.state;
    if (match.busy) return { text: match.line || "", keys: "" };
    // Behind the end sheet: nobody is thinking any more.
    if (state.phase === "over") return { text: "The match is over.", keys: "" };
    if (state.phase === "setup") {
      if (match.online && state.players[ME].placed) return { text: `Waiting for ${foeName()} to set up.`, keys: "" };
      if (!match.setup.active) return { text: "Choose your Active Pokémon from your hand.", keys: "" };
      return { text: "Add Benched Pokémon if you like.", keys: `<button type="button" class="solid sm" data-act="start">Start</button>` };
    }
    const waiting = state.pending[0];
    if (waiting?.player === ME && waiting.type === "choose") return { text: "Choose from the cards shown.", keys: "" };
    if (waiting?.player === ME && waiting.type === "option") return { text: waiting.prompt || "Choose one.", keys: waiting.labels.map((label, i) => `<button type="button" class="${i ? "ghost" : "solid"} sm" data-act="option-${i}">${esc(label)}</button>`).join("") };
    if (waiting?.player === ME && waiting.type === "pick") {
      const op = waiting.effect.op;
      const whose = waiting.side === ME ? "your" : "their";
      if (op === "ability") {
        const asked = d(slotOf(ME, waiting.spots[0]).uid);
        return { text: `Use ${asked.name}'s ${asked.ability.name}?`, keys: `<button type="button" class="solid sm" data-act="ability-yes">Use it</button><button type="button" class="ghost sm" data-act="pick-skip">Not now</button>` };
      }
      // A pick that says what it is for (Area Zero Underdepths' Bench, Spiteful Evolution).
      if (waiting.prompt) return { text: waiting.prompt, keys: waiting.optional ? `<button type="button" class="ghost sm" data-act="pick-skip">Not now</button>` : "" };
      const fx = waiting.effect;
      const moving = {
        moveEnergyFrom: () => `Choose the Pokémon to move ${fx.type ? `a ${fx.type}` : "an"} Energy from.`,
        moveEnergyTo: () => `Choose the Pokémon that gets the ${d(fx.uid)?.name || "Energy"}.`,
        moveCountersFrom: () => "Choose the Pokémon to move damage counters from.",
        moveCountersTo: () => `Choose ${whose === "your" ? "another of your" : "one of their"} Pokémon to take the damage counters.`,
        attachHeld: () => `Choose the Pokémon that gets ${fx.uids.length > 1 ? "the Energy" : `the ${d(fx.uids[0])?.name || "Energy"}`}.`,
        bounce: () => "Choose the Pokémon to put back into your hand.",
        evolveHeld: () => `Choose the Pokémon that evolves into ${d(fx.uid)?.name || "it"}.`,
        hold: () => `Choose the Pokémon to attach ${d(fx.uid)?.name || "it"} to.`,
        lift: () => "Choose the Pokémon that may evolve this turn.",
        devolve: () => "Choose the Pokémon to devolve.",
        swapFrom: () => "Choose the Basic Pokémon to swap for one from your deck.",
        energyFrom: () => (fx.move ? "Choose the Pokémon to move Energy from." : whose === "your" ? "Choose your Pokémon to discard an Energy from." : "Choose one of their Pokémon to lose Energy."),
        moveAllFrom: () => "Choose the Pokémon to move all its Energy from.",
        moveEnergyCards: () => (fx.uids.length === 1 ? `Choose the Pokémon that gets the ${d(fx.uids[0])?.name || "Energy"}.` : "Choose the Pokémon that gets the Energy."),
        knockOut: () => "Choose one of their Pokémon to Knock Out.",
        heal: () => (fx.flips ? "Choose one of your Pokémon, then the coins are flipped." : null),
      }[op]?.();
      if (op === "rearrangeFrom") return { text: `Choose a Pokémon to move ${fx.type ? `a ${fx.type}` : "an"} Energy from, or finish.`, keys: `<button type="button" class="ghost sm" data-act="pick-skip">Done</button>` };
      if (op === "breedMark") return { text: waiting.optional ? "Choose a second Pokémon to flip a coin for, or finish." : "Choose a Pokémon to flip a coin for (you may then choose a second).", keys: waiting.optional ? `<button type="button" class="ghost sm" data-act="pick-skip">Done</button>` : "" };
      if (op === "gatherFrom") return { text: `Choose a Pokémon to move ${fx.type ? `a ${fx.type}` : "an"} Energy from, or finish.`, keys: `<button type="button" class="ghost sm" data-act="pick-skip">Done</button>` };
      if (moving) return { text: moving, keys: "" };
      if (op === "damage" && fx.counters) return { text: fx.n === 10 && waiting.again ? `Choose one of their Pokémon for a damage counter (${waiting.left} to place).` : `Choose one of their Pokémon for ${fx.n / 10} damage counters${waiting.left > 1 ? ` (${waiting.left} to choose)` : ""}.`, keys: "" };
      if (op === "shuffleIn") return { text: "Choose the Pokémon to shuffle into your deck, or keep them.", keys: `<button type="button" class="ghost sm" data-act="pick-skip">Keep them</button>` };
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
    // Nothing left but to end the turn (retreating aside): say so, so a turn doesn't stall on a hunt for a move.
    const stuck = !canAttack && !legal().some((a) => a.type !== "end" && a.type !== "retreat");
    return {
      text: state.turn === 1 && !stuck ? "Going first: no attack this turn." : canAttack ? "Tap your Active Pokémon to attack." : stuck ? "Nothing more to play. End your turn." : "Play cards, then end your turn.",
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

    // The hand is laid out by kind, and copies of one card sit as a pile with a count, so five Energy read as one stack.
    const kindRank = (uid) => ({ pokemon: 0, trainer: 1, energy: 2 })[d(uid).kind] ?? 3;
    const sorted = hand.map((uid, i) => ({ uid, i })).sort((a, b) => kindRank(a.uid) - kindRank(b.uid) || (real.cards[a.uid] === real.cards[b.uid] ? 0 : real.cards[a.uid] < real.cards[b.uid] ? -1 : 1) || a.i - b.i).map((x) => x.uid);
    const shownHand = sorted.map((uid, i) => {
      const id = real.cards[uid];
      const stacked = i > 0 && real.cards[sorted[i - 1]] === id;
      const last = i === sorted.length - 1 || real.cards[sorted[i + 1]] !== id;
      return { uid, stacked, count: last ? sorted.filter((u) => real.cards[u] === id).length : 0, tilt: 0 };
    });
    const groups = shownHand.filter((c) => !c.stacked).length;
    const handUnits = groups + (shownHand.length - groups) * 0.16;
    let g = -1;
    for (const c of shownHand) {
      if (!c.stacked) g += 1;
      c.tilt = groups > 1 ? ((g / (groups - 1)) * 2 - 1).toFixed(2) : 0;
    }
    const foeBench = setup && match.online ? Array(match.online.hidden.bench).fill(null) : foe.bench;
    const places = (n) => Array.from({ length: Math.max(0, n) }, () => `<span class="tg-place"></span>`).join("");

    const point = coach && !sel && !match.sheet ? coach : null;
    const pointHand = point && (point.pick || point.want?.({ type: "attach", spot: ACTIVE }) || point.want?.({ type: "attach", spot: 0 }) || point.want?.({ type: "evolve" }));
    const pointActive = point?.want?.({ type: "attack" });
    return `<div class="tg-table rt-dark rt-still${myTurn() ? " my-turn" : ""}${coach ? " has-coach" : ""}${pointHand ? " coach-hand" : ""}${pointActive ? " coach-active" : ""}${coach?.want?.({ type: "end" }) || coach?.want?.({ type: "place" }) ? " coach-key" : ""}" data-phase="${real.phase}">
      <div class="tg-bar tg-bar-foe">
        <button type="button" class="tg-leave" data-act="leave" aria-label="Leave the match">${match.leaving ? "Concede?" : "Leave"}</button>
        <b class="tg-who">${esc(foe.name)}${match.botTheme && !setup ? `<small>${match.level && match.lesson == null ? `${levelName(match.level)}, ` : ""}${esc(match.botTheme)} deck</small>` : ""}</b>
        ${match.online && real.phase !== "over" ? clockHtml() : ""}
        <span class="tg-count tg-foe-hand" title="Cards in their hand"><i class="tg-ic hand"></i>${foe.hand.length}</span>
      </div>
      <div class="tg-field tg-arena">
        <div class="tg-half tg-half-foe">
          <div class="tg-row">
            ${prizesHtml(state, BOT)}
            <div class="tg-bench tg-bench-foe" style="--slots:${Math.max(state.players[BOT].benchMax || state.rules.bench, foeBench.length)}">
              ${foeBench.map((slot, i) => (setup ? foeBack : monHtml(state, BOT, slot, i, { target: foeTargets.has(i) }))).join("")}
              ${places(Math.max(0, (state.players[BOT].benchMax || state.rules.bench) - foeBench.length))}
            </div>
            ${deckHtml(state, BOT, foeBack)}
          </div>
          <div class="tg-side tg-side-foe">
            <div class="tg-info tg-info-foe">
              ${setup ? `<div class="tg-hud" data-p="${BOT}"><b class="tg-hud-name">${esc(foe.name)}</b><span class="tg-pips"><small>${match.online ? (match.online.hidden.placed ? "Ready" : "Choosing their Pokémon") : "Ready when you are"}</small></span></div>` : hudHtml(state, BOT)}
            </div>
            <div class="tg-spot tg-spot-foe" data-p="${BOT}">${foe.active || (setup && match.online?.hidden.active) ? (setup ? foeBack : monHtml(state, BOT, foe.active, ACTIVE, { big: true, target: foeTargets.has(ACTIVE) })) : ""}</div>
            <div class="tg-wing">
              ${state.stadium ? `<button type="button" class="tg-stadium" data-act="stadium" aria-label="Stadium in play: ${esc(defOf(state, state.stadium.uid, defs).name)}"><img src="${img(state.cards[state.stadium.uid])}" alt="" draggable="false" /><b>Stadium</b></button>` : ""}
            </div>
          </div>
        </div>
        <div class="tg-half tg-half-me">
          <div class="tg-side tg-side-me">
            <div class="tg-wing"><p class="tg-line" aria-live="polite">${esc(match.busy || !myTurn() ? "" : match.line || "")}</p></div>
            <div class="tg-spot tg-spot-me" data-p="${ME}">${myActive ? monHtml(state, ME, myActive, ACTIVE, { big: true, target: targets.has(ACTIVE) }) : `<span class="tg-hole">Active</span>`}</div>
            <div class="tg-info tg-info-me">${setup ? "" : hudHtml(state, ME)}</div>
          </div>
          <div class="tg-row">
            ${prizesHtml(state, ME)}
            <div class="tg-bench tg-bench-me${benchOpen ? " is-open" : ""}" data-bench style="--slots:${Math.max(state.players[ME].benchMax || state.rules.bench, myBench.length)}">
              ${myBench.map((slot, i) => monHtml(state, ME, slot, i, { target: targets.has(i) })).join("")}
              ${myBench.length < (state.players[ME].benchMax || state.rules.bench) ? `<span class="tg-hole${benchOpen ? " is-target" : ""}" data-bench>${benchOpen ? "Play here" : "Bench"}</span>${places((state.players[ME].benchMax || state.rules.bench) - myBench.length - 1)}` : ""}
            </div>
            ${deckHtml(state, ME, back)}
          </div>
        </div>
      </div>
      <div class="tg-hand" style="--n:${handUnits.toFixed(2)}">
        ${shownHand.map(({ uid, stacked, count, tilt }) => `<button type="button" class="tg-card${stacked ? " stk" : ""}${sel?.kind === "hand" && sel.uid === uid ? " is-chosen" : ""}${playable.has(uid) ? " can" : ""}" data-hand="${uid}" style="--t:${tilt}" aria-label="${esc(d(uid).name)}"><img src="${img(real.cards[uid])}" alt="" draggable="false" />${count > 1 ? `<b class="tg-card-n">${count}</b>` : ""}</button>`).join("")}
      </div>
      <div class="tg-prompt">
        <div class="tg-say"><p>${esc(prompt.text)}</p>${trackHtml(real)}</div>
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
    const tag = `<i class="tg-tag">${esc(ability.kind)}</i>`;
    // One the player uses is a row to press, like an attack; one that just works is a straight box that says so.
    if (ability.use) {
      return `<button type="button" class="tg-atk tg-abil${off ? " off" : ""}" data-act="ability-use" data-spot="${spot}"${why ? " disabled" : ""}>
      <span class="tg-atk-top">${tag}<b>${esc(ability.name)}</b><em class="tg-atk-do">Use</em></span>
      <span class="tg-atk-text">${esc(ability.text)}</span>
      ${why ? `<span class="tg-atk-why">${esc(why)}</span>` : ""}
    </button>`;
    }
    return `<div class="tg-abil is-info${off ? " off" : ""}">
      <span class="tg-atk-top">${tag}<b>${esc(ability.name)}</b>${ability.enter ? "" : `<small>${off ? "Not working right now" : "Always on"}</small>`}</span>
      <span class="tg-atk-text">${esc(ability.text)}</span>
    </div>`;
  }

  /** A sheet's head: the name large, a short fact at the right. */
  const sheetHead = (name, meta = "") => `<header class="tg-sheet-head"><h3>${esc(name)}</h3>${meta ? `<span class="tg-sheet-meta">${meta}</span>` : ""}</header>`;
  /** A Pokémon in play: its HP as words, and the Energy on it. */
  const monMeta = (state, slot) => {
    const units = energyOf(state, slot, defs);
    return `${units.length ? `<span class="tg-pips">${pipRow(units, 5)}</span>` : ""}<span>${hpLeft(state, slot, defs)} of ${maxHp(state, slot, defs)} HP</span>`;
  };

  /** A Benched Pokémon with an Ability to use: read it, use it, or look at the card. */
  function abilitySheetHtml() {
    const state = match.state;
    const slot = slotOf(ME, match.sheetSpot);
    if (!slot) return "";
    const def = d(slot.uid);
    return `<div class="tg-sheet-bg" data-act="cancel"></div>
      <div class="tg-sheet tg-attacks tg-abil-sheet" role="dialog" aria-label="${esc(def.name)}">
        ${sheetHead(def.name, monMeta(state, slot))}
        <div class="tg-rows">
          ${abilityRowHtml(match.sheetSpot)}
          ${dropRowHtml(match.sheetSpot)}
          <div class="tg-links"><button type="button" class="tg-link" data-act="look-spot">View card</button><button type="button" class="tg-link" data-act="cancel">Close</button></div>
        </div>
      </div>`;
  }

  function stadiumSheetHtml() {
    const state = match.state;
    const def = defOf(state, state.stadium.uid, defs);
    const why = def.stadium?.use ? (myTurn() ? stadiumWhy(state) : "Wait for your turn.") : "";
    return `<div class="tg-sheet-bg" data-act="cancel"></div>
      <div class="tg-sheet tg-stadium-sheet" role="dialog" aria-label="${esc(def.name)}">
        ${sheetHead(def.name, `<span>Stadium</span>`)}
        <div class="tg-stadium-body">
          <img src="${img(state.cards[state.stadium.uid], true)}" alt="" draggable="false" />
          <div>
            <p class="tg-look-meta">Played by ${state.stadium.owner === ME ? "you" : foeName()}. It affects both players.</p>
            <p class="tg-look-text">${esc(def.text)}</p>
            ${why && def.stadium?.use ? `<p class="tg-look-note">${esc(why)}</p>` : ""}
          </div>
        </div>
        <div class="tg-sheet-keys">${def.stadium?.use ? `<button type="button" class="solid sm" data-act="stadium-use"${why ? " disabled" : ""}>Use</button>` : ""}<button type="button" class="tg-link" data-act="cancel">Close</button></div>
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
      const blocked = shieldOn(state, foeSlot, def) || markOn(state, foeSlot, "guard");
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
      if (!blocked && real >= hpLeft(state, foeSlot, defs)) notes.push(`Knocks Out ${foeDef.name}`);
      const tone = real > base ? "up" : real < base ? "down" : "";
      return {
        html: tone ? `<s>${base}</s><span class="${tone}">${real}${esc(more)}</span>` : esc(attack.damage),
        note: notes.length ? `<span class="tg-atk-note">${esc(notes.join(", "))}</span>` : "",
      };
    };
    // Short of Energy says by how much; otherwise the rule that stops it.
    const short = (attack) => unpaid(costFor(state, slot, attack, defs), units);
    const whyNot = (attack) => (state.turn === 1 ? "No attack on the first turn" : held ? `${COND_NAME[held]}: can't attack` : markOn(state, slot, "noAttack") ? "Can't attack this turn" : barred(attack) ? "Can't be used this turn" : short(attack) ? `Needs ${short(attack)} more Energy` : "Can't be used right now");
    const cost = retreatCost(state, slot, defs);
    return `<div class="tg-sheet-bg" data-act="cancel"></div>
      <div class="tg-sheet tg-attacks" role="dialog" aria-label="${esc(def.name)}">
        ${sheetHead(def.name, monMeta(state, slot))}
        <div class="tg-rows">
        ${abilityRowHtml(ACTIVE)}
        ${dropRowHtml(ACTIVE)}
        ${attacksOf(state, slot, defs).map((attack, i) => `<button type="button" class="tg-atk" data-attack="${i}"${usable.has(i) && myTurn() ? "" : " disabled"}>
          <span class="tg-atk-top"><span class="tg-pips">${attack.cost.length ? pips(attack.cost) : "<small>Free</small>"}</span><b>${esc(attack.name)}</b><em>${preview(attack).html}</em></span>
          ${attack.lent ? `<span class="tg-atk-note">From ${esc(defs(attack.lent.card).name)}</span>` : ""}
          ${preview(attack).note}
          ${attack.text ? `<span class="tg-atk-text${attack.plain ? " off" : ""}">${attack.plain ? "Text not live yet: " : ""}${esc(attack.text)}</span>` : ""}
          ${usable.has(i) || !myTurn() ? "" : `<span class="tg-atk-why">${whyNot(attack)}</span>`}
        </button>`).join("")}
        <div class="tg-links">
          <button type="button" class="tg-link" data-act="retreat"${retreat ? "" : " disabled"}>${markOn(state, slot, "noRetreat") || def.fossil?.noRetreat ? "Can't retreat" : cost ? `Retreat <span class="tg-pips">${pips(Array(cost).fill("Colorless"))}</span>` : "Retreat for free"}</button>
          <button type="button" class="tg-link" data-act="look-active">View card</button>
        </div>
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
      attack: won ? "Your attack won the game." : `${foeName()}'s attack won the game.`,
    }[state.reason];
    const clock = match.online?.summary.reason;
    if (clock === "timeout") why = won ? `${foeName()} ran out of time.` : "You ran out of time.";
    if (clock === "abandoned") why = "Neither of you set up in time.";
    // A match given up before anyone took a turn has no turns to count.
    const early = state.turn < 1;
    if (early && state.reason === "concede") why = won ? `${foeName()} gave up before the first turn.` : "You gave up before the first turn.";
    // The facts box: only what the engine counted. Prize cards taken by each side, then the turns played.
    const taken = (p) => Math.max(0, state.rules.prizes - (state.players[p].prizes?.length ?? state.rules.prizes));
    const fact = (label, value) => `<div><span>${esc(label)}</span><b>${esc(String(value))}</b></div>`;
    const facts = (more = "") => `<div class="tg-facts">${fact("Prize cards taken", `${taken(ME)} to ${taken(BOT)}`)}${early ? "" : fact("Turns", state.turn)}${more}</div>`;
    // The screen's card: the Pokémon still in your Active Spot, else the one in theirs.
    const side = [ME, BOT].find((p) => state.players[p].active?.uid && cardOf(state.cards[state.players[p].active.uid]));
    const leadUid = side != null ? state.players[side].active.uid : "";
    const hero = leadUid ? `<div class="tg-over-card"><img src="${img(state.cards[leadUid], true)}" alt="" draggable="false" /><div><small>${side === ME ? "Your" : "Their"} Active Pokémon</small><b>${esc(d(leadUid)?.name || "")}</b></div></div>` : "";
    const head = (title, line) => `<div class="tg-over-head"><h2>${title}</h2><p class="tg-over-why">${line}</p></div>`;
    if (match.lesson != null) {
      return `<div class="tg-sheet-bg"></div>
      <div class="tg-sheet tg-over" role="dialog" aria-label="Lesson over">
        ${head(won ? "Lesson done" : "Lesson over", `${esc(why)} ${won ? "That's the whole loop: Energy, evolve, attack, prizes. Build a deck from your own cards and play it for real." : "Run it again, or build a deck from your own cards and learn as you go."}`)}
        ${hero}
        ${facts()}
        <div class="tg-sheet-keys">
          <button type="button" class="solid rt-go" data-act="lesson-build">Build a deck</button>
          <button type="button" class="ghost" data-act="again">Run it again</button>
        </div>
      </div>`;
    }
    const title = tie ? "A tie" : won ? "You won" : "You lost";
    if (match.online) {
      return `<div class="tg-sheet-bg"></div>
      <div class="tg-sheet tg-over" role="dialog" aria-label="Match over">
        ${head(title, esc(why))}
        ${hero}
        ${facts()}
        <div class="tg-rematch" data-rematch aria-live="polite">${rematchHtml()}</div>
        <div class="tg-sheet-keys">
          <button type="button" class="ghost" data-go="/play/friends">Play online</button>
          <button type="button" class="tlink" data-go="/play">Decks</button>
        </div>
      </div>`;
    }
    // Against the house bot: the level's record, and after a win, the next level up as the next match.
    const lv = match.level || "normal";
    const at = record.levels?.[lv];
    const up = won && LEVELS[LEVELS.findIndex((l) => l.id === lv) + 1];
    const tally = at && at.wins + at.losses ? `${at.wins} won, ${at.losses} lost` : "";
    const standing = tally ? `<p class="tg-over-tally"><span>Your record on ${esc(levelName(lv))}</span><b>${esc(tally)}</b></p>${at.streak > 1 ? fact("Wins in a row", at.streak) : ""}` : "";
    return `<div class="tg-sheet-bg"></div>
      <div class="tg-sheet tg-over" role="dialog" aria-label="Match over">
        ${head(title, esc(why))}
        ${hero}
        ${facts(standing + (match.reward?.paid ? rewardHtml(lv) : ""))}
        ${match.reward?.paid ? "" : rewardHtml(lv)}
        <div class="tg-sheet-keys">
          ${up ? `<button type="button" class="solid rt-go" data-act="again-up">Try ${up.name}</button><button type="button" class="ghost" data-act="again">Play again</button>` : `<button type="button" class="solid rt-go" data-act="again">Play again</button>`}
          <button type="button" class="tlink" data-go="/play">Decks</button>
        </div>
      </div>`;
  }

  /** What a win against the bot paid, once the Worker has answered. */
  function rewardHtml(lv) {
    const r = match.reward;
    if (!r || r.reason === "lost") return "";
    const text = r.paid ? `+${levelXp(lv)} XP` : r.reason === "cap" ? "That's today's 10 paid wins. More XP tomorrow." : r.reason === "quick" ? "No XP for a match under two minutes." : "";
    if (r.paid) return `<div class="tg-over-reward"><span>Reward</span><b>${esc(text)}</b></div>`;
    return text ? `<p class="tg-over-note">${esc(text)}</p>` : "";
  }

  /** What the opening mulligans were, for the flip sheet or the line once hands are dealt. */
  function mulliganLines(state) {
    return state.players.map((s, p) => {
      if (!s.mulligans) return "";
      const extra = s.mulligans - state.players[other(p)].mulligans;
      return `${p === ME ? "You" : foeName()} had no Basic Pokémon ${s.mulligans === 1 ? "once" : `${s.mulligans} times`} and drew a new hand${extra > 0 ? `, so ${p === ME ? foeName() : "you"} will draw ${plural(extra, "extra card")}` : ""}.`;
    }).filter(Boolean);
  }

  function openingHtml() {
    const state = match.state;
    const faces = deps.coinFaces();
    const mull = mulliganLines(state);
    return `<div class="tg-sheet-bg"></div>
      <div class="tg-sheet tg-opening" role="dialog" aria-label="Coin flip">
        <div class="tg-coin">${coinStageHTML({ heads: faces?.heads || null, tails: faces?.tails || null, size: 150, rest: "heads" })}</div>
        <p class="tg-opening-lab">Flip for the first turn</p>
        <h2 id="tg-first">&nbsp;</h2>
        ${mull.map((m) => `<p class="tg-opening-mull">${esc(m)}</p>`).join("")}
        <p class="tg-opening-note" hidden>Whoever goes first can't attack or play a Supporter on that turn.</p>
        <div class="tg-sheet-keys">${state.flipWinner === ME
          ? `<button type="button" class="solid rt-go" data-act="go-first" disabled>Go first</button><button type="button" class="ghost" data-act="go-second" disabled>Go second</button>`
          : `<button type="button" class="solid rt-go" data-act="opened" disabled>Choose your Pokémon</button>`}</div>
      </div>`;
  }

  function flipSheetHtml() {
    const faces = deps.coinFaces();
    return `<div class="tg-sheet tg-flip" role="status">
        <div class="tg-coin">${coinStageHTML({ heads: faces?.heads || null, tails: faces?.tails || null, size: 120, rest: "heads" })}</div>
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
    const foreign = waiting.owner != null && waiting.owner !== ME && waiting.zone !== "play";
    const mineInPlay = waiting.zone === "play" && waiting.uids.every((uid) => [state.players[ME].active, ...state.players[ME].bench].some((slot) => slot?.energy.includes(uid)));
    const title = waiting.effect.op === "look" ? "Their hand"
      : waiting.effect.op === "retreat" ? "Choose the Energy to discard for the Retreat Cost"
      : waiting.effect.op === "dropInPlay" && what === "energy" ? `Discard ${min < max ? "up to " : ""}${many(max)} from ${mineInPlay ? "your" : "their"} Pokémon`
      : foreign ? `Choose ${min < max ? "up to " : ""}${many(max)} from their ${waiting.zone === "hand" ? "hand" : "deck"}`
      : waiting.effect.op === "order" ? "Tap the cards in the order you want them, the top one first"
      : waiting.effect.op === "deckTop" ? `Choose ${many(max)} for the top of your deck, the top one first`
      : waiting.effect.op === "keepOne" ? "Choose the card to keep; the rest is shuffled into your deck"
      : waiting.effect.op === "toActive" ? "Choose your new Active Pokémon"
      : waiting.effect.op === "carryEnergy" ? "Choose the Energy to move"
      : waiting.effect.op === "fromDiscardTop" ? `Put ${many(max)} from your discard pile on top of your deck`
      : waiting.effect.op === "discard" ? `Discard ${min < max ? "up to " : ""}${many(min < max ? max : min)} from your hand`
      : waiting.effect.op === "challengeHold" ? `Challenge!: put up to ${many(max)} face down onto your Bench`
      : waiting.effect.op === "toBench" ? `Choose ${max > 1 ? `up to ${many(max)}` : "a Basic Pokémon"} for your Bench`
      : waiting.effect.op === "attach" && waiting.zone !== "deck" ? `Attach ${max > 1 ? `up to ${many(max)}` : many(1)} from your ${waiting.zone === "hand" ? "hand" : "discard pile"}`
      : waiting.effect.op === "attach" ? `Attach ${max > 1 ? `up to ${many(max)}` : many(1)} from your ${waiting.top ? `top ${waiting.top} cards` : "deck"}`
      : waiting.effect.op === "swapIn" ? `Switch in ${kind} from your deck`
      : waiting.effect.op === "toDeck" ? `Shuffle ${min < max ? "up to " : ""}${many(max)} into your deck`
      : waiting.effect.op === "evolveFrom" ? `Choose the card to evolve with from your ${waiting.zone === "deck" ? "deck" : "hand"}`
      : waiting.effect.op === "dropInPlay" ? `Discard ${min < max ? "up to " : ""}${plural(max, "card")} in play`
      : waiting.effect.op === "toTop" ? `Put ${many(max)} from your hand on top of your deck`
      : waiting.effect.op === "share" || waiting.effect.op === "baton" ? `Move ${min < max ? "up to " : ""}${many(max)} from your Knocked Out Pokémon`
      : waiting.effect.op === "payFor" ? `Discard up to ${many(max)}${waiting.zone === "hand" ? " from your hand" : ""} for this attack`
      : waiting.effect.op === "takeBack" ? `Return ${many(max)} to ${waiting.owner != null && waiting.owner !== ME ? "their" : "your"} hand`
      : waiting.effect.op === "toBottom" ? `${waiting.shuffle ? "Shuffle" : "Put"} ${many(max)} from your hand ${waiting.shuffle ? "into" : "on the bottom of"} your deck`
      : waiting.zone === "discard" ? `Take ${min < max ? "up to " : ""}${many(max)} from your discard pile`
      : `Take ${max > 1 ? `up to ${many(max)}` : many(1)} from your deck`;
    const cards = waiting.uids.slice().sort((a, b) => d(a).name.localeCompare(d(b).name) || state.cards[a].localeCompare(state.cards[b]));
    const none = waiting.zone === "deck" ? `No ${kind === "card" ? "cards" : kind} ${waiting.top ? `in the top ${waiting.top} cards` : "left in your deck"}.` : "Nothing to choose.";
    const picked = match.choice.size;
    return `<div class="tg-sheet-bg"></div>
      <div class="tg-sheet tg-choose" role="dialog" aria-label="${esc(title)}" data-min="${min}" data-max="${max}">
        <header class="tg-sheet-head"><h3>${esc(title)}</h3></header>
        ${waiting.zone === "deck" || (max > 0 && cards.length) ? `<div class="tg-choose-sub">${waiting.zone === "deck" ? `<p class="tg-choose-note">Your deck is shuffled afterwards.</p>` : ""}${max > 0 && cards.length ? `<span class="tg-sheet-meta tg-choose-count">${picked} of ${max}</span>` : ""}</div>` : ""}
        ${cards.length ? `<div class="tg-choose-grid">${cards.map((uid) => `<button type="button" class="tg-choose-card${match.choice.has(uid) ? " is-chosen" : ""}" data-choose="${uid}" aria-pressed="${match.choice.has(uid)}" aria-label="${esc(d(uid).name)}"><img src="${img(state.cards[uid])}" alt="" draggable="false" decoding="async" /></button>`).join("")}</div>` : `<p class="tg-choose-none">${esc(none)}</p>`}
        <div class="tg-sheet-keys"><button type="button" class="solid rt-go" data-act="choose-done"${picked >= min ? "" : " disabled"}>${max === 0 ? "Done" : chooseLabel(picked, min)}</button></div>
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
    const count = sheet.querySelector(".tg-choose-count");
    if (count) count.textContent = `${chosen.size} of ${max}`;
  }

  function paintTable() {
    if (!shown || (route.name !== "match" && route.name !== "online")) return;
    const scroll = root.querySelector(".tg-hand")?.scrollLeft || 0;
    fxLayer(true);
    // Looping motion (a Special Condition on a card) picks up where it was, however often the table is repainted.
    root.style.setProperty("--tg-now", `-${Math.round(performance.now() % 12000)}ms`);
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
    coinLanded(root.querySelector(".tg-opening .cf-coin"), mine);
  }

  /** The flip has landed: say who won and let the keys work. Again after a repaint (a friend's move can repaint the table mid-flip). */
  function openingLanded() {
    const mine = (match.state.flipWinner ?? match.state.first) === ME;
    const text = root.querySelector("#tg-first");
    const waiting = match.state.dealt === false;
    if (text) text.textContent = mine ? "You won the flip" : waiting ? `${foeName()} won the flip and is choosing who goes first` : `${foeName()} won the flip and ${match.state.first === ME ? "lets you go first" : "goes first"}`;
    const lab = root.querySelector(".tg-opening-lab");
    if (lab) lab.textContent = mine ? "Heads" : "Tails";
    root.querySelector(".tg-opening")?.classList.add("is-landed");
    root.querySelector(".tg-opening-note")?.removeAttribute("hidden");
    if (!mine && waiting) return;
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
      case "rps": return `Rock-Paper-Scissors: ${event.p === ME ? "you" : foeName()} ${event.picks[0]}, ${event.p === ME ? foeName() : "you"} ${event.picks[1]}. ${event.won == null ? "A tie: again." : (event.won === (event.p === ME)) ? "You win." : `${foeName()} wins.`}`;
      case "borrow": return `${who(event.p)} used ${name(event.uid)} from ${event.p === ME ? `${foeName()}'s` : "your"} discard pile.`;
      case "trick-coin": return `Trick Coin: ${event.p === ME ? "you flip" : `${foeName()} flips`} the attack's coins again.`;
      case "challenge-down": return `Challenge!: ${who(event.p)} put ${plural(event.n, "card")} face down.`;
      case "drop": return `${who(event.p)} ${event.to === "deck" ? "put" : "discarded"} ${name(event.uid)} ${event.to === "deck" ? "on the bottom of the deck" : "from play"}.`;
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
          noUse: event.until ? `${whose} Active Pokémon can't use ${event.name} again until it leaves the Active Spot.` : `${whose} Active Pokémon can't use ${event.name} next turn.`,
          costMore: `${whose} Active Pokémon's attacks cost ${event.n} Colorless more next turn.`,
          retreatMore: `${whose} Active Pokémon's Retreat Cost is ${event.n} more next turn.`,
          ward: `${whose} Active Pokémon is protected next turn.`,
          dodge: `${whose} Active Pokémon may dodge attacks next turn.`,
          endure: `${whose} Active Pokémon can't be Knocked Out by an attack next turn.`,
          doomCond: `${whose} Active Pokémon will be ${(COND_NAME[event.name] || "affected").toLowerCase()} at the end of next turn.`,
          lostKo: "",
          less: `${whose} Active Pokémon takes ${event.n} less damage next turn.`,
          shield: `${whose} Active Pokémon is protected next turn.`,
          guard: `${whose} Active Pokémon takes no damage next turn.`,
          noRetreat: `${whose} Active Pokémon can't retreat next turn.`,
          mustFlip: `${whose} Active Pokémon must flip to attack next turn.`,
          stronger: `${whose} Active Pokémon's ${event.name || "attacks"} will do ${event.n} more damage next turn.`,
          weaker: `${whose} Active Pokémon's attacks do ${event.n} less damage next turn.`,
          exposed: `${whose} Active Pokémon will take ${event.n} more damage next turn.`,
          harden: `${whose} Active Pokémon takes no damage of ${event.n} or less next turn.`,
          base: `${whose} Active Pokémon's ${event.name} will do ${event.n} damage next turn.`,
          noWeakness: `${whose} Active Pokémon has no Weakness next turn.`,
          spite: event.mirror ? `${whose} Active Pokémon will put back as many damage counters as it takes next turn.` : `${whose} Active Pokémon will put ${event.n / 10} damage counters on whatever damages it next turn.`,
          noHeal: `${whose} Active Pokémon can't be healed next turn.`,
          noAbility: event.name === "Ability" ? `${whose} Active Pokémon has no Abilities until the end of ${event.p === ME ? "their" : "your"} next turn.` : `${whose} Active Pokémon can't use Poké-Powers next turn.`,
          doom: `${whose} Active Pokémon gets ${event.n / 10} damage counters at the end of next turn.`,
          noEnergy: `Energy can't be attached from the hand to ${whose.toLowerCase()} Active Pokémon next turn.`,
          noEvolve: `${whose} Active Pokémon can't be evolved from the hand next turn.`,
          attachEnds: `Attaching Energy from the hand to ${whose.toLowerCase()} Active Pokémon next turn ends that turn.`,
          attachEnded: `Attaching Energy to it ended ${event.p === ME ? "your" : "their"} turn.`,
          tails: `${event.p === ME ? "Your" : "Their"} coin flips next turn count as tails.`,
          noGx: `${event.p === ME ? "You" : "They"} can't use GX attacks for the rest of the game.`,
        }[event.kind] || "";
      }
      case "lock": return `${event.p === ME ? "You" : "They"} can't play ${event.kinds.map((k) => ({ item: "Item", supporter: "Supporter", stadium: "Stadium", special: "Special Energy", trainer: "Trainer" })[k]).join(" or ")} cards next turn.`;
      case "copy": return `It used ${event.name}.`;
      case "devolve": return `${name(event.uid)} went back to ${event.p === ME ? "your" : "their"} hand.`;
      case "discard-energy": return `${plural(event.uids.length, "Energy card")} discarded from ${event.p === ME ? "your" : "their"} ${event.spot >= 0 ? "Benched" : "Active"} Pokémon.`;
      case "lost": return `${plural(event.uids.length, "card")} put in ${event.p === ME ? "your" : "their"} Lost Zone.`;
      case "mill": return `${plural(event.uids.length, "card")} discarded from ${event.p === ME ? "your" : "their"} deck.`;
      case "recycle": return `${who(event.p)} shuffled ${plural(event.uids.length, "card")} from the discard pile into the deck.`;
      case "bounce": if (event.discard) return `${name(event.uid)} was discarded, with all cards attached to it.`;
        return `${who(event.p)} put ${name(event.uid)} back into ${event.p === ME ? "your" : "its"} hand.`;
      case "boost": return `${event.p === ME ? "Your" : "Their"} attacks can do ${event.n} more damage this turn.`;
      case "team-guard": return `${event.p === ME ? "Your" : "Their"} Pokémon take ${event.n} less damage during the next turn.`;
      case "energy-to-hand": return `${plural(event.uids.length, "Energy card")} went back to ${event.p === ME ? "your" : "their"} hand.`;
      case "energy-to-deck": return `${plural(event.uids.length, "Energy card")} shuffled into ${event.p === ME ? "your" : "their"} deck.`;
      case "stadium-gone": return `${name(event.uid)} was discarded.`;
      case "discard-tool": return `${name(event.uid)} was discarded from ${event.p === ME ? "your" : "their"} Pokémon.`;
      case "hand-to-deck": return `${who(event.p)} put ${plural(event.uids.length, "card")} from ${event.p === ME ? "your" : "its"} hand ${event.at === "top" ? "on top of" : event.at === "bottom" ? "on the bottom of" : "into"} the deck.`;
      case "damage":
        if (event.why === "poisoned" || event.why === "burned") return `${COND_NAME[event.why]}: ${event.n} damage to ${event.p === ME ? "your" : "their"} Active Pokémon.`;
        if (event.why === "confused") return "Confused: it hurt itself for 30.";
        if (event.why === "doom") return `${event.n / 10} damage counters landed at the end of the turn.`;
        if (event.why === "energy") return `The Energy put ${event.n / 10 === 1 ? "a damage counter" : `${event.n / 10} damage counters`} on it.`;
        return `${event.n} damage${event.weak ? ", it's weak to that" : ""}${event.resist ? ", resisted" : ""}${event.self ? " to itself" : ""}.`;
      case "heal": return event.why === "move" ? "" : event.why === "ability" ? `${event.p === ME ? "Your" : "Their"} Pokémon healed ${event.n} between turns.` : `Healed ${event.n}.`;
      case "move-energy": return `${who(event.p)} moved ${name(event.uid)}.`;
      case "form": return `${who(event.p)} switched in ${name(event.uid)}.`;
      case "turn-ends": return `${event.name} ends the turn.`;
      case "encore": return `${event.name}: ${name(event.uid)} may attack again.`;
      case "ko": return `${name(event.uid)} was Knocked Out.`;
      case "ko-hand": return `${name(event.uid)} went back to ${event.p === ME ? "your" : "their"} hand.`;
      case "to-prizes": return `${plural(event.n, "card")} went onto ${event.p === ME ? "your" : "their"} Prize cards.`;
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
  let fxTop = null;
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
      // A second layer over the sheets, for what happens on a coin.
      fxTop = document.createElement("div");
      fxTop.className = "tg-fx tg-fx-top rt-dark";
      fxTop.setAttribute("aria-hidden", "true");
      document.body.appendChild(fxTop);
    } else if (!on && fx) {
      fx.remove();
      fxTop?.remove();
      fx = null;
      fxTop = null;
    }
  }

  /** A card image travels from one rect to another. `absorb`: it sinks into what it lands on. */
  function ghost(src, from, to, opts = {}) {
    const { ms = 340, width = 0, absorb = false, show = false, delay = 0, flip = false } = opts;
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
    if (flip) {
      // Leaves the pile face down, turns over on the way and lands face up.
      const mid = `translate(${(a.x - b.x) * 0.45}px, ${(a.y - b.y) * 0.45 - h * 0.18}px) scale(1.12)`;
      el.src = "assets/cards/shared/card-back-sm.webp";
      el.animate([{ transform: from0 }, { transform: `${mid} rotateY(90deg)` }], { duration: ms * 0.5, delay, easing: "cubic-bezier(0.4, 0, 0.7, 0.4)", fill: "both" }).finished.catch(() => {}).then(() => {
        el.src = src;
        return el.animate([{ transform: `${mid} rotateY(-90deg)` }, { transform: "none" }], { duration: ms * 0.5, easing: EASE, fill: "both" }).finished;
      }).then(() => {
        // Shown, held for a beat, then on to where it belongs.
        if (!opts.then) return null;
        const c = centre(opts.then.to);
        return el.animate([{ transform: "none", opacity: 1 }, { transform: "scale(1.04)", opacity: 1, offset: 0.12 }, { transform: `translate(${c.x - b.x}px, ${c.y - b.y}px) scale(${(opts.then.to.width / w).toFixed(3)})`, opacity: 0.4 }], { duration: 380, delay: opts.then.hold, easing: "cubic-bezier(0.5, 0, 0.7, 0.3)", fill: "both" }).finished;
      }).catch(() => {}).then(() => el.remove());
      return;
    }
    if (opts.toss) {
      // Thrown to a pile: the card keeps its own size, shrinks and greys as it goes.
      el.style.cssText = `left:${a.x - w / 2}px;top:${a.y - h / 2}px;width:${w}px;height:${h}px`;
      el.animate([{ transform: "none", opacity: 1, filter: "grayscale(1) brightness(0.7)" }, { transform: `translate(${b.x - a.x}px, ${b.y - a.y}px) scale(${(to.width / w).toFixed(3)}) rotate(18deg)`, opacity: 0.2, filter: "grayscale(1) brightness(0.7)" }], { duration: ms, delay, easing: "cubic-bezier(0.5, 0, 0.8, 0.5)", fill: "both" }).finished.catch(() => {}).then(() => el.remove());
      return;
    }
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
  function showCard(src, from, to, hold, { label = "", out = null, stadium = false, p = ME } = {}) {
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
    el.animate([{ transform: `${from0} rotate(${p === ME ? -14 : 14}deg)` }, { transform: "scale(1.07) rotate(1.5deg)", offset: 0.7 }, { transform: "none" }], { duration: 340, easing: EASE, fill: "both" });
    // A slanted band crosses behind the card and says what kind of card it is.
    const band = label ? fxEl(`tg-f-band${p === ME ? "" : " foe"}`, 0, b.y, "", "", 300 + hold + 400) : null;
    if (band) {
      band.innerHTML = `<b>${esc(label)}</b>`;
      fx.insertBefore(band, el);
    }
    setTimeout(() => bits({ x: b.x, y: b.y }, 10, "", { shape: "shard", reach: w * 0.85, size: 9, ms: 520 }), 240);
    return new Promise((resolve) => {
      let timer = 0;
      const done = () => {
        clearTimeout(timer);
        document.removeEventListener("pointerdown", done, true);
        band?.classList.add("out");
        const c = out ? centre(out) : null;
        const leave = c
          ? [{ transform: "none", opacity: 1 }, { transform: `translate(${c.x - b.x}px, ${c.y - b.y}px) scale(${Math.max(0.08, (stadium ? out.width : 24) / w).toFixed(3)}) rotate(${stadium ? 0 : 16}deg)`, opacity: stadium ? 1 : 0.25 }]
          : [{ transform: "none", opacity: 1 }, { transform: "scale(1.05)", opacity: 0 }];
        el.animate(leave, { duration: c ? 300 : 220, easing: c ? "cubic-bezier(0.5, 0, 0.7, 0.4)" : EASE, fill: "both" })
          .finished.catch(() => {}).then(() => {
            el.remove();
            if (c && stadium) cue(".tg-arena", "stadium-in", 700);
            else if (c) cue(`.tg-deckpile[data-p="${p}"] .tg-bin`, "bump", 400);
            resolve();
          });
      };
      timer = setTimeout(done, 300 + hold);
      // A press only counts once the card has landed, so the tap that played it doesn't close it.
      setTimeout(() => document.addEventListener("pointerdown", done, true), 300);
    });
  }

  /** Something on the table arrives from elsewhere: its picture flies in, and it shows when the picture lands. */
  function flyIn(from, el, { ms = 340, delay = 0, flip = false } = {}) {
    const pic = el?.querySelector("img");
    if (!pic || !from || still()) return;
    ghost(pic.currentSrc || pic.src, from, pic.getBoundingClientRect(), { ms, delay, flip });
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
    setTimeout(() => el.remove(), 1200);
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

  /* ----- small effects, all drawn in the layer above the table -----
     Each is a few plain shapes moved with transform and opacity. None is made when motion is off. */

  /** How an attack of each type lands. */
  const STRIKE = { Fire: "ember", Water: "splash", Lightning: "bolt", Grass: "leaf", Psychic: "rings", Fairy: "rings", Darkness: "slash", Metal: "slash", Dragon: "ember", Fighting: "impact", Colorless: "impact" };
  const rand = (a, b) => a + Math.random() * (b - a);

  function fxEl(cls, x, y, en, css = "", ms = 700, top = false) {
    const layer = top ? fxTop : fx;
    if (!layer || still()) return null;
    const el = document.createElement("span");
    el.className = `tg-tint ${cls}`;
    if (en) el.dataset.en = en;
    el.style.cssText = `left:${x}px;top:${y}px;${css}`;
    layer.appendChild(el);
    setTimeout(() => el.remove(), ms);
    return el;
  }

  /** Rings that open out from a point (or close in on it). */
  function rings(c, size, en, { n = 1, gap = 110, inward = false, top = false } = {}) {
    for (let i = 0; i < n; i += 1) fxEl(`tg-f-ring${inward ? " in" : ""}`, c.x, c.y, en, `--s:${Math.round(size)}px;animation-delay:${i * gap}ms`, 620 + i * gap, top);
  }

  /**
   * Bits thrown out from a point. `shape`: dot, shard, leaf, star, drop, plus, z.
   * `lift` pulls them upward as they go (embers, bubbles); `inward` gathers them instead.
   */
  function bits(c, n, en, { shape = "shard", reach = 60, size = 8, lift = 0, ms = 560, inward = false, spread = Math.PI * 2, aim = 0, top = false, stagger = 0 } = {}) {
    for (let i = 0; i < n; i += 1) {
      const el = fxEl(`tg-f-bit ${shape}`, c.x, c.y, en, `--s:${Math.round(size * 1.6 * rand(0.7, 1.3))}px`, ms + stagger * n + 80, top);
      if (!el) return;
      const angle = aim + (i / n) * spread + rand(-0.3, 0.3) - (spread < 6 ? spread / 2 : 0);
      const far = reach * rand(0.55, 1.05);
      const x = Math.cos(angle) * far;
      const y = Math.sin(angle) * far - lift * rand(0.6, 1.2);
      const turn = shape === "dot" || shape === "drop" || shape === "plus" || shape === "z" ? 0 : rand(-240, 240);
      const out = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${turn.toFixed(0)}deg) scale(${shape === "z" ? 1.3 : 0.3})`;
      const frames = inward
        ? [{ transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(1)`, opacity: 0 }, { opacity: 1, offset: 0.3 }, { transform: "translate(0, 0) scale(0.2)", opacity: 0.9 }]
        : [{ transform: "translate(0, 0) scale(1)", opacity: 1 }, { opacity: 1, offset: 0.6 }, { transform: out, opacity: 0 }];
      el.animate(frames, { duration: ms * rand(0.8, 1.1), delay: i * stagger, easing: inward ? "cubic-bezier(0.5, 0, 0.9, 0.5)" : "cubic-bezier(0.1, 0.7, 0.3, 1)", fill: "both" });
    }
  }

  /** A streak from the attacker to what it hits, in the attack's colour. */
  function streak(a, b, en) {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 8) return;
    fxEl("tg-f-streak", a.x, a.y, en, `--len:${len.toFixed(0)}px;--a:${Math.atan2(b.y - a.y, b.x - a.x).toFixed(3)}rad`, 420);
  }

  /** The whole screen blinks in a colour: a heavy hit, a Knock Out. */
  const flash = (en, strong = false) => fxEl(`tg-f-flash${strong ? " strong" : ""}`, 0, 0, en, "", 420);

  /** A short slanted word that rises off a Pokémon: a Special Condition landing, a cure. */
  function word(rect, text, tone = "") {
    const el = fxEl(`tg-f-word ${tone}`, rect.left + rect.width / 2, rect.top + rect.height * 0.04, "", "", 1100);
    if (el) el.textContent = text;
  }

  /** The attacker gathers itself before it moves. */
  function windUp(p, type) {
    const at = rectOf(`.tg-spot[data-p="${p}"] .tg-mon > img`);
    if (!at) return;
    const c = centre(at);
    rings(c, at.width * 1.5, type, { inward: true });
    bits(c, 9, type, { shape: "dot", reach: at.width * 0.95, size: 7, inward: true, ms: 400 });
  }

  /** What the attack looks like as it lands, by type. `heavy` adds the screen blink and more of everything. */
  function strike(p, type, heavy) {
    const at = rectOf(`.tg-spot[data-p="${p}"] .tg-mon > img`) || rectOf(`.tg-spot[data-p="${p}"]`);
    if (!at || still()) return;
    const c = centre(at);
    const w = at.width;
    const kind = STRIKE[type] || "impact";
    const more = heavy ? 1.5 : 1;
    if (heavy) flash(type);
    if (kind === "ember") {
      rings(c, w * 1.5, type);
      bits(c, Math.round(12 * more), type, { shape: "dot", reach: w * 0.6, size: 9, lift: w * 0.9, ms: 720, stagger: 12 });
      bits(c, 5, type, { shape: "shard", reach: w * 0.9, size: 10 });
    } else if (kind === "splash") {
      rings(c, w * 1.7, type, { n: heavy ? 3 : 2 });
      bits(c, Math.round(10 * more), type, { shape: "drop", reach: w * 0.9, size: 9, lift: w * 0.25, ms: 620 });
    } else if (kind === "bolt") {
      fxEl("tg-f-bolt", c.x, c.y, type, `--h:${Math.round(at.height * 1.5)}px;--w:${Math.round(w * 0.5)}px`, 460);
      if (heavy) fxEl("tg-f-bolt two", c.x + w * 0.22, c.y, type, `--h:${Math.round(at.height * 1.3)}px;--w:${Math.round(w * 0.4)}px`, 520);
      bits(c, Math.round(8 * more), type, { shape: "shard", reach: w * 0.85, size: 8, ms: 420 });
    } else if (kind === "leaf") {
      rings(c, w * 1.4, type);
      bits(c, Math.round(11 * more), type, { shape: "leaf", reach: w * 0.95, size: 12, lift: w * 0.15, ms: 760, stagger: 14 });
    } else if (kind === "rings") {
      rings(c, w * 1.8, type, { n: 3, gap: 90 });
      bits(c, Math.round(7 * more), type, { shape: "star", reach: w * 0.9, size: 11, ms: 680 });
    } else if (kind === "slash") {
      for (let i = 0; i < 3; i += 1) fxEl("tg-f-slash", c.x + (i - 1) * w * 0.2, c.y + (i - 1) * w * 0.06, type, `--len:${Math.round(w * 1.25)}px;animation-delay:${i * 55}ms`, 480);
      bits(c, Math.round(6 * more), type, { shape: "shard", reach: w * 0.8, size: 8, ms: 460 });
    } else {
      burst(p, type, heavy);
      bits(c, Math.round(9 * more), type, { shape: "shard", reach: w * 0.9, size: 9, ms: 480 });
    }
    if (kind !== "impact") burst(p, type, false);
  }

  /** A Knocked Out Pokémon breaks apart. */
  function shatter(p, spot) {
    const at = rectOf(`${monSel(p, spot)} > img`);
    if (!at) return;
    const c = centre(at);
    flash("", true);
    rings(c, at.width * 2, "", { n: 2 });
    bits(c, 16, "", { shape: "shard", reach: at.width * 1.1, size: 12, ms: 700 });
  }

  /** A Special Condition lands on an Active Pokémon. */
  const COND_EN = { poisoned: "Psychic", burned: "Fire", asleep: "Water", paralyzed: "Lightning", confused: "Fairy" };
  function afflict(p, kind) {
    const at = rectOf(`.tg-spot[data-p="${p}"] .tg-mon > img`);
    if (!at) return;
    const c = centre(at);
    const en = COND_EN[kind] || "";
    word(at, COND_NAME[kind] || "", kind);
    if (kind === "poisoned") bits({ x: c.x, y: c.y + at.height * 0.3 }, 10, en, { shape: "dot", reach: at.width * 0.45, size: 10, lift: at.height * 0.7, ms: 900, stagger: 40 });
    else if (kind === "burned") bits({ x: c.x, y: c.y + at.height * 0.3 }, 12, en, { shape: "dot", reach: at.width * 0.4, size: 8, lift: at.height * 0.8, ms: 760, stagger: 25 });
    else if (kind === "asleep") bits({ x: c.x + at.width * 0.2, y: c.y - at.height * 0.25 }, 3, en, { shape: "z", reach: at.width * 0.3, size: 16, lift: at.height * 0.5, ms: 1100, stagger: 200, spread: 0.8, aim: -0.6 });
    else if (kind === "paralyzed") {
      fxEl("tg-f-bolt", c.x, c.y, en, `--h:${Math.round(at.height * 1.2)}px;--w:${Math.round(at.width * 0.4)}px`, 460);
      bits(c, 8, en, { shape: "shard", reach: at.width * 0.8, size: 7, ms: 420 });
    } else if (kind === "confused") fxEl("tg-f-orbit", c.x, c.y - at.height * 0.42, en, `--s:${Math.round(at.width * 0.7)}px`, 1250);
    cue(`.tg-spot[data-p="${p}"] .tg-mon`, "hit", 420);
  }

  /** Something good happens to a Pokémon: healed, cured. */
  function mend(p, spot = ACTIVE) {
    const at = rectOf(`${monSel(p, spot >= 0 ? spot : ACTIVE)} > img`);
    if (!at) return;
    const c = centre(at);
    rings(c, at.width * 1.5, "Grass");
    bits({ x: c.x, y: c.y + at.height * 0.2 }, 6, "Grass", { shape: "plus", reach: at.width * 0.4, size: 11, lift: at.height * 0.6, ms: 800, stagger: 50 });
  }

  /** A Pokémon sets down on the mat. */
  function land(p, spot) {
    const at = rectOf(`${monSel(p, spot)} > img`);
    if (!at) return;
    cue(monSel(p, spot), "thud", 380);
    fxEl("tg-f-dust", at.left + at.width / 2, at.bottom - at.height * 0.06, "", `--s:${Math.round(at.width * 1.5)}px`, 460);
  }

  /** Cards leave a deck for its discard pile, face down. */
  function millCards(p, n) {
    const from = deckSpot(p);
    const bin = rectOf(`.tg-deckpile[data-p="${p}"] .tg-bin`);
    if (!from || !bin) return;
    for (let i = 0; i < Math.min(n, 4); i += 1) ghost("assets/cards/shared/card-back-sm.webp", from, { left: bin.left + bin.width / 2 - 12, top: bin.top - 8, width: 24, height: 34 }, { ms: 360, width: from.width, toss: true, delay: i * 90 });
    setTimeout(() => cue(`.tg-deckpile[data-p="${p}"] .tg-bin`, "bump", 400), 320);
  }

  /** The HP bar on a name plate runs down (or up) from where it stood. */
  function slideHp(p, before, after, max) {
    const bar = root.querySelector(`.tg-hud[data-p="${p}"] .tg-hp i`);
    if (!bar || !max || still()) return;
    bar.animate([{ transform: `scaleX(${(before / max).toFixed(3)})` }, { transform: `scaleX(${(after / max).toFixed(3)})` }], { duration: 460, easing: EASE });
  }

  const handSpot = (p) => (p === ME ? rectOf(".tg-hand") : rectOf(".tg-foe-hand"));
  const deckSpot = (p) => rectOf(`.tg-deckpile[data-p="${p}"] .tg-stack`);
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
      banner(event.p === ME ? "Your turn" : `${foeName()}'s turn`, event.p === ME ? "me" : "foe", match.state.turn > 0 ? `Turn ${match.state.turn}` : "");
      return 0;
    }
    if (event.t === "draw" || (event.t === "search" && event.to === "hand")) {
      if (!event.uids.length) return 0;
      if (event.p === BOT) {
        cue(".tg-foe-hand", "bump", 400);
        cue(`.tg-deckpile[data-p="${BOT}"] .tg-pile-n`, "bump", 400);
        return 0;
      }
      // The hand is sorted, so the cards that just arrived are found by name, not by place.
      const cards = event.uids.map((uid) => root.querySelector(`.tg-hand [data-hand="${uid}"]`)).filter(Boolean);
      const fromDeck = event.t === "draw" || event.from !== "discard";
      cards.forEach((card, i) => flyIn(deckSpot(ME), card, { ms: 460, delay: i * 110, flip: fromDeck }));
      if (fromDeck) cue(`.tg-deckpile[data-p="${ME}"] .tg-pile-n`, "bump", 400);
      return 460 + (cards.length - 1) * 110;
    }
    const src = from || (event.from === "deck" ? deckSpot(event.p) : handSpot(event.p));
    if (event.t === "bench") {
      flyIn(src, root.querySelector(monSel(event.p, event.spot)), { ms: 300 });
      setTimeout(() => land(event.p, event.spot), 290);
      return 420;
    }
    if (event.t === "evolve") {
      const el = root.querySelector(monSel(event.p, event.spot));
      flyIn(src, el, { ms: 300 });
      setTimeout(() => {
        cue(monSel(event.p, event.spot), "evolved", 700);
        const at = rectOf(`${monSel(event.p, event.spot)} > img`);
        if (!at) return;
        const c = centre(at);
        fxEl("tg-f-rays", c.x, c.y, "", `--s:${Math.round(at.width * 2.4)}px`, 760);
        rings(c, at.width * 1.9, "", { n: 2 });
        bits({ x: c.x, y: c.y + at.height * 0.25 }, 12, "Lightning", { shape: "star", reach: at.width * 0.6, size: 10, lift: at.height * 0.7, ms: 820, stagger: 22 });
      }, 290);
      return 780;
    }
    if (event.t === "play" || event.t === "stadium") {
      // The card is shown large over the arena for a beat, so both players read what was played.
      const arena = rectOf(".tg-arena");
      if (!arena) return 0;
      const w = Math.min(arena.width * 0.5, arena.height * 0.62);
      const to = { left: arena.left + arena.width / 2 - w / 2, top: arena.top + arena.height / 2 - w * 0.7, width: w, height: w * 1.4 };
      const def = d(event.uid);
      const label = event.t === "stadium" ? "Stadium" : { supporter: "Supporter", item: "Item", tool: "Pokémon Tool" }[def?.sub] || (def?.kind === "trainer" ? "Trainer" : "");
      // It leaves for where it really goes: the discard pile, or the Stadium's place on the mat.
      const out = event.t === "stadium" ? rectOf(".tg-stadium img") : rectOf(`.tg-deckpile[data-p="${event.p}"] .tg-bin`);
      showing = showCard(img(match.state.cards[event.uid]), src, to, event.p === ME ? 1300 : 2600, { label, out, stadium: event.t === "stadium", p: event.p });
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
      if (to) ghost(img(match.state.cards[event.uid]), src, to, { ms: 360, width: to.width * 0.62, absorb: true });
      setTimeout(() => {
        cue(monSel(event.p, event.spot), "charged", 460);
        const at = rectOf(`${monSel(event.p, event.spot)} > img`);
        if (!at) return;
        // The Pokémon takes the Energy in: a ring and a few motes in that Energy's colour.
        const kind = event.t === "attach" ? d(event.uid)?.provides?.[0] || "Colorless" : "";
        rings(centre(at), at.width * 1.45, kind);
        bits(centre(at), 7, kind, { shape: "dot", reach: at.width * 0.75, size: 7, ms: 520 });
      }, 260);
      // The new symbol lands on the name plate (or under a Benched Pokémon) as the card sinks in.
      if (event.t === "attach") cue(event.spot === ACTIVE ? `.tg-hud[data-p="${event.p}"] .tg-pips > :last-child` : `${monSel(event.p, event.spot)} .tg-pips > :last-child`, "landed", 700);
      return 460;
    }
    if (event.t === "promote" || event.t === "retreat" || event.t === "switch") {
      flyIn(benchSpot(event.p), root.querySelector(monSel(event.p, ACTIVE)), { ms: 320 });
      setTimeout(() => land(event.p, ACTIVE), 310);
      return 440;
    }
    if (event.t === "prize") {
      const to = handSpot(event.p);
      const at = rectOf(`.tg-prizes[data-p="${event.p}"]`);
      const arena = rectOf(".tg-arena");
      if (event.p === ME && at && arena) {
        // Your prize cards turn up face up over the arena for a beat before they join your hand.
        const n = event.uids.length;
        const w = Math.min(arena.width * (n > 1 ? 0.3 : 0.4), arena.height * 0.5);
        event.uids.forEach((uid, i) => {
          const left = arena.left + arena.width / 2 + (i - (n - 1) / 2) * (w + 8) - w / 2;
          const mid = { left, top: arena.top + arena.height / 2 - w * 0.7, width: w, height: w * 1.4 };
          ghost(img(match.state.cards[uid]), at, mid, { ms: 520, width: w, flip: true, delay: i * 110, then: to ? { to: { left: to.left + to.width / 2 - w * 0.25, top: to.top, width: w * 0.5, height: w * 0.7 }, hold: 520 } : null });
          setTimeout(() => { rings(centre(mid), w * 1.5, "Lightning"); bits(centre(mid), 8, "Lightning", { shape: "star", reach: w * 0.8, size: 10, ms: 620 }); }, 500 + i * 110);
        });
        cue(`.tg-prizes[data-p="${ME}"] .tg-pile-n`, "bump", 420);
        return 1300 + (n - 1) * 110;
      }
      if (to && at) {
        const width = event.p === ME ? to.height / 1.6 : 26;
        event.uids.forEach((_, i) => ghost("assets/cards/shared/card-back-sm.webp", at, to, { ms: 420, width, absorb: true, delay: i * 110 }));
      }
      cue(`.tg-prizes[data-p="${event.p}"] .tg-pile-n`, "bump", 420);
      return 300;
    }
    if (event.t === "ability") {
      banner(event.name, event.p === ME ? "me" : "foe", d(event.uid).name);
      cue(monSel(event.p, event.spot), "charged", 460);
      const at = rectOf(`${monSel(event.p, event.spot)} > img`);
      if (at) {
        rings(centre(at), at.width * 1.7, "Lightning", { n: 2 });
        bits(centre(at), 8, "Lightning", { shape: "star", reach: at.width * 0.8, size: 9, ms: 620 });
      }
      return 620;
    }
    if (event.t === "condition") {
      cue(`.tg-hud[data-p="${event.p}"] .tg-cond[data-cond="${event.kind}"]`, "bump", 420);
      afflict(event.p, event.kind);
    }
    if (event.t === "cure") {
      mend(event.p);
      const at = rectOf(`.tg-spot[data-p="${event.p}"] .tg-mon > img`);
      if (at) word(at, "Cured", "heal");
    }
    if (event.t === "mill") millCards(event.p, event.uids.length);
    if (event.t === "shuffle" || event.t === "recycle" || event.t === "shuffle-hand" || event.t === "shuffle-in" || event.t === "energy-to-deck" || event.t === "hand-to-deck") cue(`.tg-deckpile[data-p="${event.p}"] .tg-stack`, "riffle", 620);
    if (event.t === "discard-hand" || event.t === "discard-tool" || event.t === "stadium-gone") cue(`.tg-deckpile[data-p="${event.p}"] .tg-bin`, "bump", 400);
    if (event.t === "bounce" || event.t === "devolve" || event.t === "ko-hand" || event.t === "energy-to-hand") cue(event.p === ME ? ".tg-hand" : ".tg-foe-hand", "bump", 400);
    if (event.t === "discard-energy") {
      const at = rectOf(`${monSel(event.p, event.spot >= 0 ? event.spot : ACTIVE)} > img`);
      const bin = rectOf(`.tg-deckpile[data-p="${event.p}"] .tg-bin`);
      if (at && bin) event.uids.slice(0, 4).forEach((uid, i) => ghost(img(match.state.cards[uid]), { left: at.left + at.width * 0.25, top: at.top + at.height * 0.25, width: at.width * 0.5, height: at.height * 0.5 }, { left: bin.left + bin.width / 2 - 12, top: bin.top - 8, width: 24, height: 34 }, { ms: 380, width: at.width * 0.5, toss: true, delay: i * 90 }));
      setTimeout(() => cue(`.tg-deckpile[data-p="${event.p}"] .tg-bin`, "bump", 400), 340);
    }
    if (event.t === "mark") cue(`.tg-hud[data-p="${event.p}"] .tg-cond[data-mark="${event.kind}"]`, "bump", 420);
    return 0;
  }

  /** A coin comes to rest: a ring off its rim, and sparks when it is heads. */
  function coinLanded(coin, heads) {
    const at = coin?.getBoundingClientRect();
    if (!at?.width) return;
    const c = centre(at);
    rings(c, at.width * 1.5, heads ? "Lightning" : "", { top: true });
    if (heads) bits(c, 12, "Lightning", { shape: "star", reach: at.width * 0.95, size: 11, ms: 700, top: true });
  }

  async function showFlips(results) {
    for (const heads of results.slice(0, 4)) {
      match.sheet = "flip";
      paintTable();
      const coin = root.querySelector(".tg-flip .cf-coin");
      await flipCoin(coin, heads ? "heads" : "tails", { ms: 1100, motion: !deps.reduceMotion() });
      const text = root.querySelector("#tg-flip-text");
      if (text) text.textContent = heads ? "Heads" : "Tails";
      root.querySelector(".tg-flip")?.classList.add("is-landed");
      coinLanded(coin, heads);
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
        const called = user && attacksOf(before, user, defs)[action.index];
        const kind = used?.types?.[0] || "Colorless";
        if (called) {
          banner(called.name, p === ME ? "me" : "foe", used.name);
          windUp(p, kind);
          await wait(430);
        }
        cue(`.tg-spot[data-p="${p}"] .tg-mon`, p === ME ? "lunge-up" : "lunge-down", 420);
        // The attack crosses the centre line as the attacker reaches the top of its lunge.
        const mine = rectOf(`.tg-spot[data-p="${p}"]`);
        const theirs = rectOf(`.tg-spot[data-p="${other(p)}"]`);
        if (mine && theirs && events.some((e) => e.t === "damage" && e.p !== p && !(e.spot >= 0))) setTimeout(() => streak(centre(mine), centre(theirs), kind), 170);
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
          popDamage(event.p, event.t === "heal" ? `+${event.n}` : `-${event.n}`, `${event.t === "heal" ? "heal" : event.weak ? "weak" : ""}${event.n >= 200 ? " huge" : event.n >= 100 ? " big" : ""}`, event.spot);
          if (event.t === "heal") mend(event.p, event.spot);
          if (event.t === "damage") {
            const heavy = !benched && (event.weak || (max && event.n * 2 >= max));
            const kind = defOf(before, before.players[p].active.uid, defs).types?.[0];
            if (!event.self && !event.why && !benched) strike(event.p, kind, heavy);
            else if (benched) {
              const at = rectOf(`${monSel(event.p, event.spot)} > img`);
              if (at) bits(centre(at), 6, kind, { shape: "shard", reach: at.width * 0.8, size: 6, ms: 420 });
            }
            cue(monSel(event.p, benched ? event.spot : ACTIVE), "hit", 420);
            if (!benched) cue(`.tg-hud[data-p="${event.p}"]`, "jolt", 420);
            if (heavy) cue(".tg-table", "shake", 420);
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
          const fallen = monSel(event.p, event.spot === ACTIVE ? ACTIVE : event.spot);
          cue(fallen, "ko", 900);
          shatter(event.p, event.spot);
          cue(".tg-table", "shake", 420);
          banner("Knocked Out", event.p === ME ? "foe" : "me");
          deps.buzz?.([24, 40, 24]);
          await wait(520);
          // The card leaves for its owner's discard pile.
          const pic = root.querySelector(`${fallen} > img`);
          const bin = rectOf(`.tg-deckpile[data-p="${event.p}"] .tg-bin`);
          if (pic && bin) {
            ghost(pic.currentSrc || pic.src, pic.getBoundingClientRect(), { left: bin.left + bin.width / 2 - 12, top: bin.top - 8, width: 24, height: 34 }, { ms: 380, width: pic.getBoundingClientRect().width, toss: true });
            setTimeout(() => cue(`.tg-deckpile[data-p="${event.p}"] .tg-bin`, "bump", 400), 340);
          }
          await wait(still() ? 160 : 400);
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
          const at = rectOf(`.tg-spot[data-p="${event.p}"] .tg-mon > img`);
          if (at) bits({ x: at.left + at.width / 2, y: at.top + at.height * 0.8 }, 9, COND_EN[event.why] || "", { shape: "dot", reach: at.width * 0.45, size: 9, lift: at.height * 0.7, ms: 800, stagger: 30 });
        }
        await wait(620);
      } else if (event.t === "flip") {
        await showFlips(event.results);
      } else if (event.t === "heal") {
        popDamage(event.p, `+${event.n}`, "heal", event.spot);
        mend(event.p, event.spot);
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
    if (match.online) {
      paintTable();
      loadRematch();
      return true;
    }
    if (match.lesson != null) write("learned", true);
    else if (match.state.winner != null) {
      // Kept per level too, for the hub and the end of the match. `streak` counts wins in a row at that level.
      const won = match.state.winner === ME;
      const at = (record.levels ||= {})[match.level || "normal"] ||= { wins: 0, losses: 0, streak: 0 };
      if (won) record.wins += 1;
      else record.losses += 1;
      at[won ? "wins" : "losses"] += 1;
      at.streak = won ? (at.streak || 0) + 1 : 0;
    }
    if (match.lesson == null && match.ticket) payOut(match);
    write("record", record);
    write("match", null);
    paintTable();
    return true;
  }

  /** Hands the match's ticket back; a paid win shows its XP on the end sheet and refreshes the level bar. */
  async function payOut(done) {
    const ticket = done.ticket;
    done.ticket = "";
    const res = await api("/api/tcg/bot/finish", { method: "POST", body: JSON.stringify({ id: ticket, won: done.state.winner === ME }) }).catch(() => null);
    if (!res || done !== match) return;
    done.reward = res;
    if (res.paid) deps.refreshSave?.();
    if (match.over) paintTable();
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
      const action = botMove(state);
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
      const left = root.querySelector("[data-rematch-time]");
      if (left) left.textContent = rematchLeft();
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

  /* ---------- a rematch, from the finished table (worker/tcg.js Rematch) ----------
     While the finished table is open the page reads the rematch every few seconds, which
     tells the Worker this player is still here. Either player offers; the other accepts and
     both pages go to the new table. Leaving the table closes any offer. */

  const REMATCH_POLL_MS = 2500;
  let rematchTimer = 0;

  const rematchLeft = () => {
    const r = match?.rematch;
    if (!r || r.status !== "open") return "";
    const secs = Math.max(0, Math.round((r.deadline - (Date.now() + (match.rematchSkew || 0))) / 1000));
    return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  };

  function rematchDeckHtml() {
    const format = match.online.summary?.format;
    const choices = readyDecks().filter((deck) => deck.format === format);
    if (!choices.length) return "";
    if (!choices.some((deck) => deck.id === match.rematchDeck)) match.rematchDeck = "";
    return `<label class="tg-rematch-deck"><span>Deck</span><select class="filter" id="tg-rematch-deck">
      <option value="">The same deck</option>
      ${choices.map((deck) => `<option value="${esc(deck.id)}"${deck.id === match.rematchDeck ? " selected" : ""}>${esc(deck.name)}</option>`).join("")}
    </select></label>`;
  }

  function rematchHtml() {
    const r = match.rematch;
    const them = esc(foeName());
    const busy = match.rematchBusy ? " disabled" : "";
    if (!r) return `<p class="tg-rematch-line">Checking whether ${them} is still at the table.</p>`;
    if (r.status === "accepted") return `<p class="tg-rematch-line"><b>Rematch on.</b>Taking you to the table.</p>`;
    if (r.status === "declined") return `<p class="tg-rematch-line">${r.mine ? `${them} said no to a rematch.` : "You said no to a rematch."}</p>`;
    if (r.status === "left") return `<p class="tg-rematch-line">${r.mine ? "You left the table, so the rematch closed." : `${them} has left the table.`}</p>`;
    if (!r.here && !(r.status === "open" && !r.mine)) return `<p class="tg-rematch-line">${them} isn't at the table right now.</p>`;
    if (r.status === "open" && !r.mine) {
      return `<p class="tg-rematch-line"><b>${them} wants a rematch.</b>Same format, a fresh coin flip. <span data-rematch-time>${rematchLeft()}</span> to answer.</p>
        ${rematchDeckHtml()}
        <div class="tg-sheet-keys"><button type="button" class="solid rt-go" data-act="rematch"${busy}>Accept rematch</button><button type="button" class="ghost" data-act="rematch-no"${busy}>No thanks</button></div>`;
    }
    if (r.status === "open") {
      return `<p class="tg-rematch-line"><b>Rematch offered.</b>Waiting for ${them} to answer, <span data-rematch-time>${rematchLeft()}</span> left.</p>
        <div class="tg-sheet-keys"><button type="button" class="ghost" data-act="rematch-no"${busy}>Call it off</button></div>`;
    }
    const lead = r.status === "expired" ? "The offer ran out. " : r.status === "cancelled" ? "The offer was called off. " : "";
    return `<p class="tg-rematch-line">${lead}Play ${them} again: same format, a fresh coin flip.</p>
      ${rematchDeckHtml()}
      <div class="tg-sheet-keys"><button type="button" class="solid rt-go" data-act="rematch"${busy}>Rematch</button></div>`;
  }

  function paintRematch() {
    const el = root.querySelector("[data-rematch]");
    if (el) el.innerHTML = rematchHtml();
  }

  function takeRematch(r) {
    if (!r || !match?.online) return;
    const same = (a) => JSON.stringify(a ? { ...a, now: 0 } : null);
    const changed = same(match.rematch) !== same(r);
    match.rematch = r;
    match.rematchSkew = r.now - Date.now();
    if (r.status === "accepted" && r.next) {
      clearTimeout(rematchTimer);
      paintRematch();
      deps.navigate(`/play/online/${r.next}`);
      return;
    }
    if (changed) paintRematch();
  }

  function rematchSoon(ms = REMATCH_POLL_MS) {
    clearTimeout(rematchTimer);
    rematchTimer = setTimeout(loadRematch, ms);
  }

  async function loadRematch() {
    const mine = match;
    if (!shown || route.name !== "online" || !mine?.online || !mine.over || mine.rematchGone) return;
    try {
      const res = await api(`/api/tcg/matches/${mine.online.id}/rematch`);
      if (mine !== match) return;
      takeRematch(res.rematch);
    } catch {
      /* a dropped read: the next one catches up */
    }
    // A rematch that was turned down or left can't change again; there's nothing more to read.
    if (mine === match && !["accepted", "declined", "left"].includes(match.rematch?.status)) rematchSoon();
  }

  async function rematchAct(kind) {
    const mine = match;
    if (!mine?.online || mine.rematchBusy) return;
    mine.rematchBusy = true;
    paintRematch();
    try {
      const deck = kind === "offer" ? decks.find((x) => x.id === mine.rematchDeck) : null;
      const res = await api(`/api/tcg/matches/${mine.online.id}/rematch${kind === "offer" ? "" : "/decline"}`, {
        method: "POST",
        body: JSON.stringify(deck ? { deck: { name: deck.name, format: deck.format, cards: deck.cards } } : {}),
      });
      mine.rematchBusy = false;
      if (mine === match) takeRematch(res.rematch);
    } catch (err) {
      mine.rematchBusy = false;
      toast(err.message || "That didn't go through.");
    }
    if (mine !== match) return;
    paintRematch();
    rematchSoon();
  }

  /** Leaving a finished table closes any rematch offer, for both players. */
  function leaveRematch(m) {
    if (!m?.online || !m.over || m.rematchGone || m.rematch?.status === "accepted") return;
    m.rematchGone = true;
    clearTimeout(rematchTimer);
    api(`/api/tcg/matches/${m.online.id}/rematch/leave`, { method: "POST", body: "{}", keepalive: true }).catch(() => null);
  }

  /* ---------- the online page: quick match, challenges and matches ---------- */

  const lobby = { friends: null, matches: null, deckId: "", loading: false, error: "", known: new Set(), queue: null, waiting: {}, queueSkew: 0, queueBusy: false, html: "" };
  let lobbyTimer = 0;
  let queueTimer = 0;
  let queueTick = 0;
  const QUEUE_POLL_MS = 2500;

  /** Paint the online page, unless nothing on it changed (a repaint would restart the waiting animation and close the deck menu). */
  function paintLobby(force = false) {
    if (!shown || route.name !== "friends") return;
    const html = friendsHtml();
    if (!force && html === lobby.html && root.querySelector(".tg-pvp")) return;
    lobby.html = html;
    root.innerHTML = html;
    tickQueue();
  }

  const readyDecks = () => decks.filter((deck) => checkDeck(deck, owned(), defs).ok);
  const timeLeft = (ms) => (ms < 60000 ? "under a minute" : `${Math.round(ms / 60000)} min`);
  const handleOf = (u) => (u?.handle ? `@${u.handle}` : u?.name || "A trainer");

  async function loadLobby() {
    if (lobby.loading) return;
    if (!deps.signedIn?.()) {
      lobby.error = "Sign in to play online.";
      paintLobby();
      return;
    }
    lobby.loading = true;
    try {
      const [friends, matches, queue] = await Promise.all([lobby.friends ? Promise.resolve(lobby.friends) : api("/api/friends"), api("/api/tcg/matches"), route.name === "friends" ? api("/api/tcg/queue").catch(() => null) : null]);
      lobby.friends = friends;
      if (queue && takeQueue(queue)) {
        lobby.loading = false;
        return;
      }
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
      lobby.error = err.status === 401 ? "Sign in to play online." : err.message || "Couldn't load your friends.";
    }
    lobby.loading = false;
    paintLobby();
  }

  /* The quick match queue (worker/tcg.js Quick match queue). While this page has a place
     it reads the queue every few seconds: that keeps the place, and is how it hears it was
     paired. Leaving the page gives the place up. */

  /** Take the Worker's answer about the queue. True when it paired this player and the page is going to the table. */
  function takeQueue(res) {
    const was = lobby.queue;
    lobby.waiting = res.waiting || {};
    lobby.queueSkew = (res.now || Date.now()) - Date.now();
    // Only a page that was waiting goes to the table: a pairing from before (a reload, an old tab) is in Matches on.
    if (res.queue?.match) {
      lobby.queue = null;
      if (was && shown && route.name === "friends") {
        clearTimeout(queueTimer);
        deps.navigate(`/play/online/${res.queue.match}`);
        return true;
      }
      return false;
    }
    lobby.queue = res.queue || null;
    if (was && !lobby.queue && res.expired) toast("Your place in the queue ran out. Find a match again when you're ready.");
    if (lobby.queue) queueSoon();
    return false;
  }

  function queueSoon(ms = QUEUE_POLL_MS) {
    clearTimeout(queueTimer);
    queueTimer = setTimeout(pollQueue, ms);
  }

  async function pollQueue() {
    if (!shown || route.name !== "friends" || !lobby.queue) return;
    try {
      const res = await api("/api/tcg/queue");
      if (!lobby.queue || route.name !== "friends") return;
      if (takeQueue(res)) return;
    } catch {
      /* a dropped read: the next one catches up, well inside the time a place is kept */
      queueSoon();
    }
    paintLobby();
  }

  /** How long this player has been waiting, on the waiting card. Text only, no repaint. */
  function tickQueue() {
    clearInterval(queueTick);
    if (!lobby.queue) return;
    const draw = () => {
      const el = root.querySelector("[data-quick-time]");
      if (!el || !lobby.queue) return clearInterval(queueTick);
      const secs = Math.max(0, Math.round((Date.now() + lobby.queueSkew - lobby.queue.joinedAt) / 1000));
      el.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
    };
    draw();
    queueTick = setInterval(draw, 1000);
  }

  async function findMatch() {
    const deck = decks.find((x) => x.id === lobby.deckId);
    if (!deck || lobby.queueBusy) return;
    lobby.queueBusy = true;
    paintLobby();
    try {
      const res = await api("/api/tcg/queue", { method: "POST", body: JSON.stringify({ deck: { name: deck.name, format: deck.format, cards: deck.cards } }) });
      lobby.queueBusy = false;
      // Paired straight away still counts as waiting: go to the table.
      lobby.queue = lobby.queue || { format: deck.format, deckName: deck.name, joinedAt: res.now };
      if (takeQueue(res)) return;
    } catch (err) {
      lobby.queueBusy = false;
      toast(err.message || "Couldn't join the queue.");
    }
    paintLobby();
  }

  async function cancelQueue() {
    if (lobby.queueBusy) return;
    lobby.queueBusy = true;
    clearTimeout(queueTimer);
    paintLobby();
    try {
      const res = await api("/api/tcg/queue/cancel", { method: "POST", body: "{}" });
      lobby.queueBusy = false;
      // Paired just before the cancel: the match stands, so go to it.
      if (takeQueue(res)) return;
      lobby.queue = null;
    } catch (err) {
      lobby.queueBusy = false;
      toast(err.message || "That didn't go through.");
      if (lobby.queue) queueSoon();
    }
    paintLobby();
  }

  /** Leaving the page gives the place up; the Worker would drop it soon anyway. */
  function dropQueue() {
    clearTimeout(queueTimer);
    clearInterval(queueTick);
    if (!lobby.queue) return;
    lobby.queue = null;
    api("/api/tcg/queue/cancel", { method: "POST", body: "{}", keepalive: true }).catch(() => null);
  }

  function quickHtml(chosen) {
    const fmt = (id) => FORMATS[id]?.name || "Deck";
    const q = lobby.queue;
    const busy = lobby.queueBusy ? " disabled" : "";
    if (q) {
      return `<section class="rt-box tg-quick is-on">
        <div class="tg-quick-scan" aria-hidden="true"><i></i><i></i><i></i></div>
        <div class="tg-quick-main">
          <h2 class="tg-hero-name">Looking for a ${fmt(q.format)} match</h2>
          <p class="tg-meta" role="status">With ${esc(q.deckName || "your deck")}, waiting <span data-quick-time>0:00</span>. The table opens when you're paired.</p>
          <div class="tg-hero-keys"><button type="button" class="ghost sm" data-quick-cancel${busy}>Cancel</button></div>
        </div>
      </section>`;
    }
    const n = chosen ? lobby.waiting[chosen.format] || 0 : 0;
    const line = chosen ? `Anyone looking for a ${fmt(chosen.format)} match. ${n ? `${plural(n, "trainer")} waiting now.` : "Nobody's waiting yet, so you'd be first in line."}` : "Pick a ready deck first.";
    return `<section class="rt-box tg-quick">
      <div class="tg-quick-scan" aria-hidden="true"><i></i><i></i><i></i></div>
      <div class="tg-quick-main">
        <h2 class="tg-hero-name">Quick match</h2>
        <p class="tg-meta">${line} You see each other's name and nothing else.</p>
        <div class="tg-hero-keys"><button type="button" class="solid rt-go" data-quick-find${chosen && !busy ? "" : " disabled"}>Find a match</button></div>
      </div>
    </section>`;
  }

  function lobbySoon() {
    clearTimeout(lobbyTimer);
    lobbyTimer = setTimeout(async () => {
      if (!shown || route.name !== "friends") return;
      await loadLobby();
      lobbySoon();
    }, 4000);
  }

  /** A row on the online page: the same row as "Who to play", with its keys where the action word goes. */
  function matchRowHtml(m, keys, line, lab = "Match", name = esc(handleOf(m.them))) {
    return `<article class="rt-row tg-row tg-pvp-row">
      <span class="rt-row-lab">${lab}</span>
      <span class="rt-row-name">${name}<small>${line}</small></span>
      <span class="tg-row-keys">${keys}</span>
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
      <header class="tg-head tg-ed-head">
        <h1 class="page-title tg-title">Play online</h1>
        <button type="button" class="tlink tg-done" data-go="/play">Back</button>
      </header>
      <p class="tg-lede">Each move has ${TCG_MOVE_SECONDS} seconds on the clock. Just for fun: nothing is won or lost.</p>
      ${lobby.error ? `<p class="rt-empty tg-none">${esc(lobby.error)}</p>` : ""}
      ${ready.length
        ? `<label class="rt-row tg-row tg-pvp-deck"><span class="rt-row-lab">Deck</span><span class="rt-row-name">Your deck<select class="filter" id="tg-pvp-deck" aria-label="Your deck"${lobby.queue ? " disabled" : ""}>${ready.map((deck) => `<option value="${esc(deck.id)}"${deck.id === lobby.deckId ? " selected" : ""}>${esc(deck.name)}, ${fmt(deck.format)}</option>`).join("")}</select></span></label>`
        : `<div class="rt-row tg-row tg-pvp-deck"><span class="rt-row-lab">Deck</span><span class="rt-row-name">No deck is ready yet<small>Online matches need a deck that's legal in its format</small></span><span class="tg-row-keys"><button type="button" class="ghost sm" data-go="/play">Build one</button></span></div>`}
      ${lobby.error ? "" : quickHtml(chosen)}
      ${!m ? (lobby.error ? "" : `<div class="rt-skel tg-loading">Loading</div>`) : `
      ${m.incoming.length ? `<section class="tg-block"><div class="tg-hd"><h2 class="tg-h2">Challenges for you</h2></div>
        ${m.incoming.map((x) => matchRowHtml(x, `<button type="button" class="solid sm" data-accept="${x.id}"${chosen?.format === x.format ? "" : " disabled"}>Accept</button><button type="button" class="ghost sm" data-decline="${x.id}">Decline</button>`, `${fmt(x.format)}, ${timeLeft(x.deadline - now)} to answer${chosen?.format === x.format ? "" : `. Pick a ${fmt(x.format)} to accept`}`, "Challenge")).join("")}
      </section>` : ""}
      ${m.live.length ? `<section class="tg-block"><div class="tg-hd"><h2 class="tg-h2">Matches on</h2></div>
        ${m.live.map((x) => matchRowHtml(x, `<button type="button" class="solid sm" data-go="/play/online/${x.id}">Play</button>`, `${fmt(x.format)}, ${x.toMove.includes(x.seat) ? "your move" : "their move"}`, x.toMove.includes(x.seat) ? "Your move" : "On")).join("")}
      </section>` : ""}
      ${m.outgoing.length ? `<section class="tg-block"><div class="tg-hd"><h2 class="tg-h2">Waiting for an answer</h2></div>
        ${m.outgoing.map((x) => matchRowHtml(x, `<button type="button" class="ghost sm" data-call-off="${x.id}">Call off</button>`, `${esc(x.deckName)}, ${timeLeft(x.deadline - now)} left`, "Sent")).join("")}
      </section>` : ""}
      <section class="tg-block"><div class="tg-hd"><h2 class="tg-h2">Friends</h2></div>
        ${friends.length ? friends.map((f) => matchRowHtml({ them: f }, `<button type="button" class="ghost sm" data-challenge="${esc(f.handle)}"${chosen && !busyWith.has(f.handle) ? "" : " disabled"}>${busyWith.has(f.handle) ? "Playing" : "Challenge"}</button>`, `@${esc(f.handle)}${f.online ? ", online now" : ""}`, f.online ? "Online" : "Friend", esc(f.name || handleOf(f)))).join("") : `<p class="rt-empty tg-none">No friends yet. Add some from their profile, then challenge them here.</p>`}
      </section>
      ${m.recent.length ? `<section class="tg-block tg-pvp-recent"><div class="tg-hd"><h2 class="tg-h2">Lately</h2></div>
        <ul class="rt-box">${m.recent.map((x) => `<li><span>${esc(handleOf(x.them))}</span><b>${esc(resultOf(x))}</b></li>`).join("")}</ul>
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
      // Cinderace's Explosiveness: it may start in the Active Spot, not on the Bench.
      const leadOnly = def.kind === "pokemon" && def.ability?.setupActive && def.stage !== "basic";
      if ((def.kind !== "pokemon" || def.stage !== "basic") && !(leadOnly && !match.setup.active)) return toast(leadOnly ? `${def.name} can only start in the Active Spot.` : "Only Basic Pokémon can start in play.");
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
      if (spot !== ACTIVE && myTurn() && !sel && !waiting && (d(slot.uid).ability?.use || d(slot.uid).fossil?.drop)) {
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
      if (!state.players[BOT].placed) apply(state, botMove(state), defs);
      saveMatch();
      match.line = [act === "go-first" ? "You go first." : `${foeName()} goes first.`, ...mulliganLines(state)].join(" ");
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
    if (act === "rematch" && match.online) return rematchAct("offer");
    if (act === "rematch-no" && match.online) return rematchAct("decline");
    // From the lesson's end straight to a new deck, the next step.
    if (act === "lesson-build") {
      match = null;
      draft.open = true;
      return deps.navigate("/play");
    }
    if (act === "again-up") {
      const next = LEVELS[LEVELS.findIndex((l) => l.id === (match.level || "normal")) + 1];
      if (next) {
        level = next.id;
        write("level", level);
      }
      const id = match.deckId;
      match = null;
      return startMatch(id).then(() => paint());
    }
    if (act === "again") {
      level = match.level || level;
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
    if (act === "drop") return run({ type: "drop", player: ME, spot: match.sheet === "ability" ? match.sheetSpot : ACTIVE });
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
    if (act.startsWith("option-")) return run({ type: "option", player: ME, index: Number(act.slice(7)) });
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
      paintLobby(true);
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
      const quick = t.closest("[data-quick-find], [data-quick-cancel]");
      if (quick && !quick.disabled) return quick.dataset.quickCancel != null ? cancelQueue() : findMatch();
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
    if (play) {
      pickDeck(play.dataset.play);
      return startMatch(play.dataset.play);
    }
    const edit = t.closest("[data-edit]");
    if (edit) {
      pickDeck(edit.dataset.edit);
      return deps.navigate(`/play/deck/${edit.dataset.edit}`);
    }
    const pick = t.closest("[data-pick]");
    if (pick) {
      pickDeck(pick.dataset.pick);
      paint();
      // The tile lands on its yellow shadow and the hero deals the new deck's fan.
      root.querySelector(`[data-pick="${CSS.escape(pick.dataset.pick)}"]`)?.classList.add("is-pick");
      root.querySelector(".tg-hero")?.classList.add("is-new");
      return;
    }
    if (t.closest("[data-new]")) {
      draft.open = true;
      return paint();
    }
    if (t.closest("[data-cancel]")) {
      draft.open = false;
      return paint();
    }
    const pickLevel = t.closest("[data-level]");
    if (pickLevel && LEVELS.some((l) => l.id === pickLevel.dataset.level)) {
      level = pickLevel.dataset.level;
      write("level", level);
      return paint();
    }
    const format = t.closest("[data-format]");
    if (format && DECK_FORMATS.includes(format.dataset.format)) {
      // In the editor it switches the open deck (how an old Half deck becomes a 60-card one); on the hub, the new deck's.
      const open = route.name === "deck" ? deckById(route.id) : null;
      if (open) {
        open.format = format.dataset.format;
        saveDecks();
      } else draft.format = format.dataset.format;
      return paint();
    }
    if (t.closest("[data-build]")) {
      const built = buildDeck(ownedPool(), draft.format);
      if (!built) return toast(`You need at least one Basic Pokémon that can be played in ${FORMATS[draft.format].name}.`);
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
    if (route.name === "online" && match?.online && e.target.id === "tg-rematch-deck") {
      match.rematchDeck = e.target.value;
      return;
    }
    if (route.name === "friends" && e.target.id === "tg-pvp-deck") {
      lobby.deckId = e.target.value;
      paintLobby();
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

  /** Moving off a page: a finished table closes its rematch offer, the online page gives up its place in the queue. */
  function leaving(from, to) {
    if (from.name === "online" && !(to?.name === "online" && to.id === from.id) && match?.online?.id === from.id) leaveRematch(match);
    if (from.name === "friends" && to?.name !== "friends") dropQueue();
  }

  async function show(path) {
    const from = route;
    shown = true;
    route = parse(path || "/play");
    leaving(from, route);
    if (!defs) root.innerHTML = `<div class="tg-page"><div class="rt-skel tg-loading">Loading</div></div>`;
    try {
      await load();
    } catch {
      root.innerHTML = `<div class="tg-page"><p class="rt-empty tg-none">Couldn't load the game. Check your connection and try again.</p></div>`;
      return;
    }
    await takeThemeDecks().catch(() => null);
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
    if (route.name === "hub") await ensureCards([...decks.flatMap((deck) => Object.keys(deck.cards)), ...resumeIds(read("match", null))]);
    paint();
    if (route.name === "match" && match && !match.busy) botTurn();
    if (route.name === "online" && match?.online) {
      tickClock();
      pollSoon(300);
      if (match.over) {
        // Back at a finished table: read where the rematch stands.
        match.rematchGone = false;
        loadRematch();
      }
    }
  }

  function hide() {
    if (shown) leaving(route, null);
    shown = false;
    clearTimeout(rematchTimer);
    clearTimeout(queueTimer);
    clearInterval(queueTick);
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
