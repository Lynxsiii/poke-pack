/* The BETA TESTING casino games: the numbers the page and the Worker share (worker/beta.js settles everything).

   Every game is solo against the house (Rocket shares one round between everyone), stakes play coins only,
   and pays at most 95% of the stake back on average (Mystery Tins 90%). Amounts in the Worker are cents. */

export const BETA_RULES = {
  minStake: 1, // coins
  maxStake: 1000, // coins per round
  maxWin: 50000, // coins: the most one round can pay
  edge: 0.95, // what a game returns on average
  tinEdge: 0.9, // a tin's usual payback; a tin can set its own (TINS back), never above tinMaxEdge
  tinMaxEdge: 0.95,
};

/** Accounts that make invite codes (handles, lower case). */
export const BETA_ADMINS = ["polar"];

export const BETA_GAMES = [
  { key: "grass", href: "/casino/grass", title: "Tall Grass", line: "Clear the patch, dodge the Voltorb." },
  { key: "rocket", href: "/casino/rocket", title: "Rocket", line: "Cash out before it pops." },
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

// ---- Mystery Tins -------------------------------------------------------------
/* A tin is never about a set (anyone can just open that set). It is a Pokémon, an evolution line, a type or a kind
   of card, drawn from the pool of sets below.
   Each tin: id, name, line, color (the tin's paint, art only), and which cards count:
     names   a pattern the card's name must match
     types   Pokémon of any of these types
     kind    "supporter" (Supporter cards), "tagteam" (TAG TEAM Pokémon)
     hits    true leaves out commons and uncommons
     min     only cards worth at least this many coins
     gap     [low, high] leaves out every card worth between the two: bulk or a big hit, nothing in the middle
     pow     how hard the odds lean to the cheap cards (0.7 unless set; lower means the big cards come up more and
             the tin costs more)
     risk    "high" puts the tin on the high roller shelf
     back    the share of the price that comes back on average (BETA_RULES.tinEdge unless set, never over
             BETA_RULES.tinMaxEdge). Noah, 2026-11-26: it need not be 90% on every tin, the price just has to be fair.
   The price comes from the odds and is rounded up to a tidy figure (tinPrice), so a tin never pays back more than
   it says, and every tin's page shows its real figure. */
const POOL = ["sv3pt5", "sv4pt5", "sv3", "sv8", "sv8pt5", "sv10", "sv6pt5", "me1", "me2", "swsh7", "swsh9", "swsh11", "swsh12pt5", "cel25", "sm115", "sm12", "xy12",
  "sv1", "sv2", "sv4", "sv5", "sv6", "sv7", "sv9", "swsh12", "swsh10", "swsh8", "swsh5", "swsh6", "swsh45", "sm11", "sm10", "sm9", "sm8", "sm3", "xy1", "xy8"];
const EEVEES = /\b(eevee|vaporeon|jolteon|flareon|espeon|umbreon|leafeon|glaceon|sylveon)\b/i;
const CHARIZARD = /\b(charmander|charmeleon|charizard)\b/i;
const tin = (id, name, line, color, rule) => ({ id, name, line, color, sets: POOL, ...rule });
export const TINS = [
  // One Pokémon or one line.
  tin("eevee", "Eeveelution tin", "Eevee and all eight evolutions.", "#c98a4b", { names: EEVEES }),
  tin("charizard", "Charizard tin", "The whole Charmander line.", "#e8622c", { names: CHARIZARD }),
  tin("pikachu", "Pikachu tin", "Pichu, Pikachu and Raichu.", "#f2c418", { names: /\b(pichu|pikachu|raichu)\b/i }),
  tin("gengar", "Gengar tin", "Gastly, Haunter and Gengar.", "#6b4fb3", { names: /\b(gastly|haunter|gengar)\b/i }),
  tin("mew", "Mew and Mewtwo tin", "The two psychic legends.", "#e58fbf", { names: /\b(mew|mewtwo)\b/i }),
  tin("gyarados", "Gyarados tin", "Magikarp and Gyarados.", "#2d6fc4", { names: /\b(magikarp|gyarados)\b/i }),
  tin("greninja", "Greninja tin", "Froakie, Frogadier and Greninja.", "#31508f", { names: /\b(froakie|frogadier|greninja)\b/i }),
  tin("gardevoir", "Gardevoir tin", "Ralts, Kirlia, Gardevoir and Gallade.", "#59b98c", { names: /\b(ralts|kirlia|gardevoir|gallade)\b/i }),
  tin("lucario", "Lucario tin", "Riolu and Lucario.", "#3c6fb0", { names: /\b(riolu|lucario)\b/i }),
  tin("rayquaza", "Rayquaza tin", "The sky dragon, every print.", "#2f8a5e", { names: /\brayquaza\b/i }),
  // A group of Pokémon.
  tin("dragons", "Dragon tin", "Dragonite, Giratina, Garchomp and more.", "#7a63c9", { names: /\b(dragonite|garchomp|salamence|dragapult|giratina|latias|latios|hydreigon|haxorus)\b/i }),
  tin("birds", "Legendary birds tin", "Articuno, Zapdos and Moltres.", "#3f7fd0", { names: /\b(articuno|zapdos|moltres)\b/i }),
  tin("beasts", "Legendary beasts tin", "Raikou, Entei and Suicune.", "#b5683a", { names: /\b(raikou|entei|suicune)\b/i }),
  tin("towers", "Lugia and Ho-Oh tin", "The two tower guardians.", "#b9c4d6", { names: /\b(lugia|ho-oh)\b/i }),
  tin("creation", "Sinnoh legends tin", "Dialga, Palkia, Giratina and Arceus.", "#566a9c", { names: /\b(dialga|palkia|giratina|arceus)\b/i }),
  tin("starters", "Kanto starters tin", "Bulbasaur and Squirtle lines.", "#3aa6a0", { names: /\b(bulbasaur|ivysaur|venusaur|squirtle|wartortle|blastoise)\b/i }),
  tin("night", "Umbreon and Darkrai tin", "Dark types after midnight.", "#2b3046", { names: /\b(umbreon|darkrai|zoroark|tyranitar)\b/i }),
  tin("snorlax", "Sleepy favourites tin", "Snorlax, Psyduck, Slowpoke and Mimikyu.", "#3d7c86", { names: /\b(snorlax|munchlax|psyduck|slowpoke|mimikyu)\b/i }),
  tin("mega", "Mega Evolution tin", "Only Mega Pokémon.", "#c44a8a", { names: /^(mega |m )/i }),
  // A type: the rare pulls of that type.
  tin("fire", "Fire type tin", "The rare Fire Pokémon.", "#e2532f", { types: ["Fire"], hits: true, min: 2 }),
  tin("water", "Water type tin", "The rare Water Pokémon.", "#3a8fd6", { types: ["Water"], hits: true, min: 2 }),
  tin("grass", "Grass type tin", "The rare Grass Pokémon.", "#58a83c", { types: ["Grass"], hits: true, min: 2 }),
  tin("lightning", "Lightning type tin", "The rare Lightning Pokémon.", "#edc22a", { types: ["Lightning"], hits: true, min: 2 }),
  tin("psychic", "Psychic type tin", "The rare Psychic Pokémon.", "#9a5fc0", { types: ["Psychic"], hits: true, min: 2 }),
  tin("fighting", "Fighting type tin", "The rare Fighting Pokémon.", "#c0703a", { types: ["Fighting"], hits: true, min: 2 }),
  tin("dark", "Darkness type tin", "The rare Darkness Pokémon.", "#3b4257", { types: ["Darkness"], hits: true, min: 2 }),
  tin("steel", "Metal type tin", "The rare Metal Pokémon.", "#8794a3", { types: ["Metal"], hits: true, min: 2 }),
  // A kind of card.
  tin("supporters", "Supporter tin", "Trainers of every region.", "#d9577a", { kind: "supporter", min: 1 }),
  // High rollers: they cost more and swing harder. Same 90% back on average.
  tin("tagteam", "Tag Team tin", "Two Pokémon on one card, and some of the biggest cards on the site.", "#e09a2b", { kind: "tagteam", risk: "high" }),
  tin("zard-roller", "Charizard high roller tin", "Only Charizards worth 25 coins or more.", "#a8321a", { names: /\bcharizard\b/i, min: 25, risk: "high", back: 0.92 }),
  tin("eevee-roller", "Eeveelution high roller tin", "Only Eeveelutions worth 25 coins or more.", "#8a5a2c", { names: EEVEES, min: 25, risk: "high", back: 0.92 }),
  tin("legend-roller", "Legends high roller tin", "Mew, Mewtwo, Lugia, Rayquaza and Giratina worth 25 coins or more.", "#4b3f8f", { names: /\b(mew|mewtwo|lugia|ho-oh|rayquaza|giratina)\b/i, min: 25, risk: "high", back: 0.92 }),
  tin("umbreon-bust", "Umbreon or bust tin", "Bulk, or an Umbreon worth 100 coins or more.", "#1f2333", { names: /\b(umbreon|eevee)\b/i, gap: [1, 100], pow: 0.45, risk: "high", back: 0.85 }),
  tin("zard-bust", "Charizard or bust tin", "Bulk, or a Charizard worth 100 coins or more.", "#7d1f12", { names: CHARIZARD, gap: [1, 100], pow: 0.45, risk: "high", back: 0.85 }),
  tin("grails", "Grail tin", "Every card inside is worth 150 coins or more.", "#b08a1e", { min: 150, risk: "high", back: 0.93 }),
  tin("pika-bust", "Pikachu or bust tin", "Bulk, or a Pikachu worth 75 coins or more.", "#c99a0c", { names: /\b(pichu|pikachu|raichu)\b/i, gap: [1, 75], pow: 0.45, risk: "high", back: 0.85 }),
];
/** A card's weight in a tin: cheaper cards come up more often, but a big hit is never out of reach. */
/** A card that is only one piece of a bigger one: a V-UNION quarter, a LEGEND half. Noah, 2026-11-26: never in a tin. */
export const isPieceCard = (card) => /\bV-UNION\b|\bLEGEND$/.test(card?.name || "") || (card?.subtypes || []).some((x) => /^(v-union|legend)$/i.test(x));
/** How many tins one tap may open. */
export const TIN_MAX_OPEN = 5;
/** A tin's price in cents for an average return: rounded up to a tidy figure, so the real payback is never above `back`. */
export function tinPrice(evCents, back = BETA_RULES.tinEdge) {
  const raw = evCents / Math.min(BETA_RULES.tinMaxEdge, back);
  const step = raw < 500 ? 10 : raw < 1000 ? 25 : raw < 5000 ? 100 : raw < 25000 ? 500 : 2500;
  return Math.max(100, Math.ceil(raw / step - 1e-9) * step);
}
export const tinWeight = (cents, pow = 0.7) => 1 / Math.pow(Math.max(1, cents), pow);
