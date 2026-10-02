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
export const GRADING_RULES_VERSION = 2;

export const GRADING_BRAND = {
  name: "RIP Grading",
  short: "RIP",
  disclaimer:
    "A RIP grade is a game grade for poke-pack.rip. It's decided by chance and isn't a real-world certification.",
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
  { id: "me", label: "2025 and newer", from: 2025, gem: 1.5, blackIn: 100, odds: { 10: 5800, 9: 2900, 8: 900, 7: 250, 6: 100, 5: 30, 4: 10, 3: 5, 2: 3, 1: 2 } },
  { id: "sv", label: "2023 to 2024", from: 2023, gem: 1.6, blackIn: 120, odds: { 10: 5000, 9: 3200, 8: 1200, 7: 380, 6: 140, 5: 50, 4: 15, 3: 8, 2: 4, 1: 3 } },
  { id: "swsh", label: "2020 to 2022", from: 2020, gem: 1.9, blackIn: 150, odds: { 10: 4000, 9: 3500, 8: 1595, 7: 550, 6: 220, 5: 80, 4: 30, 3: 12, 2: 8, 1: 5 } },
  { id: "sm", label: "2017 to 2019", from: 2017, gem: 2.4, blackIn: 200, odds: { 10: 3000, 9: 3600, 8: 2000, 7: 800, 6: 350, 5: 150, 4: 60, 3: 25, 2: 10, 1: 5 } },
  { id: "bwxy", label: "2011 to 2016", from: 2011, gem: 3.2, blackIn: 300, odds: { 10: 2000, 9: 3500, 8: 2500, 7: 1100, 6: 500, 5: 250, 4: 90, 3: 40, 2: 15, 1: 5 } },
  { id: "exdp", label: "2003 to 2010", from: 2003, gem: 4.5, blackIn: 500, odds: { 10: 1200, 9: 3000, 8: 2900, 7: 1500, 6: 750, 5: 400, 4: 150, 3: 60, 2: 30, 1: 10 } },
  { id: "wotc", label: "Wizards era, 1999 to 2003", from: 0, gem: 7.0, blackIn: 1000, odds: { 10: 500, 9: 2000, 8: 2800, 7: 2200, 6: 1200, 5: 700, 4: 350, 3: 150, 2: 70, 1: 30 } },
];

/**
 * Black Label: a 10 whose four subgrades are all perfect, the way Beckett prints a black label. It is not a grade of its own
 * (the slab is a 10 to every grade table); it only changes the label and the value. A roll of 10 becomes a Black Label with
 * 1 in `band.blackIn` (rollBlackLabel), so it is always far rarer than a 10: from 1 in 100 tens (2025 and newer, 1 in 172
 * submissions) to 1 in 1,000 (Wizards era, 1 in 20,000). Research and sources: /mnt/project-files/card-grading/black-label/.
 */
export const BLACK_LABEL = {
  word: "Black Label",
  grade: "Pristine",
  /** A Black Label sells for this many times what a 10 of the same card does when the card has no real sales of its own: the median ratio of 12 cards' sold Black Label price to PSA 10 price was about 6.5. */
  premium: 6,
  /** Real Black Label sales needed before a card is valued at them rather than by the premium. */
  minSales: 5,
  subgrades: ["Centering", "Corners", "Edges", "Surface"],
};

/**
 * Median sold price of a BGS 10 Black Label, in dollars (1 coin = $1), for cards with enough real sales (eBay sold listings via
 * PriceCharting, 2026-10-02): `n` sales, `psa10` the PSA 10 median beside it. Keyed by card id. Cards missing here use BLACK_LABEL.premium.
 */
export const BLACK_LABEL_SALES = {
  "swsh7-215": { usd: 13501, n: 17, psa10: 3900 }, // Umbreon VMAX
  "swsh7-218": { usd: 3650, n: 11, psa10: 2125 }, // Rayquaza VMAX
  "swsh7-212": { usd: 2025, n: 5, psa10: 600 }, // Sylveon VMAX
  "swsh7-205": { usd: 3500, n: 5, psa10: 555 }, // Leafeon VMAX
  "swsh7-209": { usd: 1612.5, n: 10, psa10: 531 }, // Glaceon VMAX
  "swsh35-74": { usd: 2392, n: 17, psa10: 291 }, // Charizard VMAX, Champion's Path
  "swsh45-SV107": { usd: 2844.5, n: 18, psa10: 233.5 }, // Charizard VMAX, Shining Fates
  "sm115-SV49": { usd: 5725, n: 24, psa10: 1388 }, // Charizard GX, Hidden Fates
  "swsh4-188": { usd: 3000, n: 5, psa10: 305 }, // Pikachu VMAX
  "swsh12-186": { usd: 9000, n: 9, psa10: 1255 }, // Lugia V
  "swsh12pt5-GG69": { usd: 3775, n: 8, psa10: 560 }, // Giratina VSTAR
  "me2-125": { usd: 37000, n: 13, psa10: 1525 }, // Mega Charizard X ex
};

/** fee = money(flat + rate * market), like the declared-value tiers at real services. */
export const GRADING_FEE = { flat: 5, rate: 0.05 };

/** Value multipliers for grades 9 and below; a 10 uses its band's `gem`. */
export const GRADE_MULTIPLIER = { 9: 1.0, 8: 0.8, 7: 0.7, 6: 0.6, 5: 0.5, 4: 0.45, 3: 0.4, 2: 0.35, 1: 0.3 };

export const GRADING_LIMITS = { maxSlabs: 400, maxGuardQty: 10, maxShown: 8 };

/** The guard shelves, in display order. Pickers show one tier at a time. */
export const GUARD_TIERS = [
  { id: "solid", name: "Solid", blurb: "One colour, matte or gloss." },
  { id: "duo", name: "Two-tone", blurb: "Two colours or a pattern." },
  { id: "metal", name: "Metal", blurb: "Brushed and mirror finishes." },
  { id: "motion", name: "Animated", blurb: "Finishes that move. Still under reduced motion." },
];

/** Cosmetic bumpers for a slab, bought with coins; kind "guard" in user_gear.
    Styles: css/guards.css (solid, two-tone, metal) and css/guards-motion.css (animated),
    one `[data-guard="<id>"]` rule each. */
export const GUARDS = [
  // Solid
  { id: "guard-onyx", name: "Onyx", tier: "solid", price: 6, blurb: "Matte black bumper." },
  { id: "guard-snow", name: "Snow", tier: "solid", price: 6, blurb: "Clean gloss white." },
  { id: "guard-slate", name: "Slate", tier: "solid", price: 6, blurb: "Cool matte grey." },
  { id: "guard-cherry", name: "Cherry", tier: "solid", price: 8, blurb: "Glossy cherry red." },
  { id: "guard-cobalt", name: "Cobalt", tier: "solid", price: 8, blurb: "Deep cobalt blue." },
  { id: "guard-rose", name: "Rose", tier: "solid", price: 8, blurb: "Soft rose pink." },
  { id: "guard-forest", name: "Forest", tier: "solid", price: 8, blurb: "Deep pine green." },
  { id: "guard-teal", name: "Teal", tier: "solid", price: 8, blurb: "Sea-glass teal." },
  { id: "guard-plum", name: "Plum", tier: "solid", price: 8, blurb: "Dark plum purple." },
  { id: "guard-tangerine", name: "Tangerine", tier: "solid", price: 8, blurb: "Bright tangerine orange." },
  { id: "guard-lemon", name: "Lemon", tier: "solid", price: 8, blurb: "Sharp lemon yellow." },
  { id: "guard-mint", name: "Mint", tier: "solid", price: 8, blurb: "Pale mint green." },
  { id: "guard-sky", name: "Sky", tier: "solid", price: 8, blurb: "Light sky blue." },
  { id: "guard-lilac", name: "Lilac", tier: "solid", price: 8, blurb: "Soft lilac." },
  { id: "guard-cocoa", name: "Cocoa", tier: "solid", price: 8, blurb: "Dark chocolate brown." },
  { id: "guard-navy", name: "Navy", tier: "solid", price: 8, blurb: "Midnight navy." },
  { id: "guard-frost", name: "Frost", tier: "solid", price: 10, blurb: "Frosted clear." },
  // Two-tone and patterns
  { id: "guard-split", name: "Split", tier: "duo", price: 12, blurb: "Red over white, a black band between." },
  { id: "guard-sunset", name: "Sunset", tier: "duo", price: 12, blurb: "Orange fading into pink." },
  { id: "guard-ocean", name: "Ocean", tier: "duo", price: 12, blurb: "Teal fading into deep blue." },
  { id: "guard-aurora", name: "Aurora", tier: "duo", price: 12, blurb: "Green fading into violet." },
  { id: "guard-candy", name: "Candy", tier: "duo", price: 12, blurb: "Red and white stripes." },
  { id: "guard-grape", name: "Grape", tier: "duo", price: 12, blurb: "Purple fading into magenta." },
  { id: "guard-lava", name: "Lava", tier: "duo", price: 12, blurb: "Red into molten yellow." },
  { id: "guard-camo", name: "Camo", tier: "duo", price: 12, blurb: "Woodland camo." },
  { id: "guard-checker", name: "Checker", tier: "duo", price: 12, blurb: "Black and white checks." },
  { id: "guard-rainbow", name: "Rainbow", tier: "duo", price: 14, blurb: "Every colour, in order." },
  { id: "guard-carbon", name: "Carbon", tier: "duo", price: 14, blurb: "Carbon-fibre weave." },
  { id: "guard-marble", name: "Marble", tier: "duo", price: 14, blurb: "White marble, grey veins." },
  // Metal
  { id: "guard-silver", name: "Silver", tier: "metal", price: 14, blurb: "Brushed silver." },
  { id: "guard-copper", name: "Copper", tier: "metal", price: 14, blurb: "Warm brushed copper." },
  { id: "guard-gunmetal", name: "Gunmetal", tier: "metal", price: 14, blurb: "Dark brushed gunmetal." },
  { id: "guard-rosegold", name: "Rose gold", tier: "metal", price: 16, blurb: "Brushed rose gold." },
  { id: "guard-gilt", name: "Gilt", tier: "metal", price: 18, blurb: "Brushed gold." },
  { id: "guard-chrome", name: "Chrome", tier: "metal", price: 18, blurb: "Mirror chrome." },
  // Animated
  { id: "guard-pulse", name: "Pulse", tier: "motion", price: 24, blurb: "A slow coral glow that breathes." },
  { id: "guard-flow", name: "Flow", tier: "motion", price: 24, blurb: "A gradient that never stops moving." },
  { id: "guard-ember", name: "Ember", tier: "motion", price: 26, blurb: "Smouldering embers." },
  { id: "guard-neon", name: "Neon", tier: "motion", price: 26, blurb: "Cyan and magenta neon, pulsing." },
  { id: "guard-holo", name: "Holo", tier: "motion", price: 28, blurb: "A holographic sweep." },
  { id: "guard-galaxy", name: "Galaxy", tier: "motion", price: 28, blurb: "A drifting starfield." },
  { id: "guard-prism", name: "Prism", tier: "motion", price: 30, blurb: "A rainbow turning around the case." },
];

export const guardsInTier = (tierId) => GUARDS.filter((g) => g.tier === tierId);
export const tierOfGuard = (guardId) => GUARD_TIERS.find((t) => t.id === GUARDS.find((g) => g.id === guardId)?.tier) || null;

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
  // The Wizards of the Coast era runs to Skyridge (May 2003), past the EX band's first year: its sets (Aquapolis January 2003, Skyridge
  // May 2003) and the Wizards promo sets grade as vintage whatever their release date says.
  if ((set?.era || set?.edition) === "Wizards of the Coast") return GRADE_BANDS.find((band) => band.id === "wotc");
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
  const year = /-swsh$/.test(id) ? 2020 : /-sm17$/.test(id) ? 2017 : /-sm19$/.test(id) ? 2019 : /-xy$/.test(id) ? 2014 : /-bw$/.test(id) ? 2011 : /-dp$/.test(id) ? 2007 : /-mee$/.test(id) ? 2025 : 2023;
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

/** What a slab sells for now: the card's current market times the grade's multiplier, in coins (2dp). A Black Label is a 10 worth its real sold price (BLACK_LABEL_SALES) or the premium over a 10. */
export function gradedValue(card, grade, set, blackLabel = false) {
  const ten = money(sellValue(card) * gradeMultiplier(grade, bandFor(set)));
  if (!blackLabel || Number(grade) !== 10) return ten;
  const sold = BLACK_LABEL_SALES[card?.id];
  if (sold && sold.n >= BLACK_LABEL.minSales) return money(Math.max(sold.usd, ten));
  return money(ten * BLACK_LABEL.premium);
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

/** `r` in [0, band.blackIn): a 10 that rolled 0 is a Black Label. Only ask for a roll that came up 10. */
export function rollBlackLabel(band, r) {
  if (!(Number.isInteger(r) && r >= 0 && r < band.blackIn)) throw new Error("rollBlackLabel needs a roll in [0, band.blackIn).");
  return r === 0;
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
    if (!Number.isInteger(band.blackIn) || band.blackIn < 2) throw new Error(`Band ${band.id} needs blackIn, 1 in N tens (a whole number of 2 or more).`);
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
    if (!GUARD_TIERS.some((t) => t.id === guard.tier)) throw new Error(`Guard ${guard.id} has no tier.`);
  }
  for (const tier of GUARD_TIERS) if (!guards.some((g) => g.tier === tier.id)) throw new Error(`Tier ${tier.id} is empty.`);
  return true;
}

validateGradingRules();
