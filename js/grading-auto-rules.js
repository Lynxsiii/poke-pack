/**
 * Auto-regrade: the rules both the page and the Worker (worker/grading-auto.js)
 * follow. A run regrades one slab until it lands at `target` or better. Grades
 * are 1..10; AUTO_BLACK (11) means "a Black Label 10", which only a 10 can be,
 * so a plain 10 does not end a Black Label run. Odds and fees come from
 * js/grading-rules.js unchanged; nothing here changes a roll.
 */
import { GRADES } from "./grading-rules.js";

export const AUTO_BLACK = 11;
export const AUTO_LIMITS = { maxTries: 10000, maxSpend: 100000000, defaultTries: 50 };

/** Does a slab of `grade` (and Black Label or not) meet `target`? */
export function autoHit(grade, blackLabel, target) {
  if (target === AUTO_BLACK) return Number(grade) === 10 && Boolean(blackLabel);
  return Number(grade) >= Number(target);
}

/** The chance (0..1) that one try meets `target` in `band`. */
export function hitChance(band, target) {
  if (!band) return 0;
  const ten = (band.odds[10] || 0) / 10000;
  if (target === AUTO_BLACK) return ten / band.blackIn;
  let bp = 0;
  for (const g of GRADES) if (g >= target) bp += band.odds[g] || 0;
  return bp / 10000;
}

/** The chance of at least one hit in `tries` tries. */
export const hitWithin = (p, tries) => (p <= 0 ? 0 : p >= 1 ? 1 : 1 - Math.pow(1 - p, Math.max(0, tries)));

/** Tries needed for a `confidence` chance of a hit (e.g. 0.9 -> nine runs in ten land by then). */
export const triesFor = (p, confidence) => (p <= 0 ? Infinity : p >= 1 ? 1 : Math.ceil(Math.log(1 - confidence) / Math.log(1 - p)));
