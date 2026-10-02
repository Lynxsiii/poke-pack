/**
 * The page's live prices (js/liveprices.js): the Worker's /api/prices/latest
 * lands on every card, sealed table row, product and pack cost; a set the
 * Worker has no row for keeps its baked price (no TCGdex call is made for a
 * set it covers); and a failed request leaves everything as it was.
 */
import assert from "node:assert/strict";

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
const listeners = {};
globalThis.document = { hidden: false, readyState: "loading", addEventListener() {} };
globalThis.window = {
  setInterval: () => 0,
  setTimeout: (fn) => (listeners.kick = fn),
  addEventListener: () => {},
};

const calls = [];
let latest = {
  sets: {
    sv1: { day: "2026-10-02", cards: { "sv1-1": 0.5, "sv1-2": 0 }, sealed: { boosterPack: 7.25, boosterBox: 250, "etb-miraidon": 99.5 } },
  },
};
let down = false;
globalThis.fetch = async (url) => {
  calls.push(String(url));
  if (down || !String(url).startsWith("/api/prices/latest")) return new Response("", { status: 503 });
  return Response.json(latest);
};

const { startLivePrices, applyLatestSealed } = await import("../js/liveprices.js");

const sv1 = [{ id: "sv1-1", number: "1", name: "Pineco", market: 0.1 }, { id: "sv1-2", number: "2", name: "Nope", market: 0.2 }];
const old = [{ id: "base1-1", number: "1", name: "Alakazam", market: 40 }];
const sealed = { sv1: { boosterPack: 9, boosterBox: 300, eliteTrainerBox: 130, _x: "keep" } };
const products = { sv1: [{ id: "etb-miraidon", price: 145 }, { id: "pc-etb", price: 300 }] };
const playable = [{ id: "sv1", cost: 9 }, { id: "base1", cost: 5 }];
let updates = 0;
let sealedLoads = 0;
const live = startLivePrices({
  sets: () => [{ id: "sv1", cards: sv1 }, { id: "base1", cards: old }],
  activeId: () => "sv1",
  refreshSealed: async () => {
    sealedLoads += 1;
    applyLatestSealed(sealed, products, playable);
  },
  onUpdate: () => (updates += 1),
});
await live.tick();

assert.equal(sv1[0].market, 0.5, "the Worker's price did not land on the card");
assert.equal(sv1[1].market, 0.2, "a zero price replaced a card's price");
assert.equal(old[0].market, 40, "a set without a row changed price");
assert.deepEqual(sealed.sv1, { boosterPack: 7.25, boosterBox: 250, eliteTrainerBox: 130, _x: "keep" });
assert.deepEqual(products.sv1.map((p) => p.price), [99.5, 300]);
assert.equal(playable[0].cost, 7.25, "the pack cost did not follow the booster pack");
assert.equal(playable[1].cost, 5);
assert.ok(updates > 0 && sealedLoads === 1);
assert.ok(!calls.some((c) => c.includes("tcgdex") && c.includes("sv01")), "TCGdex was asked about a set the Worker covers");
assert.ok(calls.some((c) => c.includes("tcgdex") || c.includes("pokemontcg")), "the set without a row skipped the fallback");

// A failed refresh keeps the last prices.
down = true;
await live.tick();
assert.equal(sv1[0].market, 0.5);
console.log("Live price checks passed: Worker prices on cards, sealed rows, products and pack costs; fallback only for sets without a row; a failed request changes nothing.");
