import { PLAYABLE_SETS, ALL_SETS, sellValue } from '../js/catalog.js';
import {
  BETA_RULES, BETA_ADMINS, stakeCents, payoutCents, GRASS, grassMultiplier,
  TINS, TIN_MAX_OPEN, TIN_MAX_LEAN, tinTier, tinWeight, tinReturn, tinLean, tinPrice, isPieceCard,
} from '../js/beta-rules.js';
import { GRADING_LIMITS, bandFor, gradedValueOf } from '../js/grading-rules.js';
import { ensureGradingSchema } from './grading.js';
import { gateResponse } from './gates.js';
import { takeRoll } from './fair.js';
import { grassBoard, tinPicks } from '../js/fair.js';

/* BETA TESTING (/api/casino/beta/...): invite codes, the tester flag, and the games against the house.

   Joining: Noah (BETA_ADMINS, or the Worker var BETA_ADMINS) makes codes; a player enters one once and becomes a beta tester
   (users.beta = 1). Testers get the beta badge, the Beta Tester frame and the games below. Only code holders can play (Noah, 2026-11-26: "games be locked to code holders"); the owner is let in automatically.

   Every game is play coins only. The coins move in one D1 batch with the game row: the stake comes off only when the wallet
   has it, the row is written only when the stake came off, and a payout is credited only while the row is still open, then
   the row closes, so a double tap, a retry or two tabs pay once. Results come from crypto.getRandomValues. The games earn no
   XP and no quest credit (nothing here reports to worker/xp.js or the quests). Tables are made at runtime (no migration). */

const error = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const parse = (value) => { try { return value ? JSON.parse(value) : null; } catch { return null; } };
const coins = (cents) => Math.round(cents) / 100;

// ---- Schema ------------------------------------------------------------------------
export const BETA_DDL = [
  `CREATE TABLE IF NOT EXISTS beta_codes (code TEXT PRIMARY KEY, max_uses INTEGER NOT NULL, uses INTEGER NOT NULL DEFAULT 0,
    note TEXT, created_by TEXT, created_at INTEGER NOT NULL, revoked INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS beta_members (user_id TEXT PRIMARY KEY, code TEXT, joined_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS beta_runs (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, game TEXT NOT NULL, request_id TEXT NOT NULL,
    stake INTEGER NOT NULL, state TEXT NOT NULL, data TEXT, mult REAL NOT NULL DEFAULT 0, payout INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL, ended_at INTEGER, UNIQUE (user_id, request_id))`,
  `CREATE INDEX IF NOT EXISTS beta_runs_user ON beta_runs (user_id, game, created_at)`,
  `CREATE TABLE IF NOT EXISTS rocket_rounds (id INTEGER PRIMARY KEY, crash REAL NOT NULL, launch_at INTEGER NOT NULL,
    pop_at INTEGER NOT NULL, end_at INTEGER NOT NULL, settled INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS rocket_bets (round_id INTEGER NOT NULL, user_id TEXT NOT NULL, stake INTEGER NOT NULL, auto REAL NOT NULL,
    cashed REAL, payout INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL, request_id TEXT NOT NULL, created_at INTEGER NOT NULL,
    PRIMARY KEY (round_id, user_id))`,
];
let schemaReady = false;
export const resetBetaSchemaCache = () => { schemaReady = false; };
export async function ensureBetaSchema(env) {
  if (schemaReady) return;
  await env.DB.batch(BETA_DDL.map((sql) => env.DB.prepare(sql)));
  const info = (await env.DB.prepare('PRAGMA table_info(users)').all()).results || [];
  if (info.length && !info.some((row) => row.name === 'beta')) {
    try { await env.DB.exec('ALTER TABLE users ADD COLUMN beta INTEGER NOT NULL DEFAULT 0;'); }
    catch (err) { if (!String(err?.message || err).toLowerCase().includes('duplicate')) throw err; }
  }
  schemaReady = true;
}

// ---- Randomness -------------------------------------------------------------------------
/** A uniform integer in [0, n), rejection-sampled from 32-bit crypto draws. */
export function randInt(n) {
  const limit = Math.floor(4294967296 / n) * n;
  const draw = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(draw);
    if (draw[0] < limit) return draw[0] % n;
  }
}
/** A uniform real in [0, 1) with 52 bits. */
export const randUnit = () => (randInt(2 ** 26) * 2 ** 26 + randInt(2 ** 26)) / 2 ** 52;
const newId = () => [...crypto.getRandomValues(new Uint8Array(9))].map((b) => b.toString(16).padStart(2, '0')).join('');

// ---- Who may play ---------------------------------------------------------------------
export function isBetaAdmin(env, user) {
  const handle = String(user?.handle || '').toLowerCase();
  if (!handle) return false;
  const extra = String(env?.BETA_ADMINS || '').toLowerCase().split(/[\s,]+/).filter(Boolean);
  return BETA_ADMINS.includes(handle) || extra.includes(handle);
}
const isMember = (user) => Number(user?.beta) === 1;
async function mayPlay(env, helpers, user) {
  if (!isMember(user)) return helpers.json({ error: 'Beta games are for beta testers. Enter an invite code first.', needBeta: true }, 403);
  return gateResponse(env, helpers.json, user.id, 'upgrader');
}

// ---- Codes ---------------------------------------------------------------------------------
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const makeCode = () => `BETA-${Array.from({ length: 6 }, () => CODE_CHARS[randInt(CODE_CHARS.length)]).join('')}`;
export const cleanCode = (raw) => String(raw || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 24);

async function listCodes(env) {
  const rows = (await env.DB.prepare('SELECT code, max_uses, uses, note, created_at, revoked FROM beta_codes ORDER BY created_at DESC LIMIT 200').all()).results || [];
  return rows.map((r) => ({ code: r.code, maxUses: r.max_uses, uses: r.uses, note: r.note || '', createdAt: r.created_at, revoked: Boolean(r.revoked) }));
}

// ---- Money ---------------------------------------------------------------------------------
const takeStake = (env, cents, userId) =>
  env.DB.prepare('UPDATE profiles SET coins = ROUND(coins - ?1 / 100.0, 2) WHERE user_id = ?2 AND coins >= ?1 / 100.0').bind(cents, userId);
/** Credit `cents` only when the previous statement in the batch changed a row. */
const payIfChanged = (env, cents, userId) =>
  env.DB.prepare('UPDATE profiles SET coins = ROUND(coins + ?1 / 100.0, 2) WHERE user_id = ?2 AND ?1 > 0 AND changes() = 1').bind(cents, userId);
/** Credit `cents` while run `id` is still open (with this exact data), then close it: two taps pay once. */
const cashOut = (env, run, state, cents, mult, data, now) => [
  env.DB.prepare(`UPDATE profiles SET coins = ROUND(coins + ?1 / 100.0, 2) WHERE user_id = ?2 AND ?1 > 0
    AND EXISTS (SELECT 1 FROM beta_runs WHERE id = ?3 AND state = 'open' AND data = ?4)`).bind(cents, run.user_id, run.id, run.data),
  env.DB.prepare(`UPDATE beta_runs SET state = ?1, payout = ?2, mult = ?3, data = ?4, ended_at = ?5 WHERE id = ?6 AND state = 'open' AND data = ?7`)
    .bind(state, cents, mult, data, now, run.id, run.data),
];

async function readStake(body) {
  const cents = stakeCents(body?.stake);
  if (cents == null) error(`Stake between ${BETA_RULES.minStake} and ${BETA_RULES.maxStake.toLocaleString('en-US')} coins.`);
  return cents;
}
const readRequestId = (body) => {
  const id = String(body?.requestId || '');
  if (!/^[a-zA-Z0-9-]{8,64}$/.test(id)) error('Missing request id.');
  return id;
};
const byRequest = (env, userId, requestId) => env.DB.prepare('SELECT * FROM beta_runs WHERE user_id = ? AND request_id = ?').bind(userId, requestId).first();
const getRun = (env, id, userId) => env.DB.prepare('SELECT * FROM beta_runs WHERE id = ? AND user_id = ?').bind(id, userId).first();

/** Start a run: stake off, row in, and (for one-shot games) the payout and a card, all in one batch. */
async function startRun(env, helpers, user, game, requestId, stake, data, { state = 'open', payout = 0, mult = 0, card = null, extra = null } = {}) {
  const existing = await byRequest(env, user.id, requestId);
  if (existing) return existing;
  const id = newId();
  const now = Date.now();
  const sts = [
    takeStake(env, stake, user.id),
    env.DB.prepare(`INSERT INTO beta_runs (id, user_id, game, request_id, stake, state, data, mult, payout, created_at, ended_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE changes() = 1`)
      .bind(id, user.id, game, requestId, stake, state, JSON.stringify(data), mult, payout, now, state === 'open' ? null : now),
  ];
  if (card) {
    sts.push(env.DB.prepare(`INSERT INTO cards (user_id, card_id, qty, reverse_qty) SELECT ?, ?, 1, 0 WHERE changes() = 1
      ON CONFLICT(user_id, card_id) DO UPDATE SET qty = cards.qty + 1`).bind(user.id, card));
  }
  if (payout > 0) sts.push(payIfChanged(env, payout, user.id));
  // Rows that land only with the run (the fair log): guarded on the run existing.
  if (extra) sts.push(...extra(id));
  let results;
  try {
    results = await env.DB.batch(sts);
  } catch (err) {
    const again = await byRequest(env, user.id, requestId);
    if (again) return again;
    throw err;
  }
  if (!results[1]?.meta?.changes) error('Not enough coins.');
  return getRun(env, id, user.id);
}

const recent = async (env, userId, game) =>
  ((await env.DB.prepare('SELECT * FROM beta_runs WHERE user_id = ? AND game = ? AND state != ? ORDER BY created_at DESC LIMIT 8').bind(userId, game, 'open').all()).results || []);

const respond = async (helpers, env, user, extra) => {
  const save = await helpers.loadSave(env, user.id);
  return helpers.json({ ...extra, save, coins: save?.coins, serverNow: Date.now() });
};

// ---- Tall Grass ------------------------------------------------------------------------
export function viewGrass(row, reveal = false) {
  if (!row) return null;
  const d = parse(row.data) || {};
  const done = row.state !== 'open';
  const safe = (d.open || []).length;
  return { id: row.id, game: 'grass', state: row.state, stake: coins(row.stake), mines: d.mines, open: d.open || [], hit: d.hit ?? null,
    voltorb: done || reveal ? d.board : null, mult: done ? row.mult : grassMultiplier(d.mines, safe),
    next: done ? null : grassMultiplier(d.mines, safe + 1), payout: coins(row.payout), createdAt: row.created_at };
}
async function grass(env, helpers, user, action, body, method) {
  if (method === 'GET') {
    const open = await env.DB.prepare("SELECT * FROM beta_runs WHERE user_id = ? AND game = 'grass' AND state = 'open' ORDER BY created_at DESC LIMIT 1").bind(user.id).first();
    return helpers.json({ run: viewGrass(open), recent: (await recent(env, user.id, 'grass')).map((r) => viewGrass(r)), serverNow: Date.now() });
  }
  const gate = await mayPlay(env, helpers, user);
  if (gate) return gate;
  const now = Date.now();
  if (action === 'start') {
    const mines = Number(body?.mines);
    if (!Number.isInteger(mines) || mines < GRASS.minMines || mines > GRASS.maxMines) error(`Pick ${GRASS.minMines} to ${GRASS.maxMines} Voltorb.`);
    const open = await env.DB.prepare("SELECT 1 FROM beta_runs WHERE user_id = ? AND game = 'grass' AND state = 'open'").bind(user.id).first();
    if (open) error('Finish the patch you are in first.', 409);
    const stake = await readStake(body);
    const requestId = readRequestId(body);
    const again = await byRequest(env, user.id, requestId);
    if (again) return respond(helpers, env, user, { run: viewGrass(again) });
    // The board is the next nonce of the player's seeds (worker/fair.js), drawn before the first tap.
    const fair = await takeRoll(env, user.id);
    const board = grassBoard(fair.stream, GRASS.tiles, mines);
    const row = await startRun(env, helpers, user, 'grass', requestId, stake, { mines, board, open: [] }, {
      extra: (id) => [fair.log('grass', id, { mines }, { board }, Date.now(), { sql: 'EXISTS(SELECT 1 FROM beta_runs WHERE id = ?)', args: [id] })] });
    return respond(helpers, env, user, { run: viewGrass(row) });
  }
  const run = await getRun(env, String(body?.id || ''), user.id);
  if (!run || run.game !== 'grass') error('Run not found.', 404);
  if (run.state !== 'open') return respond(helpers, env, user, { run: viewGrass(run) });
  const d = parse(run.data);
  if (action === 'tap') {
    const tile = Number(body?.tile);
    if (!Number.isInteger(tile) || tile < 0 || tile >= GRASS.tiles) error('Pick a tile.');
    if (d.open.includes(tile)) return respond(helpers, env, user, { run: viewGrass(run) });
    if (d.board.includes(tile)) {
      const data = JSON.stringify({ ...d, hit: tile });
      await env.DB.prepare("UPDATE beta_runs SET state = 'lost', data = ?, mult = 0, ended_at = ? WHERE id = ? AND state = 'open' AND data = ?").bind(data, now, run.id, run.data).run();
    } else {
      const open = [...d.open, tile];
      const data = JSON.stringify({ ...d, open });
      const mult = grassMultiplier(d.mines, open.length);
      const pay = payoutCents(run.stake, mult);
      // The last clear tile, or the cap, cashes out on its own.
      if (open.length === GRASS.tiles - d.mines || pay >= BETA_RULES.maxWin * 100) await env.DB.batch(cashOut(env, run, 'cashed', pay, mult, data, now));
      else await env.DB.prepare("UPDATE beta_runs SET data = ? WHERE id = ? AND state = 'open' AND data = ?").bind(data, run.id, run.data).run();
    }
    return respond(helpers, env, user, { run: viewGrass(await getRun(env, run.id, user.id)) });
  }
  if (action === 'cash') {
    if (!d.open.length) error('Clear at least one tile first.');
    const mult = grassMultiplier(d.mines, d.open.length);
    await env.DB.batch(cashOut(env, run, 'cashed', payoutCents(run.stake, mult), mult, run.data, now));
    return respond(helpers, env, user, { run: viewGrass(await getRun(env, run.id, user.id)) });
  }
  error('Not found.', 404);
}

// ---- Retired games --------------------------------------------------------------------------
/* Higher or Lower and Poké Ball Drop were removed on 2026-11-26 (Noah). A drop settled in one call, but a Higher or
   Lower run could be left open with a stake in it: the next time its player calls the beta, it is cashed out at the
   multiplier it had reached (1x before the first right guess, so at least the stake comes back). */
async function settleRetired(env, user) {
  const { results } = await env.DB.prepare("SELECT * FROM beta_runs WHERE user_id = ? AND game = 'higher' AND state = 'open'").bind(user.id).all();
  for (const run of results || []) {
    const mult = Math.max(1, Number(parse(run.data)?.mult) || 1);
    await env.DB.batch(cashOut(env, run, 'cashed', payoutCents(run.stake, mult), mult, run.data, Date.now()));
  }
}

const cardBrief = (c, cents) => ({ id: c.id, name: c.name, image: c.imageSmall || c.image, number: c.number ?? null, rarity: c.rarity ?? null, price: coins(cents) });
async function pricedCards(env, helpers, request, set) {
  const cards = await helpers.loadSetCards(env, request, set);
  return cards.filter((c) => typeof c.market === 'number' && c.market > 0 && c.image && !String(c.id).startsWith('energy-'))
    .map((c) => ({ card: c, cents: Math.round(sellValue(c) * 100) }));
}
// ---- Mystery Tins ------------------------------------------------------------------------
let tinCache = { at: 0, tins: null };
/** Every tin with what is inside, the odds and the price. A tin's price is fixed (TINS); the lean of its odds is solved here so
    that its shelf's share of the price comes back on average, valued like selling (a slab at what the slab sells for). */
export async function loadTins(env, helpers, request) {
  if (tinCache.tins && Date.now() - tinCache.at < 10 * 60 * 1000) return tinCache.tins;
  const out = [];
  for (const tin of TINS) {
    const seen = new Set();
    const cards = [];
    for (const id of tin.sets) {
      const set = ALL_SETS.find((s) => s.id === id);
      if (!set) continue;
      for (const p of await pricedCards(env, helpers, request, set)) {
        if (seen.has(p.card.id)) continue;
        if (p.card.energy || p.card.supertype === 'Energy') continue;
        if (isPieceCard(p.card)) continue;
        if (tin.names && !tin.names.test(p.card.name || '')) continue;
        if (tin.types && !(p.card.supertype === 'Pokémon' && tin.types.some((t) => p.card.types?.includes(t)))) continue;
        if (tin.kind === 'supporter' && !(p.card.supertype === 'Trainer' && p.card.subtypes?.includes('Supporter'))) continue;
        if (tin.kind === 'tagteam' && !p.card.subtypes?.some((x) => /tag team/i.test(x))) continue;
        if (tin.hits && /^(common|uncommon)$/i.test(p.card.rarity || '')) continue;
        if (tin.min && p.cents < tin.min * 100) continue;
        if (tin.gap && p.cents > tin.gap[0] * 100 && p.cents < tin.gap[1] * 100) continue;
        seen.add(p.card.id);
        if (!tin.slab) { cards.push({ ...cardBrief(p.card, p.cents), cents: p.cents, setName: set.name }); continue; }
        // A slab tin: the card once per grade, each worth what that slab sells for.
        const band = bandFor(set);
        for (const grade of tin.slab) {
          const cents = Math.round(gradedValueOf(p.cents / 100, p.card.id, grade, set) * 100);
          cards.push({ ...cardBrief(p.card, cents), cents, setName: set.name, grade, band: band.id });
        }
      }
    }
    if (cards.length < 5) continue;
    const tier = tinTier(tin.tier);
    const back = Math.min(BETA_RULES.tinMaxEdge, tin.back || tier.back);
    const values = cards.map((c) => c.cents);
    let price = Math.round(tin.price * 100);
    let pow = tinLean(values, price * back);
    // The cheapest cards alone return more than the share: the price goes up, never the payback.
    if (pow == null) { pow = TIN_MAX_LEAN; price = Math.max(price, tinPrice(tinReturn(values, pow), back)); }
    const total = cards.reduce((s, c) => s + tinWeight(c.cents, pow), 0);
    let ev = 0;
    for (const c of cards) { c.odds = tinWeight(c.cents, pow) / total; ev += c.odds * c.cents; }
    cards.sort((a, b) => b.cents - a.cents);
    out.push({ id: tin.id, name: tin.name, line: tin.line || '', color: tin.color || '', tier: tier.id, slab: Boolean(tin.slab), price, ev, cards });
  }
  tinCache = { at: Date.now(), tins: out };
  return out;
}
export const resetTinCache = () => { tinCache = { at: 0, tins: null }; };
const viewTinRun = (row) => {
  const d = parse(row.data) || {};
  return { id: row.id, game: 'tins', tin: d.tin, tinName: d.tinName, card: d.card, price: coins(row.stake), createdAt: row.created_at };
};
// `risk` is for a page loaded before the shelves: it only knew the high roller shelf.
const publicTin = (t) => ({ id: t.id, name: t.name, line: t.line, color: t.color, tier: t.tier, slab: t.slab, risk: t.tier === 'roller' ? 'high' : '', back: Math.round((t.ev / t.price) * 1000) / 1000, price: coins(t.price), cards: t.cards.map(({ cents, band, ...c }) => c) });
async function tins(env, helpers, user, action, body, method, request) {
  const list = await loadTins(env, helpers, request);
  if (method === 'GET') return helpers.json({ tins: list.map(publicTin), recent: (await recent(env, user.id, 'tins')).map(viewTinRun), serverNow: Date.now() });
  if (action !== 'open') error('Not found.', 404);
  const gate = await mayPlay(env, helpers, user);
  if (gate) return gate;
  const tin = list.find((t) => t.id === body?.tin);
  if (!tin) error('Pick a tin.');
  const requestId = readRequestId(body);
  // Price check: the page shows a price; refuse if it moved since (prices update daily).
  if (body?.price != null && Math.round(Number(body.price) * 100) !== tin.price) error('The price just changed. Look again.', 409);
  // Up to TIN_MAX_OPEN tins in one go: one payment, one roll each, all or nothing.
  const count = body?.count == null ? 1 : Number(body.count);
  if (!Number.isInteger(count) || count < 1 || count > TIN_MAX_OPEN) error(`Open between 1 and ${TIN_MAX_OPEN} tins at a time.`);
  const ids = Array.from({ length: count }, (_, i) => (i ? `${requestId}-${i}` : requestId));
  const mine = async () => {
    const rows = [];
    for (const id of ids) { const row = await byRequest(env, user.id, id); if (row) rows.push(row); }
    return rows;
  };
  let rows = await mine();
  if (!rows.length && tin.slab) {
    // A slab tin fills the player's case, which holds so many.
    await ensureGradingSchema(env);
    const have = await env.DB.prepare("SELECT COUNT(*) AS n FROM graded_cards WHERE user_id = ? AND status = 'slabbed'").bind(user.id).first();
    if (Number(have?.n || 0) + count > GRADING_LIMITS.maxSlabs) error(`You can keep ${GRADING_LIMITS.maxSlabs} slabs at once. Crack or sell one first.`, 409);
  }
  if (!rows.length) {
    const now = Date.now();
    const sts = [takeStake(env, tin.price * count, user.id)];
    // One nonce of the player's seeds for the whole opening, one draw per tin in order (worker/fair.js).
    const fair = await takeRoll(env, user.id);
    const odds = tin.cards.map((c) => c.odds);
    const picks = tinPicks(fair.stream, odds, count);
    ids.forEach((rid, t) => {
      const pick = tin.cards[picks[t]];
      const { cents, odds, band, ...card } = pick;
      // Each statement runs only if the one before it changed a row, so nothing lands unless the payment did.
      sts.push(env.DB.prepare(`INSERT INTO beta_runs (id, user_id, game, request_id, stake, state, data, mult, payout, created_at, ended_at)
        SELECT ?, ?, 'tins', ?, ?, 'won', ?, ?, 0, ?, ? WHERE changes() = 1`)
        .bind(newId(), user.id, rid, tin.price, JSON.stringify({ tin: tin.id, tinName: tin.name, card: { ...card, odds } }), cents / tin.price, now, now));
      // A slab is minted like one won from the house anywhere else in the casino: no fee, no guard, request id 'casino:...'
      // (so it earns no grading XP or quest credit), and unique per owner, so a replay can never mint twice.
      if (card.grade) sts.push(env.DB.prepare(`INSERT INTO graded_cards (user_id, card_id, reverse, grade, band, fee_cents, request_id, guard, status, created_at, shown, locked, black_label)
        SELECT ?, ?, 0, ?, ?, 0, ?, NULL, 'slabbed', ?, 0, NULL, 0 WHERE changes() = 1`).bind(user.id, card.id, card.grade, band, `casino:tins:${rid}:0`, now));
      else sts.push(env.DB.prepare(`INSERT INTO cards (user_id, card_id, qty, reverse_qty) SELECT ?, ?, 1, 0 WHERE changes() = 1
        ON CONFLICT(user_id, card_id) DO UPDATE SET qty = cards.qty + 1`).bind(user.id, card.id));
    });
    // Last, and only if the payment landed (the run rows exist).
    sts.push(fair.log('tins', requestId, { tin: tin.id, odds, count }, { picks, cards: picks.map((i) => tin.cards[i].name) }, now,
      { sql: 'EXISTS(SELECT 1 FROM beta_runs WHERE user_id = ? AND request_id = ?)', args: [user.id, requestId] }));
    try {
      await env.DB.batch(sts);
    } catch (err) {
      if (!(await mine()).length) throw err; // the same tap sent twice: the first one's rows stand
    }
    rows = await mine();
    if (!rows.length) error('Not enough coins.');
  }
  const runs = rows.map(viewTinRun);
  return respond(helpers, env, user, { run: runs[0], runs });
}

// ---- Rayquaza (taken down 2026-11-28) ------------------------------------------------------
/* The shared crash round ("rocket" in the tables) was removed from the site on Noah's word. Its tables stay as the
   record of every round and bet. Nothing new can be bet. Any round the removal left unsettled is closed out once:
   a round that had already ended pays the auto cash-outs it reached and loses the rest, as it always did; a round
   still in its betting window or in the air gives every open bet its stake back. */
async function closeRocket(env) {
  const now = Date.now();
  const left = (await env.DB.prepare('SELECT * FROM rocket_rounds WHERE settled = 0 LIMIT 20').all()).results || [];
  for (const r of left) {
    if (r.pop_at <= now) { await settleRound(env, r); continue; }
    await env.DB.batch([
      env.DB.prepare(`UPDATE profiles SET coins = ROUND(coins + COALESCE((SELECT SUM(b.stake) FROM rocket_bets b
          WHERE b.round_id = ?1 AND b.user_id = profiles.user_id AND b.status = 'open'), 0) / 100.0, 2)
        WHERE user_id IN (SELECT user_id FROM rocket_bets WHERE round_id = ?1 AND status = 'open')
          AND EXISTS (SELECT 1 FROM rocket_rounds WHERE id = ?1 AND settled = 0)`).bind(r.id),
      env.DB.prepare("UPDATE rocket_bets SET status = 'refunded', payout = stake WHERE round_id = ? AND status = 'open'").bind(r.id),
      env.DB.prepare('UPDATE rocket_rounds SET settled = 1 WHERE id = ?').bind(r.id),
    ]);
  }
}
/** Pay every open bet whose auto cash-out the round reached, lose the rest, once. */
function settleRound(env, r) {
  return env.DB.batch([
    env.DB.prepare(`UPDATE profiles SET coins = ROUND(coins + COALESCE((SELECT SUM(MIN(?1, CAST(b.stake * b.auto AS INTEGER))) FROM rocket_bets b
        WHERE b.round_id = ?2 AND b.user_id = profiles.user_id AND b.status = 'open' AND b.auto <= ?3), 0) / 100.0, 2)
      WHERE user_id IN (SELECT user_id FROM rocket_bets WHERE round_id = ?2 AND status = 'open' AND auto <= ?3)
        AND EXISTS (SELECT 1 FROM rocket_rounds WHERE id = ?2 AND settled = 0)`).bind(BETA_RULES.maxWin * 100, r.id, r.crash),
    env.DB.prepare(`UPDATE rocket_bets SET status = CASE WHEN auto <= ?2 THEN 'won' ELSE 'lost' END,
        cashed = CASE WHEN auto <= ?2 THEN auto ELSE NULL END,
        payout = CASE WHEN auto <= ?2 THEN MIN(?3, CAST(stake * auto AS INTEGER)) ELSE 0 END
      WHERE round_id = ?1 AND status = 'open'`).bind(r.id, r.crash, BETA_RULES.maxWin * 100),
    env.DB.prepare('UPDATE rocket_rounds SET settled = 1 WHERE id = ?').bind(r.id),
  ]);
}

// ---- Router ------------------------------------------------------------------------------
const GAMES = { grass, tins };
export async function handleBeta(path, method, request, env, helpers) {
  const m = path.match(/^\/api\/casino\/beta(?:\/([a-z]+))?(?:\/([a-z]+))?$/);
  if (!m) return helpers.json({ error: 'Not found.' }, 404);
  const [, part, action] = m;
  try {
    await ensureBetaSchema(env);
    const auth = await helpers.requireUser(request, env);
    if (auth.response) return auth.response;
    const user = auth.user;
    let body = null;
    if (method === 'POST') {
      const origin = request.headers.get('origin');
      if (origin && origin !== new URL(request.url).origin) error('Use this site to play.', 403);
      body = await helpers.readJson(request);
      if (!body) error('Expected JSON.');
    } else if (method !== 'GET') error('Not found.', 404);
    const admin = isBetaAdmin(env, user);
    // The owner always has the beta (Noah, 2026-11-26: he could not get in with a code as @polar): joined once, with the badge and frame.
    if (admin && !isMember(user)) {
      await env.DB.batch([
        env.DB.prepare("INSERT OR IGNORE INTO beta_members (user_id, code, joined_at) VALUES (?, 'OWNER', ?)").bind(user.id, Date.now()),
        env.DB.prepare('UPDATE users SET beta = 1 WHERE id = ?').bind(user.id),
      ]);
      user.beta = 1;
    }

    await settleRetired(env, user);
    await closeRocket(env);
    if (part === 'rocket') error('Rayquaza has been taken down.', 410);
    if (!part) {
      if (method !== 'GET') error('Not found.', 404);
      return helpers.json({ member: isMember(user), admin, codes: admin ? await listCodes(env) : null, rules: BETA_RULES, serverNow: Date.now() });
    }
    if (part === 'join' && method === 'POST' && !action) {
      if (isMember(user)) return helpers.json({ member: true, already: true });
      const code = cleanCode(body.code);
      if (!code) error('Enter your invite code.');
      const now = Date.now();
      const res = await env.DB.batch([
        env.DB.prepare(`UPDATE beta_codes SET uses = uses + 1 WHERE code = ?1 AND revoked = 0 AND uses < max_uses
          AND NOT EXISTS (SELECT 1 FROM beta_members WHERE user_id = ?2)`).bind(code, user.id),
        env.DB.prepare('INSERT INTO beta_members (user_id, code, joined_at) SELECT ?, ?, ? WHERE changes() = 1').bind(user.id, code, now),
        env.DB.prepare('UPDATE users SET beta = 1 WHERE id = ? AND EXISTS (SELECT 1 FROM beta_members WHERE user_id = ?)').bind(user.id, user.id),
      ]);
      if (!res[1]?.meta?.changes) {
        const row = await env.DB.prepare('SELECT revoked, uses, max_uses FROM beta_codes WHERE code = ?').bind(code).first();
        error(!row || row.revoked ? 'That code does not work.' : 'That code has been used up.');
      }
      return helpers.json({ member: true, joined: true });
    }
    if (part === 'codes') {
      if (!admin) error('Only the site owner makes codes.', 403);
      if (method === 'GET' && !action) return helpers.json({ codes: await listCodes(env) });
      if (method === 'POST' && !action) {
        const count = Math.trunc(Number(body.count ?? 1));
        const uses = Math.trunc(Number(body.uses ?? 1));
        if (!(count >= 1 && count <= 20)) error('Make 1 to 20 codes at a time.');
        if (!(uses >= 1 && uses <= 500)) error('Each code works 1 to 500 times.');
        const note = String(body.note || '').trim().slice(0, 60);
        const now = Date.now();
        const made = [];
        for (let i = 0; i < count; i++) {
          const code = makeCode();
          const r = await env.DB.prepare('INSERT OR IGNORE INTO beta_codes (code, max_uses, note, created_by, created_at) VALUES (?, ?, ?, ?, ?)').bind(code, uses, note, user.id, now).run();
          if (r?.meta?.changes) made.push(code);
        }
        return helpers.json({ made, codes: await listCodes(env) });
      }
      if (method === 'POST' && action === 'revoke') {
        await env.DB.prepare('UPDATE beta_codes SET revoked = 1 WHERE code = ?').bind(cleanCode(body.code)).run();
        return helpers.json({ codes: await listCodes(env) });
      }
      error('Not found.', 404);
    }
    const game = GAMES[part];
    if (!game) error('Not found.', 404);
    if (!isMember(user)) return helpers.json({ error: 'Beta games are for beta testers. Enter an invite code first.', needBeta: true }, 403);
    return await game(env, helpers, user, action || '', body, method, request);
  } catch (err) {
    if (err?.status) return helpers.json({ error: err.message }, err.status);
    console.error('beta', err);
    return helpers.json({ error: 'Something went wrong. Try again.' }, 500);
  }
}
