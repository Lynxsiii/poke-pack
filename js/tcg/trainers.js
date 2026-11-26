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

import { askChoose, askPick, conditionsOn, defOf, flip, inPlay, other, shuffle } from "./engine.js";

const WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };
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
const benchSpots = (side) => side.bench.map((_, i) => i);
const withEnergy = (ctx) => inPlay(ctx.state, other(ctx.player)).filter(([slot]) => slot.energy.length).map(([, spot]) => spot);

/** Does a card fit what a search asks for? */
export function fits(def, what) {
  if (!def) return false;
  if (what === "any") return true;
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
  /** Cards come back from the discard pile to the hand. */
  recover: {
    ready: (ctx, { what }) => fitting(ctx, mine(ctx).discard, what).length > 0,
    run(ctx, { what, n = 1, upTo = false }) {
      const uids = fitting(ctx, mine(ctx).discard, what);
      if (uids.length) askChoose(ctx.state, { player: ctx.player, zone: "discard", what, uids, min: upTo ? 0 : Math.min(n, uids.length), max: n, effect: { op: "toHand" } });
    },
  },
  /** The price of playing the card: n other cards from the hand go to the discard pile. */
  cost: {
    must: true,
    // While the card is still in the hand it counts itself, so "other cards" is one fewer.
    ready: (ctx, { n }) => mine(ctx).hand.length - 1 >= n,
    run(ctx, { n }) {
      const uids = mine(ctx).hand.slice();
      askChoose(ctx.state, { player: ctx.player, zone: "hand", what: "any", uids, min: Math.min(n, uids.length), max: n, effect: { op: "discard" } });
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
  heal: {
    ready: (ctx) => hurt(ctx).length > 0,
    run(ctx, { n }) {
      const spots = hurt(ctx);
      if (spots.length) askPick(ctx.state, { player: ctx.player, side: ctx.player, spots, left: 1, effect: { op: "heal", n } });
    },
  },
  /** Your Active Pokémon and one from your Bench trade places. */
  switch: {
    ready: (ctx) => Boolean(mine(ctx).active) && mine(ctx).bench.length > 0,
    run: (ctx) => askPick(ctx.state, { player: ctx.player, side: ctx.player, spots: benchSpots(mine(ctx)), left: 1, effect: { op: "switch" } }),
  },
  /** One of their Benched Pokémon is pulled into the Active Spot: you choose which. */
  gust: {
    ready: (ctx) => Boolean(theirs(ctx).active) && theirs(ctx).bench.length > 0,
    run: (ctx) => askPick(ctx.state, { player: ctx.player, side: other(ctx.player), spots: benchSpots(theirs(ctx)), left: 1, effect: { op: "switch" } }),
  },
  /** Discard an Energy from one of their Pokémon. */
  hammer: {
    ready: (ctx) => withEnergy(ctx).length > 0,
    run(ctx, { n = 1 }) {
      const spots = withEnergy(ctx);
      if (spots.length) askPick(ctx.state, { player: ctx.player, side: other(ctx.player), spots, left: 1, effect: { op: "discardEnergy", n } });
    },
  },
  /** Your Active Pokémon shakes off every Special Condition. */
  cure: {
    ready: (ctx) => conditionsOn(mine(ctx).active).length > 0,
    run(ctx) {
      const slot = mine(ctx).active;
      for (const kind of conditionsOn(slot)) ctx.events.push({ t: "cure", p: ctx.player, kind });
      if (slot) delete slot.status;
    },
  },
};

const N = "(\\d+|an?|one|two|three|four|five|six|seven|eight)";
const SHUFFLE_BOTH = "Each player shuffles (?:their|his or her) hand into (?:their|his or her) deck";

/** [wording, steps]. */
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
];

const WHAT = [
  [/^(?:an? )?Basic Pokémon(?: cards?)?$/i, "basic"],
  [/^(?:an? )?Evolution(?: Pokémon)?(?: cards?)?$/i, "evolution"],
  [/^(?:an? )?Pokémon(?: cards?)?$/i, "pokemon"],
  [/^(?:an? )?basic Energy(?: cards?)?$/i, "basicEnergy"],
  [/^(?:an? )?Supporter(?: cards?)?$/i, "supporter"],
  [/^(?:an? )?Item(?: cards?)?$/i, "item"],
  [/^(?:an? )?Trainer(?: cards?)?$/i, "trainer"],
  [/^(?:an? )?cards?$/i, "any"],
];
const whatOf = (words) => WHAT.find(([pattern]) => pattern.test(words))?.[1] || "";
const SHUFFLED = "(?:Then, shuffle your deck\\.|Shuffle your deck afterward\\.)";
const SEARCH = new RegExp(`^Search your deck for (?:up to ${N} )?(.+?)(?:,? (?:reveal (?:it|them)|show (?:it|them) to your opponent),?)?,? and put (?:it|them) (into your hand|onto your Bench)\\. ${SHUFFLED}$`, "i");
const RECOVER = new RegExp(`^Put (up to )?${N} (.+?) from your discard pile into your hand\\.$`, "i");
const TOP = new RegExp(`^Look at the top ${N} cards of your deck\\. You may reveal (.+?) you find there and put it into your hand\\. Shuffle the other cards back into your deck\\.$`, "i");
const COSTS = [
  new RegExp(`^You can use this card only if you discard ${N} other cards? from your hand\\. (.+)$`, "i"),
  new RegExp(`^Discard ${N} (?:other )?cards? from your hand\\. \\(If you can't discard \\d+ cards?, you can't play this card\\.\\) (.+)$`, "i"),
];

/** Texts built from parts: a search, a card from the discard pile, a price to pay first, a coin flip in front. */
function compileParts(clean) {
  let m = clean.match(SEARCH);
  if (m) {
    const what = whatOf(m[2]);
    const to = /Bench/.test(m[3]) ? "bench" : "hand";
    if (!what || (to === "bench" && what !== "basic")) return null;
    return [{ op: "search", what, n: m[1] ? count(m[1]) : 1, to }];
  }
  m = clean.match(RECOVER);
  if (m) {
    const what = whatOf(m[3]);
    return what && what !== "any" ? [{ op: "recover", what, n: count(m[2]), upTo: Boolean(m[1]) }] : null;
  }
  m = clean.match(TOP);
  if (m) {
    const what = whatOf(m[2]);
    return what ? [{ op: "search", what, n: 1, top: count(m[1]) }] : null;
  }
  for (const pattern of COSTS) {
    m = clean.match(pattern);
    if (!m) continue;
    const rest = compileParts(m[2]);
    return rest ? [{ op: "cost", n: count(m[1]) }, ...rest] : null;
  }
  m = clean.match(/^Flip a coin\. If heads, (.+)$/);
  if (m) {
    const heads = compileParts(m[1][0].toUpperCase() + m[1].slice(1));
    return heads ? [{ op: "flip", heads }] : null;
  }
  return null;
}

/** The steps of a Trainer's text, or null when it can't be read yet (or it has none). */
export function compileTrainer(text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
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
];
export function compileTool(text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  for (const [pattern, build] of TOOLS) {
    const m = clean.match(pattern);
    if (m) return build(m);
  }
  return null;
}

/** A card may be played when it would do something, and every price it asks can be paid. */
export function trainerReady(steps, ctx) {
  if (steps.some((step) => T_OPS[step.op]?.must && !T_OPS[step.op].ready(ctx, step))) return false;
  return steps.some((step) => !T_OPS[step.op]?.must && T_OPS[step.op]?.ready(ctx, step));
}

/**
 * Run the steps in order. When one leaves a choice for the player, the rest wait on it:
 * they ride along on that choice (`then`) and the engine picks them up once it is made.
 */
export function runTrainer(steps, ctx) {
  for (let i = 0; i < steps.length; i += 1) {
    const before = ctx.state.pending.length;
    T_OPS[steps[i].op]?.run(ctx, steps[i]);
    if (ctx.state.pending.length > before && i < steps.length - 1) {
      ctx.state.pending[ctx.state.pending.length - 1].then = steps.slice(i + 1);
      return;
    }
  }
}

/** For the bot and the screen: what a Trainer is for, by its first step that matters. */
export function trainerAim(steps) {
  const ops = steps.flatMap((s) => (s.op === "flip" ? s.heads : [s])).map((s) => s.op);
  if (ops.includes("search")) return ops.includes("cost") ? "trade" : "search";
  if (ops.includes("recover")) return "recover";
  if (ops.includes("heal")) return "heal";
  if (ops.includes("cure")) return "cure";
  if (ops.includes("gust")) return "gust";
  if (ops.includes("switch")) return "switch";
  if (ops.includes("hammer")) return "hammer";
  if (ops.includes("discardHand") || ops.includes("shuffleHand")) return "refresh";
  return "draw";
}
