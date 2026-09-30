/**
 * Achievements, their progress, and what claiming one pays out.
 *
 * The worker imports this file too, so a claim is checked server-side against
 * the same table the account page draws — the client can ask for a reward, it
 * cannot decide it has earned one. `at(ctx)` returns raw progress against
 * `goal`, which is what draws the bar and what the claim check compares.
 */
import { titleContext, ownedPerSet, ownedMap } from "./titles.js";
import { RARITY_ORDER } from "./catalog.js";
import { nameHas, tokens, setIdOfCard } from "./achievement-kit.js";
import { SET_INFO } from "./achievement-eras.js";
import { RIP, CHASE, COLLECT, WEALTH, TRAINER } from "./achievement-core.js";
import { DEX } from "./achievement-dex.js";
import { RARITY, MARKET, BATTLE, SOCIAL, QUESTS } from "./achievement-misc.js";
import { SETS_GENERAL, SET_ROWS } from "./achievement-sets.js";
import { SECRETS } from "./achievement-secrets.js";

export const ACH_CATEGORIES = [
  { id: "rip", name: "Ripping", note: "Packs through your hands." },
  { id: "chase", name: "Chase", note: "The cards everyone opens for." },
  { id: "collect", name: "Collecting", note: "Filling sets and filling pages." },
  { id: "sets", name: "Sets", note: "Finish a set and it is yours for good." },
  { id: "dex", name: "Pokédex", note: "Collections by Pokémon name." },
  { id: "rarity", name: "Rarities", note: "One of every finish." },
  { id: "wealth", name: "Wealth", note: "Coins in the bank." },
  { id: "market", name: "Market", note: "Selling cards and opening sealed product." },
  { id: "battle", name: "Battles", note: "Pack battles against everyone." },
  { id: "social", name: "Social", note: "The people you play with." },
  { id: "quests", name: "Quests", note: "Daily work and streaks." },
  { id: "trainer", name: "Trainer", note: "The account itself." },
];

const BY_CATEGORY = {
  rip: RIP,
  chase: CHASE,
  collect: COLLECT,
  sets: [...SETS_GENERAL, ...SET_ROWS],
  dex: DEX,
  rarity: RARITY,
  wealth: WEALTH,
  market: MARKET,
  battle: BATTLE,
  social: SOCIAL,
  quests: QUESTS,
  trainer: TRAINER,
};

/** Every row, grouped by category in ACH_CATEGORIES order, secrets last in their group. */
export const ACHIEVEMENTS = ACH_CATEGORIES.flatMap((cat) => [
  ...(BY_CATEGORY[cat.id] || []),
  ...SECRETS.filter((row) => row.cat === cat.id),
]);

const BY_ID = new Map(ACHIEVEMENTS.map((row) => [row.id, row]));
const BY_SET = new Map();
for (const row of ACHIEVEMENTS) {
  if (!row.set) continue;
  if (!BY_SET.has(row.set)) BY_SET.set(row.set, []);
  BY_SET.get(row.set).push(row);
}

export function achievementById(id) {
  return BY_ID.get(String(id || "")) || null;
}

/** A secret row hides its name and note until it is done. */
export function isSecret(row) {
  return Boolean(row && row.secret === true);
}

/** Every row tied to one set: its halfway row, then its mastery row. */
export function achievementsBySet(setId) {
  return (BY_SET.get(String(setId || "")) || []).slice();
}

/** The mastery row of a set, or null for a set with none. */
export function masteryRowFor(setId) {
  return achievementsBySet(setId).find((row) => row.kind === "mastery") || null;
}

export function achievementsByCategory(catId) {
  return ACHIEVEMENTS.filter((row) => row.cat === catId);
}

/**
 * What to draw for a row: a secret that is not done yet shows its hint and
 * nothing else, so the name and note never reach the page early.
 */
export function achievementFace(row, done) {
  if (isSecret(row) && !done) {
    return { masked: true, name: "???", note: row.hint || "A secret.", mark: "?" };
  }
  return { masked: false, name: row.name, note: row.note, mark: row.mark };
}

const count = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

/**
 * The owned cards as `{ id, name, rarity, setId }`. `opts.cards` wins; else
 * `opts.findCard(id)` is asked for every owned id (the same lookup titleContext
 * takes); with neither, name based rows stay at zero.
 */
function ownedCards(save, opts) {
  let list = [];
  if (Array.isArray(opts.cards)) {
    list = opts.cards;
  } else if (typeof opts.findCard === "function") {
    for (const [id, n] of Object.entries(ownedMap(save))) {
      if (!(n > 0)) continue;
      const card = opts.findCard(id);
      if (card) list.push({ ...card, id: card.id || id });
    }
  }
  return list
    .filter((card) => card && card.id)
    .map((card) => ({
      id: String(card.id),
      name: String(card.name || ""),
      rarity: card.rarity,
      setId: card.setId || setIdOfCard(card.id),
    }));
}

/** A lookup over owned card names: whole-word, case-insensitive, memoised. */
function nameLookup(cards) {
  const names = cards.map((card) => card.name.toLowerCase()).filter(Boolean);
  const words = new Map();
  for (const name of names) {
    for (const word of new Set(tokens(name))) words.set(word, (words.get(word) || 0) + 1);
  }
  const memo = new Map();
  const countName = (query) => {
    const key = String(query || "").toLowerCase().trim();
    if (!key) return 0;
    if (memo.has(key)) return memo.get(key);
    // One plain word is a token lookup; anything with spaces or punctuation
    // ("Team Rocket's", "Ho-Oh") scans the names.
    const n = /^[\p{L}\p{N}]+$/u.test(key) ? words.get(key) || 0 : names.filter((name) => nameHas(name, key)).length;
    memo.set(key, n);
    return n;
  };
  return {
    countName,
    has: (query) => countName(query) > 0,
    species: (list) => (Array.isArray(list) ? list.filter((name) => countName(name) > 0).length : 0),
  };
}

/**
 * Everything the tests read. Built on titleContext so a title and an
 * achievement can never disagree about how many packs you have opened.
 *
 * Pass `opts.cards` (or `opts.findCard`) so the name rows can see what you
 * own. `save.stats` (from the Worker) feeds stat(), setPacks() and friends;
 * anything missing reads as zero.
 */
export function achievementContext(save, options = {}) {
  const opts = options || {};
  const cards = ownedCards(save, opts);
  let rarities = opts.rarities || null;
  if (!rarities && cards.length) {
    rarities = {};
    for (const card of cards) if (card.rarity) rarities[card.rarity] = (rarities[card.rarity] || 0) + 1;
  }
  const base = titleContext(save, { ...opts, rarities });
  const collection = ownedMap(save); // raw copies plus slabs
  const stats = save?.stats && typeof save.stats === "object" ? save.stats : {};
  const counters = stats.counters && typeof stats.counters === "object" ? stats.counters : {};
  const packsBySet = stats.setPacks && typeof stats.setPacks === "object" ? stats.setPacks : {};

  const binder = Array.isArray(save?.binder) ? save.binder.filter(Boolean).length : 0;
  let copies = 0;
  let maxCopies = 0;
  for (const n of Object.values(collection)) {
    if (!(n > 0)) continue;
    copies += n;
    if (n > maxCopies) maxCopies = n;
  }

  const owned = ownedPerSet(collection);
  const setOwned = (id) => owned.get(id) || 0;
  const setTotal = (id) => SET_INFO.get(id)?.total || 0;
  const setPct = (id) => {
    const total = setTotal(id);
    if (!total) return 0;
    const have = setOwned(id);
    return have >= total ? 100 : Math.floor((have / total) * 100);
  };
  const setPacks = (id) => count(packsBySet[id]);

  let setsDone = 0;
  let setsHalf = 0;
  let setsStarted = 0;
  let setsAlmost = 0;
  let setsRipped = 0;
  let bestSetPacks = 0;
  let promoOwned = 0;
  const eraCards = new Map();
  const eraRipped = new Set();
  const editionCards = new Map();
  const editionDone = new Map();
  for (const info of SET_INFO.values()) {
    const have = setOwned(info.id);
    const packs = setPacks(info.id);
    if (info.total && have >= info.total) setsDone += 1;
    if (info.total && have * 2 >= info.total) setsHalf += 1;
    if (have > 0) setsStarted += 1;
    if (info.total >= 100 && have > 0 && have >= info.total - 1) setsAlmost += 1;
    if (packs > 0) {
      setsRipped += 1;
      eraRipped.add(info.era);
    }
    if (packs > bestSetPacks) bestSetPacks = packs;
    if (info.promo) promoOwned += have;
    eraCards.set(info.era, (eraCards.get(info.era) || 0) + have);
    editionCards.set(info.edition, (editionCards.get(info.edition) || 0) + have);
    if (info.total && have >= info.total) editionDone.set(info.edition, (editionDone.get(info.edition) || 0) + 1);
  }

  return {
    ...base,
    ...nameLookup(cards),
    binder,
    copies,
    maxCopies,
    setsDone,
    setsHalf,
    setsStarted,
    setsAlmost,
    setsRipped,
    bestSetPacks,
    promoOwned,
    erasStarted: [...eraCards.values()].filter((n) => n > 0).length,
    erasRipped: eraRipped.size,
    eraOwned: (era) => eraCards.get(era) || 0,
    editionOwned: (edition) => editionCards.get(edition) || 0,
    editionDone: (edition) => editionDone.get(edition) || 0,
    raritiesOwned: RARITY_ORDER.filter((rarity) => base.count(rarity) > 0).length,
    setOwned,
    setTotal,
    setPct,
    setPacks,
    stat: (key) => count(counters[key]),
    friends: count(stats.friends),
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
