// Checks the Worker's daily price recorder (worker/prices.js), its API and the
// chart's fold of recorded days into the committed history.
//
//   node scripts/test-daily-prices.mjs
//
// Runs the real Worker code against an in-memory SQLite database, with
// tcgcsv.com stubbed from data/tcgplayer-ids.json. Every write must only add:
// a recorded price never changes and no day is ever removed.
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import worker from "../worker/index.js";
import { pickMarket, recordDailyPrices } from "../worker/prices.js";

const root = new URL("..", import.meta.url);
const ids = JSON.parse(readFileSync(new URL("data/tcgplayer-ids.json", root), "utf8")).sets;
const sets = Object.keys(ids);

// Every set in the map has a price file and prices at least one product.
for (const [setId, entry] of Object.entries(ids)) {
  assert.ok(readFileSync(new URL(`data/prices/${setId}.json`, root)), `${setId} has no price file`);
  assert.ok(entry.groups.length, `${setId} lists no TCGplayer groups`);
  assert.ok(Object.keys(entry.cards).length + Object.keys(entry.sealed).length, `${setId} maps no products`);
}

// D1 over node:sqlite, the same surface the Worker uses.
const db = new DatabaseSync(":memory:");
const DB = {
  prepare(sql) {
    let params = [];
    const statement = {
      bind(...values) {
        params = values;
        return statement;
      },
      async all() {
        return { results: db.prepare(sql).all(...params) };
      },
      async run() {
        db.prepare(sql).run(...params);
        return { success: true };
      },
    };
    return statement;
  },
  async batch(statements) {
    const out = [];
    for (const s of statements) out.push(await s.all());
    return out;
  },
};
const ASSETS = {
  fetch: async (request) => {
    try {
      return new Response(readFileSync(new URL("." + new URL(request.url).pathname, root)));
    } catch {
      return new Response("", { status: 404 });
    }
  },
};
const env = { DB, ASSETS, SITE_ORIGIN: "https://poke-pack.rip" };

// tcgcsv's price rows: a holofoil and a reverse holo for every product, the
// price a function of the product id and `base`, so each run can differ. Each
// group lists every product of the sets that name it.
const pidsByGroup = new Map();
for (const entry of Object.values(ids)) {
  for (const pid of [...Object.values(entry.cards), ...Object.values(entry.sealed)]) {
    for (const group of entry.groups) {
      if (!pidsByGroup.has(group)) pidsByGroup.set(group, new Set());
      pidsByGroup.get(group).add(pid);
    }
  }
}
const priceFor = (base, pid) => Math.round((base + (pid % 97) / 100) * 100) / 100;
function tcgcsv(base, { down = [] } = {}) {
  const calls = [];
  const fetcher = async (url) => {
    const group = Number(String(url).match(/\/3\/(\d+)\/prices$/)?.[1]);
    calls.push(group);
    if (!group || down.includes(group)) return new Response("", { status: 503 });
    const results = [{ productId: 1, subTypeName: "Normal", marketPrice: 1 }];
    for (const pid of pidsByGroup.get(group) || []) {
      results.push({ productId: pid, subTypeName: "Reverse Holofoil", marketPrice: 999 });
      results.push({ productId: pid, subTypeName: "Holofoil", marketPrice: priceFor(base, pid) });
    }
    return Response.json({ success: true, results });
  };
  fetcher.calls = calls;
  return fetcher;
}

/** Run steps until a day is done or stops moving. */
async function runDay(when, fetcher, e = env) {
  const steps = [];
  for (let i = 0; i < 80; i += 1) {
    const result = await recordDailyPrices(e, when, fetcher);
    steps.push(result);
    if (!result.waiting || (!result.fetched.length && !result.recorded.length)) break;
  }
  return steps;
}

assert.equal(pickMarket([{ subTypeName: "Normal", marketPrice: 1 }, { subTypeName: "Holofoil", marketPrice: 2.345 }]), 2.35);
assert.equal(pickMarket([{ subTypeName: "Reverse Holofoil", marketPrice: 3 }, { subTypeName: "1st Edition", marketPrice: 4 }]), 4);
assert.equal(pickMarket([{ subTypeName: "Reverse Holofoil", marketPrice: 3 }]), 3);
assert.equal(pickMarket([{ subTypeName: "Normal", marketPrice: null }]), null);

const setRows = () => db.prepare("SELECT set_id, day, prices FROM price_days ORDER BY set_id, day").all();
const groupRows = () => db.prepare("SELECT group_id, day, prices FROM price_group_days ORDER BY group_id, day").all();

// Day one: a few groups per run, each fetched once, every set recorded.
const day1 = new Date("2026-01-05T00:10:00Z");
let fetcher = tcgcsv(10);
let steps = await runDay(day1, fetcher);
assert.equal(steps.at(-1).waiting, 0, JSON.stringify(steps.at(-1)));
assert.ok(steps.every((s) => s.fetched.length <= 2), "a run fetched more than 2 groups");
assert.equal(new Set(fetcher.calls).size, fetcher.calls.length, "a group was fetched twice in a day");
assert.equal(fetcher.calls.length, pidsByGroup.size);
assert.equal(steps.flatMap((s) => s.recorded).length, sets.length);
const first = setRows();
const firstGroups = groupRows();
assert.equal(first.length, sets.length);
const me1 = JSON.parse(first.find((r) => r.set_id === "me1").prices);
const [card, pid] = Object.entries(ids.me1.cards)[0];
assert.equal(me1.cards[card], priceFor(10, pid), "the holofoil price was not picked");
assert.ok(me1.sealed.boosterPack > 0, "no booster pack price");

// Later runs that day find nothing to do and change nothing.
fetcher = tcgcsv(50);
let result = await recordDailyPrices(env, new Date("2026-01-05T13:10:00Z"), fetcher);
assert.deepEqual([result.fetched, result.recorded, result.waiting], [[], [], 0]);
assert.equal(fetcher.calls.length, 0, "a finished day should not fetch again");
assert.deepEqual(setRows(), first);

// Two runs racing on the same day: the stored prices win, and the items a
// stored row lacks come back at the day's first price.
const small = sets[0];
assert.ok(ids[small].groups.length <= 2, `${small} needs more groups than one run fetches`);
const full = JSON.parse(first.find((r) => r.set_id === small).prices);
const [keep] = Object.keys(full.cards);
db.prepare("UPDATE price_days SET prices = ? WHERE set_id = ?").run(
  JSON.stringify({ cards: { [keep]: full.cards[keep] }, sealed: {} }),
  small
);
const blind = {
  ...env,
  DB: {
    ...DB,
    prepare: (sql) =>
      /^SELECT (set|group)_id FROM price_(group_)?days WHERE day = \?$/.test(sql)
        ? { bind() { return this; }, all: async () => ({ results: [] }) }
        : DB.prepare(sql),
  },
};
await recordDailyPrices(blind, new Date("2026-01-05T14:10:00Z"), tcgcsv(70));
const raced = JSON.parse(db.prepare("SELECT prices FROM price_days WHERE set_id = ?").get(small).prices);
assert.deepEqual(raced, full, "a race changed a stored price or lost the missing items");
assert.deepEqual(setRows(), first);
assert.deepEqual(groupRows(), firstGroups, "a race changed a stored group price");

// Day two with sv8's own TCGplayer group down: its set waits, the rest record.
const down = ids.sv8.groups.find((g) => !Object.entries(ids).some(([id, e]) => id !== "sv8" && e.groups.includes(g)));
assert.ok(down, "sv8 should have a group of its own");
const day2 = new Date("2026-01-06T00:10:00Z");
steps = await runDay(day2, tcgcsv(20, { down: [down] }));
const recorded2 = steps.flatMap((s) => s.recorded).map((line) => line.split(" ")[0]);
assert.ok(!recorded2.includes("sv8"), "a set was recorded with a group missing");
assert.equal(recorded2.length, sets.length - 1);
assert.ok(steps.at(-1).failed.length, "the down group should report a failure");
steps = await runDay(day2, tcgcsv(30));
assert.deepEqual(steps.flatMap((s) => s.recorded).map((line) => line.split(" ")[0]), ["sv8"]);
assert.equal(db.prepare("SELECT count(*) AS n FROM price_days").get().n, sets.length * 2);

// The cron entry point runs the same job, one step per call.
globalThis.fetch = tcgcsv(40);
for (let i = 0; i < 20; i += 1) {
  const waits = [];
  await worker.scheduled({ cron: "*/10 * * * *" }, env, { waitUntil: (p) => waits.push(p) });
  await Promise.all(waits);
}
assert.equal(db.prepare("SELECT count(*) AS n FROM price_days").get().n, sets.length * 3);

// The API returns the recorded days, oldest first.
const api = async (path) => {
  const res = await worker.fetch(new Request(`https://poke-pack.rip${path}`), env);
  return { status: res.status, cache: res.headers.get("cache-control"), body: await res.json() };
};
const today = new Date().toISOString().slice(0, 10);
let res = await api("/api/prices/me1?since=2026-01-06");
assert.equal(res.status, 200);
assert.match(res.cache, /public/);
assert.deepEqual(res.body.days.map(([day]) => day), ["2026-01-06", today]);
assert.equal(res.body.days[0][1].cards[card], priceFor(20, pid));
res = await api("/api/prices/me1?since=2026-01-01");
assert.equal(res.body.days[0][0], "2026-01-05");
assert.equal((await api("/api/prices/not-a-set!")).status, 400);
res = await api("/api/prices/nosuchset");
assert.deepEqual(res.body, { set: "nosuchset", days: [] });

// The chart folds recorded days in only where the file has no point.
const file = JSON.parse(readFileSync(new URL("data/prices/me1.json", root), "utf8"));
const lastDay = file.cards[card].at(-1)[0];
globalThis.fetch = async (url) => {
  const path = String(url);
  if (path.startsWith("/api/prices/me1")) {
    assert.equal(path, `/api/prices/me1?since=${file.updated}`);
    return Response.json({
      set: "me1",
      days: [
        [lastDay, { cards: { [card]: 12345 }, sealed: {} }],
        ["2031-02-01", { cards: { [card]: 7.5 }, sealed: { newBox: 99 } }],
      ],
    });
  }
  if (path.startsWith("/api/")) return new Response("", { status: 503 });
  try {
    return new Response(readFileSync(new URL(path, root)));
  } catch {
    return new Response("", { status: 404 });
  }
};
const chart = await import(new URL("js/pricechart.js", root));
await chart.loadPriceHistory("me1");
const points = chart.pointsFor(card);
assert.equal(points.find((p) => p[0] === lastDay)[1], file.cards[card].at(-1)[1], "a recorded day replaced the file's point");
assert.deepEqual(points.at(-1), ["2031-02-01", 7.5]);
assert.equal(points.length, file.cards[card].length + 1);
assert.deepEqual(chart.productPointsFor("me1", "newBox"), [["2031-02-01", 99]]);
// A set whose API is down still charts from its file.
await chart.loadPriceHistory("me2");
assert.ok(chart.priceHistoryReady("me2-1"), "an API outage should not hide the committed history");

console.log(
  `Daily price checks passed: ${sets.length} sets from ${pidsByGroup.size} TCGplayer groups, ` +
    `additive runs and races, a down group, the cron entry, the API and the chart fold.`
);
