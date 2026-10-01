/**
 * Mastery ranks and what a mastery gives. Pure functions, no DOM, no fetch:
 * the mastery tab, the seal and the Worker all read this file, so the rules
 * live once.
 *
 * RANKS are worked out from how much of a set you own, never stored:
 *   Bronze 25%, Silver 50%, Gold 75%, Master 100%.
 * A rank is a cosmetic of progress (the seal rim, the tab); the coins, title,
 * emblem, banner and gear are paid by the set's achievement rows
 * (`set-<id>-half`, `set-<id>-master`, js/achievement-sets.js).
 *
 * Exports:
 *   MASTERY_RANKS                 [{ id, pct, name }] lowest first
 *   masteryRank(pct)              { rank: id|null, index, next, toNext, label }
 *       pct is 0-100 (49.99 is still Bronze). `index` is the earned rank's place
 *       in MASTERY_RANKS (-1 when unranked), `next` is the next rank object or
 *       null at Master, `toNext` is the percentage points still to go (0 at
 *       Master), `label` is the rank name or "Unranked".
 *   rankProgress(owned, total)    masteryRank's fields plus { owned, total, pct,
 *       toNextCards }. pct is floored and reads 100 only when owned >= total, the
 *       same as setPercents; the rank is compared on whole cards, so 24 of 100
 *       is Unranked and 25 of 100 is Bronze with no float rounding.
 *   masteryRewards(setId)         everything mastering one set gives, for the
 *       "what you get" list: { coins, xp, title, emblem: true, banner: true,
 *       gear: [{ kind, id, name }], halfCoins, halfXp }. An unknown set gets
 *       { coins: 0, xp: 0, title: "", emblem: false, banner: false, gear: [],
 *       halfCoins: 0, halfXp: 0 }. `gear` is the set's own sleeve and/or coin
 *       (data/mastery-gifts.json); [] for a set with no gear.
 *   ERA_CROWNS                    [{ id, era, slug, sets, coins, xp, title, gear }]
 *       one per crowned era (every playable set of the era mastered).
 *   eraCrownRewards(era)          the ERA_CROWNS row for an era name or slug, or null.
 */
import { XP_WEIGHTS } from "./xp.js";
import { ACHIEVEMENTS, achievementById, masteryRowFor } from "./achievements.js";
import { eraSlug } from "./achievement-eras.js";
import { CROWN_GIFTS, MASTERY_GIFTS } from "./mastery-gifts.js";

export const MASTERY_RANKS = [
  { id: "bronze", pct: 25, name: "Bronze" },
  { id: "silver", pct: 50, name: "Silver" },
  { id: "gold", pct: 75, name: "Gold" },
  { id: "master", pct: 100, name: "Master" },
];

const clampPct = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
};

/** Which rank a percentage has reached, and what the next one asks. */
export function masteryRank(pct) {
  const at = clampPct(pct);
  let index = -1;
  MASTERY_RANKS.forEach((rank, i) => {
    if (at >= rank.pct) index = i;
  });
  const earned = index >= 0 ? MASTERY_RANKS[index] : null;
  const next = MASTERY_RANKS[index + 1] || null;
  return {
    rank: earned ? earned.id : null,
    index,
    next: next ? { ...next } : null,
    toNext: next ? Math.max(0, +(next.pct - at).toFixed(4)) : 0,
    label: earned ? earned.name : "Unranked",
  };
}

/** Rank and progress from card counts, so "24 of 100" and "25 of 100" never meet a rounding error. */
export function rankProgress(owned, total) {
  const all = Math.max(0, Math.floor(Number(total) || 0));
  const have = Math.max(0, Math.min(all, Math.floor(Number(owned) || 0)));
  if (!all) return { ...masteryRank(0), owned: have, total: all, pct: 0, toNextCards: 0 };
  const pct = have >= all ? 100 : Math.floor((have * 100) / all);
  // Compare whole cards: a rank is reached when have x 100 >= rank% x total.
  let index = -1;
  MASTERY_RANKS.forEach((rank, i) => {
    if (have * 100 >= rank.pct * all) index = i;
  });
  const base = masteryRank(index >= 0 ? MASTERY_RANKS[index].pct : 0);
  const next = MASTERY_RANKS[index + 1] || null;
  return {
    ...base,
    next: next ? { ...next } : null,
    toNext: next ? Math.max(0, +(next.pct - (have * 100) / all).toFixed(4)) : 0,
    owned: have,
    total: all,
    pct,
    toNextCards: next ? Math.max(0, Math.ceil((next.pct * all) / 100) - have) : 0,
  };
}

const named = (list) => (Array.isArray(list) ? list : []).map(({ kind, id, name }) => ({ kind, id, name: name || id }));
const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

/** Everything mastering one set gives. Safe for any id. */
export function masteryRewards(setId) {
  const id = String(setId || "");
  const row = masteryRowFor(id);
  if (!row) {
    return { coins: 0, xp: 0, title: "", emblem: false, banner: false, gear: [], halfCoins: 0, halfXp: 0 };
  }
  const half = achievementById(`set-${id}-half`);
  return {
    coins: row.coins,
    xp: XP_WEIGHTS.mastery,
    title: row.title || "",
    emblem: true,
    banner: true,
    gear: named(has(MASTERY_GIFTS, id) ? MASTERY_GIFTS[id] : []),
    halfCoins: half ? half.coins : 0,
    halfXp: half ? XP_WEIGHTS.achievement[half.tier] || 0 : 0,
  };
}

/** The era crowns, from the achievement table (so a new era appears with its row). */
export const ERA_CROWNS = ACHIEVEMENTS.filter((row) => row.kind === "crown").map((row) => {
  const slug = eraSlug(row.era);
  return {
    id: row.id,
    era: row.era,
    slug,
    sets: row.goal,
    coins: row.coins,
    xp: XP_WEIGHTS.crown,
    title: row.title || "",
    gear: named(has(CROWN_GIFTS, slug) ? CROWN_GIFTS[slug] : []),
  };
});

export function eraCrownRewards(era) {
  const key = String(era || "");
  return ERA_CROWNS.find((crown) => crown.era === key || crown.slug === key) || null;
}
