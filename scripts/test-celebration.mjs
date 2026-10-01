// 30th Celebration pack shape and odds. Run: node scripts/test-celebration.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import { ripPack, isHit } from "../js/engine.js";
import { BASIC_ENERGY, findOffer, getSet, homeCards, promoOffers, sealedOffers } from "../js/catalog.js";

const root = new URL("../", import.meta.url);
const set = getSet("me55");
assert.equal(set.id, "me55");
const cards = [...JSON.parse(fs.readFileSync(new URL(set.dataFile, root))), ...BASIC_ENERGY];
// The ME black star promos in the file are listed under ME Black Star Promos (js/card-home.js).
assert.equal(homeCards(set, [cards]).length - BASIC_ENERGY.length, set.totalCount);
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
}
// Every product costs its TCGplayer market price, even when its promos sell for more.
assert.equal(findOffer(sealed.me55, products.me55, "upc-day").price, products.me55.find((p) => p.id === "upc-day").price);
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
console.log("30th Celebration checks passed: 6-card packs, one Pikachu, one hit slot, no box, promos only in their products, products at market, odds within tolerance.");
