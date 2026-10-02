import { ALL_SETS, money, offerPackCount, sellValue } from '../js/catalog.js';
import { cartEligible } from '../js/orders-rules.js';
import { UPGRADER_RULES, hasMarketPrice, slabTargetValue, upgradeChance } from '../js/upgrader-rules.js';
import { avatarId, avatarStyle } from '../js/cosmetics.js';
import { UPGRADER_DDL, UPGRADER_V2_DDL } from './casino-ddl.js';
import { ensureCasinoSchema } from './casino.js';
import { ensureOrdersSchema } from './orders.js';
import { resolveSealedOffer } from './sealed-roll.js';
import { stakeSlabView, setForCard } from './grading.js';
import { GRADES, bandFor } from '../js/grading-rules.js';
import { gateResponse } from './gates.js';

/* Casino Upgrader (migration 0028). Put up cards and/or graded slabs (valued like every casino stake) and pick a target worth
   more: any card of any set, or any sealed product the shop sells. One roll decides it:
     chance (millionths) = min(800000, floor(stake * 950000 / target)),  won = roll < chance.
   The expected value of any upgrade is at most 95% of the stake, whatever the target. The rules live here and in the triggers of
   the migration (upgrade_check refuses a wrong chance or a wrong result, upgrade_take moves the cards, closes the slabs and
   pays the target in the same transaction); a client only asks. An upgrade is against the house, so it earns no casino XP
   (worker/xp.js counts only games between players) and records no quest event. worker/casino.js hands in the shared stake
   builders (`shared`); the schema code imports ensureCasinoSchema back from it, which is fine because nothing here runs at
   import time. */

const error = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const parse = value => value ? JSON.parse(value) : null;
const centsToCoins = cents => money((cents || 0) / 100);

// ---- Schema (applied by the Worker itself, see worker/casino.js) ------------
const UPGRADER_OBJECTS = UPGRADER_DDL.map(sql => sql.match(/CREATE (?:UNIQUE )?(?:TABLE|INDEX|TRIGGER) IF NOT EXISTS (\w+)/)[1]);
let upgraderSchemaReady = false;
let upgraderSchemaWork = null;
/** Tests only: forget the per-isolate cache so another database is checked. */
export const resetUpgraderSchemaCache = () => { upgraderSchemaReady = false; upgraderSchemaWork = null; };
/**
 * Create the upgrades table and triggers once per isolate. The triggers write `cards`, `graded_cards` and `sealed_vault`, so the casino
 * (coinflips, slabs, grading) and the orders schema come first; then one atomic D1 batch of UPGRADER_DDL (all IF NOT EXISTS) when
 * any of its objects is missing. A database where migration 0028 was applied by file has them all and nothing is written.
 */
export async function ensureUpgraderSchema(env) {
  if (upgraderSchemaReady) return;
  if (!upgraderSchemaWork) {
    upgraderSchemaWork = (async () => {
      try {
        await ensureCasinoSchema(env); // coinflips, the slab columns and triggers, graded_cards
        await ensureOrdersSchema(env); // sealed_vault
        const rows = (await env.DB.prepare(`SELECT name FROM sqlite_master WHERE name IN (${UPGRADER_OBJECTS.map(() => '?').join(',')})`)
          .bind(...UPGRADER_OBJECTS).all()).results || [];
        if (rows.length < UPGRADER_OBJECTS.length) await env.DB.batch(UPGRADER_DDL.map(sql => env.DB.prepare(sql)));
        // upgrader-v2 (migration 0031, slab targets): replace the two triggers, in one atomic batch, while either lacks its marker.
        const triggers = (await env.DB.prepare(`SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name IN ('upgrade_check', 'upgrade_take')`).all()).results || [];
        if (triggers.length < 2 || triggers.some(row => !String(row.sql).includes('upgrader-v2'))) await env.DB.batch(UPGRADER_V2_DDL.map(sql => env.DB.prepare(sql)));
        upgraderSchemaReady = true;
      } catch (err) {
        console.error('ensureUpgraderSchema', err);
        throw err;
      } finally {
        upgraderSchemaWork = null;
      }
    })();
  }
  return upgraderSchemaWork;
}

// ---- The roll ------------------------------------------------------------------
const ROLL_RANGE = 1000000;
const ROLL_LIMIT = 4294000000; // the largest multiple of ROLL_RANGE that fits in 32 bits: draws at or above it are thrown away
/** A uniform integer in [0, 1000000): crypto draws, rejection-sampled so the remainder has no modulo bias. */
export function rollUpgrade() {
  const draw = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(draw);
    if (draw[0] < ROLL_LIMIT) return draw[0] % ROLL_RANGE;
  }
}

// ---- Views -----------------------------------------------------------------
const USER_SELECT = `SELECT up.*, u.name AS user_name, u.handle AS user_handle, u.color AS user_color, u.avatar AS user_avatar, u.avatar_style AS user_avatar_style
  FROM upgrades up LEFT JOIN users u ON u.id = up.user_id`;
const stakeView = stake => (stake || []).map(({ v, ...s }) => ({ ...s, value: centsToCoins(v) }));
const slabsView = slabs => (slabs || []).map(stakeSlabView);
/** One upgrade as the client sees it. Values are coins; `chance` is in millionths and `roll` in [0, 1000000). */
export function viewUpgrade(row) {
  const snap = parse(row.target) || {};
  const sealed = row.target_kind === 'sealed';
  return { id: row.id,
    player: { userId: row.user_id, name: row.user_name || 'Trainer', handle: row.user_handle || '', color: row.user_color || 'gold',
      avatar: avatarId(row.user_avatar), avatarStyle: avatarStyle(row.user_avatar_style) },
    stake: stakeView(parse(row.stake)), slabs: slabsView(parse(row.slabs)), stakeValue: centsToCoins(row.stake_value),
    target: { kind: row.target_kind, id: row.target_id, setId: (sealed ? row.target_set : snap.setId) ?? '', name: snap.name ?? '', image: snap.image ?? '',
      small: snap.small ?? null, number: snap.number ?? null, rarity: snap.rarity ?? null, short: snap.short ?? null, packs: snap.packs ?? null,
      ...(snap.grade ? { grade: snap.grade, blackLabel: Boolean(snap.bl) } : {}) },
    targetValue: centsToCoins(row.target_value), chance: row.chance, roll: row.roll, won: Boolean(row.won), createdAt: row.created_at };
}
const getUpgrade = async (env, id) => env.DB.prepare(`${USER_SELECT} WHERE up.id = ?`).bind(id).first();
const findByRequest = async (env, userId, requestId) => env.DB.prepare('SELECT id FROM upgrades WHERE user_id = ? AND request_id = ?').bind(userId, requestId).first();

// ---- The target ------------------------------------------------------------------
/** The target as { kind, id, setId (for a sealed product, the selling set), value (cents), snapshot }, valued now by the same prices selling and the shop use. */
async function resolveTarget(env, request, helpers, raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) error('Pick a target.');
  if (raw.kind === 'card') {
    const id = String(raw.id || '');
    if (!/^[a-z0-9-]{3,48}$/i.test(id)) error('Pick a valid card.');
    const found = await helpers.findCatalogCard(env, request, id);
    if (!found) error('Unknown card.');
    if (!hasMarketPrice(found)) error('That card has no market price to upgrade to.'); // priced only by the rarity fallback: not a real price
    if (!found.image) error('That card has no picture to upgrade to.');
    const set = ALL_SETS.find(item => id.startsWith(`${item.id}-`));
    const snapshot = { name: found.name, image: found.image, small: found.imageSmall || found.image, number: found.number, rarity: found.rarity, setId: set?.id || '' };
    if (raw.grade == null) {
      if (raw.blackLabel != null && raw.blackLabel !== false) error('Pick a grade for a Black Label.');
      return { kind: 'card', id, setId: null, value: Math.round(sellValue(found) * 100), snapshot };
    }
    // A graded slab: any grade 1 to 10 of any priced card, or a Black Label (a 10 with four perfect subgrades), valued exactly as selling it would pay.
    const grade = raw.grade; const blackLabel = raw.blackLabel === true;
    if (!Number.isInteger(grade) || !GRADES.includes(grade)) error('Pick a grade from 1 to 10.');
    if (raw.blackLabel != null && typeof raw.blackLabel !== 'boolean') error('Pick a valid grade.');
    if (blackLabel && grade !== 10) error('Only a 10 can be a Black Label.');
    const gradeSet = setForCard(id);
    return { kind: 'card', id, setId: null, value: Math.round(slabTargetValue(sellValue(found), id, grade, blackLabel) * 100),
      snapshot: { ...snapshot, grade, bl: blackLabel ? 1 : 0, band: bandFor(gradeSet).id } };
  }
  if (raw.kind === 'sealed') {
    if (raw.grade != null || raw.blackLabel != null) error('A sealed product has no grade.');
    const setId = String(raw.setId || ''); const id = String(raw.id || '');
    if (!/^[a-z0-9]{1,24}$/i.test(setId) || !/^[A-Za-z0-9_.-]{1,80}$/.test(id)) error('Pick a valid product.');
    const { offer } = await resolveSealedOffer(env, request, setId, id, { loadSealed: helpers.loadSealed, loadProducts: helpers.loadProducts });
    if (!cartEligible(offer)) error("That product can't be an upgrade target.");
    const image = (((await helpers.loadProducts(env, request))[setId]) || []).find(item => item.id === offer.id)?.image || offer.image || '';
    return { kind: 'sealed', id: offer.id, setId, value: Math.round(offer.price * 100),
      snapshot: { name: offer.name, short: offer.short, image, setId, packs: offerPackCount(offer) } };
  }
  error('Pick a card or a sealed product.');
}

// Errors the triggers raise, with the status a player should see.
const TRIGGER_ERRORS = [
  [/You no longer have those (?:cards|slabs)\./, 409],
  [/That (?:stake|upgrade|target) is not valid\.|Put up at least one card\./, 400],
];

// ---- The API ---------------------------------------------------------------
/** GET /api/casino/upgrades, GET /api/casino/upgrades/<id> and POST /api/casino/upgrades (the roll). */
export async function handleUpgrades(path, method, request, env, helpers, shared) {
  try {
    await ensureUpgraderSchema(env);
    const match = path.match(/^\/api\/casino\/upgrades(?:\/([a-zA-Z0-9-]{1,80}))?$/);
    if (!match) return helpers.json({ error: 'Not found.' }, 404);
    const [, id] = match;
    if (method === 'GET') {
      const now = Date.now();
      if (id) {
        const row = await getUpgrade(env, id);
        if (!row) error('Upgrade not found.', 404);
        return helpers.json({ upgrade: viewUpgrade(row), serverNow: now });
      }
      const recent = (await env.DB.prepare(`${USER_SELECT} ORDER BY up.created_at DESC, up.rowid DESC LIMIT 20`).all()).results || [];
      let mine = []; let record = null;
      const auth = await helpers.requireUser(request, env);
      if (!auth.response) {
        const uid = auth.user.id;
        mine = (await env.DB.prepare(`${USER_SELECT} WHERE up.user_id = ? ORDER BY up.created_at DESC, up.rowid DESC LIMIT 12`).bind(uid).all()).results || [];
        const r = await env.DB.prepare(`SELECT COUNT(*) AS played, COALESCE(SUM(won), 0) AS won,
          COALESCE(MAX(CASE WHEN won = 1 THEN target_value END), 0) AS biggest FROM upgrades WHERE user_id = ?`).bind(uid).first();
        record = { played: r?.played || 0, won: r?.won || 0, biggest: centsToCoins(r?.biggest) };
      }
      return helpers.json({ recent: recent.map(viewUpgrade), mine: mine.map(viewUpgrade), record, rules: UPGRADER_RULES, serverNow: now });
    }
    if (method !== 'POST' || id) return helpers.json({ error: 'Not found.' }, 404);
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) error('Use this site to upgrade.', 403);
    if (!request.headers.get('content-type')?.includes('application/json')) error('Expected JSON.');
    const auth = await helpers.requireUser(request, env);
    if (auth.response) return auth.response;
    const user = auth.user; const body = await helpers.readJson(request);
    if (!body || typeof body !== 'object') error('Expected JSON.');
    const shut = await gateResponse(env, helpers.json, user.id, 'upgrader'); if (shut) return shut; // level gate: POST only
    const made = await createUpgrade(env, request, helpers, shared, user, body);
    if (made.staleChance) return helpers.json({ error: 'The odds changed. Look again.', chance: made.staleChance }, 409);
    const at = Date.now();
    return helpers.json({ upgrade: viewUpgrade(await getUpgrade(env, made.id)), save: await helpers.loadSave(env, user.id), serverNow: at });
  } catch (err) {
    if (err.status) throw err;
    const message = String(err.message || '');
    for (const [pattern, status] of TRIGGER_ERRORS) { const hit = message.match(pattern); if (hit) error(hit[0], status); }
    throw err;
  }
}

/** Value the stake and the target, roll once, and settle in one batch. Returns { id } (or { staleChance } when the odds the player saw are not the odds now). */
async function createUpgrade(env, request, helpers, shared, user, body) {
  const requestId = String(body.requestId || '');
  if (!/^[a-zA-Z0-9-]{8,80}$/.test(requestId)) error('Provide a unique requestId.');
  const existing = await findByRequest(env, user.id, requestId);
  if (existing) return { id: existing.id }; // a retry: the stake already moved
  const { stake, slabs, value: stakeValue, collection } = await shared.buildStake(env, request, helpers, user.id, body.cards, UPGRADER_RULES, 'upgrade', body.slabs);
  const target = await resolveTarget(env, request, helpers, body.target);
  if (target.value <= stakeValue) error('Pick a target worth more than your stake.');
  const chance = upgradeChance(stakeValue, target.value);
  if (chance < UPGRADER_RULES.minChance) error('That target is too far away for this stake.');
  if (body.expectedChance !== undefined && body.expectedChance !== null) {
    if (!Number.isInteger(body.expectedChance) || body.expectedChance < 0 || body.expectedChance > 1000000) error('Send the odds you saw as a whole number.');
    if (body.expectedChance !== chance) return { staleChance: chance }; // prices moved under the player
  }
  const roll = rollUpgrade(); const won = roll < chance;
  const now = Date.now(); const id = crypto.randomUUID();
  const insert = env.DB.prepare(`INSERT INTO upgrades(id, user_id, request_id, stake, slabs, stake_value, target_kind, target_id, target_set, target, target_value, chance, roll, won, created_at)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, user.id, requestId, JSON.stringify(stake), slabs.length ? JSON.stringify(slabs) : null, stakeValue,
    target.kind, target.id, target.kind === 'sealed' ? target.setId : null, JSON.stringify(target.snapshot), target.value, chance, roll, won ? 1 : 0, now);
  // A won card is owned from this moment, so the binder keeps a slot for it even when a staked slab or card of the same id leaves.
  const after = { ...collection };
  if (won && target.kind === 'card') after[target.id] = (after[target.id] || 0) + 1;
  const binder = await shared.binderStatement(env, helpers, user.id, after, stake, { sql: 'AND EXISTS(SELECT 1 FROM upgrades WHERE id = ?)', args: [id] }, slabs);
  try { await env.DB.batch([insert, binder]); }
  catch (err) {
    // A double-tapped request that lost the race (or an answer that was lost after the batch committed): the row that exists is the answer.
    const raced = await findByRequest(env, user.id, requestId);
    if (raced) return { id: raced.id };
    throw err;
  }
  return { id };
}
