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
import { ACTIVE, FORMATS, RuleError, addCondition, apply, canRetreat, conditionsOn, createGame, damageAfterTyping, legalActions, unpaid, usableAttacks, viewFor } from "../js/tcg/engine.js";
import { createDefs, defineCard, FREE_ENERGY } from "../js/tcg/cards.js";
import { compileAttack } from "../js/tcg/effects.js";
import { botAction } from "../js/tcg/bot.js";
import { LESSON, LESSON_CARDS, createLesson } from "../js/tcg/tutorial.js";
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

/** A water-against-fire match on player 0's turn 3 or later, Energy on their Squirtle. */
function midgame(seed = 3) {
  const state = started(seed, water, fire);
  while (!(state.current === 0 && state.turn >= 3)) {
    const p = state.current;
    if (p === 0 && !state.players[0].energyUsed) act(state, { type: "attach", player: 0, uid: give(state, 0, W), spot: ACTIVE });
    if (p === 1 && !state.players[1].bench.length) act(state, { type: "bench", player: 1, uid: give(state, 1, "base1-46") });
    act(state, { type: "end", player: p });
  }
  if (!state.players[0].bench.length) act(state, { type: "bench", player: 0, uid: give(state, 0, "base1-63") });
  return state;
}
/** Force the next coin flips: the seed is searched until the engine's own flips come out as asked. */
function rigFlips(state, wanted) {
  for (let seed = 1; seed < 5000; seed += 1) {
    const probe = { rng: seed };
    const got = wanted.map(() => {
      probe.rng = (probe.rng + 0x6d2b79f5) | 0;
      let t = probe.rng;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296 < 0.5;
    });
    if (got.every((g, i) => g === wanted[i])) {
      state.rng = seed;
      return;
    }
  }
  throw new Error("no seed found");
}

test("condition wordings", () => {
  assert.deepEqual(compileAttack("Your opponent's Active Pokémon is now Poisoned."), [{ op: "condition", when: "after", kind: "poisoned" }]);
  assert.deepEqual(compileAttack("The Defending Pokémon is now Asleep."), [{ op: "condition", when: "after", kind: "asleep" }]);
  assert.deepEqual(compileAttack("Flip a coin. If heads, the Defending Pokémon is now Paralyzed."), [{ op: "flip", when: "after", heads: [{ op: "condition", when: "after", kind: "paralyzed" }] }]);
  assert.equal(compileAttack("Your opponent's Active Pokémon is now Burned and Poisoned.").length, 2);
  assert.deepEqual(compileAttack("This Pokémon is now Asleep."), [{ op: "condition", when: "after", kind: "asleep", self: true }]);
  // Two sentences, both read; one unread sentence spoils the lot.
  assert.deepEqual(compileAttack("Your opponent's Active Pokémon is now Confused. This Pokémon also does 20 damage to itself.").map((s) => s.op), ["condition", "selfDamage"]);
  assert.equal(compileAttack("Your opponent's Active Pokémon is now Confused. Search your deck for a card."), null);
  assert.equal(compileAttack("This attack's damage isn't affected by Resistance.")[0].noResistance, true);
});

test("poison and burn tick between turns, burn can be shaken off", () => {
  const state = midgame();
  const foe = state.players[1].active;
  addCondition(state, foe, "poisoned");
  addCondition(state, foe, "burned");
  assert.deepEqual(conditionsOn(foe), ["poisoned", "burned"]);
  rigFlips(state, [false]); // burn stays
  let events = act(state, { type: "end", player: 0 });
  assert.equal(foe.damage, 30);
  assert.deepEqual(events.filter((e) => e.t === "damage").map((e) => e.why), ["poisoned", "burned"]);
  assert.equal(state.current, 1);
});

test("burn is shaken off on heads", () => {
  const state = midgame();
  const foe = state.players[1].active;
  addCondition(state, foe, "burned");
  rigFlips(state, [true]);
  const events = act(state, { type: "end", player: 0 });
  assert.equal(foe.damage, 20);
  assert.ok(events.some((e) => e.t === "cure" && e.kind === "burned"));
  assert.deepEqual(conditionsOn(foe), []);
});

test("a checkup knock out gives a prize and waits for a new Active", () => {
  const state = midgame();
  const foe = state.players[1].active;
  foe.damage = 40; // 50 HP Charmander, poison finishes it
  addCondition(state, foe, "poisoned");
  const prizes = state.players[0].prizes.length;
  const turn = state.turn;
  act(state, { type: "end", player: 0 });
  assert.equal(state.players[0].prizes.length, prizes - 1);
  assert.deepEqual(state.pending, [{ type: "promote", player: 1 }]);
  act(state, { type: "promote", player: 1, spot: 0 });
  assert.equal(state.current, 1);
  assert.equal(state.turn, turn + 1);
});

test("asleep: no attack, no retreat, a flip to wake", () => {
  const state = midgame();
  const mine = state.players[0].active;
  addCondition(state, mine, "asleep");
  assert.deepEqual(usableAttacks(state, 0, defs), []);
  assert.equal(canRetreat(state, 0, defs), false);
  throws(() => act(state, { type: "attack", player: 0, index: 0 }), /Asleep/);
  rigFlips(state, [false]);
  act(state, { type: "end", player: 0 });
  assert.deepEqual(conditionsOn(mine), ["asleep"]);
  rigFlips(state, [true]);
  const events = act(state, { type: "end", player: 1 });
  assert.ok(events.some((e) => e.t === "cure" && e.kind === "asleep"));
  assert.deepEqual(conditionsOn(mine), []);
});

test("paralyzed lasts through its owner's next turn only", () => {
  const state = midgame();
  const foe = state.players[1].active;
  addCondition(state, foe, "paralyzed"); // during player 0's turn
  act(state, { type: "end", player: 0 });
  assert.deepEqual(conditionsOn(foe), ["paralyzed"]);
  assert.deepEqual(usableAttacks(state, 1, defs), []);
  act(state, { type: "end", player: 1 });
  assert.deepEqual(conditionsOn(foe), []);
});

test("confused: tails fails the attack and hurts the attacker", () => {
  const state = midgame();
  const mine = state.players[0].active;
  addCondition(state, mine, "confused");
  rigFlips(state, [false]);
  const events = act(state, { type: "attack", player: 0, index: 0 });
  assert.equal(mine.damage, 30);
  assert.equal(state.players[1].active.damage, 0);
  assert.ok(events.some((e) => e.t === "damage" && e.why === "confused"));
  assert.equal(state.current, 1);
});

test("retreating and evolving clear conditions; the newer of sleep, confusion and paralysis wins", () => {
  const state = midgame();
  const mine = state.players[0].active;
  addCondition(state, mine, "confused");
  addCondition(state, mine, "poisoned");
  addCondition(state, mine, "asleep");
  assert.deepEqual(conditionsOn(mine), ["asleep", "poisoned"]);
  mine.status.main = "confused";
  act(state, { type: "retreat", player: 0, to: 0 });
  assert.deepEqual(conditionsOn(state.players[0].bench[0]), []);
});

test("the lesson plays through as the coach tells it", () => {
  for (const id of LESSON_CARDS) assert.ok(defs(id)?.playable !== false && defs(id), id);
  const state = createLesson(["You", "Bot"], defs);
  act(state, botAction(state, 1, defs));
  const me = state.players[0];
  const botPlays = () => {
    for (let n = 0; n < 40 && state.phase === "main"; n++) {
      const waiting = state.pending[0];
      if (!(waiting ? waiting.player === 1 : state.current === 1)) return;
      act(state, botAction(state, 1, defs));
    }
  };
  const setup = { active: null, bench: [] };
  for (const step of LESSON) {
    if (step.pick) {
      const uid = me.hand.find((u) => step.pick(defs(state.cards[u])) && u !== setup.active);
      assert.ok(uid, step.say);
      if (!setup.active) setup.active = uid;
      else setup.bench.push(uid);
    } else if (step.want) {
      const action = state.phase === "setup" ? { type: "place", player: 0, ...setup } : legalActions(state, 0, defs).find(step.want);
      assert.ok(action && step.want(action), step.say);
      act(state, action);
      botPlays();
    }
    if (/bit Hitmonchan for 20/.test(step.say)) {
      assert.equal(me.active.damage, 20);
      assert.ok(me.hand.some((u) => defs(state.cards[u]).name === "Machoke"));
    }
    if (/took a prize card/.test(step.say)) {
      assert.equal(me.prizes.length, 2);
      assert.equal(state.phase, "main");
      assert.equal(state.current, 0);
    }
  }
});

/* ---------- effects that last a turn ---------- */

// A stand-in with one attack per effect under test, swapped onto an Active Pokémon.
const lab = (id, attacks) => byId.set(id, { id, name: "Lab", supertype: "Pokémon", subtypes: ["Basic"], types: ["Colorless"], hp: "200", attacks: attacks.map(([name, damage, text]) => ({ name, cost: [], damage: String(damage), text })) });
lab("lab-1", [
  ["Tire", 10, "During your next turn, this Pokémon can't attack."],
  ["Brace", 10, "During your opponent's next turn, this Pokémon takes 30 less damage from attacks (after applying Weakness and Resistance)."],
  ["Pin", 10, "The Defending Pokémon can't retreat during your opponent's next turn."],
  ["Once", 10, "During your next turn, this Pokémon can't use Once."],
]);
lab("lab-2", [
  ["Smoke", 10, "If the Defending Pokémon tries to attack during your opponent's next turn, your opponent flips a coin. If tails, that attack does nothing."],
  ["Hide", 0, "Flip a coin. If heads, during your opponent's next turn, prevent all damage from and effects of attacks done to this Pokémon."],
  ["Pierce", 50, "This attack's damage isn't affected by any effects on your opponent's Active Pokémon."],
  ["Sting", 50, "Your opponent's Active Pokémon is now Poisoned."],
]);
lab("lab-3", [
  ["Rage", 10, "This attack does 10 more damage for each damage counter on this Pokémon."],
  ["Chain", 0, "Flip a coin until you get tails. This attack does 30 damage for each heads."],
  ["Follow", 20, "If your opponent's Active Pokémon already has any damage counters on it, this attack does 40 more damage."],
  ["Drain", 10, "Discard an Energy from your opponent's Active Pokémon."],
]);
function labgame(mine = "lab-1", theirs = "lab-2") {
  const state = midgame();
  state.cards[state.players[0].active.uid] = mine;
  state.cards[state.players[1].active.uid] = theirs;
  state.players[0].active.damage = 0;
  state.players[1].active.damage = 0;
  return state;
}
const attackIndex = (state, p, name) => defs(state.cards[state.players[p].active.uid]).attacks.findIndex((a) => a.name === name);
const use = (state, p, name) => act(state, { type: "attack", player: p, index: attackIndex(state, p, name) });

test("the lab cards' text is all read", () => {
  for (const id of ["lab-1", "lab-2", "lab-3"]) for (const a of defs(id).attacks) assert.ok(!a.plain, a.name);
  assert.ok(!defs("base1-63").attacks[1].plain, "Withdraw");
});

test("can't attack next turn: holds for that turn only, and leaves with the Pokémon", () => {
  const state = labgame();
  use(state, 0, "Tire");
  act(state, { type: "end", player: 1 });
  assert.deepEqual(usableAttacks(state, 0, defs), []);
  throws(() => use(state, 0, "Tire"), /can't attack/);
  act(state, { type: "end", player: 0 });
  act(state, { type: "end", player: 1 });
  assert.ok(usableAttacks(state, 0, defs).length > 0);
  // Retreating wipes it.
  use(state, 0, "Tire");
  act(state, { type: "end", player: 1 });
  state.players[0].active.energy.push(give(state, 0, W), give(state, 0, W), give(state, 0, W));
  state.players[0].hand = state.players[0].hand.filter((u) => !state.players[0].active.energy.includes(u));
  act(state, { type: "retreat", player: 0, to: 0 });
  assert.equal(state.players[0].bench[0].marks, undefined);
});

test("can't use one attack next turn; the others still work", () => {
  const state = labgame();
  use(state, 0, "Once");
  act(state, { type: "end", player: 1 });
  const usable = usableAttacks(state, 0, defs);
  assert.ok(!usable.includes(attackIndex(state, 0, "Once")) && usable.includes(attackIndex(state, 0, "Tire")));
  throws(() => use(state, 0, "Once"), /can't use Once/);
});

test("less damage during the opponent's next turn, unless the attack ignores effects", () => {
  let state = labgame();
  use(state, 0, "Brace");
  use(state, 1, "Sting");
  assert.equal(state.players[0].active.damage, 20 + 10); // 50 - 30, then poison between turns
  state = labgame();
  use(state, 0, "Brace");
  use(state, 1, "Pierce");
  assert.equal(state.players[0].active.damage, 50);
  // And it is gone a turn later.
  act(state, { type: "end", player: 0 });
  use(state, 1, "Pierce");
  assert.equal(state.players[0].active.damage, 100);
});

test("can't retreat during the opponent's next turn", () => {
  const state = labgame();
  use(state, 0, "Pin");
  assert.equal(canRetreat(state, 1, defs), false);
  throws(() => act(state, { type: "retreat", player: 1, to: 0 }), /can't retreat/);
  act(state, { type: "end", player: 1 });
  act(state, { type: "end", player: 0 });
  assert.equal(canRetreat(state, 1, defs), true);
});

test("a shield stops damage and effects; an attacker told to flip can miss", () => {
  const state = labgame("lab-2", "lab-2");
  rigFlips(state, [true]);
  use(state, 0, "Hide");
  const events = use(state, 1, "Sting");
  assert.equal(state.players[0].active.damage, 0);
  assert.deepEqual(conditionsOn(state.players[0].active), []);
  assert.ok(events.some((e) => e.t === "blocked"));
  use(state, 0, "Smoke");
  rigFlips(state, [false]);
  const missed = use(state, 1, "Pierce");
  assert.ok(missed.some((e) => e.t === "miss"));
  assert.equal(state.players[0].active.damage, 0);
  assert.equal(state.current, 0);
});

test("damage that counts: counters on the attacker, a damaged target, heads in a row, Energy knocked off", () => {
  const state = labgame("lab-3", "lab-3");
  state.players[0].active.damage = 30;
  use(state, 0, "Rage");
  assert.equal(state.players[1].active.damage, 40);
  act(state, { type: "end", player: 1 });
  use(state, 0, "Follow");
  assert.equal(state.players[1].active.damage, 100);
  act(state, { type: "end", player: 1 });
  rigFlips(state, [true, true, false]);
  use(state, 0, "Chain");
  assert.equal(state.players[1].active.damage, 160);
  state.players[1].active.energy.push(give(state, 1, "energy-fire"));
  state.players[1].hand.pop();
  act(state, { type: "end", player: 1 });
  const before = state.players[1].active.energy.length;
  use(state, 0, "Drain");
  assert.equal(state.players[1].active.energy.length, before - 1);
});

lab("lab-4", [
  ["Snipe", 0, "This attack does 30 damage to 1 of your opponent's Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)"],
  ["Splash", 20, "This attack also does 10 damage to each of your opponent's Benched Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)"],
  ["Hop", 10, "Switch this Pokémon with 1 of your Benched Pokémon."],
  ["Gust", 10, "Your opponent switches the Defending Pokémon with 1 of his or her Benched Pokémon."],
  ["Maybe", 10, "You may switch this Pokémon with 1 of your Benched Pokémon."],
]);

test("a chosen target: the turn waits for the pick, then Knock Outs are judged", () => {
  const state = labgame("lab-4", "lab-4");
  for (const a of defs("lab-4").attacks) assert.ok(!a.plain, a.name);
  const bench = state.players[1].bench[0];
  bench.damage = defs(state.cards[bench.uid]).hp - 30;
  use(state, 0, "Snipe");
  assert.equal(state.pending[0].type, "pick");
  assert.equal(state.current, 0);
  assert.deepEqual(legalActions(state, 0, defs).map((a) => a.spot), [ACTIVE, 0]);
  assert.deepEqual(legalActions(state, 1, defs), []);
  throws(() => act(state, { type: "end", player: 0 }), /chosen/);
  const prizes = state.players[0].prizes.length;
  const events = act(state, { type: "pick", player: 0, spot: 0 });
  assert.ok(events.some((e) => e.t === "ko"));
  assert.equal(state.players[0].prizes.length, prizes - 1);
  assert.equal(state.players[1].bench.length, 0);
  assert.equal(state.current, 1);
});

test("damage to every Benched Pokémon needs no choice", () => {
  const state = labgame("lab-4", "lab-4");
  use(state, 0, "Splash");
  assert.equal(state.players[1].active.damage, 20);
  assert.equal(state.players[1].bench[0].damage, 10);
  assert.equal(state.current, 1);
});

test("switching: the attacker's own choice, a may, and the defender pushed out", () => {
  let state = labgame("lab-4", "lab-4");
  const mine = state.players[0].active.uid;
  addCondition(state, state.players[0].active, "poisoned");
  use(state, 0, "Hop");
  act(state, { type: "pick", player: 0, spot: 0 });
  assert.equal(state.players[0].bench[0].uid, mine);
  assert.deepEqual(conditionsOn(state.players[0].bench[0]), []);
  assert.equal(state.current, 1);

  state = labgame("lab-4", "lab-4");
  use(state, 0, "Maybe");
  assert.ok(legalActions(state, 0, defs).some((a) => a.spot === null));
  act(state, { type: "pick", player: 0, spot: null });
  assert.equal(state.players[0].active.uid, mine);
  assert.equal(state.current, 1);

  state = labgame("lab-4", "lab-4");
  const theirs = state.players[1].active.uid;
  use(state, 0, "Gust"); // one Benched Pokémon: no choice for them to make
  assert.equal(state.players[1].bench[0].uid, theirs);
  assert.equal(state.players[1].bench[0].damage, 10);
  // With two on the Bench the defender chooses, and the bot can.
  state = labgame("lab-4", "lab-4");
  act(state, { type: "bench", player: 0, uid: give(state, 0, "base1-63") });
  act(state, { type: "end", player: 0 });
  use(state, 1, "Gust");
  assert.equal(state.pending[0].player, 0);
  act(state, botAction(state, 0, defs));
  assert.equal(state.pending.length, 0);
  assert.equal(state.current, 0);
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
