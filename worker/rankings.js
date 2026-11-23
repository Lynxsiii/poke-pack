/**
 * Rankings: boards players climb and compare on (GET /api/rankings).
 *
 * Every number comes from what the server already holds, never from a figure
 * the page sends:
 *  - Collection value, level and sets mastered are snapshots of a trainer's
 *    cards, slabs, XP row and claimed achievements (rank_scores), refreshed by
 *    the cron for trainers who played since their last snapshot, and for the
 *    viewer when they open a board.
 *  - Packs ripped and best pull are read from pack_log, the server's own record
 *    of every pack it rolled (rips, sealed product, battles). The cron walks it
 *    with a cursor (rank_state), so each pack is counted once, into an
 *    all-time row (rank_totals) and a weekly one (rank_weekly).
 *
 * Cheating guards: a guest save imported at sign-up never rolled on the server,
 * so its packs are not in pack_log and never reach the pack or pull boards. A
 * trainer who signed up after rankings opened with a big imported save sits
 * out the Collection, Level and Mastery boards (old accounts keep their
 * standing). A trainer needs MIN_PACKS server packs to appear at all, which
 * keeps empty alt accounts off. The Claude test account (HIDDEN_HANDLES) only
 * shows on its friends' boards.
 */
import { ALL_SETS } from "../js/catalog.js";
import { sellValue } from "../js/catalog.js";
import { gradedValue } from "../js/grading-rules.js";
import { masterySetIds } from "./social.js";
import { playerXp } from "./xp.js";
import {
  BOARDS,
  MIN_PACKS,
  IMPORT_ALLOWANCE,
  RANKINGS_OPENED,
  weekOf,
  weekStart,
  boardPeriods,
} from "../js/rankings-rules.js";

export const HIDDEN_HANDLES = ["claude"];
const LIST_LIMIT = 50;
const LOG_BATCH = 1000;
const LOG_LOOPS = 20;
const LOG_BUDGET_MS = 12_000;
const SNAPSHOT_BATCH = 25;
const STALE_BATCH = 10;
const VIEWER_FRESH_MS = 60_000;
const CACHE_MS = 60_000;
const PODIUM = 3;

const DDL = [
  `CREATE TABLE IF NOT EXISTS rank_scores (
    user_id TEXT PRIMARY KEY, worth REAL NOT NULL DEFAULT 0, level INTEGER NOT NULL DEFAULT 1,
    prestige INTEGER NOT NULL DEFAULT 0, xp INTEGER NOT NULL DEFAULT 0, mastered INTEGER NOT NULL DEFAULT 0,
    server_packs INTEGER NOT NULL DEFAULT 0, imported INTEGER NOT NULL DEFAULT 0, eligible INTEGER NOT NULL DEFAULT 1,
    updated_at INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS rank_totals (
    user_id TEXT PRIMARY KEY, packs INTEGER NOT NULL DEFAULT 0, best_value REAL NOT NULL DEFAULT 0,
    best_card TEXT, best_at INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS rank_weekly (
    user_id TEXT NOT NULL, week INTEGER NOT NULL, packs INTEGER NOT NULL DEFAULT 0, best_value REAL NOT NULL DEFAULT 0,
    best_card TEXT, best_at INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, week))`,
  `CREATE TABLE IF NOT EXISTS rank_state (key TEXT PRIMARY KEY, value INTEGER NOT NULL DEFAULT 0, at INTEGER NOT NULL DEFAULT 0, owner TEXT)`,
  `CREATE TABLE IF NOT EXISTS rank_winners (
    week INTEGER NOT NULL, board TEXT NOT NULL, place INTEGER NOT NULL, user_id TEXT NOT NULL,
    value REAL NOT NULL, card TEXT, PRIMARY KEY (week, board, place))`,
  "CREATE INDEX IF NOT EXISTS idx_rank_weekly_week ON rank_weekly(week, packs)",
  "CREATE INDEX IF NOT EXISTS idx_rank_weekly_best ON rank_weekly(week, best_value)",
  "CREATE INDEX IF NOT EXISTS idx_rank_scores_worth ON rank_scores(worth)",
  "CREATE INDEX IF NOT EXISTS idx_rank_totals_packs ON rank_totals(packs)",
  "CREATE INDEX IF NOT EXISTS idx_rank_totals_best ON rank_totals(best_value)",
];

let schemaReady = false;
/** Tests only. */
export function resetRankingsCache() {
  schemaReady = false;
  boardCache.clear();
}

export async function ensureRankSchema(env) {
  if (schemaReady) return;
  for (const sql of DDL) await env.DB.exec(`${sql.replace(/\s+/g, " ").trim()};`);
  await env.DB.prepare("INSERT OR IGNORE INTO rank_state (key, value, at) VALUES ('log', 0, 0)").run();
  schemaReady = true;
}

const SITE = "https://poke-pack.rip/";

/** A card's value lookup with a per-call memo (findCatalogCard already caches whole sets). */
function valuer(env, findCatalogCard, request) {
  const memo = new Map();
  const req = request || new Request(SITE);
  return async (cardId) => {
    if (memo.has(cardId)) return memo.get(cardId);
    let card = null;
    try {
      card = await findCatalogCard(env, req, cardId);
    } catch {
      card = null;
    }
    memo.set(cardId, card);
    return card;
  };
}

const setForCard = (cardId) => ALL_SETS.find((set) => cardId.startsWith(`${set.id}-`)) || null;
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function parseJson(raw, fallback) {
  if (raw == null || raw === "") return fallback;
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/* ------------------------------------------------------------------ */
/* Snapshots: collection value, level, sets mastered                    */
/* ------------------------------------------------------------------ */

/** Work out and store one trainer's snapshot. Returns the stored row. */
export async function refreshScore(env, userId, { findCatalogCard, request, now = Date.now() }) {
  await ensureRankSchema(env);
  const user = await env.DB.prepare("SELECT id, created_at FROM users WHERE id = ?").bind(userId).first();
  if (!user) return null;
  const profile = await env.DB.prepare("SELECT packs_opened, claimed FROM profiles WHERE user_id = ?").bind(userId).first();
  const lookup = valuer(env, findCatalogCard, request);

  let worth = 0;
  const cards = (await env.DB.prepare("SELECT card_id, qty FROM cards WHERE user_id = ? AND qty > 0").bind(userId).all()).results || [];
  for (const row of cards) {
    const card = await lookup(row.card_id);
    if (card) worth += sellValue(card) * Number(row.qty || 0);
  }
  try {
    const slabs =
      (
        await env.DB.prepare(
          "SELECT card_id, grade, black_label FROM graded_cards WHERE user_id = ? AND status = 'slabbed' AND locked IS NULL"
        )
          .bind(userId)
          .all()
      ).results || [];
    for (const slab of slabs) {
      const card = await lookup(slab.card_id);
      if (!card) continue;
      const graded = gradedValue(card, slab.grade, setForCard(slab.card_id), Boolean(slab.black_label));
      worth += Math.max(Number(graded) || 0, sellValue(card));
    }
  } catch (err) {
    if (!/no such (table|column)/i.test(String(err?.message || err))) throw err;
  }

  const xp = await playerXp(env, userId).catch(() => ({ xp: 0, level: 1, prestige: 0 }));
  const mastered = masterySetIds(parseJson(profile?.claimed, [])).length;
  const logged = await env.DB.prepare("SELECT COUNT(*) AS n FROM pack_log WHERE user_id = ?").bind(userId).first();
  const serverPacks = Number(logged?.n) || 0;
  const imported = Math.max(0, (Number(profile?.packs_opened) || 0) - serverPacks);
  const eligible = Number(user.created_at) < RANKINGS_OPENED || imported <= IMPORT_ALLOWANCE ? 1 : 0;

  const row = {
    worth: round2(worth),
    level: Number(xp.level) || 1,
    prestige: Number(xp.prestige) || 0,
    xp: Number(xp.xp) || 0,
    mastered,
    server_packs: serverPacks,
    imported,
    eligible,
    updated_at: now,
  };
  await env.DB.prepare(
    `INSERT INTO rank_scores (user_id, worth, level, prestige, xp, mastered, server_packs, imported, eligible, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET worth = excluded.worth, level = excluded.level, prestige = excluded.prestige,
       xp = excluded.xp, mastered = excluded.mastered, server_packs = excluded.server_packs, imported = excluded.imported,
       eligible = excluded.eligible, updated_at = excluded.updated_at`
  )
    .bind(userId, row.worth, row.level, row.prestige, row.xp, row.mastered, row.server_packs, row.imported, row.eligible, now)
    .run();
  return row;
}

/** The cron's share of snapshots: trainers who played since theirs, then the stalest few. */
export async function refreshScores(env, deps, { now = Date.now() } = {}) {
  await ensureRankSchema(env);
  const dirty =
    (
      await env.DB.prepare(
        `SELECT users.id FROM users LEFT JOIN rank_scores r ON r.user_id = users.id
         WHERE r.user_id IS NULL OR users.last_played > r.updated_at
         ORDER BY users.last_played DESC LIMIT ?`
      )
        .bind(SNAPSHOT_BATCH)
        .all()
    ).results || [];
  const stale =
    (
      await env.DB.prepare("SELECT user_id AS id FROM rank_scores ORDER BY updated_at ASC LIMIT ?")
        .bind(STALE_BATCH)
        .all()
    ).results || [];
  const ids = [...new Set([...dirty, ...stale].map((row) => row.id))];
  for (const id of ids) {
    try {
      await refreshScore(env, id, { ...deps, now });
    } catch (err) {
      console.error("rank snapshot", id, err);
    }
  }
  if (ids.length) boardCache.clear();
  return ids.length;
}

/* ------------------------------------------------------------------ */
/* The pack log: packs ripped and best pull                             */
/* ------------------------------------------------------------------ */

/**
 * Count the next stretch of pack_log into rank_totals and rank_weekly. The
 * cursor moves with a compare-and-swap that stamps an owner token, and every
 * write in the same batch only lands if that token is still the owner, so two
 * runs over the same rows can never both count them.
 */
export async function processPackLog(env, deps, { budgetMs = LOG_BUDGET_MS, batch = LOG_BATCH, maxLoops = LOG_LOOPS } = {}) {
  await ensureRankSchema(env);
  const started = Date.now();
  const lookup = valuer(env, deps.findCatalogCard, deps.request);
  let total = 0;
  let loops = 0;
  for (;;) {
    const state = await env.DB.prepare("SELECT value, at FROM rank_state WHERE key = 'log'").first();
    const cursor = Number(state?.value) || 0;
    const rows =
      (
        await env.DB.prepare("SELECT id, user_id, cards, at FROM pack_log WHERE id > ? ORDER BY id LIMIT ?")
          .bind(cursor, batch)
          .all()
      ).results || [];
    if (!rows.length) break;

    const totals = new Map();
    const weekly = new Map();
    const bump = (map, key, base, value, card, at) => {
      const row = map.get(key) || { ...base, packs: 0, best: 0, card: null, at: 0 };
      row.packs += 1;
      if (value > row.best) {
        row.best = value;
        row.card = card;
        row.at = at;
      }
      map.set(key, row);
    };
    for (const row of rows) {
      let best = 0;
      let bestCard = null;
      for (const pull of parseJson(row.cards, []) || []) {
        const id = typeof pull === "string" ? pull : pull?.id;
        if (!id) continue;
        const card = await lookup(String(id));
        if (!card) continue;
        const value = sellValue(card);
        if (value > best) {
          best = value;
          bestCard = card.id;
        }
      }
      const at = Number(row.at) || 0;
      best = round2(best);
      bump(totals, row.user_id, { user: row.user_id }, best, bestCard, at);
      const week = weekOf(at);
      bump(weekly, `${row.user_id}|${week}`, { user: row.user_id, week }, best, bestCard, at);
    }

    const last = rows[rows.length - 1];
    const token = `${started}-${Math.random().toString(36).slice(2)}`;
    const owns = "EXISTS (SELECT 1 FROM rank_state WHERE key = 'log' AND owner = ?)";
    const stmts = [
      env.DB.prepare("UPDATE rank_state SET value = ?, at = MAX(at, ?), owner = ? WHERE key = 'log' AND value = ?").bind(
        last.id,
        Math.max(...rows.map((row) => Number(row.at) || 0)),
        token,
        cursor
      ),
    ];
    const totalRows = [...totals.values()].map((row) => [row.user, row.packs, row.best, row.card, row.at]);
    const weekRows = [...weekly.values()].map((row) => [row.user, row.week, row.packs, row.best, row.card, row.at]);
    stmts.push(
      env.DB.prepare(
        `INSERT INTO rank_totals (user_id, packs, best_value, best_card, best_at)
         SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]'), json_extract(value, '$[3]'), json_extract(value, '$[4]')
         FROM json_each(?) WHERE ${owns}
         ON CONFLICT(user_id) DO UPDATE SET packs = rank_totals.packs + excluded.packs,
           best_card = CASE WHEN excluded.best_value > rank_totals.best_value THEN excluded.best_card ELSE rank_totals.best_card END,
           best_at = CASE WHEN excluded.best_value > rank_totals.best_value THEN excluded.best_at ELSE rank_totals.best_at END,
           best_value = MAX(rank_totals.best_value, excluded.best_value)`
      ).bind(JSON.stringify(totalRows), token),
      env.DB.prepare(
        `INSERT INTO rank_weekly (user_id, week, packs, best_value, best_card, best_at)
         SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]'), json_extract(value, '$[3]'), json_extract(value, '$[4]'), json_extract(value, '$[5]')
         FROM json_each(?) WHERE ${owns}
         ON CONFLICT(user_id, week) DO UPDATE SET packs = rank_weekly.packs + excluded.packs,
           best_card = CASE WHEN excluded.best_value > rank_weekly.best_value THEN excluded.best_card ELSE rank_weekly.best_card END,
           best_at = CASE WHEN excluded.best_value > rank_weekly.best_value THEN excluded.best_at ELSE rank_weekly.best_at END,
           best_value = MAX(rank_weekly.best_value, excluded.best_value)`
      ).bind(JSON.stringify(weekRows), token)
    );
    await env.DB.batch(stmts);
    total += rows.length;
    loops += 1;
    if (rows.length < batch || loops >= maxLoops || Date.now() - started > budgetMs) break;
  }
  if (total) boardCache.clear();
  return total;
}

/** The cron step (every 10 minutes): walk the pack log, then refresh snapshots. */
export async function maintainRankings(env, deps) {
  const packs = await processPackLog(env, deps);
  const scores = await refreshScores(env, deps);
  return { packs, scores };
}

/* ------------------------------------------------------------------ */
/* Reading a board                                                      */
/* ------------------------------------------------------------------ */

const boardCache = new Map();

/** Where a board's numbers live: table, value column, tie-break and extra filter. */
function source(board, period, week) {
  if (board === "worth") return { from: "rank_scores s", value: "s.worth", tie: "s.updated_at ASC", where: "s.eligible = 1 AND s.server_packs >= ?", binds: [MIN_PACKS] };
  if (board === "mastery") return { from: "rank_scores s", value: "s.mastered", tie: "s.level DESC", where: "s.eligible = 1 AND s.server_packs >= ? AND s.mastered > 0", binds: [MIN_PACKS] };
  if (board === "level")
    return {
      from: "rank_scores s",
      value: "(s.prestige * 1000000000 + s.xp)",
      tie: "s.updated_at ASC",
      where: "s.eligible = 1 AND s.server_packs >= ?",
      binds: [MIN_PACKS],
    };
  if (period === "week") {
    const col = board === "packs" ? "w.packs" : "w.best_value";
    return { from: "rank_weekly w", value: col, tie: "w.best_at ASC", where: `w.week = ? AND ${col} > 0`, binds: [week], card: "w.best_card", cardAt: "w.best_at" };
  }
  const col = board === "packs" ? "t.packs" : "t.best_value";
  return { from: "rank_totals t", value: col, tie: "t.best_at ASC", where: `t.packs >= ? AND ${col} > 0`, binds: [MIN_PACKS], card: "t.best_card", cardAt: "t.best_at" };
}

function alias(src) {
  return src.from.split(" ")[1];
}

async function readRows(env, board, period, week, { scopeIds = null, limit = LIST_LIMIT } = {}) {
  const src = source(board, period, week);
  const a = alias(src);
  const binds = [...src.binds];
  let scope = "";
  if (scopeIds) {
    scope = ` AND ${a}.user_id IN (${FRIENDS_OF})`;
    binds.push(scopeIds, scopeIds);
  } else {
    scope = ` AND users.handle NOT IN (${HIDDEN_HANDLES.map(() => "?").join(",")})`;
    binds.push(...HIDDEN_HANDLES);
  }
  binds.push(limit);
  const res = await env.DB.prepare(
    `SELECT users.*, ${src.value} AS score${src.card ? `, ${src.card} AS card_id` : ""},
            ls.level AS rank_level, ls.prestige AS rank_prestige
     FROM ${src.from}
     JOIN users ON users.id = ${a}.user_id
     LEFT JOIN rank_scores ls ON ls.user_id = ${a}.user_id
     WHERE ${src.where}${scope}
     ORDER BY score DESC, ${src.tie}, users.created_at ASC
     LIMIT ?`
  )
    .bind(...binds)
    .all();
  return res.results || [];
}

/** Standard competition ranks (1, 2, 2, 4) over rows already sorted by score. */
function placeRows(rows) {
  let place = 0;
  let prev = null;
  return rows.map((row, i) => {
    if (prev === null || Number(row.score) !== prev) place = i + 1;
    prev = Number(row.score);
    return { row, place };
  });
}

async function cardBrief(lookup, id) {
  if (!id) return null;
  const card = await lookup(id);
  if (!card) return null;
  return { id: card.id, name: card.name, rarity: card.rarity, image: card.imageSmall || card.image, set: setForCard(card.id)?.name || "" };
}

function scoreOut(board, raw) {
  const n = Number(raw) || 0;
  if (board === "level") return null; // the row carries level and prestige
  return board === "worth" || board === "best" ? round2(n) : Math.round(n);
}

async function shapeRows(env, rows, board, { publicUser, lookup }) {
  const out = [];
  for (const { row, place } of placeRows(rows)) {
    const user = publicUser(row);
    user.level = Number(row.rank_level) || undefined;
    user.prestige = Number(row.rank_prestige) || 0;
    out.push({
      place,
      user,
      value: scoreOut(board, row.score),
      level: board === "level" ? { level: Number(row.rank_level) || 1, prestige: Number(row.rank_prestige) || 0, xp: Number(row.score) % 1e9 } : undefined,
      card: row.card_id ? await cardBrief(lookup, row.card_id) : undefined,
    });
  }
  return out;
}

/** Freeze last week's top three per weekly board, once the log has moved into this week. */
async function podium(env, week, { publicUser, lookup }) {
  const last = week - 1;
  const state = await env.DB.prepare("SELECT at FROM rank_state WHERE key = 'log'").first();
  const caughtUp = weekOf(Number(state?.at) || 0) >= week;
  const out = {};
  for (const board of ["packs", "best"]) {
    let rows = (await env.DB.prepare("SELECT * FROM rank_winners WHERE week = ? AND board = ? ORDER BY place").bind(last, board).all()).results || [];
    if (!rows.length && caughtUp) {
      const top = await readRows(env, board, "week", last, { limit: PODIUM });
      if (top.length) {
        await env.DB.batch(
          top.map((row, i) =>
            env.DB.prepare("INSERT OR IGNORE INTO rank_winners (week, board, place, user_id, value, card) VALUES (?, ?, ?, ?, ?, ?)").bind(
              last,
              board,
              i + 1,
              row.id,
              Number(row.score) || 0,
              row.card_id || null
            )
          )
        );
        rows = (await env.DB.prepare("SELECT * FROM rank_winners WHERE week = ? AND board = ? ORDER BY place").bind(last, board).all()).results || [];
      }
    }
    const list = [];
    for (const row of rows) {
      const user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(row.user_id).first();
      if (!user) continue;
      list.push({ place: row.place, user: publicUser(user), value: scoreOut(board, row.value), card: await cardBrief(lookup, row.card) });
    }
    out[board] = list;
  }
  return out;
}

/** The viewer's own place on a board, or why they are not on it. */
async function myPlace(env, board, period, week, meId, scopeIds) {
  const src = source(board, period, week);
  const a = alias(src);
  const mine = await env.DB.prepare(
    `SELECT ${src.value} AS score${src.card ? `, ${src.card} AS card_id` : ""} FROM ${src.from} WHERE ${a}.user_id = ? AND ${src.where}`
  )
    .bind(meId, ...src.binds)
    .first();
  const snap = await env.DB.prepare("SELECT eligible, server_packs, imported, level, prestige, worth, mastered FROM rank_scores WHERE user_id = ?").bind(meId).first();
  const totals = await env.DB.prepare("SELECT packs FROM rank_totals WHERE user_id = ?").bind(meId).first();
  if (!mine) {
    let reason = "Rip a pack to get on this board.";
    const snapshotBoard = ["worth", "level", "mastery"].includes(board);
    if (snapshotBoard && snap && !snap.eligible) reason = "Packs opened before you signed up don't count, so this board is closed to this account.";
    else if (snapshotBoard && (Number(snap?.server_packs) || 0) < MIN_PACKS) reason = `Rip ${MIN_PACKS - (Number(snap?.server_packs) || 0)} more ${MIN_PACKS - (Number(snap?.server_packs) || 0) === 1 ? "pack" : "packs"} to get on this board.`;
    else if (period !== "week" && !snapshotBoard && (Number(totals?.packs) || 0) < MIN_PACKS) reason = `Rip ${MIN_PACKS - (Number(totals?.packs) || 0)} more packs to get on this board.`;
    else if (board === "mastery") reason = "Master a set to get on this board.";
    else if (period === "week") reason = "Rip a pack this week to get on this board.";
    return { place: null, value: null, reason };
  }
  let scope = "";
  const scopeBinds = [];
  if (scopeIds) {
    scope = ` AND ${a}.user_id IN (${FRIENDS_OF})`;
    scopeBinds.push(scopeIds, scopeIds);
  } else {
    scope = ` AND ${a}.user_id NOT IN (SELECT id FROM users WHERE handle IN (${HIDDEN_HANDLES.map(() => "?").join(",")}))`;
    scopeBinds.push(...HIDDEN_HANDLES);
  }
  const ahead = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${src.from} WHERE ${src.where} AND ${src.value} > ?${scope}`)
    .bind(...src.binds, Number(mine.score) || 0, ...scopeBinds)
    .first();
  const field = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${src.from} WHERE ${src.where}${scope}`)
    .bind(...src.binds, ...scopeBinds)
    .first();
  return {
    place: (Number(ahead?.n) || 0) + 1,
    of: Number(field?.n) || 0,
    value: scoreOut(board, mine.score),
    level: board === "level" ? { level: Number(snap?.level) || 1, prestige: Number(snap?.prestige) || 0, xp: Number(mine.score) % 1e9 } : undefined,
    card: mine.card_id || null,
  };
}

/** The viewer and their accepted friends, as a subquery taking the viewer's id twice (no long IN lists: D1 caps bound values). */
const FRIENDS_OF = "SELECT ? UNION SELECT to_id FROM friends WHERE from_id = ? AND status = 'accepted'";

export async function handleRankings(path, method, request, env, helpers) {
  if (!path.startsWith("/api/rankings")) return null;
  const { json, requireUser, publicUser, findCatalogCard } = helpers;
  if (method !== "GET") return json({ error: "Not found." }, 404);
  await ensureRankSchema(env);
  const url = new URL(request.url);
  const lookup = valuer(env, findCatalogCard, request);

  const userMatch = path.match(/^\/api\/rankings\/u\/([a-z0-9_]{3,16})$/i);
  if (userMatch) return json(await placesFor(env, userMatch[1].toLowerCase()));
  if (path !== "/api/rankings") return json({ error: "Not found." }, 404);

  const board = BOARDS[url.searchParams.get("board")] ? url.searchParams.get("board") : "worth";
  const periods = boardPeriods(board);
  const period = periods.includes(url.searchParams.get("period")) ? url.searchParams.get("period") : periods[0];
  const now = Date.now();
  const week = weekOf(now);

  const signed = (request.headers.get("cookie") || "").includes("pp_sid=");
  const auth = signed ? await requireUser(request, env) : { user: null };
  const me = auth.response ? null : auth.user;
  const scope = me && url.searchParams.get("scope") === "friends" ? "friends" : "all";

  if (me) {
    const snap = await env.DB.prepare("SELECT updated_at FROM rank_scores WHERE user_id = ?").bind(me.id).first();
    if (!snap || now - Number(snap.updated_at) > VIEWER_FRESH_MS) {
      await refreshScore(env, me.id, { findCatalogCard, request, now }).catch((err) => console.error("rank viewer", err));
      boardCache.clear();
    }
  }

  const scopeIds = scope === "friends" ? me.id : null;
  const key = `${board}|${period}|${week}`;
  let rows;
  const cached = scope === "all" ? boardCache.get(key) : null;
  if (cached && now - cached.at < CACHE_MS) rows = cached.rows;
  else {
    rows = await shapeRows(env, await readRows(env, board, period, week, { scopeIds }), board, { publicUser, lookup });
    if (scope === "all") boardCache.set(key, { at: now, rows });
  }

  let mine = null;
  if (me) {
    mine = await myPlace(env, board, period, week, me.id, scopeIds);
    if (mine.card) mine.card = await cardBrief(lookup, mine.card);
  }
  const state = await env.DB.prepare("SELECT at FROM rank_state WHERE key = 'log'").first();
  return json({
    board,
    period,
    scope,
    week: { start: weekStart(week), ends: weekStart(week + 1) },
    rows,
    me: mine,
    lastWeek: period === "week" ? (await podium(env, week, { publicUser, lookup }))[board] || [] : undefined,
    countedTo: Number(state?.at) || 0,
  });
}

/** A trainer's places on every board, for a profile or a Discord command. */
export async function placesFor(env, handle) {
  await ensureRankSchema(env);
  const user = await env.DB.prepare("SELECT id, handle FROM users WHERE handle = ?").bind(handle).first();
  if (!user) return { error: "Trainer not found.", places: [] };
  const week = weekOf(Date.now());
  const places = [];
  for (const [board, info] of Object.entries(BOARDS)) {
    for (const period of info.periods) {
      const mine = await myPlace(env, board, period, week, user.id, null);
      if (mine.place) places.push({ board, period, place: mine.place, of: mine.of, value: mine.value });
    }
  }
  return { handle: user.handle, places };
}
