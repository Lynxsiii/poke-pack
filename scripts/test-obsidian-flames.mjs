// Obsidian Flames pack shape, odds, prices and products. Run: node scripts/test-obsidian-flames.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import { ripPack, isHit } from "../js/engine.js";
import { BASIC_ENERGY, findOffer, getSet, PLAYABLE_SETS, promoOffers, sealedOffers } from "../js/catalog.js";

const root = new URL("../", import.meta.url);
const read = (path) => JSON.parse(fs.readFileSync(new URL(path, root)));
const set = getSet("sv3");
assert.equal(set.id, "sv3");
assert.ok(PLAYABLE_SETS.includes(set), "Obsidian Flames can be opened");
const data = read(set.dataFile);
const cards = [...data, ...BASIC_ENERGY];
assert.equal(data.length, set.totalCount);
assert.equal(new Set(cards.map((c) => c.id)).size, cards.length, "card ids are unique");

// The checklist TCG Live and TCGplayer agree on: 230 cards plus 10 promos.
const count = (rarity) => data.filter((c) => c.rarity === rarity && !c.promo).length;
assert.deepEqual(
  ["Common", "Uncommon", "Rare", "Double Rare", "Ultra Rare", "Illustration Rare", "Special Illustration Rare", "Hyper Rare"].map(count),
  [92, 74, 10, 21, 12, 12, 6, 3],
);
assert.equal(data.filter((c) => c.promo).length, 10);
for (const c of data) {
  assert.ok(c.image.startsWith("assets/cards/sv3/") && fs.existsSync(new URL(c.image, root)), `${c.id} scan is local`);
  assert.ok(typeof c.market === "number" && c.market > 0, `${c.id} has a market price`);
  for (const key of ["foilMap", "etchMap"]) {
    if (c[key]) assert.ok(fs.existsSync(new URL(c[key], root)), `${c.id} ${key} ships`);
  }
}
// Every holo print has TCG Live's foil map; commons and uncommons print plain.
for (const c of data) {
  const holo = !["Common", "Uncommon"].includes(c.rarity);
  assert.equal(Boolean(c.foilMap), holo, `${c.id} foil map`);
}
// Tera ex Double and Ultra Rares print etched (TCG Live's DoubleRareC / UltraRareC).
const tera = data.filter((c) => c.subtypes?.includes("Tera") && ["Double Rare", "Ultra Rare"].includes(c.rarity));
assert.deepEqual(tera.map((c) => c.number), ["42", "66", "96", "125", "159", "179", "210", "211", "212", "215"]);
assert.ok(tera.every((c) => c.etchMap), "Tera prints carry their etch");

// Products, at TCGplayer market.
const sealed = read("data/sealed.json");
const products = read("data/products.json");
assert.equal(set.cost, sealed.sv3.boosterPack, "the fallback pack cost matches sealed.json");
assert.deepEqual(sealedOffers(sealed.sv3, products.sv3).map((o) => o.id), ["boosterBox", "eliteTrainerBox", "boosterBundle"]);
assert.deepEqual(findOffer(sealed.sv3, products.sv3, "eliteTrainerBox").promos, ["sv3-svp044"], "the ETB carries its Charmander");
assert.deepEqual(findOffer(sealed.sv3, products.sv3, "pc-etb").promos, ["sv3-svp044-pc", "sv3-svp044"]);
assert.equal(findOffer(sealed.sv3, products.sv3, "build-battle").pick, 1, "one prerelease promo per Build & Battle Box");
const byId = Object.fromEntries(data.map((c) => [c.id, c]));
for (const offer of promoOffers(products.sv3)) {
  assert.ok(offer.price > 0);
  for (const id of offer.promos) assert.ok(byId[id]?.promo, `${offer.id}: ${id} is a promo of this set`);
}

// Odds: TCGplayer's 8,000-pack study.
const N = 80000;
const hits = {};
for (let i = 0; i < N; i += 1) {
  const pack = ripPack(set, cards);
  assert.equal(pack.length, 11);
  assert.equal(pack.filter((c) => c.energy).length, 1, "one basic Energy per pack");
  assert.equal(pack.filter((c) => c.rarity === "Common" && !c.reverse).length, 4);
  assert.equal(pack.filter((c) => c.rarity === "Uncommon" && !c.reverse).length, 3);
  assert.ok(pack.filter(isHit).length <= 2, "a rare slot and an art slot");
  assert.ok(pack.every((c) => !c.promo), "promos never come in packs");
  assert.ok(pack.every((c) => c.rarity !== "ACE SPEC Rare"), "no ACE SPEC before Temporal Forces");
  for (const c of pack) if (isHit(c)) hits[c.rarity] = (hits[c.rarity] || 0) + 1;
}
const near = (rarity, rate, tol) => {
  const got = (hits[rarity] || 0) / N;
  assert.ok(Math.abs(got - rate) <= tol, `${rarity}: ${got.toFixed(4)} vs ${rate}`);
};
near("Double Rare", 0.1361, 0.006);
near("Ultra Rare", 0.0663, 0.004);
near("Illustration Rare", 0.076, 0.004);
near("Special Illustration Rare", 0.0313, 0.003);
near("Hyper Rare", 0.0192, 0.002);
console.log("Obsidian Flames checks passed: 240 cards with local scans, prices and foil maps, Tera etch, products at market, 11-card packs at TCGplayer's rates.");
