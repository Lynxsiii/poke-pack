import { money, sellValue } from '../js/catalog.js';
import { gradedValue } from '../js/grading-rules.js';
import { SALES_DDL } from './casino-ddl.js';
import { setForCard } from './grading.js';

/* "Sell all winnings" (migration 0017): one shared endpoint for every casino
   game. A winner can turn the cards they won into coins at the same market rate
   selling always uses, in one tap. The Worker decides what counts as winnings
   (never a card the player already owned before the game), sells at most what
   they still hold, and the triggers of the migration take the cards and credit
   the coins in one transaction. A big pot is sold in bounded parts so no single
   request has to move thousands of rows.

   Won graded slabs sell here too, at their CURRENT graded value (what
   POST /api/grading/sell would pay), at most SALE_PART_SLABS per request. A
   slab is one row of graded_cards, so it sells exactly once by construction:
   the UPDATE only lands while it is still the winner's, unlocked and
   'slabbed', and the coin credit is chained on changes(). Its row records the
   sale (sell_request_id 'casino:<source>:<id>', sold_cents). The winner keeps
   a slab by passing slabs: false. A bot's slabs a human won were minted into
   graded_cards by the settle trigger (migration 0026) and sell like any other. */

const error = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const parse = value => value ? JSON.parse(value) : null;
const SOURCES = ['coinflip', 'jackpot', 'battle'];
const SALES_OBJECTS = SALES_DDL.map(sql => sql.match(/CREATE (?:UNIQUE )?(?:TABLE|INDEX|TRIGGER) IF NOT EXISTS (\w+)/)[1]);
let salesSchemaReady = false;
/** Tests only: forget the per-isolate cache so another database is checked. */
export const resetSalesSchemaCache = () => { salesSchemaReady = false; };
/** Create the sales table and triggers once per isolate (one atomic D1 batch, all IF NOT EXISTS). */
export async function ensureSalesSchema(env) {
  if (salesSchemaReady) return;
  const rows = (await env.DB.prepare(`SELECT name FROM sqlite_master WHERE name IN (${SALES_OBJECTS.map(() => '?').join(',')})`)
    .bind(...SALES_OBJECTS).all()).results || [];
  if (rows.length < SALES_OBJECTS.length) await env.DB.batch(SALES_DDL.map(sql => env.DB.prepare(sql)));
  salesSchemaReady = true;
}
export const SALE_PART_CARDS = 150;
export const SALE_PART_SLABS = 25;

const add = (map, id, qty, rev = 0) => {
  const row = map.get(id) || { qty: 0, rev: 0 };
  row.qty += qty; row.rev += rev; map.set(id, row);
};

/**
 * What `userId` won in a finished game: { cards: Map(cardId -> { qty, rev }), slabIds }. Throws when they did not win it.
 * A bot's slab has no id (it was generated): when the winner is a human the settle trigger minted it as a graded_cards row
 * with request_id 'casino:<source>:<gameId>:<n>', and those rows are found by that prefix.
 */
async function wonIn(env, source, gameId, userId) {
  const cards = new Map(); const slabIds = []; let generated = false;
  const take = (stake, slabs) => {
    for (const s of stake) add(cards, s.id, s.qty, s.rev);
    for (const s of slabs || []) { if (s.id == null) generated = true; else slabIds.push(s.id); }
  };
  const minted = async () => {
    if (!generated) return;
    const rows = (await env.DB.prepare('SELECT id FROM graded_cards WHERE user_id = ? AND request_id LIKE ?')
      .bind(userId, `casino:${source}:${gameId}:%`).all()).results || [];
    for (const row of rows) slabIds.push(row.id);
  };
  if (source === 'coinflip') {
    const row = await env.DB.prepare('SELECT * FROM coinflips WHERE id = ?').bind(gameId).first();
    if (!row) error('Game not found.', 404);
    if (row.status !== 'done') error('That flip has not been decided.', 409);
    const hostWon = row.winner === 'host';
    if (!((hostWon && row.host_id === userId) || (!hostWon && row.guest_id === userId))) error('You did not win that flip.', 403);
    // The winnings are the other side's pile; your own stake was already yours.
    take(parse(hostWon ? row.guest_stake : row.host_stake), parse(hostWon ? row.guest_slabs : row.host_slabs));
    await minted();
    return { cards, slabIds };
  }
  if (source === 'battle') {
    const row = await env.DB.prepare('SELECT status, result FROM battles WHERE id = ?').bind(gameId).first();
    if (!row) error('Game not found.', 404);
    if (row.status !== 'finished') error('That battle has not finished.', 409);
    const mine = (parse(row.result)?.allocations || []).filter(a => a.userId === userId);
    if (!mine.length) error('You did not win cards in that battle.', 403);
    for (const a of mine) for (const c of a.cards || []) add(cards, c.id, 1, c.reverse ? 1 : 0);
    if (!cards.size) error('You did not win cards in that battle.', 403);
    return { cards, slabIds }; // a battle has no player stakes, so no slabs
  }
  if (source === 'jackpot') {
    const row = await env.DB.prepare('SELECT status, winner_seat FROM jackpots WHERE id = ?').bind(gameId).first();
    if (!row) error('Game not found.', 404);
    if (row.status !== 'done') error('That jackpot has not been drawn.', 409);
    const entries = (await env.DB.prepare('SELECT seat, user_id, stake, slabs FROM jackpot_entries WHERE jackpot_id = ?').bind(gameId).all()).results || [];
    if (!entries.some(e => e.seat === row.winner_seat && e.user_id === userId)) error('You did not win that jackpot.', 403);
    // The winnings are everyone else's piles; your own entry was already yours.
    for (const e of entries) if (e.seat !== row.winner_seat) take(parse(e.stake), parse(e.slabs));
    await minted();
    return { cards, slabIds };
  }
  error('Unknown game.', 404);
}

async function priorSales(env, source, gameId, userId) {
  return (await env.DB.prepare('SELECT part, items, cents FROM casino_sales WHERE source = ? AND game_id = ? AND user_id = ? ORDER BY part')
    .bind(source, gameId, userId).all()).results || [];
}

const saleMarker = (source, gameId) => `casino:${source}:${gameId}`;

/** The won slabs this player still holds (theirs, unlocked, slabbed), priced now: [{ id, cardId, v }], at most one part; `more` when cut. */
async function sellableSlabs(env, request, helpers, userId, ids) {
  const out = []; let more = false;
  if (!ids.length) return { slabs: out, more };
  const rows = (await env.DB.prepare(`SELECT id, card_id, grade FROM graded_cards WHERE user_id = ? AND status = 'slabbed' AND locked IS NULL
    AND id IN (${ids.map(() => '?').join(',')}) ORDER BY id`).bind(userId, ...ids).all()).results || [];
  for (const row of rows) {
    if (out.length >= SALE_PART_SLABS) { more = true; break; }
    const card = await helpers.findCatalogCard(env, request, row.card_id);
    if (!card) continue;
    out.push({ id: row.id, cardId: row.card_id, v: Math.round(gradedValue(card, row.grade, setForCard(row.card_id)) * 100) });
  }
  return { slabs: out, more };
}

/**
 * What a player could sell right now: winnings minus earlier parts, limited to
 * what they still hold. Returns { items (this part, valued), cards, cents, more, soldCents, parts,
 * slabs (this part: [{ id, cardId, v }]), slabCents, moreSlabs, soldSlabs, soldSlabCents }.
 */
async function plan(env, request, helpers, source, gameId, userId) {
  const { cards: won, slabIds } = await wonIn(env, source, gameId, userId);
  const before = await priorSales(env, source, gameId, userId);
  let soldCents = 0;
  for (const sale of before) {
    soldCents += sale.cents;
    for (const s of parse(sale.items)) { const row = won.get(s.id); if (row) { row.qty -= s.qty; row.rev -= s.rev; } }
  }
  const { collection, reverses } = await helpers.inventoryMap(env, userId);
  const items = []; let cards = 0; let cents = 0; let more = false;
  for (const id of [...won.keys()].sort()) {
    const row = won.get(id);
    const qty = Math.min(row.qty, collection[id] || 0);
    if (qty < 1) continue;
    if (items.length >= SALE_PART_CARDS) { more = true; break; }
    const card = await helpers.findCatalogCard(env, request, id);
    if (!card) continue;
    const v = Math.round(sellValue(card) * 100);
    // Keep reverse holos: sell the plain copies first.
    const rev = Math.max(0, qty - ((collection[id] || 0) - (reverses[id] || 0)));
    items.push({ id, qty, rev, v });
    cards += qty; cents += qty * v;
  }
  const held = await sellableSlabs(env, request, helpers, userId, slabIds);
  const sold = slabIds.length
    ? await env.DB.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(sold_cents), 0) AS cents FROM graded_cards WHERE user_id = ? AND status = 'sold' AND sell_request_id = ?
        AND id IN (${slabIds.map(() => '?').join(',')})`).bind(userId, saleMarker(source, gameId), ...slabIds).first()
    : null;
  return { items, cards, cents, more, soldCents, parts: before.length, collection,
    slabs: held.slabs, slabCents: held.slabs.reduce((n, s) => n + s.v, 0), moreSlabs: held.more, soldSlabs: sold?.n || 0, soldSlabCents: sold?.cents || 0 };
}

export async function winningsInfo(env, request, helpers, user, source, gameId) {
  const p = await plan(env, request, helpers, source, gameId, user.id);
  const soldCents = p.soldCents + p.soldSlabCents;
  return { eligible: true, cards: p.cards, slabs: p.slabs.length, coins: money((p.cents + p.slabCents) / 100), soldCoins: money(soldCents / 100),
    sold: (soldCents > 0 || p.soldSlabs > 0) && !p.cards && !p.slabs.length, more: p.more || p.moreSlabs };
}

/**
 * Sell what `user` won in one game, in one atomic batch: the cards through a casino_sales row (its triggers take
 * them and pay), then each won slab they still hold, one UPDATE plus one coin credit chained on changes().
 * `withSlabs` false leaves the slabs with the player. Returns { coins, cards, slabs, remaining, more }.
 */
export async function sellWinnings(env, request, helpers, user, source, gameId, binderStatement, withSlabs = true) {
  if (!SOURCES.includes(source) || !/^[a-zA-Z0-9-]{1,80}$/.test(String(gameId))) error('Unknown game.', 404);
  const p = await plan(env, request, helpers, source, gameId, user.id);
  const slabs = withSlabs ? p.slabs : [];
  if (!p.items.length && !slabs.length) {
    if (!withSlabs && p.slabs.length) error('Only slabs are left to sell.', 409);
    error(p.soldCents > 0 || p.soldSlabs > 0 ? 'Those winnings are already sold.' : 'You no longer hold any of those cards.', 409);
  }
  const at = Date.now(); const marker = saleMarker(source, gameId);
  const stmts = [];
  if (p.items.length) {
    stmts.push(env.DB.prepare('INSERT INTO casino_sales(source, game_id, user_id, part, items, cents, at) VALUES(?, ?, ?, ?, ?, ?, ?)')
      .bind(source, gameId, user.id, p.parts, JSON.stringify(p.items), p.cents, at));
  }
  const slabAt = stmts.length;
  for (const slab of slabs) {
    stmts.push(env.DB.prepare(`UPDATE graded_cards SET status = 'sold', closed_at = ?, guard = NULL, shown = 0, sell_request_id = ?, sold_cents = ?
      WHERE id = ? AND user_id = ? AND status = 'slabbed' AND locked IS NULL`).bind(at, marker, slab.v, slab.id, user.id));
    stmts.push(env.DB.prepare('UPDATE profiles SET coins = ROUND(coins + ? / 100.0, 2) WHERE user_id = ? AND changes() = 1').bind(slab.v, user.id));
  }
  // The pockets only drop when every slab really left (a slab that slipped away in a race keeps its pocket).
  const guard = slabs.length
    ? { sql: `AND NOT EXISTS(SELECT 1 FROM graded_cards WHERE status = 'slabbed' AND id IN (${slabs.map(() => '?').join(',')}))`, args: slabs.map(s => s.id) }
    : { sql: '', args: [] };
  stmts.push(await binderStatement(env, helpers, user.id, p.collection, p.items, guard, slabs));
  let results;
  try { results = await env.DB.batch(stmts); }
  catch (err) {
    if (/UNIQUE constraint failed: casino_sales/.test(err.message)) error('That was already sold. Refresh and look again.', 409);
    if (/no longer have/.test(err.message)) error('Your collection changed. Try again.', 409);
    throw err;
  }
  // Only a slab whose UPDATE landed was sold (and paid); one that was cracked or staked in between was not.
  const soldSlabs = slabs.filter((_, i) => results[slabAt + 2 * i]?.meta?.changes);
  const cards = p.items.reduce((n, i) => n + i.qty, 0);
  if (!cards && !soldSlabs.length) error('That was already sold. Refresh and look again.', 409);
  await helpers.recordQuestEvent?.(env, user.id, 'sold', cards + soldSlabs.length);
  const after = await plan(env, request, helpers, source, gameId, user.id).catch(() => null);
  const cents = (cards ? p.cents : 0) + soldSlabs.reduce((n, s) => n + s.v, 0);
  return { coins: money(cents / 100), cards, slabs: soldSlabs.length, remaining: (after?.cards || 0) + (withSlabs ? after?.slabs.length || 0 : 0),
    more: Boolean(after?.more) || (withSlabs && Boolean(after?.moreSlabs)) };
}
