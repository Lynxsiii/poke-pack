import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import worker from '../worker/index.js';
import { battleResult, battleSettings, BOT_PERSONAS, botPersona } from '../js/battle-rules.js';
import { resetBattleSchemaCache, resetSettleFailures } from '../worker/battles.js';

const migrationFiles = readdirSync(new URL('../worker/migrations/', import.meta.url)).sort();
const migrationSql = file => readFileSync(new URL('../worker/migrations/' + file, import.meta.url), 'utf8');
let queryCount = 0; let batchCount = 0;
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
        async all() { queryCount++; return { results: db.prepare(sql).all(...params) }; },
        async first(column) { queryCount++; const row = db.prepare(sql).get(...params); return column ? row?.[column] : row || null; },
        execute() { queryCount++; const r = db.prepare(sql).run(...params); return { success: true, meta: { changes: Number(r.changes) } }; },
        async run() { return s.execute(); },
      }; return s;
    },
    async batch(statements) {
      batchCount++;
      db.exec('BEGIN');
      try { const results = statements.map(s => s.execute()); db.exec('COMMIT'); return results; }
      catch (err) { db.exec('ROLLBACK'); throw err; }
    },
  };
  return { db, DB };
}
const { db, DB } = makeDb(migrationFiles);
const realNow = Date.now; let now = realNow(); Date.now = () => now;
function addUser(db, id, balance) {
  db.prepare('INSERT INTO users(id,name,handle,password_hash,color,created_at,last_played) VALUES(?,?,?,?,?,?,?)')
    .run(id, id, id, 'unused', 'gold', now, now);
  db.prepare('INSERT INTO profiles(user_id,coins,granted,created_at,binder) VALUES(?,?,?,?,?)').run(id, balance, balance, now, '[]');
  db.prepare('INSERT INTO sessions(id,user_id,created_at,expires_at) VALUES(?,?,?,?)').run(id, id, now, now + 864000000);
}
for (const [id, balance] of [['host', 100000], ['rival', 100000], ['third', 100000], ['fourth', 100000], ['poor', 0]]) addUser(db, id, balance);
const ASSETS = { fetch: async request => {
  const path = new URL(request.url).pathname;
  try { return new Response(readFileSync(new URL('..' + path, import.meta.url)), { headers: { 'content-type': 'application/json' } }); }
  catch { return new Response('', { status: 404 }); }
} };
const env = { DB, ASSETS };
async function apiOn(target, path, method = 'GET', body, user = 'host', extraHeaders = {}) {
  const response = await worker.fetch(new Request('https://poke-pack.rip' + path, { method,
    headers: { 'content-type': 'application/json', origin: 'https://poke-pack.rip', ...(user ? { cookie: `pp_sid=${user}` } : {}), ...extraHeaders },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), target);
  return { status: response.status, ...await response.json() };
}
const api = (...args) => apiOn(env, ...args);
const fetchRaw = path => worker.fetch(new Request('https://poke-pack.rip' + path), env);
const coinsIn = (db, user) => Math.round(db.prepare('SELECT coins FROM profiles WHERE user_id = ?').get(user).coins * 100);
const coins = user => coinsIn(db, user);
const owned = user => db.prepare('SELECT COALESCE(SUM(qty),0) n FROM cards WHERE user_id = ?').get(user).n;
const create = (settings = {}, lineup = [{ key: 'me5:boosterPack', quantity: 2 }], user = 'host', requestId = crypto.randomUUID(), extra = {}) =>
  api('/api/battles', 'POST', { requestId, settings, lineup, ...extra }, user);
const quick = (settings = {}, lineup = [{ key: 'me5:boosterPack', quantity: 2 }], user = 'host', requestId = crypto.randomUUID()) =>
  create(settings, lineup, user, requestId, { quick: true });
const cents = value => Math.round(value * 100);
const act = (battleId, action, body = {}, user = 'host') => api(`/api/battles/${battleId}/${action}`, 'POST', body, user);
const assertPersonas = battle => {
  const bots = battle.seats.filter(s => s.bot);
  assert.equal(new Set(bots.map(s => s.handle)).size, bots.length, 'bot personas are distinct within a battle');
  for (const seat of bots) {
    const persona = botPersona(seat);
    assert.ok(persona, `bot handle ${seat.handle} names a persona`);
    assert.equal(seat.handle, `bot:${persona.id}`); assert.equal(seat.name, persona.name); assert.equal(seat.color, persona.color);
    assert.equal(seat.userId, null); assert.equal(seat.avatar, null); assert.equal(seat.avatarStyle, null);
  }
  for (const seat of battle.seats.filter(s => !s.bot)) {
    assert.match(seat.avatar, /^\d+$/, 'human seats carry an avatar'); assert.ok(['art', 'pixel'].includes(seat.avatarStyle));
  }
  assert.equal(battle.soloHuman, battle.seats.filter(s => !s.bot).length === 1);
};

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
now = start.battle.startsAt - 1;
assert.equal((await api(`/api/battles/${id}`, 'GET', undefined, null)).battle.rounds.length, 0, 'nothing before the intro ends');
// Round i is revealed at startsAt + i * roundMs and plays until the next one.
now = start.battle.startsAt + start.battle.roundMs - 1;
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

// Bots are free in every path: explicit seat, fill, unbot, cancel. Only the
// host's own entry ever moves, and cancelling refunds exactly that once.
const botBefore = coins('host'); const lobby = await create({ players: 4, private: true }); const bid = lobby.battle.id;
const botEntry = cents(lobby.battle.entryCost);
assert.equal(coins('host'), botBefore - botEntry);
assertPersonas(lobby.battle); assert.equal(lobby.battle.soloHuman, true);
assert.equal((await act(bid, 'bot', { seat: 1 }, 'rival')).status, 403);
assert.equal((await act(bid, 'bot', {})).status, 400, 'bot retries require explicit seat');
assert.equal((await act(bid, 'bot', { seat: 9 })).status, 400);
const botPair = await Promise.all([act(bid, 'bot', { seat: 1 }), act(bid, 'bot', { seat: 1 })]);
assert.ok(botPair.every(r => r.status === 200), JSON.stringify(botPair.map(r => r.error)));
assert.equal(coins('host'), botBefore - botEntry, 'calling a bot is free');
assert.equal((await act(bid, 'unbot', { seat: 1 }, 'rival')).status, 403);
await Promise.all([act(bid, 'unbot', { seat: 1 }), act(bid, 'unbot', { seat: 1 })]);
let botView = (await api(`/api/battles/${bid}`)).battle;
assert.ok(!botView.seats.some(s => s.seat === 1), 'unbot empties the seat');
assert.equal(coins('host'), botBefore - botEntry, 'removing a free bot refunds nothing');
assert.equal((await act(bid, 'unbot', { seat: 0 })).status, 409, 'unbot never removes a player');
const filled = await act(bid, 'bot', { fill: true });
assert.equal(filled.status, 200); assert.equal(filled.battle.seats.length, 4); assertPersonas(filled.battle);
assert.equal(coins('host'), botBefore - botEntry, 'filling with bots is free');
assert.equal((await act(bid, 'bot', { fill: true })).battle.seats.length, 4, 'fill on a full table is a no-op');
assert.equal(db.prepare("SELECT COUNT(*) n FROM battle_seats WHERE battle_id=? AND bot=1 AND payer_id='free'").get(bid).n, 3);
await act(bid, 'unbot', { seat: 3 });
assert.equal((await act(bid, 'join', { seat: 3 }, 'rival')).status, 200);
botView = (await api(`/api/battles/${bid}`, 'GET', undefined, null)).battle;
assertPersonas(botView); assert.equal(botView.soloHuman, false);
assert.equal(botView.seats.find(s => s.seat === 0).avatar, '25', 'default avatar for a fresh account');
const listing = await api('/api/battles', 'GET', undefined, null);
assert.ok(!listing.battles.some(b => b.id === bid), 'unlisted omitted from lobby feed');
assert.equal((await api(`/api/battles/${bid}`, 'GET', undefined, null)).status, 200, 'share link allows spectating');
assert.throws(() => db.prepare('DELETE FROM profiles WHERE user_id=?').run('host'), /active battles/, 'account delete still blocked by a lobby');
await Promise.all([act(bid, 'cancel'), act(bid, 'cancel')]);
assert.equal(coins('host'), botBefore, 'host refunded its own entry once, bots refund nothing');
assert.equal(coins('rival'), 10000000 - entry, 'rival refunded once');
assert.equal(db.prepare("SELECT COUNT(*) n FROM profiles WHERE user_id='free'").get().n, 0);
// The database itself refuses paid bots and free players.
assert.throws(() => db.prepare('INSERT INTO battle_seats(battle_id,seat,user_id,payer_id,name,handle,color,bot) VALUES(?,?,?,?,?,?,?,?)')
  .run(id, 1, null, 'host', 'Bot', 'bot:x', 'gold', 1), /no longer accepting|Bots play free/);
const guard = await create({ players: 3 });
assert.throws(() => db.prepare('INSERT INTO battle_seats(battle_id,seat,user_id,payer_id,name,handle,color,bot) VALUES(?,?,?,?,?,?,?,?)')
  .run(guard.battle.id, 1, null, 'host', 'Bot', 'bot:x', 'gold', 1), /Bots play free/);
assert.throws(() => db.prepare('INSERT INTO battle_seats(battle_id,seat,user_id,payer_id,name,handle,color,bot) VALUES(?,?,?,?,?,?,?,?)')
  .run(guard.battle.id, 1, 'rival', 'free', 'rival', 'rival', 'gold', 0), /Bots play free/);
// Host leave (the cancel path) with bots seated.
await act(guard.battle.id, 'bot', { fill: true }); await act(guard.battle.id, 'leave');
assert.equal((await api(`/api/battles/${guard.battle.id}`)).battle.status, 'cancelled');
assert.equal(coins('host'), botBefore, 'host leave refunds the host only');
// 24h expiry with bots seated.
const expiring = await create({ players: 4 }); await act(expiring.battle.id, 'bot', { fill: true });
db.prepare('UPDATE battles SET expires_at=? WHERE id=?').run(realNow() - 1, expiring.battle.id);
await api('/api/battles'); assert.equal((await api(`/api/battles/${expiring.battle.id}`)).battle.status, 'cancelled');
assert.equal(coins('host'), botBefore, 'expiry refunds the host only');

// Concurrent bot calls on different seats never share a persona (the index
// rejects a clash and the loser draws again).
for (let i = 0; i < 12; i++) {
  const race = await create({ players: 4, private: true });
  const calls = await Promise.all([1, 2, 3].map(seat => act(race.battle.id, 'bot', { seat })));
  assert.ok(calls.every(r => r.status === 200), JSON.stringify(calls.map(r => r.error)));
  const raced = (await api(`/api/battles/${race.battle.id}`)).battle;
  assert.equal(raced.seats.length, 4); assertPersonas(raced);
  await act(race.battle.id, 'cancel');
}
assert.equal(coins('host'), botBefore);

// Timing: a 3.5 s intro, 6 s rounds (2.6 s fast).
const timed = await create({}, [{ key: 'me5:boosterPack', quantity: 1 }]); await act(timed.battle.id, 'bot', { seat: 1 });
const timedStart = (await act(timed.battle.id, 'start')).battle;
assert.equal(timedStart.startsAt, now + 3500); assert.equal(timedStart.roundMs, 6000);
assert.equal(timedStart.endsAt, timedStart.startsAt + 6000);

// Quick battle: one request creates, seats free bots and starts. Retries are idempotent.
const quickBefore = coins('host'); const quickKey = crypto.randomUUID();
const [q1, q2] = await Promise.all([quick({ players: 3, fast: true }, undefined, 'host', quickKey), quick({ players: 3, fast: true }, undefined, 'host', quickKey)]);
assert.equal(q1.status, 200, JSON.stringify(q1)); assert.equal(q2.status, 200, JSON.stringify(q2));
assert.equal(q1.battle.id, q2.battle.id);
const qb = q1.battle;
assert.equal(qb.status, 'running'); assert.equal(qb.seats.length, 3); assertPersonas(qb); assert.equal(qb.soloHuman, true);
assert.equal(qb.roundMs, 2600); assert.equal(qb.startsAt, now + 3500); assert.equal(qb.rounds.length, 0, 'no round leaks at start');
assert.equal(coins('host'), quickBefore - cents(qb.entryCost), 'quick battle charges only the host entry');
const qRetry = await quick({ players: 3, fast: true }, undefined, 'host', quickKey);
assert.equal(qRetry.battle.id, qb.id); assert.equal(qRetry.battle.startsAt, qb.startsAt, 'retry keeps outcome/time');
assert.equal(coins('host'), quickBefore - cents(qb.entryCost));
assert.equal((await quick({}, undefined, 'poor')).status, 409);
assert.equal(db.prepare("SELECT COUNT(*) n FROM battles WHERE host_id='poor'").get().n, 0, 'failed quick create rolls back');
assert.equal((await create({}, undefined, 'host', crypto.randomUUID(), { quick: 'yes' })).status, 400);
// A quick create interrupted before starting (still a lobby) is finished by its retry.
const halfKey = crypto.randomUUID(); const half = await create({ players: 2 }, undefined, 'host', halfKey);
const resumed = await quick({ players: 2 }, undefined, 'host', halfKey);
assert.equal(resumed.battle.id, half.battle.id); assert.equal(resumed.battle.status, 'running'); assertPersonas(resumed.battle);
assert.equal(coins('host'), quickBefore - cents(qb.entryCost) - cents(half.battle.entryCost), 'resuming charges nothing more');

// Skip: only the single human at a running table, and it settles at once, exactly once.
assert.equal((await act(qb.id, 'skip', {}, 'rival')).status, 403, 'a spectator cannot skip');
const skipCardsBefore = owned('host'); const skipCoinsBefore = coins('host');
const skips = await Promise.all([act(qb.id, 'skip'), act(qb.id, 'skip')]);
assert.ok(skips.every(r => r.status === 200), JSON.stringify(skips.map(r => r.error)));
const skipped = skips[0].battle;
assert.equal(skipped.status, 'finished'); assert.equal(skipped.revealedRounds, skipped.roundCount);
assert.equal(skipped.rounds.length, skipped.roundCount); assert.ok(skipped.result);
assert.ok(skipped.endsAt <= now && skipped.startsAt + skipped.roundCount * skipped.roundMs === skipped.endsAt);
assert.equal(db.prepare('SELECT COUNT(*) n FROM battle_settlements WHERE battle_id=?').get(qb.id).n, 1);
const hostAlloc = skipped.result.allocations.find(a => a.seat === 0)?.cardCount || 0;
assert.equal(owned('host') - skipCardsBefore, hostAlloc, 'skip awards exactly once');
assert.equal((await act(qb.id, 'skip')).battle.status, 'finished', 'skip retry is a no-op');
assert.equal(owned('host') - skipCardsBefore, hostAlloc);
assert.equal(coins('host'), skipCoinsBefore, 'settling never pays coins, whoever wins');
const lobbySkip = await create(); await act(lobbySkip.battle.id, 'bot', { seat: 1 });
assert.equal((await act(lobbySkip.battle.id, 'skip')).status, 409, 'cannot skip a lobby');
const duo = await create({}, [{ key: 'me5:boosterPack', quantity: 1 }]); await act(duo.battle.id, 'join', {}, 'rival');
await act(duo.battle.id, 'start');
assert.equal((await act(duo.battle.id, 'skip')).status, 403, 'two humans cannot skip');
assert.equal((await act(duo.battle.id, 'skip', {}, 'rival')).status, 403);
const duoView = (await api(`/api/battles/${duo.battle.id}`)).battle;
assert.equal(duoView.status, 'running'); assert.equal(duoView.rounds.length, 0, 'failed skip reveals nothing');
assert.equal((await act(lobbySkip.battle.id, 'unbot', { seat: 1 })).status, 200);
assert.equal((await act(qb.id, 'unbot', { seat: 1 })).status, 409, 'cannot remove a bot after the start');
await act(lobbySkip.battle.id, 'cancel');

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
// The deal's tie-break decides who gets the pot's best card. A fixed seat
// order would always favour the host (seat 0); the Worker draws it at random.
const reversed = battleResult(rounds, battleSettings({ players: 4, mode: 'shared' }), seats, seat => -seat);
const topCard = rounds.flatMap(r => r.pulls.flatMap(p => p.cards)).sort((a, b) => b.value - a.value)[0];
assert.ok(reversed.allocations.find(a => a.seat === 3).cards.includes(topCard), 'rank decides the first deal');
{
  let hostTop = 0; const runs = 24;
  for (let i = 0; i < runs; i++) {
    const b = (await quick({ players: 4, mode: 'shared', fast: true }, [{ key: 'me5:boosterPack', quantity: 1 }])).battle;
    const row = JSON.parse(db.prepare('SELECT outcomes, result FROM battles WHERE id = ?').get(b.id).result);
    const all = JSON.parse(db.prepare('SELECT outcomes FROM battles WHERE id = ?').get(b.id).outcomes).flatMap(r => r.pulls.flatMap(p => p.cards));
    const best = Math.max(...all.map(c => c.value));
    const hostCards = row.allocations.find(a => a.seat === 0).cards.map(c => all.find(x => x.id === c.id && x.reverse === c.reverse)?.value ?? 0);
    if (hostCards.includes(best)) hostTop++;
    await act(b.id, 'skip');
  }
  assert.ok(hostTop < runs, `the host does not always take a shared pot's best card (${hostTop}/${runs})`);
}

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
assert.ok(leanList.battles.every(b => b.rounds.length === 0), 'list never discloses pull payloads');
assert.ok(leanList.battles.every(b => b.status === 'finished'
  ? b.result.allocations.every(a => Object.keys(a).sort().join() === 'cardCount,seat,value') && Array.isArray(b.winners)
  : b.result === null), 'list carries only the result summary of finished battles');

// Settling the biggest battle with four real players: under 0012's award
// trigger this took seconds (json re-parsed per card, rounds joined to rounds)
// and production D1 ran out of memory on it. 0014 reads each JSON value once.
{
  const big = await create({ players: 4, fast: true }, [{ key: 'me5:boosterBox', quantity: 2 }]);
  assert.equal(big.status, 200);
  for (const user of ['rival', 'third', 'fourth']) assert.equal((await api(`/api/battles/${big.battle.id}/join`, 'POST', {}, user)).status, 200);
  const running = await api(`/api/battles/${big.battle.id}/start`, 'POST', {});
  assert.equal(running.status, 200, JSON.stringify(running).slice(0, 300));
  const logBefore = db.prepare('SELECT COUNT(*) n FROM pack_log').get().n;
  const pullsBefore = db.prepare("SELECT SUM(pulls) n FROM profiles WHERE user_id IN ('host','rival','third','fourth')").get().n;
  const ownedBefore = ['host', 'rival', 'third', 'fourth'].reduce((n, u) => n + owned(u), 0);
  now = running.battle.endsAt;
  const started = performance.now();
  const settled = await api(`/api/battles/${big.battle.id}`);
  const settleMs = performance.now() - started;
  assert.equal(settled.battle.status, 'finished');
  assert.ok(settleMs < 1000, `four-player maximum battle settled in ${Math.round(settleMs)} ms`);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM pack_log').get().n - logBefore, 72 * 4, 'one pack_log row per player per pack');
  const pulled = JSON.parse(db.prepare('SELECT outcomes FROM battles WHERE id=?').get(big.battle.id).outcomes)
    .reduce((n, r) => n + r.pulls.reduce((m, p) => m + p.cards.length, 0), 0);
  assert.equal(db.prepare("SELECT SUM(pulls) n FROM profiles WHERE user_id IN ('host','rival','third','fourth')").get().n - pullsBefore, pulled);
  const awarded = JSON.parse(db.prepare('SELECT result FROM battles WHERE id=?').get(big.battle.id).result)
    .allocations.reduce((n, a) => n + a.cards.length, 0);
  assert.equal(['host', 'rival', 'third', 'fourth'].reduce((n, u) => n + owned(u), 0) - ownedBefore, awarded, 'every allocated card awarded once');
}

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
// Seed one sure duplicate: random pulls alone sometimes leave none to sell.
db.prepare('INSERT INTO cards(user_id,card_id,qty,reverse_qty) VALUES(?,?,?,?) ON CONFLICT(user_id,card_id) DO UPDATE SET qty=cards.qty+2')
  .run('third', 'me5-1', 2, 0);
const duplicateBefore = coins('third');
const duplicates = await Promise.all([api('/api/cards/sell-duplicates', 'POST', { setId: 'me5' }, 'third'),
  api('/api/cards/sell-duplicates', 'POST', { setId: 'me5' }, 'third')]);
assert.equal(duplicates.filter(r => r.status === 200).length, 1, JSON.stringify(duplicates.map(r => [r.status, r.error])));
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
    .run(fid, 1, null, 'free', 'Sparky', 'bot:sparky', 'gold', 1);
  if (i < 40) db.prepare(`UPDATE battles SET status='running',starts_at=?,ends_at=?,round_ms=1600,outcomes=?,result=? WHERE id=?`)
    .run(now - 2000, now - 1, fixtureOutcomes, fixtureResult, fid);
  else db.prepare('UPDATE battles SET expires_at=? WHERE id=?').run(realNow() - 1, fid);
}
const beforeBacklogCoins = coins('host'); const beforeBacklogCards = owned('host'); queryCount = 0;
const backlogFeed = await api('/api/battles', 'GET', undefined, null);
const feedQueries = queryCount;
assert.equal(backlogFeed.status, 200); assert.equal(backlogFeed.battles.length, 40);
assert.ok(backlogFeed.battles.every(b => b.seats.length === 2 && b.rounds.length === 0));
// Expiry is one batch of two; each due battle settles in its own statement
// (at most three per request) so one D1 rejection cannot block the rest.
assert.equal(feedQueries, 8, `Full feed and backlog used ${feedQueries} D1 statements`);
assert.equal(db.prepare("SELECT COUNT(*) n FROM battles WHERE id LIKE 'query-fixture-%' AND status='cancelled'").get().n, 75);
assert.equal(db.prepare("SELECT COUNT(*) n FROM battles WHERE id LIKE 'query-fixture-%' AND status='finished'").get().n, 3);
assert.equal(coins('host') - beforeBacklogCoins, 75, 'set-based expiry refunds the paid seat once, free bots nothing');
assert.equal(owned('host') - beforeBacklogCards, 3, 'bounded settlement awards exactly once');
// Later requests finish the remaining backlog without expanding the query count.
for (let tick = 0; tick < 13; tick++) { queryCount = 0; await api('/api/battles'); assert.ok(queryCount <= 8, `tick used ${queryCount}`); }
assert.equal(db.prepare("SELECT COUNT(*) n FROM battles WHERE id LIKE 'query-fixture-%' AND status='finished'").get().n, 40);
assert.equal(owned('host') - beforeBacklogCards, 40); assert.equal(coins('host') - beforeBacklogCoins, 75);

// 2026-09-30: one battle whose settlement D1 rejected made every battle
// endpoint answer 500. A settlement failure now stays with its own battle:
// the feed, other battles and new battles keep working, the stuck battle still
// shows its rounds, and the failure is reported in a header until it clears.
{
  resetSettleFailures();
  const stuck = await quick({ fast: true }); assert.equal(stuck.status, 200);
  const fine = await quick({ fast: true }); assert.equal(fine.status, 200);
  db.exec(`CREATE TRIGGER test_settle_fails BEFORE INSERT ON battle_settlements
    WHEN NEW.battle_id = '${stuck.battle.id}' BEGIN SELECT RAISE(ABORT, 'simulated D1 rejection'); END`);
  now = Math.max(stuck.battle.endsAt, fine.battle.endsAt) + 1;
  const feed = await fetchRaw('/api/battles');
  assert.equal(feed.status, 200, 'the feed survives a settlement failure');
  assert.match(feed.headers.get('x-battle-maintenance') || '', /simulated D1 rejection/);
  const fineView = await api(`/api/battles/${fine.battle.id}`, 'GET', undefined, null);
  assert.equal(fineView.battle.status, 'finished', 'other battles still settle');
  const stuckView = await api(`/api/battles/${stuck.battle.id}`, 'GET', undefined, null);
  assert.equal(stuckView.status, 200); assert.equal(stuckView.battle.status, 'running');
  assert.equal(stuckView.battle.revealedRounds, stuckView.battle.roundCount, 'a stuck battle still shows every round');
  assert.equal((await api('/api/battles/no-such-battle', 'GET', undefined, null)).status, 404);
  const next = await quick({ fast: true }); assert.equal(next.status, 200, 'new battles still start');
  db.exec('DROP TRIGGER test_settle_fails');
  now += 61000;
  const cleared = await fetchRaw(`/api/battles/${stuck.battle.id}`);
  assert.equal(cleared.status, 200); assert.equal((await cleared.json()).battle.status, 'finished', 'the stuck battle settles once D1 accepts it');
  assert.equal(cleared.headers.get('x-battle-maintenance'), null);
}

// Production upgrade: a database at 0012 (nobody can run remote migrations)
// with lobbies whose bots the host paid for under the old rules. The Worker
// rewrites its own triggers once, atomically; paid bots still refund their
// payer once, new bots are free, and the result matches 0013 exactly.
const freeObjects = db => db.prepare(`SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name IN
  ('battle_seat_refund','battle_seat_validate','battle_seat_debit','battle_bot_persona') ORDER BY name`).all();
const legacy = makeDb(migrationFiles.filter(file => file < '0013'));
assert.ok(freeObjects(legacy.db).every(o => !o.sql.includes("'free'")));
legacy.db.exec("ALTER TABLE users ADD COLUMN avatar_style TEXT NOT NULL DEFAULT 'art'"); // added in production by social.js
for (const [uid, balance] of [['host', 100000], ['rival', 100000]]) addUser(legacy.db, uid, balance);
const legacyEnv = { DB: legacy.DB, ASSETS };
const legacyApi = (...args) => apiOn(legacyEnv, ...args);
const legacyCoins = user => coinsIn(legacy.db, user);
const legacyPlan = JSON.stringify([{ index: 0, kind: 'pack', setId: 'me5', setName: 'Perfect Order',
  productKey: 'me5:boosterPack', productName: 'Booster pack', wrapperId: 'fixture', image: '' }]);
const legacyLobby = (lid, players, bots) => {
  legacy.db.prepare(`INSERT INTO battles(id,host_id,request_id,settings,lineup,plan,entry_cost,created_at,expires_at)
    VALUES(?,?,?,?,?,?,?,?,?)`).run(lid, 'host', lid, JSON.stringify(battleSettings({ players })), '[]', legacyPlan, 5, now, realNow() + 86400000);
  const insert = legacy.db.prepare('INSERT INTO battle_seats(battle_id,seat,user_id,payer_id,name,handle,color,bot) VALUES(?,?,?,?,?,?,?,?)');
  insert.run(lid, 0, 'host', 'host', 'host', 'host', 'gold', 0);
  for (const seat of bots) insert.run(lid, seat, null, 'host', `Bot ${seat + 1}`, 'practice-bot', 'silver', 1);
};
const legacyStart = legacyCoins('host');
legacyLobby('legacy-cancel', 4, [1, 2]); legacyLobby('legacy-unbot', 3, [1, 2]); legacyLobby('legacy-expire', 2, [1]);
assert.equal(legacyCoins('host'), legacyStart - 8 * 500, 'the 0012 triggers charged the host for each bot');
resetBattleSchemaCache(); batchCount = 0; queryCount = 0;
const upgraded = await Promise.all([legacyApi('/api/battles/legacy-cancel'), legacyApi('/api/battles/legacy-cancel')]);
assert.ok(upgraded.every(r => r.status === 200));
assert.deepEqual(freeObjects(legacy.db), freeObjects(db), 'runtime step and 0013 file produce the same schema');
const awardTrigger = target => target.prepare("SELECT sql FROM sqlite_master WHERE name = 'battle_settle_award'").get().sql;
assert.equal(awardTrigger(legacy.db), awardTrigger(db), 'runtime step and 0014 file produce the same award trigger');
const legacyView = upgraded[0].battle;
assertPersonas(legacyView); assert.equal(legacyView.soloHuman, true);
assert.equal(legacy.db.prepare("SELECT COUNT(*) n FROM battle_seats WHERE handle='practice-bot'").get().n, 5, 'legacy rows are not rewritten');
// Mixed table: two paid legacy bots plus one new free bot, then cancel.
const mixed = await legacyApi('/api/battles/legacy-cancel/bot', 'POST', { fill: true });
assert.equal(mixed.status, 200); assertPersonas(mixed.battle);
assert.deepEqual(mixed.battle.seats.filter(s => s.seat < 3).map(s => s.handle), legacyView.seats.map(s => s.handle), 'legacy bots keep their shown persona');
assert.equal(legacyCoins('host'), legacyStart - 8 * 500, 'new bot on an upgraded database is free');
await Promise.all([legacyApi('/api/battles/legacy-cancel/cancel', 'POST', {}), legacyApi('/api/battles/legacy-cancel/cancel', 'POST', {})]);
assert.equal(legacyCoins('host'), legacyStart - 5 * 500, 'cancel refunds the host seat and both paid bots once');
// Unbot a paid legacy bot: refunds its payer once.
await Promise.all([legacyApi('/api/battles/legacy-unbot/unbot', 'POST', { seat: 1 }), legacyApi('/api/battles/legacy-unbot/unbot', 'POST', { seat: 1 })]);
assert.equal(legacyCoins('host'), legacyStart - 4 * 500, 'unbot refunds a paid legacy bot once');
await legacyApi('/api/battles/legacy-unbot/bot', 'POST', { seat: 1 });
await legacyApi('/api/battles/legacy-unbot/unbot', 'POST', { seat: 1 });
assert.equal(legacyCoins('host'), legacyStart - 4 * 500, 'a free bot in the same seat refunds nothing');
// Replaying 0013 (someone runs migrations apply later) changes nothing.
legacy.db.exec(migrationSql('0013_free_bots.sql'));
assert.deepEqual(freeObjects(legacy.db), freeObjects(db));
// Expiry of a paid legacy bot refunds it through the set-based maintenance path.
legacy.db.prepare('UPDATE battles SET expires_at=? WHERE id=?').run(realNow() - 1, 'legacy-expire');
await legacyApi('/api/battles');
assert.equal(legacyCoins('host'), legacyStart - 2 * 500, 'expiry refunds host seat and paid legacy bot once');
await legacyApi('/api/battles/legacy-unbot/cancel', 'POST', {});
assert.equal(legacyCoins('host'), legacyStart, 'every legacy payment came back exactly once');
// A database that already ran 0013 is detected with one read and left alone.
resetBattleSchemaCache(); batchCount = 0; queryCount = 0;
const beforeCheck = JSON.stringify(freeObjects(db));
await api('/api/battles', 'GET', undefined, null);
assert.equal(batchCount, 1, 'only maintenance batches; no schema rewrite'); assert.equal(JSON.stringify(freeObjects(db)), beforeCheck);
assert.equal(queryCount, 6, 'one sqlite_master read on top of the usual five statements');
queryCount = 0; await api('/api/battles', 'GET', undefined, null); assert.equal(queryCount, 5, 'cached after the first request');

Date.now = realNow;
console.log(`Pack battles: ${catalog.products.length} real products; escrow, retries, races, timed secrecy, awards, free bots (fill, unbot, quick, skip, personas, legacy paid-bot refunds, runtime 0013/0014 upgrade, fast four-player settlement), promos, mixed sets, rules, concurrent sells/rips, ${rowBytes}-byte maximum lineup and ${feedQueries}-query full feed/backlog passed.`);
