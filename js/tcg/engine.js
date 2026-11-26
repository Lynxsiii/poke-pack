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
import { T_OPS, boostOf, energyIn, fieldFits, fits, moveTargets, prizesLeft, runTrainer, stripEnergy, trainerReady } from "./trainers.js";

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

/** Whose card a pending choice belongs to and where it came from, carried onto the next one. */
const carry = (waiting) => ({ ...(waiting.src ? { src: waiting.src } : {}), ...(waiting.by != null ? { by: waiting.by } : {}), ...(waiting.card ? { card: waiting.card } : {}) });

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

/** Which player has this Pokémon in play, or -1. */
export function ownerOf(state, slot) {
  return state.players.findIndex((side) => side.active === slot || side.bench.includes(slot));
}

/** The Ability printed on this Pokémon, with its own terms met (Energy, spot, Tool), before any lock. */
let gauging = false;
function ownAbility(state, slot, defs) {
  const ability = slot && defOf(state, slot.uid, defs)?.ability;
  if (!ability) return null;
  if (ability.kind === "Pokémon Power" && ["asleep", "confused", "paralyzed"].includes(statusOf(slot).main)) return null;
  const when = ability.when;
  if (when?.energy) {
    const units = energyOf(state, slot, defs);
    const want = when.energy;
    if (want === "none" ? units.length : !units.includes(want)) return null;
  }
  if (when?.status && statusOf(slot).main !== when.status) return null;
  if (when?.special && !slot.energy.some((uid) => defOf(state, uid, defs)?.kind === "energy" && !defOf(state, uid, defs).basic)) return null;
  if (when?.tool && !slot.tool) return null;
  if (ability.where) {
    const owner = ownerOf(state, slot);
    const front = owner >= 0 && state.players[owner].active === slot;
    if (ability.where === "active" ? !front : front) return null;
  }
  if (when?.hpMax != null) {
    // "If this Pokémon's remaining HP is 30 or less": its HP is counted without this Ability,
    // which only adds damage, so leaving it out while counting is exact (and can't loop).
    if (gauging) return null;
    gauging = true;
    let left;
    try {
      left = hpLeft(state, slot, defs);
    } finally {
      gauging = false;
    }
    if (left > when.hpMax) return null;
  }
  return ability;
}

/** Does a lock on the field take this Pokémon's Ability away? (Garbotoxin, Neutralizing Gas and the rest.) */
function lockedOut(state, slot, ability, defs) {
  const owner = ownerOf(state, slot);
  if (owner < 0) return false;
  const def = defOf(state, slot.uid, defs);
  for (const p of [0, 1]) {
    for (const [locker] of inPlay(state, p)) {
      if (!locker || locker === slot) continue;
      const lock = defOf(state, locker.uid, defs)?.ability?.lock;
      if (!lock || !ownAbility(state, locker, defs)) continue;
      if (lock.side === "foe" && p === owner) continue;
      // "Prevent all effects of your opponent's Pokémon's Abilities done to this Pokémon": a lock is one.
      if (p !== owner && ability.ward) continue;
      if (lock.except && ability.name === lock.except) continue;
      if (lock.kinds && !lock.kinds.includes(ability.kind)) continue;
      if (lock.selfKo && !ability.use?.selfKo) continue;
      if (lock.active && state.players[owner].active !== slot) continue;
      if (lock.bench && state.players[owner].active === slot) continue;
      if (lock.stage && def.stage !== lock.stage) continue;
      if (lock.boxes && !lock.boxes.includes(def.box)) continue;
      if (lock.exceptBoxes && lock.exceptBoxes.includes(def.box)) continue;
      if (lock.exceptRuleBox && def.box) continue;
      if (lock.damaged && !slot.damage) continue;
      return true;
    }
  }
  return false;
}

/**
 * The Ability this Pokémon has working right now, or null: nothing when its terms aren't met
 * (the Energy it asks for, the spot it must be in), an old Pokémon Power stops while its
 * Pokémon is Asleep, Confused or Paralyzed, and a lock on the field can take it away.
 */
export function abilityOn(state, slot, defs) {
  const ability = ownAbility(state, slot, defs);
  if (!ability || lockedOut(state, slot, ability, defs)) return null;
  return ability;
}

/**
 * Is this Pokémon kept safe from what the other player's card does? An Ability can keep off the
 * effects of their Abilities (`src: "ability"`) or of their Items and Supporters (`src: "trainer"`).
 */
export function warded(state, slot, { player, src }, defs) {
  if (!slot || !src || ownerOf(state, slot) === player) return false;
  const ability = abilityOn(state, slot, defs);
  return src === "ability" ? Boolean(ability?.ward) : src === "trainer" ? Boolean(ability?.trainerWard) : false;
}

/** Is it this player's first turn of the match? */
export const firstTurnFor = (state, player) => state.turn === (state.first === player ? 1 : 2);

/** Why this Pokémon's Ability can't be used by its owner right now, or "" when it can. */
export function abilityBlock(state, player, spot, defs) {
  const slot = slotAt(state, player, spot);
  const ability = abilityOn(state, slot, defs);
  const use = ability?.use;
  if (!use) return "There's nothing here to use.";
  const side = state.players[player];
  if (!use.often && slot.used?.uid === slot.uid && slot.used.turn === state.turn) return `${ability.name} has been used this turn.`;
  if (use.single && (side.abilitiesUsed || []).includes(ability.name)) return `Only one ${ability.name} a turn.`;
  if (use.where === "active" && spot !== ACTIVE) return "It works only in the Active Spot.";
  if (use.where === "bench" && spot === ACTIVE) return "It works only from the Bench.";
  if ((ability.kind === "Poké-Power" || use.calm) && conditionsOn(slot).length) return `${ability.name} can't be used with a Special Condition.`;
  if (use.vstar && side.vstarUsed) return "You've already used your VSTAR Power this game.";
  const need = use.need || {};
  if (need.first && !firstTurnFor(state, player)) return `${ability.name} works only during your first turn.`;
  if (need.lost && !(side.lostOn || []).includes(state.turn - 1)) return "None of your Pokémon were Knocked Out during your opponent's last turn.";
  if (need.stadium && !state.stadium) return "It needs a Stadium in play.";
  if (need.foePrizes != null && prizesLeft(state.players[other(player)]) > need.foePrizes) return `Your opponent needs ${need.foePrizes} or fewer Prize cards left.`;
  if (!trainerReady(use.steps, { state, defs, events: [], player, spot, src: "ability" })) return `${ability.name} would do nothing right now.`;
  return "";
}

/**
 * What changes this Pokémon's numbers while it is in play: its Pokémon Tool, the Stadium and
 * Abilities, added up ({} when none says anything). See compileTool, compileStadium, compileAbility.
 */
export function toolOf(state, slot, defs) {
  if (!slot) return {};
  const tool = (slot.tool && defOf(state, slot.tool, defs)?.tool) || null;
  const field = (state.stadium && defOf(state, state.stadium.uid, defs)?.stadium?.field) || [];
  const def = defOf(state, slot.uid, defs);
  const mods = [tool, ...field.filter((f) => fieldFits(f.who, def)).map((f) => f.mod)].filter(Boolean);
  // Special Energy attached: its standing changes, for the Pokémon they fit.
  for (const uid of slot.energy) {
    for (const m of defOf(state, uid, defs)?.special?.mods || []) if (fieldFits(m.who, def)) mods.push(m.mod);
  }
  // Abilities: its own standing one, and what its owner's other Pokémon give to those like it.
  const own = abilityOn(state, slot, defs);
  if (own?.mod) mods.push(own.mod);
  const owner = ownerOf(state, slot);
  if (owner >= 0) {
    const front = state.players[owner].active === slot;
    for (const [mate] of inPlay(state, owner)) {
      const aura = abilityOn(state, mate, defs)?.aura;
      if (!aura || !fieldFits(aura.who, def)) continue;
      if (aura.who.energy && !energyOf(state, slot, defs).includes(aura.who.energy)) continue;
      if (aura.who.active && !front) continue;
      mods.push(aura.mod);
    }
    // And what the other player's Pokémon do to this side ("your opponent's Active Pokémon's Retreat Cost is more").
    // Unless this one keeps off the effects of their Abilities.
    const shielded = Boolean(own?.ward);
    for (const [rival] of inPlay(state, other(owner))) {
      const aura = abilityOn(state, rival, defs)?.foeAura;
      if (!aura || shielded || !fieldFits(aura.who, def) || (aura.who.active && !front)) continue;
      mods.push(aura.mod);
    }
  }
  if (!mods.length) return {};
  const sum = (key) => mods.reduce((n, m) => n + (m[key] || 0), 0);
  return {
    hp: sum("hp"),
    plus: sum("plus"),
    less: sum("less"),
    retreat: mods.some((m) => m.retreat === "all") ? "all" : mods.reduce((n, m) => n + (Number(m.retreat) || 0), 0),
    noWeakness: mods.some((m) => m.noWeakness),
    noResistance: mods.some((m) => m.noResistance),
    immune: mods.flatMap((m) => m.immune || []),
  };
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
  const holder = defOf(state, slot.uid, defs);
  return slot.energy.flatMap((uid) => {
    const def = defOf(state, uid, defs);
    // A Special Energy meant for some Pokémon gives nothing on any other.
    if (!energyFits(def, holder)) return [];
    return unitsOn(state, slot, def, holder);
  });
}

/** What one Energy card gives on this Pokémon: a Special Energy may give more on some ("on a Basic Pokémon, every type"). */
function unitsOn(state, slot, def, holder) {
  const owner = ownerOf(state, slot);
  const behind = owner >= 0 && prizesLeft(state.players[owner]) > prizesLeft(state.players[other(owner)]);
  const alt = (def.special?.alt || []).find((a) => fieldFits(a.who, holder) && (!a.who.behind || behind));
  return alt ? alt.provides : def.provides || [];
}

/** Can this Energy card go on this Pokémon? A Special Energy may name the kind it is for. */
export function energyFits(def, holder) {
  const only = def?.special?.only;
  if (!only) return true;
  if (only.types && !only.types.some((t) => (holder.types || []).includes(t))) return false;
  if (only.evolved && holder.stage !== "evolution") return false;
  if (only.noEx && holder.box === "ex") return false;
  return true;
}
const onlyFor = (only) => [only.types?.join(" or "), only.evolved ? "Evolved" : ""].filter(Boolean).join(" ");

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
    // A unit is one type, "Any" (every type), or "Fire|Water" (one of those, one at a time).
    const at = pool.findIndex((unit) => unit === want || unit === "Any" || (unit.includes("|") && unit.split("|").includes(want)));
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
export function addCondition(state, slot, kind, defs = null) {
  if (!slot || !CONDITIONS.includes(kind)) return false;
  // An Ability can keep some or all of them off.
  const immune = defs ? toolOf(state, slot, defs).immune || [] : [];
  if (immune.includes("all") || immune.includes(kind)) return false;
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
  // What happens now isn't "damage from an attack" any more.
  for (const p of [0, 1]) for (const [slot] of inPlay(state, p)) delete slot.hit;
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
  // "At any time between turns, remove 1 damage counter from this Pokémon."
  for (const p of [ended, other(ended)]) {
    for (const [slot, spot] of inPlay(state, p)) {
      const mend = abilityOn(state, slot, defs)?.mend;
      if (!mend || !slot.damage || hpLeft(state, slot, defs) <= 0) continue;
      const healed = Math.min(mend, slot.damage);
      slot.damage -= healed;
      events.push({ t: "heal", p, spot, n: healed, why: "ability" });
    }
  }
}

/** Each player's first turn: no evolving. Turn 1 only: the player who went first doesn't attack. */
const firstTurnOf = (state) => state.turn <= 2;

/**
 * May `def` go on top of this Pokémon? `how`, from a Trainer that evolves (all optional):
 *   skip: "2" a Stage 2 straight onto the Basic Pokémon it comes from (Rare Candy), "any" that or a Stage 1 onto it
 *   lift: on the first turn, or on a Pokémon put into play this turn, too
 *   noEx: neither card is a Pokémon-EX; noAbility: the card has no Ability
 */
export function canEvolveOnto(state, slot, def, defs, how = {}) {
  if (!slot || def?.kind !== "pokemon" || !def.evolvesFrom || !mayEvolve(state, slot, defs, how)) return false;
  const below = defOf(state, slot.uid, defs);
  if (how.noEx && def.box === "EX") return false;
  if (how.noAbility && def.abilityKind) return false;
  if (how.skip) return below.stage === "basic" && ((def.line === 2 && (def.roots || []).includes(below.name)) || (how.skip === "any" && def.line === 1 && below.name === def.evolvesFrom));
  return below.name === def.evolvesFrom;
}

/** May this Pokémon evolve right now, whatever into: not on the first turn, nor the turn it came into play, unless lifted. */
export function mayEvolve(state, slot, defs, how = {}) {
  if (!slot) return false;
  if (how.noEx && defOf(state, slot.uid, defs).box === "EX") return false;
  // Some Pokémon may evolve on the first turn, or the turn they are played (an Ability says so).
  const early = abilityOn(state, slot, defs)?.early;
  const owner = ownerOf(state, slot);
  const lifted = how.lift || slot.lift === state.turn || early === "any" || (early === "active" && state.players[owner]?.active === slot) || (early === "second" && state.first !== owner && slot.since < state.turn);
  return lifted || !(firstTurnOf(state) || slot.since >= state.turn);
}

/** The spots of `player`'s Pokémon that `def` may evolve, the way `how` says (`where` "active": only the Active one). */
export function evolveSpots(state, player, def, defs, how = {}, where = "") {
  return inPlay(state, player).filter(([slot, spot]) => (where !== "active" || spot === ACTIVE) && canEvolveOnto(state, slot, def, defs, how)).map(([, spot]) => spot);
}

/** Put `uid` on top of the Pokémon at `spot` (from the hand, the deck, or a choice): it has evolved. */
export function evolveSlot(state, player, spot, uid, defs, events, from = "hand") {
  const slot = slotAt(state, player, spot);
  slot.under.unshift(slot.uid);
  slot.uid = uid;
  slot.since = state.turn;
  clearConditions(slot);
  events.push({ t: "evolve", p: player, uid, spot, ...(from !== "hand" ? { from } : {}) });
  offerAbility(state, player, spot, "evolve", defs);
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
  side.stadiumPlayed = false;
  side.stadiumUsed = false;
  side.abilitiesUsed = [];
  events.push({ t: "turn", p: state.current, n: state.turn });
  if (!side.deck.length) return win(state, other(state.current), "deck", events);
  draw(state, state.current, 1, events);
}

/** Move on once nothing is waiting: a turn that was ending gets its checkup, then hands over. */
function settle(state, defs, events) {
  if (state.phase !== "main" || state.pending.length || !state.ending) return;
  if (!state.checked) {
    state.checked = true;
    dropHeld(state, events);
    checkup(state, defs, events);
    resolveKnockOuts(state, defs, events, { between: true });
    if (state.phase !== "main" || state.pending.length) return;
  }
  startTurn(state, events);
}

function discardSlot(state, player, slot) {
  state.players[player].discard.push(slot.uid, ...slot.under, ...slot.energy, ...(slot.tool ? [slot.tool] : []), ...heldOn(slot));
}

/**
 * Old Trainers that are attached for a while (PlusPower, Defender): { uid, until, plus?, after?, less? } on
 * `slot.held`, discarded at the end of turn `until`. `plus` counts before Weakness and Resistance, `after` after.
 */
export const heldOn = (slot) => (slot?.held || []).map((h) => h.uid);
const heldSum = (slot, key) => (slot?.held || []).reduce((n, h) => n + (h[key] || 0), 0);

/** The end of a turn: attached Trainers whose time is up go to their owner's discard pile. */
function dropHeld(state, events) {
  for (const p of [0, 1]) {
    for (const [slot, spot] of inPlay(state, p)) {
      const gone = (slot.held || []).filter((h) => h.until <= state.turn);
      if (!gone.length) continue;
      slot.held = slot.held.filter((h) => h.until > state.turn);
      state.players[p].discard.push(...gone.map((h) => h.uid));
      for (const h of gone) events.push({ t: "discard-held", p, spot, uid: h.uid });
    }
  }
}

/**
 * Knock Out everything with no HP left, hand out prizes, and see if anyone has won.
 * Both sides are checked together so a double Knock Out is judged at once.
 */
export function resolveKnockOuts(state, defs, events, { between = false } = {}) {
  const took = [0, 0];
  // "If this Pokémon is Knocked Out by damage from an attack from your opponent's Pokémon": it took
  // that attack's damage this turn (`slot.hit`, cleared before the checkup), and it is going now.
  const falling = (slot) => slot.damage >= maxHp(state, slot, defs);
  const byAttack = (slot, p) => slot.hit === state.turn && state.current === other(p) && !between;
  const koPower = (slot, spot, p) => {
    const ability = abilityOn(state, slot, defs);
    const ko = ability?.ko;
    return ko && byAttack(slot, p) && (!ko.active || spot === ACTIVE) ? ability : null;
  };
  // Damage counters on the Attacking Pokémon land first, so a Knock Out they cause is judged with this one.
  for (const p of [0, 1]) {
    for (const [slot, spot] of inPlay(state, p)) {
      const ability = falling(slot) ? koPower(slot, spot, p) : null;
      const attacker = state.players[other(p)].active;
      if (!ability?.ko.counters || !attacker || warded(state, attacker, { player: p, src: "ability" }, defs)) continue;
      events.push({ t: "ability", p, spot, uid: slot.uid, name: ability.name });
      attacker.damage += ability.ko.counters;
      events.push({ t: "damage", p: other(p), spot: ACTIVE, n: ability.ko.counters, why: "ability" });
    }
  }
  const after = [];
  for (const p of [0, 1]) {
    const side = state.players[p];
    for (const [slot, spot] of inPlay(state, p)) {
      const def = defOf(state, slot.uid, defs);
      if (!falling(slot)) continue;
      const ability = koPower(slot, spot, p);
      events.push({ t: "ko", p, spot, uid: slot.uid });
      if (ability?.ko.toHand) {
        // "Put it into your hand instead of the discard pile. (Discard all attached cards.)"
        events.push({ t: "ability", p, spot, uid: slot.uid, name: ability.name });
        side.hand.push(slot.uid);
        side.discard.push(...slot.under, ...slot.energy, ...(slot.tool ? [slot.tool] : []), ...heldOn(slot));
        events.push({ t: "ko-hand", p, uid: slot.uid });
      } else discardSlot(state, p, slot);
      if (ability?.ko.steps) after.push([p, spot, slot.uid, ability]);
      if (spot === ACTIVE) side.active = null;
      else side.bench[spot] = null;
      took[other(p)] += def.prizes || 1;
      // Remembered by turn for "if any of your Pokémon were Knocked Out during your opponent's last turn"
      // (the checkup between turns is no one's turn).
      if (state.current === other(p) && !between) side.lostOn = [...new Set([...(side.lostOn || []).filter((t) => t >= state.turn - 1), state.turn])];
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
  // What a Knocked Out Pokémon's Ability does as it goes (a search, cards off their deck or hand).
  for (const [p, spot, uid, ability] of after) {
    const ctx = { state, defs, events, player: p, src: "ability" };
    if (!trainerReady(ability.ko.steps, ctx)) continue;
    events.push({ t: "ability", p, spot, uid, name: ability.name });
    runTrainer(ability.ko.steps, ctx);
  }
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
    offerAbility(state, player, side.bench.length - 1, "bench", defs);
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
    evolveSlot(state, player, spot, uid, defs, events);
  },

  /** Play a Trainer from the hand: it goes to the discard pile and does what it says. */
  play(state, { player, uid }, defs, events) {
    const side = state.players[player];
    if (!side.hand.includes(uid)) fail("That card isn't in your hand.");
    const def = defOf(state, uid, defs);
    const why = trainerBlock(state, player, def, defs);
    if (why) fail(why);
    takeFromHand(state, player, uid);
    if (def.sub === "stadium") {
      // It stays in play for both players; the one it replaces goes to its owner's discard pile.
      if (state.stadium) state.players[state.stadium.owner].discard.push(state.stadium.uid);
      state.stadium = { uid, owner: player };
      side.stadiumPlayed = true;
      events.push({ t: "stadium", p: player, uid });
      // HP a Stadium gave is gone with it: anything left with none is Knocked Out.
      resolveKnockOuts(state, defs, events);
      return;
    }
    side.discard.push(uid);
    if (def.sub === "supporter") side.supporterUsed = true;
    events.push({ t: "play", p: player, uid, sub: def.sub });
    runTrainer(def.fx, { state, defs, events, player, src: "trainer", uid });
    if (!state.pending.length) resolveKnockOuts(state, defs, events);
  },

  attach(state, { player, uid, spot }, defs, events) {
    const side = state.players[player];
    if (!side.hand.includes(uid)) fail("That card isn't in your hand.");
    const energy = defOf(state, uid, defs);
    if (energy.kind !== "energy") fail("That isn't an Energy card.");
    if (!energy.playable) fail(energy.why || "That Energy can't be played yet.");
    if (side.energyUsed) fail("You've already attached an Energy this turn.");
    const slot = slotAt(state, player, spot);
    if (!slot) fail("There's no Pokémon there.");
    if (!energyFits(energy, defOf(state, slot.uid, defs))) fail(`${energy.name} can only be attached to ${onlyFor(energy.special.only)} Pokémon.`);
    takeFromHand(state, player, uid);
    slot.energy.push(uid);
    side.energyUsed = true;
    events.push({ t: "attach", p: player, uid, spot });
    if (abilityOn(state, slot, defs)?.attachCure && conditionsOn(slot).length) {
      for (const kind of conditionsOn(slot)) events.push({ t: "cure", p: player, spot, kind });
      delete slot.status;
    }
    // "Whenever your opponent attaches an Energy card from their hand to 1 of their Pokémon, put 2 damage counters on that Pokémon."
    let stung = false;
    for (const [rival, at] of inPlay(state, other(player))) {
      const ability = abilityOn(state, rival, defs);
      if (!ability?.foeAttach || warded(state, slot, { player: other(player), src: "ability" }, defs)) continue;
      events.push({ t: "ability", p: other(player), spot: at, uid: rival.uid, name: ability.name });
      slot.damage += ability.foeAttach;
      events.push({ t: "damage", p: player, spot, n: ability.foeAttach, why: "ability" });
      stung = true;
    }
    if (stung && !energy.special?.attach) resolveKnockOuts(state, defs, events);
    if (!slotAt(state, player, spot) || slotAt(state, player, spot) !== slot) return;
    // "When you attach this card from your hand": what a Special Energy does then.
    const on = energy.special?.attach;
    if (on && (!on.where || (on.where === "active") === (spot === ACTIVE)) && (!on.type || defOf(state, slot.uid, defs).types.includes(on.type))) {
      const ctx = { state, defs, events, player, spot };
      const steps = on.steps.filter((step) => T_OPS[step.op]?.ready(ctx, step));
      if (steps.length) {
        events.push({ t: "energy-effect", p: player, uid, spot });
        runTrainer(steps, ctx);
      }
      if (!state.pending.length) resolveKnockOuts(state, defs, events);
    }
  },

  /** Do what the Stadium in play offers once a turn. */
  stadium(state, { player }, defs, events) {
    const why = stadiumBlock(state, player, defs);
    if (why) fail(why);
    const def = defOf(state, state.stadium.uid, defs);
    state.players[player].stadiumUsed = true;
    events.push({ t: "stadium-use", p: player, uid: state.stadium.uid });
    runTrainer(def.stadium.use, { state, defs, events, player });
    if (!state.pending.length) resolveKnockOuts(state, defs, events);
  },

  /** Use the Ability of one of your Pokémon in play. */
  ability(state, { player, spot }, defs, events) {
    const why = abilityBlock(state, player, spot, defs);
    if (why) fail(why);
    const slot = slotAt(state, player, spot);
    const ability = defOf(state, slot.uid, defs).ability;
    slot.used = { uid: slot.uid, turn: state.turn };
    (state.players[player].abilitiesUsed ||= []).push(ability.name);
    if (ability.use.vstar) state.players[player].vstarUsed = true;
    events.push({ t: "ability", p: player, spot, uid: slot.uid, name: ability.name });
    // "If you use this Ability, this Pokémon is Knocked Out": it goes once what it does is done.
    if (ability.use.selfKo) slot.damage = Math.max(slot.damage, maxHp(state, slot, defs));
    runTrainer(ability.use.steps, { state, defs, events, player, spot, src: "ability" });
    if (ability.use.ends) {
      state.ending = true;
      events.push({ t: "turn-ends", p: player, name: ability.name });
    }
    if (!state.pending.length) resolveKnockOuts(state, defs, events);
  },

  /** Attach a Pokémon Tool from the hand: one to a Pokémon, and it stays until that Pokémon leaves play. */
  tool(state, { player, uid, spot }, defs, events) {
    const side = state.players[player];
    if (!side.hand.includes(uid)) fail("That card isn't in your hand.");
    const def = defOf(state, uid, defs);
    if (def.kind !== "trainer" || def.sub !== "tool" || !def.playable) fail(def.why || "That isn't a Pokémon Tool.");
    if (side.noTrainers === state.turn) fail("You can't play any more Trainer cards this turn.");
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
      paid += unitsOn(state, slot, defOf(state, uid, defs), defOf(state, slot.uid, defs)).length || 1;
    }
    if (paid < cost) fail("That doesn't cover the retreat cost.");
    side.discard.push(...gone);
    clearConditions(slot);
    side.bench[to] = slot;
    side.active = next;
    side.retreated = true;
    events.push({ t: "retreat", p: player, to, discarded: gone });
    offerRise(state, player, defs);
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
    const marked = Boolean(target && !hit.noEffects && markOn(state, target, "shield"));
    // An Ability that keeps off every effect of attacks except damage counts as a shield for the effects.
    ctx.shielded = marked || Boolean(target && !hit.noEffects && abilityOn(state, target, defs)?.noEffects);
    if (!hit.cancelled && target) {
      // Tools: the attacker's adds damage before Weakness, the target's can lift its Weakness or soak some.
      const mine = toolOf(state, slot, defs);
      const theirs = toolOf(state, target, defs);
      const base = hit.damage > 0 ? Math.max(0, hit.damage + (mine.plus || 0) + heldSum(slot, "plus") + boostOf(state, player, slot, target, defs)) : hit.damage;
      const dealt = damageAfterTyping(base, def, defOf(state, target.uid, defs), { ...hit, noWeakness: hit.noWeakness || Boolean(theirs.noWeakness), noResistance: hit.noResistance || Boolean(theirs.noResistance) });
      // Old PlusPower and Misty: more only when the attack does damage after Weakness and Resistance.
      if (dealt.amount > 0) dealt.amount += heldSum(slot, "after") + boostOf(state, player, slot, target, defs, true);
      const less = (hit.noEffects ? 0 : markOn(state, target, "less")?.n || 0) + (theirs.less || 0) + (hit.noEffects ? 0 : heldSum(target, "less"));
      let guarded = marked || (!hit.noEffects && markOn(state, target, "guard"));
      // The target's Ability: no damage from this kind of attacker, or a coin flip to take none.
      const power = hit.noEffects ? null : abilityOn(state, target, defs);
      if (!guarded && dealt.amount > 0 && power?.wall && walled(power.wall, def, state, slot, defs)) guarded = true;
      if (!guarded && dealt.amount - less > 0 && power?.dodge) {
        const heads = flip(state);
        events.push({ t: "flip", p: foe, results: [heads], why: "ability", name: power.name });
        guarded = heads;
      }
      let amount = guarded ? 0 : Math.max(0, dealt.amount - less);
      // From full HP it hangs on instead of being Knocked Out.
      if (power?.sturdy && target.damage === 0 && amount >= maxHp(state, target, defs) && maxHp(state, target, defs) > power.sturdy) {
        amount = maxHp(state, target, defs) - power.sturdy;
        events.push({ t: "ability", p: foe, spot: ACTIVE, uid: target.uid, name: power.name });
      }
      // Or a coin flip decides it, from any HP.
      if (power?.hangOn && amount > 0 && amount >= hpLeft(state, target, defs) && hpLeft(state, target, defs) > power.hangOn) {
        const heads = flip(state);
        events.push({ t: "flip", p: foe, results: [heads], why: "ability", name: power.name });
        if (heads) {
          amount = hpLeft(state, target, defs) - power.hangOn;
          events.push({ t: "ability", p: foe, spot: ACTIVE, uid: target.uid, name: power.name });
        }
      }
      if (amount > 0) {
        target.damage += amount;
        target.hit = state.turn;
        events.push({ t: "damage", p: foe, spot: ACTIVE, n: amount, weak: dealt.weak, resist: dealt.resist });
        // Koga: "If an attack from a Pokémon with Koga in its name does damage to a Defending Pokémon this turn, that Pokémon is then Poisoned."
        if ((state.boosts || []).some((b) => b.poison && b.p === player && b.turn === state.turn && fieldFits(b.who || {}, def)) && addCondition(state, target, "poisoned", defs)) events.push({ t: "condition", p: foe, kind: "poisoned" });
        // Damaged in the Active Spot, it hits back, even when this Knocks it Out.
        const thorns = abilityOn(state, target, defs)?.thorns;
        if (thorns) {
          events.push({ t: "ability", p: foe, spot: ACTIVE, uid: target.uid, name: defOf(state, target.uid, defs).ability.name });
          if (thorns.n) {
            slot.damage += thorns.n;
            events.push({ t: "damage", p: player, spot: ACTIVE, n: thorns.n, self: true, why: "ability" });
          } else if (addCondition(state, slot, thorns.status, defs)) events.push({ t: "condition", p: player, kind: thorns.status });
        }
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
    // `owner`: the cards are another player's (their hand, their deck), and go where the effect says on their side.
    const owner = waiting.owner ?? player;
    const side = state.players[owner];
    const picked = [...new Set(uids)];
    if (picked.some((uid) => !waiting.uids.includes(uid))) fail("That card can't be chosen.");
    if (picked.length < waiting.min) fail(waiting.min === 1 ? "Choose a card." : `Choose ${waiting.min} cards.`);
    if (picked.length > waiting.max) fail(waiting.max === 1 ? "Choose only one card." : `Choose at most ${waiting.max} cards.`);
    const why = chooseBlock(state, waiting, picked, defs);
    if (why) fail(why);
    // Cards in play (Tools, the Stadium) leave where they are in the effect itself.
    const pile = waiting.zone === "play" ? [] : side[waiting.zone];
    for (const uid of picked) if (pile.includes(uid)) pile.splice(pile.indexOf(uid), 1);
    const { op } = waiting.effect;
    if (op === "dropInPlay") {
      // Tools or Energy off any Pokémon in play, the Stadium: each to its owner's discard pile.
      for (const uid of picked) {
        if (state.stadium?.uid === uid) {
          state.players[state.stadium.owner].discard.push(uid);
          events.push({ t: "stadium-gone", p: state.stadium.owner, uid });
          state.stadium = null;
          continue;
        }
        for (const p of [0, 1]) {
          const hit = inPlay(state, p).find(([slot]) => slot.tool === uid || slot.energy.includes(uid));
          if (!hit) continue;
          const [slot, spot] = hit;
          state.players[p].discard.push(uid);
          if (slot.tool === uid) {
            delete slot.tool;
            events.push({ t: "discard-tool", p, spot, uid });
          } else {
            slot.energy.splice(slot.energy.indexOf(uid), 1);
            events.push({ t: "discard-energy", p, spot, uids: [uid] });
          }
        }
      }
    } else if (op === "evolveFrom") {
      // A card that evolves one of your Pokémon (Rare Candy from the hand, Evosoda from the deck): onto which one.
      const uid = picked[0];
      const spots = uid ? evolveSpots(state, player, defOf(state, uid, defs), defs, waiting.effect.how, waiting.effect.where) : [];
      if (uid && !spots.length) pile.push(uid);
      else if (spots.length === 1) evolveSlot(state, player, spots[0], uid, defs, events, waiting.zone);
      else if (spots.length) {
        askPick(state, { player, side: player, spots, left: 1, effect: { op: "evolveHeld", uid, zone: waiting.zone }, ...(waiting.then ? { then: waiting.then, from: waiting.from, ...carry(waiting) } : {}) });
        waiting.then = null;
      } else if (waiting.zone === "deck") events.push({ t: "search", p: player, uids: [], from: "deck", to: "hand" });
    } else if (op === "toTop" || op === "toBottom") {
      // From the hand onto the top or the bottom of the deck (or into it, when it is shuffled next).
      if (op === "toTop") side.deck.unshift(...picked);
      else side.deck.push(...picked);
      if (picked.length) events.push({ t: "hand-to-deck", p: player, uids: picked, at: waiting.shuffle ? "into" : op === "toTop" ? "top" : "bottom" });
    } else if (op === "discard") {
      side.discard.push(...picked);
      if (picked.length) events.push({ t: "discard-hand", p: player, uids: picked });
    } else if (op === "attach") {
      // Energy from the deck onto Pokémon: a fixed one, one picked for all, or a pick for each card.
      // A Trainer may name which Pokémon can take it (`spots`), and the zone it comes from (hand, discard pile).
      const to = waiting.effect.to;
      const spots = (waiting.effect.spots || inPlay(state, player).map(([, s]) => s)).filter((s) => slotAt(state, player, s));
      // "Attach up to 2 ... If you do": none attached, nothing after.
      if (!picked.length && waiting.effect.need) waiting.then = null;
      if (picked.length && !spots.length && waiting.effect.spot == null) pile.push(...picked);
      else if (picked.length && waiting.effect.spot != null && slotAt(state, player, waiting.effect.spot)) {
        const slot = slotAt(state, player, waiting.effect.spot);
        slot.energy.push(...picked);
        for (const uid of picked) events.push({ t: "attach", p: player, uid, spot: waiting.effect.spot, from: "deck" });
      } else if (picked.length && to === "spread") {
        picked.forEach((uid, i) => askPick(state, { player, side: player, spots, left: 1, effect: { op: "attachHeld", uids: [uid] }, ...(i === picked.length - 1 && waiting.then ? { then: waiting.then, from: waiting.from, ...carry(waiting) } : {}) }));
        waiting.then = null;
      } else if (picked.length) {
        askPick(state, { player, side: player, spots, left: 1, effect: { op: "attachHeld", uids: picked, ...(waiting.zone !== "deck" ? { zone: waiting.zone } : {}) }, ...(waiting.then ? { then: waiting.then, from: waiting.from, ...carry(waiting) } : {}) });
        waiting.then = null;
      } else if (!picked.length && waiting.zone === "deck") events.push({ t: "search", p: player, uids: [], from: waiting.zone, to: "hand" });
      // Cards looked at from the top and not taken go to the hand (the Ability says so), else the deck is shuffled.
      if (waiting.rest === "hand" && waiting.top) {
        const rest = side.deck.splice(0, waiting.top - picked.length);
        side.hand.push(...rest);
        if (rest.length) events.push({ t: "search", p: player, uids: rest, from: "deck", to: "hand" });
      }
    } else if (op === "swapIn") {
      const slot = slotAt(state, player, waiting.effect.spot);
      if (picked.length && slot) {
        side.deck.push(slot.uid);
        slot.uid = picked[0];
        events.push({ t: "form", p: player, uid: picked[0], spot: waiting.effect.spot });
      } else side.deck.push(...picked);
    } else if (op === "toDeck") {
      side.deck.push(...picked);
      events.push({ t: "recycle", p: owner, uids: picked });
    } else if (op === "toBench") {
      for (const uid of picked) side.bench.push(newSlot(state, uid));
      events.push({ t: "search", p: owner, uids: picked, from: waiting.zone, to: "bench" });
      // Revive: half its HP in damage counters, rounded down to the nearest 10.
      if (waiting.effect.half) for (const slot of side.bench.slice(-picked.length)) slot.damage += Math.floor(defOf(state, slot.uid, defs).hp / 20) * 10;
    } else if (op === "deckTop") {
      // "Search your deck for a card, shuffle your deck, then put that card on top of it": in the order chosen, the first on top.
      shuffle(state, side.deck);
      side.deck.unshift(...picked);
      events.push({ t: "deck-top", p: owner, n: picked.length });
    } else if (op === "order") {
      // Cards looked at go back where they came from in the order chosen (the first one chosen nearest the top).
      if (waiting.effect.at === "bottom") side.deck.push(...picked);
      else side.deck.unshift(...picked);
    } else if (op === "fromDiscardTop") {
      side.deck.unshift(...picked);
      events.push({ t: "recycle", p: owner, uids: picked, at: "top" });
    } else if (op === "keepOne") {
      // Professor Rowan: the card chosen stays, the rest of the hand is shuffled into the deck.
      const rest = side.hand.splice(0);
      side.hand.push(...picked);
      side.deck.push(...rest);
      if (rest.length) events.push({ t: "shuffle-hand", p: owner });
    } else if (op === "toActive") {
      // Lt. Surge: a Basic Pokémon from the hand becomes the Active Pokémon, the old one goes to the Bench.
      if (picked.length && side.active && side.bench.length < state.rules.bench) {
        clearConditions(side.active);
        side.bench.push(side.active);
        side.active = newSlot(state, picked[0]);
        events.push({ t: "bench", p: owner, uid: picked[0], spot: ACTIVE });
      } else side.hand.push(...picked);
    } else if (op === "carryEnergy") {
      // Lucian's Assignment: the Energy chosen, then the Pokémon it goes to.
      const spots = inPlay(state, owner).map(([, s]) => s).filter((s) => s !== waiting.effect.from);
      if (picked.length && spots.length) {
        askPick(state, { player, side: owner, spots, left: 1, effect: { op: "moveEnergyCards", from: waiting.effect.from, uids: picked }, ...(waiting.then ? { then: waiting.then, from: waiting.from, ...carry(waiting) } : {}) });
        waiting.then = null;
      }
    } else {
      side.hand.push(...picked);
      events.push({ t: "search", p: owner, uids: picked, from: waiting.zone, to: "hand" });
    }
    // Grimsley's Move: the other cards looked at are shuffled and put on the bottom of the deck.
    if (waiting.restBottom) {
      const rest = side.deck.splice(0, Math.max(0, waiting.restBottom - picked.length));
      side.deck.push(...shuffle(state, rest));
    }
    if (waiting.shuffle && op !== "deckTop") shuffle(state, side.deck);
    // "Discard ... If you discarded a Pokémon that has δ on its card, draw 4 cards instead": the next step sees what went.
    if (waiting.pass && waiting.then?.length) waiting.then = [{ ...waiting.then[0], paid: picked }, ...waiting.then.slice(1)];
    state.pending.shift();
    resume(state, waiting, defs, events);
    if (!state.pending.length) resolveKnockOuts(state, defs, events);
  },

  /** Answer a "Choose 1:" a card offers: pending { type: "option", player, labels, options: [steps] }. */
  option(state, { player, index }, defs, events) {
    const waiting = state.pending[0];
    const steps = waiting.options[index];
    if (!Number.isInteger(index) || !steps) fail("Choose one of the options.");
    state.pending.shift();
    runTrainer([...steps, ...(waiting.then || [])], { state, defs, events, player: waiting.by ?? waiting.player, spot: waiting.from, ...(waiting.src ? { src: waiting.src } : {}), ...(waiting.card ? { uid: waiting.card } : {}) });
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
    offerRise(state, player, defs);
  },
};

/** Why this Trainer can't be played right now, or "" when it can. */
export function trainerBlock(state, player, def, defs) {
  if (def?.kind !== "trainer" || !def.playable) return def?.why || "That card can't be played.";
  const side = state.players[player];
  if (side.noTrainers === state.turn) return "You can't play any more Trainer cards this turn.";
  if (def.sub === "supporter") {
    if (side.supporterUsed) return "You've already played a Supporter this turn.";
    if (state.turn === 1 && !def.fx.some((step) => step.op === "early")) return "No Supporter on the first turn of the match.";
  }
  if (def.sub === "stadium") {
    if (side.stadiumPlayed) return "You've already played a Stadium this turn.";
    if (state.stadium && defOf(state, state.stadium.uid, defs).name === def.name) return `${def.name} is already in play.`;
    return "";
  }
  if (!trainerReady(def.fx, { state, defs, events: [], player, src: "trainer" })) return `${def.name} would do nothing right now.`;
  return "";
}

/** Why the Stadium in play can't be used by this player right now, or "" when it can. */
export function stadiumBlock(state, player, defs) {
  const use = state.stadium && defOf(state, state.stadium.uid, defs)?.stadium?.use;
  if (!use) return "This Stadium has nothing to use.";
  if (state.players[player].stadiumUsed) return "You've already used the Stadium this turn.";
  if (!trainerReady(use, { state, defs, events: [], player })) return "The Stadium would do nothing right now.";
  return "";
}

/** Does an Ability keep this Benched Pokémon safe from attack damage? */
export function benchSafe(state, slot, spot, defs) {
  if (spot === ACTIVE) return false;
  if (abilityOn(state, slot, defs)?.benchSafe) return true;
  const owner = ownerOf(state, slot);
  return owner >= 0 && inPlay(state, owner).some(([mate]) => abilityOn(state, mate, defs)?.benchWall);
}

/** Is this attacker one the wall stops? */
function walled(wall, def, state, slot, defs) {
  // "...that have Special Energy attached", "...that have an Ability".
  if (wall.special) return slot.energy.some((uid) => defOf(state, uid, defs)?.kind === "energy" && !defOf(state, uid, defs).basic);
  if (wall.ability) return def.abilityKind === "Ability" && (!def.ability || Boolean(abilityOn(state, slot, defs)));
  return wall.all || wall.boxes.includes(def.box) || wall.types.some((t) => def.types.includes(t)) || (wall.stage === "basic" && def.stage === "basic");
}

/** A Pokémon just came into play from the hand: when its Ability says "you may", ask. */
function offerAbility(state, player, spot, how, defs) {
  const slot = slotAt(state, player, spot);
  const enter = abilityOn(state, slot, defs)?.enter;
  if (!enter || enter.how !== how) return;
  if (!trainerReady(enter.steps, { state, defs, events: [], player, spot })) return;
  askPick(state, { player, side: player, spots: [spot], left: 1, optional: true, effect: { op: "ability" } });
}

/**
 * "Once during your turn, when this Pokémon moves from your Bench to the Active Spot, you may":
 * asked when it comes up by a retreat, a switch or a promotion during its owner's own turn.
 */
function offerRise(state, player, defs) {
  const slot = state.players[player].active;
  const rise = abilityOn(state, slot, defs)?.rise;
  if (!rise || state.current !== player || state.phase !== "main") return;
  if (slot.used?.uid === slot.uid && slot.used.turn === state.turn) return;
  if (!trainerReady(rise.steps, { state, defs, events: [], player, spot: ACTIVE, src: "ability" })) return;
  askPick(state, { player, side: player, spots: [ACTIVE], left: 1, optional: true, effect: { op: "ability", key: "rise" } });
}

/** Carry out a choice on the Pokémon picked: damage to it, or it trades places with the Active. */
function applyPick(state, waiting, spot, defs, events) {
  const p = waiting.side;
  const side = state.players[p];
  const { effect } = waiting;
  if (effect.op === "ability") {
    // "When you play this Pokémon ... you may": the player said yes.
    const slot = slotAt(state, p, spot);
    const ability = defOf(state, slot.uid, defs).ability;
    const key = effect.key || "enter";
    if (key === "rise") slot.used = { uid: slot.uid, turn: state.turn };
    events.push({ t: "ability", p, spot, uid: slot.uid, name: ability.name });
    runTrainer(ability[key].steps, { state, defs, events, player: p, spot, src: "ability" });
  } else if (effect.op === "evolveHeld") {
    // The card chosen to evolve with (it rides on the pick) goes on the Pokémon picked.
    evolveSlot(state, p, spot, effect.uid, defs, events, effect.zone);
  } else if (effect.op === "gatherFrom") {
    // "Move any amount of Energy from your other Pokémon to it": one card a pick, until the player stops.
    const slot = slotAt(state, p, spot);
    const uid = energyIn({ state, defs }, slot, effect.type);
    if (!uid) return;
    moveEnergy(state, p, spot, effect.to, uid, events);
    const spots = inPlay(state, p).filter(([s, at]) => at !== effect.to && energyIn({ state, defs }, s, effect.type)).map(([, at]) => at);
    if (spots.length) follow(state, waiting, { player: p, side: p, spots, left: 1, optional: true, effect });
  } else if (effect.op === "attachFrom") {
    const slot = slotAt(state, p, spot);
    const pile = side[effect.zone];
    if (!pile.includes(effect.uid)) return;
    pile.splice(pile.indexOf(effect.uid), 1);
    slot.energy.push(effect.uid);
    events.push({ t: "attach", p, uid: effect.uid, spot, from: effect.zone });
  } else if (effect.op === "damage") {
    const slot = slotAt(state, p, spot);
    if (effect.attack && benchSafe(state, slot, spot, defs)) return void events.push({ t: "blocked", p, spot });
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
    if (effect.attack) slot.hit = state.turn;
    events.push({ t: "damage", p, spot, n, weak, resist });
  } else if (effect.op === "switch") {
    switchActive(state, p, spot, events, defs);
  } else if (effect.op === "heal") {
    const slot = slotAt(state, p, spot);
    let n = effect.n;
    // Moo-Moo Milk: the Pokémon is chosen, then the coins say how much. Night Pokémon Center: both heads heal it all, both tails strip it.
    if (effect.flips) {
      const results = Array.from({ length: effect.flips }, () => flip(state));
      events.push({ t: "flip", p, results });
      const heads = results.filter(Boolean).length;
      n = effect.night ? (heads === effect.flips ? 9990 : 0) : heads * effect.per;
      if (effect.night && !heads) stripEnergy({ state, events }, p, spot);
    }
    const healed = Math.min(n, slot.damage);
    slot.damage -= healed;
    if (healed) events.push({ t: "heal", p, spot, n: healed });
    if (effect.cure) {
      for (const kind of conditionsOn(slot)) events.push({ t: "cure", p, spot, kind });
      delete slot.status;
    }
    if (effect.strip && (!effect.ifHealed || healed)) stripEnergy({ state, events }, p, spot, effect.strip === "hand");
    // Super Potion: an Energy of the kind named, the player's choice of which, goes from that Pokémon (the price, or "if you do").
    if (effect.pay && (!effect.ifHealed || healed)) {
      const uids = slot.energy.filter((uid) => fitsEnergy(defOf(state, uid, defs), effect.pay));
      if (uids.length === 1) dropEnergy(state, p, spot, uids, events);
      else if (uids.length) {
        askChoose(state, { player: waiting.player, zone: "play", what: "energy", uids, min: 1, max: 1, effect: { op: "dropInPlay" }, ...(waiting.then ? { then: waiting.then, from: waiting.from, ...carry(waiting) } : {}) });
        waiting.then = null;
      }
    }
  } else if (effect.op === "hold") {
    // PlusPower, Defender: the card played goes on the Pokémon for a while (see heldOn).
    const discard = state.players[waiting.by ?? waiting.player].discard;
    if (!discard.includes(effect.uid)) return;
    discard.splice(discard.indexOf(effect.uid), 1);
    const slot = slotAt(state, p, spot);
    (slot.held ||= []).push({ uid: effect.uid, ...effect.mod });
    events.push({ t: "hold", p, spot, uid: effect.uid });
  } else if (effect.op === "lift") {
    slotAt(state, p, spot).lift = state.turn;
    events.push({ t: "lift", p, spot });
  } else if (effect.op === "devolve") {
    // Hyper Devolution Spray: the top Evolution card back to the hand; what is left can't evolve again this turn.
    const slot = slotAt(state, p, spot);
    if (!slot.under.length) return;
    side.hand.push(slot.uid);
    events.push({ t: "devolve", p, spot, uid: slot.uid });
    slot.uid = slot.under.shift();
    slot.since = state.turn;
    clearConditions(slot);
  } else if (effect.op === "swapFrom") {
    // Ninja Boy: a Basic Pokémon from the deck takes this one's place, with all it had.
    const uids = side.deck.filter((uid) => isBasic(state, uid, defs));
    askChoose(state, { player: waiting.player, zone: "deck", what: "basic", uids, min: 0, max: 1, effect: { op: "swapIn", spot }, shuffle: true, ...(waiting.then ? { then: waiting.then, from: waiting.from, ...carry(waiting) } : {}) });
    waiting.then = null;
  } else if (effect.op === "energyFrom") {
    // Super Energy Removal, Lucian's Assignment: which Energy cards on the Pokémon picked.
    const uids = slotAt(state, p, spot).energy.slice();
    if (!uids.length) return;
    const next = effect.move ? { op: "carryEnergy", from: spot } : { op: "dropInPlay" };
    askChoose(state, { player: waiting.player, zone: "play", what: "energy", uids, min: effect.min ?? 1, max: effect.n || uids.length, effect: next, ...(effect.move ? { owner: p } : {}), ...(waiting.then ? { then: waiting.then, from: waiting.from, ...carry(waiting) } : {}) });
    waiting.then = null;
  } else if (effect.op === "moveAllFrom") {
    // Sabrina: every Energy on one, onto another the card names.
    const spots = inPlay(state, p).filter(([s, at]) => at !== spot && fieldFits(effect.who || {}, defOf(state, s.uid, defs))).map(([, at]) => at);
    const uids = slotAt(state, p, spot).energy.slice();
    if (spots.length && uids.length) follow(state, waiting, { player: waiting.player, side: p, spots, left: 1, effect: { op: "moveEnergyCards", from: spot, uids } });
  } else if (effect.op === "moveEnergyCards") {
    for (const uid of effect.uids) moveEnergy(state, p, effect.from, spot, uid, events);
  } else if (effect.op === "bounce") {
    // Back to the hand: its Pokémon cards (all of them, or only the Basic one), and what was attached when `keep` is "all".
    const slot = slotAt(state, p, spot);
    const mons = [slot.uid, ...slot.under];
    const all = [...mons, ...slot.energy, ...(slot.tool ? [slot.tool] : []), ...heldOn(slot)];
    const back = effect.keep === "all" ? all : effect.keep === "basic" ? [mons[mons.length - 1]] : mons;
    side.hand.push(...back);
    side.discard.push(...all.filter((uid) => !back.includes(uid)));
    if (spot === ACTIVE) side.active = null;
    else side.bench.splice(spot, 1);
    events.push({ t: "bounce", p, spot, uid: slot.uid });
  } else if (effect.op === "moveEnergyFrom") {
    // Which Energy: the last attached of the kind asked for. Then, where it goes.
    const slot = slotAt(state, p, spot);
    const uid = energyIn({ state, defs }, slot, effect.type, effect.basic);
    const spots = moveTargets({ state, defs, player: p, spot: effect.self }, effect, spot);
    if (!uid || !spots.length) return;
    // Only one place it can go (onto the Active Pokémon): no need to ask.
    if (spots.length === 1) return moveEnergy(state, p, spot, spots[0], uid, events);
    follow(state, waiting, { player: p, side: p, spots, left: 1, effect: { op: "moveEnergyTo", from: spot, uid } });
  } else if (effect.op === "moveEnergyTo") {
    moveEnergy(state, p, effect.from, spot, effect.uid, events);
  } else if (effect.op === "moveCountersFrom") {
    const slot = slotAt(state, p, spot);
    const n = Math.min(effect.n, slot.damage);
    const to = effect.to === "foe" ? other(p) : p;
    const spots = inPlay(state, to).map(([, s]) => s).filter((s) => (to !== p ? !warded(state, slotAt(state, to, s), { player: p, src: "ability" }, defs) : s !== spot));
    if (!n || !spots.length) return;
    follow(state, waiting, { player: p, side: to, spots, left: 1, effect: { op: "moveCountersTo", n, from: spot, fromSide: p } });
  } else if (effect.op === "moveCountersTo") {
    const source = slotAt(state, effect.fromSide, effect.from);
    const slot = slotAt(state, p, spot);
    const n = Math.min(effect.n, source?.damage || 0);
    if (!n) return;
    source.damage -= n;
    events.push({ t: "heal", p: effect.fromSide, spot: effect.from, n, why: "move" });
    slot.damage += n;
    events.push({ t: "damage", p, spot, n, why: "move" });
  } else if (effect.op === "attachHeld") {
    // Energy already taken from the deck (it rides on the choice) goes onto the Pokémon picked.
    const slot = slotAt(state, p, spot);
    for (const uid of effect.uids) {
      slot.energy.push(uid);
      events.push({ t: "attach", p, uid, spot, from: effect.zone || "deck" });
    }
  } else if (effect.op === "discardEnergy") {
    const slot = slotAt(state, p, spot);
    // "Discard a Pokémon Tool and a Special Energy from 1 of your opponent's Pokémon": the Tool goes too.
    if (effect.tool && slot.tool) {
      side.discard.push(slot.tool);
      events.push({ t: "discard-tool", p, spot, uid: slot.tool });
      delete slot.tool;
    }
    // A Special Energy only: the last one attached.
    const special = effect.special ? [...slot.energy].reverse().find((uid) => !defOf(state, uid, defs).basic) : null;
    const gone = effect.special ? (special ? slot.energy.splice(slot.energy.indexOf(special), 1) : []) : slot.energy.splice(Math.max(0, slot.energy.length - effect.n), effect.n);
    // "Put an Energy attached to 1 of your opponent's Pokémon into their hand."
    if (effect.toHand) side.hand.push(...gone);
    else side.discard.push(...gone);
    if (gone.length) events.push({ t: effect.toHand ? "energy-to-hand" : "discard-energy", p, spot, uids: gone });
  }
}

const fitsEnergy = (def, what) => def?.kind === "energy" && (what === "energy" || (def.provides || []).includes(what.split(":")[1]));

function dropEnergy(state, p, spot, uids, events) {
  const slot = slotAt(state, p, spot);
  for (const uid of uids) slot.energy.splice(slot.energy.indexOf(uid), 1);
  state.players[p].discard.push(...uids);
  events.push({ t: "discard-energy", p, spot, uids });
}

/**
 * Why these cards can't be chosen together, or "": `rule` { oneOf: [what] } all of one kind (Sonia),
 * { apiece: [what] } at most one of each kind (Drayton), { distinct: true } no two of the same type (Lady Outing).
 */
export function chooseBlock(state, waiting, picked, defs) {
  const rule = waiting.rule;
  if (!rule || !picked.length) return "";
  const cards = picked.map((uid) => defOf(state, uid, defs));
  if (rule.oneOf && !rule.oneOf.some((what) => cards.every((def) => fits(def, what)))) return "Choose cards of one kind only.";
  if (rule.apiece) {
    // Each card needs a kind of its own: a matching, tried kind by kind.
    const free = (i, used) => i === cards.length || rule.apiece.some((what, k) => !used.has(k) && fits(cards[i], what) && free(i + 1, new Set([...used, k])));
    if (!free(0, new Set())) return "Only one card of each kind.";
  }
  if (rule.distinct) {
    const types = cards.map((def) => def.provides || def.types || []);
    if (types.some((a, i) => types.some((b, j) => j > i && a.some((t) => b.includes(t))))) return "Each card must be a different type.";
  }
  return "";
}

function moveEnergy(state, p, from, to, uid, events) {
  const source = slotAt(state, p, from);
  const slot = slotAt(state, p, to);
  if (!source || !slot || !source.energy.includes(uid)) return;
  source.energy.splice(source.energy.indexOf(uid), 1);
  slot.energy.push(uid);
  events.push({ t: "move-energy", p, uid, from, spot: to });
}

/** A pick that leads to another (move from here, then to there): the steps waiting on the first ride on the second. */
function follow(state, waiting, pick) {
  askPick(state, { ...pick, ...(waiting.then ? { then: waiting.then } : {}), ...(waiting.from != null ? { from: waiting.from } : {}), ...carry(waiting) });
  waiting.then = null;
}

/** The Active Pokémon and a Benched one trade places (an effect, not a retreat: nothing is paid). */
export function switchActive(state, p, spot, events, defs = null) {
  const side = state.players[p];
  const next = side.bench[spot];
  if (!next || !side.active) return;
  clearConditions(side.active);
  side.bench[spot] = side.active;
  side.active = next;
  events.push({ t: "switch", p, spot });
  if (defs) offerRise(state, p, defs);
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
  // `by`: whose card it is, when the choice was the other player's ("your opponent switches ...").
  if (waiting.then?.length) runTrainer(waiting.then, { state, defs, events, player: waiting.by ?? waiting.player, spot: waiting.from, ...(waiting.src ? { src: waiting.src } : {}), ...(waiting.card ? { uid: waiting.card } : {}) });
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
    if (waiting.type !== type || waiting.player !== player) fail(waiting.type === "pick" ? "Waiting for a Pokémon to be chosen." : waiting.type === "choose" ? "Waiting for cards to be chosen." : waiting.type === "option" ? "Waiting for a choice." : "Waiting for a new Active Pokémon.");
  } else {
    if (type === "promote" || type === "pick" || type === "choose" || type === "option") fail("Nothing to choose.");
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
    if (waiting.type === "option") return waiting.labels.map((_, index) => ({ type: "option", player, index }));
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
    if (def.kind === "energy" && def.playable && !side.energyUsed) {
      for (const [slot, spot] of spots) if (energyFits(def, defOf(state, slot.uid, defs))) out.push({ type: "attach", player, uid, spot });
    }
    if (def.kind === "trainer" && def.sub === "tool") {
      if (def.playable && side.noTrainers !== state.turn) for (const [slot, spot] of spots) if (!slot.tool) out.push({ type: "tool", player, uid, spot });
      continue;
    }
    if (def.kind === "trainer" && !trainerBlock(state, player, def, defs)) out.push({ type: "play", player, uid });
  }
  if (state.stadium && !stadiumBlock(state, player, defs)) out.push({ type: "stadium", player });
  for (const [, spot] of spots) if (!abilityBlock(state, player, spot, defs)) out.push({ type: "ability", player, spot });
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
      [slot.uid, ...slot.under, ...slot.energy, ...(slot.tool ? [slot.tool] : []), ...heldOn(slot)].forEach((uid) => shown.add(uid));
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
  // The Stadium is in plain sight, and so are the cards a player is being asked to choose from.
  if (state.stadium) shown.add(state.stadium.uid);
  for (const waiting of state.pending) {
    if (waiting.player !== player) continue;
    if (waiting.type === "choose") waiting.uids.forEach((uid) => shown.add(uid));
    // "Look at your opponent's hand": all of it, not only the cards that may be chosen.
    (waiting.seen || []).forEach((uid) => shown.add(uid));
    if (waiting.type === "pick" && waiting.effect?.op === "evolveHeld") shown.add(waiting.effect.uid);
  }
  view.cards = Object.fromEntries(Object.entries(view.cards).filter(([uid]) => shown.has(uid)));
  delete view.seed;
  delete view.rng;
  view.opening = view.opening.map((e) => (e.t === "mulligan" ? e : { ...e }));
  return view;
}
