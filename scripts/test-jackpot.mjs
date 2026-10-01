/* Casino jackpot: escrow, value window, weighted draw, races, bots, leave/cancel/expiry.
   Runs the real Worker against in-memory SQLite (Node 22+): node scripts/test-jackpot.mjs */
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import worker from '../worker/index.js';
import { maintainCoinflips } from '../worker/casino.js';
import { weightedWinner, viewJackpot, maintainJackpots } from '../worker/jackpot.js';
import { JACKPOT_DDL, SLABS_DDL } from '../worker/casino-ddl.js';
import { splitStatements } from './gen-casino-ddl.mjs';
import { JACKPOT_RULES, jackpotWindow, botStakeWindow } from '../js/casino-rules.js';

const migrationDir = new URL('../worker/migrations/', import.meta.url);
const migrationFiles = readdirSync(migrationDir).sort();
const migrationSql = file => readFileSync(new URL(file, migrationDir), 'utf8');
assert.deepEqual(splitStatements(migrationSql('0016_casino_jackpot.sql')), JACKPOT_DDL, 'worker/casino-ddl.js is stale: run node scripts/gen-casino-ddl.mjs');

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
assert.equal(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name = 'jackpots'").get().n, 0);
const realNow = Date.now; let now = realNow(); Date.now = () => now;
const USERS = ['host', ...Array.from({ length: 10 }, (_, i) => `p${i + 1}`)];
const addUser = (id, coins = 100) => {
  db.prepare('INSERT INTO users(id,name,handle,password_hash,color,created_at,last_played) VALUES(?,?,?,?,?,?,?)').run(id, id, id, 'unused', 'gold', now, now);
  db.prepare('INSERT INTO profiles(user_id,coins,granted,created_at,binder) VALUES(?,?,?,?,?)').run(id, coins, coins, now, '[]');
  db.prepare('INSERT INTO sessions(id,user_id,created_at,expires_at) VALUES(?,?,?,?)').run(id, id, now, now + 864000000);
};
USERS.forEach(id => addUser(id));
const give = (user, card, qty, rev = 0) => db.prepare(`INSERT INTO cards(user_id,card_id,qty,reverse_qty) VALUES(?,?,?,?)
  ON CONFLICT(user_id,card_id) DO UPDATE SET qty = qty + excluded.qty, reverse_qty = reverse_qty + excluded.reverse_qty`).run(user, card, qty, rev);
const qtyOf = (user, card) => db.prepare('SELECT qty FROM cards WHERE user_id = ? AND card_id = ?').get(user, card)?.qty || 0;
const revOf = (user, card) => db.prepare('SELECT reverse_qty r FROM cards WHERE user_id = ? AND card_id = ?').get(user, card)?.r || 0;
const totalCards = () => db.prepare('SELECT COALESCE(SUM(qty),0) n FROM cards').get().n;
// Cards sitting in an open pot's human entries: not in `cards`, but not gone either.
const escrowed = () => db.prepare(`SELECT COALESCE(SUM(json_extract(j.value, '$.qty')), 0) n FROM jackpot_entries e
  JOIN jackpots p ON p.id = e.jackpot_id, json_each(e.stake) j WHERE p.status = 'open' AND e.user_id IS NOT NULL`).get().n;
const ledger = () => totalCards() + escrowed();
const held = user => db.prepare('SELECT COALESCE(SUM(qty),0) n FROM cards WHERE user_id = ?').get(user).n;
const snapshot = user => JSON.stringify(db.prepare('SELECT card_id, qty, reverse_qty FROM cards WHERE user_id = ? ORDER BY card_id').all(user));
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
assert.equal((await api('/api/casino/jackpots', 'GET', undefined, null)).status, 200); // the first request creates the schema
// 0022 (graded slabs) adds jackpot triggers of its own on top of 0016's tables, indexes and triggers.
const slabTriggers = new Set(SLABS_DDL.map(sql => sql.match(/^CREATE TRIGGER (jackpot_\w+)/)?.[1]).filter(Boolean));
const jackpotObjects = new Set([...JACKPOT_DDL.map(sql => sql.match(/IF NOT EXISTS (\w+)/)[1]), ...slabTriggers]);
assert.equal(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name LIKE 'jackpot%'").get().n, jackpotObjects.size, 'the Worker applied every table, index and trigger');
const rid = () => crypto.randomUUID();
const create = (cards, user = 'host', extra = {}) => api('/api/casino/jackpots', 'POST', { requestId: rid(), cards, ...extra }, user);
const join = (id, cards, user = 'p1') => api(`/api/casino/jackpots/${id}/join`, 'POST', { cards }, user);
const leave = (id, user = 'p1') => api(`/api/casino/jackpots/${id}/leave`, 'POST', {}, user);
const cancel = (id, user = 'host') => api(`/api/casino/jackpots/${id}/cancel`, 'POST', {}, user);
const draw = (id, user = 'host') => api(`/api/casino/jackpots/${id}/draw`, 'POST', {}, user);
const addBot = (id, body = {}, user = 'host') => api(`/api/casino/jackpots/${id}/bot`, 'POST', body, user);
const quick = (cards, players, user = 'host', requestId = rid()) => api('/api/casino/jackpots/quick', 'POST', { requestId, cards, players }, user);
const pots = () => db.prepare('SELECT * FROM jackpots ORDER BY created_at').all();

// Values in cents (data/me5.json market prices): me5-1 10, me5-2 7, me5-3 12, me5-87 828, me5-90 1285, me5-97 510, me5-98 797, me5-99 906.
for (const user of USERS) { give(user, 'me5-98', 40); give(user, 'me5-97', 20); give(user, 'me5-99', 20); give(user, 'me5-90', 20); give(user, 'me5-3', 40); give(user, 'me5-1', 40); give(user, 'me5-2', 5); }
give('host', 'me5-87', 2, 1); // one plain, one reverse holo... two copies, one of them a reverse
let expected = ledger();
const mint = (user, card, qty) => { give(user, card, qty); expected += qty; }; // test supplies only: keeps the ledger honest
const sumCards = stake => stake.reduce((s, c) => s + c.qty, 0);
const ONE = [{ id: 'me5-98', qty: 1 }]; // 7.97 coins: the standard host entry, so joiners put up 7.97 to 39.85

// ---- Rules -----------------------------------------------------------------------
assert.deepEqual(jackpotWindow(797), { min: 797, max: 3985 });
assert.equal(JACKPOT_RULES.maxMultiple, 5); assert.equal(JACKPOT_RULES.maxPlayers, 10); assert.equal(JACKPOT_RULES.minPlayers, 3);
assert.equal(JACKPOT_RULES.earlyDrawMin, 2); assert.equal(JACKPOT_RULES.openHours, 24); assert.equal(JACKPOT_RULES.maxOpen, 3);

// ---- Auth and validation ----------------------------------------------------------
assert.equal((await create(ONE, null)).status, 401);
assert.equal((await api('/api/casino/jackpots', 'POST', { requestId: rid(), cards: ONE }, 'host', { origin: 'https://foreign.example' })).status, 403);
assert.equal((await api('/api/casino/jackpots', 'POST', { cards: ONE })).status, 400, 'requestId is required');
assert.equal((await create([])).status, 400);
assert.equal((await create('me5-98')).status, 400);
assert.equal((await create([{ id: 'me5-98', qty: 99 }])).status, 409, 'cannot put up more than owned');
assert.equal((await create([{ id: 'me5-87', qty: 1 }, { id: 'me5-87', qty: 1 }])).status, 400, 'a card is listed once');
assert.equal((await create([{ id: 'me5-98', qty: 0 }])).status, 400);
assert.equal((await create([{ id: 'me5-2', qty: 1 }])).status, 400, 'an entry under 0.10 coins is refused');
for (const players of [2, 11, 'x', 3.5, null]) assert.equal((await create(ONE, 'host', { players })).status, 400, `players ${players}`);
assert.equal((await api('/api/casino/jackpots', 'POST', { requestId: rid(), cards: ONE }, 'host', { 'content-type': 'text/plain' })).status, 400);
assert.equal((await api('/api/casino/jackpots/nope-1', 'GET', undefined, null)).status, 404);
assert.equal((await api('/api/casino/jackpots/nope-1/join', 'POST', { cards: ONE }, 'p1')).status, 404);
assert.equal((await api('/api/casino/jackpots/quick', 'GET', undefined, null)).status, 404);
assert.equal(ledger(), expected, 'refused entries move nothing');

// ---- The triggers are the authority even when the API's own checks are bypassed ---------------
const rawPot = (id, host, min, max = 4) => db.prepare('INSERT INTO jackpots(id,host_id,request_id,max_players,min_value,created_at,expires_at) VALUES(?,?,?,?,?,?,?)')
  .run(id, host, 'raw-' + id, max, min, now, now + 3600000);
const rawEntry = (pot, seat, user, stake, value, persona = null) => db.prepare('INSERT INTO jackpot_entries(jackpot_id,seat,user_id,bot,bot_persona,stake,value,created_at) VALUES(?,?,?,?,?,?,?,?)')
  .run(pot, seat, user, persona ? 1 : 0, persona, JSON.stringify(stake), value, now);
const entry = (id, qty, rev = 0, v = 797) => [{ id, qty, rev, v }];
rawPot('raw00001', 'host', 797);
rawPot('raw0000b', 'host', 797 * 99);
assert.throws(() => rawEntry('raw0000b', 1, 'p1', entry('me5-98', 99, 0), 797 * 99), /no longer have/, 'the ownership check is in the trigger');
assert.throws(() => rawEntry('raw0000b', 1, 'p1', entry('me5-98', 99, 0), 797 * 99), /no longer have/);
assert.throws(() => rawEntry('raw0000b', 1, 'p1', entry('me5-98', 40, 41), 797 * 40), /not valid/, 'a reverse count above the copies');
db.prepare('UPDATE cards SET reverse_qty = 0 WHERE user_id = ?').run('p1');
assert.throws(() => rawEntry('raw0000b', 1, 'p1', entry('me5-98', 40, 1), 797 * 40 - 0), /no longer have|outside/, 'cannot put up reverse holos you do not own');
db.prepare("DELETE FROM jackpots WHERE id = 'raw0000b'").run();
assert.throws(() => rawEntry('raw00001', 0, 'host', [...entry('me5-98', 1), ...entry('me5-98', 1)], 1594), /not valid/);
assert.throws(() => rawEntry('raw00001', 0, 'host', entry('me5-98', 1), 900), /not valid/, 'the value must equal what the cards add up to');
assert.throws(() => rawEntry('raw00001', 0, 'host', entry('me5-98', 1, 2), 797), /not valid/, 'more reverse copies than copies');
assert.throws(() => rawEntry('raw00001', 0, 'p1', entry('me5-98', 1), 797), /host holds the first seat/);
assert.throws(() => rawEntry('raw00001', 0, 'host', entry('me5-98', 2), 1594), /host holds the first seat/, 'seat 0 sets the minimum');
assert.throws(() => rawEntry('raw00001', 1, 'host', entry('me5-98', 1), 797), /already in/);
assert.throws(() => rawEntry('raw00001', 1, 'p1', entry('me5-97', 1, 0, 510), 510), /outside the pot/, 'below the minimum');
assert.throws(() => rawEntry('raw00001', 1, 'p1', entry('me5-90', 4, 0, 1285), 5140), /outside the pot/, 'a whale above 5x');
assert.throws(() => rawEntry('raw00001', 1, null, entry('me5-90', 1, 0, 1285), 1285, 'sparky'), /outside the pot/, 'a bot above the host');
assert.throws(() => rawEntry('raw00001', 4, 'p1', entry('me5-98', 1), 797), /full/, 'seat beyond the table');
assert.throws(() => rawEntry('raw00001', 1, 'p1', entry('me5-98', 1), 797, 'sparky'), /not valid/, 'a human cannot carry a persona');
assert.throws(() => rawEntry('raw00001', 1, null, entry('me5-98', 1), 797), /not valid/, 'a bot needs a persona');
assert.throws(() => db.prepare("UPDATE jackpots SET status = 'done', winner_seat = 0, drawn_at = 1 WHERE id = 'raw00001'").run(), /cannot be drawn/, 'no entries, no draw');
assert.throws(() => db.prepare('UPDATE jackpots SET min_value = 1 WHERE id = ?').run('raw00001'), /cannot be changed/);
assert.throws(() => db.prepare("INSERT INTO jackpots(id,host_id,request_id,status,max_players,min_value,created_at,expires_at) VALUES('raw00002','host','raw-2','done',4,100,1,2)").run(), /starts open/);
assert.throws(() => db.prepare("INSERT INTO jackpots(id,host_id,request_id,max_players,min_value,created_at,expires_at) VALUES('raw00003','host','raw-3',2,100,1,2)").run(), /CHECK/);
assert.throws(() => db.prepare("INSERT INTO jackpots(id,host_id,request_id,max_players,min_value,created_at,expires_at) VALUES('raw00004','host','raw-4',11,100,1,2)").run(), /CHECK/);
db.prepare("DELETE FROM jackpots WHERE id = 'raw00001'").run();
assert.equal(ledger(), expected, 'refused inserts took nothing');
assert.equal(db.prepare('SELECT COUNT(*) n FROM jackpot_entries').get().n, 0);

// ---- Create: escrow, idempotence, reverse holos stay with the host ---------------------------------
const key = rid();
const [a, b] = await Promise.all([
  api('/api/casino/jackpots', 'POST', { requestId: key, cards: [{ id: 'me5-87', qty: 1 }], players: 4 }),
  api('/api/casino/jackpots', 'POST', { requestId: key, cards: [{ id: 'me5-87', qty: 1 }], players: 4 })]);
assert.equal(a.status, 200, JSON.stringify(a)); assert.equal(b.status, 200); assert.equal(a.jackpot.id, b.jackpot.id, 'a retry finds the same pot');
assert.equal(qtyOf('host', 'me5-87'), 1, 'escrowed once');
assert.equal(revOf('host', 'me5-87'), 1, 'the plain copy went in, the reverse holo stayed');
assert.equal(ledger(), expected, 'escrowed cards still count');
const view = a.jackpot;
assert.equal(view.status, 'open'); assert.equal(view.maxPlayers, 4); assert.equal(view.seatsOpen, 3); assert.equal(view.pot, 8.28);
assert.equal(view.minValue, 8.28); assert.equal(view.maxValue, 41.4); assert.equal(view.winnerSeat, null); assert.equal(view.drawnAt, null);
assert.equal(view.entries.length, 1); assert.equal(view.entries[0].seat, 0); assert.equal(view.entries[0].odds, 1); assert.equal(view.entries[0].value, 8.28);
assert.equal(view.entries[0].player.userId, 'host'); assert.equal(view.entries[0].player.bot, false); assert.equal(view.entries[0].stake[0].value, 8.28);
assert.equal(view.entries[0].stake[0].rev, 0); assert.equal(a.save.collection['me5-87'], 1); assert.ok(a.serverNow > 0);
assert.equal(view.hostId, 'host'); assert.deepEqual(Object.keys(view.entries[0].player).sort(), ['avatar', 'avatarStyle', 'bot', 'color', 'handle', 'name', 'userId']);
const bigPot = view.id;

// ---- Joining: value window, no self-join, escrow, idempotent retry --------------------------------------
assert.equal((await join(bigPot, [{ id: 'me5-97', qty: 1 }], 'p1')).status, 400, 'below the minimum (5.10 vs 8.28)');
assert.equal((await join(bigPot, [{ id: 'me5-90', qty: 4 }], 'p1')).status, 400, 'above 5x (51.40 vs 41.40)');
assert.equal((await join(bigPot, [{ id: 'me5-98', qty: 1 }], 'host')).status, 409, 'not against yourself');
assert.equal((await join(bigPot, [{ id: 'me5-98', qty: 1 }], null)).status, 401);
assert.equal((await join(bigPot, [{ id: 'me5-98', qty: 99 }], 'p1')).status, 409, 'cannot put up cards you do not have');
assert.equal((await join(bigPot, [{ id: 'me5-98', qty: 1 }], 'p1')).status, 400, '7.97 is under the 8.28 minimum');
const j1 = await join(bigPot, [{ id: 'me5-99', qty: 1 }], 'p1');
assert.equal(j1.status, 200, JSON.stringify(j1)); assert.equal(j1.jackpot.entries.length, 2); assert.equal(j1.jackpot.pot, 17.34);
assert.equal(j1.jackpot.entries[1].seat, 1); assert.equal(j1.jackpot.entries[1].odds, Math.round(906 / 1734 * 10000) / 10000);
assert.equal(qtyOf('p1', 'me5-99'), 19); assert.equal(ledger(), expected);
assert.equal((await join(bigPot, [{ id: 'me5-99', qty: 1 }], 'p1')).jackpot.entries.length, 2, 'a retried join returns the same pot, one entry');
assert.equal(qtyOf('p1', 'me5-99'), 19, 'the retry took nothing more');
const [dup1, dup2] = await Promise.all([join(bigPot, [{ id: 'me5-99', qty: 1 }], 'p2'), join(bigPot, [{ id: 'me5-99', qty: 1 }], 'p2')]);
assert.equal(dup1.status, 200); assert.equal(dup2.status, 200); assert.equal(qtyOf('p2', 'me5-99'), 19, 'a double-tapped join is charged once');
assert.equal(dup1.jackpot.entries.length, 3);

// ---- The last seat: settle in the same request as the join; racers for it -------------------------------
const held0 = Object.fromEntries(USERS.map(u => [u, held(u)]));
const [r1, r2] = await Promise.all([join(bigPot, [{ id: 'me5-99', qty: 1 }], 'p3'), join(bigPot, [{ id: 'me5-99', qty: 1 }], 'p4')]);
assert.deepEqual([r1.status, r2.status].sort(), [200, 409], 'exactly one join fills the last seat');
const filler = r1.status === 200 ? r1 : r2; const missed = r1.status === 200 ? 'p4' : 'p3'; const seated = r1.status === 200 ? 'p3' : 'p4';
assert.equal(filler.jackpot.status, 'done', 'the join that fills the pot settles it in the same request');
assert.equal(filler.jackpot.entries.length, 4); assert.notEqual(filler.jackpot.winnerSeat, null); assert.equal(filler.jackpot.drawnAt, filler.serverNow);
assert.equal(qtyOf(missed, 'me5-99'), 20, 'the racer that lost keeps every card');
const winnerEntry = filler.jackpot.entries.find(e => e.won); const winnerId = winnerEntry.player.userId;
assert.equal(filler.jackpot.entries.filter(e => e.won).length, 1);
const potCards = filler.jackpot.entries.reduce((n, e) => n + sumCards(e.stake), 0);
for (const user of USERS) {
  const own = user === seated ? 1 : 0; // the filler's own entry left their inventory in this request
  assert.equal(held(user), held0[user] - own + (user === winnerId ? potCards : 0), `${user} holds exactly what the draw says`);
}
assert.equal(ledger(), expected, 'cards are conserved through a settled pot');
assert.equal(escrowed(), 0);
assert.equal((await join(bigPot, [{ id: 'me5-99', qty: 1 }], missed)).status, 409, 'settled pots are closed');
assert.equal((await join(bigPot, [{ id: 'me5-99', qty: 1 }], seated)).status, 200, 'a retry by a seated player returns the settled pot');
assert.equal((await join(bigPot, [{ id: 'me5-99', qty: 1 }], seated)).jackpot.status, 'done');

// ---- Settled pots never change again ----------------------------------------------------------------------
assert.equal((await cancel(bigPot)).status, 409, 'cannot cancel after the draw');
assert.equal((await draw(bigPot)).status, 409, 'a second draw is refused');
assert.equal((await leave(bigPot, seated)).status, 409, 'cannot leave after the draw');
assert.throws(() => db.prepare("UPDATE jackpots SET status = 'cancelled' WHERE id = ?").run(bigPot), /already settled/);
assert.throws(() => db.prepare("UPDATE jackpots SET winner_seat = 1 WHERE id = ?").run(bigPot), /already settled/);
assert.throws(() => db.prepare("UPDATE jackpots SET status = 'done', winner_seat = 0, drawn_at = 1 WHERE id = ?").run(bigPot), /already settled/);
assert.throws(() => db.prepare('DELETE FROM jackpot_entries WHERE jackpot_id = ?').run(bigPot), /already settled/);
assert.throws(() => db.prepare('UPDATE jackpot_entries SET stake = ? WHERE jackpot_id = ?').run('[]', bigPot), /cannot be changed/);
assert.throws(() => rawEntry(bigPot, 4, 'p5', entry('me5-99', 1, 0, 906), 906), /over|full/);
assert.equal(ledger(), expected);

// ---- Weighted odds: a 2:1 pair splits about 2:1 (fixed bound, far wider than chance) ---------------------------
let heavy = 0; const draws = 4000;
for (let i = 0; i < draws; i++) if (weightedWinner([{ seat: 0, value: 200 }, { seat: 3, value: 100 }]) === 0) heavy++;
// expected 2667, standard deviation about 30: a +/-250 band is more than 8 sigma.
assert.ok(Math.abs(heavy - draws * 2 / 3) < 250, `2:1 weighted pair split ${heavy}/${draws}`);
assert.equal(weightedWinner([{ seat: 2, value: 5 }, { seat: 7, value: 5 }], () => 0), 2);
assert.equal(weightedWinner([{ seat: 2, value: 5 }, { seat: 7, value: 5 }], () => 4), 2);
assert.equal(weightedWinner([{ seat: 2, value: 5 }, { seat: 7, value: 5 }], () => 5), 7);
assert.equal(weightedWinner([{ seat: 2, value: 5 }, { seat: 7, value: 5 }], () => 9), 7);
const three = { 1: 0, 2: 0, 3: 0 };
for (let i = 0; i < 6000; i++) three[weightedWinner([{ seat: 1, value: 10 }, { seat: 2, value: 20 }, { seat: 3, value: 30 }])]++;
assert.ok(Math.abs(three[1] - 1000) < 200 && Math.abs(three[2] - 2000) < 250 && Math.abs(three[3] - 3000) < 250, JSON.stringify(three));
// Through the API a whale who puts up 5x wins about 5/6 of a two-entry pot.
let whaleWins = 0; const rounds = 60;
for (let i = 0; i < rounds; i++) {
  mint('host', 'me5-98', 1); mint('p1', 'me5-90', 3); // top up: both sides put cards in every round
  const pot = await create(ONE, 'host'); assert.equal(pot.status, 200);
  assert.equal((await join(pot.jackpot.id, [{ id: 'me5-90', qty: 3 }], 'p1')).status, 200); // 38.55 vs 7.97: inside 5x
  const done = await draw(pot.jackpot.id); assert.equal(done.status, 200);
  if (done.jackpot.entries.find(e => e.won).player.userId === 'p1') whaleWins++;
}
assert.ok(whaleWins > rounds * 0.6, `the heavier entry wins most pots (${whaleWins}/${rounds}, expected about 83%)`);
assert.equal(ledger(), expected);

// ---- Early draw by the host with two entries --------------------------------------------------------------------
const early = await create(ONE, 'p5', { players: 6 });
assert.equal((await draw(early.jackpot.id, 'p5')).status, 409, 'one entry is not enough to draw');
assert.equal((await join(early.jackpot.id, ONE, 'p6')).status, 200);
assert.equal((await draw(early.jackpot.id, 'p6')).status, 403, 'only the host draws early');
const earlyDone = await draw(early.jackpot.id, 'p5');
assert.equal(earlyDone.status, 200); assert.equal(earlyDone.jackpot.status, 'done'); assert.equal(earlyDone.jackpot.entries.length, 2);
assert.equal(earlyDone.save.collection['me5-98'] === 41 || earlyDone.save.collection['me5-98'] === 39, true, 'winner holds both piles');
assert.equal((await draw(early.jackpot.id, 'p5')).status, 409, 'double draw refused');
assert.equal(ledger(), expected);

// ---- Leave: the player gets exactly their cards back ------------------------------------------------------------------
const pre = Object.fromEntries(['host', 'p1', 'p2', 'p3'].map(u => [u, snapshot(u)]));
const table = await create(ONE, 'host', { players: 5 });
const tid = table.jackpot.id;
const before1 = pre.p1;
assert.equal((await join(tid, [{ id: 'me5-97', qty: 1 }, { id: 'me5-3', qty: 4 }, { id: 'me5-1', qty: 1 }], 'p1')).status, 400, 'a mixed entry must still clear the minimum (5.10 + 0.48 + 0.10)');
assert.equal((await join(tid, [{ id: 'me5-97', qty: 2 }, { id: 'me5-3', qty: 4 }, { id: 'me5-1', qty: 30 }], 'p1')).status, 200, 'a mixed entry worth 13.68 is inside the window');
assert.equal((await join(tid, ONE, 'p2')).status, 200);
assert.notEqual(snapshot('p1'), before1);
assert.equal((await leave(tid, 'host')).status, 409, 'the host cancels instead of leaving');
assert.equal((await leave(tid, 'p3')).status, 200, 'leaving a pot you are not in changes nothing');
const left = await leave(tid, 'p1');
assert.equal(left.status, 200); assert.equal(left.jackpot.entries.length, 2); assert.deepEqual(left.jackpot.entries.map(e => e.seat), [0, 2]);
assert.equal(snapshot('p1'), before1, 'leaving returns every card');
assert.equal((await leave(tid, 'p1')).status, 200); assert.equal(snapshot('p1'), before1, 'leaving twice returns nothing twice');
assert.throws(() => db.prepare("DELETE FROM jackpot_entries WHERE jackpot_id = ? AND user_id = 'host'").run(tid), /cannot be removed/);
const re = await join(tid, ONE, 'p3'); assert.equal(re.status, 200); assert.equal(re.jackpot.entries.find(e => e.player.userId === 'p3').seat, 1, 'the empty seat is reused');
assert.equal(ledger(), expected);

// ---- Cancel returns everyone's cards; only the host cancels ----------------------------------------------------------------------
assert.equal((await cancel(tid, 'p2')).status, 403, 'only the host cancels');
const snaps = Object.fromEntries(['host', 'p2', 'p3'].map(u => [u, snapshot(u)]));
const c = await cancel(tid);
assert.equal(c.status, 200); assert.equal(c.jackpot.status, 'cancelled');
for (const u of ['host', 'p2', 'p3']) assert.equal(snapshot(u), pre[u], `${u} got every card back`);
assert.equal((await cancel(tid)).status, 200, 'cancel twice is fine'); assert.equal(snapshot('host'), pre.host, 'and returns nothing twice');
assert.equal((await join(tid, ONE, 'p4')).status, 409, 'a cancelled pot is closed');
assert.equal((await leave(tid, 'p2')).status, 200, 'leaving a cancelled pot changes nothing'); assert.equal(snapshot('p2'), pre.p2);
assert.equal(ledger(), expected);

// ---- Expiry returns every pile through the same maintenance path ---------------------------------------------------------------------------
const pre2 = { p1: snapshot('p1'), p2: snapshot('p2') };
const soon = await create(ONE, 'p1', { players: 4 }); assert.equal((await join(soon.jackpot.id, ONE, 'p2')).status, 200);
assert.notEqual(snapshot('p1'), pre2.p1); assert.notEqual(snapshot('p2'), pre2.p2);
now += (JACKPOT_RULES.openHours + 1) * 3600000;
db.prepare('UPDATE sessions SET expires_at = ?').run(now + 864000000);
const staleRow = db.prepare('SELECT * FROM jackpots WHERE id = ?').get(soon.jackpot.id);
assert.equal(viewJackpot(staleRow, [], now).status, 'expired', 'an open pot past its time reads as expired');
assert.equal((await join(soon.jackpot.id, ONE, 'p3')).status, 409, 'expired pots cannot be joined');
assert.equal((await draw(soon.jackpot.id, 'p1')).status, 409, 'expired pots cannot be drawn');
await maintainCoinflips(env, now); // the scheduled handler's entry point covers jackpots too
assert.equal(db.prepare('SELECT status FROM jackpots WHERE id = ?').get(soon.jackpot.id).status, 'cancelled');
assert.equal(snapshot('p1'), pre2.p1); assert.equal(snapshot('p2'), pre2.p2, 'expiry hands every pile back');
const listed = await api('/api/casino/jackpots', 'GET', undefined, 'p1');
assert.equal(listed.open.some(p => p.id === soon.jackpot.id), false);
assert.equal((await api(`/api/casino/jackpots/${soon.jackpot.id}`, 'GET', undefined, null)).jackpot.status, 'cancelled');
await maintainJackpots(env, now); assert.equal(snapshot('p1'), pre2.p1, 'maintenance twice returns nothing twice');
assert.equal(ledger(), expected);

// ---- Binder slots follow the cards out ------------------------------------------------------------------------------------------------------
db.prepare('UPDATE profiles SET binder = ? WHERE user_id = ?').run(JSON.stringify([{ id: 'me5-87', reverse: false }, { id: 'me5-1', reverse: false }, ...Array(16).fill(null)]), 'host');
mint('host', 'me5-87', 1);
const binderPot = await create([{ id: 'me5-87', qty: qtyOf('host', 'me5-87') }], 'host', { players: 3 }); // every copy: the slot has nothing left to show
assert.equal(binderPot.status, 200, JSON.stringify(binderPot));
const binder = JSON.parse(db.prepare('SELECT binder FROM profiles WHERE user_id = ?').get('host').binder);
assert.equal(binder[0], null, 'the staked card left the binder'); assert.equal(binder[1]?.id, 'me5-1', 'other slots stay');
assert.equal((await cancel(binderPot.jackpot.id)).status, 200);

// ---- Account safety ----------------------------------------------------------------------------------------------------------------------------------
const heldPot = await create(ONE, 'host', { players: 4 });
assert.equal((await join(heldPot.jackpot.id, ONE, 'p6')).status, 200);
for (const user of ['host', 'p6']) {
  assert.throws(() => db.prepare('DELETE FROM profiles WHERE user_id = ?').run(user), /open jackpots before deleting/);
  assert.throws(() => db.prepare('UPDATE profiles SET created_at = 1 WHERE user_id = ?').run(user), /open jackpots before resetting/);
}
const reset = await api('/api/me/reset', 'POST', {}, 'p6');
assert.equal(reset.status, 409, 'resetting with an entry in an open pot is refused, not a 500'); assert.match(reset.error, /open jackpots before resetting/);
assert.equal((await api('/api/auth/delete', 'POST', { password: 'x' }, 'p6')).status === 500, false);
assert.ok(db.prepare('SELECT 1 FROM users WHERE id = ?').get('p6'), 'the account is still there');
const p6Before = held('p6');
assert.equal((await leave(heldPot.jackpot.id, 'p6')).status, 200);
assert.equal(held('p6'), p6Before + 1, 'leaving returns the escrowed card');
assert.equal((await api('/api/me/reset', 'POST', {}, 'p6')).status, 200, 'after leaving, a reset goes through');
expected -= p6Before + 1; // a real reset deletes p6's cards from the game
for (const [card, qty] of [['me5-98', 40], ['me5-97', 20], ['me5-99', 20], ['me5-90', 20], ['me5-3', 40], ['me5-1', 40]]) mint('p6', card, qty);
assert.equal((await cancel(heldPot.jackpot.id)).status, 200);
assert.equal(ledger(), expected);
for (let i = 0; i < JACKPOT_RULES.maxOpen; i++) assert.equal((await create(ONE, 'host')).status, 200);
assert.equal((await create(ONE, 'host')).status, 409, 'at most three open pots per host');
assert.equal((await quick(ONE, 3, 'host')).status, 200, 'a quick pot is drawn at once so it does not count against the limit');
for (const p of pots().filter(p => p.status === 'open')) assert.equal((await cancel(p.id)).status, 200);

// ---- Bots ---------------------------------------------------------------------------------------------------------------------------------------------------------
const humanCards = view => view.entries.filter(e => !e.player.bot).reduce((s, e) => s + sumCards(e.stake), 0);
const botCards = view => view.entries.filter(e => e.player.bot).reduce((s, e) => s + sumCards(e.stake), 0);
let botWins = 0; let hostValue = 0; let botValue = 0; let quickPots = 0;
const hostOptions = [[{ id: 'me5-90', qty: 1 }], [{ id: 'me5-3', qty: 4 }, { id: 'me5-1', qty: 5 }], [{ id: 'me5-99', qty: 1 }], [{ id: 'me5-98', qty: 2 }]];
for (let i = 0; i < 60; i++) {
  const stake = hostOptions[i % hostOptions.length]; const players = 3 + (i % 8);
  for (const c of stake) mint('p7', c.id, c.qty); // the player can always afford this round's entry
  const beforeLedger = ledger();
  const r = await quick(stake, players, 'p7', i === 0 ? 'quick-retry-key' : rid());
  assert.equal(r.status, 200, JSON.stringify(r));
  const v = r.jackpot; quickPots++;
  assert.equal(v.status, 'done'); assert.equal(v.entries.length, players); assert.equal(v.seatsOpen, 0);
  assert.equal(v.entries.filter(e => e.player.bot).length, players - 1); assert.equal(v.entries[0].player.userId, 'p7');
  assert.equal(new Set(v.entries.filter(e => e.player.bot).map(e => e.player.handle)).size, players - 1, 'every bot in a pot is a different persona');
  assert.ok(v.entries.filter(e => e.player.bot).every(e => /^bot:/.test(e.player.handle)));
  const host = Math.round(v.entries[0].value * 100); const { low } = botStakeWindow(host);
  for (const e of v.entries.slice(1)) {
    const cents = Math.round(e.value * 100);
    assert.ok(cents <= host, `a bot never puts up more than the host (${e.value} vs ${v.entries[0].value})`); assert.ok(cents >= low, `and stays inside its window (${e.value})`);
    assert.equal(e.stake.reduce((s, c) => s + Math.round(c.value * 100) * c.qty, 0), cents);
    botValue += cents; hostValue += host;
  }
  const won = v.entries.find(e => e.won);
  const afterLedger = ledger();
  if (won.player.userId === 'p7') { assert.equal(afterLedger, beforeLedger + botCards(v), 'a human winner receives only the bots\' stakes') }
  else { botWins++; assert.equal(afterLedger, beforeLedger - humanCards(v), 'a bot winner makes the human pile vanish'); }
  assert.equal(db.prepare("SELECT COUNT(*) n FROM cards WHERE user_id = 'house' OR user_id IS NULL").get().n, 0, 'the house never holds cards');
  assert.equal(escrowed(), 0);
}
assert.ok(botWins > 0 && botWins < quickPots, `bots win some and lose some (${botWins}/${quickPots})`);
const dupQuick = await quick(ONE, 5, 'p7', 'quick-retry-key');
assert.equal(dupQuick.status, 200); assert.equal(dupQuick.jackpot.id, db.prepare('SELECT id FROM jackpots WHERE host_id = ? AND request_id = ?').get('p7', 'quick-retry-key').id, 'a quick retry is the same pot');
assert.equal((await quick(ONE, 2, 'p7')).status, 400); assert.equal((await quick(ONE, 11, 'p7')).status, 400);
assert.equal((await quick([{ id: 'me5-90', qty: 99 }], 4, 'p7')).status, 409);
assert.equal((await api('/api/casino/jackpots/quick', 'POST', { cards: ONE, players: 4 }, 'p7')).status, 400, 'requestId is required');
assert.equal((await api('/api/casino/jackpots/quick', 'POST', { requestId: rid(), cards: ONE, players: 4 }, null)).status, 401);

// A table with people at it: the host adds bots, one at a time or all at once.
const mixed = await create([{ id: 'me5-99', qty: 1 }], 'p1', { players: 4 });
assert.equal((await addBot(mixed.jackpot.id, { fill: true }, 'p1')).status, 409, 'filling with bots needs another player at the table');
assert.equal((await addBot(mixed.jackpot.id, {}, 'p2')).status, 403, 'only the host adds bots');
const one = await addBot(mixed.jackpot.id, {}, 'p1');
assert.equal(one.status, 200, JSON.stringify(one)); assert.equal(one.jackpot.entries.length, 2); assert.equal(one.jackpot.entries[1].player.bot, true);
assert.ok(one.jackpot.entries[1].value <= 9.06 && one.jackpot.entries[1].value >= 8.51, 'a bot entry sits just under the host\'s 9.06');
assert.equal(one.jackpot.status, 'open');
assert.equal((await join(mixed.jackpot.id, [{ id: 'me5-99', qty: 1 }], 'p2')).status, 200);
const beforeMixed = ledger();
const filled = await addBot(mixed.jackpot.id, { fill: true }, 'p1');
assert.equal(filled.status, 200, JSON.stringify(filled)); assert.equal(filled.jackpot.status, 'done', 'a bot filling the last seat draws the pot in that request');
assert.equal(filled.jackpot.entries.length, 4); assert.equal(filled.jackpot.entries.filter(e => e.player.bot).length, 2);
const mixedWinner = filled.jackpot.entries.find(e => e.won).player;
const humanPile = filled.jackpot.entries.filter(e => !e.player.bot).reduce((s, e) => s + sumCards(e.stake), 0);
assert.equal(humanPile, 2);
assert.equal(ledger(), mixedWinner.bot ? beforeMixed - humanPile : beforeMixed + botCards(filled.jackpot), 'bot cards enter only through a human winner; human piles leave only to a bot winner');
assert.equal((await addBot(mixed.jackpot.id, {}, 'p1')).status, 409, 'a settled pot takes no more bots');
const fullTable = await create(ONE, 'p2', { players: 3 });
assert.equal((await addBot(fullTable.jackpot.id, {}, 'p2')).status, 200);
const lastBot = await addBot(fullTable.jackpot.id, {}, 'p2');
assert.equal(lastBot.status, 200); assert.equal(lastBot.jackpot.status, 'done'); assert.equal((await addBot(fullTable.jackpot.id, {}, 'p2')).status, 409);
// A human racing the host's bot for the last seat: exactly one lands, the pot is drawn once, no card duplicated.
for (let i = 0; i < 4; i++) {
  const racePot = await create(ONE, 'p3', { players: 3 });
  assert.equal((await join(racePot.jackpot.id, ONE, 'p4')).status, 200);
  const beforeRace = ledger();
  const [human, bot] = await Promise.all([join(racePot.jackpot.id, ONE, 'p5'), addBot(racePot.jackpot.id, {}, 'p3')]);
  assert.deepEqual([human.status, bot.status].sort(), [200, 409], `one fills the last seat (${human.status}, ${bot.status})`);
  const row = pots().find(p => p.id === racePot.jackpot.id);
  assert.equal(row.status, 'done'); assert.equal(db.prepare('SELECT COUNT(*) n FROM jackpot_entries WHERE jackpot_id = ?').get(row.id).n, 3);
  const winnerRow = db.prepare('SELECT user_id, bot FROM jackpot_entries WHERE jackpot_id = ? AND seat = ?').get(row.id, row.winner_seat);
  const stakes = db.prepare('SELECT bot, stake FROM jackpot_entries WHERE jackpot_id = ?').all(row.id);
  const humanIn = stakes.filter(s => !s.bot).reduce((n, s) => n + sumCards(JSON.parse(s.stake)), 0);
  const botIn = stakes.filter(s => s.bot).reduce((n, s) => n + sumCards(JSON.parse(s.stake)), 0);
  assert.equal(ledger(), winnerRow.bot ? beforeRace - humanIn : beforeRace + botIn, 'a human winner adds only the bots\' cards, a bot winner removes the human piles');
}

// ---- Human-only pots conserve every card, across sizes and winners --------------------------------------------------------------------------------
{
  const startLedger = ledger();
  for (const players of [3, 4, 6, 10]) {
    const heldBefore = Object.fromEntries(USERS.map(u => [u, held(u)]));
    const pot = await create(ONE, 'host', { players });
    const others = USERS.slice(1);
    let last;
    for (let i = 0; i < players - 1; i++) {
      last = await join(pot.jackpot.id, [{ id: 'me5-99', qty: 1 + (i % 3) }], others[i]);
      assert.equal(last.status, 200, JSON.stringify(last));
      assert.equal(ledger(), startLedger, 'nothing is created or lost while the pot fills');
    }
    assert.equal(last.jackpot.status, 'done', 'the last join drew it');
    assert.equal(last.jackpot.entries.length, players);
    assert.equal(ledger(), startLedger, `a ${players}-seat pot moved every card exactly once`);
    const pot_ = last.jackpot; const potCards = pot_.entries.reduce((n, e) => n + sumCards(e.stake), 0); const winner = pot_.entries.find(e => e.won).player.userId;
    for (const e of pot_.entries) {
      assert.equal(held(e.player.userId), heldBefore[e.player.userId] - sumCards(e.stake) + (e.player.userId === winner ? potCards : 0), `${e.player.userId} in the ${players}-seat pot`);
    }
  }
  assert.equal(escrowed(), 0);
}

// ---- Listing and record --------------------------------------------------------------------------------------------------------------------------------------------------------
const list = await api('/api/casino/jackpots', 'GET', undefined, null);
assert.equal(list.status, 200); assert.equal(list.record, null); assert.equal(list.rules.maxMultiple, 5); assert.ok(list.serverNow > 0);
assert.ok(list.done.length > 0 && list.done.length <= 20); assert.ok(list.open.length <= 40);
assert.ok(list.done.every(p => p.status === 'done' && p.entries.length >= 2 && p.winnerSeat != null && p.drawnAt));
assert.ok(!JSON.stringify(list).includes('password'));
const open1 = await create(ONE, 'p7', { players: 4 });
const list2 = await api('/api/casino/jackpots', 'GET', undefined, 'p7');
assert.ok(list2.open.some(p => p.id === open1.jackpot.id)); assert.equal(list2.open[0].id, open1.jackpot.id, 'newest first');
const dbRecord = db.prepare(`SELECT COUNT(*) played, SUM(CASE WHEN j.winner_seat = e.seat THEN 1 ELSE 0 END) won FROM jackpot_entries e
  JOIN jackpots j ON j.id = e.jackpot_id WHERE e.user_id = 'p7' AND j.status = 'done'`).get();
assert.deepEqual(list2.record, { played: dbRecord.played, won: dbRecord.won }); assert.ok(list2.record.played > 60);
assert.equal((await api('/api/casino/jackpots', 'GET', undefined, 'p5')).record.played, db.prepare("SELECT COUNT(*) n FROM jackpot_entries e JOIN jackpots j ON j.id = e.jackpot_id WHERE e.user_id = 'p5' AND j.status = 'done'").get().n);
assert.equal((await cancel(open1.jackpot.id, 'p7')).status, 200);
assert.equal(db.prepare("SELECT COUNT(*) n FROM jackpots WHERE status = 'open'").get().n, 0);

console.log(`jackpot tests passed (${quickPots} quick pots, bots won ${botWins}; average bot entry ${(botValue / hostValue * 100).toFixed(1)}% of the host's; whale won ${whaleWins}/${rounds}; heavy side ${heavy}/${draws})`);
Date.now = realNow;
