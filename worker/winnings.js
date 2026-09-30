import { money, sellValue } from '../js/catalog.js';
import { SALES_DDL } from './casino-ddl.js';

/* "Sell all winnings" (migration 0016): one shared endpoint for every casino
   game. A winner can turn the cards they won into coins at the same market rate
   selling always uses, in one tap. The Worker decides what counts as winnings
   (never a card the player already owned before the game), sells at most what
   they still hold, and the triggers of the migration take the cards and credit
   the coins in one transaction. A big pot is sold in bounded parts so no single
   request has to move thousands of rows. */

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

const add = (map, id, qty, rev = 0) => {
  const row = map.get(id) || { qty: 0, rev: 0 };
  row.qty += qty; row.rev += rev; map.set(id, row);
};

/** The cards `userId` won in a finished game, as Map(cardId -> { qty, rev }); null when they did not win it. */
async function wonCards(env, source, gameId, userId) {
  const won = new Map();
  if (source === 'coinflip') {
    const row = await env.DB.prepare('SELECT * FROM coinflips WHERE id = ?').bind(gameId).first();
    if (!row) error('Game not found.', 404);
    if (row.status !== 'done') error('That flip has not been decided.', 409);
    const hostWon = row.winner === 'host';
    if (!((hostWon && row.host_id === userId) || (!hostWon && row.guest_id === userId))) error('You did not win that flip.', 403);
    // The winnings are the other side's pile; your own stake was already yours.
    for (const s of parse(hostWon ? row.guest_stake : row.host_stake)) add(won, s.id, s.qty, s.rev);
    return won;
  }
  if (source === 'battle') {
    const row = await env.DB.prepare('SELECT status, result FROM battles WHERE id = ?').bind(gameId).first();
    if (!row) error('Game not found.', 404);
    if (row.status !== 'finished') error('That battle has not finished.', 409);
    const mine = (parse(row.result)?.allocations || []).filter(a => a.userId === userId);
    if (!mine.length) error('You did not win cards in that battle.', 403);
    for (const a of mine) for (const c of a.cards || []) add(won, c.id, 1, c.reverse ? 1 : 0);
    if (!won.size) error('You did not win cards in that battle.', 403);
    return won;
  }
  if (source === 'jackpot') {
    const row = await env.DB.prepare('SELECT status, winner_seat FROM jackpots WHERE id = ?').bind(gameId).first();
    if (!row) error('Game not found.', 404);
    if (row.status !== 'done') error('That jackpot has not been drawn.', 409);
    const entries = (await env.DB.prepare('SELECT seat, user_id, stake FROM jackpot_entries WHERE jackpot_id = ?').bind(gameId).all()).results || [];
    if (!entries.some(e => e.seat === row.winner_seat && e.user_id === userId)) error('You did not win that jackpot.', 403);
    // The winnings are everyone else's piles; your own entry was already yours.
    for (const e of entries) if (e.seat !== row.winner_seat) for (const s of parse(e.stake)) add(won, s.id, s.qty, s.rev);
    return won;
  }
  error('Unknown game.', 404);
}

async function priorSales(env, source, gameId, userId) {
  return (await env.DB.prepare('SELECT part, items, cents FROM casino_sales WHERE source = ? AND game_id = ? AND user_id = ? ORDER BY part')
    .bind(source, gameId, userId).all()).results || [];
}

/**
 * What a player could sell right now: winnings minus earlier parts, limited to
 * what they still hold. Returns { items (this part, valued), cards, cents, more, soldCents, parts }.
 */
async function plan(env, request, helpers, source, gameId, userId) {
  const won = await wonCards(env, source, gameId, userId);
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
  return { items, cards, cents, more, soldCents, parts: before.length, collection };
}

export async function winningsInfo(env, request, helpers, user, source, gameId) {
  const p = await plan(env, request, helpers, source, gameId, user.id);
  return { eligible: true, cards: p.cards, coins: money(p.cents / 100), soldCoins: money(p.soldCents / 100), sold: p.soldCents > 0 && !p.cards, more: p.more };
}

export async function sellWinnings(env, request, helpers, user, source, gameId, binderStatement) {
  if (!SOURCES.includes(source) || !/^[a-zA-Z0-9-]{1,80}$/.test(String(gameId))) error('Unknown game.', 404);
  const p = await plan(env, request, helpers, source, gameId, user.id);
  if (!p.items.length) error(p.soldCents > 0 ? 'Those winnings are already sold.' : 'You no longer hold any of those cards.', 409);
  const stmts = [
    env.DB.prepare('INSERT INTO casino_sales(source, game_id, user_id, part, items, cents, at) VALUES(?, ?, ?, ?, ?, ?, ?)')
      .bind(source, gameId, user.id, p.parts, JSON.stringify(p.items), p.cents, Date.now()),
    await binderStatement(env, helpers, user.id, p.collection, p.items, { sql: '', args: [] }),
  ];
  try { await env.DB.batch(stmts); }
  catch (err) {
    if (/UNIQUE constraint failed: casino_sales/.test(err.message)) error('That was already sold. Refresh and look again.', 409);
    if (/no longer have/.test(err.message)) error('Your collection changed. Try again.', 409);
    throw err;
  }
  await helpers.recordQuestEvent?.(env, user.id, 'sold', p.items.reduce((n, i) => n + i.qty, 0));
  const after = await plan(env, request, helpers, source, gameId, user.id).catch(() => null);
  return { coins: money(p.cents / 100), cards: p.items.reduce((n, i) => n + i.qty, 0), remaining: after?.cards || 0, more: Boolean(after?.more) };
}
