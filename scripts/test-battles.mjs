import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import worker from '../worker/index.js';
import { battleResult, battleSettings } from '../js/battle-rules.js';

const db = new DatabaseSync(':memory:');
let queryCount = 0;
db.exec('PRAGMA foreign_keys = ON');
for (const file of readdirSync(new URL('../worker/migrations/', import.meta.url)).sort())
  db.exec(readFileSync(new URL('../worker/migrations/' + file, import.meta.url), 'utf8'));
const DB = {
  exec: async sql => { db.exec(sql); return {}; },
  prepare(sql) {
    let params = [];
    const s = {
      bind(...values) { assert.ok(values.length <= 100, 'D1 parameter ceiling'); params = values; return s; },
      async all() { queryCount++; return { results: db.prepare(sql).all(...params) }; },
      async first(column) { queryCount++; const row = db.prepare(sql).get(...params); return column ? row?.[column] : row || null; },
      execute() { queryCount++; const r = db.prepare(sql).run(...params); return { success: true, meta: { changes: Number(r.changes) } }; },
      async run() { return s.execute(); },
    }; return s;
  },
  async batch(statements) {
    db.exec('BEGIN');
    try { const results = statements.map(s => s.execute()); db.exec('COMMIT'); return results; }
    catch (err) { db.exec('ROLLBACK'); throw err; }
  },
};
const realNow = Date.now; let now = realNow(); Date.now = () => now;
for (const [id, balance] of [['host', 100000], ['rival', 100000], ['third', 100000], ['poor', 0]]) {
  db.prepare('INSERT INTO users(id,name,handle,password_hash,color,created_at,last_played) VALUES(?,?,?,?,?,?,?)')
    .run(id, id, id, 'unused', 'gold', now, now);
  db.prepare('INSERT INTO profiles(user_id,coins,granted,created_at,binder) VALUES(?,?,?,?,?)').run(id, balance, balance, now, '[]');
  db.prepare('INSERT INTO sessions(id,user_id,created_at,expires_at) VALUES(?,?,?,?)').run(id, id, now, now + 864000000);
}
const env = { DB, ASSETS: { fetch: async request => {
  const path = new URL(request.url).pathname;
  try { return new Response(readFileSync(new URL('..' + path, import.meta.url)), { headers: { 'content-type': 'application/json' } }); }
  catch { return new Response('', { status: 404 }); }
} } };
async function api(path, method = 'GET', body, user = 'host', extraHeaders = {}) {
  const response = await worker.fetch(new Request('https://poke-pack.rip' + path, { method,
    headers: { 'content-type': 'application/json', origin: 'https://poke-pack.rip', ...(user ? { cookie: `pp_sid=${user}` } : {}), ...extraHeaders },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), env);
  return { status: response.status, ...await response.json() };
}
const coins = user => Math.round(db.prepare('SELECT coins FROM profiles WHERE user_id = ?').get(user).coins * 100);
const owned = user => db.prepare('SELECT COALESCE(SUM(qty),0) n FROM cards WHERE user_id = ?').get(user).n;
const create = (settings = {}, lineup = [{ key: 'me5:boosterPack', quantity: 2 }], user = 'host', requestId = crypto.randomUUID()) =>
  api('/api/battles', 'POST', { requestId, settings, lineup }, user);

const catalog = await api('/api/battles/catalog', 'GET', undefined, null);
assert.equal(catalog.status, 200);
assert.ok(catalog.products.some(p => p.key === 'me5:boosterBox' && p.packs === 36));
assert.ok(catalog.products.some(p => p.setId === 'svp' && p.packs > 0), 'mixed-set promo products offered');
assert.ok(catalog.products.some(p => p.packs === 0 && p.rounds > 0), 'promo-only products offered');
assert.ok(catalog.products.every(p => !p._offer), 'public catalog has no private draw metadata');
assert.equal((await create({}, undefined, null)).status, 401);
assert.equal((await create({}, undefined, 'poor')).status, 409);
assert.equal(db.prepare("SELECT COUNT(*) n FROM battles WHERE host_id='poor'").get().n, 0, 'failed escrow rolls back creation');
assert.equal((await create({ teams: true, players: 3 })).status, 400);
assert.equal((await create(null)).status, 400);
assert.equal((await create({ fast: 'false' })).status, 400);
assert.equal((await create({}, [{ key: 'me5:boosterBox', quantity: 3 }])).status, 400);
assert.equal((await create({}, [{ key: 'fake:fake', quantity: 1 }])).status, 400);
assert.equal((await api('/api/battles', 'POST', { requestId: crypto.randomUUID(), lineup: [] }, 'host', { origin: 'https://foreign.example' })).status, 403);

// Creation retry (including simultaneous duplicate submissions) charges once.
const key = crypto.randomUUID(); const before = coins('host');
const [one, retry] = await Promise.all([create({ fast: true }, undefined, 'host', key), create({ fast: true }, undefined, 'host', key)]);
assert.equal(one.status, 200); assert.equal(retry.status, 200); assert.equal(one.battle.id, retry.battle.id);
const id = one.battle.id; const entry = Math.round(one.battle.entryCost * 100);
assert.equal(coins('host'), before - entry);
assert.equal((await api(`/api/battles/${id}/start`, 'POST', {})).status, 409, 'needs all seats');
const [joined, joinRetry] = await Promise.all([api(`/api/battles/${id}/join`, 'POST', {}, 'rival'), api(`/api/battles/${id}/join`, 'POST', {}, 'rival')]);
assert.ok([joined.status, joinRetry.status].includes(200));
assert.equal(coins('rival'), 10000000 - entry, 'concurrent join debits once');
assert.equal((await api(`/api/battles/${id}/join`, 'POST', { seat: 1 }, 'third')).status, 409);
assert.equal((await api(`/api/battles/${id}/start`, 'POST', {}, 'rival')).status, 403);
const start = await api(`/api/battles/${id}/start`, 'POST', {});
assert.equal(start.status, 200, JSON.stringify(start));
assert.equal(start.battle.status, 'running'); assert.equal(start.battle.rounds.length, 0);
assert.equal(start.battle.result, null); assert.equal(start.battle.winners, null);
assert.equal((await api(`/api/battles/${id}/leave`, 'POST', {}, 'rival')).status, 409);
assert.equal((await api('/api/me/reset', 'POST', {}, 'rival')).status, 409);
assert.throws(() => db.prepare('DELETE FROM profiles WHERE user_id=?').run('rival'), /active battles/);
now = start.battle.startsAt + start.battle.roundMs;
const mid = await api(`/api/battles/${id}`, 'GET', undefined, null);
assert.equal(mid.battle.revealedRounds, 1); assert.equal(mid.battle.rounds.length, 1);
assert.equal(mid.battle.result, null, 'no future winner leaked');
assert.equal((await api(`/api/battles/${id}/start`, 'POST', {})).battle.startsAt, start.battle.startsAt, 'start retry keeps outcome/time');
now = start.battle.endsAt;
const [finished, finishedAgain] = await Promise.all([api(`/api/battles/${id}`, 'GET', undefined, null), api(`/api/battles/${id}`, 'GET', undefined, null)]);
assert.equal(finished.battle.status, 'finished'); assert.equal(finishedAgain.battle.status, 'finished');
const cardsGenerated = finished.battle.rounds.reduce((n, r) => n + r.pulls.reduce((v, p) => v + p.cards.length, 0), 0);
assert.equal(owned('host') + owned('rival'), cardsGenerated, 'all commons and every other card awarded exactly once');
assert.equal(db.prepare('SELECT COUNT(*) n FROM battle_settlements WHERE battle_id=?').get(id).n, 1);
assert.equal(db.prepare("SELECT COUNT(*) n FROM pack_log WHERE user_id IN ('host','rival')").get().n, 4);
assert.equal(db.prepare("SELECT SUM(pulls) n FROM profiles WHERE user_id IN ('host','rival')").get().n, cardsGenerated);
const oldCount = owned('host') + owned('rival'); await api(`/api/battles/${id}`); assert.equal(owned('host') + owned('rival'), oldCount);

// Bots cost host real coins; cancelling refunds every payment once.
const botBefore = coins('host'); const lobby = await create({ players: 3, private: true }); const bid = lobby.battle.id;
const botEntry = Math.round(lobby.battle.entryCost * 100);
assert.equal((await api(`/api/battles/${bid}/bot`, 'POST', { seat: 1 }, 'rival')).status, 403);
assert.equal((await api(`/api/battles/${bid}/bot`, 'POST', {})).status, 400, 'bot retries require explicit seat');
await Promise.all([api(`/api/battles/${bid}/bot`, 'POST', { seat: 1 }), api(`/api/battles/${bid}/bot`, 'POST', { seat: 1 })]);
assert.equal(coins('host'), botBefore - 2 * botEntry);
await api(`/api/battles/${bid}/join`, 'POST', { seat: 2 }, 'rival');
const listing = await api('/api/battles', 'GET', undefined, null);
assert.ok(!listing.battles.some(b => b.id === bid), 'unlisted omitted from lobby feed');
assert.equal((await api(`/api/battles/${bid}`, 'GET', undefined, null)).status, 200, 'share link allows spectating');
await Promise.all([api(`/api/battles/${bid}/cancel`, 'POST', {}), api(`/api/battles/${bid}/cancel`, 'POST', {})]);
assert.equal(coins('host'), botBefore, 'host and bot refunded once');
assert.equal(coins('rival'), 10000000 - entry, 'rival refunded once');

// Nonhost leave retries refund once; expiry uses identical cancellation path.
const leaving = await create(); await api(`/api/battles/${leaving.battle.id}/join`, 'POST', {}, 'third');
await Promise.all([api(`/api/battles/${leaving.battle.id}/leave`, 'POST', {}, 'third'), api(`/api/battles/${leaving.battle.id}/leave`, 'POST', {}, 'third')]);
assert.equal(coins('third'), 10000000);
db.prepare('UPDATE battles SET expires_at=? WHERE id=?').run(realNow() - 1, leaving.battle.id);
assert.throws(() => db.prepare('INSERT INTO battle_seats(battle_id,seat,user_id,payer_id,name,handle,color,bot) VALUES(?,?,?,?,?,?,?,?)')
  .run(leaving.battle.id, 1, 'third', 'third', 'third', 'third', 'gold', 0), /no longer accepting/);
await api('/api/battles'); assert.equal((await api(`/api/battles/${leaving.battle.id}`)).battle.status, 'cancelled');

// Shared payouts include bot allocation (not reassigned to the host).
const sharedBefore = owned('host'); const shared = await create({ mode: 'shared', fast: true }, [{ key: 'me5:boosterPack', quantity: 1 }]);
await api(`/api/battles/${shared.battle.id}/bot`, 'POST', { seat: 1 });
const sharedStart = await api(`/api/battles/${shared.battle.id}/start`, 'POST', {}); now = sharedStart.battle.endsAt;
const sharedEnd = (await api(`/api/battles/${shared.battle.id}`)).battle;
assert.deepEqual(sharedEnd.winners, []);
assert.equal(owned('host') - sharedBefore, sharedEnd.result.allocations.find(a => a.seat === 0).cardCount);
assert.ok(sharedEnd.result.allocations.find(a => a.seat === 1).cardCount > 0);

// Every product type actually draws via current catalog/engine.
for (const product of [catalog.products.find(p => p.packs === 0), catalog.products.find(p => p.setId === 'svp' && p.packs > 0),
  catalog.products.find(p => p.rounds > p.packs && p.packs > 0), catalog.products.find(p => p.key === 'sv8pt5:super-premium-collection')].filter(Boolean)) {
  const productBattle = await create({ mode: 'shared', fast: true }, [{ key: product.key, quantity: 1 }]);
  assert.equal(productBattle.status, 200, product.key + JSON.stringify(productBattle));
  await api(`/api/battles/${productBattle.battle.id}/bot`, 'POST', { seat: 1 });
  const running = await api(`/api/battles/${productBattle.battle.id}/start`, 'POST', {});
  assert.equal(running.status, 200, product.key + JSON.stringify(running)); now = running.battle.endsAt;
  const done = (await api(`/api/battles/${productBattle.battle.id}`)).battle;
  assert.equal(done.rounds.length, product.rounds); assert.ok(done.rounds.every(r => r.pulls.every(p => p.cards.length > 0)));
}

// Rules use cents and include hidden commons, last round, best card and teams.
const seats = [0, 1, 2, 3].map(seat => ({ seat, userId: `u${seat}` }));
const rounds = [[10, 20, 30, 40], [80, 30, 20, 10]].map((values, index) => ({ index,
  pulls: values.map((value, seat) => ({ seat, cards: [{ id: `card-${index}-${seat}`, value, rarity: 'Common' }] })) }));
assert.deepEqual(battleResult(rounds, battleSettings({ players: 4 }), seats).winners, [0]);
assert.deepEqual(battleResult(rounds, battleSettings({ players: 4, mode: 'crazy' }), seats).winners, [1, 2, 3]);
assert.deepEqual(battleResult(rounds, battleSettings({ players: 4, teams: true }), seats).winners, [0, 1]);
assert.deepEqual(battleResult(rounds, battleSettings({ players: 4, scoring: 'last', mode: 'crazy' }), seats).winners, [3]);
assert.deepEqual(battleResult(rounds, battleSettings({ players: 4, scoring: 'best' }), seats).winners, [0]);
const allShared = battleResult(rounds, battleSettings({ players: 4, mode: 'shared', skipCommons: true }), seats);
assert.equal(allShared.allocations.reduce((n, a) => n + a.cardCount, 0), 8);
assert.equal(allShared.allocations.reduce((n, a) => n + a.value, 0), 240);

// Concurrent sells cannot pay the same last copy twice.
db.prepare('INSERT INTO cards(user_id,card_id,qty,reverse_qty) VALUES(?,?,?,?) ON CONFLICT(user_id,card_id) DO UPDATE SET qty=1,reverse_qty=0')
  .run('third', 'me5-1', 1, 0);
const soldBefore = coins('third');
const sales = await Promise.all([api('/api/cards/sell', 'POST', { cardId: 'me5-1' }, 'third'), api('/api/cards/sell', 'POST', { cardId: 'me5-1' }, 'third')]);
assert.equal(sales.filter(s => s.status === 200).length, 1, JSON.stringify(sales));
assert.equal(coins('third') - soldBefore, Math.round(sales.find(s => s.status === 200).value * 100));

// D1's whole-row limit must allow the maximum advertised ordinary lineup.
const maxBattle = await create({ players: 4, fast: true, mode: 'shared' }, [{ key: 'me5:boosterBox', quantity: 2 }]);
assert.equal(maxBattle.status, 200);
for (const seat of [1, 2, 3]) await api(`/api/battles/${maxBattle.battle.id}/bot`, 'POST', { seat });
const maxRunning = await api(`/api/battles/${maxBattle.battle.id}/start`, 'POST', {});
assert.equal(maxRunning.status, 200, JSON.stringify(maxRunning));
const maxRow = db.prepare('SELECT outcomes,result,plan,lineup,settings FROM battles WHERE id=?').get(maxBattle.battle.id);
const rowBytes = Buffer.byteLength(Object.values(maxRow).join(''));
assert.ok(rowBytes < 1750000, `Maximum lineup persists ${rowBytes} bytes`);
assert.equal(JSON.parse(maxRow.outcomes).length, 72);
assert.ok(JSON.parse(maxRow.result).allocations.every(a => a.cards.every(c => Object.keys(c).length === 2)), 'award IDs do not duplicate full scans');
now = maxRunning.battle.endsAt;
assert.equal((await api(`/api/battles/${maxBattle.battle.id}`)).battle.status, 'finished');
const leanList = await api('/api/battles');
assert.ok(leanList.battles.every(b => b.rounds.length === 0 && b.result === null), 'list never fetches/discloses pull payloads');

// Concurrent ordinary rips and battle settlement preserve both sets of awards.
const raceBattle = await create({ mode: 'shared', fast: true }, [{ key: 'me5:boosterPack', quantity: 2 }], 'third');
await api(`/api/battles/${raceBattle.battle.id}/join`, 'POST', {}, 'rival');
const raceStarted = await api(`/api/battles/${raceBattle.battle.id}/start`, 'POST', {}, 'third');
const raceBefore = owned('third'); now = raceStarted.battle.endsAt;
const [raceFinished, ripOne, ripTwo] = await Promise.all([
  api(`/api/battles/${raceBattle.battle.id}`),
  api('/api/packs/rip', 'POST', { setId: 'me5' }, 'third'),
  api('/api/packs/rip', 'POST', { setId: 'me5' }, 'third'),
]);
assert.equal(ripOne.status, 200); assert.equal(ripTwo.status, 200);
const raceAward = raceFinished.battle.result.allocations.find(a => a.seat === 0).cardCount;
assert.equal(owned('third'), raceBefore + raceAward + ripOne.cards.length + ripTwo.cards.length, 'stale upsert cannot overwrite battle award or another rip');

// Duplicate liquidation compares each card snapshot and pays once, even with many priced rows.
const duplicateBefore = coins('third');
const duplicates = await Promise.all([api('/api/cards/sell-duplicates', 'POST', { setId: 'me5' }, 'third'),
  api('/api/cards/sell-duplicates', 'POST', { setId: 'me5' }, 'third')]);
assert.equal(duplicates.filter(r => r.status === 200).length, 1);
assert.equal(coins('third') - duplicateBefore, Math.round(duplicates.find(r => r.status === 200).value * 100));
assert.equal(db.prepare("SELECT COUNT(*) n FROM cards WHERE user_id='third' AND card_id LIKE 'me5-%' AND qty>1").get().n, 0);

// Leave/start race commits either a start on exactly the filled snapshot or a refunded lobby.
const startLeave = await create(); await api(`/api/battles/${startLeave.battle.id}/join`, 'POST', {}, 'third');
const competing = await Promise.all([api(`/api/battles/${startLeave.battle.id}/start`, 'POST', {}),
  api(`/api/battles/${startLeave.battle.id}/leave`, 'POST', {}, 'third')]);
assert.ok(competing.every(r => [200, 409].includes(r.status)), JSON.stringify(competing));
const afterCompete = (await api(`/api/battles/${startLeave.battle.id}`)).battle;
if (afterCompete.status === 'running') assert.equal(afterCompete.seats.length, 2);
else { assert.equal(afterCompete.status, 'lobby'); assert.equal(afterCompete.seats.length, 1); await api(`/api/battles/${startLeave.battle.id}/cancel`, 'POST', {}); }

// A full feed plus a maintenance backlog stays below Workers Free's 50-query
// budget. Fixtures still pass through the real escrow/start/settlement triggers.
const fixtureSettings = JSON.stringify(battleSettings({ mode: 'shared', fast: true }));
const fixturePlan = JSON.stringify([{ index: 0, kind: 'pack', setId: 'me5', setName: 'Perfect Order',
  productKey: 'me5:boosterPack', productName: 'Booster pack', wrapperId: 'fixture', image: '' }]);
const fixtureOutcomes = JSON.stringify([{ index: 0, pulls: [
  { seat: 0, value: .1, cards: [{ id: 'me5-1', name: 'Tropius', rarity: 'Common', reverse: false, value: .1 }] },
  { seat: 1, value: .1, cards: [{ id: 'me5-2', name: 'Grubbin', rarity: 'Common', reverse: false, value: .1 }] },
] }]);
const fixtureResult = JSON.stringify({ winners: [], scores: [.1, .1], allocations: [
  { seat: 0, userId: 'host', cardCount: 1, value: .1, cards: [{ id: 'me5-1', reverse: false }] },
  { seat: 1, userId: null, cardCount: 1, value: .1, cards: [{ id: 'me5-2', reverse: false }] },
] });
for (let i = 0; i < 115; i++) {
  const fid = `query-fixture-${i}`;
  db.prepare(`INSERT INTO battles(id,host_id,request_id,settings,lineup,plan,entry_cost,created_at,expires_at)
    VALUES(?,?,?,?,?,?,?,?,?)`).run(fid, 'host', fid, fixtureSettings, '[]', fixturePlan, .01, now + i, now + 86400000);
  db.prepare('INSERT INTO battle_seats(battle_id,seat,user_id,payer_id,name,handle,color,bot) VALUES(?,?,?,?,?,?,?,?)')
    .run(fid, 0, 'host', 'host', 'host', 'host', 'gold', 0);
  db.prepare('INSERT INTO battle_seats(battle_id,seat,user_id,payer_id,name,handle,color,bot) VALUES(?,?,?,?,?,?,?,?)')
    .run(fid, 1, null, 'host', 'Bot 2', 'practice-bot', 'silver', 1);
  if (i < 40) db.prepare(`UPDATE battles SET status='running',starts_at=?,ends_at=?,round_ms=1600,outcomes=?,result=? WHERE id=?`)
    .run(now - 2000, now - 1, fixtureOutcomes, fixtureResult, fid);
  else db.prepare('UPDATE battles SET expires_at=? WHERE id=?').run(realNow() - 1, fid);
}
const beforeBacklogCoins = coins('host'); const beforeBacklogCards = owned('host'); queryCount = 0;
const backlogFeed = await api('/api/battles', 'GET', undefined, null);
const feedQueries = queryCount;
assert.equal(backlogFeed.status, 200); assert.equal(backlogFeed.battles.length, 40);
assert.ok(backlogFeed.battles.every(b => b.seats.length === 2 && b.rounds.length === 0));
assert.equal(feedQueries, 5, `Full feed and backlog used ${feedQueries} D1 statements`);
assert.equal(db.prepare("SELECT COUNT(*) n FROM battles WHERE id LIKE 'query-fixture-%' AND status='cancelled'").get().n, 75);
assert.equal(db.prepare("SELECT COUNT(*) n FROM battles WHERE id LIKE 'query-fixture-%' AND status='finished'").get().n, 10);
assert.equal(coins('host') - beforeBacklogCoins, 150, 'set-based expiry refunds both paid seats once');
assert.equal(owned('host') - beforeBacklogCards, 10, 'bounded set-based settlement awards exactly once');
// Later ticks finish the remaining backlog without expanding the query count.
for (let tick = 0; tick < 3; tick++) { queryCount = 0; await api('/api/battles'); assert.equal(queryCount, 5); }
assert.equal(db.prepare("SELECT COUNT(*) n FROM battles WHERE id LIKE 'query-fixture-%' AND status='finished'").get().n, 40);
assert.equal(owned('host') - beforeBacklogCards, 40); assert.equal(coins('host') - beforeBacklogCoins, 150);

Date.now = realNow;
console.log(`Pack battles: ${catalog.products.length} real products; escrow, retries, races, timed secrecy, awards, bots, promos, mixed sets, rules, concurrent sells/rips, ${rowBytes}-byte maximum lineup and ${feedQueries}-query full feed/backlog passed.`);
