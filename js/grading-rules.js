/**
 * RIP Grading: the rules a graded card ("slab") follows. Shared by the page
 * and the Worker, so it holds only data and pure functions, no DOM.
 *
 * A card is sent in for a fee (gradingFee), the Worker rolls a whole-number
 * grade 1..10 with crypto (rollGrade over a band's odds), and the slab is
 * worth the card's current market times a multiplier (gradedValue): a 10
 * uses its band's `gem`, the rest GRADE_MULTIPLIER. Bands are by the set's
 * release year (bandFor): the older the print, the rarer a Gem Mint and the
 * more it pays.
 *
 * Every table is checked at load (validateGradingRules), so a typo in the
 * odds fails the import rather than skewing a roll.
 */
import { sellValue, money } from "./catalog.js";

/** Bump when the odds, fee or multipliers change, so a client can tell a stale copy. */
export const GRADING_RULES_VERSION = 1;

export const GRADING_BRAND = {
  name: "RIP Grading",
  short: "RIP",
  tagline: "Rest in plastic.",
  disclaimer:
    "A RIP grade is a game grade for poke-pack.rip. It is decided by chance and is not a real-world certification.",
};

export const GRADE_WORDS = {
  10: "Gem Mint",
  9: "Mint",
  8: "Near Mint-Mint",
  7: "Near Mint",
  6: "Excellent-Mint",
  5: "Excellent",
  4: "Very Good-Excellent",
  3: "Very Good",
  2: "Good",
  1: "Poor",
};

/** Newest first. Odds are basis points and MUST sum to 10000 per band (the contract's swsh row summed to 10005; grade 8 gives up the 5). */
export const GRADE_BANDS = [
  { id: "me", label: "2025 and newer", from: 2025, gem: 1.5, odds: { 10: 5800, 9: 2900, 8: 900, 7: 250, 6: 100, 5: 30, 4: 10, 3: 5, 2: 3, 1: 2 } },
  { id: "sv", label: "2023 to 2024", from: 2023, gem: 1.6, odds: { 10: 5000, 9: 3200, 8: 1200, 7: 380, 6: 140, 5: 50, 4: 15, 3: 8, 2: 4, 1: 3 } },
  { id: "swsh", label: "2020 to 2022", from: 2020, gem: 1.9, odds: { 10: 4000, 9: 3500, 8: 1595, 7: 550, 6: 220, 5: 80, 4: 30, 3: 12, 2: 8, 1: 5 } },
  { id: "sm", label: "2017 to 2019", from: 2017, gem: 2.4, odds: { 10: 3000, 9: 3600, 8: 2000, 7: 800, 6: 350, 5: 150, 4: 60, 3: 25, 2: 10, 1: 5 } },
  { id: "bwxy", label: "2011 to 2016", from: 2011, gem: 3.2, odds: { 10: 2000, 9: 3500, 8: 2500, 7: 1100, 6: 500, 5: 250, 4: 90, 3: 40, 2: 15, 1: 5 } },
  { id: "exdp", label: "2003 to 2010", from: 2003, gem: 4.5, odds: { 10: 1200, 9: 3000, 8: 2900, 7: 1500, 6: 750, 5: 400, 4: 150, 3: 60, 2: 30, 1: 10 } },
  { id: "wotc", label: "2002 and older", from: 0, gem: 7.0, odds: { 10: 500, 9: 2000, 8: 2800, 7: 2200, 6: 1200, 5: 700, 4: 350, 3: 150, 2: 70, 1: 30 } },
];

/** fee = money(flat + rate * market), like the declared-value tiers at real services. */
export const GRADING_FEE = { flat: 5, rate: 0.05 };

/** Value multipliers for grades 9 and below; a 10 uses its band's `gem`. */
export const GRADE_MULTIPLIER = { 9: 1.0, 8: 0.8, 7: 0.7, 6: 0.6, 5: 0.5, 4: 0.45, 3: 0.4, 2: 0.35, 1: 0.3 };

export const GRADING_LIMITS = { maxSlabs: 400, maxGuardQty: 10, maxShown: 8 };

/** Cosmetic bumpers for a slab, bought with coins; kind "guard" in user_gear. */
export const GUARDS = [
  { id: "guard-onyx", name: "Onyx", price: 6, blurb: "Matte black bumper." },
  { id: "guard-cherry", name: "Cherry", price: 8, blurb: "Glossy cherry red." },
  { id: "guard-cobalt", name: "Cobalt", price: 8, blurb: "Deep cobalt blue." },
  { id: "guard-rose", name: "Rose", price: 8, blurb: "Soft rose pink." },
  { id: "guard-frost", name: "Frost", price: 10, blurb: "Frosted clear." },
  { id: "guard-gilt", name: "Gilt", price: 18, blurb: "Brushed gold." },
];

export const GRADES = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
const FALLBACK_YEAR = 1999;

// An era's first year, for a set that carries no parseable release date.
const ERA_YEARS = [
  [/mega evolution/, 2025],
  [/scarlet (&|and) violet/, 2023],
  [/sword (&|and) shield/, 2020],
  [/sun (&|and) moon/, 2017],
  [/\bxy\b/, 2014],
  [/black (&|and) white/, 2011],
  [/heartgold/, 2010],
  [/platinum/, 2009],
  [/diamond (&|and) pearl/, 2007],
  [/\bex\b/, 2003],
  [/e-card|expedition|aquapolis|skyridge/, 2002],
  [/\bneo\b/, 2000],
  [/wizards|\bbase\b/, 1999],
];

/** The year a set came out: parsed from set.released ("July 17, 2026", "Jan 1999"), else by its era's name, else 1999. */
export function releaseYear(set) {
  const text = String(set?.released || "");
  const year = text.match(/\b(19[89]\d|20\d\d)\b/);
  if (year) return Number(year[1]);
  const era = `${set?.era || ""} ${set?.edition || ""} ${set?.name || ""}`.toLowerCase();
  for (const [needle, from] of ERA_YEARS) {
    if (needle.test(era)) return from;
  }
  return FALLBACK_YEAR;
}

/** The band a set grades in: the first (newest) band whose `from` the set's year reaches. */
export function bandFor(set) {
  const year = releaseYear(set);
  return GRADE_BANDS.find((band) => band.from <= year) || GRADE_BANDS[GRADE_BANDS.length - 1];
}

/**
 * A stand-in set for a basic Energy card, which belongs to no set: its print
 * decides the year. Everything else returns null (look the set up by prefix).
 */
export function energySet(cardId) {
  const id = String(cardId || "");
  if (!id.startsWith("energy-")) return null;
  const year = /-swsh$/.test(id) ? 2020 : /-sm17$/.test(id) ? 2017 : /-sm19$/.test(id) ? 2019 : /-xy$/.test(id) ? 2014 : /-mee$/.test(id) ? 2025 : 2023;
  return { id: "energy", name: "Basic Energy", released: String(year) };
}

/** What sending a card in costs, in coins (2dp). */
export function gradingFee(card) {
  return money(GRADING_FEE.flat + GRADING_FEE.rate * sellValue(card));
}

/** The multiplier a grade earns in a band (a 10 is the band's gem rate). */
export function gradeMultiplier(grade, band) {
  const g = Number(grade);
  if (g === 10) return band?.gem ?? GRADE_BANDS[0].gem;
  return GRADE_MULTIPLIER[g] ?? 0;
}

/** What a slab sells for now: the card's current market times the grade's multiplier, in coins (2dp). */
export function gradedValue(card, grade, set) {
  return money(sellValue(card) * gradeMultiplier(grade, bandFor(set)));
}

/** r10000 in [0, 10000) -> a whole grade, walking the band's odds from 10 down. */
export function rollGrade(band, r10000) {
  const r = Math.floor(Number(r10000));
  if (!(r >= 0 && r < 10000)) throw new Error("rollGrade needs a roll in [0, 10000).");
  let edge = 0;
  for (const grade of GRADES) {
    edge += band.odds[grade];
    if (r < edge) return grade;
  }
  return 1;
}

/** The cert number printed on a slab's label: RIP- plus the row serial, 7 digits. */
export function certNumber(id) {
  return `RIP-${String(Math.max(0, Math.floor(Number(id) || 0))).padStart(7, "0")}`;
}

export function guardById(id) {
  return GUARDS.find((guard) => guard.id === id) || null;
}

/** Throws unless every table is sound. Run at module load, so a typo fails the import, not a roll. */
export function validateGradingRules(bands = GRADE_BANDS, guards = GUARDS) {
  if (!Array.isArray(bands) || !bands.length) throw new Error("GRADE_BANDS is empty.");
  const ids = new Set();
  let lastFrom = Infinity;
  for (const band of bands) {
    if (!band?.id || ids.has(band.id)) throw new Error(`Band ${band?.id} repeats.`);
    ids.add(band.id);
    if (!(band.from < lastFrom)) throw new Error(`Band ${band.id} is out of order: newest first.`);
    lastFrom = band.from;
    if (!(band.gem > 0)) throw new Error(`Band ${band.id} needs a gem multiplier.`);
    let sum = 0;
    for (const grade of GRADES) {
      const bp = band.odds?.[grade];
      if (!Number.isInteger(bp) || bp < 0) throw new Error(`Band ${band.id} grade ${grade} needs whole basis points.`);
      sum += bp;
    }
    if (Object.keys(band.odds).length !== GRADES.length) throw new Error(`Band ${band.id} lists a grade outside 1..10.`);
    if (sum !== 10000) throw new Error(`Band ${band.id} odds sum to ${sum}, not 10000.`);
  }
  if (bands[bands.length - 1].from !== 0) throw new Error("The oldest band must start at year 0.");
  for (const grade of GRADES) {
    if (!GRADE_WORDS[grade]) throw new Error(`Grade ${grade} has no word.`);
    if (grade !== 10 && !(GRADE_MULTIPLIER[grade] > 0)) throw new Error(`Grade ${grade} has no multiplier.`);
  }
  if (!(GRADING_FEE.flat >= 0 && GRADING_FEE.rate >= 0)) throw new Error("GRADING_FEE is negative.");
  const seen = new Set();
  for (const guard of guards) {
    if (!guard?.id || seen.has(guard.id)) throw new Error(`Guard ${guard?.id} repeats.`);
    seen.add(guard.id);
    if (!(guard.price > 0)) throw new Error(`Guard ${guard.id} needs a price.`);
    if (!guard.name) throw new Error(`Guard ${guard.id} needs a name.`);
  }
  return true;
}

validateGradingRules();
