/* Level perks and gates: the pack battles, coinflip, jackpot and grading open at the levels in
   js/levels.js; showcase, slab and binder-page room, avatar frames, banner motions and level titles
   follow the level; nobody who already uses a feature is ever locked out, and nothing saved is cut.
   Runs the real Worker against in-memory SQLite (Node 22+): node scripts/test-levels.mjs */
import assert from 'node:assert/strict';
import { LEVEL_CAP } from '../js/xp.js';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import worker from '../worker/index.js';
import { seedLevel } from './lib/level-seed.mjs';
import {
  BANNER_MOTION_LEVELS, FRAMES, GATES, GATE_NAMES, LEVEL_TITLES, frameForLevel, gateMessage, levelPerks, levelTitleRows, nextSlotLevel, slotMessage,
} from '../js/levels.js';
import { BANNER_MOTIONS, SHOWCASE_MAX, bannerId, bannerMotionLevel, parseBanner } from '../js/cosmetics.js';
import { TITLES, isTitleUnlocked, titleContext, unlockedTitles } from '../js/titles.js';
import { PROFILE_PAGE_LIMIT } from '../js/profile-pages.js';
import { GRADING_LIMITS } from '../js/grading-rules.js';

let passed = 0;
const check = (name, ok) => { assert.ok(ok, name); passed++; };

// ---- The config itself ----------------------------------------------------------------------
{
  check('every gate has a positive level and a name', Object.keys(GATES).length === 5 && Object.entries(GATES).every(([k, n]) => n >= 2 && GATE_NAMES[k]));
  check('the message names the level', gateMessage('coinflip') === `Reach level ${GATES.coinflip} to open coinflip.`);
  let last = levelPerks(1);
  for (let lv = 2; lv <= 100; lv++) {
    const p = levelPerks(lv);
    assert.ok(p.showcaseSlots >= last.showcaseSlots && p.shownSlabs >= last.shownSlabs && p.binderPages >= last.binderPages, `room never shrinks (level ${lv})`);
    assert.ok(p.frames.length >= last.frames.length && p.bannerMotions.length >= last.bannerMotions.length);
    last = p;
  }
  const top = levelPerks(100);
  check('the top of the ladder matches the hard caps', top.showcaseSlots === SHOWCASE_MAX && top.binderPages <= PROFILE_PAGE_LIMIT && top.shownSlabs <= GRADING_LIMITS.maxShown);
  check('a veteran-level account has every frame and motion', FRAMES.every((f) => !f.prestige === top.frames.includes(f.id)) && top.bannerMotions.length === Object.keys(BANNER_MOTION_LEVELS).length);
  check('slot messages point at the next step', slotMessage('showcase', 1) === 'Reach level 5 for more slots.' && nextSlotLevel('pages', 35) === null);
  check('frames: none below 5, bronze at 5, legend at 100', frameForLevel(4) === null && frameForLevel(5) === 'bronze' && frameForLevel(100) === 'legend');

  // Banner motions.
  for (const [id, level] of Object.entries(BANNER_MOTION_LEVELS)) {
    const row = BANNER_MOTIONS.find((m) => m.id === id);
    check(`motion ${id} is listed with level ${level}`, row && row.level === level);
    check(`${id} parses and survives bannerId`, parseBanner(`${id}:gold+violet`).motion === id && bannerId(`${id}:gold+violet`) === `${id}:gold+violet`);
    check(`bannerMotionLevel(${id})`, bannerMotionLevel(`${id}:gold+violet`) === level);
  }
  check('the five old motions stay free', ['aurora', 'drift', 'pulse', 'beam', 'mist'].every((id) => BANNER_MOTIONS.find((m) => m.id === id && !m.level) && bannerMotionLevel(`${id}:gold+violet`) === 0));
  check('an unknown motion still falls back to aurora', bannerId('zzz:gold+violet') === 'aurora:gold+violet');

  // Level titles.
  const rows = levelTitleRows().filter((r) => !r.prestige);
  check('level titles are level-<n> ids from the config', rows.length === LEVEL_TITLES.length && rows.every((r) => r.id === `level-${r.level}`));
  const stars = levelTitleRows().filter((r) => r.prestige);
  check('prestige titles are prestige-<n> ids', stars.length > 0 && stars.every((r) => r.id === `prestige-${r.prestige}`));
  for (const row of stars) {
    check(`${row.name} locked one star short`, !isTitleUnlocked(row.name, titleContext({ xp: { level: 50, prestige: row.prestige - 1 } })));
    check(`${row.name} open at ${row.prestige} stars`, isTitleUnlocked(row.name, titleContext({ xp: { level: 1, prestige: row.prestige } })));
  }
  check('a prestiged player keeps the level 100 title at level 1', isTitleUnlocked('Legend', titleContext({ xp: { level: 1, prestige: 1 } })));
  check('a prestiged player keeps the level 200 title too', isTitleUnlocked('Apex Trainer', titleContext({ xp: { level: 1, prestige: 1 } })));
  check('the cap title is at the cap', Math.max(...rows.map((r) => r.level)) === LEVEL_CAP);
  const names = TITLES.map((t) => t.name);
  check('title names stay unique (titleByName looks up by name)', new Set(names).size === names.length);
  check('level title names fit the 32 character limit', rows.every((r) => r.name.length <= 32));
  for (const row of rows) {
    check(`${row.name} locked at level ${row.level - 1}`, !isTitleUnlocked(row.name, titleContext({}, { level: row.level - 1 })));
    check(`${row.name} open at level ${row.level}`, isTitleUnlocked(row.name, titleContext({}, { level: row.level })));
  }
  check('titleContext with no level option and no xp reads as level 1 (the Look tab passes state.xp?.level ?? user.level)', titleContext({ xp: null }, { level: undefined }).level === 1 && titleContext({ xp: { level: 40 } }, { level: undefined }).level === 40 && titleContext({}, { level: 40 }).level === 40);
  check('titleContext reads save.xp.level', titleContext({ xp: { level: 12 } }).level === 12 && titleContext({}).level === 1);
  check('the options level wins over save.xp.level', titleContext({ xp: { level: 12 } }, { level: 3 }).level === 3);
  check('unlockedTitles lists a level title', unlockedTitles(titleContext({}, { level: 10 })).some((t) => t.id === 'level-10'));
}

// ---- Harness ----------------------------------------------------------------------------------
const migrationDir = new URL('../worker/migrations/', import.meta.url);
const migrationFiles = readdirSync(migrationDir).sort();
check('migration 0024 adds users.frame', migrationFiles.includes('0024_user_frame.sql'));
const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON');
for (const file of migrationFiles) db.exec(readFileSync(new URL(file, migrationDir), 'utf8'));
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
    };
    return s;
  },
  async batch(statements) {
    db.exec('BEGIN');
    try { const out = statements.map((s) => s.execute()); db.exec('COMMIT'); return out; }
    catch (err) { db.exec('ROLLBACK'); throw err; }
  },
};
const now = Date.now();
const ASSETS = { fetch: async (request) => {
  try { return new Response(readFileSync(new URL('..' + new URL(request.url).pathname, import.meta.url)), { headers: { 'content-type': 'application/json' } }); }
  catch { return new Response('', { status: 404 }); }
} };
const env = { DB, ASSETS };
async function api(path, method = 'GET', body, user = 'u', headers = {}) {
  const res = await worker.fetch(new Request('https://poke-pack.rip' + path, { method,
    headers: { 'content-type': 'application/json', origin: 'https://poke-pack.rip', ...(user ? { cookie: `pp_sid=${user}` } : {}), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), env);
  return { status: res.status, ...(await res.json()) };
}
const BINDER = Array.from({ length: 45 }, (_, i) => (i % 9 === 0 ? { id: 'me5-1', reverse: false } : null)); // a card on each of 5 pages
const CARDS = ['me5-1', 'me5-2', 'me5-3', 'me5-87', 'me5-90', 'me5-97', 'me5-98', 'me5-99'];
const give = (user, card, qty) => db.prepare(`INSERT INTO cards(user_id,card_id,qty,reverse_qty) VALUES(?,?,?,0)
  ON CONFLICT(user_id,card_id) DO UPDATE SET qty = qty + excluded.qty`).run(user, card, qty);
// A player at a level. `level` null leaves the player with no XP row at all (a brand new account).
function addUser(id, level, coins = 100000) {
  db.prepare('INSERT INTO users(id,name,handle,password_hash,color,created_at,last_played) VALUES(?,?,?,?,?,?,?)').run(id, id, id, 'unused', 'gold', now, now);
  db.prepare('INSERT INTO profiles(user_id,coins,granted,created_at,binder) VALUES(?,?,?,?,?)').run(id, coins, coins, now, JSON.stringify(BINDER));
  db.prepare('INSERT INTO sessions(id,user_id,created_at,expires_at) VALUES(?,?,?,?)').run(id, id, now, now + 864000000);
  for (const card of CARDS) give(id, card, 10);
  if (level != null) seedLevel(db, id, level);
}
const setLevel = (id, level) => seedLevel(db, id, level);
const rid = () => crypto.randomUUID();
const refused = (r, key) => r.status === 403 && r.error === gateMessage(key) && r.needLevel === GATES[key];
const count = (sql, ...args) => db.prepare(sql).get(...args).n;

// Warm the lazy schemas (a signed-out read of each game list).
await api('/api/casino/coinflips', 'GET', undefined, null);
await api('/api/casino/jackpots', 'GET', undefined, null);
await api('/api/grading', 'GET', undefined, null);
addUser('host', 100); // a high level host who opens games for the others to join

// ---- Gate: pack battles ---------------------------------------------------------------------------
{
  const create = (user, extra = {}) => api('/api/battles', 'POST', { requestId: rid(), settings: { fast: true }, lineup: [{ key: 'me5:boosterPack', quantity: 2 }], ...extra }, user);
  addUser('b1', GATES.battles - 1);
  const shut = await create('b1');
  check('battles: create refused one level short', refused(shut, 'battles'));
  check('battles: the quick (free bot) create is refused too', refused(await create('b1', { quick: true }), 'battles'));
  check('battles: nothing was written or charged', count("SELECT COUNT(*) n FROM battles WHERE host_id = 'b1'") === 0 && db.prepare("SELECT coins FROM profiles WHERE user_id = 'b1'").get().coins === 100000);
  const open = await create('host');
  check('battles: a high level host creates', open.status === 200);
  const lobby = open.battle.id;
  check('battles: join refused one level short', refused(await api(`/api/battles/${lobby}/join`, 'POST', {}, 'b1'), 'battles'));
  check('battles: reading and listing stay open', (await api('/api/battles', 'GET', undefined, 'b1')).status === 200 && (await api(`/api/battles/${lobby}`, 'GET', undefined, 'b1')).status === 200 && (await api('/api/battles/catalog', 'GET', undefined, null)).status === 200);
  setLevel('b1', GATES.battles);
  check('battles: join opens at the gate level', (await api(`/api/battles/${lobby}/join`, 'POST', {}, 'b1')).status === 200);
  addUser('b2', GATES.battles);
  check('battles: create opens at the gate level', (await create('b2')).status === 200);
  check('battles: the quick create opens at the gate level', (await create('b2', { quick: true })).status === 200);
}

// ---- Gate: coinflip ------------------------------------------------------------------------------------
{
  const make = (user, cards = [{ id: 'me5-87', qty: 1 }], path = '/api/casino/coinflips') => api(path, 'POST', { requestId: rid(), cards }, user);
  addUser('c1', GATES.coinflip - 1);
  check('coinflip: create refused one level short', refused(await make('c1'), 'coinflip'));
  check('coinflip: the free bot flip is refused too (the casino is the gate, not the stake)', refused(await make('c1', [{ id: 'me5-87', qty: 1 }], '/api/casino/coinflips/bot'), 'coinflip'));
  const hosted = await make('host');
  check('coinflip: a high level host creates', hosted.status === 200);
  const flipId = hosted.flip.id;
  check('coinflip: join refused one level short', refused(await api(`/api/casino/coinflips/${flipId}/join`, 'POST', { cards: [{ id: 'me5-98', qty: 1 }] }, 'c1'), 'coinflip'));
  check('coinflip: nothing moved', count("SELECT COUNT(*) n FROM coinflips WHERE host_id = 'c1' OR guest_id = 'c1'") === 0 && count("SELECT qty n FROM cards WHERE user_id = 'c1' AND card_id = 'me5-87'") === 10);
  check('coinflip: reading stays open', (await api('/api/casino/coinflips', 'GET', undefined, 'c1')).status === 200 && (await api(`/api/casino/coinflips/${flipId}`, 'GET', undefined, 'c1')).status === 200);
  setLevel('c1', GATES.coinflip);
  check('coinflip: join opens at the gate level', (await api(`/api/casino/coinflips/${flipId}/join`, 'POST', { cards: [{ id: 'me5-98', qty: 1 }] }, 'c1')).status === 200);
  addUser('c2', GATES.coinflip);
  check('coinflip: create opens at the gate level', (await make('c2')).status === 200);
  addUser('c3', GATES.coinflip);
  check('coinflip: the bot flip opens at the gate level', (await make('c3', [{ id: 'me5-87', qty: 1 }], '/api/casino/coinflips/bot')).status === 200);
}

// ---- Gate: jackpot ---------------------------------------------------------------------------------------
{
  const body = (extra = {}) => ({ requestId: rid(), cards: [{ id: 'me5-98', qty: 1 }], ...extra });
  addUser('j1', GATES.jackpot - 1);
  check('jackpot: create refused one level short', refused(await api('/api/casino/jackpots', 'POST', body(), 'j1'), 'jackpot'));
  check('jackpot: the quick (bot) pot is refused too', refused(await api('/api/casino/jackpots/quick', 'POST', body({ players: 3 }), 'j1'), 'jackpot'));
  const pot = await api('/api/casino/jackpots', 'POST', body(), 'host');
  check('jackpot: a high level host creates', pot.status === 200);
  const potId = pot.jackpot.id;
  check('jackpot: join refused one level short', refused(await api(`/api/casino/jackpots/${potId}/join`, 'POST', { cards: [{ id: 'me5-98', qty: 1 }] }, 'j1'), 'jackpot'));
  check('jackpot: nothing was written', count("SELECT COUNT(*) n FROM jackpot_entries WHERE user_id = 'j1'") === 0 && count("SELECT COUNT(*) n FROM jackpots WHERE host_id = 'j1'") === 0);
  check('jackpot: reading stays open', (await api('/api/casino/jackpots', 'GET', undefined, 'j1')).status === 200 && (await api(`/api/casino/jackpots/${potId}`, 'GET', undefined, 'j1')).status === 200);
  setLevel('j1', GATES.jackpot);
  check('jackpot: join opens at the gate level', (await api(`/api/casino/jackpots/${potId}/join`, 'POST', { cards: [{ id: 'me5-98', qty: 1 }] }, 'j1')).status === 200);
  addUser('j2', GATES.jackpot);
  check('jackpot: create opens at the gate level', (await api('/api/casino/jackpots', 'POST', body(), 'j2')).status === 200);
  addUser('j3', GATES.jackpot);
  check('jackpot: the quick pot opens at the gate level', (await api('/api/casino/jackpots/quick', 'POST', body({ players: 3 }), 'j3')).status === 200);
}

// ---- Gate: grading ----------------------------------------------------------------------------------------
{
  const submit = (user, requestId = rid()) => api('/api/grading/submit', 'POST', { cardId: 'me5-87', reverse: false, requestId }, user);
  addUser('g1', GATES.grading - 1);
  check('grading: submit refused one level short', refused(await submit('g1'), 'grading'));
  check('grading: no card left the player', count("SELECT COUNT(*) n FROM graded_cards WHERE user_id = 'g1'") === 0 && count("SELECT qty n FROM cards WHERE user_id = 'g1' AND card_id = 'me5-87'") === 10);
  check('grading: the slab list stays open', (await api('/api/grading', 'GET', undefined, 'g1')).status === 200);
  setLevel('g1', GATES.grading);
  const graded = await submit('g1');
  check('grading: submit opens at the gate level', graded.status === 200);
}

// ---- Nobody who already plays is locked out; a game in progress can always be finished ------------------------------
{
  // The level never drops in production; the tests drop it to prove the gate looks at history, not just the level.
  addUser('old', 100);
  const flip = await api('/api/casino/coinflips', 'POST', { requestId: rid(), cards: [{ id: 'me5-87', qty: 1 }] }, 'old');
  const pot = await api('/api/casino/jackpots', 'POST', { requestId: rid(), cards: [{ id: 'me5-98', qty: 1 }] }, 'old');
  const lobby = await api('/api/battles', 'POST', { requestId: rid(), settings: { fast: true }, lineup: [{ key: 'me5:boosterPack', quantity: 2 }] }, 'old');
  const slab = await api('/api/grading/submit', 'POST', { cardId: 'me5-87', reverse: false, requestId: rid() }, 'old');
  check('setup: the veteran has a flip, a pot, a lobby and a slab', flip.status === 200 && pot.status === 200 && lobby.status === 200 && slab.status === 200);
  setLevel('old', 1);
  const next = (extra) => ({ requestId: rid(), cards: [{ id: 'me5-87', qty: 1 }], ...extra });
  check('veteran at level 1: a new coinflip still opens', (await api('/api/casino/coinflips', 'POST', next(), 'old')).status === 200);
  check('veteran at level 1: a new bot flip still opens', (await api('/api/casino/coinflips/bot', 'POST', next(), 'old')).status === 200);
  check('veteran at level 1: a new jackpot still opens', (await api('/api/casino/jackpots', 'POST', next({ cards: [{ id: 'me5-98', qty: 1 }] }), 'old')).status === 200);
  check('veteran at level 1: a new battle still opens', (await api('/api/battles', 'POST', { requestId: rid(), settings: { fast: true }, lineup: [{ key: 'me5:boosterPack', quantity: 2 }] }, 'old')).status === 200);
  check('veteran at level 1: grading another card still opens', (await api('/api/grading/submit', 'POST', { cardId: 'me5-90', reverse: false, requestId: rid() }, 'old')).status === 200);

  // In progress: cancel, leave, draw, collect and sell never touch the gate, whatever the level.
  addUser('late', 100);
  const lateFlip = await api('/api/casino/coinflips', 'POST', next(), 'late');
  const latePot = await api('/api/casino/jackpots', 'POST', next({ cards: [{ id: 'me5-98', qty: 1 }] }), 'late');
  const lateLobby = await api('/api/battles', 'POST', { requestId: rid(), settings: { fast: true }, lineup: [{ key: 'me5:boosterPack', quantity: 2 }] }, 'late');
  setLevel('late', 1);
  check('level 1 host: cancel a flip they created', (await api(`/api/casino/coinflips/${lateFlip.flip.id}/cancel`, 'POST', {}, 'late')).status === 200);
  check('level 1 host: cancel a pot they created', (await api(`/api/casino/jackpots/${latePot.jackpot.id}/cancel`, 'POST', {}, 'late')).status === 200);
  check('level 1 host: cancel a lobby they created', (await api(`/api/battles/${lateLobby.battle.id}/cancel`, 'POST', {}, 'late')).status === 200);

  // A guest who joined while qualified and then sits below the gate (a joiner in progress) can leave and keep playing.
  addUser('guest', GATES.jackpot);
  const hostPot = await api('/api/casino/jackpots', 'POST', next({ cards: [{ id: 'me5-98', qty: 1 }] }), 'host');
  check('a guest joins an open pot', (await api(`/api/casino/jackpots/${hostPot.jackpot.id}/join`, 'POST', { cards: [{ id: 'me5-98', qty: 1 }] }, 'guest')).status === 200);
  setLevel('guest', 1);
  check('guest below the gate: leaving is never gated', (await api(`/api/casino/jackpots/${hostPot.jackpot.id}/leave`, 'POST', {}, 'guest')).status === 200);

  // Winnings and slabs: crack and sell are not gated.
  const slabId = slab.slab.id;
  check('level 1 slab owner: crack is never gated', (await api('/api/grading/crack', 'POST', { slabId }, 'old')).status === 200);

  // And a brand new account is still held at the door.
  addUser('fresh', null);
  check('a brand new account with no XP row waits for every gate', refused(await api('/api/casino/coinflips', 'POST', next(), 'fresh'), 'coinflip') && refused(await api('/api/battles', 'POST', { requestId: rid(), settings: {}, lineup: [{ key: 'me5:boosterPack', quantity: 1 }] }, 'fresh'), 'battles'));
}

// ---- Profile room: showcase, binder pages, slabs --------------------------------------------------------------------
const patch = (user, body) => api('/api/me', 'PATCH', body, user);
const showcaseOf = (ids) => ids.map((id) => ({ id }));
{
  const perks1 = levelPerks(1);
  addUser('s1', 1);
  const tooMany = await patch('s1', { showcase: showcaseOf(CARDS.slice(0, perks1.showcaseSlots + 1)) });
  check('showcase: one past the allowance is refused with the next level', tooMany.status === 400 && tooMany.error === slotMessage('showcase', 1));
  const ok = await patch('s1', { showcase: showcaseOf(CARDS.slice(0, perks1.showcaseSlots)) });
  check('showcase: the allowance itself saves', ok.status === 200 && ok.user.showcase.length === perks1.showcaseSlots);
  setLevel('s1', 5);
  const more = await patch('s1', { showcase: showcaseOf(CARDS.slice(0, levelPerks(5).showcaseSlots)) });
  check('showcase: more room at level 5', more.status === 200 && more.user.showcase.length === levelPerks(5).showcaseSlots);

  // A player who saved six before levels existed keeps all six.
  addUser('s2', 1);
  db.prepare('UPDATE users SET showcase = ? WHERE id = ?').run(JSON.stringify(showcaseOf(CARDS.slice(0, SHOWCASE_MAX))), 's2');
  const same = await patch('s2', { showcase: showcaseOf([...CARDS.slice(0, SHOWCASE_MAX)].reverse()) });
  check('showcase: a saved list longer than the allowance can be reordered without loss', same.status === 200 && same.user.showcase.length === SHOWCASE_MAX);
  const swap = await patch('s2', { showcase: showcaseOf([...CARDS.slice(1, SHOWCASE_MAX), CARDS[SHOWCASE_MAX]]) });
  check('showcase: and swapped one for one', swap.status === 200 && swap.user.showcase.length === SHOWCASE_MAX);
  const bio = await patch('s2', { bio: 'hello' });
  check('showcase: an unrelated save leaves it whole', bio.status === 200 && bio.user.showcase.length === SHOWCASE_MAX);
  const less = await patch('s2', { showcase: showcaseOf(CARDS.slice(0, 2)) });
  check('showcase: shortening is always allowed', less.status === 200 && less.user.showcase.length === 2);
  const regrow = await patch('s2', { showcase: showcaseOf(CARDS.slice(0, perks1.showcaseSlots + 1)) });
  check('showcase: a saved six can go back up to six after being shortened (one click at a time), never past it', regrow.status === 200 && regrow.user.showcase.length === perks1.showcaseSlots + 1);
  // A player who never saved more than the allowance gets no extra room from shortening.
  addUser('s3', 1);
  await patch('s3', { showcase: showcaseOf(CARDS.slice(0, perks1.showcaseSlots)) });
  await patch('s3', { showcase: showcaseOf(CARDS.slice(0, 1)) });
  check('showcase: no free room from shortening a list that was within the allowance', (await patch('s3', { showcase: showcaseOf(CARDS.slice(0, perks1.showcaseSlots + 1)) })).status === 400);

  // Binder pages.
  addUser('p1', 1);
  const pagesTooMany = await patch('p1', { binderPages: [0, 1] });
  check('pages: one past the allowance is refused', pagesTooMany.status === 400 && pagesTooMany.error === slotMessage('pages', 1));
  check('pages: the allowance itself saves', (await patch('p1', { binderPages: [0] })).status === 200);
  setLevel('p1', 8);
  const two = await patch('p1', { binderPages: [0, 1] });
  check('pages: level 8 shows two', two.status === 200 && two.user.binderPages.length === 2 && (await patch('p1', { binderPages: [0, 1, 2] })).status === 400);
  addUser('pages2', 1);
  db.prepare('UPDATE users SET binder_pages = ? WHERE id = ?').run(JSON.stringify([0, 1, 2, 3]), 'pages2');
  const keep = await patch('pages2', { binderPages: [3, 2, 1, 0] });
  check('pages: four saved pages at level 1 are kept and can be reordered', keep.status === 200 && keep.user.binderPages.length === 4);
  { const pub = await api('/api/u/pages2', 'GET', undefined, null); check('pages: the public profile still shows all four ' + JSON.stringify(pub).slice(0, 300), pub.binderPages?.length === 4); }
  check('pages: after removing pages one by one, the saved four can be put back', (await patch('pages2', { binderPages: [3, 2, 1] })).status === 200 && (await patch('pages2', { binderPages: [3] })).status === 200 && (await patch('pages2', { binderPages: [3, 2, 1, 0] })).status === 200);
  check('pages: the hard cap of four is unchanged', (await patch('pages2', { binderPages: [0, 1, 2, 3, 4] })).status === 400);

  // Slabs shown on the profile.
  addUser('slabber', 100);
  const slabs = [];
  for (let i = 0; i < 6; i++) {
    const r = await api('/api/grading/submit', 'POST', { cardId: CARDS[i], reverse: false, requestId: rid() }, 'slabber');
    assert.equal(r.status, 200, JSON.stringify(r));
    slabs.push(r.slab.id);
  }
  setLevel('slabber', 1);
  const show = (id, shown = true) => api('/api/grading/show', 'POST', { slabId: id, shown }, 'slabber');
  const room1 = levelPerks(1).shownSlabs;
  for (let i = 0; i < room1; i++) assert.equal((await show(slabs[i])).status, 200);
  const blocked = await show(slabs[room1]);
  check('slabs: one past the allowance is refused with the next level', blocked.status === 400 && blocked.error.includes(slotMessage('slabs', 1)));
  setLevel('slabber', 10);
  check('slabs: level 10 has more room', (await show(slabs[room1])).status === 200 && levelPerks(10).shownSlabs > room1);
  // Saved beyond the allowance (shown while the cap was the old flat 8): shown slabs stay shown at any level.
  db.prepare("UPDATE graded_cards SET shown = 1 WHERE user_id = 'slabber'").run();
  setLevel('slabber', 1);
  const profile = await api('/api/u/slabber', 'GET', undefined, null);
  check('slabs: a profile already showing six shows all six at level 1', profile.graded.length === 6);
  // A swap keeps working: the profile showed six, so after one comes off another can go on, up to six again and no further.
  check('slabs: six shown at level 1: one comes off, another goes on (a swap)', (await show(slabs[0], false)).status === 200 && (await show(slabs[0])).status === 200);
  check('slabs: two come off, a different one can replace each', (await show(slabs[1], false)).status === 200 && (await show(slabs[2], false)).status === 200 && (await show(slabs[2])).status === 200 && (await show(slabs[1])).status === 200);
  addUser('capped', 20);
  const cs = [];
  for (let i = 0; i < 6; i++) { const r = await api('/api/grading/submit', 'POST', { cardId: CARDS[i], reverse: false, requestId: rid() }, 'capped'); cs.push(r.slab.id); }
  const cshow = (id, shown = true) => api('/api/grading/show', 'POST', { slabId: id, shown }, 'capped');
  const allowed20 = levelPerks(20).shownSlabs;
  for (let i = 0; i < allowed20; i++) assert.equal((await cshow(cs[i])).status, 200);
  check('slabs: a level-20 player who never showed more stays at the allowance', (await cshow(cs[allowed20])).status === 400);
  db.prepare("UPDATE graded_cards SET shown = 1 WHERE user_id = 'capped'").run(); // six shown, the old flat cap allowed this
  check('slabs: level 20, six shown: take one off and put another on', (await cshow(cs[0], false)).status === 200 && (await cshow(cs[0])).status === 200);
}

// ---- Cosmetics: frames, banner motions, titles ---------------------------------------------------------------------------
{
  addUser('frame1', 4);
  const bronze = FRAMES[0];
  const early = await patch('frame1', { frame: 'bronze' });
  check('frame: refused one level short with needLevel', early.status === 403 && early.needLevel === bronze.level && early.error.includes(`level ${bronze.level}`));
  check('frame: an unknown frame is a 400', (await patch('frame1', { frame: 'rainbow' })).status === 400 && (await patch('frame1', { frame: 7 })).status === 400);
  const noFrame = await api('/api/me', 'GET', undefined, 'frame1');
  check('frame: none below level 5, and /api/me carries level and perks', noFrame.user.frame === null && noFrame.user.level === 4 && !noFrame.user.perks.frames.some((id) => FRAMES.some((f) => f.id === id)) && noFrame.user.perks.frames.includes('type-fire'));
  setLevel('frame1', 5);
  const wear = await patch('frame1', { frame: 'bronze' });
  check('frame: opens at its level', wear.status === 200 && wear.user.frame === 'bronze' && wear.user.level === 5);
  setLevel('frame1', 30);
  check('frame: an equipped frame stays equipped as the level climbs', (await api('/api/me', 'GET', undefined, 'frame1')).user.frame === 'bronze');
  check('frame: the public profile shows the equipped frame and the level', await api('/api/u/frame1', 'GET', undefined, null).then((p) => p.user.frame === 'bronze' && p.user.level === 30 && p.user.perks.showcaseSlots === levelPerks(30).showcaseSlots));
  const auto = await patch('frame1', { frame: '' });
  check('frame: "" returns to automatic, which is the best earned', auto.status === 200 && auto.user.frame === frameForLevel(30) && db.prepare("SELECT frame FROM users WHERE id = 'frame1'").get().frame === null);
  check('frame: null does the same', (await patch('frame1', { frame: 'silver' })).status === 200 && (await patch('frame1', { frame: null })).user.frame === 'gold');
  check('frame: a profile with no choice shows the best earned frame', (await api('/api/u/frame1', 'GET', undefined, null)).user.frame === 'gold');
  check('frame: a stored frame the level no longer allows falls back to the best earned', (db.prepare("UPDATE users SET frame = 'legend' WHERE id = 'frame1'").run(), (await api('/api/me', 'GET', undefined, 'frame1')).user.frame === 'gold'));
  check('frame: an unrelated PATCH keeps the choice', (await patch('frame1', { frame: 'silver' })).status === 200 && (await patch('frame1', { bio: 'x' })).user.frame === 'silver');

  // Motions.
  addUser('m1', Math.min(...Object.values(BANNER_MOTION_LEVELS)) - 1);
  const [firstMotion, firstLevel] = Object.entries(BANNER_MOTION_LEVELS).sort((a, b) => a[1] - b[1])[0];
  const lockedBanner = await patch('m1', { banner: `${firstMotion}:gold+violet` });
  check('motion: refused one level short with needLevel', lockedBanner.status === 403 && lockedBanner.needLevel === firstLevel);
  check('motion: the banner did not change', db.prepare("SELECT banner FROM users WHERE id = 'm1'").get().banner !== `${firstMotion}:gold+violet`);
  check('motion: a free motion is open at level 1', (await patch('m1', { banner: 'beam:gold+violet' })).user.banner === 'beam:gold+violet');
  for (const [id, level] of Object.entries(BANNER_MOTION_LEVELS)) {
    setLevel('m1', level - 1);
    assert.equal((await patch('m1', { banner: `${id}:red+blue` })).status, 403, `${id} one level short`);
    setLevel('m1', level);
    const r = await patch('m1', { banner: `${id}:red+blue` });
    assert.equal(r.status, 200, JSON.stringify(r));
    assert.equal(parseBanner(r.user.banner).motion, id);
  }
  check('motion: each level motion opens at its own level', true);
  addUser('m2', 1);
  db.prepare("UPDATE users SET banner = 'holo:gold+violet' WHERE id = 'm2'").run();
  check('motion: a saved banner never changes under the player', (await patch('m2', { bio: 'hi' })).user.banner === 'holo:gold+violet' && (await api('/api/me', 'GET', undefined, 'm2')).user.banner === 'holo:gold+violet');
  check('motion: its colours can be changed while the motion is kept', (await patch('m2', { banner: 'holo:red+blue' })).status === 200);
  check('motion: but another locked motion is still refused', (await patch('m2', { banner: 'foil:red+blue' })).status === 403);

  // An array (or any non-string) banner cannot slip past the mastery check.
  addUser('arr', 100);
  const arr = await patch('arr', { banner: ['mastery:me5'] });
  check('banner: an array body is a 400, not a stored mastery banner', arr.status === 400 && db.prepare("SELECT banner FROM users WHERE id = 'arr'").get().banner !== 'mastery:me5');
  check('banner: an object or number is a 400 too', (await patch('arr', { banner: { toString: () => 'mastery:me5' } })).status === 400 && (await patch('arr', { banner: 7 })).status === 400);
  check('banner: a mastery banner nobody earned is a 403 (string form)', (await patch('arr', { banner: 'mastery:me5' })).status === 403);
  check('banner: spelling variants of a mastery banner still do not pass', (await patch('arr', { banner: ' Mastery : me5' })).status !== 200);
  check('banner: ordinary banners still save', (await patch('arr', { banner: 'drift:red+blue' })).status === 200);

  // Titles.
  addUser('t1', 4);
  const apprentice = LEVEL_TITLES[0];
  const locked = await patch('t1', { title: apprentice.name });
  check('title: a level title is locked below its level', locked.status === 400 && locked.error === 'That title is locked.');
  setLevel('t1', apprentice.level);
  const worn = await patch('t1', { title: apprentice.name });
  check('title: it opens at its level', worn.status === 200 && worn.user.title === apprentice.name);
  check('title: the next one is still locked', (await patch('t1', { title: LEVEL_TITLES[1].name })).status === 400);
  setLevel('t1', 200);
  check('title: every level title opens at the top level', (await Promise.all(LEVEL_TITLES.map((t) => patch('t1', { title: t.name })))).every((r) => r.status === 200));
}

// ---- A veteran-level account sees no change ---------------------------------------------------------------------------------
{
  addUser('vet', 100);
  const me = await api('/api/me', 'GET', undefined, 'vet');
  check('veteran: /api/me carries the full perks', me.user.level === 100 && me.user.frame === 'legend' && me.user.perks.showcaseSlots === SHOWCASE_MAX && FRAMES.every((f) => me.user.perks.frames.includes(f.id)));
  check('veteran: six showcase cards, four pages, any motion, any frame, any title',
    (await patch('vet', { showcase: showcaseOf(CARDS.slice(0, SHOWCASE_MAX)) })).status === 200
    && (await patch('vet', { binderPages: [0, 1, 2, 3] })).status === 200
    && (await patch('vet', { banner: 'holo:gold+violet' })).status === 200
    && (await patch('vet', { frame: 'legend' })).status === 200
    && (await patch('vet', { title: 'Legend' })).status === 200);
  check('veteran: every gate is open', (await api('/api/casino/coinflips', 'POST', { requestId: rid(), cards: [{ id: 'me5-87', qty: 1 }] }, 'vet')).status === 200);
  // A player with no XP row yet who is signed in still gets a working /api/me.
  addUser('nox', null);
  const bare = await api('/api/me', 'GET', undefined, 'nox');
  check('a player with no XP row gets a derived low level and no frame', bare.status === 200 && bare.user.level >= 1 && bare.user.level < 5 && bare.user.frame === null);
}

console.log(`test-levels: ${passed} checks passed`);
