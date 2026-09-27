// Twilight Masquerade (sv6) pack shape, odds, prices, products and foil data.
// Run: node scripts/test-twilight-masquerade.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import { isHit, ripPack } from "../js/engine.js";
import { BASIC_ENERGY, findOffer, getSet, PLAYABLE_SETS, ROADMAP, sealedOffers } from "../js/catalog.js";

const root = new URL("../", import.meta.url);
const read = (path) => JSON.parse(fs.readFileSync(new URL(path, root)));
const set = getSet("sv6");
assert.equal(set.id, "sv6");
assert.ok(PLAYABLE_SETS.includes(set), "Twilight Masquerade is playable");
assert.ok(!ROADMAP.some((block) => block.sets.some((s) => s.id === "sv6")), "and no longer queued on the roadmap");

const data = read(set.dataFile);
const cards = [...data, ...BASIC_ENERGY];
assert.equal(data.length, set.totalCount, "totalCount counts the 226 cards and 10 promos");
assert.equal(data.filter((c) => !c.promo).length, 226);
assert.equal(new Set(data.map((c) => c.id)).size, data.length, "card ids are unique");

// Every card carries its TCGplayer market price and the product it came from.
for (const card of data) {
  assert.ok(card.market > 0, `${card.id} has a market price`);
  assert.ok(Number.isInteger(card.tcgplayerId), `${card.id} links to its TCGplayer product`);
  assert.ok(fs.existsSync(new URL(card.image, root)), `${card.id} has its scan`);
}

// TCG Live foil maps: every holo print has one, the Tera ex and ACE SPECs have
// their etch too, and non-holo Commons and Uncommons have none.
const holo = data.filter((c) => !["Common", "Uncommon"].includes(c.rarity));
for (const card of holo) {
  assert.ok(card.foilMap && fs.existsSync(new URL(card.foilMap, root)), `${card.id} has its foil map`);
}
for (const card of data.filter((c) => ["Common", "Uncommon"].includes(c.rarity))) {
  assert.ok(!card.foilMap, `${card.id} is not a holo print`);
}
const tera = data.filter((c) => (c.subtypes || []).includes("Tera") && ["Double Rare", "Ultra Rare"].includes(c.rarity));
assert.deepEqual(tera.map((c) => Number(c.number)), [25, 29, 40, 64, 106, 112, 130, 190, 191, 192, 194, 198, 199, 200],
  "the Tera ex prints TCG Live lists as DoubleRareC / UltraRareC");
for (const card of [...tera, ...data.filter((c) => c.rarity === "ACE SPEC Rare")]) {
  assert.ok(card.etchMap && fs.existsSync(new URL(card.etchMap, root)), `${card.id} has its etch map`);
}

// The four booster wrappers, the third of which is Dragapult ex.
assert.deepEqual(set.wrappers.map((w) => w.id), ["sinistcha", "ogerpon", "dragapult", "ursaluna"]);
for (const wrap of set.wrappers) {
  assert.ok(fs.existsSync(new URL(wrap.artFallback, root)), `${wrap.id} art exists`);
  assert.ok(data.some((c) => c.id === wrap.cardId), `${wrap.id} names a real card`);
}

// Sealed and promo products at TCGplayer market.
const sealed = read("data/sealed.json").sv6;
const products = read("data/products.json").sv6;
assert.deepEqual(sealedOffers(sealed, products).map((o) => o.id), ["boosterBox", "eliteTrainerBox", "boosterBundle"]);
assert.deepEqual(findOffer(sealed, products, "eliteTrainerBox").promos, ["sv6-svp123"], "the ETB carries Teal Mask Ogerpon");
assert.deepEqual(findOffer(sealed, products, "pc-etb").promos, ["sv6-svp123-pc"], "the Pokémon Center ETB its stamped print");
assert.equal(findOffer(sealed, products, "pc-etb").packs, 11);
const battle = findOffer(sealed, products, "build-battle");
assert.equal(battle.pick, 1, "a Build & Battle Box holds one of its four promos");
assert.deepEqual(battle.promos, ["sv6-svp115", "sv6-svp116", "sv6-svp117", "sv6-svp118"]);

// Pack shape: basic Energy, 4 Commons, 3 Uncommons, a reverse or ACE SPEC,
// the rare slot, and a second reverse or an IR / SIR / gold.
const N = 80000;
const hits = {};
for (let i = 0; i < N; i += 1) {
  const pack = ripPack(set, cards);
  assert.equal(pack.length, 11);
  assert.equal(pack.filter((c) => c.energy).length, 1, "one basic Energy");
  assert.equal(pack.filter((c) => c.rarity === "Common" && !c.reverse).length, 4, "four Commons");
  assert.equal(pack.filter((c) => c.rarity === "Uncommon" && !c.reverse).length, 3, "three Uncommons");
  assert.ok(pack.every((c) => !c.promo), "promos never come in packs");
  for (const c of pack) if (isHit(c)) hits[c.rarity] = (hits[c.rarity] || 0) + 1;
}
// TCGplayer's 8,000-pack study, per pack.
const near = (rarity, rate) => {
  const got = (hits[rarity] || 0) / N;
  const tol = 4 * Math.sqrt((rate * (1 - rate)) / N);
  assert.ok(Math.abs(got - rate) <= tol, `${rarity}: ${got.toFixed(4)} vs ${rate}`);
};
near("Double Rare", 0.1693);
near("Ultra Rare", 0.0661);
near("ACE SPEC Rare", 0.0506);
near("Illustration Rare", 0.0773);
near("Special Illustration Rare", 0.0117);
near("Hyper Rare", 0.0068);

console.log(`Twilight Masquerade checks passed: ${data.length} cards priced and linked, ${holo.length} foil maps, ${tera.length} Tera ex, wrappers, products, and odds over ${N} packs.`);
