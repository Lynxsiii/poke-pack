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
 *   slot      { uid, under: [uid], energy: [uid], damage, since }   uid is the top card, `since` the turn it arrived
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
 * Attack text runs through js/tcg/effects.js; text it can't read yet does the
 * printed damage only. Not in yet: Trainers, Abilities, Special Conditions.
 */

import { runAttackEffects } from "./effects.js";

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

function shuffle(state, list) {
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

export function hpLeft(state, slot, defs) {
  return Math.max(0, defOf(state, slot.uid, defs).hp - slot.damage);
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
  if (state.turn === 1) return [];
  const def = defOf(state, slot.uid, defs);
  return def.attacks.map((attack, index) => (canPay(state, slot, attack.cost, defs) ? index : -1)).filter((i) => i >= 0);
}

export function canRetreat(state, player, defs) {
  const side = state.players[player];
  if (!side.active || side.retreated || !side.bench.length) return false;
  const def = defOf(state, side.active.uid, defs);
  return energyOf(state, side.active, defs).length >= def.retreat;
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
    });
  });
  const events = state.opening;
  state.first = flip(state) ? 0 : 1;
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
  const side = state.players[state.current];
  side.energyUsed = false;
  side.retreated = false;
  events.push({ t: "turn", p: state.current, n: state.turn });
  if (!side.deck.length) return win(state, other(state.current), "deck", events);
  draw(state, state.current, 1, events);
}

/** Move on once nothing is waiting: a turn that was ending hands over. */
function settle(state, events) {
  if (state.phase !== "main" || state.pending.length) return;
  if (state.ending) startTurn(state, events);
}

function discardSlot(state, player, slot) {
  state.players[player].discard.push(slot.uid, ...slot.under, ...slot.energy);
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
      if (slot.damage < def.hp) continue;
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
    if (took[p] && !state.players[p].prizes.length) return "prizes";
    if (!foe.active && !foe.bench.length) return "bench";
    return "";
  });
  if (won[0] && won[1]) return win(state, null, "tie", events);
  if (won[0]) return win(state, 0, won[0], events);
  if (won[1]) return win(state, 1, won[1], events);
  // The player whose turn it is not chooses first, as the rules have it.
  for (const p of [other(state.current), state.current]) {
    if (!state.players[p].active) state.pending.push({ type: "promote", player: p });
  }
}

/** Weakness then Resistance, on damage done to the other Active Pokémon. */
export function damageAfterTyping(base, attackerDef, defenderDef) {
  let amount = base;
  let weak = false;
  let resist = false;
  if (amount <= 0) return { amount: 0, weak, resist };
  const hits = (side) => side && attackerDef.types.includes(side.type);
  if (hits(defenderDef.weakness)) {
    weak = true;
    amount = defenderDef.weakness.op === "x" ? amount * defenderDef.weakness.n : amount + defenderDef.weakness.n;
  }
  if (hits(defenderDef.resistance)) {
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
    // A mulligan lets the other player draw a card for each one.
    for (const p of [0, 1]) {
      const extra = state.players[other(p)].mulligans;
      if (extra) draw(state, p, extra, events);
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
    events.push({ t: "evolve", p: player, uid, spot });
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

  retreat(state, { player, to, discard }, defs, events) {
    const side = state.players[player];
    if (side.retreated) fail("You've already retreated this turn.");
    const next = side.bench[to];
    if (!next) fail("Choose a Benched Pokémon to bring up.");
    const slot = side.active;
    const cost = defOf(state, slot.uid, defs).retreat;
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
    const foe = other(player);
    const target = state.players[foe].active;
    events.push({ t: "attack", p: player, index, name: attack.name, uid: slot.uid });
    const hit = { damage: attack.damage, cancelled: false };
    runAttackEffects("before", attack, { state, defs, events, player, slot, target, hit });
    if (!hit.cancelled && target) {
      const dealt = damageAfterTyping(hit.damage, def, defOf(state, target.uid, defs));
      if (dealt.amount > 0) {
        target.damage += dealt.amount;
        events.push({ t: "damage", p: foe, spot: ACTIVE, n: dealt.amount, weak: dealt.weak, resist: dealt.resist });
      }
    }
    if (!hit.cancelled) runAttackEffects("after", attack, { state, defs, events, player, slot, target, hit });
    state.ending = true;
    resolveKnockOuts(state, defs, events);
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
  if (!handler) fail("Unknown action.");
  if (type === "place") {
    handler(state, action, defs, events);
    return events;
  }
  if (state.phase !== "main") fail("Place your Pokémon first.");
  const waiting = state.pending[0];
  if (waiting) {
    if (waiting.type !== type || waiting.player !== player) fail("Waiting for a new Active Pokémon.");
  } else {
    if (type === "promote") fail("Nothing to promote.");
    if (state.current !== player) fail("It isn't your turn.");
    if (state.ending) fail("Your turn is over.");
  }
  handler(state, action, defs, events);
  settle(state, events);
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
