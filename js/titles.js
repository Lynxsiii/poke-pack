import { PLAYABLE_SETS } from "./catalog.js";
import { HIT_RARITIES, HIT_TALLY, tallyRarity } from "./engine.js";
import { dexId, foldCopies, homeSetId } from "./card-home.js";
import { CROWN_ERAS, eraSlug } from "./achievement-eras.js";
import { levelTitleRows } from "./level-data.js";

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
  { id: "gold-chaser", name: "Gold chaser", note: "Own a gold Hyper Rare.", test: (c) => c.count("Mega Hyper Rare") >= 1 || c.count("Hyper Rare") >= 1 },
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
  { id: "loaded", name: "Loaded", note: "Hold 250 coins.", test: (c) => c.coins >= 250 },
  { id: "banked", name: "Banked", note: "Hold 1,000 coins.", test: (c) => c.coins >= 1000 },
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
  // Rewards from the wider achievement table (js/achievement-*.js).
  { id: "thousand-club", name: "Thousand Club", ach: "pack-1000" },
  { id: "pack-factory", name: "Pack Factory", ach: "pack-5000" },
  { id: "bindermaster", name: "Bindermaster", ach: "binder-360" },
  { id: "librarian", name: "Librarian", ach: "unique-5000" },
  { id: "six-figures", name: "Six Figures", ach: "coins-100k" },
  { id: "never-miss", name: "Never Miss", ach: "bonus-1000" },
  { id: "living-legend", name: "Living Legend", ach: "trophies-200" },
  { id: "legend-keeper", name: "Legend Keeper", ach: "legend-hunter-all" },
  { id: "finish-line", name: "Finish Line", ach: "finishes-30" },
  { id: "dealer", name: "Dealer", ach: "sold-1000" },
  { id: "arena-legend", name: "Arena Legend", ach: "wins-100" },
  { id: "social-butterfly", name: "Social Butterfly", ach: "friends-50" },
  { id: "guild-veteran", name: "Guild Veteran", ach: "quests-500" },
  { id: "devoted", name: "Devoted", ach: "streak-100" },
  { id: "grand-master", name: "Grand Master", ach: "sets-done-10" },
  { id: "pokemon-master", name: "Pokémon Master", ach: "sets-done-all" },
  // Secret achievements.
  { id: "drought-survivor", name: "Drought Survivor", ach: "desert-crossing" },
  { id: "almost-there", name: "Almost There", ach: "so-close" },
  { id: "flame-hoarder", name: "Flame Hoarder", ach: "charizard-hoard" },
  { id: "full-spectrum", name: "Full Spectrum", ach: "full-spectrum" },
  { id: "globetrotter", name: "Globetrotter", ach: "grand-tour" },
  { id: "evergreen", name: "Evergreen", ach: "year-of-quests" },
];

/** Titles stop at 32 characters (PATCH /api/me cuts them there). */
const TITLE_MAX = 32;

/**
 * The title a set's mastery pays: "<Set name> Master". A few set names are
 * long enough to overflow (McDonald's Match Battle 2023), so those drop the
 * brand first and only then get cut.
 */
export function masteryTitle(setName) {
  let name = String(setName || "").trim();
  if (`${name} Master`.length > TITLE_MAX) name = name.replace(/^McDonald's\s+/, "");
  if (`${name} Master`.length > TITLE_MAX) name = name.slice(0, TITLE_MAX - " Master".length).trim();
  return `${name} Master`;
}

/** The title an era crown pays: "<Era> Champion", cut to fit like masteryTitle. */
export function crownTitle(era) {
  let name = String(era || "").trim();
  if (`${name} Champion`.length > TITLE_MAX) name = name.slice(0, TITLE_MAX - " Champion".length).trim();
  return `${name} Champion`;
}

// One title per big era, earned by its crown (`era-<slug>-crown`, js/achievement-sets.js).
for (const era of CROWN_ERAS) {
  AWARD_TITLES.push({
    id: `champion-${eraSlug(era)}`,
    name: crownTitle(era),
    ach: `era-${eraSlug(era)}-crown`,
    note: `Master every set of the ${era} era.`,
  });
}

// One title per set, earned by claiming that set's mastery achievement
// (`set-<id>-master` in js/achievement-sets.js).
for (const set of PLAYABLE_SETS) {
  AWARD_TITLES.push({
    id: `master-${set.id}`,
    name: masteryTitle(set.name),
    ach: `set-${set.id}-master`,
    note: `Complete every card in ${set.name}.`,
  });
}

for (const row of AWARD_TITLES) {
  TITLES.push({
    note: "Reward for an achievement.",
    ...row,
    award: true,
    test: (c) => c.claimed.has(row.ach),
  });
}

// Level titles: worn once the player reaches the level (js/level-data.js). Ids are `level-<n>`.
for (const row of levelTitleRows()) {
  TITLES.push({ ...row, test: (c) => (c.level || 0) >= row.level });
}

/**
 * `level` overrides save.xp.level, for the Worker, which has the stored level
 * and not a computed save. A save without xp (older client) reads as level 1.
 */
export function titleContext(save, { signed = true, rarities = null, findCard = null, level = null } = {}) {
  // Raw copies plus graded ones: a card sitting in a slab is still owned.
  const collection = ownedMap(save);
  const reverses = save?.reverses || {};
  const counts = rarities || rarityCounts(collection, findCard);
  const unique = Object.values(collection).filter((n) => n > 0).length;
  const gradedReverse = new Set((Array.isArray(save?.graded) ? save.graded : []).filter((s) => s && s.reverse).map((s) => s.cardId));
  let reverseCount = Object.values(reverses).reduce((n, v) => n + (v > 0 ? 1 : 0), 0);
  for (const id of gradedReverse) if (!(reverses[id] > 0)) reverseCount += 1;
  // A tally from tallyRarity counts the hits itself (a WotC holo Rare is one); a bare rarity map adds up the hit rarities.
  let hits = counts[HIT_TALLY];
  if (hits == null) {
    hits = 0;
    for (const rarity of HIT_RARITIES) hits += counts[rarity] || 0;
  }
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
    level: Math.max(1, Math.floor(Number(level ?? save?.xp?.level) || 1)),
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
    tallyRarity(counts, { ...card, id: card.id || id });
  }
  return counts;
}

/**
 * Completion percentage of every playable set, in catalog order. Rounded down,
 * so a set one card short never reads as 100%.
 */
export function setPercents(collection) {
  const owned = ownedPerSet(collection);
  return PLAYABLE_SETS.map((set) => {
    const total = set.totalCount || 1;
    const have = owned.get(set.id) || 0;
    return have >= total ? 100 : Math.floor((have / total) * 100);
  });
}

/** How many different cards of each set are in a collection, by set id (a Trainer Kit copy counts as the card it copies). */
export function ownedPerSet(collection) {
  const owned = new Map();
  for (const [id, n] of Object.entries(foldCopies(collection))) {
    if (!(n > 0)) continue;
    if (id.indexOf("-") <= 0) continue;
    const setId = homeSetId(id);
    owned.set(setId, (owned.get(setId) || 0) + 1);
  }
  return owned;
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

/**
 * Every copy a player owns as `{ cardId: qty }`: the raw sellable counts in
 * save.collection plus one per active slab in save.graded (a graded copy left
 * `cards` for its case but is still theirs), with a Trainer Kit copy's count
 * under the card it copies (js/card-home.js dexId). The client and the Worker
 * both count completion, rarities and achievements from this map; selling and
 * staking read the raw ids.
 */
export function ownedMap(save) {
  const owned = {};
  for (const [id, n] of Object.entries(save?.collection || {})) {
    if (n > 0) owned[dexId(id)] = (owned[dexId(id)] || 0) + n;
  }
  for (const slab of Array.isArray(save?.graded) ? save.graded : []) {
    if (slab?.cardId) owned[dexId(slab.cardId)] = (owned[dexId(slab.cardId)] || 0) + 1;
  }
  return owned;
}
