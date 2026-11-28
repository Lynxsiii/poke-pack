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

import { ACTIVE, abilityOn, noteShed, addCondition, takeTools, toolOn, toolGone, toolRoom, toolsIn, trainerBlock, win, askChoose, askPick, conditionsOn, damageAfterTyping, defOf, energyOf, evolveSpots, flip, healMore, healRoom, heldOn, hpLeft, inPlay, mayEvolve, other, rand, shedEnergy, shuffle, slotAt, switchActive, toolOf, warded } from "./engine.js";
import { runFx } from "./effects.js";

export const RPS = ["Rock", "Paper", "Scissors"];
const WORDS = { a: 1, an: 1, another: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };
const count = (word) => WORDS[String(word).toLowerCase()] || Number(word) || 0;

function draw(ctx, p, n) {
  const side = ctx.state.players[p];
  const drawn = side.deck.splice(0, n);
  if (!drawn.length) return;
  side.hand.push(...drawn);
  ctx.events.push({ t: "draw", p, uids: drawn });
}

/** Looker: cards drawn from the bottom of the deck. */
function drawBottom(ctx, n) {
  const side = mine(ctx);
  const drawn = side.deck.splice(Math.max(0, side.deck.length - n), n);
  if (!drawn.length) return;
  side.hand.push(...drawn);
  ctx.events.push({ t: "draw", p: ctx.player, uids: drawn });
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
/** 1 while a Trainer is still in the hand (asked before it is played), 0 once it is played, or for an Ability or a Stadium. */
const held = (ctx) => (ctx.src === "trainer" && !ctx.uid ? 1 : 0);
const hurt = (ctx) => inPlay(ctx.state, ctx.player).filter(([slot]) => slot.damage > 0).map(([, spot]) => spot);
const healSpots = (ctx, to, whoType = "") => hurt(ctx).filter((spot) => (!to || to === "all" || (to === "active" ? spot === ACTIVE : to === "bench" ? spot !== ACTIVE : spot === ctx.spot)) && (!whoType || defOf(ctx.state, slotAt(ctx.state, ctx.player, spot).uid, ctx.defs).types.includes(whoType)));
const energyFor = (ctx, { zone, type }) => mine(ctx)[zone].filter((uid) => {
  const def = defOf(ctx.state, uid, ctx.defs);
  return def.kind === "energy" && def.basic && (!type || def.provides.includes(type));
});
/** `who` (as fits reads it) narrows it further: "basic!rule", "stage2:Fire|stage2:Water". */
// `boxes`: only Pokémon with these rule boxes ("to your Pokémon V in any way you like").
const energySpots = (ctx, { to, whoType, who = "", boxes = null }) =>
  inPlay(ctx.state, ctx.player)
    .filter(([slot, spot]) => (to === "self" ? spot === ctx.spot : to === "active" ? spot === ACTIVE : to === "bench" ? spot !== ACTIVE : true) && (!whoType || defOf(ctx.state, slot.uid, ctx.defs).types.includes(whoType)) && (!who || fits(defOf(ctx.state, slot.uid, ctx.defs), who)) && (!boxes || boxes.includes(defOf(ctx.state, slot.uid, ctx.defs).box)))
    .map(([, spot]) => spot);
/** Their Pokémon this card may touch: not one whose Ability keeps off this kind of card (see `warded`). */
const open = (ctx) => inPlay(ctx.state, other(ctx.player)).filter(([slot]) => !warded(ctx.state, slot, ctx, ctx.defs));
const counterSpots = (ctx, where) => open(ctx).map(([, spot]) => spot).filter((spot) => (where === "bench" ? spot !== ACTIVE : where === "active" ? spot === ACTIVE : true));
const gustSpots = (ctx, stage = "", hpMax = 0) => open(ctx).filter(([slot, spot]) => spot !== ACTIVE && (!stage || defOf(ctx.state, slot.uid, ctx.defs).stage === stage) && (!hpMax || hpLeft(ctx.state, slot, ctx.defs) <= hpMax)).map(([, spot]) => spot);
const frontOpen = (ctx) => Boolean(theirs(ctx).active) && !warded(ctx.state, theirs(ctx).active, ctx, ctx.defs);
/** After an attack's damage: their Active Pokémon it Knocked Out isn't switched about, it is gone once the attack is over. */
const frontDown = (ctx) => ctx.src === "attack" && Boolean(theirs(ctx).active) && hpLeft(ctx.state, theirs(ctx).active, ctx.defs) <= 0;
/** Where an Energy moved off `from` may go. */
export const moveTargets = (ctx, { to = "any" }, from) =>
  inPlay(ctx.state, ctx.player)
    .map(([, spot]) => spot)
    .filter((spot) => spot !== from && (to === "self" ? spot === ctx.spot : to === "active" ? spot === ACTIVE : to === "bench" ? spot !== ACTIVE : true));
const benchSpots = (side) => side.bench.map((_, i) => i);
const switchSpots = (ctx, who = "") => benchSpots(mine(ctx)).filter((i) => !who || fits(defOf(ctx.state, mine(ctx).bench[i].uid, ctx.defs), who));
/** Your Pokémon (as spots) that hold an Energy of this type ("" for any), and the uid of the last such card. */
export const energyCards = (ctx, slot, type, basic = false) => slot.energy.filter((uid) => {
  const def = defOf(ctx.state, uid, ctx.defs);
  return (!type || (def.provides || []).includes(type)) && (!basic || def.basic);
});
export const energyIn = (ctx, slot, type, basic = false) => energyCards(ctx, slot, type, basic).pop();
const movable = (ctx, { type = "", from = "any", basic = false }) =>
  inPlay(ctx.state, ctx.player)
    .filter(([slot, spot]) => (from === "self" ? spot === ctx.spot : from === "others" ? spot !== ctx.spot : from === "bench" ? spot !== ACTIVE : from === "active" ? spot === ACTIVE : true) && energyIn(ctx, slot, type, basic))
    .map(([, spot]) => spot);
/** Your other Pokémon holding Energy of this type, that could give it to the one at `to`. */
const givers = (ctx, type, to) => inPlay(ctx.state, ctx.player).filter(([slot, spot]) => spot !== to && energyIn(ctx, slot, type)).map(([, spot]) => spot);
const isSpecial = (ctx, uid) => {
  const def = defOf(ctx.state, uid, ctx.defs);
  return def.kind === "energy" && !def.basic;
};
/** For the Stadiums' steps: your hurt Pokémon of these types, your Pokémon of a type, your Pokémon that fit `who`. */
const typedHurt = (ctx, types) => hurt(ctx).filter((spot) => !types || defOf(ctx.state, slotAt(ctx.state, ctx.player, spot).uid, ctx.defs).types.some((t) => types.includes(t)));
const typedIn = (ctx, type) => inPlay(ctx.state, ctx.player).filter(([slot]) => defOf(ctx.state, slot.uid, ctx.defs).types.includes(type)).length;
const whoSpots = (ctx, who) => inPlay(ctx.state, ctx.player).filter(([slot]) => fieldFits(who, defOf(ctx.state, slot.uid, ctx.defs))).map(([, spot]) => spot);
const namedEnergy = (ctx, who) => whoSpots(ctx, who).flatMap((spot) => slotAt(ctx.state, ctx.player, spot).energy.filter((uid) => defOf(ctx.state, uid, ctx.defs).basic));
const byNames = (ctx, names) => mine(ctx).hand.filter((uid) => defOf(ctx.state, uid, ctx.defs).kind === "pokemon" && names.includes(defOf(ctx.state, uid, ctx.defs).name));
const withEnergy = (ctx, special = false, tool = false) => open(ctx).filter(([slot]) => (tool && slot.tool) || (special ? slot.energy.some((uid) => isSpecial(ctx, uid)) : slot.energy.length)).map(([, spot]) => spot);
/** Cards from your hand that would evolve one of your Pokémon the way `how` says (Rare Candy). */
const candyCards = (ctx, how) => mine(ctx).hand.filter((uid) => evolveSpots(ctx.state, ctx.player, defOf(ctx.state, uid, ctx.defs), ctx.defs, how).length > 0);
/** Cards in play a card may discard: Tools, Special Energy (yours too when `mine` is "both"), the Stadium. */
function inPlayCards(ctx, { tools = "", special = "", stadium = false }) {
  const out = [];
  const sides = (who) => (who === "both" ? [...inPlay(ctx.state, ctx.player), ...open(ctx)] : who === "foe" ? open(ctx) : []);
  for (const [slot] of sides(tools)) out.push(...toolsIn(slot));
  for (const [slot] of sides(special)) out.push(...slot.energy.filter((uid) => isSpecial(ctx, uid)));
  if (stadium && ctx.state.stadium) out.push(ctx.state.stadium.uid);
  return out;
}
/** Cards in your hand a step may put into your deck: one fewer while the card itself is still there. */
const stashable = (ctx, { what = "any", spare = ctx.spot != null ? 0 : 1 }) => fitting(ctx, mine(ctx).hand, what).length - (what === "any" ? spare : 0);
/** Your Pokémon that are hurt or have a Special Condition. */
const careSpots = (ctx) => inPlay(ctx.state, ctx.player).filter(([slot]) => slot.damage > 0 || conditionsOn(slot).length).map(([, spot]) => spot);
/** Every Energy on one of your Pokémon goes to the discard pile (or, `toHand`, back to the hand). */
export function stripEnergy(ctx, p, spot, toHand = false) {
  const slot = slotAt(ctx.state, p, spot);
  const gone = slot ? slot.energy.splice(0) : [];
  if (!gone.length) return;
  ctx.state.players[p][toHand ? "hand" : "discard"].push(...gone);
  if (!toHand) noteShed(ctx.state, p, spot, gone);
  ctx.events.push({ t: toHand ? "energy-to-hand" : "discard-energy", p, spot, uids: gone });
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
  // "a&&b": both ("Basic" and "named Duskull", for what goes onto the Bench).
  if (what.includes("&&")) return what.split("&&").every((one) => fits(def, one));
  // Old wordings name cards by what they print: "with Dark in its name" (~Dark), a subtype (+Team Plasma),
  // "excluding Pokémon LV.X" (%Level-Up), "a Retreat Cost of 3 or more" (#r3), "except Trainers' Mail" (!=Trainers' Mail),
  // "evolves from a Fossil" (<Fossil).
  let m = what.match(/^(.*?)~([^~]+)$/);
  if (m) return def.name.includes(m[2]) && fits(def, m[1] || "any");
  m = what.match(/^(.*?)\+([^+]+)$/);
  if (m) return (def.tags || []).includes(m[2]) && fits(def, m[1] || "any");
  m = what.match(/^(.*?)%([^%]+)$/);
  if (m) return !(def.tags || []).includes(m[2]) && fits(def, m[1]);
  m = what.match(/^(.*?)#r(\d+)$/);
  if (m) return def.kind === "pokemon" && def.retreat >= Number(m[2]) && fits(def, m[1]);
  m = what.match(/^(.*?)!=(.+)$/);
  if (m) return def.name !== m[2] && fits(def, m[1]);
  m = what.match(/^(.*?)<(.+)$/);
  if (m) return def.kind === "pokemon" && (def.evolvesFrom || "").includes(m[2]) && fits(def, m[1] || "pokemon");
  if (what === "stage1" || what === "stage2") return def.kind === "pokemon" && def.line === Number(what.slice(5));
  if (what === "mega") return def.kind === "pokemon" && def.box === "ex" && /^Mega /.test(def.name);
  const cap = what.match(/@(\d+)$/);
  if (cap) return def.kind === "pokemon" && def.hp <= Number(cap[1]) && fits(def, what.slice(0, cap.index));
  if (what.endsWith("!rule")) return def.kind === "pokemon" && !def.rule && fits(def, what.slice(0, -5));
  if (what.endsWith("!ex")) return def.kind === "pokemon" && def.box !== "ex" && fits(def, what.slice(0, -3));
  if (what.endsWith("!gx")) return def.kind === "pokemon" && def.box !== "GX" && fits(def, what.slice(0, -3));
  if (what.startsWith("name=")) return def.kind === "pokemon" && def.name === what.slice(5);
  // A card of any kind by its name ("an Ethan's Adventure card", "Spiky Energy cards"); "not:" what doesn't fit.
  if (what.startsWith("card=")) return def.name === what.slice(5);
  if (what.startsWith("not:")) return !fits(def, what.slice(4));
  // A rule box ("Pokémon ex", "Pokémon V"), and Special Energy cards.
  if (what.startsWith("box=")) return def.kind === "pokemon" && def.box === what.slice(4);
  if (what === "specialEnergy") return def.kind === "energy" && !def.basic;
  if (what === "tera") return def.kind === "pokemon" && Boolean(def.tera);
  if (what.startsWith("trainer=")) return def.kind === "trainer" && def.name === what.slice(8);
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
   * empty: the deck is hidden, so "none" is always allowed). `to`: "hand", "bench" or "top" (shuffled, then on top).
   * `top`/`bottom`: only that many cards from the top or the bottom are looked at ("prizes": as many as the Prize cards left).
   * `rule`: what the cards taken together must keep (see chooseBlock); `rest: "bottom"`: the others go to the bottom.
   */
  search: {
    ready: (ctx, { to = "hand" }) => hasDeck(ctx) && (to !== "bench" || mine(ctx).bench.length < ctx.state.rules.bench),
    run(ctx, { what, n = 1, to = "hand", top = 0, bottom = 0, rule = null, rest = "", skipTop = 0, asBasic = false }) {
      const side = mine(ctx);
      const look = top === "prizes" ? side.prizes.length + theirs(ctx).prizes.length : top;
      const pool = look ? side.deck.slice(0, look) : bottom ? side.deck.slice(-bottom) : side.deck.slice(skipTop);
      const room = to === "bench" ? ctx.state.rules.bench - side.bench.length : Infinity;
      const many = n === "all" ? pool.length : n;
      askChoose(ctx.state, { player: ctx.player, zone: "deck", what, uids: fitting(ctx, pool, what), min: 0, max: Math.min(many, room), effect: { op: to === "bench" ? "toBench" : to === "top" ? "deckTop" : "toHand", ...(asBasic ? { asBasic } : {}) }, ...(rule ? { rule } : {}), ...(rest ? { restBottom: look } : { shuffle: true }) });
    },
  },
  /** Cards come back from the discard pile to the hand (or, `to: "bench"`, Basic Pokémon onto the Bench). */
  /**
   * Cards come back from the discard pile to the hand (or, `to: "bench"`, Basic Pokémon onto the Bench; `to: "top"`, on top
   * of the deck). `paid`: cards just discarded to pay for this card, which it can't take back. `half`: Revive's damage.
   */
  recover: {
    ready: (ctx, { what, to = "hand" }) => fitting(ctx, mine(ctx).discard, what).some((uid) => uid !== ctx.uid) && (to !== "bench" || mine(ctx).bench.length < ctx.state.rules.bench),
    run(ctx, { what, n = 1, upTo = false, to = "hand", paid = [], half = false }) {
      // Not the card being played: it only reaches the discard pile once it is done.
      const uids = fitting(ctx, mine(ctx).discard, what).filter((uid) => !paid.includes(uid) && uid !== ctx.uid);
      const max = to === "bench" ? Math.min(n, ctx.state.rules.bench - mine(ctx).bench.length) : n;
      if (uids.length && max > 0) askChoose(ctx.state, { player: ctx.player, zone: "discard", what, uids, min: upTo ? 0 : Math.min(max, uids.length), max, effect: { op: to === "bench" ? "toBench" : to === "top" ? "fromDiscardTop" : "toHand", ...(half ? { half } : {}) } });
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
    // `pass`: the next step learns which cards went (to leave them, or to draw more for some of them).
    ready: (ctx, { n, what = "any", spare = ctx.spot != null ? 0 : 1 }) => fitting(ctx, mine(ctx).hand, what).length - (what === "any" ? spare : 0) >= n,
    run(ctx, { n, what = "any", pass = false }) {
      const uids = fitting(ctx, mine(ctx).hand, what);
      askChoose(ctx.state, { player: ctx.player, zone: "hand", what, uids, min: Math.min(n, uids.length), max: n, effect: { op: "discard" }, ...(pass ? { pass } : {}) });
    },
  },
  /** `bottom`: from the bottom of the deck (Looker). */
  draw: {
    ready: hasDeck,
    run: (ctx, { n, bottom = false }) => (bottom ? drawBottom(ctx, n) : draw(ctx, ctx.player, n)),
  },
  /** Draw until the hand holds n cards. */
  drawTo: {
    ready: (ctx, { n }) => hasDeck(ctx) && mine(ctx).hand.length - held(ctx) < n,
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
    // Either side of the coin may be what the card does ("If heads ... If tails ..."); a price or a marker isn't.
    ready: (ctx, { heads = [], tails = [] }) => [...heads, ...tails].some((step) => !T_OPS[step.op].must && holds(ctx, step.when) && T_OPS[step.op].ready(ctx, step)),
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
    ready: (ctx, step) => healable(ctx, step).length > 0,
    run(ctx, step) {
      const { n, to = "", cure = false, strip = false } = step;
      const spots = healable(ctx, step);
      // An Ability may name who is healed (itself, the Active Pokémon, all of them): no choice then.
      if (to) {
        for (const spot of spots) {
          const slot = slotAt(ctx.state, ctx.player, spot);
          const healed = Math.min(healMore(ctx.state, n), healRoom(ctx.state, slot));
          slot.damage -= healed;
          if (healed) slot.healedOn = ctx.state.turn;
          ctx.events.push({ t: "heal", p: ctx.player, spot, n: healed });
          // "If you healed any damage in this way, discard all Energy from that Pokémon."
          if (strip && healed) stripEnergy(ctx, ctx.player, spot, strip === "hand");
        }
        return;
      }
      const more = Object.fromEntries(["flips", "per", "night", "pay", "ifHealed"].filter((k) => step[k]).map((k) => [k, step[k]]));
      if (spots.length) askPick(ctx.state, { player: ctx.player, side: ctx.player, spots, left: 1, effect: { op: "heal", n, ...(cure ? { cure } : {}), ...(strip ? { strip } : {}), ...more } });
    },
  },
  /** Your Active Pokémon and one from your Bench trade places. */
  /** `chooser: "foe"`: the other player chooses which of yours comes in (Double Gust). */
  /** `who`: only an Active Pokémon that fits, with a Benched one that fits ("your Active Team Rocket's Pokémon"). */
  // `benchWho`: only the Benched Pokémon must fit ("switch 1 of your Benched Darkness Pokémon with your Active Pokémon").
  switch: {
    ready: (ctx, { who = "", benchWho = "" } = {}) => Boolean(mine(ctx).active) && (!who || fits(defOf(ctx.state, mine(ctx).active.uid, ctx.defs), who)) && switchSpots(ctx, who || benchWho).length > 0,
    run(ctx, { chooser = "", who = "", benchWho = "" } = {}) {
      // After "if you do" or "if any", there may be nothing to switch with.
      if (mine(ctx).active && switchSpots(ctx, who || benchWho).length) askPick(ctx.state, { player: chooser === "foe" ? other(ctx.player) : ctx.player, side: ctx.player, spots: switchSpots(ctx, who || benchWho), left: 1, effect: { op: "switch" } });
    },
  },
  /** One of their Benched Pokémon is pulled into the Active Spot: you choose which. */
  gust: {
    // `hpMax`: "1 of your opponent's Benched Pokémon that has 90 HP or less remaining".
    ready: (ctx, { stage = "", hpMax = 0 } = {}) => Boolean(theirs(ctx).active) && gustSpots(ctx, stage, hpMax).length > 0,
    run(ctx, { stage = "", hpMax = 0 } = {}) {
      if (!frontDown(ctx) && gustSpots(ctx, stage, hpMax).length) askPick(ctx.state, { player: ctx.player, side: other(ctx.player), spots: gustSpots(ctx, stage, hpMax), left: 1, effect: { op: "switch" } });
    },
  },
  /** Discard an Energy from one of their Pokémon. `special`: a Special Energy only; `each`: one from each of them, no choice. */
  hammer: {
    // `active`: from their Active Pokémon only.
    ready: (ctx, { special = false, tool = false, active = false }) => withEnergy(ctx, special, tool).filter((spot) => !active || spot === ACTIVE).length > 0,
    run(ctx, { n = 1, special = false, each = false, toHand = false, tool = false, active = false }) {
      const spots = withEnergy(ctx, special, tool).filter((spot) => !active || spot === ACTIVE);
      if (each) {
        // One from each: which one on each, when they differ, is the card's player's choice.
        for (const spot of spots) shedEnergy(ctx.state, ctx.player, other(ctx.player), spot, slotAt(ctx.state, other(ctx.player), spot).energy.filter((e) => isSpecial(ctx, e)), 1, ctx.events, ctx.defs);
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
      if (uids.length && spots.length) askChoose(ctx.state, { player: ctx.player, zone: step.zone, what: step.what, uids, min: step.upTo ? 0 : step.exact ? step.n : 1, max: step.n || 1, effect: { op: "attach", to: step.spread ? "spread" : "one", spots, need: true, ...(step.heal ? { heal: step.heal, ...(step.each ? { each: true } : {}) } : {}) }, ...(step.rule ? { rule: step.rule } : {}) });
    },
  },
  /**
   * "For each of your Benched Pokémon, search your deck for a Basic Psychic Energy card and attach it to that Pokémon",
   * "Choose up to 2 of your Benched Pokémon and attach an Energy card from your discard pile to each of them": one card
   * each, from `zone`, for up to `n` of the Pokémon `where` names (0: each of them). `must`: as many as can be.
   */
  energyEach: {
    ready: (ctx, step) => (step.zone === "deck" ? hasDeck(ctx) : fitting(ctx, mine(ctx)[step.zone], step.what).length > 0) && energySpots(ctx, step.where).length > 0,
    run(ctx, { zone, what, where, n = 0, must = false, poison = false }) {
      const spots = energySpots(ctx, where);
      const uids = fitting(ctx, mine(ctx)[zone], what);
      const max = Math.min(n || spots.length, spots.length);
      // `poison`: "If you attached Energy to your Active Pokémon in this way, it is now Poisoned."
      if (spots.length && (uids.length || zone === "deck")) askChoose(ctx.state, { player: ctx.player, zone, what, uids, min: must ? Math.min(max, uids.length) : 0, max, effect: { op: "attach", to: "each", spots, ...(poison ? { poison } : {}) }, ...(zone === "deck" ? { shuffle: true } : {}) });
    },
  },
  /** Evosoda, Wally: a card from the deck evolves one of your Pokémon (`where` "active": the Active one). */
  // `self`: the card's own Pokémon only; `what`: only these cards (Pidove's "an Unfezant or Unfezant ex").
  evolveDeck: {
    ready: (ctx, { how = {}, where = "", self = false }) => hasDeck(ctx) && inPlay(ctx.state, ctx.player).some(([slot, spot]) => (where !== "active" || spot === ACTIVE) && (!self || spot === ctx.spot) && mayEvolve(ctx.state, slot, ctx.defs, how)),
    run(ctx, { how = {}, where = "", self = false, what = "" }) {
      const at = self ? ctx.spot : null;
      const uids = mine(ctx).deck.filter((uid) => (!what || fits(defOf(ctx.state, uid, ctx.defs), what)) && evolveSpots(ctx.state, ctx.player, defOf(ctx.state, uid, ctx.defs), ctx.defs, how, where).some((s) => at == null || s === at));
      askChoose(ctx.state, { player: ctx.player, zone: "deck", what: "evolution", uids, min: 0, max: 1, effect: { op: "evolveFrom", how, ...(where ? { where } : {}), ...(at != null ? { at } : {}) }, shuffle: true });
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
    ready: (ctx, step) => !step.need || stashable(ctx, step) >= (step.n === "all" ? 1 : step.n || 1),
    // `upTo`: as many as the player likes (Caitlin), `pass`: the next step counts them.
    run(ctx, { n = 1, what = "any", at = "into", upTo = false, pass = false }) {
      const uids = fitting(ctx, mine(ctx).hand, what);
      const max = n === "all" ? uids.length : n;
      if (uids.length) askChoose(ctx.state, { player: ctx.player, zone: "hand", what, uids, min: upTo ? 0 : Math.min(max, uids.length), max, effect: { op: at === "top" ? "toTop" : "toBottom" }, ...(at === "into" ? { shuffle: true } : {}), ...(pass ? { pass } : {}) });
    },
  },
  /** This Pokémon, on the Bench, trades places with the Active one. */
  switchSelf: {
    ready: (ctx) => ctx.spot != null && ctx.spot !== ACTIVE && Boolean(mine(ctx).active),
    run(ctx) {
      switchActive(ctx.state, ctx.player, ctx.spot, ctx.events, ctx.defs);
      // What follows ("If you do, move Energy to this Pokémon") finds it in the Active Spot.
      ctx.spot = ACTIVE;
    },
  },
  /** Damage counters on one of their Pokémon, your choice (not an attack: no Weakness, no Resistance). */
  counters: {
    ready: (ctx, { where = "" }) => counterSpots(ctx, where).length > 0,
    // `count`: "choose 2 of your opponent's Pokémon and put 2 damage counters on each of them" (2 different ones).
    run(ctx, { n, where = "", count = 1 }) {
      askPick(ctx.state, { player: ctx.player, side: other(ctx.player), spots: counterSpots(ctx, where), left: count, effect: { op: "damage", n } });
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
      if (frontOpen(ctx) && !frontDown(ctx) && theirs(ctx).bench.length) askPick(ctx.state, { player: other(ctx.player), side: other(ctx.player), spots: benchSpots(theirs(ctx)), left: 1, effect: { op: "switch" } });
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
  // `fromWho`: only from your Pokémon that fit ("from 1 of your Team Rocket's Pokémon").
  moveCounters: {
    ready: (ctx, { to = "foe", fromWho = "" }) => hurt(ctx).filter((spot) => !fromWho || fits(defOf(ctx.state, slotAt(ctx.state, ctx.player, spot).uid, ctx.defs), fromWho)).length > 0 && (to !== "foe" || inPlay(ctx.state, other(ctx.player)).length > 0) && (to === "foe" || inPlay(ctx.state, ctx.player).length > 1),
    run(ctx, { n, to = "foe", fromWho = "" }) {
      const spots = hurt(ctx).filter((spot) => !fromWho || fits(defOf(ctx.state, slotAt(ctx.state, ctx.player, spot).uid, ctx.defs), fromWho));
      askPick(ctx.state, { player: ctx.player, side: ctx.player, spots, left: 1, effect: { op: "moveCountersFrom", n, to } });
    },
  },
  /** Energy from the deck straight onto your Pokémon: `to` "self", "active", "one" (all on one) or "spread" (any way you like). */
  /** `where` (to, whoType, who as energySpots reads them): only some of your Pokémon may take it (Max Elixir). */
  fetchEnergy: {
    ready: (ctx, { to, where = null }) => hasDeck(ctx) && (to !== "self" || ctx.spot != null) && (where ? energySpots(ctx, where) : inPlay(ctx.state, ctx.player)).length > 0,
    // `rest` (with `top`): where the cards looked at and not taken go: "hand", "bottom", "discard", "shuffle" (back into the deck).
    // `rule`: what the cards taken together must keep ("a Basic Fire Energy card, a Basic Lightning Energy card, or 1 of each").
    run(ctx, { what, n = 1, to, top = 0, where = null, mix = false, rest = "", rule = null, hurt = 0 }) {
      const side = mine(ctx);
      const pool = top ? side.deck.slice(0, top) : side.deck;
      const after = !top ? {} : rest === "hand" ? { rest: "hand", top } : rest === "bottom" ? { restBottom: top } : rest === "discard" ? { restMill: top } : {};
      askChoose(ctx.state, { player: ctx.player, zone: "deck", what, uids: fitting(ctx, pool, what), min: 0, max: n, effect: { op: "attach", to, spot: to === "self" ? ctx.spot : to === "active" ? ACTIVE : null, ...(where ? { spots: energySpots(ctx, where) } : {}), ...(hurt ? { hurt } : {}) }, shuffle: !top || mix || rest === "shuffle", ...after, ...(rule ? { rule } : {}) });
    },
  },
  /** Roxie's Performance: the other player's Poisoned Pokémon can't retreat during their next turn (engine.js canRetreat). */
  poisonPin: {
    ready: () => true,
    run(ctx) {
      theirs(ctx).poisonPin = ctx.state.turn + 1;
      ctx.events.push({ t: "lock", p: other(ctx.player), what: "poisoned-retreat" });
    },
  },
  /** Ogre's Mask: a Pokémon from the discard pile takes the place of one in play that fits `what` too. */
  swapPlay: {
    ready: (ctx, { what }) => fitting(ctx, mine(ctx).discard, what).length > 0 && inPlay(ctx.state, ctx.player).some(([slot]) => fits(defOf(ctx.state, slot.uid, ctx.defs), what)),
    run(ctx, { what }) {
      askChoose(ctx.state, { player: ctx.player, zone: "discard", what, uids: fitting(ctx, mine(ctx).discard, what), min: 1, max: 1, effect: { op: "swapPlay", what } });
    },
  },
  /** "Search your deck for a Pokémon Tool card and attach it to this Pokémon" (it has none yet; one that can't go on it isn't offered). */
  toolFetch: {
    ready: (ctx) => ctx.spot != null && hasDeck(ctx) && Boolean(slotAt(ctx.state, ctx.player, ctx.spot)) && toolsIn(slotAt(ctx.state, ctx.player, ctx.spot)).length < toolRoom(ctx.state, slotAt(ctx.state, ctx.player, ctx.spot), ctx.defs),
    run(ctx) {
      const slot = slotAt(ctx.state, ctx.player, ctx.spot);
      if (!slot || toolsIn(slot).length >= toolRoom(ctx.state, slot, ctx.defs)) return;
      const holder = defOf(ctx.state, slot.uid, ctx.defs);
      const uids = mine(ctx).deck.filter((uid) => {
        const def = defOf(ctx.state, uid, ctx.defs);
        return def?.kind === "trainer" && def.sub === "tool" && def.playable && def.tool && toolFits(def.tool, holder);
      });
      askChoose(ctx.state, { player: ctx.player, zone: "deck", what: "tool", uids, min: 0, max: 1, effect: { op: "toolOn", spot: ctx.spot }, shuffle: true });
    },
  },
  /** Ambipom's Wicked Tail: coins, and a random card from their hand into their deck for each heads. */
  foeHandToDeck: {
    ready: (ctx) => theirs(ctx).hand.length > 0,
    run(ctx, { coins }) {
      const results = Array.from({ length: coins }, () => flip(ctx.state, ctx.player));
      ctx.events.push({ t: "flip", p: ctx.player, results, why: "ability" });
      const side = theirs(ctx);
      const gone = [];
      for (let i = results.filter(Boolean).length; i > 0 && side.hand.length; i -= 1) gone.push(...side.hand.splice(Math.floor(rand(ctx.state) * side.hand.length), 1));
      if (!gone.length) return;
      side.deck.push(...gone);
      shuffle(ctx.state, side.deck);
      ctx.events.push({ t: "hand-to-deck", p: other(ctx.player), uids: gone, at: "into", random: true });
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
  // `to: "active"`: from the Benched Pokémon to the Active one (Latios), not to the card's own Pokémon.
  gather: {
    ready: (ctx, { type = "", to = "" }) => (to === "active" ? Boolean(mine(ctx).active) : ctx.spot != null) && givers(ctx, type, to === "active" ? ACTIVE : ctx.spot).length > 0,
    run(ctx, { type = "", to = "" }) {
      const at = to === "active" ? ACTIVE : ctx.spot;
      const spots = givers(ctx, type, at);
      if (spots.length) askPick(ctx.state, { player: ctx.player, side: ctx.player, spots, left: 1, optional: true, effect: { op: "gatherFrom", type, to: at } });
    },
  },
  /** Misty's Psyduck: the bottom card of the deck discarded; if it was, this Pokémon goes on top of the deck, its cards discarded. */
  selfTop: {
    ready: (ctx) => ctx.spot != null && Boolean(slotAt(ctx.state, ctx.player, ctx.spot)) && hasDeck(ctx),
    run(ctx) {
      const side = mine(ctx);
      const slot = slotAt(ctx.state, ctx.player, ctx.spot);
      const bottom = side.deck.pop();
      if (!bottom || !slot) return;
      side.discard.push(bottom);
      ctx.events.push({ t: "mill", p: ctx.player, uids: [bottom], from: "bottom" });
      side.discard.push(...slot.under, ...slot.energy, ...heldOn(slot));
      for (const uid of toolsIn(slot)) toolGone(ctx.state, ctx.player, uid, ctx.defs);
      side.deck.unshift(slot.uid);
      if (ctx.spot === ACTIVE) side.active = null;
      else side.bench.splice(ctx.spot, 1);
      ctx.events.push({ t: "deck-top", p: ctx.player, n: 1, uid: slot.uid });
      ctx.spot = null;
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
  /** `what`: only cards of a kind may be taken (none, if none are there); `bottom`: the look is at the bottom cards. */
  topTake: {
    ready: hasDeck,
    run(ctx, { n, top, min = n, shuffle: mix = false, what = "any", bottom = false, pass = false }) {
      const deck = mine(ctx).deck;
      const uids = fitting(ctx, bottom ? deck.slice(-top) : deck.slice(0, top), what);
      askChoose(ctx.state, { player: ctx.player, zone: "deck", what, uids, min: what === "any" ? min : 0, max: n, effect: { op: "toHand" }, top, shuffle: mix, ...(pass ? { pass } : {}) });
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
  /** `least`: "show 3 basic Energy cards ... and shuffle them into your deck" asks for that many. */
  recycle: {
    ready: (ctx, { what, least = 1 }) => fitting(ctx, mine(ctx).discard, what).length >= least,
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
  /** `hurt`: only one with damage counters on it (Acerola). */
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
    // `after`: counted after Weakness and Resistance (Misty); `poison`: Koga's Poison instead of damage.
    // `self`: "attacks used by this Pokémon" (an Ability's), held by the card in play.
    run(ctx, { n = 0, who = {}, vs = [], after = false, poison = false, self = false }) {
      const uid = self && ctx.spot != null ? slotAt(ctx.state, ctx.player, ctx.spot)?.uid : null;
      // Only this turn's count, so the list never grows.
      ctx.state.boosts = [...(ctx.state.boosts || []).filter((b) => b.turn === ctx.state.turn), { p: ctx.player, turn: ctx.state.turn, n, who, vs, ...(after ? { after } : {}), ...(poison ? { poison } : {}), ...(uid ? { uid } : {}) }];
      ctx.events.push({ t: "boost", p: ctx.player, n });
    },
  },
  /**
   * "During your opponent's next turn, all of your Metal Pokémon take 30 less damage from attacks from your opponent's
   * Pokémon. (This includes new Pokémon that come into play.)": held for the player, not on each Pokémon (engine.js toolOf).
   */
  teamGuard: {
    ready: () => true,
    run(ctx, { n, who = {} }) {
      const turn = ctx.state.turn + 1;
      ctx.state.guards = [...(ctx.state.guards || []).filter((g) => g.turn >= ctx.state.turn), { p: ctx.player, turn, n, who }];
      ctx.events.push({ t: "team-guard", p: ctx.player, n });
    },
  },
  /**
   * "Choose 1: • ... • ...": `options` [{ label, steps }], only those that would do something are offered
   * (one left is simply done). `both`: "Choose 1 or both". `who: "foe"`: the other player chooses ("your opponent may").
   */
  choice: {
    ready: (ctx, { options, who = "" }) => who === "foe" || options.some((o) => trainerReady(o.steps, ctx)),
    run(ctx, { options, both = false, who = "", prompt = "Choose one." }) {
      const open = who === "foe" ? options : options.filter((o) => trainerReady(o.steps, ctx));
      const offers = both && open.length === 2 ? [...open, { label: "Both", steps: [...open[0].steps, ...open[1].steps] }] : open;
      if (offers.length === 1) return runTrainer(offers[0].steps, ctx);
      if (offers.length) askOption(ctx, who === "foe" ? other(ctx.player) : ctx.player, prompt, offers);
    },
  },
  /** "Flip 2 coins. For each heads, ...": the step runs once with n as the number of heads (none, it doesn't run). */
  flipEach: {
    ready: (ctx, { step }) => T_OPS[step.op].ready(ctx, step),
    run(ctx, { coins, step }) {
      const results = Array.from({ length: coins }, () => flip(ctx.state));
      ctx.events.push({ t: "flip", p: ctx.player, results });
      const heads = results.filter(Boolean).length;
      if (heads) runTrainer([{ ...step, n: heads }], ctx);
    },
  },
  /**
   * Dan: "You and your opponent play Rock-Paper-Scissors until someone wins." This card's player chooses, then the
   * other player, who can't see that choice (it waits in `state.rps`, which engine.js viewFor keeps from them).
   * A tie plays again. `win`: what this card's player does on winning.
   */
  rps: {
    ready: hasDeck,
    run(ctx, { win = [] }) {
      ctx.state.rps = { p: ctx.player, round: (ctx.state.rps?.round || 0) + 1, win };
      ctx.state.pending.push({ type: "option", player: ctx.player, why: "rps", prompt: "Rock-Paper-Scissors: what do you play?", labels: RPS, options: RPS.map((_, k) => [{ op: "rpsMine", k }]) });
    },
  },
  rpsMine: {
    ready: () => true,
    run(ctx, { k }) {
      ctx.state.rps.pick = k;
      ctx.state.pending.push({ type: "option", player: other(ctx.player), by: ctx.player, why: "rps", prompt: "Your opponent's Dan: Rock-Paper-Scissors. What do you play?", labels: RPS, options: RPS.map((_, j) => [{ op: "rpsTheirs", j }]) });
    },
  },
  rpsTheirs: {
    ready: () => true,
    run(ctx, { j }) {
      const { pick, win, round } = ctx.state.rps;
      // Rock 0, Paper 1, Scissors 2: each beats the one before it.
      const outcome = (pick - j + 3) % 3;
      ctx.events.push({ t: "rps", p: ctx.player, picks: [RPS[pick], RPS[j]], won: outcome === 0 ? null : outcome === 1, round });
      if (!outcome) return T_OPS.rps.run(ctx, { win });
      delete ctx.state.rps;
      if (outcome === 1) runTrainer(win, ctx);
    },
  },
  /**
   * Challenge!: the opponent accepts or declines. Declined (or both Benches full), this card's player draws 2.
   * Accepted, each player with room searches their deck for any number of Basic Pokémon to put face down onto the
   * Bench: the cards wait out of sight in `state.challenge` (engine.js viewFor keeps them from the other player)
   * until both are done, then go onto the Benches face up and the decks are shuffled.
   */
  challenge: {
    ready: (ctx) => hasDeck(ctx) || [0, 1].some((p) => ctx.state.players[p].bench.length < ctx.state.rules.bench),
    run(ctx) {
      const full = [0, 1].every((p) => ctx.state.players[p].bench.length >= ctx.state.rules.bench);
      if (full) return T_OPS.draw.run(ctx, { n: 2 });
      ctx.state.pending.push({ type: "option", player: other(ctx.player), by: ctx.player, why: "challenge", prompt: "Your opponent's Challenge!: do you accept? If you do, each player puts any number of Basic Pokémon from their deck face down onto their Bench. If you decline, they draw 2 cards.", labels: ["Accept", "Decline"], options: [[{ op: "challengeGo" }], [{ op: "draw", n: 2 }]] });
    },
  },
  challengeGo: {
    ready: () => true,
    run(ctx) {
      const { state } = ctx;
      const order = [ctx.player, other(ctx.player)].filter((p) => state.players[p].bench.length < state.rules.bench);
      state.challenge = { by: ctx.player, wait: order.length, cards: [[], []] };
      for (const p of order) {
        const side = state.players[p];
        const uids = side.deck.filter((uid) => fits(defOf(state, uid, ctx.defs), "basic"));
        state.pending.push({ type: "choose", player: p, zone: "deck", what: "basic", uids, min: 0, max: Math.min(uids.length, state.rules.bench - side.bench.length), effect: { op: "challengeHold" }, prompt: "Challenge!: Basic Pokémon from your deck, face down onto your Bench (any number)." });
      }
    },
  },
  /**
   * Pokémon Breeder Fields: 1 or 2 of your non-Baby Pokémon that can evolve are picked (their uids wait in
   * `state.breeder`), then a coin for each; for each heads, a card from the deck that evolves from that one.
   */
  breeder: {
    ready: (ctx) => hasDeck(ctx) && breederSpots(ctx).length > 0,
    run(ctx) {
      const spots = breederSpots(ctx);
      if (!spots.length) return;
      ctx.state.breeder = [];
      askPick(ctx.state, { player: ctx.player, side: ctx.player, spots, left: 2, effect: { op: "breedMark" }, then: [{ op: "breedFlip" }] });
    },
  },
  breedFlip: {
    ready: () => true,
    run(ctx) {
      const { state } = ctx;
      const marked = state.breeder || [];
      delete state.breeder;
      const side = mine(ctx);
      for (const uid of marked) {
        const at = inPlay(state, ctx.player).find(([slot]) => slot.uid === uid);
        if (!at) continue;
        const heads = flip(state, ctx.player);
        ctx.events.push({ t: "flip", p: ctx.player, results: [heads] });
        if (!heads) continue;
        const name = defOf(state, uid, ctx.defs).name;
        const uids = side.deck.filter((u) => evolvesOnto(defOf(state, u, ctx.defs), name));
        askChoose(state, { player: ctx.player, zone: "deck", what: "evolution", uids, min: 0, max: 1, effect: { op: "toHand" }, shuffle: true });
      }
    },
  },
  /**
   * Sabrina's Psychic Control: heads, one of the Trainer cards in the opponent's discard pile that isn't put in play,
   * used as if it were in the hand (its price paid, a Supporter counting as this turn's); it stays where it is.
   * Offered are the ones that would do something now, and "Don't use".
   */
  psychic: {
    ready: (ctx) => borrowable(ctx, false).length > 0,
    run(ctx) {
      const heads = flip(ctx.state, ctx.player);
      ctx.events.push({ t: "flip", p: ctx.player, results: [heads] });
      if (!heads) return;
      const uids = borrowable(ctx, true);
      const seen = new Set();
      const offers = uids.filter((uid) => {
        const id = ctx.state.cards[uid];
        return !seen.has(id) && seen.add(id);
      }).map((uid) => ({ label: defOf(ctx.state, uid, ctx.defs).name, steps: [{ op: "borrowRun", card: uid }] }));
      const all = [...offers, { label: "Don't use one", steps: [] }];
      if (offers.length) ctx.state.pending.push({ type: "option", player: ctx.player, why: "borrow", prompt: "Sabrina's Psychic Control: use a Trainer card from your opponent's discard pile?", labels: all.map((o) => o.label), options: all.map((o) => o.steps) });
    },
  },
  borrowRun: {
    ready: () => true,
    run(ctx, { card }) {
      const def = defOf(ctx.state, card, ctx.defs);
      if (!theirs(ctx).discard.includes(card)) return;
      if (def.sub === "supporter") mine(ctx).supporterUsed = true;
      ctx.events.push({ t: "borrow", p: ctx.player, uid: card });
      runTrainer(borrowSteps(def.fx), ctx);
    },
  },
  /** After a switch (`state.switched`, engine.js switchActive): the Pokémon that went to the Bench. */
  /** Zinnia's Trust: an Energy from it to the new Active Pokémon. */
  energyBack: {
    ready: () => true,
    run(ctx) {
      const at = switchedOut(ctx);
      if (!at) return;
      const [slot, spot] = at;
      if (!slot.energy.length || !mine(ctx).active) return;
      askChoose(ctx.state, { player: ctx.player, zone: "play", what: "energy", uids: slot.energy.slice(), min: 1, max: 1, effect: { op: "carryEnergy", from: spot, spots: [ACTIVE] } });
    },
  },
  /** AZ's Tranquility: it is healed if it fits `who` ("If you moved a Pokémon ex to your Bench in this way"). */
  healBack: {
    ready: () => true,
    run(ctx, { n, who }) {
      const at = switchedOut(ctx);
      if (!at || !fits(defOf(ctx.state, at[0].uid, ctx.defs), who)) return;
      const healed = Math.min(healMore(ctx.state, n), healRoom(ctx.state, at[0]));
      at[0].damage -= healed;
      if (healed) at[0].healedOn = ctx.state.turn;
      ctx.events.push({ t: "heal", p: ctx.player, spot: at[1], n: healed });
    },
  },
  /** N's Plan: up to n Energy from your Benched Pokémon onto your Active Pokémon. */
  pullEnergy: {
    ready: (ctx) => Boolean(mine(ctx).active) && mine(ctx).bench.some((slot) => slot.energy.length),
    run(ctx, { n }) {
      const uids = mine(ctx).bench.flatMap((slot) => slot.energy);
      if (uids.length && mine(ctx).active) askChoose(ctx.state, { player: ctx.player, zone: "play", what: "energy", uids, min: 0, max: n, effect: { op: "energyToActive" } });
    },
  },
  /** "Your opponent reveals their hand, and you draw a card for each Pokémon you find there." */
  foeRevealDraw: {
    ready: (ctx) => theirs(ctx).hand.length > 0,
    run(ctx, { what = "pokemon" }) {
      const hand = theirs(ctx).hand.slice();
      ctx.events.push({ t: "reveal-hand", p: other(ctx.player), uids: hand });
      draw(ctx, ctx.player, fitting(ctx, hand, what).length);
      askChoose(ctx.state, { player: ctx.player, owner: other(ctx.player), zone: "hand", what: "any", uids: [], min: 0, max: 0, effect: { op: "look" }, seen: hand });
    },
  },
  /** "Both Active non-Darkness Pokémon are now Confused." */
  confuseBoth: {
    ready: (ctx, step) => confusable(ctx, step).length > 0,
    run(ctx, step) {
      for (const p of confusable(ctx, step)) if (addCondition(ctx.state, ctx.state.players[p].active, "confused", ctx.defs)) ctx.events.push({ t: "condition", p, kind: "confused" });
    },
  },
  /** "Your opponent discards cards from their hand until they have 3 cards in their hand" (their choice). */
  foeTossTo: {
    ready: (ctx, { n }) => theirs(ctx).hand.length > n,
    run(ctx, { n }) {
      const uids = theirs(ctx).hand.slice();
      const k = uids.length - n;
      if (k > 0) askChoose(ctx.state, { player: other(ctx.player), zone: "hand", what: "any", uids, min: k, max: k, effect: { op: "discard" } });
    },
  },
  /** Iono-like hands to the bottom, then each player flips: heads `heads` cards, tails `tails`. */
  flipDrawEach: {
    ready: () => true,
    run(ctx, { heads: hi, tails: lo }) {
      if (!ctx.moved) return;
      for (const p of [ctx.player, other(ctx.player)]) {
        const up = flip(ctx.state, p);
        ctx.events.push({ t: "flip", p, results: [up] });
        draw(ctx, p, up ? hi : lo);
      }
    },
  },
  /** "Flip a coin. If heads, you draw 5 cards, and your opponent draws 3. If tails, the other way round." */
  flipDrawBoth: {
    ready: () => true,
    run(ctx, { win, lose }) {
      const up = flip(ctx.state, ctx.player);
      ctx.events.push({ t: "flip", p: ctx.player, results: [up] });
      draw(ctx, ctx.player, up ? win : lose);
      draw(ctx, other(ctx.player), up ? lose : win);
    },
  },
  /** Eri: the other player's hand is shown, and up to n cards of a kind there go to their discard pile. */
  foeHandDiscard: {
    ready: (ctx) => theirs(ctx).hand.length > 0,
    run(ctx, { what = "item", n = 1 }) {
      const hand = theirs(ctx).hand;
      if (hand.length) askChoose(ctx.state, { player: ctx.player, owner: other(ctx.player), zone: "hand", what, uids: fitting(ctx, hand, what), min: 0, max: n, effect: { op: "discard" }, seen: hand.slice() });
    },
  },
  /** Crispin: a basic Energy from the deck into the hand; then (`crispinAttach`) one of another type onto one of your Pokémon. */
  crispin: {
    ready: hasDeck,
    run(ctx) {
      askChoose(ctx.state, { player: ctx.player, zone: "deck", what: "basicEnergy", uids: fitting(ctx, mine(ctx).deck, "basicEnergy"), min: 0, max: 1, effect: { op: "toHand" }, pass: true, prompt: "Crispin: the basic Energy for your hand (then one of another type to attach)." });
    },
  },
  crispinAttach: {
    ready: () => true,
    run(ctx, { paid = [] }) {
      if (!paid.length) {
        shuffle(ctx.state, mine(ctx).deck);
        return;
      }
      const type = defOf(ctx.state, paid[0], ctx.defs).provides[0];
      const uids = fitting(ctx, mine(ctx).deck, "basicEnergy").filter((uid) => defOf(ctx.state, uid, ctx.defs).provides[0] !== type);
      askChoose(ctx.state, { player: ctx.player, zone: "deck", what: "basicEnergy", uids, min: 0, max: 1, effect: { op: "attach", to: "one", spots: inPlay(ctx.state, ctx.player).map(([, spot]) => spot) }, shuffle: true });
    },
  },
  /** Amarys: at the end of this turn, a hand of `n` or more cards is discarded (engine.js endOfTurn). */
  handLimit: {
    ready: () => true,
    run(ctx, { n }) {
      mine(ctx).handLimit = { turn: ctx.state.turn, n };
    },
  },
  /**
   * Lt. Surge's Bargain: the other player says whether each player takes a Prize card; if not, this card's player draws.
   * A player left with no Prize cards wins (both at once: a tie).
   */
  bargain: {
    ready: () => true,
    run(ctx, { draw: n }) {
      ctx.state.pending.push({ type: "option", player: other(ctx.player), by: ctx.player, why: "bargain", prompt: `Your opponent's Lt. Surge's Bargain: may each player take a Prize card? If not, they draw ${n} cards.`, labels: ["Yes", "No"], options: [[{ op: "prizeEach" }], [{ op: "draw", n }]] });
    },
  },
  prizeEach: {
    ready: () => true,
    run(ctx) {
      for (const p of [ctx.player, other(ctx.player)]) {
        const side = ctx.state.players[p];
        const took = side.prizes.splice(0, 1);
        side.hand.push(...took);
        if (took.length) ctx.events.push({ t: "prize", p, uids: took });
      }
      const out = [0, 1].map((p) => ctx.state.players[p].prizes.length === 0);
      if (out[0] && out[1]) win(ctx.state, null, "tie", ctx.events);
      else if (out[0] || out[1]) win(ctx.state, out[0] ? 0 : 1, "prizes", ctx.events);
    },
  },
  /** Kahili, Egg Incubator: this card goes back to the hand, or to the bottom of the deck, instead of the discard pile. */
  keepCard: {
    must: true,
    ready: () => true,
    run(ctx, { to = "hand" }) {
      const side = mine(ctx);
      if (!ctx.uid || !side.discard.includes(ctx.uid)) return;
      side.discard.splice(side.discard.indexOf(ctx.uid), 1);
      if (to === "bottom") side.deck.push(ctx.uid);
      else if (to === "deck") {
        side.deck.push(ctx.uid);
        shuffle(ctx.state, side.deck);
      } else side.hand.push(ctx.uid);
      ctx.events.push({ t: "keep-card", p: ctx.player, uid: ctx.uid, to });
    },
  },
  /** "Your turn ends." */
  endTurn: {
    must: true,
    ready: () => true,
    run(ctx) {
      ctx.state.ending = true;
      ctx.events.push({ t: "turn-ends", p: ctx.player });
    },
  },
  /** "You can't play any more Trainer cards this turn." */
  noTrainers: {
    must: true,
    ready: () => true,
    run(ctx) {
      mine(ctx).noTrainers = ctx.state.turn;
    },
  },
  /** Shuffle your deck (before a look at the top cards). */
  shuffleDeck: {
    must: true,
    ready: () => true,
    run: (ctx) => void shuffle(ctx.state, mine(ctx).deck),
  },
  /**
   * PlusPower, Defender: this card is attached to one of your Pokémon (`to: "active"`, the Active one) and stays until
   * the end of the turn (`until` 0) or of the other player's next turn (1). `mod` as heldOn reads it.
   */
  hold: {
    ready: (ctx, { to = "any" }) => (to === "active" ? Boolean(mine(ctx).active) : inPlay(ctx.state, ctx.player).length > 0),
    run(ctx, { to = "any", until = 0, mod }) {
      const spots = to === "active" ? [ACTIVE] : inPlay(ctx.state, ctx.player).map(([, spot]) => spot);
      if (ctx.uid && spots.length) askPick(ctx.state, { player: ctx.player, side: ctx.player, spots, left: 1, effect: { op: "hold", uid: ctx.uid, mod: { ...mod, until: ctx.state.turn + until } } });
    },
  },
  /**
   * A Technical Machine goes on 1 of your Pokémon that fits `only` ({ evolved, types }) and holds none yet, which may
   * then use its attack (engine.js attacksOf); `turn`: it is discarded at the end of this turn, else it stays.
   */
  tm: {
    ready: (ctx, step) => tmSpots(ctx, step).length > 0,
    run(ctx, step) {
      const spots = tmSpots(ctx, step);
      if (ctx.uid && spots.length) askPick(ctx.state, { player: ctx.player, side: ctx.player, spots, left: 1, effect: { op: "hold", uid: ctx.uid, mod: { until: step.turn ? ctx.state.turn : 1e9, tm: true } } });
    },
  },
  /** A Special Condition on your Active Pokémon goes: the player chooses which, when there are several (Big Malasada). */
  /** "Look at the top card of your deck. You may discard that card." */
  topMill: {
    ready: hasDeck,
    run(ctx, { n = 1 }) {
      const top = mine(ctx).deck.slice(0, n);
      if (top.length) askChoose(ctx.state, { player: ctx.player, zone: "deck", what: "any", uids: top, min: 0, max: top.length, effect: { op: "millChosen" } });
    },
  },
  /** Archeops: one of their evolved Pokémon loses its highest Stage card, to their hand. */
  foeDevolve: {
    ready: (ctx) => open(ctx).some(([slot]) => slot.under.length > 0),
    run(ctx) {
      const spots = open(ctx).filter(([slot]) => slot.under.length > 0).map(([, spot]) => spot);
      if (spots.length) askPick(ctx.state, { player: ctx.player, side: other(ctx.player), spots, left: 1, effect: { op: "devolve" } });
    },
  },
  /** "If you do, the new Active Pokémon is now Poisoned": a Special Condition on your own Active Pokémon. */
  selfCondition: {
    ready: (ctx) => Boolean(mine(ctx).active),
    run(ctx, { kinds }) {
      for (const kind of kinds) if (addCondition(ctx.state, mine(ctx).active, kind, ctx.defs)) ctx.events.push({ t: "condition", p: ctx.player, kind });
    },
  },
  /** "Shuffle this Pokémon and all attached cards into your deck": the Ability's own Pokémon leaves play. */
  selfIn: {
    ready: (ctx) => ctx.spot != null && Boolean(slotAt(ctx.state, ctx.player, ctx.spot)),
    run(ctx) {
      const side = mine(ctx);
      const slot = slotAt(ctx.state, ctx.player, ctx.spot);
      if (!slot) return;
      side.deck.push(slot.uid, ...slot.under, ...slot.energy, ...toolsIn(slot), ...heldOn(slot));
      shuffle(ctx.state, side.deck);
      if (ctx.spot === ACTIVE) side.active = null;
      else side.bench.splice(ctx.spot, 1);
      ctx.events.push({ t: "shuffle-in", p: ctx.player, spot: ctx.spot, uid: slot.uid });
      ctx.spot = null;
    },
  },
  cureOne: {
    ready: (ctx) => conditionsOn(mine(ctx).active).length > 0,
    run(ctx) {
      const kinds = conditionsOn(mine(ctx).active);
      if (kinds.length === 1) return runTrainer([{ op: "cureKind", kind: kinds[0] }], ctx);
      if (kinds.length) askOption(ctx, ctx.player, "Choose the Special Condition to remove.", kinds.map((kind) => ({ label: kind[0].toUpperCase() + kind.slice(1), steps: [{ op: "cureKind", kind }] })));
    },
  },
  cureKind: {
    ready: (ctx, { kind }) => conditionsOn(mine(ctx).active).includes(kind),
    run(ctx, { kind }) {
      const st = mine(ctx).active?.status;
      if (!st) return;
      if (kind === "poisoned" || kind === "burned") st[kind] = false;
      else if (st.main === kind) st.main = "";
      ctx.events.push({ t: "cure", p: ctx.player, kind });
    },
  },
  /** Discard n cards from the hand, the player's choice, as part of what the card does (not a price): `upTo`, `pass` as stash. */
  toss: {
    ready: (ctx, { need = false, n = 1, what = "any" }) => !need || stashable(ctx, { what }) >= Math.min(1, n === "all" ? 1 : n),
    run(ctx, { n = 1, what = "any", upTo = false, pass = false, seen = false }) {
      const uids = fitting(ctx, mine(ctx).hand, what);
      const max = n === "all" ? uids.length : n;
      const look = seen ? { seen: theirs(ctx).hand.slice() } : {};
      if (seen) ctx.events.push({ t: "reveal-hand", p: other(ctx.player), uids: look.seen });
      if (uids.length) askChoose(ctx.state, { player: ctx.player, zone: "hand", what, uids, min: upTo ? 0 : Math.min(max, uids.length), max, effect: { op: "discard" }, ...(pass ? { pass } : {}), ...look });
    },
  },
  /**
   * Draws that count what was just discarded (`paid`, see cost): `n` (or `bonus.n` instead when one of them fits
   * `bonus.what`), `per` card discarded (`flip`: only on heads), `table` by how many, or `to` a hand of that many.
   */
  drawPaid: {
    ready: (ctx, { to = 0, spare = 0 }) => hasDeck(ctx) && (!to || mine(ctx).hand.length - held(ctx) - spare < to),
    run(ctx, { paid = [], n = 0, bonus = null, per = 0, table = null, to = 0, flip: coin = false }) {
      let draws = n;
      if (bonus && paid.some((uid) => fits(defOf(ctx.state, uid, ctx.defs), bonus.what))) draws = bonus.n;
      if (per) draws = per * paid.length;
      if (table) draws = table[paid.length] || 0;
      if (to) draws = Math.max(0, to - mine(ctx).hand.length);
      if (coin && paid.length) {
        const heads = flip(ctx.state);
        ctx.events.push({ t: "flip", p: ctx.player, results: [heads] });
        if (!heads) draws = 0;
      }
      draw(ctx, ctx.player, draws);
    },
  },
  /** Draw as many as something counts: `of` "benches" (both Benches), "foeHand" (until your hand matches theirs). */
  drawFor: {
    ready: (ctx, { of }) => hasDeck(ctx) && (of !== "foeHand" || mine(ctx).hand.length - held(ctx) < theirs(ctx).hand.length) && (of !== "foeBench" || theirs(ctx).bench.length > 0),
    run(ctx, { of }) {
      if (of === "benches") draw(ctx, ctx.player, mine(ctx).bench.length + theirs(ctx).bench.length);
      else if (of === "foeBench") draw(ctx, ctx.player, theirs(ctx).bench.length);
      else draw(ctx, ctx.player, Math.max(0, theirs(ctx).hand.length - mine(ctx).hand.length));
    },
  },
  /** "You may draw up to 3 cards": the player says how many. `of: "foeInPlay"` counts their Pokémon; `who: "foe"` the other player draws. */
  drawUpTo: {
    ready: (ctx, { who = "" }) => who === "foe" || hasDeck(ctx),
    run(ctx, { n = 0, of = "", who = "" }) {
      const p = who === "foe" ? other(ctx.player) : ctx.player;
      const most = Math.min(of === "foeInPlay" ? inPlay(ctx.state, other(ctx.player)).length : n, ctx.state.players[p].deck.length);
      if (most <= 0) return;
      const step = (k) => (who === "foe" ? { op: "foeDraw", n: k } : { op: "draw", n: k });
      const offers = Array.from({ length: most + 1 }, (_, i) => most - i).map((k) => ({ label: k ? `Draw ${k}` : "Don't draw", steps: k ? [step(k)] : [] }));
      askOption(ctx, p, who === "foe" ? "Draw cards?" : "How many cards to draw?", offers);
    },
  },
  /** Reveal cards from the top until one fits `what`: it goes to the hand, the rest are shuffled back (Quick Ball). */
  revealUntil: {
    ready: hasDeck,
    run(ctx, { what }) {
      const side = mine(ctx);
      const at = side.deck.findIndex((uid) => fits(defOf(ctx.state, uid, ctx.defs), what));
      ctx.events.push({ t: "reveal-deck", p: ctx.player, uids: side.deck.slice(0, at < 0 ? side.deck.length : at + 1) });
      if (at >= 0) {
        const [uid] = side.deck.splice(at, 1);
        side.hand.push(uid);
        ctx.events.push({ t: "search", p: ctx.player, uids: [uid], from: "deck", to: "hand" });
      }
      shuffle(ctx.state, side.deck);
    },
  },
  /**
   * The top n cards are shown: those that fit `what` go to the hand, the rest are discarded or (`rest: "shuffle"`)
   * shuffled back. `both`: each player does it with their own deck (Lure Module).
   */
  topSort: {
    ready: (ctx, { both = false }) => hasDeck(ctx) || (both && theirs(ctx).deck.length > 0),
    run(ctx, { n, what, rest = "discard", both = false }) {
      for (const p of both ? [ctx.player, other(ctx.player)] : [ctx.player]) {
        const side = ctx.state.players[p];
        const shown = side.deck.splice(0, n);
        ctx.events.push({ t: "reveal-deck", p, uids: shown });
        const take = shown.filter((uid) => fits(defOf(ctx.state, uid, ctx.defs), what));
        const left = shown.filter((uid) => !take.includes(uid));
        side.hand.push(...take);
        if (take.length) ctx.events.push({ t: "search", p, uids: take, from: "deck", to: "hand" });
        if (rest === "discard") side.discard.push(...left);
        else {
          side.deck.push(...left);
          shuffle(ctx.state, side.deck);
        }
      }
    },
  },
  /** Each player shuffles their hand into their deck and draws as many cards as it held (Sabrina's Gaze). */
  freshHands: {
    ready: () => true,
    run(ctx) {
      for (const p of [ctx.player, other(ctx.player)]) {
        const n = ctx.state.players[p].hand.length;
        handBack(ctx, p);
        draw(ctx, p, n);
      }
    },
  },
  /** Lass: both hands are shown, and every Trainer card in them is shuffled into its owner's deck. */
  trainersBack: {
    ready: () => true,
    run(ctx) {
      for (const p of [ctx.player, other(ctx.player)]) {
        const side = ctx.state.players[p];
        ctx.events.push({ t: "reveal-hand", p, uids: side.hand.slice() });
        const back = side.hand.filter((uid) => defOf(ctx.state, uid, ctx.defs).kind === "trainer");
        if (!back.length) continue;
        side.hand = side.hand.filter((uid) => !back.includes(uid));
        side.deck.push(...back);
        shuffle(ctx.state, side.deck);
        ctx.events.push({ t: "hand-to-deck", p, uids: back, at: "into" });
      }
    },
  },
  /** n cards at random from the other player's hand go to the bottom of their deck (Team Galactic's Mars). */
  foeRandomBottom: {
    ready: (ctx) => theirs(ctx).hand.length > 0,
    run(ctx, { n = 1 }) {
      const side = theirs(ctx);
      for (let i = 0; i < n && side.hand.length; i += 1) side.deck.push(...side.hand.splice(Math.floor(rand(ctx.state) * side.hand.length), 1));
      ctx.events.push({ t: "hand-to-deck", p: other(ctx.player), uids: [], at: "bottom" });
    },
  },
  /** The other player discards n cards from their hand, their choice. */
  foeToss: {
    ready: (ctx) => theirs(ctx).hand.length > 0,
    run(ctx, { n = 1 }) {
      const uids = theirs(ctx).hand.slice();
      if (uids.length) askChoose(ctx.state, { player: other(ctx.player), zone: "hand", what: "any", uids, min: Math.min(n, uids.length), max: n, effect: { op: "discard" } });
    },
  },
  /** You look at the other player's hand and put n of its cards on the bottom of their deck (Cyrus's Initiative). */
  foeHandBottom: {
    ready: (ctx) => theirs(ctx).hand.length > 0,
    run(ctx, { n = 1 }) {
      const uids = theirs(ctx).hand.slice();
      if (uids.length) askChoose(ctx.state, { player: ctx.player, owner: other(ctx.player), zone: "hand", what: "any", uids, min: Math.min(n, uids.length), max: n, effect: { op: "toBottom" } });
    },
  },
  /** Erika's Perfume: you look at their hand and may put its Basic Pokémon onto their Bench. */
  // `what`, `n`: "a Basic Pokémon with 70 HP or less that you find there" (one of them).
  foeBasicsOut: {
    ready: (ctx) => theirs(ctx).hand.length > 0,
    run(ctx, { what = "basic", n = 0 } = {}) {
      const side = theirs(ctx);
      const uids = fitting(ctx, side.hand, what);
      ctx.events.push({ t: "reveal-hand", p: other(ctx.player), uids: side.hand.slice() });
      const room = Math.max(0, ctx.state.rules.bench - side.bench.length);
      askChoose(ctx.state, { player: ctx.player, owner: other(ctx.player), zone: "hand", what, uids, min: 0, max: n ? Math.min(n, room) : room, effect: { op: "toBench" }, seen: side.hand.slice() });
    },
  },
  /** The other player may search their deck for a Basic Pokémon and put it onto their Bench (Pokémon March). */
  foeBenchSearch: {
    ready: (ctx) => theirs(ctx).deck.length > 0 && theirs(ctx).bench.length < ctx.state.rules.bench,
    run(ctx) {
      const side = theirs(ctx);
      if (!side.deck.length || side.bench.length >= ctx.state.rules.bench) return;
      askChoose(ctx.state, { player: other(ctx.player), zone: "deck", what: "basic", uids: fitting(ctx, side.deck, "basic"), min: 0, max: 1, effect: { op: "toBench" }, shuffle: true });
    },
  },
  /** Rival: the top n cards are shown, the other player chooses `take` of them for your hand, and the deck is shuffled. */
  foeChoosesTop: {
    ready: (ctx, { take }) => mine(ctx).deck.length > 0 && take > 0,
    run(ctx, { n, take }) {
      const uids = mine(ctx).deck.slice(0, n);
      askChoose(ctx.state, { player: other(ctx.player), owner: ctx.player, zone: "deck", what: "any", uids, min: Math.min(take, uids.length), max: take, effect: { op: "toHand" }, shuffle: true });
    },
  },
  /** Each player draws or discards until their hand holds n (Hugh; `who: "foe"` for the other player). */
  evenHand: {
    ready: (ctx, { n, who = "" }) => (who === "foe" ? theirs(ctx).hand.length !== n : mine(ctx).hand.length - held(ctx) !== n && (mine(ctx).hand.length - held(ctx) > n || hasDeck(ctx))),
    run(ctx, { n, who = "" }) {
      const p = who === "foe" ? other(ctx.player) : ctx.player;
      const side = ctx.state.players[p];
      if (side.hand.length < n) return draw(ctx, p, n - side.hand.length);
      if (side.hand.length > n) askChoose(ctx.state, { player: p, zone: "hand", what: "any", uids: side.hand.slice(), min: side.hand.length - n, max: side.hand.length - n, effect: { op: "discard" } });
    },
  },
  /** Professor Rowan: one card stays in the hand, the rest is shuffled into the deck. */
  keepOne: {
    must: true,
    ready: (ctx) => mine(ctx).hand.length > 1,
    run(ctx) {
      const uids = mine(ctx).hand.slice();
      if (uids.length) askChoose(ctx.state, { player: ctx.player, zone: "hand", what: "any", uids, min: 1, max: 1, effect: { op: "keepOne" }, shuffle: true });
    },
  },
  /** Lt. Surge: a Basic Pokémon from the hand becomes the Active Pokémon; the old one goes to the Bench. */
  newActive: {
    ready: (ctx) => Boolean(mine(ctx).active) && mine(ctx).bench.length < ctx.state.rules.bench && fitting(ctx, mine(ctx).hand, "basic").length > 0,
    run(ctx) {
      askChoose(ctx.state, { player: ctx.player, zone: "hand", what: "basic", uids: fitting(ctx, mine(ctx).hand, "basic"), min: 1, max: 1, effect: { op: "toActive" } });
    },
  },
  /** Put the top (or `at: "bottom"`) n cards back in the order the player chooses, the first one chosen nearest the top. */
  arrange: {
    ready: (ctx) => mine(ctx).deck.length > 1,
    run(ctx, { n, at = "top", paid = null }) {
      const deck = mine(ctx).deck;
      const many = Math.min(deck.length, paid ? n - paid.length : n);
      if (many < 2) return;
      const uids = at === "bottom" ? deck.slice(-many) : deck.slice(0, many);
      askChoose(ctx.state, { player: ctx.player, zone: "deck", what: "any", uids, min: many, max: many, effect: { op: "order", at } });
    },
  },
  /** Research Record: of the top n, those chosen go to the bottom in order (`pass` lets the next step put the rest in order). */
  toBottomOf: {
    ready: (ctx) => mine(ctx).deck.length > 0,
    run(ctx, { n }) {
      const uids = mine(ctx).deck.slice(0, n);
      askChoose(ctx.state, { player: ctx.player, zone: "deck", what: "any", uids, min: 0, max: uids.length, effect: { op: "order", at: "bottom" }, pass: true });
    },
  },
  /** The Pokémon chosen (`who` as fits reads it) may evolve this turn whatever the timing (Giovanni). */
  lift: {
    ready: (ctx, { who }) => liftSpots(ctx, who).length > 0,
    run: (ctx, { who }) => askPick(ctx.state, { player: ctx.player, side: ctx.player, spots: liftSpots(ctx, who), left: 1, effect: { op: "lift" } }),
  },
  /** Hyper Devolution Spray: the top Evolution card of one of your evolved Pokémon goes back to your hand. */
  devolve: {
    ready: (ctx) => inPlay(ctx.state, ctx.player).some(([slot]) => slot.under.length),
    run: (ctx) => askPick(ctx.state, { player: ctx.player, side: ctx.player, spots: inPlay(ctx.state, ctx.player).filter(([slot]) => slot.under.length).map(([, spot]) => spot), left: 1, effect: { op: "devolve" } }),
  },
  /** Ninja Boy: one of your Basic Pokémon (not evolved) is swapped for a Basic Pokémon from the deck, with all it had. */
  swapBasic: {
    ready: (ctx) => hasDeck(ctx) && plainBasics(ctx).length > 0,
    run: (ctx) => askPick(ctx.state, { player: ctx.player, side: ctx.player, spots: plainBasics(ctx), left: 1, effect: { op: "swapFrom" } }),
  },
  /**
   * Energy cards off a Pokémon, the player's choice of which: `side` "mine" (a price: `must`) or "foe", up to n of them.
   * `move`: they go to another of your Pokémon instead (Lucian's Assignment).
   */
  energyOff: {
    ready: (ctx, { side = "foe", move = false }) => (side === "foe" ? withEnergy(ctx).length > 0 : withMine(ctx).length > 0 && (!move || inPlay(ctx.state, ctx.player).length > 1)),
    run(ctx, { side = "foe", n = 1, upTo = false, move = false }) {
      const spots = side === "foe" ? withEnergy(ctx) : withMine(ctx);
      if (spots.length) askPick(ctx.state, { player: ctx.player, side: side === "foe" ? other(ctx.player) : ctx.player, spots, left: 1, effect: { op: "energyFrom", n: move ? 0 : n, ...(upTo || move ? { min: 1 } : {}), ...(move ? { move } : {}) } });
    },
  },
  /** An Ability's price: "You must discard a Basic Lightning Energy from this Pokémon in order to use this Ability." */
  selfShed: {
    must: true,
    ready: (ctx, { type = "", basic = false, n = 1 }) => ctx.spot != null && Boolean(slotAt(ctx.state, ctx.player, ctx.spot)) && energyCards(ctx, slotAt(ctx.state, ctx.player, ctx.spot), type, basic).length >= n,
    run(ctx, { type = "", basic = false, n = 1 }) {
      const uids = energyCards(ctx, slotAt(ctx.state, ctx.player, ctx.spot), type, basic);
      shedEnergy(ctx.state, ctx.player, ctx.player, ctx.spot, uids, n, ctx.events, ctx.defs);
    },
  },
  /** Super Energy Removal's price: an Energy from one of your own Pokémon. */
  payEnergy: {
    must: true,
    ready: (ctx) => withMine(ctx).length > 0,
    run(ctx) {
      askPick(ctx.state, { player: ctx.player, side: ctx.player, spots: withMine(ctx), left: 1, effect: { op: "energyFrom", n: 1 } });
    },
  },
  /** Sabrina: every Energy on one of your Pokémon that fits `who` goes onto another that fits it. */
  moveAll: {
    ready: (ctx, { who }) => sabrinaSpots(ctx, who).length > 0,
    run: (ctx, { who }) => askPick(ctx.state, { player: ctx.player, side: ctx.player, spots: sabrinaSpots(ctx, who), left: 1, effect: { op: "moveAllFrom", who } }),
  },
  /** Startling Megaphone: every Tool on their Pokémon is discarded. */
  dropFoeTools: {
    ready: (ctx) => open(ctx).some(([slot]) => slot.tool),
    run(ctx) {
      for (const [slot, spot] of open(ctx)) {
        for (const uid of takeTools(slot)) {
          toolGone(ctx.state, other(ctx.player), uid, ctx.defs);
          ctx.events.push({ t: "discard-tool", p: other(ctx.player), spot, uid });
        }
      }
    },
  },
  /** An old Pokémon Power's damage to their Active Pokémon: Weakness and Resistance count, but it isn't an attack. */
  zap: {
    ready: frontOpen,
    run(ctx, { n }) {
      const target = theirs(ctx).active;
      const me = slotAt(ctx.state, ctx.player, ctx.spot);
      if (!target || !me) return;
      const noWeakness = Boolean(toolOf(ctx.state, target, ctx.defs).noWeakness);
      const { amount, weak, resist } = damageAfterTyping(n, defOf(ctx.state, me.uid, ctx.defs), defOf(ctx.state, target.uid, ctx.defs), { noWeakness });
      if (!amount) return;
      target.damage += amount;
      ctx.events.push({ t: "damage", p: other(ctx.player), spot: ACTIVE, n: amount, weak, resist });
    },
  },
  /** Heal one of your hurt Pokémon, your pick (`where` "bench": a Benched one only, as Pokémon Center has it). */
  healOne: {
    ready: (ctx, { where = "" }) => hurt(ctx).some((spot) => where !== "bench" || spot !== ACTIVE),
    // `count`: that many different Pokémon ("Heal all damage from 2 of your Benched Pokémon").
    run(ctx, { n, where = "", count = 1 }) {
      const spots = hurt(ctx).filter((spot) => where !== "bench" || spot !== ACTIVE);
      if (spots.length) askPick(ctx.state, { player: ctx.player, side: ctx.player, spots, left: count, effect: { op: "heal", n } });
    },
  },
  /** Heal each of your Pokémon of these types (Rough Seas: Water and Lightning). */
  healEach: {
    ready: (ctx, { types }) => typedHurt(ctx, types).length > 0,
    run(ctx, { n, types }) {
      for (const spot of typedHurt(ctx, types)) {
        const slot = slotAt(ctx.state, ctx.player, spot);
        const healed = Math.min(healMore(ctx.state, n), healRoom(ctx.state, slot));
        slot.damage -= healed;
        if (healed) slot.healedOn = ctx.state.turn;
        ctx.events.push({ t: "heal", p: ctx.player, spot, n: healed });
      }
    },
  },
  /** Draw until the hand holds as many cards as you have Pokémon of this type in play (Mystery Garden). */
  drawToCount: {
    // Asked while the Energy it costs is still in the hand: one card fewer once that is paid.
    ready: (ctx, { type }) => hasDeck(ctx) && mine(ctx).hand.length - 1 < typedIn(ctx, type),
    run: (ctx, { type }) => draw(ctx, ctx.player, Math.max(0, typedIn(ctx, type) - mine(ctx).hand.length)),
  },
  /** "If the player has no Special Energy cards in their discard pile" (Power Tree): a term, not a step. */
  noSpecialDiscard: {
    must: true,
    ready: (ctx) => !mine(ctx).discard.some((uid) => isSpecial(ctx, uid)),
    run() {},
  },
  /** Celadon City Gym: an Energy off your Active Pokémon that fits `who`, while it has a Special Condition. */
  shed: {
    ready: (ctx, { who }) => {
      const front = mine(ctx).active;
      return Boolean(front?.energy.length && conditionsOn(front).length && fieldFits(who, defOf(ctx.state, front.uid, ctx.defs)));
    },
    run(ctx) {
      const front = mine(ctx).active;
      askChoose(ctx.state, { player: ctx.player, zone: "play", what: "energy", uids: front.energy.slice(), min: 1, max: 1, effect: { op: "dropInPlay" } });
    },
  },
  /** Saffron City Gym: a basic Energy off one of your Pokémon that fits `who`, back to your hand. */
  takeBack: {
    ready: (ctx, { who }) => namedEnergy(ctx, who).length > 0,
    run(ctx, { who }) {
      askChoose(ctx.state, { player: ctx.player, zone: "play", what: "basicEnergy", uids: namedEnergy(ctx, who), min: 1, max: 1, effect: { op: "takeBack" } });
    },
  },
  /** Fuchsia City Gym: you may shuffle one of your Pokémon that fits `who`, and all attached to it, into your deck. */
  shuffleIn: {
    ready: (ctx, { who }) => whoSpots(ctx, who).length > 0,
    run(ctx, { who }) {
      askPick(ctx.state, { player: ctx.player, side: ctx.player, spots: whoSpots(ctx, who), left: 1, optional: true, effect: { op: "shuffleIn" } });
    },
  },
  /** Attack steps (js/tcg/effects.js) that waited for a choice the attack asked for. */
  fx: {
    ready: () => true,
    run: (ctx, step) => runFx(ctx, step),
  },
  /** Fossil Egg: a card that fits `what` from the hand onto the Bench, played as a Basic Pokémon. */
  handToBench: {
    ready: (ctx, { what }) => mine(ctx).bench.length < ctx.state.rules.bench && fitting(ctx, mine(ctx).hand, what).length > 0,
    run(ctx, { what }) {
      const uids = fitting(ctx, mine(ctx).hand, what);
      if (uids.length && mine(ctx).bench.length < ctx.state.rules.bench) askChoose(ctx.state, { player: ctx.player, zone: "hand", what, uids, min: 1, max: 1, effect: { op: "toBench", asBasic: true } });
    },
  },
  /**
   * Blaine: instead of the Energy card a turn from the hand, 2 Fire Energy cards from the hand onto 1 of your Pokémon
   * with Blaine in its name. Not where attaching from the hand would set something off against you.
   */
  blaine: {
    ready: (ctx) => !mine(ctx).energyUsed && energyFor(ctx, { zone: "hand", type: "Fire" }).length >= 2 && blaineSpots(ctx).length > 0,
    run(ctx) {
      const uids = energyFor(ctx, { zone: "hand", type: "Fire" }).slice(0, 2);
      const spots = blaineSpots(ctx);
      if (uids.length < 2 || !spots.length || mine(ctx).energyUsed) return;
      mine(ctx).energyUsed = true;
      askPick(ctx.state, { player: ctx.player, side: ctx.player, spots, left: 1, effect: { op: "attachHeld", uids, zone: "hand", left: true } });
    },
  },
  /** Strange Cave: a Pokémon of one of these names from the hand onto the Bench, played as a Basic Pokémon. */
  benchAs: {
    ready: (ctx, { names }) => mine(ctx).bench.length < ctx.state.rules.bench && byNames(ctx, names).length > 0,
    run(ctx, { names }) {
      askChoose(ctx.state, { player: ctx.player, zone: "hand", what: "pokemon", uids: byNames(ctx, names), min: 1, max: 1, effect: { op: "toBench", asBasic: true } });
    },
  },
  /** Grisham: heal n from each Pokémon, yours and your opponent's. */
  healBoth: {
    ready: (ctx) => [ctx.player, other(ctx.player)].some((p) => inPlay(ctx.state, p).some(([slot]) => healRoom(ctx.state, slot) > 0)),
    run(ctx, { n }) {
      for (const p of [ctx.player, other(ctx.player)]) {
        for (const [slot, spot] of inPlay(ctx.state, p)) {
          const healed = Math.min(healMore(ctx.state, n), healRoom(ctx.state, slot));
          if (!healed) continue;
          slot.damage -= healed;
          slot.healedOn = ctx.state.turn;
          ctx.events.push({ t: "heal", p, spot, n: healed });
        }
      }
    },
  },
  /** Tasty Rice Ball: n from your Active Pokémon, and n more for each card of this name in your discard pile (not this one). */
  healPerCopy: {
    ready: (ctx) => Boolean(mine(ctx).active) && healRoom(ctx.state, mine(ctx).active) > 0,
    run(ctx, { n, name }) {
      const slot = mine(ctx).active;
      if (!slot) return;
      const copies = mine(ctx).discard.filter((uid) => uid !== ctx.uid && defOf(ctx.state, uid, ctx.defs).name === name).length;
      const healed = Math.min(n * (1 + copies), healRoom(ctx.state, slot));
      slot.damage -= healed;
      if (healed) slot.healedOn = ctx.state.turn;
      ctx.events.push({ t: "heal", p: ctx.player, spot: ACTIVE, n: healed });
    },
  },
  /** Damage counters on your own Active Pokémon (Team Rocket's Venture Bomb's tails). */
  hurtActive: {
    ready: (ctx) => Boolean(mine(ctx).active),
    run(ctx, { n }) {
      const slot = mine(ctx).active;
      if (!slot) return;
      slot.damage += n;
      ctx.events.push({ t: "damage", p: ctx.player, spot: ACTIVE, n, self: true });
    },
  },
  /** A card for each of `of`: "foeMega" (their Mega Evolution Pokémon ex in play), "mine" with `what` (your Pokémon in play that fit). */
  drawEach: {
    ready: (ctx, step) => hasDeck(ctx) && eachCount(ctx, step) > 0,
    run: (ctx, step) => draw(ctx, ctx.player, eachCount(ctx, step)),
  },
  /** Hand Trimmer: discard from your own hand until it holds n (your choice of cards); nothing with n or fewer. */
  tossTo: {
    ready: (ctx, { n }) => mine(ctx).hand.length - held(ctx) > n,
    run(ctx, { n }) {
      const uids = mine(ctx).hand.slice();
      const k = uids.length - n;
      if (k > 0) askChoose(ctx.state, { player: ctx.player, zone: "hand", what: "any", uids, min: k, max: k, effect: { op: "discard" } });
    },
  },
  /** Accompanying Flute: the top n of their deck are revealed; any of their Basic Pokémon there onto their Bench, the rest shuffled back. */
  foeTopBench: {
    ready: (ctx) => theirs(ctx).deck.length > 0,
    run(ctx, { n }) {
      const side = theirs(ctx);
      const shown = side.deck.slice(0, n);
      ctx.events.push({ t: "reveal-deck", p: other(ctx.player), uids: shown });
      askChoose(ctx.state, { player: ctx.player, owner: other(ctx.player), zone: "deck", what: "basic", uids: fitting(ctx, shown, "basic"), min: 0, max: Math.max(0, ctx.state.rules.bench - side.bench.length), effect: { op: "toBench" }, seen: shown, shuffle: true });
    },
  },
  /** Love Ball: a Pokémon with the same name as 1 of your opponent's Pokémon in play. */
  sameName: {
    ready: hasDeck,
    run(ctx) {
      const names = inPlay(ctx.state, other(ctx.player)).map(([slot]) => defOf(ctx.state, slot.uid, ctx.defs).name);
      const uids = mine(ctx).deck.filter((uid) => {
        const def = defOf(ctx.state, uid, ctx.defs);
        return def.kind === "pokemon" && names.includes(def.name);
      });
      askChoose(ctx.state, { player: ctx.player, zone: "deck", what: "pokemon", uids, min: 0, max: 1, effect: { op: "toHand" }, shuffle: true });
    },
  },
  /** Perrin: search for up to as many cards as were just put into the deck (`paid`). */
  searchPaid: {
    ready: hasDeck,
    run(ctx, { what, paid = [] }) {
      if (!paid.length) return;
      askChoose(ctx.state, { player: ctx.player, zone: "deck", what, uids: fitting(ctx, mine(ctx).deck, what), min: 0, max: paid.length, effect: { op: "toHand" }, shuffle: true });
    },
  },
  /** Meddling Memo: they draw as many cards as their hand put on the bottom of their deck (handBottom's count). */
  foeDrawMoved: {
    ready: () => true,
    run: (ctx) => draw(ctx, other(ctx.player), ctx.moved || 0),
  },
  /** Megaton Blower: every Special Energy on their Pokémon, discarded. */
  dropFoeSpecial: {
    ready: (ctx) => open(ctx).some(([slot]) => slot.energy.some((uid) => isSpecial(ctx, uid))),
    run(ctx) {
      for (const [slot, spot] of open(ctx)) {
        const gone = slot.energy.filter((uid) => isSpecial(ctx, uid));
        if (!gone.length) continue;
        slot.energy = slot.energy.filter((uid) => !gone.includes(uid));
        theirs(ctx).discard.push(...gone);
        ctx.events.push({ t: "discard-energy", p: other(ctx.player), spot, uids: gone });
      }
    },
  },
  /** Redeemable Ticket: your Prize cards shuffled onto the bottom of your deck, then as many from the top become your Prize cards. */
  prizeSwap: {
    ready: (ctx) => mine(ctx).prizes.length > 0,
    run(ctx) {
      const side = mine(ctx);
      const k = side.prizes.length;
      const old = side.prizes.splice(0);
      shuffle(ctx.state, old);
      side.deck.push(...old);
      side.prizes.push(...side.deck.splice(0, k));
      ctx.events.push({ t: "prize-swap", p: ctx.player, n: k });
    },
  },
  /** Scramble Switch: any amount of Energy from the Pokémon just moved to the Bench onto the new Active Pokémon. */
  energyBackAll: {
    ready: () => true,
    run(ctx) {
      const at = switchedOut(ctx);
      if (!at || !at[0].energy.length || !mine(ctx).active) return;
      askChoose(ctx.state, { player: ctx.player, zone: "play", what: "energy", uids: at[0].energy.slice(), min: 0, max: at[0].energy.length, effect: { op: "carryEnergy", from: at[1], spots: [ACTIVE] } });
    },
  },
  /** "Flip 2 coins. If both of them are heads, ...". */
  flipAll: {
    ready: (ctx, { heads }) => heads.some((step) => !T_OPS[step.op].must && T_OPS[step.op].ready(ctx, step)),
    run(ctx, { coins, heads }) {
      const results = Array.from({ length: coins }, () => flip(ctx.state));
      ctx.events.push({ t: "flip", p: ctx.player, results });
      if (results.every(Boolean)) runTrainer(heads, ctx);
    },
  },
  /** Brilliant Blender: up to n cards from the deck to the discard pile, then the deck is shuffled. */
  searchMill: {
    ready: hasDeck,
    run(ctx, { n, what = "any" }) {
      askChoose(ctx.state, { player: ctx.player, zone: "deck", what, uids: fitting(ctx, mine(ctx).deck, what), min: 0, max: n, effect: { op: "millChosen" }, shuffle: true });
    },
  },
  /** Energy Swatter: their hand is revealed, and you put an Energy card from it on the bottom of their deck. */
  foeHandEnergyBottom: {
    ready: (ctx) => theirs(ctx).hand.length > 0,
    run(ctx) {
      const hand = theirs(ctx).hand.slice();
      ctx.events.push({ t: "reveal-hand", p: other(ctx.player), uids: hand });
      askChoose(ctx.state, { player: ctx.player, owner: other(ctx.player), zone: "hand", what: "energy", uids: fitting(ctx, hand, "energy"), min: 1, max: 1, effect: { op: "toBottom" }, seen: hand });
    },
  },
  /** A protection on 1 of your Pokémon until the end of your opponent's next turn (`mark` as engine.js marks read it). */
  markOne: {
    ready: (ctx) => inPlay(ctx.state, ctx.player).length > 0,
    run(ctx, { mark }) {
      askPick(ctx.state, { player: ctx.player, side: ctx.player, spots: inPlay(ctx.state, ctx.player).map(([, spot]) => spot), left: 1, effect: { op: "mark", mark: { ...mark, turn: ctx.state.turn + 1 } } });
    },
  },
  /** Briar: more Prize cards this turn for a Knock Out of their Active Pokémon by an attack from one of yours that fits `who`. */
  prizeUp: {
    ready: () => true,
    run(ctx, { n, who }) {
      ctx.state.prizeUp = [...(ctx.state.prizeUp || []).filter((b) => b.turn === ctx.state.turn), { p: ctx.player, turn: ctx.state.turn, n, who }];
    },
  },
  /** "Put an Energy attached to your opponent's Active Pokémon into their hand": their Active Pokémon only. */
  /** "Switch a card from your hand with the top card of your deck." */
  swapTop: {
    ready: (ctx) => mine(ctx).hand.length - held(ctx) > 0 && hasDeck(ctx),
    run(ctx) {
      const uids = mine(ctx).hand.filter((uid) => uid !== ctx.uid);
      if (uids.length) askChoose(ctx.state, { player: ctx.player, zone: "hand", what: "any", uids, min: 1, max: 1, effect: { op: "swapTop" } });
    },
  },
  hammerActive: {
    ready: (ctx) => frontOpen(ctx) && theirs(ctx).active.energy.length > 0,
    run(ctx) {
      const slot = theirs(ctx).active;
      if (!slot || !slot.energy.length || !frontOpen(ctx)) return;
      askChoose(ctx.state, { player: ctx.player, owner: other(ctx.player), zone: "play", what: "energy", uids: slot.energy.slice(), min: 1, max: 1, effect: { op: "takeBack" } });
    },
  },
};

/** What drawEach counts. */
function eachCount(ctx, { of = "mine", what = "pokemon" }) {
  if (of === "foeMega") return inPlay(ctx.state, other(ctx.player)).filter(([slot]) => fits(defOf(ctx.state, slot.uid, ctx.defs), "mega")).length;
  return inPlay(ctx.state, ctx.player).filter(([slot]) => fits(defOf(ctx.state, slot.uid, ctx.defs), what)).length;
}

/** Leave a choice between options a card offers (see the engine's `option` action). */
function askOption(ctx, player, prompt, offers) {
  ctx.state.pending.push({ type: "option", player, prompt, labels: offers.map((o) => o.label), options: offers.map((o) => o.steps) });
}
/** Blaine's Pokémon that may take Energy from the hand now, with nothing on the field that answers an attachment. */
const blaineSpots = (ctx) => {
  const { state } = ctx;
  if (inPlay(state, other(ctx.player)).some(([slot]) => abilityHas(state, slot, ctx.defs, "foeAttach"))) return [];
  return whoSpots(ctx, { named: "Blaine" }).filter((spot) => !(slotAt(state, ctx.player, spot).marks || []).some((m) => ["noEnergy", "attachEnds"].includes(m.kind) && m.turn === state.turn));
};
/** A card that evolves from a Pokémon of this name ("a later-Stage card that matches that Pokémon"). */
const evolvesOnto = (def, name) => def?.kind === "pokemon" && def.stage === "evolution" && def.evolvesFrom === name;
/** Pokémon Breeder Fields: your non-Baby Pokémon that can evolve (a Basic Pokémon or a Stage 1). */
const breederSpots = (ctx) =>
  inPlay(ctx.state, ctx.player)
    .filter(([slot]) => {
      const def = defOf(ctx.state, slot.uid, ctx.defs);
      return !(def.tags || []).includes("Baby") && (def.stage === "basic" || def.line === 1);
    })
    .map(([, spot]) => spot);
/** A borrowed card isn't in the hand: a price of "other cards" doesn't leave one out for it. */
const borrowSteps = (fx) => fx.map((step) => (step.op === "cost" ? { ...step, spare: 0 } : step));
/**
 * Sabrina's Psychic Control: the opponent's discarded Trainers that aren't put in play and would do something now.
 * Asked before this card is played (it is still in the hand, which the usual checks allow for), or after (`played`).
 */
const borrowable = (ctx, played) =>
  theirs(ctx).discard.filter((uid) => {
    const def = defOf(ctx.state, uid, ctx.defs);
    if (def?.kind !== "trainer" || !def.playable || !["item", "supporter"].includes(def.sub) || def.fossil || def.tm) return false;
    if (def.fx.some((step) => ["hold", "tm", "psychic"].includes(step.op))) return false;
    if (!played) return !trainerBlock(ctx.state, ctx.player, def, ctx.defs);
    if (def.sub === "supporter" && mine(ctx).supporterUsed) return false;
    return trainerReady(borrowSteps(def.fx), ctx);
  });
/** The Pokémon a switch this turn sent to the Bench, as [slot, spot], if it is still there. */
const switchedOut = (ctx) => {
  const done = ctx.state.switched;
  if (!done || done.p !== ctx.player || done.turn !== ctx.state.turn) return null;
  const spot = mine(ctx).bench.findIndex((slot) => slot.uid === done.uid);
  return spot >= 0 ? [mine(ctx).bench[spot], spot] : null;
};
/** Players whose Active Pokémon may be Confused this way (theirs not kept off this card's effects). */
const confusable = (ctx, { notType = "" }) =>
  [ctx.player, other(ctx.player)].filter((p) => {
    const slot = ctx.state.players[p].active;
    if (!slot || (notType && defOf(ctx.state, slot.uid, ctx.defs).types.includes(notType))) return false;
    return p === ctx.player || !warded(ctx.state, slot, ctx, ctx.defs);
  });
/** Where a Technical Machine may go: one of your Pokémon that fits it and holds no Technical Machine yet. */
const tmSpots = (ctx, { only = {} }) =>
  inPlay(ctx.state, ctx.player)
    .filter(([slot]) => {
      const def = defOf(ctx.state, slot.uid, ctx.defs);
      return !(slot.held || []).some((h) => h.tm) && (!only.evolved || def.stage === "evolution") && (!only.types || only.types.some((t) => def.types.includes(t)));
    })
    .map(([, spot]) => spot);
const abilityHas = (state, slot, defs, key) => Boolean(abilityOn(state, slot, defs)?.[key]);
const withMine = (ctx) => inPlay(ctx.state, ctx.player).filter(([slot]) => slot.energy.length).map(([, spot]) => spot);
const liftSpots = (ctx, who) => inPlay(ctx.state, ctx.player).filter(([slot]) => fits(defOf(ctx.state, slot.uid, ctx.defs), who)).map(([, spot]) => spot);
const plainBasics = (ctx) => inPlay(ctx.state, ctx.player).filter(([slot]) => !slot.under.length && defOf(ctx.state, slot.uid, ctx.defs).stage === "basic").map(([, spot]) => spot);
const sabrinaSpots = (ctx, who) => {
  const named = inPlay(ctx.state, ctx.player).filter(([slot]) => fieldFits(who, defOf(ctx.state, slot.uid, ctx.defs)));
  return named.length > 1 ? named.filter(([slot]) => slot.energy.length).map(([, spot]) => spot) : [];
};
/**
 * Who a heal may reach: the hurt ones (with `cure`, those with a Special Condition too), narrowed by `has` (an Energy
 * of that type attached), `noEx`, `who` (as fits reads it), and `pay` (it must hold an Energy to discard, unless `ifHealed`).
 */
function healable(ctx, step) {
  const { to = "", cure = false, whoType = "", has = "", noEx = false, who = "", notWho = "", pay = "", ifHealed = false, lowHp = 0, energyMin = 0 } = step;
  return (cure ? careSpots(ctx) : healSpots(ctx, to, whoType)).filter((spot) => {
    const slot = slotAt(ctx.state, ctx.player, spot);
    const def = defOf(ctx.state, slot.uid, ctx.defs);
    if (has && !energyOf(ctx.state, slot, ctx.defs).some((unit) => unit === has || unit === "Any" || unit.split("|").includes(has))) return false;
    if (noEx && def.box === "ex") return false;
    if (who && !fits(def, who)) return false;
    if (notWho && fits(def, notWho)) return false;
    // "1 of your Pokémon that has 30 HP or less remaining", "your Active Pokémon that has 3 or more Energy attached".
    if (lowHp && hpLeft(ctx.state, slot, ctx.defs) > lowHp) return false;
    if (energyMin && slot.energy.length < energyMin) return false;
    if (pay && !ifHealed && !slot.energy.some((uid) => { const e = defOf(ctx.state, uid, ctx.defs); return e.kind === "energy" && (pay === "energy" || e.provides.includes(pay.split(":")[1])); })) return false;
    return true;
  });
}

/** "Put 1 of your Pokémon into your hand": never the last one you have in play. */
const bounceSpots = (ctx, { basicOnly = false, hurt: damaged = false }) => {
  const all = inPlay(ctx.state, ctx.player);
  if (all.length < 2) return [];
  return all.filter(([slot]) => (!basicOnly || (!slot.under.length && defOf(ctx.state, slot.uid, ctx.defs).stage === "basic")) && (!damaged || slot.damage > 0)).map(([, spot]) => spot);
};

/**
 * More damage this attack does to the Active Pokémon: from Trainers played this turn, and the attacker's Tool.
 * `after`: the old wording that adds it after Weakness and Resistance, and only if the attack does damage (Misty).
 */
export function boostOf(state, player, slot, target, defs, after = false) {
  const mine = defOf(state, slot.uid, defs);
  const box = defOf(state, target.uid, defs).box;
  const counts = (b) => fieldFits(b.who || {}, mine) && (!(b.vs || []).length || b.vs.includes(box)) && (!b.uid || b.uid === slot.uid);
  const played = (state.boosts || []).filter((b) => b.p === player && b.turn === state.turn && Boolean(b.after) === after && counts(b));
  // Only on a Pokémon the Tool works for (Brave Bangle: one without a Rule Box; Light Ball: Pikachu ex).
  const tool = (!after && toolOn(state, slot, defs)?.plusVs) || null;
  return played.reduce((n, b) => n + (b.n || 0), 0) + (tool && counts(tool) ? tool.n : 0);
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
  if (when.lostWho && !(me.lostWho || []).some((d) => d.turn === ctx.state.turn - 1 && fits(defOf(ctx.state, d.uid, ctx.defs), when.lostWho))) return false;
  if (when.first && ctx.state.turn > 2) return false;
  if (when.second && ctx.state.turn !== 2) return false;
  if (when.alone && (me.bench.length || !me.active)) return false;
  if (when.moved && !ctx.moved) return false;
  if (when.myStadium && ctx.state.stadium?.owner !== ctx.player) return false;
  if (when.deck && !me.deck.length) return false;
  // "If they played a Supporter card from their hand this turn" (side.played: the Trainers played from the hand this turn).
  if (when.played && !(me.played || []).some((uid) => fits(defOf(ctx.state, uid, ctx.defs), when.played))) return false;
  if (when.stadiumWord && !(ctx.state.stadium && defOf(ctx.state, ctx.state.stadium.uid, ctx.defs).name.includes(when.stadiumWord))) return false;
  if (when.tera && !inPlay(ctx.state, ctx.player).some(([slot]) => defOf(ctx.state, slot.uid, ctx.defs).tera)) return false;
  // "If you have any Grass Mega Evolution Pokémon ex in play", "If you have Moltres and Zapdos in play".
  if (when.inPlay && !inPlay(ctx.state, ctx.player).some(([slot]) => fits(defOf(ctx.state, slot.uid, ctx.defs), when.inPlay))) return false;
  if (when.names && !when.names.every((name) => inPlay(ctx.state, ctx.player).some(([slot]) => defOf(ctx.state, slot.uid, ctx.defs).name === name))) return false;
  // An Ability's own Pokémon: "if this Pokémon has any Darkness Energy attached".
  if (when.selfEnergy) {
    const slot = ctx.spot == null ? null : slotAt(ctx.state, ctx.player, ctx.spot);
    const units = slot ? energyOf(ctx.state, slot, ctx.defs) : [];
    const t = when.selfEnergy;
    if (!(t === "any" ? units.length : units.some((u) => u === t || u === "Any" || u.split("|").includes(t)))) return false;
  }
  // "If all of your Pokémon in play are Team Rocket's Pokémon".
  if (when.allNamed && !inPlay(ctx.state, ctx.player).every(([slot]) => fits(defOf(ctx.state, slot.uid, ctx.defs), `name^${when.allNamed}`))) return false;
  // "If you have more than 7 cards (including this one) in your hand, you can't play this card."
  if (when.handMax != null && me.hand.length > when.handMax) return false;
  // "Then, if you have 10 or more cards in your hand" (asked once the card is played).
  if (when.handMin != null && me.hand.length < when.handMin) return false;
  if (when.notInDiscard && me.discard.some((uid) => defOf(ctx.state, uid, ctx.defs).name === when.notInDiscard)) return false;
  // "If you don't have any Stage 2 Evolved Pokémon in play".
  if (when.noStage2 && inPlay(ctx.state, ctx.player).some(([slot]) => defOf(ctx.state, slot.uid, ctx.defs).line === 2)) return false;
  if (when.foeHandIs != null && foe.hand.length !== when.foeHandIs) return false;
  // "As long as you have at least 1 other Bouffalant in play": that many by the name, this one among them.
  if (when.nameCount && inPlay(ctx.state, ctx.player).filter(([slot]) => defOf(ctx.state, slot.uid, ctx.defs).name === when.nameCount.name).length < when.nameCount.n) return false;
  if (when.foeDiscardWord && !foe.discard.some((uid) => defOf(ctx.state, uid, ctx.defs).name.includes(when.foeDiscardWord))) return false;
  if (when.foeActive && !(foe.active && fits(defOf(ctx.state, foe.active.uid, ctx.defs), when.foeActive))) return false;
  if (when.sameHand && me.hand.length !== foe.hand.length) return false;
  if (when.selfHpMax != null) {
    const slot = ctx.spot == null ? null : slotAt(ctx.state, ctx.player, ctx.spot);
    if (!slot || hpLeft(ctx.state, slot, ctx.defs) > when.selfHpMax) return false;
  }
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
  m = words.match(/^any of your ((?:Team Rocket|[A-Z][a-zé]*(?: [A-Z][a-zé]*)?)'s) Pokémon were Knocked Out during your opponent's last turn$/);
  if (m) return { lostWho: `name^${m[1]}` };
  if (/^it's your first turn$/.test(words)) return { first: true };
  if (/^you go second(?: and it's your first turn|, and only during your first turn)$/.test(words)) return { second: true };
  if (/^your Active Pokémon is your only Pokémon in play$/.test(words)) return { alone: true };
  if (/^you have a Stadium in play$/.test(words)) return { myStadium: true };
  if (/^you have any Tera Pokémon in play$/.test(words)) return { tera: true };
  m = words.match(/^you have any (.+?) in play$/);
  if (m && whatOf(m[1])) return { inPlay: whatOf(m[1]) };
  // Pokémon by name: "if you have Articuno and Zapdos in play".
  m = words.match(/^you have ([A-Z][^,]*?(?:(?:, and |, | and )[A-Z][^,]*?)*) in play$/);
  if (m) {
    const names = m[1].split(/, and |, | and /);
    if (names.every((name) => /^[A-Z][\w.'é-]*(?: [A-Z][\w.'é-]*)?$/.test(name) && !/Pokémon/.test(name))) return { names };
  }
  if (/^you have no cards in your hand$/.test(words)) return { handMax: 0 };
  m = words.match(/^this Pokémon's remaining HP is (\d+) or less$/);
  if (m) return { selfHpMax: Number(m[1]) };
  m = words.match(new RegExp(`^this Pokémon has any (?:(${TYPE_WORD}) )?Energy attached$`));
  if (m) return { selfEnergy: m[1] || "any" };
  m = words.match(/^you played ([A-Z][\w.'é -]+?) from your hand this turn$/);
  if (m) return { played: `trainer=${m[1]}` };
  if (/^it is the last card in your hand$/.test(words)) return { handMax: 1 };
  // An Ability's terms: the other player's hand and discard pile, their Active Pokémon, the two hands alike.
  m = words.match(/^your opponent has exactly (\d+) cards in their hand$/);
  if (m) return { foeHandIs: Number(m[1]) };
  m = words.match(/^your opponent has any cards in their discard pile that have "([^"]+)" in the name$/);
  if (m) return { foeDiscardWord: m[1] };
  if (/^your opponent's Active Pokémon is a Pokémon ex$/.test(words)) return { foeActive: "box=ex" };
  if (/^you have the same number of cards in your hand as your opponent$/.test(words)) return { sameHand: true };
  return null;
}

const N = "(\\d+|an?|one|two|three|four|five|six|seven|eight)";
const SHUFFLE_BOTH = "Each player shuffles (?:their|his or her) hand into (?:their|his or her) deck";

/** [wording, steps]. */
const TYPE_WORD = "Grass|Fire|Water|Lightning|Psychic|Fighting|Darkness|Metal|Fairy|Dragon|Colorless";
const PATTERNS = [
  [/^Choose a Pokémon ex in your discard pile that has "([A-Z][\w'é.-]*)" in its name, and switch it with 1 of your Pokémon ex in play that has "\1" in its name\. Any attached cards, damage counters, Special Conditions, turns in play, and any other effects remain on the new Pokémon\.$/, (m) => [{ op: "swapPlay", what: `box=ex~${m[1]}` }]],
  [/^During your opponent's next turn, their Poisoned Pokémon can't retreat\. \(This includes newly Poisoned Pokémon\.\)$/, () => [{ op: "poisonPin" }]],
  [new RegExp(`^Draw ${N} cards?\\.$`, "i"), (m) => [{ op: "draw", n: count(m[1]) }]],
  [/^Discard your hand and draw (\d+) cards\.$/, (m) => [{ op: "discardHand" }, { op: "draw", n: Number(m[1]) }]],
  [/^Discard your hand, then draw (\d+) cards\.$/, (m) => [{ op: "discardHand" }, { op: "draw", n: Number(m[1]) }]],
  [new RegExp(`^Shuffle your hand into your deck\\. Then, draw ${N} cards?\\.$`, "i"), (m) => [{ op: "shuffleHand" }, { op: "draw", n: count(m[1]) }]],
  [new RegExp(`^Shuffle your hand into your deck,? then draw ${N} cards?\\.$`, "i"), (m) => [{ op: "shuffleHand" }, { op: "draw", n: count(m[1]) }]],
  [new RegExp(`^${SHUFFLE_BOTH} and draws ${N} cards?\\.$`, "i"), (m) => [{ op: "shuffleHand", both: true }, { op: "draw", n: count(m[1]) }, { op: "foeDraw", n: count(m[1]) }]],
  [new RegExp(`^${SHUFFLE_BOTH}\\. Then, each player draws ${N} cards?\\.$`, "i"), (m) => [{ op: "shuffleHand", both: true }, { op: "draw", n: count(m[1]) }, { op: "foeDraw", n: count(m[1]) }]],
  [/^Shuffle your hand into your deck\. Then, draw a card for each card in your opponent's hand\.$/, () => [{ op: "shuffleHand" }, { op: "drawPerFoeHand" }]],
  [/^Draw cards until you have (\d+) cards in your hand\.$/, (m) => [{ op: "drawTo", n: Number(m[1]) }]],
  [/^Flip a coin until you get tails\. For each heads, draw a card\.$/, () => [{ op: "flipDraw" }]],
  [/^Heal (\d+) damage from 1 of your Pokémon\.$/, (m) => [{ op: "heal", n: Number(m[1]) }]],
  [/^Remove (\d+) damage counters? from 1 of your Pokémon(?: \((?:remove )?\d+(?: damage counters?)? if that Pokémon has only \d+\))?\.$/, (m) => [{ op: "heal", n: Number(m[1]) * 10 }]],
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
  // Pre-made decks, old and new wordings.
  [new RegExp(`^Draw ${N} more cards?\\.$`, "i"), (m) => [{ op: "draw", n: count(m[1]) }]],
  [/^Draw (\d+) cards from the bottom of your deck\.$/, (m) => [{ op: "draw", n: Number(m[1]), bottom: true }]],
  [/^Flip a coin\. If heads, draw the bottom (\d+) cards of your deck\. If tails, draw the top (\d+) cards of your deck\.$/, (m) => [{ op: "flip", heads: [{ op: "draw", n: Number(m[1]), bottom: true }], tails: [{ op: "draw", n: Number(m[2]) }] }]],
  [/^Shuffle your hand into your deck(?: and flip a coin|\. Flip a coin)\. If heads, draw (\d+) cards\. If tails, draw (\d+) cards?\.$/, (m) => [{ op: "shuffleHand" }, { op: "flip", heads: [{ op: "draw", n: Number(m[1]) }], tails: [{ op: "draw", n: Number(m[2]) }] }]],
  [/^Shuffle your hand into your deck\. Then, draw (\d+) cards\. If (.+?), draw (\d+) more cards\.$/, (m) => when(m[2], (w) => [{ op: "shuffleHand" }, { op: "draw", n: Number(m[1]) }, { op: "draw", n: Number(m[3]), when: w }])],
  [/^Shuffle your hand into your deck\. Then, draw (\d+) cards\. You can't play any more Trainer cards this turn\.$/, (m) => [{ op: "shuffleHand" }, { op: "draw", n: Number(m[1]) }, { op: "noTrainers" }]],
  [/^Draw cards until you have (\d+) cards in your hand\. Your turn ends\.$/, (m) => [{ op: "drawTo", n: Number(m[1]) }, { op: "endTurn" }]],
  [/^Draw a card\. If you don't have any Stage 2 Evolved Pokémon in play, draw 2 more cards\.$/, () => [{ op: "draw", n: 1 }, { op: "draw", n: 2, when: { noStage2: true } }]],
  [/^Draw (\d+) cards\. (?:Then,? )?discard (?:any 1 card|a card) from your hand\.( If you have no cards in your deck, you can't play this card\.)?$/, (m) => [{ op: "draw", n: Number(m[1]), ...(m[2] ? { need: true } : {}) }, { op: "toss", n: 1 }]],
  [/^Draw (\d+) cards\. Your opponent may (?:also )?draw a card\.$/, (m) => [{ op: "draw", n: Number(m[1]) }, { op: "drawUpTo", n: 1, who: "foe" }]],
  [/^You may draw up to (\d+) cards, then your opponent may draw up to (\d+) cards\.$/, (m) => [{ op: "drawUpTo", n: Number(m[1]) }, { op: "drawUpTo", n: Number(m[2]), who: "foe" }]],
  [/^Draw a number of cards up to the number of your opponent's Pokémon in play\. If you have more than (\d+) cards \(including this one\) in your hand, you can't play this card\.$/, (m) => [{ op: "only", when: { handMax: Number(m[1]) } }, { op: "drawUpTo", of: "foeInPlay" }]],
  [/^You can't play this card if you have (\d+) or more cards in your hand \(including this one\)\. Draw cards until you have exactly (\d+) cards in your hand\.$/, (m) => [{ op: "only", when: { handMax: Number(m[1]) - 1 } }, { op: "drawTo", n: Number(m[2]) }]],
  [/^Draw cards until you have the same number of cards in your hand as your opponent\.$/, () => [{ op: "drawFor", of: "foeHand" }]],
  [/^Shuffle your hand into your deck\. Then, draw a number of cards equal to the number of Benched Pokémon \(both yours and your opponent's\)\.$/, () => [{ op: "shuffleHand" }, { op: "drawFor", of: "benches" }]],
  [/^Draw (\d+) cards\. Then, choose a card from your opponent's hand without looking and put it on the bottom of (?:his or her|their) deck\.$/, (m) => [{ op: "draw", n: Number(m[1]) }, { op: "foeRandomBottom", n: 1 }]],
  [/^Draw (\d+) cards\. Then, your opponent discards a card from (?:his or her|their) hand\.$/, (m) => [{ op: "draw", n: Number(m[1]) }, { op: "foeToss", n: 1 }]],
  [/^Draw (\d+) cards\. Then, flip a coin\. If heads, if you played this Kahili from your hand, put this card into your hand instead of the discard pile\. If you have no cards in your deck, you can't play this card\.$/, (m) => [{ op: "draw", n: Number(m[1]), need: true }, { op: "flip", heads: [{ op: "keepCard" }] }]],
  [/^Draw (\d+) cards\. As long as Buck's Training is next to your Active Pokémon, each of your Active Pokémon's attacks does (\d+) more damage to the Active Pokémon \(before applying Weakness and Resistance\)\.$/, (m) => [{ op: "draw", n: Number(m[1]) }, { op: "boost", n: Number(m[2]) }]],
  [/^Each player shuffles (?:his or her|their) hand into (?:his or her|their) deck and draws a new hand of the same number of cards\.$/, () => [{ op: "freshHands" }]],
  [/^Each player shuffles (?:his or her|their) hand into (?:his or her|their) deck\. Then, draw (\d+) cards\. Your opponent draws (\d+) cards\.$/, (m) => [{ op: "shuffleHand", both: true }, { op: "draw", n: Number(m[1]) }, { op: "foeDraw", n: Number(m[2]) }]],
  [/^You and your opponent show each other your hands, then shuffle all the Trainer cards from your hands into your decks\.$/, () => [{ op: "trainersBack" }]],
  [/^Each player either draws or discard cards until (?:he or she has|they have) (\d+) cards in (?:his or her|their) hand\. \(Your opponent does this first\.\)$/, (m) => [{ op: "evenHand", n: Number(m[1]), who: "foe" }, { op: "evenHand", n: Number(m[1]) }]],
  [/^Choose 1 card in your hand and shuffle the rest of your cards into your deck\. Then, draw (\d+) cards\. \(If this is the only card in your hand, you can't play this card\.\)$/, (m) => [{ op: "keepOne" }, { op: "draw", n: Number(m[1]) }]],
  [/^If you have any cards in your hand, shuffle 1 of them into your deck, then draw (\d+) cards\.$/, (m) => [{ op: "stash", n: 1, need: true }, { op: "draw", n: Number(m[1]) }]],
  [/^Put as many cards from your hand as you like on the bottom of your deck in any order\. Then, draw a card for each card you put on the bottom of your deck\.$/, () => [{ op: "stash", n: "all", at: "bottom", upTo: true, pass: true, need: true }, { op: "drawPaid", per: 1 }]],
  // Discards that decide the draw.
  [/^Discard up to 2 cards from your hand\. If you discard 1 card, draw (\d+) cards\. If you discard 2 cards, draw (\d+) cards\.$/, (m) => [{ op: "toss", n: 2, upTo: true, pass: true, need: true }, { op: "drawPaid", table: [0, Number(m[1]), Number(m[2])] }]],
  [/^Discard up to 2 basic Energy cards from your hand\. If you discarded 1 basic Energy card, draw (\d+) cards\. If you discarded 2 basic Energy cards, draw (\d+) cards\.$/, (m) => [{ op: "toss", n: 2, what: "basicEnergy", upTo: true, pass: true, need: true }, { op: "drawPaid", table: [0, Number(m[1]), Number(m[2])] }]],
  [/^Discard up to (\d+) cards from your hand, and draw (\d+) cards for each card you discarded in this way\.$/, (m) => [{ op: "toss", n: Number(m[1]), upTo: true, pass: true, need: true }, { op: "drawPaid", per: Number(m[2]) }]],
  [/^Discard any number of other cards from your hand, then flip a coin\. If heads, draw twice that many cards\.$/, () => [{ op: "toss", n: "all", upTo: true, pass: true, need: true }, { op: "drawPaid", per: 2, flip: true }]],
  [/^Look at your opponent's hand\. Then, you may discard as many other cards as you want from your hand and draw that many cards\.$/, () => [{ op: "toss", n: "all", upTo: true, pass: true, seen: true }, { op: "drawPaid", per: 1 }]],
  [/^You may discard any number of cards from your hand\. Then, draw cards until you have (\d+) cards in your hand\. If you can't draw any cards in this way, you can't play this card\.$/, (m) => [{ op: "toss", n: "all", upTo: true }, { op: "drawPaid", to: Number(m[1]), spare: 99 }]],
  [/^You may discard a card from your hand\. Then, draw cards until you have (\d+) cards in your hand\. \(If you can't draw any cards, you can't play this card\.\)$/, (m) => [{ op: "toss", n: 1, upTo: true }, { op: "drawPaid", to: Number(m[1]), spare: 1 }]],
  [/^Discard a card from your hand\. (?:If you can't discard a card from your hand, you can't play this card\. )?(?:Then,? )?[Dd]raw (\d+) cards\. If you discarded a Pokémon that has (δ on its card|Dark or Rocket's in its name), draw (\d+) cards instead\.$/, (m) => [{ op: "cost", n: 1, pass: true }, { op: "drawPaid", n: Number(m[1]), bonus: { what: /δ/.test(m[2]) ? "pokemon~δ" : "pokemon~Dark|pokemon~Rocket's", n: Number(m[3]) } }]],
  [/^Discard any 1 Pokémon from your hand\. Then draw (\d+) cards\. If you discarded a Pokémon with (Team Magma|Team Aqua) in its name, draw (\d+) cards instead\.$/, (m) => [{ op: "cost", n: 1, what: "pokemon", pass: true }, { op: "drawPaid", n: Number(m[1]), bonus: { what: `pokemon~${m[2]}`, n: Number(m[3]) } }]],
  [/^Discard a card from your hand\. If you do, draw (\d+) cards\. If you discarded an Energy card in this way, draw (\d+) more cards\.$/, (m) => [{ op: "cost", n: 1, pass: true }, { op: "drawPaid", n: Number(m[1]), bonus: { what: "energy", n: Number(m[1]) + Number(m[2]) } }]],
  [/^Discard an Energy card from your hand\. Then, draw (\d+) cards\.$/, (m) => [{ op: "cost", n: 1, what: "energy" }, { op: "draw", n: Number(m[1]) }]],
  [/^Discard a card from your hand in order to play this card\. (.+)$/, (m) => { const rest = compileTrainer(m[1]); return rest && [{ op: "cost", n: 1 }, ...rest]; }],
  [/^Discard a Team Plasma card from your (?:hand|card)\. \(if you can't discard a Team Plasma card, you can't play this card\.\) Draw (\d+) cards\.$/i, (m) => [{ op: "cost", n: 1, what: "any+Team Plasma" }, { op: "draw", n: Number(m[1]) }]],
  // Blaine (Gym Challenge).
  [/^During this turn, instead of attaching your free Energy card, you may instead attach 2 Fire Energy cards to 1 of your Pokémon with Blaine in its name\. \(Playing additional copies of this card this turn has no effect\.\)$/, () => [{ op: "blaine" }]],
  // Fossil Egg.
  [/^Flip a coin\. If heads, search your deck for a card that evolves from Mysterious Fossil and put it onto your Bench or put a card that evolves from Mysterious Fossil from your hand onto your Bench\. Either way, treat the new card as a Basic Pokémon\. If you searched your deck, shuffle it\. \(You can't play this card if your Bench is full\.\)$/, () => {
    const what = "pokemon<Mysterious Fossil";
    return [{ op: "flip", need: true, heads: [{ op: "choice", prompt: "Put it onto your Bench from where?", options: [{ label: "Your deck", steps: [{ op: "search", what, n: 1, to: "bench", asBasic: true }] }, { label: "Your hand", steps: [{ op: "handToBench", what }] }] }] }];
  }],
  // Challenge!
  [/^Ask your opponent if he or she accepts your challenge\. If your opponent declines \(or if both Benches are full\), draw 2 cards\. If your opponent accepts, each of you searches your decks for any number of Basic Pokémon cards and puts them face down onto your Benches\. \(A player can't do this if his or her Bench is full\.\) When you both have finished, shuffle your decks and turn those cards face up\.$/, () => [{ op: "challenge" }]],
  // Pokémon Breeder Fields.
  [/^Flip a coin for 1 or 2 of your non-Baby Pokémon that can evolve\. For each heads, search your deck for a later-Stage card that matches that Pokémon\. Then put that card into your hand\. Shuffle your deck afterward\.$/, () => [{ op: "breeder" }]],
  // Sabrina's Psychic Control.
  [/^Flip a coin\. If heads, choose a Trainer card in your opponent's discard pile that isn't put in play \(like PlusPower or Mysterious Fossil\)\. You may use that card as if it were in your hand, if you do everything required in order to play that card \(like discarding cards\)\. The card stays in your opponent's discard pile\.$/, () => [{ op: "psychic" }]],
  // Kieran's second choice: ex and V.
  [/^During this turn, attacks used by your Pokémon do (\d+) more damage to your opponent's Active Pokémon ex and Active Pokémon V \(before applying Weakness and Resistance\)\.$/, (m) => [{ op: "boost", n: Number(m[1]), vs: ["ex", "V", "VMAX", "VSTAR"] }]],
  // Team Rocket's Giovanni.
  [/^Switch your Active ((?:Team Rocket|[A-Z][a-zé]*(?: [A-Z][a-zé]*)?)'s) Pokémon with 1 of your Benched \1 Pokémon\. If you do, switch in 1 of your opponent's Benched Pokémon to the Active Spot\.$/, (m) => [{ op: "switch", who: `name^${m[1]}`, need: true }, { op: "gust" }]],
  // Team Rocket's Ariana.
  [/^Draw cards until you have (\d+) cards in your hand\. If all of your Pokémon in play are ((?:Team Rocket|[A-Z][a-zé]*(?: [A-Z][a-zé]*)?)'s) Pokémon, draw cards until you have (\d+) cards in your hand instead\.$/, (m) => [{ op: "drawTo", n: Number(m[1]), when: { not: { allNamed: m[2] } } }, { op: "drawTo", n: Number(m[3]), when: { allNamed: m[2] } }]],
  // N's PP Up.
  [/^Attach a Basic Energy card from your discard pile to 1 of your Benched ((?:Team Rocket|[A-Z][a-zé]*(?: [A-Z][a-zé]*)?)'s) Pokémon\.$/, (m) => [{ op: "attachPick", zone: "discard", what: "basicEnergy", to: "bench", who: `name^${m[1]}`, n: 1 }]],
  // Ciphermaniac's Codebreaking.
  [/^Search your deck for (\d+) cards, shuffle your deck, then put those cards on top of it in any order\.$/, (m) => [{ op: "search", what: "any", n: Number(m[1]), to: "top" }]],
  // Eri.
  [/^Your opponent reveals their hand, and you discard up to (\d+) Item cards you find there\.$/, (m) => [{ op: "foeHandDiscard", what: "item", n: Number(m[1]) }]],
  // Crispin.
  [/^Search your deck for up to 2 Basic Energy cards of different types, reveal them, and put 1 of them into your hand\. Attach the other to 1 of your Pokémon\. Then, shuffle your deck\.$/, () => [{ op: "crispin" }, { op: "crispinAttach" }]],
  // Amarys.
  [/^Draw (\d+) cards\. At the end of this turn, if you have (\d+) or more cards in your hand, discard your hand\.$/, (m) => [{ op: "draw", n: Number(m[1]) }, { op: "handLimit", n: Number(m[2]) }]],
  // Lt. Surge's Bargain.
  [/^Ask your opponent if each player may take a Prize card\. If yes, each player takes a Prize card\. If no, you draw (\d+) cards\.$/, (m) => [{ op: "bargain", draw: Number(m[1]) }]],
  // Janine's Secret Art.
  [new RegExp(`^Choose up to (\\d+) of your (${TYPE_WORD}) Pokémon\\. For each of those Pokémon, search your deck for a Basic \\2 Energy card and attach it to that Pokémon\\. Then, shuffle your deck\\. If you attached Energy to your Active Pokémon in this way, it is now Poisoned\\.$`), (m) => [{ op: "energyEach", zone: "deck", what: `basicEnergy:${m[2]}`, where: { whoType: m[2] }, n: Number(m[1]), poison: true }]],
  // Glass Trumpet: "Choose up to 2 of your Benched Colorless Pokémon and attach a Basic Energy card from your discard pile to each of them."
  [new RegExp(`^Choose up to (\\d+) of your Benched (${TYPE_WORD}) Pokémon and attach a Basic Energy card from your discard pile to each of them\\.$`), (m) => [{ op: "energyEach", zone: "discard", what: "basicEnergy", where: { to: "bench", whoType: m[2] }, n: Number(m[1]) }]],
  // Bianca's Devotion.
  [/^Heal all damage from 1 of your Pokémon that has (\d+) HP or less remaining\.$/, (m) => [{ op: "heal", n: 9999, lowHp: Number(m[1]) }]],
  // Hassel-like: "Heal 80 damage from your Active Pokémon that has 3 or more Energy attached."
  [/^Heal (\d+) damage from your Active Pokémon that has (\d+) or more Energy attached\.$/, (m) => [{ op: "heal", n: Number(m[1]), to: "active", energyMin: Number(m[2]) }]],
  // Morty's Conviction's draw.
  [/^Draw a card for each of your opponent's Benched Pokémon\.$/, () => [{ op: "drawFor", of: "foeBench" }]],
  // Gladion's Final Battle's boost.
  [/^During this turn, attacks used by your Pokémon that don't have a Rule Box do (\d+) more damage to your opponent's Active Pokémon \(before applying Weakness and Resistance\)\.$/, (m) => [{ op: "boost", n: Number(m[1]), who: { noRule: true } }]],
  // Gwynn.
  [/^Discard up to (\d+) Pokémon that don't have a Rule Box from your hand, and draw (\d+) cards for each card you discarded in this way\.$/, (m) => [{ op: "toss", n: Number(m[1]), what: "pokemon!rule", upTo: true, pass: true, need: true }, { op: "drawPaid", per: Number(m[2]) }]],
  // Zinnia's Trust, AZ's Tranquility.
  [/^Switch your Active Pokémon with 1 of your Benched Pokémon\. If you do, move an Energy from the Pokémon you moved to your Bench to the new Active Pokémon\.$/, () => [{ op: "switch" }, { op: "energyBack" }]],
  [/^Switch your Active Pokémon with 1 of your Benched Pokémon\. If you moved a Pokémon ex to your Bench in this way, heal (\d+) damage from that Pokémon\.$/, (m) => [{ op: "switch" }, { op: "healBack", n: Number(m[1]), who: "box=ex" }]],
  // Lisia's Appeal.
  [/^Switch in 1 of your opponent's Benched Basic Pokémon to the Active Spot\. If you do, the new Active Pokémon is now Confused\.$/, () => [{ op: "gust", stage: "basic", need: true }, { op: "condition", kinds: ["confused"] }]],
  // Prime Catcher.
  [/^Switch in 1 of your opponent's Benched Pokémon to the Active Spot\. If you do, switch your Active Pokémon with 1 of your Benched Pokémon\.$/, () => [{ op: "gust", need: true }, { op: "switch" }]],
  // Larry's Skill.
  [/^Discard your hand and search your deck for a Pokémon, a Supporter card, and a Basic Energy card, reveal them, and put them into your hand\. Then, shuffle your deck\.$/, () => [{ op: "discardHand" }, { op: "search", what: "pokemon|supporter|basicEnergy", n: 3, rule: { apiece: ["pokemon", "supporter", "basicEnergy"] } }]],
  // N's Plan.
  [/^Move up to (\d+) Energy from your Benched Pokémon to your Active Pokémon\.$/, (m) => [{ op: "pullEnergy", n: Number(m[1]) }]],
  // Heads an Evolution, tails a Basic, of an owner's Pokémon.
  [/^Flip a coin\. If heads, search your deck for an Evolution ((?:Team Rocket|[A-Z][a-zé]*)'s) Pokémon, reveal it, and put it into your hand\. If tails, search your deck for a Basic \1 Pokémon, reveal it, and put it into your hand\. Then, shuffle your deck\.$/, (m) => [{ op: "flip", heads: [{ op: "search", what: `evolution&&name^${m[1]}` }], tails: [{ op: "search", what: `basic&&name^${m[1]}` }] }]],
  // Draw until 5, after discarding any number first.
  [/^Draw cards until you have (\d+) cards in your hand\. Before drawing cards, you may discard any number of cards from your hand\. \(If you can't draw any cards in this way, you can't use this card\.\)$/, (m) => [{ op: "only", when: { deck: true } }, { op: "toss", n: "all", upTo: true }, { op: "drawTo", n: Number(m[1]) }]],
  // A last sentence of its own (after a search for Energy that is attached).
  [/^Your turn ends\.$/, () => [{ op: "endTurn" }]],
  [/^Your opponent reveals their hand, and you draw a card for each Pokémon you find there\.$/, () => [{ op: "foeRevealDraw", what: "pokemon" }]],
  [new RegExp(`^Both Active non-(${TYPE_WORD}) Pokémon are now Confused\\.$`), (m) => [{ op: "confuseBoth", notType: m[1] }]],
  [new RegExp(`^Search your deck for up to (\\d+) Basic (${TYPE_WORD}) Energy cards and attach them to 1 of your Pokémon\\. Then, shuffle your deck\\.$`), (m) => [{ op: "fetchEnergy", what: `basicEnergy:${m[2]}`, n: Number(m[1]), to: "one" }]],
  [/^Your opponent discards cards from their hand until they have (\d+) cards in their hand\.$/, (m) => [{ op: "foeTossTo", n: Number(m[1]) }]],
  [/^Each player shuffles their hand and puts it on the bottom of their deck\. If either player put any cards on the bottom of their deck in this way, each player flips a coin\. If heads, that player draws (\d+) cards\. If tails, they draw (\d+) cards\.$/, (m) => [{ op: "handBottom" }, { op: "flipDrawEach", heads: Number(m[1]), tails: Number(m[2]) }]],
  [new RegExp(`^${SHUFFLE_BOTH}\\. Then, flip a coin\\. If heads, you draw (\\d+) cards, and your opponent draws (\\d+) cards\\. If tails, you draw \\2 cards, and your opponent draws \\1 cards\\.$`), (m) => [{ op: "shuffleHand", both: true }, { op: "flipDrawBoth", win: Number(m[1]), lose: Number(m[2]) }]],
  [/^Put 1 of your Pokémon and all attached cards into your hand\.$/, () => [{ op: "bounce", keep: "all" }]],
  // "If you drew any cards in this way, and if a Stadium that has "Legendary" in its name is in play, put this card into your hand instead."
  [/^Draw (\d+) cards\. If you drew any cards in this way,? and if (?:a Stadium that has "([^"]+)" in its name|([A-Z][\w ]+?)) is in play, (put|shuffle) this (?:card|[\w&'. ]+?) into your (hand|deck) instead of (?:the discard pile|discarding it)\.$/, (m) => [{ op: "draw", n: Number(m[1]) }, { op: "keepCard", to: m[5] === "deck" ? "deck" : "hand", when: { stadiumWord: m[2] || m[3] } }]],
  // Surfing Beach, as its player's own: "switch your Active Water Pokémon with 1 of your Benched Water Pokémon".
  [new RegExp(`^Switch your Active (${TYPE_WORD}) Pokémon with 1 of your Benched \\1 Pokémon\\.$`), (m) => [{ op: "switch", who: `pokemon:${m[1]}` }]],
  // Dan.
  [/^Draw (\d+) cards\. You and your opponent play Rock-Paper-Scissors until someone wins\. If you win, draw (\d+) more cards\.$/, (m) => [{ op: "draw", n: Number(m[1]) }, { op: "rps", win: [{ op: "draw", n: Number(m[2]) }] }]],
  // Fossil Excavator: the deck or the discard pile, the player's choice (only asked when the discard pile has one).
  [/^Search your deck or discard pile for a Trainer card that has Fossil in its name or a Stage 1 or Stage 2 Evolution card that evolves from a Fossil\. Show it to your opponent and put it into your hand\. If you searched your deck, shuffle your deck afterward\.$/, () => {
    const what = "trainer~Fossil|stage1<Fossil|stage2<Fossil";
    return [{ op: "choice", prompt: "Search which?", options: [{ label: "Your deck", steps: [{ op: "search", what, n: 1 }] }, { label: "Your discard pile", steps: [{ op: "recover", what, n: 1 }] }] }];
  }],
  // Choose 1.
  [/^Choose 1: • (.+?) • (.+)$/, (m) => options([m[1], m[2]])],
  [/^Choose 1 or both: • (.+?) • (.+)$/, (m) => options([m[1], m[2]], true)],
  [/^Search your discard pile for (Basic Pokémon and Evolution cards|basic Energy cards)\. You may either show 1 (?:Basic Pokémon or Evolution card|basic Energy card) to your opponent and put it into your hand, or show (?:a combination of )?3 (?:Basic Pokémon or Evolution cards|basic Energy cards) to your opponent and shuffle them into your deck\.$/, (m) => {
    const what = /Energy/.test(m[1]) ? "basicEnergy" : "basic|evolution";
    return [{ op: "choice", options: [{ label: "1 into your hand", steps: [{ op: "recover", what, n: 1 }] }, { label: "3 into your deck", steps: [{ op: "recycle", what, n: 3, least: 3 }] }] }];
  }],
  // Switching both ways.
  [/^Each player switches (?:his or her|their) Active Pokémon with 1 of (?:his or her|their) Benched Pokémon\. \(?Your opponent switches first\.(?:\)| \(| )If a player does not have a Benched Pokémon, (?:he or she|that player) doesn't switch Pokémon\.\)$/, () => [{ op: "foeSwitch" }, { op: "switch" }]],
  [/^If your opponent has any Benched Pokémon, he or she chooses 1 of them and switches it with his or her Active Pokémon, then, if you have any Benched Pokémon, you switch 1 of them with your Active Pokémon\.$/, () => [{ op: "foeSwitch" }, { op: "switch" }]],
  [/^Your opponent switches (?:his or her|their) Active Pokémon with 1 of (?:his or her|their) Benched Pokémon\.$/, () => [{ op: "foeSwitch" }]],
  [/^Switch out your opponent's Active Pokémon to the Bench\. \(Your opponent chooses the new Active Pokémon\.\)$/, () => [{ op: "foeSwitch" }]],
  [/^If you have any Benched Pokémon, your opponent chooses 1 of them and switches it with your Active Pokémon\. Then, if your opponent has any Benched Pokémon, choose 1 of them and switch it with (?:his or her|their) Active Pokémon\.$/, () => [{ op: "switch", chooser: "foe" }, { op: "gust" }]],
  [/^Flip a coin\. If heads, choose 1 of your opponent's Benched Pokémon, and switch it with your opponent's Active Pokémon\.$/, () => [{ op: "flip", heads: [{ op: "gust" }] }]],
  [/^You can play this card only if you have at least 1 Basic Pokémon card in your hand\. Put a Basic Pokémon card from your hand into play as your Active Pokémon\. Put your old Active Pokémon onto your Bench\. \(You can't play this card if your Bench is full\.\)$/, () => [{ op: "newActive" }]],
  // Special Conditions and healing.
  [/^Your opponent's Active Pokémon is now Poisoned\. Flip a coin\. If heads, your opponent's Active Pokémon is also Asleep\.$/, () => [{ op: "condition", kinds: ["poisoned"] }, { op: "flip", heads: [{ op: "condition", kinds: ["asleep"] }] }]],
  [/^Heal (\d+) damage and remove a Special Condition from your Active Pokémon\.$/, (m) => [{ op: "heal", n: Number(m[1]), to: "active" }, { op: "cureOne" }]],
  [/^Flip a coin\. If heads, choose 1 of your Pokémon(?: \(excluding Pokémon-ex\))?[.,] (?:and remove|Remove) all Special Conditions and (\d+) damage counters from that Pokémon \(all if there are less than \d+\)\.$/, (m) => [{ op: "flip", heads: [{ op: "heal", n: Number(m[1]) * 10, cure: true, ...(/excluding/.test(m[0]) ? { noEx: true } : {}) }] }]],
  [/^Flip a coin\. If heads, your Active Pokémon is no longer Asleep, Confused, Paralyzed, or Poisoned and remove (\d+) damage counters from it\. If your Active Pokémon has fewer damage counters than that, remove all of them\.$/, (m) => [{ op: "flip", heads: [{ op: "cure" }, { op: "heal", n: Number(m[1]) * 10, to: "active" }] }]],
  [/^Choose 1 of your Pokémon\. Flip 2 coins\. (?:Remove (\d+) damage counters times the number of heads from that Pokémon\. If the Pokémon has fewer damage counters than that, remove all of them|For each heads, remove (\d+) damage counters from that Pokémon)\.$/, (m) => [{ op: "heal", n: Number(m[1] || m[2]) * 20, flips: 2, per: Number(m[1] || m[2]) * 10 }]],
  [/^Choose 1 of your Pokémon\. Flip 2 coins\. If both are heads, remove all damage counters from that Pokémon\. If both are tails, discard all Energy cards attached to that Pokémon\.$/, () => [{ op: "heal", n: ALL, flips: 2, night: true }]],
  [/^Remove (\d+) damage counters? from each of your Pokémon that has any damage counters on it\.$/, (m) => [{ op: "heal", n: Number(m[1]) * 10, to: "all" }]],
  [new RegExp(`^Heal (\\d+) damage from (each|1) of your Pokémon that has any (${TYPE_WORD}) Energy attached to it\\.$`), (m) => [{ op: "heal", n: Number(m[1]), has: m[3], ...(m[2] === "each" ? { to: "all" } : {}) }]],
  [/^Heal (\d+) damage from 1 of your Pokémon that has at least 1 (\w+) Energy attached\. If you healed any damage in this way, discard an? \2 Energy from it\.$/, (m) => [{ op: "heal", n: Number(m[1]), has: m[2], pay: `energy:${m[2]}`, ifHealed: true }]],
  [/^Heal (\d+) damage from 1 of your Pokémon\. If you do, discard an Energy attached to that Pokémon\.$/, (m) => [{ op: "heal", n: Number(m[1]), pay: "energy", ifHealed: true }]],
  [/^Discard 1 Energy card attached to (?:1 of )?your own Pokémon in order to remove up to (\d+) damage counters from that Pokémon\.$/, (m) => [{ op: "heal", n: Number(m[1]) * 10, pay: "energy" }]],
  [/^Heal all damage from 1 of your Mega Evolution Pokémon ex\. If you healed any damage in this way, put all Energy attached to that Pokémon into your hand\.$/, () => [{ op: "heal", n: ALL, who: "mega", strip: "hand", ifHealed: true }]],
  [/^Put 1 of your Pokémon that has any damage counters on it and all cards attached to it into your hand\.$/, () => [{ op: "bounce", keep: "all", hurt: true }]],
  [/^Choose 1 of your evolved Pokémon\. Take the highest Stage Evolution card from that Pokémon and put it into your hand\. \(You can't evolve a Pokémon the turn you devolve it\.\)$/, () => [{ op: "devolve" }]],
  // Energy.
  [/^Discard 1 Energy card attached to 1 of your (?:own )?Pokémon in order to choose 1 of your opponent's Pokémon and up to 2 Energy cards attached to it\. Discard those Energy cards\.$/, () => [{ op: "payEnergy" }, { op: "energyOff", n: 2, upTo: true }]],
  [/^Move as many Energy cards attached to 1 of your Pokémon as you like to another of your Pokémon\.$/, () => [{ op: "energyOff", side: "mine", move: true }]],
  [/^Take all Energy cards attached to 1 of your Pokémon with (\w+) in its name and attach them to another 1 of your Pokémon with \1 in its name\.$/, (m) => [{ op: "moveAll", who: { named: m[1] } }]],
  [/^Discard all Pokémon Tool cards attached to each of your opponent's Pokémon\.$/, () => [{ op: "dropFoeTools" }]],
  [/^Look at the top (\d+) cards of your deck and attach a basic Energy card you find there to a Basic Pokémon on your Bench\. Shuffle the other cards back into your deck\.$/, (m) => [{ op: "fetchEnergy", what: "basicEnergy", n: 1, to: "one", top: Number(m[1]), mix: true, where: { to: "bench", who: "basic" } }]],
  [new RegExp(`^Look at the top (\\d+) cards of your deck and attach up to (\\d+) Basic (${TYPE_WORD}) Energy cards you find there to your Benched \\3 Pokémon in any way you like\\. Shuffle the other cards back into your deck\\.$`), (m) => [{ op: "fetchEnergy", what: `basicEnergy:${m[3]}`, n: Number(m[2]), to: "spread", top: Number(m[1]), mix: true, where: { to: "bench", whoType: m[3] } }]],
  [/^Flip a coin\. If heads, attach a basic Energy card from your discard pile to 1 of your Basic Pokémon that isn't a Pokémon-GX\.$/, () => [{ op: "flip", heads: [{ op: "attachPick", zone: "discard", what: "basicEnergy", to: "any", who: "basic!gx", n: 1 }] }]],
  [/^Attach a basic Energy card from your hand to one of your Stage 2 Grass, Fire, or Water Pokémon\.$/, () => [{ op: "attachPick", zone: "hand", what: "basicEnergy", to: "any", who: "stage2:Grass|stage2:Fire|stage2:Water", n: 1 }]],
  [new RegExp(`^Attach (\\d+) (${TYPE_WORD}) Energy cards from your discard pile to 1 of your \\2 Pokémon\\.$`), (m) => [{ op: "attachPick", zone: "discard", what: `basicEnergy:${m[2]}`, to: "any", whoType: m[2], n: Number(m[1]), exact: true }]],
  [/^Trade 1 of the other cards in your hand for up to (\d+) basic Energy cards from your discard pile\.$/, (m) => [{ op: "cost", n: 1, pass: true }, { op: "recover", what: "basicEnergy", n: Number(m[1]), upTo: true }]],
  [/^Discard (\d+) cards from your hand\. \(If you can't discard \d+ cards, you can't play this card\.\) Put (\d+) basic Energy cards from your discard pile into your hand\. \(You can't choose a card you discarded with the effect of this card\.\)$/, (m) => [{ op: "cost", n: Number(m[1]), pass: true }, { op: "recover", what: "basicEnergy", n: Number(m[2]) }]],
  [/^Flip (\d+) coins\. For each heads, put a [Bb]asic Energy card from your discard pile into your hand\. If you don't have that many basic Energy cards in your discard pile, put all of them into your hand\.$/, (m) => [{ op: "flipEach", coins: Number(m[1]), step: { op: "recover", what: "basicEnergy" } }]],
  [/^Choose 4 basic Energy cards from your discard pile \(if there are fewer basic Energy cards than choose, take all of them\), show them to your opponent, and put them into your hand\.$/, () => [{ op: "recover", what: "basicEnergy", n: 4 }]],
  [/^Show the top (\d+) cards of your deck to all players\. Put any (\w+) Energy cards there into your hand and discard the rest\.$/, (m) => [{ op: "topSort", n: Number(m[1]), what: `energy:${m[2]}` }]],
  [/^Choose an Energy card from your hand, show it to your opponent, and put it on top of your deck\. Search your deck for an Energy card, show it to your opponent, and put it into your hand\. Shuffle your deck afterward\.$/, () => [{ op: "stash", what: "energy", n: 1, at: "top", need: true }, { op: "search", what: "energy", n: 1 }]],
  [/^Flip a coin\. If heads, shuffle 2 Energy cards from your discard pile into your deck \(1 if you have only 1\)\.$/, () => [{ op: "flip", heads: [{ op: "recycle", what: "energy", n: 2 }] }]],
  [/^Search your discard pile for (\d+) basic Energy cards, show them to your opponent, and shuffle them into your deck\.$/, (m) => [{ op: "recycle", what: "basicEnergy", n: Number(m[1]) }]],
  // Searches.
  [/^Flip (\d+) coins\. For each heads, search your deck for an? (.+?)(?:, reveal it,| card, show it to your opponent,|\. Show that card to your opponent, then put it into your hand\.) ?(?:and put it into your hand\. )?(?:Then, shuffle your deck|Shuffle your deck afterward)\.$/, (m) => {
    const what = whatOf(m[2]);
    return what && [{ op: "flipEach", coins: Number(m[1]), step: { op: "search", what } }];
  }],
  [/^Flip (\d+) coins\. For each heads, put an? (.+?) from your discard pile into your hand\.$/, (m) => { const what = whatOf(m[2]); return what && [{ op: "flipEach", coins: Number(m[1]), step: { op: "recover", what } }]; }],
  [/^Search your deck for up to (\d+) Basic Pokémon or up to \1 basic Energy cards, reveal them, and put them into your hand\. Then, shuffle your deck\.$/, (m) => [{ op: "search", what: "basic|basicEnergy", n: Number(m[1]), rule: { oneOf: ["basic", "basicEnergy"] } }]],
  [/^Search your deck for up to (\d+) different types of (basic Energy cards|Basic Pokémon cards \(excluding Baby Pokémon\)), show them to your opponent, and put them into your hand\. Shuffle your deck afterward\.$/, (m) => [{ op: "search", what: /Energy/.test(m[2]) ? "basicEnergy" : "basic%Baby", n: Number(m[1]), rule: { distinct: true } }]],
  [/^Search your deck for a Basic Pokémon, a Stage 1 Pokémon, and a Stage 2 Pokémon, reveal them, and put them into your hand\. Then, shuffle your deck\.$/, () => [{ op: "search", what: "basic|stage1|stage2", n: 3, rule: { apiece: ["basic", "stage1", "stage2"] } }]],
  [/^Look at the top (\d+) cards of your deck\. You may reveal a Pokémon and a Trainer card you find there and put them into your hand\. Shuffle the other cards back into your deck\.$/, (m) => [{ op: "search", what: "pokemon|trainer", n: 2, top: Number(m[1]), rule: { apiece: ["pokemon", "trainer"] } }]],
  [/^Look at the top (\d+) cards of your deck\. You may reveal a Trainer card you find there \(except Trainers' Mail\) and put it into your hand\. Shuffle the other cards back into your deck\.$/, (m) => [{ op: "search", what: "trainer!=Trainers' Mail", n: 1, top: Number(m[1]) }]],
  [/^Look at the top (\d+) cards (?:from|of) your deck\. Choose a Basic Pokémon or Evolution card from those cards, show it to your opponent, and put it into your hand\. Put the other \d+ cards back on top of your deck\. Shuffle your deck afterward\.$/, (m) => [{ op: "search", what: "basic|evolution", n: 1, top: Number(m[1]) }]],
  [/^Look at the (\d+) cards from the bottom of your deck\. Choose 1 Pokémon you find there, show it to your opponent, and put it into your hand\. Put the remaining cards back on top of your deck\. Shuffle your deck afterward\.$/, (m) => [{ op: "search", what: "pokemon", n: 1, bottom: Number(m[1]) }]],
  [/^Look at the top (\d+) cards of your deck(?:\.|,) [Cc]hoose as many (Pokémon|Energy cards) as you like, show them to your opponent, and put them into your hand\. (?:Put the other cards back on top of your deck\. Shuffle your deck afterward|Shuffle the other cards back into your deck)\.$/, (m) => [{ op: "search", what: /Energy/.test(m[2]) ? "energy" : "pokemon", n: "all", top: Number(m[1]) }]],
  [/^Discard a card from your hand\. If you can't discard a card from your hand, you can't play this card\. Count the total number of Prize cards left \(both yours and your opponent's\)\. Look at that many cards from the top of your deck, choose as many Energy cards as you like, show them to your opponent, and put them into your hand\. Put the other cards back on top of your deck\. Shuffle your deck afterward\.$/, () => [{ op: "cost", n: 1 }, { op: "search", what: "energy", n: "all", top: "prizes" }]],
  [/^Discard a card from your hand\. If you can't discard a card from your hand, you can't play this card\. Search your deck for a Metal Energy card or a Basic Pokémon \(or Evolution card\) that has δ on its card, show it to your opponent, and put it into your hand\. Shuffle your deck afterward\.$/, () => [{ op: "cost", n: 1 }, { op: "search", what: "energy:Metal|basic~δ|evolution~δ", n: 1 }]],
  [/^Look at the top (\d+) cards of your deck, and choose a Basic Pokémon, Evolution card, or Energy card\. Show it to your opponent and put it into your hand\. Put the (\d+) other cards back on top of your deck in any order\.$/, (m) => [{ op: "topTake", n: 1, top: Number(m[1]), what: "basic|evolution|energy", pass: true }, { op: "arrange", n: Number(m[1]) }]],
  [/^Look at up to (\d+) cards from the top of your deck and rearrange them as you like\.$/, (m) => [{ op: "arrange", n: Number(m[1]) }]],
  [/^Look at the top (\d+) cards of your deck and put as many of them as you like back on top of your deck in any order\. Then, put the remaining cards on the bottom of your deck in any order\.$/, (m) => [{ op: "toBottomOf", n: Number(m[1]) }, { op: "arrange", n: Number(m[1]) }]],
  [/^Look at the (\d+) cards from the bottom of your deck\. Choose any (\d+) cards there and put them into your hand\. Put the remaining cards back on the bottom of your deck in any order\.$/, (m) => [{ op: "topTake", n: Number(m[2]), top: Number(m[1]), bottom: true }, { op: "arrange", n: Number(m[1]) - Number(m[2]), at: "bottom" }]],
  [/^Shuffle your deck\. Then, look at the top (\d+) cards of your deck\. Choose 1 of those cards and put it into your hand\. Shuffle the rest into your deck afterward\.$/, (m) => [{ op: "shuffleDeck" }, { op: "topTake", n: 1, top: Number(m[1]), shuffle: true }]],
  [/^Reveal the top (\d+) cards of your deck\. Your opponent chooses (\d+) of those cards\. Put those cards into your hand and put other \d+ cards on top of your deck\. Shuffle your deck afterward\.$/, (m) => [{ op: "foeChoosesTop", n: Number(m[1]), take: Number(m[2]) }]],
  [/^Reveal cards from your deck until you reveal an? (Pokémon|Evolution card)\. Show that (?:Pokémon|card) to your opponent and put it into your hand\. Shuffle the other revealed cards (?:back )?into your deck\. \(If you don't reveal an? (?:Pokémon|Evolution card), shuffle all the revealed cards back into your deck\.\)$/, (m) => [{ op: "revealUntil", what: /Evolution/.test(m[1]) ? "evolution" : "pokemon" }]],
  [/^Each player reveals the top (\d+) cards of their deck and puts all Pokémon they find there into their hand\. Then, each player shuffles the other cards back into their deck\.$/, (m) => [{ op: "topSort", n: Number(m[1]), what: "pokemon", rest: "shuffle", both: true }]],
  [/^Search your deck for (\d+) cards, shuffle your deck, and put those cards on top of your deck in any order\.$/, (m) => [{ op: "search", what: "any", n: Number(m[1]), to: "top" }]],
  [/^You can play only 1 Supporter card each turn\. When you play this card, put it next to your Active Pokémon\. When your turn ends, discard this card\. (.+)$/, (m) => compileTrainer(m[1].replace(/^Choose 2 cards from your deck and shuffle the rest of your deck\. Put the chosen cards on top of your deck in any order\.$/, "Search your deck for 2 cards, shuffle your deck, and put those cards on top of your deck in any order."))],
  [/^Flip a coin\. If heads, search your deck for a card, shuffle your deck, then put that card on top of it\.$/, () => [{ op: "flip", heads: [{ op: "search", what: "any", n: 1, to: "top" }] }]],
  [/^Flip a coin\. If heads, put all cards in your hand on top of your deck\. Then, search your deck for any 1 card and put it into your hand\. Shuffle your deck afterward\.$/, () => [{ op: "flip", heads: [{ op: "shuffleHand" }, { op: "search", what: "any", n: 1 }] }]],
  [/^Flip a coin\. If heads, search your deck for a Basic Pokémon, put it onto your Bench, and shuffle your deck\. If tails, put this Egg Incubator on the bottom of your deck instead of in the discard pile\.$/, () => [{ op: "flip", heads: [{ op: "search", what: "basic", to: "bench" }], tails: [{ op: "keepCard", to: "bottom" }] }]],
  [/^Flip a coin\. If heads, search your deck for a Pokémon that has (Team \w+) in its name, show it to your opponent, and put it into your hand\. If tails, search your deck for a Basic Pokémon that has \1 in its name, show it to your opponent and put it into your hand\. Shuffle your deck afterward\.$/, (m) => [{ op: "flip", heads: [{ op: "search", what: `pokemon~${m[1]}` }], tails: [{ op: "search", what: `basic~${m[1]}` }] }]],
  [/^Search your deck for up to (\d+) in any combination of Basic Pokémon with (Team \w+) in its name and basic Energy cards, show them to your opponent, and put them into your hand\. Shuffle your deck afterward\.$/, (m) => [{ op: "search", what: `basic~${m[2]}|basicEnergy`, n: Number(m[1]) }]],
  [/^Search your deck for (?:an? )?(Pokémon|Evolution card|Basic Pokémon or Evolution card) with (\w+(?: \w+)?) in its name\. Show (?:it|that card) to your opponent(?:,| and) (?:then )?put it into your hand\. Shuffle your deck afterward\.$/, (m) => [{ op: "search", what: { Pokémon: `pokemon~${m[2]}`, "Evolution card": `evolution~${m[2]}` }[m[1]] || `basic~${m[2]}|evolution~${m[2]}` }]],
  [/^Search your deck for a Pokémon with (Dark) in its name, show it to your opponent, and put it into your hand\. Shuffle your deck afterward\.$/, (m) => [{ op: "search", what: `pokemon~${m[1]}` }]],
  [/^Search your deck for a Pokémon \(excluding Pokémon LV\.X\), show it to your opponent, and put it into your hand\. Shuffle your deck afterward\. If any Luxury Ball is in your discard pile, you can't play this card\.$/, () => [{ op: "only", when: { notInDiscard: "Luxury Ball" } }, { op: "search", what: "pokemon%Level-Up" }]],
  [/^Search your deck for a Pokémon with a Retreat Cost of (\d+) or more, reveal it, and put it into your hand\. Shuffle your deck afterward\.$/, (m) => [{ op: "search", what: `pokemon#r${m[1]}` }]],
  [/^Search your deck for a Mega Evolution Pokémon ex, reveal it, and put it into your hand\. Then, shuffle your deck\.$/, () => [{ op: "search", what: "mega" }]],
  [/^Search your deck for up to (\d+) Item cards that have the word "Ball" in their name, reveal them, and put them into your hand\. Then, shuffle your deck\.$/, (m) => [{ op: "search", what: "item~Ball", n: Number(m[1]) }]],
  [/^Search your deck for any (\d+) cards and put them into your hand\. Shuffle your deck afterward\.$/, (m) => [{ op: "search", what: "any", n: Number(m[1]) }]],
  [/^Search your deck for a Team Plasma Pokémon, reveal it, and put it into your hand\. Shuffle your deck afterward\.$/, () => [{ op: "search", what: "pokemon+Team Plasma" }]],
  [/^Put a Team Plasma card from your discard pile into your hand\.$/, () => [{ op: "recover", what: "any+Team Plasma", n: 1 }]],
  [/^Search your deck for up to (\d+) Baby Pokémon and\/or Basic Pokémon cards and put them onto your bench\. Shuffle your deck afterward\.$/, (m) => [{ op: "search", what: "basic", n: Number(m[1]), to: "bench" }]],
  [/^Look at the top (\d+) cards of your deck and put a (\w+) Pokémon you find there onto your Bench\. Shuffle the other cards and put them on the bottom of your deck\. You can't use this card during your first turn\.$/, (m) => [{ op: "only", when: { not: { first: true } } }, { op: "search", what: `basic:${m[2]}`, n: 1, to: "bench", top: Number(m[1]), rest: "bottom" }]],
  [/^Trade 1 of the Basic Pokémon or Evolution cards in your hand for 1 of the Basic Pokémon or Evolution cards from your deck\. Show both cards to your opponent\. Shuffle your deck afterward\.$/, () => [{ op: "stash", what: "basic|evolution", n: 1, at: "top", need: true }, { op: "search", what: "basic|evolution", n: 1, skipTop: 1 }]],
  [/^Choose 1 of your Basic Pokémon in play\. Search your deck for a Basic Pokémon and switch it with that Pokémon\. \(Any attached cards, damage counters, Special Conditions, turns in play, and any other effects remain on the new Pokémon\.\) Shuffle the first Pokémon into your deck\.$/, () => [{ op: "swapBasic" }]],
  [/^Your opponent may search (?:his or her|their) deck for 1 Basic Pokémon card and put it onto (?:his or her|their) Bench\. Then, you may search your deck for 1 Basic Pokémon card and put it onto your Bench\. Then, each player shuffles (?:his or her|their) deck\. \(A player can't do any of this if (?:his or her|their) Bench is full\.\)$/, () => [{ op: "foeBenchSearch" }, { op: "search", what: "basic", n: 1, to: "bench" }]],
  // The discard pile.
  [/^Search your discard pile for a Pokémon, show it to your opponent, and put it into your hand\.$/, () => [{ op: "recover", what: "pokemon", n: 1 }]],
  [/^Put a Pokémon from your discard pile on top of your deck\.$/, () => [{ op: "recover", what: "pokemon", n: 1, to: "top" }]],
  [/^Flip a coin\. If heads, search your discard pile for a Pokémon, show it to your opponent, and put it on top of your deck\. If tails, search your discard pile for a Trainer card, show it to your opponent, and put it on top of your deck\.$/, () => [{ op: "flip", heads: [{ op: "recover", what: "pokemon", n: 1, to: "top" }], tails: [{ op: "recover", what: "trainer", n: 1, to: "top" }] }]],
  [/^Flip a coin\. If heads, put an Evolution card from your discard pile, if any, into your hand\. If tails, put a Basic Pokémon card from your discard pile, if any, into your hand\.$/, () => [{ op: "flip", heads: [{ op: "recover", what: "evolution", n: 1 }], tails: [{ op: "recover", what: "basic", n: 1 }] }]],
  [/^Put 1 Basic Pokémon card from your discard pile onto your Bench\. Put damage counters on that Pokémon equal to half its HP \(rounded down to the nearest 10\)\. \(You can't play Revive if your Bench is full\.\)$/, () => [{ op: "recover", what: "basic", n: 1, to: "bench", half: true }]],
  [/^Discard (\d+) Energy cards from your hand in order to put 1 Basic Pokémon from your discard pile onto your Bench\. \(You can't play Max Revive if your Bench is full\.\)$/, (m) => [{ op: "cost", n: Number(m[1]), what: "energy" }, { op: "recover", what: "basic", n: 1, to: "bench", need: true }]],
  [/^Take (\d+) Baby Pokémon, Basic Pokémon, Evolution, and\/or basic Energy cards from your discard pile and then show them to your opponent\. Shuffle them into your deck\.$/, (m) => [{ op: "recycle", what: "basic|evolution|basicEnergy", n: Number(m[1]) }]],
  [/^Search your discard pile for up to (\d+) in any combination of Pokémon SP and basic Energy cards, show them to your opponent, and put them into your hand\.$/, (m) => [{ op: "recover", what: "pokemon+SP|basicEnergy", n: Number(m[1]), upTo: true }]],
  // During this turn, the old way.
  [/^Discard 2 of the other cards in your hand in order to play this card\. If this turn's attack does damage to the Defending Pokémon \(after applying Weakness and Resistance\), and if the attacking Pokémon has (\w+) in its name, the attack does (\d+) more damage to the Defending Pokémon\.$/, (m) => [{ op: "cost", n: 2 }, { op: "boost", n: Number(m[2]), after: true, who: { named: m[1] } }]],
  [/^If an attack from a Pokémon with (\w+) in its name does damage to a Defending Pokémon this turn, that Pokémon is then Poisoned\.$/, (m) => [{ op: "boost", poison: true, who: { named: m[1] } }]],
  [/^Choose 1 of your Pokémon in play with (\w+) in its name\. For the rest of your turn, you may evolve that Pokémon even if you just played or evolved it this turn or if this is your first turn\. This effect also applies to the Pokémon it evolves into\.$/, (m) => [{ op: "lift", who: `pokemon~${m[1]}` }]],
  [/^Attach PlusPower to your Active Pokémon\. At the end of your turn, discard PlusPower\. If this Pokémon's attack does damage to the Defending Pokémon \(after applying Weakness and Resistance\), the attack does (\d+) more damage to the Defending Pokémon\.$/, (m) => [{ op: "hold", to: "active", until: 0, mod: { after: Number(m[1]) } }]],
  [/^Attach PlusPower to 1 of your Pokémon\. Discard this card at the end of your turn\. If the Pokémon PlusPower is attached to attacks, the attack does (\d+) more damage to the Active Pokémon \(before applying Weakness and Resistance\)\.$/, (m) => [{ op: "hold", until: 0, mod: { plus: Number(m[1]) } }]],
  [/^Attach Defender to 1 of your Pokémon\. At the end of your opponent's next turn, discard Defender\. Damage done to that Pokémon by attacks is reduced by (\d+) \(after applying Weakness and Resistance\)\.$/, (m) => [{ op: "hold", until: 1, mod: { less: Number(m[1]) } }]],
  // The other player's hand.
  [/^Flip 2 coins\. If either of them is heads, look at your opponent's hand\. For each heads, choose 1 card from your opponent's hand and put it on the bottom of your opponent's deck in any order\.$/, () => [{ op: "flipEach", coins: 2, step: { op: "foeHandBottom" } }]],
  [/^Look at your opponent's hand\. If he or she has any Basic Pokémon cards there, you may put any number of them onto your opponent's Bench \(as long as there's room\)\.$/, () => [{ op: "foeBasicsOut" }]],
  [/^Discard an? (\w+) Energy card from your hand\. \(If you can't discard an? \1 Energy card, you can't play this card\.\) Draw (\d+) cards\.$/, (m) => [{ op: "cost", n: 1, what: `basicEnergy:${m[1]}` }, { op: "draw", n: Number(m[2]) }]],
  [/^Switch your Active Pokémon with 1 of your Benched Pokémon\. If you do, draw (\d+) cards\.$/, (m) => [{ op: "switch", need: true }, { op: "draw", n: Number(m[1]) }]],
  [/^Flip a coin\. If heads, you may search your deck for any Basic Pokémon or Evolution card\. Show that card to your opponent, then put it into your hand\. Shuffle your deck afterward\.$/, () => [{ op: "flip", heads: [{ op: "search", what: "basic|evolution" }] }]],
  [/^During this turn, each of your Active Pokémon's attacks does (\d+) more damage to your opponent's Active Pokémon \(before applying Weakness and Resistance\)\.$/, (m) => [{ op: "boost", n: Number(m[1]) }]],
  // Scarlet & Violet and Mega Evolution Items and Supporters.
  [new RegExp(`^Search your deck for (?:up to (\\d+)|an?) (.+?) and attach (?:it|them) to (1 of your Pokémon|your Active Pokémon|1 of your Benched Pokémon)\\. Then, shuffle your deck\\.$`), (m) => {
    const what = whatOf(m[2]);
    if (!/^basicEnergy(:\w+)?$/.test(what)) return null;
    const where = /Active/.test(m[3]) ? { to: "active" } : /Benched/.test(m[3]) ? { to: "bench" } : null;
    return [{ op: "fetchEnergy", what, n: Number(m[1]) || 1, to: "one", ...(where ? { where } : {}) }];
  }],
  [/^Look at the bottom (\d+) cards of your deck\. You may reveal a Pokémon you find there and put it into your hand\. Shuffle the other cards back into your deck\.$/, (m) => [{ op: "search", what: "pokemon", n: 1, bottom: Number(m[1]) }]],
  [/^Look at the top (\d+) cards of your deck and attach a Basic Energy card you find there to 1 of your Pokémon\. Shuffle the other cards back into your deck\.$/, (m) => [{ op: "fetchEnergy", what: "basicEnergy", n: 1, to: "one", top: Number(m[1]), mix: true }]],
  [/^Your opponent reveals their hand, and you choose an Energy card you find there and put it on the bottom of their deck\.$/, () => [{ op: "foeHandEnergyBottom" }]],
  [/^Discard the top (\d+) cards of your deck\.$/, (m) => [{ op: "mill", n: Number(m[1]) }]],
  [/^Attach up to (\d+) Basic Energy cards from your discard pile to 1 of your Stage (1|2) Pokémon\.$/, (m) => [{ op: "attachPick", zone: "discard", what: "basicEnergy", to: "any", who: `stage${m[2]}`, n: Number(m[1]), upTo: true }]],
  [/^Draw a card for each of your opponent's Mega Evolution Pokémon ex in play\.$/, () => [{ op: "drawEach", of: "foeMega" }]],
  [/^Draw a card for each of your (Ancient|Future) Pokémon in play\.$/, (m) => [{ op: "drawEach", what: `pokemon+${m[1]}` }]],
  [/^Heal (\d+) damage from each Pokémon \(both yours and your opponent's\)\.$/, (m) => [{ op: "healBoth", n: Number(m[1]) }]],
  [/^Heal (\d+) damage from your Active Pokémon\. For each ([\w' ]+?) card \(not including this card\) in your discard pile, heal \1 more damage\.$/, (m) => [{ op: "healPerCopy", n: Number(m[1]), name: m[2] }]],
  [/^Heal (\d+) damage from your Active Pokémon\. If that Pokémon is an? ((?:Team Rocket|[A-Z][a-zé]*(?: [A-Z][a-zé]*)?)'s) Pokémon, heal (\d+) damage from it instead\.$/, (m) => [{ op: "heal", n: Number(m[1]), to: "active", notWho: `name^${m[2]}` }, { op: "heal", n: Number(m[3]), to: "active", who: `name^${m[2]}` }]],
  [/^Flip a coin\. If heads, put (\d+) damage counters on 1 of your opponent's Pokémon\. If tails, put (\d+) damage counters on your Active Pokémon\.$/, (m) => [{ op: "flip", heads: [{ op: "counters", n: Number(m[1]) * 10 }], tails: [{ op: "hurtActive", n: Number(m[2]) * 10 }] }]],
  [/^Search your deck for up to (\d+) Pokémon Tool cards that have "([^"]+)" in their name, reveal them, and put them into your hand\. Then, shuffle your deck\.$/, (m) => [{ op: "search", what: `tool~${m[2]}`, n: Number(m[1]) }]],
  [/^Each player discards cards from their hand until they have (\d+) cards in their hand\. Your opponent discards first\. \(If a player has \d+ or fewer cards in their hand, they do not discard\.\)$/, (m) => [{ op: "foeTossTo", n: Number(m[1]) }, { op: "tossTo", n: Number(m[1]) }]],
  [/^Attach a Basic Energy card from your discard pile to each of your (Ancient|Future) Pokémon\.$/, (m) => [{ op: "energyEach", zone: "discard", what: "basicEnergy", where: { who: `pokemon+${m[1]}` }, must: true }]],
  [/^Reveal the top (\d+) cards of your opponent's deck\. You may choose any number of Basic Pokémon you find there and put those Pokémon onto their Bench\. Your opponent shuffles the other cards back into their deck\.$/, (m) => [{ op: "foeTopBench", n: Number(m[1]) }]],
  [/^Search your deck for a Pokémon with the same name as 1 of your opponent's Pokémon in play, reveal it, and put it into your hand\. Then, shuffle your deck\.$/, () => [{ op: "sameName" }]],
  [/^Reveal up to (\d+) Pokémon in your hand and put them into your deck\. If you do, search your deck for up to that many Pokémon, reveal them, and put them into your hand\. Then, shuffle your deck\.$/, (m) => [{ op: "stash", what: "pokemon", n: Number(m[1]), upTo: true, pass: true, need: true }, { op: "searchPaid", what: "pokemon" }]],
  [new RegExp(`^Your opponent's Active Pokémon is now (Asleep|Burned|Confused|Paralyzed|Poisoned) and (Asleep|Burned|Confused|Paralyzed|Poisoned)\\.$`), (m) => [{ op: "condition", kinds: [m[1].toLowerCase(), m[2].toLowerCase()] }]],
  [/^Put (\d+) cards from your hand on the bottom of your deck in any order\. If you put \1 cards on the bottom of your deck in this way, draw (\d+) cards\. \(If you can't put \1 cards from your hand on the bottom of your deck, you can't use this card\.\)$/, (m) => [{ op: "stash", n: Number(m[1]), at: "bottom", need: true }, { op: "draw", n: Number(m[2]) }]],
  [/^Search your deck for up to (\d+) cards and discard them\. Then, shuffle your deck\.$/, (m) => [{ op: "searchMill", n: Number(m[1]) }]],
  [/^Look at the top (\d+) cards of your deck and put them back in any order, or shuffle them and put them on the bottom of your deck\.$/, (m) => [{ op: "choice", prompt: "The top cards of your deck:", options: [{ label: "Put them back in any order", steps: [{ op: "arrange", n: Number(m[1]) }] }, { label: "Shuffle them onto the bottom", steps: [{ op: "under", n: Number(m[1]) }] }] }]],
  [new RegExp(`^Heal (\\d+) damage from your Active (${TYPE_WORD}) Pokémon\\.$`), (m) => [{ op: "heal", n: Number(m[1]), to: "active", whoType: m[2] }]],
  [/^Shuffle your hand into your deck\. Then, flip a coin\. If heads, draw (\d+) cards\. If tails, draw (\d+) cards?\.$/, (m) => [{ op: "shuffleHand" }, { op: "flip", heads: [{ op: "draw", n: Number(m[1]) }], tails: [{ op: "draw", n: Number(m[2]) }] }]],
  [/^Flip a coin\. If heads, draw (\d+) cards\. If tails, draw (\d+) cards?\.$/, (m) => [{ op: "flip", heads: [{ op: "draw", n: Number(m[1]) }], tails: [{ op: "draw", n: Number(m[2]) }] }]],
  [/^Search your deck for any number of Basic Energy cards of different types, reveal them, and put them into your hand\. Then, shuffle your deck\.$/, () => [{ op: "search", what: "basicEnergy", n: "all", rule: { distinct: true } }]],
  [/^Your opponent counts the cards in their hand, shuffles those cards, and puts them on the bottom of their deck\. If they do, they draw that many cards\.$/, () => [{ op: "handBottom", who: "foe" }, { op: "foeDrawMoved", when: { moved: true } }]],
  [/^Discard all Pokémon Tools and Special Energy from all of your opponent's Pokémon, and discard a Stadium in play\.$/, () => [{ op: "dropFoeTools" }, { op: "dropFoeSpecial" }, { op: "dropStadium" }]],
  [/^Search your deck for any number of Basic Pokémon and put them onto your Bench\. Then, shuffle your deck\.$/, () => [{ op: "search", what: "basic", n: "all", to: "bench" }]],
  [/^Switch your Active Pokémon with 1 of your Benched Pokémon\. If you do, you may move any amount of Energy from the Pokémon you moved to your Bench to the new Active Pokémon\.$/, () => [{ op: "switch", need: true }, { op: "energyBackAll" }]],
  [/^Draw (\d+) cards\. Then, if you have (\d+) or more cards in your hand, draw (\d+) more cards\.$/, (m) => [{ op: "draw", n: Number(m[1]) }, { op: "draw", n: Number(m[3]), when: { handMin: Number(m[2]) } }]],
  [/^Search your deck for up to (\d+) Basic Pokémon or 1 Evolution Pokémon, reveal them, and put them into your hand\. Then, shuffle your deck\.$/, (m) => [{ op: "search", what: "basic|evolution", n: Number(m[1]), rule: { oneOf: ["basic", "evolution"], most: [["evolution", 1]] } }]],
  [/^Count your Prize cards, shuffle them, and put them on the bottom of your deck\. Then, take that many cards from the top of your deck and put them face down as your Prize cards\.$/, () => [{ op: "prizeSwap" }]],
  [/^Heal (\d+) damage from 1 of your Pokémon\. If you healed any damage in this way, discard an Energy from that Pokémon\.$/, (m) => [{ op: "heal", n: Number(m[1]), pay: "energy", ifHealed: true }]],
  [/^Flip (\d+) coins\. If both of them are heads, (.+)$/, (m) => { const heads = compileTrainer(upper(m[2])); return heads && [{ op: "flipAll", coins: Number(m[1]), heads }]; }],
  [new RegExp(`^During your opponent's next turn, all of your (?:(${TYPE_WORD}) )?Pokémon take (\\d+) less damage from attacks from your opponent's Pokémon \\(after applying Weakness and Resistance\\)\\. \\(This includes new Pokémon that come into play\\.\\)$`), (m) => [{ op: "teamGuard", n: Number(m[2]), who: m[1] ? { types: [m[1]] } : {} }]],
  [/^Choose 1 of your Pokémon in play\. During your opponent's next turn, prevent all damage from and effects of attacks done to that Pokémon by your opponent's Pokémon ex\.$/, () => [{ op: "markOne", mark: { kind: "shield", from: "box:ex" } }]],
  [/^During this turn, if your opponent's Active Pokémon is Knocked Out by damage from an attack used by your Tera Pokémon, take (\d+) more Prize cards?\.$/, (m) => [{ op: "prizeUp", n: Number(m[1]), who: "tera" }]],
  [/^Put an Energy attached to your opponent's Active Pokémon into their hand\. If you do, attach an Energy card from your hand to your Active Pokémon\.$/, () => [{ op: "hammerActive", need: true }, { op: "attachPick", zone: "hand", what: "energy", to: "active", n: 1 }]],
];

/** "Choose 1: • ... • ...": each part read on its own, or null when one isn't. */
function options(parts, both = false) {
  const offers = parts.map((part) => ({ label: part.replace(/\.$/, ""), steps: compileTrainer(part) }));
  return offers.every((o) => o.steps) ? [{ op: "choice", options: offers, ...(both ? { both } : {}) }] : null;
}

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
  const types = words.match(new RegExp(`^(?:an? )?((?:${TYPE_WORD})(?:(?:, | or )(?:${TYPE_WORD}))+) Pokémon$`));
  if (types) return types[1].split(/, | or /).map((t) => `pokemon:${t}`).join("|");
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
  // "a Pokémon that has δ on its card": a δ (Delta Species) Pokémon, δ printed by its name.
  m = words.match(/^(.+?) that (?:has|have) δ on (?:its|their) cards?$/);
  if (m) {
    const kind = plainWhat(m[1]);
    return /^(pokemon|basic|evolution)$/.test(kind) && !suffix ? `${kind}~δ` : "";
  }
  const what = plainWhat(words);
  if (suffix && !/^(pokemon|basic|evolution)(:|$)/.test(what)) return "";
  return what && what + suffix;
}
function plainWhat(words) {
  const plain = WHAT.find(([pattern]) => pattern.test(words))?.[1];
  if (plain) return plain;
  // "a Basic Team Rocket's Pokémon", "N's Pokémon": by the owner's name the card starts with.
  const owned = words.match(/^(?:an? |up to \d+ )?(Basic )?((?:Team Rocket|[A-Z][a-zé]*(?: [A-Z][a-zé]*)?)'s) Pokémon(?: cards?)?$/);
  if (owned) return `${owned[1] ? "basic&&" : ""}name^${owned[2]}`;
  // 'a Supporter card that has "Team Rocket" in its name'.
  const word = words.match(/^(?:an? )?(Supporter|Item|Trainer) cards? that (?:has|have) "([^"]+)" in (?:its|their) names?$/);
  if (word) return `${word[1].toLowerCase()}~${word[2]}`;
  if (/^(?:an? )?Pokémon Tool(?: cards?)?$/i.test(words)) return "tool";
  if (/^(?:an? )?Stage (1|2) Pokémon$/.test(words)) return `stage${words.match(/Stage (1|2)/)[1]}`;
  if (/^(?:an? )?Pokémon ex$/.test(words)) return "box=ex";
  const mega = words.match(new RegExp(`^(?:an? )?(?:(${TYPE_WORD}) )?Mega Evolution Pokémon ex$`));
  if (mega) return mega[1] ? `mega:${mega[1]}` : "mega";
  if (/^(?:an? )?Tera Pokémon$/.test(words)) return "tera";
  if (/^(?:an? )?Stadium(?: cards?)?$/i.test(words)) return "stadium";
  // Cards of a style: "Rapid Strike cards", "Fusion Strike Trainer cards", "Basic Rapid Strike Pokémon".
  const style = words.match(/^(?:an? |up to \d+ )?(Basic )?(Rapid Strike|Single Strike|Fusion Strike) (cards?|Trainer cards?|Supporter cards?|Item cards?|Pokémon)$/);
  if (style) return `${style[1] ? "basic" : { card: "", cards: "", "Trainer card": "trainer", "Trainer cards": "trainer", "Supporter card": "supporter", "Supporter cards": "supporter", "Item card": "item", "Item cards": "item", Pokémon: "pokemon" }[style[3]]}+${style[2]}`;
  for (const [pattern, kind] of TYPED) {
    const m = words.match(pattern);
    if (m) return `${kind}:${m[1]}`;
  }
  // A card by its name: "an Ethan's Adventure card", "up to 2 Arven's Sandwich cards", "Spiky Energy cards".
  const named = words.match(/^(?:an? |up to \d+ )?([A-Z][\w'é.-]*(?: [A-Z][\w'é.-]*)*) cards?$/);
  if (named && !/^[A-Z ]+$/.test(named[1]) && !/^(Basic|Pokémon|Item|Supporter|Trainer|Stadium|Tool|Team|Technical|Special|Evolution|Rapid|Single|Fusion)\b/.test(named[1]) && !/\b(Pokémon|Trainer|Supporter|Item)$/.test(named[1]) && !new RegExp(`^(?:${TYPE_WORD}) Energy$`).test(named[1]) && named[1] !== "Energy") return `card=${named[1]}`;
  return "";
}
const SHUFFLED = "(?:Then, shuffle your deck\\.|Shuffle your deck afterward\\.)";
const SEARCH = new RegExp(`^Search your deck for (?:up to ${N} )?(.+?)(?:,? (?:reveal (?:it|them)|show (?:it|them) to your opponent),?)?,? and put (?:it|them) (into your hand|onto your Bench)\\. ${SHUFFLED}$`, "i");
const RECOVER = new RegExp(`^Put (up to )?${N} (.+?) from your discard pile into your hand\\.$`, "i");
const TOP = new RegExp(`^Look at the top ${N} cards of your deck\\. You may reveal (up to ${N} |any number of )?(.+?) you find there and put (?:it|them) into your hand\\. Shuffle the other cards back into your deck\\.$`, "i");
/** "Look at the top 2 cards of your deck and put 1 of them into your hand. Discard the other card." and the like. */
const TAKE = new RegExp(`^Look at the top ${N} cards of your deck(?: and put| and put up to|\\. Choose any) ${N} (?:of them|cards you find there and put them) into your hand\\. (Discard the other cards?|Shuffle the other cards back into your deck|Shuffle the other cards and put them on the bottom of your deck|Put the other card on the bottom of your deck)\\.$`, "i");
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
const benchable = (what) => what.split("|").every((w) => /^basic(?=$|[:@!&])/.test(w));

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
  m = clean.match(/^You (?:can|may) (?:use|play) this card only (?:if|when) (.+?)\. (.+)$/);
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

/**
 * An Item's or Supporter's whole text: as one wording, or else as sentences read one after another
 * ("Draw 2 cards. During this turn, ..."), each a wording of its own. A sentence that leans on the one
 * before ("If you do", "instead") isn't read alone, so such a text stays unread.
 */
export function compileCard(text) {
  const whole = compileTrainer(text);
  if (whole) return whole;
  const clean = tidy(text);
  const sentences = clean.match(/[^.(]*(?:\([^)]*\)[^.(]*)*\.(?:\s*\([^)]*\))?/g)?.map((x) => x.trim()) || [];
  if (sentences.length < 2 || sentences.join(" ") !== clean) return null;
  const steps = [];
  for (let i = 0; i < sentences.length; ) {
    let got = null;
    for (let j = i + 1; j <= sentences.length && !got; j += 1) {
      const part = sentences.slice(i, j).join(" ").replace(/^Then, (\w)/, (_, c) => c.toUpperCase());
      if (j - i < sentences.length) got = compileTrainer(part) && [compileTrainer(part), j];
    }
    if (!got) return null;
    steps.push(...got[0]);
    i = got[1];
  }
  return steps;
}

/** The steps of a Trainer's text, or null when it can't be read yet (or it has none). */
export function compileTrainer(text) {
  const clean = tidy(text).replace(/\s*\([^()]*have Rule Boxes\.\)/g, "").trim();
  if (!clean) return null;
  for (const [pattern, build] of PATTERNS) {
    const m = clean.match(pattern);
    // A wording may match and still not be read (a condition it can't name): a later one may read it.
    const steps = m && build(m);
    if (steps) return steps;
  }
  return compileParts(clean);
}

/**
 * A Pokémon Tool stays on the Pokémon it is attached to and changes its numbers:
 *   { hp: +n, retreat: n fewer | "all", plus: n more damage to their Active Pokémon,
 *     less: n less damage taken from attacks, noWeakness }
 * or null when the text isn't read yet. And what it does on its own (engine.js reads these):
 *   who      { stage, types, plasma }: it works only while on a Pokémon that fits (fieldFits)
 *   only     { evolved, noEx, noDark, noOwner }: who it may be attached to; `drop`: it is
 *            discarded once that Pokémon stops fitting (it evolved into a Pokémon-ex)
 *   escape   it may retreat while Asleep or Paralyzed;  balloon  a retreat discards it instead of Energy
 *   prize    the opponent takes this many more Prize cards when it is Knocked Out
 *   ko       { active, any, toHand, energyToHand, baton: n, steps }: when an opponent's attack
 *            (`any`: any attack) Knocks it Out
 *   share    n basic Energy from your Knocked Out Active Pokémon may move to this one
 *   thorns   { n, draw, flip, spent }: damaged by an opponent's attack in the Active Spot
 *   attachHeal  n healed when an Energy card from the hand is attached to it
 *   endTurn  { draw } | { heal }: at the end of its owner's turn, while it is the Active Pokémon
 *   between  { heal } (with at least that much damage) | { cure }: between turns, then it is discarded
 *   lapse    "attack" (discarded at the end of a turn it attacked) | "foe" (at the end of the
 *            opponent's next turn)
 *   back     discarded from play, it goes to the hand instead
 * Each sentence (or run of sentences) is one clause below; one that isn't read keeps the Tool out.
 */
const TOOL_CLAUSES = [
  // Against some attackers only (`lessVs.from`, as engine.js attackerFits reads it); `spent`: then this card is discarded.
  [/^The Pokémon this card is attached to takes (\d+) less damage from attacks from your opponent's Pokémon that have an Ability \(after applying Weakness and Resistance\)$/, (m) => ({ lessVs: { n: Number(m[1]), from: { ability: true } } })],
  [/^If the Pokémon this card is attached to isn't a Mega Evolution Pokémon ex, it takes (\d+) less damage from attacks from your opponent's Mega Evolution Pokémon ex \(after applying Weakness and Resistance\)$/, (m) => ({ lessVs: { n: Number(m[1]), from: { mega: true } }, who: { notMega: true } })],
  [new RegExp(`^The (${'Grass|Fire|Water|Lightning|Psychic|Fighting|Darkness|Metal|Fairy|Dragon|Colorless'}) Pokémon this card is attached to takes (\\d+) less damage from attacks from your opponent's ((?:${'Grass|Fire|Water|Lightning|Psychic|Fighting|Darkness|Metal|Fairy|Dragon|Colorless'})(?:(?:, | or |, or )(?:${'Grass|Fire|Water|Lightning|Psychic|Fighting|Darkness|Metal|Fairy|Dragon|Colorless'}))*) Pokémon \\(after applying Weakness and Resistance\\)$`), (m) => ({ lessVs: { n: Number(m[2]), from: { types: m[3].split(/, or |, | or /) } }, who: { types: [m[1]] } })],
  [new RegExp(`^If the Pokémon this card is attached to is damaged by an attack from your opponent's (${'Grass|Fire|Water|Lightning|Psychic|Fighting|Darkness|Metal|Fairy|Dragon|Colorless'}) Pokémon, it takes (\\d+) less damage \\(after applying Weakness and Resistance\\), and discard this card$`), (m) => ({ lessVs: { n: Number(m[2]), from: { types: [m[1]] }, spent: true } })],
  // More damage against some, or from some holders only.
  [/^Attacks used by the Pokémon this card is attached to do (\d+) more damage to your opponent's Active Pokémon ex \(before applying Weakness and Resistance\)$/, (m) => ({ plusVs: { n: Number(m[1]), vs: ["ex"] } })],
  [/^Attacks used by the ([A-Z][\w'. -]*? ex) this card is attached to do (\d+) more damage to your opponent's Active Pokémon ex \(before applying Weakness and Resistance\)$/, (m) => ({ plusVs: { n: Number(m[2]), vs: ["ex"] }, who: { name: m[1] } })],
  [/^If the Pokémon this card is attached to doesn't have a Rule Box, the attacks it uses do (\d+) more damage to your opponent's Active Pokémon ex \(before applying Weakness and Resistance\)$/, (m) => ({ plusVs: { n: Number(m[1]), vs: ["ex"] }, who: { noRule: true } })],
  [/^Attacks used by the Poisoned Pokémon this card is attached to do (\d+) more damage to your opponent's Active Pokémon \(before applying Weakness and Resistance\)$/, (m) => ({ plus: Number(m[1]), poisoned: true })],
  [/^The ([A-Z][\w.]*)'s Pokémon this card is attached to gets \+(\d+) HP$/, (m) => ({ hp: Number(m[2]), who: { named: m[1] } })],
  // Sparkling Crystal: 1 Energy less, of any type.
  [/^When the Tera Pokémon this card is attached to uses an attack, that attack costs (\d+) Energy less\. \(The Energy can be of any type\.\)$/, (m) => ({ anyLess: Number(m[1]), who: { tera: true } })],
  // Lillie's Pearl.
  [/^If the ([A-Z][\w.]*)'s Pokémon this card is attached to is Knocked Out by damage from an attack from your opponent's Pokémon, that player takes (\d+) fewer Prize cards?$/, (m) => ({ fewer: Number(m[2]), who: { named: m[1] } })],
  // Backtrack Badge: Trick Coin's way, for the Pokémon of a type.
  [new RegExp(`^Once during your turn, after you flip any coins for an attack of the (${'Grass|Fire|Water|Lightning|Psychic|Fighting|Darkness|Metal|Fairy|Dragon|Colorless'}) Pokémon this card is attached to, you may ignore all results of those coin flips and begin flipping those coins again$`), (m) => ({ trick: true, who: { types: [m[1]] } })],
  // Powerglass.
  [/^At the end of your turn \(after your attack\), if the Pokémon this card is attached to is in the Active Spot, you may attach a Basic Energy card from your discard pile to it$/, () => ({ endTurn: { attach: "basicEnergy" } })],
  // Scarlet & Violet Tools.
  [/^If the Pokémon this card is attached to is in the Active Spot and is damaged by an attack from your opponent's Pokémon \(even if this Pokémon is Knocked Out\), draw (\d+) cards$/, (m) => ({ thorns: { draw: Number(m[1]) } })],
  [/^If the Pokémon this card is attached to has Weakness to your opponent's Active Pokémon's type, is in the Active Spot, and is damaged by an attack from your opponent's Pokémon \(even if this Pokémon is Knocked Out\), draw (\d+) cards$/, (m) => ({ thorns: { draw: Number(m[1]), weak: true } })],
  [/^If the Pokémon this card is attached to is in the Active Spot and is damaged by an attack from your opponent's Pokémon \(even if this Pokémon is Knocked Out\), put (\d+) damage counters on the Attacking Pokémon\. If you placed any damage counters in this way, discard this card$/, (m) => ({ thorns: { n: Number(m[1]) * 10, spent: true } })],
  [/^If the ((?:Team Rocket|[A-Z][a-zé]*(?: [A-Z][a-zé]*)?)'s) Pokémon this card is attached to is in the Active Spot and is damaged by an attack from your opponent's Pokémon \(even if this \1 Pokémon is Knocked Out\), the Attacking Pokémon is now (Asleep|Burned|Confused|Paralyzed|Poisoned)$/, (m) => ({ thorns: { status: m[2].toLowerCase() }, who: { owner: m[1] } })],
  [/^If the Pokémon this card is attached to is Knocked Out by damage from an attack from your opponent's Pokémon, search your deck for up to (\d+) cards and put them into your hand\. Then, shuffle your deck$/, (m) => ({ ko: { steps: [{ op: "search", what: "any", n: Number(m[1]), to: "hand" }] } })],
  [/^If the Pokémon this card is attached to has full HP and would be Knocked Out by damage from an attack from your opponent's Pokémon, it is not Knocked Out, and its remaining HP becomes (\d+)\. Then, discard this card$/, (m) => ({ sturdy: Number(m[1]) })],
  [/^Attacks used by the ((?:Team Rocket|[A-Z][a-zé]*(?: [A-Z][a-zé]*)?)'s) Pokémon this card is attached to cost ((?:Colorless)+) less and do (\d+) more damage to your opponent's Active Pokémon \(before applying Weakness and Resistance\)$/, (m) => ({ costLess: m[2].length / 9, plus: Number(m[3]), who: { owner: m[1] } })],
  [/^The Pokémon this card is attached to can use the attack on this card\. \(You still need the necessary Energy to use this attack\.\)$/, () => ({ lendSelf: true })],
  [/^If this card is attached to 1 of your Pokémon, discard it at the end of your turn$/, () => ({ lapse: "turn" })],
  [/^As long as the Pokémon this card is attached to is in the Active Spot, the Retreat Cost of both Active Pokémon is ((?:Colorless)+) more$/, (m) => ({ bothActive: m[1].length / 9 })],
  // Core Memory: the attack printed on it.
  [/^The ([A-Z][\w'. -]*?) this card is attached to can use the attack on this card\. \(You still need the necessary Energy to use this attack\.\)$/, (m) => ({ lendSelf: true, who: { name: m[1] } })],
  // Counter Gain: "If you have more Prize cards remaining than your opponent, attacks ... cost Colorless less."
  [/^If you have more Prize cards remaining than your opponent, attacks used by the Pokémon this card is attached to cost ((?:Colorless)+) less$/, (m) => ({ costLess: m[1].length / 9, behind: true })],
  // Rescue Board's second sentence.
  [/^If that Pokémon's remaining HP is (\d+) or less, it has no Retreat Cost$/, (m, out) => out.retreat != null && { freeAt: Number(m[1]) }],
  [/^Once during your turn, after you flip any coins for an attack of the Pokémon this card is attached to, you may ignore all effects of those coin flips and begin flipping those coins again\. \(You may only use effects that let you flip coins again, including effects from other cards, once during your turn\.\)$/, () => ({ trick: true })],
  [/^The Pokémon this card is attached to gets \+(\d+) HP$/, (m) => ({ hp: Number(m[1]) })],
  [/^The Retreat Cost of the Pokémon this card is attached to is ((?:Colorless)+) less$/, (m) => ({ retreat: m[1].length / 9 })],
  [/^The Retreat Cost of the Pokémon this card is attached to is ((?:Colorless)+) less, and it can retreat even if it's Asleep or Paralyzed$/, (m) => ({ retreat: m[1].length / 9, escape: true })],
  [/^The Pokémon this card is attached to has no Retreat Cost$/, () => ({ retreat: "all" })],
  [/^As long as this card is attached to a Pokémon, that Pokémon's Retreat Cost is 0$/, () => ({ retreat: "all" })],
  [/^The Pokémon this card is attached to has no Weakness$/, () => ({ noWeakness: true })],
  [/^As long as this card is attached to a Pokémon, that Pokémon has no Weakness$/, () => ({ noWeakness: true })],
  [/^(?:The attacks of|Attacks used by) the Pokémon this card is attached to do (\d+) more damage to (?:your opponent's|the) Active Pokémon(?: \(before applying Weakness and Resistance\))?$/, (m) => ({ plus: Number(m[1]) })],
  [/^Whenever an attack from the Pokémon that this card is attached to does damage to the Active Pokémon, the attack does (\d+) more damage \(before applying Weakness and Resistance\)$/, (m) => ({ plus: Number(m[1]) })],
  [/^If this card is attached to a (Darkness) Pokémon, each of the attacks of that Pokémon does (\d+) more damage to the Active Pokémon \(before applying Weakness and Resistance\)$/, (m) => ({ plus: Number(m[2]), who: { types: [m[1]] } })],
  [/^The Basic Pokémon this card is attached to gets \+(\d+) HP and its attacks do (\d+) more damage to your opponent's Active Pokémon \(before applying Weakness and Resistance\)$/, (m) => ({ hp: Number(m[1]), plus: Number(m[2]), who: { stage: "basic" } })],
  [/^The Pokémon this card is attached to gets \+(\d+) HP and that Pokémon's attacks do (\d+) more damage to your opponent's Active Pokémon \(before applying Weakness and Resistance\)$/, (m) => ({ hp: Number(m[1]), plus: Number(m[2]) })],
  [/^(?:Any damage done to|Damage done to) the Pokémon this card is attached to by (?:an opponent's |your opponent's )?attacks? is reduced by (\d+)(?: \(after applying Weakness and Resistance\))?$/, (m) => ({ less: Number(m[1]) })],
  [/^If the Pokémon this card is attached to is a Basic Pokémon, any damage done to this Pokémon by attacks is reduced by (\d+) \(after applying Weakness and Resistance\)$/, (m) => ({ less: Number(m[1]), who: { stage: "basic" } })],
  [/^The Pokémon this card is attached to takes (\d+) less damage from (?:your opponent's )?attacks(?: \(after applying Weakness and Resistance\))?$/, (m) => ({ less: Number(m[1]) })],
  // Only against some Active Pokémon: boostOf reads `plusVs` when the attack is made.
  [/^The attacks of the Pokémon this card is attached to do (\d+) more damage to your opponent's Active Pokémon-GX or Active Pokémon-EX \(before applying Weakness and Resistance\)$/, (m) => ({ plusVs: { n: Number(m[1]), vs: ["GX", "EX"] } })],
  [/^The attacks of the Pokémon this card is attached to do (\d+) more damage to your opponent's Active Pokémon V \(before applying Weakness and Resistance\)$/, (m) => ({ plusVs: { n: Number(m[1]), vs: ["V", "VMAX", "VSTAR"] } })],
  // Knocked Out.
  [/^When the Pokémon this card is attached to is Knocked Out, your opponent takes (\d+) more Prize cards?$/, (m) => ({ prize: Number(m[1]) })],
  [/^If the Pokémon this card is attached to is your Active Pokémon and is Knocked Out by damage from an opponent's attack, move up to (\d+) basic Energy cards from that Pokémon to 1 of your Benched Pokémon$/, (m) => ({ ko: { active: true, baton: Number(m[1]) } })],
  // Heavy Baton.
  [/^If the Pokémon this card is attached to has a Retreat Cost of exactly (\d+), is in the Active Spot, and is Knocked Out by damage from an attack from your opponent's Pokémon, move up to (\d+) Basic Energy cards from that Pokémon to your Benched Pokémon in any way you like$/, (m) => ({ ko: { active: true, baton: Number(m[2]), spread: true, retreat: Number(m[1]) } })],
  // Tremendous Bomb.
  [/^If the Pokémon this card is attached to isn't a Mega Evolution Pokémon ex, is in the Active Spot, and takes (\d+) or more damage from an attack from your opponent's Mega Evolution Pokémon ex \(even if this Pokémon is Knocked Out\), place (\d+) damage counters on the Attacking Pokémon\. If you placed any damage counters in this way, discard this card$/, (m) => ({ thorns: { n: Number(m[2]) * 10, spent: true, min: Number(m[1]), mega: true }, who: { notMega: true } })],
  // Handheld Fan.
  [/^If the Pokémon this card is attached to is in the Active Spot and is damaged by an attack from your opponent's Pokémon \(even if this Pokémon is Knocked Out\), move an Energy from the Attacking Pokémon to 1 of your opponent's Benched Pokémon$/, () => ({ thorns: { fan: true } })],
  [/^When your Active Pokémon is Knocked Out by damage from (?:an opponent's attack|an attack from your opponent's Pokémon), you may move (?:1|a) [Bb]asic Energy(?: card)?(?: that was attached to| from) that Pokémon to the Pokémon this card is attached to$/, () => ({ share: 1 })],
  [/^If the Pokémon this card is attached to is Knocked Out by damage from an opponent's attack, put all basic Energy attached to that Pokémon into your hand$/, () => ({ ko: { energyToHand: true } })],
  [/^If the Pokémon this card is attached to is Knocked Out by damage from an attack, put that Pokémon into your hand\. \(Discard all cards attached to that Pokémon\.\)$/, () => ({ ko: { toHand: true, any: true } })],
  [/^When the Pokémon this card is attached to is Knocked Out by damage from an opponent's attack, draw cards until you have (\d+) cards in your hand$/, (m) => ({ ko: { steps: [{ op: "drawTo", n: Number(m[1]) }] } })],
  [/^When the Team Plasma Pokémon this card is attached to is Knocked Out by damage from an opponent's attack, search your deck for a card and put it into your hand\. Shuffle your deck afterward$/, () => ({ ko: { steps: [{ op: "search", what: "any", n: 1, to: "hand" }] }, who: { plasma: true } })],
  // Damaged in the Active Spot.
  [/^If the Pokémon this card is attached to is your Active Pokémon and is damaged by an opponent's attack \(even if that Pokémon is Knocked Out\), put (\d+) damage counters on the Attacking Pokémon$/, (m) => ({ thorns: { n: Number(m[1]) * 10 } })],
  [/^If the (Darkness) Pokémon this card is attached to is in the Active Spot and is damaged by an attack from your opponent's Pokémon \(even if this Pokémon is Knocked Out\), place (\d+) damage counters on the Attacking Pokémon$/, (m) => ({ thorns: { n: Number(m[2]) * 10 }, who: { types: [m[1]] } })],
  [/^Whenever the Pokémon this card is attached to is your Active Pokémon and is damaged by an opponent's attack \(even if that Pokémon is Knocked Out\), draw (\d+) cards$/, (m) => ({ thorns: { draw: Number(m[1]) } })],
  [/^During your opponent's turn, if the Pokémon this card is attached to is your Active Pokémon and an opponent's attack damages it \(even if it is Knocked Out\), flip a coin\. If heads, put (\d+) damage counters on the Defending Pokémon\. Then, discard this card$/, (m) => ({ thorns: { n: Number(m[1]) * 10, flip: true, spent: true } })],
  // Other times.
  [/^Whenever you attach an Energy card from your hand to the Pokémon this card is attached to, heal (\d+) damage from it$/, (m) => ({ attachHeal: Number(m[1]) })],
  [/^If the Pokémon this card is attached to is your Active Pokémon at the end of your turn, draw a card$/, () => ({ endTurn: { draw: 1 } })],
  [/^If the Pokémon this card is attached to is your Active Pokémon at the end of your turn, remove (\d+) damage counters? from the Pokémon$/, (m) => ({ endTurn: { heal: Number(m[1]) * 10 } })],
  [/^At any time between turns, if there are at least (\d+) damage counters on the Pokémon this card is attached to, you may remove \1 of them and discard this card$/, (m) => ({ between: { heal: Number(m[1]) * 10 } })],
  // Berry's second sentence says the same for the start of a turn, which is between turns too.
  [/^At the start of each turn, if there are at least (\d+) damage counters on the Pokémon this card is attached to, remove \1 of them and discard this card$/, (m, out) => out.between?.heal === Number(m[1]) * 10 && {}],
  [/^At any time between turns, if the Pokémon this card is attached to has at least (\d+) damage counters on it, remove \1 damage counters from it\. Then, discard this card$/, (m) => ({ between: { heal: Number(m[1]) * 10 } })],
  [/^At any time between turns, if the Pokémon this card is attached to is affected by any Special Conditions, remove all of them\. Then discard this card$/, () => ({ between: { cure: true } })],
  [/^When the Pokémon this card is attached to retreats, discard this card instead of discarding Energy cards$/, () => ({ balloon: true })],
  [/^At the end of your opponent's turn after you played this card, discard this card$/, () => ({ lapse: "foe" })],
  [/^Discard this card at the end of the turn in which this Pokémon attacks$/, () => ({ lapse: "attack" })],
  [/^If this card is discarded from play, put it into your hand instead of the discard pile$/, () => ({ back: true })],
  // Who it may go on, and when it falls off (the old cards spell out the one-Tool rule and the Knock Out).
  [/^Attach this card to 1 of your Pokémon(?: in play)? that doesn't (?:already )?have a Pokémon Tool attached to it$/, () => ({})],
  [/^If that Pokémon is Knocked Out, discard this card$/, () => ({})],
  [/^Attach this card to 1 of your Pokémon \(excluding Pokémon-ex and Pokémon that has Dark or an owner in its name\) that doesn't already have a Pokémon Tool attached to it$/, () => ({ only: { noEx: true, noDark: true, noOwner: true } })],
  [/^If the Pokémon this card is attached to is Pokémon-ex or has Dark or an owner in its name, discard this card$/, (m, out) => out.only?.noOwner && { only: { ...out.only, drop: true } }],
  [/^Attach this card to 1 of your Evolved Pokémon \(excluding Pokémon-ex\) that doesn't already have a Pokémon Tool attached to it$/, () => ({ only: { evolved: true, noEx: true } })],
  [/^If the Pokémon this card is attached to is a Basic Pokémon or Pokémon-ex, discard this card$/, (m, out) => out.only?.evolved && { only: { ...out.only, drop: true } }],
];
export function compileTool(text, cardName = "") {
  let clean = tidy(text).replace(/\s*\([^()]*have Rule Boxes\.\)/g, "");
  if (!clean) return null;
  // Older Tools name themselves where newer ones say "this card".
  if (cardName) clean = clean.split(cardName).join("this card");
  const sentences = clean.split(/(?<=\.\)?)\s+(?=[A-Z])/);
  const out = {};
  // A clause may run over several sentences ("flip a coin. If heads, ... Then, discard this card."): the shortest run that reads.
  for (let i = 0; i < sentences.length; ) {
    let read = 0;
    for (let j = i; j < sentences.length && !read; j += 1) {
      const said = sentences.slice(i, j + 1).join(" ").replace(/\.$/, "");
      for (const [pattern, build] of TOOL_CLAUSES) {
        const m = said.match(pattern);
        const got = m && build(m, out);
        if (got) {
          Object.assign(out, got);
          read = j + 1 - i;
          break;
        }
      }
    }
    if (!read) return null;
    i += read;
  }
  const { only, ...rest } = out;
  // Nothing but the one-Tool rule read: not a Tool that does anything yet.
  return Object.keys(rest).length ? out : null;
}

/** May this Tool go on (or stay on) this Pokémon? */
export function toolFits(tool, def) {
  const only = tool?.only;
  if (!only) return true;
  if (only.evolved && def.stage !== "evolution") return false;
  if (only.noEx && def.box === "ex") return false;
  if (only.noDark && /^Dark /.test(def.name)) return false;
  if (only.noOwner && /^[\w.-]+(?: [\w.-]+)?'s /.test(def.name)) return false;
  return true;
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

/**
 * Stadiums worded their own way, as printed (the old Gyms above all), read whole:
 *   field (as above), and for `who` also { holds: [types] } (has any of that Energy attached),
 *   { named } / { notNamed } (has that name in its own: Misty, Steven's, Dark), { notTypes }
 *   use with often (no once-a-turn limit) and loss (it gives up the player's own cards: the bot leaves it alone)
 *   benchHurt { n, who, fromHand }  damage on a Basic Pokémon put onto its owner's Bench during their turn
 *   evolveHeal { n, who }           damage removed from a Pokémon that fits as it evolves
 */
const FOSSILS = ["Omanyte", "Kabuto", "Aerodactyl", "Aerodactyl ex", "Lileep", "Anorith"];
const STADIUM_TEXTS = [
  // Abilities taken away by rule box.
  [/^Pokémon-GX and Pokémon-EX in play \(both yours and your opponent's\) have no Abilities\.$/, () => ({ lock: { boxes: ["GX", "EX"] } })],
  [/^Pokémon with a Rule Box in play \(both yours and your opponent's\) have no Abilities\. \(Pokémon V, Pokémon-GX, etc\. have Rule Boxes\.\)$/, () => ({ lock: { rule: true } })],
  [new RegExp(`^Once during each player's turn, that player may heal (\\d+) damage from each of (?:his or her|their) (${TYPE_WORD}) Pokémon and (${TYPE_WORD}) Pokémon\\.$`), (m) => ({ use: [{ op: "healEach", n: Number(m[1]), types: [m[2], m[3]] }] })],
  [/^Once during each player's turn, that player may draw cards until he or she has (\d+) cards in his or her hand\. If he or she does, that player's turn ends\.$/, (m) => ({ use: [{ op: "drawTo", n: Number(m[1]) }, { op: "endTurn" }] })],
  [/^Once during each player's turn, that player may shuffle their hand into their deck and draw (\d+) cards\. If they do, their turn ends\.$/, (m) => ({ use: [{ op: "shuffleHand" }, { op: "draw", n: Number(m[1]) }, { op: "endTurn" }], loss: true })],
  [/^Once during each player's turn, that player may flip a coin\. If heads, the player draws a card\.$/, () => ({ use: [{ op: "flip", heads: [{ op: "draw", n: 1 }] }] })],
  [/^Once during each player's turn, the player may flip a coin until he or she gets tails\. For each heads, that player draws a card\.$/, () => ({ use: [{ op: "flipDraw" }] })],
  [/^Whenever either player puts a Basic Pokémon from their hand onto their Bench, put (\d+) damage counters on that Pokémon\.$/, (m) => ({ benchHurt: { n: Number(m[1]) * 10, who: {}, fromHand: true } })],
  [/^Whenever any player puts a Basic Pokémon \(except for (Team Magma) Pokémon\) from his or her hand onto his or her Bench, put (\d+) damage counters on that Pokémon\.$/, (m) => ({ benchHurt: { n: Number(m[2]) * 10, who: { notNamed: m[1] }, fromHand: true } })],
  [/^The Retreat Cost of each Pokémon in play \(except for (Team Aqua) Pokémon\) is ((?:Colorless)+) more\.$/, (m) => ({ field: [{ who: { notNamed: m[1] }, mod: { retreat: -m[2].length / 9 } }] })],
  [/^Put (\d+) more damage counters on Poisoned Pokémon \(both yours and your opponent's\) between turns\.$/, (m) => ({ poisonMore: { n: Number(m[1]) * 10, who: {} } })],
  // Academy at Night: a card from the hand back on top of the deck (the bot leaves it alone: it would only stall).
  [/^Once during each player's turn, that player may put a card from their hand on top of their deck\.$/, () => ({ use: [{ op: "stash", n: 1, at: "top", need: true, spare: 0 }], loss: true })],
  // Lively Stadium.
  [/^Each Basic Pokémon in play \(both yours and your opponent's\) gets \+(\d+) HP\.$/, (m) => ({ field: [{ who: { stage: "basic" }, mod: { hp: Number(m[1]) } }] })],
  // N's Castle, Postwick: the Pokémon of an owner.
  [/^((?:Team Rocket|[A-Z][a-zé]*(?: [A-Z][a-zé]*)?)'s) Pokémon in play \(both yours and your opponent's\) have no Retreat Cost\.$/, (m) => ({ field: [{ who: { owner: m[1] }, mod: { retreat: "all" } }] })],
  [/^Attacks used by ((?:Team Rocket|[A-Z][a-zé]*(?: [A-Z][a-zé]*)?)'s) Pokémon \(both yours and your opponent's\) do (\d+) more damage to the opponent's Active Pokémon \(before applying Weakness and Resistance\)\.$/, (m) => ({ field: [{ who: { owner: m[1] }, mod: { plus: Number(m[2]) } }] })],
  // Full Metal Lab.
  [new RegExp(`^(${TYPE_WORD}) Pokémon \\(both yours and your opponent's\\) take (\\d+) less damage from attacks from the opponent's Pokémon \\(after applying Weakness and Resistance\\)\\.$`), (m) => ({ field: [{ who: { types: [m[1]] }, mod: { less: Number(m[2]) } }] })],
  // Gravity Mountain.
  [/^Each Stage (1|2) Pokémon in play \(both yours and your opponent's\) gets -(\d+) HP\.$/, (m) => ({ field: [{ who: { line: Number(m[1]) }, mod: { hp: -Number(m[2]) } }] })],
  // Nighttime Mine.
  [/^Attacks used by each Tera Pokémon in play \(both yours and your opponent's\) cost ((?:Colorless)+) more\.$/, (m) => ({ field: [{ who: { tera: true }, mod: { costMore: m[1].length / 9 } }] })],
  // Jamming Tower.
  [/^Pokémon Tools attached to each Pokémon \(both yours and your opponent's\) have no effect\.$/, () => ({ toolLock: true })],
  // Team Rocket's Watchtower, Legendary Pyroduct.
  [new RegExp(`^(${TYPE_WORD}|Evolution|Basic) Pokémon in play \\(both yours and your opponent's\\) have no Abilities\\.$`), (m) => ({ lock: m[1] === "Evolution" ? { stage: "evolution" } : m[1] === "Basic" ? { stage: "basic" } : { types: [m[1]] } })],
  // Legendary Summit.
  [new RegExp(`^Whenever an? (${TYPE_WORD}) Pokémon \\(yours or your opponent's\\) is Knocked Out by damage from an attack from the opponent's Pokémon, that player takes (\\d+) fewer Prize cards?\\.$`), (m) => ({ fewer: { who: { types: [m[1]] }, n: Number(m[2]) } })],
  // Perilous Jungle.
  [new RegExp(`^During Pokémon Checkup, put (\\d+) more damage counters on each Poisoned non-(${TYPE_WORD}) Pokémon \\(both yours and your opponent's\\)\\.$`), (m) => ({ poisonMore: { n: Number(m[1]) * 10, who: { notTypes: [m[2]] } } })],
  // Lumiose City.
  [/^Once during each player's turn, that player may search their deck for a Basic Pokémon and put it onto their Bench\. Then, that player shuffles their deck\. If a player searches their deck in this way, their turn ends\.$/, () => ({ use: [{ op: "search", what: "basic", n: 1, to: "bench" }, { op: "endTurn" }] })],
  // Fossil Quarry.
  [/^Once during each player's turn, that player may search their deck for up to (\d+) Item cards that have "(Antique)" in their name and put them onto their Bench\. Then, that player shuffles their deck\.$/, (m) => ({ use: [{ op: "search", what: `item~${m[2]}`, n: Number(m[1]), to: "bench" }] })],
  // Community Center, Team Rocket's Factory.
  [/^Once during each player's turn, if they played a Supporter card from their hand this turn, they may heal (\d+) damage from each of their Pokémon\.$/, (m) => ({ use: [{ op: "only", when: { played: "supporter" } }, { op: "healEach", n: Number(m[1]) }] })],
  [/^Once during each player's turn, if they played a Supporter card that has "([^"]+)" in its name from their hand this turn, they may draw (\d+) cards\.$/, (m) => ({ use: [{ op: "only", when: { played: `supporter~${m[1]}` } }, { op: "draw", n: Number(m[2]) }] })],
  // Forest of Vitality.
  [new RegExp(`^Each player's (${TYPE_WORD}) Pokémon can evolve into \\1 Pokémon during the turn they play those Pokémon, except during their first turn\\.$`), (m) => ({ grow: { types: [m[1]] } })],
  [/^Whenever a player attacks with a Pokémon with (Lt\. Surge) in its name, he or she may flip a coin\. If heads, and if that Pokémon's attack does damage to the Defending Pokémon \(after applying Weakness and Resistance\), that attack does (\d+) more damage to the Defending Pokémon\. If tails, the attacking Pokémon does (\d+) damage to itself in addition to whatever its attack usually does\.$/, (m) => ({ surge: { who: { named: m[1] }, more: Number(m[2]), self: Number(m[3]) } })],
  [/^Once during each player's turn, that player may search their deck for a Basic Water Pokémon or Basic Fighting Pokémon and, put it onto their Bench, and shuffle their deck\.$/, () => ({ use: [{ op: "search", what: "basic:Water|basic:Fighting", n: 1, to: "bench" }] })],
  [/^Once during each player's turn, that player may search their deck for a Marnie's Pokémon, reveal it, and put it into their hand\. Then, that player shuffles their deck\.$/, () => ({ use: [{ op: "search", what: "name^Marnie's", n: 1, to: "hand" }] })],
  [/^Once during each player's turn, that player may heal (\d+) damage from each of his or her (Water) Pokémon and (Lightning) Pokémon\.$/, (m) => ({ use: [{ op: "healEach", n: Number(m[1]), types: [m[2], m[3]] }] })],
  [/^Once during each player's turn, that player may discard a (Fire) or (Fighting) Energy card from his or her hand\. If that player does so, he or she draws (\d+) cards\.$/, (m) => ({ use: [{ op: "cost", n: 1, what: `basicEnergy:${m[1]}|basicEnergy:${m[2]}`, spare: 0 }, { op: "draw", n: Number(m[3]) }] })],
  [/^Once during each player's turn, that player may heal (\d+) damage from 1 of his or her Benched Pokémon\.$/, (m) => ({ use: [{ op: "healOne", n: Number(m[1]), where: "bench" }] })],
  [/^Once during each player's turn, that player may flip a coin\. If heads, the player searches his or her discard pile for a basic Energy card, shows it to his or her opponent, and put it into his or her hand\.$/, () => ({ use: [{ op: "flip", heads: [{ op: "recover", what: "basicEnergy", n: 1 }] }] })],
  [/^Once during each player's turn \(before attacking\), that player may flip a coin\. If heads, that player puts a basic Energy card from his or her discard pile into his or her hand\.$/, () => ({ use: [{ op: "flip", heads: [{ op: "recover", what: "basicEnergy", n: 1 }] }] })],
  [/^Once during each player's turn, if the player has no Special Energy cards in his or her discard pile, that player searches his or her discard pile for a basic Energy card, show it to the opponent, and put it into his or her hand\.$/, () => ({ use: [{ op: "noSpecialDiscard" }, { op: "recover", what: "basicEnergy", n: 1 }] })],
  [/^Once during each player's turn, that player may discard an Energy card from their hand in order to draw cards until they have as many cards in their hand as they have (Psychic) Pokémon in play\.$/, (m) => ({ use: [{ op: "cost", n: 1, what: "energy", spare: 0 }, { op: "drawToCount", type: m[1] }] })],
  [/^During each player's turn, that player may choose to discard an Energy card attached to 1 of his or her Pokémon with (Erika) in its name\. If that player does so, that Pokémon is no longer Asleep, Confused, Paralyzed, or Poisoned\.$/, (m) => ({ use: [{ op: "shed", who: { named: m[1] } }, { op: "cure" }], often: true })],
  [/^As often as each player like during his or her turn \(before attacking\), that player may return 1 basic Energy card attached to 1 of his or her Pokémon with (Sabrina) in its name to his or her hand\.$/, (m) => ({ use: [{ op: "takeBack", who: { named: m[1] } }], often: true, loss: true })],
  [/^Once during each player's turn \(before attacking\), that player may flip a coin\. If heads, that player may shuffle 1 of his or her Pokémon in play with (Koga) in its name and any cards attached to it into his or her deck\.$/, (m) => ({ use: [{ op: "flip", heads: [{ op: "shuffleIn", who: { named: m[1] } }] }], loss: true })],
  [/^Once during each player's turn, that player may put an Omanyte, Kabuto, Aerodactyl, Aerodactyl ex, Lileep, or Anorith onto his or her Bench from his or her hand\. Treat the new Benched Pokémon as Basic Pokémon\.$/, () => ({ use: [{ op: "benchAs", names: FOSSILS }] })],
  [/^(Fire) Pokémon and (Metal) Pokémon \(both yours and your opponent's\) have no Weakness\.$/, (m) => ({ field: [{ who: { types: [m[1], m[2]] }, mod: { noWeakness: true } }] })],
  [/^The Retreat Cost of each Pokémon \(both yours and your opponent's\) that has any (Psychic) or (Darkness) Energy attached to it is ((?:Colorless)+) less\.$/, (m) => ({ field: [{ who: { holds: [m[1], m[2]] }, mod: { retreat: m[3].length / 9 } }] })],
  [/^Each Pokémon that has any (Fairy) Energy attached to it \(both yours and your opponent's\) has no Retreat Cost\.$/, (m) => ({ field: [{ who: { holds: [m[1]] }, mod: { retreat: "all" } }] })],
  [/^Each Pokémon that has any (Darkness) Energy attached to it \(both yours and your opponent's\) has no Weakness\.$/, (m) => ({ field: [{ who: { holds: [m[1]] }, mod: { noWeakness: true } }] })],
  [/^(Steven's) Pokémon \(both yours and your opponent's\) take (\d+) less damage from attacks from the opponent's Pokémon \(after applying Weakness and Resistance\)\.$/, (m) => ({ field: [{ who: { named: m[1] }, mod: { less: Number(m[2]) } }] })],
  [/^Each player pays ((?:Colorless)+) less to retreat his or her Pokémon if it has (Misty) in its name\.$/, (m) => ({ field: [{ who: { named: m[2] }, mod: { retreat: m[1].length / 9 } }] })],
  [/^Don't apply Resistance to any attacks made by Pokémon with (Brock) in their names\.$/, (m) => ({ field: [{ who: { named: m[1] }, mod: { pierce: true } }] })],
  [/^Ignore Weakness when a (Water) Pokémon does damage to a Pokémon with (Blaine) in its name\.$/, (m) => ({ field: [{ who: { named: m[2] }, mod: { noWeaknessVs: [m[1]] } }] })],
  [/^Whenever a Pokémon with (Giovanni) in its name evolves, its owner removes (\d+) damage counters from that Pokémon \(or 1 if it only has 1\)\.$/, (m) => ({ evolveHeal: { n: Number(m[2]) * 10, who: { named: m[1] } } })],
  [/^Each Pokémon in play with (Dark) in its name \(even your opponent's\) gets \+(\d+) HP\.$/, (m) => ({ field: [{ who: { named: m[1] }, mod: { hp: Number(m[2]) } }] })],
  // Dizzying Valley (engine.js clearConditions keeps Confusion).
  [/^Confused Pokémon \(both yours and your opponent's\) don't recover from that Special Condition when they evolve or devolve\.$/, () => ({ keepConfused: true })],
  // Ange Floette: only over a Prism Tower in play, the same turn too (engine.js trainerBlock); more HP for a Pokémon by name.
  [/^You can put this card into play only if you discard an? ([A-Z][\w'é.-]*(?: [A-Z][\w'é.-]*)*) in play, and you can put this card into play during the same turn you play \1\. Each ([A-Z][\w'é.-]*(?: [A-Z][\w'é.-]*)*(?: ex)?) in play \(both yours and your opponent's\) gets \+(\d+) HP\.$/, (m) => ({ over: m[1], field: [{ who: { name: m[2] }, mod: { hp: Number(m[3]) } }] })],
  // Festival Grounds: while it has any Energy attached, a Pokémon has no Special Conditions (engine.js sweepConditions).
  [/^Each Pokémon that has any Energy attached \(both yours and your opponent's\) recovers from all Special Conditions and can't be affected by any Special Conditions\.$/, () => ({ field: [{ who: { energized: true }, mod: { immune: ["all"] } }] })],
  [/^Each player's (Darkness) Pokémon can't be (Asleep), (Confused), or (Paralyzed)\.$/, (m) => ({ field: [{ who: { types: [m[1]] }, mod: { immune: [m[2], m[3], m[4]].map((w) => w.toLowerCase()) } }] })],
  [/^Each Pokémon that does not have (Team Aqua) in its name pays ((?:Colorless)+) more to retreat\.$/, (m) => ({ field: [{ who: { notNamed: m[1] }, mod: { retreat: -m[2].length / 9 } }] })],
  [/^Whenever any player puts a Basic non-(Darkness) Pokémon onto their Bench during their turn, place (\d+) damage counters on that Pokémon\.$/, (m) => ({ benchHurt: { n: Number(m[2]) * 10, who: { notTypes: [m[1]] } } })],
  [/^Whenever any player plays a Basic Pokémon that doesn't have (Team Magma) in its name from his or her hand, that player puts (\d+) damage counters? on that Pokémon\.$/, (m) => ({ benchHurt: { n: Number(m[2]) * 10, who: { notNamed: m[1] }, fromHand: true } })],
];

export function compileStadium(text) {
  // "This card stays in play after being played. Discard this card if another Stadium card comes into play.": every Stadium does.
  const clean = tidy(text).replace(/^This card stays in play after being played\. Discard this card if another Stadium card comes into play\. /, "");
  for (const [pattern, build] of STADIUM_TEXTS) {
    const m = clean.match(pattern);
    if (m) return build(m);
  }
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

/** "Has Misty in its name": the name as a word of its own, or before "'s" ("Misty's Seadra"). */
const named = (def, name) => new RegExp(`(?:^| )${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:'s)?(?: |$)`).test(def.name);

/** Does a Stadium's standing change reach this Pokémon? */
export function fieldFits(who, def) {
  // Old Darkness Energy: a Darkness Pokémon, or one with "Dark" in its name.
  if (who.dark && /^Dark /.test(def.name)) return true;
  if (who.types && !who.types.some((t) => def.types.includes(t))) return false;
  if (who.notTypes && who.notTypes.some((t) => def.types.includes(t))) return false;
  if (who.stage && def.stage !== who.stage) return false;
  if (who.name && def.name !== who.name) return false;
  if (who.named && !named(def, who.named)) return false;
  // "Team Rocket's Pokémon", "Hop's Pokémon": the owner's name the card's own name starts with.
  if (who.owner && !def.name.startsWith(`${who.owner} `)) return false;
  if (who.notNamed && named(def, who.notNamed)) return false;
  if (who.plasma && !def.plasma) return false;
  // Special Energy that gives more on some Pokémon: not on these rule boxes, only on δ Pokémon.
  if (who.notBoxes && who.notBoxes.includes(def.box)) return false;
  // A Stadium's lock by rule box ("Pokémon-GX and Pokémon-EX in play", "Pokémon with a Rule Box").
  if (who.boxes && !who.boxes.includes(def.box)) return false;
  if (who.rule && !def.rule) return false;
  if (who.delta && !/δ/.test(def.name)) return false;
  if (who.noRule && def.rule) return false;
  if (who.line && def.line !== who.line) return false;
  if (who.notMega && def.box === "ex" && /^Mega /.test(def.name)) return false;
  if (who.tera && !def.tera) return false;
  // "Your Future Pokémon, except any Iron Crown ex": a kind the card prints, and a name left out.
  if (who.tag && !(def.tags || []).includes(who.tag)) return false;
  if (who.notName && def.name === who.notName) return false;
  if (who.names && !who.names.includes(def.name)) return false;
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
    if (ctx.state.pending.length > before) {
      const waiting = ctx.state.pending[ctx.state.pending.length - 1];
      // A step that ran steps of its own (a coin flip, a "Choose 1") may have left some waiting already: ours go after.
      if (i < steps.length - 1) waiting.then = [...(waiting.then || []), ...steps.slice(i + 1)];
      if (ctx.spot != null && waiting.from == null) waiting.from = ctx.spot;
      if (ctx.src) waiting.src = ctx.src;
      if (ctx.uid) waiting.card = ctx.uid;
      if (waiting.player !== ctx.player && waiting.by == null) waiting.by = ctx.player;
      return;
    }
  }
}

/** For the bot and the screen: what a Trainer is for, by its first step that matters. */
export function trainerAim(steps) {
  // A coin's sides, a "Choose 1", a step done for each heads: what they would do counts.
  const inner = (s) => (s.op === "flip" ? [...s.heads, ...(s.tails || [])] : s.op === "choice" ? s.options.flatMap((o) => o.steps) : s.op === "flipEach" ? [s.step] : s.op === "flipAll" ? s.heads : [s]);
  const ops = steps.flatMap(inner).flatMap(inner).map((s) => s.op);
  // Ending the turn, or what the bot can't judge yet (its own Pokémon moved about, cards put in order, the other hand): left alone.
  if (["endTurn", "arrange", "toBottomOf", "newActive", "lift", "devolve", "swapBasic", "moveAll", "trainersBack", "foeBasicsOut", "handLimit", "confuseBoth", "mill", "searchMill", "tossTo", "prizeSwap", "prizeUp", "foeTopBench", "markOne", "healBoth", "swapTop", "teamGuard", "selfIn", "foeDevolve", "topMill", "selfCondition", "selfTop"].some((op) => ops.includes(op)) && !ops.includes("topTake")) return "move";
  if (ops.includes("energyOff")) return steps.some((s) => s.op === "energyOff" && s.move) ? "move" : "hammer";
  if (ops.includes("dropFoeTools")) return "tools";
  // PlusPower and Defender ride on a Pokémon; Defender is about not being hurt, which the bot doesn't plan for.
  if (ops.includes("hold")) return steps.some((s) => s.op === "hold" && s.mod.less) ? "move" : "counters";
  if (ops.includes("keepOne") || ops.includes("evenHand") || ops.includes("freshHands")) return "refresh";
  if (ops.includes("toss") || ops.includes("drawPaid")) return "trade";
  if (ops.includes("revealUntil") || ops.includes("topSort")) return "search";
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
  // More damage this turn: it is about hurting their Pokémon, and needs an attack to follow (unless it draws too).
  if (ops.includes("boost")) return ops.includes("draw") || ops.includes("drawTo") ? "draw" : "counters";
  if (ops.includes("topTake")) return "search";
  if (ops.includes("recycle")) return "recover";
  if (ops.includes("handBottom")) return "refresh";
  if (ops.includes("foeSwitch")) return "gust";
  if (ops.includes("cost")) return "trade";
  if (ops.includes("search") || ops.includes("sameName")) return "search";
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
