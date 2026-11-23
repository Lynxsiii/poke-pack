/**
 * Rankings rules shared by the Worker (worker/rankings.js) and the page
 * (js/rankings.js): the boards, their periods, the week, and the guards.
 */

/** Boards, in the order the page lists them. `periods[0]` is the default. */
export const BOARDS = {
  worth: { label: "Collection", unit: "coins", periods: ["all"], blurb: "What every card and slab you own is worth at today's prices." },
  best: { label: "Best pull", unit: "coins", periods: ["week", "all"], blurb: "The most valuable single card pulled from a pack." },
  packs: { label: "Packs ripped", unit: "packs", periods: ["week", "all"], blurb: "Packs opened on the site, sealed product and battles included." },
  level: { label: "Level", unit: "level", periods: ["all"], blurb: "Prestige stars first, then level and XP." },
  mastery: { label: "Sets mastered", unit: "sets", periods: ["all"], blurb: "Sets with every card collected and the mastery claimed." },
};

export const BOARD_ORDER = Object.keys(BOARDS);
export const PERIOD_LABEL = { week: "This week", all: "All time" };

/** A trainer needs this many packs rolled on the server before any board lists them. */
export const MIN_PACKS = 5;
/** Packs a new account may bring from a guest save and still rank on the snapshot boards. */
export const IMPORT_ALLOWANCE = 25;
/** Accounts made before this keep their standing whatever they imported (the save-claim era). */
export const RANKINGS_OPENED = Date.UTC(2026, 10, 23, 7, 0, 0);

const DAY = 86_400_000;
const WEEK = 7 * DAY;
/** Monday 1 January 2024, 00:00 UTC: weeks run Monday to Monday in UTC. */
const EPOCH = Date.UTC(2024, 0, 1);

export const weekOf = (at) => Math.floor((Number(at) - EPOCH) / WEEK);
export const weekStart = (week) => EPOCH + week * WEEK;
export const boardPeriods = (board) => (BOARDS[board] || BOARDS.worth).periods;
