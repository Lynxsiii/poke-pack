/**
 * Set achievements: the general ladders (sets finished, eras entered) and one
 * pair of rows for every playable set, built straight from the catalog so a
 * new set gets its halfway and mastery rows without anyone editing this file.
 *
 * Progress on a set row is a card count, not a percentage: "37 of 75" reads
 * better than "49%" and the claim check compares the same numbers.
 */
import { PLAYABLE_SETS } from "./catalog.js";
import { ach, fmt } from "./achievement-kit.js";
import { CROWN_ERAS, ERA_NAMES, eraSlug, eraTotal, setsInEra } from "./achievement-eras.js";
import { crownTitle, masteryTitle } from "./titles.js";
import { CROWN_GIFTS, MASTERY_GIFTS } from "./mastery-gifts.js";

const slug = eraSlug;

/**
 * What the set rows pay, in one place. Coins grow with the size of the set so
 * a 370-card master is worth more than a 12-card McDonald's box, with a floor
 * (small sets still pay something worth a claim) and a ceiling (so one row can
 * never dwarf the economy). These numbers only decide what an UNCLAIMED row
 * pays: a row already in someone's `claimed` list was paid once at the old
 * amount and is never paid again.
 *
 *   half    base + perCard x cards, rounded to `step`      (the 50% row)
 *   master  base + perCard x cards, rounded, floor base, ceiling max
 *   crown   base + perCard x the era's cards, rounded, ceiling max
 *
 * Before the remaster: half = 1.5 x cards, master = 500 + 5 x cards.
 */
export const HALF_COIN = { base: 40, perCard: 2, step: 10 };
export const MASTERY_COIN = { base: 600, perCard: 7, step: 50, max: 4000 };
export const CROWN_COIN = { base: 3000, perCard: 1.5, step: 100, max: 10000 };

function scaled(rule, total) {
  const cards = Math.max(0, Math.floor(Number(total) || 0));
  const coins = Math.round((rule.base + cards * rule.perCard) / rule.step) * rule.step;
  return Math.min(rule.max ?? Infinity, Math.max(rule.base, coins));
}

/** Coins for half a set. */
export function halfCoins(total) {
  return scaled(HALF_COIN, total);
}

/** Coins for a whole set. */
export function masteryCoins(total) {
  return scaled(MASTERY_COIN, total);
}

/** Coins for an era crown, from the era's total card count. */
export function crownCoins(total) {
  return scaled(CROWN_COIN, total);
}

const plainGear = (list) => (Array.isArray(list) ? list : []).map(({ kind, id }) => ({ kind, id }));

/** The sleeve and coin a set's mastery gifts: [{kind, id}], [] for a set with no gear. */
export function masteryGear(setId) {
  return plainGear(Object.prototype.hasOwnProperty.call(MASTERY_GIFTS, setId) ? MASTERY_GIFTS[setId] : []);
}

/** The sleeve and coin an era crown gifts, by era name. */
export function crownGear(era) {
  const key = eraSlug(era);
  return plainGear(Object.prototype.hasOwnProperty.call(CROWN_GIFTS, key) ? CROWN_GIFTS[key] : []);
}

/** A half row asking this many cards or more is a tier 3 row (more XP) instead of tier 2. */
export const HALF_TIER3_GOAL = 75;

export function halfGoal(total) {
  return Math.ceil(total / 2);
}

/** Two rows per playable set: `set-<id>-half` and `set-<id>-master`. */
export const SET_ROWS = PLAYABLE_SETS.flatMap((set) => {
  const total = set.totalCount || 1;
  const half = halfGoal(total);
  return [
    ach(
      "sets",
      half >= HALF_TIER3_GOAL ? 3 : 2, // 120 XP once half a set is 75 cards or more, else 50
      `set-${set.id}-half`,
      `${set.name}, halfway`,
      `Own half of ${set.name}: ${fmt(half)} of its ${fmt(total)} cards.`,
      half,
      (c) => c.setOwned(set.id),
      halfCoins(total),
      { mark: "50%", set: set.id, kind: "half" }
    ),
    ach(
      "sets",
      4,
      `set-${set.id}-master`,
      `${set.name} mastery`,
      `Complete ${set.name}: own all ${fmt(total)} cards. Unlocks the ${masteryTitle(set.name)} title, an emblem, a banner${masteryGear(set.id).length ? " and the set's own gear" : ""}.`,
      total,
      (c) => c.setOwned(set.id),
      masteryCoins(total),
      { mark: "100%", set: set.id, kind: "mastery", title: masteryTitle(set.name), reward: { gear: masteryGear(set.id) } }
    ),
  ];
});

const ERA_LADDERS = {
  "Mega Evolution": [
    [100, 1, 100, "Mega arrival"],
    [500, 2, 400, "Mega momentum"],
    [1000, 3, 1000, "Mega master plan"],
  ],
  "Scarlet & Violet": [
    [250, 1, 100, "Paldea bound"],
    [1000, 2, 400, "Paldea regular"],
    [2500, 3, 1200, "Paldea local"],
  ],
  "Sword & Shield": [
    [250, 1, 100, "Galar bound"],
    [1000, 2, 400, "Galar regular"],
    [2000, 3, 1100, "Galar local"],
  ],
  // The era prints about 3,000 cards (16 sets, Detective Pikachu, the Black
  // Star promos, three McDonald's boxes); a rung only shows once the playable
  // sets add up to its goal, so the ladder grows as the sets land.
  "Sun & Moon": [
    [250, 1, 100, "Alola bound"],
    [1000, 2, 400, "Alola regular"],
    [2000, 3, 1100, "Alola local"],
  ],
};

const ERA_ROWS = ERA_NAMES.flatMap((era) =>
  (ERA_LADDERS[era] || [])
    .filter(([goal]) => goal <= eraTotal(era))
    .map(([goal, tier, coins, name]) =>
      ach("sets", tier, `era-${slug(era)}-${goal}`, name, `Own ${fmt(goal)} different cards from the ${era} era.`, goal, (c) => c.eraOwned(era), coins)
    )
);

/**
 * One crown per big era: master every playable set of it. Generated from the
 * set data (CROWN_ERAS), so an era that grows or appears needs no edit here
 * (re-run scripts/make_mastery_gifts.py to give it gear). Tier 4, plus the
 * crown bonus in js/xp.js.
 */
export const CROWN_ROWS = CROWN_ERAS.map((era) => {
  const sets = setsInEra(era);
  const gear = crownGear(era);
  return ach(
    "sets",
    4,
    `era-${slug(era)}-crown`,
    `${era} crown`,
    `Master all ${fmt(sets.length)} ${era} sets. Unlocks the ${crownTitle(era)} title${gear.length ? " and gear picked for the era" : ""}.`,
    sets.length,
    (c) => c.eraSetsDone(era),
    crownCoins(eraTotal(era)),
    { mark: "CROWN", kind: "crown", era, title: crownTitle(era), reward: { gear } }
  );
});

export const SETS_GENERAL = [
  ach("sets", 1, "sets-started-5", "Window shopping", "Own at least one card from 5 different sets.", 5, (c) => c.setsStarted, 60),
  ach("sets", 1, "sets-started-10", "Set sampler", "Own at least one card from 10 different sets.", 10, (c) => c.setsStarted, 150),
  ach("sets", 2, "sets-started-20", "Well travelled", "Own at least one card from 20 different sets.", 20, (c) => c.setsStarted, 400),
  ach("sets", 3, "sets-started-30", "Set tourist", "Own at least one card from 30 different sets.", 30, (c) => c.setsStarted, 900),
  ach("sets", 3, "sets-started-40", "Nearly everywhere", "Own at least one card from 40 different sets.", 40, (c) => c.setsStarted, 1500),
  ...[
    [50, 4, "sets-started-50", "Fifty sets in", 2000],
    [60, 4, "sets-started-60", "Sixty sets in", 2500],
  ]
    .filter(([goal]) => goal <= PLAYABLE_SETS.length)
    .map(([goal, tier, id, name, coins]) => ach("sets", tier, id, name, `Own at least one card from ${goal} different sets.`, goal, (c) => c.setsStarted, coins)),
  ach("sets", 1, "era-all", "Every era", `Own a card from every era: ${ERA_NAMES.join(", ")}.`, ERA_NAMES.length, (c) => c.erasStarted, 100, { mark: "ERA" }),
  ...ERA_ROWS,
  ...CROWN_ROWS,
  ach("sets", 2, "sets-half-3", "Halfway house", "Reach 50% on 3 different sets.", 3, (c) => c.setsHalf, 250),
  ach("sets", 3, "sets-half-5", "Five halves", "Reach 50% on 5 different sets.", 5, (c) => c.setsHalf, 600),
  ach("sets", 3, "sets-half-10", "Ten halves", "Reach 50% on 10 different sets.", 10, (c) => c.setsHalf, 1200),
  ach("sets", 4, "sets-half-20", "Twenty halves", "Reach 50% on 20 different sets.", 20, (c) => c.setsHalf, 2500),
  ach("sets", 4, "sets-done-3", "Triple master", "Complete 3 sets.", 3, (c) => c.setsDone, 3000, { mark: "x3" }),
  ach("sets", 4, "sets-done-5", "High five", "Complete 5 sets.", 5, (c) => c.setsDone, 3500, { mark: "x5" }),
  ach("sets", 4, "sets-done-10", "Ten sets deep", "Complete 10 sets.", 10, (c) => c.setsDone, 4000, { mark: "x10", title: "Grand Master" }),
  ach("sets", 4, "sets-done-25", "Quarter century", "Complete 25 sets.", 25, (c) => c.setsDone, 4500, { mark: "x25" }),
  ach("sets", 4, "sets-done-all", "Every last set", "Complete every playable set.", PLAYABLE_SETS.length, (c) => c.setsDone, 5000, { mark: "ALL", title: "Pokémon Master" }),

  ach("sets", 1, "happy-meal", "Happy meal", "Own a card from a McDonald's set.", 1, (c) => c.editionOwned("McDonald's"), 60, { mark: "M" }),
  ach("sets", 1, "trick-or-treat", "Trick or treat", "Own a card from a Trick or Trade set.", 1, (c) => c.editionOwned("Trick or Trade"), 60, { mark: "TT" }),
  ach("sets", 1, "black-star", "Black star", "Own a card from a Black Star Promos set.", 1, (c) => c.promoOwned, 40, { mark: "P" }),
  ach("sets", 2, "promo-pile", "Promo pile", "Own 10 different Black Star promos.", 10, (c) => c.promoOwned, 200),
  ach("sets", 3, "star-collector", "Star collector", "Own 30 different Black Star promos.", 30, (c) => c.promoOwned, 500),
];

/** The rows for one set, halfway first. */
export function setRows(setId) {
  return SET_ROWS.filter((row) => row.set === setId);
}
