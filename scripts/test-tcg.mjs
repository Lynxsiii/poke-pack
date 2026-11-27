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
import { ACTIVE, FORMATS, RuleError, abilityOn, healRoom, rand, noteShed, hpLeft, attacksOf, defOf, addCondition, addMark, apply, costFor, benchSafe, canRetreat, energyOf, warded, toolOf, conditionsOn, createGame, flip, damageAfterTyping, legalActions, maxHp, resolveKnockOuts, retreatCost, unpaid, usableAttacks, viewFor } from "../js/tcg/engine.js";
import { createDefs, defineCard, FREE_ENERGY } from "../js/tcg/cards.js";
import { boostOf, compileTrainer, fits, runTrainer, trainerAim, whatOf } from "../js/tcg/trainers.js";
import { compileAttack } from "../js/tcg/effects.js";
import { botAction } from "../js/tcg/bot.js";
import { LESSON, LESSON_CARDS, createLesson } from "../js/tcg/tutorial.js";
import { buildBotDeck, buildDeck, checkDeck, deckList, roomFor } from "../js/tcg/decks.js";
import { BASIC_ENERGY, boxCardList } from "../js/catalog.js";

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
const legal = JSON.parse(readFileSync("data/tcg/legal.json", "utf8"));
const defs = createDefs((id) => byId.get(id), rules, trainers, legal);

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (err) {
    console.error(`FAIL ${name}\n  ${err.stack.split("\n").slice(0, 4).join("\n  ")}`, process.env.DEEP ? err.stack : "");
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
  for (const [shape, n] of [...unread].sort((a, b) => b[1] - a[1]).slice(0, Number(process.env.TOP_ATTACKS || 25))) console.log(`  ${String(n).padStart(4)}  ${shape}`);
  console.log(`${trainerCards} Trainers: ${trainerRead} playable (Items and Supporters whose text is read)`);
  console.log("Commonest unread Item and Supporter texts:");
  for (const [shape, n] of [...unreadTrainers].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  ${String(n).padStart(4)}  ${shape.slice(0, 150)}`);
  for (const sub of ["tool", "stadium"]) {
    const all = [...byId.values()].map((c) => defs(c.id)).filter((d) => d.kind === "trainer" && d.sub === sub);
    console.log(`${all.length} ${sub === "tool" ? "Pokémon Tools" : "Stadiums"}: ${all.filter((d) => d.playable).length} live`);
  }
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
  assert.equal(defs("me1-128").playable, false);
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
  assert.equal(compileAttack("Flip a coin. If tails, Electabuzz does 10 damage to itself.", "Electabuzz")[0].tails[0].op, "selfDamage");
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
  const owned = { "base1-46": 5, "base1-24": 1, "me1-128": 2 };
  const check = (cards, own = owned, format = "unlimited") => checkDeck({ format, cards }, own, defs);
  assert.deepEqual(check({ "base1-46": 4, [F]: 56 }).problems, []);
  assert.match(check({ "base1-46": 4, [F]: 55 }).problems[0], /1 more card to go/);
  assert.match(check({ "base1-46": 4, [F]: 57 }).problems[0], /1 too many cards/);
  assert.match(check({ "base1-46": 5, [F]: 55 }).problems.join(" "), /5 copies of Charmander, the limit is 4/);
  assert.match(check({ "base1-46": 4, [F]: 56 }, {}).problems.join(" "), /You own 0 of Charmander/);
  assert.match(check({ "base1-46": 4, [F]: 56 }, { "base1-46": 1 }).problems.join(" "), /You own 1/);
  assert.match(check({ "me1-128": 1, "base1-46": 4, [F]: 55 }).problems.join(" "), /can't be played yet/);
  assert.match(check({ [F]: 60 }).problems.join(" "), /Basic Pokémon/);
  assert.deepEqual(check({ "base1-46": 1, [F]: 59 }).problems, [], "basic Energy has no copy limit");
  assert.equal(roomFor({ format: "unlimited", cards: { "base1-46": 4 } }, "base1-46", owned, defs), 0);
  assert.equal(roomFor({ format: "unlimited", cards: { "base1-46": 3 } }, "base1-46", owned, defs), 1);
  assert.equal(roomFor({ format: "unlimited", cards: { "base1-46": 1 } }, "base1-46", { "base1-46": 3 }, defs), 2); // owns three
  assert.equal(roomFor({ format: "unlimited", cards: {} }, "me1-128", owned, defs), 0);
  assert.equal(roomFor({ format: "unlimited", cards: { "base1-46": 2 } }, F, owned, defs), 58);
});

/* ---------- formats: the official deck rules (js/tcg/formats.js) ---------- */

test("formats: Standard, Expanded and Unlimited are 60 cards and 6 prizes; Half is not a choice", () => {
  for (const f of ["standard", "expanded", "unlimited"]) {
    assert.equal(FORMATS[f].deckSize, 60);
    assert.equal(FORMATS[f].prizes, 6);
    assert.equal(FORMATS[f].copies, 4);
    assert.ok(FORMATS[f].pick);
  }
  assert.equal(FORMATS.half.pick, false);
  const old = checkDeck({ format: "half", cards: { "base1-46": 2, [F]: 28 } }, { "base1-46": 2 }, defs);
  assert.equal(old.ok, false);
  assert.match(old.problems[0], /Half deck isn't a tournament format: switch the deck to Standard, Expanded or Unlimited/);
  assert.equal(old.need, 60, "an old Half deck is measured against 60 cards");
});

test("formats: Standard is regulation marks H, I and J", () => {
  assert.equal(defs("sv5-1").mark, "H");
  assert.equal(defs("sv5-1").legal.standard, "");
  assert.equal(defs("sv10-1").legal.standard, "", "Destined Rivals, I");
  assert.equal(defs("me6-1").legal.standard, "", "Delta Reign, J");
  assert.match(defs("sv1-1").legal.standard, /Regulation mark G rotated out of Standard/);
  assert.match(defs("swsh10-46").legal.standard, /Regulation mark F rotated/);
  assert.match(defs("base1-46").legal.standard, /before regulation marks/);
  assert.equal(defs(F).legal.standard, "", "basic Energy is always legal");
  assert.match(defs("energy-fairy-xy").legal.standard, /Fairy/);
  // A print can carry an older mark than its set: Temporal Forces' Scovillain ex is G (both sources agree).
  assert.match(defs("sv5-22").legal.standard, /mark G/);
  const owned = { "sv1-1": 4, "sv5-1": 4 };
  const deck = (cards) => checkDeck({ format: "standard", cards }, owned, defs).problems.join(" ");
  assert.match(deck({ "sv1-1": 2, [F]: 58 }), /Pineco isn't legal in Standard: regulation mark G rotated out of Standard/);
  assert.equal(roomFor({ format: "standard", cards: {} }, "sv1-1", owned, defs), 0, "the editor won't add a rotated card");
  assert.ok(roomFor({ format: "standard", cards: {} }, "sv5-1", owned, defs) > 0);
});

test("formats: a Trainer's older print is Standard legal when a legal print reads the same (Handbook 4.1.3)", () => {
  // Ultra Ball: Mega Evolution prints it with I; the Sun & Moon and Black & White prints are the same card.
  assert.equal(defs("me1-131").mark, "I");
  assert.equal(defs("me1-131").legal.standard, "");
  assert.equal(defs("sv1-196").legal.standard, "", "the G print, reprinted with I");
  assert.equal(defs("sm1-135").legal.standard, "", "worded differently, does the same");
  assert.equal(defs("bw5-102").legal.standard, "");
  // Base Set Potion heals 20, the newer Potion 30: not the same card, so not legal.
  assert.match(defs("base1-94").legal.standard, /before regulation marks/);
  // A Pokémon counts only by its own print.
  const pikachus = [...byId.values()].filter((c) => c.name === "Pikachu" && c.supertype === "Pokémon").map((c) => defs(c.id));
  assert.ok(pikachus.some((d) => !d.legal.standard) && pikachus.some((d) => d.legal.standard));
});

test("formats: Expanded is Black & White onward, minus the ban list", () => {
  assert.equal(defs("bw1-1").legal.expanded, "");
  assert.equal(defs("xy1-1").legal.expanded, "");
  assert.equal(defs("sm1-1").legal.expanded, "");
  assert.equal(defs("sv1-1").legal.expanded, "", "G is still Expanded");
  assert.equal(defs("swsh10-46").legal.expanded, "");
  assert.match(defs("base1-46").legal.expanded, /before Black & White/);
  assert.match(defs("pl4-AR1").legal.expanded, /before Black & White/);
  // Banned: Pokémon by print, Trainers by name.
  for (const id of ["xy6-77", "bw3-67", "bw5-62", "sm8-90", "swsh7-83", "swsh45-SV013", "swsh10-TG02", "xy1-124", "g1-71"]) assert.match(defs(id).legal.expanded, /Banned in Expanded/, id);
  assert.equal(defs("xy6-77").legal.unlimited, "", "nothing is banned in Unlimited");
  const otherArcheops = [...byId.values()].find((c) => c.name === "Archeops" && /^(bw|xy|sm|sw|sv|me)/.test(c.id) && !["bw3-67", "bw5-110"].includes(c.id));
  if (otherArcheops) assert.doesNotMatch(defs(otherArcheops.id).legal.expanded, /Banned/, "only the banned prints of a Pokémon");
  const deck = checkDeck({ format: "expanded", cards: { "xy6-77": 1, [F]: 59 } }, { "xy6-77": 1 }, defs);
  assert.ok(deck.problems.some((p) => /Shaymin-EX isn't legal in Expanded: banned in Expanded/.test(p)));
  // Classic Collection prints are Unlimited only (the safer reading).
  assert.match(defs("cel25-cc4").legal.expanded, /Classic Collection/);
  assert.equal(defs("cel25-cc4").legal.unlimited, "");
});

test("formats: the copy limit is by English name, across reprints, LV.X and δ", () => {
  const unl = (cards, owned) => checkDeck({ format: "unlimited", cards }, owned, defs).problems.join(" ");
  // Ultra Ball from two sets: 3 + 2 is five Ultra Balls.
  const balls = { "me1-131": 3, "sv1-196": 2, "base1-46": 1, [F]: 54 };
  assert.match(unl(balls, { ...balls }), /5 copies of Ultra Ball, the limit is 4/);
  assert.equal(roomFor({ format: "unlimited", cards: { "me1-131": 3, "sv1-196": 1 } }, "sv1-196", { "me1-131": 4, "sv1-196": 4 }, defs), 0);
  // Gengar and Gengar LV.X, Pikachu and Pikachu δ share a name; Professor's Research by any professor is one card.
  assert.equal(defs("dp5-97").deckName, "Garchomp");
  const chomps = { "dp5-97": 2, "dp2-9": 3, "base1-46": 1, [F]: 54 };
  assert.match(unl(chomps, chomps), /5 copies of Garchomp/);
  const pikas = { "ex12-93": 2, "base1-58": 3, [F]: 55 };
  assert.match(unl(pikas, pikas), /5 copies of Pikachu, the limit is 4/);
  const profs = { "sv1-189": 2, "sv1-190": 2, "swsh1-178": 1, "base1-46": 1, [F]: 54 };
  assert.match(unl(profs, profs), /5 copies of Professor's Research/);
  // ex and EX are different names, and so is Radiant: 4 of each is fine.
  assert.notEqual(defs("swsh10-46").deckName, "Greninja");
});

test("formats: one ACE SPEC, one Radiant Pokémon, one Pokémon ★, one of each Prism Star by name", () => {
  const std = (cards) => checkDeck({ format: "standard", cards }, cards, defs).problems.join(" ");
  assert.match(std({ "sv5-153": 1, "sv5-157": 1, "sv5-1": 4, [F]: 54 }), /only 1 ACE SPEC card, this one has 2/);
  assert.match(std({ "sv5-153": 2, "sv5-1": 4, [F]: 54 }), /only 1 ACE SPEC card, this one has 2/);
  assert.equal(roomFor({ format: "standard", cards: { "sv5-153": 1 } }, "sv5-157", { "sv5-157": 1 }, defs), 0);
  const exp = (cards) => checkDeck({ format: "expanded", cards }, cards, defs).problems.join(" ");
  assert.match(exp({ "swsh10-46": 1, "swsh10-27": 1, [F]: 58 }), /only 1 Radiant Pokémon, this one has 2/);
  assert.match(exp({ "sm5-58": 2, [F]: 58 }), /2 copies of Giratina ◇, the limit is 1/);
  assert.doesNotMatch(exp({ "sm5-58": 1, "sm5-62": 1, [F]: 58 }), /limit|only 1/, "two different Prism Star cards are fine");
  const unl = (cards) => checkDeck({ format: "unlimited", cards }, cards, defs).problems.join(" ");
  assert.match(unl({ "ex7-107": 1, "ex7-108": 1, [F]: 58 }), /only 1 Pokémon ★, this one has 2/);
  assert.equal(defs("neo3-65").cap, 1, "a Neo Shining Pokémon is one by name");
});

test("formats: Arceus cards that say you may have as many as you like", () => {
  assert.ok(defs("pl4-AR1").any && defs("pl4-94").any && defs("pl4-dpp50").any);
  const arceus = { "pl4-AR1": 6, "pl4-AR2": 3, [F]: 51 };
  assert.doesNotMatch(checkDeck({ format: "unlimited", cards: arceus }, arceus, defs).problems.join(" "), /copies/);
  assert.equal(roomFor({ format: "unlimited", cards: { "pl4-AR1": 6 } }, "pl4-AR1", { "pl4-AR1": 10 }, defs), 4);
  // An Arceus without the rule still counts to 4 on its own.
  const plain = [...byId.values()].find((c) => c.name === "Arceus" && !defs(c.id).any && defs(c.id).playable);
  if (plain) {
    const deck = { [plain.id]: 5, "pl4-AR1": 4, [F]: 51 };
    assert.match(checkDeck({ format: "unlimited", cards: deck }, deck, defs).problems.join(" "), /5 copies of Arceus/);
  }
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

test("review fixes: an Ability's mill hits the other deck; Warp Point with no Bench on their side doesn't hang", () => {
  const state = midgame();
  const [mine, theirs] = [state.players[0].deck.length, state.players[1].deck.length];
  runTrainer([{ op: "foeMill", n: 2 }], { state, defs, events: [], player: 0 });
  assert.equal(state.players[0].deck.length, mine);
  assert.equal(state.players[1].deck.length, theirs - 2);
  const s2 = midgame();
  for (const slot of s2.players[1].bench.splice(0)) s2.players[1].discard.push(slot.uid);
  runTrainer([{ op: "foeSwitch" }, { op: "switch" }], { state: s2, defs, events: [], player: 0 });
  assert.ok(!s2.pending.some((w) => w.type === "pick" && !w.spots.length), "no pick with nothing to pick");
  assert.ok(legalActions(s2, 0, defs).length > 0);
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
        seen.push(...side.deck, ...side.hand, ...side.discard, ...side.prizes, ...(side.lost || []));
        for (const slot of [side.active, ...side.bench]) if (slot) seen.push(slot.uid, ...slot.under, ...slot.energy, ...(slot.tool ? [slot.tool] : []), ...(slot.held || []).map((h) => h.uid));
      }
      if (state.stadium) seen.push(state.stadium.uid);
      // Energy taken from the deck waits on the choice of the Pokémon it goes to; so does a card to evolve with.
      for (const w of state.pending) seen.push(...(w.effect?.op === "attachHeld" ? w.effect.uids : w.effect?.op === "evolveHeld" ? [w.effect.uid] : []));
      assert.equal(seen.length, Object.keys(state.cards).length);
      assert.equal(new Set(seen).size, seen.length);
    }
  }
  return state;
}

test("bot against bot: every set's deck finishes its matches", () => {
  const rand = mulberry(11);
  const built = [];
  // Every set in Unlimited, and the sets legal there in Standard and Expanded: each deck must pass the deck rules.
  for (const [setId, list] of Object.entries(sets)) {
    for (const format of ["unlimited", "standard", "expanded"]) {
      const deck = buildBotDeck(list.map((c) => defs(c.id)), format, rand);
      if (!deck) continue;
      const size = Object.values(deck.cards).reduce((a, b) => a + b, 0);
      assert.equal(size, FORMATS[format].deckSize, `${setId} ${format} deck has ${size} cards`);
      assert.deepEqual(checkDeck({ format, cards: deck.cards }, deck.cards, defs).problems, [], `${setId} ${format} bot deck follows the rules`);
      if (format !== "unlimited" && rand() < 0.6) continue; // the matches: every Unlimited deck, a share of the others
      built.push({ setId, format, list: deckList({ cards: deck.cards }) });
    }
  }
  assert.equal(buildBotDeck(sets.base1.map((c) => defs(c.id)), "standard"), null, "no Standard deck out of Base Set");
  assert.ok(buildBotDeck(sets.sv8.map((c) => defs(c.id)), "standard"), "a Standard deck out of Surging Sparks");
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
  const built = buildDeck(pool, "unlimited");
  assert.deepEqual(checkDeck({ format: "unlimited", cards: built.cards }, owned, defs).problems, []);
  assert.equal(buildDeck(pool, "standard"), null, "Base Set has nothing for Standard");
  assert.equal(buildDeck(pool, "expanded"), null);
  assert.equal(buildDeck([], "unlimited"), null);
  const modern = { "sv5-1": 2, "sv8-1": 3, "me1-131": 2, "sv1-196": 2 };
  const fresh = buildDeck(Object.entries(modern).map(([id, n]) => ({ def: defs(id), owned: n })), "standard");
  assert.deepEqual(checkDeck({ format: "standard", cards: fresh.cards }, modern, defs).problems, []);
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

test("the flip comes before the deal: the winner chooses with no hand to look at", () => {
  const state = createGame({ decks: [fire, water], format: "half", seed: 3, chooseFirst: true }, defs);
  const w = state.flipWinner;
  assert.equal(state.dealt, false);
  assert.ok(state.players.every((s) => s.hand.length === 0));
  assert.deepEqual(legalActions(state, 1 - w, defs), []);
  assert.deepEqual(legalActions(state, w, defs).map((a) => a.type), ["order", "order"]);
  throws(() => act(state, { type: "place", player: w, active: "a1", bench: [] }), /chosen who goes first/);
  act(state, { type: "order", player: w, first: false });
  assert.equal(state.first, 1 - w);
  assert.ok(state.players.every((s) => s.hand.length === 7));
  throws(() => act(state, { type: "order", player: w, first: true }), /already chosen/);
});

test("GX attacks and VSTAR Powers are once a game", () => {
  const tauros = defs("sm1-100");
  assert.equal(tauros.attacks[2].once, "gx");
  const state = midgame();
  const me = state.players[0];
  state.cards[me.active.uid] = "sm1-100";
  me.active.energy.push(give(state, 0, W), give(state, 0, W));
  assert.ok(usableAttacks(state, 0, defs).includes(2));
  me.gxUsed = true;
  assert.ok(!usableAttacks(state, 0, defs).includes(2));
  throws(() => act(state, { type: "attack", player: 0, index: 2 }), /GX attack/);
  me.gxUsed = false;
  act(state, { type: "attack", player: 0, index: 2 });
  assert.equal(me.gxUsed, true);
});

test("Tera Pokémon ex are safe on the Bench; Prism Star cards go to the Lost Zone; one Pokémon ★ a deck", () => {
  const state = midgame();
  const me = state.players[0];
  state.cards[me.bench[0].uid] = "sv7-32";
  assert.ok(defs("sv7-32").tera);
  assert.ok(benchSafe(state, me.bench[0], 0, defs));
  const jirachi = hold(state, 0, "sm7-97");
  me.hand.splice(me.hand.indexOf(jirachi), 1);
  me.discard.push(jirachi);
  act(state, { type: "end", player: 0 });
  assert.ok(!me.discard.includes(jirachi));
  assert.ok(me.lost.includes(jirachi));
  assert.equal(defs("ex13-102").club, "Pokémon ★");
});

test("an old Mega Evolution Pokémon-EX ends the turn; BREAK waits", () => {
  assert.ok(defs("xy2-13").megaEnds);
  assert.equal(defs("xy2-13").prizes, 2);
  const breakCard = [...byId.values()].find((c) => (c.subtypes || []).includes("BREAK"));
  assert.equal(defs(breakCard.id).playable, false);
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
  const deck = { format: "expanded", cards: { [radiant[0].id]: 1 } };
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

/* ---------- Abilities, third batch: triggers and locks ---------- */

const AB3 = {
  ward: power("ward3", "Prevent all effects of your opponent's Pokémon's Abilities done to this Pokémon."),
  itemWard: power("itemward", "Whenever your opponent plays an Item or Supporter card from their hand, prevent all effects of that card done to this Pokémon."),
  ping: power("ping", "Once during your turn, you may put 2 damage counters on 1 of your opponent's Pokémon."),
  noKo: power("noko", "Pokémon in play (both yours and your opponent's) lose any Ability that requires the Pokémon using it to Knock Out itself."),
  gas: power("gas", "As long as this Pokémon is in the Active Spot, your opponent's Pokémon in play have no Abilities, except for Power gas."),
  front: power("frontlock", "As long as this Pokémon is in the Active Spot, your opponent's Active Pokémon has no Abilities, except for Power frontlock."),
  hurtLock: power("hurtlock", "As long as this Pokémon is in the Active Spot, your opponent's Pokémon in play that have any damage counters on them have no Abilities, except for Pokémon ex."),
  toxin: power("toxin", "If this Pokémon has a Pokémon Tool card attached to it, each Pokémon in play, in each player's hand, and in each player's discard pile has no Abilities (except for Power toxin)."),
  rise: power("rise", "Once during your turn, when this Pokémon moves from your Bench to the Active Spot, you may put 2 damage counters on 1 of your opponent's Pokémon."),
  pull: power("gather", "Once during your turn, when this Pokémon moves from your Bench to the Active Spot, you may move any amount of Water Energy from your other Pokémon to it."),
  koSearch: power("kosearch", "If this Pokémon is Knocked Out by damage from an attack from your opponent's Pokémon, search your deck for a card and put it into your hand. Then, shuffle your deck."),
  koHand: power("kohand", "If this Pokémon is Knocked Out by damage from an attack from your opponent's Pokémon, put it into your hand instead of the discard pile. (Discard all attached cards.)"),
  koSting: power("kosting", "If this Pokémon is in the Active Spot and is Knocked Out by damage from an attack from your opponent's Pokémon, put 6 damage counters on the Attacking Pokémon."),
  sting: power("sting", "Whenever your opponent attaches an Energy card from their hand to 1 of their Pokémon, put 2 damage counters on that Pokémon."),
  lost: power("lost", "Once during your turn, if any of your Pokémon were Knocked Out during your opponent's last turn, you may draw 3 cards. You can't use more than 1 Power lost Ability each turn."),
  fan: power("fan", "Once during your first turn, you may search your deck for up to 3 Colorless Pokémon with 100 HP or less, reveal them, and put them into your hand. Then, shuffle your deck. You can't use more than 1 Power fan Ability during your turn."),
  grit: power("grit", "If this Pokémon's remaining HP is 30 or less, its attacks do 80 more damage to your opponent's Active Pokémon (before applying Weakness and Resistance)."),
  charged: power("charged", "If this Pokémon has any Special Energy attached, it gets +100 HP."),
  pure: power("pure", "Prevent all damage done to this Pokémon by attacks from your opponent's Pokémon that have Special Energy attached."),
};
lab("lab-9", [["Smash", 300, ""]]);

test("Ability text, third batch: triggers, locks and wards are read", () => {
  assert.ok(defs(AB3.ward).ability.ward && defs(AB3.itemWard).ability.trainerWard);
  assert.deepEqual(defs(AB3.gas).ability.lock, { side: "foe", except: "Power gas" });
  assert.equal(defs(AB3.gas).ability.where, "active");
  assert.ok(defs(AB3.toxin).ability.when.tool);
  assert.deepEqual(defs(AB3.rise).ability.rise.steps, [{ op: "counters", n: 20 }]);
  assert.deepEqual(defs(AB3.pull).ability.rise.steps, [{ op: "gather", type: "Water" }]);
  assert.deepEqual(defs(AB3.koSting).ability.ko, { counters: 60, active: true });
  assert.equal(defs(AB3.sting).ability.foeAttach, 20);
  assert.ok(defs(AB3.lost).ability.use.need.lost && defs(AB3.lost).ability.use.single);
  assert.equal(defs(AB3.fan).ability.use.steps[0].what, "pokemon:Colorless@100");
  assert.deepEqual(defs(AB3.grit).ability.when, { hpMax: 30 });
  // Real cards: Mimikyu-like wards, Garbodor's Garbotoxin, Pecharunt-era locks, Iron Hands' trigger.
  assert.ok(defs("me3-31").ability.ward);
  assert.ok(defs("bw6-54").ability.lock && defs("bw6-54").ability.when.tool);
  assert.ok(defs("sv4-89").ability.rise);
  assert.ok(defs("me3-50").ability.ko.toHand);
  assert.ok(defs("sv5-78").ability.lock.active, "the other player's curly apostrophe printing reads too");
});

test("Ability locks: from the Active Spot, on damaged Pokémon, with a Tool, on Knock Out-itself Abilities", () => {
  let state = labgame(AB.draw, AB3.gas);
  const usable = (s) => legalActions(s, 0, defs).some((a) => a.type === "ability");
  assert.ok(!usable(state), "Neutralizing Gas: no Abilities for the other side");
  // Moved to the Bench, it stops.
  const gas = state.players[1].active;
  state.players[1].active = state.players[1].bench[0];
  state.players[1].bench[0] = gas;
  assert.ok(usable(state));

  state = labgame(AB.draw, AB3.front);
  assert.ok(!usable(state), "the Active one loses it");
  benchSlot(state, 0, AB.draw);
  assert.ok(legalActions(state, 0, defs).some((a) => a.type === "ability" && a.spot !== ACTIVE), "a Benched one keeps it");

  state = labgame(AB.draw, AB3.hurtLock);
  assert.ok(usable(state));
  state.players[0].active.damage = 10;
  assert.ok(!usable(state), "damaged: no Ability");

  state = labgame(AB.draw, AB3.toxin);
  assert.ok(usable(state), "no Tool, no lock");
  state.players[1].active.tool = hold(state, 1, TOOL.cape);
  state.players[1].hand.pop();
  assert.ok(!usable(state));
  // Its own side loses theirs too.
  const mate = benchSlot(state, 1, AB.tough);
  assert.equal(toolOf(state, mate, defs).less || 0, 0, "Garbotoxin reaches both sides");

  state = labgame();
  const spread = benchSlot(state, 0, AB2.spread);
  const at = state.players[0].bench.indexOf(spread);
  assert.ok(legalActions(state, 0, defs).some((a) => a.type === "ability" && a.spot === at));
  benchSlot(state, 1, AB3.noKo);
  assert.ok(!legalActions(state, 0, defs).some((a) => a.type === "ability" && a.spot === at), "no Abilities that Knock Out themselves");
});

test("wards: an Ability keeps off the other side's Abilities, another their Items and Supporters", () => {
  let state = labgame(AB3.ping, AB3.ward);
  act(state, { type: "ability", player: 0, spot: ACTIVE });
  assert.ok(!state.pending[0].spots.includes(ACTIVE), "damage counters can't go on the warded one");
  // And a lock is an effect of an Ability too.
  state = labgame(AB3.gas, AB3.ward);
  assert.ok(abilityOn(state, state.players[1].active, defs), "the lock doesn't reach it");
  // A heavier Retreat Cost from their Ability doesn't reach it.
  state = labgame(AB3.ward);
  const base = retreatCost(state, state.players[0].active, defs);
  benchSlot(state, 1, AB2.heavy);
  assert.equal(retreatCost(state, state.players[0].active, defs), base);

  state = labgame();
  state.cards[state.players[1].bench[0].uid] = AB3.itemWard;
  benchSlot(state, 1, "base1-46");
  act(state, { type: "play", player: 0, uid: hold(state, 0, T.boss) });
  assert.deepEqual(state.pending[0].spots, [1], "Boss's Orders can't pull the warded one");
  throws(() => act(state, { type: "pick", player: 0, spot: 0 }), /can't be chosen/);
});

test("when this Pokémon moves from the Bench to the Active Spot: asked once a turn, on its owner's turn", () => {
  const state = labgame();
  const [me, foe] = state.players;
  const slot = benchSlot(state, 0, AB3.rise);
  const to = me.bench.indexOf(slot);
  act(state, { type: "retreat", player: 0, to });
  assert.equal(me.active, slot);
  assert.equal(state.pending[0].effect.op, "ability");
  act(state, { type: "pick", player: 0, spot: ACTIVE });
  assert.equal(state.pending[0].effect.op, "damage");
  act(state, { type: "pick", player: 0, spot: ACTIVE });
  assert.equal(foe.active.damage, 20);
  // Switched out and back in the same turn: not again.
  act(state, { type: "play", player: 0, uid: hold(state, 0, T.swap) });
  act(state, { type: "pick", player: 0, spot: 0 });
  act(state, { type: "play", player: 0, uid: hold(state, 0, T.swap) });
  act(state, { type: "pick", player: 0, spot: me.bench.indexOf(slot) });
  assert.equal(me.active, slot);
  assert.equal(state.pending.length, 0);

  // "Move any amount of Water Energy from your other Pokémon to it": a pick a card, until the player stops.
  const s2 = labgame();
  const m2 = s2.players[0];
  const old = m2.active;
  for (let i = 0; i < 2; i += 1) old.energy.push(m2.hand.splice(m2.hand.indexOf(hold(s2, 0, W)), 1)[0]);
  const had = old.energy.length;
  assert.ok(had >= 2);
  const puller = benchSlot(s2, 0, AB3.pull);
  act(s2, { type: "play", player: 0, uid: hold(s2, 0, T.swap) });
  act(s2, { type: "pick", player: 0, spot: m2.bench.indexOf(puller) });
  act(s2, { type: "pick", player: 0, spot: ACTIVE });
  const from = m2.bench.indexOf(old);
  act(s2, { type: "pick", player: 0, spot: from });
  assert.equal(s2.pending[0].effect.op, "gatherFrom");
  act(s2, { type: "pick", player: 0, spot: from });
  if (s2.pending.length) act(s2, { type: "pick", player: 0, spot: null });
  assert.equal(puller.energy.length, 2);
  assert.equal(old.energy.length, had - 2);
  assert.equal(s2.pending.length, 0);
});

test("Knocked Out by an attack: search, back to the hand, damage counters on the attacker", () => {
  let state = labgame("lab-9", AB3.koSearch);
  let [me, foe] = state.players;
  use(state, 0, "Smash");
  assert.equal(state.pending[0].type, "choose");
  assert.equal(state.pending[0].player, 1);
  const pick = state.pending[0].uids[0];
  act(state, { type: "choose", player: 1, uids: [pick] });
  assert.ok(foe.hand.includes(pick));
  assert.equal(state.pending[0].type, "promote");
  assert.ok((foe.lostOn || []).includes(state.turn), "remembered for next turn");

  state = labgame("lab-9", AB3.koHand);
  [me, foe] = state.players;
  const uid = foe.active.uid;
  use(state, 0, "Smash");
  assert.ok(foe.hand.includes(uid) && !foe.discard.includes(uid));

  state = labgame("lab-9", AB3.koSting);
  use(state, 0, "Smash");
  assert.equal(state.players[0].active.damage, 60);

  // Not by an attack: no trigger.
  state = labgame(AB3.ping, AB3.koHand);
  state.players[1].active.damage = 90;
  const front = state.players[1].active.uid;
  act(state, { type: "ability", player: 0, spot: ACTIVE });
  act(state, { type: "pick", player: 0, spot: ACTIVE });
  assert.ok(state.players[1].discard.includes(front));
});

test("after a Knock Out last turn, on the first turn, with an Energy attached: Abilities with terms", () => {
  const state = labgame("lab-9", AB3.lost);
  const lost = benchSlot(state, 1, AB3.lost);
  state.players[1].bench.unshift(state.players[1].bench.pop());
  use(state, 0, "Smash");
  act(state, { type: "promote", player: 1, spot: 0 });
  assert.equal(state.current, 1);
  assert.ok(legalActions(state, 1, defs).some((a) => a.type === "ability" && a.spot === ACTIVE));
  assert.equal(state.players[1].active, lost);
  act(state, { type: "end", player: 1 });
  act(state, { type: "end", player: 0 });
  assert.ok(!legalActions(state, 1, defs).some((a) => a.type === "ability"), "only the turn after");

  const s2 = labgame(AB3.fan);
  assert.ok(!legalActions(s2, 0, defs).some((a) => a.type === "ability"), "not after the first turn");
  s2.first = 1;
  s2.turn = 2;
  assert.ok(legalActions(s2, 0, defs).some((a) => a.type === "ability"));

  // Their Energy attached from the hand: 2 damage counters.
  const s3 = labgame(AB.draw, AB3.sting);
  s3.players[0].energyUsed = false;
  act(s3, { type: "attach", player: 0, uid: give(s3, 0, W), spot: 0 });
  assert.equal(s3.players[0].bench[0].damage, 20);
});

test("standing Abilities with terms: low HP hits harder, Special Energy adds HP or walls", () => {
  const state = labgame(AB3.grit);
  const slot = state.players[0].active;
  assert.equal(toolOf(state, slot, defs).plus || 0, 0);
  slot.damage = 70;
  assert.equal(toolOf(state, slot, defs).plus, 80);

  const s2 = labgame(AB3.charged);
  assert.equal(maxHp(s2, s2.players[0].active, defs), 100);
  s2.players[0].active.energy.push(hold(s2, 0, "bw11-113"));
  s2.players[0].hand.pop();
  assert.equal(maxHp(s2, s2.players[0].active, defs), 200);

  const s3 = labgame("lab-1", AB3.pure);
  use(s3, 0, "Tire");
  assert.equal(s3.players[1].active.damage, 10);
  const s4 = labgame("lab-1", AB3.pure);
  s4.players[0].active.energy.push(hold(s4, 0, "bw11-113"));
  s4.players[0].hand.pop();
  use(s4, 0, "Tire");
  assert.equal(s4.players[1].active.damage, 0);
});

test("the bot plays through decks full of the new Abilities", () => {
  const shapes = (a) => a && (a.rise || a.ko || a.lock || a.ward || a.trainerWard || a.foeAttach || a.use?.need || a.when?.hpMax || a.when?.special);
  const picks = [...byId.values()].filter((c) => {
    const d = defs(c.id);
    return d.kind === "pokemon" && d.playable && d.stage === "basic" && shapes(d.ability);
  });
  assert.ok(picks.length >= 10);
  for (let seed = 1; seed <= 6; seed += 1) {
    const deckFor = (k) => [...Array(10)].flatMap((_, i) => Array(3).fill(picks[(seed * 7 + k * 13 + i * 3) % picks.length].id)).concat(...["energy-water", "energy-fire", "energy-psychic", "energy-grass", "energy-lightning", "energy-fighting"].map((e) => Array(5).fill(e)));
    playOut([deckFor(0), deckFor(1)], "standard", seed);
  }
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

/* ---------- Trainers, third batch ---------- */

const U = {
  acro: labTrainer("acro", "Item", "Look at the top 2 cards of your deck and put 1 of them into your hand. Discard the other card."),
  janine: labTrainer("janine", "Supporter", "Look at the top 4 cards of your deck and put 2 of them into your hand. Shuffle the other cards back into your deck."),
  rika: labTrainer("rika", "Supporter", "Look at the top 4 cards of your deck and put 2 of them into your hand. Shuffle the other cards and put them on the bottom of your deck."),
  lacey: labTrainer("lacey", "Supporter", "Shuffle your hand into your deck. Then, draw 4 cards. If your opponent has 3 or fewer Prize cards remaining, draw 8 cards instead."),
  emcee: labTrainer("emcee", "Supporter", "Draw 2 cards. If your opponent has 3 or fewer Prize cards remaining, draw 2 more cards."),
  catcher: labTrainer("catcher", "Item", "You can play this card only if you have more Prize cards remaining than your opponent. Switch 1 of your opponent's Benched Pokémon with their Active Pokémon."),
  grunt: labTrainer("grunt", "Supporter", "You can use this card only if any of your Pokémon were Knocked Out during your opponent's last turn. Discard an Energy from 1 of your opponent's Pokémon."),
  carmine: labTrainer("carmine", "Supporter", "If you go first, you may use this card during your first turn. Discard your hand and draw 5 cards."),
  iono: labTrainer("iono", "Supporter", "Each player shuffles their hand and puts it on the bottom of their deck. If either player put any cards on the bottom of their deck in this way, each player draws a card for each of their remaining Prize cards."),
  rod: labTrainer("rod", "Item", "Shuffle up to 3 in any combination of Pokémon and basic Energy cards from your discard pile into your deck."),
  stretcher: labTrainer("stretcher", "Item", "Put a Pokémon or a Basic Energy card from your discard pile into your hand."),
  revive: labTrainer("revive", "Item", "Put a Basic Pokémon from your discard pile onto your Bench."),
  hammer: labTrainer("hammer", "Item", "Discard a Special Energy from 1 of your opponent's Pokémon."),
  giacomo: labTrainer("giacomo", "Supporter", "Discard a Special Energy from each of your opponent's Pokémon."),
  yell: labTrainer("yell", "Supporter", "Put an Energy attached to 1 of your opponent's Pokémon into their hand."),
  belt: labTrainer("belt", "Supporter", "During this turn, attacks used by your Pokémon do 40 more damage to your opponent's Active Pokémon ex (before applying Weakness and Resistance)."),
  power: labTrainer("power", "Item", "During this turn, your Pokémon's attacks do 10 more damage to the Active Pokémon (before applying Weakness and Resistance)."),
  scoop: labTrainer("scoop", "Item", "Put 1 of your Pokémon and all cards attached to it into your hand."),
  turo: labTrainer("turo", "Supporter", "Put 1 of your Pokémon in play into your hand. (Discard all cards attached to that Pokémon.)"),
  lady: labTrainer("lady", "Supporter", "Heal 60 damage and remove all Special Conditions from 1 of your Pokémon."),
  maxpotion: labTrainer("maxpotion", "Item", "Heal all damage from 1 of your Pokémon. If you do, discard all Energy from that Pokémon."),
  guzma: labTrainer("guzma", "Supporter", "Switch 1 of your opponent's Benched Pokémon with their Active Pokémon. If you do, switch your Active Pokémon with 1 of your Benched Pokémon."),
  warp: labTrainer("warp", "Item", "Your opponent switches 1 of his or her Defending Pokémon with 1 of his or her Benched Pokémon, if any. You switch 1 of your Active Pokémon with 1 of your Benched Pokémon, if any."),
  quick: labTrainer("quick", "Item", "You can play this card only if you discard another card from your hand. Search your deck for a Basic Pokémon, reveal it, and put it into your hand. Then, shuffle your deck."),
  kindler: labTrainer("kindler", "Supporter", "You can use this card only if you discard a Fire Energy card from your hand. Look at the top 7 cards of your deck and put up to 2 of them into your hand. Shuffle the other cards back into your deck."),
  worker: labTrainer("worker", "Supporter", "Draw 3 cards. Discard a Stadium in play."),
  band: labTrainer("cband", "Pokémon Tool", "The attacks of the Pokémon this card is attached to do 30 more damage to your opponent's Active Pokémon-GX or Active Pokémon-EX (before applying Weakness and Resistance)."),
  vessel: labTrainer("vessel", "Stadium", "Once during each player's turn, that player may discard a card from their hand. If they do, that player searches their deck for a basic Energy card, reveals it, and puts it into their hand. Then, that player shuffles their deck."),
};
byId.set("lab-ex", { id: "lab-ex", name: "Lab ex", supertype: "Pokémon", subtypes: ["Basic", "ex"], types: ["Colorless"], hp: "300", attacks: [{ name: "Thump", cost: [], damage: "20", text: "" }] });
byId.set("lab-v", { id: "lab-v", name: "Lab V", supertype: "Pokémon", subtypes: ["Basic", "V"], types: ["Colorless"], hp: "300", attacks: [{ name: "Thump", cost: [], damage: "20", text: "" }] });

test("Trainer text, third batch: the new wordings are read", () => {
  for (const id of Object.values(U)) assert.ok(defs(id).playable, defs(id).text);
  const named = (name) => [...byId.values()].filter((c) => c.name === name && c.supertype === "Trainer").map((c) => defs(c.id));
  for (const name of ["Iono", "Arven", "Buddy-Buddy Poffin", "Acro Bike", "Super Rod", "Enhanced Hammer", "Lacey", "Carmine", "Black Belt's Training", "Super Scoop Up", "Pokémon Center Lady", "Night Stretcher", "Poké Pad", "Counter Catcher", "Guzma", "Choice Band", "Artazon", "Quick Ball", "Earthen Vessel", "Ultra Ball"]) assert.ok(named(name).some((d) => d.playable), name);
  // What a search names: either of two kinds, an HP cap, no Rule Box, no Pokémon-ex.
  assert.equal(whatOf("a Pokémon or a Basic Energy card"), "pokemon|basicEnergy");
  assert.equal(whatOf("in any combination of Water Pokémon and Water Energy cards"), "pokemon:Water|basicEnergy:Water");
  assert.equal(whatOf("Basic Pokémon with 70 HP or less"), "basic@70");
  assert.equal(whatOf("a Pokémon that doesn't have a Rule Box"), "pokemon!rule");
  assert.equal(whatOf("a Basic Pokémon or Evolution card (excluding Pokémon-ex)"), "basic!ex|evolution!ex");
  assert.ok(fits(defs("base1-63"), "basic@40") && !fits(defs("base1-63"), "basic@30"));
  assert.ok(fits(defs("base1-63"), "pokemon!rule") && !fits(defs("lab-ex"), "pokemon!rule") && !fits(defs("lab-ex"), "basic!ex"));
  // An Item and a Pokémon Tool: one search each.
  assert.deepEqual(compileTrainer("Search your deck for an Item card and a Pokémon Tool card, reveal them, and put them into your hand. Then, shuffle your deck.").map((s) => s.what), ["item", "tool"]);
  // "Any Tera Pokémon in play" is a condition of its own now.
  assert.deepEqual(compileTrainer("You can use this card only if you have any Tera Pokémon in play. Draw 2 cards."), [{ op: "only", when: { tera: true } }, { op: "draw", n: 2 }]);
});

test("a look at the top cards: take some, the rest discarded, shuffled in, or put on the bottom", () => {
  const state = midgame();
  const me = state.players[0];
  const top = me.deck.slice(0, 2);
  act(state, { type: "play", player: 0, uid: hold(state, 0, U.acro) });
  assert.deepEqual(state.pending[0].uids, top);
  assert.equal(state.pending[0].min, 1);
  throws(() => act(state, { type: "choose", player: 0, uids: [] }), /Choose a card/);
  act(state, { type: "choose", player: 0, uids: [top[1]] });
  assert.ok(me.hand.includes(top[1]) && me.discard.includes(top[0]));

  const s2 = midgame();
  const deck = s2.players[0].deck.length;
  const four = s2.players[0].deck.slice(0, 4);
  act(s2, { type: "play", player: 0, uid: hold(s2, 0, U.rika) });
  act(s2, { type: "choose", player: 0, uids: four.slice(0, 2) });
  assert.equal(s2.players[0].deck.length, deck - 2);
  assert.deepEqual(s2.players[0].deck.slice(-2).sort(), four.slice(2).sort(), "the other two went to the bottom");
});

test("conditions: Prize counts, a Knock Out last turn, the first turn", () => {
  const state = midgame();
  const [me, foe] = state.players;
  foe.prizes.push(foe.deck.pop()); // 4 left: not yet "3 or fewer"
  act(state, { type: "play", player: 0, uid: hold(state, 0, U.lacey) });
  assert.equal(me.hand.length, 4);
  const s2 = midgame();
  s2.players[1].prizes.length = 3;
  act(s2, { type: "play", player: 0, uid: hold(s2, 0, U.lacey) });
  assert.equal(s2.players[0].hand.length, 8);
  const s3 = midgame();
  s3.players[1].prizes.length = 2;
  const hand = s3.players[0].hand.length;
  act(s3, { type: "play", player: 0, uid: hold(s3, 0, U.emcee) });
  assert.equal(s3.players[0].hand.length, hand + 4);

  // Counter Catcher: only while behind on Prize cards.
  const catcher = hold(state, 0, U.catcher);
  throws(() => act(state, { type: "play", player: 0, uid: catcher }), /would do nothing/);
  foe.prizes.length = 2;
  act(state, { type: "play", player: 0, uid: catcher });
  assert.equal(state.pending[0].side, 1);
  act(state, { type: "pick", player: 0, spot: 0 });

  // Knocked Out during the opponent's last turn: the engine remembers it.
  const s4 = midgame();
  const grunt = hold(s4, 0, U.grunt);
  s4.players[1].active.energy.push(give(s4, 1, F));
  assert.ok(!legalActions(s4, 0, defs).some((a) => a.uid === grunt));
  act(s4, { type: "end", player: 0 });
  s4.players[0].bench[0].damage = 999;
  resolveKnockOuts(s4, defs, []);
  act(s4, { type: "end", player: 1 });
  assert.ok(legalActions(s4, 0, defs).some((a) => a.uid === grunt));

  // Carmine on the very first turn; another Supporter can't be.
  const fresh = started();
  const first = fresh.current;
  act(fresh, { type: "play", player: first, uid: hold(fresh, first, U.carmine) });
  assert.equal(fresh.players[first].hand.length, 5);
});

test("hands to the bottom of the deck, cards back from the discard pile", () => {
  const state = midgame();
  const [me, foe] = state.players;
  me.prizes.length = 2;
  const mine = me.hand.slice();
  act(state, { type: "play", player: 0, uid: hold(state, 0, U.iono) });
  assert.equal(me.hand.length, 2);
  assert.equal(foe.hand.length, foe.prizes.length);
  assert.ok(mine.every((u) => me.deck.slice(-mine.length).includes(u)), "the old hand is at the bottom");

  const rod = hold(state, 0, U.rod);
  throws(() => act(state, { type: "play", player: 0, uid: rod }), /would do nothing/);
  const gone = me.deck.splice(0, 3);
  me.discard.push(...gone);
  act(state, { type: "play", player: 0, uid: rod });
  const fitting = state.pending[0].uids;
  act(state, { type: "choose", player: 0, uids: fitting });
  assert.ok(fitting.every((u) => me.deck.includes(u)));

  const s2 = midgame();
  const squirtle = s2.players[0].deck.find((u) => s2.cards[u] === "base1-63");
  s2.players[0].deck.splice(s2.players[0].deck.indexOf(squirtle), 1);
  s2.players[0].discard.push(squirtle);
  const bench = s2.players[0].bench.length;
  act(s2, { type: "play", player: 0, uid: hold(s2, 0, U.revive) });
  act(s2, { type: "choose", player: 0, uids: [squirtle] });
  assert.equal(s2.players[0].bench.length, bench + 1);
});

test("Special Energy off their Pokémon; an Energy back to their hand", () => {
  const state = midgame();
  const foe = state.players[1];
  const hammer = hold(state, 0, U.hammer);
  throws(() => act(state, { type: "play", player: 0, uid: hammer }), /would do nothing/);
  const dce = hold(state, 1, "base1-96");
  foe.hand.splice(foe.hand.indexOf(dce), 1);
  foe.active.energy.unshift(dce);
  act(state, { type: "play", player: 0, uid: hammer });
  act(state, { type: "pick", player: 0, spot: ACTIVE });
  assert.ok(foe.discard.includes(dce) && foe.active.energy.every((u) => defs(state.cards[u]).basic));

  const s2 = midgame();
  const f2 = s2.players[1];
  const two = [hold(s2, 1, "base1-96"), hold(s2, 1, "base1-96")];
  f2.hand = f2.hand.filter((u) => !two.includes(u));
  f2.active.energy.push(two[0]);
  f2.bench[0].energy.push(two[1]);
  act(s2, { type: "play", player: 0, uid: hold(s2, 0, U.giacomo) });
  assert.ok(two.every((u) => f2.discard.includes(u)));
  assert.equal(s2.pending.length, 0);

  const s3 = midgame();
  const f3 = s3.players[1];
  f3.active.energy.push(give(s3, 1, F));
  const hand = f3.hand.length;
  act(s3, { type: "play", player: 0, uid: hold(s3, 0, U.yell) });
  act(s3, { type: "pick", player: 0, spot: ACTIVE });
  assert.equal(f3.hand.length, hand + 1);
});

test("more damage this turn: all attacks, or only against Pokémon ex; a Tool against GX and EX", () => {
  const hit = (target, card) => {
    const state = labgame("lab-2", target);
    if (card) act(state, { type: "play", player: 0, uid: hold(state, 0, card) });
    use(state, 0, "Pierce");
    return state.players[1].active.damage;
  };
  assert.equal(hit("lab-2"), 50);
  assert.equal(hit("lab-2", U.power), 60);
  assert.equal(hit("lab-2", U.belt), 50, "not an ex");
  assert.equal(hit("lab-ex", U.belt), 90);
  // Only that turn.
  const state = labgame("lab-2", "lab-ex");
  act(state, { type: "play", player: 0, uid: hold(state, 0, U.belt) });
  act(state, { type: "end", player: 0 });
  act(state, { type: "end", player: 1 });
  use(state, 0, "Pierce");
  assert.equal(state.players[1].active.damage, 50);
  // Choice Band: on the attacker, against a Pokémon-EX only.
  assert.deepEqual(defs(U.band).tool.plusVs, { n: 30, vs: ["GX", "EX"] });
  const s2 = labgame("lab-2", "lab-v");
  s2.players[0].active.tool = hold(s2, 0, U.band);
  s2.players[0].hand.pop();
  assert.equal(boostOf(s2, 0, s2.players[0].active, s2.players[1].active, defs), 0);
});

test("a Pokémon back to the hand, never the last one; healing that cures; Max Potion strips", () => {
  const state = midgame();
  const me = state.players[0];
  const benched = me.bench[0];
  benched.energy.push(give(state, 0, W));
  act(state, { type: "play", player: 0, uid: hold(state, 0, U.turo) });
  act(state, { type: "pick", player: 0, spot: 0 });
  assert.ok(me.hand.includes(benched.uid) && me.discard.includes(benched.energy[0]));
  assert.equal(me.bench.length, 0);
  const scoop = hold(state, 0, U.scoop);
  throws(() => act(state, { type: "play", player: 0, uid: scoop }), /would do nothing/);
  // The Active one: it goes with its Energy, and a new Active Pokémon is chosen.
  act(state, { type: "bench", player: 0, uid: give(state, 0, "base1-63") });
  const front = me.active;
  act(state, { type: "play", player: 0, uid: scoop });
  act(state, { type: "pick", player: 0, spot: ACTIVE });
  assert.ok(me.hand.includes(front.uid) && front.energy.every((u) => me.hand.includes(u)));
  assert.equal(state.pending[0].type, "promote");
  act(state, { type: "promote", player: 0, spot: 0 });

  const s2 = midgame();
  const m2 = s2.players[0];
  addCondition(s2, m2.active, "poisoned");
  act(s2, { type: "play", player: 0, uid: hold(s2, 0, U.lady) });
  assert.deepEqual(s2.pending[0].spots, [ACTIVE], "only a condition, no damage, still counts");
  act(s2, { type: "pick", player: 0, spot: ACTIVE });
  assert.deepEqual(conditionsOn(m2.active), []);
  m2.active.damage = 30;
  act(s2, { type: "play", player: 0, uid: hold(s2, 0, U.maxpotion) });
  act(s2, { type: "pick", player: 0, spot: ACTIVE });
  assert.equal(m2.active.damage, 0);
  assert.equal(m2.active.energy.length, 0);
});

test("switch both ways; a price in cards of a kind; Stadiums dropped and paid for", () => {
  const state = midgame();
  const [me, foe] = state.players;
  const guzma = hold(state, 0, U.guzma);
  const keep = foe.bench.splice(0);
  throws(() => act(state, { type: "play", player: 0, uid: guzma }), /would do nothing/);
  foe.bench.push(...keep);
  const mine = me.active.uid;
  act(state, { type: "play", player: 0, uid: guzma });
  act(state, { type: "pick", player: 0, spot: 0 });
  assert.equal(state.pending[0].side, 0);
  act(state, { type: "pick", player: 0, spot: 0 });
  assert.notEqual(me.active.uid, mine);

  // Warp Point: their player picks first, then the card's player gets their own pick.
  const s2 = midgame();
  act(s2, { type: "play", player: 0, uid: hold(s2, 0, U.warp) });
  assert.equal(s2.pending[0].player, 1);
  act(s2, { type: "pick", player: 1, spot: 0 });
  assert.equal(s2.pending[0].player, 0);
  assert.equal(s2.pending[0].side, 0);
  act(s2, { type: "pick", player: 0, spot: 0 });

  // Kindler: only a Fire Energy card pays.
  const s3 = midgame();
  const kindler = hold(s3, 0, U.kindler);
  s3.players[0].hand = s3.players[0].hand.filter((u) => s3.cards[u] !== F);
  throws(() => act(s3, { type: "play", player: 0, uid: kindler }), /would do nothing/);
  const fire = hold(s3, 0, F);
  act(s3, { type: "play", player: 0, uid: kindler });
  assert.deepEqual(s3.pending[0].uids, [fire]);

  // Worker drops the Stadium; a Stadium's own price counts every card in the hand.
  const s4 = midgame();
  act(s4, { type: "play", player: 0, uid: hold(s4, 0, U.vessel) });
  assert.equal(defs(U.vessel).stadium.use[0].spare, 0);
  s4.players[0].hand = [s4.players[0].hand[0]];
  act(s4, { type: "stadium", player: 0 });
  act(s4, { type: "choose", player: 0, uids: s4.players[0].hand.slice(0, 1) });
  act(s4, { type: "choose", player: 0, uids: [] });
  act(s4, { type: "play", player: 0, uid: hold(s4, 0, U.worker) });
  assert.ok(!s4.stadium && s4.players[0].discard.some((u) => s4.cards[u] === U.vessel));
});

test("Special Energy, third batch: more on some Pokémon, a type to act on, healing", () => {
  // Prism Energy: every type on a Basic Pokémon.
  const state = labgame();
  const prism = hold(state, 0, "bw4-93");
  act(state, { type: "attach", player: 0, uid: prism, spot: ACTIVE });
  assert.ok(energyOf(state, state.players[0].active, defs).includes("Any"));
  assert.deepEqual(defs("bw4-93").provides, ["Colorless"]);
  // Twin Energy: two on a Pokémon that isn't a V, one on a V, and a retreat counts it right.
  const s2 = labgame();
  s2.players[0].active.energy = [hold(s2, 0, "swsh2-174")];
  s2.players[0].hand.pop();
  assert.deepEqual(energyOf(s2, s2.players[0].active, defs), ["Colorless", "Colorless"]);
  s2.cards[s2.players[0].active.uid] = "lab-v";
  assert.deepEqual(energyOf(s2, s2.players[0].active, defs), ["Colorless"]);
  // Speed Lightning Energy draws only on a Lightning Pokémon.
  const s3 = labgame();
  const hand = s3.players[0].hand.length;
  act(s3, { type: "attach", player: 0, uid: hold(s3, 0, "swsh2-173"), spot: ACTIVE });
  assert.equal(s3.players[0].hand.length, hand, "Lab is Colorless");
  // Medical Energy heals what it is attached to.
  const s4 = labgame();
  s4.players[0].active.damage = 50;
  act(s4, { type: "attach", player: 0, uid: hold(s4, 0, "sv4-182"), spot: ACTIVE });
  assert.equal(s4.players[0].active.damage, 20);
  for (const id of ["sv8-191", "me3-88", "me4-85", "me5-84", "swsh3-175", "swsh4-164", "ex13-98", "sm4-100", "ex10-96", "hgss1-104", "ecard2-147"]) assert.ok(defs(id).playable, id);
});

/* ---------- Trainers, fourth batch: evolving, cards in play discarded, cards back into the deck ---------- */

// base1: Squirtle 63 -> Wartortle 42 -> Blastoise 2. In midgame() player 0's Active Squirtle has been in play
// since turn 1; its Benched Squirtle came in this turn.
const CANDY = "bw10-85", OLD_CANDY = "dp4-102", EVOSODA = "xy1-116", WALLY = "xy6-94", WALLY_TRAINING = "ex2-89";
const playable = (state, uid) => legalActions(state, 0, defs).some((a) => a.type === "play" && a.uid === uid);
/** Put a card of this id into a player's deck (it need not be in the deck list). */
function stock(state, p, id) {
  const uid = `x${Object.keys(state.cards).length}`;
  state.cards[uid] = id;
  state.players[p].deck.push(uid);
  return uid;
}

test("evolution lines: a Stage 2 knows the Basic Pokémon it comes from", () => {
  assert.deepEqual(defs("base1-2").roots, ["Squirtle"]);
  assert.equal(defs("base1-2").line, 2);
  assert.equal(defs("base1-42").line, 1);
  assert.equal(defs("base1-63").line, undefined);
  for (const id of [CANDY, OLD_CANDY, "base1-76", EVOSODA, WALLY, WALLY_TRAINING, "sv5-160"]) assert.ok(defs(id).playable, id);
});

test("Rare Candy: a Stage 2 from the hand onto its Basic Pokémon, never on the first turn or one new this turn", () => {
  const state = midgame();
  const me = state.players[0];
  const candy = hold(state, 0, CANDY);
  // Nothing to put on, or only a Stage 1: it would do nothing.
  throws(() => act(state, { type: "play", player: 0, uid: candy }), /would do nothing/);
  const wartortle = hold(state, 0, "base1-42");
  assert.ok(!playable(state, candy), "a Stage 1 isn't skipped to");
  const blastoise = hold(state, 0, "base1-2");
  // The first turn: not yet.
  state.turn = 2;
  assert.ok(!playable(state, candy));
  state.turn = 3;
  const squirtle = me.active.uid;
  act(state, { type: "play", player: 0, uid: candy });
  assert.equal(state.pending[0].type, "choose");
  assert.deepEqual(state.pending[0].uids, [blastoise]);
  // Only the Active Squirtle may take it (the Benched one came in this turn): no Pokémon to pick.
  const events = act(state, { type: "choose", player: 0, uids: [blastoise] });
  assert.equal(me.active.uid, blastoise);
  assert.deepEqual(me.active.under, [squirtle]);
  assert.ok(events.some((e) => e.t === "evolve" && e.uid === blastoise && e.spot === ACTIVE));
  assert.ok(!me.hand.includes(blastoise) && me.hand.includes(wartortle));
  assert.equal(state.pending.length, 0);
  // It evolved this turn: no further evolving; and Rare Candy never goes on what isn't a Basic Pokémon.
  me.active.since = 1;
  const again = hold(state, 0, CANDY);
  hold(state, 0, "base1-2");
  assert.ok(!playable(state, again));

  // Two Basic Pokémon that may take it: the player picks, and the card rides on the pick.
  const s2 = midgame();
  const two = s2.players[0];
  two.bench[0].since = 1;
  const b2 = hold(s2, 0, "base1-2");
  act(s2, { type: "play", player: 0, uid: hold(s2, 0, CANDY) });
  act(s2, { type: "choose", player: 0, uids: [b2] });
  assert.equal(s2.pending[0].type, "pick");
  assert.deepEqual(s2.pending[0].spots.sort(), [ACTIVE, 0].sort());
  assert.equal(viewFor(s2, 0).cards[b2], "base1-2", "the chooser sees the card it holds");
  act(s2, { type: "pick", player: 0, spot: 0 });
  assert.equal(two.bench[0].uid, b2);
  assert.equal(s2.pending.length, 0);
});

test("old Rare Candy and Pokémon Breeder: a Stage 1 too for the old one, the usual timing for both", () => {
  const state = midgame();
  const me = state.players[0];
  const wartortle = hold(state, 0, "base1-42");
  const candy = hold(state, 0, OLD_CANDY);
  assert.ok(!playable(state, hold(state, 0, "base1-76")), "Pokémon Breeder: a Stage 2 only");
  act(state, { type: "play", player: 0, uid: candy });
  act(state, { type: "choose", player: 0, uids: [wartortle] });
  assert.equal(me.active.uid, wartortle);
  // A Basic Pokémon put into play this turn is never one it goes on.
  const s2 = midgame();
  s2.players[0].active.since = s2.turn;
  hold(s2, 0, "base1-2");
  assert.ok(!playable(s2, hold(s2, 0, "base1-76")));
});

test("Evosoda, Wally, Wally's Training: a card from the deck evolves one of your Pokémon", () => {
  const state = midgame();
  const me = state.players[0];
  const wartortle = stock(state, 0, "base1-42");
  stock(state, 0, "base1-2");
  const soda = hold(state, 0, EVOSODA);
  state.turn = 2;
  assert.ok(!playable(state, soda), "not on the first turn");
  state.turn = 3;
  act(state, { type: "play", player: 0, uid: soda });
  // Only what evolves from a Pokémon in play is offered: Wartortle, not Blastoise.
  assert.deepEqual(state.pending[0].uids, [wartortle]);
  assert.equal(state.pending[0].min, 0);
  const events = act(state, { type: "choose", player: 0, uids: [wartortle] });
  assert.equal(me.active.uid, wartortle);
  assert.ok(!me.deck.includes(wartortle));
  assert.ok(events.some((e) => e.t === "evolve" && e.from === "deck"));
  // A search may come up empty.
  const s0 = midgame();
  act(s0, { type: "play", player: 0, uid: hold(s0, 0, EVOSODA) });
  assert.deepEqual(s0.pending[0].uids, []);
  act(s0, { type: "choose", player: 0, uids: [] });
  assert.equal(s0.pending.length, 0);

  // Wally: on the first turn too, and on the Squirtle benched this turn, so the player picks which.
  const s2 = midgame();
  const w = stock(s2, 0, "base1-42");
  s2.turn = 2;
  const wally = hold(s2, 0, WALLY);
  s2.players[0].supporterUsed = false;
  assert.ok(playable(s2, wally));
  act(s2, { type: "play", player: 0, uid: wally });
  act(s2, { type: "choose", player: 0, uids: [w] });
  assert.equal(s2.pending[0].effect.op, "evolveHeld");
  act(s2, { type: "pick", player: 0, spot: 0 });
  assert.equal(s2.players[0].bench[0].uid, w);

  // Wally's Training: the Active Pokémon only.
  const s3 = midgame();
  s3.players[0].bench[0].since = 1;
  const w3 = stock(s3, 0, "base1-42");
  act(s3, { type: "play", player: 0, uid: hold(s3, 0, WALLY_TRAINING) });
  act(s3, { type: "choose", player: 0, uids: [w3] });
  assert.equal(s3.players[0].active.uid, w3);
  assert.equal(s3.pending.length, 0);
});

const IN_PLAY = {
  scrapper: "bw6-116",
  blower: "sm2-125",
  xerosic: "xy4-110",
  blowtorch: "me2-86",
  ruffian: "sv9-157",
};

test("Tool Scrapper and Field Blower: Tools on either side and the Stadium go to their owners' discard piles", () => {
  const state = midgame();
  const [me, foe] = state.players;
  const scrapper = hold(state, 0, IN_PLAY.scrapper);
  throws(() => act(state, { type: "play", player: 0, uid: scrapper }), /would do nothing/);
  const mine = hold(state, 0, TOOL.cape);
  act(state, { type: "tool", player: 0, uid: mine, spot: ACTIVE });
  const theirs = `x${Object.keys(state.cards).length}`;
  state.cards[theirs] = TOOL.band;
  foe.active.tool = theirs;
  assert.equal(viewFor(state, 0).cards[theirs], TOOL.band, "a Tool in play is in plain sight");
  act(state, { type: "play", player: 0, uid: scrapper });
  assert.equal(state.pending[0].zone, "play");
  assert.deepEqual(state.pending[0].uids.sort(), [mine, theirs].sort());
  assert.equal(state.pending[0].max, 2);
  const events = act(state, { type: "choose", player: 0, uids: [theirs] });
  assert.ok(!foe.active.tool && foe.discard.includes(theirs));
  assert.equal(me.active.tool, mine);
  assert.ok(events.some((e) => e.t === "discard-tool" && e.p === 1 && e.uid === theirs));

  // Field Blower: the Stadium too.
  const vessel = hold(state, 1, U.vessel);
  state.stadium = { uid: vessel, owner: 1 };
  state.players[1].hand.splice(state.players[1].hand.indexOf(vessel), 1);
  act(state, { type: "play", player: 0, uid: hold(state, 0, IN_PLAY.blower) });
  assert.deepEqual(state.pending[0].uids.sort(), [mine, vessel].sort());
  act(state, { type: "choose", player: 0, uids: [vessel, mine] });
  assert.ok(!state.stadium && foe.discard.includes(vessel));
  assert.ok(!me.active.tool && me.discard.includes(mine));
  // HP a Tool gave is gone with it.
  const s2 = midgame();
  const cape = hold(s2, 0, TOOL.cape);
  act(s2, { type: "tool", player: 0, uid: cape, spot: ACTIVE });
  const caped = s2.players[0].active.uid;
  s2.players[0].active.damage = maxHp(s2, s2.players[0].active, defs) - 10;
  act(s2, { type: "play", player: 0, uid: hold(s2, 0, IN_PLAY.scrapper) });
  act(s2, { type: "choose", player: 0, uids: [cape] });
  assert.ok(s2.players[0].discard.includes(cape));
  assert.ok(s2.players[0].discard.includes(caped), "Knocked Out once the Tool's HP is gone");
});

test("Xerosic, Blowtorch, Ruffian: a Tool or a Special Energy; only theirs for Blowtorch; both from one Pokémon", () => {
  const state = midgame();
  const [me, foe] = state.players;
  const twin = (p, slot) => {
    const uid = `x${Object.keys(state.cards).length}`;
    state.cards[uid] = "swsh2-174";
    slot.energy.push(uid);
    return uid;
  };
  const myTwin = twin(0, me.active);
  const theirTwin = twin(1, foe.active);
  act(state, { type: "play", player: 0, uid: hold(state, 0, IN_PLAY.xerosic) });
  assert.deepEqual(state.pending[0].uids.sort(), [myTwin, theirTwin].sort());
  assert.equal(state.pending[0].min, 1);
  throws(() => act(state, { type: "choose", player: 0, uids: [] }), /Choose a card/);
  act(state, { type: "choose", player: 0, uids: [myTwin] });
  assert.ok(!me.active.energy.includes(myTwin) && me.discard.includes(myTwin));

  // Blowtorch: a Basic Fire Energy pays; only their cards are offered.
  give(state, 0, W);
  const torch = hold(state, 0, IN_PLAY.blowtorch);
  throws(() => act(state, { type: "play", player: 0, uid: torch }), /would do nothing/);
  const fire = hold(state, 0, F);
  act(state, { type: "play", player: 0, uid: torch });
  act(state, { type: "choose", player: 0, uids: [fire] });
  assert.deepEqual(state.pending[0].uids, [theirTwin]);
  act(state, { type: "choose", player: 0, uids: [theirTwin] });
  assert.ok(foe.discard.includes(theirTwin));

  // Ruffian: the Tool and a Special Energy from the one Pokémon chosen.
  const s2 = midgame();
  const foe2 = s2.players[1];
  const band = `x${Object.keys(s2.cards).length}`;
  s2.cards[band] = TOOL.band;
  foe2.active.tool = band;
  const t2 = `x${Object.keys(s2.cards).length}`;
  s2.cards[t2] = "swsh2-174";
  foe2.active.energy.push(t2);
  act(s2, { type: "play", player: 0, uid: hold(s2, 0, IN_PLAY.ruffian) });
  act(s2, { type: "pick", player: 0, spot: ACTIVE });
  assert.ok(!foe2.active.tool && foe2.discard.includes(band) && foe2.discard.includes(t2));
});

const STASH = {
  communication: labTrainer("communication", "Item", "Reveal a Pokémon from your hand and put it into your deck. If you do, search your deck for a Pokémon, reveal it, and put it into your hand. Then, shuffle your deck."),
};

test("cards from the hand into the deck: Pokémon Communication, Maintenance, Bebe's Search, Professor Oak's Visit", () => {
  const state = midgame();
  const me = state.players[0];
  me.deck.push(...me.hand.splice(0));
  const comm = hold(state, 0, STASH.communication);
  give(state, 0, W);
  throws(() => act(state, { type: "play", player: 0, uid: comm }), /would do nothing/);
  const squirtle = give(state, 0, "base1-63");
  act(state, { type: "play", player: 0, uid: comm });
  assert.deepEqual(state.pending[0].uids, [squirtle]);
  act(state, { type: "choose", player: 0, uids: [squirtle] });
  assert.ok(me.deck.includes(squirtle) && !me.hand.includes(squirtle));
  assert.equal(state.pending[0].effect.op, "toHand");
  assert.ok(state.pending[0].uids.every((u) => defs(state.cards[u]).kind === "pokemon"));
  act(state, { type: "choose", player: 0, uids: [state.pending[0].uids[0]] });
  assert.equal(state.pending.length, 0);

  // Maintenance: two other cards, or it can't be played.
  const s2 = midgame();
  const m2 = s2.players[0];
  m2.deck.push(...m2.hand.splice(0));
  const maint = hold(s2, 0, "xy3-96");
  give(s2, 0, W);
  assert.ok(!playable(s2, maint));
  const two = [m2.hand[1], give(s2, 0, W)];
  const deck = m2.deck.length;
  const events = act(s2, { type: "play", player: 0, uid: maint });
  assert.equal(s2.pending[0].min, 2);
  act(s2, { type: "choose", player: 0, uids: two });
  assert.equal(m2.deck.length, deck + 1);
  assert.equal(m2.hand.length, 1);
  assert.ok(!events.some((e) => e.t === "hand-to-deck"));

  // Bebe's Search: on top, then a search; Professor Oak's Visit: draw, then one to the bottom.
  const s3 = midgame();
  const m3 = s3.players[0];
  const bebe = hold(s3, 0, "dp2-109");
  const top = m3.hand.find((u) => u !== bebe);
  act(s3, { type: "play", player: 0, uid: bebe });
  const moved = act(s3, { type: "choose", player: 0, uids: [top] });
  assert.ok(moved.some((e) => e.t === "hand-to-deck" && e.at === "top"));
  assert.equal(s3.pending[0].effect.op, "toHand");
  act(s3, { type: "choose", player: 0, uids: [] });
  const oak = hold(s3, 0, "dp3-122");
  s3.players[0].supporterUsed = false;
  act(s3, { type: "play", player: 0, uid: oak });
  const last = m3.hand[0];
  act(s3, { type: "choose", player: 0, uids: [last] });
  assert.equal(m3.deck[m3.deck.length - 1], last);
});

test("the new Trainer ops have an aim the bot and the deck builder read", () => {
  assert.equal(trainerAim(defs(CANDY).fx), "evolve");
  assert.equal(trainerAim(defs(EVOSODA).fx), "search");
  assert.equal(trainerAim(defs(IN_PLAY.scrapper).fx), "tools");
  assert.equal(trainerAim(defs(IN_PLAY.blowtorch).fx), "tools");
  assert.equal(trainerAim(defs(IN_PLAY.ruffian).fx), "hammer");
  assert.equal(trainerAim(defs("xy3-96").fx), "stash");
  assert.equal(trainerAim(defs("swsh1-157").fx), "energize");
});

test("Energy from the hand or the discard pile onto a Pokémon the card names: Bede, Dark Patch, Welder, Raihan", () => {
  // Bede: a basic Energy from the hand, which one is the player's call, onto a Benched Pokémon only.
  const state = midgame();
  const me = state.players[0];
  me.hand = me.hand.filter((u) => defs(state.cards[u]).kind !== "energy");
  const bede = hold(state, 0, "swsh1-157");
  assert.ok(!playable(state, bede), "no Energy in hand");
  const water = give(state, 0, W);
  const grass = give(state, 0, G);
  const used = me.energyUsed;
  act(state, { type: "play", player: 0, uid: bede });
  assert.deepEqual(state.pending[0].uids.sort(), [water, grass].sort());
  act(state, { type: "choose", player: 0, uids: [grass] });
  assert.deepEqual(state.pending[0].spots, [0]);
  act(state, { type: "pick", player: 0, spot: 0 });
  assert.ok(me.bench[0].energy.includes(grass) && me.hand.includes(water));
  assert.equal(me.energyUsed, used, "not the Energy of the turn");

  // Dark Patch: a Darkness Energy only, onto a Benched Darkness Pokémon only.
  const s2 = midgame();
  s2.players[0].discard.push(hold(s2, 0, "energy-darkness"));
  s2.players[0].hand.pop();
  assert.ok(!playable(s2, hold(s2, 0, "bw5-93")), "no Darkness Pokémon on the Bench");

  // Welder: up to 2 Fire Energy, and the draw only if any were attached.
  const s3 = midgame();
  const m3 = s3.players[0];
  m3.hand = m3.hand.filter((u) => defs(s3.cards[u]).kind !== "energy");
  const fires = [hold(s3, 0, F), hold(s3, 0, F)];
  act(s3, { type: "play", player: 0, uid: hold(s3, 0, "sm10-189") });
  assert.equal(s3.pending[0].max, 2);
  const hand = m3.hand.length;
  act(s3, { type: "choose", player: 0, uids: [] });
  assert.equal(s3.pending.length, 0);
  assert.equal(m3.hand.length, hand, "none attached: no cards drawn");
  s3.players[0].supporterUsed = false;
  act(s3, { type: "play", player: 0, uid: hold(s3, 0, "sm10-189") });
  act(s3, { type: "choose", player: 0, uids: fires });
  act(s3, { type: "pick", player: 0, spot: ACTIVE });
  assert.ok(fires.every((u) => m3.active.energy.includes(u)));
  assert.equal(m3.hand.length, hand - 2 + 3);

  // Raihan: only after a Knock Out last turn, from the discard pile, then a search.
  const s4 = midgame();
  const m4 = s4.players[0];
  m4.discard.push(hold(s4, 0, W));
  m4.hand.pop();
  const raihan = hold(s4, 0, "swsh7-152");
  assert.ok(!playable(s4, raihan));
  m4.lostOn = [s4.turn - 1];
  act(s4, { type: "play", player: 0, uid: raihan });
  act(s4, { type: "choose", player: 0, uids: [s4.pending[0].uids[0]] });
  act(s4, { type: "pick", player: 0, spot: ACTIVE });
  assert.equal(s4.pending[0].effect.op, "toHand");
  assert.equal(s4.pending[0].zone, "deck");
});

/* ---------- the pre-made decks' Items and Supporters ---------- */

const PM = {
  kukui: "sm1-128", timer: "sm1-134", stretcher: "sm2-130", rope: "sm3-114", sonia: "swsh2-167", malasada: "sm1-114",
  plusOld: "base1-84", plusDp: "dp1-109", defender: "base1-80", superOld: "base1-90", elm: "neo1-96", fieldworker: "ex12-73",
  retrieval: "base1-81", milk: "neo1-101", kahili: "sm8-179", hint: "xy12-84", quick: "dp5-86", nav: "ex1-88", rod: "swsh1-171",
  bug: "sm11-189", luxury: "dp7-86", misty: "gym1-102", egg: "pgo-66",
};
const deckUid = (state, p, kind) => state.players[p].deck.find((uid) => defs(state.cards[uid]).kind === kind);

test("pre-made decks: the Items and Supporters are read", () => {
  for (const [key, id] of Object.entries(PM)) assert.ok(defs(id).playable, `${key} ${id}`);
  assert.equal(trainerAim(defs(PM.kukui).fx), "draw");
  assert.equal(trainerAim(defs(PM.stretcher).fx), "recover");
  // Unread on purpose: Snorlax Doll, which is only put down while setting up.
  assert.ok(!defs("sv4-175").playable);
});

test("Professor Kukui: 2 cards and 20 more damage this turn only; no Supporter on the first turn of the match", () => {
  const state = labgame("lab-2", "lab-2");
  const hand = state.players[0].hand.length;
  act(state, { type: "play", player: 0, uid: hold(state, 0, PM.kukui) });
  assert.equal(state.players[0].hand.length, hand + 2);
  assert.ok(state.players[0].supporterUsed);
  use(state, 0, "Pierce");
  assert.equal(state.players[1].active.damage, 70);
  act(state, { type: "end", player: 1 });
  state.players[1].active.damage = 0;
  use(state, 0, "Pierce");
  assert.equal(state.players[1].active.damage, 50, "the next turn it is gone");
  const fresh = started();
  throws(() => act(fresh, { type: "play", player: fresh.current, uid: hold(fresh, fresh.current, PM.kukui) }), /first turn/);
});

test("Timer Ball and Bug Catcher: a search or a draw for each heads", () => {
  const state = midgame();
  const me = state.players[0];
  stock(state, 0, "base1-24");
  stock(state, 0, "base1-24");
  rigFlips(state, [true, true]);
  let events = act(state, { type: "play", player: 0, uid: hold(state, 0, PM.timer) });
  assert.deepEqual(events.find((e) => e.t === "flip").results, [true, true]);
  assert.equal(state.pending[0].what, "evolution");
  assert.equal(state.pending[0].max, 2);
  act(state, { type: "choose", player: 0, uids: state.pending[0].uids });
  assert.equal(me.hand.filter((u) => state.cards[u] === "base1-24").length, 2);
  // Two tails: no search, the deck stays as it was.
  const order = me.deck.slice();
  rigFlips(state, [false, false]);
  act(state, { type: "play", player: 0, uid: hold(state, 0, PM.timer) });
  assert.equal(state.pending.length, 0);
  assert.deepEqual(me.deck, order);
  // Bug Catcher: 2 cards, then 2 more on heads (two sentences read one after the other).
  assert.deepEqual(defs(PM.bug).fx.map((s) => s.op), ["draw", "flip"]);
  const hand = me.hand.length;
  rigFlips(state, [true]);
  act(state, { type: "play", player: 0, uid: hold(state, 0, PM.bug) });
  assert.equal(me.hand.length, hand + 4);
});

test("Choose 1: Rescue Stretcher offers what can be done; Ordinary Rod offers both; the bot answers", () => {
  const state = midgame();
  const me = state.players[0];
  const stretcher = hold(state, 0, PM.stretcher);
  assert.ok(!playable(state, stretcher), "no Pokémon in the discard pile");
  const mon = me.deck.splice(me.deck.findIndex((u) => defs(state.cards[u]).kind === "pokemon"), 1)[0];
  me.discard.push(mon);
  act(state, { type: "play", player: 0, uid: stretcher });
  assert.equal(state.pending[0].type, "option");
  assert.equal(state.pending[0].labels.length, 2);
  assert.deepEqual(legalActions(state, 0, defs).map((a) => a.index), [0, 1]);
  throws(() => act(state, { type: "option", player: 0, index: 5 }), /one of the options/);
  throws(() => act(state, { type: "end", player: 0 }), /Waiting for a choice/);
  assert.equal(botAction(state, 0, defs).type, "option");
  act(state, { type: "option", player: 0, index: 0 });
  assert.equal(state.pending[0].zone, "discard");
  act(state, { type: "choose", player: 0, uids: [mon] });
  assert.ok(me.hand.includes(mon));
  // Ordinary Rod: a Pokémon and a basic Energy in the discard pile, so either or both.
  me.discard.push(me.hand.splice(me.hand.indexOf(mon), 1)[0], me.deck.splice(me.deck.findIndex((u) => defs(state.cards[u]).kind === "energy"), 1)[0]);
  act(state, { type: "play", player: 0, uid: hold(state, 0, PM.rod) });
  assert.deepEqual(state.pending[0].labels.slice(-1), ["Both"]);
  const deck = me.deck.length;
  act(state, { type: "option", player: 0, index: 2 });
  act(state, { type: "choose", player: 0, uids: state.pending[0].uids });
  act(state, { type: "choose", player: 0, uids: state.pending[0].uids });
  assert.equal(me.deck.length, deck + 2);
});

test("Escape Rope: the opponent switches first, then you", () => {
  const state = midgame();
  const [me, foe] = state.players;
  const [mine, theirs] = [me.active.uid, foe.active.uid];
  act(state, { type: "play", player: 0, uid: hold(state, 0, PM.rope) });
  assert.equal(state.pending[0].player, 1);
  act(state, { type: "pick", player: 1, spot: 0 });
  assert.equal(state.pending[0].player, 0);
  act(state, { type: "pick", player: 0, spot: 0 });
  assert.equal(foe.bench[0].uid, theirs);
  assert.equal(me.bench[0].uid, mine);
});

test("Sonia: up to two Basic Pokémon or up to two basic Energy, never one of each; the bot keeps to it", () => {
  const state = midgame();
  act(state, { type: "play", player: 0, uid: hold(state, 0, PM.sonia) });
  const waiting = state.pending[0];
  const mon = waiting.uids.find((u) => defs(state.cards[u]).kind === "pokemon");
  const energy = waiting.uids.filter((u) => defs(state.cards[u]).kind === "energy");
  throws(() => act(state, { type: "choose", player: 0, uids: [mon, energy[0]] }), /one kind/);
  const answer = botAction(state, 0, defs);
  assert.equal(new Set(answer.uids.map((u) => defs(state.cards[u]).kind)).size, 1);
  act(state, { type: "choose", player: 0, uids: energy.slice(0, 2) });
  assert.ok(energy.slice(0, 2).every((u) => state.players[0].hand.includes(u)));
});

test("Big Malasada: 20 healed, and the player chooses which Special Condition goes", () => {
  const state = midgame();
  const me = state.players[0];
  me.active.damage = 30;
  addCondition(state, me.active, "asleep");
  addCondition(state, me.active, "poisoned");
  act(state, { type: "play", player: 0, uid: hold(state, 0, PM.malasada) });
  assert.equal(me.active.damage, 10);
  assert.deepEqual(state.pending[0].labels, ["Asleep", "Poisoned"]);
  act(state, { type: "option", player: 0, index: 1 });
  assert.deepEqual(conditionsOn(me.active), ["asleep"]);
});

test("old PlusPower: on the Active Pokémon until the end of the turn, 10 more after Weakness and Resistance, only if it does damage", () => {
  const state = labgame("lab-2", "lab-2");
  const me = state.players[0];
  const card = hold(state, 0, PM.plusOld);
  act(state, { type: "play", player: 0, uid: card });
  assert.deepEqual(state.pending[0].spots, [ACTIVE]);
  act(state, { type: "pick", player: 0, spot: ACTIVE });
  assert.ok(me.active.held.some((h) => h.uid === card) && !me.discard.includes(card));
  use(state, 0, "Pierce");
  assert.equal(state.players[1].active.damage, 60);
  assert.ok(me.discard.includes(card) && !me.active.held.length, "discarded at the end of the turn");
  // An attack that does no damage gets nothing from it.
  const s2 = labgame("lab-2", "lab-2");
  act(s2, { type: "play", player: 0, uid: hold(s2, 0, PM.plusOld) });
  act(s2, { type: "pick", player: 0, spot: ACTIVE });
  rigFlips(s2, [false]);
  use(s2, 0, "Hide");
  assert.equal(s2.players[1].active.damage, 0);
  // Diamond & Pearl PlusPower: any of your Pokémon, before Weakness and Resistance.
  assert.deepEqual(defs(PM.plusDp).fx[0].mod, { plus: 10 });
});

test("Defender: 20 less damage until the end of the opponent's next turn, then discarded", () => {
  const state = labgame("lab-1", "lab-3");
  const me = state.players[0];
  const card = hold(state, 0, PM.defender);
  act(state, { type: "play", player: 0, uid: card });
  act(state, { type: "pick", player: 0, spot: ACTIVE });
  act(state, { type: "end", player: 0 });
  assert.ok(me.active.held.length, "still on through the opponent's turn");
  use(state, 1, "Follow");
  assert.equal(me.active.damage, 0);
  assert.ok(me.discard.includes(card));
});

test("Base Set Super Potion: the player chooses the Energy to discard, then 40 damage is healed", () => {
  const state = midgame();
  const me = state.players[0];
  me.active.energy = [give(state, 0, W), give(state, 0, G)];
  me.bench[0].damage = 30;
  const potion = hold(state, 0, PM.superOld);
  assert.ok(!playable(state, potion), "the hurt Pokémon has no Energy to pay with");
  me.active.damage = 50;
  act(state, { type: "play", player: 0, uid: potion });
  assert.deepEqual(state.pending[0].spots, [ACTIVE]);
  act(state, { type: "pick", player: 0, spot: ACTIVE });
  const grass = me.active.energy.find((u) => state.cards[u] === G);
  act(state, { type: "choose", player: 0, uids: [grass] });
  assert.equal(me.active.damage, 10);
  assert.ok(me.discard.includes(grass) && me.active.energy.length === 1);
});

test("Professor Elm, Professor Oak's Hint: no more Trainers this turn; the turn ends", () => {
  const state = midgame();
  const me = state.players[0];
  me.active.damage = 30;
  act(state, { type: "play", player: 0, uid: hold(state, 0, PM.elm) });
  assert.equal(me.hand.length, 7);
  throws(() => act(state, { type: "play", player: 0, uid: hold(state, 0, T.potion) }), /any more Trainer/);
  act(state, { type: "end", player: 0 });
  act(state, { type: "end", player: 1 });
  me.hand.splice(3);
  act(state, { type: "play", player: 0, uid: hold(state, 0, PM.hint) });
  assert.equal(me.hand.length, 7);
  assert.equal(state.current, 1);
});

test("Fieldworker: the opponent chooses whether to draw; Energy Retrieval can't take back the card paid", () => {
  const state = midgame();
  const [me, foe] = state.players;
  const hand = foe.hand.length;
  act(state, { type: "play", player: 0, uid: hold(state, 0, PM.fieldworker) });
  assert.equal(state.pending[0].player, 1);
  assert.deepEqual(state.pending[0].labels, ["Draw 1", "Don't draw"]);
  act(state, { type: "option", player: 1, index: 0 });
  assert.equal(foe.hand.length, hand + 1);

  const s2 = midgame();
  const m2 = s2.players[0];
  m2.discard.push(m2.deck.splice(m2.deck.findIndex((u) => s2.cards[u] === W), 1)[0]);
  const paid = give(s2, 0, W);
  act(s2, { type: "play", player: 0, uid: hold(s2, 0, PM.retrieval) });
  act(s2, { type: "choose", player: 0, uids: [paid] });
  assert.ok(!s2.pending[0].uids.includes(paid));
  assert.equal(s2.pending[0].uids.length, 1);
});

test("Moo-Moo Milk: the Pokémon is chosen, then 2 coins; Kahili comes back on heads", () => {
  const state = midgame();
  const me = state.players[0];
  me.active.damage = 60;
  act(state, { type: "play", player: 0, uid: hold(state, 0, PM.milk) });
  rigFlips(state, [true, true]);
  act(state, { type: "pick", player: 0, spot: ACTIVE });
  assert.equal(me.active.damage, 20);

  const kahili = hold(state, 0, PM.kahili);
  rigFlips(state, [true]);
  act(state, { type: "play", player: 0, uid: kahili });
  assert.ok(me.hand.includes(kahili) && !me.discard.includes(kahili));
  assert.ok(me.supporterUsed);
});

test("Quick Ball takes the first Pokémon; PokéNav puts the other two back in the order chosen; Luxury Ball once in the discard pile", () => {
  const state = midgame();
  const me = state.players[0];
  const first = me.deck.find((u) => defs(state.cards[u]).kind === "pokemon");
  act(state, { type: "play", player: 0, uid: hold(state, 0, PM.quick) });
  assert.ok(me.hand.includes(first));

  const top = me.deck.slice(0, 3);
  act(state, { type: "play", player: 0, uid: hold(state, 0, PM.nav) });
  const take = state.pending[0].uids[0];
  act(state, { type: "choose", player: 0, uids: take ? [take] : [] });
  const rest = top.filter((u) => u !== take).slice(0, 2).reverse();
  assert.equal(state.pending[0].effect.op, "order");
  act(state, { type: "choose", player: 0, uids: rest });
  assert.deepEqual(me.deck.slice(0, 2), rest);

  const lux = hold(state, 0, PM.luxury);
  assert.ok(playable(state, lux));
  me.discard.push(hold(state, 0, PM.luxury));
  me.hand.pop();
  assert.ok(!playable(state, lux), "a Luxury Ball is in the discard pile");
});

test("Misty: 20 more after Weakness and Resistance, only for a Pokémon with Misty in its name", () => {
  const steps = defs(PM.misty).fx;
  assert.deepEqual(steps.map((s) => s.op), ["cost", "boost"]);
  const state = labgame("lab-2", "lab-2");
  state.players[0].hand.push(hold(state, 0, T.draw), hold(state, 0, T.draw));
  act(state, { type: "play", player: 0, uid: hold(state, 0, PM.misty) });
  act(state, { type: "choose", player: 0, uids: state.pending[0].uids.slice(0, 2) });
  use(state, 0, "Pierce");
  assert.equal(state.players[1].active.damage, 50, "Lab has no Misty in its name");
  assert.deepEqual(steps[1], { op: "boost", n: 20, after: true, who: { named: "Misty" } });
});

test("the bot plays the pre-made decks through, every Trainer in them read", () => {
  for (const e of BASIC_ENERGY) if (!byId.has(e.id)) byId.set(e.id, e);
  const products = JSON.parse(readFileSync("data/products.json", "utf8"));
  const box = JSON.parse(readFileSync("data/box-contents.json", "utf8"));
  const lists = [];
  for (const [set, list] of Object.entries(products)) {
    if (!Array.isArray(list)) continue;
    for (const o of list) {
      const entry = box[`${set}/${o.id}`];
      if (o.kind !== "deck" || /trainer kit/i.test(o.name) || !entry) continue;
      // The deck's own promo card makes the 60th, as the shop opens it.
      const promos = (o.promos || []).slice(0, 1).map((p) => (Array.isArray(p) ? p[0] : String(p))).map((p) => (p.includes("-") && byId.has(p) ? p : `${set}-${p}`));
      const ids = [...promos, ...boxCardList(entry, promos, () => 0).flatMap(({ id, n }) => Array(n).fill(id))];
      if (ids.length === 60 && ids.every((id) => defs(id)?.playable)) lists.push(ids);
    }
  }
  assert.ok(lists.length >= 60, `only ${lists.length} pre-made decks are playable`);
  for (let i = 0; i + 1 < lists.length; i += 2) assert.equal(playOut([lists[i], lists[i + 1]], "standard", 500 + i).phase, "over");
});

/* ---------- the pre-made decks' Tools, Stadiums, Special Energy and Pokémon ---------- */

lab("lab-tap", [["Tap", 10, ""]]);
/** A match where player 0's Lab Pokémon attacks player 1's, each with a Tool from the card pool, if given. */
function tooled(mine, theirs, attacker = "lab-9", defender = "lab-2") {
  const state = labgame(attacker, defender);
  if (mine) state.players[0].active.tool = hold(state, 0, mine);
  if (theirs) state.players[1].active.tool = hold(state, 1, theirs);
  state.players[0].hand = state.players[0].hand.filter((u) => u !== state.players[0].active.tool);
  state.players[1].hand = state.players[1].hand.filter((u) => u !== state.players[1].active.tool);
  return state;
}

test("theme deck Tools: what they do as their Pokémon is Knocked Out", () => {
  // Rescue Scarf: the Pokémon back to the hand, the rest to the discard pile.
  let state = tooled(null, "bw6-115");
  let foe = state.players[1];
  let front = foe.active.uid;
  let tool = foe.active.tool;
  use(state, 0, "Smash");
  assert.ok(foe.hand.includes(front) && foe.discard.includes(tool));

  // Expert Belt: one more Prize card.
  state = tooled(null, "pl4-87");
  const prizes = state.players[0].prizes.length;
  use(state, 0, "Smash");
  assert.equal(state.players[0].prizes.length, prizes - 2);

  // Energy Pouch: the basic Energy to the hand.
  state = tooled(null, "xy10-97");
  foe = state.players[1];
  const energy = [hold(state, 1, W), hold(state, 1, W)];
  foe.hand = foe.hand.filter((u) => !energy.includes(u));
  foe.active.energy.push(...energy);
  use(state, 0, "Smash");
  assert.ok(energy.every((u) => foe.hand.includes(u)));

  // Lucky Egg: draw up to 7.
  state = tooled(null, "pl4-88");
  state.players[1].hand.splice(3);
  use(state, 0, "Smash");
  assert.equal(state.players[1].hand.length, 7);
});

test("theme deck Tools: Exp. Share and Wishful Baton move the Energy left behind", () => {
  let state = labgame("lab-9", "lab-2");
  let foe = state.players[1];
  foe.bench[0].tool = hold(state, 1, "sm1-118");
  foe.hand.pop();
  let energy = [hold(state, 1, W), hold(state, 1, F)];
  foe.hand = foe.hand.filter((u) => !energy.includes(u));
  foe.active.energy.push(...energy);
  use(state, 0, "Smash");
  assert.equal(state.pending[0].type, "choose");
  assert.equal(state.pending[0].player, 1);
  assert.equal(state.pending[0].max, 1);
  assert.deepEqual(legalActions(state, 0, defs), [], "the other player waits");
  act(state, { type: "choose", player: 1, uids: [energy[1]] });
  assert.ok(foe.bench[0].energy.includes(energy[1]) && foe.discard.includes(energy[0]));
  assert.equal(state.pending[0].type, "promote");

  // Wishful Baton: up to 3 to the Benched Pokémon picked, then the new Active Pokémon.
  state = tooled(null, "sm3-128");
  foe = state.players[1];
  energy = [hold(state, 1, W), hold(state, 1, W), hold(state, 1, W), hold(state, 1, F)];
  foe.hand = foe.hand.filter((u) => !energy.includes(u));
  foe.active.energy.push(...energy);
  use(state, 0, "Smash");
  assert.equal(state.pending[0].max, 3);
  act(state, { type: "choose", player: 1, uids: energy.slice(0, 3) });
  assert.equal(state.pending[0].type, "pick");
  act(state, { type: "pick", player: 1, spot: 0 });
  assert.ok(energy.slice(0, 3).every((u) => foe.bench[0].energy.includes(u)));
  assert.equal(state.pending[0].type, "promote");
  // The bot gets through the same choices.
  state = tooled(null, "sm3-128");
  state.players[1].active.energy.push(hold(state, 1, W));
  use(state, 0, "Smash");
  for (let i = 0; i < 5 && state.pending.length; i += 1) act(state, botAction(state, state.pending[0].player, defs));
  assert.ok(!state.pending.length && state.players[1].active);
});

test("theme deck Tools: hitting back, the end of the turn, between turns", () => {
  // Rocky Helmet: 2 damage counters on the attacker. Lucky Helmet: 2 cards.
  let state = tooled(null, "bw3-94", "lab-tap");
  use(state, 0, "Tap");
  assert.equal(state.players[0].active.damage, 20);
  state = tooled(null, "xy7-77", "lab-tap");
  let hand = state.players[1].hand.length;
  use(state, 0, "Tap");
  assert.equal(state.players[1].hand.length, hand + 2 + 1, "2 from the Helmet, 1 for the turn");

  // Amulet Coin and Leftovers at the end of their owner's turn, while Active.
  state = tooled("dp4-97", null);
  hand = state.players[0].hand.length;
  act(state, { type: "end", player: 0 });
  assert.equal(state.players[0].hand.length, hand + 1);
  state = tooled("dp4-99", null);
  state.players[0].active.damage = 30;
  act(state, { type: "end", player: 0 });
  assert.equal(state.players[0].active.damage, 20);

  // Oran Berry between turns: 2 counters off, then it is gone. Lum Berry: the conditions, before Poison lands.
  state = tooled("ex9-80", null);
  let me = state.players[0];
  me.active.damage = 30;
  const berry = me.active.tool;
  act(state, { type: "end", player: 0 });
  assert.equal(me.active.damage, 10);
  assert.ok(!me.active.tool && me.discard.includes(berry));
  state = tooled("ex1-84", null);
  me = state.players[0];
  addCondition(state, me.active, "poisoned");
  act(state, { type: "end", player: 0 });
  assert.equal(me.active.damage, 0);
  assert.deepEqual(conditionsOn(me.active), []);

  // Buffer Piece: 20 less, through the opponent's next turn only. Strength Charm: 10 more, gone after it attacks.
  state = labgame("lab-tap", "lab-tap");
  me = state.players[0];
  act(state, { type: "tool", player: 0, uid: hold(state, 0, "ex15-72"), spot: ACTIVE });
  act(state, { type: "end", player: 0 });
  use(state, 1, "Tap");
  assert.equal(me.active.damage, 0);
  assert.ok(!me.active.tool, "discarded at the end of that turn");
  act(state, { type: "tool", player: 0, uid: hold(state, 0, "ex8-92"), spot: ACTIVE });
  use(state, 0, "Tap");
  assert.equal(state.players[1].active.damage, 20);
  assert.ok(!me.active.tool);
});

test("theme deck Tools: retreating, who they fit, where they go", () => {
  // Escape Board: retreat while Asleep. Balloon Berry pays the Retreat Cost by itself.
  let state = tooled("sm5-122", null);
  let me = state.players[0];
  addCondition(state, me.active, "asleep");
  assert.ok(canRetreat(state, 0, defs));
  me.active.tool = null;
  assert.ok(!canRetreat(state, 0, defs));
  state = labgame("base1-46", "lab-2");
  me = state.players[0];
  me.active.energy = [];
  assert.ok(!canRetreat(state, 0, defs));
  me.active.tool = hold(state, 0, "ex3-82");
  me.hand.pop();
  assert.ok(canRetreat(state, 0, defs));
  act(state, { type: "retreat", player: 0, to: 0 });
  assert.ok(!me.bench[0].tool && me.discard.includes(state.players[0].discard.at(-1)));

  // Fighting Fury Belt and Eviolite only on a Basic Pokémon; Protective Orb only on an Evolved one.
  state = labgame("base1-46", "lab-2");
  me = state.players[0];
  const hp = maxHp(state, me.active, defs);
  me.active.tool = hold(state, 0, "xy9-99");
  assert.equal(maxHp(state, me.active, defs), hp + 40);
  state.cards[me.active.uid] = "base1-24";
  assert.equal(maxHp(state, me.active, defs), defs("base1-24").hp, "Charmeleon isn't Basic");
  me.active.tool = null;
  const orb = hold(state, 0, "ex10-90");
  assert.ok(legalActions(state, 0, defs).some((a) => a.type === "tool" && a.uid === orb && a.spot === ACTIVE));
  assert.ok(!legalActions(state, 0, defs).some((a) => a.type === "tool" && a.uid === orb && a.spot !== ACTIVE), "the Bench holds Basic Pokémon");

  // U-Turn Board goes back to the hand; Healing Scarf heals as Energy goes on.
  state = tooled(null, "sm11-211");
  const board = state.players[1].active.tool;
  use(state, 0, "Smash");
  assert.ok(state.players[1].hand.includes(board));
  state = tooled("xy6-84", null);
  state.players[0].active.damage = 30;
  state.players[0].energyUsed = false;
  act(state, { type: "attach", player: 0, uid: hold(state, 0, W), spot: ACTIVE });
  assert.equal(state.players[0].active.damage, 10);
});

test("theme deck Stadiums: standing rules and once-a-turn uses", () => {
  const state = midgame();
  const [me, foe] = state.players;
  const play = (id) => {
    me.stadiumPlayed = false;
    me.stadiumUsed = false;
    act(state, { type: "play", player: 0, uid: hold(state, 0, id) });
  };
  // Altar of the Sunne: Fire Pokémon have no Weakness. Fairy Garden: no Retreat Cost with Fairy Energy.
  play("sm2-118");
  assert.ok(toolOf(state, foe.active, defs).noWeakness, "Charmander is Fire");
  assert.ok(!toolOf(state, me.active, defs).noWeakness);
  play("xy1-117");
  assert.ok(retreatCost(state, foe.active, defs) > 0);
  foe.active.energy.push(hold(state, 1, "energy-fairy-xy"));
  foe.hand.pop();
  assert.equal(retreatCost(state, foe.active, defs), 0);
  // Pewter City Gym: Brock's Pokémon pierce Resistance; Team Aqua's Hideout: 1 more to retreat.
  play("gym1-115");
  state.cards[me.active.uid] = "gym1-21";
  assert.ok(toolOf(state, me.active, defs).pierce);
  play("ex4-78");
  assert.equal(retreatCost(state, me.active, defs), defs("gym1-21").retreat + 1);
  state.cards[me.active.uid] = "base1-63";
  // Risky Ruins: a Basic non-Darkness Pokémon benched during its owner's turn takes 2 counters.
  play("me1-127");
  act(state, { type: "bench", player: 0, uid: give(state, 0, "base1-63") });
  assert.equal(me.bench.at(-1).damage, 20);
  // Pokémon Center: 20 off one Benched Pokémon.
  play("bw4-90");
  act(state, { type: "stadium", player: 0 });
  assert.equal(state.pending[0].effect.op, "heal");
  act(state, { type: "pick", player: 0, spot: me.bench.length - 1 });
  assert.equal(me.bench.at(-1).damage, 0);
  // Brooklet Hill: a Basic Water Pokémon from the deck onto the Bench.
  play("sm2-120");
  const room = me.bench.length;
  act(state, { type: "stadium", player: 0 });
  act(state, { type: "choose", player: 0, uids: [state.pending[0].uids[0]] });
  assert.equal(me.bench.length, room + 1);
  // Saffron City Gym and Fuchsia City Gym cost their player's own cards: the bot leaves them be.
  assert.ok(defs("gym2-122").stadium.often && defs("gym2-122").stadium.loss && defs("gym2-114").stadium.loss);
  // Viridian City Gym: Giovanni's Pokémon shed 2 counters as they evolve.
  assert.deepEqual(defs("gym2-123").stadium.evolveHeal, { n: 20, who: { named: "Giovanni" } });
});

test("theme deck Special Energy and Pokémon: Double Dragon, Multi Energy, Elekid and the Baby rule, Houndoom ex", () => {
  const state = midgame();
  const me = state.players[0];
  me.energyUsed = false;
  const dde = hold(state, 0, "xy6-97");
  throws(() => act(state, { type: "attach", player: 0, uid: dde, spot: ACTIVE }), /Dragon/);
  state.cards[me.active.uid] = "xy6-49";
  me.active.energy = [];
  act(state, { type: "attach", player: 0, uid: dde, spot: ACTIVE });
  assert.deepEqual(energyOf(state, me.active, defs), ["Any", "Any"]);
  // Multi Energy: every type alone, Colorless beside another Special Energy.
  me.active.energy = [hold(state, 0, "ex2-93")];
  assert.deepEqual(energyOf(state, me.active, defs), ["Any"]);
  me.active.energy.push(dde);
  assert.deepEqual(energyOf(state, me.active, defs), ["Colorless", "Any", "Any"]);

  // Elekid has no attack, but its Pokémon Power: heads, 20 to their Active Pokémon (Weakness counts); either way the turn ends.
  assert.ok(defs("neo1-22").playable && defs("neo1-22").baby);
  assert.ok(defs("svp-svp103").playable, "Houndoom ex has its play data");
  state.cards[me.active.uid] = "neo1-22";
  const foe = state.players[1];
  rigFlips(state, [true]);
  act(state, { type: "ability", player: 0, spot: ACTIVE });
  assert.equal(foe.active.damage, 20);
  assert.equal(state.current, 1, "the turn is over");

  // The Baby rule: attacking an Active Baby Pokémon takes a coin flip first; tails, no attack and the turn ends.
  const s2 = labgame("lab-tap", "neo1-22");
  rigFlips(s2, [false]);
  const events = use(s2, 0, "Tap");
  assert.ok(events.some((e) => e.t === "miss"));
  assert.equal(s2.players[1].active.damage, 0);
  assert.equal(s2.current, 1);
});

test("the bot plays through decks full of the theme decks' Tools, Stadiums and Special Energy", () => {
  const tools = ["sm5-122", "sm3-128", "sm1-118", "dp4-97", "xy10-97", "xy6-84", "xy7-77", "xy9-99", "bw6-115", "dp4-99", "neo1-99", "ex15-72", "pl4-87", "pl4-88", "sm11-211", "bw3-91", "bw3-94", "neo4-97", "ex9-80", "ex10-85", "ex10-90", "ex8-92", "ex1-84", "ex3-82"];
  const stadiums = ["sm2-120", "me1-127", "me1-122", "sm2-118", "sm2-117", "xy1-117", "xy5-137", "xy5-138", "bw4-90", "hgss3-71", "gym1-107", "gym2-122", "gym2-114", "neo4-99", "ex12-76", "ex12-77", "ex16-82", "ex4-83", "ex4-78"];
  for (const id of [...tools, ...stadiums, "xy6-97", "ex2-93", "neo1-22"]) assert.ok(defs(id).playable, id);
  const reasons = {};
  for (let i = 0; i < 24; i += 1) {
    const extra = (k) => [tools[(i + k) % tools.length], tools[(i + k + 7) % tools.length], stadiums[(i + k) % stadiums.length], "ex2-93"];
    const a = deckOf(["base1-46", 9], ["base1-24", 4], ["base1-4", 1], ["neo1-22", 1], [F, 11], ...extra(0).map((id) => [id, 1]));
    const b = deckOf(["base1-63", 12], ["base1-44", 2], [W, 12], ...extra(3).map((id) => [id, 1]));
    const end = playOut([a, b], "half", 500 + i);
    reasons[end.reason] = (reasons[end.reason] || 0) + 1;
  }
  assert.ok(Object.keys(reasons).length);
});

/* ---------- how much damage: counts, coins, and changes that last into the next turn ---------- */

// A Water stand-in, so Charmander (base1-46: 50 HP, Water ×2) shows where Weakness comes in.
const labW = (id, attacks) => byId.set(id, { id, name: "Lab Wave", supertype: "Pokémon", subtypes: ["Basic"], types: ["Water"], hp: "200", attacks: attacks.map(([name, damage, text, cost = []]) => ({ name, cost, damage: String(damage), text })) });
labW("lab-dmg-1", [
  ["Growl", 0, "During your opponent's next turn, any damage done by attacks from the Defending Pokémon is reduced by 20 (before applying Weakness and Resistance)."],
  ["Granite", 0, "During your opponent's next turn, any damage done to Lab Wave by attacks is reduced by 20 (after applying Weakness and Resistance)."],
  ["Splash", 30, ""],
  ["Glare", 0, "During your next turn, the Defending Pokémon takes 30 more damage from attacks (after applying Weakness and Resistance)."],
]);
labW("lab-dmg-2", [
  ["Echo", 20, "During your next turn, this Pokémon's Echo attack does 50 more damage (before applying Weakness and Resistance)."],
  ["Tap", 10, ""],
  ["Spin", 20, "Flip a coin until you get tails. This attack does 10 more damage for each heads."],
  ["Thunder", 40, "Flip a coin. If tails, Lab Wave does 10 damage to itself."],
]);
labW("lab-dmg-3", [
  ["Water Gun", 10, "Does 10 damage plus 10 more damage for each Water Energy attached to Lab Wave but not used to pay for this attack's Energy cost. You can't add more than 20 damage in this way.", ["Water", "Colorless"]],
  ["Rout", 10, "This attack does 20 more damage for each of your opponent's Benched Pokémon."],
  ["Knot", 0, "This attack does 30 damage for each Colorless in your opponent's Active Pokémon's Retreat Cost."],
  ["Drain", 30, "Heal from this Pokémon the same amount of damage you did to your opponent's Active Pokémon."],
]);
labW("lab-dmg-4", [
  ["Harden", 0, "During your opponent's next turn, if this Pokémon would be damaged by an attack, prevent that attack's damage done to this Pokémon if that damage is 30 or less."],
  ["Balloon", 0, "During your opponent's next turn, prevent all damage done to this Pokémon by attacks from Basic Pokémon."],
  ["Cutter", 10, "Flip 3 coins. If 1 of them is heads, this attack does 10 damage plus 10 more damage. If 2 of them are heads, this attack does 10 damage plus 20 more damage. If all of them are heads, this attack does 10 damage plus 40 more damage."],
  ["Fly", 30, "Flip a coin. If tails, this attack does nothing. If heads, prevent all effects of attacks, including damage, done to this Pokémon during your opponent's next turn."],
  ["Fang", 20, "If your opponent's Active Pokémon is a Pokémon ex, this attack does 60 more damage."],
]);

test("damage wordings: the lab cards are read, and old cards' own names read as this Pokémon", () => {
  for (const id of ["lab-dmg-1", "lab-dmg-2", "lab-dmg-3", "lab-dmg-4"]) for (const a of defs(id).attacks) assert.ok(!a.plain, a.name);
  const zap = compileAttack("Flip a coin. If tails, Zapdos does 30 damage to itself.", "Zapdos");
  assert.equal(zap[0].op, "flip");
  assert.deepEqual(zap[0].tails.map((st) => [st.op, st.n]), [["selfDamage", 30]]);
  assert.deepEqual(compileAttack("Does 10 damage plus 10 more damage for each damage counter on Machop.", "Machop"), [{ op: "bonusPer", when: "before", n: 10, per: "selfCounters" }]);
  assert.equal(compileAttack("Does 10 damage times the number of damage counters on Mewtwo.", "Mew"), null, "Mew isn't Mewtwo");
  assert.deepEqual(compileAttack("Does 10 damage plus 10 more damage for each damage counter on the Defending Pokémon.")[0].per, "foeCounters");
  assert.deepEqual(compileAttack("Does 50 damage minus 10 damage for each damage counter on this Pokémon.")[0], { op: "bonusPer", when: "before", how: "less", n: 10, per: "selfCounters" });
  assert.deepEqual(compileAttack("This attack's damage isn't affected by Weakness, Resistance, Poké-Powers, Poké-Bodies, or any other effects on the Defending Pokémon.")[0], { op: "typing", when: "before", noWeakness: true, noResistance: true, noEffects: true });
  assert.equal(compileAttack("This attack's damage isn't affected by Weakness or Poké-Bodies."), null, "Poké-Bodies only beside any other effects");
  assert.deepEqual(compileAttack("If this Pokémon used Agility during your last turn, this attack does 60 more damage."), [{ op: "bonusIf", when: "before", n: 60, test: "usedLast", name: "Agility" }]);
  assert.equal(compileAttack("If this Pokémon is wearing a hat, this attack does 60 more damage."), null, "a test it doesn't know");
  assert.deepEqual(compileAttack("If the Defending Pokémon is Pokémon-ex, this attack does 40 damage plus 30 more damage.")[0], { op: "bonusIf", when: "before", n: 30, test: "foeBox", boxes: ["ex"] });
});

test("less damage before Weakness (the attacker's) and after it (the defender's)", () => {
  // Growl on the Water attacker: (30 - 20) × 2 = 20 on Charmander.
  let state = labgame("lab-dmg-1", "lab-dmg-1");
  use(state, 0, "Growl");
  state.cards[state.players[0].active.uid] = "base1-46";
  use(state, 1, "Splash");
  assert.equal(state.players[0].active.damage, 20);
  // On the defender instead: 30 × 2 - 20 = 40.
  state = labgame("lab-dmg-1", "lab-dmg-1");
  use(state, 0, "Granite");
  state.cards[state.players[0].active.uid] = "base1-46";
  use(state, 1, "Splash");
  assert.equal(state.players[0].active.damage, 40);
  // Growl lasts one turn: the turn after, the full 30.
  state = labgame("lab-dmg-1", "lab-dmg-1");
  use(state, 0, "Growl");
  act(state, { type: "end", player: 1 });
  act(state, { type: "end", player: 0 });
  use(state, 1, "Splash");
  assert.equal(state.players[0].active.damage, 30);
});

test("more damage next turn: before Weakness for the attacker's own attack, after it on the Defending Pokémon", () => {
  let state = labgame("lab-dmg-2", "lab-1");
  use(state, 0, "Echo");
  assert.equal(state.players[1].active.damage, 20);
  act(state, { type: "end", player: 1 });
  use(state, 0, "Tap");
  assert.equal(state.players[1].active.damage, 30, "only Echo does more");
  act(state, { type: "end", player: 1 });
  act(state, { type: "end", player: 0 });
  act(state, { type: "end", player: 1 });
  use(state, 0, "Echo");
  assert.equal(state.players[1].active.damage, 50, "the turn after next, plain again");
  state = labgame("lab-dmg-2", "lab-1");
  use(state, 0, "Echo");
  act(state, { type: "end", player: 1 });
  use(state, 0, "Echo");
  assert.equal(state.players[1].active.damage, 20 + 70);
  // Glare on Charmander, then a 10 next turn: 10 × 2 + 30 = 50, not (10 + 30) × 2.
  state = labgame("lab-dmg-1", "base1-46");
  use(state, 0, "Glare");
  act(state, { type: "end", player: 1 });
  state.cards[state.players[0].active.uid] = "lab-dmg-2";
  const events = use(state, 0, "Tap");
  assert.equal(events.find((e) => e.t === "damage" && e.p === 1).n, 50);
});

test("coins: heads until tails add on, tails hurts itself", () => {
  const state = labgame("lab-dmg-2", "lab-1");
  rigFlips(state, [true, true, false]);
  use(state, 0, "Spin");
  assert.equal(state.players[1].active.damage, 40);
  act(state, { type: "end", player: 1 });
  rigFlips(state, [false]);
  use(state, 0, "Thunder");
  assert.equal(state.players[0].active.damage, 10, "no Weakness or Resistance on itself");
  act(state, { type: "end", player: 1 });
  rigFlips(state, [true]);
  use(state, 0, "Thunder");
  assert.equal(state.players[0].active.damage, 10);
  assert.equal(state.players[1].active.damage, 120);
  const s2 = labgame("lab-dmg-4", "lab-1");
  rigFlips(s2, [true, false, true]);
  use(s2, 0, "Cutter");
  assert.equal(s2.players[1].active.damage, 30, "two heads of three");
});

test("counts: spare Water Energy up to a cap, the opponent's Bench, Retreat Cost; healing what it did", () => {
  const state = labgame("lab-dmg-3", "lab-1");
  const me = state.players[0];
  // Fresh Energy cards: the half deck's own run short.
  const spawn = (id) => { const uid = `x${Object.keys(state.cards).length}`; state.cards[uid] = id; return uid; };
  me.active.energy = [spawn(W), spawn(W), spawn(W)];
  use(state, 0, "Water Gun");
  assert.equal(state.players[1].active.damage, 20, "Water and Colorless paid, 1 Water spare");
  act(state, { type: "end", player: 1 });
  me.active.energy.push(spawn(W), spawn(W));
  use(state, 0, "Water Gun");
  assert.equal(state.players[1].active.damage, 20 + 30, "3 spare, but no more than 20 added");
  act(state, { type: "end", player: 1 });
  me.active.energy = [spawn(W), spawn(G)];
  use(state, 0, "Water Gun");
  assert.equal(state.players[1].active.damage, 50 + 10, "the Grass pays the Colorless; nothing spare");
  act(state, { type: "end", player: 1 });
  const bench = state.players[1].bench.length;
  assert.ok(bench > 0);
  use(state, 0, "Rout");
  assert.equal(state.players[1].active.damage, 60 + 10 + 20 * bench);
  act(state, { type: "end", player: 1 });
  me.active.damage = 50;
  use(state, 0, "Drain");
  assert.equal(me.active.damage, 20);
  act(state, { type: "end", player: 1 });
  state.players[1].active.damage = 0;
  state.cards[state.players[1].active.uid] = "base1-4";
  const events = use(state, 0, "Knot");
  assert.equal(events.find((e) => e.t === "damage" && e.p === 1).n, 90 * 2, "Charizard's Retreat Cost of 3, then its Weakness");
});

test("prevented damage: 30 or less, from Basic Pokémon, and Fly's coin", () => {
  let state = labgame("lab-dmg-4", "lab-dmg-1");
  use(state, 0, "Harden");
  use(state, 1, "Splash");
  assert.equal(state.players[0].active.damage, 0, "30 is stopped");
  state = labgame("lab-dmg-4", "lab-dmg-3");
  state.players[1].active.damage = 30;
  use(state, 0, "Harden");
  use(state, 1, "Drain");
  assert.equal(state.players[0].active.damage, 0);
  assert.equal(state.players[1].active.damage, 30, "nothing done, nothing healed");
  state = labgame("lab-dmg-4", "lab-dmg-1");
  use(state, 0, "Harden");
  state.cards[state.players[0].active.uid] = "base1-4";
  use(state, 1, "Splash");
  assert.equal(state.players[0].active.damage, 60, "judged after Weakness");
  state = labgame("lab-dmg-4", "lab-dmg-1");
  use(state, 0, "Balloon");
  use(state, 1, "Splash");
  assert.equal(state.players[0].active.damage, 0, "Lab Wave is a Basic Pokémon");
  state = labgame("lab-dmg-4", "lab-dmg-1");
  rigFlips(state, [false]);
  use(state, 0, "Fly");
  assert.equal(state.players[1].active.damage, 0, "tails: nothing");
  use(state, 1, "Splash");
  assert.equal(state.players[0].active.damage, 30);
  act(state, { type: "end", player: 0 });
  state.players[0].active.damage = 0;
  act(state, { type: "end", player: 1 });
  rigFlips(state, [true]);
  use(state, 0, "Fly");
  assert.equal(state.players[1].active.damage, 30);
  use(state, 1, "Splash");
  assert.equal(state.players[0].active.damage, 0, "heads: protected");
  state = labgame("lab-dmg-4", "lab-ex");
  use(state, 0, "Fang");
  assert.equal(state.players[1].active.damage, 80);
});

labW("lab-dmg-5", [
  ["Feint", 0, "Choose 1 of your opponent's Pokémon. This attack does 30 damage to that Pokémon. This attack's damage isn't affected by Weakness, Resistance, Poké-Powers, Poké-Bodies, or any other effects on that Pokémon."],
  ["Snipe", 0, "This attack does 20 damage to 1 of your opponent's Pokémon. This damage isn't affected by Weakness or Resistance."],
]);

test("a chosen target that skips Weakness: the choice keeps it", () => {
  const state = labgame("lab-dmg-5", "base1-4");
  assert.ok(state.players[1].bench.length > 0);
  use(state, 0, "Feint");
  act(state, { type: "pick", player: 0, spot: ACTIVE });
  assert.equal(state.players[1].active.damage, 30, "not 60 on a Water-weak Charizard");
  act(state, { type: "end", player: 1 });
  use(state, 0, "Snipe");
  act(state, { type: "pick", player: 0, spot: ACTIVE });
  assert.equal(state.players[1].active.damage, 50);
});

/* ---------- attacks that move cards: decks, hands, discard piles, Energy, damage counters ---------- */

lab("lab-c1", [
  ["Scatter", 0, "Put 3 damage counters on your opponent's Pokémon in any way you like."],
  ["Pilfer", 10, "Discard a random card from your opponent's hand."],
  ["Call", 0, "Search your deck for up to 2 Basic Pokémon and put them onto your Bench. Then, shuffle your deck."],
  ["Seal", 10, "Choose 1 of the Defending Pokémon's attacks. That Pokémon can't use that attack during your opponent's next turn."],
]);
lab("lab-c2", [
  ["Ferry", 10, "Move an Energy from this Pokémon to 1 of your Benched Pokémon."],
  ["Refill", 0, "You may draw cards until you have 6 cards in your hand."],
  ["Lure", 10, "You may switch 1 of your opponent's Benched Pokémon with their Active Pokémon. Your opponent's Active Pokémon is now Asleep."],
  ["Retire", 10, "Shuffle this Pokémon and all attached cards into your deck."],
]);

test("attack text that moves cards: read as printed, old wordings that name the Pokémon too", () => {
  for (const id of ["lab-c1", "lab-c2"]) for (const a of defs(id).attacks) assert.ok(!a.plain, a.name);
  assert.deepEqual(compileAttack("Discard the top 2 cards of your deck."), [{ op: "trainer", when: "after", steps: [{ op: "mill", n: 2 }] }]);
  assert.equal(compileAttack("Discard a Special Energy from your opponent's Active Pokémon.")[0].op, "discardFoeSpecial");
  assert.equal(compileAttack("Before doing damage, discard all Pokémon Tools from your opponent's Active Pokémon.")[0].when, "before");
  assert.equal(compileAttack("Heal 20 damage from each of your Pokémon.")[0].steps[0].op, "heal");
  // "Charizard" on Charizard is "this Pokémon".
  assert.equal(compileAttack("Switch Raichu with 1 of your Benched Pokémon.", "Raichu")[0].op, "switchSelf");
  assert.equal(compileAttack("Discard a Fire Energy attached to Charmeleon.", "Charmeleon")[0].type, "Fire");
  // A coin's other side in the same breath is not read as if it always happened.
  assert.equal(compileAttack("Flip a coin. If heads, this attack does 10 damage to 1 of your opponent's Benched Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.) If tails, Raichu does 10 damage to itself.", "Raichu"), null);
  // Both halves of tails stay with tails: no damage, and the damage to itself only then.
  assert.deepEqual(compileAttack("Flip a coin. If tails, this attack does nothing to the Defending Pokémon and Pikachu does 10 damage to itself.", "Pikachu"),
    [{ op: "coin", when: "before", tails: [{ op: "setDamage", n: 0 }] }, { op: "onCoin", when: "after", tails: [{ op: "selfDamage", n: 10 }] }]);
  assert.equal(compileAttack("Flip a coin. If heads, discard a random card from your opponent's hand.")[0].heads[0].op, "foeHandRandom");
  // Trainer steps that make no sense in an attack stay unread.
  assert.equal(compileAttack("During this turn, your Pokémon's attacks do 30 more damage to your opponent's Active Pokémon."), null);
});

lab("lab-c10", [
  ["Lull", 0, "The Defending Pokémon is now Asleep. Your opponent flips 2 coins instead of 1 between turns. If either of them is tails, that Pokémon is still Asleep."],
  ["Snore", 10, "This attack can be used even if this Pokémon is Asleep."],
  ["Clog", 10, "Your opponent can't attach Energy cards from his or her hand to the Defending Pokémon during his or her next turn."],
  ["Stunt", 10, "Your opponent can't play any Pokémon from his or her hand to evolve the Defending Pokémon during his or her next turn."],
]);

test("more attack wordings read: a stronger condition said after it, coins by a count, choices that are limited, HP compared", () => {
  for (const a of defs("lab-c10").attacks) assert.ok(!a.plain, a.name);
  // The sentence after the condition changes only that condition, and only under its coin.
  assert.deepEqual(compileAttack("Flip a coin. If heads, the Defending Pokémon is now Poisoned. Put 2 damage counters instead of 1 on the Defending Pokémon between turns."),
    [{ op: "flip", when: "after", heads: [{ op: "condition", when: "after", kind: "poisoned", counters: 20 }] }]);
  // As many coins as Energy, never more than printed.
  assert.deepEqual(compileAttack("Flip a number of coins equal to the number of Energy attached to this Pokémon. This attack does 20 damage times the number of heads. You can't flip more than 3 coins in this way."),
    [{ op: "flipTimes", when: "before", n: 20, per: "selfEnergy", max: 3 }]);
  assert.deepEqual(compileAttack("Flip 3 coins. For each tails, this Pokémon does 10 damage to itself."),
    [{ op: "flipCount", when: "before", coins: 3 }, { op: "perTails", when: "after", steps: [{ op: "selfDamage", when: "after", n: 10 }] }]);
  assert.deepEqual(compileAttack("Choose either Asleep or Poisoned. The Defending Pokémon is now affected by that Special Condition.")[0].kinds, ["Asleep", "Poisoned"]);
  assert.equal(compileAttack("If this Pokémon has fewer remaining HP than the Defending Pokémon, this attack does 30 more damage.")[0].test, "hpBelowFoe");
  // Older wordings said another way.
  assert.deepEqual(compileAttack("Your opponent can't play any Trainer cards from his or her hand during your opponent's next turn."), [{ op: "lockHand", when: "after", kinds: ["trainer"] }]);
  assert.deepEqual(compileAttack("Choose 1 of your opponent's Benched Pokémon and switch it with the Defending Pokémon."), [{ op: "trainer", when: "after", steps: [{ op: "gust" }] }]);
  assert.deepEqual(compileAttack("Discard an Energy card attached to Jirachi and draw 3 cards.", "Jirachi"),
    [{ op: "discardEnergy", when: "after", n: 1, type: "" }, { op: "draw", when: "after", n: 3 }]);
  assert.deepEqual(compileAttack("Recover 20 damage from this Pokémon."), [{ op: "healSelf", when: "after", n: 20 }]);
  assert.deepEqual(compileAttack("Flip a coin. If head, your opponent's Active Pokémon is now Paralyzed."), [{ op: "flip", when: "after", heads: [{ op: "condition", when: "after", kind: "paralyzed" }] }]);
  // Named Stadiums, and Benched Pokémon of one type.
  assert.deepEqual(compileAttack("If Full Flame is in play, the Defending Pokémon is now Burned."),
    [{ op: "when", when: "after", test: "stadiumNamed", word: "Full Flame", steps: [{ op: "condition", when: "after", kind: "burned" }] }]);
  assert.equal(compileAttack("If Registeel ex is in play, the Defending Pokémon is now Burned."), null);
  assert.deepEqual(compileAttack("Does 10 damage to each Grass Pokémon on your opponent's Bench. (Don't apply Weakness and Resistance for Benched Pokémon.)"),
    [{ op: "spread", when: "after", n: 10, to: "bench", ptype: "Grass" }]);
  assert.deepEqual(compileAttack("Does 80 damage to each Active Pokémon (both yours and your opponent's)."),
    [{ op: "setDamage", when: "before", n: 80 }, { op: "selfDamage", when: "after", n: 80 }]);
});

test("damage to their Benched Pokémon of one type only", () => {
  lab("lab-c11", [["Singe", 10, "Does 10 damage to each of your opponent's Benched Grass Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)"]]);
  byId.set("lab-leaf", { id: "lab-leaf", name: "Leaf", supertype: "Pokémon", subtypes: ["Basic"], types: ["Grass"], hp: "200", attacks: [] });
  for (const grass of [true, false]) {
    const state = labgame("lab-c11", "lab-2");
    const benched = state.players[1].bench[0];
    if (grass) state.cards[benched.uid] = "lab-leaf";
    assert.equal(defs(state.cards[benched.uid]).types.includes("Grass"), grass);
    const before = benched.damage;
    use(state, 0, "Singe");
    assert.equal(benched.damage, before + (grass ? 10 : 0), String(grass));
  }
});

test("a deeper Sleep: two heads to wake up, one is not enough", () => {
  for (const [coins, asleep] of [[[true, false], true], [[true, true], false]]) {
    const state = labgame("lab-c10", "lab-2");
    rigFlips(state, coins);
    use(state, 0, "Lull");
    assert.equal(state.players[1].active.status.main === "asleep", asleep, String(coins));
  }
});

test("an attack that can be used while Asleep: only that one", () => {
  const state = labgame("lab-c10", "lab-2");
  addCondition(state, state.players[0].active, "asleep");
  assert.deepEqual(usableAttacks(state, 0, defs), [attackIndex(state, 0, "Snore")]);
  use(state, 0, "Snore");
  assert.equal(state.players[1].active.damage, 10);
});

test("no Energy from the hand, and no evolving, onto the Defending Pokémon for a turn", () => {
  let state = labgame("lab-c10", "lab-2");
  use(state, 0, "Clog");
  give(state, 1, F);
  let acts = legalActions(state, 1, defs);
  assert.ok(acts.some((a) => a.type === "attach" && a.spot !== ACTIVE));
  assert.ok(!acts.some((a) => a.type === "attach" && a.spot === ACTIVE));
  state = labgame("lab-c10", "lab-2");
  use(state, 0, "Stunt");
  assert.ok(state.players[1].active.marks.some((m) => m.kind === "noEvolve"));
  acts = legalActions(state, 1, defs);
  assert.ok(!acts.some((a) => a.type === "evolve" && a.spot === ACTIVE));
});

test("damage counters in any way you like: one at a time, the same Pokémon again, no Weakness, and a shield keeps them off", () => {
  let state = labgame("lab-c1", "lab-2");
  const foe = state.players[1];
  assert.ok(foe.bench.length);
  const before = foe.bench[0].damage;
  use(state, 0, "Scatter");
  assert.equal(state.pending[0].left, 3);
  act(state, { type: "pick", player: 0, spot: 0 });
  act(state, { type: "pick", player: 0, spot: 0 });
  act(state, { type: "pick", player: 0, spot: ACTIVE });
  assert.equal(foe.bench[0].damage, before + 20);
  assert.equal(foe.active.damage, 10);
  assert.equal(state.current, 1);
  // The bot places them too, and never on one already Knocked Out.
  state = labgame("lab-c1", "lab-2");
  state.players[1].bench[0].damage = 9990;
  use(state, 0, "Scatter");
  while (state.pending.length) act(state, botAction(state, state.pending[0].player, defs));
  assert.equal(state.players[1].active.damage, 30);
  // Shielded by an earlier attack: the Active Pokémon can't be chosen.
  state = labgame("lab-c1", "lab-2");
  state.players[1].active.marks = [{ kind: "shield", turn: state.turn }];
  use(state, 0, "Scatter");
  assert.equal(state.players[1].active.damage, 0);
  assert.ok(!state.pending.length || !state.pending[0].spots.includes(ACTIVE));
});

test("a random card from their hand: the seed decides which, and it goes to their discard pile", () => {
  const picks = [11, 12].map((seed) => {
    const state = labgame("lab-c1", "lab-2");
    state.rng = seed;
    const hand = state.players[1].hand.slice();
    const discard = state.players[1].discard.length;
    use(state, 0, "Pilfer");
    assert.equal(state.players[1].discard.length, discard + 1);
    const gone = state.players[1].discard[discard];
    assert.ok(hand.includes(gone) && !state.players[1].hand.includes(gone));
    assert.ok(state.players[1].discard.includes(gone));
    return gone;
  });
  const again = labgame("lab-c1", "lab-2");
  again.rng = 11;
  use(again, 0, "Pilfer");
  assert.ok(again.players[1].discard.includes(picks[0]));
});

test("a search onto the Bench from an attack: the attacker chooses, the deck is shuffled, then the turn passes", () => {
  const state = labgame("lab-c1", "lab-2");
  const deck = state.players[0].deck.slice();
  use(state, 0, "Call");
  assert.equal(state.pending[0].type, "choose");
  assert.equal(state.pending[0].max, 2);
  const basics = state.pending[0].uids.slice(0, 2);
  const bench = state.players[0].bench.length;
  act(state, { type: "choose", player: 0, uids: basics });
  assert.equal(state.players[0].bench.length, bench + 2);
  assert.notDeepEqual(state.players[0].deck, deck.filter((uid) => !basics.includes(uid)));
  assert.equal(state.current, 1);
});

test("choose one of the Defending Pokémon's attacks: it can't be used during their next turn; the bot locks the hardest hit", () => {
  let state = labgame("lab-c1", "lab-2");
  use(state, 0, "Seal");
  assert.equal(state.pending[0].type, "option");
  assert.deepEqual(state.pending[0].labels, defs("lab-2").attacks.map((a) => a.name));
  act(state, { type: "option", player: 0, index: 2 });
  assert.equal(state.current, 1);
  throws(() => use(state, 1, "Pierce"), /can't use/);
  use(state, 1, "Sting");
  state = labgame("lab-c1", "lab-2");
  use(state, 0, "Seal");
  act(state, botAction(state, 0, defs));
  const hardest = defs("lab-2").attacks.reduce((a, b) => (b.damage > a.damage ? b : a)).name;
  assert.ok(state.players[1].active.marks.some((m) => m.kind === "noUse" && m.name === hardest));
});

test("move an Energy to the Bench: which card, when they differ, then which Pokémon", () => {
  const state = labgame("lab-c2", "lab-2");
  const me = state.players[0];
  const water = me.active.energy[0];
  const grass = give(state, 0, G);
  me.hand.pop();
  me.active.energy.push(grass);
  use(state, 0, "Ferry");
  assert.equal(state.pending[0].type, "choose");
  act(state, { type: "choose", player: 0, uids: [water] });
  assert.equal(state.pending[0].effect.op, "moveEnergyCards");
  act(state, { type: "pick", player: 0, spot: 0 });
  assert.ok(me.bench[0].energy.includes(water));
  assert.deepEqual(me.active.energy, [grass]);
  assert.equal(state.current, 1);
});

test("an attack's \"you may\": the attacker answers, and what follows waits for the choice", () => {
  let state = labgame("lab-c2", "lab-2");
  state.players[0].hand.splice(2);
  use(state, 0, "Refill");
  assert.deepEqual(state.pending[0].labels, ["Yes", "No"]);
  act(state, { type: "option", player: 0, index: 1 });
  assert.equal(state.players[0].hand.length, 2);
  state = labgame("lab-c2", "lab-2");
  state.players[0].hand.splice(2);
  use(state, 0, "Refill");
  act(state, { type: "option", player: 0, index: 0 });
  assert.equal(state.players[0].hand.length, 6);
  // Yes: their Benched Pokémon comes in first, and it is the one put to sleep.
  state = labgame("lab-c2", "lab-2");
  const front = state.players[1].active.uid;
  const benched = state.players[1].bench[0].uid;
  use(state, 0, "Lure");
  act(state, { type: "option", player: 0, index: 0 });
  act(state, { type: "pick", player: 0, spot: 0 });
  assert.equal(state.players[1].active.uid, benched);
  assert.deepEqual(conditionsOn(state.players[1].active), ["asleep"]);
  assert.deepEqual(conditionsOn(state.players[1].bench[0]), []);
  // No: the one already there is.
  state = labgame("lab-c2", "lab-2");
  use(state, 0, "Lure");
  act(state, { type: "option", player: 0, index: 1 });
  assert.equal(state.players[1].active.uid, front);
  assert.deepEqual(conditionsOn(state.players[1].active), ["asleep"]);
  assert.equal(state.current, 1);
});

test("shuffle this Pokémon into the deck: its player brings up a new Active Pokémon", () => {
  const state = labgame("lab-c2", "lab-2");
  const me = state.players[0];
  const uid = me.active.uid;
  const water = me.active.energy[0];
  use(state, 0, "Retire");
  assert.equal(me.active, null);
  assert.ok(me.deck.includes(uid) && me.deck.includes(water));
  assert.equal(state.pending[0].type, "promote");
  act(state, { type: "promote", player: 0, spot: 0 });
  assert.equal(state.current, 1);
});

lab("lab-c3", [
  ["Peek", 10, "Your opponent reveals their hand."],
  ["Recall", 10, "Put an Energy attached to this Pokémon into your hand."],
]);

test("their hand revealed: the attacker is shown every card and takes none; an Energy back to the hand", () => {
  let state = labgame("lab-c3", "lab-2");
  const hand = state.players[1].hand.slice();
  use(state, 0, "Peek");
  assert.equal(state.pending[0].max, 0);
  const view = viewFor(state, 0);
  assert.ok(hand.every((uid) => view.cards[uid]));
  act(state, { type: "choose", player: 0, uids: [] });
  assert.deepEqual(state.players[1].hand.slice(0, hand.length), hand);
  assert.equal(state.current, 1);
  state = labgame("lab-c3", "lab-2");
  const energy = state.players[0].active.energy[0];
  use(state, 0, "Recall");
  assert.ok(state.players[0].hand.includes(energy));
});

test("the bot plays through decks of attacks that move cards and ask for choices", () => {
  for (let i = 0; i < 12; i += 1) {
    const a = deckOf(["lab-c1", 8], ["lab-c2", 6], ["lab-c3", 2], ["base1-63", 4], [W, 10]);
    const b = deckOf(["lab-c2", 6], ["lab-c1", 6], ["base1-46", 8], [F, 10]);
    playOut([a, b], "half", 900 + i);
  }
});

/* ---------- choices before the damage, and what happened earlier ---------- */

lab("lab-p1", [
  ["Push", 20, "You may do 30 more damage. If you do, this Pokémon does 20 damage to itself."],
  ["Burst", 20, "You may discard all Energy from this Pokémon. If you do, this attack does 60 more damage."],
  ["Fuel", 0, "Discard up to 2 Energy from your Pokémon. This attack does 50 damage for each card you discarded in this way."],
  ["Toss", 10, "You may discard up to 2 Energy cards from your hand, and this attack does 40 more damage for each card you discarded in this way."],
  ["Dig", 0, "Discard the top 3 cards of your deck. This attack does 30 damage for each Energy card you discarded in this way."],
]);
lab("lab-h1", [
  ["Charge", 10, "If this Pokémon moved from your Bench to the Active Spot this turn, this attack does 90 more damage."],
  ["Mend", 10, "If this Pokémon was healed during this turn, this attack does 60 more damage."],
  ["Avenge", 10, "If any of your Pokémon were Knocked Out by damage from an opponent's attack during their last turn, this attack does 70 more damage."],
  ["Grudge", 10, "If this Pokémon was damaged by an attack during your opponent's last turn, this attack does that much more damage."],
  ["Swap", 30, "If the Defending Pokémon has any Energy cards attached to it, this attack's base damage is 80 instead of 30."],
  ["Crowd", 10, "If all of your Benched Pokémon have at least 1 damage counter on them, this attack does 50 more damage."],
]);
/** A card of this id put straight into a player's hand (one the deck doesn't hold). */
function handed(state, p, id) {
  const uid = `x${Object.keys(state.cards).length + 1}`;
  state.cards[uid] = id;
  state.players[p].hand.push(uid);
  return uid;
}

test("before the damage: the lab cards are read, and the wordings compile as printed", () => {
  for (const id of ["lab-p1", "lab-h1"]) for (const a of defs(id).attacks) assert.ok(!a.plain, `${id} ${a.name}`);
  assert.deepEqual(compileAttack("You may discard a Stadium in play. If you do, this attack does 140 more damage.").map((s) => s.op), ["ask", "bonusIf"]);
  assert.deepEqual(compileAttack("You may do 30 damage plus 30 more damage. If you do, Arcanine is now Burned.", "Arcanine").at(-1).steps[0], { op: "condition", when: "after", kind: "burned", self: true });
  assert.deepEqual(compileAttack("Discard any amount of Fire Energy from among your Pokémon, and this attack does 90 damage for each card you discarded in this way.")[0], { op: "pay", when: "before", from: "own", energy: { type: "Fire" }, n: 0 });
  assert.deepEqual(compileAttack("You may discard up to 2 Energy from your Benched Pokémon. This attack does 80 more damage for each card you discarded in this way.")[0].from, "bench");
  assert.deepEqual(compileAttack("If Kirlia and the Defending Pokémon have a different amount of Energy attached to them, this attack's base damage is 30 instead of 60.", "Kirlia"), [{ op: "baseIf", when: "before", n: 30, test: "energyDiffers" }]);
  assert.deepEqual(compileAttack("During your next turn, Scyther's Slash attack's base damage is 60 instead of 30.", "Scyther")[0], { op: "mark", when: "after", kind: "base", mine: true, name: "Slash", n: 60 });
  // A price whose "If you do" can't be judged is left unread, not guessed.
  assert.equal(compileAttack("You may look at the top card of your deck. If you do, this attack does 30 more damage."), null);
  // "If you do" with the other side of the coin, or a test that changes with the damage, is not read as one that holds all turn.
  assert.equal(compileAttack("If the Defending Pokémon has any damage counters on it, the Defending Pokémon is now Paralyzed."), null);
});

test("you may do more damage: asked before the damage, the answer can come later, the recoil only on a yes", () => {
  let state = labgame("lab-p1", "lab-2");
  use(state, 0, "Push");
  assert.equal(state.pending[0].type, "option");
  assert.equal(state.pending[0].why, "before");
  assert.equal(state.players[1].active.damage, 0, "no damage until the answer");
  assert.equal(state.current, 0);
  // The answer may arrive as its own action on a state that went through JSON (a match between two players).
  state = JSON.parse(JSON.stringify(state));
  act(state, { type: "option", player: 0, index: 0 });
  assert.equal(state.players[1].active.damage, 50);
  assert.equal(state.players[0].active.damage, 20);
  assert.equal(state.current, 1);
  state = labgame("lab-p1", "lab-2");
  use(state, 0, "Push");
  act(state, { type: "option", player: 0, index: 1 });
  assert.equal(state.players[1].active.damage, 20);
  assert.equal(state.players[0].active.damage, 0);
});

test("you may discard for more damage: the cards go before the damage, and it isn't asked with nothing to discard", () => {
  let state = labgame("lab-p1", "lab-2");
  assert.ok(state.players[0].active.energy.length > 0);
  use(state, 0, "Burst");
  act(state, { type: "option", player: 0, index: 0 });
  assert.equal(state.players[0].active.energy.length, 0);
  assert.equal(state.players[1].active.damage, 80);
  state = labgame("lab-p1", "lab-2");
  state.players[0].discard.push(...state.players[0].active.energy.splice(0));
  use(state, 0, "Burst");
  assert.equal(state.pending.length, 0);
  assert.equal(state.players[1].active.damage, 20);
});

test("for each card you discarded in this way: Energy from any of your Pokémon, cards from the hand, the top of the deck", () => {
  let state = labgame("lab-p1", "lab-2");
  const side = state.players[0];
  side.bench[0].energy.push(give(state, 0, W), give(state, 0, W));
  side.hand = side.hand.filter((u) => !side.bench[0].energy.includes(u));
  use(state, 0, "Fuel");
  const waiting = state.pending[0];
  assert.equal(waiting.type, "choose");
  assert.equal(waiting.min, 0);
  assert.equal(waiting.max, 2);
  assert.ok(waiting.uids.includes(side.bench[0].energy[0]) && waiting.uids.includes(side.active.energy[0]));
  throws(() => act(state, { type: "choose", player: 0, uids: waiting.uids.slice(0, 3) }), /at most 2/);
  const two = [side.active.energy[0], side.bench[0].energy[0]];
  act(state, { type: "choose", player: 0, uids: two });
  assert.equal(state.players[1].active.damage, 100);
  assert.ok(two.every((uid) => side.discard.includes(uid)));
  assert.equal(state.current, 1);
  // None chosen: no damage.
  state = labgame("lab-p1", "lab-2");
  use(state, 0, "Fuel");
  act(state, { type: "choose", player: 0, uids: [] });
  assert.equal(state.players[1].active.damage, 0);
  // From the hand.
  state = labgame("lab-p1", "lab-2");
  const cards = [give(state, 0, W), give(state, 0, W)];
  use(state, 0, "Toss");
  assert.equal(state.pending[0].zone, "hand");
  act(state, { type: "choose", player: 0, uids: cards });
  assert.equal(state.players[1].active.damage, 90);
  assert.ok(cards.every((uid) => state.players[0].discard.includes(uid) && !state.players[0].hand.includes(uid)));
  // The top of the deck: only the Energy cards among them count.
  state = labgame("lab-p1", "lab-2");
  const deck = state.players[0].deck;
  const energy = deck.filter((uid) => state.cards[uid] === W).slice(0, 2);
  const other = deck.find((uid) => defs(state.cards[uid]).kind !== "energy");
  state.players[0].deck = [...energy, other, ...deck.filter((uid) => !energy.includes(uid) && uid !== other)];
  use(state, 0, "Dig");
  assert.equal(state.players[1].active.damage, 60);
  assert.deepEqual(state.players[0].discard.slice(-3), [...energy, other]);
});

test("the bot answers a choice before the damage, and plays decks of them through", () => {
  const state = labgame("lab-p1", "lab-2");
  use(state, 0, "Push");
  const answer = botAction(state, 0, defs);
  assert.equal(answer.type, "option");
  act(state, answer);
  assert.equal(state.current, 1);
  const fuel = labgame("lab-p1", "lab-2");
  use(fuel, 0, "Fuel");
  const pick = botAction(fuel, 0, defs);
  assert.equal(pick.type, "choose");
  act(fuel, pick);
  for (let i = 0; i < 8; i += 1) {
    const a = deckOf(["lab-p1", 8], ["lab-h1", 6], ["base1-63", 4], [W, 12]);
    const b = deckOf(["lab-h1", 6], ["lab-p1", 6], ["base1-46", 8], [F, 10]);
    playOut([a, b], "half", 1300 + i);
  }
});

/* ---------- the long tail of attack text: Benches, conditions, coins, marks, locks ---------- */

lab("lab-t1", [
  ["Backfire", 10, "This attack does 10 damage to each of your Benched Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)"],
  ["Quake", 0, "Does 20 damage to each Benched Pokémon (both yours and your opponent's). (Don't apply Weakness and Resistance for Benched Pokémon.)"],
  ["Finish", 0, "Choose 1 of your opponent's Pokémon that has any damage counters on it. This attack does 30 damage to that Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)"],
  ["Toxic", 10, "Your opponent's Active Pokémon is now Poisoned. Put 2 damage counters instead of 1 on that Pokémon between turns."],
  ["Triple", 0, "Your opponent's Active Pokémon is now Burned, Confused, and Poisoned."],
  ["Lull", 0, "Both Active Pokémon are now Asleep."],
  ["Recoil", 10, "This attack also does 10 damage to 1 of your Benched Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)"],
]);
lab("lab-t2", [
  ["Gamble", 10, "Flip a coin. If heads, this attack does 30 more damage. If tails, this Pokémon does 10 damage to itself."],
  ["Pair", 50, "Flip 2 coins. If either of them is tails, this attack does nothing."],
  ["Freeze", 10, "Flip a coin. If tails, this attack does nothing. If heads, the Defending Pokémon is now Paralyzed."],
  ["Pound", 10, "If the Defending Pokémon is a Basic Pokémon, it can't attack during your opponent's next turn."],
  ["Grind", 0, "Flip a coin until you get tails. For each heads, discard the top card of your opponent's deck."],
  ["Lonely", 30, "If you have 1 or fewer Benched Pokémon, this attack does nothing."],
  ["Hold", 10, "The Defending Pokémon can't retreat until the end of your opponent's next turn."],
]);
lab("lab-t3", [
  ["Clamp", 10, "During your opponent's next turn, they can't play any Item cards from their hand."],
  ["Bare", 10, "During your opponent's next turn, this Pokémon has no Weakness."],
  ["Spikes", 10, "During your opponent's next turn, if this Pokémon is damaged by an attack (even if it is Knocked Out), put 3 damage counters on the Attacking Pokémon."],
  ["Bounce", 10, "You may put an Energy attached to your opponent's Active Pokémon into their hand."],
  ["Rewind", 10, "If your opponent's Active Pokémon is an evolved Pokémon, devolve it by putting the highest Stage Evolution card on it into your opponent's hand."],
  ["Trophy", 200, "If your opponent's Pokémon is Knocked Out by damage from this attack, take 1 more Prize card."],
  ["Burnout", 10, "Discard a Fire Energy card attached to this Pokémon or this attack does nothing."],
  ["Countdown", 0, "Put damage counters on your opponent's Active Pokémon until its remaining HP is 10."],
]);
byId.set("lab-wet", { id: "lab-wet", name: "Wet Lab", supertype: "Pokémon", subtypes: ["Basic"], types: ["Water"], hp: "200", attacks: [{ name: "Splash", cost: [], damage: "30", text: "" }] });

test("the long-tail lab cards' text is all read, and a wording half understood is not", () => {
  for (const id of ["lab-t1", "lab-t2", "lab-t3"]) for (const a of defs(id).attacks) assert.ok(!a.plain, a.name);
  for (const text of [
    "This attack does 10 damage to each of your opponent's Pokémon V for each Energy attached to that Pokémon.",
    "Flip a coin. If heads, this attack does 30 more damage. If tails, this attack does nothing.",
    "If the Defending Pokémon has any damage counters on it, it is now Asleep.",
    "During your opponent's next turn, they can't play any Pokémon cards from their hand.",
    "Does 10 damage to each Benched Pokémon (both yours and your opponent's) that has any damage counters on it.",
  ]) assert.equal(compileAttack(text), null, text);
});

test("Bench damage: your own Bench, both Benches, and only the damaged ones", () => {
  let state = labgame("lab-t1", "lab-2");
  use(state, 0, "Backfire");
  assert.equal(state.players[0].bench[0].damage, 10);
  assert.equal(state.players[1].bench[0].damage, 0);
  state = labgame("lab-t1", "lab-2");
  use(state, 0, "Quake");
  assert.equal(state.players[0].bench[0].damage, 20);
  assert.equal(state.players[1].bench[0].damage, 20);
  assert.equal(state.players[1].active.damage, 0);
  // Only the damaged ones can be chosen; none damaged, nothing to do.
  state = labgame("lab-t1", "lab-2");
  state.players[1].bench[0].damage = 10;
  use(state, 0, "Finish");
  assert.equal(state.players[1].bench[0].damage, 40);
  assert.equal(state.current, 1);
  // One of your own Benched Pokémon, your choice; the bot spares the one closest to a Knock Out.
  state = labgame("lab-t1", "lab-2");
  act(state, { type: "bench", player: 0, uid: give(state, 0, "base1-63") });
  state.players[0].bench[0].damage = defs(state.cards[state.players[0].bench[0].uid]).hp - 10;
  use(state, 0, "Recoil");
  assert.equal(state.pending[0].side, 0);
  act(state, botAction(state, 0, defs));
  assert.equal(state.players[0].bench.length, 2);
  assert.equal(state.players[0].bench[1].damage, 10);
});

test("conditions: a Poison that puts on more, three at once, and both Active Pokémon", () => {
  let state = labgame("lab-t1", "lab-2");
  use(state, 0, "Toxic");
  assert.equal(state.players[1].active.damage, 10 + 20);
  state = labgame("lab-t1", "lab-2");
  use(state, 0, "Triple");
  assert.deepEqual(conditionsOn(state.players[1].active).sort(), ["burned", "confused", "poisoned"]);
  state = labgame("lab-t1", "lab-2");
  rigFlips(state, [false, false]); // neither wakes up between turns
  use(state, 0, "Lull");
  assert.deepEqual(conditionsOn(state.players[0].active), ["asleep"]);
  assert.deepEqual(conditionsOn(state.players[1].active), ["asleep"]);
});

test("coins: more damage or hurt itself, both heads or nothing, heads for the effect after the damage", () => {
  let state = labgame("lab-t2", "lab-2");
  rigFlips(state, [false]);
  use(state, 0, "Gamble");
  assert.equal(state.players[1].active.damage, 10);
  assert.equal(state.players[0].active.damage, 10);
  state = labgame("lab-t2", "lab-2");
  rigFlips(state, [true]);
  use(state, 0, "Gamble");
  assert.equal(state.players[1].active.damage, 40);
  assert.equal(state.players[0].active.damage, 0);
  state = labgame("lab-t2", "lab-2");
  rigFlips(state, [true, false]);
  use(state, 0, "Pair");
  assert.equal(state.players[1].active.damage, 0);
  state = labgame("lab-t2", "lab-2");
  rigFlips(state, [true]);
  use(state, 0, "Freeze");
  assert.equal(state.players[1].active.damage, 10);
  assert.deepEqual(conditionsOn(state.players[1].active), ["paralyzed"]);
  state = labgame("lab-t2", "lab-2");
  const deck = state.players[1].deck.length;
  rigFlips(state, [true, true, false]);
  use(state, 0, "Grind");
  assert.equal(state.players[1].deck.length, deck - 2 - 1); // two milled, one drawn for the turn
});

test("If ...: an effect only on a Basic Pokémon, an attack that does nothing; can't retreat until their turn ends", () => {
  let state = labgame("lab-t2", "lab-2");
  use(state, 0, "Pound");
  assert.deepEqual(usableAttacks(state, 1, defs), []);
  state = labgame("lab-t2", "lab-2");
  use(state, 0, "Lonely");
  assert.equal(state.players[1].active.damage, 0);
  act(state, { type: "bench", player: 1, uid: give(state, 1, "base1-46") });
  act(state, { type: "end", player: 1 });
  act(state, { type: "bench", player: 0, uid: give(state, 0, "base1-63") });
  use(state, 0, "Lonely");
  assert.equal(state.players[1].active.damage, 30);
  state = labgame("lab-t2", "lab-2");
  use(state, 0, "Hold");
  assert.equal(canRetreat(state, 1, defs), false);
});

test("item lock, no Weakness, damage counters back on the attacker", () => {
  let state = labgame("lab-t3", "lab-2");
  use(state, 0, "Clamp");
  const potion = hold(state, 1, T.potion);
  hold(state, 1, T.research);
  state.players[1].active.damage = 30;
  assert.ok(!legalActions(state, 1, defs).some((a) => a.uid === potion));
  throws(() => act(state, { type: "play", player: 1, uid: potion }), /Item/);
  act(state, { type: "end", player: 1 });
  act(state, { type: "end", player: 0 });
  act(state, { type: "play", player: 1, uid: potion });
  // No Weakness during their next turn.
  state = labgame("lab-t3", "lab-wet");
  use(state, 0, "Bare");
  state.cards[state.players[0].active.uid] = "base1-46"; // weak to Water
  act(state, { type: "attack", player: 1, index: 0 });
  assert.equal(state.players[0].active.damage, 30);
  // Spikes: 3 counters on whoever damages it.
  state = labgame("lab-t3", "lab-wet");
  use(state, 0, "Spikes");
  act(state, { type: "attack", player: 1, index: 0 });
  assert.equal(state.players[1].active.damage, 10 + 30);
});

test("Energy to their hand, devolving, an extra Prize card, a price or nothing, counters down to 10 HP", () => {
  let state = labgame("lab-t3", "lab-2");
  const energy = give(state, 1, F);
  state.players[1].hand.splice(state.players[1].hand.indexOf(energy), 1);
  state.players[1].active.energy.push(energy);
  use(state, 0, "Bounce");
  act(state, botAction(state, 0, defs));
  assert.ok(state.players[1].hand.includes(energy));
  assert.equal(state.players[1].active.energy.length, 0);
  // Devolve: Charmeleon back to their hand, Charmander left with the damage.
  state = labgame("lab-t3", "lab-2");
  const top = state.players[1].active;
  const under = hold(state, 1, "base1-46");
  state.players[1].hand.pop();
  state.cards[top.uid] = "base1-24";
  top.under = [under];
  top.damage = 40;
  use(state, 0, "Rewind");
  assert.equal(state.cards[top.uid], "base1-46");
  assert.ok(state.players[1].hand.some((uid) => state.cards[uid] === "base1-24"));
  assert.ok(state.players[1].discard.includes(under)); // 50 damage on a 50 HP Charmander: Knocked Out
  state = labgame("lab-t3", "lab-2");
  const prizes = state.players[0].prizes.length;
  use(state, 0, "Trophy");
  assert.equal(state.players[0].prizes.length, prizes - 2);
  state = labgame("lab-t3", "lab-2");
  use(state, 0, "Burnout");
  assert.equal(state.players[1].active.damage, 0);
  state = labgame("lab-t3", "lab-2");
  use(state, 0, "Countdown");
  assert.equal(state.players[1].active.damage, 190);
});

lab("lab-t4", [
  ["Drag", 0, "Switch 1 of your opponent's Benched Pokémon with their Active Pokémon. This attack does 30 damage to the new Active Pokémon."],
  ["Mimic", 0, "Choose 1 of your opponent's Active Pokémon's attacks and use it as this attack."],
  ["Plain", 0, "Don't apply Weakness and Resistance for this attack. (Any other effects that would happen after applying Weakness and Resistance still happen.)"],
]);

test("a choice before the damage: the Pokémon switched in takes it, even across a save", () => {
  for (const a of defs("lab-t4").attacks) assert.ok(!a.plain, a.name);
  let state = labgame("lab-t4", "lab-2");
  const old = state.players[1].active;
  use(state, 0, "Drag");
  assert.equal(state.pending[0].type, "pick");
  assert.equal(old.damage, 0);
  state = JSON.parse(JSON.stringify(state)); // a match saved while it waits
  act(state, { type: "pick", player: 0, spot: 0 });
  assert.equal(state.players[1].active.damage, 30);
  assert.equal(state.players[1].bench[0].damage, 0);
  assert.equal(state.current, 1);
});

test("an attack of theirs used as this attack: its damage and its effects", () => {
  let state = labgame("lab-t4", "lab-2");
  use(state, 0, "Mimic");
  assert.equal(state.pending[0].why, "copy");
  assert.deepEqual(state.pending[0].labels.slice(0, 4), ["Smoke", "Hide", "Pierce", "Sting"]);
  state = JSON.parse(JSON.stringify(state));
  act(state, { type: "option", player: 0, index: 3 });
  assert.deepEqual(conditionsOn(state.players[1].active), ["poisoned"]);
  assert.equal(state.players[1].active.damage, 50 + 10);
  assert.equal(state.current, 1);
  // The bot takes the one that hits hardest; with one attack to copy there is no choice.
  state = labgame("lab-t4", "lab-2");
  use(state, 0, "Mimic");
  assert.equal(state.pending[0].labels[botAction(state, 0, defs).index], "Crush"); // 300, added to lab-2 above
  state = labgame("lab-t4", "lab-wet");
  use(state, 0, "Mimic");
  assert.equal(state.players[1].active.damage, 30);
  assert.equal(state.current, 1);
});

lab("lab-t5", [
  ["Sift", 0, "Your opponent reveals their hand. This attack does 20 damage for each Trainer card you find there."],
  ["Dig", 10, "Discard the top 3 cards of your deck. If any of those cards are Energy cards, attach them to this Pokémon."],
  ["Trade", 10, "Discard an Energy from this Pokémon. If you do, discard an Energy from your opponent's Active Pokémon."],
  ["Hex", 0, "Choose 1 Special Condition. The Defending Pokémon is now affected by that Special Condition."],
  ["Scry", 0, "Look at the top 3 cards of either player's deck and put them back in any order."],
  ["Jolt", 0, "Flip a coin. If heads, the Defending Pokémon is now Paralyzed and discard an Energy card attached to the Defending Pokémon."],
  ["Prick", 0, "Put 1 damage counter on each of your opponent's Pokémon that has any damage counters on it."],
]);

test("their Trainers counted, Energy off the top attached, an Energy for an Energy, a condition chosen, their deck put in order", () => {
  let state = labgame("lab-t5", "lab-2");
  hold(state, 1, T.potion);
  hold(state, 1, T.research);
  use(state, 0, "Sift");
  act(state, { type: "choose", player: 0, uids: [] });
  assert.equal(state.players[1].active.damage, 40);
  state = labgame("lab-t5", "lab-2");
  const me = state.players[0];
  const top = me.deck.slice(0, 3);
  const energies = top.filter((uid) => defs(state.cards[uid]).kind === "energy");
  const had = me.active.energy.length;
  use(state, 0, "Dig");
  assert.equal(me.active.energy.length, had + energies.length);
  assert.ok(top.filter((uid) => !energies.includes(uid)).every((uid) => me.discard.includes(uid)));
  // Nothing to discard, nothing of theirs goes.
  state = labgame("lab-t5", "lab-2");
  const fire = give(state, 1, F);
  state.players[1].hand.splice(state.players[1].hand.indexOf(fire), 1);
  state.players[1].active.energy.push(fire);
  state.players[0].discard.push(...state.players[0].active.energy.splice(0));
  use(state, 0, "Trade");
  assert.deepEqual(state.players[1].active.energy, [fire]);
  state.players[0].active.energy.push(give(state, 0, W));
  state.players[0].hand.pop();
  act(state, { type: "end", player: 1 });
  use(state, 0, "Trade");
  assert.deepEqual(state.players[1].active.energy, []);
  // A condition of the attacker's choosing; the bot takes Paralyzed.
  state = labgame("lab-t5", "lab-2");
  use(state, 0, "Hex");
  assert.equal(state.pending[0].why, "condition");
  act(state, botAction(state, 0, defs));
  assert.deepEqual(conditionsOn(state.players[1].active), ["paralyzed"]);
  // Their deck, in the order chosen.
  state = labgame("lab-t5", "lab-2");
  use(state, 0, "Scry");
  act(state, { type: "option", player: 0, index: 1 });
  const three = state.players[1].deck.slice(0, 3);
  assert.equal(state.pending[0].owner, 1);
  act(state, { type: "choose", player: 0, uids: three.slice().reverse() });
  assert.deepEqual(state.players[1].hand.slice(-1), [three[2]]); // drawn for their turn
  // Two effects on heads; counters only where there are some.
  state = labgame("lab-t5", "lab-2");
  const zap = give(state, 1, F);
  state.players[1].hand.splice(state.players[1].hand.indexOf(zap), 1);
  state.players[1].active.energy.push(zap);
  rigFlips(state, [true]);
  use(state, 0, "Jolt");
  assert.deepEqual(conditionsOn(state.players[1].active), ["paralyzed"]);
  assert.deepEqual(state.players[1].active.energy, []);
  state = labgame("lab-t5", "lab-2");
  state.players[1].bench[0].damage = 10;
  use(state, 0, "Prick");
  assert.equal(state.players[1].bench[0].damage, 20);
  assert.equal(state.players[1].active.damage, 0);
});

test("the bot plays through decks of the long-tail attacks", () => {
  for (let i = 0; i < 8; i += 1) {
    const a = deckOf(["lab-t1", 6], ["lab-t4", 6], ["base1-63", 6], [W, 12]);
    const b = deckOf(["lab-t3", 6], ["lab-t5", 4], ["base1-46", 8], [F, 12]);
    playOut([a, b], "half", 1300 + i);
  }
});

test("what happened earlier: moved up this turn, healed this turn, a Knock Out by an attack last turn, damage taken last turn", () => {
  // Moved up from the Bench (a retreat here): this turn only.
  let state = labgame("lab-h1", "lab-2");
  state.cards[state.players[0].bench[0].uid] = "lab-h1";
  state.cards[state.players[0].active.uid] = "base1-63";
  act(state, { type: "retreat", player: 0, to: 0 });
  use(state, 0, "Charge");
  assert.equal(state.players[1].active.damage, 100);
  act(state, { type: "end", player: 1 });
  use(state, 0, "Charge");
  assert.equal(state.players[1].active.damage, 110);
  // Healed this turn (a Potion), kept through JSON.
  state = labgame("lab-h1", "lab-2");
  use(state, 0, "Mend");
  assert.equal(state.players[1].active.damage, 10);
  act(state, { type: "end", player: 1 });
  state.players[0].active.damage = 30;
  act(state, { type: "play", player: 0, uid: handed(state, 0, "base1-94") });
  if (state.pending.length) act(state, { type: "pick", player: 0, spot: ACTIVE });
  assert.equal(state.players[0].active.damage, 10);
  state = JSON.parse(JSON.stringify(state));
  use(state, 0, "Mend");
  assert.equal(state.players[1].active.damage, 80);
  // Damage from an attack during their last turn, and that much more.
  state = labgame("lab-h1", "lab-2");
  use(state, 0, "Grudge");
  assert.equal(state.players[1].active.damage, 10);
  use(state, 1, "Pierce");
  assert.equal(state.players[0].active.damage, 50);
  use(state, 0, "Grudge");
  assert.equal(state.players[1].active.damage, 70);
  act(state, { type: "end", player: 1 });
  use(state, 0, "Grudge");
  assert.equal(state.players[1].active.damage, 80, "not damaged during their last turn");
  // A Knock Out by damage from their attack during their last turn.
  state = labgame("base1-63", "lab-2");
  state.cards[state.players[0].bench[0].uid] = "lab-h1";
  act(state, { type: "end", player: 0 });
  state.players[0].active.damage = defs("base1-63").hp - 10;
  use(state, 1, "Pierce");
  act(state, { type: "promote", player: 0, spot: 0 });
  use(state, 0, "Avenge");
  assert.equal(state.players[1].active.damage, 80);
  act(state, { type: "end", player: 1 });
  use(state, 0, "Avenge");
  assert.equal(state.players[1].active.damage, 90);
  // Knocked Out by damage counters from an attack is not "by damage".
  state = labgame("base1-63", "lab-2");
  state.cards[state.players[0].bench[0].uid] = "lab-h1";
  act(state, { type: "end", player: 0 });
  state.players[0].active.damage = defs("base1-63").hp;
  resolveKnockOuts(state, defs, []);
  act(state, { type: "promote", player: 0, spot: 0 });
  act(state, { type: "end", player: 1 });
  use(state, 0, "Avenge");
  assert.equal(state.players[1].active.damage, 10);
});

lab("lab-p2", [
  ["Either", 10, "You may discard any amount of basic Fire Energy or any amount of basic Lightning Energy from this Pokémon. This attack does 50 more damage for each card you discarded in this way."],
  ["Pay", 10, "You may discard a card from your hand. If you do, this attack does 60 more damage."],
  ["Tools", 10, "Before doing damage, you may discard any number of Pokémon Tools from your Pokémon. This attack does 40 more damage for each card you discarded in this way."],
  ["Kin", 10, "If any of your Water Pokémon were Knocked Out by damage from an attack during your opponent's last turn, this attack does 70 more damage."],
]);

test("prices before the damage: one kind of Energy only, a card from the hand, Tools from your Pokémon", () => {
  for (const a of defs("lab-p2").attacks) assert.ok(!a.plain, a.name);
  let state = labgame("lab-p2", "lab-2");
  const front = state.players[0].active;
  const fires = [handed(state, 0, F), handed(state, 0, F)];
  const water = front.energy[0];
  front.energy.push(...fires);
  state.players[0].hand = state.players[0].hand.filter((u) => !fires.includes(u));
  use(state, 0, "Either");
  assert.ok(!state.pending[0].uids.includes(water), "Water Energy isn't offered");
  // Both kinds would be fine one at a time; here only Fire is attached besides the Water, so all of it.
  act(state, { type: "choose", player: 0, uids: fires });
  assert.equal(state.players[1].active.damage, 110);
  assert.deepEqual(state.players[0].active.energy, [water]);
  // A card from the hand: asked only with a card to discard, then the card is chosen.
  state = labgame("lab-p2", "lab-2");
  const hand = state.players[0].hand.length;
  use(state, 0, "Pay");
  act(state, { type: "option", player: 0, index: 0 });
  assert.equal(state.pending[0].type, "choose");
  assert.equal(state.pending[0].min, 1);
  act(state, { type: "choose", player: 0, uids: [state.players[0].hand[0]] });
  assert.equal(state.players[0].hand.length, hand - 1);
  assert.equal(state.players[1].active.damage, 70);
  state = labgame("lab-p2", "lab-2");
  state.players[0].discard.push(...state.players[0].hand.splice(0));
  use(state, 0, "Pay");
  assert.equal(state.pending.length, 0);
  assert.equal(state.players[1].active.damage, 10);
  // Tools off any of your Pokémon.
  state = labgame("lab-p2", "lab-2");
  const tool = handed(state, 0, "base1-94");
  state.players[0].hand.pop();
  state.players[0].bench[0].tool = tool;
  use(state, 0, "Tools");
  act(state, { type: "choose", player: 0, uids: [tool] });
  assert.equal(state.players[0].bench[0].tool, undefined);
  assert.ok(state.players[0].discard.includes(tool));
  assert.equal(state.players[1].active.damage, 50);
});

test("a Knock Out of one of your Water Pokémon by an attack's damage: the type is the Knocked Out card's", () => {
  const kin = (koId) => {
    const state = labgame(koId, "lab-2");
    state.cards[state.players[0].bench[0].uid] = "lab-p2";
    act(state, { type: "end", player: 0 });
    state.players[0].active.damage = defs(koId).hp - 10;
    use(state, 1, "Pierce");
    act(state, { type: "promote", player: 0, spot: 0 });
    use(state, 0, "Kin");
    return state.players[1].active.damage;
  };
  assert.equal(kin("base1-63"), 80, "Squirtle is a Water Pokémon");
  assert.equal(kin("base1-46"), 10, "Charmander isn't");
});

test("base damage instead, and all of your Benched Pokémon", () => {
  let state = labgame("lab-h1", "lab-2");
  use(state, 0, "Swap");
  assert.equal(state.players[1].active.damage, 30);
  act(state, { type: "end", player: 1 });
  state.players[1].active.energy.push(give(state, 1, F));
  state.players[1].hand.pop();
  use(state, 0, "Swap");
  assert.equal(state.players[1].active.damage, 110);
  state = labgame("lab-h1", "lab-2");
  use(state, 0, "Crowd");
  assert.equal(state.players[1].active.damage, 10);
  act(state, { type: "end", player: 1 });
  state.players[0].bench[0].damage = 10;
  use(state, 0, "Crowd");
  assert.equal(state.players[1].active.damage, 70);
  // An empty Bench has no Benched Pokémon with damage counters on them.
  state = labgame("lab-h1", "lab-2");
  state.players[0].discard.push(...state.players[0].bench.splice(0).map((s) => s.uid));
  use(state, 0, "Crowd");
  assert.equal(state.players[1].active.damage, 10);
  // "During your next turn, this Pokémon's Slash attack's base damage is 60": that attack, that turn.
  lab("lab-b1", [["Ready", 0, "During your next turn, this Pokémon's Slash attack's base damage is 60."], ["Slash", 30, ""]]);
  state = labgame("lab-b1", "lab-2");
  use(state, 0, "Ready");
  act(state, { type: "end", player: 1 });
  use(state, 0, "Slash");
  assert.equal(state.players[1].active.damage, 60);
  act(state, { type: "end", player: 1 });
  use(state, 0, "Slash");
  assert.equal(state.players[1].active.damage, 90);
});

/* ---------- which Energy goes is the player's choice ---------- */

/** An Energy card of this id, attached to that Pokémon (it need not be in the deck). */
function attachNew(state, slot, id) {
  const uid = `e${Object.keys(state.cards).length}`;
  state.cards[uid] = id;
  slot.energy.push(uid);
  return uid;
}
const DCE = "bw11-113";
lab("lab-ch", [
  ["Burn", 30, "Discard an Energy from this Pokémon."],
  ["Douse", 30, "Discard a Water Energy from this Pokémon."],
  ["Trade", 10, "Discard an Energy from this Pokémon. If you do, discard an Energy from your opponent's Active Pokémon."],
  ["Gamble", 0, "Discard a Water Energy attached to this Pokémon or this attack does nothing."],
]);

test("an attack's own Energy discard: the attacking player chooses which, unless the cards are all alike", () => {
  let state = labgame("lab-ch", "lab-2");
  const me = state.players[0];
  me.discard.push(...me.active.energy.splice(0));
  const water = attachNew(state, me.active, W);
  const dce = attachNew(state, me.active, DCE);
  use(state, 0, "Burn");
  assert.equal(state.players[1].active.damage, 30, "the damage first");
  assert.equal(state.pending[0].type, "choose");
  assert.deepEqual(state.pending[0].uids, [water, dce]);
  // The bot keeps its Special Energy.
  assert.deepEqual(botAction(state, 0, defs).uids, [water]);
  act(state, { type: "choose", player: 0, uids: [dce] });
  assert.deepEqual(me.active.energy, [water]);
  assert.ok(me.discard.includes(dce));
  assert.equal(state.current, 1);
  // Two cards alike: nothing to ask.
  state = labgame("lab-ch", "lab-2");
  state.players[0].discard.push(...state.players[0].active.energy.splice(0));
  attachNew(state, state.players[0].active, W);
  attachNew(state, state.players[0].active, W);
  use(state, 0, "Burn");
  assert.equal(state.pending.length, 0);
  assert.equal(state.players[0].active.energy.length, 1);
  // Of one type: only the Water ones may go, and they're alike.
  state = labgame("lab-ch", "lab-2");
  state.players[0].discard.push(...state.players[0].active.energy.splice(0));
  const fire = attachNew(state, state.players[0].active, F);
  attachNew(state, state.players[0].active, W);
  use(state, 0, "Douse");
  assert.equal(state.pending.length, 0);
  assert.deepEqual(state.players[0].active.energy, [fire]);
});

test("\"If you do\" after the chosen discard, and a discard before the damage that the attack needs", () => {
  let state = labgame("lab-ch", "lab-2");
  const me = state.players[0];
  me.discard.push(...me.active.energy.splice(0));
  const water = attachNew(state, me.active, W);
  attachNew(state, me.active, F);
  const theirs = attachNew(state, state.players[1].active, F);
  use(state, 0, "Trade");
  assert.deepEqual(state.players[1].active.energy, [theirs], "not before the choice");
  act(state, { type: "choose", player: 0, uids: [water] });
  assert.deepEqual(state.players[1].active.energy, []);
  assert.equal(state.current, 1);
  // "Discard a Water Energy ... or this attack does nothing": paid before the damage; the choice holds the damage back.
  state = labgame("lab-ch", "lab-2");
  state.players[0].discard.push(...state.players[0].active.energy.splice(0));
  const w = attachNew(state, state.players[0].active, W);
  const rainbow = attachNew(state, state.players[0].active, "sm7-151");
  use(state, 0, "Gamble");
  assert.equal(state.pending[0].type, "choose", "an Energy of any type is a Water Energy too");
  act(state, { type: "choose", player: 0, uids: [w] });
  assert.deepEqual(state.players[0].active.energy, [rainbow]);
  assert.equal(state.current, 1);
});

test("their Energy: the attacker chooses which; a Trainer's discard from one of their Pokémon too", () => {
  let state = labgame("lab-3", "lab-2");
  const foe = state.players[1];
  const fire = attachNew(state, foe.active, F);
  const dce = attachNew(state, foe.active, DCE);
  use(state, 0, "Drain");
  assert.equal(state.pending[0].player, 0);
  // The bot takes their Special Energy.
  assert.deepEqual(botAction(state, 0, defs).uids, [dce]);
  act(state, { type: "choose", player: 0, uids: [fire] });
  assert.deepEqual(foe.active.energy, [dce]);
  // Energy Removal: the Pokémon, then the card.
  const removal = labTrainer("removal", "Item", "Discard an Energy from 1 of your opponent's Pokémon.");
  state = labgame("lab-3", "lab-2");
  const f2 = attachNew(state, state.players[1].active, F);
  const d2 = attachNew(state, state.players[1].active, DCE);
  act(state, { type: "play", player: 0, uid: hold(state, 0, removal) });
  if (state.pending[0].type === "pick") act(state, { type: "pick", player: 0, spot: ACTIVE });
  assert.equal(state.pending[0].type, "choose");
  act(state, { type: "choose", player: 0, uids: [d2] });
  assert.deepEqual(state.players[1].active.energy, [f2]);
});

test("a Retreat Cost: the retreating player chooses the Energy that pays it", () => {
  let state = midgame();
  const me = state.players[0];
  me.discard.push(...me.active.energy.splice(0));
  const water = attachNew(state, me.active, W);
  const dce = attachNew(state, me.active, DCE);
  const benched = me.bench[0];
  assert.equal(retreatCost(state, me.active, defs), 1);
  act(state, { type: "retreat", player: 0, to: 0 });
  assert.equal(state.pending[0].effect.op, "retreat");
  assert.equal(me.bench[0], benched, "nothing moves until it is paid");
  throws(() => act(state, { type: "choose", player: 0, uids: [water, dce] }), /only/);
  // The bot keeps the Water Energy its attacks need: Double Colorless pays.
  assert.deepEqual(botAction(state, 0, defs).uids, [dce]);
  act(state, { type: "choose", player: 0, uids: [water] });
  assert.equal(me.active, benched);
  assert.deepEqual(me.bench[0].energy, [dce]);
  assert.ok(me.discard.includes(water));
  // Cards alike, or every card needed: no question.
  state = midgame();
  state.players[0].discard.push(...state.players[0].active.energy.splice(0));
  attachNew(state, state.players[0].active, W);
  attachNew(state, state.players[0].active, W);
  act(state, { type: "retreat", player: 0, to: 0 });
  assert.equal(state.pending.length, 0);
  assert.equal(state.players[0].bench[0].energy.length, 1);
  // Naming the cards in the action still works (the screen of a player who chose already).
  state = midgame();
  state.players[0].discard.push(...state.players[0].active.energy.splice(0));
  const w2 = attachNew(state, state.players[0].active, W);
  const f2 = attachNew(state, state.players[0].active, F);
  act(state, { type: "retreat", player: 0, to: 0, discard: [f2] });
  assert.deepEqual(state.players[0].bench[0].energy, [w2]);
});

test("moving one of your Energy: which card is yours to choose, then where", () => {
  const mover = labTrainer("mover", "Item", "Move a basic Energy from 1 of your Pokémon to another of your Pokémon.");
  const state = labgame("lab-ch", "lab-2");
  const me = state.players[0];
  me.discard.push(...me.active.energy.splice(0));
  const water = attachNew(state, me.active, W);
  const fire = attachNew(state, me.active, F);
  act(state, { type: "play", player: 0, uid: hold(state, 0, mover) });
  if (state.pending[0].type === "pick") act(state, { type: "pick", player: 0, spot: ACTIVE });
  assert.equal(state.pending[0].type, "choose");
  act(state, { type: "choose", player: 0, uids: [water] });
  if (state.pending[0]?.type === "pick") act(state, { type: "pick", player: 0, spot: 0 });
  assert.deepEqual(me.active.energy, [fire]);
  assert.ok(me.bench[0].energy.includes(water));
});

/* ---------- more attack wordings: names counted, Energy off any of theirs, delayed and barred effects ---------- */

lab("lab-n1", [
  ["Round", 20, "This attack does 20 damage for each of your Pokémon in play that has the Round attack."],
  ["Mad Party", 10, "This attack does 10 damage for each Pokémon in your discard pile that has the Mad Party attack."],
  ["Rollout", 10, "This attack does 10 damage for each of your Benched Pokémon that has the Round attack."],
  ["Mixed", 0, "This attack does 30 damage for each different type of Pokémon on your Bench."],
]);
lab("lab-n2", [
  ["Strip", 0, "Discard 2 Energy from your opponent's Pokémon."],
  ["Sweep", 0, "Discard an Energy from each of your opponent's Pokémon."],
  ["Scatter", 0, "Move all Energy from this Pokémon to your Benched Pokémon in any way you like."],
  ["Taunt", 10, "Count the number of cards in your opponent's hand. Put that many damage counters on the Defending Pokémon."],
  ["Swap", 0, "Switch all damage counters on this Pokémon with those on your opponent's Active Pokémon."],
]);
lab("lab-n3", [
  ["Sour", 10, "The Defending Pokémon can't be healed during your opponent's next turn."],
  ["Doom", 0, "At the end of your opponent's next turn, put 6 damage counters on the Defending Pokémon."],
  ["Beast", 0, "If your opponent's Active Pokémon is an Ultra Beast, it is Knocked Out."],
  ["Fall", 0, "Knock Out 1 of your opponent's Basic Pokémon that isn't a Pokémon-GX."],
  ["Early", 10, "If you go first, you can use this attack on your first turn."],
  ["Late", 10, "If you go second, you can't use this attack during your first turn."],
]);
byId.set("lab-ub", { id: "lab-ub", name: "Lab Beast", supertype: "Pokémon", subtypes: ["Basic", "Ultra Beast"], types: ["Psychic"], hp: "120", attacks: [{ name: "Poke", cost: [], damage: "10", text: "" }] });

test("the new wordings are read", () => {
  for (const id of ["lab-n1", "lab-n2", "lab-n3"]) for (const a of defs(id).attacks) assert.ok(!a.plain, a.name);
  assert.deepEqual(defs("lab-ub").tags, ["Ultra Beast"]);
  // Half-read texts stay unread: two from 1 of their Pokémon is not two from any of them.
  assert.equal(compileAttack("Discard 2 Energy from 1 of your opponent's Pokémon."), null);
});

test("Pokémon counted by an attack's name, and the types on the Bench", () => {
  let state = labgame("lab-n1", "lab-2");
  const me = state.players[0];
  state.cards[me.bench[0].uid] = "lab-n1";
  use(state, 0, "Round");
  assert.equal(state.players[1].active.damage, 40, "itself and the Benched one");
  state = labgame("lab-n1", "lab-2");
  state.players[0].discard.push(hold(state, 0, "lab-n1"), hold(state, 0, "lab-n1"), hold(state, 0, "lab-2"));
  state.players[0].hand.splice(-3);
  use(state, 0, "Mad Party");
  assert.equal(state.players[1].active.damage, 20);
  state = labgame("lab-n1", "lab-2");
  use(state, 0, "Rollout");
  assert.equal(state.players[1].active.damage, 0, "not itself: only the Benched ones");
  state = labgame("lab-n1", "lab-2");
  state.players[0].bench.push({ ...state.players[0].bench[0], uid: hold(state, 0, "base1-46"), energy: [], damage: 0 });
  state.players[0].hand.pop();
  use(state, 0, "Mixed");
  assert.equal(state.players[1].active.damage, 60, "Water and Fire");
});

test("Energy off any of their Pokémon: the attacker chooses across them, or one from each", () => {
  let state = labgame("lab-n2", "lab-2");
  const foe = state.players[1];
  const a1 = attachNew(state, foe.active, F);
  const a2 = attachNew(state, foe.active, DCE);
  const b1 = attachNew(state, foe.bench[0], W);
  use(state, 0, "Strip");
  assert.equal(state.pending[0].min, 2);
  assert.deepEqual(new Set(botAction(state, 0, defs).uids).has(a2), true, "the bot takes their Special Energy");
  act(state, { type: "choose", player: 0, uids: [a1, b1] });
  assert.deepEqual(foe.active.energy, [a2]);
  assert.deepEqual(foe.bench[0].energy, []);
  // Each of them: the Benched one has one card, gone now; the Active one's differ, so it is asked.
  state = labgame("lab-n2", "lab-2");
  const c1 = attachNew(state, state.players[1].active, F);
  const c2 = attachNew(state, state.players[1].active, DCE);
  attachNew(state, state.players[1].bench[0], W);
  use(state, 0, "Sweep");
  assert.deepEqual(state.players[1].bench[0].energy, []);
  assert.deepEqual(state.pending[0].uids, [c1, c2]);
  act(state, { type: "choose", player: 0, uids: [c1] });
  assert.deepEqual(state.players[1].active.energy, [c2]);
  assert.equal(state.current, 1);
});

test("Energy spread over the Bench card by card; damage counters by a count, and swapped", () => {
  let state = labgame("lab-n2", "lab-2");
  const me = state.players[0];
  me.bench.push({ ...me.bench[0], uid: hold(state, 0, "base1-63"), energy: [], damage: 0 });
  me.hand.pop();
  me.discard.push(...me.active.energy.splice(0));
  const w = attachNew(state, me.active, W);
  const f = attachNew(state, me.active, F);
  use(state, 0, "Scatter");
  assert.equal(state.pending.length, 2);
  act(state, { type: "pick", player: 0, spot: 0 });
  act(state, { type: "pick", player: 0, spot: 1 });
  assert.deepEqual(me.active.energy, []);
  assert.ok(me.bench[0].energy.includes(w) && me.bench[1].energy.includes(f));
  state = labgame("lab-n2", "lab-2");
  const hand = state.players[1].hand.length;
  use(state, 0, "Taunt");
  assert.equal(state.players[1].active.damage, 10 + hand * 10);
  state = labgame("lab-n2", "lab-2");
  state.players[0].active.damage = 70;
  state.players[1].active.damage = 20;
  use(state, 0, "Swap");
  assert.equal(state.players[0].active.damage, 20);
  assert.equal(state.players[1].active.damage, 70);
});

test("can't be healed next turn; damage counters at the end of their next turn", () => {
  let state = labgame("lab-n3", "lab-2");
  use(state, 0, "Sour");
  state.players[1].active.damage = 50;
  act(state, { type: "play", player: 1, uid: hold(state, 1, T.potion) });
  if (state.pending[0]?.type === "pick") act(state, { type: "pick", player: 1, spot: ACTIVE });
  assert.equal(state.players[1].active.damage, 50, "no healing that turn");
  act(state, { type: "end", player: 1 });
  act(state, { type: "end", player: 0 });
  act(state, { type: "play", player: 1, uid: hold(state, 1, T.potion) });
  if (state.pending[0]?.type === "pick") act(state, { type: "pick", player: 1, spot: ACTIVE });
  assert.equal(state.players[1].active.damage, 20, "healed the turn after");
  state = labgame("lab-n3", "lab-2");
  use(state, 0, "Doom");
  assert.equal(state.players[1].active.damage, 0);
  act(state, { type: "end", player: 1 });
  assert.equal(state.players[1].active.damage, 60);
  // Benched before then: it isn't the Defending Pokémon any more.
  state = labgame("lab-n3", "lab-2");
  use(state, 0, "Doom");
  act(state, { type: "play", player: 1, uid: hold(state, 1, T.swap) });
  if (state.pending[0]?.type === "pick") act(state, { type: "pick", player: 1, spot: 0 });
  act(state, { type: "end", player: 1 });
  assert.equal(state.players[1].bench[0].damage, 0);
});

test("an Ultra Beast Knocked Out, a Basic that isn't a Pokémon-GX picked to be Knocked Out", () => {
  let state = labgame("lab-n3", "lab-2");
  use(state, 0, "Beast");
  assert.ok(state.players[1].active.damage < 200, "not an Ultra Beast");
  state = labgame("lab-n3", "lab-ub");
  const prizes = state.players[0].prizes.length;
  use(state, 0, "Beast");
  if (state.pending[0]?.type === "promote") act(state, { type: "promote", player: 1, spot: 0 });
  assert.equal(state.players[0].prizes.length, prizes - 1);
  state = labgame("lab-n3", "lab-2");
  use(state, 0, "Fall");
  assert.equal(state.pending[0].effect.op, "knockOut");
  act(state, { type: "pick", player: 0, spot: 0 });
  assert.equal(state.players[0].prizes.length, prizes - 1);
});

test("the first turns: an attack the player going first may use on turn 1, one the second player can't use on turn 2", () => {
  const state = started(7, fire, water);
  const p = state.current;
  state.cards[state.players[p].active.uid] = "lab-n3";
  const names = () => usableAttacks(state, state.current, defs).map((i) => defs(state.cards[state.players[state.current].active.uid]).attacks[i].name);
  assert.deepEqual(names(), ["Early"]);
  act(state, { type: "attack", player: p, index: 4 });
  const q = state.current;
  assert.equal(q, 1 - p);
  state.cards[state.players[q].active.uid] = "lab-n3";
  assert.ok(!names().includes("Late"));
  throws(() => act(state, { type: "attack", player: q, index: 5 }), /go second/);
});

lab("lab-n4", [
  ["Shuffle", 0, "Move any number of Energy from your Pokémon to your other Pokémon in any way you like."],
  ["Gather", 0, "Move any number of Energy from your Benched Pokémon to this Pokémon."],
  ["Absorb", 40, "This attack does 40 damage for each of your remaining Prize cards."],
  ["Mend", 0, "Heal all damage from 2 of your Benched Pokémon."],
  ["Shake", 20, "This attack does 20 more damage for each type of basic Energy card in your discard pile. You can't add more than 40 damage in this way."],
]);

test("Energy moved about one card at a time until the player stops; gathered from the Bench", () => {
  let state = labgame("lab-n4", "lab-2");
  const me = state.players[0];
  me.discard.push(...me.active.energy.splice(0));
  const w = attachNew(state, me.active, W);
  const f = attachNew(state, me.active, F);
  use(state, 0, "Shuffle");
  assert.equal(state.pending[0].effect.op, "rearrangeFrom");
  // The bot leaves its Energy where it is.
  assert.equal(botAction(state, 0, defs).spot, null);
  act(state, { type: "pick", player: 0, spot: ACTIVE });
  act(state, { type: "choose", player: 0, uids: [f] });
  // One Benched Pokémon: it goes there, and the next one is asked.
  assert.deepEqual(me.bench[0].energy, [f]);
  assert.equal(state.pending[0].effect.op, "rearrangeFrom");
  act(state, { type: "pick", player: 0, spot: 0 });
  assert.deepEqual(me.active.energy, [w, f]);
  act(state, { type: "pick", player: 0, spot: null });
  assert.equal(state.current, 1);
  state = labgame("lab-n4", "lab-2");
  const b = attachNew(state, state.players[0].bench[0], W);
  use(state, 0, "Gather");
  act(state, { type: "pick", player: 0, spot: 0 });
  assert.ok(state.players[0].active.energy.includes(b));
});

test("remaining Prize cards counted, two Benched Pokémon healed, Energy types in the discard pile with a cap", () => {
  let state = labgame("lab-n4", "lab-2");
  use(state, 0, "Absorb");
  assert.equal(state.players[1].active.damage, 40 * state.players[0].prizes.length);
  state = labgame("lab-n4", "lab-2");
  const me = state.players[0];
  me.bench.push({ ...me.bench[0], uid: hold(state, 0, "base1-63"), energy: [], damage: 30 });
  me.hand.pop();
  me.bench[0].damage = 20;
  use(state, 0, "Mend");
  act(state, { type: "pick", player: 0, spot: 0 });
  act(state, { type: "pick", player: 0, spot: 1 });
  assert.deepEqual(me.bench.map((s) => s.damage), [0, 0]);
  state = labgame("lab-n4", "lab-2");
  state.players[0].discard = [W, F, G, W].map((id) => hold(state, 0, id));
  state.players[0].hand.splice(-4);
  use(state, 0, "Shake");
  assert.equal(state.players[1].active.damage, 20 + 40);
});

/* ---------- attack text batch 4 ---------- */

/** A lab Pokémon with more to it than lab(): its own subtypes, types, HP, Weakness or Resistance. */
const labMon = (id, { subtypes = ["Basic"], types = ["Colorless"], hp = "200", name = "Lab", ...more }, attacks) => byId.set(id, { id, name, supertype: "Pokémon", subtypes, types, hp, ...more, attacks: attacks.map(([n, damage, text]) => ({ name: n, cost: [], damage: String(damage), text })) });
labMon("lab-v", { subtypes: ["Basic", "V"], name: "Lab V" }, [["Poke", 10, ""]]);
labMon("lab-gx", { subtypes: ["Basic", "GX"], name: "Lab-GX" }, [["Poke", 10, ""]]);
lab("lab-q1", [
  ["Rest", 0, "Remove all damage counters from this Pokémon."],
  ["Mend", 0, "Heal all damage from all of your Pokémon."],
  ["Spring", 0, "Heal 30 damage from each Pokémon (both yours and your opponent's)."],
  ["Nap", 0, "Draw a card. If you do, this Pokémon is now Asleep."],
  ["Lure", 0, "Switch 1 of your opponent's Benched Pokémon with their Active Pokémon. The new Active Pokémon is now Confused."],
  ["Ram", 20, "If your opponent has any Benched Pokémon, he or she chooses 1 of them and switches it with the Defending Pokémon. (Do the damage before switching the Pokémon.)"],
  ["Spin", 20, "Switch this Pokémon with 1 of your Benched Pokémon. If you do, your opponent switches their Active Pokémon with 1 of their Benched Pokémon."],
  ["Plunder", 20, "Before doing damage, discard all Trainer cards attached to the Defending Pokémon."],
]);

test("all damage healed, every Pokémon healed (theirs too), a draw that puts it to sleep", () => {
  let state = labgame("lab-q1", "lab-2");
  const me = state.players[0], foe = state.players[1];
  me.active.damage = 120;
  use(state, 0, "Rest");
  assert.equal(me.active.damage, 0);
  state = labgame("lab-q1", "lab-2");
  state.players[0].active.damage = 50;
  state.players[0].bench[0].damage = 30;
  use(state, 0, "Mend");
  assert.deepEqual([state.players[0].active.damage, state.players[0].bench[0].damage], [0, 0]);
  state = labgame("lab-q1", "lab-2");
  state.players[0].active.damage = 50;
  state.players[1].active.damage = 20;
  state.players[1].bench[0].damage = 40;
  use(state, 0, "Spring");
  assert.deepEqual([state.players[0].active.damage, state.players[1].active.damage, state.players[1].bench[0].damage], [20, 0, 10]);
  state = labgame("lab-q1", "lab-2");
  const hand = state.players[0].hand.length;
  use(state, 0, "Nap");
  assert.equal(state.players[0].hand.length, hand + 1);
  assert.ok(conditionsOn(state.players[0].active).includes("asleep"));
  // An empty deck: nothing drawn, so it doesn't fall asleep.
  state = labgame("lab-q1", "lab-2");
  state.players[0].deck = [];
  use(state, 0, "Nap");
  assert.ok(!conditionsOn(state.players[0].active).includes("asleep"));
  void me; void foe;
});

test("a new Active Pokémon pulled in and Confused; the old switching wordings", () => {
  let state = labgame("lab-q1", "lab-2");
  const benched = state.players[1].bench[0].uid;
  use(state, 0, "Lure");
  act(state, { type: "pick", player: 0, spot: 0 });
  assert.equal(state.players[1].active.uid, benched);
  assert.ok(conditionsOn(state.players[1].active).includes("confused"));
  assert.ok(!conditionsOn(state.players[1].bench[0]).includes("confused"));
  // Nobody on their Bench: nothing switched, nobody Confused.
  state = labgame("lab-q1", "lab-2");
  state.players[1].bench = [];
  use(state, 0, "Lure");
  assert.ok(!conditionsOn(state.players[1].active).includes("confused"));
  state = labgame("lab-q1", "lab-2");
  const before = state.players[1].active.uid;
  use(state, 0, "Ram");
  assert.equal(state.players[1].bench[0].uid, before, "one on the Bench: switched");
  assert.equal(state.players[1].bench[0].damage, 20, "the damage went on the old Active Pokémon");
  // "If you do": its own switch first, then theirs.
  state = labgame("lab-q1", "lab-2");
  const mine = state.players[0].active.uid;
  use(state, 0, "Spin");
  act(state, { type: "pick", player: 0, spot: 0 });
  assert.equal(state.players[0].bench[0].uid, mine);
  assert.equal(state.players[1].bench[0].uid, before);
  state = labgame("lab-q1", "lab-2");
  state.players[0].bench = [];
  use(state, 0, "Spin");
  assert.equal(state.players[1].active.uid, before, "no switch of its own, none of theirs");
  assert.deepEqual(compileAttack("If your opponent has any Benched Pokémon, he or she chooses 1 of them and switches it with his or her Active Pokémon, then, if you have any Benched Pokémon, you switch 1 of them with your Active Pokémon. (Do the damage before switching the Pokémon.)").map((s) => s.op), ["switchFoe", "switchSelf"]);
});

test("Trainer cards on the Defending Pokémon discarded before the damage", () => {
  const state = labgame("lab-q1", "lab-2");
  const foe = state.players[1];
  foe.active.tool = hold(state, 1, TOOL.cape);
  foe.hand.pop();
  foe.active.held = [{ uid: hold(state, 1, T.potion), less: 20 }];
  foe.hand.pop();
  use(state, 0, "Plunder");
  assert.equal(foe.active.tool, undefined);
  assert.equal(foe.active.held, undefined);
  assert.equal(foe.active.damage, 20, "nothing it held softened the damage");
  assert.equal(foe.discard.length >= 2, true);
});

labMon("lab-q2", { types: ["Water"] }, [
  ["Leaf", 0, "This attack does 20 damage to 1 of your opponent's Pokémon for each Energy attached to this Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)"],
  ["Pierce", 0, "This attack does 50 damage to 1 of your opponent's Pokémon. This attack's damage isn't affected by Weakness or Resistance, or by any effects on that Pokémon."],
  ["Typed", 0, "This attack does 30 damage to 1 of your opponent's Pokémon. Also apply Weakness and Resistance for Benched Pokémon."],
  ["Basics", 0, "This attack does 30 damage to each of your opponent's Benched Basic Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)"],
  ["Vee", 0, "This attack does 60 damage to each of your opponent's Pokémon V. This damage isn't affected by Weakness or Resistance."],
  ["Coins", 0, "For each of your opponent's Pokémon, flip a coin. If heads, this attack does 30 damage to that Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)"],
  ["Hail", 0, "Flip 2 coins. This attack does 10 damage times the number of heads to each of your opponent's Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)"],
  ["Shot", 0, "Discard an Energy from this Pokémon, and this attack does 40 damage to 1 of your opponent's Pokémon. (Don't apply Weakness or Resistance for Benched Pokemon)."],
]);

test("damage to some of their Pokémon by a count, past everything on them, with Weakness on the Bench, only to some kinds", () => {
  let state = labgame("lab-q2", "lab-2");
  const me = state.players[0];
  attachNew(state, me.active, W);
  const units = me.active.energy.length;
  use(state, 0, "Leaf");
  act(state, { type: "pick", player: 0, spot: 0 });
  assert.equal(state.players[1].bench[0].damage, 20 * units);
  // Past an effect that keeps the Bench safe, and past Weakness on the Active Pokémon.
  state = labgame("lab-q2", "base1-4");
  use(state, 0, "Pierce");
  act(state, { type: "pick", player: 0, spot: ACTIVE });
  assert.equal(state.players[1].active.damage, 50);
  state = labgame("lab-q2", "lab-2");
  state.cards[state.players[1].bench[0].uid] = "base1-24";
  use(state, 0, "Typed");
  act(state, { type: "pick", player: 0, spot: 0 });
  assert.equal(state.players[1].bench[0].damage, 60, "Weakness on the Bench too (a Charmeleon, weak to Water)");
  state = labgame("lab-q2", "lab-2");
  state.players[1].bench.push({ ...state.players[1].bench[0], uid: hold(state, 1, "base1-24"), damage: 0, energy: [] });
  state.players[1].hand.pop();
  use(state, 0, "Basics");
  assert.deepEqual(state.players[1].bench.map((s) => s.damage), [30, 0], "the Stage 1 Pokémon is spared");
  state = labgame("lab-q2", "lab-v");
  use(state, 0, "Vee");
  assert.equal(state.players[1].active.damage, 60);
  assert.equal(state.players[1].bench[0].damage, 0, "not a Pokémon V");
  state = labgame("lab-q2", "lab-2");
  rigFlips(state, [false, true]);
  use(state, 0, "Coins");
  assert.deepEqual([state.players[1].active.damage, state.players[1].bench[0].damage], [0, 30]);
  state = labgame("lab-q2", "lab-2");
  rigFlips(state, [true, true]);
  use(state, 0, "Hail");
  assert.deepEqual([state.players[1].active.damage, state.players[1].bench[0].damage], [20, 20]);
  state = labgame("lab-q2", "lab-2");
  const n = state.players[0].active.energy.length;
  use(state, 0, "Shot");
  if (state.pending[0]?.type === "choose") act(state, { type: "choose", player: 0, uids: state.pending[0].uids.slice(0, 1) });
  act(state, { type: "pick", player: 0, spot: 0 });
  assert.equal(state.players[0].active.energy.length, n - 1);
  assert.equal(state.players[1].bench[0].damage, 40);
});

lab("lab-q3", [
  ["Charge", 0, "Attach any number of basic Energy cards from your hand to your Pokémon in any way you like."],
  ["Fetch", 0, "Search your deck for up to 2 basic Energy cards and attach them to your Pokémon V in any way you like. Then, shuffle your deck."],
  ["Count", 0, "If your opponent's Active Pokémon has exactly 4 damage counters on it, that Pokémon is Knocked Out."],
  ["Gouge", 0, "Knock Out your opponent's Active Pokémon. If your opponent's Active Pokémon is Knocked Out in this way, this Pokémon does 150 damage to itself."],
  ["Ruin", 0, "At the end of your opponent's next turn, the Defending Pokémon will be Knocked Out."],
  ["Impact", 30, "Put 3 damage counters on 1 of your Pokémon."],
  ["Echo", 0, "Move all damage counters from 1 of your Benched Pokémon to your opponent's Active Pokémon."],
  ["Pain", 0, "Put up to 3 damage counters on this Pokémon. This attack does 40 damage for each damage counter you placed in this way."],
]);

test("Energy from the hand in any way you like; from the deck onto Pokémon V only", () => {
  let state = labgame("lab-q3", "lab-2");
  const me = state.players[0];
  const a = hold(state, 0, W), b = hold(state, 0, F);
  use(state, 0, "Charge");
  assert.equal(state.pending[0].type, "choose");
  assert.equal(state.pending[0].min, 0);
  act(state, { type: "choose", player: 0, uids: [a, b] });
  act(state, { type: "pick", player: 0, spot: ACTIVE });
  act(state, { type: "pick", player: 0, spot: 0 });
  assert.ok(me.active.energy.includes(a) && me.bench[0].energy.includes(b));
  // Only the Pokémon V may take it: the Active one here, never the Squirtle on the Bench.
  state = labgame("lab-q3", "lab-2");
  state.cards[state.players[0].bench[0].uid] = "lab-v";
  use(state, 0, "Fetch");
  const pick = state.pending[0].uids.slice(0, 2);
  act(state, { type: "choose", player: 0, uids: pick });
  for (const _ of pick) {
    assert.deepEqual(state.pending[0].spots, [0]);
    act(state, { type: "pick", player: 0, spot: 0 });
  }
  assert.ok(pick.every((uid) => state.players[0].bench[0].energy.includes(uid)), "the only Pokémon V");
});

test("Knock Outs: by an exact count of damage counters, outright with a price, at the end of their next turn", () => {
  let state = labgame("lab-q3", "lab-2");
  const prizes = state.players[0].prizes.length;
  state.players[1].active.damage = 30;
  use(state, 0, "Count");
  assert.equal(state.players[0].prizes.length, prizes, "3 counters: not 4");
  state = labgame("lab-q3", "lab-2");
  state.players[1].active.damage = 40;
  use(state, 0, "Count");
  assert.equal(state.players[0].prizes.length, prizes - 1);
  state = labgame("lab-q3", "lab-2");
  use(state, 0, "Gouge");
  assert.equal(state.players[0].active.damage, 150);
  assert.equal(state.players[0].prizes.length, prizes - 1);
  // Nothing Knocked Out (it is protected): no damage to itself.
  state = labgame("lab-q3", "lab-2");
  addMark(state, state.players[1].active, { kind: "shield", turn: state.turn });
  use(state, 0, "Gouge");
  assert.equal(state.players[0].active.damage, 0);
  state = labgame("lab-q3", "lab-2");
  use(state, 0, "Ruin");
  assert.equal(state.players[1].active.damage, 0);
  act(state, { type: "end", player: 1 });
  assert.equal(state.players[0].prizes.length, prizes - 1, "Knocked Out at the end of their turn");
});

test("damage counters on its own side, moved over, as many as it likes for more damage", () => {
  let state = labgame("lab-q3", "lab-2");
  use(state, 0, "Impact");
  assert.equal(state.pending[0].effect.op, "damage");
  act(state, { type: "pick", player: 0, spot: 0 });
  assert.equal(state.players[0].bench[0].damage, 30);
  state = labgame("lab-q3", "lab-2");
  state.players[0].bench[0].damage = 40;
  use(state, 0, "Echo");
  act(state, { type: "pick", player: 0, spot: 0 });
  assert.deepEqual(state.pending[0].spots, [ACTIVE], "only to their Active Pokémon");
  act(state, { type: "pick", player: 0, spot: ACTIVE });
  assert.equal(state.players[0].bench[0].damage, 0);
  assert.equal(state.players[1].active.damage, 40);
  state = labgame("lab-q3", "lab-2");
  use(state, 0, "Pain");
  assert.deepEqual(state.pending[0].labels, ["0", "1", "2", "3"]);
  act(state, { type: "option", player: 0, index: 2 });
  assert.equal(state.players[0].active.damage, 20);
  assert.equal(state.players[1].active.damage, 80);
});

lab("lab-q4", [
  ["Curse", 0, "Place 1 damage counter on your opponent's Active Pokémon for each card in your hand."],
  ["Half", 0, "Does damage to the Defending Pokémon equal to half the Defending Pokémon's remaining HP (rounded up to the nearest 10)."],
  ["Barrier", 0, "During your opponent's next turn, prevent all damage done to this Pokémon by attacks from Pokémon V."],
  ["Bounty", 200, "If your opponent's Pokémon-GX or Pokémon-EX is Knocked Out by damage from this attack, take 1 more Prize card."],
  ["Blade", 0, "Take a Prize card."],
  ["Flush", 0, "Shuffle all Energy from each of your opponent's Pokémon into their deck."],
  ["Gust", 0, "Put 1 of your opponent's Benched Pokémon and all cards attached to them into your opponent's hand."],
  ["Tide", 0, "Shuffle your opponent's Active Pokémon and all cards attached to it into their deck. If your opponent has no Benched Pokémon, this attack does nothing."],
]);
lab("lab-q5", [
  ["Shift", 0, "Move an Energy from your opponent's Active Pokémon to 1 of their Benched Pokémon."],
  ["Mimic", 0, "Choose 1 of your opponent's Pokémon's attacks and use it as this attack."],
  ["Drain", 60, "Remove a number of damage counters from this Pokémon equal to half the damage done to the Defending Pokémon (after applying Weakness and Resistance) (rounded up to the nearest 10). If this Pokémon has fewer damage counters than that, remove all of them."],
]);

test("damage counters by a count, half their HP, protection from some attackers, Prize cards taken", () => {
  let state = labgame("lab-q4", "lab-2");
  const hand = state.players[0].hand.length;
  use(state, 0, "Curse");
  assert.equal(state.players[1].active.damage, hand * 10);
  state = labgame("lab-q4", "lab-2");
  state.players[1].active.damage = 50;
  use(state, 0, "Half");
  assert.equal(state.players[1].active.damage, 50 + 80, "150 left: 75, up to 80");
  state = labgame("lab-q4", "lab-2");
  use(state, 0, "Barrier");
  state.cards[state.players[1].active.uid] = "lab-v";
  act(state, { type: "attack", player: 1, index: 0 });
  assert.equal(state.players[0].active.damage, 0, "a Pokémon V's attack does nothing to it");
  state = labgame("lab-q4", "lab-2");
  use(state, 0, "Barrier");
  act(state, { type: "attack", player: 1, index: attackIndex(state, 1, "Sting") });
  assert.ok(state.players[0].active.damage > 0, "any other's still does");
  state = labgame("lab-q4", "lab-gx");
  const prizes = state.players[0].prizes.length;
  use(state, 0, "Bounty");
  assert.equal(state.players[0].prizes.length, prizes - 3, "a Pokémon-GX is worth 2, and 1 more");
  state = labgame("lab-q4", "lab-v");
  state.players[1].active.damage = maxHp(state, state.players[1].active, defs) - 200;
  use(state, 0, "Bounty");
  assert.equal(state.players[0].prizes.length, prizes - 2, "a Pokémon V is not a Pokémon-GX");
  state = labgame("lab-q4", "lab-2");
  use(state, 0, "Blade");
  assert.equal(state.players[0].prizes.length, prizes - 1);
  // The last one wins.
  state = labgame("lab-q4", "lab-2");
  state.players[0].prizes.splice(1);
  use(state, 0, "Blade");
  assert.equal(state.phase, "over");
  assert.equal(state.winner, 0);
});

test("their Energy shuffled into their deck, their Pokémon sent away, an Energy of theirs moved", () => {
  let state = labgame("lab-q4", "lab-2");
  const foe = state.players[1];
  const sent = [attachNew(state, foe.active, F), attachNew(state, foe.bench[0], F)];
  use(state, 0, "Flush");
  assert.deepEqual([foe.active.energy.length, foe.bench[0].energy.length], [0, 0]);
  assert.ok(sent.every((uid) => foe.deck.includes(uid) || foe.hand.includes(uid)), "into the deck (they have drawn since)");
  state = labgame("lab-q4", "lab-2");
  const benched = state.players[1].bench[0].uid;
  use(state, 0, "Gust");
  act(state, { type: "pick", player: 0, spot: 0 });
  assert.ok(state.players[1].hand.includes(benched));
  assert.equal(state.players[1].bench.length, 0);
  state = labgame("lab-q4", "lab-2");
  const active = state.players[1].active.uid;
  use(state, 0, "Tide");
  assert.ok(state.players[1].deck.includes(active));
  assert.equal(state.pending[0].type, "promote");
  state = labgame("lab-q4", "lab-2");
  state.players[1].bench = [];
  use(state, 0, "Tide");
  assert.equal(state.players[1].active.uid, active, "no Benched Pokémon: the attack does nothing");
  state = labgame("lab-q5", "lab-2");
  const e = attachNew(state, state.players[1].active, F);
  use(state, 0, "Shift");
  act(state, { type: "pick", player: 0, spot: 0 });
  assert.deepEqual(state.players[1].bench[0].energy, [e]);
  assert.deepEqual(state.players[1].active.energy, []);
});

test("any of their Pokémon's attacks copied; healed by half the damage done", () => {
  let state = labgame("lab-q5", "lab-2");
  use(state, 0, "Mimic");
  assert.equal(state.pending[0].why, "copy");
  const names = state.pending[0].labels;
  assert.ok(names.includes("Sting") && names.includes(defs("base1-46").attacks[0].name), "the Benched Charmander's too");
  act(state, { type: "option", player: 0, index: names.indexOf("Sting") });
  assert.ok(conditionsOn(state.players[1].active).includes("poisoned"));
  state = labgame("lab-q5", "lab-2");
  state.players[0].active.damage = 100;
  use(state, 0, "Drain");
  assert.equal(state.players[0].active.damage, 70);
});

test("more wordings read: counts, tests, small differences in print", () => {
  const steps = (text, name) => compileAttack(text, name);
  assert.deepEqual(steps("This attack does 30 damage for each of your Darkness Pokémon in play.")[0], { op: "bonusPer", when: "before", how: "times", n: 30, per: "ownType", type: "Darkness" });
  assert.deepEqual(steps("This attack does 50 more damage for each Leon card in your discard pile.")[0].type, "trainer~Leon");
  assert.deepEqual(steps("This attack does 10 more damage for each Ancient card in your discard pile.")[0].type, "+Ancient");
  assert.equal(steps("This attack does 20 damage for each Item card in your opponent's discard pile.")[0].per, "foeDiscardKind");
  assert.equal(steps("Does 20 damage plus 20 more damage for each Nidoking you have in play.")[0].per, "ownNamed");
  assert.equal(steps("If this Pokémon is Burned or Poisoned, this attack does 60 more damage.")[0].test, "selfStatusOf");
  assert.equal(steps("If the Defending Pokémon is a Stage 2 Evolved Pokémon, this attack does 30 damage plus 30 more damage.")[0].line, 2);
  assert.equal(steps("If you have at least 4 Water Energy in play, this attack does 90 more damage.")[0].test, "ownEnergyAtLeast");
  assert.equal(steps("If your opponent's Active Pokémon has Fighting Resistance, this attack does 50 more damage.")[0].type, "Fighting");
  assert.deepEqual(steps("If this Pokémon didn't move from the Bench to the Active Spot this turn, this attack does nothing.")[0], { op: "cancelIf", when: "before", test: "movedUp", not: true });
  // "Pokemon", "Weakness or Resistance", the switch reminder, "(after doing damage)".
  assert.ok(steps("This attack does 20 damage to 1 of your opponent's Benched Pokemon. (Don't apply Weakness or Resistance for Benched Pokemon)."));
  assert.deepEqual(steps("Flip a coin. If tails, Electabuzz is now Confused (after doing damage).", "Electabuzz")[0].tails[0], { op: "condition", when: "after", kind: "confused", self: true });
  assert.deepEqual(steps("Does 10 damage plus 10 more damage for each damage counter on this Pokémon. Then, remove 2 damage counters from this Pokémon.")[1], { op: "healSelf", when: "after", n: 20 });
  // Both tails and nothing; otherwise once for each heads, after the damage.
  assert.equal(steps("Flip 2 coins. If both are tails, this attack does nothing. For each heads, discard an Energy attached to the Defending Pokémon.")[0].op, "flipCount");
});

/* ---------- attack text batch 5 ---------- */

lab("lab-b5", [
  ["Pack", 30, "This attack does 30 damage for each of your Benched Water Pokémon."],
  ["Sum", 10, "This attack does 10 more damage for each damage counter on all of your opponent's Pokémon."],
  ["Ahead", 0, "You can use this attack only if you have more Prize cards remaining than your opponent."],
  ["Call", 0, "Search your deck for a Basic Pokémon named Squirtle and put it onto your Bench. Shuffle your deck afterward. (You can't use this attack if your Bench is full.)"],
  ["Lead", 10, ""],
  ["Follow", 60, "You can use this attack only if this Pokémon used Lead during your last turn."],
  ["Gift", 0, "Attach an Energy card from your hand to 1 of your Benched Pokémon. If you do, heal 120 damage from that Pokémon."],
  ["Spray", 0, "You may attach up to 2 Water Energy cards from your hand to your Pokémon in any way you like. If you do, heal 30 damage from those Pokémon for each card you attached to them in this way."],
]);
lab("lab-b6", [
  ["Share", 0, "For each of your Benched Pokémon, search your deck for a Water Energy card and attach it to that Pokémon. Then, shuffle your deck."],
  ["Tide", 0, "This attack does 20 damage for each Water Energy card in your discard pile. Then, shuffle those cards into your deck."],
  ["Peek", 0, "Look at the top card of your deck. You may discard that card."],
  ["Stir", 0, "Shuffle your opponent's deck."],
  ["Muster", 0, "Look at the top 8 cards of your deck. You may put any number of Pokémon you find there onto your Bench. Shuffle the other cards back into your deck."],
  ["Coach", 10, "If you played Lab Coach from your hand during this turn, this attack does 90 more damage."],
  ["Grown", 10, "If this Pokémon evolved from Squirtle during this turn, this attack does 90 more damage."],
  ["Drop", 10, "Discard the top card from your opponent's deck."],
]);

test("batch 5 wordings are read", () => {
  for (const id of ["lab-b5", "lab-b6"]) for (const a of defs(id).attacks) assert.ok(!a.plain, a.name);
  const steps = (text, name) => compileAttack(text, name);
  // Pokémon of a kind: by type, tag, rule box, name; Energy of a kind on Pokémon; types of Energy.
  assert.deepEqual(steps("This attack does 20 damage for each of your Rapid Strike Pokémon in play.")[0], { op: "bonusPer", when: "before", how: "times", n: 20, per: "ownKind", type: "+Rapid Strike" });
  assert.ok(defs("swsh5-83").tags.includes("Rapid Strike"), "Rapid Strike is kept as a tag");
  assert.equal(steps("This attack does 60 damage for each of your opponent's Pokémon V and Pokémon-GX in play.")[0].type, "box=V|box=VMAX|box=VSTAR|box=GX");
  assert.equal(steps("This attack does 50 damage for each Tatsugiri in your discard pile.")[0].type, "name=Tatsugiri");
  assert.equal(steps("This attack does 50 damage for each Fire Energy and each Lightning Energy attached to all of your Pokémon.")[0].type, "Fire,Lightning");
  assert.equal(steps("This attack does 70 damage for each Special Energy card attached to this Pokémon.")[0].type, "self|special");
  assert.equal(steps("This attack does 30 more damage for each type of basic Energy attached to this Pokémon.")[0].per, "energyTypes");
  // Tests: Pokémon of a kind on the Bench, Prize cards left, a Trainer played this turn, evolved this turn.
  assert.deepEqual(steps("If Latias is on your Bench, this attack does 20 more damage.")[0], { op: "bonusIf", when: "before", n: 20, test: "ownHasKind", what: "name=Latias", bench: true });
  assert.equal(steps("If you have only 1 Prize card remaining, this attack does 90 more damage.")[0].test, "prizesAtMost");
  assert.equal(steps("If this Pokémon has any Plasma Energy attached to it, this attack does 40 more damage.")[0].name, "Plasma Energy");
  assert.equal(steps("If your opponent's Active Pokémon is a Tera Pokémon, this attack does 230 more damage.")[0].what, "tera");
  // Still not read: "Water or Lightning Energy" is two kinds this reader doesn't join.
  assert.equal(steps("Look at the top 12 cards of your deck and attach any number of Water or Lightning Energy cards you find there to your Pokémon in any way you like. Shuffle the other cards back into your deck."), null);
});

test("Pokémon and damage counters counted on both sides", () => {
  let state = labgame("lab-b5", "lab-2");
  use(state, 0, "Pack");
  assert.equal(state.players[1].active.damage, 30 * state.players[0].bench.filter((s) => defs(state.cards[s.uid]).types.includes("Water")).length);
  state = labgame("lab-b5", "lab-2");
  state.players[1].active.damage = 20;
  state.players[1].bench[0].damage = 30;
  use(state, 0, "Sum");
  assert.equal(state.players[1].active.damage, 20 + 10 + 50);
});

test("an attack that can be used only sometimes is offered only then", () => {
  let state = labgame("lab-b5", "lab-2");
  const ahead = attackIndex(state, 0, "Ahead");
  assert.ok(!usableAttacks(state, 0, defs).includes(ahead), "same Prize cards: not offered");
  throws(() => use(state, 0, "Ahead"), /can't be used now/);
  state.players[1].prizes.pop();
  assert.ok(usableAttacks(state, 0, defs).includes(ahead), "more Prize cards left than theirs: offered");
  // The Bench full: no search onto it.
  state = labgame("lab-b5", "lab-2");
  const call = attackIndex(state, 0, "Call");
  assert.ok(usableAttacks(state, 0, defs).includes(call));
  while (state.players[0].bench.length < state.rules.bench) benchSlot(state, 0, "base1-63");
  assert.ok(!usableAttacks(state, 0, defs).includes(call));
  // Only after this Pokémon used Lead on the player's last turn.
  state = labgame("lab-b5", "lab-2");
  const follow = attackIndex(state, 0, "Follow");
  assert.ok(!usableAttacks(state, 0, defs).includes(follow));
  use(state, 0, "Lead");
  act(state, { type: "end", player: 1 });
  assert.ok(usableAttacks(state, 0, defs).includes(follow));
  act(state, { type: "end", player: 0 });
  act(state, { type: "end", player: 1 });
  assert.ok(!usableAttacks(state, 0, defs).includes(follow), "two turns on: not any more");
  // An Ability used first this turn doesn't wipe what this Pokémon did last turn (slot.used is the Ability's mark).
  state = labgame("lab-b5", "lab-2");
  use(state, 0, "Lead");
  act(state, { type: "end", player: 1 });
  state.players[0].active.used = { uid: state.players[0].active.uid, turn: state.turn };
  assert.ok(usableAttacks(state, 0, defs).includes(follow));
});

test("Energy attached, then the Pokémon that took it healed", () => {
  let state = labgame("lab-b5", "lab-2");
  const me = state.players[0];
  me.bench[0].damage = 50;
  const w = give(state, 0, W);
  use(state, 0, "Gift");
  act(state, { type: "choose", player: 0, uids: [w] });
  act(state, { type: "pick", player: 0, spot: 0 });
  assert.equal(me.bench[0].damage, 0);
  assert.ok(me.bench[0].energy.includes(w));
  // For each card attached: two on one Pokémon heal 60 there.
  state = labgame("lab-b5", "lab-2");
  const us = state.players[0];
  us.active.damage = 100;
  const cards = [give(state, 0, W), give(state, 0, W)];
  use(state, 0, "Spray");
  act(state, { type: "choose", player: 0, uids: cards });
  act(state, { type: "pick", player: 0, spot: ACTIVE });
  act(state, { type: "pick", player: 0, spot: ACTIVE });
  assert.equal(us.active.damage, 40);
});

test("an Energy card for each Benched Pokémon, a different one each; discard-pile cards counted, then shuffled back", () => {
  let state = labgame("lab-b6", "lab-2");
  const me = state.players[0];
  benchSlot(state, 0, "base1-63");
  use(state, 0, "Share");
  const water = state.pending[0].uids.filter((uid) => state.cards[uid] === W).slice(0, 2);
  act(state, { type: "choose", player: 0, uids: water });
  act(state, { type: "pick", player: 0, spot: 1 });
  assert.deepEqual(state.pending[0].spots, [0], "the Pokémon that took one isn't offered again");
  act(state, { type: "pick", player: 0, spot: 0 });
  assert.deepEqual(me.bench.map((s) => s.energy.filter((uid) => water.includes(uid)).length), [1, 1]);
  state = labgame("lab-b6", "lab-2");
  state.players[0].discard = [W, W, F].map((id) => hold(state, 0, id));
  state.players[0].hand.splice(-3);
  const deck = state.players[0].deck.length;
  use(state, 0, "Tide");
  assert.equal(state.players[1].active.damage, 40);
  assert.deepEqual(state.players[0].discard.map((uid) => state.cards[uid]), [F]);
  assert.equal(state.players[0].deck.length, deck + 2);
});

test("a look at the top card, a deck shuffled, Pokémon from the top onto the Bench, the top card of theirs discarded", () => {
  let state = labgame("lab-b6", "lab-2");
  const top = state.players[0].deck[0];
  use(state, 0, "Peek");
  assert.deepEqual(state.pending[0].uids, [top]);
  act(state, { type: "choose", player: 0, uids: [top] });
  assert.ok(state.players[0].discard.includes(top));
  state = labgame("lab-b6", "lab-2");
  const theirs = state.players[1].deck.slice();
  use(state, 0, "Stir");
  // Their turn has begun (a card drawn): the rest of the deck is the same cards.
  assert.ok(state.players[1].deck.length === theirs.length - 1 && state.players[1].deck.every((uid) => theirs.includes(uid)));
  state = labgame("lab-b6", "lab-2");
  const look = state.players[0].deck.slice(0, 8);
  use(state, 0, "Muster");
  assert.ok(state.pending[0].uids.every((uid) => look.includes(uid) && defs(state.cards[uid]).stage === "basic"));
  state = labgame("lab-b6", "lab-2");
  const next = state.players[1].deck[0];
  use(state, 0, "Drop");
  assert.ok(state.players[1].discard.includes(next));
});

test("the bot plays through decks of the batch 5 attacks", () => {
  for (let i = 0; i < 6; i += 1) {
    const a = deckOf(["lab-b5", 8], ["base1-63", 6], [W, 12]);
    const b = deckOf(["lab-b6", 8], ["base1-46", 6], [W, 6], [F, 6]);
    playOut([a, b], "half", 1500 + i);
  }
});

const LAB_COACH = labTrainer("Coach", "Supporter", "Draw 3 cards.");
test("a Trainer played this turn by name, and evolved from a named Pokémon this turn", () => {
  let state = labgame("lab-b6", "lab-2");
  use(state, 0, "Coach");
  assert.equal(state.players[1].active.damage, 10);
  state = labgame("lab-b6", "lab-2");
  act(state, { type: "play", player: 0, uid: hold(state, 0, LAB_COACH) });
  use(state, 0, "Coach");
  assert.equal(state.players[1].active.damage, 100);
  state = labgame("lab-b6", "lab-2");
  const slot = state.players[0].active;
  slot.under = [hold(state, 0, "base1-63")];
  state.players[0].hand.pop();
  slot.evolvedOn = state.turn;
  use(state, 0, "Grown");
  assert.equal(state.players[1].active.damage, 100);
});

/* ---------- attack text batch 6: Rapid Strike, Single Strike, Fusion Strike ---------- */

lab("lab-b7", [
  ["Cross", 10, "If 1 of your other Rapid Strike Pokémon used an attack during your last turn, this attack does 90 more damage."],
  ["Mirror", 0, "Choose 1 of your Benched Fusion Strike Pokémon's attacks and use it as this attack."],
  ["Mend", 10, "If your opponent's Active Pokémon has any damage counters on it, this attack does 30 more damage and heal 30 damage from this Pokémon."],
  ["Unite", 0, "This attack does 30 damage for each Fusion Strike Energy attached to all of your Pokémon."],
]);
byId.set("lab-rs", { id: "lab-rs", name: "Lab", supertype: "Pokémon", subtypes: ["Basic", "Rapid Strike"], types: ["Colorless"], hp: "200", attacks: [{ name: "Jab", cost: [], damage: "10", text: "" }] });
byId.set("lab-fs", { id: "lab-fs", name: "Lab", supertype: "Pokémon", subtypes: ["Basic", "Fusion Strike"], types: ["Colorless"], hp: "200", attacks: [{ name: "Fuse", cost: [], damage: "70", text: "" }] });

test("batch 6 wordings are read", () => {
  for (const a of defs("lab-b7").attacks) assert.ok(!a.plain, a.name);
  const steps = (text, name) => compileAttack(text, name);
  assert.deepEqual(steps("Search your deck for a Psychic Energy card and attach it to 1 of your Fusion Strike Pokémon. Then, shuffle your deck.")[0].steps, [{ op: "fetchEnergy", what: "basicEnergy:Psychic", n: 1, to: "one", where: { to: "any", who: "+Fusion Strike" } }]);
  assert.equal(steps("Search your deck for up to 3 Basic Rapid Strike Pokémon and put them onto your Bench. Then, shuffle your deck.")[0].steps[0].what, "basic+Rapid Strike");
  assert.equal(steps("If you played a Rapid Strike Supporter card from your hand during this turn, this attack does 50 more damage.")[0].what, "supporter+Rapid Strike");
  // A history test after the damage too: "this attack also does 160 damage to 1 of your opponent's Benched Pokémon".
  assert.equal(steps("If 1 of your other Rapid Strike Pokémon used an attack during your last turn, this attack also does 160 damage to 1 of your opponent's Benched Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)")[0].op, "ifTest");
  // Not read: the effect after "and" is before the damage.
  assert.equal(steps("If there is any Stadium card in play, this attack does 50 more damage, and this attack's damage isn't affected by Resistance."), null);
});

test("another Rapid Strike Pokémon's attack last turn; a Benched Fusion Strike Pokémon's attack used", () => {
  let state = labgame("lab-b7", "lab-2");
  benchSlot(state, 0, "lab-rs");
  use(state, 0, "Cross");
  assert.equal(state.players[1].active.damage, 10, "nobody attacked last turn");
  state = labgame("lab-b7", "lab-2");
  benchSlot(state, 0, "lab-rs");
  state.players[0].attacks = [{ turn: state.turn - 2, name: "Jab", who: "Lab", uid: state.players[0].bench.at(-1).uid }];
  use(state, 0, "Cross");
  assert.equal(state.players[1].active.damage, 100);
  // This Pokémon itself doesn't count, nor one that isn't Rapid Strike.
  state = labgame("lab-b7", "lab-2");
  state.players[0].attacks = [{ turn: state.turn - 2, name: "Cross", who: "Lab", uid: state.players[0].active.uid }];
  use(state, 0, "Cross");
  assert.equal(state.players[1].active.damage, 10);
  // Mirror: only Fusion Strike Pokémon on the Bench are offered.
  state = labgame("lab-b7", "lab-2");
  benchSlot(state, 0, "lab-rs");
  benchSlot(state, 0, "lab-fs");
  use(state, 0, "Mirror");
  const choice = state.pending[0];
  if (choice?.type === "option") {
    assert.deepEqual(choice.labels, ["Fuse"]);
    act(state, { type: "option", player: 0, index: 0 });
  }
  assert.equal(state.players[1].active.damage, 70);
});

test("more damage and a heal on one test, asked before the damage", () => {
  let state = labgame("lab-b7", "lab-2");
  state.players[0].active.damage = 50;
  use(state, 0, "Mend");
  assert.equal(state.players[1].active.damage, 10, "no counters on theirs before: no more damage");
  assert.equal(state.players[0].active.damage, 50, "and no heal, though the attack put counters there");
  state = labgame("lab-b7", "lab-2");
  state.players[0].active.damage = 50;
  state.players[1].active.damage = 10;
  use(state, 0, "Mend");
  assert.equal(state.players[1].active.damage, 50);
  assert.equal(state.players[0].active.damage, 20);
});

/* ---------- attack text batch 7: the Lost Zone, next-turn marks, coins counted after the damage ---------- */

lab("lab-l1", [
  ["Shed", 0, "Put 2 Energy attached to this Pokémon in the Lost Zone."],
  ["Void", 0, "Put the top 2 cards of your opponent's deck in the Lost Zone."],
  ["Grab", 0, "Put a random card from your opponent's hand in the Lost Zone."],
  ["Gone", 10, "If the Defending Pokémon is Knocked Out by this attack, put the Defending Pokémon and all cards attached to it in the Lost Zone instead of the discard pile."],
  ["Count", 0, "This attack does 20 damage for each of your Pokémon in the Lost Zone."],
]);
lab("lab-l2", [
  ["Weigh", 0, "During your opponent's next turn, the Defending Pokémon's attacks cost Colorless more."],
  ["Mud", 0, "During your opponent's next turn, the Defending Pokémon's Retreat Cost is Colorless more."],
  ["Endure", 0, "Flip a coin. If heads, if this Pokémon would be Knocked Out by damage from an attack during your opponent's next turn, it is not Knocked Out, and its remaining HP becomes 10."],
  ["Mirror", 0, "During your opponent's next turn, if this Pokémon is damaged by an attack (even if it is Knocked Out), put damage counters on the Attacking Pokémon equal to the damage done to this Pokémon."],
  ["Blaze", 100, "This Pokémon can't use Blaze again until it leaves the Active Spot."],
]);
lab("lab-l3", [
  ["Pecks", 20, "Flip 2 coins. This attack does 20 damage times the number of heads. If either of them is heads, the Defending Pokémon is now Paralyzed."],
  ["Gust", 0, "Flip 2 coins. If both of them are tails, this attack does nothing. For each heads, discard an Energy attached to the Defending Pokémon."],
  ["Win", 0, "If you use this attack when you have exactly 1 Prize card remaining, you win this game."],
  ["Bloom", 0, "Heal 20 damage from each of your Pokémon that has any Energy attached to it."],
  ["Soothe", 0, "Heal 30 damage from both Active Pokémon."],
]);
lab("lab-l4", [
  ["Nap", 0, "At the end of your opponent's next turn, the Defending Pokémon is now Confused."],
  ["Strip", 0, "Your opponent reveals their hand. Discard all Item cards you find there."],
  ["Send", 0, "Choose 1 of your opponent's Benched Pokémon. They shuffle that Pokémon and all attached cards into their deck."],
  ["Brink", 0, "Put damage counters on 1 of your opponent's Pokémon until its remaining HP is 50."],
]);
lab("lab-l9", [
  ["Hit", 50, ""],
  ["Big", 300, ""],
]);

/** Answer each pending choice of cards with the first ones it allows. */
function chooseFirst(state, p) {
  while (state.pending[0]?.type === "choose" && state.pending[0].player === p) {
    const waiting = state.pending[0];
    act(state, { type: "choose", player: p, uids: waiting.uids.slice(0, Math.max(waiting.min || 0, 1)) });
  }
}

test("batch 7 wordings are read", () => {
  for (const id of ["lab-l1", "lab-l2", "lab-l3", "lab-l4"]) for (const a of defs(id).attacks) assert.ok(!a.plain, a.name);
  const steps = (text, name) => compileAttack(text, name);
  assert.deepEqual(steps("Put 2 Energy attached to your opponent's Active Pokémon in the Lost Zone.")[0], { op: "discardFoeEnergy", when: "after", n: 2, lost: true });
  assert.equal(steps("This attack does 20 damage for each Pokémon Tool card in the Lost Zone (both yours and your opponent's).")[0].per, "lostBoth");
  assert.equal(steps("During your next turn, this Pokémon's Blaze attack does 150 more damage.")[0].name, "Blaze");
  assert.deepEqual(steps("Flip 4 coins. This attack does 20 damage times the number of heads. If you get 2 or more heads, the Defending Pokémon is now Confused.")[1].min, 2);
  // Not read: a misprint ("Flip a coins ... 2 or more heads") whose heads can never come up.
  assert.equal(steps("Flip a coins. This attack does 30 damage times the number of heads. If you get 2 or more heads, this Pokémon is now Confused."), null);
});

test("the Lost Zone: Energy, deck, hand, and a Pokémon Knocked Out go there; and are counted", () => {
  let state = labgame("lab-l1", "lab-2");
  const me = state.players[0];
  while (me.active.energy.length < 3) {
    const uid = give(state, 0, W);
    me.hand = me.hand.filter((u) => u !== uid);
    me.active.energy.push(uid);
  }
  const had = me.active.energy.length;
  use(state, 0, "Shed");
  chooseFirst(state, 0);
  assert.equal(me.active.energy.length, had - 2);
  assert.equal(me.lost.length, 2);
  assert.ok(me.lost.every((uid) => !me.discard.includes(uid)));
  state = labgame("lab-l1", "lab-2");
  use(state, 0, "Void");
  assert.equal(state.players[1].lost.length, 2);
  state = labgame("lab-l1", "lab-2");
  const hand = state.players[1].hand.length;
  use(state, 0, "Grab");
  assert.equal(state.players[1].lost.length, 1);
  assert.equal(state.players[1].hand.length, hand - 1 + 1, "one gone, one drawn for their turn");
  // Knocked Out by this attack: into the Lost Zone, attached cards too.
  state = labgame("lab-l1", "lab-2");
  const foe = state.players[1].active;
  foe.damage = 190;
  const gone = [foe.uid, ...foe.energy];
  use(state, 0, "Gone");
  for (const uid of gone) {
    assert.ok(state.players[1].lost.includes(uid), uid);
    assert.ok(!state.players[1].discard.includes(uid), uid);
  }
  // Counted: their own Pokémon there.
  state = labgame("lab-l1", "lab-2");
  for (const id of ["base1-63", "base1-63", T.potion]) {
    const uid = hold(state, 0, id);
    state.players[0].hand.pop();
    state.players[0].lost = [...(state.players[0].lost || []), uid];
  }
  use(state, 0, "Count");
  assert.equal(state.players[1].active.damage, 40);
});

test("next-turn marks: costs more, retreats for more, endures, damage back, not again until it leaves", () => {
  let state = labgame("lab-l2", "lab-l9");
  state.players[1].active.energy = [];
  use(state, 0, "Weigh");
  assert.deepEqual(usableAttacks(state, 1, defs), [], "free attacks cost Colorless now");
  act(state, { type: "end", player: 1 });
  act(state, { type: "end", player: 0 });
  assert.ok(usableAttacks(state, 1, defs).length > 0, "only for that turn");
  state = labgame("lab-l2", "lab-l9");
  const before = retreatCost(state, state.players[1].active, defs);
  use(state, 0, "Mud");
  assert.equal(retreatCost(state, state.players[1].active, defs), before + 1);
  // Endures on heads: left with 10 HP.
  state = labgame("lab-l2", "lab-l9");
  state.players[0].active.damage = 100;
  rigFlips(state, [true]);
  use(state, 0, "Endure");
  use(state, 1, "Big");
  assert.equal(state.players[0].active.damage, 190);
  state = labgame("lab-l2", "lab-l9");
  state.players[0].active.damage = 100;
  rigFlips(state, [false]);
  use(state, 0, "Endure");
  use(state, 1, "Big");
  assert.deepEqual(state.pending, [{ type: "promote", player: 0 }], "tails: Knocked Out");
  // Damage done comes back as counters.
  state = labgame("lab-l2", "lab-l9");
  use(state, 0, "Mirror");
  use(state, 1, "Hit");
  assert.equal(state.players[1].active.damage, 50);
  // Not again while it stays Active.
  state = labgame("lab-l2", "lab-l9");
  const blaze = attackIndex(state, 0, "Blaze");
  use(state, 0, "Blaze");
  act(state, { type: "end", player: 1 });
  assert.ok(!usableAttacks(state, 0, defs).includes(blaze));
  throws(() => use(state, 0, "Blaze"), /can't use Blaze/);
  act(state, { type: "end", player: 0 });
  act(state, { type: "end", player: 1 });
  assert.ok(!usableAttacks(state, 0, defs).includes(blaze), "still not, turns on");
});

test("coins counted after the damage, a win on the last Prize card, heals on each and both", () => {
  let state = labgame("lab-l3", "lab-2");
  rigFlips(state, [true, false]);
  use(state, 0, "Pecks");
  assert.equal(state.players[1].active.damage, 20);
  assert.deepEqual(conditionsOn(state.players[1].active), ["paralyzed"]);
  state = labgame("lab-l3", "lab-2");
  rigFlips(state, [false, false]);
  use(state, 0, "Pecks");
  assert.deepEqual(conditionsOn(state.players[1].active), []);
  // One Energy off for each heads.
  state = labgame("lab-l3", "lab-2");
  const foe = state.players[1];
  for (let i = 0; i < 3; i += 1) {
    const uid = give(state, 1, F);
    foe.hand = foe.hand.filter((u) => u !== uid);
    foe.active.energy.push(uid);
  }
  const had = foe.active.energy.length;
  rigFlips(state, [true, true]);
  use(state, 0, "Gust");
  chooseFirst(state, 0);
  assert.equal(foe.active.energy.length, had - 2);
  // Exactly 1 Prize card left: the game is won.
  state = labgame("lab-l3", "lab-2");
  use(state, 0, "Win");
  assert.equal(state.winner ?? null, null);
  state = labgame("lab-l3", "lab-2");
  state.players[0].prizes = state.players[0].prizes.slice(0, 1);
  use(state, 0, "Win");
  assert.equal(state.winner, 0);
  // Heals: only Pokémon with Energy; both Active Pokémon.
  state = labgame("lab-l3", "lab-2");
  const me = state.players[0];
  me.active.damage = 50;
  me.bench[0].energy = [];
  me.bench[0].damage = 30;
  use(state, 0, "Bloom");
  assert.equal(me.active.damage, me.active.energy.length ? 30 : 50);
  assert.equal(me.bench[0].damage, 30);
  state = labgame("lab-l3", "lab-2");
  state.players[0].active.damage = 50;
  state.players[1].active.damage = 50;
  use(state, 0, "Soothe");
  assert.equal(state.players[0].active.damage, 20);
  assert.equal(state.players[1].active.damage, 20);
});

test("a condition at the end of their next turn, their Items discarded, a Benched Pokémon shuffled away, HP brought down", () => {
  let state = labgame("lab-l4", "lab-2");
  use(state, 0, "Nap");
  assert.deepEqual(conditionsOn(state.players[1].active), []);
  act(state, { type: "end", player: 1 });
  assert.deepEqual(conditionsOn(state.players[1].active), ["confused"]);
  state = labgame("lab-l4", "lab-2");
  const potion = hold(state, 1, T.potion);
  const research = hold(state, 1, T.research);
  use(state, 0, "Strip");
  assert.ok(state.players[1].discard.includes(potion));
  assert.ok(state.players[1].hand.includes(research), "a Supporter stays");
  state = labgame("lab-l4", "lab-2");
  const benched = state.players[1].bench[0].uid;
  use(state, 0, "Send");
  if (state.pending[0]?.type === "pick") act(state, { type: "pick", player: 0, spot: 0 });
  assert.ok(!state.players[1].bench.some((s) => s.uid === benched));
  assert.ok(state.players[1].deck.includes(benched) || state.players[1].hand.includes(benched));
  state = labgame("lab-l4", "lab-2");
  use(state, 0, "Brink");
  act(state, { type: "pick", player: 0, spot: ACTIVE });
  assert.equal(state.players[1].active.damage, 150);
});

/* ---------- batch 8 ---------- */

lab("lab-m1", [
  ["Erase", 0, "Discard 1 of your opponent's Pokémon and all cards attached to it. If this Pokémon has at least 3 extra Energy attached to it (in addition to this attack's cost), discard 2 of your opponent's Pokémon instead."],
  ["Prize", 0, "Add the top 2 cards of your opponent's deck to their Prize cards."],
  ["Double", 0, "Double the number of damage counters on each of your opponent's Pokémon."],
  ["Hunt", 10, "During your next turn, this Pokémon's attacks do 30 more damage to the Defending Pokémon (before applying Weakness and Resistance)."],
]);
lab("lab-m2", [
  ["Jinx", 0, "Whenever your opponent flips a coin during their next turn, treat it as tails."],
  ["Bar", 0, "For the rest of this game, your opponent can't use any GX attacks."],
  ["Hush", 0, "Your opponent can't play any cards from their hand during their next turn."],
  ["Trim", 0, "Discard random cards from your opponent's hand until they have 3 cards in their hand."],
]);
lab("lab-m3", [
  ["Daze", 0, "Your opponent's Active Pokémon is now Confused. Put 6 damage counters instead of 3 on that Pokémon for this Special Condition."],
  ["Toxin", 0, "Your opponent's Active Pokémon is now Poisoned. It now takes 40 Poison damage instead of 10 after each player's turn (even if it was already Poisoned)."],
  ["Wipe", 0, "Discard all Energy from both Active Pokémon."],
  ["Refill", 0, "Each player draws cards until they have 6 cards in their hand."],
]);

test("batch 8 wordings are read, and the ones that can't be done right are not", () => {
  for (const id of ["lab-m1", "lab-m2", "lab-m3"]) for (const a of defs(id).attacks) assert.ok(!a.plain, a.name);
  const steps = (text, name) => compileAttack(text, name);
  assert.deepEqual(steps("This attack does 30 more damage for each extra Fire Energy attached to this Pokémon (in addition to this attack's cost). You can't add more than 90 damage in this way.")[0], { op: "bonusPer", when: "before", n: 30, per: "spareEnergy", type: "Fire", cap: 90 });
  assert.equal(steps("Put up to 2 Basic Pokémon from your discard pile onto your Bench.")[0].steps[0].what, "basic");
  assert.equal(steps("If your opponent's Basic Pokémon is Knocked Out by damage from this attack, take 1 more Prize card.")[0].what, "basic");
  assert.deepEqual(steps("Prevent all effects of attacks, including damage, done to this Pokémon by your opponent's Pokémon-ex during your opponent's next turn.")[0].from.startsWith("box:"), true);
  assert.equal(steps("If your opponent has any Ultra Beasts in play, this attack can be used for Colorless.")[0].op, "costIf");
  assert.deepEqual(steps("Flip 2 coins. If both are heads, your opponent's Active Pokémon is now Paralyzed.")[1].min, 2);
  assert.deepEqual(steps("Flip 2 coins. If both are tails, your opponent's Active Pokémon is now Paralyzed.")[1].max, 0);
  assert.equal(steps("This attack does 20 damage to 1 of your opponent's Benched Pokémon for each damage counter on that Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)")[0].perCounter, true);
  assert.deepEqual(steps("This attack does 100 damage to each of your opponent's Pokémon-GX and Pokémon-EX. This damage isn't affected by Weakness or Resistance.")[0].boxes, ["GX", "EX"]);
  // Tests that hang on the damage itself are not read as if judged before it.
  assert.equal(steps("If your opponent's Active Pokémon has any damage counters on it, this attack also does 30 damage to each of your opponent's Benched Pokémon."), null);
  // Not read: Energy the attack itself attaches, counted as extra or not (Aero Unit-GX).
  assert.equal(steps("Attach up to 2 basic Energy cards from your discard pile to this Pokémon. If this Pokémon has at least 1 extra Water Energy attached to it (in addition to this attack's cost), heal all damage from it."), null);
});

test("their Pokémon discarded (no Prize cards), Prize cards added, damage counters doubled, more damage to the Defending Pokémon", () => {
  let state = labgame("lab-m1", "lab-2");
  const foe = state.players[1];
  const benched = foe.bench[0];
  const gone = [benched.uid, ...benched.energy];
  const prizes = state.players[0].prizes.length;
  use(state, 0, "Erase");
  act(state, { type: "pick", player: 0, spot: 0 });
  for (const uid of gone) assert.ok(foe.discard.includes(uid), uid);
  assert.ok(!foe.bench.some((s) => s.uid === benched.uid));
  assert.equal(state.players[0].prizes.length, prizes, "no Prize cards for it");
  state = labgame("lab-m1", "lab-2");
  const had = state.players[1].prizes.length;
  const top = state.players[1].deck.slice(0, 2);
  use(state, 0, "Prize");
  assert.equal(state.players[1].prizes.length, had + 2);
  for (const uid of top) assert.ok(state.players[1].prizes.includes(uid));
  state = labgame("lab-m1", "lab-2");
  state.players[1].active.damage = 30;
  state.players[1].bench[0].damage = 20;
  use(state, 0, "Double");
  assert.equal(state.players[1].active.damage, 60);
  assert.equal(state.players[1].bench[0].damage, 40);
  state = labgame("lab-m1", "lab-2");
  use(state, 0, "Hunt");
  assert.equal(state.players[1].active.damage, 10);
  act(state, { type: "end", player: 1 });
  use(state, 0, "Hunt");
  assert.equal(state.players[1].active.damage, 50, "30 more on the Defending Pokémon");
});

test("their coins all tails, GX attacks barred, no cards from the hand, the hand cut down", () => {
  let state = labgame("lab-m2", "lab-2");
  use(state, 0, "Jinx");
  for (let i = 0; i < 20; i += 1) assert.equal(flip(state, 1), false);
  act(state, { type: "end", player: 1 });
  let heads = 0;
  for (let i = 0; i < 20; i += 1) heads += flip(state, 0) ? 1 : 0;
  assert.ok(heads > 0, "only their coins, only that turn");
  state = labgame("lab-m2", "lab-2");
  use(state, 0, "Bar");
  assert.ok(state.players[1].gxBarred);
  state = labgame("lab-m2", "lab-2");
  hold(state, 1, T.potion);
  give(state, 1, "base1-46");
  use(state, 0, "Hush");
  const fromHand = legalActions(state, 1, defs).filter((a) => ["bench", "evolve", "attach", "play", "tool"].includes(a.type));
  assert.deepEqual(fromHand, []);
  act(state, { type: "end", player: 1 });
  act(state, { type: "end", player: 0 });
  assert.ok(legalActions(state, 1, defs).some((a) => ["bench", "play"].includes(a.type)), "only for that turn");
  state = labgame("lab-m2", "lab-2");
  for (let i = 0; i < 4; i += 1) hold(state, 1, T.potion);
  use(state, 0, "Trim");
  assert.equal(state.players[1].hand.length, 4, "3 left, then their draw");
});

test("Confusion and Poison that count for more, Energy off both, each player draws up to a number", () => {
  let state = labgame("lab-m3", "lab-2");
  use(state, 0, "Daze");
  assert.deepEqual(conditionsOn(state.players[1].active), ["confused"]);
  assert.equal(state.players[1].active.status.confuseN, 60);
  state = labgame("lab-m3", "lab-2");
  use(state, 0, "Toxin");
  assert.equal(state.players[1].active.damage, 40, "Poison at the end of the turn: 40");
  state = labgame("lab-m3", "lab-2");
  state.players[1].active.energy.push(give(state, 1, F));
  state.players[1].hand = state.players[1].hand.filter((u) => !state.players[1].active.energy.includes(u));
  use(state, 0, "Wipe");
  assert.deepEqual(state.players[0].active.energy, []);
  assert.deepEqual(state.players[1].active.energy, []);
  state = labgame("lab-m3", "lab-2");
  state.players[0].hand = state.players[0].hand.slice(0, 2);
  state.players[1].hand = state.players[1].hand.slice(0, 1);
  use(state, 0, "Refill");
  assert.equal(state.players[0].hand.length, 6);
  assert.equal(state.players[1].hand.length, 7, "6, then their draw");
});

/* ---------- batch 9 ---------- */

lab("lab-b91", [
  ["Reap", 0, "Knock Out each of your opponent's Pokémon that has 50 HP or less remaining."],
  ["Claw", 0, "Knock Out 1 of your opponent's Pokémon in play that has 60 HP or less remaining."],
  ["Acid", 10, "The Defending Pokémon has no Abilities until the end of your next turn."],
  ["Boom", 0, "This Pokémon is Knocked Out."],
]);
lab("lab-b92", [
  ["Zap", 10, "You may discard all Water Energy attached to this Pokémon. If you do, the Defending Pokémon is now Burned and Confused."],
  ["Wake", 0, "Remove all Special Conditions from your opponent's Active Pokémon."],
  ["Toss", 0, "Discard a card from your hand. If you can't, this attack does nothing."],
  ["Avenge", 10, "This attack does 50 more damage for each Prize card your opponent took during their last turn."],
]);
lab("lab-b93", [
  ["Gamble", 10, "You may flip a coin. If heads, this attack does 60 more damage. If tails, this attack does nothing."],
  ["Rest", 0, "Heal 30 damage from this Pokémon. This Pokémon can't retreat during your next turn."],
  ["Trash", 0, "This attack does 10 damage for each Pokémon in your discard pile. You can't do more than 30 damage in this way."],
  ["Mend", 0, "Heal all damage from 1 of your Pokémon. Then, discard all Energy attached to this Pokémon."],
]);

test("batch 9 wordings are read, and the ones that can't be done right are not", () => {
  for (const id of ["lab-b91", "lab-b92", "lab-b93"]) for (const a of defs(id).attacks) assert.ok(!a.plain, a.name);
  const steps = (text, name) => compileAttack(text, name);
  // An owner's name or a card suffix still reads as this Pokémon.
  assert.deepEqual(steps("Erika's Dragonair does 20 damage to itself.", "Erika's Dragonair"), [{ op: "selfDamage", when: "after", n: 20 }]);
  assert.ok(steps("Remove 2 damage counters from Garchomp.", "Garchomp LV.X"));
  assert.deepEqual(steps("Flip a coin. If heads, this attack does 30 more damage and your opponent's Active Pokémon is now Paralyzed. If tails, this Pokémon does 10 damage to itself.").map((st) => st.op), ["flipBonus", "onCoin"]);
  assert.deepEqual(steps("Your opponent can't play any Supporter cards from their hand during their next turn."), [{ op: "lockHand", when: "after", kinds: ["supporter"] }]);
  assert.deepEqual(steps("Discard all Pokémon Tools from each of your opponent's Pokémon."), [{ op: "stripFoeAll", when: "after", special: false }]);
  assert.deepEqual(steps("The Defending Pokémon can't retreat or use any Poké-Powers during your opponent's next turn.").map((st) => st.op), ["mute", "mark"]);
  assert.deepEqual(steps("If your opponent's Active Pokémon has 100 HP or less remaining, it is Knocked Out."), [{ op: "when", when: "after", test: "foeHpAtMost", k: 100, steps: [{ op: "knockOut" }] }]);
  assert.deepEqual(steps("If you go second, this attack does 60 more damage during your first turn."), [{ op: "bonusIf", when: "before", n: 60, test: "secondFirst" }]);
  assert.deepEqual(steps("If your opponent has already used their GX attack, this attack does 80 more damage."), [{ op: "bonusIf", when: "before", n: 80, test: "foeGxUsed" }]);
  assert.deepEqual(steps("If the Defending Pokémon is Durant, this attack does 50 more damage."), [{ op: "bonusIf", when: "before", n: 50, test: "foeIs", what: "name=Durant" }]);
  assert.equal(steps("If the Defending Pokémon is Fighting, this attack does 50 more damage."), null, "a type, not a name");
  assert.deepEqual(steps("Discard 1 Fire Energy and 1 Lightning Energy attached to this Pokémon.").map((st) => st.type), ["Fire", "Lightning"]);
  assert.deepEqual(steps("Flip 2 coins. If 1 or both of them are tails, this attack does nothing."), [{ op: "flipCancel", when: "before", coins: 2 }]);
  assert.deepEqual(steps("If the Defending Pokémon is Knocked Out by this attack, take 1 more Prize card."), [{ op: "bounty", when: "before", n: 1 }]);
  assert.deepEqual(steps("Discard a Plasma Energy attached to this Pokémon. If you can't discard a Plasma Energy, this attack does nothing.").map((st) => st.op), ["cancelIf", "discardEnergy"]);
  assert.equal(steps("If your opponent has any Benched Pokémon, choose 1 of them and flip a coin. If heads, this attack does 30 damage to that Pokémon.")[0].heads[0].n, 30);
  assert.equal(steps("Flip a coin. If heads, search your deck for any 1 card and put it into your hand. Shuffle your deck afterward.")[0].heads[0].steps[0].what, "any");
  // Searching for a named Pokémon reads as it always did.
  assert.deepEqual(steps("Search your deck for up to 2 Surskit and put them onto your Bench. Then, shuffle your deck.")[0].steps[0], { op: "search", what: "name=Surskit", n: 2, to: "bench" });
  // Not read: a Pokémon Power lock on every Pokémon they have (it reaches ones played later), and a Base Set misprint.
  assert.equal(steps("Your opponent can't use Poké-Powers on his or her Pokémon during your opponent's next turn."), null);
});

test("Knock Outs by HP left, no Abilities, Knocking itself Out", () => {
  let state = labgame("lab-b91", "lab-2");
  const foe = state.players[1];
  const small = foe.bench[0].uid; // Charmander, 50 HP
  foe.active.damage = 140; // 60 left
  use(state, 0, "Reap");
  assert.ok(foe.discard.includes(small), "50 HP left: Knocked Out");
  assert.equal(foe.active.damage, 140, "60 HP left: not");
  state = labgame("lab-b91", "lab-2");
  state.players[1].active.damage = 140;
  use(state, 0, "Claw");
  const waiting = state.pending[0];
  assert.equal(waiting.type, "pick");
  assert.deepEqual([...waiting.spots].sort(), [ACTIVE, 0].sort(), "both have 60 HP or less left");
  act(state, { type: "pick", player: 0, spot: ACTIVE });
  assert.ok(state.players[1].discard.includes(state.players[1].discard.find((u) => state.cards[u] === "lab-2")), "the chosen one is Knocked Out");
  // No Abilities: a mark on the Defending Pokémon that lasts until the end of the attacker's next turn.
  state = labgame("lab-b91", "lab-2");
  const target = state.players[1].active;
  use(state, 0, "Acid");
  assert.ok(target.marks.some((m) => m.kind === "noAbility" && m.from === "Ability"));
  state = labgame("lab-b91", "lab-2");
  const self = state.players[0].active.uid;
  use(state, 0, "Boom");
  assert.ok(state.players[0].discard.includes(self), "Knocked Out by its own attack");
});

test("may pay for an effect, their Special Conditions removed, a card from the hand or nothing, Prize cards they took", () => {
  let state = labgame("lab-b92", "lab-2");
  state.players[0].active.energy = [];
  use(state, 0, "Zap");
  assert.ok(!state.pending.some((w) => w.why === "mayDo"), "nothing to discard: not asked");
  assert.deepEqual(conditionsOn(state.players[1].active), []);
  state = labgame("lab-b92", "lab-2");
  state.players[0].active.energy.push(give(state, 0, W));
  state.players[0].hand = state.players[0].hand.filter((u) => !state.players[0].active.energy.includes(u));
  use(state, 0, "Zap");
  assert.equal(state.pending.at(-1).why, "mayDo");
  act(state, { type: "option", player: 0, index: 1 });
  assert.deepEqual(conditionsOn(state.players[1].active), [], "said no");
  state = labgame("lab-b92", "lab-2");
  use(state, 0, "Zap");
  act(state, { type: "option", player: 0, index: 0 });
  assert.deepEqual(state.players[0].active.energy, [], "paid");
  assert.deepEqual(conditionsOn(state.players[1].active).sort(), ["burned", "confused"]);
  state = labgame("lab-b92", "lab-2");
  state.players[1].active.status = { ...(state.players[1].active.status || {}), poisoned: true, burned: true };
  use(state, 0, "Wake");
  assert.deepEqual(conditionsOn(state.players[1].active), []);
  state = labgame("lab-b92", "lab-2");
  state.players[0].hand = [];
  use(state, 0, "Toss");
  assert.equal(state.players[1].active.damage, 0);
  state = labgame("lab-b92", "lab-2");
  state.players[1].taken = [{ turn: state.turn - 1, n: 2 }];
  use(state, 0, "Avenge");
  assert.equal(state.players[1].active.damage, 110, "10 and 2 Prize cards' worth");
});

test("a coin it may flip, a rest that pins it, damage held to a limit, healing 1 of yours", () => {
  let state = labgame("lab-b93", "lab-2");
  state.players[0].active.damage = 50;
  use(state, 0, "Rest");
  assert.equal(state.players[0].active.damage, 20);
  assert.ok(state.players[0].active.marks.some((m) => m.kind === "noRetreat"));
  state = labgame("lab-b93", "lab-2");
  for (let i = 0; i < 5; i += 1) state.players[0].discard.push(give(state, 0, "base1-63"));
  use(state, 0, "Trash");
  assert.equal(state.players[1].active.damage, 30, "no more than 30");
  state = labgame("lab-b93", "lab-2");
  state.players[0].bench[0].damage = 30;
  use(state, 0, "Mend");
  if (state.pending.length) act(state, { type: "pick", player: 0, spot: 0 });
  assert.equal(state.players[0].bench[0].damage, 0);
  assert.deepEqual(state.players[0].active.energy, []);
});

/* ---------- Trainers played as Pokémon (Fossils, Clefairy Doll) ---------- */

// Claw Fossil (ex2-90) and Anorith (ex2-28), with Charmander to start.
const fossilDeck = deckOf(["ex2-90", 4], ["ex2-28", 4], ["base1-46", 12], [F, 10]);
/** Player 0's turn, turn 3 or later, a fossil deck against Squirtles. */
function fossilGame(deck = fossilDeck, seed = 3) {
  const state = started(seed, deck, water);
  while (!(state.current === 0 && state.turn >= 3)) act(state, { type: "end", player: state.current });
  return state;
}

test("a Fossil is an Item in the hand and a Basic Pokémon in play", () => {
  const def = defs("ex2-90");
  assert.equal(def.kind, "trainer");
  assert.equal(def.sub, "item");
  assert.ok(def.playable);
  assert.ok(fits(def, "item") && fits(def, "trainer~Fossil") && !fits(def, "basic"));
  assert.equal(def.fossil.mon.hp, 40);
  assert.deepEqual(def.fossil.mon.types, ["Colorless"]);
  assert.equal(def.fossil.mon.prizes, 0);
  assert.equal(def.fossil.mon.ability.name, "Jagged Stone");
  // Every version reads: base Mysterious Fossil, Clefairy Doll, the DP Fossils (which give a Prize card), Unidentified Fossil.
  for (const id of ["base1-70", "base3-62", "ex12-78", "ex12-80", "ex13-92", "dp2-116", "dp2-117", "sm11-210", "sv3pt5-152", "sm12-197"]) assert.ok(defs(id).playable, id);
  assert.equal(defs("dp2-117").fossil.mon.prizes, 1);
  assert.deepEqual(defs("base1-70").fossil.mon.types, []);
  assert.equal(defs("sm12-197").fossil.drop, "bottom");
  // It can't start the game: only Basic Pokémon cards are put down while setting up.
  const state = createGame({ decks: [fossilDeck, water], format: "half", seed: 5 }, defs);
  for (const a of legalActions(state, 0, defs)) assert.notEqual(defs(state.cards[a.active]).kind, "trainer");
});

test("a Fossil goes onto the Bench, evolves, can't retreat, has no Special Conditions and gives no Prize card", () => {
  const state = fossilGame();
  const uid = give(state, 0, "ex2-90");
  assert.ok(legalActions(state, 0, defs).some((a) => a.type === "play" && a.uid === uid));
  act(state, { type: "play", player: 0, uid });
  const slot = state.players[0].bench.at(-1);
  assert.equal(slot.uid, uid);
  assert.ok(!state.players[0].discard.includes(uid));
  // In play it is a 40-HP Colorless Basic Pokémon named Claw Fossil.
  const mon = defOf(state, uid, defs);
  assert.equal(mon.kind, "pokemon");
  assert.equal(mon.stage, "basic");
  assert.equal(maxHp(state, slot, defs), 40);
  // Not the turn it was played.
  const anorith = give(state, 0, "ex2-28");
  assert.ok(!legalActions(state, 0, defs).some((a) => a.type === "evolve" && a.uid === anorith));
  act(state, { type: "end", player: 0 });
  act(state, { type: "end", player: 1 });
  // Switched into the Active Spot it can't retreat, and no Special Condition sticks.
  const spot = state.players[0].bench.indexOf(slot);
  const old = state.players[0].active;
  state.players[0].active = slot;
  state.players[0].bench[spot] = old;
  assert.ok(!canRetreat(state, 0, defs));
  throws(() => act(state, { type: "retreat", player: 0, to: spot }), /can't retreat/);
  assert.equal(addCondition(state, slot, "poisoned", defs), false);
  assert.equal(addCondition(state, slot, "asleep", defs), false);
  // Knocked Out, it doesn't count: discarded, no Prize card for the other player.
  const prizes = state.players[1].prizes.length;
  slot.damage = 40;
  resolveKnockOuts(state, defs, []);
  assert.equal(state.players[1].prizes.length, prizes);
  assert.ok(state.players[0].discard.includes(uid));
  assert.equal(defOf(state, uid, defs).kind, "trainer", "a Trainer again in the discard pile");
  assert.ok(!(state.players[0].lostOn || []).length);
});

test("Anorith evolves from Claw Fossil; the Fossil goes with it", () => {
  const state = fossilGame();
  const uid = give(state, 0, "ex2-90");
  act(state, { type: "play", player: 0, uid });
  act(state, { type: "end", player: 0 });
  act(state, { type: "end", player: 1 });
  const anorith = give(state, 0, "ex2-28");
  const spot = state.players[0].bench.findIndex((s) => s.uid === uid);
  act(state, { type: "evolve", player: 0, uid: anorith, spot });
  const slot = state.players[0].bench[spot];
  assert.equal(slot.uid, anorith);
  assert.deepEqual(slot.under, [uid]);
  assert.equal(defOf(state, uid, defs).kind, "pokemon", "under Anorith it is still in play");
  // An evolved Fossil is an ordinary Pokémon: Knocked Out, it gives its Prize card and takes the Fossil with it.
  const prizes = state.players[1].prizes.length;
  slot.damage = 80;
  resolveKnockOuts(state, defs, []);
  assert.equal(state.players[1].prizes.length, prizes - 1);
  assert.ok(state.players[0].discard.includes(uid) && state.players[0].discard.includes(anorith));
});

test("a Fossil may be discarded from play during its owner's turn, and isn't a Knock Out", () => {
  const state = fossilGame();
  const uid = give(state, 0, "ex2-90");
  act(state, { type: "play", player: 0, uid });
  const spot = state.players[0].bench.findIndex((s) => s.uid === uid);
  state.players[0].bench[spot].energy.push(give(state, 0, F));
  assert.ok(legalActions(state, 0, defs).some((a) => a.type === "drop" && a.spot === spot));
  const prizes = state.players[1].prizes.length;
  act(state, { type: "drop", player: 0, spot });
  assert.ok(!state.players[0].bench.some((s) => s.uid === uid));
  assert.ok(state.players[0].discard.includes(uid));
  assert.equal(state.players[1].prizes.length, prizes);
  // From the Active Spot a new Active Pokémon comes up; with nothing else in play it can't be done.
  const second = give(state, 0, "ex2-90");
  act(state, { type: "play", player: 0, uid: second });
  const at = state.players[0].bench.findIndex((s) => s.uid === second);
  const old = state.players[0].active;
  state.players[0].active = state.players[0].bench[at];
  state.players[0].bench[at] = old;
  act(state, { type: "drop", player: 0, spot: ACTIVE });
  assert.equal(state.pending[0]?.type, "promote");
  act(state, { type: "promote", player: 0, spot: at });
  assert.equal(state.players[0].active.uid, old.uid);
  state.players[0].bench = [];
  const third = give(state, 0, "ex2-90");
  act(state, { type: "play", player: 0, uid: third });
  state.players[0].active = state.players[0].bench.pop();
  throws(() => act(state, { type: "drop", player: 0, spot: ACTIVE }), /no Pokémon left/);
  // Not on the other player's turn.
  act(state, { type: "end", player: 0 });
  assert.ok(!legalActions(state, 0, defs).some((a) => a.type === "drop"));
});

test("a Fossil needs room on the Bench and is an Item for Item locks", () => {
  const state = fossilGame();
  while (state.players[0].bench.length < state.rules.bench) act(state, { type: "bench", player: 0, uid: give(state, 0, "base1-46") });
  const uid = give(state, 0, "ex2-90");
  throws(() => act(state, { type: "play", player: 0, uid }), /Bench is full/);
  state.players[0].bench.pop();
  state.players[0].locks = { item: state.turn };
  throws(() => act(state, { type: "play", player: 0, uid }), /Item/);
});

test("DP Fossils: a Knock Out counts, Armor Stone and Skull Stone", () => {
  const dpDeck = deckOf(["dp2-116", 4], ["dp2-117", 4], ["base1-46", 12], [F, 10]);
  let state = fossilGame(dpDeck);
  const skull = give(state, 0, "dp2-117");
  act(state, { type: "play", player: 0, uid: skull });
  const slot = state.players[0].bench.at(-1);
  const prizes = state.players[1].prizes.length;
  slot.damage = 50;
  resolveKnockOuts(state, defs, []);
  assert.equal(state.players[1].prizes.length, prizes - 1, "this counts as a Knocked Out Pokémon");
  assert.equal(defs("dp2-116").fossil.mon.ability.soften, 10);
  assert.ok(defs("dp2-117").fossil.mon.ability.ko.untilTails);
  // Armor Stone: heads, heads, tails takes 20 off the attack.
  state = fossilGame(dpDeck);
  const armor = give(state, 0, "dp2-116");
  act(state, { type: "play", player: 0, uid: armor });
  const front = state.players[0].bench.pop();
  state.players[0].bench.push(state.players[0].active);
  state.players[0].active = front;
  act(state, { type: "end", player: 0 });
  // Charmeleon's Slash: 30, and a Fossil has no Weakness or Resistance.
  const foe = state.players[1].active;
  state.cards[foe.uid] = "base1-24";
  foe.energy.push(give(state, 1, W), give(state, 1, W), give(state, 1, W));
  rigFlips(state, [true, true, false]);
  act(state, { type: "attack", player: 1, index: 0 });
  assert.equal(front.damage, 10);
});

test("Fossil Excavator: the deck, or the discard pile when one there fits", () => {
  assert.ok(defs("dp2-111").playable);
  const deck = deckOf(["dp2-111", 4], ["dp2-117", 4], ["dp2-43", 4], ["base1-46", 8], [F, 10]);
  const state = fossilGame(deck);
  const ex = give(state, 0, "dp2-111");
  act(state, { type: "play", player: 0, uid: ex });
  // Nothing in the discard pile fits: straight to the deck.
  assert.equal(state.pending[0].type, "choose");
  assert.equal(state.pending[0].zone, "deck");
  assert.ok(state.pending[0].uids.length && state.pending[0].uids.every((u) => ["dp2-117", "dp2-43", "dp2-111"].includes(state.cards[u])), "Fossil Excavator itself has Fossil in its name");
  assert.ok(!state.pending[0].uids.includes(ex));
  act(state, { type: "choose", player: 0, uids: [state.pending[0].uids[0]] });
  state.players[0].discard.push(give(state, 0, "dp2-43"));
  const again = give(state, 0, "dp2-111");
  // A Supporter: one a turn, so on a later turn.
  act(state, { type: "end", player: 0 });
  act(state, { type: "end", player: 1 });
  act(state, { type: "play", player: 0, uid: again });
  assert.equal(state.pending[0].type, "option");
  act(state, { type: "option", player: 0, index: 1 });
  assert.equal(state.pending[0].zone, "discard");
});

test("the bot benches a Fossil it can evolve and discards a dead one", () => {
  const state = fossilGame();
  state.players[0].hand = [];
  const uid = give(state, 0, "ex2-90");
  give(state, 0, "ex2-28");
  const a = botAction(state, 0, defs);
  assert.deepEqual(a, { type: "play", player: 0, uid });
  act(state, a);
  // With no Anorith left anywhere it is only in the way.
  state.players[0].hand = [];
  state.players[0].deck = state.players[0].deck.filter((u) => state.cards[u] !== "ex2-28");
  const spot = state.players[0].bench.findIndex((s) => s.uid === uid);
  assert.deepEqual(botAction(state, 0, defs), { type: "drop", player: 0, spot });
});

test("Dan: Rock-Paper-Scissors until someone wins, each choosing unseen", () => {
  const dan = defs("swsh2-158");
  assert.ok(dan.playable);
  const deck = deckOf(["swsh2-158", 10], ["base1-46", 12], [F, 8]);
  const round = (mine, theirs) => {
    const state = fossilGame(deck);
    const uid = give(state, 0, "swsh2-158");
    const hand = state.players[0].hand.length;
    act(state, { type: "play", player: 0, uid });
    assert.equal(state.players[0].hand.length, hand - 1 + 2, "2 cards first");
    assert.equal(state.pending[0].why, "rps");
    assert.equal(state.pending[0].player, 0);
    act(state, { type: "option", player: 0, index: mine });
    // The other player chooses without seeing it.
    assert.equal(state.pending[0].player, 1);
    assert.equal(viewFor(state, 1).rps, undefined);
    assert.equal(viewFor(state, 0).rps.pick, mine);
    assert.ok(!JSON.stringify(viewFor(state, 1).pending).includes(`"k":${mine}`));
    const events = act(state, { type: "option", player: 1, index: theirs });
    return { state, hand, events };
  };
  // Paper beats Rock: 2 more cards.
  let { state, hand } = round(1, 0);
  assert.equal(state.players[0].hand.length, hand + 3);
  assert.ok(!state.pending.length && !state.rps);
  // Rock loses to Paper: none.
  ({ state, hand } = round(0, 1));
  assert.equal(state.players[0].hand.length, hand + 1);
  // Scissors beats Paper, Rock beats Scissors.
  assert.equal(round(2, 1).state.players[0].hand.length, round(2, 1).hand + 3);
  assert.equal(round(0, 2).state.players[0].hand.length, round(0, 2).hand + 3);
  // A tie plays again.
  const tie = round(2, 2);
  assert.equal(tie.events.find((e) => e.t === "rps").won, null);
  assert.equal(tie.state.pending[0].why, "rps");
  assert.equal(tie.state.pending[0].player, 0);
  act(tie.state, { type: "option", player: 0, index: 1 });
  act(tie.state, { type: "option", player: 1, index: 0 });
  assert.equal(tie.state.players[0].hand.length, tie.hand + 3);
  // The bot throws all three, both as the one who played Dan and as the other player.
  const seen = new Set();
  for (let seed = 1; seed < 40; seed += 1) {
    const s = fossilGame(deck, seed);
    act(s, { type: "play", player: 0, uid: give(s, 0, "swsh2-158") });
    const a = botAction(s, 0, defs);
    seen.add(a.index);
    act(s, a);
    seen.add(100 + botAction(s, 1, defs).index);
  }
  assert.equal(seen.size, 6);
});

/* ---------- Attacks lent by a Technical Machine or a Stadium ---------- */

/** Player 0's turn 3 or later with these cards in the deck; Charmander (base1-46) to start. */
function lendGame(extra, seed = 3) {
  const deck = deckOf(...extra, ["base1-46", 10], ["base1-24", 4], [F, 8], ["energy-fighting", 4], ["energy-lightning", 4]);
  return fossilGame(deck.slice(0, 30), seed);
}
const evolveFront = (state, id) => {
  const front = state.players[0].active;
  front.under.unshift(front.uid);
  front.uid = give(state, 0, id);
  return front;
};

test("Technical Machine TS-1: held on a Pokémon for good, which may use Evoluter (Colorless)", () => {
  const def = defs("dp6-136");
  assert.ok(def.playable && def.tm);
  assert.deepEqual(def.attacks[0].cost, ["Colorless"], "the card prints Colorless; our source lost it");
  const state = lendGame([["dp6-136", 2], ["base1-4", 2]]);
  const front = evolveFront(state, "base1-24");
  front.since = 1;
  const tm = give(state, 0, "dp6-136");
  act(state, { type: "play", player: 0, uid: tm });
  assert.equal(state.pending[0].type, "pick");
  act(state, { type: "pick", player: 0, spot: ACTIVE });
  assert.ok(front.held.some((h) => h.uid === tm && h.tm));
  assert.ok(!state.players[0].discard.includes(tm));
  // A second one can't go on the same Pokémon.
  const list = attacksOf(state, front, defs);
  assert.equal(list.length, defs("base1-24").attacks.length + 1);
  const at = list.findIndex((a) => a.name === "Evoluter");
  assert.equal(list[at].lent.card, "dp6-136");
  front.energy.push(give(state, 0, F));
  assert.ok(usableAttacks(state, 0, defs).includes(at));
  act(state, { type: "attack", player: 0, index: at });
  // Evoluter: Charizard from the deck onto Charmeleon.
  assert.equal(state.pending[0]?.type, "choose");
  const zard = state.pending[0].uids.find((u) => state.cards[u] === "base1-4");
  act(state, { type: "choose", player: 0, uids: [zard] });
  if (state.pending[0]?.type === "pick") act(state, { type: "pick", player: 0, spot: ACTIVE });
  assert.equal(front.uid, zard);
  // It stays after the turn.
  act(state, { type: "end", player: 1 });
  assert.ok(front.held.some((h) => h.uid === tm));
});

test("Miracle Sphere α: on an Evolved Fire, Lightning or Fighting Pokémon, its Energy pairs, gone at the end of the turn", () => {
  const def = defs("ecard3-129");
  assert.ok(def.playable);
  let state = lendGame([["ecard3-129", 2]]);
  // Not on a Basic Pokémon.
  const ms = give(state, 0, "ecard3-129");
  throws(() => act(state, { type: "play", player: 0, uid: ms }), /nothing/);
  const front = evolveFront(state, "base1-24");
  act(state, { type: "play", player: 0, uid: ms });
  if (state.pending[0]?.type === "pick") act(state, { type: "pick", player: 0, spot: ACTIVE });
  // Fire Force with Fire and Fighting: 30 and 10 more, and 3 damage counters off itself.
  front.energy.push(give(state, 0, F), give(state, 0, "energy-fighting"), give(state, 0, F));
  front.damage = 40;
  const foe = state.players[1].active;
  state.cards[foe.uid] = "base1-46"; // Charmander: no Weakness to Fire
  const at = attacksOf(state, front, defs).findIndex((a) => a.name === "Fire Force");
  act(state, { type: "attack", player: 0, index: at });
  assert.equal(foe.damage, 40);
  assert.equal(front.damage, 10);
  assert.deepEqual(conditionsOn(foe), [], "no Lightning: not Confused");
  // Discarded at the end of that turn.
  assert.ok(!(front.held || []).some((h) => h.uid === ms));
  assert.ok(state.players[0].discard.includes(ms));
  // With Fire and Lightning too: Confused as well.
  state = lendGame([["ecard3-129", 2]]);
  const second = evolveFront(state, "base1-24");
  act(state, { type: "play", player: 0, uid: give(state, 0, "ecard3-129") });
  if (state.pending[0]?.type === "pick") act(state, { type: "pick", player: 0, spot: ACTIVE });
  second.energy.push(give(state, 0, F), give(state, 0, "energy-lightning"), give(state, 0, F));
  state.cards[state.players[1].active.uid] = "base1-46";
  act(state, { type: "attack", player: 0, index: attacksOf(state, second, defs).findIndex((a) => a.name === "Fire Force") });
  assert.equal(state.players[1].active.damage, 30);
  assert.deepEqual(conditionsOn(state.players[1].active), ["confused"]);
});

test("Meteor Falls: an Active Evolved Pokémon may use its Basic Pokémon's attacks, not a Benched one", () => {
  assert.ok(defs("ex8-89").playable);
  const state = lendGame([["ex8-89", 2]]);
  const front = evolveFront(state, "base1-24");
  const own = defs("base1-24").attacks.length;
  assert.equal(attacksOf(state, front, defs).length, own);
  act(state, { type: "play", player: 0, uid: give(state, 0, "ex8-89") });
  const list = attacksOf(state, front, defs);
  assert.deepEqual(list.slice(own).map((a) => a.name), defs("base1-46").attacks.map((a) => a.name));
  assert.equal(list[own].lent.from, "under");
  // A Benched Evolved Pokémon, and a Basic one in front, get none.
  const bench = { ...front, uid: front.uid };
  state.players[0].bench.push(bench);
  assert.equal(attacksOf(state, bench, defs).length, own);
  state.players[0].bench.pop();
  // Scratch, paid for as printed.
  front.energy.push(give(state, 0, F));
  const scratch = list.findIndex((a) => a.name === "Scratch");
  assert.ok(usableAttacks(state, 0, defs).includes(scratch));
  state.cards[state.players[1].active.uid] = "base1-46";
  act(state, { type: "attack", player: 0, index: scratch });
  assert.equal(state.players[1].active.damage, 10);
});

test("Holon Lake: Pokémon with δ on their card may use Delta Call", () => {
  assert.ok(defs("ex13-87").playable);
  const state = lendGame([["ex13-87", 2], ["ex13-3", 4]]);
  const front = state.players[0].active;
  act(state, { type: "play", player: 0, uid: give(state, 0, "ex13-87") });
  assert.equal(attacksOf(state, front, defs).length, defs("base1-46").attacks.length, "Charmander has no δ");
  state.cards[front.uid] = "ex13-3";
  const list = attacksOf(state, front, defs);
  const call = list.findIndex((a) => a.name === "Delta Call");
  assert.ok(call >= 0);
  front.energy.push(give(state, 0, F));
  act(state, { type: "attack", player: 0, index: call });
  assert.equal(state.pending[0].type, "choose");
  assert.ok(state.pending[0].uids.every((u) => /δ/.test(defs(state.cards[u]).name)));
});

/* ---------- Gym Heroes and Gym Challenge, Neo Destiny ---------- */

test("Blaine: 2 Fire Energy cards onto a Blaine's Pokémon instead of the one from the hand", () => {
  assert.ok(defs("gym2-100").playable);
  const deck = deckOf(["gym2-100", 4], ["gym1-35", 10], ["base1-46", 4], [F, 12]);
  const state = fossilGame(deck);
  state.cards[state.players[0].active.uid] = "gym1-35"; // Blaine's Growlithe in front
  const blaine = give(state, 0, "gym2-100");
  give(state, 0, F);
  give(state, 0, F);
  const fires = state.players[0].hand.filter((u) => state.cards[u] === F).length;
  act(state, { type: "play", player: 0, uid: blaine });
  act(state, { type: "pick", player: 0, spot: ACTIVE });
  assert.equal(state.players[0].active.energy.length, 2);
  assert.equal(state.players[0].hand.filter((u) => state.cards[u] === F).length, fires - 2);
  // That was the Energy for the turn, and another Blaine does nothing now.
  assert.ok(!legalActions(state, 0, defs).some((a) => a.type === "attach"));
  const again = give(state, 0, "gym2-100");
  throws(() => act(state, { type: "play", player: 0, uid: again }), /nothing/);
  // Not after an Energy was attached this turn, nor onto a Pokémon without Blaine in its name.
  act(state, { type: "end", player: 0 });
  act(state, { type: "end", player: 1 });
  state.cards[state.players[0].active.uid] = "base1-46";
  for (const s of state.players[0].bench) state.cards[s.uid] = "base1-46";
  throws(() => act(state, { type: "play", player: 0, uid: again }), /nothing/);
});

test("Vermilion City Gym: Lt. Surge's Pokémon may flip; heads 10 more, tails 10 to itself", () => {
  assert.ok(defs("gym1-120").playable);
  const deck = deckOf(["gym1-120", 2], ["gym1-52", 12], ["base1-46", 4], [F, 12]);
  const run = (choice, heads) => {
    const state = fossilGame(deck);
    const front = state.players[0].active;
    state.cards[front.uid] = "gym1-52"; // Lt. Surge's Spearow: Drill Peck 20
    state.cards[state.players[1].active.uid] = "base1-46";
    act(state, { type: "play", player: 0, uid: give(state, 0, "gym1-120") });
    front.energy.push(give(state, 0, F));
    act(state, { type: "attack", player: 0, index: 0 });
    assert.equal(state.pending[0].type, "option");
    rigFlips(state, [heads]);
    act(state, { type: "option", player: 0, index: choice });
    return [state.players[1].active.damage, front.damage];
  };
  assert.deepEqual(run(0, true), [30, 0]);
  assert.deepEqual(run(0, false), [20, 10]);
  assert.deepEqual(run(1, false), [20, 0]);
  // Other Pokémon attack as usual.
  const state = fossilGame(deck);
  act(state, { type: "play", player: 0, uid: give(state, 0, "gym1-120") });
  state.cards[state.players[0].active.uid] = "base1-46";
  state.players[0].active.energy.push(give(state, 0, F));
  act(state, { type: "attack", player: 0, index: 0 });
  assert.ok(!state.pending.length || state.pending[0].why !== "before");
});

test("Fossil Egg: heads, a card that evolves from Mysterious Fossil onto the Bench as a Basic Pokémon", () => {
  assert.ok(defs("neo2-72").playable);
  const deck = deckOf(["neo2-72", 4], ["neo2-56", 4], ["base1-46", 12], [F, 10]);
  const noKabuto = (state) => {
    const side = state.players[0];
    side.deck.push(...side.hand.filter((u) => state.cards[u] === "neo2-56"));
    side.hand = side.hand.filter((u) => state.cards[u] !== "neo2-56");
  };
  let state = fossilGame(deck);
  noKabuto(state);
  const egg = give(state, 0, "neo2-72");
  rigFlips(state, [true]);
  act(state, { type: "play", player: 0, uid: egg });
  // No Kabuto in hand: straight to the deck.
  assert.equal(state.pending[0].zone, "deck");
  const kabuto = state.pending[0].uids[0];
  assert.equal(state.cards[kabuto], "neo2-56");
  act(state, { type: "choose", player: 0, uids: [kabuto] });
  const slot = state.players[0].bench.find((s) => s.uid === kabuto);
  assert.ok(slot?.asBasic);
  // With one in hand, the player says where from.
  state = fossilGame(deck);
  noKabuto(state);
  const inHand = give(state, 0, "neo2-56");
  rigFlips(state, [true]);
  act(state, { type: "play", player: 0, uid: give(state, 0, "neo2-72") });
  assert.equal(state.pending[0].type, "option");
  act(state, { type: "option", player: 0, index: 1 });
  act(state, { type: "choose", player: 0, uids: [inHand] });
  assert.ok(state.players[0].bench.some((s) => s.uid === inHand && s.asBasic));
  // Tails: nothing.
  state = fossilGame(deck);
  const bench = state.players[0].bench.length;
  rigFlips(state, [false]);
  act(state, { type: "play", player: 0, uid: give(state, 0, "neo2-72") });
  assert.ok(!state.pending.length);
  assert.equal(state.players[0].bench.length, bench);
});

test("Challenge!: declined, draw 2; accepted, both players put Basics face down onto their Benches", () => {
  assert.ok(defs("base6-106").playable);
  const deck = deckOf(["base6-106", 4], ["base1-46", 16], [F, 10]);
  // Declined.
  let state = fossilGame(deck);
  let hand = state.players[0].hand.length;
  act(state, { type: "play", player: 0, uid: give(state, 0, "base6-106") });
  assert.equal(state.pending[0].player, 1);
  act(state, { type: "option", player: 1, index: 1 });
  assert.equal(state.players[0].hand.length, hand + 2);
  // Accepted: each chooses, the other doesn't see what until both are done.
  state = fossilGame(deck);
  const benches = [0, 1].map((p) => state.players[p].bench.length);
  act(state, { type: "play", player: 0, uid: give(state, 0, "base6-106") });
  act(state, { type: "option", player: 1, index: 0 });
  assert.equal(state.pending[0].player, 0);
  const mine = state.pending[0].uids.slice(0, 2);
  act(state, { type: "choose", player: 0, uids: mine });
  assert.equal(state.players[0].bench.length, benches[0]);
  const seen = viewFor(state, 1);
  assert.equal(seen.challenge.cards[0], 2);
  assert.ok(mine.every((uid) => !(uid in seen.cards)));
  assert.equal(state.pending[0].player, 1);
  const theirs = state.pending[0].uids.slice(0, 1);
  act(state, { type: "choose", player: 1, uids: theirs });
  assert.equal(state.players[0].bench.length, benches[0] + 2);
  assert.equal(state.players[1].bench.length, benches[1] + 1);
  assert.ok(!state.challenge);
  // Both Benches full: just draw 2, nothing asked.
  state = fossilGame(deck);
  for (const p of [0, 1])
    while (state.players[p].bench.length < state.rules.bench) {
      const side = state.players[p];
      const uid = side.deck.shift();
      side.bench.push({ uid, under: [], energy: [], damage: 0, since: 0 });
    }
  hand = state.players[0].hand.length;
  act(state, { type: "play", player: 0, uid: give(state, 0, "base6-106") });
  assert.ok(!state.pending.length);
  assert.equal(state.players[0].hand.length, hand + 2);
});

test("Pokémon Breeder Fields: a coin for 1 or 2 Pokémon, each heads a card from the deck that evolves from it", () => {
  assert.ok(defs("neo3-62").playable);
  const deck = deckOf(["neo3-62", 4], ["base1-46", 12], ["base1-24", 4], [F, 10]);
  const breed = () => {
    const state = fossilGame(deck);
    const side = state.players[0];
    while (side.bench.length < 2) side.bench.push({ uid: side.deck.splice(side.deck.findIndex((u) => state.cards[u] === "base1-46"), 1)[0], under: [], energy: [], damage: 0, since: 0 });
    for (const slot of [side.active, ...side.bench]) state.cards[slot.uid] = "base1-46";
    return state;
  };
  const state = breed();
  const side = state.players[0];
  const before = side.hand.filter((u) => state.cards[u] === "base1-24").length;
  act(state, { type: "play", player: 0, uid: give(state, 0, "neo3-62") });
  assert.equal(state.pending[0].type, "pick");
  act(state, { type: "pick", player: 0, spot: ACTIVE });
  // The second one is up to the player.
  assert.ok(state.pending[0].optional);
  rigFlips(state, [true]);
  act(state, { type: "pick", player: 0, spot: null });
  assert.equal(state.pending[0].type, "choose");
  assert.ok(state.pending[0].uids.length > 0 && state.pending[0].uids.every((u) => state.cards[u] === "base1-24"));
  act(state, { type: "choose", player: 0, uids: state.pending[0].uids.slice(0, 1) });
  assert.equal(side.hand.filter((u) => state.cards[u] === "base1-24").length, before + 1);
  // Tails for both: nothing.
  const two = breed();
  const hand = two.players[0].hand.length;
  act(two, { type: "play", player: 0, uid: give(two, 0, "neo3-62") });
  act(two, { type: "pick", player: 0, spot: ACTIVE });
  rigFlips(two, [false, false]);
  act(two, { type: "pick", player: 0, spot: 0 });
  assert.ok(!two.pending.length);
  assert.equal(two.players[0].hand.length, hand);
});

test("Trick Coin: after the attack's coins, its player may ignore them and flip again, once a turn", () => {
  assert.ok(defs("xy4-108").playable);
  assert.ok(defs("xy4-108").tool.trick);
  const deck = deckOf(["xy4-108", 4], ["base1-63", 16], [W, 10]);
  const coined = () => {
    const state = fossilGame(deck);
    const side = state.players[0];
    state.cards[side.active.uid] = "base1-63"; // Squirtle: Bubble [W] 10, heads Paralyzed
    state.cards[state.players[1].active.uid] = "base1-63";
    const coin = give(state, 0, "xy4-108");
    side.hand.splice(side.hand.indexOf(coin), 1);
    side.active.tool = coin;
    side.active.energy.push(give(state, 0, W));
    return state;
  };
  // Tails, then flipped again: heads, and only the second coin counts.
  let state = coined();
  rigFlips(state, [false, true]);
  act(state, { type: "attack", player: 0, index: 0 });
  assert.equal(state.pending[0].why, "trick");
  // Nothing of the game before the coins shows to the other player.
  assert.ok(!("snap" in viewFor(state, 1).trick));
  act(state, { type: "option", player: 0, index: 0 });
  assert.equal(state.players[1].active.damage, 10);
  assert.ok(conditionsOn(state.players[1].active).includes("paralyzed") || state.players[1].active.conditions?.includes?.("paralyzed") || JSON.stringify(state.players[1].active).includes("paralyzed"));
  assert.ok(!state.trick);
  assert.notEqual(state.current, 0);
  // Kept: tails stands.
  state = coined();
  rigFlips(state, [false]);
  act(state, { type: "attack", player: 0, index: 0 });
  act(state, { type: "option", player: 0, index: 1 });
  assert.equal(state.players[1].active.damage, 10);
  assert.ok(!JSON.stringify(state.players[1].active).includes("paralyzed"));
  // No coins (Withdraw needs 2 Energy; plain Tackle-style attacks): nothing asked.
  const plain = coined();
  plain.cards[plain.players[0].active.uid] = "base1-46"; // Charmander: Scratch
  act(plain, { type: "attack", player: 0, index: 0 });
  assert.ok(!plain.pending.length || plain.pending[0].why !== "trick");
});

test("Sabrina's Psychic Control: heads, a Trainer from the opponent's discard pile used as if in the hand", () => {
  assert.ok(defs("gym2-121").playable);
  assert.ok(defs("base1-92").playable);
  const deck = deckOf(["gym2-121", 4], ["base1-46", 16], [F, 10]);
  const setup = (ids) => {
    const state = fossilGame(deck);
    const foe = state.players[1];
    const put = ids.map((id) => {
      const uid = foe.deck.pop();
      state.cards[uid] = id;
      foe.discard.push(uid);
      return uid;
    });
    const energy = foe.deck.pop();
    state.cards[energy] = W;
    foe.active.energy.push(energy);
    return { state, put, energy };
  };
  // Only a PlusPower there: it is put in play, so there is nothing to use.
  let { state } = setup(["base1-84"]);
  const sabrina = give(state, 0, "gym2-121");
  throws(() => act(state, { type: "play", player: 0, uid: sabrina }), /nothing/);
  // Energy Removal: offered beside "Don't use one"; it does its work and stays in their discard pile.
  let put, energy;
  ({ state, put, energy } = setup(["base1-84", "base1-92"]));
  rigFlips(state, [true]);
  act(state, { type: "play", player: 0, uid: give(state, 0, "gym2-121") });
  assert.deepEqual(state.pending[0].labels, ["Energy Removal", "Don't use one"]);
  act(state, { type: "option", player: 0, index: 0 });
  while (state.pending.length && state.pending[0].player === 0) {
    const w = state.pending[0];
    if (w.type === "pick") act(state, { type: "pick", player: 0, spot: w.spots[0] });
    else act(state, { type: "choose", player: 0, uids: w.uids.slice(0, 1) });
  }
  assert.ok(!state.players[1].active.energy.includes(energy));
  assert.ok(state.players[1].discard.includes(put[1]));
  assert.ok(!state.players[0].discard.includes(put[1]) && !state.players[0].hand.includes(put[1]));
  // Tails: nothing.
  ({ state, put, energy } = setup(["base1-92"]));
  rigFlips(state, [false]);
  act(state, { type: "play", player: 0, uid: give(state, 0, "gym2-121") });
  assert.ok(!state.pending.length);
  assert.ok(state.players[1].active.energy.includes(energy));
});

/* ---------- Scarlet & Violet and Mega Evolution Trainers ---------- */

const D = "energy-darkness";
/** A card set into a fresh slot (its uid taken off the deck). */
const slotFor = (state, p, id) => {
  const uid = state.players[p].deck.pop();
  state.cards[uid] = id;
  return { uid, under: [], energy: [], damage: 0, since: 0 };
};
/** Player 0 to move: `front` and `bench` ids for its Pokémon, `foeBench` ids for the other side's Bench, `extra` cards in the deck. */
function scene({ front = "", bench = [], foeBench = [], extra = [] } = {}) {
  const n = extra.reduce((k, [, c]) => k + c, 0);
  const state = fossilGame(deckOf(...extra, ["base1-46", 10], [F, 6], [W, 4], [D, 10 - n]));
  const side = state.players[0];
  if (front) state.cards[side.active.uid] = front;
  side.bench = bench.map((id) => slotFor(state, 0, id));
  state.players[1].bench = foeBench.map((id) => slotFor(state, 1, id));
  return state;
}

test("Team Rocket's Giovanni: a Team Rocket's Pokémon switch, then theirs is pulled in", () => {
  assert.ok(defs("sv10-174").playable);
  const state = scene({ front: "sv10-15", bench: ["base1-46", "sv10-19"], foeBench: ["base1-63"], extra: [["sv10-174", 2]] });
  const side = state.players[0];
  const benchedRocket = side.bench[1].uid;
  const foeBenched = state.players[1].bench[0].uid;
  act(state, { type: "play", player: 0, uid: handed(state, 0, "sv10-174") });
  // Only the Team Rocket's Pokémon on the Bench may come in.
  assert.deepEqual(state.pending[0].spots, [1]);
  act(state, { type: "pick", player: 0, spot: 1 });
  assert.equal(side.active.uid, benchedRocket);
  act(state, { type: "pick", player: 0, spot: 0 });
  assert.equal(state.players[1].active.uid, foeBenched);
  // Not with another Active Pokémon.
  const other = scene({ front: "base1-46", bench: ["sv10-19"], foeBench: ["base1-63"], extra: [["sv10-174", 2]] });
  throws(() => act(other, { type: "play", player: 0, uid: handed(other, 0, "sv10-174") }), /nothing/);
});

test("Team Rocket's Ariana, Proton and Transceiver: Team Rocket's cards by name", () => {
  assert.ok(defs("sv10-171").playable && defs("sv10-177").playable && defs("sv10-178").playable);
  assert.equal(whatOf("Basic Team Rocket's Pokémon"), "basic&&name^Team Rocket's");
  assert.equal(whatOf('a Supporter card that has "Team Rocket" in its name'), "supporter~Team Rocket");
  assert.ok(fits(defs("sv10-171"), "supporter~Team Rocket") && !fits(defs("sv10-174"), "item~Team Rocket"));
  assert.ok(fits(defs("sv10-15"), "basic&&name^Team Rocket's") && !fits(defs("base1-46"), "basic&&name^Team Rocket's"));
  // Ariana: to 5, or to 8 with only Team Rocket's Pokémon in play.
  for (const [front, want] of [["base1-46", 5], ["sv10-15", 8]]) {
    const state = scene({ front, extra: [["sv10-171", 2]] });
    const side = state.players[0];
    side.deck.push(...side.hand.splice(0));
    act(state, { type: "play", player: 0, uid: handed(state, 0, "sv10-171") });
    assert.equal(side.hand.length, want);
  }
});

test("N's PP Up: a Basic Energy from the discard pile onto a Benched N's Pokémon", () => {
  assert.ok(defs("sv9-153").playable);
  const state = scene({ bench: ["base1-46", "me2pt5-136"], extra: [["sv9-153", 2]] });
  const side = state.players[0];
  const energy = side.deck.find((u) => state.cards[u] === W);
  side.deck.splice(side.deck.indexOf(energy), 1);
  side.discard.push(energy);
  act(state, { type: "play", player: 0, uid: handed(state, 0, "sv9-153") });
  act(state, { type: "choose", player: 0, uids: [energy] });
  if (state.pending.length) {
    assert.deepEqual(state.pending[0].spots, [1]);
    act(state, { type: "pick", player: 0, spot: 1 });
  }
  assert.ok(side.bench[1].energy.includes(energy));
});

test("Ciphermaniac's Codebreaking, Eri, Crispin", () => {
  assert.ok(defs("sv5-145").playable && defs("sv5-146").playable && defs("sv7-133").playable);
  // Ciphermaniac's Codebreaking: 2 cards on top, in the order chosen.
  let state = scene({ extra: [["sv5-145", 2]] });
  act(state, { type: "play", player: 0, uid: handed(state, 0, "sv5-145") });
  const two = [state.pending[0].uids.find((u) => state.cards[u] === W), state.pending[0].uids.find((u) => state.cards[u] === D)];
  act(state, { type: "choose", player: 0, uids: two });
  assert.deepEqual(state.players[0].deck.slice(0, 2), two);
  // Eri: their hand is shown; up to 2 Items there are discarded.
  state = scene({ extra: [["sv5-146", 2]] });
  const foe = state.players[1];
  const items = foe.deck.splice(0, 3);
  items.forEach((u, i) => (state.cards[u] = i < 2 ? "sv1-181" : "base1-63"));
  foe.hand.push(...items);
  act(state, { type: "play", player: 0, uid: handed(state, 0, "sv5-146") });
  assert.equal(state.pending[0].owner, 1);
  assert.deepEqual(state.pending[0].uids, items.slice(0, 2));
  assert.ok(items.every((u) => u in viewFor(state, 0).cards));
  act(state, { type: "choose", player: 0, uids: items.slice(0, 2) });
  assert.ok(items.slice(0, 2).every((u) => foe.discard.includes(u)));
  // Crispin: one to the hand, one of another type attached.
  state = scene({ extra: [["sv7-133", 2]] });
  const side = state.players[0];
  act(state, { type: "play", player: 0, uid: handed(state, 0, "sv7-133") });
  const water = state.pending[0].uids.find((u) => state.cards[u] === W);
  act(state, { type: "choose", player: 0, uids: [water] });
  assert.ok(side.hand.includes(water));
  assert.ok(state.pending[0].uids.length > 0 && state.pending[0].uids.every((u) => state.cards[u] !== W));
  const dark = state.pending[0].uids.find((u) => state.cards[u] === D);
  act(state, { type: "choose", player: 0, uids: [dark] });
  if (state.pending.length) act(state, { type: "pick", player: 0, spot: ACTIVE });
  assert.ok(side.active.energy.includes(dark));
});

test("Amarys draws 4, and a hand of 5 or more is discarded at the end of the turn", () => {
  assert.ok(defs("sv8pt5-93").playable);
  for (const [keep, gone] of [[0, false], [3, true]]) {
    const state = scene({ extra: [["sv8pt5-93", 2]] });
    const side = state.players[0];
    side.deck.push(...side.hand.splice(keep));
    act(state, { type: "play", player: 0, uid: handed(state, 0, "sv8pt5-93") });
    assert.equal(side.hand.length, keep + 4);
    act(state, { type: "end", player: 0 });
    assert.equal(side.hand.length, gone ? 0 : keep + 4);
  }
});

test("Lt. Surge's Bargain: yes, a Prize card each; no, draw 4", () => {
  assert.ok(defs("me1-120").playable);
  let state = scene({ extra: [["me1-120", 2]] });
  const prizes = [0, 1].map((p) => state.players[p].prizes.length);
  act(state, { type: "play", player: 0, uid: handed(state, 0, "me1-120") });
  assert.equal(state.pending[0].player, 1);
  act(state, { type: "option", player: 1, index: 0 });
  assert.deepEqual([0, 1].map((p) => state.players[p].prizes.length), prizes.map((n) => n - 1));
  state = scene({ extra: [["me1-120", 2]] });
  const hand = state.players[0].hand.length;
  act(state, { type: "play", player: 0, uid: handed(state, 0, "me1-120") });
  act(state, { type: "option", player: 1, index: 1 });
  assert.equal(state.players[0].hand.length, hand + 4);
  // The last Prize card wins.
  state = scene({ extra: [["me1-120", 2]] });
  state.players[0].prizes.splice(1);
  act(state, { type: "play", player: 0, uid: handed(state, 0, "me1-120") });
  act(state, { type: "option", player: 1, index: 0 });
  assert.equal(state.phase, "over");
  assert.equal(state.winner, 0);
});

test("Janine's Secret Art and Glass Trumpet: Energy onto chosen Pokémon", () => {
  assert.ok(defs("sv6pt5-59").playable && defs("sv7-135").playable);
  // Janine's Secret Art: the Active Darkness Pokémon that takes one is Poisoned.
  let state = scene({ front: "sv1-126", bench: ["sv1-128"], extra: [["sv6pt5-59", 2]] });
  const side = state.players[0];
  act(state, { type: "play", player: 0, uid: handed(state, 0, "sv6pt5-59") });
  assert.equal(state.pending[0].max, 2);
  act(state, { type: "choose", player: 0, uids: state.pending[0].uids.slice(0, 2) });
  while (state.pending.length) act(state, { type: "pick", player: 0, spot: state.pending[0].spots[0] });
  assert.equal(side.active.energy.length + side.bench[0].energy.length, 2);
  assert.ok(conditionsOn(side.active).includes("poisoned"));
  // Glass Trumpet: only with a Tera Pokémon in play.
  state = scene({ front: "base1-46", bench: ["sv1-146"], extra: [["sv7-135", 2]] });
  const energy = state.players[0].deck.find((u) => state.cards[u] === W);
  state.players[0].deck.splice(state.players[0].deck.indexOf(energy), 1);
  state.players[0].discard.push(energy);
  const trumpet = handed(state, 0, "sv7-135");
  throws(() => act(state, { type: "play", player: 0, uid: trumpet }), /nothing/);
  state.cards[state.players[0].active.uid] = "sv3-42";
  act(state, { type: "play", player: 0, uid: trumpet });
  act(state, { type: "choose", player: 0, uids: [energy] });
  if (state.pending.length) act(state, { type: "pick", player: 0, spot: 0 });
  assert.ok(state.players[0].bench[0].energy.includes(energy));
});

test("Kieran, Counter Gain, Rescue Board, Forest of Vitality", () => {
  assert.ok(defs("sv6-154").playable);
  assert.deepEqual(defs("sv6-154").fx[0].options[1].steps, [{ op: "boost", n: 30, vs: ["ex", "V", "VMAX", "VSTAR"] }]);
  // Counter Gain: Colorless less while behind on Prize cards.
  assert.ok(defs("sv8-169").playable && defs("sv5-159").playable && defs("me1-117").playable);
  let state = scene({ front: "sv1-14" });
  const front = state.players[0].active;
  front.tool = state.players[0].deck.pop();
  state.cards[front.tool] = "sv8-169";
  const leaf = defs("sv1-14").attacks[1];
  assert.deepEqual(costFor(state, front, leaf, defs), ["Grass", "Colorless"]);
  state.players[0].prizes.push(state.players[0].deck.pop());
  assert.deepEqual(costFor(state, front, leaf, defs), ["Grass"]);
  // Rescue Board: 1 less, none at 30 HP or less.
  state.cards[front.uid] = "sv1-14"; // Floragato: Retreat Cost 1
  state.cards[front.tool] = "sv5-159";
  assert.equal(retreatCost(state, front, defs), Math.max(0, defs("sv1-14").retreat - 1));
  state.cards[front.uid] = "sv1-126"; // Grimer: Retreat Cost 3
  assert.equal(retreatCost(state, front, defs), 2);
  front.damage = 50;
  assert.equal(retreatCost(state, front, defs), 0);
  // Forest of Vitality: a Grass Pokémon played this turn evolves into a Grass Pokémon.
  state = scene({ bench: ["sv1-13"], extra: [["me1-117", 1], ["sv1-14", 1]] });
  state.players[0].bench[0].since = state.turn;
  const flora = handed(state, 0, "sv1-14");
  assert.ok(!legalActions(state, 0, defs).some((a) => a.type === "evolve" && a.uid === flora));
  act(state, { type: "play", player: 0, uid: handed(state, 0, "me1-117") });
  assert.ok(legalActions(state, 0, defs).some((a) => a.type === "evolve" && a.uid === flora));
});

test("Scarlet & Violet Trainers, a second batch: heals, draws and switches", () => {
  for (const id of ["sv5-142", "me2-91", "sv5-155", "sv6pt5-56", "me5-77", "me5-78", "me6-103", "me4-76", "sv8-179", "sv5-157", "sv8pt5-115", "zsv10pt5-83", "me2pt5-205", "me3-79", "me4-77", "me5-75", "me5-80", "sv6pt5-64", "sv6-157", "rsv10pt5-83", "sv6-162", "me6-102", "sv6-144"]) assert.ok(defs(id).playable, id);
  // Bianca's Devotion: all damage from one with 30 HP or less left, and only such a one.
  let state = scene({ bench: ["base1-46"] });
  const side = state.players[0];
  side.active.damage = 30; // Charmander 50 HP: 20 left
  side.bench[0].damage = 10;
  act(state, { type: "play", player: 0, uid: handed(state, 0, "sv5-142") });
  if (state.pending.length) {
    assert.deepEqual(state.pending[0].spots, [ACTIVE]);
    act(state, { type: "pick", player: 0, spot: ACTIVE });
  }
  assert.equal(side.active.damage, 0);
  assert.equal(side.bench[0].damage, 10);
  // Morty's Conviction: a card for each of their Benched Pokémon, after another card is discarded.
  state = scene({ foeBench: ["base1-63", "base1-63"] });
  let hand = state.players[0].hand.length;
  act(state, { type: "play", player: 0, uid: handed(state, 0, "sv5-155") });
  act(state, { type: "choose", player: 0, uids: state.pending[0].uids.slice(0, 1) });
  assert.equal(state.players[0].hand.length, hand - 1 + 2);
  // Cassiopeia: only as the last card in the hand.
  state = scene();
  const cass = handed(state, 0, "sv6pt5-56");
  throws(() => act(state, { type: "play", player: 0, uid: cass }), /nothing|can't/);
  state.players[0].deck.push(...state.players[0].hand.filter((u) => u !== cass));
  state.players[0].hand = [cass];
  act(state, { type: "play", player: 0, uid: cass });
  act(state, { type: "choose", player: 0, uids: state.pending[0].uids.slice(0, 2) });
  assert.equal(state.players[0].hand.length, 2);
  // Gladion's Final Battle: Pokémon without a Rule Box only.
  assert.deepEqual(defs("me5-77").fx[1], { op: "boost", n: 80, who: { noRule: true } });
  // Zinnia's Trust: an Energy from the one sent to the Bench to the new Active Pokémon.
  state = scene({ bench: ["base1-46"] });
  const was = state.players[0].active;
  was.energy.push(state.players[0].deck.pop());
  state.cards[was.energy[0]] = F;
  act(state, { type: "play", player: 0, uid: handed(state, 0, "me6-103") });
  act(state, { type: "pick", player: 0, spot: 0 });
  if (state.pending.length) act(state, { type: "choose", player: 0, uids: state.pending[0].uids.slice(0, 1) });
  assert.equal(state.players[0].active.energy.length, 1);
  assert.equal(was.energy.length, 0);
  // AZ's Tranquility: the Pokémon ex sent to the Bench is healed 80, another isn't.
  for (const [front, healed] of [["sv3-42", true], ["base1-46", false]]) {
    state = scene({ front, bench: ["base1-46"] });
    const out = state.players[0].active;
    out.damage = 40;
    act(state, { type: "play", player: 0, uid: handed(state, 0, "me4-76") });
    act(state, { type: "pick", player: 0, spot: 0 });
    assert.equal(out.damage, healed ? 0 : 40);
  }
  // Lisia's Appeal: a Benched Basic pulled in and Confused.
  state = scene({ foeBench: ["base1-63"] });
  act(state, { type: "play", player: 0, uid: handed(state, 0, "sv8-179") });
  act(state, { type: "pick", player: 0, spot: 0 });
  assert.ok(conditionsOn(state.players[1].active).includes("confused"));
  // N's Plan: up to 2 Energy from the Bench to the Active Pokémon.
  state = scene({ bench: ["base1-46", "base1-46"] });
  const b = state.players[0].bench;
  for (const slot of b) {
    const e = state.players[0].deck.pop();
    state.cards[e] = F;
    slot.energy.push(e);
  }
  act(state, { type: "play", player: 0, uid: handed(state, 0, "zsv10pt5-83") });
  act(state, { type: "choose", player: 0, uids: state.pending[0].uids.slice(0, 2) });
  assert.equal(state.players[0].active.energy.length, 2);
  assert.ok(b.every((slot) => !slot.energy.length));
  // Both Active non-Darkness Pokémon Confused.
  state = scene({ front: "sv1-126" });
  act(state, { type: "play", player: 0, uid: handed(state, 0, "me5-75") });
  assert.ok(!conditionsOn(state.players[0].active).includes("confused"));
  assert.ok(conditionsOn(state.players[1].active).includes("confused"));
  // They discard down to 3.
  state = scene();
  const foeHand = state.players[1].hand.length;
  act(state, { type: "play", player: 0, uid: handed(state, 0, "sv6pt5-64") });
  if (foeHand > 3) {
    assert.equal(state.pending[0].player, 1);
    assert.equal(state.pending[0].min, foeHand - 3);
    act(state, { type: "choose", player: 1, uids: state.pending[0].uids.slice(0, foeHand - 3) });
  }
  assert.equal(state.players[1].hand.length, Math.min(foeHand, 3));
  // Their hand shown, a card for each Pokémon there.
  state = scene();
  hand = state.players[0].hand.length;
  const pokemon = state.players[1].hand.filter((u) => defOf(state, u, defs).kind === "pokemon").length;
  act(state, { type: "play", player: 0, uid: handed(state, 0, "me4-77") });
  assert.equal(state.players[0].hand.length, hand + pokemon);
  assert.ok(state.players[1].hand.every((u) => u in viewFor(state, 0).cards));
  // Up to 4 Water Energy onto one Pokémon, and the turn ends.
  state = scene();
  for (const u of state.players[0].deck.slice(0, 4)) state.cards[u] = W;
  act(state, { type: "play", player: 0, uid: handed(state, 0, "me5-80") });
  act(state, { type: "choose", player: 0, uids: state.pending[0].uids.slice(0, 4) });
  if (state.pending.length) act(state, { type: "pick", player: 0, spot: ACTIVE });
  assert.equal(state.players[0].active.energy.length, 4);
  assert.equal(state.current, 1);
  // Caretaker: back into the deck with Community Center in play, else discarded.
  state = scene();
  const care = handed(state, 0, "sv6-144");
  act(state, { type: "play", player: 0, uid: care });
  assert.ok(state.players[0].discard.includes(care));
  state = scene();
  const center = state.players[0].deck.pop();
  state.cards[center] = "sv6-146";
  state.stadium = { uid: center, owner: 0 };
  const care2 = handed(state, 0, "sv6-144");
  act(state, { type: "play", player: 0, uid: care2 });
  assert.ok(state.players[0].deck.includes(care2));
});

test("Scarlet & Violet Tools: more damage, less damage, cheaper attacks, fewer Prize cards", () => {
  for (const id of ["sv6pt5-55", "me2-93", "me5-104", "me6-91", "sv5-154", "sv7-142", "sv8pt5-111", "sv9-151", "me2pt5-191", "me2pt5-211", "me3-70", "me5-74", "sv10-162", "sv6pt5-63"]) assert.ok(defs(id).playable, id);
  const tooled = (state, p, slot, id) => {
    slot.tool = state.players[p].deck.pop();
    state.cards[slot.tool] = id;
    return slot.tool;
  };
  // Maximum Belt: 50 more against an Active Pokémon ex only. Brave Bangle: 30, on one without a Rule Box.
  let state = scene();
  const mine = state.players[0].active;
  const theirs = state.players[1].active;
  tooled(state, 0, mine, "sv5-154");
  assert.equal(boostOf(state, 0, mine, theirs, defs), 0);
  state.cards[theirs.uid] = "sv3-42";
  assert.equal(boostOf(state, 0, mine, theirs, defs), 50);
  state.cards[mine.tool] = "me5-104";
  assert.equal(boostOf(state, 0, mine, theirs, defs), 30);
  state.cards[mine.uid] = "sv3-42";
  assert.equal(boostOf(state, 0, mine, theirs, defs), 0);
  // Binding Mochi: 40 more while Poisoned.
  state.cards[mine.uid] = "base1-46";
  state.cards[mine.tool] = "sv6pt5-55";
  assert.equal(toolOf(state, mine, defs).plus || 0, 0);
  addCondition(state, mine, "poisoned", defs);
  assert.equal(toolOf(state, mine, defs).plus, 40);
  // Thick Scale: the Dragon Pokémon takes 50 less from a Fire attacker; Haban Berry 60 less from a Dragon one, then it goes.
  state = scene({ front: "sv3-161" }); // Drampa: Outrage 60+
  state.cards[state.players[1].active.uid] = "sv3-157"; // Dratini
  const drat = state.players[1].active;
  const berry = tooled(state, 1, drat, "sv8pt5-111");
  const front = state.players[0].active;
  for (let k = 0; k < 2; k += 1) front.energy.push(handed(state, 0, W));
  front.energy.forEach((u) => state.players[0].hand.splice(state.players[0].hand.indexOf(u), 1));
  act(state, { type: "attack", player: 0, index: 0 });
  assert.equal(drat.damage, 0);
  assert.ok(!drat.tool && state.players[1].discard.includes(berry));
  state = scene({ front: "base1-46" }); // Charmander, Fire: Scratch 10
  state.cards[state.players[1].active.uid] = "sv3-157";
  const scaled = state.players[1].active;
  tooled(state, 1, scaled, "me2pt5-211");
  state.players[0].active.energy.push(handed(state, 0, F));
  state.players[0].hand.pop();
  act(state, { type: "attack", player: 0, index: 0 });
  assert.equal(scaled.damage, 0);
  assert.ok(scaled.tool);
  // Sparkling Crystal: a Tera Pokémon's attack costs 1 Energy less, whichever suits.
  state = scene({ front: "sv3-42" }); // Eiscue ex: Scalding Block [WWW]
  const eiscue = state.players[0].active;
  tooled(state, 0, eiscue, "sv7-142");
  assert.equal(costFor(state, eiscue, defs("sv3-42").attacks[0], defs).length, 2);
  state.cards[eiscue.uid] = "base1-46";
  assert.equal(costFor(state, eiscue, defs("base1-46").attacks[0], defs).length, defs("base1-46").attacks[0].cost.length);
  // Cynthia's Power Weight: +70 HP on Cynthia's Pokémon only.
  state = scene({ front: "me2pt5-109" });
  tooled(state, 0, state.players[0].active, "sv10-162");
  assert.equal(maxHp(state, state.players[0].active, defs), 140);
  state.cards[state.players[0].active.uid] = "base1-46";
  assert.equal(maxHp(state, state.players[0].active, defs), 50);
  // Core Memory: Mega Zygarde ex may use Geobuster.
  state = scene({ front: "me3-47" });
  tooled(state, 0, state.players[0].active, "me3-70");
  assert.ok(attacksOf(state, state.players[0].active, defs).some((a) => a.name === "Geobuster" && a.lent));
  state.cards[state.players[0].active.uid] = "base1-46";
  assert.ok(!attacksOf(state, state.players[0].active, defs).some((a) => a.name === "Geobuster"));
  // Lillie's Pearl: one fewer Prize card when Lillie's Pokémon is Knocked Out by an attack.
  state = scene({ front: "base1-46" });
  state.cards[state.players[1].active.uid] = "sv9-66"; // Lillie's Cutiefly, 30 HP
  state.players[1].bench = [slotFor(state, 1, "base1-63")];
  tooled(state, 1, state.players[1].active, "sv9-151");
  state.players[1].active.damage = 20;
  state.players[0].active.energy.push(handed(state, 0, F));
  state.players[0].hand.pop();
  const prizes = state.players[0].prizes.length;
  act(state, { type: "attack", player: 0, index: 0 });
  assert.equal(state.players[0].prizes.length, prizes);
  // Powerglass: at the end of the turn, a Basic Energy from the discard pile onto the Active Pokémon, if the player likes.
  state = scene();
  tooled(state, 0, state.players[0].active, "sv6pt5-63");
  const spare = state.players[0].deck.pop();
  state.cards[spare] = W;
  state.players[0].discard.push(spare);
  act(state, { type: "end", player: 0 });
  assert.equal(state.pending[0].player, 0);
  act(state, { type: "choose", player: 0, uids: [spare] });
  assert.ok(state.players[0].active.energy.includes(spare));
  assert.equal(state.current, 1);
});

test("Scarlet & Violet Stadiums", () => {
  for (const id of ["me2pt5-261", "me1-129", "me2pt5-203", "me2pt5-210", "me3-77", "me6-94", "me6-96", "sv8-177", "me2pt5-197", "me5-76", "sv5-148", "sv5-156", "sv6-146"]) assert.ok(defs(id).playable, id);
  const stadium = (state, id, owner = 0) => {
    const uid = state.players[owner].deck.pop();
    state.cards[uid] = id;
    state.stadium = { uid, owner };
    return uid;
  };
  // Jamming Tower: Tools do nothing.
  let state = scene({ front: "me2pt5-109" });
  const front = state.players[0].active;
  front.tool = state.players[0].deck.pop();
  state.cards[front.tool] = "sv10-162";
  assert.equal(maxHp(state, front, defs), 140);
  stadium(state, "me2pt5-261");
  assert.equal(maxHp(state, front, defs), 70);
  // Gravity Mountain: Stage 2 Pokémon get -30 HP.
  stadium(state, "sv8-177");
  state.cards[front.uid] = "base1-4";
  delete front.tool;
  assert.equal(maxHp(state, front, defs), defs("base1-4").hp - 30);
  state.cards[front.uid] = "base1-24";
  assert.equal(maxHp(state, front, defs), defs("base1-24").hp);
  // Nighttime Mine: a Tera Pokémon's attacks cost Colorless more.
  stadium(state, "me2pt5-197");
  state.cards[front.uid] = "sv3-42";
  assert.equal(costFor(state, front, defs("sv3-42").attacks[0], defs).length, 4);
  // Legendary Summit: a Colorless Pokémon Knocked Out by an attack gives 1 fewer Prize card.
  state = scene({ front: "base1-46" });
  stadium(state, "me6-96");
  state.cards[state.players[1].active.uid] = "sv1-146"; // Zangoose, Colorless
  state.players[1].bench = [slotFor(state, 1, "base1-63")];
  state.players[1].active.damage = defs("sv1-146").hp - 10;
  state.players[0].active.energy.push(handed(state, 0, F));
  state.players[0].hand.pop();
  const prizes = state.players[0].prizes.length;
  act(state, { type: "attack", player: 0, index: 0 });
  assert.equal(state.players[0].prizes.length, prizes);
  // Perilous Jungle: Poison does 30 to a non-Darkness Pokémon, 10 to a Darkness one.
  for (const [id, n] of [["base1-46", 30], ["sv1-126", 10]]) {
    state = scene({ front: id });
    stadium(state, "sv5-156");
    addCondition(state, state.players[0].active, "poisoned", defs);
    act(state, { type: "end", player: 0 });
    assert.equal(state.players[0].active.damage, n);
  }
  // Full Metal Lab: a Metal Pokémon takes 30 less.
  assert.deepEqual(defs("sv5-148").stadium.field, [{ who: { types: ["Metal"] }, mod: { less: 30 } }]);
  // Community Center: heal 10 from each, only after a Supporter from the hand.
  state = scene({ bench: ["base1-46"] });
  stadium(state, "sv6-146", 1);
  state.players[0].active.damage = 20;
  state.players[0].bench[0].damage = 10;
  assert.ok(!legalActions(state, 0, defs).some((a) => a.type === "stadium"));
  act(state, { type: "play", player: 0, uid: handed(state, 0, "sv1-189") });
  act(state, { type: "stadium", player: 0 });
  assert.equal(state.players[0].active.damage, 10);
  assert.equal(state.players[0].bench[0].damage, 0);
  // Lumiose City: a Basic Pokémon from the deck onto the Bench, and the turn ends.
  state = scene();
  stadium(state, "me3-77");
  const bench = state.players[0].bench.length;
  act(state, { type: "stadium", player: 0 });
  act(state, { type: "choose", player: 0, uids: state.pending[0].uids.slice(0, 1) });
  assert.equal(state.players[0].bench.length, bench + 1);
  assert.equal(state.current, 1);
  // Surfing Beach: only a Water Active Pokémon with a Water Benched one.
  state = scene({ front: "base1-63", bench: ["base1-46", "base1-63"] });
  stadium(state, "me1-129");
  act(state, { type: "stadium", player: 0 });
  assert.deepEqual(state.pending[0].spots, [1]);
});

test("Stadiums that take Abilities away", () => {
  const state = scene({ front: "base1-46" });
  // A Colorless Pokémon with an Ability: Pidgeot ex? Use any Colorless Pokémon with one.
  const mon = [...byId.values()].find((c) => c.supertype === "Pokémon" && (c.types || []).includes("Colorless") && (c.subtypes || []).includes("Basic") && defs(c.id).ability && defs(c.id).playable);
  const evo = [...byId.values()].find((c) => c.supertype === "Pokémon" && !(c.types || []).includes("Colorless") && (c.subtypes || []).includes("Stage 1") && defs(c.id).ability && defs(c.id).playable);
  state.cards[state.players[0].active.uid] = mon.id;
  assert.ok(abilityOn(state, state.players[0].active, defs));
  const uid = state.players[0].deck.pop();
  state.cards[uid] = "me2pt5-210";
  state.stadium = { uid, owner: 1 };
  assert.equal(abilityOn(state, state.players[0].active, defs), null);
  state.cards[state.players[0].active.uid] = evo.id;
  assert.ok(abilityOn(state, state.players[0].active, defs));
  state.cards[uid] = "me6-94";
  assert.equal(abilityOn(state, state.players[0].active, defs), null);
});

test("Scarlet & Violet Special Energy: Ignition, Team Rocket's, Mist, Rocky Fighting, Shadowy Darkness, Neo Upper, Spiky, Legacy", () => {
  for (const id of ["me2-124", "sv10-182", "me3-87", "me5-83", "sv5-161", "sv5-162", "sv9-159", "sv6-167"]) assert.ok(defs(id).playable, id);
  const put = (state, p, slot, id) => {
    const uid = state.players[p].deck.pop();
    state.cards[uid] = id;
    slot.energy.push(uid);
    return uid;
  };
  // Ignition Energy: 1 Colorless on a Basic, 3 on an Evolution Pokémon; discarded at the end of its owner's turn.
  let state = scene();
  const front = state.players[0].active;
  const spark = put(state, 0, front, "me2-124");
  assert.deepEqual(energyOf(state, front, defs), ["Colorless"]);
  state.cards[front.uid] = "base1-4";
  assert.deepEqual(energyOf(state, front, defs), ["Colorless", "Colorless", "Colorless"]);
  act(state, { type: "end", player: 0 });
  assert.ok(!front.energy.includes(spark) && state.players[0].discard.includes(spark));
  // Neo Upper Energy: 2 of any type on a Stage 2 Pokémon.
  state = scene({ front: "base1-4" });
  put(state, 0, state.players[0].active, "sv5-162");
  assert.deepEqual(energyOf(state, state.players[0].active, defs), ["Any", "Any"]);
  state.cards[state.players[0].active.uid] = "base1-24";
  assert.deepEqual(energyOf(state, state.players[0].active, defs), ["Colorless"]);
  // Team Rocket's Energy: only on a Team Rocket's Pokémon, 2 in any mix of Psychic and Darkness.
  state = scene({ bench: ["sv10-15"] });
  const rocket = handed(state, 0, "sv10-182");
  throws(() => act(state, { type: "attach", player: 0, uid: rocket, spot: ACTIVE }), /Team Rocket's/);
  act(state, { type: "attach", player: 0, uid: rocket, spot: 0 });
  assert.deepEqual(energyOf(state, state.players[0].bench[0], defs), ["Psychic|Darkness", "Psychic|Darkness"]);
  // Mist Energy: no effects of the opponent's attacks. Rocky Fighting Energy: the same, on a Fighting Pokémon only.
  state = scene({ bench: ["base1-46"] });
  const mist = state.players[1].active;
  put(state, 1, mist, "sv5-161");
  assert.ok(warded(state, mist, { player: 0, src: "attack" }, defs));
  const rocky = slotFor(state, 1, "base1-46");
  state.players[1].bench = [rocky];
  put(state, 1, rocky, "me3-87");
  assert.ok(!warded(state, rocky, { player: 0, src: "attack" }, defs));
  state.cards[rocky.uid] = "base1-47"; // Diglett, Fighting
  assert.ok(warded(state, rocky, { player: 0, src: "attack" }, defs));
  // Shadowy Darkness Energy: a Benched Darkness Pokémon takes no damage from the opponent's attacks.
  put(state, 1, rocky, "me5-83");
  assert.ok(!benchSafe(state, rocky, 0, defs));
  state.cards[rocky.uid] = "sv1-126";
  assert.ok(benchSafe(state, rocky, 0, defs));
  assert.ok(!benchSafe(state, rocky, 0, defs, true));
  // Spiky Energy: the attacker takes 2 damage counters when the Active Pokémon it is on is damaged.
  state = scene({ front: "base1-46" });
  put(state, 1, state.players[1].active, "sv9-159");
  state.players[0].active.energy.push(handed(state, 0, F));
  state.players[0].hand.pop();
  act(state, { type: "attack", player: 0, index: 0 });
  assert.equal(state.players[0].active.damage, 20);
  // Legacy Energy: 1 fewer Prize card, once a game.
  state = scene({ front: "base1-46" });
  const foe = state.players[1];
  foe.bench = [slotFor(state, 1, "base1-63"), slotFor(state, 1, "base1-63")];
  put(state, 1, foe.active, "sv6-167");
  foe.active.damage = maxHp(state, foe.active, defs) - 10;
  state.players[0].active.energy.push(handed(state, 0, F));
  state.players[0].hand.pop();
  const prizes = state.players[0].prizes.length;
  act(state, { type: "attack", player: 0, index: 0 });
  assert.equal(state.players[0].prizes.length, prizes);
  assert.ok(foe.legacyUsed);
});

test("more Scarlet & Violet and Mega Evolution Items and Supporters", () => {
  const ids = ["dptk3a-9", "me1-113", "me2pt5-201", "me2pt5-215", "me3-73", "me3-74", "me3-84", "me5-79", "me6-93", "me6-101", "sv10-161", "sv10-179", "sv10-181", "sv5-141", "sv5-150", "sv5-158", "sv6-142", "sv6-152", "sv6-156", "sv6-160", "sv6pt5-58", "sv7-132", "sv7-138", "sv8-164", "sv8-165", "sv8-166", "sv8-170", "sv8-171", "sv8-172", "sv8-173", "sv8-176", "sv8-181", "sv8-182", "sv8-185", "sv8-186", "sv8-189", "sv9-142", "sv9-146", "sv9-147", "sv9-156", "sv9-158", "svp-svp114", "zsv10pt5-80", "zsv10pt5-81"];
  for (const id of ids) assert.ok(defs(id).playable, id);
  // Antique Cover Fossil: our card source lost its HP, its text gives it (60).
  assert.equal(defs("zsv10pt5-80").fossil.mon.hp, 60);
  assert.ok(defs("zsv10pt5-80").fossil.mon.ability.noEffects);
  // Grisham: 50 healed from each Pokémon, both sides.
  let state = scene();
  state.players[0].active.damage = 60;
  state.players[1].active.damage = 30;
  act(state, { type: "play", player: 0, uid: handed(state, 0, "me6-93") });
  assert.equal(state.players[0].active.damage, 10);
  assert.equal(state.players[1].active.damage, 0);
  // Tasty Rice Ball: 30, and 30 more for each other Tasty Rice Ball in the discard pile.
  state = scene();
  state.players[0].active.damage = 90;
  const rice = state.players[0].deck.pop();
  state.cards[rice] = "me6-101";
  state.players[0].discard.push(rice);
  act(state, { type: "play", player: 0, uid: handed(state, 0, "me6-101") });
  assert.equal(state.players[0].active.damage, 30);
  // Arven's Sandwich: 30 on a Pokémon that isn't an Arven's Pokémon.
  state = scene();
  state.players[0].active.damage = 50;
  act(state, { type: "play", player: 0, uid: handed(state, 0, "sv10-161") });
  assert.equal(state.players[0].active.damage, 20);
  // Hand Trimmer: the opponent discards down to 5 first, then you.
  state = scene();
  while (state.players[1].hand.length < 8) state.players[1].hand.push(state.players[1].deck.pop());
  while (state.players[0].hand.length < 7) state.players[0].hand.push(state.players[0].deck.pop());
  act(state, { type: "play", player: 0, uid: handed(state, 0, "sv5-150") });
  assert.equal(state.pending[0].player, 1);
  assert.equal(state.pending[0].min, 3);
  act(state, { type: "choose", player: 1, uids: state.pending[0].uids.slice(0, 3) });
  assert.equal(state.players[1].hand.length, 5);
  assert.equal(state.pending[0].player, 0);
  act(state, { type: "choose", player: 0, uids: state.pending[0].uids.slice(0, state.pending[0].min) });
  assert.equal(state.players[0].hand.length, 5);
  // Redeemable Ticket: as many Prize cards as before, the old ones now at the bottom of the deck.
  state = scene();
  const prizes = state.players[0].prizes.slice();
  const deck = state.players[0].deck.length;
  act(state, { type: "play", player: 0, uid: handed(state, 0, "sv9-156") });
  assert.equal(state.players[0].prizes.length, prizes.length);
  assert.equal(state.players[0].deck.length, deck);
  assert.deepEqual(state.players[0].deck.slice(-prizes.length).sort(), prizes.sort());
  // Megaton Blower: every Tool and Special Energy on their Pokémon, and the Stadium.
  state = scene();
  const foe = state.players[1].active;
  foe.tool = state.players[1].deck.pop();
  state.cards[foe.tool] = "sv6-158";
  const special = state.players[1].deck.pop();
  state.cards[special] = "sv5-161";
  foe.energy.push(special);
  const stad = state.players[1].deck.pop();
  state.cards[stad] = "sv8-180";
  state.stadium = { uid: stad, owner: 1 };
  act(state, { type: "play", player: 0, uid: handed(state, 0, "sv8-182") });
  assert.ok(!foe.tool && !foe.energy.length && !state.stadium);
  // Acerola's Mischief: only with 2 or fewer Prize cards left for them; the chosen Pokémon is shielded from Pokémon ex.
  state = scene();
  const mischief = handed(state, 0, "me1-113");
  throws(() => act(state, { type: "play", player: 0, uid: mischief }), /nothing/);
  state.players[1].prizes.splice(0, state.players[1].prizes.length - 2);
  act(state, { type: "play", player: 0, uid: mischief });
  act(state, { type: "pick", player: 0, spot: ACTIVE });
  assert.ok(state.players[0].active.marks.some((m) => m.kind === "shield" && m.from === "box:ex" && m.turn === state.turn + 1));
  // Briar: a Knock Out of their Active Pokémon by a Tera Pokémon's attack this turn gives 1 more Prize card.
  state = scene({ front: "me2pt5-73" });
  assert.ok(defs("me2pt5-73").tera);
  state.players[1].prizes.splice(0, state.players[1].prizes.length - 2);
  state.players[1].bench = [slotFor(state, 1, "base1-63")];
  act(state, { type: "play", player: 0, uid: handed(state, 0, "sv7-132") });
  state.players[1].active.damage = maxHp(state, state.players[1].active, defs) - 10;
  state.players[0].active.energy.push(handed(state, 0, "energy-lightning"));
  state.players[0].hand.pop();
  const prizesBefore = state.players[0].prizes.length;
  const worth = defs(state.cards[state.players[1].active.uid]).prizes;
  act(state, { type: "attack", player: 0, index: 0 });
  assert.equal(prizesBefore - state.players[0].prizes.length, worth + 1);
  // Energy Swatter: an Energy card from their hand to the bottom of their deck.
  state = scene();
  const theirs = state.players[1].hand.find((u) => defs(state.cards[u]).kind === "energy") || (state.players[1].hand.push(state.players[1].deck.find((u) => defs(state.cards[u]).kind === "energy")), state.players[1].hand.at(-1));
  state.players[1].deck = state.players[1].deck.filter((u) => u !== theirs);
  act(state, { type: "play", player: 0, uid: handed(state, 0, "me3-73") });
  act(state, { type: "choose", player: 0, uids: [theirs] });
  assert.equal(state.players[1].deck.at(-1), theirs);
  // Brock's Scouting: 2 Basic Pokémon, or 1 Evolution Pokémon, not both.
  state = scene({ extra: [["sv9-146", 1]] });
  for (const u of state.players[0].deck.slice(0, 2)) state.cards[u] = "base1-24";
  act(state, { type: "play", player: 0, uid: handed(state, 0, "sv9-146") });
  const evo = state.pending[0].uids.filter((u) => defs(state.cards[u]).stage === "evolution");
  throws(() => act(state, { type: "choose", player: 0, uids: evo.slice(0, 2) }), /kind/);
  act(state, { type: "choose", player: 0, uids: evo.slice(0, 1) });
  // Kofu: 2 cards to the bottom, then 4 drawn.
  state = scene();
  const hand = state.players[0].hand.length;
  act(state, { type: "play", player: 0, uid: handed(state, 0, "sv7-138") });
  act(state, { type: "choose", player: 0, uids: state.pending[0].uids.slice(0, 2) });
  assert.equal(state.players[0].hand.length, hand - 2 + 4);
  // Team Rocket's Archer: only after a Team Rocket's Pokémon was Knocked Out on the opponent's last turn.
  state = scene();
  const archer = handed(state, 0, "me2pt5-201");
  throws(() => act(state, { type: "play", player: 0, uid: archer }), /nothing/);
  const rocket = state.players[0].deck.pop();
  state.cards[rocket] = "sv10-15";
  state.players[0].lostWho = [{ turn: state.turn - 1, uid: rocket }];
  act(state, { type: "play", player: 0, uid: archer });
  assert.equal(state.players[0].hand.length, 5);
});

test("more Scarlet & Violet Tools, Stadiums and Special Energy", () => {
  for (const id of ["sv6-158", "sv7-134", "sv6-164", "sv7-137", "sv9-148", "sv8-162", "me2pt5-206", "me4-74", "sv8-180", "sv9-152", "sv9-154", "me4-86", "sv6-166"]) assert.ok(defs(id).playable, id);
  const tooled = (state, p, slot, id) => {
    slot.tool = state.players[p].deck.pop();
    state.cards[slot.tool] = id;
    return slot.tool;
  };
  const charge = (state, p, slot, id) => {
    const uid = state.players[p].deck.pop();
    state.cards[uid] = id;
    slot.energy.push(uid);
    return uid;
  };
  // Lucky Helmet: 2 cards when damaged in the Active Spot. Deluxe Bomb: 12 damage counters back, then it goes.
  let state = scene({ front: "base1-46" });
  tooled(state, 1, state.players[1].active, "sv6-158");
  state.players[0].active.energy.push(handed(state, 0, F));
  state.players[0].hand.pop();
  let hand = state.players[1].hand.length;
  act(state, { type: "attack", player: 0, index: 0 });
  assert.equal(state.players[1].hand.length, hand + 2 + 1); // and the draw that starts their turn
  state = scene({ front: "base1-46" });
  tooled(state, 1, state.players[1].active, "sv7-134");
  state.players[0].active.energy.push(handed(state, 0, F));
  state.players[0].hand.pop();
  state.players[1].bench = [slotFor(state, 1, "base1-63")];
  act(state, { type: "attack", player: 0, index: 0 });
  assert.equal(state.players[0].active?.damage ?? 120, 120);
  assert.ok(!state.players[1].active.tool);
  // Survival Brace: from full HP, a Knock Out leaves it 10 HP, and the Brace goes.
  state = scene({ front: "base1-46" });
  tooled(state, 1, state.players[1].active, "sv6-164");
  state.players[0].active.energy.push(handed(state, 0, F));
  state.players[0].hand.pop();
  state.players[1].active.damage = 0;
  state.cards[state.players[1].active.uid] = "base1-58"; // Pikachu, 40 HP
  state.players[0].active.marks = [{ kind: "stronger", turn: state.turn, n: 100 }];
  act(state, { type: "attack", player: 0, index: 0 });
  assert.equal(hpLeft(state, state.players[1].active, defs), 10);
  assert.ok(!state.players[1].active.tool);
  // Gravity Gemstone: both Active Pokémon retreat for Colorless more.
  state = scene({ front: "base1-46" });
  const mine = retreatCost(state, state.players[0].active, defs);
  const foes = retreatCost(state, state.players[1].active, defs);
  tooled(state, 1, state.players[1].active, "sv7-137");
  assert.equal(retreatCost(state, state.players[0].active, defs), mine + 1);
  assert.equal(retreatCost(state, state.players[1].active, defs), foes + 1);
  // Lively Stadium: Basic Pokémon get +30 HP. N's Castle: N's Pokémon retreat for free.
  state = scene({ front: "base1-46" });
  const uid = state.players[0].deck.pop();
  state.cards[uid] = "sv8-180";
  state.stadium = { uid, owner: 0 };
  assert.equal(maxHp(state, state.players[0].active, defs), defs("base1-46").hp + 30);
  state.cards[uid] = "sv9-152";
  state.cards[state.players[0].active.uid] = "sv9-97";
  assert.ok(defs("sv9-97").name.startsWith("N's ") && defs("sv9-97").retreat > 0);
  assert.equal(retreatCost(state, state.players[0].active, defs), 0);
  // Nitro Fire Energy: discarded by its Fire Pokémon's attack, it goes back to the hand afterwards.
  state = scene({ front: "base1-46" });
  state.players[1].bench = [slotFor(state, 1, "base1-63")];
  const nitro = [charge(state, 0, state.players[0].active, "me4-86"), charge(state, 0, state.players[0].active, "me4-86")];
  act(state, { type: "attack", player: 0, index: 1 });
  while (state.pending[0]?.player === 0) act(state, { type: "choose", player: 0, uids: state.pending[0].uids.slice(0, state.pending[0].min || 1) });
  if (state.pending[0]?.type === "promote") act(state, { type: "promote", player: 1, spot: 0 });
  assert.equal(nitro.filter((u) => state.players[0].hand.includes(u)).length, 1);
  assert.ok(!nitro.some((u) => state.players[0].discard.includes(u)));
  // Boomerang Energy: back onto the Pokémon that discarded it, after attacking.
  state = scene({ front: "sm11-165" });
  state.players[1].bench = [slotFor(state, 1, "base1-63")];
  const boom = [charge(state, 0, state.players[0].active, "sv6-166"), charge(state, 0, state.players[0].active, "sv6-166")];
  act(state, { type: "attack", player: 0, index: 0 });
  while (state.pending[0]?.player === 0) act(state, { type: "choose", player: 0, uids: state.pending[0].uids.slice(0, 1) });
  assert.deepEqual(state.players[0].active.energy.slice().sort(), boom.slice().sort());
  // Not when the opponent's effect discards it.
  state = scene();
  const lone = charge(state, 0, state.players[0].active, "sv6-166");
  state.current = 1;
  state.attackBy = { p: 1, uid: state.players[1].active.uid, turn: state.turn };
  noteShed(state, 0, ACTIVE, [lone]);
  assert.ok(!state.comeback);
});

test("more Scarlet & Violet and Mega Evolution Abilities", () => {
  for (const id of ["me2pt5-159", "me2pt5-79", "me1-11", "me1-110", "me6-52", "me2-62", "sv5-25", "me2pt5-26", "me2pt5-70", "me5-45", "sv10-8", "me6-47", "sv7-115", "me2-82"]) assert.ok(defs(id).ability, id);
  const charge = (state, p, slot, id) => {
    const uid = state.players[p].deck.pop();
    state.cards[uid] = id;
    slot.energy.push(uid);
    return uid;
  };
  // Drakloak: 1 of the top 2 into the hand, the other to the bottom.
  let state = scene({ bench: ["me2pt5-159"] });
  const [a, b] = state.players[0].deck.slice(0, 2);
  act(state, { type: "ability", player: 0, spot: 0 });
  act(state, { type: "choose", player: 0, uids: [b] });
  assert.ok(state.players[0].hand.includes(b));
  assert.equal(state.players[0].deck.at(-1), a);
  // Team Rocket's Mewtwo ex: no attack without 4 Team Rocket's Pokémon; Mega Golurk ex: not with fewer than 10 cards in hand.
  state = scene({ front: "me2pt5-79" });
  throws(() => act(state, { type: "attack", player: 0, index: 0 }), /unless/);
  state = scene({ front: "me2pt5-79", bench: ["sv10-15", "sv10-19", "sv10-15"] });
  assert.ok(!/unless/.test((() => { try { act(state, { type: "attack", player: 0, index: 0 }); return ""; } catch (err) { return err.message; } })()));
  state = scene({ front: "me6-47" });
  throws(() => act(state, { type: "attack", player: 0, index: 0 }), /unless/);
  // Shuckle: only with a Grass Energy on it.
  state = scene({ front: "me1-11", bench: ["base1-46"] });
  state.players[0].bench[0].damage = 30;
  throws(() => act(state, { type: "ability", player: 0, spot: ACTIVE }), /nothing/);
  charge(state, 0, state.players[0].active, G);
  act(state, { type: "ability", player: 0, spot: ACTIVE });
  act(state, { type: "pick", player: 0, spot: 0 });
  assert.equal(state.players[0].bench[0].damage, 0);
  // Gumshoos: a card from the hand and the top card of the deck trade places.
  state = scene({ front: "me1-110" });
  const top = state.players[0].deck[0];
  const card = state.players[0].hand[0];
  act(state, { type: "ability", player: 0, spot: ACTIVE });
  act(state, { type: "choose", player: 0, uids: [card] });
  assert.equal(state.players[0].deck[0], card);
  assert.ok(state.players[0].hand.includes(top) && !state.players[0].hand.includes(card));
  // Steelix: 60 less damage from full HP only. Seviper: 120 more with a Darkness Mega Evolution Pokémon ex in play.
  state = scene({ front: "me6-52" });
  assert.equal(toolOf(state, state.players[0].active, defs).less, 60);
  state.players[0].active.damage = 10;
  assert.ok(!toolOf(state, state.players[0].active, defs).less);
  state = scene({ front: "me2-62" });
  assert.ok(!toolOf(state, state.players[0].active, defs).plus);
  assert.ok(fits(defs("me2-56"), "mega:Darkness"));
  state.players[0].bench = [slotFor(state, 0, "me2-56")];
  assert.equal(toolOf(state, state.players[0].active, defs).plus, 120);
  // Cynthia's Roserade: Cynthia's Pokémon only.
  state = scene({ front: "sv10-8" });
  assert.equal(toolOf(state, state.players[0].active, defs).plus, 30);
  state.players[0].bench = [slotFor(state, 0, "base1-46")];
  assert.ok(!toolOf(state, state.players[0].bench[0], defs).plus);
  // Iron Leaves ex: onto the Bench, then into the Active Spot, taking Energy along the way.
  state = scene();
  const old = state.players[0].active;
  charge(state, 0, old, G);
  const leaves = handed(state, 0, "sv5-25");
  act(state, { type: "bench", player: 0, uid: leaves });
  act(state, { type: "pick", player: 0, spot: state.players[0].bench.length - 1 });
  assert.equal(state.players[0].active.uid, leaves);
  act(state, { type: "pick", player: 0, spot: state.pending[0].spots[0] });
  assert.equal(state.players[0].active.energy.length, 1);
  // Ethan's Ho-Oh ex: up to 2 Basic Fire Energy onto 1 Benched Ethan's Pokémon, not another.
  state = scene({ front: "me2pt5-26", bench: ["base1-46"] });
  throws(() => act(state, { type: "ability", player: 0, spot: ACTIVE }), /nothing/);
  // Rampardos ex: heads, an Energy off the other Active Pokémon.
  state = scene({ front: "me5-45" });
  const theirs = charge(state, 1, state.players[1].active, W);
  // A seed whose first coin is heads.
  let rng = 0;
  for (; rng < 50; rng += 1) {
    const probe = { rng };
    if (rand(probe) < 0.5) break;
  }
  state.rng = rng;
  act(state, { type: "ability", player: 0, spot: ACTIVE });
  if (state.pending[0]) act(state, { type: "pick", player: 0, spot: ACTIVE });
  assert.ok(state.players[1].discard.includes(theirs));
});

labMon("lab-spread", { name: "Lab spread" }, [["Spray", 10, "This attack also does 50 damage to each of your opponent's Benched Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)"]]);
labMon("lab-smash-ex", { subtypes: ["Basic", "ex"], name: "Lab Smash ex" }, [["Smash", 400, ""]]);
labMon("lab-leaf2", { types: ["Grass"], name: "Lab leaf" }, [["Tap", 30, ""]]);

test("Scarlet & Violet Abilities: the wordings read", () => {
  for (const id of ["me1-61", "me4-64", "me6-85", "sv10-185", "sv4-5", "sv5-129", "sv6-5", "sv7-14", "sv8-74", "sv9-7", "sv9-164", "sv6pt5-42", "sv6-33", "mcd26-7"]) assert.ok(defs(id).ability && defs(id).playable, id);
  assert.deepEqual(defs("me1-61").ability.prizes, { self: true, none: true, by: "box=ex" });
  assert.deepEqual(defs("sv6pt5-42").ability.handBar, { kinds: ["stadium"] });
});

test("Jasmine's Gaze: Benched Pokémon take less damage too", () => {
  assert.ok(defs("sv8-178").playable);
  const state = scene({ bench: ["base1-46"] });
  act(state, { type: "play", player: 0, uid: handed(state, 0, "sv8-178") });
  act(state, { type: "end", player: 0 });
  state.cards[state.players[1].active.uid] = "lab-spread";
  act(state, { type: "attack", player: 1, index: 0 });
  assert.equal(state.players[0].bench[0].damage, 20);
});

test("Shedinja: no Prize cards for it when a Pokémon ex Knocks it Out", () => {
  const state = scene({ front: "lab-smash-ex", foeBench: ["base1-63"] });
  state.cards[state.players[1].active.uid] = "me1-61";
  const prizes = state.players[0].prizes.length;
  act(state, { type: "attack", player: 0, index: 0 });
  assert.equal(state.players[0].prizes.length, prizes);
  // The same Knock Out by a Pokémon that isn't ex: a Prize card as usual.
  const again = scene({ front: "lab-spread", foeBench: ["base1-63"] });
  again.cards[again.players[1].active.uid] = "me1-61";
  again.players[1].active.damage = 1000;
  resolveKnockOuts(again, defs, []);
  assert.ok(again.players[0].prizes.length <= prizes);
});

test("Lilligant: more damage for Grass Pokémon, and Copperajah keeps Stadiums in the hand", () => {
  const hit = (bench) => {
    const state = scene({ front: "lab-leaf2", bench });
    const foe = state.players[1].active;
    act(state, { type: "attack", player: 0, index: 0 });
    return foe.damage;
  };
  assert.equal(hit(["sv9-7"]) - hit(["base1-46"]), 20);
  const state = scene();
  state.cards[state.players[1].active.uid] = "sv6pt5-42";
  throws(() => act(state, { type: "play", player: 0, uid: handed(state, 0, "me3-77") }), /./);
});

test("Ariados: an Evolution Active Pokémon retreats for 1 more", () => {
  const state = scene({ front: "base1-24" });
  const before = retreatCost(state, state.players[0].active, defs);
  state.players[1].bench = [slotFor(state, 1, "sv6-5")];
  assert.equal(retreatCost(state, state.players[0].active, defs), before + 1);
  state.cards[state.players[0].active.uid] = "base1-46";
  assert.equal(retreatCost(state, state.players[0].active, defs), 1);
});

test("Dudunsparce: draw 3, then it goes back into the deck", () => {
  const state = scene({ bench: ["sv5-129"] });
  const side = state.players[0];
  const hand = side.hand.length;
  const deck = side.deck.length;
  act(state, { type: "ability", player: 0, spot: 0 });
  assert.equal(side.hand.length, hand + 3);
  assert.equal(side.bench.length, 0);
  assert.equal(side.deck.length, deck - 3 + 1);
});

test("Lillie's Ribombee: an on-play Ability the bot leaves alone", () => {
  const ribombee = defs("sv9-164").ability.enter;
  assert.equal(trainerAim(ribombee.steps), "move");
});

/* ---------- the last Standard Abilities ---------- */

labMon("lab-zap", { types: ["Lightning"], name: "Lab zap" }, [["Zap", 30, ""]]);
labMon("lab-psy", { types: ["Psychic"], name: "Lab psy" }, [["Psy", 30, ""]]);
labMon("lab-dragon", { types: ["Dragon"], name: "Lab dragon" }, [["Claw", 10, ""]]);
labMon("lab-dark", { types: ["Darkness"], name: "Lab dark" }, [["Bite", 10, ""]]);
labMon("lab-tap", { name: "Lab tap" }, [["Tap", 10, ""]]);
labMon("lab-fest", { types: ["Grass"], name: "Lab fest", abilities: [{ type: "Ability", name: "Festival Lead", text: "If Festival Grounds is in play, this Pokémon may use an attack it has twice. If the first attack Knocks Out your opponent's Active Pokémon, you may attack again after your opponent chooses a new Active Pokémon." }] }, [["Tap", 30, ""]]);
/** A seed whose next coin is heads (or tails). */
const coinSeed = (heads) => {
  for (let rng = 0; rng < 200; rng += 1) if ((rand({ rng }) < 0.5) === heads) return rng;
  return 0;
};
const energize = (state, p, slot, id, n = 1) => {
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const uid = state.players[p].deck.pop();
    state.cards[uid] = id;
    slot.energy.push(uid);
    out.push(uid);
  }
  return out;
};
/** Answer whatever pick or choice is waiting with its first offer (or the cards given). */
const answer = (state, uids = null) => {
  const w = state.pending[0];
  if (w.type === "pick") return act(state, { type: "pick", player: w.player, spot: w.spots[0] });
  if (w.type === "choose") return act(state, { type: "choose", player: w.player, uids: uids || w.uids.slice(0, Math.max(1, w.min)) });
  throw new Error(`can't answer ${w.type}`);
};

test("Clawitzer and Palafin: Abilities as the Pokémon moves from the Active Spot to the Bench", () => {
  for (const id of ["me1-38", "sv6-60", "sv6-61", "svp-svp126"]) assert.ok(defs(id).ability, id);
  // Clawitzer: retreated, then up to 2 Basic Water Energy from the hand onto it.
  let state = scene({ front: "me1-38", bench: ["base1-46"] });
  const claw = state.players[0].active;
  energize(state, 0, claw, W, 3);
  const waters = [handed(state, 0, W), handed(state, 0, W)];
  act(state, { type: "retreat", player: 0, to: 0 });
  assert.equal(state.pending[0]?.effect?.key, "fall");
  act(state, { type: "pick", player: 0, spot: 0 });
  act(state, { type: "choose", player: 0, uids: waters });
  while (state.pending.length) answer(state);
  assert.equal(state.players[0].bench[0], claw);
  assert.equal(claw.energy.length, 3 - retreatCost(state, claw, defs) + 2);
  // Palafin: retreated, Palafin ex from the deck takes its place, damage and Energy kept; Palafin goes into the deck.
  state = scene({ front: "sv6-60", bench: ["base1-46"] });
  const fin = state.players[0].active;
  fin.under = [handed(state, 0, "sv6-59")];
  state.players[0].hand.pop();
  fin.damage = 30;
  energize(state, 0, fin, W, 2);
  const hero = state.players[0].deck[0];
  state.cards[hero] = "sv6-61";
  act(state, { type: "retreat", player: 0, to: 0 });
  act(state, { type: "pick", player: 0, spot: 0 });
  act(state, { type: "choose", player: 0, uids: [hero] });
  const now = state.players[0].bench[0];
  assert.equal(now.uid, hero);
  assert.equal(now.damage, 30);
  assert.ok(now.energy.length >= 1 && now.under.length === 1);
  assert.ok(state.players[0].deck.some((uid) => state.cards[uid] === "sv6-60"));
  // Palafin ex can't be played from the hand onto Finizen.
  state = scene({ front: "sv6-59" });
  state.players[0].active.since = 0;
  const ex = handed(state, 0, "sv6-61");
  assert.ok(!legalActions(state, 0, defs).some((a) => a.type === "evolve" && a.uid === ex));
  throws(() => act(state, { type: "evolve", player: 0, uid: ex, spot: ACTIVE }), /evolve/);
});

test("Eevee ex: any Pokémon ex that evolves from Eevee, from the hand", () => {
  const state = scene({ front: "sv8pt5-75" });
  const sylveon = handed(state, 0, "sv8pt5-41");
  assert.ok(legalActions(state, 0, defs).some((a) => a.type === "evolve" && a.uid === sylveon));
  act(state, { type: "evolve", player: 0, uid: sylveon, spot: ACTIVE });
  assert.equal(state.players[0].active.uid, sylveon);
});

test("Lillie's Clefairy ex and Illumise: Weakness as their Abilities say", () => {
  const hit = (front, foe, bench = []) => {
    const state = scene({ front, bench });
    state.cards[state.players[1].active.uid] = foe;
    const target = state.players[1].active;
    act(state, { type: "attack", player: 0, index: 0 });
    return target.damage;
  };
  assert.equal(hit("lab-psy", "lab-dragon"), 30);
  assert.equal(hit("lab-psy", "lab-dragon", ["me2pt5-76"]), 60);
  // Squirtle's Lightning Weakness: ×2, and ×3 with Illumise and Volbeat in play.
  assert.equal(hit("lab-zap", "base1-63"), 60);
  assert.equal(hit("lab-zap", "base1-63", ["me55-4"]), 60);
  assert.equal(hit("lab-zap", "base1-63", ["me55-4", "sv6-9"]), 90);
});

test("Abilities that answer attack damage: Orthworm ex, Spiritomb, Wishiwashi, Turtonator, Team Rocket's Koffing", () => {
  // Orthworm ex: 2 damage counters for each Metal Energy on it, in the Active Spot or on the Bench.
  let state = scene({ front: "lab-tap" });
  state.cards[state.players[1].active.uid] = "sv7-110";
  energize(state, 1, state.players[1].active, "energy-metal", 2);
  act(state, { type: "attack", player: 0, index: 0 });
  assert.equal(state.players[0].active.damage, 40);
  state = scene({ front: "lab-spread", foeBench: ["sv7-110"] });
  energize(state, 1, state.players[1].bench[0], "energy-metal", 1);
  act(state, { type: "attack", player: 0, index: 0 });
  assert.equal(state.players[0].active.damage, 20);
  // Spiritomb: their Active Darkness Pokémon damaged, 1 damage counter.
  state = scene({ front: "lab-tap", foeBench: ["me1-87"] });
  state.cards[state.players[1].active.uid] = "lab-dark";
  act(state, { type: "attack", player: 0, index: 0 });
  assert.equal(state.players[0].active.damage, 10);
  state = scene({ front: "lab-tap", foeBench: ["me1-87"] });
  act(state, { type: "attack", player: 0, index: 0 });
  assert.equal(state.players[0].active.damage, 0);
  // Turtonator: once the attack is done, its player discards an Energy from the Attacking Pokémon.
  state = scene({ front: "lab-tap" });
  state.cards[state.players[1].active.uid] = "me3-17";
  const [fire, water] = [...energize(state, 0, state.players[0].active, F), ...energize(state, 0, state.players[0].active, W)];
  act(state, { type: "attack", player: 0, index: 0 });
  assert.equal(state.pending[0].player, 1);
  act(state, { type: "choose", player: 1, uids: [water] });
  assert.deepEqual(state.players[0].active.energy, [fire]);
  assert.ok(state.players[0].discard.includes(water));
  // Team Rocket's Koffing: Koffing from the deck onto the Bench.
  state = scene({ front: "lab-tap" });
  state.cards[state.players[1].active.uid] = "sv10-125";
  const koffing = state.players[1].deck.slice(0, 2);
  for (const uid of koffing) state.cards[uid] = "sv10-125";
  act(state, { type: "attack", player: 0, index: 0 });
  act(state, { type: "choose", player: 1, uids: koffing });
  assert.equal(state.players[1].bench.length, 2);
});

test("Yveltal, Team Rocket's Ampharos, Bastiodon, Team Rocket's Articuno, Garbodor", () => {
  // Yveltal: the other Active Pokémon can't be healed; a Benched one can.
  let state = scene({ bench: ["base1-46"], foeBench: ["me55-100"] });
  state.players[0].active.damage = 30;
  state.players[0].bench[0].damage = 30;
  assert.equal(healRoom(state, state.players[0].active), 0);
  assert.equal(healRoom(state, state.players[0].bench[0]), 30);
  // Team Rocket's Ampharos: 4 damage counters on what the other player evolves from the hand.
  state = scene({ foeBench: ["sv10-74"] });
  state.players[0].active.since = 0;
  act(state, { type: "evolve", player: 0, uid: handed(state, 0, "base1-24"), spot: ACTIVE });
  assert.equal(state.players[0].active.damage, 40);
  // Bastiodon: from the Bench, no damage from an attacker with 2 or less Energy.
  state = scene({ front: "lab-tap", foeBench: ["me5-62"] });
  act(state, { type: "attack", player: 0, index: 0 });
  assert.equal(state.players[1].active.damage, 0);
  state = scene({ front: "lab-tap", foeBench: ["me5-62"] });
  energize(state, 0, state.players[0].active, F, 3);
  act(state, { type: "attack", player: 0, index: 0 });
  assert.equal(state.players[1].active.damage, 10);
  // Team Rocket's Articuno: no effects of attacks on its Basic Team Rocket's Pokémon.
  state = scene({ front: "sv10-125", bench: ["sv10-51"] });
  assert.ok(warded(state, state.players[0].active, { player: 1, src: "attack" }, defs));
  state = scene({ front: "base1-46", bench: ["sv10-51"] });
  assert.ok(!warded(state, state.players[0].active, { player: 1, src: "attack" }, defs));
  // Garbodor: 20 less from their Active Pokémon while it has a Tool attached.
  state = scene({ foeBench: ["me4-57"] });
  assert.ok(!toolOf(state, state.players[0].active, defs).plus);
  state.players[0].active.tool = handed(state, 0, "sv5-159");
  state.players[0].hand.pop();
  assert.equal(toolOf(state, state.players[0].active, defs).plus, -20);
});

test("Gengar ex and Miraidon: as they are Knocked Out", () => {
  // Gengar ex: heads, the Attacking Pokémon is Knocked Out too.
  let state = scene({ front: "lab-smash-ex", bench: ["base1-46"], foeBench: ["base1-63"] });
  state.cards[state.players[1].active.uid] = "me55-90";
  const smash = state.players[0].active;
  state.rng = coinSeed(true);
  act(state, { type: "attack", player: 0, index: 0 });
  assert.ok(state.players[0].discard.includes(smash.uid));
  state = scene({ front: "lab-smash-ex", bench: ["base1-46"], foeBench: ["base1-63"] });
  state.cards[state.players[1].active.uid] = "me55-90";
  state.rng = coinSeed(false);
  act(state, { type: "attack", player: 0, index: 0 });
  assert.ok(state.players[0].active && !state.players[0].discard.includes(state.players[0].active.uid));
  // Miraidon: up to 2 Basic Lightning Energy from it to 1 Benched Pokémon.
  state = scene({ front: "lab-smash-ex", foeBench: ["base1-63"] });
  state.cards[state.players[1].active.uid] = "me5-28";
  const bolts = energize(state, 1, state.players[1].active, "energy-lightning", 2);
  act(state, { type: "attack", player: 0, index: 0 });
  act(state, { type: "choose", player: 1, uids: bolts });
  while (state.pending[0]?.type === "pick") answer(state);
  assert.deepEqual(state.players[1].bench[0].energy, bolts);
});

test("Festival Lead: two attacks with Festival Grounds in play, and Thwackey", () => {
  for (const id of ["sv6-18", "sv6-15", "sv6-149"]) assert.ok(defs(id).playable && (defs(id).kind !== "pokemon" || defs(id).ability), id);
  const grounds = (state) => {
    const uid = handed(state, 0, "sv6-149");
    state.players[0].hand.pop();
    state.stadium = { uid, owner: 0 };
  };
  let state = scene({ front: "lab-fest" });
  grounds(state);
  const foe = state.players[1].active;
  state.cards[foe.uid] = "lab-tap";
  act(state, { type: "attack", player: 0, index: 0 });
  assert.equal(state.current, 0);
  assert.deepEqual([...new Set(legalActions(state, 0, defs).map((a) => a.type))].sort(), ["attack", "end"]);
  throws(() => act(state, { type: "retreat", player: 0, to: 0 }), /second attack/);
  act(state, { type: "attack", player: 0, index: 0 });
  assert.equal(foe.damage, 60);
  assert.equal(state.current, 1);
  // Without the Stadium, one attack.
  state = scene({ front: "lab-fest" });
  act(state, { type: "attack", player: 0, index: 0 });
  assert.equal(state.current, 1);
  // A Knock Out first: the new Active Pokémon is chosen, then the second attack.
  state = scene({ front: "lab-fest", foeBench: ["base1-63"] });
  grounds(state);
  state.players[1].active.damage = maxHp(state, state.players[1].active, defs) - 10;
  act(state, { type: "attack", player: 0, index: 0 });
  act(state, { type: "promote", player: 1, spot: 0 });
  assert.equal(state.current, 0);
  act(state, { type: "attack", player: 0, index: 0 });
  assert.equal(state.players[1].active.damage, 30);
  // Thwackey: a search, only with a Festival Lead Pokémon in the Active Spot.
  state = scene({ front: "lab-fest", bench: ["sv6-15"] });
  grounds(state);
  act(state, { type: "ability", player: 0, spot: 0 });
  assert.equal(state.pending[0].type, "choose");
  state = scene({ bench: ["sv6-15"] });
  grounds(state);
  throws(() => act(state, { type: "ability", player: 0, spot: 0 }), /Festival Lead/);
  // Festival Grounds: a Pokémon with Energy attached shakes off its Special Conditions and can't get them.
  state = scene();
  grounds(state);
  const front = state.players[0].active;
  addCondition(state, front, "poisoned", defs);
  assert.ok(conditionsOn(front).includes("poisoned"));
  act(state, { type: "attach", player: 0, uid: handed(state, 0, F), spot: ACTIVE });
  assert.deepEqual(conditionsOn(front), []);
  assert.ok(!addCondition(state, front, "asleep", defs));
});

test("on-play Abilities: Meowth ex's Last-Ditch Catch, Farfetch'd, Ninjask, Toxtricity", () => {
  // Meowth ex: a Supporter, once a turn among Last-Ditch Abilities.
  let state = scene({ extra: [["sv4pt5-87", 2]] });
  act(state, { type: "bench", player: 0, uid: handed(state, 0, "me3-62") });
  assert.equal(state.pending[0].effect.op, "ability");
  answer(state);
  const supporter = state.pending[0].uids[0];
  act(state, { type: "choose", player: 0, uids: [supporter] });
  assert.ok(state.players[0].hand.includes(supporter));
  act(state, { type: "bench", player: 0, uid: handed(state, 0, "me3-62") });
  assert.equal(state.pending.length, 0);
  // Farfetch'd: a Pokémon Tool from the deck onto it.
  state = scene({ extra: [["sv5-159", 4]] });
  act(state, { type: "bench", player: 0, uid: handed(state, 0, "sv6-132") });
  answer(state);
  act(state, { type: "choose", player: 0, uids: state.pending[0].uids.slice(0, 1) });
  assert.equal(state.cards[state.players[0].bench[0].tool], "sv5-159");
  // Ninjask: Shedinja from the deck straight onto the Bench.
  state = scene({ extra: [["me1-61", 4]] });
  state.players[0].active.since = 0;
  state.cards[state.players[0].active.uid] = "me1-16";
  act(state, { type: "evolve", player: 0, uid: handed(state, 0, "me1-17"), spot: ACTIVE });
  answer(state);
  act(state, { type: "choose", player: 0, uids: state.pending[0].uids.slice(0, 1) });
  assert.equal(state.cards[state.players[0].bench[0].uid], "me1-61");
  // Toxtricity: a Basic Darkness Energy onto a Benched Darkness Pokémon, and 2 damage counters on it.
  state = scene({ bench: ["me2-68", "me1-87"] });
  act(state, { type: "ability", player: 0, spot: 0 });
  answer(state);
  assert.deepEqual(state.pending[0].spots, [0, 1]);
  act(state, { type: "pick", player: 0, spot: 1 });
  assert.equal(state.players[0].bench[1].energy.length, 1);
  assert.equal(state.players[0].bench[1].damage, 20);
});

console.log(`${passed} checks passed${process.exitCode ? ", some failed" : ""}`);
