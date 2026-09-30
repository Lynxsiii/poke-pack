/* Casino "sell all winnings": what counts as winnings, market-rate pay, once only, bounded parts.
   Runs the real Worker against in-memory SQLite (Node 22+): node scripts/test-winnings.mjs */
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import worker from '../worker/index.js';

const migrationDir = new URL('../worker/migrations/', import.meta.url);
const migrationFiles = readdirSync(migrationDir).sort();
const migrationSql = file => readFileSync(new URL(file, migrationDir), 'utf8');

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
const { db, DB } = makeDb(migrationFiles.filter(f => f < '0014'));
assert.equal(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name = 'coinflips'").get().n, 0);
const realNow = Date.now; let now = realNow(); Date.now = () => now;
const addUser = (id, coins = 100) => {
  db.prepare('INSERT INTO users(id,name,handle,password_hash,color,created_at,last_played) VALUES(?,?,?,?,?,?,?)').run(id, id, id, 'unused', 'gold', now, now);
  db.prepare('INSERT INTO profiles(user_id,coins,granted,created_at,binder) VALUES(?,?,?,?,?)').run(id, coins, coins, now, '[]');
  db.prepare('INSERT INTO sessions(id,user_id,created_at,expires_at) VALUES(?,?,?,?)').run(id, id, now, now + 864000000);
};
['host', 'rival', 'third'].forEach(id => addUser(id, 0));
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
const cancel = (id, user = 'host') => api(`/api/casino/coinflips/${id}/cancel`, 'POST', {}, user);


const coinsOf = user => Math.round(db.prepare('SELECT coins FROM profiles WHERE user_id = ?').get(user).coins * 100);
const sellable = (user, source, id) => api(`/api/casino/winnings/${source}/${id}`, 'GET', undefined, user);
const sell = (user, source, id) => api('/api/casino/winnings/sell', 'POST', { source, id }, user);
const create = (cards, user) => api('/api/casino/coinflips', 'POST', { requestId: crypto.randomUUID(), cards }, user);
const bot = (cards, user) => api('/api/casino/coinflips/bot', 'POST', { requestId: crypto.randomUUID(), cards }, user);
const join = (id, cards, user) => api(`/api/casino/coinflips/${id}/join`, 'POST', { cards }, user);

// me5-87 is 8.28, me5-98 7.97: a coinflip between host and rival, whoever wins.
give('host', 'me5-87', 1); give('rival', 'me5-98', 1); give('rival', 'me5-1', 3);
const made = await create([{ id: 'me5-87', qty: 1 }], 'host');
const flipped = await join(made.flip.id, [{ id: 'me5-98', qty: 1 }], 'rival');
assert.equal(flipped.status, 200);
const hostWon = flipped.flip.winner === 'host';
const [winner, loser] = hostWon ? ['host', 'rival'] : ['rival', 'host'];
const owedCard = hostWon ? 'me5-98' : 'me5-87'; const owedCents = hostWon ? 797 : 828;
assert.equal((await sellable(loser, 'coinflip', made.flip.id)).status, 403, 'the loser has nothing to sell');
assert.equal((await sellable('third', 'coinflip', made.flip.id)).status, 403);
assert.equal((await sellable(null, 'coinflip', made.flip.id)).status, 401);
assert.equal((await sell(loser, 'coinflip', made.flip.id)).status, 403);
const info = await sellable(winner, 'coinflip', made.flip.id);
assert.equal(info.status, 200); assert.equal(info.eligible, true); assert.equal(info.cards, 1); assert.equal(info.coins, owedCents / 100);
const ownBefore = qtyOf(winner, hostWon ? 'me5-87' : 'me5-98'); const coinsBefore = coinsOf(winner); const cardsBefore = totalCards();
assert.equal(qtyOf(winner, owedCard), 1);
const sold = await sell(winner, 'coinflip', made.flip.id);
assert.equal(sold.status, 200, JSON.stringify(sold));
assert.equal(sold.sold.coins, owedCents / 100); assert.equal(sold.sold.cards, 1); assert.equal(sold.sold.remaining, 0);
assert.equal(coinsOf(winner) - coinsBefore, owedCents, 'paid the market value of the other pile only');
assert.equal(qtyOf(winner, owedCard), 0, 'the won card is gone');
assert.equal(qtyOf(winner, hostWon ? 'me5-87' : 'me5-98'), ownBefore, 'the winner\'s own stake stays theirs');
assert.equal(totalCards(), cardsBefore - 1);
assert.equal(sold.save.coins, owedCents / 100);
assert.equal((await sell(winner, 'coinflip', made.flip.id)).status, 409, 'sold once');
assert.equal((await sellable(winner, 'coinflip', made.flip.id)).sold, true);
assert.equal((await sellable(winner, 'coinflip', made.flip.id)).soldCoins, owedCents / 100);
assert.throws(() => db.prepare("INSERT INTO casino_sales(source,game_id,user_id,part,items,cents,at) VALUES('coinflip','x',?,0,?,100,1)")
  .run(winner, JSON.stringify([{ id: 'me5-90', qty: 1, rev: 0, v: 100 }])), /no longer have/, 'the trigger refuses a sale of cards not held');
assert.throws(() => db.prepare("INSERT INTO casino_sales(source,game_id,user_id,part,items,cents,at) VALUES('coinflip','y',?,0,?,999,1)")
  .run(winner, JSON.stringify([{ id: 'me5-1', qty: 1, rev: 0, v: 10 }])), /not valid/, 'the trigger refuses a price that does not add up');

// A card the winner no longer holds is simply not sold (they staked it elsewhere first).
give('host', 'me5-99', 1); give('rival', 'me5-99', 1);
const second = await create([{ id: 'me5-99', qty: 1 }], 'host');
const bJoin = await join(second.flip.id, [{ id: 'me5-99', qty: 1 }], 'rival');
assert.equal(bJoin.status, 200, JSON.stringify(bJoin));
const w2 = bJoin.flip.winner === 'host' ? 'host' : 'rival'; const owed2 = 'me5-99';
// The winner puts the won cards straight into another flip, so there is nothing left to sell.
const gone = await create([{ id: owed2, qty: qtyOf(w2, owed2) }], w2);
assert.equal(gone.status, 200, JSON.stringify(gone));
assert.equal((await sell(w2, 'coinflip', second.flip.id)).status, 409, 'nothing held, nothing sold');
assert.equal(await coinsOf(w2) >= 0, true);

// A bot flip the player wins can be sold too; the bot's pile is worth no more than the stake.
give('host', 'me5-90', 4);
let botWinner = null;
for (let i = 0; i < 12 && !botWinner; i++) {
  const r = await bot([{ id: 'me5-90', qty: 1 }], 'host');
  assert.equal(r.status, 200, JSON.stringify(r));
  if (r.flip.winner === 'host') botWinner = r.flip;
}
assert.ok(botWinner, 'the host wins one of twelve bot flips');
const botInfo = await sellable('host', 'coinflip', botWinner.id);
assert.ok(botInfo.coins > 0 && botInfo.coins <= botWinner.hostValue + 1e-9, 'bot winnings never exceed the stake');
const botSale = await sell('host', 'coinflip', botWinner.id);
assert.equal(botSale.status, 200); assert.equal(botSale.sold.coins, botInfo.coins);

// ---- Battles and jackpots: winnings are the cards awarded, in bounded parts -----------------------------------
const bulk = JSON.parse(readFileSync(new URL('../data/me5.json', import.meta.url), 'utf8')).filter(c => !c.id.startsWith('energy')).slice(0, 150);
const allocation = bulk.map(c => ({ id: c.id, reverse: false }));
db.prepare(`INSERT INTO battles(id,host_id,request_id,status,settings,lineup,plan,entry_cost,created_at,expires_at,result) VALUES('b1','third','r1','finished','{}','[]','[]',1,1,2,?)`)
  .run(JSON.stringify({ winners: [0], allocations: [{ seat: 0, userId: 'third', cardCount: 150, value: 1, cards: allocation }, { seat: 1, userId: 'rival', cardCount: 0, value: 0, cards: [] }] }));
for (const c of bulk) give('third', c.id, 2);
const bInfo = await sellable('third', 'battle', 'b1');
assert.equal(bInfo.status, 200); assert.ok(bInfo.cards > 0 && bInfo.cards <= 150);
assert.equal((await sellable('rival', 'battle', 'b1')).status, 403, 'a seat that won nothing has nothing to sell');
assert.equal((await sell('rival', 'battle', 'b1')).status, 403);
const bSale = await sell('third', 'battle', 'b1');
assert.equal(bSale.status, 200, JSON.stringify(bSale));
assert.equal(bSale.sold.cards, bInfo.cards);
assert.equal(bSale.sold.remaining, 0);
assert.equal((await sell('third', 'battle', 'b1')).status, 409);
assert.equal((await sellable('third', 'battle', 'nope')).status, 404);
assert.equal((await sell('third', 'nothing', 'b1')).status, 404);

// A pot bigger than one part is sold in parts.
const big = JSON.parse(readFileSync(new URL('../data/sv1.json', import.meta.url), 'utf8')).filter(c => !c.id.startsWith('energy')).slice(0, 320);
db.prepare(`INSERT INTO battles(id,host_id,request_id,status,settings,lineup,plan,entry_cost,created_at,expires_at,result) VALUES('b2','third','r2','finished','{}','[]','[]',1,1,2,?)`)
  .run(JSON.stringify({ winners: [0], allocations: [{ seat: 0, userId: 'third', cardCount: big.length, value: 1, cards: big.map(c => ({ id: c.id, reverse: false })) }] }));
for (const c of big) give('third', c.id, 1);
const parts = []; for (let i = 0; i < 6; i++) { const r = await sell('third', 'battle', 'b2'); if (r.status !== 200) break; parts.push(r.sold); if (!r.sold.remaining) break; }
assert.ok(big.length > 150 && parts.length === Math.ceil(big.length / 150), `${big.length} cards sell in ${parts.length} parts`);
assert.ok(parts.every(p => p.cards <= 150), 'each part is bounded');
assert.equal(parts.reduce((n, p) => n + p.cards, 0), big.length);
assert.equal((await sell('third', 'battle', 'b2')).status, 409);

console.log('winnings tests passed');
Date.now = realNow;
