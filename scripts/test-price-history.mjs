// Checks data/prices/<set>.json and the chart that reads it.
//
//   node scripts/test-price-history.mjs
//
// Every file must parse, belong to its set, and hold date-ordered positive
// prices; then js/pricechart.js loads one set through a stubbed fetch, folds a
// live price in and renders a year-long chart.
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const dir = join(root, "data", "prices");
const files = (await readdir(dir)).filter((name) => name.endsWith(".json")).sort();
assert.ok(files.length, "no files in data/prices/");

const ISO = /^\d{4}-\d{2}-\d{2}$/;
let series = 0;
let points = 0;
for (const name of files) {
  const setId = name.slice(0, -5);
  const store = JSON.parse(await readFile(join(dir, name), "utf8"));
  assert.equal(store.set, setId, `${name}: "set" is ${store.set}`);
  const cards = JSON.parse(await readFile(join(root, "data", `${setId}.json`), "utf8"));
  const known = new Set(cards.map((card) => card.id));
  let matched = 0;
  for (const section of ["cards", "sealed"]) {
    assert.equal(typeof store[section], "object", `${name}: no "${section}"`);
    for (const [key, list] of Object.entries(store[section])) {
      const where = `${name} ${section}.${key}`;
      if (section === "cards") {
        assert.ok(key.startsWith(`${setId}-`), `${where}: card of another set`);
        if (known.has(key)) matched += 1;
      }
      assert.ok(Array.isArray(list) && list.length, `${where}: empty`);
      let prev = "";
      for (const point of list) {
        assert.ok(Array.isArray(point) && point.length === 2, `${where}: bad point ${JSON.stringify(point)}`);
        const [day, price] = point;
        assert.match(day, ISO, `${where}: bad date ${day}`);
        assert.ok(day > prev, `${where}: ${day} out of order after ${prev}`);
        assert.ok(typeof price === "number" && price > 0, `${where}: bad price ${price} on ${day}`);
        prev = day;
      }
      series += 1;
      points += list.length;
    }
  }
  console.log(`  ${setId.padEnd(9)} ${String(matched).padStart(3)}/${cards.length} cards charted, ${Object.keys(store.sealed).length} sealed`);
}

// The chart module, fed from disk.
globalThis.fetch = async (url) => {
  const path = join(root, decodeURIComponent(String(url)));
  try {
    const body = await readFile(path, "utf8");
    return { ok: true, status: 200, json: async () => JSON.parse(body) };
  } catch {
    return { ok: false, status: 404, json: async () => ({}) };
  }
};
const chart = await import(new URL("../js/pricechart.js", import.meta.url));

const mount = { innerHTML: "", querySelector: () => null };
const card = { id: "me1-1", market: 0.2 };
chart.renderPriceChart(mount, card, "all");
assert.match(mount.innerHTML, /Loading price history/, "no loading state before the file arrives");

assert.equal(chart.priceHistoryReady(card.id), false);
await chart.loadPriceHistory("me1");
assert.equal(chart.priceHistoryReady(card.id), true);
const year = chart.pointsFor(card.id);
assert.ok(year.length > 60, `me1-1 has only ${year.length} points`);

const newest = year.at(-1)[0];
chart.noteLivePrice(card.id, 0.33, newest);
assert.deepEqual(chart.pointsFor(card.id).at(-1), [newest, 0.33], "live price did not replace today's point");
assert.equal(chart.pointsFor(card.id).length, year.length);

chart.renderPriceChart(mount, card, "all");
assert.match(mount.innerHTML, /class="pc-svg/, "no chart drawn");
assert.match(mount.innerHTML, /\b20\d\d\b/, "a year-long chart should name its years");

// A set with no file settles into the no-history message instead of loading forever.
const lost = { id: "nosuchset-1", market: 1 };
await chart.loadPriceHistory("nosuchset");
chart.renderPriceChart(mount, lost, "30d");
assert.match(mount.innerHTML, /Tracking started/, "a missing file should not read as loading");

console.log(`ok: ${files.length} files, ${series} series, ${points} points`);
