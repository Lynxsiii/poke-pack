// Paldean Fates pack shape, odds and products. Run: node scripts/test-paldean-fates.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import { ripPack, isHit } from "../js/engine.js";
import { BASIC_ENERGY, PLAYABLE_SETS, ROADMAP, findOffer, getSet, promoOffers, sealedOffers } from "../js/catalog.js";

const root = new URL("../", import.meta.url);
const set = getSet("sv4pt5");
assert.equal(set.id, "sv4pt5");
assert.ok(PLAYABLE_SETS.includes(set), "Paldean Fates is playable");
assert.ok(ROADMAP.every((block) => block.sets.every((s) => s.id !== "sv4pt5")), "and not queued on the roadmap too");
const cards = [...JSON.parse(fs.readFileSync(new URL(set.dataFile, root))), ...BASIC_ENERGY];
assert.equal(cards.length - BASIC_ENERGY.length, set.totalCount);
assert.equal(new Set(cards.map((c) => c.id)).size, cards.length, "card ids are unique");
assert.equal(cards.filter((c) => !c.promo && !c.energy).length, 245, "91 numbered cards plus 154 secret rares");

const count = (rarity) => cards.filter((c) => !c.promo && c.rarity === rarity).length;
assert.equal(count("Shiny Rare"), 120);
assert.equal(count("Shiny Ultra Rare"), 12);
assert.equal(count("Hyper Rare"), 6);

// Every card has its scans, and every foil print its TCG Live maps. The
// shinies also carry the etch's line direction, which lights their rings.
for (const c of cards.filter((c) => !c.energy)) {
  for (const path of [c.image, c.imageSmall, c.foilMap, c.etchMap, c.etchAngle].filter(Boolean)) {
    assert.ok(fs.existsSync(new URL(path, root)), `${c.id}: ${path} exists`);
  }
  const rarity = c.foilAs || c.rarity;
  if (rarity === "Shiny Rare" || rarity === "Shiny Ultra Rare") {
    assert.ok(c.foilMap && c.etchMap && c.etchAngle, `${c.id} has foil, etch and line-direction maps`);
  }
}
// The gold cards are TCG Live's SV_ULTRA_SCODIX print.
assert.ok(cards.filter((c) => c.rarity === "Hyper Rare").every((c) => c.finish === "scodix" && c.etchMap));

const sealed = JSON.parse(fs.readFileSync(new URL("data/sealed.json", root)));
const products = JSON.parse(fs.readFileSync(new URL("data/products.json", root)));
const byId = Object.fromEntries(cards.map((c) => [c.id, c]));
for (const offer of [...promoOffers(products.sv4pt5), ...sealedOffers(sealed.sv4pt5, products.sv4pt5)]) {
  for (const id of offer.promos || []) assert.ok(byId[id]?.promo, `${offer.id}: ${id} is a promo in data/sv4pt5.json`);
  assert.ok(offer.price > 0, `${offer.id} has a market price`);
}
assert.deepEqual(findOffer(sealed.sv4pt5, products.sv4pt5, "eliteTrainerBox").promos, ["sv4pt5-svp075"], "the ETB carries its Mimikyu");
assert.equal(findOffer(sealed.sv4pt5, products.sv4pt5, "premium-paradox").packs, 11);

const N = 60000;
const hits = {};
let shinySlot = 0;
for (let i = 0; i < N; i += 1) {
  const pack = ripPack(set, cards);
  assert.equal(pack.length, 11);
  assert.equal(pack.filter((c) => c.energy).length, 1, "one basic Energy per pack");
  assert.equal(pack.filter((c) => c.rarity === "Common" && !c.reverse).length, 4);
  assert.equal(pack.filter((c) => c.rarity === "Uncommon" && !c.reverse).length, 3);
  assert.ok(pack.every((c) => !c.promo), "promos never come in packs");
  // The Shiny Vault takes the first reverse slot; IR, SIR and gold the second.
  assert.ok(pack[8].reverse || ["Shiny Rare", "Shiny Ultra Rare"].includes(pack[8].rarity), "slot 9 is a reverse or a shiny");
  assert.ok(pack[10].reverse || ["Illustration Rare", "Special Illustration Rare", "Hyper Rare"].includes(pack[10].rarity));
  if (!pack[8].reverse) shinySlot += 1;
  for (const c of pack) if (isHit(c)) hits[c.rarity] = (hits[c.rarity] || 0) + 1;
}
const near = (rarity, rate, tol) => {
  const got = (hits[rarity] || 0) / N;
  assert.ok(Math.abs(got - rate) <= tol, `${rarity}: ${got.toFixed(4)} vs ${rate}`);
};
// TCGplayer's study of more than 1,500 packs (data/pullrates.json).
near("Double Rare", 0.1589, 0.008);
near("Ultra Rare", 0.0661, 0.005);
near("Shiny Rare", 0.2544, 0.01);
near("Shiny Ultra Rare", 0.0772, 0.005);
near("Illustration Rare", 0.0722, 0.005);
near("Special Illustration Rare", 0.0172, 0.0025);
near("Hyper Rare", 0.0161, 0.0025);
assert.ok(Math.abs(shinySlot / N - 0.3316) < 0.01, "about one pack in three has a shiny");
console.log("Paldean Fates checks passed: playable, 245 cards plus 19 promos, scans and foil maps, Shiny Vault and Scodix maps, products and promos, 11-card packs, odds within tolerance.");
