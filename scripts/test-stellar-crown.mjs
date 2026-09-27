// Stellar Crown pack shape, odds and products. Run: node scripts/test-stellar-crown.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import { ripPack, isHit } from "../js/engine.js";
import { BASIC_ENERGY, PLAYABLE_SETS, ROADMAP, findOffer, getSet, promoOffers, sealedOffers } from "../js/catalog.js";

const root = new URL("../", import.meta.url);
const set = getSet("sv7");
assert.equal(set.id, "sv7");
assert.ok(PLAYABLE_SETS.includes(set), "Stellar Crown is playable");
assert.ok(ROADMAP.every((block) => block.sets.every((s) => s.id !== "sv7")), "and not queued on the roadmap too");
const cards = [...JSON.parse(fs.readFileSync(new URL(set.dataFile, root))), ...BASIC_ENERGY];
assert.equal(cards.length - BASIC_ENERGY.length, set.totalCount);
assert.equal(new Set(cards.map((c) => c.id)).size, cards.length, "card ids are unique");
assert.equal(cards.filter((c) => !c.promo && !c.energy).length, 175, "142 numbered cards plus 33 secret rares");

// Every card has its scans, and every foil print its TCG Live map.
for (const c of cards.filter((c) => !c.energy)) {
  for (const path of [c.image, c.imageSmall, c.foilMap, c.etchMap].filter(Boolean)) {
    assert.ok(fs.existsSync(new URL(path, root)), `${c.id}: ${path} exists`);
  }
  if (!["Common", "Uncommon"].includes(c.rarity)) assert.ok(c.foilMap, `${c.id} has a foil map`);
}
// The four Stellar Tera ex and their full arts are TCG Live's SV_ULTRA etched
// print, which the shared Tera recipe keys on (Tera subtype, DR or UR).
const tera = cards
  .filter((c) => (c.subtypes || []).includes("Tera") && ["Double Rare", "Ultra Rare"].includes(c.rarity))
  .map((c) => c.number);
assert.deepEqual(tera, ["28", "32", "51", "128", "157", "158", "159"]);

const sealed = JSON.parse(fs.readFileSync(new URL("data/sealed.json", root)));
const products = JSON.parse(fs.readFileSync(new URL("data/products.json", root)));
assert.deepEqual(
  sealedOffers(sealed.sv7, products.sv7).map((o) => o.id),
  ["boosterBox", "eliteTrainerBox", "boosterBundle"],
);
const byId = Object.fromEntries(cards.map((c) => [c.id, c]));
for (const offer of [...promoOffers(products.sv7), ...sealedOffers(sealed.sv7, products.sv7)]) {
  for (const id of offer.promos) assert.ok(byId[id]?.promo, `${offer.id}: ${id} is a promo in data/sv7.json`);
}
assert.deepEqual(findOffer(sealed.sv7, products.sv7, "eliteTrainerBox").promos, ["sv7-svp141"], "the ETB carries its Noctowl");
assert.equal(findOffer(sealed.sv7, products.sv7, "build-battle").pick, 1, "a Build & Battle Box holds one of its four promos");
assert.equal(findOffer(sealed.sv7, products.sv7, "terapagos-upc").packs, 18);

const N = 60000;
const hits = {};
let dachsbun = 0;
let otherDoubles = 0;
for (let i = 0; i < N; i += 1) {
  const pack = ripPack(set, cards);
  assert.equal(pack.length, 11);
  assert.equal(pack.filter((c) => c.energy).length, 1, "one basic Energy per pack");
  assert.equal(pack.filter((c) => c.rarity === "Common" && !c.reverse).length, 4);
  assert.equal(pack.filter((c) => c.rarity === "Uncommon" && !c.reverse).length, 3);
  assert.ok(pack.every((c) => !c.promo), "promos never come in packs");
  // ACE SPEC takes the first reverse slot; IR, SIR and gold the second.
  assert.ok(pack[8].reverse || pack[8].rarity === "ACE SPEC Rare", "slot 9 is a reverse or an ACE SPEC");
  assert.ok(pack[10].reverse || ["Illustration Rare", "Special Illustration Rare", "Hyper Rare"].includes(pack[10].rarity));
  for (const c of pack) if (isHit(c)) hits[c.rarity] = (hits[c.rarity] || 0) + 1;
  const double = pack.find((c) => c.rarity === "Double Rare" && !c.reverse);
  if (double?.name === "Dachsbun ex") dachsbun += 1;
  else if (double) otherDoubles += 1;
}
const near = (rarity, rate, tol) => {
  const got = (hits[rarity] || 0) / N;
  assert.ok(Math.abs(got - rate) <= tol, `${rarity}: ${got.toFixed(4)} vs ${rate}`);
};
// TCGplayer's 8,000-pack study (data/pullrates.json).
near("Double Rare", 0.169, 0.008);
near("Ultra Rare", 0.0675, 0.005);
near("ACE SPEC Rare", 0.0494, 0.004);
near("Illustration Rare", 0.0779, 0.005);
near("Special Illustration Rare", 0.0111, 0.002);
near("Hyper Rare", 0.0073, 0.0016);
const ratio = dachsbun / (otherDoubles / 13);
assert.ok(ratio > 0.45 && ratio < 0.78, `Dachsbun ex is short printed (${ratio.toFixed(2)} of a normal Double Rare)`);
console.log("Stellar Crown checks passed: playable, 175 cards plus 13 promos, scans and foil maps, Tera finishes, products and promos, 11-card packs, odds within tolerance, Dachsbun ex short print.");
