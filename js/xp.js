/**
 * XP and the level curve. Pure functions, no DOM, no fetch: the browser draws
 * the level bar with this file and the Worker uses the very same code to decide
 * what a player has reached, so the two can never disagree.
 *
 * XP is not stored event by event. It is worked out from things the server
 * already records (the save: packs, counters, claimed achievements, the owned
 * collection), which is why nobody can fake it and why a veteran starts at the
 * level their history earns. The Worker keeps a high-water mark per player
 * (worker/xp.js) so selling cards never takes a level away.
 */
import { ownedMap } from "./titles.js";
import { achievementById } from "./achievements.js";

export const LEVEL_CAP = 100;
/** XP per level grows linearly: cumulative XP to reach level L is CURVE x (L-1)^2. */
export const CURVE = 15;

/** Every weight in one place so the economy can be tuned from a single table. */
export const XP_WEIGHTS = {
  pack: 10, // each pack opened (boxes and ETBs count per pack)
  hit: 15, // each hit rarity pulled, on top of the pack
  unique: 2, // each distinct card owned (raw or in a slab)
  quest: 20, // each quest claimed
  chest: 40, // each quest chest opened
  hourly: 2, // each hourly claim
  battle: 15, // each pack battle played
  battleWin: 40, // each pack battle won (on top of playing it)
  casino: 15, // each coinflip or jackpot played
  casinoWin: 30, // each one won (on top of playing it)
  graded: 25, // each card sent to grading
  gemMint: 100, // each Gem Mint 10 (on top of grading)
  sealed: 30, // each sealed product opened (on top of its packs)
  friend: 30, // each friend, the first FRIEND_CAP
  achievement: { 1: 20, 2: 50, 3: 120, 4: 300 }, // by tier when claimed
  mastery: 600, // a claimed set mastery
  crown: 1500, // a claimed era crown (every set of an era mastered), counted with the achievements
};
export const FRIEND_CAP = 20;

/** Cumulative XP needed to be at `level` (level 1 is 0). */
export function xpForLevel(level) {
  const lv = Math.max(1, Math.min(LEVEL_CAP, Math.floor(Number(level) || 1)));
  return CURVE * (lv - 1) * (lv - 1);
}

/** XP a single level takes to climb out of: level L to L+1. */
export function xpToNext(level) {
  const lv = Math.max(1, Math.floor(Number(level) || 1));
  return lv >= LEVEL_CAP ? 0 : xpForLevel(lv + 1) - xpForLevel(lv);
}

/**
 * Where a total sits on the curve.
 * { level, xp, floor, ceil, into, need, pct, maxed }
 *   floor/ceil  cumulative XP at this level and at the next
 *   into/need   XP gained into this level / XP the level asks (0 at the cap)
 *   pct         0-100 progress through the level (100 at the cap)
 */
export function levelFromXp(total) {
  const xp = Math.max(0, Math.floor(Number(total) || 0));
  let level = Math.min(LEVEL_CAP, Math.floor(Math.sqrt(xp / CURVE)) + 1);
  while (level < LEVEL_CAP && xp >= xpForLevel(level + 1)) level += 1;
  while (level > 1 && xp < xpForLevel(level)) level -= 1;
  const floor = xpForLevel(level);
  const maxed = level >= LEVEL_CAP;
  const ceil = maxed ? floor : xpForLevel(level + 1);
  const need = maxed ? 0 : ceil - floor;
  const into = maxed ? 0 : xp - floor;
  return { level, xp, floor, ceil, into, need, pct: maxed ? 100 : Math.min(100, Math.floor((into / need) * 100)), maxed };
}

const count = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

/**
 * Where the XP came from, by source. `save` is the shape /api/me returns:
 * packsOpened, claimed, collection/graded (via ownedMap), and
 * stats.{counters, friends}. Anything missing reads as zero.
 *
 * Returns { total, parts } where parts is [{ id, label, count, xp }] in display
 * order, zero rows kept so a screen can show what is still untapped.
 */
export function computeXp(save) {
  const w = XP_WEIGHTS;
  const stats = save?.stats && typeof save.stats === "object" ? save.stats : {};
  const c = stats.counters && typeof stats.counters === "object" ? stats.counters : {};

  const packs = count(save?.packsOpened);
  const unique = Object.values(ownedMap(save || {})).filter((n) => n > 0).length;
  const friends = Math.min(FRIEND_CAP, count(stats.friends));

  let achievements = 0;
  let achievementXp = 0;
  let masteries = 0;
  const claimed = Array.isArray(save?.claimed) ? save.claimed : [];
  for (const id of new Set(claimed)) {
    const row = achievementById(id);
    if (!row) continue;
    if (row.kind === "mastery") {
      masteries += 1;
    } else {
      achievements += 1;
      achievementXp += row.kind === "crown" ? w.crown : w.achievement[row.tier] || w.achievement[1];
    }
  }

  const parts = [
    { id: "packs", label: "Packs opened", count: packs, xp: packs * w.pack },
    { id: "hits", label: "Hits pulled", count: count(c.hitsPulled), xp: count(c.hitsPulled) * w.hit },
    { id: "unique", label: "Cards collected", count: unique, xp: unique * w.unique },
    { id: "sealed", label: "Sealed products", count: count(c.sealed), xp: count(c.sealed) * w.sealed },
    { id: "quests", label: "Quests", count: count(c.questsClaimed), xp: count(c.questsClaimed) * w.quest + count(c.chests) * w.chest },
    { id: "achievements", label: "Achievements", count: achievements, xp: achievementXp },
    { id: "mastery", label: "Set masteries", count: masteries, xp: masteries * w.mastery },
    { id: "battles", label: "Pack battles", count: count(c.battles), xp: count(c.battles) * w.battle + count(c.battleWins) * w.battleWin },
    { id: "casino", label: "Casino", count: count(c.casinoPlayed), xp: count(c.casinoPlayed) * w.casino + count(c.casinoWon) * w.casinoWin },
    { id: "grading", label: "Grading", count: count(c.graded), xp: count(c.graded) * w.graded + count(c.gemMint) * w.gemMint },
    { id: "friends", label: "Friends", count: friends, xp: friends * w.friend },
    { id: "hourly", label: "Hourly claims", count: count(c.bonus), xp: count(c.bonus) * w.hourly },
  ];
  return { total: parts.reduce((n, p) => n + p.xp, 0), parts };
}

/** The summary the Worker puts on `save.xp` and the client draws from. */
export function xpSummary(save, floor = 0) {
  const { total, parts } = computeXp(save);
  const best = Math.max(total, count(floor));
  return { ...levelFromXp(best), total: best, parts, banked: Math.max(0, best - total) };
}
