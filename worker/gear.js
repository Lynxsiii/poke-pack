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

/** Same statements as worker/migrations/0014_gear.sql, so a deploy needs no manual step. */
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
  const raw = { sleeves: {}, coins: {}, equipped: { sleeve: equipped?.sleeve || null, coin: equipped?.coin || null }, recent: [] };
  for (const row of rows) {
    raw[row.kind === "sleeve" ? "sleeves" : "coins"][row.item_id] = row.qty;
    if (raw.recent.length < 12) raw.recent.push({ kind: row.kind, id: row.item_id, at: row.last_at });
  }
  return normalizeGear(raw);
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
