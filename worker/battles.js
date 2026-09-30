import { PLAYABLE_SETS, sealedOffers, promoOffers, offerPackSets, money, sellValue } from '../js/catalog.js';
import { ripPack, drawPromos } from '../js/engine.js';
import { BATTLE_LIMITS, BATTLE_TIMING, BOT_PERSONAS, battleSettings, battleResult, roundScores } from '../js/battle-rules.js';
import { avatarId, avatarStyle } from '../js/cosmetics.js';

const error = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const parse = value => value ? JSON.parse(value) : null;
const getRow = (env, id) => env.DB.prepare('SELECT * FROM battles WHERE id = ?').bind(id).first();
const seatRecord = s => ({ seat: s.seat, userId: s.user_id, payerId: s.payer_id, name: s.name, handle: s.handle, color: s.color, bot: Boolean(s.bot),
  avatar: s.bot ? null : avatarId(s.avatar), avatarStyle: s.bot ? null : avatarStyle(s.avatar_style) });
// users.avatar_style is added at runtime by ensureSocialSchema (called before any battle query).
const SEAT_SELECT = `SELECT s.*, u.avatar, u.avatar_style FROM battle_seats s LEFT JOIN users u ON u.id = s.user_id`;
const getSeats = async (env, id) => ((await env.DB.prepare(`${SEAT_SELECT} WHERE s.battle_id = ? ORDER BY s.seat`).bind(id).all()).results || []).map(seatRecord);

// Bots are free (migration 0013). New bot seats store this sentinel payer, which
// no account can have (user ids are 16 hex digits): the seat triggers skip the
// coin check, the debit and the refund for it. Bot seats paid under 0012 keep
// the host as payer and still refund the host when deleted.
const FREE_PAYER = 'free';
// The same DDL as worker/migrations/0013_free_bots.sql. Nobody can run remote
// migrations, so the Worker applies it to itself once: one D1 batch is one
// transaction, so every isolate sees either the old triggers or all new ones.
// Replaying it (a second isolate, or migrations apply later) rewrites identical
// triggers. Refund goes first so a non-atomic replay can only withhold coins.
export const FREE_BOT_DDL = [
  'DROP TRIGGER IF EXISTS battle_seat_refund',
  `CREATE TRIGGER battle_seat_refund AFTER DELETE ON battle_seats
WHEN OLD.payer_id != 'free' AND (SELECT status FROM battles WHERE id = OLD.battle_id) IN ('lobby','cancelled') BEGIN
  UPDATE profiles SET coins = ROUND(coins + (SELECT entry_cost FROM battles WHERE id = OLD.battle_id), 2)
  WHERE user_id = OLD.payer_id;
END`,
  'DROP TRIGGER IF EXISTS battle_seat_validate',
  `CREATE TRIGGER battle_seat_validate BEFORE INSERT ON battle_seats BEGIN
  SELECT (CASE WHEN NOT EXISTS (
    SELECT 1 FROM battles b WHERE b.id = NEW.battle_id AND b.status = 'lobby'
    AND b.expires_at > CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
    AND NEW.seat < json_extract(b.settings, '$.players')
  ) THEN RAISE(ABORT, 'Battle is no longer accepting players.') END);
  SELECT (CASE WHEN (NEW.payer_id = 'free') != (NEW.bot = 1)
  THEN RAISE(ABORT, 'Bots play free and players pay their own entry.') END);
  SELECT (CASE WHEN NEW.payer_id != 'free' AND NOT EXISTS (
    SELECT 1 FROM profiles p JOIN battles b ON b.id = NEW.battle_id
    WHERE p.user_id = NEW.payer_id AND p.coins >= b.entry_cost
  ) THEN RAISE(ABORT, 'Not enough coins.') END);
END`,
  'DROP TRIGGER IF EXISTS battle_seat_debit',
  `CREATE TRIGGER battle_seat_debit AFTER INSERT ON battle_seats
WHEN NEW.payer_id != 'free' BEGIN
  UPDATE profiles SET coins = ROUND(coins - (SELECT entry_cost FROM battles WHERE id = NEW.battle_id), 2)
  WHERE user_id = NEW.payer_id;
END`,
  `CREATE UNIQUE INDEX IF NOT EXISTS battle_bot_persona ON battle_seats(battle_id, handle)
WHERE bot = 1 AND payer_id = 'free'`,
];
const FREE_BOT_OBJECTS = ['battle_seat_refund', 'battle_seat_validate', 'battle_seat_debit', 'battle_bot_persona'];
// The same DDL as worker/migrations/0014_fast_settlement.sql: the award trigger
// with each JSON value read once. 0012's version re-parsed every allocation per
// card and joined every round to every round, which production D1 refused for
// a big battle (SQLITE_NOMEM, 2026-09-30). Applied like FREE_BOT_DDL: one atomic batch, once per isolate,
// recognised by the LIMIT -1 subqueries.
export const AWARD_DDL = [
  'DROP TRIGGER IF EXISTS battle_settle_award',
  `CREATE TRIGGER battle_settle_award AFTER INSERT ON battle_settlements BEGIN
  UPDATE battles SET status = 'finished' WHERE id = NEW.battle_id;
  INSERT INTO cards(user_id, card_id, qty, reverse_qty)
  SELECT al.uid, json_extract(c.value, '$.id'), COUNT(*), SUM(COALESCE(json_extract(c.value, '$.reverse'), 0))
  FROM (SELECT json_extract(a.value, '$.userId') AS uid, json_extract(a.value, '$.cards') AS cards
    FROM battles b, json_each(b.result, '$.allocations') a WHERE b.id = NEW.battle_id LIMIT -1) al,
    json_each(al.cards) c
  WHERE al.uid IS NOT NULL
  GROUP BY al.uid, json_extract(c.value, '$.id')
  ON CONFLICT(user_id, card_id) DO UPDATE SET qty = cards.qty + excluded.qty,
    reverse_qty = cards.reverse_qty + excluded.reverse_qty;
  UPDATE profiles SET packs_opened = packs_opened + (
    SELECT COUNT(*) FROM battles b, json_each(b.plan) r
    WHERE b.id = NEW.battle_id AND json_extract(r.value, '$.kind') = 'pack'
  ), pulls = pulls + COALESCE((
    SELECT SUM(pu.n) FROM (SELECT json_extract(p.value, '$.seat') AS seat, json_array_length(p.value, '$.cards') AS n
      FROM battles b, json_each(b.outcomes) r, json_each(r.value, '$.pulls') p WHERE b.id = NEW.battle_id LIMIT -1) pu,
      battle_seats s
    WHERE s.battle_id = NEW.battle_id AND s.user_id = profiles.user_id AND s.seat = pu.seat
  ), 0)
  WHERE user_id IN (SELECT user_id FROM battle_seats WHERE battle_id = NEW.battle_id AND bot = 0);
  INSERT INTO pack_log(user_id, set_id, wrapper_id, cost, cards, at)
  SELECT s.user_id, pl.set_id, pl.wrapper_id, 0, pu.cards, NEW.at
  FROM (SELECT json_extract(plan.value, '$.index') AS idx, json_extract(plan.value, '$.setId') AS set_id,
      json_extract(plan.value, '$.wrapperId') AS wrapper_id
    FROM battles b, json_each(b.plan) plan
    WHERE b.id = NEW.battle_id AND json_extract(plan.value, '$.kind') = 'pack' LIMIT -1) pl,
    (SELECT json_extract(r.value, '$.index') AS idx, json_extract(p.value, '$.seat') AS seat,
      json_extract(p.value, '$.cards') AS cards
    FROM battles b, json_each(b.outcomes) r, json_each(r.value, '$.pulls') p WHERE b.id = NEW.battle_id LIMIT -1) pu,
    battle_seats s
  WHERE pu.idx = pl.idx AND s.battle_id = NEW.battle_id AND s.seat = pu.seat AND s.bot = 0;
  UPDATE users SET last_played = NEW.at WHERE id IN
    (SELECT user_id FROM battle_seats WHERE battle_id = NEW.battle_id AND bot = 0);
END`,
];
const AWARD_MARK = 'LIMIT -1';
let battleSchemaReady = false;
/** Tests only: forget the per-isolate cache so another database is checked. */
export const resetBattleSchemaCache = () => { battleSchemaReady = false; };
/**
 * Bring the seat triggers to 0013 and the award trigger to 0014 once per
 * isolate (one cheap sqlite_master read; after that the flag short-circuits).
 * Only the presence of the 'free' rule and the LIMIT -1 mark is checked, never
 * exact text, so a later migration that rewrites these triggers (keeping them)
 * is never reverted. Resolves false while the 0012
 * tables are missing or the upgrade failed; the caller then refuses bots.
 */
export async function ensureBattleSchema(env) {
  if (battleSchemaReady) return true;
  try {
    const names = [...FREE_BOT_OBJECTS, 'battle_settle_award'];
    const rows = (await env.DB.prepare(`SELECT name, sql FROM sqlite_master WHERE type IN ('trigger','index')
      AND name IN (${names.map(() => '?').join(',')})`).bind(...names).all()).results || [];
    if (!rows.some(r => r.name === 'battle_seat_validate')) return false; // 0012 not applied yet
    const current = FREE_BOT_OBJECTS.every(name => rows.some(r => r.name === name && String(r.sql).includes(`'${FREE_PAYER}'`)));
    if (!current) await env.DB.batch(FREE_BOT_DDL.map(sql => env.DB.prepare(sql)));
    const award = rows.find(r => r.name === 'battle_settle_award');
    // Bots don't depend on this one: a failure is logged and retried next isolate.
    if (!award || !String(award.sql).includes(AWARD_MARK)) {
      try { await env.DB.batch(AWARD_DDL.map(sql => env.DB.prepare(sql))); }
      catch (err) { console.error('ensureBattleSchema: award trigger', err); }
    }
    battleSchemaReady = true;
    return true;
  } catch (err) {
    console.error('ensureBattleSchema', err);
    return false;
  }
}
const requireFreeBots = async env => {
  if (!await ensureBattleSchema(env)) error('Bots are waiting for the database update.', 503);
};
const shuffled = list => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) { const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
};
function botInsert(env, id, seat, persona) {
  return env.DB.prepare(`INSERT INTO battle_seats(battle_id, seat, user_id, payer_id, name, handle, color, bot)
    VALUES(?, ?, NULL, ?, ?, ?, ?, 1)`).bind(id, seat, FREE_PAYER, persona.name, `bot:${persona.id}`, persona.color);
}
/** Bot statements for `targets`, each a random persona no seat in `seats` uses. */
function botInserts(env, id, seats, targets) {
  // Legacy bots count as the persona their view shows, which then stays stable.
  const used = new Set(presentLegacyBots(seats).filter(s => s.bot).map(s => s.handle));
  const personas = shuffled(BOT_PERSONAS.filter(p => !used.has(`bot:${p.id}`)));
  return targets.map((seat, i) => botInsert(env, id, seat, personas[i]));
}
const personaClash = err => /UNIQUE constraint failed: battle_seats\.battle_id, battle_seats\.handle/.test(err?.message || '');
const seatClash = err => /UNIQUE constraint failed: battle_seats\.battle_id, battle_seats\.seat/.test(err?.message || '');
/**
 * Seat free bots in the seats `pick(currentSeats)` returns, in one batch. Two
 * concurrent calls can draw the same persona (the partial unique index rejects
 * the loser) or race for a seat (primary key); the loser re-reads the table and
 * picks again, so a double-tapped call is idempotent.
 */
async function seatBots(env, id, pick) {
  await requireFreeBots(env);
  for (let attempt = 0; ; attempt++) {
    const seats = await getSeats(env, id);
    const targets = pick(seats);
    if (!targets.length) return;
    try { await env.DB.batch(botInserts(env, id, seats, targets)); return; }
    catch (err) { if (attempt < 3 && (personaClash(err) || seatClash(err))) continue; throw err; }
  }
}
const emptySeats = (seats, players) => Array.from({ length: players }, (_, i) => i).filter(i => !seats.some(s => s.seat === i));

export async function battleCatalog(env, request, helpers) {
  const sealed = await helpers.loadSealed(env, request);
  const extras = await helpers.loadProducts(env, request);
  const products = [];
  for (const set of PLAYABLE_SETS) {
    const base = { setId: set.id, setName: set.name };
    if (set.wrappers.length && set.slots.length) {
      products.push({ ...base, key: `${set.id}:boosterPack`, productId: 'boosterPack', name: `${set.name} booster pack`,
        price: await helpers.packCost(env, request, set), image: set.wrappers[0].art, packs: 1, rounds: 1 });
    }
    for (const offer of [...sealedOffers(sealed[set.id], extras[set.id]), ...promoOffers(extras[set.id])]) {
      const groups = offerPackSets(offer, set);
      if (!groups || groups.some(g => !g.set.wrappers.length)) continue;
      if (Object.keys(offer.special || {}).some(key => !set.specialPacks?.[key])) continue;
      const packs = groups.reduce((n, g) => n + g.count, 0) + Object.values(offer.special || {}).reduce((n, c) => n + c, 0);
      const rounds = packs + (offer.promos.length ? 1 : 0);
      if (!rounds || packs > BATTLE_LIMITS.maxPacks || rounds > BATTLE_LIMITS.maxRounds) continue;
      const productImage = extras[set.id]?.find(p => p.id === offer.id)?.image;
      products.push({ ...base, key: `${set.id}:${offer.id}`, productId: offer.id, name: offer.name,
        price: offer.price, image: offer.image || productImage || set.wrappers[0]?.art || '', packs, rounds,
        _offer: offer });
    }
  }
  return products;
}
const publicProduct = ({ _offer, ...product }) => product;

function expandLineup(lineup, products) {
  if (!Array.isArray(lineup) || !lineup.length || lineup.length > 72) error('Choose at least one product (at most 72 entries).');
  const selected = []; const plan = []; let cost = 0; let packs = 0; let estimatedCards = 0;
  for (const row of lineup) {
    const product = products.find(p => p.key === row?.key);
    const quantity = Number(row?.quantity);
    if (!product || !Number.isInteger(quantity) || quantity < 1 || quantity > 72) error('Choose a valid product and quantity.');
    selected.push({ ...publicProduct(product), quantity });
    cost += Math.round(product.price * 100) * quantity;
    packs += product.packs * quantity;
    if (packs > BATTLE_LIMITS.maxPacks) error(`Choose at most ${BATTLE_LIMITS.maxPacks} packs per player.`);
    const set = PLAYABLE_SETS.find(s => s.id === product.setId);
    for (let q = 0; q < quantity; q++) {
      const addPack = (packSet, wrapper, specialKey = null) => plan.push({ index: plan.length, setId: packSet.id,
        setName: packSet.name, productKey: product.key, productName: product.name,
        wrapperId: wrapper.id, image: wrapper.art, kind: 'pack', ...(specialKey ? { specialKey } : {}) });
      if (product.productId === 'boosterPack') { addPack(set, set.wrappers[q % set.wrappers.length]); estimatedCards += set.packSize; }
      else {
        const offer = product._offer;
        for (const group of offerPackSets(offer, set)) {
          for (let i = 0; i < group.count; i++) { addPack(group.set, group.set.wrappers[i % group.set.wrappers.length]); estimatedCards += group.set.packSize; }
        }
        for (const [key, count] of Object.entries(offer.special || {})) {
          for (let i = 0; i < count; i++) { addPack(set, set.specialPacks[key].wrapper, key);
            estimatedCards += set.specialPacks[key].slots.reduce((sum, slot) => sum + (slot.count || 1), 0); }
        }
        if (offer.promos.length) plan.push({ index: plan.length, setId: set.id, setName: set.name,
          productKey: product.key, productName: `${product.name} promos`, wrapperId: 'promo', image: product.image,
          kind: 'promo', _offer: { promos: offer.promos, pick: offer.pick, groupOf: offer.groupOf } });
        estimatedCards += offer.pick || offer.promos.length;
      }
    }
    if (plan.length > BATTLE_LIMITS.maxRounds) error(`Choose at most ${BATTLE_LIMITS.maxRounds} opening rounds.`);
    if (estimatedCards > BATTLE_LIMITS.maxCardsPerPlayer) error(`Choose products containing at most ${BATTLE_LIMITS.maxCardsPerPlayer} cards per player.`);
  }
  if (cost <= 0 || cost > 100000000) error('That lineup costs too much.');
  return { lineup: selected, plan, entryCost: cost / 100 };
}

// Calling this from GET, actions and the existing scheduled Worker makes results
// durable even if everyone closes their tab; the unique settlement is the award gate.
// Maintenance never fails the request that runs it: one battle whose settlement
// D1 rejects must not take every battle endpoint down with it (2026-09-30, when
// it did). Each due battle settles in its own statement; a failure is logged,
// remembered per isolate for a minute so requests don't keep paying for it, and
// reported in the x-battle-maintenance header until it clears.
const SETTLE_RETRY_MS = 60000;
const settleFailures = new Map(); // battle id -> { at, message }
/** Tests only: forget remembered settlement failures. */
export const resetSettleFailures = () => settleFailures.clear();
const failureText = err => String(err?.message || err).replace(/\s+/g, ' ').slice(0, 300);
let stepFailure = null; // the last maintenance run's failure outside settling
function noteFailure(step, id, err, now) {
  console.error(`battle maintenance: ${step}${id ? ` ${id}` : ''}`, err);
  if (id) settleFailures.set(id, { at: now, message: failureText(err) });
  else stepFailure = `${step}: ${failureText(err)}`;
}
/**
 * A short summary of what maintenance could not do, for the response header.
 * Only an id's first 8 characters: a private battle's id is its invite link.
 */
export function maintenanceReport() {
  return [stepFailure, ...[...settleFailures].map(([id, f]) => `settling ${id.slice(0, 8)}: ${f.message}`)]
    .filter(Boolean).join(' | ').slice(0, 1000);
}
export async function maintainBattles(env, now = Date.now(), { settleLimit = 3 } = {}) {
  // Free-bot triggers first, so no delete below runs under the 0012 rules.
  // (Under 0012 a 'free' payer has no profile: nothing is paid or refunded.)
  await ensureBattleSchema(env);
  stepFailure = null;
  try {
    await env.DB.batch([
      env.DB.prepare(`UPDATE battles SET status = 'cancelled' WHERE id IN (
        SELECT id FROM battles WHERE status = 'lobby' AND expires_at <= ? LIMIT 100)`).bind(now),
      env.DB.prepare(`DELETE FROM battle_seats WHERE battle_id IN
        (SELECT id FROM battles WHERE status = 'cancelled')`),
    ]);
  } catch (err) {
    // Old databases remain usable while the additive migration is pending.
    if (/no such table: battles/.test(err?.message)) return { migrationPending: true };
    noteFailure('expiring lobbies', null, err, now);
  }
  let due = [];
  try {
    due = ((await env.DB.prepare(`SELECT id FROM battles WHERE status = 'running' AND ends_at <= ?
      ORDER BY ends_at LIMIT 20`).bind(now).all()).results || []).map(r => r.id);
  } catch (err) { noteFailure('listing due battles', null, err, now); return {}; }
  let settled = 0;
  for (const id of due) {
    if (settled >= settleLimit) break;
    const failed = settleFailures.get(id);
    if (failed && now - failed.at < SETTLE_RETRY_MS) continue;
    settled++;
    try { await settleBattle(env, id, now); settleFailures.delete(id); }
    catch (err) { noteFailure('settling', id, err, now); }
  }
  for (const id of settleFailures.keys()) if (!due.includes(id)) settleFailures.delete(id);
  return {};
}
async function settleBattle(env, id, now) {
  // INSERT OR IGNORE does not suppress trigger RAISE; the SELECT also prevents
  // replayed/stale requests from reaching the trigger after the first commit.
  await env.DB.prepare(`INSERT OR IGNORE INTO battle_settlements(battle_id, at)
    SELECT id, ? FROM battles WHERE id = ? AND status = 'running' AND ends_at <= ?`).bind(now, id, now).run();
}
// Bots seated before 0013 are stored as "Bot 2" / practice-bot. Views show them
// as the first personas no other bot at the table uses (the rows stay as they are).
function presentLegacyBots(seats) {
  const used = new Set(seats.filter(s => s.bot).map(s => s.handle));
  const spare = BOT_PERSONAS.filter(p => !used.has(`bot:${p.id}`));
  return seats.map(s => {
    if (!s.bot || s.handle.startsWith('bot:')) return s;
    const persona = spare.shift();
    return persona ? { ...s, name: persona.name, handle: `bot:${persona.id}`, color: persona.color } : s;
  });
}
async function viewBattle(env, id, now = Date.now(), summaryRow = null, summarySeats = null) {
  if (!summaryRow) {
    // A battle D1 will not settle still shows its rounds; maintenance retries it.
    const failed = settleFailures.get(id);
    if (!failed || now - failed.at >= SETTLE_RETRY_MS) {
      try { await settleBattle(env, id, now); settleFailures.delete(id); }
      catch (err) { if (/no such table/.test(err?.message)) throw err; noteFailure('settling', id, err, now); }
    }
  }
  const row = summaryRow || await getRow(env, id);
  if (!row) error('Battle not found.', 404);
  const settings = parse(row.settings); const plan = parse(row.plan);
  const seats = presentLegacyBots(summarySeats || await getSeats(env, id))
    .map(({ payerId, ...seat }) => ({ ...seat, team: settings.teams ? Math.floor(seat.seat / 2) : null }));
  const revealedRounds = row.status === 'finished' ? plan.length : row.status === 'running'
    // Round i is revealed at starts_at + i * round_ms and plays until the next one.
    ? (now < row.starts_at ? 0 : Math.min(plan.length, Math.floor((now - row.starts_at) / row.round_ms) + 1)) : 0;
  const outcomes = summaryRow ? [] : parse(row.outcomes) || [];
  const rounds = outcomes.slice(0, revealedRounds).map((round, i) => ({ ...round, scores: roundScores(outcomes, settings, i + 1) }));
  const result = row.status !== 'finished' ? null : summaryRow ? parse(row.result_summary) : parse(row.result);
  return { id: row.id, hostId: row.host_id, status: row.status, settings,
    entryCost: row.entry_cost, lineup: parse(row.lineup), plan: plan.map(({ _offer, specialKey, ...r }) => r), seats, rounds,
    revealedRounds, roundCount: plan.length, createdAt: row.created_at, expiresAt: row.expires_at,
    startsAt: row.starts_at, endsAt: row.ends_at, roundMs: row.round_ms,
    soloHuman: seats.filter(s => !s.bot).length === 1,
    winners: result?.winners ?? null, result: result ? { winners: result.winners, scores: result.scores,
      allocations: result.allocations.map(({ seat, cardCount, value }) => ({ seat, cardCount, value })) } : null };
}
async function startBattle(env, request, row, helpers) {
  const seats = await getSeats(env, row.id);
  const settings = parse(row.settings);
  if (seats.length !== settings.players) error('Fill every seat before starting.');
  const outcomes = [];
  for (const round of parse(row.plan)) {
    const set = PLAYABLE_SETS.find(s => s.id === round.setId);
    const catalog = await helpers.loadSetCards(env, request, set);
    const pulls = seats.map(seat => {
      const cards = round.kind === 'promo' ? drawPromos(round._offer).map(id => {
        const card = catalog.find(c => c.id === id);
        if (!card) error(`Missing promo card ${id}.`, 500);
        return { ...card, reverse: false };
      }) : ripPack(round.specialKey ? { ...set, slots: set.specialPacks[round.specialKey].slots } : set, catalog);
      const valued = cards.map(c => ({ id: c.id, name: c.name, number: c.number, rarity: c.rarity,
        image: c.image, reverse: Boolean(c.reverse), value: sellValue(c),
        ...(c.reverseKind ? { reverseKind: c.reverseKind } : {}),
        ...(c.printedRarity ? { printedRarity: c.printedRarity } : {}),
        ...(c.holo ? { holo: c.holo } : {}), ...(c.foilAs ? { foilAs: c.foilAs } : {}) }));
      return { seat: seat.seat, cards: valued, value: money(valued.reduce((sum, c) => sum + c.value, 0)) };
    });
    outcomes.push({ index: round.index, pulls });
  }
  const order = new Uint32Array(settings.players); crypto.getRandomValues(order);
  const result = battleResult(outcomes, settings, seats, seat => order[seat]);
  // Award receipts only need IDs and finish flags; do not duplicate scan metadata
  // in the persisted pot. D1 limits an entire row to 2 MB.
  const persistedResult = { ...result, allocations: result.allocations.map(a => ({ seat: a.seat, userId: a.userId,
    cardCount: a.cardCount, value: a.value, cards: a.cards.map(c => ({ id: c.id, reverse: c.reverse })) })) };
  const outcomeJSON = JSON.stringify(outcomes); const resultJSON = JSON.stringify(persistedResult);
  const payloadBytes = new TextEncoder().encode(outcomeJSON + resultJSON + row.plan + row.lineup + row.settings).length;
  if (payloadBytes > 1750000) error('This lineup has too many cards for one battle. Remove a product or reduce players.');
  const startsAt = Date.now() + BATTLE_TIMING.introMs;
  const roundMs = settings.fast ? BATTLE_TIMING.fastRoundMs : BATTLE_TIMING.roundMs;
  // Compare the exact seat snapshot as well as status: someone may leave/rejoin
  // during catalog loading. A failed CAS awards nothing and asks for a fresh start.
  const seatSnapshot = JSON.stringify(seats.map(s => [s.seat, s.userId, s.payerId, s.name, Number(s.bot)]));
  const updated = await env.DB.prepare(`UPDATE battles SET status = 'running', starts_at = ?, ends_at = ?, round_ms = ?, outcomes = ?, result = ?
    WHERE id = ? AND status = 'lobby' AND expires_at > ? AND (
      SELECT json_group_array(json_array(seat, user_id, payer_id, name, bot)) FROM
      (SELECT * FROM battle_seats WHERE battle_id = ? ORDER BY seat)) = ?`)
    .bind(startsAt, startsAt + outcomes.length * roundMs, roundMs, outcomeJSON, resultJSON, row.id, Date.now(), row.id, seatSnapshot).run();
  if (!updated.meta?.changes) {
    const current = await getRow(env, row.id);
    if (current.status === 'lobby') error('The seats changed. Start again.', 409);
  }
}

const ACTIONS = 'join|bot|unbot|start|leave|cancel|skip';
const HOST_ACTIONS = ['bot', 'unbot', 'start', 'cancel'];

export async function handleBattles(path, method, request, env, helpers) {
  if (!path.startsWith('/api/battles')) return null;
  const response = await battleRoute(path, method, request, env, helpers);
  const report = maintenanceReport();
  if (report && response?.headers) {
    const out = new Response(response.body, response);
    out.headers.set('x-battle-maintenance', report);
    return out;
  }
  return response;
}
async function battleRoute(path, method, request, env, helpers) {
  try {
    if (path === '/api/battles/catalog' && method === 'GET') {
      return helpers.json({ products: (await battleCatalog(env, request, helpers)).map(publicProduct), limits: BATTLE_LIMITS, serverNow: Date.now() });
    }
    // Seats carry avatars: users.avatar_style comes from the social runtime schema.
    if (helpers.ensureSocialSchema) await helpers.ensureSocialSchema(env);
    await maintainBattles(env);
    if (path === '/api/battles' && method === 'GET') {
      // Finished rows carry only the result's summary; the allocation card
      // lists can run to megabytes and belong to the detail view.
      const rows = (await env.DB.prepare(`SELECT id,host_id,status,settings,lineup,plan,entry_cost,created_at,expires_at,starts_at,ends_at,round_ms,
        CASE WHEN status = 'finished' THEN json_object('winners', json_extract(result, '$.winners'), 'scores', json_extract(result, '$.scores'),
          'allocations', (SELECT json_group_array(json_object('seat', json_extract(a.value, '$.seat'), 'cardCount', json_extract(a.value, '$.cardCount'),
            'value', json_extract(a.value, '$.value'))) FROM json_each(battles.result, '$.allocations') a)) END AS result_summary
        FROM battles WHERE status IN ('lobby','running','finished')
        AND json_extract(settings, '$.private') = 0 ORDER BY created_at DESC LIMIT 40`).all()).results || [];
      const seatsByBattle = new Map(rows.map(row => [row.id, []]));
      if (rows.length) {
        const seats = (await env.DB.prepare(`${SEAT_SELECT} WHERE s.battle_id IN (${rows.map(() => '?').join(',')})
          ORDER BY s.battle_id, s.seat`).bind(...rows.map(row => row.id)).all()).results || [];
        for (const seat of seats) seatsByBattle.get(seat.battle_id).push(seatRecord(seat));
      }
      return helpers.json({ battles: await Promise.all(rows.map(r => viewBattle(env, r.id, Date.now(), r, seatsByBattle.get(r.id)))), serverNow: Date.now() });
    }
    const match = path.match(new RegExp(`^/api/battles/([a-zA-Z0-9-]{1,80})(?:/(${ACTIONS}))?$`));
    // serverNow is the instant the view was computed at, so a client never sees
    // a round boundary fall between revealedRounds and its clock.
    if (match && !match[2] && method === 'GET') { const at = Date.now(); return helpers.json({ battle: await viewBattle(env, match[1], at), serverNow: at }); }
    if (method !== 'POST' || (path !== '/api/battles' && !match?.[2])) return helpers.json({ error: 'Not found.' }, 404);
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) error('Use this site to manage battles.', 403);
    if (!request.headers.get('content-type')?.includes('application/json')) error('Expected JSON.');
    const auth = await helpers.requireUser(request, env);
    if (auth.response) return auth.response;
    const user = auth.user; const body = await helpers.readJson(request);
    if (!body || typeof body !== 'object') error('Expected JSON.');
    let id = match?.[1];
    if (path === '/api/battles') id = await createBattle(env, request, helpers, user, body);
    else {
      const row = await getRow(env, id); if (!row) error('Battle not found.', 404);
      const action = match[2]; const host = row.host_id === user.id;
      if (HOST_ACTIONS.includes(action) && !host) error('Only the host can do that.', 403);
      const settings = parse(row.settings);
      const seats = await getSeats(env, id); const own = seats.find(s => s.userId === user.id);
      if (action === 'join') {
        if (row.status !== 'lobby') error('Battle is no longer accepting players.', 409);
        if (!own) { /* a retry finds its own seat: the user already paid */
          const seat = body.seat === undefined ? emptySeats(seats, settings.players)[0] : Number(body.seat);
          if (!Number.isInteger(seat) || seat < 0 || seat >= settings.players) error('Choose an empty seat.');
          if (seats.some(s => s.seat === seat)) error('That seat was taken.', 409);
          await seatInsert(env, id, seat, user, user.id, false).run();
        }
      } else if (action === 'bot') {
        if (row.status !== 'lobby') error('Battle is no longer accepting players.', 409);
        if (body.fill === true) await seatBots(env, id, current => emptySeats(current, settings.players));
        else {
          if (body.seat === undefined) error('Choose an explicit seat for your bot.');
          const seat = Number(body.seat);
          if (!Number.isInteger(seat) || seat < 0 || seat >= settings.players) error('Choose an empty seat.');
          await seatBots(env, id, current => {
            const occupied = current.find(s => s.seat === seat);
            if (occupied && !occupied.bot) error('That seat was taken.', 409);
            return occupied ? [] : [seat]; // a bot already there: idempotent retry
          });
        }
      } else if (action === 'unbot') {
        const seat = Number(body.seat);
        if (!Number.isInteger(seat) || seat < 0 || seat >= settings.players) error('Choose a bot seat.');
        if (row.status !== 'lobby') error('Bots can only be removed before the battle starts.', 409);
        const occupied = seats.find(s => s.seat === seat);
        if (occupied && !occupied.bot) error('That seat has a player, not a bot.', 409);
        // Free bots refund nothing; a bot paid for under the old rules refunds its payer once.
        if (occupied) await env.DB.prepare(`DELETE FROM battle_seats WHERE battle_id = ? AND seat = ? AND bot = 1
          AND EXISTS(SELECT 1 FROM battles WHERE id = ? AND status = 'lobby')`).bind(id, seat, id).run();
      } else if (action === 'start') {
        if (row.status === 'cancelled') error('That battle was cancelled.', 409);
        if (row.status === 'lobby') await startBattle(env, request, row, helpers);
      } else if (action === 'skip') {
        if (!own) error('Only a seated player can skip.', 403);
        if (seats.filter(s => !s.bot).length !== 1) error('Skipping is only for battles against bots.', 403);
        if (row.status === 'lobby') error('Start the battle first.', 409);
        if (row.status === 'cancelled') error('That battle was cancelled.', 409);
        if (row.status === 'running') await skipBattle(env, row, user);
      } else if (action === 'cancel' || (action === 'leave' && host)) {
        if (row.status === 'running' || row.status === 'finished') error('A started battle cannot be cancelled.', 409);
        await env.DB.batch([
          env.DB.prepare("UPDATE battles SET status = 'cancelled' WHERE id = ? AND status = 'lobby'").bind(id),
          env.DB.prepare("DELETE FROM battle_seats WHERE battle_id = ? AND EXISTS(SELECT 1 FROM battles WHERE id = ? AND status = 'cancelled')").bind(id, id),
        ]);
      } else if (action === 'leave') {
        if (row.status === 'running') error('A running battle cannot be left.', 409);
        if (row.status === 'finished') error('That battle has already finished.', 409);
        await env.DB.prepare("DELETE FROM battle_seats WHERE battle_id = ? AND user_id = ? AND EXISTS(SELECT 1 FROM battles WHERE id = ? AND status IN ('lobby','cancelled'))").bind(id, user.id, id).run();
      }
    }
    const at = Date.now();
    return helpers.json({ battle: await viewBattle(env, id, at), save: await helpers.loadSave(env, user.id), serverNow: at });
  } catch (err) {
    if (/no such table: (battles|battle_seats)/.test(err.message)) return helpers.json({ error: 'Battles are waiting for the database update.' }, 503);
    if (/Not enough coins|no longer accepting|cannot be left|Fill every|active battles/.test(err.message)) return helpers.json({ error: err.message }, 409);
    if (personaClash(err)) return helpers.json({ error: 'Too many bots were called at once. Try again.' }, 409);
    if (/UNIQUE constraint failed: battle_seats/.test(err.message)) return helpers.json({ error: 'That seat was taken. Refresh the lobby.' }, 409);
    if (err.status) return helpers.json({ error: err.message }, err.status);
    if (/Choose|Unknown battle|Unknown scoring|Teams need/.test(err.message)) return helpers.json({ error: err.message }, 400);
    throw err;
  }
}

/**
 * POST /api/battles. Idempotent on (host, requestId). `quick: true` also seats
 * a free bot in every other seat in the same transaction and starts at once; a
 * retry of a quick create that stopped short (still a lobby) finishes the job.
 */
async function createBattle(env, request, helpers, user, body) {
  const requestId = String(body.requestId || '');
  if (!/^[a-zA-Z0-9-]{8,80}$/.test(requestId)) error('Provide a unique requestId.');
  if (body.quick !== undefined && typeof body.quick !== 'boolean') error('Choose true or false for quick.');
  const quick = body.quick === true;
  const findExisting = () => env.DB.prepare('SELECT id FROM battles WHERE host_id = ? AND request_id = ?').bind(user.id, requestId).first();
  let id = (await findExisting())?.id;
  if (!id) {
    const settings = battleSettings(body.settings); const products = await battleCatalog(env, request, helpers);
    const build = expandLineup(body.lineup, products); id = crypto.randomUUID(); const now = Date.now();
    if (quick) await requireFreeBots(env);
    const bots = quick ? botInserts(env, id, [], emptySeats([{ seat: 0 }], settings.players)) : [];
    try {
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO battles(id, host_id, request_id, settings, lineup, plan, entry_cost, created_at, expires_at)
          VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, user.id, requestId, JSON.stringify(settings), JSON.stringify(build.lineup), JSON.stringify(build.plan), build.entryCost, now, now + 24 * 3600000),
        seatInsert(env, id, 0, user, user.id, false),
        ...bots,
      ]);
    } catch (err) {
      const raced = await findExisting();
      if (!raced) throw err;
      id = raced.id;
    }
  }
  if (!quick) return id;
  let row = await getRow(env, id);
  if (row.status !== 'lobby') return id;
  const players = parse(row.settings).players;
  await seatBots(env, id, current => emptySeats(current, players));
  try { await startBattle(env, request, row, helpers); }
  catch (err) {
    // A quick battle either starts or refunds: the player never saw this
    // lobby, so don't hold their entry in it for 24 hours. The cancel only
    // lands while it is still a lobby, so a concurrent retry that started it wins.
    {
      await env.DB.batch([
        env.DB.prepare("UPDATE battles SET status = 'cancelled' WHERE id = ? AND status = 'lobby'").bind(id),
        env.DB.prepare("DELETE FROM battle_seats WHERE battle_id = ? AND EXISTS(SELECT 1 FROM battles WHERE id = ? AND status = 'cancelled')").bind(id, id),
      ]);
    }
    row = await getRow(env, id);
    if (row.status !== 'running') throw err; // a concurrent retry may have started it
  }
  return id;
}

/**
 * Solo player vs bots: reveal every round now and settle in this request.
 * Outcomes were fixed at start, so skipping changes timing only. starts_at
 * moves back so startsAt + roundCount * roundMs = endsAt still holds. The
 * settlement row is the same exactly-once award gate as a natural finish.
 */
async function skipBattle(env, row, user) {
  // The view that answers this action settles the battle (non-fatally, see
  // maintainBattles), so a settlement D1 rejects cannot fail the skip itself.
  const now = Date.now(); const rounds = parse(row.plan).length;
  await env.DB.prepare(`UPDATE battles SET starts_at = ?, ends_at = ? WHERE id = ? AND status = 'running' AND ends_at > ?
    AND (SELECT COUNT(*) FROM battle_seats WHERE battle_id = ? AND bot = 0) = 1
    AND EXISTS(SELECT 1 FROM battle_seats WHERE battle_id = ? AND user_id = ?)`)
    .bind(now - rounds * row.round_ms, now, row.id, now, row.id, row.id, user.id).run();
}

function seatInsert(env, id, seat, user, payer, bot) {
  return env.DB.prepare(`INSERT INTO battle_seats(battle_id, seat, user_id, payer_id, name, handle, color, bot)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, seat, user.id, payer, user.name, user.handle, user.color, Number(bot));
}
