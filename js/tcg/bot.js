/**
 * The house bot: a plain player that follows the same rules through the same
 * actions as a person (legalActions / apply in js/tcg/engine.js).
 *
 *   botAction(state, player, defs) -> one action, or null when it has nothing to do
 *
 * How it plays a turn, the way a careful person would:
 *   - Bench: Basic Pokémon that evolve into something it holds first, one place
 *     kept free for later unless the card's evolution is already in hand.
 *   - Energy: onto whoever it is building toward, counting the Stage 2 it will
 *     become, and onto the next attacker on the Bench once the Active Pokémon is
 *     ready or about to be Knocked Out.
 *   - Retreat or Switch: when the Active Pokémon is stuck, Weak to the other side,
 *     or a Benched one could Knock Out what the Active Pokémon can't.
 *   - Targets: gust out a Benched Pokémon it can Knock Out, hit for the Knock Out
 *     first, and spend nothing (Potions, Full Heals, Energy Removal) for no reason.
 */

import { trainerAim } from "./trainers.js";
import { ACTIVE, apply, chooseBlock, damageAfterTyping, defOf, energyOf, hpLeft, inPlay, legalActions, other, retreatCost, statusOf, unpaid, usableAttacks } from "./engine.js";

/** How much an attack is worth against this defender, before any coin flip. */
function attackWorth(attack, def, foeDef, foeHp) {
  const dealt = foeDef ? damageAfterTyping(attack.damage, def, foeDef).amount : attack.damage;
  return dealt + (foeHp && dealt >= foeHp ? 1000 : 0);
}

/** A Pokémon's best attack and how many Energy it still needs for it. */
function plan(state, slot, defs, extra = []) {
  const def = defOf(state, slot.uid, defs);
  const units = [...energyOf(state, slot, defs), ...extra];
  let best = null;
  for (const attack of def.attacks) {
    const short = unpaid(attack.cost, units);
    const score = attack.damage / (1 + short);
    if (!best || score > best.score) best = { attack, short, score };
  }
  return best || { attack: null, short: 9, score: 0 };
}

/** The best Pokémon this one can still become, from what is in its owner's hand and deck. */
function futureDef(state, player, slot, defs) {
  const side = state.players[player];
  const def = defOf(state, slot.uid, defs);
  const pool = [...side.hand, ...side.deck].map((uid) => defOf(state, uid, defs)).filter((d) => d.kind === "pokemon" && d.playable);
  let at = def;
  for (let step = 0; step < 2; step += 1) {
    const next = pool.filter((d) => d.evolvesFrom === at.name).sort((a, b) => b.hp - a.hp)[0];
    if (!next) break;
    at = next;
  }
  return at;
}

/** plan(), toward what the Pokémon will become: Energy on a Charmander counts for the Charizard. */
function aimFor(state, player, slot, defs, extra = []) {
  const now = plan(state, slot, defs, extra);
  const later = futureDef(state, player, slot, defs);
  if (later === defOf(state, slot.uid, defs)) return now;
  const units = [...energyOf(state, slot, defs), ...extra];
  let best = now;
  for (const attack of later.attacks) {
    const short = unpaid(attack.cost, units);
    const score = attack.damage / (1 + short);
    if (score > best.score) best = { attack, short, score };
  }
  return best;
}

/** The most the other side's Active Pokémon could do to this one next turn, with one more Energy. */
function threat(state, player, slot, defs) {
  const foe = state.players[other(player)].active;
  if (!foe || !slot) return 0;
  const foeDef = defOf(state, foe.uid, defs);
  const def = defOf(state, slot.uid, defs);
  const units = [...energyOf(state, foe, defs), foeDef.types[0] || "Colorless"];
  let most = 0;
  for (const attack of foeDef.attacks) if (unpaid(attack.cost, units) === 0) most = Math.max(most, damageAfterTyping(attack.damage, foeDef, def).amount);
  return most;
}

/** What this Pokémon's best paid-for attack does to the other side's Active Pokémon, with `extra` Energy. */
function hitNow(state, player, slot, defs, extra = []) {
  const foe = state.players[other(player)].active;
  if (!slot || !foe) return 0;
  const def = defOf(state, slot.uid, defs);
  const foeDef = defOf(state, foe.uid, defs);
  const units = [...energyOf(state, slot, defs), ...extra];
  let most = 0;
  for (const attack of def.attacks) if (unpaid(attack.cost, units) === 0) most = Math.max(most, damageAfterTyping(attack.damage, def, foeDef).amount);
  return most;
}

/** The Benched Pokémon worth bringing up instead of the Active one, or -1. */
function betterOnBench(state, player, defs) {
  const side = state.players[player];
  const active = side.active;
  if (!active || !side.bench.length) return -1;
  const foe = state.players[other(player)].active;
  const foeHp = foe ? hpLeft(state, foe, defs) : 0;
  const mine = hitNow(state, player, active, defs);
  const foeDef = foe ? defOf(state, foe.uid, defs) : null;
  const weak = foeDef && foeDef.attacks.length && defOf(state, active.uid, defs).weakness && foeDef.types.includes(defOf(state, active.uid, defs).weakness.type);
  const confused = statusOf(active).confused;
  let best = -1;
  let bestScore = 0;
  side.bench.forEach((slot, spot) => {
    const hit = hitNow(state, player, slot, defs);
    if (!hit) return;
    let score = 0;
    // It can Knock Out what the Active Pokémon can't.
    if (foeHp && hit >= foeHp && mine < foeHp) score = 300;
    // The Active Pokémon can't hit at all, or only for much less.
    else if (!mine && aimFor(state, player, active, defs).short > 1) score = 200;
    else if (hit >= mine * 2 && hit - mine >= 40) score = 120;
    else if (weak && hit >= mine) score = 100;
    else if (confused && hit >= mine) score = 90;
    if (score > bestScore) {
      bestScore = score;
      best = spot;
    }
  });
  return best;
}

/**
 * What an attack is really worth, found by playing it out on copies of the table: coin flips,
 * bonus damage, Bench damage, Special Conditions, discards and recoil all come out in the
 * numbers instead of being guessed from the printed damage. Each copy gets its own coin luck
 * (never the real one), so the score is an average, not a peek at the next flip.
 */
const SAMPLES = 6;
let simulating = false;
const COND_WORTH = { paralyzed: 45, asleep: 25, confused: 20, poisoned: 15, burned: 15 };

function tally(state, player, defs) {
  const me = state.players[player];
  const foe = state.players[other(player)];
  const hurt = (side) => [side.active, ...side.bench].filter(Boolean).reduce((a, slot) => a + slot.damage, 0);
  const conds = (slot) => (slot ? Object.entries(statusOf(slot)).reduce((a, [k, on]) => a + (on ? COND_WORTH[k] || 0 : 0), 0) : 0);
  const energy = (side) => [side.active, ...side.bench].filter(Boolean).reduce((a, slot) => a + slot.energy.length, 0);
  return {
    taken: me.prizes.length,
    lost: foe.prizes.length,
    foeHurt: hurt(foe),
    myHurt: hurt(me),
    foeCond: conds(foe.active),
    myEnergy: energy(me),
    foeEnergy: energy(foe),
    hand: me.hand.length,
    foeCount: [foe.active, ...foe.bench].filter(Boolean).length,
    myCount: [me.active, ...me.bench].filter(Boolean).length,
  };
}

function attackValue(state, player, action, defs) {
  let total = 0;
  for (let i = 1; i <= SAMPLES; i += 1) {
    const copy = JSON.parse(JSON.stringify(state));
    copy.rng = (state.rng ^ Math.imul(i, 0x9e3779b1)) | 0;
    const before = tally(copy, player, defs);
    simulating = true;
    try {
      apply(copy, action, defs);
      // Choices the attack opens (targets, the other side's new Active Pokémon) are made as the bot would.
      for (let k = 0; k < 12 && copy.phase === "main" && copy.pending.length; k += 1) {
        const next = botAction(copy, copy.pending[0].player, defs);
        if (!next) break;
        apply(copy, next, defs);
      }
    } catch {
      simulating = false;
      return -Infinity;
    } finally {
      simulating = false;
    }
    if (copy.phase === "over") {
      total += copy.winner === player ? 100000 : copy.winner == null ? 0 : -100000;
      continue;
    }
    const after = tally(copy, player, defs);
    // A Knocked Out Pokémon leaves with its damage counters: count the Prize, not the counters lost.
    const prizes = before.taken - after.taken;
    total += prizes * 1000 + (prizes ? 0 : after.foeHurt - before.foeHurt) + after.foeCond - before.foeCond
      + (before.foeEnergy - after.foeEnergy) * 20 - (after.myHurt - before.myHurt) - (before.myEnergy - after.myEnergy) * 15
      + Math.min(4, after.hand - before.hand) * 4 - (before.lost - after.lost) * 1000 + Math.max(0, after.myCount - before.myCount) * 15;
  }
  return total / SAMPLES;
}

/** The action of these that plays out best (attackValue), the first of them on a tie. */
function best(state, player, actions, defs) {
  let top = actions[0];
  let most = -Infinity;
  for (const action of actions) {
    const v = attackValue(state, player, action, defs);
    if (v > most) [top, most] = [action, v];
  }
  return top;
}

/** Whether an attack hurts its own side (discards its own Energy, damages itself). */
const costly = (attack) => (attack.fx || []).some((f) => f.op === "discardEnergy" || f.op === "selfDamage");

function placeAction(state, player, defs) {
  const side = state.players[player];
  const basics = side.hand.filter((uid) => {
    const def = defOf(state, uid, defs);
    return def.kind === "pokemon" && def.stage === "basic";
  });
  // Lead with the sturdiest that can attack cheaply and won't evolve into the deck's attacker;
  // the ones that evolve wait on the Bench, where they are safe until they do.
  const evolves = (uid) => [...side.hand, ...side.deck].some((u) => defOf(state, u, defs).evolvesFrom === defOf(state, uid, defs).name);
  const rank = (uid) => {
    const def = defOf(state, uid, defs);
    const cheapest = Math.min(...def.attacks.map((a) => a.cost.length), 9);
    return def.hp - cheapest * 15 - (evolves(uid) ? 40 : 0) - (def.ability?.use ? 30 : 0);
  };
  basics.sort((a, b) => rank(b) - rank(a));
  return { type: "place", player, active: basics[0], bench: basics.slice(1, 1 + state.rules.bench) };
}

export function botAction(state, player, defs) {
  const actions = legalActions(state, player, defs);
  if (!actions.length) return null;
  if (actions[0].type === "place") return placeAction(state, player, defs);
  // Going first means a card more on the board a turn sooner; the bot always takes it.
  if (actions[0].type === "order") return { type: "order", player, first: true };

  const side = state.players[player];
  const foe = state.players[other(player)].active;
  const foeDef = foe ? defOf(state, foe.uid, defs) : null;

  if (actions[0].type === "promote") {
    // Bring up whoever is closest to attacking, then whoever has the most HP left.
    const foeHp = foe ? hpLeft(state, foe, defs) : 0;
    const rank = (a) => {
      const slot = side.bench[a.spot];
      const hit = hitNow(state, player, slot, defs);
      return (foeHp && hit >= foeHp ? 5000 : 0) + hit * 2 - plan(state, slot, defs).short * 1000 + hpLeft(state, slot, defs);
    };
    return actions.slice().sort((a, b) => rank(b) - rank(a))[0];
  }

  if (actions[0].type === "choose") {
    const waiting = state.pending[0];
    const inPlayNames = new Set(inPlay(state, player).map(([slot]) => defOf(state, slot.uid, defs).name));
    const worth = (uid) => {
      const def = defOf(state, uid, defs);
      if (def.kind === "pokemon") return (def.evolvesFrom && inPlayNames.has(def.evolvesFrom) ? 100 : def.stage === "basic" && side.bench.length < state.rules.bench ? 50 : 20) + def.hp / 10;
      if (def.kind === "energy") return side.hand.filter((u) => defOf(state, u, defs).kind === "energy").length > 1 && waiting.zone === "hand" ? 5 : 30;
      return 25;
    };
    // Cards discarded for an attack's damage ("for each card you discarded in this way"): how many is played out on
    // copies, the cards worth least going first (Energy off the Bench before the attacker's); on a copy, as many as it may.
    if (waiting.effect.op === "payFor") {
      const onBench = (uid) => (side.active?.energy.includes(uid) ? 1 : 0);
      const order = waiting.uids.slice().sort((x, y) => onBench(x) - onBench(y) || worth(x) - worth(y));
      const sizes = [...new Set([waiting.min, waiting.max, ...Array.from({ length: waiting.max - waiting.min + 1 }, (_, i) => waiting.min + i)])].slice(0, 8);
      const offers = sizes.map((k) => ({ type: "choose", player, uids: order.slice(0, k) }));
      return simulating ? offers[offers.length > 1 ? 1 : 0] : best(state, player, offers, defs);
    }
    // Tools, Special Energy or the Stadium in play: only the other side's.
    if (waiting.effect.op === "dropInPlay") {
      const foeOwns = new Set(inPlay(state, other(player)).flatMap(([slot]) => [slot.tool, ...slot.energy].filter(Boolean)));
      if (state.stadium && state.stadium.owner !== player) foeOwns.add(state.stadium.uid);
      const theirs = waiting.uids.filter((u) => foeOwns.has(u));
      const mine = waiting.uids.filter((u) => !foeOwns.has(u));
      return { type: "choose", player, uids: [...theirs.slice(0, waiting.max), ...mine.slice(0, Math.max(0, waiting.min - theirs.length))] };
    }
    const ranked = waiting.uids.slice().sort((x, y) => worth(y) - worth(x));
    // A price is paid with the cards worth least; anything else takes the best on offer. Choosing among the
    // other player's cards (their hand, cards for their hand) it is the other way round.
    const foreign = waiting.owner != null && waiting.owner !== player;
    const away = ["discard", "toTop", "toBottom"].includes(waiting.effect.op) !== foreign;
    // Cards that pay for draws (Milo, Caitlin): a couple of the least useful, when it may choose how many.
    const many = waiting.pass && !foreign ? Math.max(waiting.min, Math.min(waiting.max, 2)) : away ? waiting.min : waiting.max;
    const order = away ? ranked.reverse() : ranked;
    // Cards that must go together by a rule (one kind only, one of each): the best that still fit, in turn.
    const uids = [];
    for (const uid of order) if (uids.length < many && !chooseBlock(state, waiting, [...uids, uid], defs)) uids.push(uid);
    for (const uid of order) if (uids.length < waiting.min && !uids.includes(uid)) uids.push(uid);
    return { type: "choose", player, uids };
  }

  // "Choose 1": the options come in the order printed, with the most cards to draw first; the first is the plain choice.
  if (actions[0].type === "option") {
    const waiting = state.pending[0];
    // "Choose 1 of the Defending Pokémon's attacks": the one that hits hardest is the one to lock.
    if (waiting.why === "foeAttack" && foeDef) {
      const hits = waiting.labels.map((name) => Math.max(0, ...foeDef.attacks.filter((a) => a.name === name).map((a) => a.damage)));
      return actions[hits.indexOf(Math.max(...hits))];
    }
    // A "you may" before an attack's damage: each answer played out on copies, the better one taken
    // (while already playing out the attack on a copy, yes).
    if (waiting.why === "before") return simulating ? actions[0] : best(state, player, actions, defs);
    // An attack's "you may": yes, except to take its own Pokémon out of play.
    if (waiting.why === "may" && JSON.stringify(waiting.options[0]).includes('"selfAway"')) return actions[1];
    return actions[0];
  }

  if (actions[0].type === "pick") {
    const waiting = state.pending[0];
    const picks = actions.filter((a) => a.spot != null);
    // "When you play this Pokémon, you may": yes, unless it would draw from a deck that is nearly out.
    if (waiting.effect.op === "ability") return side.deck.length > 4 ? picks[0] : actions.find((a) => a.spot == null);
    // "Move any amount of Energy to it": keep taking while the Pokémon it goes to can't pay for its best attack.
    if (waiting.effect.op === "gatherFrom" && picks.length) {
      const to = waiting.effect.to === ACTIVE ? side.active : side.bench[waiting.effect.to];
      if (to && plan(state, to, defs).short > 0) {
        const spare = (a) => {
          const slot = a.spot === ACTIVE ? side.active : side.bench[a.spot];
          return slot.energy.length - plan(state, slot, defs).short * 2;
        };
        return picks.slice().sort((a, b) => spare(b) - spare(a))[0];
      }
      return actions.find((a) => a.spot == null) || picks[0];
    }
    if (!picks.length || waiting.optional) return actions.find((a) => a.spot == null) || picks[0];
    const theirs = state.players[waiting.side];
    const slotOf = (spot) => (spot === ACTIVE ? theirs.active : theirs.bench[spot]);
    // Damage goes where it Knocks Out, else on whatever has the least HP left; a switch brings up the readiest.
    const rank = (a) => {
      const slot = slotOf(a.spot);
      const left = hpLeft(state, slot, defs);
      // Damage counters one at a time may go on the same Pokémon again: not on one already Knocked Out.
      if (waiting.effect.op === "damage") return left <= 0 ? -5000 : (left <= waiting.effect.n ? 1000 : 0) - left;
      if (waiting.effect.op === "attachFrom") {
        const after = plan(state, slot, defs, defOf(state, waiting.effect.uid, defs).provides);
        return (plan(state, slot, defs).short - after.short) * 100 + after.score + (a.spot === ACTIVE ? 30 : 0);
      }
      if (waiting.effect.op === "attachHeld") {
        const provides = waiting.effect.uids.flatMap((uid) => defOf(state, uid, defs).provides || []);
        const after = plan(state, slot, defs, provides);
        return (plan(state, slot, defs).short - after.short) * 100 + after.score + (a.spot === ACTIVE ? 30 : 0);
      }
      // Moving Energy: off whoever needs it least, onto the Active Pokémon when it helps.
      if (waiting.effect.op === "moveEnergyFrom") return (a.spot === ACTIVE ? -50 : 0) + plan(state, slot, defs).short * 10 + slot.energy.length;
      if (waiting.effect.op === "moveEnergyTo") {
        const provides = defOf(state, waiting.effect.uid, defs).provides || [];
        const after = plan(state, slot, defs, provides);
        return (plan(state, slot, defs).short - after.short) * 100 + (a.spot === ACTIVE ? 30 : 0);
      }
      if (waiting.effect.op === "moveCountersFrom") return slot.damage + (a.spot === ACTIVE ? 5 : 0);
      if (waiting.effect.op === "moveCountersTo") return waiting.side === player ? left : (left <= waiting.effect.n ? 1000 : 0) - left;
      if (waiting.effect.op === "heal") return Math.min(slot.damage, waiting.effect.n) + (a.spot === ACTIVE ? 5 : 0);
      if (waiting.effect.op === "discardEnergy") return slot.energy.length + (a.spot === ACTIVE ? 0.5 : 0);
      // Pulling one of theirs forward: one the Active Pokémon can Knock Out (more Prizes first), else the
      // one with the most Energy on it, else the one closest to a Knock Out. Bringing up its own: the readiest.
      if (waiting.side !== player) {
        if (a.spot === ACTIVE) return -9999;
        const def = defOf(state, slot.uid, defs);
        const hit = side.active ? (() => {
          const mine = defOf(state, side.active.uid, defs);
          const units = energyOf(state, side.active, defs);
          return Math.max(0, ...mine.attacks.filter((at) => unpaid(at.cost, units) === 0).map((at) => damageAfterTyping(at.damage, mine, def).amount));
        })() : 0;
        return (hit >= left ? 2000 + def.prizes * 500 : 0) + slot.energy.length * 40 - left;
      }
      return -plan(state, slot, defs).short * 1000 + left;
    };
    return picks.slice().sort((a, b) => rank(b) - rank(a))[0];
  }

  // Bench: what evolves into something it holds first. One place stays free for later,
  // unless the evolution is already in hand or the Bench is empty.
  const benches = actions.filter((a) => a.type === "bench");
  if (benches.length) {
    const hand = side.hand.map((uid) => defOf(state, uid, defs));
    const deck = side.deck.map((uid) => defOf(state, uid, defs));
    const score = (a) => {
      const def = defOf(state, a.uid, defs);
      return (hand.some((d) => d.evolvesFrom === def.name) ? 100 : 0) + (deck.some((d) => d.evolvesFrom === def.name) ? 40 : 0) + (def.ability?.use ? 30 : 0) + def.hp / 10;
    };
    const pick = benches.slice().sort((a, b) => score(b) - score(a))[0];
    if (side.bench.length < state.rules.bench - 1 || score(pick) >= 100 || !side.bench.length) return pick;
  }

  // Trainers: card draw whenever it can, the rest only when it clearly helps.
  for (const action of actions.filter((a) => a.type === "play")) {
    const def = defOf(state, action.uid, defs);
    const aim = trainerAim(def.fx);
    const heal = def.fx.find((s) => s.op === "heal");
    // A card that also discards the Stadium in play is not played over its own Stadium.
    if (def.fx.some((s) => s.op === "dropStadium") && state.stadium?.owner === player) continue;
    if (aim === "cure" && inPlay(state, player).some(([slot]) => Object.values(statusOf(slot)).some(Boolean))) return action;
    if (aim === "hammer" && inPlay(state, other(player)).some(([slot]) => slot.energy.length)) return action;
    // Rare Candy is only playable when it fits, and Energy from a Trainer is always welcome.
    if (aim === "evolve" || aim === "energize") return action;
    // Tool and Stadium removal: only when the other side has something to lose.
    if (aim === "tools" && (inPlay(state, other(player)).some(([slot]) => slot.tool) || (state.stadium && state.stadium.owner !== player))) return action;
    // Cards back into the deck: worth it from a full hand, putting back the least useful.
    if (aim === "stash" && side.hand.length >= 5 && side.deck.length > 6) return action;
    if (aim === "cure" || aim === "hammer" || aim === "switch" || aim === "gust") continue;
    // An empty Bench loses the game to one Knock Out: dig for a Basic Pokémon whatever the deck size.
    const thin = !side.bench.length && !side.hand.some((uid) => defOf(state, uid, defs).stage === "basic");
    if (thin && ["draw", "search", "refresh", "trade"].includes(aim) && side.deck.length > 1) return action;
    // Drawing is only good while there is a deck to draw from.
    if (aim === "draw" && side.deck.length > 8) return action;
    if (aim === "refresh" && side.hand.length <= 3 && side.deck.length > 8) return action;
    if ((aim === "search" || aim === "recover") && side.deck.length > 4) return action;
    // Paying cards for a search is worth it only from a full hand.
    if (aim === "trade" && side.hand.length >= 5 && side.deck.length > 8) return action;
    if (aim === "heal" && inPlay(state, player).some(([slot]) => slot.damage >= heal.n)) return action;
  }

  // Abilities: the ones that are plainly good to use (cards, Energy, healing, damage counters).
  for (const action of actions.filter((a) => a.type === "ability")) {
    const slot = action.spot === ACTIVE ? side.active : side.bench[action.spot];
    const { use } = defOf(state, slot.uid, defs).ability;
    const steps = use.steps.flatMap((s) => (s.op === "flip" ? s.heads : [s]));
    const aim = trainerAim(steps);
    const heal = steps.find((s) => s.op === "heal");
    // Knocking itself out hands over a Prize: only when its damage counters Knock Out something worth more.
    if (use.selfKo) {
      const n = steps.find((s) => s.op === "counters")?.n || 0;
      const worth = inPlay(state, other(player)).some(([foeSlot]) => hpLeft(state, foeSlot, defs) <= n && defOf(state, foeSlot.uid, defs).prizes > defOf(state, slot.uid, defs).prizes);
      if (!worth) continue;
    }
    // An Ability that ends the turn waits until there is nothing to attack with.
    if (use.ends && usableAttacks(state, player, defs).length) continue;
    if (aim === "form" || aim === "move" || aim === "gust") continue;
    if (aim === "energize" || aim === "counters" || aim === "cure") return action;
    if ((aim === "draw" || aim === "search" || aim === "recover") && side.deck.length > 8) return action;
    if (aim === "trade" && side.hand.length >= 4 && side.deck.length > 8) return action;
    if (aim === "refresh" && side.hand.length <= 3 && side.deck.length > 8) return action;
    if (aim === "heal" && inPlay(state, player).some(([s]) => s.damage >= Math.min(heal.n, 30))) return action;
  }

  // What the Stadium offers is free: take it while there is a deck to work with.
  // Not one that costs its own cards (a Pokémon shuffled away, Energy back to the hand).
  const stadium = actions.find((a) => a.type === "stadium");
  if (stadium && side.deck.length > 6 && !defOf(state, state.stadium.uid, defs).stadium.loss) return stadium;

  // A Tool goes on the Active Pokémon, else on whoever is first on the Bench.
  const tool = actions.filter((a) => a.type === "tool").sort((a, b) => a.spot - b.spot)[0];
  if (tool) return tool;

  const evolve = actions.filter((a) => a.type === "evolve").sort((a, b) => a.spot - b.spot)[0];
  if (evolve) return evolve;

  const attaches = actions.filter((a) => a.type === "attach");
  if (attaches.length) {
    let best = null;
    // The Active Pokémon first, unless it is already set or about to be Knocked Out: then the next attacker.
    const doomed = side.active && threat(state, player, side.active, defs) >= hpLeft(state, side.active, defs);
    for (const action of attaches) {
      const slot = action.spot === ACTIVE ? side.active : side.bench[action.spot];
      const before = aimFor(state, player, slot, defs);
      const after = aimFor(state, player, slot, defs, defOf(state, action.uid, defs).provides);
      const front = action.spot === ACTIVE ? (doomed && before.short === 0 ? -40 : 30) : 0;
      // Worth it when it brings an attack closer, toward what the Pokémon will become.
      const gain = (before.short - after.short) * 100 + after.score + front - (before.short === 0 ? 80 : 0) + slot.energy.length * 5;
      if (!best || gain > best.gain) best = { action, gain };
    }
    if (best) return best.action;
  }

  // A better Pokémon for this turn waits on the Bench: a Switch card is free, a retreat costs Energy.
  if (state.turn > 1 && !side.retreated) {
    const spot = betterOnBench(state, player, defs);
    if (spot >= 0) {
      const sw = actions.find((a) => a.type === "play" && trainerAim(defOf(state, a.uid, defs).fx) === "switch");
      if (sw) return sw;
      const back = actions.find((a) => a.type === "retreat" && a.to === spot);
      // Only when it can spare the Energy: what it pays must not leave it unable to come back and fight.
      if (back && retreatCost(state, side.active, defs) <= 2) return back;
    }
  }

  // Gust: pull out a Benched Pokémon the Active Pokémon can Knock Out, when the Active one in front can't be.
  const foeSide = state.players[other(player)];
  if (side.active && foe && foeSide.bench.length) {
    const mine = defOf(state, side.active.uid, defs);
    const units = energyOf(state, side.active, defs);
    const ready = mine.attacks.filter((at) => unpaid(at.cost, units) === 0);
    const kos = (slot) => ready.some((at) => damageAfterTyping(at.damage, mine, defOf(state, slot.uid, defs)).amount >= hpLeft(state, slot, defs));
    if (ready.length && !kos(foe) && foeSide.bench.some((slot) => kos(slot)) && usableAttacks(state, player, defs).length) {
      const gust = actions.find((a) => {
        if (a.type !== "play") return false;
        const fx = defOf(state, a.uid, defs).fx;
        return fx.some((st) => st.op === "gust") && trainerAim(fx) === "gust";
      });
      if (gust) return gust;
    }
  }

  const attacks = actions.filter((a) => a.type === "attack");
  if (attacks.length && !simulating) {
    const scored = attacks.map((a) => ({ a, v: attackValue(state, player, a, defs) })).sort((x, y) => y.v - x.v);
    if (scored[0].v > -Infinity) return scored[0].a;
  }
  if (attacks.length) {
    const def = defOf(state, side.active.uid, defs);
    const foeHp = foe ? hpLeft(state, foe, defs) : 0;
    // The Knock Out first; between two that both do it, the one that costs its own side nothing.
    const worth = (a) => {
      const attack = def.attacks[a.index];
      const base = attackWorth(attack, def, foeDef, foeHp);
      return base - (costly(attack) ? (base >= 1000 ? 5 : 25) : 0);
    };
    return attacks.slice().sort((a, b) => worth(b) - worth(a))[0];
  }
  return actions.find((a) => a.type === "end");
}

/** Every Pokémon in play for a player, for callers that only need the count. */
export const boardSize = (state, player) => inPlay(state, player).length;
