/**
 * A card's share of its pool. Every card is 1 unless the set data marks a
 * short print with `pullWeight` (Stellar Crown's Dachsbun ex turns up about
 * 0.6 times as often as the other Double Rares in TCGplayer's study).
 */
function weightOf(card) {
  const weight = Number(card.pullWeight);
  return weight > 0 ? weight : 1;
}

function pick(list, used) {
  const available = list.filter((card) => !used.has(card.id));
  const source = available.length ? available : list;
  let card = source[Math.floor(Math.random() * source.length)];
  if (source.some((c) => c.pullWeight)) {
    let roll = Math.random() * source.reduce((sum, c) => sum + weightOf(c), 0);
    card = source.find((c) => (roll -= weightOf(c)) < 0) || source[source.length - 1];
  }
  used.add(card.id);
  return { ...card };
}

function rollTable(table) {
  const roll = Math.random();
  let acc = 0;
  for (const [key, weight] of table) {
    acc += weight;
    if (roll < acc) return key;
  }
  return table[table.length - 1][0];
}

export const HIT_RARITIES = new Set([
  "Double Rare",
  "Ultra Rare",
  "Illustration Rare",
  "Special Illustration Rare",
  "Mega Hyper Rare",
  "Hyper Rare",
  "ACE SPEC Rare",
  "Mega Attack Rare",
  "Black White Rare",
  "Futuristic Rare",
  "Classic Collection",
  "RGB Rare",
  "Shiny Rare",
  "Shiny Ultra Rare",
  // Sword & Shield: everything from a Pokémon V up. The holo Rare is the
  // era's ordinary rare-slot card, not a hit.
  "Rare Holo V",
  "Rare Holo VMAX",
  "Rare Holo VSTAR",
  "Rare Ultra",
  "Rare Rainbow",
  "Rare Secret",
  "Amazing Rare",
  "Radiant Rare",
  "Trainer Gallery Rare Holo",
  "Rare Shiny",
  // Sun & Moon: a GX (Tag Team included), a Prism Star and Hidden Fates'
  // shiny GX. The holo Rare is the rare slot's ordinary card; Rare Ultra,
  // Rainbow and Secret are listed above.
  "Rare Holo GX",
  "Rare Prism Star",
  "Rare Shiny GX",
  // Shining Legends' Shining Pokémon.
  "Rare Shining",
  // Prismatic Evolutions' Master Ball prints: 1 in 20 packs, and they sell
  // for many times their base card.
  "Master Ball",
]);

/** Hits are rarity-slot cards (and Master Ball prints). A reverse never is. */
export function isHit(card) {
  return Boolean(card) && !card.reverse && HIT_RARITIES.has(card.rarity);
}

function isExCard(card) {
  return (
    card?.subtypes?.some((s) => String(s).toLowerCase() === "ex") ||
    /(^|\s)ex$/i.test(card?.name || "")
  );
}

export function poolsFrom(cards, set) {
  // Promo cards come in collection boxes (data/products.json), never in packs.
  const everyCard = cards.filter((c) => c.rarity !== "Energy" && !c.energy && !c.promo);
  // A Sword & Shield sub-gallery (Trainer Gallery, Shiny Vault, Galarian
  // Gallery, Classic Collection) has its own slot, so its cards keep out of
  // the main pools even where they share a rarity name (a TG Pokémon V).
  const pokemonOrTrainer = everyCard.filter((c) => !c.gallery);
  const gallery = (tag) => everyCard.filter((c) => c.gallery === tag);
  const reverseRarities = set?.reverseRarities || ["Common", "Uncommon", "Rare"];
  const pokeballRarities = set?.pokeballRarities || reverseRarities;
  const reversePool = pokemonOrTrainer.filter((c) => reverseRarities.includes(c.rarity));
  // A set that files its pattern prints as cards of their own (Prismatic
  // Evolutions, scripts/build_patterns.py) deals those. Otherwise the ball
  // is a reverse finish on a pool card.
  const printed = (kind) => pokemonOrTrainer.filter((c) => c.pattern === kind);
  const pokeballPool = printed("pokeball").length
    ? printed("pokeball")
    : pokemonOrTrainer.filter((c) => pokeballRarities.includes(c.rarity));
  // Master Ball finishes are C/U/R Pokémon only — not trainers, not ex.
  const masterballPool = printed("masterball").length
    ? printed("masterball")
    : pokemonOrTrainer.filter(
      (c) =>
        ["Common", "Uncommon", "Rare"].includes(c.rarity) &&
        c.supertype !== "Trainer" &&
        !isExCard(c)
    );
  // Basic Energy comes in runs (BASIC_ENERGY in js/catalog.js); a set's slot
  // keeps to its own. Energy from the set's own data always qualifies.
  const energyPrint = set?.energyPrint || "";
  return {
    energy: cards.filter(
      (c) =>
        (c.rarity === "Energy" || c.energy) &&
        !c.reverse &&
        !c.foilAs &&
        (!String(c.id).startsWith("energy-") || (c.energyPrint || "") === energyPrint)
    ),
    // Shrouded Fable's reverse holo basic Energy: set cards that are always
    // reverse, rolled in the Energy slot's own table.
    reverseEnergy: cards.filter((c) => (c.rarity === "Energy" || c.energy) && c.reverse),
    // A set's own foil printings of the basic Energies (151's Cosmos holos)
    // are a separate roll, never mixed into the plain ones.
    foilEnergy: cards.filter((c) => (c.rarity === "Energy" || c.energy) && !c.reverse && c.foilAs),
    common: pokemonOrTrainer.filter((c) => c.rarity === "Common"),
    uncommon: pokemonOrTrainer.filter((c) => c.rarity === "Uncommon"),
    rare: pokemonOrTrainer.filter((c) => c.rarity === "Rare"),
    // Sword & Shield (swshSlots in js/catalog.js).
    holo: pokemonOrTrainer.filter((c) => c.rarity === "Rare Holo"),
    v: pokemonOrTrainer.filter((c) => c.rarity === "Rare Holo V"),
    vmax: pokemonOrTrainer.filter((c) => c.rarity === "Rare Holo VMAX"),
    vstar: pokemonOrTrainer.filter((c) => c.rarity === "Rare Holo VSTAR"),
    rareUltra: pokemonOrTrainer.filter((c) => c.rarity === "Rare Ultra"),
    rainbow: pokemonOrTrainer.filter((c) => c.rarity === "Rare Rainbow"),
    secret: pokemonOrTrainer.filter((c) => c.rarity === "Rare Secret"),
    amazing: pokemonOrTrainer.filter((c) => c.rarity === "Amazing Rare"),
    radiant: pokemonOrTrainer.filter((c) => c.rarity === "Radiant Rare"),
    trainerGallery: gallery("tg"),
    galarianGallery: gallery("gg"),
    shinyVault: gallery("sv"),
    // Shining Fates' Shiny Vault by tier (swshSlots rolls each at its own rate).
    shinyBaby: gallery("sv").filter((c) => c.rarity === "Rare Shiny"),
    shinyV: gallery("sv").filter((c) => c.rarity === "Rare Holo V"),
    shinyVMAX: gallery("sv").filter((c) => c.rarity === "Rare Holo VMAX"),
    shinyGold: gallery("sv").filter((c) => c.rarity === "Rare Secret"),
    // Sun & Moon (smSlots in js/catalog.js): a GX, a Prism Star, and Hidden
    // Fates' Shiny Vault tiers (shiny GX, the full-art shiny Ultra).
    gx: pokemonOrTrainer.filter((c) => c.rarity === "Rare Holo GX"),
    prismStar: pokemonOrTrainer.filter((c) => c.rarity === "Rare Prism Star"),
    // Shining Legends' Shining Pokémon fill its rare slot (smSlots `shining`).
    shining: pokemonOrTrainer.filter((c) => c.rarity === "Rare Shining"),
    shinyGX: gallery("sv").filter((c) => c.rarity === "Rare Shiny GX"),
    shinyUltra: gallery("sv").filter((c) => c.rarity === "Rare Ultra"),
    classicCollection: gallery("cc"),
    double: pokemonOrTrainer.filter((c) => c.rarity === "Double Rare"),
    ultra: pokemonOrTrainer.filter((c) => c.rarity === "Ultra Rare"),
    ir: pokemonOrTrainer.filter((c) => c.rarity === "Illustration Rare"),
    sir: pokemonOrTrainer.filter((c) => c.rarity === "Special Illustration Rare"),
    hyper: pokemonOrTrainer.filter(
      (c) => c.rarity === "Mega Hyper Rare" || c.rarity === "Hyper Rare"
    ),
    ace: pokemonOrTrainer.filter((c) => c.rarity === "ACE SPEC Rare"),
    // Ascended Heroes only: Mega Attack Rares share the Ultra Rare slot, which
    // is why that set's UR rate drops from ~1/12 to 1/21.
    megaAttack: pokemonOrTrainer.filter((c) => c.rarity === "Mega Attack Rare"),
    bwr: pokemonOrTrainer.filter((c) => c.rarity === "Black White Rare"),
    // 30th Celebration: a Pikachu in every pack, gold-bordered reprints, the
    // chrome Futuristic Rares, and the three RGB Mews.
    pikachu: pokemonOrTrainer.filter((c) => c.rarity === "Pikachu Rare"),
    classic: everyCard.filter((c) => c.rarity === "Classic Collection"),
    futuristic: pokemonOrTrainer.filter((c) => c.rarity === "Futuristic Rare"),
    rgb: pokemonOrTrainer.filter((c) => c.rarity === "RGB Rare"),
    // Paldean Fates' Shiny Vault: baby shinies and shiny ex share the first
    // reverse holo slot.
    shiny: pokemonOrTrainer.filter((c) => c.rarity === "Shiny Rare"),
    shinyUltra: pokemonOrTrainer.filter((c) => c.rarity === "Shiny Ultra Rare"),
    // Trick or Trade and McDonald's packs are filled by print, not rarity:
    // a set number of holo cards, the rest non-holo (data/sets/<set>.json).
    printedHolo: pokemonOrTrainer.filter((c) => c.holo),
    plain: pokemonOrTrainer.filter((c) => !c.holo),
    reversePool,
    pokeballPool,
    masterballPool,
  };
}

function reversePoolFor(pools, kind) {
  if (kind === "masterball" && pools.masterballPool.length) return pools.masterballPool;
  if (kind === "pokeball" && pools.pokeballPool.length) return pools.pokeballPool;
  return pools.reversePool;
}

function asReverse(card, kind) {
  return { ...card, reverse: true, reverseKind: kind || "cosmos" };
}

function reverseKind(slot) {
  return slot.kinds ? rollTable(slot.kinds) : "cosmos";
}

function pullReverse(pools, used, kind) {
  const card = pick(reversePoolFor(pools, kind), used);
  // A pattern print is a card of its own, not a reverse of one.
  return card.pattern ? card : asReverse(card, kind);
}

/** The slots a god pack fills, in the order its cards go into them. */
const GOD_SLOTS = new Set(["reverse", "rare-slot", "art-slot"]);

/**
 * A god pack (`set.godPack`) is a rare pack whose foil slots hold one fixed
 * run of cards instead of rolling: 151's English "demigod" packs are a
 * starter's whole evolution line in Illustration and Special Illustration
 * art. Returns that run, or null for an ordinary pack.
 */
function rollGodPack(set, cards) {
  const god = set.godPack;
  if (!god || !(Math.random() < god.rate)) return null;
  const line = god.lines[Math.floor(Math.random() * god.lines.length)];
  const picked = line.map((id) => cards.find((card) => card.id === id));
  return picked.every(Boolean) ? picked.map((card) => ({ ...card })) : null;
}

/** 4C + 3U + reverse + rare slot + art slot + energy. No pity. */

export function ripPack(set, cards) {
  const pools = poolsFrom(cards, set);
  const used = new Set();
  const pulls = [];
  const god = rollGodPack(set, cards);

  for (const slot of set.slots) {
    for (let i = 0; i < slot.count; i += 1) {
      if (god?.length && GOD_SLOTS.has(slot.pool)) {
        pulls.push(god.shift());
      } else if (slot.pool === "rare-slot") {
        // A set with none of the rolled print (Champion's Path prints no plain Rare) deals its holo.
        const rolled = pools[rollTable(slot.table)];
        pulls.push(pick(rolled?.length ? rolled : pools.holo, used));
      } else if (slot.pool === "art-slot") {
        const key = rollTable(slot.table);
        if (key === "reverse" || key === "pokeball" || key === "masterball") {
          const kind = key === "reverse" ? reverseKind(slot) : key;
          pulls.push(pullReverse(pools, used, kind));
        } else {
          pulls.push(pick(pools[key], used));
        }
      } else if (slot.pool === "reverse") {
        const key = slot.table ? rollTable(slot.table) : "reverse";
        if (key === "reverse" || key === "pokeball" || key === "masterball") {
          const kind = key === "reverse" ? reverseKind(slot) : key;
          pulls.push(pullReverse(pools, used, kind));
        } else {
          pulls.push(pick(pools[key], used));
        }
      } else {
        pulls.push(pick(pools[slot.table ? rollTable(slot.table) : slot.pool], used));
      }
    }
  }

  return pulls;
}

/**
 * The promo ids one box of `offer` holds: all of them, or `pick` at random.
 * With `groupOf`, the promos come in fixed runs of that many and a box holds
 * one run: a First Partner Illustration Collection's promo pack is one
 * region's three starters.
 */
export function drawPromos(offer) {
  const promos = [...(offer?.promos || [])];
  if (!offer?.pick) return promos;
  const size = Math.floor(Number(offer.groupOf) || 0);
  if (size > 1 && size === offer.pick && promos.length % size === 0) {
    const start = Math.floor(Math.random() * (promos.length / size)) * size;
    return promos.slice(start, start + size);
  }
  for (let i = promos.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [promos[i], promos[j]] = [promos[j], promos[i]];
  }
  return promos.slice(0, offer.pick);
}
