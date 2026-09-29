import { PLAYABLE_SETS, sealedOffers, promoOffers, offerPackSets, money, sellValue } from '../js/catalog.js';
import { ripPack, drawPromos } from '../js/engine.js';
import { BATTLE_LIMITS, battleSettings, battleResult, roundScores } from '../js/battle-rules.js';

const error = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const parse = value => value ? JSON.parse(value) : null;
const getRow = (env, id) => env.DB.prepare('SELECT * FROM battles WHERE id = ?').bind(id).first();
const seatRecord = s => ({ seat: s.seat, userId: s.user_id, payerId: s.payer_id, name: s.name, handle: s.handle, color: s.color, bot: Boolean(s.bot) });
const getSeats = async (env, id) => ((await env.DB.prepare('SELECT * FROM battle_seats WHERE battle_id = ? ORDER BY seat').bind(id).all()).results || []).map(seatRecord);

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
export async function maintainBattles(env, now = Date.now()) {
  try {
    // Three statements regardless of backlog size. The batch and per-row
    // triggers preserve the same exactly-once refund/award gates as actions.
    // Bound settlement work to ten games; GET detail also settles its own game.
    await env.DB.batch([
      env.DB.prepare(`UPDATE battles SET status = 'cancelled' WHERE id IN (
        SELECT id FROM battles WHERE status = 'lobby' AND expires_at <= ? LIMIT 100)`).bind(now),
      env.DB.prepare(`DELETE FROM battle_seats WHERE battle_id IN
        (SELECT id FROM battles WHERE status = 'cancelled')`),
      env.DB.prepare(`INSERT OR IGNORE INTO battle_settlements(battle_id, at)
        SELECT id, ? FROM battles WHERE status = 'running' AND ends_at <= ? ORDER BY ends_at LIMIT 10`).bind(now, now),
    ]);
  }
  catch (err) {
    // Old databases remain usable while the additive migration is pending.
    if (/no such table: battles/.test(err.message)) return { migrationPending: true };
    throw err;
  }
}
async function settleBattle(env, id, now) {
  // INSERT OR IGNORE does not suppress trigger RAISE; the SELECT also prevents
  // replayed/stale requests from reaching the trigger after the first commit.
  await env.DB.prepare(`INSERT OR IGNORE INTO battle_settlements(battle_id, at)
    SELECT id, ? FROM battles WHERE id = ? AND status = 'running' AND ends_at <= ?`).bind(now, id, now).run();
}
async function viewBattle(env, id, now = Date.now(), summaryRow = null, summarySeats = null) {
  if (!summaryRow) await settleBattle(env, id, now);
  const row = summaryRow || await getRow(env, id);
  if (!row) error('Battle not found.', 404);
  const settings = parse(row.settings); const plan = parse(row.plan);
  const seats = (summarySeats || await getSeats(env, id)).map(({ payerId, ...seat }) => ({ ...seat, team: settings.teams ? Math.floor(seat.seat / 2) : null }));
  const revealedRounds = row.status === 'finished' ? plan.length : row.status === 'running'
    ? Math.min(plan.length, Math.max(0, Math.floor((now - row.starts_at) / row.round_ms))) : 0;
  const outcomes = summaryRow ? [] : parse(row.outcomes) || [];
  const rounds = outcomes.slice(0, revealedRounds).map((round, i) => ({ ...round, scores: roundScores(outcomes, settings, i + 1) }));
  const result = !summaryRow && row.status === 'finished' ? parse(row.result) : null;
  return { id: row.id, hostId: row.host_id, status: row.status, settings,
    entryCost: row.entry_cost, lineup: parse(row.lineup), plan: plan.map(({ _offer, specialKey, ...r }) => r), seats, rounds,
    revealedRounds, roundCount: plan.length, createdAt: row.created_at, expiresAt: row.expires_at,
    startsAt: row.starts_at, endsAt: row.ends_at, roundMs: row.round_ms,
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
  const result = battleResult(outcomes, settings, seats);
  // Award receipts only need IDs and finish flags; do not duplicate scan metadata
  // in the persisted pot. D1 limits an entire row to 2 MB.
  const persistedResult = { ...result, allocations: result.allocations.map(a => ({ seat: a.seat, userId: a.userId,
    cardCount: a.cardCount, value: a.value, cards: a.cards.map(c => ({ id: c.id, reverse: c.reverse })) })) };
  const outcomeJSON = JSON.stringify(outcomes); const resultJSON = JSON.stringify(persistedResult);
  const payloadBytes = new TextEncoder().encode(outcomeJSON + resultJSON + row.plan + row.lineup + row.settings).length;
  if (payloadBytes > 1750000) error('This lineup has too many cards for one battle. Remove a product or reduce players.');
  const startsAt = Date.now() + 3000; const roundMs = settings.fast ? 1600 : 4600;
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

export async function handleBattles(path, method, request, env, helpers) {
  if (!path.startsWith('/api/battles')) return null;
  try {
    if (path === '/api/battles/catalog' && method === 'GET') {
      return helpers.json({ products: (await battleCatalog(env, request, helpers)).map(publicProduct), limits: BATTLE_LIMITS, serverNow: Date.now() });
    }
    await maintainBattles(env);
    if (path === '/api/battles' && method === 'GET') {
      const rows = (await env.DB.prepare(`SELECT id,host_id,status,settings,lineup,plan,entry_cost,created_at,expires_at,starts_at,ends_at,round_ms
        FROM battles WHERE status IN ('lobby','running','finished')
        AND json_extract(settings, '$.private') = 0 ORDER BY created_at DESC LIMIT 40`).all()).results || [];
      const seatsByBattle = new Map(rows.map(row => [row.id, []]));
      if (rows.length) {
        const seats = (await env.DB.prepare(`SELECT * FROM battle_seats WHERE battle_id IN (${rows.map(() => '?').join(',')})
          ORDER BY battle_id, seat`).bind(...rows.map(row => row.id)).all()).results || [];
        for (const seat of seats) seatsByBattle.get(seat.battle_id).push(seatRecord(seat));
      }
      return helpers.json({ battles: await Promise.all(rows.map(r => viewBattle(env, r.id, Date.now(), r, seatsByBattle.get(r.id)))), serverNow: Date.now() });
    }
    const match = path.match(/^\/api\/battles\/([a-zA-Z0-9-]{1,80})(?:\/(join|bot|start|leave|cancel))?$/);
    if (match && !match[2] && method === 'GET') return helpers.json({ battle: await viewBattle(env, match[1]), serverNow: Date.now() });
    if (method !== 'POST' || (path !== '/api/battles' && !match?.[2])) return helpers.json({ error: 'Not found.' }, 404);
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) error('Use this site to manage battles.', 403);
    if (!request.headers.get('content-type')?.includes('application/json')) error('Expected JSON.');
    const auth = await helpers.requireUser(request, env);
    if (auth.response) return auth.response;
    const user = auth.user; const body = await helpers.readJson(request);
    if (!body || typeof body !== 'object') error('Expected JSON.');
    let id = match?.[1];
    if (path === '/api/battles') {
      const requestId = String(body.requestId || '');
      if (!/^[a-zA-Z0-9-]{8,80}$/.test(requestId)) error('Provide a unique requestId.');
      const existing = await env.DB.prepare('SELECT id FROM battles WHERE host_id = ? AND request_id = ?').bind(user.id, requestId).first();
      if (existing) id = existing.id;
      else {
        const settings = battleSettings(body.settings); const products = await battleCatalog(env, request, helpers);
        const build = expandLineup(body.lineup, products); id = crypto.randomUUID(); const now = Date.now();
        try {
          await env.DB.batch([
            env.DB.prepare(`INSERT INTO battles(id, host_id, request_id, settings, lineup, plan, entry_cost, created_at, expires_at)
              VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, user.id, requestId, JSON.stringify(settings), JSON.stringify(build.lineup), JSON.stringify(build.plan), build.entryCost, now, now + 24 * 3600000),
            seatInsert(env, id, 0, user, user.id, false),
          ]);
        } catch (err) {
          const raced = await env.DB.prepare('SELECT id FROM battles WHERE host_id = ? AND request_id = ?').bind(user.id, requestId).first();
          if (!raced) throw err;
          id = raced.id;
        }
      }
    } else {
      const row = await getRow(env, id); if (!row) error('Battle not found.', 404);
      const action = match[2]; const host = row.host_id === user.id;
      if (['bot', 'start', 'cancel'].includes(action) && !host) error('Only the host can do that.', 403);
      const seats = await getSeats(env, id); const own = seats.find(s => s.userId === user.id);
      if (action === 'join' || action === 'bot') {
        if (action === 'bot' && body.seat === undefined) error('Choose an explicit seat for your bot.');
        if (row.status !== 'lobby') error('Battle is no longer accepting players.', 409);
        if (action === 'join' && own) { /* retry: the user already paid */ }
        else {
          const settings = parse(row.settings);
          const seat = body.seat === undefined ? Array.from({ length: settings.players }, (_, i) => i).find(i => !seats.some(s => s.seat === i)) : Number(body.seat);
          if (!Number.isInteger(seat) || seat < 0 || seat >= settings.players) error('Choose an empty seat.');
          const occupied = seats.find(s => s.seat === seat);
          if (action === 'bot' && occupied?.bot) { /* idempotent seat retry */ }
          else {
            if (occupied) error('That seat was taken.', 409);
            const bot = action === 'bot';
            await seatInsert(env, id, seat, bot ? { id: null, name: `Bot ${seat + 1}`, handle: 'practice-bot', color: 'silver' } : user, user.id, bot).run();
          }
        }
      } else if (action === 'start') {
        if (row.status === 'cancelled') error('That battle was cancelled.', 409);
        if (row.status === 'lobby') await startBattle(env, request, row, helpers);
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
    return helpers.json({ battle: await viewBattle(env, id), save: await helpers.loadSave(env, user.id), serverNow: Date.now() });
  } catch (err) {
    if (/no such table: (battles|battle_seats)/.test(err.message)) return helpers.json({ error: 'Battles are waiting for the database update.' }, 503);
    if (/Not enough coins|no longer accepting|cannot be left|Fill every|active battles/.test(err.message)) return helpers.json({ error: err.message }, 409);
    if (/UNIQUE constraint failed: battle_seats/.test(err.message)) return helpers.json({ error: 'That seat was taken. Refresh the lobby.' }, 409);
    if (err.status) return helpers.json({ error: err.message }, err.status);
    if (/Choose|Unknown battle|Unknown scoring|Teams need/.test(err.message)) return helpers.json({ error: err.message }, 400);
    throw err;
  }
}
function seatInsert(env, id, seat, user, payer, bot) {
  return env.DB.prepare(`INSERT INTO battle_seats(battle_id, seat, user_id, payer_id, name, handle, color, bot)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, seat, user.id, payer, user.name, user.handle, user.color, Number(bot));
}
