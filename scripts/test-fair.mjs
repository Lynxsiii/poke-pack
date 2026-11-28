/* Provably fair seeds (js/fair.js, worker/fair.js): the hashes against Node's crypto, the draws' odds, and the Worker's
   seed pairs end to end: nonces, logged rolls, rotating, the reveal, replaying a bet from its seeds, game seeds hidden
   until a game is over. Runs the real Worker against in-memory SQLite (Node 22+): node scripts/test-fair.mjs */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import worker from '../worker/index.js';
import { seedLevel } from './lib/level-seed.mjs';
import {
  sha256, hmacSha256, toHex, hashSeed, fairStream, cleanClientSeed, gameClientSeed,
  flipWinner, jackpotTicket, jackpotSeat, upgradeRoll, grassBoard, tinPicks,
} from '../js/fair.js';
import { GAME_ODDS, grassTable } from '../js/fair-odds.js';

let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); checks++; };

// ---- The hashes ---------------------------------------------------------------------------
for (let len = 0; len < 300; len += 1) {
  const msg = randomBytes(len).toString('latin1');
  const key = randomBytes(len % 130).toString('hex');
  eq(toHex(sha256(msg)), createHash('sha256').update(msg, 'utf8').digest('hex'), `sha256 length ${len}`);
  eq(toHex(hmacSha256(key, msg)), createHmac('sha256', key).update(msg, 'utf8').digest('hex'), `hmac length ${len}`);
}
eq(hashSeed('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');

// The stream is HMAC(server seed, `${client}:${nonce}:${round}`) read 4 bytes at a time.
{
  const s = fairStream('server', 'client', 7);
  const want = createHmac('sha256', 'server').update('client:7:0').digest();
  for (let i = 0; i < 8; i++) eq(s.raw(), want.readUInt32BE(i * 4), `draw ${i}`);
  eq(s.raw(), createHmac('sha256', 'server').update('client:7:1').digest().readUInt32BE(0), 'round 1 follows');
}

// ---- The draws' odds ------------------------------------------------------------------------
{
  const N = 200000;
  const s = fairStream('odds', 'test', 0);
  let heads = 0, under = 0, half = 0;
  const tin = [0.5, 0.3, 0.15, 0.05]; const tinHits = [0, 0, 0, 0];
  for (let i = 0; i < N; i++) {
    if (flipWinner(s) === 'host') heads++;
    if (upgradeRoll(s) < 250000) under++;
    if (s.unit() < 0.5) half++;
    tinHits[tinPicks(s, tin, 1)[0]]++;
  }
  const near = (got, want, tol, msg) => ok(Math.abs(got - want) < tol, `${msg}: ${got} vs ${want}`);
  near(heads / N, 0.5, 0.005, 'a flip is even');
  near(under / N, 0.25, 0.005, 'an upgrade roll is uniform');
  near(half / N, 0.5, 0.005, 'a unit draw is uniform');
  tin.forEach((p, i) => near(tinHits[i] / N, p, 0.005, `tin card ${i}`));
  const b = grassBoard(fairStream('g', 'h', 1), 25, 5);
  eq(b.length, 5); ok(b.every((t, i) => t >= 0 && t < 25 && (i === 0 || t > b[i - 1])), 'a board is 5 sorted distinct tiles');
  // Jackpot: the ticket walks seats in seat order, one ticket per cent.
  eq(jackpotSeat([{ seat: 2, value: 5 }, { seat: 0, value: 10 }], 9), 0);
  eq(jackpotSeat([{ seat: 2, value: 5 }, { seat: 0, value: 10 }], 10), 2);
  const big = fairStream('big', 'pot', 0);
  for (let i = 0; i < 50; i++) { const t = jackpotTicket(big, 2 ** 40 + 3); ok(t >= 0 && t < 2 ** 40 + 3 && Number.isInteger(t), 'a big pot ticket'); }
  eq(gameClientSeed('id', ['a', 'b']), 'id|a|b');
}
eq(cleanClientSeed(' lucky-7 '), 'lucky-7');
eq(cleanClientSeed('has space'), null);
eq(cleanClientSeed('x'.repeat(65)), null);
eq(cleanClientSeed(''), null);
ok(GAME_ODDS.length === 7 && GAME_ODDS.every((g) => g.name && g.how && g.payback), 'every game has odds text');
ok(grassTable(3).every((r) => r.mult * r.chance <= 0.95 + 1e-9), 'Tall Grass never pays over 95%');

// ---- The Worker -----------------------------------------------------------------------------
const db = new DatabaseSync(':memory:');
for (const file of readdirSync(new URL('../worker/migrations/', import.meta.url)).sort()) db.exec(readFileSync(new URL('../worker/migrations/' + file, import.meta.url), 'utf8'));
let lock = Promise.resolve();
const DB = {
  exec: async (sql) => { db.exec(sql); return {}; },
  prepare(sql) { let params = []; const st = {
    bind(...v) { params = v; return st; },
    async all() { return { results: db.prepare(sql).all(...params) }; },
    async first(c) { const r = db.prepare(sql).get(...params); return c ? r?.[c] : r || null; },
    async run() { const r = db.prepare(sql).run(...params); return { success: true, meta: { changes: Number(r.changes) } }; },
  }; return st; },
  batch(sts) { const run = lock.then(async () => { db.exec('BEGIN'); try { const out = []; for (const s of sts) out.push(await s.run()); db.exec('COMMIT'); return out; } catch (e) { db.exec('ROLLBACK'); throw e; } }); lock = run.catch(() => {}); return run; },
};
const env = { DB, SITE_ORIGIN: 'https://poke-pack.rip', ASSETS: { fetch: async (request) => {
  const path = new URL(request.url).pathname;
  try { return new Response(readFileSync(new URL('..' + path, import.meta.url)), { headers: { 'content-type': 'application/json' } }); } catch { return new Response('', { status: 404 }); }
} } };
const realNow = Date.now; let skew = 0; Date.now = () => realNow() + skew;
async function call(path, method = 'GET', body, sid) {
  const res = await worker.fetch(new Request('https://poke-pack.rip' + path, { method, headers: { 'content-type': 'application/json', origin: 'https://poke-pack.rip', ...(sid ? { cookie: 'pp_sid=' + sid } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }), env);
  return { status: res.status, body: await res.json(), cookie: res.headers.get('set-cookie') || '' };
}
async function signup(handle) {
  const r = await call('/api/auth/signup', 'POST', { password: 'hunter22', color: 'gold', birthYear: 1995, birthMonth: 5, agree: true, name: handle, handle });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const sid = /pp_sid=([^;]+)/.exec(r.cookie)[1];
  const id = db.prepare('SELECT id FROM users WHERE handle = ?').get(handle).id;
  seedLevel(db, id, 10);
  db.prepare('UPDATE profiles SET coins = 1000 WHERE user_id = ?').run(id);
  return { sid, id };
}
let n = 0;
const rid = () => `req-${realNow()}-${++n}`;
const me = await signup('polar'); // the owner plays the beta games without a code

eq((await call('/api/fair')).status, 401, 'your seeds need a sign-in');
let f = (await call('/api/fair', 'GET', null, me.sid)).body;
ok(/^[0-9a-f]{64}$/.test(f.seed.serverHash) && /^[0-9a-f]{64}$/.test(f.seed.nextHash), 'hashes are shown');
eq(f.seed.nonce, 0);
ok(!JSON.stringify(f).includes(db.prepare('SELECT server_seed FROM fair_seeds WHERE user_id = ?').get(me.id).server_seed), 'the active server seed is never sent');
const firstHash = f.seed.serverHash; const firstNext = f.seed.nextHash; const firstClient = f.seed.clientSeed;

// A Tall Grass patch: nonce 0, logged with its board; the seed can't rotate while it is open.
const g = await call('/api/casino/beta/grass/start', 'POST', { stake: 5, mines: 3, requestId: rid() }, me.sid);
eq(g.status, 200, JSON.stringify(g.body));
const runId = g.body.run.id;
const board = JSON.parse(db.prepare('SELECT data FROM beta_runs WHERE id = ?').get(runId).data).board;
f = (await call('/api/fair', 'GET', null, me.sid)).body;
eq(f.seed.nonce, 1, 'one bet, one nonce');
eq(f.rolls[0].game, 'grass'); eq(f.rolls[0].nonce, 0); eq(f.rolls[0].result.board, board); eq(f.rolls[0].serverSeed, null, 'not revealed yet');
eq((await call('/api/fair/rotate', 'POST', { clientSeed: 'mine' }, me.sid)).status, 409, 'no rotating with a patch open');
// Step on a Voltorb to close it.
await call('/api/casino/beta/grass/tap', 'POST', { id: runId, tile: board[0] }, me.sid);

// Mystery Tins: two at once is one nonce, one draw each.
const tinList = (await call('/api/casino/beta/tins', 'GET', null, me.sid)).body.tins;
if (tinList?.length) {
  const cheap = [...tinList].sort((a, b) => a.price - b.price)[0];
  db.prepare('UPDATE profiles SET coins = 100000 WHERE user_id = ?').run(me.id);
  const t = await call('/api/casino/beta/tins/open', 'POST', { tin: cheap.id, count: 2, requestId: rid() }, me.sid);
  eq(t.status, 200, JSON.stringify(t.body));
  f = (await call('/api/fair', 'GET', null, me.sid)).body;
  eq(f.rolls[0].game, 'tins'); eq(f.rolls[0].nonce, 1); eq(f.rolls[0].result.picks.length, 2);
  eq(t.body.runs.map((r) => r.card.name), f.rolls[0].result.cards, 'the logged picks are the cards handed out');
  // A refused opening (not enough coins) logs nothing.
  db.prepare('UPDATE profiles SET coins = 0 WHERE user_id = ?').run(me.id);
  const before = db.prepare('SELECT COUNT(*) n FROM fair_rolls').get().n;
  ok((await call('/api/casino/beta/tins/open', 'POST', { tin: cheap.id, requestId: rid() }, me.sid)).status >= 400, 'broke');
  eq(db.prepare('SELECT COUNT(*) n FROM fair_rolls').get().n, before, 'no log for a refused bet');
  db.prepare('UPDATE profiles SET coins = 1000 WHERE user_id = ?').run(me.id);
}

// Rotate: the old seed is revealed, matches its hash, and replays every bet; the next hash moves in.
eq((await call('/api/fair/rotate', 'POST', { clientSeed: 'has space' }, me.sid)).status, 400);
const rot = await call('/api/fair/rotate', 'POST', { clientSeed: 'lucky-7' }, me.sid);
eq(rot.status, 200, JSON.stringify(rot.body));
eq(hashSeed(rot.body.revealed.serverSeed), firstHash, 'the revealed seed is the one that was hashed');
eq(rot.body.revealed.clientSeed, firstClient);
eq(rot.body.seed.serverHash, firstNext, 'the next seed moves in');
eq(rot.body.seed.clientSeed, 'lucky-7'); eq(rot.body.seed.nonce, 0);
ok(rot.body.seed.nextHash !== firstNext, 'a fresh next seed');
const grassRoll = rot.body.rolls.find((r) => r.game === 'grass');
eq(grassRoll.serverSeed, rot.body.revealed.serverSeed, 'old bets show their seed now');
eq(grassBoard(fairStream(grassRoll.serverSeed, grassRoll.clientSeed, grassRoll.nonce), 25, 3), board, 'the board replays from its seeds');
const tinRoll = rot.body.rolls.find((r) => r.game === 'tins');
if (tinRoll) eq(tinPicks(fairStream(tinRoll.serverSeed, tinRoll.clientSeed, tinRoll.nonce), tinRoll.params.odds, tinRoll.params.count), tinRoll.result.picks, 'the tins replay');
eq(rot.body.history[0].serverSeed, rot.body.revealed.serverSeed);
const rot2 = await call('/api/fair/rotate', 'POST', {}, me.sid);
ok(cleanClientSeed(rot2.body.seed.clientSeed), 'an empty client seed picks one');

eq((await call('/api/fair/game/nope/1')).status, 404);

// A personal table: it goes with the account.
const terms = readFileSync(new URL('../worker/terms.js', import.meta.url), 'utf8');
ok(['fair_seeds', 'fair_seed_history', 'fair_rolls'].every((t) => terms.includes(`"${t}"`)), 'seed tables are personal');

console.log(`fair ok (${checks} checks)`);
