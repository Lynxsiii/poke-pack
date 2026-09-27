// 30th Celebration pack shape and odds. Run: node scripts/test-celebration.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import { ripPack, isHit } from "../js/engine.js";
import { BASIC_ENERGY, getSet, sealedOffers } from "../js/catalog.js";

const root = new URL("../", import.meta.url);
const set = getSet("me55");
assert.equal(set.id, "me55");
const cards = [...JSON.parse(fs.readFileSync(new URL(set.dataFile, root))), ...BASIC_ENERGY];
assert.equal(cards.length - BASIC_ENERGY.length, set.totalCount);
assert.equal(new Set(cards.map((c) => c.id)).size, cards.length, "card ids are unique");
assert.equal(new Set(cards.map((c) => c.number)).size, cards.length - BASIC_ENERGY.length + 1, "mirror stems are unique");

const sealed = JSON.parse(fs.readFileSync(new URL("data/sealed.json", root)));
assert.deepEqual(sealedOffers(sealed.me55).map((o) => o.id), ["eliteTrainerBox", "boosterBundle"], "special set: no booster box");

const N = 60000;
const hits = {};
for (let i = 0; i < N; i += 1) {
  const pack = ripPack(set, cards);
  assert.equal(pack.length, 6);
  assert.equal(pack.filter((c) => c.rarity === "Pikachu Rare").length, 1, "one Pikachu per pack");
  assert.equal(pack.filter((c) => c.energy).length, 1, "one basic Energy per pack");
  assert.ok(pack.every((c) => !c.reverse), "no reverse holos in this set");
  assert.ok(pack.filter(isHit).length <= 1, "one hit slot");
  for (const c of pack) {
    if (!isHit(c)) continue;
    const key = c.promo ? "Futuristic promo" : c.rarity;
    hits[key] = (hits[key] || 0) + 1;
  }
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
near("Futuristic promo", 1 / 120, 0.003);
console.log("30th Celebration checks passed: 6-card packs, one Pikachu, one hit slot, no box, odds within tolerance.");
