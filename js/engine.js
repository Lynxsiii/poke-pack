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
  const pokemonOrTrainer = cards.filter((c) => c.rarity !== "Energy" && !c.energy);
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
    futuristic: pokemonOrTrainer.filter((c) => c.rarity === "Futuristic Rare" && !c.promo),
    // The two Pikachu ex Futuristic promos (MEP 107 and 109) come in the
    // Ultra-Premium Collections, not in packs; the site lets them drop anyway.
    futuristicPromo: pokemonOrTrainer.filter((c) => c.rarity === "Futuristic Rare" && c.promo),
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
