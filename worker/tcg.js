/* The card game between two players (docs/tcg-plan.md, Phase 3). Friends first,
   no stakes: nothing here moves coins, cards or rewards.

   The Worker is the referee. It alone runs the rules engine (js/tcg/engine.js,
   the same file the page runs against the bot): a client sends an action, the
   Worker checks it with `apply` and keeps it in the match's log. A match is its
   seed plus that log; the state after the last action is cached in the row so
   a move doesn't replay the game. A client only ever gets its own side's view
   (`viewFor`) and the events since the last step it has seen, which the Worker
   rebuilds by replaying the log.

   Decks are sent with the challenge and with the accept, and checked here with
   `checkDeck` against what each player owns (raw and graded copies, like the
   page counts them). The challenger's deck is checked again when the match
   starts.

   Every decision has a clock (DECISION_MS, more for setup). Running out loses
   the match; it is settled when anyone reads the match and by the scheduled
   maintenance (maintainTcg). An open challenge expires after CHALLENGE_MS.

     GET  /api/tcg/matches                     { incoming, outgoing, live, recent }
     POST /api/tcg/challenge                   { to: handle, deck: { name, format, cards } } -> { match }
     POST /api/tcg/matches/<id>/accept         { deck }  -> { match }
     POST /api/tcg/matches/<id>/decline        -> { match }   (the challenged player)
     POST /api/tcg/matches/<id>/cancel         -> { match }   (the challenger, while open)
     GET  /api/tcg/matches/<id>[?since=N]      -> { match, seq, legal, view? , steps? }
     POST /api/tcg/matches/<id>/action         { action, since } -> { match, seq, legal, steps }
     POST /api/tcg/matches/<id>/concede        { since } -> { match, seq, legal, steps }

   Without `since` a read answers with the whole view. With it, with `steps`:
   every action after step `since`, each { seq, action, events, view }, at most
   STEP_LIMIT at a time (read again for the rest). A RuleError is a 400. */
import { FORMATS, RuleError, apply, createGame, legalActions, viewFor } from "../js/tcg/engine.js";
import { createDefs } from "../js/tcg/cards.js";
import { checkDeck, deckList } from "../js/tcg/decks.js";

export const TCG_TIMING = { DECISION_MS: 90_000, SETUP_MS: 180_000, CHALLENGE_MS: 15 * 60_000 };
const MAX_LIVE = 6;
const STEP_LIMIT = 16;
const RECENT_MS = 24 * 3600_000;
const CARD_ID = /^[a-z0-9][a-z0-9._-]{1,63}$/i;
const MATCH_ID = /^[a-f0-9]{20}$/;

const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
const newId = () => [...crypto.getRandomValues(new Uint8Array(10))].map((b) => b.toString(16).padStart(2, "0")).join("");
const newSeed = () => crypto.getRandomValues(new Uint32Array(1))[0] >>> 0;

// ---- Schema (the same DDL as worker/migrations/0038_tcg_matches.sql) ----------
export const TCG_DDL = [
  `CREATE TABLE IF NOT EXISTS tcg_matches (
  id TEXT PRIMARY KEY,
  p0 TEXT NOT NULL,
  p1 TEXT NOT NULL,
  format TEXT NOT NULL,
  seed INTEGER NOT NULL,
  deck0 TEXT NOT NULL,
  deck1 TEXT,
  deck0_name TEXT NOT NULL DEFAULT '',
  deck1_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  log TEXT NOT NULL DEFAULT '[]',
  state TEXT,
  seq INTEGER NOT NULL DEFAULT 0,
  to_move TEXT NOT NULL DEFAULT '',
  deadline INTEGER NOT NULL,
  winner INTEGER,
  reason TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  ended_at INTEGER
)`,
  "CREATE INDEX IF NOT EXISTS tcg_matches_p0 ON tcg_matches(p0, status)",
  "CREATE INDEX IF NOT EXISTS tcg_matches_p1 ON tcg_matches(p1, status)",
  "CREATE INDEX IF NOT EXISTS tcg_matches_due ON tcg_matches(status, deadline)",
];
let schemaReady = false;
/** Tests only: forget the per-isolate cache so another database is checked. */
export const resetTcgSchemaCache = () => {
  schemaReady = false;
};
export async function ensureTcgSchema(env) {
  if (schemaReady) return;
  for (const sql of TCG_DDL) await env.DB.exec(`${sql.replace(/\s+/g, " ")};`);
  schemaReady = true;
}

// ---- Card rules, loaded once per isolate ------------------------------------
let rulesWork = null;
const cardMap = new Map();
let defs = null;
const baseUrl = (env, request) => (request?.url ? request.url : env.SITE_ORIGIN || "https://poke-pack.rip");

async function loadRules(env, request) {
  rulesWork ||= (async () => {
    const get = async (path) => {
      const res = await env.ASSETS.fetch(new Request(new URL(path, baseUrl(env, request)), { method: "GET" }));
      if (!res.ok) throw new Error(`Missing ${path}`);
      return res.json();
    };
    const [rules, trainers, legal] = await Promise.all([get("/data/tcg/rules.json"), get("/data/tcg/trainers.json"), get("/data/tcg/legal.json")]);
    defs = createDefs((id) => cardMap.get(id) || null, rules, trainers, legal);
  })().catch((err) => {
    rulesWork = null;
    throw err;
  });
  await rulesWork;
}

/** The engine's card lookup, with every card of these ids loaded. */
async function defsFor(env, request, ids, h) {
  await loadRules(env, request);
  const req = request || new Request(baseUrl(env, null));
  for (const id of new Set(ids)) {
    if (cardMap.has(id) || !CARD_ID.test(id)) continue;
    const card = await h.findCatalogCard(env, req, id).catch(() => null);
    if (card) cardMap.set(id, card);
  }
  return defs;
}

// ---- Reading a request ------------------------------------------------------
function readDeck(raw) {
  if (!raw || typeof raw !== "object" || !raw.cards || typeof raw.cards !== "object") fail("Choose a deck.");
  const format = String(raw.format || "");
  // Only the tournament formats (js/tcg/engine.js FORMATS `pick`); an old Half deck is refused here, and checkDeck says why.
  if (!FORMATS[format]?.pick) fail("Choose a Standard, Expanded or Unlimited deck (60 cards).");
  const entries = Object.entries(raw.cards);
  if (entries.length > 80) fail("That deck has too many different cards.");
  const cards = {};
  for (const [id, n] of entries) {
    if (!CARD_ID.test(id) || !Number.isInteger(n) || n < 1 || n > 60) fail("That deck has a card that can't be read.");
    cards[id] = n;
  }
  const name = String(raw.name || "Deck").trim().slice(0, 32) || "Deck";
  return { name, format, cards };
}

async function ownedBy(env, userId, h) {
  const { collection } = await h.inventoryMap(env, userId);
  return h.ownedWithSlabs(env, userId, collection);
}

/** The problem with this deck for this player, or "". */
async function deckProblem(env, request, userId, deck, h) {
  const lookup = await defsFor(env, request, Object.keys(deck.cards), h);
  const check = checkDeck(deck, await ownedBy(env, userId, h), lookup);
  return check.ok ? "" : check.problems[0];
}

// ---- The match ---------------------------------------------------------------
const getRow = (env, id) => env.DB.prepare("SELECT * FROM tcg_matches WHERE id = ?").bind(id).first();
const seatOf = (row, userId) => (row.p0 === userId ? 0 : row.p1 === userId ? 1 : -1);
const decksOf = (row) => [JSON.parse(row.deck0), JSON.parse(row.deck1 || "{}")];

/** Who owes the next decision: both players during setup until each has placed, else one. */
export function owing(state) {
  if (!state || state.phase === "over") return [];
  if (state.phase === "setup") return [0, 1].filter((p) => !state.players[p].placed);
  const waiting = state.pending[0];
  return [waiting ? waiting.player : state.current];
}
const clockFor = (state, now) => now + (state.phase === "setup" ? TCG_TIMING.SETUP_MS : TCG_TIMING.DECISION_MS);

/** A player's view, plus the cards a choice they owe shows them (a deck search, the top cards). */
export function viewOf(state, seat) {
  const view = viewFor(state, seat);
  for (const waiting of state.pending) {
    if (waiting.player !== seat) continue;
    for (const quoted of JSON.stringify(waiting).match(/"[ab]\d+"/g) || []) {
      const uid = quoted.slice(1, -1);
      if (state.cards[uid]) view.cards[uid] = state.cards[uid];
    }
  }
  return view;
}

async function usersOf(env, row) {
  const rows = (await env.DB.prepare("SELECT id, name, handle FROM users WHERE id IN (?, ?)").bind(row.p0, row.p1).all()).results || [];
  return [row.p0, row.p1].map((id) => {
    const u = rows.find((r) => r.id === id);
    return u ? { handle: u.handle, name: u.name } : { handle: "", name: "A trainer" };
  });
}

function summary(row, seat, users) {
  return {
    id: row.id,
    status: row.status,
    format: row.format,
    seat,
    you: users[seat],
    them: users[1 - seat],
    challenger: seat === 0,
    deckName: seat === 0 ? row.deck0_name : row.deck1_name,
    toMove: row.to_move ? row.to_move.split(",").map(Number) : [],
    deadline: row.deadline,
    now: Date.now(),
    winner: row.winner ?? null,
    reason: row.reason || "",
    seq: row.seq,
    ordered: /"type":"order"/.test(row.log || ""),
    createdAt: row.created_at,
  };
}

/** Write a new state and log on top of version `seq`. False when another request got there first. */
async function writeMatch(env, row, state, log, now, extra = {}) {
  const over = state.phase === "over";
  const res = await env.DB.prepare(
    `UPDATE tcg_matches SET state = ?, log = ?, seq = ?, to_move = ?, deadline = ?, status = ?, winner = ?, reason = ?,
       updated_at = ?, ended_at = ? WHERE id = ? AND seq = ? AND status = 'active'`
  )
    .bind(
      JSON.stringify(state),
      JSON.stringify(log),
      log.length,
      owing(state).join(","),
      over ? now : clockFor(state, now),
      over ? "over" : "active",
      over ? (state.winner ?? null) : null,
      over ? extra.reason || state.reason || "" : "",
      now,
      over ? now : null,
      row.id,
      row.seq
    )
    .run();
  return res.meta.changes > 0;
}

/** Settle a clock that ran out: an expired challenge, or a loss for whoever owed the move. Returns the row as it is now. */
async function settleClock(env, row, now = Date.now()) {
  if (!row || row.deadline > now) return row;
  if (row.status === "open") {
    await env.DB.prepare("UPDATE tcg_matches SET status = 'expired', updated_at = ?, ended_at = ? WHERE id = ? AND status = 'open'").bind(now, now, row.id).run();
    return getRow(env, row.id);
  }
  if (row.status !== "active") return row;
  const state = JSON.parse(row.state);
  const log = JSON.parse(row.log);
  const owe = owing(state);
  if (owe.length === 1) {
    // Concede needs no card rules, so a timeout settles without loading any.
    const action = { type: "concede", player: owe[0], timeout: true };
    apply(state, action, null);
    log.push(action);
    await writeMatch(env, row, state, log, now, { reason: "timeout" });
  } else {
    // Neither player set up in time: nobody wins.
    await env.DB.prepare(
      "UPDATE tcg_matches SET status = 'over', winner = NULL, reason = 'abandoned', to_move = '', updated_at = ?, ended_at = ? WHERE id = ? AND seq = ? AND status = 'active'"
    )
      .bind(now, now, row.id, row.seq)
      .run();
  }
  return getRow(env, row.id);
}

/** Every step after `since`, rebuilt from the seed and the log, as `seat` may see it. */
function stepsSince(row, seat, lookup, since) {
  const log = JSON.parse(row.log);
  if (!(since >= 0) || since >= log.length) return { steps: [] };
  const cached = JSON.parse(row.state);
  const [deck0, deck1] = decksOf(row);
  const state = createGame({ decks: [deckList({ cards: deck0 }), deckList({ cards: deck1 })], names: cached.players.map((p) => p.name), format: row.format, seed: row.seed }, lookup);
  const steps = [];
  for (let i = 0; i < log.length && steps.length < STEP_LIMIT; i++) {
    let events;
    try {
      events = apply(state, log[i], lookup);
    } catch {
      // The rules changed under a match in progress: the client takes the current view as it is.
      return { steps: [], resync: true };
    }
    if (i >= since) steps.push({ seq: i + 1, action: log[i], events, view: viewOf(state, seat) });
  }
  if (steps.length && steps[steps.length - 1].seq === log.length && state.rng !== cached.rng) return { steps: [], resync: true };
  return { steps };
}

async function matchReply(env, request, row, seat, h, since) {
  const users = await usersOf(env, row);
  const out = { match: summary(row, seat, users), seq: row.seq };
  if (!row.state) return out;
  const state = JSON.parse(row.state);
  const lookup = await defsFor(env, request, Object.values(state.cards), h);
  out.legal = legalActions(state, seat, lookup);
  if (since == null) out.view = viewOf(state, seat);
  else {
    const { steps, resync } = stepsSince(row, seat, lookup, since);
    out.steps = steps;
    if (resync) out.view = viewOf(state, seat);
  }
  return out;
}

/** Engine actions a client may send: its own, with known fields only. */
function readAction(raw, seat) {
  if (!raw || typeof raw !== "object" || typeof raw.type !== "string") fail("Send an action.");
  if (JSON.stringify(raw).length > 2000) fail("That action is too long.");
  const keep = ["type", "uid", "spot", "to", "index", "active", "bench", "uids", "discard", "first"];
  const action = { player: seat };
  for (const key of keep) if (raw[key] !== undefined) action[key] = raw[key];
  return action;
}

async function act(env, request, id, userId, body, h) {
  for (let attempt = 0; attempt < 4; attempt++) {
    let row = await getRow(env, id);
    if (!row) fail("Match not found.", 404);
    const seat = seatOf(row, userId);
    if (seat < 0) fail("Match not found.", 404);
    row = await settleClock(env, row);
    if (row.status !== "active") fail(row.status === "over" ? "The match is over." : "The match hasn't started.", 409);
    const state = JSON.parse(row.state);
    const log = JSON.parse(row.log);
    const action = readAction(body?.action, seat);
    const lookup = await defsFor(env, request, Object.values(state.cards), h);
    try {
      apply(state, action, lookup);
    } catch (err) {
      if (err instanceof RuleError) fail(err.message, 400);
      throw err;
    }
    log.push(action);
    if (!(await writeMatch(env, row, state, log, Date.now()))) continue; // the other player moved at the same time: try again on top
    const since = Number.isInteger(body?.since) ? body.since : row.seq;
    return matchReply(env, request, await getRow(env, id), seat, h, since);
  }
  fail("The match is busy. Try again.", 409);
}

// ---- Routes -------------------------------------------------------------------
export async function handleTcg(path, method, request, env, h) {
  const { json, requireUser, readJson } = h;
  const auth = await requireUser(request, env);
  if (auth.response) return auth.response;
  const me = auth.user;
  await ensureTcgSchema(env);
  const now = Date.now();

  if (path === "/api/tcg/matches" && method === "GET") {
    const rows =
      (await env.DB.prepare(
        `SELECT id, p0, p1, format, status, deck0_name, deck1_name, to_move, deadline, winner, reason, seq, log, created_at, updated_at
         FROM tcg_matches WHERE (p0 = ? OR p1 = ?) AND (status IN ('open', 'active') OR ended_at > ?)
         ORDER BY updated_at DESC LIMIT 30`
      )
        .bind(me.id, me.id, now - RECENT_MS)
        .all()).results || [];
    const out = { incoming: [], outgoing: [], live: [], recent: [] };
    for (let row of rows) {
      if ((row.status === "open" || row.status === "active") && row.deadline <= now) row = await settleClock(env, await getRow(env, row.id), now);
      const seat = seatOf(row, me.id);
      const s = summary(row, seat, await usersOf(env, row));
      if (row.status === "open") (seat === 1 ? out.incoming : out.outgoing).push(s);
      else if (row.status === "active") out.live.push(s);
      else out.recent.push(s);
    }
    return json(out);
  }

  if (path === "/api/tcg/challenge" && method === "POST") {
    const body = await readJson(request);
    const handle = h.normalizeHandle(body?.to);
    const them = handle && (await env.DB.prepare("SELECT id, handle, name FROM users WHERE handle = ?").bind(handle).first());
    if (!them) fail("Trainer not found.", 404);
    if (them.id === me.id) fail("Challenge someone else.");
    const friends = await env.DB.prepare("SELECT 1 AS x FROM friends WHERE from_id = ? AND to_id = ? AND status = 'accepted'").bind(me.id, them.id).first();
    if (!friends) fail("You can challenge your friends. Add them first.", 403);
    const deck = readDeck(body?.deck);
    const live = await env.DB.prepare("SELECT COUNT(*) AS n FROM tcg_matches WHERE (p0 = ? OR p1 = ?) AND status IN ('open', 'active')").bind(me.id, me.id).first();
    if ((live?.n || 0) >= MAX_LIVE) fail(`You have ${MAX_LIVE} matches and challenges going already.`);
    const pair = await env.DB.prepare("SELECT 1 AS x FROM tcg_matches WHERE status = 'open' AND ((p0 = ? AND p1 = ?) OR (p0 = ? AND p1 = ?)) AND deadline > ?")
      .bind(me.id, them.id, them.id, me.id, now)
      .first();
    if (pair) fail("There's already a challenge open between you two.");
    const problem = await deckProblem(env, request, me.id, deck, h);
    if (problem) fail(problem);
    const id = newId();
    await env.DB.prepare(
      `INSERT INTO tcg_matches (id, p0, p1, format, seed, deck0, deck0_name, status, deadline, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)`
    )
      .bind(id, me.id, them.id, deck.format, newSeed(), JSON.stringify(deck.cards), deck.name, now + TCG_TIMING.CHALLENGE_MS, now, now)
      .run();
    const row = await getRow(env, id);
    return json({ match: summary(row, 0, await usersOf(env, row)) });
  }

  const m = path.match(/^\/api\/tcg\/matches\/([a-f0-9]+)(?:\/(accept|decline|cancel|action|concede))?$/);
  if (!m || !MATCH_ID.test(m[1])) return json({ error: "Not found." }, 404);
  const [, id, verb] = m;
  let row = await getRow(env, id);
  const seat = row ? seatOf(row, me.id) : -1;
  if (seat < 0) fail("Match not found.", 404);
  row = await settleClock(env, row, now);

  if (!verb && method === "GET") {
    const since = new URL(request.url).searchParams.get("since");
    return json(await matchReply(env, request, row, seat, h, since == null || since === "" ? null : Number(since)));
  }
  if (method !== "POST") return json({ error: "Not found." }, 404);
  const body = (await readJson(request)) || {};

  if (verb === "accept") {
    if (seat !== 1) fail("Only the trainer challenged can accept.", 403);
    if (row.status !== "open") fail(row.status === "expired" ? "That challenge ran out of time." : "That challenge is closed.", 409);
    const deck = readDeck(body.deck);
    if (deck.format !== row.format) fail(`This is a ${FORMATS[row.format].name} match: choose a ${FORMATS[row.format].name}.`);
    const problem = await deckProblem(env, request, me.id, deck, h);
    if (problem) fail(problem);
    const theirs = { format: row.format, cards: JSON.parse(row.deck0) };
    if (await deckProblem(env, request, row.p0, theirs, h)) {
      await env.DB.prepare("UPDATE tcg_matches SET status = 'cancelled', reason = 'deck', updated_at = ?, ended_at = ? WHERE id = ? AND status = 'open'").bind(now, now, id).run();
      fail("Their deck isn't legal any more, so the challenge was called off.", 409);
    }
    const users = await usersOf(env, row);
    const lookup = await defsFor(env, request, [...Object.keys(theirs.cards), ...Object.keys(deck.cards)], h);
    const state = createGame({ decks: [deckList(theirs), deckList(deck)], names: users.map((u) => (u.handle ? `@${u.handle}` : u.name)), format: row.format, seed: row.seed }, lookup);
    const res = await env.DB.prepare(
      `UPDATE tcg_matches SET status = 'active', deck1 = ?, deck1_name = ?, state = ?, log = '[]', seq = 0, to_move = '0,1', deadline = ?, updated_at = ?
       WHERE id = ? AND status = 'open'`
    )
      .bind(JSON.stringify(deck.cards), deck.name, JSON.stringify(state), now + TCG_TIMING.SETUP_MS, now, id)
      .run();
    if (!res.meta.changes) fail("That challenge is closed.", 409);
    return json({ match: summary(await getRow(env, id), seat, users) });
  }

  if (verb === "decline" || verb === "cancel") {
    if (verb === "decline" && seat !== 1) fail("Only the trainer challenged can decline.", 403);
    if (verb === "cancel" && seat !== 0) fail("Only the challenger can call it off.", 403);
    if (row.status !== "open") fail("That challenge is closed.", 409);
    await env.DB.prepare(`UPDATE tcg_matches SET status = ?, updated_at = ?, ended_at = ? WHERE id = ? AND status = 'open'`)
      .bind(verb === "decline" ? "declined" : "cancelled", now, now, id)
      .run();
    const fresh = await getRow(env, id);
    return json({ match: summary(fresh, seat, await usersOf(env, fresh)) });
  }

  if (verb === "action") return json(await act(env, request, id, me.id, body, h));
  if (verb === "concede") return json(await act(env, request, id, me.id, { ...body, action: { type: "concede" } }, h));
  return json({ error: "Not found." }, 404);
}

/** Scheduled: settle the clocks that ran out while nobody was looking. */
export async function maintainTcg(env, now = Date.now(), limit = 20) {
  await ensureTcgSchema(env);
  const rows = (await env.DB.prepare("SELECT * FROM tcg_matches WHERE status IN ('open', 'active') AND deadline <= ? ORDER BY deadline LIMIT ?").bind(now, limit).all()).results || [];
  for (const row of rows) {
    try {
      await settleClock(env, row, now);
    } catch (err) {
      console.error("tcg clock", row.id, err);
    }
  }
  return rows.length;
}
