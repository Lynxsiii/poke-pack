/**
 * GET /api/rips/live: the newest big pulls and Black Label slabs, for Home's
 * "Live rips" strip (js/live-rips.js).
 *
 * { rips: [{ id, kind: "pull" | "blacklabel", handle, at, card: { id, name,
 *   rarity, set, price, image }, more }] }
 *
 * These are the rows the Discord feed is posted from (worker/discord.js,
 * discord_feed), so the same rules already hold: only a pull worth sharing,
 * never a test account, never a trainer who turned sharing off. The choice is
 * read again here, so turning it off takes a trainer's pulls off Home at once.
 * Nothing but the handle and the card goes out: no name, no Discord id.
 */
import { ensureFeedSchema, sharesFeed } from "./discord.js";

const LIMIT = 12;
const WINDOW_MS = 7 * 86_400_000;
const CACHE_SECONDS = 45;
const HANDLE = /^[a-z0-9_]{2,32}$/i;

const cardOut = (card) =>
  card && card.id && card.name
    ? {
        id: String(card.id),
        name: String(card.name),
        rarity: String(card.rarity || ""),
        set: String(card.set || ""),
        price: Number(card.slab || card.price) || 0,
        image: String(card.image || ""),
      }
    : null;

/** One feed row as the strip shows it, or null when it can't be shown. */
export function ripFromRow(row) {
  if (!sharesFeed(row) || !HANDLE.test(row.handle || "")) return null;
  let payload;
  try {
    payload = JSON.parse(row.payload);
  } catch {
    return null;
  }
  const black = row.kind === "blacklabel";
  const cards = black ? [payload.card] : Array.isArray(payload.cards) ? payload.cards : [];
  const card = cardOut(cards[0]);
  if (!card) return null;
  return {
    id: Number(row.id),
    kind: black ? "blacklabel" : "pull",
    handle: String(row.handle),
    at: Number(row.created_at) || 0,
    card,
    more: black ? 0 : Math.max(0, cards.length - 1 + (Number(payload.more) || 0)),
  };
}

export async function handleLiveRips(request, env, url, now = Date.now()) {
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const key = new Request(`${url.origin}/api/rips/live`, { method: "GET" });
  const hit = cache && (await cache.match(key));
  if (hit) return hit;

  let rips = [];
  try {
    await ensureFeedSchema(env);
    const rows =
      (
        await env.DB.prepare(
          `SELECT f.id AS id, f.kind AS kind, f.payload AS payload, f.created_at AS created_at,
                  u.handle AS handle, u.feed_share AS feed_share, u.tester AS tester
             FROM discord_feed f JOIN users u ON u.id = f.user_id
            WHERE f.kind IN ('pulls', 'blacklabel') AND f.created_at > ?
            ORDER BY f.id DESC LIMIT ?`
        )
          .bind(now - WINDOW_MS, LIMIT * 2)
          .all()
      ).results || [];
    rips = rows.map(ripFromRow).filter(Boolean).slice(0, LIMIT);
  } catch (err) {
    console.error("live rips", err);
  }
  const res = new Response(JSON.stringify({ rips }), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": `public, max-age=${CACHE_SECONDS}` },
  });
  if (cache) await cache.put(key, res.clone());
  return res;
}
