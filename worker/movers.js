/**
 * GET /api/prices/movers: the cards whose TCGplayer market price moved most
 * over the last week, for Home's "This week" (js/this-week.js).
 *
 * { day, since, up: [row], down: [row] }
 *   row = { id, set, setName, name, number, rarity, img, now, was, pct }
 * `now` and `was` are US dollars as recorded; the page turns them into coins.
 *
 * Each set's newest row in price_days (worker/prices.js) is set beside its row
 * from seven to ten days earlier. SQLite walks the JSON, so the Worker never
 * parses a day's prices (a free Worker has about 10 ms of CPU). The few cards
 * that come out get their name and picture from their set's data file, cut out
 * of the file's text one card at a time for the same reason.
 *
 * Cheap cards are left out (a 20 cent card that doubles is noise), and so is
 * anything that more than quadrupled or lost three quarters in a week, which
 * is nearly always a mislisted price and not a real move.
 */
import { ensurePriceSchema } from "./prices.js";

const SET_ID = /^[a-z0-9]{1,24}$/;
const CARD_ID = /^[A-Za-z0-9._!?-]{1,48}$/;
const PER_SIDE = 8;
const PER_SET = 2;
// Dollars. A riser must be worth at least UP_NOW today and UP_WAS a week ago.
const UP_NOW = 5;
const UP_WAS = 3;
const DOWN_WAS = 5;
const DOWN_NOW = 1;
const CACHE_SECONDS = 1800;

const PAIRS = `WITH latest AS (SELECT set_id, MAX(day) AS day FROM price_days GROUP BY set_id),
  prev AS (
    SELECT p.set_id AS set_id, MAX(p.day) AS day
      FROM price_days p JOIN latest l ON l.set_id = p.set_id
     WHERE p.day <= date(l.day, '-7 days') AND p.day >= date(l.day, '-10 days')
     GROUP BY p.set_id
  )
  SELECT n.set_id AS set_id, c.key AS id, c.value AS now,
         json_extract(o.prices, '$.cards."' || c.key || '"') AS was, n.day AS day, o.day AS since
    FROM latest l
    JOIN prev v ON v.set_id = l.set_id
    JOIN price_days n ON n.set_id = l.set_id AND n.day = l.day
    JOIN price_days o ON o.set_id = v.set_id AND o.day = v.day
    JOIN json_each(n.prices, '$.cards') c
   WHERE n.day >= date('now', '-3 days') AND instr(c.key, '"') = 0`;

const UP_SQL = `${PAIRS} AND c.value >= ?1 AND was >= ?2 AND c.value >= was * 1.08 AND c.value <= was * 4
   ORDER BY (c.value - was) / was DESC LIMIT 60`;
const DOWN_SQL = `${PAIRS} AND was >= ?1 AND c.value >= ?2 AND c.value <= was * 0.92 AND c.value >= was * 0.25
   ORDER BY (c.value - was) / was ASC LIMIT 60`;

/**
 * One card's object out of a set file's text, without parsing the file: find
 * its id, step back to the brace that opens it, walk to the brace that closes
 * it. Returns null when the id is not there or the cut does not parse.
 */
export function cardFromText(text, id) {
  for (const needle of [`"id": "${id}"`, `"id":"${id}"`]) {
    const at = text.indexOf(needle);
    if (at < 0) continue;
    const start = text.lastIndexOf("{", at);
    if (start < 0) continue;
    let depth = 0;
    let inString = false;
    for (let i = start; i < text.length; i += 1) {
      const ch = text.charCodeAt(i);
      if (inString) {
        if (ch === 92) i += 1; // a backslash escapes the next character
        else if (ch === 34) inString = false;
      } else if (ch === 34) inString = true;
      else if (ch === 123) depth += 1;
      else if (ch === 125) {
        depth -= 1;
        if (!depth) {
          try {
            const card = JSON.parse(text.slice(start, i + 1));
            return card?.id === id ? card : null;
          } catch {
            return null;
          }
        }
      }
    }
  }
  return null;
}

/** The best few rows: no card twice, at most two from one set, so one hot set can't fill the list. */
export function pickMovers(rows, limit = PER_SIDE, perSet = PER_SET) {
  const seen = new Set();
  const bySet = new Map();
  const out = [];
  for (const row of rows || []) {
    if (!SET_ID.test(row.set_id || "") || !CARD_ID.test(row.id || "")) continue;
    const now = Number(row.now);
    const was = Number(row.was);
    if (!(now > 0) || !(was > 0) || seen.has(row.id)) continue;
    // A promo filed in two sets (its own and a promo binder) is one card: its file is named by its id.
    const file = row.id.split("-")[0];
    const count = bySet.get(file) || 0;
    if (count >= perSet) continue;
    seen.add(row.id);
    bySet.set(file, count + 1);
    out.push({ id: row.id, set: row.set_id, now, was, pct: Math.round(((now - was) / was) * 1000) / 10, day: row.day, since: row.since });
    if (out.length >= limit * 2) break; // spare rows, in case a card's file can't be read
  }
  return out;
}

export async function handleMovers(request, env, url, getSet) {
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const key = new Request(`${url.origin}/api/prices/movers`, { method: "GET" });
  const hit = cache && (await cache.match(key));
  if (hit) return hit;

  await ensurePriceSchema(env);
  const [upRows, downRows] = await Promise.all([
    env.DB.prepare(UP_SQL).bind(UP_NOW, UP_WAS).all(),
    env.DB.prepare(DOWN_SQL).bind(DOWN_WAS, DOWN_NOW).all(),
  ]);
  const sides = { up: pickMovers(upRows.results), down: pickMovers(downRows.results) };

  // Each card's name and picture, from the text of its set's file.
  const files = new Map();
  const fileText = (path) => {
    if (!files.has(path)) {
      files.set(
        path,
        env.ASSETS.fetch(new Request(new URL(path, url.origin), { method: "GET" }))
          .then((res) => (res.ok ? res.text() : ""))
          .catch(() => "")
      );
    }
    return files.get(path);
  };
  const describe = async (row) => {
    const set = getSet(row.set);
    const own = set?.id === row.set && set.dataFile ? `/${String(set.dataFile).replace(/^\//, "")}` : "";
    const paths = [...new Set([`/data/${row.id.split("-")[0]}.json`, own].filter(Boolean))];
    for (const path of paths) {
      const card = cardFromText(await fileText(path), row.id);
      if (!card?.name) continue;
      return {
        id: row.id,
        set: row.set,
        setName: set?.id === row.set ? set.name : "",
        name: String(card.name),
        number: String(card.printedNumber || card.number || ""),
        rarity: String(card.rarity || ""),
        img: String(card.imageSmall || card.image || ""),
        now: row.now,
        was: row.was,
        pct: row.pct,
      };
    }
    return null;
  };
  const body = { day: "", since: "", up: [], down: [] };
  for (const side of ["up", "down"]) {
    const cards = (await Promise.all(sides[side].map(describe))).filter(Boolean).slice(0, PER_SIDE);
    body[side] = cards;
  }
  const first = sides.up[0] || sides.down[0];
  if (first) {
    body.day = first.day;
    body.since = first.since;
  }

  const res = new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      // Prices land once a day; half an hour of staleness costs nothing.
      "cache-control": `public, max-age=${CACHE_SECONDS}`,
    },
  });
  if (cache && (body.up.length || body.down.length)) await cache.put(key, res.clone());
  return res;
}
