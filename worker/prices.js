/**
 * Daily market prices, recorded by the Worker itself.
 *
 * data/prices/<set>.json holds the committed history: a year of TCGplayer
 * prices backfilled by scripts/backfill_prices.py. The days after that are
 * recorded here, in D1, by a cron that runs every 10 minutes. The page reads
 * the committed file, then /api/prices/<set> for the days since.
 *
 * Prices come from tcgcsv.com, one request per TCGplayer group, for the
 * products listed in data/tcgplayer-ids.json (written by the same script). A
 * free Worker gets about 10 ms of CPU per run, so a day is built in small
 * steps: each run fetches two groups and stores the market prices this site
 * uses from them in price_group_days, and once every group a set draws on is in for the day,
 * that set's row goes into price_days. The runs after that find nothing to do
 * until the next UTC day.
 *
 * Everything here only adds. A group's or set's row for a day is written once;
 * if two runs ever race, the merge keeps every price already stored and only
 * adds items the stored row lacks.
 */

const TCGCSV = "https://tcgcsv.com/tcgplayer/3";
const TCGCSV_HEADERS = { "user-agent": "poke-pack.rip daily prices (github.com/Lynxsiii/poke-pack)" };
// The same printing the backfill charts: holofoil, else normal (sealed is
// "Normal" on tcgcsv too); reverse holo only when there is nothing else.
// Wizards of the Coast groups name them "Unlimited" / "Unlimited Holofoil" beside "1st Edition": the site deals Unlimited.
const VARIANTS = ["Holofoil", "Normal", "Unopened", "Unlimited Holofoil", "Unlimited"];
// Groups fetched per run. A group's price file is up to ~200 KB of JSON, so
// two keep a run well inside the free plan's CPU limit.
const GROUPS_PER_RUN = 2;
const SET_ID = /^[a-z0-9]{1,24}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 400;

let schemaReady = false;
// data/tcgplayer-ids.json only changes with a deploy, which starts a new isolate.
let idsCache = null;

export async function ensurePriceSchema(env) {
  if (schemaReady) return;
  await env.DB.batch(
    [
      `CREATE TABLE IF NOT EXISTS price_days (
        set_id TEXT NOT NULL,
        day TEXT NOT NULL,
        prices TEXT NOT NULL,
        recorded_at INTEGER NOT NULL,
        PRIMARY KEY (set_id, day)
      )`,
      "CREATE INDEX IF NOT EXISTS idx_price_days_day ON price_days(day)",
      `CREATE TABLE IF NOT EXISTS price_group_days (
        day TEXT NOT NULL,
        group_id INTEGER NOT NULL,
        prices TEXT NOT NULL,
        recorded_at INTEGER NOT NULL,
        PRIMARY KEY (day, group_id)
      )`,
    ].map((sql) => env.DB.prepare(sql))
  );
  schemaReady = true;
}

/** The market price of a product's pack printing from its tcgcsv price rows. */
export function pickMarket(rows) {
  const priced = (rows || []).filter((row) => row?.subTypeName);
  let row = null;
  for (const variant of VARIANTS) {
    row = priced.find((r) => r.subTypeName === variant);
    if (row) break;
  }
  row ||= [...priced].sort(
    (a, b) => /reverse/i.test(a.subTypeName) - /reverse/i.test(b.subTypeName)
  )[0];
  const price = Number(row?.marketPrice);
  return price > 0 ? Math.round(price * 100) / 100 : null;
}

async function loadIds(env) {
  if (idsCache) return idsCache;
  const res = await env.ASSETS.fetch(new Request("https://poke-pack.rip/data/tcgplayer-ids.json"));
  if (!res.ok) throw new Error(`data/tcgplayer-ids.json: ${res.status}`);
  const body = await res.json();
  const sets = body?.sets && typeof body.sets === "object" ? body.sets : {};
  const list = Object.entries(sets).filter(([id, entry]) => SET_ID.test(id) && Array.isArray(entry?.groups));
  const pids = new Set();
  for (const [, entry] of list) {
    for (const section of ["cards", "sealed"]) {
      for (const pid of Object.values(entry[section] || {})) pids.add(Number(pid));
    }
  }
  idsCache = { list, pids };
  return idsCache;
}

/** {pid: price} for the products this site uses from one group's price file. */
async function fetchGroup(group, wanted, fetcher) {
  const res = await fetcher(`${TCGCSV}/${group}/prices`, { headers: TCGCSV_HEADERS });
  if (!res.ok) throw new Error(`tcgcsv group ${group}: ${res.status}`);
  const body = await res.json();
  const rows = new Map();
  for (const row of body?.results || []) {
    if (!wanted.has(row.productId)) continue;
    const list = rows.get(row.productId);
    if (list) list.push(row);
    else rows.set(row.productId, [row]);
  }
  const prices = {};
  for (const [pid, list] of rows) {
    const price = pickMarket(list);
    if (price != null) prices[pid] = price;
  }
  return prices;
}

/** Insert a day's row; on a clash keep every stored price and only add new items. */
const upsert = (env, table, key, columns, values) =>
  env.DB.prepare(
    `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})
     ON CONFLICT (${key.join(", ")}) DO UPDATE SET prices = json_patch(excluded.prices, ${table}.prices)`
  ).bind(...values);

/**
 * One step of today's recording: fetch the next few groups that sets still
 * waiting for today need, then write the row of every set whose groups are
 * all in. Returns what it did.
 */
export async function recordDailyPrices(env, now = new Date(), fetcher = fetch) {
  const day = now.toISOString().slice(0, 10);
  await ensurePriceSchema(env);
  const [setRows, groupRows] = await env.DB.batch([
    env.DB.prepare("SELECT set_id FROM price_days WHERE day = ?").bind(day),
    env.DB.prepare("SELECT group_id FROM price_group_days WHERE day = ?").bind(day),
  ]);
  const doneSets = new Set((setRows.results || []).map((row) => row.set_id));
  const staged = new Set((groupRows.results || []).map((row) => row.group_id));

  const ids = await loadIds(env);
  const waiting = ids.list.filter(([setId]) => !doneSets.has(setId));
  if (!waiting.length) return { day, fetched: [], recorded: [], waiting: 0, failed: [] };

  // The next groups in set order, so the first sets finish first.
  const next = [];
  for (const [, entry] of waiting) {
    for (const group of entry.groups) {
      if (!staged.has(group) && !next.includes(group)) next.push(group);
    }
  }
  const batch = next.slice(0, GROUPS_PER_RUN);

  const failed = [];
  const fetched = [];
  const writes = [];
  await Promise.all(
    batch.map(async (group) => {
      try {
        const prices = await fetchGroup(group, ids.pids, fetcher);
        writes.push(
          upsert(env, "price_group_days", ["day", "group_id"], ["day", "group_id", "prices", "recorded_at"], [
            day,
            group,
            JSON.stringify(prices),
            now.getTime(),
          ])
        );
        fetched.push(group);
        staged.add(group);
      } catch (err) {
        failed.push(String(err?.message || err));
      }
    })
  );
  if (writes.length) await env.DB.batch(writes);

  // Sets whose groups are all in: assemble their rows from today's group rows.
  const ready = waiting.filter(([, entry]) => entry.groups.every((g) => staged.has(g)));
  const recorded = [];
  if (ready.length) {
    const groups = [...new Set(ready.flatMap(([, entry]) => entry.groups))];
    const rows = (
      await env.DB.prepare(
        `SELECT group_id, prices FROM price_group_days WHERE day = ? AND group_id IN (${groups.map(() => "?").join(", ")})`
      )
        .bind(day, ...groups)
        .all()
    ).results || [];
    const byGroup = new Map(rows.map((row) => [row.group_id, JSON.parse(row.prices)]));
    const setWrites = [];
    for (const [setId, entry] of ready) {
      const priceOf = (pid) => {
        for (const g of entry.groups) {
          const price = byGroup.get(g)?.[pid];
          if (price > 0) return price;
        }
        return null;
      };
      const row = { cards: {}, sealed: {} };
      let count = 0;
      for (const section of ["cards", "sealed"]) {
        for (const [key, pid] of Object.entries(entry[section] || {})) {
          const price = priceOf(pid);
          if (price == null) continue;
          row[section][key] = price;
          count += 1;
        }
      }
      if (!count) continue;
      setWrites.push(
        upsert(env, "price_days", ["set_id", "day"], ["set_id", "day", "prices", "recorded_at"], [
          setId,
          day,
          JSON.stringify(row),
          now.getTime(),
        ])
      );
      recorded.push(`${setId} ${count}`);
    }
    if (setWrites.length) await env.DB.batch(setWrites);
  }
  return { day, fetched, recorded, waiting: waiting.length - recorded.length, failed };
}

/**
 * GET /api/prices/<set>?since=YYYY-MM-DD: every day recorded for a set from
 * `since` on, oldest first, as { set, days: [[day, {cards, sealed}], ...] }.
 * The stored JSON goes out as it is, without parsing, which keeps a long run
 * of days cheap to serve; js/pricechart.js turns it into chart series.
 */
export async function handlePrices(request, env, url, setId) {
  if (!SET_ID.test(setId || "")) {
    const err = new Error("Unknown set.");
    err.status = 400;
    throw err;
  }
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const key = new Request(url.toString(), { method: "GET" });
  const hit = cache && (await cache.match(key));
  if (hit) return hit;

  await ensurePriceSchema(env);
  const since = url.searchParams.get("since");
  const floor = DAY.test(since || "")
    ? since
    : new Date(Date.now() - MAX_DAYS * 86_400_000).toISOString().slice(0, 10);
  const rows =
    (
      await env.DB.prepare(
        `SELECT day, prices FROM price_days WHERE set_id = ? AND day >= ? ORDER BY day DESC LIMIT ${MAX_DAYS}`
      )
        .bind(setId, floor)
        .all()
    ).results || [];
  // Newest first from the query, so a long gap keeps the recent days.
  const days = rows
    .reverse()
    .filter((row) => DAY.test(row.day))
    .map((row) => `["${row.day}",${row.prices}]`);
  const res = new Response(`{"set":"${setId}","days":[${days.join(",")}]}`, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      // New prices land once a day; a few minutes of staleness costs nothing.
      "cache-control": "public, max-age=600",
    },
  });
  if (cache) await cache.put(key, res.clone());
  return res;
}
