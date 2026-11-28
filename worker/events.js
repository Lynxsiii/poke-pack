/**
 * Weekly events and weekly prizes (GET /api/events, POST /api/events/claim).
 * Rules and the on/off switches live in js/events-rules.js; this file keeps
 * score and pays out.
 *
 * Like Rankings, nothing the page sends is trusted. Event points are counted
 * from pack_log by the 10-minute cron with its own cursor (rank_state key
 * 'events'), and only for packs the player paid for. Six hours into a new
 * week the cron freezes last week's places on the three prize boards
 * (event_prizes), leaving out accounts that are too new, too low a level or
 * that barely bought a pack, and holding any prize whose winner was fed card
 * value by one other player during the week.
 *
 * Every coin goes out through event_claims with INSERT OR IGNORE and a
 * `changes() = 1` guard in the same batch, so a claim pays once.
 */
import {
  EVENTS_MODE,
  EVENT_REWARDS,
  STEP_COINS,
  GOAL_COINS,
  PRIZE_BOARDS,
  PRIZE_BOARD_LABEL,
  PRIZE_TABLE,
  PRIZE_PLACES,
  PRIZE_MIN_AGE_DAYS,
  PRIZE_MIN_LEVEL,
  PRIZE_MIN_PAID_PACKS,
  ONE_PRIZE_A_WEEK,
  HOLD_CENTS,
  HOLD_FLIPS,
  CLAIM_WEEKS,
  FREEZE_GRACE_MS,
  eventFor,
  pointsFor,
  goalFor,
  prizeFor,
  weekOf,
  weekStart,
} from "../js/events-rules.js";
import { PLAYABLE_SETS } from "../js/catalog.js";
import { ensureRankSchema, HIDDEN_HANDLES } from "./rankings.js";
import { isBetaAdmin } from "./beta.js";
import { isTester, notTester } from "./testers.js";

const DAY = 86_400_000;
const LOG_BATCH = 1000;
const LOG_LOOPS = 20;
const LOG_BUDGET_MS = 10_000;
const BOARD_ROWS = 10;
const CACHE_MS = 60_000;

/** Tests put { mode, rewards } on env.__events; a Worker variable is a string, so nothing set in Cloudflare can reach this. */
function switches(env) {
  const test = env && typeof env.__events === "object" ? env.__events : null;
  const mode = test?.mode || EVENTS_MODE;
  return { mode, rewards: mode !== "off" && Boolean(test ? test.rewards : EVENT_REWARDS) };
}

const DDL = [
  `CREATE TABLE IF NOT EXISTS event_scores (
    user_id TEXT NOT NULL, week INTEGER NOT NULL, points INTEGER NOT NULL DEFAULT 0, packs INTEGER NOT NULL DEFAULT 0,
    at INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, week))`,
  `CREATE TABLE IF NOT EXISTS event_claims (
    user_id TEXT NOT NULL, week INTEGER NOT NULL, kind TEXT NOT NULL, ref TEXT NOT NULL, coins INTEGER NOT NULL DEFAULT 0,
    at INTEGER NOT NULL, PRIMARY KEY (user_id, week, kind, ref))`,
  `CREATE TABLE IF NOT EXISTS event_prizes (
    week INTEGER NOT NULL, board TEXT NOT NULL, place INTEGER NOT NULL, user_id TEXT NOT NULL, value REAL NOT NULL DEFAULT 0,
    coins INTEGER NOT NULL DEFAULT 0, held TEXT, note TEXT, PRIMARY KEY (week, board, place))`,
  "CREATE INDEX IF NOT EXISTS idx_event_scores_week ON event_scores(week, points)",
  "CREATE INDEX IF NOT EXISTS idx_event_prizes_user ON event_prizes(user_id, week)",
];

let schemaReady = false;
const cache = new Map();
/** Tests only. */
export function resetEventsCache() {
  schemaReady = false;
  cache.clear();
}

export async function ensureEventSchema(env) {
  if (schemaReady) return;
  await ensureRankSchema(env);
  for (const sql of DDL) await env.DB.exec(`${sql.replace(/\s+/g, " ").trim()};`);
  schemaReady = true;
}

/** Statements removing a trainer's event rows (account delete and reset). */
export async function clearEventStmts(env, userId) {
  await ensureEventSchema(env);
  return ["event_scores", "event_claims", "event_prizes"].map((table) => env.DB.prepare(`DELETE FROM ${table} WHERE user_id = ?`).bind(userId));
}

function parseJson(raw, fallback) {
  if (raw == null || raw === "") return fallback;
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}
const missing = (err) => /no such (table|column)/i.test(String(err?.message || err));

/* ------------------------------------------------------------------ */
/* Scoring: the pack log walk                                           */
/* ------------------------------------------------------------------ */

/**
 * Count the next stretch of pack_log into event_scores. The first run starts
 * at the beginning of the current week, so turning events on never scores
 * packs from before. The cursor moves with the same owner-token
 * compare-and-swap Rankings uses, so two runs can't both count a row.
 */
export async function processEvents(env, deps, { now = Date.now(), budgetMs = LOG_BUDGET_MS, batch = LOG_BATCH, maxLoops = LOG_LOOPS } = {}) {
  if (switches(env).mode === "off") return 0;
  await ensureEventSchema(env);
  const started = Date.now();
  const have = await env.DB.prepare("SELECT value FROM rank_state WHERE key = 'events'").first();
  if (!have) {
    const before = await env.DB.prepare("SELECT COALESCE(MAX(id), 0) AS id FROM pack_log WHERE at < ?").bind(weekStart(weekOf(now))).first();
    await env.DB.prepare("INSERT OR IGNORE INTO rank_state (key, value, at) VALUES ('events', ?, 0)").bind(Number(before?.id) || 0).run();
  }
  const types = new Map();
  const req = deps.request || new Request("https://poke-pack.rip/");
  const typesOf = async (cardId) => {
    if (types.has(cardId)) return types.get(cardId);
    let card = null;
    try {
      card = await deps.findCatalogCard(env, req, cardId);
    } catch {
      card = null;
    }
    const out = card && card.supertype !== "Trainer" && card.supertype !== "Energy" ? card.types || null : null;
    types.set(cardId, out);
    return out;
  };
  const events = new Map();
  const eventOf = (week) => {
    if (!events.has(week)) events.set(week, eventFor(week));
    return events.get(week);
  };

  let total = 0;
  let loops = 0;
  for (;;) {
    const state = await env.DB.prepare("SELECT value FROM rank_state WHERE key = 'events'").first();
    const cursor = Number(state?.value) || 0;
    const rows =
      (await env.DB.prepare("SELECT id, user_id, set_id, cost, cards, at FROM pack_log WHERE id > ? ORDER BY id LIMIT ?").bind(cursor, batch).all()).results || [];
    if (!rows.length) break;

    const sums = new Map();
    for (const row of rows) {
      if (!(Number(row.cost) > 0) || !row.user_id) continue;
      const at = Number(row.at) || 0;
      const week = weekOf(at);
      const points = await pointsFor(eventOf(week), row, parseJson(row.cards, []) || [], typesOf);
      const key = `${row.user_id}|${week}`;
      const sum = sums.get(key) || { user: row.user_id, week, points: 0, packs: 0, at: 0 };
      sum.packs += 1;
      sum.points += points;
      if (points > 0) sum.at = Math.max(sum.at, at);
      sums.set(key, sum);
    }

    const last = rows[rows.length - 1];
    const token = `${started}-${Math.random().toString(36).slice(2)}`;
    const stmts = [
      env.DB.prepare("UPDATE rank_state SET value = ?, at = MAX(at, ?), owner = ? WHERE key = 'events' AND value = ?").bind(
        last.id,
        Math.max(...rows.map((row) => Number(row.at) || 0)),
        token,
        cursor
      ),
      env.DB.prepare(
        `INSERT INTO event_scores (user_id, week, points, packs, at)
         SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]'), json_extract(value, '$[3]'), json_extract(value, '$[4]')
         FROM json_each(?) WHERE EXISTS (SELECT 1 FROM rank_state WHERE key = 'events' AND owner = ?)
         ON CONFLICT(user_id, week) DO UPDATE SET points = event_scores.points + excluded.points,
           packs = event_scores.packs + excluded.packs,
           at = CASE WHEN excluded.points > 0 THEN MAX(event_scores.at, excluded.at) ELSE event_scores.at END`
      ).bind(JSON.stringify([...sums.values()].map((sum) => [sum.user, sum.week, sum.points, sum.packs, sum.at])), token),
    ];
    await env.DB.batch(stmts);
    total += rows.length;
    loops += 1;
    if (rows.length < batch || loops >= maxLoops || Date.now() - started > budgetMs) break;
  }
  if (total) cache.clear();
  return total;
}

/* ------------------------------------------------------------------ */
/* Freezing last week's prizes                                          */
/* ------------------------------------------------------------------ */

/** Where a prize board's weekly number lives. */
function boardSource(board) {
  if (board === "event") return { from: "event_scores b", value: "b.points", tie: "b.at ASC" };
  if (board === "packs") return { from: "rank_weekly b", value: "b.packs", tie: "b.best_at ASC" };
  return { from: "rank_weekly b", value: "b.best_value", tie: "b.best_at ASC" };
}

/**
 * The players who can take a prize on `board` for `week`, best first. The
 * rules, all checked here in SQL: not a test or hidden account, old enough
 * when the week ended, level high enough, and enough packs paid for that week.
 */
async function prizeRows(env, board, week, limit = PRIZE_PLACES) {
  const src = boardSource(board);
  const res = await env.DB.prepare(
    `SELECT b.user_id, ${src.value} AS score, users.handle
     FROM ${src.from}
     JOIN users ON users.id = b.user_id
     JOIN event_scores paid ON paid.user_id = b.user_id AND paid.week = b.week
     LEFT JOIN rank_scores ls ON ls.user_id = b.user_id
     WHERE b.week = ? AND ${src.value} > 0
       AND users.handle NOT IN (${HIDDEN_HANDLES.map(() => "?").join(",")})${notTester("users")}
       AND users.created_at <= ? AND COALESCE(ls.level, 1) >= ? AND paid.packs >= ?
     ORDER BY score DESC, ${src.tie}, users.created_at ASC
     LIMIT ?`
  )
    .bind(week, ...HIDDEN_HANDLES, weekStart(week + 1) - PRIZE_MIN_AGE_DAYS * DAY, PRIZE_MIN_LEVEL, PRIZE_MIN_PAID_PACKS, limit)
    .all();
  return res.results || [];
}

/**
 * Why a winner's prize waits for the owner, or null. Looks for card value
 * moved to them by one other player inside the week: coin flips against the
 * same person that came out far ahead, and lopsided trades.
 */
export async function holdReason(env, userId, week) {
  const from = weekStart(week);
  const to = weekStart(week + 1);
  try {
    const flips =
      (
        await env.DB.prepare(
          `SELECT host_id, guest_id, host_value, guest_value, winner FROM coinflips
           WHERE status = 'done' AND bot = 0 AND guest_id IS NOT NULL AND flipped_at >= ? AND flipped_at < ?
             AND (host_id = ?3 OR guest_id = ?3)`
        )
          .bind(from, to, userId)
          .all()
      ).results || [];
    const by = new Map();
    for (const flip of flips) {
      const host = flip.host_id === userId;
      const other = host ? flip.guest_id : flip.host_id;
      const won = (flip.winner === "host") === host;
      const row = by.get(other) || { n: 0, net: 0 };
      row.n += 1;
      row.net += won ? Number(host ? flip.guest_value : flip.host_value) || 0 : -(Number(host ? flip.host_value : flip.guest_value) || 0);
      by.set(other, row);
    }
    for (const [other, row] of by) {
      if (row.n >= HOLD_FLIPS && row.net >= HOLD_CENTS) return `flips:${other}`;
    }
  } catch (err) {
    if (!missing(err)) throw err;
  }
  try {
    const gifts = await env.DB.prepare(
      "SELECT COALESCE(SUM(gift_cents), 0) AS cents FROM trades WHERE status = 'accepted' AND gift_to = ? AND closed_at >= ? AND closed_at < ?"
    )
      .bind(userId, from, to)
      .first();
    if ((Number(gifts?.cents) || 0) >= HOLD_CENTS) return "gifts";
  } catch (err) {
    if (!missing(err)) throw err;
  }
  return null;
}

/** Freeze last week's prize places once, after the grace and once both log walks have passed the week's end. */
export async function freezePrizes(env, { now = Date.now() } = {}) {
  const sw = switches(env);
  if (sw.mode === "off") return 0;
  await ensureEventSchema(env);
  const week = weekOf(now);
  const last = week - 1;
  if (now < weekStart(week) + FREEZE_GRACE_MS) return 0;
  const frozen = await env.DB.prepare("SELECT value FROM rank_state WHERE key = 'events_frozen'").first();
  if (frozen && Number(frozen.value) >= last) return 0;
  for (const key of ["events", "log"]) {
    const state = await env.DB.prepare("SELECT value FROM rank_state WHERE key = ?").bind(key).first();
    if (!state) return 0;
    const behind = await env.DB.prepare("SELECT 1 AS x FROM pack_log WHERE id > ? AND at < ? LIMIT 1").bind(Number(state.value) || 0, weekStart(week)).first();
    if (behind) return 0;
  }

  const rows = [];
  for (const board of PRIZE_BOARDS) {
    (await prizeRows(env, board, last)).forEach((row, i) => {
      rows.push({ board, place: i + 1, user: row.user_id, value: Number(row.score) || 0, coins: sw.rewards ? prizeFor(i + 1) : 0, note: null, held: null });
    });
  }
  if (ONE_PRIZE_A_WEEK) {
    const best = new Map();
    for (const row of rows) if (!best.has(row.user) || row.coins > best.get(row.user).coins) best.set(row.user, row);
    for (const row of rows) {
      if (best.get(row.user) !== row && row.coins > 0) {
        row.coins = 0;
        row.note = "smaller";
      }
    }
  }
  const holds = new Map();
  for (const row of rows) {
    if (!row.coins) continue;
    if (!holds.has(row.user)) holds.set(row.user, await holdReason(env, row.user, last));
    row.held = holds.get(row.user);
  }
  const claim = frozen
    ? env.DB.prepare("UPDATE rank_state SET value = ?, at = ? WHERE key = 'events_frozen' AND value = ?").bind(last, now, Number(frozen.value))
    : env.DB.prepare("INSERT OR IGNORE INTO rank_state (key, value, at) VALUES ('events_frozen', ?, ?)").bind(last, now);
  // The marker row moves first; the prize rows only land in the batch that moved it.
  await env.DB.batch([
    claim,
    ...rows.map((row) =>
      env.DB.prepare(
        `INSERT OR IGNORE INTO event_prizes (week, board, place, user_id, value, coins, held, note)
         SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM rank_state WHERE key = 'events_frozen' AND value = ? AND at = ?)`
      ).bind(last, row.board, row.place, row.user, row.value, row.coins, row.held, row.note, last, now)
    ),
  ]);
  cache.clear();
  return rows.length;
}

/** The cron step. Does nothing at all while events are off. */
export async function maintainEvents(env, deps) {
  if (switches(env).mode === "off") return { off: true };
  const packs = await processEvents(env, deps);
  const prizes = await freezePrizes(env);
  return { packs, prizes };
}

/* ------------------------------------------------------------------ */
/* Reading                                                              */
/* ------------------------------------------------------------------ */

async function weekTotals(env, week) {
  // Test accounts and the hidden one play for themselves, not toward everyone's goal.
  const row = await env.DB.prepare(
    `SELECT COALESCE(SUM(s.points), 0) AS total, COUNT(*) AS players FROM event_scores s JOIN users ON users.id = s.user_id
     WHERE s.week = ? AND s.points > 0 AND users.handle NOT IN (${HIDDEN_HANDLES.map(() => "?").join(",")})${notTester("users")}`
  )
    .bind(week, ...HIDDEN_HANDLES)
    .first();
  return { total: Number(row?.total) || 0, players: Number(row?.players) || 0 };
}

/** The community goal for a week: its target, how far everyone is, and whether it was reached. */
async function community(env, week) {
  const event = eventFor(week);
  const [now, before] = [await weekTotals(env, week), await weekTotals(env, week - 1)];
  const goal = goalFor(event, before.players);
  return { goal, total: now.total, players: now.players, reached: now.total >= goal };
}

async function eventBoard(env, week, publicUser) {
  const res = await env.DB.prepare(
    `SELECT users.*, s.points AS score, ls.level AS rank_level, ls.prestige AS rank_prestige
     FROM event_scores s JOIN users ON users.id = s.user_id LEFT JOIN rank_scores ls ON ls.user_id = s.user_id
     WHERE s.week = ? AND s.points > 0 AND users.handle NOT IN (${HIDDEN_HANDLES.map(() => "?").join(",")})${notTester("users")}
     ORDER BY s.points DESC, s.at ASC, users.created_at ASC LIMIT ?`
  )
    .bind(week, ...HIDDEN_HANDLES, BOARD_ROWS)
    .all();
  return (res.results || []).map((row, i) => {
    const user = publicUser(row);
    user.level = Number(row.rank_level) || undefined;
    user.prestige = Number(row.rank_prestige) || 0;
    return { place: i + 1, user, value: Number(row.score) || 0 };
  });
}

function eventOut(event, rewards) {
  const set = event.setId ? PLAYABLE_SETS.find((row) => row.id === event.setId) : null;
  return {
    week: event.week,
    kind: event.kind,
    title: event.title,
    rule: event.rule,
    unit: event.unit,
    starts: event.starts,
    ends: event.ends,
    set: set ? { id: set.id, name: set.name } : undefined,
    type: event.type,
    era: event.era,
    steps: event.steps.map((at, i) => ({ at, coins: rewards ? STEP_COINS[i] : 0 })),
  };
}

async function claimsFor(env, userId, fromWeek) {
  const res = await env.DB.prepare("SELECT week, kind, ref FROM event_claims WHERE user_id = ? AND week >= ?").bind(userId, fromWeek).all();
  return new Set((res.results || []).map((row) => `${row.week}|${row.kind}|${row.ref}`));
}

async function readEvents(env, me, { publicUser, now }) {
  const sw = switches(env);
  const week = weekOf(now);
  const event = eventFor(week);
  const key = `shared|${week}|${sw.rewards}`;
  let shared = cache.get(key);
  if (!shared || now - shared.at > CACHE_MS) {
    const lastEvent = eventFor(week - 1);
    const winners = {};
    for (const board of PRIZE_BOARDS) {
      const res = await env.DB.prepare(
        `SELECT p.place, p.value, users.* FROM event_prizes p JOIN users ON users.id = p.user_id
         WHERE p.week = ? AND p.board = ? AND p.place <= 3 ORDER BY p.place`
      )
        .bind(week - 1, board)
        .all();
      winners[board] = (res.results || []).map((row) => ({ place: row.place, value: Number(row.value) || 0, user: publicUser(row) }));
    }
    shared = {
      at: now,
      community: await community(env, week),
      board: await eventBoard(env, week, publicUser),
      last: { title: lastEvent.title, unit: lastEvent.unit, community: await community(env, week - 1), winners },
    };
    cache.set(key, shared);
  }

  const out = {
    visible: true,
    rewards: sw.rewards,
    preview: sw.mode === "preview",
    event: eventOut(event, sw.rewards),
    community: { ...shared.community, coins: sw.rewards ? GOAL_COINS : 0 },
    board: shared.board,
    last: shared.last,
    prizes: sw.rewards
      ? {
          boards: PRIZE_BOARDS.map((board) => ({ board, label: PRIZE_BOARD_LABEL[board] })),
          table: PRIZE_TABLE.map(([from, to, coins]) => ({ from, to, coins })),
          minAgeDays: PRIZE_MIN_AGE_DAYS,
          minLevel: PRIZE_MIN_LEVEL,
          minPaidPacks: PRIZE_MIN_PAID_PACKS,
          onePrize: ONE_PRIZE_A_WEEK,
        }
      : null,
    me: null,
  };
  if (!me) return out;

  const score = await env.DB.prepare("SELECT points, packs FROM event_scores WHERE user_id = ? AND week = ?").bind(me.id, week).first();
  const points = Number(score?.points) || 0;
  const claimed = await claimsFor(env, me.id, week - CLAIM_WEEKS);
  let place = null;
  if (points > 0 && !HIDDEN_HANDLES.includes(me.handle) && !isTester(me)) {
    const ahead = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM event_scores s JOIN users ON users.id = s.user_id
       WHERE s.week = ? AND s.points > ? AND users.handle NOT IN (${HIDDEN_HANDLES.map(() => "?").join(",")})${notTester("users")}`
    )
      .bind(week, points, ...HIDDEN_HANDLES)
      .first();
    place = (Number(ahead?.n) || 0) + 1;
  }
  out.me = {
    points,
    packs: Number(score?.packs) || 0,
    place,
    steps: event.steps.map((at, i) => ({ at, done: points >= at, claimed: claimed.has(`${week}|step|${i}`) })),
    goal: { qualifies: points >= event.steps[0], claimed: claimed.has(`${week}|goal|goal`) },
    // Coins still waiting from the last few weeks: steps and goals not yet claimed, and frozen prizes.
    waiting: sw.rewards ? await waitingFor(env, me.id, week, claimed) : [],
  };
  return out;
}

/** Unclaimed coins from earlier weeks, newest first. */
async function waitingFor(env, userId, week, claimed) {
  const out = [];
  const scores = (await env.DB.prepare("SELECT week, points FROM event_scores WHERE user_id = ? AND week >= ? AND week < ? ORDER BY week DESC").bind(userId, week - CLAIM_WEEKS, week).all()).results || [];
  for (const row of scores) {
    const event = eventFor(row.week);
    event.steps.forEach((at, i) => {
      if (Number(row.points) >= at && !claimed.has(`${row.week}|step|${i}`)) out.push({ week: row.week, kind: "step", ref: String(i), coins: STEP_COINS[i], label: `${event.title}, step ${i + 1}` });
    });
    if (Number(row.points) >= event.steps[0] && !claimed.has(`${row.week}|goal|goal`) && (await community(env, row.week)).reached) {
      out.push({ week: row.week, kind: "goal", ref: "goal", coins: GOAL_COINS, label: `${event.title}, community goal` });
    }
  }
  const prizes = (await env.DB.prepare("SELECT week, board, place, coins, held, note FROM event_prizes WHERE user_id = ? AND week >= ? ORDER BY week DESC, coins DESC").bind(userId, week - CLAIM_WEEKS).all()).results || [];
  for (const row of prizes) {
    if (claimed.has(`${row.week}|prize|${row.board}`)) continue;
    // A place that pays nothing (the smaller of two, or one the owner kept back) is not something waiting.
    if (!row.coins) continue;
    out.push({
      week: row.week,
      kind: "prize",
      ref: row.board,
      coins: Number(row.coins) || 0,
      place: row.place,
      held: Boolean(row.held),
      label: `${PRIZE_BOARD_LABEL[row.board]}, place ${row.place}`,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Claiming                                                             */
/* ------------------------------------------------------------------ */

async function claim(env, me, body, now) {
  const week = Number(body?.week);
  const kind = String(body?.kind || "");
  const ref = String(body?.ref ?? "");
  const current = weekOf(now);
  if (!Number.isInteger(week) || week > current || week < current - CLAIM_WEEKS) return { error: "That week has closed.", status: 400 };
  const event = eventFor(week);
  let coins = 0;
  if (kind === "step") {
    const i = Number(ref);
    if (!Number.isInteger(i) || i < 0 || i >= event.steps.length || String(i) !== ref) return { error: "No such step.", status: 400 };
    const score = await env.DB.prepare("SELECT points FROM event_scores WHERE user_id = ? AND week = ?").bind(me.id, week).first();
    if ((Number(score?.points) || 0) < event.steps[i]) return { error: "You haven't reached that step yet.", status: 400 };
    coins = STEP_COINS[i];
  } else if (kind === "goal") {
    if (ref !== "goal") return { error: "No such reward.", status: 400 };
    const score = await env.DB.prepare("SELECT points FROM event_scores WHERE user_id = ? AND week = ?").bind(me.id, week).first();
    if ((Number(score?.points) || 0) < event.steps[0]) return { error: "Reach your first step to share in the community goal.", status: 400 };
    if (!(await community(env, week)).reached) return { error: "The community goal hasn't been reached yet.", status: 400 };
    coins = GOAL_COINS;
  } else if (kind === "prize") {
    if (!PRIZE_BOARDS.includes(ref)) return { error: "No such board.", status: 400 };
    const prize = await env.DB.prepare("SELECT coins, held FROM event_prizes WHERE user_id = ? AND week = ? AND board = ?").bind(me.id, week, ref).first();
    if (!prize || !(Number(prize.coins) > 0)) return { error: "No prize to claim there.", status: 400 };
    if (prize.held) return { error: "This prize is being checked. It'll open here once it clears.", status: 409 };
    coins = Number(prize.coins);
  } else {
    return { error: "No such reward.", status: 400 };
  }
  const results = await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO event_claims (user_id, week, kind, ref, coins, at) VALUES (?, ?, ?, ?, ?, ?)").bind(me.id, week, kind, ref, coins, now),
    env.DB.prepare("UPDATE profiles SET coins = coins + ?1, granted = granted + ?1 WHERE user_id = ?2 AND changes() = 1").bind(coins, me.id),
  ]);
  if (!results[0]?.meta?.changes) return { error: "Already claimed.", status: 400 };
  return { coins };
}

/* ------------------------------------------------------------------ */
/* Routes                                                               */
/* ------------------------------------------------------------------ */

export async function handleEvents(path, method, request, env, helpers) {
  if (!path.startsWith("/api/events")) return null;
  const { json, requireUser, publicUser, readJson, loadSave } = helpers;
  const sw = switches(env);
  if (sw.mode === "off") return json({ visible: false });

  const signed = (request.headers.get("cookie") || "").includes("pp_sid=");
  const auth = signed ? await requireUser(request, env) : { user: null };
  const me = auth.response ? null : auth.user;
  const admin = Boolean(me) && isBetaAdmin(env, me);
  if (sw.mode === "preview" && !admin) return json({ visible: false });
  await ensureEventSchema(env);
  const now = Date.now();

  if (path === "/api/events" && method === "GET") return json(await readEvents(env, me, { publicUser, now }));

  if (path === "/api/events/claim" && method === "POST") {
    if (!me) return auth.response || json({ error: "Sign in to claim." }, 401);
    if (!sw.rewards) return json({ error: "Event rewards aren't switched on." }, 403);
    const result = await claim(env, me, await readJson(request), now);
    if (result.error) return json({ error: result.error }, result.status);
    return json({ coins: result.coins, save: await loadSave(env, me.id, request) });
  }

  // The owner's list of held prizes, and letting one go or keeping it back.
  if (path === "/api/events/held") {
    if (!admin) return json({ error: "Not found." }, 404);
    if (method === "GET") {
      const res = await env.DB.prepare(
        `SELECT p.week, p.board, p.place, p.coins, p.held, users.handle FROM event_prizes p JOIN users ON users.id = p.user_id
         WHERE p.held IS NOT NULL ORDER BY p.week DESC, p.coins DESC LIMIT 100`
      ).all();
      const rows = [];
      for (const row of res.results || []) {
        let why = "Was handed a lot of card value in lopsided trades that week.";
        if (String(row.held).startsWith("flips:")) {
          const other = await env.DB.prepare("SELECT handle FROM users WHERE id = ?").bind(String(row.held).slice(6)).first();
          why = `Came out far ahead in coin flips against @${other?.handle || "a deleted account"} that week.`;
        }
        rows.push({ week: row.week, board: row.board, place: row.place, coins: row.coins, handle: row.handle, why });
      }
      return json({ held: rows });
    }
    if (method === "POST") {
      const body = await readJson(request);
      const pay = body?.pay === true;
      const res = await env.DB.prepare(
        pay
          ? "UPDATE event_prizes SET held = NULL, note = 'released' WHERE week = ? AND board = ? AND place = ? AND held IS NOT NULL"
          : "UPDATE event_prizes SET held = NULL, coins = 0, note = 'withheld' WHERE week = ? AND board = ? AND place = ? AND held IS NOT NULL"
      )
        .bind(Number(body?.week), String(body?.board || ""), Number(body?.place))
        .run();
      return json({ ok: Boolean(res?.meta?.changes) });
    }
  }
  return json({ error: "Not found." }, 404);
}
