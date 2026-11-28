/* The BETA TESTING casino games: the numbers the page and the Worker share (worker/beta.js settles everything).

   Every game is solo against the house, stakes play coins only,
   and pays at most 95% of the stake back on average (Mystery Tins 65% to 94% by shelf). Amounts in the Worker are cents. */

export const BETA_RULES = {
  minStake: 1, // coins
  maxStake: 1000, // coins per round
  maxWin: 50000, // coins: the most one round can pay
  edge: 0.95, // what a game returns on average
  tinEdge: 0.9, // tinPrice's payback when none is given; a tin's own comes from its shelf (TIN_TIERS), never above tinMaxEdge
  tinMaxEdge: 0.95,
};

/** Accounts that make invite codes (handles, lower case). */
export const BETA_ADMINS = ["polar"];

export const BETA_GAMES = [
  { key: "grass", href: "/casino/grass", title: "Tall Grass", line: "Clear the patch, dodge the Voltorb." },
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

// ---- Mystery Tins -------------------------------------------------------------
/* A tin is never about a set (anyone can just open that set). It is a Pokémon, an evolution line, a type or a kind
   of card, drawn from the pool of sets below.

   Tins sit on five shelves (TIN_TIERS), cheapest first. A shelf sets what its tins cost and how much of the price
   comes back on average: the bargain bin is a coin a go and nearly always bulk, the high rollers cost hundreds and
   every card inside is a hit. Noah, 2026-11-28: "low priced ones with terrible odds, eh odds, mid tier, high tier,
   then high roller".

   Each tin: id, name, line, color (the tin's paint, art only), tier, price (coins), and which cards count:
     names   a pattern the card's name must match
     types   Pokémon of any of these types
     kind    "supporter" (Supporter cards), "tagteam" (TAG TEAM Pokémon)
     hits    true leaves out commons and uncommons
     min     only cards worth at least this many coins
     gap     [low, high] leaves out every card worth between the two: bulk or a big hit, nothing in the middle
     slab    [grades]: the tin holds graded slabs, not raw cards. Every card comes in each of these grades, each
             worth what that slab sells for (js/grading-rules.js), and the one you land on is minted into your case.
     back    the share of the price that comes back on average, when it differs from the shelf's (never over
             BETA_RULES.tinMaxEdge)

   The price is fixed. The odds are what move: cheap cards come up more often than dear ones (tinWeight), and the
   lean is solved each time prices update (tinLean) so that the tin returns its share and no more. If the cheapest
   cards alone would return more than that, the price goes up instead (tinPrice). Every tin's page shows its real
   figure and every card's real odds. */
const POOL = ["sv3pt5", "sv4pt5", "sv3", "sv8", "sv8pt5", "sv10", "sv6pt5", "me1", "me2", "swsh7", "swsh9", "swsh11", "swsh12pt5", "cel25", "sm115", "sm12", "xy12",
  "sv1", "sv2", "sv4", "sv5", "sv6", "sv7", "sv9", "swsh12", "swsh10", "swsh8", "swsh5", "swsh6", "swsh45", "sm11", "sm10", "sm9", "sm8", "sm3", "xy1", "xy8"];
/** The shelves, cheapest first. `back` is the share of a tin's price that comes back on average. */
export const TIN_TIERS = [
  { id: "bargain", name: "Bargain bin", odds: "Terrible odds", back: 0.65, line: "Bulk nearly every time, with a tiny shot at the big one." },
  { id: "budget", name: "Budget", odds: "Eh odds", back: 0.75, line: "One Pokémon's whole line, bulk and all. Hits are in there, just not often." },
  { id: "mid", name: "Mid", odds: "Fair odds", back: 0.85, line: "No bulk under 2 coins. A decent pull turns up every few tins." },
  { id: "high", name: "High", odds: "Good odds", back: 0.9, line: "Hits only. Every card is worth 10 coins or more." },
  { id: "roller", name: "High roller", odds: "Best odds", back: 0.94, line: "Nothing inside is worth under 100 coins." },
];
export const tinTier = (id) => TIN_TIERS.find((t) => t.id === id) || TIN_TIERS[1];
const EEVEES = /\b(eevee|vaporeon|jolteon|flareon|espeon|umbreon|leafeon|glaceon|sylveon)\b/i;
const CHARIZARD = /\b(charmander|charmeleon|charizard)\b/i;
const PIKACHU = /\b(pichu|pikachu|raichu)\b/i;
const GENGAR = /\b(gastly|haunter|gengar)\b/i;
const MEWS = /\b(mew|mewtwo)\b/i;
const DRAGONS = /\b(dragonite|garchomp|salamence|dragapult|giratina|latias|latios|hydreigon|haxorus|rayquaza)\b/i;
const LEGENDS = /\b(mew|mewtwo|lugia|ho-oh|rayquaza|giratina)\b/i;
const tin = (tier, price, id, name, line, color, rule) => ({ id, name, line, color, tier, price, sets: POOL, ...rule });
const typeTin = (id, type, color) => tin("high", 50, id, `${type} type tin`, `${type} Pokémon worth 25 coins or more.`, color, { types: [type], hits: true, min: 25 });
export const TINS = [
  // Bargain bin: bulk, or one of the big ones. Nothing in between.
  tin("bargain", 1, "zard-bust", "Charizard or bust tin", "Bulk, or a Charizard worth 100 coins or more.", "#7d1f12", { names: CHARIZARD, gap: [1, 100] }),
  tin("bargain", 1, "umbreon-bust", "Umbreon or bust tin", "Bulk, or an Umbreon worth 100 coins or more.", "#1f2333", { names: /\b(umbreon|eevee)\b/i, gap: [1, 100] }),
  tin("bargain", 1, "pika-bust", "Pikachu or bust tin", "Bulk, or a Pikachu worth 75 coins or more.", "#c99a0c", { names: PIKACHU, gap: [1, 75] }),
  tin("bargain", 1, "gengar-bust", "Gengar or bust tin", "Bulk, or a Gengar worth 100 coins or more.", "#4a3587", { names: GENGAR, gap: [1, 100] }),
  tin("bargain", 1, "mew-bust", "Mew or bust tin", "Bulk, or a Mew or Mewtwo worth 100 coins or more.", "#c66a9f", { names: MEWS, gap: [1, 100] }),
  tin("bargain", 2, "dragon-bust", "Dragon or bust tin", "Bulk, or a dragon worth 100 coins or more.", "#4f3d9a", { names: DRAGONS, gap: [1, 100] }),
  tin("bargain", 2, "eevee-bust", "Eeveelution or bust tin", "Bulk, or an Eeveelution worth 100 coins or more.", "#8a5a2c", { names: EEVEES, gap: [1, 100] }),
  // Budget: one Pokémon or one line, every print of it.
  tin("budget", 5, "eevee", "Eeveelution tin", "Eevee and all eight evolutions.", "#c98a4b", { names: EEVEES }),
  tin("budget", 5, "charizard", "Charizard tin", "The whole Charmander line.", "#e8622c", { names: CHARIZARD }),
  tin("budget", 5, "pikachu", "Pikachu tin", "Pichu, Pikachu and Raichu.", "#f2c418", { names: PIKACHU }),
  tin("budget", 5, "gengar", "Gengar tin", "Gastly, Haunter and Gengar.", "#6b4fb3", { names: GENGAR }),
  tin("budget", 5, "mew", "Mew and Mewtwo tin", "The two psychic legends.", "#e58fbf", { names: MEWS }),
  tin("budget", 5, "gyarados", "Gyarados tin", "Magikarp and Gyarados.", "#2d6fc4", { names: /\b(magikarp|gyarados)\b/i }),
  tin("budget", 5, "greninja", "Greninja tin", "Froakie, Frogadier and Greninja.", "#31508f", { names: /\b(froakie|frogadier|greninja)\b/i }),
  tin("budget", 5, "gardevoir", "Gardevoir tin", "Ralts, Kirlia, Gardevoir and Gallade.", "#59b98c", { names: /\b(ralts|kirlia|gardevoir|gallade)\b/i }),
  tin("budget", 5, "lucario", "Lucario tin", "Riolu and Lucario.", "#3c6fb0", { names: /\b(riolu|lucario)\b/i }),
  tin("budget", 5, "starters", "Kanto starters tin", "Bulbasaur and Squirtle lines.", "#3aa6a0", { names: /\b(bulbasaur|ivysaur|venusaur|squirtle|wartortle|blastoise)\b/i }),
  tin("budget", 5, "snorlax", "Sleepy favourites tin", "Snorlax, Psyduck, Slowpoke and Mimikyu.", "#3d7c86", { names: /\b(snorlax|munchlax|psyduck|slowpoke|mimikyu)\b/i }),
  // Mid: a group of Pokémon, nothing under 2 coins.
  tin("mid", 25, "rayquaza", "Rayquaza tin", "The sky dragon, every print.", "#2f8a5e", { names: /\brayquaza\b/i, min: 2 }),
  tin("mid", 25, "dragons", "Dragon tin", "Dragonite, Giratina, Garchomp and more.", "#7a63c9", { names: DRAGONS, min: 2 }),
  tin("mid", 25, "birds", "Legendary birds tin", "Articuno, Zapdos and Moltres.", "#3f7fd0", { names: /\b(articuno|zapdos|moltres)\b/i, min: 2 }),
  tin("mid", 25, "beasts", "Legendary beasts tin", "Raikou, Entei and Suicune.", "#b5683a", { names: /\b(raikou|entei|suicune)\b/i, min: 2 }),
  tin("mid", 25, "towers", "Lugia and Ho-Oh tin", "The two tower guardians.", "#b9c4d6", { names: /\b(lugia|ho-oh)\b/i, min: 2 }),
  tin("mid", 25, "creation", "Sinnoh legends tin", "Dialga, Palkia, Giratina and Arceus.", "#566a9c", { names: /\b(dialga|palkia|giratina|arceus)\b/i, min: 2 }),
  tin("mid", 25, "night", "Umbreon and Darkrai tin", "Dark types after midnight.", "#2b3046", { names: /\b(umbreon|darkrai|zoroark|tyranitar)\b/i, min: 2 }),
  tin("mid", 25, "mega", "Mega Evolution tin", "Only Mega Pokémon.", "#c44a8a", { names: /^(mega |m )/i, min: 2 }),
  tin("mid", 25, "supporters", "Supporter tin", "Trainers of every region, 5 coins and up.", "#d9577a", { kind: "supporter", min: 5 }),
  tin("mid", 30, "slab-pikachu", "Graded Pikachu tin", "A Pikachu in a slab: RIP 8, 9 or 10.", "#d8a90e", { names: PIKACHU, min: 3, slab: [8, 9, 10] }),
  // High: hits only.
  typeTin("fire", "Fire", "#e2532f"),
  typeTin("water", "Water", "#3a8fd6"),
  typeTin("grass", "Grass", "#58a83c"),
  typeTin("lightning", "Lightning", "#edc22a"),
  typeTin("psychic", "Psychic", "#9a5fc0"),
  typeTin("fighting", "Fighting", "#c0703a"),
  typeTin("dark", "Darkness", "#3b4257"),
  typeTin("steel", "Metal", "#8794a3"),
  tin("high", 100, "tagteam", "Tag Team tin", "Two Pokémon on one card, 25 coins and up.", "#e09a2b", { kind: "tagteam", min: 25 }),
  tin("high", 100, "zard-hits", "Charizard hits tin", "Only Charizards worth 25 coins or more.", "#a8321a", { names: /\bcharizard\b/i, min: 25 }),
  tin("high", 100, "eevee-hits", "Eeveelution hits tin", "Only Eeveelutions worth 25 coins or more.", "#8a5a2c", { names: EEVEES, min: 25 }),
  tin("high", 100, "legend-hits", "Legends hits tin", "Mew, Mewtwo, Lugia, Rayquaza and Giratina, 25 coins and up.", "#4b3f8f", { names: LEGENDS, min: 25 }),
  tin("high", 150, "slab-zard", "Graded Charizard tin", "A Charizard in a slab: RIP 9 or 10.", "#b3401c", { names: /\bcharizard\b/i, min: 10, slab: [9, 10] }),
  tin("high", 150, "slab-eevee", "Graded Eeveelution tin", "An Eeveelution in a slab: RIP 9 or 10.", "#9c6a35", { names: EEVEES, min: 10, slab: [9, 10] }),
  // High rollers: nothing inside under 100 coins.
  tin("roller", 300, "zard-roller", "Charizard high roller tin", "Only Charizards worth 100 coins or more.", "#8f2413", { names: /\bcharizard\b/i, min: 100 }),
  tin("roller", 300, "legend-roller", "Legends high roller tin", "Mew, Mewtwo, Lugia, Rayquaza and Giratina worth 100 coins or more.", "#3d3378", { names: LEGENDS, min: 100 }),
  tin("roller", 350, "eevee-roller", "Eeveelution high roller tin", "Only Eeveelutions worth 100 coins or more.", "#74481f", { names: EEVEES, min: 100 }),
  tin("roller", 350, "tagteam-roller", "Tag Team high roller tin", "Only Tag Teams worth 100 coins or more.", "#b87a17", { kind: "tagteam", min: 100 }),
  tin("roller", 400, "grails", "Grail tin", "Every card inside is worth 150 coins or more.", "#b08a1e", { min: 150 }),
  tin("roller", 650, "slab-gems", "Gem mint tin", "Every slab is a RIP 10 of a card worth 100 coins or more.", "#1d1d22", { min: 100, slab: [10] }),
];
/** A card that is only one piece of a bigger one: a V-UNION quarter, a LEGEND half. Noah, 2026-11-26: never in a tin. */
export const isPieceCard = (card) => /\bV-UNION\b|\bLEGEND$/.test(card?.name || "") || (card?.subtypes || []).some((x) => /^(v-union|legend)$/i.test(x));
/** How many tins one tap may open. */
export const TIN_MAX_OPEN = 5;
/** A card's weight in a tin: cheaper cards come up more often, but a big hit is never out of reach. `pow` is the lean. */
export const tinWeight = (cents, pow = 0.7) => 1 / Math.pow(Math.max(1, cents), pow);
/** What a list of card values (cents) returns on average at a lean. */
export function tinReturn(values, pow) {
  let total = 0;
  let sum = 0;
  for (const v of values) { const w = tinWeight(v, pow); total += w; sum += w * v; }
  return total ? sum / total : 0;
}
/** The hardest the odds may lean to the cheap cards. */
export const TIN_MAX_LEAN = 4;
/** The lean at which these card values return `target` cents on average, or just under: 0 when even odds already
    return no more than that, null when the cheapest cards alone return more (the tin is then priced up). */
export function tinLean(values, target) {
  if (tinReturn(values, 0) <= target) return 0;
  if (tinReturn(values, TIN_MAX_LEAN) > target) return null;
  let lo = 0;
  let hi = TIN_MAX_LEAN;
  for (let i = 0; i < 48; i++) { const mid = (lo + hi) / 2; if (tinReturn(values, mid) > target) lo = mid; else hi = mid; }
  return hi;
}
/** A tin's price in cents for an average return: rounded up to a tidy figure, so the real payback is never above `back`. */
export function tinPrice(evCents, back = BETA_RULES.tinEdge) {
  const raw = evCents / Math.min(BETA_RULES.tinMaxEdge, back);
  const step = raw < 500 ? 10 : raw < 1000 ? 25 : raw < 5000 ? 100 : raw < 25000 ? 500 : 2500;
  return Math.max(100, Math.ceil(raw / step - 1e-9) * step);
}
