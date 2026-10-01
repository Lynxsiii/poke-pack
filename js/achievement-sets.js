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
import { ERA_NAMES, eraTotal } from "./achievement-eras.js";
import { masteryTitle } from "./titles.js";

const slug = (text) => String(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Coins for half a set: 1.5 per card, rounded to ten, never under ten (a 2-card promo set still pays). */
export function halfCoins(total) {
  return Math.max(10, Math.round((total * 1.5) / 10) * 10);
}

/** Coins for a whole set: 500 plus 5 per card, rounded to fifty. */
export function masteryCoins(total) {
  return Math.round((500 + total * 5) / 50) * 50;
}

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
      2,
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
      `Complete ${set.name}: own all ${fmt(total)} cards. Unlocks the ${masteryTitle(set.name)} title, an emblem and a banner.`,
      total,
      (c) => c.setOwned(set.id),
      masteryCoins(total),
      { mark: "100%", set: set.id, kind: "mastery", title: masteryTitle(set.name), reward: {} }
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
  // XY (2014-2016): about 2,300 cards once the 16 sets, the Black Star promos,
  // McDonald's 2014-2016 and the eight Trainer Kits are in; a rung shows once
  // the playable sets add up to its goal. TODO(lead): re-check the goals when
  // the set builders report the real totalCounts.
  XY: [
    [250, 1, 100, "Kalos bound"],
    [1000, 2, 400, "Kalos regular"],
    [1800, 3, 1100, "Kalos local"],
  ],
  // Black & White (2011-2013): 1,336 cards in the 12 sets (pkmn.gg totals: bw1 115, bw2 98,
  // bw3 102, bw4 103, bw5 111, bw6 128, dv1 21, bw7 153, bw8 138, bw9 122, bw10 105, bw11 140),
  // about 1,500 with the BW Black Star Promos, McDonald's 2011-2012 and the two Trainer Kits. A rung
  // shows once the playable sets add up to its goal. TODO(lead): re-check against the real totalCounts.
  "Black & White": [
    [250, 1, 100, "Unova bound"],
    [750, 2, 400, "Unova regular"],
    [1200, 3, 1100, "Unova local"],
  ],
  // Diamond & Pearl and Platinum (2007-2009): 1,361 cards in the 11 sets (pkmn.gg totals: dp1 130, dp2 124, dp3 132, dp4 106,
  // dp5 100, dp6 146, dp7 106, pl1 133, pl2 120, pl3 153, pl4 111), about 1,500 with the DP Black Star Promos (56), POP
  // Series 6-9 (68) and the two DP Trainer Kits (23). TODO(lead): re-check against the real totalCounts.
  "Diamond & Pearl": [
    [250, 1, 100, "Sinnoh bound"],
    [750, 2, 400, "Sinnoh regular"],
    [1300, 3, 1100, "Sinnoh local"],
  ],
  // HeartGold & SoulSilver (2010-2011): 520 cards in the 5 sets (hgss1 124, hgss2 96, hgss3 91, hgss4 103, col1 106),
  // about 605 with the HGSS Black Star Promos (25) and the two Trainer Kits (60). TODO(lead): re-check against the real totalCounts.
  "HeartGold & SoulSilver": [
    [100, 1, 100, "Johto bound"],
    [250, 2, 400, "Johto regular"],
    [500, 3, 1100, "Johto local"],
  ],
};

const ERA_ROWS = ERA_NAMES.flatMap((era) =>
  (ERA_LADDERS[era] || [])
    .filter(([goal]) => goal <= eraTotal(era))
    .map(([goal, tier, coins, name]) =>
      ach("sets", tier, `era-${slug(era)}-${goal}`, name, `Own ${fmt(goal)} different cards from the ${era} era.`, goal, (c) => c.eraOwned(era), coins)
    )
);

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
