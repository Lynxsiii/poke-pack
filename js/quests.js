// Repeatable account goals, shared by the client and the Worker so both pick
// the same list. Periods reset at 00:00 UTC; weeks start Monday; months start
// on the 1st.
//
// Every day and every week the active list is chosen from a pool by a seeded
// shuffle of the period start, so it needs no storage: same start, same list.
// Clock in stays on every day. Months have three fixed goals. Claiming every
// active quest of a period unlocks that period's chest.
//
// Ids are stored in quest_claims next to the period start, so an id never
// changes meaning: add rows, never rename or retune a shipped one's goal.

const DAY = 86_400_000;

/** Kinds the Worker records or derives: packs (from pack_log), and the quest_events kinds below. */
export const QUEST_KINDS = ["packs", "hits", "newcards", "reverses", "sold", "bonus", "sealed", "battles", "battleWins"];

const daily = (id, kind, goal, coins, name, note) => ({ id, period: "daily", kind, goal, coins, name, note });
const weekly = (id, kind, goal, coins, name, note) => ({ id, period: "weekly", kind, goal, coins, name, note });
const monthly = (id, kind, goal, coins, name, note) => ({ id, period: "monthly", kind, goal, coins, name, note });

/** Always on, first in the daily list. */
export const FIXED_DAILY = [
  daily("daily-bonus", "bonus", 1, 25, "Clock in", "Claim an hourly bonus."),
];

export const DAILY_POOL = [
  daily("daily-rip", "packs", 1, 10, "First rip", "Open a booster pack."),
  daily("daily-five", "packs", 5, 30, "Five packs", "Open five booster packs."),
  daily("daily-ten", "packs", 10, 45, "Double digits", "Open ten booster packs."),
  daily("daily-spares", "sold", 3, 20, "Clear the spares", "Sell three duplicate copies."),
  daily("daily-declutter", "sold", 8, 35, "Spring cleaning", "Sell eight duplicate copies."),
  daily("daily-hit", "hits", 1, 25, "Chase card", "Pull a hit from a pack."),
  daily("daily-hits-three", "hits", 3, 50, "Hot streak", "Pull three hits from packs."),
  daily("daily-fresh", "newcards", 3, 20, "New faces", "Pull three cards you did not own."),
  daily("daily-fresh-ten", "newcards", 10, 40, "Fresh stack", "Pull ten cards you did not own."),
  daily("daily-shine", "reverses", 3, 20, "Shiny backs", "Pull three reverse holos."),
  daily("daily-shine-eight", "reverses", 8, 35, "Foil rain", "Pull eight reverse holos."),
  daily("daily-box", "sealed", 1, 50, "Crack a box", "Open a sealed product."),
  daily("daily-battle", "battles", 1, 30, "Enter the arena", "Finish a pack battle."),
  daily("daily-win", "battleWins", 1, 50, "Take the pot", "Win a pack battle."),
];

export const WEEKLY_POOL = [
  weekly("weekly-bonus", "bonus", 5, 100, "Regular collector", "Claim five hourly bonuses."),
  weekly("weekly-packs", "packs", 25, 100, "Weekend box", "Open 25 booster packs."),
  weekly("weekly-packs-sixty", "packs", 60, 200, "Pack a day and then some", "Open 60 booster packs."),
  weekly("weekly-spares", "sold", 20, 100, "Tidy collection", "Sell 20 duplicate copies."),
  weekly("weekly-hits", "hits", 8, 120, "Chase week", "Pull eight hits from packs."),
  weekly("weekly-fresh", "newcards", 25, 100, "Widening dex", "Pull 25 cards you did not own."),
  weekly("weekly-shine", "reverses", 20, 100, "Foil collector", "Pull 20 reverse holos."),
  weekly("weekly-sealed", "sealed", 2, 150, "Box night", "Open two sealed products."),
  weekly("weekly-battles", "battles", 3, 100, "Arena regular", "Finish three pack battles."),
  weekly("weekly-wins", "battleWins", 2, 150, "Pot collector", "Win two pack battles."),
];

export const MONTHLY_QUESTS = [
  monthly("monthly-packs", "packs", 150, 500, "Month of rips", "Open 150 booster packs."),
  monthly("monthly-hits", "hits", 40, 400, "Hit season", "Pull 40 hits from packs."),
  monthly("monthly-bonus", "bonus", 60, 300, "Never missed an hour", "Claim 60 hourly bonuses."),
];

/** How many rotating quests a day and a week get on top of the fixed ones. */
const ROTATING = { daily: 4, weekly: 4 };
/** Chest bonus as a share of the coins the period's quests pay. */
const CHEST_SHARE = 0.25;

/** Every quest that can ever be active, for id lookups. */
export const QUESTS = [...FIXED_DAILY, ...DAILY_POOL, ...WEEKLY_POOL, ...MONTHLY_QUESTS];
const BY_ID = new Map(QUESTS.map((row) => [row.id, row]));

export function questById(id) {
  return BY_ID.get(id) || null;
}

export const CHEST_IDS = { daily: "chest-daily", weekly: "chest-weekly", monthly: "chest-monthly" };

export function isChestId(id) {
  return Object.values(CHEST_IDS).includes(id);
}

export function questPeriods(now = Date.now()) {
  const date = new Date(now);
  const dayStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return {
    daily: dayStart,
    weekly: dayStart - ((date.getUTCDay() + 6) % 7) * DAY,
    monthly: Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1),
  };
}

/** When each current period ends (the next reset), as UTC ms. */
export function periodEnds(periods) {
  const month = new Date(periods.monthly);
  return {
    daily: periods.daily + DAY,
    weekly: periods.weekly + 7 * DAY,
    monthly: Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1),
  };
}

// Small deterministic generator (mulberry32) so client and Worker shuffle alike.
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

/** Pick `count` rows from the pool, no two of one kind while other kinds remain. */
function pick(pool, count, seed) {
  const next = seeded(seed);
  const order = pool.slice();
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const chosen = [];
  const kinds = new Set();
  for (const row of order) {
    if (chosen.length >= count) break;
    if (kinds.has(row.kind)) continue;
    kinds.add(row.kind);
    chosen.push(row);
  }
  for (const row of order) {
    if (chosen.length >= count) break;
    if (!chosen.includes(row)) chosen.push(row);
  }
  // Easiest first, so the list reads from a warm-up to the stretch goal.
  return chosen.sort((a, b) => a.coins - b.coins || a.id.localeCompare(b.id));
}

/** `{ daily: [rows], weekly: [rows], monthly: [rows] }` for the given period starts. */
export function activeQuests(periods = questPeriods()) {
  return {
    daily: [
      ...FIXED_DAILY,
      ...pick(DAILY_POOL, ROTATING.daily, Math.floor(periods.daily / DAY) * 2654435761 + 11),
    ],
    weekly: pick(WEEKLY_POOL, ROTATING.weekly, Math.floor(periods.weekly / DAY) * 2246822519 + 23),
    monthly: MONTHLY_QUESTS.slice(),
  };
}

/** The chest row for a period, its bonus being a share of what the active quests pay. */
export function chestFor(period, rows) {
  const total = rows.reduce((sum, row) => sum + row.coins, 0);
  const name = { daily: "Daily chest", weekly: "Weekly chest", monthly: "Monthly chest" }[period];
  const cover = { daily: "daily", weekly: "weekly", monthly: "monthly" }[period];
  return {
    id: CHEST_IDS[period],
    period,
    chest: true,
    name,
    note: `Claim every ${cover} quest.`,
    coins: Math.max(5, Math.round((total * CHEST_SHARE) / 5) * 5),
  };
}

/** `{ daily: chest, weekly: chest, monthly: chest }` for the active lists. */
export function activeChests(active) {
  return {
    daily: chestFor("daily", active.daily),
    weekly: chestFor("weekly", active.weekly),
    monthly: chestFor("monthly", active.monthly),
  };
}

/** A quest or chest row by id, but only if it is active in `active`. */
export function activeRowById(id, active) {
  for (const period of ["daily", "weekly", "monthly"]) {
    const quest = active[period].find((row) => row.id === id);
    if (quest) return quest;
    const chest = chestFor(period, active[period]);
    if (chest.id === id) return chest;
  }
  return null;
}

/**
 * Consecutive UTC days ending today (or yesterday, which keeps a streak alive
 * until the day is over) out of `days`, a set of day numbers (ms / 86400000).
 */
export function streakFromDays(days, today) {
  const have = days instanceof Set ? days : new Set(days);
  let cursor = have.has(today) ? today : today - 1;
  let run = 0;
  while (have.has(cursor)) {
    run += 1;
    cursor -= 1;
  }
  return run;
}
