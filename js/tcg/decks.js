/**
 * Decks: what makes one legal, building one for the player, building one for the bot.
 * Pure rules, shared with the Worker later (a wager match must check both decks
 * against what each player owns, docs/tcg-plan.md).
 *
 *   deck  { id, name, format: "standard" | "half", cards: { catalogId: copies } }
 *
 * A player may only use cards they own, as many copies as they own. Basic
 * Energy is the one thing nobody has to own (js/tcg/cards.js FREE_ENERGY), the
 * way every table has a pile of it.
 */

import { FORMATS } from "./engine.js";
import { FREE_ENERGY, isFreeEnergy } from "./cards.js";

export const MAX_DECKS = 12;

export function deckSize(deck) {
  return Object.values(deck.cards || {}).reduce((n, c) => n + c, 0);
}

/** The deck as the engine wants it: one catalog id per physical card. */
export function deckList(deck) {
  return Object.entries(deck.cards || {}).flatMap(([id, n]) => Array(n).fill(id));
}

const isBasicEnergy = (def) => def?.kind === "energy" && def.basic;

/** How many copies of this name the deck already holds (the limit is by name, not by print). */
export function copiesByName(deck, defs) {
  const names = {};
  for (const [id, n] of Object.entries(deck.cards || {})) {
    const def = defs(id);
    if (!def || isBasicEnergy(def)) continue;
    names[def.name] = (names[def.name] || 0) + n;
  }
  return names;
}

/** How many more copies of a card this deck can take: by the name limit, by what is owned, by room. */
export function roomFor(deck, id, owned, defs) {
  const rules = FORMATS[deck.format] || FORMATS.standard;
  const def = defs(id);
  if (!def?.playable) return 0;
  const have = deck.cards[id] || 0;
  const space = rules.deckSize - deckSize(deck);
  if (isBasicEnergy(def)) return isFreeEnergy(id) ? space : Math.min(space, (owned[id] || 0) - have);
  const byName = rules.copies - (copiesByName(deck, defs)[def.name] || 0);
  return Math.max(0, Math.min(space, byName, (owned[id] || 0) - have));
}

/** { ok, problems: [text], size, need }. `owned` is { catalogId: copies }. */
export function checkDeck(deck, owned, defs) {
  const rules = FORMATS[deck.format] || FORMATS.standard;
  const problems = [];
  const size = deckSize(deck);
  let basics = 0;
  for (const [id, n] of Object.entries(deck.cards || {})) {
    const def = defs(id);
    if (!def) {
      problems.push("A card in this deck couldn't be found.");
      continue;
    }
    if (!def.playable) problems.push(`${def.name} can't be played yet.`);
    if (def.kind === "pokemon" && def.stage === "basic") basics += n;
    if (!isFreeEnergy(id) && (owned[id] || 0) < n) problems.push(`You own ${owned[id] || 0} of ${def.name}, the deck has ${n}.`);
  }
  for (const [name, n] of Object.entries(copiesByName(deck, defs))) {
    if (n > rules.copies) problems.push(`${n} copies of ${name}, the limit is ${rules.copies}.`);
  }
  if (size !== rules.deckSize) problems.unshift(size < rules.deckSize ? `${rules.deckSize - size} more card${rules.deckSize - size === 1 ? "" : "s"} to go.` : `${size - rules.deckSize} too many cards.`);
  if (!basics) problems.push("Add at least one Basic Pokémon.");
  return { ok: !problems.length, problems, size, need: rules.deckSize };
}

/* ---------- building a deck ---------- */

const needsOf = (def) => new Set(def.attacks.flatMap((a) => a.cost).filter((c) => c !== "Colorless"));
const fits = (def, types) => [...needsOf(def)].every((t) => types.includes(t));

/** How good a Pokémon is at simply hitting: its best damage for its cost, and its HP. */
function worth(def) {
  const hit = Math.max(0, ...def.attacks.map((a) => a.damage / (a.cost.length + 1)));
  return hit * 2 + def.hp / 10;
}

/**
 * Build a deck from a pool of [{ def, owned }]: the strongest one or two Energy
 * types the pool supports, evolution lines kept together, the rest Energy.
 * Returns { cards, types } or null when the pool has no Basic Pokémon to lead with.
 * `prefer` forces the first type (the bot's themed decks).
 */
export function buildDeck(pool, format = "standard", { prefer = "", rand = Math.random } = {}) {
  const rules = FORMATS[format] || FORMATS.standard;
  const mons = pool.filter((p) => p.def?.kind === "pokemon" && p.def.playable && p.owned > 0);
  const basics = mons.filter((p) => p.def.stage === "basic");
  if (!basics.length) return null;

  // Which Energy type carries the most good Basic Pokémon?
  const tally = {};
  for (const { def, owned } of basics) {
    const needs = [...needsOf(def)];
    if (needs.length > 1) continue;
    const share = worth(def) * Math.min(owned, rules.copies);
    for (const type of needs.length ? needs : FREE_ENERGY.map((e) => e.type)) tally[type] = (tally[type] || 0) + share * (needs.length ? 1 : 0.25);
  }
  const ranked = Object.keys(tally).sort((a, b) => tally[b] - tally[a] || (rand() < 0.5 ? -1 : 1));
  const first = prefer && tally[prefer] ? prefer : ranked[0];
  if (!first) return null;

  const target = Math.round(rules.deckSize * 0.42);
  const cards = {};
  const names = {};
  let count = 0;
  const add = (id, name, n, owned) => {
    const take = Math.max(0, Math.min(n, owned - (cards[id] || 0), rules.copies - (names[name] || 0), target - count));
    if (!take) return 0;
    cards[id] = (cards[id] || 0) + take;
    names[name] = (names[name] || 0) + take;
    count += take;
    return take;
  };
  const evolutionsOf = (name, types) => mons.filter((p) => p.def.evolvesFrom === name && fits(p.def, types)).sort((a, b) => worth(b.def) - worth(a.def));

  const fill = (types) => {
    const line = (p) => worth(p.def) + (evolutionsOf(p.def.name, types)[0] ? 12 : 0);
    const leads = basics.filter((p) => fits(p.def, types)).sort((a, b) => line(b) - line(a));
    for (const lead of leads) {
      if (count >= target) break;
      const base = add(lead.def.id, lead.def.name, lead.owned, lead.owned);
      // One fewer of each stage up the line, as far as the player owns them.
      let below = names[lead.def.name] || base;
      let from = lead.def.name;
      for (let step = 0; step < 2 && below > 0; step += 1) {
        const next = evolutionsOf(from, types)[0];
        if (!next) break;
        const took = add(next.def.id, next.def.name, Math.max(1, below - 1), next.owned);
        if (!took) break;
        below = took;
        from = next.def.name;
      }
    }
  };

  const types = [first];
  fill(types);
  if (count < target) {
    const second = ranked.find((t) => t !== first);
    if (second) {
      types.push(second);
      fill(types);
    }
  }
  if (!Object.keys(cards).some((id) => mons.find((p) => p.def.id === id)?.def.stage === "basic")) return null;

  // Energy: in proportion to the symbols the chosen attacks ask for.
  const asks = {};
  for (const [id, n] of Object.entries(cards)) {
    for (const type of needsOf(mons.find((p) => p.def.id === id).def)) if (types.includes(type)) asks[type] = (asks[type] || 0) + n;
  }
  if (!Object.keys(asks).length) asks[first] = 1;
  const energy = rules.deckSize - count;
  const total = Object.values(asks).reduce((a, b) => a + b, 0);
  let left = energy;
  const order = Object.keys(asks).sort((a, b) => asks[b] - asks[a]);
  order.forEach((type, i) => {
    const n = i === order.length - 1 ? left : Math.round((energy * asks[type]) / total);
    const id = FREE_ENERGY.find((e) => e.type === type).id;
    cards[id] = Math.min(left, n);
    left -= cards[id];
  });
  return { cards, types };
}

/**
 * A deck for the house bot out of one set's ordinary cards (one-prize Pokémon,
 * as many copies as the format allows), so its strength tracks the set and not luck.
 */
export function buildBotDeck(setDefs, format, rand = Math.random) {
  const rules = FORMATS[format] || FORMATS.standard;
  const seen = new Set();
  const pool = [];
  for (const def of setDefs) {
    if (def?.kind !== "pokemon" || !def.playable || def.prizes > 1 || seen.has(def.name)) continue;
    seen.add(def.name);
    pool.push({ def, owned: rules.copies });
  }
  const types = [...new Set(pool.filter((p) => p.def.stage === "basic").flatMap((p) => [...needsOf(p.def)]))];
  const prefer = types[Math.floor(rand() * types.length)] || "";
  return buildDeck(pool, format, { prefer, rand });
}
