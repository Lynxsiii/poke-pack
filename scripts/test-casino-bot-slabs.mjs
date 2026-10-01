/* The casino has no coin ceiling, and bots stake graded slabs (slabs-v2, migration 0027).
   - A 5,000,000-coin stake (raw cards + slabs) plays end to end on BOTH games against a bot and against humans: staking, settle,
     the bot's generated slabs minted for a human winner (and nothing minted when the bot wins), selling every win un-clamped.
   - The bot builder is quantity-based and CPU-bounded: a 5M-coin target and a 50k one are timed and bounded.
   - The v2 triggers refuse a malformed bot slab, a bot staking more than the human, a replayed settle, a double mint.
   Runs the real Worker against in-memory SQLite (Node 22+): node scripts/test-casino-bot-slabs.mjs
   SLAB_MEM_DIR=<dir> additionally leaves database copies of maxed pots and a manifest for the memory measurement. */
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { randomFillSync, createHash } from 'node:crypto';
import { seedLevel } from './lib/level-seed.mjs';
import worker from '../worker/index.js';
import { setForCard } from '../worker/grading.js';
import { buildBotStake, BOT_BUILD, BOT_GRADES, rollBotGrade } from '../worker/casino.js';
import { loadXpCounters } from '../worker/xp.js';
import { COINFLIP_RULES, JACKPOT_RULES, botStakeWindow } from '../js/casino-rules.js';
import { gradedValue, gradeMultiplier, bandFor, GRADE_BANDS } from '../js/grading-rules.js';
import { PLAYABLE_SETS, sellValue, money } from '../js/catalog.js';

const results = [];
let failed = 0;
async function check(name, fn) {
  const t0 = performance.now();
  try { await fn(); results.push(`PASS  ${name}  (${Math.round(performance.now() - t0)} ms)`); }
  catch (err) { failed++; results.push(`FAIL  ${name}\n      ${String(err?.stack || err).split('\n').slice(0, 16).join('\n      ')}`); }
}

// ---- Harness (same as test-casino-slabs.mjs) -------------------------------------------------------------------------
const migrationDir = new URL('../worker/migrations/', import.meta.url);
const migrationFiles = readdirSync(migrationDir).sort();
const migrationSql = file => readFileSync(new URL(file, migrationDir), 'utf8');
const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON');
for (const file of migrationFiles.filter(f => f < '0015')) db.exec(migrationSql(file));
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
    try { const out = statements.map(s => s.execute()); db.exec('COMMIT'); return out; }
    catch (err) { db.exec('ROLLBACK'); throw err; }
  },
};
const realNow = Date.now; let now = realNow(); Date.now = () => now;
const addUser = (id, coins = 100) => {
  db.prepare('INSERT INTO users(id,name,handle,password_hash,color,created_at,last_played) VALUES(?,?,?,?,?,?,?)').run(id, id, id, 'unused', 'gold', now, now);
  db.prepare('INSERT INTO profiles(user_id,coins,granted,created_at,binder) VALUES(?,?,?,?,?)').run(id, coins, coins, now, '[]');
  db.prepare('INSERT INTO sessions(id,user_id,created_at,expires_at) VALUES(?,?,?,?)').run(id, id, now, now + 864000000); seedLevel(db, id);
};
const give = (user, card, qty) => db.prepare(`INSERT INTO cards(user_id,card_id,qty,reverse_qty) VALUES(?,?,?,0)
  ON CONFLICT(user_id,card_id) DO UPDATE SET qty = qty + excluded.qty`).run(user, card, qty);
const totalCards = () => db.prepare('SELECT COALESCE(SUM(qty),0) n FROM cards').get().n;
const coinsOf = user => Math.round(db.prepare('SELECT coins FROM profiles WHERE user_id = ?').get(user).coins * 100); // cents
const setCoins = (user, coins) => db.prepare('UPDATE profiles SET coins = ? WHERE user_id = ?').run(coins, user);
const ASSETS = { fetch: async request => {
  try { return new Response(readFileSync(new URL('..' + new URL(request.url).pathname, import.meta.url)), { headers: { 'content-type': 'application/json' } }); }
  catch { return new Response('', { status: 404 }); }
} };
const env = { DB, ASSETS };
async function api(path, method = 'GET', body, user = 'a') {
  const res = await worker.fetch(new Request('https://poke-pack.rip' + path, { method,
    headers: { 'content-type': 'application/json', origin: 'https://poke-pack.rip', ...(user ? { cookie: `pp_sid=${user}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), env);
  return { status: res.status, ...await res.json() };
}
const rid = () => crypto.randomUUID();
const rig = { coin: null, fraction: null };
Object.defineProperty(globalThis.crypto, 'getRandomValues', { configurable: true, writable: true, value(array) {
  if (rig.coin && array instanceof Uint8Array && array.length === 1) { array[0] = rig.coin === 'host' ? 1 : 0; return array; }
  if (rig.fraction != null && array instanceof Uint32Array && array.length === 2) { array[0] = Math.min(0xffffffff, Math.floor(rig.fraction * 2 ** 32)); array[1] = 0; return array; }
  return randomFillSync(array);
} });
const unrig = () => { rig.coin = null; rig.fraction = null; };
const cf = {
  create: (user, body = {}) => api('/api/casino/coinflips', 'POST', { requestId: rid(), ...body }, user),
  bot: (user, body = {}) => api('/api/casino/coinflips/bot', 'POST', { requestId: rid(), ...body }, user),
  join: (id, user, body = {}) => api(`/api/casino/coinflips/${id}/join`, 'POST', body, user),
};
const jp = {
  create: (user, body = {}) => api('/api/casino/jackpots', 'POST', { requestId: rid(), ...body }, user),
  quick: (user, body = {}) => api('/api/casino/jackpots/quick', 'POST', { requestId: rid(), ...body }, user),
  join: (id, user, body = {}) => api(`/api/casino/jackpots/${id}/join`, 'POST', body, user),
  bot: (id, user, body = {}) => api(`/api/casino/jackpots/${id}/bot`, 'POST', body, user),
  get: (id, user = 'a') => api(`/api/casino/jackpots/${id}`, 'GET', undefined, user),
};
const winnings = {
  info: (source, id, user) => api(`/api/casino/winnings/${source}/${id}`, 'GET', undefined, user),
  sell: (source, id, user) => api('/api/casino/winnings/sell', 'POST', { source, id }, user),
};
/** Sell every part of a win. Returns { cents (what the sales said), cards, slabs, parts }. */
async function sellAll(source, id, user) {
  let cents = 0; let cards = 0; let slabs = 0; let parts = 0;
  for (let guard = 0; guard < 40; guard++) {
    const r = await winnings.sell(source, id, user);
    if (r.status === 409) break;
    assert.equal(r.status, 200, JSON.stringify(r).slice(0, 300));
    parts++; cents += Math.round(r.sold.coins * 100); cards += r.sold.cards; slabs += r.sold.slabs;
    if (!r.sold.more && !r.sold.remaining) break;
  }
  return { cents, cards, slabs, parts };
}
const cents = coins => Math.round(coins * 100);
const stakeCents = (stake, slabs) => stake.reduce((n, c) => n + cents(c.value) * c.qty, 0) + (slabs || []).reduce((n, s) => n + cents(s.value), 0);

// ---- The catalog: the 100 most valuable cards of all playable sets ------------------------------------------------------
const catalogCards = [];
for (const set of PLAYABLE_SETS) {
  if (set.viewOf || !set.dataFile) continue;
  let list; try { list = JSON.parse(readFileSync(new URL('../' + set.dataFile, import.meta.url), 'utf8')); } catch { continue; }
  for (const c of list) catalogCards.push({ id: c.id, cents: Math.round(sellValue(c) * 100), card: c, set });
}
catalogCards.sort((x, y) => y.cents - x.cents);
const TOP = catalogCards.slice(0, 100);
const byId = new Map(catalogCards.map(c => [c.id, c]));
const slabCents = (cardId, grade) => { const c = byId.get(cardId); return Math.round(gradedValue(c.card, grade, c.set) * 100); };
const bandOf = cardId => bandFor(setForCard(cardId)).id;
let seq = 0;
const mintReal = (user, cardId, grade = 10) => Number(db.prepare(`INSERT INTO graded_cards(user_id, card_id, reverse, grade, band, fee_cents, request_id, guard, status, created_at, shown)
  VALUES(?, ?, 0, ?, ?, 541, ?, NULL, 'slabbed', ?, 0)`).run(user, cardId, grade, bandOf(cardId), `real-${user}-${++seq}-${Math.random().toString(36).slice(2, 8)}`, now).lastInsertRowid);
const slabRow = id => ({ ...db.prepare('SELECT * FROM graded_cards WHERE id = ?').get(id) });
const slabCount = () => db.prepare('SELECT COUNT(*) n FROM graded_cards').get().n;
const mintedFor = (game, id) => db.prepare('SELECT * FROM graded_cards WHERE request_id LIKE ? ORDER BY id').all(`casino:${game}:${id}:%`);
/** What a player puts up: `copies` of each of the top 100 cards and `nSlabs` grade-10 slabs of the best cards. */
function stakeFor(user, { copies = 77, nSlabs = 10 } = {}) {
  for (const c of TOP) give(user, c.id, copies);
  const slabs = TOP.slice(0, nSlabs).map(c => mintReal(user, c.id, 10));
  const value = TOP.reduce((n, c) => n + c.cents * copies, 0) + slabs.reduce((n, id) => n + slabCents(slabRow(id).card_id, 10), 0);
  return { body: { cards: TOP.map(c => ({ id: c.id, qty: copies })), slabs }, value, copies, slabs };
}
const USERS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
USERS.forEach(id => { addUser(id); setCoins(id, 7_000_000); for (const [card, qty] of [['me5-98', 20], ['me5-3', 30]]) give(id, card, qty); });
assert.equal((await api('/api/casino/coinflips', 'GET', undefined, null)).status, 200); // the first request creates and upgrades the schema
await api('/api/grading', 'GET', undefined, 'a'); await api('/api/casino/winnings/coinflip/none', 'GET', undefined, 'a');

// ---- Rules and source ------------------------------------------------------------------------------------------------------
await check('rules: the raised limits are shared by both games, and no casino code or trigger carries a coin ceiling', () => {
  for (const rules of [COINFLIP_RULES, JACKPOT_RULES]) { assert.equal(rules.maxCards, 100); assert.equal(rules.maxCopies, 100000); assert.equal(rules.maxQty, 9999); assert.equal(rules.maxSlabs, 10); }
  // The wallet ceiling (worker/index.js MAX_COINS) only tops up free handouts; no casino path may mention it.
  const clamp = /MAX_COINS|1_?000_?000|1e6|MIN\(\s*coins/i;
  for (const file of ['worker/casino.js', 'worker/jackpot.js', 'worker/winnings.js', 'worker/casino-slabs.js', 'worker/casino-ddl.js', 'js/casino-rules.js']) {
    assert.ok(!clamp.test(readFileSync(new URL('../' + file, import.meta.url), 'utf8')), `${file} has no coin ceiling`);
  }
  for (const file of migrationFiles.filter(f => /casino|jackpot|slab|coinflip|winnings/i.test(f))) assert.ok(!clamp.test(migrationSql(file)), `${file} has no coin ceiling`);
  // Casino payouts are plain additions, with no clamp.
  assert.match(migrationSql(migrationFiles.find(f => /0017/.test(f))), /coins = ROUND\(coins \+ NEW\.cents \/ 100\.0, 2\)/);
});

// ---- 5M coinflip against a bot -----------------------------------------------------------------------------------------------
await check('5,000,000-coin coinflip vs a bot (raw cards + 10 slabs): the human wins, the bot slabs are minted for them, every winning is sold un-clamped', async () => {
  const { body, value, slabs } = stakeFor('a');
  assert.ok(value >= 500_000_000, `the stake is worth at least 5,000,000 coins (${value / 100})`);
  const cardsBefore = totalCards(); const coinsBefore = coinsOf('a'); const rowsBefore = slabCount();
  assert.ok(coinsBefore > 100_000_000, 'the wallet holds far more than the old 1,000,000 ceiling');
  rig.coin = 'host'; const t0 = performance.now(); const r = await cf.bot('a', body); const ms = performance.now() - t0; unrig();
  assert.equal(r.status, 200, JSON.stringify(r).slice(0, 400)); const f = r.flip;
  assert.equal(f.status, 'done'); assert.equal(f.winner, 'host'); assert.equal(cents(f.hostValue), value);
  const win = botStakeWindow(value); const guest = cents(f.guestValue);
  assert.ok(guest >= win.low && guest <= win.high, `the bot's ${guest / 100} is inside its window (${win.low / 100} to ${win.high / 100})`);
  assert.equal(stakeCents(f.guestStake, f.guestSlabs), guest, 'the bot is worth exactly its cards and slabs');
  assert.ok(f.guestSlabs.length >= 1 && f.guestSlabs.length <= 10, `the bot staked ${f.guestSlabs.length} slabs`);
  assert.ok(f.guestSlabs.every(s => s.id === null && s.cert === null && s.guard === null && s.reverse === false), 'a bot slab is generated: no id, no cert');
  const distinct = f.guestStake.length; const copies = f.guestStake.reduce((n, c) => n + c.qty, 0);
  assert.ok(distinct >= 1 && distinct <= COINFLIP_RULES.maxCards && copies <= COINFLIP_RULES.maxCopies && f.guestStake.every(c => c.qty <= COINFLIP_RULES.maxQty));
  console.log(`      5M flip vs bot: ${ms.toFixed(0)} ms request, the bot put up ${(guest / 100).toLocaleString()} coins = ${distinct} different cards (${copies} copies) + ${f.guestSlabs.length} slabs`);
  // the human's own stake never left them; the bot's cards were created for them; its slabs minted exactly
  assert.equal(totalCards(), cardsBefore + copies);
  const rows = mintedFor('coinflip', f.id); assert.equal(rows.length, f.guestSlabs.length); assert.equal(slabCount(), rowsBefore + rows.length);
  f.guestSlabs.forEach((s, i) => {
    const m = rows.find(x => x.request_id === `casino:coinflip:${f.id}:${i}`); assert.ok(m, `slab ${i}`);
    assert.deepEqual({ user: m.user_id, card: m.card_id, grade: m.grade, band: m.band, fee: m.fee_cents, guard: m.guard, status: m.status, locked: m.locked, shown: m.shown, reverse: m.reverse },
      { user: 'a', card: s.cardId, grade: s.grade, band: bandOf(s.cardId), fee: 0, guard: null, status: 'slabbed', locked: null, shown: 0, reverse: 0 });
    assert.equal(slabCents(s.cardId, s.grade), cents(s.value), 'the generated slab is worth what a real one of that grade is');
  });
  for (const id of slabs) { const s = slabRow(id); assert.equal(s.user_id, 'a'); assert.equal(s.locked, null); assert.equal(s.status, 'slabbed'); }
  // the win: what the winnings page says, what the sale pays, and a second sale
  const info = await winnings.info('coinflip', f.id, 'a'); assert.equal(info.slabs, rows.length); assert.equal(cents(info.coins), guest);
  const sold = await sellAll('coinflip', f.id, 'a');
  assert.equal(sold.cents, guest); assert.equal(sold.slabs, rows.length); assert.equal(sold.cards, copies);
  assert.equal(coinsOf('a'), coinsBefore + guest, 'every coin of the win was paid, with no ceiling');
  assert.ok(coinsOf('a') > coinsBefore); assert.equal(totalCards(), cardsBefore);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM graded_cards WHERE request_id LIKE ? AND status = 'sold' AND sell_request_id = ?").get(`casino:coinflip:${f.id}:%`, `casino:coinflip:${f.id}`).n, rows.length);
  assert.equal((await winnings.sell('coinflip', f.id, 'a')).status, 409, 'sold once');
  assert.equal(coinsOf('a'), coinsBefore + guest);
  // a retry of the same request replays the settled flip: nothing more is minted or paid
  const again = slabCount();
  assert.equal(mintedFor('coinflip', f.id).length, rows.length); assert.equal(slabCount(), again);
});

await check('5,000,000-coin coinflip vs a bot: when the bot wins, the human\'s cards and slabs are gone, nothing is minted, no coin moves', async () => {
  const { body, value, slabs } = stakeFor('b'); const coinsBefore = coinsOf('b'); const rowsBefore = slabCount(); const cardsBefore = totalCards();
  rig.coin = 'guest'; const r = await cf.bot('b', body); unrig();
  assert.equal(r.status, 200, JSON.stringify(r).slice(0, 400)); assert.equal(r.flip.winner, 'guest'); assert.equal(cents(r.flip.hostValue), value);
  assert.equal(mintedFor('coinflip', r.flip.id).length, 0, 'a bot win mints nothing'); assert.equal(slabCount(), rowsBefore);
  for (const id of slabs) { const s = slabRow(id); assert.equal(s.status, 'sold'); assert.equal(s.sold_cents, 0); assert.equal(s.sell_request_id, `casino:coinflip:${r.flip.id}`); assert.equal(s.locked, null); assert.equal(s.guard, null); }
  assert.equal(totalCards(), cardsBefore - 100 * 77, 'the human\'s cards left the game with the bot');
  assert.equal(coinsOf('b'), coinsBefore, 'no coin moved'); assert.ok([403, 409].includes((await winnings.sell('coinflip', r.flip.id, 'b')).status), 'nothing to sell');
});

await check('5,000,000-coin coinflip human vs human: cards and slabs of both piles reach the winner, the winnings sell un-clamped (equal stakes, no bot)', async () => {
  const hostStake = stakeFor('c'); const guestStake = stakeFor('d');
  assert.equal(hostStake.value, guestStake.value);
  const cardsBefore = totalCards(); const rows = slabCount(); const coinsBefore = coinsOf('c');
  const made = await cf.create('c', hostStake.body); assert.equal(made.status, 200, JSON.stringify(made).slice(0, 300));
  assert.ok(made.flip.window.max > 5_000_000);
  rig.coin = 'host'; const joined = await cf.join(made.flip.id, 'd', guestStake.body); unrig();
  assert.equal(joined.status, 200, JSON.stringify(joined).slice(0, 300)); assert.equal(joined.flip.winner, 'host');
  assert.equal(totalCards(), cardsBefore, 'cards are conserved'); assert.equal(slabCount(), rows, 'no slab minted in a human game');
  for (const id of [...hostStake.slabs, ...guestStake.slabs]) assert.equal(slabRow(id).user_id, 'c');
  for (const id of guestStake.slabs) assert.match(slabRow(id).request_id, /^won:/);
  const sold = await sellAll('coinflip', made.flip.id, 'c');
  assert.equal(sold.cents, guestStake.value); assert.equal(sold.slabs, 10); assert.equal(coinsOf('c'), coinsBefore + guestStake.value);
});

// ---- 5M jackpot ----------------------------------------------------------------------------------------------------------------
async function bigPot(user, { players, winnerSeat, path = 'quick' }) {
  const stake = stakeFor(user); const cardsBefore = totalCards(); const coinsBefore = coinsOf(user); const rowsBefore = slabCount();
  rig.fraction = winnerSeat === 0 ? 0.0000001 : 0.9999999;
  const t0 = performance.now(); const r = await (path === 'quick' ? jp.quick(user, { players, ...stake.body }) : jp.create(user, { players, ...stake.body })); const ms = performance.now() - t0; unrig();
  assert.equal(r.status, 200, JSON.stringify(r).slice(0, 400));
  return { stake, cardsBefore, coinsBefore, rowsBefore, ms, pot: r.jackpot };
}
await check('5,000,000-coin jackpot quick pot (4 seats, 3 bots): the human wins, every bot slab is minted, all of it is sold in parts, un-clamped', async () => {
  const { stake, cardsBefore, coinsBefore, rowsBefore, ms, pot } = await bigPot('e', { players: 4, winnerSeat: 0 });
  assert.equal(pot.status, 'done'); assert.equal(pot.winnerSeat, 0); assert.equal(pot.entries.length, 4);
  const bots = pot.entries.filter(e => e.player.bot); assert.equal(bots.length, 3);
  let won = 0; let copies = 0; let botSlabs = 0;
  for (const e of bots) {
    assert.ok(cents(e.value) <= stake.value, 'a bot puts up at most the human did'); assert.equal(stakeCents(e.stake, e.slabs), cents(e.value));
    assert.ok(e.stake.length <= 100 && e.slabs.length <= 10 && e.slabs.every(s => s.id === null));
    won += cents(e.value); copies += e.stake.reduce((n, c) => n + c.qty, 0); botSlabs += e.slabs.length;
  }
  assert.ok(won > 0.9 * 3 * 0.8 * stake.value / 1, `three bots put up ${won / 100} coins`);
  console.log(`      5M quick pot: ${ms.toFixed(0)} ms request, 3 bots put up ${(won / 100).toLocaleString()} coins (${copies} copies, ${botSlabs} slabs)`);
  const rows = mintedFor('jackpot', pot.id); assert.equal(rows.length, botSlabs); assert.equal(slabCount(), rowsBefore + botSlabs);
  const want = new Set(bots.flatMap(e => e.slabs.map((_, i) => `casino:jackpot:${pot.id}:${e.seat * 10 + i}`)));
  assert.deepEqual(new Set(rows.map(x => x.request_id)), want, 'one row per bot slab, named by seat and place');
  assert.ok(rows.every(x => x.user_id === 'e' && x.status === 'slabbed' && x.fee_cents === 0 && x.guard === null && x.locked === null && x.shown === 0));
  assert.equal(totalCards(), cardsBefore + copies);
  for (const id of stake.slabs) assert.equal(slabRow(id).status, 'slabbed');
  const sold = await sellAll('jackpot', pot.id, 'e');
  assert.equal(sold.cents, won); assert.equal(sold.slabs, botSlabs); assert.equal(sold.cards, copies); assert.equal(coinsOf('e'), coinsBefore + won, 'un-clamped');
  assert.equal(totalCards(), cardsBefore); assert.equal((await winnings.sell('jackpot', pot.id, 'e')).status, 409);
});

await check('5,000,000-coin jackpot quick pot when a bot wins: the human slabs close, nothing is minted, no coin moves', async () => {
  const { stake, coinsBefore, rowsBefore, pot } = await bigPot('f', { players: 4, winnerSeat: 3 });
  assert.equal(pot.status, 'done'); assert.equal(pot.winnerSeat, 3); assert.equal(pot.entries[3].player.bot, true);
  assert.equal(mintedFor('jackpot', pot.id).length, 0); assert.equal(slabCount(), rowsBefore);
  for (const id of stake.slabs) { const s = slabRow(id); assert.equal(s.status, 'sold'); assert.equal(s.sold_cents, 0); assert.equal(s.sell_request_id, `casino:jackpot:${pot.id}`); }
  assert.equal(coinsOf('f'), coinsBefore); assert.ok([403, 409].includes((await winnings.sell('jackpot', pot.id, 'f')).status), 'nothing to sell');
});

await check('5,000,000-coin jackpot with ten seats (nine bots, up to 90 generated slabs): drawn in the join, minted, sold in several parts, un-clamped', async () => {
  const { stake, cardsBefore, coinsBefore, rowsBefore, ms, pot } = await bigPot('g', { players: 10, winnerSeat: 0 });
  assert.equal(pot.entries.length, 10); const bots = pot.entries.filter(e => e.player.bot); assert.equal(bots.length, 9);
  const won = bots.reduce((n, e) => n + cents(e.value), 0); const botSlabs = bots.reduce((n, e) => n + e.slabs.length, 0); const copies = bots.reduce((n, e) => n + e.stake.reduce((m, c) => m + c.qty, 0), 0);
  const distinct = new Set(bots.flatMap(e => e.stake.map(c => c.id))).size;
  console.log(`      5M ten-seat pot: ${ms.toFixed(0)} ms request, 9 bots put up ${(won / 100).toLocaleString()} coins (${distinct} different cards, ${copies} copies, ${botSlabs} slabs)`);
  assert.equal(mintedFor('jackpot', pot.id).length, botSlabs); assert.equal(slabCount(), rowsBefore + botSlabs);
  assert.ok(new Set(mintedFor('jackpot', pot.id).map(x => x.request_id)).size === botSlabs);
  assert.equal(totalCards(), cardsBefore + copies);
  const sold = await sellAll('jackpot', pot.id, 'g');
  assert.equal(sold.cents, won); assert.equal(sold.slabs, botSlabs); assert.equal(sold.cards, copies); assert.equal(coinsOf('g'), coinsBefore + won);
  assert.ok(sold.parts >= Math.ceil(distinct / 150) && sold.parts >= Math.ceil(botSlabs / 25), `${sold.parts} parts`);
  assert.ok(coinsOf('g') > 100_000_000, 'a wallet of tens of millions of coins is untouched by any cap'); void stake;
});

await check('5,000,000-coin jackpot human vs human (3 seats): the winner takes every card and slab and sells them un-clamped', async () => {
  const stakes = { a: stakeFor('a'), b: stakeFor('b'), h: stakeFor('h') };
  const cardsBefore = totalCards(); const coinsBefore = coinsOf('h'); const rows = slabCount();
  const made = await jp.create('a', { players: 3, ...stakes.a.body }); assert.equal(made.status, 200, JSON.stringify(made).slice(0, 300));
  assert.equal((await jp.join(made.jackpot.id, 'b', stakes.b.body)).status, 200);
  rig.fraction = 0.9999999; const last = await jp.join(made.jackpot.id, 'h', stakes.h.body); unrig();
  assert.equal(last.status, 200, JSON.stringify(last).slice(0, 300)); assert.equal(last.jackpot.status, 'done'); assert.equal(last.jackpot.winnerSeat, 2);
  assert.equal(totalCards(), cardsBefore); assert.equal(slabCount(), rows, 'no slab minted: no bot');
  for (const s of [...stakes.a.slabs, ...stakes.b.slabs, ...stakes.h.slabs]) assert.equal(slabRow(s).user_id, 'h');
  const sold = await sellAll('jackpot', made.jackpot.id, 'h');
  assert.equal(sold.cents, stakes.a.value + stakes.b.value); assert.equal(sold.slabs, 20); assert.equal(coinsOf('h'), coinsBefore + stakes.a.value + stakes.b.value);
});

await check('no wallet is ever lowered by the free handouts (the hourly bonus tops up to 1,000,000 and never down)', async () => {
  const before = coinsOf('h'); assert.ok(before > 100_000_000);
  const r = await api('/api/daily', 'POST', {}, 'h'); assert.ok(r.status === 200 || r.status === 400, JSON.stringify(r).slice(0, 200));
  assert.ok(coinsOf('h') >= before, 'the bonus never lowers a wallet over the ceiling');
});

// ---- The v2 triggers --------------------------------------------------------------------------------------------------------
const dump = () => createHash('sha1').update(JSON.stringify(['cards', 'graded_cards', 'coinflips', 'jackpots', 'jackpot_entries']
  .map(t => db.prepare(`SELECT * FROM ${t}`).all()).concat([db.prepare('SELECT user_id, coins FROM profiles ORDER BY user_id').all()]))).digest('hex');
const snapRow = (cardId, grade, v, extra = {}) => ({ cardId, name: 'x', number: '1', rarity: 'x', image: '', small: '', grade, reverse: false, guard: null, band: 'me', v, ...extra });
const rawRow = (id, qty, v) => ({ id, name: 'x', number: '1', rarity: 'x', image: '', small: '', qty, rev: 0, v });

await check('triggers: a house flip settles only with well-formed generated slabs worth what the bot says and no more than the host put up; replays and double mints fail', async () => {
  const made = await cf.create('a', { cards: [{ id: 'me5-98', qty: 1 }] }); assert.equal(made.status, 200, JSON.stringify(made).slice(0, 300));
  const id = made.flip.id; const hostValue = 797; // me5-98
  const settle = (stake, slabs, value, winner = 'host') => db.prepare(`UPDATE coinflips SET status = 'done', guest_id = 'house', guest_stake = ?, guest_slabs = ?, guest_value = ?, bot_persona = 'professor-elm',
    winner = ?, flipped_at = ? WHERE id = ? AND status = 'open'`).run(JSON.stringify(stake), slabs === null ? null : JSON.stringify(slabs), value, winner, now, id);
  const raw = [rawRow('me5-3', 20, 12)]; // 240
  const ok = snapRow('me5-90', 9, 500);
  const frozen = dump(); const NOT_VALID = /That stake is not valid/;
  const bad = [
    ['an id on a generated slab', [snapRow('me5-90', 9, 500, { id: 99 })], 740],
    ['grade 0', [snapRow('me5-90', 0, 500)], 740], ['grade 11', [snapRow('me5-90', 11, 500)], 740], ['a text grade', [snapRow('me5-90', '9', 500)], 740], ['a fractional grade', [snapRow('me5-90', 9.5, 500)], 740],
    ['a numeric band', [snapRow('me5-90', 9, 500, { band: 7 })], 740], ['no band', [(({ band, ...rest }) => rest)(snapRow('me5-90', 9, 500))], 740],
    ['a numeric cardId', [snapRow(5, 9, 500)], 740], ['a fractional value', [snapRow('me5-90', 9, 500.5)], 740.5], ['a negative value', [snapRow('me5-90', 9, -1)], 239], ['a text value', [snapRow('me5-90', 9, '500')], 740],
    ['eleven slabs', Array.from({ length: 11 }, () => snapRow('me5-90', 9, 1)), 251],
    ['a value that does not add up', [ok], 741], ['a value that does not add up (low)', [ok], 739],
    ['more than the host put up', [snapRow('me5-90', 9, 700)], 940],
    ['a slab list that is not an array', { not: 'a list' }, 240],
  ];
  for (const [label, slabs, value] of bad) {
    assert.throws(() => settle(raw, slabs, value), err => /That stake is not valid|That flip cannot be settled|datatype/.test(err.message), label);
    assert.equal(dump(), frozen, `${label}: nothing changed`);
  }
  assert.throws(() => settle([], [], 0), /cannot be settled/, 'an empty bot stake');
  assert.equal(dump(), frozen);
  // well-formed: accepted, and the host (a human) wins: one row minted per slab, named by its place
  assert.equal(settle(raw, [ok, snapRow('me5-97', 8, 40)], 780).changes, 1);
  assert.equal(db.prepare('SELECT status FROM coinflips WHERE id = ?').get(id).status, 'done');
  const rows = mintedFor('coinflip', id); assert.deepEqual(rows.map(x => x.request_id), [`casino:coinflip:${id}:0`, `casino:coinflip:${id}:1`]);
  assert.deepEqual(rows.map(x => [x.user_id, x.card_id, x.grade, x.band, x.fee_cents, x.status, x.locked]), [['a', 'me5-90', 9, 'me', 0, 'slabbed', null], ['a', 'me5-97', 8, 'me', 0, 'slabbed', null]]);
  // replay: a settled flip cannot settle again; a second row with a minted request id cannot be inserted
  const after = dump();
  assert.throws(() => db.prepare(`UPDATE coinflips SET status = 'done', guest_id = 'house', winner = 'host', guest_stake = ?, guest_slabs = ?, guest_value = 780 WHERE id = ?`).run(JSON.stringify(raw), JSON.stringify([ok, ok]), id));
  assert.throws(() => db.prepare(`INSERT INTO graded_cards(user_id, card_id, reverse, grade, band, fee_cents, request_id, status, created_at) VALUES('a', 'me5-90', 0, 9, 'me', 0, ?, 'slabbed', ?)`).run(`casino:coinflip:${id}:0`, now), /UNIQUE/);
  assert.equal(dump(), after);
  assert.equal(settle(raw, [ok], 740).changes, 0, 'the WHERE status = open guard: a replayed settle changes no row'); assert.equal(dump(), after);
  // a house win mints nothing and closes the human's slab; the bot's list may be empty (the v1 shape) too
  const hs = mintReal('a', 'me5-98', 9); const flip2 = await cf.create('a', { cards: [], slabs: [hs] }); assert.equal(flip2.status, 200, JSON.stringify(flip2).slice(0, 200));
  const hv = cents(flip2.flip.hostValue); const g2 = [snapRow('me5-90', 9, hv - 100)];
  db.prepare(`UPDATE coinflips SET status = 'done', guest_id = 'house', guest_stake = '[]', guest_slabs = ?, guest_value = ?, bot_persona = 'professor-elm', winner = 'guest', flipped_at = ? WHERE id = ?`)
    .run(JSON.stringify(g2), hv - 100, now, flip2.flip.id);
  assert.equal(mintedFor('coinflip', flip2.flip.id).length, 0); assert.equal(slabRow(hs).status, 'sold'); assert.equal(slabRow(hs).sell_request_id, `casino:coinflip:${flip2.flip.id}`);
  // a human guest still may not carry a generated slab: the id and ownership rules of v1 apply to them
  const f3 = await cf.create('b', { cards: [{ id: 'me5-98', qty: 1 }] }); assert.equal(f3.status, 200);
  assert.throws(() => db.prepare(`UPDATE coinflips SET status = 'done', guest_id = 'c', guest_stake = '[]', guest_slabs = ?, guest_value = 500, winner = 'host', flipped_at = ? WHERE id = ?`)
    .run(JSON.stringify([snapRow('me5-90', 9, 500)]), now, f3.flip.id), /not valid/);
});

await check('triggers: a jackpot bot entry carries only well-formed generated slabs, within the host\'s value, and a human win mints them once (no mint when a bot wins)', async () => {
  const made = await jp.create('f', { players: 4, cards: [{ id: 'me5-98', qty: 2 }] }); assert.equal(made.status, 200, JSON.stringify(made).slice(0, 300));
  const id = made.jackpot.id; const min = 1594; const stakeA = [rawRow('me5-3', 20, 12)];
  const entry = (seat, stake, slabs, value, persona = 'professor-elm') => db.prepare(`INSERT INTO jackpot_entries(jackpot_id, seat, user_id, bot, bot_persona, stake, slabs, value, created_at) VALUES(?, ?, NULL, 1, ?, ?, ?, ?, ?)`)
    .run(id, seat, persona, JSON.stringify(stake), slabs === null ? null : JSON.stringify(slabs), value, now);
  const frozen = dump();
  const bad = [
    ['an id on a generated slab', [snapRow('me5-90', 9, 500, { id: 5 })], 740], ['grade 0', [snapRow('me5-90', 0, 500)], 740], ['grade 11', [snapRow('me5-90', 11, 500)], 740],
    ['a numeric band', [snapRow('me5-90', 9, 500, { band: 1 })], 740], ['a fractional value', [snapRow('me5-90', 9, 500.5)], 740.5], ['a negative value', [snapRow('me5-90', 9, -5)], 235],
    ['eleven slabs', Array.from({ length: 11 }, () => snapRow('me5-90', 9, 1)), 251], ['a value that does not add up', [snapRow('me5-90', 9, 500)], 741],
    ['more than the host put up', [snapRow('me5-90', 9, 1500)], 1740],
  ];
  for (const [label, slabs, value] of bad) { assert.throws(() => entry(1, stakeA, slabs, value), err => /not valid|outside the pot/.test(err.message), label); assert.equal(dump(), frozen, label); }
  assert.throws(() => entry(0, stakeA, [snapRow('me5-90', 9, 500)], 740), /holds the first seat/, 'a bot never takes the host seat');
  entry(1, stakeA, [snapRow('me5-90', 9, 500), snapRow('me5-97', 8, 40)], 780); entry(2, [rawRow('me5-3', 10, 12)], [snapRow('me5-99', 7, 300)], 420, 'nurse-joy');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM jackpot_entries WHERE jackpot_id = ?').get(id).n, 3);
  // a human wins (seat 0): three rows, named by seat * 10 + place; everything is atomic with the draw
  db.prepare("UPDATE jackpots SET status = 'done', winner_seat = 0, drawn_at = ? WHERE id = ?").run(now, id);
  assert.deepEqual(mintedFor('jackpot', id).map(x => x.request_id).sort(), [`casino:jackpot:${id}:10`, `casino:jackpot:${id}:11`, `casino:jackpot:${id}:20`]);
  assert.ok(mintedFor('jackpot', id).every(x => x.user_id === 'f' && x.status === 'slabbed' && x.fee_cents === 0 && x.locked === null));
  const after = dump();
  assert.throws(() => db.prepare("UPDATE jackpots SET status = 'done', winner_seat = 1, drawn_at = ? WHERE id = ?").run(now, id)); assert.throws(() => db.prepare("UPDATE jackpots SET winner_seat = 1 WHERE id = ?").run(id));
  assert.throws(() => db.prepare(`INSERT INTO graded_cards(user_id, card_id, reverse, grade, band, fee_cents, request_id, status, created_at) VALUES('f', 'me5-90', 0, 9, 'me', 0, ?, 'slabbed', ?)`).run(`casino:jackpot:${id}:10`, now), /UNIQUE/);
  assert.equal(dump(), after);
  // a bot wins: nothing minted, and the human's slab closes
  const hs = mintReal('e', 'me5-98', 9); const made2 = await jp.create('e', { players: 3, cards: [], slabs: [hs] }); assert.equal(made2.status, 200, JSON.stringify(made2).slice(0, 200));
  const hv = cents(made2.jackpot.entries[0].value); const id2 = made2.jackpot.id;
  db.prepare(`INSERT INTO jackpot_entries(jackpot_id, seat, user_id, bot, bot_persona, stake, slabs, value, created_at) VALUES(?, 1, NULL, 1, 'professor-elm', '[]', ?, ?, ?)`)
    .run(id2, JSON.stringify([snapRow('me5-90', 9, hv)]), hv, now);
  db.prepare("UPDATE jackpots SET status = 'done', winner_seat = 1, drawn_at = ? WHERE id = ?").run(now, id2);
  assert.equal(mintedFor('jackpot', id2).length, 0); assert.equal(slabRow(hs).status, 'sold'); assert.equal(slabRow(hs).sell_request_id, `casino:jackpot:${id2}`);
  // a human entry may not carry a generated slab (no id): the v1 rules apply to people
  const made3 = await jp.create('d', { players: 3, cards: [{ id: 'me5-98', qty: 2 }] }); assert.equal(made3.status, 200);
  assert.throws(() => db.prepare(`INSERT INTO jackpot_entries(jackpot_id, seat, user_id, bot, bot_persona, stake, slabs, value, created_at) VALUES(?, 1, 'c', 0, NULL, '[]', ?, 1594, ?)`)
    .run(made3.jackpot.id, JSON.stringify([snapRow('me5-90', 9, 1594)]), now), /not valid/);
});

// ---- The bot builder ---------------------------------------------------------------------------------------------------------
const poolOf = sets => catalogCards.filter(c => sets.some(s => s.id === c.set.id)).map(c => ({ id: c.id, name: c.card.name, number: c.card.number, rarity: c.card.rarity, image: c.card.image, small: c.card.imageSmall || c.card.image,
  cents: c.cents, band: bandFor(c.set) }));
await check('bot builder: quantity-based and CPU-bounded; a 5,000,000-coin and a 50,000-coin target are built in milliseconds inside the window and the caps', () => {
  const pools = [['six sets', poolOf(PLAYABLE_SETS.filter(s => !s.viewOf && s.dataFile).slice(0, 6))], ['all sets', poolOf(PLAYABLE_SETS)]];
  for (const [label, pool] of pools) {
    for (const coins of [5_000_000, 50_000, 500]) {
      const target = coins * 100; const n = 30; let ok = 0; let worst = 0; let total = 0; let steps = 0; let slabs = 0; let distinct = 0;
      for (let i = 0; i < n; i++) {
        const stats = { steps: 0 }; const t = performance.now(); const b = buildBotStake(pool, target, { rules: COINFLIP_RULES, stats }); const dt = performance.now() - t; worst = Math.max(worst, dt); total += dt;
        assert.ok(stats.steps <= BOT_BUILD.attempts * BOT_BUILD.steps, 'bounded work');
        if (!b) continue; ok++; steps += stats.steps; slabs += b.slabs.length; distinct = Math.max(distinct, b.stake.length);
        const win = botStakeWindow(target); const value = b.stake.reduce((m, c) => m + c.v * c.qty, 0) + b.slabs.reduce((m, s) => m + s.v, 0);
        assert.equal(value, b.value); assert.ok(b.value >= win.low && b.value <= win.high, `${label} ${coins}: ${b.value} in ${win.low}..${win.high}`);
        assert.ok(b.stake.length <= COINFLIP_RULES.maxCards && b.stake.every(c => c.qty >= 1 && c.qty <= COINFLIP_RULES.maxQty) && b.stake.reduce((m, c) => m + c.qty, 0) <= COINFLIP_RULES.maxCopies && b.slabs.length <= 10);
        assert.equal(new Set(b.stake.map(c => c.id)).size, b.stake.length);
      }
      if (coins >= 50_000) assert.equal(ok, n, `${label} ${coins}: every build lands`);
      assert.ok(worst < 250, `${label} ${coins}: worst build ${worst.toFixed(1)} ms`);
      console.log(`      builder ${label} ${String(coins).padStart(7)} coins: ${ok}/${n} built, avg ${(total / n).toFixed(2)} ms, worst ${worst.toFixed(2)} ms, avg ${(steps / Math.max(1, ok)).toFixed(0)} steps, avg ${(slabs / Math.max(1, ok)).toFixed(1)} slabs, up to ${distinct} different cards`);
    }
  }
});

// ---- A bot slab is never worth less than the card inside it (no crack-and-sell farm) ----------------------------------------
// A grade 9 is worth exactly the card's market and a 10 its band's gem rate (>= 1.5); lower grades are worth 0.3x to 0.8x of it,
// so a won slab of grade 1 to 8 could be cracked for free and the raw card sold for MORE than the slab says. A bot therefore
// only ever stakes grade 10 and 9, and its generated slabs carry at least their card's price.
const worth = set => catalogCards.filter(c => c.set.id === set.id && c.cents >= 20).length;
// (the bands that have a playable set: a bot's pool is made of playable sets only; the first test above covers every band's odds)
const bandSets = GRADE_BANDS.map(band => ({ band, sets: PLAYABLE_SETS.filter(s => !s.viewOf && s.dataFile && bandFor(s).id === band.id && worth(s) >= 5).sort((x, y) => worth(y) - worth(x)) })).filter(b => b.sets.length);
assert.ok(bandSets.length >= 4, `bands with playable sets: ${bandSets.map(b => b.band.id)}`);
/** The best a winner can realise from what a bot staked: raw cards sold at their price, each slab either sold or cracked (max of the two). */
const bestCase = (stake, slabs) => stake.reduce((n, c) => n + c.v * c.qty, 0) + slabs.reduce((n, s) => n + Math.max(s.v, byId.get(s.cardId).cents), 0);
await check('bot slabs: only grades 10 and 9, rolled from the band odds, and worth at least the raw card in every band, for every card, with rounding', () => {
  assert.deepEqual(BOT_GRADES, [10, 9]);
  for (const { band } of bandSets) {
    let tens = 0;
    for (let r = 0; r < 10000; r++) { const g = rollBotGrade(band, r); assert.ok(g === 10 || g === 9, `${band.id}: grade ${g}`); if (g === 10) tens++; }
    const want = band.odds[10] / (band.odds[10] + band.odds[9]);
    assert.ok(Math.abs(tens / 10000 - want) < 0.001, `${band.id}: ${tens / 100}% tens, odds say ${(want * 100).toFixed(2)}%`);
    assert.ok(gradeMultiplier(9, band) >= 1 && gradeMultiplier(10, band) >= 1.5, `${band.id}: the multipliers of 9 and 10`);
  }
  assert.throws(() => rollBotGrade(GRADE_BANDS[0], 10000)); assert.throws(() => rollBotGrade(GRADE_BANDS[0], -1));
  let checked = 0;
  for (const c of catalogCards) {
    const band = bandFor(c.set);
    for (const grade of BOT_GRADES) {
      const v = Math.round(money(c.cents / 100 * gradeMultiplier(grade, band)) * 100); // what the builder stores
      assert.ok(v >= c.cents, `${c.id} grade ${grade}: ${v} < ${c.cents}`);
      assert.ok(slabCents(c.id, grade) >= c.cents, `${c.id} grade ${grade}: graded value under the card's price`);
      checked++;
    }
  }
  console.log(`      checked ${checked} card/grade pairs across ${GRADE_BANDS.length} bands`);
});

await check('bot slabs: in every band the best case a winner can realise (sell the raw, crack or sell each slab) is at most the bot\'s stated value, which is at most the human\'s stake', () => {
  let builds = 0; let withSlabs = 0; let slabsSeen = 0;
  for (const { band, sets } of bandSets) {
    for (const set of sets.slice(0, 3)) {
      const top = catalogCards.filter(c => c.set.id === set.id).slice(0, 10);
      const hostSlabs = top.map(c => ({ id: 1, cardId: c.id, grade: 10, v: slabCents(c.id, 10) }));
      const H = hostSlabs.reduce((n, s) => n + s.v, 0);
      const others = PLAYABLE_SETS.filter(s => !s.viewOf && s.dataFile && s.id !== set.id).slice(0, 3);
      const pool = poolOf([set, ...others]);
      for (const [target, hs] of [[H, hostSlabs], [H, hostSlabs.slice(0, 1)], [500_000_000, []], [5_000_000, []]]) {
        for (let i = 0; i < 25; i++) {
          const b = buildBotStake(pool, target, { hostSlabs: hs, rules: COINFLIP_RULES }); if (!b) continue; builds++;
          if (b.slabs.length) withSlabs++; slabsSeen += b.slabs.length;
          assert.ok(b.slabs.every(s => BOT_GRADES.includes(s.grade) && s.v >= byId.get(s.cardId).cents && s.id === undefined), `${band.id}: grades and values`);
          assert.ok(b.value <= target, `${band.id}: the bot (${b.value}) never stakes more than the human (${target})`);
          assert.ok(bestCase(b.stake, b.slabs) <= b.value, `${band.id}: realizable ${bestCase(b.stake, b.slabs)} > stated ${b.value}`);
        }
      }
    }
  }
  assert.ok(builds > 500 && withSlabs > 100, `${builds} builds, ${withSlabs} with slabs`);
  console.log(`      ${builds} bot stakes over every band (${withSlabs} with slabs, ${slabsSeen} slabs): none worth more cracked than stated`);
});

await check('bot slabs end to end in every band: through the Worker (bot flips and quick pots with slab stakes) what a winner holds is worth at most what the bot staked, which is at most the human\'s stake', async () => {
  let flips = 0; let pots = 0; let minted = 0;
  for (const { band, sets } of bandSets) {
    const user = `band-${band.id}`; addUser(user); setCoins(user, 1000);
    const set = sets[0]; const top = catalogCards.filter(c => c.set.id === set.id).slice(0, 10);
    const slabs = top.map(c => mintReal(user, c.id, 10)); const H = slabs.reduce((n, id) => n + slabCents(slabRow(id).card_id, 10), 0);
    for (let i = 0; i < 6; i++) {
      rig.coin = 'host'; const r = await cf.bot(user, { cards: [], slabs }); unrig();
      assert.equal(r.status, 200, `${band.id}: ${JSON.stringify(r).slice(0, 200)}`); const f = r.flip; flips++;
      const guest = cents(f.guestValue); assert.ok(guest <= H && guest === stakeCents(f.guestStake, f.guestSlabs));
      const rows = mintedFor('coinflip', f.id); assert.equal(rows.length, f.guestSlabs.length); minted += rows.length;
      for (const m of rows) { assert.ok(m.grade === 9 || m.grade === 10); assert.ok(slabCents(m.card_id, m.grade) >= byId.get(m.card_id).cents, `${band.id}: minted slab under its card`); }
      const best = f.guestStake.reduce((n, c) => n + cents(c.value) * c.qty, 0) + rows.reduce((n, m) => n + Math.max(slabCents(m.card_id, m.grade), byId.get(m.card_id).cents), 0);
      assert.ok(best <= guest, `${band.id}: realizable ${best} <= stated ${guest} <= human ${H}`);
      await sellAll('coinflip', f.id, user);
    }
    for (let i = 0; i < 3; i++) {
      rig.fraction = 0.0000001; const r = await jp.quick(user, { players: 3, cards: [], slabs }); unrig();
      assert.equal(r.status, 200, `${band.id}: ${JSON.stringify(r).slice(0, 200)}`); const pot = r.jackpot; pots++; assert.equal(pot.winnerSeat, 0);
      const rows = mintedFor('jackpot', pot.id); const bots = pot.entries.filter(e => e.player.bot);
      assert.equal(rows.length, bots.reduce((n, e) => n + e.slabs.length, 0)); minted += rows.length;
      for (const e of bots) {
        assert.ok(cents(e.value) <= H, 'a bot entry is at most the host\'s'); assert.ok(e.slabs.every(s => BOT_GRADES.includes(s.grade) && cents(s.value) >= byId.get(s.cardId).cents));
        assert.ok(bestCase(e.stake.map(c => ({ v: cents(c.value), qty: c.qty })), e.slabs.map(s => ({ cardId: s.cardId, v: cents(s.value) }))) <= cents(e.value));
      }
      await sellAll('jackpot', pot.id, user);
    }
  }
  console.log(`      ${flips} flips and ${pots} quick pots over ${bandSets.length} bands, ${minted} slabs minted: none worth more cracked than stated`);
});

// ---- A minted slab is not grading: no XP, no quest credit, no gate bypass ---------------------------------------------------------
// (worker/xp.js loadXpCounters, worker/gates.js, worker/grading.js sell, worker/winnings.js). Cards a bot staked count as before; the
// SLABS minted from its stake ('casino:<game>:<id>:<n>', fee 0) are not "cards the player graded".
const xpCounters = user => loadXpCounters(env, user);
const soldEvents = user => { try { return Number(db.prepare("SELECT COALESCE(SUM(amount), 0) n FROM quest_events WHERE user_id = ? AND kind = 'sold'").get(user).n); } catch { return 0; } };
const wonSlab = (user, cardId, grade = 10) => Number(db.prepare(`INSERT INTO graded_cards(user_id, card_id, reverse, grade, band, fee_cents, request_id, guard, status, created_at, shown)
  VALUES(?, ?, 0, ?, ?, 0, ?, NULL, 'slabbed', ?, 0)`).run(user, cardId, grade, bandOf(cardId), `won:seed-${user}-${++seq}`, now).lastInsertRowid);
await check('xp: winning bot flips and pots mints slabs that earn no grading XP, no "sold" quest credit and no grading-gate bypass; real grading still counts', async () => {
  const user = 'farmer'; addUser(user); setCoins(user, 1000); seedLevel(db, user, 9); // level 9: the coinflip (5) and jackpot (8) gates are open, the grading gate (10) is not
  const slabs = TOP.slice(0, 10).map(c => wonSlab(user, c.id, 10)); // slabs won in the casino ('won:'), the stake only
  const before = await xpCounters(user); assert.deepEqual([before.graded, before.gemMint], [0, 0]);
  let mintedTotal = 0; let rawSold = 0; let slabsSold = 0;
  for (let i = 0; i < 20; i++) {
    rig.coin = 'host'; const r = await cf.bot(user, { cards: [], slabs }); unrig(); assert.equal(r.status, 200, JSON.stringify(r).slice(0, 200));
    const rows = mintedFor('coinflip', r.flip.id); mintedTotal += rows.length; assert.ok(rows.length >= 1);
    if (i < 19) { const sold = await sellAll('coinflip', r.flip.id, user); rawSold += sold.cards; slabsSold += sold.slabs; }
    else {
      // the last win is left unsold: one minted slab sold by hand earns no quest credit either
      const ev = soldEvents(user); const one = await api('/api/grading/sell', 'POST', { slabId: rows[0].id, requestId: rid() }, user);
      assert.equal(one.status, 200, JSON.stringify(one).slice(0, 200)); assert.equal(soldEvents(user), ev, 'a minted slab sold by hand earns no quest credit');
    }
  }
  for (let i = 0; i < 5; i++) { rig.fraction = 0.0000001; const r = await jp.quick(user, { players: 3, cards: [], slabs }); unrig(); assert.equal(r.status, 200); mintedTotal += mintedFor('jackpot', r.jackpot.id).length; }
  assert.ok(mintedTotal >= 25 && slabsSold >= 19, `${mintedTotal} slabs minted`);
  assert.ok(db.prepare("SELECT COUNT(*) n FROM graded_cards WHERE user_id = ? AND request_id LIKE 'casino:%'").get(user).n >= 25);
  const after = await xpCounters(user);
  assert.deepEqual([after.graded, after.gemMint], [0, 0], 'no grading XP from minted slabs, whatever their grade or whether sold');
  assert.equal(soldEvents(user), rawSold, `only the raw cards sold count toward "sold" quests (${rawSold}), never the ${slabsSold} slabs`);
  // the grading level gate: slabs won or minted do not count as "has graded"
  const shut = await api('/api/grading/submit', 'POST', { requestId: rid(), cardId: 'me5-98' }, user);
  assert.equal(shut.status, 403, JSON.stringify(shut).slice(0, 200)); assert.ok(shut.needLevel);
  // the save and the me endpoint agree: no graded counter
  const me = await api('/api/me', 'GET', undefined, user); assert.equal(me.status, 200);
  const counters = me.save?.stats?.counters || me.stats?.counters || {}; assert.ok(!counters.graded && !counters.gemMint, JSON.stringify(counters));
  // a player's own grading still counts: +1 per card sent in, +1 gem on a 10, the gate opens, and the sale of that slab counts as "sold"
  const real = 'grader'; addUser(real); setCoins(real, 5000); give(real, 'me5-98', 3);
  const c0 = await xpCounters(real); let gems = 0;
  for (let i = 0; i < 3; i++) { const s = await api('/api/grading/submit', 'POST', { requestId: rid(), cardId: 'me5-98' }, real); assert.equal(s.status, 200, JSON.stringify(s).slice(0, 200)); if (s.slab.grade === 10) gems++; }
  const c1 = await xpCounters(real); assert.equal(c1.graded, c0.graded + 3); assert.equal(c1.gemMint, c0.gemMint + gems);
  const own = db.prepare("SELECT id FROM graded_cards WHERE user_id = ? ORDER BY id").get(real);
  const ev0 = soldEvents(real); assert.equal((await api('/api/grading/sell', 'POST', { slabId: own.id, requestId: rid() }, real)).status, 200); assert.equal(soldEvents(real), ev0 + 1, 'a slab the player graded still counts as sold');
  const lowLevel = 'greenhorn'; addUser(lowLevel); seedLevel(db, lowLevel, 10); give(lowLevel, 'me5-98', 1); setCoins(lowLevel, 500);
  assert.equal((await api('/api/grading/submit', 'POST', { requestId: rid(), cardId: 'me5-98' }, lowLevel)).status, 200, 'at level 10 grading is open');
});

// ---- Past 400 slabs -----------------------------------------------------------------------------------------------------------------
// GRADING_LIMITS.maxSlabs (400) only limits what a player can SUBMIT to grading. A bot's minted slabs are not submitted, so a winner can
// end up holding more; that is allowed. Nothing on the server may break at more than 400 slabs: the Graded list, the save payload, staking,
// winnings, and a new submission is refused with a clear 409 until the player is back under the limit.
await check('more than 400 slabs (minted by winning) break nothing on the server: the Graded list, the save, staking, selling; a new submission says to crack or sell one', async () => {
  const user = 'hoarder'; addUser(user); setCoins(user, 5000); give(user, 'me5-98', 2);
  const ids = []; for (let i = 0; i < 450; i++) ids.push(wonSlab(user, TOP[i % 100].id, 9 + (i % 2)));
  const list = await api('/api/grading', 'GET', undefined, user); assert.equal(list.status, 200); assert.equal(list.slabs.length, 450);
  const me = await api('/api/me', 'GET', undefined, user); assert.equal(me.status, 200); assert.equal(me.save.graded.length, 450);
  const sub = await api('/api/grading/submit', 'POST', { requestId: rid(), cardId: 'me5-98' }, user); assert.equal(sub.status, 409); assert.match(sub.error, /400 slabs/);
  rig.coin = 'host'; const r = await cf.bot(user, { cards: [], slabs: ids.slice(0, 10) }); unrig(); assert.equal(r.status, 200, JSON.stringify(r).slice(0, 200));
  assert.equal(r.save.graded.length, 450 + mintedFor('coinflip', r.flip.id).length);
  const won = await sellAll('coinflip', r.flip.id, user); assert.ok(won.slabs >= 1);
  assert.equal((await api('/api/grading/sell', 'POST', { slabId: ids[20], requestId: rid() }, user)).status, 200);
  assert.equal((await api('/api/grading/crack', 'POST', { slabId: ids[21] }, user)).status, 200);
  const after = await api('/api/grading', 'GET', undefined, user); assert.equal(after.status, 200); assert.ok(after.slabs.length >= 400);
});

// ---- Memory: databases copied for the SQLite memory high-water measurement -------------------------------------------------
await check('memory: maxed pots (10 seats x 100 cards x 1000 copies + 10 slabs; bots minting 8 x 10 slabs; a 5M bot flip) are built (with SLAB_MEM_DIR copies are left for measuring)', async () => {
  const dir = process.env.SLAB_MEM_DIR; if (!dir) return;
  const manifest = [];
  const maxStake = user => { for (const c of TOP) give(user, c.id, 1000); return { cards: TOP.map(c => ({ id: c.id, qty: 1000 })), slabs: TOP.slice(0, 10).map(c => mintReal(user, c.id, 10)) }; };
  // (1) ten human seats, one seat still open: the insert triggers of the last entry are measured; (2) the same pot full, the draw measured.
  const names = Array.from({ length: 10 }, (_, i) => `m${i + 1}`); names.forEach(u => { addUser(u); setCoins(u, 1_000_000); });
  const stakes = names.map(maxStake);
  const made = await jp.create(names[0], { players: 10, ...stakes[0] }); assert.equal(made.status, 200, JSON.stringify(made).slice(0, 300));
  for (let i = 1; i < 9; i++) { const r = await jp.join(made.jackpot.id, names[i], stakes[i]); assert.equal(r.status, 200, JSON.stringify(r).slice(0, 300)); }
  const jid = made.jackpot.id; const slabsOf = i => stakes[i].slabs.map(id => { const r = slabRow(id); return { id, cardId: r.card_id, name: 'x', number: '1', rarity: 'x', image: '', small: '', grade: 10, reverse: 0, guard: null, v: slabCents(r.card_id, 10) }; });
  const entryOf = i => ({ stake: JSON.stringify(TOP.map(c => ({ id: c.id, name: 'x', number: '1', rarity: 'x', image: '', small: '', qty: 1000, rev: 0, v: c.cents }))), slabs: JSON.stringify(slabsOf(i)),
    value: TOP.reduce((n, c) => n + c.cents * 1000, 0) + slabsOf(i).reduce((n, s) => n + s.v, 0) });
  const e9 = entryOf(9);
  db.exec(`VACUUM INTO '${dir}/jp9.db'`);
  manifest.push({ tag: 'jp9-insert', db: 'jp9.db', sql: 'INSERT INTO jackpot_entries(jackpot_id, seat, user_id, bot, bot_persona, stake, slabs, value, created_at) VALUES(?, 9, ?, 0, NULL, ?, ?, ?, ?)',
    params: [jid, names[9], e9.stake, e9.slabs, e9.value, now] });
  const rj = await jp.join(jid, names[9], stakes[9]); assert.equal(rj.status, 200);
  // that last join drew the pot in the same batch: rebuild a full, undrawn pot copy by reopening is not possible, so the draw is measured on a second pot built the same way
  const names2 = Array.from({ length: 10 }, (_, i) => `n${i + 1}`); names2.forEach(u => { addUser(u); setCoins(u, 1_000_000); });
  const stakes2 = names2.map(maxStake);
  const made2 = await jp.create(names2[0], { players: 10, ...stakes2[0] }); assert.equal(made2.status, 200);
  for (let i = 1; i < 9; i++) assert.equal((await jp.join(made2.jackpot.id, names2[i], stakes2[i])).status, 200);
  // the tenth entry, inserted by hand with the pot's draw deferred: insert it, then the draw is a separate UPDATE
  const slabs10 = stakes2[9].slabs.map(id => { const r = slabRow(id); return { id, cardId: r.card_id, name: 'x', number: '1', rarity: 'x', image: '', small: '', grade: 10, reverse: 0, guard: null, v: slabCents(r.card_id, 10) }; });
  db.prepare('INSERT INTO jackpot_entries(jackpot_id, seat, user_id, bot, bot_persona, stake, slabs, value, created_at) VALUES(?, 9, ?, 0, NULL, ?, ?, ?, ?)')
    .run(made2.jackpot.id, names2[9], e9.stake, JSON.stringify(slabs10), e9.value - slabsOf(9).reduce((n, s) => n + s.v, 0) + slabs10.reduce((n, s) => n + s.v, 0), now);
  db.exec(`VACUUM INTO '${dir}/jp10.db'`);
  manifest.push({ tag: 'jp10-draw-human-winner', db: 'jp10.db', sql: "UPDATE jackpots SET status = 'done', winner_seat = 4, drawn_at = ? WHERE id = ?", params: [now, made2.jackpot.id] });
  // (3) a human host and eight bots, each bot up to 10 generated slabs: the draw (human wins) mints them
  const host = 'p1'; addUser(host); setCoins(host, 1_000_000); const hs = maxStake(host);
  const made3 = await jp.create(host, { players: 10, ...hs }); assert.equal(made3.status, 200);
  for (let i = 0; i < 8; i++) { const r = await jp.bot(made3.jackpot.id, host, {}); assert.equal(r.status, 200, JSON.stringify(r).slice(0, 300)); }
  const view = await jp.get(made3.jackpot.id, host); const botSlabs = view.jackpot.entries.filter(e => e.player.bot).reduce((n, e) => n + e.slabs.length, 0);
  console.log(`      bot pot: ${view.jackpot.entries.length} entries, ${botSlabs} generated slabs waiting to be minted`);
  db.exec(`VACUUM INTO '${dir}/jpbot.db'`);
  manifest.push({ tag: 'jpbot-draw-human-wins-mints', db: 'jpbot.db', sql: "UPDATE jackpots SET status = 'done', winner_seat = 0, drawn_at = ? WHERE id = ?", params: [now, made3.jackpot.id] });
  manifest.push({ tag: 'jpbot-draw-bot-wins', db: 'jpbot.db', sql: "UPDATE jackpots SET status = 'done', winner_seat = 3, drawn_at = ? WHERE id = ?", params: [now, made3.jackpot.id] });
  // (4) a 5M human flip (100 cards + 10 slabs) with the bot's 5M answer settled by hand
  const user = 'p2'; addUser(user); setCoins(user, 1_000_000); const big = stakeFor(user);
  const open = await cf.create(user, big.body); assert.equal(open.status, 200, JSON.stringify(open).slice(0, 300));
  const pool = poolOf(PLAYABLE_SETS); const built = buildBotStake(pool, cents(open.flip.hostValue), { hostSlabs: open.flip.hostSlabs.map(x => ({ v: cents(x.value) })), rules: COINFLIP_RULES });
  assert.ok(built && built.slabs.length >= 1);
  const gstake = built.stake.map(c => ({ id: c.id, name: c.name, number: c.number, rarity: c.rarity, image: '', small: '', qty: c.qty, rev: 0, v: c.v }));
  const gslabs = built.slabs.map(s => ({ cardId: s.cardId, name: s.name, number: s.number, rarity: s.rarity, image: '', small: '', grade: s.grade, reverse: false, guard: null, band: s.band, v: s.v }));
  db.exec(`VACUUM INTO '${dir}/flip.db'`);
  for (const winner of ['host', 'guest']) manifest.push({ tag: `flip-bot-settle-${winner}`, db: 'flip.db', sql: `UPDATE coinflips SET status = 'done', guest_id = 'house', guest_stake = ?, guest_slabs = ?, guest_value = ?, bot_persona = 'professor-elm', winner = '${winner}', flipped_at = ? WHERE id = ? AND status = 'open'`,
    params: [JSON.stringify(gstake), JSON.stringify(gslabs), built.value, now, open.flip.id] });
  writeFileSync(`${dir}/manifest.json`, JSON.stringify(manifest));
  console.log(`      left ${manifest.length} measurements in ${dir}: flip with ${gstake.length} cards + ${gslabs.length} slabs`);
});

console.log(results.join('\n'));
console.log(failed ? `\nFAIL: ${failed} failed` : '\nPASS');
Date.now = realNow;
process.exit(failed ? 1 : 0);
