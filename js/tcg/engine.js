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
 *             history for attack text: upOn (the turn it moved up from the Bench), healedOn, struckOn / struckFor
 *             (the turn an attack last damaged it, and by how much)
 *   side      lostOn: the turns one of their Pokémon was Knocked Out on the opponent's turn; downed: [{ turn, uid }] the
 *             ones Knocked Out by damage from the opponent's attack
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

import { altCost, attackBlock, runAttackEffects } from "./effects.js";
import { T_OPS, boostOf, energyCards, energyIn, fieldFits, fits, moveTargets, prizesLeft, runTrainer, stripEnergy, toolFits, trainerReady } from "./trainers.js";

/**
 * The official Constructed formats (Play! Pokémon Tournament Handbook, section 4): 60 cards,
 * 6 Prize cards, 4 of a card by name. Which cards each allows is js/tcg/formats.js.
 * `half` is not a format a deck can be built for (`pick` false): only the lesson's stacked
 * practice match (js/tcg/tutorial.js) and the rules tests deal it.
 */
export const FORMATS = {
  standard: { id: "standard", name: "Standard", deckSize: 60, prizes: 6, bench: 5, copies: 4, pick: true },
  expanded: { id: "expanded", name: "Expanded", deckSize: 60, prizes: 6, bench: 5, copies: 4, pick: true },
  unlimited: { id: "unlimited", name: "Unlimited", deckSize: 60, prizes: 6, bench: 5, copies: 4, pick: true },
  half: { id: "half", name: "Half deck", deckSize: 30, prizes: 3, bench: 5, copies: 2, pick: false },
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

/**
 * A coin flip by `who` (the player whose turn it is, unless said). "Whenever your opponent flips a coin during their next
 * turn, treat it as tails" (state.tails { player, turn }): that player's coins come up tails that turn.
 */
export function flip(state, who = state.current) {
  const heads = rand(state) < 0.5;
  return heads && !(state.tails && state.tails.turn === state.turn && state.tails.player === who);
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
  const def = defs(state.cards[uid]);
  // A Trainer played as a Pokémon (Mysterious Fossil, Clefairy Doll) is that Pokémon while it is in play (cards.js compileFossil).
  return def?.fossil && fossilInPlay(state, uid) ? def.fossil.mon : def;
}

/** Is this card in play as a Pokémon, or under one that evolved from it? */
function fossilInPlay(state, uid) {
  for (const side of state.players || []) {
    for (const slot of [side.active, ...(side.bench || [])]) if (slot && (slot.uid === uid || (slot.under || []).includes(uid))) return true;
  }
  return false;
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
  // "The Defending Pokémon has no Abilities until the end of your next turn", "... can't use any Poké-Powers": a noAbility
  // mark, naming the kinds it takes away (its `from`).
  const mute = markOn(state, slot, "noAbility");
  if (mute && mute.from.split(",").includes(defOf(state, slot.uid, defs).abilityKind || "Ability")) return null;
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
  // An attack's effects (js/tcg/effects.js, src "attack"): an Ability that keeps them off, or a shield an earlier attack left.
  // A ward: the effects of attacks kept off, their damage not.
  const attacker = state.players[player]?.active;
  if (src === "attack") return Boolean(ability?.noEffects) || shieldOn(state, slot, attacker ? defOf(state, attacker.uid, defs) : null) || Boolean(markOn(state, slot, "ward"));
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
  const tool = toolOn(state, slot, defs);
  const field = (state.stadium && defOf(state, state.stadium.uid, defs)?.stadium?.field) || [];
  const def = playedAs(state, slot, defs);
  // "Each Pokémon that has any Fairy Energy attached to it": what its Energy gives counts.
  const holds = (types) => energyOf(state, slot, defs).some((u) => types.some((t) => u === t || u === "Any" || u.split("|").includes(t)));
  const mods = [tool, ...field.filter((f) => fieldFits(f.who, def) && (!f.who.holds || holds(f.who.holds))).map((f) => f.mod)].filter(Boolean);
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
    // Old Gym Stadiums: its attacks ignore Resistance; Weakness doesn't count against attackers of these types.
    pierce: mods.some((m) => m.pierce),
    noWeaknessVs: mods.flatMap((m) => m.noWeaknessVs || []),
  };
}

/** The Pokémon in this slot, as the rules see it: one put on the Bench "as a Basic Pokémon" (Strange Cave) is one. */
function playedAs(state, slot, defs) {
  const def = defOf(state, slot.uid, defs);
  return slot.asBasic ? { ...def, stage: "basic" } : def;
}

/** The Tool on this Pokémon while it does something there (some work only on a Basic or a Darkness Pokémon), or null. */
export function toolOn(state, slot, defs) {
  const tool = (slot?.tool && defOf(state, slot.tool, defs)?.tool) || null;
  if (!tool) return null;
  const def = playedAs(state, slot, defs);
  return (!tool.who || fieldFits(tool.who, def)) && toolFits(tool, def) ? tool : null;
}

/** A Tool leaves play: to its owner's discard pile, or to the hand when it says so (U-Turn Board). */
export function toolGone(state, p, uid, defs) {
  const side = state.players[p];
  (defOf(state, uid, defs)?.tool?.back ? side.hand : side.discard).push(uid);
}

/** Discard the Tool on this slot (it lapsed, or did its once-only job). */
function dropTool(state, p, spot, slot, defs, events) {
  if (!slot.tool) return;
  const uid = slot.tool;
  delete slot.tool;
  delete slot.toolOn;
  toolGone(state, p, uid, defs);
  events.push({ t: "discard-tool", p, spot, uid });
}

/** A Pokémon's HP as it stands in play: what it prints, plus what its Tool adds. */
export function maxHp(state, slot, defs) {
  return defOf(state, slot.uid, defs).hp + (toolOf(state, slot, defs).hp || 0);
}

/** What it costs this Pokémon to retreat, after its Tool. */
export function retreatCost(state, slot, defs) {
  const less = toolOf(state, slot, defs).retreat;
  // "During your opponent's next turn, the Defending Pokémon's Retreat Cost is Colorless more" (a retreatMore mark).
  return (less === "all" ? 0 : Math.max(0, defOf(state, slot.uid, defs).retreat - (less || 0))) + markSum(state, slot, "retreatMore");
}

/** What this attack costs this Pokémon now: its printed cost, and Colorless more for each costMore mark on it. */
export function costFor(state, slot, attack, defs = null) {
  const more = markSum(state, slot, "costMore");
  // "If your opponent has any Ultra Beasts in play, this attack can be used for Colorless" (effects.js altCost).
  const cost = (defs && altCost(state, ownerOf(state, slot), slot, attack, defs)) || attack.cost;
  return more ? [...cost, ...Array(more).fill("Colorless")] : cost;
}

/** An attack this Pokémon can't use now: a noUse mark this turn, one kept until it leaves the Active Spot (`until`), or one spent for as long as it stays in play. */
const barredAttack = (state, slot, name) => (slot.marks || []).some((m) => m.kind === "noUse" && (m.turn === state.turn || m.until) && m.name === name) || (slot.spent || []).includes(name);

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
    return unitsOn(state, slot, def, holder, defs);
  });
}

/** What one Energy card gives on this Pokémon: a Special Energy may give more on some ("on a Basic Pokémon, every type"). */
function unitsOn(state, slot, def, holder, defs) {
  const owner = ownerOf(state, slot);
  const behind = owner >= 0 && prizesLeft(state.players[owner]) > prizesLeft(state.players[other(owner)]);
  // Multi Energy beside another Special Energy: Colorless only (itself is one of those counted).
  if (def.special?.crowd && slot.energy.filter((uid) => defOf(state, uid, defs)?.special).length > 1) return ["Colorless"];
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
export function addCondition(state, slot, kind, defs = null, { counters = 0 } = {}) {
  if (!slot || !CONDITIONS.includes(kind)) return false;
  // An Ability can keep some or all of them off, and so does a Trainer played as a Pokémon ("can't be affected by any Special Conditions").
  const immune = defs ? [...(toolOf(state, slot, defs).immune || []), ...(defOf(state, slot.uid, defs)?.fossil?.immune || [])] : [];
  if (immune.includes("all") || immune.includes(kind)) return false;
  const st = (slot.status ||= { ...NO_STATUS });
  if (kind === "poisoned") {
    // "Put 2 damage counters instead of 1 on that Pokémon between turns": the newest Poison is the one that counts.
    const was = st.poisoned && (st.poisonN || 10);
    st.poisoned = true;
    if (counters) st.poisonN = counters;
    else delete st.poisonN;
    return was !== (st.poisonN || 10);
  } else if (kind === "burned") {
    if (st[kind]) return false;
    st[kind] = true;
  } else {
    st.main = kind;
    st.since = state.turn;
    if (kind === "confused" && counters) st.confuseN = counters;
    else delete st.confuseN;
    // Asleep's `counters` is how many coins wake it (all of them heads).
    if (kind === "asleep" && counters) st.sleepN = counters;
    else delete st.sleepN;
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
     noRetreat can't retreat           mustFlip  flips to attack; tails, nothing happens
     stronger  its attacks (or attack `name`) do n more, before Weakness and Resistance
     weaker    its attacks do n less, before Weakness and Resistance
     exposed   takes n more from attacks, after Weakness and Resistance
     harden    takes no damage from an attack that would do n or less
     noWeakness has no Weakness     spite     n damage counters on whatever attack damages it
     bounty    n more Prize cards if this turn's attack damage Knocks it Out
     noHeal    can't be healed         doom      n damage counters on it at the end of that turn
     doomCond  the Special Condition `name` at the end of that turn, if it is still Active
     costMore  its attacks cost n Colorless more     retreatMore its Retreat Cost is n Colorless more
     ward      takes no effects from attacks (their damage still lands)
     dodge     a coin flip for each attack's damage: heads, none of it lands
     endure    an attack's damage that would Knock it Out leaves it n HP instead
     spite     `mirror`: as many damage counters as the damage done, not n
   A guard (and a less mark) may say `from`: only attacks from "basic", "evolution" or "basicNonColorless" Pokémon
   ("box:GX,EX": with those rule boxes; "tag:TAG TEAM": a kind the card prints).
   A noUse mark with `until` holds until the Pokémon leaves the Active Spot; `slot.spent` names attacks it can't
   use again for as long as it stays in play (cleared when it evolves or devolves). */

/** A slot's mark of this kind that is in force this turn. */
export const markOn = (state, slot, kind) => (slot?.marks || []).find((m) => m.kind === kind && m.turn === state.turn) || null;

/** How much damage can be healed from this Pokémon now: none while "it can't be healed" holds (a noHeal mark). */
export const healRoom = (state, slot) => (markOn(state, slot, "noHeal") ? 0 : slot.damage);

/** Marks in force now or waiting for their turn, for the screen. */
export const marksOn = (state, slot) => (slot?.marks || []).filter((m) => m.turn >= state.turn);

/** The n of a slot's marks of this kind in force this turn, added up; `name`: only those for every attack or for that one. */
const markSum = (state, slot, kind, name = "") => (slot?.marks || []).filter((m) => m.kind === kind && m.turn === state.turn && (!m.name || m.name === name)).reduce((n, m) => n + (m.n || 0), 0);

/** A guard mark that stops this attacker's damage: some guard only against Basic or Evolution Pokémon. */
const GUARD_FROM = { basic: (d) => d.stage === "basic", evolution: (d) => d.stage === "evolution", basicNonColorless: (d) => d.stage === "basic" && !d.types.includes("Colorless"), ability: (d) => d.abilityKind === "Ability" };
/** Does a mark's `from` ("box:GX,EX", "tag:TAG TEAM", or a GUARD_FROM key) take in this attacker? */
const fromFits = (from, def) => !from || (def ? (from.startsWith("box:") ? from.slice(4).split(",").includes(def.box) : from.startsWith("tag:") ? (def.tags || []).includes(from.slice(4)) : GUARD_FROM[from](def)) : false);
/** A shield an earlier attack left in force against this attacker ("by your opponent's Pokémon-ex": only some). */
export const shieldOn = (state, slot, attackerDef) => (slot?.marks || []).some((m) => m.kind === "shield" && m.turn === state.turn && fromFits(m.from, attackerDef));
// "box:GX,EX": only against Pokémon with those rule boxes ("by attacks from Pokémon-GX and Pokémon-EX").
const guardedFrom = (state, slot, attackerDef) => (slot?.marks || []).some((m) => m.kind === "guard" && m.turn === state.turn && (!m.from || (m.from.startsWith("box:") ? m.from.slice(4).split(",").includes(attackerDef.box) : m.from.startsWith("tag:") ? (attackerDef.tags || []).includes(m.from.slice(4)) : GUARD_FROM[m.from](attackerDef))));

/**
 * Damage from an attack landed on this Pokémon: `hit` the turn (cleared before the checkup), and kept past it
 * for "if this Pokémon was damaged by an attack during your opponent's last turn" (`struckOn`) and "that much
 * more damage" (`struckFor`, all the damage attacks did to it that turn).
 */
export function struck(state, slot, n) {
  slot.hit = state.turn;
  slot.struckFor = (slot.struckOn === state.turn ? slot.struckFor || 0 : 0) + n;
  slot.struckOn = state.turn;
}

export function addMark(state, slot, mark) {
  slot.marks = (slot.marks || []).filter((m) => m.turn >= state.turn && !(m.kind === mark.kind && m.turn === mark.turn && m.name === mark.name));
  slot.marks.push(mark);
}

const stuck = (slot) => ["asleep", "paralyzed"].includes(statusOf(slot).main);
/** Asleep or Paralyzed keeps this attack from being used ("This attack can be used even if this Pokémon is Asleep": an asleepOk step). */
const stuckAttack = (slot, attack) => stuck(slot) && !(statusOf(slot).main === "asleep" && (attack?.fx || []).some((step) => step.op === "asleepOk"));

/** Between turns: Poison, Burn, Sleep and Paralysis take their turn on both Active Pokémon. */
function checkup(state, defs, events) {
  const ended = state.current;
  // What happens now isn't "damage from an attack" any more.
  for (const p of [0, 1]) for (const [slot] of inPlay(state, p)) delete slot.hit;
  // Berries work "at any time between turns": before Poison and Burn land when they can, else after.
  berries(state, defs, events);
  for (const p of [ended, other(ended)]) {
    const slot = state.players[p].active;
    const st = slot?.status;
    if (!st) continue;
    if (st.poisoned) {
      slot.damage += st.poisonN || 10;
      events.push({ t: "damage", p, spot: ACTIVE, n: st.poisonN || 10, why: "poisoned" });
    }
    if (st.burned) {
      slot.damage += 20;
      events.push({ t: "damage", p, spot: ACTIVE, n: 20, why: "burned" });
      if (flip(state, -1)) {
        st.burned = false;
        events.push({ t: "cure", p, kind: "burned" });
      }
    }
    // `sleepN`: "Your opponent flips 2 coins instead of 1. If either of them is tails, that Pokémon is still Asleep."
    if (st.main === "asleep" && Array.from({ length: st.sleepN || 1 }, () => flip(state, -1)).every(Boolean)) {
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
      const healed = Math.min(mend, healRoom(state, slot));
      if (!healed) continue;
      slot.damage -= healed;
      slot.healedOn = state.turn;
      events.push({ t: "heal", p, spot, n: healed, why: "ability" });
    }
  }
  berries(state, defs, events);
}

/** Tools used up between turns (Oran Berry, Lum Berry): each does its job once, if there is one, and is discarded. */
function berries(state, defs, events) {
  for (const p of [state.current, other(state.current)]) {
    for (const [slot, spot] of inPlay(state, p)) {
      const between = toolOn(state, slot, defs)?.between;
      if (!between || hpLeft(state, slot, defs) <= 0) continue;
      if (between.heal && healRoom(state, slot) >= between.heal) {
        slot.damage -= between.heal;
        slot.healedOn = state.turn;
        events.push({ t: "heal", p, spot, n: between.heal, why: "tool" });
      } else if (between.cure && conditionsOn(slot).length) {
        for (const kind of conditionsOn(slot)) events.push({ t: "cure", p, spot, kind });
        delete slot.status;
      } else continue;
      dropTool(state, p, spot, slot, defs, events);
    }
  }
}

/** The end of the turn, before the checkup: Tools that work then (Amulet Coin, Leftovers), and Tools that lapse. */
function endOfTurn(state, defs, events) {
  const p = state.current;
  const front = state.players[p].active;
  const end = toolOn(state, front, defs)?.endTurn;
  if (end?.draw) draw(state, p, end.draw, events);
  if (end?.heal && healRoom(state, front)) {
    const healed = Math.min(end.heal, healRoom(state, front));
    front.damage -= healed;
    front.healedOn = state.turn;
    events.push({ t: "heal", p, spot: ACTIVE, n: healed, why: "tool" });
  }
  for (const q of [0, 1]) {
    for (const [slot, spot] of inPlay(state, q)) {
      // "At the end of your opponent's next turn, put 6 damage counters on the Defending Pokémon."
      const doom = markOn(state, slot, "doom");
      // "doomKo": "At the end of your opponent's next turn, the Defending Pokémon will be Knocked Out."
      if (markOn(state, slot, "doomKo")) slot.damage = Math.max(slot.damage, maxHp(state, slot, defs));
      if (doom) {
        slot.damage += doom.n;
        events.push({ t: "damage", p: q, spot, n: doom.n, why: "doom" });
      }
      // "At the end of your opponent's next turn, the Defending Pokémon is now Asleep."
      const later = markOn(state, slot, "doomCond");
      if (later && spot === ACTIVE && addCondition(state, slot, later.name, defs)) events.push({ t: "condition", p: q, kind: later.name });
      const lapse = slot.tool && defOf(state, slot.tool, defs)?.tool?.lapse;
      // Strength Charm: the turn it attacked. Buffer Piece: the opponent's turn after it was played.
      if ((lapse === "attack" && slot.toolSpent === state.turn) || (lapse === "foe" && q !== p && slot.toolOn < state.turn)) dropTool(state, q, spot, slot, defs, events);
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
  // "If this Pokémon evolved during this turn" (effects.js TESTS.evolvedNow).
  slot.evolvedOn = state.turn;
  delete slot.asBasic;
  delete slot.spent;
  clearConditions(slot);
  events.push({ t: "evolve", p: player, uid, spot, ...(from !== "hand" ? { from } : {}) });
  // A Tool that may not stay on what it became (Protective Orb on a Pokémon-ex) is discarded.
  const tool = slot.tool && defOf(state, slot.tool, defs)?.tool;
  if (tool?.only?.drop && !toolFits(tool, defOf(state, uid, defs))) dropTool(state, player, spot, slot, defs, events);
  // Viridian City Gym: a Pokémon with Giovanni in its name that evolves sheds 2 damage counters.
  const mend = state.stadium && defOf(state, state.stadium.uid, defs)?.stadium?.evolveHeal;
  if (mend && healRoom(state, slot) && fieldFits(mend.who, defOf(state, uid, defs))) {
    const healed = Math.min(mend.n, healRoom(state, slot));
    slot.damage -= healed;
    slot.healedOn = state.turn;
    events.push({ t: "heal", p: player, spot, n: healed, why: "stadium" });
  }
  offerAbility(state, player, spot, "evolve", defs);
  if (defOf(state, uid, defs)?.megaEnds && state.phase === "main" && state.current === player) state.ending = true;
}

/** How much of a Retreat Cost this Energy card pays (Double Colorless Energy: 2). */
const payUnits = (state, slot, uid, defs) => unitsOn(state, slot, defOf(state, uid, defs), defOf(state, slot.uid, defs), defs).length || 1;
/**
 * The Energy a retreat may be paid with, when the player has a real choice (the cards differ and some can stay):
 * { uids, min, max } in cards, the largest first (so the first `min` of them pay it), or null.
 */
function retreatChoice(state, slot, cost, defs) {
  if (cost <= 0 || energyAlike(state, slot.energy, defs)) return null;
  const units = new Map(slot.energy.map((uid) => [uid, payUnits(state, slot, uid, defs)]));
  const total = [...units.values()].reduce((a, b) => a + b, 0);
  if (total - Math.min(...units.values()) < cost) return null;
  const uids = slot.energy.slice().sort((a, b) => units.get(b) - units.get(a));
  const reach = (list) => list.reduce((n, uid, i) => (n.sum >= cost ? n : { sum: n.sum + units.get(uid), k: i + 1 }), { sum: 0, k: 0 }).k;
  return { uids, min: reach(uids), max: reach(uids.slice().reverse()) };
}

/** Can this Active Pokémon retreat while Asleep or Paralyzed? (Escape Board.) */
const stuckFor = (state, slot, defs) => stuck(slot) && !toolOn(state, slot, defs)?.escape;
/** Balloon Berry: a retreat discards it in place of the Energy, so the Energy on it doesn't matter. */
const balloonOn = (state, slot, defs) => Boolean(toolOn(state, slot, defs)?.balloon) && retreatCost(state, slot, defs) > 0;

/** The attacks the Active Pokémon can pay for right now, by index. */
/**
 * Every attack this Pokémon may use: its own, then the ones lent to it, each carrying `lent` { card, index, from }
 * (the card it is printed on and where): a Technical Machine held on it ("That Pokémon may use this card's attack
 * instead of its own"), the Stadium in play (Holon Lake: Pokémon with δ on their card), and Meteor Falls' attacks of
 * the Basic Pokémon and Stage 1 card under an Active Evolved Pokémon. Attack actions index into this list.
 */
export function attacksOf(state, slot, defs) {
  const def = defOf(state, slot.uid, defs);
  const out = [];
  const lend = (card, from) => (defs(card)?.attacks || []).forEach((attack, index) => out.push({ ...attack, lent: { card, index, from } }));
  for (const h of slot.held || []) if (h.tm) lend(state.cards[h.uid], "tm");
  const owner = ownerOf(state, slot);
  const lent = state.stadium && defOf(state, state.stadium.uid, defs)?.stadium?.lend;
  if (lent?.who && fieldFits(lent.who, def)) lend(state.cards[state.stadium.uid], "stadium");
  // Meteor Falls: "Each player's Active Evolved Pokémon (excluding Pokémon-ex) can use any attack from its Basic Pokémon or its Stage 1 Evolution card."
  if (lent?.under && owner >= 0 && state.players[owner].active === slot && def.stage === "evolution" && def.box !== "ex") {
    for (const uid of slot.under) {
      const below = defOf(state, uid, defs);
      if (below?.kind === "pokemon" && (below.stage === "basic" || below.line === 1)) lend(state.cards[uid], "under");
    }
  }
  return out.length ? [...def.attacks, ...out] : def.attacks;
}

export function usableAttacks(state, player, defs) {
  const slot = state.players[player].active;
  if (!slot || state.phase !== "main" || state.current !== player || state.pending.length) return [];
  if (markOn(state, slot, "noAttack")) return [];
  const def = defOf(state, slot.uid, defs);
  const side = state.players[player];
  const spent = (attack) => (attack.once === "gx" && (side.gxUsed || side.gxBarred)) || (attack.once === "vstar" && side.vstarUsed);
  return attacksOf(state, slot, defs).map((attack, index) => (!stuckAttack(slot, attack) && canPay(state, slot, costFor(state, slot, attack, defs), defs) && !barredAttack(state, slot, attack.name) && !spent(attack) && !tooEarly(state, player, attack, defs) ? index : -1)).filter((i) => i >= 0);
}

/**
 * The first turns: the player who goes first can't attack on turn 1, unless the attack says "If you go first, you can
 * use this attack on your first turn"; "If you go second, you can't use this attack during your first turn" (turn 2).
 * Why it can't be used yet, or "".
 */
function tooEarly(state, player, attack, defs) {
  const says = (op) => (attack.fx || []).some((step) => step.op === op);
  if (state.turn === 1 && !says("firstTurn")) return "The player who goes first can't attack on the first turn.";
  if (state.turn === 2 && player !== state.first && says("notSecondFirst")) return "If you go second, you can't use this attack during your first turn.";
  // "You can use this attack only if ...", "You can't use this attack if your Bench is full" (effects.js OPS.onlyIf).
  return attackBlock(state, player, attack, defs);
}

export function canRetreat(state, player, defs) {
  const side = state.players[player];
  if (!side.active || side.retreated || !side.bench.length || stuckFor(state, side.active, defs) || markOn(state, side.active, "noRetreat") || defOf(state, side.active.uid, defs).fossil?.noRetreat) return false;
  return balloonOn(state, side.active, defs) || energyOf(state, side.active, defs).length >= retreatCost(state, side.active, defs);
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
export function createGame({ decks, names = ["You", "Opponent"], format = "standard", seed = 1, chooseFirst = false }, defs) {
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
  state.first = flip(state, -1) ? 0 : 1;
  state.flipWinner = state.first;
  events.push({ t: "first", p: state.first });
  // The rules have the flip winner choose before anyone draws (rulebook, setup steps 2-4), so a
  // match that asks them (`chooseFirst`) deals only once "order" is answered.
  if (chooseFirst) {
    state.dealt = false;
    return state;
  }
  deal(state, defs);
  return state;
}

/** Shuffle and draw the opening hands, with a mulligan for every hand that has no Basic Pokémon. */
function deal(state, defs) {
  const events = state.opening;
  state.dealt = true;
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
}

/* ---------- the turn ---------- */

export function win(state, winner, reason, events) {
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
  // The Trainers played from the hand this turn ("If you played Cynthia from your hand during this turn").
  side.played = [];
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
    endOfTurn(state, defs, events);
    checkup(state, defs, events);
    resolveKnockOuts(state, defs, events, { between: true });
    if (state.phase !== "main" || state.pending.length) return;
  }
  startTurn(state, events);
}

function discardSlot(state, player, slot, defs) {
  state.players[player].discard.push(slot.uid, ...slot.under, ...slot.energy, ...heldOn(slot));
  if (slot.tool) toolGone(state, player, slot.tool, defs);
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
  // A Tool that works as its Pokémon is Knocked Out by an attack (Rescue Scarf, Energy Pouch, Lucky Egg ...).
  const koTool = (slot, spot, p) => {
    const ko = toolOn(state, slot, defs)?.ko;
    return ko && byAttack(slot, p) && (!ko.active || spot === ACTIVE) ? ko : null;
  };
  // Damage counters on the Attacking Pokémon land first, so a Knock Out they cause is judged with this one.
  for (const p of [0, 1]) {
    for (const [slot, spot] of inPlay(state, p)) {
      const ability = falling(slot) ? koPower(slot, spot, p) : null;
      const attacker = state.players[other(p)].active;
      if (!ability?.ko.counters || !attacker || warded(state, attacker, { player: p, src: "ability" }, defs)) continue;
      events.push({ t: "ability", p, spot, uid: slot.uid, name: ability.name });
      let n = ability.ko.counters;
      if (ability.ko.untilTails) {
        const results = [];
        do results.push(flip(state, p));
        while (results[results.length - 1] && results.length < 60);
        events.push({ t: "flip", p, results, why: "ability", name: ability.name });
        n *= results.filter(Boolean).length;
      }
      if (!n) continue;
      attacker.damage += n;
      events.push({ t: "damage", p: other(p), spot: ACTIVE, n, why: "ability" });
    }
  }
  const after = [];
  // Energy the Knocked Out Active Pokémon leaves behind for Exp. Share and Wishful Baton: [p, uids, baton n].
  const left = [];
  for (const p of [0, 1]) {
    const side = state.players[p];
    for (const [slot, spot] of inPlay(state, p)) {
      const def = defOf(state, slot.uid, defs);
      if (!falling(slot)) continue;
      const ability = koPower(slot, spot, p);
      const tool = toolOn(state, slot, defs);
      const ko = koTool(slot, spot, p);
      // Rescue Scarf: "Knocked Out by damage from an attack", anyone's attack, this turn.
      const rescued = ko?.toHand || (tool?.ko?.any && tool.ko.toHand && slot.hit === state.turn && !between);
      const basics = slot.energy.filter((uid) => defOf(state, uid, defs).basic);
      events.push({ t: "ko", p, spot, uid: slot.uid });
      if (ability?.ko.toHand || rescued) {
        // "Put it into your hand instead of the discard pile. (Discard all attached cards.)"
        events.push(ability?.ko.toHand ? { t: "ability", p, spot, uid: slot.uid, name: ability.name } : { t: "tool-effect", p, spot, uid: slot.tool });
        side.hand.push(slot.uid);
        side.discard.push(...slot.under, ...slot.energy, ...heldOn(slot));
        if (slot.tool) toolGone(state, p, slot.tool, defs);
        events.push({ t: "ko-hand", p, uid: slot.uid });
      } else if (ko?.energyToHand && basics.length) {
        // Energy Pouch: the basic Energy goes to the hand, the rest to the discard pile.
        events.push({ t: "tool-effect", p, spot, uid: slot.tool });
        side.hand.push(...basics);
        side.discard.push(slot.uid, ...slot.under, ...slot.energy.filter((uid) => !basics.includes(uid)));
        if (slot.tool) toolGone(state, p, slot.tool, defs);
        events.push({ t: "energy-to-hand", p, spot, uids: basics });
      } else if (byAttack(slot, p) && markOn(state, slot, "lostKo")) {
        // "If it is Knocked Out by damage from this attack, put it and all cards attached to it in the Lost Zone instead."
        toLost(state, p, [slot.uid, ...slot.under, ...slot.energy, ...(slot.tool ? [slot.tool] : []), ...heldOn(slot)], events);
      } else discardSlot(state, p, slot, defs);
      if (ability?.ko.steps) after.push([p, spot, slot.uid, ability.name, ability.ko.steps]);
      if (ko?.steps) after.push([p, spot, slot.uid, defOf(state, slot.tool, defs).name, ko.steps]);
      // A Fossil whose Knock Out "doesn't count as a Knocked Out Pokémon" is only discarded: no Prize card, nothing that asks about a Knock Out.
      const counts = !def.fossil?.noKo;
      if (spot === ACTIVE && byAttack(slot, p) && basics.length && counts) left.push([p, basics, ko?.baton || 0]);
      if (spot === ACTIVE) side.active = null;
      else side.bench[spot] = null;
      // Expert Belt: one more Prize card.
      // "If your opponent's Pokémon is Knocked Out by damage from this attack, take 1 more Prize card."
      if (!def.fossil?.noPrize) took[other(p)] += (def.prizes ?? 1) + (tool?.prize || 0) + (byAttack(slot, p) ? markOn(state, slot, "bounty")?.n || 0 : 0);
      if (!counts) continue;
      // Remembered by turn for "if any of your Pokémon were Knocked Out during your opponent's last turn"
      // (the checkup between turns is no one's turn).
      if (state.current === other(p) && !between) side.lostOn = [...new Set([...(side.lostOn || []).filter((t) => t >= state.turn - 1), state.turn])];
      // And for "Knocked Out by damage from an attack" (not damage counters, not the checkup): `downedOn`.
      // `downed` keeps which card it was, for "if any of your Fighting Pokémon were Knocked Out ...".
      if (byAttack(slot, p)) side.downed = [...(side.downed || []).filter((d) => d.turn >= state.turn - 1), { turn: state.turn, uid: slot.uid }];
    }
    side.bench = side.bench.filter(Boolean);
  }
  for (const p of [0, 1]) {
    if (!took[p]) continue;
    const side = state.players[p];
    const prizes = side.prizes.splice(0, took[p]);
    side.hand.push(...prizes);
    // Kept for "for each Prize card your opponent took during their last turn" (js/tcg/effects.js COUNTS.foeTookLast).
    side.taken = [...(side.taken || []).filter((t) => t.turn >= state.turn - 2), { turn: state.turn, n: prizes.length }];
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
  // What a Knocked Out Pokémon's Ability or Tool does as it goes (a search, cards off their deck or hand).
  for (const [p, spot, uid, name, steps] of after) {
    const ctx = { state, defs, events, player: p, src: "ability" };
    if (!trainerReady(steps, ctx)) continue;
    events.push({ t: "ability", p, spot, uid, name });
    runTrainer(steps, ctx);
  }
  // The basic Energy it left in the discard pile: Wishful Baton moves up to n to 1 Benched Pokémon,
  // each Exp. Share on the Bench may take 1. Asked before a new Active Pokémon is chosen.
  for (const [p, uids, baton] of left) {
    const side = state.players[p];
    if (!side.bench.length) continue;
    if (baton) askChoose(state, { player: p, zone: "discard", what: "basicEnergy", uids, min: 0, max: baton, effect: { op: "baton" } });
    for (const [mate] of inPlay(state, p)) {
      if (toolOn(state, mate, defs)?.share) askChoose(state, { player: p, zone: "discard", what: "basicEnergy", uids, min: 0, max: toolOn(state, mate, defs).share, effect: { op: "share", to: mate.uid } });
    }
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

/**
 * A Basic Pokémon was just put onto its owner's Bench during their turn (`fromHand`: played from
 * the hand): Risky Ruins and Team Magma's Hideout put damage counters on it. True when any landed.
 */
function benched(state, player, slot, defs, events, fromHand = false) {
  const hurt = state.stadium && defOf(state, state.stadium.uid, defs)?.stadium?.benchHurt;
  const def = playedAs(state, slot, defs);
  if (!hurt || state.current !== player || def.stage !== "basic" || (hurt.fromHand && !fromHand) || !fieldFits(hurt.who, def)) return false;
  slot.damage += hurt.n;
  events.push({ t: "damage", p: player, spot: state.players[player].bench.indexOf(slot), n: hurt.n, why: "stadium" });
  return true;
}

/**
 * An attack's damage to the other Active Pokémon (the one there now: a step before it may have switched it),
 * then the steps after it. ctx is the attack's (js/tcg/effects.js): { state, defs, events, player, slot, attack, hit }.
 */
export function strike(ctx) {
  const { state, defs, events, player, slot, attack, hit } = ctx;
  const def = defOf(state, slot.uid, defs);
  const foe = other(player);
  const target = state.players[foe].active;
  ctx.target = target;
  // What an earlier attack left on the target: less damage, or none at all.
  const marked = Boolean(target && !hit.noEffects && shieldOn(state, target, def));
  // An Ability that keeps off every effect of attacks except damage counts as a shield for the effects.
  ctx.shielded = marked || Boolean(target && !hit.noEffects && (abilityOn(state, target, defs)?.noEffects || markOn(state, target, "ward")));
  if (!hit.cancelled && target) {
    // Tools: the attacker's adds damage before Weakness, the target's can lift its Weakness or soak some.
    const mine = toolOf(state, slot, defs);
    const theirs = toolOf(state, target, defs);
    // Its own marks too, before Weakness: more from its last turn ("Echoed Voice does 50 more"), less from the other's ("Growl").
    const prey = (target.marks || []).filter((m) => m.kind === "prey" && m.turn === state.turn && m.from === slot.uid).reduce((n, m) => n + m.n, 0);
    const base = hit.damage > 0 ? Math.max(0, hit.damage + (mine.plus || 0) + heldSum(slot, "plus") + boostOf(state, player, slot, target, defs) + markSum(state, slot, "stronger", attack.name) + prey - markSum(state, slot, "weaker")) : hit.damage;
    // Old Gyms: Brock's Pokémon ignore Resistance; a Water attacker ignores Blaine's Pokémon's Weakness.
    const noWeakness = hit.noWeakness || Boolean(theirs.noWeakness) || (theirs.noWeaknessVs || []).some((t) => def.types.includes(t)) || (!hit.noEffects && Boolean(markOn(state, target, "noWeakness")));
    const dealt = damageAfterTyping(base, def, defOf(state, target.uid, defs), { ...hit, noWeakness, noResistance: hit.noResistance || Boolean(theirs.noResistance) || Boolean(mine.pierce) });
    // Old PlusPower and Misty: more only when the attack does damage after Weakness and Resistance.
    if (dealt.amount > 0) dealt.amount += (hit.surge || 0) + heldSum(slot, "after") + boostOf(state, player, slot, target, defs, true) + (hit.noEffects ? 0 : markSum(state, target, "exposed"));
    // A less mark may hold against some attackers only (`from`, as a guard's: "from Evolution Pokémon").
    const lessMark = hit.noEffects ? null : markOn(state, target, "less");
    const less = (lessMark && (!lessMark.from || GUARD_FROM[lessMark.from](def)) ? lessMark.n || 0 : 0) + (theirs.less || 0) + (hit.noEffects ? 0 : heldSum(target, "less"));
    let guarded = marked || (!hit.noEffects && guardedFrom(state, target, def));
    // The target's Ability: no damage from this kind of attacker, or a coin flip to take none.
    const power = hit.noEffects ? null : abilityOn(state, target, defs);
    if (!guarded && dealt.amount > 0 && power?.wall && walled(power.wall, def, state, slot, defs)) guarded = true;
    if (!guarded && dealt.amount - less > 0 && power?.dodge) {
      const heads = flip(state, foe);
      events.push({ t: "flip", p: foe, results: [heads], why: "ability", name: power.name });
      guarded = heads;
    }
    // "If any damage is done to this Pokémon by attacks during your opponent's next turn, flip a coin. If heads, prevent that damage."
    if (!guarded && dealt.amount - less > 0 && !hit.noEffects && markOn(state, target, "dodge")) {
      const heads = flip(state, foe);
      events.push({ t: "flip", p: foe, results: [heads], why: "mark" });
      guarded = heads;
    }
    let amount = guarded ? 0 : Math.max(0, dealt.amount - less);
    // Armor Stone: coins until tails, less damage for each heads.
    if (amount > 0 && power?.soften) {
      const results = [];
      do results.push(flip(state, foe));
      while (results[results.length - 1] && results.length < 60);
      events.push({ t: "flip", p: foe, results, why: "ability", name: power.name });
      amount = Math.max(0, amount - power.soften * results.filter(Boolean).length);
    }
    // "Prevent that attack's damage if that damage is 30 or less": judged on what would land.
    const harden = !hit.noEffects && markOn(state, target, "harden");
    if (harden && amount <= harden.n) amount = 0;
    // "If it would be Knocked Out by damage from an attack, it is not Knocked Out, and its remaining HP becomes 10."
    const endure = !hit.noEffects && markOn(state, target, "endure");
    if (endure && amount > 0 && amount >= hpLeft(state, target, defs)) {
      amount = Math.max(0, hpLeft(state, target, defs) - endure.n);
      events.push({ t: "mark", p: foe, kind: "endure" });
    }
    // From full HP it hangs on instead of being Knocked Out.
    if (power?.sturdy && target.damage === 0 && amount >= maxHp(state, target, defs) && maxHp(state, target, defs) > power.sturdy) {
      amount = maxHp(state, target, defs) - power.sturdy;
      events.push({ t: "ability", p: foe, spot: ACTIVE, uid: target.uid, name: power.name });
    }
    // Or a coin flip decides it, from any HP.
    if (power?.hangOn && amount > 0 && amount >= hpLeft(state, target, defs) && hpLeft(state, target, defs) > power.hangOn) {
      const heads = flip(state, foe);
      events.push({ t: "flip", p: foe, results: [heads], why: "ability", name: power.name });
      if (heads) {
        amount = hpLeft(state, target, defs) - power.hangOn;
        events.push({ t: "ability", p: foe, spot: ACTIVE, uid: target.uid, name: power.name });
      }
    }
    if (amount > 0) {
      target.damage += amount;
      struck(state, target, amount);
      hit.dealt = amount;
      events.push({ t: "damage", p: foe, spot: ACTIVE, n: amount, weak: dealt.weak, resist: dealt.resist });
      // Koga: "If an attack from a Pokémon with Koga in its name does damage to a Defending Pokémon this turn, that Pokémon is then Poisoned."
      if ((state.boosts || []).some((b) => b.poison && b.p === player && b.turn === state.turn && fieldFits(b.who || {}, def)) && addCondition(state, target, "poisoned", defs)) events.push({ t: "condition", p: foe, kind: "poisoned" });
      // "If this Pokémon is damaged by an attack (even if it is Knocked Out), put 3 damage counters on the Attacking Pokémon."
      const spite = markOn(state, target, "spite");
      // `mirror`: "put damage counters on the Attacking Pokémon equal to the damage done to this Pokémon".
      if (spite) {
        const n = spite.mirror ? amount : spite.n;
        slot.damage += n;
        events.push({ t: "damage", p: player, spot: ACTIVE, n, self: true, why: "mark" });
      }
      // Damaged in the Active Spot, it hits back, even when this Knocks it Out.
      const thorns = abilityOn(state, target, defs)?.thorns;
      if (thorns) {
        events.push({ t: "ability", p: foe, spot: ACTIVE, uid: target.uid, name: defOf(state, target.uid, defs).ability.name });
        if (thorns.n) {
          slot.damage += thorns.n;
          events.push({ t: "damage", p: player, spot: ACTIVE, n: thorns.n, self: true, why: "ability" });
        } else if (addCondition(state, slot, thorns.status, defs)) events.push({ t: "condition", p: player, kind: thorns.status });
      }
      // Its Tool too: Rocky Helmet's damage counters, Lucky Helmet's cards, Counterattack Claws' coin flip.
      const spikes = toolOn(state, target, defs)?.thorns;
      if (spikes) {
        events.push({ t: "tool-effect", p: foe, spot: ACTIVE, uid: target.tool });
        const heads = spikes.flip ? flip(state, foe) : true;
        if (spikes.flip) events.push({ t: "flip", p: foe, results: [heads], why: "tool" });
        if (spikes.n && heads) {
          slot.damage += spikes.n;
          events.push({ t: "damage", p: player, spot: ACTIVE, n: spikes.n, self: true, why: "tool" });
        }
        if (spikes.draw) draw(state, foe, spikes.draw, events);
        if (spikes.spent) dropTool(state, foe, ACTIVE, target, defs, events);
      }
    } else if (dealt.amount > 0) {
      events.push({ t: "blocked", p: foe });
    }
  }
  if (!hit.cancelled) runAttackEffects("after", attack, ctx);
  // Vermilion City Gym's tails: damage to itself besides what the attack does.
  if (hit.recoil) {
    slot.damage += hit.recoil;
    events.push({ t: "damage", p: player, spot: ACTIVE, n: hit.recoil, self: true, why: "stadium" });
  }
  state.ending = true;
  // An effect that needs a choice (which Benched Pokémon?) waits for it; Knock Outs are judged after.
  if (!state.pending.length) resolveKnockOuts(state, defs, events);
}

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
    if (handLock(state, player, defOf(state, uid, defs))) fail(handLock(state, player, defOf(state, uid, defs)));
    takeFromHand(state, player, uid);
    const slot = newSlot(state, uid);
    side.bench.push(slot);
    events.push({ t: "bench", p: player, uid, spot: side.bench.length - 1 });
    if (benched(state, player, slot, defs, events, true)) resolveKnockOuts(state, defs, events);
    if (side.bench.includes(slot)) offerAbility(state, player, side.bench.indexOf(slot), "bench", defs);
  },

  evolve(state, { player, uid, spot }, defs, events) {
    const side = state.players[player];
    if (!side.hand.includes(uid)) fail("That card isn't in your hand.");
    const slot = slotAt(state, player, spot);
    if (!slot) fail("There's no Pokémon there.");
    const def = defOf(state, uid, defs);
    if (handLock(state, player, def)) fail(handLock(state, player, def));
    // "Your opponent can't play any Pokémon from his or her hand to evolve the Defending Pokémon during his or her next turn."
    if (markOn(state, slot, "noEvolve")) fail("That Pokémon can't be evolved from your hand this turn.");
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
    if (def.fossil) {
      // "Play it as if it were a Basic Pokémon": onto the Bench, a Pokémon while it is in play.
      side.played = [...(side.played || []), uid];
      const slot = newSlot(state, uid);
      side.bench.push(slot);
      events.push({ t: "bench", p: player, uid, spot: side.bench.length - 1 });
      if (benched(state, player, slot, defs, events, true)) resolveKnockOuts(state, defs, events);
      return;
    }
    if (def.sub === "stadium") {
      // It stays in play for both players; the one it replaces goes to its owner's discard pile.
      if (state.stadium) state.players[state.stadium.owner].discard.push(state.stadium.uid);
      state.stadium = { uid, owner: player };
      side.stadiumPlayed = true;
      events.push({ t: "stadium", p: player, uid });
      // "Darkness Pokémon can't be Asleep, Confused, or Paralyzed" (Sidney's Stadium): those it has now go.
      for (const p of [0, 1]) {
        for (const [slot, at] of inPlay(state, p)) {
          const kind = statusOf(slot).main;
          if (!kind || !(toolOf(state, slot, defs).immune || []).some((k) => k === "all" || k === kind)) continue;
          slot.status.main = "";
          events.push({ t: "cure", p, spot: at, kind });
        }
      }
      // HP a Stadium gave is gone with it: anything left with none is Knocked Out.
      resolveKnockOuts(state, defs, events);
      return;
    }
    side.discard.push(uid);
    if (def.sub === "supporter") side.supporterUsed = true;
    side.played = [...(side.played || []), uid];
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
    if (handLock(state, player, energy)) fail(handLock(state, player, energy));
    const slot = slotAt(state, player, spot);
    if (!slot) fail("There's no Pokémon there.");
    if (!energyFits(energy, defOf(state, slot.uid, defs))) fail(`${energy.name} can only be attached to ${onlyFor(energy.special.only)} Pokémon.`);
    // "Your opponent can't attach Energy from his or her hand to the Defending Pokémon during his or her next turn."
    if (markOn(state, slot, "noEnergy")) fail("Energy can't be attached from your hand to that Pokémon this turn.");
    takeFromHand(state, player, uid);
    slot.energy.push(uid);
    side.energyUsed = true;
    events.push({ t: "attach", p: player, uid, spot });
    // "During your opponent's next turn, if they attach an Energy card from their hand to the Defending Pokémon, their turn ends."
    if (markOn(state, slot, "attachEnds")) {
      events.push({ t: "mark", p: player, kind: "attachEnded" });
      state.ending = true;
    }
    // Healing Scarf: an Energy card from the hand heals the Pokémon it goes on.
    const scarf = toolOn(state, slot, defs)?.attachHeal;
    if (scarf && healRoom(state, slot)) {
      const healed = Math.min(scarf, healRoom(state, slot));
      slot.damage -= healed;
      slot.healedOn = state.turn;
      events.push({ t: "heal", p: player, spot, n: healed, why: "tool" });
    }
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
    if (handLock(state, player, def)) fail(handLock(state, player, def));
    const slot = slotAt(state, player, spot);
    if (!slot) fail("There's no Pokémon there.");
    if (slot.tool) fail("That Pokémon already has a Tool.");
    if (!toolFits(def.tool, playedAs(state, slot, defs))) fail(`${def.name} can't be attached to that Pokémon.`);
    takeFromHand(state, player, uid);
    slot.tool = uid;
    // When it went on, for a Tool that lapses at the end of the opponent's next turn (Buffer Piece).
    slot.toolOn = state.turn;
    events.push({ t: "tool", p: player, uid, spot });
  },

  retreat(state, { player, to, discard }, defs, events) {
    const side = state.players[player];
    if (side.retreated) fail("You've already retreated this turn.");
    const next = side.bench[to];
    if (!next) fail("Choose a Benched Pokémon to bring up.");
    const slot = side.active;
    if (stuckFor(state, slot, defs)) fail(statusOf(slot).main === "asleep" ? "An Asleep Pokémon can't retreat." : "A Paralyzed Pokémon can't retreat.");
    if (markOn(state, slot, "noRetreat")) fail("That Pokémon can't retreat this turn.");
    if (defOf(state, slot.uid, defs).fossil?.noRetreat) fail(`${defOf(state, slot.uid, defs).name} can't retreat.`);
    const cost = retreatCost(state, slot, defs);
    const gone = [];
    if (balloonOn(state, slot, defs)) {
      // Balloon Berry is discarded instead of the Energy.
      dropTool(state, player, ACTIVE, slot, defs, events);
    } else {
      if (energyOf(state, slot, defs).length < cost) fail("Not enough Energy to retreat.");
      // Which Energy pays is the retreating player's choice, when it matters: asked first, the retreat happens on the answer.
      const pay = discard?.length ? null : retreatChoice(state, slot, cost, defs);
      if (pay) return void askChoose(state, { player, zone: "play", what: "energy", ...pay, effect: { op: "retreat", to }, rule: { covers: cost } });
      // Pay with the chosen cards, or the first ones attached when none are named (all alike, or all needed).
      let paid = 0;
      const picks = (discard?.length ? discard : slot.energy).slice();
      for (const uid of picks) {
        if (paid >= cost) break;
        const at = slot.energy.indexOf(uid);
        if (at < 0) fail("That Energy isn't attached to your Active Pokémon.");
        slot.energy.splice(at, 1);
        gone.push(uid);
        paid += unitsOn(state, slot, defOf(state, uid, defs), defOf(state, slot.uid, defs), defs).length || 1;
      }
      if (paid < cost) fail("That doesn't cover the retreat cost.");
    }
    side.discard.push(...gone);
    clearConditions(slot);
    side.bench[to] = slot;
    side.active = next;
    next.upOn = state.turn;
    side.retreated = true;
    events.push({ t: "retreat", p: player, to, discarded: gone });
    offerRise(state, player, defs);
  },

  attack(state, { player, index }, defs, events) {
    const side = state.players[player];
    const slot = side.active;
    const def = defOf(state, slot.uid, defs);
    const attack = attacksOf(state, slot, defs)[index];
    if (state.turn === 1 && !attack) fail("The player who goes first can't attack on the first turn.");
    if (!attack) fail("That Pokémon has no such attack.");
    const early = tooEarly(state, player, attack, defs);
    if (early) fail(early);
    if (!canPay(state, slot, costFor(state, slot, attack, defs), defs)) fail("Not enough Energy for that attack.");
    if (stuckAttack(slot, attack)) fail(`${def.name} is ${statusOf(slot).main === "asleep" ? "Asleep" : "Paralyzed"} and can't attack.`);
    if (markOn(state, slot, "noAttack")) fail(`${def.name} can't attack this turn.`);
    if (barredAttack(state, slot, attack.name)) fail(`${def.name} can't use ${attack.name} now.`);
    if (attack.once === "gx" && side.gxUsed) fail("You've already used your GX attack this game.");
    if (attack.once === "gx" && side.gxBarred) fail("You can't use GX attacks for the rest of this game.");
    if (attack.once === "vstar" && side.vstarUsed) fail("You've already used your VSTAR Power this game.");
    // Declared is used, even if Confusion then stops it.
    if (attack.once === "gx") side.gxUsed = true;
    if (attack.once === "vstar") side.vstarUsed = true;
    const foe = other(player);
    const target = state.players[foe].active;
    events.push({ t: "attack", p: player, index, name: attack.name, uid: slot.uid });
    // Strength Charm goes at the end of a turn this Pokémon attacked in.
    if (slot.tool) slot.toolSpent = state.turn;
    // "During your next turn, this Pokémon's Slash attack's base damage is 60": a mark from its last attack.
    const based = (slot.marks || []).find((m) => m.kind === "base" && m.turn === state.turn && m.name === attack.name);
    const hit = { damage: based ? based.n : attack.damage, cancelled: false };
    // The Baby Pokémon rule: attacking an Active Baby Pokémon takes a coin flip first; tails, the turn ends without an attack.
    if (target && defOf(state, target.uid, defs).baby) {
      const heads = flip(state);
      events.push({ t: "flip", p: player, results: [heads], why: "baby" });
      if (!heads) {
        events.push({ t: "miss", p: player });
        state.ending = true;
        return;
      }
    }
    if (statusOf(slot).main === "confused") {
      // Confused: tails and the attack fails, with 30 damage to itself.
      const heads = flip(state);
      events.push({ t: "flip", p: player, results: [heads], why: "confused" });
      if (!heads) {
        // "Put 6 damage counters instead of 3 on that Pokémon for this Special Condition" (`confuseN`).
        const n = statusOf(slot).confuseN || 30;
        slot.damage += n;
        events.push({ t: "damage", p: player, spot: ACTIVE, n, self: true, why: "confused" });
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
    // The steps before the damage, then the damage itself (strike, below). A choice among the steps (which
    // Pokémon to switch in, which attack to copy) holds the damage back until it is made.
    // "If this Pokémon used Rollout during your last turn", "if 1 of your Togedemaru used Toge Dash during your last turn":
    // an attack that went ahead (not one Confusion or a coin stopped).
    // (slot.used is the Ability's once-a-turn mark: the attacks are kept apart, this turn's and the last two.)
    side.attacks = [...(side.attacks || []).filter((was) => was.turn >= state.turn - 2), { turn: state.turn, name: attack.name, who: def.name, uid: slot.uid }];
    const atk = attack.lent ? [attack.lent.card, attack.lent.index] : [def.id, index];
    // Vermilion City Gym: a Pokémon with Lt. Surge in its name that attacks may flip a coin first (its player says).
    const surge = state.stadium && defOf(state, state.stadium.uid, defs)?.stadium?.surge;
    if (surge && fieldFits(surge.who, def)) {
      const steps = [...(attack.fx || []).filter((step) => step.when === "before"), { op: "strike" }];
      const go = (list) => [{ op: "fx", steps: list, uid: slot.uid, hit, atk }];
      state.pending.push({ type: "option", player, why: "before", prompt: `${defOf(state, state.stadium.uid, defs).name}: flip a coin? Heads, ${surge.more} more damage; tails, ${surge.self} damage to ${def.name}.`, labels: ["Flip", "Don't flip"], options: [go([{ op: "surge", ...surge }, ...steps]), go(steps)] });
      return;
    }
    runAttackEffects("before", attack, { state, defs, events, player, slot, target, attack, hit, shielded: false, atk }, true);
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
      // `again`: the same Pokémon may be picked more than once ("in any way you like").
      if (!waiting.again) waiting.spots = waiting.spots.filter((x) => x !== spot);
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
    // Two Exp. Shares offer the same Energy: one already taken by the first isn't there for the second.
    const present = picked.filter((uid) => pile.includes(uid));
    for (const uid of picked) if (pile.includes(uid)) pile.splice(pile.indexOf(uid), 1);
    const { op } = waiting.effect;
    if (op === "share") {
      const hit = inPlay(state, player).find(([slot]) => slot.uid === waiting.effect.to);
      if (hit) {
        hit[0].energy.push(...present);
        for (const uid of present) events.push({ t: "attach", p: player, uid, spot: hit[1], from: "discard" });
      } else pile.push(...present);
    } else if (op === "baton") {
      // Then which Benched Pokémon takes them: asked next, ahead of anything already waiting (a new Active Pokémon).
      // They stay in the discard pile until then.
      pile.push(...present);
      if (present.length) state.pending.splice(1, 0, { type: "pick", optional: false, player, side: player, spots: side.bench.map((_, i) => i), left: 1, effect: { op: "attachHeld", uids: present, zone: "discard", left: true } });
    } else if (op === "takeBack") {
      // Saffron City Gym: a basic Energy off one of your Pokémon, back to your hand (`owner`: theirs, to their hand).
      for (const uid of picked) {
        const hit = inPlay(state, owner).find(([slot]) => slot.energy.includes(uid));
        if (!hit) continue;
        hit[0].energy.splice(hit[0].energy.indexOf(uid), 1);
        side.hand.push(uid);
        events.push({ t: "energy-to-hand", p: owner, spot: hit[1], uids: [uid] });
      }
    } else if (op === "energyToDeck") {
      energyToDeck(state, owner, picked, events);
    } else if (op === "challengeHold") {
      // Challenge!: face down until both players are done, then onto the Benches face up and both decks shuffled.
      const held = state.challenge;
      held.cards[owner] = picked;
      events.push({ t: "challenge-down", p: owner, n: picked.length });
      if (--held.wait <= 0) {
        for (const p of [held.by, 1 - held.by]) {
          const slots = held.cards[p].map((uid) => newSlot(state, uid));
          state.players[p].bench.push(...slots);
          if (slots.length) events.push({ t: "search", p, uids: held.cards[p], from: "deck", to: "bench" });
          for (const slot of slots) benched(state, p, slot, defs, events, false);
          shuffle(state, state.players[p].deck);
        }
        delete state.challenge;
      }
    } else if (op === "dropInPlay") {
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
          const lost = Boolean(waiting.effect.lost);
          if (slot.tool === uid) toolGone(state, p, uid, defs);
          else if (lost) toLost(state, p, [uid], events);
          else state.players[p].discard.push(uid);
          if (slot.tool === uid) {
            delete slot.tool;
            events.push({ t: "discard-tool", p, spot, uid });
          } else {
            slot.energy.splice(slot.energy.indexOf(uid), 1);
            events.push({ t: "discard-energy", p, spot, uids: [uid], ...(lost ? { lost } : {}) });
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
      const heal = waiting.effect.heal ? { heal: waiting.effect.heal, ...(waiting.effect.each ? { each: true } : {}) } : {};
      const spots = (waiting.effect.spots || inPlay(state, player).map(([, s]) => s)).filter((s) => slotAt(state, player, s));
      // "Attach up to 2 ... If you do": none attached, nothing after.
      if (!picked.length && waiting.effect.need) waiting.then = null;
      if (picked.length && !spots.length && waiting.effect.spot == null) pile.push(...picked);
      else if (picked.length && waiting.effect.spot != null && slotAt(state, player, waiting.effect.spot)) {
        const slot = slotAt(state, player, waiting.effect.spot);
        slot.energy.push(...picked);
        for (const uid of picked) events.push({ t: "attach", p: player, uid, spot: waiting.effect.spot, from: "deck" });
        if (heal.heal) healAt(state, player, waiting.effect.spot, heal.each ? heal.heal * picked.length : heal.heal, events);
      } else if (picked.length && to === "each") {
        // "For each of your Benched Pokémon, ... attach it to that Pokémon": a different Pokémon for each card, one pick at a time.
        askPick(state, { player, side: player, spots, left: 1, effect: { op: "attachHeld", uids: [picked[0]], chain: picked.slice(1), ...(waiting.zone !== "deck" ? { zone: waiting.zone } : {}), ...heal }, ...(waiting.then ? { then: waiting.then, from: waiting.from, ...carry(waiting) } : {}) });
        waiting.then = null;
      } else if (picked.length && to === "spread") {
        picked.forEach((uid, i) => askPick(state, { player, side: player, spots, left: 1, effect: { op: "attachHeld", uids: [uid], ...(waiting.zone !== "deck" ? { zone: waiting.zone } : {}), ...heal }, ...(i === picked.length - 1 && waiting.then ? { then: waiting.then, from: waiting.from, ...carry(waiting) } : {}) }));
        waiting.then = null;
      } else if (picked.length) {
        askPick(state, { player, side: player, spots, left: 1, effect: { op: "attachHeld", uids: picked, ...(waiting.zone !== "deck" ? { zone: waiting.zone } : {}), ...heal }, ...(waiting.then ? { then: waiting.then, from: waiting.from, ...carry(waiting) } : {}) });
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
      const slots = picked.map((uid) => ({ ...newSlot(state, uid), ...(waiting.effect.asBasic ? { asBasic: true } : {}) }));
      side.bench.push(...slots);
      events.push({ t: "search", p: owner, uids: picked, from: waiting.zone, to: "bench" });
      // Revive: half its HP in damage counters, rounded down to the nearest 10.
      if (waiting.effect.half) for (const slot of slots) slot.damage += Math.floor(defOf(state, slot.uid, defs).hp / 20) * 10;
      // Knock Outs this causes are judged below, once nothing waits.
      for (const slot of slots) benched(state, owner, slot, defs, events, waiting.zone === "hand");
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
      // Lucian's Assignment: the Energy chosen, then the Pokémon it goes to. `spots`: where the card lets it go;
      // with one place only, it goes there now (and `gather`: the next Pokémon to take from is asked).
      const fx = waiting.effect;
      const spots = fx.spots ? fx.spots.filter((s) => slotAt(state, owner, s)) : inPlay(state, owner).map(([, s]) => s).filter((s) => s !== fx.from);
      if (picked.length && fx.spots && spots.length === 1) {
        for (const uid of picked) moveEnergy(state, owner, fx.from, spots[0], uid, events);
        if (fx.heal) healAt(state, owner, spots[0], fx.heal, events);
        if (fx.again) offerAgain(state, waiting, owner, fx.again, defs);
        if (fx.gather) {
          const next = inPlay(state, owner).filter(([s, at]) => at !== fx.gather.to && energyIn({ state, defs }, s, fx.gather.type)).map(([, at]) => at);
          if (next.length) follow(state, waiting, { player, side: owner, spots: next, left: 1, optional: true, effect: fx.gather });
        }
      } else if (picked.length && spots.length) {
        askPick(state, { player, side: owner, spots, left: 1, effect: { op: "moveEnergyCards", from: waiting.effect.from, uids: picked, ...(fx.again ? { again: fx.again } : {}), ...(fx.heal ? { heal: fx.heal } : {}) }, ...(waiting.then ? { then: waiting.then, from: waiting.from, ...carry(waiting) } : {}) });
        waiting.then = null;
      }
    } else if (op === "payFor") {
      // An attack's price before its damage (effects.js OPS.pay): Energy off its side's Pokémon, or cards from the
      // hand, to the discard pile; the attack counts them ("for each card you discarded in this way").
      // `lost`: they go to the Lost Zone instead ("Put any amount of Fire Energy attached to your Pokémon in the Lost Zone").
      const lost = Boolean(waiting.effect.lost);
      for (const uid of picked) {
        if (waiting.zone === "hand" || waiting.zone === "discard") {
          if (lost) toLost(state, player, [uid], events);
          else side.discard.push(uid);
          continue;
        }
        const at = inPlay(state, player).find(([slot]) => slot.energy.includes(uid) || slot.tool === uid);
        if (!at) continue;
        if (at[0].tool === uid) {
          dropTool(state, player, at[1], at[0], defs, events);
          continue;
        }
        if (lost) toLost(state, player, [uid], events);
        else side.discard.push(uid);
        at[0].energy.splice(at[0].energy.indexOf(uid), 1);
        events.push({ t: "discard-energy", p: player, spot: at[1], uids: [uid], ...(lost ? { lost } : {}) });
      }
      if (waiting.zone === "hand" && picked.length) events.push({ t: "discard-hand", p: player, uids: picked });
      // The damage so far rides on the steps waiting for this choice (effects.js runSteps): what went is added to it.
      const fx = (waiting.then || []).find((step) => step.op === "fx" && step.hit);
      if (fx) fx.hit = { ...fx.hit, paid: [...(fx.hit.paid || []), ...picked] };
    } else if (op === "retreat") {
      // The Energy chosen for the Retreat Cost: now the retreat itself.
      state.pending.shift();
      HANDLERS.retreat(state, { player, to: waiting.effect.to, discard: picked }, defs, events);
      return;
    } else if (op === "toPrizes") {
      // "Add a card you find there to their Prize cards face down."
      side.prizes.push(...picked);
      if (picked.length) events.push({ t: "to-prizes", p: owner, n: picked.length });
    } else if (op === "toLost") {
      // Cards chosen from a hand (or the deck) into the Lost Zone.
      toLost(state, owner, picked, events);
    } else if (op === "millChosen") {
      // "Look at the top card of your deck. You may discard that card."
      side.discard.push(...picked);
      if (picked.length) events.push({ t: "mill", p: owner, uids: picked });
    } else if (op === "look") {
      // "Look at your opponent's hand": the cards were seen, nothing moves.
    } else {
      side.hand.push(...picked);
      events.push({ t: "search", p: owner, uids: picked, from: waiting.zone, to: "hand" });
    }
    // Grimsley's Move: the other cards looked at are shuffled and put on the bottom of the deck.
    if (waiting.restBottom) {
      const rest = side.deck.splice(0, Math.max(0, waiting.restBottom - picked.length));
      side.deck.push(...shuffle(state, rest));
    }
    // "Put the other cards in the Lost Zone."
    if (waiting.restLost) toLost(state, owner, side.deck.splice(0, Math.max(0, waiting.restLost - picked.length)), events);
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

  /**
   * "At any time during your turn before your attack, you may discard it from play": a Trainer played as a Pokémon
   * goes to the discard pile with all its cards (no Knock Out, no Prize card). Lillie's Poké Doll goes to the
   * bottom of the deck instead, its cards to the discard pile. From the Active Spot, a new Active Pokémon comes up.
   */
  drop(state, { player, spot }, defs, events) {
    const why = dropBlock(state, player, spot, defs);
    if (why) fail(why);
    const side = state.players[player];
    const slot = slotAt(state, player, spot);
    const how = defOf(state, slot.uid, defs).fossil.drop;
    if (spot === ACTIVE) side.active = null;
    else side.bench.splice(spot, 1);
    if (how === "bottom") {
      side.discard.push(...slot.under, ...slot.energy, ...heldOn(slot));
      if (slot.tool) toolGone(state, player, slot.tool, defs);
      side.deck.push(slot.uid);
    } else discardSlot(state, player, slot, defs);
    events.push({ t: "drop", p: player, spot, uid: slot.uid, ...(how === "bottom" ? { to: "deck" } : {}) });
    if (!side.active) state.pending.push({ type: "promote", player });
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
    next.upOn = state.turn;
    state.pending = state.pending.filter((p) => !(p.type === "promote" && p.player === player));
    events.push({ t: "promote", p: player, spot });
    offerRise(state, player, defs);
  },
};

/**
 * Cards an attack keeps in the hand this turn ("During your opponent's next turn, they can't play any Item
 * cards from their hand"): side.locks { item, supporter, stadium, special, trainer } hold the turn they bar.
 */
export function handLock(state, player, def) {
  const locks = state.players[player].locks || {};
  const barred = (kind) => locks[kind] === state.turn;
  // "Your opponent can't play any cards from their hand during their next turn."
  if (def && barred("all")) return "You can't play cards from your hand this turn.";
  if (def?.kind === "trainer") {
    // Pokémon Tools are Item cards.
    const kind = def.sub === "tool" ? "item" : def.sub;
    if (barred("trainer")) return "You can't play Trainer cards this turn.";
    if (barred(kind)) return `You can't play ${{ supporter: "Supporter", stadium: "Stadium" }[kind] || "Item"} cards this turn.`;
  }
  if (def?.kind === "energy" && !def.basic && barred("special")) return "You can't play Special Energy cards this turn.";
  return "";
}

/** Why this Trainer can't be played right now, or "" when it can. */
export function trainerBlock(state, player, def, defs) {
  if (def?.kind !== "trainer" || !def.playable) return def?.why || "That card can't be played.";
  const side = state.players[player];
  if (side.noTrainers === state.turn) return "You can't play any more Trainer cards this turn.";
  const locked = handLock(state, player, def);
  if (locked) return locked;
  if (def.sub === "supporter") {
    if (side.supporterUsed) return "You've already played a Supporter this turn.";
    if (state.turn === 1 && !def.fx.some((step) => step.op === "early")) return "No Supporter on the first turn of the match.";
  }
  if (def.sub === "stadium") {
    if (side.stadiumPlayed) return "You've already played a Stadium this turn.";
    if (state.stadium && defOf(state, state.stadium.uid, defs).name === def.name) return `${def.name} is already in play.`;
    return "";
  }
  // Played as a Basic Pokémon: it needs a place on the Bench.
  if (def.fossil) return side.bench.length >= state.rules.bench ? "Your Bench is full." : "";
  if (!trainerReady(def.fx, { state, defs, events: [], player, src: "trainer" })) return `${def.name} would do nothing right now.`;
  return "";
}

/** Why the Trainer played as a Pokémon at `spot` can't be discarded from play now, or "" when it can. */
export function dropBlock(state, player, spot, defs) {
  const slot = slotAt(state, player, spot);
  const how = slot && defOf(state, slot.uid, defs).fossil?.drop;
  if (!how) return "That can't be discarded from play.";
  if (how === "bottom" && spot !== ACTIVE) return "Only as your Active Pokémon.";
  // The rules allow it, but it would leave no Pokémon in play and lose the match.
  if (inPlay(state, player).length < 2) return "You'd have no Pokémon left in play.";
  return "";
}

/** Why the Stadium in play can't be used by this player right now, or "" when it can. */
export function stadiumBlock(state, player, defs) {
  const use = state.stadium && defOf(state, state.stadium.uid, defs)?.stadium?.use;
  if (!use) return "This Stadium has nothing to use.";
  // "As often as each player likes" (Saffron City Gym): no once-a-turn limit.
  if (state.players[player].stadiumUsed && !defOf(state, state.stadium.uid, defs).stadium.often) return "You've already used the Stadium this turn.";
  if (!trainerReady(use, { state, defs, events: [], player })) return "The Stadium would do nothing right now.";
  return "";
}

/**
 * The top Evolution card of a Pokémon back to its owner's hand (Hyper Devolution Spray, an attack that devolves):
 * what is left can't evolve again this turn, and Special Conditions and effects on it go, as when it evolved.
 */
export function devolveSlot(state, p, spot, events) {
  const slot = slotAt(state, p, spot);
  if (!slot?.under.length) return false;
  state.players[p].hand.push(slot.uid);
  events.push({ t: "devolve", p, spot, uid: slot.uid });
  slot.uid = slot.under.shift();
  slot.since = state.turn;
  delete slot.evolvedOn;
  delete slot.spent;
  clearConditions(slot);
  return true;
}

/**
 * Does an Ability keep this Benched Pokémon safe from attack damage? `own`: the damage is from its own
 * player's attack, which a wall against the opponent's attacks doesn't stop.
 */
export function benchSafe(state, slot, spot, defs, own = false) {
  if (spot === ACTIVE) return false;
  // Tera Pokémon ex take no damage from attacks while on the Bench (rulebook).
  if (defOf(state, slot.uid, defs)?.tera) return true;
  if (abilityOn(state, slot, defs)?.benchSafe) return true;
  if (own) return false;
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
  if (effect.op === "breedMark") {
    // Pokémon Breeder Fields: 1 or 2 Pokémon, the second one if the player likes.
    (state.breeder ||= []).push(slotAt(state, p, spot).uid);
    waiting.optional = true;
    return;
  }
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
    // Which card, when that Pokémon's differ, is the mover's choice.
    const cards = energyCards({ state, defs }, slot, effect.type);
    if (!energyAlike(state, cards, defs)) return void ask(state, waiting, { player: waiting.player, owner: p, zone: "play", what: "energy", uids: cards, min: 1, max: 1, effect: { op: "carryEnergy", from: spot, spots: [effect.to], gather: effect } });
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
    // `pierce`: the attack ignores effects on that Pokémon; a Tera Pokémon's own rule still keeps it safe on the Bench.
    if (effect.attack && (effect.pierce ? defOf(state, slot.uid, defs).tera && spot !== ACTIVE : benchSafe(state, slot, spot, defs, p === waiting.player))) return void events.push({ t: "blocked", p, spot });
    // "This attack does 20 damage to 1 of your opponent's Benched Pokémon for each damage counter on that Pokémon."
    let n = effect.perCounter ? effect.perCounter * Math.floor(slot.damage / 10) : effect.n;
    let weak = false;
    let resist = false;
    // Weakness and Resistance count for the Active Pokémon only (unless the attack skips them: effect.noWeakness, noResistance).
    // `typed`: "Also apply Weakness and Resistance for Benched Pokémon."
    if ((spot === ACTIVE || effect.typed) && effect.from) {
      const dealt = damageAfterTyping(n, defOf(state, effect.from, defs), defOf(state, slot.uid, defs), effect);
      ({ amount: n, weak, resist } = dealt);
    }
    if (n <= 0) return;
    slot.damage += n;
    if (effect.attack) struck(state, slot, n);
    events.push({ t: "damage", p, spot, n, weak, resist });
  } else if (effect.op === "countersTo") {
    // "Put damage counters on 1 of your opponent's Pokémon until its remaining HP is 10."
    const slot = slotAt(state, p, spot);
    const n = hpLeft(state, slot, defs) - effect.hp;
    if (n <= 0) return;
    slot.damage += n;
    events.push({ t: "damage", p, spot, n });
  } else if (effect.op === "switch") {
    switchActive(state, p, spot, events, defs);
  } else if (effect.op === "knockOut") {
    // "Knock Out 1 of your opponent's ...": not by damage; judged with the other Knock Outs.
    const slot = slotAt(state, p, spot);
    slot.damage = Math.max(slot.damage, maxHp(state, slot, defs));
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
    const healed = Math.min(n, healRoom(state, slot));
    slot.damage -= healed;
    if (healed) slot.healedOn = state.turn;
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
    devolveSlot(state, p, spot, events);
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
    // "If you do, heal 50 damage from that Pokémon."
    if (effect.heal && effect.uids.length) healAt(state, p, spot, effect.heal, events);
    if (effect.again) offerAgain(state, waiting, p, effect.again, defs);
  } else if (effect.op === "rearrangeFrom") {
    // "Move any number of Energy from your Pokémon to your other Pokémon in any way you like": one card a time,
    // from the Pokémon picked (which card, when they differ, is asked), to another; then again, until the player stops.
    const slot = slotAt(state, p, spot);
    const cards = energyCards({ state, defs }, slot, effect.type, effect.basic);
    const spots = inPlay(state, p).map(([, s]) => s).filter((s) => s !== spot);
    if (!cards.length || !spots.length) return;
    if (!energyAlike(state, cards, defs)) return void ask(state, waiting, { player: waiting.player, owner: p, zone: "play", what: "energy", uids: cards, min: 1, max: 1, effect: { op: "carryEnergy", from: spot, spots, again: effect } });
    if (spots.length > 1) return void follow(state, waiting, { player: waiting.player, side: p, spots, left: 1, effect: { op: "moveEnergyCards", from: spot, uids: [cards[cards.length - 1]], again: effect } });
    moveEnergy(state, p, spot, spots[0], cards[cards.length - 1], events);
    offerAgain(state, waiting, p, effect, defs);
  } else if (effect.op === "bounce") {
    // Back to the hand: its Pokémon cards (all of them, or only the Basic one), and what was attached when `keep` is "all".
    const slot = slotAt(state, p, spot);
    const mons = [slot.uid, ...slot.under];
    const all = [...mons, ...slot.energy, ...(slot.tool ? [slot.tool] : []), ...heldOn(slot)];
    const back = effect.keep === "all" ? all : effect.keep === "basic" ? [mons[mons.length - 1]] : mons;
    side.hand.push(...back);
    side.discard.push(...all.filter((uid) => !back.includes(uid) && uid !== slot.tool));
    if (slot.tool && !back.includes(slot.tool)) toolGone(state, p, slot.tool, defs);
    if (spot === ACTIVE) side.active = null;
    else side.bench.splice(spot, 1);
    events.push({ t: "bounce", p, spot, uid: slot.uid });
  } else if (effect.op === "discardMon") {
    // "Discard 1 of your opponent's Pokémon and all cards attached to it": not Knocked Out, so no Prize cards for it.
    const slot = slotAt(state, p, spot);
    discardSlot(state, p, slot, defs);
    if (spot === ACTIVE) side.active = null;
    else side.bench.splice(spot, 1);
    events.push({ t: "bounce", p, spot, uid: slot.uid, discard: true });
  } else if (effect.op === "shuffleIn") {
    // Fuchsia City Gym: the Pokémon and everything on it go into its owner's deck, shuffled.
    const slot = slotAt(state, p, spot);
    side.deck.push(slot.uid, ...slot.under, ...slot.energy, ...(slot.tool ? [slot.tool] : []), ...heldOn(slot));
    shuffle(state, side.deck);
    if (spot === ACTIVE) side.active = null;
    else side.bench.splice(spot, 1);
    events.push({ t: "shuffle-in", p, spot, uid: slot.uid });
  } else if (effect.op === "moveEnergyFrom") {
    // Which Energy: the last attached of the kind asked for. Then, where it goes.
    const slot = slotAt(state, p, spot);
    const uid = energyIn({ state, defs }, slot, effect.type, effect.basic);
    const spots = moveTargets({ state, defs, player: p, spot: effect.self }, effect, spot);
    if (!uid || !spots.length) return;
    // Which card, when that Pokémon's differ, is the mover's choice; then where it goes.
    const cards = energyCards({ state, defs }, slot, effect.type, effect.basic);
    if (!energyAlike(state, cards, defs)) return void ask(state, waiting, { player: waiting.player, owner: p, zone: "play", what: "energy", uids: cards, min: 1, max: 1, effect: { op: "carryEnergy", from: spot, spots } });
    // Only one place it can go (onto the Active Pokémon): no need to ask.
    if (spots.length === 1) return moveEnergy(state, p, spot, spots[0], uid, events);
    follow(state, waiting, { player: p, side: p, spots, left: 1, effect: { op: "moveEnergyTo", from: spot, uid } });
  } else if (effect.op === "moveEnergyTo") {
    moveEnergy(state, p, effect.from, spot, effect.uid, events);
  } else if (effect.op === "moveCountersFrom") {
    const slot = slotAt(state, p, spot);
    const n = Math.min(effect.n, slot.damage);
    const to = effect.to === "foe" ? other(p) : p;
    // `only`: the one Pokémon they may go to ("to your opponent's Active Pokémon"); `src`: an attack's, not an Ability's.
    const spots = inPlay(state, to).map(([, s]) => s).filter((s) => (effect.only == null || s === effect.only) && (to !== p ? !warded(state, slotAt(state, to, s), { player: p, src: effect.src || "ability" }, defs) : s !== spot));
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
      // `left`: they were left where they were until now (Wishful Baton's, in the discard pile).
      if (effect.left) {
        if (!side[effect.zone].includes(uid)) continue;
        side[effect.zone].splice(side[effect.zone].indexOf(uid), 1);
      }
      slot.energy.push(uid);
      events.push({ t: "attach", p, uid, spot, from: effect.zone || "deck" });
      // "If you do, heal 120 damage from that Pokémon" (`each`: "heal 50 damage ... for each card you attached to them").
      if (effect.heal && (effect.each || uid === effect.uids[0])) healAt(state, p, spot, effect.heal, events);
    }
    if (effect.chain?.length) {
      const rest = waiting.spots.filter((s) => s !== spot && slotAt(state, p, s));
      if (rest.length) follow(state, waiting, { player: waiting.player, side: p, spots: rest, left: 1, effect: { ...effect, uids: [effect.chain[0]], chain: effect.chain.slice(1) } });
      else side[effect.zone || "deck"].push(...effect.chain);
    }
  } else if (effect.op === "discardEnergy") {
    const slot = slotAt(state, p, spot);
    // "Discard a Pokémon Tool and a Special Energy from 1 of your opponent's Pokémon": the Tool goes too.
    if (effect.tool && slot.tool) {
      toolGone(state, p, slot.tool, defs);
      events.push({ t: "discard-tool", p, spot, uid: slot.tool });
      delete slot.tool;
    }
    // A Special Energy only, or any. Which card(s), when they differ, is the choice of the player whose card it is.
    // "Put an Energy attached to 1 of your opponent's Pokémon into their hand": to the hand.
    const uids = effect.special ? slot.energy.filter((uid) => !defOf(state, uid, defs).basic) : slot.energy.slice();
    if (shedEnergy(state, waiting.by ?? waiting.player, p, spot, uids, effect.special ? 1 : effect.n, events, defs, { toHand: Boolean(effect.toHand) })) {
      const asked = state.pending[state.pending.length - 1];
      if (waiting.then) Object.assign(asked, { then: waiting.then, from: waiting.from, ...carry(waiting) });
      waiting.then = null;
    }
  }
}

const fitsEnergy = (def, what) => def?.kind === "energy" && (what === "energy" || (def.provides || []).includes(what.split(":")[1]));

function dropEnergy(state, p, spot, uids, events, lost = false) {
  const slot = slotAt(state, p, spot);
  for (const uid of uids) slot.energy.splice(slot.energy.indexOf(uid), 1);
  if (lost) toLost(state, p, uids, events);
  else state.players[p].discard.push(...uids);
  events.push({ t: "discard-energy", p, spot, uids, ...(lost ? { lost } : {}) });
}

/** Cards put in the Lost Zone: out of the game for good (a player's `lost` pile, face up). */
/** Energy cards off `p`'s Pokémon in play, shuffled into `p`'s deck. */
export function energyToDeck(state, p, uids, events) {
  const side = state.players[p];
  for (const uid of uids) {
    const hit = inPlay(state, p).find(([slot]) => slot.energy.includes(uid));
    if (!hit) continue;
    hit[0].energy.splice(hit[0].energy.indexOf(uid), 1);
    side.deck.push(uid);
    events.push({ t: "energy-to-deck", p, spot: hit[1], uids: [uid] });
  }
  shuffle(state, side.deck);
}

export function toLost(state, p, uids, events) {
  if (!uids.length) return;
  const side = state.players[p];
  side.lost = [...(side.lost || []), ...uids];
  events.push({ t: "lost", p, uids });
}

/** Whether these Energy cards are all the same (a basic Energy of one type, or one Special Energy card): no choice among them matters. */
export function energyAlike(state, uids, defs) {
  const key = (uid) => {
    const def = defOf(state, uid, defs);
    return def.basic ? `basic:${(def.provides || []).join("|")}` : state.cards[uid];
  };
  return new Set(uids.map(key)).size <= 1;
}

/**
 * `n` of these Energy cards (`uids`, all on p's Pokémon at `spot`) leave play: to the discard pile, or (`toHand`) the
 * hand. Which ones is the chooser's call when it matters (the cards differ and not all of them go): a choice is left
 * (returns true), the rest of the effect riding on it. Otherwise the last attached go now.
 */
export function shedEnergy(state, chooser, p, spot, uids, n, events, defs, { toHand = false, lost = false } = {}) {
  // `lost`: to the Lost Zone instead of the discard pile.
  if (uids.length > n && !energyAlike(state, uids, defs)) {
    askChoose(state, { player: chooser, zone: "play", what: "energy", uids, min: n, max: n, effect: { op: toHand ? "takeBack" : "dropInPlay", ...(lost ? { lost } : {}) }, ...(toHand && p !== chooser ? { owner: p } : {}) });
    return true;
  }
  const gone = uids.slice(Math.max(0, uids.length - n));
  if (!gone.length) return false;
  if (!toHand) return void dropEnergy(state, p, spot, gone, events, lost);
  const slot = slotAt(state, p, spot);
  for (const uid of gone) slot.energy.splice(slot.energy.indexOf(uid), 1);
  state.players[p].hand.push(...gone);
  events.push({ t: "energy-to-hand", p, spot, uids: gone });
  return false;
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
  // A Retreat Cost: the cards cover it, and none of them is more than it needs.
  if (rule.covers) {
    const slot = state.players[waiting.player].active;
    const units = picked.map((uid) => payUnits(state, slot, uid, defs));
    const sum = units.reduce((a, b) => a + b, 0);
    if (sum < rule.covers) return "That doesn't cover the Retreat Cost.";
    if (units.some((u) => sum - u >= rule.covers)) return "Discard only what the Retreat Cost needs.";
  }
  if (rule.distinct) {
    const types = cards.map((def) => def.provides || def.types || []);
    if (types.some((a, i) => types.some((b, j) => j > i && a.some((t) => b.includes(t))))) return "Each card must be a different type.";
  }
  return "";
}

/** Heal damage from one Pokémon (as much as it has, and none while it can't be healed). */
function healAt(state, p, spot, n, events) {
  const slot = slotAt(state, p, spot);
  const healed = slot ? Math.min(n, healRoom(state, slot)) : 0;
  if (!healed) return;
  slot.damage -= healed;
  slot.healedOn = state.turn;
  events.push({ t: "heal", p, spot, n: healed });
}

function moveEnergy(state, p, from, to, uid, events) {
  const source = slotAt(state, p, from);
  const slot = slotAt(state, p, to);
  if (!source || !slot || !source.energy.includes(uid)) return;
  source.energy.splice(source.energy.indexOf(uid), 1);
  slot.energy.push(uid);
  events.push({ t: "move-energy", p, uid, from, spot: to });
}

/** "In any way you like": the Pokémon to move the next Energy from, or stop (rearrangeFrom). */
function offerAgain(state, waiting, p, again, defs) {
  const spots = inPlay(state, p).filter(([slot]) => energyCards({ state, defs }, slot, again.type, again.basic).length).map(([, s]) => s);
  if (spots.length && inPlay(state, p).length > 1) follow(state, waiting, { player: waiting.player, side: p, spots, left: 1, optional: true, effect: again });
}

/** A pick that leads to a choice of cards: the steps waiting on the pick ride on the choice. */
function ask(state, waiting, choice) {
  askChoose(state, { ...choice, ...(waiting.then ? { then: waiting.then } : {}), ...(waiting.from != null ? { from: waiting.from } : {}), ...carry(waiting) });
  waiting.then = null;
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
  next.upOn = state.turn;
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
    if (state.dealt === false) fail("The coin flip's winner hasn't chosen who goes first yet.");
    handler(state, action, defs, events);
    return events;
  }
  if (type === "order") {
    // The winner of the opening flip says who goes first, before the first turn starts.
    if (state.phase !== "setup") fail("The match has already started.");
    if (player !== (state.flipWinner ?? state.first)) fail("The winner of the coin flip chooses.");
    if (state.dealt !== false && state.ordered) fail("Who goes first is already chosen.");
    state.first = action.first ? player : other(player);
    state.ordered = true;
    events.push({ t: "order", p: player, first: state.first });
    if (state.dealt === false) {
      const from = state.opening.length;
      deal(state, defs);
      events.push(...state.opening.slice(from));
    }
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
  toLostZone(state, defs);
  settle(state, defs, events);
  toLostZone(state, defs);
  return events;
}

/** Prism Star cards never stay in a discard pile: they go to the Lost Zone, out of the game. */
function toLostZone(state, defs) {
  for (const side of state.players) {
    if (!side.discard.some((uid) => defOf(state, uid, defs)?.prism)) continue;
    side.lost = [...(side.lost || []), ...side.discard.filter((uid) => defOf(state, uid, defs)?.prism)];
    side.discard = side.discard.filter((uid) => !defOf(state, uid, defs)?.prism);
  }
}

/** Every action `player` may take right now. The screen lights these up and the bot picks from them. */
export function legalActions(state, player, defs) {
  const side = state.players[player];
  if (state.phase === "over") return [];
  if (state.phase === "setup") {
    if (state.dealt === false) return player === state.flipWinner ? [true, false].map((first) => ({ type: "order", player, first })) : [];
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
    if (def.kind === "pokemon" && handLock(state, player, def)) continue;
    if (def.kind === "pokemon" && def.stage === "basic" && side.bench.length < state.rules.bench) out.push({ type: "bench", player, uid });
    if (def.kind === "pokemon" && def.evolvesFrom) {
      for (const [slot, spot] of spots) if (canEvolveOnto(state, slot, def, defs) && !markOn(state, slot, "noEvolve")) out.push({ type: "evolve", player, uid, spot });
    }
    if (def.kind === "energy" && def.playable && !side.energyUsed && !handLock(state, player, def)) {
      for (const [slot, spot] of spots) if (energyFits(def, defOf(state, slot.uid, defs)) && !markOn(state, slot, "noEnergy")) out.push({ type: "attach", player, uid, spot });
    }
    if (def.kind === "trainer" && def.sub === "tool") {
      if (def.playable && side.noTrainers !== state.turn && !handLock(state, player, def)) for (const [slot, spot] of spots) if (!slot.tool && toolFits(def.tool, playedAs(state, slot, defs))) out.push({ type: "tool", player, uid, spot });
      continue;
    }
    if (def.kind === "trainer" && !trainerBlock(state, player, def, defs)) out.push({ type: "play", player, uid });
  }
  if (state.stadium && !stadiumBlock(state, player, defs)) out.push({ type: "stadium", player });
  for (const [, spot] of spots) if (!abilityBlock(state, player, spot, defs)) out.push({ type: "ability", player, spot });
  for (const [, spot] of spots) if (!dropBlock(state, player, spot, defs)) out.push({ type: "drop", player, spot });
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
    (side.lost || []).forEach((uid) => shown.add(uid));
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
  if (state.challenge) state.challenge.cards[player].forEach((uid) => shown.add(uid));
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
  // Rock-Paper-Scissors (Dan): the other player doesn't see what was played before they choose.
  if (view.rps && view.rps.p !== player) delete view.rps;
  // Challenge!: the other player's face-down cards show as how many there are.
  if (view.challenge) view.challenge.cards = view.challenge.cards.map((uids, p) => (p === player ? uids : uids.length));
  view.opening = view.opening.map((e) => (e.t === "mulligan" ? e : { ...e }));
  return view;
}
