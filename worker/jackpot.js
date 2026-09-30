import { money } from '../js/catalog.js';
import { BOT_PERSONAS } from '../js/battle-rules.js';
import { avatarId, avatarStyle } from '../js/cosmetics.js';
import { JACKPOT_RULES, jackpotWindow } from '../js/casino-rules.js';
import { JACKPOT_DDL } from './casino-ddl.js';

/* Casino jackpot (migration 0015). Same shape as the coinflip in worker/casino.js:
   the rules live here and in the triggers of the migration, a client only asks.
   Cards leave a player's inventory when their entry row is inserted and come back
   only through the triggers (a leave, a cancel, or the winner's payout), so they
   are conserved by construction. worker/casino.js hands in the shared stake
   builders (`shared`); this file never imports it, to avoid an import cycle. */

const error = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const parse = value => value ? JSON.parse(value) : null;
const centsToCoins = cents => money((cents || 0) / 100);

// ---- Schema (applied by the Worker itself, see worker/casino.js) ------------
const JACKPOT_OBJECTS = JACKPOT_DDL.map(sql => sql.match(/CREATE (?:UNIQUE )?(?:TABLE|INDEX|TRIGGER) IF NOT EXISTS (\w+)/)[1]);
let jackpotSchemaReady = false;
/** Tests only: forget the per-isolate cache so another database is checked. */
export const resetJackpotSchemaCache = () => { jackpotSchemaReady = false; };
/** Create the jackpot tables and triggers once per isolate (one atomic D1 batch, all IF NOT EXISTS). */
export async function ensureJackpotSchema(env) {
  if (jackpotSchemaReady) return;
  const rows = (await env.DB.prepare(`SELECT name FROM sqlite_master WHERE name IN (${JACKPOT_OBJECTS.map(() => '?').join(',')})`)
    .bind(...JACKPOT_OBJECTS).all()).results || [];
  if (rows.length < JACKPOT_OBJECTS.length) await env.DB.batch(JACKPOT_DDL.map(sql => env.DB.prepare(sql)));
  jackpotSchemaReady = true;
}

// ---- The draw ----------------------------------------------------------------
/** A uniform integer in [0, n) from 53 random bits. The bias is under 1 in 2^20 for any n a pot can reach. */
export function randomBelow(n) {
  const [a, b] = crypto.getRandomValues(new Uint32Array(2));
  return Math.floor(((a * 2 ** 21) + (b >>> 11)) / 2 ** 53 * n);
}
/** The winning seat: each entry's chance is its share of the pot's value. `entries` is [{ seat, value }]. */
export function weightedWinner(entries, below = randomBelow) {
  const total = entries.reduce((sum, e) => sum + e.value, 0);
  let roll = below(total);
  for (const e of entries) { if (roll < e.value) return e.seat; roll -= e.value; }
  return entries[entries.length - 1].seat;
}

// ---- Reading -----------------------------------------------------------------
const ENTRY_SELECT = `SELECT e.*, u.name, u.handle, u.color, u.avatar, u.avatar_style
  FROM jackpot_entries e LEFT JOIN users u ON u.id = e.user_id`;
async function loadEntries(env, ids) {
  const byPot = new Map(ids.map(id => [id, []]));
  if (!ids.length) return byPot;
  const rows = (await env.DB.prepare(`${ENTRY_SELECT} WHERE e.jackpot_id IN (${ids.map(() => '?').join(',')}) ORDER BY e.seat`).bind(...ids).all()).results || [];
  for (const r of rows) byPot.get(r.jackpot_id).push(r);
  return byPot;
}
async function getPot(env, id) {
  const row = await env.DB.prepare('SELECT * FROM jackpots WHERE id = ?').bind(id).first();
  return { row, entries: row ? (await loadEntries(env, [id])).get(id) : [] };
}
const freeSeats = (entries, max) => Array.from({ length: max }, (_, i) => i).filter(i => !entries.some(e => e.seat === i));

const player = e => {
  if (e.bot) {
    const persona = BOT_PERSONAS.find(p => p.id === e.bot_persona) || BOT_PERSONAS[0];
    return { userId: null, bot: true, name: persona.name, handle: `bot:${persona.id}`, color: persona.color, avatar: null, avatarStyle: null };
  }
  return { userId: e.user_id, bot: false, name: e.name || 'Trainer', handle: e.handle || '', color: e.color || 'gold',
    avatar: avatarId(e.avatar), avatarStyle: avatarStyle(e.avatar_style) };
};
const stakeView = stake => (stake || []).map(({ v, ...s }) => ({ ...s, value: centsToCoins(v) }));
/** One pot as the client sees it. Values are coins; `odds` is an entry's share of the pot's value right now (0..1). */
export function viewJackpot(row, entries, now = Date.now()) {
  const open = row.status === 'open';
  const total = entries.reduce((sum, e) => sum + e.value, 0);
  const window = jackpotWindow(row.min_value);
  return { id: row.id, status: open && row.expires_at <= now ? 'expired' : row.status, hostId: row.host_id,
    maxPlayers: row.max_players, seatsOpen: Math.max(0, row.max_players - entries.length),
    entries: entries.map(e => ({ seat: e.seat, player: player(e), stake: stakeView(parse(e.stake)), value: centsToCoins(e.value),
      odds: total ? Math.round(e.value / total * 10000) / 10000 : 0, won: row.status === 'done' && row.winner_seat === e.seat })),
    pot: centsToCoins(total), minValue: centsToCoins(window.min), maxValue: centsToCoins(window.max),
    winnerSeat: row.winner_seat, createdAt: row.created_at, expiresAt: row.expires_at, drawnAt: row.drawn_at };
}

/**
 * Cancel every open pot past its expiry (the triggers hand every human pile
 * back), then draw any pot that filled but was somehow never drawn.
 */
export async function maintainJackpots(env, now = Date.now()) {
  await ensureJackpotSchema(env);
  await env.DB.prepare("UPDATE jackpots SET status = 'cancelled' WHERE status = 'open' AND expires_at <= ?").bind(now).run();
  const stuck = (await env.DB.prepare(`SELECT j.id FROM jackpots j WHERE j.status = 'open'
    AND (SELECT COUNT(*) FROM jackpot_entries e WHERE e.jackpot_id = j.id) >= j.max_players LIMIT 20`).all()).results || [];
  for (const { id } of stuck) await drawPot(env, id, { now });
}

// ---- Writing -----------------------------------------------------------------
const entryInsert = (env, id, seat, userId, persona, stake, value, now) =>
  env.DB.prepare(`INSERT INTO jackpot_entries(jackpot_id, seat, user_id, bot, bot_persona, stake, value, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, seat, userId, persona ? 1 : 0, persona, JSON.stringify(stake), value, now);
/** The draw, guarded so it only lands on the exact table the winner was rolled for (a leave or join in between voids it). */
const drawStatement = (env, id, winnerSeat, now, count, sum) =>
  env.DB.prepare(`UPDATE jackpots SET status = 'done', winner_seat = ?, drawn_at = ?
    WHERE id = ? AND status = 'open' AND expires_at > ?
      AND (SELECT COUNT(*) FROM jackpot_entries WHERE jackpot_id = ?) = ?
      AND (SELECT COALESCE(SUM(value), 0) FROM jackpot_entries WHERE jackpot_id = ?) = ?`)
    .bind(winnerSeat, now, id, now, id, count, id, sum);
const drawWith = (env, id, entries, now) =>
  drawStatement(env, id, weightedWinner(entries), now, entries.length, entries.reduce((s, e) => s + e.value, 0));

/** Draw the pot now if it is full (or `early` and it has enough entries). True when this call drew it. */
async function drawPot(env, id, { early = false, now = Date.now() } = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { row, entries } = await getPot(env, id);
    if (!row || row.status !== 'open' || row.expires_at <= now) return false;
    if (entries.length < row.max_players && !(early && entries.length >= JACKPOT_RULES.earlyDrawMin)) return false;
    const done = await drawWith(env, id, entries, now).run();
    if (done.meta?.changes) return true; // else the table changed under us: read it again
  }
  return false;
}

const raceClash = err => /UNIQUE constraint failed|is full|is over|has expired/.test(err?.message || '');

async function createPot(env, request, helpers, shared, user, body, quick) {
  const requestId = String(body.requestId || '');
  if (!/^[a-zA-Z0-9-]{8,80}$/.test(requestId)) error('Provide a unique requestId.');
  const existing = await env.DB.prepare('SELECT id FROM jackpots WHERE host_id = ? AND request_id = ?').bind(user.id, requestId).first();
  if (existing) return existing.id; // a retry: the cards already moved
  const players = body.players === undefined ? JACKPOT_RULES.defaultPlayers : body.players;
  if (!Number.isInteger(players) || players < JACKPOT_RULES.minPlayers || players > JACKPOT_RULES.maxPlayers) {
    error(`A jackpot seats ${JACKPOT_RULES.minPlayers} to ${JACKPOT_RULES.maxPlayers} players.`);
  }
  if (!quick) {
    const open = await env.DB.prepare("SELECT COUNT(*) AS n FROM jackpots WHERE host_id = ? AND status = 'open'").bind(user.id).first();
    if (open.n >= JACKPOT_RULES.maxOpen) error(`You can host ${JACKPOT_RULES.maxOpen} open jackpots at once. Cancel one first.`, 409);
  }
  const { stake, value, collection } = await shared.buildStake(env, request, helpers, user.id, body.cards, JACKPOT_RULES, 'jackpot');
  const now = Date.now(); const id = crypto.randomUUID();
  const entries = [{ seat: 0, value }];
  const statements = [
    env.DB.prepare(`INSERT INTO jackpots(id, host_id, request_id, max_players, min_value, created_at, expires_at) VALUES(?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, user.id, requestId, players, value, now, now + JACKPOT_RULES.openHours * 3600000),
    entryInsert(env, id, 0, user.id, null, stake, value, now),
  ];
  if (quick) {
    const bots = await botEntries(env, request, helpers, shared, stake, value, players - 1, []);
    bots.forEach((bot, i) => { statements.push(entryInsert(env, id, i + 1, null, bot.persona, bot.stake, bot.value, now)); entries.push({ seat: i + 1, value: bot.value }); });
    statements.push(drawWith(env, id, entries, now));
  }
  statements.push(await shared.binderStatement(env, helpers, user.id, collection, stake,
    { sql: 'AND EXISTS(SELECT 1 FROM jackpot_entries WHERE jackpot_id = ? AND user_id = ?)', args: [id, user.id] }));
  try { await env.DB.batch(statements); }
  catch (err) {
    // A double-tapped create that lost the race: the winner's row is the answer.
    const raced = await env.DB.prepare('SELECT id FROM jackpots WHERE host_id = ? AND request_id = ?').bind(user.id, requestId).first();
    if (raced) return raced.id;
    throw err;
  }
  if (quick) await drawPot(env, id, { now }); // a no-op unless the in-batch draw was voided
  return id;
}

/** `count` bot entries worth a little less than `target` each, every one a persona not in `used`. */
async function botEntries(env, request, helpers, shared, hostStake, target, count, used) {
  const pool = await shared.botPool(env, request, helpers, hostStake);
  const personas = shared.shuffle(BOT_PERSONAS.filter(p => !used.includes(p.id))).slice(0, count);
  return personas.map(persona => {
    const built = shared.buildBotStake(pool, target);
    if (!built) error('The bots could not match that entry. Try a slightly different one.', 409);
    return { persona: persona.id, stake: built.stake, value: built.value };
  });
}

async function joinPot(env, request, helpers, shared, user, id, body) {
  let built = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { row, entries } = await getPot(env, id);
    if (!row) error('Jackpot not found.', 404);
    const now = Date.now();
    if (row.host_id === user.id) error('You are already in your own jackpot.', 409);
    if (entries.some(e => e.user_id === user.id)) return id; // a retry: the entry is in (or the pot has since settled)
    if (row.status !== 'open' || row.expires_at <= now) error('That jackpot is over.', 409);
    const seats = freeSeats(entries, row.max_players);
    if (!seats.length) error('That jackpot is full.', 409);
    built ||= await shared.buildStake(env, request, helpers, user.id, body.cards, JACKPOT_RULES, 'jackpot');
    const { stake, value, collection } = built;
    const { min, max } = jackpotWindow(row.min_value);
    if (value < min || value > max) error(`Put up between ${centsToCoins(min)} and ${centsToCoins(max)} coins of cards to join.`);
    const seat = seats[0]; const all = [...entries, { seat, value }];
    const statements = [entryInsert(env, id, seat, user.id, null, stake, value, now)];
    if (all.length >= row.max_players) statements.push(drawWith(env, id, all, now)); // the last seat: settle in the same transaction
    statements.push(await shared.binderStatement(env, helpers, user.id, collection, stake,
      { sql: 'AND EXISTS(SELECT 1 FROM jackpot_entries WHERE jackpot_id = ? AND user_id = ?)', args: [id, user.id] }));
    try { await env.DB.batch(statements); }
    catch (err) { if (raceClash(err)) continue; throw err; } // someone took the seat first: read the table again
    if (all.length >= row.max_players) await drawPot(env, id, { now }); // a no-op unless the in-batch draw was voided
    return id;
  }
  error('Someone else got there first.', 409);
}

async function leavePot(env, user, id) {
  const { row, entries } = await getPot(env, id);
  if (!row) error('Jackpot not found.', 404);
  if (row.host_id === user.id) error('The host cancels the jackpot instead of leaving it.', 409);
  if (!entries.some(e => e.user_id === user.id)) return id; // nothing to leave (a retry)
  if (row.status === 'cancelled') return id; // the cancel already gave the cards back
  if (row.status !== 'open') error('That jackpot is already settled.', 409);
  const done = await env.DB.prepare(`DELETE FROM jackpot_entries WHERE jackpot_id = ? AND user_id = ?
    AND EXISTS(SELECT 1 FROM jackpots WHERE id = ? AND status = 'open')`).bind(id, user.id, id).run();
  if (!done.meta?.changes) error('That jackpot was just drawn.', 409);
  return id;
}

async function cancelPot(env, user, id) {
  const row = await env.DB.prepare('SELECT host_id, status FROM jackpots WHERE id = ?').bind(id).first();
  if (!row) error('Jackpot not found.', 404);
  if (row.host_id !== user.id) error('Only the host can cancel a jackpot.', 403);
  if (row.status === 'cancelled') return id;
  const done = await env.DB.prepare("UPDATE jackpots SET status = 'cancelled' WHERE id = ? AND host_id = ? AND status = 'open'").bind(id, user.id).run();
  if (!done.meta?.changes) error('That jackpot was already drawn.', 409);
  return id;
}

async function drawEarly(env, user, id) {
  const { row, entries } = await getPot(env, id);
  if (!row) error('Jackpot not found.', 404);
  if (row.host_id !== user.id) error('Only the host can draw a jackpot early.', 403);
  if (row.status !== 'open') error('That jackpot is already settled.', 409);
  if (row.expires_at <= Date.now()) error('That jackpot has expired.', 409);
  if (entries.length < JACKPOT_RULES.earlyDrawMin) error(`Wait for at least ${JACKPOT_RULES.earlyDrawMin} entries before drawing.`, 409);
  if (!await drawPot(env, id, { early: true })) error('That jackpot changed while drawing. Try again.', 409);
  return id;
}

/** The host adds one free bot entry, or with `fill` a bot in every empty seat (needs another human in the pot). */
async function addBots(env, request, helpers, shared, user, id, body) {
  const fill = body.fill === true;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { row, entries } = await getPot(env, id);
    if (!row) error('Jackpot not found.', 404);
    if (row.host_id !== user.id) error('Only the host can add bots.', 403);
    const now = Date.now();
    if (row.status !== 'open' || row.expires_at <= now) error('That jackpot is over.', 409);
    const seats = freeSeats(entries, row.max_players);
    if (!seats.length) error('That jackpot is full.', 409);
    if (fill && !entries.some(e => !e.bot && e.user_id !== row.host_id)) error('Wait for another player before filling the pot with bots.', 409);
    const count = fill ? seats.length : 1;
    const hostStake = parse(entries.find(e => e.seat === 0).stake);
    const bots = await botEntries(env, request, helpers, shared, hostStake, row.min_value, count,
      entries.filter(e => e.bot).map(e => e.bot_persona));
    const added = bots.map((bot, i) => ({ seat: seats[i], ...bot }));
    const all = [...entries, ...added];
    const statements = added.map(b => entryInsert(env, id, b.seat, null, b.persona, b.stake, b.value, now));
    if (all.length >= row.max_players) statements.push(drawWith(env, id, all, now));
    try { await env.DB.batch(statements); }
    catch (err) { if (raceClash(err)) continue; throw err; }
    if (all.length >= row.max_players) await drawPot(env, id, { now });
    return id;
  }
  error('The table changed while adding bots. Try again.', 409);
}

// ---- Routes ------------------------------------------------------------------
const CONFLICT = /no longer have|already settled|has expired|is full|is over|already in|Cancel or leave|cannot be drawn/;
export async function handleJackpots(path, method, request, env, helpers, shared) {
  try {
    await ensureJackpotSchema(env);
    const match = path.match(/^\/api\/casino\/jackpots(?:\/([a-zA-Z0-9-]{1,80}))?(?:\/(join|leave|bot|draw|cancel))?$/);
    if (!match) return helpers.json({ error: 'Not found.' }, 404);
    const [, id, action] = match;
    await maintainJackpots(env);
    if (method === 'GET') {
      if (id === 'quick' || action) return helpers.json({ error: 'Not found.' }, 404);
      const now = Date.now();
      if (id) {
        const { row, entries } = await getPot(env, id);
        if (!row) error('Jackpot not found.', 404);
        return helpers.json({ jackpot: viewJackpot(row, entries, now), serverNow: now });
      }
      const open = (await env.DB.prepare("SELECT * FROM jackpots WHERE status = 'open' AND expires_at > ? ORDER BY created_at DESC LIMIT 40").bind(now).all()).results || [];
      const done = (await env.DB.prepare("SELECT * FROM jackpots WHERE status = 'done' ORDER BY drawn_at DESC LIMIT 20").all()).results || [];
      const entries = await loadEntries(env, [...open, ...done].map(r => r.id));
      let record = null;
      const auth = await helpers.requireUser(request, env);
      if (!auth.response) {
        const r = await env.DB.prepare(`SELECT COUNT(*) AS played, COALESCE(SUM(CASE WHEN j.winner_seat = e.seat THEN 1 ELSE 0 END), 0) AS won
          FROM jackpot_entries e JOIN jackpots j ON j.id = e.jackpot_id WHERE e.user_id = ? AND j.status = 'done'`).bind(auth.user.id).first();
        record = { played: r?.played || 0, won: r?.won || 0 };
      }
      return helpers.json({ open: open.map(r => viewJackpot(r, entries.get(r.id), now)), done: done.map(r => viewJackpot(r, entries.get(r.id), now)),
        record, rules: JACKPOT_RULES, serverNow: now });
    }
    if (method !== 'POST') return helpers.json({ error: 'Not found.' }, 404);
    if (id && id !== 'quick' && !action) return helpers.json({ error: 'Not found.' }, 404);
    if ((!id || id === 'quick') && action) return helpers.json({ error: 'Not found.' }, 404);
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) error('Use this site to play.', 403);
    if (!request.headers.get('content-type')?.includes('application/json')) error('Expected JSON.');
    const auth = await helpers.requireUser(request, env);
    if (auth.response) return auth.response;
    const user = auth.user; const body = await helpers.readJson(request);
    if (!body || typeof body !== 'object') error('Expected JSON.');
    let outId;
    if (!id || id === 'quick') outId = await createPot(env, request, helpers, shared, user, body, id === 'quick');
    else if (action === 'join') outId = await joinPot(env, request, helpers, shared, user, id, body);
    else if (action === 'leave') outId = await leavePot(env, user, id);
    else if (action === 'bot') outId = await addBots(env, request, helpers, shared, user, id, body);
    else if (action === 'draw') outId = await drawEarly(env, user, id);
    else outId = await cancelPot(env, user, id);
    const at = Date.now(); const { row, entries } = await getPot(env, outId);
    return helpers.json({ jackpot: viewJackpot(row, entries, at), save: await helpers.loadSave(env, user.id), serverNow: at });
  } catch (err) {
    if (err.status) throw err;
    const message = err.message || '';
    if (CONFLICT.test(message)) error(message.replace(/^.*?ABORT: ?/, ''), 409);
    if (/not valid|outside the pot|at least one card/.test(message)) error(message.replace(/^.*?ABORT: ?/, ''), 400);
    throw err;
  }
}
