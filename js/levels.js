/**
 * What each level gives. One config file: change a number here and the road
 * screen, the Worker's checks and the rewards all follow, because every one of
 * them imports this module. Pure data and functions, no DOM.
 *
 * Three kinds of reward:
 *   paid     coins (and a gift sleeve or coin) handed over once when claimed
 *   derived  frames, banner motions, titles, profile slots: worked out from the
 *            level on the spot, nothing to claim, never stored
 *   gates    features a brand new account reaches a few levels in
 *
 * Veterans lose nothing: their level comes from their whole history (js/xp.js),
 * so anyone who already uses a feature is far past its gate.
 */
import { LEVEL_CAP } from "./xp.js";
import { BANNER_MOTION_LEVELS, BANNER_MOTION_NAMES, LEVEL_TITLES, levelTitleRows } from "./level-data.js";

// The banner motion levels and level titles live in js/level-data.js (no imports) so
// js/cosmetics.js and js/titles.js can read them without a cycle through js/xp.js.
export { LEVEL_CAP, BANNER_MOTION_LEVELS, BANNER_MOTION_NAMES, LEVEL_TITLES, levelTitleRows };

/** Avatar frames, lowest first. `level` is the first level that can wear it. */
export const FRAMES = [
  { id: "bronze", name: "Bronze", level: 5 },
  { id: "silver", name: "Silver", level: 15 },
  { id: "gold", name: "Gold", level: 30 },
  { id: "platinum", name: "Platinum", level: 50 },
  { id: "prismatic", name: "Prismatic", level: 75 },
  { id: "legend", name: "Legend", level: 100 },
];

/** The level a feature opens at. Numbers only; the checks live next to each feature. */
export const GATES = { battles: 3, coinflip: 5, jackpot: 8, grading: 10, upgrader: 5 };
export const GATE_NAMES = { battles: "pack battles", coinflip: "coinflip", jackpot: "the jackpot", grading: "grading", upgrader: "the upgrader" };

/** Gifts from data/gear.json, handed out with the level's coins (worker/gear.js grantGear). */
export const LEVEL_GEAR = {
  10: [{ kind: "sleeve", id: "psv-toolkit-2024-teal" }],
  15: [{ kind: "coin", id: "psv-ex-coin-silver" }],
  25: [{ kind: "sleeve", id: "swshb-toolkit-2023-sleeves" }],
  35: [{ kind: "coin", id: "me-snorlax-silver-coin" }],
  50: [{ kind: "sleeve", id: "swshb-bs-etb-arceus-sleeves" }],
  60: [{ kind: "coin", id: "psv-charizard-celebrations-coin" }],
  75: [{ kind: "sleeve", id: "svb-prismatic-evolutions-eevee-etb" }],
  90: [{ kind: "coin", id: "psv-pikachu-25-coin-gold" }],
  100: [{ kind: "sleeve", id: "me-pikachu-30-etb-sleeves" }],
};

/** Profile room, by level: [first level, amount], ascending. */
const SHOWCASE_STEPS = [[1, 3], [5, 4], [12, 5], [20, 6]]; // pinned cards, up to SHOWCASE_MAX (6)
const SLAB_STEPS = [[1, 2], [10, 4], [25, 6], [40, 8]]; // graded slabs shown on the profile
const PAGE_STEPS = [[1, 1], [8, 2], [20, 3], [35, 4]]; // binder pages shown on the profile

const clampLevel = (level) => Math.max(1, Math.min(LEVEL_CAP, Math.floor(Number(level) || 1)));

function step(steps, level) {
  let out = steps[0][1];
  for (const [from, amount] of steps) if (level >= from) out = amount;
  return out;
}

/** Coins paid for reaching `level`: 20 + 2 per level, and every 5th level adds 50 per level. Level 1 pays nothing. */
export function levelCoins(level) {
  const lv = clampLevel(level);
  if (lv < 2) return 0;
  return 20 + 2 * lv + (lv % 5 === 0 ? 50 * lv : 0);
}

export function levelGear(level) {
  return (LEVEL_GEAR[clampLevel(level)] || []).map((item) => ({ ...item }));
}

/** Everything one claim pays for levels `from`..`to` (inclusive): { coins, gear }. */
export function levelPayout(from, to) {
  let coins = 0;
  const gear = [];
  for (let lv = Math.max(2, clampLevel(from)); lv <= clampLevel(to) && lv <= LEVEL_CAP; lv += 1) {
    coins += levelCoins(lv);
    gear.push(...levelGear(lv));
  }
  return { coins, gear };
}

export function frameForLevel(level) {
  const lv = clampLevel(level);
  let best = null;
  for (const frame of FRAMES) if (lv >= frame.level) best = frame.id;
  return best;
}

export function frameInfo(id) {
  return FRAMES.find((frame) => frame.id === id) || null;
}

/** The highest level title the level has earned, or null below level 5. */
export function levelTitle(level) {
  const lv = clampLevel(level);
  let best = null;
  for (const row of LEVEL_TITLES) if (lv >= row.level) best = row;
  return best ? best.name : null;
}

export function levelPerks(level) {
  const lv = clampLevel(level);
  return {
    level: lv,
    showcaseSlots: step(SHOWCASE_STEPS, lv),
    shownSlabs: step(SLAB_STEPS, lv),
    binderPages: step(PAGE_STEPS, lv),
    frames: FRAMES.filter((frame) => lv >= frame.level).map((frame) => frame.id),
    frame: frameForLevel(lv),
    bannerMotions: Object.keys(BANNER_MOTION_LEVELS).filter((id) => lv >= BANNER_MOTION_LEVELS[id]),
    title: levelTitle(lv),
    gates: Object.fromEntries(Object.entries(GATES).map(([key, min]) => [key, lv >= min])),
  };
}

const SLOT_STEPS = { showcase: SHOWCASE_STEPS, slabs: SLAB_STEPS, pages: PAGE_STEPS };

/** The first level above `level` with more room for `kind` ("showcase", "slabs" or "pages"), or null at the top step. */
export function nextSlotLevel(kind, level) {
  const lv = clampLevel(level);
  const steps = SLOT_STEPS[kind] || [];
  const next = steps.find(([from]) => from > lv);
  return next ? next[0] : null;
}

/** The refusal for adding past the allowance: "Reach level N for more slots." (the top step has no next level). */
export function slotMessage(kind, level) {
  const next = nextSlotLevel(kind, level);
  return next ? `Reach level ${next} for more slots.` : "That is every slot there is.";
}

/** The refusal text for a closed gate, shared by the Worker and the lock notices. */
export function gateMessage(key) {
  const min = GATES[key];
  return `Reach level ${min} to open ${GATE_NAMES[key] || key}.`;
}

const kindsAt = (list) => list;

/**
 * The road: every unlock in level order, for the screen that shows what is
 * ahead. kind is one of coins, frame, banner, title, gear, slots, gate.
 * Levels with only the plain coin payout are not listed here; use levelCoins.
 */
export const MILESTONES = (() => {
  const rows = [];
  for (const frame of FRAMES) {
    rows.push({ level: frame.level, kind: "frame", id: frame.id, name: `${frame.name} frame`, note: "A frame around your avatar on your profile and in lists." });
  }
  for (const [id, level] of Object.entries(BANNER_MOTION_LEVELS)) {
    rows.push({ level, kind: "banner", id, name: `${BANNER_MOTION_NAMES[id]} banner`, note: "A new banner motion for your profile." });
  }
  for (const row of LEVEL_TITLES) {
    rows.push({ level: row.level, kind: "title", id: `level-${row.level}`, name: row.name, note: "A title you can wear." });
  }
  for (const [level, items] of Object.entries(LEVEL_GEAR)) {
    for (const item of items) rows.push({ level: Number(level), kind: "gear", id: item.id, gearKind: item.kind, name: item.kind === "sleeve" ? "A sleeve" : "A coin", note: "Added to your gear when you claim the level." });
  }
  for (const [key, level] of Object.entries(GATES)) {
    rows.push({ level, kind: "gate", id: key, name: `Open ${GATE_NAMES[key]}`, note: gateMessage(key) });
  }
  for (const [label, steps, noun] of [["showcase", SHOWCASE_STEPS, "pinned cards"], ["slabs", SLAB_STEPS, "slabs on your profile"], ["pages", PAGE_STEPS, "binder pages on your profile"]]) {
    for (const [level, amount] of steps.slice(1)) {
      rows.push({ level, kind: "slots", id: label, name: `${amount} ${noun}`, note: "More room to show off." });
    }
  }
  for (let level = 5; level <= LEVEL_CAP; level += 5) {
    rows.push({ level, kind: "coins", id: `coins-${level}`, name: `${levelCoins(level).toLocaleString("en-US")} coins`, note: "Paid when you claim the level." });
  }
  return kindsAt(rows).sort((a, b) => a.level - b.level);
})();

export function milestonesAt(level) {
  const lv = clampLevel(level);
  return MILESTONES.filter((row) => row.level === lv);
}

/** The next level above `level` that unlocks something other than plain coins, or null. */
export function nextMilestone(level) {
  const lv = clampLevel(level);
  return MILESTONES.find((row) => row.level > lv && row.kind !== "coins") || null;
}
