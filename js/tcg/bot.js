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

  const bench = actions.find((a) => a.type === "bench");
  if (bench) return bench;

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
