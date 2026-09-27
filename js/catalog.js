export const RARITY_ORDER = [
  "Energy",
  "Common",
  "Uncommon",
  "Rare",
  "Pikachu Rare",
  // Prismatic Evolutions' pattern prints of its Commons, Uncommons and Rares.
  "Poké Ball",
  "Double Rare",
  "Shiny Rare",
  "ACE SPEC Rare",
  "Master Ball",
  "Ultra Rare",
  "Shiny Ultra Rare",
  "Illustration Rare",
  "Classic Collection",
  "Mega Attack Rare",
  "Black White Rare",
  "Hyper Rare",
  "Special Illustration Rare",
  "Futuristic Rare",
  "Mega Hyper Rare",
  "RGB Rare",
  // Black star promos come in collection boxes, never packs. Last, so a
  // binder lists them after the set, the way a master set is filed.
  "Promo",
];

export const RARITY_LABEL = {
  Energy: "Energy",
  Common: "Common",
  Uncommon: "Uncommon",
  Rare: "Rare",
  "Pikachu Rare": "Pikachu rare",
  "Poké Ball": "Poké Ball pattern",
  "Master Ball": "Master Ball pattern",
  "Double Rare": "Double rare",
  "ACE SPEC Rare": "ACE SPEC rare",
  "Ultra Rare": "Ultra rare",
  "Illustration Rare": "Illustration rare",
  "Futuristic Rare": "Futuristic rare",
  "Classic Collection": "Classic Collection",
  "RGB Rare": "RGB rare",
  "Shiny Rare": "Shiny rare",
  "Shiny Ultra Rare": "Shiny ultra rare",
  "Mega Attack Rare": "Mega attack rare",
  "Black White Rare": "Black White rare",
  "Hyper Rare": "Hyper rare",
  "Special Illustration Rare": "Special illustration rare",
  "Mega Hyper Rare": "Mega hyper rare",
  Promo: "Promo",
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
  "Pikachu Rare": { pips: [["★", "pika"]], group: "current" },
  "Classic Collection": { pips: [["◈", "gold"]], group: "current" },
  "RGB Rare": { pips: [["★", "rgbR"], ["★", "rgbG"], ["★", "rgbB"]], group: "current" },
  "Special Illustration Rare": { pips: [["☆", "gold"], ["☆", "gold"]], group: "current" },
  "Mega Hyper Rare": { pips: [["◈", "gold"]], group: "current" },
  "Mega Attack Rare": { pips: [["★", "mega"], ["☆", "megaAlt"]], group: "untilI" },
  "Black White Rare": { pips: [["★", "black"], ["☆", "white"]], group: "untilI" },
  "Hyper Rare": { pips: [["☆", "gold"], ["☆", "gold"]], group: "untilI" },
  "ACE SPEC Rare": { pips: [["★", "ace"]], group: "untilH" },
  // Not printed marks: the card carries its base rarity's symbol
  // (`printedRarity`), and the ball stands for the pattern in filters.
  "Poké Ball": { pips: [["◓", "pokeball"]], group: "untilI" },
  "Master Ball": { pips: [["◓", "masterball"]], group: "untilI" },
  "Shiny Rare": { pips: [["☆", "shiny"]], group: "expanded" },
  "Shiny Ultra Rare": { pips: [["☆", "shiny"], ["☆", "shiny"]], group: "expanded" },
  Promo: { pips: [["★", "black"]], group: "current" },
};

export const RARITY_GROUPS = [
  { id: "current", label: "Found in", era: "J" },
  { id: "untilI", label: "Found until", era: "I" },
  { id: "untilH", label: "Found until", era: "H" },
  { id: "expanded", label: "Expanded only", era: "G", note: "and earlier" },
];

/**
 * Fallback sell price in USD for a card with no `market` value — basic Energy,
 * or a set that hasn't been through scripts/fetch_prices.py yet. Figures are
 * the median real price per rarity across the three priced Mega Evolution
 * sets, so an unpriced set still lands in the right ballpark.
 */
export const SELL_VALUE = {
  Energy: 0.05,
  Common: 0.08,
  Uncommon: 0.08,
  Rare: 0.18,
  "Double Rare": 0.61,
  "ACE SPEC Rare": 1.5,
  "Ultra Rare": 3.44,
  "Illustration Rare": 3.2,
  "Futuristic Rare": 150,
  "Pikachu Rare": 0.5,
  "Poké Ball": 1.2,
  "Master Ball": 8,
  "Classic Collection": 12,
  "RGB Rare": 4000,
  "Shiny Rare": 2,
  "Shiny Ultra Rare": 5,
  "Mega Attack Rare": 6,
  "Black White Rare": 8,
  "Hyper Rare": 20,
  "Special Illustration Rare": 49.11,
  "Mega Hyper Rare": 169.54,
  Promo: 1,
};

/**
 * Coins per USD of real market value. One coin is one dollar, so a card that
 * books at $0.74 sells for 0.74 and a $217 chase sells for 217 — prices come
 * from `scripts/fetch_prices.py` and land on each card as `market`.
 *
 * SELL_VALUE above is only the fallback for a card with no market price yet
 * (a set that hasn't been priced, or basic Energy), on the same dollar scale.
 */
export const COINS_PER_USD = 1;

/** Coins carry cents, so round every money result to avoid float drift. */
export function money(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Sealed products a player can open whole. Keys match data/sealed.json, and a
 * set only offers the products it has a market price for — special sets like
 * Ascended Heroes never printed a booster box, so they show ETB and bundle only.
 * Pack counts are the English retail contents. An ETB's promo card comes from
 * data/products.json; its sleeves and dice are not simulated.
 */
export const SEALED_PRODUCTS = [
  { id: "boosterBox", name: "Booster Box", short: "Box", noun: "box", packs: 36 },
  { id: "eliteTrainerBox", name: "Elite Trainer Box", short: "ETB", noun: "ETB", packs: 9 },
  { id: "boosterBundle", name: "Booster Bundle", short: "Bundle", noun: "bundle", packs: 6 },
];

/** How the shop and the opening name each kind of promo product. */
const PRODUCT_KINDS = {
  etb: { short: "ETB", noun: "ETB" },
  premium: { short: "Collection", noun: "collection" },
  collection: { short: "Box", noun: "box" },
  tin: { short: "Tin", noun: "tin" },
  blister: { short: "Blister", noun: "blister" },
  deck: { short: "Deck", noun: "deck" },
  battle: { short: "Box", noun: "box" },
};

/**
 * Products a set can be opened as, with their prices, from a sealed.json row.
 * `products` is the set's list from data/products.json: an entry with a
 * standard product's id (the ETB) adds its promo cards to that product.
 */
export function sealedOffers(prices, products = []) {
  const extra = Object.fromEntries((products || []).map((item) => [item.id, item]));
  return SEALED_PRODUCTS.flatMap((product) => {
    const price = prices?.[product.id];
    if (!(typeof price === "number" && price > 0)) return [];
    return [{
      ...product,
      price: money(price),
      promos: extra[product.id]?.promos || [],
      pick: promoPick(extra[product.id]),
      special: {},
    }];
  });
}

/**
 * How many of a product's promos come in one box: 0 means all of them. A
 * Build & Battle Box holds one of its four prerelease promos at random.
 */
function promoPick(item) {
  const pick = Math.floor(Number(item?.pick) || 0);
  return pick > 0 && pick < (item?.promos?.length || 0) ? pick : 0;
}

/**
 * Collection boxes, tins, premium collections and battle decks: the products
 * that come with promo cards no pack carries. Built by
 * scripts/build_products.py into data/products.json, priced at TCGplayer
 * market. `packs` are the set's boosters, `special` any extra packs from the
 * set's `specialPacks`, `promos` the card ids that come in the box, and
 * `pick` how many of them one box holds when it is not all of them.
 */
export function promoOffers(products = []) {
  const standard = new Set(SEALED_PRODUCTS.map((product) => product.id));
  return (products || []).flatMap((item) => {
    if (standard.has(item.id) || !(typeof item.price === "number" && item.price > 0)) return [];
    const promos = Array.isArray(item.promos) ? item.promos : [];
    const packs = Math.max(0, Math.floor(Number(item.packs) || 0));
    if (!packs && !promos.length) return [];
    const words = PRODUCT_KINDS[item.kind] || PRODUCT_KINDS.collection;
    return [{
      id: String(item.id),
      name: String(item.name),
      kind: item.kind || "collection",
      ...words,
      packs,
      special: item.special && typeof item.special === "object" ? item.special : {},
      promos,
      pick: promoPick(item),
      price: money(item.price),
      image: item.image || "",
      released: item.released || "",
    }];
  });
}

/** Any product a set sells, standard or promo, by id. */
export function findOffer(prices, products, id) {
  const key = String(id || "");
  return (
    sealedOffers(prices, products).find((item) => item.id === key) ||
    promoOffers(products).find((item) => item.id === key) ||
    null
  );
}

/** Booster packs in an offer, special packs included. */
export function offerPackCount(offer) {
  const special = Object.values(offer?.special || {}).reduce((sum, n) => sum + (Number(n) || 0), 0);
  return (Number(offer?.packs) || 0) + special;
}

export function sellValue(card) {
  if (typeof card.market === "number" && card.market > 0) {
    return Math.max(0.01, money(card.market * COINS_PER_USD));
  }
  return SELL_VALUE[card.rarity] || 0.1;
}

/**
 * Generic basic Energy — one per modern pack, not part of the 120-card set.
 * Faces are mirrored locally by scripts/mirror_images.py, same as the cards.
 */
export const BASIC_ENERGY = [
  ["grass", "Grass"],
  ["fire", "Fire"],
  ["water", "Water"],
  ["lightning", "Lightning"],
  ["psychic", "Psychic"],
  ["fighting", "Fighting"],
  ["darkness", "Darkness"],
  ["metal", "Metal"],
].map(([id, name]) => ({
  id: `energy-${id}`,
  name: `${name} Energy`,
  number: "—",
  rarity: "Energy",
  energy: true,
  supertype: "Energy",
  subtypes: ["Basic"],
  types: [name],
  artist: "Pokémon",
  image: `assets/cards/shared/energy-${id}.webp`,
  imageSmall: `assets/cards/shared/energy-${id}-sm.webp`,
}));

/**
 * Mega Evolution era pack: 4 commons + 3 uncommons + a reverse + a rare slot +
 * an art slot + a basic Energy. Rare-slot leftover is a regular Rare; art-slot
 * leftover is a reverse holo.
 *
 * Rates are per set, not shared. They used to come from one block of constants
 * reused by every set, which quietly published Pitch Black's odds on Perfect
 * Order and Chaos Rising — their real SIR rates are 1/75 and 1/100, not 1/80.
 * Figures come from scripts/fetch_pullrates.py (pullrates.gg), whose Pitch
 * Black numbers match the TCGplayer 4,000-pack study exactly.
 *
 * `megaAttack` is Ascended Heroes only: those cards share the Ultra Rare slot,
 * which is why that set's UR rate falls to 1/21.
 */
function megaSlots({ double, ultra, ir, sir, hyper, megaAttack = 0 }) {
  return [
    { pool: "energy", count: 1 },
    { pool: "common", count: 4 },
    { pool: "uncommon", count: 3 },
    { pool: "reverse", count: 1 },
    {
      pool: "rare-slot",
      count: 1,
      table: [
        ["rare", 1 - double - ultra - megaAttack],
        ["double", double],
        ["ultra", ultra],
        ...(megaAttack ? [["megaAttack", megaAttack]] : []),
      ],
    },
    {
      pool: "art-slot",
      count: 1,
      table: [
        ["reverse", 1 - ir - sir - hyper],
        ["ir", ir],
        ["sir", sir],
        ["hyper", hyper],
      ],
    },
  ];
}

/**
 * Black Bolt / White Flare (and later 151-style special sets): same 11-card
 * skeleton, but the reverse slot rolls Poké Ball / Master Ball / cosmos, and
 * Black White Rares sit in the art slot where Mega sets put gold.
 *
 * English rates from the PokeBeach set guide (community openings, Jul 2025):
 * DR 1/5, UR 1/16, Poké Ball reverse 1/3, Master Ball 1/15, IR 1/6, SIR 1/76.
 * BWR ~1/496 from the same community tables (TCGPlayer could not pin it).
 */
function svSpecialSlots({ double, ultra, ir, sir, bwr, pokeball, masterball }) {
  return [
    { pool: "energy", count: 1 },
    { pool: "common", count: 4 },
    { pool: "uncommon", count: 3 },
    {
      pool: "reverse",
      count: 1,
      kinds: [
        ["pokeball", pokeball],
        ["masterball", masterball],
        ["cosmos", 1 - pokeball - masterball],
      ],
    },
    {
      pool: "rare-slot",
      count: 1,
      table: [
        ["rare", 1 - double - ultra],
        ["double", double],
        ["ultra", ultra],
      ],
    },
    {
      pool: "art-slot",
      count: 1,
      table: [
        ["reverse", 1 - ir - sir - bwr],
        ["ir", ir],
        ["sir", sir],
        ["bwr", bwr],
      ],
    },
  ];
}

/**
 * Scarlet & Violet main-set pack: 4C + 3U + reverse + rare slot + art slot +
 * energy. ACE SPEC (when the set has it) replaces the reverse — that's the
 * first reverse-holo slot, not the rare slot. Rare leftover is a regular Rare;
 * art leftover is a second reverse. Prismatic has no Illustration Rares and
 * is handled separately so Poké Ball / Master Ball can share that art slot.
 */
function svSlots({ double, ultra, ir = 0, sir, hyper, ace = 0 }) {
  return [
    { pool: "energy", count: 1 },
    { pool: "common", count: 4 },
    { pool: "uncommon", count: 3 },
    ace
      ? { pool: "reverse", count: 1, table: [["reverse", 1 - ace], ["ace", ace]] }
      : { pool: "reverse", count: 1 },
    {
      pool: "rare-slot",
      count: 1,
      table: [
        ["rare", 1 - double - ultra],
        ["double", double],
        ["ultra", ultra],
      ],
    },
    {
      pool: "art-slot",
      count: 1,
      table: [
        ["reverse", 1 - ir - sir - hyper],
        ...(ir ? [["ir", ir]] : []),
        ["sir", sir],
        ["hyper", hyper],
      ],
    },
  ];
}

/**
 * Shrouded Fable: the same pack as svSlots, but every reverse holo carries the
 * set's own Poké Ball chain pattern, and the basic Energy is sometimes a
 * reverse holo of its own (data/sv6pt5.json's `sv6pt5-energy-*` cards).
 */
function chainSlots(rates, reverseEnergy) {
  return svSlots(rates).map((slot) => {
    if (slot.pool === "energy") {
      return { ...slot, table: [["energy", 1 - reverseEnergy], ["reverseEnergy", reverseEnergy]] };
    }
    if (slot.pool === "reverse" || slot.pool === "art-slot") return { ...slot, kinds: [["chain", 1]] };
    return slot;
  });
}

/**
 * Prismatic Evolutions. Every Common, Uncommon and Rare has a Poké Ball
 * pattern print, and the Pokémon among them a Master Ball one too; each is a
 * card of its own here (scripts/build_patterns.py) with its own price. Both
 * come out of the reverse slots: the first holds a Poké Ball print or an
 * ACE SPEC instead of its reverse, the second a Master Ball print, a Special
 * Illustration Rare or a gold Hyper Rare. Odds are TCGplayer's 1,200-pack
 * study (data/pullrates.json).
 */
function prismaticSlots({ double, ultra, sir, hyper, ace, pokeball, masterball }) {
  return [
    { pool: "energy", count: 1 },
    { pool: "common", count: 4 },
    { pool: "uncommon", count: 3 },
    {
      pool: "reverse",
      count: 1,
      table: [["reverse", 1 - pokeball - ace], ["pokeball", pokeball], ["ace", ace]],
    },
    {
      pool: "rare-slot",
      count: 1,
      table: [
        ["rare", 1 - double - ultra],
        ["double", double],
        ["ultra", ultra],
      ],
    },
    {
      pool: "art-slot",
      count: 1,
      table: [
        ["reverse", 1 - masterball - sir - hyper],
        ["masterball", masterball],
        ["sir", sir],
        ["hyper", hyper],
      ],
    },
  ];
}

/**
 * 30th Celebration: six cards, all foil. A Pikachu Rare (one of 30) in every
 * pack, three main-set foils, one hit slot, and a basic Energy. There are no
 * reverse holos and no Uncommons in this set.
 *
 * The hit slot's leftover is a regular Rare. Rates are per pack, from
 * TCGplayer's 3,000-pack study (IR 1/5, Classic 1/10, SIR 1/21, Futuristic
 * 1/120) plus @switchstock's 6,500-pack tally for the two it could not pin
 * (ex 1/4, RGB Mew 1/3,200). Sources and dates are in data/pullrates.json.
 *
 * The Pikachu ex Futuristic promos are not in packs: they come in the
 * Ultra-Premium Collections, which data/products.json sells.
 */
function celebrationSlots({ double, ir, classic, sir, futuristic, rgb }) {
  return [
    { pool: "energy", count: 1 },
    { pool: "pikachu", count: 1 },
    { pool: "common", count: 3 },
    {
      pool: "rare-slot",
      count: 1,
      table: [
        ["rare", 1 - double - ir - classic - sir - futuristic - rgb],
        ["double", double],
        ["ir", ir],
        ["classic", classic],
        ["sir", sir],
        ["futuristic", futuristic],
        ["rgb", rgb],
      ],
    },
  ];
}

/**
 * Paldean Fates: the Scarlet & Violet main-set skeleton, but the first
 * reverse holo is where the Shiny Vault lives. A Shiny Rare (one of 120) or a
 * Shiny Ultra Rare (one of 12) replaces that reverse in about one pack in
 * three; IR, SIR and gold take the second reverse; the rare slot holds Double
 * and Ultra Rares. Three separate slots, so one pack can hold three hits.
 * Rates are TCGplayer's study of more than 1,500 packs (data/pullrates.json).
 */
function shinyVaultSlots({ double, ultra, shiny, shinyUltra, ir, sir, hyper }) {
  return [
    { pool: "energy", count: 1 },
    { pool: "common", count: 4 },
    { pool: "uncommon", count: 3 },
    {
      pool: "reverse",
      count: 1,
      table: [
        ["reverse", 1 - shiny - shinyUltra],
        ["shiny", shiny],
        ["shinyUltra", shinyUltra],
      ],
    },
    {
      pool: "rare-slot",
      count: 1,
      table: [
        ["rare", 1 - double - ultra],
        ["double", double],
        ["ultra", ultra],
      ],
    },
    {
      pool: "art-slot",
      count: 1,
      table: [
        ["reverse", 1 - ir - sir - hyper],
        ["ir", ir],
        ["sir", sir],
        ["hyper", hyper],
      ],
    },
  ];
}

function boosterWrappers(setId, faces) {
  return faces.map((face, i) => ({
    id: face.id,
    name: face.name,
    cardId: face.cardId,
    tag: face.tag,
    art: `assets/packs/${setId}/pack-${i}.avif`,
    artFallback: `assets/packs/${setId}/pack-${i}.png`,
  }));
}

export const CELEBRATION_30TH = {
  id: "me55",
  tcgId: "me55",
  name: "30th Celebration",
  edition: "Mega Evolution",
  era: "Mega Evolution",
  released: "September 16, 2026",
  live: true,
  printedTotal: 128,
  totalCount: 210,
  packSize: 6,
  cost: 16.26,
  allFoil: true,
  dataFile: "data/me55.json",
  cardBack: "assets/cards/shared/card-back.webp",
  blurb: "Mega Evolution, September 2026. Six foils a pack, a Pikachu in every one, and the first Futuristic Rares.",
  oddsLine: "ex 1/4 · IR 1/5 · Classic 1/10 · SIR 1/21 · Futuristic 1/120",
  lede: "Thirty years of Pokémon in one set. Every card is foil, every pack has one of 30 Pikachu, and the chrome Futuristic Mew ex and Mewtwo ex are the chase.",
  slots: celebrationSlots({
    double: 0.25,
    ir: 0.2,
    classic: 0.1,
    sir: 1 / 21,
    futuristic: 1 / 120,
    rgb: 1 / 3200,
  }),
  heroIds: ["me55-158", "me55-157", "me55-152", "me55-149"],
  /**
   * Packs that only come inside a product. The Ultra-Premium Collections each
   * add one Classic Collection pack: three etched Classic Collection cards.
   */
  specialPacks: {
    classic: {
      slots: [{ pool: "classic", count: 3 }],
      wrapper: {
        id: "classic",
        name: "Classic Collection",
        tag: "3 classics",
        art: "assets/packs/me55/classic.avif",
        artFallback: "assets/packs/me55/classic.png",
      },
    },
  },
  wrappers: [
    {
      id: "pikachu",
      name: "Pikachu",
      cardId: "me55-23",
      tag: "30 years",
      art: "assets/packs/me55/pikachu.avif",
      artFallback: "assets/packs/me55/pikachu.png",
    },
  ],
};

export const PITCH_BLACK = {
  id: "me5",
  tcgId: "me5",
  name: "Pitch Black",
  edition: "Mega Evolution",
  era: "Mega Evolution",
  released: "July 17, 2026",
  live: true,
  printedTotal: 84,
  totalCount: 130,
  packSize: 11,
  cost: 6.0,
  dataFile: "data/me5.json",
  cardBack: "assets/cards/shared/card-back.webp",
  blurb: "Mega Evolution, July 2026. Ten cards plus a basic Energy. Same odds on every wrapper.",
  oddsLine: "DR 1/5 · UR 1/12 · IR 1/9 · SIR 1/80 · gold 1/1075",
  lede: "Real booster math. Real card scans. Ten cards plus a basic Energy — reverse, a rare slot, and an art slot.",
  slots: megaSlots({ double: 0.2, ultra: 0.083, ir: 0.111, sir: 0.0125, hyper: 0.00093 }),
  heroIds: ["me5-116", "me5-115", "me5-114", "me5-117"],
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
  totalCount: 133,
  packSize: 11,
  cost: 5.64,
  dataFile: "data/me4.json",
  cardBack: "assets/cards/shared/card-back.webp",
  blurb: "Mega Evolution, May 2026. Ten cards plus a basic Energy. Same 11-card math as Pitch Black.",
  oddsLine: "DR 1/5 · UR 1/12 · IR 1/9 · SIR 1/100 · gold 1/1000",
  lede: "Kalos in chaos. Mega Greninja ex headlines four wrappers — same reverse, rare slot, and art slot as the rest of the Mega Evolution block.",
  slots: megaSlots({ double: 0.2, ultra: 0.08, ir: 0.11, sir: 0.01, hyper: 0.001 }),
  heroIds: ["me4-116", "me4-117", "me4-118", "me4-119"],
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

export const PERFECT_ORDER = {
  id: "me3",
  tcgId: "me3",
  name: "Perfect Order",
  edition: "Mega Evolution",
  era: "Mega Evolution",
  released: "March 27, 2026",
  live: true,
  printedTotal: 88,
  totalCount: 133,
  packSize: 11,
  cost: 5.53,
  dataFile: "data/me3.json",
  cardBack: "assets/cards/shared/card-back.webp",
  blurb: "Mega Evolution, March 2026. Ten cards plus a basic Energy. Same 11-card math as Pitch Black.",
  oddsLine: "DR 1/5 · UR 1/12 · IR 1/9 · SIR 1/75 · gold 1/1786",
  lede: "Lumiose in lockstep. Mega Zygarde ex headlines four wrappers — same reverse, rare slot, and art slot as the rest of the Mega Evolution block.",
  slots: megaSlots({ double: 0.2, ultra: 0.083, ir: 0.111, sir: 0.0133, hyper: 0.00056 }),
  heroIds: ["me3-120", "me3-119", "me3-118", "me3-121"],
  wrappers: [
    {
      id: "zygarde",
      name: "Zygarde",
      cardId: "me3-47",
      tag: "The chase",
      art: "assets/packs/me3/zygarde.avif",
      artFallback: "assets/packs/me3/zygarde.png",
    },
    {
      id: "clefable",
      name: "Clefable",
      cardId: "me3-31",
      tag: "Moonlight",
      art: "assets/packs/me3/clefable.avif",
      artFallback: "assets/packs/me3/clefable.png",
    },
    {
      id: "starmie",
      name: "Starmie",
      cardId: "me3-21",
      tag: "Nebula",
      art: "assets/packs/me3/starmie.avif",
      artFallback: "assets/packs/me3/starmie.png",
    },
    {
      id: "meowth",
      name: "Meowth",
      cardId: "me3-62",
      tag: "Street cat",
      art: "assets/packs/me3/meowth.avif",
      artFallback: "assets/packs/me3/meowth.png",
    },
  ],
};


export const ASCENDED_HEROES = {
  id: "me2pt5",
  tcgId: "me2pt5",
  name: "Ascended Heroes",
  edition: "Mega Evolution",
  era: "Mega Evolution",
  released: "January 30, 2026",
  live: true,
  printedTotal: 217,
  totalCount: 302,
  packSize: 11,
  cost: 13.87,
  dataFile: "data/me2pt5.json",
  cardBack: "assets/cards/shared/card-back.webp",
  blurb: "Mega Evolution, January 2026. A special set — one wrapper, and the deepest chase pool in the block.",
  oddsLine: "DR 1/5 · UR 1/21 · IR 1/9 · SIR 1/71 · gold 1/541",
  lede: "295 cards and 22 special arts. Mega Attack Rares share the Ultra Rare slot here, so URs come slower but the gold lands twice as often.",
  // Special set: sold in ETBs and bundles rather than booster boxes, and its
  // Mega Attack Rares displace the UR slot (TCGplayer 2,000+ pack study).
  slots: megaSlots({ double: 0.2, ultra: 0.048, ir: 0.111, sir: 0.014, hyper: 0.00185, megaAttack: 0.035 }),
  heroIds: ["me2pt5-272", "me2pt5-276", "me2pt5-273", "me2pt5-274"],
  wrappers: [
    {
      id: "meganium",
      name: "Meganium",
      cardId: "me2pt5-272",
      tag: "The chase",
      art: "assets/packs/me2pt5/pack-0.avif",
      artFallback: "assets/packs/me2pt5/pack-0.png",
    },
  ],
};

export const PHANTASMAL_FLAMES = {
  id: "me2",
  tcgId: "me2",
  name: "Phantasmal Flames",
  edition: "Mega Evolution",
  era: "Mega Evolution",
  released: "November 14, 2025",
  live: true,
  printedTotal: 94,
  totalCount: 146,
  packSize: 11,
  cost: 11.82,
  dataFile: "data/me2.json",
  cardBack: "assets/cards/shared/card-back.webp",
  blurb: "Mega Evolution, November 2025. Ten cards plus a basic Energy, four wrappers.",
  oddsLine: "DR 1/5 · UR 1/12 · IR 1/9 · SIR 1/80 · gold 1/1259",
  lede: "Mega Charizard X headlines the second Mega Evolution set — the same 11-card math, with the era's longest gold odds.",
  slots: megaSlots({ double: 0.2, ultra: 0.083, ir: 0.111, sir: 0.0125, hyper: 0.000794 }),
  heroIds: ["me2-125", "me2-127", "me2-128", "me2-126"],
  wrappers: [
    {
      id: "charizard",
      name: "Charizard X",
      cardId: "me2-125",
      tag: "The chase",
      art: "assets/packs/me2/pack-0.avif",
      artFallback: "assets/packs/me2/pack-0.png",
    },
    {
      id: "sharpedo",
      name: "Sharpedo",
      cardId: "me2-127",
      tag: "Deep water",
      art: "assets/packs/me2/pack-1.avif",
      artFallback: "assets/packs/me2/pack-1.png",
    },
    {
      id: "lopunny",
      name: "Lopunny",
      cardId: "me2-128",
      tag: "Quick step",
      art: "assets/packs/me2/pack-2.avif",
      artFallback: "assets/packs/me2/pack-2.png",
    },
    {
      id: "rotom",
      name: "Rotom",
      cardId: "me2-126",
      tag: "Short circuit",
      art: "assets/packs/me2/pack-3.avif",
      artFallback: "assets/packs/me2/pack-3.png",
    },
  ],
};

export const MEGA_EVOLUTION = {
  id: "me1",
  tcgId: "me1",
  name: "Mega Evolution",
  edition: "Mega Evolution",
  era: "Mega Evolution",
  released: "September 26, 2025",
  live: true,
  printedTotal: 132,
  totalCount: 204,
  packSize: 11,
  cost: 8.31,
  dataFile: "data/me1.json",
  cardBack: "assets/cards/shared/card-back.webp",
  blurb: "Mega Evolution, September 2025. The set that started the block — four wrappers, 11 cards a pack.",
  oddsLine: "DR 1/5 · UR 1/12 · IR 1/9 · SIR 1/101 · gold 1/1259",
  lede: "Where the block begins. Mega Venusaur, Gardevoir and Lucario head a 188-card set with the era's toughest special-art pull.",
  slots: megaSlots({ double: 0.2091, ultra: 0.0823, ir: 0.1089, sir: 0.0099, hyper: 0.000794 }),
  heroIds: ["me1-177", "me1-178", "me1-179", "me1-180"],
  wrappers: [
    {
      id: "venusaur",
      name: "Venusaur",
      cardId: "me1-177",
      tag: "The chase",
      art: "assets/packs/me1/pack-0.avif",
      artFallback: "assets/packs/me1/pack-0.png",
    },
    {
      id: "gardevoir",
      name: "Gardevoir",
      cardId: "me1-178",
      tag: "Moonblast",
      art: "assets/packs/me1/pack-1.avif",
      artFallback: "assets/packs/me1/pack-1.png",
    },
    {
      id: "lucario",
      name: "Lucario",
      cardId: "me1-179",
      tag: "Aura sphere",
      art: "assets/packs/me1/pack-2.avif",
      artFallback: "assets/packs/me1/pack-2.png",
    },
    {
      id: "absol",
      name: "Absol",
      cardId: "me1-180",
      tag: "Dark omen",
      art: "assets/packs/me1/pack-3.avif",
      artFallback: "assets/packs/me1/pack-3.png",
    },
  ],
};

export const BLACK_BOLT = {
  id: "zsv10pt5",
  tcgId: "zsv10pt5",
  name: "Black Bolt",
  edition: "Scarlet & Violet",
  era: "Scarlet & Violet",
  released: "July 18, 2025",
  live: true,
  printedTotal: 86,
  totalCount: 176,
  packSize: 11,
  cost: 14.69,
  dataFile: "data/zsv10pt5.json",
  cardBack: "assets/cards/shared/card-back.webp",
  reverseFoil: "pokeball",
  blurb: "Scarlet & Violet, July 2025. Unova's black half — one wrapper, Poké Ball reverses, and the Black White Rare chase.",
  oddsLine: "DR 1/5 · UR 1/16 · IR 1/6 · SIR 1/76 · BWR 1/496",
  lede: "Every Unova Pokémon here is an Illustration Rare or better in the secret slot. Zekrom's Black White Rare is the one people hunt.",
  slots: svSpecialSlots({
    double: 0.2,
    ultra: 0.0625,
    ir: 0.1667,
    sir: 0.01316,
    bwr: 0.00202,
    pokeball: 0.3333,
    masterball: 0.0667,
  }),
  heroIds: ["zsv10pt5-172", "zsv10pt5-166", "zsv10pt5-171", "zsv10pt5-164"],
  wrappers: [
    {
      id: "zekrom",
      name: "Zekrom",
      cardId: "zsv10pt5-166",
      tag: "The chase",
      art: "assets/packs/zsv10pt5/zekrom.avif",
      artFallback: "assets/packs/zsv10pt5/zekrom.png",
    },
  ],
};

export const WHITE_FLARE = {
  id: "rsv10pt5",
  tcgId: "rsv10pt5",
  name: "White Flare",
  edition: "Scarlet & Violet",
  era: "Scarlet & Violet",
  released: "July 18, 2025",
  live: true,
  printedTotal: 86,
  totalCount: 176,
  packSize: 11,
  cost: 13.43,
  dataFile: "data/rsv10pt5.json",
  cardBack: "assets/cards/shared/card-back.webp",
  reverseFoil: "pokeball",
  blurb: "Scarlet & Violet, July 2025. Unova's white half — one wrapper, Poké Ball reverses, Reshiram on the front.",
  oddsLine: "DR 1/5 · UR 1/16 · IR 1/6 · SIR 1/76 · BWR 1/496",
  lede: "The other half of the Unova split. Reshiram's Black White Rare sits at the top of a 173-card list with a Poké Ball reverse in every third pack.",
  slots: svSpecialSlots({
    double: 0.2,
    ultra: 0.0625,
    ir: 0.1667,
    sir: 0.01316,
    bwr: 0.00202,
    pokeball: 0.3333,
    masterball: 0.0667,
  }),
  heroIds: ["rsv10pt5-173", "rsv10pt5-166", "rsv10pt5-172", "rsv10pt5-167"],
  wrappers: [
    {
      id: "reshiram",
      name: "Reshiram",
      cardId: "rsv10pt5-166",
      tag: "The chase",
      art: "assets/packs/rsv10pt5/reshiram.avif",
      artFallback: "assets/packs/rsv10pt5/reshiram.png",
    },
  ],
};

export const DESTINED_RIVALS = {
  id: "sv10",
  tcgId: "sv10",
  name: "Destined Rivals",
  edition: "Scarlet & Violet",
  era: "Scarlet & Violet",
  released: "May 30, 2025",
  live: true,
  printedTotal: 182,
  totalCount: 266,
  packSize: 11,
  cost: 9.13,
  dataFile: "data/sv10.json",
  cardBack: "assets/cards/shared/card-back.webp",
  blurb: "Scarlet & Violet, May 2025. Team Rocket against Cynthia, Ethan and the old champions — Trainer’s Pokémon, four wrappers.",
  oddsLine: "DR 1/5 · UR 1/16 · IR 1/12 · SIR 1/94 · gold 1/149",
  lede: "Team Rocket’s Mewtwo ex SIR is the chase, about 1 in 1,033 packs. Holo Rares and ex shine around the Pokémon and the owner’s portrait, as the printed cards do.",
  // TCGplayer's 8,000-pack study (May 2025), unrounded: DR 19.83%, UR 6.39%,
  // IR 8.29%, SIR 1.06%, Hyper Rare 0.67%. No ACE SPEC in this set.
  slots: svSlots({ double: 0.1983, ultra: 0.0639, ir: 0.0829, sir: 0.0106, hyper: 0.0067 }),
  heroIds: ["sv10-231", "sv10-232", "sv10-230", "sv10-238"],
  wrappers: boosterWrappers("sv10", [
    { id: "garchomp", name: "Garchomp", cardId: "sv10-232", tag: "Cynthia" },
    { id: "ho-oh", name: "Ho-Oh", cardId: "sv10-230", tag: "Ethan" },
    { id: "mewtwo", name: "Mewtwo", cardId: "sv10-231", tag: "The chase" },
    { id: "rocket", name: "Team Rocket", cardId: "sv10-237", tag: "Rocket" },
  ]),
};

/**
 * Journey Together rates are TCGplayer's own: the Authentication Center opened
 * more than 8,000 English packs for launch (article of Mar 28 2025, updated
 * May 29 2025). DR 20.29%, UR 6.54% (both in the rare slot), IR 8.50%, SIR
 * 1.16% and gold 0.73% (in the second reverse slot). No ACE SPEC in this set.
 * Sources are in data/pullrates.json.
 */
export const JOURNEY_TOGETHER = {
  id: "sv9",
  tcgId: "sv9",
  name: "Journey Together",
  edition: "Scarlet & Violet",
  era: "Scarlet & Violet",
  released: "March 28, 2025",
  live: true,
  printedTotal: 159,
  // 190 cards plus the 18 promos its boxes and blisters carry.
  totalCount: 208,
  packSize: 11,
  cost: 6.76,
  dataFile: "data/sv9.json",
  cardBack: "assets/cards/shared/card-back.webp",
  blurb: "Scarlet & Violet, March 2025. N, Lillie, Iono and Hop bring their own Pokémon, four wrappers.",
  oddsLine: "DR 1/5 · UR 1/15 · IR 1/12 · SIR 1/86 · gold 1/137",
  lede: "Trainer’s Pokémon are back. N’s Zoroark, Iono’s Bellibolt and Lillie’s Clefairy head a 190-card list, and the Clefairy special art is the one to chase.",
  slots: svSlots({ double: 0.2029, ultra: 0.0654, ir: 0.085, sir: 0.0116, hyper: 0.0073 }),
  heroIds: ["sv9-184", "sv9-185", "sv9-183", "sv9-186"],
  wrappers: boosterWrappers("sv9", [
    { id: "zacian", name: "Zacian", cardId: "sv9-186", tag: "Hop" },
    { id: "bellibolt", name: "Bellibolt", cardId: "sv9-183", tag: "Iono" },
    { id: "clefairy", name: "Clefairy", cardId: "sv9-184", tag: "The chase" },
    { id: "zoroark", name: "Zoroark", cardId: "sv9-185", tag: "N" },
  ]),
};

export const PRISMATIC_EVOLUTIONS = {
  id: "sv8pt5",
  tcgId: "sv8pt5",
  name: "Prismatic Evolutions",
  edition: "Scarlet & Violet",
  era: "Scarlet & Violet",
  released: "January 17, 2025",
  live: true,
  printedTotal: 131,
  // 180 numbered cards, 167 Poké Ball and Master Ball prints, 23 box promos.
  totalCount: 370,
  packSize: 11,
  cost: 14.3,
  dataFile: "data/sv8pt5.json",
  cardBack: "assets/cards/shared/card-back.webp",
  blurb: "Scarlet & Violet, January 2025. Eeveelutions, no Illustration Rares, and Poké Ball and Master Ball prints of the base cards.",
  oddsLine: "Poké Ball 1/3 · DR 1/6 · UR 1/13 · Master Ball 1/20 · ACE 1/21 · SIR 1/45 · gold 1/179",
  lede: "Every Common, Uncommon and Rare comes in a Poké Ball pattern, and every Pokémon among them in a Master Ball one. Each print is its own card with its own price.",
  slots: prismaticSlots({
    double: 0.1651,
    ultra: 0.0746,
    ace: 0.0468,
    sir: 0.0222,
    hyper: 0.0056,
    pokeball: 0.331,
    masterball: 0.0492,
  }),
  heroIds: ["sv8pt5-161", "sv8pt5-155", "sv8pt5-167", "sv8pt5-156"],
  wrappers: boosterWrappers("sv8pt5", [
    { id: "jolteon", name: "Jolteon", cardId: "sv8pt5-153", tag: "Kanto trio" },
    { id: "eevee", name: "Eevee", cardId: "sv8pt5-167", tag: "Sylveon" },
    // Umbreon ex's Special Illustration Rare is the set's chase card.
    { id: "umbreon", name: "Umbreon", cardId: "sv8pt5-161", tag: "The chase" },
    { id: "glaceon", name: "Glaceon", cardId: "sv8pt5-150", tag: "Leafeon" },
  ]),
};

export const SURGING_SPARKS = {
  id: "sv8",
  tcgId: "sv8",
  name: "Surging Sparks",
  edition: "Scarlet & Violet",
  era: "Scarlet & Violet",
  released: "November 8, 2024",
  live: true,
  printedTotal: 191,
  totalCount: 262,
  packSize: 11,
  cost: 8.42,
  dataFile: "data/sv8.json",
  cardBack: "assets/cards/shared/card-back.webp",
  blurb: "Scarlet & Violet, November 2024. Stellar Tera Pikachu ex, crystal Tera foils and ACE SPECs, four wrappers.",
  oddsLine: "DR 1/6 · UR 1/15 · ACE 1/20 · IR 1/13 · SIR 1/87 · gold 1/188",
  lede: "Pikachu ex went Stellar Tera and became the chase. ACE SPEC takes the first reverse slot, and IR, SIR and gold share the second.",
  // TCGplayer's study of 8,000+ English packs (sources in data/pullrates.json).
  slots: svSlots({ double: 0.1694, ultra: 0.0674, ir: 0.0767, sir: 0.0115, hyper: 0.0053, ace: 0.0503 }),
  heroIds: ["sv8-238", "sv8-239", "sv8-241", "sv8-242"],
  wrappers: boosterWrappers("sv8", [
    { id: "pikachu", name: "Pikachu", cardId: "sv8-238", tag: "The chase" },
    { id: "latias", name: "Latias", cardId: "sv8-239", tag: "Eon" },
    { id: "archaludon", name: "Archaludon", cardId: "sv8-241", tag: "Bridge" },
    { id: "exeggutor", name: "Exeggutor", cardId: "sv8-242", tag: "Alola" },
  ]),
};

export const STELLAR_CROWN = {
  id: "sv7",
  tcgId: "sv7",
  name: "Stellar Crown",
  edition: "Scarlet & Violet",
  era: "Scarlet & Violet",
  released: "September 13, 2024",
  live: true,
  printedTotal: 142,
  totalCount: 188,
  packSize: 11,
  cost: 10.63,
  dataFile: "data/sv7.json",
  cardBack: "assets/cards/shared/card-back.webp",
  blurb: "Scarlet & Violet, September 2024. Terapagos and the Stellar Tera Pokémon ex, four wrappers.",
  oddsLine: "DR 1/6 · UR 1/15 · ACE 1/20 · IR 1/13 · SIR 1/90 · gold 1/137",
  lede: "Terapagos takes the crown with Cinderace, Lapras and Galvantula as Stellar Tera ex, printed in crystal foil edge to edge. Only 33 secret rares, so each one comes easier than in the sets around it.",
  // TCGplayer's 8,000-pack study (Sep 2024): DR 16.90%, UR 6.75%, ACE SPEC
  // 4.94% (first reverse slot), IR 7.79%, SIR 1.11%, Hyper Rare 0.73%
  // (second reverse slot). Source and date in data/pullrates.json; Dachsbun
  // ex's short print is its `pullWeight` in data/sv7.json.
  slots: svSlots({ double: 0.169, ultra: 0.0675, ir: 0.0779, sir: 0.0111, hyper: 0.0073, ace: 0.0494 }),
  heroIds: ["sv7-170", "sv7-148", "sv7-169", "sv7-173"],
  wrappers: boosterWrappers("sv7", [
    { id: "terapagos", name: "Terapagos", cardId: "sv7-170", tag: "The chase" },
    { id: "lapras", name: "Lapras", cardId: "sv7-32", tag: "Ferry" },
    { id: "galvantula", name: "Galvantula", cardId: "sv7-51", tag: "Electroweb" },
    { id: "cinderace", name: "Cinderace", cardId: "sv7-28", tag: "Pyro ball" },
  ]),
};

export const SHROUDED_FABLE = {
  id: "sv6pt5",
  tcgId: "sv6pt5",
  name: "Shrouded Fable",
  edition: "Scarlet & Violet",
  era: "Scarlet & Violet",
  released: "August 2, 2024",
  live: true,
  printedTotal: 64,
  totalCount: 113,
  packSize: 11,
  cost: 14.49,
  dataFile: "data/sv6pt5.json",
  cardBack: "assets/cards/shared/card-back.webp",
  reverseFoil: "chain",
  blurb: "Scarlet & Violet, August 2024. Pecharunt and the Loyal Three: a 99-card special set with its own chained Poké Ball reverse holo, four wrappers.",
  oddsLine: "DR 1/6 · UR 1/14 · ACE 1/20 · IR 1/12 · SIR 1/67 · gold 1/128",
  lede: "Kitakami’s Loyal Three plus Pecharunt. Every reverse holo wears Poké Balls in chains, and the basic Energy can come reverse holo too.",
  // Rates: data/pullrates.json (Dripshop, Mark van Zee's 2,354 packs and
  // ThePriceDex; the middle of the three for each). The reverse holo Energy
  // rate is an estimate, since no study counts it.
  slots: chainSlots({ double: 0.1667, ultra: 0.0694, ir: 0.0833, sir: 0.0149, hyper: 0.0078, ace: 0.05 }, 0.1667),
  heroIds: ["sv6pt5-93", "sv6pt5-92", "sv6pt5-91", "sv6pt5-90"],
  wrappers: boosterWrappers("sv6pt5", [
    { id: "okidogi", name: "Okidogi", cardId: "sv6pt5-90", tag: "Loyal" },
    { id: "munkidori", name: "Munkidori", cardId: "sv6pt5-91", tag: "Three" },
    { id: "fezandipiti", name: "Fezandipiti", cardId: "sv6pt5-92", tag: "Toxic chain" },
    { id: "pecharunt", name: "Pecharunt", cardId: "sv6pt5-93", tag: "The chase" },
  ]),
};

export const TWILIGHT_MASQUERADE = {
  id: "sv6",
  tcgId: "sv6",
  name: "Twilight Masquerade",
  edition: "Scarlet & Violet",
  era: "Scarlet & Violet",
  released: "May 24, 2024",
  live: true,
  printedTotal: 167,
  totalCount: 236,
  packSize: 11,
  cost: 9.23,
  dataFile: "data/sv6.json",
  cardBack: "assets/cards/shared/card-back.webp",
  blurb: "Scarlet & Violet, May 2024. Ogerpon’s four masks and the Kitakami festival, four wrappers.",
  oddsLine: "DR 1/6 · UR 1/15 · ACE 1/20 · IR 1/13 · SIR 1/86 · gold 1/146",
  lede: "Greninja ex’s Special Illustration Rare is the chase. Tera ex print in full-card etched foil, ACE SPEC takes the first reverse slot, gold lands 1 in 146.",
  /*
   * TCGplayer opened 8,000+ English packs before release (May 2024): DR
   * 16.93%, UR 6.61%, ACE SPEC 5.06%, IR 7.73%, SIR 1.17%, Hyper Rare 0.68%
   * per pack. Sources in data/pullrates.json.
   */
  slots: svSlots({ double: 0.1693, ultra: 0.0661, ir: 0.0773, sir: 0.0117, hyper: 0.0068, ace: 0.0506 }),
  heroIds: ["sv6-214", "sv6-211", "sv6-216", "sv6-210"],
  // The four booster pack arts, in the order of assets/packs/sv6/pack-N.
  wrappers: boosterWrappers("sv6", [
    { id: "sinistcha", name: "Sinistcha", cardId: "sv6-210", tag: "Matcha" },
    { id: "ogerpon", name: "Ogerpon", cardId: "sv6-211", tag: "Teal mask" },
    { id: "dragapult", name: "Dragapult", cardId: "sv6-200", tag: "Phantom dive" },
    { id: "ursaluna", name: "Ursaluna", cardId: "sv6-216", tag: "Bloodmoon" },
  ]),
};

/**
 * Temporal Forces: odds from TCGplayer's 8,000-pack study (Peter Day, March
 * 2024, 95% intervals): DR 16.83%, UR 6.67%, ACE SPEC 5.00% (first reverse
 * slot), IR 7.72%, SIR 1.17%, Hyper Rare 0.72%. Sources in data/pullrates.json.
 */
export const TEMPORAL_FORCES = {
  id: "sv5",
  tcgId: "sv5",
  name: "Temporal Forces",
  edition: "Scarlet & Violet",
  era: "Scarlet & Violet",
  released: "March 22, 2024",
  live: true,
  printedTotal: 162,
  totalCount: 232,
  packSize: 11,
  cost: 9.37,
  dataFile: "data/sv5.json",
  cardBack: "assets/cards/shared/card-back.webp",
  blurb: "Scarlet & Violet, March 2024. Walking Wake, Iron Leaves, and the first ACE SPEC cards.",
  oddsLine: "DR 1/6 · UR 1/15 · ACE 1/20 · IR 1/13 · SIR 1/86 · gold 1/139",
  lede: "Where ACE SPEC starts. The art slot is the hardest of the block — SIR at 1/86, gold at 1/139.",
  slots: svSlots({ double: 0.1683, ultra: 0.0667, ir: 0.0772, sir: 0.0117, hyper: 0.0072, ace: 0.05 }),
  heroIds: ["sv5-205", "sv5-208", "sv5-203", "sv5-206"],
  wrappers: boosterWrappers("sv5", [
    { id: "walking-wake", name: "Walking Wake", cardId: "sv5-205", tag: "The chase" },
    { id: "raging-bolt", name: "Raging Bolt", cardId: "sv5-208", tag: "Ancient" },
    { id: "iron-leaves", name: "Iron Leaves", cardId: "sv5-203", tag: "Future" },
    { id: "iron-crown", name: "Iron Crown", cardId: "sv5-206", tag: "Paradox" },
  ]),
};

export const PALDEAN_FATES = {
  id: "sv4pt5",
  tcgId: "sv4pt5",
  name: "Paldean Fates",
  edition: "Scarlet & Violet",
  era: "Scarlet & Violet",
  released: "January 26, 2024",
  live: true,
  printedTotal: 91,
  totalCount: 264,
  packSize: 11,
  cost: 24.89,
  dataFile: "data/sv4pt5.json",
  cardBack: "assets/cards/shared/card-back.webp",
  blurb: "Scarlet & Violet, January 2024. The Shiny Vault set: 132 Shiny Pokémon, four wrappers, 11 cards a pack.",
  oddsLine: "DR 1/6 · UR 1/15 · Shiny 1/4 · Shiny ex 1/13 · IR 1/14 · SIR 1/58 · gold 1/62",
  lede: "One pack in three trades its first reverse holo for a Shiny Pokémon, from 132 of them. Mew ex's special illustration is the chase.",
  slots: shinyVaultSlots({
    double: 0.1589,
    ultra: 0.0661,
    shiny: 0.2544,
    shinyUltra: 0.0772,
    ir: 0.0722,
    sir: 0.0172,
    hyper: 0.0161,
  }),
  heroIds: ["sv4pt5-232", "sv4pt5-234", "sv4pt5-233", "sv4pt5-131"],
  wrappers: [
    {
      id: "pikachu",
      name: "Pikachu",
      cardId: "sv4pt5-131",
      tag: "The chase",
      art: "assets/packs/sv4pt5/pikachu.avif",
      artFallback: "assets/packs/sv4pt5/pikachu.png",
    },
    {
      id: "tinkaton",
      name: "Tinkaton",
      cardId: "sv4pt5-167",
      tag: "Big hammer",
      art: "assets/packs/sv4pt5/tinkaton.avif",
      artFallback: "assets/packs/sv4pt5/tinkaton.png",
    },
    {
      id: "dondozo",
      name: "Dondozo",
      cardId: "sv4pt5-126",
      tag: "Deep sea",
      art: "assets/packs/sv4pt5/dondozo.avif",
      artFallback: "assets/packs/sv4pt5/dondozo.png",
    },
    {
      id: "ceruledge",
      name: "Ceruledge",
      cardId: "sv4pt5-162",
      tag: "Blue flame",
      art: "assets/packs/sv4pt5/ceruledge.avif",
      artFallback: "assets/packs/sv4pt5/ceruledge.png",
    },
  ],
};

/**
 * Obsidian Flames. Rates from TCGplayer's Authentication Center study of
 * 8,000+ English packs (Aug 2023): DR 13.61%, UR 6.63%, IR 7.60%, SIR 3.13%,
 * gold 1.92%. Before ACE SPEC, so the first reverse slot is always a reverse.
 * Sources are in data/pullrates.json.
 */
export const OBSIDIAN_FLAMES = {
  id: "sv3",
  tcgId: "sv3",
  name: "Obsidian Flames",
  edition: "Scarlet & Violet",
  era: "Scarlet & Violet",
  released: "August 11, 2023",
  live: true,
  printedTotal: 197,
  totalCount: 240,
  packSize: 11,
  cost: 13.05,
  dataFile: "data/sv3.json",
  cardBack: "assets/cards/shared/card-back.webp",
  blurb: "Scarlet & Violet, August 2023. Tera Charizard ex in Darkness, four wrappers, and only six Special Illustration Rares.",
  oddsLine: "DR 1/7 · UR 1/15 · IR 1/13 · SIR 1/32 · gold 1/52",
  lede: "A SIR every 32 packs, and one in six of them is the dark Charizard. Tera ex are printed in etched crystal foil; the rest is a standard Paldea pack.",
  slots: svSlots({ double: 0.1361, ultra: 0.0663, ir: 0.076, sir: 0.0313, hyper: 0.0192 }),
  heroIds: ["sv3-223", "sv3-228", "sv3-225", "sv3-215"],
  wrappers: [
    ["charizard", "Charizard", "sv3-125", "The chase"],
    ["tyranitar", "Tyranitar", "sv3-66", "Tera"],
    ["dragonite", "Dragonite", "sv3-159", "Mighty meteor"],
    ["revavroom", "Revavroom", "sv3-156", "Starmobile"],
  ].map(([id, name, cardId, tag]) => ({
    id,
    name,
    cardId,
    tag,
    art: `assets/packs/sv3/${id}.avif`,
    artFallback: `assets/packs/sv3/${id}.png`,
  })),
};

export const PALDEA_EVOLVED = {
  id: "sv2",
  tcgId: "sv2",
  name: "Paldea Evolved",
  edition: "Scarlet & Violet",
  era: "Scarlet & Violet",
  released: "June 9, 2023",
  live: true,
  printedTotal: 193,
  totalCount: 289,
  packSize: 11,
  cost: 15.56,
  dataFile: "data/sv2.json",
  cardBack: "assets/cards/shared/card-back.webp",
  blurb: "Scarlet & Violet, June 2023. The Paldea starters grow into ex, Iono gets her Special Illustration Rare, five wrappers.",
  oddsLine: "DR 1/7 · UR 1/15 · IR 1/13 · SIR 1/32 · gold 1/57",
  lede: "The biggest early Scarlet & Violet set: 279 cards, 36 of them Illustration Rares, and the Magikarp everyone hunts. Tera ex print on etched foil, gold lands in 1 of 57 packs.",
  /**
   * TCGplayer Authentication Center, 8,000+ English packs (June 2023):
   * DR 13.72%, UR 6.64% in the rare slot; IR 7.70%, SIR 3.17%, Hyper Rare
   * 1.76% in the second reverse slot. No ACE SPEC yet. data/pullrates.json.
   */
  slots: svSlots({ double: 0.1372, ultra: 0.0664, ir: 0.077, sir: 0.0317, hyper: 0.0176 }),
  heroIds: ["sv2-203", "sv2-269", "sv2-262", "sv2-211"],
  wrappers: boosterWrappers("sv2", [
    { id: "ting-lu", name: "Ting-Lu", cardId: "sv2-263", tag: "Ruinous" },
    { id: "skeledirge", name: "Skeledirge", cardId: "sv2-258", tag: "Fire starter" },
    { id: "quaquaval", name: "Quaquaval", cardId: "sv2-260", tag: "Water starter" },
    { id: "meowscarada", name: "Meowscarada", cardId: "sv2-256", tag: "Grass starter" },
    { id: "chien-pao", name: "Chien-Pao", cardId: "sv2-261", tag: "Ruinous" },
  ]),
};

export const SCARLET_VIOLET = {
  id: "sv1",
  tcgId: "sv1",
  name: "Scarlet & Violet",
  edition: "Scarlet & Violet",
  era: "Scarlet & Violet",
  released: "March 31, 2023",
  live: true,
  printedTotal: 198,
  totalCount: 270,
  packSize: 11,
  cost: 9.1,
  dataFile: "data/sv1.json",
  cardBack: "assets/cards/shared/card-back.webp",
  blurb: "Scarlet & Violet, March 2023. Paldea's first set — Koraidon, Miraidon, Tera ex, and the first Illustration Rares.",
  oddsLine: "DR 1/7 · UR 1/15 · IR 1/13 · SIR 1/32 · gold 1/54",
  lede: "Where the era starts: lowercase ex, etched Tera full arts, and an art slot far kinder than later sets — SIR at 1/32, gold at 1/54. Gardevoir ex's Special Illustration Rare is the chase.",
  slots: svSlots({ double: 0.1376, ultra: 0.0657, ir: 0.0767, sir: 0.0315, hyper: 0.0185 }),
  heroIds: ["sv1-245", "sv1-244", "sv1-247", "sv1-251"],
  wrappers: boosterWrappers("sv1", [
    { id: "starters", name: "Sprigatito, Fuecoco & Quaxly", cardId: "sv1-13", tag: "Paldea" },
    { id: "miraidon", name: "Miraidon", cardId: "sv1-244", tag: "Violet" },
    { id: "gyarados", name: "Gyarados", cardId: "sv1-225", tag: "Tera" },
    { id: "koraidon", name: "Koraidon", cardId: "sv1-247", tag: "Scarlet" },
  ]),
};

export const PLAYABLE_SETS = [
  CELEBRATION_30TH,
  PITCH_BLACK,
  CHAOS_RISING,
  PERFECT_ORDER,
  ASCENDED_HEROES,
  PHANTASMAL_FLAMES,
  MEGA_EVOLUTION,
  BLACK_BOLT,
  WHITE_FLARE,
  DESTINED_RIVALS,
  JOURNEY_TOGETHER,
  SURGING_SPARKS,
  TWILIGHT_MASQUERADE,
  TEMPORAL_FORCES,
  PALDEAN_FATES,
  OBSIDIAN_FLAMES,
  STELLAR_CROWN,
  PALDEA_EVOLVED,
  SHROUDED_FABLE,
  SCARLET_VIOLET,
  PRISMATIC_EVOLUTIONS,
];

/**
 * Live once, not any more. Their definitions stay reachable through SET_BY_ID
 * so cards people already pulled still name, price, sell, and render — they
 * simply cannot be opened and do not appear in the catalog. Scarlet & Violet
 * sits here until its scans and checklists are rebuilt; moving a set back is
 * a matter of returning it to PLAYABLE_SETS and dropping its ROADMAP row.
 */
export const RETIRED_SETS = [
];

export const ALL_SETS = [...PLAYABLE_SETS, ...RETIRED_SETS];
export const SET_BY_ID = Object.fromEntries(ALL_SETS.map((set) => [set.id, set]));
export const DEFAULT_SET_ID = PITCH_BLACK.id;
export const LIVE_SET = PITCH_BLACK;

export function getSet(id) {
  return SET_BY_ID[id] || SET_BY_ID[DEFAULT_SET_ID];
}

/**
 * Playable sets folded into their ROADMAP era, then the queued remainder.
 * Catalog and the Packs rail both use this so a live Scarlet & Violet set
 * lands under that heading instead of always on Mega Evolution.
 */
export function erasWithSets() {
  const liveByEra = new Map();
  for (const set of PLAYABLE_SETS) {
    const key = set.era || set.edition;
    if (!liveByEra.has(key)) liveByEra.set(key, []);
    liveByEra.get(key).push(set);
  }
  const blocks = ROADMAP.map((block) => {
    const live = liveByEra.get(block.era) || [];
    liveByEra.delete(block.era);
    return { era: block.era, live, queued: block.sets, sets: [...live, ...block.sets] };
  });
  for (const [era, live] of liveByEra) {
    blocks.unshift({ era, live, queued: [], sets: live });
  }
  return blocks.filter((block) => block.sets.length);
}

/** Newest English sets first, then back toward Base Set. Playable sets omitted. */
export const ROADMAP = [
  {
    era: "Mega Evolution",
    sets: [
    ],
  },
  {
    era: "Scarlet & Violet",
    sets: [
      { id: "sv4", name: "Paradox Rift", released: "Nov 2023", cards: "—" },
      { id: "sv3pt5", name: "151", released: "Sep 2023", cards: "—" },
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
const SCRYDEX_LOGO = new Set(["me2pt5", "me3", "me4", "me5", "me55"]);

const LIMITLESS_SYMBOL = {
  me2pt5: "ASC",
  me3: "POR",
  me4: "CRI",
  me5: "PBL",
};

export function tcgSetId(set) {
  return set.tcgId || TCG_ID_ALIAS[set.id] || set.id;
}

/**
 * Set logo + symbol for catalog identity art (not booster wrappers).
 *
 * Served from our own assets — scripts/mirror_images.py downloads these and
 * reads SCRYDEX_LOGO / LIMITLESS_SYMBOL above to know where each one comes
 * from, so those maps stay here as the source of truth for re-fetching.
 */
export function setIdentity(set) {
  const id = tcgSetId(set);
  return {
    id,
    logo: `assets/cards/sets/${id}-logo.webp`,
    symbol: `assets/cards/sets/${id}-symbol.webp`,
  };
}

export function rarityKey(rarity) {
  return String(rarity).toLowerCase().replace(/\s+/g, "-");
}
