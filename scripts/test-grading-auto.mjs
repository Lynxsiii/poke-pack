/* Auto-regrade (worker/grading-auto.js): every try costs one grading fee and one roll, moved together; the stops hold.
   Runs the real Worker against in-memory SQLite (Node 22+): node scripts/test-grading-auto.mjs */
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { seedLevel } from './lib/level-seed.mjs';
import worker from '../worker/index.js';
import { AUTO_DDL, STEP_TRIES } from '../worker/grading-auto.js';
import { splitStatements } from './gen-casino-ddl.mjs';
import { GRADE_BANDS, gradingFee } from '../js/grading-rules.js';
import { AUTO_BLACK, autoHit, hitChance, hitWithin, triesFor } from '../js/grading-auto-rules.js';
import { money } from '../js/catalog.js';
import { ownedMap } from '../js/titles.js';

const results = [];
let failed = 0;
async function check(name, fn) {
  try { await fn(); results.push(`PASS  ${name}`); }
  catch (err) { failed++; results.push(`FAIL  ${name}\n      ${String(err?.stack || err).split('\n').slice(0, 14).join('\n      ')}`); }
}

// Rigged dice: the Worker draws with crypto.getRandomValues; queue the raw values it will see (each is taken mod n).
const realRandom = crypto.getRandomValues.bind(crypto);
const queue = [];
crypto.getRandomValues = (buf) => {
  if (queue.length && buf instanceof Uint32Array && buf.length === 1) { buf[0] = queue.shift(); return buf; }
  return realRandom(buf);
};
// Band 'me' (me5): r < 5800 is a 10, then 9 up to 8700, ... 9999 is a 1. A 10 also draws the Black Label roll (0 = Black Label).
const G = { 10: 0, 9: 6000, 8: 9000, 6: 9900, 5: 9960, 1: 9999 };
const rolls = (...grades) => { for (const g of grades) { if (g === 'bl') { queue.push(G[10], 0); } else { queue.push(G[g]); if (g === 10) queue.push(1); } } };

// ---- Rules ----------------------------------------------------------------------
await check('autoHit and hitChance', () => {
  assert.equal(autoHit(9, false, 9), true); assert.equal(autoHit(10, false, 9), true); assert.equal(autoHit(8, false, 9), false);
  assert.equal(autoHit(10, false, AUTO_BLACK), false, 'a plain 10 is not a Black Label');
  assert.equal(autoHit(10, true, AUTO_BLACK), true); assert.equal(autoHit(10, true, 10), true);
  const me = GRADE_BANDS[0];
  assert.equal(hitChance(me, 10), 0.58); assert.equal(hitChance(me, 9), 0.87); assert.equal(hitChance(me, AUTO_BLACK), 0.58 / 100);
  assert.equal(hitChance(me, 2), 1 - 0.0002);
  assert.ok(Math.abs(hitWithin(0.5, 2) - 0.75) < 1e-12); assert.equal(triesFor(0.5, 0.75), 2); assert.equal(triesFor(1, 0.9), 1);
});

// ---- Harness ----------------------------------------------------------------------
const migrationDir = new URL('../worker/migrations/', import.meta.url);
const migrationFiles = readdirSync(migrationDir).sort();
const migrationSql = (file) => readFileSync(new URL(file, migrationDir), 'utf8');
await check('worker/grading-auto.js DDL matches migrations/0036_grade_runs.sql', () => {
  const norm = (sql) => sql.replace(/\s+/g, ' ').trim();
  const file = migrationFiles.find((f) => /_grade_runs\.sql$/.test(f));
  assert.ok(file, 'the migration exists');
  assert.deepEqual(splitStatements(migrationSql(file)).map(norm), AUTO_DDL.map(norm));
});
const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON');
// Stop before the grade_runs migration: the Worker makes the table itself, as production does.
for (const file of migrationFiles.filter((f) => !/_grade_runs\.sql$/.test(f))) db.exec(migrationSql(file));
const DB = {
  exec: async (sql) => { db.exec(sql); return {}; },
  prepare(sql) {
    let params = [];
    const s = {
      bind(...values) { params = values; return s; },
      async all() { return { results: db.prepare(sql).all(...params) }; },
      async first(column) { const row = db.prepare(sql).get(...params); return column ? row?.[column] : row || null; },
      execute() { const r = db.prepare(sql).run(...params); return { success: true, meta: { changes: Number(r.changes) } }; },
      async run() { return s.execute(); },
    }; return s;
  },
  async batch(statements) {
    db.exec('BEGIN');
    try { const out = statements.map((s) => s.execute()); db.exec('COMMIT'); return out; }
    catch (err) { db.exec('ROLLBACK'); throw err; }
  },
};
const now = Date.now();
const addUser = (id, coins = 1000) => {
  db.prepare('INSERT INTO users(id,name,handle,password_hash,color,created_at,last_played) VALUES(?,?,?,?,?,?,?)').run(id, id, id, 'unused', 'gold', now, now);
  db.prepare('INSERT INTO profiles(user_id,coins,granted,created_at,binder) VALUES(?,?,?,?,?)').run(id, coins, coins, now, '[]');
  db.prepare('INSERT INTO sessions(id,user_id,created_at,expires_at) VALUES(?,?,?,?)').run(id, id, now, now + 864000000); seedLevel(db, id);
};
['host', 'poor', 'other'].forEach((id) => addUser(id));
const plain = (row) => (row ? { ...row } : null);
const coinsOf = (user) => money(db.prepare('SELECT coins FROM profiles WHERE user_id = ?').get(user).coins);
const setCoins = (user, coins) => db.prepare('UPDATE profiles SET coins = ? WHERE user_id = ?').run(coins, user);
const slabRows = (user) => db.prepare('SELECT * FROM graded_cards WHERE user_id = ? ORDER BY id').all(user).map(plain);
const active = (user) => slabRows(user).filter((r) => r.status === 'slabbed');
const cardsRow = (user, card) => plain(db.prepare('SELECT qty, reverse_qty FROM cards WHERE user_id = ? AND card_id = ?').get(user, card));
const ASSETS = { fetch: async (request) => {
  try { return new Response(readFileSync(new URL('..' + new URL(request.url).pathname, import.meta.url)), { headers: { 'content-type': 'application/json' } }); }
  catch { return new Response('', { status: 404 }); }
} };
const env = { DB, ASSETS };
async function api(path, method = 'GET', body, user = 'host', headers = {}) {
  const res = await worker.fetch(new Request('https://poke-pack.rip' + path, { method,
    headers: { 'content-type': 'application/json', origin: 'https://poke-pack.rip', ...(user ? { cookie: `pp_sid=${user}` } : {}), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), env);
  return { status: res.status, ...(await res.json()) };
}
const me5 = JSON.parse(readFileSync(new URL('../data/me5.json', import.meta.url), 'utf8'));
const big = me5.find((c) => c.id === 'me5-87');
const FEE = gradingFee(big); // 5.41
const give = (user, card, qty, rev = 0) => db.prepare(`INSERT INTO cards(user_id,card_id,qty,reverse_qty) VALUES(?,?,?,?)
  ON CONFLICT(user_id,card_id) DO UPDATE SET qty = qty + excluded.qty, reverse_qty = reverse_qty + excluded.reverse_qty`).run(user, card, qty, rev);
let rid = 0;
const id = () => `auto-test-${String(++rid).padStart(6, '0')}`;
/** Grade a card by hand at a chosen grade, the normal way (submit). */
async function slabAt(grade, user = 'host', card = 'me5-87') {
  rolls(grade);
  const r = await api('/api/grading/submit', 'POST', { cardId: card, reverse: false, requestId: id() }, user);
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.equal(r.slab.grade, grade);
  return r.slab;
}
const start = (slabId, target, extra = {}, user = 'host') => api('/api/grading/auto/start', 'POST', { slabId, target, maxTries: 50, requestId: id(), ...extra }, user);
const step = (runId, user = 'host') => api('/api/grading/auto/step', 'POST', { runId }, user);
const stop = (runId, user = 'host') => api('/api/grading/auto/stop', 'POST', { runId }, user);

give('host', 'me5-87', 12); give('poor', 'me5-87', 1); give('other', 'me5-87', 1);

await check('start validates: auth, origin, target, limits, slab owner, already at target', async () => {
  const slab = await slabAt(8);
  assert.equal((await api('/api/grading/auto/start', 'POST', { slabId: slab.id, target: 10, maxTries: 5, requestId: id() }, null)).status, 401);
  assert.equal((await api('/api/grading/auto/start', 'POST', { slabId: slab.id, target: 10, maxTries: 5, requestId: id() }, 'host', { origin: 'https://evil.example' })).status, 403);
  assert.equal((await start(slab.id, 10, { requestId: 'x' })).status, 400, 'requestId');
  assert.equal((await start(slab.id, 12)).status, 400, 'target');
  assert.equal((await start(slab.id, 1)).status, 400, 'a target of 1 means nothing');
  assert.equal((await start(slab.id, 10, { maxTries: 0 })).status, 400);
  assert.equal((await start(slab.id, 10, { maxTries: 10001 })).status, 400);
  assert.equal((await start(slab.id, 10, { maxSpend: -1 })).status, 400);
  assert.equal((await start(slab.id, 10, { maxSpend: 1 })).status, 400, 'below one fee');
  assert.equal((await start(slab.id, 10, {}, 'other')).status, 404, "someone else's slab");
  assert.equal((await start(slab.id, 8)).status, 409, 'already an 8');
  assert.equal((await start(slab.id, 7)).status, 409, 'already better');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM grade_runs').get().n, 0, 'refusals write nothing');
  db.prepare("UPDATE graded_cards SET status = 'cracked' WHERE id = ?").run(slab.id); // tidy: back to a raw card
  give('host', 'me5-87', 1);
});

await check('a run to a 10: each try is one fee and one roll; old slabs cracked; the copy count never moves', async () => {
  const slab = await slabAt(8);
  const coins0 = coinsOf('host');
  const owned0 = ownedMap((await api('/api/me')).save)['me5-87'];
  const raw0 = cardsRow('host', 'me5-87');
  const s = await start(slab.id, 10, { maxSpend: 100 });
  assert.equal(s.status, 200, JSON.stringify(s));
  assert.equal(s.run.status, 'running'); assert.equal(s.run.tries, 0); assert.equal(s.run.spent, 0); assert.equal(s.slab.id, slab.id);
  assert.equal(coinsOf('host'), coins0, 'starting costs nothing');
  rolls(1, 9, 10);
  const r = await step(s.run.id);
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.deepEqual(r.tries.map((t) => t.grade), [1, 9, 10]);
  assert.ok(r.tries.every((t) => t.fee === FEE));
  assert.equal(r.run.status, 'hit'); assert.equal(r.run.reason, 'hit'); assert.equal(r.run.tries, 3); assert.equal(r.run.spent, money(3 * FEE));
  assert.deepEqual(r.run.tally, { 1: 1, 9: 1, 10: 1 });
  assert.equal(coinsOf('host'), money(coins0 - 3 * FEE)); assert.equal(r.save.coins, coinsOf('host'));
  assert.equal(r.slab.grade, 10); assert.equal(r.run.slabId, r.slab.id);
  const mine = slabRows('host').filter((x) => x.id === slab.id || String(x.request_id).startsWith(`auto:${s.run.id}:`));
  assert.deepEqual(mine.map((x) => x.status), ['cracked', 'cracked', 'cracked', 'slabbed']);
  assert.deepEqual(mine.slice(1).map((x) => x.fee_cents), [541, 541, 541]);
  assert.deepEqual(mine.slice(1).map((x) => x.request_id), [1, 2, 3].map((n) => `auto:${s.run.id}:${n}`));
  assert.deepEqual(cardsRow('host', 'me5-87'), raw0, 'no raw copy came out or went in');
  assert.equal(ownedMap(r.save)['me5-87'], owned0, 'still the same number owned');
  assert.equal(queue.length, 0, 'exactly one roll per try (and the Black Label roll on the 10)');
  const again = await step(s.run.id);
  assert.equal(again.status, 200); assert.deepEqual(again.tries, []); assert.equal(coinsOf('host'), money(coins0 - 3 * FEE), 'a finished run never charges');
  const read = await api(`/api/grading/auto?run=${s.run.id}`);
  assert.equal(read.run.status, 'hit'); assert.equal(read.run.tries, 3);
  assert.equal((await api('/api/grading/auto')).run, null, 'nothing running now');
});

await check('a step does at most STEP_TRIES tries; the try limit stops the run', async () => {
  const slab = active('host').find((x) => x.grade === 10);
  const s = await start(slab.id, AUTO_BLACK, { maxTries: STEP_TRIES + 2 });
  assert.equal(s.status, 200, JSON.stringify(s));
  rolls(...new Array(STEP_TRIES).fill(10)); // plain 10s: not a Black Label, so the run keeps going
  const a = await step(s.run.id);
  assert.equal(a.tries.length, STEP_TRIES); assert.equal(a.run.status, 'running');
  assert.equal(a.slab.grade, 10); assert.equal(a.slab.blackLabel, false);
  rolls(9, 9);
  const b = await step(s.run.id);
  assert.equal(b.tries.length, 2); assert.equal(b.run.status, 'stopped'); assert.equal(b.run.reason, 'tries');
  assert.equal(b.run.spent, money((STEP_TRIES + 2) * FEE)); assert.equal(b.slab.grade, 9, 'the last try is the slab you keep');
});

await check('Black Label target: stops on a Black Label, not on a plain 10', async () => {
  const slab = active('host').find((x) => x.grade === 9);
  const s = await start(slab.id, 'bl', { maxTries: 10 });
  assert.equal(s.run.target, AUTO_BLACK);
  rolls(10, 'bl');
  const r = await step(s.run.id);
  assert.deepEqual(r.tries.map((t) => [t.grade, t.blackLabel]), [[10, false], [10, true]]);
  assert.equal(r.run.status, 'hit'); assert.equal(r.slab.blackLabel, true); assert.deepEqual(r.run.tally, { 10: 1, bl: 1 });
  assert.equal((await start(r.slab.id, 'bl')).status, 409, 'a Black Label is already the top');
});

await check('the spending limit: stops before a fee would pass it', async () => {
  const slab = await slabAt(1);
  const s = await start(slab.id, 10, { maxSpend: FEE * 2.5 });
  rolls(8, 8, 8);
  const r = await step(s.run.id);
  assert.equal(r.tries.length, 2); assert.equal(r.run.status, 'stopped'); assert.equal(r.run.reason, 'spend');
  assert.equal(r.run.spent, money(2 * FEE)); assert.ok(r.run.spent <= r.run.maxSpend);
  queue.length = 0;
});

await check('running out of coins stops cleanly, never below zero', async () => {
  const slab = await slabAt(1, 'poor');
  setCoins('poor', FEE * 2 + 1);
  const s = await start(slab.id, 10, {}, 'poor');
  rolls(8, 8, 8);
  const r = await step(s.run.id, 'poor');
  assert.equal(r.tries.length, 2); assert.equal(r.run.reason, 'coins'); assert.equal(coinsOf('poor'), 1);
  queue.length = 0;
});

await check('one running run per player; stop by the player; another player cannot touch it', async () => {
  const slab = await slabAt(8);
  const s = await start(slab.id, 10);
  assert.equal(s.status, 200);
  const other = await slabAt(8);
  assert.equal((await start(other.id, 10)).status, 409, 'a second run waits for the first');
  assert.equal((await api('/api/grading/auto')).run.id, s.run.id, 'GET shows the running one');
  assert.equal((await step(s.run.id, 'other')).status, 404); assert.equal((await stop(s.run.id, 'other')).status, 404);
  const coins = coinsOf('host');
  const x = await stop(s.run.id);
  assert.equal(x.run.status, 'stopped'); assert.equal(x.run.reason, 'player'); assert.equal(x.run.tries, 0);
  assert.deepEqual((await step(s.run.id)).tries, []); assert.equal(coinsOf('host'), coins);
  assert.equal(slabRows('host').find((r) => r.id === slab.id).status, 'slabbed', 'stopping keeps the slab you have');
});

await check('a retried start answers with the same run; the slab staked or sold elsewhere stops the run', async () => {
  const slab = await slabAt(8);
  const body = { slabId: slab.id, target: 10, maxTries: 5, requestId: 'auto-retry-000001' };
  const a = await api('/api/grading/auto/start', 'POST', body), b = await api('/api/grading/auto/start', 'POST', body);
  assert.equal(a.run.id, b.run.id);
  db.prepare("UPDATE graded_cards SET locked = 'coinflip:1' WHERE id = ?").run(slab.id);
  const coins = coinsOf('host');
  rolls(10);
  const r = await step(a.run.id);
  assert.deepEqual(r.tries, []); assert.equal(r.run.reason, 'locked'); assert.equal(coinsOf('host'), coins, 'no fee without a try');
  queue.length = 0;
  db.prepare('UPDATE graded_cards SET locked = NULL WHERE id = ?').run(slab.id);
  const c = await start(slab.id, 10);
  db.prepare("UPDATE graded_cards SET status = 'sold' WHERE id = ?").run(slab.id);
  const d = await step(c.run.id);
  assert.deepEqual(d.tries, []); assert.equal(d.run.reason, 'slab'); assert.equal(coinsOf('host'), coins);
});

await check('the guard and the profile place travel with the slab; worn and shown counts never change', async () => {
  const slab = await slabAt(5);
  db.prepare("UPDATE graded_cards SET guard = 'guard-onyx', shown = 1 WHERE id = ?").run(slab.id);
  const s = await start(slab.id, 9);
  rolls(6, 9);
  const r = await step(s.run.id);
  assert.equal(r.run.status, 'hit');
  assert.equal(r.slab.guard, 'guard-onyx'); assert.equal(r.slab.shown, true);
  const rows = slabRows('host');
  assert.equal(rows.filter((x) => x.status === 'slabbed' && x.guard === 'guard-onyx').length, 1);
  assert.equal(rows.filter((x) => x.status === 'slabbed' && x.shown === 1).length, 1);
});

await check('two steps at once share the tries; nothing is charged twice', async () => {
  const slab = await slabAt(1, 'other');
  const coins = coinsOf('other');
  const s = await start(slab.id, 10, { maxTries: 4 }, 'other');
  rolls(8, 8, 8, 8, 8, 8, 8, 8); // a try that loses the race has drawn its roll, so queue spares
  const [a, b] = await Promise.all([step(s.run.id, 'other'), step(s.run.id, 'other')]);
  queue.length = 0;
  assert.equal(a.tries.length + b.tries.length, 4);
  const run = (await api(`/api/grading/auto?run=${s.run.id}`, 'GET', undefined, 'other')).run;
  assert.equal(run.tries, 4); assert.equal(run.reason, 'tries');
  assert.equal(coinsOf('other'), money(coins - 4 * FEE));
  assert.equal(active('other').length, 1);
});

crypto.getRandomValues = realRandom;
console.log(results.join('\n'));
const passed = results.length - failed;
console.log(`\n${failed ? 'FAIL' : 'PASS'}: ${passed}/${results.length} auto-regrade checks passed${failed ? `, ${failed} failed` : ''}.`);
if (failed) process.exitCode = 1;
