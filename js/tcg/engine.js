/**
 * The card game's rules engine.
 *
 * Pure rules, no DOM, no network, no clock: the page runs it for a match
 * against the bot, and the Worker will run the same file as the referee of a
 * match between two players (docs/tcg-plan.md). Everything random comes from
 * the seed kept in the state, so a match can be replayed from its seed and
 * its list of actions.
 *
 *   createGame({ decks, names, format, seed }, defs)  -> state
 *   legalActions(state, player, defs)                 -> [action]
 *   apply(state, action, defs)                        -> [event]   (changes state, throws RuleError)
 *   viewFor(state, player)                            -> state with the other side's hidden cards removed
 *
 * `defs` is a lookup of card definitions by catalog id (js/tcg/cards.js). The
 * state holds only ids and numbers, so it survives JSON.
 *
 * State
 *   rules     { deckSize, prizes, bench }
 *   cards     { uid: catalogId }        every physical card of both decks
 *   players   [{ name, deck, hand, discard, prizes: [uid], active: slot|null, bench: [slot],
 *                placed, mulligans, energyUsed, retreated }]
 *   slot      { uid, under: [uid], energy: [uid], damage, since, status? }   uid is the top card, `since` the turn it arrived
 *             status: { main: "" | "asleep" | "confused" | "paralyzed", poisoned, burned, since }  (Active Pokémon only)
 *   phase     "setup" | "main" | "over"
 *   current   whose turn (0 | 1), first: who went first, turn: 1, 2, 3...
 *   pending   [{ type: "promote", player }]   answers the game waits for before anything else
 *   winner    0 | 1 | null (a tie), reason: "prizes" | "bench" | "deck" | "concede" | "tie"
 *
 * Actions (all carry `player`)
 *   setup    { type: "place", active: uid, bench: [uid] }
 *   main     { type: "bench", uid }
 *            { type: "evolve", uid, spot }          spot: -1 the Active Pokémon, 0.. a Bench place
 *            { type: "attach", uid, spot }
 *            { type: "retreat", to, discard?: [uid] }
 *            { type: "attack", index }
 *            { type: "end" }
 *   pending  { type: "promote", spot }
 *   any time { type: "concede" }
 *
 * What is in: Basic Pokémon, evolution, one Energy a turn, attacks, Weakness
 * and Resistance, retreat, prizes (more for the cards whose rule says so), the
 * three ways to win, mulligans, the first player not attacking on turn 1.
 * Special Conditions and the checkup between turns (the current rules: Poison
 * 10, Burn 20 then a flip to shake it, Sleep a flip to wake, Paralysis gone
 * after its owner's next turn, Confusion a flip to attack or 30 to itself).
 * Attack text runs through js/tcg/effects.js; text it can't read yet does the
 * printed damage only. Not in yet: Trainers, Abilities.
 */

import { runAttackEffects } from "./effects.js";
import { runTrainer, trainerReady } from "./trainers.js";

export const FORMATS = {
  standard: { id: "standard", name: "Full deck", deckSize: 60, prizes: 6, bench: 5, copies: 4 },
  half: { id: "half", name: "Half deck", deckSize: 30, prizes: 3, bench: 5, copies: 2 },
};

export const ACTIVE = -1;
const HAND_SIZE = 7;

export class RuleError extends Error {}

const fail = (message) => {
  throw new RuleError(message);
};

/* ---------- random ---------- */

/** mulberry32 over the state's own counter: the same seed deals the same game. */
export function rand(state) {
  state.rng = (state.rng + 0x6d2b79f5) | 0;
  let t = state.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function flip(state) {
  return rand(state) < 0.5;
}

export function shuffle(state, list) {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand(state) * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/* ---------- reading the state ---------- */

export const other = (player) => 1 - player;

export function defOf(state, uid, defs) {
  return defs(state.cards[uid]);
}

export function slotAt(state, player, spot) {
  const side = state.players[player];
  return spot === ACTIVE ? side.active : side.bench[spot] || null;
}

/** Every Pokémon a player has in play, as [slot, spot], the Active one first. */
export function inPlay(state, player) {
  const side = state.players[player];
  const out = [];
  if (side.active) out.push([side.active, ACTIVE]);
  side.bench.forEach((slot, i) => out.push([slot, i]));
  return out;
}

/** What the Pokémon Tool on this Pokémon changes ({} when it has none). See compileTool. */
export function toolOf(state, slot, defs) {
  return (slot?.tool && defOf(state, slot.tool, defs)?.tool) || {};
}

/** A Pokémon's HP as it stands in play: what it prints, plus what its Tool adds. */
export function maxHp(state, slot, defs) {
  return defOf(state, slot.uid, defs).hp + (toolOf(state, slot, defs).hp || 0);
}

/** What it costs this Pokémon to retreat, after its Tool. */
export function retreatCost(state, slot, defs) {
  const less = toolOf(state, slot, defs).retreat;
  return less === "all" ? 0 : Math.max(0, defOf(state, slot.uid, defs).retreat - (less || 0));
}

export function hpLeft(state, slot, defs) {
  return Math.max(0, maxHp(state, slot, defs) - slot.damage);
}

/** The Energy types a slot's attached cards give, one entry per unit of Energy. */
export function energyOf(state, slot, defs) {
  return slot.energy.flatMap((uid) => defOf(state, uid, defs).provides || []);
}

/**
 * Can these Energy pay this cost? Each unit is a list of the types it may count
 * as (a basic Energy is one type; "Colorless" in a cost takes anything).
 * Returns how many cost symbols stay unpaid, so the bot can read "one short".
 */
export function unpaid(cost, units) {
  const typed = cost.filter((c) => c !== "Colorless");
  const pool = units.slice();
  let short = 0;
  for (const want of typed) {
    const at = pool.findIndex((unit) => unit === want || unit === "Any");
    if (at < 0) short += 1;
    else pool.splice(at, 1);
  }
  return short + Math.max(0, cost.length - typed.length - pool.length);
}

export function canPay(state, slot, cost, defs) {
  return unpaid(cost, energyOf(state, slot, defs)) === 0;
}

/* ---------- Special Conditions ---------- */

export const CONDITIONS = ["asleep", "burned", "confused", "paralyzed", "poisoned"];
const NO_STATUS = { main: "", poisoned: false, burned: false, since: 0 };

/** A slot's conditions, never undefined (a match saved before they existed has none). */
export const statusOf = (slot) => slot?.status || NO_STATUS;

/** The conditions on a slot as a list of names, for the screen. */
export function conditionsOn(slot) {
  const st = statusOf(slot);
  return [st.main, st.poisoned ? "poisoned" : "", st.burned ? "burned" : ""].filter(Boolean);
}

/** Asleep, Confused and Paralyzed replace each other; Burned and Poisoned sit beside them. */
export function addCondition(state, slot, kind) {
  if (!slot || !CONDITIONS.includes(kind)) return false;
  const st = (slot.status ||= { ...NO_STATUS });
  if (kind === "poisoned" || kind === "burned") {
    if (st[kind]) return false;
    st[kind] = true;
  } else {
    st.main = kind;
    st.since = state.turn;
  }
  return true;
}

/** Leaving the Active spot or evolving clears every condition, and every effect an attack left. */
function clearConditions(slot) {
  if (!slot) return;
  delete slot.status;
  delete slot.marks;
}

/* ---------- effects that last a turn ----------
   "During your next turn, this Pokémon can't attack", "takes 30 less damage during your
   opponent's next turn": a mark on the slot, { kind, turn, n?, name? }, in force for the
   one turn it names.
     noAttack  can't attack            noUse     can't use the attack `name`
     less      takes n less damage     shield    takes no damage or effects from attacks
     guard     takes no damage from attacks (their other effects still happen)
     noRetreat can't retreat           mustFlip  flips to attack; tails, nothing happens */

/** A slot's mark of this kind that is in force this turn. */
export const markOn = (state, slot, kind) => (slot?.marks || []).find((m) => m.kind === kind && m.turn === state.turn) || null;

/** Marks in force now or waiting for their turn, for the screen. */
export const marksOn = (state, slot) => (slot?.marks || []).filter((m) => m.turn >= state.turn);

export function addMark(state, slot, mark) {
  slot.marks = (slot.marks || []).filter((m) => m.turn >= state.turn && !(m.kind === mark.kind && m.turn === mark.turn && m.name === mark.name));
  slot.marks.push(mark);
}

const stuck = (slot) => ["asleep", "paralyzed"].includes(statusOf(slot).main);

/** Between turns: Poison, Burn, Sleep and Paralysis take their turn on both Active Pokémon. */
function checkup(state, defs, events) {
  const ended = state.current;
  for (const p of [ended, other(ended)]) {
    const slot = state.players[p].active;
    const st = slot?.status;
    if (!st) continue;
    if (st.poisoned) {
      slot.damage += 10;
      events.push({ t: "damage", p, spot: ACTIVE, n: 10, why: "poisoned" });
    }
    if (st.burned) {
      slot.damage += 20;
      events.push({ t: "damage", p, spot: ACTIVE, n: 20, why: "burned" });
      if (flip(state)) {
        st.burned = false;
        events.push({ t: "cure", p, kind: "burned" });
      }
    }
    if (st.main === "asleep" && flip(state)) {
      st.main = "";
      events.push({ t: "cure", p, kind: "asleep" });
    }
    // Paralysis lasts through its owner's next turn, then goes.
    if (st.main === "paralyzed" && p === ended && st.since < state.turn) {
      st.main = "";
      events.push({ t: "cure", p, kind: "paralyzed" });
    }
  }
}

/** Each player's first turn: no evolving. Turn 1 only: the player who went first doesn't attack. */
const firstTurnOf = (state) => state.turn <= 2;

function canEvolveOnto(state, slot, def, defs) {
  if (!slot || def.kind !== "pokemon" || !def.evolvesFrom) return false;
  if (firstTurnOf(state) || slot.since >= state.turn) return false;
  return defOf(state, slot.uid, defs).name === def.evolvesFrom;
}

/** The attacks the Active Pokémon can pay for right now, by index. */
export function usableAttacks(state, player, defs) {
  const slot = state.players[player].active;
  if (!slot || state.phase !== "main" || state.current !== player || state.pending.length) return [];
  if (state.turn === 1 || stuck(slot) || markOn(state, slot, "noAttack")) return [];
  const def = defOf(state, slot.uid, defs);
  const barred = (slot.marks || []).filter((m) => m.kind === "noUse" && m.turn === state.turn).map((m) => m.name);
  return def.attacks.map((attack, index) => (canPay(state, slot, attack.cost, defs) && !barred.includes(attack.name) ? index : -1)).filter((i) => i >= 0);
}

export function canRetreat(state, player, defs) {
  const side = state.players[player];
  if (!side.active || side.retreated || !side.bench.length || stuck(side.active) || markOn(state, side.active, "noRetreat")) return false;
  return energyOf(state, side.active, defs).length >= retreatCost(state, side.active, defs);
}

/* ---------- setting up ---------- */

function draw(state, player, n, events) {
  const side = state.players[player];
  const drawn = side.deck.splice(0, n);
  side.hand.push(...drawn);
  if (drawn.length) events.push({ t: "draw", p: player, uids: drawn });
  return drawn.length;
}

const isBasic = (state, uid, defs) => {
  const def = defOf(state, uid, defs);
  return def.kind === "pokemon" && def.stage === "basic";
};

/**
 * A new match, dealt and waiting for both players to place their Pokémon.
 * `decks` are two lists of catalog ids (a card held four times appears four times).
 */
export function createGame({ decks, names = ["You", "Opponent"], format = "standard", seed = 1 }, defs) {
  const rules = FORMATS[format] || FORMATS.standard;
  const state = {
    v: 1,
    rules: { format: rules.id, deckSize: rules.deckSize, prizes: rules.prizes, bench: rules.bench },
    seed,
    rng: seed | 0,
    cards: {},
    players: [],
    phase: "setup",
    turn: 0,
    current: 0,
    first: 0,
    pending: [],
    ending: false,
    winner: null,
    reason: "",
    opening: [],
  };
  decks.forEach((deck, p) => {
    const uids = deck.map((id, i) => {
      const uid = `${p ? "b" : "a"}${i + 1}`;
      state.cards[uid] = id;
      return uid;
    });
    if (!uids.some((uid) => isBasic(state, uid, defs))) fail("A deck needs at least one Basic Pokémon.");
    state.players.push({
      name: names[p],
      deck: uids,
      hand: [],
      discard: [],
      prizes: [],
      active: null,
      bench: [],
      placed: false,
      mulligans: 0,
      energyUsed: false,
      retreated: false,
      supporterUsed: false,
    });
  });
  const events = state.opening;
  // The winner of the opening flip chooses who goes first ("order", during setup). Until they
  // choose, they are down to go first themselves.
  state.first = flip(state) ? 0 : 1;
  state.flipWinner = state.first;
  events.push({ t: "first", p: state.first });
  for (const p of [0, 1]) {
    const side = state.players[p];
    for (;;) {
      shuffle(state, side.deck);
      draw(state, p, HAND_SIZE, []);
      if (side.hand.some((uid) => isBasic(state, uid, defs))) break;
      // No Basic Pokémon: show the hand, shuffle it back, draw again.
      events.push({ t: "mulligan", p, hand: side.hand.slice() });
      side.mulligans += 1;
      side.deck.push(...side.hand.splice(0));
    }
  }
  return state;
}

/* ---------- the turn ---------- */

function win(state, winner, reason, events) {
  state.phase = "over";
  state.winner = winner;
  state.reason = reason;
  state.pending = [];
  state.ending = false;
  events.push({ t: "over", p: winner, reason });
}

function startTurn(state, events) {
  state.turn += 1;
  state.current = state.turn === 1 ? state.first : other(state.current);
  state.ending = false;
  state.checked = false;
  const side = state.players[state.current];
  side.energyUsed = false;
  side.retreated = false;
  side.supporterUsed = false;
  events.push({ t: "turn", p: state.current, n: state.turn });
  if (!side.deck.length) return win(state, other(state.current), "deck", events);
  draw(state, state.current, 1, events);
}

/** Move on once nothing is waiting: a turn that was ending gets its checkup, then hands over. */
function settle(state, defs, events) {
  if (state.phase !== "main" || state.pending.length || !state.ending) return;
  if (!state.checked) {
    state.checked = true;
    checkup(state, defs, events);
    resolveKnockOuts(state, defs, events);
    if (state.phase !== "main" || state.pending.length) return;
  }
  startTurn(state, events);
}

function discardSlot(state, player, slot) {
  state.players[player].discard.push(slot.uid, ...slot.under, ...slot.energy, ...(slot.tool ? [slot.tool] : []));
}

/**
 * Knock Out everything with no HP left, hand out prizes, and see if anyone has won.
 * Both sides are checked together so a double Knock Out is judged at once.
 */
export function resolveKnockOuts(state, defs, events) {
  const took = [0, 0];
  for (const p of [0, 1]) {
    const side = state.players[p];
    for (const [slot, spot] of inPlay(state, p)) {
      const def = defOf(state, slot.uid, defs);
      if (slot.damage < maxHp(state, slot, defs)) continue;
      events.push({ t: "ko", p, spot, uid: slot.uid });
      discardSlot(state, p, slot);
      if (spot === ACTIVE) side.active = null;
      else side.bench[spot] = null;
      took[other(p)] += def.prizes || 1;
    }
    side.bench = side.bench.filter(Boolean);
  }
  for (const p of [0, 1]) {
    if (!took[p]) continue;
    const side = state.players[p];
    const prizes = side.prizes.splice(0, took[p]);
    side.hand.push(...prizes);
    events.push({ t: "prize", p, uids: prizes });
  }
  const won = [0, 1].map((p) => {
    const foe = state.players[other(p)];
    const ways = [];
    if (took[p] && !state.players[p].prizes.length) ways.push("prizes");
    if (!foe.active && !foe.bench.length) ways.push("bench");
    return ways;
  });
  // Both at once: whoever met more of the ways to win takes it; level, it is a tie
  // (the rulebook plays Sudden Death there, which isn't in yet).
  if (won[0].length && won[1].length && won[0].length === won[1].length) return win(state, null, "tie", events);
  if (won[0].length && won[0].length >= won[1].length) return win(state, 0, won[0][0], events);
  if (won[1].length) return win(state, 1, won[1][0], events);
  // The player whose turn it is not chooses first, as the rules have it.
  for (const p of [other(state.current), state.current]) {
    if (!state.players[p].active) state.pending.push({ type: "promote", player: p });
  }
}

/** Weakness then Resistance, on damage done to the other Active Pokémon. */
export function damageAfterTyping(base, attackerDef, defenderDef, { noWeakness = false, noResistance = false } = {}) {
  let amount = base;
  let weak = false;
  let resist = false;
  if (amount <= 0) return { amount: 0, weak, resist };
  const hits = (side) => side && attackerDef.types.includes(side.type);
  if (!noWeakness && hits(defenderDef.weakness)) {
    weak = true;
    amount = defenderDef.weakness.op === "x" ? amount * defenderDef.weakness.n : amount + defenderDef.weakness.n;
  }
  if (!noResistance && hits(defenderDef.resistance)) {
    resist = true;
    amount -= defenderDef.resistance.n;
  }
  return { amount: Math.max(0, amount), weak, resist };
}

/* ---------- actions ---------- */

function takeFromHand(state, player, uid) {
  const hand = state.players[player].hand;
  const at = hand.indexOf(uid);
  if (at < 0) fail("That card isn't in your hand.");
  hand.splice(at, 1);
}

const newSlot = (state, uid) => ({ uid, under: [], energy: [], damage: 0, since: state.turn });

const HANDLERS = {
  place(state, action, defs, events) {
    const { player } = action;
    const side = state.players[player];
    if (state.phase !== "setup" || side.placed) fail("You've already placed your Pokémon.");
    const bench = action.bench || [];
    const all = [action.active, ...bench];
    if (new Set(all).size !== all.length) fail("The same card was chosen twice.");
    if (bench.length > state.rules.bench) fail("The Bench is full.");
    for (const uid of all) {
      if (!side.hand.includes(uid)) fail("That card isn't in your hand.");
      if (!isBasic(state, uid, defs)) fail("Only Basic Pokémon can start in play.");
    }
    for (const uid of all) takeFromHand(state, player, uid);
    side.active = newSlot(state, action.active);
    side.bench = bench.map((uid) => newSlot(state, uid));
    side.placed = true;
    events.push({ t: "place", p: player });
    if (!state.players.every((s) => s.placed)) return;
    for (const p of [0, 1]) state.players[p].prizes = state.players[p].deck.splice(0, state.rules.prizes);
    // A mulligan lets the other player draw a card for each one; mulligans both players took cancel out.
    for (const p of [0, 1]) {
      const extra = state.players[other(p)].mulligans - state.players[p].mulligans;
      if (extra > 0) draw(state, p, extra, events);
    }
    state.phase = "main";
    events.push({ t: "reveal" });
    startTurn(state, events);
  },

  bench(state, { player, uid }, defs, events) {
    const side = state.players[player];
    if (!side.hand.includes(uid)) fail("That card isn't in your hand.");
    if (!isBasic(state, uid, defs)) fail("Only a Basic Pokémon can go straight to the Bench.");
    if (side.bench.length >= state.rules.bench) fail("Your Bench is full.");
    takeFromHand(state, player, uid);
    side.bench.push(newSlot(state, uid));
    events.push({ t: "bench", p: player, uid, spot: side.bench.length - 1 });
  },

  evolve(state, { player, uid, spot }, defs, events) {
    const side = state.players[player];
    if (!side.hand.includes(uid)) fail("That card isn't in your hand.");
    const slot = slotAt(state, player, spot);
    if (!slot) fail("There's no Pokémon there.");
    const def = defOf(state, uid, defs);
    if (!canEvolveOnto(state, slot, def, defs)) {
      if (def.evolvesFrom && defOf(state, slot.uid, defs).name === def.evolvesFrom) fail("A Pokémon can't evolve the turn it comes into play, or on your first turn.");
      fail(`${def.name} doesn't evolve from that Pokémon.`);
    }
    takeFromHand(state, player, uid);
    slot.under.unshift(slot.uid);
    slot.uid = uid;
    slot.since = state.turn;
    clearConditions(slot);
    events.push({ t: "evolve", p: player, uid, spot });
  },

  /** Play a Trainer from the hand: it goes to the discard pile and does what it says. */
  play(state, { player, uid }, defs, events) {
    const side = state.players[player];
    if (!side.hand.includes(uid)) fail("That card isn't in your hand.");
    const def = defOf(state, uid, defs);
    const why = trainerBlock(state, player, def, defs);
    if (why) fail(why);
    takeFromHand(state, player, uid);
    side.discard.push(uid);
    if (def.sub === "supporter") side.supporterUsed = true;
    events.push({ t: "play", p: player, uid, sub: def.sub });
    runTrainer(def.fx, { state, defs, events, player });
    if (!state.pending.length) resolveKnockOuts(state, defs, events);
  },

  attach(state, { player, uid, spot }, defs, events) {
    const side = state.players[player];
    if (!side.hand.includes(uid)) fail("That card isn't in your hand.");
    if (defOf(state, uid, defs).kind !== "energy") fail("That isn't an Energy card.");
    if (side.energyUsed) fail("You've already attached an Energy this turn.");
    const slot = slotAt(state, player, spot);
    if (!slot) fail("There's no Pokémon there.");
    takeFromHand(state, player, uid);
    slot.energy.push(uid);
    side.energyUsed = true;
    events.push({ t: "attach", p: player, uid, spot });
  },

  /** Attach a Pokémon Tool from the hand: one to a Pokémon, and it stays until that Pokémon leaves play. */
  tool(state, { player, uid, spot }, defs, events) {
    const side = state.players[player];
    if (!side.hand.includes(uid)) fail("That card isn't in your hand.");
    const def = defOf(state, uid, defs);
    if (def.kind !== "trainer" || def.sub !== "tool" || !def.playable) fail(def.why || "That isn't a Pokémon Tool.");
    const slot = slotAt(state, player, spot);
    if (!slot) fail("There's no Pokémon there.");
    if (slot.tool) fail("That Pokémon already has a Tool.");
    takeFromHand(state, player, uid);
    slot.tool = uid;
    events.push({ t: "tool", p: player, uid, spot });
  },

  retreat(state, { player, to, discard }, defs, events) {
    const side = state.players[player];
    if (side.retreated) fail("You've already retreated this turn.");
    const next = side.bench[to];
    if (!next) fail("Choose a Benched Pokémon to bring up.");
    const slot = side.active;
    if (stuck(slot)) fail(statusOf(slot).main === "asleep" ? "An Asleep Pokémon can't retreat." : "A Paralyzed Pokémon can't retreat.");
    if (markOn(state, slot, "noRetreat")) fail("That Pokémon can't retreat this turn.");
    const cost = retreatCost(state, slot, defs);
    if (energyOf(state, slot, defs).length < cost) fail("Not enough Energy to retreat.");
    // Pay with the chosen cards, or the first ones attached when none are named.
    let paid = 0;
    const picks = (discard?.length ? discard : slot.energy).slice();
    const gone = [];
    for (const uid of picks) {
      if (paid >= cost) break;
      const at = slot.energy.indexOf(uid);
      if (at < 0) fail("That Energy isn't attached to your Active Pokémon.");
      slot.energy.splice(at, 1);
      gone.push(uid);
      paid += (defOf(state, uid, defs).provides || []).length || 1;
    }
    if (paid < cost) fail("That doesn't cover the retreat cost.");
    side.discard.push(...gone);
    clearConditions(slot);
    side.bench[to] = slot;
    side.active = next;
    side.retreated = true;
    events.push({ t: "retreat", p: player, to, discarded: gone });
  },

  attack(state, { player, index }, defs, events) {
    if (state.turn === 1) fail("The player who goes first can't attack on the first turn.");
    const side = state.players[player];
    const slot = side.active;
    const def = defOf(state, slot.uid, defs);
    const attack = def.attacks[index];
    if (!attack) fail("That Pokémon has no such attack.");
    if (!canPay(state, slot, attack.cost, defs)) fail("Not enough Energy for that attack.");
    if (stuck(slot)) fail(`${def.name} is ${statusOf(slot).main === "asleep" ? "Asleep" : "Paralyzed"} and can't attack.`);
    if (markOn(state, slot, "noAttack")) fail(`${def.name} can't attack this turn.`);
    if ((slot.marks || []).some((m) => m.kind === "noUse" && m.turn === state.turn && m.name === attack.name)) fail(`${def.name} can't use ${attack.name} this turn.`);
    const foe = other(player);
    const target = state.players[foe].active;
    events.push({ t: "attack", p: player, index, name: attack.name, uid: slot.uid });
    const hit = { damage: attack.damage, cancelled: false };
    if (statusOf(slot).main === "confused") {
      // Confused: tails and the attack fails, with 30 damage to itself.
      const heads = flip(state);
      events.push({ t: "flip", p: player, results: [heads], why: "confused" });
      if (!heads) {
        slot.damage += 30;
        events.push({ t: "damage", p: player, spot: ACTIVE, n: 30, self: true, why: "confused" });
        state.ending = true;
        resolveKnockOuts(state, defs, events);
        return;
      }
    }
    if (markOn(state, slot, "mustFlip")) {
      const heads = flip(state);
      events.push({ t: "flip", p: player, results: [heads], why: "mustFlip" });
      if (!heads) {
        events.push({ t: "miss", p: player });
        state.ending = true;
        resolveKnockOuts(state, defs, events);
        return;
      }
    }
    const ctx = { state, defs, events, player, slot, target, hit, shielded: false };
    runAttackEffects("before", attack, ctx);
    // What an earlier attack left on the target: less damage, or none at all.
    ctx.shielded = Boolean(target && !hit.noEffects && markOn(state, target, "shield"));
    if (!hit.cancelled && target) {
      // Tools: the attacker's adds damage before Weakness, the target's can lift its Weakness or soak some.
      const mine = toolOf(state, slot, defs);
      const theirs = toolOf(state, target, defs);
      const base = hit.damage > 0 ? hit.damage + (mine.plus || 0) : hit.damage;
      const dealt = damageAfterTyping(base, def, defOf(state, target.uid, defs), { ...hit, noWeakness: hit.noWeakness || Boolean(theirs.noWeakness) });
      const less = (hit.noEffects ? 0 : markOn(state, target, "less")?.n || 0) + (theirs.less || 0);
      const guarded = ctx.shielded || (!hit.noEffects && markOn(state, target, "guard"));
      const amount = guarded ? 0 : Math.max(0, dealt.amount - less);
      if (amount > 0) {
        target.damage += amount;
        events.push({ t: "damage", p: foe, spot: ACTIVE, n: amount, weak: dealt.weak, resist: dealt.resist });
      } else if (dealt.amount > 0) {
        events.push({ t: "blocked", p: foe });
      }
    }
    if (!hit.cancelled) runAttackEffects("after", attack, ctx);
    state.ending = true;
    // An effect that needs a choice (which Benched Pokémon?) waits for it; Knock Outs are judged after.
    if (!state.pending.length) resolveKnockOuts(state, defs, events);
  },

  /**
   * Answer a choice an attack left open: one Pokémon per action, `spot: null` to pass
   * on one that is optional. pending: { type: "pick", player, side, spots, left, effect, optional }.
   */
  pick(state, { player, spot = null }, defs, events) {
    const waiting = state.pending[0];
    if (spot == null) {
      if (!waiting.optional) fail("Choose a Pokémon.");
    } else {
      if (!waiting.spots.includes(spot)) fail("That Pokémon can't be chosen.");
      applyPick(state, waiting, spot, defs, events);
      waiting.spots = waiting.spots.filter((x) => x !== spot);
      waiting.left -= 1;
    }
    if (spot == null || waiting.left <= 0 || !waiting.spots.length) {
      state.pending.shift();
      resume(state, waiting, defs, events);
    }
    if (!state.pending.length) resolveKnockOuts(state, defs, events);
  },

  choose(state, { player, uids = [] }, defs, events) {
    const waiting = state.pending[0];
    const side = state.players[player];
    const picked = [...new Set(uids)];
    if (picked.some((uid) => !waiting.uids.includes(uid))) fail("That card can't be chosen.");
    if (picked.length < waiting.min) fail(waiting.min === 1 ? "Choose a card." : `Choose ${waiting.min} cards.`);
    if (picked.length > waiting.max) fail(waiting.max === 1 ? "Choose only one card." : `Choose at most ${waiting.max} cards.`);
    const pile = side[waiting.zone];
    for (const uid of picked) pile.splice(pile.indexOf(uid), 1);
    const { op } = waiting.effect;
    if (op === "discard") {
      side.discard.push(...picked);
      if (picked.length) events.push({ t: "discard-hand", p: player, uids: picked });
    } else if (op === "toBench") {
      for (const uid of picked) side.bench.push(newSlot(state, uid));
      events.push({ t: "search", p: player, uids: picked, from: waiting.zone, to: "bench" });
    } else {
      side.hand.push(...picked);
      events.push({ t: "search", p: player, uids: picked, from: waiting.zone, to: "hand" });
    }
    if (waiting.shuffle) shuffle(state, side.deck);
    state.pending.shift();
    resume(state, waiting, defs, events);
    if (!state.pending.length) resolveKnockOuts(state, defs, events);
  },

  end(state) {
    state.ending = true;
  },

  promote(state, { player, spot }, defs, events) {
    const side = state.players[player];
    const next = side.bench[spot];
    if (!next) fail("Choose a Benched Pokémon to bring up.");
    side.bench.splice(spot, 1);
    side.active = next;
    state.pending = state.pending.filter((p) => !(p.type === "promote" && p.player === player));
    events.push({ t: "promote", p: player, spot });
  },
};

/** Why this Trainer can't be played right now, or "" when it can. */
export function trainerBlock(state, player, def, defs) {
  if (def?.kind !== "trainer" || !def.playable) return def?.why || "That card can't be played.";
  const side = state.players[player];
  if (def.sub === "supporter") {
    if (side.supporterUsed) return "You've already played a Supporter this turn.";
    if (state.turn === 1) return "No Supporter on the first turn of the match.";
  }
  if (!trainerReady(def.fx, { state, defs, events: [], player })) return `${def.name} would do nothing right now.`;
  return "";
}

/** Carry out a choice on the Pokémon picked: damage to it, or it trades places with the Active. */
function applyPick(state, waiting, spot, defs, events) {
  const p = waiting.side;
  const side = state.players[p];
  const { effect } = waiting;
  if (effect.op === "damage") {
    const slot = slotAt(state, p, spot);
    let n = effect.n;
    let weak = false;
    let resist = false;
    // Weakness and Resistance count for the Active Pokémon only.
    if (spot === ACTIVE && effect.from) {
      const dealt = damageAfterTyping(n, defOf(state, effect.from, defs), defOf(state, slot.uid, defs));
      ({ amount: n, weak, resist } = dealt);
    }
    if (n <= 0) return;
    slot.damage += n;
    events.push({ t: "damage", p, spot, n, weak, resist });
  } else if (effect.op === "switch") {
    switchActive(state, p, spot, events);
  } else if (effect.op === "heal") {
    const slot = slotAt(state, p, spot);
    const healed = Math.min(effect.n, slot.damage);
    slot.damage -= healed;
    if (healed) events.push({ t: "heal", p, spot, n: healed });
  } else if (effect.op === "discardEnergy") {
    const slot = slotAt(state, p, spot);
    const gone = slot.energy.splice(Math.max(0, slot.energy.length - effect.n), effect.n);
    side.discard.push(...gone);
    if (gone.length) events.push({ t: "discard-energy", p, spot, uids: gone });
  }
}

/** The Active Pokémon and a Benched one trade places (an effect, not a retreat: nothing is paid). */
export function switchActive(state, p, spot, events) {
  const side = state.players[p];
  const next = side.bench[spot];
  if (!next || !side.active) return;
  clearConditions(side.active);
  side.bench[spot] = side.active;
  side.active = next;
  events.push({ t: "switch", p, spot });
}

/** Leave a choice for a player; the turn waits on it. */
export function askPick(state, pick) {
  state.pending.push({ type: "pick", optional: false, ...pick });
}

/**
 * Leave a choice of cards: from the deck (a search), the discard pile or the hand.
 * { player, zone, what, uids: the cards that may be chosen, min, max, effect: { op }, shuffle }
 * effect.op: "toHand", "toBench" (Basic Pokémon, from the deck), "discard" (from the hand).
 */
export function askChoose(state, choice) {
  state.pending.push({ type: "choose", ...choice, min: Math.min(choice.min, choice.uids.length), max: Math.min(choice.max, choice.uids.length) });
}

/** A choice was made: carry on with whatever the card said to do after it. */
function resume(state, waiting, defs, events) {
  if (waiting.then?.length) runTrainer(waiting.then, { state, defs, events, player: waiting.player });
}

/** Apply one action. Changes `state`, returns what happened, throws RuleError when it isn't allowed. */
export function apply(state, action, defs) {
  const events = [];
  const { player, type } = action;
  if (state.phase === "over") fail("The match is over.");
  if (player !== 0 && player !== 1) fail("Unknown player.");
  if (type === "concede") {
    win(state, other(player), "concede", events);
    return events;
  }
  const handler = HANDLERS[type];
  if (!handler && type !== "order") fail("Unknown action.");
  if (type === "place") {
    handler(state, action, defs, events);
    return events;
  }
  if (type === "order") {
    // The winner of the opening flip says who goes first, before the first turn starts.
    if (state.phase !== "setup") fail("The match has already started.");
    if (player !== (state.flipWinner ?? state.first)) fail("The winner of the coin flip chooses.");
    state.first = action.first ? player : other(player);
    events.push({ t: "order", p: player, first: state.first });
    return events;
  }
  if (state.phase !== "main") fail("Place your Pokémon first.");
  const waiting = state.pending[0];
  if (waiting) {
    if (waiting.type !== type || waiting.player !== player) fail(waiting.type === "pick" ? "Waiting for a Pokémon to be chosen." : waiting.type === "choose" ? "Waiting for cards to be chosen." : "Waiting for a new Active Pokémon.");
  } else {
    if (type === "promote" || type === "pick" || type === "choose") fail("Nothing to choose.");
    if (state.current !== player) fail("It isn't your turn.");
    if (state.ending) fail("Your turn is over.");
  }
  handler(state, action, defs, events);
  settle(state, defs, events);
  return events;
}

/** Every action `player` may take right now. The screen lights these up and the bot picks from them. */
export function legalActions(state, player, defs) {
  const side = state.players[player];
  if (state.phase === "over") return [];
  if (state.phase === "setup") {
    if (side.placed) return [];
    return side.hand.filter((uid) => isBasic(state, uid, defs)).map((uid) => ({ type: "place", player, active: uid, bench: [] }));
  }
  const waiting = state.pending[0];
  if (waiting) {
    if (waiting.player !== player) return [];
    // Which cards to take is the player's call; the one listed here is the plainest legal answer.
    if (waiting.type === "choose") return [{ type: "choose", player, uids: waiting.uids.slice(0, waiting.min) }];
    if (waiting.type === "pick") return [...waiting.spots.map((spot) => ({ type: "pick", player, spot })), ...(waiting.optional ? [{ type: "pick", player, spot: null }] : [])];
    return side.bench.map((_, spot) => ({ type: "promote", player, spot }));
  }
  if (state.current !== player || state.ending) return [];
  const out = [];
  const spots = inPlay(state, player);
  const seen = new Set();
  for (const uid of side.hand) {
    const def = defOf(state, uid, defs);
    // Two copies of the same card make the same move: list it once.
    if (seen.has(def.id)) continue;
    seen.add(def.id);
    if (def.kind === "pokemon" && def.stage === "basic" && side.bench.length < state.rules.bench) out.push({ type: "bench", player, uid });
    if (def.kind === "pokemon" && def.evolvesFrom) {
      for (const [slot, spot] of spots) if (canEvolveOnto(state, slot, def, defs)) out.push({ type: "evolve", player, uid, spot });
    }
    if (def.kind === "energy" && !side.energyUsed) {
      for (const [, spot] of spots) out.push({ type: "attach", player, uid, spot });
    }
    if (def.kind === "trainer" && def.sub === "tool") {
      if (def.playable) for (const [slot, spot] of spots) if (!slot.tool) out.push({ type: "tool", player, uid, spot });
      continue;
    }
    if (def.kind === "trainer" && !trainerBlock(state, player, def, defs)) out.push({ type: "play", player, uid });
  }
  if (canRetreat(state, player, defs)) side.bench.forEach((_, to) => out.push({ type: "retreat", player, to }));
  for (const index of usableAttacks(state, player, defs)) out.push({ type: "attack", player, index });
  out.push({ type: "end", player });
  return out;
}

/**
 * The state as one player may see it: the other hand, both decks and all prizes
 * become counts. What the Worker sends each player in a match between two people.
 */
export function viewFor(state, player) {
  const view = JSON.parse(JSON.stringify(state));
  const shown = new Set();
  view.players.forEach((side, p) => {
    if (p === player) side.hand.forEach((uid) => shown.add(uid));
    side.discard.forEach((uid) => shown.add(uid));
    for (const slot of [side.active, ...side.bench]) {
      if (!slot || (state.phase === "setup" && p !== player)) continue;
      [slot.uid, ...slot.under, ...slot.energy].forEach((uid) => shown.add(uid));
    }
    if (p !== player) {
      side.hand = side.hand.length;
      if (state.phase === "setup") {
        side.active = side.active ? {} : null;
        side.bench = side.bench.map(() => ({}));
      }
    }
    side.deck = side.deck.length;
    side.prizes = side.prizes.length;
  });
  view.cards = Object.fromEntries(Object.entries(view.cards).filter(([uid]) => shown.has(uid)));
  delete view.seed;
  delete view.rng;
  view.opening = view.opening.map((e) => (e.t === "mulligan" ? e : { ...e }));
  return view;
}
