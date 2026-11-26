/**
 * Wishlist: cards a player has hearted, owned or not, so they can see which set
 * and which product to hunt. One row per card; the client shows them newest first.
 *
 * Nobody can run remote D1 migrations from a session, so the Worker creates the
 * table itself once per isolate; worker/migrations/0037_wishlist.sql holds the
 * same DDL. A wishlist is a preference, not progress: a progress reset keeps it,
 * deleting the account drops it (ON DELETE CASCADE).
 *
 *   GET  /api/wishlist                 -> { wishlist: [cardId, ...] }
 *   POST /api/wishlist {cardId, on}    -> { wishlist }   (on: true adds, false removes)
 *   POST /api/wishlist {cardIds}       -> { wishlist }   (adds up to 100; a guest's hearts after signing in)
 */

export const WISHLIST_MAX = 500;
const CARD_ID = /^[a-z0-9][a-z0-9._-]{1,63}$/i;

const DDL = [
  "CREATE TABLE IF NOT EXISTS wishlist (user_id TEXT NOT NULL, card_id TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (user_id, card_id), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)",
];

let schemaReady = false;

/** Tests only: forget the per-isolate cache so another database is checked. */
export function resetWishlistSchemaCache() {
  schemaReady = false;
}

export async function ensureWishlistSchema(env) {
  if (schemaReady) return true;
  try {
    for (const sql of DDL) await env.DB.exec(`${sql};`);
    schemaReady = true;
    return true;
  } catch (err) {
    console.error("ensureWishlistSchema", err);
    return false;
  }
}

/** The player's hearted card ids, newest first. Never throws: a missing table reads as empty. */
export async function wishlistFor(env, userId) {
  if (!(await ensureWishlistSchema(env))) return [];
  try {
    const rows = (await env.DB.prepare("SELECT card_id FROM wishlist WHERE user_id = ? ORDER BY at DESC, card_id LIMIT ?")
      .bind(userId, WISHLIST_MAX)
      .all()).results || [];
    return rows.map((row) => row.card_id);
  } catch (err) {
    console.error("wishlistFor", err);
    return [];
  }
}

export function validCardId(id) {
  return typeof id === "string" && CARD_ID.test(id);
}

/**
 * deps: { json, requireUser, readJson, findCatalogCard }
 * Returns a Response for /api/wishlist, or null for any other path.
 */
export async function handleWishlist(path, method, request, env, deps) {
  if (path !== "/api/wishlist") return null;
  const { json, requireUser, readJson, findCatalogCard } = deps;
  const auth = await requireUser(request, env);
  if (auth.response) return auth.response;
  const userId = auth.user.id;
  if (!(await ensureWishlistSchema(env))) return json({ error: "The wishlist is resting. Try again in a minute." }, 503);
  if (method === "GET") return json({ wishlist: await wishlistFor(env, userId) });
  if (method !== "POST") return json({ error: "Not found." }, 404);

  const body = await readJson(request);
  if (!body || typeof body !== "object") return json({ error: "Expected JSON." }, 400);
  const now = Date.now();

  if (Array.isArray(body.cardIds)) {
    // A guest's hearts, carried over on sign-in. Unknown ids are skipped, not refused.
    const ids = [...new Set(body.cardIds.filter(validCardId))].slice(0, 100);
    const have = new Set(await wishlistFor(env, userId));
    const room = Math.max(0, WISHLIST_MAX - have.size);
    const fresh = [];
    for (const id of ids) {
      if (fresh.length >= room) break;
      if (have.has(id)) continue;
      if (await findCatalogCard(env, request, id)) fresh.push(id);
    }
    if (fresh.length) {
      // Oldest first in the request, so the last one sent reads as the newest.
      await env.DB.batch(
        fresh.map((id, i) =>
          env.DB.prepare("INSERT OR IGNORE INTO wishlist (user_id, card_id, at) VALUES (?, ?, ?)").bind(userId, id, now - fresh.length + i)
        )
      );
    }
    return json({ wishlist: await wishlistFor(env, userId) });
  }

  const cardId = body.cardId;
  if (!validCardId(cardId)) return json({ error: "That card does not exist." }, 400);
  if (body.on === false) {
    await env.DB.prepare("DELETE FROM wishlist WHERE user_id = ? AND card_id = ?").bind(userId, cardId).run();
    return json({ wishlist: await wishlistFor(env, userId) });
  }
  if (!(await findCatalogCard(env, request, cardId))) return json({ error: "That card does not exist." }, 400);
  const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM wishlist WHERE user_id = ?").bind(userId).first();
  const held = await env.DB.prepare("SELECT 1 AS x FROM wishlist WHERE user_id = ? AND card_id = ?").bind(userId, cardId).first();
  if (!held && Number(count?.n || 0) >= WISHLIST_MAX) {
    return json({ error: `Your wishlist is full (${WISHLIST_MAX} cards). Take one off first.` }, 409);
  }
  await env.DB.prepare(
    "INSERT INTO wishlist (user_id, card_id, at) VALUES (?, ?, ?) ON CONFLICT(user_id, card_id) DO UPDATE SET at = excluded.at"
  )
    .bind(userId, cardId, now)
    .run();
  return json({ wishlist: await wishlistFor(env, userId) });
}
