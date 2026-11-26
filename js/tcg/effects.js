/**
 * Attack text, turned into steps the engine can run.
 *
 * A card's text is read once (compileAttack, called by js/tcg/cards.js) into a
 * short list of steps. Each step names an op from OPS below. Text that no
 * pattern reads fully compiles to null: the attack then does its printed
 * damage and the screen says the text isn't live yet.
 *
 * Growing this is the road to full card effects (docs/tcg-plan.md, phase 2):
 * add an op here, add the wording that maps to it in PATTERNS, add a case to
 * scripts/test-tcg.mjs. `node scripts/test-tcg.mjs --coverage` prints how many
 * of the site's attacks are read, and the commonest wordings that are not.
 *
 * A step is { op, when, ...args }. `when` is "before" (it can change or cancel
 * the damage) or "after" (it runs once the damage has landed).
 *
 * ctx: { state, defs, events, player, slot (the attacker), target (the other Active), attack,
 *        hit: { damage, cancelled, dealt (what got through, once it has landed) },
 *        shielded (the target takes no effects this turn) }
 */

import { ACTIVE, abilityOn, addCondition, addMark, askChoose, askPick, benchSafe, conditionsOn, damageAfterTyping, defOf, energyOf, flip, heldOn, hpLeft, inPlay, markOn, other, rand, retreatCost, shuffle, strike, struck, switchActive, toolGone, unpaid, warded } from "./engine.js";
import { T_OPS, compileTrainer, fits, runTrainer, trainerReady, whatOf } from "./trainers.js";

const WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
const count = (word) => WORDS[String(word).toLowerCase()] || Number(word) || 0;

/** Units of Energy that count as this type ("Any" and "Fire|Water" count for each they can be); all of them with no type. */
const fitsType = (unit, type) => !type || unit === type || unit === "Any" || unit.split("|").includes(type);
const unitsOf = (ctx, slot, type = "") => (slot ? energyOf(ctx.state, slot, ctx.defs).filter((u) => fitsType(u, type)).length : 0);
const cardsOf = (ctx, slot, type = "") => (slot?.energy || []).filter((uid) => !type || (defOf(ctx.state, uid, ctx.defs).provides || []).includes(type)).length;
const sideOf = (ctx, mine = false) => ctx.state.players[mine ? ctx.player : other(ctx.player)];
const slotsOf = (side) => [side.active, ...side.bench].filter(Boolean);
const defIn = (ctx, slot) => defOf(ctx.state, slot.uid, ctx.defs);

/**
 * Energy of a type on the attacker that its attack's cost doesn't need ("not used to pay for
 * this attack's Energy cost"): leave out as many as still lets the cost be paid, the plain
 * ones first so the ones that can be other types stay to pay.
 */
function spareUnits(ctx, type) {
  const cost = ctx.attack?.cost || [];
  let pool = energyOf(ctx.state, ctx.slot, ctx.defs);
  const rank = (u) => (u === type ? 0 : u === "Any" ? 2 : 1);
  let spare = 0;
  for (const unit of pool.filter((u) => fitsType(u, type)).sort((a, b) => rank(a) - rank(b))) {
    const rest = pool.slice();
    rest.splice(rest.indexOf(unit), 1);
    if (unpaid(cost, rest)) break;
    pool = rest;
    spare += 1;
  }
  return spare;
}

/** What "for each ..." counts. */
const COUNTS = {
  selfCounters: (ctx) => ctx.slot.damage / 10,
  foeCounters: (ctx) => (ctx.target?.damage || 0) / 10,
  foeBench: (ctx) => sideOf(ctx).bench.length,
  ownBench: (ctx) => sideOf(ctx, true).bench.length,
  allBench: (ctx) => sideOf(ctx).bench.length + sideOf(ctx, true).bench.length,
  ownInPlay: (ctx) => slotsOf(sideOf(ctx, true)).length,
  foeRetreat: (ctx) => (ctx.target ? retreatCost(ctx.state, ctx.target, ctx.defs) : 0),
  foePrizesTaken: (ctx) => ctx.state.rules.prizes - sideOf(ctx).prizes.length,
  ownPrizesTaken: (ctx) => ctx.state.rules.prizes - sideOf(ctx, true).prizes.length,
  // "Energy" counts what is provided (Double Colorless is two); "Energy card" counts cards.
  foeEnergy: (ctx, type) => unitsOf(ctx, ctx.target, type),
  selfEnergy: (ctx, type) => unitsOf(ctx, ctx.slot, type),
  bothEnergy: (ctx, type) => unitsOf(ctx, ctx.slot, type) + unitsOf(ctx, ctx.target, type),
  foeAllEnergy: (ctx, type) => slotsOf(sideOf(ctx)).reduce((n, s) => n + unitsOf(ctx, s, type), 0),
  ownAllEnergy: (ctx, type) => slotsOf(sideOf(ctx, true)).reduce((n, s) => n + unitsOf(ctx, s, type), 0),
  foeEnergyCards: (ctx, type) => cardsOf(ctx, ctx.target, type),
  selfEnergyCards: (ctx, type) => cardsOf(ctx, ctx.slot, type),
  spareEnergy: (ctx, type) => spareUnits(ctx, type),
  foeHand: (ctx) => sideOf(ctx).hand.length,
  ownHand: (ctx) => sideOf(ctx, true).hand.length,
  foeConditions: (ctx) => conditionsOn(ctx.target).length,
  ownDamaged: (ctx) => slotsOf(sideOf(ctx, true)).filter((s) => s.damage > 0).length,
  ownTools: (ctx) => slotsOf(sideOf(ctx, true)).filter((s) => s.tool).length,
  // "that much more damage": what attacks did to it during the opponent's last turn (engine.js struck).
  struck: (ctx) => (ctx.slot.struckOn === ctx.state.turn - 1 ? ctx.slot.struckFor || 0 : 0),
  benchCounters: (ctx, who) => sideOf(ctx, true).bench.filter((s) => !who || fits(defIn(ctx, s), who)).reduce((n, s) => n + s.damage / 10, 0),
  // "for each card you discarded in this way" (OPS.pay keeps them in hit.paid); `type` here is a card kind (trainers.js fits).
  paid: (ctx, what) => (ctx.hit.paid || []).filter((uid) => !what || fits(defOf(ctx.state, uid, ctx.defs), what)).length,
  discardType: (ctx, type) => sideOf(ctx, true).discard.filter((uid) => defOf(ctx.state, uid, ctx.defs)?.kind === "pokemon" && defOf(ctx.state, uid, ctx.defs).types.includes(type)).length,
};

/** What "If ..., this attack does more damage" asks. */
const TESTS = {
  foeDamaged: (ctx) => ctx.target?.damage > 0,
  foeCountersAtLeast: (ctx, { k }) => (ctx.target?.damage || 0) >= k * 10,
  selfDamaged: (ctx) => ctx.slot.damage > 0,
  foeStage: (ctx, { stage }) => Boolean(ctx.target) && defIn(ctx, ctx.target).stage === stage,
  foeBox: (ctx, { boxes }) => Boolean(ctx.target) && boxes.includes(defIn(ctx, ctx.target).box),
  foeType: (ctx, { type }) => Boolean(ctx.target) && defIn(ctx, ctx.target).types.includes(type),
  foeStatus: (ctx, { kind }) => (kind ? conditionsOn(ctx.target).includes(kind) : conditionsOn(ctx.target).length > 0),
  selfStatus: (ctx) => conditionsOn(ctx.slot).length > 0,
  benchDamaged: (ctx) => sideOf(ctx, true).bench.some((s) => s.damage > 0),
  stadium: (ctx, { own }) => Boolean(ctx.state.stadium) && (!own || ctx.state.stadium.owner === ctx.player),
  selfTool: (ctx) => Boolean(ctx.slot.tool),
  foeTool: (ctx) => Boolean(ctx.target?.tool),
  selfSpecial: (ctx) => ctx.slot.energy.some((uid) => defOf(ctx.state, uid, ctx.defs).special),
  selfEnergyType: (ctx, { type }) => unitsOf(ctx, ctx.slot, type) > 0,
  hands: (ctx, { how }) => {
    const mine = sideOf(ctx, true).hand.length, theirs = sideOf(ctx).hand.length;
    return how === "same" ? mine === theirs : how === "more" ? mine > theirs : mine === 0;
  },
  foePrizesAtMost: (ctx, { k }) => sideOf(ctx).prizes.length <= k,
  behind: (ctx) => sideOf(ctx, true).prizes.length > sideOf(ctx).prizes.length,
  supporter: (ctx) => Boolean(sideOf(ctx, true).supporterUsed),
  lessEnergy: (ctx) => unitsOf(ctx, ctx.slot) < unitsOf(ctx, ctx.target),
  energyDiffers: (ctx) => Boolean(ctx.target) && unitsOf(ctx, ctx.slot) !== unitsOf(ctx, ctx.target),
  energyCardsDiffer: (ctx) => Boolean(ctx.target) && cardsOf(ctx, ctx.slot) !== cardsOf(ctx, ctx.target),
  foeEnergyCards: (ctx) => cardsOf(ctx, ctx.target) > 0,
  foeResistance: (ctx) => Boolean(ctx.target && defIn(ctx, ctx.target).resistance),
  foeUndamaged: (ctx) => Boolean(ctx.target) && !ctx.target.damage,
  foeHpAtMost: (ctx, { k }) => Boolean(ctx.target) && hpLeft(ctx.state, ctx.target, ctx.defs) <= k,
  selfHpAtMost: (ctx, { k }) => hpLeft(ctx.state, ctx.slot, ctx.defs) <= k,
  selfCountersAtLeast: (ctx, { k }) => ctx.slot.damage >= k * 10,
  benchAllCounters: (ctx, { k }) => sideOf(ctx, true).bench.length > 0 && sideOf(ctx, true).bench.every((s) => s.damage >= k * 10),
  // What happened earlier, kept by engine.js: a move up from the Bench this turn (`upOn`), healing this turn
  // (`healedOn`), a Knock Out by an attack's damage on the opponent's last turn (`downedOn`), damage from an attack then (`struckOn`).
  movedUp: (ctx) => ctx.slot.upOn === ctx.state.turn,
  healed: (ctx) => ctx.slot.healedOn === ctx.state.turn,
  downed: (ctx, { who = "" }) => (sideOf(ctx, true).downed || []).some((d) => d.turn === ctx.state.turn - 1 && (!who || fits(defOf(ctx.state, d.uid, ctx.defs), who))),
  hpBelowFoe: (ctx) => Boolean(ctx.target) && hpLeft(ctx.state, ctx.slot, ctx.defs) < hpLeft(ctx.state, ctx.target, ctx.defs),
  foeHpBelow: (ctx) => Boolean(ctx.target) && hpLeft(ctx.state, ctx.target, ctx.defs) < hpLeft(ctx.state, ctx.slot, ctx.defs),
  benchNoMore: (ctx) => sideOf(ctx, true).bench.length <= sideOf(ctx).bench.length,
  struck: (ctx) => ctx.slot.struckOn === ctx.state.turn - 1,
  // "If you do": the attacker said yes to a "you may" before the damage (OPS.ask).
  did: (ctx) => Boolean(ctx.hit.did),
};
/** Tests that hold all turn long (history), so an effect after the damage may ask them too. */
const STEADY = new Set(["movedUp", "healed", "downed", "struck"]);

function flips(ctx, n) {
  const results = Array.from({ length: n }, () => flip(ctx.state));
  ctx.events.push({ t: "flip", p: ctx.player, results });
  return results;
}

export const OPS = {
  /** The attack's damage, then its steps after the damage (engine.js strike): the last step of every attack. */
  strike(ctx) {
    if (ctx.attack) strike(ctx);
  },
  /** Flip a coin: heads adds damage. */
  flipBonus(ctx, { n }) {
    if (flips(ctx, 1)[0]) ctx.hit.damage += n;
  },
  /** Flip a coin: tails and the attack does nothing; heads and the `heads` steps happen too (Fly's protection). */
  flipOrNothing(ctx, { heads = [] }) {
    if (!flips(ctx, 1)[0]) {
      ctx.hit.cancelled = true;
      ctx.events.push({ t: "miss", p: ctx.player });
    } else runSteps(heads, ctx);
  },
  /** The damage the text names, where the card prints none ("Does 30 damage to each Defending Pokémon"). */
  setDamage(ctx, { n }) {
    ctx.hit.damage = n;
  },
  /** Flip some coins: more damage by how many came up heads (`more[heads]`). */
  flipTable(ctx, { coins, more }) {
    ctx.hit.damage += more[flips(ctx, coins).filter(Boolean).length] || 0;
  },
  /** Flip some coins: damage for each heads. */
  flipTimes(ctx, { coins, n, per = "", type = "" }) {
    ctx.hit.damage = flips(ctx, per ? COUNTS[per](ctx, type) : coins).filter(Boolean).length * n;
  },
  healSelf(ctx, { n }) {
    const healed = Math.min(n, ctx.slot.damage);
    if (!healed) return;
    ctx.slot.damage -= healed;
    ctx.slot.healedOn = ctx.state.turn;
    ctx.events.push({ t: "heal", p: ctx.player, spot: -1, n: healed });
  },
  /** Flip some coins: more damage for each heads. */
  flipBonusEach(ctx, { coins, n, per = "", type = "" }) {
    ctx.hit.damage += flips(ctx, per ? COUNTS[per](ctx, type) : coins).filter(Boolean).length * n;
  },
  /** Flip some coins: `notAll` steps unless every one is heads. */
  flipCoins(ctx, { coins, notAll = [] }) {
    if (!flips(ctx, coins).every(Boolean)) runSteps(notAll, ctx);
  },
  /** Flip some coins: more damage only if all of them are heads. */
  flipAll(ctx, { coins, n }) {
    if (flips(ctx, coins).every(Boolean)) ctx.hit.damage += n;
  },
  /** Flip until tails: damage for each heads (`more`: on top of the printed damage). */
  flipUntilTails(ctx, { n, more = false }) {
    const results = [];
    do results.push(flip(ctx.state));
    while (results[results.length - 1] && results.length < 60);
    ctx.events.push({ t: "flip", p: ctx.player, results });
    ctx.hit.damage = (more ? ctx.hit.damage : 0) + results.filter(Boolean).length * n;
  },
  /**
   * Damage for each of something on the table (COUNTS): `how` "more" adds it to the printed
   * damage, "less" takes it off (never below 0), "times" is the whole damage. `cap`: the most it may add.
   */
  bonusPer(ctx, { n, per, how = "more", type = "", cap = 0 }) {
    const add = COUNTS[per](ctx, type) * n;
    if (how === "times") ctx.hit.damage = add;
    else if (how === "less") ctx.hit.damage = Math.max(0, ctx.hit.damage - add);
    else ctx.hit.damage += cap ? Math.min(cap, add) : add;
  },
  /** "This attack's base damage is 80 instead of 30": the printed damage swapped, whatever else changed it kept. */
  base(ctx, { n }) {
    ctx.hit.damage += n - (ctx.attack?.damage || 0);
  },
  baseIf(ctx, { n, test, ...args }) {
    if (TESTS[test](ctx, args)) OPS.base(ctx, { n });
  },
  /** Steps after the damage that happen only if a test holds (one that holds all turn long: STEADY). */
  ifTest(ctx, { test, steps, ...args }) {
    if (TESTS[test](ctx, args)) runSteps(steps, ctx);
  },
  /**
   * "You may ..." before the damage is worked out ("You may discard all Energy from this Pokémon. If you do,
   * this attack does 80 more damage"): the attacker says yes or no now. Yes runs `steps` and marks the attack
   * (hit.did, TESTS.did, OPS.ifDid). The damage waits for the answer (runAttack: it rides on the choice).
   * Not asked when the steps could do nothing.
   */
  ask(ctx, { steps = [], prompt }) {
    if (!readyFx(ctx, steps)) return;
    ctx.state.pending.push({ type: "option", player: ctx.player, why: "before", prompt, labels: ["Yes", "No"], options: [[{ op: "fx", steps: [...steps, { op: "did" }], uid: ctx.slot.uid }], []] });
  },
  did(ctx) {
    ctx.hit.did = true;
  },
  /** "If you do, this Pokémon does 30 damage to itself": after the damage, if the attacker said yes. */
  ifDid(ctx, { steps }) {
    if (ctx.hit.did) runSteps(steps, ctx);
  },
  /**
   * Cards discarded before the damage, kept in hit.paid for "for each card you discarded in this way" (COUNTS.paid).
   * `from`: "self", "own" (any of the attacker's side's Pokémon), "bench" (Energy attached to them, `energy`
   * { basic, type }), "hand" (cards that fit `what`), "deck" (the top n), "decks" (the top n of each player's).
   * `all`: every card that fits, no choice; otherwise the attacker chooses any number up to n (0: as many as fit).
   */
  pay(ctx, { from, energy = {}, what = "any", n = 0, all = false, exact = false, oneKind = false }) {
    const { state, player, defs, events } = ctx;
    const side = state.players[player];
    const paid = (gone) => (ctx.hit.paid = [...(ctx.hit.paid || []), ...gone]);
    if (from === "deck" || from === "decks") {
      for (const p of from === "decks" ? [player, other(player)] : [player]) {
        const gone = state.players[p].deck.splice(0, n);
        if (!gone.length) continue;
        state.players[p].discard.push(...gone);
        events.push({ t: "mill", p, uids: gone });
        paid(gone);
      }
      return;
    }
    if (from === "hand") {
      const uids = side.hand.filter((uid) => fits(defOf(state, uid, defs), what));
      if (uids.length) askChoose(state, { player, zone: "hand", what, uids, min: exact ? n : 0, max: n || uids.length, effect: { op: "payFor" } });
      return;
    }
    if (from === "tools") {
      const uids = inPlay(state, player).map(([slot]) => slot.tool).filter(Boolean);
      if (uids.length) askChoose(state, { player, zone: "play", what: "tool", uids, min: 0, max: uids.length, effect: { op: "payFor" } });
      return;
    }
    const slots = from === "self" ? [[ctx.slot, spotOf(ctx)]] : inPlay(state, player).filter(([, spot]) => from === "own" || spot !== ACTIVE);
    // `energy` is one kind or a list of them ("in any combination of basic Fire and basic Lightning Energy");
    // `oneKind`: all of the cards chosen of one of them ("any amount of basic Fire Energy or any amount of basic Lightning Energy").
    const kinds = [].concat(energy);
    const fit = (uid) => {
      const def = defOf(state, uid, defs);
      return def.kind === "energy" && kinds.some((k) => (!k.basic || def.basic) && (!k.type || (def.provides || []).some((u) => fitsType(u, k.type))));
    };
    const uids = slots.flatMap(([slot]) => slot.energy.filter(fit));
    if (!uids.length) return;
    const rule = oneKind ? { rule: { oneOf: kinds.map((k) => `${k.basic ? "basicEnergy" : "energy"}${k.type ? `:${k.type}` : ""}`) } } : {};
    if (!all) return askChoose(state, { player, zone: "play", what: kinds.every((k) => k.basic) ? "basicEnergy" : "energy", uids, min: 0, max: n || uids.length, effect: { op: "payFor" }, ...rule });
    for (const [slot, spot] of slots) {
      const gone = slot.energy.filter(fit);
      if (!gone.length) continue;
      slot.energy = slot.energy.filter((uid) => !gone.includes(uid));
      side.discard.push(...gone);
      events.push({ t: "discard-energy", p: player, spot: spot ?? ACTIVE, uids: gone });
      paid(gone);
    }
  },
  /** More damage when something is true (TESTS). */
  bonusIf(ctx, { n, test, ...args }) {
    if (TESTS[test](ctx, args)) ctx.hit.damage += n;
  },
  /** Heal the attacker by the damage its attack just did to the other Active Pokémon (engine.js keeps it in hit.dealt). */
  healDealt(ctx) {
    OPS.healSelf(ctx, { n: ctx.hit.dealt || 0 });
  },
  /** The damage skips Weakness, Resistance, or what earlier attacks left on the target. */
  typing(ctx, { noWeakness = false, noResistance = false, noEffects = false }) {
    if (noWeakness) ctx.hit.noWeakness = true;
    if (noResistance) ctx.hit.noResistance = true;
    if (noEffects) ctx.hit.noEffects = true;
  },
  /** An effect that lasts a turn (engine.js, "effects that last a turn"). `mine`: it holds on the attacker's own next turn. */
  mark(ctx, { kind, on = "self", mine = false, n = 0, name = "", from = "" }) {
    const p = on === "self" ? ctx.player : other(ctx.player);
    const slot = on === "self" ? ctx.slot : ctx.state.players[p].active;
    if (!slot || (on !== "self" && ctx.shielded)) return;
    addMark(ctx.state, slot, { kind, turn: ctx.state.turn + (mine ? 2 : 1), ...(n ? { n } : {}), ...(name ? { name } : {}), ...(from ? { from } : {}) });
    ctx.events.push({ t: "mark", p, kind, ...(n ? { n } : {}), ...(name ? { name } : {}) });
  },
  /**
   * Damage beyond the Active Pokémon. `to`: "bench" (theirs), "any" (theirs, the Active one
   * included, with Weakness and Resistance for it alone), "ownBench". `count` 0 is all of them;
   * otherwise the attacker chooses that many, when there are more than that to choose from.
   */
  spread(ctx, { n, to = "bench", count = 0, noTyping = false, pierce = false }) {
    const { state, player, events } = ctx;
    const p = to === "ownBench" ? player : other(player);
    const side = state.players[p];
    const spots = [...(to === "any" && side.active ? [ACTIVE] : []), ...side.bench.map((_, i) => i)];
    if (!spots.length) return;
    const from = to === "any" ? ctx.slot.uid : "";
    // "This attack's damage isn't affected by Weakness or Resistance" holds for this damage too.
    // `pierce`: nor by effects on that Pokémon (an Ability that keeps Benched Pokémon safe).
    const typing = { ...(noTyping || ctx.hit.noWeakness ? { noWeakness: true } : {}), ...(noTyping || ctx.hit.noResistance ? { noResistance: true } : {}), ...(pierce ? { pierce } : {}) };
    if (count && spots.length > count) return askPick(state, { player, side: p, spots, left: count, effect: { op: "damage", n, from, attack: true, ...typing } });
    // No choice to make: it lands on all of them now.
    for (const spot of spots) {
      const slot = spot === ACTIVE ? side.active : side.bench[spot];
      const dealt = spot === ACTIVE && from ? damageAfterTyping(n, defOf(state, from, ctx.defs), defOf(state, slot.uid, ctx.defs), typing) : { amount: n, weak: false, resist: false };
      if (dealt.amount <= 0) continue;
      if (pierce ? defOf(state, slot.uid, ctx.defs).tera && spot !== ACTIVE : benchSafe(state, slot, spot, ctx.defs)) continue;
      slot.damage += dealt.amount;
      struck(state, slot, dealt.amount);
      events.push({ t: "damage", p, spot, n: dealt.amount, weak: dealt.weak, resist: dealt.resist });
    }
  },
  /** The attacker trades places with one of its Benched Pokémon (its player chooses). */
  switchSelf(ctx, { optional = false }) {
    const { state, player } = ctx;
    const side = state.players[player];
    if (!side.bench.length || hpLeft(state, ctx.slot, ctx.defs) <= 0) return;
    askPick(state, { player, side: player, spots: side.bench.map((_, i) => i), left: 1, effect: { op: "switch" }, optional });
  },
  /** The other Active Pokémon is switched out; its own player chooses what comes in. */
  switchFoe(ctx) {
    const { state, player } = ctx;
    const foe = other(player);
    const side = state.players[foe];
    if (!side.active || !side.bench.length || ctx.shielded || hpLeft(state, side.active, ctx.defs) <= 0) return;
    if (side.bench.length === 1) return switchActive(state, foe, 0, ctx.events, ctx.defs);
    askPick(state, { player: foe, side: foe, spots: side.bench.map((_, i) => i), left: 1, effect: { op: "switch" } });
  },
  /** Discard Energy from the other Active Pokémon. */
  discardFoeEnergy(ctx, { n }) {
    const foe = other(ctx.player);
    const slot = ctx.state.players[foe].active;
    if (!slot || ctx.shielded) return;
    const gone = slot.energy.splice(Math.max(0, slot.energy.length - n), n);
    if (!gone.length) return;
    ctx.state.players[foe].discard.push(...gone);
    ctx.events.push({ t: "discard-energy", p: foe, spot: -1, uids: gone });
  },
  /** Discard cards from the top of the other player's deck. */
  mill(ctx, { n }) {
    const foe = other(ctx.player);
    const gone = ctx.state.players[foe].deck.splice(0, n);
    if (!gone.length) return;
    ctx.state.players[foe].discard.push(...gone);
    ctx.events.push({ t: "mill", p: foe, uids: gone });
  },
  /** Flip a coin and run one list of steps or the other. */
  flip(ctx, { heads = [], tails = [] }) {
    runSteps(flips(ctx, 1)[0] ? heads : tails, ctx);
  },
  /** A Special Condition on the other Active Pokémon, or on the attacker itself. */
  condition(ctx, { kind, self = false }) {
    const slot = self ? ctx.slot : ctx.state.players[other(ctx.player)].active;
    const p = self ? ctx.player : other(ctx.player);
    if (!slot || (!self && ctx.shielded)) return;
    if (addCondition(ctx.state, slot, kind, ctx.defs)) ctx.events.push({ t: "condition", p, kind });
  },
  /** The attacker hurts itself. No Weakness or Resistance: it is not an attack on it. */
  selfDamage(ctx, { n }) {
    ctx.slot.damage += n;
    ctx.events.push({ t: "damage", p: ctx.player, spot: -1, n, self: true });
  },
  draw(ctx, { n }) {
    const side = ctx.state.players[ctx.player];
    const drawn = side.deck.splice(0, n);
    if (!drawn.length) return;
    side.hand.push(...drawn);
    ctx.events.push({ t: "draw", p: ctx.player, uids: drawn });
  },
  /**
   * Card and zone effects a Trainer also has (a search, a draw, a heal, Energy from the discard pile): the
   * Trainer's own steps (js/tcg/trainers.js), run for this attack. A price it can't pay ("Discard a card from
   * your hand. If you do, ...") and nothing of it happens.
   */
  trainer(ctx, { steps }) {
    const tc = trainerCtx(ctx);
    if (steps.some((step) => T_OPS[step.op]?.must && !T_OPS[step.op].ready(tc, step))) return;
    runTrainer(steps, tc);
  },
  /** "You may ...": the attacking player says yes or no. Not asked when it would do nothing. */
  may(ctx, { steps, prompt }) {
    if (steps.every((step) => step.op === "trainer") && !trainerReady(steps.flatMap((step) => step.steps), trainerCtx(ctx))) return;
    ctx.state.pending.push({ type: "option", player: ctx.player, why: "may", prompt, labels: ["Yes", "No"], options: [[{ op: "fx", steps, uid: ctx.slot.uid }], []] });
  },
  /**
   * Damage counters on their Pokémon (not damage: no Weakness, Resistance or Bench protection, but an Ability
   * that keeps off attack effects does). `where` "any", "bench", "active". `spread`: n/10 counters one at a time,
   * "in any way you like"; else `count` Pokémon get n each (0: each of them), the attacker's choice.
   */
  counters(ctx, { n, where = "any", count = 0, spread = false }) {
    const { state, player, defs, events } = ctx;
    const foe = other(player);
    const spots = inPlay(state, foe).filter(([slot, spot]) => (where === "bench" ? spot !== ACTIVE : where === "active" ? spot === ACTIVE : true) && !warded(state, slot, { player, src: "attack" }, defs)).map(([, spot]) => spot);
    if (!spots.length) return;
    if (spread && spots.length > 1) return askPick(state, { player, side: foe, spots, left: n / 10, again: true, effect: { op: "damage", n: 10, counters: true } });
    if (!spread && count && spots.length > count) return askPick(state, { player, side: foe, spots, left: count, effect: { op: "damage", n, counters: true } });
    for (const spot of spread ? spots.slice(0, 1) : spots) {
      const slot = spot === ACTIVE ? state.players[foe].active : state.players[foe].bench[spot];
      slot.damage += n;
      events.push({ t: "damage", p: foe, spot, n });
    }
  },
  /** Energy from the attacker to one of its owner's Benched Pokémon: the player chooses the cards (`all`: every one of them), then where. */
  moveOwnEnergy(ctx, { n = 1, type = "", basic = false, all = false }) {
    const { state, player, defs, slot } = ctx;
    const from = spotOf(ctx);
    const bench = state.players[player].bench.map((_, i) => i).filter((i) => i !== from);
    const uids = slot.energy.filter((uid) => {
      const def = defOf(state, uid, defs);
      return (!type || (def.provides || []).includes(type)) && (!basic || def.basic);
    });
    if (from == null || !bench.length || !uids.length) return;
    // Nothing to tell apart (all of them, or cards all alike): no need to ask which.
    if (all || uids.length <= n || new Set(uids.map((uid) => state.cards[uid])).size === 1) return askPick(state, { player, side: player, spots: bench, left: 1, effect: { op: "moveEnergyCards", from, uids: all ? uids : uids.slice(-n) } });
    askChoose(state, { player, zone: "play", what: "energy", uids, min: n, max: n, effect: { op: "carryEnergy", from } });
  },
  /** Energy from the attacker back to its owner's hand: the player chooses which, when they differ. */
  energyToHand(ctx, { n = 1 }) {
    const { state, player, events, slot } = ctx;
    const uids = slot.energy.slice();
    const spot = spotOf(ctx);
    if (!uids.length || spot == null) return;
    if (uids.length > n && new Set(uids.map((uid) => state.cards[uid])).size > 1) return askChoose(state, { player, zone: "play", what: "energy", uids, min: n, max: n, effect: { op: "takeBack" } });
    const back = slot.energy.splice(Math.max(0, slot.energy.length - n), n);
    state.players[player].hand.push(...back);
    events.push({ t: "energy-to-hand", p: player, spot, uids: back });
  },
  /** "Your opponent reveals their hand": the attacker is shown it (a choice of none of its cards, so the screen shows them). */
  lookHand(ctx) {
    const { state, player, events } = ctx;
    const foe = other(player);
    const hand = state.players[foe].hand.slice();
    if (!hand.length) return;
    events.push({ t: "reveal-hand", p: foe, uids: hand });
    askChoose(state, { player, owner: foe, zone: "hand", what: "any", uids: hand, min: 0, max: 0, effect: { op: "look" } });
  },
  /** Discard a Special Energy from the other Active Pokémon: the attacker chooses which, when they differ. */
  discardFoeSpecial(ctx) {
    const { state, player, defs, events } = ctx;
    const foe = other(player);
    const slot = state.players[foe].active;
    if (!slot || ctx.shielded) return;
    const uids = slot.energy.filter((uid) => !defOf(state, uid, defs).basic);
    if (new Set(uids.map((uid) => state.cards[uid])).size > 1) return askChoose(state, { player, zone: "play", what: "energy", uids, min: 1, max: 1, effect: { op: "dropInPlay" } });
    const gone = uids.slice(-1);
    if (!gone.length) return;
    slot.energy.splice(slot.energy.indexOf(gone[0]), 1);
    state.players[foe].discard.push(...gone);
    events.push({ t: "discard-energy", p: foe, spot: ACTIVE, uids: gone });
  },
  /** "Choose 1 of the Defending Pokémon's attacks. That Pokémon can't use that attack during your opponent's next turn." */
  lockFoeAttack(ctx) {
    const { state, player, defs } = ctx;
    const target = state.players[other(player)].active;
    if (!target || ctx.shielded) return;
    const names = [...new Set(defOf(state, target.uid, defs).attacks.map((a) => a.name))];
    const lock = (name) => ({ op: "mark", kind: "noUse", on: "foe", name });
    if (names.length === 1) return OPS.mark(ctx, lock(names[0]));
    if (names.length) state.pending.push({ type: "option", player, why: "foeAttack", prompt: "Choose the attack it can't use during their next turn.", labels: names, options: names.map((name) => [{ op: "fx", steps: [lock(name)], uid: ctx.slot.uid }]) });
  },
  /** Random cards from the other player's hand: to their discard pile, or (`to: "deck"`) shuffled into their deck. */
  foeHandRandom(ctx, { n = 1, to = "discard" }) {
    const { state, player, events } = ctx;
    const foe = other(player);
    const side = state.players[foe];
    const gone = [];
    for (let i = 0; i < n && side.hand.length; i += 1) gone.push(...side.hand.splice(Math.floor(rand(state) * side.hand.length), 1));
    if (!gone.length) return;
    if (to === "deck") {
      side.deck.push(...gone);
      shuffle(state, side.deck);
      events.push({ t: "hand-to-deck", p: foe, uids: gone, at: "into", random: true });
    } else {
      side.discard.push(...gone);
      events.push({ t: "discard-hand", p: foe, uids: gone, random: true });
    }
  },
  /** Before the damage: the Tool on the other Active Pokémon is discarded, so it can't change the damage. */
  dropFoeTool(ctx) {
    const { state, player, defs, events } = ctx;
    const foe = other(player);
    const slot = state.players[foe].active;
    if (!slot?.tool || warded(state, slot, { player, src: "attack" }, defs)) return;
    const uid = slot.tool;
    delete slot.tool;
    delete slot.toolOn;
    toolGone(state, foe, uid, defs);
    events.push({ t: "discard-tool", p: foe, spot: ACTIVE, uid });
  },
  /** The attacker and all attached to it leave play: shuffled into the deck, or (`to: "hand"`) into the hand. `optional`: "you may". */
  selfAway(ctx, { to = "deck", optional = false }) {
    const { state, player, defs, events, slot } = ctx;
    const spot = spotOf(ctx);
    if (spot == null || hpLeft(state, slot, defs) <= 0) return;
    if (optional && to === "deck") return askPick(state, { player, side: player, spots: [spot], left: 1, optional: true, effect: { op: "shuffleIn" } });
    const side = state.players[player];
    const cards = [slot.uid, ...slot.under, ...slot.energy, ...(slot.tool ? [slot.tool] : []), ...heldOn(slot)];
    if (spot === ACTIVE) side.active = null;
    else side.bench.splice(spot, 1);
    if (to === "hand") {
      side.hand.push(...cards);
      events.push({ t: "bounce", p: player, spot, uid: slot.uid });
    } else {
      side.deck.push(...cards);
      shuffle(state, side.deck);
      events.push({ t: "shuffle-in", p: player, spot, uid: slot.uid });
    }
  },
  /** Discard Energy from the attacker: of one type when the card names it, any otherwise. */
  discardEnergy(ctx, { n, type }) {
    const { state, defs, slot, player } = ctx;
    const gone = [];
    for (let i = slot.energy.length - 1; i >= 0 && gone.length < n; i -= 1) {
      const provides = defs(state.cards[slot.energy[i]]).provides || [];
      if (type && !provides.includes(type)) continue;
      gone.push(...slot.energy.splice(i, 1));
    }
    if (!gone.length) return;
    state.players[player].discard.push(...gone);
    ctx.events.push({ t: "discard-energy", p: player, spot: -1, uids: gone });
  },
};

const N = "(\\d+|an?|one|two|three|four|five|six)";
const TYPE = "(Grass|Fire|Water|Lightning|Psychic|Fighting|Darkness|Metal|Fairy)";
const SHUFFLED = "(?:Then, shuffle your deck\\.|Shuffle your deck afterward\\.)";

const COND = "(Asleep|Burned|Confused|Paralyzed|Poisoned)";
const FOE = "(?:the Defending Pokémon|your opponent's Active Pokémon)";
const mark = (kind, more = {}) => ({ op: "mark", when: "after", kind, ...more });
const cond = (kind, self = false) => ({ op: "condition", when: "after", kind: kind.toLowerCase(), ...(self ? { self } : {}) });

const OPP = "your opponent's Active Pokémon";
const POKE_TYPE = "(Grass|Fire|Water|Lightning|Psychic|Fighting|Darkness|Metal|Fairy|Dragon|Colorless)";

/** "for each <phrase>" (with the Defending Pokémon read as the opponent's Active one): { per, type } from COUNTS, or null. */
function countOf(phrase) {
  const p = phrase.replace(/the Defending Pokémon/g, OPP);
  const energy = p.match(new RegExp(`^(?:${TYPE} )?Energy( cards?)? attached to (this Pokémon|${OPP}|both Active Pokémon|this Pokémon and ${OPP}|all of your opponent's Pokémon|all of your Pokémon)$`));
  if (energy) {
    const [, type = "", card, on] = energy;
    const per = { "this Pokémon": "selfEnergy", [OPP]: "foeEnergy", "both Active Pokémon": "bothEnergy", [`this Pokémon and ${OPP}`]: "bothEnergy", "all of your opponent's Pokémon": "foeAllEnergy", "all of your Pokémon": "ownAllEnergy" }[on];
    if (card) return per === "selfEnergy" || per === "foeEnergy" ? { per: `${per}Cards`, type } : null;
    return { per, type };
  }
  const discard = p.match(new RegExp(`^${TYPE} Pokémon in your discard pile$`));
  if (discard) return { per: "discardType", type: discard[1] };
  const per = [
    [/^damage counters? on this Pokémon$/, "selfCounters"],
    [new RegExp(`^damage counters? on ${OPP}$`), "foeCounters"],
    [/^(?:of )?your opponent's Benched Pokémon$/, "foeBench"],
    [/^(?:of )?your Benched Pokémon$/, "ownBench"],
    [/^Benched Pokémon \(both yours and your opponent's\)$/, "allBench"],
    [/^(?:of )?your Pokémon in play$/, "ownInPlay"],
    [new RegExp(`^Colorless in ${OPP}'s Retreat Cost$`), "foeRetreat"],
    [/^Prize cards? your opponent has taken$/, "foePrizesTaken"],
    [/^Prize cards? you have taken$/, "ownPrizesTaken"],
    [/^cards? in your opponent's hand$/, "foeHand"],
    [/^cards? in your hand$/, "ownHand"],
    [new RegExp(`^Special Conditions? affecting ${OPP}$`), "foeConditions"],
    [/^(?:of )?your Pokémon that (?:has|have) any damage counters on (?:it|them)$/, "ownDamaged"],
    [/^Pokémon Tools?(?: cards?)? attached to all of your Pokémon$/, "ownTools"],
    [/^damage counters? on all of your Benched Pokémon$/, "benchCounters"],
  ].find(([re]) => re.test(p));
  const benched = !per && p.match(/^damage counters? on all of your Benched (.+)$/);
  if (benched && pokemonKind(benched[1])) return { per: "benchCounters", type: pokemonKind(benched[1]) };
  return per ? { per: per[1], type: "" } : null;
}

const BOXES = { "Pokémon ex": ["ex"], "Pokémon-ex": ["ex"], "Pokémon-EX": ["EX"], "Pokémon-GX": ["GX"], "Pokémon GX": ["GX"], "Pokémon V": ["V", "VMAX", "VSTAR"], "Pokémon VMAX": ["VMAX"], "Pokémon VSTAR": ["VSTAR"], "Pokémon ex or Pokémon V": ["ex", "V", "VMAX", "VSTAR"] };

/** "If <phrase>, this attack does more damage": { test, ...args } from TESTS, or null. */
function testOf(phrase) {
  const p = phrase.replace(/the Defending Pokémon/g, OPP);
  let m;
  if (new RegExp(`^${OPP} (?:already )?has any damage counters on it$`).test(p)) return { test: "foeDamaged" };
  if ((m = p.match(new RegExp(`^${OPP} (?:already )?has at least (\\d+) damage counters? on it$`)))) return { test: "foeCountersAtLeast", k: Number(m[1]) };
  if (/^this Pokémon has any damage counters on it$/.test(p)) return { test: "selfDamaged" };
  if ((m = p.match(new RegExp(`^${OPP} is an? (Evolution|Evolved|Basic) Pokémon$`)))) return { test: "foeStage", stage: m[1] === "Basic" ? "basic" : "evolution" };
  if ((m = p.match(new RegExp(`^${OPP} is (?:an? )?(.+)$`))) && BOXES[m[1]]) return { test: "foeBox", boxes: BOXES[m[1]] };
  if ((m = p.match(new RegExp(`^${OPP} is an? ${POKE_TYPE} Pokémon$`)))) return { test: "foeType", type: m[1] };
  if ((m = p.match(new RegExp(`^${OPP} is ${COND}$`)))) return { test: "foeStatus", kind: m[1].toLowerCase() };
  if (new RegExp(`^${OPP} is affected by a Special Condition$`).test(p)) return { test: "foeStatus" };
  if (/^this Pokémon is affected by a Special Condition$/.test(p)) return { test: "selfStatus" };
  if (/^your Benched Pokémon have any damage counters on them$/.test(p)) return { test: "benchDamaged" };
  if (/^(?:there is any Stadium card in play|a Stadium is in play)$/.test(p)) return { test: "stadium" };
  if (/^you have a Stadium in play$/.test(p)) return { test: "stadium", own: true };
  if (/^this Pokémon has a Pokémon Tool(?: card)? attached(?: to it)?$/.test(p)) return { test: "selfTool" };
  if (new RegExp(`^${OPP} has a Pokémon Tool(?: card)? attached(?: to it)?$`).test(p)) return { test: "foeTool" };
  if (/^this Pokémon has any Special Energy attached(?: to it)?$/.test(p)) return { test: "selfSpecial" };
  if ((m = p.match(new RegExp(`^this Pokémon has any ${TYPE} Energy attached(?: to it)?$`)))) return { test: "selfEnergyType", type: m[1] };
  if (/^you have the same number of cards in your hand as your opponent$/.test(p)) return { test: "hands", how: "same" };
  if (/^you have more cards in your hand than your opponent$/.test(p)) return { test: "hands", how: "more" };
  if (/^you have no cards in your hand$/.test(p)) return { test: "hands", how: "none" };
  if ((m = p.match(/^your opponent has (\d+) or fewer Prize cards remaining$/))) return { test: "foePrizesAtMost", k: Number(m[1]) };
  if (/^you have more Prize cards remaining than your opponent$/.test(p)) return { test: "behind" };
  if (/^you played a Supporter card from your hand during this turn$/.test(p)) return { test: "supporter" };
  if (new RegExp(`^this Pokémon has less Energy attached to it than ${OPP}$`).test(p)) return { test: "lessEnergy" };
  if (new RegExp(`^this Pokémon and ${OPP} have a different amount of Energy attached to them$`).test(p)) return { test: "energyDiffers" };
  if (new RegExp(`^this Pokémon and ${OPP} don't have the same number of Energy cards attached to them$`).test(p)) return { test: "energyCardsDiffer" };
  if (new RegExp(`^${OPP} has any Energy cards attached to it$`).test(p)) return { test: "foeEnergyCards" };
  if (new RegExp(`^${OPP} has any Resistance$`).test(p)) return { test: "foeResistance" };
  // "If here are no damage counters" is how two cards print it.
  if (new RegExp(`^t?here are no damage counters on ${OPP}$`).test(p)) return { test: "foeUndamaged" };
  if ((m = p.match(/^this Pokémon's remaining HP is (\d+) or less$/))) return { test: "selfHpAtMost", k: Number(m[1]) };
  if ((m = p.match(/^this Pokémon has (\d+) or more damage counters on it$/))) return { test: "selfCountersAtLeast", k: Number(m[1]) };
  if ((m = p.match(/^all of your Benched Pokémon have at least (\d+) damage counters? on them$/))) return { test: "benchAllCounters", k: Number(m[1]) };
  if (/^this Pokémon moved from your Bench to the Active Spot this turn$/.test(p)) return { test: "movedUp" };
  if (/^this Pokémon was healed during this turn$/.test(p)) return { test: "healed" };
  if ((m = p.match(/^any of your (.*?) ?were Knocked Out by damage from (?:an attack during your opponent's last turn|an opponent's attack during (?:his or her|their) last turn|an attack from your opponent's Pokémon during their last turn)$/))) {
    if (m[1] === "Pokémon") return { test: "downed" };
    const who = pokemonKind(m[1]);
    return who ? { test: "downed", who } : null;
  }
  if (/^this Pokémon was on your Bench this turn$/.test(p)) return { test: "movedUp" };
  if ((m = p.match(/^there are (\d+) or more damage counters on this Pokémon$/))) return { test: "selfCountersAtLeast", k: Number(m[1]) };
  if (new RegExp(`^this Pokémon has fewer remaining HP than ${OPP}$`).test(p)) return { test: "hpBelowFoe" };
  if (new RegExp(`^${OPP} has fewer remaining HP than this Pokémon$`).test(p)) return { test: "foeHpBelow" };
  if (/^you have the same number of or less Benched Pokémon than your opponent$/.test(p)) return { test: "benchNoMore" };
  if (/^(?:this Pokémon was damaged by an attack|an attack damaged this Pokémon) during your opponent's last turn$/.test(p)) return { test: "struck" };
  return null;
}

const perCount = (how, n, phrase, more = {}) => {
  const c = countOf(phrase);
  return c && [{ op: "bonusPer", when: "before", ...(how === "more" ? {} : { how }), n: Number(n), per: c.per, ...(c.type ? { type: c.type } : {}), ...more }];
};
const ifMore = (phrase, n) => {
  const t = testOf(phrase);
  return t && [{ op: "bonusIf", when: "before", n: Number(n), ...t }];
};

/** [wording, steps]. A text compiles only when its sentences are all read. */
const PATTERNS = [
  [new RegExp(`^${FOE} is now ${COND}\\.$`, "i"), (m) => [cond(m[1])]],
  [new RegExp(`^${FOE} is now ${COND} and ${COND}\\.$`, "i"), (m) => [cond(m[1]), cond(m[2])]],
  [new RegExp(`^Flip a coin\\. If heads, ${FOE} is now ${COND}\\.$`, "i"), (m) => [{ op: "flip", when: "after", heads: [cond(m[1])] }]],
  [new RegExp(`^Flip a coin\\. If heads, ${FOE} is now ${COND}\\. If tails, (?:the Defending Pokémon|it) is now ${COND}\\.$`, "i"), (m) => [{ op: "flip", when: "after", heads: [cond(m[1])], tails: [cond(m[2])] }]],
  [new RegExp(`^Flip a coin\\. If heads, ${FOE} is now ${COND}; if tails, (?:the Defending Pokémon|it) is now ${COND}\\.$`, "i"), (m) => [{ op: "flip", when: "after", heads: [cond(m[1])], tails: [cond(m[2])] }]],
  [/^This attack's damage isn't affected by Resistance\.$/, () => [{ op: "typing", when: "before", noResistance: true }]],
  [/^This attack's damage isn't affected by Weakness\.$/, () => [{ op: "typing", when: "before", noWeakness: true }]],
  [/^This attack's damage isn't affected by Weakness or Resistance\.$/, () => [{ op: "typing", when: "before", noWeakness: true, noResistance: true }]],
  [/^Don't apply (Weakness|Resistance|Weakness and Resistance)(?: for this attack)?\.$/, (m) => [{ op: "typing", when: "before", noWeakness: /Weak/.test(m[1]), noResistance: /Resist/.test(m[1]) }]],
  [new RegExp(`^This Pokémon is now ${COND}\\.$`), (m) => [cond(m[1], true)]],
  // Effects that last a turn.
  [/^During your next turn, this Pokémon can't attack\.$/, () => [mark("noAttack", { mine: true })]],
  [/^(?!If )(?:(?!\. ).)+ can't attack during your next turn\.$/, () => [mark("noAttack", { mine: true })]],
  [/^During your next turn, this Pokémon can't use (.+)\.$/, (m) => [mark("noUse", { mine: true, name: m[1] })]],
  [/^(?!If )(?:(?!\. ).)+ can't use (.+) during your next turn\.$/, (m) => [mark("noUse", { mine: true, name: m[1] })]],
  [/^During your opponent's next turn, this Pokémon takes (\d+) less damage from attacks(?: \(after applying Weakness and Resistance\))?\.$/, (m) => [mark("less", { n: Number(m[1]) })]],
  [/^During your opponent's next turn, any damage done to this Pokémon by attacks is reduced by (\d+)(?: \(after applying Weakness and Resistance\))?\.$/, (m) => [mark("less", { n: Number(m[1]) })]],
  [/^The Defending Pokémon can't retreat during your opponent's next turn\.$/, () => [mark("noRetreat", { on: "foe" })]],
  [/^During your opponent's next turn, the Defending Pokémon can't retreat\.$/, () => [mark("noRetreat", { on: "foe" })]],
  [/^If the Defending Pokémon tries to attack during your opponent's next turn, your opponent flips a coin\. If tails, that attack does(?: nothing|n't happen)\.$/, () => [mark("mustFlip", { on: "foe" })]],
  [/^Flip a coin\. If heads, during your opponent's next turn, prevent all damage from and effects of attacks done to this Pokémon\.$/, () => [{ op: "flip", when: "after", heads: [mark("shield")] }]],
  [/^Flip a coin\. If heads, prevent all effects of attacks, including damage, done to this Pokémon during your opponent's next turn\.$/, () => [{ op: "flip", when: "after", heads: [mark("shield")] }]],
  [/^Flip a coin\. If heads, during your opponent's next turn, prevent all damage done to this Pokémon by attacks\.$/, () => [{ op: "flip", when: "after", heads: [mark("guard")] }]],
  [/^Flip a coin\. If heads, prevent all damage done to (?:(?!\. ).)+ during your opponent's next turn\.(?: \(Any other effects of attacks still happen\.\))?$/, () => [{ op: "flip", when: "after", heads: [mark("guard")] }]],
  [/^This attack's damage isn't affected by any effects on your opponent's Active Pokémon\.$/, () => [{ op: "typing", when: "before", noEffects: true }]],
  [/^This attack's damage isn't affected by Weakness or Resistance, or by any effects on your opponent's Active Pokémon\.$/, () => [{ op: "typing", when: "before", noWeakness: true, noResistance: true, noEffects: true }]],
  // Damage beyond the Active Pokémon, and switching.
  [new RegExp(`^(?:This attack does|Does) (\\d+) damage to ${N} of your opponent's Benched Pokémon\\.(?: \\(Don't apply Weakness and Resistance for Benched Pokémon\\.\\))?$`, "i"), (m) => [{ op: "spread", when: "after", n: Number(m[1]), to: "bench", count: count(m[2]) }]],
  [new RegExp(`^This attack also does (\\d+) damage to ${N} of your opponent's Benched Pokémon\\.(?: \\(Don't apply Weakness and Resistance for Benched Pokémon\\.\\))?$`, "i"), (m) => [{ op: "spread", when: "after", n: Number(m[1]), to: "bench", count: count(m[2]) }]],
  [new RegExp(`^This attack does (\\d+) damage to ${N} of your opponent's Pokémon\\.(?: \\(Don't apply Weakness and Resistance for Benched Pokémon\\.\\))?$`, "i"), (m) => [{ op: "spread", when: "after", n: Number(m[1]), to: "any", count: count(m[2]) }]],
  [new RegExp(`^Choose ${N} of your opponent's Pokémon\\. This attack does (\\d+) damage to (?:that|each of those) Pokémon\\.(?: \\(Don't apply Weakness and Resistance for Benched Pokémon\\.\\))?$`, "i"), (m) => [{ op: "spread", when: "after", n: Number(m[2]), to: "any", count: count(m[1]) }]],
  [new RegExp(`^Choose ${N} of your opponent's Pokémon\\. This attack does (\\d+) damage to (?:that Pokémon|each of them)\\. This attack's damage isn't affected by Weakness, Resistance, Poké-Powers, Poké-Bodies, or any other effects on (?:that Pokémon|those Pokémon)\\.$`, "i"), (m) => [{ op: "spread", when: "after", n: Number(m[2]), to: "any", count: count(m[1]), noTyping: true, pierce: true }]],
  [new RegExp(`^Choose ${N} of your opponent's Pokémon\\. This attack does (\\d+) damage to that Pokémon\\. Don't apply Weakness and Resistance for this attack\\. \\(Any other effects that would happen after applying Weakness and Resistance still happen\\.\\)$`, "i"), (m) => [{ op: "spread", when: "after", n: Number(m[2]), to: "any", count: count(m[1]), noTyping: true }]],
  [/^This attack does (\d+) damage to each of your opponent's Pokémon\.(?: \(Don't apply Weakness and Resistance for Benched Pokémon\.\))?$/, (m) => [{ op: "spread", when: "after", n: Number(m[1]), to: "any" }]],
  [/^(?:This attack also does|Does) (\d+) damage to each of your opponent's Benched Pokémon\.(?: \(Don't apply Weakness and Resistance for Benched Pokémon\.\))?$/, (m) => [{ op: "spread", when: "after", n: Number(m[1]), to: "bench" }]],
  [/^This attack also does (\d+) damage to each of your Benched Pokémon\.(?: \(Don't apply Weakness and Resistance for Benched Pokémon\.\))?$/, (m) => [{ op: "spread", when: "after", n: Number(m[1]), to: "ownBench" }]],
  [new RegExp(`^Switch this Pokémon with ${N} of your Benched Pokémon\\.$`, "i"), () => [{ op: "switchSelf", when: "after" }]],
  [new RegExp(`^You may switch this Pokémon with ${N} of your Benched Pokémon\\.$`, "i"), () => [{ op: "switchSelf", when: "after", optional: true }]],
  [new RegExp(`^Your opponent switches (?:the Defending Pokémon|his or her Active Pokémon|their Active Pokémon) with ${N} of (?:his or her|their) Benched Pokémon\\.$`, "i"), () => [{ op: "switchFoe", when: "after" }]],
  // Damage that counts something.
  [new RegExp(`^Flip ${N} coins?\\. This attack does (\\d+) more damage for each heads\\.$`, "i"), (m) => [{ op: "flipBonusEach", when: "before", coins: count(m[1]), n: Number(m[2]) }]],
  [/^Flip a coin until you get tails\. This attack does (\d+) damage (?:times the number of heads|for each heads)\.$/, (m) => [{ op: "flipUntilTails", when: "before", n: Number(m[1]) }]],
  [new RegExp(`^Discard all (?:${TYPE} )?Energy(?: cards)? (?:from|attached to) this Pokémon\\.$`, "i"), (m) => [{ op: "discardEnergy", when: "after", n: 99, type: m[1] ? upper(m[1].toLowerCase()) : "" }]],
  [/^Flip a coin\. If heads, discard an Energy (?:card )?(?:from|attached to) (?:your opponent's Active Pokémon|the Defending Pokémon)\.$/, () => [{ op: "flip", when: "after", heads: [{ op: "discardFoeEnergy", n: 1 }] }]],
  [/^Discard an Energy (?:card )?(?:from|attached to) (?:your opponent's Active Pokémon|the Defending Pokémon)\.$/, () => [{ op: "discardFoeEnergy", when: "after", n: 1 }]],
  [new RegExp(`^Discard the top ${N}? ?cards? of your opponent's deck\\.$`, "i"), (m) => [{ op: "mill", when: "after", n: m[1] ? count(m[1]) : 1 }]],
  [new RegExp(`^Flip a coin\\. If heads, this attack does (\\d+) more damage\\.$`), (m) => [{ op: "flipBonus", when: "before", n: Number(m[1]) }]],
  [new RegExp(`^Flip a coin\\. If heads, this attack does \\d+ damage plus (\\d+) more damage(?:; if tails, this attack does \\d+ damage)?\\.$`), (m) => [{ op: "flipBonus", when: "before", n: Number(m[1]) }]],
  [new RegExp(`^Flip a coin\\. If tails, this attack does nothing\\.$`), () => [{ op: "flipOrNothing", when: "before" }]],
  [new RegExp(`^Flip ${N} coins?\\. This attack does (\\d+) damage (?:times the number of heads|for each heads)\\.$`, "i"), (m) => [{ op: "flipTimes", when: "before", coins: count(m[1]), n: Number(m[2]) }]],
  [new RegExp(`^Heal (\\d+) damage from this Pokémon\\.$`), (m) => [{ op: "healSelf", when: "after", n: Number(m[1]) }]],
  [new RegExp(`^Discard ${N} (?:${TYPE} )?Energy(?: cards?)? (?:from|attached to) this Pokémon\\.$`, "i"), (m) => [{ op: "discardEnergy", when: "after", n: count(m[1]), type: m[2] || "" }]],
  [new RegExp(`^Draw ${N} cards?\\.$`, "i"), (m) => [{ op: "draw", when: "after", n: count(m[1]) }]],
  [new RegExp(`^(?!If )(?:(?!\\. ).)+? (?:also )?does (\\d+) damage to itself\\.$`), (m) => [{ op: "selfDamage", when: "after", n: Number(m[1]) }]],
  // The old wording names the Pokémon: "Discard 2 Energy cards attached to Charizard in order to use this attack."
  [new RegExp(`^Discard ${N} (?:${TYPE} )?Energy cards? attached to .+ in order to use this attack\\.$`, "i"), (m) => [{ op: "discardEnergy", when: "after", n: count(m[1]), type: m[2] || "" }]],
  // How much damage: "for each" (countOf) and "If ..." (testOf), in their old and new wordings.
  [/^(?:This attack does|Does) (\d+) more damage (?:for each|times the (?:amount|number) of) (.+)\.$/, (m) => perCount("more", m[1], m[2])],
  [/^(?:This attack does|Does) \d+ damage plus (\d+) more damage (?:for each|times the (?:amount|number) of) (.+)\.$/, (m) => perCount("more", m[1], m[2])],
  [/^(?:This attack does|Does) (\d+) damage (?:for each|times the (?:amount|number) of) (.+)\.$/, (m) => perCount("times", m[1], m[2])],
  [/^(?:This attack does|Does) (\d+) less damage for each (.+)\.$/, (m) => perCount("less", m[1], m[2])],
  [/^(?:This attack does|Does) \d+ damage minus (\d+) damage for each (.+)\.$/, (m) => perCount("less", m[1], m[2])],
  [new RegExp(`^Does \\d+ damage plus (\\d+) more damage for each (?:${TYPE} )?Energy attached to this Pokémon but not used to pay for this attack's Energy cost\\. You can't add more than (\\d+) damage in this way\\.$`), (m) => [{ op: "bonusPer", when: "before", n: Number(m[1]), per: "spareEnergy", ...(m[2] ? { type: m[2] } : {}), cap: Number(m[3]) }]],
  [new RegExp(`^Does \\d+ damage plus (\\d+) more damage for each ${TYPE} Energy attached to this Pokémon but not used to pay for this attack's Energy cost\\. Extra ${TYPE} Energy after the (\\d+)(?:st|nd|rd|th) doesn't count\\.$`), (m) => m[2] === m[3] && [{ op: "bonusPer", when: "before", n: Number(m[1]), per: "spareEnergy", type: m[2], cap: Number(m[1]) * Number(m[4]) }]],
  [/^If (.+?), this attack does (\d+) more damage\.$/, (m) => ifMore(m[1], m[2])],
  [/^If (.+?), this attack does \d+ damage plus (\d+) more damage\.$/, (m) => ifMore(m[1], m[2])],
  [/^(?:This attack's|This) damage (?:isn't|is not) affected by (.+)\.$/, (m) => typingOf(m[1])],
  // Coins that add up.
  [/^Flip a coin until you get tails\. This attack does (?:\d+ damage plus )?(\d+) more damage for each heads\.$/, (m) => [{ op: "flipUntilTails", when: "before", n: Number(m[1]), more: true }]],
  [new RegExp(`^Flip ${N} coins\\. This attack does \\d+ damage plus (\\d+) more damage for each heads\\.$`, "i"), (m) => [{ op: "flipBonusEach", when: "before", coins: count(m[1]), n: Number(m[2]) }]],
  [new RegExp(`^Flip ${N} coins\\. This attack does (\\d+) times the number of heads\\.$`, "i"), (m) => [{ op: "flipTimes", when: "before", coins: count(m[1]), n: Number(m[2]) }]],
  [new RegExp(`^Flip ${N} coins\\. If both of them are heads, this attack does (\\d+) more damage\\.$`, "i"), (m) => [{ op: "flipAll", when: "before", coins: count(m[1]), n: Number(m[2]) }]],
  [/^Flip a coin for each (.+?)\. This attack does (\d+) damage (?:for each heads|times the number of heads)\.$/, (m) => { const c = countOf(m[1]); return c && [{ op: "flipTimes", when: "before", n: Number(m[2]), per: c.per, ...(c.type ? { type: c.type } : {}) }]; }],
  [/^Flip a coin for each (.+?)\. This attack does (?:\d+ damage plus )?(\d+) more damage for each heads\.$/, (m) => { const c = countOf(m[1]); return c && [{ op: "flipBonusEach", when: "before", n: Number(m[2]), per: c.per, ...(c.type ? { type: c.type } : {}) }]; }],
  [/^Flip 3 coins\. If 1 of them is heads, this attack does (?:\d+ damage plus )?(\d+) more damage\. If 2 of them are heads, this attack does (?:\d+ damage plus )?(\d+) more damage\. If all of them are heads, this attack does (?:\d+ damage plus )?(\d+) more damage\.$/, (m) => [{ op: "flipTable", when: "before", coins: 3, more: [0, Number(m[1]), Number(m[2]), Number(m[3])] }]],
  [/^Flip a coin\. If tails, this attack does nothing\. If heads, (?:prevent all effects of attacks, including damage, done to this Pokémon during your opponent's next turn|during your opponent's next turn, prevent all damage from and effects of attacks done to this Pokémon)\.$/, () => [{ op: "flipOrNothing", when: "before", heads: [mark("shield")] }]],
  [/^Does (\d+) damage to each Defending Pokémon\.$/, (m) => [{ op: "setDamage", when: "before", n: Number(m[1]) }]],
  [/^Flip a coin\. If tails, this Pokémon does (\d+) damage to itself\.$/, (m) => [{ op: "flip", when: "after", tails: [{ op: "selfDamage", n: Number(m[1]) }] }]],
  [/^Heal from this Pokémon the same amount of damage you did to (?:the Defending Pokémon|your opponent's Active Pokémon)\.$/, () => [{ op: "healDealt", when: "after" }]],
  // Damage changed during the next turn (engine.js, "effects that last a turn").
  [/^During your opponent's next turn, any damage done by attacks from (?:the Defending Pokémon|your opponent's Active Pokémon) is reduced by (\d+) \(before applying Weakness and Resistance\)\.$/, (m) => [mark("weaker", { on: "foe", n: Number(m[1]) })]],
  [/^During your opponent's next turn, (?:the Defending Pokémon's attacks|attacks used by the Defending Pokémon) do (\d+) less damage \(before applying Weakness and Resistance\)\.$/, (m) => [mark("weaker", { on: "foe", n: Number(m[1]) })]],
  [/^All damage done by attacks to this Pokémon during your opponent's next turn is reduced by (\d+) \(after applying Weakness and Resistance\)\.$/, (m) => [mark("less", { n: Number(m[1]) })]],
  [/^During your next turn, this Pokémon's (.+?) attack does (\d+) more damage \(before applying Weakness and Resistance\)\.$/, (m) => [mark("stronger", { mine: true, name: m[1], n: Number(m[2]) })]],
  [/^During your next turn, (?:each of this Pokémon's attacks does|this Pokémon's attacks do|attacks used by this Pokémon do) (\d+) more damage(?: to your opponent's Active Pokémon)? \(before applying Weakness and Resistance\)\.$/, (m) => [mark("stronger", { mine: true, n: Number(m[1]) })]],
  [/^During your next turn, if an attack does damage to the Defending Pokémon \(after applying Weakness and Resistance\), that attack does (\d+) more damage\.$/, (m) => [mark("exposed", { on: "foe", mine: true, n: Number(m[1]) })]],
  [/^During your next turn, the Defending Pokémon takes (\d+) more damage from attacks \(after applying Weakness and Resistance\)\.$/, (m) => [mark("exposed", { on: "foe", mine: true, n: Number(m[1]) })]],
  [/^During your opponent's next turn, prevent all damage done to this Pokémon by attacks from (Basic|Evolution|Basic non-Colorless) Pokémon\.$/, (m) => [mark("guard", { from: { Basic: "basic", Evolution: "evolution" }[m[1]] || "basicNonColorless" })]],
  [/^During your opponent's next turn, if this Pokémon would be damaged by an attack, prevent that attack's damage done to this Pokémon if that damage is (\d+) or less\.$/, (m) => [mark("harden", { n: Number(m[1]) })]],
  [/^During your opponent's next turn, whenever (\d+) or less damage is done to this Pokémon \(after applying Weakness and Resistance\), prevent that damage\. \(Any other effects of attacks still happen\.\)$/, (m) => [mark("harden", { n: Number(m[1]) })]],
  [/^Flip a coin\. If heads, (?:during your opponent's next turn, prevent all effects of attacks, including damage, done to this Pokémon|prevent all effects of an attack, including damage, done to this Pokémon during your opponent's next turn)\.$/, () => [{ op: "flip", when: "after", heads: [mark("shield")] }]],
  // Cards and zones: decks, hands, discard piles, Energy moved about, damage counters.
  [new RegExp(`^Discard the top (?:${N} )?cards? of your deck\\.$`, "i"), (m) => fromDeck([{ op: "mill", n: m[1] ? count(m[1]) : 1 }])],
  [new RegExp(`^Move ${N} (basic )?(?:${TYPE} )?Energy(?: cards?)? (?:from|attached to) this Pokémon to (?:1|one) of your Benched Pokémon\\.$`, "i"), (m) => [{ op: "moveOwnEnergy", when: "after", n: count(m[1]), basic: Boolean(m[2]), type: m[3] || "" }]],
  [/^Move all Energy(?: cards)? (?:from|attached to) this Pokémon to 1 of your Benched Pokémon\.$/, () => [{ op: "moveOwnEnergy", when: "after", all: true }]],
  [new RegExp(`^Discard ${N} random cards? from your opponent's hand\\.$`, "i"), (m) => [{ op: "foeHandRandom", when: "after", n: count(m[1]) }]],
  [/^Choose (?:1|a) card from your opponent's hand without looking and discard it\.$/, () => [{ op: "foeHandRandom", when: "after", n: 1 }]],
  [/^Choose a random card from your opponent's hand\. Your opponent reveals that card and shuffles it into (?:their|his or her) deck\.$/, () => [{ op: "foeHandRandom", when: "after", n: 1, to: "deck" }]],
  [/^Choose 1 card from your opponent's hand without looking\. Look at (?:the|that) card you chose, then have your opponent shuffle that card into (?:their|his or her) deck\.$/, () => [{ op: "foeHandRandom", when: "after", n: 1, to: "deck" }]],
  [/^Put (\d+) damage counters? on your opponent's (Benched )?Pokémon in any way you like\.$/, (m) => [{ op: "counters", when: "after", n: Number(m[1]) * 10, where: m[2] ? "bench" : "any", spread: true }]],
  [new RegExp(`^Put (\\d+) damage counters? on ${FOE}\\.$`), (m) => [{ op: "counters", when: "after", n: Number(m[1]) * 10, where: "active" }]],
  [new RegExp(`^Put (\\d+) damage counters? on ${N} of your opponent's (Benched )?Pokémon\\.$`, "i"), (m) => [{ op: "counters", when: "after", n: Number(m[1]) * 10, where: m[3] ? "bench" : "any", count: count(m[2]) }]],
  [new RegExp(`^Choose ${N} of your opponent's (Benched )?Pokémon and put (\\d+) damage counters? on (?:it|that Pokémon|each of them)\\.$`, "i"), (m) => [{ op: "counters", when: "after", n: Number(m[3]) * 10, where: m[2] ? "bench" : "any", count: count(m[1]) }]],
  [new RegExp(`^Discard a Special Energy (?:card )?(?:from|attached to) ${FOE}\\.$`), () => [{ op: "discardFoeSpecial", when: "after" }]],
  [/^Choose 1 of (?:the Defending Pokémon's|your opponent's Active Pokémon's) attacks\. (?:That Pokémon can't use that attack during your opponent's next turn|During your opponent's next turn, that Pokémon can't use that attack)\.$/, () => [{ op: "lockFoeAttack", when: "after" }]],
  [new RegExp(`^(?:Attach|Search your discard pile for) (an?|up to ${N}|${N}) (.+?) (?:from your (discard pile|hand) to|and attach (?:it|them) to) this Pokémon\\.$`, "i"), (m) => attachTo(m, m[5] === "hand" ? "hand" : "discard")],
  [new RegExp(`^Attach ${N} (.+?) from your discard pile to (?:1|one) of your (Benched )?Pokémon\\.$`, "i"), (m) => {
    const what = whatOf(m[2]);
    return count(m[1]) > 1 && /^(basicEnergy|energy)(:\\w+)?$/.test(what) ? fromDeck([{ op: "attachPick", zone: "discard", what, to: m[3] ? "bench" : "any", n: count(m[1]), exact: true }]) : null;
  }],
  [new RegExp(`^Attach up to ${N} (.+?) from your discard pile to your Benched Pokémon in any way you like\\.$`, "i"), (m) => {
    const what = whatOf(m[2]);
    return /^(basicEnergy|energy)(:\w+)?$/.test(what) ? fromDeck([{ op: "attachPick", zone: "discard", what, to: "bench", n: count(m[1]), upTo: true, spread: true }]) : null;
  }],
  [new RegExp(`^Search your deck for (an?|up to ${N}|${N}) (.+?) and attach (?:it|them) to (this Pokémon|1 of your Pokémon|1 of your Benched Pokémon|your Pokémon in any way you like|your Benched Pokémon in any way you like)\\. ${SHUFFLED}$`, "i"), (m) => {
    const what = whatOf(m[4]);
    if (!/^(basicEnergy|energy)(:\w+)?$/.test(what)) return null;
    const to = /this/.test(m[5]) ? "self" : /any way/.test(m[5]) ? "spread" : "one";
    return fromDeck([{ op: "fetchEnergy", what, n: /^an?$/i.test(m[1]) ? 1 : count(m[2] || m[3]), to, ...(/Benched/.test(m[5]) ? { where: { to: "bench" } } : {}) }]);
  }],
  [/^Discard (?:a|any) Stadium(?: card)? in play\.$/, () => fromDeck([{ op: "dropStadium" }])],
  [new RegExp(`^Before doing damage, discard all Pokémon Tools?(?: cards)? (?:from|attached to) ${FOE}\\.$`), () => [{ op: "dropFoeTool", when: "before" }]],
  [/^(You may )?[Ss]huffle this Pokémon and all (?:cards attached to it|attached cards) into your deck\.$/, (m) => [{ op: "selfAway", when: "after", optional: Boolean(m[1]) }]],
  [/^Put this Pokémon and all (?:cards attached to it|attached cards) into your hand\.$/, () => [{ op: "selfAway", when: "after", to: "hand" }]],
  [/^Remove (\d+) damage counters? from this Pokémon\.$/, (m) => [{ op: "healSelf", when: "after", n: Number(m[1]) * 10 }]],
  [/^Each player draws (\d+) cards?\.$/, (m) => fromDeck([{ op: "draw", n: Number(m[1]) }, { op: "foeDraw", n: Number(m[1]) }])],
  [new RegExp(`^Put (?:(up to )|any )?${N} cards? from your discard pile into your hand\\.$`, "i"), (m) => fromDeck([{ op: "recover", what: "any", n: count(m[2]), upTo: Boolean(m[1]) }])],
  [new RegExp(`^Search your deck for a card that evolves from this Pokémon and put it onto this Pokémon(?: to evolve it)?\\.(?: \\(This counts as evolving this Pokémon\\.\\))? ${SHUFFLED}$`), () => fromDeck([{ op: "evolveDeck", where: "active" }])],
  [/^This Pokémon recovers from all Special Conditions\.$/, () => fromDeck([{ op: "cure", to: "self" }])],
  [/^Heal (\d+|all) damage from each of your Benched Pokémon\.$/, (m) => fromDeck([{ op: "heal", n: m[1] === "all" ? 9990 : Number(m[1]), to: "bench" }])],
  [/^Heal (\d+|all) damage from 1 of your Benched Pokémon\.$/, (m) => fromDeck([{ op: "healOne", n: m[1] === "all" ? 9990 : Number(m[1]), where: "bench" }])],
  [/^Remove (\d+) damage counters? from each of your (Benched )?Pokémon\.$/, (m) => fromDeck([{ op: "heal", n: Number(m[1]) * 10, to: m[2] ? "bench" : "all" }])],
  [new RegExp(`^Put ${N} Energy(?: cards?)? attached to this Pokémon into your hand\\.$`, "i"), (m) => [{ op: "energyToHand", when: "after", n: count(m[1]) }]],
  [new RegExp(`^Your opponent discards ${N} cards? from (?:their|his or her) hand\\.$`, "i"), (m) => fromDeck([{ op: "foeToss", n: count(m[1]) }])],
  [/^(?:Look at your opponent's hand|Your opponent reveals (?:their|his or her) hand)\.$/, () => [{ op: "lookHand", when: "after" }]],
  [new RegExp(`^Look at the top ${N} cards of your deck and put them back (?:on top of your deck )?in any order\\.$`, "i"), (m) => fromDeck([{ op: "arrange", n: count(m[1]) }])],
  [new RegExp(`^Search your deck for (\\d+|two|three) (.+?) and put them (onto your Bench|into your hand)\\. ${SHUFFLED}$`, "i"), (m) => {
    const what = whatOf(m[2]);
    const to = /Bench/.test(m[3]) ? "bench" : "hand";
    return what && (to === "hand" || /^basic(?=$|[:@!])/.test(what)) ? fromDeck([{ op: "search", what, n: count(m[1]), to }]) : null;
  }],
  [/^Return this Pokémon and all cards attached to it to your hand\.$/, () => [{ op: "selfAway", when: "after", to: "hand" }]],
  [new RegExp(`^Discard up to ${N} Pokémon Tools?(?: cards)? from your opponent's Pokémon\\.$`, "i"), (m) => fromDeck([{ op: "dropInPlay", tools: "foe", n: count(m[1]) }])],
  // Switching, in the older wordings.
  [new RegExp(`^After your attack, you may switch this Pokémon with ${N} of your Benched Pokémon\\.$`, "i"), () => [{ op: "switchSelf", when: "after", optional: true }]],
  [new RegExp(`^Switch (?:the Defending Pokémon with ${N} of your opponent's Benched Pokémon|${N} of your opponent's Benched Pokémon with your opponent's Active Pokémon)\\.$`, "i"), () => fromDeck([{ op: "gust" }])],
  [new RegExp(`^Your opponent switches the Defending Pokémon with ${N} of (?:his or her|their) Benched Pokémon, if any\\.(?: \\(Do the damage before switching the Pokémon\\.\\))?$`, "i"), () => [{ op: "switchFoe", when: "after" }]],
  [new RegExp(`^If your opponent has any Benched Pokémon, (?:he or she|they) chooses? ${N} of them and switch(?:es)? it with the Defending Pokémon\\.(?: \\(Do the damage before switching the Pokémon\\.\\))?$`, "i"), () => [{ op: "switchFoe", when: "after" }]],
  [new RegExp(`^You may have your opponent switch (?:his or her|their) Active Pokémon with ${N} of (?:his or her|their) Benched Pokémon\\.$`, "i"), () => [{ op: "may", when: "after", steps: fromDeck([{ op: "foeSwitch" }]), prompt: "Have them switch their Active Pokémon?" }]],
  // Choices and prices before the damage (OPS.ask, OPS.pay): "You may do 30 more damage. If you do, ...",
  // "You may discard ... If you do, this attack does 60 more damage", "... for each card you discarded in this way".
  [new RegExp(`^You may do (?:\\d+ damage plus )?(\\d+) more damage(?: and leave ${FOE} ${COND})?\\. If you do, (.+)$`), (m) => {
    const then = compileText(upper(m[3]));
    if (!then || !then.every((step) => step.when === "after")) return null;
    const leave = m[2] ? [cond(m[2])] : [];
    return [{ op: "ask", when: "before", prompt: `Do ${m[1]} more damage${m[2] ? ` and leave their Active Pokémon ${m[2]}` : ""}? ${upper(m[3])}` }, { op: "bonusIf", when: "before", n: Number(m[1]), test: "did" }, { op: "ifDid", when: "after", steps: [...leave, ...then] }];
  }],
  [/^You may (.+?)(?:\. If you do,| and have) this attack (?:does|do) (?:\d+ damage plus )?(\d+) more damage\.$/, (m) => mayFirst(m[1], m[2], "bonusIf")],
  [/^You may (.+?)\. If you do, this attack's base damage is (\d+)(?: instead of \d+)?\.$/, (m) => mayFirst(m[1], m[2], "baseIf")],
  [/^(You may |Before doing damage, you may )?[Dd]iscard (.+?)(?:, and|\.(?: If you do,)?) [Tt]his attack does (?:\d+ damage plus )?(\d+) (more )?damage for each (.+?) (?:that )?(?:you )?discarded in this way\.$/, (m) => payFor(m)],
  [/^(You may )?([Dd]iscard the top (?:\d+ )?cards? of (?:your|each player's) deck|Each player discards? the top card of (?:his or her|their) deck)(?:\. \(If there are fewer than \d+ cards in your deck, discard all of them\.\)|, and|\.(?: If you do,)?) [Tt]his attack does (?:\d+ damage plus )?(\d+) (more )?damage for each (.+?) (?:that )?(?:you )?discarded in this way\.$/, (m) => millFor(m)],
  // "This attack's base damage is ... instead": the printed damage swapped (OPS.base).
  [/^If (.+?), this attack's base damage is (\d+)(?: instead of \d+)?\.$/, (m) => {
    const t = testOf(m[1]);
    return t && [{ op: "baseIf", when: "before", n: Number(m[2]), ...t }];
  }],
  [/^As long as (?:the Defending Pokémon's|your opponent's Active Pokémon's) remaining HP is (\d+) or less, this attack's base damage is (\d+)(?: instead of \d+)?\.$/, (m) => [{ op: "baseIf", when: "before", n: Number(m[2]), test: "foeHpAtMost", k: Number(m[1]) }]],
  [/^Flip a coin\. If (heads|tails), this attack's base damage is (\d+)(?: instead of \d+)?\.$/, (m) => [{ op: "flip", when: "before", [m[1]]: [{ op: "base", n: Number(m[2]) }] }]],
  [/^Flip 2 coins\. If either of them is tails, this attack's base damage is (\d+)(?: instead of \d+)?\.$/, (m) => [{ op: "flipCoins", when: "before", coins: 2, notAll: [{ op: "base", n: Number(m[1]) }] }]],
  [/^During your next turn, this Pokémon's (.+?) attack's base damage is (\d+)(?: instead of \d+)?\.$/, (m) => [mark("base", { mine: true, name: m[1], n: Number(m[2]) })]],
  // What happened earlier (engine.js keeps it): "that much more damage", and effects after the damage on a test that holds all turn.
  [/^If this Pokémon was damaged by an attack during your opponent's last turn, this attack does that much more damage\.$/, () => [{ op: "bonusPer", when: "before", n: 1, per: "struck" }]],
  [/^If this Pokémon was damaged by an attack during your opponent's last turn, this attack does the same amount of damage(?: done to this Pokémon)? to (?:your opponent's Active Pokémon|the Defending Pokémon)\.$/, () => [{ op: "bonusPer", when: "before", how: "times", n: 1, per: "struck" }]],
  [/^If (.+?), this attack does (\d+) more damage and heal (\d+) damage from this Pokémon\.$/, (m) => {
    const t = testOf(m[1]);
    return t && STEADY.has(t.test) && [{ op: "bonusIf", when: "before", n: Number(m[2]), ...t }, { op: "ifTest", when: "after", ...t, steps: [{ op: "healSelf", n: Number(m[3]) }] }];
  }],
  [new RegExp(`^If (.+?), this attack does (?:\\d+ damage plus )?(\\d+) more damage,? and ${FOE} is now ${COND}\\.$`), (m) => {
    const t = testOf(m[1]);
    return t && STEADY.has(t.test) && [{ op: "bonusIf", when: "before", n: Number(m[2]), ...t }, { op: "ifTest", when: "after", ...t, steps: [cond(m[3])] }];
  }],
  [/^If (.+?), (?!this attack does \d+ more|this attack's)(.+)$/, (m) => {
    const t = testOf(m[1]);
    const then = t && STEADY.has(t.test) && compileOne(upper(m[2]));
    return then && then.every((step) => step.when === "after") ? [{ op: "ifTest", when: "after", ...t, steps: then }] : null;
  }],
  // A coin in front, or "you may", of any effect above that comes after the damage.
  [/^Flip a coin\. If (heads|tails), (.+)$/, (m) => {
    // The other side of the coin, or a change to the attack's own damage, in the same breath: not read here.
    if (/\bif (?:heads|tails)\b|this attack does (?:nothing|no damage)|\binstead\b/i.test(m[2])) return null;
    const inner = compileOne(upper(m[2]));
    return inner && inner.every((step) => step.when === "after") ? [{ op: "flip", when: "after", [m[1]]: inner }] : null;
  }],
  [/^You may (.+)$/, (m) => {
    const inner = compileOne(upper(m[1]));
    return inner && inner.every((step) => step.when === "after") ? [{ op: "may", when: "after", steps: inner, prompt: `${upper(m[1]).replace(/\.$/, "")}?` }] : null;
  }],
];

/**
 * "You may <price>. If you do, this attack does 60 more damage" (`how` "bonusIf") or "...'s base damage is 80"
 * ("baseIf"): the price is any effect read above that comes after the damage, paid before it instead (OPS.ask).
 */
function mayFirst(price, n, how) {
  const steps = handPrice(price) || deckPrice(price) || compileOne(`${upper(price)}.`);
  // Only prices readyFx can judge: "If you do" must not hold for a price that couldn't be paid.
  if (!steps || !steps.every((step) => step.when === "after" && PRICES.has(step.op))) return null;
  return [{ op: "ask", when: "before", steps, prompt: `${upper(price)}? If you do, this attack does ${how === "baseIf" ? `${n} damage instead` : `${n} more damage`}.` }, { op: how, when: "before", n: Number(n), test: "did" }];
}

/** "discard a card from your hand", "discard an Item card from your hand": the price as a pay step. */
function handPrice(price) {
  const m = price.match(new RegExp(`^discard ${N} (.+?) from your hand$`, "i"));
  const what = m && (/^cards?$/.test(m[2]) ? "any" : whatOf(m[2]));
  return what ? [{ op: "pay", when: "after", from: "hand", what, n: count(m[1]), exact: true }] : null;
}
/** "discard the top card of your deck", "discard the top 2 cards of each player's deck". */
function deckPrice(price) {
  const m = price.match(/^discard the top (?:(\d+) )?cards? of (your|each player's) deck$/i);
  return m ? [{ op: "pay", when: "after", from: m[2] === "your" ? "deck" : "decks", n: m[1] ? Number(m[1]) : 1 }] : null;
}
/** Pokémon named by type or by owner ("Fighting Pokémon", "Hop's Pokémon"): a card kind (trainers.js fits), or "". */
function pokemonKind(words) {
  const owner = words.match(/^([A-Z][\w.]*'s) Pokémon$/);
  if (owner) return `pokemon~${owner[1]}`;
  const what = whatOf(words);
  return /^pokemon:\w+$/.test(what) ? what : "";
}

/** Energy named on a Pokémon ("basic Fire Energy", "Energy cards"): { basic, type }, or null. */
function energyNamed(words) {
  const m = words.match(new RegExp(`^(basic |Basic )?(?:${TYPE} )?Energy(?: cards?)?$`, "i"));
  return m && { ...(m[1] ? { basic: true } : {}), ...(m[2] ? { type: upper(m[2].toLowerCase()) } : {}) };
}

/** "for each <card> you discarded in this way": the kind of card counted (trainers.js fits), "" for every card. */
function paidKind(words) {
  if (/^cards?$/.test(words)) return "";
  const what = whatOf(words);
  return what || null;
}

/** "Discard up to 2 Energy from your Pokémon. This attack does 50 damage for each card you discarded in this way." */
function payFor(m) {
  const [, may, clause, n, more, counted] = m;
  const per = paidKind(counted);
  if (per == null) return null;
  if (/^any number of Pokémon Tools? from your Pokémon$/.test(clause)) return [{ op: "pay", when: "before", from: "tools" }, { op: "bonusPer", when: "before", n: Number(n), per: "paid", ...(more ? {} : { how: "times" }) }];
  // "any amount of basic Fire Energy or any amount of basic Lightning Energy", "up to 2 basic Fire Energy or up to 2 basic Lightning Energy": all of one kind.
  const either = clause.match(new RegExp(`^(any amount of|up to ${N}) (.+?) or \\1 (.+?) from this Pokémon$`, "i"));
  if (either) {
    const kinds = [energyNamed(either[3]), energyNamed(either[4])];
    if (!kinds.every((k) => k?.basic && k.type)) return null;
    return [{ op: "pay", when: "before", from: "self", energy: kinds, oneKind: true, n: either[2] ? count(either[2]) : 0 }, { op: "bonusPer", when: "before", n: Number(n), per: "paid", ...(per ? { type: per } : {}), ...(more ? {} : { how: "times" }) }];
  }
  const amount = clause.match(new RegExp(`^(all|any amount of|any number of|up to ${N}(?: in any combination of)?) (.+?) (?:from (?:among )?|attached to )(this Pokémon|your Pokémon|your Pokémon in play|your Benched Pokémon|your hand)$`, "i"));
  if (!amount) return null;
  const [, how, cnt, words, from] = amount;
  // "in any combination of basic Fire and basic Lightning Energy cards": either kind.
  const combo = / in any combination of$/.test(how) && words.match(new RegExp(`^(basic )?${TYPE} and (basic )?${TYPE} Energy cards$`, "i"));
  if (/ in any combination of$/.test(how) && !combo) return null;
  const what = combo ? null : words;
  const all = /^all$/i.test(how);
  // "Discard all ..." is not a choice: "you may" on it is a yes or no first.
  if (all && /hand/.test(from)) return null;
  const upTo = cnt ? count(cnt) : 0;
  let step;
  if (/hand/.test(from)) {
    if (combo) return null;
    const kind = whatOf(what);
    if (!kind) return null;
    step = { op: "pay", when: "before", from: "hand", what: kind, n: upTo };
  } else {
    const energy = combo ? [energyNamed(`${combo[1] || ""}${combo[2]} Energy`), energyNamed(`${combo[3] || ""}${combo[4]} Energy`)] : energyNamed(what);
    if (!energy || [].concat(energy).some((k) => !k)) return null;
    step = { op: "pay", when: "before", from: /this/.test(from) ? "self" : /Benched/.test(from) ? "bench" : "own", energy, n: upTo, ...(all ? { all } : {}) };
  }
  const bonus = { op: "bonusPer", when: "before", n: Number(n), per: "paid", ...(per ? { type: per } : {}), ...(more ? {} : { how: "times" }) };
  return [may && all ? { op: "ask", when: "before", steps: [step], prompt: `Discard ${clause}? This attack does ${n} ${more ? "more " : ""}damage for each card discarded.` } : step, bonus];
}

/** "Discard the top 3 cards of your deck. This attack does 30 damage for each Energy card you discarded in this way." */
function millFor(m) {
  const [, may, clause, n, more, counted] = m;
  const per = paidKind(counted);
  if (per == null) return null;
  const top = clause.match(/top (\d+ )?cards?/);
  const step = { op: "pay", when: "before", from: /each player|Each player/.test(clause) ? "decks" : "deck", n: top[1] ? Number(top[1]) : 1 };
  const bonus = { op: "bonusPer", when: "before", n: Number(n), per: "paid", ...(per ? { type: per } : {}), ...(more ? {} : { how: "times" }) };
  return [may ? { op: "ask", when: "before", steps: [step], prompt: `${upper(clause)}? This attack does ${n} ${more ? "more " : ""}damage for each ${counted} discarded.` } : step, bonus];
}

/** "This attack's damage isn't affected by Weakness, Resistance, Poké-Powers, ... or any other effects on the Defending Pokémon." */
function typingOf(list) {
  const items = list.replace(/the Defending Pokémon/g, OPP).split(/, or |, | or /);
  const effects = items.some((i) => i === `any effects on ${OPP}` || i === `any other effects on ${OPP}`);
  // Poké-Powers and Poké-Bodies are only named beside "any other effects", which the engine ignores as one.
  const known = (i) => ["Weakness", "Resistance"].includes(i) || (effects && ["Poké-Powers", "Poké-Bodies", "Pokémon Powers", `any effects on ${OPP}`, `any other effects on ${OPP}`].includes(i));
  if (!items.every(known)) return null;
  return [{ op: "typing", when: "before", noWeakness: items.includes("Weakness"), noResistance: items.includes("Resistance"), noEffects: effects }];
}

/** Effects a Trainer card has too: read by the Trainer reader (js/tcg/trainers.js), with only the steps that make sense for an attack. */
const AS_TRAINER = new Set(["search", "recover", "recycle", "heal", "healOne", "healEach", "draw", "drawTo", "drawFor", "drawPerFoeHand", "drawUpTo", "drawPaid", "flipDraw", "discardHand", "shuffleHand", "foeShuffle", "foeDraw", "handBottom", "flip", "flipEach", "gust", "foeSwitch", "switch", "cost", "toss", "topTake", "under", "mill", "hammer", "dropFoeTools", "dropInPlay", "dropStadium", "attachPick", "fetchEnergy", "energize", "counters", "foeMill", "foeDiscardRandom", "foeToss", "foeHandBottom", "foeRandomBottom", "cure", "cureOne", "cureKind", "bounce", "evolveDeck", "moveEnergy", "arrange"]);
const upper = (words) => words[0].toUpperCase() + words.slice(1);
const fromDeck = (steps) => [{ op: "trainer", when: "after", steps }];
function attachTo(m, zone) {
  const what = whatOf(m[4]);
  if (!/^(basicEnergy|energy)(:\w+)?$/.test(what)) return null;
  const n = /^an?$/i.test(m[1]) ? 1 : count(m[2] || m[3]);
  return fromDeck([{ op: "attachPick", zone, what, to: "self", n, ...(m[2] ? { upTo: true } : m[3] ? { exact: true } : {}) }]);
}
function asTrainer(clean) {
  const steps = compileTrainer(clean);
  const all = (list) => list.flatMap((s) => [s, ...all(s.heads || []), ...all(s.tails || []), ...(s.step ? all([s.step]) : [])]);
  return steps && all(steps).every((s) => AS_TRAINER.has(s.op)) ? fromDeck(steps) : null;
}

function compileOne(clean) {
  for (const [pattern, build] of PATTERNS) {
    const m = clean.match(pattern);
    // A wording may match and still not be read (it names cards we can't sort): the Trainer reader may still.
    const steps = m && build(m);
    if (steps) return steps;
  }
  return asTrainer(clean);
}

/**
 * The steps of an attack's text, [] when it has none, null when it can't be read yet. Older cards name
 * themselves ("Charizard does 10 damage to itself") where newer ones say "this Pokémon": `name` reads them alike.
 */
export function compileAttack(text, name = "") {
  const plain = String(text || "").replace(/\s+/g, " ").replace(/’/g, "'").trim();
  const first = compileText(plain);
  if (first || !name || !plain.includes(name)) return first;
  // "Search your deck for up to 2 Nidoran♀ and put them onto your Bench": cards of its own name.
  const kin = plain.match(new RegExp(`^Search your deck for (?:(?:up to )?${N} )?${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} and put (?:it|them) onto your Bench\\. ${SHUFFLED}$`, "i"));
  if (kin) return fromDeck([{ op: "search", what: `name=${name}`, n: kin[1] ? count(kin[1]) : 1, to: "bench" }]);
  return compileText(plain.replace(new RegExp(`(?<![\\p{L}\\d])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\d])`, "gu"), "this Pokémon").replace(/(^|\. |\()this Pokémon/g, "$1This Pokémon"));
}

function compileText(clean) {
  if (!clean) return [];
  const whole = compileOne(clean);
  if (whole) return whole;
  // Several effects in one text: read it sentence by sentence, joining the ones that belong
  // together ("Flip a coin. If heads, ..."). Every sentence must be read, or none is.
  const sentences = clean.match(/[^.]+\.(?:\)|")?(?= |$)/g)?.map((part) => part.trim());
  if (!sentences || sentences.join(" ") !== clean || sentences.length < 2) return null;
  const steps = [];
  for (let i = 0; i < sentences.length; ) {
    let took = 0;
    for (let n = Math.min(3, sentences.length - i); n >= 1 && !took; n -= 1) {
      const part = compileOne(sentences.slice(i, i + n).join(" "));
      if (part) {
        steps.push(...part);
        took = n;
      }
    }
    if (!took) return null;
    i += took;
  }
  return steps;
}

/** Where the attacker is now (it may have been switched), or null once it has left play. */
const spotOf = (ctx) => inPlay(ctx.state, ctx.player).find(([slot]) => slot === ctx.slot)?.[1] ?? null;
/** Whether steps a "you may" offers could do anything now: a price there is no card to pay, and it isn't offered. */
function readyFx(ctx, steps) {
  return steps.every((step) => {
    if (step.op === "trainer") return trainerReady(step.steps, trainerCtx(ctx)) && !step.steps.some((s) => T_OPS[s.op]?.must && !T_OPS[s.op].ready(trainerCtx(ctx), s));
    if (step.op === "discardEnergy") {
      const fitting = ctx.slot.energy.filter((uid) => !step.type || (defOf(ctx.state, uid, ctx.defs).provides || []).includes(step.type)).length;
      return fitting > 0 && (step.n >= 99 || fitting >= step.n);
    }
    if (step.op === "energyToHand") return ctx.slot.energy.length >= (step.n || 1);
    if (step.op === "pay" && step.from === "hand") return ctx.state.players[ctx.player].hand.filter((uid) => fits(defOf(ctx.state, uid, ctx.defs), step.what)).length >= (step.n || 1);
    if (step.op === "pay") return step.from === "deck" ? ctx.state.players[ctx.player].deck.length > 0 : true;
    if (step.op === "moveOwnEnergy") return ctx.state.players[ctx.player].bench.some((slot) => slot !== ctx.slot) && ctx.slot.energy.some((uid) => {
      const def = defOf(ctx.state, uid, ctx.defs);
      return (!step.type || (def.provides || []).includes(step.type)) && (!step.basic || def.basic);
    });
    return true;
  });
}
const PRICES = new Set(["discardEnergy", "trainer", "energyToHand", "moveOwnEnergy", "pay"]);
const trainerCtx = (ctx) => ({ state: ctx.state, defs: ctx.defs, events: ctx.events, player: ctx.player, spot: spotOf(ctx), src: "attack" });

/**
 * Run the steps in order. One that leaves a choice holds the rest back: they ride on that choice
 * (as the Trainer steps' `then` do) and run once it is made, as the text orders them.
 */
function runSteps(steps, ctx) {
  for (let i = 0; i < steps.length; i += 1) {
    const before = ctx.state.pending.length;
    OPS[steps[i].op]?.(ctx, steps[i]);
    if (ctx.state.pending.length > before) {
      const waiting = ctx.state.pending[ctx.state.pending.length - 1];
      if (i < steps.length - 1) waiting.then = [...(waiting.then || []), { op: "fx", steps: steps.slice(i + 1), uid: ctx.slot.uid }];
      // The other player's choice ("your opponent switches"): what follows is still the attacker's.
      if (waiting.player !== ctx.player && waiting.by == null) waiting.by = ctx.player;
      return;
    }
  }
}

/** Steps that waited on a choice (trainers.js T_OPS.fx): the attack's context again, if the attacker is still in play. */
export function runFx(tctx, { steps, uid }) {
  const { state, defs, player } = tctx;
  const mine = inPlay(state, player).find(([slot]) => slot.uid === uid);
  if (!mine) return;
  const target = state.players[other(player)].active;
  const shielded = Boolean(target && (markOn(state, target, "shield") || abilityOn(state, target, defs)?.noEffects));
  // The attack this turn (engine.js keeps it in state.strike): its damage so far, what was discarded for it, what it dealt.
  const live = state.strike && state.strike.turn === state.turn && state.strike.uid === uid && state.strike.p === player ? state.strike : null;
  const attack = live ? defOf(state, uid, defs).attacks[live.index] : undefined;
  runSteps(steps, { state, defs, events: tctx.events, player, slot: mine[0], target, attack, hit: live ? live.hit : { damage: 0, cancelled: false }, shielded });
}

export function runAttackEffects(when, attack, ctx) {
  runSteps((attack.fx || []).filter((step) => step.when === when), ctx);
}

/** An attack, from the top: the steps before the damage, then the damage and the steps after it (OPS.strike). */
export function runAttack(ctx) {
  runSteps([...(ctx.attack.fx || []).filter((step) => step.when === "before"), { op: "strike" }], ctx);
}
