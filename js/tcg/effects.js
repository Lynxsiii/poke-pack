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

import { ACTIVE, abilityOn, addCondition, addMark, askChoose, askPick, benchSafe, conditionsOn, damageAfterTyping, defOf, devolveSlot, energyAlike, energyFits, energyOf, flip, healRoom, heldOn, hpLeft, inPlay, markOn, maxHp, other, rand, retreatCost, shedEnergy, shuffle, slotAt, strike, struck, switchActive, toolGone, unpaid, warded, win } from "./engine.js";
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
const hasAttack = (def, name) => def?.kind === "pokemon" && (def.attacks || []).some((a) => a.name === name);

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
  // "that much more damage": what attacks did to it during the opponent's last turn (engine.js struck).
  struck: (ctx) => (ctx.slot.struckOn === ctx.state.turn - 1 ? ctx.slot.struckFor || 0 : 0),
  benchCounters: (ctx, who) => sideOf(ctx, true).bench.filter((s) => !who || fits(defIn(ctx, s), who)).reduce((n, s) => n + s.damage / 10, 0),
  // "for each card you discarded in this way" (OPS.pay keeps them in hit.paid); `type` here is a card kind (trainers.js fits).
  paid: (ctx, what) => (ctx.hit.paid || []).filter((uid) => !what || fits(defOf(ctx.state, uid, ctx.defs), what)).length,
  // "for each Pokémon in your discard pile / of your Pokémon in play / of your Benched Pokémon that has the Round attack":
  // Pokémon whose attacks include one of that name (`type` is the name).
  discardAttack: (ctx, name) => sideOf(ctx, true).discard.filter((uid) => hasAttack(defOf(ctx.state, uid, ctx.defs), name)).length,
  ownAttack: (ctx, name) => slotsOf(sideOf(ctx, true)).filter((s) => hasAttack(defIn(ctx, s), name)).length,
  benchAttack: (ctx, name) => sideOf(ctx, true).bench.filter((s) => hasAttack(defIn(ctx, s), name)).length,
  // "for each of your Ultra Beasts in play" (`type` is the card's printed kind, cards.js TAGS).
  ownTag: (ctx, tag) => slotsOf(sideOf(ctx, true)).filter((s) => (defIn(ctx, s).tags || []).includes(tag)).length,
  // "for each different type of Pokémon on your Bench": a Pokémon of two types counts for both.
  ownPrizesLeft: (ctx) => sideOf(ctx, true).prizes.length,
  // "for each type of basic Energy card in your discard pile".
  discardEnergyTypes: (ctx) => new Set(sideOf(ctx, true).discard.map((uid) => defOf(ctx.state, uid, ctx.defs)).filter((d) => d?.kind === "energy" && d.basic).flatMap((d) => d.provides || [])).size,
  benchTypes: (ctx) => new Set(sideOf(ctx, true).bench.flatMap((s) => defIn(ctx, s).types || [])).size,
  ownType: (ctx, type) => slotsOf(sideOf(ctx, true)).filter((s) => defIn(ctx, s).types.includes(type)).length,
  allEnergy: (ctx, type) => COUNTS.ownAllEnergy(ctx, type) + COUNTS.foeAllEnergy(ctx, type),
  benchDamaged: (ctx) => sideOf(ctx, true).bench.filter((s) => s.damage > 0).length,
  foeAbility: (ctx) => slotsOf(sideOf(ctx)).filter((s) => defIn(ctx, s).abilityKind === "Ability").length,
  foeBoxes: (ctx, boxes) => slotsOf(sideOf(ctx)).filter((s) => boxes.split(",").includes(defIn(ctx, s).box)).length,
  ownNamed: (ctx, name) => slotsOf(sideOf(ctx, true)).filter((s) => defIn(ctx, s).name === name).length,
  // "for each Supporter card in your discard pile" (`type` a card kind, trainers.js fits), "... in your opponent's discard pile".
  discardKind: (ctx, what) => sideOf(ctx, true).discard.filter((uid) => fits(defOf(ctx.state, uid, ctx.defs), what)).length,
  foeDiscardKind: (ctx, what) => sideOf(ctx).discard.filter((uid) => fits(defOf(ctx.state, uid, ctx.defs), what)).length,
  discardType: (ctx, type) => sideOf(ctx, true).discard.filter((uid) => defOf(ctx.state, uid, ctx.defs)?.kind === "pokemon" && defOf(ctx.state, uid, ctx.defs).types.includes(type)).length,
};

/** What "If ..., this attack does more damage" asks. */
const TESTS = {
  foeDamaged: (ctx) => ctx.target?.damage > 0,
  foeCountersAtLeast: (ctx, { k }) => (ctx.target?.damage || 0) >= k * 10,
  selfDamaged: (ctx) => ctx.slot.damage > 0,
  foeStage: (ctx, { stage }) => Boolean(ctx.target) && defIn(ctx, ctx.target).stage === stage,
  foeBox: (ctx, { boxes }) => Boolean(ctx.target) && boxes.includes(defIn(ctx, ctx.target).box),
  foeTag: (ctx, { tag }) => Boolean(ctx.target) && (defIn(ctx, ctx.target).tags || []).includes(tag),
  foeHasTag: (ctx, { tag }) => slotsOf(sideOf(ctx)).some((s) => (defIn(ctx, s).tags || []).includes(tag)),
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
  sameEnergy: (ctx) => Boolean(ctx.target) && unitsOf(ctx, ctx.slot) === unitsOf(ctx, ctx.target),
  spareAtLeast: (ctx, { k, type = "" }) => spareUnits(ctx, type) >= k,
  ownBenchAtMost: (ctx, { k }) => sideOf(ctx, true).bench.length <= k,
  handExactly: (ctx, { k }) => sideOf(ctx, true).hand.length === k,
  foeHandAtMost: (ctx, { k }) => sideOf(ctx).hand.length <= k,
  deckAtMost: (ctx, { k }) => sideOf(ctx, true).deck.length <= k,
  prizesExactly: (ctx, { k, foe = false }) => sideOf(ctx, !foe).prizes.length === k,
  selfStatusOf: (ctx, { kinds }) => conditionsOn(ctx.slot).some((k) => kinds.includes(k)),
  foeLine: (ctx, { line }) => Boolean(ctx.target) && defIn(ctx, ctx.target).line === line,
  ownEnergyAtLeast: (ctx, { k, type = "" }) => COUNTS.ownAllEnergy(ctx, type) >= k,
  foeResistType: (ctx, { type }) => Boolean(ctx.target) && defIn(ctx, ctx.target).resistance?.type === type,
  foeBenchEmpty: (ctx) => sideOf(ctx).bench.length === 0,
};
/** Tests that hold all turn long (history), so an effect after the damage may ask them too. */
const STEADY = new Set(["movedUp", "healed", "downed", "struck", "foeBenchEmpty"]);

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
    const healed = Math.min(n, healRoom(ctx.state, ctx.slot));
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
  baseIf(ctx, step) {
    if (passes(ctx, step)) OPS.base(ctx, step);
  },
  /** Steps after the damage that happen only if a test holds (one that holds all turn long: STEADY). */
  ifTest(ctx, step) {
    if (passes(ctx, step)) runSteps(step.steps, ctx);
  },
  /**
   * "You may ..." before the damage is worked out ("You may discard all Energy from this Pokémon. If you do,
   * this attack does 80 more damage"): the attacker says yes or no now. Yes runs `steps` and marks the attack
   * (hit.did, TESTS.did, OPS.ifDid). The rest of the attack, its damage included, rides on each answer with the
   * damage so far (`rest`: runSteps hands it over), so it is the same attack whichever is chosen.
   * Not asked when the steps could do nothing.
   */
  ask(ctx, { steps = [], prompt }, rest = []) {
    if (!readyFx(ctx, steps)) return;
    const go = (list) => [{ op: "fx", steps: list, uid: ctx.slot.uid, hit: ctx.hit, atk: ctx.atk }];
    ctx.state.pending.push({ type: "option", player: ctx.player, why: "before", prompt, labels: ["Yes", "No"], options: [go([...steps, { op: "did" }, ...rest]), go(rest)] });
    ctx.detached = true;
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
  bonusIf(ctx, step) {
    if (passes(ctx, step)) ctx.hit.damage += step.n;
  },
  /** Heal the attacker by the damage its attack just did to the other Active Pokémon (engine.js keeps it in hit.dealt). */
  healDealt(ctx, { half = false }) {
    // `half`: "equal to half the damage done ... (rounded up to the nearest 10)".
    OPS.healSelf(ctx, { n: half ? Math.ceil((ctx.hit.dealt || 0) / 20) * 10 : ctx.hit.dealt || 0 });
  },
  /** The damage skips Weakness, Resistance, or what earlier attacks left on the target. */
  typing(ctx, { noWeakness = false, noResistance = false, noEffects = false }) {
    if (noWeakness) ctx.hit.noWeakness = true;
    if (noResistance) ctx.hit.noResistance = true;
    if (noEffects) ctx.hit.noEffects = true;
  },
  /** An effect that lasts a turn (engine.js, "effects that last a turn"). `mine`: it holds on the attacker's own next turn. */
  mark(ctx, { kind, on = "self", mine = false, n = 0, name = "", from = "", ko = false }) {
    const p = on === "self" ? ctx.player : other(ctx.player);
    const slot = on === "self" ? ctx.slot : ctx.state.players[p].active;
    if (!slot || (on !== "self" && ctx.shielded)) return;
    addMark(ctx.state, slot, { kind, turn: ctx.state.turn + (mine ? 2 : 1), ...(n ? { n } : {}), ...(name ? { name } : {}), ...(from ? { from } : {}), ...(ko ? { ko } : {}) });
    ctx.events.push({ t: "mark", p, kind, ...(n ? { n } : {}), ...(name ? { name } : {}) });
  },
  /**
   * Damage beyond the Active Pokémon. `to`: "bench" (theirs), "any" (theirs, the Active one
   * included, with Weakness and Resistance for it alone), "ownBench". `count` 0 is all of them;
   * otherwise the attacker chooses that many, when there are more than that to choose from.
   */
  spread(ctx, { n, to = "bench", count = 0, noTyping = false, pierce = false, damaged = null, per = "", type = "", only = null, stage = "", boxes = null, typed = false }) {
    const { state, player, events } = ctx;
    // "for each Grass Energy attached to this Pokémon": that much for each (COUNTS).
    if (per) n *= COUNTS[per](ctx, type);
    if (n <= 0) return;
    // "Each Benched Pokémon (both yours and your opponent's)": theirs, then yours.
    if (to === "allBench") {
      OPS.spread(ctx, { n, to: "bench", noTyping, pierce });
      return OPS.spread(ctx, { n, to: "ownBench", noTyping, pierce });
    }
    // `only`: these spots (coins flipped for each); `stage`, `boxes`: only their Basic Pokémon, their Pokémon V ...
    const kind = (slot) => {
      const def = defOf(state, slot.uid, ctx.defs);
      return (!stage || def.stage === stage) && (!boxes || boxes.includes(def.box));
    };
    const p = to === "ownBench" ? player : other(player);
    const side = state.players[p];
    // `damaged`: only those that have damage counters on them (false: only those that have none).
    const spots = [...(to === "any" && side.active ? [ACTIVE] : []), ...side.bench.map((_, i) => i)].filter((spot) => (damaged == null || ((spot === ACTIVE ? side.active : side.bench[spot]).damage > 0) === damaged) && (!only || only.includes(spot)) && kind(spot === ACTIVE ? side.active : side.bench[spot]));
    if (!spots.length) return;
    // `typed`: "Also apply Weakness and Resistance for Benched Pokémon."
    const from = to === "any" || typed ? ctx.slot.uid : "";
    // "This attack's damage isn't affected by Weakness or Resistance" holds for this damage too.
    // `pierce`: nor by effects on that Pokémon (an Ability that keeps Benched Pokémon safe).
    const typing = { ...(noTyping || ctx.hit.noWeakness ? { noWeakness: true } : {}), ...(noTyping || ctx.hit.noResistance ? { noResistance: true } : {}), ...(pierce ? { pierce } : {}) };
    if (count && spots.length > count) return askPick(state, { player, side: p, spots, left: count, effect: { op: "damage", n, from, attack: true, ...typing, ...(typed ? { typed } : {}) } });
    // No choice to make: it lands on all of them now.
    for (const spot of spots) {
      const slot = spot === ACTIVE ? side.active : side.bench[spot];
      const dealt = (spot === ACTIVE || typed) && from ? damageAfterTyping(n, defOf(state, from, ctx.defs), defOf(state, slot.uid, ctx.defs), typing) : { amount: n, weak: false, resist: false };
      if (dealt.amount <= 0) continue;
      if (pierce ? defOf(state, slot.uid, ctx.defs).tera && spot !== ACTIVE : benchSafe(state, slot, spot, ctx.defs, p === player)) continue;
      slot.damage += dealt.amount;
      struck(state, slot, dealt.amount);
      events.push({ t: "damage", p, spot, n: dealt.amount, weak: dealt.weak, resist: dealt.resist });
    }
  },
  /** The attacker trades places with one of its Benched Pokémon (its player chooses). */
  switchSelf(ctx, { optional = false, type = "", then = null }) {
    const { state, player } = ctx;
    const side = state.players[player];
    // `type`: "with 1 of your Benched Lightning Pokémon".
    const spots = side.bench.map((_, i) => i).filter((i) => !type || defIn(ctx, side.bench[i]).types.includes(type));
    if (!spots.length || hpLeft(state, ctx.slot, ctx.defs) <= 0) return;
    askPick(state, { player, side: player, spots, left: 1, effect: { op: "switch" }, optional });
    // "If you do, ...": once it has switched (a switch that can't happen leaves the rest undone).
    if (then) state.pending[state.pending.length - 1].then = [{ op: "fx", steps: then, uid: ctx.slot.uid }];
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
    const uids = slot.energy.filter((uid) => !type || (defOf(state, uid, defs).provides || []).some((u) => fitsType(u, type)));
    shedEnergy(state, player, foe, ACTIVE, uids, n, ctx.events, defs);
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
    if (all || uids.length <= n || energyAlike(state, uids, defs)) return askPick(state, { player, side: player, spots: bench, left: 1, effect: { op: "moveEnergyCards", from, uids: all ? uids : uids.slice(-n) } });
    askChoose(state, { player, zone: "play", what: "energy", uids, min: n, max: n, effect: { op: "carryEnergy", from } });
  },
  /** Energy from the attacker back to its owner's hand: the player chooses which, when they differ. */
  energyToHand(ctx, { n = 1, type = "" }) {
    const { state, player, events, slot } = ctx;
    const uids = slot.energy.filter((uid) => !type || (defOf(state, uid, ctx.defs).provides || []).includes(type));
    const spot = spotOf(ctx);
    if (!uids.length || spot == null) return;
    shedEnergy(state, player, player, spot, uids, n, events, ctx.defs, { toHand: true });
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
    shedEnergy(state, player, foe, ACTIVE, slot.energy.filter((uid) => !defOf(state, uid, defs).basic), 1, events, defs);
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
  /**
   * Discard Energy cards from the attacker: of one type when the card names it (an Energy that can be any type counts),
   * any otherwise. Which ones is the attacking player's choice when the cards differ and not all of them go.
   */
  discardEnergy(ctx, { n, type, basic = false, then = null }) {
    const { state, defs, slot, player } = ctx;
    const spot = spotOf(ctx);
    if (spot == null) return;
    const uids = slot.energy.filter((uid) => {
      const def = defOf(state, uid, defs);
      return (!type || (def.provides || []).some((u) => fitsType(u, type))) && (!basic || def.basic);
    });
    if (!uids.length) return;
    const asked = shedEnergy(state, player, player, spot, uids, n, ctx.events, defs);
    // "Discard an Energy from this Pokémon. If you do, ...": once it is gone (after the choice, when one is asked).
    if (!then) return;
    if (!asked) return runSteps(then, ctx);
    state.pending[state.pending.length - 1].then = [{ op: "fx", steps: then, uid: slot.uid, ...(ctx.hit.coin != null ? { coin: ctx.hit.coin } : {}) }];
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
    const have = slot.energy.filter((uid) => (!type || (defOf(state, uid, defs).provides || []).some((u) => fitsType(u, type))) && (!basic || defOf(state, uid, defs).basic)).length;
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
    shedEnergy(state, player, foe, ACTIVE, slot.energy.slice(), n, events, ctx.defs, { toHand: true });
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
  /** "Knock Out your opponent's Active Pokémon. If your opponent's Active Pokémon is Knocked Out in this way, this Pokémon does 200 damage to itself." */
  knockOutRecoil(ctx, { n }) {
    const slot = ctx.state.players[other(ctx.player)].active;
    if (!slot || ctx.shielded) return;
    OPS.knockOut(ctx);
    if (hpLeft(ctx.state, slot, ctx.defs) <= 0) OPS.selfDamage(ctx, { n });
  },
  /** Before the damage: one more Prize card (or n) if this attack's damage Knocks Out the other Active Pokémon (engine.js resolveKnockOuts). */
  bounty(ctx, { n, boxes = null }) {
    // `boxes`: "If your opponent's Pokémon-GX or Pokémon-EX is Knocked Out by damage from this attack".
    if (ctx.target && (!boxes || boxes.includes(defIn(ctx, ctx.target).box))) addMark(ctx.state, ctx.target, { kind: "bounty", turn: ctx.state.turn, n });
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
  copyAttack(ctx, { tera = false, any = false }) {
    const { state, player, defs } = ctx;
    const target = state.players[other(player)].active;
    // `any`: "Choose 1 of your opponent's Pokémon's attacks": their Benched Pokémon's too.
    const mons = (any ? inPlay(state, other(player)).map(([slot]) => slot) : target ? [target] : []).map((slot) => defOf(state, slot.uid, defs)).filter((def) => !tera || def.tera);
    const side = state.players[player];
    const can = [];
    const seen = new Set();
    for (const def of mons) {
      def.attacks.forEach((a, index) => {
        if ((a.once === "gx" && side.gxUsed) || (a.once === "vstar" && side.vstarUsed) || seen.has(`${def.id}/${index}`)) return;
        seen.add(`${def.id}/${index}`);
        can.push({ card: def.id, index, name: a.name });
      });
    }
    if (!can.length) return;
    if (can.length === 1) OPS.useAttack(ctx, { card: can[0].card, index: can[0].index });
    else state.pending.push({ type: "option", player, why: "copy", prompt: "Choose the attack to use.", labels: can.map((c) => c.name), options: can.map((c) => [{ op: "fx", steps: [{ op: "useAttack", card: c.card, index: c.index }], uid: ctx.slot.uid, hit: ctx.hit, atk: ctx.atk }]) });
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
  /**
   * "Discard 2 Energy from your opponent's Pokémon": from any of them, in any combination, the attacker's choice.
   * `each`: "an Energy from each of your opponent's Pokémon", the attacker choosing on each one whose cards differ.
   */
  discardFoeAny(ctx, { n = 1, each = false }) {
    const { state, player, defs, events } = ctx;
    const foe = other(player);
    const open = inPlay(state, foe).filter(([slot, spot]) => slot.energy.length && !(spot === ACTIVE && ctx.shielded) && !warded(state, slot, { player, src: "attack" }, defs));
    if (each || open.length === 1) {
      for (const [slot, spot] of open) shedEnergy(state, player, foe, spot, slot.energy.slice(), each ? 1 : n, events, defs);
      return;
    }
    const uids = open.flatMap(([slot]) => slot.energy);
    if (uids.length <= n) for (const [slot, spot] of open) shedEnergy(state, player, foe, spot, slot.energy.slice(), slot.energy.length, events, defs);
    else if (uids.length) askChoose(state, { player, zone: "play", what: "energy", uids, min: n, max: n, effect: { op: "dropInPlay" } });
  },
  /** "Move all Energy from this Pokémon to your Benched Pokémon in any way you like": a Benched Pokémon for each card, the player's pick. */
  spreadOwnEnergy(ctx) {
    const { state, player, slot } = ctx;
    const from = spotOf(ctx);
    const bench = state.players[player].bench.map((_, i) => i).filter((i) => i !== from);
    if (from == null || !bench.length || !slot.energy.length) return;
    if (bench.length === 1) return askPick(state, { player, side: player, spots: bench, left: 1, effect: { op: "moveEnergyCards", from, uids: slot.energy.slice() } });
    for (const uid of slot.energy.slice()) askPick(state, { player, side: player, spots: bench, left: 1, effect: { op: "moveEnergyCards", from, uids: [uid] } });
  },
  /** "Move any number of Energy from your Pokémon to your other Pokémon in any way you like": one at a time, until the player stops (engine.js rearrangeFrom). */
  rearrangeEnergy(ctx, { type = "", basic = false }) {
    const { state, player, defs } = ctx;
    const mine = inPlay(state, player);
    const spots = mine.filter(([slot]) => slot.energy.some((uid) => {
      const def = defOf(state, uid, defs);
      return (!type || (def.provides || []).includes(type)) && (!basic || def.basic);
    })).map(([, spot]) => spot);
    if (spots.length && mine.length > 1) askPick(state, { player, side: player, spots, left: 1, optional: true, effect: { op: "rearrangeFrom", type, basic } });
  },
  /** "Count the cards in your opponent's hand. Put that many damage counters on the Defending Pokémon." (COUNTS) */
  countersPer(ctx, { per, type = "", k = 1 }) {
    const n = COUNTS[per](ctx, type) * 10 * k;
    if (n > 0) OPS.counters(ctx, { n, where: "active" });
  },
  /** "Switch all damage counters on this Pokémon with those on your opponent's Active Pokémon." */
  swapCounters(ctx) {
    const { state, player, defs, events, slot } = ctx;
    const target = state.players[other(player)].active;
    if (!target || ctx.shielded || warded(state, target, { player, src: "attack" }, defs) || target.damage === slot.damage) return;
    const [mine, theirs] = [slot.damage, target.damage];
    slot.damage = theirs;
    target.damage = mine;
    for (const [p, spot, was, now] of [[player, spotOf(ctx) ?? ACTIVE, mine, theirs], [other(player), ACTIVE, theirs, mine]]) {
      if (now > was) events.push({ t: "damage", p, spot, n: now - was, why: "move" });
      else events.push({ t: "heal", p, spot, n: was - now, why: "move" });
    }
  },
  /** "Knock Out 1 of your opponent's Basic Pokémon that isn't a Pokémon-GX": the attacker picks it (`stage`, `notBoxes`). */
  knockOutOne(ctx, { stage = "", notBoxes = [] }) {
    const { state, player, defs } = ctx;
    const foe = other(player);
    const spots = inPlay(state, foe).filter(([slot, spot]) => {
      const def = defOf(state, slot.uid, defs);
      return (!stage || def.stage === stage) && !notBoxes.includes(def.box) && !(spot === ACTIVE && ctx.shielded) && !warded(state, slot, { player, src: "attack" }, defs) && hpLeft(state, slot, defs) > 0;
    }).map(([, spot]) => spot);
    if (spots.length) askPick(state, { player, side: foe, spots, left: 1, effect: { op: "knockOut" } });
  },
  /** When the attack may be used at all: "If you go first, you can use this attack on your first turn" (engine.js reads these). */
  firstTurn() {},
  notSecondFirst() {},
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
  /** "Heal 20 damage from each of your Pokémon" (`foe`: "each Pokémon (both yours and your opponent's)", theirs too). */
  healEvery(ctx, { n, own = true, foe = false }) {
    const { state, player, events } = ctx;
    for (const p of [...(own ? [player] : []), ...(foe ? [other(player)] : [])]) {
      for (const [slot, spot] of inPlay(state, p)) {
        const healed = Math.min(n, healRoom(state, slot));
        if (!healed) continue;
        slot.damage -= healed;
        slot.healedOn = state.turn;
        events.push({ t: "heal", p, spot, n: healed });
      }
    }
  },
  /** "Draw a card. If you do, this Pokémon is now Asleep.": nothing to draw, nothing after. */
  drawIf(ctx, { n, steps }) {
    if (!ctx.state.players[ctx.player].deck.length) return;
    OPS.draw(ctx, { n });
    runSteps(steps, ctx);
  },
  /** "Switch 1 of your opponent's Benched Pokémon with their Active Pokémon. The new Active Pokémon is now Confused." */
  newActive(ctx, { steps }) {
    if (!trainerReady([{ op: "gust" }], trainerCtx(ctx))) return;
    runSteps([{ op: "trainer", steps: [{ op: "gust" }] }, { op: "refocus" }, ...steps], ctx);
  },
  /** The other Active Pokémon may have changed (a switch): what the steps after this say of it is about the new one. */
  refocus(ctx) {
    const target = ctx.state.players[other(ctx.player)].active;
    ctx.target = target;
    ctx.shielded = Boolean(target && (markOn(ctx.state, target, "shield") || abilityOn(ctx.state, target, ctx.defs)?.noEffects));
  },
  /** "If your opponent's Active Pokémon has exactly 6 damage counters on it (6 or more: `atLeast`), that Pokémon is Knocked Out." */
  knockOutIf(ctx, { k, atLeast = false }) {
    const slot = ctx.state.players[other(ctx.player)].active;
    if (!slot || ctx.shielded) return;
    if (atLeast ? slot.damage >= k * 10 : slot.damage === k * 10) OPS.knockOut(ctx);
  },
  /** "Take a Prize card": the top one goes to the hand; the last one wins the game. */
  takePrize(ctx, { n = 1 }) {
    const { state, player, events } = ctx;
    const side = state.players[player];
    const prizes = side.prizes.splice(0, n);
    if (!prizes.length) return;
    side.hand.push(...prizes);
    events.push({ t: "prize", p: player, uids: prizes });
    if (!side.prizes.length) win(state, player, "prizes", events);
  },
  /**
   * "Move an Energy from your opponent's Active Pokémon to 1 of their Benched Pokémon" (`to` "bench"), "... attached to
   * the Defending Pokémon to another of your opponent's Pokémon" (the same: it is the only other place). The attacker
   * chooses the card, when they differ, and where it goes.
   */
  moveFoeEnergy(ctx) {
    const { state, player, defs } = ctx;
    const foe = other(player);
    const side = state.players[foe];
    const slot = side.active;
    if (!slot || ctx.shielded || !slot.energy.length || !side.bench.length) return;
    const spots = side.bench.map((_, i) => i).filter((i) => !warded(state, side.bench[i], { player, src: "attack" }, defs));
    if (!spots.length) return;
    if (energyAlike(state, slot.energy, defs)) return askPick(state, { player, side: foe, spots, left: 1, effect: { op: "moveEnergyCards", from: ACTIVE, uids: [slot.energy[slot.energy.length - 1]] } });
    askChoose(state, { player, owner: foe, zone: "play", what: "energy", uids: slot.energy.slice(), min: 1, max: 1, effect: { op: "carryEnergy", from: ACTIVE, spots } });
  },
  /** "Shuffle all Energy from each of your opponent's Pokémon into their deck." */
  foeEnergyToDeck(ctx) {
    const { state, player, defs, events } = ctx;
    const foe = other(player);
    const side = state.players[foe];
    let moved = false;
    for (const [slot, spot] of inPlay(state, foe)) {
      if (!slot.energy.length || (spot === ACTIVE && ctx.shielded) || warded(state, slot, { player, src: "attack" }, defs)) continue;
      const gone = slot.energy.splice(0);
      side.deck.push(...gone);
      events.push({ t: "energy-to-deck", p: foe, spot, uids: gone });
      moved = true;
    }
    if (moved) shuffle(state, side.deck);
  },
  /** "Put 1 of your opponent's Benched Pokémon and all cards attached to them into your opponent's hand": the attacker picks. */
  bounceFoe(ctx, { n = 1 }) {
    const { state, player, defs } = ctx;
    const foe = other(player);
    const spots = state.players[foe].bench.map((s, i) => [s, i]).filter(([s]) => !warded(state, s, { player, src: "attack" }, defs)).map(([, i]) => i);
    if (spots.length) askPick(state, { player, side: foe, spots, left: Math.min(n, spots.length), effect: { op: "bounce", keep: "all" } });
  },
  /** "Shuffle your opponent's Active Pokémon and all cards attached to it into their deck." */
  shuffleFoeActive(ctx) {
    const { state, player, defs, events } = ctx;
    const foe = other(player);
    const side = state.players[foe];
    const slot = side.active;
    if (!slot || ctx.shielded || warded(state, slot, { player, src: "attack" }, defs)) return;
    side.deck.push(slot.uid, ...slot.under, ...slot.energy, ...(slot.tool ? [slot.tool] : []), ...heldOn(slot));
    if (slot.tool) toolGone(state, foe, slot.tool, defs);
    shuffle(state, side.deck);
    side.active = null;
    events.push({ t: "shuffle-in", p: foe, spot: ACTIVE, uid: slot.uid });
  },
  /** "Put 3 damage counters on 1 of your Pokémon": the attacker's player picks which (any, the attacker too). */
  countersOwn(ctx, { n }) {
    const { state, player } = ctx;
    const spots = inPlay(state, player).map(([, spot]) => spot);
    if (spots.length === 1) {
      const slot = slotAt(state, player, spots[0]);
      slot.damage += n;
      return void ctx.events.push({ t: "damage", p: player, spot: spots[0], n });
    }
    askPick(state, { player, side: player, spots, left: 1, effect: { op: "damage", n } });
  },
  /** "Move all damage counters from 1 of your Benched Pokémon to your opponent's Active Pokémon." */
  benchCountersToFoe(ctx) {
    const { state, player, defs } = ctx;
    const target = state.players[other(player)].active;
    if (!target || ctx.shielded || warded(state, target, { player, src: "attack" }, defs)) return;
    const spots = state.players[player].bench.map((s, i) => [s, i]).filter(([s]) => s.damage > 0).map(([, i]) => i);
    if (spots.length) askPick(state, { player, side: player, spots, left: 1, effect: { op: "moveCountersFrom", n: 9990, to: "foe", only: ACTIVE, src: "attack" } });
  },
  /**
   * "Put up to 3 damage counters on this Pokémon. This attack does 50 damage for each damage counter you placed in this way":
   * how many is the attacker's choice, before the damage (the rest of the attack rides on each answer, as OPS.ask's does).
   */
  hurtFor(ctx, { max, n }, rest = []) {
    const go = (k) => [{ op: "fx", steps: [...(k ? [{ op: "selfDamage", n: k * 10 }] : []), { op: "setDamage", n: k * n }, ...rest], uid: ctx.slot.uid, hit: ctx.hit, atk: ctx.atk }];
    const ks = Array.from({ length: max + 1 }, (_, k) => k);
    ctx.state.pending.push({ type: "option", player: ctx.player, why: "before", prompt: `How many damage counters do you put on this Pokémon? This attack does ${n} damage for each.`, labels: ks.map(String), options: ks.map(go) });
    ctx.detached = true;
  },
  /** "Does damage to the Defending Pokémon equal to half the Defending Pokémon's remaining HP (rounded up to the nearest 10)." */
  halfHp(ctx) {
    const target = ctx.state.players[other(ctx.player)].active;
    ctx.hit.damage = target ? Math.ceil(hpLeft(ctx.state, target, ctx.defs) / 20) * 10 : 0;
  },
  /** "For each of your opponent's Pokémon, flip a coin. If heads, this attack does 30 damage to that Pokémon." */
  flipEachFoe(ctx, { n }) {
    const side = sideOf(ctx);
    const spots = [...(side.active ? [ACTIVE] : []), ...side.bench.map((_, i) => i)];
    if (!spots.length) return;
    const results = flips(ctx, spots.length);
    const only = spots.filter((_, i) => results[i]);
    if (only.length) OPS.spread(ctx, { n, to: "any", only });
  },
  /** "Flip 3 coins. This attack does 10 damage times the number of heads to each of your opponent's Pokémon." */
  flipSpread(ctx, { coins, n }) {
    const heads = flips(ctx, coins).filter(Boolean).length;
    if (heads) OPS.spread(ctx, { n: n * heads, to: "any" });
  },
  /** "Before doing damage, discard all Trainer cards attached to the Defending Pokémon": its Tool, and old Trainers held on it. */
  dropFoeTrainers(ctx) {
    const { state, player, defs, events } = ctx;
    const foe = other(player);
    const slot = state.players[foe].active;
    if (!slot || warded(state, slot, { player, src: "attack" }, defs)) return;
    OPS.dropFoeTool(ctx);
    const held = heldOn(slot);
    if (!held.length) return;
    delete slot.held;
    state.players[foe].discard.push(...held);
    for (const uid of held) events.push({ t: "discard-tool", p: foe, spot: ACTIVE, uid });
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
  let m2;
  const energy = p.match(new RegExp(`^(?:${TYPE} )?Energy( cards?)? attached to (this Pokémon|${OPP}|both Active Pokémon|this Pokémon and ${OPP}|all of your opponent's Pokémon|all of your Pokémon)$`));
  if (energy) {
    const [, type = "", card, on] = energy;
    const per = { "this Pokémon": "selfEnergy", [OPP]: "foeEnergy", "both Active Pokémon": "bothEnergy", [`this Pokémon and ${OPP}`]: "bothEnergy", "all of your opponent's Pokémon": "foeAllEnergy", "all of your Pokémon": "ownAllEnergy" }[on];
    if (card) return per === "selfEnergy" || per === "foeEnergy" ? { per: `${per}Cards`, type } : null;
    return { per, type };
  }
  const named = p.match(/^(Pokémon in your discard pile|(?:of )?your Pokémon(?: in play)?|(?:of )?your Benched Pokémon) that (?:has|have) the (.+) attack$/);
  if (named) return { per: /discard/.test(named[1]) ? "discardAttack" : /Benched/.test(named[1]) ? "benchAttack" : "ownAttack", type: named[2] };
  if (/^(?:of )?your Ultra Beasts in play$/.test(p)) return { per: "ownTag", type: "Ultra Beast" };
  if (/^different type of Pokémon on your Bench$/.test(p)) return { per: "benchTypes", type: "" };
  if (/^(?:of )?your remaining Prize cards$/.test(p)) return { per: "ownPrizesLeft", type: "" };
  if (/^type of basic Energy card in your discard pile$/.test(p)) return { per: "discardEnergyTypes", type: "" };
  if ((m2 = p.match(new RegExp(`^(?:of )?your ${TYPE} Pokémon in play$`)))) return { per: "ownType", type: m2[1] };
  if (/^Energy attached to all Pokémon$/.test(p)) return { per: "allEnergy", type: "" };
  if (/^(?:of )?your Benched Pokémon that has any damage counters on it$/.test(p)) return { per: "benchDamaged", type: "" };
  if (/^(?:of )?your opponent's Pokémon in play that has an Ability$/.test(p)) return { per: "foeAbility", type: "" };
  if ((m2 = p.match(/^(?:of )?your opponent's (Pokémon-GX and Pokémon-EX|Pokémon V|Pokémon ex) in play$/))) return { per: "foeBoxes", type: BOXES[m2[1]].join(",") };
  if ((m2 = p.match(/^([A-Z][\w.'-]*(?: [A-Z][\w.'-]*)?) you have in play$/))) return { per: "ownNamed", type: m2[1] };
  if ((m2 = p.match(/^(.+?) cards? in (your|your opponent's) discard pile$/))) {
    const what = /^[A-Z][a-z]+$/.test(m2[1]) && !/^(Trainer|Supporter|Item|Energy|Pokémon|Stadium)$/.test(m2[1]) ? (m2[1] === "Ancient" || m2[1] === "Future" ? `+${m2[1]}` : `trainer~${m2[1]}`) : whatOf(`${m2[1]} card`);
    if (what) return { per: m2[2] === "your" ? "discardKind" : "foeDiscardKind", type: what };
  }
  if (/^Pokémon in your discard pile$/.test(p)) return { per: "discardKind", type: "pokemon" };
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

const BOXES = { "Pokémon ex": ["ex"], "Pokémon-ex": ["ex"], "Pokémon-EX": ["EX"], "Pokémon-GX": ["GX"], "Pokémon GX": ["GX"], "Pokémon V": ["V", "VMAX", "VSTAR"], "Pokémon VMAX": ["VMAX"], "Pokémon VSTAR": ["VSTAR"], "Pokémon ex or Pokémon V": ["ex", "V", "VMAX", "VSTAR"], "Pokémon-GX or Pokémon-EX": ["GX", "EX"], "Pokémon-GX or a Pokémon-EX": ["GX", "EX"], "Pokémon-GX and Pokémon-EX": ["GX", "EX"] };
/** Kinds a card prints that aren't a rule box ("an Ultra Beast"): the tag cards.js keeps for them. */
const TAGGED = { "an Ultra Beast": "Ultra Beast", "a Pokémon SP": "SP", "a Pokémon LV.X": "Level-Up" };

/** "If <phrase>, this attack does more damage": { test, ...args } from TESTS, or null. */
function testOf(phrase) {
  const p = phrase.replace(/the Defending Pokémon/g, OPP);
  let m;
  if (new RegExp(`^${OPP} (?:already )?has any damage counters on it$`).test(p)) return { test: "foeDamaged" };
  if ((m = p.match(new RegExp(`^${OPP} (?:already )?has at least (\\d+) damage counters? on it$`)))) return { test: "foeCountersAtLeast", k: Number(m[1]) };
  if (/^this Pokémon has any damage counters on it$/.test(p)) return { test: "selfDamaged" };
  if ((m = p.match(new RegExp(`^${OPP} is an? (Evolution|Evolved|Basic) Pokémon$`)))) return { test: "foeStage", stage: m[1] === "Basic" ? "basic" : "evolution" };
  if ((m = p.match(new RegExp(`^${OPP} is (?:an? )?(.+)$`))) && BOXES[m[1]]) return { test: "foeBox", boxes: BOXES[m[1]] };
  if ((m = p.match(new RegExp(`^${OPP} (is|isn't|is not) (an Ultra Beast|a Pokémon SP|a Pokémon LV\\.X)$`)))) return { test: "foeTag", tag: TAGGED[m[2]], ...(m[1] === "is" ? {} : { not: true }) };
  if ((m = p.match(new RegExp(`^${OPP} (?:isn't|is not) (?:an? )?(.+)$`))) && BOXES[m[1]]) return { test: "foeBox", boxes: BOXES[m[1]], not: true };
  if (/^your opponent has (?:any|an) Ultra Beasts? in play$/.test(p)) return { test: "foeHasTag", tag: "Ultra Beast" };
  if (/^this Pokémon was on the Bench and became your Active Pokémon this turn$/.test(p)) return { test: "movedUp" };
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
  if ((m = p.match(new RegExp(`^this Pokémon is ${COND} or ${COND}$`)))) return { test: "selfStatusOf", kinds: [m[1].toLowerCase(), m[2].toLowerCase()] };
  if (/^you have more Prize cards left than your opponent$/.test(p)) return { test: "behind" };
  if ((m = p.match(new RegExp(`^${OPP} is a Stage (1|2)(?: Evolved)? Pokémon$`)))) return { test: "foeLine", line: Number(m[1]) };
  if ((m = p.match(new RegExp(`^you have at least (\\d+) ${TYPE} Energy in play$`)))) return { test: "ownEnergyAtLeast", k: Number(m[1]), type: m[2] };
  if ((m = p.match(new RegExp(`^${OPP} has ${TYPE} Resistance$`)))) return { test: "foeResistType", type: m[1] };
  if (/^this Pokémon didn't move from the Bench to the Active Spot this turn$/.test(p)) return { test: "movedUp", not: true };
  if (/^your opponent has no Benched Pokémon$/.test(p)) return { test: "foeBenchEmpty" };
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
  [/^This attack does (\d+) more damage for each (.+?)\. You can't add more than (\d+) damage in this way\.$/, (m) => perCount("more", m[1], m[2], { cap: Number(m[3]) })],
  [/^(?:This attack does|Does) \d+ damage minus (\d+) damage for each (.+)\.$/, (m) => perCount("less", m[1], m[2])],
  [new RegExp(`^Does \\d+ damage plus (\\d+) more damage for each (?:${TYPE} )?Energy attached to this Pokémon but not used to pay for this attack's Energy cost\\. You can't add more than (\\d+) damage in this way\\.$`), (m) => [{ op: "bonusPer", when: "before", n: Number(m[1]), per: "spareEnergy", ...(m[2] ? { type: m[2] } : {}), cap: Number(m[3]) }]],
  [new RegExp(`^Does \\d+ damage plus (\\d+) more damage for each ${TYPE} Energy attached to this Pokémon but not used to pay for this attack's Energy cost\\. Extra ${TYPE} Energy after the (\\d+)(?:st|nd|rd|th) doesn't count\\.$`), (m) => m[2] === m[3] && [{ op: "bonusPer", when: "before", n: Number(m[1]), per: "spareEnergy", type: m[2], cap: Number(m[1]) * Number(m[4]) }]],
  [/^If (.+?), this attack does (\d+) more damage(?: \(before applying Weakness and Resistance\))?\.$/, (m) => ifMore(m[1], m[2])],
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
  // Energy off any of their Pokémon, Energy of this one spread over the Bench.
  [new RegExp(`^Discard ${N} Energy(?: cards?)? (?:from|attached to) your opponent's Pokémon\\.$`, "i"), (m) => [{ op: "discardFoeAny", when: "after", n: count(m[1]) }]],
  [/^Discard an Energy(?: card)? (?:from|attached to) each of your opponent's Pokémon\.$/, () => [{ op: "discardFoeAny", when: "after", each: true }]],
  [/^Move all Energy(?: cards)? (?:from|attached to) this Pokémon to your Benched Pokémon in any way you like\.$/, () => [{ op: "spreadOwnEnergy", when: "after" }]],
  [new RegExp(`^Move (?:any number of|as many) (basic )?(?:${TYPE} )?Energy(?: cards)? (?:from|attached to) your Pokémon to your other Pokémon in any way you like\\.$`, "i"), (m) => [{ op: "rearrangeEnergy", when: "after", ...(m[1] ? { basic: true } : {}), ...(m[2] ? { type: m[2] } : {}) }]],
  [new RegExp(`^Move any (?:number|amount) of (?:${TYPE} )?Energy(?: cards)? from your Benched Pokémon to this Pokémon\\.$`), (m) => fromDeck([{ op: "gather", ...(m[1] ? { type: m[1] } : {}) }])],
  [/^Heal (\d+|all) damage from (\d+) of your Benched Pokémon\.$/, (m) => Number(m[2]) > 1 && fromDeck([{ op: "healOne", n: m[1] === "all" ? 9990 : Number(m[1]), where: "bench", count: Number(m[2]) }])],
  // Healing barred, damage counters later or by a count, swapped.
  [new RegExp(`^(?:${FOE} can't be healed during your opponent's next turn|During your opponent's next turn, ${FOE} can't be healed)\\.$`, "i"), () => [mark("noHeal", { on: "foe" })]],
  [new RegExp(`^At the end of your opponent's next turn, put (\\d+) damage counters? on ${FOE}\\.$`), (m) => [mark("doom", { on: "foe", n: Number(m[1]) * 10 })]],
  [new RegExp(`^Count the number of cards in your opponent's hand\\. Put that many damage counters on ${FOE}\\.$`), () => [{ op: "countersPer", when: "after", per: "foeHand" }]],
  [new RegExp(`^Switch all damage counters on this Pokémon with those on ${FOE}\\.$`), () => [{ op: "swapCounters", when: "after" }]],
  [/^Knock Out 1 of your opponent's (Basic )?Pokémon that isn't a (Pokémon-GX|Pokémon-EX|Pokémon V)\.$/, (m) => [{ op: "knockOutOne", when: "after", ...(m[1] ? { stage: "basic" } : {}), notBoxes: BOXES[m[2]] || [m[2].replace(/^Pokémon-?/, "")] }]],
  // When it may be used.
  [/^If you go first, you can use this attack (?:on|during) your first turn\.$/, () => [{ op: "firstTurn", when: "before" }]],
  [/^If you go second, you can't use this attack during your first turn\.$/, () => [{ op: "notSecondFirst", when: "before" }]],
  // Healing: all of it, every Pokémon, both sides.
  [/^Remove all damage counters from this Pokémon\.$/, () => [{ op: "healSelf", when: "after", n: 9990 }]],
  [/^Remove all Special Conditions from this Pokémon\.$/, () => fromDeck([{ op: "cure", to: "self" }])],
  [/^Heal all damage from (?:all|each) of your Pokémon\.$/, () => [{ op: "healEvery", when: "after", n: 9990 }]],
  [/^Heal (\d+) damage from each Pokémon \(both yours and your opponent's\)\.$/, (m) => [{ op: "healEvery", when: "after", n: Number(m[1]), foe: true }]],
  [new RegExp(`^Discard ${N} (?:${TYPE} )?Energy(?: card)? (?:from|attached to) this Pokémon and heal all damage from it\\.$`, "i"), (m) => [{ op: "discardEnergy", when: "after", n: count(m[1]), type: m[2] || "" }, { op: "healSelf", when: "after", n: 9990 }]],
  [/^(?:After your attack, )?[Rr]emove from this Pokémon the number of damage counters equal to the damage you did to the Defending Pokémon\.(?: If this Pokémon has fewer damage counters than that, remove all of them\.)?$/, () => [{ op: "healDealt", when: "after" }]],
  [/^Remove a number of damage counters from this Pokémon equal to half the damage done to the Defending Pokémon \(after applying Weakness and Resistance\) \(rounded up to the nearest 10\)\. If this Pokémon has fewer damage counters than that, remove all of them\.$/, () => [{ op: "healDealt", when: "after", half: true }]],
  // A draw with more to it.
  [new RegExp(`^Draw ${N} cards?\\. If you do, (.+)$`, "i"), (m) => {
    const steps = afterOnly(upper(m[2]));
    return steps && [{ op: "drawIf", when: "after", n: count(m[1]), steps }];
  }],
  // Switching, in more wordings.
  [new RegExp(`^(?:Switch ${N} of your opponent's Benched Pokémon with (?:their|his or her|your opponent's) Active Pokémon|Switch in ${N} of your opponent's Benched Pokémon to the Active Spot)\\. The new Active Pokémon is now ${COND}\\.$`, "i"), (m) => [{ op: "newActive", when: "after", steps: [cond(m[3])] }]],
  [new RegExp(`^If your opponent has any Benched Pokémon, (?:he or she|they) chooses? ${N} of them and switch(?:es)? (?:it with (?:the Defending Pokémon|(?:his or her|their) Active Pokémon)|the Defending Pokémon with it)\\.$`, "i"), () => [{ op: "switchFoe", when: "after" }]],
  [new RegExp(`^Flip a coin\\. If heads and if your opponent has any Benched Pokémon, he (?:or|of) she chooses ${N} of them and switches it with the Defending Pokémon\\.$`, "i"), () => [{ op: "flip", when: "after", heads: [{ op: "switchFoe" }] }]],
  [new RegExp(`^If your opponent has any Benched Pokémon, (?:he or she|they) chooses ${N} of them and switches it with (?:his or her|their) Active Pokémon, then, if you have any Benched Pokémon, you switch ${N} of them with your Active Pokémon\\.$`, "i"), () => [{ op: "switchFoe", when: "after" }, { op: "switchSelf", when: "after" }]],
  [new RegExp(`^If your opponent has any Benched Pokémon, choose ${N} of them and switch it with (?:the Defending Pokémon|(?:his or her|their) Active Pokémon)\\.$`, "i"), () => fromDeck([{ op: "gust" }])],
  [new RegExp(`^Switch this Pokémon with ${N} of your Benched ${TYPE} Pokémon\\.$`, "i"), (m) => [{ op: "switchSelf", when: "after", type: m[2] }]],
  [new RegExp(`^Switch this Pokémon with ${N} of your Benched Pokémon\\. If you do, (?:switch out your opponent's Active Pokémon to the Bench\\. \\(Your opponent chooses the new Active Pokémon\\.\\)|your opponent switches (?:his or her|their) Active Pokémon with ${N} of (?:his or her|their) Benched Pokémon\\.)$`, "i"), () => [{ op: "switchSelf", when: "after", then: [{ op: "switchFoe" }] }]],
  // Cards on the Defending Pokémon gone before the damage.
  [new RegExp(`^Before doing damage, discard all Trainer cards attached to ${FOE}(?: \\(before they affect the damage\\.?\\))?\\.$`), () => [{ op: "dropFoeTrainers", when: "before" }]],
  [new RegExp(`^Before doing damage, discard a Special Energy(?: card)? (?:from|attached to) ${FOE}\\.$`), () => [{ op: "discardFoeSpecial", when: "before" }]],
  // Damage to some of their Pokémon by a count, or past everything on them.
  [new RegExp(`^This attack does (\\d+) damage to ${N} of your opponent's (Benched )?Pokémon for each (.+?)\\.${NO_TYPING_NOTE}$`, "i"), (m) => {
    const c = countOf(m[4]);
    return c && [{ op: "spread", when: "after", n: Number(m[1]), to: m[3] ? "bench" : "any", count: count(m[2]), per: c.per, ...(c.type ? { type: c.type } : {}) }];
  }],
  [new RegExp(`^This attack does (\\d+) damage times the amount of (.+?) to ${N} of your opponent's (Benched )?Pokémon\\.${NO_TYPING_NOTE}$`, "i"), (m) => {
    const c = countOf(m[2]);
    return c && [{ op: "spread", when: "after", n: Number(m[1]), to: m[4] ? "bench" : "any", count: count(m[3]), per: c.per, ...(c.type ? { type: c.type } : {}) }];
  }],
  [new RegExp(`^Choose ${N} of your opponent's (Benched )?Pokémon\\. This attack does (\\d+) damage times the amount of (.+?)\\.${NO_TYPING_NOTE}$`, "i"), (m) => {
    const c = countOf(m[4]);
    return c && [{ op: "spread", when: "after", n: Number(m[3]), to: m[2] ? "bench" : "any", count: count(m[1]), per: c.per, ...(c.type ? { type: c.type } : {}) }];
  }],
  [new RegExp(`^(?:This attack does|Does) (\\d+) damage to ${N} of your opponent's Pokémon\\. (?:This attack's damage isn't affected by Weakness or Resistance, or by any effects on (?:that|those) Pokémon|(?:This|This attack's) damage isn't affected by Weakness, Resistance, or any other effects on (?:that|those) Pokémon)\\.$`, "i"), (m) => [{ op: "spread", when: "after", n: Number(m[1]), to: "any", count: count(m[2]), noTyping: true, pierce: true }]],
  [new RegExp(`^This attack does (\\d+) damage to ${N} of your opponent's Pokémon\\. Also apply Weakness and Resistance for Benched Pokémon\\.$`, "i"), (m) => [{ op: "spread", when: "after", n: Number(m[1]), to: "any", count: count(m[2]), typed: true }]],
  [/^This attack does (\d+) damage to each of your opponent's Benched Basic Pokémon\.(?: \(Don't apply Weakness and Resistance for Benched Pokémon\.\))?$/, (m) => [{ op: "spread", when: "after", n: Number(m[1]), to: "bench", stage: "basic" }]],
  [/^This attack does (\d+) damage to each of your opponent's (Pokémon V|Pokémon-GX and Pokémon-EX)\. This damage isn't affected by Weakness or Resistance\.$/, (m) => [{ op: "spread", when: "after", n: Number(m[1]), to: "any", boxes: BOXES[m[2]], noTyping: true }]],
  [new RegExp(`^This attack also does (\\d+) damage to ${N} of your opponent's Benched (Pokémon V|Pokémon-GX or Pokémon-EX)\\.${NO_TYPING_NOTE}$`, "i"), (m) => [{ op: "spread", when: "after", n: Number(m[1]), to: "bench", count: count(m[2]), boxes: BOXES[m[3]] }]],
  [new RegExp(`^For each of your opponent's Pokémon, flip a coin\\. If heads, this attack does (\\d+) damage to that Pokémon\\.${NO_TYPING_NOTE}$`), (m) => [{ op: "flipEachFoe", when: "after", n: Number(m[1]) }]],
  [new RegExp(`^Flip ${N} coins\\. This attack does (\\d+) damage times the number of heads to each of your opponent's Pokémon\\.${NO_TYPING_NOTE}$`, "i"), (m) => [{ op: "flipSpread", when: "after", coins: count(m[1]), n: Number(m[2]) }]],
  [new RegExp(`^(Discard ${N} (?:${TYPE} )?Energy(?: cards?)? from this Pokémon), and (this attack does \\d+ damage to .+)$`, "i"), (m) => {
    const first = afterOnly(`${m[1]}.`);
    const then = first && afterOnly(upper(m[4]));
    return then && [...first, ...then];
  }],
  // Energy attached from the hand or the discard pile, in any way you like.
  [new RegExp(`^(You may )?[Aa]ttach (any number of|up to ${N}|${N}) (.+?) from your (hand|discard pile) to your (Benched )?Pokémon in any way you like\\.$`), (m) => {
    const what = whatOf(m[5]);
    if (!/^(basicEnergy|energy)(:\w+)?$/.test(what)) return null;
    const upTo = Boolean(m[1]) || !m[4];
    return fromDeck([{ op: "attachPick", zone: m[6] === "hand" ? "hand" : "discard", what, to: m[7] ? "bench" : "any", n: /^any/.test(m[2]) ? 99 : count(m[3] || m[4]), spread: true, ...(upTo ? { upTo: true } : { exact: true }) }]);
  }],
  [new RegExp(`^(?:Attach (an?) (.+?) from your (hand|discard pile)|Search your (discard pile) for (an?) (.+?) and attach it) to ${N} of your (Benched )?Pokémon\\.$`), (m) => {
    const what = whatOf(m[2] || m[6]);
    if (!/^(basicEnergy|energy)(:\w+)?$/.test(what) || count(m[7]) !== 1) return null;
    return fromDeck([{ op: "attachPick", zone: (m[3] || m[4]) === "hand" ? "hand" : "discard", what, to: m[8] ? "bench" : "any", n: 1 }]);
  }],
  [new RegExp(`^Search your deck for (up to ${N}|${N}) (.+?) and attach them to your (Pokémon V|Pokémon-GX|Pokémon ex) in any way you like\\. ${SHUFFLED}$`, "i"), (m) => {
    const what = whatOf(m[4]);
    return /^(basicEnergy|energy)(:\w+)?$/.test(what) && fromDeck([{ op: "fetchEnergy", what, n: count(m[2] || m[3]), to: "spread", where: { to: "any", boxes: BOXES[m[5]] } }]);
  }],
  // Knock Outs by a count of damage counters, or outright with a price.
  [new RegExp(`^If ${OPP} has (exactly )?(\\d+)( or more)? damage counters on it, that Pokémon is Knocked Out\\.$`), (m) => (Boolean(m[1]) !== Boolean(m[3]) ? [{ op: "knockOutIf", when: "after", k: Number(m[2]), ...(m[3] ? { atLeast: true } : {}) }] : null)],
  [new RegExp(`^Knock Out ${OPP}\\. If ${OPP} is Knocked Out in this way, this Pokémon does (\\d+) damage to itself\\.$`), (m) => [{ op: "knockOutRecoil", when: "after", n: Number(m[1]) }]],
  [/^At the end of your opponent's next turn, the Defending Pokémon will be Knocked Out\.$/, () => [mark("doomKo", { on: "foe" })]],
  // Damage counters: on its own side, moved over, as many as it likes.
  [/^Put (\d+) damage counters? on (?:1|one) of your Pokémon\.$/, (m) => [{ op: "countersOwn", when: "after", n: Number(m[1]) * 10 }]],
  [new RegExp(`^Move all damage counters from (?:1|one) of your Benched Pokémon to ${OPP}\\.$`), () => [{ op: "benchCountersToFoe", when: "after" }]],
  [/^Put up to (\d+) damage counters on this Pokémon\. This attack does (\d+) damage for each damage counter you placed in this way\.$/, (m) => [{ op: "hurtFor", when: "before", max: Number(m[1]), n: Number(m[2]) }]],
  [new RegExp(`^(?:Put|Place) (\\d+) damage counters? on ${OPP} for each (.+)\\.$`), (m) => {
    const c = countOf(m[2]);
    return c && [{ op: "countersPer", when: "after", per: c.per, ...(c.type ? { type: c.type } : {}), k: Number(m[1]) }];
  }],
  [/^For each (.+?), put (\d+) damage counters? on (?:their|your opponent's) Active Pokémon\.$/, (m) => {
    const c = countOf(m[1]);
    return c && [{ op: "countersPer", when: "after", per: c.per, ...(c.type ? { type: c.type } : {}), k: Number(m[2]) }];
  }],
  // Damage worked out another way.
  [/^Does damage to the Defending Pokémon equal to half the Defending Pokémon's remaining HP \(rounded up to the nearest 10\)\.$/, () => [{ op: "halfHp", when: "before" }]],
  [/^Flip a number of coins equal to the number of (.+?)\. This attack does (\d+) damage times the number of heads\.$/, (m) => {
    const c = countOf(m[1]);
    return c && [{ op: "flipTimes", when: "before", n: Number(m[2]), per: c.per, ...(c.type ? { type: c.type } : {}) }];
  }],
  [/^Flip a coin\. If heads, this attack does (\d+) damage times the number of (.+?)\.$/, (m) => {
    const c = countOf(m[2]);
    return c && [{ op: "flip", when: "before", heads: [{ op: "bonusPer", how: "times", n: Number(m[1]), per: c.per, ...(c.type ? { type: c.type } : {}) }], tails: [{ op: "setDamage", n: 0 }] }];
  }],
  [/^Discard the top (\d+) cards (?:from|of) your deck\. This attack does (\d+) damage times the number of (.+?) you discarded\.$/, (m) => {
    const per = paidKind(m[3]);
    return per != null && [{ op: "pay", when: "before", from: "deck", n: Number(m[1]) }, { op: "bonusPer", when: "before", how: "times", n: Number(m[2]), per: "paid", ...(per ? { type: per } : {}) }];
  }],
  // Protection from some attackers; more Prize cards for some.
  [/^(?:During your opponent's next turn, prevent all damage done to this Pokémon by attacks from (.+?)|Prevent all damage done to this Pokémon by attacks from (.+?) during your opponent's next turn)\.$/, (m) => {
    const boxes = BOXES[m[1] || m[2]];
    return boxes && [mark("guard", { from: `box:${boxes.join(",")}` })];
  }],
  [new RegExp(`^If your opponent's (Pokémon-GX or Pokémon-EX|Pokémon V|Pokémon ex) is Knocked Out by damage from this attack, take ${N} more Prize cards?\\.$`, "i"), (m) => [{ op: "bounty", when: "before", n: count(m[2]), boxes: BOXES[m[1]] }]],
  [/^(?:Take a Prize card|Discard all Energy from this Pokémon, and take a Prize card)\.$/, (m) => [...(/Energy/.test(m[0]) ? [{ op: "discardEnergy", when: "after", n: 99 }] : []), { op: "takePrize", when: "after" }]],
  // Their Pokémon and Energy sent away.
  [/^(?:Shuffle all Energy from each of your opponent's Pokémon into their deck|Your opponent shuffles all Energy from all of their Pokémon into their deck)\.$/, () => [{ op: "foeEnergyToDeck", when: "after" }]],
  [new RegExp(`^Put ${N} of your opponent's Benched Pokémon and all cards attached to (?:it|them) into your opponent's hand\\.$`, "i"), (m) => [{ op: "bounceFoe", when: "after", n: count(m[1]) }]],
  [/^Shuffle your opponent's Active Pokémon and all cards attached to it into their deck\.$/, () => [{ op: "shuffleFoeActive", when: "after" }]],
  [new RegExp(`^(?:You may )?[Mm]ove an Energy(?: card)? (?:from|attached to) ${FOE} to (?:1 of (?:their|his or her|your opponent's) Benched Pokémon|another of your opponent's Pokémon)\\.$`), (m) => {
    const step = { op: "moveFoeEnergy", when: "after" };
    return /^You may/.test(m[0]) ? [{ op: "may", when: "after", steps: [step], prompt: "Move an Energy from their Active Pokémon to their Bench?" }] : [step];
  }],
  // Copying any of their attacks.
  [/^Choose 1 of your opponent's Pokémon's attacks and use it as this attack\.$/, () => [{ op: "copyAttack", when: "before", any: true }]],
  // Cards and zones.
  [new RegExp(`^Shuffle ${N} cards? from your discard pile into your deck\\.$`, "i"), (m) => fromDeck([{ op: "recycle", what: "any", n: count(m[1]) }])],
  [/^Put a card from your discard pile on top of your deck\.$/, () => fromDeck([{ op: "recover", what: "any", n: 1, to: "top" }])],
  [/^Search your discard pile for (an?) (.+?), show it to your opponent, and put it into your hand\.$/, (m) => {
    const what = whatOf(m[2]);
    return what && fromDeck([{ op: "recover", what, n: 1 }]);
  }],
  [new RegExp(`^Flip ${N} coins\\. Put a number of cards up to the number of heads from your discard pile into your hand\\.$`, "i"), (m) => [{ op: "flipRepeat", when: "after", coins: count(m[1]), steps: fromDeck([{ op: "recover", what: "any", n: 1, upTo: true }]) }]],
  [new RegExp(`^Search your deck for any number of (.+?) and put them onto your Bench\\. ${SHUFFLED}$`), (m) => {
    const what = whatOf(m[1]);
    return what && what.split("|").every((w) => /^basic(?=$|[:@!])/.test(w)) && fromDeck([{ op: "search", what, n: "all", to: "bench" }]);
  }],
  [new RegExp(`^Your opponent shuffles (?:their|his or her) hand into (?:their|his or her) deck and draws ${N} cards?\\.$`, "i"), (m) => fromDeck([{ op: "foeShuffle" }, { op: "foeDraw", n: count(m[1]) }])],
  [/^Your opponent reveals (?:their|his or her) hand\. Choose a card you find there and put it on the bottom of (?:their|his or her) deck\.$/, () => fromDeck([{ op: "foeHandBottom", n: 1 }])],
  [/^Move an Energy(?: card)? from (?:1|one) of your Benched Pokémon to this Pokémon\.$/, () => fromDeck([{ op: "moveEnergy", from: "bench", to: "self" }])],
  [new RegExp(`^Search your deck for a card that evolves from (?:1|one) of your Pokémon and put it onto that Pokémon to evolve it\\. ${SHUFFLED}$`), () => fromDeck([{ op: "evolveDeck" }])],
  [new RegExp(`^Search your deck for a card that evolves from this Pokémon and put it on this Pokémon\\. \\(This counts as evolving this Pokémon\\.\\) ${SHUFFLED}$`), () => fromDeck([{ op: "evolveDeck", where: "active" }])],
  // Either side of a coin, each an effect after the damage.
  [/^Flip a coin\. If heads, (.+?\.) If tails, (.+)$/, (m) => {
    const heads = afterOnly(upper(m[1]));
    const tails = heads && afterOnly(upper(m[2]));
    return tails && [{ op: "flip", when: "after", heads, tails }];
  }],
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
  // "Then, remove 2 damage counters from this Pokémon": the steps run in the order printed anyway.
  const then = clean.match(/^Then, (.+)$/);
  if (then) return compileOne(upper(then[1]));
  return asTrainer(clean);
}

/**
 * The steps of an attack's text, [] when it has none, null when it can't be read yet. Older cards name
 * themselves ("Charizard does 10 damage to itself") where newer ones say "this Pokémon": `name` reads them alike.
 */
export function compileAttack(text, name = "") {
  const plain = tidy(String(text || "").replace(/\s+/g, " ").replace(/’/g, "'").trim());
  const first = compileText(plain);
  if (first || !name || !plain.includes(name)) return first;
  // "Search your deck for up to 2 Nidoran♀ and put them onto your Bench": cards of its own name.
  const kin = plain.match(new RegExp(`^Search your deck for (?:(?:up to )?${N} )?${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} and put (?:it|them) onto your Bench\\. ${SHUFFLED}$`, "i"));
  if (kin) return fromDeck([{ op: "search", what: `name=${name}`, n: kin[1] ? count(kin[1]) : 1, to: "bench" }]);
  return compileText(plain.replace(new RegExp(`(?<![\\p{L}\\d])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\d])`, "gu"), "this Pokémon").replace(/(^|\. |\()this Pokémon/g, "$1This Pokémon"));
}

/**
 * Small differences in print that say the same thing: "Pokemon", "Weakness or Resistance for Benched Pokémon", the
 * reminder that the switch comes after the damage (an effect after the damage always does), "(after doing damage)".
 */
function tidy(text) {
  return text
    .replace(/\bPokemon\b/g, "Pokémon")
    .replace(/Don't apply Weakness or Resistance for Benched Pokémon/g, "Don't apply Weakness and Resistance for Benched Pokémon")
    .replace(/for Benched Pokémon\)\./g, "for Benched Pokémon.)")
    .replace(/ \(Do the damage before switching the Pokémon\.(?: Switch the Pokémon even if [^.)]+ is [Kk]nocked [Oo]ut\.)?\)/g, "")
    .replace(/ \(after doing damage\)\./g, ".")
    .replace(/^Flip a coin, If /, "Flip a coin. If ");
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
      const fitting = ctx.slot.energy.filter((uid) => (!step.type || (defOf(ctx.state, uid, ctx.defs).provides || []).some((u) => fitsType(u, step.type))) && (!step.basic || defOf(ctx.state, uid, ctx.defs).basic)).length;
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
    OPS[steps[i].op]?.(ctx, steps[i], steps.slice(i + 1));
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

