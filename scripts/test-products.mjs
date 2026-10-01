// Promo products for every set in data/products.json. Run: node scripts/test-products.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import { drawPromos, poolsFrom } from "../js/engine.js";
import { BASIC_ENERGY, dataSetsOf, findOffer, getSet, homeCards, PLAYABLE_SETS, promoOffers, sealedOffers, sellValue } from "../js/catalog.js";

const root = new URL("../", import.meta.url);
const read = (path) => JSON.parse(fs.readFileSync(new URL(path, root)));
const products = read("data/products.json");
const sealed = read("data/sealed.json");
let checked = 0;

for (const [setId, list] of Object.entries(products)) {
  if (setId.startsWith("_")) continue;
  const set = getSet(setId);
  assert.equal(set.id, setId, `${setId} is a known set`);
  assert.ok(PLAYABLE_SETS.some((s) => s.id === setId), `${setId} is playable`);
  const cards = [...read(set.dataFile), ...BASIC_ENERGY];
  // Promos are part of the set's binder, so its card count includes them, except
  // the ME black star promos, which are counted under ME Black Star Promos.
  // A promo set that reads other sets' files (XY Black Star Promos) counts across all of them.
  const lists = set.promoSet && set.viewOf ? dataSetsOf(set).map((s) => read(s.dataFile ?? `data/${s.id}.json`)) : [cards];
  assert.equal(homeCards(set, lists).length - (lists.length === 1 ? BASIC_ENERGY.length : 0), set.totalCount, `${setId}: totalCount counts its promos`);
  const byId = Object.fromEntries(cards.map((c) => [c.id, c]));
  const pools = Object.values(poolsFrom(cards, set)).flat();
  assert.ok(pools.every((c) => !c.promo), `${setId}: no promo is in a pack pool`);

  const offers = [...sealedOffers(sealed[setId], list), ...promoOffers(list)];
  assert.ok(offers.length >= list.length, `${setId}: every product is on sale`);
  for (const entry of list) {
    assert.ok(findOffer(sealed[setId], list, entry.id), `${setId}/${entry.id} is sold`);
    if (entry.image) assert.ok(fs.existsSync(new URL(entry.image, root)), `${entry.image} exists`);
  }
  for (const offer of offers) {
    for (const id of offer.promos) {
      const card = byId[id];
      assert.ok(card, `${setId}/${offer.id}: ${id} is in ${set.dataFile}`);
      assert.ok(card.promo && card.rarity === "Promo", `${id} is a promo`);
      assert.ok(fs.existsSync(new URL(card.image, root)), `${id} has its scan`);
      // The Mega Forces Tin promos have no sales yet; they sell at the Promo fallback.
      assert.ok(sellValue(card) > 0, `${id} sells for something`);
    }
    if (offer.pick) {
      assert.ok(offer.pick < offer.promos.length, `${offer.id}: pick is fewer than its promos`);
      const drawn = drawPromos(offer);
      assert.equal(drawn.length, offer.pick);
      assert.ok(drawn.every((id) => offer.promos.includes(id)));
    } else {
      assert.deepEqual(drawPromos(offer), offer.promos);
    }
    // Every product costs its TCGplayer market price, from products.json or sealed.json.
    const market = sealed[setId]?.[offer.id] ?? list.find((entry) => entry.id === offer.id)?.price;
    assert.ok(market > 0, `${offer.id} has a market price`);
    assert.equal(offer.price, Math.round(market * 100) / 100, `${offer.id} costs its market price`);
    checked += 1;
  }
}
console.log(`Promo product checks passed: ${checked} products across ${Object.keys(products).length - 1} sets, promos exist with scans and prices, none in packs, random picks, market prices.`);
