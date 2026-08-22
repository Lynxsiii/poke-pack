/**
 * Achievements, their progress, and what claiming one pays out.
 *
 * The worker imports this file too, so a claim is checked server-side against
 * the same table the account page draws — the client can ask for a reward, it
 * cannot decide it has earned one. `at(ctx)` returns raw progress against
 * `goal`, which is what draws the bar and what the claim check compares.
 */
import { titleContext, setPercents } from "./titles.js";

export const ACH_CATEGORIES = [
  { id: "rip", name: "Ripping", note: "Packs through your hands." },
  { id: "chase", name: "Chase", note: "The cards everyone opens for." },
  { id: "collect", name: "Collecting", note: "Filling sets and filling pages." },
  { id: "wealth", name: "Wealth", note: "Coins in the bank." },
  { id: "trainer", name: "Trainer", note: "The account itself." },
];

export const ACHIEVEMENTS = [
  // Ripping
  { id: "first-pack", cat: "rip", tier: 1, mark: "1", name: "First rip", note: "Open your first booster.", goal: 1, at: (c) => c.packs, coins: 25 },
  { id: "ten-packs", cat: "rip", tier: 1, mark: "10", name: "Warming up", note: "Rip ten packs.", goal: 10, at: (c) => c.packs, coins: 60 },
  { id: "box-worth", cat: "rip", tier: 2, mark: "36", name: "Box worth", note: "Rip 36 packs — a sealed booster box.", goal: 36, at: (c) => c.packs, coins: 150, title: "Box Breaker" },
  { id: "century", cat: "rip", tier: 2, mark: "100", name: "Century", note: "Rip 100 packs.", goal: 100, at: (c) => c.packs, coins: 300 },
  { id: "marathon", cat: "rip", tier: 3, mark: "250", name: "Marathon", note: "Rip 250 packs.", goal: 250, at: (c) => c.packs, coins: 700 },
  { id: "case-cracker", cat: "rip", tier: 4, mark: "500", name: "Case cracker", note: "Rip 500 packs — six boxes deep.", goal: 500, at: (c) => c.packs, coins: 1500, title: "Case Cracker" },

  // Chase
  { id: "first-hit", cat: "chase", tier: 1, mark: "★", name: "Hit", note: "Pull anything at hit rarity.", goal: 1, at: (c) => c.hits, coins: 40 },
  { id: "double-up", cat: "chase", tier: 1, mark: "★★", name: "Double up", note: "Own a Double Rare.", goal: 1, at: (c) => c.count("Double Rare"), coins: 40 },
  { id: "reverse", cat: "chase", tier: 1, mark: "◆", name: "Shiny back", note: "Pull a reverse holo.", goal: 1, at: (c) => c.reverses, coins: 25 },
  { id: "ultra", cat: "chase", tier: 2, mark: "☆☆", name: "Ultra", note: "Own an Ultra Rare.", goal: 1, at: (c) => c.count("Ultra Rare"), coins: 90 },
  { id: "illustrator", cat: "chase", tier: 2, mark: "☆", name: "Illustrator", note: "Own an Illustration Rare.", goal: 1, at: (c) => c.count("Illustration Rare"), coins: 110 },
  { id: "special-art", cat: "chase", tier: 3, mark: "☆☆", name: "Special art", note: "Own a Special Illustration Rare.", goal: 1, at: (c) => c.count("Special Illustration Rare"), coins: 260, title: "Artisan" },
  { id: "hit-stack", cat: "chase", tier: 3, mark: "25", name: "Hit stack", note: "Own 25 cards at hit rarity.", goal: 25, at: (c) => c.hits, coins: 450, title: "Chase Addict" },
  { id: "monochrome", cat: "chase", tier: 4, mark: "★☆", name: "Black and white", note: "Own a Black White Rare.", goal: 1, at: (c) => c.count("Black White Rare"), coins: 400, title: "Monochrome" },
  { id: "gold-chase", cat: "chase", tier: 4, mark: "◈", name: "Gold chase", note: "Own a gold Hyper Rare.", goal: 1, at: (c) => c.count("Mega Hyper Rare") + c.count("Hyper Rare"), coins: 500, title: "Goldsmith" },

  // Collecting
  { id: "unique-10", cat: "collect", tier: 1, mark: "10", name: "Getting started", note: "Own ten different cards.", goal: 10, at: (c) => c.unique, coins: 30 },
  { id: "binder-page", cat: "collect", tier: 1, mark: "9", name: "First page", note: "Fill nine binder pockets.", goal: 9, at: (c) => c.binder, coins: 70 },
  { id: "unique-50", cat: "collect", tier: 2, mark: "50", name: "Binder rat", note: "Own fifty different cards.", goal: 50, at: (c) => c.unique, coins: 120 },
  { id: "halfway", cat: "collect", tier: 2, mark: "50%", name: "Halfway", note: "Reach 50% on any live set.", goal: 50, at: (c) => c.bestSet, coins: 200 },
  { id: "binder-three", cat: "collect", tier: 2, mark: "27", name: "Three pages", note: "Fill twenty-seven binder pockets.", goal: 27, at: (c) => c.binder, coins: 220, title: "Curator" },
  { id: "unique-150", cat: "collect", tier: 3, mark: "150", name: "Dex keeper", note: "Own 150 different cards.", goal: 150, at: (c) => c.unique, coins: 400, title: "Dex Keeper" },
  { id: "master-set", cat: "collect", tier: 4, mark: "100%", name: "Master set", note: "Complete any live set.", goal: 100, at: (c) => c.bestSet, coins: 1200, title: "Set Master" },
  { id: "double-master", cat: "collect", tier: 4, mark: "x2", name: "Double master", note: "Complete two live sets.", goal: 2, at: (c) => c.setsDone, coins: 3000, title: "Completionist" },

  // Wealth
  { id: "clocked-in", cat: "wealth", tier: 1, mark: "✦", name: "Clocked in", note: "Claim an hourly stack.", goal: 1, at: (c) => (c.hourly ? 1 : 0), coins: 25 },
  { id: "loaded", cat: "wealth", tier: 1, mark: "250", name: "Loaded", note: "Hold ✦ 250 at once.", goal: 250, at: (c) => c.coins, coins: 60 },
  { id: "banked", cat: "wealth", tier: 2, mark: "1K", name: "Banked", note: "Hold ✦ 1,000 at once.", goal: 1000, at: (c) => c.coins, coins: 240, title: "High Roller" },
  { id: "vaulted", cat: "wealth", tier: 3, mark: "5K", name: "Vaulted", note: "Hold ✦ 5,000 at once.", goal: 5000, at: (c) => c.coins, coins: 900, title: "Vaulted" },

  // Trainer
  { id: "named", cat: "trainer", tier: 1, mark: "@", name: "Named trainer", note: "Make an account.", goal: 1, at: (c) => (c.signed ? 1 : 0), coins: 50 },
  { id: "pull-machine", cat: "trainer", tier: 2, mark: "500", name: "Pull machine", note: "Pull 500 cards.", goal: 500, at: (c) => c.pulls, coins: 250 },
  { id: "conveyor", cat: "trainer", tier: 3, mark: "2K", name: "Conveyor", note: "Pull 2,000 cards.", goal: 2000, at: (c) => c.pulls, coins: 800, title: "Conveyor" },
];

const BY_ID = new Map(ACHIEVEMENTS.map((row) => [row.id, row]));

export function achievementById(id) {
  return BY_ID.get(String(id || "")) || null;
}

/**
 * Everything the tests read. Built on titleContext so a title and an
 * achievement can never disagree about how many packs you have opened.
 */
export function achievementContext(save, opts = {}) {
  const base = titleContext(save, opts);
  const pcts = setPercents(save?.collection || {});
  const binder = Array.isArray(save?.binder) ? save.binder.filter(Boolean).length : 0;
  let copies = 0;
  for (const n of Object.values(save?.collection || {})) copies += n > 0 ? n : 0;
  return {
    ...base,
    binder,
    copies,
    setsDone: pcts.filter((pct) => pct >= 100).length,
    setsHalf: pcts.filter((pct) => pct >= 50).length,
  };
}

export function achievementProgress(row, ctx) {
  let at = 0;
  try {
    at = Number(row.at(ctx)) || 0;
  } catch {
    at = 0;
  }
  const goal = row.goal || 1;
  const done = at >= goal;
  return {
    at: Math.min(at, goal),
    goal,
    done,
    pct: Math.max(0, Math.min(100, Math.round((at / goal) * 100))),
  };
}

export function isAchievementDone(row, ctx) {
  return achievementProgress(row, ctx).done;
}

/** Ids that are finished but not yet claimed, in table order. */
export function readyToClaim(ctx, claimed) {
  const have = claimed instanceof Set ? claimed : new Set(claimed || []);
  return ACHIEVEMENTS.filter((row) => !have.has(row.id) && isAchievementDone(row, ctx)).map((row) => row.id);
}

export function claimTotal(ids) {
  return (ids || []).reduce((n, id) => n + (achievementById(id)?.coins || 0), 0);
}
