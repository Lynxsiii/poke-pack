import { PLAYABLE_SETS } from "./catalog.js";
import { HIT_RARITIES } from "./engine.js";

export const TITLES = [
  { id: "rookie", name: "Rookie", note: "Everyone starts here.", test: () => true },
  { id: "trainer", name: "Trainer", note: "Open your first pack.", test: (c) => c.packs >= 1 },
  { id: "ripper", name: "Ripper", note: "Rip 10 packs.", test: (c) => c.packs >= 10 },
  { id: "century", name: "Century", note: "Rip 100 packs.", test: (c) => c.packs >= 100 },
  { id: "marathon", name: "Marathon", note: "Rip 250 packs.", test: (c) => c.packs >= 250 },
  { id: "pull-machine", name: "Pull machine", note: "Pull 500 cards.", test: (c) => c.pulls >= 500 },
  { id: "collector", name: "Collector", note: "Own 10 unique cards.", test: (c) => c.unique >= 10 },
  { id: "binder-rat", name: "Binder rat", note: "Own 50 unique cards.", test: (c) => c.unique >= 50 },
  { id: "living-dex", name: "Living dex", note: "Own 150 unique cards.", test: (c) => c.unique >= 150 },
  { id: "hit-hunter", name: "Hit hunter", note: "Own any hit rarity.", test: (c) => c.hits >= 1 },
  { id: "double-rare", name: "Double rare", note: "Own a Double Rare.", test: (c) => c.count("Double Rare") >= 1 },
  { id: "ultra", name: "Ultra", note: "Own an Ultra Rare.", test: (c) => c.count("Ultra Rare") >= 1 },
  { id: "illustration", name: "Illustration", note: "Own an Illustration Rare.", test: (c) => c.count("Illustration Rare") >= 1 },
  { id: "special-artist", name: "Special artist", note: "Own a Special Illustration Rare.", test: (c) => c.count("Special Illustration Rare") >= 1 },
  { id: "gold-chaser", name: "Gold chaser", note: "Own a Mega Hyper Rare.", test: (c) => c.count("Mega Hyper Rare") >= 1 },
  { id: "black-white", name: "Black & White", note: "Own a Black White Rare.", test: (c) => c.count("Black White Rare") >= 1 },
  { id: "mega-striker", name: "Mega striker", note: "Own a Mega Attack Rare.", test: (c) => c.count("Mega Attack Rare") >= 1 },
  { id: "ace-spec", name: "ACE SPEC", note: "Own an ACE SPEC Rare.", test: (c) => c.count("ACE SPEC Rare") >= 1 },
  { id: "shiny", name: "Shiny", note: "Own a Shiny Rare or Shiny Ultra Rare.", test: (c) => c.count("Shiny Rare") + c.count("Shiny Ultra Rare") >= 1 },
  { id: "future-sight", name: "Future sight", note: "Own a Futuristic Rare.", test: (c) => c.count("Futuristic Rare") >= 1 },
  { id: "shiny-back", name: "Shiny back", note: "Pull a reverse holo.", test: (c) => c.reverses >= 1 },
  { id: "halfway", name: "Halfway", note: "Reach 50% on any live set.", test: (c) => c.bestSet >= 50 },
  { id: "gym-leader", name: "Gym Leader", note: "Complete any live set.", test: (c) => c.bestSet >= 100 },
  { id: "champion", name: "Champion", note: "Complete a set and rip 100 packs.", test: (c) => c.bestSet >= 100 && c.packs >= 100 },
  { id: "hourly", name: "Hourly", note: "Claim the hourly stack.", test: (c) => c.hourly },
  { id: "loaded", name: "Loaded", note: "Hold ✦ 250.", test: (c) => c.coins >= 250 },
  { id: "banked", name: "Banked", note: "Hold ✦ 1,000.", test: (c) => c.coins >= 1000 },
  { id: "named", name: "Named trainer", note: "Make an account.", test: (c) => c.signed },
];

/**
 * Titles you cannot reach by playing alone — they arrive with an achievement
 * reward, so the badge and the title are the same act. `ach` is the achievement
 * id in js/achievements.js; claiming it writes that id into the save, which is
 * what these tests read.
 */
export const AWARD_TITLES = [
  { id: "box-breaker", name: "Box Breaker", ach: "box-worth" },
  { id: "case-cracker", name: "Case Cracker", ach: "case-cracker" },
  { id: "artisan", name: "Artisan", ach: "special-art" },
  { id: "goldsmith", name: "Goldsmith", ach: "gold-chase" },
  { id: "monochrome", name: "Monochrome", ach: "monochrome" },
  { id: "chase-addict", name: "Chase Addict", ach: "hit-stack" },
  { id: "dex-keeper", name: "Dex Keeper", ach: "unique-150" },
  { id: "set-master", name: "Set Master", ach: "master-set" },
  { id: "completionist", name: "Completionist", ach: "double-master" },
  { id: "curator", name: "Curator", ach: "binder-three" },
  { id: "high-roller", name: "High Roller", ach: "banked" },
  { id: "vaulted", name: "Vaulted", ach: "vaulted" },
  { id: "conveyor", name: "Conveyor", ach: "conveyor" },
];

for (const row of AWARD_TITLES) {
  TITLES.push({
    ...row,
    award: true,
    note: "Reward for an achievement.",
    test: (c) => c.claimed.has(row.ach),
  });
}

export function titleContext(save, { signed = true, rarities = null, findCard = null } = {}) {
  const collection = save?.collection || {};
  const reverses = save?.reverses || {};
  const counts = rarities || rarityCounts(collection, findCard);
  const unique = Object.values(collection).filter((n) => n > 0).length;
  const reverseCount = Object.values(reverses).reduce((n, v) => n + (v > 0 ? 1 : 0), 0);
  let hits = 0;
  for (const rarity of HIT_RARITIES) hits += counts[rarity] || 0;
  return {
    claimed: new Set(Array.isArray(save?.claimed) ? save.claimed : []),
    packs: save?.packsOpened || 0,
    pulls: save?.pulls || 0,
    coins: save?.coins || 0,
    unique,
    reverses: reverseCount,
    hits,
    bestSet: bestSetPct(collection),
    hourly: Boolean(save?.lastDaily),
    signed,
    count: (rarity) => counts[rarity] || 0,
  };
}

function rarityCounts(collection, findCard) {
  const counts = {};
  if (!findCard) return counts;
  for (const [id, n] of Object.entries(collection)) {
    if (!n) continue;
    const card = findCard(id);
    if (!card) continue;
    counts[card.rarity] = (counts[card.rarity] || 0) + 1;
  }
  return counts;
}

/** Completion percentage of every playable set, in catalog order. */
export function setPercents(collection) {
  return PLAYABLE_SETS.map((set) => {
    const total = set.totalCount || 1;
    let owned = 0;
    for (const [id, n] of Object.entries(collection || {})) {
      if (n > 0 && id.startsWith(`${set.id}-`)) owned += 1;
    }
    return Math.round((owned / total) * 100);
  });
}

function bestSetPct(collection) {
  return setPercents(collection).reduce((best, pct) => Math.max(best, pct), 0);
}

export function unlockedTitles(ctx) {
  return TITLES.filter((row) => {
    try {
      return Boolean(row.test(ctx));
    } catch {
      return row.id === "rookie";
    }
  });
}

export function titleByName(name) {
  return TITLES.find((row) => row.name === name) || TITLES[0];
}

export function isTitleUnlocked(name, ctx) {
  const row = titleByName(name);
  try {
    return Boolean(row.test(ctx));
  } catch {
    return row.id === "rookie";
  }
}
