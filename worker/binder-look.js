/**
 * Binder looks and profile looks, server side (migration 0023). The ids, the
 * validation and the prices live in js/binder-looks.js and js/profile-look.js;
 * this file stores a look, owns the animated editions and takes the coins.
 *
 *   POST /api/binder/editions/buy   { editionId, requestId } -> { ok, binderEditions, coins }
 *
 * A look is two JSON columns on users (binder_look, profile_look), added at
 * runtime by ensureSocialSchema like binder_pages. Owned editions are rows in
 * binder_editions. Buying follows worker/grading.js buyGuards: one D1 batch
 * whose statements are chained on changes() = 1, so the coins, the owned row
 * and the purchase record move together or not at all, and a retry with the
 * same requestId finds its purchase row and never charges twice.
 *
 * Only the account itself sees which editions it owns (the trainer object);
 * the public profile carries the two looks and nothing else.
 */
import { editionById, editionPrice, normalizeBinderLook } from "../js/binder-looks.js";
import { normalizeProfileLook } from "../js/profile-look.js";
import { GRADING_DDL } from "./grading.js";

const error = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
const REQUEST_ID = /^[a-zA-Z0-9-]{8,80}$/;
const KIND = "binder-edition";

/**
 * Same statements as worker/migrations/0023_binder_looks.sql. The purchase
 * ledger (gear_purchases) is the one grading already makes, taken from there
 * so the two can never drift apart.
 */
export const BINDER_LOOK_DDL = [
  ...GRADING_DDL.filter((sql) => /gear_purchases/.test(sql)),
  `CREATE TABLE IF NOT EXISTS binder_editions (
    user_id TEXT NOT NULL,
    edition_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, edition_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
];

let schemaReady = false;
/** Tests only: forget the per-isolate cache so another database is checked. */
export const resetBinderLookSchemaCache = () => {
  schemaReady = false;
};

let schemaWork = null;
export async function ensureBinderLookSchema(env) {
  if (schemaReady) return;
  if (!schemaWork) {
    schemaWork = (async () => {
      try {
        for (const sql of BINDER_LOOK_DDL) await env.DB.exec(`${sql.replace(/\s+/g, " ").trim()};`);
        schemaReady = true;
      } catch (err) {
        console.error("ensureBinderLookSchema", err);
        throw err;
      } finally {
        schemaWork = null;
      }
    })();
  }
  return schemaWork;
}

const isMissingTable = (err) => /no such table/i.test(String(err?.message || err));

// ---- Reading ------------------------------------------------------------------
/** The two stored looks as the client sees them, complete and valid whatever the row holds (old rows have neither column). */
export function lookFields(row) {
  return {
    binderLook: normalizeBinderLook(row?.binder_look),
    profileLook: normalizeProfileLook(row?.profile_look),
  };
}

async function readOwned(env, userId) {
  await ensureBinderLookSchema(env);
  const res = await env.DB.prepare("SELECT edition_id FROM binder_editions WHERE user_id = ? ORDER BY created_at, edition_id").bind(userId).all();
  // An id the catalog no longer has is not worth showing.
  return (res.results || []).map((row) => row.edition_id).filter((id) => editionById(id));
}

/** The edition ids this account owns, oldest purchase first. */
export async function ownedEditionIds(env, userId) {
  try {
    return await readOwned(env, userId);
  } catch (err) {
    // A database swapped underneath a warm isolate (or a restore) loses the table.
    if (!isMissingTable(err)) throw err;
    schemaReady = false;
    return readOwned(env, userId);
  }
}

/** What the signed-in account is sent about itself: both looks plus the editions it owns. Never use for another trainer. */
export async function trainerLookFields(env, row) {
  return { ...lookFields(row), binderEditions: await ownedEditionIds(env, row.id) };
}

// ---- Saving (PATCH /api/me) ---------------------------------------------------
const has = (body, key) => Object.prototype.hasOwnProperty.call(body, key);
const isEmpty = (value) => value == null || value === "";

/**
 * The binder_look and profile_look values for the UPDATE in PATCH /api/me.
 * `user` is the row as stored. A key that is not in the body keeps what is
 * stored (as is: a never-customised account stays NULL); a key that is null or
 * empty resets to the default (NULL); anything else is normalised and stored
 * as JSON, replacing the whole look. Returns { binderLook, profileLook } as
 * column values, or { error, status } when the body may not be saved.
 */
export async function lookColumns(env, user, body) {
  const out = { binderLook: user.binder_look ?? null, profileLook: user.profile_look ?? null };
  if (has(body, "binderLook")) {
    if (isEmpty(body.binderLook)) {
      out.binderLook = null;
    } else {
      const look = normalizeBinderLook(body.binderLook);
      // Colours, materials and the rest are free; an animated edition is bought first.
      if (look.edition && !(await ownedEditionIds(env, user.id)).includes(look.edition)) {
        return { error: "Buy that edition first.", status: 400 };
      }
      out.binderLook = JSON.stringify(look);
    }
  }
  if (has(body, "profileLook")) {
    out.profileLook = isEmpty(body.profileLook) ? null : JSON.stringify(normalizeProfileLook(body.profileLook));
  }
  return out;
}

/**
 * Statements for a reset (POST /api/me/reset): coins and gear go back to the
 * start, so the editions bought with them go too, and a look wearing one is
 * taken off it. A reset is rare, so it checks the table and the column
 * itself instead of trusting this isolate's cache.
 */
export async function resetEditionStmts(env, userId) {
  schemaReady = false;
  await ensureBinderLookSchema(env);
  const info = await env.DB.prepare("PRAGMA table_info(users)").all();
  const hasLook = (info.results || []).some((row) => row.name === "binder_look");
  return [
    env.DB.prepare("DELETE FROM binder_editions WHERE user_id = ?").bind(userId),
    ...(hasLook
      ? [
          env.DB.prepare(
            "UPDATE users SET binder_look = json_set(binder_look, '$.edition', '') WHERE id = ? AND binder_look IS NOT NULL AND json_valid(binder_look)"
          ).bind(userId),
        ]
      : []),
  ];
}

// ---- Buying -------------------------------------------------------------------
async function buyEdition(env, user, body) {
  const requestId = String(body.requestId || "");
  if (!REQUEST_ID.test(requestId)) error("Provide a unique requestId.");
  const editionId = String(body.editionId || "");
  const edition = editionById(editionId);
  if (!edition) error("That edition isn't in the catalog.");
  await ensureBinderLookSchema(env);
  // true when this requestId already bought this edition (a retry: paid and owned), false when it is new.
  const replayed = async () => {
    const prior = await env.DB.prepare("SELECT kind, item_id FROM gear_purchases WHERE user_id = ? AND request_id = ?").bind(user.id, requestId).first();
    if (!prior) return false;
    if (prior.kind !== KIND || prior.item_id !== editionId) error("That requestId was used for something else.", 409);
    return true;
  };
  const owns = () => env.DB.prepare("SELECT 1 AS n FROM binder_editions WHERE user_id = ? AND edition_id = ?").bind(user.id, editionId).first();
  // Owned already: by this very purchase (the double tap that lost the race) is fine, any other way is a refusal.
  const refuseIfOwned = async () => {
    if (!(await owns())) return false;
    if (await replayed()) return true;
    error("You already own that edition.", 409);
  };
  if (await replayed()) return;
  if (await refuseIfOwned()) return;
  const price = editionPrice(editionId);
  const now = Date.now();
  let results;
  try {
    results = await env.DB.batch([
      env.DB.prepare(
        `UPDATE profiles SET coins = coins - ?1 WHERE user_id = ?2 AND coins >= ?1
         AND NOT EXISTS(SELECT 1 FROM binder_editions WHERE user_id = ?2 AND edition_id = ?3)`
      ).bind(price, user.id, editionId),
      env.DB.prepare("INSERT INTO binder_editions (user_id, edition_id, created_at) SELECT ?, ?, ? WHERE changes() = 1").bind(user.id, editionId, now),
      env.DB.prepare(
        `INSERT INTO gear_purchases (user_id, request_id, kind, item_id, qty, cents, created_at) SELECT ?, ?, '${KIND}', ?, 1, ?, ? WHERE changes() = 1`
      ).bind(user.id, requestId, editionId, Math.round(price * 100), now),
    ]);
  } catch (err) {
    // The double tap that lost the race: the winner's purchase is the answer.
    if (/UNIQUE constraint failed: gear_purchases/.test(err.message) && (await replayed())) return;
    throw err;
  }
  if (!results[2]?.meta?.changes) {
    if (await refuseIfOwned()) return;
    error("Not enough coins.", 402);
  }
}

// ---- Routes -------------------------------------------------------------------
/** Routes for /api/binder/editions*. Returns null when the path isn't one of them. helpers = { json, requireUser, readJson, money }. */
export async function handleBinderLook(path, method, request, env, helpers) {
  if (!path.startsWith("/api/binder/editions")) return null;
  const { json } = helpers;
  try {
    if (path !== "/api/binder/editions/buy" || method !== "POST") return json({ error: "Not found." }, 404);
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) error("Use this site to buy.", 403);
    if (!request.headers.get("content-type")?.includes("application/json")) error("Expected JSON.");
    const auth = await helpers.requireUser(request, env);
    if (auth.response) return auth.response;
    const body = await helpers.readJson(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) error("Expected JSON.");
    await buyEdition(env, auth.user, body);
    const profile = await env.DB.prepare("SELECT coins FROM profiles WHERE user_id = ?").bind(auth.user.id).first();
    return json({ ok: true, binderEditions: await ownedEditionIds(env, auth.user.id), coins: helpers.money(profile?.coins || 0) });
  } catch (err) {
    if (err.status) return json({ error: err.message }, err.status);
    throw err;
  }
}
