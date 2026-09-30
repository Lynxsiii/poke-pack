/* RIP Grading: rules, submit/crack/sell/guards, idempotency, stock accounting, counts.
   Runs the real Worker against in-memory SQLite (Node 22+): node scripts/test-grading.mjs */
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import worker from '../worker/index.js';
import { GRADING_DDL, randomBelow, resetGradingSchemaCache, slabView, setForCard } from '../worker/grading.js';
import { splitStatements } from './gen-casino-ddl.mjs';
import {
  GRADE_BANDS, GRADE_MULTIPLIER, GRADE_WORDS, GRADING_FEE, GRADING_LIMITS, GRADING_RULES_VERSION, GUARDS,
  bandFor, certNumber, gradedValue, gradingFee, releaseYear, rollGrade, validateGradingRules,
} from '../js/grading-rules.js';
import { SET_BY_ID, money, sellValue } from '../js/catalog.js';
import { HIT_RARITIES } from '../js/engine.js';
import { ownedMap, titleContext } from '../js/titles.js';
import { achievementContext } from '../js/achievements.js';

const results = [];
let failed = 0;
async function check(name, fn) {
  try { await fn(); results.push(`PASS  ${name}`); }
  catch (err) { failed++; results.push(`FAIL  ${name}\n      ${String(err?.stack || err).split('\n').slice(0, 14).join('\n      ')}`); }
}

// ---- Rules -----------------------------------------------------------------------
await check('every band sums to 10000 and the tables validate', () => {
  assert.equal(validateGradingRules(), true);
  for (const band of GRADE_BANDS) assert.equal(Object.values(band.odds).reduce((a, b) => a + b, 0), 10000, band.id);
  assert.equal(Object.keys(GRADE_WORDS).length, 10);
  assert.equal(GRADING_RULES_VERSION >= 1, true);
});
await check('a deliberately broken copy throws', () => {
  const broken = GRADE_BANDS.map((b) => ({ ...b, odds: { ...b.odds } }));
  broken[2].odds[8] += 1;
  assert.throws(() => validateGradingRules(broken), /sum to 10001/);
  const missing = GRADE_BANDS.map((b) => ({ ...b, odds: { ...b.odds } }));
  delete missing[0].odds[3];
  assert.throws(() => validateGradingRules(missing));
  assert.throws(() => validateGradingRules(GRADE_BANDS, [...GUARDS, { ...GUARDS[0] }]), /repeats/);
  assert.throws(() => validateGradingRules(GRADE_BANDS, [{ id: 'x', name: 'X', price: 0 }]), /price/);
});
await check('bandFor: me55 -> me, sv3pt5 -> sv, swsh1 -> swsh, base1 -> wotc', () => {
  assert.equal(releaseYear(SET_BY_ID.me55), 2026); assert.equal(bandFor(SET_BY_ID.me55).id, 'me');
  assert.equal(releaseYear(SET_BY_ID.sv3pt5), 2023); assert.equal(bandFor(SET_BY_ID.sv3pt5).id, 'sv');
  assert.equal(releaseYear(SET_BY_ID.swsh1), 2020); assert.equal(bandFor(SET_BY_ID.swsh1).id, 'swsh');
  assert.equal(bandFor(SET_BY_ID.swshp).id, 'sm', 'SWSH promos began in 2019');
  const base1 = { id: 'base1', name: 'Base Set', released: 'Jan 1999' }; // ROADMAP entry, not yet in ALL_SETS
  assert.equal(releaseYear(base1), 1999); assert.equal(bandFor(base1).id, 'wotc');
  assert.equal(bandFor({ era: 'Sun & Moon' }).id, 'sm', 'era name fallback');
  assert.equal(bandFor({}).id, 'wotc', 'nothing known grades as vintage');
  assert.equal(bandFor(setForCard('energy-grass-swsh')).id, 'swsh'); assert.equal(bandFor(setForCard('energy-fire')).id, 'sv');
  assert.equal(setForCard('me5-87').id, 'me5');
});
await check('fee and gradedValue math', () => {
  const card = { market: 8.28, rarity: 'Rare' };
  assert.equal(gradingFee(card), money(GRADING_FEE.flat + GRADING_FEE.rate * 8.28));
  assert.equal(gradingFee(card), 5.41);
  assert.equal(gradingFee({ rarity: 'Common' }), money(5 + 0.05 * sellValue({ rarity: 'Common' })));
  const me5 = SET_BY_ID.me5, swsh1 = SET_BY_ID.swsh1;
  assert.equal(gradedValue(card, 10, me5), money(8.28 * bandFor(me5).gem)); assert.equal(gradedValue(card, 10, me5), 12.42);
  assert.equal(gradedValue(card, 10, swsh1), money(8.28 * 1.9));
  assert.equal(gradedValue(card, 9, me5), 8.28);
  for (const g of [8, 7, 6, 5, 4, 3, 2, 1]) assert.equal(gradedValue(card, g, me5), money(8.28 * GRADE_MULTIPLIER[g]));
  assert.equal(certNumber(123), 'RIP-0000123'); assert.equal(certNumber(1), 'RIP-0000001');
});
await check('rollGrade walks the table from 10 down', () => {
  const band = GRADE_BANDS[0];
  assert.equal(rollGrade(band, 0), 10); assert.equal(rollGrade(band, band.odds[10] - 1), 10); assert.equal(rollGrade(band, band.odds[10]), 9);
  assert.equal(rollGrade(band, 9999), 1); assert.equal(rollGrade(GRADE_BANDS[6], 9999), 1); assert.equal(rollGrade(GRADE_BANDS[6], 9969), 2);
  assert.throws(() => rollGrade(band, 10000)); assert.throws(() => rollGrade(band, -1));
});
await check('randomBelow is uniform in [0, 10000) with no out-of-range values', () => {
  const buckets = new Array(10).fill(0);
  for (let i = 0; i < 100000; i++) { const r = randomBelow(10000); assert.ok(Number.isInteger(r) && r >= 0 && r < 10000); buckets[Math.floor(r / 1000)]++; }
  for (const n of buckets) assert.ok(Math.abs(n - 10000) < 600, `bucket ${n}`);
  assert.equal(randomBelow(1), 0);
});
await check('20,000-roll distribution per band stays within a few % of the table', () => {
  const N = 20000;
  for (const band of GRADE_BANDS) {
    const seen = {};
    for (let i = 0; i < N; i++) { const g = rollGrade(band, randomBelow(10000)); seen[g] = (seen[g] || 0) + 1; }
    for (const grade of Object.keys(band.odds)) {
      const p = band.odds[grade] / 10000, expect = p * N, sd = Math.sqrt(N * p * (1 - p));
      const tolerance = Math.max(4.5 * sd, 12);
      assert.ok(Math.abs((seen[grade] || 0) - expect) <= tolerance, `${band.id} grade ${grade}: saw ${seen[grade] || 0}, expected ${expect} (tolerance ${tolerance.toFixed(0)})`);
    }
  }
});

// ---- Harness -----------------------------------------------------------------------
const migrationDir = new URL('../worker/migrations/', import.meta.url);
const migrationFiles = readdirSync(migrationDir).sort();
const migrationSql = (file) => readFileSync(new URL(file, migrationDir), 'utf8');
await check('worker/grading.js DDL matches migrations/0019_grading.sql', () => {
  const norm = (sql) => sql.replace(/\s+/g, ' ').trim();
  assert.deepEqual(splitStatements(migrationSql('0019_grading.sql')).map(norm), GRADING_DDL.map(norm));
});
function makeDb(files) {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  for (const file of files) db.exec(migrationSql(file));
  const DB = {
    exec: async (sql) => { db.exec(sql); return {}; },
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
      try { const out = statements.map((s) => s.execute()); db.exec('COMMIT'); return out; }
      catch (err) { db.exec('ROLLBACK'); throw err; }
    },
  };
  return { db, DB };
}
// The Worker upgrades a database that stops before 0019, as production does.
const { db, DB } = makeDb(migrationFiles.filter((f) => f < '0019'));
const now = Date.now();
const addUser = (id, coins = 100) => {
  db.prepare('INSERT INTO users(id,name,handle,password_hash,color,created_at,last_played) VALUES(?,?,?,?,?,?,?)').run(id, id, id, 'unused', 'gold', now, now);
  db.prepare('INSERT INTO profiles(user_id,coins,granted,created_at,binder) VALUES(?,?,?,?,?)').run(id, coins, coins, now, '[]');
  db.prepare('INSERT INTO sessions(id,user_id,created_at,expires_at) VALUES(?,?,?,?)').run(id, id, now, now + 864000000);
};
['host', 'poor', 'ace', 'none', 'full'].forEach((id) => addUser(id));
db.prepare('UPDATE profiles SET coins = 3 WHERE user_id = ?').run('poor');
const give = (user, card, qty, rev = 0) => db.prepare(`INSERT INTO cards(user_id,card_id,qty,reverse_qty) VALUES(?,?,?,?)
  ON CONFLICT(user_id,card_id) DO UPDATE SET qty = qty + excluded.qty, reverse_qty = reverse_qty + excluded.reverse_qty`).run(user, card, qty, rev);
// node:sqlite rows have a null prototype; deepEqual wants plain objects.
const plain = (row) => (row ? { ...row } : null);
const cardsRow = (user, card) => plain(db.prepare('SELECT qty, reverse_qty FROM cards WHERE user_id = ? AND card_id = ?').get(user, card));
// profiles.coins is a REAL that accumulates float dust, as it always has; the save rounds it (money) and so do we.
const coinsOf = (user) => money(db.prepare('SELECT coins FROM profiles WHERE user_id = ?').get(user).coins);
const slabRows = (user) => db.prepare('SELECT * FROM graded_cards WHERE user_id = ? ORDER BY id').all(user).map(plain);
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
const submit = (cardId, reverse, requestId, user = 'host') => api('/api/grading/submit', 'POST', { cardId, reverse, requestId }, user);
const crack = (slabId, user = 'host') => api('/api/grading/crack', 'POST', { slabId }, user);
const sell = (slabId, requestId, user = 'host') => api('/api/grading/sell', 'POST', { slabId, requestId }, user);
const wear = (slabId, guardId, user = 'host') => api('/api/grading/guard', 'POST', { slabId, guardId }, user);
const buy = (guardId, qty, requestId, user = 'host') => api('/api/grading/guards/buy', 'POST', { guardId, qty, requestId }, user);
const me5 = JSON.parse(readFileSync(new URL('../data/me5.json', import.meta.url), 'utf8'));
const cardById = new Map(me5.map((c) => [c.id, c]));
const big = cardById.get('me5-87'); // 8.28 market
const SLAB_KEYS = ['band', 'cardId', 'cert', 'fee', 'grade', 'gradedAt', 'guard', 'id', 'reverse', 'shown', 'value'];

// me5-87: 2 copies, one of them reverse. me5-90 (12.85) one plain copy.
give('host', 'me5-87', 2, 1); give('host', 'me5-90', 1); give('host', 'me5-1', 2);
give('poor', 'me5-1', 1);

await check('lazy schema: no graded_cards before the first request, present after; 0019 replays harmlessly', async () => {
  assert.equal(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name IN ('graded_cards','gear_purchases')").get().n, 0);
  const r = await api('/api/grading');
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.deepEqual(r, { status: 200, slabs: [], guards: { owned: {}, equipped: {} }, rulesVersion: GRADING_RULES_VERSION });
  assert.equal(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name IN ('graded_cards','gear_purchases')").get().n, 2);
  db.exec(migrationSql('0019_grading.sql'));
  resetGradingSchemaCache();
  assert.equal((await api('/api/grading')).status, 200);
  const fresh = makeDb(migrationFiles); // every migration on an empty database
  assert.equal(fresh.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name = 'graded_cards'").get().n, 1);
});
await check('auth, origin and content-type checks', async () => {
  assert.equal((await api('/api/grading', 'GET', undefined, null)).status, 401);
  assert.equal((await submit('me5-87', false, 'grade-000001', null)).status, 401);
  assert.equal((await api('/api/grading/submit', 'POST', { cardId: 'me5-87', requestId: 'grade-000001' }, 'host', { origin: 'https://foreign.example' })).status, 403);
  assert.equal((await api('/api/grading/submit', 'POST', { cardId: 'me5-87', requestId: 'grade-000001' }, 'host', { 'content-type': 'text/plain' })).status, 400);
  assert.equal((await api('/api/grading/nope', 'POST', {})).status, 404);
  assert.equal((await api('/api/grading/submit', 'GET')).status, 404);
  assert.equal((await submit('me5-87', false, 'short')).status, 400, 'requestId is required');
  assert.equal((await submit('me5-87', false, undefined)).status, 400);
  assert.equal(slabRows('host').length, 0, 'refusals write nothing');
});
await check('submit validates the card: 400 unknown, 404 no copy', async () => {
  assert.equal((await submit('nope-1', false, 'grade-bad-00001')).status, 400);
  assert.equal((await submit('x', false, 'grade-bad-00002')).status, 400);
  assert.equal((await submit('me5-99', false, 'grade-bad-00003')).status, 404, 'a card you do not own');
  assert.equal((await submit('me5-90', true, 'grade-bad-00004')).status, 404, 'no reverse copy of me5-90');
  assert.equal(coinsOf('host'), 100); assert.deepEqual(cardsRow('host', 'me5-90'), { qty: 1, reverse_qty: 0 });
  assert.equal(slabRows('host').length, 0);
});

let slabA, slabB, slabC, snapshotBefore;
const pickCtx = (save, rarities) => {
  const owned = { ...save, collection: ownedMap(save) };
  const t = titleContext(owned, { signed: true, rarities });
  const a = achievementContext(owned, { signed: true, rarities });
  return { unique: t.unique, hits: t.hits, bestSet: t.bestSet, hitAch: a.hits, uniqueAch: a.unique, best: a.bestSet };
};
const rarityMap = (save) => { const out = {}; for (const [id, n] of Object.entries(ownedMap(save))) { const c = cardById.get(id); if (c?.rarity && n > 0) out[c.rarity] = (out[c.rarity] || 0) + 1; } return out; };

await check('submit happy path: fee debited, plain copy taken, slab in save.graded', async () => {
  const before = (await api('/api/me')).save;
  snapshotBefore = pickCtx(before, rarityMap(before));
  const r = await submit('me5-87', false, 'grade-000001');
  assert.equal(r.status, 200, JSON.stringify(r));
  slabA = r.slab;
  assert.deepEqual(Object.keys(slabA).sort(), SLAB_KEYS);
  assert.equal(slabA.id, 1); assert.equal(slabA.cert, 'RIP-0000001'); assert.equal(slabA.cardId, 'me5-87'); assert.equal(slabA.reverse, false);
  assert.ok(Number.isInteger(slabA.grade) && slabA.grade >= 1 && slabA.grade <= 10); assert.equal(slabA.band, 'me');
  assert.equal(slabA.fee, 5.41); assert.equal(slabA.value, gradedValue(big, slabA.grade, SET_BY_ID.me5)); assert.equal(slabA.guard, null);
  assert.ok(Math.abs(slabA.gradedAt - Date.now()) < 5000);
  assert.equal(r.save.coins, money(100 - 5.41)); assert.equal(coinsOf('host'), money(100 - 5.41));
  assert.equal(r.save.collection['me5-87'], 1); assert.equal(r.save.reverses['me5-87'], 1, 'the reverse holo stayed');
  assert.deepEqual(r.save.graded, [slabA]);
  assert.deepEqual(ownedMap(r.save)['me5-87'], 2, 'still two copies owned');
  const row = slabRows('host')[0];
  assert.equal(row.fee_cents, 541); assert.equal(row.status, 'slabbed'); assert.equal(row.request_id, 'grade-000001'); assert.equal(row.grade, slabA.grade);
  assert.deepEqual(slabView(row, big), slabA, 'slabView is the serialiser the API uses');
});
await check('same requestId twice (and a double tap) = one charge, same grade', async () => {
  const r = await submit('me5-87', false, 'grade-000001');
  assert.equal(r.status, 200); assert.deepEqual(r.slab, slabA);
  assert.equal(coinsOf('host'), money(100 - 5.41)); assert.equal(r.save.collection['me5-87'], 1); assert.equal(slabRows('host').length, 1);
  // A different card under the same requestId is still the same answer: the roll stands.
  assert.deepEqual((await submit('me5-90', false, 'grade-000001')).slab, slabA);
  const key = 'grade-race-00001';
  const [a, b] = await Promise.all([submit('me5-1', false, key), submit('me5-1', false, key)]);
  assert.equal(a.status, 200); assert.equal(b.status, 200); assert.equal(a.slab.id, b.slab.id); assert.equal(a.slab.grade, b.slab.grade);
  assert.equal(cardsRow('host', 'me5-1').qty, 1, 'one copy taken');
  assert.equal(slabRows('host').length, 2);
  const undo = await crack(a.slab.id); assert.equal(undo.status, 200); assert.equal(cardsRow('host', 'me5-1').qty, 2);
});
await check('grading the only copy leaves rarity counts, unique and set completion unchanged (ownedMap)', async () => {
  const after = (await api('/api/me')).save;
  assert.deepEqual(pickCtx(after, rarityMap(after)), snapshotBefore);
  assert.deepEqual(rarityMap(after), rarityMap({ collection: { 'me5-87': 2, 'me5-90': 1, 'me5-1': 2 } }));
  assert.deepEqual(ownedMap(after), { 'me5-87': 2, 'me5-90': 1, 'me5-1': 2 });
  assert.equal(after.collection['me5-87'], 1, 'collection stays the raw sellable count');
});
await check('not enough coins -> 402 and no card taken', async () => {
  const fee = gradingFee(cardById.get('me5-1'));
  assert.ok(coinsOf('poor') < fee);
  const r = await submit('me5-1', false, 'grade-poor-00001', 'poor');
  assert.equal(r.status, 402); assert.equal(r.error, 'Not enough coins.');
  assert.deepEqual(cardsRow('poor', 'me5-1'), { qty: 1, reverse_qty: 0 }); assert.equal(coinsOf('poor'), 3); assert.equal(slabRows('poor').length, 0);
});
await check('reverse copy handling: plain copy gone -> 404, reverse=true takes the reverse', async () => {
  const coins = coinsOf('host');
  assert.equal(coins, money(100 - 5.41 - gradingFee(cardById.get('me5-1'))), 'the cracked race slab kept its fee');
  assert.equal((await submit('me5-87', false, 'grade-000002')).status, 404, 'only the reverse copy is left');
  assert.equal(coinsOf('host'), coins);
  const r = await submit('me5-87', true, 'grade-000002');
  assert.equal(r.status, 200, JSON.stringify(r));
  slabB = r.slab;
  assert.equal(slabB.reverse, true); assert.equal(slabB.id, 3); assert.equal(slabB.cert, 'RIP-0000003');
  assert.equal(cardsRow('host', 'me5-87'), null, 'the row is dropped at zero');
  assert.equal(r.save.collection['me5-87'], undefined); assert.equal(r.save.reverses['me5-87'], undefined);
  assert.equal(r.save.graded.length, 2); assert.equal(ownedMap(r.save)['me5-87'], 2);
  assert.equal(coinsOf('host'), money(coins - 5.41));
  assert.equal(db.prepare('SELECT reverse FROM graded_cards WHERE id = 3').get().reverse, 1);
});
await check('GET /api/grading lists active slabs newest first with rulesVersion', async () => {
  const r = await api('/api/grading');
  assert.equal(r.status, 200);
  assert.deepEqual(r.slabs.map((s) => s.id), [3, 1]); assert.deepEqual(r.guards, { owned: {}, equipped: {} }); assert.equal(r.rulesVersion, GRADING_RULES_VERSION);
  assert.deepEqual((await api('/api/grading', 'GET', undefined, 'poor')).slabs, [], 'another player sees their own');
});
await check('achievements still count a graded copy (first-hit with the only hit card in a slab)', async () => {
  const hit = me5.find((c) => HIT_RARITIES.has(c.rarity) && c.market > 0);
  assert.ok(hit, 'me5 has a hit-rarity card');
  give('ace', hit.id, 1);
  assert.equal((await api('/api/achievements/claim', 'POST', { id: 'first-hit' }, 'none')).status, 400, 'no cards, no hit');
  const r = await submit(hit.id, false, 'grade-ace-00001', 'ace');
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.equal(cardsRow('ace', hit.id), null);
  const claim = await api('/api/achievements/claim', 'POST', { id: 'first-hit' }, 'ace');
  assert.equal(claim.status, 200, JSON.stringify(claim));
  assert.ok(claim.save.claimed.includes('first-hit'));
});

// ---- Guards ----------------------------------------------------------------------
await check('guards/buy: validation, 402 without coins, stock and purchase log, idempotent by requestId', async () => {
  assert.equal((await buy('guard-cherry', 0, 'buy-000001')).status, 400);
  assert.equal((await buy('guard-cherry', GRADING_LIMITS.maxGuardQty + 1, 'buy-000001')).status, 400);
  assert.equal((await buy('guard-cherry', 1.5, 'buy-000001')).status, 400);
  assert.equal((await buy('guard-nope', 1, 'buy-000001')).status, 400);
  assert.equal((await buy('guard-cherry', 1, 'x')).status, 400);
  const poor = await buy('guard-onyx', 1, 'buy-poor-00001', 'poor');
  assert.equal(poor.status, 402); assert.equal(coinsOf('poor'), 3);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM user_gear WHERE user_id = 'poor'").get().n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM gear_purchases WHERE user_id = 'poor'").get().n, 0);
  const before = coinsOf('host');
  const cherry = GUARDS.find((g) => g.id === 'guard-cherry');
  const r = await buy('guard-cherry', 2, 'buy-000001');
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.equal(r.save.gear.guards['guard-cherry'], 2); assert.equal(coinsOf('host'), money(before - cherry.price * 2));
  assert.deepEqual(db.prepare("SELECT kind, item_id, qty, cents FROM gear_purchases WHERE user_id = 'host'").all().map(plain), [{ kind: 'guard', item_id: 'guard-cherry', qty: 2, cents: cherry.price * 200 }]);
  const again = await buy('guard-cherry', 2, 'buy-000001');
  assert.equal(again.status, 200); assert.equal(again.save.gear.guards['guard-cherry'], 2); assert.equal(coinsOf('host'), money(before - cherry.price * 2));
  const onyx = await buy('guard-onyx', 1, 'buy-000002');
  assert.equal(onyx.status, 200); assert.deepEqual(onyx.save.gear.guards, { 'guard-cherry': 2, 'guard-onyx': 1 });
  assert.deepEqual((await api('/api/gear')).gear.guards, { 'guard-cherry': 2, 'guard-onyx': 1 }, '/api/gear carries guards too');
  assert.deepEqual((await api('/api/gear')).gear.coins, {}, 'guards are not coins');
  assert.equal((await api('/api/gear/equip', 'POST', { kind: 'guard', id: 'guard-cherry' })).status, 400, 'guards are worn per slab, not equipped');
  assert.deepEqual((await api('/api/grading')).guards, { owned: { 'guard-cherry': 2, 'guard-onyx': 1 }, equipped: {} });
});
await check('guard: equip, swap, remove with stock accounting; refuses beyond stock', async () => {
  assert.equal((await wear(slabA.id, 'guard-nope')).status, 400);
  assert.equal((await wear(999, 'guard-cherry')).status, 404);
  assert.equal((await wear(slabA.id, 'guard-cherry', 'poor')).status, 404, 'not your slab');
  assert.equal((await wear(slabA.id, 'guard-frost')).status, 409, 'none owned');
  let r = await wear(slabA.id, 'guard-cherry');
  assert.equal(r.status, 200, JSON.stringify(r)); assert.equal(r.slab.guard, 'guard-cherry'); assert.equal(r.save.graded.find((s) => s.id === slabA.id).guard, 'guard-cherry');
  assert.equal((await wear(slabB.id, 'guard-cherry')).status, 200, 'second unit');
  give('host', 'me5-90', 1); // a third slab
  const c = await submit('me5-90', false, 'grade-000003'); assert.equal(c.status, 200); slabC = c.slab;
  r = await wear(slabC.id, 'guard-cherry');
  assert.equal(r.status, 409, 'both cherries are worn'); assert.match(r.error, /No free Cherry/);
  assert.deepEqual((await api('/api/grading')).guards, { owned: { 'guard-cherry': 2, 'guard-onyx': 1 }, equipped: { 'guard-cherry': 2 } });
  r = await wear(slabA.id, 'guard-onyx');
  assert.equal(r.status, 200); assert.equal(r.slab.guard, 'guard-onyx', 'swap frees the cherry');
  assert.equal((await wear(slabC.id, 'guard-cherry')).status, 200, 'the freed cherry moves on');
  assert.equal((await wear(slabB.id, 'guard-onyx')).status, 409, 'the only onyx is on slab A');
  assert.equal((await wear(slabA.id, 'guard-onyx')).status, 200, 'wearing it already is a no-op');
  r = await wear(slabB.id, null);
  assert.equal(r.status, 200); assert.equal(r.slab.guard, null);
  assert.deepEqual((await api('/api/grading')).guards, { owned: { 'guard-cherry': 2, 'guard-onyx': 1 }, equipped: { 'guard-cherry': 1, 'guard-onyx': 1 } });
  assert.equal(db.prepare("SELECT qty FROM user_gear WHERE user_id = 'host' AND item_id = 'guard-cherry'").get().qty, 2, 'stock is simply the owned qty');
});

// ---- Crack and sell -------------------------------------------------------------
await check('crack returns the copy, clears the guard, cannot be repeated', async () => {
  assert.equal((await crack(999)).status, 404);
  assert.equal((await crack(slabA.id, 'poor')).status, 404);
  assert.equal((await api('/api/grading/crack', 'POST', { slabId: 'x' })).status, 400);
  const coins = coinsOf('host');
  const r = await crack(slabA.id);
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.deepEqual(cardsRow('host', 'me5-87'), { qty: 1, reverse_qty: 0 }); assert.equal(r.save.collection['me5-87'], 1);
  assert.deepEqual(r.save.graded.map((s) => s.id).sort(), [slabB.id, slabC.id].sort());
  assert.equal(coinsOf('host'), coins, 'no refund');
  const row = db.prepare('SELECT status, guard, closed_at FROM graded_cards WHERE id = ?').get(slabA.id);
  assert.equal(row.status, 'cracked'); assert.equal(row.guard, null); assert.ok(row.closed_at > 0);
  assert.deepEqual((await api('/api/grading')).guards.equipped, { 'guard-cherry': 1 }, 'the onyx is back in stock');
  assert.equal((await wear(slabB.id, 'guard-onyx')).status, 200, 'and can be worn again');
  const again = await crack(slabA.id);
  assert.equal(again.status, 409); assert.deepEqual(cardsRow('host', 'me5-87'), { qty: 1, reverse_qty: 0 });
  assert.equal((await wear(slabA.id, 'guard-cherry')).status, 404, 'a cracked slab wears nothing');
  // Cracking the reverse slab hands the reverse copy back.
  const rb = await crack(slabB.id);
  assert.equal(rb.status, 200); assert.deepEqual(cardsRow('host', 'me5-87'), { qty: 2, reverse_qty: 1 }); assert.equal(rb.save.reverses['me5-87'], 1);
  assert.deepEqual((await api('/api/grading')).guards.equipped, { 'guard-cherry': 1 });
  // A regrade is crack, then submit again with a new fee.
  const re = await submit('me5-87', true, 'grade-000004');
  assert.equal(re.status, 200); assert.equal(re.slab.reverse, true); assert.notEqual(re.slab.id, slabB.id);
});
await check('sell credits gradedValue at the current market, closes the slab, idempotent by requestId', async () => {
  assert.equal((await sell(slabC.id, 'short')).status, 400);
  assert.equal((await sell(999, 'sell-000001')).status, 404);
  assert.equal((await sell(slabC.id, 'sell-000001', 'poor')).status, 404);
  assert.equal((await sell(slabA.id, 'sell-000001')).status, 409, 'a cracked slab is not for sale');
  const coins = coinsOf('host');
  const card = cardById.get('me5-90');
  const want = gradedValue(card, slabC.grade, SET_BY_ID.me5);
  const r = await sell(slabC.id, 'sell-000001');
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.equal(r.sold, want); assert.equal(coinsOf('host'), money(coins + want)); assert.equal(r.save.coins, money(coins + want));
  assert.ok(!r.save.graded.some((s) => s.id === slabC.id));
  const row = plain(db.prepare('SELECT status, guard, sold_cents, sell_request_id FROM graded_cards WHERE id = ?').get(slabC.id));
  assert.deepEqual(row, { status: 'sold', guard: null, sold_cents: Math.round(want * 100), sell_request_id: 'sell-000001' });
  assert.deepEqual((await api('/api/grading')).guards, { owned: { 'guard-cherry': 2, 'guard-onyx': 1 }, equipped: {} }, 'the cherry is back in stock');
  const again = await sell(slabC.id, 'sell-000001');
  assert.equal(again.status, 200); assert.equal(again.sold, want); assert.equal(coinsOf('host'), money(coins + want), 'paid once');
  assert.equal((await sell(slabC.id, 'sell-000002')).status, 409, 'a new attempt on a sold slab is refused');
  assert.equal((await crack(slabC.id)).status, 409, 'a sold slab cannot be cracked');
  assert.equal((await wear(slabC.id, 'guard-cherry')).status, 404);
  assert.equal(cardsRow('host', 'me5-90').qty, 1, 'selling a slab never touches the collection');
});
await check('sell is credited without the coin cap, like other sales', async () => {
  give('host', 'me5-90', 1);
  const r = await submit('me5-90', false, 'grade-000005'); assert.equal(r.status, 200);
  db.prepare('UPDATE profiles SET coins = 1000000 WHERE user_id = ?').run('host');
  const s = await sell(r.slab.id, 'sell-000003');
  assert.equal(s.status, 200); assert.equal(coinsOf('host'), money(1000000 + s.sold)); assert.ok(coinsOf('host') > 1000000);
  db.prepare('UPDATE profiles SET coins = 100 WHERE user_id = ?').run('host');
});
await check('slab limit -> 409 and no charge', async () => {
  give('full', 'me5-1', 1);
  const ins = db.prepare("INSERT INTO graded_cards(user_id, card_id, reverse, grade, band, fee_cents, request_id, status, created_at) VALUES('full','me5-2',0,9,'me',500,?, 'slabbed', ?)");
  for (let i = 0; i < GRADING_LIMITS.maxSlabs; i++) ins.run(`fill-${String(i).padStart(6, '0')}`, now);
  const r = await submit('me5-1', false, 'grade-full-00001', 'full');
  assert.equal(r.status, 409); assert.match(r.error, /400 slabs/);
  assert.equal(coinsOf('full'), 100); assert.deepEqual(cardsRow('full', 'me5-1'), { qty: 1, reverse_qty: 0 });
  db.prepare("DELETE FROM graded_cards WHERE user_id = 'full' AND request_id LIKE 'fill-%'").run();
  assert.equal((await submit('me5-1', false, 'grade-full-00001', 'full')).status, 200, 'room again');
});
// ---- The Graded section of a profile ------------------------------------------
const showSlab = (slabId, shown, user = 'show') => api('/api/grading/show', 'POST', { slabId, shown }, user);
await check('schema: the shown column arrives on demand (0020) and on a fresh DDL database', async () => {
  const cols = db.prepare('PRAGMA table_info(graded_cards)').all().map((c) => c.name);
  assert.ok(cols.includes('shown'), cols.join(','));
  assert.ok(migrationFiles.includes('0020_grading_shown.sql'));
  assert.match(migrationSql('0020_grading_shown.sql'), /ADD COLUMN shown INTEGER NOT NULL DEFAULT 0/);
});
await check('show: pin a slab to the profile, cap at maxShown, unpin, ownership and status checks', async () => {
  addUser('show', 500);
  give('show', 'me5-1', 12); give('show', 'me5-87', 1);
  db.prepare("UPDATE users SET showcase = ?, shown_stats = ? WHERE id = 'show'").run(JSON.stringify([{ id: 'me5-87', reverse: false }]), JSON.stringify(['unique']));
  const ids = [];
  for (let i = 0; i < 10; i++) { const r = await submit('me5-1', false, `show-slab-${String(i).padStart(4, '0')}`, 'show'); assert.equal(r.status, 200, JSON.stringify(r)); ids.push(r.slab.id); assert.equal(r.slab.shown, false); }
  const only = await submit('me5-87', false, 'show-slab-0087', 'show'); assert.equal(only.status, 200);
  assert.equal((await api('/api/grading/show', 'POST', { slabId: 'x', shown: true }, 'show')).status, 400);
  assert.equal((await showSlab(999, true)).status, 404);
  assert.equal((await showSlab(ids[0], true, 'host')).status, 404, 'someone else\'s slab');
  for (let i = 0; i < GRADING_LIMITS.maxShown; i++) { const r = await showSlab(ids[i], true); assert.equal(r.status, 200, JSON.stringify(r)); assert.equal(r.slab.shown, true); }
  const over = await showSlab(ids[8], true);
  assert.equal(over.status, 409); assert.match(over.error, /up to 8 slabs/);
  assert.equal((await showSlab(ids[0], true)).status, 200, 'showing a shown slab again is a no-op');
  const save = (await api('/api/me', 'GET', undefined, 'show')).save;
  assert.equal(save.graded.filter((s) => s.shown).length, GRADING_LIMITS.maxShown);
  const off = await showSlab(ids[0], false);
  assert.equal(off.status, 200); assert.equal(off.slab.shown, false);
  assert.equal((await showSlab(ids[8], true)).status, 200, 'room again');
  assert.equal((await showSlab(ids[9], false)).status, 200, 'unpinning an unpinned slab is a no-op');
});
await check('public profile: shown slabs best grade first with card info; slabbed copies stay owned', async () => {
  const p = await api('/api/u/show', 'GET', undefined, null);
  assert.equal(p.status, 200, JSON.stringify(p));
  assert.equal(p.graded.length, GRADING_LIMITS.maxShown); assert.equal(p.gradedCount, 11);
  const grades = p.graded.map((s) => s.grade);
  assert.deepEqual(grades, [...grades].sort((a, b) => b - a), 'best grade first');
  for (const s of p.graded) { assert.equal(s.name, 'Tropius'); assert.ok(s.image); assert.equal(s.shown, true); assert.equal(s.cardId, 'me5-1'); assert.ok(s.value > 0); }
  assert.deepEqual(p.showcase.map((c) => c.id), ['me5-87'], 'a card whose only copy is in a slab stays pinned');
  assert.equal(p.stats.unique, 2, 'unique counts the slabbed me5-87 and the raw + slabbed me5-1');
  // Cracking or selling a shown slab takes it off the profile.
  const shown = p.graded[0].id;
  assert.equal((await crack(shown, 'show')).status, 200);
  assert.equal(db.prepare('SELECT shown FROM graded_cards WHERE id = ?').get(shown).shown, 0);
  const next = (await api('/api/u/show', 'GET', undefined, null)).graded;
  assert.equal(next.length, GRADING_LIMITS.maxShown - 1); assert.ok(!next.some((s) => s.id === shown));
  const sold = next[0].id;
  assert.equal((await sell(sold, 'sell-show-1', 'show')).status, 200);
  assert.equal(db.prepare('SELECT shown FROM graded_cards WHERE id = ?').get(sold).shown, 0);
  assert.equal((await api('/api/u/show', 'GET', undefined, null)).graded.length, GRADING_LIMITS.maxShown - 2);
  assert.equal((await showSlab(shown, true)).status, 404, 'a cracked slab cannot be shown');
  // Someone with nothing shown gets an empty section, not an error.
  const q = await api('/api/u/poor', 'GET', undefined, null);
  assert.equal(q.status, 200); assert.deepEqual(q.graded, []); assert.equal(q.gradedCount, 0);
});

await check('progress reset drops slabs, guard stock and the purchase log; others keep theirs', async () => {
  assert.ok((await api('/api/me')).save.graded.length > 0);
  const r = await api('/api/me/reset', 'POST');
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.deepEqual(r.save.graded, []); assert.deepEqual(r.save.gear.guards, {});
  assert.equal(slabRows('host').length, 0);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM gear_purchases WHERE user_id = 'host'").get().n, 0);
  assert.equal(slabRows('ace').length, 1);
  assert.deepEqual(await api('/api/grading'), { status: 200, slabs: [], guards: { owned: {}, equipped: {} }, rulesVersion: GRADING_RULES_VERSION });
});

console.log(results.join('\n'));
const passed = results.length - failed;
console.log(`\n${failed ? 'FAIL' : 'PASS'}: ${passed}/${results.length} grading checks passed${failed ? `, ${failed} failed` : ''}.`);
process.exit(failed ? 1 : 0);
