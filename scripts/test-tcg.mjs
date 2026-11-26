#!/usr/bin/env node
/**
 * The card game's rules, checked without a browser.
 *
 *   node scripts/test-tcg.mjs              rule cases, then bot against bot over many seeds
 *   node scripts/test-tcg.mjs --coverage   how much of the site's card pool is playable, and
 *                                          the commonest attack wordings the engine can't read yet
 */
import { readFileSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";
import { ACTIVE, FORMATS, RuleError, apply, createGame, damageAfterTyping, legalActions, unpaid, viewFor } from "../js/tcg/engine.js";
import { createDefs, defineCard, FREE_ENERGY } from "../js/tcg/cards.js";
import { compileAttack } from "../js/tcg/effects.js";
import { botAction } from "../js/tcg/bot.js";
import { buildBotDeck, buildDeck, checkDeck, deckList, roomFor } from "../js/tcg/decks.js";

const rules = JSON.parse(readFileSync("data/tcg/rules.json", "utf8"));
const sets = {};
const byId = new Map();
for (const file of readdirSync("data").filter((f) => f.endsWith(".json"))) {
  let list;
  try {
    list = JSON.parse(readFileSync(`data/${file}`, "utf8"));
  } catch {
    continue;
  }
  if (!Array.isArray(list) || !list[0]?.supertype) continue;
  sets[file.slice(0, -5)] = list;
  for (const card of list) byId.set(card.id, card);
}
for (const e of FREE_ENERGY) byId.set(e.id, { id: e.id, name: `${e.type} Energy`, supertype: "Energy", subtypes: ["Basic"], energy: true });
const defs = createDefs((id) => byId.get(id), rules);

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (err) {
    console.error(`FAIL ${name}\n  ${err.stack.split("\n").slice(0, 4).join("\n  ")}`);
    process.exitCode = 1;
  }
}

if (process.argv.includes("--coverage")) {
  let mons = 0, playable = 0, attacks = 0, read = 0, noText = 0;
  const unread = new Map();
  for (const card of byId.values()) {
    const def = defs(card.id);
    if (def.kind !== "pokemon") continue;
    mons += 1;
    if (def.playable) playable += 1;
    for (const a of def.attacks) {
      attacks += 1;
      if (!a.text) noText += 1;
      else if (!a.plain) read += 1;
      else {
        const shape = a.text.replace(/\d+/g, "N").replace(new RegExp(card.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "<name>");
        unread.set(shape, (unread.get(shape) || 0) + 1);
      }
    }
  }
  console.log(`${playable} of ${mons} Pokémon playable`);
  console.log(`${attacks} attacks: ${noText} plain damage, ${read} with text the engine reads, ${attacks - noText - read} with text it doesn't yet`);
  console.log("Commonest unread wordings:");
  for (const [shape, n] of [...unread].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`  ${String(n).padStart(4)}  ${shape}`);
  process.exit(0);
}

/* ---------- small fixed decks for the rule cases ---------- */

const G = "energy-grass", F = "energy-fire", W = "energy-water";
const deckOf = (...pairs) => pairs.flatMap(([id, n]) => Array(n).fill(id));
// base1: Charmander 46, Charmeleon 24, Charizard 4, Squirtle 63, Bulbasaur 44, Ivysaur 30
const fire = deckOf(["base1-46", 12], ["base1-24", 6], ["base1-4", 2], [F, 10]);
const water = deckOf(["base1-63", 14], ["base1-44", 4], [W, 8], [G, 4]);

/** A half-deck match with both sides placed, hands rigged so a case can script it. */
function started(seed = 7, a = fire, b = water) {
  const state = createGame({ decks: [a, b], format: "half", seed }, defs);
  for (const p of [0, 1]) {
    const basic = legalActions(state, p, defs)[0];
    apply(state, basic, defs);
  }
  return state;
}
/** Put a card of this id into a player's hand from wherever it is in their deck. */
function give(state, p, id) {
  const side = state.players[p];
  const at = side.deck.findIndex((uid) => state.cards[uid] === id);
  assert.ok(at >= 0, `no ${id} left in deck`);
  const [uid] = side.deck.splice(at, 1);
  side.hand.push(uid);
  return uid;
}
const act = (state, action) => apply(state, action, defs);
const throws = (fn, re) => assert.throws(fn, (err) => err instanceof RuleError && re.test(err.message));

test("card definitions", () => {
  const zard = defs("base1-4");
  assert.equal(zard.stage, "evolution");
  assert.equal(zard.evolvesFrom, "Charmeleon");
  assert.deepEqual(zard.weakness, { type: "Water", op: "x", n: 2 });
  assert.deepEqual(zard.resistance, { type: "Fighting", op: "-", n: 30 });
  assert.equal(zard.retreat, 3);
  assert.equal(defs("me1-3").prizes, 3);
  assert.equal(defs("me1-1").prizes, 1);
  assert.equal(defs(F).kind, "energy");
  assert.deepEqual(defs(F).provides, ["Fire"]);
  assert.equal(defs("me1-113").playable, false);
});

test("energy costs", () => {
  assert.equal(unpaid(["Fire", "Colorless"], ["Fire", "Water"]), 0);
  assert.equal(unpaid(["Fire", "Colorless"], ["Water", "Water"]), 1);
  assert.equal(unpaid(["Fire", "Fire", "Colorless"], ["Fire"]), 2);
  assert.equal(unpaid([], []), 0);
});

test("weakness and resistance", () => {
  const squirtle = defs("base1-63"), charmander = defs("base1-46"), zard = defs("base1-4");
  assert.equal(damageAfterTyping(20, squirtle, charmander).amount, 40);
  assert.equal(damageAfterTyping(20, charmander, squirtle).amount, 20);
  assert.equal(damageAfterTyping(20, { types: ["Fighting"] }, zard).amount, 0);
  assert.equal(damageAfterTyping(0, squirtle, charmander).amount, 0);
});

test("attack text", () => {
  assert.deepEqual(compileAttack(""), []);
  assert.equal(compileAttack("Search your deck for a card."), null);
  assert.equal(compileAttack("Flip a coin. If tails, this attack does nothing.")[0].op, "flipOrNothing");
  assert.deepEqual(compileAttack("Flip 3 coins. This attack does 20 damage for each heads.")[0], { op: "flipTimes", when: "before", coins: 3, n: 20 });
  assert.deepEqual(compileAttack("Discard 2 Energy cards attached to Charizard in order to use this attack.")[0], { op: "discardEnergy", when: "after", n: 2, type: "" });
  assert.equal(compileAttack("Discard a Fire Energy from this Pokémon.")[0].type, "Fire");
  assert.equal(compileAttack("Heal 30 damage from this Pokémon.")[0].n, 30);
  assert.equal(compileAttack("Flip a coin. If heads, this attack does 10 damage plus 20 more damage.")[0].n, 20);
  assert.deepEqual(compileAttack("Draw 2 cards.")[0], { op: "draw", when: "after", n: 2 });
  assert.equal(compileAttack("This Pokémon also does 30 damage to itself.")[0].op, "selfDamage");
  assert.equal(compileAttack("Electabuzz does 10 damage to itself.")[0].n, 10);
  assert.equal(compileAttack("Flip a coin. If tails, Electabuzz does 10 damage to itself.")?.[0].op === "selfDamage", false);
});

test("setup: seven cards, prizes, a draw for the first player", () => {
  const state = started();
  assert.equal(state.phase, "main");
  assert.equal(state.turn, 1);
  assert.equal(state.current, state.first);
  for (const p of [0, 1]) {
    const side = state.players[p];
    assert.equal(side.prizes.length, 3);
    const extra = state.players[1 - p].mulligans + (p === state.first ? 1 : 0);
    assert.equal(side.hand.length, 6 + extra);
    assert.equal(side.hand.length + side.deck.length + side.prizes.length + 1, 30);
  }
});

test("same seed, same game", () => {
  const a = started(42), b = started(42);
  assert.deepEqual(a, b);
  assert.notDeepEqual(started(43).players[0].hand, a.players[0].hand);
});

test("one energy a turn, no attack on turn 1, turn order", () => {
  const state = started();
  const p = state.current;
  const e1 = give(state, p, p ? W : F), e2 = give(state, p, p ? W : F);
  act(state, { type: "attach", player: p, uid: e1, spot: ACTIVE });
  throws(() => act(state, { type: "attach", player: p, uid: e2, spot: ACTIVE }), /already attached/);
  throws(() => act(state, { type: "attack", player: p, index: 0 }), /first turn/);
  throws(() => act(state, { type: "end", player: 1 - p }), /isn't your turn/);
  act(state, { type: "end", player: p });
  assert.equal(state.current, 1 - p);
  assert.equal(state.turn, 2);
});

test("evolution waits a turn and never happens on a first turn", () => {
  const state = started();
  const p = state.current;
  const mid = p ? "base1-44" : "base1-24";
  if (p === 1) return; // the water deck's lead isn't Bulbasaur; the fire side covers the rule
  const uid = give(state, p, mid);
  throws(() => act(state, { type: "evolve", player: p, uid, spot: ACTIVE }), /first turn/);
  act(state, { type: "end", player: p });
  act(state, { type: "end", player: 1 - p });
  assert.equal(state.turn, 3);
  act(state, { type: "evolve", player: p, uid, spot: ACTIVE });
  const slot = state.players[p].active;
  assert.equal(state.cards[slot.uid], mid);
  assert.equal(slot.under.length, 1);
  const top = give(state, p, "base1-4");
  throws(() => act(state, { type: "evolve", player: p, uid: top, spot: ACTIVE }), /turn it comes into play/);
});

test("attack, weakness, knock out, prize, promote, win by prizes", () => {
  // Squirtle (Bubble needs W, 10; Withdraw) against Charmander (weak to Water, 50 HP).
  const state = started(3, water, fire);
  // Rig: player 0 is water. Make sure it's their turn 3 with energy on.
  while (!(state.current === 0 && state.turn >= 3)) {
    if (state.current === 0 && !state.players[0].energyUsed) act(state, { type: "attach", player: 0, uid: give(state, 0, W), spot: ACTIVE });
    act(state, { type: "end", player: state.current });
  }
  const me = state.players[0], foe = state.players[1];
  assert.equal(state.cards[me.active.uid], "base1-63");
  foe.active.damage = 30; // 50 HP Charmander: 10 doubled finishes it
  me.prizes.length = 1; // one prize left
  const events = act(state, { type: "attack", player: 0, index: 0 });
  assert.ok(events.some((e) => e.t === "damage" && e.weak && e.n === 20));
  assert.ok(events.some((e) => e.t === "ko" && e.p === 1));
  assert.equal(state.phase, "over");
  assert.equal(state.winner, 0);
  assert.equal(state.reason, "prizes");
});

test("a knock out with a bench waits for a new Active, then the turn passes", () => {
  const state = started(3, water, fire);
  while (!(state.current === 0 && state.turn >= 3)) {
    const p = state.current;
    if (p === 0 && !state.players[0].energyUsed) act(state, { type: "attach", player: 0, uid: give(state, 0, W), spot: ACTIVE });
    if (p === 1 && !state.players[1].bench.length) act(state, { type: "bench", player: 1, uid: give(state, 1, "base1-46") });
    act(state, { type: "end", player: p });
  }
  state.players[1].active.damage = 30;
  const handBefore = state.players[0].hand.length;
  act(state, { type: "attack", player: 0, index: 0 });
  assert.equal(state.phase, "main");
  assert.deepEqual(state.pending, [{ type: "promote", player: 1 }]);
  assert.equal(state.players[0].hand.length, handBefore + 1);
  assert.equal(state.players[0].prizes.length, 2);
  throws(() => act(state, { type: "end", player: 0 }), /Waiting/);
  assert.deepEqual(legalActions(state, 0, defs), []);
  act(state, { type: "promote", player: 1, spot: 0 });
  assert.equal(state.current, 1);
  assert.ok(state.players[1].active);
  assert.ok(state.players[1].discard.length >= 1);
});

test("no bench left loses the match", () => {
  const state = started(3, water, fire);
  while (!(state.current === 0 && state.turn >= 3)) {
    if (state.current === 0 && !state.players[0].energyUsed) act(state, { type: "attach", player: 0, uid: give(state, 0, W), spot: ACTIVE });
    act(state, { type: "end", player: state.current });
  }
  state.players[1].bench = [];
  state.players[1].active.damage = 40;
  act(state, { type: "attack", player: 0, index: 0 });
  assert.equal(state.winner, 0);
  assert.equal(state.reason, "bench");
});

test("retreat pays its cost once a turn", () => {
  const state = started(5, fire, water);
  while (!(state.current === 0 && state.turn >= 3)) act(state, { type: "end", player: state.current });
  const me = state.players[0];
  if (!me.bench.length) act(state, { type: "bench", player: 0, uid: give(state, 0, "base1-46") });
  throws(() => act(state, { type: "retreat", player: 0, to: 0 }), /Not enough Energy/);
  act(state, { type: "attach", player: 0, uid: give(state, 0, F), spot: ACTIVE });
  const front = me.active.uid;
  act(state, { type: "retreat", player: 0, to: 0 });
  assert.notEqual(me.active.uid, front);
  assert.equal(me.bench[0].uid, front);
  assert.equal(me.bench[0].energy.length, 0);
  assert.equal(me.discard.length, 1);
  throws(() => act(state, { type: "retreat", player: 0, to: 0 }), /already retreated/);
});

test("an empty deck at the start of a turn loses", () => {
  const state = started();
  const p = state.current;
  state.players[1 - p].deck.length = 0;
  act(state, { type: "end", player: p });
  assert.equal(state.winner, p);
  assert.equal(state.reason, "deck");
});

test("the other player's hidden cards stay hidden", () => {
  const state = started();
  const view = viewFor(state, 0);
  assert.equal(typeof view.players[1].hand, "number");
  assert.equal(typeof view.players[0].deck, "number");
  assert.equal(typeof view.players[0].prizes, "number");
  assert.ok(Array.isArray(view.players[0].hand));
  for (const uid of state.players[1].hand) assert.equal(view.cards[uid], undefined);
  for (const uid of state.players[0].deck) assert.equal(view.cards[uid], undefined);
  assert.equal(view.rng, undefined);
});

test("deck rules: size, copies, ownership, playable", () => {
  const owned = { "base1-46": 3, "base1-24": 1, "me1-113": 2 };
  const check = (cards, own = owned, format = "half") => checkDeck({ format, cards }, own, defs);
  assert.deepEqual(check({ "base1-46": 2, [F]: 28 }).problems, []);
  assert.match(check({ "base1-46": 2, [F]: 27 }).problems[0], /1 more card to go/);
  assert.match(check({ "base1-46": 3, [F]: 27 }).problems.join(" "), /3 copies of Charmander, the limit is 2/);
  assert.match(check({ "base1-46": 2, [F]: 28 }, {}).problems.join(" "), /You own 0 of Charmander/);
  assert.match(check({ "base1-46": 2, [F]: 28 }, { "base1-46": 1 }).problems.join(" "), /You own 1/);
  assert.match(check({ "me1-113": 1, "base1-46": 2, [F]: 27 }).problems.join(" "), /can't be played yet/);
  assert.match(check({ [F]: 30 }).problems.join(" "), /Basic Pokémon/);
  assert.deepEqual(check({ "base1-46": 3, [F]: 57 }, owned, "standard").problems, []);
  assert.equal(roomFor({ format: "half", cards: { "base1-46": 2 } }, "base1-46", owned, defs), 0);
  assert.equal(roomFor({ format: "half", cards: { "base1-46": 1 } }, "base1-46", owned, defs), 1);
  assert.equal(roomFor({ format: "standard", cards: { "base1-46": 1 } }, "base1-46", owned, defs), 2); // owns three
  assert.equal(roomFor({ format: "half", cards: {} }, "me1-113", owned, defs), 0);
  assert.equal(roomFor({ format: "half", cards: { "base1-46": 2 } }, F, owned, defs), 28);
});

test("an attack that knocks out both Active Pokémon is judged at once", () => {
  // Rig a self-damage attack by hand: both sides on their last prize, both about to fall.
  const state = started(3, water, fire);
  while (!(state.current === 0 && state.turn >= 3)) {
    if (state.current === 0 && !state.players[0].energyUsed) act(state, { type: "attach", player: 0, uid: give(state, 0, W), spot: ACTIVE });
    act(state, { type: "end", player: state.current });
  }
  const real = defs("base1-63");
  const rigged = { ...real, attacks: [{ ...real.attacks[0], fx: [{ op: "selfDamage", when: "after", n: 200 }] }] };
  const rig = (id) => (id === "base1-63" ? rigged : defs(id));
  state.players[1].active.damage = 30;
  state.players[0].prizes.length = 1;
  state.players[1].prizes.length = 1;
  state.players[0].bench = [];
  state.players[1].bench = [];
  apply(state, { type: "attack", player: 0, index: 0 }, rig);
  assert.equal(state.phase, "over");
  assert.equal(state.winner, null);
  assert.equal(state.reason, "tie");
});

/* ---------- bot against bot ---------- */

function mulberry(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function playOut(decks, format, seed) {
  const state = createGame({ decks, format, seed }, defs);
  let steps = 0;
  while (state.phase !== "over") {
    steps += 1;
    assert.ok(steps < 4000, "match did not end");
    const waiting = state.pending[0];
    const p = state.phase === "setup" ? (state.players[0].placed ? 1 : 0) : waiting ? waiting.player : state.current;
    const action = botAction(state, p, defs);
    assert.ok(action, "the bot had no move");
    apply(state, action, defs);
    // Nothing is ever lost or copied: every card is in exactly one place.
    if (steps % 25 === 0) {
      const seen = [];
      for (const side of state.players) {
        seen.push(...side.deck, ...side.hand, ...side.discard, ...side.prizes);
        for (const slot of [side.active, ...side.bench]) if (slot) seen.push(slot.uid, ...slot.under, ...slot.energy);
      }
      assert.equal(seen.length, Object.keys(state.cards).length);
      assert.equal(new Set(seen).size, seen.length);
    }
  }
  return state;
}

test("bot against bot: every set's deck finishes its matches", () => {
  const rand = mulberry(11);
  const built = [];
  for (const [setId, list] of Object.entries(sets)) {
    for (const format of ["half", "standard"]) {
      const deck = buildBotDeck(list.map((c) => defs(c.id)), format, rand);
      if (!deck) continue;
      const size = Object.values(deck.cards).reduce((a, b) => a + b, 0);
      assert.equal(size, FORMATS[format].deckSize, `${setId} ${format} deck has ${size} cards`);
      built.push({ setId, format, list: deckList({ cards: deck.cards }) });
    }
  }
  assert.ok(built.length > 200, `only ${built.length} bot decks built`);
  const reasons = {};
  let turns = 0, games = 0;
  for (let i = 0; i < built.length; i += 1) {
    const a = built[i];
    const b = built.filter((d) => d.format === a.format)[Math.floor(rand() * built.filter((d) => d.format === a.format).length)];
    const end = playOut([a.list, b.list], a.format, 1000 + i);
    reasons[end.reason] = (reasons[end.reason] || 0) + 1;
    turns += end.turn;
    games += 1;
  }
  console.log(`  ${games} bot matches, ${Math.round(turns / games)} turns on average, ended by`, reasons);
  assert.ok((reasons.prizes || 0) > games * 0.5, "most matches should end on prizes");
});

test("a deck built from a small collection is legal", () => {
  const owned = { "base1-46": 3, "base1-24": 2, "base1-4": 1, "base1-63": 2, "base1-44": 1, "base1-30": 1, "base1-58": 2 };
  const pool = Object.entries(owned).map(([id, n]) => ({ def: defs(id), owned: n }));
  for (const format of ["half", "standard"]) {
    const built = buildDeck(pool, format);
    const check = checkDeck({ format, cards: built.cards }, owned, defs);
    assert.deepEqual(check.problems, []);
  }
  assert.equal(buildDeck([], "half"), null);
});

console.log(`${passed} checks passed${process.exitCode ? ", some failed" : ""}`);
