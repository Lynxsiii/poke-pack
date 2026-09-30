/* Casino coinflip: escrow, matching, settlement, bot fairness, races.
   Runs the real Worker against in-memory SQLite (Node 22+): node scripts/test-coinflip.mjs */
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import worker from '../worker/index.js';
import { buildBotStake, resetCasinoSchemaCache } from '../worker/casino.js';
import { CASINO_DDL } from '../worker/casino-ddl.js';
import { splitStatements } from './gen-casino-ddl.mjs';
import { COINFLIP_RULES, matchWindow, botStakeWindow } from '../js/casino-rules.js';

const migrationDir = new URL('../worker/migrations/', import.meta.url);
const migrationFiles = readdirSync(migrationDir).sort();
const migrationSql = file => readFileSync(new URL(file, migrationDir), 'utf8');
assert.deepEqual(splitStatements(migrationSql('0015_casino_coinflip.sql')), CASINO_DDL, 'worker/casino-ddl.js is stale: run node scripts/gen-casino-ddl.mjs');

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
      db.exec('BEGIN');
      try { const results = statements.map(s => s.execute()); db.exec('COMMIT'); return results; }
      catch (err) { db.exec('ROLLBACK'); throw err; }
    },
  };
  return { db, DB };
}
// The Worker upgrades a database that only has migrations up to 0013, as production does.
const { db, DB } = makeDb(migrationFiles.filter(f => f < '0015'));
assert.equal(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name = 'coinflips'").get().n, 0);
const realNow = Date.now; let now = realNow(); Date.now = () => now;
const addUser = (id, coins = 100) => {
  db.prepare('INSERT INTO users(id,name,handle,password_hash,color,created_at,last_played) VALUES(?,?,?,?,?,?,?)').run(id, id, id, 'unused', 'gold', now, now);
  db.prepare('INSERT INTO profiles(user_id,coins,granted,created_at,binder) VALUES(?,?,?,?,?)').run(id, coins, coins, now, '[]');
  db.prepare('INSERT INTO sessions(id,user_id,created_at,expires_at) VALUES(?,?,?,?)').run(id, id, now, now + 864000000);
};
['host', 'rival', 'third'].forEach(id => addUser(id));
const give = (user, card, qty, rev = 0) => db.prepare(`INSERT INTO cards(user_id,card_id,qty,reverse_qty) VALUES(?,?,?,?)
  ON CONFLICT(user_id,card_id) DO UPDATE SET qty = qty + excluded.qty, reverse_qty = reverse_qty + excluded.reverse_qty`).run(user, card, qty, rev);
const qtyOf = (user, card) => db.prepare('SELECT qty FROM cards WHERE user_id = ? AND card_id = ?').get(user, card)?.qty || 0;
const revOf = (user, card) => db.prepare('SELECT reverse_qty r FROM cards WHERE user_id = ? AND card_id = ?').get(user, card)?.r || 0;
const totalCards = () => db.prepare('SELECT COALESCE(SUM(qty),0) n FROM cards').get().n;
const ASSETS = { fetch: async request => {
  try { return new Response(readFileSync(new URL('..' + new URL(request.url).pathname, import.meta.url)), { headers: { 'content-type': 'application/json' } }); }
  catch { return new Response('', { status: 404 }); }
} };
const env = { DB, ASSETS };
async function api(path, method = 'GET', body, user = 'host', headers = {}) {
  const res = await worker.fetch(new Request('https://poke-pack.rip' + path, { method,
    headers: { 'content-type': 'application/json', origin: 'https://poke-pack.rip', ...(user ? { cookie: `pp_sid=${user}` } : {}), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), env);
  return { status: res.status, ...await res.json() };
}
const create = (cards, user = 'host', requestId = crypto.randomUUID()) => api('/api/casino/coinflips', 'POST', { requestId, cards }, user);
const join = (id, cards, user = 'rival') => api(`/api/casino/coinflips/${id}/join`, 'POST', { cards }, user);
const cancel = (id, user = 'host') => api(`/api/casino/coinflips/${id}/cancel`, 'POST', {}, user);
const bot = (cards, user = 'host', requestId = crypto.randomUUID()) => api('/api/casino/coinflips/bot', 'POST', { requestId, cards }, user);

// Values in cents (data/me5.json market prices): me5-1 10, me5-2 7, me5-3 12, me5-87 828, me5-90 1285, me5-97 510, me5-98 797, me5-99 906.
give('host', 'me5-87', 2, 1); give('host', 'me5-1', 5); give('host', 'me5-90', 1);
give('rival', 'me5-98', 1); give('rival', 'me5-97', 2); give('rival', 'me5-99', 1); give('rival', 'me5-3', 4);
give('third', 'me5-98', 1);
let expectedTotal = totalCards();

// ---- Rules ---------------------------------------------------------------------
assert.deepEqual(matchWindow(828), { min: 787, max: 869 });
assert.deepEqual(matchWindow(20), { min: 10, max: 30 }, 'small stakes get the minimum slack');
assert.deepEqual(botStakeWindow(1000), { low: 940, high: 1000 });

// ---- Auth and validation ---------------------------------------------------------
assert.equal((await create([{ id: 'me5-87', qty: 1 }], null)).status, 401);
assert.equal((await api('/api/casino/coinflips', 'POST', { requestId: crypto.randomUUID(), cards: [{ id: 'me5-87', qty: 1 }] }, 'host', { origin: 'https://foreign.example' })).status, 403);
assert.equal((await api('/api/casino/coinflips', 'POST', { cards: [{ id: 'me5-87', qty: 1 }] })).status, 400, 'requestId is required');
assert.equal((await create([])).status, 400);
assert.equal((await create([{ id: 'me5-87', qty: 3 }])).status, 409, 'cannot stake more than owned');
assert.equal((await create([{ id: 'me5-98', qty: 1 }])).status, 409, 'cannot stake a card you do not have');
assert.equal((await create([{ id: 'me5-87', qty: 1 }, { id: 'me5-87', qty: 1 }])).status, 400, 'a card is listed once');
assert.equal((await create([{ id: 'me5-87', qty: 0 }])).status, 400);
assert.equal((await create([{ id: 'me5-87', qty: 1.5 }])).status, 400);
assert.equal((await create([{ id: 'nope-1', qty: 1 }])).status, 409, 'a card that does not exist is one you do not own');
assert.equal((await create('me5-87')).status, 400);
assert.equal(totalCards(), expectedTotal, 'refused stakes move nothing');
// Escrow trigger is the authority even when the API's own check is bypassed.
assert.throws(() => db.prepare(`INSERT INTO coinflips(id,host_id,request_id,host_stake,host_value,created_at,expires_at) VALUES('x','host','rr-000001',?,100,1,2)`)
  .run(JSON.stringify([{ id: 'me5-87', qty: 9, rev: 0 }])), /no longer have/);
assert.throws(() => db.prepare(`INSERT INTO coinflips(id,host_id,request_id,host_stake,host_value,created_at,expires_at) VALUES('x','host','rr-000002',?,100,1,2)`)
  .run(JSON.stringify([{ id: 'me5-87', qty: 2, rev: 0 }, { id: 'me5-87', qty: 1, rev: 0 }])), /not valid/);
assert.equal(totalCards(), expectedTotal);

// ---- Create: escrow, idempotence, reverse holos stay with the host ----------------------
const key = crypto.randomUUID();
const [a, b] = await Promise.all([create([{ id: 'me5-87', qty: 1 }], 'host', key), create([{ id: 'me5-87', qty: 1 }], 'host', key)]);
assert.equal(a.status, 200); assert.equal(b.status, 200); assert.equal(a.flip.id, b.flip.id, 'a retry finds the same flip');
assert.equal(qtyOf('host', 'me5-87'), 1, 'escrowed once');
assert.equal(revOf('host', 'me5-87'), 1, 'the plain copy went in, the reverse holo stayed');
assert.equal(a.flip.status, 'open'); assert.equal(a.flip.hostValue, 8.28); assert.deepEqual(a.flip.window, { min: 7.87, max: 8.69 });
assert.equal(a.flip.hostStake[0].rev, 0); assert.equal(a.save.collection['me5-87'], 1);
const first = a.flip.id;
assert.equal(totalCards() + 1, expectedTotal, 'one card is in escrow');
expectedTotal -= 0; // escrowed cards leave `cards`; they return below

// ---- Matching ---------------------------------------------------------------------
assert.equal((await join(first, [{ id: 'me5-97', qty: 1 }])).status, 400, 'too low (5.10 vs 8.28)');
assert.equal((await join(first, [{ id: 'me5-99', qty: 1 }])).status, 400, 'too high (9.06)');
assert.equal((await join(first, [{ id: 'me5-98', qty: 1 }], 'host')).status, 409, 'not against yourself');

// Two challengers race for one flip: exactly one settles, the other keeps every card.
const [j1, j2] = await Promise.all([join(first, [{ id: 'me5-98', qty: 1 }], 'rival'), join(first, [{ id: 'me5-98', qty: 1 }], 'third')]);
assert.deepEqual([j1.status, j2.status].sort(), [200, 409], 'one join wins the race');
const won = j1.status === 200 ? j1 : j2; const lostUser = j1.status === 200 ? 'third' : 'rival'; const winUser = j1.status === 200 ? 'rival' : 'third';
assert.equal(qtyOf(lostUser, 'me5-98'), 1, 'the loser of the race keeps their card');
assert.equal(won.flip.status, 'done'); assert.ok(['host', 'guest'].includes(won.flip.winner));
assert.equal(won.flip.guestValue, 7.97);
const hostWon = won.flip.winner === 'host';
assert.equal(qtyOf('host', 'me5-87'), hostWon ? 2 : 1, 'the host has the plain copy back only when they won');
assert.equal(qtyOf('host', 'me5-98'), hostWon ? 1 : 0);
assert.equal(qtyOf(winUser, 'me5-87'), hostWon ? 0 : 1);
assert.equal(qtyOf(winUser, 'me5-98'), hostWon ? 0 : 1, 'the challenger has their own card only when they won');
assert.equal(totalCards(), expectedTotal, 'cards are conserved through a settled flip');
assert.equal((await join(first, [{ id: 'me5-98', qty: 1 }], winUser)).status, 200, 'a retry by the challenger is idempotent');
assert.equal((await join(first, [{ id: 'me5-98', qty: 1 }], lostUser)).status, 409, 'settled flips are closed');
assert.equal((await cancel(first)).status, 409, 'cannot cancel after the flip');
assert.throws(() => db.prepare("UPDATE coinflips SET status = 'cancelled' WHERE id = ?").run(first), /already settled/);
assert.throws(() => db.prepare("UPDATE coinflips SET winner = 'guest' WHERE id = ?").run(first), /already settled/);

// ---- Cancel and expiry return the host's cards ----------------------------------------------
const snapshot = user => JSON.stringify(db.prepare('SELECT card_id, qty, reverse_qty FROM cards WHERE user_id = ? ORDER BY card_id').all(user));
let before = snapshot('rival');
const openOne = await create([{ id: 'me5-97', qty: 2 }, { id: 'me5-3', qty: 4 }], 'rival');
assert.equal(openOne.status, 200, JSON.stringify(openOne));
assert.equal(openOne.flip.hostValue, 10.68, '2 x 5.10 + 4 x 0.12');
assert.equal(qtyOf('rival', 'me5-97'), 0); assert.equal(qtyOf('rival', 'me5-3'), 0);
assert.equal((await cancel(openOne.flip.id, 'host')).status, 403, 'only the host cancels');
const [c1, c2] = await Promise.all([cancel(openOne.flip.id, 'rival'), join(openOne.flip.id, [{ id: 'me5-99', qty: 1 }, { id: 'me5-97', qty: 0 }], 'host')]);
assert.equal(snapshot('rival') === before || c1.status === 200, true);
assert.equal(c1.status, 200);
assert.equal(snapshot('rival'), before, 'cancelling returns every card');
assert.equal((await cancel(openOne.flip.id, 'rival')).status, 200, 'cancel twice is fine and returns nothing twice');
assert.equal(snapshot('rival'), before);
assert.equal((await join(openOne.flip.id, [{ id: 'me5-90', qty: 1 }], 'host')).status, 409);

const expiring = await create([{ id: 'me5-1', qty: 5 }], 'host');
assert.equal(expiring.status, 200);
assert.equal(qtyOf('host', 'me5-1'), 0);
now += (COINFLIP_RULES.openHours + 1) * 3600000;
db.prepare('UPDATE sessions SET expires_at = ?').run(now + 864000000);
assert.equal((await join(expiring.flip.id, [{ id: 'me5-99', qty: 1 }], 'rival')).status, 409, 'expired flips cannot be joined');
const listed = await api('/api/casino/coinflips', 'GET', undefined, 'host');
assert.equal(listed.status, 200);
assert.equal(qtyOf('host', 'me5-1'), 5, 'expiry hands the cards back');
assert.equal((await api(`/api/casino/coinflips/${expiring.flip.id}`, 'GET', undefined, null)).flip.status, 'cancelled');
assert.equal(listed.open.some(f => f.id === expiring.flip.id), false);

// ---- Binder slots follow the cards out ---------------------------------------------------------
db.prepare('UPDATE profiles SET binder = ? WHERE user_id = ?').run(JSON.stringify([{ id: 'me5-90', reverse: false }, { id: 'me5-1', reverse: false }, null, null, null, null, null, null, null,
  null, null, null, null, null, null, null, null, null]), 'host');
const binderFlip = await create([{ id: 'me5-90', qty: 1 }], 'host');
assert.equal(binderFlip.status, 200);
const binder = JSON.parse(db.prepare('SELECT binder FROM profiles WHERE user_id = ?').get('host').binder);
assert.equal(binder[0], null, 'the staked card left the binder'); assert.equal(binder[1]?.id, 'me5-1', 'other slots stay');
assert.equal((await cancel(binderFlip.flip.id)).status, 200);

// ---- Public list, record, and hiding nothing private ---------------------------------------------
const list = await api('/api/casino/coinflips', 'GET', undefined, null);
assert.equal(list.status, 200); assert.equal(list.record, null); assert.ok(list.rules.tolerance > 0);
const mine = await api('/api/casino/coinflips', 'GET', undefined, winUser);
assert.equal(mine.record.played, 1); assert.equal(mine.record.won, hostWon ? 0 : 1);
assert.equal((await api('/api/casino/coinflips', 'GET', undefined, lostUser)).record.played, 0, 'the challenger who lost the race did not play');
const hostRecord = (await api('/api/casino/coinflips', 'GET', undefined, 'host')).record;
assert.equal(hostRecord.played, 1); assert.equal(hostRecord.won, hostWon ? 1 : 0);
assert.ok(list.done.some(f => f.id === first));
assert.ok(!JSON.stringify(list).includes('password'));

// ---- Account safety ------------------------------------------------------------------------------------
const live = await create([{ id: 'me5-1', qty: 1 }], 'host');
assert.equal(live.status, 200);
assert.equal((await api('/api/auth/delete', 'POST', { password: 'x' }, 'host')).status === 500, false, 'deleting with an open flip is refused, not a server error');
assert.equal((await api('/api/me/reset', 'POST', {}, 'host')).status === 500, false);
assert.ok(db.prepare('SELECT 1 FROM users WHERE id = ?').get('host'), 'the account is still there');
assert.equal((await cancel(live.flip.id)).status, 200);
for (let i = 0; i < COINFLIP_RULES.maxOpen; i++) assert.equal((await create([{ id: 'me5-1', qty: 1 }], 'host')).status, 200);
give('host', 'me5-99', 1);
assert.equal((await create([{ id: 'me5-99', qty: 1 }], 'host')).status, 409, 'at most five open flips');
assert.equal((await create([{ id: 'me5-2', qty: 1 }], 'rival')).status === 200, false, 'a stake under 0.10 coins is refused');

// ---- The bot -------------------------------------------------------------------------------------------------
for (const f of db.prepare("SELECT id FROM coinflips WHERE status = 'open'").all()) db.prepare("UPDATE coinflips SET status = 'cancelled' WHERE id = ?").run(f.id);
const botKey = crypto.randomUUID();
const stakes = [[{ id: 'me5-90', qty: 1 }], [{ id: 'me5-3', qty: 4 }, { id: 'me5-1', qty: 5 }], [{ id: 'me5-87', qty: 1 }], [{ id: 'me5-99', qty: 1 }]];
for (const user of ['host', 'rival']) { give(user, 'me5-90', 3); give(user, 'me5-3', 6); give(user, 'me5-1', 6); give(user, 'me5-87', 3); give(user, 'me5-99', 3); }
let botHostWins = 0; let botFlips = 0; let bought = 0; let sold = 0;
for (let i = 0; i < 80; i++) {
  const stake = stakes[i % stakes.length];
  for (const c of stake) if (qtyOf('host', c.id) < c.qty) give('host', c.id, c.qty - qtyOf('host', c.id));
  const beforeCards = totalCards();
  const r = await bot(stake, 'host', i === 0 ? botKey : undefined);
  assert.equal(r.status, 200, JSON.stringify(r));
  const f = r.flip; botFlips++;
  assert.equal(f.status, 'done'); assert.equal(f.bot, true); assert.equal(f.guest.bot, true); assert.match(f.guest.handle, /^bot:/);
  assert.ok(f.guestValue <= f.hostValue + 1e-9, `the bot never stakes more than you (${f.guestValue} vs ${f.hostValue})`);
  const cents = Math.round(f.hostValue * 100); const { low } = botStakeWindow(cents);
  assert.ok(Math.round(f.guestValue * 100) >= low, `the bot stakes within its window (${f.guestValue} for ${f.hostValue})`);
  assert.equal(f.guestStake.reduce((s, c) => s + Math.round(c.value * 100) * c.qty, 0), Math.round(f.guestValue * 100));
  const staked = f.hostStake.reduce((s, c) => s + c.qty, 0); const cardsGiven = f.guestStake.reduce((s, c) => s + c.qty, 0);
  if (f.winner === 'host') { botHostWins++; assert.equal(totalCards(), beforeCards + cardsGiven, 'a win receives only the bot\'s stake'); bought += f.guestValue; }
  else { assert.equal(totalCards(), beforeCards - staked, 'a loss removes the stake from the game'); sold += f.hostValue; }
  // The house never holds cards, and no row is left in escrow.
  assert.equal(db.prepare("SELECT COUNT(*) n FROM cards WHERE user_id = 'house'").get().n, 0);
}
assert.ok(botHostWins > 15 && botHostWins < 65, `roughly fair coin over 80 flips (${botHostWins} wins)`);
const dup = await bot([{ id: 'me5-99', qty: 1 }], 'host', botKey);
assert.equal(dup.status, 200); assert.equal(dup.flip.id, db.prepare('SELECT id FROM coinflips WHERE host_id = ? AND request_id = ?').get('host', botKey).id, 'a bot retry is the same flip');
assert.equal((await bot([{ id: 'me5-90', qty: 99 }])).status, 409);
assert.equal((await api('/api/casino/coinflips/bot', 'POST', { cards: [{ id: 'me5-1', qty: 1 }] })).status, 400);
db.prepare('UPDATE cards SET qty = 0 WHERE user_id = ?').run('third');
db.prepare('DELETE FROM cards WHERE qty = 0').run();

// ---- The bot builder on a fixed pool: window, cap on copies, no overshoot ---------------------------------------
const pool = [10, 12, 25, 60, 99, 210, 480, 750, 1600, 4200].map((cents, i) => ({ id: `t-${i}`, name: `T${i}`, number: String(i), rarity: 'Rare', image: '', small: '', cents }));
for (const target of [10, 37, 100, 828, 1285, 5000, 25000, 99999]) {
  const { low, high } = botStakeWindow(target);
  for (let i = 0; i < 40; i++) {
    const built = buildBotStake(pool, target);
    if (!built) continue; // a target the pool cannot reach is refused, not overshot
    assert.ok(built.value >= low && built.value <= high, `${built.value} in [${low}, ${high}] for ${target}`);
    assert.equal(built.stake.reduce((s, c) => s + c.v * c.qty, 0), built.value);
  }
}
assert.ok(buildBotStake(pool, 828), 'a normal stake can always be matched');

// ---- Whole-economy ledger: cards only move between piles ----------------------------------------------------------
assert.equal(db.prepare("SELECT COUNT(*) n FROM coinflips WHERE status = 'open'").get().n, 0);
console.log(`coinflip tests passed (${botFlips} bot flips, host won ${botHostWins})`);
Date.now = realNow;
