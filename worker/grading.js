/**
 * RIP Grading (migration 0019). The rules live in js/grading-rules.js; this
 * file moves the copies and the coins. A client only asks.
 *
 *   GET  /api/grading                 { slabs, guards: { owned, equipped }, rulesVersion }
 *   POST /api/grading/submit          { cardId, reverse, requestId }  -> { slab, save }
 *   POST /api/grading/crack           { slabId }                      -> { save }
 *   POST /api/grading/sell            { slabId, requestId }           -> { sold, save }
 *   POST /api/grading/guard           { slabId, guardId | null }      -> { slab, save }
 *   POST /api/grading/guards/buy      { guardId, qty, requestId }     -> { save }
 *
 * Every move is one D1 batch (a transaction) whose statements are chained
 * with changes() = 1, so a copy, its fee and its slab row move together or
 * not at all. The grade is rolled once, in the Worker, with crypto, before
 * the batch; a retry with the same requestId finds the row and never rerolls.
 * Guards are cosmetic bumpers: stock is the qty in user_gear(kind='guard'),
 * what is worn is the `guard` column of each active slab, so a free unit is
 * owned minus worn.
 */
import { ALL_SETS, money } from "../js/catalog.js";
import {
  GRADING_LIMITS,
  GRADING_RULES_VERSION,
  bandFor,
  certNumber,
  energySet,
  gradedValue,
  gradingFee,
  guardById,
  rollGrade,
} from "../js/grading-rules.js";
import { ensureGearSchema } from "./gear.js";

const error = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
const REQUEST_ID = /^[a-zA-Z0-9-]{8,80}$/;
const CARD_ID = /^[a-z0-9-]{3,48}$/i;
const ACTIVE = "slabbed";
const IN_GAME = "That slab is in a casino game.";
// The assets binding serves by path, so any origin does when a save is loaded
// without a request in hand (loadSave has none).
const FALLBACK_ORIGIN = "https://poke-pack.rip/";

let schemaReady = false;
/** Tests only: forget the per-isolate cache so another database is checked. */
export const resetGradingSchemaCache = () => {
  schemaReady = false;
};

/** Same statements as worker/migrations/0019_grading.sql, so a deploy needs no manual step. */
export const GRADING_DDL = [
  `CREATE TABLE IF NOT EXISTS graded_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    card_id TEXT NOT NULL,
    reverse INTEGER NOT NULL DEFAULT 0 CHECK(reverse IN (0,1)),
    grade INTEGER NOT NULL CHECK(grade BETWEEN 1 AND 10),
    band TEXT NOT NULL,
    fee_cents INTEGER NOT NULL CHECK(fee_cents >= 0),
    request_id TEXT NOT NULL,
    guard TEXT,
    status TEXT NOT NULL DEFAULT 'slabbed' CHECK(status IN ('slabbed','cracked','sold')),
    created_at INTEGER NOT NULL,
    closed_at INTEGER,
    sell_request_id TEXT,
    sold_cents INTEGER,
    UNIQUE(user_id, request_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  "CREATE INDEX IF NOT EXISTS idx_graded_cards_user ON graded_cards(user_id, status)",
  `CREATE TABLE IF NOT EXISTS gear_purchases (
    user_id TEXT NOT NULL,
    request_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    item_id TEXT NOT NULL,
    qty INTEGER NOT NULL CHECK(qty > 0),
    cents INTEGER NOT NULL CHECK(cents >= 0),
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, request_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  "CREATE INDEX IF NOT EXISTS idx_gear_purchases_user ON gear_purchases(user_id, created_at DESC)",
];

/** Columns added after 0019, each as (name, ALTER): worker/migrations/0020_grading_shown.sql. */
export const GRADING_COLUMNS = [
  ["shown", "ALTER TABLE graded_cards ADD COLUMN shown INTEGER NOT NULL DEFAULT 0 CHECK(shown IN (0,1))"],
  // worker/migrations/0021_casino_slabs.sql: '<game>:<gameId>' while the slab is staked in a casino game.
  ["locked", "ALTER TABLE graded_cards ADD COLUMN locked TEXT"],
];

let schemaWork = null;
export async function ensureGradingSchema(env) {
  if (schemaReady) return;
  // Requests that arrive together share one upgrade, so two never race the same ALTER.
  if (!schemaWork) {
    schemaWork = (async () => {
      try {
        for (const sql of GRADING_DDL) await env.DB.exec(`${sql.replace(/\s+/g, " ").trim()};`);
        const info = await env.DB.prepare("PRAGMA table_info(graded_cards)").all();
        const have = new Set((info.results || []).map((row) => row.name));
        for (const [name, sql] of GRADING_COLUMNS) {
          if (have.has(name)) continue;
          try {
            await env.DB.exec(`${sql};`);
          } catch (err) {
            // Another isolate got there first.
            if (!/duplicate column/i.test(String(err?.message || err))) throw err;
          }
        }
        schemaReady = true;
      } catch (err) {
        console.error("ensureGradingSchema", err);
        throw err;
      } finally {
        schemaWork = null;
      }
    })();
  }
  return schemaWork;
}

// ---- Randomness ---------------------------------------------------------------
/** A uniform integer in [0, n) from a Uint32, rejecting the biased tail (no modulo bias). */
export function randomBelow(n) {
  if (!Number.isInteger(n) || n < 1 || n > 2 ** 32) throw new Error("randomBelow needs 1 <= n <= 2^32.");
  const limit = 2 ** 32 - (2 ** 32 % n);
  const buf = new Uint32Array(1);
  for (;;) {
    const r = crypto.getRandomValues(buf)[0];
    if (r < limit) return r % n;
  }
}

// ---- Views --------------------------------------------------------------------
/** The set a card id belongs to, for its grading band (a basic Energy gets a stand-in by print). */
export function setForCard(cardId) {
  return ALL_SETS.find((set) => cardId.startsWith(`${set.id}-`)) || energySet(cardId);
}

/** A graded_cards row as the client sees it. `card` is the catalog card (null when the catalog lost it). */
export function slabView(row, card) {
  const set = setForCard(row.card_id);
  return {
    id: row.id,
    cert: certNumber(row.id),
    cardId: row.card_id,
    reverse: Boolean(row.reverse),
    grade: row.grade,
    band: row.band,
    fee: row.fee_cents / 100,
    value: card ? gradedValue(card, row.grade, set) : null,
    guard: row.guard || null,
    shown: Boolean(row.shown),
    gradedAt: row.created_at,
  };
}

/** A slab in a casino stake, from the snapshot frozen when it went in: `value` is its graded value then, in coins. */
export function stakeSlabView(snap) {
  return {
    id: snap.id,
    cert: certNumber(snap.id),
    cardId: snap.cardId,
    name: snap.name,
    number: snap.number,
    rarity: snap.rarity,
    image: snap.image,
    small: snap.small,
    grade: snap.grade,
    reverse: Boolean(snap.reverse),
    guard: snap.guard || null,
    value: money((snap.v || 0) / 100),
  };
}

const requestFor = (deps) => deps.request || { url: FALLBACK_ORIGIN };

// A slab staked in a casino game (`locked` set) is in escrow: it is nobody's to show, crack, sell or
// count until the game returns or pays it, exactly like a staked raw card is not in `cards`.
async function activeRows(env, userId) {
  return (
    (
      await env.DB.prepare("SELECT * FROM graded_cards WHERE user_id = ? AND status = ? AND locked IS NULL ORDER BY created_at DESC, id DESC")
        .bind(userId, ACTIVE)
        .all()
    ).results || []
  );
}

async function readSlabs(env, userId, deps) {
  await ensureGradingSchema(env);
  const rows = await activeRows(env, userId);
  const out = [];
  for (const row of rows) out.push(slabView(row, await deps.findCatalogCard(env, requestFor(deps), row.card_id)));
  return out;
}

/** The caller's slabs that sit in open casino games, valued at today's market, each with its game: GET /api/grading `inGame`. */
export async function inGameSlabs(env, userId, deps) {
  await ensureGradingSchema(env);
  const rows =
    (
      await env.DB.prepare(
        `SELECT * FROM graded_cards WHERE user_id = ? AND status = '${ACTIVE}' AND locked IS NOT NULL ORDER BY created_at DESC, id DESC`
      )
        .bind(userId)
        .all()
    ).results || [];
  const out = [];
  for (const row of rows) {
    const [game, ...rest] = String(row.locked).split(":");
    const card = await deps.findCatalogCard(env, requestFor(deps), row.card_id);
    // The same card fields a stake snapshot carries (stakeSlabView), so the page can draw it without a second lookup.
    out.push({
      ...slabView(row, card),
      name: card?.name ?? null,
      number: card?.number ?? null,
      rarity: card?.rarity ?? null,
      image: card?.image ?? null,
      small: card ? card.imageSmall || card.image : null,
      game,
      gameId: rest.join(":"),
    });
  }
  return out;
}

/** The caller's active slabs, valued at today's market: `save.graded`. deps = { findCatalogCard, request? }. */
export async function gradedSlabs(env, userId, deps) {
  try {
    return await readSlabs(env, userId, deps);
  } catch (err) {
    // A database swapped underneath a warm isolate (or a restore) loses the tables.
    if (!/no such table/i.test(String(err?.message || err))) throw err;
    schemaReady = false;
    return readSlabs(env, userId, deps);
  }
}

/** Active slabs per card id, for anything that budgets a binder pocket against
    what a player owns: a copy in a slab is still theirs. */
export async function gradedCounts(env, userId) {
  await ensureGradingSchema(env);
  const res = await env.DB.prepare(
    `SELECT card_id AS id, COUNT(*) AS n FROM graded_cards WHERE user_id = ? AND status = '${ACTIVE}' AND locked IS NULL GROUP BY card_id`
  ).bind(userId).all();
  const out = {};
  for (const row of res.results || []) out[row.id] = Number(row.n) || 0;
  return out;
}

/** The slabs a player chose for the Graded section of their public profile:
    best grade first, then newest, at most GRADING_LIMITS.maxShown. Each carries
    the card's name, rarity and image so a profile can draw it without a set load. */
export async function shownSlabs(env, userId, deps) {
  await ensureGradingSchema(env);
  const rows =
    (
      await env.DB.prepare(
        `SELECT * FROM graded_cards WHERE user_id = ? AND status = '${ACTIVE}' AND locked IS NULL AND shown = 1
         ORDER BY grade DESC, created_at DESC, id DESC LIMIT ?`
      )
        .bind(userId, GRADING_LIMITS.maxShown)
        .all()
    ).results || [];
  const out = [];
  for (const row of rows) {
    let card = null;
    try {
      card = await deps.findCatalogCard(env, requestFor(deps), row.card_id);
    } catch {
      /* a set whose data is missing: the slab still shows with what the row knows */
    }
    out.push({
      ...slabView(row, card),
      name: card?.name || "",
      rarity: card?.rarity || "",
      image: card?.imageSmall || card?.image || "",
    });
  }
  return out;
}

/** How many active slabs a player has: the profile's "N graded" line. */
export async function gradedTotal(env, userId) {
  await ensureGradingSchema(env);
  const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM graded_cards WHERE user_id = ? AND status = '${ACTIVE}' AND locked IS NULL`).bind(userId).first();
  return Number(row?.n) || 0;
}

/** Guard stock: owned units per guard (user_gear) and how many active slabs wear each. A slab in a casino
    game keeps its guard (a cancel returns it intact), so it still counts as wearing one: the unit is not free. */
export async function guardSummary(env, userId) {
  await ensureGearSchema(env);
  await ensureGradingSchema(env);
  const owned = {};
  for (const row of (
    await env.DB.prepare("SELECT item_id, qty FROM user_gear WHERE user_id = ? AND kind = 'guard' AND qty > 0 ORDER BY item_id")
      .bind(userId)
      .all()
  ).results || []) {
    owned[row.item_id] = row.qty;
  }
  const equipped = {};
  for (const row of (
    await env.DB.prepare(
      "SELECT guard, COUNT(*) AS n FROM graded_cards WHERE user_id = ? AND status = ? AND guard IS NOT NULL GROUP BY guard"
    )
      .bind(userId, ACTIVE)
      .all()
  ).results || []) {
    equipped[row.guard] = row.n;
  }
  return { owned, equipped };
}

/** What GET /api/grading answers with. */
export async function gradedSummary(env, userId, deps) {
  return {
    slabs: await gradedSlabs(env, userId, deps),
    inGame: await inGameSlabs(env, userId, deps),
    guards: await guardSummary(env, userId),
    rulesVersion: GRADING_RULES_VERSION,
  };
}

// ---- Moves --------------------------------------------------------------------
const requestIdOf = (body) => {
  const requestId = String(body.requestId || "");
  if (!REQUEST_ID.test(requestId)) error("Provide a unique requestId.");
  return requestId;
};
const slabIdOf = (body) => {
  const id = Number(body.slabId);
  if (!Number.isInteger(id) || id < 1) error("Pick a slab.");
  return id;
};
const rowFor = (env, userId, requestId) =>
  env.DB.prepare("SELECT * FROM graded_cards WHERE user_id = ? AND request_id = ?").bind(userId, requestId).first();
const slabFor = (env, userId, id) => env.DB.prepare("SELECT * FROM graded_cards WHERE id = ? AND user_id = ?").bind(id, userId).first();

async function submit(env, request, helpers, user, body) {
  const requestId = requestIdOf(body);
  const cardId = String(body.cardId || "");
  if (!CARD_ID.test(cardId)) error("Pick a card.");
  const reverse = body.reverse === true || body.reverse === 1 || body.reverse === "1";
  const existing = await rowFor(env, user.id, requestId);
  if (existing) return existing; // a retry: the copy and the fee already moved, the grade stands
  const card = await helpers.findCatalogCard(env, request, cardId);
  if (!card) error("Unknown card.");
  const set = setForCard(cardId);
  const band = bandFor(set);
  const feeCents = Math.round(gradingFee(card) * 100);
  const grade = rollGrade(band, randomBelow(10000)); // rolled once, before anything moves
  const now = Date.now();
  const copyExists = reverse
    ? "EXISTS(SELECT 1 FROM cards WHERE user_id = ?3 AND card_id = ?4 AND qty >= 1 AND reverse_qty >= 1)"
    : "EXISTS(SELECT 1 FROM cards WHERE user_id = ?3 AND card_id = ?4 AND qty - reverse_qty >= 1)";
  const stmts = [
    env.DB.prepare(
      `UPDATE profiles SET coins = coins - ?1 WHERE user_id = ?3 AND coins >= ?1 AND ${copyExists}
       AND (SELECT COUNT(*) FROM graded_cards WHERE user_id = ?3 AND status = '${ACTIVE}') < ?2`
    ).bind(feeCents / 100, GRADING_LIMITS.maxSlabs, user.id, cardId),
    env.DB.prepare(
      "UPDATE cards SET qty = qty - 1, reverse_qty = reverse_qty - ? WHERE user_id = ? AND card_id = ? AND changes() = 1"
    ).bind(reverse ? 1 : 0, user.id, cardId),
    env.DB.prepare(
      `INSERT INTO graded_cards (user_id, card_id, reverse, grade, band, fee_cents, request_id, status, created_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, '${ACTIVE}', ? WHERE changes() = 1`
    ).bind(user.id, cardId, reverse ? 1 : 0, grade, band.id, feeCents, requestId, now),
    env.DB.prepare("DELETE FROM cards WHERE user_id = ? AND card_id = ? AND qty = 0").bind(user.id, cardId),
  ];
  let results;
  try {
    results = await env.DB.batch(stmts);
  } catch (err) {
    // A double-tapped submit that lost the race: the winner's row is the answer.
    if (/UNIQUE constraint failed: graded_cards/.test(err.message)) {
      const raced = await rowFor(env, user.id, requestId);
      if (raced) return raced;
    }
    throw err;
  }
  if (!results[2]?.meta?.changes) {
    // Nothing moved. Say which check failed, in the order a player would fix them.
    const copy = await env.DB.prepare("SELECT qty, reverse_qty FROM cards WHERE user_id = ? AND card_id = ?").bind(user.id, cardId).first();
    const have = copy ? (reverse ? Math.min(copy.qty, copy.reverse_qty) : copy.qty - copy.reverse_qty) : 0;
    if (have < 1) error(reverse ? "You don't have a reverse holo copy to send in." : "You don't have a copy to send in.", 404);
    const profile = await env.DB.prepare("SELECT coins FROM profiles WHERE user_id = ?").bind(user.id).first();
    if ((profile?.coins || 0) < feeCents / 100) error("Not enough coins.", 402);
    error(`You can keep ${GRADING_LIMITS.maxSlabs} slabs at once. Crack or sell one first.`, 409);
  }
  return rowFor(env, user.id, requestId);
}

async function crack(env, user, body) {
  const id = slabIdOf(body);
  const row = await slabFor(env, user.id, id);
  if (!row) error("Slab not found.", 404);
  if (row.status !== ACTIVE) error(row.status === "sold" ? "That slab was sold." : "That slab is already cracked.", 409);
  if (row.locked) error(IN_GAME, 409);
  const results = await env.DB.batch([
    env.DB.prepare(
      `UPDATE graded_cards SET status = 'cracked', closed_at = ?, guard = NULL, shown = 0 WHERE id = ? AND user_id = ? AND status = '${ACTIVE}' AND locked IS NULL`
    )
      .bind(Date.now(), id, user.id),
    env.DB.prepare(
      `INSERT INTO cards (user_id, card_id, qty, reverse_qty) SELECT ?, ?, 1, ? WHERE changes() = 1
       ON CONFLICT(user_id, card_id) DO UPDATE SET qty = cards.qty + 1, reverse_qty = cards.reverse_qty + excluded.reverse_qty`
    ).bind(user.id, row.card_id, row.reverse ? 1 : 0),
  ]);
  if (!results[0]?.meta?.changes) {
    // Staked in a game between the read and the write: nothing moved (the card insert is chained on changes()).
    if ((await slabFor(env, user.id, id))?.locked) error(IN_GAME, 409);
    error("That slab is already open.", 409);
  }
  return row;
}

async function sell(env, request, helpers, user, body) {
  const requestId = requestIdOf(body);
  const id = slabIdOf(body);
  const row = await slabFor(env, user.id, id);
  if (!row) error("Slab not found.", 404);
  if (row.status === "sold" && row.sell_request_id === requestId) return { row, cents: row.sold_cents || 0, repeat: true };
  if (row.status !== ACTIVE) error(row.status === "sold" ? "That slab was already sold." : "That slab was cracked.", 409);
  if (row.locked) error(IN_GAME, 409);
  const card = await helpers.findCatalogCard(env, request, row.card_id);
  if (!card) error("That card has no price right now.", 409);
  const cents = Math.round(gradedValue(card, row.grade, setForCard(row.card_id)) * 100);
  const results = await env.DB.batch([
    env.DB.prepare(
      `UPDATE graded_cards SET status = 'sold', closed_at = ?, guard = NULL, shown = 0, sell_request_id = ?, sold_cents = ?
       WHERE id = ? AND user_id = ? AND status = '${ACTIVE}' AND locked IS NULL`
    ).bind(Date.now(), requestId, cents, id, user.id),
    env.DB.prepare("UPDATE profiles SET coins = coins + ? WHERE user_id = ? AND changes() = 1").bind(cents / 100, user.id),
  ]);
  if (!results[0]?.meta?.changes) {
    const again = await slabFor(env, user.id, id);
    if (again?.status === "sold" && again.sell_request_id === requestId) return { row: again, cents: again.sold_cents || 0, repeat: true };
    if (again?.locked) error(IN_GAME, 409);
    error("That slab already changed. Refresh and look again.", 409);
  }
  return { row, cents, repeat: false };
}

async function guard(env, user, body) {
  const id = slabIdOf(body);
  const guardId = body.guardId == null || body.guardId === "" ? null : String(body.guardId).slice(0, 80);
  const item = guardId ? guardById(guardId) : null;
  if (guardId && !item) error("That guard isn't in the catalog.");
  const row = await slabFor(env, user.id, id);
  if (!row || row.status !== ACTIVE) error("Slab not found.", 404);
  if (row.locked) error(IN_GAME, 409); // the guard travels with the slab through the game
  if ((row.guard || null) === guardId) return row; // already wearing it (or already bare)
  if (!guardId) {
    const bare = await env.DB.prepare(`UPDATE graded_cards SET guard = NULL WHERE id = ? AND user_id = ? AND status = '${ACTIVE}' AND locked IS NULL`)
      .bind(id, user.id)
      .run();
    if (!bare.meta?.changes && (await slabFor(env, user.id, id))?.locked) error(IN_GAME, 409);
    return slabFor(env, user.id, id);
  }
  await ensureGearSchema(env);
  // Free units = owned - worn by OTHER active slabs; the swap frees this slab's own guard in the same statement.
  const done = await env.DB.prepare(
    `UPDATE graded_cards SET guard = ?1 WHERE id = ?2 AND user_id = ?3 AND status = '${ACTIVE}' AND locked IS NULL
     AND COALESCE((SELECT qty FROM user_gear WHERE user_id = ?3 AND kind = 'guard' AND item_id = ?1), 0)
       > (SELECT COUNT(*) FROM graded_cards WHERE user_id = ?3 AND status = '${ACTIVE}' AND guard = ?1 AND id != ?2)`
  )
    .bind(guardId, id, user.id)
    .run();
  if (!done.meta?.changes) {
    const again = await slabFor(env, user.id, id);
    if (!again || again.status !== ACTIVE) error("Slab not found.", 404);
    if (again.locked) error(IN_GAME, 409);
    error(`No free ${item.name} guard. Buy one or take it off another slab.`, 409);
  }
  return slabFor(env, user.id, id);
}

/** Put a slab in (or take it out of) the Graded section of the player's profile. */
async function show(env, user, body) {
  const id = slabIdOf(body);
  const wanted = body.shown === true || body.shown === 1 || body.shown === "1";
  const row = await slabFor(env, user.id, id);
  if (!row || row.status !== ACTIVE) error("Slab not found.", 404);
  if (row.locked) error(IN_GAME, 409);
  if (Boolean(row.shown) === wanted) return row;
  if (!wanted) {
    await env.DB.prepare(`UPDATE graded_cards SET shown = 0 WHERE id = ? AND user_id = ? AND status = '${ACTIVE}' AND locked IS NULL`).bind(id, user.id).run();
    return slabFor(env, user.id, id);
  }
  // The cap is checked in the same statement, so two taps at once cannot pass it.
  const done = await env.DB.prepare(
    `UPDATE graded_cards SET shown = 1 WHERE id = ?1 AND user_id = ?2 AND status = '${ACTIVE}' AND locked IS NULL
     AND (SELECT COUNT(*) FROM graded_cards WHERE user_id = ?2 AND status = '${ACTIVE}' AND shown = 1 AND id != ?1) < ?3`
  )
    .bind(id, user.id, GRADING_LIMITS.maxShown)
    .run();
  if (!done.meta?.changes) {
    const again = await slabFor(env, user.id, id);
    if (!again || again.status !== ACTIVE) error("Slab not found.", 404);
    if (again.locked) error(IN_GAME, 409);
    error(`Your profile shows up to ${GRADING_LIMITS.maxShown} slabs. Take one off to add this one.`, 409);
  }
  return slabFor(env, user.id, id);
}

async function buyGuards(env, user, body) {
  const requestId = requestIdOf(body);
  const guardId = String(body.guardId || "");
  const item = guardById(guardId);
  if (!item) error("That guard isn't in the catalog.");
  const qty = Number(body.qty ?? 1);
  if (!Number.isInteger(qty) || qty < 1 || qty > GRADING_LIMITS.maxGuardQty) error(`Buy 1 to ${GRADING_LIMITS.maxGuardQty} at a time.`);
  await ensureGearSchema(env);
  const prior = await env.DB.prepare("SELECT qty FROM gear_purchases WHERE user_id = ? AND request_id = ?").bind(user.id, requestId).first();
  if (prior) return; // a retry: already paid and stocked
  const cents = Math.round(item.price * 100) * qty;
  const now = Date.now();
  let results;
  try {
    results = await env.DB.batch([
      env.DB.prepare("UPDATE profiles SET coins = coins - ?1 WHERE user_id = ?2 AND coins >= ?1").bind(cents / 100, user.id),
      env.DB.prepare(
        `INSERT INTO user_gear (user_id, kind, item_id, qty, first_at, last_at) SELECT ?, 'guard', ?, ?, ?, ? WHERE changes() = 1
         ON CONFLICT(user_id, kind, item_id) DO UPDATE SET qty = user_gear.qty + excluded.qty, last_at = excluded.last_at`
      ).bind(user.id, guardId, qty, now, now),
      env.DB.prepare(
        "INSERT INTO gear_purchases (user_id, request_id, kind, item_id, qty, cents, created_at) SELECT ?, ?, 'guard', ?, ?, ?, ? WHERE changes() = 1"
      ).bind(user.id, requestId, guardId, qty, cents, now),
    ]);
  } catch (err) {
    if (/UNIQUE constraint failed: gear_purchases/.test(err.message)) return; // the double tap that lost the race
    throw err;
  }
  if (!results[2]?.meta?.changes) error("Not enough coins.", 402);
}

// ---- Routes -------------------------------------------------------------------
/** Routes for /api/grading*. Returns null when the path isn't one of them. deps as handleCasino's. */
export async function handleGrading(path, method, request, env, helpers) {
  if (!path.startsWith("/api/grading")) return null;
  const { json } = helpers;
  try {
    await ensureGradingSchema(env);
    const deps = { findCatalogCard: helpers.findCatalogCard, request };
    if (path === "/api/grading" && method === "GET") {
      const auth = await helpers.requireUser(request, env);
      if (auth.response) return auth.response;
      return json(await gradedSummary(env, auth.user.id, deps));
    }
    const action = path.match(/^\/api\/grading\/(submit|crack|sell|guard|show|guards\/buy)$/)?.[1];
    if (!action || method !== "POST") return json({ error: "Not found." }, 404);
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) error("Use this site to grade.", 403);
    if (!request.headers.get("content-type")?.includes("application/json")) error("Expected JSON.");
    const auth = await helpers.requireUser(request, env);
    if (auth.response) return auth.response;
    const user = auth.user;
    const body = await helpers.readJson(request);
    if (!body || typeof body !== "object") error("Expected JSON.");
    const view = async (row) => slabView(row, await helpers.findCatalogCard(env, request, row.card_id));
    if (action === "submit") {
      const row = await submit(env, request, helpers, user, body);
      return json({ slab: await view(row), save: await helpers.loadSave(env, user.id) });
    }
    if (action === "crack") {
      await crack(env, user, body);
      return json({ save: await helpers.loadSave(env, user.id) });
    }
    if (action === "sell") {
      const { cents, repeat } = await sell(env, request, helpers, user, body);
      if (!repeat) await helpers.recordQuestEvent?.(env, user.id, "sold", 1);
      return json({ sold: cents / 100, save: await helpers.loadSave(env, user.id) });
    }
    if (action === "guard") {
      const row = await guard(env, user, body);
      return json({ slab: await view(row), save: await helpers.loadSave(env, user.id) });
    }
    if (action === "show") {
      const row = await show(env, user, body);
      return json({ slab: await view(row), save: await helpers.loadSave(env, user.id) });
    }
    await buyGuards(env, user, body);
    return json({ save: await helpers.loadSave(env, user.id) });
  } catch (err) {
    if (err.status) return json({ error: err.message }, err.status);
    throw err;
  }
}
