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

import { ACTIVE, addCondition, addMark, askPick, benchSafe, conditionsOn, damageAfterTyping, defOf, energyOf, flip, hpLeft, other, retreatCost, switchActive, unpaid } from "./engine.js";

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
};

function flips(ctx, n) {
  const results = Array.from({ length: n }, () => flip(ctx.state));
  ctx.events.push({ t: "flip", p: ctx.player, results });
  return results;
}

export const OPS = {
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
  [/^(?:(?!\. ).)+ can't attack during your next turn\.$/, () => [mark("noAttack", { mine: true })]],
  [/^During your next turn, this Pokémon can't use (.+)\.$/, (m) => [mark("noUse", { mine: true, name: m[1] })]],
  [/^(?:(?!\. ).)+ can't use (.+) during your next turn\.$/, (m) => [mark("noUse", { mine: true, name: m[1] })]],
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
  [new RegExp(`^(?:(?!\\. ).)+? (?:also )?does (\\d+) damage to itself\\.$`), (m) => [{ op: "selfDamage", when: "after", n: Number(m[1]) }]],
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
];

/** "This attack's damage isn't affected by Weakness, Resistance, Poké-Powers, ... or any other effects on the Defending Pokémon." */
function typingOf(list) {
  const items = list.replace(/the Defending Pokémon/g, OPP).split(/, or |, | or /);
  const effects = items.some((i) => i === `any effects on ${OPP}` || i === `any other effects on ${OPP}`);
  // Poké-Powers and Poké-Bodies are only named beside "any other effects", which the engine ignores as one.
  const known = (i) => ["Weakness", "Resistance"].includes(i) || (effects && ["Poké-Powers", "Poké-Bodies", "Pokémon Powers", `any effects on ${OPP}`, `any other effects on ${OPP}`].includes(i));
  if (!items.every(known)) return null;
  return [{ op: "typing", when: "before", noWeakness: items.includes("Weakness"), noResistance: items.includes("Resistance"), noEffects: effects }];
}

function compileOne(clean) {
  for (const [pattern, build] of PATTERNS) {
    const m = clean.match(pattern);
    // A builder may still turn a match down (a count or a test it doesn't know).
    const steps = m && build(m);
    if (steps) return steps;
  }
  return null;
}

/**
 * The steps of an attack's text, [] when it has none, null when it can't be read yet.
 * `name`: the card's own name, which older cards print where newer ones say "this Pokémon".
 */
export function compileAttack(text, name = "") {
  let clean = String(text || "").replace(/\s+/g, " ").trim();
  if (name) clean = clean.replace(new RegExp(`(?<![\\w-])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`, "g"), "this Pokémon");
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

function runSteps(steps, ctx) {
  for (const step of steps) OPS[step.op]?.(ctx, step);
}

export function runAttackEffects(when, attack, ctx) {
  runSteps((attack.fx || []).filter((step) => step.when === when), ctx);
}
