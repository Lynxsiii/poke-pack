/* The binder's card picker: searching, filtering and sorting the spare cards.
   Run: node scripts/test-card-picker.mjs */
import assert from "node:assert/strict";
import { RARITY_LABEL, RARITY_ORDER } from "../js/catalog.js";
import { buildFacets, buildRows, filterRows, isFiltered, kindOf } from "../js/card-picker-rules.js";

const SETS = {
  a: { id: "a", name: "Surging Sparks", printedTotal: 191, released: "November 8, 2024" },
  b: { id: "b", name: "Base Set", printedTotal: 102, released: "January 9, 1999" },
  c: { id: "c", name: "Mega Evolution", printedTotal: 132, released: "July 17, 2026" },
};
const card = (id, name, number, rarity, extra = {}) => ({ id, name, number, rarity, supertype: "Pokémon", types: ["Colorless"], ...extra });
const spares = [
  { card: card("a-1", "Pikachu ex", "57", "Double Rare", { types: ["Lightning"], market: 10 }), spare: 1 },
  { card: card("a-2", "Pikachu", "58", "Common", { types: ["Lightning"], market: 0.2 }), spare: 3 },
  { card: card("b-58", "Pikachu", "58", "Common", { types: ["Lightning"], market: 3 }), spare: 1 },
  { card: card("b-4", "Charizard", "4", "Rare Holo", { types: ["Fire"], market: 300 }), spare: 1 },
  { card: card("b-95", "Double Colorless Energy", "95", "Uncommon", { supertype: "Energy", types: [] }), spare: 2 },
  { card: card("c-130", "Mew ex", "130", "Special Illustration Rare", { types: ["Psychic"], market: 85 }), spare: 1 },
  { card: card("c-131", "Mewtwo ex", "131", "Double Rare", { types: ["Psychic"], market: 6 }), spare: 1 },
  { card: card("c-9", "Professor's Research", "9", "Uncommon", { supertype: "Trainer", types: [], market: 0.5 }), spare: 1 },
  { card: card("c-tg05", "Eevee", "TG05", "Illustration Rare", { types: ["Colorless"], market: 2 }), spare: 1 },
].map((s) => ({ ...s, set: SETS[s.card.id.split("-")[0]] }));

const rows = buildRows(spares, {
  setOf: (c) => SETS[c.id.split("-")[0]],
  rarityLabel: (r) => RARITY_LABEL[r] || r,
  rarityRank: (r) => RARITY_ORDER.indexOf(r),
  value: (c) => c.market ?? 0.1,
});
const ids = (list) => list.map((r) => r.card.id);
const find = (opts) => ids(filterRows(rows, opts));

// no search: the sort decides
assert.equal(rows.length, 9);
assert.deepEqual(find({ sort: "value" }).slice(0, 3), ["b-4", "c-130", "a-1"]);
assert.equal(rows.find((r) => r.card.id === find({ sort: "newest" })[0]).setId, "c", "newest sets come first");
assert.equal(find({ sort: "name" })[0], "b-4");
assert.equal(find({ sort: "rarity" })[0], "c-130", "the rarest card leads");

// name, set, rarity and type words
assert.deepEqual(new Set(find({ query: "pika" })), new Set(["a-1", "a-2", "b-58"]));
assert.deepEqual(find({ query: "mew" })[0], "c-130", "Mew is Mew, before Mewtwo");
assert.ok(find({ query: "mew" }).includes("c-131"));
assert.deepEqual(find({ query: "mew ex" })[0], "c-130");
assert.deepEqual(new Set(find({ query: "base" })), new Set(["b-58", "b-4", "b-95"]), "a set's name finds its cards");
assert.deepEqual(find({ query: "surging pikachu" }).sort(), ["a-1", "a-2"]);
assert.deepEqual(find({ query: "fire" }), ["b-4"], "a type finds its cards");
assert.deepEqual(find({ query: "trainer" }), ["c-9"]);
assert.ok(find({ query: "special illustration" }).includes("c-130"));
assert.deepEqual(find({ query: "PIKACHU  " }).length, 3, "case and spacing do not matter");
assert.deepEqual(find({ query: "profes" }), ["c-9"], "a word's start is enough");
assert.deepEqual(find({ query: "zzz" }), []);
assert.deepEqual(find({ query: "pikachu charizard" }), [], "every word has to land");

// numbers
assert.deepEqual(find({ query: "130" }), ["c-130"]);
assert.deepEqual(find({ query: "58" }).sort(), ["a-2", "b-58"]);
assert.deepEqual(find({ query: "58/102" }), ["b-58"], "the total picks the set");
assert.deepEqual(find({ query: "#4" }), ["b-4"]);
assert.deepEqual(find({ query: "tg05" }), ["c-tg05"]);
assert.deepEqual(find({ query: "130/132" }), ["c-130"]);
assert.deepEqual(find({ query: "130/191" }), []);

// filters and their facets
assert.deepEqual(new Set(find({ set: "b" })), new Set(["b-58", "b-4", "b-95"]));
assert.deepEqual(find({ rarity: "Rare Holo" }), ["b-4"]);
assert.deepEqual(new Set(find({ kind: "Psychic" })), new Set(["c-130", "c-131"]));
assert.deepEqual(find({ kind: "Energy" }), ["b-95"]);
assert.deepEqual(find({ set: "c", kind: "Psychic", query: "ex", sort: "value" }), ["c-130", "c-131"]);
assert.deepEqual(find({ set: "a", query: "charizard" }), [], "filters and search both apply");
assert.equal(kindOf({ supertype: "Trainer" }), "Trainer");
assert.equal(kindOf({ energy: true }), "Energy");
assert.equal(kindOf({ supertype: "Pokémon", types: ["Fire"] }), "Fire");
const facets = buildFacets(rows);
assert.deepEqual(facets.sets.map((s) => s.id), ["c", "a", "b"], "sets, newest first");
assert.equal(facets.rarities[0].id, "Special Illustration Rare", "rarities, rarest first");
assert.deepEqual(facets.kinds.slice(0, 2).map((k) => k.id), ["Trainer", "Energy"]);
assert.equal(facets.sets.find((s) => s.id === "b").count, 3);

assert.equal(isFiltered({}), false);
assert.equal(isFiltered({ query: "  " }), false);
assert.equal(isFiltered({ query: "x" }), true);
assert.equal(isFiltered({ set: "a" }), true);

// a big collection stays fast
const big = Array.from({ length: 6000 }, (_, i) => ({
  card: card(`a-${i}`, `Card ${i % 97}`, String(i), "Common", { types: ["Fire"], market: i / 10 }),
  spare: 1,
}));
const bigRows = buildRows(big, { setOf: () => SETS.a, value: (c) => c.market });
const t0 = performance.now();
for (let i = 0; i < 20; i++) filterRows(bigRows, { query: "card 4", sort: "value" });
assert.ok((performance.now() - t0) / 20 < 60, "a search over 6,000 cards should take well under a frame or two");

console.log("card picker rules ok");
