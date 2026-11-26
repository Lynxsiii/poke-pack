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
import { ACTIVE, FORMATS, RuleError, addCondition, apply, benchSafe, canRetreat, energyOf, toolOf, conditionsOn, createGame, damageAfterTyping, legalActions, maxHp, resolveKnockOuts, retreatCost, unpaid, usableAttacks, viewFor } from "../js/tcg/engine.js";
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
const trainers = JSON.parse(readFileSync("data/tcg/trainers.json", "utf8"));
const defs = createDefs((id) => byId.get(id), rules, trainers);

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
  let trainerCards = 0, trainerRead = 0, abilityCards = 0, abilityRead = 0;
  const unreadAbilities = new Map();
  const unreadTrainers = new Map();
  for (const card of byId.values()) {
    const def = defs(card.id);
    if (def.kind === "trainer") {
      trainerCards += 1;
      if (def.playable) trainerRead += 1;
      else if (def.sub === "item" || def.sub === "supporter") unreadTrainers.set(def.text.replace(/\d+/g, "N"), (unreadTrainers.get(def.text.replace(/\d+/g, "N")) || 0) + 1);
    }
    if (def.kind !== "pokemon") continue;
    mons += 1;
    if (def.playable) playable += 1;
    if ((card.abilities || []).length) {
      abilityCards += 1;
      if (def.ability) abilityRead += 1;
      else {
        const shape = String(card.abilities[0].text || "").replace(/\s+/g, " ").replace(/\d+/g, "N").split(card.name).join("<name>");
        unreadAbilities.set(shape, (unreadAbilities.get(shape) || 0) + 1);
      }
    }
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
  console.log(`${trainerCards} Trainers: ${trainerRead} playable (Items and Supporters whose text is read)`);
  console.log("Commonest unread Item and Supporter texts:");
  for (const [shape, n] of [...unreadTrainers].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  ${String(n).padStart(4)}  ${shape.slice(0, 150)}`);
  const specials = [...byId.values()].filter((c) => c.supertype === "Energy" && !(c.subtypes || []).includes("Basic"));
  const unreadSpecial = new Map();
  for (const c of specials) if (!defs(c.id).playable) unreadSpecial.set(c.name, (unreadSpecial.get(c.name) || 0) + 1);
  console.log(`${specials.length} Special Energy cards: ${specials.length - [...unreadSpecial.values()].reduce((a, b) => a + b, 0)} playable. Not yet: ${[...unreadSpecial].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([n, k]) => `${n} (${k})`).join(", ")}`);
  console.log(`${abilityCards} Pokémon with an Ability: ${abilityRead} live`);
  console.log("Commonest unread Ability texts:");
  for (const [shape, n] of [...unreadAbilities].sort((a, b) => b[1] - a[1]).slice(0, Number(process.env.TOP || 40))) console.log(`  ${String(n).padStart(4)}  ${shape.slice(0, 220)}`);
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

/* ---------- Trainers ---------- */

trainers.cards.lab = {};
function labTrainer(key, sub, text) {
  trainers.cards.lab[key] = trainers.texts.push(text) - 1;
  byId.set(`lab-${key}`, { id: `lab-${key}`, name: `Lab ${key}`, supertype: "Trainer", subtypes: [sub] });
  return `lab-${key}`;
}
const T = {
  draw: labTrainer("draw", "Item", "Draw 3 cards."),
  research: labTrainer("research", "Supporter", "Discard your hand and draw 7 cards."),
  judge: labTrainer("judge", "Supporter", "Each player shuffles their hand into their deck and draws 4 cards."),
  potion: labTrainer("potion", "Item", "Heal 30 damage from 1 of your Pokémon."),
  swap: labTrainer("swap", "Item", "Switch your Active Pokémon with 1 of your Benched Pokémon."),
  boss: labTrainer("boss", "Supporter", "Switch in 1 of your opponent's Benched Pokémon to the Active Spot."),
  heal: labTrainer("fullheal", "Item", "Remove all Special Conditions from your Active Pokémon."),
  odd: labTrainer("odd", "Item", "Search your deck for a card nobody has heard of."),
  arena: labTrainer("arena", "Stadium", "Draw 3 cards."),
};
/** Put a Trainer straight into a player's hand (it need not be in the deck list). */
function hold(state, p, id) {
  const uid = `x${Object.keys(state.cards).length}`;
  state.cards[uid] = id;
  state.players[p].hand.push(uid);
  return uid;
}

test("Trainer text: read, unread, and kinds that aren't in yet", () => {
  assert.ok(defs(T.draw).playable && defs(T.draw).sub === "item");
  assert.equal(defs(T.research).sub, "supporter");
  assert.ok(!defs(T.odd).playable && /isn't live/.test(defs(T.odd).why));
  assert.ok(!defs(T.arena).playable && /Stadium/.test(defs(T.arena).why));
  // Real cards: Potion, Switch, Professor's Research, Boss's Orders by their current prints.
  const named = (name) => [...byId.values()].filter((c) => c.name === name && c.supertype === "Trainer").map((c) => defs(c.id));
  for (const name of ["Potion", "Switch", "Professor's Research", "Boss's Orders", "Judge", "Full Heal"]) assert.ok(named(name).some((d) => d.playable), name);
});

test("an Item draws; any number a turn; nothing to draw, no play", () => {
  const state = midgame();
  const hand = state.players[0].hand.length;
  act(state, { type: "play", player: 0, uid: hold(state, 0, T.draw) });
  act(state, { type: "play", player: 0, uid: hold(state, 0, T.draw) });
  assert.equal(state.players[0].hand.length, hand + 6);
  assert.equal(state.players[0].discard.filter((u) => state.cards[u] === T.draw).length, 2);
  assert.equal(state.current, 0);
  const last = hold(state, 0, T.draw);
  state.players[0].discard.push(...state.players[0].deck.splice(0));
  throws(() => act(state, { type: "play", player: 0, uid: last }), /would do nothing/);
  assert.ok(!legalActions(state, 0, defs).some((a) => a.type === "play"));
});

test("one Supporter a turn, none on the first turn of the match", () => {
  const state = midgame();
  const a = hold(state, 0, T.research);
  const b = hold(state, 0, T.judge);
  act(state, { type: "play", player: 0, uid: a });
  assert.equal(state.players[0].hand.length, 7);
  throws(() => act(state, { type: "play", player: 0, uid: state.players[0].hand.find((u) => state.cards[u] === T.judge) || b }), /already played a Supporter|isn't in your hand/);
  act(state, { type: "end", player: 0 });
  act(state, { type: "end", player: 1 });
  const again = hold(state, 0, T.judge);
  act(state, { type: "play", player: 0, uid: again });
  assert.equal(state.players[0].hand.length, 4);
  assert.equal(state.players[1].hand.length, 4);

  const fresh = started();
  const first = fresh.current;
  throws(() => act(fresh, { type: "play", player: first, uid: hold(fresh, first, T.research) }), /first turn/);
});

test("Potion, Switch and a pull from the Bench go through a choice and don't end the turn", () => {
  const state = midgame();
  const me = state.players[0];
  throws(() => act(state, { type: "play", player: 0, uid: hold(state, 0, T.potion) }), /would do nothing/);
  me.active.damage = 20;
  me.bench[0].damage = 30;
  act(state, { type: "play", player: 0, uid: me.hand.find((u) => state.cards[u] === T.potion) });
  assert.deepEqual(legalActions(state, 0, defs).map((a) => a.spot), [ACTIVE, 0]);
  act(state, { type: "pick", player: 0, spot: ACTIVE });
  assert.equal(me.active.damage, 0);
  assert.equal(state.current, 0);
  assert.equal(state.ending, false);

  const was = me.active.uid;
  act(state, { type: "play", player: 0, uid: hold(state, 0, T.swap) });
  act(state, { type: "pick", player: 0, spot: 0 });
  assert.equal(me.bench[0].uid, was);
  assert.equal(me.retreated, false);

  const theirs = state.players[1];
  const benched = theirs.bench[0].uid;
  act(state, { type: "play", player: 0, uid: hold(state, 0, T.boss) });
  assert.equal(state.pending[0].side, 1);
  act(state, { type: "pick", player: 0, spot: 0 });
  assert.equal(theirs.active.uid, benched);
});

test("Full Heal clears conditions; the bot plays what helps it", () => {
  const state = midgame();
  const me = state.players[0];
  throws(() => act(state, { type: "play", player: 0, uid: hold(state, 0, T.heal) }), /would do nothing/);
  addCondition(state, me.active, "poisoned");
  addCondition(state, me.active, "asleep");
  act(state, { type: "play", player: 0, uid: me.hand.find((u) => state.cards[u] === T.heal) });
  assert.deepEqual(conditionsOn(me.active), []);
  hold(state, 0, T.draw);
  assert.equal(botAction(state, 0, defs).type === "play" || botAction(state, 0, defs).type === "bench", true);
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
        for (const slot of [side.active, ...side.bench]) if (slot) seen.push(slot.uid, ...slot.under, ...slot.energy, ...(slot.tool ? [slot.tool] : []));
      }
      if (state.stadium) seen.push(state.stadium.uid);
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

/* ---------- Trainers that choose cards ---------- */

const S = {
  ball: labTrainer("ball", "Item", "Search your deck for a Basic Pokémon, reveal it, and put it into your hand. Then, shuffle your deck."),
  nest: labTrainer("nest", "Item", "Search your deck for a Basic Pokémon and put it onto your Bench. Then, shuffle your deck."),
  ultra: labTrainer("ultra", "Item", "You can use this card only if you discard 2 other cards from your hand. Search your deck for a Pokémon, reveal it, and put it into your hand. Then, shuffle your deck."),
  retrieve: labTrainer("retrieve", "Item", "Put 2 basic Energy cards from your discard pile into your hand."),
  coin: labTrainer("coin", "Item", "Flip a coin. If heads, search your deck for a Pokémon, reveal it, and put it into your hand. Then, shuffle your deck."),
};

test("a deck search: the player chooses among the cards that fit, or none, and the deck is shuffled", () => {
  const state = started();
  state.current = 0;
  const me = state.players[0];
  const uid = hold(state, 0, S.ball);
  apply(state, { type: "play", player: 0, uid }, defs);
  const waiting = state.pending[0];
  assert.equal(waiting.type, "choose");
  assert.ok(waiting.uids.length > 0 && waiting.uids.every((u) => defs(state.cards[u]).stage === "basic"));
  assert.throws(() => apply(state, { type: "end", player: 0 }, defs), RuleError);
  assert.throws(() => apply(state, { type: "choose", player: 0, uids: waiting.uids.slice(0, 2) }, defs), RuleError);
  const want = waiting.uids[0];
  const hand = me.hand.length;
  const events = apply(state, { type: "choose", player: 0, uids: [want] }, defs);
  assert.ok(me.hand.includes(want) && !me.deck.includes(want));
  assert.equal(me.hand.length, hand + 1);
  assert.ok(events.some((e) => e.t === "search" && e.to === "hand"));
  assert.equal(state.pending.length, 0);
  // Taking nothing is allowed: the deck is hidden, so a search may fail.
  const again = hold(state, 0, S.ball);
  apply(state, { type: "play", player: 0, uid: again }, defs);
  apply(state, { type: "choose", player: 0, uids: [] }, defs);
  assert.equal(state.pending.length, 0);
});

test("a search onto the Bench needs room; a price is paid before the search", () => {
  const state = started();
  state.current = 0;
  const me = state.players[0];
  const nest = hold(state, 0, S.nest);
  const bench = me.bench.length;
  apply(state, { type: "play", player: 0, uid: nest }, defs);
  apply(state, { type: "choose", player: 0, uids: [state.pending[0].uids[0]] }, defs);
  assert.equal(me.bench.length, bench + 1);

  // Ultra Ball: not with fewer than 2 other cards; with them, discard 2 and then search.
  const ultra = hold(state, 0, S.ultra);
  const spare = me.hand.filter((u) => u !== ultra);
  me.deck.push(...me.hand.splice(0));
  me.hand.push(ultra, spare[0]);
  assert.ok(!legalActions(state, 0, defs).some((a) => a.type === "play" && a.uid === ultra));
  me.deck.splice(me.deck.indexOf(spare[1]), 1);
  me.hand.push(spare[1]);
  apply(state, { type: "play", player: 0, uid: ultra }, defs);
  assert.equal(state.pending[0].effect.op, "discard");
  assert.throws(() => apply(state, { type: "choose", player: 0, uids: [spare[0]] }, defs), RuleError);
  apply(state, { type: "choose", player: 0, uids: [spare[0], spare[1]] }, defs);
  assert.equal(me.hand.length, 0);
  assert.equal(state.pending[0].effect.op, "toHand");
  apply(state, { type: "choose", player: 0, uids: [state.pending[0].uids[0]] }, defs);
  assert.equal(me.hand.length, 1);
  assert.equal(state.pending.length, 0);
});

test("Energy comes back from the discard pile; a coin can stand in front of a search", () => {
  const state = started();
  state.current = 0;
  const me = state.players[0];
  const retrieve = hold(state, 0, S.retrieve);
  assert.ok(!legalActions(state, 0, defs).some((a) => a.type === "play" && a.uid === retrieve), "nothing to bring back yet");
  const energy = me.deck.filter((u) => defs(state.cards[u]).kind === "energy").slice(0, 3);
  for (const u of energy) me.deck.splice(me.deck.indexOf(u), 1);
  me.discard.push(...energy);
  apply(state, { type: "play", player: 0, uid: retrieve }, defs);
  assert.equal(state.pending[0].min, 2);
  apply(state, { type: "choose", player: 0, uids: energy.slice(0, 2) }, defs);
  assert.ok(energy.slice(0, 2).every((u) => me.hand.includes(u)));
  assert.deepEqual(defs(S.coin).fx[0].op, "flip");
  assert.ok(defs(S.coin).playable);
});

/* ---------- Pokémon Tools ---------- */

const labTool = (key, text) => {
  const id = labTrainer(key, "Pokémon Tool", text);
  return id;
};
const TOOL = {
  cape: labTool("cape", "The Pokémon this card is attached to gets +50 HP."),
  stone: labTool("stone", "The Pokémon this card is attached to has no Retreat Cost."),
  band: labTool("band", "The attacks of the Pokémon this card is attached to do 30 more damage to your opponent's Active Pokémon (before applying Weakness and Resistance)."),
  vest: labTool("vest", "The Pokémon this card is attached to has no Weakness."),
  odd: labTool("oddtool", "The Pokémon this card is attached to can dance."),
};

test("a Tool is attached, one to a Pokémon, and leaves play with it", () => {
  assert.ok(defs(TOOL.cape).playable && defs(TOOL.cape).tool.hp === 50);
  assert.ok(!defs(TOOL.odd).playable);
  const state = started();
  state.current = 0;
  const me = state.players[0];
  const cape = hold(state, 0, TOOL.cape);
  const stone = hold(state, 0, TOOL.stone);
  assert.ok(legalActions(state, 0, defs).some((a) => a.type === "tool" && a.uid === cape && a.spot === ACTIVE));
  assert.ok(!legalActions(state, 0, defs).some((a) => a.type === "play" && a.uid === cape));
  const hp = maxHp(state, me.active, defs);
  apply(state, { type: "tool", player: 0, uid: cape, spot: ACTIVE }, defs);
  assert.equal(maxHp(state, me.active, defs), hp + 50);
  assert.throws(() => apply(state, { type: "tool", player: 0, uid: stone, spot: ACTIVE }, defs), RuleError);
  // The extra HP keeps it standing; past it, the Tool goes to the discard pile with the Pokémon.
  me.active.damage = hp + 40;
  resolveKnockOuts(state, defs, []);
  assert.ok(me.active);
  me.active.damage = hp + 50;
  me.bench = me.bench.length ? me.bench : [{ uid: me.deck.shift(), under: [], energy: [], damage: 0, since: 0 }];
  resolveKnockOuts(state, defs, []);
  assert.ok(!me.active && me.discard.includes(cape));
});

test("Tools change retreat cost, damage dealt and Weakness", () => {
  const state = started();
  state.current = 0;
  state.turn = 3;
  const [me, foe] = state.players;
  if (!me.bench.length) me.bench.push({ uid: me.deck.shift(), under: [], energy: [], damage: 0, since: 0 });
  assert.ok(retreatCost(state, me.active, defs) > 0);
  assert.ok(!canRetreat(state, 0, defs));
  apply(state, { type: "tool", player: 0, uid: hold(state, 0, TOOL.stone), spot: ACTIVE }, defs);
  assert.equal(retreatCost(state, me.active, defs), 0);
  assert.ok(canRetreat(state, 0, defs));

  // Charmander's Scratch does 10; with the band 40. Squirtle isn't weak to Fire, so no doubling here.
  me.active.tool = hold(state, 0, TOOL.band);
  me.hand.pop();
  me.active.energy = me.deck.filter((u) => defs(state.cards[u]).kind === "energy").slice(0, 2);
  me.deck = me.deck.filter((u) => !me.active.energy.includes(u));
  const hit = apply(state, { type: "attack", player: 0, index: 0 }, defs).find((e) => e.t === "damage" && e.p === 1);
  assert.equal(hit.n, 40);

  // No Weakness: a Fire Pokémon hit by Water takes the printed damage only.
  const typed = (tool) => {
    const s2 = started();
    s2.current = 1;
    s2.turn = 4;
    s2.players[1].active.energy = s2.players[1].deck.filter((u) => defs(s2.cards[u]).kind === "energy").slice(0, 2);
    s2.players[1].deck = s2.players[1].deck.filter((u) => !s2.players[1].active.energy.includes(u));
    if (tool) s2.players[0].active.tool = hold(s2, 0, tool);
    const index = usableAttacks(s2, 1, defs)[0];
    const dmg = defs(s2.cards[s2.players[1].active.uid]).attacks[index].damage;
    const hit2 = apply(s2, { type: "attack", player: 1, index }, defs).find((e) => e.t === "damage" && e.p === 0);
    return [hit2?.n || 0, dmg];
  };
  const [plain, printed] = typed(null);
  const [vested] = typed(TOOL.vest);
  if (printed > 0) {
    assert.equal(plain, printed * 2, "Charmander is weak to Water");
    assert.equal(vested, printed);
  }
});

/* ---------- Stadiums ---------- */

const STAD = {
  gym: labTrainer("gym", "Stadium", "Each Fire Pokémon in play (both yours and your opponent's) gets +30 HP."),
  path: labTrainer("path", "Stadium", "The Retreat Cost of each Basic Pokémon in play (both yours and your opponent's) is Colorless less."),
  park: labTrainer("park", "Stadium", "Once during each player's turn, that player may search their deck for a Basic Pokémon and put it onto their Bench. Then, that player shuffles their deck."),
  odd: labTrainer("oddstadium", "Stadium", "Each player hums a tune."),
};

test("a Stadium stays in play for both players and a new one replaces it", () => {
  assert.ok(defs(STAD.gym).playable && defs(STAD.park).playable && !defs(STAD.odd).playable);
  const state = started();
  state.current = 0;
  const [me, foe] = state.players;
  const gym = hold(state, 0, STAD.gym);
  const again = hold(state, 0, STAD.gym);
  const path = hold(state, 0, STAD.path);
  const fireHp = maxHp(state, me.active, defs);
  const waterHp = maxHp(state, foe.active, defs);
  apply(state, { type: "play", player: 0, uid: gym }, defs);
  assert.equal(state.stadium.uid, gym);
  assert.ok(!me.discard.includes(gym));
  assert.equal(maxHp(state, me.active, defs), fireHp + 30, "Charmander is Fire");
  assert.equal(maxHp(state, foe.active, defs), waterHp, "Squirtle is not");
  // One Stadium a turn, and never the one already in play.
  assert.ok(!legalActions(state, 0, defs).some((a) => a.type === "play" && (a.uid === path || a.uid === again)));
  me.stadiumPlayed = false;
  assert.ok(!legalActions(state, 0, defs).some((a) => a.type === "play" && a.uid === again));
  // Damage that the extra HP was holding Knocks the Pokémon Out when the Stadium is replaced.
  me.active.damage = fireHp + 10;
  if (!me.bench.length) me.bench.push({ uid: me.deck.shift(), under: [], energy: [], damage: 0, since: 0 });
  const cost = retreatCost(state, foe.active, defs);
  const events = apply(state, { type: "play", player: 0, uid: path }, defs);
  assert.ok(me.discard.includes(gym));
  assert.ok(events.some((e) => e.t === "ko" && e.p === 0));
  assert.equal(retreatCost(state, foe.active, defs), Math.max(0, cost - 1));
});

test("a Stadium's once-a-turn use is open to both players, once each turn", () => {
  const state = started();
  state.current = 0;
  const me = state.players[0];
  me.bench = [];
  apply(state, { type: "play", player: 0, uid: hold(state, 0, STAD.park) }, defs);
  assert.ok(legalActions(state, 0, defs).some((a) => a.type === "stadium"));
  apply(state, { type: "stadium", player: 0 }, defs);
  apply(state, { type: "choose", player: 0, uids: [state.pending[0].uids[0]] }, defs);
  assert.equal(me.bench.length, 1);
  assert.ok(!legalActions(state, 0, defs).some((a) => a.type === "stadium"));
  assert.throws(() => apply(state, { type: "stadium", player: 0 }, defs), RuleError);
  apply(state, { type: "end", player: 0 }, defs);
  assert.equal(state.current, 1);
  assert.ok(legalActions(state, 1, defs).some((a) => a.type === "stadium"), "the other player may use it too");
});

/* ---------- the rulebook audit (2026-11-26) ---------- */

test("the flip winner chooses who goes first, only during setup", () => {
  const state = createGame({ decks: [fire, water], format: "half", seed: 3 }, defs);
  const w = state.flipWinner;
  assert.equal(state.first, w);
  assert.throws(() => apply(state, { type: "order", player: 1 - w, first: true }, defs), RuleError);
  apply(state, { type: "order", player: w, first: false }, defs);
  assert.equal(state.first, 1 - w);
  for (const p of [0, 1]) apply(state, legalActions(state, p, defs)[0], defs);
  assert.equal(state.current, 1 - w);
  assert.equal(state.turn, 1);
  assert.throws(() => apply(state, { type: "order", player: w, first: true }, defs), RuleError);
});

test("mulligans both players took cancel out; only the difference is drawn", () => {
  const state = createGame({ decks: [fire, water], format: "half", seed: 11 }, defs);
  state.players[0].mulligans = 3;
  state.players[1].mulligans = 1;
  const hands = state.players.map((s) => s.hand.length);
  for (const p of [0, 1]) apply(state, legalActions(state, p, defs)[0], defs);
  const turnDraw = (p) => (state.current === p ? 1 : 0);
  // Each placed one Basic; player 1 draws 2 for the two mulligans player 0 took beyond their own.
  assert.equal(state.players[0].hand.length, hands[0] - 1 + turnDraw(0));
  assert.equal(state.players[1].hand.length, hands[1] - 1 + 2 + turnDraw(1));
});

test("prize cards: 6 in a full deck, 3 in a half deck, more for ex, V, VMAX and Mega ex", () => {
  assert.equal(FORMATS.standard.prizes, 6);
  assert.equal(FORMATS.half.prizes, 3);
  const kinds = { plain: [1, 0], ex: [2, 0], megaEx: [3, 0], vmax: [3, 0], v: [2, 0], gx: [2, 0], tag: [3, 0], megaEX: [2, 0] };
  for (const card of byId.values()) {
    if (card.supertype !== "Pokémon") continue;
    const subs = card.subtypes || [];
    const def = defs(card.id);
    const is = (s) => subs.includes(s);
    let kind = "";
    if (is("VMAX")) kind = "vmax";
    else if (is("TAG TEAM")) kind = "tag";
    else if (is("MEGA") && is("EX")) kind = "megaEX";
    else if (/^Mega /.test(card.name) && / ex$/.test(card.name)) kind = "megaEx";
    else if (is("ex")) kind = "ex";
    else if (is("V")) kind = "v";
    else if (is("GX")) kind = "gx";
    if (!kind) continue;
    kinds[kind][1] += 1;
    assert.equal(def.prizes, kinds[kind][0], `${card.id} ${card.name} gives ${def.prizes}`);
  }
  for (const [kind, [, seen]] of Object.entries(kinds)) if (kind !== "plain") assert.ok(seen > 0, `no ${kind} cards checked`);
});

test("a Knock Out that wins both ways beats one that wins one way", () => {
  const state = started();
  state.current = 0;
  const [me, foe] = state.players;
  // Both Active Pokémon go down at once. Player 0 takes their last prize and leaves player 1
  // with no Pokémon; player 1 only takes their last prize.
  me.prizes.length = 1;
  foe.prizes.length = 1;
  me.bench = [{ uid: me.deck.find((uid) => state.cards[uid] === "base1-46"), damage: 0, energy: [], since: 0 }];
  foe.bench = [];
  me.active.damage = 999;
  foe.active.damage = 999;
  const events = [];
  resolveKnockOuts(state, defs, events);
  assert.equal(state.phase, "over");
  assert.equal(state.winner, 0);
});

test("one Radiant Pokémon and one ACE SPEC card a deck; one of each Prism Star", () => {
  const radiant = [...byId.values()].filter((c) => defs(c.id).club === "Radiant Pokémon" && defs(c.id).playable).slice(0, 2);
  assert.equal(radiant.length, 2, "two playable Radiant Pokémon to test with");
  const owned = { [radiant[0].id]: 2, [radiant[1].id]: 1 };
  const deck = { format: "standard", cards: { [radiant[0].id]: 1 } };
  assert.equal(roomFor(deck, radiant[0].id, owned, defs), 0);
  assert.equal(roomFor(deck, radiant[1].id, owned, defs), 0);
  deck.cards[radiant[1].id] = 1;
  assert.ok(checkDeck(deck, owned, defs).problems.some((p) => /only 1 Radiant/.test(p)));
  assert.ok([...byId.values()].some((c) => defs(c.id).club === "ACE SPEC card"), "ACE SPEC cards are recognised");
  const prism = [...byId.values()].find((c) => defs(c.id).cap === 1);
  assert.ok(prism, "Prism Star cards are recognised");
});

/* ---------- Abilities ---------- */

const power = (key, text, more = {}) => {
  const id = `lab-ab-${key}`;
  byId.set(id, { id, name: `Lab ${key}`, supertype: "Pokémon", subtypes: ["Basic"], types: ["Colorless"], hp: "100", attacks: [{ name: "Tap", cost: [], damage: "10", text: "" }], abilities: [{ name: `Power ${key}`, type: "Ability", text }], ...more });
  return id;
};
const AB = {
  tough: power("tough", "This Pokémon takes 30 less damage from attacks (after applying Weakness and Resistance)."),
  runway: power("runway", "Your Basic Pokémon in play have no Retreat Cost."),
  thorns: power("thorns", "If this Pokémon is in the Active Spot and is damaged by an attack from your opponent's Pokémon (even if this Pokémon is Knocked Out), put 2 damage counters on the Attacking Pokémon."),
  dodge: power("dodge", "If any damage is done to this Pokémon by attacks, flip a coin. If heads, prevent that damage."),
  wall: power("wall", "Prevent all damage done to this Pokémon by attacks from your opponent's Basic Pokémon."),
  sturdy: power("sturdy", "If this Pokémon has full HP and would be Knocked Out by damage from an attack, it is not Knocked Out, and its remaining HP becomes 10."),
  draw: power("draw", "Once during your turn, you may draw a card."),
  front: power("front", "Once during your turn, if this Pokémon is in the Active Spot, you may draw 2 cards."),
  pay: power("pay", "You must discard a card from your hand in order to use this Ability. Once during your turn, you may draw 2 cards."),
  rain: power("rain", "As often as you like during your turn (before your attack), you may attach a Water Energy card from your hand to 1 of your Water Pokémon. (This doesn't use up your 1 Energy card attachment for the turn.) This power can't be used if Lab rain is Asleep, Confused, or Paralyzed.", { abilities: [{ name: "Rain", type: "Pokémon Power", text: "As often as you like during your turn (before your attack), you may attach a Water Energy card from your hand to 1 of your Water Pokémon. (This doesn't use up your 1 Energy card attachment for the turn.) This power can't be used if Lab rain is Asleep, Confused, or Paralyzed." }] }),
  hop: power("hop", "Once during your turn, if this Pokémon is on your Bench, you may switch it with your Active Pokémon."),
  call: power("call", "When you play this Pokémon from your hand onto your Bench during your turn, you may draw cards until you have 6 cards in your hand."),
  odd: power("odd", "This Pokémon hums a tune nobody knows."),
};
const benchSlot = (state, p, id) => {
  const uid = hold(state, p, id);
  state.players[p].hand.pop();
  const slot = { uid, under: [], energy: [], damage: 0, since: 0 };
  state.players[p].bench.push(slot);
  return slot;
};

test("Ability text: read, unread, and the printed kind", () => {
  assert.equal(defs(AB.tough).ability.mod.less, 30);
  assert.ok(defs(AB.draw).ability.use && !defs(AB.draw).ability.use.often);
  assert.ok(defs(AB.rain).ability.use.often && defs(AB.rain).ability.kind === "Pokémon Power");
  assert.equal(defs(AB.call).ability.enter.how, "bench");
  assert.ok(!defs(AB.odd).ability && defs(AB.odd).notes.some((n) => /not live yet/.test(n)));
  assert.ok(!defs(AB.tough).notes.length);
  // Real cards: Blastoise's Rain Dance, and a modern wall against ex and V.
  assert.ok(defs("base1-2").ability.use.often);
  assert.deepEqual(defs("sv2-97").ability.wall.boxes, ["ex", "V", "VMAX", "VSTAR"]);
});

test("standing Abilities change damage taken and Retreat Costs", () => {
  const state = labgame("lab-2", AB.tough);
  const [me, foe] = state.players;
  let events = use(state, 0, "Sting");
  assert.equal(events.find((e) => e.t === "damage" && e.p === 1).n, 20, "50 less 30");
  // The owner's Basic Pokémon retreat for free while the Pokémon with the Ability is in play.
  const mine = labgame();
  const cost = retreatCost(mine, mine.players[0].bench[0], defs);
  assert.ok(cost > 0, "Squirtle pays to retreat");
  benchSlot(mine, 0, AB.runway);
  assert.equal(retreatCost(mine, mine.players[0].bench[0], defs), 0);
  assert.equal(retreatCost(mine, mine.players[1].active, defs), retreatCost(labgame(), labgame().players[1].active, defs), "not the other player's");
});

test("Abilities that answer an attack: hit back, dodge, wall, hang on", () => {
  let state = labgame("lab-2", AB.thorns);
  let events = use(state, 0, "Sting");
  assert.equal(state.players[0].active.damage, 20);
  assert.ok(events.some((e) => e.t === "ability" && e.p === 1));

  state = labgame("lab-1", AB.dodge);
  rigFlips(state, [true]);
  events = use(state, 0, "Tire");
  assert.equal(state.players[1].active.damage, 0);
  assert.ok(events.some((e) => e.t === "blocked"));
  state = labgame("lab-2", AB.dodge);
  events = use(state, 0, "Pierce");
  assert.equal(state.players[1].active.damage, 50, "an attack that ignores effects on the target isn't dodged");

  state = labgame("lab-1", AB.wall);
  use(state, 0, "Tire");
  assert.equal(state.players[1].active.damage, 0, "Lab is a Basic Pokémon");

  state = labgame("lab-2", AB.sturdy);
  byId.get("lab-2").attacks.push({ name: "Crush", cost: [], damage: "300", text: "" });
  defs("lab-2").attacks.push({ name: "Crush", cost: [], damage: 300, steps: [], text: "" });
  events = use(state, 0, "Crush");
  assert.equal(state.players[1].active.damage, 90);
  assert.ok(!events.some((e) => e.t === "ko"));
});

test("an Ability you use: once a turn, where it says, at its price", () => {
  const state = labgame(AB.draw);
  const [me] = state.players;
  const hand = me.hand.length;
  assert.ok(legalActions(state, 0, defs).some((a) => a.type === "ability" && a.spot === ACTIVE));
  const events = act(state, { type: "ability", player: 0, spot: ACTIVE });
  assert.equal(me.hand.length, hand + 1);
  assert.ok(events.some((e) => e.t === "ability"));
  throws(() => act(state, { type: "ability", player: 0, spot: ACTIVE }), /used this turn/);
  // Each Pokémon has its own once a turn.
  benchSlot(state, 0, AB.draw);
  act(state, { type: "ability", player: 0, spot: me.bench.length - 1 });
  assert.equal(me.hand.length, hand + 2);
  // Only in the Active Spot.
  benchSlot(state, 0, AB.front);
  throws(() => act(state, { type: "ability", player: 0, spot: me.bench.length - 1 }), /Active Spot/);
  // A price: a card from the hand first.
  benchSlot(state, 0, AB.pay);
  const before = me.hand.length;
  act(state, { type: "ability", player: 0, spot: me.bench.length - 1 });
  assert.equal(state.pending[0].type, "choose");
  act(state, { type: "choose", player: 0, uids: [me.hand[0]] });
  assert.equal(me.hand.length, before - 1 + 2);
  // The next turn it is ready again.
  act(state, { type: "end", player: 0 });
  act(state, { type: "end", player: 1 });
  assert.ok(legalActions(state, 0, defs).some((a) => a.type === "ability" && a.spot === ACTIVE));
});

test("Rain Dance: Energy from the hand as often as you like, and off while Asleep", () => {
  const state = labgame(AB.rain);
  const [me] = state.players;
  me.energyUsed = true;
  for (let i = 0; i < 2; i += 1) give(state, 0, W);
  const target = me.bench[0];
  const had = target.energy.length;
  for (let i = 0; i < 2; i += 1) {
    act(state, { type: "ability", player: 0, spot: ACTIVE });
    assert.deepEqual(state.pending[0].spots, [0], "only the Water Pokémon");
    act(state, { type: "pick", player: 0, spot: 0 });
  }
  assert.equal(target.energy.length, had + 2);
  give(state, 0, W);
  addCondition(state, me.active, "asleep");
  assert.ok(!legalActions(state, 0, defs).some((a) => a.type === "ability"));
});

test("a Benched Pokémon's Ability can bring it up; one played from the hand asks first", () => {
  const state = labgame();
  const [me] = state.players;
  const slot = benchSlot(state, 0, AB.hop);
  act(state, { type: "ability", player: 0, spot: me.bench.length - 1 });
  assert.equal(me.active, slot);

  me.hand.length = 2;
  const uid = hold(state, 0, AB.call);
  act(state, { type: "bench", player: 0, uid });
  assert.equal(state.pending[0].effect.op, "ability");
  assert.ok(state.pending[0].optional);
  act(state, { type: "pick", player: 0, spot: me.bench.length - 1 });
  assert.equal(me.hand.length, 6);
  // Saying no leaves the hand as it was.
  me.hand.length = 2;
  act(state, { type: "bench", player: 0, uid: hold(state, 0, AB.call) });
  act(state, { type: "pick", player: 0, spot: null });
  assert.equal(me.hand.length, 2);
  assert.equal(state.pending.length, 0);
});


/* ---------- Abilities, second batch ---------- */

const AB2 = {
  shift: power("shift", "As often as you like during your turn (before your attack), you may move a Water Energy from 1 of your Pokémon to another of your Pokémon."),
  pull: power("pull", "Once during your turn, you may move 1 damage counter from 1 of your Pokémon to 1 of your opponent's Pokémon."),
  dig: power("dig", "Once during your turn, you may search your deck for a Basic Water Energy card and attach it to this Pokémon. Then, shuffle your deck."),
  spread: power("spread", "Once during your turn, you may search your deck for up to 2 Basic Water Energy cards and attach them to your Pokémon in any way you like. Then, shuffle your deck. If you searched your deck in this way, this Pokémon is Knocked Out."),
  star: power("star", "During your turn, you may draw 2 cards. (You can't use more than 1 VSTAR Power in a game.)"),
  rest: power("rest", "Once during your turn, you may draw 3 cards. If you use this Ability, your turn ends."),
  calm: power("calm", "This Pokémon can't be affected by any Special Conditions."),
  ward: power("ward", "Prevent all damage done to your Benched Pokémon by your opponent's attacks."),
  heavy: power("heavy", "Your opponent's Active Pokémon's Retreat Cost is ColorlessColorless more."),
  quick: power("quick", "This Pokémon can evolve during your first turn or the turn you play it."),
  mend: power("mend", "At any time between turns, remove 1 damage counter from this Pokémon."),
  veil: power("veil", "Prevent all effects of attacks from your opponent's Pokémon done to this Pokémon. (Damage is not an effect.)"),
  shove: power("shove", "Once during your turn, you may switch out your opponent's Active Pokémon to the Bench. (Your opponent chooses the new Active Pokémon.)"),
  scout: power("scout", "Once during your turn, you may search your deck for a Water Pokémon, reveal it, and put it into your hand. Then, shuffle your deck."),
};

test("Ability text, second batch: the new wordings are read", () => {
  assert.deepEqual(defs(AB2.shift).ability.use.steps, [{ op: "moveEnergy", type: "Water", basic: false, from: "any", to: "any" }]);
  assert.ok(defs(AB2.spread).ability.use.selfKo);
  assert.ok(defs(AB2.star).ability.use.vstar);
  assert.ok(defs(AB2.rest).ability.use.ends);
  assert.deepEqual(defs(AB2.calm).ability.mod.immune, ["all"]);
  assert.equal(defs(AB2.scout).ability.use.steps[0].what, "pokemon:Water");
  // Real cards: Deoxys changes Forme, Magcargo can't sleep, Snorlax's old Poké-Power needs no Special Condition.
  assert.deepEqual(defs("ex8-16").ability.use.steps, [{ op: "formChange", name: "Deoxys", any: false }]);
  assert.deepEqual(defs("dp4-45").ability.mod.immune, ["asleep", "paralyzed"]);
  assert.ok(defs("dp6-6").ability.use.calm);
});

test("moving Energy and damage counters: from one Pokémon, then to another", () => {
  const state = labgame(AB2.shift);
  const [me, foe] = state.players;
  const from = me.active;
  const had = from.energy.length;
  assert.ok(had > 0, "the Active Pokémon has Water Energy");
  benchSlot(state, 0, "base1-63");
  act(state, { type: "ability", player: 0, spot: ACTIVE });
  assert.equal(state.pending[0].effect.op, "moveEnergyFrom");
  act(state, { type: "pick", player: 0, spot: ACTIVE });
  assert.equal(state.pending[0].effect.op, "moveEnergyTo");
  assert.ok(!state.pending[0].spots.includes(ACTIVE), "not back onto itself");
  act(state, { type: "pick", player: 0, spot: 0 });
  assert.equal(from.energy.length, had - 1);
  assert.equal(me.bench[0].energy.length, 1);
  // As often as you like: it can go again at once. With one place to go, it goes there without asking.
  assert.ok(legalActions(state, 0, defs).some((a) => a.type === "ability"));
  me.bench.pop();
  act(state, { type: "ability", player: 0, spot: ACTIVE });
  act(state, { type: "pick", player: 0, spot: 0 });
  assert.equal(state.pending.length, 0);
  assert.equal(from.energy.length, had, "back onto the only other Pokémon");

  const s2 = labgame(AB2.pull);
  s2.players[0].active.damage = 30;
  act(s2, { type: "ability", player: 0, spot: ACTIVE });
  act(s2, { type: "pick", player: 0, spot: ACTIVE });
  assert.equal(s2.pending[0].side, 1);
  act(s2, { type: "pick", player: 0, spot: ACTIVE });
  assert.equal(s2.players[0].active.damage, 20);
  assert.equal(s2.players[1].active.damage, 10);
});

test("Energy from the deck onto Pokémon: this one, or spread out", () => {
  let state = labgame(AB2.dig);
  const [me] = state.players;
  const had = me.active.energy.length;
  act(state, { type: "ability", player: 0, spot: ACTIVE });
  assert.equal(state.pending[0].type, "choose");
  const water = state.pending[0].uids;
  assert.ok(water.length && water.every((uid) => state.cards[uid] === W), "only basic Water Energy is offered");
  act(state, { type: "choose", player: 0, uids: [water[0]] });
  assert.equal(me.active.energy.length, had + 1);

  state = labgame();
  const slot = benchSlot(state, 0, AB2.spread);
  const spot = state.players[0].bench.indexOf(slot);
  const prizes = state.players[1].prizes.length;
  act(state, { type: "ability", player: 0, spot });
  const two = state.pending[0].uids.slice(0, 2);
  act(state, { type: "choose", player: 0, uids: two });
  assert.equal(state.pending.length, 2, "a Pokémon to pick for each card");
  act(state, { type: "pick", player: 0, spot: ACTIVE });
  act(state, { type: "pick", player: 0, spot: 0 });
  assert.ok(!state.players[0].bench.includes(slot), "it Knocks itself Out");
  assert.equal(state.players[1].prizes.length, prizes - 1, "and the other player takes a Prize");
});

test("VSTAR Power once a game, an Ability that ends the turn", () => {
  const state = labgame(AB2.star);
  act(state, { type: "ability", player: 0, spot: ACTIVE });
  assert.ok(state.players[0].vstarUsed);
  act(state, { type: "end", player: 0 });
  act(state, { type: "end", player: 1 });
  throws(() => act(state, { type: "ability", player: 0, spot: ACTIVE }), /VSTAR/);

  const s2 = labgame(AB2.rest);
  const turn = s2.turn;
  act(s2, { type: "ability", player: 0, spot: ACTIVE });
  assert.equal(s2.turn, turn + 1, "the turn passed");
  assert.equal(s2.current, 1);
});

test("standing Abilities, second batch: immune, Bench ward, heavier retreat, early evolution, mending", () => {
  let state = labgame("lab-2", AB2.calm);
  use(state, 0, "Sting");
  assert.deepEqual(conditionsOn(state.players[1].active), [], "no Poison");

  state = labgame("lab-2", AB2.veil);
  use(state, 0, "Sting");
  assert.equal(state.players[1].active.damage, 50, "damage still lands");
  assert.deepEqual(conditionsOn(state.players[1].active), [], "the effect doesn't");

  state = labgame();
  benchSlot(state, 1, AB2.ward);
  assert.ok(benchSafe(state, state.players[1].bench[0], 0, defs));
  assert.ok(!benchSafe(state, state.players[1].active, ACTIVE, defs));

  state = labgame();
  const base = retreatCost(state, state.players[0].active, defs);
  benchSlot(state, 1, AB2.heavy);
  assert.equal(retreatCost(state, state.players[0].active, defs), base + 2);
  assert.equal(retreatCost(state, state.players[0].bench[0], defs), retreatCost(labgame(), labgame().players[0].bench[0], defs), "only the Active one");

  state = labgame();
  state.cards[state.players[0].bench[0].uid] = AB2.quick;
  byId.set("lab-ab-quick-2", { id: "lab-ab-quick-2", name: "Lab quick two", supertype: "Pokémon", subtypes: ["Stage 1"], evolvesFrom: "Lab quick", types: ["Colorless"], hp: "150", attacks: [] });
  state.players[0].bench[0].since = state.turn;
  const uid = hold(state, 0, "lab-ab-quick-2");
  act(state, { type: "evolve", player: 0, uid, spot: 0 });
  assert.equal(state.cards[state.players[0].bench[0].uid], "lab-ab-quick-2", "evolved the turn it was played");

  state = labgame(AB2.mend);
  state.players[0].active.damage = 30;
  act(state, { type: "end", player: 0 });
  assert.equal(state.players[0].active.damage, 20);
});

test("an Ability can push the other Active Pokémon out: its player chooses", () => {
  const state = labgame(AB2.shove);
  const before = state.players[1].active;
  act(state, { type: "ability", player: 0, spot: ACTIVE });
  assert.equal(state.pending[0].player, 1);
  assert.ok(legalActions(state, 1, defs).every((a) => a.type === "pick"));
  act(state, { type: "pick", player: 1, spot: 0 });
  assert.notEqual(state.players[1].active, before);
});

test("form change: another of the same name takes over, cards and damage and all", () => {
  const state = labgame();
  const [me] = state.players;
  const slot = me.active;
  state.cards[slot.uid] = "ex8-16";
  slot.damage = 20;
  const other = Object.keys(state.cards).find((uid) => me.deck.includes(uid));
  state.cards[other] = "ex8-17";
  assert.equal(defs("ex8-17").name, "Deoxys");
  act(state, { type: "ability", player: 0, spot: ACTIVE });
  act(state, { type: "choose", player: 0, uids: [other] });
  assert.equal(me.active, slot);
  assert.equal(state.cards[slot.uid], "ex8-17");
  assert.equal(slot.damage, 20);
  assert.ok(me.deck.some((uid) => state.cards[uid] === "ex8-16"), "the old one went back in the deck");
});

/* ---------- Special Energy ---------- */

test("Special Energy: what it provides, who it's for, what it does", () => {
  assert.deepEqual(defs("base1-96").provides, ["Colorless", "Colorless"], "Double Colorless");
  assert.ok(defs("base1-96").playable && !defs("base1-96").basic);
  assert.deepEqual(defs("sm1-137").provides, ["Any"], "Rainbow Energy");
  assert.deepEqual(defs("xy10-115").special.only, { types: ["Fighting"] }, "Strong Energy");
  assert.deepEqual(defs("ex13-97").provides, ["Darkness|Metal"]);
  assert.equal(unpaid(["Metal", "Darkness"], ["Darkness|Metal", "Any"]), 0);
  assert.equal(unpaid(["Fire"], ["Darkness|Metal"]), 1);
  // Old Metal Energy gives Metal (the name isn't read as "this card").
  assert.deepEqual(defs("dp2-120").provides, ["Metal"]);
  assert.ok(!defs("bw11-113").why, "Double Colorless reads in every printing");
});

test("Special Energy in play: Double Colorless pays two, Rainbow hurts, Strong only on Fighting", () => {
  const state = labgame();
  const [me] = state.players;
  me.active.energy = [];
  const dce = hold(state, 0, "bw11-113");
  act(state, { type: "attach", player: 0, uid: dce, spot: ACTIVE });
  assert.equal(energyOf(state, me.active, defs).length, 2);

  const s2 = labgame();
  const rainbow = hold(s2, 0, "sm1-137");
  act(s2, { type: "attach", player: 0, uid: rainbow, spot: ACTIVE });
  assert.equal(s2.players[0].active.damage, 10, "a damage counter on attach");
  assert.ok(energyOf(s2, s2.players[0].active, defs).includes("Any"));

  const s3 = labgame();
  const strong = hold(s3, 0, "xy10-115");
  assert.ok(!legalActions(s3, 0, defs).some((a) => a.type === "attach" && a.uid === strong), "Lab is Colorless, not Fighting");
  throws(() => act(s3, { type: "attach", player: 0, uid: strong, spot: ACTIVE }), /only be attached to Fighting/);

  // Weakness Guard Energy: no Weakness on the Pokémon it is attached to.
  const s4 = labgame();
  const guard = hold(s4, 0, "sm11-213");
  act(s4, { type: "attach", player: 0, uid: guard, spot: ACTIVE });
  assert.ok(toolOf(s4, s4.players[0].active, defs).noWeakness);
});

test("Special Energy that acts when attached: Warp to the Bench, Draw a card", () => {
  const state = labgame();
  const [me] = state.players;
  const front = me.active;
  act(state, { type: "attach", player: 0, uid: hold(state, 0, "sm35-70"), spot: ACTIVE });
  assert.equal(state.pending[0].effect.op, "switch");
  act(state, { type: "pick", player: 0, spot: 0 });
  assert.notEqual(me.active, front);

  const s2 = labgame();
  const hand = s2.players[0].hand.length;
  act(s2, { type: "attach", player: 0, uid: hold(s2, 0, "sm12-209"), spot: 0 });
  assert.equal(s2.players[0].hand.length, hand + 1, "attached from the hand, and a card drawn");
});

console.log(`${passed} checks passed${process.exitCode ? ", some failed" : ""}`);
