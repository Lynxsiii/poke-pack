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

// Best effort: it makes the per-set pack count an index-only read, but the
// quests work without it, so a failure here never blocks the tables.
const INDEX_DDL = "CREATE INDEX IF NOT EXISTS idx_pack_log_user_set ON pack_log(user_id, set_id)";

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
    try {
      await env.DB.exec(`${INDEX_DDL};`);
    } catch (err) {
      console.error("ensureQuestSchema index", err);
    }
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
export function droughtFromLog(rows, startRun = 0) {
  let hits = 0;
  let run = startRun;
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
  return { hits, maxDrought: Math.max(max, run), run };
}

const BACKFILL_CHUNK = 500;

/**
 * The player's counters, as a plain object. An account's first reads fill what
 * pack_log already knows, hitsPulled and maxDrought, a chunk at a time so a
 * huge history never costs one request everything: progress is kept in
 * `_bfRow` (last pack_log id done), `_bfMax` (the newest id at the start, so
 * packs ripped meanwhile, which are counted live, are never counted twice) and
 * `_bfRun` (the dry run so far), and `_backfilled` marks the end. Counters
 * show what is done so far. Battle packs (cost 0, written by the settlement)
 * are left out of the backfill exactly as the live path leaves them out.
 * Rip calls this before it writes its own pack_log rows. It never throws for
 * a backfill problem: the caller gets the counters without the marker.
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
  try {
    return await backfillChunk(env, userId, out);
  } catch (err) {
    console.error("loadCounters backfill", err);
    return out;
  }
}

async function backfillChunk(env, userId, out) {
  let max = out._bfMax;
  if (max == null) {
    max = (await env.DB.prepare("SELECT COALESCE(MAX(id), 0) AS top FROM pack_log WHERE user_id = ?").bind(userId).first())?.top || 0;
  }
  const row = out._bfRow || 0;
  const log =
    (
      await env.DB.prepare(
        "SELECT id, cards FROM pack_log WHERE user_id = ? AND id > ? AND id <= ? AND cost > 0 ORDER BY id LIMIT ?"
      )
        .bind(userId, row, max, BACKFILL_CHUNK)
        .all()
    ).results || [];
  const { hits, maxDrought, run } = droughtFromLog(log, out._bfRun || 0);
  const last = log.length >= BACKFILL_CHUNK ? log[log.length - 1].id : max;
  const done = log.length < BACKFILL_CHUNK;
  const peak = done ? Math.max(maxDrought, run) : maxDrought;
  // Claim the chunk before writing it: a concurrent read cannot count it twice.
  const claimed = await env.DB.prepare(
    `INSERT INTO player_stats (user_id, key, value) VALUES (?, '_bfRow', ?)
     ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value WHERE value = ?`
  )
    .bind(userId, last, row)
    .run();
  if (!claimed.meta?.changes) return out;
  const stmts = [
    setStatStmt(env, userId, "_bfMax", max),
    bumpStatStmt(env, userId, "hitsPulled", hits),
    maxStatStmt(env, userId, "maxDrought", peak),
    setStatStmt(env, userId, "_bfRun", done ? 0 : run),
  ];
  if (done) stmts.push(setStatStmt(env, userId, "_backfilled", 1));
  try {
    await env.DB.batch(stmts);
  } catch (err) {
    // Put the claim back so the next read retries this chunk.
    await env.DB.prepare("UPDATE player_stats SET value = ? WHERE user_id = ? AND key = '_bfRow' AND value = ?").bind(row, userId, last).run();
    throw err;
  }
  return {
    ...out,
    _bfRow: last,
    _bfMax: max,
    _bfRun: done ? 0 : run,
    hitsPulled: (out.hitsPulled || 0) + hits,
    maxDrought: Math.max(out.maxDrought || 0, peak),
    ...(done ? { _backfilled: 1 } : {}),
  };
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

const BATTLE_SYNC_LIMIT = 200;
const QUEST_EVENT_KEEP_MS = 40 * 86_400_000;

/**
 * Fold the player's settled battles into their counters and quest events.
 *
 * Battle results live in battles/battle_seats/battle_settlements, which this
 * file must not put triggers on, so they are read here instead. `_battleRow`
 * remembers the last settlement (by rowid, which only ever grows) already
 * counted, so a steady-state read is one cheap range query and each battle is
 * parsed once. Each settlement adds a `battles` event (and a `battleWins`
 * event when the seat is in the result's winners) stamped with the settlement
 * time, plus the lifetime counters. Human seats only. A result that is not
 * valid JSON counts as played, not won, rather than blocking every later read.
 *
 * The watermark is moved with a compare-and-set before anything is written, so
 * two requests reading at once cannot both count a battle, and the writes are
 * one D1 batch (atomic); if that batch fails the watermark is put back. Any
 * failure, such as the battle tables not existing yet, leaves the counters as
 * they were. Returns the counters with the new counts folded in.
 */
export async function syncBattleStats(env, userId, counters, now = Date.now()) {
  try {
    const mark = counters._battleRow || 0;
    const top = (await env.DB.prepare("SELECT MAX(rowid) AS top FROM battle_settlements").first())?.top || 0;
    if (top <= mark) return counters;
    const rows =
      (
        await env.DB.prepare(
          `SELECT t.rowid AS row, t.at AS at,
             CASE WHEN json_valid(b.result)
               THEN EXISTS (SELECT 1 FROM json_each(b.result, '$.winners') w WHERE w.value = s.seat)
               ELSE 0 END AS won
           FROM battle_settlements t
           JOIN battle_seats s ON s.battle_id = t.battle_id AND s.user_id = ? AND s.bot = 0
           JOIN battles b ON b.id = t.battle_id
           WHERE t.rowid > ? ORDER BY t.rowid LIMIT ?`
        )
          .bind(userId, mark, BATTLE_SYNC_LIMIT)
          .all()
      ).results || [];
    // A full page means more may follow: stop at the last row seen and continue next read.
    const next = rows.length >= BATTLE_SYNC_LIMIT ? rows[rows.length - 1].row : top;
    const claimed = await env.DB.prepare(
      `INSERT INTO player_stats (user_id, key, value) VALUES (?, '_battleRow', ?)
       ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value WHERE value = ?`
    )
      .bind(userId, next, mark)
      .run();
    if (!claimed.meta?.changes) return counters;
    const out = { ...counters, _battleRow: next };
    const wins = rows.filter((row) => row.won).length;
    const events = [];
    for (const row of rows) {
      if (row.at < now - QUEST_EVENT_KEEP_MS) continue;
      events.push({ kind: "battles", at: row.at });
      if (row.won) events.push({ kind: "battleWins", at: row.at });
    }
    try {
      const stmts = [];
      if (events.length) {
        stmts.push(
          env.DB.prepare(
            `INSERT INTO quest_events (user_id, kind, amount, at)
             SELECT ?, json_extract(value, '$.kind'), 1, json_extract(value, '$.at') FROM json_each(?)`
          ).bind(userId, JSON.stringify(events))
        );
      }
      if (rows.length) stmts.push(bumpStatStmt(env, userId, "battles", rows.length));
      if (wins) stmts.push(bumpStatStmt(env, userId, "battleWins", wins));
      if (stmts.length) await env.DB.batch(stmts);
    } catch (err) {
      await env.DB.prepare("UPDATE player_stats SET value = ? WHERE user_id = ? AND key = '_battleRow' AND value = ?").bind(mark, userId, next).run();
      throw err;
    }
    if (rows.length) out.battles = (out.battles || 0) + rows.length;
    if (wins) out.battleWins = (out.battleWins || 0) + wins;
    return out;
  } catch (err) {
    if (!isMissingTable(err)) console.error("syncBattleStats", err);
    return counters;
  }
}

/** After a reset: treat every battle settled so far as already counted. */
export async function skipSettledBattles(env, userId) {
  try {
    await env.DB.prepare(
      `INSERT INTO player_stats (user_id, key, value)
       SELECT ?, '_battleRow', COALESCE(MAX(rowid), 0) FROM battle_settlements WHERE 1
       ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value`
    )
      .bind(userId)
      .run();
  } catch (err) {
    if (!isMissingTable(err)) console.error("skipSettledBattles", err);
  }
}
