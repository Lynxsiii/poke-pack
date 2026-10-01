/* Binder looks and profile looks: defaults, validation, owned editions, buying, public payloads, the wall.
   Runs the real Worker against in-memory SQLite (Node 22+): node scripts/test-binder-looks.mjs */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker from '../worker/index.js';
import { resetBinderLookSchemaCache, ensureBinderLookSchema, BINDER_LOOK_DDL } from '../worker/binder-look.js';
import { resetSocialSchemaCache, ensureSocialSchema } from '../worker/social.js';
import { BINDER_EDITIONS, BINDER_NAME_MAX, DEFAULT_BINDER_LOOK, editionPrice } from '../js/binder-looks.js';
import { CHASING_MAX, DEFAULT_PROFILE_LOOK, PROFILE_SECTIONS, wallIsOff } from '../js/profile-look.js';
import { createTestDb, requester, seedPlayer } from './lib/d1-test-db.mjs';

const results = [];
let failed = 0;
async function check(name, fn) {
  try { await fn(); results.push(`PASS  ${name}`); }
  catch (err) { failed++; results.push(`FAIL  ${name}\n      ${String(err?.stack || err).split('\n').slice(0, 14).join('\n      ')}`); }
}

// A database as it was before this feature: every migration up to 0022 (no binder_editions, no look columns).
const { db, env } = createTestDb({ upTo: '0022' });
const tableNames = () => db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name);
const userCols = () => db.prepare('PRAGMA table_info(users)').all().map((r) => r.name);
assert.ok(!tableNames().includes('binder_editions') && !userCols().includes('binder_look') && !userCols().includes('profile_look'));

seedPlayer(db, { id: 'host', handle: 'host', coins: 40 });
seedPlayer(db, { id: 'poor', handle: 'poor', coins: 10 });
seedPlayer(db, { id: 'guest', handle: 'guest', coins: 5 });
const api = requester(worker, env, 'host-session');
const as = (who) => (path, method, body) => api(path, method, body, who === null ? null : `${who}-session`);
const host = as('host'), poor = as('poor'), guest = as('guest'), anon = as(null);
const coins = (id) => db.prepare('SELECT coins FROM profiles WHERE user_id = ?').get(id).coins;
const editionRows = (id) => db.prepare('SELECT edition_id FROM binder_editions WHERE user_id = ? ORDER BY edition_id').all(id).map((r) => r.edition_id);
const purchaseRows = (id) => db.prepare("SELECT kind, item_id, qty, cents FROM gear_purchases WHERE user_id = ? AND kind = 'binder-edition'").all(id).map((r) => ({ ...r }));
const plain = (v) => JSON.parse(JSON.stringify(v));
const buy = (who, editionId, requestId, extra) => who('/api/binder/editions/buy', 'POST', { editionId, requestId, ...extra });
const wallOff = (on = false) => ({ profileLook: { sections: PROFILE_SECTIONS.map((s) => ({ id: s.id, on: s.id === 'wall' ? on : true })) } });

const AURORA = editionPrice('aurora'), EMBER = editionPrice('ember');
assert.ok(AURORA > 10 && AURORA + EMBER <= 40 && AURORA + EMBER + editionPrice('holo') > 40, 'the fixture coins fit the catalog prices');

// ---- Old accounts -----------------------------------------------------------------
await check('an account from before looks gets the default of both and owns no edition', async () => {
  const r = await host('/api/me');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.user.binderLook, DEFAULT_BINDER_LOOK);
  assert.deepEqual(r.body.user.profileLook, DEFAULT_PROFILE_LOOK);
  assert.deepEqual(r.body.user.binderEditions, []);
  assert.ok(tableNames().includes('binder_editions'), 'the table is made on first use');
});

await check('the public profile of an old account carries the defaults and no ownership list', async () => {
  const r = await anon('/api/u/host');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.user.binderLook, DEFAULT_BINDER_LOOK);
  assert.deepEqual(r.body.user.profileLook, DEFAULT_PROFILE_LOOK);
  assert.equal('binderEditions' in r.body.user, false);
});

// ---- Saving -----------------------------------------------------------------------
const VALID_BINDER = { v: 1, name: 'Binder One', material: 'leather', color: 'navy', accent: 'brass', hardware: 'rings', pockets: 'smoke', page: 'cream', edition: '' };
const VALID_PROFILE = {
  v: 1, tint: 'teal', backdrop: 'grid', hero: 'plain', showcase: 'stage', chasing: 'Umbreon alt art',
  sections: [{ id: 'wall', on: true }, { id: 'showcase', on: true }, { id: 'binder', on: false }, { id: 'mastery', on: true }, { id: 'graded', on: true }],
};

await check('a valid look saves, comes back on the trainer and persists', async () => {
  const r = await host('/api/me', 'PATCH', { binderLook: VALID_BINDER, profileLook: VALID_PROFILE });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.user.binderLook, VALID_BINDER);
  assert.deepEqual(r.body.user.profileLook, VALID_PROFILE);
  assert.deepEqual(plain((await host('/api/me')).body.user.binderLook), VALID_BINDER);
  assert.deepEqual(plain((await host('/api/me')).body.user.profileLook), VALID_PROFILE);
  assert.deepEqual(JSON.parse(db.prepare('SELECT binder_look FROM users WHERE id = ?').get('host').binder_look), VALID_BINDER);
});

await check('the public profile carries both looks as saved, still without the ownership list', async () => {
  const r = await anon('/api/u/host');
  assert.deepEqual(r.body.user.binderLook, VALID_BINDER);
  assert.deepEqual(r.body.user.profileLook, VALID_PROFILE);
  assert.equal('binderEditions' in r.body.user, false);
  assert.equal(JSON.stringify(r.body).includes('binderEditions'), false);
  // Signed in as someone else: still not shown.
  assert.equal(JSON.stringify((await guest('/api/u/host')).body).includes('binderEditions'), false);
});

await check('invalid ids are normalised, text is cleaned, nothing is refused', async () => {
  const r = await host('/api/me', 'PATCH', {
    binderLook: { v: 99, name: '  A   very   long   binder   name   indeed  ', material: 'wood', color: '#ff00ff', accent: 'nope', hardware: 5, pockets: 'x', page: null, edition: 'bogus' },
    profileLook: {
      tint: 'hotpink', backdrop: 'plaid', hero: 'x', showcase: 'carousel', chasing: ' '.repeat(3) + 'z'.repeat(80),
      sections: [{ id: 'binder', on: false }, { id: 'nope', on: true }, { id: 'binder', on: true }, 'wall'],
    },
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const b = r.body.user.binderLook;
  assert.deepEqual({ ...b, name: undefined }, { ...DEFAULT_BINDER_LOOK, name: undefined });
  assert.equal(b.name, 'A very long binder name'.slice(0, BINDER_NAME_MAX));
  assert.ok(b.name.length <= BINDER_NAME_MAX);
  const p = r.body.user.profileLook;
  assert.equal(p.chasing, 'z'.repeat(CHASING_MAX));
  assert.deepEqual(p.sections, [{ id: 'binder', on: false }, { id: 'wall', on: true }, { id: 'mastery', on: true }, { id: 'showcase', on: true }, { id: 'graded', on: true }]);
  assert.deepEqual({ ...p, sections: null, chasing: '' }, { ...DEFAULT_PROFILE_LOOK, sections: null, chasing: '' });
});

await check('junk bodies normalise: a string, an array, a JSON string', async () => {
  let r = await host('/api/me', 'PATCH', { binderLook: [1, 2], profileLook: 42 });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.user.binderLook, DEFAULT_BINDER_LOOK);
  assert.deepEqual(r.body.user.profileLook, DEFAULT_PROFILE_LOOK);
  r = await host('/api/me', 'PATCH', { binderLook: JSON.stringify({ material: 'cloth', color: 'wine' }) });
  assert.equal(r.body.user.binderLook.material, 'cloth');
  assert.equal(r.body.user.binderLook.color, 'wine');
  assert.equal(r.body.user.binderLook.hardware, 'none');
});

await check('a body without the keys leaves both looks exactly as they were; a PATCH is a whole look, not a merge', async () => {
  await host('/api/me', 'PATCH', { binderLook: VALID_BINDER, profileLook: VALID_PROFILE });
  const before = db.prepare('SELECT binder_look, profile_look FROM users WHERE id = ?').get('host');
  const r = await host('/api/me', 'PATCH', { bio: 'hello' });
  assert.equal(r.status, 200);
  assert.deepEqual(plain(db.prepare('SELECT binder_look, profile_look FROM users WHERE id = ?').get('host')), plain(before));
  assert.deepEqual(r.body.user.binderLook, VALID_BINDER);
  const partial = await host('/api/me', 'PATCH', { binderLook: { color: 'rose' } });
  assert.deepEqual(partial.body.user.binderLook, { ...DEFAULT_BINDER_LOOK, color: 'rose' });
  assert.deepEqual(partial.body.user.profileLook, VALID_PROFILE, 'the other look is untouched');
});

await check('null or empty resets to the default and stores NULL; a never-customised account stays NULL', async () => {
  await host('/api/me', 'PATCH', { binderLook: VALID_BINDER, profileLook: VALID_PROFILE });
  let r = await host('/api/me', 'PATCH', { binderLook: null, profileLook: '' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.user.binderLook, DEFAULT_BINDER_LOOK);
  assert.deepEqual(r.body.user.profileLook, DEFAULT_PROFILE_LOOK);
  assert.deepEqual(plain(db.prepare('SELECT binder_look, profile_look FROM users WHERE id = ?').get('host')), { binder_look: null, profile_look: null });
  r = await guest('/api/me', 'PATCH', { bio: 'hi' });
  assert.equal(r.status, 200);
  assert.deepEqual(plain(db.prepare('SELECT binder_look, profile_look FROM users WHERE id = ?').get('guest')), { binder_look: null, profile_look: null });
});

await check('a stored value that is garbage or from a later version still reads as a complete look', async () => {
  db.prepare('UPDATE users SET binder_look = ?, profile_look = ? WHERE id = ?').run('{{not json', '[1,2,3]', 'poor');
  let r = await poor('/api/me');
  assert.deepEqual(r.body.user.binderLook, DEFAULT_BINDER_LOOK);
  assert.deepEqual(r.body.user.profileLook, DEFAULT_PROFILE_LOOK);
  db.prepare('UPDATE users SET binder_look = ?, profile_look = ? WHERE id = ?').run(JSON.stringify({ v: 7, material: 'quartz', color: 'navy', future: true }), JSON.stringify({ tint: 'cards', sections: [{ id: 'mastery', on: true }] }), 'poor');
  r = await anon('/api/u/poor');
  assert.equal(r.body.user.binderLook.material, 'classic');
  assert.equal(r.body.user.binderLook.color, 'navy');
  assert.equal(r.body.user.binderLook.future, undefined);
  assert.equal(r.body.user.profileLook.tint, 'cards');
  assert.deepEqual(r.body.user.profileLook.sections.map((s) => s.id), PROFILE_SECTIONS.map((s) => s.id));
  db.prepare('UPDATE users SET binder_look = NULL, profile_look = NULL WHERE id = ?').run('poor');
});

// ---- Editions: owning and buying ----------------------------------------------------
await check('an edition the account does not own is refused (400) and nothing else in that PATCH is saved', async () => {
  const before = db.prepare('SELECT binder_look, bio FROM users WHERE id = ?').get('host');
  const r = await host('/api/me', 'PATCH', { bio: 'should not stick', binderLook: { ...VALID_BINDER, edition: 'aurora' } });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'Buy that edition first.');
  assert.deepEqual(plain(db.prepare('SELECT binder_look, bio FROM users WHERE id = ?').get('host')), plain(before));
  assert.equal(editionRows('host').length, 0);
});

await check('buying needs a session, this site, JSON, a requestId and a real edition', async () => {
  assert.equal((await buy(anon, 'aurora', 'req-anon-0001')).status, 401);
  const cross = await worker.fetch(new Request('https://poke-pack.rip/api/binder/editions/buy', {
    method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example', cookie: 'pp_sid=host-session' }, body: JSON.stringify({ editionId: 'aurora', requestId: 'req-cross-0001' }),
  }), env);
  assert.equal(cross.status, 403);
  const text = await worker.fetch(new Request('https://poke-pack.rip/api/binder/editions/buy', {
    method: 'POST', headers: { 'content-type': 'text/plain', origin: 'https://poke-pack.rip', cookie: 'pp_sid=host-session' }, body: JSON.stringify({ editionId: 'aurora', requestId: 'req-text-0001' }),
  }), env);
  assert.equal(text.status, 400);
  assert.equal((await buy(host, 'aurora', 'x')).status, 400, 'requestId too short');
  assert.equal((await buy(host, 'aurora', undefined)).status, 400);
  assert.equal((await buy(host, 'no-such-edition', 'req-bogus-0001')).status, 400);
  assert.equal((await buy(host, '', 'req-empty-0001')).status, 400);
  assert.equal((await host('/api/binder/editions/buy', 'GET')).status, 404);
  assert.equal(coins('host'), 40);
  assert.equal(editionRows('host').length, 0);
  assert.equal(purchaseRows('host').length, 0);
});

await check('not enough coins: 402, coins unchanged, nothing owned, no purchase row', async () => {
  assert.ok(coins('poor') < AURORA, 'the fixture is short');
  const r = await buy(poor, 'aurora', 'req-poor-0001');
  assert.equal(r.status, 402);
  assert.equal(r.body.error, 'Not enough coins.');
  assert.equal(coins('poor'), 10);
  assert.deepEqual(editionRows('poor'), []);
  assert.deepEqual(purchaseRows('poor'), []);
  assert.equal((await buy(guest, 'prism', 'req-guest-0001')).status, 402);
  assert.equal(coins('guest'), 5);
});

await check('buying: coins debited by the price, edition owned, purchase recorded, response shape', async () => {
  const r = await buy(host, 'aurora', 'req-aurora-0001');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(plain(r.body), { ok: true, binderEditions: ['aurora'], coins: 40 - AURORA });
  assert.equal(coins('host'), 40 - AURORA);
  assert.deepEqual(editionRows('host'), ['aurora']);
  assert.deepEqual(purchaseRows('host'), [{ kind: 'binder-edition', item_id: 'aurora', qty: 1, cents: AURORA * 100 }]);
  assert.deepEqual((await host('/api/me')).body.user.binderEditions, ['aurora']);
  assert.equal(coins('poor'), 10, 'nobody else paid');
});

await check('the same requestId replayed is a no-op: no second charge, same answer', async () => {
  const r = await buy(host, 'aurora', 'req-aurora-0001');
  assert.equal(r.status, 200);
  assert.deepEqual(plain(r.body), { ok: true, binderEditions: ['aurora'], coins: 40 - AURORA });
  assert.equal(coins('host'), 40 - AURORA);
  assert.equal(purchaseRows('host').length, 1);
  const other = await buy(host, 'ember', 'req-aurora-0001');
  assert.equal(other.status, 409, 'a requestId cannot be reused for a different edition');
  assert.equal(coins('host'), 40 - AURORA);
  assert.deepEqual(editionRows('host'), ['aurora']);
});

await check('buying the same edition again with a new requestId is refused and costs nothing', async () => {
  const r = await buy(host, 'aurora', 'req-aurora-0002');
  assert.equal(r.status, 409);
  assert.equal(r.body.error, 'You already own that edition.');
  assert.equal(coins('host'), 40 - AURORA);
  assert.equal(purchaseRows('host').length, 1);
});

await check('with the edition owned, a look wearing it saves and shows on the profile', async () => {
  const look = { ...VALID_BINDER, edition: 'aurora' };
  const r = await host('/api/me', 'PATCH', { binderLook: look });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.user.binderLook, look);
  assert.deepEqual(r.body.user.binderEditions, ['aurora']);
  assert.equal((await anon('/api/u/host')).body.user.binderLook.edition, 'aurora');
  // Another edition is still refused for this account.
  assert.equal((await host('/api/me', 'PATCH', { binderLook: { ...look, edition: 'prism' } })).status, 400);
  assert.equal((await host('/api/me')).body.user.binderLook.edition, 'aurora');
});

await check('a second edition: charged once more, both owned, list ordered by purchase', async () => {
  const left = coins('host');
  assert.ok(left >= EMBER);
  const r = await buy(host, 'ember', 'req-ember-0001');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.binderEditions, ['aurora', 'ember']);
  assert.equal(coins('host'), left - EMBER);
  assert.ok(coins('host') < editionPrice('holo'));
  assert.equal((await buy(host, 'holo', 'req-holo-00001')).status, 402);
  assert.equal(coins('host'), left - EMBER);
});

await check('two taps at once cost one purchase, with the same or a different requestId', async () => {
  seedPlayer(db, { id: 'racer', handle: 'racer', coins: 100 });
  const racer = as('racer');
  const same = await Promise.all([buy(racer, 'tide', 'req-race-0001'), buy(racer, 'tide', 'req-race-0001')]);
  assert.deepEqual(same.map((r) => r.status), [200, 200]);
  assert.equal(coins('racer'), 100 - editionPrice('tide'));
  const diff = await Promise.all([buy(racer, 'starfield', 'req-race-0002'), buy(racer, 'starfield', 'req-race-0003')]);
  assert.deepEqual(diff.map((r) => r.status).sort(), [200, 409]);
  assert.equal(coins('racer'), 100 - editionPrice('tide') - editionPrice('starfield'));
  assert.deepEqual(editionRows('racer'), ['starfield', 'tide']);
  assert.equal(purchaseRows('racer').length, 2);
});

await check('a buy that dies mid-batch changes nothing (coins, edition and ledger move together)', async () => {
  seedPlayer(db, { id: 'crashy', handle: 'crashy', coins: 50 });
  // The insert into binder_editions fails: the coin debit before it must roll back.
  db.exec("CREATE TRIGGER no_prism BEFORE INSERT ON binder_editions WHEN NEW.edition_id = 'prism' BEGIN SELECT RAISE(ABORT, 'test: refused'); END");
  const res = await worker.fetch(new Request('https://poke-pack.rip/api/binder/editions/buy', {
    method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://poke-pack.rip', cookie: 'pp_sid=crashy-session' }, body: JSON.stringify({ editionId: 'prism', requestId: 'req-crash-0001' }),
  }), env).catch((err) => ({ status: 500, err }));
  db.exec('DROP TRIGGER no_prism');
  assert.ok(res.status >= 500 || res.err);
  assert.equal(coins('crashy'), 50);
  assert.deepEqual(editionRows('crashy'), []);
  assert.deepEqual(purchaseRows('crashy'), []);
});

// ---- Public payloads and slim users ---------------------------------------------------
await check('ownership never leaves the account: not on /api/u, the lounge, chat or anyone else\'s /api/me', async () => {
  const chat = await host('/api/chat', 'POST', { body: 'hello lounge' });
  assert.equal(chat.status, 200, JSON.stringify(chat.body));
  const lounge = await anon('/api/lounge');
  assert.equal(lounge.status, 200);
  const text = JSON.stringify(lounge.body);
  for (const key of ['binderEditions', 'binderLook', 'profileLook']) {
    assert.equal(text.includes(key), false, `${key} in the lounge`);
    assert.equal(JSON.stringify(chat.body).includes(key), false, `${key} in the chat reply`);
  }
  assert.deepEqual((await guest('/api/me')).body.user.binderEditions, []);
});

await check('other routes that carry users still work (friends, dms, battles list)', async () => {
  for (const path of ['/api/friends', '/api/dms']) assert.equal((await host(path)).status, 200, path);
  assert.equal((await guest('/api/friends/request', 'POST', { handle: 'host' })).status, 200);
});

// ---- The wall ------------------------------------------------------------------------
const noteCount = () => db.prepare('SELECT COUNT(*) n FROM profile_comments').get().n;
const freshGap = () => db.prepare('UPDATE presence SET last_comment_at = 0').run();

await check('wall on (the default): another trainer can leave a note', async () => {
  await host('/api/me', 'PATCH', { profileLook: null });
  const r = await guest('/api/u/host/comments', 'POST', { body: 'nice binder' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(noteCount(), 1);
  assert.equal((await anon('/api/u/host')).body.comments.length, 1);
});

await check('wall off: notes from others are refused 403, existing rows are kept, the owner may still post', async () => {
  const set = await host('/api/me', 'PATCH', wallOff(false));
  assert.equal(set.status, 200);
  assert.equal(wallIsOff(set.body.user.profileLook), true);
  freshGap();
  const r = await guest('/api/u/host/comments', 'POST', { body: 'still here?' });
  assert.equal(r.status, 403);
  assert.equal(r.body.error, 'This trainer has turned their wall off.');
  assert.equal(noteCount(), 1, 'nothing deleted, nothing added');
  // Someone not signed in is refused as before, not as a wall matter.
  assert.equal((await anon('/api/u/host/comments', 'POST', { body: 'x' })).status, 401);
  // The owner can still read and write on their own wall.
  const mine = await host('/api/u/host/comments', 'POST', { body: 'a note to self' });
  assert.equal(mine.status, 200, JSON.stringify(mine.body));
  assert.equal(noteCount(), 2);
  const owner = await host('/api/u/host');
  assert.equal(owner.body.comments.length, 2, 'the owner still reads every note');
  // Strangers get no notes while it is off (nothing is lost: they come back with the wall).
  assert.deepEqual((await anon('/api/u/host')).body.comments, []);
  assert.deepEqual((await guest('/api/u/host')).body.comments, []);
  // Another trainer's wall is unaffected.
  freshGap();
  assert.equal((await host('/api/u/guest/comments', 'POST', { body: 'hi guest' })).status, 200);
});

await check('wall back on: strangers see the old notes again and can post', async () => {
  await host('/api/me', 'PATCH', wallOff(true));
  assert.equal((await anon('/api/u/host')).body.comments.length, 2);
  freshGap();
  assert.equal((await guest('/api/u/host/comments', 'POST', { body: 'welcome back' })).status, 200);
});

// ---- Reset, schema, migration ---------------------------------------------------------
await check('a progress reset takes the editions and the look wearing one; the rest of the look stays', async () => {
  assert.deepEqual((await host('/api/me')).body.user.binderEditions.includes('aurora'), true);
  await host('/api/me', 'PATCH', { binderLook: { ...VALID_BINDER, edition: 'aurora' } });
  const r = await host('/api/me/reset', 'POST');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.user.binderEditions, []);
  assert.equal(r.body.user.binderLook.edition, '');
  assert.equal(r.body.user.binderLook.material, 'leather');
  assert.deepEqual(editionRows('host'), []);
  assert.equal(purchaseRows('host').length, 0);
  assert.deepEqual(editionRows('racer'), ['starfield', 'tide'], 'other accounts keep theirs');
  assert.equal((await host('/api/me', 'PATCH', { binderLook: { ...VALID_BINDER, edition: 'aurora' } })).status, 400);
  assert.equal((await buy(host, 'aurora', 'req-aurora-0003')).status, 200, 'after a reset the edition can be bought again');
});

await check('the schema is additive and re-runnable: running it again changes no row and adds no column', async () => {
  const snap = () => ({
    users: plain(db.prepare('SELECT * FROM users ORDER BY id').all()),
    profiles: plain(db.prepare('SELECT * FROM profiles ORDER BY user_id').all()),
    editions: plain(db.prepare('SELECT * FROM binder_editions ORDER BY user_id, edition_id').all()),
    ledger: plain(db.prepare('SELECT * FROM gear_purchases ORDER BY user_id, request_id').all()),
    notes: plain(db.prepare('SELECT * FROM profile_comments ORDER BY id').all()),
  });
  const before = snap();
  const cols = userCols();
  for (let i = 0; i < 2; i++) {
    resetBinderLookSchemaCache(); resetSocialSchemaCache();
    await ensureSocialSchema(env); await ensureBinderLookSchema(env);
  }
  assert.deepEqual(snap(), before);
  assert.deepEqual(userCols(), cols);
  assert.equal(cols.filter((c) => c === 'binder_look').length, 1);
  assert.equal(cols.filter((c) => c === 'profile_look').length, 1);
  // The migration file does the same as the runtime DDL, and can be applied over a live database.
  const sql = readFileSync(new URL('../worker/migrations/0025_binder_looks.sql', import.meta.url), 'utf8');
  db.exec(sql); db.exec(sql);
  assert.deepEqual(snap(), before);
  assert.ok(!/ALTER TABLE/i.test(sql.replace(/--.*$/gm, '')), 'the migration adds no column: those are made at runtime');
  assert.ok(BINDER_LOOK_DDL.some((s) => /binder_editions/.test(s)));
  assert.equal(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name = 'binder_editions'").get().n, 1);
});

await check('the migration alone gives a database the editions table and the Worker the rest', async () => {
  const fresh = createTestDb(); // every migration, 0025 included
  assert.ok(fresh.db.prepare("SELECT name FROM sqlite_master WHERE name = 'binder_editions'").get());
  assert.ok(!fresh.db.prepare('PRAGMA table_info(users)').all().some((c) => c.name === 'binder_look'));
});

await check('the catalog and the Worker agree: every edition has a price the Worker charges', async () => {
  seedPlayer(db, { id: 'whale', handle: 'whale', coins: 1000 });
  const whale = as('whale');
  let spent = 0;
  for (const e of BINDER_EDITIONS) {
    const r = await buy(whale, e.id, `req-whale-${e.id}`);
    assert.equal(r.status, 200, e.id);
    spent += e.price;
    assert.equal(coins('whale'), 1000 - spent, e.id);
  }
  assert.deepEqual(editionRows('whale'), BINDER_EDITIONS.map((e) => e.id).sort());
});

console.log(results.join('\n'));
const passed = results.length - failed;
console.log(`\n${failed ? 'FAIL' : 'PASS'}: ${passed}/${results.length} binder-look checks passed${failed ? `, ${failed} failed` : ''}.`);
process.exit(failed ? 1 : 0);
