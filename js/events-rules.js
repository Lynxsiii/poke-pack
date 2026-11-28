/**
 * Weekly events and weekly prizes: the rules the Worker (worker/events.js) and
 * the page (js/events-page.js) share.
 *
 * Everything here is OFF until Noah says yes. EVENTS_MODE decides whether an
 * event runs at all, EVENT_REWARDS whether any of it pays coins. Both are
 * plain constants so turning the feature on is a one-line change that goes
 * through a pull request like any other.
 */
import { PLAYABLE_SETS } from "./catalog.js";
import { isHit } from "./engine.js";
import { weekOf, weekStart } from "./rankings-rules.js";

/**
 * "off": no event, no page, no cron work.
 * "preview": the cron scores the week and the page works, but only for the
 *   owner (isBetaAdmin in worker/beta.js). Everyone else sees nothing.
 * "on": everyone gets the event and the Events tab.
 */
export const EVENTS_MODE = "off";
/** Coins for steps, the community goal and board places. False pays nothing and the page shows no amounts. */
export const EVENT_REWARDS = false;

export { weekOf, weekStart };

/* ------------------------------------------------------------------ */
/* What an event is                                                     */
/* ------------------------------------------------------------------ */

/**
 * Four kinds, all scored from pack_log, the server's own record of the packs
 * it rolled. Only a pack the player paid for scores (cost above zero), so
 * battle packs, which land in the log at zero, never do.
 *  - set:  a point for every pack of the featured set.
 *  - hits: a point for every hit pulled, from any set.
 *  - type: a point for every Pokémon of the week's type, from any set.
 *  - era:  a point for every pack from the week's era.
 */
export const EVENT_KINDS = ["set", "hits", "type", "era"];

/** Points for each step of a player's own track, and what each pays. Ids are stored in event_claims: never renumber. */
export const STEPS = {
  set: [5, 15, 30, 60],
  era: [5, 15, 30, 60],
  type: [5, 15, 30, 60],
  hits: [2, 5, 10, 20],
};
export const STEP_COINS = [50, 100, 150, 200];

/** The community goal: this many points for every player who scored the week before, never below the floor. */
export const GOAL_PER_PLAYER = { set: 12, era: 12, type: 12, hits: 4 };
export const GOAL_FLOOR = { set: 150, era: 150, type: 150, hits: 50 };
/** What reaching it pays each player who got to their own first step. */
export const GOAL_COINS = 100;

export const TYPES = ["Grass", "Fire", "Water", "Lightning", "Psychic", "Fighting", "Darkness", "Metal", "Dragon", "Colorless"];
/** Eras a throwback week can land on. The newest era and Japanese sets get set weeks instead. */
export const THROWBACK_ERAS = [
  "Scarlet & Violet",
  "Sword & Shield",
  "Sun & Moon",
  "XY",
  "Black & White",
  "HeartGold & SoulSilver",
  "Diamond & Pearl",
  "EX",
  "Wizards of the Coast",
];

/** Sets a set week can feature: ones with packs to buy. */
export const featuredSets = () => PLAYABLE_SETS.filter((set) => set.live !== false && Number(set.cost) > 0);

/**
 * A week pinned by hand wins over the rotation. Key is the week number
 * (weekOf), value is { kind, setId | type | era, goal? }.
 */
export const PINNED = {};

// Small deterministic generator (mulberry32), the one js/quests.js uses.
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pickFrom = (list, week) => list[Math.floor(seeded(week * 7919 + 13)() * list.length)];

/** The event for a week number. Same week, same event, on the Worker and the page, with nothing stored. */
export function eventFor(week) {
  const pin = PINNED[week];
  const kind = pin?.kind || EVENT_KINDS[((week % 4) + 4) % 4];
  const out = { week, kind, starts: weekStart(week), ends: weekStart(week + 1), steps: STEPS[kind], goal: pin?.goal || null };
  if (kind === "set") {
    const sets = featuredSets();
    const set = sets.find((row) => row.id === pin?.setId) || pickFrom(sets, week);
    return { ...out, setId: set.id, title: `${set.name} week`, rule: `Every ${set.name} pack you buy and rip is a point.`, unit: "pack" };
  }
  if (kind === "hits") return { ...out, title: "Hit hunt", rule: "Every hit you pull from a pack you bought is a point. Any set.", unit: "hit" };
  if (kind === "type") {
    const type = TYPES.includes(pin?.type) ? pin.type : pickFrom(TYPES, week);
    return { ...out, type, title: `${type} week`, rule: `Every ${type} Pokémon you pull from a pack you bought is a point. Any set.`, unit: "card" };
  }
  const era = THROWBACK_ERAS.includes(pin?.era) ? pin.era : pickFrom(THROWBACK_ERAS, week);
  return { ...out, era, title: `${era} throwback`, rule: `Every ${era} pack you buy and rip is a point.`, unit: "pack" };
}

const ERA_OF = new Map(PLAYABLE_SETS.map((set) => [set.id, set.era]));

/**
 * Points one pack_log row earns in `event`. `cards` is the row's parsed card
 * list ({ id, reverse, rarity }); `typesOf(cardId)` is only called for a type
 * week and returns the card's types (or null for a Trainer or Energy).
 */
export async function pointsFor(event, row, cards, typesOf) {
  if (!(Number(row.cost) > 0)) return 0;
  if (event.kind === "set") return row.set_id === event.setId ? 1 : 0;
  if (event.kind === "era") return ERA_OF.get(row.set_id) === event.era ? 1 : 0;
  if (event.kind === "hits") return cards.filter((card) => card && isHit(card)).length;
  let n = 0;
  for (const card of cards) {
    if (!card?.id) continue;
    const types = await typesOf(String(card.id));
    if (Array.isArray(types) && types.includes(event.type)) n += 1;
  }
  return n;
}

export function goalFor(event, playersLastWeek) {
  if (event.goal) return event.goal;
  return Math.max(GOAL_FLOOR[event.kind], GOAL_PER_PLAYER[event.kind] * Math.max(0, Number(playersLastWeek) || 0));
}

/* ------------------------------------------------------------------ */
/* Weekly prizes                                                        */
/* ------------------------------------------------------------------ */

/** Boards that pay at the end of a week. "event" is the week's event points; the other two are the Rankings boards. */
export const PRIZE_BOARDS = ["event", "best", "packs"];
export const PRIZE_BOARD_LABEL = { event: "Event points", best: "Best pull", packs: "Packs ripped" };

/** Coins by place: [first place of the band, last place, coins]. */
export const PRIZE_TABLE = [
  [1, 1, 2000],
  [2, 2, 1200],
  [3, 3, 800],
  [4, 10, 300],
  [11, 25, 100],
];
export const PRIZE_PLACES = PRIZE_TABLE[PRIZE_TABLE.length - 1][1];
export function prizeFor(place) {
  const band = PRIZE_TABLE.find(([from, to]) => place >= from && place <= to);
  return band ? band[2] : 0;
}

/** An account takes a prize only if it is this old when the week ends, */
export const PRIZE_MIN_AGE_DAYS = 7;
/** is at least this level, */
export const PRIZE_MIN_LEVEL = 5;
/** and paid for at least this many packs in the week. */
export const PRIZE_MIN_PAID_PACKS = 10;
/** One player, one prize a week: the biggest of the places they earned. */
export const ONE_PRIZE_A_WEEK = true;
/**
 * A prize is held for the owner to look at when, during the week, the winner
 * took at least this much card value (cents) from one other player through
 * coin flips, or was handed this much in lopsided trades.
 */
export const HOLD_CENTS = 50_000;
/** Flips against the same player before the coin flip rule looks at them. */
export const HOLD_FLIPS = 3;
/** Prizes and step coins can be claimed for this many weeks, then they lapse. */
export const CLAIM_WEEKS = 4;
/** Last week's places are frozen this long into the new week (the same grace Rankings uses). */
export const FREEZE_GRACE_MS = 6 * 3600_000;
