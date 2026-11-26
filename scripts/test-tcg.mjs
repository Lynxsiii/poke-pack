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
import { ACTIVE, FORMATS, RuleError, abilityOn, addCondition, apply, benchSafe, canRetreat, energyOf, toolOf, conditionsOn, createGame, damageAfterTyping, legalActions, maxHp, resolveKnockOuts, retreatCost, unpaid, usableAttacks, viewFor } from "../js/tcg/engine.js";
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
  const owned = { "base1-46": 5, "base1-24": 1, "me1-113": 2 };
  const check = (cards, own = owned, format = "unlimited") => checkDeck({ format, cards }, own, defs);
  assert.deepEqual(check({ "base1-46": 4, [F]: 56 }).problems, []);
  assert.match(check({ "base1-46": 4, [F]: 55 }).problems[0], /1 more card to go/);
  assert.match(check({ "base1-46": 4, [F]: 57 }).problems[0], /1 too many cards/);
  assert.match(check({ "base1-46": 5, [F]: 55 }).problems.join(" "), /5 copies of Charmander, the limit is 4/);
  assert.match(check({ "base1-46": 4, [F]: 56 }, {}).problems.join(" "), /You own 0 of Charmander/);
  assert.match(check({ "base1-46": 4, [F]: 56 }, { "base1-46": 1 }).problems.join(" "), /You own 1/);
  assert.match(check({ "me1-113": 1, "base1-46": 4, [F]: 55 }).problems.join(" "), /can't be played yet/);
  assert.match(check({ [F]: 60 }).problems.join(" "), /Basic Pokémon/);
  assert.deepEqual(check({ "base1-46": 1, [F]: 59 }).problems, [], "basic Energy has no copy limit");
  assert.equal(roomFor({ format: "unlimited", cards: { "base1-46": 4 } }, "base1-46", owned, defs), 0);
  assert.equal(roomFor({ format: "unlimited", cards: { "base1-46": 3 } }, "base1-46", owned, defs), 1);
  assert.equal(roomFor({ format: "unlimited", cards: { "base1-46": 1 } }, "base1-46", { "base1-46": 3 }, defs), 2); // owns three
  assert.equal(roomFor({ format: "unlimited", cards: {} }, "me1-113", owned, defs), 0);
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
  // Still unread: a Stadium can't be dropped by a condition it doesn't know.
  assert.equal(compileTrainer("You can use this card only if you have any Tera Pokémon in play. Draw 2 cards."), null);
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
  // Unread on purpose: Rock-Paper-Scissors, a Fossil played as a Pokémon.
  assert.ok(!defs("swsh2-158").playable && !defs("ex13-92").playable);
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

console.log(`${passed} checks passed${process.exitCode ? ", some failed" : ""}`);
