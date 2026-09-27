// Shrouded Fable pack shape, chain reverses and odds. Run: node scripts/test-shrouded-fable.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import { ripPack } from "../js/engine.js";
import { BASIC_ENERGY, PLAYABLE_SETS, findOffer, getSet, promoOffers, sealedOffers } from "../js/catalog.js";

const root = new URL("../", import.meta.url);
const set = getSet("sv6pt5");
assert.equal(set.id, "sv6pt5");
assert.ok(PLAYABLE_SETS.includes(set), "Shrouded Fable is playable");
const own = JSON.parse(fs.readFileSync(new URL(set.dataFile, root)));
const cards = [...own, ...BASIC_ENERGY];
assert.equal(own.length, set.totalCount, "99 cards, 6 promos and 8 reverse Energy");
assert.equal(new Set(cards.map((c) => c.id)).size, cards.length, "card ids are unique");

// The reverse holo Energy are this set's own cards, always reverse, always chain.
const revEnergy = own.filter((c) => c.energy);
assert.equal(revEnergy.length, 8);
assert.ok(revEnergy.every((c) => c.reverse && c.reverseKind === "chain" && c.market > 0 && c.tcgplayerId));

const sealed = JSON.parse(fs.readFileSync(new URL("data/sealed.json", root)));
const products = JSON.parse(fs.readFileSync(new URL("data/products.json", root)));
assert.deepEqual(sealedOffers(sealed.sv6pt5).map((o) => o.id), ["eliteTrainerBox", "boosterBundle"], "special set: no booster box");
assert.equal(set.cost, sealed.sv6pt5.boosterPack, "a pack costs its market price");
const byId = Object.fromEntries(cards.map((c) => [c.id, c]));
for (const offer of [...promoOffers(products.sv6pt5), ...sealedOffers(sealed.sv6pt5, products.sv6pt5)]) {
  for (const id of offer.promos) assert.ok(byId[id]?.promo, `${offer.id}: ${id} is a promo in data/sv6pt5.json`);
}
assert.deepEqual(findOffer(sealed.sv6pt5, products.sv6pt5, "eliteTrainerBox").promos, ["sv6pt5-svp129"], "the ETB carries its Pecharunt");
assert.deepEqual(findOffer(sealed.sv6pt5, products.sv6pt5, "sic-greninja").promos, ["sv6pt5-svp132"]);

const N = 60000;
const seen = {};
let reverses = 0;
let chain = 0;
let energyRev = 0;
for (let i = 0; i < N; i += 1) {
  const pack = ripPack(set, cards);
  assert.equal(pack.length, 11);
  assert.equal(pack.filter((c) => c.energy).length, 1, "one Energy a pack");
  for (const c of pack) {
    assert.ok(!c.promo, "promos never come in packs");
    seen[c.rarity] = (seen[c.rarity] || 0) + 1;
    if (c.reverse) {
      reverses += 1;
      if (c.reverseKind === "chain") chain += 1;
      if (c.energy) energyRev += 1;
    }
  }
}
assert.equal(chain, reverses, "every reverse is the chain pattern");
const near = (got, want, tol, label) =>
  assert.ok(Math.abs(got - want) <= tol, `${label}: ${got.toFixed(4)} vs ${want}`);
near(seen["Double Rare"] / N, 0.1667, 0.008, "Double Rare");
near(seen["Ultra Rare"] / N, 0.0694, 0.006, "Ultra Rare");
near(seen["ACE SPEC Rare"] / N, 0.05, 0.005, "ACE SPEC");
near(seen["Illustration Rare"] / N, 0.0833, 0.006, "Illustration Rare");
near(seen["Special Illustration Rare"] / N, 0.0149, 0.003, "SIR");
near(seen["Hyper Rare"] / N, 0.0078, 0.002, "Hyper Rare");
near(energyRev / N, 0.1667, 0.008, "reverse Energy");

console.log("Shrouded Fable checks passed: 11-card packs, one Energy, chain reverses (Energy included), products at market, odds within tolerance.");
