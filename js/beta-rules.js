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
const STARTERS = /\b(bulbasaur|ivysaur|venusaur|squirtle|wartortle|blastoise)\b/i;
const MEGAS = /^(mega |m )/i;
const SLEEPY = /\b(snorlax|munchlax|psyduck|slowpoke|mimikyu)\b/i;
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
  tin("budget", 5, "starters", "Kanto starters tin", "Bulbasaur and Squirtle lines.", "#3aa6a0", { names: STARTERS }),
  tin("budget", 5, "snorlax", "Sleepy favourites tin", "Snorlax, Psyduck, Slowpoke and Mimikyu.", "#3d7c86", { names: SLEEPY }),
  // Mid: a group of Pokémon, nothing under 2 coins.
  tin("mid", 25, "rayquaza", "Rayquaza tin", "The sky dragon, every print.", "#2f8a5e", { names: /\brayquaza\b/i, min: 2 }),
  tin("mid", 25, "dragons", "Dragon tin", "Dragonite, Giratina, Garchomp and more.", "#7a63c9", { names: DRAGONS, min: 2 }),
  tin("mid", 25, "birds", "Legendary birds tin", "Articuno, Zapdos and Moltres.", "#3f7fd0", { names: /\b(articuno|zapdos|moltres)\b/i, min: 2 }),
  tin("mid", 25, "beasts", "Legendary beasts tin", "Raikou, Entei and Suicune.", "#b5683a", { names: /\b(raikou|entei|suicune)\b/i, min: 2 }),
  tin("mid", 25, "towers", "Lugia and Ho-Oh tin", "The two tower guardians.", "#b9c4d6", { names: /\b(lugia|ho-oh)\b/i, min: 2 }),
  tin("mid", 25, "creation", "Sinnoh legends tin", "Dialga, Palkia, Giratina and Arceus.", "#566a9c", { names: /\b(dialga|palkia|giratina|arceus)\b/i, min: 2 }),
  tin("mid", 25, "night", "Umbreon and Darkrai tin", "Dark types after midnight.", "#2b3046", { names: /\b(umbreon|darkrai|zoroark|tyranitar)\b/i, min: 2 }),
  tin("mid", 25, "mega", "Mega Evolution tin", "Only Mega Pokémon.", "#c44a8a", { names: MEGAS, min: 2 }),
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
  // ---- 2026-11-28, second batch (Noah: "add like 50 more mystery tins, maybe more expensive ones maybe cheaper up to you").
  // Bargain bin.
  tin("bargain", 1, "ray-bust", "Rayquaza or bust tin", "Bulk, or a dragon worth 100 coins or more.", "#1f6e49", { names: /\b(rayquaza|dragonite|dratini|dragonair)\b/i, gap: [1, 100] }),
  tin("bargain", 1, "lugia-bust", "Lugia or bust tin", "Bulk, or a Lugia or Ho-Oh worth 50 coins or more.", "#8f9db5", { names: /\b(lugia|ho-oh|articuno|zapdos|moltres)\b/i, gap: [1, 50] }),
  tin("bargain", 1, "giratina-bust", "Giratina or bust tin", "Bulk, or a Sinnoh legend worth 100 coins or more.", "#44506f", { names: /\b(dialga|palkia|giratina|arceus)\b/i, gap: [1, 100] }),
  tin("bargain", 1, "gyarados-bust", "Gyarados or bust tin", "Magikarp bulk, or a Gyarados worth 50 coins or more.", "#24579a", { names: /\b(magikarp|gyarados)\b/i, gap: [1, 50] }),
  tin("bargain", 1, "gardevoir-bust", "Gardevoir or bust tin", "Bulk, or a Gardevoir worth 50 coins or more.", "#3f9770", { names: /\b(ralts|kirlia|gardevoir|gallade)\b/i, gap: [1, 50] }),
  tin("bargain", 1, "greninja-bust", "Greninja or bust tin", "Bulk, or a Greninja worth 50 coins or more.", "#263f73", { names: /\b(froakie|frogadier|greninja)\b/i, gap: [1, 50] }),
  tin("bargain", 1, "blastoise-bust", "Starter or bust tin", "Bulk, or a Kanto starter worth 75 coins or more.", "#2e8782", { names: STARTERS, gap: [1, 75] }),
  tin("bargain", 1, "mega-bust", "Mega or bust tin", "Bulk, or a Mega worth 100 coins or more.", "#9c3a6e", { names: MEGAS, gap: [0.5, 100] }),
  tin("bargain", 2, "supporter-bust", "Supporter or bust tin", "Bulk Trainers, or a Supporter worth 50 coins or more.", "#b0435f", { kind: "supporter", gap: [0.5, 50] }),
  tin("bargain", 2, "tagteam-bust", "Tag Team or bust tin", "A cheap Tag Team, or one worth 100 coins or more.", "#b87a17", { kind: "tagteam", gap: [8, 100] }),
  tin("bargain", 2, "sleepy-bust", "Snorlax or bust tin", "Bulk, or a sleepy favourite worth 100 coins or more.", "#2f626a", { names: SLEEPY, gap: [1, 100] }),
  // Budget: more lines.
  tin("budget", 5, "dragonite", "Dragonite tin", "Dratini, Dragonair and Dragonite.", "#e0913a", { names: /\b(dratini|dragonair|dragonite)\b/i }),
  tin("budget", 5, "garchomp", "Garchomp tin", "Gible, Gabite and Garchomp.", "#3b4f9a", { names: /\b(gible|gabite|garchomp)\b/i }),
  tin("budget", 5, "tyranitar", "Tyranitar tin", "Larvitar, Pupitar and Tyranitar.", "#6f8a4c", { names: /\b(larvitar|pupitar|tyranitar)\b/i }),
  tin("budget", 5, "blastoise", "Blastoise tin", "Squirtle, Wartortle and Blastoise.", "#3f86c9", { names: /\b(squirtle|wartortle|blastoise)\b/i }),
  tin("budget", 5, "venusaur", "Venusaur tin", "Bulbasaur, Ivysaur and Venusaur.", "#4d9f6a", { names: /\b(bulbasaur|ivysaur|venusaur)\b/i }),
  tin("budget", 5, "alakazam", "Alakazam tin", "Abra, Kadabra and Alakazam.", "#c9a03a", { names: /\b(abra|kadabra|alakazam)\b/i }),
  tin("budget", 5, "machamp", "Machamp tin", "Machop, Machoke and Machamp.", "#7f8fa6", { names: /\b(machop|machoke|machamp)\b/i }),
  tin("budget", 5, "arcanine", "Fire dogs tin", "Growlithe, Arcanine, Vulpix and Ninetales.", "#e07a2e", { names: /\b(growlithe|arcanine|vulpix|ninetales)\b/i }),
  tin("budget", 5, "zoroark", "Zoroark tin", "Zorua and Zoroark, every form.", "#7a2f3d", { names: /\b(zorua|zoroark)\b/i }),
  tin("budget", 5, "mimikyu", "Mimikyu tin", "Mimikyu, every print.", "#c9b56a", { names: /\bmimikyu\b/i }),
  tin("budget", 5, "dragapult", "Dragapult tin", "Dreepy, Drakloak and Dragapult.", "#4a6a8f", { names: /\b(dreepy|drakloak|dragapult)\b/i }),
  tin("budget", 5, "blaziken", "Hoenn starters tin", "Blaziken, Sceptile and Swampert lines.", "#d9552e", { names: /\b(torchic|combusken|blaziken|treecko|grovyle|sceptile|mudkip|marshtomp|swampert)\b/i }),
  tin("budget", 4, "johto", "Johto starters tin", "Typhlosion, Feraligatr and Meganium lines.", "#b8892f", { names: /\b(cyndaquil|quilava|typhlosion|totodile|croconaw|feraligatr|chikorita|bayleef|meganium)\b/i }),
  tin("budget", 5, "sinnoh", "Sinnoh starters tin", "Infernape, Empoleon and Torterra lines.", "#3d74a8", { names: /\b(chimchar|monferno|infernape|piplup|prinplup|empoleon|turtwig|grotle|torterra)\b/i }),
  tin("budget", 5, "paldea", "Paldea starters tin", "Meowscarada, Skeledirge and Quaquaval lines.", "#5aa860", { names: /\b(sprigatito|floragato|meowscarada|fuecoco|crocalor|skeledirge|quaxly|quaxwell|quaquaval)\b/i }),
  tin("budget", 4, "cats", "Cats tin", "Meowth, Persian, Espeon, Luxray and more.", "#c7a96b", { names: /\b(meowth|persian|skitty|delcatty|glameow|purugly|purrloin|liepard|litten|torracat|incineroar|shinx|luxio|luxray|espurr|meowstic|sprigatito|floragato|meowscarada)\b/i }),
  tin("budget", 5, "ghosts", "Ghosts tin", "Chandelure, Banette, Dusknoir and friends.", "#5a4a86", { names: /\b(litwick|lampent|chandelure|shuppet|banette|duskull|dusclops|dusknoir|misdreavus|mismagius|sableye|spiritomb|greavard|houndstone|gholdengo|gimmighoul)\b/i }),
  // Mid.
  tin("mid", 25, "pseudo", "Powerhouse tin", "Dragonite, Tyranitar, Metagross, Garchomp and the other heavy hitters.", "#6a5c8f", { names: /\b(dragonite|tyranitar|salamence|metagross|garchomp|hydreigon|goodra|kommo-o|dragapult|baxcalibur)\b/i, min: 2 }),
  tin("mid", 25, "regional", "Regional forms tin", "Alolan, Galarian, Hisuian and Paldean Pokémon.", "#4a9a94", { names: /\b(alolan|galarian|hisuian|paldean)\b/i, min: 2 }),
  tin("mid", 15, "paradox", "Paradox tin", "Ancient and Future Pokémon.", "#8a4fb0", { names: /\b(iron (valiant|hands|bundle|treads|moth|thorns|jugulis|leaves|boulder|crown)|roaring moon|great tusk|scream tail|brute bonnet|flutter mane|slither wing|sandy shocks|walking wake|raging bolt|gouging fire|koraidon|miraidon)\b/i, min: 2 }),
  tin("mid", 12, "beasts-ultra", "Ultra Beast tin", "Visitors from Ultra Space.", "#3fa6c4", { names: /\b(nihilego|buzzwole|pheromosa|xurkitree|celesteela|kartana|guzzlord|poipole|naganadel|stakataka|blacephalon|necrozma)\b/i, min: 2 }),
  tin("mid", 25, "hoenn-legends", "Hoenn legends tin", "Kyogre, Groudon, Rayquaza, Latias and Latios.", "#2f7fa8", { names: /\b(kyogre|groudon|rayquaza|latias|latios|deoxys|jirachi)\b/i, min: 2 }),
  tin("mid", 25, "unova-legends", "Unova legends tin", "Reshiram, Zekrom and Kyurem.", "#4b4f58", { names: /\b(reshiram|zekrom|kyurem|victini|keldeo|genesect)\b/i, min: 2 }),
  tin("mid", 12, "galar-legends", "Galar legends tin", "Zacian, Zamazenta, Eternatus and Calyrex.", "#b03a5a", { names: /\b(zacian|zamazenta|eternatus|calyrex|urshifu|regieleki|regidrago)\b/i, min: 2 }),
  tin("mid", 25, "mythical", "Mythical tin", "Mew, Celebi, Jirachi, Darkrai and more.", "#5fb07a", { names: /\b(mew|celebi|jirachi|manaphy|darkrai|shaymin|arceus|victini|meloetta|genesect|diancie|hoopa|volcanion|marshadow|zeraora|pecharunt)\b/i, min: 2 }),
  tin("mid", 25, "pika-mid", "Pikachu picks tin", "Pikachu line, nothing under 2 coins.", "#e0b416", { names: PIKACHU, min: 2 }),
  tin("mid", 25, "eevee-mid", "Eeveelution picks tin", "Eeveelutions, nothing under 2 coins.", "#b97c40", { names: EEVEES, min: 2 }),
  tin("mid", 30, "slab-gengar", "Graded Gengar tin", "A Gengar in a slab: RIP 8, 9 or 10.", "#5b4399", { names: GENGAR, min: 3, slab: [8, 9, 10] }),
  tin("mid", 30, "slab-starters", "Graded starters tin", "A Kanto starter in a slab: RIP 8, 9 or 10.", "#2f8f8a", { names: STARTERS, min: 3, slab: [8, 9, 10] }),
  // High.
  tin("high", 75, "dragon", "Dragon type tin", "Dragon Pokémon worth 25 coins or more.", "#6a58b8", { types: ["Dragon"], hits: true, min: 25 }),
  typeTin("colorless", "Colorless", "#a8a39a"),
  tin("high", 50, "supporter-hits", "Supporter hits tin", "Only Supporters worth 25 coins or more.", "#c44868", { kind: "supporter", min: 25 }),
  tin("high", 75, "pika-hits", "Pikachu hits tin", "Only Pikachu line cards worth 25 coins or more.", "#d9a90e", { names: PIKACHU, min: 25 }),
  tin("high", 100, "mega-hits", "Mega hits tin", "Only Megas worth 25 coins or more.", "#b03f7c", { names: MEGAS, min: 25 }),
  tin("high", 100, "dragon-hits", "Dragon hits tin", "Rayquaza, Giratina, Dragonite and more, 25 coins and up.", "#5b47a8", { names: DRAGONS, min: 25 }),
  tin("high", 100, "gengar-hits", "Gengar hits tin", "Only Gengars worth 25 coins or more.", "#57408f", { names: GENGAR, min: 25 }),
  tin("high", 100, "starter-hits", "Starter hits tin", "Kanto starters worth 25 coins or more.", "#2a807b", { names: STARTERS, min: 25 }),
  tin("high", 150, "slab-legends", "Graded legends tin", "Mew, Mewtwo, Lugia, Rayquaza or Giratina in a slab: RIP 9 or 10.", "#43377f", { names: LEGENDS, min: 10, slab: [9, 10] }),
  tin("high", 150, "slab-tagteam", "Graded Tag Team tin", "A Tag Team in a slab: RIP 9 or 10.", "#c7861f", { kind: "tagteam", min: 10, slab: [9, 10] }),
  tin("high", 75, "slab-supporter", "Graded Supporter tin", "A Supporter in a slab: RIP 9 or 10.", "#b54060", { kind: "supporter", min: 10, slab: [9, 10] }),
  // High rollers.
  tin("roller", 175, "pika-roller", "Pikachu high roller tin", "Only Pikachu line cards worth 100 coins or more.", "#b88f0a", { names: PIKACHU, min: 100 }),
  tin("roller", 250, "mega-roller", "Mega high roller tin", "Only Megas worth 100 coins or more.", "#8f2f63", { names: MEGAS, min: 100 }),
  tin("roller", 175, "supporter-roller", "Supporter high roller tin", "Only Supporters worth 100 coins or more.", "#9c3350", { kind: "supporter", min: 100 }),
  tin("roller", 275, "fire-roller", "Fire high roller tin", "Fire Pokémon worth 100 coins or more.", "#b53d1f", { types: ["Fire"], min: 100 }),
  tin("roller", 225, "water-roller", "Water high roller tin", "Water Pokémon worth 100 coins or more.", "#2a6fb0", { types: ["Water"], min: 100 }),
  tin("roller", 300, "psychic-roller", "Psychic high roller tin", "Psychic Pokémon worth 100 coins or more.", "#7a479c", { types: ["Psychic"], min: 100 }),
  tin("roller", 400, "dragon-roller", "Dragon high roller tin", "Dragons worth 100 coins or more.", "#473690", { names: DRAGONS, min: 100 }),
  tin("roller", 450, "dark-roller", "Darkness high roller tin", "Darkness Pokémon worth 100 coins or more.", "#2c3245", { types: ["Darkness"], min: 100 }),
  tin("roller", 450, "slab-zard-gems", "Gem mint Charizard tin", "Every slab is a RIP 10 Charizard.", "#7a1d0f", { names: /\bcharizard\b/i, min: 65, slab: [10] }),
  tin("roller", 450, "slab-eevee-gems", "Gem mint Eeveelution tin", "Every slab is a RIP 10 Eeveelution.", "#5f3a18", { names: EEVEES, min: 65, slab: [10] }),
  tin("roller", 650, "vault", "Vault tin", "Every card inside is worth 300 coins or more.", "#14161b", { min: 300 }),
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
