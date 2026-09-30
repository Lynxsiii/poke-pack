/**
 * Lifetime counters (player_stats), quest events, and the lazy schema behind
 * them. Nobody can run remote D1 migrations from a session, so the Worker
 * creates its own tables once per isolate; worker/migrations/0014_quest_stats.sql
 * holds the same DDL for whoever applies migrations later.
 *
 * player_stats keys the client sees (save.stats.counters): sold, bonus, sealed,
 * battles, battleWins, questsClaimed, chests, hitsPulled, maxDrought, streak,
 * streakBest. Keys that start with an underscore are bookkeeping and never
 * leave the Worker.
 */
import { isHit } from "../js/engine.js";

const DDL = [
  "CREATE TABLE IF NOT EXISTS player_stats (user_id TEXT NOT NULL, key TEXT NOT NULL, value INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, key), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)",
  "CREATE TABLE IF NOT EXISTS quest_events (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, kind TEXT NOT NULL, amount INTEGER NOT NULL, at INTEGER NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)",
  "CREATE INDEX IF NOT EXISTS idx_quest_events_user_at ON quest_events(user_id, at)",
  "CREATE TABLE IF NOT EXISTS quest_claims (user_id TEXT NOT NULL, quest_id TEXT NOT NULL, period_start INTEGER NOT NULL, claimed_at INTEGER NOT NULL, PRIMARY KEY (user_id, quest_id, period_start), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)",
];

let schemaReady = false;

/** Tests only: forget the per-isolate cache so another database is checked. */
export function resetQuestSchemaCache() {
  schemaReady = false;
}

/** Resolves true once the quest and stats tables exist; false (and retried next call) if they cannot be made. */
export async function ensureQuestSchema(env) {
  if (schemaReady) return true;
  try {
    for (const sql of DDL) await env.DB.exec(`${sql};`);
    schemaReady = true;
    return true;
  } catch (err) {
    console.error("ensureQuestSchema", err);
    return false;
  }
}

export function isMissingTable(err) {
  return String(err?.message || err).toLowerCase().includes("no such table");
}

/** A statement adding `delta` to a counter. */
export function bumpStatStmt(env, userId, key, delta) {
  return env.DB.prepare(
    `INSERT INTO player_stats (user_id, key, value) VALUES (?, ?, ?)
     ON CONFLICT(user_id, key) DO UPDATE SET value = value + excluded.value`
  ).bind(userId, key, delta);
}

/** A statement raising a counter to `value` if it is lower. */
export function maxStatStmt(env, userId, key, value) {
  return env.DB.prepare(
    `INSERT INTO player_stats (user_id, key, value) VALUES (?, ?, ?)
     ON CONFLICT(user_id, key) DO UPDATE SET value = MAX(value, excluded.value)`
  ).bind(userId, key, value);
}

/** A statement setting a counter outright. */
export function setStatStmt(env, userId, key, value) {
  return env.DB.prepare(
    `INSERT INTO player_stats (user_id, key, value) VALUES (?, ?, ?)
     ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value`
  ).bind(userId, key, value);
}

export function eventStmt(env, userId, kind, amount, at) {
  return env.DB.prepare("INSERT INTO quest_events (user_id, kind, amount, at) VALUES (?, ?, ?, ?)").bind(
    userId,
    kind,
    amount,
    at
  );
}

/**
 * Record one thing that happened: a quest event (when `event` is set), and a
 * lifetime counter (when `counter` is set). Never throws for a missing table:
 * the site keeps working while the schema catches up.
 */
export async function recordActivity(env, userId, { event = null, counter = null, amount = 1, at = Date.now() } = {}) {
  if (!amount) return;
  if (!(await ensureQuestSchema(env))) return;
  const stmts = [];
  if (event) stmts.push(eventStmt(env, userId, event, amount, at));
  if (counter) stmts.push(bumpStatStmt(env, userId, counter, amount));
  if (!stmts.length) return;
  try {
    await env.DB.batch(stmts);
  } catch (err) {
    if (!isMissingTable(err)) throw err;
  }
}

/**
 * Hit cards and the longest hitless run in a pack_log, oldest pack first.
 * The current dry run counts, so a player on a long drought already has it.
 */
export function droughtFromLog(rows) {
  let hits = 0;
  let run = 0;
  let max = 0;
  for (const row of rows) {
    let cards = [];
    try {
      cards = JSON.parse(row.cards || "[]");
    } catch {
      cards = [];
    }
    const found = Array.isArray(cards) ? cards.filter((card) => isHit(card)).length : 0;
    hits += found;
    if (found) {
      max = Math.max(max, run);
      run = 0;
    } else {
      run += 1;
    }
  }
  return { hits, maxDrought: Math.max(max, run) };
}

/**
 * The player's counters, as a plain object. The first read for an account
 * (no `_backfilled` marker) fills what pack_log already knows, hitsPulled and
 * maxDrought, so old accounts start with their real numbers. Rip calls this
 * before it writes its own pack_log rows, which keeps the two from counting a
 * pack twice.
 */
export async function loadCounters(env, userId) {
  if (!(await ensureQuestSchema(env))) return {};
  let rows;
  try {
    rows = (await env.DB.prepare("SELECT key, value FROM player_stats WHERE user_id = ?").bind(userId).all()).results || [];
  } catch (err) {
    if (isMissingTable(err)) return {};
    throw err;
  }
  const out = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  if (out._backfilled) return out;
  const log = (await env.DB.prepare("SELECT cards FROM pack_log WHERE user_id = ? ORDER BY at, id").bind(userId).all()).results || [];
  const { hits, maxDrought } = droughtFromLog(log);
  await env.DB.batch([
    setStatStmt(env, userId, "hitsPulled", hits),
    setStatStmt(env, userId, "maxDrought", maxDrought),
    setStatStmt(env, userId, "_backfilled", 1),
  ]);
  out.hitsPulled = hits;
  out.maxDrought = maxDrought;
  out._backfilled = 1;
  return out;
}

/** `{ setId: packs }` from pack_log. */
export async function setPacksFor(env, userId) {
  const rows =
    (await env.DB.prepare("SELECT set_id, COUNT(*) AS n FROM pack_log WHERE user_id = ? GROUP BY set_id").bind(userId).all())
      .results || [];
  return Object.fromEntries(rows.map((row) => [row.set_id, row.n]));
}

/** Accepted friends. The friends table is created by ensureSocialSchema, so it may not exist yet. */
export async function friendsCount(env, userId) {
  try {
    const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM friends WHERE from_id = ? AND status = 'accepted'").bind(userId).first();
    return row?.n || 0;
  } catch (err) {
    if (isMissingTable(err)) return 0;
    throw err;
  }
}

/** Statements that wipe a player's quest and stats rows (account reset). */
export function clearStatsStmts(env, userId) {
  return [
    env.DB.prepare("DELETE FROM player_stats WHERE user_id = ?").bind(userId),
    env.DB.prepare("DELETE FROM quest_events WHERE user_id = ?").bind(userId),
    env.DB.prepare("DELETE FROM quest_claims WHERE user_id = ?").bind(userId),
  ];
}

/**
 * Count a settled battle for every human seat, and a win for the seats the
 * result names. Called once, by whoever inserted the battle's settlement row.
 */
export async function recordBattleStats(env, battleId, at) {
  if (!(await ensureQuestSchema(env))) return;
  const row = await env.DB.prepare("SELECT result FROM battles WHERE id = ?").bind(battleId).first();
  let winners = [];
  try {
    winners = JSON.parse(row?.result || "{}").winners || [];
  } catch {
    winners = [];
  }
  const seats =
    (await env.DB.prepare("SELECT seat, user_id FROM battle_seats WHERE battle_id = ? AND bot = 0").bind(battleId).all()).results || [];
  const stmts = [];
  for (const seat of seats) {
    if (!seat.user_id) continue;
    stmts.push(eventStmt(env, seat.user_id, "battles", 1, at), bumpStatStmt(env, seat.user_id, "battles", 1));
    if (winners.includes(seat.seat)) {
      stmts.push(eventStmt(env, seat.user_id, "battleWins", 1, at), bumpStatStmt(env, seat.user_id, "battleWins", 1));
    }
  }
  if (stmts.length) await env.DB.batch(stmts);
}
