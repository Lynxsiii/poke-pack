/**
 * Auto-regrade (migration 0036): crack a slab and send the card straight back
 * in, over and over, until it comes back at the grade the player asked for or
 * one of their stops is hit. It automates what the slab page's Regrade key
 * already does by hand, at exactly the same price and odds:
 *
 *   one try = the crack (free, no refund) + one grading fee (gradingFee) +
 *             one grade rolled by rollGrade / rollBlackLabel with crypto.
 *
 *   GET  /api/grading/auto            { run }   the player's running run, or null
 *   GET  /api/grading/auto?run=<id>   { run }   one run with its grade tally
 *   POST /api/grading/auto/start      { slabId, target, maxSpend?, maxTries, requestId } -> { run }
 *   POST /api/grading/auto/step       { runId }  -> { run, tries, slab, save }   up to STEP_TRIES tries
 *   POST /api/grading/auto/stop       { runId }  -> { run, save }
 *
 * A run is a row of grade_runs. Each try is ONE D1 batch whose first
 * statement claims the try on the run row (attempts = n-1 -> n) and checks
 * every condition at once: the run is still running, the slab is still this
 * player's, unlocked and slabbed, the player has the fee, and neither stop is
 * passed. Every later statement is chained on changes() = 1, so the coins, the
 * old slab, the new slab and the run move together or not at all: never a
 * charge without a roll, never a roll without a charge. Two tabs stepping the
 * same run race on attempts = n-1 and only one wins each try. The client
 * drives the loop; a closed tab or a dropped connection only pauses it, and
 * the run picks up from the row on the next step.
 *
 * The new slab keeps the old one's guard and its place on the profile (worn
 * and shown counts never change). Tries made here are 'auto:<run>:<n>' slabs;
 * the cracked ones are ordinary cracked rows, exactly what a manual regrade
 * leaves behind.
 */
import { bandFor, gradingFee, rollBlackLabel, rollGrade } from "../js/grading-rules.js";
import { AUTO_LIMITS, AUTO_BLACK, autoHit } from "../js/grading-auto-rules.js";
import { queueBlackLabel } from "./discord.js";
import { gateResponse } from "./gates.js";
import { randomBelow, setForCard, slabView } from "./grading.js";

const error = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
const REQUEST_ID = /^[a-zA-Z0-9-]{8,80}$/;
const ACTIVE = "slabbed";
/** Tries per step request: small enough that Stop answers at once, big enough that a long run isn't a thousand round trips. */
export const STEP_TRIES = 10;
/** A step stops trying after this long, so one request never runs into the Worker's limits. */
const STEP_MS = 4000;

export const AUTO_DDL = [
  `CREATE TABLE IF NOT EXISTS grade_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    request_id TEXT NOT NULL,
    card_id TEXT NOT NULL,
    reverse INTEGER NOT NULL DEFAULT 0 CHECK(reverse IN (0,1)),
    start_slab_id INTEGER NOT NULL,
    start_grade INTEGER NOT NULL,
    start_black INTEGER NOT NULL DEFAULT 0 CHECK(start_black IN (0,1)),
    slab_id INTEGER NOT NULL,
    target INTEGER NOT NULL CHECK(target BETWEEN 2 AND 11),
    max_spend_cents INTEGER CHECK(max_spend_cents IS NULL OR max_spend_cents > 0),
    max_attempts INTEGER NOT NULL CHECK(max_attempts > 0),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
    spent_cents INTEGER NOT NULL DEFAULT 0 CHECK(spent_cents >= 0),
    status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running','hit','stopped')),
    reason TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(user_id, request_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_grade_runs_running ON grade_runs(user_id) WHERE status = 'running'",
  "CREATE INDEX IF NOT EXISTS idx_grade_runs_user ON grade_runs(user_id, id DESC)",
];

let ready = false;
let work = null;
export const resetAutoSchemaCache = () => {
  ready = false;
  work = null;
};
async function ensureAutoSchema(env) {
  if (ready) return;
  if (!work) {
    work = (async () => {
      try {
        for (const sql of AUTO_DDL) await env.DB.exec(`${sql.replace(/\s+/g, " ").trim()};`);
        ready = true;
      } finally {
        work = null;
      }
    })();
  }
  return work;
}

/** Why a run stopped, in the player's words. */
export const STOP_WORDS = {
  hit: "Hit the target.",
  spend: "Hit your spending limit.",
  tries: "Hit your limit on tries.",
  coins: "Ran out of coins for the next fee.",
  slab: "The slab changed somewhere else, so the run stopped.",
  locked: "The slab went into a casino game or a trade.",
  price: "The card has no price right now.",
  player: "You stopped it.",
};

const runFor = (env, userId, id) => env.DB.prepare("SELECT * FROM grade_runs WHERE id = ? AND user_id = ?").bind(id, userId).first();
const slabRow = (env, userId, id) => env.DB.prepare("SELECT * FROM graded_cards WHERE id = ? AND user_id = ?").bind(id, userId).first();
const tryRequestId = (runId, n) => `auto:${runId}:${n}`;

/** The run as the client sees it, with every try's grade counted (10s and Black Labels apart). */
async function runView(env, run) {
  if (!run) return null;
  const rows = (
    await env.DB.prepare(
      "SELECT grade, black_label AS bl, COUNT(*) AS n FROM graded_cards WHERE user_id = ? AND request_id LIKE ? GROUP BY grade, black_label"
    )
      .bind(run.user_id, `auto:${run.id}:%`)
      .all()
  ).results || [];
  const tally = {};
  for (const row of rows) {
    const key = row.bl ? "bl" : String(row.grade);
    tally[key] = (tally[key] || 0) + Number(row.n || 0);
  }
  return {
    id: run.id,
    cardId: run.card_id,
    reverse: Boolean(run.reverse),
    startSlabId: run.start_slab_id,
    startGrade: run.start_grade,
    startBlack: Boolean(run.start_black),
    slabId: run.slab_id,
    target: run.target,
    maxSpend: run.max_spend_cents == null ? null : run.max_spend_cents / 100,
    maxTries: run.max_attempts,
    tries: run.attempts,
    spent: run.spent_cents / 100,
    status: run.status,
    reason: run.reason || null,
    reasonText: run.reason ? STOP_WORDS[run.reason] || "" : "",
    tally,
    startedAt: run.created_at,
    updatedAt: run.updated_at,
  };
}

const stopRun = (env, run, reason) =>
  env.DB.prepare(
    `UPDATE grade_runs SET status = ?, reason = ?, updated_at = ? WHERE id = ? AND user_id = ? AND status = 'running'`
  )
    .bind(reason === "hit" ? "hit" : "stopped", reason, Date.now(), run.id, run.user_id)
    .run();

// ---- Start --------------------------------------------------------------------
async function start(env, request, helpers, user, body) {
  const requestId = String(body.requestId || "");
  if (!REQUEST_ID.test(requestId)) error("Provide a unique requestId.");
  const prior = await env.DB.prepare("SELECT * FROM grade_runs WHERE user_id = ? AND request_id = ?").bind(user.id, requestId).first();
  if (prior) return prior; // a retried start
  const slabId = Number(body.slabId);
  if (!Number.isInteger(slabId) || slabId < 1) error("Pick a slab.");
  const target = body.target === "bl" ? AUTO_BLACK : Number(body.target);
  if (!Number.isInteger(target) || target < 2 || target > AUTO_BLACK) error("Pick a target grade.");
  const maxTries = Number(body.maxTries);
  if (!Number.isInteger(maxTries) || maxTries < 1 || maxTries > AUTO_LIMITS.maxTries) error(`Set a limit of 1 to ${AUTO_LIMITS.maxTries.toLocaleString("en-US")} tries.`);
  let maxSpendCents = null;
  if (body.maxSpend != null && body.maxSpend !== "") {
    const spend = Number(body.maxSpend);
    if (!Number.isFinite(spend) || spend <= 0 || spend > AUTO_LIMITS.maxSpend) error("Set a spending limit above zero.");
    maxSpendCents = Math.round(spend * 100);
  }
  const slab = await slabRow(env, user.id, slabId);
  if (!slab) error("Slab not found.", 404);
  if (slab.status !== ACTIVE) error("That slab isn't in your collection any more.", 409);
  if (slab.locked) error("That slab is in a casino game or a trade.", 409);
  if (autoHit(slab.grade, Boolean(slab.black_label), target)) error("That slab is already at the target grade or better.", 409);
  const card = await helpers.findCatalogCard(env, request, slab.card_id);
  if (!card) error("That card has no price right now.", 409);
  const fee = gradingFee(card);
  if (maxSpendCents != null && maxSpendCents < Math.round(fee * 100)) error("Your spending limit is below one grading fee.");
  const running = await env.DB.prepare("SELECT id FROM grade_runs WHERE user_id = ? AND status = 'running'").bind(user.id).first();
  if (running) error("You already have an auto-regrade running. Stop it first.", 409);
  const now = Date.now();
  try {
    await env.DB.prepare(
      `INSERT INTO grade_runs (user_id, request_id, card_id, reverse, start_slab_id, start_grade, start_black, slab_id, target,
        max_spend_cents, max_attempts, attempts, spent_cents, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 'running', ?, ?)`
    )
      .bind(user.id, requestId, slab.card_id, slab.reverse ? 1 : 0, slab.id, slab.grade, slab.black_label ? 1 : 0, slab.id, target, maxSpendCents, maxTries, now, now)
      .run();
  } catch (err) {
    if (/UNIQUE constraint failed/.test(String(err?.message))) {
      const raced = await env.DB.prepare("SELECT * FROM grade_runs WHERE user_id = ? AND request_id = ?").bind(user.id, requestId).first();
      if (raced) return raced;
      error("You already have an auto-regrade running. Stop it first.", 409);
    }
    throw err;
  }
  return env.DB.prepare("SELECT * FROM grade_runs WHERE user_id = ? AND request_id = ?").bind(user.id, requestId).first();
}

// ---- One try --------------------------------------------------------------------
/**
 * Claim try n+1 of `run` and grade it. Resolves { grade, blackLabel, slabId } when it happened, or { reason } when
 * nothing moved (and the run is then stopped with that reason, unless another tab took the try).
 */
async function oneTry(env, run, card, band, feeCents) {
  const n = run.attempts + 1;
  const grade = rollGrade(band, randomBelow(10000)); // rolled before anything moves, exactly as submit does
  const blackLabel = grade === 10 && rollBlackLabel(band, randomBelow(band.blackIn));
  const hit = autoHit(grade, blackLabel, run.target);
  const now = Date.now();
  const rid = tryRequestId(run.id, n);
  const results = await env.DB.batch([
    // 1. Claim the try. Every condition the later statements need is checked here, once.
    env.DB.prepare(
      `UPDATE grade_runs SET attempts = attempts + 1, spent_cents = spent_cents + ?1, updated_at = ?2
       WHERE id = ?3 AND user_id = ?4 AND status = 'running' AND attempts = ?5 AND slab_id = ?6
         AND attempts < max_attempts
         AND (max_spend_cents IS NULL OR spent_cents + ?1 <= max_spend_cents)
         AND (SELECT coins FROM profiles WHERE user_id = ?4) >= ?7
         AND EXISTS(SELECT 1 FROM graded_cards WHERE id = ?6 AND user_id = ?4 AND status = '${ACTIVE}' AND locked IS NULL)`
    ).bind(feeCents, now, run.id, run.user_id, run.attempts, run.slab_id, feeCents / 100),
    // 2. The fee, the same one a manual regrade charges.
    env.DB.prepare("UPDATE profiles SET coins = coins - ? WHERE user_id = ? AND changes() = 1").bind(feeCents / 100, run.user_id),
    // 3. The new slab: same copy, new grade, the old one's guard and profile place.
    env.DB.prepare(
      `INSERT INTO graded_cards (user_id, card_id, reverse, grade, band, fee_cents, request_id, status, created_at, black_label, guard, shown, regrade_of)
       SELECT user_id, card_id, reverse, ?, ?, ?, ?, '${ACTIVE}', ?, ?, guard, shown, id FROM graded_cards
       WHERE id = ? AND user_id = ? AND changes() = 1`
    ).bind(grade, band.id, feeCents, rid, now, blackLabel ? 1 : 0, run.slab_id, run.user_id),
    // 4. The old slab is cracked, as the Crack key does it.
    env.DB.prepare(
      `UPDATE graded_cards SET status = 'cracked', closed_at = ?, guard = NULL, shown = 0
       WHERE id = ? AND user_id = ? AND status = '${ACTIVE}' AND locked IS NULL AND changes() = 1`
    ).bind(now, run.slab_id, run.user_id),
    // 5. The run follows the new slab, and ends on a hit.
    env.DB.prepare(
      `UPDATE grade_runs SET slab_id = (SELECT id FROM graded_cards WHERE user_id = ?1 AND request_id = ?2),
         status = CASE WHEN ?3 THEN 'hit' ELSE status END, reason = CASE WHEN ?3 THEN 'hit' ELSE reason END
       WHERE id = ?4 AND user_id = ?1 AND changes() = 1`
    ).bind(run.user_id, rid, hit ? 1 : 0, run.id),
  ]);
  if (results[0]?.meta?.changes && !results[4]?.meta?.changes) {
    // Cannot happen (statement 1 checked what 2 to 5 need), but say so loudly rather than leave a half-moved try.
    console.error("auto-regrade: a claimed try did not finish", run.id, n, results.map((r) => r?.meta?.changes));
  }
  if (results[4]?.meta?.changes) {
    const fresh = await runFor(env, run.user_id, run.id);
    return { grade, blackLabel, hit, run: fresh };
  }
  // Nothing moved. Find out why, in the order a player would read it.
  const now2 = await runFor(env, run.user_id, run.id);
  if (!now2 || now2.status !== "running") return { run: now2, done: true };
  if (now2.attempts !== run.attempts) return { run: now2, raced: true }; // another tab took this try; carry on from there
  let reason = "slab";
  const slab = await slabRow(env, run.user_id, now2.slab_id);
  if (!slab || slab.status !== ACTIVE) reason = "slab";
  else if (slab.locked) reason = "locked";
  else if (now2.attempts >= now2.max_attempts) reason = "tries";
  else if (now2.max_spend_cents != null && now2.spent_cents + feeCents > now2.max_spend_cents) reason = "spend";
  else {
    const coins = Number((await env.DB.prepare("SELECT coins FROM profiles WHERE user_id = ?").bind(run.user_id).first())?.coins || 0);
    if (coins < feeCents / 100) reason = "coins";
  }
  await stopRun(env, now2, reason);
  return { run: await runFor(env, run.user_id, run.id), done: true };
}

async function step(env, request, helpers, user, body) {
  const runId = Number(body.runId);
  if (!Number.isInteger(runId) || runId < 1) error("Pick a run.");
  let run = await runFor(env, user.id, runId);
  if (!run) error("Run not found.", 404);
  const tries = [];
  if (run.status !== "running") return { run, tries };
  const card = await helpers.findCatalogCard(env, request, run.card_id);
  if (!card) {
    await stopRun(env, run, "price");
    return { run: await runFor(env, user.id, runId), tries };
  }
  const set = setForCard(run.card_id);
  const band = bandFor(set);
  const feeCents = Math.round(gradingFee(card) * 100);
  const began = Date.now();
  for (let i = 0; i < STEP_TRIES && Date.now() - began < STEP_MS; i++) {
    const out = await oneTry(env, run, card, band, feeCents);
    run = out.run || run;
    if (out.grade) {
      tries.push({ n: run.attempts, grade: out.grade, blackLabel: out.blackLabel, fee: feeCents / 100 });
      if (out.blackLabel) await queueBlackLabel(env, user, card, set, Date.now()); // the Discord feed, as a manual Black Label
    }
    if (!run || run.status !== "running" || out.done) break;
  }
  return { run, tries };
}

async function stop(env, user, body) {
  const runId = Number(body.runId);
  if (!Number.isInteger(runId) || runId < 1) error("Pick a run.");
  const run = await runFor(env, user.id, runId);
  if (!run) error("Run not found.", 404);
  if (run.status === "running") await stopRun(env, run, "player");
  return runFor(env, user.id, runId);
}

// ---- Routes -------------------------------------------------------------------
/** /api/grading/auto*, called from handleGrading after its origin, JSON and sign-in checks. Returns a Response. */
export async function handleAuto(path, method, request, env, helpers, user, body) {
  const { json } = helpers;
  await ensureAutoSchema(env);
  const slabOf = async (id) => {
    const row = id ? await slabRow(env, user.id, id) : null;
    return row && row.status === ACTIVE ? slabView(row, await helpers.findCatalogCard(env, request, row.card_id)) : null;
  };
  if (path === "/api/grading/auto" && method === "GET") {
    const id = Number(new URL(request.url).searchParams.get("run"));
    const run = Number.isInteger(id) && id > 0
      ? await runFor(env, user.id, id)
      : await env.DB.prepare("SELECT * FROM grade_runs WHERE user_id = ? AND status = 'running'").bind(user.id).first();
    if (id && !run) return json({ error: "Run not found." }, 404);
    return json({ run: await runView(env, run), slab: run ? await slabOf(run.slab_id) : null });
  }
  if (method !== "POST") return json({ error: "Not found." }, 404);
  if (path === "/api/grading/auto/start") {
    const shut = await gateResponse(env, json, user.id, "grading");
    if (shut) return shut;
    const run = await start(env, request, helpers, user, body);
    return json({ run: await runView(env, run), slab: await slabOf(run.slab_id) });
  }
  if (path === "/api/grading/auto/step") {
    const { run, tries } = await step(env, request, helpers, user, body);
    return json({ run: await runView(env, run), tries, slab: await slabOf(run.slab_id), save: await helpers.loadSave(env, user.id) });
  }
  if (path === "/api/grading/auto/stop") {
    const run = await stop(env, user, body);
    return json({ run: await runView(env, run), slab: await slabOf(run.slab_id), save: await helpers.loadSave(env, user.id) });
  }
  return json({ error: "Not found." }, 404);
}
