/**
 * Level data that js/cosmetics.js and js/titles.js need. Kept in a file with no
 * imports because js/levels.js pulls in js/xp.js, which pulls in js/titles.js:
 * reading these from levels.js inside titles.js would be a cycle. js/levels.js
 * re-exports everything here, so callers can import from either.
 */

/** New banner motions. The five original motions (aurora, drift, pulse, beam, mist) stay free. */
export const BANNER_MOTION_LEVELS = { foil: 10, starfall: 25, holo: 40 };
export const BANNER_MOTION_NAMES = { foil: "Foil", starfall: "Starfall", holo: "Holo" };

/** Titles that arrive with a level. Ids are `level-<n>`; names are at most 32 characters. */
export const LEVEL_TITLES = [
  { level: 5, name: "Apprentice" },
  { level: 10, name: "Ranger" },
  { level: 20, name: "Ace Trainer" },
  { level: 30, name: "Elite" },
  { level: 40, name: "Veteran" },
  { level: 50, name: "Elite Four" },
  { level: 60, name: "Professor" },
  { level: 70, name: "Frontier Brain" },
  { level: 80, name: "Hall of Famer" },
  { level: 90, name: "Master Trainer" },
  { level: 100, name: "Legend" },
  { level: 125, name: "Battle Legend" },
  { level: 150, name: "Ultra Ace" },
  { level: 175, name: "Mythical" },
  { level: 200, name: "Apex Trainer" },
];

/** Titles that arrive with a prestige star. Ids are `prestige-<n>`. */
export const PRESTIGE_TITLES = [
  { prestige: 1, name: "Reborn" },
  { prestige: 3, name: "Ascended" },
  { prestige: 5, name: "Ultra Beast" },
  { prestige: 10, name: "Eternal Champion" },
];

/** The title for players who reached level 100 on the first, easier curve. */
export const ORIGINAL_TITLE = { id: "original-100", name: "Original 100", note: "Reached level 100 before levels got harder." };

/**
 * Level and prestige titles as title rows so js/titles.js can offer them:
 * {id, name, note, level} or {id, name, note, prestige}.
 */
export function levelTitleRows() {
  return [
    ...LEVEL_TITLES.map((row) => ({ id: `level-${row.level}`, name: row.name, note: `Reach level ${row.level}.`, level: row.level })),
    ...PRESTIGE_TITLES.map((row) => ({ id: `prestige-${row.prestige}`, name: row.name, note: `Prestige ${row.prestige} ${row.prestige === 1 ? "time" : "times"}.`, prestige: row.prestige })),
  ];
}
