/**
 * Trainer cards: their text turned into steps, the same road attack text takes
 * (js/tcg/effects.js). The text itself comes from data/tcg/trainers.json, which
 * scripts/build_tcg_trainers.mjs builds, because our card files don't carry it.
 *
 *   compileTrainer(text) -> steps, or null when the text can't be read yet
 *   trainerReady(steps, ctx) -> would playing it do anything right now?
 *   runTrainer(steps, ctx)
 *
 * A Trainer whose text isn't read can't go in a deck: unlike an attack, which
 * still lands its printed damage, an unread Trainer would do nothing at all.
 *
 * A step is { op, ...args }. Each op has `ready` (the card may not be played
 * when none of its steps is ready, as the rules have it) and `run`.
 * ctx: { state, defs, events, player }
 */

import { ACTIVE, addCondition, askChoose, askPick, conditionsOn, defOf, evolveSpots, flip, inPlay, mayEvolve, other, rand, shuffle, slotAt, switchActive, warded } from "./engine.js";

const WORDS = { a: 1, an: 1, another: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };
const count = (word) => WORDS[String(word).toLowerCase()] || Number(word) || 0;

function draw(ctx, p, n) {
  const side = ctx.state.players[p];
  const drawn = side.deck.splice(0, n);
  if (!drawn.length) return;
  side.hand.push(...drawn);
  ctx.events.push({ t: "draw", p, uids: drawn });
}

function handBack(ctx, p) {
  const side = ctx.state.players[p];
  if (!side.hand.length) return;
  side.deck.push(...side.hand.splice(0));
  shuffle(ctx.state, side.deck);
  ctx.events.push({ t: "shuffle-hand", p });
}

const mine = (ctx) => ctx.state.players[ctx.player];
const theirs = (ctx) => ctx.state.players[other(ctx.player)];
const hasDeck = (ctx) => mine(ctx).deck.length > 0;
const hurt = (ctx) => inPlay(ctx.state, ctx.player).filter(([slot]) => slot.damage > 0).map(([, spot]) => spot);
const healSpots = (ctx, to, whoType = "") => hurt(ctx).filter((spot) => (!to || to === "all" || (to === "active" ? spot === ACTIVE : spot === ctx.spot)) && (!whoType || defOf(ctx.state, slotAt(ctx.state, ctx.player, spot).uid, ctx.defs).types.includes(whoType)));
const energyFor = (ctx, { zone, type }) => mine(ctx)[zone].filter((uid) => {
  const def = defOf(ctx.state, uid, ctx.defs);
  return def.kind === "energy" && def.basic && (!type || def.provides.includes(type));
});
const energySpots = (ctx, { to, whoType }) =>
  inPlay(ctx.state, ctx.player)
    .filter(([slot, spot]) => (to === "self" ? spot === ctx.spot : to === "active" ? spot === ACTIVE : to === "bench" ? spot !== ACTIVE : true) && (!whoType || defOf(ctx.state, slot.uid, ctx.defs).types.includes(whoType)))
    .map(([, spot]) => spot);
/** Their Pokémon this card may touch: not one whose Ability keeps off this kind of card (see `warded`). */
const open = (ctx) => inPlay(ctx.state, other(ctx.player)).filter(([slot]) => !warded(ctx.state, slot, ctx, ctx.defs));
const counterSpots = (ctx, where) => open(ctx).map(([, spot]) => spot).filter((spot) => (where === "bench" ? spot !== ACTIVE : where === "active" ? spot === ACTIVE : true));
const gustSpots = (ctx, stage = "") => open(ctx).filter(([slot, spot]) => spot !== ACTIVE && (!stage || defOf(ctx.state, slot.uid, ctx.defs).stage === stage)).map(([, spot]) => spot);
const frontOpen = (ctx) => Boolean(theirs(ctx).active) && !warded(ctx.state, theirs(ctx).active, ctx, ctx.defs);
/** Where an Energy moved off `from` may go. */
export const moveTargets = (ctx, { to = "any" }, from) =>
  inPlay(ctx.state, ctx.player)
    .map(([, spot]) => spot)
    .filter((spot) => spot !== from && (to === "self" ? spot === ctx.spot : to === "active" ? spot === ACTIVE : to === "bench" ? spot !== ACTIVE : true));
const benchSpots = (side) => side.bench.map((_, i) => i);
/** Your Pokémon (as spots) that hold an Energy of this type ("" for any), and the uid of the last such card. */
export const energyIn = (ctx, slot, type, basic = false) => [...slot.energy].reverse().find((uid) => {
  const def = defOf(ctx.state, uid, ctx.defs);
  return (!type || (def.provides || []).includes(type)) && (!basic || def.basic);
});
const movable = (ctx, { type = "", from = "any", basic = false }) =>
  inPlay(ctx.state, ctx.player)
    .filter(([slot, spot]) => (from === "self" ? spot === ctx.spot : from === "bench" ? spot !== ACTIVE : from === "active" ? spot === ACTIVE : true) && energyIn(ctx, slot, type, basic))
    .map(([, spot]) => spot);
/** Your other Pokémon holding Energy of this type, that could give it to the one at `to`. */
const givers = (ctx, type, to) => inPlay(ctx.state, ctx.player).filter(([slot, spot]) => spot !== to && energyIn(ctx, slot, type)).map(([, spot]) => spot);
const isSpecial = (ctx, uid) => {
  const def = defOf(ctx.state, uid, ctx.defs);
  return def.kind === "energy" && !def.basic;
};
const withEnergy = (ctx, special = false, tool = false) => open(ctx).filter(([slot]) => (tool && slot.tool) || (special ? slot.energy.some((uid) => isSpecial(ctx, uid)) : slot.energy.length)).map(([, spot]) => spot);
/** Cards from your hand that would evolve one of your Pokémon the way `how` says (Rare Candy). */
const candyCards = (ctx, how) => mine(ctx).hand.filter((uid) => evolveSpots(ctx.state, ctx.player, defOf(ctx.state, uid, ctx.defs), ctx.defs, how).length > 0);
/** Cards in play a card may discard: Tools, Special Energy (yours too when `mine` is "both"), the Stadium. */
function inPlayCards(ctx, { tools = "", special = "", stadium = false }) {
  const out = [];
  const sides = (who) => (who === "both" ? [...inPlay(ctx.state, ctx.player), ...open(ctx)] : who === "foe" ? open(ctx) : []);
  for (const [slot] of sides(tools)) if (slot.tool) out.push(slot.tool);
  for (const [slot] of sides(special)) out.push(...slot.energy.filter((uid) => isSpecial(ctx, uid)));
  if (stadium && ctx.state.stadium) out.push(ctx.state.stadium.uid);
  return out;
}
/** Cards in your hand a step may put into your deck: one fewer while the card itself is still there. */
const stashable = (ctx, { what = "any", spare = ctx.spot != null ? 0 : 1 }) => fitting(ctx, mine(ctx).hand, what).length - (what === "any" ? spare : 0);
/** Your Pokémon that are hurt or have a Special Condition. */
const careSpots = (ctx) => inPlay(ctx.state, ctx.player).filter(([slot]) => slot.damage > 0 || conditionsOn(slot).length).map(([, spot]) => spot);
/** Every Energy on one of your Pokémon goes to the discard pile. */
export function stripEnergy(ctx, p, spot) {
  const slot = slotAt(ctx.state, p, spot);
  const gone = slot ? slot.energy.splice(0) : [];
  if (!gone.length) return;
  ctx.state.players[p].discard.push(...gone);
  ctx.events.push({ t: "discard-energy", p, spot, uids: gone });
}

/**
 * Does a card fit what a search asks for? `what` is a kind ("basic", "basicEnergy", "item" ...),
 * a kind and a type ("basic:Water", "basicEnergy:Fire"), or a name ("name=Deoxys").
 * A Pokémon kind may end in "!rule" (no Rule Box) and "@70" (70 HP or less); "a|b" is either.
 */
export function fits(def, what) {
  if (!def) return false;
  if (what === "any") return true;
  if (what.includes("|")) return what.split("|").some((one) => fits(def, one));
  const cap = what.match(/@(\d+)$/);
  if (cap) return def.kind === "pokemon" && def.hp <= Number(cap[1]) && fits(def, what.slice(0, cap.index));
  if (what.endsWith("!rule")) return def.kind === "pokemon" && !def.rule && fits(def, what.slice(0, -5));
  if (what.endsWith("!ex")) return def.kind === "pokemon" && def.box !== "ex" && fits(def, what.slice(0, -3));
  if (what.startsWith("name=")) return def.kind === "pokemon" && def.name === what.slice(5);
  if (what.startsWith("name^")) return def.kind === "pokemon" && (def.name === what.slice(5) || def.name.startsWith(`${what.slice(5)} `));
  if (what.includes(":")) {
    const [kind, type] = what.split(":");
    if (!fits(def, kind)) return false;
    return def.kind === "energy" ? def.provides.includes(type) : (def.types || []).includes(type);
  }
  if (what === "energy") return def.kind === "energy";
  if (what === "pokemon") return def.kind === "pokemon";
  if (what === "basic") return def.kind === "pokemon" && def.stage === "basic";
  if (what === "evolution") return def.kind === "pokemon" && def.stage === "evolution";
  if (what === "basicEnergy") return def.kind === "energy" && def.basic;
  if (what === "trainer") return def.kind === "trainer";
  return def.kind === "trainer" && def.sub === what; // item, supporter
}
const fitting = (ctx, uids, what) => uids.filter((uid) => fits(defOf(ctx.state, uid, ctx.defs), what));

export const T_OPS = {
  /**
   * Search the deck: the player sees the cards that fit and takes up to n (a search may come up
   * empty: the deck is hidden, so "none" is always allowed). `to`: "hand" or "bench".
   */
  search: {
    ready: (ctx, { to = "hand" }) => hasDeck(ctx) && (to !== "bench" || mine(ctx).bench.length < ctx.state.rules.bench),
    run(ctx, { what, n = 1, to = "hand", top = 0 }) {
      const side = mine(ctx);
      const pool = top ? side.deck.slice(0, top) : side.deck;
      const room = to === "bench" ? ctx.state.rules.bench - side.bench.length : Infinity;
      askChoose(ctx.state, { player: ctx.player, zone: "deck", what, uids: fitting(ctx, pool, what), min: 0, max: Math.min(n, room), effect: { op: to === "bench" ? "toBench" : "toHand" }, shuffle: true });
    },
  },
  /** Cards come back from the discard pile to the hand (or, `to: "bench"`, Basic Pokémon onto the Bench). */
  recover: {
    ready: (ctx, { what, to = "hand" }) => fitting(ctx, mine(ctx).discard, what).length > 0 && (to !== "bench" || mine(ctx).bench.length < ctx.state.rules.bench),
    run(ctx, { what, n = 1, upTo = false, to = "hand" }) {
      const uids = fitting(ctx, mine(ctx).discard, what);
      const max = to === "bench" ? Math.min(n, ctx.state.rules.bench - mine(ctx).bench.length) : n;
      if (uids.length && max > 0) askChoose(ctx.state, { player: ctx.player, zone: "discard", what, uids, min: upTo ? 0 : Math.min(max, uids.length), max, effect: { op: to === "bench" ? "toBench" : "toHand" } });
    },
  },
  /** The Stadium in play goes to its owner's discard pile. */
  dropStadium: {
    ready: (ctx) => Boolean(ctx.state.stadium),
    run(ctx) {
      const { stadium } = ctx.state;
      if (!stadium) return;
      ctx.state.players[stadium.owner].discard.push(stadium.uid);
      ctx.state.stadium = null;
      ctx.events.push({ t: "stadium-gone", p: stadium.owner, uid: stadium.uid });
    },
  },
  /** The price of playing the card: n other cards from the hand go to the discard pile. */
  cost: {
    must: true,
    // While the card is still in the hand it counts itself, so "other cards" is one fewer.
    // An Ability asking the same price isn't in the hand (`spare: 0`).
    // An Ability (ctx.spot set) isn't a card in the hand either. `what`: the price must be cards of that kind.
    ready: (ctx, { n, what = "any", spare = ctx.spot != null ? 0 : 1 }) => fitting(ctx, mine(ctx).hand, what).length - (what === "any" ? spare : 0) >= n,
    run(ctx, { n, what = "any" }) {
      const uids = fitting(ctx, mine(ctx).hand, what);
      askChoose(ctx.state, { player: ctx.player, zone: "hand", what, uids, min: Math.min(n, uids.length), max: n, effect: { op: "discard" } });
    },
  },
  draw: {
    ready: hasDeck,
    run: (ctx, { n }) => draw(ctx, ctx.player, n),
  },
  /** Draw until the hand holds n cards. */
  drawTo: {
    ready: (ctx, { n }) => hasDeck(ctx) && mine(ctx).hand.length < n,
    run: (ctx, { n }) => draw(ctx, ctx.player, Math.max(0, n - mine(ctx).hand.length)),
  },
  discardHand: {
    ready: () => true,
    run(ctx) {
      const side = mine(ctx);
      const gone = side.hand.splice(0);
      if (!gone.length) return;
      side.discard.push(...gone);
      ctx.events.push({ t: "discard-hand", p: ctx.player, uids: gone });
    },
  },
  /** The hand goes back into the deck. `both`: the other player's too. */
  shuffleHand: {
    ready: () => true,
    run(ctx, { both = false }) {
      handBack(ctx, ctx.player);
      if (both) handBack(ctx, other(ctx.player));
    },
  },
  /** Only the other player's hand goes back into their deck. */
  foeShuffle: {
    ready: () => true,
    run: (ctx) => handBack(ctx, other(ctx.player)),
  },
  /** The other player draws too (after "each player shuffles their hand"). */
  foeDraw: {
    ready: () => true,
    run: (ctx, { n }) => draw(ctx, other(ctx.player), n),
  },
  /** A card for each card in the other player's hand. */
  drawPerFoeHand: {
    ready: hasDeck,
    run: (ctx) => draw(ctx, ctx.player, theirs(ctx).hand.length),
  },
  flipDraw: {
    ready: hasDeck,
    run(ctx) {
      const results = [];
      do results.push(flip(ctx.state));
      while (results[results.length - 1] && results.length < 60);
      ctx.events.push({ t: "flip", p: ctx.player, results });
      draw(ctx, ctx.player, results.filter(Boolean).length);
    },
  },
  /** Flip a coin and run one list of steps or the other. */
  flip: {
    ready: (ctx, { heads = [] }) => heads.some((step) => T_OPS[step.op].ready(ctx, step)),
    run(ctx, { heads = [], tails = [] }) {
      const result = flip(ctx.state);
      ctx.events.push({ t: "flip", p: ctx.player, results: [result] });
      runTrainer(result ? heads : tails, ctx);
    },
  },
  /** Heal one of your Pokémon: you choose which, among the hurt ones. */
  /**
   * `cure`: it shakes off its Special Conditions too (and a Pokémon with only those may be chosen).
   * `strip`: every Energy on a healed Pokémon is discarded.
   */
  heal: {
    ready: (ctx, { to = "", cure = false, whoType = "" }) => (cure ? careSpots(ctx) : healSpots(ctx, to, whoType)).length > 0,
    run(ctx, { n, to = "", cure = false, strip = false, whoType = "" }) {
      const spots = cure ? careSpots(ctx) : healSpots(ctx, to, whoType);
      // An Ability may name who is healed (itself, the Active Pokémon, all of them): no choice then.
      if (to) {
        for (const spot of spots) {
          const slot = slotAt(ctx.state, ctx.player, spot);
          const healed = Math.min(n, slot.damage);
          slot.damage -= healed;
          ctx.events.push({ t: "heal", p: ctx.player, spot, n: healed });
          if (strip) stripEnergy(ctx, ctx.player, spot);
        }
        return;
      }
      if (spots.length) askPick(ctx.state, { player: ctx.player, side: ctx.player, spots, left: 1, effect: { op: "heal", n, ...(cure ? { cure } : {}), ...(strip ? { strip } : {}) } });
    },
  },
  /** Your Active Pokémon and one from your Bench trade places. */
  switch: {
    ready: (ctx) => Boolean(mine(ctx).active) && mine(ctx).bench.length > 0,
    run(ctx) {
      // After "if you do" or "if any", there may be nothing to switch with.
      if (mine(ctx).active && mine(ctx).bench.length) askPick(ctx.state, { player: ctx.player, side: ctx.player, spots: benchSpots(mine(ctx)), left: 1, effect: { op: "switch" } });
    },
  },
  /** One of their Benched Pokémon is pulled into the Active Spot: you choose which. */
  gust: {
    ready: (ctx, { stage = "" } = {}) => Boolean(theirs(ctx).active) && gustSpots(ctx, stage).length > 0,
    run: (ctx, { stage = "" } = {}) => askPick(ctx.state, { player: ctx.player, side: other(ctx.player), spots: gustSpots(ctx, stage), left: 1, effect: { op: "switch" } }),
  },
  /** Discard an Energy from one of their Pokémon. `special`: a Special Energy only; `each`: one from each of them, no choice. */
  hammer: {
    ready: (ctx, { special = false, tool = false }) => withEnergy(ctx, special, tool).length > 0,
    run(ctx, { n = 1, special = false, each = false, toHand = false, tool = false }) {
      const spots = withEnergy(ctx, special, tool);
      if (each) {
        for (const spot of spots) {
          const slot = slotAt(ctx.state, other(ctx.player), spot);
          const uid = [...slot.energy].reverse().find((e) => isSpecial(ctx, e));
          slot.energy.splice(slot.energy.indexOf(uid), 1);
          theirs(ctx).discard.push(uid);
          ctx.events.push({ t: "discard-energy", p: other(ctx.player), spot, uids: [uid] });
        }
        return;
      }
      if (spots.length) askPick(ctx.state, { player: ctx.player, side: other(ctx.player), spots, left: 1, effect: { op: "discardEnergy", n, ...(special ? { special } : {}), ...(toHand ? { toHand } : {}), ...(tool ? { tool } : {}) } });
    },
  },
  /**
   * Rare Candy: a card from your hand evolves one of your Pokémon. `how` as canEvolveOnto reads it
   * (skip "2": a Stage 2 straight onto its Basic Pokémon). The card is chosen, then the Pokémon.
   */
  candy: {
    ready: (ctx, { how = {} }) => candyCards(ctx, how).length > 0,
    run(ctx, { how = {} }) {
      const uids = candyCards(ctx, how);
      if (uids.length) askChoose(ctx.state, { player: ctx.player, zone: "hand", what: "evolution", uids, min: 1, max: 1, effect: { op: "evolveFrom", how } });
    },
  },
  /**
   * Energy from the hand or the discard pile onto one of your Pokémon (`to`, `whoType` as energize reads
   * them): the player chooses the card (or up to n, `upTo`), then the Pokémon.
   */
  attachPick: {
    ready: (ctx, step) => fitting(ctx, mine(ctx)[step.zone], step.what).length > 0 && energySpots(ctx, step).length > 0,
    run(ctx, step) {
      const uids = fitting(ctx, mine(ctx)[step.zone], step.what);
      const spots = energySpots(ctx, step);
      if (uids.length && spots.length) askChoose(ctx.state, { player: ctx.player, zone: step.zone, what: step.what, uids, min: step.upTo ? 0 : 1, max: step.n || 1, effect: { op: "attach", to: "one", spots, need: true } });
    },
  },
  /** Evosoda, Wally: a card from the deck evolves one of your Pokémon (`where` "active": the Active one). */
  evolveDeck: {
    ready: (ctx, { how = {}, where = "" }) => hasDeck(ctx) && inPlay(ctx.state, ctx.player).some(([slot, spot]) => (where !== "active" || spot === ACTIVE) && mayEvolve(ctx.state, slot, ctx.defs, how)),
    run(ctx, { how = {}, where = "" }) {
      const uids = mine(ctx).deck.filter((uid) => evolveSpots(ctx.state, ctx.player, defOf(ctx.state, uid, ctx.defs), ctx.defs, how, where).length > 0);
      askChoose(ctx.state, { player: ctx.player, zone: "deck", what: "evolution", uids, min: 0, max: 1, effect: { op: "evolveFrom", how, ...(where ? { where } : {}) }, shuffle: true });
    },
  },
  /**
   * Discard cards in play: Tools (`tools` "both" or "foe"), Special Energy (`special` the same), the Stadium.
   * Up to n of them, or exactly `min`.
   */
  dropInPlay: {
    ready: (ctx, step) => inPlayCards(ctx, step).length > 0,
    run(ctx, step) {
      const uids = inPlayCards(ctx, step);
      if (uids.length) askChoose(ctx.state, { player: ctx.player, zone: "play", what: "any", uids, min: step.min || 0, max: step.n || 1, effect: { op: "dropInPlay" } });
    },
  },
  /**
   * Cards from your hand into your deck: `at` "into" (shuffled), "top" or "bottom". `need`: the card
   * can't be played without them (a price); otherwise as many as there are, up to n.
   */
  stash: {
    ready: (ctx, step) => !step.need || stashable(ctx, step) >= (step.n || 1),
    run(ctx, { n = 1, what = "any", at = "into" }) {
      const uids = fitting(ctx, mine(ctx).hand, what);
      if (uids.length) askChoose(ctx.state, { player: ctx.player, zone: "hand", what, uids, min: Math.min(n, uids.length), max: n, effect: { op: at === "top" ? "toTop" : "toBottom" }, ...(at === "into" ? { shuffle: true } : {}) });
    },
  },
  /** This Pokémon, on the Bench, trades places with the Active one. */
  switchSelf: {
    ready: (ctx) => ctx.spot != null && ctx.spot !== ACTIVE && Boolean(mine(ctx).active),
    run: (ctx) => switchActive(ctx.state, ctx.player, ctx.spot, ctx.events, ctx.defs),
  },
  /** Damage counters on one of their Pokémon, your choice (not an attack: no Weakness, no Resistance). */
  counters: {
    ready: (ctx, { where = "" }) => counterSpots(ctx, where).length > 0,
    run(ctx, { n, where = "" }) {
      askPick(ctx.state, { player: ctx.player, side: other(ctx.player), spots: counterSpots(ctx, where), left: 1, effect: { op: "damage", n } });
    },
  },
  /** An Energy card from the hand or the discard pile goes onto one of your Pokémon, outside the one a turn. */
  energize: {
    ready: (ctx, step) => energyFor(ctx, step).length > 0 && energySpots(ctx, step).length > 0,
    run(ctx, step) {
      const uid = energyFor(ctx, step)[0];
      const spots = energySpots(ctx, step);
      if (!uid || !spots.length) return;
      askPick(ctx.state, { player: ctx.player, side: ctx.player, spots, left: 1, effect: { op: "attachFrom", zone: step.zone, uid } });
    },
  },
  /** Special Conditions on the other Active Pokémon (an Ability's, so nothing on the attack side can stop it). */
  condition: {
    ready: frontOpen,
    run(ctx, { kinds }) {
      for (const kind of kinds) if (addCondition(ctx.state, theirs(ctx).active, kind, ctx.defs)) ctx.events.push({ t: "condition", p: other(ctx.player), kind });
    },
  },
  /** Their Active Pokémon goes to the Bench; they choose what comes in. */
  foeSwitch: {
    ready: (ctx) => frontOpen(ctx) && theirs(ctx).bench.length > 0,
    run(ctx) {
      // A card can carry on past this step ("... Then, switch your Active Pokémon"), so it checks again here.
      if (frontOpen(ctx) && theirs(ctx).bench.length) askPick(ctx.state, { player: other(ctx.player), side: other(ctx.player), spots: benchSpots(theirs(ctx)), left: 1, effect: { op: "switch" } });
    },
  },
  /**
   * Move an Energy (of `type`, or any) from one of your Pokémon to another. `from`: "any", "self"
   * (the Pokémon whose Ability it is), "bench"; `to`: "any", "self", "active". Two picks: where from, then where to.
   */
  moveEnergy: {
    ready: (ctx, step) => movable(ctx, step).some((spot) => moveTargets(ctx, step, spot).length > 0),
    run(ctx, step) {
      const spots = movable(ctx, step).filter((spot) => moveTargets(ctx, step, spot).length > 0);
      if (spots.length) askPick(ctx.state, { player: ctx.player, side: ctx.player, spots, left: 1, effect: { op: "moveEnergyFrom", type: step.type || "", basic: Boolean(step.basic), to: step.to || "any", self: ctx.spot ?? null } });
    },
  },
  /** Move damage counters from one of your Pokémon to one of theirs (`to: "foe"`) or another of yours. */
  moveCounters: {
    ready: (ctx, { to = "foe" }) => hurt(ctx).length > 0 && (to !== "foe" || inPlay(ctx.state, other(ctx.player)).length > 0) && (to === "foe" || inPlay(ctx.state, ctx.player).length > 1),
    run(ctx, { n, to = "foe" }) {
      askPick(ctx.state, { player: ctx.player, side: ctx.player, spots: hurt(ctx), left: 1, effect: { op: "moveCountersFrom", n, to } });
    },
  },
  /** Energy from the deck straight onto your Pokémon: `to` "self", "active", "one" (all on one) or "spread" (any way you like). */
  fetchEnergy: {
    ready: (ctx, { to }) => hasDeck(ctx) && (to !== "self" || ctx.spot != null) && inPlay(ctx.state, ctx.player).length > 0,
    run(ctx, { what, n = 1, to, top = 0 }) {
      const side = mine(ctx);
      const pool = top ? side.deck.slice(0, top) : side.deck;
      askChoose(ctx.state, { player: ctx.player, zone: "deck", what, uids: fitting(ctx, pool, what), min: 0, max: n, effect: { op: "attach", to, spot: to === "self" ? ctx.spot : to === "active" ? ACTIVE : null }, shuffle: !top });
    },
  },
  /** "Search your deck for another Deoxys and switch it with Deoxys": the new card takes over the slot. */
  formChange: {
    ready: (ctx, { name, any = false }) => ctx.spot != null && fitting(ctx, mine(ctx).deck, `${any ? "name^" : "name="}${name}`).length > 0,
    run(ctx, { name, any = false }) {
      const what = `${any ? "name^" : "name="}${name}`;
      askChoose(ctx.state, { player: ctx.player, zone: "deck", what, uids: fitting(ctx, mine(ctx).deck, what), min: 0, max: 1, effect: { op: "swapIn", spot: ctx.spot }, shuffle: true });
    },
  },
  /**
   * "Move any amount of Fire Energy from your other Pokémon to it": the player picks a Pokémon to
   * take one from, again and again, and stops when they like (the picks are optional).
   */
  gather: {
    ready: (ctx, { type = "" }) => ctx.spot != null && givers(ctx, type, ctx.spot).length > 0,
    run(ctx, { type = "" }) {
      const spots = givers(ctx, type, ctx.spot);
      if (spots.length) askPick(ctx.state, { player: ctx.player, side: ctx.player, spots, left: 1, optional: true, effect: { op: "gatherFrom", type, to: ctx.spot } });
    },
  },
  /** The top n cards of the other player's deck go to their discard pile. */
  foeMill: {
    ready: (ctx) => theirs(ctx).deck.length > 0,
    run(ctx, { n }) {
      const side = theirs(ctx);
      const gone = side.deck.splice(0, n);
      side.discard.push(...gone);
      if (gone.length) ctx.events.push({ t: "mill", p: other(ctx.player), uids: gone });
    },
  },
  /** n cards at random from the other player's hand go to their discard pile. */
  foeDiscardRandom: {
    ready: (ctx) => theirs(ctx).hand.length > 0,
    run(ctx, { n }) {
      const side = theirs(ctx);
      const gone = [];
      for (let i = 0; i < n && side.hand.length; i += 1) gone.push(...side.hand.splice(Math.floor(rand(ctx.state) * side.hand.length), 1));
      side.discard.push(...gone);
      if (gone.length) ctx.events.push({ t: "discard-hand", p: other(ctx.player), uids: gone, random: true });
    },
  },
  /** Your Active Pokémon (or, `to: "self"`, the one the card is on) shakes off every Special Condition. */
  cure: {
    ready: (ctx, { to = "" } = {}) => conditionsOn(to === "self" ? slotAt(ctx.state, ctx.player, ctx.spot) : mine(ctx).active).length > 0,
    run(ctx, { to = "" } = {}) {
      const slot = to === "self" ? slotAt(ctx.state, ctx.player, ctx.spot) : mine(ctx).active;
      for (const kind of conditionsOn(slot)) ctx.events.push({ t: "cure", p: ctx.player, kind });
      if (slot) delete slot.status;
    },
  },
  /** Damage counters on the Pokémon the card is on (Rainbow Energy's price). */
  hurtSelf: {
    ready: (ctx) => ctx.spot != null,
    run(ctx, { n }) {
      const slot = slotAt(ctx.state, ctx.player, ctx.spot);
      if (!slot) return;
      slot.damage += n;
      ctx.events.push({ t: "damage", p: ctx.player, spot: ctx.spot, n, self: true, why: "energy" });
    },
  },
  /** "You can use this card only if ...": nothing happens, but the card can't be played unless it holds. */
  only: {
    must: true,
    ready: (ctx, { when }) => holds(ctx, when),
    run() {},
  },
  /** "If you go first, you may use this card during your first turn": the engine reads this marker. */
  early: {
    must: true,
    ready: () => true,
    run() {},
  },
  /** Look at the top cards and take some of them (they're seen, so `min` of them must be taken). */
  topTake: {
    ready: hasDeck,
    run(ctx, { n, top, min = n, shuffle: mix = false }) {
      const uids = mine(ctx).deck.slice(0, top);
      askChoose(ctx.state, { player: ctx.player, zone: "deck", what: "any", uids, min, max: n, effect: { op: "toHand" }, top, shuffle: mix });
    },
  },
  /** The top n cards of the deck go to the discard pile ("discard the other cards" after a look). */
  mill: {
    ready: hasDeck,
    run(ctx, { n }) {
      const side = mine(ctx);
      const gone = side.deck.splice(0, n);
      if (!gone.length) return;
      side.discard.push(...gone);
      ctx.events.push({ t: "mill", p: ctx.player, uids: gone });
    },
  },
  /** The top n cards, shuffled, go to the bottom of the deck. */
  under: {
    ready: hasDeck,
    run(ctx, { n }) {
      const side = mine(ctx);
      const cards = side.deck.splice(0, n);
      shuffle(ctx.state, cards);
      side.deck.push(...cards);
    },
  },
  /** Cards from the discard pile are shuffled back into the deck. */
  recycle: {
    ready: (ctx, { what }) => fitting(ctx, mine(ctx).discard, what).length > 0,
    run(ctx, { what, n, upTo = false }) {
      const uids = fitting(ctx, mine(ctx).discard, what);
      if (uids.length) askChoose(ctx.state, { player: ctx.player, zone: "discard", what, uids, min: upTo ? 0 : n, max: n, effect: { op: "toDeck" }, shuffle: true });
    },
  },
  /** Hands shuffled and put on the bottom of the decks (`who`: "both" or "foe"); `ctx.moved` counts the cards. */
  handBottom: {
    ready: () => true,
    run(ctx, { who = "both" }) {
      ctx.moved = 0;
      for (const p of who === "foe" ? [other(ctx.player)] : [ctx.player, other(ctx.player)]) {
        const side = ctx.state.players[p];
        if (!side.hand.length) continue;
        const cards = side.hand.splice(0);
        shuffle(ctx.state, cards);
        side.deck.push(...cards);
        ctx.moved += cards.length;
        ctx.events.push({ t: "shuffle-hand", p, bottom: true });
      }
    },
  },
  /** Each player draws a card for each of their remaining Prize cards. */
  drawPrizes: {
    ready: () => true,
    run(ctx) {
      for (const p of [ctx.player, other(ctx.player)]) draw(ctx, p, ctx.state.players[p].prizes.length);
    },
  },
  /** One of your Pokémon goes back to your hand: `keep` "all" (with what's attached), "mon" (its Pokémon cards), "basic" (only its Basic card). */
  bounce: {
    ready: (ctx, step) => bounceSpots(ctx, step).length > 0,
    run(ctx, step) {
      const spots = bounceSpots(ctx, step);
      if (spots.length) askPick(ctx.state, { player: ctx.player, side: ctx.player, spots, left: 1, effect: { op: "bounce", keep: step.keep } });
    },
  },
  /**
   * "During this turn, your Pokémon's attacks do n more damage": `who` the attackers it is for
   * (as fieldFits reads it), `vs` the rule boxes of the Active Pokémon it counts against ([] for any).
   */
  boost: {
    ready: () => true,
    run(ctx, { n, who = {}, vs = [] }) {
      // Only this turn's count, so the list never grows.
      ctx.state.boosts = [...(ctx.state.boosts || []).filter((b) => b.turn === ctx.state.turn), { p: ctx.player, turn: ctx.state.turn, n, who, vs }];
      ctx.events.push({ t: "boost", p: ctx.player, n });
    },
  },
};

/** "Put 1 of your Pokémon into your hand": never the last one you have in play. */
const bounceSpots = (ctx, { basicOnly = false }) => {
  const all = inPlay(ctx.state, ctx.player);
  if (all.length < 2) return [];
  return all.filter(([slot]) => !basicOnly || (!slot.under.length && defOf(ctx.state, slot.uid, ctx.defs).stage === "basic")).map(([, spot]) => spot);
};

/** More damage this attack does to the Active Pokémon: from Trainers played this turn, and the attacker's Tool. */
export function boostOf(state, player, slot, target, defs) {
  const mine = defOf(state, slot.uid, defs);
  const box = defOf(state, target.uid, defs).box;
  const counts = (b) => fieldFits(b.who || {}, mine) && (!b.vs.length || b.vs.includes(box));
  const played = (state.boosts || []).filter((b) => b.p === player && b.turn === state.turn && counts(b));
  const tool = (slot.tool && defOf(state, slot.tool, defs)?.tool?.plusVs) || null;
  return played.reduce((n, b) => n + b.n, 0) + (tool && counts(tool) ? tool.n : 0);
}

/**
 * Does a condition a card names hold right now? { foePrizes: { max, in }, myPrizes, behind (you have
 * more Prize cards left), lost (one of yours was Knocked Out last turn), first (your first turn),
 * second (you went second and it's your first turn), alone (only your Active Pokémon), moved, not }.
 */
/** Prize cards a player has left: a list in the full state, a count in a player's view (viewFor). */
export const prizesLeft = (side) => (Array.isArray(side.prizes) ? side.prizes.length : Number(side.prizes) || 0);

export function holds(ctx, when) {
  if (!when) return true;
  if (when.not) return !holds(ctx, when.not);
  const me = mine(ctx), foe = theirs(ctx);
  const within = (side, rule) => (rule.max == null || prizesLeft(side) <= rule.max) && (!rule.in || rule.in.includes(prizesLeft(side)));
  if (when.foePrizes && !within(foe, when.foePrizes)) return false;
  if (when.myPrizes && !within(me, when.myPrizes)) return false;
  if (when.behind && prizesLeft(me) <= prizesLeft(foe)) return false;
  if (when.lost && !(me.lostOn || []).includes(ctx.state.turn - 1)) return false;
  if (when.first && ctx.state.turn > 2) return false;
  if (when.second && ctx.state.turn !== 2) return false;
  if (when.alone && (me.bench.length || !me.active)) return false;
  if (when.moved && !ctx.moved) return false;
  if (when.myStadium && ctx.state.stadium?.owner !== ctx.player) return false;
  return true;
}

const PRIZES = "Prize cards (?:remaining|left)";
const nums = (words) => (words.match(/\d+/g) || []).map(Number);
/** A condition in a card's words, or null when it isn't read. */
export function condOf(words) {
  let m = words.match(new RegExp(`^your opponent has (\\d+) or fewer ${PRIZES}$`));
  if (m) return { foePrizes: { max: Number(m[1]) } };
  m = words.match(new RegExp(`^your opponent has exactly ((?:\\d+(?:, or |, | or )?)+) ${PRIZES}$`));
  if (m) return { foePrizes: { in: nums(m[1]) } };
  m = words.match(new RegExp(`^you have exactly ((?:\\d+(?:, or |, | or )?)+) ${PRIZES}$`));
  if (m) return { myPrizes: { in: nums(m[1]) } };
  if (new RegExp(`^you have more ${PRIZES} than your opponent$`).test(words)) return { behind: true };
  if (/^(?:any of your Pokémon were|1 of your Pokémon was) Knocked Out during your opponent's last turn$/.test(words)) return { lost: true };
  if (/^it's your first turn$/.test(words)) return { first: true };
  if (/^you go second and it's your first turn$/.test(words)) return { second: true };
  if (/^your Active Pokémon is your only Pokémon in play$/.test(words)) return { alone: true };
  if (/^you have a Stadium in play$/.test(words)) return { myStadium: true };
  return null;
}

const N = "(\\d+|an?|one|two|three|four|five|six|seven|eight)";
const SHUFFLE_BOTH = "Each player shuffles (?:their|his or her) hand into (?:their|his or her) deck";

/** [wording, steps]. */
const TYPE_WORD = "Grass|Fire|Water|Lightning|Psychic|Fighting|Darkness|Metal|Fairy|Dragon|Colorless";
const PATTERNS = [
  [new RegExp(`^Draw ${N} cards?\\.$`, "i"), (m) => [{ op: "draw", n: count(m[1]) }]],
  [/^Discard your hand and draw (\d+) cards\.$/, (m) => [{ op: "discardHand" }, { op: "draw", n: Number(m[1]) }]],
  [/^Discard your hand, then draw (\d+) cards\.$/, (m) => [{ op: "discardHand" }, { op: "draw", n: Number(m[1]) }]],
  [new RegExp(`^Shuffle your hand into your deck\\. Then, draw ${N} cards?\\.$`, "i"), (m) => [{ op: "shuffleHand" }, { op: "draw", n: count(m[1]) }]],
  [new RegExp(`^Shuffle your hand into your deck, then draw ${N} cards?\\.$`, "i"), (m) => [{ op: "shuffleHand" }, { op: "draw", n: count(m[1]) }]],
  [new RegExp(`^${SHUFFLE_BOTH} and draws ${N} cards?\\.$`, "i"), (m) => [{ op: "shuffleHand", both: true }, { op: "draw", n: count(m[1]) }, { op: "foeDraw", n: count(m[1]) }]],
  [new RegExp(`^${SHUFFLE_BOTH}\\. Then, each player draws ${N} cards?\\.$`, "i"), (m) => [{ op: "shuffleHand", both: true }, { op: "draw", n: count(m[1]) }, { op: "foeDraw", n: count(m[1]) }]],
  [/^Shuffle your hand into your deck\. Then, draw a card for each card in your opponent's hand\.$/, () => [{ op: "shuffleHand" }, { op: "drawPerFoeHand" }]],
  [/^Draw cards until you have (\d+) cards in your hand\.$/, (m) => [{ op: "drawTo", n: Number(m[1]) }]],
  [/^Flip a coin until you get tails\. For each heads, draw a card\.$/, () => [{ op: "flipDraw" }]],
  [/^Heal (\d+) damage from 1 of your Pokémon\.$/, (m) => [{ op: "heal", n: Number(m[1]) }]],
  [/^Remove (\d+) damage counters? from 1 of your Pokémon(?: \(remove \d+ damage counters? if that Pokémon has only \d+\))?\.$/, (m) => [{ op: "heal", n: Number(m[1]) * 10 }]],
  [/^Remove up to (\d+) damage counters from 1 of your Pokémon\.$/, (m) => [{ op: "heal", n: Number(m[1]) * 10 }]],
  [/^Switch (?:1 of )?your Active Pokémon with 1 of your Benched Pokémon\.$/, () => [{ op: "switch" }]],
  [/^Switch in 1 of your opponent's Benched Pokémon to the Active Spot\.$/, () => [{ op: "gust" }]],
  [/^Switch 1 of your opponent's Benched Pokémon with (?:his or her|their) Active Pokémon\.$/, () => [{ op: "gust" }]],
  [/^Choose 1 of your opponent's Benched Pokémon and switch it with (?:his or her|their|your opponent's) Active Pokémon\.$/, () => [{ op: "gust" }]],
  [/^Flip a coin\. If heads, switch in 1 of your opponent's Benched Pokémon to the Active Spot\.$/, () => [{ op: "flip", heads: [{ op: "gust" }] }]],
  [/^Flip a coin\. If heads, (?:switch 1 of your opponent's Benched Pokémon with (?:his or her|their) Active Pokémon|choose 1 of your opponent's Benched Pokémon and switch it with (?:his or her|their|your opponent's) Active Pokémon)\.$/, () => [{ op: "flip", heads: [{ op: "gust" }] }]],
  [/^Flip a coin\. If heads, discard an Energy (?:card )?(?:from|attached to) 1 of your opponent's Pokémon\.$/, () => [{ op: "flip", heads: [{ op: "hammer" }] }]],
  [/^Flip a coin\. If heads, choose 1 Energy card attached to 1 of your opponent's Pokémon and discard it\.$/, () => [{ op: "flip", heads: [{ op: "hammer" }] }]],
  [/^Remove all Special Conditions from your Active Pokémon\.$/, () => [{ op: "cure" }]],
  [/^Your Active Pokémon is no longer Asleep, Confused, Paralyzed,(?: or Poisoned| Poisoned, or Burned)\.$/, () => [{ op: "cure" }]],
  [/^Switch 1 of your (?:own )?Benched Pokémon with your Active Pokémon\.$/, () => [{ op: "switch" }]],
  [/^Choose 1 Energy card attached to 1 of your opponent's Pokémon and discard it\.$/, () => [{ op: "hammer" }]],
  [/^Discard an Energy (?:card )?(?:from|attached to) 1 of your opponent's Pokémon\.$/, () => [{ op: "hammer" }]],
  [/^Move an? [Bb]asic Energy(?: card)? (?:from|attached to) 1 of your Pokémon to another of your Pokémon\.$/, () => [{ op: "moveEnergy", basic: true }]],
  // Draws that grow when something holds ("If your opponent has 3 or fewer Prize cards remaining").
  [new RegExp(`^Draw ${N} cards?\\. If (.+?), draw ${N} more cards?\\.$`), (m) => when(m[2], (w) => [{ op: "draw", n: count(m[1]) }, { op: "draw", n: count(m[3]), when: w }])],
  [new RegExp(`^(Shuffle your hand into your deck\\. Then, d|D)raw ${N} cards\\. If (.+?), draw ${N} cards instead\\.$`), (m) => when(m[3], (w) => [...(m[1].length > 1 ? [{ op: "shuffleHand" }] : []), { op: "draw", n: count(m[2]), when: { not: w } }, { op: "draw", n: count(m[4]), when: w }])],
  [/^Draw cards until you have (\d+) cards in your hand\. If (.+?), draw cards until you have (\d+) cards in your hand(?: instead)?\.$/, (m) => when(m[2], (w) => [{ op: "drawTo", n: Number(m[1]), when: { not: w } }, { op: "drawTo", n: Number(m[3]), when: w }])],
  // Hands to the bottom of the decks, then fresh cards.
  [/^Each player shuffles their hand and puts it on the bottom of their deck\. If either player put any cards on the bottom of their deck in this way, each player draws a card for each of their remaining Prize cards\.$/, () => [{ op: "handBottom" }, { op: "drawPrizes", when: { moved: true } }]],
  [new RegExp(`^Each player shuffles their hand and puts it on the bottom of their deck\\. If either player put any cards on the bottom of their deck in this way, you draw ${N} cards?, and your opponent draws ${N} cards?\\.$`), (m) => [{ op: "handBottom" }, { op: "draw", n: count(m[1]), when: { moved: true } }, { op: "foeDraw", n: count(m[2]), when: { moved: true } }]],
  [new RegExp(`^Your opponent shuffles their hand and puts it on the bottom of their deck\\. If they put any cards on the bottom of their deck in this way, they draw ${N} cards?\\.$`), (m) => [{ op: "handBottom", who: "foe" }, { op: "foeDraw", n: count(m[1]), when: { moved: true } }]],
  [new RegExp(`^${SHUFFLE_BOTH}\\. Then, each player draws a card for each of (?:their|his or her) remaining Prize cards\\.$`), () => [{ op: "shuffleHand", both: true }, { op: "drawPrizes" }]],
  [new RegExp(`^${SHUFFLE_BOTH}\\. Then, you draw ${N} cards?, and your opponent draws ${N} cards?\\.$`), (m) => [{ op: "shuffleHand", both: true }, { op: "draw", n: count(m[1]) }, { op: "foeDraw", n: count(m[2]) }]],
  [new RegExp(`^Your opponent shuffles (?:his or her|their) hand into (?:his or her|their) deck,? then draws ${N} cards?\\.$`), (m) => [{ op: "foeShuffle" }, { op: "foeDraw", n: count(m[1]) }]],
  // Special Energy only.
  [/^Discard a Special Energy(?: card)? (?:from|attached to) 1 of your opponent's Pokémon\.$/, () => [{ op: "hammer", special: true }]],
  [/^Discard a Special Energy(?: card)? from each of your opponent's Pokémon\.$/, () => [{ op: "hammer", special: true, each: true }]],
  // Healing with more to it.
  [/^Remove all Special Conditions from each of your Active Pokémon\.$/, () => [{ op: "cure" }]],
  [/^Heal (\d+) damage and remove all Special Conditions from 1 of your Pokémon\.$/, (m) => [{ op: "heal", n: Number(m[1]), cure: true }]],
  [/^Heal (\d+) damage from 1 of your Pokémon, and it recovers from all Special Conditions\.$/, (m) => [{ op: "heal", n: Number(m[1]), cure: true }]],
  [/^Heal all damage from 1 of your Pokémon\. If you do, discard all Energy from that Pokémon\.$/, () => [{ op: "heal", n: ALL, strip: true }]],
  [/^Remove all damage counters from all of your own Pokémon with damage counters on them, then discard all Energy cards attached to those Pokémon\.$/, () => [{ op: "heal", n: ALL, to: "all", strip: true }]],
  // Switching.
  [/^Switch your opponent's Active Pokémon with 1 of (?:his or her|their) Benched Pokémon\.$/, () => [{ op: "gust" }]],
  [/^Your opponent switches 1 of (?:his or her|their) Defending Pokémon with 1 of (?:his or her|their) Benched Pokémon, if any\. You switch 1 of your Active Pokémon with 1 of your Benched Pokémon, if any\.$/, () => [{ op: "foeSwitch" }, { op: "switch" }]],
  [/^Switch 1 of your opponent's Benched Pokémon with their Active Pokémon\. If you do, switch your Active Pokémon with 1 of your Benched Pokémon\.$/, () => [{ op: "gust", need: true }, { op: "switch" }]],
  // One of your Pokémon back to your hand.
  [/^Put 1 of your Pokémon in play into your hand\. \(Discard all cards attached to that Pokémon\.\)$/, () => [{ op: "bounce", keep: "mon" }]],
  [/^Put 1 of your Basic Pokémon and all attached cards into your hand\.$/, () => [{ op: "bounce", keep: "all", basicOnly: true }]],
  [/^(?:Return|Put) 1 of your Pokémon and all cards attached to it (?:to|into) your hand\.$/, () => [{ op: "bounce", keep: "all" }]],
  [/^Choose 1 of your Pokémon in play and return its Basic Pokémon card to your hand\. \(Discard all cards attached to that card\.\)$/, () => [{ op: "bounce", keep: "basic" }]],
  [/^Heal (\d+) damage from your Active Pokémon\.$/, (m) => [{ op: "heal", n: Number(m[1]), to: "active" }]],
  [/^Heal (\d+) damage from each of your Pokémon\.$/, (m) => [{ op: "heal", n: Number(m[1]), to: "all" }]],
  [new RegExp(`^Heal (\\d+) damage from each of your (${TYPE_WORD}) Pokémon\\.$`), (m) => [{ op: "heal", n: Number(m[1]), to: "all", whoType: m[2] }]],
  [new RegExp(`^Heal (\\d+) damage from 1 of your (${TYPE_WORD}) Pokémon\\.$`), (m) => [{ op: "heal", n: Number(m[1]), whoType: m[2] }]],
  [/^Switch your Active Pokémon with 1 of your Benched Pokémon\. If you do, draw cards until you have (\d+) cards in your hand\.$/, (m) => [{ op: "switch", need: true }, { op: "drawTo", n: Number(m[1]) }]],
  [/^Draw cards from your deck until you have (\d+) cards in your hand\.$/, (m) => [{ op: "drawTo", n: Number(m[1]) }]],
  [/^Shuffle your hand into your deck\. Then, (?:count the number of cards in your opponent's hand and draw that many cards|draw a number of cards equal to the number of cards in your opponent's hand)\.$/, () => [{ op: "shuffleHand" }, { op: "drawPerFoeHand" }]],
  [new RegExp(`^Draw ${N} cards?\\. If you do, your Active Pokémon recovers from all Special Conditions\\.$`), (m) => [{ op: "draw", n: count(m[1]), need: true }, { op: "cure" }]],
  [new RegExp(`^Draw ${N} cards?\\. Discard a Stadium in play\\.$`), (m) => [{ op: "draw", n: count(m[1]) }, { op: "dropStadium" }]],
  [/^Discard a Special Energy from 1 of your opponent's Pokémon, and discard a Stadium in play\.$/, () => [{ op: "hammer", special: true }, { op: "dropStadium" }]],
  [/^Put an Energy attached to 1 of your opponent's Pokémon into their hand\.$/, () => [{ op: "hammer", toHand: true }]],
  [/^Put a Basic Pokémon from your discard pile onto your Bench\.$/, () => [{ op: "recover", what: "basic", n: 1, to: "bench" }]],
  // Evolving from the hand past a Stage (Rare Candy), or from the deck (Evosoda, Wally).
  [/^Choose 1 of your Basic Pokémon in play\. If you have a Stage 2 card in your hand that evolves from that Pokémon, put that card (?:onto|on) the Basic Pokémon(?: to evolve it(?:, skipping the Stage 1)?)?\.(?: \(This counts as evolving that Pokémon\.\))? You can't use this card during your first turn or on a Basic Pokémon that was put into play this turn\.$/, () => [{ op: "candy", how: { skip: "2" } }]],
  [/^Choose 1 of your Basic Pokémon in play\. If you have a Stage 1 or Stage 2 card that evolves from that Pokémon in your hand, put that card on the Basic Pokémon\. \(This counts as evolving that Pokémon\.\)(?: If you choose a Stage 2 Pokémon in your hand, put that Pokémon on the Basic Pokémon instead of on a Stage 1 Pokémon\.)?$/, () => [{ op: "candy", how: { skip: "any" } }]],
  [/^Put a Stage 2 Evolution card from your hand on the matching Basic Pokémon\. You can (?:only play this card|play this card only) when you would be allowed to evolve that Pokémon anyway\.$/, () => [{ op: "candy", how: { skip: "2" } }]],
  [/^Search your deck for a card that evolves from 1 of your Pokémon and put it onto that Pokémon\. \(This counts as evolving that Pokémon\.\) Shuffle your deck afterward\. You can't use this card during your first turn or on a Pokémon that was put into play this turn\.$/, () => [{ op: "evolveDeck" }]],
  [/^Search your deck for a card that evolves from 1 of your Pokémon \(excluding Pokémon-EX\) and put it onto that Pokémon\. \(This counts as evolving that Pokémon\.\) Shuffle your deck afterward\. You can use this card during your first turn or on a Pokémon that was put into play this turn\.$/, () => [{ op: "evolveDeck", how: { lift: true, noEx: true } }]],
  [/^Search your deck for a card that evolves from your Active Pokémon \(choose 1 if there are 2\) and put it on your Active Pokémon\. \(This counts as evolving that Pokémon\.\) Shuffle your deck afterward\.$/, () => [{ op: "evolveDeck", where: "active" }]],
  [/^Search your deck for a card that has no Abilities and evolves from 1 of your Pokémon, and put it onto that Pokémon to evolve it\. Then, shuffle your deck\. You can use this card on a Pokémon you put down when you were setting up to play or on a Pokémon that was put into play this turn\.$/, () => [{ op: "evolveDeck", how: { lift: true, noAbility: true } }]],
  // Tools, Special Energy and the Stadium in play, discarded.
  [/^Choose up to (\d+) Pokémon Tools? (?:cards )?attached to Pokémon(?: in play)? \(yours or your opponent's\) and discard them\.$/, (m) => [{ op: "dropInPlay", n: Number(m[1]), tools: "both" }]],
  [/^Choose up to (\d+) in any combination of Pokémon Tool cards and Stadium cards in play \(yours or your opponent's\) and discard them\.$/, (m) => [{ op: "dropInPlay", n: Number(m[1]), tools: "both", stadium: true }]],
  [/^Choose a Pokémon Tool or Special Energy card attached to a Pokémon in play \(yours or your opponent's\) and discard it\.$/, () => [{ op: "dropInPlay", n: 1, min: 1, tools: "both", special: "both" }]],
  [/^Discard a Pokémon Tool or Special Energy card from 1 of your opponent's Pokémon, or discard (?:a|any) Stadium (?:card )?in play\.$/, () => [{ op: "dropInPlay", n: 1, min: 1, tools: "foe", special: "foe", stadium: true }]],
  [/^Discard a Pokémon Tool and a Special Energy from 1 of your opponent's Pokémon\.$/, () => [{ op: "hammer", special: true, tool: true }]],
  // Cards from the hand into the deck.
  [/^Reveal a Pokémon from your hand and put it into your deck\. If you do, search your deck for a Pokémon, reveal it, and put it into your hand\. Then, shuffle your deck\.$/, () => [{ op: "stash", what: "pokemon", n: 1, need: true }, { op: "search", what: "pokemon", n: 1 }]],
  [/^(?:Reveal a Pokémon in your hand|Choose 1 Pokémon in your hand, show it to your opponent,) and put it on top of your deck\. If you do, search your deck for a Pokémon, (?:reveal it|show it to your opponent), and put it into your hand\. Shuffle your deck afterward\.$/, () => [{ op: "stash", what: "pokemon", n: 1, at: "top", need: true }, { op: "search", what: "pokemon", n: 1 }]],
  [/^Shuffle a card from your hand into your deck\. If you do, draw (\d+) cards\.$/, (m) => [{ op: "stash", n: 1, need: true }, { op: "draw", n: Number(m[1]) }]],
  [/^Shuffle (\d+) cards from your hand into your deck\. \(If you can't shuffle \d+ cards into your deck, you can't play this card\.\) Then, draw a card\.$/, (m) => [{ op: "stash", n: Number(m[1]), need: true }, { op: "draw", n: 1 }]],
  [/^Shuffle (\d+) of the other cards from your hand into your deck in order to draw a card\.$/, (m) => [{ op: "stash", n: Number(m[1]), need: true }, { op: "draw", n: 1 }]],
  [/^Choose a card from your hand and put it on top of your deck\. Search your deck for a Pokémon, show it to your opponent, and put it into your hand\. Shuffle your deck afterward\. \(If this is the only card in your hand, you can't play this card\.\)$/, () => [{ op: "stash", n: 1, at: "top", need: true }, { op: "search", what: "pokemon", n: 1 }]],
  [new RegExp(`^Draw ${N} cards?\\. Then, choose a card from your hand and put it on the bottom of your deck\\.$`), (m) => [{ op: "draw", n: count(m[1]) }, { op: "stash", n: 1, at: "bottom" }]],
  [new RegExp(`^Draw ${N} cards?\\. Then, shuffle ${N} cards? from your hand into your deck\\.$`), (m) => [{ op: "draw", n: count(m[1]) }, { op: "stash", n: count(m[2]) }]],
  // More damage this turn.
  [/^During this turn, attacks used by your Pokémon do (\d+) more damage to your opponent's Active Pokémon ex \(before applying Weakness and Resistance\)\.$/, (m) => [{ op: "boost", n: Number(m[1]), vs: ["ex"] }]],
  [/^During this turn, (?:your Pokémon's attacks|attacks used by your Pokémon) do (\d+) more damage to (?:the|your opponent's) Active Pokémon \(before applying Weakness and Resistance\)\.$/, (m) => [{ op: "boost", n: Number(m[1]) }]],
  [new RegExp(`^During this turn, (?:attacks used by your (${TYPE_WORD}) Pokémon|your (${TYPE_WORD}) Pokémon's attacks) do (\\d+) more damage to your opponent's Active Pokémon \\(before applying Weakness and Resistance\\)\\.$`), (m) => [{ op: "boost", n: Number(m[3]), who: { types: [m[1] || m[2]] } }]],
];

/** "Heal all damage". */
const ALL = 9990;
/** Steps that need a condition read, or null when it isn't. */
function when(words, build) {
  const w = condOf(words);
  return w ? build(w) : null;
}

const WHAT = [
  [/^(?:an? )?Basic Pokémon(?: cards?)?$/i, "basic"],
  [/^(?:an? )?Evolution(?: Pokémon)?(?: cards?)?$/i, "evolution"],
  [/^(?:an? )?Pokémon(?: cards?)?$/i, "pokemon"],
  [/^(?:an? )?basic Energy(?: cards?)?$/i, "basicEnergy"],
  [/^(?:an? )?Supporter(?: cards?)?$/i, "supporter"],
  [/^(?:an? )?Item(?: cards?)?$/i, "item"],
  [/^(?:an? )?Trainer(?: cards?)?$/i, "trainer"],
  [/^(?:an? |any )?cards?$/i, "any"],
  [/^(?:an? )?Energy(?: cards?)?$/, "energy"],
];
const TYPED = [
  [new RegExp(`^(?:an? |any )?[Bb]asic (${TYPE_WORD}) Energy(?: cards?)?$`), "basicEnergy"],
  [new RegExp(`^(?:an? |any )?(${TYPE_WORD}) Energy(?: cards?)?$`), "basicEnergy"],
  [new RegExp(`^(?:an? |any )?Basic (${TYPE_WORD}) Pokémon(?: cards?)?$`), "basic"],
  [new RegExp(`^(?:an? |any )?Evolution (${TYPE_WORD}) Pokémon(?: cards?)?$`), "evolution"],
  [new RegExp(`^(?:an? |any )?(${TYPE_WORD}) Pokémon(?: cards?)?$`), "pokemon"],
];
/** "A or B", "any combination of A and B": a card that fits any of them ("" when one part isn't read). */
function anyOf(parts) {
  const whats = parts.map((part) => oneWhat(part.trim()));
  return whats.every((w) => w && w !== "any") ? [...new Set(whats)].join("|") : "";
}
/** What a search names, as `fits` reads it, or "" when it names something we can't sort yet. */
export function whatOf(words) {
  // "a Basic Pokémon or Evolution card (excluding Pokémon-ex)": the exclusion is for each of them.
  const noEx = words.match(/^(.+?) \(excluding Pokémon-ex\)$/);
  if (noEx) {
    const kinds = whatOf(noEx[1]).split("|");
    return kinds.every((w) => /^(pokemon|basic|evolution)(:|$)/.test(w)) ? kinds.map((w) => `${w}!ex`).join("|") : "";
  }
  const combo = words.match(/^(?:cards )?(?:in )?any combination of (.+)$/i);
  if (combo) return anyOf(combo[1].split(/, and |, | and /));
  // "70 HP or less" is not a choice between two kinds.
  if (/ or (?!less\b)/.test(words)) return anyOf(words.split(/,? or (?!less\b)|, /));
  return oneWhat(words);
}
function oneWhat(words) {
  let suffix = "";
  let m = words.match(/^(.+?) (?:with|that each has|that has) (\d+) HP or less$/);
  if (m) [words, suffix] = [m[1], `@${m[2]}`];
  m = words.match(/^(.+?) that (?:doesn't|don't) have a Rule Box$/);
  if (m) [words, suffix] = [m[1], `!rule${suffix}`];
  const what = plainWhat(words);
  if (suffix && !/^(pokemon|basic|evolution)(:|$)/.test(what)) return "";
  return what && what + suffix;
}
function plainWhat(words) {
  const plain = WHAT.find(([pattern]) => pattern.test(words))?.[1];
  if (plain) return plain;
  if (/^(?:an? )?Pokémon Tool(?: cards?)?$/i.test(words)) return "tool";
  if (/^(?:an? )?Stadium(?: cards?)?$/i.test(words)) return "stadium";
  for (const [pattern, kind] of TYPED) {
    const m = words.match(pattern);
    if (m) return `${kind}:${m[1]}`;
  }
  return "";
}
const SHUFFLED = "(?:Then, shuffle your deck\\.|Shuffle your deck afterward\\.)";
const SEARCH = new RegExp(`^Search your deck for (?:up to ${N} )?(.+?)(?:,? (?:reveal (?:it|them)|show (?:it|them) to your opponent),?)?,? and put (?:it|them) (into your hand|onto your Bench)\\. ${SHUFFLED}$`, "i");
const RECOVER = new RegExp(`^Put (up to )?${N} (.+?) from your discard pile into your hand\\.$`, "i");
const TOP = new RegExp(`^Look at the top ${N} cards of your deck\\. You may reveal (up to ${N} |any number of )?(.+?) you find there and put (?:it|them) into your hand\\. Shuffle the other cards back into your deck\\.$`, "i");
/** "Look at the top 2 cards of your deck and put 1 of them into your hand. Discard the other card." and the like. */
const TAKE = new RegExp(`^Look at the top ${N} cards of your deck(?: and put| and put up to|\\. Choose any) ${N} (?:of them|cards you find there and put them) into your hand\\. (Discard the other cards?|Shuffle the other cards back into your deck|Shuffle the other cards and put them on the bottom of your deck)\\.$`, "i");
const TAKE_ONE = new RegExp(`^Look at the top ${N} cards of your deck, choose 1 of them, and put it into your hand\\. Put the other cards? on the bottom of your deck\\.$`, "i");
const RECYCLE = [
  new RegExp(`^Shuffle (up to )?${N} (.+?) from your discard pile (?:back )?into your deck\\.$`, "i"),
  new RegExp(`^Search your discard pile for (up to )?${N} (.+?)\\. Show them to your opponent and shuffle them into your deck\\.$`, "i"),
];
const COSTS = [
  new RegExp(`^You can (?:use|play) this card only if you discard (another card|an? other card|(?:\\d+|one|two|three|four) other cards?) from your hand\\. (.+)$`, "i"),
  new RegExp(`^Discard ${N} (?:other )?cards? from your hand\\. \\(If you can't discard \\d+ cards?, you can't play this card\\.\\) (.+)$`, "i"),
  new RegExp(`^Discard ${N} cards? from your hand\\. If you can't discard (?:\\d+|a) cards? from your hand, you can't play this card\\. (.+)$`, "i"),
  // "Discard 2 cards from your hand. If you do, ...": with fewer cards, nothing else would happen, so it is a price.
  new RegExp(`^Discard ${N} (?:other )?cards? from your hand\\. If you do, (.+)$`, "i"),
  new RegExp(`^Discard ${N} of the other cards (?:from|in) your hand in order to (.+)$`, "i"),
  new RegExp(`^Discard ${N} cards? from your hand in order to (.+)$`, "i"),
];
/** A price paid in cards of a kind: "only if you discard a Fire Energy card from your hand". */
const TYPED_COST = /^You can (?:use|play) this card only if you discard (an?|\d+) (.+?) from your hand\. (.+)$/;
/** "Attach a basic Energy card from your discard pile to 1 of your Benched Pokémon. If you do, draw 3 cards." */
const ATTACH = new RegExp(`^Attach (an?|up to (\\d+)) (.+?) from your (hand|discard pile) to (1 of your Pokémon|1 of your Benched Pokémon|your Active Pokémon|1 of your (${TYPE_WORD}) Pokémon|1 of your Benched (${TYPE_WORD}) Pokémon)\\.(?: If you do, (.+))?$`);
const upper = (words) => words[0].toUpperCase() + words.slice(1);
const benchable = (what) => what.split("|").every((w) => /^basic(?=$|[:@!])/.test(w));

/** Texts built from parts: a search, a card from the discard pile, a price to pay first, a coin flip in front. */
function compileParts(clean) {
  let m = clean.match(SEARCH);
  if (m) {
    const what = whatOf(m[2]);
    const to = /Bench/.test(m[3]) ? "bench" : "hand";
    // "an Item card and a Pokémon Tool card": one of each, a search for each.
    const each = !what && !m[1] && to === "hand" ? m[2].split(/, and |, | and /).map((w) => oneWhat(w.trim())) : [];
    if (each.length > 1 && each.every((w) => w && w !== "any")) return each.map((w) => ({ op: "search", what: w, n: 1, to }));
    if (!what || (to === "bench" && !benchable(what))) return null;
    return [{ op: "search", what, n: m[1] ? count(m[1]) : 1, to }];
  }
  m = clean.match(RECOVER);
  if (m) {
    const what = whatOf(m[3]);
    return what && what !== "any" ? [{ op: "recover", what, n: count(m[2]), upTo: Boolean(m[1]) }] : null;
  }
  for (const pattern of RECYCLE) {
    m = clean.match(pattern);
    if (!m) continue;
    const what = whatOf(m[3]);
    return what && what !== "any" ? [{ op: "recycle", what, n: count(m[2]), upTo: Boolean(m[1]) }] : null;
  }
  m = clean.match(TOP);
  if (m) {
    // "any number of Water Pokémon and Water Energy cards": either kind, as many as are there.
    const what = whatOf(m[4]) || (/^any/.test(m[2] || "") ? anyOf(m[4].split(/, and |, | and /)) : "");
    const top = count(m[1]);
    return what ? [{ op: "search", what, n: m[2] ? (/^any/.test(m[2]) ? top : count(m[3])) : 1, top }] : null;
  }
  m = clean.match(TAKE);
  if (m) {
    const [top, n] = [count(m[1]), count(m[2])];
    if (n >= top) return null;
    const upTo = /put up to/.test(clean);
    if (upTo && /^Discard/.test(m[3])) return null;
    const take = { op: "topTake", n, top, ...(upTo ? { min: 0 } : {}) };
    if (/^Discard/.test(m[3])) return [take, { op: "mill", n: top - n }];
    if (/bottom/.test(m[3])) return [take, { op: "under", n: top - n }];
    return [{ ...take, shuffle: true }];
  }
  m = clean.match(TAKE_ONE);
  if (m && count(m[1]) > 1) return [{ op: "topTake", n: 1, top: count(m[1]) }, { op: "under", n: count(m[1]) - 1 }];
  m = clean.match(ATTACH);
  if (m) {
    const what = whatOf(m[3]);
    const rest = m[8] ? compileTrainer(upper(m[8])) : [];
    if (!/^basicEnergy(:\w+)?$/.test(what) || !rest) return null;
    const to = /Active/.test(m[5]) ? "active" : /Benched/.test(m[5]) ? "bench" : "any";
    const step = { op: "attachPick", zone: m[4] === "hand" ? "hand" : "discard", what, to, whoType: m[6] || m[7] || "", n: m[2] ? Number(m[2]) : 1, ...(m[2] ? { upTo: true } : {}), ...(rest.length ? { need: true } : {}) };
    return [step, ...rest];
  }
  m = clean.match(TYPED_COST);
  if (m && !/other cards?$|^card$/.test(m[2])) {
    const what = whatOf(`${m[1]} ${m[2]}`);
    const rest = /^(basicEnergy|energy|pokemon|basic|evolution)(:|$)/.test(what) && compileTrainer(m[3]);
    return rest ? [{ op: "cost", n: count(m[1]), what }, ...rest] : null;
  }
  for (const pattern of COSTS) {
    m = clean.match(pattern);
    if (!m) continue;
    const rest = compileTrainer(upper(m[2]));
    return rest ? [{ op: "cost", n: count(m[1].replace(/ other cards?$/, "")) || 1 }, ...rest] : null;
  }
  // "You can use this card only if your opponent has 3 or fewer Prize cards remaining."
  m = clean.match(/^You can (?:use|play) this card only if (.+?)\. (.+)$/);
  if (m) {
    const when = condOf(m[1]);
    const rest = when && compileTrainer(m[2]);
    return rest ? [{ op: "only", when }, ...rest] : null;
  }
  m = clean.match(/^If you go first, you may (?:use|play) this card during your first turn\. (.+)$/);
  if (m) {
    const rest = compileTrainer(m[1]);
    return rest ? [{ op: "early" }, ...rest] : null;
  }
  m = clean.match(/^Flip a coin\. If heads, (.+)$/);
  if (m) {
    const heads = compileTrainer(m[1][0].toUpperCase() + m[1].slice(1));
    return heads ? [{ op: "flip", heads }] : null;
  }
  return null;
}

/**
 * One line of text, without the ACE SPEC rule (the deck builder keeps it from the card's
 * own subtype, js/tcg/cards.js limitsOf).
 */
export const tidy = (text) => String(text || "").replace(/\s+/g, " ").replace(/\s*ACE SPEC: You can't have more than 1 ACE SPEC card in your deck\./g, "").trim();

/** The steps of a Trainer's text, or null when it can't be read yet (or it has none). */
export function compileTrainer(text) {
  const clean = tidy(text).replace(/\s*\([^()]*have Rule Boxes\.\)/g, "").trim();
  if (!clean) return null;
  for (const [pattern, build] of PATTERNS) {
    const m = clean.match(pattern);
    if (m) return build(m);
  }
  return compileParts(clean);
}

/**
 * A Pokémon Tool stays on the Pokémon it is attached to and changes its numbers:
 *   { hp: +n, retreat: n fewer | "all", plus: n more damage to their Active Pokémon,
 *     less: n less damage taken from attacks, noWeakness }
 * or null when the text isn't read yet.
 */
const TOOLS = [
  [/^The Pokémon this card is attached to gets \+(\d+) HP\.$/, (m) => ({ hp: Number(m[1]) })],
  [/^The Retreat Cost of the Pokémon this card is attached to is ((?:Colorless)+) less\.$/, (m) => ({ retreat: m[1].length / 9 })],
  [/^The Pokémon this card is attached to has no Retreat Cost\.$/, () => ({ retreat: "all" })],
  [/^The Pokémon this card is attached to has no Weakness\.$/, () => ({ noWeakness: true })],
  [/^(?:The attacks of|Attacks used by) the Pokémon this card is attached to do (\d+) more damage to (?:your opponent's|the) Active Pokémon(?: \(before applying Weakness and Resistance\))?\.$/, (m) => ({ plus: Number(m[1]) })],
  [/^(?:Any damage done to|Damage done to) the Pokémon this card is attached to by (?:an opponent's |your opponent's )?attacks is reduced by (\d+)(?: \(after applying Weakness and Resistance\))?\.$/, (m) => ({ less: Number(m[1]) })],
  [/^The Pokémon this card is attached to takes (\d+) less damage from (?:your opponent's )?attacks(?: \(after applying Weakness and Resistance\))?\.$/, (m) => ({ less: Number(m[1]) })],
  // Only against some Active Pokémon: boostOf reads `plusVs` when the attack is made.
  [/^The attacks of the Pokémon this card is attached to do (\d+) more damage to your opponent's Active Pokémon-GX or Active Pokémon-EX \(before applying Weakness and Resistance\)\.$/, (m) => ({ plusVs: { n: Number(m[1]), vs: ["GX", "EX"] } })],
  [/^The attacks of the Pokémon this card is attached to do (\d+) more damage to your opponent's Active Pokémon V \(before applying Weakness and Resistance\)\.$/, (m) => ({ plusVs: { n: Number(m[1]), vs: ["V", "VMAX", "VSTAR"] } })],
];
export function compileTool(text) {
  const clean = tidy(text);
  for (const [pattern, build] of TOOLS) {
    const m = clean.match(pattern);
    if (m) return build(m);
  }
  return null;
}

/**
 * A Stadium stays in play for both players. What it does, or null when its text isn't read yet:
 *   { field: [{ who, mod }] }  a standing change to the Pokémon that fit `who`
 *       who: { types: [..] | null, stage: "basic" | "evolution" | null, name: "" }
 *       mod: the same numbers a Tool changes (see compileTool), plus noResistance
 *   { use: steps }             once during each player's turn, that player may do this
 */
const TYPE = "(?:Grass|Fire|Water|Lightning|Psychic|Fighting|Darkness|Metal|Fairy|Dragon|Colorless)";
const BOTH = "(?: \\((?:both yours and your opponent's|even your opponent's)\\))?";
const typesIn = (words) => words.match(new RegExp(TYPE, "g")) || [];
const STADIUMS = [
  [new RegExp(`^Each ((?:${TYPE}(?:, | and |, and )?)+) Pokémon in play${BOTH} gets \\+(\\d+) HP\\.$`), (m) => ({ who: { types: typesIn(m[1]) }, mod: { hp: Number(m[2]) } })],
  [new RegExp(`^Each Pokémon that isn't an Evolved Pokémon in play${BOTH} gets \\+(\\d+) HP\\.$`), (m) => ({ who: { stage: "basic" }, mod: { hp: Number(m[1]) } })],
  [new RegExp(`^The Retreat Cost of each Basic Pokémon (?:in|is) play${BOTH} is ((?:Colorless)+) less\\.$`), (m) => ({ who: { stage: "basic" }, mod: { retreat: m[1].length / 9 } })],
  [new RegExp(`^Each player pays ((?:Colorless)+) less to retreat (?:his or her|their) ((?:${TYPE}(?:, | and |, and )?)+) Pokémon\\.$`), (m) => ({ who: { types: typesIn(m[2]) }, mod: { retreat: m[1].length / 9 } })],
  [new RegExp(`^The Retreat Cost (?:for|of) each ((?:${TYPE}(?:, | and |, and )?)+) Pokémon(?: in play)?${BOTH} is 0\\.$`), (m) => ({ who: { types: typesIn(m[1]) }, mod: { retreat: "all" } })],
  [new RegExp(`^The Retreat Cost of each ([A-Z][\\w'.-]+) in play${BOTH} is ((?:Colorless)+) less\\.$`), (m) => ({ who: { name: m[1] }, mod: { retreat: m[2].length / 9 } })],
  [new RegExp(`^Each Pokémon in play${BOTH} has no Resistance\\.$`), () => ({ who: {}, mod: { noResistance: true } })],
  [new RegExp(`^The attacks of ((?:${TYPE} Pokémon(?:, | and |, and )?)+)${BOTH} do (\\d+) more damage to the opponent's Active Pokémon(?: \\(before applying Weakness and Resistance\\))?\\.$`), (m) => ({ who: { types: typesIn(m[1]) }, mod: { plus: Number(m[2]) } })],
  [new RegExp(`^((?:Basic ${TYPE}(?:, | and |, and )?)+) Pokémon${BOTH} take (\\d+) less damage from the opponent's attacks(?: \\(after applying Weakness and Resistance\\))?\\.$`), (m) => ({ who: { types: typesIn(m[1]), stage: "basic" }, mod: { less: Number(m[2]) } })],
];
const ONCE = /^Once during each player's turn(?: \(before attacking\))?, that player may (.+)$/;
/** "that player may search their deck..." reworded as a card you play yourself, so the same reader takes it. */
const asYours = (words) =>
  (words[0].toUpperCase() + words.slice(1))
    .replace(/that player shuffles (?:their|his or her) deck/g, "shuffle your deck")
    .replace(/that player draws/g, "draw")
    .replace(/If they do, that player searches (?:their|his or her) deck for (.+?), reveals (it|them), and puts (it|them) into/g, "If you do, search your deck for $1, reveal $2, and put $3 into")
    .replace(/\b(?:their|his or her)\b/g, "your");

export function compileStadium(text) {
  const clean = tidy(text);
  for (const [pattern, build] of STADIUMS) {
    const m = clean.match(pattern);
    if (m) return { field: [build(m)] };
  }
  const once = clean.match(ONCE);
  const use = once && compileTrainer(asYours(once[1]));
  // A Stadium is in play, not in the hand: a price in cards counts every card held.
  if (use && use.some((step) => step.op === "only" || step.op === "early" || step.when)) return null;
  return use ? { use: use.map((step) => (step.op === "cost" || step.op === "stash" ? { ...step, spare: 0 } : step)) } : null;
}

/** Does a Stadium's standing change reach this Pokémon? */
export function fieldFits(who, def) {
  // Old Darkness Energy: a Darkness Pokémon, or one with "Dark" in its name.
  if (who.dark && /^Dark /.test(def.name)) return true;
  if (who.types && !who.types.some((t) => def.types.includes(t))) return false;
  if (who.stage && def.stage !== who.stage) return false;
  if (who.name && def.name !== who.name) return false;
  // Special Energy that gives more on some Pokémon: not on these rule boxes, only on δ Pokémon.
  if (who.notBoxes && who.notBoxes.includes(def.box)) return false;
  if (who.delta && !/δ/.test(def.name)) return false;
  return true;
}

/** A card may be played when it would do something, and every price it asks can be paid. */
export function trainerReady(steps, ctx) {
  // A step marked `need` ("Switch ... If you do, ...") must be possible, like a price.
  if (steps.some((step) => (T_OPS[step.op]?.must || step.need) && !T_OPS[step.op].ready(ctx, step))) return false;
  return steps.some((step) => !T_OPS[step.op]?.must && holds(ctx, step.when) && T_OPS[step.op]?.ready(ctx, step));
}

/**
 * Run the steps in order. When one leaves a choice for the player, the rest wait on it:
 * they ride along on that choice (`then`) and the engine picks them up once it is made.
 */
export function runTrainer(steps, ctx) {
  for (let i = 0; i < steps.length; i += 1) {
    const before = ctx.state.pending.length;
    // A step with `when` happens only if that holds now ("If you do", "draw 8 cards instead").
    if (!holds(ctx, steps[i].when)) continue;
    T_OPS[steps[i].op]?.run(ctx, steps[i]);
    if (ctx.state.pending.length > before && i < steps.length - 1) {
      const waiting = ctx.state.pending[ctx.state.pending.length - 1];
      waiting.then = steps.slice(i + 1);
      if (ctx.spot != null) waiting.from = ctx.spot;
      if (ctx.src) waiting.src = ctx.src;
      if (waiting.player !== ctx.player) waiting.by = ctx.player;
      return;
    }
  }
}

/** For the bot and the screen: what a Trainer is for, by its first step that matters. */
export function trainerAim(steps) {
  const ops = steps.flatMap((s) => (s.op === "flip" ? s.heads : [s])).map((s) => s.op);
  if (ops.includes("attachPick")) return "energize";
  for (const own of ["energize", "fetchEnergy", "counters", "condition", "moveCounters", "switchSelf"]) if (ops.includes(own)) return own === "fetchEnergy" ? "energize" : own === "moveCounters" || own === "condition" ? "counters" : own;
  if (ops.includes("formChange")) return "form";
  // Rare Candy: the bot needs to know it (a Stage 2 in hand on a Basic in play, always worth it once it is ready).
  if (ops.includes("candy")) return "evolve";
  // Evolving from the deck is a search the bot already plays: it takes the card that evolves and puts it on.
  if (ops.includes("evolveDeck")) return "search";
  // Discarding Tools or the Stadium (yours too): the bot leaves these alone until it can tell whose to hit.
  if (ops.includes("dropInPlay")) return "tools";
  // Cards from the hand back into the deck: the bot would put back its best card, so it leaves these alone.
  if (ops.includes("stash")) return "stash";
  // Putting your own Pokémon back in your hand, or the other player's hand away: the bot leaves these alone.
  if (ops.includes("moveEnergy") || ops.includes("gather") || ops.includes("bounce") || ops.includes("foeShuffle") || steps.some((s) => s.op === "handBottom" && s.who === "foe")) return "move";
  // More damage this turn: it is about hurting their Pokémon, and needs an attack to follow.
  if (ops.includes("boost")) return "counters";
  if (ops.includes("topTake")) return "search";
  if (ops.includes("recycle")) return "recover";
  if (ops.includes("handBottom")) return "refresh";
  if (ops.includes("foeSwitch")) return "gust";
  if (ops.includes("cost")) return "trade";
  if (ops.includes("search")) return "search";
  if (ops.includes("recover")) return "recover";
  // The bot reads a heal's amount off a step in plain sight; one behind a coin flip counts by what else it does.
  if (ops.includes("heal") && steps.some((s) => s.op === "heal")) return "heal";
  if (ops.includes("heal")) return steps.some((s) => s.heads?.some((h) => h.cure)) ? "cure" : "move";
  if (ops.includes("cure")) return "cure";
  if (ops.includes("gust")) return "gust";
  if (ops.includes("switch")) return "switch";
  if (ops.includes("hammer")) return "hammer";
  if (ops.includes("discardHand") || ops.includes("shuffleHand")) return "refresh";
  return "draw";
}
