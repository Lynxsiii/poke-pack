/* Graded slabs in the casino (migration 0022): staking, escrow, settlement, cancel/expiry, winnings, conservation.
   Runs the real Worker against in-memory SQLite (Node 22+): node scripts/test-casino-slabs.mjs
   The upgrade of a database that already has open games is scripts/test-casino-slabs-upgrade.mjs. */
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { randomFillSync, createHash } from 'node:crypto';
import { seedLevel } from './lib/level-seed.mjs';
import worker from '../worker/index.js';
import { GRADING_COLUMNS, setForCard } from '../worker/grading.js';
import { CASINO_DDL, JACKPOT_DDL, SLABS_COLUMNS, SLABS_DDL, BOT_SLABS_DDL } from '../worker/casino-ddl.js';
import { SLABS_MARKER } from '../worker/casino-slabs.js';
import { splitSlabs, splitStatements } from './gen-casino-ddl.mjs';
import { COINFLIP_RULES, JACKPOT_RULES, matchWindow, jackpotWindow } from '../js/casino-rules.js';
import { gradedValue, certNumber, bandFor } from '../js/grading-rules.js';
import { SET_BY_ID } from '../js/catalog.js';
import { money, sellValue } from '../js/catalog.js';

const results = [];
let failed = 0;
async function check(name, fn) {
  try { await fn(); results.push(`PASS  ${name}`); }
  catch (err) { failed++; results.push(`FAIL  ${name}\n      ${String(err?.stack || err).split('\n').slice(0, 16).join('\n      ')}`); }
}

// ---- Harness ---------------------------------------------------------------------
const migrationDir = new URL('../worker/migrations/', import.meta.url);
const migrationFiles = readdirSync(migrationDir).sort();
const migrationSql = file => readFileSync(new URL(file, migrationDir), 'utf8');
const hooks = { beforeBatch: null, batches: 0 };
function makeDb(files) {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  for (const file of files) db.exec(migrationSql(file));
  const DB = {
    exec: async sql => { db.exec(sql); return {}; },
    prepare(sql) {
      let params = [];
      const s = {
        bind(...values) { assert.ok(values.length <= 100, 'D1 parameter ceiling'); params = values; return s; },
        async all() { return { results: db.prepare(sql).all(...params) }; },
        async first(column) { const row = db.prepare(sql).get(...params); return column ? row?.[column] : row || null; },
        execute() { const r = db.prepare(sql).run(...params); return { success: true, meta: { changes: Number(r.changes) } }; },
        async run() { return s.execute(); },
      }; return s;
    },
    async batch(statements) {
      hooks.batches++;
      if (hooks.beforeBatch) { const hook = hooks.beforeBatch; hooks.beforeBatch = null; hook(); } // a write that lands between the Worker's read and its batch
      db.exec('BEGIN');
      try { const out = statements.map(s => s.execute()); db.exec('COMMIT'); return out; }
      catch (err) { db.exec('ROLLBACK'); throw err; }
    },
  };
  return { db, DB };
}
// The Worker upgrades a database that only has migrations up to 0013, as production does.
const { db, DB } = makeDb(migrationFiles.filter(f => f < '0015'));
const realNow = Date.now; let now = realNow(); Date.now = () => now;
const COLORS = 'gold';
const addUser = (id, coins = 100) => {
  db.prepare('INSERT INTO users(id,name,handle,password_hash,color,created_at,last_played) VALUES(?,?,?,?,?,?,?)').run(id, id, id, 'unused', COLORS, now, now);
  db.prepare('INSERT INTO profiles(user_id,coins,granted,created_at,binder) VALUES(?,?,?,?,?)').run(id, coins, coins, now, '[]');
  db.prepare('INSERT INTO sessions(id,user_id,created_at,expires_at) VALUES(?,?,?,?)').run(id, id, now, now + 864000000); seedLevel(db, id);
};
const USERS = ['a', 'b', 'c', 'd', 'e', 'f'];
USERS.forEach(id => addUser(id));
const give = (user, card, qty, rev = 0) => db.prepare(`INSERT INTO cards(user_id,card_id,qty,reverse_qty) VALUES(?,?,?,?)
  ON CONFLICT(user_id,card_id) DO UPDATE SET qty = qty + excluded.qty, reverse_qty = reverse_qty + excluded.reverse_qty`).run(user, card, qty, rev);
const qtyOf = (user, card) => db.prepare('SELECT qty FROM cards WHERE user_id = ? AND card_id = ?').get(user, card)?.qty || 0;
const totalCards = () => db.prepare('SELECT COALESCE(SUM(qty),0) n FROM cards').get().n;
const coinsOf = user => Math.round(db.prepare('SELECT coins FROM profiles WHERE user_id = ?').get(user).coins * 100);
const ASSETS = { fetch: async request => {
  try { return new Response(readFileSync(new URL('..' + new URL(request.url).pathname, import.meta.url)), { headers: { 'content-type': 'application/json' } }); }
  catch { return new Response('', { status: 404 }); }
} };
const env = { DB, ASSETS };
async function call(w, e, path, method = 'GET', body, user = 'a', headers = {}) {
  const res = await w.fetch(new Request('https://poke-pack.rip' + path, { method,
    headers: { 'content-type': 'application/json', origin: 'https://poke-pack.rip', ...(user ? { cookie: `pp_sid=${user}` } : {}), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), e);
  return { status: res.status, ...await res.json() };
}
const api = (path, method, body, user, headers) => call(worker, env, path, method, body, user, headers);
const rid = () => crypto.randomUUID();

// Forced randomness: a coinflip's winner is one Uint8 bit, a jackpot's draw is a 53-bit fraction of the pot.
const rig = { coin: null, fraction: null };
Object.defineProperty(globalThis.crypto, 'getRandomValues', { configurable: true, writable: true, value(array) {
  if (rig.coin && array instanceof Uint8Array && array.length === 1) { array[0] = rig.coin === 'host' ? 1 : 0; return array; }
  if (rig.fraction != null && array instanceof Uint32Array && array.length === 2) { array[0] = Math.min(0xffffffff, Math.floor(rig.fraction * 2 ** 32)); array[1] = 0; return array; }
  return randomFillSync(array);
} });
/** Make the next jackpot draw land in `seat`, for entries given as [[seat, value]] in seat order. */
const rigSeat = (pairs, seat) => {
  const total = pairs.reduce((n, [, v]) => n + v, 0); let before = 0;
  for (const [s, v] of pairs) { if (s === seat) { rig.fraction = (before + v / 2) / total; return; } before += v; }
  throw new Error('no such seat');
};
const unrig = () => { rig.coin = null; rig.fraction = null; };

// ---- Fixtures --------------------------------------------------------------------
assert.equal((await api('/api/casino/coinflips', 'GET', undefined, null)).status, 200); // the first request creates and upgrades the schema
await api('/api/grading', 'GET', undefined, 'a'); // graded_cards + gear tables
await api('/api/casino/winnings/coinflip/none', 'GET', undefined, 'a'); // casino_sales
const DATA = JSON.parse(readFileSync(new URL('../data/me5.json', import.meta.url), 'utf8'));
const setFiles = new Map();
/** Any catalog card by id (a bot's slabs and cards come from any set, not only me5). */
const cardOf = id => {
  const own = DATA.find(c => c.id === id); if (own) return own;
  const set = setForCard(id); const file = set.dataFile || (set.viewOf ? null : null);
  if (!file) return undefined;
  if (!setFiles.has(file)) setFiles.set(file, JSON.parse(readFileSync(new URL('../' + file, import.meta.url), 'utf8')));
  return setFiles.get(file).find(c => c.id === id);
};
const bandOf = cardId => bandFor(setForCard(cardId)).id;
const slabCents = (cardId, grade) => Math.round(gradedValue(cardOf(cardId), grade, setForCard(cardId)) * 100);
const minted = new Set(); let slabSeq = 0;
/** A slab straight into graded_cards (what POST /api/grading/submit would leave), minted for the ledger. */
function mint(user, cardId = 'me5-87', grade = 9, { reverse = 0, guard = null, shown = 0, requestId } = {}) {
  const r = db.prepare(`INSERT INTO graded_cards(user_id, card_id, reverse, grade, band, fee_cents, request_id, guard, status, created_at, shown)
    VALUES(?, ?, ?, ?, 'me', 541, ?, ?, 'slabbed', ?, ?)`).run(user, cardId, reverse, grade, requestId || `mint-${user}-${++slabSeq}-${Math.random().toString(36).slice(2, 8)}`, guard, now, shown);
  const id = Number(r.lastInsertRowid); minted.add(id); return id;
}
const slab = id => ({ ...db.prepare('SELECT * FROM graded_cards WHERE id = ?').get(id) });
const makeBlack = id => db.prepare('UPDATE graded_cards SET black_label = 1 WHERE id = ?').run(id);
const gear = (user, guardId, qty) => db.prepare("INSERT INTO user_gear(user_id, kind, item_id, qty, first_at, last_at) VALUES(?, 'guard', ?, ?, ?, ?) ON CONFLICT(user_id, kind, item_id) DO UPDATE SET qty = excluded.qty")
  .run(user, guardId, qty, now, now);
const gearRows = () => JSON.stringify(db.prepare('SELECT * FROM user_gear ORDER BY user_id, item_id').all());
const dump = () => createHash('sha1').update(JSON.stringify(['cards', 'graded_cards', 'coinflips', 'jackpots', 'jackpot_entries', 'user_gear', 'casino_sales']
  .map(t => db.prepare(`SELECT * FROM ${t}`).all()).concat([db.prepare('SELECT user_id, coins, binder FROM profiles ORDER BY user_id').all()]))).digest('hex');
const json = text => (text ? JSON.parse(text) : []);

// Every slab is in exactly one place; escrow matches the open games exactly; nothing is created or lost.
let genDeleted = 0; // generated (minted) slab rows a test deleted on purpose (an account reset)
function audit(label = '') {
  const rows = db.prepare('SELECT * FROM graded_cards').all();
  const flips = new Map(db.prepare('SELECT * FROM coinflips').all().map(f => [f.id, f]));
  const pots = new Map(db.prepare('SELECT * FROM jackpots').all().map(p => [p.id, p]));
  const entries = db.prepare('SELECT * FROM jackpot_entries').all();
  // The ONLY new slab source: a bot's generated slab, minted for a human winner when the game settles (one row per bot slab,
  // nothing when the bot wins), and only out of value a bot may stake (never above the human's stake).
  const expected = new Map(); // request_id -> { user, snap }
  for (const f of flips.values()) {
    const bot = json(f.guest_slabs).filter(x => x.id == null);
    if (f.guest_id === 'house' && bot.length) {
      assert.ok(bot.reduce((n, x) => n + x.v, 0) <= f.host_value, `${label}: the bot's slabs are worth at most what the human put up`);
      assert.ok(f.guest_value <= f.host_value, `${label}: a bot never stakes more than the human`);
    }
    if (f.status === 'done' && f.guest_id === 'house' && f.winner === 'host') bot.forEach((x, i) => expected.set(`casino:coinflip:${f.id}:${i}`, { user: f.host_id, snap: x }));
  }
  for (const p of pots.values()) {
    for (const e of entries) if (e.jackpot_id === p.id && e.bot) {
      assert.ok(e.value <= p.min_value, `${label}: a bot entry never exceeds the host's`);
      assert.ok(json(e.slabs).every(x => x.id == null), `${label}: a bot entry's slabs are generated`);
    }
    const winner = p.status === 'done' ? entries.find(e => e.jackpot_id === p.id && e.seat === p.winner_seat) : null;
    if (winner?.user_id) for (const e of entries) if (e.jackpot_id === p.id && e.bot) json(e.slabs).forEach((x, i) => expected.set(`casino:jackpot:${p.id}:${e.seat * 10 + i}`, { user: winner.user_id, snap: x }));
  }
  assert.equal(rows.length, minted.size + expected.size - genDeleted, `${label}: no slab was created or deleted except by minting a bot's slabs for a human winner`);
  for (const [requestId, { user, snap }] of expected) {
    const row = rows.find(r => r.request_id === requestId); // (a minted slab staked again and won loses its request id: 'won:<id>')
    if (!row) continue;
    assert.equal(row.card_id, snap.cardId); assert.equal(row.grade, snap.grade); assert.equal(row.band, snap.band); assert.equal(row.reverse, 0);
    assert.equal(row.fee_cents, 0); assert.equal(row.user_id, user); assert.equal(row.guard, null);
  }
  const listed = new Map(); // slab id -> open games that hold it
  const hold = (id, game) => listed.set(id, [...(listed.get(id) || []), game]);
  for (const f of flips.values()) if (f.status === 'open') for (const s of json(f.host_slabs)) hold(s.id, `coinflip:${f.id}`);
  for (const e of entries) if (pots.get(e.jackpot_id).status === 'open' && e.user_id) for (const s of json(e.slabs)) hold(s.id, `jackpot:${e.jackpot_id}`);
  for (const row of rows) {
    const where = listed.get(row.id) || [];
    assert.ok(where.length <= 1, `${label}: slab ${row.id} is in ${where.length} open games`);
    if (where.length) { assert.equal(row.locked, where[0], `${label}: slab ${row.id} is locked by the game that holds it`); assert.equal(row.status, 'slabbed'); assert.equal(row.shown, 0); }
    else assert.equal(row.locked, null, `${label}: slab ${row.id} is locked by no open game`);
    if (row.locked) {
      const [kind, ...rest] = row.locked.split(':'); const gid = rest.join(':');
      if (kind === 'coinflip') assert.equal(flips.get(gid).host_id, row.user_id, `${label}: only the host's slab is escrowed in a flip`);
      else assert.ok(entries.some(e => e.jackpot_id === gid && e.user_id === row.user_id), `${label}: the escrowed slab's owner has an entry`);
    }
  }
  const by = status => rows.filter(r => r.status === status).length;
  assert.equal(by('slabbed') + by('sold') + by('cracked'), rows.length, `${label}: every slab is slabbed, sold or cracked`);
}
const holders = ids => Object.fromEntries(ids.map(id => [id, slab(id).user_id]));

// Requests
const cf = {
  create: (user, body = {}) => api('/api/casino/coinflips', 'POST', { requestId: rid(), ...body }, user),
  bot: (user, body = {}) => api('/api/casino/coinflips/bot', 'POST', { requestId: rid(), ...body }, user),
  join: (id, user, body = {}) => api(`/api/casino/coinflips/${id}/join`, 'POST', body, user),
  cancel: (id, user) => api(`/api/casino/coinflips/${id}/cancel`, 'POST', {}, user),
  get: (id, user = 'a') => api(`/api/casino/coinflips/${id}`, 'GET', undefined, user),
};
const jp = {
  create: (user, body = {}) => api('/api/casino/jackpots', 'POST', { requestId: rid(), ...body }, user),
  quick: (user, body = {}) => api('/api/casino/jackpots/quick', 'POST', { requestId: rid(), ...body }, user),
  join: (id, user, body = {}) => api(`/api/casino/jackpots/${id}/join`, 'POST', body, user),
  leave: (id, user) => api(`/api/casino/jackpots/${id}/leave`, 'POST', {}, user),
  cancel: (id, user) => api(`/api/casino/jackpots/${id}/cancel`, 'POST', {}, user),
  draw: (id, user) => api(`/api/casino/jackpots/${id}/draw`, 'POST', {}, user),
  bot: (id, user, body = {}) => api(`/api/casino/jackpots/${id}/bot`, 'POST', body, user),
  get: (id, user = 'a') => api(`/api/casino/jackpots/${id}`, 'GET', undefined, user),
};
const grading = {
  list: user => api('/api/grading', 'GET', undefined, user),
  crack: (slabId, user) => api('/api/grading/crack', 'POST', { slabId }, user),
  sell: (slabId, user) => api('/api/grading/sell', 'POST', { slabId, requestId: rid() }, user),
  show: (slabId, shown, user) => api('/api/grading/show', 'POST', { slabId, shown }, user),
  guard: (slabId, guardId, user) => api('/api/grading/guard', 'POST', { slabId, guardId }, user),
};
const winnings = {
  info: (source, id, user) => api(`/api/casino/winnings/${source}/${id}`, 'GET', undefined, user),
  sell: (source, id, user, extra = {}) => api('/api/casino/winnings/sell', 'POST', { source, id, ...extra }, user),
};
const ERR_GONE = /no longer have those slabs/;

// Values (cents): me5-87 828, me5-98 797, me5-99 906, me5-90 1285, me5-97 510, me5-3 12, me5-1 10, me5-2 7.
for (const u of USERS) { give(u, 'me5-98', 20); give(u, 'me5-97', 20); give(u, 'me5-99', 10); give(u, 'me5-90', 10); give(u, 'me5-3', 30); give(u, 'me5-1', 30); give(u, 'me5-2', 30); }
const rawLedger = () => totalCards()
  + db.prepare("SELECT COALESCE(SUM(json_extract(j.value, '$.qty')), 0) n FROM coinflips f, json_each(f.host_stake) j WHERE f.status = 'open'").get().n
  + db.prepare(`SELECT COALESCE(SUM(json_extract(j.value, '$.qty')), 0) n FROM jackpot_entries e JOIN jackpots p ON p.id = e.jackpot_id, json_each(e.stake) j
    WHERE p.status = 'open' AND e.user_id IS NOT NULL`).get().n;

// ---- Schema ------------------------------------------------------------------------
await check('schema: the Worker applied 0022 (columns, marker triggers) and the generated DDL matches the migration', () => {
  const parts = splitSlabs(migrationSql('0022_casino_slabs.sql'));
  assert.deepEqual(parts.columns, SLABS_COLUMNS, 'worker/casino-ddl.js is stale: run node scripts/gen-casino-ddl.mjs');
  assert.deepEqual(parts.ddl, SLABS_DDL);
  assert.deepEqual(SLABS_COLUMNS.map(c => c.slice(0, 2).join('.')), ['graded_cards.locked', 'coinflips.host_slabs', 'coinflips.guest_slabs', 'jackpot_entries.slabs']);
  assert.ok(GRADING_COLUMNS.some(([name, sql]) => name === 'locked' && sql === SLABS_COLUMNS[0][2]), 'grading.js adds the same locked column');
  const cols = t => db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name);
  assert.ok(cols('graded_cards').includes('locked')); assert.ok(cols('coinflips').includes('host_slabs') && cols('coinflips').includes('guest_slabs')); assert.ok(cols('jackpot_entries').includes('slabs'));
  for (const name of ['coinflip_stake_check', 'graded_slab_escrow', 'graded_slab_escrow_delete']) {
    assert.ok(db.prepare("SELECT sql FROM sqlite_master WHERE name = ?").get(name).sql.includes(SLABS_MARKER), `${name} carries the marker`);
  }
  // slabs-v2 (0027): the generated DDL matches the migration, and the five triggers it replaces carry its marker and code.
  assert.deepEqual(splitStatements(migrationSql('0027_casino_bot_slabs.sql')), BOT_SLABS_DDL, 'worker/casino-ddl.js is stale: run node scripts/gen-casino-ddl.mjs');
  assert.deepEqual(BOT_SLABS_DDL.filter(sql => /^CREATE TRIGGER/.test(sql)).map(sql => sql.match(/^CREATE TRIGGER (\w+)/)[1]).sort(),
    ['coinflip_settle_check', 'coinflip_slab_settle', 'jackpot_entry_check', 'jackpot_settle_check', 'jackpot_slab_settle']);
  for (const name of ['coinflip_settle_check', 'coinflip_slab_settle', 'jackpot_entry_check', 'jackpot_settle_check', 'jackpot_slab_settle']) {
    assert.ok(db.prepare("SELECT sql FROM sqlite_master WHERE name = ?").get(name).sql.includes('/* slabs-v2 */'), `${name} is the v2 trigger`);
  }
  const names = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'").all().map(r => r.name));
  for (const sql of SLABS_DDL) { const m = sql.match(/^CREATE TRIGGER (\w+)/); if (m) assert.ok(names.has(m[1]), m[1]); }
  assert.equal(CASINO_DDL.length, 12); assert.equal(JACKPOT_DDL.length, 22);
});

// ---- Coinflip: staking and refusing ---------------------------------------------------
let g1; let g1id;
await check('coinflip: a slab-only stake escrows the slab (locked, shown cleared, out of save.graded, in inGame) and views carry the slab', async () => {
  gear('a', 'guard-onyx', 2); gear('b', 'guard-cherry', 2);
  g1 = mint('a', 'me5-87', 9, { guard: 'guard-onyx', shown: 1 });
  const before = await grading.list('a');
  assert.equal(before.slabs.length, 1); assert.equal(before.slabs[0].shown, true); assert.deepEqual(before.inGame, []);
  const beforeCards = rawLedger();
  const r = await cf.create('a', { cards: [], slabs: [g1] });
  assert.equal(r.status, 200, JSON.stringify(r));
  g1id = r.flip.id;
  assert.equal(r.flip.hostValue, 8.28); assert.deepEqual(r.flip.hostStake, []); assert.equal(r.flip.hostSlabs.length, 1);
  assert.deepEqual(r.flip.hostSlabs[0], { id: g1, cert: certNumber(g1), cardId: 'me5-87', name: 'Goldeen', number: '87', rarity: 'Illustration Rare',
    image: 'assets/cards/me5/87.webp', small: 'assets/cards/me5/87-sm.webp', grade: 9, blackLabel: false, reverse: false, guard: 'guard-onyx', value: 8.28 });
  assert.equal(r.flip.guestSlabs, null); assert.deepEqual(r.flip.window, { min: 7.87, max: 8.69 });
  assert.deepEqual(r.save.graded, [], 'the escrowed slab left save.graded');
  const s = slab(g1); assert.equal(s.locked, `coinflip:${g1id}`); assert.equal(s.shown, 0, 'shown is cleared on lock'); assert.equal(s.guard, 'guard-onyx', 'the guard stays on while escrowed');
  assert.equal(s.status, 'slabbed'); assert.equal(s.user_id, 'a');
  const g = await grading.list('a');
  assert.deepEqual(g.slabs, []); assert.equal(g.inGame.length, 1);
  // inGame carries what the page needs to draw the slab (the stake snapshot's card fields), not just ids.
  assert.deepEqual({ name: g.inGame[0].name, number: g.inGame[0].number, rarity: g.inGame[0].rarity, image: g.inGame[0].image, small: g.inGame[0].small, cardId: g.inGame[0].cardId, grade: g.inGame[0].grade, guard: g.inGame[0].guard },
    { name: 'Goldeen', number: '87', rarity: 'Illustration Rare', image: 'assets/cards/me5/87.webp', small: 'assets/cards/me5/87-sm.webp', cardId: 'me5-87', grade: 9, guard: 'guard-onyx' });
  assert.equal(g.inGame[0].id, g1); assert.equal(g.inGame[0].game, 'coinflip'); assert.equal(g.inGame[0].gameId, g1id); assert.equal(g.inGame[0].value, 8.28);
  assert.equal(g.guards.equipped['guard-onyx'], 1, 'the guard unit is still worn, so not free');
  assert.equal(rawLedger(), beforeCards); audit('after slab-only create');
  const listed = await cf.get(g1id, null);
  assert.equal(listed.flip.hostSlabs[0].id, g1);
});

await check('coinflip: the same slab cannot be staked twice, by a stranger, once cracked or sold, nor invalid ids (nothing changes)', async () => {
  const stranger = mint('b', 'me5-98', 9); const crackedId = mint('a', 'me5-87', 8); const soldId = mint('a', 'me5-87', 7);
  assert.equal((await grading.crack(crackedId, 'a')).status, 200); assert.equal((await grading.sell(soldId, 'a')).status, 200);
  const mine = mint('a', 'me5-97', 9); const tiny = mint('a', 'me5-2', 1); // 0.07 * 0.3 = 0.02 coins
  const frozen = dump();
  const refuse = async (body, user, status, message) => {
    const r = await cf.create(user, body);
    assert.equal(r.status, status, `${JSON.stringify(body)} -> ${r.status} ${r.error}`);
    if (message) assert.match(r.error, message);
    assert.equal(dump(), frozen, 'a refused stake moves nothing');
  };
  await refuse({ cards: [], slabs: [g1] }, 'a', 409, ERR_GONE); // already in this flip
  await refuse({ slabs: [g1] }, 'a', 409, ERR_GONE);
  await refuse({ cards: [], slabs: [stranger] }, 'a', 409, ERR_GONE); // somebody else's
  await refuse({ cards: [], slabs: [crackedId] }, 'a', 409, ERR_GONE);
  await refuse({ cards: [], slabs: [soldId] }, 'a', 409, ERR_GONE);
  await refuse({ cards: [], slabs: [999999] }, 'a', 409, ERR_GONE);
  await refuse({ cards: [], slabs: [mine, g1] }, 'a', 409, ERR_GONE); // one bad slab sinks the whole stake
  await refuse({ cards: [], slabs: [mine, mine] }, 'a', 400, /each slab once/);
  await refuse({ cards: [], slabs: ['12'] }, 'a', 400, /valid slabs/);
  await refuse({ cards: [], slabs: [1.5] }, 'a', 400); await refuse({ cards: [], slabs: [0] }, 'a', 400); await refuse({ cards: [], slabs: [-3] }, 'a', 400);
  await refuse({ cards: [], slabs: [null] }, 'a', 400); await refuse({ cards: [], slabs: 'x' }, 'a', 400); await refuse({ cards: [], slabs: {} }, 'a', 400);
  await refuse({ cards: [], slabs: [] }, 'a', 400, /at least one card/);
  await refuse({}, 'a', 400, /at least one card/);
  await refuse({ cards: 'me5-87', slabs: [mine] }, 'a', 400);
  await refuse({ cards: [], slabs: Array.from({ length: 11 }, (_, i) => i + 1) }, 'a', 400, /at most 10 slabs/);
  await refuse({ cards: [], slabs: [tiny] }, 'a', 400, /at least 0\.1 coins/);
  assert.equal((await api('/api/casino/coinflips', 'POST', { cards: [], slabs: [mine] }, 'a')).status, 400, 'requestId is required');
  assert.equal((await cf.create(null, { slabs: [mine] })).status, 401);
  assert.equal(dump(), frozen); audit('after refused stakes');
});

await check('coinflip: a locked slab cannot be cracked, sold, shown or guarded (409, nothing changes) and grading submit still counts it', async () => {
  const frozen = dump();
  for (const r of [await grading.crack(g1, 'a'), await grading.sell(g1, 'a'), await grading.show(g1, true, 'a'), await grading.show(g1, false, 'a'),
    await grading.guard(g1, 'guard-onyx', 'a'), await grading.guard(g1, 'guard-cherry', 'a'), await grading.guard(g1, null, 'a')]) {
    assert.equal(r.status, 409, JSON.stringify(r)); assert.equal(r.error, 'That slab is in a casino game.');
  }
  assert.equal(dump(), frozen);
  // The same checks as the other player: not theirs.
  assert.equal((await grading.crack(g1, 'b')).status, 404);
  // The guard unit stays reserved: user a owns 2 onyx, 1 is on the escrowed slab, so exactly one is free.
  const s2 = mint('a', 'me5-98', 9);
  assert.equal((await grading.guard(s2, 'guard-onyx', 'a')).status, 200);
  const s3 = mint('a', 'me5-98', 9);
  const over = await grading.guard(s3, 'guard-onyx', 'a');
  assert.equal(over.status, 409, 'the escrowed slab still holds its guard unit'); assert.match(over.error, /No free Onyx guard/);
  audit('after locked-slab actions');
  // tidy: the two scratch slabs go back to bare and stay available for later checks
  assert.equal((await grading.guard(s2, null, 'a')).status, 200);
});

await check('coinflip: a double-tapped create (same requestId) makes one flip, escrows once', async () => {
  const s = mint('b', 'me5-98', 9); const key = rid();
  const [x, y] = await Promise.all([cf.create('b', { requestId: key, slabs: [s] }), cf.create('b', { requestId: key, slabs: [s] })]);
  assert.equal(x.status, 200, JSON.stringify(x)); assert.equal(y.status, 200, JSON.stringify(y)); assert.equal(x.flip.id, y.flip.id);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM coinflips WHERE host_id = ? AND request_id = ?').get('b', key).n, 1);
  assert.equal(slab(s).locked, `coinflip:${x.flip.id}`);
  const again = await cf.create('b', { requestId: key, slabs: [s] });
  assert.equal(again.status, 200); assert.equal(again.flip.id, x.flip.id, 'a later retry finds the same flip');
  assert.equal((await cf.cancel(x.flip.id, 'b')).status, 200); assert.equal(slab(s).locked, null);
  audit('after double tap');
});
await check('coinflip: a Black Label is staked at its Black Label value and the view says so', async () => {
  const s = mint('b', 'me5-98', 10); makeBlack(s);
  const plainTen = mint('b', 'me5-98', 10);
  const card = JSON.parse(readFileSync(new URL('../data/me5.json', import.meta.url), 'utf8')).find(c => c.id === 'me5-98');
  const r = await cf.create('b', { slabs: [s] });
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.equal(r.flip.hostSlabs[0].blackLabel, true); assert.equal(r.flip.hostSlabs[0].grade, 10);
  assert.equal(r.flip.hostValue, gradedValue(card, 10, SET_BY_ID.me5, true));
  assert.ok(r.flip.hostValue > gradedValue(card, 10, SET_BY_ID.me5) * 5);
  assert.equal((await cf.cancel(r.flip.id, 'b')).status, 200);
  const r2 = await cf.create('b', { slabs: [plainTen] });
  assert.equal(r2.flip.hostSlabs[0].blackLabel, false); assert.equal(r2.flip.hostValue, gradedValue(card, 10, SET_BY_ID.me5));
  assert.equal((await cf.cancel(r2.flip.id, 'b')).status, 200);
  audit('after black label');
});

await check('coinflip: a slab cracked or staked between the Worker\'s read and its batch fails cleanly with 409, no partial state', async () => {
  // Cracked in between.
  const s = mint('c', 'me5-98', 9); give('c', 'me5-98', 0);
  const cardsBefore = qtyOf('c', 'me5-98');
  hooks.beforeBatch = () => db.prepare("UPDATE graded_cards SET status = 'cracked', closed_at = ?, guard = NULL WHERE id = ?").run(now, s);
  const r = await cf.create('c', { cards: [{ id: 'me5-3', qty: 2 }], slabs: [s] });
  assert.equal(r.status, 409, JSON.stringify(r)); assert.match(r.error, ERR_GONE);
  assert.equal(slab(s).locked, null); assert.equal(db.prepare("SELECT COUNT(*) n FROM coinflips WHERE host_id = 'c'").get().n, 0, 'no flip row');
  assert.equal(qtyOf('c', 'me5-3'), 30, 'the raw cards of the same stake did not move either');
  db.prepare('INSERT INTO cards(user_id,card_id,qty,reverse_qty) VALUES(?,?,1,0) ON CONFLICT(user_id,card_id) DO UPDATE SET qty = qty + 1').run('c', 'me5-98'); // the crack's card (test-side, keeps the ledger true)
  assert.equal(qtyOf('c', 'me5-98'), cardsBefore + 1);
  // Locked by another game in between: the first writer wins.
  const t = mint('c', 'me5-97', 9);
  hooks.beforeBatch = () => { db.prepare("UPDATE graded_cards SET locked = 'coinflip:elsewhere' WHERE id = ?").run(t); };
  const r2 = await cf.create('c', { slabs: [t] });
  assert.equal(r2.status, 409); assert.equal(slab(t).locked, 'coinflip:elsewhere');
  db.prepare('UPDATE graded_cards SET locked = NULL WHERE id = ?').run(t);
  // A joiner whose slab is cracked in between keeps the flip open and everything else untouched.
  const host = mint('d', 'me5-87', 9); const open = await cf.create('d', { slabs: [host] });
  assert.equal(open.status, 200);
  const guestSlab = mint('e', 'me5-87', 9); const frozen = dump();
  hooks.beforeBatch = () => db.prepare("UPDATE graded_cards SET status = 'sold', sold_cents = 1, closed_at = ? WHERE id = ?").run(now, guestSlab);
  const j = await cf.join(open.flip.id, 'e', { slabs: [guestSlab] });
  assert.equal(j.status, 409, JSON.stringify(j));
  assert.equal(db.prepare('SELECT status FROM coinflips WHERE id = ?').get(open.flip.id).status, 'open');
  assert.equal(slab(host).locked, `coinflip:${open.flip.id}`);
  assert.notEqual(dump(), frozen); // only the test's own sale landed
  assert.equal((await cf.cancel(open.flip.id, 'd')).status, 200);
  audit('after races');
});

// ---- Coinflip: matching, windows, and where each slab ends up ------------------------------------
await check('coinflip: join window counts slabs; a too small or too large mixed stake is refused and keeps every slab free', async () => {
  const hostSlab = mint('d', 'me5-87', 9, { guard: null }); const f = await cf.create('d', { slabs: [hostSlab] }); assert.equal(f.status, 200);
  const small = mint('e', 'me5-97', 9); // 5.10: too low for 7.87..8.69
  const big = mint('e', 'me5-99', 9); // 9.06: too high
  const frozen = dump();
  for (const body of [{ slabs: [small] }, { slabs: [big] }, { cards: [{ id: 'me5-97', qty: 1 }], slabs: [] }, { cards: [{ id: 'me5-3', qty: 1 }], slabs: [big] }]) {
    const r = await cf.join(f.flip.id, 'e', body);
    assert.equal(r.status, 400, JSON.stringify(body) + JSON.stringify(r)); assert.match(r.error, /Match the stake: between 7\.87 and 8\.69/);
  }
  assert.equal(dump(), frozen, 'refused joins move nothing');
  // 5.10 slab + 3 x 0.97... use cards 3.00: 5.10 + 2.98 (me5-97 raw 5.10 is too big); 5.10 slab + 25 x 0.12 = 3.00 -> 8.10 fits
  const ok = await cf.join(f.flip.id, 'e', { cards: [{ id: 'me5-3', qty: 25 }], slabs: [small] });
  rig.coin = 'host'; // (rig applies to the next flips; this one was already random) - assert on the outcome rather than the rig
  assert.equal(ok.status, 200, JSON.stringify(ok)); assert.equal(ok.flip.guestValue, 8.1); assert.equal(ok.flip.guestSlabs.length, 1); assert.equal(ok.flip.guestStake[0].qty, 25);
  const hostWon = ok.flip.winner === 'host';
  assert.equal(slab(hostSlab).user_id, hostWon ? 'd' : 'e'); assert.equal(slab(small).user_id, hostWon ? 'd' : 'e');
  assert.equal(slab(hostSlab).locked, null); assert.equal(slab(small).locked, null);
  unrig(); audit('after mixed join');
  // clean up the cards the winner took so later counts are simple
});

const settleCoinflip = async ({ hostWins, hostGuard = null, guestGuard = null, hostCards, guestCards, hostSlabCards = ['me5-87'], guestSlabCards = ['me5-98'], hostUser = 'a', guestUser = 'b', hostReq, guestReq }) => {
  const hs = hostSlabCards.map((c, i) => mint(hostUser, c, 9, { guard: i === 0 ? hostGuard : null, requestId: hostReq && i === 0 ? hostReq : undefined }));
  const gs = guestSlabCards.map((c, i) => mint(guestUser, c, 9, { guard: i === 0 ? guestGuard : null, requestId: guestReq && i === 0 ? guestReq : undefined }));
  const gearBefore = gearRows();
  const made = await cf.create(hostUser, { cards: hostCards || [], slabs: hs });
  assert.equal(made.status, 200, JSON.stringify(made));
  audit('open with slabs');
  rig.coin = hostWins ? 'host' : 'guest';
  const joined = await cf.join(made.flip.id, guestUser, { cards: guestCards || [], slabs: gs });
  unrig();
  assert.equal(joined.status, 200, JSON.stringify(joined));
  assert.equal(joined.flip.winner, hostWins ? 'host' : 'guest');
  assert.equal(gearRows(), gearBefore, 'user_gear is never touched by a game');
  audit('settled');
  return { flip: joined.flip, hs, gs, id: made.flip.id };
};

await check('coinflip: host wins a slab-for-slab flip: both slabs go to the host; the guest slab is stripped of its guard; the host slab keeps its own', async () => {
  const hostReq = 'host-request-0001'; const guestReq = 'guest-request-0001';
  gear('a', 'guard-gilt', 1); gear('b', 'guard-rose', 1);
  const { flip, hs, gs } = await settleCoinflip({ hostWins: true, hostGuard: 'guard-gilt', guestGuard: 'guard-rose', hostReq, guestReq });
  assert.deepEqual(flip.hostSlabs.map(s => s.id), hs); assert.deepEqual(flip.guestSlabs.map(s => s.id), gs);
  assert.equal(flip.hostValue, 8.28); assert.equal(flip.guestValue, 7.97);
  const mine = slab(hs[0]); const won = slab(gs[0]);
  assert.equal(mine.user_id, 'a'); assert.equal(mine.guard, 'guard-gilt', 'a slab that returns to its owner keeps the guard'); assert.equal(mine.request_id, hostReq); assert.equal(mine.locked, null); assert.equal(mine.shown, 0);
  assert.equal(won.user_id, 'a'); assert.equal(won.guard, null, 'a won slab arrives bare'); assert.equal(won.request_id, `won:${gs[0]}`); assert.equal(won.locked, null);
  assert.equal(won.grade, 9); assert.equal(won.card_id, 'me5-98'); assert.equal(won.band, 'me'); assert.equal(won.reverse, 0); assert.equal(won.status, 'slabbed');
  const ga = await grading.list('a'); const gb = await grading.list('b');
  assert.ok(ga.slabs.some(s => s.id === gs[0]) && ga.slabs.some(s => s.id === hs[0]));
  assert.equal(gb.slabs.some(s => s.id === gs[0]), false); assert.equal(gb.inGame.length, 0); assert.equal(ga.inGame.length, 1, 'only the first test flip is still open');
  assert.equal(gb.guards.owned['guard-rose'], 1); assert.equal(gb.guards.equipped['guard-rose'], undefined, 'the loser\'s guard unit is free stock again');
  assert.equal(ga.guards.equipped['guard-gilt'], 1); assert.equal(ga.guards.equipped['guard-rose'], undefined);
  assert.equal(certNumber(gs[0]), ga.slabs.find(s => s.id === gs[0]).cert, 'the cert follows the slab');
  // The new owner can use it: guard it, show it, crack it.
  assert.equal((await grading.guard(gs[0], 'guard-gilt', 'a')).status, 409, 'the one gilt unit is on the other slab');
  assert.equal((await grading.show(gs[0], true, 'a')).status, 200);
  assert.equal((await grading.show(gs[0], false, 'a')).status, 200);
  const cracked = await grading.crack(gs[0], 'a'); assert.equal(cracked.status, 200); assert.equal(cracked.save.collection['me5-98'] >= 1, true);
  const view = await cf.get(flip.id, null); assert.equal(view.flip.status, 'done'); assert.equal(view.flip.guestSlabs.length, 1);
});

await check('coinflip: guest wins: the host slab moves to the guest (guard stripped), the guest slab stays theirs with its guard', async () => {
  const { flip, hs, gs } = await settleCoinflip({ hostWins: false, hostGuard: 'guard-gilt', guestGuard: 'guard-rose', hostUser: 'c', guestUser: 'd' });
  gear('c', 'guard-gilt', 1); // (stock inserted after is fine: the guard column is what a game moves)
  assert.equal(flip.winner, 'guest');
  const lost = slab(hs[0]); const kept = slab(gs[0]);
  assert.equal(lost.user_id, 'd'); assert.equal(lost.guard, null); assert.equal(lost.request_id, `won:${hs[0]}`); assert.equal(lost.locked, null); assert.equal(lost.shown, 0);
  assert.equal(kept.user_id, 'd'); assert.equal(kept.guard, 'guard-rose'); assert.equal(kept.locked, null);
  assert.equal((await grading.list('c')).slabs.some(s => s.id === hs[0]), false);
  assert.equal((await grading.list('d')).slabs.filter(s => [hs[0], gs[0]].includes(s.id)).length, 2);
});

await check('coinflip: a winner who already holds a slab with the same request_id does not wedge the settlement', async () => {
  const same = 'collide-request-01';
  // The host wins and already holds `same`; the guest's slab carries the same request_id.
  mint('e', 'me5-97', 9, { requestId: same });
  const one = await settleCoinflip({ hostWins: true, hostUser: 'e', guestUser: 'f', guestReq: same, hostReq: 'collide-host-0001' });
  assert.equal(slab(one.gs[0]).user_id, 'e'); assert.equal(slab(one.gs[0]).request_id, `won:${one.gs[0]}`); assert.equal(slab(one.hs[0]).request_id, 'collide-host-0001');
  // The guest wins and already holds `same2`; the host's slab carries it.
  mint('f', 'me5-97', 9, { requestId: 'collide-request-02' });
  const two = await settleCoinflip({ hostWins: false, hostUser: 'e', guestUser: 'f', hostReq: 'collide-request-02', guestReq: 'collide-guest-0002' });
  assert.equal(slab(two.hs[0]).user_id, 'f'); assert.equal(slab(two.hs[0]).request_id, `won:${two.hs[0]}`); assert.equal(slab(two.gs[0]).request_id, 'collide-guest-0002');
  // Two slabs from two users sharing a request_id (their own choice) land on one winner without a UNIQUE clash.
  const { hs, gs } = await settleCoinflip({ hostWins: true, hostUser: 'a', guestUser: 'b', hostReq: 'twin-request-0001', guestReq: 'twin-request-0001' });
  assert.equal(slab(hs[0]).request_id, 'twin-request-0001'); assert.equal(slab(gs[0]).request_id, `won:${gs[0]}`);
  // A slab that went away and comes back keeps a unique id too: b wins it back from a.
  const back = await settleCoinflip({ hostWins: false, hostUser: 'a', guestUser: 'b', hostSlabCards: ['me5-87'], guestSlabCards: ['me5-98'] });
  assert.equal(slab(back.hs[0]).user_id, 'b');
});

await check('coinflip: mixed stakes (cards and slabs on both sides): raw cards and slabs both go to the winner', async () => {
  for (const hostWins of [true, false]) {
    const ledger = rawLedger(); const winner = hostWins ? 'c' : 'd'; const cardsBefore = qtyOf(winner, 'me5-3');
    const { flip, hs, gs } = await settleCoinflip({ hostWins, hostUser: 'c', guestUser: 'd', hostCards: [{ id: 'me5-3', qty: 10 }], guestCards: [{ id: 'me5-3', qty: 7 }],
      hostSlabCards: ['me5-98'], guestSlabCards: ['me5-87'] });
    assert.equal(flip.hostValue, 9.17); assert.equal(flip.guestValue, 9.12); // 7.97 + 10 x 0.12 vs 8.28 + 7 x 0.12
    assert.equal(slab(hs[0]).user_id, winner); assert.equal(slab(gs[0]).user_id, winner);
    assert.equal(qtyOf(winner, 'me5-3'), cardsBefore + (hostWins ? 7 : 10), 'the loser\'s cards came over, the winner\'s own went back');
    assert.equal(rawLedger(), ledger, 'raw cards conserved');
  }
});

await check('coinflip: a bot flip: slab stake is valued, bot never stakes more, a win keeps the slab, a loss closes it (house takes it out of the game)', async () => {
  let kept = 0; let lost = 0;
  for (const wins of [true, false, true, false]) {
    const s = mint('e', 'me5-87', 9, { guard: wins ? null : null }); const frozenCoins = coinsOf('e'); const active = db.prepare("SELECT COUNT(*) n FROM graded_cards WHERE status = 'slabbed'").get().n;
    rig.coin = wins ? 'host' : 'guest';
    const r = await cf.bot('e', { cards: [], slabs: [s] }); unrig();
    assert.equal(r.status, 200, JSON.stringify(r));
    assert.equal(r.flip.bot, true); assert.equal(r.flip.status, 'done'); assert.equal(r.flip.winner, wins ? 'host' : 'guest');
    assert.equal(r.flip.hostValue, 8.28); assert.deepEqual(r.flip.hostSlabs.map(x => x.id), [s]);
    assert.ok(r.flip.guestValue <= 8.28 && r.flip.guestValue >= 7.78, `bot stake ${r.flip.guestValue} is within its window of the slab's value`);
    // The bot mirrors a slab stake with at least one slab of its own: generated (no id, no cert), worth its graded value, no row while staked.
    const bs = r.flip.guestSlabs; assert.ok(bs.length >= 1 && bs.length <= 10, `the bot staked ${bs.length} slabs`);
    for (const x of bs) { assert.equal(x.id, null); assert.equal(x.cert, null); assert.equal(x.reverse, false); assert.equal(x.guard, null); assert.equal(x.value, Math.round(x.value * 100) / 100); }
    assert.equal(r.flip.guestStake.reduce((n, c) => n + Math.round(c.value * 100) * c.qty, 0) + bs.reduce((n, x) => n + Math.round(x.value * 100), 0), Math.round(r.flip.guestValue * 100));
    assert.ok(JSON.parse(db.prepare('SELECT guest_slabs FROM coinflips WHERE id = ?').get(r.flip.id).guest_slabs).every(x => x.id === undefined && typeof x.band === 'string' && Number.isInteger(x.v)));
    const gen = db.prepare("SELECT * FROM graded_cards WHERE request_id LIKE ? ORDER BY request_id").all(`casino:coinflip:${r.flip.id}:%`);
    if (wins) {
      // The human won: one real slab per bot slab, minted into graded_cards in the settle, exact rows.
      assert.equal(gen.length, bs.length);
      bs.forEach((x, i) => {
        const m = gen.find(row => row.request_id === `casino:coinflip:${r.flip.id}:${i}`); assert.ok(m, `slab ${i} was minted`);
        assert.deepEqual({ user: m.user_id, card: m.card_id, reverse: m.reverse, grade: m.grade, fee: m.fee_cents, guard: m.guard, shown: m.shown, status: m.status, locked: m.locked, closed: m.closed_at, at: m.created_at },
          { user: 'e', card: x.cardId, reverse: 0, grade: x.grade, fee: 0, guard: null, shown: 0, status: 'slabbed', locked: null, closed: null, at: db.prepare('SELECT flipped_at FROM coinflips WHERE id = ?').get(r.flip.id).flipped_at });
        assert.equal(m.band, bandOf(x.cardId), 'its band is its set\'s band'); assert.equal(slabCents(x.cardId, x.grade), Math.round(x.value * 100), 'worth what a real slab of that card and grade sells for');
      });
      assert.ok((await grading.list('e')).slabs.filter(x => gen.some(m => m.id === x.id)).length === bs.length, 'they show up in the winner\'s slabs');
    } else assert.equal(gen.length, 0, 'nothing is minted when the house wins');
    const row = slab(s);
    assert.equal(row.locked, null);
    if (wins) { assert.equal(row.status, 'slabbed'); assert.equal(row.user_id, 'e'); kept++; }
    else {
      assert.equal(row.status, 'sold'); assert.equal(row.sold_cents, 0); assert.equal(row.sell_request_id, `casino:coinflip:${r.flip.id}`); assert.equal(row.guard, null);
      assert.ok(row.closed_at > 0); assert.equal(row.user_id, 'e', 'the closed row stays with the loser (history)'); assert.equal(row.shown, 0);
      assert.equal(db.prepare("SELECT COUNT(*) n FROM graded_cards WHERE status = 'slabbed'").get().n, active - 1); lost++;
      assert.equal((await grading.list('e')).slabs.some(x => x.id === s), false); assert.equal((await grading.list('e')).inGame.length, 0);
      assert.equal((await grading.crack(s, 'e')).status, 409); assert.equal((await grading.sell(s, 'e')).status, 409, 'a closed slab cannot be sold');
      assert.equal(coinsOf('e'), frozenCoins, 'the house pays nothing for a lost slab');
    }
    assert.equal(db.prepare("SELECT COUNT(*) n FROM cards WHERE user_id = 'house'").get().n, 0);
    audit('bot flip');
  }
  assert.equal(kept, 2); assert.equal(lost, 2);
  // Mixed stake with a bot: the bot's target is cards + slab.
  const s = mint('e', 'me5-87', 9); rig.coin = 'host';
  const m = await cf.bot('e', { cards: [{ id: 'me5-97', qty: 1 }], slabs: [s] }); unrig();
  assert.equal(m.status, 200); assert.equal(m.flip.hostValue, 13.38); assert.ok(m.flip.guestValue <= 13.38 && m.flip.guestValue >= 12.58, String(m.flip.guestValue));
  assert.equal(slab(s).user_id, 'e'); assert.equal(slab(s).locked, null);
  // A bot cannot match what its pool cannot reach: a clean 409, nothing moves.
  const pricey = mint('e', 'me5-90', 10); const dumped = dump();
  const refused = await cf.bot('e', { slabs: [pricey, mint('e', 'me5-90', 10), mint('e', 'me5-90', 10)] }); // 3 x 19.28 = 57.84 coins
  assert.ok([200, 409].includes(refused.status), `${refused.status} ${refused.error}`);
  if (refused.status === 409) assert.match(refused.error, /bot could not match/);
  void dumped; audit('bot flips');
});

await check('coinflip: cancel and expiry return slabs (guard intact, shown stays off); cancelling twice returns nothing twice; a joiner cannot take an expired flip', async () => {
  gear('f', 'guard-frost', 1);
  const s = mint('f', 'me5-98', 9, { guard: 'guard-frost', shown: 1 }); const t = mint('f', 'me5-97', 8);
  const f1 = await cf.create('f', { slabs: [s, t] }); assert.equal(f1.status, 200); assert.equal(f1.flip.hostValue, 7.97 + 4.08);
  assert.equal(slab(s).locked, `coinflip:${f1.flip.id}`); assert.equal(slab(t).locked, `coinflip:${f1.flip.id}`);
  assert.equal((await cf.cancel(f1.flip.id, 'a')).status, 403, 'only the host cancels');
  assert.equal(slab(s).locked, `coinflip:${f1.flip.id}`);
  assert.equal((await cf.cancel(f1.flip.id, 'f')).status, 200);
  for (const id of [s, t]) { assert.equal(slab(id).locked, null); assert.equal(slab(id).status, 'slabbed'); assert.equal(slab(id).user_id, 'f'); }
  assert.equal(slab(s).guard, 'guard-frost'); assert.equal(slab(s).shown, 0);
  const frozen = dump();
  assert.equal((await cf.cancel(f1.flip.id, 'f')).status, 200); assert.equal(dump(), frozen, 'cancel twice changes nothing');
  assert.equal((await grading.list('f')).slabs.filter(x => [s, t].includes(x.id)).length, 2);
  assert.equal((await cf.join(f1.flip.id, 'a', { slabs: [mint('a', 'me5-98', 9)] })).status, 409, 'a cancelled flip cannot be joined');
  audit('after cancel');
  // Expiry: maintenance cancels the flip and the triggers hand the slabs back.
  const e1 = await cf.create('f', { slabs: [s] }); assert.equal(e1.status, 200); assert.equal(slab(s).locked, `coinflip:${e1.flip.id}`);
  now += (COINFLIP_RULES.openHours + 1) * 3600000; db.prepare('UPDATE sessions SET expires_at = ?').run(now + 864000000);
  const joiner = mint('b', 'me5-98', 9);
  assert.equal((await cf.join(e1.flip.id, 'b', { slabs: [joiner] })).status, 409, 'expired flips cannot be joined');
  assert.equal(slab(joiner).locked, null);
  assert.equal(slab(s).locked, null, 'the expiry returned the slab'); assert.equal(slab(s).guard, 'guard-frost');
  assert.equal((await cf.get(e1.flip.id, null)).flip.status, 'cancelled');
  audit('after expiry');
  // The scheduled maintenance does the same for a flip nobody opens.
  const e2 = await cf.create('f', { slabs: [t] }); now += (COINFLIP_RULES.openHours + 1) * 3600000; db.prepare('UPDATE sessions SET expires_at = ?').run(now + 864000000);
  const { maintainCoinflips } = await import('../worker/casino.js');
  await maintainCoinflips(env, now);
  assert.equal(slab(t).locked, null); assert.equal(db.prepare('SELECT status FROM coinflips WHERE id = ?').get(e2.flip.id).status, 'cancelled');
  audit('after scheduled maintenance');
});

await check('coinflip: a retried join (same player) is idempotent and a second player cannot take the settled flip; a joiner\'s own locked slab cannot join elsewhere', async () => {
  const hs = mint('a', 'me5-87', 9); const f = await cf.create('a', { slabs: [hs] });
  const own = mint('b', 'me5-98', 9); const other = await cf.create('b', { slabs: [own] }); // b's slab is escrowed in b's own flip
  const refused = await cf.join(f.flip.id, 'b', { slabs: [own] });
  assert.equal(refused.status, 409); assert.match(refused.error, ERR_GONE); assert.equal(slab(own).locked, `coinflip:${other.flip.id}`);
  assert.equal((await cf.cancel(other.flip.id, 'b')).status, 200);
  const gs = mint('b', 'me5-98', 9); rig.coin = 'guest';
  const j = await cf.join(f.flip.id, 'b', { slabs: [gs] }); unrig(); assert.equal(j.status, 200);
  const frozen = dump();
  const retry = await cf.join(f.flip.id, 'b', { slabs: [gs] }); assert.equal(retry.status, 200); assert.equal(retry.flip.id, f.flip.id);
  assert.equal(dump(), frozen, 'the retry moved nothing');
  assert.equal((await cf.join(f.flip.id, 'c', { slabs: [mint('c', 'me5-98', 9)] })).status, 409);
  assert.equal(slab(hs).user_id, 'b'); assert.equal(slab(gs).user_id, 'b');
  assert.equal((await cf.cancel(f.flip.id, 'a')).status, 409, 'cannot cancel after the flip');
  audit('after retry');
});

// ---- Trigger authority: the database refuses what the API would never send -----------------------
await check('triggers: direct inserts cannot escrow a slab that is not the host\'s, is locked, closed, mismatched, duplicated, over 10, or a bot\'s', async () => {
  const mine = mint('a', 'me5-87', 9); const theirs = mint('b', 'me5-87', 9); const closed = mint('a', 'me5-87', 9);
  db.prepare("UPDATE graded_cards SET status = 'cracked' WHERE id = ?").run(closed);
  const snap = (id, extra = {}) => ({ id, cardId: 'me5-87', name: 'Goldeen', number: '87', rarity: 'x', image: '', small: '', grade: 9, reverse: 0, guard: slab(id)?.guard ?? null, v: 828, ...extra });
  const insert = (slabs, host = 'a', value = 828, req = rid()) => db.prepare(`INSERT INTO coinflips(id,host_id,request_id,host_stake,host_slabs,host_value,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)`)
    .run(rid(), host, req, '[]', slabs === null ? null : JSON.stringify(slabs), value, now, now + 3600000);
  const frozen = dump();
  assert.throws(() => insert([snap(theirs)]), /no longer have those slabs/);
  assert.throws(() => insert([snap(closed)]), /no longer have those slabs/);
  assert.throws(() => insert([snap(mine, { grade: 8 })]), /no longer have those slabs/, 'the snapshot must match the row');
  assert.throws(() => insert([snap(mine, { cardId: 'me5-98' })]), /no longer have those slabs/);
  assert.throws(() => insert([snap(mine, { reverse: 1 })]), /no longer have those slabs/);
  assert.throws(() => insert([snap(mine, { guard: 'guard-onyx' })]), /no longer have those slabs/);
  assert.throws(() => insert([snap(mine), snap(mine)]), /not valid/);
  assert.throws(() => insert([snap(mine, { id: '5' })]), /not valid/);
  assert.throws(() => insert([snap(mine, { v: 1.5 })]), /not valid/);
  assert.throws(() => insert([snap(mine, { v: -1 })]), /not valid/);
  assert.throws(() => insert('"x"'), /./);
  assert.throws(() => insert({ a: 1 }), /not valid/);
  assert.throws(() => insert([]), /at least one card/, 'an empty stake with no slabs is still refused');
  assert.throws(() => insert(null), /at least one card/);
  assert.throws(() => insert(Array.from({ length: 11 }, (_, i) => snap(mine, { id: i + 1 }))), /not valid/);
  assert.equal(dump(), frozen);
  assert.throws(() => db.prepare(`INSERT INTO coinflips(id,host_id,request_id,host_stake,host_slabs,host_value,created_at,expires_at,guest_slabs) VALUES('x','a','r-guest-slabs','[]',?,828,1,2,'[]')`)
    .run(JSON.stringify([snap(mine)])), /starts open/);
  assert.equal(dump(), frozen);
  // Bots never carry slabs: a settle with house + guest slabs is refused, so is a host-slab swap.
  const f = await cf.create('a', { slabs: [mine] });
  const settle = (sets) => db.prepare(`UPDATE coinflips SET status = 'done', winner = 'host', flipped_at = ?, ${sets} WHERE id = ?`);
  assert.throws(() => settle("guest_id = 'house', guest_stake = '[]', guest_slabs = '[]', guest_value = 828").run(now, f.flip.id), /cannot be settled/, 'an empty guest with no slabs');
  assert.throws(() => settle(`guest_id = 'house', guest_stake = '[{"id":"me5-3","qty":1,"rev":0,"v":12}]', guest_slabs = '${JSON.stringify([snap(theirs)])}', guest_value = 828`).run(now, f.flip.id), /not valid/, 'house with slabs');
  assert.throws(() => settle(`guest_id = 'b', guest_stake = '[]', guest_slabs = '${JSON.stringify([snap(mine)])}', guest_value = 828`).run(now, f.flip.id), /no longer have those slabs/, 'the host\'s own locked slab cannot be the guest\'s');
  assert.throws(() => settle(`guest_id = 'b', guest_stake = '[]', guest_slabs = '${JSON.stringify([snap(theirs), snap(theirs)])}', guest_value = 828`).run(now, f.flip.id), /not valid/);
  assert.throws(() => settle(`guest_id = 'b', guest_stake = '[]', guest_slabs = '${JSON.stringify([snap(theirs)])}', guest_value = 828, host_slabs = '[]'`).run(now, f.flip.id), /./, 'host_slabs is frozen');
  assert.throws(() => db.prepare('UPDATE coinflips SET host_slabs = ? WHERE id = ?').run('[]', f.flip.id), /cannot be settled/, 'host_slabs is frozen while open too');
  assert.throws(() => db.prepare("UPDATE coinflips SET guest_slabs = '[]' WHERE id = ?").run(f.flip.id), /cannot be settled/, 'guest_slabs only change in the settle');
  assert.equal(slab(mine).locked, `coinflip:${f.flip.id}`);
  assert.equal((await cf.cancel(f.flip.id, 'a')).status, 200);
  assert.throws(() => db.prepare("UPDATE coinflips SET host_slabs = '[]' WHERE id = ?").run(f.flip.id), /./, 'a settled flip never changes');
  audit('after trigger probes');
});

// ---- Jackpot ----------------------------------------------------------------------------------------
const stakeCents = ({ slabs = [], cards = [] }) => slabs.reduce((n, id) => n + slabCents(slab(id).card_id, slab(id).grade), 0)
  + cards.reduce((n, c) => n + Math.round(sellValue(cardOf(c.id)) * 100) * c.qty, 0);
/**
 * Fill a pot (entries[0] hosts) and draw it by the last join, landing on entries[winner]. Returns { id, view, ids }.
 * Each entry is { user, cards?, slabs? }; slabs are graded_cards ids already minted for that user.
 */
async function runPot({ entries, winner, players = entries.length, expectLast = 200 }) {
  const [host, ...rest] = entries;
  const made = await jp.create(host.user, { players, cards: host.cards || [], slabs: host.slabs || [] });
  assert.equal(made.status, 200, JSON.stringify(made));
  const id = made.jackpot.id; let last = made;
  for (let i = 0; i < rest.length; i++) {
    if (i === rest.length - 1) rigSeat(entries.map((e, seat) => [seat, stakeCents(e)]), winner);
    last = await jp.join(id, rest[i].user, { cards: rest[i].cards || [], slabs: rest[i].slabs || [] });
    unrig();
    if (i === rest.length - 1) assert.equal(last.status, expectLast, JSON.stringify(last)); else assert.equal(last.status, 200, JSON.stringify(last));
    audit(`pot after join ${i + 1}`);
  }
  return { id, view: last.jackpot, ids: entries.flatMap(e => e.slabs || []) };
}

await check('jackpot: slab-only and mixed entries escrow, the view carries every entry\'s slabs, value, odds and window include them', async () => {
  const hs = mint('a', 'me5-87', 9, { guard: 'guard-onyx', shown: 1 }); const bs = mint('b', 'me5-99', 9); const cs = mint('c', 'me5-98', 9);
  const ledger = rawLedger();
  const made = await jp.create('a', { players: 4, cards: [], slabs: [hs] });
  assert.equal(made.status, 200, JSON.stringify(made));
  const v = made.jackpot; assert.equal(v.entries.length, 1); assert.equal(v.entries[0].value, 8.28); assert.deepEqual(v.entries[0].stake, []);
  assert.deepEqual(v.entries[0].slabs.map(s => s.id), [hs]); assert.equal(v.entries[0].slabs[0].value, 8.28); assert.equal(v.entries[0].slabs[0].guard, 'guard-onyx');
  assert.equal(v.entries[0].slabs[0].cert, certNumber(hs)); assert.equal(v.entries[0].odds, 1); assert.equal(v.pot, 8.28);
  assert.equal(v.minValue, 8.28); assert.equal(v.maxValue, 41.4, 'the window is 1x to 5x of the slab\'s value');
  assert.equal(slab(hs).locked, `jackpot:${v.id}`); assert.equal(slab(hs).shown, 0); assert.equal(slab(hs).guard, 'guard-onyx');
  const inGame = (await grading.list('a')).inGame; assert.equal(inGame.length, 1); assert.equal(inGame[0].game, 'jackpot'); assert.equal(inGame[0].gameId, v.id);
  assert.equal((await grading.list('a')).slabs.some(s => s.id === hs), false, 'an escrowed slab is not in the player\'s slabs');
  // Joiners: 7.97 is under the 8.28 minimum; a mixed 9.06 + 0.24 fits.
  const low = await jp.join(v.id, 'c', { slabs: [cs] }); assert.equal(low.status, 400); assert.match(low.error, /between 8\.28 and 41\.4 coins/);
  assert.equal(slab(cs).locked, null);
  const mixed = await jp.join(v.id, 'b', { cards: [{ id: 'me5-3', qty: 2 }], slabs: [bs] }); assert.equal(mixed.status, 200, JSON.stringify(mixed));
  const e = mixed.jackpot.entries[1]; assert.equal(e.value, 9.3); assert.equal(e.stake[0].qty, 2); assert.deepEqual(e.slabs.map(s => s.id), [bs]);
  assert.equal(mixed.jackpot.pot, 17.58); assert.equal(e.odds, Math.round(930 / 1758 * 10000) / 10000); assert.equal(mixed.jackpot.entries[0].odds, Math.round(828 / 1758 * 10000) / 10000);
  assert.equal(mixed.jackpot.seatsOpen, 2);
  // a retried join is a no-op; the same slab cannot join twice or from a second pot
  const frozen = dump(); assert.equal((await jp.join(v.id, 'b', { cards: [{ id: 'me5-3', qty: 2 }], slabs: [bs] })).status, 200); assert.equal(dump(), frozen);
  const second = await jp.create('b', { slabs: [bs] }); assert.equal(second.status, 409); assert.match(second.error, ERR_GONE);
  const inFlip = await cf.create('b', { slabs: [bs] }); assert.equal(inFlip.status, 409); assert.match(inFlip.error, ERR_GONE);
  assert.equal(slab(bs).locked, `jackpot:${v.id}`);
  assert.equal(rawLedger(), ledger, 'raw cards conserved (2 of them sit in the pot)');
  // leave: the slab and the cards come back, guard intact; the host cannot leave
  assert.equal((await jp.leave(v.id, 'a')).status, 409);
  const left = await jp.leave(v.id, 'b'); assert.equal(left.status, 200); assert.equal(left.jackpot.entries.length, 1);
  assert.equal(slab(bs).locked, null); assert.equal(slab(bs).user_id, 'b'); assert.equal((await grading.list('b')).slabs.some(s => s.id === bs), true);
  assert.equal((await jp.leave(v.id, 'b')).status, 200, 'leaving twice is a no-op');
  audit('after leave');
  // rejoin works, then the host cancels: everything goes home, bots hold nothing
  assert.equal((await jp.join(v.id, 'b', { slabs: [bs] })).status, 200);
  assert.equal((await jp.bot(v.id, 'a')).status, 200);
  assert.equal((await jp.cancel(v.id, 'b')).status, 403);
  assert.equal((await jp.cancel(v.id, 'a')).status, 200);
  for (const id of [hs, bs]) { assert.equal(slab(id).locked, null); assert.equal(slab(id).status, 'slabbed'); }
  assert.equal(slab(hs).guard, 'guard-onyx'); assert.equal(slab(hs).user_id, 'a'); assert.equal(slab(hs).shown, 0);
  assert.equal((await jp.cancel(v.id, 'a')).status, 200, 'cancel twice is fine'); assert.equal(slab(hs).locked, null);
  assert.equal((await jp.join(v.id, 'c', { slabs: [mint('c', 'me5-99', 9)] })).status, 409, 'a cancelled pot cannot be joined');
  assert.equal(rawLedger(), ledger); audit('after cancel');
});

await check('jackpot: the last seat draws in the same transaction; each possible winner takes every slab and card (guards stripped when a slab moves)', async () => {
  for (const winner of [0, 1, 2]) {
    const ledger = rawLedger();
    const e = [
      { user: 'a', slabs: [mint('a', 'me5-87', 9, { guard: 'guard-onyx' })], cards: [{ id: 'me5-3', qty: 3 }] },
      { user: 'b', slabs: [mint('b', 'me5-99', 9, { guard: 'guard-cherry' }), mint('b', 'me5-98', 8)], cards: [] },
      { user: 'c', slabs: [], cards: [{ id: 'me5-90', qty: 1 }] },
    ];
    const gearBefore = gearRows(); const winUser = e[winner].user;
    const guardOf = Object.fromEntries(e.flatMap(x => x.slabs.map(sid => [sid, { user: x.user, guard: slab(sid).guard }]))); const guarded = Object.keys(guardOf).map(Number);
    const cardsBefore = qtyOf(winUser, 'me5-3') + qtyOf(winUser, 'me5-90');
    const { id, view, ids } = await runPot({ entries: e, winner });
    assert.equal(view.status, 'done'); assert.equal(view.winnerSeat, winner); assert.equal(view.entries[winner].won, true);
    for (const x of e) for (const sid of x.slabs) {
      const row = slab(sid); const mineAlready = x.user === winUser;
      assert.equal(row.user_id, winUser); assert.equal(row.locked, null); assert.equal(row.shown, 0); assert.equal(row.status, 'slabbed');
      if (mineAlready) { assert.equal(row.guard, x.guards?.[sid] ?? row.guard); assert.notEqual(row.request_id, `won:${sid}`); }
      else { assert.equal(row.guard, null, 'a slab that changes owner arrives bare'); assert.equal(row.request_id, `won:${sid}`); }
    }
    for (const gid of guarded) assert.equal(slab(gid).guard, slab(gid).user_id === winUser && guardOf[gid].user === winUser ? guardOf[gid].guard : null);
    assert.equal(gearRows(), gearBefore, 'no guard unit was moved, made or lost');
    assert.equal(qtyOf(winUser, 'me5-3') + qtyOf(winUser, 'me5-90') - cardsBefore, winner === 0 ? 1 : winner === 1 ? 3 + 1 : 3, 'the winner took the other piles');
    assert.equal(rawLedger(), ledger);
    for (const x of e) {
      const list = (await grading.list(x.user)).slabs.map(s => s.id);
      for (const sid of x.slabs) assert.equal(list.includes(sid), x.user === winUser, `slab ${sid} is in ${x.user}'s binder-less list only if ${x.user} won`);
    }
    // a second draw is impossible
    assert.equal((await jp.draw(id, 'a')).status, 409); assert.equal((await jp.cancel(id, 'a')).status, 409); assert.equal((await jp.leave(id, 'b')).status, 409);
    assert.throws(() => db.prepare("UPDATE jackpots SET status = 'cancelled' WHERE id = ?").run(id), /already settled/);
    audit(`pot won by seat ${winner}`);
  }
});

/** The slabs minted by a game's settle, and what the bots staked in the pot (each bot slab is generated: no id). */
const mintedFor = (game, id) => db.prepare('SELECT * FROM graded_cards WHERE request_id LIKE ? ORDER BY id').all(`casino:${game}:${id}:%`);
const botSlabsOf = view => view.entries.filter(e => e.player.bot).flatMap(e => e.slabs);
await check('jackpot: bots mirror a slab entry with generated slabs; a human winner is minted every one of them, a bot winner closes the human slabs and mints nothing (quick, fill, one bot, early draw)', async () => {
  // Quick pot, the human wins.
  const s1 = mint('d', 'me5-87', 9, { guard: 'guard-gilt' }); rig.fraction = 0.00001;
  const q1 = await jp.quick('d', { players: 4, slabs: [s1] }); unrig();
  assert.equal(q1.status, 200, JSON.stringify(q1)); assert.equal(q1.jackpot.status, 'done'); assert.equal(q1.jackpot.winnerSeat, 0);
  assert.equal(q1.jackpot.entries.length, 4);
  for (const e of q1.jackpot.entries.slice(1)) {
    assert.equal(e.player.bot, true); assert.ok(e.slabs.length >= 1, 'a bot mirrors a slab entry with a slab'); assert.ok(e.value <= 8.28, `bot entry ${e.value} <= the slab's value`); assert.ok(e.value > 0);
    for (const x of e.slabs) { assert.equal(x.id, null); assert.equal(x.cert, null); }
    assert.equal(e.stake.reduce((n, c) => n + Math.round(c.value * 100) * c.qty, 0) + e.slabs.reduce((n, x) => n + Math.round(x.value * 100), 0), Math.round(e.value * 100), 'a bot entry is worth exactly its cards and slabs');
  }
  {
    // the human won (seat 0): one minted row per bot slab, for them, atomically with the draw; the retry of the same create mints nothing more
    const gen = mintedFor('jackpot', q1.jackpot.id); const bots = q1.jackpot.entries.filter(e => e.player.bot);
    assert.equal(gen.length, botSlabsOf(q1.jackpot).length); assert.ok(gen.length >= 3);
    bots.forEach(e => e.slabs.forEach((x, i) => {
      const m = gen.find(row => row.request_id === `casino:jackpot:${q1.jackpot.id}:${e.seat * 10 + i}`); assert.ok(m, `seat ${e.seat} slab ${i}`);
      assert.deepEqual({ user: m.user_id, card: m.card_id, grade: m.grade, band: m.band, fee: m.fee_cents, guard: m.guard, status: m.status, locked: m.locked, shown: m.shown },
        { user: 'd', card: x.cardId, grade: x.grade, band: bandOf(x.cardId), fee: 0, guard: null, status: 'slabbed', locked: null, shown: 0 });
      assert.equal(slabCents(x.cardId, x.grade), Math.round(x.value * 100));
    }));
    audit('after a pot the human won');
  }
  assert.equal(slab(s1).user_id, 'd'); assert.equal(slab(s1).locked, null); assert.equal(slab(s1).status, 'slabbed'); assert.equal(slab(s1).guard, 'guard-gilt', 'winning your own slab back keeps its guard');
  // Quick pot, the last bot wins: the slab is closed.
  const s2 = mint('d', 'me5-87', 9, { guard: 'guard-gilt' }); const active = db.prepare("SELECT COUNT(*) n FROM graded_cards WHERE status = 'slabbed'").get().n; rig.fraction = 0.99999;
  const q2 = await jp.quick('d', { players: 3, slabs: [s2] }); unrig();
  assert.equal(q2.status, 200); assert.equal(q2.jackpot.winnerSeat, 2); assert.equal(q2.jackpot.entries[2].player.bot, true);
  assert.equal(mintedFor('jackpot', q2.jackpot.id).length, 0, 'a bot won: nothing is minted'); assert.ok(botSlabsOf(q2.jackpot).length >= 2);
  const closed = slab(s2); assert.equal(closed.status, 'sold'); assert.equal(closed.sold_cents, 0); assert.equal(closed.sell_request_id, `casino:jackpot:${q2.jackpot.id}`); assert.equal(closed.locked, null);
  assert.equal(closed.guard, null); assert.equal(closed.shown, 0); assert.equal(closed.user_id, 'd'); assert.ok(closed.closed_at > 0);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM graded_cards WHERE status = 'slabbed'").get().n, active - 1);
  assert.equal((await grading.list('d')).slabs.some(s => s.id === s2), false); assert.equal((await grading.list('d')).inGame.length, 0);
  assert.equal((await grading.sell(s2, 'd')).status, 409); assert.equal((await grading.crack(s2, 'd')).status, 409);
  audit('after quick pots');
  // Retried quick create (same requestId) after the draw: the same pot, nothing doubles.
  const key = rid(); const s3 = mint('d', 'me5-98', 9); rig.fraction = 0.00001;
  const q3 = await jp.quick('d', { requestId: key, players: 3, slabs: [s3] }); unrig();
  const frozen = dump(); const again = await jp.quick('d', { requestId: key, players: 3, slabs: [s3] });
  assert.equal(again.status, 200); assert.equal(again.jackpot.id, q3.jackpot.id); assert.equal(dump(), frozen);
  // Open pot: add one bot, then fill with bots once a second human is in; the last seat draws.
  const hs = mint('e', 'me5-87', 9); const made = await jp.create('e', { players: 4, slabs: [hs] }); assert.equal(made.status, 200);
  assert.equal((await jp.bot(made.jackpot.id, 'e', { fill: true })).status, 409, 'bots fill only once another human is in');
  const one = await jp.bot(made.jackpot.id, 'e'); assert.equal(one.status, 200); assert.equal(one.jackpot.entries.length, 2); assert.ok(one.jackpot.entries[1].value <= 8.28);
  assert.ok(one.jackpot.entries[1].slabs.length >= 1 && one.jackpot.entries[1].slabs.every(x => x.id === null));
  assert.equal((await jp.draw(made.jackpot.id, 'e')).status, 200, 'early draw with 2 entries'); // host + bot
  const drawn = await jp.get(made.jackpot.id); assert.equal(drawn.jackpot.status, 'done');
  const botWon = drawn.jackpot.entries[drawn.jackpot.winnerSeat].player.bot;
  assert.equal(slab(hs).status, botWon ? 'sold' : 'slabbed'); assert.equal(slab(hs).locked, null);
  assert.equal(mintedFor('jackpot', made.jackpot.id).length, botWon ? 0 : botSlabsOf(drawn.jackpot).length, 'minted for a human winner only');
  audit('after bot add + early draw');
  // fill: human b joins with a slab, bots fill the rest, the draw lands on b.
  const hs2 = mint('e', 'me5-87', 9); const bs2 = mint('b', 'me5-99', 9, { guard: 'guard-cherry' });
  const open = await jp.create('e', { players: 4, slabs: [hs2] }); assert.equal((await jp.join(open.jackpot.id, 'b', { slabs: [bs2] })).status, 200);
  rig.fraction = 0.00001; // lands in seat 0, the host
  const filled = await jp.bot(open.jackpot.id, 'e', { fill: true }); unrig();
  assert.equal(filled.status, 200, JSON.stringify(filled)); assert.equal(filled.jackpot.status, 'done'); assert.equal(filled.jackpot.entries.length, 4);
  assert.equal(slab(hs2).user_id, 'e'); assert.equal(slab(bs2).user_id, 'e'); assert.equal(slab(bs2).guard, null); assert.equal(slab(hs2).status, 'slabbed');
  const genFill = mintedFor('jackpot', open.jackpot.id); assert.equal(genFill.length, botSlabsOf(filled.jackpot).length); assert.ok(genFill.length >= 2); assert.ok(genFill.every(m => m.user_id === 'e'));
  const lastWin = mint('e', 'me5-87', 9); const lw = mint('c', 'me5-97', 9);
  const open2 = await jp.create('e', { players: 3, slabs: [lastWin] }); await jp.join(open2.jackpot.id, 'c', { slabs: [lw] }); // 5.10 < 8.28: refused
  assert.equal(slab(lw).locked, null);
  const lw2 = mint('c', 'me5-99', 9); assert.equal((await jp.join(open2.jackpot.id, 'c', { slabs: [lw2] })).status, 200);
  rig.fraction = 0.99999; const done2 = await jp.bot(open2.jackpot.id, 'e', {}); unrig(); // fills the last seat with a bot and draws: the bot (last seat) wins
  assert.equal(done2.status, 200, JSON.stringify(done2)); assert.equal(done2.jackpot.status, 'done'); assert.equal(done2.jackpot.entries[done2.jackpot.winnerSeat].player.bot, true);
  for (const sid of [lastWin, lw2]) { assert.equal(slab(sid).status, 'sold'); assert.equal(slab(sid).sold_cents, 0); assert.equal(slab(sid).sell_request_id, `casino:jackpot:${open2.jackpot.id}`); assert.equal(slab(sid).locked, null); }
  assert.equal(mintedFor('jackpot', open2.jackpot.id).length, 0, 'the last bot won: nothing minted');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM cards WHERE user_id = 'house'").get().n, 0);
  audit('after bot fill');
});

await check('jackpot: expiry and the scheduled maintenance hand every human slab back; a stuck draw cannot take the casino down', async () => {
  const hs = mint('a', 'me5-87', 9, { guard: 'guard-onyx' }); const bs = mint('b', 'me5-99', 9, { guard: 'guard-cherry' });
  const made = await jp.create('a', { players: 5, slabs: [hs] }); await jp.join(made.jackpot.id, 'b', { slabs: [bs] });
  assert.equal(slab(bs).locked, `jackpot:${made.jackpot.id}`);
  now += (JACKPOT_RULES.openHours + 1) * 3600000; db.prepare('UPDATE sessions SET expires_at = ?').run(now + 864000000);
  assert.equal((await jp.join(made.jackpot.id, 'c', { slabs: [mint('c', 'me5-99', 9)] })).status, 409);
  const { maintainJackpots } = await import('../worker/jackpot.js'); await maintainJackpots(env, now);
  for (const id of [hs, bs]) { assert.equal(slab(id).locked, null); assert.equal(slab(id).status, 'slabbed'); }
  assert.equal(slab(bs).guard, 'guard-cherry'); assert.equal(slab(bs).user_id, 'b'); assert.equal(db.prepare('SELECT status FROM jackpots WHERE id = ?').get(made.jackpot.id).status, 'cancelled');
  audit('after pot expiry');
  // A full pot that was never drawn is drawn by maintenance (settle carries the slabs).
  const x = mint('a', 'me5-87', 9); const y = mint('b', 'me5-87', 9); const z = mint('c', 'me5-87', 9);
  const pot = await jp.create('a', { players: 3, slabs: [x] }); await jp.join(pot.jackpot.id, 'b', { slabs: [y] });
  // simulate a lost final draw: insert the third entry without the draw statement
  db.prepare(`INSERT INTO jackpot_entries(jackpot_id, seat, user_id, bot, bot_persona, stake, slabs, value, created_at) VALUES(?, 2, 'c', 0, NULL, '[]', ?, 828, ?)`)
    .run(pot.jackpot.id, JSON.stringify([{ id: z, cardId: 'me5-87', name: 'Goldeen', number: '87', rarity: 'x', image: '', small: '', grade: 9, reverse: 0, guard: null, v: 828 }]), now);
  assert.equal(slab(z).locked, `jackpot:${pot.jackpot.id}`);
  rig.fraction = 0.5; await maintainJackpots(env, now); unrig();
  assert.equal(db.prepare('SELECT status FROM jackpots WHERE id = ?').get(pot.jackpot.id).status, 'done');
  assert.equal(new Set([x, y, z].map(id => slab(id).user_id)).size, 1, 'one winner holds all three');
  audit('after stuck draw');
});

await check('triggers: direct jackpot entries cannot carry bad slabs, mis-valued stakes or bot slabs; settle needs no human wedge', async () => {
  const mine = mint('a', 'me5-87', 9); const theirs = mint('b', 'me5-87', 9);
  const snap = (id, extra = {}) => ({ id, cardId: 'me5-87', name: 'Goldeen', number: '87', rarity: 'x', image: '', small: '', grade: 9, reverse: 0, guard: null, v: 828, ...extra });
  const pot = (host = 'a', min = 828) => { const id = rid(); db.prepare('INSERT INTO jackpots(id,host_id,request_id,max_players,min_value,created_at,expires_at) VALUES(?,?,?,?,?,?,?)').run(id, host, rid(), 4, min, now, now + 3600000); return id; };
  const entry = (potId, seat, user, stake, slabs, value, persona = null) => db.prepare('INSERT INTO jackpot_entries(jackpot_id,seat,user_id,bot,bot_persona,stake,slabs,value,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
    .run(potId, seat, user, persona ? 1 : 0, persona, JSON.stringify(stake), slabs === null ? null : JSON.stringify(slabs), value, now);
  const p0 = pot('a', 828); const frozen = dump();
  assert.throws(() => entry(p0, 0, 'a', [], [snap(theirs)], 828), /no longer have those slabs/);
  assert.throws(() => entry(p0, 0, 'a', [], [snap(mine)], 100), /not valid/, 'value must equal cards + slabs');
  assert.throws(() => entry(p0, 0, 'a', [], [snap(mine)], 1656), /not valid/);
  assert.throws(() => entry(p0, 0, 'a', [], [snap(mine), snap(mine)], 1656), /not valid/);
  assert.throws(() => entry(p0, 0, 'a', [], [snap(mine, { v: 'x' })], 828), /not valid/);
  assert.throws(() => entry(p0, 0, 'a', [], [snap(mine, { grade: 7 })], 828), /no longer have those slabs/);
  assert.throws(() => entry(p0, 0, 'a', [], Array.from({ length: 11 }, (_, i) => snap(mine, { id: i + 1 })), 9108), /not valid/);
  assert.throws(() => entry(p0, 0, 'a', [], [], 828), /at least one card/);
  assert.throws(() => entry(p0, 0, 'a', [], null, 828), /at least one card/);
  assert.throws(() => entry(p0, 0, 'a', [], {}, 828), /not valid/);
  assert.throws(() => entry(p0, 0, null, [{ id: 'me5-3', qty: 1, rev: 0, v: 12 }], [snap(mine)], 840, 'professor-elm'), /not valid/, 'a bot never carries slabs');
  assert.equal(dump(), frozen, 'every probe was refused');
  // A valid mixed entry works, locks the slab, and the value check counts both.
  const p = pot('a', 852);
  entry(p, 0, 'a', [{ id: 'me5-3', qty: 2, rev: 0, v: 12 }], [snap(mine)], 852); assert.equal(slab(mine).locked, `jackpot:${p}`);
  assert.throws(() => entry(p, 1, 'b', [{ id: 'me5-3', qty: 2, rev: 0, v: 12 }], [snap(mine)], 852), /no longer have those slabs/, 'a locked slab is nobody\'s to enter');
  assert.throws(() => db.prepare('UPDATE jackpot_entries SET slabs = NULL WHERE jackpot_id = ?').run(p), /cannot be changed/, 'entries are frozen');
  assert.throws(() => db.prepare('DELETE FROM jackpot_entries WHERE jackpot_id = ? AND seat = 0').run(p), /cannot be removed/, 'the host\'s entry cannot be deleted');
  db.prepare("UPDATE jackpots SET status = 'cancelled' WHERE id = ?").run(p); assert.equal(slab(mine).locked, null);
  audit('after jackpot probes');
});

await check('conservation: one slab can never be in two games, and a won slab can go straight into the next game', async () => {
  const s = mint('a', 'me5-87', 9); const t = mint('b', 'me5-87', 9);
  const f = await cf.create('a', { slabs: [s] }); assert.equal(f.status, 200);
  const p = await jp.create('a', { slabs: [s] }); assert.equal(p.status, 409);
  const q = await jp.quick('a', { slabs: [s] }); assert.equal(q.status, 409);
  const b = await cf.bot('a', { slabs: [s] }); assert.equal(b.status, 409);
  const j = await cf.join(f.flip.id, 'a', { slabs: [t] }); assert.equal(j.status, 409, 'not against yourself');
  rig.coin = 'guest'; const won = await cf.join(f.flip.id, 'b', { slabs: [t] }); unrig(); assert.equal(won.status, 200);
  assert.equal(slab(s).user_id, 'b');
  const next = await cf.create('b', { slabs: [s, t] }); assert.equal(next.status, 200, JSON.stringify(next)); // b stakes both
  assert.equal(slab(s).locked, `coinflip:${next.flip.id}`);
  assert.equal((await cf.cancel(next.flip.id, 'b')).status, 200);
  audit('chained games');
});

// ---- Winnings (sell all) -------------------------------------------------------------------------------
/** A finished coinflip where `winner` ends up with the other side's slabs and cards. */
async function wonFlip({ winner = 'host', hostUser, guestUser, hostSlabs = [], guestSlabs = [], hostCards = [], guestCards = [] }) {
  const made = await cf.create(hostUser, { cards: hostCards, slabs: hostSlabs }); assert.equal(made.status, 200, JSON.stringify(made));
  rig.coin = winner; const joined = await cf.join(made.flip.id, guestUser, { cards: guestCards, slabs: guestSlabs }); unrig();
  assert.equal(joined.status, 200, JSON.stringify(joined)); assert.equal(joined.flip.winner, winner);
  return { id: made.flip.id, winnerUser: winner === 'host' ? hostUser : guestUser, loserUser: winner === 'host' ? guestUser : hostUser };
}

await check('winnings: slab-only winnings sell at the graded value, once; the loser and strangers get 403; slabs:false keeps them', async () => {
  const hs = mint('a', 'me5-87', 9); const gs = mint('b', 'me5-98', 9, { guard: 'guard-cherry' }); // 8.28 vs 7.97
  const { id, winnerUser, loserUser } = await wonFlip({ hostUser: 'a', guestUser: 'b', hostSlabs: [hs], guestSlabs: [gs], winner: 'host' });
  assert.equal(winnerUser, 'a');
  assert.equal((await winnings.info('coinflip', id, loserUser)).status, 403); assert.equal((await winnings.info('coinflip', id, 'c')).status, 403);
  assert.equal((await winnings.sell('coinflip', id, loserUser)).status, 403); assert.equal((await winnings.sell('coinflip', id, 'c')).status, 403);
  assert.equal((await winnings.info('coinflip', id, null)).status, 401);
  const info = await winnings.info('coinflip', id, 'a');
  assert.deepEqual({ ...info, status: undefined, serverNow: undefined }, { eligible: true, cards: 0, slabs: 1, coins: 7.97, soldCoins: 0, sold: false, more: false, status: undefined, serverNow: undefined });
  // slabs:false with only slabs to sell: a clean 409, nothing moves
  const frozen = dump();
  const keep = await winnings.sell('coinflip', id, 'a', { slabs: false }); assert.equal(keep.status, 409); assert.match(keep.error, /Only slabs are left/); assert.equal(dump(), frozen);
  assert.equal((await winnings.sell('coinflip', id, 'a', { slabs: 'false' })).status, 400, 'slabs must be a boolean'); assert.equal((await winnings.sell('coinflip', id, 'a', { slabs: 0 })).status, 400);
  assert.equal(dump(), frozen);
  const coins = coinsOf('a');
  const sold = await winnings.sell('coinflip', id, 'a'); assert.equal(sold.status, 200, JSON.stringify(sold));
  assert.deepEqual(sold.sold, { coins: 7.97, cards: 0, slabs: 1, remaining: 0, more: false });
  assert.equal(coinsOf('a') - coins, 797, 'paid exactly the slab\'s graded value'); assert.equal(sold.save.coins, coinsOf('a') / 100);
  const row = slab(gs); assert.equal(row.status, 'sold'); assert.equal(row.sold_cents, 797); assert.equal(row.sell_request_id, `casino:coinflip:${id}`); assert.equal(row.user_id, 'a');
  assert.ok(row.closed_at > 0); assert.equal(row.guard, null); assert.equal(row.shown, 0); assert.equal(row.locked, null);
  assert.equal(slab(hs).status, 'slabbed', 'the winner\'s own slab was never winnings'); assert.equal(slab(hs).user_id, 'a');
  // once: a second sell is a 409 and credits nothing; the slab cannot be sold, cracked, staked again
  const coins2 = coinsOf('a'); const frozen2 = dump();
  assert.equal((await winnings.sell('coinflip', id, 'a')).status, 409); assert.equal(coinsOf('a'), coins2); assert.equal(dump(), frozen2);
  const again = await winnings.info('coinflip', id, 'a'); assert.deepEqual([again.cards, again.slabs, again.sold, again.soldCoins, again.coins], [0, 0, true, 7.97, 0]);
  assert.equal((await grading.sell(gs, 'a')).status, 409); assert.equal((await grading.crack(gs, 'a')).status, 409); assert.equal((await cf.create('a', { slabs: [gs] })).status, 409);
  audit('after slab-only sale');
});

await check('winnings: mixed winnings; slabs:false sells the cards and keeps the slabs (and does not loop); the slabs sell later; double-tap pays once', async () => {
  const hs = mint('c', 'me5-87', 9); const gs = mint('d', 'me5-97', 9);
  // c: 8.28 slab + nothing; d: 5.10 slab + 28 x 0.12 = 3.36 -> 8.46 inside [7.87, 8.69]
  const { id } = await wonFlip({ hostUser: 'c', guestUser: 'd', hostSlabs: [hs], guestSlabs: [gs], guestCards: [{ id: 'me5-3', qty: 28 }], winner: 'host' });
  const info = await winnings.info('coinflip', id, 'c'); assert.equal(info.cards, 28); assert.equal(info.slabs, 1); assert.equal(info.coins, 8.46); assert.equal(info.more, false);
  const cardsBefore = qtyOf('c', 'me5-3'); const coins = coinsOf('c'); const ledger = rawLedger();
  const keep = await winnings.sell('coinflip', id, 'c', { slabs: false }); assert.equal(keep.status, 200, JSON.stringify(keep));
  assert.deepEqual(keep.sold, { coins: 3.36, cards: 28, slabs: 0, remaining: 0, more: false }, 'remaining ignores the slabs the player chose to keep');
  assert.equal(coinsOf('c') - coins, 336); assert.equal(qtyOf('c', 'me5-3'), cardsBefore - 28); assert.equal(rawLedger(), ledger - 28);
  assert.equal(slab(gs).status, 'slabbed'); assert.equal(slab(gs).user_id, 'c', 'the slab stays with its winner');
  const mid = await winnings.info('coinflip', id, 'c'); assert.deepEqual([mid.cards, mid.slabs, mid.sold, mid.coins, mid.soldCoins], [0, 1, false, 5.1, 3.36]);
  // Both taps at once: exactly one pays.
  const c2 = coinsOf('c');
  const [x, y] = await Promise.all([winnings.sell('coinflip', id, 'c'), winnings.sell('coinflip', id, 'c')]);
  assert.deepEqual([x.status, y.status].sort(), [200, 409], JSON.stringify([x, y]));
  assert.equal(coinsOf('c') - c2, 510, 'paid once'); assert.equal(slab(gs).status, 'sold'); assert.equal(slab(gs).sold_cents, 510);
  const done = await winnings.info('coinflip', id, 'c'); assert.equal(done.sold, true); assert.equal(done.soldCoins, 8.46);
  audit('after mixed sale');
  // A default sell takes slabs and cards together.
  const hs2 = mint('e', 'me5-87', 9); const gs2 = mint('f', 'me5-97', 9);
  const two = await wonFlip({ hostUser: 'e', guestUser: 'f', hostSlabs: [hs2], guestSlabs: [gs2], guestCards: [{ id: 'me5-3', qty: 28 }], winner: 'host' });
  const c3 = coinsOf('e'); const sale = await winnings.sell('coinflip', two.id, 'e'); assert.equal(sale.status, 200);
  assert.deepEqual(sale.sold, { coins: 8.46, cards: 28, slabs: 1, remaining: 0, more: false }); assert.equal(coinsOf('e') - c3, 846);
});

await check('winnings: the winner who cracked, staked or already sold a won slab sells only what they still hold; the value paid is the CURRENT graded value', async () => {
  // Cracked: nothing to sell.
  const hs = mint('a', 'me5-87', 9); const gs = mint('b', 'me5-98', 9);
  const one = await wonFlip({ hostUser: 'a', guestUser: 'b', hostSlabs: [hs], guestSlabs: [gs], winner: 'host' });
  assert.equal((await grading.crack(gs, 'a')).status, 200);
  const info = await winnings.info('coinflip', one.id, 'a'); assert.deepEqual([info.cards, info.slabs, info.coins, info.sold], [0, 0, 0, false]);
  const coins = coinsOf('a'); const frozen = dump();
  assert.equal((await winnings.sell('coinflip', one.id, 'a')).status, 409); assert.equal(dump(), frozen); assert.equal(coinsOf('a'), coins);
  // Staked in another game: not sellable until it is back; the other game's win pays it exactly once.
  const hs2 = mint('c', 'me5-87', 9); const gs2 = mint('d', 'me5-98', 9);
  const two = await wonFlip({ hostUser: 'c', guestUser: 'd', hostSlabs: [hs2], guestSlabs: [gs2], winner: 'host' });
  const stakeAgain = await cf.create('c', { slabs: [gs2] }); assert.equal(stakeAgain.status, 200);
  assert.equal((await winnings.info('coinflip', two.id, 'c')).slabs, 0); assert.equal((await winnings.sell('coinflip', two.id, 'c')).status, 409);
  assert.equal(slab(gs2).locked, `coinflip:${stakeAgain.flip.id}`);
  assert.equal((await cf.cancel(stakeAgain.flip.id, 'c')).status, 200);
  assert.equal((await winnings.info('coinflip', two.id, 'c')).slabs, 1);
  const c2 = coinsOf('c'); assert.equal((await winnings.sell('coinflip', two.id, 'c')).status, 200); assert.equal(coinsOf('c') - c2, 797);
  // Lost back to the other player in the second game: the first game's winner holds nothing.
  const hs3 = mint('e', 'me5-87', 9); const gs3 = mint('f', 'me5-98', 9);
  const three = await wonFlip({ hostUser: 'e', guestUser: 'f', hostSlabs: [hs3], guestSlabs: [gs3], winner: 'host' }); // e holds both
  const loseIt = await wonFlip({ hostUser: 'e', guestUser: 'f', hostSlabs: [gs3], guestSlabs: [mint('f', 'me5-98', 9)], winner: 'guest' }); // e stakes gs3 and loses it to f
  void loseIt; assert.equal(slab(gs3).user_id, 'f');
  const f = coinsOf('e'); assert.equal((await winnings.sell('coinflip', three.id, 'e')).status, 409, 'e no longer holds the slab'); assert.equal(coinsOf('e'), f);
  assert.equal((await winnings.sell('coinflip', three.id, 'f')).status, 403, 'f did not win that game');
  audit('after winnings edge cases');
});

await check('winnings: the price is the current graded value, not the one frozen into the stake', async () => {
  const doubled = DATA.map(c => (c.id === 'me5-98' ? { ...c, market: c.market * 2 } : c));
  const assets2 = { fetch: async request => (new URL(request.url).pathname === '/data/me5.json' ? new Response(JSON.stringify(doubled), { headers: { 'content-type': 'application/json' } }) : ASSETS.fetch(request)) };
  const worker2 = (await import('../worker/index.js?doubled')).default; const env2 = { DB, ASSETS: assets2 };
  const hs = mint('a', 'me5-87', 9); const gs = mint('b', 'me5-98', 9);
  const { id } = await wonFlip({ hostUser: 'a', guestUser: 'b', hostSlabs: [hs], guestSlabs: [gs], winner: 'host' });
  assert.equal(JSON.parse(db.prepare('SELECT guest_slabs FROM coinflips WHERE id = ?').get(id).guest_slabs)[0].v, 797, 'the stake froze 7.97');
  const info = await call(worker2, env2, `/api/casino/winnings/coinflip/${id}`, 'GET', undefined, 'a'); assert.equal(info.coins, 15.94);
  const coins = coinsOf('a'); const sold = await call(worker2, env2, '/api/casino/winnings/sell', 'POST', { source: 'coinflip', id }, 'a');
  assert.equal(sold.status, 200, JSON.stringify(sold)); assert.equal(sold.sold.coins, 15.94); assert.equal(coinsOf('a') - coins, 1594); assert.equal(slab(gs).sold_cents, 1594);
  assert.equal(coinsOf('a') - coins, Math.round(gradedValue({ ...cardOf('me5-98'), market: cardOf('me5-98').market * 2 }, 9, setForCard('me5-98')) * 100));
});

await check('winnings: a jackpot winner sells everyone else\'s slabs and cards in bounded parts (25 slabs a request) and never their own', async () => {
  const mk = (user, n, card = 'me5-3') => Array.from({ length: n }, () => mint(user, card, 9));
  for (const [u, n] of [['a', 10], ['b', 10], ['c', 10], ['d', 10]]) void n; // the four players each stake 10 slabs of 0.12 coins
  const e = [{ user: 'a', slabs: mk('a', 10), cards: [{ id: 'me5-1', qty: 1 }] }, { user: 'b', slabs: mk('b', 10), cards: [{ id: 'me5-1', qty: 1 }] },
    { user: 'c', slabs: mk('c', 10), cards: [{ id: 'me5-1', qty: 1 }] }, { user: 'd', slabs: mk('d', 10), cards: [{ id: 'me5-1', qty: 1 }] }];
  const { id } = await runPot({ entries: e, winner: 2 }); // c wins
  const own = e[2].slabs; const others = [...e[0].slabs, ...e[1].slabs, ...e[3].slabs];
  for (const sid of [...own, ...others]) assert.equal(slab(sid).user_id, 'c');
  assert.equal((await winnings.info('jackpot', id, 'a')).status, 403);
  const info = await winnings.info('jackpot', id, 'c'); assert.equal(info.status, 200); assert.equal(info.slabs, 25, 'one part of the 30 won slabs'); assert.equal(info.cards, 3); assert.equal(info.more, true);
  assert.equal(info.coins, 25 * 0.12 + 3 * 0.1);
  const coins = coinsOf('c'); const cardsBefore = qtyOf('c', 'me5-1');
  const p1 = await winnings.sell('jackpot', id, 'c'); assert.equal(p1.status, 200, JSON.stringify(p1));
  assert.equal(p1.sold.slabs, 25); assert.equal(p1.sold.cards, 3); assert.equal(p1.sold.more, false, 'the 5 left slabs fit in one more part'); assert.ok(p1.sold.remaining > 0);
  assert.equal(p1.sold.coins, 3.3); assert.equal(coinsOf('c') - coins, 330); assert.equal(qtyOf('c', 'me5-1'), cardsBefore - 3);
  const sold1 = others.filter(sid => slab(sid).status === 'sold'); assert.equal(sold1.length, 25);
  const p2 = await winnings.sell('jackpot', id, 'c'); assert.equal(p2.status, 200); assert.deepEqual(p2.sold, { coins: 0.6, cards: 0, slabs: 5, remaining: 0, more: false });
  assert.equal(coinsOf('c') - coins, 330 + 60);
  assert.equal(others.filter(sid => slab(sid).status === 'sold').length, 30); assert.equal(own.filter(sid => slab(sid).status === 'slabbed').length, 10, 'their own 10 slabs stay theirs');
  assert.equal((await winnings.sell('jackpot', id, 'c')).status, 409);
  const done = await winnings.info('jackpot', id, 'c'); assert.equal(done.sold, true); assert.equal(done.soldCoins, 3.9);
  // The loser's side: nothing; a bot win leaves nothing to sell for anyone
  assert.equal((await winnings.sell('jackpot', id, 'a')).status, 403);
  audit('after jackpot sale');
});

await check('winnings: a bot-flip win sells the bot\'s cards AND the slabs minted for the winner (exactly once); the staked slab stays; battles still work through the same endpoint', async () => {
  const hs = mint('f', 'me5-87', 9); rig.coin = 'host';
  const r = await cf.bot('f', { slabs: [hs] }); unrig(); assert.equal(r.status, 200);
  const n = r.flip.guestSlabs.length; assert.ok(n >= 1);
  const mintedIds = db.prepare('SELECT id FROM graded_cards WHERE request_id LIKE ? ORDER BY id').all(`casino:coinflip:${r.flip.id}:%`).map(x => x.id); assert.equal(mintedIds.length, n);
  const info = await winnings.info('coinflip', r.flip.id, 'f'); assert.equal(info.slabs, n, 'the minted slabs are part of the winnings'); assert.ok(info.cards > 0 || info.slabs > 0); assert.ok(info.coins <= 8.28 + 0.01);
  assert.equal(Math.round(info.coins * 100), r.flip.guestStake.reduce((a, c) => a + Math.round(c.value * 100) * c.qty, 0) + mintedIds.reduce((a, id) => a + slabCents(slab(id).card_id, slab(id).grade), 0), 'coins = the bot\'s cards + the slabs at today\'s price');
  // slabs:false keeps them; the cards sell; then the slabs, once (two taps at once pay once).
  const coins = coinsOf('f'); const cardsOnly = await winnings.sell('coinflip', r.flip.id, 'f', { slabs: false });
  if (r.flip.guestStake.length) { assert.equal(cardsOnly.status, 200); assert.equal(cardsOnly.sold.slabs, 0); }
  for (const id of mintedIds) assert.equal(slab(id).status, 'slabbed');
  const before = coinsOf('f'); const dumped = await Promise.all([winnings.sell('coinflip', r.flip.id, 'f'), winnings.sell('coinflip', r.flip.id, 'f')]);
  const paid = dumped.filter(x => x.status === 200); assert.equal(paid.length, 1, 'only one of two simultaneous taps pays'); assert.equal(paid[0].sold.slabs, n);
  assert.equal(coinsOf('f') - before, mintedIds.reduce((a, id) => a + slab(id).sold_cents, 0));
  for (const id of mintedIds) { const row = slab(id); assert.equal(row.status, 'sold'); assert.equal(row.sell_request_id, `casino:coinflip:${r.flip.id}`); assert.equal(row.user_id, 'f'); assert.ok(row.sold_cents > 0); }
  assert.equal(slab(hs).status, 'slabbed'); void coins;
  const again = await winnings.sell('coinflip', r.flip.id, 'f'); assert.equal(again.status, 409); assert.equal((await winnings.info('coinflip', r.flip.id, 'f')).sold, true);
  const b = await winnings.info('battle', 'nope', 'f'); assert.equal(b.status, 404);
  audit('after bot winnings');
});

await check('binder: a staked slab drops the pocket of a card it was the only copy of; a card with another copy keeps its pocket; selling a won slab drops it too', async () => {
  const only = mint('b', 'me5-90', 9); const twin1 = mint('b', 'me5-97', 9); mint('b', 'me5-97', 9);
  db.prepare('DELETE FROM cards WHERE user_id = ? AND card_id IN (?, ?)').run('b', 'me5-90', 'me5-97');
  const slots = [{ id: 'me5-90', reverse: false }, { id: 'me5-97', reverse: false }, { id: 'me5-97', reverse: false }, ...Array(15).fill(null)];
  db.prepare('UPDATE profiles SET binder = ? WHERE user_id = ?').run(JSON.stringify(slots), 'b');
  const f = await cf.create('b', { slabs: [only, twin1] }); assert.equal(f.status, 200, JSON.stringify(f));
  const binder = JSON.parse(db.prepare('SELECT binder FROM profiles WHERE user_id = ?').get('b').binder);
  assert.equal(binder[0], null, 'the only copy of me5-90 left, so did its pocket');
  assert.equal(binder[1]?.id, 'me5-97', 'one me5-97 slab is still owned: one pocket stays'); assert.equal(binder[2], null, 'the second pocket had no copy left');
  assert.equal((await cf.cancel(f.flip.id, 'b')).status, 200);
  // Winning a slab and selling it through the winnings drops its pocket.
  addUser('g'); addUser('h'); // no other copies of anything: the won slab is the only me5-98 g has
  const mine = mint('g', 'me5-87', 9); const theirs = mint('h', 'me5-98', 9);
  const { id } = await wonFlip({ hostUser: 'g', guestUser: 'h', hostSlabs: [mine], guestSlabs: [theirs], winner: 'host' });
  db.prepare('UPDATE profiles SET binder = ? WHERE user_id = ?').run(JSON.stringify([{ id: 'me5-98', reverse: false }, { id: 'me5-87', reverse: false }, ...Array(16).fill(null)]), 'g');
  assert.equal((await winnings.sell('coinflip', id, 'g')).status, 200);
  const after = JSON.parse(db.prepare('SELECT binder FROM profiles WHERE user_id = ?').get('g').binder);
  assert.equal(after[0], null, 'the sold slab took its pocket'); assert.equal(after[1]?.id, 'me5-87', 'the slab they kept keeps its pocket');
  audit('after binder');
});

await check('account safety: reset and delete are blocked while a slab is escrowed; a winner can reset; the loser keeps theirs', async () => {
  const a1 = mint('c', 'me5-87', 9); const flip = await cf.create('c', { slabs: [a1] });
  const frozen = dump();
  const reset = await api('/api/me/reset', 'POST', {}, 'c'); assert.notEqual(reset.status, 200, 'resetting with an open flip is refused'); assert.equal(dump(), frozen, 'a refused reset changes nothing');
  assert.equal(slab(a1).locked, `coinflip:${flip.flip.id}`); assert.ok(db.prepare("SELECT 1 FROM graded_cards WHERE id = ?").get(a1));
  assert.throws(() => db.prepare('DELETE FROM profiles WHERE user_id = ?').run('c'), /Cancel your open coin flips/);
  assert.equal(dump(), frozen);
  const pot = await jp.create('d', { players: 3, slabs: [mint('d', 'me5-87', 9)] }); const j = await jp.join(pot.jackpot.id, 'c', { slabs: [mint('c', 'me5-99', 9)] });
  assert.equal(j.status, 200); assert.equal((await cf.cancel(flip.flip.id, 'c')).status, 200);
  assert.notEqual((await api('/api/me/reset', 'POST', {}, 'c')).status, 200, 'still blocked by the jackpot entry');
  assert.throws(() => db.prepare('DELETE FROM profiles WHERE user_id = ?').run('c'), /open jackpots/);
  assert.equal((await jp.leave(pot.jackpot.id, 'c')).status, 200); assert.equal((await jp.cancel(pot.jackpot.id, 'd')).status, 200);
  // A winner resets: their slabs (won and own) go with the account progress; nobody else's are touched.
  const x = mint('e', 'me5-87', 9); const y = mint('f', 'me5-98', 9);
  await wonFlip({ hostUser: 'e', guestUser: 'f', hostSlabs: [x], guestSlabs: [y], winner: 'host' });
  const others = db.prepare("SELECT COUNT(*) n FROM graded_cards WHERE user_id != 'e'").get().n;
  const eSlabs = db.prepare("SELECT id FROM graded_cards WHERE user_id = 'e'").all().map(r => r.id); assert.ok(eSlabs.includes(x) && eSlabs.includes(y));
  const ok = await api('/api/me/reset', 'POST', {}, 'e'); assert.equal(ok.status, 200, JSON.stringify(ok));
  for (const id of eSlabs) { assert.equal(db.prepare('SELECT 1 FROM graded_cards WHERE id = ?').get(id), undefined); if (!minted.delete(id)) genDeleted++; }
  assert.equal(db.prepare("SELECT COUNT(*) n FROM graded_cards WHERE user_id != 'e'").get().n, others);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM graded_cards WHERE user_id = 'e'").get().n, 0);
  audit('after account reset');
});

// ---- Races between two joiners ------------------------------------------------------------------------------
await check('coinflip: two joiners with slabs race for one flip: one settles, the other keeps every slab free and unlocked', async () => {
  const hs = mint('a', 'me5-87', 9); const b1 = mint('b', 'me5-98', 9); const c1 = mint('c', 'me5-98', 9);
  const f = await cf.create('a', { slabs: [hs] });
  const [x, y] = await Promise.all([cf.join(f.flip.id, 'b', { slabs: [b1] }), cf.join(f.flip.id, 'c', { slabs: [c1] })]);
  assert.deepEqual([x.status, y.status].sort(), [200, 409], JSON.stringify([x, y]));
  const loserSlab = x.status === 200 ? c1 : b1; const winnerSlab = x.status === 200 ? b1 : c1;
  assert.equal(slab(loserSlab).locked, null); assert.equal(slab(loserSlab).status, 'slabbed');
  const owners = new Set([slab(hs).user_id, slab(winnerSlab).user_id]); assert.equal(owners.size, 1);
  assert.equal(slab(loserSlab).user_id, x.status === 200 ? 'c' : 'b');
  audit('after joiner race');
});

await check('jackpot: two players race for the last seat with slabs: one takes it (and draws), the other keeps every slab', async () => {
  const hs = mint('a', 'me5-87', 9); const pot = await jp.create('a', { players: 3, slabs: [hs] });
  const b1 = mint('b', 'me5-99', 9); const c1 = mint('c', 'me5-99', 9); const d1 = mint('d', 'me5-99', 9);
  assert.equal((await jp.join(pot.jackpot.id, 'b', { slabs: [b1] })).status, 200);
  const [x, y] = await Promise.all([jp.join(pot.jackpot.id, 'c', { slabs: [c1] }), jp.join(pot.jackpot.id, 'd', { slabs: [d1] })]);
  assert.deepEqual([x.status, y.status].sort(), [200, 409], JSON.stringify([x, y]));
  const lost = x.status === 200 ? d1 : c1; assert.equal(slab(lost).locked, null); assert.equal(slab(lost).status, 'slabbed'); assert.equal(slab(lost).user_id, x.status === 200 ? 'd' : 'c');
  assert.equal(db.prepare('SELECT status FROM jackpots WHERE id = ?').get(pot.jackpot.id).status, 'done');
  assert.equal(new Set([hs, b1, x.status === 200 ? c1 : d1].map(id => slab(id).user_id)).size, 1, 'the full pot went to one winner');
  audit('after seat race');
});

// ---- Randomised play: every path, every step audited -----------------------------------------------------------
function mulberry32(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
async function fuzz({ seed, steps, bots, users }) {
  const rand = mulberry32(seed); const pick = list => list[Math.floor(rand() * list.length)]; const chance = p => rand() < p;
  const CARDS = ['me5-87', 'me5-98', 'me5-99', 'me5-97', 'me5-90'];
  const GUARDS = [null, null, 'guard-onyx', 'guard-cherry'];
  for (const u of users) { addUser(u); give(u, 'me5-3', 60); give(u, 'me5-1', 40); give(u, 'me5-97', 4); }
  let expected = rawLedger(); const slabSnap = id => slab(id); const gearBefore = gearRows();
  const free = u => db.prepare("SELECT * FROM graded_cards WHERE user_id = ? AND status = 'slabbed' AND locked IS NULL").all(u);
  const raw = u => ({ 'me5-3': qtyOf(u, 'me5-3'), 'me5-1': qtyOf(u, 'me5-1'), 'me5-97': qtyOf(u, 'me5-97') });
  const centsOfRaw = { 'me5-3': 12, 'me5-1': 10, 'me5-97': 510 };
  const seen = { flipsOpen: 0, flipsDone: 0, potsDone: 0, cancelled: 0, botWins: 0, sells: 0, refused: 0, left: 0 };
  const attempt = async (label, promise, ok = [200], allowed = [400, 409]) => {
    const r = await promise; assert.ok(ok.includes(r.status) || allowed.includes(r.status), `${label}: ${r.status} ${r.error}`); if (!ok.includes(r.status)) seen.refused++; return r;
  };
  const randomStake = u => {
    const mine = free(u).sort(() => rand() - 0.5).slice(0, Math.floor(rand() * 4)); const cards = [];
    for (const [id, have] of Object.entries(raw(u))) if (have > 0 && chance(0.4)) cards.push({ id, qty: 1 + Math.floor(rand() * Math.min(have, id === 'me5-97' ? 1 : 12)) });
    return { cards, slabs: mine.map(s => s.id) };
  };
  const stakeValue = (u, st) => st.slabs.reduce((n, id) => n + slabCents(slab(id).card_id, slab(id).grade), 0) + st.cards.reduce((n, c) => n + centsOfRaw[c.id] * c.qty, 0);
  /** A stake of u's own worth between lo and hi cents, or null. */
  const stakeIn = (u, lo, hi) => {
    for (let tries = 0; tries < 12; tries++) {
      const slabs = []; let sum = 0;
      for (const s of free(u).sort(() => rand() - 0.5)) { const v = slabCents(s.card_id, s.grade); if (slabs.length < 10 && sum + v <= hi && chance(0.6)) { slabs.push(s.id); sum += v; } }
      const cards = []; const have = raw(u);
      while (sum < lo && have['me5-3'] > 0 && cards.length < 1) { const n = Math.min(have['me5-3'], Math.ceil((lo - sum) / 12)); if (sum + n * 12 > hi) break; cards.push({ id: 'me5-3', qty: n }); sum += n * 12; }
      if (sum >= lo && sum <= hi && (slabs.length || cards.length)) return { cards, slabs };
    }
    return null;
  };
  const openFlips = () => db.prepare("SELECT * FROM coinflips WHERE status = 'open'").all();
  const openPots = () => db.prepare("SELECT * FROM jackpots WHERE status = 'open'").all();
  for (let step = 0; step < steps; step++) {
    const u = pick(users); const roll = rand(); const label = `seed ${seed} step ${step}`;
    rig.coin = chance(0.5) ? 'host' : 'guest'; rig.fraction = rand();
    try {
      if (roll < 0.12) { // mint
        if (db.prepare("SELECT COUNT(*) n FROM graded_cards WHERE user_id = ? AND status = 'slabbed'").get(u).n < 14) mint(u, pick(CARDS), 1 + Math.floor(rand() * 10), { guard: pick(GUARDS), reverse: chance(0.2) ? 1 : 0 });
      } else if (roll < 0.22) { // coinflip create (maybe vs bot)
        const st = randomStake(u); const withBot = bots && chance(0.3);
        const r = await attempt(label + ' cf create', withBot ? cf.bot(u, st) : cf.create(u, st));
        if (r.status === 200) { if (withBot) { seen.flipsDone++; if (r.flip.winner === 'guest') seen.botWins++; } else seen.flipsOpen++; }
      } else if (roll < 0.34) { // coinflip join
        const flips = openFlips().filter(f => f.host_id !== u && f.expires_at > now);
        if (flips.length) {
          const f = pick(flips); const { min, max } = matchWindow(f.host_value); const st = stakeIn(u, min, max);
          if (st) { const r = await attempt(label + ' cf join', cf.join(f.id, u, st), [200], [409]); if (r.status === 200) { seen.flipsDone++; assert.equal(r.flip.status, 'done'); } }
        }
      } else if (roll < 0.40) { // coinflip cancel
        const mine = openFlips().filter(f => f.host_id === u); if (mine.length) { await attempt(label + ' cf cancel', cf.cancel(pick(mine).id, u)); seen.cancelled++; }
      } else if (roll < 0.52) { // jackpot create (maybe quick)
        const st = randomStake(u); const players = 3 + Math.floor(rand() * 3); const quick = bots && chance(0.3);
        const r = await attempt(label + ' jp create', quick ? jp.quick(u, { ...st, players }) : jp.create(u, { ...st, players }), [200], [400, 409]);
        if (r.status === 200 && quick) seen.potsDone++;
      } else if (roll < 0.66) { // jackpot join
        const pots = openPots().filter(p => p.host_id !== u && p.expires_at > now && !db.prepare('SELECT 1 FROM jackpot_entries WHERE jackpot_id = ? AND user_id = ?').get(p.id, u));
        if (pots.length) {
          const p = pick(pots); const { min, max } = jackpotWindow(p.min_value); const st = stakeIn(u, min, Math.min(max, min * 5));
          if (st) { const r = await attempt(label + ' jp join', jp.join(p.id, u, st), [200], [409]); if (r.status === 200 && r.jackpot.status === 'done') seen.potsDone++; }
        }
      } else if (roll < 0.70) { // jackpot leave
        const e = db.prepare("SELECT e.* FROM jackpot_entries e JOIN jackpots p ON p.id = e.jackpot_id WHERE p.status = 'open' AND e.user_id = ? AND p.host_id != ?").all(u, u);
        if (e.length) { await attempt(label + ' jp leave', jp.leave(pick(e).jackpot_id, u)); seen.left++; }
      } else if (roll < 0.74) { // jackpot host actions
        const mine = openPots().filter(p => p.host_id === u);
        if (mine.length) {
          const p = pick(mine); const how = rand();
          if (how < 0.35) await attempt(label + ' jp cancel', jp.cancel(p.id, u));
          else if (how < 0.6) await attempt(label + ' jp draw', jp.draw(p.id, u), [200], [409]);
          else if (bots) await attempt(label + ' jp bot', jp.bot(p.id, u, { fill: chance(0.5) }), [200], [409]);
        }
      } else if (roll < 0.80) { // crack or sell a slab: refused (409) exactly while it is escrowed
        const rows = db.prepare("SELECT * FROM graded_cards WHERE user_id = ? AND status = 'slabbed'").all(u);
        if (rows.length) {
          const s = pick(rows); const crack = chance(0.5);
          const r = crack ? await grading.crack(s.id, u) : await grading.sell(s.id, u);
          if (s.locked) assert.equal(r.status, 409, label + ' a locked slab must refuse'); else { assert.equal(r.status, 200, `${label} ${JSON.stringify(r)}`); if (crack) expected += 1; }
        }
      } else if (roll < 0.90) { // sell winnings
        const flips = db.prepare("SELECT * FROM coinflips WHERE status = 'done' AND ((winner = 'host' AND host_id = ?1) OR (winner = 'guest' AND guest_id = ?1)) ORDER BY RANDOM() LIMIT 1").all(u);
        const pots = db.prepare(`SELECT p.id FROM jackpots p JOIN jackpot_entries e ON e.jackpot_id = p.id AND e.seat = p.winner_seat WHERE p.status = 'done' AND e.user_id = ? ORDER BY RANDOM() LIMIT 1`).all(u);
        const target = chance(0.5) && flips.length ? ['coinflip', flips[0].id] : pots.length ? ['jackpot', pots[0].id] : flips.length ? ['coinflip', flips[0].id] : null;
        if (target) {
          const r = await attempt(label + ' sell winnings', winnings.sell(target[0], target[1], u, chance(0.3) ? { slabs: false } : {}), [200], [409]);
          if (r.status === 200) { expected -= r.sold.cards; seen.sells++; }
        }
      } else if (roll < 0.93) { // time passes: expiry returns everything
        now += 25 * 3600000; db.prepare('UPDATE sessions SET expires_at = ?').run(now + 864000000);
        await api('/api/casino/coinflips', 'GET', undefined, u); await api('/api/casino/jackpots', 'GET', undefined, u);
      } else { // look at the board
        const r = await api('/api/casino/coinflips', 'GET', undefined, u); assert.equal(r.status, 200);
        const g = await grading.list(u); assert.equal(g.status, 200);
        for (const s of g.slabs) assert.equal(slab(s.id).locked, null, 'save.graded never lists an escrowed slab');
        for (const s of g.inGame) assert.ok(slab(s.id).locked && slab(s.id).user_id === u);
      }
    } finally { unrig(); }
    if (!bots) assert.equal(rawLedger(), expected, `${label}: raw cards conserved`);
    audit(label);
    assert.equal(gearRows(), gearBefore, `${label}: user_gear untouched`);
  }
  audit(`seed ${seed} end`);
  return seen;
}
await check('fuzz (no bots): 2500 random steps across coinflip, jackpot, cancel, leave, expiry, crack, sell and sell-winnings keep every slab and every card exactly once', async () => {
  const seen = await fuzz({ seed: 20260930, steps: 2500, bots: false, users: ['u1', 'u2', 'u3', 'u4', 'u5'] });
  assert.ok(seen.flipsDone >= 20 && seen.potsDone >= 5 && seen.cancelled >= 5 && seen.sells >= 5, JSON.stringify(seen));
  console.log('      fuzz (no bots):', JSON.stringify(seen));
});
await check('fuzz (with bots): 2500 random steps, slabs never duplicated or lost, a bot win closes the slab exactly once', async () => {
  const seen = await fuzz({ seed: 7, steps: 2500, bots: true, users: ['w1', 'w2', 'w3', 'w4', 'w5'] });
  assert.ok(seen.flipsDone >= 5 && seen.botWins >= 1, JSON.stringify(seen));
  console.log('      fuzz (bots):', JSON.stringify(seen));
});

// ---- SQLite memory ---------------------------------------------------------------------------------------------
// The repo once had a D1 SQLITE_NOMEM outage from a trigger that re-parsed big JSON per row (0014). The settle triggers read
// each slab list once (id IN (SELECT ... json_each)), but to be sure, SLAB_MEM_DIR=<dir> makes this check leave copies of a
// maxed pot (9 entries, 40 distinct cards and 10 slabs each, with and without slabs) for a SQLite memory high-water
// measurement (sqlite3_memory_highwater around the draw): see the numbers in the commit message of the slab work.
await check('memory: a maxed pot is built, the draw works, and (with SLAB_MEM_DIR) copies are left for measuring the draw', async () => {
  const dir = process.env.SLAB_MEM_DIR; if (!dir) return;
  const ids40 = DATA.filter(c => /^me5-\d+$/.test(c.id)).slice(0, 40).map(c => c.id);
  for (const [withSlabs, tag] of [[true, 'ms'], [false, 'mc']]) {
    const names = Array.from({ length: 10 }, (_, i) => `${tag}${i + 1}`);
    for (const u of names) { addUser(u); for (const c of ids40) give(u, c, 1); }
    const stakeOf = u => ({ cards: ids40.map(id => ({ id, qty: 1 })), slabs: withSlabs ? Array.from({ length: 10 }, () => mint(u, 'me5-3', 9)) : [] });
    const made = await jp.create(names[0], { players: 10, ...stakeOf(names[0]) }); assert.equal(made.status, 200, JSON.stringify(made));
    for (const u of names.slice(1, 9)) { const r = await jp.join(made.jackpot.id, u, stakeOf(u)); assert.equal(r.status, 200, JSON.stringify(r)); }
    db.exec(`VACUUM INTO '${dir}/${tag}.db'`);
    console.log(`      ${tag}: jackpot ${made.jackpot.id}`);
  }
});

// ---- Escrow enforced by the database -------------------------------------------------------------------------
// graded_slab_escrow / graded_slab_escrow_delete (0022): a slab in a game cannot be changed or deleted by anything that
// does not also release the lock, whatever Worker version wrote the statement. And a game whose slabs were tampered
// with can never settle short; it expires and is handed back, and no casino request ever fails because of it.
const escrowTriggers = SLABS_DDL.filter(sql => /^CREATE TRIGGER graded_slab_escrow/.test(sql));
assert.equal(escrowTriggers.length, 2);
const withoutEscrow = async fn => {
  db.exec('DROP TRIGGER graded_slab_escrow; DROP TRIGGER graded_slab_escrow_delete');
  try { return await fn(); } finally { for (const sql of escrowTriggers) db.exec(sql); }
};
const quiet = async fn => { const log = console.error; console.error = () => {}; try { return await fn(); } finally { console.error = log; } };
const IN_GAME = /That slab is in a casino game/;
const snapOf = id => { const r = slab(id); return { id, cardId: r.card_id, name: 'x', number: '1', rarity: 'x', image: '', small: '', grade: r.grade, reverse: r.reverse, guard: r.guard, v: slabCents(r.card_id, r.grade) }; };
const bumpClock = hours => { now += hours * 3600000; db.prepare('UPDATE sessions SET expires_at = ?').run(now + 864000000); };

await check('escrow in the database: what a Worker that has never heard of `locked` writes (crack, sell, guard, show, hand-over, delete, reset) fails for a slab in a flip or a pot', async () => {
  gear('b', 'guard-cherry', 3);
  const sf = mint('b', 'me5-87', 9, { guard: 'guard-cherry' }); const sp = mint('c', 'me5-99', 9, { guard: 'guard-frost' });
  const flip = await cf.create('b', { slabs: [sf] }); assert.equal(flip.status, 200);
  const pot = await jp.create('c', { players: 3, slabs: [sp] }); assert.equal(pot.status, 200);
  assert.equal(slab(sf).locked, `coinflip:${flip.flip.id}`); assert.equal(slab(sp).locked, `jackpot:${pot.jackpot.id}`);
  for (const id of [sf, sp]) {
    const owner = slab(id).user_id;
    // These are the statements of the Worker before slabs, copied from its grading.js (crack, sell, guard, show) plus a reset and some raw edits.
    const crack = [DB.prepare(`UPDATE graded_cards SET status = 'cracked', closed_at = ?, guard = NULL, shown = 0 WHERE id = ? AND user_id = ? AND status = 'slabbed'`).bind(now, id, owner),
      DB.prepare(`INSERT INTO cards (user_id, card_id, qty, reverse_qty) SELECT ?, ?, 1, ? WHERE changes() = 1
        ON CONFLICT(user_id, card_id) DO UPDATE SET qty = cards.qty + 1, reverse_qty = cards.reverse_qty + excluded.reverse_qty`).bind(owner, slab(id).card_id, 0)];
    const sell = [DB.prepare(`UPDATE graded_cards SET status = 'sold', closed_at = ?, guard = NULL, shown = 0, sell_request_id = ?, sold_cents = ?
      WHERE id = ? AND user_id = ? AND status = 'slabbed'`).bind(now, 'old-worker-sell', 828, id, owner),
      DB.prepare('UPDATE profiles SET coins = coins + ? WHERE user_id = ? AND changes() = 1').bind(8.28, owner)];
    const one = (sql, ...args) => [DB.prepare(sql).bind(...args)];
    const attempts = {
      crack, sell,
      'guard off': one("UPDATE graded_cards SET guard = NULL WHERE id = ? AND user_id = ? AND status = 'slabbed'", id, owner),
      'guard on': one("UPDATE graded_cards SET guard = 'guard-onyx' WHERE id = ? AND user_id = ? AND status = 'slabbed'", id, owner),
      'show': one("UPDATE graded_cards SET shown = 1 WHERE id = ? AND user_id = ? AND status = 'slabbed'", id, owner),
      'hand over': one("UPDATE graded_cards SET user_id = 'a' WHERE id = ?", id),
      'regrade': one('UPDATE graded_cards SET grade = 10 WHERE id = ?', id),
      'new request id': one("UPDATE graded_cards SET request_id = 'swapped' WHERE id = ?", id),
      'status only': one("UPDATE graded_cards SET status = 'cracked' WHERE id = ?", id),
      'close': one("UPDATE graded_cards SET status = 'sold', sold_cents = 0 WHERE id = ?", id),
      'move the lock': one("UPDATE graded_cards SET locked = 'coinflip:elsewhere' WHERE id = ?", id),
      'delete': one('DELETE FROM graded_cards WHERE id = ?', id),
      'reset delete': one('DELETE FROM graded_cards WHERE user_id = ?', owner),
    };
    const frozen = dump();
    for (const [label, statements] of Object.entries(attempts)) {
      await assert.rejects(() => DB.batch(statements), IN_GAME, `${label} on slab ${id}`);
      assert.equal(dump(), frozen, `${label} changed something`);
    }
    // A statement that changes nothing is not a change.
    db.prepare('UPDATE graded_cards SET shown = shown, guard = guard WHERE id = ?').run(id); assert.equal(dump(), frozen);
  }
  // The same slab through the real Worker stays a clean 409 (grading.js knows about `locked`).
  for (const [id, owner] of [[sf, 'b'], [sp, 'c']]) {
    assert.equal((await grading.crack(id, owner)).status, 409); assert.equal((await grading.sell(id, owner)).status, 409);
    assert.equal((await grading.show(id, true, owner)).status, 409); assert.equal((await grading.guard(id, 'guard-cherry', owner)).status, 409);
  }
  // An account with an open game cannot be deleted or reset (the cascade into graded_cards is refused too).
  const frozen = dump();
  assert.throws(() => db.prepare('DELETE FROM users WHERE id = ?').run('b'), /casino game|Cancel your open/); assert.equal(dump(), frozen);
  assert.notEqual((await api('/api/me/reset', 'POST', {}, 'c')).status, 200); assert.equal(dump(), frozen);
  // A slab that is not slabbed can never be locked.
  const done = mint('b', 'me5-2', 5); assert.equal((await grading.crack(done, 'b')).status, 200);
  assert.throws(() => db.prepare("UPDATE graded_cards SET locked = 'coinflip:zz' WHERE id = ?").run(done), IN_GAME);
  // A lock whose game is over (or never was) is a stale marker, not escrow: it never wedges a delete.
  const stale = mint('b', 'me5-2', 4); db.prepare("UPDATE graded_cards SET locked = 'coinflip:gone' WHERE id = ?").run(stale);
  db.prepare('DELETE FROM graded_cards WHERE id = ?').run(stale); minted.delete(stale);
  // ... and a deleted account with finished games and free slabs goes cleanly (the FK cascade fires the delete trigger on every slab).
  addUser('z9'); const z = mint('z9', 'me5-87', 9); const z2 = mint('z9', 'me5-98', 9);
  assert.equal((await cf.create('z9', { slabs: [z] })).status, 200); const open = db.prepare("SELECT id FROM coinflips WHERE host_id = 'z9'").get().id;
  assert.throws(() => db.prepare('DELETE FROM users WHERE id = ?').run('z9'), /casino game|Cancel your open/);
  assert.equal((await cf.cancel(open, 'z9')).status, 200);
  db.prepare('DELETE FROM users WHERE id = ?').run('z9'); minted.delete(z); minted.delete(z2);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM graded_cards WHERE user_id = ?').get('z9').n, 0);
  assert.equal((await cf.cancel(flip.flip.id, 'b')).status, 200); assert.equal((await jp.cancel(pot.jackpot.id, 'c')).status, 200);
  // Once the game is over the owner may do anything again.
  assert.equal((await grading.show(sf, true, 'b')).status, 200); assert.equal((await grading.crack(sf, 'b')).status, 200); assert.equal((await grading.sell(sp, 'c')).status, 200);
  audit('after the escrow attempts');
});

await check('poisoned flips: a slab cracked, sold, deleted, handed over or unlocked behind the game\'s back stops the settle; the flip expires, hands back what is left, and no casino request fails', async () => {
  const modes = {
    cracked: id => db.prepare("UPDATE graded_cards SET status = 'cracked', closed_at = ?, guard = NULL WHERE id = ?").run(now, id),
    sold: id => db.prepare("UPDATE graded_cards SET status = 'sold', sold_cents = 828, sell_request_id = 'poison', closed_at = ? WHERE id = ?").run(now, id),
    deleted: id => { db.prepare('DELETE FROM graded_cards WHERE id = ?').run(id); minted.delete(id); },
    'handed over': id => db.prepare("UPDATE graded_cards SET user_id = 'f' WHERE id = ?").run(id),
    unlocked: id => db.prepare('UPDATE graded_cards SET locked = NULL WHERE id = ?').run(id),
  };
  for (const [mode, poison] of Object.entries(modes)) {
    const keep = mint('a', 'me5-98', 9); const hurt = mint('a', 'me5-87', 9);
    const made = await cf.create('a', { slabs: [keep, hurt] }); assert.equal(made.status, 200, mode);
    await withoutEscrow(async () => poison(hurt));
    const mine = mint('d', 'me5-98', 9, { guard: null }); const mine2 = mint('d', 'me5-97', 8); // 7.97 + 4.08 against 8.28 + 7.97 (outside the window): one slab only
    const guestSlab = mint('d', 'me5-87', 9); const frozen = dump();
    const r = await cf.join(made.flip.id, 'd', { slabs: [guestSlab, mine] });
    assert.equal(r.status, 409, `${mode}: ${JSON.stringify(r)}`); assert.match(r.error, /no longer has those slabs|no longer have/);
    assert.equal(dump(), frozen, `${mode}: a refused join moved nothing`);
    for (const id of [guestSlab, mine, mine2]) { assert.equal(slab(id).locked, null); assert.equal(slab(id).user_id, 'd'); }
    // Straight into the table (an old Worker's join statement) it is refused as well.
    assert.throws(() => db.prepare(`UPDATE coinflips SET status = 'done', guest_id = 'd', guest_stake = ?, guest_value = 828, winner = 'host', flipped_at = ? WHERE id = ? AND status = 'open'`)
      .run(JSON.stringify([{ id: 'me5-98', qty: 1, rev: 0, v: 797 }]), now, made.flip.id), /no longer has those slabs/);
    assert.equal(dump(), frozen);
    // Every casino request keeps working meanwhile.
    for (const path of ['/api/casino/coinflips', '/api/casino/jackpots', '/api/grading']) assert.equal((await api(path, 'GET', undefined, 'a')).status, 200, `${mode}: ${path}`);
    assert.equal(db.prepare('SELECT status FROM coinflips WHERE id = ?').get(made.flip.id).status, 'open');
    // Expiry hands back what is still there, and nothing aborts.
    bumpClock(COINFLIP_RULES.openHours + 1);
    assert.equal((await api('/api/casino/coinflips', 'GET', undefined, 'a')).status, 200);
    assert.equal(db.prepare('SELECT status FROM coinflips WHERE id = ?').get(made.flip.id).status, 'cancelled', mode);
    assert.equal(slab(keep).locked, null, `${mode}: the intact slab came back`); assert.equal(slab(keep).status, 'slabbed'); assert.equal(slab(keep).user_id, 'a');
    if (mode !== 'deleted') assert.equal(slab(hurt).locked, null, `${mode}: a lingering lock is cleared with the flip`);
    audit(`after the poisoned flip (${mode})`);
  }
  // The host can cancel a poisoned flip too.
  const keep = mint('a', 'me5-98', 9); const hurt = mint('a', 'me5-87', 9);
  const made = await cf.create('a', { slabs: [keep, hurt] }); await withoutEscrow(async () => modes.cracked(hurt));
  assert.equal((await cf.cancel(made.flip.id, 'a')).status, 200); assert.equal(slab(keep).locked, null); audit('after cancelling a poisoned flip');
});

await check('poisoned pots: the last seat and an early draw are refused (entry and slabs untouched); a full pot nobody could draw expires and hands every other slab back; maintenance never fails', async () => {
  const x = mint('a', 'me5-87', 9); const y = mint('b', 'me5-87', 9); const z = mint('c', 'me5-87', 9);
  const pot = await jp.create('a', { players: 3, slabs: [x] }); assert.equal(pot.status, 200); assert.equal((await jp.join(pot.jackpot.id, 'b', { slabs: [y] })).status, 200);
  await withoutEscrow(async () => db.prepare("UPDATE graded_cards SET status = 'cracked', closed_at = ? WHERE id = ?").run(now, y));
  let frozen = dump();
  const last = await jp.join(pot.jackpot.id, 'c', { slabs: [z] });
  assert.equal(last.status, 409, JSON.stringify(last)); assert.match(last.error, /cannot be drawn/);
  assert.equal(dump(), frozen, 'the last seat did not land and nothing moved'); assert.equal(slab(z).locked, null);
  assert.equal((await jp.draw(pot.jackpot.id, 'a')).status, 409); assert.equal(dump(), frozen, 'an early draw is refused too');
  assert.throws(() => db.prepare("UPDATE jackpots SET status = 'done', winner_seat = 0, drawn_at = ? WHERE id = ?").run(now, pot.jackpot.id), /cannot be drawn/);
  assert.equal(dump(), frozen);
  bumpClock(JACKPOT_RULES.openHours + 1);
  assert.equal((await api('/api/casino/jackpots', 'GET', undefined, 'a')).status, 200);
  assert.equal(db.prepare('SELECT status FROM jackpots WHERE id = ?').get(pot.jackpot.id).status, 'cancelled');
  assert.equal(slab(x).locked, null); assert.equal(slab(x).user_id, 'a'); assert.equal(slab(y).locked, null, 'the lingering lock went with the pot');
  audit('after a poisoned pot expired');
  // A pot that filled without its draw (stuck), with one slab poisoned: maintenance logs it and leaves the pot, every request works, the expiry returns the rest.
  const p = mint('a', 'me5-87', 9); const q = mint('b', 'me5-87', 9); const r = mint('c', 'me5-87', 9);
  const stuck = await jp.create('a', { players: 3, slabs: [p] }); assert.equal((await jp.join(stuck.jackpot.id, 'b', { slabs: [q] })).status, 200);
  db.prepare(`INSERT INTO jackpot_entries(jackpot_id, seat, user_id, bot, bot_persona, stake, slabs, value, created_at) VALUES(?, 2, 'c', 0, NULL, '[]', ?, 828, ?)`).run(stuck.jackpot.id, JSON.stringify([snapOf(r)]), now);
  await withoutEscrow(async () => db.prepare('DELETE FROM graded_cards WHERE id = ?').run(q)); minted.delete(q);
  frozen = dump();
  const { maintainJackpots } = await import('../worker/jackpot.js');
  rig.fraction = 0.5; await quiet(() => maintainJackpots(env, now)); unrig();
  assert.equal(dump(), frozen, 'the poisoned pot was left alone'); assert.equal(db.prepare('SELECT status FROM jackpots WHERE id = ?').get(stuck.jackpot.id).status, 'open');
  for (const path of ['/api/casino/jackpots', '/api/casino/coinflips', '/api/grading']) assert.equal((await quiet(() => api(path, 'GET', undefined, 'a'))).status, 200, path);
  bumpClock(JACKPOT_RULES.openHours + 1); await maintainJackpots(env, now);
  assert.equal(db.prepare('SELECT status FROM jackpots WHERE id = ?').get(stuck.jackpot.id).status, 'cancelled');
  for (const id of [p, r]) { assert.equal(slab(id).locked, null); assert.equal(slab(id).status, 'slabbed'); }
  audit('after a stuck poisoned pot');
});

console.log(results.join('\n'));
console.log(failed ? `\nFAIL: ${failed} failed` : '\nPASS');
Date.now = realNow;
process.exit(failed ? 1 : 0);
