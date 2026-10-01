/**
 * Sleeves and coins (see js/gear.js for the catalog and the save shape).
 *
 *   GET  /api/gear         the caller's holdings
 *   POST /api/gear/equip   { kind: "sleeve" | "coin", id: string | null }
 *
 * Sealed products hand their sleeves and coins out in openSealed. Anything else
 * that wants to give one away (an achievement reward, an event) calls
 * grantGear(env, userId, [{ kind, id }]).
 */
import { GEAR_KINDS, emptyGear, gearItem, normalizeGear, productGear, rollGear } from "../js/gear.js";

let schemaReady = false;
let catalogCache = null;

const DDL = [
  `CREATE TABLE IF NOT EXISTS user_gear (
    user_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    item_id TEXT NOT NULL,
    qty INTEGER NOT NULL DEFAULT 1,
    first_at INTEGER NOT NULL,
    last_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, kind, item_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS gear_equipped (
    user_id TEXT PRIMARY KEY,
    sleeve TEXT,
    coin TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  "CREATE INDEX IF NOT EXISTS idx_user_gear_user ON user_gear(user_id, first_at DESC)",
];

/** Same statements as worker/migrations/0018_gear.sql, so a deploy needs no manual step. */
export async function ensureGearSchema(env) {
  if (schemaReady) return;
  try {
    for (const sql of DDL) await env.DB.exec(`${sql.replace(/\s+/g, " ").trim()};`);
    schemaReady = true;
  } catch (err) {
    console.error("ensureGearSchema", err);
    throw err;
  }
}

export async function loadGearCatalog(env, request) {
  if (catalogCache) return catalogCache;
  try {
    const res = await env.ASSETS.fetch(new Request(new URL("/data/gear.json", request.url), { method: "GET" }));
    if (!res.ok) return { sleeves: {}, coins: {}, products: {} };
    catalogCache = await res.json();
  } catch {
    return { sleeves: {}, coins: {}, products: {} };
  }
  return catalogCache;
}

/** What a player holds and has equipped, in the shape of `save.gear`. */
export async function gearSummary(env, userId) {
  try {
    return await readSummary(env, userId);
  } catch (err) {
    // A database swapped underneath a warm isolate (or a restore) loses the tables.
    if (!/no such table/i.test(String(err?.message || err))) throw err;
    schemaReady = false;
    return readSummary(env, userId);
  }
}

async function readSummary(env, userId) {
  await ensureGearSchema(env);
  const rows =
    (
      await env.DB.prepare(
        "SELECT kind, item_id, qty, last_at FROM user_gear WHERE user_id = ? AND qty > 0 ORDER BY last_at DESC, item_id"
      )
        .bind(userId)
        .all()
    ).results || [];
  const equipped = await env.DB.prepare("SELECT sleeve, coin FROM gear_equipped WHERE user_id = ?")
    .bind(userId)
    .first();
  const raw = { sleeves: {}, coins: {}, guards: {}, equipped: { sleeve: equipped?.sleeve || null, coin: equipped?.coin || null }, recent: [] };
  for (const row of rows) {
    raw[row.kind === "sleeve" ? "sleeves" : row.kind === "guard" ? "guards" : "coins"][row.item_id] = row.qty;
    if (row.kind !== "guard" && raw.recent.length < 12) raw.recent.push({ kind: row.kind, id: row.item_id, at: row.last_at });
  }
  return normalizeGear(raw);
}

/**
 * The coin a player flips with: the equipped coin's id while they still hold it,
 * else null (the house coin). The casino stamps this on each flip it creates.
 */
export async function equippedCoinId(env, userId) {
  try {
    const gear = await gearSummary(env, userId);
    const id = gear.equipped.coin;
    return id && gear.coins[id] > 0 ? id : null;
  } catch (err) {
    console.error("equippedCoinId", err);
    return null;
  }
}

/**
 * The statements that hand items to a player, plus which of them are new to
 * them. Split from grantGear so a purchase can add them to its own batch.
 */
export async function prepareGrant(env, userId, items, now = Date.now()) {
  await ensureGearSchema(env);
  const counts = new Map();
  for (const item of items || []) {
    if (!GEAR_KINDS.includes(item?.kind) || !item.id) continue;
    const key = `${item.kind}:${item.id}`;
    counts.set(key, (counts.get(key) || 0) + Math.max(1, Math.floor(Number(item.qty) || 1)));
  }
  if (!counts.size) return { stmts: [], granted: [] };
  const keys = [...counts.keys()];
  const owned = new Set();
  for (let i = 0; i < keys.length; i += 40) {
    const chunk = keys.slice(i, i + 40).map((key) => key.split(":"));
    const rows =
      (
        await env.DB.prepare(
          `SELECT kind, item_id FROM user_gear WHERE user_id = ? AND qty > 0 AND (${chunk
            .map(() => "(kind = ? AND item_id = ?)")
            .join(" OR ")})`
        )
          .bind(userId, ...chunk.flat())
          .all()
      ).results || [];
    for (const row of rows) owned.add(`${row.kind}:${row.item_id}`);
  }
  const stmts = [];
  const granted = [];
  for (const [key, qty] of counts) {
    const [kind, id] = key.split(":");
    stmts.push(
      env.DB.prepare(
        `INSERT INTO user_gear (user_id, kind, item_id, qty, first_at, last_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, kind, item_id) DO UPDATE SET qty = user_gear.qty + excluded.qty, last_at = excluded.last_at`
      ).bind(userId, kind, id, qty, now, now)
    );
    granted.push({ kind, id, qty, wasNew: !owned.has(key) });
  }
  return { stmts, granted };
}

/** Hand items to a player now. Unknown ids are dropped, so a stale reward can't invent gear. */
export async function grantGear(env, request, userId, items) {
  const catalog = await loadGearCatalog(env, request);
  const known = (items || []).filter((item) => gearItem(catalog, item?.kind, item?.id));
  const { stmts, granted } = await prepareGrant(env, userId, known);
  if (stmts.length) await env.DB.batch(stmts);
  return granted;
}

/**
 * The gear an achievement claim gifts (`row.reward.gear` on set masteries and
 * era crowns), as ONE statement for the claim's own env.DB.batch. Put it right
 * after the statement that wins the compare-and-swap: it is guarded on
 * changes() = 1, so only the request whose swap landed inserts anything, in the
 * same transaction as the coins and the claimed list. Nothing is granted
 * outside the batch, so a gift can neither be lost after the claim nor paid twice.
 *
 * Returns { stmt, gear, byRow, unavailable }:
 *   stmt         the guarded insert, or null when there is nothing to hand out
 *   gear         [{ kind, id, name, qty, wasNew }] it will grant
 *   byRow        { [rowId]: [{ kind, id, name }] }
 *   unavailable  true when the rows have gifts but the gear catalogue did not
 *                load: the caller answers 503 BEFORE the batch, because claiming
 *                would spend the id with the gift unpayable. Gifts whose id the
 *                catalogue lacks are dropped, as grantGear does.
 */
export async function prepareRewardGear(env, request, userId, rows, now = Date.now()) {
  const none = { stmt: null, gear: [], byRow: {}, unavailable: false };
  const wanted = [];
  for (const row of rows || []) {
    for (const item of row?.reward?.gear || []) wanted.push({ rowId: row.id, kind: item.kind, id: item.id });
  }
  if (!wanted.length) return none;
  await ensureGearSchema(env);
  const catalog = await loadGearCatalog(env, request);
  if (!Object.keys(catalog?.sleeves || {}).length && !Object.keys(catalog?.coins || {}).length) {
    console.error("prepareRewardGear: gear catalogue did not load", userId);
    return { ...none, unavailable: true };
  }
  const known = wanted.filter((item) => gearItem(catalog, item.kind, item.id));
  if (!known.length) return none;
  const nameOf = (kind, id) => gearItem(catalog, kind, id)?.name || id;
  const counts = new Map();
  for (const item of known) counts.set(`${item.kind}:${item.id}`, (counts.get(`${item.kind}:${item.id}`) || 0) + 1);
  const gifts = [...counts].map(([key, qty]) => {
    const [kind, ...id] = key.split(":");
    return { kind, id: id.join(":"), qty };
  });
  const owned = new Set(
    (
      (
        await env.DB.prepare(
          `SELECT kind, item_id FROM user_gear WHERE user_id = ? AND qty > 0 AND (${gifts.map(() => "(kind = ? AND item_id = ?)").join(" OR ")})`
        )
          .bind(userId, ...gifts.flatMap((g) => [g.kind, g.id]))
          .all()
      ).results || []
    ).map((row) => `${row.kind}:${row.item_id}`)
  );
  const byRow = {};
  for (const item of known) (byRow[item.rowId] ||= []).push({ kind: item.kind, id: item.id, name: nameOf(item.kind, item.id) });
  const stmt = env.DB.prepare(
    // changes() is the claim update's: 1 only for the request that won the swap.
    `INSERT INTO user_gear (user_id, kind, item_id, qty, first_at, last_at)
     SELECT ?, json_extract(value, '$.kind'), json_extract(value, '$.id'), json_extract(value, '$.qty'), ?, ?
     FROM json_each(?) WHERE changes() = 1
     ON CONFLICT(user_id, kind, item_id) DO UPDATE SET qty = user_gear.qty + excluded.qty, last_at = excluded.last_at`
  ).bind(userId, now, now, JSON.stringify(gifts));
  const gear = gifts.map((g) => ({ ...g, name: nameOf(g.kind, g.id), wasNew: !owned.has(`${g.kind}:${g.id}`) }));
  return { stmt, gear, byRow, unavailable: false };
}

/** The items one opened copy of a product hands out, as { kind, id } rows. */
export async function productItems(env, request, setId, productId) {
  const catalog = await loadGearCatalog(env, request);
  return rollGear(productGear(catalog, setId, productId));
}

/** Routes for /api/gear*. Returns null when the path isn't one of them. */
export async function handleGear(path, method, request, env, { json, requireUser, readJson }) {
  if (path === "/api/gear" && method === "GET") {
    const auth = await requireUser(request, env);
    if (auth.response) return auth.response;
    return json({ gear: await gearSummary(env, auth.user.id) });
  }
  if (path === "/api/gear/equip" && method === "POST") {
    const auth = await requireUser(request, env);
    if (auth.response) return auth.response;
    const body = await readJson(request);
    if (!body) return json({ error: "Expected JSON." }, 400);
    const kind = String(body.kind || "");
    if (!GEAR_KINDS.includes(kind)) return json({ error: "Pick a sleeve or a coin." }, 400);
    await ensureGearSchema(env);
    const id = body.id == null || body.id === "" ? null : String(body.id).slice(0, 80);
    if (id) {
      const catalog = await loadGearCatalog(env, request);
      if (!gearItem(catalog, kind, id) || (kind === "coin" && id === "house")) {
        return json({ error: "That isn't in the catalog." }, 400);
      }
      const held = await env.DB.prepare(
        "SELECT qty FROM user_gear WHERE user_id = ? AND kind = ? AND item_id = ? AND qty > 0"
      )
        .bind(auth.user.id, kind, id)
        .first();
      if (!held) return json({ error: `You don't have that ${kind} yet.` }, 400);
    }
    const column = kind === "sleeve" ? "sleeve" : "coin";
    await env.DB.prepare(
      `INSERT INTO gear_equipped (user_id, ${column}) VALUES (?, ?)
       ON CONFLICT(user_id) DO UPDATE SET ${column} = excluded.${column}`
    )
      .bind(auth.user.id, id)
      .run();
    return json({ gear: await gearSummary(env, auth.user.id) });
  }
  return null;
}

export { emptyGear };
