/* Site search: the card index is fresh, and the ranking finds what a person types.
   Run: node scripts/test-search.mjs */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SET_BY_ID, PLAYABLE_SETS, RARITY_LABEL, getSet } from "../js/catalog.js";
import { homeSetId } from "../js/card-home.js";
import { buildSearchIndex } from "./build_search_index.mjs";
import { buildCardList, buildSealedList, searchCards, searchSealed, parseQuery, asksForProduct, norm } from "../js/search-rules.js";
import { numberText } from "../js/search.js";

// 1. data/search-index.json matches the data files (run node scripts/build_search_index.mjs when it does not).
const fresh = await buildSearchIndex();
const stored = JSON.parse(readFileSync(new URL("../data/search-index.json", import.meta.url), "utf8"));
assert.deepEqual(stored, fresh, "data/search-index.json is stale: run node scripts/build_search_index.mjs");

// 2. Every card in it belongs to a set the site knows and can load.
const setOf = (id) => {
  const s = SET_BY_ID[id];
  return s ? { name: s.name, printedTotal: s.printedTotal, released: Date.parse(s.released) || 0 } : null;
};
for (const setId of Object.keys(stored.sets)) {
  const set = SET_BY_ID[setId];
  assert.ok(set?.dataFile, `${setId} has rows in the index but no data file in the catalog`);
}
const cards = buildCardList(stored, { setOf, homeOf: homeSetId, rarityLabel: (r) => RARITY_LABEL[r] || r });
assert.equal(cards.length, Object.values(stored.sets).reduce((n, rows) => n + rows.length, 0), "a card's home set is unknown to the catalog");
assert.ok(cards.length > 20000, "the index should hold every card");

const find = (q, opts) => searchCards(cards, q, opts);
const top = (q) => find(q).hits[0];

// 3. A printed number, with and without its total.
assert.equal(top("177/132")?.id, "me1-177", "177/132 is Mega Venusaur ex");
assert.equal(find("177/132").total, 1);
for (const card of find("177").hits) assert.equal(card.num.n, 177, "a bare number finds cards with that number");
assert.ok(find("177").total > 20, "177 is on many cards");
assert.equal(find("177/999").total, 0, "a total no set prints finds nothing");
assert.equal(top("tg05")?.number, "TG05", "a Trainer Gallery number keeps its letters");
assert.ok(find("5").hits.some((c) => c.number === "TG05"), "digits alone also fit a lettered number");
assert.equal(top("charizard ex 223")?.id, "sv3-223", "name and number together");
assert.equal(top("mew ex 151")?.id, "sv3pt5-151", "Mew ex is not Mewtwo ex");

// 4. Names: accents, apostrophes, set names, rarity words, order of words.
assert.ok(find("flabebe").total >= 5 && find("flabebe").hits.every((c) => norm(c.name).startsWith("flabebe")));
assert.ok(find("farfetchd").total >= 5 && find("farfetch'd").total === find("farfetchd").total);
assert.ok(find("surging sparks pikachu").hits.every((c) => c.setName === "Surging Sparks" && /pikachu/i.test(c.name)));
assert.ok(find("pikachu surging sparks").total === find("surging sparks pikachu").total, "word order does not matter");
assert.ok(find("pikachu illustration rare").hits.every((c) => /illustration rare/i.test(c.rarityLabel)));
assert.equal(find("   ").total, 0);
assert.equal(find("zzzzqqq").total, 0);
// "mep" cards are listed under ME Black Star Promos, not under the set whose file holds them.
const mep = cards.find((c) => c.id.includes("-mep") && c.setId === "mep");
assert.ok(mep && mep.setName === "ME Black Star Promos", "MEP promos are counted under the promo set");

// 5. Paging and speed: a broad query ranks all matches but returns only what is asked for.
const broad = find("pikachu", { limit: 12 });
assert.equal(broad.hits.length, 12);
assert.ok(broad.total > 100);
const t0 = performance.now();
for (let i = 0; i < 20; i++) find("char");
assert.ok((performance.now() - t0) / 20 < 80, "a keystroke should not take 80 ms");

// 6. The number as the card prints it.
assert.equal(numberText(top("177/132")), "177/132");
assert.equal(numberText(top("tg05")), "TG05");

// 7. Sealed products.
const items = [
  { setId: "sv8", id: "eliteTrainerBox", name: "Elite Trainer Box", short: "ETB", kind: "eliteTrainerBox", price: 121.42, cart: true },
  { setId: "sv8", id: "boosterBox", name: "Booster Box", short: "Box", kind: "boosterBox", price: 150, cart: true },
  { setId: "sv8", id: "boosterPack", name: "Booster Pack", short: "Pack", kind: "pack", price: 5, cart: false },
  { setId: "sv3pt5", id: "boosterBundle", name: "Booster Bundle", short: "Bundle", kind: "boosterBundle", price: 30, cart: true },
  { setId: "bw10", id: "blister-lucario", name: "Plasma Blast Three Pack Blister [Lucario]", short: "Blister", kind: "blister", price: 12, cart: true },
];
const sealed = buildSealedList(items, setOf);
const sfind = (q) => searchSealed(sealed, q).hits.map((i) => `${i.setId}/${i.id}`);
assert.deepEqual(sfind("surging sparks etb"), ["sv8/eliteTrainerBox"]);
assert.deepEqual(sfind("surging sparks elite trainer box"), ["sv8/eliteTrainerBox"]);
assert.deepEqual(sfind("surging sparks booster box"), ["sv8/boosterBox"]);
assert.deepEqual(sfind("surging sparks booster pack"), ["sv8/boosterPack"]);
assert.deepEqual(sfind("surging sparks boxes").sort(), ["sv8/boosterBox", "sv8/eliteTrainerBox"].sort());
assert.deepEqual(sfind("151 bundle"), ["sv3pt5/boosterBundle"], "a number can begin a set name");
assert.deepEqual(sfind("lucario blister"), ["bw10/blister-lucario"]);
assert.equal(sfind("177/132").length, 0, "a printed card number finds no product");
assert.equal(sealed.find((i) => i.id === "boosterBox").title, `${getSet("sv8").name} Booster Box`, "plain box names get their set's name");
assert.equal(sealed.find((i) => i.id === "blister-lucario").title, "Plasma Blast Three Pack Blister [Lucario]", "names that carry the set's name are left alone");
assert.ok(asksForProduct(parseQuery("surging sparks etb")) && !asksForProduct(parseQuery("pikachu 25")));

console.log(`Search checks passed: ${cards.length} cards indexed, ${PLAYABLE_SETS.length} sets, index fresh.`);
