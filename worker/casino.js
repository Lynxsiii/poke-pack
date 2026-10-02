import { PLAYABLE_SETS, ALL_SETS, money, sellValue } from '../js/catalog.js';
import { gradedValue, gradeMultiplier, bandFor, GRADE_BANDS } from '../js/grading-rules.js';
import { BOT_PERSONAS } from '../js/battle-rules.js';
import { avatarId, avatarStyle } from '../js/cosmetics.js';
import { COINFLIP_RULES, matchWindow, botStakeWindow } from '../js/casino-rules.js';
import { CASINO_DDL } from './casino-ddl.js';
import { ensureSalesSchema, winningsInfo, sellWinnings } from './winnings.js';
import { handleJackpots, maintainJackpots } from './jackpot.js';
import { handleUpgrades } from './upgrader.js';
import { equippedCoinId } from './gear.js';
import { ensureSlabsSchema, resetSlabsSchemaCache } from './casino-slabs.js';
import { setForCard, stakeSlabView } from './grading.js';
import { gateResponse } from './gates.js';

/* Casino coinflip (migration 0015). The rules and every card movement live
   here and in the triggers of the migration: a client only asks. Values are
   whole cents, taken from the same market-based sellValue() that selling uses.
   A stake may also hold graded slabs (migration 0022, worker/casino-slabs.js):
   each is valued at what it sells for (gradedValue), frozen into the stake, and
   moves only in the triggers, like the cards. */

const error = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const parse = value => value ? JSON.parse(value) : null;
const HOUSE = 'house';

const CASINO_OBJECTS = ['coinflips', 'coinflip_stake_check', 'coinflip_stake_take', 'coinflip_final', 'coinflip_settle_check',
  'coinflip_settle', 'coinflip_return', 'coinflip_no_account_delete', 'coinflip_no_account_reset'];
let casinoSchemaReady = false;
/** Tests only: forget the per-isolate cache so another database is checked. */
export const resetCasinoSchemaCache = () => { casinoSchemaReady = false; resetSlabsSchemaCache(); };
/**
 * Create the coinflip table and triggers once per isolate. Nobody can run
 * `wrangler d1 migrations apply --remote` from a session, so the Worker applies
 * the migration's own DDL (worker/casino-ddl.js, generated from it). One D1
 * batch is one transaction and every statement is IF NOT EXISTS, so replaying it
 * (a second isolate, or the migration run later) changes nothing.
 */
export async function ensureCasinoSchema(env) {
  if (casinoSchemaReady) return;
  const rows = (await env.DB.prepare(`SELECT name FROM sqlite_master WHERE name IN (${CASINO_OBJECTS.map(() => '?').join(',')})`)
    .bind(...CASINO_OBJECTS).all()).results || [];
  if (rows.length < CASINO_OBJECTS.length) await env.DB.batch(CASINO_DDL.map(sql => env.DB.prepare(sql)));
  await ensureSlabsSchema(env); // the slab columns and triggers (migration 0022), also applied lazily
  casinoSchemaReady = true;
}

// ---- Stakes ----------------------------------------------------------------
/**
 * Turn the request's `slabs` (graded_cards ids) into checked, valued snapshots:
 * each must be the player's own, still slabbed and in no game. A slab is worth
 * what it sells for now (gradedValue); that value is frozen into the stake.
 */
async function buildSlabs(env, request, helpers, userId, rawSlabs, rules) {
  if (!rawSlabs.length) return { slabs: [], value: 0 };
  if (rawSlabs.length > rules.maxSlabs) error(`Put up at most ${rules.maxSlabs} slabs.`);
  const ids = [];
  for (const raw of rawSlabs) {
    if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw < 1) error('Choose valid slabs.');
    ids.push(raw);
  }
  if (new Set(ids).size !== ids.length) error('List each slab once.');
  const rows = (await env.DB.prepare(`SELECT * FROM graded_cards WHERE user_id = ? AND status = 'slabbed' AND locked IS NULL AND id IN (${ids.map(() => '?').join(',')})`)
    .bind(userId, ...ids).all()).results || [];
  const byId = new Map(rows.map(row => [row.id, row]));
  const slabs = []; let value = 0;
  for (const id of ids) {
    const row = byId.get(id);
    if (!row) error('You no longer have those slabs.', 409);
    const card = await helpers.findCatalogCard(env, request, row.card_id);
    if (!card) error('That card has no price right now.', 409);
    const cents = Math.round(gradedValue(card, row.grade, setForCard(row.card_id), Boolean(row.black_label)) * 100);
    value += cents;
    slabs.push({ id, cardId: row.card_id, name: card.name, number: card.number, rarity: card.rarity, image: card.image, small: card.imageSmall || card.image,
      grade: row.grade, bl: row.black_label ? 1 : 0, reverse: row.reverse ? 1 : 0, guard: row.guard || null, v: cents });
  }
  return { slabs, value };
}
/**
 * Turn the request's `cards` ([{ id, qty }]) and `slabs` ([graded_cards id]) into a checked, valued stake:
 * { stake, slabs, value (cents of both), collection }. Either list may be empty, not both.
 * `rules` and `noun` let another game (the jackpot) reuse it.
 */
export async function buildStake(env, request, helpers, userId, rawCards, rules = COINFLIP_RULES, noun = 'flip', rawSlabs = []) {
  const cardList = rawCards == null ? [] : rawCards;
  const slabList = rawSlabs == null ? [] : rawSlabs;
  if (!Array.isArray(cardList)) error('Put up at least one card.');
  if (!Array.isArray(slabList)) error('Choose valid slabs.');
  if (!cardList.length && !slabList.length) error('Put up at least one card.');
  if (cardList.length > rules.maxCards) error(`Put up at most ${rules.maxCards} different cards.`);
  const { collection, reverses } = await helpers.inventoryMap(env, userId);
  const seen = new Set(); const stake = []; let copies = 0; let value = 0;
  for (const row of cardList) {
    const id = String(row?.id || ''); const qty = Number(row?.qty);
    if (!/^[a-z0-9-]{3,48}$/i.test(id) || !Number.isInteger(qty) || qty < 1 || qty > (rules.maxQty || 9999)) error('Choose valid cards.');
    if (seen.has(id)) error('List each card once, with a quantity.');
    seen.add(id);
    const have = collection[id] || 0;
    if (have < qty) error(`You only have ${have} of ${id}.`, 409);
    // Keep your reverse holos: stake the plain copies first.
    const rev = Math.max(0, qty - (have - (reverses[id] || 0)));
    const card = await helpers.findCatalogCard(env, request, id);
    if (!card) error('Unknown card.');
    const cents = Math.round(sellValue(card) * 100);
    copies += qty; value += cents * qty;
    stake.push({ id, name: card.name, number: card.number, rarity: card.rarity, image: card.image, small: card.imageSmall || card.image,
      qty, rev, v: cents });
  }
  if (copies > rules.maxCopies) error(`Put up at most ${rules.maxCopies} cards in total.`);
  const held = await buildSlabs(env, request, helpers, userId, slabList, rules);
  value += held.value;
  if (value < rules.minCents) error(`${/^[aeiou]/i.test(noun) ? 'An' : 'A'} ${noun} needs at least ${money(rules.minCents / 100)} coins of cards.`);
  return { stake, slabs: held.slabs, value, collection };
}
const stakeAfter = (collection, stake) => {
  const next = { ...collection };
  for (const s of stake) next[s.id] = (next[s.id] || 0) - s.qty;
  return next;
};
/**
 * Statement that drops binder slots for cards that just left the collection (same compare-and-set as selling).
 * `slabs` are the slabs leaving with them (staked or sold): ownedWithSlabs reads the database before the
 * batch runs, so they still count there and are taken off here.
 */
export async function binderStatement(env, helpers, userId, collection, stake, guard, slabs = []) {
  const profile = await env.DB.prepare('SELECT binder FROM profiles WHERE user_id = ?').bind(userId).first();
  const owned = await helpers.ownedWithSlabs(env, userId, stakeAfter(collection, stake));
  for (const slab of slabs) owned[slab.cardId] = Math.max(0, (owned[slab.cardId] || 0) - 1);
  const binder = helpers.reconcileBinder(helpers.parseJson(profile?.binder, []), owned);
  return env.DB.prepare(`UPDATE profiles SET binder = CASE WHEN binder IS ? THEN ? ELSE binder END WHERE user_id = ? ${guard.sql}`)
    .bind(profile?.binder ?? null, JSON.stringify(binder), userId, ...guard.args);
}

// ---- The bot's stake -------------------------------------------------------
const randomInt = max => crypto.getRandomValues(new Uint32Array(1))[0] % max;
const randomUnit = () => randomInt(1 << 24) / (1 << 24);
export const pick = list => list[randomInt(list.length)];
export const shuffle = list => { const out = [...list]; for (let i = out.length - 1; i > 0; i--) { const j = randomInt(i + 1); [out[i], out[j]] = [out[j], out[i]]; } return out; };

/** The least index of `list` (ascending by cents) whose cents >= `cents`. */
const lowerBound = (list, cents) => { let lo = 0; let hi = list.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (list[mid].cents < cents) lo = mid + 1; else hi = mid; } return lo; };
/** How many cards of `list` (ascending by cents) cost at most `cents`. */
const upperBound = (list, cents) => { let lo = 0; let hi = list.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (list[mid].cents <= cents) lo = mid + 1; else hi = mid; } return lo; };

/* How hard the bot builder may work. A stake is built by taking QUANTITIES of a few chosen cards (never one copy at a
   time), so the work is a few dozen picks however many coins the host put up; these bounds only cap the worst case. */
export const BOT_BUILD = { attempts: 40, steps: 400, naturalDistinct: 40, naturalCopies: 3, maxSlabs: 10 };

/**
 * Raw cards worth between `low` and `high` cents (never above `high`): quantity-based. Each pick takes a card from the
 * sizeable end of what still fits (a card worth at least a quarter of what is left, else the dearest few) and a share of
 * how many copies fit: a few cards of a small stake, a few dozen deep stacks of a big one. At most rules.maxCards
 * different cards, rules.maxQty of one and rules.maxCopies in all. `priced` is ascending by cents.
 * Returns { rows: Map(id -> { ...card, qty, rev }), total } or null, and adds its picks to `stats.steps`.
 */
function fillRaw(priced, low, high, rules, stats) {
  const rows = new Map(); let total = 0; let copies = 0;
  const goal = 6 + randomInt(30); // roughly how many different cards this pile spreads over (a big pile is a few dozen deep stacks)
  for (let step = 0; total < low; step++) {
    if (step >= BOT_BUILD.steps) return null;
    stats.steps++;
    const rem = high - total;
    const fit = upperBound(priced, rem);
    if (!fit) return null;
    // Cheaper than rem / (copies still allowed) could never reach the target; a quarter of what is left is "sizeable".
    const floor = lowerBound(priced, Math.ceil(rem / Math.max(1, rules.maxCopies - copies)));
    const big = lowerBound(priced, Math.ceil(rem / 4));
    let from = big < fit ? Math.max(big, floor) : Math.max(floor, fit - Math.max(8, Math.ceil((fit - floor) / 2)));
    if (from >= fit) from = fit - 1; // only the dearest is any use
    let card = priced[from + randomInt(fit - from)];
    if (!rows.has(card.id) && rows.size >= rules.maxCards) {
      // every different card is used: stack more of one already in the pile that still fits
      const held = [...rows.values()].filter(r => r.cents <= rem && r.qty < rules.maxQty);
      if (!held.length) return null;
      card = pick(held);
    }
    const row = rows.get(card.id);
    const room = Math.min(Math.floor(rem / card.cents), rules.maxQty - (row ? row.qty : 0), rules.maxCopies - copies);
    if (room < 1) { if (rules.maxCopies - copies < 1) return null; continue; }
    // a share of what is left, so the pile spreads over about `goal` cards; the last few picks may take all that fits
    const share = rem / Math.max(1, goal - rows.size);
    const qty = Math.max(1, Math.min(room, Math.ceil(share / card.cents * (0.6 + 0.8 * randomUnit()))));
    if (row) row.qty += qty; else rows.set(card.id, { ...card, qty, rev: 0 });
    total += card.cents * qty; copies += qty;
  }
  return { rows, total };
}

/**
 * The grade of a bot's generated slab: only 10 or 9, rolled from the band's own odds renormalised over those two. A grade 9 is
 * worth exactly the card's market and a 10 its band's gem rate (>= 1.5), so a bot slab is NEVER worth less than the raw card
 * inside it. (A lower grade would be: whoever wins it could crack it for free and sell the card for more than the slab's
 * stated value, so the bot would be staking value it does not carry.)
 */
export const BOT_GRADES = [10, 9];
export function rollBotGrade(band, r10000) {
  const r = Math.floor(Number(r10000));
  if (!(r >= 0 && r < 10000)) throw new Error('rollBotGrade needs a roll in [0, 10000).');
  const top = band.odds[10]; const all = top + band.odds[9];
  return r * all < top * 10000 ? 10 : 9;
}
/** The mean multiplier of a bot slab in `band` (what a slab of a card is worth on average, as a share of its raw price). */
const botMeanMultiplier = band => (band.odds[10] * gradeMultiplier(10, band) + band.odds[9] * gradeMultiplier(9, band)) / (band.odds[10] + band.odds[9]);

/** A generated slab of `card` (grade 10 or 9, see rollBotGrade), worth its graded value, never under the card's price: no row, no id. */
function botSlab(card, band) {
  const grade = rollBotGrade(band, randomInt(10000));
  const v = Math.round(money(card.cents / 100 * gradeMultiplier(grade, band)) * 100);
  return { cardId: card.id, name: card.name, number: card.number, rarity: card.rarity, image: card.image, small: card.small, grade, reverse: false, guard: null, band: band.id, v };
}

/**
 * Up to `count` generated slabs worth about `budget` cents together and never more than `ceiling`: each is aimed at an
 * equal share of what is left (a card whose graded value should land near it, a little jittered).
 */
function fillSlabs(priced, budget, count, ceiling, stats) {
  const slabs = []; let total = 0;
  for (let i = 0; i < count; i++) {
    const avg = Math.max(1, Math.floor((budget - total) / (count - i)));
    let made = null;
    for (let tries = 0; tries < 6 && !made; tries++) {
      stats.steps++;
      const guess = priced[randomInt(priced.length)];
      const mult = Math.max(1, botMeanMultiplier(guess.band || GRADE_BANDS[0]));
      // a base price whose graded value is near avg, then the nearest card to it (a few places of jitter)
      const aim = avg / mult * (0.85 + 0.3 * randomUnit()) * (0.5 + randomUnit());
      const card = priced[Math.min(priced.length - 1, Math.max(0, lowerBound(priced, aim) - randomInt(3)))];
      const slab = botSlab(card, card.band || GRADE_BANDS[0]);
      if (total + slab.v <= ceiling) made = slab;
    }
    if (!made) break;
    slabs.push(made); total += made.v;
  }
  return { slabs, total };
}

/**
 * The bot's stake against `targetCents`: raw cards and/or generated slabs worth between botStakeWindow(target).low and
 * .high cents (never more than the host put up). { stake, slabs, value } or null. Built from the cards of the sets the
 * host's own cards come from plus a few random ones (`pool`), so it looks like what was staked. Pure given `pool`.
 * Slabs are used when the host staked slabs (the bot mirrors their share, at least one) or the target is above what
 * the old stake limits could reach with raw cards (40 different cards, 3 of each); otherwise only cards.
 * options: { hostSlabs: [snapshot], rules, stats: { attempts, steps } (filled in) }.
 */
export function buildBotStake(pool, targetCents, options = {}) {
  const rules = options.rules || COINFLIP_RULES; const stats = options.stats || {}; stats.attempts = 0; stats.steps = 0;
  const { low, high } = botStakeWindow(targetCents);
  const priced = pool.filter(c => c.cents >= 1 && c.cents <= high).sort((a, b) => a.cents - b.cents);
  if (!priced.length) return null;
  const hostSlabs = options.hostSlabs || [];
  const hostSlabValue = hostSlabs.reduce((n, s) => n + (s.v || 0), 0);
  let comfort = 0; for (let i = Math.max(0, priced.length - BOT_BUILD.naturalDistinct); i < priced.length; i++) comfort += priced[i].cents * BOT_BUILD.naturalCopies;
  const useSlabs = hostSlabs.length > 0 || high > comfort;
  for (let attempt = 0; attempt < BOT_BUILD.attempts; attempt++) {
    stats.attempts++;
    let slabs = []; let slabTotal = 0;
    if (useSlabs) {
      // Mirror the host's slabs (their count and share of the stake), else carry the part of a huge stake that cards alone could not.
      const count = hostSlabs.length
        ? Math.min(BOT_BUILD.maxSlabs, Math.max(1, hostSlabs.length + randomInt(3) - 1))
        : 2 + randomInt(BOT_BUILD.maxSlabs - 1);
      const share = hostSlabs.length
        ? Math.min(0.95, Math.max(0.05, hostSlabValue / Math.max(1, targetCents) * (0.8 + 0.4 * randomUnit())))
        : 0.3 + 0.3 * randomUnit();
      const built = fillSlabs(priced, Math.floor(high * share), count, high, stats);
      slabs = built.slabs; slabTotal = built.total;
      if (!slabs.length) continue;
    }
    if (slabTotal > high) continue;
    let raw = { rows: new Map(), total: 0 };
    if (slabTotal < low) { raw = fillRaw(priced, low - slabTotal, high - slabTotal, rules, stats); if (!raw) continue; }
    const value = slabTotal + raw.total;
    if (value >= low && value <= high) {
      return { stake: [...raw.rows.values()].map(({ cents, band, ...c }) => ({ ...c, v: cents })), slabs, value };
    }
  }
  return null;
}
export async function botPool(env, request, helpers, hostStake, hostSlabs = []) {
  const ids = [...hostStake.map(s => s.id), ...hostSlabs.map(s => s.cardId)];
  const own = new Set(ids.map(id => ALL_SETS.find(set => id.startsWith(`${set.id}-`))?.id).filter(Boolean));
  const sets = PLAYABLE_SETS.filter(set => own.has(set.id));
  for (const set of shuffle(PLAYABLE_SETS)) { if (sets.length >= own.size + 3 || sets.length >= 6) break; if (!sets.includes(set)) sets.push(set); }
  const pool = [];
  for (const set of sets) {
    for (const c of await helpers.loadSetCards(env, request, set)) {
      pool.push({ id: c.id, name: c.name, number: c.number, rarity: c.rarity, image: c.image, small: c.imageSmall || c.image,
        cents: Math.round(sellValue(c) * 100), band: bandFor(setForCard(c.id)) });
    }
  }
  return pool;
}

// ---- Views -----------------------------------------------------------------
const USER_SELECT = `SELECT f.*, hu.name AS host_name, hu.handle AS host_handle, hu.color AS host_color, hu.avatar AS host_avatar, hu.avatar_style AS host_avatar_style,
  gu.name AS guest_name, gu.handle AS guest_handle, gu.color AS guest_color, gu.avatar AS guest_avatar, gu.avatar_style AS guest_avatar_style
  FROM coinflips f LEFT JOIN users hu ON hu.id = f.host_id LEFT JOIN users gu ON gu.id = f.guest_id`;
const player = (row, side) => {
  const id = side === 'host' ? row.host_id : row.guest_id;
  if (!id) return null;
  if (id === HOUSE) {
    const persona = BOT_PERSONAS.find(p => p.id === row.bot_persona) || BOT_PERSONAS[0];
    return { userId: null, bot: true, name: persona.name, handle: `bot:${persona.id}`, color: persona.color, avatar: null, avatarStyle: null };
  }
  return { userId: id, bot: false, name: row[`${side}_name`] || 'Trainer', handle: row[`${side}_handle`] || '', color: row[`${side}_color`] || 'gold',
    avatar: avatarId(row[`${side}_avatar`]), avatarStyle: avatarStyle(row[`${side}_avatar_style`]) };
};
const centsToCoins = cents => money((cents || 0) / 100);
const stakeView = stake => (stake || []).map(({ v, ...s }) => ({ ...s, value: centsToCoins(v) }));
const slabsView = slabs => (slabs || []).map(stakeSlabView);
export function viewFlip(row, now = Date.now()) {
  const open = row.status === 'open';
  return { id: row.id, status: open && row.expires_at <= now ? 'expired' : row.status, bot: Boolean(row.bot),
    host: player(row, 'host'), guest: player(row, 'guest'),
    hostStake: stakeView(parse(row.host_stake)), hostValue: centsToCoins(row.host_value),
    hostSlabs: slabsView(parse(row.host_slabs)),
    guestStake: row.guest_stake ? stakeView(parse(row.guest_stake)) : null, guestValue: row.guest_value == null ? null : centsToCoins(row.guest_value),
    guestSlabs: row.guest_stake ? slabsView(parse(row.guest_slabs)) : null,
    window: open ? { min: centsToCoins(matchWindow(row.host_value).min), max: centsToCoins(matchWindow(row.host_value).max) } : null,
    winner: row.winner, hostCoin: row.host_coin, guestCoin: row.guest_coin,
    createdAt: row.created_at, expiresAt: row.expires_at, flippedAt: row.flipped_at };
}
const getFlip = async (env, id) => env.DB.prepare(`${USER_SELECT} WHERE f.id = ?`).bind(id).first();

/** Cancel every open flip past its expiry. The triggers hand each pile back to its host. */
export async function maintainCoinflips(env, now = Date.now()) {
  await ensureCasinoSchema(env);
  await env.DB.prepare("UPDATE coinflips SET status = 'cancelled' WHERE status = 'open' AND expires_at <= ?").bind(now).run();
  await maintainJackpots(env, now); // one scheduled handler covers both games
}

/** The equipped coin a player flips with (an id from data/gear.json), or null for the house coin. */
const equippedCoin = (env, userId) => equippedCoinId(env, userId);

// What the jackpot module borrows from here (it cannot import this file back without a cycle).
const SHARED = { buildStake, buildBotStake, botPool, binderStatement, pick, shuffle };

/** GET /api/casino/winnings/<source>/<id> says what a winner could sell; POST /api/casino/winnings/sell sells it. */
async function handleWinnings(path, method, request, env, helpers) {
  await ensureSalesSchema(env);
  const auth = await helpers.requireUser(request, env);
  if (auth.response) return auth.response;
  if (method === 'GET') {
    const m = path.match(/^\/api\/casino\/winnings\/(coinflip|jackpot|battle|upgrader)\/([a-zA-Z0-9-]{1,80})$/);
    if (!m) return helpers.json({ error: 'Not found.' }, 404);
    return helpers.json(await winningsInfo(env, request, helpers, auth.user, m[1], m[2]));
  }
  if (method !== 'POST' || path !== '/api/casino/winnings/sell') return helpers.json({ error: 'Not found.' }, 404);
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) error('Use this site to sell.', 403);
  if (!request.headers.get('content-type')?.includes('application/json')) error('Expected JSON.');
  const body = await helpers.readJson(request);
  if (!body || typeof body !== 'object') error('Expected JSON.');
  if (body.slabs !== undefined && typeof body.slabs !== 'boolean') error('Say whether to sell the slabs: true or false.');
  const sold = await sellWinnings(env, request, helpers, auth.user, String(body.source || ''), String(body.id || ''), binderStatement, body.slabs !== false);
  return helpers.json({ sold, save: await helpers.loadSave(env, auth.user.id) });
}

const errorStatus = message => /no longer ha(?:ve|s)|Not enough|already settled|expired|Cancel your open/.test(message) ? 409 : 0;

export async function handleCasino(path, method, request, env, helpers) {
  if (!path.startsWith('/api/casino')) return null;
  try {
    await ensureCasinoSchema(env);
    // Views carry avatars: users.avatar_style comes from the social runtime schema.
    if (helpers.ensureSocialSchema) await helpers.ensureSocialSchema(env);
    if (/^\/api\/casino\/upgrades(\/|$)/.test(path)) return await handleUpgrades(path, method, request, env, helpers, SHARED);
    if (/^\/api\/casino\/jackpots(\/|$)/.test(path)) return await handleJackpots(path, method, request, env, helpers, SHARED);
    if (/^\/api\/casino\/winnings(\/|$)/.test(path)) return await handleWinnings(path, method, request, env, helpers);
    const match = path.match(/^\/api\/casino\/coinflips(?:\/([a-zA-Z0-9-]{1,80}))?(?:\/(join|cancel))?$/);
    if (!match) return helpers.json({ error: 'Not found.' }, 404);
    const [, id, action] = match;
    await maintainCoinflips(env);
    if (method === 'GET') {
      if (id === 'bot' || action) return helpers.json({ error: 'Not found.' }, 404);
      const now = Date.now();
      if (id) {
        const row = await getFlip(env, id);
        if (!row) error('Flip not found.', 404);
        return helpers.json({ flip: viewFlip(row, now), serverNow: now });
      }
      const open = (await env.DB.prepare(`${USER_SELECT} WHERE f.status = 'open' AND f.expires_at > ? ORDER BY f.created_at DESC LIMIT 40`).bind(now).all()).results || [];
      const done = (await env.DB.prepare(`${USER_SELECT} WHERE f.status = 'done' ORDER BY f.flipped_at DESC LIMIT 20`).all()).results || [];
      let record = null;
      const auth = await helpers.requireUser(request, env);
      if (!auth.response) {
        const uid = auth.user.id;
        const r = await env.DB.prepare(`SELECT COUNT(*) AS played,
          SUM(CASE WHEN (winner = 'host' AND host_id = ?1) OR (winner = 'guest' AND guest_id = ?1) THEN 1 ELSE 0 END) AS won
          FROM coinflips WHERE status = 'done' AND (host_id = ?1 OR guest_id = ?1)`).bind(uid).first();
        record = { played: r?.played || 0, won: r?.won || 0 };
      }
      return helpers.json({ open: open.map(r => viewFlip(r, now)), done: done.map(r => viewFlip(r, now)), record,
        rules: COINFLIP_RULES, serverNow: now });
    }
    if (method !== 'POST') return helpers.json({ error: 'Not found.' }, 404);
    if (id && id !== 'bot' && !action) return helpers.json({ error: 'Not found.' }, 404);
    if (!id && action) return helpers.json({ error: 'Not found.' }, 404);
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) error('Use this site to flip.', 403);
    if (!request.headers.get('content-type')?.includes('application/json')) error('Expected JSON.');
    const auth = await helpers.requireUser(request, env);
    if (auth.response) return auth.response;
    const user = auth.user; const body = await helpers.readJson(request);
    if (!body || typeof body !== 'object') error('Expected JSON.');
    if (action !== 'cancel') { // level gate: starting or first-time joining only
      const shut = await gateResponse(env, helpers.json, user.id, 'coinflip'); if (shut) return shut;
    }
    let outId;
    if (!id || id === 'bot') outId = await createFlip(env, request, helpers, user, body, id === 'bot');
    else if (action === 'join') outId = await joinFlip(env, request, helpers, user, id, body);
    else outId = await cancelFlip(env, user, id);
    const at = Date.now();
    return helpers.json({ flip: viewFlip(await getFlip(env, outId), at), save: await helpers.loadSave(env, user.id), serverNow: at });
  } catch (err) {
    if (err.status) return helpers.json({ error: err.message }, err.status);
    const status = errorStatus(err.message || '');
    if (status) return helpers.json({ error: err.message }, status);
    throw err;
  }
}

async function createFlip(env, request, helpers, user, body, withBot) {
  const requestId = String(body.requestId || '');
  if (!/^[a-zA-Z0-9-]{8,80}$/.test(requestId)) error('Provide a unique requestId.');
  const existing = await env.DB.prepare('SELECT id FROM coinflips WHERE host_id = ? AND request_id = ?').bind(user.id, requestId).first();
  if (existing) return existing.id; // a retry: the cards already moved
  const open = await env.DB.prepare("SELECT COUNT(*) AS n FROM coinflips WHERE host_id = ? AND status = 'open'").bind(user.id).first();
  if (!withBot && open.n >= COINFLIP_RULES.maxOpen) error(`You can have ${COINFLIP_RULES.maxOpen} open flips at once. Cancel one first.`, 409);
  const { stake, slabs, value, collection } = await buildStake(env, request, helpers, user.id, body.cards, COINFLIP_RULES, 'flip', body.slabs);
  const now = Date.now(); const id = crypto.randomUUID();
  const hostCoin = await equippedCoin(env, user.id);
  const insert = env.DB.prepare(`INSERT INTO coinflips(id, host_id, request_id, bot, host_stake, host_slabs, host_value, host_coin, created_at, expires_at)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, user.id, requestId, withBot ? 1 : 0, JSON.stringify(stake), slabs.length ? JSON.stringify(slabs) : null,
    value, hostCoin, now, now + COINFLIP_RULES.openHours * 3600000);
  const statements = [insert];
  if (withBot) {
    const pool = await botPool(env, request, helpers, stake, slabs);
    const bot = buildBotStake(pool, value, { hostSlabs: slabs, rules: COINFLIP_RULES });
    if (!bot) error('The bot could not match that stake. Try a slightly different one.', 409);
    const persona = pick(BOT_PERSONAS); const winner = crypto.getRandomValues(new Uint8Array(1))[0] & 1 ? 'host' : 'guest';
    statements.push(env.DB.prepare(`UPDATE coinflips SET status = 'done', guest_id = ?, guest_stake = ?, guest_slabs = ?, guest_value = ?, bot_persona = ?,
      winner = ?, flipped_at = ? WHERE id = ? AND status = 'open'`).bind(HOUSE, JSON.stringify(bot.stake), bot.slabs.length ? JSON.stringify(bot.slabs) : null, bot.value, persona.id, winner, now, id));
  }
  statements.push(await binderStatement(env, helpers, user.id, collection, stake, { sql: 'AND EXISTS(SELECT 1 FROM coinflips WHERE id = ?)', args: [id] }, slabs));
  try { await env.DB.batch(statements); }
  catch (err) {
    // A double-tapped create that lost the race: the winner's row is the answer.
    const raced = await env.DB.prepare('SELECT id FROM coinflips WHERE host_id = ? AND request_id = ?').bind(user.id, requestId).first();
    if (raced) return raced.id;
    throw err;
  }
  return id;
}

async function joinFlip(env, request, helpers, user, id, body) {
  const row = await env.DB.prepare('SELECT * FROM coinflips WHERE id = ?').bind(id).first();
  if (!row) error('Flip not found.', 404);
  const now = Date.now();
  if (row.guest_id === user.id && row.status === 'done') return id; // a retry: it already flipped
  if (row.status !== 'open' || row.expires_at <= now) error('That flip is over.', 409);
  if (row.host_id === user.id) error('You cannot flip against yourself.', 409);
  const { stake, slabs, value, collection } = await buildStake(env, request, helpers, user.id, body.cards, COINFLIP_RULES, 'flip', body.slabs);
  const { min, max } = matchWindow(row.host_value);
  if (value < min || value > max) error(`Match the stake: between ${centsToCoins(min)} and ${centsToCoins(max)} coins of cards.`);
  const winner = crypto.getRandomValues(new Uint8Array(1))[0] & 1 ? 'host' : 'guest';
  const guestCoin = await equippedCoin(env, user.id);
  const results = await env.DB.batch([
    env.DB.prepare(`UPDATE coinflips SET status = 'done', guest_id = ?, guest_stake = ?, guest_slabs = ?, guest_value = ?, guest_coin = ?, winner = ?, flipped_at = ?
      WHERE id = ? AND status = 'open' AND guest_id IS NULL AND host_id != ? AND expires_at > ?`)
      .bind(user.id, JSON.stringify(stake), slabs.length ? JSON.stringify(slabs) : null, value, guestCoin, winner, now, id, user.id, now),
    await binderStatement(env, helpers, user.id, collection, stake,
      { sql: "AND EXISTS(SELECT 1 FROM coinflips WHERE id = ? AND guest_id = ? AND status = 'done')", args: [id, user.id] }, slabs),
  ]);
  if (!results[0]?.meta?.changes) error('Someone else got there first.', 409);
  return id;
}

async function cancelFlip(env, user, id) {
  const row = await env.DB.prepare('SELECT host_id, status FROM coinflips WHERE id = ?').bind(id).first();
  if (!row) error('Flip not found.', 404);
  if (row.host_id !== user.id) error('Only the host can cancel a flip.', 403);
  if (row.status === 'cancelled') return id;
  const done = await env.DB.prepare("UPDATE coinflips SET status = 'cancelled' WHERE id = ? AND host_id = ? AND status = 'open'").bind(id, user.id).run();
  if (!done.meta?.changes) error('That flip already happened.', 409);
  return id;
}
