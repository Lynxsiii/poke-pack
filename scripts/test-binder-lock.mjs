/* Binder lock (worker/binder-lock.js): a card in a binder pocket can't be sold, staked or
   traded away until it is taken out; spare copies stay free; grading and cracking keep the pocket filled.
   The casino, trade and winnings paths have their own binder checks in test-coinflip, test-jackpot,
   test-upgrader, test-casino-slabs and test-trades. Run: node scripts/test-binder-lock.mjs */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker from '../worker/index.js';
import { BINDER_LOCK_DDL, resetBinderLockCache, binderLocks } from '../worker/binder-lock.js';
import { createTestDb, seedPlayer, requester } from './lib/d1-test-db.mjs';
import { seedLevel } from './lib/level-seed.mjs';

const results = [];
let failed = 0;
async function check(name, fn) {
  try { await fn(); results.push(`PASS  ${name}`); }
  catch (err) { failed++; results.push(`FAIL  ${name}\n      ${String(err?.stack || err).split('\n').slice(0, 10).join('\n      ')}`); }
}

const CARD = 'me5-90', OTHER = 'me5-87';
let { db, env, crash } = createTestDb();
let req = requester(worker, env, null);
const player = (id, coins = 500) => {
  seedPlayer(db, { id, coins, session: id }); seedLevel(db, id, 20);
  db.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?').run(Date.now() + 864000000, id);
};
const give = (user, card, qty, rev = 0) => db.prepare(`INSERT INTO cards(user_id,card_id,qty,reverse_qty) VALUES(?,?,?,?)
  ON CONFLICT(user_id,card_id) DO UPDATE SET qty = qty + excluded.qty, reverse_qty = reverse_qty + excluded.reverse_qty`).run(user, card, qty, rev);
const qty = (user, card) => db.prepare('SELECT qty FROM cards WHERE user_id = ? AND card_id = ?').get(user, card)?.qty || 0;
const pockets = (user, ...ids) => {
  const list = Array.from({ length: 18 }, (_, i) => (ids[i] ? { id: ids[i], reverse: false } : null));
  db.prepare('UPDATE profiles SET binder = ? WHERE user_id = ?').run(JSON.stringify(list), user);
};
const binderIds = user => JSON.parse(db.prepare('SELECT binder FROM profiles WHERE user_id = ?').get(user).binder).map(s => s?.id || null);
const api = (user, path, method, body) => req(path, method, body, user);
const sell = (user, cardId) => api(user, '/api/cards/sell', 'POST', { cardId });

await check('the migration file holds the same triggers the Worker applies', async () => {
  const sql = readFileSync(new URL('../worker/migrations/0043_binder_lock.sql', import.meta.url), 'utf8');
  for (const stmt of BINDER_LOCK_DDL) assert.ok(sql.includes(stmt), stmt.slice(0, 60));
});

await check('selling: the pocketed copy is refused, a spare copy sells, and the pocket stays', async () => {
  player('ann'); give('ann', CARD, 2); pockets('ann', CARD);
  const first = await sell('ann', CARD);
  assert.equal(first.status, 200, JSON.stringify(first.body)); assert.equal(qty('ann', CARD), 1);
  const second = await sell('ann', CARD);
  assert.equal(second.status, 409); assert.match(second.body.error, /locked in your binder/); assert.equal(second.body.locked, true);
  assert.equal(qty('ann', CARD), 1, 'the last copy stays');
  assert.deepEqual(binderIds('ann').slice(0, 1), [CARD]);
  // Taken out of the binder, it sells.
  pockets('ann');
  assert.equal((await sell('ann', CARD)).status, 200); assert.equal(qty('ann', CARD), 0);
});

await check('sell duplicates keeps as many copies as the binder has pockets for', async () => {
  player('bob'); give('bob', CARD, 5); give('bob', OTHER, 3); pockets('bob', CARD, CARD, CARD);
  const res = await api('bob', '/api/cards/sell-duplicates', 'POST', { setId: 'me5' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(qty('bob', CARD), 3, 'three pockets keep three copies'); assert.equal(qty('bob', OTHER), 1, 'loose cards still go down to one');
  assert.equal(res.body.copies, 4);
  const again = await api('bob', '/api/cards/sell-duplicates', 'POST', { setId: 'me5' });
  assert.equal(again.status, 409); assert.match(again.body.error, /binder/);
});

await check('grading a pocketed card works (the slab fills the pocket); selling that slab is refused; cracking it is fine', async () => {
  player('cat', 5000); give('cat', CARD, 1); pockets('cat', CARD);
  const graded = await api('cat', '/api/grading/submit', 'POST', { cardId: CARD, reverse: false, requestId: crypto.randomUUID() });
  assert.equal(graded.status, 200, JSON.stringify(graded.body));
  assert.equal(qty('cat', CARD), 0);
  const slab = db.prepare("SELECT id FROM graded_cards WHERE user_id = 'cat' AND status = 'slabbed'").get().id;
  const sold = await api('cat', '/api/grading/sell', 'POST', { slabId: slab, requestId: crypto.randomUUID() });
  assert.equal(sold.status, 409, JSON.stringify(sold.body)); assert.match(sold.body.error, /binder/);
  assert.equal(db.prepare('SELECT status FROM graded_cards WHERE id = ?').get(slab).status, 'slabbed');
  const cracked = await api('cat', '/api/grading/crack', 'POST', { slabId: slab });
  assert.equal(cracked.status, 200, JSON.stringify(cracked.body)); assert.equal(qty('cat', CARD), 1);
  assert.deepEqual(binderIds('cat').slice(0, 1), [CARD], 'the pocket never emptied');
});

await check('the database refuses a write that would empty a pocket, whatever the path', async () => {
  player('dan'); give('dan', CARD, 1); pockets('dan', CARD);
  assert.throws(() => db.prepare("UPDATE cards SET qty = 0 WHERE user_id = 'dan'").run(), /binder-locked/);
  db.prepare("INSERT INTO graded_cards(user_id,card_id,reverse,grade,band,fee_cents,request_id,status,created_at,shown,black_label) VALUES('dan',?,0,9,'modern',0,'d1','slabbed',0,0,0)").run(OTHER);
  pockets('dan', CARD, OTHER);
  assert.throws(() => db.prepare("UPDATE graded_cards SET status = 'sold' WHERE user_id = 'dan'").run(), /binder-locked/);
  assert.throws(() => db.prepare("UPDATE graded_cards SET locked = 'coinflip:x' WHERE user_id = 'dan'").run(), /binder-locked/);
  assert.throws(() => db.prepare("UPDATE graded_cards SET user_id = 'ann' WHERE user_id = 'dan'").run(), /binder-locked/);
  db.prepare("UPDATE graded_cards SET guard = NULL, shown = 1 WHERE user_id = 'dan'").run(); // other changes are fine
  give('dan', CARD, 1);
  db.prepare("UPDATE cards SET qty = 1 WHERE user_id = 'dan' AND card_id = ?").run(CARD); // a spare copy may go
  // A binder value that isn't JSON locks nothing rather than breaking every write.
  db.prepare("UPDATE profiles SET binder = 'nope' WHERE user_id = 'dan'").run();
  db.prepare("UPDATE cards SET qty = 0 WHERE user_id = 'dan'").run();
});

await check('a race the page check missed answers 409 in words, not a server error', async () => {
  player('eve'); give('eve', CARD, 1);
  const locks = await binderLocks(env, 'eve'); assert.equal(locks.locked(CARD), false); assert.equal(locks.freeRaw(CARD, 1), 1);
  // The binder fills after the check ran: the trigger refuses the batch.
  crash.tamper(/UPDATE profiles SET coins = coins \+ \?/, () => pockets('eve', CARD));
  const res = await sell('eve', CARD);
  assert.equal(res.status, 409, JSON.stringify(res.body)); assert.match(res.body.error, /binder/);
  assert.equal(qty('eve', CARD), 1);
});

await check('a database from before the lock gets the triggers from the Worker on its first write', async () => {
  ({ db, env } = createTestDb({ upTo: '0042' }));
  req = requester(worker, env, null);
  resetBinderLockCache();
  assert.equal(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'binder_lock_%'").get().n, 0);
  player('fay'); give('fay', CARD, 1); pockets('fay', CARD);
  const res = await sell('fay', CARD);
  assert.equal(res.status, 409);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'binder_lock_%'").get().n, 2);
  assert.throws(() => db.prepare("UPDATE cards SET qty = 0 WHERE user_id = 'fay'").run(), /binder-locked/);
});

console.log(results.join('\n'));
console.log(failed ? `\n${failed} failed` : `\nall ${results.length} passed`);
process.exit(failed ? 1 : 0);
