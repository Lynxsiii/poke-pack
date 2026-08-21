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
]);

export function poolsFrom(cards) {
  const pokemonOrTrainer = cards.filter((c) => c.rarity !== "Energy" && !c.energy);
  return {
    energy: cards.filter((c) => c.rarity === "Energy" || c.energy),
    common: pokemonOrTrainer.filter((c) => c.rarity === "Common"),
    uncommon: pokemonOrTrainer.filter((c) => c.rarity === "Uncommon"),
    rare: pokemonOrTrainer.filter((c) => c.rarity === "Rare"),
    double: pokemonOrTrainer.filter((c) => c.rarity === "Double Rare"),
    ultra: pokemonOrTrainer.filter((c) => c.rarity === "Ultra Rare"),
    ir: pokemonOrTrainer.filter((c) => c.rarity === "Illustration Rare"),
    sir: pokemonOrTrainer.filter((c) => c.rarity === "Special Illustration Rare"),
    hyper: pokemonOrTrainer.filter((c) => c.rarity === "Mega Hyper Rare"),
    // Ascended Heroes only: Mega Attack Rares share the Ultra Rare slot, which
    // is why that set's UR rate drops from ~1/12 to 1/21.
    megaAttack: pokemonOrTrainer.filter((c) => c.rarity === "Mega Attack Rare"),
    reversePool: pokemonOrTrainer.filter((c) =>
      ["Common", "Uncommon", "Rare"].includes(c.rarity)
    ),
  };
}

function asReverse(card) {
  return { ...card, reverse: true };
}

/** Pitch Black: 4C + 3U + reverse + rare slot + art slot + energy. No pity. */
export function ripPack(set, cards) {
  const pools = poolsFrom(cards);
  const used = new Set();
  const pulls = [];

  for (const slot of set.slots) {
    for (let i = 0; i < slot.count; i += 1) {
      if (slot.pool === "rare-slot") {
        pulls.push(pick(pools[rollTable(slot.table)], used));
      } else if (slot.pool === "art-slot") {
        const key = rollTable(slot.table);
        if (key === "reverse") pulls.push(asReverse(pick(pools.reversePool, used)));
        else pulls.push(pick(pools[key], used));
      } else if (slot.pool === "reverse") {
        pulls.push(asReverse(pick(pools.reversePool, used)));
      } else {
        pulls.push(pick(pools[slot.pool], used));
      }
    }
  }

  return pulls;
}
