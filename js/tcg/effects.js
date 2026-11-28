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

import { ACTIVE, abilityOn, benchMax, caged, countersStay, keptInPlay, hitBack, typedDef, noteShed, shieldOn, sideHit, addCondition, addMark, askChoose, askPick, benchSafe, canPay, conditionsOn, damageAfterTyping, defOf, devolveSlot, energyAlike, energyToDeck, energyFits, energyMod, energyOf, flip, healMore, healRoom, heldOn, hpLeft, inPlay, markOn, maxHp, other, rand, retreatCost, shedEnergy, shuffle, slotAt, strike, struck, switchActive, toLost, takeTool, takeTools, toolGone, toolsIn, unpaid, warded, win } from "./engine.js";
import { T_OPS, compileTrainer, fits, runTrainer, trainerReady, whatOf } from "./trainers.js";

const WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
const count = (word) => WORDS[String(word).toLowerCase()] || Number(word) || 0;

/** Units of Energy that count as this type ("Any" and "Fire|Water" count for each they can be); all of them with no type. */
// `type` may list several ("Grass,Lightning": "each Grass Energy and each Lightning Energy"), each unit counted once.
const fitsType = (unit, type) => !type || type.split(",").some((t) => unit === t || unit === "Any" || unit.split("|").includes(t));
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

/** Energy of each of these types on the attacker at once that its attack's cost doesn't need (one unit for each type named). */
function spareAll(ctx, types) {
  const cost = ctx.attack?.cost || [];
  const pool = energyOf(ctx.state, ctx.slot, ctx.defs);
  const go = (left, rest) => {
    if (!left.length) return !unpaid(cost, rest);
    const [type, ...more] = left;
    return rest.some((unit, i) => fitsType(unit, type) && rest.indexOf(unit) === i && go(more, [...rest.slice(0, i), ...rest.slice(i + 1)]));
  };
  return go(types, pool);
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
  ownTools: (ctx) => slotsOf(sideOf(ctx, true)).reduce((n, s) => n + toolsIn(s).length, 0),
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
  // Pokémon of a kind (`type` as trainers.js fits reads it, monWhat): yours in play, on your Bench, theirs, theirs Benched, both sides'.
  ownKind: (ctx, what) => slotsOf(sideOf(ctx, true)).filter((s) => fits(defIn(ctx, s), what)).length,
  benchKind: (ctx, what) => sideOf(ctx, true).bench.filter((s) => fits(defIn(ctx, s), what)).length,
  foeKind: (ctx, what) => slotsOf(sideOf(ctx)).filter((s) => fits(defIn(ctx, s), what)).length,
  foeBenchKind: (ctx, what) => sideOf(ctx).bench.filter((s) => fits(defIn(ctx, s), what)).length,
  allKind: (ctx, what) => COUNTS.ownKind(ctx, what) + COUNTS.foeKind(ctx, what),
  // "excluding this Pokémon".
  allOthers: (ctx) => COUNTS.allKind(ctx, "pokemon") - 1,
  foeInPlay: (ctx) => slotsOf(sideOf(ctx)).length,
  // "for each Pokémon in play your opponent has more than you".
  foeMore: (ctx) => Math.max(0, slotsOf(sideOf(ctx)).length - slotsOf(sideOf(ctx, true)).length),
  bothPrizesTaken: (ctx) => COUNTS.foePrizesTaken(ctx) + COUNTS.ownPrizesTaken(ctx),
  // "for each damage counter on all of your opponent's Pokémon".
  foeAllCounters: (ctx) => slotsOf(sideOf(ctx)).reduce((n, s) => n + s.damage / 10, 0),
  // "damage counter on all of your Magikarp": `type` a kind (fits).
  ownCounters: (ctx, what) => slotsOf(sideOf(ctx, true)).filter((s) => fits(defIn(ctx, s), what)).reduce((n, s) => n + s.damage / 10, 0),
  selfConditions: (ctx) => conditionsOn(ctx.slot).length,
  // "for each of your Pokémon that has "Tauros" in its name that has any damage counters on it".
  ownDamagedKind: (ctx, what) => slotsOf(sideOf(ctx, true)).filter((s) => s.damage > 0 && fits(defIn(ctx, s), what)).length,
  // "for each Pokémon Tool attached to all Pokémon" (both sides).
  heads: (ctx) => ctx.hit.heads || 0,
  foeHandKind: (ctx, what) => sideOf(ctx).hand.filter((uid) => fits(defOf(ctx.state, uid, ctx.defs), what)).length,
  allTools: (ctx) => [...slotsOf(sideOf(ctx, true)), ...slotsOf(sideOf(ctx))].reduce((n, s) => n + toolsIn(s).length, 0),
  // "for each Lightning Energy attached to all of your Iono's Pokémon": `type` "Type|kind".
  kindEnergy: (ctx, key) => {
    const [type, what] = key.split("|");
    return slotsOf(sideOf(ctx, true)).filter((s) => fits(defIn(ctx, s), what)).reduce((n, s) => n + unitsOf(ctx, s, type), 0);
  },
  // Energy cards of a kind on Pokémon (`type` "on|kind[:Type]": on "self", "foe", "both", "own", "foes", "all"; kind "basic", "special").
  energyKind: (ctx, key) => {
    const [on, kind] = key.split("|");
    return slotsOn(ctx, on).reduce((n, s) => n + s.energy.filter((uid) => energyKindFits(defOf(ctx.state, uid, ctx.defs), kind)).length, 0);
  },
  // "for each type of basic Energy attached to this Pokémon": the types among them (`type` the "on" of energyKind).
  energyTypes: (ctx, on) => new Set(slotsOn(ctx, on).flatMap((s) => s.energy.map((uid) => defOf(ctx.state, uid, ctx.defs)).filter((d) => d?.kind === "energy" && d.basic).flatMap((d) => d.provides || []))).size,
  // "for each of your Benched Pokémon that has any Fire Energy attached".
  benchWith: (ctx, type) => sideOf(ctx, true).bench.filter((s) => unitsOf(ctx, s, type) > 0).length,
  // Cards in the Lost Zone: the attacker's own of a kind (fits), both players' of a kind; "except ◇ (Prism Star) Pokémon".
  lostKind: (ctx, what) => (sideOf(ctx, true).lost || []).filter((uid) => fits(defOf(ctx.state, uid, ctx.defs), what)).length,
  lostBoth: (ctx, what) => [...(sideOf(ctx, true).lost || []), ...(sideOf(ctx).lost || [])].filter((uid) => fits(defOf(ctx.state, uid, ctx.defs), what)).length,
  lostNoPrism: (ctx) => (sideOf(ctx, true).lost || []).filter((uid) => defOf(ctx.state, uid, ctx.defs)?.kind === "pokemon" && !defOf(ctx.state, uid, ctx.defs).prism).length,
  // "for each of your Pokémon that have any damage counters on them" counted again: ownDamaged. Energy cards in their hand: foeHandKind.
  foeHandKind: (ctx, what) => sideOf(ctx).hand.filter((uid) => fits(defOf(ctx.state, uid, ctx.defs), what)).length,
  // "for each Prize card your opponent took during their last turn" (engine.js keeps side.taken).
  foeTookLast: (ctx) => (sideOf(ctx).taken || []).filter((t) => t.turn === ctx.state.turn - 1).reduce((n, t) => n + t.n, 0),
};

/** The Pokémon an Energy count is about ("on" in COUNTS.energyKind). */
function slotsOn(ctx, on) {
  const mine = sideOf(ctx, true), theirs = sideOf(ctx);
  return { self: [ctx.slot], foe: [ctx.target], both: [ctx.slot, ctx.target], own: slotsOf(mine), foes: slotsOf(theirs), all: [...slotsOf(mine), ...slotsOf(theirs)] }[on].filter(Boolean);
}
/** An Energy card of this kind ("basic", "basic:Fire", "special", "energy:Fire"). */
function energyKindFits(def, kind) {
  if (def?.kind !== "energy") return false;
  // "Fusion Strike Energy": a card by name.
  if (kind.startsWith("name=")) return def.name === kind.slice(5);
  const [k, type] = kind.split(":");
  // "basic:Grass,Lightning": either type.
  return (k === "basic" ? def.basic : k === "special" ? !def.basic : true) && (!type || type.split(",").some((t) => (def.provides || []).includes(t)));
}

/** What "If ..., this attack does more damage" asks. */
const TESTS = {
  // "If the Pokémon using this attack has Fire and Lightning basic Energy cards attached to it": a basic Energy card of each.
  basicPair: (ctx, { types }) => types.every((t) => ctx.slot.energy.some((uid) => defOf(ctx.state, uid, ctx.defs).basic && defOf(ctx.state, uid, ctx.defs).provides.includes(t))),
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
  // `own`: "you have a Stadium in play"; `foe`: "your opponent has a Stadium in play".
  stadium: (ctx, { own, foe }) => Boolean(ctx.state.stadium) && (!own || ctx.state.stadium.owner === ctx.player) && (!foe || ctx.state.stadium.owner !== ctx.player),
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
  // Pokémon of a kind (fits, monWhat) in play: yours (`bench`: on your Bench), theirs.
  ownHasKind: (ctx, { what, bench = false }) => (bench ? sideOf(ctx, true).bench : slotsOf(sideOf(ctx, true))).some((s) => fits(defIn(ctx, s), what)),
  foeHasKind: (ctx, { what }) => slotsOf(sideOf(ctx)).some((s) => fits(defIn(ctx, s), what)),
  foeIs: (ctx, { what }) => Boolean(ctx.target) && fits(defIn(ctx, ctx.target), what),
  // Energy cards on a Pokémon: a kind ("special", "basic:Fire") or a card name ("Plasma Energy").
  energyCard: (ctx, { on = "self", kind = "", name = "" }) => (on === "self" ? ctx.slot : ctx.target)?.energy.some((uid) => {
    const def = defOf(ctx.state, uid, ctx.defs);
    // "Holon Energy" names a family: Holon Energy FF, GL, WP.
    return name ? def.name === name || def.name.startsWith(`${name} `) : energyKindFits(def, kind);
  }) || false,
  prizesAtMost: (ctx, { k, foe = false }) => sideOf(ctx, !foe).prizes.length <= k,
  gxUsed: (ctx) => Boolean(sideOf(ctx, true).gxUsed),
  foeAbilityOn: (ctx) => Boolean(ctx.target) && defIn(ctx, ctx.target).abilityKind === "Ability",
  fewerInPlay: (ctx) => slotsOf(sideOf(ctx, true)).length < slotsOf(sideOf(ctx)).length,
  // "If this Pokémon evolved (from Riolu) during this turn" (engine.js evolveSlot keeps `evolvedOn`).
  evolvedNow: (ctx, { from = "" }) => ctx.slot.evolvedOn === ctx.state.turn && (!from || defOf(ctx.state, ctx.slot.under[0], ctx.defs)?.name === from),
  // "If you played Cynthia from your hand during this turn" (engine.js keeps the names in `played`).
  played: (ctx, { what }) => (sideOf(ctx, true).played || []).some((uid) => fits(defOf(ctx.state, uid, ctx.defs), what)),
  discardAtLeast: (ctx, { k, what }) => sideOf(ctx, true).discard.filter((uid) => fits(defOf(ctx.state, uid, ctx.defs), what)).length >= k,
  foeNoRetreat: (ctx) => Boolean(ctx.target) && retreatCost(ctx.state, ctx.target, ctx.defs) === 0,
  foeHasSpecial: (ctx) => Boolean(ctx.target) && ctx.target.energy.some((uid) => !defOf(ctx.state, uid, ctx.defs).basic),
  ownBenchFull: (ctx) => sideOf(ctx, true).bench.length >= benchMax(ctx.state, ctx.player),
  bothPrizesAtMost: (ctx, { k }) => sideOf(ctx, true).prizes.length + sideOf(ctx).prizes.length <= k,
  prizesIn: (ctx, { ks, foe = false }) => ks.includes(sideOf(ctx, !foe).prizes.length),
  // When an attack may be used at all (OPS.onlyIf).
  secondFirst: (ctx) => ctx.state.turn === 2 && ctx.state.first !== ctx.player,
  lostAtLeast: (ctx, { k }) => (sideOf(ctx, true).lost || []).length >= k,
  prizeLead: (ctx, { k }) => sideOf(ctx, true).prizes.length - sideOf(ctx).prizes.length >= k,
  benchHasTypes: (ctx, { types }) => types.every((t) => sideOf(ctx, true).bench.some((s) => defIn(ctx, s).types.includes(t))),
  ownBenchEmpty: (ctx) => sideOf(ctx, true).bench.length === 0,
  // "If this Pokémon used Rollout during your last turn" (engine.js keeps `used` on the slot and the side).
  // "If 1 of your other Rapid Strike Pokémon used an attack during your last turn": not this Pokémon (nor what it evolved from).
  otherUsed: (ctx, { what }) => lastTurnAttacks(ctx).some((was) => !isThis(ctx, was.uid) && fits(defOf(ctx.state, was.uid, ctx.defs), what)),
  // "If this Pokémon used Lead during your last turn" (`who` empty), "if 1 of your Togedemaru used Toge Dash ...".
  usedLast: (ctx, { name, who = "" }) => lastTurnAttacks(ctx).some((was) => was.name === name && (who === "*" || (who ? was.who === who : isThis(ctx, was.uid)))),
  lostHas: (ctx, { what }) => (sideOf(ctx, true).lost || []).some((uid) => fits(defOf(ctx.state, uid, ctx.defs), what)),
  // After the damage: the Defending Pokémon has no HP left ("Unless this attack Knocks Out the Defending Pokémon").
  foeDown: (ctx) => Boolean(ctx.target) && hpLeft(ctx.state, ctx.target, ctx.defs) <= 0,
  // After the damage: it did some ("If this attack does any damage to the Defending Pokémon", "Unless all damage from this attack is prevented").
  dealt: (ctx) => (ctx.hit.dealt || 0) > 0,
  // After the damage: "If your opponent's Pokémon is Knocked Out by damage from this attack".
  foeKo: (ctx) => Boolean(ctx.target) && (ctx.hit.dealt || 0) > 0 && hpLeft(ctx.state, ctx.target, ctx.defs) <= 0,
  // "If you have less Prize cards left than your opponent".
  ahead: (ctx) => sideOf(ctx, true).prizes.length < sideOf(ctx).prizes.length,
  // "If a Stadium that has "Legendary" in its name is in play".
  stadiumNamed: (ctx, { word }) => Boolean(ctx.state.stadium) && defOf(ctx.state, ctx.state.stadium.uid, ctx.defs).name.includes(word),
  // "If your Benched Pokémon have any Shadowy Darkness Energy attached": a card by name on any of them.
  benchEnergyNamed: (ctx, { name }) => sideOf(ctx, true).bench.some((s) => s.energy.some((uid) => defOf(ctx.state, uid, ctx.defs).name === name)),
  // "If you have any Lightning Energy cards in your discard pile" (kind as fits reads it).
  discardHas: (ctx, { what }) => sideOf(ctx, true).discard.some((uid) => fits(defOf(ctx.state, uid, ctx.defs), what)),
  // "at least 1 extra Fire, Water, and Lightning Energy attached (in addition to this attack's cost)": one of each type spare at once.
  spareEach: (ctx, { types }) => spareAll(ctx, types),
  // "If this Pokémon has at least 2 Grass Energy attached to it".
  selfEnergyAtLeast: (ctx, { k, type = "" }) => unitsOf(ctx, ctx.slot, type) >= k,
  // "Discard a card from your hand. If you can't, this attack does nothing": k cards of a kind (trainers.js fits) in the hand.
  handHas: (ctx, { k = 1, what = "any" }) => sideOf(ctx, true).hand.filter((uid) => fits(defOf(ctx.state, uid, ctx.defs), what)).length >= k,
  // "If the Defending Pokémon has any Poké-Powers or Poké-Bodies": the kind its card prints (`kinds`).
  foePowers: (ctx, { kinds }) => Boolean(ctx.target) && kinds.includes(defIn(ctx, ctx.target).abilityKind),
  // "If any of your Benched Magmortar have any damage counters on them" (`what` as fits reads it).
  benchDamagedKind: (ctx, { what }) => sideOf(ctx, true).bench.some((s) => s.damage > 0 && fits(defIn(ctx, s), what)),
  foeBenchAtLeast: (ctx, { k }) => sideOf(ctx).bench.length >= k,
  foeGxUsed: (ctx) => Boolean(sideOf(ctx).gxUsed),
  // "If Beldum and Metang are on your Bench": every one of the names.
  ownHasAll: (ctx, { names, bench = false }) => names.every((name) => (bench ? sideOf(ctx, true).bench : slotsOf(sideOf(ctx, true))).some((s) => defIn(ctx, s).name === name)),
  toolDropped: (ctx) => Boolean(ctx.hit.toolDropped),
  paidAny: (ctx) => (ctx.hit.paid || []).length > 0,
  moreEnergy: (ctx) => Boolean(ctx.target) && unitsOf(ctx, ctx.slot) > unitsOf(ctx, ctx.target),
  foeRetreatAtLeast: (ctx, { k }) => Boolean(ctx.target) && retreatCost(ctx.state, ctx.target, ctx.defs) >= k,
  // "If any of your Pokémon in play are the same type as any of your opponent's Pokémon in play".
  sharedType: (ctx) => {
    const theirs = new Set(slotsOf(sideOf(ctx)).flatMap((s) => defIn(ctx, s).types || []));
    return slotsOf(sideOf(ctx, true)).some((s) => (defIn(ctx, s).types || []).some((t) => theirs.has(t)));
  },
};
/** Tests that hold all turn long (history), so an effect after the damage may ask them too. */
/** The attacks this player's Pokémon used during their last turn (engine.js keeps side.attacks). */
const lastTurnAttacks = (ctx) => (sideOf(ctx, true).attacks || []).filter((was) => was.turn === ctx.state.turn - 2);
/** The card is this Pokémon, or what it evolved from. */
const isThis = (ctx, uid) => uid === ctx.slot.uid || ctx.slot.under.includes(uid);
const STEADY = new Set(["movedUp", "healed", "downed", "struck", "foeBenchEmpty", "played", "otherUsed", "usedLast"]);

/** Does the test hold (`not`: the text asks the opposite)? */
const passes = (ctx, t) => Boolean(TESTS[t.test](ctx, t)) !== Boolean(t.not);

function flips(ctx, n) {
  const results = Array.from({ length: n }, () => flip(ctx.state, ctx.player));
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
  flipTable(ctx, { coins, more, none = false }) {
    const heads = flips(ctx, coins).filter(Boolean).length;
    ctx.hit.damage += more[heads] || 0;
    // `none`: all tails and the attack does nothing.
    if (none && !heads) {
      ctx.hit.cancelled = true;
      ctx.events.push({ t: "miss", p: ctx.player });
    }
  },
  /** Flip some coins: damage for each heads. */
  flipTimes(ctx, { coins, n, per = "", type = "", max = 0 }) {
    // `max`: "You can't flip more than 3 coins in this way".
    const results = flips(ctx, per ? (max ? Math.min(max, COUNTS[per](ctx, type)) : COUNTS[per](ctx, type)) : coins);
    // How many came up heads, and of how many, is kept for what the text says comes of it after the damage (OPS.onHeads).
    ctx.hit.heads = results.filter(Boolean).length;
    ctx.hit.coins = results.length;
    ctx.hit.damage = ctx.hit.heads * n;
  },
  healSelf(ctx, { n }) {
    const healed = Math.min(healMore(ctx.state, n), healRoom(ctx.state, ctx.slot));
    if (!healed) return;
    ctx.slot.damage -= healed;
    ctx.slot.healedOn = ctx.state.turn;
    ctx.events.push({ t: "heal", p: ctx.player, spot: -1, n: healed });
  },
  /** Flip some coins: more damage for each heads. */
  flipBonusEach(ctx, { coins, n, per = "", type = "" }) {
    const results = flips(ctx, per ? COUNTS[per](ctx, type) : coins);
    ctx.hit.heads = results.filter(Boolean).length;
    ctx.hit.coins = results.length;
    ctx.hit.damage += ctx.hit.heads * n;
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
    do results.push(flip(ctx.state, ctx.player));
    while (results[results.length - 1] && results.length < 60);
    ctx.events.push({ t: "flip", p: ctx.player, results });
    ctx.hit.heads = results.filter(Boolean).length;
    ctx.hit.coins = results.length;
    ctx.hit.damage = (more ? ctx.hit.damage : 0) + ctx.hit.heads * n;
  },
  /**
   * Damage for each of something on the table (COUNTS): `how` "more" adds it to the printed
   * damage, "less" takes it off (never below 0), "times" is the whole damage. `cap`: the most it may add.
   */
  bonusPer(ctx, { n, per, how = "more", type = "", cap = 0, max = 0 }) {
    const add = COUNTS[per](ctx, type) * n;
    // `max`: "You can't do more than 200 damage in this way."
    if (how === "times") ctx.hit.damage = max ? Math.min(max, add) : add;
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
  /** Vermilion City Gym's coin: heads, more damage if the attack does any after Weakness and Resistance; tails, damage to itself. */
  surge(ctx, { more, self }) {
    // The Stadium's coin, not one for the attack (Trick Coin doesn't count it).
    if (ctx.state.trick) ctx.state.trick.pause = true;
    const heads = flip(ctx.state, ctx.player);
    if (ctx.state.trick) delete ctx.state.trick.pause;
    ctx.events.push({ t: "flip", p: ctx.player, results: [heads], why: "stadium" });
    if (heads) ctx.hit.surge = more;
    else ctx.hit.recoil = self;
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
  pay(ctx, { from, energy = {}, what = "any", n = 0, all = false, exact = false, oneKind = false, lost = false }) {
    const { state, player, defs, events } = ctx;
    const side = state.players[player];
    const paid = (gone) => (ctx.hit.paid = [...(ctx.hit.paid || []), ...gone]);
    // `lost`: what is paid goes to the Lost Zone ("Put any number of Pokémon Tool cards from your discard pile in the Lost Zone").
    const pick = lost ? { op: "payFor", lost } : { op: "payFor" };
    if (from === "discard") {
      const uids = side.discard.filter((uid) => fits(defOf(state, uid, defs), what));
      if (uids.length) askChoose(state, { player, zone: "discard", what, uids, min: exact ? n : 0, max: n || uids.length, effect: pick });
      return;
    }
    if (from === "deck" || from === "decks" || from === "foeDeck") {
      for (const p of from === "decks" ? [player, other(player)] : from === "foeDeck" ? [other(player)] : [player]) {
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
      const uids = inPlay(state, player).flatMap(([slot]) => toolsIn(slot));
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
    if (!all) return askChoose(state, { player, zone: "play", what: kinds.every((k) => k.basic) ? "basicEnergy" : "energy", uids, min: 0, max: n || uids.length, effect: pick, ...rule });
    for (const [slot, spot] of slots) {
      const gone = slot.energy.filter(fit);
      if (!gone.length) continue;
      slot.energy = slot.energy.filter((uid) => !gone.includes(uid));
      side.discard.push(...gone);
      noteShed(state, player, spot ?? ACTIVE, gone);
      events.push({ t: "discard-energy", p: player, spot: spot ?? ACTIVE, uids: gone });
      paid(gone);
    }
  },
  /** More damage when something is true (TESTS). `keep`: what the test said is kept for OPS.ifHeld after the damage. */
  bonusIf(ctx, step) {
    const held = passes(ctx, step);
    if (held) ctx.hit.damage += step.n;
    if (step.keep) ctx.hit.held = held;
  },
  /** "..., this attack does 30 more damage, and the Defending Pokémon is now Confused": on the test as it was before the damage. */
  ifHeld(ctx, { steps, otherwise = null }) {
    if (ctx.hit.held) runSteps(steps, ctx);
    else if (otherwise) runSteps(otherwise, ctx);
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
  mark(ctx, { kind, on = "self", mine = false, n = 0, name = "", from = "", ko = false, mirror = false, until = false }) {
    const p = on === "self" ? ctx.player : other(ctx.player);
    const slot = on === "self" ? ctx.slot : ctx.state.players[p].active;
    if (!slot || (on !== "self" && ctx.shielded)) return;
    // `until`: in force from now until it leaves the Active Spot (a noUse mark: "can't use Blaze Blitz again until ...").
    addMark(ctx.state, slot, { kind, turn: until ? ctx.state.turn : ctx.state.turn + (mine ? 2 : 1), ...(n ? { n } : {}), ...(name ? { name } : {}), ...(from ? { from } : {}), ...(ko ? { ko } : {}), ...(mirror ? { mirror } : {}), ...(until ? { until } : {}) });
    ctx.events.push({ t: "mark", p, kind, ...(n ? { n } : {}), ...(name ? { name } : {}), ...(mirror ? { mirror } : {}), ...(until ? { until } : {}) });
  },
  /**
   * Damage beyond the Active Pokémon. `to`: "bench" (theirs), "any" (theirs, the Active one
   * included, with Weakness and Resistance for it alone), "ownBench". `count` 0 is all of them;
   * otherwise the attacker chooses that many, when there are more than that to choose from.
   */
  spread(ctx, { n, to = "bench", count = 0, noTyping = false, pierce = false, damaged = null, per = "", type = "", only = null, stage = "", boxes = null, typed = false, perCounter = false, energized = false, ptype = "", special = false, notSelf = false }) {
    const { state, player, events } = ctx;
    // "for each Grass Energy attached to this Pokémon": that much for each (COUNTS).
    if (per) n *= COUNTS[per](ctx, type);
    // `perCounter`: "... to 1 of your opponent's Benched Pokémon for each damage counter on that Pokémon" (counted on the one picked).
    if (perCounter) {
      const p = other(player);
      const spots = inPlay(state, p).filter(([slot, spot]) => (to === "any" || spot !== ACTIVE) && slot.damage > 0).map(([, spot]) => spot);
      const from = to === "any" ? ctx.slot.uid : "";
      if (spots.length) askPick(state, { player, side: p, spots, left: 1, effect: { op: "damage", n: 0, perCounter: n, from, attack: true } });
      return;
    }
    if (n <= 0) return;
    // "Each Benched Pokémon (both yours and your opponent's)": theirs, then yours.
    if (to === "allBench") {
      OPS.spread(ctx, { n, to: "bench", noTyping, pierce });
      return OPS.spread(ctx, { n, to: "ownBench", noTyping, pierce });
    }
    // `only`: these spots (coins flipped for each); `stage`, `boxes`: only their Basic Pokémon, their Pokémon V ...
    const kind = (slot) => {
      const def = defOf(state, slot.uid, ctx.defs);
      return (!stage || def.stage === stage) && (!boxes || boxes.includes(def.box)) && (!ptype || def.types.includes(ptype)) && (!special || slot.energy.some((uid) => !defOf(state, uid, ctx.defs).basic)) && (!notSelf || slot !== ctx.slot);
    };
    const p = to === "ownBench" || to === "ownAny" ? player : other(player);
    const side = state.players[p];
    // `damaged`: only those that have damage counters on them (false: only those that have none).
    const spots = [...((to === "any" || to === "ownAny") && side.active ? [ACTIVE] : []), ...side.bench.map((_, i) => i)].filter((spot) => (!energized || (spot === ACTIVE ? side.active : side.bench[spot]).energy.length > 0) && (damaged == null || ((spot === ACTIVE ? side.active : side.bench[spot]).damage > 0) === damaged) && (!only || only.includes(spot)) && kind(spot === ACTIVE ? side.active : side.bench[spot]));
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
      const dealt = (spot === ACTIVE || typed) && from ? damageAfterTyping(n, defOf(state, from, ctx.defs), typedDef(state, slot, ctx.defs), typing) : { amount: n, weak: false, resist: false };
      if (dealt.amount <= 0) continue;
      if (pierce ? defOf(state, slot.uid, ctx.defs).tera && spot !== ACTIVE : benchSafe(state, slot, spot, ctx.defs, p === player)) continue;
      if (p !== player && spot !== ACTIVE && shieldOn(state, slot, defIn(ctx, ctx.slot))) continue;
      // What is on that Pokémon still counts: less damage, a wall (engine.js sideHit).
      const amount = p !== player && !pierce && !ctx.hit.noEffects ? sideHit(state, slot, dealt.amount, ctx.slot, p, ctx.defs, events) : dealt.amount;
      if (amount <= 0) continue;
      slot.damage += amount;
      struck(state, slot, amount);
      events.push({ t: "damage", p, spot, n: amount, weak: dealt.weak, resist: dealt.resist });
      // An Ability that answers attack damage (Orthworm ex's, wherever it is).
      if (p !== player) hitBack(state, slot, p, ctx.slot, player, spot, ctx.defs, events);
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
  /** Miracle Sphere β: an Energy card on the other Active Pokémon, the attacker's choice, shuffled into its owner's deck. */
  foeEnergyToDeck(ctx) {
    const { state, player, defs } = ctx;
    const foe = other(player);
    const slot = state.players[foe].active;
    if (!slot || ctx.shielded || !slot.energy.length) return;
    if (slot.energy.length === 1 || energyAlike(state, slot.energy, defs)) return void energyToDeck(state, foe, [slot.energy[slot.energy.length - 1]], ctx.events);
    askChoose(state, { player, zone: "play", what: "energy", uids: slot.energy.slice(), min: 1, max: 1, owner: foe, effect: { op: "energyToDeck" } });
  },
  /** Discard Energy (of one type, when the card names it) from the other Active Pokémon: the attacker chooses which, when they differ. */
  discardFoeEnergy(ctx, { n, type = "", lost = false, special = false }) {
    const { state, player, defs } = ctx;
    const foe = other(player);
    const slot = state.players[foe].active;
    if (!slot || ctx.shielded) return;
    // `lost`: into the Lost Zone; `special`: Special Energy only.
    const uids = slot.energy.filter((uid) => (!type || (defOf(state, uid, defs).provides || []).some((u) => fitsType(u, type))) && (!special || !defOf(state, uid, defs).basic));
    shedEnergy(state, player, foe, ACTIVE, uids, n, ctx.events, defs, { lost });
  },
  /**
   * Discard cards from the top of the other player's deck (`mine`: the attacker's own; `lost`: into the Lost Zone).
   * `per`: that many for each of something (COUNTS): "For each Fire Energy attached to this Pokémon, discard the top card ...".
   */
  mill(ctx, { n, mine = false, lost = false, per = "", type = "" }) {
    const p = mine ? ctx.player : other(ctx.player);
    const gone = ctx.state.players[p].deck.splice(0, per ? n * COUNTS[per](ctx, type) : n);
    if (!gone.length) return;
    if (lost) return void toLost(ctx.state, p, gone, ctx.events);
    ctx.state.players[p].discard.push(...gone);
    ctx.events.push({ t: "mill", p, uids: gone });
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
  counters(ctx, { n, where = "any", count = 0, spread = false, damaged = false, energized = false }) {
    const { state, player, defs, events } = ctx;
    const foe = other(player);
    // `damaged`: only those that have damage counters on them already; `energized`: only those that have any Energy attached.
    const spots = inPlay(state, foe).filter(([slot, spot]) => (where === "bench" ? spot !== ACTIVE : where === "active" ? spot === ACTIVE : true) && (!damaged || slot.damage > 0) && (!energized || slot.energy.length > 0) && !warded(state, slot, { player, src: "attack" }, defs) && !caged(state, foe, spot, player)).map(([, spot]) => spot);
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
  moveOwnEnergy(ctx, { n = 1, type = "", basic = false, all = false, heal = 0 }) {
    const { state, player, defs, slot } = ctx;
    const from = spotOf(ctx);
    const bench = state.players[player].bench.map((_, i) => i).filter((i) => i !== from);
    const uids = slot.energy.filter((uid) => {
      const def = defOf(state, uid, defs);
      return (!type || (def.provides || []).includes(type)) && (!basic || def.basic);
    });
    if (from == null || !bench.length || !uids.length) return;
    // Nothing to tell apart (all of them, or cards all alike): no need to ask which.
    // `heal`: "If you do, heal 50 damage from that Pokémon."
    const mend = heal ? { heal } : {};
    if (all || uids.length <= n || energyAlike(state, uids, defs)) return askPick(state, { player, side: player, spots: bench, left: 1, effect: { op: "moveEnergyCards", from, uids: all ? uids : uids.slice(-n), ...mend } });
    askChoose(state, { player, zone: "play", what: "energy", uids, min: n, max: n, effect: { op: "carryEnergy", from, ...mend } });
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
  discardFoeSpecial(ctx, { all = false } = {}) {
    const { state, player, defs, events } = ctx;
    const foe = other(player);
    const slot = state.players[foe].active;
    if (!slot || ctx.shielded) return;
    const special = slot.energy.filter((uid) => !defOf(state, uid, defs).basic);
    if (special.length) shedEnergy(state, player, foe, ACTIVE, special, all ? special.length : 1, events, defs);
  },
  /** "Choose 1 of the Defending Pokémon's attacks. That Pokémon can't use that attack during your opponent's next turn." */
  // `only`: "That Pokémon can use only that attack during your opponent's next turn": each of the others is locked.
  lockFoeAttack(ctx, { only = false } = {}) {
    const { state, player, defs } = ctx;
    const target = state.players[other(player)].active;
    if (!target || ctx.shielded) return;
    const names = [...new Set(defOf(state, target.uid, defs).attacks.map((a) => a.name))];
    const lock = (name) => ({ op: "mark", kind: "noUse", on: "foe", name });
    if (only) {
      if (names.length < 2) return;
      return void state.pending.push({ type: "option", player, why: "foeAttack", prompt: "Choose the only attack it can use during their next turn.", labels: names, options: names.map((name) => [{ op: "fx", steps: names.filter((n) => n !== name).map(lock), uid: ctx.slot.uid }]) });
    }
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
    } else if (to === "lost") {
      // "Put a random card from your opponent's hand in the Lost Zone."
      events.push({ t: "reveal-hand", p: foe, uids: gone });
      toLost(state, foe, gone, events);
    } else {
      side.discard.push(...gone);
      events.push({ t: "discard-hand", p: foe, uids: gone, random: true });
    }
  },
  /** Before the damage: the Tool on the other Active Pokémon is discarded, so it can't change the damage. */
  dropFoeTool(ctx, { all = false } = {}) {
    const { state, player, defs, events } = ctx;
    const foe = other(player);
    const slot = state.players[foe].active;
    if (!slot?.tool || warded(state, slot, { player, src: "attack" }, defs)) return;
    // `all`: "discard all Pokémon Tools" (more than one may be attached).
    for (const uid of all ? toolsIn(slot) : [slot.tool]) {
      takeTool(slot, uid);
      toolGone(state, foe, uid, defs);
      events.push({ t: "discard-tool", p: foe, spot: ACTIVE, uid });
      ctx.hit.toolDropped = true;
    }
  },
  /** "Discard all Pokémon Tools from this Pokémon" (`must`: "If you can't discard any, this attack does nothing"). */
  dropOwnTools(ctx, { must = false }) {
    const { state, player, defs, events, slot } = ctx;
    const tools = toolsIn(slot);
    if (!tools.length) {
      if (must) {
        ctx.hit.cancelled = true;
        events.push({ t: "miss", p: player });
      }
      return;
    }
    for (const uid of tools) {
      takeTool(slot, uid);
      toolGone(state, player, uid, defs);
      events.push({ t: "discard-tool", p: player, spot: spotOf(ctx) ?? ACTIVE, uid });
    }
  },
  /** "Shuffle all (or n) Energy attached to this Pokémon into your deck" (`exact`: only with that many). */
  selfEnergyToDeck(ctx, { n = 99, exact = false }) {
    const { state, player, events, slot } = ctx;
    if (exact && slot.energy.length < n) return;
    const uids = slot.energy.slice(0, n);
    if (uids.length) energyToDeck(state, player, uids, events);
  },
  /** "You may discard your hand" (all of it), or `n` cards of a kind from it: kept as paid (TESTS.paidAny). */
  dropHand(ctx, { n = 0, what = "any" }) {
    const { state, player, defs, events } = ctx;
    const side = state.players[player];
    const gone = side.hand.filter((uid) => fits(defOf(state, uid, defs), what)).slice(0, n || undefined);
    if (!gone.length) return;
    side.hand = side.hand.filter((uid) => !gone.includes(uid));
    side.discard.push(...gone);
    events.push({ t: "discard", p: player, uids: gone, from: "hand" });
    ctx.hit.paid = [...(ctx.hit.paid || []), ...gone];
  },
  /** "Your opponent reveals their hand": shown, nothing chosen (before the damage, which counts what is there). */
  revealHand(ctx) {
    const hand = sideOf(ctx).hand.slice();
    if (hand.length) ctx.events.push({ t: "reveal-hand", p: other(ctx.player), uids: hand });
  },
  /** "This attack does 80 damage ... for each tails" (the coins of OPS.flipCount). */
  tailsTimes(ctx, { n }) {
    ctx.hit.damage = ((ctx.hit.coins || 0) - (ctx.hit.heads || 0)) * n;
  },
  /** The attacker and all attached to it leave play: shuffled into the deck, or (`to: "hand"`) into the hand. `optional`: "you may". */
  selfAway(ctx, { to = "deck", optional = false }) {
    const { state, player, defs, events, slot } = ctx;
    const spot = spotOf(ctx);
    if (spot == null || hpLeft(state, slot, defs) <= 0) return;
    if ((to === "hand" || to === "handBare") && keptInPlay(state, player)) return;
    if (optional && to === "deck") return askPick(state, { player, side: player, spots: [spot], left: 1, optional: true, effect: { op: "shuffleIn" } });
    const side = state.players[player];
    const tools = toolsIn(slot);
    const cards = [slot.uid, ...slot.under, ...slot.energy, ...tools, ...heldOn(slot)];
    if (spot === ACTIVE) side.active = null;
    else side.bench.splice(spot, 1);
    // "Put this Pokémon and all cards attached to it in the Lost Zone" (`to: "lost"`); "You may put this Pokémon into your
    // hand. (Discard all cards attached to this Pokémon.)" (`to: "handBare"`).
    if (to === "lost") {
      toLost(state, player, cards, events);
      events.push({ t: "bounce", p: player, spot, uid: slot.uid, lost: true });
    } else if (to === "handBare") {
      for (const uid of tools) toolGone(state, player, uid, defs);
      side.hand.push(slot.uid);
      side.discard.push(...cards.filter((uid) => uid !== slot.uid && !tools.includes(uid)));
      events.push({ t: "bounce", p: player, spot, uid: slot.uid });
    } else if (to === "hand") {
      side.hand.push(...cards);
      events.push({ t: "bounce", p: player, spot, uid: slot.uid });
    } else if (to === "discard") {
      // "Discard this Pokémon and all attached cards": it isn't Knocked Out (no Prize card for it).
      for (const uid of tools) toolGone(state, player, uid, defs);
      side.discard.push(...cards.filter((uid) => !tools.includes(uid)));
      events.push({ t: "bounce", p: player, spot, uid: slot.uid, discard: true });
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
  discardEnergy(ctx, { n, type, basic = false, then = null, lost = false, name = "" }) {
    const { state, defs, slot, player } = ctx;
    const spot = spotOf(ctx);
    if (spot == null) return;
    // `name`: an Energy card by name ("a Plasma Energy", "a Team Rocket's Energy"); `lost`: into the Lost Zone.
    const uids = slot.energy.filter((uid) => {
      const def = defOf(state, uid, defs);
      return (!type || (def.provides || []).some((u) => fitsType(u, type))) && (!basic || def.basic) && (!name || def.name === name);
    });
    if (!uids.length) return;
    const asked = shedEnergy(state, player, player, spot, uids, n, ctx.events, defs, { lost });
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
      do results.push(flip(ctx.state, ctx.player));
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
  payOrNothing(ctx, { n, type = "", basic = false, name = "", need = n }) {
    const { state, defs, slot } = ctx;
    const have = slot.energy.filter((uid) => (!type || (defOf(state, uid, defs).provides || []).some((u) => fitsType(u, type))) && (!basic || defOf(state, uid, defs).basic) && (!name || defOf(state, uid, defs).name === name)).length;
    // `need`: how many it takes ("Discard all Lightning Energy cards ... or this attack does nothing": 1, and all go).
    if (have < need) {
      ctx.hit.cancelled = true;
      ctx.events.push({ t: "miss", p: ctx.player });
      return;
    }
    OPS.discardEnergy(ctx, { n, type, basic, name });
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
  /** "Put damage counters on each of your opponent's Benched Pokémon until its remaining HP is 100". */
  countersToEach(ctx, { hp }) {
    const { state, player, defs, events } = ctx;
    const foe = other(player);
    state.players[foe].bench.forEach((slot, spot) => {
      if (warded(state, slot, { player, src: "attack" }, defs) || benchSafe(state, slot, spot, defs, false)) return;
      const n = hpLeft(state, slot, defs) - hp;
      if (n <= 0) return;
      slot.damage += n;
      events.push({ t: "damage", p: foe, spot, n });
    });
  },
  /** "Knock Out your opponent's Active Pokémon. If your opponent's Active Pokémon is Knocked Out in this way, this Pokémon does 200 damage to itself." */
  knockOutRecoil(ctx, { n }) {
    const slot = ctx.state.players[other(ctx.player)].active;
    if (!slot || ctx.shielded) return;
    OPS.knockOut(ctx);
    if (hpLeft(ctx.state, slot, ctx.defs) <= 0) OPS.selfDamage(ctx, { n });
  },
  /** Before the damage: one more Prize card (or n) if this attack's damage Knocks Out the other Active Pokémon (engine.js resolveKnockOuts). */
  bounty(ctx, { n, boxes = null, what = "" }) {
    // `boxes`: "If your opponent's Pokémon-GX or Pokémon-EX is Knocked Out by damage from this attack"; `what`: "Basic Pokémon".
    if (ctx.target && (!boxes || boxes.includes(defIn(ctx, ctx.target).box)) && (!what || fits(defIn(ctx, ctx.target), what))) addMark(ctx.state, ctx.target, { kind: "bounty", turn: ctx.state.turn, n });
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
  copyAttack(ctx, { tera = false, any = false, bench = false, who = "", free = false, paid = false }) {
    const { state, player, defs } = ctx;
    // A coin before it said the attack does nothing: there is nothing to copy (the damage step still follows, and does nothing).
    if (ctx.hit.cancelled) return;
    const target = state.players[other(player)].active;
    // `any`: "Choose 1 of your opponent's Pokémon's attacks": their Benched Pokémon's too.
    // `bench`: "Choose 1 of your Benched Fusion Strike Pokémon's attacks" (`who` the kind, trainers.js fits).
    const from = bench ? state.players[player].bench : any ? inPlay(state, other(player)).map(([slot]) => slot) : target ? [target] : [];
    const mons = from.map((slot) => defOf(state, slot.uid, defs)).filter((def) => (!tera || def.tera) && (!who || fits(def, who)));
    const side = state.players[player];
    const can = [];
    const seen = new Set();
    for (const def of mons) {
      def.attacks.forEach((a, index) => {
        // `paid`: "This attack does nothing if this Pokémon doesn't have the Energy necessary to use that attack": only those it can pay for.
        if ((a.once === "gx" && side.gxUsed) || (a.once === "vstar" && side.vstarUsed) || seen.has(`${def.id}/${index}`) || (paid && !canPay(state, ctx.slot, a.cost, defs))) return;
        seen.add(`${def.id}/${index}`);
        can.push({ card: def.id, index, name: a.name });
      });
    }
    if (!can.length) return;
    // `free`: "except for ... anything else required in order to use that attack, such as discarding Energy cards".
    const extra = free ? { free } : {};
    if (can.length === 1) OPS.useAttack(ctx, { card: can[0].card, index: can[0].index, ...extra });
    else state.pending.push({ type: "option", player, why: "copy", prompt: "Choose the attack to use.", labels: can.map((c) => c.name), options: can.map((c) => [{ op: "fx", steps: [{ op: "useAttack", card: c.card, index: c.index, ...extra }], uid: ctx.slot.uid, hit: ctx.hit, atk: ctx.atk }]) });
    // This attack's own damage doesn't follow: the copied one's has (or will, once it is chosen).
    ctx.detached = true;
  },
  /** The copied attack, from its steps before the damage on (copyAttack). */
  useAttack(ctx, { card, index, free = false }) {
    const copied = ctx.defs(card).attacks[index];
    // `free`: its Energy discards (the price of using it) are left out, after the damage too.
    const attack = free ? { ...copied, fx: (copied.fx || []).filter((step) => !["discardEnergy", "payOrNothing"].includes(step.op)) } : copied;
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
  // `kinds`: "Choose either Burned or Poisoned".
  chooseCondition(ctx, { kinds = ["Asleep", "Burned", "Confused", "Paralyzed", "Poisoned"] } = {}) {
    const target = ctx.state.players[other(ctx.player)].active;
    if (!target || ctx.shielded) return;
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
  discardFoeAny(ctx, { n = 1, each = false, lost = false, special = false }) {
    const { state, player, defs, events } = ctx;
    const foe = other(player);
    // `special`: Special Energy only; `lost`: into the Lost Zone.
    const cards = (slot) => slot.energy.filter((uid) => !special || !defOf(state, uid, defs).basic);
    const open = inPlay(state, foe).filter(([slot, spot]) => cards(slot).length && !(spot === ACTIVE && ctx.shielded) && !warded(state, slot, { player, src: "attack" }, defs));
    if (each || open.length === 1) {
      for (const [slot, spot] of open) shedEnergy(state, player, foe, spot, cards(slot), each ? 1 : n, events, defs, { lost });
      return;
    }
    const uids = open.flatMap(([slot]) => cards(slot));
    if (uids.length <= n) for (const [slot, spot] of open) shedEnergy(state, player, foe, spot, cards(slot), cards(slot).length, events, defs, { lost });
    else if (uids.length) askChoose(state, { player, zone: "play", what: "energy", uids, min: n, max: n, effect: { op: "dropInPlay", ...(lost ? { lost } : {}) } });
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
    if (!target || ctx.shielded || warded(state, target, { player, src: "attack" }, defs) || target.damage === slot.damage || countersStay(state)) return;
    const [mine, theirs] = [slot.damage, target.damage];
    slot.damage = theirs;
    target.damage = mine;
    for (const [p, spot, was, now] of [[player, spotOf(ctx) ?? ACTIVE, mine, theirs], [other(player), ACTIVE, theirs, mine]]) {
      if (now > was) events.push({ t: "damage", p, spot, n: now - was, why: "move" });
      else events.push({ t: "heal", p, spot, n: was - now, why: "move" });
    }
  },
  /** "Knock Out 1 of your opponent's Basic Pokémon that isn't a Pokémon-GX": the attacker picks it (`stage`, `notBoxes`). */
  knockOutOne(ctx, { stage = "", notBoxes = [], bench = false }) {
    const { state, player, defs } = ctx;
    const foe = other(player);
    const spots = inPlay(state, foe).filter(([slot, spot]) => {
      const def = defOf(state, slot.uid, defs);
      return (!bench || spot !== ACTIVE) && (!stage || def.stage === stage) && !notBoxes.includes(def.box) && !(spot === ACTIVE && ctx.shielded) && !warded(state, slot, { player, src: "attack" }, defs) && hpLeft(state, slot, defs) > 0;
    }).map(([, spot]) => spot);
    if (spots.length) askPick(state, { player, side: foe, spots, left: 1, effect: { op: "knockOut" } });
  },
  /** When the attack may be used at all: "If you go first, you can use this attack on your first turn" (engine.js reads these). */
  firstTurn() {},
  /** "Shuffle your opponent's deck." */
  foeShuffleDeck(ctx) {
    shuffle(ctx.state, sideOf(ctx).deck);
  },
  /** "Look at the top card of your opponent's deck" (`mine`: your own; `drop`: "You may discard that card"). */
  lookTop(ctx, { n = 1, mine = false, drop = false }) {
    const { state, player } = ctx;
    const owner = mine ? player : other(player);
    const top = state.players[owner].deck.slice(0, n);
    if (top.length) askChoose(state, { player, owner, zone: "deck", what: "any", uids: top, min: 0, max: drop ? top.length : 0, effect: { op: drop ? "millChosen" : "look" } });
  },
  /** "You can use this attack only if ...": engine.js asks attackBlock before the attack is offered. */
  onlyIf() {},
  /** "... for each Basic Water Energy card in your discard pile. Then, shuffle those cards into your deck": all of them, no choice. */
  discardToDeck(ctx, { what }) {
    const side = ctx.state.players[ctx.player];
    const uids = side.discard.filter((uid) => fits(defOf(ctx.state, uid, ctx.defs), what) && !defOf(ctx.state, uid, ctx.defs).noRecover);
    if (!uids.length) return;
    side.discard = side.discard.filter((uid) => !uids.includes(uid));
    side.deck.push(...uids);
    shuffle(ctx.state, side.deck);
    ctx.events.push({ t: "recycle", p: ctx.player, uids });
  },
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
  // `tera`: only the Tera Pokémon ("heal all damage from each of your Tera Pokémon").
  healEvery(ctx, { n, own = true, foe = false, tera = false }) {
    const { state, player, events } = ctx;
    for (const p of [...(own ? [player] : []), ...(foe ? [other(player)] : [])]) {
      for (const [slot, spot] of inPlay(state, p)) {
        if (tera && !defOf(state, slot.uid, ctx.defs)?.tera) continue;
        const healed = Math.min(healMore(state, n), healRoom(state, slot));
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
    ctx.shielded = Boolean(target && (shieldOn(ctx.state, target, defIn(ctx, ctx.slot)) || abilityOn(ctx.state, target, ctx.defs)?.noEffects || energyMod(ctx.state, target, "noEffects", ctx.defs)));
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
    side.taken = [...(side.taken || []).filter((t) => t.turn >= state.turn - 2), { turn: state.turn, n: prizes.length }];
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
  shuffleFoeActive(ctx, { to = "deck" }) {
    const { state, player, defs, events } = ctx;
    const foe = other(player);
    const side = state.players[foe];
    const slot = side.active;
    if (!slot || ctx.shielded || warded(state, slot, { player, src: "attack" }, defs)) return;
    if (to === "hand" && keptInPlay(state, foe)) return;
    // `to`: "deck" (shuffled in), "hand", "discard", "lost" (the Lost Zone). It isn't Knocked Out: no Prize cards for it.
    // The Tool goes with it (to the discard pile the way any Tool does: one that says so goes back to the hand).
    const cards = [slot.uid, ...slot.under, ...slot.energy, ...(to !== "discard" ? toolsIn(slot) : []), ...heldOn(slot)];
    if (to === "discard") for (const uid of toolsIn(slot)) toolGone(state, foe, uid, defs);
    side.active = null;
    if (to === "lost") toLost(state, foe, cards, events);
    else if (to === "hand") side.hand.push(...cards);
    else if (to === "discard") side.discard.push(...cards);
    else {
      side.deck.push(...cards);
      shuffle(state, side.deck);
    }
    events.push({ t: to === "deck" ? "shuffle-in" : "bounce", p: foe, spot: ACTIVE, uid: slot.uid, ...(to === "lost" ? { lost: true } : {}) });
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
  benchCountersToFoe(ctx, { who = "" } = {}) {
    const { state, player, defs } = ctx;
    const target = state.players[other(player)].active;
    if (!target || ctx.shielded || warded(state, target, { player, src: "attack" }, defs) || countersStay(state)) return;
    // `who`: "from 1 of your Benched Team Rocket's Pokémon" (a kind, trainers.js fits).
    const spots = state.players[player].bench.map((s, i) => [s, i]).filter(([s]) => s.damage > 0 && (!who || fits(defIn(ctx, s), who))).map(([, i]) => i);
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
  /** Flip a coin before the damage: `heads` or `tails` steps now (they may change the damage), and the coin kept for OPS.onCoin. */
  coin(ctx, { heads = [], tails = [] }) {
    ctx.hit.coin = flips(ctx, 1)[0];
    runSteps(ctx.hit.coin ? heads : tails, ctx);
  },
  /** After the damage: what the coins flipped before it say (flipTimes, flipBonusEach, flipUntilTails keep how many were heads). */
  onHeads(ctx, { min = 0, max = 99, steps }) {
    if (ctx.hit.heads != null && ctx.hit.heads >= min && ctx.hit.heads <= max) runSteps(steps, ctx);
  },
  /** "If you use this attack when you have only 1 Prize card remaining, you win this game." (asked before the damage). */
  winIf(ctx, { k }) {
    if (sideOf(ctx, true).prizes.length === k) win(ctx.state, ctx.player, "attack", ctx.events);
  },
  /** "... you can't use this attack again as long as this Pokémon stays in play" (engine.js slot.spent). */
  spend(ctx) {
    if (spotOf(ctx) == null || !ctx.attack) return;
    ctx.slot.spent = [...new Set([...(ctx.slot.spent || []), ctx.attack.name])];
  },
  /**
   * "Choose 1 of your opponent's Benched Pokémon. Your opponent shuffles that Pokémon and all cards attached to it into
   * their deck" (`where` "bench", or "any": their Active Pokémon too). The attacker picks.
   */
  shuffleFoeOne(ctx, { where = "bench" }) {
    const { state, player, defs } = ctx;
    const foe = other(player);
    const spots = inPlay(state, foe).filter(([slot, spot]) => (where === "any" || spot !== ACTIVE) && !(spot === ACTIVE && ctx.shielded) && !warded(state, slot, { player, src: "attack" }, defs)).map(([, spot]) => spot);
    if (spots.length) askPick(state, { player, side: foe, spots, left: 1, effect: { op: "shuffleIn" } });
  },
  /** "Put damage counters on 1 of your opponent's Pokémon until its remaining HP is 10": the attacker picks which. */
  countersToOne(ctx, { hp }) {
    const { state, player, defs } = ctx;
    const foe = other(player);
    const spots = inPlay(state, foe).filter(([slot, spot]) => !(spot === ACTIVE && ctx.shielded) && !warded(state, slot, { player, src: "attack" }, defs) && hpLeft(state, slot, defs) > hp).map(([, spot]) => spot);
    if (spots.length) askPick(state, { player, side: foe, spots, left: 1, effect: { op: "countersTo", hp } });
  },
  /** "Heal 20 damage from each of your Pokémon that has any Grass Energy attached to it" (`type` "" for any Energy). */
  healEach(ctx, { n, type = "" }) {
    const { state, player, events } = ctx;
    for (const [slot, spot] of inPlay(state, player)) {
      if (!unitsOf(ctx, slot, type)) continue;
      const healed = Math.min(healMore(state, n), healRoom(state, slot));
      if (!healed) continue;
      slot.damage -= healed;
      slot.healedOn = state.turn;
      events.push({ t: "heal", p: player, spot, n: healed });
    }
  },
  /** "Heal 20 damage from both Active Pokémon." */
  healBoth(ctx, { n }) {
    OPS.healSelf(ctx, { n });
    const target = sideOf(ctx).active;
    if (!target || ctx.shielded) return;
    const healed = Math.min(healMore(ctx.state, n), healRoom(ctx.state, target));
    if (!healed) return;
    target.damage -= healed;
    target.healedOn = ctx.state.turn;
    ctx.events.push({ t: "heal", p: other(ctx.player), spot: ACTIVE, n: healed });
  },
  /** "This Pokémon does 10 damage to itself for each damage counter on it" (COUNTS). */
  selfDamagePer(ctx, { n, per, type = "" }) {
    const k = COUNTS[per](ctx, type);
    if (k > 0) OPS.selfDamage(ctx, { n: n * k });
  },
  /** "Discard all Supporter cards you find there" (`what` as trainers.js fits reads it): every card of that kind in their hand. */
  foeHandDrop(ctx, { what }) {
    const { state, player, defs, events } = ctx;
    const side = sideOf(ctx);
    const gone = side.hand.filter((uid) => fits(defOf(state, uid, defs), what));
    if (side.hand.length) events.push({ t: "reveal-hand", p: other(player), uids: side.hand.slice() });
    if (!gone.length) return;
    side.hand = side.hand.filter((uid) => !gone.includes(uid));
    side.discard.push(...gone);
    events.push({ t: "discard-hand", p: other(player), uids: gone });
  },
  /** "Your opponent reveals their hand, and you discard a card you find there" (`n` cards; `lost`: into the Lost Zone): the attacker chooses. */
  foeHandPick(ctx, { n: many = 1, lost = false, what = "any", to = "" }) {
    const { state, player, events } = ctx;
    // `n` "heads": one for each heads (OPS.flipCount); none, and the hand isn't shown.
    const n = many === "heads" ? ctx.hit.heads || 0 : many;
    if (!n) return;
    const foe = other(player);
    const hand = state.players[foe].hand.slice();
    if (!hand.length) return;
    events.push({ t: "reveal-hand", p: foe, uids: hand });
    // `what`: only cards of that kind may be chosen ("Discard a Trainer card you find there"); the rest are shown.
    const uids = hand.filter((uid) => fits(defOf(state, uid, ctx.defs), what));
    if (!uids.length) return void askChoose(state, { player, owner: foe, zone: "hand", what: "any", uids: hand, min: 0, max: 0, effect: { op: "look" } });
    askChoose(state, { player, owner: foe, zone: "hand", what, uids, min: Math.min(n, uids.length), max: n, effect: { op: lost ? "toLost" : to === "deck" ? "toDeck" : "discard" }, ...(to === "deck" ? { shuffle: true } : {}) });
  },
  /** Flip some coins before the damage and keep how many were heads (OPS.perHeads); `allTails`: all tails and the attack does nothing. */
  flipCount(ctx, { coins, allTails = false, per = "", type = "" }) {
    // `per`: "Flip a number of coins equal to the number of ..." (COUNTS).
    const results = flips(ctx, per ? COUNTS[per](ctx, type) : coins);
    ctx.hit.heads = results.filter(Boolean).length;
    ctx.hit.coins = results.length;
    if (allTails && !ctx.hit.heads) {
      ctx.hit.cancelled = true;
      ctx.events.push({ t: "miss", p: ctx.player });
    }
  },
  /** After the damage: the steps once for each heads the coins before it came up (OPS.flipCount). */
  perHeads(ctx, { steps }) {
    runSteps(Array.from({ length: ctx.hit.heads || 0 }, () => steps).flat(), ctx);
  },
  /**
   * "If you do, move as many Energy cards attached to this Pokémon as you like to the new Active Pokémon": after it
   * switched to the Bench, the player picks any of its Energy (`type`: of that type only) to go to the new Active one.
   */
  carryToActive(ctx, { type = "" }) {
    const { state, player, defs, slot } = ctx;
    const from = spotOf(ctx);
    const uids = slot.energy.filter((uid) => !type || (defOf(state, uid, defs).provides || []).includes(type));
    if (from == null || from === ACTIVE || !uids.length || !state.players[player].active) return;
    askChoose(state, { player, zone: "play", what: "energy", uids, min: 0, max: uids.length, effect: { op: "carryEnergy", from, spots: [ACTIVE] } });
  },
  /** After the damage: the steps once for each tails the coins before it came up (OPS.flipCount). */
  perTails(ctx, { steps }) {
    runSteps(Array.from({ length: (ctx.hit.coins || 0) - (ctx.hit.heads || 0) }, () => steps).flat(), ctx);
  },
  /** "This attack can be used even if this Pokémon is Asleep": nothing to do here (engine.js stuckAttack reads it). */
  asleepOk() {},
  /** "Then, this Pokémon does 10 damage times the number of tails to itself" (the coins flipped before the damage). */
  selfPerTails(ctx, { n }) {
    const tails = (ctx.hit.coins || 0) - (ctx.hit.heads || 0);
    if (tails > 0) OPS.selfDamage(ctx, { n: n * tails });
  },
  /** "Look at the top 4 cards of your deck and put 2 of them into your hand. Put the other cards in the Lost Zone." */
  topLost(ctx, { n, top }) {
    const { state, player } = ctx;
    const uids = sideOf(ctx, true).deck.slice(0, top);
    if (uids.length) askChoose(state, { player, zone: "deck", what: "any", uids, min: Math.min(n, uids.length), max: n, effect: { op: "toHand" }, restLost: uids.length });
  },
  /** "Put 2 cards from your opponent's discard pile in the Lost Zone": the attacker chooses which. */
  foeDiscardLost(ctx, { n }) {
    const { state, player } = ctx;
    const uids = sideOf(ctx).discard.slice();
    if (uids.length) askChoose(state, { player, owner: other(player), zone: "discard", what: "any", uids, min: Math.min(n, uids.length), max: n, effect: { op: "toLost" } });
  },
  /**
   * "Put a card from your hand in the Lost Zone. If you do, draw 3 cards" (`then`, after it; `what` the kind of card).
   * Before the damage (`must`): "(If you can't put a Pokémon in the Lost Zone, this attack does nothing.)"
   */
  handLost(ctx, { n = 1, what = "any", then = null, must = false }) {
    const { state, player } = ctx;
    const uids = sideOf(ctx, true).hand.filter((uid) => fits(defOf(state, uid, ctx.defs), what));
    if (!uids.length) {
      if (must) {
        ctx.hit.cancelled = true;
        ctx.events.push({ t: "miss", p: player });
      }
      return;
    }
    askChoose(state, { player, zone: "hand", what, uids, min: Math.min(n, uids.length), max: n, effect: { op: "toLost" } });
    if (then) state.pending[state.pending.length - 1].then = [{ op: "fx", steps: then, uid: ctx.slot.uid }];
  },
  /** "Search your deck for 1 Pokémon and put it in the Lost Zone. Shuffle your deck afterward." */
  deckLost(ctx, { what, n = 1 }) {
    const { state, player } = ctx;
    const deck = sideOf(ctx, true).deck;
    if (!deck.length) return;
    askChoose(state, { player, zone: "deck", what, uids: deck.filter((uid) => fits(defOf(state, uid, ctx.defs), what)), min: 0, max: n, effect: { op: "toLost" }, shuffle: true });
  },
  /**
   * Before the damage: "If the Defending Pokémon is Knocked Out by this attack, put it and all cards attached to it in the
   * Lost Zone instead of the discard pile" (`all`: any of their Pokémon this attack's damage Knocks Out). engine.js resolveKnockOuts.
   */
  lostKo(ctx, { all = false }) {
    const slots = all ? slotsOf(sideOf(ctx)) : [sideOf(ctx).active].filter(Boolean);
    for (const slot of slots) addMark(ctx.state, slot, { kind: "lostKo", turn: ctx.state.turn });
  },
  /** "Put 2 Energy attached to your Pokémon in the Lost Zone": from any of the attacker's side's Pokémon, its player's choice. */
  ownEnergyLost(ctx, { n }) {
    const { state, player, defs, events } = ctx;
    const mine = inPlay(state, player).filter(([slot]) => slot.energy.length);
    const uids = mine.flatMap(([slot]) => slot.energy);
    if (!uids.length) return;
    if (mine.length === 1) return void shedEnergy(state, player, player, mine[0][1], uids, n, events, defs, { lost: true });
    if (uids.length <= n) {
      for (const [slot, spot] of mine) shedEnergy(state, player, player, spot, slot.energy.slice(), slot.energy.length, events, defs, { lost: true });
      return;
    }
    askChoose(state, { player, zone: "play", what: "energy", uids, min: n, max: n, effect: { op: "dropInPlay", lost: true } });
  },
  /* ---------- batch 8 ---------- */
  /** "Discard 1 of your opponent's Pokémon and all cards attached to it" (not a Knock Out: no Prize cards). The attacker picks. */
  discardFoeMon(ctx, { n = 1 }) {
    const { state, player, defs } = ctx;
    const foe = other(player);
    const spots = inPlay(state, foe).filter(([slot, spot]) => !(spot === ACTIVE && ctx.shielded) && !warded(state, slot, { player, src: "attack" }, defs)).map(([, spot]) => spot);
    if (spots.length) askPick(state, { player, side: foe, spots, left: Math.min(n, spots.length), effect: { op: "discardMon" } });
  },
  /** "Devolve each of your opponent's evolved Pokémon" (`to` "hand", or "deck": shuffled into it). */
  devolveEach(ctx, { to = "hand" }) {
    const { state, player, defs, events } = ctx;
    const foe = other(player);
    const side = state.players[foe];
    let back = false;
    for (const [slot, spot] of inPlay(state, foe)) {
      if (!slot.under.length || (spot === ACTIVE && ctx.shielded) || warded(state, slot, { player, src: "attack" }, defs)) continue;
      const top = slot.uid;
      if (!devolveSlot(state, foe, spot, events)) continue;
      if (to === "deck") {
        side.hand.splice(side.hand.lastIndexOf(top), 1);
        side.deck.push(top);
        back = true;
      }
    }
    if (back) shuffle(state, side.deck);
  },
  /** "Add the top 2 cards of your opponent's deck to their Prize cards." */
  addPrizes(ctx, { n }) {
    const side = sideOf(ctx);
    const gone = side.deck.splice(0, n);
    if (!gone.length) return;
    side.prizes.push(...gone);
    ctx.events.push({ t: "to-prizes", p: other(ctx.player), n: gone.length });
  },
  /** "Your opponent reveals their hand. Add a card you find there to their Prize cards face down" (`from` "hand", or "discard"). */
  pickToPrizes(ctx, { from = "hand" }) {
    const { state, player, events } = ctx;
    const foe = other(player);
    const uids = state.players[foe][from].slice();
    if (!uids.length) return;
    if (from === "hand") events.push({ t: "reveal-hand", p: foe, uids });
    askChoose(state, { player, owner: foe, zone: from, what: "any", uids, min: 1, max: 1, effect: { op: "toPrizes" } });
  },
  /**
   * "Move all damage counters from this Pokémon to your opponent's Active Pokémon" (`from` "self"), "... from each of your
   * Pokémon" (`from` "own"; `n`: that many from each, or all of them).
   */
  countersToFoe(ctx, { from = "self", n = 9990 }) {
    const { state, player, defs, events } = ctx;
    const target = state.players[other(player)].active;
    if (!target || ctx.shielded || warded(state, target, { player, src: "attack" }, defs) || countersStay(state)) return;
    const mine = from === "self" ? [[ctx.slot, spotOf(ctx)]] : inPlay(state, player);
    for (const [slot, spot] of mine) {
      const k = Math.min(n, slot.damage);
      if (!k || spot == null) continue;
      slot.damage -= k;
      events.push({ t: "heal", p: player, spot, n: k, why: "move" });
      target.damage += k;
      events.push({ t: "damage", p: other(player), spot: ACTIVE, n: k, why: "move" });
    }
  },
  /** "Double the number of damage counters on each of your opponent's Pokémon." */
  doubleCounters(ctx) {
    const { state, player, defs, events } = ctx;
    const foe = other(player);
    for (const [slot, spot] of inPlay(state, foe)) {
      if (!slot.damage || (spot === ACTIVE && ctx.shielded) || warded(state, slot, { player, src: "attack" }, defs)) continue;
      const n = slot.damage;
      slot.damage += n;
      events.push({ t: "damage", p: foe, spot, n });
    }
  },
  /** "Your opponent may draw a card": theirs to say. */
  foeMayDraw(ctx, { n = 1 }) {
    if (!sideOf(ctx).deck.length) return;
    ctx.state.pending.push({ type: "option", player: other(ctx.player), why: "foeMay", prompt: `Draw ${n === 1 ? "a card" : `${n} cards`}?`, labels: ["Yes", "No"], options: [[{ op: "foeDraw", n }], []] });
  },
  /** "If that card is an Energy card, ... attach that card to this Pokémon": cards just discarded (hit.paid) that fit, onto the attacker. */
  attachPaid(ctx, { what }) {
    const { state, player, defs, events, slot } = ctx;
    const spot = spotOf(ctx);
    const side = state.players[player];
    if (spot == null) return;
    for (const uid of ctx.hit.paid || []) {
      const def = defOf(state, uid, defs);
      if (!fits(def, what) || def.kind !== "energy" || !side.discard.includes(uid) || !energyFits(def, defOf(state, slot.uid, defs))) continue;
      side.discard.splice(side.discard.indexOf(uid), 1);
      slot.energy.push(uid);
      events.push({ t: "attach", p: player, uid, spot, from: "discard" });
    }
  },
  /** "Whenever your opponent flips a coin during their next turn, treat it as tails" (engine.js flip). */
  allTails(ctx) {
    ctx.state.tails = { player: other(ctx.player), turn: ctx.state.turn + 1 };
    ctx.events.push({ t: "mark", p: other(ctx.player), kind: "tails" });
  },
  /** "During your next turn, this Pokémon's attacks do 30 more damage to the Defending Pokémon": a mark on that Pokémon, for this one. */
  prey(ctx, { n }) {
    const target = sideOf(ctx).active;
    if (!target || ctx.shielded) return;
    addMark(ctx.state, target, { kind: "prey", turn: ctx.state.turn + 2, n, from: ctx.slot.uid });
    ctx.events.push({ t: "mark", p: ctx.player, kind: "stronger", n });
  },
  /** "For the rest of this game, your opponent can't use any GX attacks." */
  barGx(ctx) {
    sideOf(ctx).gxBarred = true;
    ctx.events.push({ t: "mark", p: other(ctx.player), kind: "noGx" });
  },
  /** "Discard random cards from your opponent's hand until they have 2 cards in their hand" (`random`; else they choose which). */
  foeHandDownTo(ctx, { n, random = true }) {
    const side = sideOf(ctx);
    const k = side.hand.length - n;
    if (k <= 0) return;
    if (random) return OPS.foeHandRandom(ctx, { n: k });
    askChoose(ctx.state, { player: other(ctx.player), zone: "hand", what: "any", uids: side.hand.slice(), min: k, max: k, effect: { op: "discard" } });
  },
  /** "Your opponent chooses 2 cards from their hand and shuffles those cards into their deck" (`to` "deck"; "bottom": on the bottom). */
  foeChoosesHand(ctx, { n = 1, to = "deck" }) {
    const side = sideOf(ctx);
    if (!side.hand.length) return;
    askChoose(ctx.state, { player: other(ctx.player), zone: "hand", what: "any", uids: side.hand.slice(), min: Math.min(n, side.hand.length), max: n, effect: { op: "toBottom" }, ...(to === "deck" ? { shuffle: true } : {}) });
  },
  /** "Discard all Pokémon Tools and Special Energy from all of your opponent's Pokémon." */
  // `tools`, `special`: what goes (both unless the text names one); `active`: from their Active Pokémon only.
  stripFoeAll(ctx, { tools = true, special = true, active = false }) {
    const { state, player, defs, events } = ctx;
    const foe = other(player);
    const side = state.players[foe];
    for (const [slot, spot] of inPlay(state, foe)) {
      if ((active && spot !== ACTIVE) || (spot === ACTIVE && ctx.shielded) || warded(state, slot, { player, src: "attack" }, defs)) continue;
      if (slot.tool && tools) {
        for (const uid of takeTools(slot)) {
          toolGone(state, foe, uid, defs);
          events.push({ t: "discard-tool", p: foe, spot, uid });
        }
      }
      const gone = special ? slot.energy.filter((uid) => !defOf(state, uid, defs).basic) : [];
      if (!gone.length) continue;
      slot.energy = slot.energy.filter((uid) => !gone.includes(uid));
      side.discard.push(...gone);
      events.push({ t: "discard-energy", p: foe, spot, uids: gone });
    }
  },
  /**
   * "The Defending Pokémon has no Abilities until the end of your next turn" (`kinds` "Ability", for this turn and the
   * next two), "... can't use any Poké-Powers during your opponent's next turn" ("Poké-Power", for their turn): engine.js ownAbility.
   */
  mute(ctx, { kinds, turns }) {
    const slot = ctx.state.players[other(ctx.player)].active;
    if (!slot || ctx.shielded) return;
    for (const k of turns) addMark(ctx.state, slot, { kind: "noAbility", turn: ctx.state.turn + k, from: kinds });
    ctx.events.push({ t: "mark", p: other(ctx.player), kind: "noAbility", name: kinds, mine: turns.includes(2) });
  },
  /** "Knock Out each of your opponent's Pokémon that has 50 HP or less remaining" (`pick`: "1 of them", the attacker's choice). */
  knockOutLow(ctx, { hp, pick = false }) {
    const { state, player, defs } = ctx;
    const foe = other(player);
    const spots = inPlay(state, foe).filter(([slot, spot]) => !(spot === ACTIVE && ctx.shielded) && !warded(state, slot, { player, src: "attack" }, defs) && hpLeft(state, slot, defs) > 0 && hpLeft(state, slot, defs) <= hp).map(([, spot]) => spot);
    if (!spots.length) return;
    if (pick) return askPick(state, { player, side: foe, spots, left: 1, effect: { op: "knockOut" } });
    for (const spot of spots) {
      const slot = slotAt(state, foe, spot);
      slot.damage = Math.max(slot.damage, maxHp(state, slot, defs));
    }
  },
  /** "Heal from this Pokémon 20 damage for each Plasma Energy attached to this Pokémon" (COUNTS). */
  healPer(ctx, { n, per, type = "" }) {
    OPS.healSelf(ctx, { n: n * COUNTS[per](ctx, type) });
  },
  /** "This Pokémon is Knocked Out." (not by damage: an effect of its own attack). */
  selfKo(ctx) {
    const { state, slot, defs } = ctx;
    if (spotOf(ctx) == null) return;
    slot.damage = Math.max(slot.damage, maxHp(state, slot, defs));
  },
  /** "Remove all Special Conditions from the Defending Pokémon." (`kind`: only that one: "If the Defending Pokémon is Asleep, it is no longer Asleep"). */
  cureFoe(ctx, { kind = "" }) {
    const slot = ctx.state.players[other(ctx.player)].active;
    if (!slot || ctx.shielded) return;
    const kinds = conditionsOn(slot).filter((k) => !kind || k === kind);
    if (!kinds.length) return;
    for (const k of kinds) ctx.events.push({ t: "cure", p: other(ctx.player), kind: k });
    if (!kind) return void delete slot.status;
    if (kind === "poisoned" || kind === "burned") slot.status[kind] = false;
    else slot.status.main = "";
  },
  /** "Heal 120 damage from 1 of your Benched Psychic Pokémon" (the player's pick), "... from each of your Basic Pokémon" (`each`). */
  healKind(ctx, { n, what = "pokemon", bench = false, each = false }) {
    const { state, player, defs, events } = ctx;
    const spots = inPlay(state, player).filter(([slot, spot]) => (!bench || spot !== ACTIVE) && fits(defOf(state, slot.uid, defs), what) && healRoom(state, slot) > 0).map(([, spot]) => spot);
    if (!spots.length) return;
    if (!each) return askPick(state, { player, side: player, spots, left: 1, effect: { op: "heal", n } });
    for (const spot of spots) {
      const slot = slotAt(state, player, spot);
      const healed = Math.min(healMore(state, n), healRoom(state, slot));
      slot.damage -= healed;
      slot.healedOn = state.turn;
      events.push({ t: "heal", p: player, spot, n: healed });
    }
  },
  /** "Both Active Pokémon are Knocked Out." */
  knockOutBoth(ctx) {
    OPS.knockOut(ctx);
    if (spotOf(ctx) === ACTIVE) ctx.slot.damage = Math.max(ctx.slot.damage, maxHp(ctx.state, ctx.slot, ctx.defs));
  },
  /** "Knock Out 1 of your opponent's Pokémon that has exactly 6 damage counters on it." */
  knockOutCounted(ctx, { k }) {
    const { state, player, defs } = ctx;
    const foe = other(player);
    const spots = inPlay(state, foe).filter(([slot, spot]) => slot.damage === k * 10 && !(spot === ACTIVE && ctx.shielded) && !warded(state, slot, { player, src: "attack" }, defs) && hpLeft(state, slot, defs) > 0).map(([, spot]) => spot);
    if (spots.length) askPick(state, { player, side: foe, spots, left: 1, effect: { op: "knockOut" } });
  },
  /** "Prevent all effects of attacks, including damage, done to each of your Pokémon during your opponent's next turn." */
  shieldAll(ctx) {
    for (const [slot] of inPlay(ctx.state, ctx.player)) addMark(ctx.state, slot, { kind: "shield", turn: ctx.state.turn + 1 });
    ctx.events.push({ t: "mark", p: ctx.player, kind: "shield" });
  },
  /** When the attack may be used for another cost (export altCost): nothing to do when it is used. */
  costIf() {},
  /**
   * "You may discard all Energy from this Pokémon. If you do, ...": after the damage, a yes or no, asked only when
   * the price can be paid; yes pays it and then does the rest.
   */
  mayDo(ctx, { steps, then, prompt }) {
    if (!readyFx(ctx, steps)) return;
    ctx.state.pending.push({ type: "option", player: ctx.player, why: "mayDo", prompt, labels: ["Yes", "No"], options: [[{ op: "fx", steps: [...steps, ...then], uid: ctx.slot.uid }], []] });
  },
  /** "Each player draws cards until they have 7 cards in their hand." */
  drawToBoth(ctx, { n }) {
    for (const p of [ctx.player, other(ctx.player)]) {
      const side = ctx.state.players[p];
      const drawn = side.deck.splice(0, Math.max(0, n - side.hand.length));
      if (!drawn.length) continue;
      side.hand.push(...drawn);
      ctx.events.push({ t: "draw", p, uids: drawn });
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
  if ((m2 = p.match(/^([A-Z][\w'.é-]*(?: [A-Z][\w'.é-]*)+) cards? in your discard pile$/)) && !/\b(?:Trainer|Supporter|Item|Energy|Pokémon|Stadium|Tool)\b/.test(m2[1])) return { per: "discardKind", type: `trainer=${m2[1]}` };
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
  return per ? { per: per[1], type: "" } : moreCounts(p);
}

/** Energy on Pokémon, as COUNTS.energyKind's "on" names them. */
const ENERGY_ON = {
  "this Pokémon": "self",
  [OPP]: "foe",
  "both Active Pokémon": "both",
  [`this Pokémon and ${OPP}`]: "both",
  "all of the Active Pokémon (both yours and your opponent's)": "both",
  "all of your Pokémon": "own",
  "all of your Pokémon (including this Pokémon)": "own",
  "your Pokémon": "own",
  "all of your opponent's Pokémon": "foes",
  "all Pokémon in play": "all",
  "all of your Active Pokémon": "self",
};

/** More of what "for each ..." counts (countOf): Pokémon of a kind, Energy cards of a kind, types of Energy. */
function moreCounts(p) {
  let m;
  if ((m = p.match(/^(?:of )?your Pokémon that has "(.+?)" in its name that has any damage counters on it$/))) return { per: "ownDamagedKind", type: `pokemon~${m[1]}` };
  if (/^Pokémon Tools? attached to all Pokémon$/.test(p)) return { per: "allTools", type: "" };
  if ((m = p.match(/^(?:of )?your Benched Pokémon that has "(.+?)" in its name$/))) return { per: "benchKind", type: `pokemon~${m[1]}` };
  if ((m = p.match(/^(?:of )?your Benched Pokémon that has a maximum HP of (\d+)$/))) return { per: "benchKind", type: `pokemon@${m[1]}` };
  if ((m = p.match(/^Pokémon in play that has "(.+?)" or "(.+?)" in its name \(both yours and your opponent's\)$/))) return { per: "allKind", type: `pokemon~${m[1]}|pokemon~${m[2]}` };
  if ((m = p.match(/^Supporter cards? that has "(.+?)" in its name in your discard pile$/))) return { per: "discardKind", type: `supporter~${m[1]}` };
  if ((m = p.match(/^Basic Energy attached to (.+)$/)) && ENERGY_ON[m[1]]) return { per: "energyKind", type: `${ENERGY_ON[m[1]]}|basic` };
  if ((m = p.match(new RegExp(`^${TYPE} Energy attached to all of your (.+)$`))) && monWhat(m[2]) && m[2] !== "Pokémon") return { per: "kindEnergy", type: `${m[1]}|${monWhat(m[2])}` };
  // The Lost Zone.
  if (/^(?:of )?your Pokémon, except (?:◇|p) \(Prism Star\) Pokémon, in the Lost Zone$/.test(p)) return { per: "lostNoPrism", type: "" };
  if (/^(?:of )?your Pokémon in the Lost Zone$/.test(p)) return { per: "lostKind", type: "pokemon" };
  if (/^Pokémon Tool cards? in the Lost Zone \(both yours and your opponent's\)$/.test(p)) return { per: "lostBoth", type: "tool" };
  // Energy on Pokémon: "basic Energy attached to this Pokémon", "Special Energy card attached to ...", "Fire Energy and each Lightning Energy ...".
  if ((m = p.match(/^(?:different )?types? of basic Energy(?: cards?)? attached to (.+)$/i)) && ENERGY_ON[m[1]]) return { per: "energyTypes", type: ENERGY_ON[m[1]] };
  if ((m = p.match(new RegExp(`^(basic |Special )?(?:${TYPE} )?Energy(?: cards?)? attached to (.+)$`))) && ENERGY_ON[m[3]]) {
    const on = ENERGY_ON[m[3]];
    if (m[1]) return { per: "energyKind", type: `${on}|${m[1] === "basic " ? "basic" : "special"}${m[2] ? `:${m[2]}` : ""}` };
    const per = { self: "selfEnergy", foe: "foeEnergy", both: "bothEnergy", own: "ownAllEnergy", foes: "foeAllEnergy", all: "allEnergy" }[on];
    return { per, type: m[2] || "" };
  }
  if ((m = p.match(/^([A-Z][\w']*(?: [A-Z][\w']*)* Energy)(?: cards?)? attached to (.+)$/)) && ENERGY_ON[m[2]] && !new RegExp(`^(?:Basic |Special )?(?:${TYPE} )?Energy$`).test(m[1])) return { per: "energyKind", type: `${ENERGY_ON[m[2]]}|name=${m[1]}` };
  if ((m = p.match(new RegExp(`^basic ${TYPE} and basic ${TYPE} Energy(?: cards?)? attached to (.+)$`))) && ENERGY_ON[m[3]]) return { per: "energyKind", type: `${ENERGY_ON[m[3]]}|basic:${m[1]},${m[2]}` };
  if ((m = p.match(new RegExp(`^(?:basic )?${TYPE} (?:Energy )?and (?:each |basic )?${TYPE} Energy attached to (.+)$`))) && ENERGY_ON[m[3]] && !/basic/.test(p)) {
    const per = { self: "selfEnergy", foe: "foeEnergy", both: "bothEnergy", own: "ownAllEnergy", foes: "foeAllEnergy", all: "allEnergy" }[ENERGY_ON[m[3]]];
    return { per, type: `${m[1]},${m[2]}` };
  }
  if ((m = p.match(new RegExp(`^Colorless Energy in ${OPP}'s Retreat Cost \\(after applying effects to (?:the )+Retreat Cost\\)$`)))) return { per: "foeRetreat", type: "" };
  if (/^Prize cards? both players have taken$/.test(p)) return { per: "bothPrizesTaken", type: "" };
  if (/^damage counters? on all of your opponent's Pokémon$/.test(p)) return { per: "foeAllCounters", type: "" };
  if (/^Special Conditions? affecting this Pokémon$/.test(p)) return { per: "selfConditions", type: "" };
  if (/^Trainer cards? in your opponent's hand$/.test(p)) return { per: "foeHandTrainers", type: "" };
  if (/^Pokémon in play \(both yours and your opponent's\), excluding this Pokémon$/.test(p)) return { per: "allOthers", type: "" };
  if (/^Pokémon in play your opponent has more than you$/.test(p)) return { per: "foeMore", type: "" };
  if (/^Pokémon your opponent has in play$/.test(p)) return { per: "foeInPlay", type: "" };
  if (/^Pokémon (?:you have )?on your Bench$/.test(p)) return { per: "ownBench", type: "" };
  if (/^Pokémon you have in play$/.test(p)) return { per: "ownInPlay", type: "" };
  if ((m = p.match(new RegExp(`^(?:of )?your Benched Pokémon that has any ${TYPE} Energy attached(?: to it)?$`)))) return { per: "benchWith", type: m[1] };
  if ((m = p.match(/^damage counters? on (?:all of |each of )?your (.+)$/)) && monWhat(m[1].replace(/^Benched /, ""))) {
    const what = monWhat(m[1].replace(/^Benched /, ""));
    return /^Benched /.test(m[1]) ? { per: "benchCounters", type: what } : { per: "ownCounters", type: what };
  }
  // Pokémon of a kind: "of your Benched Fire Pokémon", "Darkness Pokémon you have in play", "of your opponent's Pokémon ex in play".
  const kinds = [
    [/^(?:of )?your Benched (.+)$/, "benchKind"],
    [/^(.+) (?:you have )?on your Bench$/, "benchKind"],
    [/^(?:of )?your opponent's Benched (.+)$/, "foeBenchKind"],
    [/^(.+) on your opponent's Bench$/, "foeBenchKind"],
    [/^(?:of )?your opponent's (.+?)(?: in play)?$/, "foeKind"],
    [/^(.+) your opponent has in play$/, "foeKind"],
    [/^(.+) in play \(both yours and your opponent's\)$/, "allKind"],
    [/^(?:of )?your (.+?)(?: in play)?$/, "ownKind"],
    [/^(.+) you have in play$/, "ownKind"],
  ];
  for (const [re, per] of kinds) {
    const k = p.match(re);
    const what = k && monWhat(k[1]);
    if (what) return { per, type: what };
  }
  if ((m = p.match(/^(.+) in your discard pile$/)) && monWhat(m[1])) return { per: "discardKind", type: monWhat(m[1]) };
  if ((m = p.match(/^(Special Energy) cards? in (your|your opponent's) discard pile$/))) return { per: m[2] === "your" ? "discardKind" : "foeDiscardKind", type: "specialEnergy" };
  return null;
}

/**
 * Pokémon named by kind ("Fire Pokémon", "Benched Basic Pokémon", "Rapid Strike Pokémon", "Pokémon ex", "Team Rocket's Pokémon",
 * "Magikarp"): a card kind as trainers.js fits reads it, or "".
 */
function monWhat(words) {
  let m;
  if (words === "Pokémon") return "pokemon";
  if ((m = words.match(/^(.+?) Pokémon and (.+? Pokémon)$/)) && monWhat(`${m[1]} Pokémon`) && monWhat(m[2])) return `${monWhat(`${m[1]} Pokémon`)}|${monWhat(m[2])}`;
  if ((m = words.match(new RegExp(`^${POKE_TYPE} Pokémon$`)))) return `pokemon:${m[1]}`;
  if (/^Basic Pokémon$/.test(words)) return "basic";
  if (/^(?:Evolution|Evolved) Pokémon$/.test(words)) return "evolution";
  if ((m = words.match(new RegExp(`^(?:Evolution|Evolved) ${POKE_TYPE} Pokémon$`)))) return `evolution:${m[1]}`;
  if ((m = words.match(/^Stage (1|2)(?: Evolved)? Pokémon$/))) return `stage${m[1]}`;
  if ((m = words.match(/^(Rapid Strike|Single Strike|Fusion Strike|Team Plasma|Ancient|Future|TAG TEAM) Pokémon$/))) return `+${m[1]}`;
  if (/^Pokémon SP$/.test(words)) return "+SP";
  if (/^Ultra Beasts?$/.test(words)) return "+Ultra Beast";
  if ((m = words.match(/^([A-Z][\w.]*(?: [A-Z][\w.]*)?'s) Pokémon$/))) return `pokemon~${m[1]}`;
  if (BOXES[words]) return BOXES[words].map((b) => `box=${b}`).join("|");
  if ((m = words.match(new RegExp(`^Stage (1|2) ${POKE_TYPE} Pokémon$`)))) return `stage${m[1]}&&pokemon:${m[2]}`;
  if (words === "Tera Pokémon") return "tera";
  if ((m = words.match(/^([A-Z][\w.'é♀♂-]*) ex$/u))) return `name=${m[1]} ex`;
  if ((m = words.match(/^Pokémon that has "(.+?)" in its name$/))) return `pokemon~${m[1]}`;
  if ((m = words.match(/^(.+?) and (.+)$/)) && monWhat(m[1]) && monWhat(m[2])) return `${monWhat(m[1])}|${monWhat(m[2])}`;
  // A name: "Magikarp", "Dark Magneton" (no kind words in it).
  if (/^[A-Z][\w.'é♀♂-]*(?: [A-Z][\w.'é♀♂-]*)?$/u.test(words) && !/\b(?:Pokémon|Energy|Trainer|Supporter|Item|Stadium|Prize|Bench|Basic|Evolution)\b/.test(words)) return `name=${words}`;
  return "";
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
  if (/^your opponent has a Stadium(?: card)? in play$/.test(p)) return { test: "stadium", foe: true };
  if (/^this Pokémon has a Pokémon Tool(?: card)? attached(?: to it)?$/.test(p)) return { test: "selfTool" };
  if (new RegExp(`^${OPP} has a Pokémon Tool(?: card)? attached(?: to it)?$`).test(p)) return { test: "foeTool" };
  if (/^this Pokémon has any Special Energy attached(?: to it)?$/.test(p)) return { test: "selfSpecial" };
  if ((m = p.match(new RegExp(`^this Pokémon has any ${TYPE} Energy attached(?: to it)?$`)))) return { test: "selfEnergyType", type: m[1] };
  if (/^you have the same number of cards in your hand as your opponent$/.test(p)) return { test: "hands", how: "same" };
  if (/^you have more cards in your hand than your opponent$/.test(p)) return { test: "hands", how: "more" };
  if (/^you (?:have no cards|don't have any cards) in your hand$/.test(p)) return { test: "hands", how: "none" };
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
  if ((m = p.match(new RegExp(`^this Pokémon has at least 1 extra ${TYPE}, ${TYPE}, and ${TYPE} Energy attached(?: to it)? \\(in addition to this attack's cost\\)$`)))) return { test: "spareEach", types: [m[1], m[2], m[3]] };
  if ((m = p.match(new RegExp(`^this Pokémon has at least 1 extra ${TYPE} Energy and 1 extra ${TYPE} Energy attached(?: to it)? \\(in addition to this attack's cost\\)$`)))) return { test: "spareEach", types: [m[1], m[2]] };
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
  return moreTests(p);
}

/** More of what "If ..." asks (testOf). */
function moreTests(p) {
  let m;
  const what = (words) => monWhat(words.replace(/^(?:any|an?) /, ""));
  if ((m = p.match(/^you have any (.+?) cards? in the Lost Zone$/)) && whatOf(`${m[1]} card`)) return { test: "lostHas", what: whatOf(`${m[1]} card`) };
  if ((m = p.match(/^there are any (.+?) cards in your discard pile$/)) && whatOf(`${m[1]} card`)) return { test: "discardHas", what: whatOf(`${m[1]} card`) };
  if (/^you have less Prize cards left than your opponent$/.test(p)) return { test: "ahead" };
  if ((m = p.match(/^a Stadium that has "(\w+)" in its name is in play$/))) return { test: "stadiumNamed", word: m[1] };
  if ((m = p.match(/^any Stadium card with (\w+) in its name is in play$/))) return { test: "stadiumNamed", word: m[1] };
  // Stadiums the attacks name (Pokémon named this way are a different test, so only these).
  if ((m = p.match(/^(Full Flame|Low Pressure System|High Pressure System|Phoebe's Stadium|Lysandre Labs) is in play$/))) return { test: "stadiumNamed", word: m[1] };
  if ((m = p.match(/^your Benched Pokémon have any ([A-Z][\w']*(?: [A-Z][\w']*)* Energy) attached$/))) return { test: "benchEnergyNamed", name: m[1] };
  if ((m = p.match(new RegExp(`^this Pokémon (?:isn't|is not) ${COND}$`)))) return { test: "selfStatusOf", kinds: [m[1].toLowerCase()], not: true };
  if (new RegExp(`^this Pokémon and ${OPP} have the same amount of Energy attached$`).test(p)) return { test: "sameEnergy" };
  if ((m = p.match(/^this Pokémon has any (Plasma Energy) attached to it$/))) return { test: "energyCard", name: m[1] };
  if ((m = p.match(/^you have (?:any )?(.+?) (in play|on your Bench)$/)) && what(m[1])) return { test: "ownHasKind", what: what(m[1]), ...(/Bench/.test(m[2]) ? { bench: true } : {}) };
  if ((m = p.match(/^(.+?) is on your Bench$/)) && /^name=/.test(what(m[1]))) return { test: "ownHasKind", what: what(m[1]), bench: true };
  if ((m = p.match(/^your opponent has (any|no) (.+?) in play$/)) && what(m[2])) return { test: "foeHasKind", what: what(m[2]), ...(m[1] === "no" ? { not: true } : {}) };
  if ((m = p.match(/^your opponent has (.+?) in play$/)) && /^name=/.test(what(m[1]))) return { test: "foeHasKind", what: what(m[1]) };
  if ((m = p.match(new RegExp(`^${OPP} is (?:an? )?(Tera Pokémon|Pokémon V or (?:a )?Pokémon-GX|Pokémon VMAX|Team Plasma Pokémon|Single Strike Pokémon|Rapid Strike Pokémon|Fusion Strike Pokémon)$`)))) {
    const w = m[1] === "Tera Pokémon" ? "tera" : /or/.test(m[1]) ? "box=V|box=VMAX|box=VSTAR|box=GX" : what(m[1]);
    return w === "tera" ? { test: "foeIs", what: "tera" } : { test: "foeIs", what: w };
  }
  if ((m = p.match(new RegExp(`^${OPP} (?:has|already has) any Special Energy(?: cards?)? attached(?: to it)?$`)))) return { test: "foeHasSpecial" };
  if ((m = p.match(/^this Pokémon has (?:any|an?) (Special Energy|[A-Z][\w']*(?: [A-Z][\w']*)* Energy)(?: cards?)? attached(?: to it)?$/)) && !new RegExp(`^(?:Basic )?${TYPE} Energy$`).test(m[1])) {
    return m[1] === "Special Energy" ? { test: "selfSpecial" } : { test: "energyCard", name: m[1] };
  }
  if ((m = p.match(/^(you have|your opponent has) only (\d+) Prize cards? (?:left|remaining)$/))) return { test: "prizesAtMost", k: Number(m[2]), ...(m[1] === "you have" ? {} : { foe: true }) };
  if ((m = p.match(new RegExp(`^this Pokémon is ${COND}$`)))) return { test: "selfStatusOf", kinds: [m[1].toLowerCase()] };
  if ((m = p.match(new RegExp(`^${OPP} (?:isn't|is not) ${COND}$`)))) return { test: "foeStatus", kind: m[1].toLowerCase(), not: true };
  if (/^you have used your GX attack$/.test(p)) return { test: "gxUsed" };
  if ((m = p.match(/^you have at least (\d+) Energy in play$/))) return { test: "ownEnergyAtLeast", k: Number(m[1]) };
  if (new RegExp(`^${OPP} has an Ability$`).test(p)) return { test: "foeAbilityOn" };
  if (/^you have fewer Pokémon in play than your opponent$/.test(p)) return { test: "fewerInPlay" };
  if ((m = p.match(/^this Pokémon evolved (?:from ([A-Z][\w.'é♀♂ -]*?) )?during this turn$/))) return { test: "evolvedNow", ...(m[1] ? { from: m[1] } : {}) };
  if ((m = p.match(/^you played (.+?) from your hand during this turn$/))) {
    const tag = m[1].match(/^an? (Ancient|Future|Rapid Strike|Single Strike|Fusion Strike) Supporter card$/);
    const w = tag ? `supporter+${tag[1]}` : /^[A-Z][\w.'é-]*(?: [A-Z][\w.'é-]*)*$/.test(m[1]) && !/\b(?:Supporter|Item|Trainer|card)\b/.test(m[1]) ? `trainer=${m[1]}` : "";
    if (w) return { test: "played", what: w };
  }
  if ((m = p.match(/^you have (\d+) or more (.+?) in your discard pile$/))) {
    const w = whatOf(m[2].replace(/s$/, "")) || what(m[2]);
    if (w) return { test: "discardAtLeast", k: Number(m[1]), what: w };
  }
  if (new RegExp(`^${OPP} has no Retreat Cost$`).test(p)) return { test: "foeNoRetreat" };
  if (/^this Pokémon has full HP$/.test(p)) return { test: "selfDamaged", not: true };
  if (new RegExp(`^${OPP} (?:isn't|is not) an? (?:Evolved|Evolution) Pokémon$`).test(p)) return { test: "foeStage", stage: "evolution", not: true };
  if ((m = p.match(new RegExp(`^${OPP} (?:already )?has (\\d+) or more damage counters on it$`)))) return { test: "foeCountersAtLeast", k: Number(m[1]) };
  if ((m = p.match(/^you (don't )?have the same number of cards in your hand as your opponent$/))) return { test: "hands", how: "same", ...(m[1] ? { not: true } : {}) };
  if (/^your Bench is full$/.test(p)) return { test: "ownBenchFull" };
  if ((m = p.match(/^1 of your other (.+?) used an attack during your last turn$/)) && what(m[1])) return { test: "otherUsed", what: what(m[1]) };
  if ((m = p.match(/^the total of both players' remaining Prize cards is (\d+) or less$/))) return { test: "bothPrizesAtMost", k: Number(m[1]) };
  if ((m = p.match(/^(you have|your opponent has) exactly ((?:\d+, )*\d+,? or \d+) Prize cards remaining$/))) return { test: "prizesIn", ks: m[2].split(/,? or |, /).map(Number), ...(m[1] === "you have" ? {} : { foe: true }) };
  if ((m = p.match(/^your opponent doesn't have exactly (\d+) or (\d+) Prize cards remaining$/))) return { test: "prizesIn", ks: [Number(m[1]), Number(m[2])], foe: true, not: true };
  return batch9Tests(p);
}

/** Still more of what "If ..." asks (testOf). */
function batch9Tests(p) {
  let m;
  if ((m = p.match(new RegExp(`^this Pokémon has (?:at least (\\d+)|(\\d+) or more) (?:${TYPE} )?Energy attached(?: to it)?$`)))) return { test: "selfEnergyAtLeast", k: Number(m[1] || m[2]), ...(m[3] ? { type: m[3] } : {}) };
  if (/^you go second and it's your first turn$/.test(p)) return { test: "secondFirst" };
  if (new RegExp(`^${OPP}'s Retreat Cost is 0$`).test(p)) return { test: "foeNoRetreat" };
  if ((m = p.match(/^this Pokémon used (.+) during your last turn$/))) return { test: "usedLast", name: m[1] };
  if ((m = p.match(new RegExp(`^${OPP} has (?:any |a )?(Poké-Powers or Poké-Bodies|Poké-Power or (?:a )?Poké-Body|Poké-Powers?|Poké-Bod(?:y|ies))$`)))) {
    return { test: "foePowers", kinds: [/Power/.test(m[1]) ? "Poké-Power" : "", /Bod/.test(m[1]) ? "Poké-Body" : ""].filter(Boolean) };
  }
  if ((m = p.match(/^any of your Benched (.+?) have any damage counters on them$/)) && monWhat(m[1])) return { test: "benchDamagedKind", what: monWhat(m[1]) };
  if (/^you have (?:a|any) Stadium card in play$/i.test(p)) return { test: "stadium", own: true };
  if (/^you don't have a Stadium card in play$/.test(p)) return { test: "stadium", own: true, not: true };
  if (/^there is no Stadium card in play$/.test(p)) return { test: "stadium", not: true };
  if (/^there is any Stadium card in play$/i.test(p)) return { test: "stadium" };
  if ((m = p.match(new RegExp(`^${OPP} is ([A-Z][\\w.'é♀♂-]*(?: [A-Z][\\w.'é♀♂-]*)?)$`))) && !new RegExp(`^${POKE_TYPE}$`).test(m[1]) && /^name=/.test(monWhat(m[1]))) return { test: "foeIs", what: monWhat(m[1]) };
  if ((m = p.match(/^your opponent has (\d+) or more Benched Pokémon$/))) return { test: "foeBenchAtLeast", k: Number(m[1]) };
  if (new RegExp(`^${OPP} is a TAG TEAM$`).test(p)) return { test: "foeIs", what: "+TAG TEAM" };
  if (/^your opponent has already used their GX attack$/.test(p)) return { test: "foeGxUsed" };
  // "If 1 of your Pokémon used Bubble during your last turn": any of them, this one too (`who` "*").
  if ((m = p.match(/^1 of your ([A-Z][\w.'é♀♂ -]*?) used ([A-Z].+) during your last turn$/))) return { test: "usedLast", name: m[2], who: m[1] === "Pokémon" ? "*" : m[1] };
  return stdTests(p);
}

/** What the last Standard attacks ask (testOf). */
function stdTests(p) {
  let m;
  const NAME = "[A-Z][\\w.'é♀♂-]*";
  if (/^this Pokémon didn't move from the Bench to the Active Spot during this turn$/.test(p)) return { test: "movedUp", not: true };
  if ((m = p.match(new RegExp(`^you don't have (${NAME})(?: and (${NAME}))? on your Bench$`)))) return m[2] ? { test: "ownHasAll", names: [m[1], m[2]], bench: true, not: true } : { test: "ownHasKind", what: `name=${m[1]}`, bench: true, not: true };
  if ((m = p.match(new RegExp(`^(${NAME}) and (${NAME}) are on your Bench$`)))) return { test: "ownHasAll", names: [m[1], m[2]], bench: true };
  if ((m = p.match(/^a Pokémon that has "(.+?)" in its name is on your Bench$/))) return { test: "ownHasKind", what: `pokemon~${m[1]}`, bench: true };
  if ((m = p.match(/^you don't have (\d+) or more (.+?) in your discard pile$/))) {
    const w = whatOf(m[2].replace(/s$/, "")) || monWhat(m[2]);
    return w ? { test: "discardAtLeast", k: Number(m[1]), what: w, not: true } : null;
  }
  if ((m = p.match(/^you have (\d+) or more Pokémon that have the (.+) Ability in your discard pile$/))) return { test: "discardAtLeast", k: Number(m[1]), what: `ability=${m[2]}` };
  if ((m = p.match(/^you played a Supporter card that has "(.+?)" in its name from your hand during this turn$/))) return { test: "played", what: `supporter~${m[1]}` };
  if ((m = p.match(/^([A-Z][\w.'é-]*(?: [A-Z][\w.'é-]*)+) is in your discard pile$/))) return { test: "discardHas", what: `card=${m[1]}` };
  if ((m = p.match(/^this Pokémon has no ([A-Z][\w']*(?: [A-Z][\w']*)* Energy) attached(?: to it)?$/))) return { test: "energyCard", name: m[1], not: true };
  if ((m = p.match(/^you have (\d+) or more Energy in play$/))) return { test: "ownEnergyAtLeast", k: Number(m[1]) };
  if (new RegExp(`^this Pokémon has more Energy attached(?: to it)? than ${OPP}$`).test(p)) return { test: "moreEnergy" };
  if ((m = p.match(new RegExp(`^the Retreat Cost of ${OPP} is ((?:Colorless)+) or more$`)))) return { test: "foeRetreatAtLeast", k: m[1].length / 9 };
  if (/^any of your Pokémon in play are the same type as any of your opponent's Pokémon in play$/.test(p)) return { test: "sharedType" };
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

/**
 * One half of a Miracle Sphere's attack (after "If the Pokémon using this attack has A and B basic Energy cards attached
 * to it, "): { n: more damage, steps: after the damage }, or null.
 */
function sphereClause(words) {
  const more = words.match(/^this attack does \d+ damage plus (\d+) more damage and (.+)$/);
  const n = more ? Number(more[1]) : 0;
  const rest = more ? more[2] : words;
  let m;
  if ((m = rest.match(new RegExp(`^(?:the Defending Pokémon|${FOE}) is now ${COND}(?: and ${COND})?$`, "i")))) return { n, steps: [cond(m[1]), ...(m[2] ? [cond(m[2])] : [])] };
  if ((m = rest.match(/^remove (\d+) damage counters from the Pokémon that Miracle (?:Plate|Sphere) [αβγ] is attached to$/))) return { n, steps: [{ op: "healSelf", n: Number(m[1]) * 10 }] };
  if ((m = rest.match(/^lets you put (\d+) damage counters? on each of your opponent's Benched Pokémon$/))) return { n, steps: [{ op: "counters", n: Number(m[1]) * 10, where: "bench" }] };
  if (/^choose an Energy card attached to the Defending Pokémon, if any, and your opponent shuffles that card into his or her deck$/.test(rest)) return { n, steps: [{ op: "foeEnergyToDeck" }] };
  return null;
}

/** [wording, steps]. A text compiles only when its sentences are all read. */
const PATTERNS = [
  // Miracle Sphere α, β, γ: two pairs of basic Energy cards, each with what it does (both, with both pairs).
  [new RegExp(`^If the Pokémon using this attack has ${POKE_TYPE} and ${POKE_TYPE} basic Energy cards attached to it, (.+?)\\. If the Pokémon using this attack has ${POKE_TYPE} and ${POKE_TYPE} basic Energy cards attached to it, (.+)\\.$`), (m) => {
    const halves = [[[m[1], m[2]], sphereClause(m[3])], [[m[4], m[5]], sphereClause(m[6])]];
    if (halves.some(([, c]) => !c)) return null;
    return halves.flatMap(([types, c]) => [
      ...(c.n ? [{ op: "bonusIf", when: "before", n: c.n, test: "basicPair", types }] : []),
      { op: "when", when: "after", test: "basicPair", types, steps: c.steps.map(({ when, ...step }) => step) },
    ]);
  }],
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
    return count(m[1]) > 1 && /^(basicEnergy|energy)(:\w+)?$/.test(what) ? fromDeck([{ op: "attachPick", zone: "discard", what, to: m[3] ? "bench" : "any", n: count(m[1]), exact: true }]) : null;
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
  // Mega Rayquaza Cap's Delta Gift.
  [/^For each of your Pokémon that has an? (.+?) attached, search your deck for a Basic Energy card and attach it to that Pokémon\. Then, shuffle your deck\.$/, (m) => fromDeck([{ op: "toolGift", tool: m[1], what: "basicEnergy" }])],
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
  // Damage for each card of a kind in the discard pile, then those cards back into the deck.
  [/^(.+? for each .+? in your discard pile\.) Then, shuffle those cards into your deck\.$/, (m) => {
    const first = compileOne(m[1]);
    return first?.length === 1 && first[0].op === "bonusPer" && first[0].per === "discardKind" && [...first, { op: "discardToDeck", when: "after", what: first[0].type }];
  }],
  // A look at the top of a deck, and what may come of it.
  [/^Shuffle your opponent's deck\.$/, () => [{ op: "foeShuffleDeck", when: "after" }]],
  [new RegExp(`^Discard the top ${N}? ?cards? from your opponent's deck\\.$`, "i"), (m) => [{ op: "mill", when: "after", n: m[1] ? count(m[1]) : 1 }]],
  [/^Look at the top card of (your|your opponent's) deck\.( You may discard (?:that|it|the) card\.)?$/, (m) => (m[1] === "your" && !m[2] ? null : [{ op: "lookTop", when: "after", ...(m[1] === "your" ? { mine: true } : {}), ...(m[2] ? { drop: true } : {}) }])],
  [new RegExp(`^Look at the top ${N} cards of your deck(?:\\. You may|,? and(?: you may)?) put any number of (.+?) you find there onto your Bench\\. Shuffle the other cards back into your deck\\.$`, "i"), (m) => {
    // Only Basic Pokémon can go onto the Bench.
    const what = m[2] === "Pokémon" ? "basic" : whatOf(m[2]);
    return what && /^basic(?=$|[:@!])/.test(what) && fromDeck([{ op: "search", what, n: "all", to: "bench", top: count(m[1]) }]);
  }],
  [new RegExp(`^Look at the top ${N} cards of your deck(?:\\. Choose| and choose) as many (.+?) as you like and put them onto your Bench\\. Shuffle the other cards back into your deck\\.$`, "i"), (m) => {
    const what = whatOf(m[2]);
    return what && /^basic(?=$|[:@!])/.test(what) && fromDeck([{ op: "search", what, n: "all", to: "bench", top: count(m[1]) }]);
  }],
  [new RegExp(`^Look at the top ${N} cards of your deck(?:\\. You may| and) attach (?:any number of|as many) (.+?) (?:you find there )?(?:as you like )?to (your Pokémon in any way you like|this Pokémon|1 of your Pokémon)\\. Shuffle the other cards back into your deck\\.$`, "i"), (m) => {
    const what = whatOf(m[2].replace(/ you find there$/, ""));
    if (!what || !what.split("|").every((w) => /^(basicEnergy|energy)(:\w+)?$/.test(w))) return null;
    const to = /this/.test(m[3]) ? "self" : /any way/.test(m[3]) ? "spread" : "one";
    return fromDeck([{ op: "fetchEnergy", what, n: 99, to, top: count(m[1]), mix: true }]);
  }],
  [new RegExp(`^Look at the top ${N} cards of your deck, (?:and then )?choose (?:1|one) of (?:them|those cards),? and put it into your hand\\. (?:Shuffle the other cards back into your deck|Shuffle the rest into your deck afterward)\\.$`, "i"), (m) => fromDeck([{ op: "topTake", n: 1, top: count(m[1]), shuffle: true }])],
  // One Energy card for each of some Benched Pokémon (trainers.js energyEach).
  [new RegExp(`^(?:For each of your Benched (.+?), search your deck|Choose (up to )?${N} of your Benched (.+?)\\. For each of those Pokémon, search your deck) for an? (.+?) and attach it to that Pokémon\\. ${SHUFFLED}$`, "i"), (m) => {
    const what = whatOf(m[5]);
    const who = monWhat(m[1] || m[4]);
    if (!/^(basicEnergy|energy)(:\w+)?$/.test(what) || !who) return null;
    return fromDeck([{ op: "energyEach", zone: "deck", what, where: { to: "bench", ...(who !== "pokemon" ? { who } : {}) }, ...(m[1] ? {} : { n: count(m[3]) }) }]);
  }],
  [new RegExp(`^(?:Choose (up to )?${N} of your Benched (.+?) and attach an? (.+?) from your (discard pile|hand) to each of them|Attach an? (.+?) from your (discard pile|hand) to each of your Benched (.+?))\\.$`, "i"), (m) => {
    const what = whatOf(m[4] || m[6]);
    const who = monWhat(m[3] || m[8]);
    if (!/^(basicEnergy|energy)(:\w+)?$/.test(what) || !who) return null;
    const zone = (m[5] || m[7]) === "hand" ? "hand" : "discard";
    return fromDeck([{ op: "energyEach", zone, what, where: { to: "bench", ...(who !== "pokemon" ? { who } : {}) }, ...(m[6] ? { must: true } : { n: count(m[2]), ...(m[1] ? {} : { must: true }) }) }]);
  }],
  // Old searches onto the Bench: "a Basic Pokémon named Bellsprout", "a Fighting Basic Pokémon card", "a Baby Pokémon card".
  [new RegExp(`^Search your deck for (an?|up to ${N}) (.+?) and put (?:it|them) onto your Bench\\. ${SHUFFLED}$`), (m) => {
    const what = benchWhat(m[3].replace(/^an? /, ""));
    return what && fromDeck([{ op: "search", what, n: /^an?$/.test(m[1]) ? 1 : count(m[2]), to: "bench" }]);
  }],
  // When it may be used.
  [/^If you go first, you can use this attack (?:on|during) your first turn\.$/, () => [{ op: "firstTurn", when: "before" }]],
  // "You can use this attack only if ...": the attack isn't offered otherwise (OPS.onlyIf, engine.js tooEarly).
  [/^You can use this attack only if you go second, and only (?:on|during) your first turn\.$/, () => [onlyIf({ test: "secondFirst" }, "only during your first turn, when you go second.")]],
  [/^\(?You can't use this attack if your Bench (?:is|if) (full|empty)\.\)?$/, (m) => [onlyIf({ test: m[1] === "full" ? "ownBenchFull" : "ownBenchEmpty", not: true }, `not while your Bench is ${m[1]}.`)]],
  [/^(?:You can use this attack only if|You can't use this attack unless) (.+)\.$/, (m) => {
    const t = usableTest(m[1]);
    return t && [onlyIf(t, `only if ${m[1]}.`)];
  }],
  [/^If you go second, you can't use this attack during your first turn\.$/, () => [{ op: "notSecondFirst", when: "before" }]],
  // Healing: all of it, every Pokémon, both sides.
  [/^Remove all damage counters from this Pokémon\.$/, () => [{ op: "healSelf", when: "after", n: 9990 }]],
  [/^Remove all Special Conditions from this Pokémon\.$/, () => fromDeck([{ op: "cure", to: "self" }])],
  [/^Heal all damage from (?:all|each) of your Pokémon\.$/, () => [{ op: "healEvery", when: "after", n: 9990 }]],
  // Technical Machine: Fluorite.
  [/^Discard all Energy from this Pokémon, and heal all damage from each of your Tera Pokémon\.$/, () => [{ op: "discardEnergy", when: "after", n: 99, type: "" }, { op: "healEvery", when: "after", n: 9990, tera: true }]],
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
  // Energy attached (or moved) to a Pokémon, then that Pokémon healed: "If you do, heal 120 damage from that Pokémon",
  // "If you attached Energy to a Pokémon in this way, heal all damage from that Pokémon", "... for each card you attached".
  [/^(.+?\.) (If you do|If you attached Energy to a Pokémon in this way), heal (\d+|all) damage from (that|this|those) Pokémon( for each card you attached to (?:them|it) in this way)?\.$/, (m) => {
    const first = compileOne(m[1]);
    const n = m[3] === "all" ? 9990 : Number(m[3]);
    const step = first?.length === 1 && first[0].op === "trainer" && first[0].steps.length === 1 ? first[0].steps[0] : null;
    if (step?.op === "attachPick") {
      // One Pokémon takes it ("that Pokémon", "this Pokémon"), or each that took some ("those Pokémon", "that Pokémon" after "in this way").
      const many = Boolean(step.spread);
      if (many ? m[4] === "this" || (m[4] === "that" && m[2] === "If you do") : m[4] === "those") return null;
      if (m[4] === "this" && step.to !== "self") return null;
      return fromDeck([{ ...step, heal: n, ...(m[5] ? { each: true } : {}) }]);
    }
    if (first?.length === 1 && first[0].op === "moveOwnEnergy" && !first[0].all && m[4] === "that" && !m[5] && m[2] === "If you do") return [{ ...first[0], heal: n }];
    return null;
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
  [/^Choose 1 of your Benched (.+?)'s? attacks and use it as this attack\.$/, (m) => {
    const who = monWhat(m[1]);
    return who && [{ op: "copyAttack", when: "before", bench: true, ...(who !== "pokemon" ? { who } : {}) }];
  }],
  // More damage on a test, and an effect after the damage on the same test (kept from before the damage: OPS.bonusIf `keep`).
  [new RegExp(`^If (.+?), this attack does (?:\\d+ damage plus )?(\\d+) more damage,? and (.+)$`), (m) => {
    const t = testOf(m[1]);
    const then = t && afterOnly(upper(m[3]));
    return then && [{ op: "bonusIf", when: "before", n: Number(m[2]), ...t, keep: true }, { op: "ifHeld", when: "after", steps: then }];
  }],
  [new RegExp(`^Search your deck for an? (.+?) and attach it to 1 of your (.+?)\\. ${SHUFFLED}$`), (m) => {
    const what = whatOf(m[1]);
    const who = monWhat(m[2]);
    return who && who !== "pokemon" && /^(basicEnergy|energy)(:\w+)?$/.test(what) && fromDeck([{ op: "fetchEnergy", what, n: 1, to: "one", where: { to: "any", who } }]);
  }],
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
 * "If <test>, <an effect after the damage>", the test judged before the damage (OPS.bonusIf `keep`, OPS.ifHeld), so what
 * the damage does can't change what it asks; `otherwise`: "..., <effect> instead" of the steps that would come.
 */
const heldIf = (t, steps, otherwise = null) => [{ op: "bonusIf", when: "before", n: 0, ...t, keep: true }, { op: "ifHeld", when: "after", steps, ...(otherwise ? { otherwise } : {}) }];
/** The number of coins "If you get 2 or more heads", "If either of them is heads", "If both of them are tails" asks for (OPS.onHeads). */
function headsClause(words) {
  let m;
  if ((m = words.match(/^(?:you get (?:at least )?(\d+) (?:or more )?heads|(?:at least )?(\d+) (?:or more )?of them (?:is|are) heads)$/))) return { min: Number(m[1] || m[2]) };
  if (/^(?:either|either of them|either coin|either of the coins|any of them) is heads$/.test(words)) return { min: 1 };
  if (/^(?:both|all|both of them|all of them|both coins|the first flip) (?:are|is) tails$/.test(words)) return { max: 0 };
  return null;
}
/** Coins all heads: "If both coins are heads", "If all of them are heads" (that many heads as coins flipped). */
const allHeads = (words) => /^(?:both|all|both of them|all of them|both coins) (?:are|is) heads$/.test(words);

const MORE = [
  // The Lost Zone: cards put there are out of the game (engine.js toLost).
  [/^(?:Put (all|an?|\d+) Energy(?: cards?)? attached to this Pokémon in the Lost Zone|Remove (all) Energy cards attached to this Pokémon and put them in the Lost Zone|Choose (\d+) Energy attached to this Pokémon and put them in the Lost Zone)\.$/, (m) => {
    const k = m[1] || m[2] || m[3];
    return [{ op: "discardEnergy", when: "after", n: k === "all" ? 99 : count(k), lost: true }];
  }],
  [new RegExp(`^Put ${N} Energy(?: cards?)? attached to your Pokémon in the Lost Zone\\.$`, "i"), (m) => [{ op: "ownEnergyLost", when: "after", n: count(m[1]) }]],
  [new RegExp(`^(?:Put ${N} Energy(?: cards?)? attached to ${FOE}|Remove an Energy card attached to ${FOE} and put it) in the Lost Zone\\.$`, "i"), (m) => [{ op: "discardFoeEnergy", when: "after", n: m[1] ? count(m[1]) : 1, lost: true }]],
  [/^Put the top (?:(\d+) )?cards? of (your|your opponent's) deck in the Lost Zone\.$/, (m) => [{ op: "mill", when: "after", n: m[1] ? Number(m[1]) : 1, lost: true, ...(m[2] === "your" ? { mine: true } : {}) }]],
  [/^Put this Pokémon and all (?:cards attached to it|attached cards) in the Lost Zone\.$/, () => [{ op: "selfAway", when: "after", to: "lost" }]],
  [/^Put your opponent's Active Pokémon and all cards attached to it in the Lost Zone\.$/, () => [{ op: "shuffleFoeActive", when: "after", to: "lost" }]],
  [/^(?:Put a random card from your opponent's hand|Choose 1 card from your opponent's hand without looking and put it) in the Lost Zone\.$/, () => [{ op: "foeHandRandom", when: "after", to: "lost" }]],
  [/^Look at your opponent's hand and put a card you find there in the Lost Zone\.$/, () => [{ op: "foeHandPick", when: "after", lost: true }]],
  [/^Put any number of Pokémon Tool cards from your discard pile in the Lost Zone\. This attack does (\d+) more damage for each card you put in the Lost Zone in this way\.$/, (m) => [{ op: "pay", when: "before", from: "discard", what: "tool", lost: true }, { op: "bonusPer", when: "before", n: Number(m[1]), per: "paid" }]],
  [new RegExp(`^(?:Put any amount of (?:${TYPE} )?Energy attached to your Pokémon in the Lost Zone\\. This attack does (\\d+) damage for each card put in the Lost Zone in this way|Put as many Energy cards attached to your Pokémon as you like in the Lost Zone\\. This attack does (\\d+) damage times the number of Energy cards put in the Lost Zone in this way)\\.$`), (m) => [{ op: "pay", when: "before", from: "own", energy: m[1] ? { type: m[1] } : {}, lost: true }, { op: "bonusPer", when: "before", how: "times", n: Number(m[2] || m[3]), per: "paid" }]],
  [/^Look at the top (\d+) cards of your deck and put (\d+) of them into your hand\. Put the other cards in the Lost Zone\.$/, (m) => [{ op: "topLost", when: "after", n: Number(m[2]), top: Number(m[1]) }]],
  [/^Put (\d+) cards? from your opponent's discard pile in the Lost Zone\.$/, (m) => [{ op: "foeDiscardLost", when: "after", n: Number(m[1]) }]],
  [/^(?:Choose a card from your hand and put it|Put a card from your hand) in the Lost Zone\. (Then|If you do), draw (\d+) cards\.$/, (m) => (m[1] === "Then" ? [{ op: "handLost", when: "after" }, { op: "draw", when: "after", n: Number(m[2]) }] : [{ op: "handLost", when: "after", then: [{ op: "draw", n: Number(m[2]) }] }])],
  [/^Choose 1 Pokémon from your hand and put it in the Lost Zone\. \(If you can't put a Pokémon in the Lost Zone, this attack does nothing\.\)$/, () => [{ op: "handLost", when: "before", what: "pokemon", must: true }]],
  [new RegExp(`^Search your deck for (?:1|a) Pokémon and put it in the Lost Zone\\. ${SHUFFLED}$`), () => [{ op: "deckLost", when: "after", what: "pokemon" }]],
  [/^Choose 1 Energy card attached to 1 of your opponent's Pokémon and put it in the Lost Zone\.$/, () => [{ op: "discardFoeAny", when: "after", n: 1, lost: true }]],
  [/^Put a Special Energy attached to 1 of your opponent's Pokémon in the Lost Zone\.$/, () => [{ op: "discardFoeAny", when: "after", n: 1, lost: true, special: true }]],
  [/^(?:If the Defending Pokémon is Knocked Out by this attack, put the Defending Pokémon and all cards attached to(?: it)? in the Lost Zone instead of the discard pile|If any of your opponent's Pokémon would be Knocked Out by damage from this attack, put that Pokémon and all cards attached to it in the Lost Zone instead of discarding it|If a Pokémon is Knocked Out by this damage, put that Pokémon and all cards attached to it in the Lost Zone instead of the discard pile)\.$/, (m) => [{ op: "lostKo", when: "before", ...(/Defending/.test(m[0]) ? {} : { all: true }) }]],

  // Coins, and what their heads say after the damage.
  [/^Flip a coin\. If tails, this Pokémon also does (\d+) damage to itself\. If heads, this attack does (\d+) more damage\.$/, (m) => [{ op: "flipBonus", when: "before", n: Number(m[2]) }, { op: "onCoin", when: "after", tails: [{ op: "selfDamage", n: Number(m[1]) }] }]],
  [/^(?:Flip a coin\. If tails, this attack does nothing\. If heads, (?:prevent all effects of an attack, including damage, done to this Pokémon during your opponent's next turn|during your opponent's next turn, prevent all effects of attacks, including damage, done to this Pokémon)|Flip a coin\. If heads, during your opponent's next turn, prevent all effects of attacks, including damage, done to this Pokémon; if tails, this attack does nothing \(not even damage\))\.$/, () => [{ op: "flipOrNothing", when: "before", heads: [mark("shield")] }]],
  [/^(Flip .+?\.) If (.+?), (.+)$/, (m) => {
    const first = compileOne(m[1]);
    if (first?.length !== 1 || !["flipTimes", "flipBonusEach", "flipUntilTails"].includes(first[0].op) || first[0].per) return null;
    const coins = first[0].coins;
    const ask = allHeads(m[2]) ? { min: coins } : headsClause(m[2]);
    if (!ask || (/first flip/.test(m[2]) !== (first[0].op === "flipUntilTails"))) return null;
    // A count of heads the coins can't reach ("Flip a coins ... If you get 2 or more heads"): a misprint, left unread.
    if (coins && ask.min > coins) return null;
    const steps = afterOnly(upper(m[3]));
    return steps && [...first, { op: "onHeads", when: "after", ...ask, steps }];
  }],
  [new RegExp(`^(?:Flip ${N} coins\\. If (?:both|all) (?:of them )?are tails, this attack does nothing\\. For each heads, (.+)|Flip ${N} coins\\. For each heads, (.+?\\.) If (?:both|all) of them are tails, this attack does nothing\\.)$`, "i"), (m) => {
    const steps = afterOnly(upper(m[2] || m[4]));
    return steps && [{ op: "flipCount", when: "before", coins: count(m[1] || m[3]), allTails: true }, { op: "perHeads", when: "after", steps }];
  }],
  [new RegExp(`^Flip a coin\\. If heads, choose a Special Condition \\(Asleep, Burned, Confused, Paralyzed, or Poisoned\\)\\. ${FOE} is now affected by that Special Condition\\.$`), () => [{ op: "flip", when: "after", heads: [{ op: "chooseCondition" }] }]],
  [/^If you use this attack when you have (?:only|exactly) (\d+) Prize cards? remaining, you win this game\.$/, (m) => [{ op: "winIf", when: "before", k: Number(m[1]) }]],

  // Their Pokémon sent away.
  [new RegExp(`^Choose ${N} of your opponent's (Benched )?Pokémon\\. (?:They shuffle|Your opponent shuffles) that Pokémon and all (?:attached cards|cards attached to it) into their deck\\.$`, "i"), (m) => count(m[1]) === 1 && [{ op: "shuffleFoeOne", when: "after", where: m[2] ? "bench" : "any" }]],
  [new RegExp(`^Put damage counters on ${N} of your opponent's Pokémon until its remaining HP is (\\d+)\\.$`, "i"), (m) => count(m[1]) === 1 && [{ op: "countersToOne", when: "after", hp: Number(m[2]) }]],
  [/^Discard a Team Rocket's Energy from this Pokémon\. If you do, discard your opponent's Active Pokémon and all attached cards\.$/, () => [{ op: "discardEnergy", when: "after", n: 1, name: "Team Rocket's Energy", then: [{ op: "shuffleFoeActive", to: "discard" }] }]],
  [/^Unless this attack Knocks Out the Defending Pokémon, return the Defending Pokémon and all cards attached to it to your opponent's hand\.$/, () => [{ op: "when", when: "after", test: "foeDown", not: true, steps: [{ op: "shuffleFoeActive", to: "hand" }] }]],
  [/^Flip a coin\. If heads, your opponent returns the Defending Pokémon and all cards attached to it to his or her hand\.$/, () => [{ op: "flip", when: "after", heads: [{ op: "shuffleFoeActive", to: "hand" }] }]],

  // Healing.
  [new RegExp(`^Heal (\\d+|all) damage from each of your Pokémon that has any (?:${TYPE} )?Energy attached to it\\.$`), (m) => [{ op: "healEach", when: "after", n: m[1] === "all" ? 9990 : Number(m[1]), ...(m[2] ? { type: m[2] } : {}) }]],
  [/^Heal (\d+) damage from both Active Pokémon\.$/, (m) => [{ op: "healBoth", when: "after", n: Number(m[1]) }]],
  [/^(?:Heal (\d+) damage from this Pokémon, and it recovers from all Special Conditions|Remove (\d+) damage counters and all Special Conditions from this Pokémon)\.$/, (m) => [{ op: "healSelf", when: "after", n: m[1] ? Number(m[1]) : Number(m[2]) * 10 }, ...fromDeck([{ op: "cure", to: "self" }])]],
  [/^If there are any damage counters on this Pokémon, remove (\d+) of them\.$/, (m) => [{ op: "healSelf", when: "after", n: Number(m[1]) * 10 }]],
  [/^Remove (\d+) damage counters? from each of your Pokémon \(including this Pokémon\)\.$/, (m) => fromDeck([{ op: "heal", n: Number(m[1]) * 10, to: "all" }])],
  [/^Remove (\d+) damage counters? from this Pokémon \(remove \d+ if there is only \d+\)\.$/, (m) => [{ op: "healSelf", when: "after", n: Number(m[1]) * 10 }]],
  [/^(?:If this attack does any damage to|If this attack damages) the Defending Pokémon \(after applying Weakness and Resistance\), remove (\d+) damage counters? from this Pokémon(?:, if it has any)?\.$/, (m) => [{ op: "when", when: "after", test: "dealt", steps: [{ op: "healSelf", n: Number(m[1]) * 10 }] }]],
  [/^Unless all damage from this attack is prevented, you may remove (\d+) damage counters? from this Pokémon\.$/, (m) => [{ op: "when", when: "after", test: "dealt", steps: [{ op: "may", steps: [{ op: "healSelf", n: Number(m[1]) * 10 }], prompt: `Remove ${m[1]} damage counter${m[1] === "1" ? "" : "s"} from this Pokémon?` }] }]],
  [new RegExp(`^Discard (an?|\\d+) (?:${TYPE} )?Energy(?: card)? attached to this Pokémon and (?:heal all damage from this Pokémon|remove all damage counters from this Pokémon|remove (\\d+) damage counters? from this Pokémon)\\.$`), (m) => [{ op: "discardEnergy", when: "after", n: count(m[1]), type: m[2] || "" }, { op: "healSelf", when: "after", n: m[3] ? Number(m[3]) * 10 : 9990 }]],

  // Special Conditions and more on the Defending Pokémon.
  [new RegExp(`^Both ${FOE} and this Pokémon are now ${COND}\\.$`), (m) => [cond(m[1]), cond(m[1], true)]],
  [new RegExp(`^${FOE} is now ${COND} and can't retreat during your opponent's next turn\\.$`), (m) => [cond(m[1]), mark("noRetreat", { on: "foe" })]],
  [new RegExp(`^${FOE} is now ${COND}, and discard an Energy from that Pokémon\\.$`), (m) => [cond(m[1]), { op: "discardFoeEnergy", when: "after", n: 1 }]],
  [new RegExp(`^${FOE} is now Poisoned\\. Put (\\d+) damage counters instead of \\d+ on that Pokémon during Pokémon Checkup\\.$`), (m) => [{ ...cond("poisoned"), counters: Number(m[1]) * 10 }]],
  [new RegExp(`^${FOE} is now ${COND}\\. Flip a coin\\. If heads, ${FOE} is also ${COND}\\.$`), (m) => [cond(m[1]), { op: "flip", when: "after", heads: [cond(m[2])] }]],
  [new RegExp(`^At the end of your opponent's next turn, ${FOE} is now ${COND}\\.$`), (m) => [mark("doomCond", { on: "foe", name: m[1].toLowerCase() })]],
  [new RegExp(`^Put (\\d+) damage counters? on ${FOE} at the end of your opponent's next turn\\.$`), (m) => [mark("doom", { on: "foe", n: Number(m[1]) * 10 })]],
  [/^Put (\d+) damage counters? on each of your opponent's Pokémon that already has damage counters on it\.$/, (m) => [{ op: "counters", when: "after", n: Number(m[1]) * 10, where: "any", damaged: true }]],
  [new RegExp(`^Discard a Special Energy(?: card)?, if any, attached to ${FOE}\\.$`), () => [{ op: "discardFoeSpecial", when: "after" }]],
  [new RegExp(`^Discard ${N} Energy (?:from|attached to) ${FOE}\\.$`, "i"), (m) => [{ op: "discardFoeEnergy", when: "after", n: count(m[1]) }]],
  [new RegExp(`^Discard ${N} Energy cards? attached to ${FOE}, if any\\.$`, "i"), (m) => [{ op: "discardFoeEnergy", when: "after", n: count(m[1]) }]],
  [new RegExp(`^(?:Before doing damage, )?[Dd]iscard a Pokémon Tool card attached to ${FOE}\\.$`), (m) => [{ op: "dropFoeTool", when: /^Before/.test(m[0]) ? "before" : "after" }]],
  [new RegExp(`^(?:Switch ${N} of your opponent's Benched Pokémon with ${FOE}|Switch ${FOE} with ${N} of your opponent's Benched Pokémon)\\.$`, "i"), () => fromDeck([{ op: "gust" }])],
  [new RegExp(`^Switch ${FOE} with ${N} of your opponent's Benched Pokémon\\. This attack does (\\d+) damage to the new Defending Pokémon\\.$`, "i"), (m) => [{ op: "trainer", when: "before", steps: [{ op: "gust" }] }, { op: "setDamage", when: "before", n: Number(m[2]) }]],
  [new RegExp(`^Devolve ${FOE} and put the highest Stage (?:e|E)volution card on it into your opponent's hand\\.$`), () => [{ op: "devolveFoe", when: "after" }]],
  [/^Your opponent's Active Pokémon is now Poisoned\. Put (\d+) damage counters instead of \d+ on that Pokémon during Pokémon Checkup\.$/, (m) => [{ ...cond("poisoned"), counters: Number(m[1]) * 10 }]],

  // Their hand and deck.
  [new RegExp(`^Choose ${N} random cards from your opponent's hand\\. Your opponent reveals those cards and shuffles them into (?:their|his or her) deck\\.$`, "i"), (m) => [{ op: "foeHandRandom", when: "after", n: count(m[1]), to: "deck" }]],
  [/^Your opponent reveals their hand\. Discard all (.+?) cards you find there\.$/, (m) => {
    const what = whatOf(`${m[1]} card`);
    return what && [{ op: "foeHandDrop", when: "after", what }];
  }],
  [/^(?:Your opponent reveals their hand, and you discard a card you find there|Your opponent reveals their hand\. Discard (\d+) cards from it)\.$/, (m) => [{ op: "foeHandPick", when: "after", n: m[1] ? Number(m[1]) : 1 }]],
  [/^Discard the top card of your opponent's deck\. If you played an? (Ancient|Future) Supporter card from your hand during this turn, discard (\d+) more cards in this way\.$/, (m) => [{ op: "mill", when: "after", n: 1 }, { op: "when", when: "after", test: "played", what: `supporter+${m[1]}`, steps: [{ op: "mill", n: Number(m[2]) }] }]],
  [new RegExp(`^For each (.+?), discard the top card of your opponent's deck\\.$`), (m) => {
    const c = countOf(m[1].replace(/ attached to this Pokémon$/, " attached to this Pokémon"));
    return c && [{ op: "mill", when: "after", n: 1, per: c.per, ...(c.type ? { type: c.type } : {}) }];
  }],
  [/^(?:Your opponent discards the top card of (?:his or her|their) deck|Each player discards the top (\d+) cards from (?:his or her|their) deck)\.$/, (m) => (m[1] ? [{ op: "mill", when: "after", n: Number(m[1]) }, { op: "mill", when: "after", n: Number(m[1]), mine: true }] : [{ op: "mill", when: "after", n: 1 }])],
  [new RegExp(`^Look at the top ${N} cards of your opponent's deck and put them back on top of (?:his or her|their) deck in any order\\.$`, "i"), (m) => [{ op: "arrangeDeck", when: "after", n: count(m[1]) }]],
  [new RegExp(`^Look at (?:the top|up to) ${N} cards (?:of|from the top of) either player's deck and rearrange them as you like\\.$`, "i"), (m) => [{ op: "arrangeDeck", when: "after", n: count(m[1]), either: true }]],

  // Copying the Defending Pokémon's attacks.
  [/^Choose 1 of the Defending Pokémon's attacks\. Metronome copies that attack except for its Energy costs and anything else required in order to use that attack, such as discarding Energy cards\. \(No matter what type the Defending Pokémon is, this Pokémon's type is still Colorless\.\)$/, () => [{ op: "copyAttack", when: "before", free: true }]],
  [/^Choose 1 of the Defending Pokémon's attacks\. Metronome copies that attack except for its Energy cost\. \(You must still do anything else (?:required )?in order to use that attack\.\) this Pokémon performs that attack\.$/, () => [{ op: "copyAttack", when: "before" }]],
  [/^Choose 1 of the Defending Pokémon's attacks\. Copy copies that attack\. This attack does nothing if this Pokémon doesn't have the Energy necessary to use that attack\. \(You must still do anything else required (?:in order to use|for) that attack\.\)(?: this Pokémon performs that attack\.)?$/, () => [{ op: "copyAttack", when: "before", paid: true }]],

  // Effects that last a turn.
  [/^During your opponent's next turn, the Defending Pokémon's (attacks cost|Retreat Cost is) ((?:Colorless)+) more(?:, and its Retreat Cost is ((?:Colorless)+) more)?\.$/, (m) => {
    const k = (s) => s.length / "Colorless".length;
    return [mark(/attacks/.test(m[1]) ? "costMore" : "retreatMore", { on: "foe", n: k(m[2]) }), ...(m[3] ? [mark("retreatMore", { on: "foe", n: k(m[3]) })] : [])];
  }],
  [/^During your opponent's next turn, the attack cost of each of the Defending Pokémon's attacks is ((?:Colorless)+) more\.$/, (m) => [mark("costMore", { on: "foe", n: m[1].length / "Colorless".length })]],
  [/^During your opponent's next turn, if this Pokémon is damaged by an attack \(even if (?:this Pokémon|it) is Knocked Out\), put damage counters on the Attacking Pokémon equal to the damage done to this Pokémon\.$/, () => [mark("spite", { mirror: true })]],
  [/^During your opponent's next turn, if this Pokémon is damaged by an opponent's attack \(even if this Pokémon is Knocked Out\), put (\d+) damage counters? on the Attacking Pokémon\.$/, (m) => [mark("spite", { n: Number(m[1]) * 10 })]],
  [/^(?:During your opponent's next turn, prevent all effects of attacks used by your opponent's Pokémon done to this Pokémon\. \(Damage is not an effect\.\)|Prevent all effects of your opponent's attacks, except damage, done to this Pokémon during your opponent's next turn\.)$/, () => [mark("ward")]],
  [/^This Pokémon can't use (.+) again until it leaves the Active Spot\.$/, (m) => [mark("noUse", { name: m[1], until: true })]],
  [/^Flip a coin\. If tails, this attack does nothing\. Either way, you can't use this attack again as long as this Pokémon stays in play \(even putting this Pokémon on the Bench won't let you use it again\)\.$/, () => [{ op: "spend", when: "before" }, { op: "flipOrNothing", when: "before" }]],
  [/^(?:Flip a coin\. If heads, during your opponent's next turn, if this Pokémon would be Knocked Out by damage from an attack, this Pokémon is not Knocked Out and its remaining HP becomes (\d+) instead|Flip a coin\. If heads, if this Pokémon would be Knocked Out by damage from an attack during your opponent's next turn, it is not Knocked Out, and its remaining HP becomes (\d+))\.$/, (m) => [{ op: "flip", when: "after", heads: [mark("endure", { n: Number(m[1] || m[2]) })] }]],
  [/^If this Pokémon has at least (\d+) extra Energy attached to it \(in addition to this attack's cost\), and if it would be Knocked Out by damage from an opponent's attack during their next turn, it is not Knocked Out, and its remaining HP becomes (\d+)\.$/, (m) => heldIf({ test: "spareAtLeast", k: Number(m[1]) }, [mark("endure", { n: Number(m[2]) })])],
  [/^If any damage is done to this Pokémon by attacks during your opponent's next turn, flip a coin\. If heads, prevent that damage\.$/, () => [mark("dodge")]],
  [/^If your opponent's Pokémon is Knocked Out by damage from this attack, during your opponent's next turn, prevent all damage from and effects of attacks done to this Pokémon\.$/, () => [{ op: "when", when: "after", test: "foeKo", steps: [mark("shield")] }]],
  [/^During your opponent's next turn, this Pokémon takes (\d+) less damage from attacks from (Basic|Evolution) Pokémon \(after applying Weakness and Resistance\)\.$/, (m) => [mark("less", { n: Number(m[1]), from: m[2] === "Basic" ? "basic" : "evolution" })]],
  [/^During your opponent's next turn, prevent all damage done to this Pokémon by attacks from TAG TEAM Pokémon\.$/, () => [mark("guard", { from: "tag:TAG TEAM" })]],
  [/^During your next turn, this Pokémon can't retreat\.$/, () => [mark("noRetreat", { mine: true })]],
  [/^During your next turn, (?:this Pokémon's (.+?)(?: attack)?|(.+?)) does (?:(\d+) more damage|\d+ damage plus (\d+) more damage)(?: \(before applying Weakness and Resistance\))?\.$/, (m) => {
    const name = m[1] || m[2];
    return name && !/\b(?:this|Pokémon|attacks?)\b/.test(name) && [mark("stronger", { mine: true, name, n: Number(m[3] || m[4]) })];
  }],
  [new RegExp(`^Flip a coin\\. If heads, each Defending Pokémon can't attack during your opponent's next turn\\.$`), () => [{ op: "flip", when: "after", heads: [mark("noAttack", { on: "foe" })] }]],
  [/^Your opponent can't play any Trainer cards \(except for Supporter cards\) from (?:his or her|their) hand during your opponent's next turn\.$/, () => [{ op: "lockHand", when: "after", kinds: ["item", "stadium"] }]],
];
PATTERNS.push(...MORE);

/** testOf, with the test turned the other way. */
const notTest = (t) => ({ ...t, not: !t.not });
/** A test asked before the damage, with steps that run before it too (`otherwise`: when it doesn't hold). */
const beforeIf = (t, steps, otherwise = null) => [{ op: "ifTest", when: "before", ...t, steps }, ...(otherwise ? [{ op: "ifTest", when: "before", ...notTest(t), steps: otherwise }] : [])];

const BATCH8 = [
  // TAG TEAM GX attacks: more when the attacker has extra Energy (in addition to the attack's cost), judged before the damage.
  [new RegExp(`^If your opponent's Pokémon is Knocked Out by damage from this attack, take ${N} more Prize cards?\\. If (.+?), take ${N} more Prize cards? instead\\.$`, "i"), (m) => {
    const t = testOf(m[2]);
    return t && beforeIf(t, [{ op: "bounty", n: count(m[3]) }], [{ op: "bounty", n: count(m[1]) }]);
  }],
  [/^If (.+?), this attack does (\d+) more damage, and this attack's damage isn't affected by any effects on your opponent's Active Pokémon\.$/, (m) => {
    const t = testOf(m[1]);
    return t && [{ op: "bonusIf", when: "before", n: Number(m[2]), ...t }, ...beforeIf(t, [{ op: "typing", noEffects: true }])];
  }],
  [/^This attack does (\d+) more damage for each extra (?:(Grass|Fire|Water|Lightning|Psychic|Fighting|Darkness|Metal|Fairy) )?Energy attached to this Pokémon \(in addition to this attack's cost\)\. You can't add more than (\d+) damage in this way\.$/, (m) => [{ op: "bonusPer", when: "before", n: Number(m[1]), per: "spareEnergy", ...(m[2] ? { type: m[2] } : {}), cap: Number(m[3]) }]],
  [/^(Put (\d+) damage counters on your opponent's Pokémon in any way you like\.) If (.+?), put (\d+) damage counters on them instead\.$/, (m) => {
    const t = testOf(m[3]);
    return t && heldIf(t, [{ op: "counters", n: Number(m[4]) * 10, where: "any", spread: true }], [{ op: "counters", n: Number(m[2]) * 10, where: "any", spread: true }]);
  }],
  [new RegExp(`^Discard ${N} of your opponent's Pokémon and all cards attached to it\\. If (.+?), discard ${N} of your opponent's Pokémon instead\\.$`, "i"), (m) => {
    const t = testOf(m[2]);
    return t && heldIf(t, [{ op: "discardFoeMon", n: count(m[3]) }], [{ op: "discardFoeMon", n: count(m[1]) }]);
  }],
  [new RegExp(`^${FOE} is now Paralyzed and Poisoned\\. If (.+?), put (\\d+) damage counters instead of 1 on that Pokémon between turns\\.$`, "i"), (m) => {
    const t = testOf(m[1]);
    return t && [cond("Paralyzed"), ...heldIf(t, [{ ...cond("Poisoned"), counters: Number(m[2]) * 10 }], [cond("Poisoned")])];
  }],
  [/^Flip a coin\. If heads, this attack does (\d+) more damage\. If (.+?), flip (\d+) coins instead, and this attack does (\d+) more damage for each heads\.$/, (m) => {
    const t = testOf(m[2]);
    return t && beforeIf(t, [{ op: "flipBonusEach", coins: Number(m[3]), n: Number(m[4]) }], [{ op: "flipBonus", n: Number(m[1]) }]);
  }],
  // "If this Pokémon has at least 2 extra Energy attached ..., <an effect after the damage>".
  [/^If (this Pokémon has at least .+? \(in addition to this attack's cost\)), (.+)$/, (m) => {
    const t = testOf(m[1]);
    const steps = t && afterOnly(upper(m[2]));
    return steps && heldIf(t, steps);
  }],
  // A reminder alone in its sentence (the damage it is about was read in another).
  [/^\(Don't apply Weakness and Resistance for Benched Pokémon\.\)$/, () => []],
  [/^Your opponent shuffles (?:their|his or her) hand into (?:their|his or her) deck\.$/, () => fromDeck([{ op: "foeShuffle" }])],
  [/^Shuffle all cards (?:from|in) your discard pile into your deck\.$/, () => [{ op: "discardToDeck", when: "after", what: "any" }]],
  [/^Your opponent can't play any cards from (?:their|his or her) hand during (?:their|his or her) next turn\.$/, () => [{ op: "lockHand", when: "after", kinds: ["all"] }]],
  [/^Each player draws cards until (?:they have|he or she has) (\d+) cards in (?:their|his or her) hand\.$/, (m) => [{ op: "drawToBoth", when: "after", n: Number(m[1]) }]],

  // Pokémon from the discard pile onto the Bench: Basic Pokémon only, unless the card says otherwise.
  [new RegExp(`^Put (an?|up to ${N}|${N}) (.+?) from your discard pile onto your Bench\\.$`, "i"), (m) => {
    const words = m[4].replace(/^in any combination of /, "").replace(/ cards?$/, "");
    const parts = words.split(/ or (?:an? )?/).map((w) => w.replace(/^an? /, ""));
    const kinds = parts.map((w) => {
      const gx = w.match(new RegExp(`^${TYPE} (Pokémon-GX|Pokémon-EX)$`));
      if (gx) return `basic:${gx[1]}&&box=${gx[2].slice(-2)}`;
      if (w === "Baby Pokémon") return "basic+Baby";
      const what = monWhat(w);
      if (!what || what.includes("|")) return "";
      if (what === "pokemon" || what === "basic") return "basic";
      if (/^pokemon:\w+$/.test(what)) return `basic:${what.slice(8)}`;
      return /^(?:name=|\+)/.test(what) ? `basic&&${what}` : "";
    });
    if (kinds.some((k) => !k)) return null;
    const n = /^an?$/i.test(m[1]) ? 1 : count(m[2] || m[3]);
    return fromDeck([{ op: "recover", what: [...new Set(kinds)].join("|"), n, to: "bench", ...(m[2] ? { upTo: true } : {}) }]);
  }],
  // Energy from the discard pile onto this Pokémon, when there is any (a coin first, in some).
  [new RegExp(`^If there are any (${TYPE} Energy) cards in your discard pile, (?:(flip a coin\\. If heads, )?attach 1 of them|choose 1 of them and attach it) to this Pokémon\\.$`), (m) => {
    const what = whatOf(`${m[1]} card`);
    if (!what) return null;
    const attach = fromDeck([{ op: "attachPick", zone: "discard", what, to: "self", n: 1 }]);
    return [{ op: "when", when: "after", test: "discardHas", what, steps: m[3] ? [{ op: "flip", heads: attach }] : attach }];
  }],
  [new RegExp(`^(?:You may )?[Mm]ove any amount of (basic )?(?:${TYPE} )?Energy from your Pokémon to your other Pokémon in any way you like\\.$`), (m) => [{ op: "rearrangeEnergy", when: "after", ...(m[1] ? { basic: true } : {}), ...(m[2] ? { type: m[2] } : {}) }]],
  // Their evolved Pokémon devolved, all at once.
  [/^(?:Devolve each of your opponent's evolved Pokémon (?:by putting|and put) the highest Stage Evolution card on it into your opponent's hand|If your opponent has any Evolved Pokémon in play, remove the highest Stage Evolution card from each of them and put those cards back into (?:his or her|their) hand)\.$/, () => [{ op: "devolveEach", when: "after" }]],
  [/^Devolve each of your opponent's evolved Pokémon by shuffling the highest Stage Evolution card on it into your opponent's deck\.$/, () => [{ op: "devolveEach", when: "after", to: "deck" }]],
  // Cards added to their Prize cards.
  [/^Add the top (\d+) cards of your opponent's deck to (?:their|his or her) Prize cards\.$/, (m) => [{ op: "addPrizes", when: "after", n: Number(m[1]) }]],
  [/^Your opponent reveals their hand\. Add a card you find there to their Prize cards face down\.$/, () => [{ op: "pickToPrizes", when: "after" }]],
  [/^Add a card from your opponent's discard pile to their Prize cards face down\.$/, () => [{ op: "pickToPrizes", when: "after", from: "discard" }]],
  // Damage counters moved over.
  [new RegExp(`^Move all damage counters from this Pokémon to ${FOE}\\.$`), () => [{ op: "countersToFoe", when: "after" }]],
  [/^Move (all|\d+) damage counters from each of your Pokémon to your opponent's Active Pokémon\.$/, (m) => [{ op: "countersToFoe", when: "after", from: "own", ...(m[1] === "all" ? {} : { n: Number(m[1]) * 10 }) }]],
  [new RegExp(`^Move all damage counters from 1 of your Benched (.+?) to ${FOE}\\.$`), (m) => {
    const who = monWhat(m[1].replace(/’/g, "'"));
    return who && [{ op: "benchCountersToFoe", when: "after", ...(who !== "pokemon" ? { who } : {}) }];
  }],
  [/^Double the number of damage counters on each of your opponent's Pokémon\.$/, () => [{ op: "doubleCounters", when: "after" }]],
  // Energy off both, or off each in turn.
  [/^Discard all Energy from both Active Pokémon\.$/, () => [{ op: "discardEnergy", when: "after", n: 99 }, { op: "discardFoeEnergy", when: "after", n: 99 }]],
  [new RegExp(`^Discard an Energy card attached to this Pokémon and (?:then )?discard an Energy card attached to ${FOE}\\.$`), () => [{ op: "discardEnergy", when: "after", n: 1 }, { op: "discardFoeEnergy", when: "after", n: 1 }]],
  [new RegExp(`^Discard an? ${TYPE} Energy(?: card)?(?:,| and) (?:an? )?${TYPE} Energy(?: card)?(?:,? and (?:an? )?${TYPE} Energy(?: card)?)? attached to this Pokémon\\.$`), (m) => {
    const types = [m[1], m[2], m[3]].filter(Boolean);
    return new Set(types).size === types.length && types.map((type) => ({ op: "discardEnergy", when: "after", n: 1, type }));
  }],
  // Their hand.
  [/^Your opponent reveals (?:their|his or her) hand\. Discard (?:a|an) (Trainer|Item|Supporter|Pokémon|Energy) card you find there\.$/, (m) => [{ op: "foeHandPick", when: "after", what: whatOf(`${m[1]} card`) }]],
  [/^Look at your opponent's hand, choose a Trainer card you find there, and discard it\.$/, () => [{ op: "foeHandPick", when: "after", what: "trainer" }]],
  [/^Your opponent may draw (a|\d+) cards?\.$/, (m) => [{ op: "foeMayDraw", when: "after", n: count(m[1]) }]],
  // Special Conditions that count for more.
  [new RegExp(`^(?:(Flip a coin\\. If heads, )?${FOE} is now Poisoned\\. It now takes (\\d+) Poison damage instead of 10 after each player's turn \\(even if it was already Poisoned\\))\\.$`, "i"), (m) => {
    const poison = { ...cond("Poisoned"), counters: Number(m[2]) };
    return m[1] ? [{ op: "flip", when: "after", heads: [poison] }] : [poison];
  }],
  [new RegExp(`^${FOE} is now Confused\\. Put (\\d+) damage counters instead of 3 on that Pokémon for this Special Condition\\.$`, "i"), (m) => [{ ...cond("Confused"), counters: Number(m[1]) * 10 }]],
  // Damage after a card off the top of a deck: "If that card is a Fire Energy card, this attack does 90 more damage".
  [/^(You may )?[Dd]iscard the top card (?:of|from) (your|your opponent's) deck\. If that card is (?:an? )?(.+?) card, this attack does (\d+) more damage(, and attach that card to this Pokémon)?\.$/, (m) => {
    const what = whatOf(`${m[3]} card`);
    if (!what || (m[5] && !/^(basicEnergy|energy)(:\w+)?$/.test(what)) || (m[5] && m[2] !== "your")) return null;
    const pay = { op: "pay", when: "before", from: m[2] === "your" ? "deck" : "foeDeck", n: 1 };
    return [m[1] ? { op: "ask", when: "before", steps: [{ ...pay, when: "after" }], prompt: `Discard the top card of your deck? If it is ${/^[AEIOU]/.test(m[3]) ? "an" : "a"} ${m[3]} card, this attack does ${m[4]} more damage.` } : pay, { op: "bonusPer", when: "before", n: Number(m[4]), per: "paid", type: what }, ...(m[5] ? [{ op: "attachPaid", when: "after", what }] : [])];
  }],
  [/^Discard the top card (?:of|from) your deck\. If that card is (?:an? )?(.+?)(?: card)?, attach it to this Pokémon\.$/, (m) => {
    const what = whatOf(`${m[1]} card`);
    return /^(basicEnergy|energy)(:\w+)?$/.test(what || "") && [{ op: "pay", when: "before", from: "deck", n: 1 }, { op: "attachPaid", when: "after", what }];
  }],
  // "If you did any damage with this attack, you may attach ...".
  [/^(This attack does .+? more damage for each .+?\.) If you did any damage with this attack, you may (attach .+)$/, (m) => {
    const first = compileOne(m[1]);
    const then = first && afterOnly(upper(m[2]));
    return then && [...first, { op: "when", when: "after", test: "dealt", steps: [{ op: "may", steps: then, prompt: `${upper(m[2]).replace(/\.$/, "")}?` }] }];
  }],
  // More Prize cards for some.
  [new RegExp(`^If your opponent's (Basic Pokémon|Mega Evolution Pokémon) is Knocked Out by damage from this attack, take ${N} more Prize cards?\\.$`, "i"), (m) => [{ op: "bounty", when: "before", n: count(m[2]), what: m[1] === "Basic Pokémon" ? "basic" : "mega" }]],
  // Coins: either of them heads, both tails, both heads with the attack undone on both tails.
  [new RegExp(`^Flip ${N} coins\\. If (?:either of them|either|any of them|1 or both of them|1 or more of them) (?:is|are) heads, (.+)$`, "i"), (m) => {
    const steps = afterOnly(upper(m[2]));
    return steps && [{ op: "flipCount", when: "before", coins: count(m[1]) }, { op: "onHeads", when: "after", min: 1, steps }];
  }],
  [new RegExp(`^Flip ${N} coins\\. If (?:both|all) (?:of them )?are (heads|tails), (?!this attack does nothing)(.+)$`, "i"), (m) => {
    const steps = afterOnly(upper(m[3]));
    const coins = count(m[1]);
    return steps && [{ op: "flipCount", when: "before", coins }, { op: "onHeads", when: "after", ...(m[2] === "heads" ? { min: coins } : { max: 0 }), steps }];
  }],
  [new RegExp(`^Flip ${N} coins\\. If (?:both|all) (?:of them )?are heads, (.+?\\.) If (?:both|all) (?:of them )?are tails, this attack does nothing\\.$`, "i"), (m) => {
    const steps = afterOnly(upper(m[2]));
    const coins = count(m[1]);
    return steps && [{ op: "flipCount", when: "before", coins, allTails: true }, { op: "onHeads", when: "after", min: coins, steps }];
  }],
  [/^Flip 2 coins\. If both are heads, this attack does \d+ damage plus (\d+) more damage\. If both are tails, this attack does nothing\. If 1 is heads and 1 is tails, this attack just does \d+ damage\.$/, (m) => [{ op: "flipTable", when: "before", coins: 2, more: [0, 0, Number(m[1])], none: true }]],
  [/^Flip (\d+) coins\.((?: If you get \d+ heads?, this attack does \d+ damage plus \d+ more damage\.)+)$/, (m) => {
    const coins = Number(m[1]);
    const more = Array(coins + 1).fill(0);
    for (const [, k, n] of m[2].matchAll(/If you get (\d+) heads?, this attack does \d+ damage plus (\d+) more damage\./g)) more[Number(k)] = Number(n);
    return [{ op: "flipTable", when: "before", coins, more }];
  }],
  // "If <test>, this attack does 40 damage plus 20 more damage. If not, this attack does 40 damage."
  [/^(If .+?, this attack does (\d+) damage plus \d+ more damage\.) If not, this attack does (\d+) damage\.$/, (m) => m[2] === m[3] && compileOne(m[1])],

  // Damage for each damage counter on the Pokémon it lands on.
  [new RegExp(`^This attack does (\\d+) damage to 1 of your opponent's (Benched )?Pokémon for each damage counter on that Pokémon\\.${NO_TYPING_NOTE}$`), (m) => [{ op: "spread", when: "after", n: Number(m[1]), to: m[2] ? "bench" : "any", perCounter: true }]],
  [/^This attack also does (\d+) damage to each of your opponent's Benched Pokémon for each (.+?)\.$/, (m) => {
    const c = countOf(m[2]);
    return c && [{ op: "spread", when: "after", n: Number(m[1]), to: "bench", per: c.per, ...(c.type ? { type: c.type } : {}) }];
  }],
  [/^Put all Energy (?:cards )?attached to this Pokémon into your hand\.$/, () => [{ op: "energyToHand", when: "after", n: 99 }]],
  [new RegExp(`^Return ${N} (?:${TYPE} )?Energy(?: cards?)? attached to this Pokémon to your hand\\.$`, "i"), (m) => [{ op: "energyToHand", when: "after", n: count(m[1]), ...(m[2] ? { type: m[2] } : {}) }]],
  // "If <test>, this attack also does 30 damage to each of your opponent's Benched Pokémon": the test as it stood before the damage.
  [/^If (.+?), (this attack (?:also )?does \d+ damage to .+)$/, (m) => {
    const t = testOf(m[1]);
    if (!t || ["foeDamaged", "foeCountersAtLeast", "foeHpAtMost", "foeUndamaged", "foeDown", "foeKo", "dealt"].includes(t.test)) return null;
    const steps = afterOnly(upper(m[2]));
    return steps && heldIf(t, steps);
  }],
  // The next turn: more damage to the Defending Pokémon, an attack that can't be used, protection from some attackers.
  [/^During your next turn, (?:each of this Pokémon's attacks does|this Pokémon's attacks do) (\d+) more damage to the Defending Pokémon \(before applying Weakness and Resistance\)\.$/, (m) => [{ op: "prey", when: "after", n: Number(m[1]) }]],
  [/^During your next turn, this Pokémon's attacks (?:do|deal) (\d+) more damage to your opponent's Active Pokémon\.$/, (m) => [mark("stronger", { mine: true, n: Number(m[1]) })]],
  [/^During your next turn, (?!the Defending|your opponent)((?:(?!\. ).)+?) can't use (.+)\.$/, (m) => !/\b(?:attacks?|Defending|opponent)\b/.test(m[1]) && [mark("noUse", { mine: true, name: m[2] })]],
  [/^Prevent all effects of attacks, including damage, done to this Pokémon by your opponent's (Pokémon-ex|Pokémon ex|Pokémon-EX|Pokémon-GX|Pokémon V) during your opponent's next turn\.$/, (m) => [mark("shield", { from: `box:${BOXES[m[1]].join(",")}` })]],
  [/^During your opponent's next turn, prevent all damage done to this Pokémon by attacks from Pokémon that have an Ability\.$/, () => [mark("guard", { from: "ability" })]],
  [/^Prevent all damage done to this Pokémon by attacks from (Basic|Evolution) Pokémon during your opponent's next turn\.$/, (m) => [mark("guard", { from: m[1] === "Basic" ? "basic" : "evolution" })]],
  [/^Prevent all damage done to this Pokémon by attacks during your opponent's next turn\.$/, () => [mark("guard")]],
  [/^Prevent all effects of attacks, including damage, done to each of your Pokémon during your opponent's next turn\.$/, () => [{ op: "shieldAll", when: "after" }]],
  [/^(?:Whenever your opponent flips a coin during (?:their|his or her) next turn|During your opponent's next turn, whenever (?:they flip|your opponent flips) a coin), treat it as tails\.$/, () => [{ op: "allTails", when: "after" }]],
  [/^For the rest of this game, your opponent can't use any GX attacks\.$/, () => [{ op: "barGx", when: "after" }]],
  // Energy: all of a type or nothing; moved about.
  [new RegExp(`^Discard all (basic )?(?:${TYPE} )?Energy(?: cards)? attached to this Pokémon or this attack does nothing\\.$`), (m) => [{ op: "payOrNothing", when: "before", n: 99, need: 1, type: m[2] || "", ...(m[1] ? { basic: true } : {}) }]],
  [/^Take a basic Energy card attached to 1 of your Pokémon and attach it to another of your Pokémon\.$/, () => fromDeck([{ op: "moveEnergy", basic: true }])],
  [/^If you have any Benched Pokémon and if there are any basic Energy cards attached to this Pokémon, take 1 of those Energy cards and attach it to 1 of those Pokémon\.$/, () => [{ op: "moveOwnEnergy", when: "after", n: 1, basic: true }]],
  [new RegExp(`^(Discard all Energy (?:cards )?(?:from|attached to) this Pokémon),? and (this attack (?:also )?does \\d+ damage to .+)$`), (m) => {
    const then = afterOnly(upper(m[2]));
    return then && [{ op: "discardEnergy", when: "after", n: 99, type: "" }, ...then];
  }],
  [new RegExp(`^You may discard ${N} (?:${TYPE} )?Energy (?:from|attached to) this Pokémon (?:and|to) make (?:your opponent's Active Pokémon|the Defending Pokémon) ${COND}\\.$`, "i"), (m) => [{ op: "may", when: "after", steps: [{ op: "discardEnergy", n: count(m[1]), type: m[2] || "", then: [cond(m[3])] }], prompt: `Discard ${m[1]} ${m[2] ? `${m[2]} ` : ""}Energy to make their Active Pokémon ${m[3]}?` }]],
  // Before the damage, one of theirs switched in to take it.
  [new RegExp(`^Before doing damage, you may (?:choose ${N} of your opponent's Benched Pokémon and switch it with (?:1 of )?the Defending Pokémon|switch ${N} of your opponent's Benched Pokémon with (?:1 of )?the Defending Pokémon)\\.(?: If you do, this attack does (\\d+) damage to the new Defending Pokémon\\.)?(?: Your opponent chooses the Defending Pokémon to switch\\.)?(?: If you do, this attack does (\\d+) damage to the new Defending Pokémon\\.)?$`, "i"), (m) => {
    const n = m[3] || m[4];
    return [{ op: "ask", when: "before", steps: [{ op: "trainer", steps: [{ op: "gust" }] }], prompt: "Switch 1 of their Benched Pokémon with their Active Pokémon first?" }, ...(n ? [{ op: "baseIf", when: "before", test: "did", n: Number(n) }] : [])];
  }],
  // Devolving, in one more wording.
  [new RegExp(`^If ${FOE} is an evolved Pokémon, devolve it by returning the highest Stage Evolution card on it (?:in)?to your opponent's hand\\.$`, "i"), () => [{ op: "devolveFoe", when: "after" }]],
  // Their hand, down to a number; cards they choose.
  [/^(?:Discard random cards from your opponent's hand until they have (\d+) cards? in their hand|If your opponent has \d+ or more cards in (?:his or her|their) hand, discard a number of cards without looking until your opponent has (\d+) cards? left in (?:his or her|their) hand)\.$/, (m) => [{ op: "foeHandDownTo", when: "after", n: Number(m[1] || m[2]) }]],
  [/^If your opponent has \d+ or more cards in (?:his or her|their) hand, your opponent discards a number of cards until your opponent has (\d+) cards? left in (?:his or her|their) hand\.$/, (m) => [{ op: "foeHandDownTo", when: "after", n: Number(m[1]), random: false }]],
  [/^Your opponent puts a card from (?:his or her|their) hand on the bottom of (?:his or her|their) deck\.$/, () => [{ op: "foeChoosesHand", when: "after", to: "bottom" }]],
  [new RegExp(`^Your opponent chooses ${N} cards? from (?:their|his or her) hand and shuffles (?:those cards|it|them) into (?:their|his or her) deck\\.$`, "i"), (m) => [{ op: "foeChoosesHand", when: "after", n: count(m[1]) }]],
  // More that goes or is Knocked Out.
  [/^Discard all Pokémon Tools and Special Energy from all of your opponent's Pokémon\.$/, () => [{ op: "stripFoeAll", when: "after" }]],
  [/^Both Active Pokémon are Knocked Out\.$/, () => [{ op: "knockOutBoth", when: "after" }]],
  [/^Knock Out 1 of your opponent's Pokémon that has exactly (\d+) damage counters on it\.$/, (m) => [{ op: "knockOutCounted", when: "after", k: Number(m[1]) }]],
  [/^This Pokémon does (\d+) damage to itself for each damage counter on it\.$/, (m) => [{ op: "selfDamagePer", when: "after", n: Number(m[1]), per: "selfCounters" }]],
  [/^Put (\d+) damage counters? on each of your opponent's Pokémon that has any Energy(?: cards)? attached to it\.$/, (m) => [{ op: "counters", when: "after", n: Number(m[1]) * 10, where: "any", energized: true }]],
  [new RegExp(`^(Switch ${N} of your opponent's Benched Pokémon with (?:their|his or her|your opponent's) Active Pokémon|Switch in ${N} of your opponent's Benched Pokémon to the Active Spot)\\. The new Active Pokémon is now ${COND}, ${COND}, and ${COND}\\.$`, "i"), (m) => [{ op: "newActive", when: "after", steps: [cond(m[4]), cond(m[5]), cond(m[6])] }]],
  [/^Put all ([A-Z][\w'.é-]*(?: [A-Z][\w'.é-]*)*) cards from your discard pile into your hand\.$/, (m) => !/\b(?:Trainer|Supporter|Item|Energy|Pokémon|Stadium|Tool)\b/.test(m[1]) && fromDeck([{ op: "recover", what: `trainer=${m[1]}`, n: 99 }])],
  [/^If your opponent has a Stadium(?: card)? in play, discard it\.$/, () => [{ op: "when", when: "after", test: "stadium", foe: true, steps: fromDeck([{ op: "dropStadium" }]) }]],
  // Another cost: "If your opponent has any Ultra Beasts in play, this attack can be used for Colorless" (export altCost).
  [/^If (.+?), this attack can be used for ((?:Grass|Fire|Water|Lightning|Psychic|Fighting|Darkness|Metal|Fairy|Colorless)+)\.$/, (m) => {
    const t = testOf(m[1]);
    const cost = m[2].match(/Grass|Fire|Water|Lightning|Psychic|Fighting|Darkness|Metal|Fairy|Colorless/g);
    return t && [{ op: "costIf", when: "before", ...t, cost }];
  }],
];
PATTERNS.push(...BATCH8);

/** "If tails, this attack does 10 damage" beside a coin that adds damage: nothing more than the printed damage. */
const plainTails = (words) => /^this attack does \d+ damage(?: \(to the Defending Pokémon\))?$/.test(words);
/** An effect after the damage in a clause ("the Defending Pokémon is now Paralyzed"), or null. */
const clause = (words) => afterOnly(`${upper(words)}.`);

const BATCH9 = [
  // A coin that adds damage, with what heads and tails also do: "and the Defending Pokémon is now Paralyzed; if tails, ...".
  [/^Flip a coin\. If heads, this attack does (?:\d+ damage plus )?(\d+) (?:more )?damage(?:,? and (?!if )(.+?))?(?:(?:\.|;) [Ii]f tails, (.+?))?\.$/, (m) => {
    const heads = m[2] ? clause(m[2]) : [];
    const tails = !m[3] || plainTails(m[3]) ? [] : clause(m[3]);
    if (!heads || !tails) return null;
    return [{ op: "flipBonus", when: "before", n: Number(m[1]) }, ...(heads.length || tails.length ? [{ op: "onCoin", when: "after", heads, tails }] : [])];
  }],
  [/^Flip a coin\. If heads, this attack does (\d+) damage times the (?:amount|number) of (.+)\.$/, (m) => {
    const c = countOf(m[2]);
    return c && [{ op: "flipOrNothing", when: "before" }, { op: "bonusPer", when: "before", how: "times", n: Number(m[1]), per: c.per, ...(c.type ? { type: c.type } : {}) }];
  }],
  // "You may flip a coin. If heads, this attack does 80 damage. If tails, this attack does nothing.": asked before the damage.
  [/^(?:Before doing damage, you|You) may flip a coin\. (?:If heads, this attack (?:does (\d+) (more )?damage(?: instead)?|'s base damage is (\d+))\. If tails, this attack does nothing|If tails, this attack does nothing\. If heads, this attack (?:does (\d+) (more )?damage(?: instead)?|'s base damage is (\d+)))\.$/, (m) => {
    const n = Number(m[1] || m[3] || m[4] || m[6]);
    const more = Boolean(m[2] || m[5]);
    return [{ op: "ask", when: "before", steps: [{ op: "flipOrNothing" }], prompt: `Flip a coin? Heads: this attack does ${n}${more ? " more" : ""} damage. Tails: it does nothing.` }, { op: more ? "bonusIf" : "baseIf", when: "before", n, test: "did" }];
  }],
  [new RegExp(`^Flip a coin\\. If heads, ${FOE} is also ${COND}\\.$`, "i"), (m) => [{ op: "flip", when: "after", heads: [cond(m[1])] }]],
  [new RegExp(`^Flip a coin\\. If heads, ${FOE} is now ${COND}, and discard an Energy from that Pokémon\\.$`, "i"), (m) => [{ op: "flip", when: "after", heads: [cond(m[1]), { op: "discardFoeEnergy", n: 1 }] }]],
  [new RegExp(`^Flip a coin\\. If heads, ${FOE} is now ${COND} and can't retreat during your opponent's next turn\\.$`, "i"), (m) => [{ op: "flip", when: "after", heads: [cond(m[1]), mark("noRetreat", { on: "foe" })] }]],
  [/^Your opponent can't play Trainer cards during (?:his or her|their) next turn\.$/, () => [{ op: "lockHand", when: "after", kinds: ["trainer"] }]],
  // "You may discard all Energy from this Pokémon. If you do, your opponent's Active Pokémon is now Paralyzed.": after the damage,
  // asked only when the price can be paid, and what follows only once it is.
  [/^You may (.+?)\. If you do, (.+)$/, (m) => {
    const price = compileOne(`${upper(m[1])}.`);
    const then = afterOnly(upper(m[2]));
    if (!price || !then || !price.every((step) => step.when === "after" && PRICES.has(step.op) && step.op !== "trainer")) return null;
    return [{ op: "mayDo", when: "after", steps: price, then, prompt: `${upper(m[1])}?` }];
  }],
  [/^If your opponent has a Stadium card in play, discard it\. If you do, (.+)$/, (m) => {
    const then = afterOnly(upper(m[1]));
    return then && [{ op: "when", when: "after", test: "stadium", foe: true, steps: [{ op: "trainer", steps: [{ op: "dropStadium" }] }, ...then] }];
  }],
  [/^(?:Flip a coin\. If heads, y|Y)our opponent can't play (Trainer|Supporter|Item) cards during (?:his or her|their) next turn\.$/, (m) => {
    const lock = { op: "lockHand", when: "after", kinds: [m[1].toLowerCase()] };
    return /^Flip/.test(m[0]) ? [{ op: "flip", when: "after", heads: [lock] }] : [lock];
  }],
  [/^Your opponent can't play any (Item|Supporter) cards from (?:his or her|their) hand during your opponent's next turn\.$/, (m) => [{ op: "lockHand", when: "after", kinds: [m[1].toLowerCase()] }]],
  [new RegExp(`^${FOE} is now ${COND} and can't retreat during your opponent's next turn\\.$`, "i"), (m) => [cond(m[1]), mark("noRetreat", { on: "foe" })]],
  // "already has any damage counters on it": judged before the damage.
  [new RegExp(`^If ${FOE} already has any damage counters on it, (?:${FOE}|that Pokémon) is now ${COND}\\.$`, "i"), (m) => heldIf({ test: "foeDamaged" }, [cond(m[1])])],
  [/^If you have less than (\d+) cards in your hand, draw cards until you have \1 cards in your hand\.$/, (m) => fromDeck([{ op: "drawTo", n: Number(m[1]) }])],
  [/^(?:Search your discard pile for|Choose) up to (\d+) (.+?) (?:from your (hand|discard pile) )?and attach them to 1 of your Pokémon\.$/, (m) => {
    const what = whatOf(m[2]);
    if (!/^(basicEnergy|energy)(:\w+)?$/.test(what) || (/^Choose/.test(m[0]) && !m[3]) || (/^Search/.test(m[0]) && m[3])) return null;
    return fromDeck([{ op: "attachPick", zone: m[3] === "hand" ? "hand" : "discard", what, to: "any", whoType: "", n: Number(m[1]), upTo: true }]);
  }],
  [/^You may have your opponent switch the Defending Pokémon with 1 o[rf] his or her Benched Pokémon\.$/, () => [{ op: "may", when: "after", steps: [{ op: "switchFoe" }], prompt: "Have your opponent switch their Active Pokémon with 1 of their Benched Pokémon?" }]],
  [/^Your opponent shuffles (?:their|his or her) Active Pokémon and all (?:attached cards|cards attached to it) into (?:their|his or her) deck\.$/, () => [{ op: "shuffleFoeActive", when: "after" }]],
  [/^Your opponent puts (?:their|his or her|the Defending) (?:Active )?Pokémon and all cards attached to it into (?:their|his or her) hand\.$/, () => [{ op: "shuffleFoeActive", when: "after", to: "hand" }]],
  [/^Flip a coin\. If heads, discard your opponent's Active Pokémon and all attached cards\.$/, () => [{ op: "flip", when: "after", heads: [{ op: "shuffleFoeActive", to: "discard" }] }]],
  [new RegExp(`^Flip ${N} coins\\. If (?:both|all) of them are heads, this attack does \\d+ damage plus (\\d+) more damage\\.$`, "i"), (m) => [{ op: "flipAll", when: "before", coins: count(m[1]), n: Number(m[2]) }]],
  [/^Flip a coin until you get tails\. This attack does (\d+) damage times the number of heads you get\.$/, (m) => [{ op: "flipUntilTails", when: "before", n: Number(m[1]) }]],
  [/^(?:This attack does|Does) (\d+) damage times the total amount of (.+)\.$/, (m) => perCount("times", m[1], m[2])],
  [/^This attack does (\d+) (more )?damage for each of your opponent's Pokémon that has an Ability\.$/, (m) => [{ op: "bonusPer", when: "before", n: Number(m[1]), per: "foeAbility", ...(m[2] ? {} : { how: "times" }) }]],
  [/^This attack does (\d+) more damage for each Prize card your opponent took (?:during|on) their last turn\.$/, (m) => [{ op: "bonusPer", when: "before", n: Number(m[1]), per: "foeTookLast" }]],
  // "Put 1 damage counter on the Defending Pokémon for each damage counter on this Pokémon".
  [new RegExp(`^Put (\\d+) damage counters? on ${FOE} for each (.+)\\.$`), (m) => {
    const c = countOf(m[2]);
    return c && [{ op: "countersPer", when: "after", per: c.per, ...(c.type ? { type: c.type } : {}), k: Number(m[1]) }];
  }],
  // A card from the hand that must be discarded, or the attack does nothing.
  [new RegExp(`^Discard ${N} (.+?) from your hand(?:\\. If you (?:can't|don't)(?: discard (?:a card|\\d+ cards in this way))?,| or) this attack does nothing\\.$`, "i"), (m) => {
    const k = count(m[1]);
    const what = /^cards?$/.test(m[2]) ? "any" : whatOf(m[2]);
    if (!what || !k) return null;
    return [{ op: "cancelIf", when: "before", test: "handHas", k, what, not: true }, { op: "pay", when: "before", from: "hand", what, n: k, exact: true }];
  }],
  [/^(Discard .+? (?:from|attached to) this Pokémon), and (.+)$/, (m) => {
    const first = compileOne(`${m[1]}.`);
    const then = afterOnly(upper(m[2]));
    return first && then && first.every((step) => step.when === "after") ? [...first, ...then] : null;
  }],
  [/^This Pokémon is Knocked Out\.$/, () => [{ op: "selfKo", when: "after" }]],
  [/^Discard your hand\.$/, () => fromDeck([{ op: "discardHand" }])],
  [/^Shuffle your hand into your deck\.$/, () => fromDeck([{ op: "shuffleHand" }])],
  [/^Shuffle your hand into your deck\. Draw up to (\d+) cards\.$/, (m) => fromDeck([{ op: "shuffleHand" }, { op: "drawUpTo", n: Number(m[1]) }])],
  [/^Each player draws (a card|\d+ cards)\.$/, (m) => fromDeck([{ op: "draw", n: count(m[1].split(" ")[0]) }, { op: "foeDraw", n: count(m[1].split(" ")[0]) }])],
  [new RegExp(`^Discard the top ${N} cards from your deck\\.$`, "i"), (m) => fromDeck([{ op: "mill", n: count(m[1]) }])],
  [/^Discard the top card of each player's deck\.$/, () => [...fromDeck([{ op: "mill", n: 1 }]), { op: "mill", when: "after", n: 1 }]],
  [/^Discard this Pokémon and all (?:attached cards|cards attached to it)\.$/, () => [{ op: "selfAway", when: "after", to: "discard" }]],
  [/^(You may p|P)ut this Pokémon into your hand\. \(Discard all cards attached to this Pokémon\.\)$/, (m) => {
    const away = { op: "selfAway", to: "handBare" };
    return m[1] === "P" ? [{ ...away, when: "after" }] : [{ op: "may", when: "after", steps: [away], prompt: "Put this Pokémon into your hand (discarding all cards attached to it)?" }];
  }],
  [new RegExp(`^Remove all Special Conditions from ${FOE}\\.$`), () => [{ op: "cureFoe", when: "after" }]],
  [new RegExp(`^(?:If ${FOE} (?:was|is) Asleep, it is no longer Asleep|Remove the Special Condition Asleep from ${FOE})\\.$`), () => [{ op: "cureFoe", when: "after", kind: "asleep" }]],
  [/^Discard all (Special Energy|Pokémon Tools?)(?: cards)? from (?:all|each) of your opponent's Pokémon\.$/, (m) => [{ op: "stripFoeAll", when: "after", ...(/Tool/.test(m[1]) ? { special: false } : { tools: false }) }]],
  [/^Discard all Pokémon Tool cards and Special Energy from each of your opponent's Pokémon\.$/, () => [{ op: "stripFoeAll", when: "after" }]],
  [new RegExp(`^Discard all (Special Energy|Pokémon Tool) cards (?:attached to|from) ${FOE}\\.$`), (m) => [{ op: "stripFoeAll", when: "after", active: true, ...(/Tool/.test(m[1]) ? { special: false } : { tools: false }) }]],
  // Healing Pokémon of a kind: "1 of your Benched Psychic Pokémon" (the player's pick), "each of your Basic Pokémon".
  [/^(?:Heal (\d+|all) damage from|Remove (\d+|all) damage counters? from) (1|each) of your (Benched )?(.+?)\.$/, (m) => {
    const what = monWhat(m[5]);
    // What the Trainer reader already reads (healing 1 of your Fire Pokémon) stays as it reads it.
    if (!what || asTrainer(m.input)) return null;
    const n = (m[1] || m[2]) === "all" ? 9990 : Number(m[1] || m[2]) * (m[2] ? 10 : 1);
    return [{ op: "healKind", when: "after", n, what, ...(m[4] ? { bench: true } : {}), ...(m[3] === "each" ? { each: true } : {}) }];
  }],
  [/^Remove (\d+) damage counters? from each of your Active Pokémon\.$/, (m) => [{ op: "healSelf", when: "after", n: Number(m[1]) * 10 }]],
  [new RegExp(`^Discard an Energy from ${OPP} ex\\.$`), () => [{ op: "when", when: "after", test: "foeBox", boxes: ["ex"], steps: [{ op: "discardFoeEnergy", n: 1 }] }]],
  [new RegExp(`^Discard an? ${TYPE} Energy and an? ${TYPE} Energy from this Pokémon\\.$`), (m) => [{ op: "discardEnergy", when: "after", n: 1, type: m[1] }, { op: "discardEnergy", when: "after", n: 1, type: m[2] }]],
  [new RegExp(`^Discard an? ${TYPE} and an? ${TYPE} Energy (?:attached to|from) this Pokémon\\.$`), (m) => [{ op: "discardEnergy", when: "after", n: 1, type: m[1] }, { op: "discardEnergy", when: "after", n: 1, type: m[2] }]],
  [/^Attach (\d+) (.+?) from your hand to 1 of your Pokémon\.$/, (m) => {
    const what = whatOf(m[2]);
    return Number(m[1]) > 1 && /^(basicEnergy|energy)(:\w+)?$/.test(what) ? fromDeck([{ op: "attachPick", zone: "hand", what, to: "any", whoType: "", n: Number(m[1]), exact: true }]) : null;
  }],
  [/^Discard a Stadium in play\. If you can't, this attack does nothing\.$/, () => [{ op: "cancelIf", when: "before", test: "stadium", not: true }, ...fromDeck([{ op: "dropStadium" }])]],
  // "This attack can't be used if your opponent has no Benched Pokémon": not offered then.
  [/^This attack can't be used (if|unless) (.+)\.$/, (m) => {
    const t = usableTest(m[2]);
    return t && [onlyIf(m[1] === "if" ? notTest(t) : t, `${m[1] === "if" ? "not if" : "only if"} ${m[2]}.`)];
  }],
  [new RegExp(`^Choose ${N} of your opponent's Benched Pokémon, and this attack does (\\d+) damage to it\\.${NO_TYPING_NOTE}$`, "i"), (m) => [{ op: "spread", when: "after", n: Number(m[2]), to: "bench", count: count(m[1]) }]],
  [new RegExp(`^Does (\\d+) damage to ${N} of your Pokémon,? and don't apply Weakness and Resistance to this damage\\.$`, "i"), (m) => [{ op: "spread", when: "after", n: Number(m[1]), to: "ownAny", count: count(m[2]), noTyping: true }]],
  // A reminder: what it is about does nothing without a Bench anyway.
  [/^(.+?) \(Ignore this effect if you don't have any Benched Pokémon\.\)$/, (m) => {
    const steps = compileOne(m[1]);
    return steps && steps.every((step) => ["spreadOwnEnergy", "moveOwnEnergy", "may"].includes(step.op) && (step.op !== "may" || step.steps.every((s) => ["spreadOwnEnergy", "moveOwnEnergy"].includes(s.op)))) ? steps : null;
  }],
  [/^(Switch (?:1 of your opponent's Benched Pokémon with the Defending Pokémon|the Defending Pokémon with 1 of your opponent's Benched Pokémon)\.) The new Defending Pokémon is now (Asleep|Burned|Confused|Paralyzed|Poisoned)\.$/, (m) => {
    const first = compileOne(m[1]);
    return first && [...first, { op: "when", when: "after", test: "foeBenchEmpty", not: true, steps: [cond(m[2])] }];
  }],
  [/^This attack does (\d+) damage for each (.+?)\. You can't do more than (\d+) damage in this way\.$/, (m) => perCount("times", m[1], m[2], { max: Number(m[3]) })],
  [/^Discard all (.+?) attached to this Pokémon\. This attack does (\d+) damage times the number of (?:Energy )?cards you discarded\.$/, (m) => {
    const energy = energyNamed(m[1]);
    return energy && [{ op: "pay", when: "before", from: "self", energy, all: true }, { op: "bonusPer", when: "before", how: "times", n: Number(m[2]), per: "paid" }];
  }],
  [/^Discard the top (\d+) cards of your deck\. This attack does (\d+) damage times the number of (.+?) discarded\.$/, (m) => {
    const per = paidKind(m[3]);
    return per != null && [{ op: "pay", when: "before", from: "deck", n: Number(m[1]) }, { op: "bonusPer", when: "before", how: "times", n: Number(m[2]), per: "paid", ...(per ? { type: per } : {}) }];
  }],
  [/^(?:You may d|D)iscard any number of cards from your hand\.$/, () => fromDeck([{ op: "toss", n: "all", upTo: true }])],
  [/^If (.+?), this attack does (\d+) more damage for each (.+)\.$/, (m) => {
    const t = testOf(m[1]);
    const per = perCount("more", m[2], m[3]);
    return t && per && beforeIf(t, per);
  }],
  [/^Attach an? (.+?) from your discard pile to 1 of your Benched (Team Plasma|Rapid Strike|Single Strike|Fusion Strike) Pokémon\.$/, (m) => {
    const what = whatOf(m[1]);
    return /^(basicEnergy|energy)(:\w+)?$/.test(what) && fromDeck([{ op: "attachPick", zone: "discard", what, to: "bench", whoType: "", who: `+${m[2]}`, n: 1 }]);
  }],
  [/^Choose up to (\d+) (.+?) from your discard pile and attach them to this Pokémon\.$/, (m) => {
    const what = whatOf(m[2]);
    return /^(basicEnergy|energy)(:\w+)?$/.test(what) && fromDeck([{ op: "attachPick", zone: "discard", what, to: "self", n: Number(m[1]), upTo: true }]);
  }],
  [/^Heal from this Pokémon (\d+) damage for each (.+)\.$/, (m) => {
    const c = countOf(m[2]);
    return c && [{ op: "healPer", when: "after", n: Number(m[1]), per: c.per, ...(c.type ? { type: c.type } : {}) }];
  }],
  [/^(?:Look at the top card of your opponent's deck\. )?You may have your opponent shuffle their deck\.$/, (m) => [...(/^Look/.test(m[0]) ? [{ op: "lookTop", when: "after" }] : []), { op: "may", when: "after", steps: [{ op: "foeShuffleDeck" }], prompt: "Have your opponent shuffle their deck?" }]],
  [/^Attach an? (.+?) from your hand to this Pokémon\. If you do, switch it with 1 of your Benched Pokémon\.$/, (m) => {
    const what = whatOf(m[1]);
    return /^(basicEnergy|energy)(:\w+)?$/.test(what) && [{ op: "when", when: "after", test: "handHas", what, steps: [...fromDeck([{ op: "attachPick", zone: "hand", what, to: "self", n: 1 }]), { op: "switchSelf" }] }];
  }],
  // Abilities taken away for a while (OPS.mute).
  [new RegExp(`^${FOE} has no Abilities until the end of your next turn\\.$`, "i"), () => [{ op: "mute", when: "after", kinds: "Ability", turns: [0, 1, 2] }]],
  [new RegExp(`^(Flip a coin\\. If heads, )?${FOE} can't (retreat or )?use any Poké-Powers (?:during|until the end of) your opponent's next turn\\.$`, "i"), (m) => {
    const steps = [{ op: "mute", when: "after", kinds: "Poké-Power", turns: [1] }, ...(m[2] ? [mark("noRetreat", { on: "foe" })] : [])];
    return m[1] ? [{ op: "flip", when: "after", heads: steps }] : steps;
  }],
  [/^(?:This Pokémon|It) can't retreat during your next turn\.$/, () => [mark("noRetreat", { mine: true })]],
  // Cards discarded from the hand, then as many drawn.
  [/^(?:You may discard up to (\d+) cards from your hand\. If you do, draw that many cards|Discard up to (\d+) cards from your hand\. For each card you discarded, draw a card|Discard as many cards as you like from your hand\. Then, draw that many cards)\.$/, (m) => {
    const n = Number(m[1] || m[2]) || "all";
    return fromDeck([{ op: "toss", n, upTo: true, pass: true }, { op: "drawPaid", per: 1 }]);
  }],
  [new RegExp(`^Discard (?:an?|1) ${TYPE} Energy(?: card)? and (?:an?|1) ${TYPE} Energy(?: card)? (?:attached to|from) this Pokémon\\.$`), (m) => [{ op: "discardEnergy", when: "after", n: 1, type: m[1] }, { op: "discardEnergy", when: "after", n: 1, type: m[2] }]],
  [new RegExp(`^Discard an? ${TYPE} Energy, an? ${TYPE} Energy, and an? ${TYPE} Energy (?:attached to|from) this Pokémon\\.$`), (m) => [1, 2, 3].map((i) => ({ op: "discardEnergy", when: "after", n: 1, type: m[i] }))],
  [new RegExp(`^Flip ${N} coins\\. If 1 or (?:both|more) of them (?:are|is) tails, this attack does nothing\\.$`, "i"), (m) => [{ op: "flipCancel", when: "before", coins: count(m[1]) }]],
  [/^This Pokémon also does (\d+) damage to itself for each damage counter on it\.$/, (m) => [{ op: "selfDamagePer", when: "after", n: Number(m[1]), per: "selfCounters" }]],
  // Damage to itself never has Weakness applied: the reminder changes nothing.
  [/^(?:This Pokémon does (\d+) damage to itself\. Don't apply Weakness to this damage|This Pokémon does (\d+) damage to itself,? and don't apply Weakness to this damage)\.$/, (m) => [{ op: "selfDamage", when: "after", n: Number(m[1] || m[2]) }]],
  [new RegExp(`^If ${FOE} is Knocked Out by this attack, take ${N} more Prize cards?\\.$`), (m) => [{ op: "bounty", when: "before", n: count(m[1]) }]],
  [/^Knock Out (each|1) of your opponent's Pokémon(?: in play)? that has (\d+) HP or less remaining\.$/, (m) => [{ op: "knockOutLow", when: "after", hp: Number(m[2]), ...(m[1] === "1" ? { pick: true } : {}) }]],
  [new RegExp(`^If ${OPP} has (\\d+) HP or less remaining, it is Knocked Out\\.$`), (m) => [{ op: "when", when: "after", test: "foeHpAtMost", k: Number(m[1]), steps: [{ op: "knockOut" }] }]],
  [/^If you go second, this attack does (\d+) more damage during your first turn\.$/, (m) => [{ op: "bonusIf", when: "before", n: Number(m[1]), test: "secondFirst" }]],
  [new RegExp(`^Search your deck for (?:an? |up to ${N} )?([A-Z][\\w'.é♀♂-]*(?: [A-Z][\\w'.é♀♂-]*)?) and put (?:it|them) onto your Bench\\. ${SHUFFLED}$`, "i"), (m) => {
    const what = monWhat(m[2]);
    return /^name=/.test(what) && fromDeck([{ op: "search", what, n: m[1] ? count(m[1]) : 1, to: "bench" }]);
  }],
  // "Discard a Plasma Energy attached to this Pokémon. If you can't discard a Plasma Energy, this attack does nothing."
  [/^Discard an? (Plasma Energy|Team Rocket's Energy) attached to this Pokémon\. If you can't discard an? \1, this attack does nothing\.$/, (m) => [
    { op: "cancelIf", when: "before", test: "energyCard", name: m[1], not: true },
    { op: "discardEnergy", when: "after", n: 1, name: m[1] },
  ]],
  // A coin for 1 of their Benched Pokémon, chosen before or after the flip (the same either way).
  [new RegExp(`^If your opponent has any Benched Pokémon, (?:choose 1 of them and flip a coin\\. If heads, this attack does (\\d+) damage to that Pokémon|flip a coin\\. If heads, choose 1 of them and this attack does (\\d+) damage to it)\\.${NO_TYPING_NOTE}$`), (m) => [
    { op: "flip", when: "after", heads: [{ op: "spread", when: "after", n: Number(m[1] || m[2]), to: "bench", count: 1 }] },
  ]],
  // "search your deck for any 1 card" is "a card".
  [/^(.*\b[Ss]earch your deck for )any 1 card( and put it into your hand\. .+)$/, (m) => compileOne(`${m[1]}a card${m[2]}`)],
];
PATTERNS.push(...BATCH9);

/** The condition steps of this kind anywhere in these steps (in a coin's heads or tails, behind a test), copied so they can be changed. */
function withCondition(steps, kind, change) {
  const copy = JSON.parse(JSON.stringify(steps));
  const found = [];
  const walk = (list) => {
    for (const step of list || []) {
      if (step.op === "condition" && step.kind === kind) found.push(step);
      walk(step.heads);
      walk(step.tails);
      walk(step.steps);
    }
  };
  walk(copy);
  if (found.length !== 1) return null;
  Object.assign(found[0], change);
  return copy;
}
/** "Flip a number of coins equal to the number of ...": the count (countOf), "amount" and "total number" read alike. */
function coinsOf(phrase) {
  const p = phrase.replace(/all of of /, "all of ");
  if (/^Energy cards attached to your opponent's Pokémon$/.test(p)) return { per: "energyKind", type: "foes|energy" };
  if (/^Pokémon in play$/.test(p)) return { per: "allKind", type: "pokemon" };
  return countOf(p);
}
/** "Flip a number of coins equal to ...": the coins, kept for what the heads and tails do (OPS.flipCount, or flipTimes for damage). */
const COINS_BY = "Flip a number of coins equal to the (?:total )?(?:number|amount) of (.+?)\\.";

const BATCH10 = [
  // A stronger Poison or a deeper Sleep, said after the sentence that gives it ("Flip a coin. If heads, the Defending Pokémon is
  // now Poisoned. Put 2 damage counters instead of 1 on that Pokémon between turns."): the one condition step it is about.
  [/^(.+?\.) (?:Put (\d+) damage counters instead of 1 on (?:that Pokémon|the Defending Pokémon|it) between turns|During Pokémon Checkup, put (\d+) damage counters on that Pokémon instead of 1|Your opponent now puts (\d+) damage counters on it instead of 1 after each player's turn \(even if it was already Poisoned\))\.$/, (m) => {
    const steps = compileText(m[1]);
    return steps && withCondition(steps, "poisoned", { counters: Number(m[2] || m[3] || m[4]) * 10 });
  }],
  [/^(.+?\.) (?:Your opponent flips|During Pokémon Checkup, your opponent flips|Flip|During Pokémon Checkup, flip) (\d+) coins instead of 1(?: between turns)?\. If either of them is tails, (?:that|the|the Defending|this) Pokémon is still Asleep\.$/, (m) => {
    const steps = compileText(m[1]);
    return steps && withCondition(steps, "asleep", { counters: Number(m[2]) });
  }],
  [/^(.+?\.) Put (\d+) damage counters instead of 3 on the Confused Pokémon\.$/, (m) => {
    const steps = compileText(m[1]);
    return steps && withCondition(steps, "confused", { counters: Number(m[2]) * 10 });
  }],
  // Coins by a count: "This attack does 20 damage plus 10 more damage for each heads", "You can't flip more than 3 coins in this way".
  [/^Flip a number of coins equal to the (?:total )?(?:number|amount) of (.+?)\. This attack does \d+ damage plus (\d+) (?:more )?damage for each heads\.$/, (m) => {
    const c = coinsOf(m[1]);
    return c && [{ op: "flipBonusEach", when: "before", n: Number(m[2]), per: c.per, ...(c.type ? { type: c.type } : {}) }];
  }],
  [/^Flip a number of coins equal to the (?:total )?(?:number|amount) of (.+?)\. This attack does (\d+) damage times the number of heads\.(?: You can't flip more than (\d+) coins in this way\.)?$/, (m) => {
    const c = coinsOf(m[1]);
    return c && [{ op: "flipTimes", when: "before", n: Number(m[2]), per: c.per, ...(c.type ? { type: c.type } : {}), ...(m[3] ? { max: Number(m[3]) } : {}) }];
  }],
  [new RegExp(`^${COINS_BY} (?:If any of them (?:are|is) heads|For each heads), (.+)$`), (m) => {
    const c = coinsOf(m[1]);
    const steps = c && afterOnly(upper(m[2]));
    return steps && [{ op: "flipCount", when: "before", coins: 0, per: c.per, ...(c.type ? { type: c.type } : {}) }, /For each/.test(m[0]) ? { op: "perHeads", when: "after", steps } : { op: "onHeads", when: "after", min: 1, steps }];
  }],
  // Damage times the heads, and more for each heads or tails after it.
  [new RegExp(`^${COINS_BY} This attack does (\\d+) damage times the number of heads\\. (?:Then, for each heads, (.+)|Discard a number of ${TYPE} Energy cards attached to this Pokémon equal to the number of heads\\.|Then,? this Pokémon does (\\d+) damage times the number of tails to itself\\.)$`), (m) => {
    const c = coinsOf(m[1]);
    const each = m[3] ? afterOnly(upper(m[3])) : m[4] ? [{ op: "discardEnergy", when: "after", n: 1, type: m[4] }] : null;
    if (!c || (m[3] && !each)) return null;
    return [{ op: "flipTimes", when: "before", n: Number(m[2]), per: c.per, ...(c.type ? { type: c.type } : {}) }, each ? { op: "perHeads", when: "after", steps: each } : { op: "selfPerTails", when: "after", n: Number(m[5]) }];
  }],
  [/^Does \d+ damage plus (\d+) more damage for each (?:(Grass|Fire|Water|Lightning|Psychic|Fighting|Darkness|Metal|Fairy) )?Energy attached to this Pokémon but not used to pay for this attack's Energy cost\.$/, (m) => [{ op: "bonusPer", when: "before", n: Number(m[1]), per: "spareEnergy", ...(m[2] ? { type: m[2] } : {}) }]],
  [/^Choose 1 of your opponent's Benched Pokémon and switch it with the Defending Pokémon\.$/, () => fromDeck([{ op: "gust" }])],
  [/^\(?This attack can be used even if this Pokémon is Asleep\.\)?$/, () => [{ op: "asleepOk", when: "before" }]],
  // A coin: tails and nothing happens, heads and an effect after the damage too.
  [/^Flip a coin\. If tails, this attack does nothing\. If heads, (.+)$/, (m) => {
    const steps = afterOnly(upper(m[1]));
    return steps && [{ op: "flipOrNothing", when: "before" }, { op: "onCoin", when: "after", heads: steps }];
  }],
  // "If heads, this attack does 30 damage to the Defending Pokémon. If tails, the Defending Pokémon is now Paralyzed": no damage on tails.
  [/^Flip a coin\. If heads, this attack does (\d+) damage to the Defending Pokémon\. If tails, (.+)$/, (m) => {
    const steps = afterOnly(upper(m[2]));
    return steps && [{ op: "coin", when: "before", heads: [{ op: "setDamage", n: Number(m[1]) }], tails: [{ op: "setDamage", n: 0 }] }, { op: "onCoin", when: "after", tails: steps }];
  }],
  [new RegExp(`^Search your deck for as many (.+?) as you like and put them onto your Bench\\. ${SHUFFLED}$`), (m) => {
    const what = monWhat(m[1]);
    return /^(name=|basic)/.test(what) && fromDeck([{ op: "search", what, n: "all", to: "bench" }]);
  }],
  // What their Defending Pokémon can't have done to it from the hand during their next turn (engine.js legalActions).
  [/^During your opponent's next turn, prevent all effects of attacks, including damage, done to this Pokémon by your opponent's Evolved Pokémon\.$/, () => [mark("shield", { from: "evolution" })]],
  [/^(?:Your opponent can't attach Energy(?: cards)? from (?:his or her|their) hand to the Defending Pokémon during (?:his or her|their) next turn|During your opponent's next turn, Energy can't be attached from your opponent's hand to the Defending Pokémon|Energy can't be attached to the Defending Pokémon from your opponent's hand during their next turn)\.$/, () => [mark("noEnergy", { on: "foe" })]],
  [/^(?:Your opponent can't play any Pokémon from (?:his or her|their) hand to evolve the Defending Pokémon during (?:his or her|their) next turn|During your opponent's next turn, Pokémon can't be played from your opponent's hand to evolve the Defending Pokémon)\.$/, () => [mark("noEvolve", { on: "foe" })]],
  [/^During your opponent's next turn, if they attach an Energy card from their hand to the Defending Pokémon, their turn ends\.$/, () => [mark("attachEnds", { on: "foe" })]],
  [/^Choose 1 of the Defending Pokémon's attacks\. (?:That Pokémon can use only that attack during your opponent's next turn|During your opponent's next turn, that Pokémon can only use that attack)\.$/, () => [{ op: "lockFoeAttack", when: "after", only: true }]],
  [/^Choose either (Asleep|Burned|Confused|Paralyzed|Poisoned) or (Asleep|Burned|Confused|Paralyzed|Poisoned)\. (?:The Defending Pokémon|Your opponent's Active Pokémon) is now affected by that Special Condition\.$/, (m) => [{ op: "chooseCondition", when: "after", kinds: [m[1], m[2]] }]],
  [/^Choose either (Asleep|Burned|Confused|Paralyzed|Poisoned) or (Asleep|Burned|Confused|Paralyzed|Poisoned), and either (Asleep|Burned|Confused|Paralyzed|Poisoned) or (Asleep|Burned|Confused|Paralyzed|Poisoned)\. The Defending Pokémon is now affected by both Special Conditions\.$/, (m) => [{ op: "chooseCondition", when: "after", kinds: [m[1], m[2]] }, { op: "chooseCondition", when: "after", kinds: [m[3], m[4]] }]],
  [/^The Defending Pokémon is Knocked Out at the end of your opponent's next turn\.$/, () => [mark("doomKo", { on: "foe" })]],
  [new RegExp(`^Flip ${N} coins\\. For each tails, (.+)$`, "i"), (m) => {
    const steps = afterOnly(upper(m[2]));
    return steps && [{ op: "flipCount", when: "before", coins: count(m[1]) }, { op: "perTails", when: "after", steps }];
  }],
  [/^Discard up to (\d+) (.+?) from your hand\. For each card you discarded, draw (\d+) cards\.$/, (m) => {
    const what = whatOf(m[2]);
    return what && fromDeck([{ op: "toss", n: Number(m[1]), what, upTo: true, pass: true }, { op: "drawPaid", per: Number(m[3]) }]);
  }],
  // "Discard all Lightning Energy attached to this Pokémon. Flip a coin for each Energy card you discarded.": paid before the damage.
  [new RegExp(`^Discard all (?:${TYPE} )?Energy(?: cards)? attached to this Pokémon(?: in order to use this attack)?\\. (?:Flip a coin for each Energy card you discarded|Flip a number of coins equal to the number of (?:${TYPE} )?Energy cards you discarded)\\. This attack does (?:(\\d+) damage times the number of heads|\\d+ damage plus (\\d+) (?:more )?damage for each heads)\\.$`), (m) => {
    if (m[2] && m[1] !== m[2]) return null;
    return [{ op: "pay", when: "before", from: "self", energy: m[1] ? { type: m[1] } : {}, all: true }, { op: m[3] ? "flipTimes" : "flipBonusEach", when: "before", n: Number(m[3] || m[4]), per: "paid" }];
  }],
  [new RegExp(`^You may switch this Pokémon with 1 of your Benched Pokémon\\. If you do, (?:you may )?move (?:as many|any number of) (?:${TYPE} )?Energy cards attached to this Pokémon (?:as you like )?to the new Active Pokémon\\.$`), (m) => [{ op: "may", when: "after", steps: [{ op: "switchSelf", then: [{ op: "carryToActive", ...(m[1] ? { type: m[1] } : {}) }] }], prompt: "Switch this Pokémon with 1 of your Benched Pokémon (and move Energy to the new Active Pokémon)?" }]],
  [/^Flip a coin\. If heads, (?:the Defending Pokémon is now (?:either )?((?:(?:Asleep|Burned|Confused|Paralyzed|Poisoned), )+)or (Asleep|Burned|Confused|Paralyzed|Poisoned) \(your choice\)|choose whether the Defending Pokémon becomes ((?:(?:Asleep|Burned|Confused|Paralyzed|Poisoned), )+)or (Asleep|Burned|Confused|Paralyzed|Poisoned))\.$/, (m) => {
    const kinds = [...(m[1] || m[3]).split(", ").filter(Boolean), m[2] || m[4]];
    return [{ op: "flip", when: "after", heads: [{ op: "chooseCondition", kinds }] }];
  }],
  [new RegExp(`^If ${FOE} already has any damage counters on it, (?:${FOE}|that Pokémon) is now ${COND} and ${COND}\\.$`, "i"), (m) => heldIf({ test: "foeDamaged" }, [cond(m[1]), cond(m[2])])],
  [/^Before doing damage, choose 1 of your opponent's Benched Pokémon and switch it with (?:his or her|their) Active Pokémon\.$/, () => [{ op: "trainer", when: "before", steps: [{ op: "gust" }] }]],
  [/^Flip a coin\. If tails, this attack does (?:nothing|no damage) to the Defending Pokémon and this Pokémon does (\d+) damage to itself\.$/, (m) => [{ op: "coin", when: "before", tails: [{ op: "setDamage", n: 0 }] }, { op: "onCoin", when: "after", tails: [{ op: "selfDamage", n: Number(m[1]) }] }]],
  [/^If the Defending Pokémon (?:would be|is) Knocked Out by this attack, this Pokémon does (\d+) damage to itself\.$/, (m) => [{ op: "when", when: "after", test: "foeKo", steps: [{ op: "selfDamage", n: Number(m[1]) }] }]],
  [/^Discard an? (.+?) from your hand\.$/, (m) => {
    const what = whatOf(m[1]);
    return what && what !== "any" && fromDeck([{ op: "toss", n: 1, what }]);
  }],
  // A card from the discard pile or the hand, and what comes of it only if there was one ("If you do, remove 2 damage counters").
  [/^Search your discard pile for an? (.+?) and attach it to this Pokémon\. If you do, (.+)$/, (m) => {
    const what = whatOf(m[1]);
    const then = afterOnly(upper(m[2]));
    return /^(basicEnergy|energy)(:\w+)?$/.test(what) && then && [{ op: "when", when: "after", test: "discardAtLeast", k: 1, what, steps: [...fromDeck([{ op: "attachPick", zone: "discard", what, to: "self", n: 1 }]), ...then] }];
  }],
  [/^Discard an? (.+?) from your hand\. If you do, (.+)$/, (m) => {
    // Any card: the Trainer reader reads it (a price, T_OPS.cost).
    const what = !/^card$/.test(m[1]) && whatOf(m[1]);
    const then = what && afterOnly(upper(m[2]));
    return then && [{ op: "when", when: "after", test: "handHas", k: 1, what, steps: [...fromDeck([{ op: "toss", n: 1, what }]), ...then] }];
  }],
  // Remaining HP side by side, judged before the damage.
  [/^Before doing damage, count the remaining HP of the Defending Pokémon and this Pokémon\. If the Defending Pokémon has fewer remaining HP than this Pokémon(?:'s)?, this attack does (?:(\d+) damage instead|\d+ damage plus (\d+) more damage)\.$/, (m) => [m[1] ? { op: "baseIf", when: "before", n: Number(m[1]), test: "foeHpBelow" } : { op: "bonusIf", when: "before", n: Number(m[2]), test: "foeHpBelow" }]],
  [/^If, before doing damage, your opponent's Active Pokémon has (more|less|fewer) remaining HP than this Pokémon, this attack does (\d+) more damage\.$/, (m) => [{ op: "bonusIf", when: "before", n: Number(m[2]), test: m[1] === "more" ? "hpBelowFoe" : "foeHpBelow" }]],
  // Only 10 HP can be left below 20: "is 10" is "10 or less".
  [/^If this Pokémon's remaining HP is 10, this attack does (\d+) more damage\.$/, (m) => [{ op: "bonusIf", when: "before", n: Number(m[1]), test: "selfHpAtMost", k: 10 }]],
  // Old doubles wording, tidied (tidy): the switch is before the damage when the damage is to the new one.
  [/^Switch 1 of your opponent's Benched Pokémon with the Defending Pokémon\. This attack does (\d+) damage to the new Defending Pokémon\.$/, (m) => [{ op: "trainer", when: "before", steps: [{ op: "gust" }] }, { op: "setDamage", when: "before", n: Number(m[1]) }]],
  [/^(Switch (?:1 of your opponent's Benched Pokémon with the Defending Pokémon|the Defending Pokémon with 1 of your opponent's Benched Pokémon)\.) The new Defending Pokémon is now (Asleep|Burned|Confused|Paralyzed|Poisoned) and (Asleep|Burned|Confused|Paralyzed|Poisoned)\.$/, (m) => {
    const first = compileOne(m[1]);
    return first && [...first, { op: "when", when: "after", test: "foeBenchEmpty", not: true, steps: [cond(m[2]), cond(m[3])] }];
  }],
  // Evolving from the deck.
  [new RegExp(`^Search your deck for a card that evolves from (?:1|one) of your Pokémon and put it on(?:to)? that Pokémon\\. \\(This counts as evolving that Pokémon\\.\\) ${SHUFFLED}$`), () => fromDeck([{ op: "evolveDeck" }])],
  // Only their Benched Pokémon of one type ("Does 10 damage to each Grass Pokémon on your opponent's Bench.").
  [new RegExp(`^(?:This attack d|D)oes (\\d+) damage to each (?:of your opponent's Benched ${TYPE} Pokémon|${TYPE} Pokémon on your opponent's Bench)\\.(?: \\(Don't apply Weakness and Resistance for Benched Pokémon\\.\\))?$`), (m) =>
    [{ op: "spread", when: "after", n: Number(m[1]), to: "bench", ptype: m[2] || m[3] }]],
  // Both Active Pokémon: the Defending Pokémon as usual, and this one too (no Weakness or Resistance on your own).
  [/^(?:This attack d|D)oes (\d+) damage to each Active Pokémon \(both yours and your opponent's\)\.$/, (m) => [{ op: "setDamage", when: "before", n: Number(m[1]) }, { op: "selfDamage", when: "after", n: Number(m[1]) }]],
];
PATTERNS.push(...BATCH10);

/** The last Standard attacks (2026-11-28). */
const BATCH_STD = [
  [/^Flip a coin\. If heads, choose 1 of your opponent's (Benched )?Pokémon\. Shuffle that Pokémon and all (?:attached cards|cards attached to it) into (?:their|your opponent's) deck\.$/, (m) => [{ op: "flip", when: "after", heads: [{ op: "shuffleFoeOne", where: m[1] ? "bench" : "any" }] }]],
  [/^Shuffle 1 of your opponent's (Benched )?Pokémon and all (?:attached cards|cards attached to it) into (?:their|your opponent's) deck\.$/, (m) => [{ op: "shuffleFoeOne", when: "after", where: m[1] ? "bench" : "any" }]],
  [/^If (.+?), this attack does (\d+) damage\.$/, (m) => {
    const t = testOf(m[1]);
    return t && [{ op: "baseIf", when: "before", n: Number(m[2]), ...t }];
  }],
  [/^If (.+?), ignore all Energy in this attack's cost\.$/, (m) => {
    const t = testOf(m[1]);
    return t && [{ op: "costIf", when: "before", ...t, cost: [] }];
  }],
  [/^This attack does (\d+) damage to 1 of your opponent's Pokémon that has any Special Energy attached\.(?: \(Don't apply Weakness and Resistance for Benched Pokémon\.\))?$/, (m) => [{ op: "spread", when: "after", n: Number(m[1]), to: "any", count: 1, special: true }]],
  [/^This attack does (\d+) damage to 1 of your opponent's Benched Pokémon ex or Benched Pokémon V\.(?: \(Don't apply Weakness and Resistance for Benched Pokémon\.\))?$/, (m) => [{ op: "spread", when: "after", n: Number(m[1]), to: "bench", count: 1, boxes: ["ex", "V", "VMAX", "VSTAR"] }]],
  [/^This attack does (\d+) damage to each of your opponent's Pokémon ex and Pokémon V\.$/, (m) => [{ op: "spread", when: "after", n: Number(m[1]), to: "any", boxes: ["ex", "V", "VMAX", "VSTAR"] }]],
  [/^This attack does (\d+) damage to each Pokémon that has any damage counters on it \(both yours and your opponent's\), except for this Pokémon\.(?: \(Don't apply Weakness and Resistance for Benched Pokémon\.\))?$/, (m) => [{ op: "spread", when: "after", n: Number(m[1]), to: "any", damaged: true }, { op: "spread", when: "after", n: Number(m[1]), to: "ownAny", damaged: true, notSelf: true }]],
  [/^This attack also does (\d+) damage to each Benched Pokémon that has any damage counters on it \(both yours and your opponent's\)\.(?: \(Don't apply Weakness and Resistance for Benched Pokémon\.\))?$/, (m) => [{ op: "spread", when: "after", n: Number(m[1]), to: "bench", damaged: true }, { op: "spread", when: "after", n: Number(m[1]), to: "ownBench", damaged: true }]],
  [/^Put damage counters on each of your opponent's Benched Pokémon until its remaining HP is (\d+)\.$/, (m) => [{ op: "countersToEach", when: "after", hp: Number(m[1]) }]],
];
PATTERNS.push(...BATCH_STD);

/** The last Standard attacks, batch 2: searches, coins, Energy, hands. */
const BATCH_STD2 = [
  [/^Search your deck for up to (\d+) Basic Energy cards of different types, reveal them, and put them into your hand\. Then, shuffle your deck\.$/, (m) => fromDeck([{ op: "search", what: "basicEnergy", n: Number(m[1]), rule: { distinct: true } }])],
  [/^Search your deck for up to (\d+) Basic Energy cards of different types and attach them to your Tera Pokémon in any way you like\. Then, shuffle your deck\.$/, (m) => fromDeck([{ op: "fetchEnergy", what: "basicEnergy", n: Number(m[1]), to: "spread", where: { to: "any", who: "tera" }, rule: { distinct: true } }])],
  [/^Search your deck for up to (\d+) Basic Energy cards and attach them to your (Ancient|Future) Pokémon in any way you like\. Then, shuffle your deck\.$/, (m) => fromDeck([{ op: "fetchEnergy", what: "basicEnergy", n: Number(m[1]), to: "spread", where: { to: "any", who: `pokemon+${m[2]}` } }])],
  [new RegExp(`^Search your deck for an? (Energy card|Basic ${TYPE} Energy card) and attach it to 1 of your Benched ${POKE_TYPE} Pokémon\\. Then, shuffle your deck\\.$`), (m) => fromDeck([{ op: "fetchEnergy", what: m[2] ? `basicEnergy:${m[2]}` : "energy", n: 1, to: "one", where: { to: "bench", whoType: m[3] } }])],
  [new RegExp(`^Search your deck for up to (\\d+) Basic ${TYPE} Energy cards and up to (\\d+) Basic ${TYPE} Energy cards and attach them to your Pokémon in any way you like\\. Then, shuffle your deck\\.$`), (m) => fromDeck([{ op: "fetchEnergy", what: `basicEnergy:${m[2]}|basicEnergy:${m[4]}`, n: Number(m[1]) + Number(m[3]), to: "spread", rule: { most: [[`basicEnergy:${m[2]}`, Number(m[1])], [`basicEnergy:${m[4]}`, Number(m[3])]] } }])],
  [new RegExp(`^Search your deck for up to (\\d+) Pokémon with ${TYPE} Resistance, reveal them, and put them into your hand\\. Then, shuffle your deck\\.$`), (m) => fromDeck([{ op: "search", what: `resist=${m[2]}`, n: Number(m[1]) }])],
  [/^(?:You may )?[Ss]earch your deck for any number of Pokémon that have "(.+?)" in their name and put them onto your Bench\. Then, shuffle your deck\.$/, (m) => fromDeck([{ op: "search", what: `basic~${m[1]}`, n: "all", to: "bench" }])],
  [/^Search your deck for up to (\d+) in any combination of ([A-Z][\w.'-]*) and \2 ex and put them onto your Bench\. Then, shuffle your deck\.$/, (m) => fromDeck([{ op: "search", what: `name=${m[2]}|name=${m[2]} ex`, n: Number(m[1]), to: "bench" }])],
  [/^(?:You may )?[Ss]earch your deck for any number of Basic ([A-Z][\w.-]*'s) Pokémon and put them onto your Bench\. Then, shuffle your deck\.$/, (m) => fromDeck([{ op: "search", what: `basic&&name^${m[1]}`, n: "all", to: "bench" }])],
  [/^(?:You may )?[Ss]earch your deck for any number of ([A-Z][\w.'é-]*(?: [A-Z][\w.'é-]*)*) cards, reveal them, and put them into your hand\. Then, shuffle your deck\.$/, (m) => !/\b(?:Pokémon|Energy|Trainer|Supporter|Item|Stadium|Tool)\b/.test(m[1]) && fromDeck([{ op: "search", what: `card=${m[1]}`, n: "all" }])],
  [/^Search your deck for a number of cards up to the number of your Benched Pokémon and put them into your hand\. Then, shuffle your deck\.$/, () => fromDeck([{ op: "search", what: "any", n: "bench" }])],
  [/^For each of your Benched Pokémon, search your deck for a card that evolves from that Pokémon and put it onto that Pokémon to evolve it\. Then, shuffle your deck\.$/, () => fromDeck([{ op: "evolveEach" }])],
  [/^Put 1 of your Benched Pokémon and all attached cards into your hand\.$/, () => fromDeck([{ op: "bounce", bench: true }])],
  [/^Shuffle 1 of your Benched Pokémon and all attached cards into your deck\.$/, () => fromDeck([{ op: "bounce", bench: true, to: "deck" }])],
  // Coins.
  [/^Flip a coin until you get tails\. Search your deck for a number of cards up to the number of heads and put them into your hand\. Then, shuffle your deck\.$/, () => [{ op: "flipRepeat", when: "after", until: true, steps: fromDeck([{ op: "search", what: "any", n: 1 }]) }]],
  [new RegExp(`^Flip a coin until you get tails\\. Search your deck for an amount of Basic (?:${TYPE} )?Energy up to the number of heads and attach it to this Pokémon\\. Then, shuffle your deck\\.$`), (m) => [{ op: "flipRepeat", when: "after", until: true, steps: fromDeck([{ op: "fetchEnergy", what: m[1] ? `basicEnergy:${m[1]}` : "basicEnergy", n: 1, to: "self" }]) }]],
  [new RegExp(`^Flip ${N} coins\\. Attach (?:a number|an amount) of Basic (?:${TYPE} )?Energy(?: cards?)? up to the number of heads from your discard pile to your Benched Pokémon in any way you like\\.$`, "i"), (m) => [{ op: "flipRepeat", when: "after", coins: count(m[1]), steps: fromDeck([{ op: "attachPick", zone: "discard", what: m[2] ? `basicEnergy:${m[2]}` : "basicEnergy", to: "bench", n: 1, upTo: true }]) }]],
  [new RegExp(`^Flip ${N} coins\\. If both of them are heads, search your deck for a Pokémon and put it onto your Bench\\. Then, shuffle your deck\\.$`, "i"), (m) => [{ op: "flipAllThen", when: "after", coins: count(m[1]), steps: fromDeck([{ op: "search", what: "pokemon", n: 1, to: "bench" }]) }]],
  [new RegExp(`^Flip ${N} coins\\. If all of them are heads, Knock Out 1 of your opponent's Pokémon\\.$`, "i"), (m) => [{ op: "flipAllThen", when: "after", coins: count(m[1]), steps: [{ op: "knockOutOne" }] }]],
  [/^Flip a coin\. If heads, Knock Out your opponent's Active Basic Pokémon\. If tails, Knock Out 1 of your opponent's Benched Basic Pokémon\.$/, () => [{ op: "flip", when: "after", heads: [{ op: "when", test: "foeStage", stage: "basic", steps: [{ op: "knockOut" }] }], tails: [{ op: "knockOutOne", stage: "basic", bench: true }] }]],
  [/^Flip a coin for each ([A-Z][\w.'-]*) you have in play\. For each heads, discard the top (\d+) cards of your opponent's deck\.$/, (m) => [{ op: "flipCount", when: "after", per: "ownNamed", type: m[1] }, { op: "perHeads", when: "after", steps: [{ op: "mill", n: Number(m[2]) }] }]],
  [/^Your opponent flips a coin for each of their Benched Pokémon\. This attack does (\d+) damage to your opponent's Active Pokémon for each tails\.$/, (m) => [{ op: "flipCount", when: "before", per: "foeBench" }, { op: "tailsTimes", when: "before", n: Number(m[1]) }]],
  [/^Choose 1 of your opponent's Pokémon and flip a coin for each of your Pokémon in play that has "(.+?)" in its name\. This attack does (\d+) damage to the chosen Pokémon for each heads\.(?: \(Don't apply Weakness and Resistance for Benched Pokémon\.\))?$/, (m) => [{ op: "flipCount", when: "after", per: "ownKind", type: `pokemon~${m[1]}` }, { op: "spread", when: "after", n: Number(m[2]), to: "any", count: 1, per: "heads" }]],
  // Tools and Energy.
  [/^Before doing damage, discard all Pokémon Tools and Special Energy from your opponent's Active Pokémon\.$/, () => [{ op: "dropFoeTool", when: "before", all: true }, { op: "discardFoeSpecial", when: "before", all: true }]],
  [new RegExp(`^Before doing damage, discard all Pokémon Tools from your opponent's Active Pokémon\\. If you discarded a Pokémon Tool in this way, your opponent's Active Pokémon is now ${COND}\\.$`), (m) => [{ op: "dropFoeTool", when: "before", all: true }, { op: "when", when: "after", test: "toolDropped", steps: [cond(m[1])] }]],
  [/^Before doing damage, discard all Pokémon Tools from this Pokémon\. If you can't discard any, this attack does nothing\.$/, () => [{ op: "dropOwnTools", when: "before", must: true }]],
  [/^You may shuffle all Energy attached to this Pokémon into your deck and have this attack do (\d+) more damage\.$/, (m) => [{ op: "ask", when: "before", steps: [{ op: "selfEnergyToDeck", n: 99 }], prompt: `Shuffle all Energy attached to this Pokémon into your deck? If you do, this attack does ${m[1]} more damage.` }, { op: "bonusIf", when: "before", n: Number(m[1]), test: "did" }]],
  [/^You may shuffle (\d+) Energy attached to this Pokémon into your deck\. If you do, this attack also does (\d+) damage to 1 of your opponent's Benched Pokémon\.(?: \(Don't apply Weakness and Resistance for Benched Pokémon\.\))?$/, (m) => [{ op: "ask", when: "before", steps: [{ op: "selfEnergyToDeck", n: Number(m[1]), exact: true }], prompt: `Shuffle ${m[1]} Energy attached to this Pokémon into your deck? If you do, this attack also does ${m[2]} damage to 1 of their Benched Pokémon.` }, { op: "ifDid", when: "after", steps: [{ op: "spread", n: Number(m[2]), to: "bench", count: 1 }] }]],
  [/^Shuffle all Energy attached to this Pokémon into your deck, and this attack does (\d+) damage to 1 of your opponent's Pokémon\.(?: \(Don't apply Weakness and Resistance for Benched Pokémon\.\))?$/, (m) => [{ op: "selfEnergyToDeck", when: "after", n: 99 }, { op: "spread", when: "after", n: Number(m[1]), to: "any", count: 1 }]],
  [/^Discard all Energy from this Pokémon and (?:put|place) (\d+) damage counters on 1 of your opponent's Pokémon\.$/, (m) => [{ op: "discardEnergy", when: "after", n: 99 }, { op: "counters", when: "after", n: Number(m[1]) * 10, where: "any", count: 1 }]],
  [new RegExp(`^You may have this Pokémon also do (\\d+) damage to itself and make your opponent's Active Pokémon ${COND}\\.$`), (m) => [{ op: "ask", when: "before", steps: [], prompt: `Do ${m[1]} damage to this Pokémon too, and leave their Active Pokémon ${m[2]}?` }, { op: "ifDid", when: "after", steps: [{ op: "selfDamage", n: Number(m[1]) }, cond(m[2])] }]],
  [/^You may discard your hand\. If you discarded any cards in this way, this attack does (\d+) more damage\.$/, (m) => [{ op: "ask", when: "before", steps: [{ op: "dropHand" }], prompt: `Discard your hand? If you do, this attack does ${m[1]} more damage.` }, { op: "bonusIf", when: "before", n: Number(m[1]), test: "paidAny" }]],
  [/^Discard (\d+) Basic (\w+) Energy cards from your hand, and Knock Out your opponent's Active Pokémon\. If you can't discard \1 cards in this way, this attack does nothing\.$/, (m) => [{ op: "cancelIf", when: "before", test: "handHas", k: Number(m[1]), what: `basicEnergy:${m[2]}`, not: true }, { op: "dropHand", when: "after", n: Number(m[1]), what: `basicEnergy:${m[2]}` }, { op: "knockOut", when: "after" }]],
  [/^If a Stadium is in play, this attack also does (\d+) damage to each of your opponent's Benched Pokémon, and discard that Stadium\.(?: \(Don't apply Weakness and Resistance for Benched Pokémon\.\))?$/, (m) => [{ op: "when", when: "after", test: "stadium", steps: [{ op: "spread", n: Number(m[1]), to: "bench" }, ...fromDeck([{ op: "dropStadium" }])] }]],
  [/^If your opponent has a Stadium in play, discard it\. If you do, your opponent can't play any Stadium cards from their hand during their next turn\.$/, () => [{ op: "when", when: "after", test: "stadium", foe: true, steps: [...fromDeck([{ op: "dropStadium" }]), { op: "lockHand", kinds: ["stadium"] }] }]],
  // Hands.
  [/^Choose a random card from your opponent's hand, and your opponent reveals that card and shuffles it into their deck\.$/, () => [{ op: "foeHandRandom", when: "after", n: 1, to: "deck" }]],
  [/^Flip a coin until you get tails\. For each heads, choose a random card from your opponent's hand\. Your opponent reveals those cards and shuffles them into their deck\.$/, () => [{ op: "flipRepeat", when: "after", until: true, steps: [{ op: "foeHandRandom", n: 1, to: "deck" }] }]],
  [new RegExp(`^Flip ${N} coins\\. If any of them are heads, your opponent reveals their hand\\. For each heads, choose a card you find there and shuffle it into your opponent's deck\\.$`, "i"), (m) => [{ op: "flipCount", when: "after", coins: count(m[1]) }, { op: "foeHandPick", when: "after", n: "heads", to: "deck" }]],
  [/^Your opponent reveals their hand, and this attack does (\d+) damage for each Energy card you find there\.$/, (m) => [{ op: "revealHand", when: "before" }, { op: "bonusPer", when: "before", how: "times", n: Number(m[1]), per: "foeHandKind", type: "energy" }]],
  [/^Your opponent reveals their hand, and you put an Item card you find there on the bottom of your opponent's deck\.$/, () => fromDeck([{ op: "foeHandEnergyBottom", what: "item" }])],
  [/^Your opponent reveals their hand, and you choose a card you find there and put it on the bottom of their deck\.$/, () => fromDeck([{ op: "foeHandEnergyBottom", what: "any" }])],
  [/^Your opponent reveals their hand\. Discard a card you find there\.$/, () => [{ op: "foeHandPick", when: "after", n: 1 }]],
  [/^Your opponent reveals their hand\. Discard all Item cards and Pokémon Tool cards you find there\.$/, () => [{ op: "foeHandDrop", when: "after", what: "item|tool" }]],
  [/^Your opponent reveals their hand\. Put up to (\d+) Basic Pokémon you find there onto your opponent's Bench\.$/, (m) => fromDeck([{ op: "foeBasicsOut", n: Number(m[1]) }])],
  [/^Your opponent discards a card from their hand\. If this Pokémon evolved from ([A-Z][\w.'-]*) during this turn, your opponent discards (\d+) more cards\.$/, (m) => [...fromDeck([{ op: "foeToss", n: 1 }]), { op: "when", when: "after", test: "evolvedNow", from: m[1], steps: fromDeck([{ op: "foeToss", n: Number(m[2]) }]) }]],
  [/^Discard a card from your hand\. If you do, your opponent discards a card from their hand\.$/, () => [{ op: "when", when: "after", test: "handHas", steps: [...fromDeck([{ op: "toss", n: 1 }]), ...fromDeck([{ op: "foeToss", n: 1 }])] }]],
];
PATTERNS.push(...BATCH_STD2);

/** Basic Pokémon an old search puts onto the Bench, as trainers.js fits reads them, or "". */
function benchWhat(words) {
  let m;
  if ((m = words.match(/^Basic Pokémon(?: card)? named (.+?)(?: or (.+))?$/))) return [m[1], m[2]].filter(Boolean).map((n) => `name=${n}`).join("|");
  if ((m = words.match(new RegExp(`^${TYPE} Basic Pokémon(?: card)?$`)))) return `basic:${m[1]}`;
  if (/^Baby Pokémon(?: card)?$/.test(words)) return "basic+Baby";
  if (/^Baby Pokémon or (?:a )?Basic Pokémon(?: card)?$/.test(words)) return "basic";
  if ((m = words.match(/^Basic Pokémon(?: card)? with ([A-Z][\w']*) in its name$/))) return `basic~${m[1]}`;
  if ((m = words.match(/^Basic (Rapid Strike|Single Strike|Fusion Strike) Pokémon$/))) return `basic+${m[1]}`;
  return "";
}

const onlyIf = (t, say) => ({ op: "onlyIf", when: "before", ...t, say });
/** What "You can use this attack only if <phrase>" asks: a test (testOf), or one only this wording has. */
function usableTest(phrase) {
  let m;
  if ((m = phrase.match(/^you have (\d+) or more cards in the Lost Zone$/))) return { test: "lostAtLeast", k: Number(m[1]) };
  if ((m = phrase.match(/^you have no (.+?) cards? in your discard pile$/)) && whatOf(`${m[1]} card`)) return { test: "discardAtLeast", k: 1, what: whatOf(`${m[1]} card`), not: true };
  if ((m = phrase.match(/^you have at least (\d+) more Prize cards remaining than your opponent$/))) return { test: "prizeLead", k: Number(m[1]) };
  if ((m = phrase.match(new RegExp(`^you have ${TYPE}, ${TYPE}, and ${TYPE} Pokémon on your Bench$`)))) return { test: "benchHasTypes", types: [m[1], m[2], m[3]] };
  if ((m = phrase.match(/^this Pokémon used (.+) during your last turn$/))) return { test: "usedLast", name: m[1] };
  if ((m = phrase.match(/^(?:1 of )?your ([A-Z][\w.'é♀♂ -]*?) used (.+) during your last turn$/))) return { test: "usedLast", name: m[2], who: m[1] };
  return testOf(phrase);
}

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
  // "1 of your Pokémon": the attacker's own, its Active Pokémon too (no Weakness or Resistance: it isn't the Defending Pokémon).
  if (!how && (m = p.match(new RegExp(`^${N} of your Pokémon$`, "i")))) how = { to: "ownAny", count: count(m[1]) };
  if (!how && (m = p.match(new RegExp(`^each of ${N} of your opponent's Pokémon$`, "i")))) how = { to: "any", count: count(m[1]) };
  // Their Pokémon of a rule box: "each of your opponent's Pokémon ex", "1 of your opponent's Benched Pokémon-GX or Benched Pokémon-EX".
  if (!how && (m = p.match(/^each of your opponent's (Benched )?(Pokémon ex|Pokémon-EX|Pokémon-GX|Pokémon V)$/))) how = { to: m[1] ? "bench" : "any", boxes: BOXES[m[2]] };
  if (!how && (m = p.match(new RegExp(`^${N} of your opponent's (Benched )?(Pokémon V|Pokémon ex|Pokémon-GX or Benched Pokémon-EX|Pokémon-GX and Pokémon-EX|Pokémon-GX or Pokémon-EX)$`, "i")))) how = { to: m[2] ? "bench" : "any", count: count(m[1]), boxes: BOXES[m[3].replace("Benched ", "")] };
  if (!how && (m = p.match(/^each of your opponent's (Benched )?Pokémon that has any Energy(?: cards)? attached to it$/))) how = { to: m[1] ? "bench" : "any", energized: true };
  if (!how || (which && how.to === "allBench")) return null;
  const damaged = which ? !/n't have/.test(which) : null;
  return [{ op: "spread", when: "after", n, ...how, ...(damaged != null ? { damaged } : {}) }];
}

/** "This attack's damage isn't affected by Weakness, Resistance, Poké-Powers, ... or any other effects on the Defending Pokémon." */
function typingOf(list) {
  const items = list.replace(/the Defending Pokémon/g, OPP).split(/, or |, | or /);
  const effects = items.some((i) => i === `any effects on ${OPP}` || i === `any other effects on ${OPP}` || i === "any other effects on that Pokémon");
  // Poké-Powers and Poké-Bodies are only named beside "any other effects", which the engine ignores as one.
  const known = (i) => ["Weakness", "Resistance"].includes(i) || (effects && ["Poké-Powers", "Poké-Bodies", "Pokémon Powers", `any effects on ${OPP}`, `any other effects on ${OPP}`, "any other effects on that Pokémon"].includes(i));
  if (!items.every(known)) return null;
  return [{ op: "typing", when: "before", noWeakness: items.includes("Weakness"), noResistance: items.includes("Resistance"), noEffects: effects }];
}

/** Effects a Trainer card has too: read by the Trainer reader (js/tcg/trainers.js), with only the steps that make sense for an attack. */
const AS_TRAINER = new Set(["search", "recover", "recycle", "heal", "healOne", "healEach", "draw", "drawTo", "drawFor", "drawPerFoeHand", "drawUpTo", "drawPaid", "flipDraw", "discardHand", "shuffleHand", "foeShuffle", "foeDraw", "handBottom", "flip", "flipEach", "gust", "foeSwitch", "switch", "cost", "toss", "topTake", "under", "mill", "hammer", "dropFoeTools", "dropInPlay", "dropStadium", "attachPick", "fetchEnergy", "energize", "counters", "foeMill", "foeDiscardRandom", "foeToss", "foeHandBottom", "foeRandomBottom", "cure", "cureOne", "cureKind", "bounce", "evolveDeck", "moveEnergy", "arrange", "toolGift"]);
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
  const trainer = asTrainer(clean);
  if (trainer) return trainer;
  // Wordings read only when nothing else reads them: the same effect said the way it is read.
  for (const [from, to] of REWRITES) {
    const said = clean.replace(from, to);
    if (said === clean) continue;
    const steps = compileOne(said) || (said.split(". ").length > clean.split(". ").length ? compileText(said) : null);
    if (steps) return steps;
  }
  return null;
}

/** [wording, the same said as it is read]: tried by compileOne when nothing reads a sentence as printed. */
const REWRITES = [
  [/^Look at the top (\d+) cards of your deck, and you may reveal /, "Look at the top $1 cards of your deck. You may reveal "],
  [/^Discard the top (\d+) cards of your deck and put 1 of them into your hand\.$/, "Look at the top $1 cards of your deck and put 1 of them into your hand. Discard the other cards."],
  // Showing the card to the opponent is the same as revealing it.
  [/, (?:show (?:it|them) to your opponent|reveal (?:it|them)), and put /, " and put "],
  [/^During your opponent's next turn, attacks used by the Defending Pokémon cost ((?:Colorless)+) more, and its Retreat Cost/, "During your opponent's next turn, the Defending Pokémon's attacks cost $1 more, and its Retreat Cost"],
  [/ to any of your Pokémon in any way you like\./, " to your Pokémon in any way you like."],
  [/^All damage done to this Pokémon during your opponent's next turn is reduced by (\d+) \(after applying Weakness and Resistance\)\.$/, "During your opponent's next turn, any damage done to this Pokémon by attacks is reduced by $1 (after applying Weakness and Resistance)."],
  [/^During your opponent's next turn, prevent all effects of attacks, including damage, done to this Pokémon( by Pokémon-EX)?\.$/, (all, by) => `Prevent all effects of attacks, including damage, done to this Pokémon${by ? " by your opponent's Pokémon-EX" : ""} during your opponent's next turn.`],
  [/^Search your discard pile for ((?:up to )?(?:an?|\d+)) (.+?) and put (?:it|them) into your hand\.$/, "Put $1 $2 from your discard pile into your hand."],
  [/ and put (it|them) in your hand\./, " and put $1 into your hand."],
  [/^Remove all Special Conditions and (\d+|all) damage counters(?: \(all if there are less than \d+\))? from this Pokémon(?: \(all if there are less than \d+\))?\./, (all, n) => `Remove all Special Conditions from this Pokémon. Remove ${n} damage counters from this Pokémon.`],
  [/^You(?:r)? opponent can't play (?:any |a )?(Trainer|Supporter|Item) [Cc]ards? from (?:his or her|their) hand (?:during (?:your opponent's|his or her|their) next turn|until the end of your opponent's next turn)\.$/, "Your opponent can't play $1 cards during their next turn."],
  [/^Flip a coin\. If heads, (.+?\.) If tails, this attack does nothing\.$/, "Flip a coin. If tails, this attack does nothing. If heads, $1"],
  [/^(?:Then, )?choose 1 of your Benched Pokémon and switch this Pokémon with it\.$/, "Switch this Pokémon with 1 of your Benched Pokémon."],
  [/^(Put|Remove) a damage counter (on|from) /, "$1 1 damage counter $2 "],
  [/^Discard 1 Energy card attached to the Defending Pokémon\.$/, "Discard an Energy card attached to the Defending Pokémon."],
  [/^(Remove \d+ damage counters? from this Pokémon) \((?:all|remove all) if there (?:are|is) less than \d+\)\.$/, "$1."],
  [/^(You may move|Move) an? (\w+) Energy(?: card)? attached to this Pokémon to 1 of your Pokémon\.$/, "$1 a $2 Energy attached to this Pokémon to 1 of your Benched Pokémon."],
  [/^This Pokémon has no Weakness during your opponent's next turn\.$/, "During your opponent's next turn, this Pokémon has no Weakness."],
  [/^The Defending Pokémon is now (Asleep|Burned|Confused|Paralyzed|Poisoned), and can't retreat (?:until the end of|during) your opponent's next turn\.$/, "The Defending Pokémon is now $1. The Defending Pokémon can't retreat during your opponent's next turn."],
  [/^After doing damage, (flip|remove|discard|draw|switch)/, (all, verb) => upper(verb)],
  [/^(Discard up to \d+ .+? from your hand)\. Then, draw (\d+) cards for each (?:Energy )?card you discarded\.$/, "$1. For each card you discarded, draw $2 cards."],
  [/^Damage done to this Pokémon by an opponent's attack is reduced by (\d+) \(after applying Weakness and Resistance\) during your opponent's next turn\.$/, "During your opponent's next turn, any damage done to this Pokémon by attacks is reduced by $1 (after applying Weakness and Resistance)."],
  [/^(During your opponent's next turn, any damage done to this Pokémon by attacks) in reduced by /, "$1 is reduced by "],
  [/^(This attack's damage isn't affected by Weakness, Resistance, )Poké-Power(, Poké-Bodies,) (?:and|or) any other effects on the Defending Pokémon\.$/, "$1Poké-Powers$2 or any other effects on the Defending Pokémon."],
  [/^(This attack's damage isn't affected by Weakness, Resistance, Poké-Powers, Poké-Bodies,) and any other effects on the Defending Pokémon\.$/, "$1 or any other effects on the Defending Pokémon."],
  [/^Choose (\d+) of your opponent's Pokémon (?:in|is) play\.$/, "Choose $1 of your opponent's Pokémon."],
  [/prevent all damage done by attacks to this Pokémon during your opponent's next turn/, "prevent all damage done to this Pokémon by attacks during your opponent's next turn"],
  [/^During your opponent's next turn, prevent all effects, including damage, done to this Pokémon by attacks from your opponent's Pokémon-ex\.$/, "Prevent all effects of attacks, including damage, done to this Pokémon by your opponent's Pokémon-ex during your opponent's next turn."],
  [/^Prevent all effects of (?:an attack|attack), including damage, done to this Pokémon by /, "Prevent all effects of attacks, including damage, done to this Pokémon by "],
  [/^Remove (\d+|all) damage counters? and all Special Conditions from this Pokémon\.$/, (all, n) => `Remove ${n} damage counter${n === "1" ? "" : "s"} from this Pokémon. Remove all Special Conditions from this Pokémon.`],
  [/^Search your deck for 1 card and put it into your hand\./, "Search your deck for a card and put it into your hand."],
  [/^(Search your discard pile for|Search your deck for) (up to \d+|an?) (.+?) and attach (?:them|it) to (your Pokémon in any way you like|1 of your Pokémon|this Pokémon)\.(.*)$/, (all, where, n, what, to, rest) => (where === "Search your discard pile for" ? `Attach ${n} ${what} from your discard pile to ${to}.${rest}` : all)],
  [/^(Search your deck for an? .+?)\. Show that card to your opponent, then put it into your hand\./, "$1 and put it into your hand."],
  [/ is affected by any Special Conditions?, /, " is affected by a Special Condition, "],
  [/\(yours and your opponent's\)/, "(both yours and your opponent's)"],
  [/^Do (\d+) damage to each Benched Pokémon \(/, "This attack does $1 damage to each Benched Pokémon ("],
  [/^If there is (?:a|any) Stadium card in play, (?:discard it|(you may) discard it)\.$/, (all, may) => (may ? "You may discard a Stadium in play." : "Discard a Stadium in play.")],
  [/^If your opponent has any Benched Pokémon, this attack does (\d+) damage to each of them\./, "This attack does $1 damage to each of your opponent's Benched Pokémon."],
  [/^Your opponent discards the top card (?:from|of) (?:his or her|their) deck\.$/, "Discard the top card of your opponent's deck."],
  [/^(Discard .+? from your hand)\. \(If you can't discard (?:a card|(\d+) cards) from your hand, this attack does nothing\.\)$/, (all, first, n) => `${first}. If you can't discard ${n ? `${n} cards in this way` : "a card"}, this attack does nothing.`],
  [/^Take ((?:up to )?(?:an?|\d+)) (.+?) from your discard pile and attach (?:it|them) to this Pokémon\.$/, "Attach $1 $2 from your discard pile to this Pokémon."],
  [/^(Discard an? .+? attached to this Pokémon) and (draw (?:a card|\d+ cards))\.$/, (all, first, then) => `${first}. ${upper(then)}.`],
  [/(can't play any Trainer cards) or Stadium cards /, "$1 "],
  [/^Flip a coin\. If heads,? and if your opponent has any Benched Pokémon, choose 1 of them and this attack does (\d+) damage to it\./, "If your opponent has any Benched Pokémon, flip a coin. If heads, choose 1 of them and this attack does $1 damage to it."],
  [/^Choose 1 of your opponent's Benched Pokémon and flip a coin\. If heads, this attack does (\d+) damage to that Pokémon\./, "If your opponent has any Benched Pokémon, choose 1 of them and flip a coin. If heads, this attack does $1 damage to that Pokémon."],
  [/^Choose 1 of the Defending Pokémon's attack\. /, "Choose 1 of the Defending Pokémon's attacks. "],
  [/^(Choose 1 of the Defending Pokémon's attacks\.) The Pokémon can't/, "$1 That Pokémon can't"],
  // Misprints that drop or swap a word.
  [/^Does (\d+) more for each damage counter on /, "Does $1 more damage for each damage counter on "],
  [/^Recover (\d+) damage from /, "Heal $1 damage from "],
  [/\. \(All if there are less than (\d+)\.\)$/, " (all if there are less than $1)."],
  [/\b(remove \d+ damage counters?) on /, "$1 from "],
  [/ \.$/, "."],
  [/ more damage for each (\w+) Pokémon in play\.$/, " more damage for each $1 Pokémon in play (both yours and your opponent's)."],
  [/^(Remove \d+ damage counters? from each of your Pokémon), including [^.,]+\.$/, "$1."],
  [/^Does (\d+) more damage if (you have [^,.]+)\.$/, (all, n, cond) => `If ${cond}, this attack does ${n} more damage.`],
];

/**
 * The steps of an attack's text, [] when it has none, null when it can't be read yet. Older cards name
 * themselves ("Charizard does 10 damage to itself") where newer ones say "this Pokémon": `name` reads them alike.
 */
export function compileAttack(text, name = "") {
  const plain = tidy(String(text || "").replace(/\s+/g, " ").replace(/’/g, "'").trim());
  const first = compileText(plain);
  if (first || !name) return first;
  for (const form of nameForms(name)) {
    if (!plain.includes(form)) continue;
    const steps = byName(plain, form);
    if (steps) return steps;
  }
  return null;
}

/**
 * The names a card's text calls itself by: its full name, then (for older prints) the name without what the
 * card's title adds ("Ralts δ" says "Remove 2 damage counters from Ralts", "Brock's Mankey" says "Mankey").
 */
function nameForms(name) {
  const forms = [name];
  const bare = name.replace(/^(?:Brock|Misty|Erika|Sabrina|Blaine|Koga|Giovanni|Lt\. Surge|Rocket|Larry|Steven|Lillie|Iono|Holon|Ethan|Cynthia|Hop|Marnie|N|Arven|Team Rocket)'s /, "").replace(/ (?:δ|LV\.X|Star|☆|★|G|GL|FB|C|E4|4)$/, "").replace(/ δ /, " ");
  if (bare !== name && bare.length > 2) forms.push(bare);
  // "Flareon ★" prints itself as "Flareon Star".
  if (/ ★$/.test(name)) forms.push(name.replace(/ ★$/, " Star"));
  return forms;
}

function byName(plain, name) {
  // "Search your deck for up to 2 Nidoran♀ and put them onto your Bench": cards of its own name.
  const kin = plain.match(new RegExp(`^Search your deck for (?:(?:up to )?${N} )?${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} and put (?:it|them) onto your Bench\\. ${SHUFFLED}$`, "i"));
  if (kin) return fromDeck([{ op: "search", what: `name=${name}`, n: kin[1] ? count(kin[1]) : 1, to: "bench" }]);
  return compileText(plain.replace(new RegExp(`(?<![\\p{L}\\d])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\d])`, "gu"), "this Pokémon").replace(/\bthis this Pokémon/g, "this Pokémon").replace(/(^|\. |\()this Pokémon/g, "$1This Pokémon"));
}

/**
 * Small differences in print that say the same thing: "Pokemon", "Weakness or Resistance for Benched Pokémon", the
 * reminder that the switch comes after the damage (an effect after the damage always does), "(after doing damage)".
 */
function tidy(text) {
  return text
    .replace(/\bPokemon\b/g, "Pokémon")
    .replace(/Hide n' Sneak/g, "Hide 'n' Sneak")
    .replace(/\{N\}/g, "Dragon")
    .replace(/oppoennt's/g, "opponent's")
    .replace(/\bThen Shuffle your deck\./g, "Then, shuffle your deck.")
    .replace(/^Head (\d+) damage from /, "Heal $1 damage from ")
    .replace(/ you discarded this way\./g, " you discarded in this way.")
    .replace(/(^|\. )Place damage counters on /g, "$1Put damage counters on ")
    .replace(/Don't apply Weakness or Resistance for Benched Pokémon/g, "Don't apply Weakness and Resistance for Benched Pokémon")
    .replace(/for Benched Pokémon\)\./g, "for Benched Pokémon.)")
    .replace(/ \(Do the damage before switching the Pokémon\.(?: Switch the Pokémon even if [^.)]+ is [Kk]nocked [Oo]ut\.)?\)/g, "")
    .replace(/ \(after doing damage\)\./g, ".")
    .replace(/^Flip a coin, If /, "Flip a coin. If ")
    // "Switch this Pokémon with 1 of your Benched Pokémon, if any": a switch that can't happen doesn't.
    .replace(/Benched Pokémon, if any\./g, "Benched Pokémon.")
    // Newer prints name types in brackets: "1 of your [Psychic] Pokémon".
    .replace(/\[(Grass|Fire|Water|Lightning|Psychic|Fighting|Darkness|Metal|Fairy|Dragon|Colorless)\]/g, "$1")
    .replace(/(^|\. |, )([Pp])lace (\d+) damage counters? on /g, (all, at, p, n) => `${at}${p === "P" ? "Put" : "put"} ${n} damage counter${n === "1" ? "" : "s"} on `)
    // Energy "not used to pay for this attack" printed a few ways (spareUnits).
    .replace(/^This attack does (\d+) damage plus (\d+) (?:more )?damage for each ((?:\w+ )?Energy attached to [^.]+? but not used to pay)/, "Does $1 damage plus $2 more damage for each $3")
    .replace(/^Does (\d+) damage plus (\d+) damage for each ((?:\w+ )?Energy attached to [^.]+? but not used to pay)/, "Does $1 damage plus $2 more damage for each $3")
    .replace(/(but not used to pay for this attack)(?:'s Energy [Cc]ost)?\. You can't add more then/, "$1's Energy cost. You can't add more than")
    .replace(/(but not used to pay for this attack)(?:'s Energy Cost)?\. (You can't add more than|Extra)/, "$1's Energy cost. $2")
    .replace(/(Extra \w+ Energy after the \d+(?:st|nd|rd|th)) don't count\./, "$1 doesn't count.")
    // Old doubles wording: with one Active Pokémon a side, "1 of the Defending Pokémon" is the Defending Pokémon, and who picks it doesn't matter.
    .replace(/^(Switch 1 of your opponent's Benched Pokémon with|Choose 1 of your opponent's Benched Pokémon and switch it with) (?:1 of )?the Defending Pokémon\.(?: Your opponent chooses the Defending Pokémon to switch\.)?/, "$1 the Defending Pokémon.")
    .replace(/(^|\. )You switch (this Pokémon|[A-Z][\w.' é-]*?) with 1 of your Benched Pokémon\./, "$1Switch $2 with 1 of your Benched Pokémon.")
    // Misprints that say what the usual wording says.
    .replace(/\bIf heads the /g, "If heads, the ")
    .replace(/\bIf head, /g, "If heads, ")
    .replace(/(\d+) Damage to /g, "$1 damage to ")
    // A doubles-era wording: in a game with one Active Pokémon a side, each Defending Pokémon is the Defending Pokémon.
    .replace(/\bcounters on each Defending Pokémon\./g, "counters on the Defending Pokémon.")
    .replace(/\bIf (heads|tails) (put|discard|switch|draw|search|remove|attach) /g, "If $1, $2 ")
    .replace(/^Flip a coin, if heads /, "Flip a coin. If heads, ")
    .replace(/^Seach /, "Search ")
    .replace(/, an put /g, ", and put ")
    .replace(/\bPoisined\b/g, "Poisoned")
    .replace(/(^|\. |, )[Tt]his Defending Pokémon\b/g, (all, at) => `${at}${at === ", " ? "the" : "The"} Defending Pokémon`)
    .replace(/(^|\. )Flip a coin\. If heads, the Defending Pokémon is (Asleep|Burned|Confused|Paralyzed|Poisoned)\./g, "$1Flip a coin. If heads, the Defending Pokémon is now $2.")
    .replace(/\(after applying weakness and resistance\)/g, "(after applying Weakness and Resistance)")
    .replace(/next turn ,any /g, "next turn, any ")
    .replace(/any damage to this Pokémon by attacks/g, "any damage done to this Pokémon by attacks")
    .replace(/(^|\. )This attack damage isn't/g, "$1This attack's damage isn't")
    .replace(/would be be /g, "would be ")
    .replace(/\bIf (heads|tails) this attack /g, "If $1, this attack ")
    .replace(/(^|\. )The, /g, "$1Then, ")
    .replace(/(\d+) damgae\b/g, "$1 damage")
    .replace(/\bopponetn's\b/g, "opponent's")
    .replace(/Weakness and reistance/g, "Weakness and Resistance")
    .replace(/\band attack it to this Pokémon\b/g, "and attach it to this Pokémon")
    .replace(/ Energy attaches, /g, " Energy attached, ")
    .replace(/(\d+) damage damage times\b/g, "$1 damage times")
    .replace(/ is now (asleep|burned|confused|paralyzed|poisoned)\./g, (all, c) => ` is now ${upper(c)}.`)
    // "If it has fewer damage counters than that, remove all of them" after a heal: no heal takes off more than there is.
    .replace(/(remove \d+ damage counters? from [^.(]+?\.) If (?:it|this Pokémon|[A-Z][^.]*?) has fewer damage counters than that, remove all of them\./gi, "$1")
    .replace(/(\d+) damange\b/g, "$1 damage")
    .replace(/(\d+) damages times\b/g, "$1 damage times")
    .replace(/(\d+) Damage to\b/g, "$1 damage to")
    .replace(/\bShuffe your deck\b/g, "Shuffle your deck")
    .replace(/(damage counters?) fro /g, "$1 from ")
    .replace(/\band attached it to\b/g, "and attach it to")
    .replace(/ and put it into your hand, Shuffle your deck afterward\./g, " and put it into your hand. Shuffle your deck afterward.")
    .replace(/^(Does \d+ damage plus \d+) more for each /, "$1 more damage for each ")
    .replace(/(^|\. )Choose 1 of your opponent's Benched Pokémon and switch the Defending Pokémon with it\./, "$1Switch 1 of your opponent's Benched Pokémon with the Defending Pokémon.")
    .replace(/ to that Pokémon \(Don't apply Weakness and Resistance for Benched Pokémon\.\)$/, " to that Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)")
    .replace(/times the number heads\./g, "times the number of heads.")
    .replace(/times then number of heads\./g, "times the number of heads.")
    // A last sentence printed without its full stop.
    .replace(/([a-zé])$/, "$1.");
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
      // After it, the coin and what a test said before the damage (OPS.bonusIf `keep`).
      const kept = { ...(ctx.hit.coin != null ? { coin: ctx.hit.coin } : {}), ...(ctx.hit.held != null ? { held: ctx.hit.held } : {}), ...(ctx.hit.heads != null ? { heads: ctx.hit.heads } : {}), ...(ctx.hit.dealt != null ? { dealt: ctx.hit.dealt } : {}) };
      const carry = rest.some((step) => step.op === "strike") ? { hit: ctx.hit, atk: ctx.atk } : kept;
      if (rest.length) waiting.then = [...(waiting.then || []), { op: "fx", steps: rest, uid: ctx.slot.uid, ...carry }];
      // The other player's choice ("your opponent switches"): what follows is still the attacker's.
      if (waiting.player !== ctx.player && waiting.by == null) waiting.by = ctx.player;
      return;
    }
  }
}

/**
 * Why the Active Pokémon can't use this attack now ("You can use this attack only if ...": OPS.onlyIf), or "".
 * The tests ask what holds before the attack, as the card's text does.
 */
export function attackBlock(state, player, attack, defs) {
  const only = (attack.fx || []).filter((step) => step.op === "onlyIf");
  if (!only.length) return "";
  const slot = state.players[player].active;
  if (!slot) return "";
  const ctx = { state, defs, events: [], player, slot, target: state.players[other(player)].active, attack, hit: { damage: attack.damage, cancelled: false } };
  const fails = only.find((step) => !passes(ctx, step));
  return fails ? `${attack.name} can't be used now: ${fails.say}` : "";
}

/**
 * "If your opponent has any Ultra Beasts in play, this attack can be used for Colorless": the cost it may be used for now
 * (OPS.costIf, asked of the attacker as it stands), or null for its printed cost.
 */
export function altCost(state, player, slot, attack, defs) {
  const alt = (attack.fx || []).find((step) => step.op === "costIf");
  if (!alt || player < 0) return null;
  const ctx = { state, defs, events: [], player, slot, target: state.players[other(player)].active, attack, hit: { damage: attack.damage, cancelled: false } };
  return passes(ctx, alt) ? alt.cost : null;
}

/** Steps that waited on a choice (trainers.js T_OPS.fx): the attack's context again, if the attacker is still in play. */
export function runFx(tctx, { steps, uid, coin = null, held = null, heads = null, dealt = null, hit = null, atk = null }) {
  const { state, defs, player } = tctx;
  const mine = inPlay(state, player).find(([slot]) => slot.uid === uid);
  if (!mine) return;
  const target = state.players[other(player)].active;
  const shielded = Boolean(target && (shieldOn(state, target, defOf(state, mine[0].uid, defs)) || abilityOn(state, target, defs)?.noEffects));
  const attack = atk ? defs(atk[0]).attacks[atk[1]] : null;
  runSteps(steps, { state, defs, events: tctx.events, player, slot: mine[0], target, attack, atk, hit: hit ? { ...hit } : { damage: 0, cancelled: false, ...(coin != null ? { coin } : {}), ...(held != null ? { held } : {}), ...(heads != null ? { heads } : {}), ...(dealt != null ? { dealt } : {}) }, shielded });
}

/** The attack's steps for one phase; `withStrike`: the damage (engine.js strike) after the steps before it, when they are done. */
export function runAttackEffects(when, attack, ctx, withStrike = false) {
  runSteps([...(attack.fx || []).filter((step) => step.when === when), ...(withStrike ? [{ op: "strike" }] : [])], ctx);
}

