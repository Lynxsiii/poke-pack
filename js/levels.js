/**
 * What each level gives. One config file: change a number here and the road
 * screen, the Worker's checks and the rewards all follow, because every one of
 * them imports this module. Pure data and functions, no DOM.
 *
 * Three kinds of reward:
 *   paid     coins handed over once per prestige cycle when claimed
 *   derived  frames, banner motions, titles, profile slots and the hourly claim:
 *            worked out from the level and prestige on the spot, never stored
 *   gates    features a brand new account reaches a few levels in
 *
 * Sleeves and coins are bought on the Sleeves & coins page now, not handed out
 * by levels (the ones levels gave before stay with whoever got them).
 *
 * Prestige: at LEVEL_CAP with every level claimed, a player can go back to
 * level 1 for a prestige star (up to PRESTIGE_CAP). Each star raises the hourly
 * claim for good and opens its own frames and titles; the levels pay their
 * coins again on the way back up.
 */
import { LEVEL_CAP, PRESTIGE_CAP } from "./xp.js";
import { BANNER_MOTION_LEVELS, BANNER_MOTION_NAMES, LEVEL_TITLES, PRESTIGE_TITLES, levelTitleRows } from "./level-data.js";
import { FRAME_CATALOG } from "./frame-catalog.js";

// The banner motion levels and level titles live in js/level-data.js (no imports) so
// js/cosmetics.js and js/titles.js can read them without a cycle through js/xp.js.
export { LEVEL_CAP, PRESTIGE_CAP, BANNER_MOTION_LEVELS, BANNER_MOTION_NAMES, LEVEL_TITLES, PRESTIGE_TITLES, levelTitleRows };

/**
 * Avatar frames, lowest first. `level` is the first level that can wear it;
 * a frame with `prestige` instead opens with that many prestige stars.
 */
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

/**
 * Gifts from data/gear.json handed out with a level's coins. Empty since
 * October 2026: sleeves and coins are bought now. Kept so a gift could return.
 */
export const LEVEL_GEAR = {};

/**
 * What levels gave before October 2026. Players who claimed them keep them; set
 * mastery gifts (scripts/make_mastery_gifts.py) still never repeat one.
 */
export const PAST_LEVEL_GEAR = {
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

/** The hourly claim: the base, plus HOURLY_PER_TEN for every 10 levels, plus HOURLY_PER_PRESTIGE per star. */
export const HOURLY_BASE = 100;
export const HOURLY_PER_TEN = 10;
export const HOURLY_PER_PRESTIGE = 250;

/** Profile room, by level: [first level, amount], ascending. */
const SHOWCASE_STEPS = [[1, 3], [5, 4], [12, 5], [20, 6]]; // pinned cards, up to SHOWCASE_MAX (6)
const SLAB_STEPS = [[1, 2], [10, 4], [25, 6], [40, 8]]; // graded slabs shown on the profile
const PAGE_STEPS = [[1, 1], [8, 2], [20, 3], [35, 4]]; // binder pages shown on the profile

const clampLevel = (level) => Math.max(1, Math.min(LEVEL_CAP, Math.floor(Number(level) || 1)));
const clampPrestige = (n) => Math.max(0, Math.min(PRESTIGE_CAP, Math.floor(Number(n) || 0)));

/** Coins one hourly claim pays at this level and prestige. */
export function hourlyBonus(level, prestige = 0) {
  return HOURLY_BASE + HOURLY_PER_TEN * Math.floor(clampLevel(level) / 10) + HOURLY_PER_PRESTIGE * clampPrestige(prestige);
}

function step(steps, level) {
  let out = steps[0][1];
  for (const [from, amount] of steps) if (level >= from) out = amount;
  return out;
}

/** Coins paid for reaching `level`: 30 + 4 per level, and every 5th level adds 60 per level. Level 1 pays nothing. */
export function levelCoins(level) {
  const lv = clampLevel(level);
  if (lv < 2) return 0;
  return 30 + 4 * lv + (lv % 5 === 0 ? 60 * lv : 0);
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

/** The best level frame for `level` (prestige frames are chosen, never automatic). */
export function frameForLevel(level) {
  const lv = clampLevel(level);
  let best = null;
  for (const frame of FRAMES) if (frame.level && lv >= frame.level) best = frame.id;
  return best;
}

/** Whether a frame is open to a player at this level and prestige. */
export function frameOpen(frame, level, prestige = 0) {
  if (!frame) return false;
  if (frame.prestige) return clampPrestige(prestige) >= frame.prestige;
  return clampLevel(level) >= (frame.level || 1);
}

/** What a locked frame asks for, e.g. "Level 30" or "Prestige 2". */
export function frameNeed(frame) {
  if (!frame) return "";
  return frame.prestige ? `Prestige ${frame.prestige}` : `Level ${frame.level}`;
}

/**
 * How the extra Pokémon frames (js/frame-catalog.js, generated) are earned.
 * The eighteen type frames are free for everyone; the rest open along the
 * level road, and the last few need prestige stars. A frame left out here
 * keeps the catalog's own level (0 = free).
 */
const EXTRA_FRAME_UNLOCKS = {
  "ball-poke": { level: 3 },
  "mon-pikachu": { level: 8 },
  "mon-bulbasaur": { level: 12 },
  "ball-great": { level: 16 },
  "mon-squirtle": { level: 18 },
  "card-yellow-border": { level: 20 },
  "gen-pixel": { level: 22 },
  "mon-eevee": { level: 25 },
  "ball-ultra": { level: 32 },
  "mon-jigglypuff": { level: 35 },
  "card-reverse-holo": { level: 40 },
  "ball-premier": { level: 45 },
  "mon-togepi": { level: 55 },
  "mon-magikarp": { level: 58 },
  "ball-quick": { level: 62 },
  "mon-snorlax": { level: 65 },
  "card-holo-foil": { level: 70 },
  "ball-heal": { level: 80 },
  "mon-gengar": { level: 85 },
  "ball-luxury": { level: 90 },
  "gen-sakura": { level: 95 },
  "mon-umbreon": { level: 110 },
  "card-shiny": { level: 120 },
  "card-gold-star": { level: 130 },
  "mon-charizard": { level: 140 },
  "ball-master": { level: 160 },
  "gen-neon": { level: 170 },
  "mon-mew": { level: 180 },
  "card-black-label": { level: 200 },
  "gen-starry": { level: 0, prestige: 1 },
  "gen-laurel": { level: 0, prestige: 3 },
  "gen-crown": { level: 0, prestige: 5 },
};

/** The extra frames with how each is earned: { id, name, group, level, prestige?, fx, c }. */
export const EXTRA_FRAMES = FRAME_CATALOG.map((frame) => ({ ...frame, ...(EXTRA_FRAME_UNLOCKS[frame.id] || {}) }));
const EXTRA_BY_ID = new Map(EXTRA_FRAMES.map((frame) => [frame.id, frame]));

/** Whether `id` is one of the extra Pokémon frames (not bronze to legend). */
export function isExtraFrame(id) {
  return typeof id === "string" && EXTRA_BY_ID.has(id);
}

/**
 * A frame by id: one of the level frames above, else one of the extra Pokémon
 * frames with its unlock (EXTRA_FRAMES). null for anything else.
 */
export function frameInfo(id) {
  return FRAMES.find((frame) => frame.id === id) || (typeof id === "string" && EXTRA_BY_ID.get(id)) || null;
}

/** The highest level title the level has earned, or null below level 5. */
export function levelTitle(level) {
  const lv = clampLevel(level);
  let best = null;
  for (const row of LEVEL_TITLES) if (lv >= row.level) best = row;
  return best ? best.name : null;
}

/**
 * The level that unlocks count from: the highest level reached. That is the
 * current level, or 100 once a player has prestiged, or `peak`, the level a
 * player had reached on the first curve, so harder levels and going back to
 * level 1 never take away a frame, a slot or a title.
 */
export function unlockLevel(level, prestige = 0, peak = 0) {
  return clampLevel(Math.max(clampLevel(level), clampPrestige(prestige) > 0 ? LEVEL_CAP : 0, Math.floor(Number(peak) || 0)));
}

/** Everything a level and prestige open (see unlockLevel for `peak`). */
export function levelPerks(level, prestige = 0, peak = 0) {
  const p = clampPrestige(prestige);
  const lv = unlockLevel(level, p, peak);
  return {
    level: clampLevel(level),
    unlockLevel: lv,
    prestige: p,
    hourly: hourlyBonus(level, p),
    showcaseSlots: step(SHOWCASE_STEPS, lv),
    shownSlabs: step(SLAB_STEPS, lv),
    binderPages: step(PAGE_STEPS, lv),
    frames: [...FRAMES, ...EXTRA_FRAMES].filter((frame) => frameOpen(frame, lv, p)).map((frame) => frame.id),
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
  return next ? `Reach level ${next} for more slots.` : "That's every slot there is.";
}

/** The refusal text for a closed gate, shared by the Worker and the lock notices. */
export function gateMessage(key) {
  const min = GATES[key];
  return `Reach level ${min} to open ${GATE_NAMES[key] || key}.`;
}

const kindsAt = (list) => list;

/**
 * The road: every unlock in level order, for the screen that shows what is
 * ahead. kind is one of coins, frame, banner, title, hourly, slots, gate.
 * Levels with only the plain coin payout are not listed here; use levelCoins.
 */
export const MILESTONES = (() => {
  const rows = [];
  for (const frame of [...FRAMES, ...EXTRA_FRAMES]) {
    if (!frame.level || frame.prestige) continue;
    rows.push({ level: frame.level, kind: "frame", id: frame.id, name: `${frame.name} frame`, note: "A frame around your avatar on your profile and in lists." });
  }
  for (let level = 10; level <= LEVEL_CAP; level += 10) {
    rows.push({ level, kind: "hourly", id: `hourly-${level}`, name: `Hourly claim +${HOURLY_PER_TEN}`, note: `Your hourly claim pays ${HOURLY_PER_TEN} more coins.` });
  }
  for (const [id, level] of Object.entries(BANNER_MOTION_LEVELS)) {
    rows.push({ level, kind: "banner", id, name: `${BANNER_MOTION_NAMES[id]} banner`, note: "A new banner motion for your profile." });
  }
  for (const row of LEVEL_TITLES) {
    rows.push({ level: row.level, kind: "title", id: `level-${row.level}`, name: row.name, note: "A title you can wear." });
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

/**
 * What each prestige star brings, for the screen that shows them:
 * [{ prestige, hourly, frames:[ids], title }]
 */
export const PRESTIGE_ROAD = Array.from({ length: PRESTIGE_CAP }, (_, i) => {
  const n = i + 1;
  return {
    prestige: n,
    hourly: hourlyBonus(1, n),
    frames: [...FRAMES, ...EXTRA_FRAMES].filter((frame) => frame.prestige === n).map((frame) => frame.id),
    title: PRESTIGE_TITLES.find((row) => row.prestige === n)?.name || null,
  };
});

/** Whether a player at `level` with `claimedLevel` paid and `prestige` stars may prestige now. */
export function canPrestige(level, claimedLevel, prestige) {
  return clampLevel(level) >= LEVEL_CAP && clampLevel(claimedLevel) >= LEVEL_CAP && clampPrestige(prestige) < PRESTIGE_CAP;
}
