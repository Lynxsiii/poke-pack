import { homeSetId, MEP_SET_ID, PROMO_HOMES, promoHomeOf, XYP_SET_ID } from "./card-home.js";

export const RARITY_ORDER = [
  "Energy",
  "Common",
  "Uncommon",
  "Rare",
  // Sword & Shield: the holo Rare is its own rarity (the plain Rare is not
  // foil), then the V line, the special sets' finishes and the secret rares.
  "Rare Holo",
  // Sun & Moon: the GX and the Prism Star sit just above the holo Rare, the
  // Shining Pokémon and the two Shiny Vault finishes beside Rare Shiny.
  "Rare Holo GX",
  "Rare Prism Star",
  // XY: the Pokémon-EX (Mega EX included) and the BREAK sit with the GX line,
  // the full art is Rare Ultra and the gold or shiny secret Rare Secret.
  "Rare Holo EX",
  "Rare BREAK",
  "Rare Holo V",
  "Rare Holo VMAX",
  "Rare Holo VSTAR",
  "Amazing Rare",
  "Radiant Rare",
  "Rare Shining",
  "Rare Shiny",
  "Rare Shiny GX",
  "Trainer Gallery Rare Holo",
  "Rare Ultra",
  "Rare Rainbow",
  "Rare Secret",
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
  "Rare Holo": "Rare holo",
  "Rare Holo GX": "Pokémon-GX",
  "Rare Prism Star": "Prism Star",
  "Rare Holo EX": "Pokémon-EX",
  "Rare BREAK": "BREAK",
  "Rare Shining": "Shining Pokémon",
  "Rare Shiny GX": "Shiny Vault GX",
  "Rare Holo V": "Pokémon V",
  "Rare Holo VMAX": "Pokémon VMAX",
  "Rare Holo VSTAR": "Pokémon VSTAR",
  "Amazing Rare": "Amazing rare",
  "Radiant Rare": "Radiant rare",
  "Rare Shiny": "Shiny Vault",
  "Trainer Gallery Rare Holo": "Trainer Gallery",
  "Rare Ultra": "Ultra rare",
  "Rare Rainbow": "Rainbow rare",
  "Rare Secret": "Secret rare",
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
  // Sword & Shield printed one black star on every rare-or-better card;
  // the hollow and coloured pips here tell the finishes apart in filters.
  "Rare Holo": { pips: [["★", "ink"]], group: "expanded" },
  // Sun & Moon: a black star on every rare-or-better card, a hollow shiny one
  // on the Shiny Vault, as Sword & Shield filed them.
  "Rare Holo GX": { pips: [["★", "ink"]], group: "expanded" },
  "Rare Prism Star": { pips: [["★", "silver"]], group: "expanded" },
  // XY printed a black star on every rare-or-better card; BREAK's is silver.
  "Rare Holo EX": { pips: [["★", "ink"]], group: "expanded" },
  "Rare BREAK": { pips: [["★", "silver"]], group: "expanded" },
  "Rare Shining": { pips: [["☆", "shiny"]], group: "expanded" },
  "Rare Shiny GX": { pips: [["☆", "shiny"]], group: "expanded" },
  "Rare Holo V": { pips: [["★", "ink"]], group: "expanded" },
  "Rare Holo VMAX": { pips: [["★", "ink"]], group: "expanded" },
  "Rare Holo VSTAR": { pips: [["★", "ink"]], group: "expanded" },
  "Amazing Rare": { pips: [["★", "rgbB"]], group: "expanded" },
  "Radiant Rare": { pips: [["★", "silver"]], group: "expanded" },
  "Rare Shiny": { pips: [["☆", "shiny"]], group: "expanded" },
  "Trainer Gallery Rare Holo": { pips: [["★", "gold"]], group: "expanded" },
  "Rare Ultra": { pips: [["☆", "silver"]], group: "expanded" },
  "Rare Rainbow": { pips: [["☆", "gold"]], group: "expanded" },
  "Rare Secret": { pips: [["☆", "gold"], ["☆", "gold"]], group: "expanded" },
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
  "Rare Holo": 0.4,
  "Rare Holo GX": 6.8,
  "Rare Prism Star": 5,
  // XY: medians of pkmn.gg's market prices over xy1 to xy12 (2026-10-01).
  "Rare Holo EX": 11,
  "Rare BREAK": 4.25,
  "Rare Shining": 34,
  "Rare Shiny GX": 26,
  "Rare Holo V": 1.2,
  "Rare Holo VMAX": 3,
  "Rare Holo VSTAR": 3,
  "Amazing Rare": 5,
  "Radiant Rare": 3,
  "Rare Shiny": 3,
  "Trainer Gallery Rare Holo": 4,
  "Rare Ultra": 8,
  "Rare Rainbow": 15,
  "Rare Secret": 15,
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
  bundle: { short: "Bundle", noun: "bundle" },
  // A promo handed out on its own (a tournament reward, a museum or store
  // giveaway), sold as the card alone at its market price.
  event: { short: "Promo", noun: "promo" },
  bundle: { short: "Bundle", noun: "bundle" },
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
 * `pick` how many of them one box holds when it is not all of them (`groupOf`:
 * in fixed runs, see drawPromos in js/engine.js).
 */
export function promoOffers(products = []) {
  const standard = new Set(SEALED_PRODUCTS.map((product) => product.id));
  return (products || []).flatMap((item) => {
    if (standard.has(item.id) || !(typeof item.price === "number" && item.price > 0)) return [];
    const promos = Array.isArray(item.promos) ? item.promos : [];
    const from = packsFrom(item);
    const packs = from
      ? Object.values(from).reduce((sum, n) => sum + n, 0)
      : Math.max(0, Math.floor(Number(item.packs) || 0));
    if (!packs && !promos.length) return [];
    const words = PRODUCT_KINDS[item.kind] || PRODUCT_KINDS.collection;
    return [{
      id: String(item.id),
      name: String(item.name),
      kind: item.kind || "collection",
      ...words,
      packs,
      ...(from ? { from } : {}),
      ...(item.note ? { note: String(item.note) } : {}),
      special: item.special && typeof item.special === "object" ? item.special : {},
      promos,
      pick: promoPick(item),
      ...(item.groupOf ? { groupOf: Math.floor(Number(item.groupOf) || 0) } : {}),
      price: money(item.price),
      image: item.image || "",
      released: item.released || "",
    }];
  });
}

/**
 * `{ setId: packs }` for a product whose boosters come from other sets (the
 * SV Black Star Promos' tins and ex boxes), or null when they are the selling
 * set's own.
 */
function packsFrom(item) {
  if (!item?.from || typeof item.from !== "object") return null;
  const out = {};
  for (const [setId, n] of Object.entries(item.from)) {
    const count = Math.max(0, Math.floor(Number(n) || 0));
    if (count) out[String(setId)] = count;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * The boosters an offer opens, as `[{ set, count }]`. A product with `from`
 * opens those sets' packs; any other opens its own set's. Null when a set it
 * needs is not playable yet, so the shop hides it and the Worker refuses it
 * until that set goes live.
 */
export function offerPackSets(offer, set) {
  if (offer?.from) {
    const out = [];
    for (const [id, count] of Object.entries(offer.from)) {
      const packSet = PLAYABLE_SETS.find((item) => item.id === id);
      if (!packSet?.wrappers?.length) return null;
      out.push({ set: packSet, count });
    }
    return out;
  }
  return offer?.packs ? [{ set, count: offer.packs }] : [];
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

/**
 * The single cards a box holds beyond its packs and promos: a battle deck's
 * other 59 cards, an ETB's Energy. `entry` is one row of data/box-contents.json
 * (scripts/build_box_contents.py writes it and documents each field):
 *
 *  - `cards`: `[[id, n]]`, always in the box.
 *  - `variants`: `[{ promos, cards }]`, the list that goes with the promo the
 *    box came with (`promoIds`, what drawPromos dealt).
 *  - `spread`: `{ total, print }`, basic Energy dealt evenly over the eight
 *    types, the odd cards on random types.
 *  - `recipe`: a Build & Battle Box. The deck is the group of the promo it came
 *    with, plus one of the other groups at random, plus a few random Trainers,
 *    plus basic Energy up to the deck size. Each box is dealt fresh.
 *
 * In a list, an id can be `[a, b]` (one of them, at random) and a count can be
 * `[min, max]`. Returns `[{ id, n }]`, empty for a box that holds nothing more.
 */
export function boxCardList(entry, promoIds = [], rand = Math.random) {
  if (!entry) return [];
  const counts = new Map();
  const add = (id, n) => {
    if (n > 0) counts.set(id, (counts.get(id) || 0) + n);
  };
  const between = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
  const rows = (list) => {
    for (const [id, n] of list || []) {
      add(Array.isArray(id) ? id[between(0, id.length - 1)] : id, Array.isArray(n) ? between(n[0], n[1]) : n);
    }
  };
  const drawn = new Set((promoIds || []).map(String));
  rows(entry.cards);
  const variant = (entry.variants || []).find(
    (item) => item.promos?.length && item.promos.every((id) => drawn.has(String(id)))
  );
  if (variant) rows(variant.cards);
  if (entry.spread) {
    const { total, print = "" } = entry.spread;
    const types = energyTypesFor(print);
    const per = Math.floor(total / types.length);
    const odd = new Set();
    while (odd.size < total - per * types.length) odd.add(between(0, types.length - 1));
    types.forEach(([kind], i) => add(`energy-${kind}${print ? `-${print}` : ""}`, per + (odd.has(i) ? 1 : 0)));
  }
  if (entry.recipe) dealRecipe(entry.recipe, drawn, { rand, between, add, rows, counts });
  return [...counts].map(([id, n]) => ({ id, n }));
}

/** Build & Battle Box deck: see boxCardList. */
function dealRecipe(recipe, drawn, { rand, between, add, rows, counts }) {
  const keys = Object.keys(recipe.groups || {});
  if (!keys.length) return;
  const primary = keys.find((key) => drawn.has(key)) || keys[between(0, keys.length - 1)];
  const chosen = [primary];
  const others = keys.filter((key) => key !== primary);
  if (recipe.second !== false && others.length) chosen.push(others[between(0, others.length - 1)]);
  for (const key of chosen) rows(recipe.groups[key].cards);
  rows(recipe.fixed);
  const size = () => [...counts.values()].reduce((sum, n) => sum + n, 0) + Math.max(1, drawn.size);

  const trainers = recipe.trainers;
  if (trainers?.pool?.length) {
    const pool = trainers.pool.map(([id, min, max]) => ({ id, min, max, have: 0 }));
    let want = trainers.count ? between(trainers.count[0], trainers.count[1]) : Math.max(0, (trainers.fillTo || 0) - size());
    for (const item of pool) {
      if (item.min > 0) {
        add(item.id, item.min);
        item.have = item.min;
        want -= item.min;
      }
    }
    for (let open = pool.filter((item) => item.have < item.max); want > 0 && open.length; open = pool.filter((item) => item.have < item.max)) {
      const item = open[between(0, open.length - 1)];
      add(item.id, 1);
      item.have += 1;
      want -= 1;
    }
  }

  if (recipe.energy) {
    const room = (recipe.total || 0) - size();
    const n = recipe.energy.n ? Math.min(recipe.energy.n, room) : room;
    if (n > 0) {
      const weights = {};
      for (const key of chosen) {
        for (const [kind, weight] of Object.entries(recipe.groups[key].types || {})) weights[kind] = (weights[kind] || 0) + weight;
      }
      const kinds = Object.keys(weights).length ? Object.keys(weights) : energyTypesFor(recipe.energy.print).map(([kind]) => kind);
      const sum = kinds.reduce((total, kind) => total + (weights[kind] || 1), 0);
      // Largest remainder, so the split adds up to exactly n.
      const shares = kinds.map((kind) => {
        const exact = (n * (weights[kind] || 1)) / sum;
        return { kind, whole: Math.floor(exact), rest: exact - Math.floor(exact) };
      });
      let left = n - shares.reduce((total, item) => total + item.whole, 0);
      for (const item of shares.slice().sort((a, b) => b.rest - a.rest)) {
        if (left > 0) {
          item.whole += 1;
          left -= 1;
        }
      }
      const suffix = recipe.energy.print ? `-${recipe.energy.print}` : "";
      for (const item of shares) add(`energy-${item.kind}${suffix}`, item.whole);
    }
  }
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

/** The Fairy Energy of XY (2013): only that print has it, the other runs print eight types. */
const FAIRY_ENERGY = ["fairy", "Fairy"];

const ENERGY_TYPES = [
  ["grass", "Grass"],
  ["fire", "Fire"],
  ["water", "Water"],
  ["lightning", "Lightning"],
  ["psychic", "Psychic"],
  ["fighting", "Fighting"],
  ["darkness", "Darkness"],
  ["metal", "Metal"],
];

/** The Energy types of a print: the eight, plus Fairy for the XY 2013 print (ENERGY_PRINTS `fairy`). */
function energyTypesFor(print) {
  return ENERGY_PRINTS.find((row) => row.print === (print || ""))?.fairy ? [...ENERGY_TYPES, FAIRY_ENERGY] : ENERGY_TYPES;
}

/**
 * The basic Energy in a pack's Energy slot. Scarlet & Violet printed three
 * runs of it in the SVE set (Bulbapedia's SVE Basic Energies gallery;
 * PokeBeach's Stellar Crown guide): 001-008 in every set up to Shrouded
 * Fable, the art every set here used before; 009-016 on Tera crystals from
 * Stellar Crown to Destined Rivals; 017-024 in the Black & White style for
 * Black Bolt and White Flare. A set names its run with `energyPrint` and the
 * engine keeps its Energy slot to that run (poolsFrom() in js/engine.js).
 * None of them is part of a set's checklist. Faces are mirrored locally by
 * scripts/mirror_images.py's encode(), same as the cards.
 */
const ENERGY_PRINTS = [
  { print: "", suffix: "", first: 1 },
  { print: "tera", suffix: "-tera", first: 9 },
  { print: "unova", suffix: "-unova", first: 17 },
  // The Sword & Shield era's own basic Energy (the 2020 print, pkmn.gg's
  // sword-shield-energy-2020), the eleventh card of every SWSH pack.
  { print: "swsh", suffix: "-swsh", label: "Sword & Shield 2020" },
  // The Sun & Moon era's two basic Energy runs (Sun & Moon Energy 2017 and
  // 2019, pkmn.gg's sun-moon-energy-2017 / -2019; the Fairy card is left out,
  // the site has no Fairy type). The -sm suffix is taken (small scans).
  { print: "sm17", suffix: "-sm17", label: "Sun & Moon 2017" },
  { print: "sm19", suffix: "-sm19", label: "Sun & Moon 2019" },
  // The XY era's own (2013, pkmn.gg's xy-energy-2013 / xye13): nine types, Fairy
  // included, the only print with that type. XY packs carry no Energy card (sources
  // at xySlots); the ETBs, decks and Trainer Kits do. Scans: assets/cards/shared/energy-<type>-xy.webp.
  { print: "xy", suffix: "-xy", label: "XY 2013", fairy: true },
  // The Mega Evolution era's own (MEE 001-008): in the Mega Evolution ETBs and
  // Build & Battle decks. No set's pack Energy slot uses it yet.
  { print: "mee", suffix: "-mee", first: 1, code: "MEE" },
];

export const BASIC_ENERGY = ENERGY_PRINTS.flatMap(({ print, suffix, first, label, code = "SVE", fairy }) =>
  (fairy ? [...ENERGY_TYPES, FAIRY_ENERGY] : ENERGY_TYPES).map(([id, name], i) => ({
    id: `energy-${id}${suffix}`,
    name: `${name} Energy`,
    number: "—",
    rarity: "Energy",
    energy: true,
    ...(print ? { energyPrint: print, variant: label || `${code} ${String(first + i).padStart(3, "0")}` } : {}),
    supertype: "Energy",
    subtypes: ["Basic"],
    types: [name],
    artist: "Pokémon",
    image: `assets/cards/shared/energy-${id}${suffix}.webp`,
    imageSmall: `assets/cards/shared/energy-${id}${suffix}-sm.webp`,
  }))
);

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
 * Sword & Shield era pack (data/pullrates.json): 5 commons, 3 uncommons, a
 * reverse holo slot, a rare slot, and the basic Energy that comes as an
 * eleventh card. The rare slot holds a plain Rare unless it rolls a holo
 * Rare, a Pokémon V, VMAX or VSTAR, a full art (`Rare Ultra`: full-art V,
 * alternate-art VMAX, full-art Supporter), a rainbow or a gold. The reverse
 * slot is where the special cards of each set replace the reverse holo: the
 * Trainer Gallery (`tg`), Crown Zenith's Galarian Gallery (`gg`), Radiant
 * Rares, Amazing Rares, and Shining Fates' Shiny Vault (baby shinies, shiny
 * V, shiny VMAX and its two golds). Every rate is per pack.
 */
function swshSlots({ holo, v, vmax = 0, vstar = 0, ultra, rainbow = 0, secret = 0, amazing = 0, radiant = 0, tg = 0, gg = 0, shiny = 0, shinyV = 0, shinyVMAX = 0, shinyGold = 0 }) {
  const reverse = [
    ["trainerGallery", tg],
    ["galarianGallery", gg],
    ["radiant", radiant],
    ["amazing", amazing],
    ["shinyBaby", shiny],
    ["shinyV", shinyV],
    ["shinyVMAX", shinyVMAX],
    ["shinyGold", shinyGold],
  ].filter(([, p]) => p > 0);
  const special = reverse.reduce((sum, [, p]) => sum + p, 0);
  const rare = [
    ["v", v],
    ["vmax", vmax],
    ["vstar", vstar],
    ["rareUltra", ultra],
    ["rainbow", rainbow],
    ["secret", secret],
  ].filter(([, p]) => p > 0);
  const hits = rare.reduce((sum, [, p]) => sum + p, 0);
  const plain = Math.max(0, 1 - hits - holo);
  return [
    { pool: "energy", count: 1 },
    { pool: "common", count: 5 },
    { pool: "uncommon", count: 3 },
    special
      ? { pool: "reverse", count: 1, table: [["reverse", 1 - special], ...reverse] }
      : { pool: "reverse", count: 1 },
    {
      pool: "rare-slot",
      count: 1,
      table: [...(plain > 0.0005 ? [["rare", plain]] : []), ["holo", Math.min(holo, 1 - hits)], ...rare],
    },
  ];
}

/**
 * Sun & Moon era pack. Each set fills in what its research says (commons,
 * whether the pack carries a basic Energy, which slot its specials replace),
 * so the counts are arguments; the rates are per pack. The rare slot holds a
 * plain Rare unless it rolls a holo Rare, a GX (Tag Team GX included, a Prism
 * Star, a full art (`Rare Ultra`: full-art GX, Tag Team or Supporter), a
 * rainbow or a gold. `reverseSpecial` names the reverse-slot replacements a
 * set has, as [pool, rate] pairs: Hidden Fates' Shiny Vault tiers (shinyBaby,
 * shinyGX, shinyUltra, shinyGold), Prism Stars (`["prismStar", rate]`: they
 * replace the reverse holo, research in /mnt/project-files/sun-moon/research)
 * or a reverse basic Energy (`["reverseEnergy", rate]`). `prism` is the rare
 * slot's Prism Star rate and is not used by any real pack. Shining Legends'
 * Shining Pokémon (`shining`) fill its rare slot.
 */
function smSlots({ commons = 5, uncommons = 3, energy = 1, holo, gx, prism = 0, ultra = 0, rainbow = 0, secret = 0, shining = 0, reverseSpecial = [] }) {
  const reverse = reverseSpecial.filter(([, p]) => p > 0);
  const special = reverse.reduce((sum, [, p]) => sum + p, 0);
  const rare = [
    ["gx", gx],
    ["prismStar", prism],
    ["shining", shining],
    ["rareUltra", ultra],
    ["rainbow", rainbow],
    ["secret", secret],
  ].filter(([, p]) => p > 0);
  const hits = rare.reduce((sum, [, p]) => sum + p, 0);
  const plain = Math.max(0, 1 - hits - holo);
  return [
    ...(energy ? [{ pool: "energy", count: energy }] : []),
    { pool: "common", count: commons },
    { pool: "uncommon", count: uncommons },
    special
      ? { pool: "reverse", count: 1, table: [["reverse", 1 - special], ...reverse] }
      : { pool: "reverse", count: 1 },
    {
      pool: "rare-slot",
      count: 1,
      table: [...(plain > 0.0005 ? [["rare", plain]] : []), ["holo", Math.min(holo, 1 - hits)], ...rare],
    },
  ];
}

/**
 * XY era pack (2014-2016). Each set fills in what its research says; the rates
 * are per pack. Structure, from two sources: 10 cards, 5 Commons + 3 Uncommons +
 * 1 reverse holo + 1 rare slot, and NO basic Energy card: the Energy slot began
 * with Sun & Moon, so `energy` defaults to 0.
 *   - Bulbapedia, Booster pack (TCG): from Diamond & Pearl a pack holds 10 cards
 *     (5 Commons, 3 Uncommons, 1 reverse holo, 1 Rare or better); "starting in
 *     the Sun & Moon expansion there is also a basic Energy card in every
 *     booster pack". https://bulbapedia.bulbagarden.net/wiki/Booster_pack_(TCG)
 *   - ToyWiz's retail text (quoted in /mnt/project-files/sun-moon/research/sm1.md):
 *     "Each Sun & Moon Series booster pack contains 10 cards and 1 basic Energy.
 *     Each XY Series booster pack contains 10 cards."
 *     The XY ETBs, decks and kits do carry the basic Energy of the print `xy`.
 * The rare slot holds a plain Rare unless it rolls a holo Rare (`holo`), a
 * Pokémon-EX (`ex`; give `megaEx` too when the research tracks Mega EX apart,
 * else `ex` covers both: pool `exAll`), a full art (`ultra`, Rare Ultra: full-art
 * EX, Mega EX or Supporter) or a secret rare (`secret`). BREAK cards take the
 * REVERSE slot, like Sun & Moon's Prism Stars: "They took the place of the
 * reverse holo" (Elite Fourum, "Are BREAK cards the same pull rates as Ultra
 * Rares?" https://www.elitefourum.com/t/are-break-cards-the-same-pull-rates-as-ultra-rares/30934)
 * and "BREAK cards ... appear in the Reverse Holo slot, meaning you could pull a
 * BREAK and an EX in the same pack" (Dripshop, BREAKpoint pull rates
 * https://www.dripshop.live/blog/breakpoint-pull-rates---full-breakdown--rarest-cards).
 * Medium confidence: a third-party summary says BREAKs have a slot of their own;
 * the research files say per set. `break` is the per-pack rate; further
 * reverse-slot replacements go in `reverseSpecial` as [pool, rate] pairs.
 * Generations' Radiant Collection (`radiant`, pool radiantCollection, cards
 * flagged `rc: true`) is taken to replace the reverse holo; `radiantSlot: "rare"`
 * moves it to the rare slot if the research says so.
 */
export function xySlots({ commons = 5, uncommons = 3, energy = 0, holo, ex, megaEx, ultra = 0, secret = 0, break: breakRate = 0, radiant = 0, radiantSlot = "reverse", reverseSpecial = [] }) {
  const reverse = [
    ...reverseSpecial,
    ["break", breakRate],
    ...(radiantSlot === "reverse" ? [["radiantCollection", radiant]] : []),
  ].filter(([, p]) => p > 0);
  const special = reverse.reduce((sum, [, p]) => sum + p, 0);
  const rare = [
    ...(megaEx === undefined ? [["exAll", ex]] : [["ex", ex], ["megaEx", megaEx]]),
    ["rareUltra", ultra],
    ["secret", secret],
    ...(radiantSlot === "rare" ? [["radiantCollection", radiant]] : []),
  ].filter(([, p]) => p > 0);
  const hits = rare.reduce((sum, [, p]) => sum + p, 0);
  const plain = Math.max(0, 1 - hits - holo);
  return [
    ...(energy ? [{ pool: "energy", count: energy }] : []),
    { pool: "common", count: commons },
    { pool: "uncommon", count: uncommons },
    special
      ? { pool: "reverse", count: 1, table: [["reverse", 1 - special], ...reverse] }
      : { pool: "reverse", count: 1 },
    {
      pool: "rare-slot",
      count: 1,
      table: [...(plain > 0.0005 ? [["rare", plain]] : []), ["holo", Math.min(holo, 1 - hits)], ...rare],
    },
  ];
}

/**
 * Celebrations: four holo cards, no Energy and no reverse. Each slot can
 * be a Classic Collection reprint, a V, a VMAX or the one full-art Trainer;
 * otherwise one of the 25 (all holo; pkmn.gg files 12 as `Rare` and 6 as
 * `Rare Holo`, drawn in proportion). Per-slot rates, so that a pack carries
 * a Classic Collection card about 2 times in 5 (Cardzard's 5,000 packs).
 */
function celebrationsSlots({ classic, v, vmax, ultra }) {
  const rest = 1 - classic - v - vmax - ultra;
  return Array.from({ length: 4 }, () => ({
    pool: "rare-slot",
    count: 1,
    table: [["rare", rest * 12 / 18], ["holo", rest * 6 / 18], ["classicCollection", classic], ["v", v], ["vmax", vmax], ["rareUltra", ultra]],
  }));
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

/**
 * `version` is the -vN suffix of wrapper art that was redrawn after it went
 * live. /assets/ is cached as immutable, so changed art ships under a new name.
 */
function boosterWrappers(setId, faces, version) {
  const suffix = version ? `-v${version}` : "";
  return faces.map((face, i) => ({
    id: face.id,
    name: face.name,
    cardId: face.cardId,
    tag: face.tag,
    art: `assets/packs/${setId}/pack-${i}${suffix}.avif`,
    artFallback: `assets/packs/${setId}/pack-${i}${suffix}.png`,
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
  totalCount: 192,
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
        art: "assets/packs/me55/classic-v2.avif",
        artFallback: "assets/packs/me55/classic-v2.png",
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
  totalCount: 130,
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
  totalCount: 132,
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
      id: "dragonite",
      name: "Dragonite",
      cardId: "me2pt5-290",
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
  totalCount: 143,
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
      id: "gengar",
      name: "Gengar",
      cardId: "me2-56",
      tag: "Shadow play",
      art: "assets/packs/me2/pack-1.avif",
      artFallback: "assets/packs/me2/pack-1.png",
    },
    {
      id: "heracross",
      name: "Heracross",
      cardId: "me2-108",
      tag: "Megahorn",
      art: "assets/packs/me2/pack-2.avif",
      artFallback: "assets/packs/me2/pack-2.png",
    },
    {
      id: "lopunny",
      name: "Lopunny",
      cardId: "me2-128",
      tag: "Quick step",
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
  totalCount: 202,
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
      art: "assets/packs/me1/pack-3.avif",
      artFallback: "assets/packs/me1/pack-3.png",
    },
    {
      id: "gardevoir",
      name: "Gardevoir",
      cardId: "me1-178",
      tag: "Moonblast",
      art: "assets/packs/me1/pack-0.avif",
      artFallback: "assets/packs/me1/pack-0.png",
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
      id: "kangaskhan",
      name: "Kangaskhan",
      cardId: "me1-182",
      tag: "Parent and child",
      art: "assets/packs/me1/pack-1.avif",
      artFallback: "assets/packs/me1/pack-1.png",
    },
  ],
};

/**
 * Mega Evolution Black Star Promos. There is no MEP booster: every card comes
 * in a box of one of the Mega Evolution sets (its Elite Trainer Box, Build &
 * Battle Box, blisters, tins and First Partner collections), so the boxes stay
 * on those sets' pages and are sold there. The cards themselves are this set's:
 * they sit in the Mega Evolution sets' data files under their old ids
 * ("me5-mep055"), so every save, binder and product list keeps working, and
 * `viewOf` names the files this page reads them from (js/card-home.js).
 */
export const MEP_PROMOS = {
  id: MEP_SET_ID,
  tcgId: MEP_SET_ID,
  name: "ME Black Star Promos",
  edition: "Mega Evolution",
  era: "Mega Evolution",
  released: "September 26, 2025",
  live: true,
  promoSet: true,
  promoPrefix: "MEP ",
  viewOf: ["me1", "me2", "me2pt5", "me3", "me4", "me5", "me55"],
  totalCount: 115,
  packSize: 0,
  cost: 0,
  cardBack: "assets/cards/shared/card-back.webp",
  blurb: "Mega Evolution, 2025 to 2026. The black star promos from the Mega Evolution sets' boxes, blisters and collections.",
  oddsLine: "No boosters · every promo comes in its box",
  lede: "Every Mega Evolution black star promo, in one binder: the starters from the First Partner collections, the Build & Battle Box and blister promos, the Mega ex tin cards and the 30th Celebration Pikachu. Each one comes in a box on its own set's page.",
  slots: [],
  heroIds: ["me1-mep011", "me4-mep081", "me5-mep089", "me5-mep090"],
  wrappers: [],
};

/**
 * XY Black Star Promos (XY01 to XY211). Like the ME Black Star Promos there is no
 * booster, and the promos a set's own boxes carry are filed in that set's data
 * file as `<set>-xypNNN` ("xy5-xyp003"); they are counted, listed and sold under
 * "xyp", never in the dex of the set whose box carried them (js/card-home.js
 * PROMO_HOMES). The promos no set's product claims (events, decks, giveaways) are
 * this set's own file, data/xyp.json, as `xyp-xypNNN`, like data/smp.json.
 * `viewOf` names every file the page reads, itself included. Not in
 * PLAYABLE_SETS yet: b6 adds it with data/xyp.json, `totalCount`, `heroIds` and
 * the box notes, once the numbers exist (scripts/test-xyp.mjs checks them then).
 */
export const XYP_PROMOS = {
  id: XYP_SET_ID,
  tcgId: XYP_SET_ID,
  name: "XY Black Star Promos",
  edition: "XY",
  era: "XY",
  released: "October 12, 2013",
  live: true,
  promoSet: true,
  promoPrefix: "XY ",
  viewNote: "the XY sets' own boxes (Elite Trainer Boxes, tins, premium and special collections, blisters and decks)",
  viewOf: ["xy0", "xy1", "xy2", "xy3", "xy4", "xy5", "dc1", "xy6", "xy7", "xy8", "xy9", "g1", "xy10", "xy11", "xy12", XYP_SET_ID],
  totalCount: 0, // b6: homeCards(XYP_PROMOS, every viewOf file).length
  packSize: 0,
  cost: 0,
  dataFile: "data/xyp.json",
  cardBack: "assets/cards/shared/card-back.webp",
  blurb: "XY, 2013 to 2016. The black star promos from the XY sets' boxes, tins and collections, decks and events.",
  oddsLine: "No boosters · every promo comes in its box",
  lede: "Every XY black star promo in one binder: the box and tin promos, the deck and event cards, each one in its real product.",
  slots: [],
  heroIds: [], // b6
  wrappers: [],
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
  totalCount: 181,
  packSize: 11,
  cost: 14.69,
  dataFile: "data/zsv10pt5.json",
  cardBack: "assets/cards/shared/card-back.webp",
  energyPrint: "unova",
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
  totalCount: 179,
  packSize: 11,
  cost: 13.43,
  dataFile: "data/rsv10pt5.json",
  cardBack: "assets/cards/shared/card-back.webp",
  energyPrint: "unova",
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

/**
 * Paradox Rift: the standard Scarlet & Violet pack, no ACE SPEC yet. Rates are
 * TCGplayer's 8,000-pack study (Nov 2023): DR 15.57%, UR 6.64%, IR 7.70%,
 * SIR 2.11%, Hyper Rare 1.22%. Sources are in data/pullrates.json.
 */
export const PARADOX_RIFT = {
  id: "sv4",
  tcgId: "sv4",
  name: "Paradox Rift",
  edition: "Scarlet & Violet",
  era: "Scarlet & Violet",
  released: "November 3, 2023",
  live: true,
  printedTotal: 182,
  totalCount: 280,
  packSize: 11,
  cost: 8.44,
  dataFile: "data/sv4.json",
  cardBack: "assets/cards/shared/card-back.webp",
  blurb: "Scarlet & Violet, November 2023. Ancient and Future Paradox Pokémon, Tera ex, four wrappers.",
  oddsLine: "DR 1/6 · UR 1/15 · IR 1/13 · SIR 1/47 · gold 1/82",
  lede: "Roaring Moon and Iron Valiant split the set into Ancient and Future. 34 Illustration Rares, Tera ex in crystal etched foil, and SIRs a third rarer than the sets before it.",
  slots: svSlots({ double: 0.1557, ultra: 0.0664, ir: 0.077, sir: 0.0211, hyper: 0.0122 }),
  heroIds: ["sv4-251", "sv4-249", "sv4-245", "sv4-199"],
  wrappers: [
    {
      id: "roaring-moon",
      name: "Roaring Moon",
      cardId: "sv4-124",
      tag: "The chase",
      art: "assets/packs/sv4/roaring-moon.avif",
      artFallback: "assets/packs/sv4/roaring-moon.png",
    },
    {
      id: "iron-valiant",
      name: "Iron Valiant",
      cardId: "sv4-89",
      tag: "Future",
      art: "assets/packs/sv4/iron-valiant.avif",
      artFallback: "assets/packs/sv4/iron-valiant.png",
    },
    {
      id: "garchomp",
      name: "Garchomp",
      cardId: "sv4-38",
      tag: "Tera",
      art: "assets/packs/sv4/garchomp.avif",
      artFallback: "assets/packs/sv4/garchomp.png",
    },
    {
      id: "armarouge",
      name: "Armarouge",
      cardId: "sv4-27",
      tag: "Fire armor",
      art: "assets/packs/sv4/armarouge.avif",
      artFallback: "assets/packs/sv4/armarouge.png",
    },
  ],
};

/**
 * 151. A main-set pack with no ACE SPEC: Double and Ultra Rares share the rare
 * slot, and Illustration, Special Illustration and gold Hyper Rares take the
 * second reverse. The basic Energy is a Cosmos holo one (data/sv3pt5.json)
 * about one pack in four.
 *
 * Rates are TCGplayer's study of 1,500+ English packs (Sep 2023): DR 1/8,
 * UR 1/16, IR 1/12, SIR 1/32, gold 1/51, Cosmos Energy 1/4. English 151 also
 * has "demigod" packs: a starter's IR, IR and SIR ex filling both reverses
 * and the rare slot. Nobody has measured how rare they are, so 1 in 1,300 is
 * the community estimate. Sources in data/pullrates.json.
 */
export const SV_151 = {
  id: "sv3pt5",
  tcgId: "sv3pt5",
  name: "151",
  edition: "Scarlet & Violet",
  era: "Scarlet & Violet",
  released: "September 22, 2023",
  live: true,
  printedTotal: 165,
  totalCount: 236,
  packSize: 11,
  cost: 29.71,
  dataFile: "data/sv3pt5.json",
  cardBack: "assets/cards/shared/card-back.webp",
  blurb: "Scarlet & Violet, September 2023. The original 151, one Mew wrapper, and a Cosmos holo Energy in every fourth pack.",
  oddsLine: "DR 1/8 · UR 1/16 · IR 1/12 · SIR 1/32 · gold 1/51",
  lede: "Kanto again, card for card. Charizard ex heads seven Special Illustration Rares, and a rare demigod pack holds a starter's whole line in illustration art.",
  slots: [
    {
      pool: "energy",
      count: 1,
      table: [
        ["energy", 1 - 0.2483],
        ["foilEnergy", 0.2483],
      ],
    },
    ...svSlots({ double: 0.1328, ultra: 0.0644, ir: 0.085, sir: 0.0311, hyper: 0.0194 }).slice(1),
  ],
  godPack: {
    rate: 1 / 1300,
    lines: [
      ["sv3pt5-166", "sv3pt5-167", "sv3pt5-198"],
      ["sv3pt5-168", "sv3pt5-169", "sv3pt5-199"],
      ["sv3pt5-170", "sv3pt5-171", "sv3pt5-200"],
    ],
  },
  heroIds: ["sv3pt5-199", "sv3pt5-205", "sv3pt5-200", "sv3pt5-198"],
  wrappers: [
    {
      id: "mew",
      name: "Mew",
      cardId: "sv3pt5-151",
      tag: "The original 151",
      art: "assets/packs/sv3pt5/mew.avif",
      artFallback: "assets/packs/sv3pt5/mew.png",
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
  energyPrint: "tera",
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
  energyPrint: "tera",
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
  energyPrint: "tera",
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
  ], 2),
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
  energyPrint: "tera",
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
  ], 2),
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
  energyPrint: "tera",
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
  ], 2),
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
  ], 2),
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
  ], 2),
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
  ], 2),
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
      art: "assets/packs/sv4pt5/pikachu-v2.avif",
      artFallback: "assets/packs/sv4pt5/pikachu-v2.png",
    },
    {
      id: "tinkaton",
      name: "Tinkaton",
      cardId: "sv4pt5-167",
      tag: "Big hammer",
      art: "assets/packs/sv4pt5/tinkaton-v2.avif",
      artFallback: "assets/packs/sv4pt5/tinkaton-v2.png",
    },
    {
      id: "dondozo",
      name: "Dondozo",
      cardId: "sv4pt5-126",
      tag: "Deep sea",
      art: "assets/packs/sv4pt5/dondozo-v2.avif",
      artFallback: "assets/packs/sv4pt5/dondozo-v2.png",
    },
    {
      id: "ceruledge",
      name: "Ceruledge",
      cardId: "sv4pt5-162",
      tag: "Blue flame",
      art: "assets/packs/sv4pt5/ceruledge-v2.avif",
      artFallback: "assets/packs/sv4pt5/ceruledge-v2.png",
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
    art: `assets/packs/sv3/${id}-v2.avif`,
    artFallback: `assets/packs/sv3/${id}-v2.png`,
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
  ], 2),
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
  ], 2),
};

/**
 * Scarlet & Violet Black Star Promos. There is no SVP booster: every card
 * comes in a product that holds other sets' packs (a tin, an ex box, a
 * premium collection, sold here with `from` naming those sets), in a deck,
 * or on its own at an event. The promos a set's own boxes carry (its ETB,
 * Build & Battle Box and blisters) stay filed under that set, and this page
 * lists them too.
 */
export const SV_PROMOS = {
  id: "svp",
  tcgId: "svp",
  name: "SV Black Star Promos",
  edition: "Scarlet & Violet",
  era: "Scarlet & Violet",
  released: "January 6, 2023",
  live: true,
  promoSet: true,
  totalCount: 77,
  packSize: 0,
  cost: 0,
  dataFile: "data/svp.json",
  cardBack: "assets/cards/shared/card-back.webp",
  blurb: "Scarlet & Violet, 2023 to 2025. The black star promos from tins, ex boxes, battle decks and premium collections.",
  oddsLine: "No boosters · every promo comes in its box",
  lede: "Every Scarlet & Violet black star promo that isn't in a set's own boxes: the tins, ex boxes, battle decks and premium collections, each with its real packs, plus the tournament and museum promos on their own.",
  slots: [],
  heroIds: ["svp-svp056", "svp-svp124", "svp-svp166", "svp-svp085"],
  wrappers: [],
};

/**
 * Sword & Shield Black Star Promos. Like the SV Black Star Promos there is no
 * booster: each card comes in a product that holds packs from several sets
 * (a tin, a V box, a premium collection), sold with `from` naming those
 * sets, or on its own at an event. The promos one set's own boxes carry (its
 * ETB, Build & Battle Box and V boxes) stay filed under that set, and this
 * page lists them too.
 */
export const SWSH_PROMOS = {
  id: "swshp",
  tcgId: "swshp",
  name: "SWSH Black Star Promos",
  edition: "Sword & Shield",
  era: "Sword & Shield",
  released: "November 15, 2019",
  live: true,
  promoSet: true,
  promoPrefix: "SWSH ",
  totalCount: 60,
  packSize: 0,
  cost: 0,
  dataFile: "data/swshp.json",
  cardBack: "assets/cards/shared/card-back.webp",
  blurb: "Sword & Shield, 2019 to 2023. The black star promos from tins, V boxes, premium collections and battle decks.",
  oddsLine: "No boosters · every promo comes in its box",
  lede: "Every Sword & Shield black star promo that isn't in a set's own boxes: the tins, V boxes, premium and special collections, each with its real packs.",
  slots: [],
  heroIds: ["swshp-swshp261", "swshp-swshp262", "swshp-swshp005", "swshp-swshp121"],
  wrappers: [],
};

/**
 * The Scarlet & Violet side sets: packs sold outside the expansions, filled
 * by print rather than by rarity (the `holo` and `plain` pools in
 * js/engine.js). Each card keeps the rarity symbol printed on it; `holo` says
 * whether this printing is foil. Checklists, foils and prices are built by
 * scripts/build_side_sets.py from data/sets/<id>.json; the research is in
 * .claude/skills/card-textures/reference/sv-side-sets.md.
 *
 * Trick or Trade BOOster Bundles hold three-card mini packs, one holo and two
 * non-holo in each (PokeBeach; Sleeve No Card Behind for 2024).
 */
export const CROWN_ZENITH = {
  id: "swsh12pt5",
  tcgId: "swsh12pt5",
  name: "Crown Zenith",
  edition: "Sword & Shield",
  era: "Sword & Shield",
  released: "January 20, 2023",
  live: true,
  printedTotal: 159,
  totalCount: 249,
  packSize: 11,
  cost: 25.65,
  dataFile: "data/swsh12pt5.json",
  cardBack: "assets/cards/shared/card-back.webp",
  energyPrint: "swsh",
  reverseRarities: ["Common", "Uncommon", "Rare", "Rare Holo"],
  blurb: "Sword & Shield, January 2023. The era's finale, sold in boxes: the 70-card Galarian Gallery in a third of packs, one wrapper.",
  oddsLine: "V 1/8 · VMAX 1/50 · VSTAR 1/30 · full art 1/33 · gold 1/133 · Radiant 1/22 · GG 1/3",
  lede: "Every third pack carries a Galarian Gallery card in the reverse slot: Giratina V, Mewtwo VSTAR, Arceus VSTAR gold. The rare slot is a holo 2 packs in 5.",
  // TCGplayer's 1,900-pack study; the Galarian Gallery takes the reverse slot. Sources in data/pullrates.json.
  slots: swshSlots({ holo: 0.4016, v: 0.1235, vmax: 0.02, vstar: 0.033, ultra: 0.03, secret: 0.0075, radiant: 0.0455, gg: 0.352 }),
  heroIds: ["swsh12pt5-GG69", "swsh12pt5-GG44", "swsh12pt5-GG70", "swsh12pt5-GG68"],
  wrappers: boosterWrappers("swsh12pt5", [
    { id: "crown-zenith", name: "Zacian and Zamazenta", cardId: "swsh12pt5-96", tag: "Crown Zenith" },
  ]),
};

export const SILVER_TEMPEST = {
  id: "swsh12",
  tcgId: "swsh12",
  name: "Silver Tempest",
  edition: "Sword & Shield",
  era: "Sword & Shield",
  released: "November 11, 2022",
  live: true,
  printedTotal: 195,
  totalCount: 253,
  packSize: 11,
  cost: 15.05,
  dataFile: "data/swsh12.json",
  cardBack: "assets/cards/shared/card-back.webp",
  energyPrint: "swsh",
  reverseRarities: ["Common", "Uncommon", "Rare", "Rare Holo"],
  blurb: "Sword & Shield, November 2022. Lugia VSTAR and the Regis, Alolan Vulpix VSTAR, four wrappers.",
  oddsLine: "V 1/9 · VMAX 1/200 · VSTAR 1/31 · full art 1/27 · rainbow 1/79 · gold 1/106 · Radiant 1/22 · TG 1/8",
  lede: "Lugia VSTAR and its alternate art, Unown VSTAR, Serena and Radiant Alakazam. The Trainer Gallery lands 1 in 8, Radiant 1 in 22.",
  // TCGplayer's 8,000-pack study. Sources in data/pullrates.json.
  slots: swshSlots({ holo: 0.2535, v: 0.1155, vmax: 0.005, vstar: 0.032, ultra: 0.0371, rainbow: 0.0126, secret: 0.0094, radiant: 0.0455, tg: 0.1223 }),
  heroIds: ["swsh12-186", "swsh12-TG20", "swsh12-202", "swsh12-TG15"],
  wrappers: boosterWrappers("swsh12", [
    { id: "regidrago", name: "Regidrago", cardId: "swsh12-184", tag: "Titan" },
    { id: "regieleki", name: "Regieleki", cardId: "swsh12-198", tag: "Titan" },
    { id: "lugia", name: "Lugia", cardId: "swsh12-186", tag: "The chase" },
    { id: "vulpix", name: "Alolan Vulpix", cardId: "swsh12-197", tag: "Snow" },
  ]),
};

export const LOST_ORIGIN = {
  id: "swsh11",
  tcgId: "swsh11",
  name: "Lost Origin",
  edition: "Sword & Shield",
  era: "Sword & Shield",
  released: "September 9, 2022",
  live: true,
  printedTotal: 196,
  totalCount: 256,
  packSize: 11,
  cost: 19.56,
  dataFile: "data/swsh11.json",
  cardBack: "assets/cards/shared/card-back.webp",
  energyPrint: "swsh",
  reverseRarities: ["Common", "Uncommon", "Rare", "Rare Holo"],
  blurb: "Sword & Shield, September 2022. Giratina VSTAR and the Lost Zone, Hisuian Zoroark, four wrappers.",
  oddsLine: "V 1/9 · VMAX 1/167 · VSTAR 1/26 · full art 1/26 · rainbow 1/78 · gold 1/132 · Radiant 1/20 · TG 1/8",
  lede: "Giratina VSTAR and its alternate art (1 in 200 packs), Aerodactyl VSTAR and Radiant Gardevoir. Trainer Gallery 1 in 8, Radiant 1 in 20.",
  // TCGplayer's 8,000-pack study. Sources in data/pullrates.json.
  slots: swshSlots({ holo: 0.2646, v: 0.1163, vmax: 0.006, vstar: 0.038, ultra: 0.039, rainbow: 0.0128, secret: 0.0076, radiant: 0.0501, tg: 0.1231 }),
  heroIds: ["swsh11-186", "swsh11-180", "swsh11-TG16", "swsh11-TG17"],
  wrappers: boosterWrappers("swsh11", [
    { id: "zoroark", name: "Hisuian Zoroark", cardId: "swsh11-203", tag: "Lost zone" },
    { id: "giratina", name: "Giratina", cardId: "swsh11-186", tag: "The chase" },
    { id: "kyurem", name: "Kyurem", cardId: "swsh11-197", tag: "Lost zone" },
    { id: "enamorus", name: "Enamorus", cardId: "swsh11-178", tag: "Lost zone" },
  ]),
};

export const POKEMON_GO = {
  id: "pgo",
  tcgId: "pgo",
  name: "Pokémon GO",
  edition: "Sword & Shield",
  era: "Sword & Shield",
  released: "July 1, 2022",
  live: true,
  printedTotal: 78,
  totalCount: 102,
  packSize: 11,
  cost: 14.5,
  dataFile: "data/pgo.json",
  cardBack: "assets/cards/shared/card-back.webp",
  energyPrint: "swsh",
  reverseRarities: ["Common", "Uncommon", "Rare", "Rare Holo"],
  blurb: "Sword & Shield, July 2022. The Pokémon GO crossover: Mewtwo VSTAR, Radiant Charizard, the peelable Ditto, one wrapper.",
  oddsLine: "V 1/6 · VMAX 1/62 · VSTAR 1/22 · full art 1/24 · rainbow 1/50 · gold 1/125 · Radiant 1/22",
  lede: "Every rare slot is a holo or better. Mewtwo VSTAR, Radiant Charizard 1 in 100, and Professor Willow. The peelable Ditto is not simulated.",
  // Derium's 500 packs; every rare slot is a holo or better; the peelable Ditto is not simulated. Sources in data/pullrates.json.
  slots: swshSlots({ holo: 0.7, v: 0.16, vmax: 0.016, vstar: 0.046, ultra: 0.042, rainbow: 0.02, secret: 0.008, radiant: 0.046 }),
  heroIds: ["pgo-72", "pgo-79", "pgo-81", "pgo-86"],
  wrappers: boosterWrappers("pgo", [
    { id: "pokemon-go", name: "Pokémon GO", cardId: "pgo-72", tag: "Go" },
  ]),
};

export const ASTRAL_RADIANCE = {
  id: "swsh10",
  tcgId: "swsh10",
  name: "Astral Radiance",
  edition: "Sword & Shield",
  era: "Sword & Shield",
  released: "May 27, 2022",
  live: true,
  printedTotal: 189,
  totalCount: 254,
  packSize: 11,
  cost: 10.61,
  dataFile: "data/swsh10.json",
  cardBack: "assets/cards/shared/card-back.webp",
  energyPrint: "swsh",
  reverseRarities: ["Common", "Uncommon", "Rare", "Rare Holo"],
  blurb: "Sword & Shield, May 2022. Origin Forme Dialga and Palkia VSTAR, the Hisui Pokémon, the first Radiant Rares, five wrappers.",
  oddsLine: "V 1/8 · VMAX 1/130 · VSTAR 1/37 · full art 1/25 · rainbow 1/78 · gold 1/132 · Radiant 1/20 · TG 1/8",
  lede: "Origin Forme Dialga and Palkia VSTAR, Radiant Greninja, and a Trainer Gallery with Machamp V and Gardenia's Vigor. Radiant Rares 1 in 20, Trainer Gallery 1 in 8.",
  // TCGplayer's 8,000-pack study; Radiant from pullrates.com (missing from TCGplayer's table). Sources in data/pullrates.json.
  slots: swshSlots({ holo: 0.2553, v: 0.1277, vmax: 0.0077, vstar: 0.027, ultra: 0.0395, rainbow: 0.0128, secret: 0.0076, radiant: 0.05, tg: 0.1258 }),
  heroIds: ["swsh10-172", "swsh10-TG13", "swsh10-167", "swsh10-161"],
  wrappers: boosterWrappers("swsh10", [
    { id: "typhlosion", name: "Hisuian Typhlosion", cardId: "swsh10-193", tag: "Hisui" },
    { id: "decidueye", name: "Hisuian Decidueye", cardId: "swsh10-195", tag: "Hisui" },
    { id: "dialga", name: "Origin Forme Dialga", cardId: "swsh10-177", tag: "Star portal" },
    { id: "samurott", name: "Hisuian Samurott", cardId: "swsh10-209", tag: "Hisui" },
    { id: "palkia", name: "Origin Forme Palkia", cardId: "swsh10-167", tag: "Star portal" },
  ]),
};

export const BRILLIANT_STARS = {
  id: "swsh9",
  tcgId: "swsh9",
  name: "Brilliant Stars",
  edition: "Sword & Shield",
  era: "Sword & Shield",
  released: "February 25, 2022",
  live: true,
  printedTotal: 172,
  totalCount: 229,
  packSize: 11,
  cost: 16.96,
  dataFile: "data/swsh9.json",
  cardBack: "assets/cards/shared/card-back.webp",
  energyPrint: "swsh",
  reverseRarities: ["Common", "Uncommon", "Rare", "Rare Holo"],
  blurb: "Sword & Shield, February 2022. Arceus VSTAR, Charizard VSTAR, and the first Trainer Gallery, four wrappers.",
  oddsLine: "V 1/10 · VMAX 1/200 · VSTAR 1/30 · full art 1/22 · rainbow 1/51 · gold 1/92 · TG 1/8",
  lede: "VSTAR arrives with Arceus and Charizard. The 30-card Trainer Gallery takes the reverse slot 1 in 8; Charizard V alternate art is 1 in 143.",
  // TCGplayer's 10,000-pack study; Trainer Gallery takes the reverse slot. Sources in data/pullrates.json.
  slots: swshSlots({ holo: 0.333, v: 0.1, vmax: 0.005, vstar: 0.0333, ultra: 0.0455, rainbow: 0.0196, secret: 0.0109, tg: 0.1238 }),
  heroIds: ["swsh9-154", "swsh9-TG23", "swsh9-TG16", "swsh9-TG17"],
  wrappers: boosterWrappers("swsh9", [
    { id: "whimsicott", name: "Whimsicott", cardId: "swsh9-175", tag: "Fluffy" },
    { id: "shaymin", name: "Shaymin", cardId: "swsh9-173", tag: "Sky forme" },
    { id: "charizard", name: "Charizard", cardId: "swsh9-154", tag: "VSTAR" },
    { id: "arceus", name: "Arceus", cardId: "swsh9-166", tag: "The chase" },
  ]),
};

export const FUSION_STRIKE = {
  id: "swsh8",
  tcgId: "swsh8",
  name: "Fusion Strike",
  edition: "Sword & Shield",
  era: "Sword & Shield",
  released: "November 12, 2021",
  live: true,
  printedTotal: 264,
  totalCount: 294,
  packSize: 11,
  cost: 18.83,
  dataFile: "data/swsh8.json",
  cardBack: "assets/cards/shared/card-back.webp",
  energyPrint: "swsh",
  reverseRarities: ["Common", "Uncommon", "Rare", "Rare Holo"],
  blurb: "Sword & Shield, November 2021. Mew VMAX and Gengar VMAX, the biggest set of the era at 264 cards, four wrappers.",
  oddsLine: "V 1/10 · VMAX 1/30 · full art 1/24 · rainbow 1/127 · gold 1/120",
  lede: "Mew VMAX, Gengar VMAX and Genesect V lead 264 cards. Full arts 1 in 24, alternate-art VMAX 1 in 333.",
  // TCGplayer's 4,000-pack infographic; V by subtraction from its 20% hit rate. Sources in data/pullrates.json.
  slots: swshSlots({ holo: 0.18, v: 0.105, vmax: 0.0333, ultra: 0.0414, rainbow: 0.0079, secret: 0.0083 }),
  heroIds: ["swsh8-271", "swsh8-270", "swsh8-269", "swsh8-251"],
  wrappers: boosterWrappers("swsh8", [
    { id: "boltund", name: "Boltund", cardId: "swsh8-267", tag: "Fusion" },
    { id: "genesect", name: "Genesect", cardId: "swsh8-255", tag: "Fusion Strike" },
    { id: "mew", name: "Mew", cardId: "swsh8-269", tag: "Fusion Strike" },
    { id: "gengar", name: "Gengar", cardId: "swsh8-271", tag: "Single Strike" },
  ]),
};

export const CELEBRATIONS = {
  id: "cel25",
  tcgId: "cel25",
  name: "Celebrations",
  edition: "Sword & Shield",
  era: "Sword & Shield",
  released: "October 8, 2021",
  live: true,
  printedTotal: 25,
  totalCount: 66,
  packSize: 4,
  cost: 33.85,
  dataFile: "data/cel25.json",
  cardBack: "assets/cards/shared/card-back.webp",
  allFoil: true,
  reverseRarities: ["Common", "Uncommon", "Rare", "Rare Holo"],
  blurb: "Sword & Shield, October 2021. The 25th anniversary set: four holo cards a pack, and the Classic Collection reprints, one wrapper.",
  oddsLine: "Classic Collection 2/5 · V 1/4 · VMAX 1/13 · gold Mew 1/150",
  lede: "Every card is holo. A Classic Collection reprint (Base Set Charizard, Umbreon Gold Star, Shining Magikarp) lands in 2 packs of 5, the gold Mew 1 in 150.",
  // Cardzard 5,000 packs: Classic Collection in 40% of packs, V 1 in 4, VMAX 1 in 13, gold Mew 1 in 150. Sources in data/pullrates.json.
  slots: celebrationsSlots({ classic: 0.12, v: 0.07, vmax: 0.02, ultra: 0.005 }),
  heroIds: ["cel25-cc4", "cel25-cc17", "cel25-25", "cel25-cc76"],
  wrappers: boosterWrappers("cel25", [
    { id: "celebrations", name: "Celebrations", cardId: "cel25-cc4", tag: "25 years" },
  ]),
};

export const EVOLVING_SKIES = {
  id: "swsh7",
  tcgId: "swsh7",
  name: "Evolving Skies",
  edition: "Sword & Shield",
  era: "Sword & Shield",
  released: "August 27, 2021",
  live: true,
  printedTotal: 203,
  totalCount: 258,
  packSize: 11,
  cost: 45.52,
  dataFile: "data/swsh7.json",
  cardBack: "assets/cards/shared/card-back.webp",
  energyPrint: "swsh",
  reverseRarities: ["Common", "Uncommon", "Rare", "Rare Holo"],
  blurb: "Sword & Shield, August 2021. The Eeveelution VMAX set, Rayquaza VMAX and Umbreon VMAX, four wrappers.",
  oddsLine: "V 1/9 · VMAX 1/18 · full art 1/24 · rainbow 1/119 · gold 1/110",
  lede: "The most chased set of the era: Umbreon VMAX and Rayquaza VMAX alternate arts at 1 in 333 packs, the Eeveelutions in every rarity. VMAX 1 in 18, alternate-art V 1 in 91.",
  // TCGplayer's 8,000-pack study; holo Rare from pullrates.com and DigitalTQ. Sources in data/pullrates.json.
  slots: swshSlots({ holo: 0.25, v: 0.1056, vmax: 0.056, ultra: 0.0418, rainbow: 0.0084, secret: 0.0091 }),
  heroIds: ["swsh7-215", "swsh7-218", "swsh7-192", "swsh7-194"],
  wrappers: boosterWrappers("swsh7", [
    { id: "duraludon", name: "Duraludon", cardId: "swsh7-198", tag: "Dragon" },
    { id: "sylveon", name: "Sylveon", cardId: "swsh7-212", tag: "Eeveelution" },
    { id: "rayquaza", name: "Rayquaza", cardId: "swsh7-218", tag: "Dragon" },
    { id: "umbreon", name: "Umbreon", cardId: "swsh7-215", tag: "The chase" },
  ]),
};

export const CHILLING_REIGN = {
  id: "swsh6",
  tcgId: "swsh6",
  name: "Chilling Reign",
  edition: "Sword & Shield",
  era: "Sword & Shield",
  released: "June 18, 2021",
  live: true,
  printedTotal: 198,
  totalCount: 241,
  packSize: 11,
  cost: 12.52,
  dataFile: "data/swsh6.json",
  cardBack: "assets/cards/shared/card-back.webp",
  energyPrint: "swsh",
  reverseRarities: ["Common", "Uncommon", "Rare", "Rare Holo"],
  blurb: "Sword & Shield, June 2021. The Calyrex riders and the Galarian birds, five wrappers.",
  oddsLine: "V 1/11 · VMAX 1/24 · full art 1/24 · rainbow 1/122 · gold 1/100",
  lede: "Shadow Rider and Ice Rider Calyrex VMAX, and the Galarian bird alternate arts. VMAX 1 in 24, alternate-art V 1 in 147.",
  // Cardzard 5,000 packs; V and holo from ThePriceDex. Sources in data/pullrates.json.
  slots: swshSlots({ holo: 0.18, v: 0.09, vmax: 0.0417, ultra: 0.0422, rainbow: 0.0082, secret: 0.01 }),
  heroIds: ["swsh6-222", "swsh6-223", "swsh6-224", "swsh6-225"],
  wrappers: boosterWrappers("swsh6", [
    { id: "moltres", name: "Galarian Moltres", cardId: "swsh6-176", tag: "Fiery wrath" },
    { id: "zapdos", name: "Galarian Zapdos", cardId: "swsh6-173", tag: "Thunderous kick" },
    { id: "shadow-rider", name: "Shadow Rider Calyrex", cardId: "swsh6-204", tag: "Astral barrage" },
    { id: "articuno", name: "Galarian Articuno", cardId: "swsh6-169", tag: "Cruel sight" },
    { id: "ice-rider", name: "Ice Rider Calyrex", cardId: "swsh6-202", tag: "Glacial lance" },
  ]),
};

export const BATTLE_STYLES = {
  id: "swsh5",
  tcgId: "swsh5",
  name: "Battle Styles",
  edition: "Sword & Shield",
  era: "Sword & Shield",
  released: "March 19, 2021",
  live: true,
  printedTotal: 163,
  totalCount: 196,
  packSize: 11,
  cost: 9.57,
  dataFile: "data/swsh5.json",
  cardBack: "assets/cards/shared/card-back.webp",
  energyPrint: "swsh",
  reverseRarities: ["Common", "Uncommon", "Rare", "Rare Holo"],
  blurb: "Sword & Shield, March 2021. Single Strike and Rapid Strike Urshifu VMAX, four wrappers.",
  oddsLine: "V 1/12 · VMAX 1/25 · full art 1/25 · rainbow 1/90 · gold 1/106",
  lede: "Urshifu VMAX in both styles, Tyranitar V and Empoleon V. Full arts 1 in 25, rainbow 1 in 90, gold 1 in 106.",
  // markzeej 20,195 packs for the full arts and secrets; V, VMAX and holo from ThePriceDex and pullrates.com. Sources in data/pullrates.json.
  slots: swshSlots({ holo: 0.18, v: 0.08, vmax: 0.04, ultra: 0.04, rainbow: 0.0111, secret: 0.0094 }),
  heroIds: ["swsh5-155", "swsh5-170", "swsh5-146", "swsh5-148"],
  wrappers: boosterWrappers("swsh5", [
    { id: "urshifu", name: "Urshifu", cardId: "swsh5-168", tag: "Single Strike" },
    { id: "tyranitar", name: "Tyranitar", cardId: "swsh5-155", tag: "Single Strike" },
    { id: "empoleon", name: "Empoleon", cardId: "swsh5-146", tag: "Rapid Strike" },
    { id: "urshifu-rapid", name: "Urshifu", cardId: "swsh5-170", tag: "Rapid Strike" },
  ]),
};

export const SHINING_FATES = {
  id: "swsh45",
  tcgId: "swsh45",
  name: "Shining Fates",
  edition: "Sword & Shield",
  era: "Sword & Shield",
  released: "February 19, 2021",
  live: true,
  printedTotal: 72,
  totalCount: 208,
  packSize: 11,
  cost: 16.44,
  dataFile: "data/swsh45.json",
  cardBack: "assets/cards/shared/card-back.webp",
  energyPrint: "swsh",
  reverseRarities: ["Common", "Uncommon", "Rare", "Rare Holo"],
  blurb: "Sword & Shield, February 2021. Shiny Charizard VMAX and the 122-card Shiny Vault, four wrappers.",
  oddsLine: "V 1/9 · VMAX 1/18 · full art 1/31 · rainbow 1/84 · Amazing 1/17 · shiny 1/3",
  lede: "The Shiny Vault takes the reverse slot in nearly a third of packs: a baby shiny 1 in 4, a shiny V 1 in 14, a shiny VMAX 1 in 39. Shiny Charizard VMAX is 1 in 700 and change.",
  // 2,187 packs (Elite Fourum / Cardzard); the Shiny Vault and the Amazing Rares take the reverse slot. Sources in data/pullrates.json.
  slots: swshSlots({ holo: 0.18, v: 0.1084, vmax: 0.0544, ultra: 0.0325, rainbow: 0.0119, amazing: 0.0576, shiny: 0.2273, shinyV: 0.0714, shinyVMAX: 0.0256, shinyGold: 0.00645 }),
  heroIds: ["swsh45-SV107", "swsh45-SV044", "swsh45-SV039", "swsh45-SV022"],
  wrappers: boosterWrappers("swsh45", [
    { id: "dragapult", name: "Dragapult", cardId: "swsh45-SV062", tag: "Shiny" },
    { id: "toxtricity", name: "Toxtricity", cardId: "swsh45-SV113", tag: "Shiny" },
    { id: "crobat", name: "Crobat", cardId: "swsh45-45", tag: "Shiny" },
    { id: "charizard", name: "Charizard", cardId: "swsh45-SV107", tag: "Shiny chase" },
  ]),
};

export const VIVID_VOLTAGE = {
  id: "swsh4",
  tcgId: "swsh4",
  name: "Vivid Voltage",
  edition: "Sword & Shield",
  era: "Sword & Shield",
  released: "November 13, 2020",
  live: true,
  printedTotal: 185,
  totalCount: 213,
  packSize: 11,
  cost: 11.09,
  dataFile: "data/swsh4.json",
  cardBack: "assets/cards/shared/card-back.webp",
  energyPrint: "swsh",
  reverseRarities: ["Common", "Uncommon", "Rare", "Rare Holo"],
  blurb: "Sword & Shield, November 2020. Chonky Pikachu VMAX, Amazing Rares in the reverse slot, four wrappers.",
  oddsLine: "V 1/8 · VMAX 1/23 · full art 1/24 · rainbow 1/79 · gold 1/95 · Amazing 1/20",
  lede: "Pikachu VMAX and the six Amazing Rares: the first Amazing Rare set. An Amazing Rare replaces the reverse holo 1 in 20 packs.",
  // Cardzard 2,184 packs (rainbow from DigitalTQ's 630 packs, since Cardzard's 1/31 is 2.5x the era); Amazing Rare in the reverse slot. Sources in data/pullrates.json.
  slots: swshSlots({ holo: 0.2175, v: 0.127, vmax: 0.0429, ultra: 0.0417, rainbow: 0.0127, secret: 0.0105, amazing: 0.05 }),
  heroIds: ["swsh4-188", "swsh4-170", "swsh4-138", "swsh4-185"],
  wrappers: boosterWrappers("swsh4", [
    { id: "zarude", name: "Zarude", cardId: "swsh4-167", tag: "Jungle" },
    { id: "orbeetle", name: "Orbeetle", cardId: "swsh4-186", tag: "Psychic" },
    { id: "celebi", name: "Celebi", cardId: "swsh4-9", tag: "Amazing" },
    { id: "pikachu", name: "Pikachu", cardId: "swsh4-188", tag: "The chase" },
  ]),
};

export const CHAMPIONS_PATH = {
  id: "swsh35",
  tcgId: "swsh35",
  name: "Champion's Path",
  edition: "Sword & Shield",
  era: "Sword & Shield",
  released: "September 25, 2020",
  live: true,
  printedTotal: 73,
  totalCount: 95,
  packSize: 11,
  cost: 19.54,
  dataFile: "data/swsh35.json",
  cardBack: "assets/cards/shared/card-back.webp",
  energyPrint: "swsh",
  reverseRarities: ["Common", "Uncommon", "Rare", "Rare Holo"],
  blurb: "Sword & Shield, September 2020. A 73-card special set sold in collection boxes: Charizard VMAX rainbow and the shiny Charizard V, four wrappers.",
  oddsLine: "V 1/6 · VMAX 1/28 · full art 1/19 · rainbow 1/64 · gold 1/114",
  lede: "Every rare slot is a holo or better. Charizard V full art 1 in 227 packs, the rainbow VMAX 1 in 230; Pokémon V come 1 in 6.",
  // Elite Fourum 3,192 packs; every rare slot is a holo or better. Sources in data/pullrates.json.
  slots: swshSlots({ holo: 0.7265, v: 0.1573, vmax: 0.0355, ultra: 0.0539, rainbow: 0.0157, secret: 0.0088 }),
  heroIds: ["swsh35-79", "swsh35-80", "swsh35-74", "swsh35-75"],
  wrappers: boosterWrappers("swsh35", [
    { id: "obstagoon", name: "Obstagoon", cardId: "swsh35-37", tag: "Galarian" },
    { id: "gardevoir", name: "Gardevoir", cardId: "swsh35-76", tag: "Champion" },
    { id: "drednaw", name: "Drednaw", cardId: "swsh35-75", tag: "Bite" },
    { id: "alcremie", name: "Alcremie", cardId: "swsh35-23", tag: "Sweet" },
  ]),
};

export const DARKNESS_ABLAZE = {
  id: "swsh3",
  tcgId: "swsh3",
  name: "Darkness Ablaze",
  edition: "Sword & Shield",
  era: "Sword & Shield",
  released: "August 14, 2020",
  live: true,
  printedTotal: 189,
  totalCount: 209,
  packSize: 11,
  cost: 9.85,
  dataFile: "data/swsh3.json",
  cardBack: "assets/cards/shared/card-back.webp",
  energyPrint: "swsh",
  reverseRarities: ["Common", "Uncommon", "Rare", "Rare Holo"],
  blurb: "Sword & Shield, August 2020. Charizard VMAX and Eternatus VMAX, four wrappers.",
  oddsLine: "V 1/8 · VMAX 1/26 · full art 1/26 · rainbow 1/84 · gold 1/115",
  lede: "Charizard VMAX is the chase, with Eternatus, Centiskorch and Grimmsnarl VMAX behind it. VMAX 1 in 26, rainbow 1 in 84.",
  // Elite Fourum 5,040 packs; holo Rare from ThePriceDex (1 in 5.9). Sources in data/pullrates.json.
  slots: swshSlots({ holo: 0.17, v: 0.1258, vmax: 0.0385, ultra: 0.0385, rainbow: 0.0119, secret: 0.0087 }),
  heroIds: ["swsh3-20", "swsh3-190", "swsh3-194", "swsh3-193"],
  wrappers: boosterWrappers("swsh3", [
    { id: "eternatus", name: "Eternatus", cardId: "swsh3-192", tag: "Eternamax" },
    { id: "grimmsnarl", name: "Grimmsnarl", cardId: "swsh3-115", tag: "G-Max" },
    { id: "centiskorch", name: "Centiskorch", cardId: "swsh3-191", tag: "Burning" },
    { id: "charizard", name: "Charizard", cardId: "swsh3-20", tag: "The chase" },
  ]),
};

export const REBEL_CLASH = {
  id: "swsh2",
  tcgId: "swsh2",
  name: "Rebel Clash",
  edition: "Sword & Shield",
  era: "Sword & Shield",
  released: "May 1, 2020",
  live: true,
  printedTotal: 192,
  totalCount: 216,
  packSize: 11,
  cost: 12.28,
  dataFile: "data/swsh2.json",
  cardBack: "assets/cards/shared/card-back.webp",
  energyPrint: "swsh",
  reverseRarities: ["Common", "Uncommon", "Rare", "Rare Holo"],
  blurb: "Sword & Shield, May 2020. Toxtricity VMAX and the Galar starters' VMAX, four wrappers.",
  oddsLine: "V 1/8 · VMAX 1/29 · full art 1/27 · rainbow 1/67 · gold 1/105",
  lede: "Toxtricity, Dragapult and Copperajah VMAX, plus the Boss's Orders full art. VMAX lands 1 in 29, rainbow 1 in 67.",
  // Elite Fourum 2,736 packs; holo Rare from ThePriceDex (1 in 5.7). Sources in data/pullrates.json.
  slots: swshSlots({ holo: 0.175, v: 0.1265, vmax: 0.034, ultra: 0.0376, rainbow: 0.015, secret: 0.0095 }),
  heroIds: ["swsh2-204", "swsh2-205", "swsh2-206", "swsh2-207"],
  wrappers: boosterWrappers("swsh2", [
    { id: "toxtricity", name: "Toxtricity", cardId: "swsh2-196", tag: "Amped" },
    { id: "inteleon", name: "Inteleon", cardId: "swsh2-195", tag: "Sniper" },
    { id: "cinderace", name: "Cinderace", cardId: "swsh2-194", tag: "Pyro ball" },
    { id: "rillaboom", name: "Rillaboom", cardId: "swsh2-193", tag: "Drum beat" },
  ]),
};

export const SWORD_SHIELD = {
  id: "swsh1",
  tcgId: "swsh1",
  name: "Sword & Shield",
  edition: "Sword & Shield",
  era: "Sword & Shield",
  released: "February 7, 2020",
  live: true,
  printedTotal: 202,
  totalCount: 225,
  packSize: 11,
  cost: 11.09,
  dataFile: "data/swsh1.json",
  cardBack: "assets/cards/shared/card-back.webp",
  energyPrint: "swsh",
  reverseRarities: ["Common", "Uncommon", "Rare", "Rare Holo"],
  blurb: "Sword & Shield, February 2020. Where the era starts: Zacian V, Zamazenta V, Gigantamax Lapras, and the first VMAX, four wrappers.",
  oddsLine: "V 1/7 · VMAX 1/45 · full art 1/27 · rainbow 1/81 · gold 1/110",
  lede: "Zacian and Zamazenta lead the Galar era's first set: Pokémon V take the rare slot 1 in 7, VMAX 1 in 45, and the full arts, rainbows and golds share about 1 pack in 17.",
  // Elite Fourum 4,628 packs; holo Rare from ThePriceDex (1 in 5.5). Sources in data/pullrates.json.
  slots: swshSlots({ holo: 0.18, v: 0.142, vmax: 0.022, ultra: 0.0374, rainbow: 0.0123, secret: 0.0091 }),
  heroIds: ["swsh1-206", "swsh1-142", "swsh1-197", "swsh1-200"],
  wrappers: boosterWrappers("swsh1", [
    { id: "rillaboom", name: "Rillaboom", cardId: "swsh1-15", tag: "Grookey's grown" },
    { id: "lapras", name: "Lapras", cardId: "swsh1-203", tag: "Gigantamax" },
    { id: "zamazenta", name: "Zamazenta", cardId: "swsh1-212", tag: "The shield" },
    { id: "zacian", name: "Zacian", cardId: "swsh1-211", tag: "The sword" },
  ]),
};

function printSlots(plain, holo = 1) {
  return [
    { pool: "plain", count: plain },
    { pool: "printedHolo", count: holo },
  ];
}

export const TRICK_OR_TRADE_2023 = {
  id: "tot23",
  name: "Trick or Trade 2023",
  edition: "Trick or Trade",
  era: "Scarlet & Violet",
  released: "September 1, 2023",
  live: true,
  printedTotal: 30,
  totalCount: 30,
  packSize: 3,
  cost: 2.38,
  dataFile: "data/tot23.json",
  cardBack: "assets/cards/shared/card-back.webp",
  blurb: "Halloween 2023. Thirty spooky reprints from Sword & Shield to Paldea Evolved, each stamped with a jack-o'-lantern Pikachu, three cards a mini pack.",
  oddsLine: "3 cards · 1 holo in every pack · 10 holos",
  lede: "The BOOster Bundle's 50 mini packs were made to hand out instead of candy. Every pack has one holo, and every card wears the pumpkin Pikachu stamp.",
  slots: printSlots(2),
  heroIds: ["tot23-17", "tot23-29", "tot23-27", "tot23-9"],
  wrappers: boosterWrappers("tot23", [
    { id: "mimikyu", name: "Mimikyu & Pikachu", cardId: "tot23-29", tag: "Boo" },
  ]),
};

/**
 * Trick or Trade 2024: the holos moved to a Cosmos foil on the art's
 * background and the silver border (TCGplayer's scans), and Chandelure and
 * Houndstone came non-holo. The bundle's 35 packs were pre-sorted into ten
 * combinations (Bulbapedia, unsourced); packs here are drawn at random.
 */
export const TRICK_OR_TRADE_2024 = {
  id: "tot24",
  name: "Trick or Trade 2024",
  edition: "Trick or Trade",
  era: "Scarlet & Violet",
  released: "August 30, 2024",
  live: true,
  printedTotal: 30,
  totalCount: 30,
  packSize: 3,
  cost: 1.95,
  dataFile: "data/tot24.json",
  cardBack: "assets/cards/shared/card-back.webp",
  blurb: "Halloween 2024. Thirty reprints from Paldea Evolved to Twilight Masquerade with the pumpkin Pikachu stamp, and Cosmos holos this time.",
  oddsLine: "3 cards · 1 Cosmos holo in every pack · 10 holos",
  lede: "Gengar, Darkrai and the Loyal Three in Cosmos holo, one in every mini pack, with the pumpkin Pikachu stamp on every card.",
  slots: printSlots(2),
  heroIds: ["tot24-14", "tot24-10", "tot24-6", "tot24-11"],
  wrappers: boosterWrappers("tot24", [
    { id: "trevenant", name: "Trevenant & Gengar", cardId: "tot24-14", tag: "Boo" },
  ]),
};

/**
 * McDonald's Happy Meal promos: four-card packs. In 2023 each held one
 * confetti holo and three non-holo (Bulbapedia). For 2024 Bulbapedia only says
 * the Scarlet & Violet cards are holo and the Sword & Shield ones are not, so
 * its packs are split the same way as 2023's. The confetti foil covers the
 * art's background and the silver border (css/holo/side-sets.css).
 */
export const MCDONALDS_2023 = {
  id: "mcd23",
  name: "McDonald's Match Battle 2023",
  edition: "McDonald's",
  era: "Scarlet & Violet",
  released: "September 12, 2023",
  live: true,
  printedTotal: 15,
  totalCount: 15,
  packSize: 4,
  cost: 6.47,
  dataFile: "data/mcd23.json",
  cardBack: "assets/cards/shared/card-back.webp",
  blurb: "Happy Meal promos, 2023. Paldea's starters, Pikachu and friends in a 15-card Match Battle set, four cards a pack.",
  oddsLine: "4 cards · 1 holo in every pack · 6 holos",
  lede: "The Match Battle Happy Meal set: each pack has one confetti holo. The holo Pikachu is the one to find.",
  slots: printSlots(3),
  heroIds: ["mcd23-6", "mcd23-2", "mcd23-1", "mcd23-3"],
  wrappers: boosterWrappers("mcd23", [
    { id: "starters", name: "Paldea's starters & Pikachu", cardId: "mcd23-6", tag: "Match Battle" },
  ]),
};

export const MCDONALDS_2024 = {
  id: "mcd24",
  name: "McDonald's Dragon Discovery",
  edition: "McDonald's",
  era: "Scarlet & Violet",
  released: "January 21, 2025",
  live: true,
  printedTotal: 15,
  totalCount: 15,
  packSize: 4,
  cost: 8.98,
  dataFile: "data/mcd24.json",
  cardBack: "assets/cards/shared/card-back.webp",
  blurb: "Happy Meal promos, the 2024 collection. Dragon types and Pikachu, 15 cards, four a pack.",
  oddsLine: "4 cards · 1 holo in every pack · 7 holos",
  lede: "Dragonite, Koraidon, Miraidon and Roaring Moon in confetti holo, one to a pack. Charizard is in here too, non-holo.",
  slots: printSlots(3),
  heroIds: ["mcd24-12", "mcd24-2", "mcd24-1", "mcd24-11"],
  wrappers: boosterWrappers("mcd24", [
    { id: "dragonite", name: "Dragonite & Pikachu", cardId: "mcd24-12", tag: "Dragon Discovery" },
  ]),
};

/**
 * SM Black Star Promos. Like the SWSH and SV promo pages there is no booster:
 * each card comes in a product that holds packs from several sets (a collection
 * box, a premium collection), in a deck or trainer kit, or at an event
 * (a launch, the Worlds, a prerelease, a film release). A promo one set's own
 * boxes carry (blisters, tins, Build & Battle Boxes, its GX boxes) stays filed
 * under that set, and this page lists those too. Sources and gaps:
 * .claude/skills/card-textures/reference/sun-moon-smp.md.
 */
export const SM_PROMOS = {
  id: "smp",
  tcgId: "smp",
  name: "SM Black Star Promos",
  edition: "Sun & Moon",
  era: "Sun & Moon",
  released: "November 18, 2016",
  live: true,
  promoSet: true,
  promoPrefix: "SM ",
  totalCount: 33,
  packSize: 0,
  cost: 0,
  dataFile: "data/smp.json",
  cardBack: "assets/cards/shared/card-back.webp",
  blurb: "Sun & Moon, 2016 to 2021. The black star promos from premium and TAG TEAM collections, decks, the Alolan Sandslash trainer kit and events.",
  oddsLine: "No boosters · every promo comes in its box",
  lede: "Every Sun & Moon black star promo that isn't in a set's own boxes: the TAG TEAM Powers and Premium Collections with their real packs, the theme and league decks, and the prerelease, Worlds and movie giveaways on their own.",
  slots: [],
  heroIds: ["smp-smp241", "smp-smp240", "smp-smp248", "smp-smp247"],
  wrappers: [],
};

/**
 * McDonald's Happy Meal promos of 2017, 2018 and 2019 (English): twelve
 * reprints of Sun & Moon cards in Confetti Holofoil, one random card to a
 * Happy Meal with a toy (Bulbapedia; TCGplayer lists every card as foil only).
 * Nobody sold a pack and TCGplayer has no listing for one, so a "pack" here is
 * one card priced at the average market price of the twelve (a fair draw),
 * in a pouch drawn for the site (scripts/make_mcd_sm_wrappers.py).
 */
function happyMeal2017to2019(id, year, released, cost, heroIds, cardId) {
  return {
    id,
    name: `McDonald's Collection ${year}`,
    edition: "McDonald's",
    era: "Sun & Moon",
    released,
    live: true,
    printedTotal: 12,
    totalCount: 12,
    packSize: 1,
    cost,
    dataFile: `data/${id}.json`,
    cardBack: "assets/cards/shared/card-back.webp",
    blurb: `Happy Meal promos, ${year}. Twelve Sun & Moon reprints in Confetti Holofoil, one card to a meal.`,
    oddsLine: "1 card · always a Confetti holo · 12 cards",
    lede: `One Happy Meal, one Confetti holo out of twelve. The Pikachu in each set is the one people chase.`,
    slots: [{ pool: "printedHolo", count: 1 }],
    heroIds,
    wrappers: boosterWrappers(id, [{ id: "happy-meal", name: "Happy Meal pouch", cardId, tag: `${year} Collection` }]),
  };
}

export const MCDONALDS_2017 = happyMeal2017to2019("mcd17", "2017", "November 7, 2017", 8.5, ["mcd17-5", "mcd17-3", "mcd17-1", "mcd17-12"], "mcd17-5");
export const MCDONALDS_2018 = happyMeal2017to2019("mcd18", "2018", "October 16, 2018", 27.7, ["mcd18-2", "mcd18-11", "mcd18-4", "mcd18-5"], "mcd18-4");
export const MCDONALDS_2019 = happyMeal2017to2019("mcd19", "2019", "October 15, 2019", 15.47, ["mcd19-6", "mcd19-12", "mcd19-5", "mcd19-1"], "mcd19-6");
export const SUN_MOON = {
  id: "sm1",
  tcgId: "sm1",
  name: "Sun & Moon",
  edition: "Sun & Moon",
  era: "Sun & Moon",
  released: "February 3, 2017",
  live: true,
  printedTotal: 149,
  totalCount: 178,
  packSize: 11,
  cost: 22.97,
  dataFile: "data/sm1.json",
  cardBack: "assets/cards/shared/card-back.webp",
  energyPrint: "sm17",
  reverseRarities: ["Common", "Uncommon", "Rare", "Rare Holo"],
  blurb: "Sun & Moon, February 2017. The first Pokémon-GX set, with Solgaleo-GX and Lunala-GX on five wrappers.",
  oddsLine: "GX 1/9 · full art 1/24 · rainbow 1/72 · gold 1/109",
  lede: "Solgaleo-GX and Lunala-GX lead the first GX set, with the rainbow Solgaleo, Lunala and Umbreon the chase. GX 1 in 9 packs, a full art 1 in 24, a rainbow 1 in 72.",
  // Elite Fourum tallies, about 8,300 packs (sturzflugbombardieru, burpies, Derium, Danny Phantump); a holo or better fills 12 of every 36 rare slots. Sources in data/pullrates.json.
  slots: smSlots({ holo: 0.1567, gx: 0.1114, ultra: 0.0421, rainbow: 0.0139, secret: 0.0092 }),
  heroIds: ["sm1-155", "sm1-153", "sm1-154", "sm1-161"],
  wrappers: boosterWrappers("sm1", [
    { id: "solgaleo", name: "Solgaleo", cardId: "sm1-89", tag: "Legendary" },
    { id: "lunala", name: "Lunala", cardId: "sm1-66", tag: "Legendary" },
    { id: "incineroar", name: "Incineroar", cardId: "sm1-27", tag: "Starter" },
    { id: "decidueye", name: "Decidueye", cardId: "sm1-12", tag: "Starter" },
    { id: "primarina", name: "Primarina", cardId: "sm1-42", tag: "Starter" },
  ]),
};

export const GUARDIANS_RISING = {
  id: "sm2",
  tcgId: "sm2",
  name: "Guardians Rising",
  edition: "Sun & Moon",
  era: "Sun & Moon",
  released: "May 5, 2017",
  live: true,
  printedTotal: 145,
  totalCount: 198,
  packSize: 11,
  cost: 35.92,
  dataFile: "data/sm2.json",
  cardBack: "assets/cards/shared/card-back.webp",
  energyPrint: "sm17",
  reverseRarities: ["Common", "Uncommon", "Rare", "Rare Holo"],
  blurb: "Sun & Moon, May 2017. Tapu Koko-GX and Tapu Lele-GX with the rainbow Sylveon-GX, four wrappers.",
  oddsLine: "GX 1/9 · full art 1/24 · rainbow 1/70 · gold 1/118",
  lede: "Fifteen rainbow GX, the Tapu Koko, Sylveon and Lycanroc among them, sit above twelve GX. GX 1 in 9 packs, a full art 1 in 24, a rainbow 1 in 70.",
  // Elite Fourum tallies, about 8,350 packs (sturzflugbombardieru, burpies, Derium, Danny Phantump); a holo or better fills 12 of every 36 rare slots. Sources in data/pullrates.json.
  slots: smSlots({ holo: 0.1577, gx: 0.1112, ultra: 0.0417, rainbow: 0.0142, secret: 0.0085 }),
  heroIds: ["sm2-153", "sm2-158", "sm2-156", "sm2-146"],
  wrappers: boosterWrappers("sm2", [
    { id: "alolan-ninetales", name: "Alolan Ninetales", cardId: "sm2-22", tag: "Alolan" },
    { id: "tapu-koko", name: "Tapu Koko", cardId: "sm2-47", tag: "Guardian" },
    { id: "lycanroc", name: "Lycanroc", cardId: "sm2-74", tag: "Midnight" },
    { id: "kommo-o", name: "Kommo-o", cardId: "sm2-100", tag: "Dragon" },
  ]),
};

export const BURNING_SHADOWS = {
  id: "sm3",
  tcgId: "sm3",
  name: "Burning Shadows",
  edition: "Sun & Moon",
  era: "Sun & Moon",
  released: "August 4, 2017",
  live: true,
  printedTotal: 147,
  totalCount: 191,
  packSize: 11,
  cost: 31.02,
  dataFile: "data/sm3.json",
  cardBack: "assets/cards/shared/card-back.webp",
  energyPrint: "sm17",
  reverseRarities: ["Common", "Uncommon", "Rare", "Rare Holo"],
  blurb: "Sun & Moon, August 2017. Charizard-GX, Ho-Oh-GX and the Necrozma and Marshadow rainbows, four wrappers.",
  oddsLine: "GX 1/9 · full art 1/24 · rainbow 1/73 · gold 1/105",
  lede: "The rainbow Charizard-GX is the chase, with Necrozma, Marshadow and Tapu Bulu behind it. GX 1 in 9 packs, a full art 1 in 24, a rainbow 1 in 73.",
  // Elite Fourum tallies, about 8,000 packs (sturzflugbombardieru, burpies, Derium, Danny Phantump); a holo or better fills 12 of every 36 rare slots. Sources in data/pullrates.json.
  slots: smSlots({ holo: 0.1579, gx: 0.1098, ultra: 0.0424, rainbow: 0.0137, secret: 0.0095 }),
  heroIds: ["sm3-150", "sm3-153", "sm3-156", "sm3-149"],
  wrappers: boosterWrappers("sm3", [
    { id: "marshadow", name: "Marshadow", cardId: "sm3-80", tag: "Mythical" },
    { id: "tapu-fini", name: "Tapu Fini", cardId: "sm3-39", tag: "Guardian" },
    { id: "necrozma", name: "Necrozma", cardId: "sm3-63", tag: "Dusk Mane" },
    { id: "ho-oh", name: "Ho-Oh", cardId: "sm3-21", tag: "Rainbow" },
  ]),
};

export const LOST_THUNDER = {
  id: "sm8",
  tcgId: "sm8",
  name: "Lost Thunder",
  edition: "Sun & Moon",
  era: "Sun & Moon",
  released: "November 2, 2018",
  live: true,
  printedTotal: 214,
  totalCount: 246,
  packSize: 11,
  cost: 59.36,
  dataFile: "data/sm8.json",
  cardBack: "assets/cards/shared/card-back.webp",
  energyPrint: "sm17",
  reverseRarities: ["Common", "Uncommon", "Rare", "Rare Holo"],
  blurb: "Sun & Moon, November 2018. Seven Prism Stars in the reverse slot, Blacephalon-GX and the Ultra Beasts, four wrappers.",
  oddsLine: "GX 1/10 · full art 1/23 · rainbow 1/80 · gold 1/109 · Prism Star 1/8",
  lede: "Lugia-GX, Zeraora-GX and Mimikyu-GX in rainbow are the chase. A Prism Star takes the reverse slot about 1 pack in 8; the rare slot is a GX 1 in 10.",
  // Elite Fourum's box tallies (burpies n=1,274, sturzflugbombardieru n=3,168, Derium n=1,008, Danny Phantump), pooled n=5,450; Prism Stars replace the reverse holo (Elite Fourum, PrimetimePokemon, Dripshop). Sources in data/pullrates.json.
  slots: smSlots({ holo: 0.1659, gx: 0.1017, ultra: 0.044, rainbow: 0.0125, secret: 0.0092, reverseSpecial: [["prismStar", 0.1246]] }),
  heroIds: ["sm8-226", "sm8-227", "sm8-206", "sm8-221"],
  wrappers: boosterWrappers("sm8", [
    { id: "celebi", name: "Celebi", cardId: "sm8-19", tag: "Prism Star" },
    { id: "blacephalon", name: "Blacephalon", cardId: "sm8-52", tag: "Ultra Beast" },
    { id: "zeraora", name: "Zeraora", cardId: "sm8-86", tag: "Lightning" },
    { id: "lugia", name: "Lugia", cardId: "sm8-159", tag: "Psychic" },
  ], 2),
};

export const TEAM_UP = {
  id: "sm9",
  tcgId: "sm9",
  name: "Team Up",
  edition: "Sun & Moon",
  era: "Sun & Moon",
  released: "February 1, 2019",
  live: true,
  printedTotal: 181,
  totalCount: 204,
  packSize: 11,
  cost: 300.96,
  dataFile: "data/sm9.json",
  cardBack: "assets/cards/shared/card-back.webp",
  energyPrint: "sm19",
  reverseRarities: ["Common", "Uncommon", "Rare", "Rare Holo"],
  blurb: "Sun & Moon, February 2019. The first TAG TEAM GX, with Latias & Latios and Gengar & Mimikyu alternate arts, four wrappers.",
  oddsLine: "GX 1/10 · full art 1/24 · rainbow 1/74 · gold 1/98 · Prism Star 1/18",
  lede: "The first TAG TEAM GX. Gengar & Mimikyu and Latias & Latios have alternate full arts, and every TAG TEAM has a rainbow. Full art 1 in 24, rainbow 1 in 74.",
  // Elite Fourum's box tallies (sturzflugbombardieru n=2,016, burpies n=872, Derium n=2,999, Danny Phantump), pooled n=5,887; Prism Stars replace the reverse holo. Sources in data/pullrates.json.
  slots: smSlots({ holo: 0.165, gx: 0.102, ultra: 0.0425, rainbow: 0.0136, secret: 0.0102, reverseSpecial: [["prismStar", 0.0562]] }),
  heroIds: ["sm9-170", "sm9-165", "sm9-161", "sm9-191"],
  wrappers: boosterWrappers("sm9", [
    { id: "eevee-snorlax", name: "Eevee & Snorlax", cardId: "sm9-120", tag: "Tag Team" },
    { id: "gengar-mimikyu", name: "Gengar & Mimikyu", cardId: "sm9-53", tag: "Tag Team" },
    { id: "pikachu-zekrom", name: "Pikachu & Zekrom", cardId: "sm9-33", tag: "Tag Team" },
    { id: "venusaur-celebi", name: "Venusaur & Celebi", cardId: "sm9-1", tag: "Tag Team" },
  ], 2),
};

export const UNBROKEN_BONDS = {
  id: "sm10",
  tcgId: "sm10",
  name: "Unbroken Bonds",
  edition: "Sun & Moon",
  era: "Sun & Moon",
  released: "May 3, 2019",
  live: true,
  printedTotal: 214,
  totalCount: 245,
  packSize: 11,
  cost: 68.67,
  dataFile: "data/sm10.json",
  cardBack: "assets/cards/shared/card-back.webp",
  energyPrint: "sm19",
  reverseRarities: ["Common", "Uncommon", "Rare", "Rare Holo"],
  blurb: "Sun & Moon, May 2019. Twelve TAG TEAM full arts, the Reshiram & Charizard-GX rainbow and six gold cards, four wrappers.",
  oddsLine: "GX 1/10 · full art 1/24 · rainbow 1/69 · gold 1/110",
  lede: "Gardevoir & Sylveon-GX full art and the Reshiram & Charizard-GX rainbow are the chase. GX 1 in 10 packs, a full art 1 in 24, a rainbow 1 in 69.",
  // Elite Fourum tallies, about 10,400 packs (burpies, sturzflugbombardieru, Derium, TheGameCapital, Danny Phantump); no Prism Stars. Sources in data/pullrates.json.
  slots: smSlots({ holo: 0.1667, gx: 0.0985, ultra: 0.0411, rainbow: 0.0144, secret: 0.0091 }),
  heroIds: ["sm10-217", "sm10-205", "sm10-201", "sm10-199"],
  wrappers: boosterWrappers("sm10", [
    { id: "machamp-marshadow", name: "Machamp & Marshadow", cardId: "sm10-82", tag: "Tag Team" },
    { id: "reshiram-charizard", name: "Reshiram & Charizard", cardId: "sm10-20", tag: "Tag Team" },
    { id: "gardevoir-sylveon", name: "Gardevoir & Sylveon", cardId: "sm10-130", tag: "Tag Team" },
    { id: "lucario-melmetal", name: "Lucario & Melmetal", cardId: "sm10-120", tag: "Tag Team" },
  ], 2),
};

export const UNIFIED_MINDS = {
  id: "sm11",
  tcgId: "sm11",
  name: "Unified Minds",
  edition: "Sun & Moon",
  era: "Sun & Moon",
  released: "August 2, 2019",
  live: true,
  printedTotal: 236,
  totalCount: 270,
  packSize: 11,
  cost: 79.75,
  dataFile: "data/sm11.json",
  cardBack: "assets/cards/shared/card-back.webp",
  energyPrint: "sm19",
  reverseRarities: ["Common", "Uncommon", "Rare", "Rare Holo"],
  blurb: "Sun & Moon, August 2019. Mewtwo & Mew-GX leads eight TAG TEAM, four wrappers.",
  oddsLine: "GX 1/8 · full art 1/23 · rainbow 1/74 · gold 1/112",
  lede: "The Mewtwo & Mew-GX rainbow is the chase, with Mega Sableye & Tyranitar, Raichu & Alolan Raichu and Slowpoke & Psyduck full arts behind it. GX 1 in 8 packs, a rainbow 1 in 74.",
  // Elite Fourum tallies, about 11,600 packs (burpies, sturzflugbombardieru, Derium, TheGameCapital, Danny Phantump); no Prism Stars. Sources in data/pullrates.json.
  slots: smSlots({ holo: 0.1389, gx: 0.1278, ultra: 0.0429, rainbow: 0.0136, secret: 0.0089 }),
  heroIds: ["sm11-242", "sm11-226", "sm11-222", "sm11-221"],
  wrappers: boosterWrappers("sm11", [
    { id: "garchomp-giratina", name: "Garchomp & Giratina", cardId: "sm11-146", tag: "Tag Team" },
    { id: "umbreon-darkrai", name: "Umbreon & Darkrai", cardId: "sm11-125", tag: "Tag Team" },
    { id: "espeon-deoxys", name: "Espeon & Deoxys", cardId: "sm11-72", tag: "Tag Team" },
    { id: "mewtwo-mew", name: "Mewtwo & Mew", cardId: "sm11-71", tag: "Tag Team" },
  ], 2),
};

export const FORBIDDEN_LIGHT = {
  id: "sm6",
  tcgId: "sm6",
  name: "Forbidden Light",
  edition: "Sun & Moon",
  era: "Sun & Moon",
  released: "May 4, 2018",
  live: true,
  printedTotal: 131,
  totalCount: 149,
  packSize: 11,
  cost: 47.22,
  dataFile: "data/sm6.json",
  cardBack: "assets/cards/shared/card-back.webp",
  energyPrint: "sm17",
  reverseRarities: ["Common", "Uncommon", "Rare", "Rare Holo"],
  blurb: "Sun & Moon, May 2018. The Ultra Beasts and Necrozma: Greninja-GX, Zygarde-GX and the rainbow Lucario-GX, four wrappers.",
  oddsLine: "GX 1/13 · Prism Star 1/12 · full art 1/26 · rainbow 1/81 · gold 1/111",
  lede: "Nine Pokémon-GX get a full art and a rainbow print, and the Lucario-GX and Greninja-GX rainbows are the chase. The gold cards are all Trainers and Energy, and a Prism Star takes the reverse slot about 1 pack in 12.",
  // Elite Fourum tallies pooled, n=3,668 (research/second-source-check.md); plain Rare is 2/3 of packs (direct count), holo = 1/3 minus the hits. Sources in data/pullrates.json.
  slots: smSlots({ holo: 0.1937, gx: 0.0794, ultra: 0.039, rainbow: 0.0123, secret: 0.009, reverseSpecial: [["prismStar", 0.0804]] }),
  heroIds: ["sm6-135", "sm6-133", "sm6-138", "sm6-136"],
  wrappers: boosterWrappers("sm6", [
    { id: "naganadel", name: "Naganadel", cardId: "sm6-56", tag: "Ultra Beast" },
    { id: "greninja", name: "Greninja", cardId: "sm6-24", tag: "Ninja" },
    { id: "necrozma", name: "Ultra Necrozma", cardId: "sm6-95", tag: "Ultra" },
    { id: "zygarde", name: "Zygarde", cardId: "sm6-73", tag: "Complete" },
  ], 2),
};

export const CELESTIAL_STORM = {
  id: "sm7",
  tcgId: "sm7",
  name: "Celestial Storm",
  edition: "Sun & Moon",
  era: "Sun & Moon",
  released: "August 3, 2018",
  live: true,
  printedTotal: 168,
  totalCount: 195,
  packSize: 11,
  cost: 65.83,
  dataFile: "data/sm7.json",
  cardBack: "assets/cards/shared/card-back.webp",
  energyPrint: "sm17",
  reverseRarities: ["Common", "Uncommon", "Rare", "Rare Holo"],
  blurb: "Sun & Moon, August 2018. Rayquaza-GX, Blaziken-GX and Jirachi Prism Star, four wrappers.",
  oddsLine: "GX 1/9 · Prism Star 1/18 · full art 1/27 · rainbow 1/76 · gold 1/118",
  lede: "Rayquaza-GX is the chase, with a full art and the rainbow above it; the Lisia and TV Reporter full arts are close behind. Gold is Trainers and Energy only.",
  // Four tallies pooled, n=4,720 (research/second-source-check.md); plain Rare is 2/3 of packs, holo = 1/3 minus the hits. Sources in data/pullrates.json.
  slots: smSlots({ holo: 0.1631, gx: 0.1114, ultra: 0.0371, rainbow: 0.0132, secret: 0.0085, reverseSpecial: [["prismStar", 0.0551]] }),
  heroIds: ["sm7-177", "sm7-160", "sm7-170", "sm7-175"],
  wrappers: boosterWrappers("sm7", [
    { id: "stakataka", name: "Stakataka", cardId: "sm7-102", tag: "Ultra Beast" },
    { id: "blaziken", name: "Blaziken", cardId: "sm7-28", tag: "Blaze" },
    { id: "jirachi", name: "Jirachi", cardId: "sm7-97", tag: "Wish" },
    { id: "rayquaza", name: "Rayquaza", cardId: "sm7-109", tag: "Sky" },
  ], 2),
};

export const DRAGON_MAJESTY = {
  id: "sm75",
  tcgId: "sm75",
  name: "Dragon Majesty",
  edition: "Sun & Moon",
  era: "Sun & Moon",
  released: "September 7, 2018",
  live: true,
  printedTotal: 70,
  totalCount: 88,
  packSize: 11,
  cost: 107.42,
  dataFile: "data/sm75.json",
  cardBack: "assets/cards/shared/card-back.webp",
  energyPrint: "sm17",
  reverseRarities: ["Common", "Uncommon", "Rare", "Rare Holo"],
  blurb: "Sun & Moon, September 2018. A 70-card dragon set with no booster box and no plain Rares: Charizard, Dragonite, Reshiram and Salamence on the wrappers.",
  oddsLine: "GX 1/6.7 · Prism Star 1/10 · full art 1/16 · rainbow 1/40 · gold 1/68",
  lede: "Every rare slot is a holo or better. Ultra Necrozma-GX gold is the chase, one of four golds sharing 1 pack in 68, and a Prism Star takes the reverse slot 1 pack in 10.",
  // Two tallies pooled, n=949 (research/second-source-check.md); no plain Rare exists, so holo = 1 minus the hits. Reverse Energy (6.7%, a sheet model) is not wired: the set data holds no reverse Energy cards. Sources in data/pullrates.json.
  slots: smSlots({ holo: 0.7471, gx: 0.1496, ultra: 0.0632, rainbow: 0.0253, secret: 0.0148, reverseSpecial: [["prismStar", 0.1022]] }),
  heroIds: ["sm75-78", "sm75-71", "sm75-73", "sm75-67"],
  wrappers: boosterWrappers("sm75", [
    { id: "charizard", name: "Charizard", cardId: "sm75-3", tag: "Flame" },
    { id: "dragonite", name: "Dragonite", cardId: "sm75-37", tag: "Dragon" },
    { id: "reshiram", name: "Reshiram", cardId: "sm75-11", tag: "Vermilion" },
    { id: "salamence", name: "Salamence", cardId: "sm75-44", tag: "Storm" },
  ], 2),
};

export const HIDDEN_FATES = {
  id: "sm115",
  tcgId: "sm115",
  name: "Hidden Fates",
  edition: "Sun & Moon",
  era: "Sun & Moon",
  released: "August 23, 2019",
  live: true,
  printedTotal: 68,
  totalCount: 171,
  packSize: 11,
  cost: 49.15,
  dataFile: "data/sm115.json",
  cardBack: "assets/cards/shared/card-back.webp",
  energyPrint: "sm19",
  reverseRarities: ["Common", "Uncommon", "Rare", "Rare Holo"],
  blurb: "Sun & Moon, August 2019. A 69-card special set with the 94-card Shiny Vault, sold only in tins, pins and boxes: shiny Charizard-GX, four wrappers.",
  oddsLine: "GX 1/7 · full art 1/27 · rainbow 1/58 · Shiny Vault 1/3 · shiny gold 1/57",
  lede: "Hidden Fates never came in a booster box. The Shiny Vault takes the reverse slot in about one pack in three: a shiny Pokémon 1 in 5, a shiny GX 1 in 10, a gold Tapu or Stadium 1 in 57.",
  // burpies, 1,580 packs (Elite Fourum; ThePriceDex for the holo rate and the main/vault full-art split); the Shiny Vault takes the reverse slot. Sources in data/pullrates.json.
  slots: smSlots({ holo: 0.2, gx: 0.1506, ultra: 0.0373, rainbow: 0.0171, reverseSpecial: [["shinyBaby", 0.212], ["shinyGX", 0.1019], ["shinyUltra", 0.0114], ["shinyGold", 0.0177]] }),
  heroIds: ["sm115-SV49", "sm115-69", "sm115-SV59", "sm115-SV94"],
  wrappers: boosterWrappers("sm115", [
    { id: "mew", name: "Mew", cardId: "sm115-32", tag: "Mythical" },
    { id: "legendary-birds", name: "Articuno, Zapdos & Moltres", cardId: "sm115-44", tag: "Legendary" },
    { id: "shiny-mewtwo", name: "Shiny Mewtwo", cardId: "sm115-SV59", tag: "Shiny" },
    { id: "shiny-charizard", name: "Shiny Charizard", cardId: "sm115-SV49", tag: "Shiny chase" },
  ]),
};

export const COSMIC_ECLIPSE = {
  id: "sm12",
  tcgId: "sm12",
  name: "Cosmic Eclipse",
  edition: "Sun & Moon",
  era: "Sun & Moon",
  released: "November 1, 2019",
  live: true,
  printedTotal: 236,
  totalCount: 284,
  packSize: 11,
  cost: 73.81,
  dataFile: "data/sm12.json",
  cardBack: "assets/cards/shared/card-back.webp",
  energyPrint: "sm19",
  reverseRarities: ["Common", "Uncommon", "Rare", "Rare Holo"],
  blurb: "Sun & Moon, November 2019. The last Sun & Moon set: 27 full-art TAG TEAMs and Trainers, 14 rainbows, Character Rares and gold Trainers, four wrappers.",
  oddsLine: "GX 1/8 · full art 1/27 · rainbow 1/67 · gold 1/112 · Character Rare 1/10",
  lede: "Twelve Character Rares take the reverse slot about one pack in ten. The rainbow TAG TEAMs are 1 in 67, and each of the 27 full arts about 1 in 720 packs.",
  // Elite Fourum: sturzflugbombardieru's 3,024 packs and burpies' 3,136 (rainbow and gold split from burpies). Character Rares sit in the reverse slot. Sources in data/pullrates.json.
  slots: smSlots({ holo: 0.1431, gx: 0.1237, ultra: 0.0374, rainbow: 0.015, secret: 0.0089, reverseSpecial: [["character", 0.1035]] }),
  heroIds: ["sm12-251", "sm12-254", "sm12-253", "sm12-258"],
  wrappers: boosterWrappers("sm12", [
    { id: "togepi-cleffa-igglybuff", name: "Togepi, Cleffa & Igglybuff", cardId: "sm12-143", tag: "Fairy" },
    { id: "solgaleo-lunala", name: "Solgaleo & Lunala", cardId: "sm12-216", tag: "Cosmic" },
    { id: "blastoise-piplup", name: "Blastoise & Piplup", cardId: "sm12-214", tag: "Water" },
    { id: "arceus-dialga-palkia", name: "Arceus, Dialga & Palkia", cardId: "sm12-220", tag: "Legendary" },
  ]),
};

/**
 * Detective Pikachu: a four-card pack of holofoil cards (three Commons and a
 * Rare, no Energy, no reverse), sold only inside the set's Case Files, tins and
 * chests. Every card is foil, the Commons through `foilAs`.
 */
export const DETECTIVE_PIKACHU = {
  id: "det1",
  tcgId: "det1",
  name: "Detective Pikachu",
  edition: "Sun & Moon",
  era: "Sun & Moon",
  released: "April 5, 2019",
  live: true,
  printedTotal: 18,
  totalCount: 26,
  packSize: 4,
  cost: 24.56,
  dataFile: "data/det1.json",
  cardBack: "assets/cards/shared/card-back.webp",
  reverseRarities: ["Common", "Uncommon", "Rare", "Rare Holo"],
  blurb: "Sun & Moon, April 2019. An 18-card movie set, all holofoil, four cards a pack, sold only in Case Files, tins and chests.",
  oddsLine: "3 holo Commons + 1 holo Rare · each Rare 1 in 10 packs",
  lede: "Every card is foil. The rare slot is uniform: each of the ten Rares, Charizard and Mewtwo among them, turns up in about one pack in ten.",
  // Three Common Holo and one Rare Holo a pack, the rare uniform over the ten (sturzflugbombardieru's 75 pulls, Elite Fourum; ThePriceDex; Bulbapedia). Sources in data/pullrates.json.
  slots: [
    { pool: "common", count: 3 },
    { pool: "rare-slot", count: 1, table: [["holo", 1]] },
  ],
  heroIds: ["det1-5", "det1-9", "det1-12", "det1-10"],
  wrappers: boosterWrappers("det1", [
    { id: "poke-ball", name: "Detective Pikachu", cardId: "det1-10", tag: "Case File" },
  ]),
};

export const ULTRA_PRISM = {
  id: "sm5",
  tcgId: "sm5",
  name: "Ultra Prism",
  edition: "Sun & Moon",
  era: "Sun & Moon",
  released: "February 2, 2018",
  live: true,
  printedTotal: 156,
  totalCount: 176,
  packSize: 11,
  cost: 49.67,
  dataFile: "data/sm5.json",
  cardBack: "assets/cards/shared/card-back.webp",
  energyPrint: "sm17",
  reverseRarities: ["Common", "Uncommon", "Rare", "Rare Holo"],
  blurb: "Sun & Moon, February 2018. Necrozma in two forms, Giratina and Leafeon on the wrappers, and the first Prism Star cards, four wrappers.",
  oddsLine: "GX 1/12 · Prism Star 1/12 · full art 1/24 · rainbow 1/68 · gold 1/123",
  lede: "The first Prism Star cards take the reverse holo slot 1 pack in 12. GX come 1 in 12 packs, full arts 1 in 23, and the Lillie and Cynthia full-art Trainers are the chase.",
  // Elite Fourum (E2, burpies, Derium) and Flipside Gaming, 6,246 packs; the Prism Star replaces the reverse holo; holo Rare is 1/3 minus the hits (plain Rare is 2/3 of packs, counted). Sources in data/pullrates.json.
  slots: smSlots({ holo: 0.1875, gx: 0.0817, ultra: 0.0414, rainbow: 0.0147, secret: 0.0081, reverseSpecial: [["prismStar", 0.085]] }),
  heroIds: ["sm5-151", "sm5-148", "sm5-153", "sm5-157"],
  wrappers: boosterWrappers("sm5", [
    { id: "giratina", name: "Giratina", cardId: "sm5-58", tag: "Chaotic star" },
    { id: "leafeon", name: "Leafeon", cardId: "sm5-13", tag: "Grand Bloom" },
    { id: "dawn-wings", name: "Dawn Wings Necrozma", cardId: "sm5-63", tag: "Moon's Eclipse" },
    { id: "dusk-mane", name: "Dusk Mane Necrozma", cardId: "sm5-90", tag: "Sun's Eclipse" },
  ], 2),
};

export const CRIMSON_INVASION = {
  id: "sm4",
  tcgId: "sm4",
  name: "Crimson Invasion",
  edition: "Sun & Moon",
  era: "Sun & Moon",
  released: "November 3, 2017",
  live: true,
  printedTotal: 111,
  totalCount: 140,
  packSize: 11,
  cost: 18.22,
  dataFile: "data/sm4.json",
  cardBack: "assets/cards/shared/card-back.webp",
  energyPrint: "sm17",
  reverseRarities: ["Common", "Uncommon", "Rare", "Rare Holo"],
  blurb: "Sun & Moon, November 2017. The Ultra Beasts land in Alola: Guzzlord, Kartana, Buzzwole and Silvally, four wrappers.",
  oddsLine: "GX 1/12 · full art 1/23 · rainbow 1/96 · gold 1/92",
  lede: "Gyarados-GX leads the Ultra Beast invasion. GX come 1 in 12 packs, full arts 1 in 23, a rainbow GX 1 in 96 and a gold item or Energy 1 in 92.",
  // Elite Fourum: sturzflugbombardieru's boxes (1,981 packs), burpies (1,530) and Derium (1,008); holo Rare is 1/3 of the rare slot minus the hits. Sources in data/pullrates.json.
  slots: smSlots({ holo: 0.1842, gx: 0.0835, ultra: 0.0443, rainbow: 0.0104, secret: 0.0109 }),
  heroIds: ["sm4-112", "sm4-110", "sm4-101", "sm4-38"],
  wrappers: boosterWrappers("sm4", [
    { id: "guzzlord", name: "Guzzlord", cardId: "sm4-63", tag: "Glutton" },
    { id: "kartana", name: "Kartana", cardId: "sm4-70", tag: "Blade" },
    { id: "buzzwole", name: "Buzzwole", cardId: "sm4-57", tag: "Knuckle impact" },
    { id: "silvally", name: "Silvally", cardId: "sm4-90", tag: "Rebel" },
  ], 2),
};

export const SHINING_LEGENDS = {
  id: "sm35",
  tcgId: "sm35",
  name: "Shining Legends",
  edition: "Sun & Moon",
  era: "Sun & Moon",
  released: "October 6, 2017",
  live: true,
  printedTotal: 73,
  totalCount: 101,
  packSize: 11,
  cost: 109.79,
  dataFile: "data/sm35.json",
  cardBack: "assets/cards/shared/card-back.webp",
  energyPrint: "sm17",
  reverseRarities: ["Common", "Uncommon", "Rare", "Rare Holo"],
  blurb: "Sun & Moon, October 2017. A 73-card special set that only came in boxes and tins: six Shining Pokémon, the tube Mewtwo-GX, four wrappers.",
  oddsLine: "Shining 1/11 · GX 1/8 · full art 1/24 · rainbow 1/64 · gold 1/114",
  lede: "Every rare slot is a holo or better, and there is no plain Rare. A Shining Pokémon lands 1 pack in 11, a GX 1 in 8, and the gold Mewtwo-GX in a tube 1 in 114; a reverse holo Energy takes the reverse slot 1 time in 14.",
  // Elite Fourum: burpies (1,536 packs), Derium (1,002) and sturzflugbombardieru's boxes (330); Shining sit in the rare slot, reverse basic Energy in the reverse slot. Sources in data/pullrates.json.
  slots: smSlots({ holo: 0.7255, gx: 0.1189, ultra: 0.0425, rainbow: 0.0157, secret: 0.0088, shining: 0.0886, reverseSpecial: [["reverseEnergy", 0.07]] }),
  heroIds: ["sm35-78", "sm35-40", "sm35-56", "sm35-76"],
  wrappers: boosterWrappers("sm35", [
    { id: "genesect", name: "Genesect", cardId: "sm35-9", tag: "Shining" },
    { id: "mewtwo", name: "Mewtwo", cardId: "sm35-39", tag: "Psystrike" },
    { id: "mew", name: "Mew", cardId: "sm35-40", tag: "Shining" },
    { id: "rayquaza", name: "Rayquaza", cardId: "sm35-56", tag: "Shining" },
  ], 2),
};


export const XY_BASE = {
  id: "xy1",
  tcgId: "xy1",
  name: "XY",
  edition: "XY",
  era: "XY",
  released: "February 5, 2014",
  live: true,
  printedTotal: 146,
  totalCount: 146,
  packSize: 10,
  cost: 133.34,
  dataFile: "data/xy1.json",
  cardBack: "assets/cards/shared/card-back.webp",
  energyPrint: "xy",
  reverseRarities: ["Common", "Uncommon", "Rare", "Rare Holo"],
  blurb: "XY, February 2014. Kalos opens with the first Mega Evolutions and six full-art Pokémon-EX, in four wrappers.",
  oddsLine: "EX 1/12 · full art 1/36",
  lede: "Blastoise-EX, Xerneas-EX and Venusaur-EX in full art are the chase. A Pokémon-EX turns up about 1 pack in 12, a full art 1 in 36.",
  // Elite Fourum E2's 360-pack sheet model (n = 29 boxes tallied) with PokeBeach's box thread as the second count; the Mega share of the EX sheet is card-share. Sources in data/pullrates.json.
  slots: xySlots({ holo: 0.2333, ex: 0.0625, megaEx: 0.0208, ultra: 0.0278 }),
  heroIds: ["xy1-142", "xy1-146", "xy1-141", "xy1-144"],
  wrappers: boosterWrappers("xy1", [
    { id: "yveltal", name: "Yveltal", cardId: "xy1-79", tag: "EX" },
    { id: "xerneas", name: "Xerneas", cardId: "xy1-97", tag: "EX" },
    { id: "mega-blastoise", name: "Mega Blastoise", cardId: "xy1-30", tag: "Mega" },
    { id: "mega-venusaur", name: "Mega Venusaur", cardId: "xy1-2", tag: "Mega" },
  ]),
};

export const FLASHFIRE = {
  id: "xy2",
  tcgId: "xy2",
  name: "Flashfire",
  edition: "XY",
  era: "XY",
  released: "May 7, 2014",
  live: true,
  printedTotal: 106,
  totalCount: 109,
  packSize: 10,
  cost: 160.85,
  dataFile: "data/xy2.json",
  cardBack: "assets/cards/shared/card-back.webp",
  energyPrint: "xy",
  reverseRarities: ["Common", "Uncommon", "Rare", "Rare Holo"],
  blurb: "XY, May 2014. Mega Charizard-EX X and Y, a gold Mega Charizard-EX and a Mega Kangaskhan, in four wrappers.",
  oddsLine: "EX 1/11 · full art 1/26 · gold 1/114",
  lede: "The gold Mega Charizard-EX is the chase, with the full-art Charizard-EX behind it. A Pokémon-EX turns up about 1 pack in 11, a full art 1 in 26, a gold secret 1 in 114.",
  // Elite Fourum E2's 360-pack sheet model (n = 28 boxes tallied) with PokeBeach's box thread (n = 44 boxes) as the second count; the gold Mega EX share the EX sheet. Sources in data/pullrates.json.
  slots: xySlots({ holo: 0.1972, ex: 0.0553, megaEx: 0.0332, ultra: 0.0389, secret: 0.0087 }),
  heroIds: ["xy2-108", "xy2-107", "xy2-100", "xy2-69"],
  wrappers: boosterWrappers("xy2", [
    { id: "pyroar", name: "Pyroar", cardId: "xy2-20" },
    { id: "mega-kangaskhan", name: "Mega Kangaskhan", cardId: "xy2-79", tag: "Mega" },
    { id: "mega-charizard-y", name: "Mega Charizard Y", cardId: "xy2-13", tag: "Mega" },
    { id: "mega-charizard-x", name: "Mega Charizard X", cardId: "xy2-69", tag: "Mega" },
  ]),
};

export const FURIOUS_FISTS = {
  id: "xy3",
  tcgId: "xy3",
  name: "Furious Fists",
  edition: "XY",
  era: "XY",
  released: "August 13, 2014",
  live: true,
  printedTotal: 111,
  totalCount: 113,
  packSize: 10,
  cost: 78.74,
  dataFile: "data/xy3.json",
  cardBack: "assets/cards/shared/card-back.webp",
  energyPrint: "xy",
  reverseRarities: ["Common", "Uncommon", "Rare", "Rare Holo"],
  blurb: "XY, August 2014. Mega Lucario-EX, Mega Heracross-EX and Dragonite-EX, with two gold Mega secrets, in four wrappers.",
  oddsLine: "EX 1/11 · full art 1/26 · gold 1/103",
  lede: "The gold Mega Lucario-EX and the full-art Lucario-EX and Dragonite-EX are the chase. A Pokémon-EX turns up about 1 pack in 11, a full art 1 in 26, a gold secret 1 in 103.",
  // Elite Fourum E2's 360-pack sheet model (n = 28 boxes tallied) with PokeBeach's box thread (n = 20 boxes) as the second count; the gold Mega EX share the EX sheet. Sources in data/pullrates.json.
  slots: xySlots({ holo: 0.1972, ex: 0.0625, megaEx: 0.025, ultra: 0.0389, secret: 0.0097 }),
  heroIds: ["xy3-113", "xy3-107", "xy3-108", "xy3-112"],
  wrappers: boosterWrappers("xy3", [
    { id: "tyrantrum", name: "Tyrantrum", cardId: "xy3-62" },
    { id: "mega-lucario", name: "Mega Lucario", cardId: "xy3-55", tag: "Mega" },
    { id: "mega-heracross", name: "Mega Heracross", cardId: "xy3-5", tag: "Mega" },
    { id: "hawlucha", name: "Hawlucha", cardId: "xy3-64", tag: "EX" },
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
  MEP_PROMOS,
  BLACK_BOLT,
  WHITE_FLARE,
  DESTINED_RIVALS,
  JOURNEY_TOGETHER,
  SURGING_SPARKS,
  TWILIGHT_MASQUERADE,
  TEMPORAL_FORCES,
  PALDEAN_FATES,
  PARADOX_RIFT,
  OBSIDIAN_FLAMES,
  STELLAR_CROWN,
  PALDEA_EVOLVED,
  SHROUDED_FABLE,
  SCARLET_VIOLET,
  PRISMATIC_EVOLUTIONS,
  SV_151,
  SV_PROMOS,
  CROWN_ZENITH,
  SILVER_TEMPEST,
  LOST_ORIGIN,
  POKEMON_GO,
  ASTRAL_RADIANCE,
  BRILLIANT_STARS,
  FUSION_STRIKE,
  CELEBRATIONS,
  EVOLVING_SKIES,
  CHILLING_REIGN,
  BATTLE_STYLES,
  SHINING_FATES,
  VIVID_VOLTAGE,
  CHAMPIONS_PATH,
  DARKNESS_ABLAZE,
  REBEL_CLASH,
  SWORD_SHIELD,
  SWSH_PROMOS,
  MCDONALDS_2024,
  TRICK_OR_TRADE_2024,
  MCDONALDS_2023,
  TRICK_OR_TRADE_2023,
  COSMIC_ECLIPSE,
  HIDDEN_FATES,
  UNIFIED_MINDS,
  UNBROKEN_BONDS,
  DETECTIVE_PIKACHU,
  TEAM_UP,
  LOST_THUNDER,
  DRAGON_MAJESTY,
  CELESTIAL_STORM,
  FORBIDDEN_LIGHT,
  ULTRA_PRISM,
  CRIMSON_INVASION,
  SHINING_LEGENDS,
  BURNING_SHADOWS,
  GUARDIANS_RISING,
  SUN_MOON,

  SM_PROMOS,
  MCDONALDS_2017,
  MCDONALDS_2018,
  MCDONALDS_2019,
  FURIOUS_FISTS,
  FLASHFIRE,
  XY_BASE,
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

/** True when a set's cards can be loaded: its own data file, or the files it is a view over. */
export function hasCardData(set) {
  return Boolean(set?.dataFile || set?.viewOf);
}

/** The sets whose data files a set's cards are read from: itself, or the ones its `viewOf` names. */
export function dataSetsOf(set) {
  return set.viewOf ? set.viewOf.map((id) => SET_BY_ID[id]).filter(Boolean) : [set];
}

/** A black star promo's sort key: "mep009-pc" comes right after "mep009", "xyp67a" after "xyp067"; numbers without the prefix sort last. */
function promoOrder(card) {
  const m = /^(?:mep|xyp)(\d+)(.*)$/i.exec(String(card?.number || ""));
  return m ? [Number(m[1]), m[2]] : [Infinity, String(card?.number || "")];
}

/**
 * A set's own cards out of the lists loaded for dataSetsOf(set). Black star
 * promos are never in a main set's dex (js/card-home.js PROMO_HOMES): a Mega
 * Evolution or XY set keeps every card but the promos filed in its file, and a
 * promo set (MEP_PROMOS, XYP_PROMOS) keeps only the cards counted under its id,
 * in promo-number order.
 */
export function homeCards(set, lists) {
  const all = lists.flat();
  if (!(set.id in PROMO_HOMES)) return all.filter((card) => !promoHomeOf(card.id));
  return all
    .filter((card) => homeSetId(card.id) === set.id)
    .sort((a, b) => {
      const [na, sa] = promoOrder(a);
      const [nb, sb] = promoOrder(b);
      return na - nb || (sa < sb ? -1 : sa > sb ? 1 : 0);
    });
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
  // Eras the roadmap has no row for (Sword & Shield, Sun & Moon) go in front in
  // the order the catalog lists them.
  const extra = [...liveByEra].map(([era, live]) => ({ era, live, queued: [], sets: live }));
  blocks.unshift(...extra);
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
    ],
  },
  {
    era: "XY → BW",
    sets: [
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
  me55: "30C",
};

/**
 * Set symbols come from pokesymbols.com, whose marks are drawn at 600px; the
 * Limitless and pokemontcg.io copies are 33px wide and blur on a phone. Keyed
 * by TCG set id (after TCG_ID_ALIAS), the value is the slug in
 * https://pokesymbols.com/images/tcg/sets/symbols/<slug>.png. A set missing
 * here falls back to the old sources in scripts/mirror_images.py.
 */
const POKESYMBOLS_SLUG = {
  base1: "base",
  base2: "jungle",
  base3: "fossil",
  base5: "team-rocket",
  neo1: "neo-genesis",
  ecard1: "expedition",
  ecard2: "aquapolis",
  ecard3: "skyridge",
  ex1: "ruby-and-sapphire",
  ex16: "power-keepers",
  dp1: "diamond-and-pearl",
  hgss1: "heartgold-soulsilver",
  bw1: "black-and-white",
  bw11: "legendary-treasures",
  xy1: "xy",
  xy12: "xy-evolutions",
  sm1: "sun-and-moon",
  sm2: "guardians-rising",
  sm3: "burning-shadows",
  sm12: "cosmic-eclipse",
  sm8: "lost-thunder",
  sm9: "team-up",
  sm115: "hidden-fates",
  det1: "detective-pikachu",
  sm35: "shining-legends",
  sm4: "crimson-invasion",
  sm5: "ultra-prism",
  swsh1: "sword-and-shield",
  swsh2: "rebel-clash",
  swsh3: "darkness-ablaze",
  swsh35: "champions-path",
  swsh4: "vivid-voltage",
  swsh45: "shining-fates",
  swsh5: "battle-styles",
  swsh6: "chilling-reign",
  swsh7: "evolving-skies",
  cel25: "celebrations",
  swsh8: "fusion-strike",
  swsh9: "brilliant-stars",
  swsh10: "astral-radiance",
  pgo: "pokemon-go",
  swsh11: "lost-origin",
  swsh12: "silver-tempest",
  swsh12pt5: "crown-zenith",
  sv1: "scarlet-and-violet",
  sv2: "paldea-evolved",
  sv3: "obsidian-flames",
  sv3pt5: "151",
  sv4: "paradox-rift",
  sv4pt5: "paldean-fates",
  sv5: "temporal-forces",
  sv6: "twilight-masquerade",
  sv6pt5: "shrouded-fable",
  sv7: "stellar-crown",
  sv8: "surging-sparks",
  sv8pt5: "prismatic-evolutions",
  sv9: "journey-together",
  sv10: "destined-rivals",
  zsv10pt5: "black-bolt",
  rsv10pt5: "white-flare",
  svp: "_promo",
  swshp: "_promo",
  smp: "_promo",
  sve: "scarlet-and-violet-energies",
  mcd23: "mcdonalds-collection-2023",
  mcd24: "mcdonalds-collection-dragon-discovery-2024",
  mcd17: "mcdonalds-collection-2017",
  mcd18: "mcdonalds-collection-2018",
  mcd19: "mcdonalds-collection-2019",
  me1: "mega-evolution",
  me2: "phantasmal-flames",
  me2pt5: "ascended-heroes",
  me3: "perfect-order",
  me4: "chaos-rising",
  me5: "pitch-black",
  me55: "30th-celebration",
  sm10: "unbroken-bonds",
  sm11: "unified-minds",
  sm6: "forbidden-light",
  sm7: "celestial-storm",
  sm75: "dragon-majesty",
  xy1: "xy",
  xy2: "xy-flashfire",
  xy3: "furious-fists",
};

/* Bump when the symbol files are re-encoded: the host serves assets as
   immutable for a year, so only a new URL reaches a phone that has them. */
const SYMBOL_VERSION = 2;

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
    symbol: `assets/cards/sets/${id}-symbol.webp?v=${SYMBOL_VERSION}`,
  };
}

export function rarityKey(rarity) {
  return String(rarity).toLowerCase().replace(/\s+/g, "-");
}
