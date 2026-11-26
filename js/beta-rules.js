/* The BETA TESTING casino games: the numbers the page and the Worker share (worker/beta.js settles everything).

   Every game is solo against the house (Rocket shares one round between everyone), stakes play coins only,
   and pays at most 95% of the stake back on average (Mystery Tins 90%). Amounts in the Worker are cents. */

export const BETA_RULES = {
  minStake: 1, // coins
  maxStake: 1000, // coins per round
  maxWin: 50000, // coins: the most one round can pay
  edge: 0.95, // what a game returns on average
  tinEdge: 0.9,
};

/** Accounts that make invite codes (handles, lower case). */
export const BETA_ADMINS = ["polar"];

export const BETA_GAMES = [
  { key: "grass", href: "/casino/grass", title: "Tall Grass", line: "Clear the patch, dodge the Voltorb." },
  { key: "drop", href: "/casino/drop", title: "Poké Ball Drop", line: "Drop a ball down the pegs." },
  { key: "rocket", href: "/casino/rocket", title: "Rocket", line: "Cash out before it pops." },
  { key: "higher", href: "/casino/higher", title: "Higher or Lower", line: "Guess the next card's price." },
  { key: "tins", href: "/casino/tins", title: "Mystery Tins", line: "Crack a themed tin of cards." },
];

/** A stake in coins (two decimals) as whole cents, or null when it is outside the limits. */
export function stakeCents(raw) {
  const n = typeof raw === "string" ? Number(raw) : raw;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  const cents = Math.round(n * 100);
  if (Math.abs(cents - n * 100) > 1e-6) return null;
  if (cents < BETA_RULES.minStake * 100 || cents > BETA_RULES.maxStake * 100) return null;
  return cents;
}

/** What a stake pays at a multiplier, in cents: floored, and never above the round cap. */
export function payoutCents(stake, mult) {
  return Math.min(BETA_RULES.maxWin * 100, Math.floor(stake * mult + 1e-9));
}

// ---- Tall Grass ---------------------------------------------------------------
export const GRASS = { tiles: 25, minMines: 1, maxMines: 20 };
const choose = (n, k) => {
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return r;
};
/** The cash-out multiplier after `safe` clear tiles with `mines` Voltorb: 95% of the fair odds, to two decimals (floored). */
export function grassMultiplier(mines, safe) {
  if (safe <= 0) return 1;
  const fair = choose(GRASS.tiles, safe) / choose(GRASS.tiles - mines, safe);
  return Math.floor(BETA_RULES.edge * fair * 100 + 1e-9) / 100;
}

// ---- Poké Ball Drop -----------------------------------------------------------
/** 12 rows of pegs, 13 slots. Each row is a fair left/right bounce, so slot k has odds C(12,k)/4096. Edges first. */
export const DROP_ROWS = 12;
const HALF = {
  low: [4, 2, 1.4, 1.2, 1, 0.9, 0.75],
  medium: [12, 5, 3, 1.6, 1.1, 0.7, 0.48],
  high: [25, 10, 5, 2, 1, 0.5, 0.3],
};
export const DROP_RISKS = ["low", "medium", "high"];
export const DROP_SLOTS = Object.fromEntries(Object.entries(HALF).map(([k, h]) => [k, [...h, ...h.slice(0, 6).reverse()]]));
export const dropOdds = (slot) => choose(DROP_ROWS, slot) / 2 ** DROP_ROWS;

// ---- Rocket -------------------------------------------------------------------
export const ROCKET = {
  betMs: 7000, // the betting window before launch
  afterMs: 3500, // the pop stays on screen
  rate: 0.11, // the multiplier is e^(rate * seconds)
  maxMult: 100,
  minAuto: 1.01,
};
/** The multiplier `ms` after launch, floored to two decimals. */
export const rocketAt = (ms) => Math.floor(Math.exp((ROCKET.rate * Math.max(0, ms)) / 1000) * 100 + 1e-9) / 100;
/** How long after launch the multiplier reaches `mult`. */
export const rocketMsFor = (mult) => (Math.log(Math.max(1, mult)) / ROCKET.rate) * 1000;
/** The pop point from a uniform draw u in [0,1): P(crash >= m) = 0.95 / m, capped at 100. */
export const rocketCrash = (u) => Math.min(ROCKET.maxMult, Math.max(1, Math.floor((BETA_RULES.edge / (1 - u)) * 100) / 100));

// ---- Higher or Lower ----------------------------------------------------------
/** The multiplier a guess pays given how many cards in the pool are worth more and less than the one showing. */
export function guessMultiplier(above, below, dir) {
  const n = above + below;
  const hits = dir === "higher" ? above : below;
  if (!n || !hits) return 0;
  return Math.floor((BETA_RULES.edge * n * 100) / hits + 1e-9) / 100;
}

// ---- Mystery Tins -------------------------------------------------------------
/** Each tin: a name, the sets it draws from, and which cards count (by name, or by rarity). */
const POP_SETS = ["sv3pt5", "sv4pt5", "sv3", "sv8", "sv8pt5", "sv10", "sv6pt5", "me1", "me2", "swsh7", "swsh9", "swsh11", "swsh12pt5", "cel25", "sm115", "sm12", "xy12"];
/** The wider pool the newer tins draw from: the popular sets plus more of Scarlet and Violet, Sword and Shield and Sun and Moon. */
const WIDE_SETS = [...POP_SETS, "sv1", "sv2", "sv4", "sv5", "sv6", "sv7", "sv9", "swsh12", "swsh10", "swsh8", "swsh5", "swsh6", "swsh45", "sm11", "sm10", "sm9", "sm8", "sm3", "xy1", "xy8"];
/** Each tin: a name, a line, its colour (the tin's paint, art only), the sets it draws from, and which cards count (by name, or by rarity). */
export const TINS = [
  { id: "eevee", name: "Eeveelution tin", line: "Eevee and all eight evolutions.", color: "#c98a4b", sets: ["sv8pt5"], names: /\b(eevee|vaporeon|jolteon|flareon|espeon|umbreon|leafeon|glaceon|sylveon)\b/i },
  { id: "charizard", name: "Charizard tin", line: "The whole Charmander line.", color: "#e8622c", sets: ["sv3", "sv3pt5", "sv4pt5", "sv10", "swsh12pt5", "cel25", "sm115", "xy12"], names: /\b(charmander|charmeleon|charizard)\b/i },
  { id: "pikachu", name: "Pikachu tin", line: "Pikachu from six sets.", color: "#f2c418", sets: ["sv8", "me55", "sv3pt5", "cel25", "swsh12pt5", "sv4pt5"], names: /\bpikachu\b/i },
  { id: "kanto", name: "151 hits tin", line: "Only the rare pulls from 151.", color: "#d23b3b", sets: ["sv3pt5"], hitsOnly: true },
  { id: "gengar", name: "Gengar tin", line: "Gastly, Haunter and Gengar.", color: "#6b4fb3", sets: POP_SETS, names: /\b(gastly|haunter|gengar)\b/i },
  { id: "mew", name: "Mew and Mewtwo tin", line: "The two psychic legends.", color: "#e58fbf", sets: POP_SETS, names: /\b(mew|mewtwo)\b/i },
  { id: "dragons", name: "Dragon tin", line: "Rayquaza, Dragonite, Giratina and more.", color: "#2f8a5e", sets: POP_SETS, names: /\b(rayquaza|dragonite|garchomp|salamence|dragapult|giratina|latias|latios)\b/i },
  { id: "birds", name: "Legendary birds tin", line: "Articuno, Zapdos and Moltres.", color: "#3f7fd0", sets: POP_SETS, names: /\b(articuno|zapdos|moltres)\b/i },
  { id: "starters", name: "Kanto starters tin", line: "Bulbasaur and Squirtle lines.", color: "#3aa6a0", sets: POP_SETS, names: /\b(bulbasaur|ivysaur|venusaur|squirtle|wartortle|blastoise)\b/i },
  { id: "night", name: "Umbreon and Darkrai tin", line: "Dark types after midnight.", color: "#2b3046", sets: POP_SETS, names: /\b(umbreon|darkrai|zoroark|tyranitar)\b/i },
  { id: "skies", name: "Evolving Skies hits tin", line: "Only the rare pulls from Evolving Skies.", color: "#4a9fd8", sets: ["swsh7"], hitsOnly: true },
  { id: "base", name: "Base Set hits tin", line: "The 1999 holos and rares.", color: "#e3b53c", sets: ["base1"], hitsOnly: true },
  { id: "towers", name: "Lugia and Ho-Oh tin", line: "The two tower guardians.", color: "#b9c4d6", sets: WIDE_SETS, names: /\b(lugia|ho-oh)\b/i },
  { id: "gyarados", name: "Gyarados tin", line: "Magikarp and Gyarados.", color: "#2d6fc4", sets: WIDE_SETS, names: /\b(magikarp|gyarados)\b/i },
  { id: "greninja", name: "Greninja tin", line: "Froakie, Frogadier and Greninja.", color: "#31508f", sets: WIDE_SETS, names: /\b(froakie|frogadier|greninja)\b/i },
  { id: "gardevoir", name: "Gardevoir tin", line: "Ralts, Kirlia, Gardevoir and Gallade.", color: "#59b98c", sets: WIDE_SETS, names: /\b(ralts|kirlia|gardevoir|gallade)\b/i },
  { id: "lucario", name: "Lucario tin", line: "Riolu and Lucario.", color: "#3c6fb0", sets: WIDE_SETS, names: /\b(riolu|lucario)\b/i },
  { id: "snorlax", name: "Sleepy favourites tin", line: "Snorlax, Psyduck, Slowpoke and Mimikyu.", color: "#3d7c86", sets: WIDE_SETS, names: /\b(snorlax|munchlax|psyduck|slowpoke|mimikyu)\b/i },
];
/** A card's weight in a tin: cheaper cards come up more often, but a big hit is never out of reach. */
export const tinWeight = (cents) => 1 / Math.pow(Math.max(1, cents), 0.7);
