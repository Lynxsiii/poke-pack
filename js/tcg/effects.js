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

import { ACTIVE, abilityOn, addCondition, addMark, askChoose, askPick, benchSafe, conditionsOn, damageAfterTyping, defOf, devolveSlot, energyFits, energyOf, flip, heldOn, hpLeft, inPlay, markOn, maxHp, other, rand, retreatCost, shuffle, strike, switchActive, toolGone, unpaid, warded } from "./engine.js";
import { T_OPS, compileTrainer, runTrainer, trainerReady, whatOf } from "./trainers.js";

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
  foeHandTrainers: (ctx) => sideOf(ctx).hand.filter((uid) => defOf(ctx.state, uid, ctx.defs)?.kind === "trainer").length,
  ownHand: (ctx) => sideOf(ctx, true).hand.length,
  foeConditions: (ctx) => conditionsOn(ctx.target).length,
  ownDamaged: (ctx) => slotsOf(sideOf(ctx, true)).filter((s) => s.damage > 0).length,
  ownTools: (ctx) => slotsOf(sideOf(ctx, true)).filter((s) => s.tool).length,
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
  sameEnergy: (ctx) => Boolean(ctx.target) && unitsOf(ctx, ctx.slot) === unitsOf(ctx, ctx.target),
  selfCountersAtLeast: (ctx, { k }) => ctx.slot.damage >= k * 10,
  spareAtLeast: (ctx, { k, type = "" }) => spareUnits(ctx, type) >= k,
  ownBenchAtMost: (ctx, { k }) => sideOf(ctx, true).bench.length <= k,
  handExactly: (ctx, { k }) => sideOf(ctx, true).hand.length === k,
  foeHandAtMost: (ctx, { k }) => sideOf(ctx).hand.length <= k,
  deckAtMost: (ctx, { k }) => sideOf(ctx, true).deck.length <= k,
  prizesExactly: (ctx, { k, foe = false }) => sideOf(ctx, !foe).prizes.length === k,
};

/** Does the test hold (`not`: the text asks the opposite)? */
const passes = (ctx, t) => Boolean(TESTS[t.test](ctx, t)) !== Boolean(t.not);

function flips(ctx, n) {
  const results = Array.from({ length: n }, () => flip(ctx.state));
  ctx.events.push({ t: "flip", p: ctx.player, results });
  return results;
}

export const OPS = {
  /** Flip a coin: heads adds damage. */
  flipBonus(ctx, { n }) {
    // The coin is kept for what the text says comes of it after the damage (OPS.onCoin).
    ctx.hit.coin = flips(ctx, 1)[0];
    if (ctx.hit.coin) ctx.hit.damage += n;
  },
  /** Flip a coin: tails and the attack does nothing; heads and the `heads` steps happen too (Fly's protection). */
  flipOrNothing(ctx, { heads = [] }) {
    ctx.hit.coin = flips(ctx, 1)[0];
    if (!ctx.hit.coin) {
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
    ctx.events.push({ t: "heal", p: ctx.player, spot: -1, n: healed });
  },
  /** Flip some coins: more damage for each heads. */
  flipBonusEach(ctx, { coins, n, per = "", type = "" }) {
    ctx.hit.damage += flips(ctx, per ? COUNTS[per](ctx, type) : coins).filter(Boolean).length * n;
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
  /** More damage when something is true (TESTS). */
  bonusIf(ctx, step) {
    if (passes(ctx, step)) ctx.hit.damage += step.n;
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
  spread(ctx, { n, to = "bench", count = 0, noTyping = false, pierce = false, damaged = null }) {
    const { state, player, events } = ctx;
    // "Each Benched Pokémon (both yours and your opponent's)": theirs, then yours.
    if (to === "allBench") {
      OPS.spread(ctx, { n, to: "bench", noTyping, pierce });
      return OPS.spread(ctx, { n, to: "ownBench", noTyping, pierce });
    }
    const p = to === "ownBench" ? player : other(player);
    const side = state.players[p];
    // `damaged`: only those that have damage counters on them (false: only those that have none).
    const spots = [...(to === "any" && side.active ? [ACTIVE] : []), ...side.bench.map((_, i) => i)].filter((spot) => damaged == null || ((spot === ACTIVE ? side.active : side.bench[spot]).damage > 0) === damaged);
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
      if (pierce ? defOf(state, slot.uid, ctx.defs).tera && spot !== ACTIVE : benchSafe(state, slot, spot, ctx.defs, p === player)) continue;
      slot.damage += dealt.amount;
      slot.hit = state.turn;
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
  /** Discard Energy (of one type, when the card names it) from the other Active Pokémon: the attacker chooses which, when they differ. */
  discardFoeEnergy(ctx, { n, type = "" }) {
    const { state, player, defs } = ctx;
    const foe = other(player);
    const slot = state.players[foe].active;
    if (!slot || ctx.shielded) return;
    const uids = slot.energy.filter((uid) => !type || (defOf(state, uid, defs).provides || []).includes(type));
    if (uids.length > n && new Set(uids.map((uid) => state.cards[uid])).size > 1) return askChoose(state, { player, zone: "play", what: "energy", uids, min: n, max: n, effect: { op: "dropInPlay" } });
    const gone = uids.slice(Math.max(0, uids.length - n));
    if (!gone.length) return;
    for (const uid of gone) slot.energy.splice(slot.energy.indexOf(uid), 1);
    state.players[foe].discard.push(...gone);
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
  condition(ctx, { kind, self = false, counters = 0 }) {
    const slot = self ? ctx.slot : ctx.state.players[other(ctx.player)].active;
    const p = self ? ctx.player : other(ctx.player);
    if (!slot || (!self && ctx.shielded)) return;
    // `counters`: a Poison that puts that much on it between turns, not 10.
    if (addCondition(ctx.state, slot, kind, ctx.defs, { counters })) ctx.events.push({ t: "condition", p, kind, ...(counters ? { n: counters } : {}) });
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
  counters(ctx, { n, where = "any", count = 0, spread = false, damaged = false }) {
    const { state, player, defs, events } = ctx;
    const foe = other(player);
    // `damaged`: only those that have damage counters on them already.
    const spots = inPlay(state, foe).filter(([slot, spot]) => (where === "bench" ? spot !== ACTIVE : where === "active" ? spot === ACTIVE : true) && (!damaged || slot.damage > 0) && !warded(state, slot, { player, src: "attack" }, defs)).map(([, spot]) => spot);
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
  energyToHand(ctx, { n = 1, type = "" }) {
    const { state, player, events, slot } = ctx;
    const uids = slot.energy.filter((uid) => !type || (defOf(state, uid, ctx.defs).provides || []).includes(type));
    const spot = spotOf(ctx);
    if (!uids.length || spot == null) return;
    if (uids.length > n && new Set(uids.map((uid) => state.cards[uid])).size > 1) return askChoose(state, { player, zone: "play", what: "energy", uids, min: n, max: n, effect: { op: "takeBack" } });
    const back = uids.slice(Math.max(0, uids.length - n));
    for (const uid of back) slot.energy.splice(slot.energy.indexOf(uid), 1);
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
  discardEnergy(ctx, { n, type, basic = false, then = null }) {
    const { state, defs, slot, player } = ctx;
    const gone = [];
    for (let i = slot.energy.length - 1; i >= 0 && gone.length < n; i -= 1) {
      const def = defs(state.cards[slot.energy[i]]);
      if (type && !(def.provides || []).includes(type)) continue;
      if (basic && !def.basic) continue;
      gone.push(...slot.energy.splice(i, 1));
    }
    if (!gone.length) return;
    state.players[player].discard.push(...gone);
    ctx.events.push({ t: "discard-energy", p: player, spot: -1, uids: gone });
    // "Discard an Energy from this Pokémon. If you do, ...".
    if (then) runSteps(then, ctx);
  },
  /** Flip some coins: tails on any of them (`all`: on all of them) and the attack does nothing. */
  flipCancel(ctx, { coins, all = false }) {
    const tails = flips(ctx, coins).filter((heads) => !heads).length;
    if (all ? tails === coins : tails > 0) {
      ctx.hit.cancelled = true;
      ctx.events.push({ t: "miss", p: ctx.player });
    }
  },
  /** After the damage: what the coin flipped before it (flipBonus, flipOrNothing) says. */
  onCoin(ctx, { heads = [], tails = [] }) {
    if (ctx.hit.coin != null) runSteps(ctx.hit.coin ? heads : tails, ctx);
  },
  /** Flip some coins, or until tails (`until`): the steps once for each heads. */
  flipRepeat(ctx, { coins = 1, until = false, steps }) {
    let results;
    if (until) {
      results = [];
      do results.push(flip(ctx.state));
      while (results[results.length - 1] && results.length < 60);
      ctx.events.push({ t: "flip", p: ctx.player, results });
    } else results = flips(ctx, coins);
    runSteps(results.filter(Boolean).flatMap(() => steps), ctx);
  },
  /** Flip some coins: the steps only if all of them are heads. */
  flipAllThen(ctx, { coins, steps }) {
    if (flips(ctx, coins).every(Boolean)) runSteps(steps, ctx);
  },
  /** "If ..., this attack does nothing" (TESTS). */
  cancelIf(ctx, step) {
    if (!passes(ctx, step)) return;
    ctx.hit.cancelled = true;
    ctx.events.push({ t: "miss", p: ctx.player });
  },
  /** "If ..., <effect>" after the damage (TESTS). */
  when(ctx, step) {
    if (passes(ctx, step)) runSteps(step.steps, ctx);
  },
  /** "Discard a Fire Energy attached to this Pokémon or this attack does nothing." */
  payOrNothing(ctx, { n, type = "", basic = false }) {
    const { state, defs, slot } = ctx;
    const have = slot.energy.filter((uid) => (!type || (defOf(state, uid, defs).provides || []).includes(type)) && (!basic || defOf(state, uid, defs).basic)).length;
    if (have < n) {
      ctx.hit.cancelled = true;
      ctx.events.push({ t: "miss", p: ctx.player });
      return;
    }
    OPS.discardEnergy(ctx, { n, type, basic });
  },
  /** "Your opponent can't play any Item cards from their hand during their next turn" (engine.js handLock). */
  lockHand(ctx, { kinds }) {
    const foe = other(ctx.player);
    const side = ctx.state.players[foe];
    side.locks = { ...(side.locks || {}) };
    for (const kind of kinds) side.locks[kind] = ctx.state.turn + 1;
    ctx.events.push({ t: "lock", p: foe, kinds });
  },
  /** Energy from the other Active Pokémon back to its owner's hand: the attacker chooses which, when they differ. */
  foeEnergyToHand(ctx, { n = 1 }) {
    const { state, player, events } = ctx;
    const foe = other(player);
    const slot = state.players[foe].active;
    if (!slot || ctx.shielded || !slot.energy.length) return;
    const uids = slot.energy.slice();
    if (uids.length > n && new Set(uids.map((uid) => state.cards[uid])).size > 1) return askChoose(state, { player, owner: foe, zone: "play", what: "energy", uids, min: n, max: n, effect: { op: "takeBack" } });
    const back = slot.energy.splice(Math.max(0, slot.energy.length - n), n);
    state.players[foe].hand.push(...back);
    events.push({ t: "energy-to-hand", p: foe, spot: ACTIVE, uids: back });
  },
  /** The top Evolution card of the other Active Pokémon goes back to its owner's hand. */
  devolveFoe(ctx) {
    const foe = other(ctx.player);
    const slot = ctx.state.players[foe].active;
    if (!slot || ctx.shielded) return;
    devolveSlot(ctx.state, foe, ACTIVE, ctx.events);
  },
  /** "Your opponent's Active Pokémon is Knocked Out" (not by damage). */
  knockOut(ctx) {
    const slot = ctx.state.players[other(ctx.player)].active;
    if (!slot || ctx.shielded) return;
    slot.damage = Math.max(slot.damage, maxHp(ctx.state, slot, ctx.defs));
  },
  /** "Put damage counters on your opponent's Active Pokémon until its remaining HP is 10." */
  countersTo(ctx, { hp }) {
    const { state, player, defs, events } = ctx;
    const foe = other(player);
    const slot = state.players[foe].active;
    if (!slot || warded(state, slot, { player, src: "attack" }, defs)) return;
    const n = hpLeft(state, slot, defs) - hp;
    if (n <= 0) return;
    slot.damage += n;
    events.push({ t: "damage", p: foe, spot: ACTIVE, n });
  },
  /** Before the damage: one more Prize card (or n) if this attack's damage Knocks Out the other Active Pokémon (engine.js resolveKnockOuts). */
  bounty(ctx, { n }) {
    if (ctx.target) addMark(ctx.state, ctx.target, { kind: "bounty", turn: ctx.state.turn, n });
  },
  /** The damage, once the steps before it are done (engine.js). */
  strike(ctx) {
    strike(ctx);
    // It is the last step: what it leaves waiting (a new Active Pokémon) is not the attack's own choice.
    ctx.detached = true;
  },
  /**
   * "Choose 1 of your opponent's Active Pokémon's attacks and use it as this attack": its damage and its effects,
   * as if it were the attacker's own (`tera`: only a Tera Pokémon's). A GX attack copied counts as this player's.
   */
  copyAttack(ctx, { tera = false }) {
    const { state, player, defs } = ctx;
    const target = state.players[other(player)].active;
    const def = target && defOf(state, target.uid, defs);
    if (!def || (tera && !def.tera)) return;
    const side = state.players[player];
    const can = def.attacks.map((a, index) => index).filter((index) => !(def.attacks[index].once === "gx" && side.gxUsed) && !(def.attacks[index].once === "vstar" && side.vstarUsed));
    if (!can.length) return;
    if (can.length === 1) OPS.useAttack(ctx, { card: def.id, index: can[0] });
    else state.pending.push({ type: "option", player, why: "copy", prompt: "Choose the attack to use.", labels: can.map((index) => def.attacks[index].name), options: can.map((index) => [{ op: "fx", steps: [{ op: "useAttack", card: def.id, index }], uid: ctx.slot.uid, hit: ctx.hit, atk: ctx.atk }]) });
    // This attack's own damage doesn't follow: the copied one's has (or will, once it is chosen).
    ctx.detached = true;
  },
  /** The copied attack, from its steps before the damage on (copyAttack). */
  useAttack(ctx, { card, index }) {
    const attack = ctx.defs(card).attacks[index];
    const side = ctx.state.players[ctx.player];
    if (attack.once === "gx") side.gxUsed = true;
    if (attack.once === "vstar") side.vstarUsed = true;
    ctx.attack = attack;
    ctx.atk = [card, index];
    ctx.hit.damage = attack.damage;
    ctx.events.push({ t: "copy", p: ctx.player, name: attack.name });
    runSteps([...(attack.fx || []).filter((step) => step.when === "before"), { op: "strike" }], ctx);
  },
  /** "Choose 1 Special Condition. The Defending Pokémon is now affected by that Special Condition." */
  chooseCondition(ctx) {
    const target = ctx.state.players[other(ctx.player)].active;
    if (!target || ctx.shielded) return;
    const kinds = ["Asleep", "Burned", "Confused", "Paralyzed", "Poisoned"];
    ctx.state.pending.push({ type: "option", player: ctx.player, why: "condition", prompt: "Choose the Special Condition.", labels: kinds, options: kinds.map((kind) => [{ op: "fx", steps: [cond(kind)], uid: ctx.slot.uid }]) });
  },
  /** Look at the top n cards of their deck (`either`: the attacker picks whose) and put them back in any order. */
  arrangeDeck(ctx, { n, either = false }) {
    const { state, player } = ctx;
    if (either) return void state.pending.push({ type: "option", player, why: "whoseDeck", prompt: "Whose deck do you look at?", labels: ["Yours", "Theirs"], options: [[{ op: "trainer", steps: [{ op: "arrange", n }] }], [{ op: "fx", steps: [{ op: "arrangeDeck", n }], uid: ctx.slot.uid }]] });
    const foe = other(player);
    const deck = state.players[foe].deck;
    const many = Math.min(deck.length, n);
    if (many < 2) return;
    askChoose(state, { player, owner: foe, zone: "deck", what: "any", uids: deck.slice(0, many), min: many, max: many, effect: { op: "order", at: "top" } });
  },
  /** "Discard the top 3 cards of your deck. If any of those cards are Energy cards, attach them to this Pokémon." */
  millAttach(ctx, { n }) {
    const { state, player, defs, events, slot } = ctx;
    const side = state.players[player];
    const spot = spotOf(ctx);
    const gone = side.deck.splice(0, n);
    if (!gone.length) return;
    const energy = spot == null ? [] : gone.filter((uid) => defOf(state, uid, defs).kind === "energy" && energyFits(defOf(state, uid, defs), defOf(state, slot.uid, defs)));
    const rest = gone.filter((uid) => !energy.includes(uid));
    side.discard.push(...rest);
    events.push({ t: "mill", p: player, uids: gone });
    for (const uid of energy) {
      slot.energy.push(uid);
      events.push({ t: "attach", p: player, uid, spot, from: "deck" });
    }
  },
};

const N = "(\\d+|an?|one|two|three|four|five|six)";
const TYPE = "(Grass|Fire|Water|Lightning|Psychic|Fighting|Darkness|Metal|Fairy)";
const SHUFFLED = "(?:Then, shuffle your deck\\.|Shuffle your deck afterward\\.)";

const NO_TYPING_NOTE = "(?: \\(Don't apply Weakness and Resistance for Benched Pokémon\\.\\))?";
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
  ].find(([re]) => re.test(p));
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
  if (new RegExp(`^this Pokémon and ${OPP} have the same amount of Energy attached to them$`).test(p)) return { test: "sameEnergy" };
  // The opposite of some of the above.
  if (/^this Pokémon has no damage counters on it$/.test(p)) return { test: "selfDamaged", not: true };
  if (new RegExp(`^${OPP} has no damage counters on it(?: before this attack does damage)?$`).test(p)) return { test: "foeDamaged", not: true };
  if (/^there is no Stadium in play$/.test(p)) return { test: "stadium", not: true };
  if ((m = p.match(new RegExp(`^${OPP} is not ${COND}$`)))) return { test: "foeStatus", kind: m[1].toLowerCase(), not: true };
  if ((m = p.match(/^this Pokémon has (\d+) or more damage counters on it$/))) return { test: "selfCountersAtLeast", k: Number(m[1]) };
  if ((m = p.match(new RegExp(`^${OPP} has (\\d+) or more damage counters on it$`)))) return { test: "foeCountersAtLeast", k: Number(m[1]) };
  if ((m = p.match(new RegExp(`^this Pokémon has at least (\\d+) extra (?:${TYPE} )?Energy attached(?: to it)? \\(in addition to this attack's cost\\)$`)))) return { test: "spareAtLeast", k: Number(m[1]), ...(m[2] ? { type: m[2] } : {}) };
  if ((m = p.match(/^you have (\d+) or fewer Benched Pokémon$/))) return { test: "ownBenchAtMost", k: Number(m[1]) };
  if ((m = p.match(/^you (don't )?have exactly (\d+) cards? in your hand$/))) return { test: "handExactly", k: Number(m[2]), ...(m[1] ? { not: true } : {}) };
  if ((m = p.match(/^your opponent has (\d+) or fewer cards in (?:their|his or her) hand$/))) return { test: "foeHandAtMost", k: Number(m[1]) };
  if ((m = p.match(/^there are (\d+) or fewer cards in your deck$/))) return { test: "deckAtMost", k: Number(m[1]) };
  if ((m = p.match(/^(you have|your opponent has) exactly (\d+) Prize cards? remaining$/))) return { test: "prizesExactly", k: Number(m[2]), ...(m[1] === "you have" ? {} : { foe: true }) };
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
  [/^Discard all Energy (?:from|attached to) this Pokémon\.$/, () => [{ op: "discardEnergy", when: "after", n: 99, type: "" }]],
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
  // A choice before the damage: a Pokémon switched in to take it, an attack of theirs to use.
  [new RegExp(`^(?:Switch ${N} of your opponent's Benched Pokémon with (?:their|his or her|your opponent's) Active Pokémon|Switch in ${N} of your opponent's Benched Pokémon to the Active Spot)\\. This attack does (\\d+) damage to the new Active Pokémon\\.$`, "i"), (m) => [{ op: "trainer", when: "before", steps: [{ op: "gust" }] }, { op: "setDamage", when: "before", n: Number(m[3]) }]],
  [/^Choose 1 of (?:your opponent's Active Pokémon's|the Defending Pokémon's|your opponent's Active (Tera) Pokémon's) attacks and use it as this attack\.$/, (m) => [{ op: "copyAttack", when: "before", ...(m[1] ? { tera: true } : {}) }]],
  [/^Don't apply Weakness and Resistance for this attack\. \(Any other effects that would happen after applying Weakness and Resistance still happen\.\)$/, () => [{ op: "typing", when: "before", noWeakness: true, noResistance: true }]],
  // Damage to Benched Pokémon (and to their Active one too, with Weakness and Resistance for it alone), in every wording (spreadTo).
  [new RegExp(`^(?:This attack (?:also )?does|Does) (\\d+) damage to (.+?)( that (?:has|have) any damage counters on (?:it|them)| that (?:doesn't|don't) have any damage counters on (?:it|them))?(?: \\(\\d+ if there is only \\d+\\))?\\.${NO_TYPING_NOTE}$`), (m) => spreadTo(m[2], Number(m[1]), m[3])],
  [new RegExp(`^Choose ${N} of your opponent's (Benched )?Pokémon( that (?:has|have) any damage counters on (?:it|them)| that (?:doesn't|don't) have any damage counters on (?:it|them))?\\. This attack does (\\d+) damage to (?:it|that Pokémon|each of them|each of those Pokémon)\\.${NO_TYPING_NOTE}$`, "i"), (m) => spreadTo(`${m[1]} of your opponent's ${m[2] ? "Benched " : ""}Pokémon`, Number(m[4]), m[3])],
  [new RegExp(`^If your opponent has any Benched Pokémon, choose ${N} of them and this attack does (\\d+) damage to (?:it|each of them)\\.${NO_TYPING_NOTE}$`, "i"), (m) => spreadTo(`${m[1]} of your opponent's Benched Pokémon`, Number(m[2]))],
  // Special Conditions, more than one, or on both Active Pokémon.
  [new RegExp(`^${FOE} is now ${COND}, ${COND}, and ${COND}\\.$`, "i"), (m) => [cond(m[1]), cond(m[2]), cond(m[3])]],
  [new RegExp(`^(?:Both Active Pokémon|Both this Pokémon and ${FOE}|This Pokémon and ${FOE}) are now ${COND}\\.$`, "i"), (m) => [cond(m[1]), cond(m[1], true)]],
  [new RegExp(`^Each Defending Pokémon is now ${COND}\\.$`), (m) => [cond(m[1])]],
  [new RegExp(`^${FOE} is now Poisoned\\. (?:Put (\\d+) damage counters instead of 1 on (?:that Pokémon|the Defending Pokémon|it) between turns|During Pokémon Checkup, (?:put|place) (\\d+) damage counters on (?:that Pokémon|it) instead of 1)\\.$`, "i"), (m) => [{ ...cond("poisoned"), counters: Number(m[1] || m[2]) * 10 }]],
  [new RegExp(`^${FOE} is now ${COND}\\. (?:During your opponent's next turn, that Pokémon can't retreat|That Pokémon can't retreat during your opponent's next turn)\\.$`, "i"), (m) => [cond(m[1]), mark("noRetreat", { on: "foe" })]],
  // Coins: a coin for more damage with more to it after the damage; coins that can stop the attack.
  [/^Flip a coin\. If heads, this attack does (?:\d+ damage plus )?(\d+) more damage(?: and ([^.;]+))?(?:\.|;)(?: [Ii]f tails, (?:this attack does \d+ damage and )?(.+?\.))?$/, (m) => {
    if (!m[2] && !m[3]) return null;
    const heads = m[2] ? afterOnly(`${upper(m[2])}.`) : [];
    const tails = m[3] ? afterOnly(upper(m[3])) : [];
    return heads && tails && [{ op: "flipBonus", when: "before", n: Number(m[1]) }, { op: "onCoin", when: "after", ...(heads.length ? { heads } : {}), ...(tails.length ? { tails } : {}) }];
  }],
  [/^Flip a coin\. (?:If tails, this attack does nothing\. If heads, (.+)|If heads, (.+?)\. If tails, this attack does nothing(?: \(not even damage\))?\.)$/, (m) => {
    const heads = afterOnly(m[1] || `${m[2]}.`);
    return heads && [{ op: "flipOrNothing", when: "before" }, { op: "onCoin", when: "after", heads }];
  }],
  [new RegExp(`^Flip ${N} coins\\. If (?:either|any|one) of them is tails, this attack does nothing\\.$`, "i"), (m) => [{ op: "flipCancel", when: "before", coins: count(m[1]) }]],
  [new RegExp(`^Flip ${N} coins\\. If (?:both|all) of them are tails, this attack does nothing\\.$`, "i"), (m) => [{ op: "flipCancel", when: "before", coins: count(m[1]), all: true }]],
  [new RegExp(`^Flip ${N} coins\\. If (?:both|all) of them are heads, (.+)$`, "i"), (m) => {
    const steps = afterOnly(upper(m[2]));
    return steps && [{ op: "flipAllThen", when: "after", coins: count(m[1]), steps }];
  }],
  [new RegExp(`^Flip (${N} coins?|a coin until you get tails)\\. For each heads, (.+)$`, "i"), (m) => {
    // The Trainer reader's wordings ("For each heads, draw a card") stay with it.
    const steps = !asTrainer(m[0]) && afterOnly(upper(m[3]));
    return steps && [{ op: "flipRepeat", when: "after", ...(/until/.test(m[1]) ? { until: true } : { coins: count(m[2]) }), steps }];
  }],
  [/^If (.+?), this attack does nothing\.$/, (m) => {
    const t = testOf(m[1]);
    return t && [{ op: "cancelIf", when: "before", ...t }];
  }],
  // Effects on the Defending Pokémon during the opponent's next turn.
  [new RegExp(`^(?:${FOE} can't attack during your opponent's next turn|During your opponent's next turn, ${FOE} can't (?:attack|use attacks))\\.$`, "i"), () => [mark("noAttack", { on: "foe" })]],
  [new RegExp(`^(?:${FOE} can't attack or retreat during your opponent's next turn|During your opponent's next turn, ${FOE} can't attack or retreat)\\.$`, "i"), () => [mark("noAttack", { on: "foe" }), mark("noRetreat", { on: "foe" })]],
  [new RegExp(`^${FOE} can't retreat until the end of your opponent's next turn\\.$`, "i"), () => [mark("noRetreat", { on: "foe" })]],
  [new RegExp(`^During your opponent's next turn, if ${FOE} tries to (?:attack|use an attack), your opponent flips a coin\\. If tails, that attack does(?: nothing|n't happen)\\.$`), () => [mark("mustFlip", { on: "foe" })]],
  [/^Until the end of your next turn, if an attack damages the Defending Pokémon \(after applying Weakness and Resistance\), that attack does (\d+) more damage to the Defending Pokémon\.$/, (m) => [mark("exposed", { on: "foe", mine: true, n: Number(m[1]) })]],
  [/^(?:During your opponent's next turn, (?:they|your opponent) can't play any (.+?) cards? from (?:their|his or her) hand|Your opponent can't play any (.+?) cards? from (?:their|his or her) hand during (?:their|his or her) next turn)\.$/, (m) => {
    const kinds = (m[1] || m[2]).split(/, or |, | or /).map((k) => ({ Item: "item", Supporter: "supporter", Stadium: "stadium", "Special Energy": "special", Trainer: "trainer" })[k]);
    return kinds.every(Boolean) && [{ op: "lockHand", when: "after", kinds }];
  }],
  // Effects on this Pokémon during the opponent's next turn.
  [/^During your opponent's next turn, this Pokémon has no Weakness\.$/, () => [mark("noWeakness")]],
  [/^During your opponent's next turn, if this Pokémon is damaged by an attack \(even if (?:it|this Pokémon) is Knocked Out\), put (\d+) damage counters? on the Attacking Pokémon\.$/, (m) => [mark("spite", { n: Number(m[1]) * 10 })]],
  [/^During your opponent's next turn, (?:this Pokémon takes (\d+) more damage from attacks|any damage done to this Pokémon by attacks is increased by (\d+)) \(after applying Weakness and Resistance\)\.$/, (m) => [mark("exposed", { n: Number(m[1] || m[2]) })]],
  [/^During your opponent's next turn, prevent all damage done to this Pokémon by attacks if that damage is (\d+) or less\.$/, (m) => [mark("harden", { n: Number(m[1]) })]],
  [/^(?:Prevent all effects of attacks, including damage, done to this Pokémon during your opponent's next turn|During your opponent's next turn, prevent all damage from and effects of attacks done to this Pokémon)\.$/, () => [mark("shield")]],
  // Energy, theirs and this Pokémon's.
  [new RegExp(`^Discard all (basic )?(?:${TYPE} )?Energy(?: cards)? (?:from|attached to) this Pokémon(?: in order to use this attack)?\\.$`, "i"), (m) => [{ op: "discardEnergy", when: "after", n: 99, type: m[2] || "", ...(m[1] ? { basic: true } : {}) }]],
  [new RegExp(`^Discard ${N} (basic )?(?:${TYPE} )?Energy(?: cards?)? attached to this Pokémon or this attack does nothing\\.$`, "i"), (m) => [{ op: "payOrNothing", when: "before", n: count(m[1]), type: m[3] || "", ...(m[2] ? { basic: true } : {}) }]],
  [new RegExp(`^If ${FOE} has any Energy cards attached to it, choose (?:1|one) of them and discard it\\.$`), () => [{ op: "discardFoeEnergy", when: "after", n: 1 }]],
  [new RegExp(`^If ${FOE} has any Energy cards attached to it, flip a coin\\. If heads, choose (?:1|one) of (?:them|those Energy cards) and discard it\\.$`), () => [{ op: "flip", when: "after", heads: [{ op: "discardFoeEnergy", n: 1 }] }]],
  [new RegExp(`^Discard all Energy(?: cards)? (?:from|attached to) ${FOE}\\.$`), () => [{ op: "discardFoeEnergy", when: "after", n: 99 }]],
  [new RegExp(`^Discard ${N} ${TYPE} Energy(?: cards?)? (?:from|attached to) ${FOE}\\.$`, "i"), (m) => [{ op: "discardFoeEnergy", when: "after", n: count(m[1]), type: m[2] }]],
  [new RegExp(`^Put ${N} Energy(?: cards?)? attached to ${FOE} into (?:their|his or her|your opponent's) hand\\.$`, "i"), (m) => [{ op: "foeEnergyToHand", when: "after", n: count(m[1]) }]],
  // Devolving, Knocking Out, damage counters, Prize cards.
  [new RegExp(`^If ${FOE} is an evolved Pokémon, devolve it by putting the highest Stage Evolution card on it into your opponent's hand\\.$`, "i"), () => [{ op: "devolveFoe", when: "after" }]],
  [new RegExp(`^${FOE} is Knocked Out\\.$`, "i"), () => [{ op: "knockOut", when: "after" }]],
  [new RegExp(`^Put damage counters on ${FOE} until its remaining HP is (\\d+)\\.$`), (m) => [{ op: "countersTo", when: "after", hp: Number(m[1]) }]],
  [/^Put (\d+) damage counters? on this Pokémon\.$/, (m) => [{ op: "selfDamage", when: "after", n: Number(m[1]) * 10 }]],
  [new RegExp(`^If your opponent's (?:Active )?Pokémon is Knocked Out by damage from this attack, take ${N} more Prize cards?\\.$`, "i"), (m) => [{ op: "bounty", when: "before", n: count(m[1]) }]],
  // Healing this Pokémon.
  [/^Heal all damage from this Pokémon\.$/, () => [{ op: "healSelf", when: "after", n: 9990 }]],
  [/^Heal (\d+) damage and remove all Special Conditions from this Pokémon\.$/, (m) => [{ op: "healSelf", when: "after", n: Number(m[1]) }, ...fromDeck([{ op: "cure", to: "self" }])]],
  [/^Remove all Special Conditions and (\d+) damage counters? from this Pokémon\.$/, (m) => [...fromDeck([{ op: "cure", to: "self" }]), { op: "healSelf", when: "after", n: Number(m[1]) * 10 }]],
  [new RegExp(`^This Pokémon is now ${COND}\\. Heal (\\d+) damage from (?:it|this Pokémon)\\.$`), (m) => [cond(m[1], true), { op: "healSelf", when: "after", n: Number(m[2]) }]],
  // A Stadium that adds damage, then goes.
  [/^If (?:there is any Stadium card in play|a Stadium is in play), this attack does (?:\d+ damage plus )?(\d+) more damage\. (?:Then, d|D)iscard that Stadium(?: card)?\.$/, (m) => [{ op: "bonusIf", when: "before", n: Number(m[1]), test: "stadium" }, ...fromDeck([{ op: "dropStadium" }])]],
  [/^Your opponent draws (a|\d+) cards?\.$/, (m) => fromDeck([{ op: "foeDraw", n: count(m[1]) }])],
  // More that comes after the damage.
  [/^Your opponent reveals (?:their|his or her) hand\. This attack does (\d+) damage for each Trainer card you find there\.$/, (m) => [{ op: "bonusPer", when: "before", how: "times", n: Number(m[1]), per: "foeHandTrainers" }, { op: "lookHand", when: "after" }]],
  [new RegExp(`^Discard the top ${N} cards of your deck\\. If any of those cards are Energy cards, attach them to this Pokémon\\.$`, "i"), (m) => [{ op: "millAttach", when: "after", n: count(m[1]) }]],
  [new RegExp(`^Discard ${N} (?:${TYPE} )?Energy(?: cards?)? (?:from|attached to) this Pokémon\\. If you do, (.+)$`, "i"), (m) => {
    const then = afterOnly(upper(m[3].replace(/^switch it with/, "switch this Pokémon with")));
    return then && [{ op: "discardEnergy", when: "after", n: count(m[1]), type: m[2] || "", then }];
  }],
  [/^This Pokémon does (\d+) damage to itself, and don't apply Weakness and Resistance to this damage\.$/, (m) => [{ op: "selfDamage", when: "after", n: Number(m[1]) }]],
  [/^Put (\d+) damage counters? on each of your opponent's (Benched )?Pokémon( that has any damage counters on it)?\.$/, (m) => [{ op: "counters", when: "after", n: Number(m[1]) * 10, where: m[2] ? "bench" : "any", ...(m[3] ? { damaged: true } : {}) }]],
  [new RegExp(`^Put ${N} ${TYPE} Energy(?: cards?)? attached to this Pokémon into your hand\\.$`, "i"), (m) => [{ op: "energyToHand", when: "after", n: count(m[1]), type: m[2] }]],
  [new RegExp(`^Choose (?:1|a) Special Condition\\. ${FOE} is now affected by that Special Condition\\.$`, "i"), () => [{ op: "chooseCondition", when: "after" }]],
  [new RegExp(`^Look at the top ${N} cards of (your opponent's|either player's) deck and put them back(?: on top of that player's deck)? in any order\\.$`, "i"), (m) => [{ op: "arrangeDeck", when: "after", n: count(m[1]), ...(/either/.test(m[2]) ? { either: true } : {}) }]],
  // A coin in front, or "you may", of any effect above that comes after the damage.
  [/^Flip a coin\. If (heads|tails), (.+)$/, (m) => {
    // The other side of the coin, or a change to the attack's own damage, in the same breath: not read here.
    if (/\bif (?:heads|tails)\b|this attack does (?:nothing|no damage)|\binstead\b/i.test(m[2])) return null;
    let inner = afterOnly(upper(m[2]));
    // "the Defending Pokémon is now Paralyzed and discard an Energy attached to it": two effects, each read.
    for (let at = m[2].indexOf(" and "); !inner && at > 0; at = m[2].indexOf(" and ", at + 1)) {
      const left = afterOnly(`${upper(m[2].slice(0, at))}.`);
      const right = left && afterOnly(upper(m[2].slice(at + 5)));
      if (right) inner = [...left, ...right];
    }
    return inner ? [{ op: "flip", when: "after", [m[1]]: inner }] : null;
  }],
  [/^You may (.+)$/, (m) => {
    const inner = compileOne(upper(m[1]));
    return inner && inner.every((step) => step.when === "after") ? [{ op: "may", when: "after", steps: inner, prompt: `${upper(m[1]).replace(/\.$/, "")}?` }] : null;
  }],
  // "If <something on the table>, <an effect after the damage>" (testOf), "it" being the Defending Pokémon when the test is about it.
  [/^If (.+?), (?!this attack\b)(.+)$/, (m) => {
    const t = testOf(m[1]);
    // What the damage itself changes is not asked after it.
    if (!t || ["foeDamaged", "foeCountersAtLeast"].includes(t.test)) return null;
    const aboutFoe = new RegExp(`^(?:${FOE}|the Defending Pokémon)`).test(m[1]);
    const rest = aboutFoe ? m[2].replace(/^(?:it|that Pokémon) /, "the Defending Pokémon ") : m[2];
    if (!aboutFoe && /^(?:it|that Pokémon) /.test(rest)) return null;
    const steps = afterOnly(upper(rest));
    return steps && [{ op: "when", when: "after", ...t, steps }];
  }],
];

/** The steps of an effect that comes after the damage (none of it changing the damage), or null. */
function afterOnly(text) {
  const steps = compileOne(text);
  return steps && steps.every((step) => step.when === "after") ? steps : null;
}

/** Who "does 20 damage to <phrase>" hits: spread's steps, or null for a phrase not read. `which`: "that has any damage counters on it". */
function spreadTo(phrase, n, which = "") {
  const p = phrase.replace(/^(\w+) of your own /, "$1 of your ");
  let m;
  const kinds = {
    "each of your opponent's Benched Pokémon": { to: "bench" },
    "each of your Benched Pokémon": { to: "ownBench" },
    "each of your own Benched Pokémon": { to: "ownBench" },
    "each Benched Pokémon (both yours and your opponent's)": { to: "allBench" },
    "each Pokémon on each player's Bench": { to: "allBench" },
    "each of your opponent's Pokémon": { to: "any" },
  };
  let how = kinds[p];
  if (!how && (m = p.match(new RegExp(`^${N} of your (opponent's Benched|Benched|opponent's) Pokémon$`, "i")))) how = { to: { "opponent's Benched": "bench", Benched: "ownBench", "opponent's": "any" }[m[2]], count: count(m[1]) };
  if (!how || (which && how.to === "allBench")) return null;
  const damaged = which ? !/n't have/.test(which) : null;
  return [{ op: "spread", when: "after", n, ...how, ...(damaged != null ? { damaged } : {}) }];
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
const trainerCtx = (ctx) => ({ state: ctx.state, defs: ctx.defs, events: ctx.events, player: ctx.player, spot: spotOf(ctx), src: "attack" });

/**
 * Run the steps in order. One that leaves a choice holds the rest back: they ride on that choice
 * (as the Trainer steps' `then` do) and run once it is made, as the text orders them.
 */
function runSteps(steps, ctx) {
  for (let i = 0; i < steps.length; i += 1) {
    const before = ctx.state.pending.length;
    OPS[steps[i].op]?.(ctx, steps[i]);
    // The step took the rest of the attack over (an attack copied: its own steps and damage).
    if (ctx.detached) {
      delete ctx.detached;
      return;
    }
    if (ctx.state.pending.length > before) {
      const waiting = ctx.state.pending[ctx.state.pending.length - 1];
      const rest = steps.slice(i + 1);
      // Before the damage, the damage so far and the attack go along with the rest.
      const carry = rest.some((step) => step.op === "strike") ? { hit: ctx.hit, atk: ctx.atk } : ctx.hit.coin != null ? { coin: ctx.hit.coin } : {};
      if (rest.length) waiting.then = [...(waiting.then || []), { op: "fx", steps: rest, uid: ctx.slot.uid, ...carry }];
      // The other player's choice ("your opponent switches"): what follows is still the attacker's.
      if (waiting.player !== ctx.player && waiting.by == null) waiting.by = ctx.player;
      return;
    }
  }
}

/** Steps that waited on a choice (trainers.js T_OPS.fx): the attack's context again, if the attacker is still in play. */
export function runFx(tctx, { steps, uid, coin = null, hit = null, atk = null }) {
  const { state, defs, player } = tctx;
  const mine = inPlay(state, player).find(([slot]) => slot.uid === uid);
  if (!mine) return;
  const target = state.players[other(player)].active;
  const shielded = Boolean(target && (markOn(state, target, "shield") || abilityOn(state, target, defs)?.noEffects));
  const attack = atk ? defs(atk[0]).attacks[atk[1]] : null;
  runSteps(steps, { state, defs, events: tctx.events, player, slot: mine[0], target, attack, atk, hit: hit ? { ...hit } : { damage: 0, cancelled: false, ...(coin != null ? { coin } : {}) }, shielded });
}

/** The attack's steps for one phase; `withStrike`: the damage (engine.js strike) after the steps before it, when they are done. */
export function runAttackEffects(when, attack, ctx, withStrike = false) {
  runSteps([...(attack.fx || []).filter((step) => step.when === when), ...(withStrike ? [{ op: "strike" }] : [])], ctx);
}
