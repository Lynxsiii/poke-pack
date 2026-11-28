/* Player-to-player trading (worker/trades.js, worker/trades-ddl.js): offers, the atomic swap,
   the rules on uneven trades, races, and conservation of cards, slabs and coins.
   Runs the real Worker on the transactional D1 stand-in (Node 22+): node scripts/test-trades.mjs */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker from '../worker/index.js';
import { resetTradesSchemaCache } from '../worker/trades.js';
import { TRADES_OBJECTS } from '../worker/trades-ddl.js';
import { tradesMigrationSql } from './gen-trades-ddl.mjs';
import { TRADE_RULES, gapLimit, tradeGap, coinsToEven } from '../js/trade-rules.js';
import { GATES } from '../js/levels.js';
import { sellValue } from '../js/catalog.js';
import { gradedValue } from '../js/grading-rules.js';
import { setForCard } from '../worker/grading.js';
import { createTestDb, seedPlayer, requester } from './lib/d1-test-db.mjs';
import { seedLevel } from './lib/level-seed.mjs';

const results = [];
let failed = 0;
async function check(name, fn) {
  try { await fn(); results.push(`PASS  ${name}`); }
  catch (err) { failed++; results.push(`FAIL  ${name}\n      ${String(err?.stack || err).split('\n').slice(0, 12).join('\n      ')}`); }
}

const me1 = JSON.parse(readFileSync(new URL('../data/me1.json', import.meta.url), 'utf8'));
const cardOf = id => (me1.cards || me1).find(c => c.id === id);
const centsOf = id => Math.round(sellValue(cardOf(id)) * 100);
// Two cards worth the same, two close in value, one big, one tiny.
const A1 = 'me1-104', B1 = 'me1-mep008', A10 = 'me1-155', B10 = 'me1-mep042', BIG = 'me1-181', TINY = 'me1-103';
assert.equal(centsOf(A1), centsOf(B1));

let { db, env } = createTestDb();
let req = requester(worker, env, null);
const realNow = Date.now; let clock = realNow(); Date.now = () => clock;
const LEVEL = 20;
const player = (id, { coins = 100, level = LEVEL } = {}) => { seedPlayer(db, { id, coins, session: id }); seedLevel(db, id, level); db.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?').run(clock + 400 * 86400000, id); };
const give = (user, card, qty, rev = 0) => db.prepare(`INSERT INTO cards(user_id,card_id,qty,reverse_qty) VALUES(?,?,?,?)
  ON CONFLICT(user_id,card_id) DO UPDATE SET qty = qty + excluded.qty, reverse_qty = reverse_qty + excluded.reverse_qty`).run(user, card, qty, rev);
const qty = (user, card) => db.prepare('SELECT qty FROM cards WHERE user_id = ? AND card_id = ?').get(user, card)?.qty || 0;
const rev = (user, card) => db.prepare('SELECT reverse_qty FROM cards WHERE user_id = ? AND card_id = ?').get(user, card)?.reverse_qty || 0;
const coins = user => Math.round(db.prepare('SELECT coins FROM profiles WHERE user_id = ?').get(user).coins * 100);
const totalCards = () => db.prepare('SELECT COALESCE(SUM(qty),0) n FROM cards').get().n;
const totalRev = () => db.prepare('SELECT COALESCE(SUM(reverse_qty),0) n FROM cards').get().n;
const totalCoins = () => Math.round(db.prepare('SELECT COALESCE(SUM(coins),0) n FROM profiles').get().n * 100);
const totalSlabs = () => db.prepare("SELECT COUNT(*) n FROM graded_cards WHERE status = 'slabbed'").get().n;
const befriend = (a, b) => { for (const [x, y] of [[a, b], [b, a]]) db.prepare("INSERT OR REPLACE INTO friends(from_id,to_id,status,created_at) VALUES(?,?,'accepted',?)").run(x, y, clock); };
let slabSeq = 0;
const slab = (user, card, grade = 10, { guard = null, shown = 0, locked = null } = {}) => {
  const r = db.prepare(`INSERT INTO graded_cards(user_id,card_id,reverse,grade,band,fee_cents,request_id,guard,status,created_at,shown,locked,black_label)
    VALUES(?,?,0,?,'modern',0,?,?,'slabbed',?,?,?,0)`).run(user, card, grade, `seed-${++slabSeq}`, guard, clock, shown, locked);
  return Number(r.lastInsertRowid);
};
const slabOwner = id => db.prepare('SELECT user_id, guard, shown, request_id, status FROM graded_cards WHERE id = ?').get(id);
const rid = () => crypto.randomUUID();
const api = (user, path, method, body) => req(path, method, body, user);
const offer = (from, to, giveSide, takeSide, extra = {}) => api(from, '/api/trades', 'POST', { to, give: giveSide, take: takeSide, requestId: rid(), ...extra });
const cards = (...pairs) => ({ cards: pairs.map(([id, n, reverse]) => ({ id, qty: n, ...(reverse ? { reverse: true } : {}) })) });
const accept = (user, id) => api(user, `/api/trades/${id}/accept`, 'POST', {});
/** Run `fn(start, end)`: between start() (after the seeding; default the beginning) and end() (default the finish) nothing is made or lost. */
const conserved = async (fn) => {
  const totals = () => [totalCards(), totalRev(), totalCoins(), totalSlabs()];
  let before = totals(); let done = false;
  const end = () => { if (!done) assert.deepEqual(totals(), before, 'cards, reverse copies, coins and slabs are conserved'); done = true; };
  await fn(() => { before = totals(); }, end);
  end();
};

for (const id of ['ann', 'bob', 'cat', 'dan', 'eve', 'low']) player(id, id === 'low' ? { level: GATES.trading - 1 } : {});

await check('the migration file is generated from the DDL', async () => {
  assert.equal(readFileSync(new URL('../worker/migrations/0035_trades.sql', import.meta.url), 'utf8'), tradesMigrationSql());
});

await check('rules: gap and even band', async () => {
  assert.deepEqual(tradeGap(1000, 1000), { gap: 0, even: true, down: null });
  assert.equal(tradeGap(1000, 800).even, true);
  assert.equal(tradeGap(1000, 799).even, false);
  assert.equal(tradeGap(150, 60).even, true, 'a gap inside the slack is even');
  assert.equal(tradeGap(1000, 0).down, 'give');
  assert.equal(tradeGap(0, 1000).down, 'take');
  assert.equal(coinsToEven(1000, 500), 300);
  assert.equal(gapLimit(1), TRADE_RULES.gapBaseCents + TRADE_RULES.gapPerLevelCents);
});

await check('signed out, low level and self are refused', async () => {
  give('ann', A1, 2); give('bob', B1, 2);
  assert.equal((await req('/api/trades', 'GET')).status, 401);
  const low = await offer('low', 'bob', cards(), cards([B1, 1]));
  assert.equal(low.status, 403); assert.equal(low.body.needLevel, GATES.trading);
  const toLow = await offer('ann', 'low', cards([A1, 1]), cards());
  assert.equal(toLow.status, 403);
  assert.equal((await offer('ann', 'ann', cards([A1, 1]), cards())).status, 400);
  assert.equal((await offer('ann', 'nobody', cards([A1, 1]), cards())).status, 404);
  const list = await api('low', '/api/trades', 'GET');
  assert.equal(list.body.open, false);
});

let firstId = null;
await check('an even trade between strangers swaps both ways, once', async () => conserved(async () => {
  const made = await offer('ann', 'bob', cards([A1, 1]), cards([B1, 1]));
  assert.equal(made.status, 201, JSON.stringify(made.body));
  firstId = made.body.trade.id;
  assert.equal(made.body.trade.status, 'open');
  assert.equal(made.body.trade.mine, 'from');
  assert.equal(made.body.trade.give.cards[0].name, cardOf(A1).name);
  // Nothing is held while it waits.
  assert.equal(qty('ann', A1), 2);
  const inbox = await api('bob', '/api/trades', 'GET');
  assert.equal(inbox.body.incoming.length, 1);
  assert.equal(inbox.body.incoming[0].mine, 'to');
  assert.equal((await api('bob', '/api/friends', 'GET')).body.trades, 1);
  const seen = await api('bob', `/api/trades/${firstId}`, 'GET');
  assert.equal(seen.body.check.ok, true);
  assert.equal((await api('cat', `/api/trades/${firstId}`, 'GET')).status, 404, 'a third player cannot read it');
  assert.equal((await accept('ann', firstId)).status, 403, 'the sender cannot accept their own offer');
  assert.equal((await accept('cat', firstId)).status, 404);
  const done = await accept('bob', firstId);
  assert.equal(done.status, 200, JSON.stringify(done.body));
  assert.equal(done.body.trade.status, 'accepted');
  assert.equal(done.body.save.collection[A1], 1);
  assert.deepEqual([qty('ann', A1), qty('ann', B1), qty('bob', A1), qty('bob', B1)], [1, 1, 1, 1]);
  // Accepting again answers the same way and moves nothing.
  const again = await accept('bob', firstId);
  assert.equal(again.status, 200);
  assert.deepEqual([qty('ann', A1), qty('ann', B1), qty('bob', A1), qty('bob', B1)], [1, 1, 1, 1]);
  assert.equal((await api('bob', '/api/friends', 'GET')).body.trades, 0);
  const hist = await api('ann', '/api/trades', 'GET');
  assert.equal(hist.body.history[0].id, firstId);
}));

await check('a closed offer never changes, even by a direct write', async () => {
  assert.throws(() => db.prepare("UPDATE trades SET status = 'open' WHERE id = ?").run(firstId), /trade:closed/);
  assert.throws(() => db.prepare("UPDATE trades SET status = 'accepted', closed_at = 1 WHERE id = ?").run(firstId), /trade:closed/);
  const open = (await offer('ann', 'bob', cards([A1, 1]), cards([A1.replace('104', '104')].length ? [B1, 1] : []))).body.trade.id;
  assert.throws(() => db.prepare(`UPDATE trades SET give_cards = '[]', closed_at = 1 WHERE id = ?`).run(open), /trade:frozen/);
  assert.throws(() => db.prepare(`UPDATE trades SET to_id = 'cat', closed_at = 1 WHERE id = ?`).run(open), /trade:frozen/);
  assert.throws(() => db.prepare(`UPDATE trades SET status = 'accepted', closed_at = ?, gift_cents = 5 WHERE id = ?`).run(clock, open), /trade:not-valid/);
  assert.equal((await api('ann', `/api/trades/${open}/cancel`, 'POST', {})).status, 200);
});

await check('reverse holos are counted apart from plain copies', async () => conserved(async (start) => {
  give('cat', A10, 3, 2); give('dan', B10, 2, 0); start();
  // Cat has one plain and two reverse copies.
  assert.equal((await offer('cat', 'dan', cards([A10, 2]), cards([B10, 2]))).status, 409, 'two plain copies when only one is plain');
  assert.equal((await offer('cat', 'dan', cards([A10, 3, true]), cards([B10, 2]))).status, 409, 'three reverse copies when only two are');
  const made = await offer('cat', 'dan', { cards: [{ id: A10, qty: 1 }, { id: A10, qty: 1, reverse: true }] }, cards([B10, 2]));
  assert.equal(made.status, 201, JSON.stringify(made.body));
  assert.deepEqual(made.body.trade.give.cards.map(c => [c.qty, c.rev]), [[2, 1]]);
  assert.equal((await accept('dan', made.body.trade.id)).status, 200);
  assert.deepEqual([qty('cat', A10), rev('cat', A10), qty('dan', A10), rev('dan', A10)], [1, 1, 2, 1]);
  assert.deepEqual([qty('cat', B10), qty('dan', B10)], [2, 0]);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM cards WHERE qty <= 0').get().n, 0, 'no empty rows are left');
}));

await check('strangers cannot trade uneven; friends can, inside the daily limit', async () => conserved(async (start) => {
  give('ann', BIG, 3); start();
  const gift = await offer('ann', 'cat', cards([BIG, 1]), cards());
  assert.equal(gift.status, 409); assert.equal(gift.body.code, 'uneven');
  befriend('ann', 'cat');
  const cap = gapLimit(LEVEL);
  assert.ok(centsOf(BIG) < cap && centsOf(BIG) * 2 > 0);
  const ok = await offer('ann', 'cat', cards([BIG, 1]), cards());
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  const done = await accept('cat', ok.body.trade.id);
  assert.equal(done.status, 200, JSON.stringify(done.body));
  assert.equal(qty('cat', BIG), 1);
  const row = db.prepare('SELECT gift_from, gift_to, gift_cents, gift_cap_from FROM trades WHERE id = ?').get(ok.body.trade.id);
  assert.deepEqual({ ...row }, { gift_from: 'ann', gift_to: 'cat', gift_cents: centsOf(BIG), gift_cap_from: cap });
  const limits = (await api('ann', '/api/trades', 'GET')).body.limits;
  assert.equal(Math.round(limits.given * 100), centsOf(BIG));
  assert.equal(Math.round((await api('cat', '/api/trades', 'GET')).body.limits.got * 100), centsOf(BIG));
}));

await check('the daily limit holds for the giver and for the getter, and comes back after a day', async () => conserved(async (start) => {
  // Ann (level 20) may be 750 coins down a day; she has given one BIG. Push her to the edge with coins.
  db.prepare('UPDATE profiles SET coins = 5000 WHERE user_id = ?').run('ann');
  const cap = gapLimit(LEVEL);
  const left = cap - centsOf(BIG);
  const over = await offer('ann', 'cat', { coins: (left + 1) / 100 }, cards());
  assert.equal(over.status, 409); assert.equal(over.body.code, 'gap-give');
  // Cat has got one BIG already: a second friend cannot push cat past the getter's limit either.
  befriend('dan', 'cat');
  db.prepare('UPDATE profiles SET coins = 5000 WHERE user_id = ?').run('dan'); start();
  const overGet = await offer('dan', 'cat', { coins: (left + 1) / 100 }, cards());
  assert.equal(overGet.status, 409); assert.equal(overGet.body.code, 'gap-get');
  // Exactly the room that is left goes through.
  const fits = await offer('ann', 'cat', { coins: left / 100 }, cards());
  assert.equal(fits.status, 201, JSON.stringify(fits.body));
  // Two offers that each fit, made before either is accepted: only one can be taken (the trigger sums at swap time).
  const second = await offer('dan', 'cat', { coins: left / 100 }, cards());
  assert.equal(second.status, 201);
  assert.equal((await accept('cat', fits.body.trade.id)).status, 200);
  const blocked = await accept('cat', second.body.trade.id);
  assert.equal(blocked.status, 409);
  assert.equal(coins('dan'), 500000);
  // A raw write that lies about the caps is still held to the sums by the trigger only as far as the caps it is given: the Worker is the only writer.
  clock += TRADE_RULES.gapWindowMs + 1000;
  const tomorrow = await accept('cat', second.body.trade.id);
  assert.equal(tomorrow.status, 200, JSON.stringify(tomorrow.body));
  assert.equal(coins('dan'), 500000 - left);
}));

await check('two accepts of uneven offers racing each other cannot both beat the limit', async () => conserved(async (start) => {
  clock += TRADE_RULES.gapWindowMs + 1000;
  player('fay'); player('gus'); player('hal');
  befriend('fay', 'hal'); befriend('gus', 'hal');
  db.prepare("UPDATE profiles SET coins = 5000 WHERE user_id IN ('fay','gus')").run(); start();
  const cap = gapLimit(LEVEL);
  const one = await offer('fay', 'hal', { coins: cap / 100 }, cards());
  const two = await offer('gus', 'hal', { coins: cap / 100 }, cards());
  assert.equal(one.status, 201); assert.equal(two.status, 201);
  const [r1, r2] = await Promise.all([accept('hal', one.body.trade.id), accept('hal', two.body.trade.id)]);
  assert.deepEqual([r1.status, r2.status].sort(), [200, 409]);
  assert.equal(coins('hal'), 10000 + cap);
}));

await check('coins move exactly, only one way, and only if they are there', async () => ((fn) => fn())(async () => {
  clock += TRADE_RULES.gapWindowMs + 1000;
  db.prepare("UPDATE profiles SET coins = 100.55 WHERE user_id = 'bob'").run();
  db.prepare("UPDATE profiles SET coins = 3.10 WHERE user_id = 'eve'").run();
  give('eve', A10, 1);
  const both = await offer('bob', 'eve', { coins: 5 }, { coins: 5 });
  assert.equal(both.status, 400);
  const poor = await offer('eve', 'bob', { coins: 3.11 }, cards());
  assert.equal(poor.status, 409);
  // Bob buys Eve's card for its value in coins: an even trade between strangers.
  const price = centsOf(A10) / 100;
  const buy = await offer('bob', 'eve', { coins: price }, cards([A10, 1]));
  assert.equal(buy.status, 201, JSON.stringify(buy.body));
  // Bob spends the coins before Eve answers: the swap is refused and nothing moves.
  db.prepare("UPDATE profiles SET coins = 1 WHERE user_id = 'bob'").run();
  const no = await accept('eve', buy.body.trade.id);
  assert.equal(no.status, 409); assert.equal(no.body.code, 'from-coins');
  assert.equal(qty('eve', A10), 1);
  db.prepare("UPDATE profiles SET coins = 100.55 WHERE user_id = 'bob'").run();
  const yes = await accept('eve', buy.body.trade.id);
  assert.equal(yes.status, 200, JSON.stringify(yes.body));
  assert.equal(coins('bob'), 10055 - centsOf(A10));
  assert.equal(coins('eve'), 310 + centsOf(A10));
  assert.equal(qty('bob', A10), 1);
  db.prepare("UPDATE profiles SET coins = 100 WHERE user_id IN ('bob','eve')").run();
}));

await check('a card sold, staked or traded away after the offer stops the swap', async () => ((fn) => fn())(async () => {
  give('ann', A10, 1); give('bob', B10, 1);
  const made = await offer('ann', 'bob', cards([A10, 1]), cards([B10, 1]));
  assert.equal(made.status, 201, JSON.stringify(made.body));
  const id = made.body.trade.id;
  db.prepare("DELETE FROM cards WHERE user_id = 'ann' AND card_id = ?").run(A10);
  const seen = await api('bob', `/api/trades/${id}`, 'GET');
  assert.equal(seen.body.check.ok, false); assert.equal(seen.body.check.code, 'from-cards');
  const no = await accept('bob', id);
  assert.equal(no.status, 409); assert.equal(no.body.code, 'from-cards');
  assert.equal(qty('bob', B10), 1); assert.equal(qty('bob', A10), 1);
  give('ann', A10, 1);
  db.prepare("DELETE FROM cards WHERE user_id = 'bob' AND card_id = ?").run(B10);
  const no2 = await accept('bob', id);
  assert.equal(no2.status, 409); assert.equal(no2.body.code, 'to-cards');
  give('bob', B10, 1);
  assert.equal((await accept('bob', id)).status, 200);
}));

await check('the same card offered to two players goes to whoever accepts first', async () => ((fn) => fn())(async () => {
  player('ivy'); player('jon'); player('kim');
  give('ivy', A1, 1); give('jon', B1, 1); give('kim', B1, 1);
  const toJon = await offer('ivy', 'jon', cards([A1, 1]), cards([B1, 1]));
  const toKim = await offer('ivy', 'kim', cards([A1, 1]), cards([B1, 1]));
  assert.equal(toJon.status, 201); assert.equal(toKim.status, 201);
  const [r1, r2] = await Promise.all([accept('jon', toJon.body.trade.id), accept('kim', toKim.body.trade.id)]);
  assert.deepEqual([r1.status, r2.status].sort(), [200, 409]);
  assert.equal(qty('ivy', A1), 0); assert.equal(qty('ivy', B1), 1);
  assert.equal(qty('jon', A1) + qty('kim', A1), 1);
  // And the same accept pressed twice at once swaps once.
  give('ivy', A1, 1);
  const loser = r1.status === 409 ? ['jon', toJon] : ['kim', toKim];
  const [d1, d2] = await Promise.all([accept(loser[0], loser[1].body.trade.id), accept(loser[0], loser[1].body.trade.id)]);
  assert.deepEqual([d1.status, d2.status], [200, 200]);
  assert.equal(qty('ivy', A1), 0); assert.equal(qty('ivy', B1), 2);
}));

await check('slabs change owner without their guard; a slab in a casino game cannot be traded', async () => ((fn) => fn())(async () => {
  player('lee'); player('max');
  const s1 = slab('lee', A10, 10, { guard: 'guard-red', shown: 1 });
  const s2 = slab('max', B10, 9);
  const staked = slab('lee', A1, 10, { locked: 'coinflip:abc' });
  assert.equal((await offer('lee', 'max', { slabs: [staked] }, { slabs: [s2] })).status, 409, 'a staked slab cannot be offered');
  assert.equal((await offer('lee', 'max', { slabs: [s2] }, cards())).status, 409, 'someone else\'s slab cannot be offered');
  assert.equal((await offer('lee', 'max', { slabs: [s1, s1] }, cards())).status, 400);
  const v1 = Math.round(Math.max(gradedValue(cardOf(A10), 10, setForCard(A10), false), sellValue(cardOf(A10))) * 100);
  const v2 = Math.round(Math.max(gradedValue(cardOf(B10), 9, setForCard(B10), false), sellValue(cardOf(B10))) * 100);
  // Even it out with coins from whoever gets more.
  const side = v1 > v2 ? [{ slabs: [s1] }, { slabs: [s2], coins: (v1 - v2) / 100 }] : [{ slabs: [s1], coins: (v2 - v1) / 100 }, { slabs: [s2] }];
  const made = await offer('lee', 'max', side[0], side[1]);
  assert.equal(made.status, 201, JSON.stringify(made.body));
  assert.equal(Math.round(made.body.trade.give.slabs[0].value * 100), v1);
  // The partner view lists what may be traded: the staked slab is not there.
  const view = await api('max', '/api/trades/with/lee', 'GET');
  assert.deepEqual(view.body.their.slabs.map(s => s.id), [s1]);
  // Lee stakes the slab in a casino game before Max answers.
  db.prepare("UPDATE graded_cards SET locked = 'jackpot:x' WHERE id = ?").run(s1);
  const no = await accept('max', made.body.trade.id);
  assert.equal(no.status, 409); assert.equal(no.body.code, 'from-slabs');
  db.prepare('UPDATE graded_cards SET locked = NULL WHERE id = ?').run(s1);
  const yes = await accept('max', made.body.trade.id);
  assert.equal(yes.status, 200, JSON.stringify(yes.body));
  assert.deepEqual({ ...slabOwner(s1) }, { user_id: 'max', guard: null, shown: 0, request_id: `won:${s1}`, status: 'slabbed' });
  assert.equal(slabOwner(s2).user_id, 'lee');
  assert.equal(slabOwner(staked).user_id, 'lee');
  assert.ok(yes.body.save.graded.some(s => s.id === s1));
  // Trading it back works (the request id stays unique per owner).
  const back = await offer('max', 'lee', { slabs: [s1] }, { slabs: [s2], coins: side[1].coins || 0 });
  assert.equal(back.status, 201, JSON.stringify(back.body));
  assert.equal((await accept('lee', back.body.trade.id)).status, 200);
  assert.equal(slabOwner(s1).user_id, 'lee');
}));

await check('decline, cancel and counter close an offer; only the right player may', async () => ((fn) => fn())(async () => {
  player('ned'); player('oli');
  give('ned', A1, 2); give('oli', B1, 2);
  const one = (await offer('ned', 'oli', cards([A1, 1]), cards([B1, 1]))).body.trade.id;
  assert.equal((await api('oli', `/api/trades/${one}/cancel`, 'POST', {})).status, 403);
  assert.equal((await api('ned', `/api/trades/${one}/decline`, 'POST', {})).status, 403);
  assert.equal((await api('oli', `/api/trades/${one}/decline`, 'POST', {})).body.trade.status, 'declined');
  assert.equal((await accept('oli', one)).status, 409);
  const two = (await offer('ned', 'oli', cards([A1, 1]), cards([B1, 1]))).body.trade.id;
  assert.equal((await api('ned', `/api/trades/${two}/cancel`, 'POST', {})).body.trade.status, 'cancelled');
  assert.equal((await accept('oli', two)).status, 409);
  // A counter closes the offer it answers and opens one the other way, together.
  const three = (await offer('ned', 'oli', cards([A1, 1]), cards([B1, 1]))).body.trade.id;
  assert.equal((await offer('ned', 'oli', cards([A1, 1]), cards([B1, 1]), { counterOf: three })).status, 404, 'the sender cannot counter their own offer');
  const counter = await offer('oli', 'ned', cards([B1, 2]), cards([A1, 2]), { counterOf: three });
  assert.equal(counter.status, 201, JSON.stringify(counter.body));
  assert.equal(counter.body.trade.parentId, three);
  const old = await api('ned', `/api/trades/${three}`, 'GET');
  assert.equal(old.body.trade.status, 'countered'); assert.equal(old.body.counterId, counter.body.trade.id);
  assert.equal((await offer('oli', 'ned', cards([B1, 1]), cards([A1, 1]), { counterOf: three })).status, 409, 'an answered offer cannot be countered again');
  assert.equal((await accept('ned', counter.body.trade.id)).status, 200);
  assert.deepEqual([qty('ned', A1), qty('ned', B1), qty('oli', A1), qty('oli', B1)], [0, 2, 2, 0]);
}));

await check('the same request id makes one offer; offers expire', async () => {
  player('pat'); player('quo');
  give('pat', A1, 1); give('quo', B1, 1);
  const requestId = rid();
  const body = { to: 'quo', give: cards([A1, 1]), take: cards([B1, 1]), requestId };
  const [a, b] = await Promise.all([api('pat', '/api/trades', 'POST', body), api('pat', '/api/trades', 'POST', body)]);
  assert.equal(a.body.trade.id, b.body.trade.id);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM trades WHERE from_id = 'pat'").get().n, 1);
  clock += TRADE_RULES.expiryMs + 1;
  const late = await accept('quo', a.body.trade.id);
  assert.equal(late.status, 409);
  assert.equal(qty('pat', A1), 1);
  const list = await api('quo', '/api/trades', 'GET');
  assert.equal(list.body.incoming.length, 0);
  assert.equal(list.body.history[0].status, 'expired');
  // A raw accept of an expired row is refused by the trigger too.
  const fresh = (await offer('pat', 'quo', cards([A1, 1]), cards([B1, 1]))).body.trade.id;
  assert.throws(() => db.prepare(`UPDATE trades SET status = 'accepted', closed_at = expires_at + 1, give_value = 1, take_value = 1 WHERE id = ?`).run(fresh), /trade:expired/);
});

await check('who may send offers: everyone, friends, nobody; a counter still gets through', async () => {
  player('rae'); player('sam');
  give('rae', A1, 2); give('sam', B1, 2);
  assert.equal((await api('sam', '/api/trades/settings', 'POST', { from: 'sometimes' })).status, 400);
  assert.equal((await api('sam', '/api/trades/settings', 'POST', { from: 'none' })).body.from, 'none');
  const shut = await offer('rae', 'sam', cards([A1, 1]), cards([B1, 1]));
  assert.equal(shut.status, 403); assert.equal(shut.body.code, 'closed');
  assert.equal((await api('rae', '/api/trades/with/sam', 'GET')).body.can.ok, false);
  await api('sam', '/api/trades/settings', 'POST', { from: 'friends' });
  assert.equal((await offer('rae', 'sam', cards([A1, 1]), cards([B1, 1]))).body.code, 'friends-only');
  // Sam offers first; Rae may counter although Sam only takes offers from friends.
  const first = await offer('sam', 'rae', cards([B1, 1]), cards([A1, 1]));
  assert.equal(first.status, 201);
  assert.equal((await api('rae', '/api/trades/with/sam', 'GET')).body.can.ok, true);
  const counter = await offer('rae', 'sam', cards([A1, 2]), cards([B1, 2]), { counterOf: first.body.trade.id });
  assert.equal(counter.status, 201, JSON.stringify(counter.body));
  befriend('rae', 'sam');
  assert.equal((await offer('rae', 'sam', cards([A1, 1]), cards([B1, 1]))).status, 201);
  assert.equal((await api('sam', '/api/trades', 'GET')).body.from, 'friends');
});

await check('limits on what one offer and one player may hold', async () => {
  player('tom'); player('uma');
  give('tom', A1, 200); give('uma', B1, 200);
  assert.equal((await offer('tom', 'uma', cards([A1, TRADE_RULES.maxQty + 1]), cards([B1, 1]))).status, 400);
  assert.equal((await offer('tom', 'uma', cards([A1, 1]), cards([A1, 1]))).status, 400, 'a card on both sides');
  assert.equal((await offer('tom', 'uma', cards(), cards())).status, 400, 'an empty trade');
  assert.equal((await offer('tom', 'uma', cards([A1, 0]), cards())).status, 400);
  assert.equal((await offer('tom', 'uma', { cards: [{ id: "x'; DROP TABLE trades;--", qty: 1 }] }, cards())).status, 400);
  assert.equal((await offer('tom', 'uma', { coins: -5 }, cards([B1, 1]))).status, 400);
  assert.equal((await offer('tom', 'uma', { coins: 1e12 }, cards([B1, 1]))).status, 400);
  for (let i = 0; i < TRADE_RULES.maxOpenSent; i++) assert.equal((await offer('tom', 'uma', cards([A1, 1]), cards([B1, 1]))).status, 201);
  assert.equal((await offer('tom', 'uma', cards([A1, 1]), cards([B1, 1]))).status, 429);
});

await check('binder cards are locked: they cannot be offered, and a trade whose card went into a binder cannot be accepted', async () => {
  player('vic'); player('wes');
  give('vic', A1, 1); give('wes', B1, 1);
  const binder = Array.from({ length: 18 }, () => null); binder[0] = { id: A1, reverse: false }; binder[1] = { id: 'me1-1', reverse: false };
  give('vic', 'me1-1', 1);
  db.prepare('UPDATE profiles SET binder = ? WHERE user_id = ?').run(JSON.stringify(binder), 'vic');
  const refused = await offer('vic', 'wes', cards([A1, 1]), cards([B1, 1]));
  assert.equal(refused.status, 409, JSON.stringify(refused.body)); assert.match(refused.body.error, /binder/);
  const asked = await offer('wes', 'vic', cards([B1, 1]), cards([A1, 1]));
  assert.equal(asked.status, 409, 'nobody can ask for a card in your binder either'); assert.match(asked.body.error, /binder/);
  // Offered while loose, then put in the binder: the accept is refused and nothing moves.
  db.prepare('UPDATE profiles SET binder = ? WHERE user_id = ?').run('[]', 'vic');
  const made = await offer('vic', 'wes', cards([A1, 1]), cards([B1, 1]));
  assert.equal(made.status, 201, JSON.stringify(made.body));
  db.prepare('UPDATE profiles SET binder = ? WHERE user_id = ?').run(JSON.stringify(binder), 'vic');
  await conserved(async () => {
    const late = await accept('wes', made.body.trade.id);
    assert.equal(late.status, 409, JSON.stringify(late.body)); assert.match(late.body.error, /binder/);
  });
  assert.equal(qty('vic', A1), 1); assert.equal(qty('wes', B1), 1);
  const kept = JSON.parse(db.prepare("SELECT binder FROM profiles WHERE user_id = 'vic'").get().binder);
  assert.equal(kept[0].id, A1); assert.equal(kept[1].id, 'me1-1');
});

await check('the partner view shows what they hold and both daily limits', async () => {
  player('xan'); player('yui');
  give('yui', A10, 3, 1);
  const view = await api('xan', '/api/trades/with/yui', 'GET');
  assert.equal(view.status, 200);
  assert.equal(view.body.can.ok, true);
  assert.deepEqual(view.body.their.collection, { [A10]: 3 });
  assert.deepEqual(view.body.their.reverses, { [A10]: 1 });
  assert.equal(view.body.limits.mine.cap, gapLimit(LEVEL) / 100);
  assert.equal(view.body.partner.handle, 'yui');
  assert.equal(view.body.friends, false);
  assert.equal((await api('xan', '/api/trades/with/xan', 'GET')).status, 400);
});

await check('deleting an account takes its offers with it', async () => {
  const before = db.prepare("SELECT COUNT(*) n FROM trades WHERE from_id = 'tom' OR to_id = 'tom'").get().n;
  assert.ok(before > 0);
  db.prepare("UPDATE users SET password_hash = 'x' WHERE id = 'tom'").run();
  const { personalDataStmts } = await import('../worker/terms.js');
  await env.DB.batch(await personalDataStmts(env, 'tom'));
  assert.equal(db.prepare("SELECT COUNT(*) n FROM trades WHERE from_id = 'tom' OR to_id = 'tom'").get().n, 0);
});

await check('a database from before trading gets the schema from the Worker itself', async () => {
  const old = createTestDb({ upTo: '0034' });
  resetTradesSchemaCache();
  const oldReq = requester(worker, old.env, null);
  seedPlayer(old.db, { id: 'zed', session: 'zed' }); seedLevel(old.db, 'zed', LEVEL);
  assert.equal(old.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name = 'trades'").get().n, 0);
  const list = await oldReq('/api/trades', 'GET', undefined, 'zed');
  assert.equal(list.status, 200, JSON.stringify(list.body));
  const names = old.db.prepare(`SELECT name FROM sqlite_master WHERE name IN (${TRADES_OBJECTS.map(() => '?').join(',')})`).all(...TRADES_OBJECTS);
  assert.equal(names.length, TRADES_OBJECTS.length);
  resetTradesSchemaCache();
});

Date.now = realNow;
console.log(results.join('\n'));
console.log(failed ? `\n${failed} failed` : `\nall ${results.length} passed`);
process.exit(failed ? 1 : 0);
