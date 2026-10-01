// Trick or Trade, McDonald's and the Scarlet & Violet Energy runs.
// Run: node scripts/test-side-sets.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import { ripPack } from "../js/engine.js";
import { BASIC_ENERGY, PLAYABLE_SETS, getSet, promoOffers } from "../js/catalog.js";

const root = new URL("../", import.meta.url);
const read = (path) => JSON.parse(fs.readFileSync(new URL(path, root)));
const sealed = read("data/sealed.json");
const products = read("data/products.json");

const SIDE = {
  tot23: { packSize: 3, holos: 10 },
  tot24: { packSize: 3, holos: 10 },
  mcd23: { packSize: 4, holos: 6 },
  mcd24: { packSize: 4, holos: 7 },
  mcd17: { packSize: 1, holos: 12 },
  mcd18: { packSize: 1, holos: 12 },
  mcd19: { packSize: 1, holos: 12 },
};

for (const [id, want] of Object.entries(SIDE)) {
  const set = getSet(id);
  assert.equal(set.id, id);
  assert.ok(PLAYABLE_SETS.includes(set), `${id} is playable`);
  assert.equal(set.packSize, want.packSize);
  const data = read(set.dataFile);
  assert.equal(data.length, set.totalCount, `${id}: totalCount matches data`);
  assert.equal(new Set(data.map((c) => c.id)).size, data.length, `${id}: ids are unique`);
  for (const path of set.wrappers.flatMap((w) => [w.art, w.artFallback])) {
    assert.ok(fs.existsSync(new URL(path, root)), `${id}: ${path} exists`);
  }
  for (const kind of ["logo", "symbol"]) {
    assert.ok(fs.existsSync(new URL(`assets/cards/sets/${id}-${kind}.webp`, root)), `${id} has a ${kind}`);
  }
  for (const card of data) {
    for (const path of [card.image, card.imageSmall, card.foilMap].filter(Boolean)) {
      assert.ok(fs.existsSync(new URL(path, root)), `${card.id}: ${path} exists`);
    }
    assert.ok(card.market > 0, `${card.id} has a market price`);
    assert.ok(card.tcgplayerId, `${card.id} keeps its TCGplayer listing`);
    assert.ok(!card.promo, `${card.id} comes in packs`);
    if (card.holo) {
      assert.ok(card.foilMap && card.foilAs, `${card.id}: a holo carries its foil map and finish`);
    } else if (card.rarity === "Rare") {
      assert.equal(card.foilAs, "Common", `${card.id}: a non-holo Rare stays plain`);
    }
  }
  assert.equal(data.filter((c) => c.holo).length, want.holos, `${id}: ${want.holos} holos`);
  assert.ok(sealed[id]?.boosterPack > 0, `${id}: one pack is priced`);

  const cards = [...data, ...BASIC_ENERGY];
  for (let i = 0; i < 3000; i += 1) {
    const pack = ripPack(set, cards);
    assert.equal(pack.length, want.packSize);
    assert.equal(pack.filter((c) => c.holo).length, 1, "one holo a pack");
    assert.ok(pack.at(-1).holo, "the holo comes last");
    assert.ok(pack.every((c) => !c.energy), "no Energy in these packs");
    assert.equal(new Set(pack.map((c) => c.id)).size, pack.length, "no card twice in a pack");
  }
}

// Trick or Trade 2024 keeps every card's own number and its Cosmos holos.
const tot24 = read("data/tot24.json");
assert.equal(tot24.find((c) => c.name === "Darkrai").printedNumber, "136/197");
assert.ok(tot24.filter((c) => c.holo).every((c) => c.foilAs === "Cosmos"));
assert.ok(read("data/mcd23.json").filter((c) => c.holo).every((c) => c.foilAs === "Confetti"));
// McDonald's 2017-2019: one Sun & Moon reprint to a Happy Meal, every card a holo in the SM finish.
for (const id of ["mcd17", "mcd18", "mcd19"]) {
  const cards = read(`data/${id}.json`);
  assert.ok(cards.every((c) => c.era === "sm" && c.holo && c.foilAs === "Rare Holo"), `${id}: SM holos`);
  assert.equal(getSet(id).cost, sealed[id].boosterPack, `${id}: the pack costs the mean of its cards`);
  const mean = cards.reduce((a, c) => a + c.market, 0) / cards.length;
  assert.ok(Math.abs(mean - getSet(id).cost) < 0.01, `${id}: cost ${getSet(id).cost} vs mean ${mean.toFixed(2)}`);
}

// The BOOster Bundles open as their packs.
assert.deepEqual(promoOffers(products.tot23).map((o) => [o.id, o.packs]), [["booster-bundle-50", 50]]);
assert.deepEqual(
  promoOffers(products.tot24).map((o) => [o.id, o.packs]),
  [["booster-bundle-35", 35], ["booster-bundle-120", 120]],
);

// The Energy slot keeps to the set's run of basic Energy.
// 24 Scarlet & Violet prints plus the eight Sword & Shield, eight Mega Evolution, sixteen Sun & Moon (2017, 2019)
// nine XY (2013, Fairy included) and eight Black & White (2011) ones.
assert.equal(BASIC_ENERGY.length, 73);
for (const card of BASIC_ENERGY) {
  for (const path of [card.image, card.imageSmall]) assert.ok(fs.existsSync(new URL(path, root)), path);
}
const RUNS = { sv1: "", sv6: "", sv7: "tera", sv8: "tera", sv9: "tera", sv10: "tera", zsv10pt5: "unova", rsv10pt5: "unova", me5: "" };
for (const [id, run] of Object.entries(RUNS)) {
  const set = getSet(id);
  assert.equal(set.id, id);
  const cards = [...read(set.dataFile), ...BASIC_ENERGY];
  const seen = new Set();
  for (let i = 0; i < 300; i += 1) {
    for (const c of ripPack(set, cards)) if (c.energy && c.id.startsWith("energy-")) seen.add(c.energyPrint || "");
  }
  assert.deepEqual([...seen], [run], `${id} opens ${run || "SVE 001-008"} Energy`);
}

console.log("Side set checks passed: Trick or Trade and McDonald's are playable with scans, foil maps, prices, one holo a pack and their bundles; each set's Energy slot keeps to its run.");
