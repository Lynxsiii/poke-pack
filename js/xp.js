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

/** The top level (200 since October 2026; it was 100). Prestige opens here. */
export const LEVEL_CAP = 200;
/** The top level before October 2026: the Original 100 title and the old peak count from it. */
export const LEGACY_CAP = 100;
/** The most times a player can prestige (go back to level 1 from LEVEL_CAP for a star). */
export const PRESTIGE_CAP = 10;
/**
 * XP per level grows linearly: cumulative XP to reach level L is CURVE x (L-1)^2,
 * so level 100 takes 245,025 XP and level 200 takes 990,025. Version 2 of the
 * curve (October 2026): the first one (15, capped at 100) let heavy players reach
 * the top in days.
 */
export const CURVE = 25;
/** The first curve. Only used to tell who had reached level 100 on it (the Original 100 title). */
export const LEGACY_CURVE = 15;

/** Every weight in one place so the economy can be tuned from a single table. */
export const XP_WEIGHTS = {
  pack: 10, // each pack opened (boxes and ETBs count per pack), tapering: see TAPER
  hit: 15, // each hit rarity pulled, on top of the pack, tapering: see TAPER
  unique: 8, // each distinct card owned (raw or in a slab)
  quest: 60, // each quest claimed
  chest: 150, // each quest chest opened
  hourly: 25, // each hourly claim
  battle: 20, // each pack battle played
  battleWin: 50, // each pack battle won (on top of playing it)
  casino: 15, // each coinflip or jackpot played
  casinoWin: 30, // each one won (on top of playing it)
  graded: 40, // each card sent to grading
  gemMint: 150, // each Gem Mint 10 (on top of grading)
  sealed: 30, // each sealed product opened (on top of its packs)
  friend: 50, // each friend, the first FRIEND_CAP
  achievement: { 1: 50, 2: 120, 3: 250, 4: 500 }, // by tier when claimed
  mastery: 4000, // a claimed set mastery
  crown: 15000, // a claimed era crown (every set of an era mastered), counted with the achievements
};
export const FRIEND_CAP = 20;

/**
 * Packs and hits give full XP up to `knee` in a prestige cycle, then taper:
 * n opened past the knee are worth knee x (n / knee)^power of them. Coins buy
 * packs, so without this a big wallet could buy a level 100 in an afternoon;
 * with it, the XP that keeps coming is the kind that takes days (quests, hourly
 * claims, new cards, masteries).
 */
export const TAPER = { pack: { knee: 1500, power: 0.55 }, hit: { knee: 400, power: 0.55 } };

export function tapered(n, { knee, power }) {
  const x = count(n);
  return x <= knee ? x : knee * Math.pow(x / knee, power);
}

/** Cumulative XP needed to be at `level` (level 1 is 0). */
export function xpForLevel(level, curve = CURVE) {
  const lv = Math.max(1, Math.min(LEVEL_CAP, Math.floor(Number(level) || 1)));
  return curve * (lv - 1) * (lv - 1);
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
export function levelFromXp(total, curve = CURVE) {
  const xp = Math.max(0, Math.floor(Number(total) || 0));
  let level = Math.min(LEVEL_CAP, Math.floor(Math.sqrt(xp / curve)) + 1);
  while (level < LEVEL_CAP && xp >= xpForLevel(level + 1, curve)) level += 1;
  while (level > 1 && xp < xpForLevel(level, curve)) level -= 1;
  const floor = xpForLevel(level, curve);
  const maxed = level >= LEVEL_CAP;
  const ceil = maxed ? floor : xpForLevel(level + 1, curve);
  const need = maxed ? 0 : ceil - floor;
  const into = maxed ? 0 : xp - floor;
  return { level, xp, floor, ceil, into, need, pct: maxed ? 100 : Math.min(100, Math.floor((into / need) * 100)), maxed };
}

function count(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** The raw tallies XP is made from. Stored as the starting point of a prestige cycle. */
export const COUNT_KEYS = [
  "packs", "hits", "unique", "sealed", "quests", "chests", "ach1", "ach2", "ach3", "ach4", "crowns", "masteries",
  "battles", "battleWins", "casino", "casinoWon", "graded", "gemMint", "friends", "hourly",
];

/**
 * The tallies in a save. `save` is the shape /api/me returns: packsOpened,
 * claimed, collection/graded (via ownedMap), and stats.{counters, friends}.
 * Anything missing reads as zero.
 */
export function xpCounts(save) {
  const stats = save?.stats && typeof save.stats === "object" ? save.stats : {};
  const c = stats.counters && typeof stats.counters === "object" ? stats.counters : {};
  const out = {
    packs: count(save?.packsOpened),
    hits: count(c.hitsPulled),
    unique: Object.values(ownedMap(save || {})).filter((n) => n > 0).length,
    sealed: count(c.sealed),
    quests: count(c.questsClaimed),
    chests: count(c.chests),
    ach1: 0, ach2: 0, ach3: 0, ach4: 0, crowns: 0, masteries: 0,
    battles: count(c.battles),
    battleWins: count(c.battleWins),
    casino: count(c.casinoPlayed),
    casinoWon: count(c.casinoWon),
    graded: count(c.graded),
    gemMint: count(c.gemMint),
    friends: Math.min(FRIEND_CAP, count(stats.friends)),
    hourly: count(c.bonus),
  };
  const claimed = Array.isArray(save?.claimed) ? save.claimed : [];
  for (const id of new Set(claimed)) {
    const row = achievementById(id);
    if (!row) continue;
    if (row.kind === "mastery") out.masteries += 1;
    else if (row.kind === "crown") out.crowns += 1;
    else out[`ach${[1, 2, 3, 4].includes(row.tier) ? row.tier : 1}`] += 1;
  }
  return out;
}

/** Tallies since `start` (a prestige cycle's starting point): each one clamped at zero. */
export function countsSince(counts, start) {
  if (!start || typeof start !== "object") return counts;
  const out = {};
  for (const key of COUNT_KEYS) out[key] = Math.max(0, count(counts[key]) - count(start[key]));
  return out;
}

/** A stored cycle start, cleaned: only known keys, whole numbers. null for anything unusable. */
export function cleanCounts(raw) {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;
  const out = {};
  for (const key of COUNT_KEYS) out[key] = count(value[key]);
  return out;
}

/**
 * Where the XP came from, by source. `start` (optional) is the tallies at the
 * start of the current prestige cycle: only what came after counts, and the
 * taper starts over, so every cycle is the same climb.
 *
 * Returns { total, parts } where parts is [{ id, label, count, xp }] in display
 * order, zero rows kept so a screen can show what is still untapped.
 */
export function computeXp(save, start = null) {
  const w = XP_WEIGHTS;
  const n = countsSince(xpCounts(save), start);
  const achievements = n.ach1 + n.ach2 + n.ach3 + n.ach4 + n.crowns;
  const achievementXp = n.ach1 * w.achievement[1] + n.ach2 * w.achievement[2] + n.ach3 * w.achievement[3] + n.ach4 * w.achievement[4] + n.crowns * w.crown;
  const round = Math.round;
  const parts = [
    { id: "packs", label: "Packs opened", count: n.packs, xp: round(tapered(n.packs, TAPER.pack) * w.pack) },
    { id: "hits", label: "Hits pulled", count: n.hits, xp: round(tapered(n.hits, TAPER.hit) * w.hit) },
    { id: "unique", label: "Cards collected", count: n.unique, xp: n.unique * w.unique },
    { id: "sealed", label: "Sealed products", count: n.sealed, xp: n.sealed * w.sealed },
    { id: "quests", label: "Quests", count: n.quests, xp: n.quests * w.quest + n.chests * w.chest },
    { id: "achievements", label: "Achievements", count: achievements, xp: achievementXp },
    { id: "mastery", label: "Set masteries", count: n.masteries, xp: n.masteries * w.mastery },
    { id: "battles", label: "Pack battles", count: n.battles, xp: n.battles * w.battle + n.battleWins * w.battleWin },
    { id: "casino", label: "Casino", count: n.casino, xp: n.casino * w.casino + n.casinoWon * w.casinoWin },
    { id: "grading", label: "Grading", count: n.graded, xp: n.graded * w.graded + n.gemMint * w.gemMint },
    { id: "friends", label: "Friends", count: n.friends, xp: n.friends * w.friend },
    { id: "hourly", label: "Hourly claims", count: n.hourly, xp: n.hourly * w.hourly },
  ];
  return { total: parts.reduce((sum, p) => sum + p.xp, 0), parts };
}

/** The summary the Worker puts on `save.xp` and the client draws from. `start` as in computeXp. */
export function xpSummary(save, floor = 0, start = null) {
  const { total, parts } = computeXp(save, start);
  const best = Math.max(total, count(floor));
  return { ...levelFromXp(best), total: best, parts, banked: Math.max(0, best - total) };
}
