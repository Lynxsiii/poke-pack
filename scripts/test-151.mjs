// Scarlet & Violet 151 pack shape and odds. Run: node scripts/test-151.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import { ripPack } from "../js/engine.js";
import { BASIC_ENERGY, findOffer, getSet, promoOffers, sealedOffers } from "../js/catalog.js";

const root = new URL("../", import.meta.url);
const set = getSet("sv3pt5");
assert.equal(set.id, "sv3pt5");
const cards = [...JSON.parse(fs.readFileSync(new URL(set.dataFile, root))), ...BASIC_ENERGY];
assert.equal(cards.length - BASIC_ENERGY.length, set.totalCount);
assert.equal(new Set(cards.map((c) => c.id)).size, cards.length, "card ids are unique");
const byId = Object.fromEntries(cards.map((c) => [c.id, c]));

// The eight Cosmos holo Energies: their own foil, never a plain Energy.
const cosmos = cards.filter((c) => c.energy && c.foilAs === "Cosmos");
assert.equal(cosmos.length, 8, "one Cosmos holo Energy per basic type");
assert.ok(cosmos.every((c) => c.foilMap && c.market > 0 && c.image.startsWith("assets/")), "Cosmos Energies have a map, a scan and a price");

// Promo products: every promo is a real card of this set, flagged as a promo.
const sealed = JSON.parse(fs.readFileSync(new URL("data/sealed.json", root)));
const products = JSON.parse(fs.readFileSync(new URL("data/products.json", root)));
for (const offer of [...promoOffers(products.sv3pt5), ...sealedOffers(sealed.sv3pt5, products.sv3pt5)]) {
  for (const id of offer.promos) {
    assert.ok(byId[id], `${offer.id}: ${id} is in data/sv3pt5.json`);
    assert.ok(byId[id].promo && byId[id].rarity === "Promo" && byId[id].market > 0, `${id} is a priced promo`);
  }
}
assert.deepEqual(findOffer(sealed.sv3pt5, products.sv3pt5, "eliteTrainerBox").promos, ["sv3pt5-svp051"], "the ETB carries its Snorlax");
assert.ok(["1", "4", "7", "25"].every((n) => byId[`sv3pt5-${n}-costco`].foilAs === "Reverse Cosmos"), "Costco promos are reverse cosmos");
assert.equal(byId["sv3pt5-205-metal"].foilAs, "Metal", "the Ultra-Premium Collection Mew ex is brass, not a gold foil print");

// A demigod pack: one starter's line in the reverse, rare and art slots.
const lines = set.godPack.lines;
assert.ok(lines.flat().every((id) => byId[id]), "demigod cards exist");
for (let i = 0; i < 200; i += 1) {
  const pack = ripPack({ ...set, godPack: { ...set.godPack, rate: 1 } }, cards);
  assert.equal(pack.length, 11);
  const god = pack.filter((c) => lines.flat().includes(c.id));
  assert.ok(lines.some((line) => line.every((id) => god.some((c) => c.id === id))), "a whole line");
  assert.ok(god.every((c) => !c.reverse), "demigod cards are not reverses");
}

const N = 60000;
const hits = {};
let foilEnergy = 0;
for (let i = 0; i < N; i += 1) {
  const pack = ripPack(set, cards);
  assert.equal(pack.length, 11, "10 cards and an Energy");
  assert.equal(pack.filter((c) => c.energy || c.rarity === "Energy").length, 1, "one Energy per pack");
  assert.ok(pack.every((c) => !c.promo), "promos never come in packs");
  if (pack.some((c) => c.foilAs === "Cosmos")) foilEnergy += 1;
  for (const c of pack) if (!c.reverse) hits[c.rarity] = (hits[c.rarity] || 0) + 1;
}
const near = (got, rate, tol, label) => assert.ok(Math.abs(got - rate) <= tol, `${label}: ${got.toFixed(4)} vs ${rate}`);
const god = set.godPack.rate;
near(foilEnergy / N, 0.2483, 0.012, "Cosmos Energy");
near((hits["Double Rare"] || 0) / N, 0.1328, 0.01, "Double Rare");
near((hits["Ultra Rare"] || 0) / N, 0.0644, 0.007, "Ultra Rare");
near((hits["Illustration Rare"] || 0) / N, 0.085 + 2 * god, 0.008, "Illustration Rare");
near((hits["Special Illustration Rare"] || 0) / N, 0.0311 + god, 0.005, "Special Illustration Rare");
near((hits["Hyper Rare"] || 0) / N, 0.0194, 0.004, "Hyper Rare");
console.log("151 checks passed: 11-card packs, one Energy, Cosmos Energies 1 in 4, demigod lines, promos only in their products, odds within tolerance.");
