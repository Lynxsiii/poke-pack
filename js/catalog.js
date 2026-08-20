export const RARITY_ORDER = [
  "Energy",
  "Common",
  "Uncommon",
  "Rare",
  "Double Rare",
  "ACE SPEC Rare",
  "Ultra Rare",
  "Illustration Rare",
  "Futuristic Rare",
  "Shiny Rare",
  "Shiny Ultra Rare",
  "Mega Attack Rare",
  "Black White Rare",
  "Hyper Rare",
  "Special Illustration Rare",
  "Mega Hyper Rare",
];

export const RARITY_LABEL = {
  Energy: "Energy",
  Common: "Common",
  Uncommon: "Uncommon",
  Rare: "Rare",
  "Double Rare": "Double rare",
  "ACE SPEC Rare": "ACE SPEC rare",
  "Ultra Rare": "Ultra rare",
  "Illustration Rare": "Illustration rare",
  "Futuristic Rare": "Futuristic rare",
  "Shiny Rare": "Shiny rare",
  "Shiny Ultra Rare": "Shiny ultra rare",
  "Mega Attack Rare": "Mega attack rare",
  "Black White Rare": "Black White rare",
  "Hyper Rare": "Hyper rare",
  "Special Illustration Rare": "Special illustration rare",
  "Mega Hyper Rare": "Mega hyper rare",
};

/**
 * Printed rarity symbols, following the Bulbapedia rarity chart.
 * Each pip is a [glyph, tone] pair so two-tone marks (Black White rare,
 * Mega attack rare) can colour each star separately.
 * Groups mirror the chart's rows: which era each rarity is still printed in.
 */
export const RARITY_MARK = {
  Energy: { pips: [["●", "ink"]], group: "current" },
  Common: { pips: [["●", "ink"]], group: "current" },
  Uncommon: { pips: [["◆", "ink"]], group: "current" },
  Rare: { pips: [["★", "ink"]], group: "current" },
  "Double Rare": { pips: [["★", "ink"], ["★", "ink"]], group: "current" },
  "Illustration Rare": { pips: [["☆", "gold"]], group: "current" },
  "Ultra Rare": { pips: [["☆", "silver"], ["☆", "silver"]], group: "current" },
  "Futuristic Rare": { pips: [["★", "future"]], group: "current" },
  "Special Illustration Rare": { pips: [["☆", "gold"], ["☆", "gold"]], group: "current" },
  "Mega Hyper Rare": { pips: [["◈", "gold"]], group: "current" },
  "Mega Attack Rare": { pips: [["★", "mega"], ["☆", "megaAlt"]], group: "untilI" },
  "Black White Rare": { pips: [["★", "black"], ["☆", "white"]], group: "untilI" },
  "Hyper Rare": { pips: [["☆", "gold"], ["☆", "gold"]], group: "untilI" },
  "ACE SPEC Rare": { pips: [["★", "ace"]], group: "untilH" },
  "Shiny Rare": { pips: [["☆", "shiny"]], group: "expanded" },
  "Shiny Ultra Rare": { pips: [["☆", "shiny"], ["☆", "shiny"]], group: "expanded" },
};

export const RARITY_GROUPS = [
  { id: "current", label: "Found in", era: "J" },
  { id: "untilI", label: "Found until", era: "I" },
  { id: "untilH", label: "Found until", era: "H" },
  { id: "expanded", label: "Expanded only", era: "G", note: "and earlier" },
];

export const SELL_VALUE = {
  Energy: 4,
  Common: 8,
  Uncommon: 20,
  Rare: 55,
  "Double Rare": 90,
  "ACE SPEC Rare": 150,
  "Ultra Rare": 180,
  "Illustration Rare": 160,
  "Futuristic Rare": 240,
  "Shiny Rare": 120,
  "Shiny Ultra Rare": 260,
  "Mega Attack Rare": 300,
  "Black White Rare": 340,
  "Hyper Rare": 480,
  "Special Illustration Rare": 420,
  "Mega Hyper Rare": 900,
};

export const CHASE_SELL = {
  "me5-116": 650, // Mega Darkrai ex SIR
  "me5-120": 1100, // Mega Darkrai ex Mega Hyper Rare
  "me4-116": 650, // Mega Greninja ex SIR
  "me4-122": 1100, // Mega Greninja ex Mega Hyper Rare
};

/**
 * Coins per USD of real market value. When a card in data/*.json carries a
 * `market` price (e.g. loaded from a price guide), that drives its sell value
 * and the rarity table below is only the fallback for cards without one.
 */
export const COINS_PER_USD = 100;

export function sellValue(card) {
  if (typeof card.market === "number" && card.market > 0) {
    return Math.max(1, Math.round(card.market * COINS_PER_USD));
  }
  return CHASE_SELL[card.id] || SELL_VALUE[card.rarity] || 8;
}

/** Generic basic Energy — one per modern pack, not part of the 120-card set. */
export const BASIC_ENERGY = [
  ["grass", "Grass", "https://images.pokemontcg.io/sve/1"],
  ["fire", "Fire", "https://images.pokemontcg.io/sve/2"],
  ["water", "Water", "https://images.pokemontcg.io/sve/3"],
  ["lightning", "Lightning", "https://images.pokemontcg.io/sve/4"],
  ["psychic", "Psychic", "https://images.pokemontcg.io/sve/5"],
  ["fighting", "Fighting", "https://images.pokemontcg.io/sve/6"],
  ["darkness", "Darkness", "https://images.pokemontcg.io/sve/7"],
  ["metal", "Metal", "https://images.pokemontcg.io/sve/8"],
].map(([id, name, base]) => ({
  id: `energy-${id}`,
  name: `${name} Energy`,
  number: "—",
  rarity: "Energy",
  energy: true,
  supertype: "Energy",
  subtypes: ["Basic"],
  types: [name],
  artist: "Pokémon",
  image: `${base}_hires.png`,
  imageSmall: `${base}.png`,
}));

/**
 * Pitch Black pull rates (TCGplayer Authentication Center, ~4000 packs):
 * Double Rare 21.02% (1/5), Ultra Rare 8.30% (1/12),
 * Illustration Rare 11.01% (1/9), SIR 1.25% (1/80), Mega Hyper Rare 0.09% (1/1081).
 * Rare slot leftover is a regular Rare. Art-slot leftover is a reverse holo.
 */
const DR = 0.2102;
const UR = 0.083;
const IR = 0.1101;
const SIR = 0.0125;
const MHR = 1 / 1081;

export const PITCH_BLACK = {
  id: "me5",
  tcgId: "me5",
  name: "Pitch Black",
  edition: "Mega Evolution",
  era: "Mega Evolution",
  released: "July 17, 2026",
  live: true,
  printedTotal: 84,
  totalCount: 120,
  packSize: 11,
  cost: 250,
  dataFile: "data/me5.json",
  cardBack: "https://images.pokemontcg.io/card-back.png",
  blurb: "Mega Evolution, July 2026. Ten cards plus a basic Energy. Same odds on every wrapper.",
  oddsLine: "DR 1/5 · UR 1/12 · IR 1/9 · SIR 1/80 · gold 1/1081",
  lede: "Real booster math. Real card scans. Ten cards plus a basic Energy — reverse, a rare slot, and an art slot.",
  slots: [
    { pool: "energy", count: 1 },
    { pool: "common", count: 4 },
    { pool: "uncommon", count: 3 },
    { pool: "reverse", count: 1 },
    {
      pool: "rare-slot",
      count: 1,
      table: [
        ["rare", 1 - DR - UR],
        ["double", DR],
        ["ultra", UR],
      ],
    },
    {
      pool: "art-slot",
      count: 1,
      table: [
        ["reverse", 1 - IR - SIR - MHR],
        ["ir", IR],
        ["sir", SIR],
        ["hyper", MHR],
      ],
    },
  ],
  heroIds: ["me5-48", "me5-38", "me5-27", "me5-65"],
  wrappers: [
    {
      id: "darkrai",
      name: "Darkrai",
      cardId: "me5-48",
      tag: "The chase",
      art: "assets/packs/me5/darkrai.avif",
      artFallback: "assets/packs/me5/darkrai.png",
    },
    {
      id: "chandelure",
      name: "Chandelure",
      cardId: "me5-38",
      tag: "Ghost light",
      art: "assets/packs/me5/chandelure.avif",
      artFallback: "assets/packs/me5/chandelure.png",
    },
    {
      id: "zeraora",
      name: "Zeraora",
      cardId: "me5-27",
      tag: "Wild charge",
      art: "assets/packs/me5/zeraora.avif",
      artFallback: "assets/packs/me5/zeraora.png",
    },
    {
      id: "excadrill",
      name: "Excadrill",
      cardId: "me5-65",
      tag: "Ground break",
      art: "assets/packs/me5/excadrill.avif",
      artFallback: "assets/packs/me5/excadrill.png",
    },
  ],
};

export const CHAOS_RISING = {
  id: "me4",
  tcgId: "me4",
  name: "Chaos Rising",
  edition: "Mega Evolution",
  era: "Mega Evolution",
  released: "May 22, 2026",
  live: true,
  printedTotal: 86,
  totalCount: 122,
  packSize: 11,
  cost: 250,
  dataFile: "data/me4.json",
  cardBack: "https://images.pokemontcg.io/card-back.png",
  blurb: "Mega Evolution, May 2026. Ten cards plus a basic Energy. Same 11-card math as Pitch Black.",
  oddsLine: "DR 1/5 · UR 1/12 · IR 1/9 · SIR 1/80 · gold 1/1081",
  lede: "Kalos in chaos. Mega Greninja ex headlines four wrappers — same reverse, rare slot, and art slot as the rest of the Mega Evolution block.",
  slots: PITCH_BLACK.slots,
  heroIds: ["me4-22", "me4-35", "me4-65", "me4-15"],
  wrappers: [
    {
      id: "greninja",
      name: "Greninja",
      cardId: "me4-22",
      tag: "The chase",
      art: "assets/packs/me4/greninja.avif",
      artFallback: "assets/packs/me4/greninja.png",
    },
    {
      id: "floette",
      name: "Floette",
      cardId: "me4-35",
      tag: "Lumiose bloom",
      art: "assets/packs/me4/floette.avif",
      artFallback: "assets/packs/me4/floette.png",
    },
    {
      id: "dragalge",
      name: "Dragalge",
      cardId: "me4-65",
      tag: "Poison tide",
      art: "assets/packs/me4/dragalge.avif",
      artFallback: "assets/packs/me4/dragalge.png",
    },
    {
      id: "pyroar",
      name: "Pyroar",
      cardId: "me4-15",
      tag: "Royal roar",
      art: "assets/packs/me4/pyroar.avif",
      artFallback: "assets/packs/me4/pyroar.png",
    },
  ],
};

export const PLAYABLE_SETS = [PITCH_BLACK, CHAOS_RISING];
export const SET_BY_ID = Object.fromEntries(PLAYABLE_SETS.map((set) => [set.id, set]));
export const DEFAULT_SET_ID = PITCH_BLACK.id;
export const LIVE_SET = PITCH_BLACK;

export function getSet(id) {
  return SET_BY_ID[id] || SET_BY_ID[DEFAULT_SET_ID];
}

/** Newest English sets first, then back toward Base Set. Playable sets omitted. */
export const ROADMAP = [
  {
    era: "Mega Evolution",
    sets: [
      { id: "me3", name: "Perfect Order", released: "Mar 2026", cards: 124 },
      { id: "me2pt5", name: "Ascended Heroes", released: "Jan 2026", cards: 295 },
      { id: "me2", name: "Phantasmal Flames", released: "Nov 2025", cards: "—" },
      { id: "me1", name: "Mega Evolution", released: "Sep 2025", cards: "—" },
    ],
  },
  {
    era: "Scarlet & Violet",
    sets: [
      { id: "zsv10pt5", name: "Black Bolt", released: "Jul 2025", cards: "—" },
      { id: "rsv10pt5", name: "White Flare", released: "Jul 2025", cards: "—" },
      { id: "sv10", name: "Destined Rivals", released: "May 2025", cards: "—" },
      { id: "sv9", name: "Journey Together", released: "Mar 2025", cards: "—" },
      { id: "sv8pt5", name: "Prismatic Evolutions", released: "Jan 2025", cards: "—" },
      { id: "sv8", name: "Surging Sparks", released: "Nov 2024", cards: "—" },
      { id: "sv7", name: "Stellar Crown", released: "Sep 2024", cards: "—" },
      { id: "sv6pt5", name: "Shrouded Fable", released: "Aug 2024", cards: "—" },
      { id: "sv6", name: "Twilight Masquerade", released: "May 2024", cards: "—" },
      { id: "sv5", name: "Temporal Forces", released: "Mar 2024", cards: "—" },
      { id: "sv4pt5", name: "Paldean Fates", released: "Jan 2024", cards: "—" },
      { id: "sv4", name: "Paradox Rift", released: "Nov 2023", cards: "—" },
      { id: "sv3pt5", name: "151", released: "Sep 2023", cards: "—" },
      { id: "sv3", name: "Obsidian Flames", released: "Aug 2023", cards: "—" },
      { id: "sv2", name: "Paldea Evolved", released: "Jun 2023", cards: "—" },
      { id: "sv1", name: "Scarlet & Violet", released: "Mar 2023", cards: "—" },
    ],
  },
  {
    era: "Sword & Shield",
    sets: [
      { id: "swsh12pt5", name: "Crown Zenith", released: "Jan 2023", cards: "—" },
      { id: "swsh12", name: "Silver Tempest", released: "Nov 2022", cards: "—" },
      { id: "pgo", name: "Pokémon GO", released: "Jul 2022", cards: "—" },
      { id: "swsh7", name: "Evolving Skies", released: "Aug 2021", cards: "—" },
      { id: "swsh1", name: "Sword & Shield", released: "Feb 2020", cards: "—" },
    ],
  },
  {
    era: "Sun & Moon → XY → BW",
    sets: [
      { id: "sm12", name: "Cosmic Eclipse", released: "Nov 2019", cards: "—" },
      { id: "sm1", name: "Sun & Moon", released: "Feb 2017", cards: "—" },
      { id: "xy12", name: "Evolutions", released: "Nov 2016", cards: "—" },
      { id: "xy1", name: "XY", released: "Feb 2014", cards: "—" },
      { id: "bw11", name: "Legendary Treasures", released: "Nov 2013", cards: "—" },
      { id: "bw1", name: "Black & White", released: "Apr 2011", cards: "—" },
    ],
  },
  {
    era: "HGSS → Diamond & Pearl → EX",
    sets: [
      { id: "hgss1", name: "HeartGold & SoulSilver", released: "Feb 2010", cards: "—" },
      { id: "dp1", name: "Diamond & Pearl", released: "May 2007", cards: "—" },
      { id: "ex16", name: "Power Keepers", released: "Feb 2007", cards: "—" },
      { id: "ex1", name: "Ruby & Sapphire", released: "Jul 2003", cards: "—" },
    ],
  },
  {
    era: "Wizards of the Coast",
    sets: [
      { id: "skyridge", name: "Skyridge", released: "May 2003", cards: 182 },
      { id: "aquapolis", name: "Aquapolis", released: "Jan 2003", cards: 186 },
      { id: "expedition", name: "Expedition Base Set", released: "Sep 2002", cards: 165 },
      { id: "neogenesis", name: "Neo Genesis", released: "Dec 2000", cards: 111 },
      { id: "teamrocket", name: "Team Rocket", released: "Apr 2000", cards: 83 },
      { id: "fossil", name: "Fossil", released: "Oct 1999", cards: 62 },
      { id: "jungle", name: "Jungle", released: "Jun 1999", cards: 64 },
      { id: "base1", name: "Base Set", released: "Jan 1999", cards: 102, note: "Queued — vintage pack photos need work" },
    ],
  },
];

/** ROADMAP ids that are not pokemontcg.io set ids. */
const TCG_ID_ALIAS = {
  skyridge: "ecard3",
  aquapolis: "ecard2",
  expedition: "ecard1",
  neogenesis: "neo1",
  teamrocket: "base5",
  fossil: "base3",
  jungle: "base2",
};

/** Logos not on images.pokemontcg.io yet — scrydex hotlinks from the public set catalog. */
const SCRYDEX_LOGO = new Set(["me2pt5", "me3", "me4", "me5"]);

const LIMITLESS_SYMBOL = {
  me2pt5: "ASC",
  me3: "POR",
  me4: "CRI",
  me5: "PBL",
};

export function tcgSetId(set) {
  return set.tcgId || TCG_ID_ALIAS[set.id] || set.id;
}

/** Set logo + symbol URLs for catalog identity art (not booster wrappers). */
export function setIdentity(set) {
  const id = tcgSetId(set);
  if (SCRYDEX_LOGO.has(id)) {
    return {
      id,
      logo: `https://images.scrydex.com/pokemon/${id}-logo/logo`,
      symbol: `https://s3.limitlesstcg.com/sets/en/${LIMITLESS_SYMBOL[id]}_SM.png`,
    };
  }
  return {
    id,
    logo: `https://images.pokemontcg.io/${id}/logo.png`,
    symbol: `https://images.pokemontcg.io/${id}/symbol.png`,
  };
}

export function rarityKey(rarity) {
  return String(rarity).toLowerCase().replace(/\s+/g, "-");
}
