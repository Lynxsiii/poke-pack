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
 * ctx: { state, defs, events, player, slot (the attacker), target (the other Active), hit: { damage, cancelled },
 *        shielded (the target takes no effects this turn) }
 */

import { ACTIVE, abilityOn, addCondition, addMark, askChoose, askPick, benchSafe, damageAfterTyping, defOf, flip, heldOn, hpLeft, inPlay, markOn, other, rand, shuffle, switchActive, toolGone, warded } from "./engine.js";
import { T_OPS, compileTrainer, runTrainer, trainerReady, whatOf } from "./trainers.js";

const WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
const count = (word) => WORDS[String(word).toLowerCase()] || Number(word) || 0;

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
  /** Flip a coin: tails and the attack does nothing. */
  flipOrNothing(ctx) {
    if (!flips(ctx, 1)[0]) {
      ctx.hit.cancelled = true;
      ctx.events.push({ t: "miss", p: ctx.player });
    }
  },
  /** Flip some coins: damage for each heads. */
  flipTimes(ctx, { coins, n }) {
    ctx.hit.damage = flips(ctx, coins).filter(Boolean).length * n;
  },
  healSelf(ctx, { n }) {
    const healed = Math.min(n, ctx.slot.damage);
    if (!healed) return;
    ctx.slot.damage -= healed;
    ctx.events.push({ t: "heal", p: ctx.player, spot: -1, n: healed });
  },
  /** Flip some coins: more damage for each heads. */
  flipBonusEach(ctx, { coins, n }) {
    ctx.hit.damage += flips(ctx, coins).filter(Boolean).length * n;
  },
  /** Flip until tails: damage for each heads. */
  flipUntilTails(ctx, { n }) {
    const results = [];
    do results.push(flip(ctx.state));
    while (results[results.length - 1] && results.length < 60);
    ctx.events.push({ t: "flip", p: ctx.player, results });
    ctx.hit.damage = results.filter(Boolean).length * n;
  },
  /** More damage for each of something on the table. */
  bonusPer(ctx, { n, per }) {
    const foe = ctx.target;
    const times = per === "selfCounters" ? ctx.slot.damage / 10 : per === "foeEnergy" ? foe?.energy.length || 0 : 0;
    ctx.hit.damage += times * n;
  },
  /** More damage when something is true. */
  bonusIf(ctx, { n, test }) {
    if (test === "foeDamaged" && ctx.target?.damage > 0) ctx.hit.damage += n;
  },
  /** The damage skips Weakness, Resistance, or what earlier attacks left on the target. */
  typing(ctx, { noWeakness = false, noResistance = false, noEffects = false }) {
    if (noWeakness) ctx.hit.noWeakness = true;
    if (noResistance) ctx.hit.noResistance = true;
    if (noEffects) ctx.hit.noEffects = true;
  },
  /** An effect that lasts a turn (engine.js, "effects that last a turn"). `mine`: it holds on the attacker's own next turn. */
  mark(ctx, { kind, on = "self", mine = false, n = 0, name = "" }) {
    const p = on === "self" ? ctx.player : other(ctx.player);
    const slot = on === "self" ? ctx.slot : ctx.state.players[p].active;
    if (!slot || (on !== "self" && ctx.shielded)) return;
    addMark(ctx.state, slot, { kind, turn: ctx.state.turn + (mine ? 2 : 1), ...(n ? { n } : {}), ...(name ? { name } : {}) });
    ctx.events.push({ t: "mark", p, kind, ...(n ? { n } : {}), ...(name ? { name } : {}) });
  },
  /**
   * Damage beyond the Active Pokémon. `to`: "bench" (theirs), "any" (theirs, the Active one
   * included, with Weakness and Resistance for it alone), "ownBench". `count` 0 is all of them;
   * otherwise the attacker chooses that many, when there are more than that to choose from.
   */
  spread(ctx, { n, to = "bench", count = 0 }) {
    const { state, player, events } = ctx;
    const p = to === "ownBench" ? player : other(player);
    const side = state.players[p];
    const spots = [...(to === "any" && side.active ? [ACTIVE] : []), ...side.bench.map((_, i) => i)];
    if (!spots.length) return;
    const from = to === "any" ? ctx.slot.uid : "";
    if (count && spots.length > count) return askPick(state, { player, side: p, spots, left: count, effect: { op: "damage", n, from, attack: true } });
    // No choice to make: it lands on all of them now.
    for (const spot of spots) {
      const slot = spot === ACTIVE ? side.active : side.bench[spot];
      const dealt = spot === ACTIVE && from ? damageAfterTyping(n, defOf(state, from, ctx.defs), defOf(state, slot.uid, ctx.defs)) : { amount: n, weak: false, resist: false };
      if (dealt.amount <= 0) continue;
      if (benchSafe(state, slot, spot, ctx.defs)) continue;
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
  [/^This attack does (\d+) damage to each of your opponent's Pokémon\.(?: \(Don't apply Weakness and Resistance for Benched Pokémon\.\))?$/, (m) => [{ op: "spread", when: "after", n: Number(m[1]), to: "any" }]],
  [/^(?:This attack also does|Does) (\d+) damage to each of your opponent's Benched Pokémon\.(?: \(Don't apply Weakness and Resistance for Benched Pokémon\.\))?$/, (m) => [{ op: "spread", when: "after", n: Number(m[1]), to: "bench" }]],
  [/^This attack also does (\d+) damage to each of your Benched Pokémon\.(?: \(Don't apply Weakness and Resistance for Benched Pokémon\.\))?$/, (m) => [{ op: "spread", when: "after", n: Number(m[1]), to: "ownBench" }]],
  [new RegExp(`^Switch this Pokémon with ${N} of your Benched Pokémon\\.$`, "i"), () => [{ op: "switchSelf", when: "after" }]],
  [new RegExp(`^You may switch this Pokémon with ${N} of your Benched Pokémon\\.$`, "i"), () => [{ op: "switchSelf", when: "after", optional: true }]],
  [new RegExp(`^Your opponent switches (?:the Defending Pokémon|his or her Active Pokémon|their Active Pokémon) with ${N} of (?:his or her|their) Benched Pokémon\\.$`, "i"), () => [{ op: "switchFoe", when: "after" }]],
  // Damage that counts something.
  [new RegExp(`^Flip ${N} coins?\\. This attack does (\\d+) more damage for each heads\\.$`, "i"), (m) => [{ op: "flipBonusEach", when: "before", coins: count(m[1]), n: Number(m[2]) }]],
  [/^Flip a coin until you get tails\. This attack does (\d+) damage (?:times the number of heads|for each heads)\.$/, (m) => [{ op: "flipUntilTails", when: "before", n: Number(m[1]) }]],
  [/^This attack does (\d+) more damage for each damage counter on this Pokémon\.$/, (m) => [{ op: "bonusPer", when: "before", per: "selfCounters", n: Number(m[1]) }]],
  [/^This attack does (\d+) more damage for each Energy attached to your opponent's Active Pokémon\.$/, (m) => [{ op: "bonusPer", when: "before", per: "foeEnergy", n: Number(m[1]) }]],
  [/^If your opponent's Active Pokémon already has any damage counters on it, this attack does (\d+) more damage\.$/, (m) => [{ op: "bonusIf", when: "before", test: "foeDamaged", n: Number(m[1]) }]],
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
  return compileText(plain.split(name).join("this Pokémon").replace(/(^|\. |\()this Pokémon/g, "$1This Pokémon"));
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
  runSteps(steps, { state, defs, events: tctx.events, player, slot: mine[0], target, hit: { damage: 0, cancelled: false }, shielded });
}

export function runAttackEffects(when, attack, ctx) {
  runSteps((attack.fx || []).filter((step) => step.when === when), ctx);
}
