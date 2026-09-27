import { sellValue } from "./catalog.js";

function pick(list, used) {
  const available = list.filter((card) => !used.has(card.id));
  const source = available.length ? available : list;
  const card = source[Math.floor(Math.random() * source.length)];
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
]);

/** Hits are rarity-slot cards. A Poké Ball Double Rare is still a reverse. */
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
  const pokemonOrTrainer = cards.filter((c) => c.rarity !== "Energy" && !c.energy && !c.promo);
  const reverseRarities = set?.reverseRarities || ["Common", "Uncommon", "Rare"];
  const pokeballRarities = set?.pokeballRarities || reverseRarities;
  const reversePool = pokemonOrTrainer.filter((c) => reverseRarities.includes(c.rarity));
  const pokeballPool = pokemonOrTrainer.filter((c) => pokeballRarities.includes(c.rarity));
  // Prismatic Master Ball printings are C/U/R Pokémon only — not trainers, not ex.
  const masterballPool = pokemonOrTrainer.filter(
    (c) =>
      ["Common", "Uncommon", "Rare"].includes(c.rarity) &&
      c.supertype !== "Trainer" &&
      !isExCard(c)
  );
  return {
    energy: cards.filter((c) => c.rarity === "Energy" || c.energy),
    common: pokemonOrTrainer.filter((c) => c.rarity === "Common"),
    uncommon: pokemonOrTrainer.filter((c) => c.rarity === "Uncommon"),
    rare: pokemonOrTrainer.filter((c) => c.rarity === "Rare" || c.rarity === "Rare Holo"),
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
    classic: pokemonOrTrainer.filter((c) => c.rarity === "Classic Collection"),
    futuristic: pokemonOrTrainer.filter((c) => c.rarity === "Futuristic Rare"),
    rgb: pokemonOrTrainer.filter((c) => c.rarity === "RGB Rare"),
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
  return asReverse(pick(reversePoolFor(pools, kind), used), kind);
}

/** 4C + 3U + reverse + rare slot + art slot + energy. No pity. */

export function ripPack(set, cards) {
  const pools = poolsFrom(cards, set);
  const used = new Set();
  const pulls = [];

  for (const slot of set.slots) {
    for (let i = 0; i < slot.count; i += 1) {
      if (slot.pool === "rare-slot") {
        pulls.push(pick(pools[rollTable(slot.table)], used));
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
        pulls.push(pick(pools[slot.pool], used));
      }
    }
  }

  return pulls;
}

/** Each key's real chance in a rollTable() table: the last entry takes what is left. */
function tableOdds(table) {
  let left = 1;
  return table.map(([key, weight], i) => {
    const odds = i === table.length - 1 ? left : Math.min(left, weight);
    left -= odds;
    return [key, odds];
  });
}

function meanValue(list) {
  return list?.length ? list.reduce((sum, card) => sum + sellValue(card), 0) / list.length : 0;
}

/**
 * What one pack sells for on average: every slot's odds times the mean card
 * of the pool it draws from. It skips ripPack's no-repeats rule, which moves
 * the answer by cents.
 */
export function packValue(set, cards) {
  const pools = poolsFrom(cards, set);
  const reverse = (kind) => meanValue(reversePoolFor(pools, kind));
  const draw = (key, slot) => {
    if (key === "reverse") {
      return slot.kinds ? tableOdds(slot.kinds).reduce((sum, [kind, p]) => sum + p * reverse(kind), 0) : reverse("cosmos");
    }
    return key === "pokeball" || key === "masterball" ? reverse(key) : meanValue(pools[key]);
  };
  let total = 0;
  for (const slot of set.slots) {
    let each;
    if (slot.pool === "rare-slot") {
      each = tableOdds(slot.table).reduce((sum, [key, p]) => sum + p * meanValue(pools[key]), 0);
    } else if (slot.pool === "art-slot" || slot.pool === "reverse") {
      each = tableOdds(slot.table || [["reverse", 1]]).reduce((sum, [key, p]) => sum + p * draw(key, slot), 0);
    } else {
      each = meanValue(pools[slot.pool]);
    }
    total += each * slot.count;
  }
  return total;
}

/**
 * The promo ids one box of `offer` holds: all of them, or `pick` at random.
 */
export function drawPromos(offer) {
  const promos = [...(offer?.promos || [])];
  if (!offer?.pick) return promos;
  for (let i = promos.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [promos[i], promos[j]] = [promos[j], promos[i]];
  }
  return promos.slice(0, offer.pick);
}

/**
 * A sealed product's contents on average: its promos at market plus every
 * pack's mean value, special packs included.
 */
export function contentsValue(offer, set, cards) {
  const byId = new Map(cards.map((card) => [card.id, card]));
  const promos = offer.promos || [];
  let total = promos.reduce((sum, id) => sum + (byId.has(id) ? sellValue(byId.get(id)) : 0), 0);
  // A box with `pick` of its promos holds each one pick / promos.length of the time.
  if (offer.pick && promos.length) total *= offer.pick / promos.length;
  total += (Number(offer.packs) || 0) * packValue(set, cards);
  for (const [key, count] of Object.entries(offer.special || {})) {
    const special = set.specialPacks?.[key];
    if (special) total += count * packValue({ ...set, slots: special.slots }, cards);
  }
  return total;
}

/**
 * The coins a product costs: its market price, but never less than what is
 * inside is worth on average. Before release a box's promos can sell for more
 * than the box (the 30th Celebration Ultra-Premium Collections); at market it
 * would pay out more than it costs on every open. `market` keeps the real
 * price for the card to show.
 */
export function priceOffer(offer, set, cards) {
  if (!offer) return offer;
  const floor = Math.ceil(contentsValue(offer, set, cards));
  return floor > offer.price ? { ...offer, market: offer.price, price: floor } : offer;
}
