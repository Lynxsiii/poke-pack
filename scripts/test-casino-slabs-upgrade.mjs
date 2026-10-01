/* Upgrading a LIVE casino to graded slabs (migration 0022): a database that already holds open, settled and cancelled
   coinflips and jackpots with raw-only stakes (the 0015 to 0020 schema as it was) is upgraded by the Worker's lazy path,
   and every game keeps working: nothing dropped, nothing duplicated, a second upgrade is a no-op, old code's inserts still land.
   Runs the real Worker against SQLite (Node 22+): node scripts/test-casino-slabs-upgrade.mjs */
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { randomFillSync, createHash } from 'node:crypto';
import { seedLevel } from './lib/level-seed.mjs';
import worker from '../worker/index.js';
import { resetCasinoSchemaCache } from '../worker/casino.js';
import { resetJackpotSchemaCache, maintainJackpots } from '../worker/jackpot.js';
import { resetGradingSchemaCache } from '../worker/grading.js';
import { SLABS_DDL, SLABS_COLUMNS } from '../worker/casino-ddl.js';
import { SLABS_MARKER, SLABS_REQUIRED } from '../worker/casino-slabs.js';
import { COINFLIP_RULES } from '../js/casino-rules.js';

const results = [];
let failed = 0;
async function check(name, fn) {
  try { await fn(); results.push(`PASS  ${name}`); }
  catch (err) { failed++; results.push(`FAIL  ${name}\n      ${String(err?.stack || err).split('\n').slice(0, 16).join('\n      ')}`); }
}
const migrationDir = new URL('../worker/migrations/', import.meta.url);
const migrationFiles = readdirSync(migrationDir).sort();
const migrationSql = file => readFileSync(new URL(file, migrationDir), 'utf8');
const OLD_FILES = migrationFiles.filter(f => f < '0022'); // everything that existed before the slab work
assert.ok(OLD_FILES.includes('0020_grading_shown.sql') && !OLD_FILES.includes('0022_casino_slabs.sql'));

const rig = { coin: null, fraction: null };
Object.defineProperty(globalThis.crypto, 'getRandomValues', { configurable: true, writable: true, value(array) {
  if (rig.coin && array instanceof Uint8Array && array.length === 1) { array[0] = rig.coin === 'host' ? 1 : 0; return array; }
  if (rig.fraction != null && array instanceof Uint32Array && array.length === 2) { array[0] = Math.min(0xffffffff, Math.floor(rig.fraction * 2 ** 32)); array[1] = 0; return array; }
  return randomFillSync(array);
} });
const unrig = () => { rig.coin = null; rig.fraction = null; };
const realNow = Date.now; let now = realNow(); Date.now = () => now;

/** A fresh database at the OLD schema (0001 to 0020, applied as migrations, no Worker involved), with a statement log. */
function oldWorld(files = OLD_FILES) {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  for (const file of files) db.exec(migrationSql(file));
  // The live database already carries the social columns and tables the Worker adds at runtime (they are per-isolate cached).
  for (const sql of ["ALTER TABLE users ADD COLUMN avatar TEXT NOT NULL DEFAULT '25'", "ALTER TABLE users ADD COLUMN banner TEXT NOT NULL DEFAULT 'me5:darkrai'",
    'ALTER TABLE users ADD COLUMN showcase TEXT', 'ALTER TABLE users ADD COLUMN binder_pages TEXT', 'ALTER TABLE users ADD COLUMN shown_stats TEXT',
    "ALTER TABLE users ADD COLUMN avatar_style TEXT NOT NULL DEFAULT 'art'", 'ALTER TABLE users ADD COLUMN frame TEXT']) { try { db.exec(sql); } catch (err) { if (!/duplicate/.test(err.message)) throw err; } }
  const log = [];
  const DB = {
    exec: async sql => { log.push(sql); db.exec(sql); return {}; },
    prepare(sql) {
      let params = [];
      const s = {
        sql,
        bind(...values) { assert.ok(values.length <= 100, 'D1 parameter ceiling'); params = values; return s; },
        async all() { log.push(sql); return { results: db.prepare(sql).all(...params) }; },
        async first(column) { log.push(sql); const row = db.prepare(sql).get(...params); return column ? row?.[column] : row || null; },
        execute() { log.push(sql); const r = db.prepare(sql).run(...params); return { success: true, meta: { changes: Number(r.changes) } }; },
        async run() { return s.execute(); },
      }; return s;
    },
    batches: 0, failNext: null,
    async batch(statements) {
      DB.batches++;
      db.exec('BEGIN');
      try { const out = statements.map(s => s.execute()); db.exec('COMMIT'); return out; }
      catch (err) { db.exec('ROLLBACK'); throw err; }
    },
  };
  return { db, DB, log };
}
const ASSETS = { fetch: async request => {
  try { return new Response(readFileSync(new URL('..' + new URL(request.url).pathname, import.meta.url)), { headers: { 'content-type': 'application/json' } }); }
  catch { return new Response('', { status: 404 }); }
} };
const resetCaches = () => { resetCasinoSchemaCache(); resetJackpotSchemaCache(); resetGradingSchemaCache(); };
const apiFor = env => async (path, method = 'GET', body, user = 'o1') => {
  const res = await worker.fetch(new Request('https://poke-pack.rip' + path, { method,
    headers: { 'content-type': 'application/json', origin: 'https://poke-pack.rip', ...(user ? { cookie: `pp_sid=${user}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), env);
  return { status: res.status, ...await res.json() };
};
const rid = () => crypto.randomUUID();
const hash = value => createHash('sha1').update(JSON.stringify(value)).digest('hex');

const CARD = { 'me5-87': { name: 'Goldeen', number: '87', rarity: 'Illustration Rare', v: 828 }, 'me5-98': { name: 'x', number: '98', rarity: 'Rare', v: 797 },
  'me5-99': { name: 'y', number: '99', rarity: 'Rare', v: 906 }, 'me5-3': { name: 'z', number: '3', rarity: 'Common', v: 12 }, 'me5-97': { name: 'w', number: '97', rarity: 'Rare', v: 510 } };
const rawStake = list => list.map(([id, qty]) => ({ id, name: CARD[id].name, number: CARD[id].number, rarity: CARD[id].rarity, image: '', small: '', qty, rev: 0, v: CARD[id].v }));
const stakeValue = list => list.reduce((n, [id, qty]) => n + CARD[id].v * qty, 0);

/** Fill a world with what a live site would hold at the moment of the deploy. Returns ids by role. */
function populate(db) {
  const users = ['o1', 'o2', 'o3', 'o4', 'o5', 'o6', 'o7'];
  for (const id of users) {
    db.prepare('INSERT INTO users(id,name,handle,password_hash,color,created_at,last_played) VALUES(?,?,?,?,?,?,?)').run(id, id, id, 'unused', 'gold', now, now);
    db.prepare('INSERT INTO profiles(user_id,coins,granted,created_at,binder) VALUES(?,?,?,?,?)').run(id, 100, 100, now, '[]');
    db.prepare('INSERT INTO sessions(id,user_id,created_at,expires_at) VALUES(?,?,?,?)').run(id, id, now, now + 864000000); seedLevel(db, id);
    for (const [card, qty] of [['me5-87', 5], ['me5-98', 10], ['me5-99', 5], ['me5-3', 50], ['me5-97', 5]]) db.prepare('INSERT INTO cards(user_id,card_id,qty,reverse_qty) VALUES(?,?,?,0)').run(id, card, qty);
  }
  const ids = {};
  // Coinflips as the old Worker wrote them (the old triggers take the host's cards when the row goes in).
  const flip = (name, host, list, { expires = now + 20 * 3600000, bot = 0 } = {}) => {
    const id = crypto.randomUUID(); ids[name] = id;
    db.prepare(`INSERT INTO coinflips(id,host_id,request_id,bot,host_stake,host_value,host_coin,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?)`)
      .run(id, host, `req-${name}-0001`, bot, JSON.stringify(rawStake(list)), stakeValue(list), null, now - 1000, expires);
    return id;
  };
  flip('F_join', 'o1', [['me5-87', 1]]); flip('F_cancel', 'o2', [['me5-98', 2], ['me5-3', 5]]); flip('F_expired', 'o3', [['me5-99', 1]], { expires: now - 5000 });
  flip('F_done', 'o4', [['me5-97', 1]]); flip('F_cancelled', 'o5', [['me5-3', 10]]); flip('F_slabjoin', 'o6', [['me5-98', 1]]);
  db.prepare(`UPDATE coinflips SET status = 'done', guest_id = 'o5', guest_stake = ?, guest_value = 510, guest_coin = NULL, winner = 'host', flipped_at = ? WHERE id = ?`)
    .run(JSON.stringify(rawStake([['me5-97', 1]])), now - 500, ids.F_done);
  db.prepare("UPDATE coinflips SET status = 'cancelled' WHERE id = ?").run(ids.F_cancelled);
  // Jackpots likewise.
  const pot = (name, host, max, minValue, entries, { expires = now + 20 * 3600000 } = {}) => {
    const id = crypto.randomUUID(); ids[name] = id;
    db.prepare(`INSERT INTO jackpots(id,host_id,request_id,max_players,min_value,created_at,expires_at) VALUES(?,?,?,?,?,?,?)`).run(id, host, `req-${name}-0001`, max, minValue, now - 1000, Math.max(expires, now + 3600000));
    entries.forEach(([user, list, persona], seat) => db.prepare(`INSERT INTO jackpot_entries(jackpot_id,seat,user_id,bot,bot_persona,stake,value,created_at) VALUES(?,?,?,?,?,?,?,?)`)
      .run(id, seat, persona ? null : user, persona ? 1 : 0, persona || null, JSON.stringify(rawStake(list)), stakeValue(list), now - 900));
    if (expires < now) { // a pot that went stale while the site was live: the trigger that freezes expires_at is lifted for the setup only
      const lifted = ['jackpot_fixed', 'jackpot_settle_open'].map(name => db.prepare('SELECT sql FROM sqlite_master WHERE name = ?').get(name).sql);
      db.exec('DROP TRIGGER jackpot_fixed; DROP TRIGGER jackpot_settle_open');
      db.prepare('UPDATE jackpots SET expires_at = ? WHERE id = ?').run(expires, id); for (const sql of lifted) db.exec(sql);
    }
    return id;
  };
  pot('P_fill', 'o1', 5, 797, [['o1', [['me5-98', 1]]], ['o2', [['me5-98', 1]]], ['o3', [['me5-98', 2]]]]);
  pot('P_cancel', 'o2', 4, 797, [['o2', [['me5-98', 1]]], ['o3', [['me5-98', 1]]]]);
  pot('P_expired', 'o4', 4, 797, [['o4', [['me5-98', 1]]], ['o5', [['me5-98', 1]]]], { expires: now - 5000 });
  pot('P_slabjoin', 'o1', 4, 797, [['o1', [['me5-98', 1]]], ['o2', [['me5-98', 1]]]]);
  pot('P_done', 'o2', 3, 797, [['o2', [['me5-98', 1]]], ['o3', [['me5-98', 1]]], ['o4', [['me5-98', 1]]]]);
  db.prepare("UPDATE jackpots SET status = 'done', winner_seat = 1, drawn_at = ? WHERE id = ?").run(now - 400, ids.P_done);
  pot('P_cancelled', 'o3', 3, 797, [['o3', [['me5-98', 1]]], ['o4', [['me5-98', 1]]]]);
  db.prepare("UPDATE jackpots SET status = 'cancelled' WHERE id = ?").run(ids.P_cancelled);
  return ids;
}
const TABLES = ['users', 'profiles', 'cards', 'coinflips', 'jackpots', 'jackpot_entries', 'graded_cards', 'casino_sales'];
const oldColumns = (db, t) => db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name).filter(n => !['locked', 'host_slabs', 'guest_slabs', 'slabs'].includes(n));
const snapshot = db => Object.fromEntries(TABLES.filter(t => db.prepare('SELECT 1 FROM sqlite_master WHERE name = ?').get(t)).map(t =>
  [t, db.prepare(`SELECT ${oldColumns(db, t).join(', ')} FROM ${t} ORDER BY rowid`).all().map(r => ({ ...r }))]));
const triggerSql = db => Object.fromEntries(db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' ORDER BY name").all().map(r => [r.name, r.sql]));
const rawLedger = db => db.prepare('SELECT COALESCE(SUM(qty),0) n FROM cards').get().n
  + db.prepare("SELECT COALESCE(SUM(json_extract(j.value, '$.qty')), 0) n FROM coinflips f, json_each(f.host_stake) j WHERE f.status = 'open'").get().n
  + db.prepare(`SELECT COALESCE(SUM(json_extract(j.value, '$.qty')), 0) n FROM jackpot_entries e JOIN jackpots p ON p.id = e.jackpot_id, json_each(e.stake) j
    WHERE p.status = 'open' AND e.user_id IS NOT NULL`).get().n;
const qty = (db, user, card) => db.prepare('SELECT qty FROM cards WHERE user_id = ? AND card_id = ?').get(user, card)?.qty || 0;
// "Upgraded" means the slab code is in the triggers (the comment marker is only documentation), and the two new graded_cards triggers exist.
const hasMarker = db => Object.entries(SLABS_REQUIRED).every(([name, token]) => token.test(db.prepare('SELECT sql FROM sqlite_master WHERE name = ?').get(name)?.sql || ''));

// ---------------------------------------------------------------------------------------------------------------------
const world = oldWorld(); const { db, DB, log } = world; const env = { DB, ASSETS }; const api = apiFor(env);
const ids = populate(db);
const before = snapshot(db); const oldTriggers = triggerSql(db); const ledgerBefore = rawLedger(db);
await check('the world starts at the OLD schema: no slab columns, no marker, open games with raw stakes', () => {
  assert.equal(hasMarker(db), false); assert.equal(db.prepare("SELECT 1 FROM pragma_table_info('coinflips') WHERE name = 'host_slabs'").get(), undefined);
  assert.equal(db.prepare("SELECT 1 FROM pragma_table_info('graded_cards') WHERE name = 'locked'").get() === undefined, true);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM coinflips WHERE status = 'open'").get().n, 4); assert.equal(db.prepare("SELECT COUNT(*) n FROM jackpots WHERE status = 'open'").get().n, 4);
  assert.ok(ledgerBefore > 0);
});

await check('the first request upgrades in place: columns added, marker triggers in, no row changed or dropped, the open games listed', async () => {
  resetCaches();
  const listed = await api('/api/casino/coinflips', 'GET', undefined, null); assert.equal(listed.status, 200, JSON.stringify(listed));
  assert.ok(hasMarker(db), 'the replaced triggers carry the marker');
  const cols = t => db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name);
  assert.ok(cols('coinflips').includes('host_slabs') && cols('coinflips').includes('guest_slabs') && cols('jackpot_entries').includes('slabs') && cols('graded_cards').includes('locked'));
  const sameOldColumns = snapshot(db); // the old columns of every table, row by row
  for (const t of Object.keys(before)) {
    if (t === 'coinflips') continue; // the listing's maintenance expires one flip; checked below
    if (t === 'jackpots' || t === 'jackpot_entries' || t === 'cards' || t === 'profiles') continue; // the maintenance returns the expired games' cards; checked below
    assert.deepEqual(sameOldColumns[t], before[t], `${t} is unchanged`);
  }
  // Nothing was dropped: every old trigger is still there (replaced or kept) and the new ones were added.
  const nowTriggers = triggerSql(db);
  for (const name of Object.keys(oldTriggers)) assert.ok(nowTriggers[name], `${name} still exists`);
  for (const sql of SLABS_DDL) { const m = sql.match(/^CREATE TRIGGER (\w+)/); if (m) assert.ok(nowTriggers[m[1]], m[1]); }
  // The slab columns of every pre-existing row are NULL ("no slabs").
  assert.equal(db.prepare('SELECT COUNT(*) n FROM coinflips WHERE host_slabs IS NOT NULL OR guest_slabs IS NOT NULL').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM jackpot_entries WHERE slabs IS NOT NULL').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM coinflips').get().n, 6, 'no coinflip row was dropped'); assert.equal(db.prepare('SELECT COUNT(*) n FROM jackpots').get().n, 6);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM jackpot_entries').get().n, 14, 'no entry was dropped');
  // The expired games were cancelled by the maintenance and handed their raw cards back (and only those).
  assert.equal(db.prepare('SELECT status FROM coinflips WHERE id = ?').get(ids.F_expired).status, 'cancelled');
  assert.equal(db.prepare('SELECT status FROM jackpots WHERE id = ?').get(ids.P_expired).status, 'cancelled');
  assert.equal(rawLedger(db), ledgerBefore, 'cards are conserved through the upgrade and the expiries');
  assert.deepEqual(listed.open.map(f => f.id).sort(), [ids.F_join, ids.F_cancel, ids.F_slabjoin].sort(), 'the live open flips are listed');
  for (const f of listed.open) { assert.deepEqual(f.hostSlabs, []); assert.equal(f.guestSlabs, null); assert.ok(f.hostStake.length > 0); }
  const done = listed.done.find(f => f.id === ids.F_done); assert.deepEqual(done.guestSlabs, []); assert.deepEqual(done.hostSlabs, []);
});

await check('a second upgrade (a new isolate) is a no-op: no DDL, no batch, no write', async () => {
  const frozen = hash([snapshot(db), triggerSql(db)]);
  resetCaches(); const mark = log.length; const batches = DB.batches;
  assert.equal((await api('/api/casino/coinflips', 'GET', undefined, null)).status, 200); assert.equal((await api('/api/casino/jackpots', 'GET', undefined, null)).status, 200);
  // (ensureGradingSchema has always replayed its own CREATE ... IF NOT EXISTS on a cold start: harmless, and not ours.)
  const statements = log.slice(mark).filter(sql => !/^\s*CREATE (TABLE|INDEX) IF NOT EXISTS/i.test(sql) && /^\s*(ALTER|DROP|CREATE)/i.test(sql));
  assert.deepEqual(statements, [], 'no ALTER, no DROP, no trigger was created');
  assert.equal(DB.batches, batches + 0, 'no schema batch ran (a read request writes nothing to the schema)');
  assert.equal(hash([snapshot(db), triggerSql(db)]), frozen);
});

await check('old coinflips still settle and cancel with raw cards: joined by a raw player, cancelled by the host, expiry returned the third', async () => {
  const ledger = rawLedger(db); const hostCards = qty(db, 'o1', 'me5-87'); const guestCards = qty(db, 'o7', 'me5-87'); const o2Before = { c98: qty(db, 'o2', 'me5-98'), c3: qty(db, 'o2', 'me5-3') };
  rig.coin = 'guest';
  const joined = await api(`/api/casino/coinflips/${ids.F_join}/join`, 'POST', { cards: [{ id: 'me5-87', qty: 1 }] }, 'o7'); unrig();
  assert.equal(joined.status, 200, JSON.stringify(joined)); assert.equal(joined.flip.winner, 'guest'); assert.equal(joined.flip.guestValue, 8.28);
  assert.equal(qty(db, 'o1', 'me5-87'), hostCards, 'the host\'s staked card stays in the winner\'s hands only');
  assert.equal(qty(db, 'o7', 'me5-87'), guestCards + 1, 'the guest won the host\'s card and kept their own');
  assert.equal(rawLedger(db), ledger);
  const cancelled = await api(`/api/casino/coinflips/${ids.F_cancel}/cancel`, 'POST', {}, 'o2'); assert.equal(cancelled.status, 200);
  assert.equal(qty(db, 'o2', 'me5-98'), o2Before.c98 + 2); assert.equal(qty(db, 'o2', 'me5-3'), o2Before.c3 + 5); assert.equal(rawLedger(db), ledger);
  assert.equal(qty(db, 'o3', 'me5-99'), 5, 'the expired flip returned its card at the upgrade');
  assert.equal((await api(`/api/casino/coinflips/${ids.F_expired}/join`, 'POST', { cards: [{ id: 'me5-99', qty: 1 }] }, 'o7')).status, 409);
  assert.equal((await api(`/api/casino/coinflips/${ids.F_done}/cancel`, 'POST', {}, 'o4')).status, 409, 'a settled flip stays settled');
});

await check('old jackpots still fill, draw, cancel and expire with raw cards (the last seat draws in the join)', async () => {
  const ledger = rawLedger(db); const o1Before = qty(db, 'o1', 'me5-98');
  // P_fill has 3 of 5 seats: two more join, the last draws (seat 0 wins: the pre-upgrade host).
  const j4 = await api(`/api/casino/jackpots/${ids.P_fill}/join`, 'POST', { cards: [{ id: 'me5-98', qty: 1 }] }, 'o4'); assert.equal(j4.status, 200, JSON.stringify(j4));
  rig.fraction = 0.00001;
  const j5 = await api(`/api/casino/jackpots/${ids.P_fill}/join`, 'POST', { cards: [{ id: 'me5-98', qty: 1 }] }, 'o5'); unrig();
  assert.equal(j5.status, 200, JSON.stringify(j5)); assert.equal(j5.jackpot.status, 'done'); assert.equal(j5.jackpot.winnerSeat, 0);
  for (const e of j5.jackpot.entries) assert.deepEqual(e.slabs, [], 'an old entry has no slabs');
  assert.equal(rawLedger(db), ledger);
  assert.equal(qty(db, 'o1', 'me5-98'), o1Before + 6, 'the host won all 6 cards of the five entries (1+1+2+1+1), his own included');
  // Cancel returns the old entries' cards.
  const c = await api(`/api/casino/jackpots/${ids.P_cancel}/cancel`, 'POST', {}, 'o2'); assert.equal(c.status, 200);
  assert.equal(rawLedger(db), ledger);
  assert.equal((await api(`/api/casino/jackpots/${ids.P_done}/cancel`, 'POST', {}, 'o2')).status, 409, 'a drawn pot stays drawn');
  assert.equal((await api(`/api/casino/jackpots/${ids.P_expired}/join`, 'POST', { cards: [{ id: 'me5-98', qty: 1 }] }, 'o7')).status, 409);
  // A player leaves an old open pot and gets their own cards back.
  const leave = await api(`/api/casino/jackpots/${ids.P_slabjoin}/leave`, 'POST', {}, 'o2'); assert.equal(leave.status, 200); assert.equal(rawLedger(db), ledger);
});

await check('a player staking slabs joins an OLD open flip and an OLD open pot (cards and slabs settle together)', async () => {
  const mint = (user, card, grade) => Number(db.prepare(`INSERT INTO graded_cards(user_id,card_id,reverse,grade,band,fee_cents,request_id,status,created_at) VALUES(?,?,0,?,'me',541,?,'slabbed',?)`)
    .run(user, card, grade, `up-${user}-${card}-${Math.random()}`, now).lastInsertRowid);
  // The old flip (o6 staked one me5-98, 7.97): o7 answers with a me5-98 slab at grade 9 = 7.97.
  const slab = mint('o7', 'me5-98', 9); rig.coin = 'guest';
  const r = await api(`/api/casino/coinflips/${ids.F_slabjoin}/join`, 'POST', { cards: [], slabs: [slab] }, 'o7'); unrig();
  assert.equal(r.status, 200, JSON.stringify(r)); assert.equal(r.flip.guestSlabs.length, 1); assert.deepEqual(r.flip.hostSlabs, []); assert.equal(r.flip.winner, 'guest');
  assert.equal(db.prepare('SELECT user_id, locked FROM graded_cards WHERE id = ?').get(slab).user_id, 'o7');
  assert.equal(db.prepare('SELECT locked FROM graded_cards WHERE id = ?').get(slab).locked, null);
  const ledger = rawLedger(db);
  // The old open pot (o1 + o2 left: 1 entry... o1 hosts, 4 seats): a slab entry (7.97 + 0 = min) and a bot-less draw by two more.
  const s2 = mint('o6', 'me5-98', 9); const s3 = mint('o5', 'me5-98', 9);
  assert.equal((await api(`/api/casino/jackpots/${ids.P_slabjoin}/join`, 'POST', { cards: [{ id: 'me5-98', qty: 1 }] }, 'o3')).status, 200); // o2 left above: a raw seat on the old pot
  assert.equal((await api(`/api/casino/jackpots/${ids.P_slabjoin}/join`, 'POST', { slabs: [s2] }, 'o6')).status, 200);
  rig.fraction = 0.9999; // the last seat
  const last = await api(`/api/casino/jackpots/${ids.P_slabjoin}/join`, 'POST', { slabs: [s3], cards: [{ id: 'me5-3', qty: 1 }] }, 'o5'); unrig();
  assert.equal(last.status, 200, JSON.stringify(last)); assert.equal(last.jackpot.status, 'done');
  assert.equal(last.jackpot.entries[3].won, true);
  for (const id of [s2, s3]) assert.equal(db.prepare('SELECT user_id FROM graded_cards WHERE id = ?').get(id).user_id, 'o5');
  assert.equal(rawLedger(db), ledger, 'the old raw entries and the new mixed ones all reached the winner');
});

await check('old code\'s writes (no slab columns) still work after the upgrade: raw coinflip insert and settle, raw jackpot entries and draw', async () => {
  const ledger = rawLedger(db);
  // What a not-yet-restarted isolate of the old Worker does.
  const id = rid();
  db.prepare(`INSERT INTO coinflips(id,host_id,request_id,bot,host_stake,host_value,host_coin,created_at,expires_at) VALUES(?,?,?,0,?,?,NULL,?,?)`)
    .run(id, 'o6', 'old-code-req-1', JSON.stringify(rawStake([['me5-87', 1]])), 828, now, now + 3600000);
  assert.equal(rawLedger(db), ledger);
  db.prepare(`UPDATE coinflips SET status = 'done', guest_id = 'o7', guest_stake = ?, guest_value = 828, guest_coin = NULL, winner = 'guest', flipped_at = ? WHERE id = ? AND status = 'open'`)
    .run(JSON.stringify(rawStake([['me5-87', 1]])), now, id);
  assert.equal(rawLedger(db), ledger); assert.equal(db.prepare('SELECT status FROM coinflips WHERE id = ?').get(id).status, 'done');
  const botId = rid();
  db.prepare(`INSERT INTO coinflips(id,host_id,request_id,bot,host_stake,host_value,host_coin,created_at,expires_at) VALUES(?,?,?,1,?,?,NULL,?,?)`)
    .run(botId, 'o6', 'old-code-req-2', JSON.stringify(rawStake([['me5-97', 1]])), 510, now, now + 3600000);
  db.prepare(`UPDATE coinflips SET status = 'done', guest_id = 'house', guest_stake = ?, guest_value = 500, bot_persona = ?, winner = 'guest', flipped_at = ? WHERE id = ?`)
    .run(JSON.stringify(rawStake([['me5-3', 41]])), 'professor-elm', now, botId);
  assert.equal(rawLedger(db), ledger - 1, 'a card lost to the bot leaves the game, as before');
  const pot = rid();
  db.prepare('INSERT INTO jackpots(id,host_id,request_id,max_players,min_value,created_at,expires_at) VALUES(?,?,?,3,797,?,?)').run(pot, 'o1', 'old-code-pot-1', now, now + 3600000);
  for (const [seat, user] of [[0, 'o1'], [1, 'o2'], [2, 'o3']]) db.prepare('INSERT INTO jackpot_entries(jackpot_id,seat,user_id,bot,bot_persona,stake,value,created_at) VALUES(?,?,?,0,NULL,?,797,?)')
    .run(pot, seat, user, JSON.stringify(rawStake([['me5-98', 1]])), now);
  db.prepare("UPDATE jackpots SET status = 'done', winner_seat = 2, drawn_at = ? WHERE id = ?").run(now, pot);
  assert.equal(rawLedger(db), ledger - 1); assert.equal(db.prepare('SELECT status FROM jackpots WHERE id = ?').get(pot).status, 'done');
  // The new Worker reads those rows without complaint.
  assert.equal((await api(`/api/casino/coinflips/${id}`, 'GET', undefined, null)).flip.status, 'done');
  const view = await api(`/api/casino/jackpots/${pot}`, 'GET', undefined, null); assert.equal(view.jackpot.status, 'done'); assert.equal(view.jackpot.entries[2].won, true);
});

// ---- Other ways to arrive at the new schema -----------------------------------------------------------------------------
await check('the migration file applied by hand (wrangler path) leaves the Worker nothing to do; replaying its trigger half is harmless', async () => {
  const w = oldWorld(); const e = { DB: w.DB, ASSETS }; const a = apiFor(e); populate(w.db);
  w.db.exec(migrationSql('0022_casino_slabs.sql')); assert.ok(hasMarker(w.db));
  resetCaches(); const mark = w.log.length; const batches = w.DB.batches;
  assert.equal((await a('/api/casino/coinflips', 'GET', undefined, null)).status, 200);
  assert.deepEqual(w.log.slice(mark).filter(sql => !/^\s*CREATE (TABLE|INDEX) IF NOT EXISTS/i.test(sql) && /^\s*(ALTER|DROP|CREATE)/i.test(sql)), []); assert.equal(w.DB.batches, batches);
  const frozen = hash(triggerSql(w.db));
  await w.DB.batch(SLABS_DDL.map(sql => w.DB.prepare(sql))); assert.equal(hash(triggerSql(w.db)), frozen, 'replaying the DROP + CREATE batch changes nothing');
  // and the schema the Worker builds by itself is the same schema the migration builds
  const lazy = oldWorld(); lazy.db.exec('PRAGMA foreign_keys = ON'); resetCaches();
  populate(lazy.db); assert.equal((await apiFor({ DB: lazy.DB, ASSETS })('/api/casino/coinflips', 'GET', undefined, null)).status, 200);
  const norm = sql => sql.replace(/\s+/g, ' ').trim();
  const a1 = triggerSql(w.db); const a2 = triggerSql(lazy.db);
  for (const name of Object.keys(a1)) assert.equal(norm(a2[name] || ''), norm(a1[name]), `${name} is the same trigger either way`);
  assert.deepEqual(Object.keys(a2).sort(), Object.keys(a1).sort());
});

await check('a crash between the column step and the trigger step finishes on the next request; a failing trigger batch rolls back whole (old triggers stay)', async () => {
  const w = oldWorld(); const e = { DB: w.DB, ASSETS }; const a = apiFor(e); const wids = populate(w.db); const old = triggerSql(w.db); const ledger = rawLedger(w.db);
  // columns already added, triggers still old: the state a crashed isolate leaves.
  for (const [, , sql] of SLABS_COLUMNS) w.db.exec(sql);
  assert.equal(hasMarker(w.db), false);
  resetCaches();
  // First, an injected failure at the END of the batch: the whole replacement must roll back.
  SLABS_DDL.push('SELECT * FROM no_such_table_for_the_atomicity_test');
  try {
    const bad = await a('/api/casino/coinflips', 'GET', undefined, null).catch(err => ({ status: 500, error: String(err) }));
    assert.notEqual(bad.status, 200, 'the failed upgrade is an error, not a half-upgraded success');
  } finally { SLABS_DDL.pop(); }
  assert.deepEqual(triggerSql(w.db), old, 'every old trigger is exactly as it was: the batch rolled back whole');
  assert.equal(hasMarker(w.db), false);
  // Old games still work in that state.
  rig.coin = 'host'; assert.equal(w.db.prepare("SELECT status FROM coinflips WHERE id = ?").get(wids.F_join).status, 'open'); unrig();
  // The next request completes the upgrade.
  resetCaches();
  assert.equal((await a('/api/casino/coinflips', 'GET', undefined, null)).status, 200); assert.ok(hasMarker(w.db));
  assert.equal(rawLedger(w.db), ledger);
  const j = await a(`/api/casino/coinflips/${wids.F_join}/join`, 'POST', { cards: [{ id: 'me5-87', qty: 1 }] }, 'o7'); assert.equal(j.status, 200, JSON.stringify(j));
});

await check('requests that arrive together on an old database share one upgrade', async () => {
  const w = oldWorld(); const e = { DB: w.DB, ASSETS }; const a = apiFor(e); populate(w.db); resetCaches();
  const all = await Promise.all([a('/api/casino/coinflips', 'GET', undefined, null), a('/api/casino/jackpots', 'GET', undefined, null), a('/api/grading', 'GET', undefined, 'o1'),
    a('/api/casino/coinflips', 'GET', undefined, 'o2'), a('/api/casino/winnings/coinflip/nope', 'GET', undefined, 'o3')]);
  assert.deepEqual(all.map(r => r.status), [200, 200, 200, 200, 404]);
  assert.ok(hasMarker(w.db));
  assert.equal(w.db.prepare("SELECT COUNT(*) n FROM pragma_table_info('graded_cards') WHERE name = 'locked'").get().n, 1);
});

await check('a brand-new database (no casino tables at all) gets everything in one go', async () => {
  const w = oldWorld(migrationFiles.filter(f => f < '0015')); const e = { DB: w.DB, ASSETS }; const a = apiFor(e); populate2(w.db); resetCaches();
  function populate2(d) { d.prepare('INSERT INTO users(id,name,handle,password_hash,color,created_at,last_played) VALUES(?,?,?,?,?,?,?)').run('o1', 'o1', 'o1', 'x', 'gold', now, now);
    d.prepare('INSERT INTO profiles(user_id,coins,granted,created_at,binder) VALUES(?,?,?,?,?)').run('o1', 100, 100, now, '[]'); d.prepare('INSERT INTO sessions(id,user_id,created_at,expires_at) VALUES(?,?,?,?)').run('o1', 'o1', now, now + 864000000); seedLevel(d, 'o1'); }
  assert.equal((await a('/api/casino/jackpots', 'GET', undefined, 'o1')).status, 200); assert.ok(hasMarker(w.db));
  assert.equal((await a('/api/casino/coinflips', 'GET', undefined, 'o1')).status, 200);
  assert.equal(w.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name IN ('coinflips','jackpots','jackpot_entries','graded_cards','casino_sales')").get().n >= 4, true);
});

await check('the escrow triggers come with the upgrade: an old Worker\'s crack, sell, guard and delete of a locked slab fail at the database; an unlocked slab is untouched by them', async () => {
  const w = oldWorld(); const e = { DB: w.DB, ASSETS }; const a = apiFor(e); populate(w.db); resetCaches();
  assert.equal(w.db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'graded_slab_escrow'").get(), undefined, 'the old world has no escrow trigger');
  assert.equal((await a('/api/casino/coinflips', 'GET', undefined, null)).status, 200);
  for (const name of ['graded_slab_escrow', 'graded_slab_escrow_delete']) assert.ok(w.db.prepare('SELECT 1 FROM sqlite_master WHERE name = ?').get(name), name);
  const mint = (user, grade) => Number(w.db.prepare(`INSERT INTO graded_cards(user_id,card_id,reverse,grade,band,fee_cents,request_id,status,created_at) VALUES(?,'me5-87',0,?,'me',541,?,'slabbed',?)`).run(user, grade, rid(), now).lastInsertRowid);
  const staked = mint('o6', 9); const free = mint('o6', 8);
  const made = await a('/api/casino/coinflips', 'POST', { requestId: rid(), cards: [], slabs: [staked] }, 'o6'); assert.equal(made.status, 200, JSON.stringify(made));
  const IN_GAME = /That slab is in a casino game/; const frozen = hash(snapshot(w.db));
  for (const sql of ["UPDATE graded_cards SET status = 'cracked', closed_at = 1, guard = NULL, shown = 0 WHERE id = ? AND user_id = 'o6' AND status = 'slabbed'",
    "UPDATE graded_cards SET status = 'sold', closed_at = 1, guard = NULL, shown = 0, sell_request_id = 'old', sold_cents = 828 WHERE id = ? AND user_id = 'o6' AND status = 'slabbed'",
    "UPDATE graded_cards SET guard = 'guard-onyx' WHERE id = ? AND user_id = 'o6' AND status = 'slabbed'", "UPDATE graded_cards SET shown = 1 WHERE id = ? AND user_id = 'o6' AND status = 'slabbed'",
    'DELETE FROM graded_cards WHERE id = ?', "DELETE FROM graded_cards WHERE user_id = 'o6' AND id = ?"]) {
    assert.throws(() => w.db.prepare(sql).run(staked), IN_GAME, sql);
  }
  assert.equal(hash(snapshot(w.db)), frozen);
  // The slab that is not in a game behaves exactly as before: cracked, shown, deleted.
  assert.equal(w.db.prepare("UPDATE graded_cards SET shown = 1 WHERE id = ?").run(free).changes, 1);
  assert.equal(w.db.prepare("UPDATE graded_cards SET status = 'cracked', shown = 0 WHERE id = ?").run(free).changes, 1);
  assert.equal(w.db.prepare('DELETE FROM graded_cards WHERE id = ?').run(free).changes, 1);
});

await check('a path that strips comments (no marker in the stored SQL) does not make every cold isolate rebuild the triggers', async () => {
  const w = oldWorld(); const e = { DB: w.DB, ASSETS }; const a = apiFor(e); populate(w.db);
  for (const [, , sql] of SLABS_COLUMNS) w.db.exec(sql);
  for (const sql of SLABS_DDL) w.db.exec(sql.replace(/\/\*.*?\*\//g, '').replace(/^\s*--.*$/gm, ''));
  for (const name of ['coinflip_stake_check', 'coinflip_settle_check', 'jackpot_settle_check', 'jackpot_entry_check', 'graded_slab_escrow']) {
    assert.ok(!w.db.prepare('SELECT sql FROM sqlite_master WHERE name = ?').get(name).sql.includes(SLABS_MARKER), `${name} has no comment marker`);
  }
  assert.ok(hasMarker(w.db), 'the slab code itself is what counts');
  resetCaches(); const mark = w.log.length; const batches = w.DB.batches;
  assert.equal((await a('/api/casino/coinflips', 'GET', undefined, null)).status, 200); assert.equal((await a('/api/casino/jackpots', 'GET', undefined, null)).status, 200);
  assert.equal(w.DB.batches, batches, 'no trigger batch ran'); assert.deepEqual(w.log.slice(mark).filter(sql => /DROP\s+TRIGGER/i.test(sql)), []);
  // ... while a half-way state (the old settle trigger, new columns) is still repaired.
  w.db.exec('DROP TRIGGER jackpot_settle_check'); w.db.exec(`CREATE TRIGGER jackpot_settle_check BEFORE UPDATE ON jackpots WHEN OLD.status = 'open' AND NEW.status = 'done' BEGIN SELECT 1; END`);
  assert.equal(hasMarker(w.db), false); resetCaches(); const again = w.DB.batches;
  assert.equal((await a('/api/casino/jackpots', 'GET', undefined, null)).status, 200); assert.equal(w.DB.batches, again + 1); assert.ok(hasMarker(w.db));
  w.db.exec('DROP TRIGGER graded_slab_escrow_delete'); assert.equal(hasMarker(w.db), false, 'a missing escrow trigger counts as not upgraded');
  resetCaches(); assert.equal((await a('/api/casino/jackpots', 'GET', undefined, null)).status, 200); assert.ok(hasMarker(w.db));
});

await check('a slab an old Worker cracked while it sat in a flip (before the triggers arrived) cannot wedge the upgrade, the expiry or the account', async () => {
  const w = oldWorld(); const e = { DB: w.DB, ASSETS }; const a = apiFor(e); const wids = populate(w.db);
  for (const [, , sql] of SLABS_COLUMNS) w.db.exec(sql); // columns, old triggers: the state between the two upgrade steps
  const mint = (user, grade) => Number(w.db.prepare(`INSERT INTO graded_cards(user_id,card_id,reverse,grade,band,fee_cents,request_id,status,created_at) VALUES(?,'me5-87',0,?,'me',541,?,'slabbed',?)`).run(user, grade, rid(), now).lastInsertRowid);
  const keep = mint('o6', 9); const hurt = mint('o6', 9); const snap = id => ({ id, cardId: 'me5-87', name: 'Goldeen', number: '87', rarity: 'x', image: '', small: '', grade: 9, reverse: 0, guard: null, v: 828 });
  const flipId = rid(); const ledger = rawLedger(w.db);
  // A slab-aware flip row that the old triggers let in (they ignore host_slabs), its slabs locked by hand.
  w.db.prepare(`INSERT INTO coinflips(id,host_id,request_id,bot,host_stake,host_slabs,host_value,host_coin,created_at,expires_at) VALUES(?,?,?,0,?,?,?,NULL,?,?)`)
    .run(flipId, 'o6', 'old-slab-flip-1', JSON.stringify(rawStake([['me5-3', 1]])), JSON.stringify([snap(keep), snap(hurt)]), 12 + 1656, now, now + 3600000);
  w.db.prepare("UPDATE graded_cards SET locked = ? WHERE id IN (?, ?)").run(`coinflip:${flipId}`, keep, hurt);
  // The old Worker, which has never heard of `locked`, cracks one of them.
  assert.equal(w.db.prepare("UPDATE graded_cards SET status = 'cracked', closed_at = ?, guard = NULL, shown = 0 WHERE id = ? AND user_id = 'o6' AND status = 'slabbed'").run(now, hurt).changes, 1);
  resetCaches();
  assert.equal((await a('/api/casino/coinflips', 'GET', undefined, null)).status, 200, 'the upgrade runs over the cracked-but-locked row');
  assert.ok(hasMarker(w.db)); assert.equal(w.db.prepare('SELECT status FROM graded_cards WHERE id = ?').get(hurt).status, 'cracked');
  // Nobody can settle it short ...
  rig.coin = 'guest';
  const join = await a(`/api/casino/coinflips/${flipId}/join`, 'POST', { cards: [{ id: 'me5-99', qty: 1 }, { id: 'me5-98', qty: 1 }] }, 'o7'); unrig();
  assert.equal(join.status, 409, JSON.stringify(join)); assert.match(join.error, /no longer has those slabs/);
  const direct = () => w.db.prepare(`UPDATE coinflips SET status = 'done', guest_id = 'o7', guest_stake = ?, guest_value = 1668, winner = 'guest', flipped_at = ? WHERE id = ? AND status = 'open'`)
    .run(JSON.stringify(rawStake([['me5-3', 1]])), now, flipId);
  assert.throws(direct, /no longer has those slabs/);
  assert.equal(w.db.prepare('SELECT user_id, locked FROM graded_cards WHERE id = ?').get(keep).user_id, 'o6');
  // ... it expires and the host's intact slab and card come back, the cracked one loses its stale lock, and the account can be reset.
  now += 25 * 3600000; w.db.prepare('UPDATE sessions SET expires_at = ?').run(now + 864000000);
  assert.equal((await a('/api/casino/coinflips', 'GET', undefined, null)).status, 200);
  assert.equal(w.db.prepare('SELECT status FROM coinflips WHERE id = ?').get(flipId).status, 'cancelled');
  assert.equal(w.db.prepare('SELECT locked FROM graded_cards WHERE id = ?').get(keep).locked, null); assert.equal(w.db.prepare('SELECT locked FROM graded_cards WHERE id = ?').get(hurt).locked, null);
  assert.equal(rawLedger(w.db), ledger); void wids;
  assert.equal((await a('/api/me/reset', 'POST', {}, 'o6')).status, 200);
  assert.equal(w.db.prepare("SELECT COUNT(*) n FROM graded_cards WHERE user_id = 'o6'").get().n, 0);
});

console.log(results.join('\n'));
console.log(failed ? `\nFAIL: ${failed} failed` : '\nPASS');
Date.now = realNow;
void COINFLIP_RULES; void maintainJackpots;
process.exit(failed ? 1 : 0);
