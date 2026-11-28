// BETA TESTING (worker/beta.js): invite codes, the tester flag, and the games' money paths.
// Runs the real Worker against in-memory sqlite. Run: node scripts/test-beta.mjs
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import worker from '../worker/index.js';
import { seedLevel } from './lib/level-seed.mjs';
import { grassMultiplier, stakeCents, payoutCents, TINS, TIN_TIERS, tinLean, tinReturn, isPieceCard } from '../js/beta-rules.js';
import { GRADING_LIMITS } from '../js/grading-rules.js';
import { frameChoice } from '../worker/perks.js';

// ---- The odds: every game returns at most 95% on average --------------------------------
for (let mines = 1; mines <= 20; mines++) {
  for (let safe = 1; safe <= 25 - mines; safe++) {
    let p = 1;
    for (let i = 0; i < safe; i++) p *= (25 - mines - i) / (25 - i);
    assert.ok(grassMultiplier(mines, safe) * p <= 0.95 + 1e-9, `grass ${mines}/${safe}`);
  }
}
assert.equal(grassMultiplier(3, 0), 1);
assert.ok(Math.abs(grassMultiplier(3, 5) - 2.0) < 0.1, 'about 2x for 3 Voltorb and 5 clear tiles, as the design said');
assert.ok(isPieceCard({ name: 'Pikachu V-UNION' }) && isPieceCard({ name: 'Lugia LEGEND' }) && isPieceCard({ name: 'X', subtypes: ['V-UNION'] }));
assert.ok(!isPieceCard({ name: 'Legendary Pikachu V' }) && !isPieceCard({ name: 'Greninja BREAK', subtypes: ['BREAK'] }));
assert.equal(stakeCents(5), 500);
assert.equal(stakeCents('2.5'), 250);
assert.equal(stakeCents(0.5), null);
assert.equal(stakeCents(1001), null);
assert.equal(stakeCents(1.005), null);
assert.equal(payoutCents(100000, 1000), 5000000, 'the round cap');

// ---- The Worker ---------------------------------------------------------------------------
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
async function call(path, method = 'GET', body, sid) {
  const res = await worker.fetch(new Request('https://poke-pack.rip' + path, { method, headers: { 'content-type': 'application/json', origin: 'https://poke-pack.rip', ...(sid ? { cookie: 'pp_sid=' + sid } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }), env);
  return { status: res.status, body: await res.json(), cookie: res.headers.get('set-cookie') || '' };
}
const base = { password: 'hunter22', color: 'gold', birthYear: 1995, birthMonth: 5, agree: true };
async function signup(handle) {
  const r = await call('/api/auth/signup', 'POST', { ...base, name: handle, handle });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const sid = /pp_sid=([^;]+)/.exec(r.cookie)[1];
  const id = db.prepare('SELECT id FROM users WHERE handle = ?').get(handle).id;
  seedLevel(db, id, 10);
  db.prepare('UPDATE profiles SET coins = 1000 WHERE user_id = ?').run(id);
  return { sid, id };
}
const coinsOf = (id) => db.prepare('SELECT coins FROM profiles WHERE user_id = ?').get(id).coins;
let n = 0;
const rid = () => `req-${Date.now()}-${++n}`;

const owner = await signup('polar');
const ash = await signup('ashketch');
const misty = await signup('mistyw');

// Codes: only the owner makes them; a code works its number of times; a tester joins once.
assert.equal((await call('/api/casino/beta', 'GET', null, ash.sid)).body.member, false);
assert.equal((await call('/api/casino/beta/codes', 'POST', { count: 1 }, ash.sid)).status, 403);
const made = await call('/api/casino/beta/codes', 'POST', { count: 2, uses: 1, note: 'friends' }, owner.sid);
assert.equal(made.status, 200, JSON.stringify(made.body));
assert.equal(made.body.made.length, 2);
assert.match(made.body.made[0], /^BETA-[A-Z2-9]{6}$/);
const [code, code2] = made.body.made;
assert.equal((await call('/api/casino/beta/grass/start', 'POST', { stake: 5, mines: 3, requestId: rid() }, ash.sid)).status, 403, 'not a tester yet');
assert.equal((await call('/api/casino/beta/join', 'POST', { code: 'BETA-NOPE00' }, ash.sid)).status, 400);
const joined = await call('/api/casino/beta/join', 'POST', { code: code.toLowerCase() }, ash.sid);
assert.equal(joined.status, 200, JSON.stringify(joined.body));
assert.equal(db.prepare('SELECT beta FROM users WHERE id = ?').get(ash.id).beta, 1);
const used = await call('/api/casino/beta/join', 'POST', { code }, misty.sid);
assert.equal(used.status, 400);
assert.match(used.body.error, /used up/);
await call('/api/casino/beta/codes/revoke', 'POST', { code: code2 }, owner.sid);
assert.equal((await call('/api/casino/beta/join', 'POST', { code: code2 }, misty.sid)).status, 400, 'a revoked code');
assert.equal((await call('/api/casino/beta', 'GET', null, owner.sid)).body.codes.length, 2);
// Locked to code holders.
// The owner is always in, with the badge, without a code.
assert.equal((await call('/api/casino/beta', 'GET', null, owner.sid)).body.member, true);
assert.equal(db.prepare('SELECT beta FROM users WHERE id = ?').get(owner.id).beta, 1);
const ownerTry = await call('/api/casino/beta/tins', 'GET', null, owner.sid);
assert.equal(ownerTry.status, 200, JSON.stringify(ownerTry.body));
assert.equal((await call('/api/casino/beta/tins', 'GET', null, misty.sid)).status, 403, 'a game list is locked too');

// The Beta Tester frame: testers only.
assert.equal(frameChoice('gen-beta', 50, 0, null, false).status, 403);
assert.equal(frameChoice('gen-beta', 1, 0, null, true).value, 'gen-beta');
const wear = await call('/api/me', 'PATCH', { frame: 'gen-beta' }, ash.sid);
assert.equal(wear.status, 200, JSON.stringify(wear.body).slice(0, 200));
assert.equal((await call('/api/me', 'PATCH', { frame: 'gen-beta' }, misty.sid)).status, 403);
const prof = await call('/api/u/ashketch', 'GET');
assert.equal(prof.body.user?.beta ?? prof.body.profile?.beta ?? prof.body.beta, true, 'the beta badge shows on the profile');

// The removed games answer 404 and take nothing.
{
  db.prepare('UPDATE profiles SET coins = 1000 WHERE user_id = ?').run(ash.id);
  assert.equal((await call('/api/casino/beta/drop/play', 'POST', { risk: 'high', stake: 10, requestId: rid() }, ash.sid)).status, 404);
  assert.equal((await call('/api/casino/beta/higher/start', 'POST', { stake: 10, requestId: rid() }, ash.sid)).status, 404);
  assert.equal(coinsOf(ash.id), 1000);
}

// Tall Grass: a clear tile raises the payout, a Voltorb ends it, cashing out pays once.
{
  const s = await call('/api/casino/beta/grass/start', 'POST', { stake: 10, mines: 3, requestId: rid() }, ash.sid);
  assert.equal(s.status, 200, JSON.stringify(s.body));
  assert.equal(s.body.run.voltorb, null, 'the board stays on the server');
  assert.equal(coinsOf(ash.id), 990);
  assert.equal((await call('/api/casino/beta/grass/start', 'POST', { stake: 10, mines: 3, requestId: rid() }, ash.sid)).status, 409);
  const board = JSON.parse(db.prepare('SELECT data FROM beta_runs WHERE id = ?').get(s.body.run.id).data).board;
  const safe = [...Array(25).keys()].filter((t) => !board.includes(t));
  for (const t of safe.slice(0, 5)) {
    const r = await call('/api/casino/beta/grass/tap', 'POST', { id: s.body.run.id, tile: t }, ash.sid);
    assert.equal(r.body.run.state, 'open');
  }
  const [c1, c2] = await Promise.all([1, 2].map(() => call('/api/casino/beta/grass/cash', 'POST', { id: s.body.run.id }, ash.sid)));
  assert.equal(c1.body.run.state, 'cashed');
  assert.equal(c2.body.run.state, 'cashed');
  const pay = payoutCents(1000, grassMultiplier(3, 5)) / 100;
  assert.ok(Math.abs(coinsOf(ash.id) - (990 + pay)) < 1e-6, 'two cash-outs paid once');
  assert.ok(c1.body.run.voltorb.length === 3, 'the board shows once it is over');
  const s2 = await call('/api/casino/beta/grass/start', 'POST', { stake: 10, mines: 20, requestId: rid() }, ash.sid);
  const b2 = JSON.parse(db.prepare('SELECT data FROM beta_runs WHERE id = ?').get(s2.body.run.id).data).board;
  const boom = await call('/api/casino/beta/grass/tap', 'POST', { id: s2.body.run.id, tile: b2[0] }, ash.sid);
  assert.equal(boom.body.run.state, 'lost');
  assert.equal(boom.body.run.hit, b2[0]);
  const late = await call('/api/casino/beta/grass/cash', 'POST', { id: s2.body.run.id }, ash.sid);
  assert.equal(late.body.run.state, 'lost');
}

// A Higher or Lower run left open when the game was removed is cashed out on the player's next call: the stake
// comes back, times whatever multiplier the run had reached. Once only.
{
  db.prepare('UPDATE profiles SET coins = 1000 WHERE user_id = ?').run(ash.id);
  const put = (id, mult) => db.prepare("INSERT INTO beta_runs (id, user_id, game, request_id, stake, state, data, mult, payout, created_at) VALUES (?, ?, 'higher', ?, 2000, 'open', ?, 0, 0, ?)")
    .run(id, ash.id, rid(), JSON.stringify({ set: 'sv3pt5', pool: [], shown: [], mult }), Date.now());
  put('old-run-1', 1);
  put('old-run-2', 2.5);
  await Promise.all([1, 2, 3].map(() => call('/api/casino/beta', 'GET', null, ash.sid)));
  assert.equal(coinsOf(ash.id), 1000 + 20 + 50, 'both stakes back, one at 2.5x, paid once');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM beta_runs WHERE game = 'higher' AND state = 'open'").get().n, 0);
  await call('/api/casino/beta', 'GET', null, ash.sid);
  assert.equal(coinsOf(ash.id), 1070);
}

// Mystery Tins: a tin has a price and full odds; opening takes the price and puts the card in the collection.
{
  db.prepare('UPDATE profiles SET coins = 100000 WHERE user_id = ?').run(ash.id);
  const list = await call('/api/casino/beta/tins', 'GET', null, ash.sid);
  assert.equal(list.status, 200, JSON.stringify(list.body).slice(0, 300));
  assert.ok(list.body.tins.length >= 3, `tins: ${list.body.tins.map((t) => t.name)}`);
  for (const t of list.body.tins) {
    const sum = t.cards.reduce((s, c) => s + c.odds, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9);
    const ev = t.cards.reduce((s, c) => s + c.odds * c.price, 0);
    assert.ok(ev <= t.price * 0.95 + 0.01, `${t.name} returns ${ev / t.price}`);
    assert.ok(t.back > 0.5 && t.back <= 0.95, `${t.name} says it returns ${t.back}`);
    assert.ok(!t.sets, 'a tin never names its sets');
    assert.ok(!t.cards.some((c) => /V-UNION|LEGEND$/.test(c.name)), `${t.name} holds a piece of a multi-card card`);
    // Every tin sits on a shelf, costs what its rule says or more, and returns its shelf's share: never more, and not far under.
    const rule = TINS.find((x) => x.id === t.id);
    const tier = TIN_TIERS.find((x) => x.id === t.tier);
    assert.ok(rule && tier && rule.tier === tier.id, `${t.name} has no shelf`);
    assert.ok(t.price >= rule.price, `${t.name} costs less than its rule`);
    assert.ok(t.back <= (rule.back || tier.back) + 0.0005, `${t.name} returns ${t.back}, over its shelf's ${tier.back}`);
    assert.ok(t.back >= (rule.back || tier.back) - 0.05, `${t.name} returns ${t.back}, far under its shelf's ${tier.back}`);
    assert.equal(t.slab, Boolean(rule.slab));
    if (t.slab) assert.ok(t.cards.every((c) => rule.slab.includes(c.grade) && c.price > 0 && !('band' in c)), `${t.name} holds a card with no grade`);
    else assert.ok(t.cards.every((c) => !c.grade));
  }
  // The shelves run cheapest first and each returns more than the one before; every shelf has tins on it.
  for (let i = 0; i < TIN_TIERS.length; i++) {
    const on = list.body.tins.filter((t) => t.tier === TIN_TIERS[i].id);
    assert.ok(on.length >= 5, `${TIN_TIERS[i].name} holds ${on.length} tins`);
    if (!i) continue;
    assert.ok(TIN_TIERS[i].back > TIN_TIERS[i - 1].back && TIN_TIERS[i].back <= 0.95);
    assert.ok(Math.min(...on.map((t) => t.price)) > Math.max(...list.body.tins.filter((t) => t.tier === TIN_TIERS[i - 1].id).map((t) => t.price)), `${TIN_TIERS[i].name} overlaps the shelf below`);
  }
  assert.ok(new Set(TINS.map((t) => t.id)).size === TINS.length, 'two tins share an id');
  // The lean: solved so the return lands on the target or just under, 0 when even odds are already under, null when nothing can be.
  {
    const values = [10, 20, 50, 400, 9000, 120000];
    const lean = tinLean(values, 300);
    assert.ok(lean > 0 && tinReturn(values, lean) <= 300 && tinReturn(values, lean) > 299.9);
    assert.equal(tinLean(values, 1e9), 0);
    assert.equal(tinLean(values, 5), null);
  }
  const tin = list.body.tins[0];
  const o = await call('/api/casino/beta/tins/open', 'POST', { tin: tin.id, price: tin.price, requestId: rid() }, ash.sid);
  assert.equal(o.status, 200, JSON.stringify(o.body));
  assert.ok(Math.abs(coinsOf(ash.id) - (100000 - tin.price)) < 1e-6);
  assert.equal(db.prepare('SELECT qty FROM cards WHERE user_id = ? AND card_id = ?').get(ash.id, o.body.run.card.id).qty >= 1, true);
  assert.ok(TINS.some((t) => t.id === tin.id));
  // Five at once: one payment, five cards, the same answer if the tap is sent twice, and nothing if the coins fall short.
  const before = coinsOf(ash.id);
  const cardsBefore = db.prepare('SELECT COALESCE(SUM(qty), 0) AS n FROM cards WHERE user_id = ?').get(ash.id).n;
  const requestId = rid();
  const [m1, m2] = await Promise.all([1, 2].map(() => call('/api/casino/beta/tins/open', 'POST', { tin: tin.id, price: tin.price, count: 5, requestId }, ash.sid)));
  assert.equal(m1.status, 200, JSON.stringify(m1.body));
  assert.equal(m1.body.runs.length, 5);
  assert.deepEqual(m1.body.runs.map((r) => r.id).sort(), m2.body.runs.map((r) => r.id).sort());
  assert.ok(Math.abs(coinsOf(ash.id) - (before - tin.price * 5)) < 1e-6, 'five tins paid for once');
  assert.equal(db.prepare('SELECT COALESCE(SUM(qty), 0) AS n FROM cards WHERE user_id = ?').get(ash.id).n, cardsBefore + 5);
  assert.equal((await call('/api/casino/beta/tins/open', 'POST', { tin: tin.id, price: tin.price, count: 6, requestId: rid() }, ash.sid)).status, 400);
  db.prepare('UPDATE profiles SET coins = ? WHERE user_id = ?').run(tin.price * 3, ash.id);
  const short = await call('/api/casino/beta/tins/open', 'POST', { tin: tin.id, price: tin.price, count: 5, requestId: rid() }, ash.sid);
  assert.equal(short.status, 400);
  assert.ok(Math.abs(coinsOf(ash.id) - tin.price * 3) < 1e-6, 'nothing taken when five cannot be paid for');
  assert.equal(db.prepare('SELECT COALESCE(SUM(qty), 0) AS n FROM cards WHERE user_id = ?').get(ash.id).n, cardsBefore + 5);
  db.prepare('UPDATE profiles SET coins = 100000 WHERE user_id = ?').run(ash.id);
  // A slab tin: the price is taken and the slab is minted into the case, once, as a casino slab (no fee, no grading credit).
  {
    const slabTin = list.body.tins.find((t) => t.slab);
    assert.ok(slabTin, 'no slab tin');
    const slabsOf = () => db.prepare("SELECT card_id, grade, band, fee_cents, request_id, status FROM graded_cards WHERE user_id = ?").all(ash.id);
    const had = slabsOf().length;
    const rawBefore = db.prepare('SELECT COALESCE(SUM(qty), 0) AS n FROM cards WHERE user_id = ?').get(ash.id).n;
    const requestId = rid();
    const [s1, s2] = await Promise.all([1, 2].map(() => call('/api/casino/beta/tins/open', 'POST', { tin: slabTin.id, price: slabTin.price, count: 2, requestId }, ash.sid)));
    assert.equal(s1.status, 200, JSON.stringify(s1.body));
    assert.equal(s2.status, 200, JSON.stringify(s2.body));
    assert.ok(Math.abs(coinsOf(ash.id) - (100000 - slabTin.price * 2)) < 1e-6, 'two slab tins paid for once');
    const minted = slabsOf().slice(had);
    assert.equal(minted.length, 2, 'two slabs minted, once');
    for (const [i, run] of s1.body.runs.entries()) {
      const row = minted.find((m) => m.request_id === `casino:tins:${i ? `${requestId}-${i}` : requestId}:0`);
      assert.ok(row, 'a slab for each tin');
      assert.equal(row.card_id, run.card.id);
      assert.equal(row.grade, run.card.grade);
      assert.ok(row.band && row.fee_cents === 0 && row.status === 'slabbed');
    }
    assert.equal(db.prepare('SELECT COALESCE(SUM(qty), 0) AS n FROM cards WHERE user_id = ?').get(ash.id).n, rawBefore, 'a slab tin adds no raw card');
    // A full case: nothing is taken.
    const fill = db.prepare("INSERT INTO graded_cards (user_id, card_id, reverse, grade, band, fee_cents, request_id, status, created_at) VALUES (?, ?, 0, 9, 'sv', 0, ?, 'slabbed', ?)");
    for (let i = slabsOf().length; i < GRADING_LIMITS.maxSlabs; i++) fill.run(ash.id, minted[0].card_id, `fill:${i}`, Date.now());
    const coinsFull = coinsOf(ash.id);
    const fullCase = await call('/api/casino/beta/tins/open', 'POST', { tin: slabTin.id, price: slabTin.price, requestId: rid() }, ash.sid);
    assert.equal(fullCase.status, 409, JSON.stringify(fullCase.body));
    assert.equal(coinsOf(ash.id), coinsFull);
    db.prepare("DELETE FROM graded_cards WHERE user_id = ? AND request_id LIKE 'fill:%'").run(ash.id);
    db.prepare('UPDATE profiles SET coins = 100000 WHERE user_id = ?').run(ash.id);
  }
}

// Rayquaza was taken down: nothing new can be bet, a round that had ended settles as it always did, and a round caught
// in the air gives open bets their stake back. The tables stay as the record.
{
  db.prepare('UPDATE profiles SET coins = 1000 WHERE user_id = ?').run(ash.id);
  const now = Date.now();
  const round = db.prepare('INSERT INTO rocket_rounds (id, crash, launch_at, pop_at, end_at) VALUES (?, ?, ?, ?, ?)');
  const bet = db.prepare("INSERT INTO rocket_bets (round_id, user_id, stake, auto, status, request_id, created_at) VALUES (?, ?, ?, ?, 'open', ?, ?)");
  round.run(9001, 3, now - 60000, now - 30000, now - 26000); // ended: an auto of 2x was reached
  bet.run(9001, ash.id, 1000, 2, rid(), now - 61000);
  round.run(9002, 50, now - 5000, now + 30000, now + 33500); // still in the air
  bet.run(9002, ash.id, 2500, 40, rid(), now - 6000);
  const gone = await call('/api/casino/beta/rocket', 'GET', null, ash.sid);
  assert.equal(gone.status, 410, JSON.stringify(gone.body));
  assert.equal(coinsOf(ash.id), 1000 + 20 + 25, 'the ended round pays 2x of 10, the flying one hands back 25');
  const noBet = await call('/api/casino/beta/rocket/bet', 'POST', { round: 9002, stake: 10, auto: 2, requestId: rid() }, ash.sid);
  assert.equal(noBet.status, 410);
  await call('/api/casino/beta', 'GET', null, ash.sid);
  assert.equal(coinsOf(ash.id), 1045, 'closed out once');
  const rows = db.prepare('SELECT round_id, status, payout FROM rocket_bets WHERE round_id >= 9001 ORDER BY round_id').all();
  assert.deepEqual(rows.map((r) => [r.status, r.payout]), [['won', 2000], ['refunded', 2500]]);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM rocket_rounds WHERE settled = 0').get().n, 0);
}

console.log('beta ok');
