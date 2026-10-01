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
];

/** Level titles as title rows ({id, name, note, level}) so js/titles.js can offer them. */
export function levelTitleRows() {
  return LEVEL_TITLES.map((row) => ({ id: `level-${row.level}`, name: row.name, note: `Reach level ${row.level}.`, level: row.level }));
}
