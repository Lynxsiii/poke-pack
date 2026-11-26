/**
 * The house bot: a plain player that follows the same rules through the same
 * actions as a person (legalActions / apply in js/tcg/engine.js).
 *
 *   botAction(state, player, defs) -> one action, or null when it has nothing to do
 *
 * How it plays a turn: fill the Bench, evolve what it can, put its Energy
 * where it buys an attack soonest, step back when the Active Pokémon is stuck
 * and a Benched one is ready, then hit with whatever does the most.
 */

import { trainerAim } from "./trainers.js";
import { ACTIVE, damageAfterTyping, defOf, energyOf, hpLeft, inPlay, legalActions, other, unpaid } from "./engine.js";

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

function placeAction(state, player, defs) {
  const side = state.players[player];
  const basics = side.hand.filter((uid) => {
    const def = defOf(state, uid, defs);
    return def.kind === "pokemon" && def.stage === "basic";
  });
  // Lead with the sturdiest that can attack cheaply; keep the rest behind it.
  const rank = (uid) => {
    const def = defOf(state, uid, defs);
    const cheapest = Math.min(...def.attacks.map((a) => a.cost.length), 9);
    return def.hp - cheapest * 15;
  };
  basics.sort((a, b) => rank(b) - rank(a));
  return { type: "place", player, active: basics[0], bench: basics.slice(1, 1 + state.rules.bench) };
}

export function botAction(state, player, defs) {
  const actions = legalActions(state, player, defs);
  if (!actions.length) return null;
  if (actions[0].type === "place") return placeAction(state, player, defs);

  const side = state.players[player];
  const foe = state.players[other(player)].active;
  const foeDef = foe ? defOf(state, foe.uid, defs) : null;

  if (actions[0].type === "promote") {
    // Bring up whoever is closest to attacking, then whoever has the most HP left.
    const rank = (a) => {
      const slot = side.bench[a.spot];
      return -plan(state, slot, defs).short * 1000 + hpLeft(state, slot, defs);
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
    const ranked = waiting.uids.slice().sort((x, y) => worth(y) - worth(x));
    // A price is paid with the cards worth least; anything else takes the best on offer.
    const uids = waiting.effect.op === "discard" ? ranked.reverse().slice(0, waiting.min) : ranked.slice(0, waiting.max);
    return { type: "choose", player, uids };
  }

  if (actions[0].type === "pick") {
    const waiting = state.pending[0];
    const picks = actions.filter((a) => a.spot != null);
    if (!picks.length || waiting.optional) return actions.find((a) => a.spot == null) || picks[0];
    const theirs = state.players[waiting.side];
    const slotOf = (spot) => (spot === ACTIVE ? theirs.active : theirs.bench[spot]);
    // Damage goes where it Knocks Out, else on whatever has the least HP left; a switch brings up the readiest.
    const rank = (a) => {
      const slot = slotOf(a.spot);
      const left = hpLeft(state, slot, defs);
      if (waiting.effect.op === "damage") return (left <= waiting.effect.n ? 1000 : 0) - left;
      if (waiting.effect.op === "heal") return Math.min(slot.damage, waiting.effect.n) + (a.spot === ACTIVE ? 5 : 0);
      if (waiting.effect.op === "discardEnergy") return slot.energy.length + (a.spot === ACTIVE ? 0.5 : 0);
      // Pulling one of theirs forward: the one closest to a Knock Out. Bringing up one of its own: the readiest.
      if (waiting.side !== player) return -left;
      return -plan(state, slot, defs).short * 1000 + left;
    };
    return picks.slice().sort((a, b) => rank(b) - rank(a))[0];
  }

  const bench = actions.find((a) => a.type === "bench");
  if (bench) return bench;

  // Trainers: card draw whenever it can, the rest only when it clearly helps.
  for (const action of actions.filter((a) => a.type === "play")) {
    const def = defOf(state, action.uid, defs);
    const aim = trainerAim(def.fx);
    const heal = def.fx.find((s) => s.op === "heal");
    if (aim === "cure" || aim === "hammer") return action;
    // Drawing is only good while there is a deck to draw from.
    if (aim === "draw" && side.deck.length > 8) return action;
    if (aim === "refresh" && side.hand.length <= 3 && side.deck.length > 8) return action;
    if ((aim === "search" || aim === "recover") && side.deck.length > 4) return action;
    // Paying cards for a search is worth it only from a full hand.
    if (aim === "trade" && side.hand.length >= 5 && side.deck.length > 8) return action;
    if (aim === "heal" && inPlay(state, player).some(([slot]) => slot.damage >= heal.n)) return action;
  }

  // A Tool goes on the Active Pokémon, else on whoever is first on the Bench.
  const tool = actions.filter((a) => a.type === "tool").sort((a, b) => a.spot - b.spot)[0];
  if (tool) return tool;

  const evolve = actions.filter((a) => a.type === "evolve").sort((a, b) => a.spot - b.spot)[0];
  if (evolve) return evolve;

  const attaches = actions.filter((a) => a.type === "attach");
  if (attaches.length) {
    let best = null;
    for (const action of attaches) {
      const slot = action.spot === ACTIVE ? side.active : side.bench[action.spot];
      const before = plan(state, slot, defs);
      const after = plan(state, slot, defs, defOf(state, action.uid, defs).provides);
      // Worth it when it brings an attack closer; the Active Pokémon first.
      const gain = (before.short - after.short) * 100 + after.score + (action.spot === ACTIVE ? 30 : 0) - (before.short === 0 ? 80 : 0);
      if (!best || gain > best.gain) best = { action, gain };
    }
    if (best) return best.action;
  }

  const attacks = actions.filter((a) => a.type === "attack");
  if (!attacks.length && state.turn > 1) {
    // Stuck in front: step back for a Benched Pokémon that can attack now.
    const ready = actions
      .filter((a) => a.type === "retreat")
      .find((a) => plan(state, side.bench[a.to], defs).short === 0 && plan(state, side.bench[a.to], defs).attack?.damage > 0);
    if (ready && plan(state, side.active, defs).short > 1) return ready;
  }
  if (attacks.length) {
    const def = defOf(state, side.active.uid, defs);
    const foeHp = foe ? hpLeft(state, foe, defs) : 0;
    const worth = (a) => attackWorth(def.attacks[a.index], def, foeDef, foeHp);
    return attacks.slice().sort((a, b) => worth(b) - worth(a))[0];
  }
  return actions.find((a) => a.type === "end");
}

/** Every Pokémon in play for a player, for callers that only need the count. */
export const boardSize = (state, player) => inPlay(state, player).length;
