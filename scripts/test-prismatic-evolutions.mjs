// Prismatic Evolutions (sv8pt5) pattern prints, pack shape, odds, prices,
// products and foil data.
// Run: node scripts/test-prismatic-evolutions.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import { isHit, poolsFrom, ripPack } from "../js/engine.js";
import { BASIC_ENERGY, findOffer, getSet, PLAYABLE_SETS, ROADMAP, sealedOffers, sellValue } from "../js/catalog.js";
import { foilExtras } from "../js/foil-maps.js";

const root = new URL("../", import.meta.url);
const read = (path) => JSON.parse(fs.readFileSync(new URL(path, root)));
const set = getSet("sv8pt5");
assert.equal(set.id, "sv8pt5");
assert.ok(PLAYABLE_SETS.includes(set), "Prismatic Evolutions is playable");
assert.ok(!ROADMAP.some((block) => block.sets.some((s) => s.id === "sv8pt5")), "and no longer queued on the roadmap");

const data = read(set.dataFile);
const cards = [...data, ...BASIC_ENERGY];
const byId = Object.fromEntries(data.map((c) => [c.id, c]));
assert.equal(data.length, set.totalCount, "totalCount counts the pattern prints and promos");
assert.equal(new Set(data.map((c) => c.id)).size, data.length, "card ids are unique");
const base = data.filter((c) => !c.pattern && !c.promo);
const pokeball = data.filter((c) => c.pattern === "pokeball");
const masterball = data.filter((c) => c.pattern === "masterball");
assert.equal(base.length, 180);
assert.equal(data.filter((c) => c.promo).length, 23);

// Every card carries its TCGplayer market price and the product it came from.
for (const card of data) {
  assert.ok(card.market > 0, `${card.id} has a market price`);
  assert.ok(Number.isInteger(card.tcgplayerId), `${card.id} links to its TCGplayer product`);
  assert.ok(fs.existsSync(new URL(card.image, root)), `${card.id} has its scan`);
}

// Pattern prints: a Poké Ball print of all 100 Commons, Uncommons and Rares,
// and a Master Ball print of the 67 Pokémon among them (TCGplayer's count).
const cur = base.filter((c) => ["Common", "Uncommon", "Rare"].includes(c.rarity));
assert.equal(cur.length, 100);
assert.deepEqual(pokeball.map((c) => c.base).sort(), cur.map((c) => c.id).sort(), "one Poké Ball print per C/U/R");
assert.deepEqual(masterball.map((c) => c.base).sort(), cur.filter((c) => c.supertype !== "Trainer").map((c) => c.id).sort(),
  "one Master Ball print per C/U/R Pokémon");
for (const print of [...pokeball, ...masterball]) {
  const of = byId[print.base];
  assert.equal(print.rarity, print.pattern === "pokeball" ? "Poké Ball" : "Master Ball");
  assert.equal(print.printedRarity, of.rarity, `${print.id} prints its base card's rarity`);
  assert.equal(print.name, of.name);
  assert.equal(print.image, of.image, `${print.id} shares its base card's scan`);
  assert.notEqual(print.tcgplayerId, of.tcgplayerId, `${print.id} is its own TCGplayer product`);
  assert.ok(print.foilMap && fs.existsSync(new URL(print.foilMap, root)), `${print.id} has its foil map`);
  assert.ok(foilExtras(print, (p) => p).classes.includes("has-foil-map"));
  assert.ok(sellValue(print) === Math.max(0.01, print.market), `${print.id} sells for its own price`);
}
// The gold cards print TCG Live's SV_ULTRA_SCODIX: the Paldean Fates gold
// recipe, glitter and a raised etch (css/holo/shiny-vault.css).
const gold = base.filter((c) => c.rarity === "Hyper Rare");
assert.equal(gold.length, 5);
assert.ok(gold.every((c) => c.finish === "scodix" && c.etchMap), "gold cards are Scodix, with their etch");
// Umbreon's Master Ball print books at many times the base card.
assert.ok(byId["sv8pt5-59-mb"].market > 20 * byId["sv8pt5-59"].market, "Master Ball Umbreon outprices Umbreon");

// Shared pattern textures.
for (const name of ["shards", "pokeball", "masterball"]) {
  assert.ok(fs.existsSync(new URL(`assets/foil/prismatic/${name}.webp`, root)), `${name} texture ships`);
}

// Reverse holos carry TCG Live's reverse print map, and foilExtras() hands it
// to the reverse (and only to the reverse).
for (const card of cur) {
  assert.ok(card.reverseMap && fs.existsSync(new URL(card.reverseMap, root)), `${card.id} has its reverse map`);
  assert.equal(foilExtras({ ...card, reverse: true }, (p) => p).classes, "has-rev-map");
}
assert.ok(!data.some((c) => c.promo && c.reverseMap), "stamped promos do not copy the reverse map");

// The holo prints have their TCG Live foil maps.
for (const card of base.filter((c) => !["Common", "Uncommon"].includes(c.rarity))) {
  assert.ok(card.foilMap && fs.existsSync(new URL(card.foilMap, root)), `${card.id} has its foil map`);
}

// The pools deal the pattern prints, never a reversed base card.
const pools = poolsFrom(cards, set);
assert.equal(pools.pokeballPool.length, 100);
assert.equal(pools.masterballPool.length, 67);
assert.ok(pools.reversePool.every((c) => !c.pattern), "pattern prints are not reverse candidates");
assert.ok(pools.common.every((c) => !c.pattern) && pools.rare.every((c) => !c.pattern));

// The four booster wrappers.
assert.deepEqual(set.wrappers.map((w) => w.id), ["jolteon", "eevee", "umbreon", "glaceon"]);
for (const wrap of set.wrappers) {
  assert.ok(fs.existsSync(new URL(wrap.artFallback, root)), `${wrap.id} art exists`);
  assert.ok(data.some((c) => c.id === wrap.cardId), `${wrap.id} names a real card`);
}

// Sealed and promo products at TCGplayer market.
const sealed = read("data/sealed.json").sv8pt5;
const products = read("data/products.json").sv8pt5;
assert.equal(sealed.boosterPack, set.cost, "a pack costs its market price");
assert.deepEqual(findOffer(sealed, products, "eliteTrainerBox").promos, ["sv8pt5-svp173"], "the ETB carries Eevee");
assert.deepEqual(findOffer(sealed, products, "pc-etb").promos, ["sv8pt5-svp173-pc", "sv8pt5-svp173"]);
assert.equal(findOffer(sealed, products, "pc-etb").packs, 11);
const surprise = findOffer(sealed, products, "surprise-box");
assert.equal(surprise.pick, 1, "a Surprise Box holds one of nine stamped ex");
assert.equal(surprise.promos.length, 9);
assert.deepEqual(sealedOffers(sealed, products).map((o) => o.id), ["eliteTrainerBox", "boosterBundle"],
  "no booster box: Prismatic Evolutions was never sold in one");
assert.equal(products.length, 11);

// Pack shape: basic Energy, 4 Commons, 3 Uncommons, a reverse / Poké Ball /
// ACE SPEC, the rare slot, and a reverse / Master Ball / SIR / gold.
const N = 80000;
const got = {};
for (let i = 0; i < N; i += 1) {
  const pack = ripPack(set, cards);
  assert.equal(pack.length, 11);
  assert.equal(pack.filter((c) => c.energy).length, 1, "one basic Energy");
  assert.equal(pack.filter((c) => c.rarity === "Common" && !c.reverse).length, 4, "four Commons");
  assert.equal(pack.filter((c) => c.rarity === "Uncommon" && !c.reverse).length, 3, "three Uncommons");
  assert.ok(pack.every((c) => !c.promo), "promos never come in packs");
  assert.ok(pack.every((c) => !(c.pattern && c.reverse)), "a pattern print is never also a reverse");
  assert.ok(pack.filter((c) => c.pattern === "pokeball").length <= 1);
  assert.ok(pack.filter((c) => c.pattern === "masterball").length <= 1);
  for (const c of pack) {
    if (isHit(c) || c.pattern) got[c.rarity] = (got[c.rarity] || 0) + 1;
  }
}
// TCGplayer's 1,200-pack study, per pack.
const near = (rarity, rate) => {
  const seen = (got[rarity] || 0) / N;
  const tol = 4 * Math.sqrt((rate * (1 - rate)) / N);
  assert.ok(Math.abs(seen - rate) <= tol, `${rarity}: ${seen.toFixed(4)} vs ${rate}`);
};
near("Poké Ball", 0.331);
near("Double Rare", 0.1651);
near("Ultra Rare", 0.0746);
near("ACE SPEC Rare", 0.0468);
near("Master Ball", 0.0492);
near("Special Illustration Rare", 0.0222);
near("Hyper Rare", 0.0056);
assert.ok(!got["Illustration Rare"], "no Illustration Rares in this set");

console.log(`Prismatic Evolutions checks passed: ${data.length} cards priced and linked, ${pokeball.length} Poké Ball and ${masterball.length} Master Ball prints, wrappers, products, and odds over ${N} packs.`);
