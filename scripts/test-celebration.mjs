// 30th Celebration pack shape and odds. Run: node scripts/test-celebration.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import { contentsValue, packValue, priceOffer, ripPack, isHit } from "../js/engine.js";
import { BASIC_ENERGY, findOffer, getSet, promoOffers, sealedOffers } from "../js/catalog.js";

const root = new URL("../", import.meta.url);
const set = getSet("me55");
assert.equal(set.id, "me55");
const cards = [...JSON.parse(fs.readFileSync(new URL(set.dataFile, root))), ...BASIC_ENERGY];
assert.equal(cards.length - BASIC_ENERGY.length, set.totalCount);
assert.equal(new Set(cards.map((c) => c.id)).size, cards.length, "card ids are unique");
assert.equal(new Set(cards.map((c) => c.number)).size, cards.length - BASIC_ENERGY.length + 1, "mirror stems are unique");

const sealed = JSON.parse(fs.readFileSync(new URL("data/sealed.json", root)));
const products = JSON.parse(fs.readFileSync(new URL("data/products.json", root)));
assert.deepEqual(sealedOffers(sealed.me55).map((o) => o.id), ["eliteTrainerBox", "boosterBundle"], "special set: no booster box");

// Promo products: every promo is a real card of this set, flagged as a promo,
// and the Pikachu ex Futuristic promos come in their Ultra-Premium Collections.
const byId = Object.fromEntries(cards.map((c) => [c.id, c]));
const offers = promoOffers(products.me55);
assert.ok(offers.length >= 15, "30th Celebration sells its promo products");
for (const offer of [...offers, ...sealedOffers(sealed.me55, products.me55)]) {
  for (const id of offer.promos) {
    assert.ok(byId[id], `${offer.id}: ${id} is in data/me55.json`);
    assert.ok(byId[id].promo && byId[id].rarity === "Promo", `${id} is a promo`);
  }
  for (const key of Object.keys(offer.special)) assert.ok(set.specialPacks?.[key], `${offer.id}: special pack ${key}`);
  // No product pays out more than it costs on average.
  const priced = priceOffer(offer, set, cards);
  assert.ok(priced.price >= offer.price, `${offer.id} never costs less than market`);
  assert.ok(priced.price >= contentsValue(offer, set, cards), `${offer.id} costs at least what's inside`);
}
assert.ok(priceOffer(findOffer(sealed.me55, products.me55, "upc-day"), set, cards).market, "the Day promos outprice the box");
assert.deepEqual(findOffer(sealed.me55, products.me55, "eliteTrainerBox").promos, ["me55-mep101"], "the ETB carries its Nidorina");
assert.deepEqual(findOffer(sealed.me55, products.me55, "upc-day").promos, ["me55-mep107", "me55-mep108"]);
assert.deepEqual(findOffer(sealed.me55, products.me55, "upc-night").promos, ["me55-mep109", "me55-mep110"]);
const classic = ripPack({ ...set, slots: set.specialPacks.classic.slots }, cards);
assert.equal(classic.length, 3, "a Classic Collection pack is three cards");
assert.ok(classic.every((c) => c.rarity === "Classic Collection"), "and all three are Classic Collection");

const N = 60000;
const hits = {};
for (let i = 0; i < N; i += 1) {
  const pack = ripPack(set, cards);
  assert.equal(pack.length, 6);
  assert.equal(pack.filter((c) => c.rarity === "Pikachu Rare").length, 1, "one Pikachu per pack");
  assert.equal(pack.filter((c) => c.energy).length, 1, "one basic Energy per pack");
  assert.ok(pack.every((c) => !c.reverse), "no reverse holos in this set");
  assert.ok(pack.filter(isHit).length <= 1, "one hit slot");
  assert.ok(pack.every((c) => !c.promo), "promos never come in packs");
  for (const c of pack) if (isHit(c)) hits[c.rarity] = (hits[c.rarity] || 0) + 1;
}
const near = (rarity, rate, tol) => {
  const got = (hits[rarity] || 0) / N;
  assert.ok(Math.abs(got - rate) <= tol, `${rarity}: ${got.toFixed(4)} vs ${rate}`);
};
near("Double Rare", 0.25, 0.012);
near("Illustration Rare", 0.2, 0.012);
near("Classic Collection", 0.1, 0.008);
near("Special Illustration Rare", 1 / 21, 0.006);
near("Futuristic Rare", 1 / 120, 0.003);
// The price floor's pack value: each slot's odds times its pool's mean card.
const toy = [
  { id: "c1", rarity: "Common", market: 0.1 },
  { id: "c2", rarity: "Common", market: 0.3 },
  { id: "r1", rarity: "Rare", market: 1 },
  { id: "d1", rarity: "Double Rare", market: 5 },
  { id: "e1", rarity: "Energy", energy: true, market: 0.05 },
];
const toySlots = [
  { pool: "common", count: 3 },
  { pool: "rare-slot", count: 1, table: [["double", 0.25], ["rare", 1]] },
  { pool: "energy", count: 1 },
];
assert.equal(Math.round(packValue({ slots: toySlots }, toy) * 100) / 100, 0.6 + 0.25 * 5 + 0.75 * 1 + 0.05);
assert.equal(Math.round(contentsValue({ packs: 2, promos: ["d1", "r1"], pick: 1 }, { slots: toySlots }, toy) * 100) / 100, 2 * 2.65 + 3);
console.log("30th Celebration checks passed: 6-card packs, one Pikachu, one hit slot, no box, promos only in their products, no product below what's inside, odds within tolerance.");
