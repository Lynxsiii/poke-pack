/* The casino Upgrader (migration 0028, worker/upgrader.js, js/upgrader-rules.js): the odds, the escrow-free stake, win and loss,
   slabs and their guards, replay, tampering, winnings, the level gate and the economy.
   Runs the real Worker against in-memory SQLite (Node 22+): node scripts/test-upgrader.mjs */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { randomFillSync, createHash } from 'node:crypto';
import { seedLevel } from './lib/level-seed.mjs';
import { createTestDb } from './lib/d1-test-db.mjs';
import worker from '../worker/index.js';
import { resetCasinoSchemaCache } from '../worker/casino.js';
import { ensureUpgraderSchema, resetUpgraderSchemaCache } from '../worker/upgrader.js';
import { resetOrdersSchemaCache } from '../worker/orders.js';
import { UPGRADER_DDL } from '../worker/casino-ddl.js';
import { splitStatements } from './gen-casino-ddl.mjs';
import { UPGRADER_RULES, upgradeChance, chanceText, multiplierText, hasMarketPrice } from '../js/upgrader-rules.js';
import { GATES, GATE_NAMES, gateMessage } from '../js/levels.js';
import { findOffer, sellValue, money } from '../js/catalog.js';
import { gradedValue } from '../js/grading-rules.js';
import { setForCard } from '../worker/grading.js';

const results = [];
let failed = 0;
async function check(name, fn) {
  try { await fn(); results.push(`PASS  ${name}`); }
  catch (err) { failed++; results.push(`FAIL  ${name}\n      ${String(err?.stack || err).split('\n').slice(0, 14).join('\n      ')}`); }
}

// ---- Harness ---------------------------------------------------------------------
// The Worker upgrades a database that only has migrations up to 0013, as production does.
const { db, DB, env: baseEnv, crash } = createTestDb({ upTo: '0013' });
const realNow = Date.now; let now = realNow(); Date.now = () => now;
const migrationSql = file => readFileSync(new URL('../worker/migrations/' + file, import.meta.url), 'utf8');
const names = () => new Set(db.prepare('SELECT name FROM sqlite_master').all().map(r => r.name));
const BEFORE = { upgrades: names().has('upgrades'), vault: names().has('sealed_vault'), graded: names().has('graded_cards'), flips: names().has('coinflips') };

// Test cards injected into me5 so every price is exactly known (market in coins; sellValue = market).
const mk = (n, market, extra = {}) => ({ id: `me5-${n}`, name: `Test ${n}`, number: String(n), rarity: 'Rare Holo', supertype: 'Pokémon', market,
  image: `assets/cards/me5/${n}.webp`, imageSmall: `assets/cards/me5/${n}-sm.webp`, ...extra });
const INJECT = [mk(901, 10), mk(902, 2), mk(903, 0.1), mk(904, 0.05), mk(911, 20), mk(912, 11), mk(913, 1000), mk(914, 150000), mk(915, 10), mk(916, 50, { image: '', imageSmall: '' }), mk(917, 9), mk(920, 95000), mk(921, 95000.01)];
const ASSETS = { fetch: async request => {
  const res = await baseEnv.ASSETS.fetch(request);
  if (new URL(request.url).pathname !== '/data/me5.json' || !res.ok) return res;
  return new Response(JSON.stringify([...(await res.json()), ...INJECT]), { headers: { 'content-type': 'application/json' } });
} };
const env = { ...baseEnv, ASSETS };
const cents = id => Math.round(sellValue(INJECT.find(c => c.id === id)) * 100);
assert.equal(cents('me5-901'), 1000); assert.equal(cents('me5-903'), 10); assert.equal(cents('me5-914'), 15000000);

const addUser = (id, level = 100, coins = 100) => {
  db.prepare('INSERT INTO users(id,name,handle,password_hash,color,created_at,last_played) VALUES(?,?,?,?,?,?,?)').run(id, id, id, 'unused', 'gold', now, now);
  db.prepare('INSERT INTO profiles(user_id,coins,granted,created_at,binder) VALUES(?,?,?,?,?)').run(id, coins, coins, now, '[]');
  db.prepare('INSERT INTO sessions(id,user_id,created_at,expires_at) VALUES(?,?,?,?)').run(id, id, now, now + 864000000);
  if (level != null) seedLevel(db, id, level);
};
const USERS = ['a', 'b', 'c', 'd', 'e', 'f'];
USERS.forEach(id => addUser(id));
let seeded = 0;
const give = (user, card, qty, rev = 0) => {
  db.prepare(`INSERT INTO cards(user_id,card_id,qty,reverse_qty) VALUES(?,?,?,?)
    ON CONFLICT(user_id,card_id) DO UPDATE SET qty = qty + excluded.qty, reverse_qty = reverse_qty + excluded.reverse_qty`).run(user, card, qty, rev);
  seeded += qty;
};
const qtyOf = (user, card) => db.prepare('SELECT qty FROM cards WHERE user_id = ? AND card_id = ?').get(user, card)?.qty || 0;
const totalCards = () => db.prepare('SELECT COALESCE(SUM(qty),0) n FROM cards').get().n;
const coinsOf = user => Math.round(db.prepare('SELECT coins FROM profiles WHERE user_id = ?').get(user).coins * 100);
const vaultOf = (user, set, product) => db.prepare('SELECT * FROM sealed_vault WHERE user_id = ? AND set_id = ? AND product_id = ?').get(user, set, product);
const rows = () => db.prepare('SELECT * FROM upgrades ORDER BY rowid').all();
const row = id => db.prepare('SELECT * FROM upgrades WHERE id = ?').get(id);
const json = text => (text ? JSON.parse(text) : []);

async function api(path, method = 'GET', body, user = 'a', headers = {}) {
  const res = await worker.fetch(new Request('https://poke-pack.rip' + path, { method,
    headers: { 'content-type': 'application/json', origin: 'https://poke-pack.rip', ...(user ? { cookie: `pp_sid=${user}` } : {}), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), env);
  return { status: res.status, ...await res.json() };
}
const rid = () => crypto.randomUUID();

// Forced randomness: the roll is one Uint32. `rig.rolls` is a queue of raw 32-bit draws, consumed by the next requests.
const rig = { rolls: [] };
Object.defineProperty(globalThis.crypto, 'getRandomValues', { configurable: true, writable: true, value(array) {
  if (rig.rolls.length && array instanceof Uint32Array && array.length === 1) { array[0] = rig.rolls.shift(); return array; }
  return randomFillSync(array);
} });

// ---- Fixtures --------------------------------------------------------------------
const up = {
  list: user => api('/api/casino/upgrades', 'GET', undefined, user),
  get: (id, user = 'a') => api(`/api/casino/upgrades/${id}`, 'GET', undefined, user),
  /** POST an upgrade; `roll` is the roll the Worker will draw (a raw draw below 4294000000 maps to itself when under 1,000,000). */
  go: async (user, { cards, slabs, target, roll = 0, ...rest } = {}) => {
    rig.rolls = roll == null ? [] : [].concat(roll);
    const res = await api('/api/casino/upgrades', 'POST', { requestId: rid(), cards, ...(slabs ? { slabs } : {}), target, ...rest }, user);
    if (res.status === 200) assert.equal(rig.rolls.length, 0, 'the roll was drawn');
    rig.rolls = [];
    return res;
  },
};
const card = id => ({ kind: 'card', id });
const sealed = (setId, id) => ({ kind: 'sealed', setId, id });
const winnings = {
  info: (id, user) => api(`/api/casino/winnings/upgrader/${id}`, 'GET', undefined, user),
  sell: (id, user, extra = {}) => api('/api/casino/winnings/sell', 'POST', { source: 'upgrader', id, ...extra }, user),
};

// Values (cents): 901 = 1000, 902 = 200, 903 = 10, 911 = 2000, 912 = 1100, 913 = 100000, 914 = 15,000,000, 915 = 1000, 917 = 900.
for (const u of USERS) { give(u, 'me5-901', 40); give(u, 'me5-902', 40); give(u, 'me5-903', 40); give(u, 'me5-904', 40); }
const SETDATA = JSON.parse(readFileSync(new URL('../data/me5.json', import.meta.url), 'utf8'));
const ETB_OFFER = findOffer(JSON.parse(readFileSync(new URL('../data/sealed.json', import.meta.url), 'utf8')).me5,
  JSON.parse(readFileSync(new URL('../data/products.json', import.meta.url), 'utf8')).me5, 'eliteTrainerBox');
const ETB = Math.round(ETB_OFFER.price * 100);
const slabCardOf = id => SETDATA.find(c => c.id === id);
const slabCents = (cardId, grade) => Math.round(gradedValue(slabCardOf(cardId), grade, setForCard(cardId)) * 100);
let slabSeq = 0;
function mint(user, cardId = 'me5-87', grade = 9, { reverse = 0, guard = null, shown = 0 } = {}) {
  const r = db.prepare(`INSERT INTO graded_cards(user_id, card_id, reverse, grade, band, fee_cents, request_id, guard, status, created_at, shown)
    VALUES(?, ?, ?, ?, 'me', 541, ?, ?, 'slabbed', ?, ?)`).run(user, cardId, reverse, grade, `mint-${user}-${++slabSeq}`, guard, now, shown);
  return Number(r.lastInsertRowid);
}
const slab = id => ({ ...db.prepare('SELECT * FROM graded_cards WHERE id = ?').get(id) });
const gear = (user, guardId, qty) => db.prepare("INSERT INTO user_gear(user_id, kind, item_id, qty, first_at, last_at) VALUES(?, 'guard', ?, ?, ?, ?) ON CONFLICT(user_id, kind, item_id) DO UPDATE SET qty = excluded.qty")
  .run(user, guardId, qty, now, now);
const gearRowQty = (user, id) => db.prepare("SELECT qty FROM user_gear WHERE user_id = ? AND kind = 'guard' AND item_id = ?").get(user, id)?.qty;
const dump = () => createHash('sha1').update(JSON.stringify(['cards', 'graded_cards', 'upgrades', 'sealed_vault', 'user_gear', 'casino_sales', 'coinflips']
  .map(t => db.prepare(`SELECT * FROM ${t}`).all()).concat([db.prepare('SELECT user_id, coins, binder FROM profiles ORDER BY user_id').all()]))).digest('hex');
const expectedChance = (stake, target) => Math.min(800000, Math.floor(stake * 950000 / target));
const wonCards = () => db.prepare("SELECT COUNT(*) n FROM upgrades WHERE won = 1 AND target_kind = 'card'").get().n;
const stakedCards = () => rows().reduce((n, r) => n + json(r.stake).reduce((m, s) => m + s.qty, 0), 0);
let soldWinnings = 0;
/** Cards are conserved: what is in `cards` is what was seeded, minus every stake, plus every won card, minus what winnings sold. */
const audit = (label = '') => {
  assert.equal(totalCards(), seeded - stakedCards() + wonCards() - soldWinnings, `${label}: cards in + target == cards out`);
  for (const r of rows()) for (const s of json(r.slabs)) {
    const g = slab(s.id);
    assert.equal(g.status, 'sold', `${label}: slab ${s.id} closed`); assert.equal(g.sold_cents, 0); assert.equal(g.locked, null); assert.equal(g.guard, null); assert.equal(g.shown, 0);
    assert.equal(g.sell_request_id, `casino:upgrader:${r.id}`);
  }
};

// ---- Schema ------------------------------------------------------------------------
await check('schema: a database with migrations up to 0013 has no upgrades table, no slabs, no vault; the first request creates them', async () => {
  assert.deepEqual(BEFORE, { upgrades: false, vault: false, graded: false, flips: false });
  const res = await up.list(null);
  assert.equal(res.status, 200, JSON.stringify(res));
  const have = names();
  for (const n of ['upgrades', 'upgrades_recent', 'upgrades_user', 'upgrade_check', 'upgrade_take', 'upgrade_final', 'sealed_vault', 'graded_cards', 'coinflips', 'graded_slab_escrow']) assert.ok(have.has(n), n);
});
await check('schema: the generated DDL is the migration, and a second isolate finds everything and runs no batch', async () => {
  assert.deepEqual(splitStatements(migrationSql('0028_casino_upgrader.sql')), UPGRADER_DDL, 'worker/casino-ddl.js is stale: run node scripts/gen-casino-ddl.mjs');
  assert.deepEqual(UPGRADER_DDL.filter(s => /^CREATE TRIGGER/.test(s)).map(s => s.match(/^CREATE TRIGGER IF NOT EXISTS (\w+)/)[1]), ['upgrade_check', 'upgrade_take', 'upgrade_final']);
  assert.ok(UPGRADER_DDL.every(s => /IF NOT EXISTS/.test(s)), 'additive and re-runnable');
  const batches = DB.stats.batches;
  resetUpgraderSchemaCache(); resetCasinoSchemaCache(); resetOrdersSchemaCache();
  await ensureUpgraderSchema(env);
  assert.equal(DB.stats.batches, batches, 'a current database is read, not rewritten');
});
await check('schema: where 0028 was applied by file (every migration) the Worker finds it and adds nothing', async () => {
  const file = createTestDb(); // every migration, 0028 included
  const fileEnv = { ...file.env };
  resetUpgraderSchemaCache(); resetCasinoSchemaCache(); resetOrdersSchemaCache();
  const before = file.DB.stats.batches;
  await ensureUpgraderSchema(fileEnv);
  assert.equal(file.DB.stats.batches, before, 'no DDL batch ran');
  const sql = d => Object.fromEntries(d.prepare("SELECT name, sql FROM sqlite_master WHERE name LIKE 'upgrade%'").all().map(r => [r.name, r.sql.replace(/\s+/g, ' ')]));
  assert.deepEqual(sql(file.db), sql(db), 'the file and the lazily applied DDL are the same objects');
  assert.equal(Object.keys(sql(db)).length, 6);
  resetUpgraderSchemaCache(); resetCasinoSchemaCache(); resetOrdersSchemaCache();
});

await api('/api/grading', 'GET', undefined, 'a'); // gear tables
await api('/api/casino/winnings/coinflip/none', 'GET', undefined, 'a'); // casino_sales

// ---- The rules ---------------------------------------------------------------------
await check('rules: upgradeChance is floor(stake * 950000 / target), capped at 80%, 0 when the target is not above the stake', () => {
  assert.equal(upgradeChance(1000, 2000), 475000);
  assert.equal(upgradeChance(100, 440), 215909);
  assert.equal(upgradeChance(1000, 1100), 800000, 'capped');
  assert.equal(upgradeChance(1000, 1187), 800000); assert.equal(upgradeChance(1000, 1188), 799663);
  assert.equal(upgradeChance(1000, 1000), 0); assert.equal(upgradeChance(1000, 900), 0); assert.equal(upgradeChance(0, 900), 0);
  assert.equal(upgradeChance(1000, 100000), 9500); assert.equal(upgradeChance(10, 15000000), 0); assert.equal(upgradeChance(10, 9500000), 1);
  assert.equal(upgradeChance(10, 9500001), 0, 'under one in a million is zero');
  assert.equal(upgradeChance(4e9, 4.2e9), 800000); assert.equal(upgradeChance(4e9, 9e9), 422222, 'big stakes stay exact (BigInt)');
  assert.equal(upgradeChance(12345678901, 98765432109), Number(12345678901n * 950000n / 98765432109n));
  for (let i = 0; i < 2000; i++) {
    const s = 1 + Math.floor(Math.random() * 1e7); const t = s + 1 + Math.floor(Math.random() * 1e9);
    assert.equal(upgradeChance(s, t), expectedChance(s, t));
    assert.ok(upgradeChance(s, t) * t <= s * 950000, 'the expected value never beats 95% of the stake');
  }
  assert.deepEqual(UPGRADER_RULES, { minCents: 10, maxCards: 100, maxCopies: 100000, maxQty: 9999, maxSlabs: 10, edgeMillionths: 50000, maxChance: 800000, minChance: 1 });
});
await check('rules: chanceText and multiplierText', () => {
  assert.equal(chanceText(216000), '21.6%'); assert.equal(chanceText(300), '0.03%'); assert.equal(chanceText(800000), '80%');
  assert.equal(chanceText(475000), '47.5%'); assert.equal(chanceText(9500), '0.95%'); assert.equal(chanceText(1), '0.0001%'); assert.equal(chanceText(0), '0%');
  assert.equal(chanceText(799663), '79.97%', 'under the cap never reads as the cap'); assert.equal(chanceText(799999), '79.99%'); assert.equal(chanceText(799500), '79.95%');
  assert.equal(chanceText(40), '0.004%'); assert.equal(chanceText(99), '0.0099%'); assert.equal(chanceText(100), '0.01%'); assert.equal(chanceText(800001), '80%', 'the cap is the cap');
  for (let m = 1; m <= 800000; m += 997) { const t = chanceText(m); assert.ok(t !== '0%' && (t !== '80%' || m === 800000), `${m} -> ${t}`); }
  assert.ok(hasMarketPrice({ market: 0.01 }) && !hasMarketPrice({ market: 0 }) && !hasMarketPrice({}) && !hasMarketPrice({ market: '5' }) && !hasMarketPrice(null));
  assert.equal(multiplierText(100, 440), '4.4x'); assert.equal(multiplierText(1000, 2000), '2x'); assert.equal(multiplierText(100, 105), '1.05x');
  assert.equal(multiplierText(10, 123456), '12,346x'); assert.equal(multiplierText(1000, 1004), '1.0x'); assert.equal(multiplierText(0, 5), '—');
});

// ---- Refusals ----------------------------------------------------------------------
await check('refused: the request itself (id, origin, JSON, session, body, stake)', async () => {
  const frozen = dump();
  const post = (body, user = 'a', headers) => api('/api/casino/upgrades', 'POST', body, user, headers);
  const ok = { requestId: rid(), cards: [{ id: 'me5-901', qty: 1 }], target: card('me5-911') };
  assert.equal((await post({ ...ok, requestId: 'short' })).status, 400);
  assert.equal((await post({ ...ok, requestId: undefined })).status, 400);
  assert.equal((await post(ok, null)).status, 401);
  assert.equal((await post(ok, 'a', { origin: 'https://evil.example' })).status, 403);
  assert.equal((await post(ok, 'a', { 'content-type': 'text/plain' })).status, 400);
  assert.equal((await post({ requestId: rid(), target: card('me5-911') })).status, 400);
  assert.equal((await post({ ...ok, cards: [] })).status, 400, 'no cards and no slabs');
  assert.equal((await post({ ...ok, cards: [{ id: 'me5-901', qty: 0 }] })).status, 400);
  assert.equal((await post({ ...ok, cards: [{ id: 'me5-901', qty: 1 }, { id: 'me5-901', qty: 1 }] })).status, 400, 'one row per card');
  const many = await post({ ...ok, cards: [{ id: 'me5-901', qty: 41 }] }); assert.equal(many.status, 409); assert.match(many.error, /only have 40/);
  const tiny = await post({ ...ok, cards: [{ id: 'me5-904', qty: 1 }] }); assert.equal(tiny.status, 400); assert.match(tiny.error, /at least 0\.1 coins/, 'below the 10 cent minimum');
  assert.equal((await post({ ...ok, cards: [{ id: 'me5-700', qty: 1 }] })).status, 409, 'a card you do not have');
  assert.equal((await post({ ...ok, slabs: [999] })).status, 409, 'a slab that is not yours');
  assert.equal((await post({ ...ok, slabs: 'x' })).status, 400);
  assert.equal(dump(), frozen, 'nothing moved');
  assert.equal((await api('/api/casino/upgrades/x/join', 'POST', {}, 'a')).status, 404);
  assert.equal((await api('/api/casino/upgrades', 'DELETE', undefined, 'a')).status, 404);
});
await check('refused: the target (missing, unknown, not worth more, no image, too far away, sealed that cannot be bought)', async () => {
  const frozen = dump();
  const cards = [{ id: 'me5-901', qty: 1 }];
  const go = (target, extra = {}) => up.go('a', { cards, target, roll: null, ...extra });
  for (const target of [undefined, null, {}, { kind: 'pack', id: 'me5-911' }, card(''), card('me5-9999'), card('nope-1'), { kind: 'card' }, { kind: 'sealed', id: 'eliteTrainerBox' }]) {
    const res = await go(target); assert.equal(res.status, 400, JSON.stringify(target) + JSON.stringify(res));
  }
  assert.equal((await go(card('me5-916'))).status, 400, 'a card without a picture');
  // A card priced only by the rarity fallback is no target (it can still be staked: it sells at the fallback either way).
  for (const id of ['energy-grass', 'me55-B', 'me55-G', 'me55-cc4']) {
    const res = await go(card(id)); assert.equal(res.status, 400, id + JSON.stringify(res)); assert.equal(res.error, 'That card has no market price to upgrade to.', id);
  }
  const same = await go(card('me5-915')); assert.equal(same.status, 400); assert.equal(same.error, 'Pick a target worth more than your stake.', 'equal is not more');
  const below = await go(card('me5-917')); assert.equal(below.status, 400); assert.equal(below.error, 'Pick a target worth more than your stake.');
  const ownCard = await go(card('me5-901')); assert.equal(ownCard.status, 400, 'the card you stake is not worth more than itself');
  const far = await up.go('a', { cards: [{ id: 'me5-903', qty: 1 }], target: card('me5-914'), roll: null });
  assert.equal(far.status, 400); assert.equal(far.error, 'That target is too far away for this stake.');
  assert.equal((await go(sealed('nosuch', 'eliteTrainerBox'))).status, 400); assert.equal((await go(sealed('me5', 'nosuchbox'))).status, 400);
  assert.equal((await go(sealed('', 'eliteTrainerBox'))).status, 400);
  const event = await go(sealed('smp', 'event-smp004'), { cards: [{ id: 'me5-901', qty: 1 }] }); // a promo sold as one card: no sealed target
  assert.equal(event.status, 400, JSON.stringify(event));
  assert.equal(dump(), frozen, 'nothing moved');
});
await check('a fallback-priced card may be staked (it sells at the fallback either way), just not won', async () => {
  addUser('fb'); give('fb', 'energy-grass', 4); // 4 x 0.05 = 20 cents
  const res = await up.go('fb', { cards: [{ id: 'energy-grass', qty: 4 }], target: card('me5-911'), roll: 999999 });
  assert.equal(res.status, 200, JSON.stringify(res)); assert.equal(res.upgrade.stakeValue, 0.2); assert.equal(qtyOf('fb', 'energy-grass'), 0);
  audit('after an energy stake');
});
await check('the odds: the exact edge case where chance would be 1 in a million works, one more cent refuses', async () => {
  const lone = 'edge'; addUser(lone); give(lone, 'me5-903', 3);
  // 10 cents of cards vs a target of exactly 9,500,000 cents (chance 1) and one of 9,500,001 (chance 0).
  const ok = await up.go(lone, { cards: [{ id: 'me5-903', qty: 1 }], target: card('me5-920'), roll: 5 });
  assert.equal(ok.status, 200, JSON.stringify(ok)); assert.equal(ok.upgrade.chance, 1); assert.equal(ok.upgrade.won, false);
  const over = await up.go(lone, { cards: [{ id: 'me5-903', qty: 1 }], target: card('me5-921'), roll: null });
  assert.equal(over.status, 400); assert.match(over.error, /too far away/);
});

// ---- Winning and losing --------------------------------------------------------------
let win; let loss;
await check('a loss: the cards are gone, nothing comes back, coins do not move, the row records chance and roll', async () => {
  const before = { cards: qtyOf('b', 'me5-901'), target: qtyOf('b', 'me5-911'), coins: coinsOf('b') };
  const res = await up.go('b', { cards: [{ id: 'me5-901', qty: 1 }], target: card('me5-911'), roll: 475000 }); // chance 475000: a roll equal to it loses
  assert.equal(res.status, 200, JSON.stringify(res));
  loss = res.upgrade;
  assert.equal(loss.chance, 475000); assert.equal(loss.roll, 475000); assert.equal(loss.won, false); assert.equal(loss.stakeValue, 10); assert.equal(loss.targetValue, 20);
  assert.equal(qtyOf('b', 'me5-901'), before.cards - 1); assert.equal(qtyOf('b', 'me5-911'), before.target); assert.equal(coinsOf('b'), before.coins);
  assert.ok(res.save && res.save.collection, 'answers with a fresh save'); assert.equal(typeof res.serverNow, 'number');
  const saved = row(loss.id);
  assert.equal(saved.stake_value, 1000); assert.equal(saved.target_value, 2000); assert.equal(saved.chance, 475000); assert.equal(saved.roll, 475000); assert.equal(saved.won, 0);
  assert.equal(saved.target_kind, 'card'); assert.equal(saved.target_id, 'me5-911'); assert.equal(saved.target_set, null); assert.equal(saved.slabs, null);
  assert.equal(saved.created_at, now); assert.equal(db.prepare('SELECT last_played FROM users WHERE id = ?').get('b').last_played, now);
  audit('after a loss');
});
await check('a win: the stake is gone and one plain copy of the target arrives (roll just under the chance)', async () => {
  const before = { cards: qtyOf('b', 'me5-901'), coins: coinsOf('b') };
  const res = await up.go('b', { cards: [{ id: 'me5-901', qty: 2 }], target: card('me5-911'), roll: null });
  assert.equal(res.status, 400, 'two copies are worth the target, not more');
  assert.equal(qtyOf('b', 'me5-901'), before.cards);
  const win1 = await up.go('b', { cards: [{ id: 'me5-901', qty: 1 }], target: card('me5-911'), roll: 474999 });
  assert.equal(win1.status, 200, JSON.stringify(win1)); win = win1.upgrade;
  assert.equal(win.won, true); assert.equal(win.roll, 474999);
  assert.equal(qtyOf('b', 'me5-901'), before.cards - 1); assert.equal(qtyOf('b', 'me5-911'), 1);
  const copy = db.prepare('SELECT * FROM cards WHERE user_id = ? AND card_id = ?').get('b', 'me5-911');
  assert.equal(copy.reverse_qty, 0, 'a plain copy'); assert.equal(coinsOf('b'), before.coins, 'no coins move');
  // A second win of the same card stacks.
  const again = await up.go('b', { cards: [{ id: 'me5-901', qty: 1 }], target: card('me5-911'), roll: 0 });
  assert.equal(again.upgrade.won, true); assert.equal(qtyOf('b', 'me5-911'), 2);
  audit('after wins');
});
await check('boundaries: roll 0 wins, chance - 1 wins, chance loses, 999999 loses; the 80% cap holds', async () => {
  const cap = await up.go('c', { cards: [{ id: 'me5-901', qty: 1 }], target: card('me5-912'), roll: 799999 });
  assert.equal(cap.upgrade.chance, 800000, '1000 vs 1100 is 86%, capped at 80%'); assert.equal(cap.upgrade.won, true);
  const capLoss = await up.go('c', { cards: [{ id: 'me5-901', qty: 1 }], target: card('me5-912'), roll: 800000 });
  assert.equal(capLoss.upgrade.won, false, 'a roll of 800000 is outside an 80% chance');
  const last = await up.go('c', { cards: [{ id: 'me5-901', qty: 1 }], target: card('me5-912'), roll: 999999 });
  assert.equal(last.upgrade.won, false); assert.equal(last.upgrade.roll, 999999);
  const long = await up.go('c', { cards: [{ id: 'me5-901', qty: 1 }], target: card('me5-913'), roll: 9499 });
  assert.equal(long.upgrade.chance, 9500); assert.equal(long.upgrade.won, true, '0.95% and the roll is 9499');
  audit('after boundaries');
});
await check('the roll: rejection sampling redraws biased draws, then takes the remainder', async () => {
  const draw = async raw => { const r = await up.go('d', { cards: [{ id: 'me5-901', qty: 1 }], target: card('me5-911'), roll: raw }); assert.equal(r.status, 200, JSON.stringify(r)); return r.upgrade.roll; };
  assert.equal(await draw([4294000000, 4294967295, 777777]), 777777, 'two biased draws are thrown away');
  assert.equal(await draw(4293999999), 999999, '4,293,999,999 is the last accepted draw');
  assert.equal(await draw(4293999999 - 123456), (4293999999 - 123456) % 1000000);
  assert.equal(await draw(1000000), 0); assert.equal(await draw(2000123), 123);
});
await check('the roll is uniform enough: 300 real draws land across the whole range', async () => {
  const stakeUser = 'dice'; addUser(stakeUser); give(stakeUser, 'me5-903', 3000);
  let wins = 0; let high = 0; let low = 0;
  for (let i = 0; i < 300; i++) {
    const r = await api('/api/casino/upgrades', 'POST', { requestId: rid(), cards: [{ id: 'me5-903', qty: 10 }], target: card('me5-912') }, stakeUser);
    assert.equal(r.status, 200, JSON.stringify(r));
    if (r.upgrade.won) wins++;
    if (r.upgrade.roll >= 500000) high++; else low++;
  }
  // 100 cents against 1100 is a 8.6% chance: about 26 wins in 300.
  assert.ok(wins >= 5 && wins <= 60, `wins ${wins}`); assert.ok(high > 90 && low > 90, `${low}/${high}`);
  audit('after dice');
});
await check('the odds of a real roll match the chance over many runs (no bias in the won flag)', () => {
  const all = rows(); assert.ok(all.length > 300);
  for (const r of all) assert.equal(r.won, r.roll < r.chance ? 1 : 0);
  for (const r of all) assert.equal(r.chance, expectedChance(r.stake_value, r.target_value));
});

// ---- expectedChance ------------------------------------------------------------------
await check('expectedChance: a mismatch is a 409 with the real chance and moves nothing; a match goes through', async () => {
  const frozen = dump();
  const stale = await up.go('e', { cards: [{ id: 'me5-901', qty: 1 }], target: card('me5-911'), roll: null, expectedChance: 480000 });
  assert.equal(stale.status, 409); assert.equal(stale.error, 'The odds changed. Look again.'); assert.equal(stale.chance, 475000);
  assert.equal(dump(), frozen);
  for (const bad of ['x', -1, 1.5, 0, 800001, null === 1]) {
    const r = await up.go('e', { cards: [{ id: 'me5-901', qty: 1 }], target: card('me5-911'), roll: null, expectedChance: bad });
    assert.ok(r.status === 400 || r.status === 409, `${bad} -> ${r.status}`);
  }
  const fine = await up.go('e', { cards: [{ id: 'me5-901', qty: 1 }], target: card('me5-911'), roll: 7, expectedChance: 475000 });
  assert.equal(fine.status, 200); assert.equal(fine.upgrade.chance, 475000);
});

// ---- Replay and races ------------------------------------------------------------------
await check('replay: the same requestId answers with the same row and moves nothing, even with a different body', async () => {
  const requestId = rid(); rig.rolls = [100];
  const body = { requestId, cards: [{ id: 'me5-901', qty: 1 }], target: card('me5-911') };
  const first = await api('/api/casino/upgrades', 'POST', body, 'e'); assert.equal(first.status, 200);
  const frozen = dump(); const n = rows().length;
  const second = await api('/api/casino/upgrades', 'POST', body, 'e');
  assert.equal(second.status, 200); assert.equal(second.upgrade.id, first.upgrade.id); assert.equal(second.upgrade.roll, first.upgrade.roll);
  const other = await api('/api/casino/upgrades', 'POST', { ...body, cards: [{ id: 'me5-902', qty: 3 }], target: card('me5-913') }, 'e');
  assert.equal(other.upgrade.id, first.upgrade.id, 'a retry is the first request, whatever it carries');
  assert.equal(dump(), frozen); assert.equal(rows().length, n);
  const mine = await api('/api/casino/upgrades', 'POST', body, 'f'); // another player's same requestId is their own upgrade
  assert.equal(mine.status, 200); assert.notEqual(mine.upgrade.id, first.upgrade.id);
  assert.equal(rows().filter(r => r.request_id === requestId).length, 2);
  audit('after replay');
});
await check('replay: a batch that committed and then threw (a lost answer) is answered from the row, not a 500', async () => {
  const requestId = rid(); rig.rolls = [5];
  crash.after(/INSERT INTO upgrades/, { dies: false });
  const res = await api('/api/casino/upgrades', 'POST', { requestId, cards: [{ id: 'me5-901', qty: 1 }], target: card('me5-911') }, 'f');
  assert.equal(res.status, 200, JSON.stringify(res)); assert.equal(res.upgrade.won, true);
  assert.equal(rows().filter(r => r.user_id === 'f' && r.request_id === requestId).length, 1);
  assert.equal(crash.pending, 0); audit('after a lost answer');
});
await check('race: two requests with one requestId at once settle one upgrade; the loser of the UNIQUE race answers with the winner row', async () => {
  const requestId = rid(); const n = rows().length; const cardsBefore = qtyOf('f', 'me5-901');
  rig.rolls = [11, 22];
  const body = { requestId, cards: [{ id: 'me5-901', qty: 1 }], target: card('me5-911') };
  const [x, y] = await Promise.all([api('/api/casino/upgrades', 'POST', body, 'f'), api('/api/casino/upgrades', 'POST', body, 'f')]);
  rig.rolls = [];
  assert.equal(x.status, 200); assert.equal(y.status, 200); assert.equal(x.upgrade.id, y.upgrade.id); assert.equal(rows().length, n + 1);
  assert.equal(qtyOf('f', 'me5-901'), cardsBefore - 1, 'the stake was taken once');
  // And explicitly: another request lands its row between this one's read and its batch.
  const rid2 = rid(); const m = rows().length; const cards2 = qtyOf('f', 'me5-901');
  crash.tamper(/INSERT INTO upgrades/, d => {
    d.prepare(`INSERT INTO upgrades(id, user_id, request_id, stake, slabs, stake_value, target_kind, target_id, target_set, target, target_value, chance, roll, won, created_at)
      VALUES('raced', 'f', ?, ?, NULL, 1000, 'card', 'me5-911', NULL, '{"name":"x"}', 2000, 475000, 900000, 0, ?)`)
      .run(rid2, JSON.stringify([{ id: 'me5-901', name: 'x', number: '901', rarity: 'r', image: 'i', small: 's', qty: 1, rev: 0, v: 1000 }]), now);
  });
  rig.rolls = [1];
  const lost = await api('/api/casino/upgrades', 'POST', { requestId: rid2, cards: [{ id: 'me5-901', qty: 1 }], target: card('me5-911') }, 'f');
  rig.rolls = [];
  assert.equal(lost.status, 200, JSON.stringify(lost)); assert.equal(lost.upgrade.id, 'raced'); assert.equal(rows().length, m + 1);
  assert.equal(qtyOf('f', 'me5-901'), cards2 - 1, 'only the raced row took the stake');
  audit('after a race');
});
await check('atomic: cards that vanish between the Worker\'s read and its batch refuse the upgrade whole (409, nothing written)', async () => {
  const keep = 'gone'; addUser(keep); give(keep, 'me5-901', 2);
  const frozen = dump(); const before = db.prepare('SELECT binder FROM profiles WHERE user_id = ?').get(keep);
  crash.tamper(/INSERT INTO upgrades/, d => d.prepare("UPDATE cards SET qty = 0 WHERE user_id = ? AND card_id = 'me5-901'").run(keep));
  rig.rolls = [1];
  const res = await api('/api/casino/upgrades', 'POST', { requestId: rid(), cards: [{ id: 'me5-901', qty: 2 }], target: card('me5-913') }, keep);
  rig.rolls = [];
  assert.equal(res.status, 409, JSON.stringify(res)); assert.match(res.error, /no longer have those cards/);
  assert.equal(rows().filter(r => r.user_id === keep).length, 0);
  assert.equal(db.prepare('SELECT binder FROM profiles WHERE user_id = ?').get(keep).binder, before.binder);
  db.prepare("UPDATE cards SET qty = 2 WHERE user_id = ? AND card_id = 'me5-901'").run(keep); // put the tampered cards back for the ledger
  assert.equal(dump(), frozen, 'the upgrade added nothing on top of the tamper');
  audit('after a refused batch');
});

// ---- Slabs and guards --------------------------------------------------------------------
await check('slabs: a slab-only stake closes win or lose (sold, 0 cents, upgrader marker, guard stripped) and the guard unit stays free', async () => {
  const s1 = mint('a', 'me5-87', 9, { guard: 'guard-onyx', shown: 1 }); const s2 = mint('a', 'me5-87', 10, { guard: 'guard-onyx' }); const s3 = mint('a', 'me5-98', 9);
  gear('a', 'guard-onyx', 2);
  const guards = async () => (await api('/api/grading', 'GET', undefined, 'a')).guards;
  assert.deepEqual(await guards(), { owned: { 'guard-onyx': 2 }, equipped: { 'guard-onyx': 2 } }, 'two units worn, none free');
  const rowsBefore = db.prepare('SELECT COUNT(*) n FROM graded_cards').get().n;
  const lostRes = await up.go('a', { slabs: [s1], target: card('me5-913'), roll: 999999 });
  assert.equal(lostRes.status, 200, JSON.stringify(lostRes)); const v1 = slabCents('me5-87', 9);
  assert.equal(lostRes.upgrade.stakeValue, money(v1 / 100)); assert.equal(lostRes.upgrade.chance, expectedChance(v1, 100000)); assert.equal(lostRes.upgrade.slabs.length, 1);
  assert.equal(lostRes.upgrade.slabs[0].id, s1); assert.equal(lostRes.upgrade.slabs[0].grade, 9); assert.equal(lostRes.upgrade.slabs[0].guard, 'guard-onyx'); assert.deepEqual(lostRes.upgrade.stake, []);
  let g = slab(s1);
  assert.equal(g.status, 'sold'); assert.equal(g.sold_cents, 0); assert.equal(g.guard, null); assert.equal(g.shown, 0); assert.equal(g.locked, null);
  assert.equal(g.sell_request_id, `casino:upgrader:${lostRes.upgrade.id}`); assert.equal(g.closed_at, now); assert.equal(g.user_id, 'a');
  assert.deepEqual(await guards(), { owned: { 'guard-onyx': 2 }, equipped: { 'guard-onyx': 1 } }, 'the guard unit stays with the player as free stock');
  assert.equal(gearRowQty('a', 'guard-onyx'), 2);
  const wonRes = await up.go('a', { slabs: [s2], target: card('me5-913'), roll: 0 });
  assert.equal(wonRes.upgrade.won, true); assert.equal(slab(s2).status, 'sold'); assert.equal(slab(s2).sell_request_id, `casino:upgrader:${wonRes.upgrade.id}`); assert.equal(slab(s2).guard, null);
  assert.equal(qtyOf('a', 'me5-913'), 1, 'a won card arrives as a plain copy');
  assert.deepEqual(await guards(), { owned: { 'guard-onyx': 2 }, equipped: {} }, 'both guard units are free');
  assert.equal(slab(s3).status, 'slabbed', 'an untouched slab stays slabbed');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM graded_cards').get().n, rowsBefore, 'no slab created or deleted');
  // A closed slab cannot be put up again, and it is no longer in the save's slabs.
  const again = await up.go('a', { slabs: [s1], target: card('me5-913'), roll: null }); assert.equal(again.status, 409); assert.match(again.error, /no longer have those slabs/);
  assert.ok(!(await api('/api/grading', 'GET', undefined, 'a')).slabs.some(s => s.id === s1 || s.id === s2));
  audit('after slabs');
});
await check('slabs: cards and slabs together are one stake (value is the sum), refused when a slab is in a game, not yours, or past ten', async () => {
  const mixed = mint('b', 'me5-87', 9); const mixed2 = mint('b', 'me5-98', 10);
  const total = 3 * 1000 + slabCents('me5-87', 9) + slabCents('me5-98', 10);
  const before = qtyOf('b', 'me5-901');
  const res = await up.go('b', { cards: [{ id: 'me5-901', qty: 3 }], slabs: [mixed, mixed2], target: card('me5-913'), roll: 123 });
  assert.equal(res.status, 200, JSON.stringify(res)); assert.equal(res.upgrade.stakeValue, money(total / 100));
  assert.equal(res.upgrade.chance, expectedChance(total, 100000)); assert.equal(qtyOf('b', 'me5-901'), before - 3);
  assert.equal(row(res.upgrade.id).stake_value, total); audit('after a mixed stake');
  const frozen = dump();
  const own = mint('b', 'me5-87', 9); const theirs = mint('c', 'me5-87', 9); const locked = mint('b', 'me5-87', 9);
  db.prepare("UPDATE graded_cards SET locked = 'coinflip:zzz' WHERE id = ?").run(locked);
  for (const bad of [[theirs], [locked], [own, own], [own, 'x'], [0], [-3], [1.5]]) {
    const r = await up.go('b', { slabs: bad, target: card('me5-913'), roll: null }); assert.ok(r.status === 400 || r.status === 409, `${JSON.stringify(bad)} -> ${r.status}`);
  }
  const eleven = Array.from({ length: 11 }, () => mint('b', 'me5-87', 9));
  const past = await up.go('b', { slabs: eleven, target: card('me5-913'), roll: null }); assert.equal(past.status, 400); assert.match(past.error, /at most 10 slabs/);
  const ten = await up.go('b', { slabs: eleven.slice(0, 10), target: card('me5-913'), roll: 999 }); assert.equal(ten.status, 200, JSON.stringify(ten)); assert.equal(ten.upgrade.slabs.length, 10);
  assert.equal(slab(own).status, 'slabbed'); assert.equal(slab(locked).locked, 'coinflip:zzz'); assert.equal(slab(theirs).user_id, 'c');
  audit('after ten slabs'); assert.notEqual(dump(), frozen);
});
await check('slabs: a slab that is in an open coinflip cannot be upgraded away', async () => {
  const s = mint('c', 'me5-87', 9); const flip = await api('/api/casino/coinflips', 'POST', { requestId: rid(), slabs: [s] }, 'c');
  assert.equal(flip.status, 200, JSON.stringify(flip)); assert.equal(slab(s).locked, `coinflip:${flip.flip.id}`);
  const r = await up.go('c', { slabs: [s], target: card('me5-913'), roll: null }); assert.equal(r.status, 409);
  assert.equal((await api(`/api/casino/coinflips/${flip.flip.id}/cancel`, 'POST', {}, 'c')).status, 200);
  assert.equal(slab(s).locked, null);
  assert.equal((await up.go('c', { slabs: [s], target: card('me5-913'), roll: 1 })).status, 200);
});

// ---- Binder ---------------------------------------------------------------------------------
await check('binder: a staked card that leaves the collection leaves its slot, a won card keeps the slot of a card you still own', async () => {
  addUser('binder'); give('binder', 'me5-903', 1); give('binder', 'me5-902', 1);
  db.prepare('UPDATE profiles SET binder = ? WHERE user_id = ?').run(JSON.stringify(Array.from({ length: 45 }, (_, i) => (i === 0 ? { id: 'me5-903', reverse: false } : i === 1 ? { id: 'me5-902', reverse: false } : null))), 'binder');
  const res = await up.go('binder', { cards: [{ id: 'me5-903', qty: 1 }], target: card('me5-902'), roll: 0 });
  assert.equal(res.status, 200, JSON.stringify(res)); assert.equal(res.upgrade.won, true);
  const binder = JSON.parse(db.prepare('SELECT binder FROM profiles WHERE user_id = ?').get('binder').binder);
  assert.equal(binder[0], null, 'the staked card is out of the binder'); assert.equal(binder[1]?.id, 'me5-902'); assert.equal(qtyOf('binder', 'me5-902'), 2);
  audit('after binder');
});
await check('binder: a binder slot held only by a staked slab is cleared when the slab leaves', async () => {
  addUser('binder2'); give('binder2', 'me5-903', 1);
  const s = mint('binder2', 'me5-87', 9);
  db.prepare('UPDATE profiles SET binder = ? WHERE user_id = ?').run(JSON.stringify(Array.from({ length: 45 }, (_, i) => (i === 0 ? { id: 'me5-87', reverse: false } : i === 1 ? { id: 'me5-903', reverse: false } : null))), 'binder2');
  const res = await up.go('binder2', { slabs: [s], target: card('me5-913'), roll: 999999 });
  assert.equal(res.status, 200, JSON.stringify(res)); assert.equal(res.upgrade.won, false);
  const binder = JSON.parse(db.prepare('SELECT binder FROM profiles WHERE user_id = ?').get('binder2').binder);
  assert.equal(binder[0], null, 'the slot held only by the staked slab is cleared'); assert.equal(binder[1]?.id, 'me5-903', 'an untouched card keeps its slot');
  audit('after binder slab');
});

// ---- Sealed targets -----------------------------------------------------------------------------
await check('sealed: a win puts one copy in the Sealed collection (first_at = last_at = created_at); a second stacks; a loss adds nothing', async () => {
  const target = sealed('me5', 'eliteTrainerBox');
  const chance = expectedChance(1000, ETB);
  const lose = await up.go('d', { cards: [{ id: 'me5-901', qty: 1 }], target, roll: chance });
  assert.equal(lose.status, 200, JSON.stringify(lose)); assert.equal(lose.upgrade.won, false); assert.equal(vaultOf('d', 'me5', 'eliteTrainerBox'), undefined);
  assert.equal(lose.upgrade.chance, chance); assert.equal(lose.upgrade.targetValue, money(ETB / 100));
  const stamp = now; now += 5000;
  const win1 = await up.go('d', { cards: [{ id: 'me5-901', qty: 1 }], target, roll: 0 });
  assert.equal(win1.upgrade.won, true); const v = vaultOf('d', 'me5', 'eliteTrainerBox');
  assert.equal(v.qty, 1); assert.equal(v.first_at, now); assert.equal(v.last_at, now); assert.ok(now > stamp);
  const t = win1.upgrade.target;
  assert.equal(t.kind, 'sealed'); assert.equal(t.id, 'eliteTrainerBox'); assert.equal(t.setId, 'me5'); assert.equal(t.name, 'Elite Trainer Box'); assert.equal(t.short, 'ETB'); assert.equal(t.packs, ETB_OFFER.packs);
  assert.equal(typeof t.image, 'string'); assert.equal(row(win1.upgrade.id).target_set, 'me5'); assert.equal(row(win1.upgrade.id).target_kind, 'sealed');
  now += 7000;
  const win2 = await up.go('d', { cards: [{ id: 'me5-901', qty: 1 }], target, roll: 0 });
  const v2 = vaultOf('d', 'me5', 'eliteTrainerBox'); assert.equal(v2.qty, 2); assert.equal(v2.first_at, v.first_at); assert.equal(v2.last_at, now); assert.ok(win2.upgrade.won);
  const kept = await api('/api/vault', 'GET', undefined, 'd'); assert.equal(kept.status, 200);
  audit('after sealed');
});
await check('sealed: other products of other sets resolve through the shop (price in cents, kind, packs)', async () => {
  const products = JSON.parse(readFileSync(new URL('../data/products.json', import.meta.url), 'utf8'));
  const sealedJson = JSON.parse(readFileSync(new URL('../data/sealed.json', import.meta.url), 'utf8'));
  const tin = products.me5.find(p => p.kind === 'tin' && p.price > 12); assert.ok(tin);
  const offer = findOffer(sealedJson.me5, products.me5, tin.id);
  const price = Math.round(offer.price * 100);
  const res = await up.go('e', { cards: [{ id: 'me5-901', qty: 1 }], target: sealed('me5', tin.id), roll: 1 });
  assert.equal(res.status, 200, JSON.stringify(res)); assert.equal(res.upgrade.targetValue, money(price / 100)); assert.equal(res.upgrade.target.short, 'Tin');
  assert.equal(res.upgrade.chance, expectedChance(1000, price)); assert.equal(vaultOf('e', 'me5', tin.id).qty, 1);
  audit('after a tin');
});

// ---- Trigger: a bad Worker cannot pay out wrongly ----------------------------------------------------
const STAKE = [{ id: 'me5-901', name: 'x', number: '901', rarity: 'r', image: 'i', small: 's', qty: 1, rev: 0, v: 1000 }];
const rawRow = (user, over = {}) => ({ id: rid(), user_id: user, request_id: rid(), stake: JSON.stringify(STAKE), slabs: null, stake_value: 1000, target_kind: 'card', target_id: 'me5-911', target_set: null,
  target: '{"name":"x"}', target_value: 2000, chance: 475000, roll: 0, won: 1, created_at: now, ...over });
const rawInsert = (r) => db.prepare(`INSERT INTO upgrades(id, user_id, request_id, stake, slabs, stake_value, target_kind, target_id, target_set, target, target_value, chance, roll, won, created_at)
  VALUES(:id, :user_id, :request_id, :stake, :slabs, :stake_value, :target_kind, :target_id, :target_set, :target, :target_value, :chance, :roll, :won, :created_at)`).run(r);
const refuses = (user, over, pattern) => {
  const frozen = dump();
  assert.throws(() => rawInsert(rawRow(user, over)), pattern, JSON.stringify(over).slice(0, 120));
  assert.equal(dump(), frozen, 'a refused insert changes nothing');
};
await check('trigger: a wrong chance, a wrong result, a wrong stake value or a capped chance above 80% is refused', () => {
  refuses('f', { chance: 475001 }, /not valid/); refuses('f', { chance: 474999 }, /not valid/); refuses('f', { chance: 1 }, /not valid/);
  refuses('f', { roll: 500000, won: 1 }, /not valid/); refuses('f', { roll: 0, won: 0 }, /not valid/); refuses('f', { roll: 475000, won: 1 }, /not valid/); refuses('f', { roll: 474999, won: 0 }, /not valid/);
  refuses('f', { stake_value: 1001 }, /not valid/); refuses('f', { stake_value: 999 }, /not valid/);
  refuses('f', { stake_value: 1000, target_value: 1100, chance: 863636 }, /CHECK constraint|not valid/); // would pay out above the 80% cap
});
await check('trigger: a valid insert straight into the table does exactly what the Worker would (the take, the win, the vault)', () => {
  addUser('raw'); give('raw', 'me5-901', 3);
  const r = rawRow('raw', { roll: 0, won: 1 }); rawInsert(r);
  assert.equal(qtyOf('raw', 'me5-901'), 2); assert.equal(qtyOf('raw', 'me5-911'), 1);
  const s = rawRow('raw', { target_kind: 'sealed', target_id: 'eliteTrainerBox', target_set: 'me5', roll: 0, won: 1 }); rawInsert(s);
  assert.equal(vaultOf('raw', 'me5', 'eliteTrainerBox').qty, 1); assert.equal(qtyOf('raw', 'me5-901'), 1);
  const l = rawRow('raw', { roll: 900000, won: 0 }); rawInsert(l);
  assert.equal(qtyOf('raw', 'me5-901'), 0, 'the last copy is deleted'); assert.equal(db.prepare("SELECT COUNT(*) n FROM cards WHERE user_id = 'raw' AND card_id = 'me5-901'").get().n, 0);
  assert.equal(qtyOf('raw', 'me5-911'), 1, 'a loss adds nothing'); audit('after raw inserts');
});
await check('trigger: a stake the player does not have, malformed stakes and slabs, a bad target, more than ten slabs are refused', () => {
  addUser('rawb'); give('rawb', 'me5-901', 1);
  refuses('rawb', { stake: JSON.stringify([{ ...STAKE[0], qty: 2, v: 500 }]), stake_value: 1000 }, /no longer have those cards/);
  refuses('rawb', { stake: JSON.stringify([{ ...STAKE[0], id: 'me5-902' }]) }, /no longer have those cards/);
  refuses('rawb', { stake: JSON.stringify([{ ...STAKE[0], rev: 1 }]) }, /no longer have those cards/);
  refuses('rawb', { stake: JSON.stringify([{ ...STAKE[0], qty: 0 }]) }, /not valid/); refuses('rawb', { stake: JSON.stringify([{ ...STAKE[0], v: -1 }]) }, /not valid/);
  refuses('rawb', { stake: JSON.stringify([{ ...STAKE[0], v: '1000' }]) }, /not valid/);
  refuses('rawb', { stake: JSON.stringify([STAKE[0], STAKE[0]]), stake_value: 2000, target_value: 3000, chance: 633333 }, /not valid/);
  refuses('rawb', { stake: '[]', stake_value: 1000 }, /at least one card/); refuses('rawb', { stake: '{}' }, /not valid|at least one card/);
  refuses('rawb', { target_id: '' }, /not valid/); refuses('rawb', { target: '[]' }, /not valid/); refuses('rawb', { target_set: 'me5' }, /not valid/);
  refuses('rawb', { target_kind: 'sealed', target_id: 'eliteTrainerBox', target_set: null }, /not valid/);
  refuses('rawb', { target_kind: 'pack' }, /CHECK constraint/); refuses('rawb', { target_value: 1000, chance: 950000 }, /not valid/);
  refuses('rawb', { target_value: 1000, chance: 800000, roll: 0, won: 1 }, /CHECK constraint/); // the odds are right, but a target must be worth more
  refuses('rawb', { target_value: 900, chance: 800000, roll: 0, won: 1 }, /CHECK constraint/);
  refuses('rawb', { stake_value: 0 }, /CHECK constraint|not valid/); refuses('rawb', { won: 2 }, /not valid|CHECK constraint/); refuses('rawb', { roll: 1000000, won: 0 }, /CHECK constraint/);
  refuses('rawb', { chance: 0, won: 0 }, /CHECK constraint|not valid/);
  refuses('nobody', {}, /no longer have those cards/); // not a player
  // slabs
  const mine = mint('rawb', 'me5-87', 9); const theirs = mint('c', 'me5-87', 9); const lockedOne = mint('rawb', 'me5-87', 9); db.prepare("UPDATE graded_cards SET locked = 'jackpot:q' WHERE id = ?").run(lockedOne);
  const snap = id => { const g = slab(id); const v = slabCents(g.card_id, g.grade); return { id, cardId: g.card_id, name: 'n', number: '87', rarity: 'r', image: 'i', small: 's', grade: g.grade, reverse: g.reverse, guard: g.guard, v }; };
  const v = slabCents('me5-87', 9);
  const withSlab = (id, over = {}) => ({ stake: '[]', slabs: JSON.stringify([snap(id)]), stake_value: v, target_value: 100000, chance: expectedChance(v, 100000), roll: 999999, won: 0, ...over });
  refuses('rawb', withSlab(theirs), /no longer have those slabs/); refuses('rawb', withSlab(lockedOne), /no longer have those slabs/);
  refuses('rawb', withSlab(mine, { slabs: JSON.stringify([{ ...snap(mine), grade: 10 }]) }), /no longer have those slabs/);
  refuses('rawb', withSlab(mine, { slabs: JSON.stringify([{ ...snap(mine), guard: 'guard-onyx' }]) }), /no longer have those slabs/);
  refuses('rawb', withSlab(mine, { slabs: JSON.stringify([snap(mine), snap(mine)]), stake_value: 2 * v, chance: expectedChance(2 * v, 100000) }), /not valid/);
  refuses('rawb', withSlab(mine, { slabs: JSON.stringify([{ ...snap(mine), v: v + 1 }]) }), /not valid/, 'a slab priced differently from the stake value');
  refuses('rawb', withSlab(mine, { slabs: JSON.stringify([{ ...snap(mine), id: 'x' }]) }), /not valid/);
  const eleven = Array.from({ length: 11 }, () => snap(mint('rawb', 'me5-87', 9)));
  refuses('rawb', { stake: '[]', slabs: JSON.stringify(eleven), stake_value: 11 * v, target_value: 1000000, chance: expectedChance(11 * v, 1000000), roll: 999999, won: 0 }, /not valid/);
  const ten = eleven.slice(0, 10); rawInsert(rawRow('rawb', { stake: '[]', slabs: JSON.stringify(ten), stake_value: 10 * v, target_value: 1000000, chance: expectedChance(10 * v, 1000000), roll: 999999, won: 0 }));
  for (const sn of ten) assert.equal(slab(sn.id).status, 'sold');
  assert.equal(slab(eleven[10].id).status, 'slabbed', 'the eleventh was refused and is untouched');
  assert.equal(slab(mine).status, 'slabbed'); assert.equal(slab(theirs).user_id, 'c');
  audit('after trigger refusals');
});
await check('trigger: an upgrade is final (no update), and a mixed stake sums cards and slabs', () => {
  const some = rows()[0];
  assert.throws(() => db.prepare('UPDATE upgrades SET won = 1 - won WHERE id = ?').run(some.id), /An upgrade is final/);
  assert.throws(() => db.prepare('UPDATE upgrades SET roll = 0').run(), /An upgrade is final/);
  addUser('rawc'); give('rawc', 'me5-901', 2); const sl = mint('rawc', 'me5-87', 9); const v = slabCents('me5-87', 9);
  const total = 1000 + v; const snap = { id: sl, cardId: 'me5-87', name: 'n', number: '87', rarity: 'r', image: 'i', small: 's', grade: 9, reverse: 0, guard: null, v };
  refuses('rawc', { slabs: JSON.stringify([snap]), stake_value: 1000 }, /not valid/); refuses('rawc', { slabs: JSON.stringify([snap]), stake_value: v }, /not valid/);
  rawInsert(rawRow('rawc', { slabs: JSON.stringify([snap]), stake_value: total, target_value: 100000, chance: expectedChance(total, 100000), roll: 0, won: 1 }));
  assert.equal(qtyOf('rawc', 'me5-901'), 1); assert.equal(slab(sl).status, 'sold'); assert.equal(qtyOf('rawc', 'me5-911'), 1);
  audit('after a mixed raw insert');
});

// ---- Winnings -------------------------------------------------------------------------------------------
await check('winnings: a won card sells for its sellValue once; the loser and strangers cannot; a second sell is refused', async () => {
  const w = await up.go('f', { cards: [{ id: 'me5-901', qty: 1 }], target: card('me5-911'), roll: 0 }); assert.equal(w.upgrade.won, true);
  const l = await up.go('f', { cards: [{ id: 'me5-901', qty: 1 }], target: card('me5-911'), roll: 999999 }); assert.equal(l.upgrade.won, false);
  assert.equal((await winnings.info(l.upgrade.id, 'f')).status, 403); assert.equal((await winnings.sell(l.upgrade.id, 'f')).status, 403);
  assert.equal((await winnings.info(w.upgrade.id, 'e')).status, 403, "someone else's upgrade"); assert.equal((await winnings.sell(w.upgrade.id, 'e')).status, 403);
  assert.equal((await winnings.info('no-such-upgrade', 'f')).status, 404); assert.equal((await winnings.info(w.upgrade.id, null)).status, 401);
  const before = { coins: coinsOf('f'), held: qtyOf('f', 'me5-911') };
  const info = await winnings.info(w.upgrade.id, 'f');
  assert.equal(info.status, 200, JSON.stringify(info)); assert.equal(info.cards, 1); assert.equal(info.slabs, 0); assert.equal(info.coins, 20); assert.equal(info.sold, false);
  const sale = await winnings.sell(w.upgrade.id, 'f');
  assert.equal(sale.status, 200, JSON.stringify(sale)); assert.equal(sale.sold.coins, 20); assert.equal(sale.sold.cards, 1); soldWinnings += 1;
  assert.equal(coinsOf('f'), before.coins + 2000, 'paid sellValue(card) = 20.00, once'); assert.equal(qtyOf('f', 'me5-911'), before.held - 1);
  assert.equal(sellValue(INJECT.find(c => c.id === 'me5-911')), 20);
  const again = await winnings.sell(w.upgrade.id, 'f'); assert.equal(again.status, 409); assert.equal(coinsOf('f'), before.coins + 2000);
  const after = await winnings.info(w.upgrade.id, 'f'); assert.equal(after.cards, 0); assert.equal(after.sold, true); assert.equal(after.soldCoins, 20);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM casino_sales WHERE game_id = ?").get(w.upgrade.id).n, 1);
  // Win it again with a copy already owned: only the one just won can be sold, never the earlier copies.
  give('f', 'me5-911', 3);
  const w2 = await up.go('f', { cards: [{ id: 'me5-901', qty: 1 }], target: card('me5-911'), roll: 0 }); assert.equal(w2.upgrade.won, true);
  const held = qtyOf('f', 'me5-911');
  const sale2 = await winnings.sell(w2.upgrade.id, 'f'); assert.equal(sale2.sold.cards, 1); soldWinnings += 1; assert.equal(qtyOf('f', 'me5-911'), held - 1);
  audit('after selling winnings');
});
await check('winnings: a sealed win has nothing to sell back (info is empty, sell is refused, no coins move)', async () => {
  const w = await up.go('f', { cards: [{ id: 'me5-901', qty: 1 }], target: sealed('me5', 'eliteTrainerBox'), roll: 0 }); assert.equal(w.upgrade.won, true);
  const info = await winnings.info(w.upgrade.id, 'f'); assert.equal(info.status, 200, JSON.stringify(info)); assert.equal(info.cards, 0); assert.equal(info.slabs, 0); assert.equal(info.coins, 0);
  const coins = coinsOf('f'); const sale = await winnings.sell(w.upgrade.id, 'f'); assert.equal(sale.status, 409); assert.equal(coinsOf('f'), coins);
  assert.equal(vaultOf('f', 'me5', 'eliteTrainerBox').qty, 1, 'the box is still sealed in the vault');
});
await check('winnings: the existing sources still work and an unknown one is refused', async () => {
  assert.equal((await api('/api/casino/winnings/coinflip/none', 'GET', undefined, 'a')).status, 404);
  assert.equal((await api('/api/casino/winnings/bogus/none', 'GET', undefined, 'a')).status, 404);
  assert.equal((await winnings.sell('x', 'a', { source: 'bogus' })).status, 404);
});

// ---- The level gate ----------------------------------------------------------------------------------------
await check('gate: level 5 opens the upgrader; below it POST is refused with needLevel, GET is open; a past upgrade lets a low level through', async () => {
  assert.equal(GATES.upgrader, 5); assert.equal(GATE_NAMES.upgrader, 'the upgrader'); assert.equal(gateMessage('upgrader'), 'Reach level 5 to open the upgrader.');
  addUser('low', 4); give('low', 'me5-901', 3);
  const shut = await up.go('low', { cards: [{ id: 'me5-901', qty: 1 }], target: card('me5-911'), roll: null });
  assert.equal(shut.status, 403); assert.equal(shut.error, 'Reach level 5 to open the upgrader.'); assert.equal(shut.needLevel, 5); assert.equal(qtyOf('low', 'me5-901'), 3);
  assert.equal((await up.list('low')).status, 200); assert.equal((await up.list(null)).status, 200);
  seedLevel(db, 'low', 5);
  const open = await up.go('low', { cards: [{ id: 'me5-901', qty: 1 }], target: card('me5-911'), roll: 0 }); assert.equal(open.status, 200, JSON.stringify(open));
  seedLevel(db, 'low', 1); // the level never drops; a player who has upgraded is let through at any level
  assert.equal((await up.go('low', { cards: [{ id: 'me5-901', qty: 1 }], target: card('me5-911'), roll: 0 })).status, 200);
  addUser('fresh', null); give('fresh', 'me5-901', 1); // no XP row at all: a brand new account waits
  assert.equal((await up.go('fresh', { cards: [{ id: 'me5-901', qty: 1 }], target: card('me5-911'), roll: null })).status, 403);
  audit('after the gate');
});

// ---- Reading -----------------------------------------------------------------------------------------------------
await check('GET: recent (20 newest of everyone), mine (12 newest of the caller), record, rules; signed out has no mine and no record', async () => {
  const res = await up.list('b');
  assert.equal(res.status, 200); assert.deepEqual(res.rules, UPGRADER_RULES); assert.equal(typeof res.serverNow, 'number');
  assert.equal(res.recent.length, 20); assert.equal(res.mine.length, Math.min(12, rows().filter(r => r.user_id === 'b').length));
  assert.ok(res.recent.every((u, i, all) => i === 0 || all[i - 1].createdAt >= u.createdAt), 'newest first');
  assert.ok(res.mine.every(u => u.player.userId === 'b'));
  const mineAll = rows().filter(r => r.user_id === 'b'); const wins = mineAll.filter(r => r.won);
  assert.equal(res.record.played, mineAll.length); assert.equal(res.record.won, wins.length);
  assert.equal(res.record.biggest, money(Math.max(0, ...wins.map(r => r.target_value)) / 100));
  const out = await up.list(null); assert.equal(out.status, 200); assert.deepEqual(out.mine, []); assert.equal(out.record, null); assert.equal(out.recent.length, 20);
  const none = await up.list('nobody-signed'); assert.equal(none.status, 200); assert.deepEqual(none.mine, []);
});
await check('GET: one upgrade is public and carries the whole view; unknown ids are 404', async () => {
  const w = await up.go('a', { cards: [{ id: 'me5-901', qty: 2 }, { id: 'me5-902', qty: 3 }], target: card('me5-913'), roll: 4242 });
  assert.equal(w.status, 200, JSON.stringify(w));
  const one = await up.get(w.upgrade.id, null); assert.equal(one.status, 200); assert.equal(typeof one.serverNow, 'number');
  assert.deepEqual(one.upgrade, w.upgrade, 'the same view whoever asks');
  const u = one.upgrade;
  assert.deepEqual(Object.keys(u).sort(), ['chance', 'createdAt', 'id', 'player', 'roll', 'slabs', 'stake', 'stakeValue', 'target', 'targetValue', 'won'].sort());
  assert.deepEqual(Object.keys(u.player).sort(), ['avatar', 'avatarStyle', 'color', 'handle', 'name', 'userId']); assert.equal(u.player.userId, 'a'); assert.equal(u.player.name, 'a'); assert.equal(u.player.color, 'gold');
  assert.deepEqual(u.stake.map(s => [s.id, s.qty, s.value]), [['me5-901', 2, 10], ['me5-902', 3, 2]]); assert.ok(u.stake.every(s => s.name && s.image && s.small && s.number != null && 'rev' in s && !('v' in s)));
  assert.deepEqual(u.slabs, []); assert.equal(u.stakeValue, 26); assert.equal(u.targetValue, 1000); assert.equal(u.chance, expectedChance(2600, 100000)); assert.equal(u.roll, 4242); assert.equal(u.won, u.roll < u.chance); assert.equal(u.createdAt, now);
  assert.deepEqual(Object.keys(u.target).sort(), ['id', 'image', 'kind', 'name', 'number', 'packs', 'rarity', 'setId', 'short', 'small'].sort());
  assert.equal(u.target.kind, 'card'); assert.equal(u.target.id, 'me5-913'); assert.equal(u.target.setId, 'me5'); assert.equal(u.target.name, 'Test 913'); assert.equal(u.target.rarity, 'Rare Holo'); assert.equal(u.target.number, '913');
  assert.equal(u.target.image, 'assets/cards/me5/913.webp'); assert.equal(u.target.small, 'assets/cards/me5/913-sm.webp');
  assert.equal((await up.get('no-such-upgrade', 'a')).status, 404);
  assert.equal((await api('/api/casino/upgrades/' + 'x'.repeat(90), 'GET', undefined, 'a')).status, 404);
  audit('after the view');
});

// ---- No XP, no quests -----------------------------------------------------------------------------------------------
await check('anti-farm: an upgrade counts for no XP and no quest event (the house is not a player)', async () => {
  const user = 'xp'; addUser(user, 20); give(user, 'me5-901', 20);
  const first = await api('/api/me', 'GET', undefined, user); assert.equal(first.status, 200);
  const state = () => JSON.stringify([db.prepare('SELECT * FROM player_xp WHERE user_id = ?').all(user), db.prepare('SELECT COUNT(*) n FROM quest_events WHERE user_id = ?').get(user).n,
    db.prepare('SELECT key, value FROM player_stats WHERE user_id = ? ORDER BY key').all(user)]);
  const before = state(); const xpBefore = (await api('/api/me', 'GET', undefined, user)).save?.xp?.total;
  for (let i = 0; i < 6; i++) { const r = await up.go(user, { cards: [{ id: 'me5-901', qty: 1 }], target: card('me5-911'), roll: i % 2 ? 999999 : 0 }); assert.equal(r.status, 200); }
  const sold = await winnings.sell(rows().filter(r => r.user_id === user && r.won)[0].id, user); assert.equal(sold.status, 200); soldWinnings += 1;
  const after = JSON.parse(state()); const prior = JSON.parse(before);
  assert.deepEqual(after[0], prior[0], 'player_xp is unchanged'); assert.equal(after[1], prior[1] + 1 - 0, 'only the winnings sale records its one "sold" quest event, as every casino sale does');
  assert.equal((await api('/api/me', 'GET', undefined, user)).save?.xp?.total, xpBefore, 'xp.total is unchanged');
  assert.ok(!/casino/.test(JSON.stringify(after[2].filter(s => /upgrad/i.test(s.key)))), 'no upgrade counters');
  audit('after the xp check');
});

// ---- The economy ---------------------------------------------------------------------------------------------------------
await check('economy: no stake can beat 95% of itself in expectation (exact, every pair on a grid, incl. the cap), and the house never pays out more than the formula', () => {
  const stakes = [10, 11, 99, 100, 777, 1000, 12345, 1e6, 123456789];
  for (const s of stakes) for (const ratio of [1.0001, 1.01, 1.0526, 1.0527, 1.1, 1.1876, 1.19, 1.5, 2, 4.4, 10, 100, 1000, 9e4, 9.5e5]) {
    const t = Math.ceil(s * ratio); if (t <= s) continue;
    const c = upgradeChance(s, t); if (c < 1) continue;
    assert.ok(c <= 800000);
    assert.ok(c * t <= 950000 * s, `EV ${c * t / 1e6} <= 0.95 * ${s}`);
    if (c < 800000) assert.ok(c * t > 950000 * s - t, 'uncapped chances lose less than one millionth of a target to rounding');
  }
  // What really happened in this run: the average payout per stake of every upgrade the test made, exactly.
  let ev = 0; let stake = 0;
  for (const r of rows()) { ev += r.chance * r.target_value / 1e6; stake += r.stake_value; }
  assert.ok(ev <= 0.95 * stake, `expected payout ${ev} of stake ${stake}`);
});

// ---- Final ledger ------------------------------------------------------------------------------------------------------------
await check('ledger: the whole run conserved cards, closed every slab, wrote only final rows and left every guard unit with its owner', () => {
  audit('at the end');
  assert.ok(rows().length > 330);
  for (const r of rows()) { assert.equal(r.won, r.roll < r.chance ? 1 : 0); assert.equal(r.chance, expectedChance(r.stake_value, r.target_value)); assert.ok(r.chance >= 1 && r.chance <= 800000); }
  assert.equal(gearRowQty('a', 'guard-onyx'), 2, 'the guard units were never taken');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM graded_cards WHERE locked IS NOT NULL AND id IN (SELECT json_extract(j.value, '$.id') FROM upgrades u, json_each(u.slabs) j)").get().n, 0);
});

console.log(results.join('\n'));
console.log(failed ? `\nFAIL: ${failed} failed` : '\nPASS');
Date.now = realNow;
process.exit(failed ? 1 : 0);
