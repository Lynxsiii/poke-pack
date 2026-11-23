/* Trading (migration 0035, worker/trades-ddl.js). A player offers cards, slabs
   and coins to another player for some of theirs; the other accepts, declines
   or counters. The rules are in js/trade-rules.js.

   Nothing is held while an offer waits. The swap is one UPDATE (open ->
   accepted) whose triggers check, at that instant, that both players still own
   everything and that the gap fits both daily limits, then move it all. This
   module decides whether an offer may be made or taken (levels, friends, who
   takes offers, values at today's prices) and words the refusals; it never
   moves a card itself.

     GET  /api/trades                    my offers: incoming, sent, history, limits, setting
     GET  /api/trades/with/<handle>      a partner: may we trade, what they hold, both daily limits
     POST /api/trades                    { to, give, take, requestId, counterOf? }
     POST /api/trades/settings           { from: 'all' | 'friends' | 'none' }
     GET  /api/trades/<id>               one offer, with today's values and whether it can go through
     POST /api/trades/<id>/accept | decline | cancel

   A side is { cards: [{ id, qty, reverse? }], slabs: [graded_cards id], coins }. */
import { sellValue } from "../js/catalog.js";
import { gradedValue, certNumber, GRADING_LIMITS } from "../js/grading-rules.js";
import { GATES, gateMessage } from "../js/levels.js";
import { TRADE_RULES, TRADE_FROM, gapLimit, tradeGap, coinsToEven } from "../js/trade-rules.js";
import { TRADES_DDL, TRADES_OBJECTS } from "./trades-ddl.js";
import { ensureGradingSchema, setForCard } from "./grading.js";
import { levelFields, standingOf } from "./perks.js";

const fail = (message, status = 400, extra = {}) => { throw Object.assign(new Error(message), { status, extra }); };
const cents = (coins) => Math.round(Number(coins) * 100);
const coinsOf = (c) => Math.round(Number(c) || 0) / 100;
const words = (c) => {
  const n = coinsOf(c);
  return `${n.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })} ${n === 1 ? "coin" : "coins"}`;
};
const parse = (text, fallback) => { try { return text ? JSON.parse(text) : fallback; } catch { return fallback; } };
const CARD_ID = /^[a-z0-9-]{3,48}$/i;
const REQUEST_ID = /^[a-zA-Z0-9-]{8,64}$/;
const TRADE_ID = /^[a-f0-9]{20}$/;
const newTradeId = () => [...crypto.getRandomValues(new Uint8Array(10))].map((b) => b.toString(16).padStart(2, "0")).join("");

// ---- Schema ------------------------------------------------------------------
let schemaReady = false;
let schemaWork = null;
/** Tests only: forget the per-isolate cache so another database is checked. */
export const resetTradesSchemaCache = () => { schemaReady = false; schemaWork = null; };

/** Create the trade tables and triggers once per isolate (one atomic batch, every statement IF NOT EXISTS). */
export async function ensureTradesSchema(env) {
  if (schemaReady) return;
  if (!schemaWork) {
    schemaWork = (async () => {
      try {
        await ensureGradingSchema(env); // graded_cards with `locked` and `black_label`, which the triggers read
        const rows = (await env.DB.prepare(`SELECT name FROM sqlite_master WHERE name IN (${TRADES_OBJECTS.map(() => "?").join(",")})`)
          .bind(...TRADES_OBJECTS).all()).results || [];
        if (rows.length < TRADES_OBJECTS.length) await env.DB.batch(TRADES_DDL.map((sql) => env.DB.prepare(sql)));
        schemaReady = true;
      } catch (err) {
        console.error("ensureTradesSchema", err);
        throw err;
      } finally {
        schemaWork = null;
      }
    })();
  }
  return schemaWork;
}

/** Open offers waiting on this player, for the friends badge. 0 when trading has never been used on this database. */
export async function incomingTradeCount(env, userId) {
  try {
    const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM trades WHERE to_id = ? AND status = 'open' AND expires_at > ?")
      .bind(userId, Date.now()).first();
    return Number(row?.n) || 0;
  } catch {
    return 0;
  }
}

// ---- Reading a request ---------------------------------------------------------
/** A side from the request body: { cards: Map(id -> { qty, rev }), slabs: [id], coins (cents) }. */
function readSide(raw, who) {
  const side = raw && typeof raw === "object" ? raw : {};
  const list = side.cards == null ? [] : side.cards;
  const slabList = side.slabs == null ? [] : side.slabs;
  if (!Array.isArray(list) || !Array.isArray(slabList)) fail("That trade is not valid.");
  const cards = new Map();
  let copies = 0;
  for (const row of list) {
    const id = String(row?.id || "");
    const qty = Number(row?.qty);
    if (!CARD_ID.test(id) || !Number.isInteger(qty) || qty < 1 || qty > TRADE_RULES.maxQty) fail("Choose valid cards.");
    const entry = cards.get(id) || { qty: 0, rev: 0 };
    entry.qty += qty;
    if (row.reverse) entry.rev += qty;
    if (entry.qty > TRADE_RULES.maxQty) fail(`A trade can hold ${TRADE_RULES.maxQty} copies of one card.`);
    cards.set(id, entry);
    copies += qty;
  }
  if (cards.size > TRADE_RULES.maxCards) fail(`${who} can put up at most ${TRADE_RULES.maxCards} different cards.`);
  if (copies > TRADE_RULES.maxCopies) fail(`${who} can put up at most ${TRADE_RULES.maxCopies} cards in total.`);
  const slabs = [];
  for (const raw of slabList) {
    if (typeof raw !== "number" || !Number.isSafeInteger(raw) || raw < 1) fail("Choose valid slabs.");
    slabs.push(raw);
  }
  if (new Set(slabs).size !== slabs.length) fail("List each slab once.");
  if (slabs.length > TRADE_RULES.maxSlabs) fail(`${who} can put up at most ${TRADE_RULES.maxSlabs} slabs.`);
  const coinCents = side.coins == null || side.coins === "" ? 0 : cents(side.coins);
  if (!Number.isSafeInteger(coinCents) || coinCents < 0 || coinCents > TRADE_RULES.maxCoinsCents) fail("Choose a valid amount of coins.");
  return { cards, slabs, coins: coinCents };
}

/** What a slab is worth in a trade, in cents: the better of its graded and raw value (cracking it never beats this). */
function slabCents(card, row) {
  const graded = gradedValue(card, row.grade, setForCard(row.card_id ?? row.cardId), Boolean(row.black_label ?? row.bl));
  return Math.round(Math.max(graded, sellValue(card)) * 100);
}

const activeSlabs = async (env, userId) =>
  (await env.DB.prepare("SELECT * FROM graded_cards WHERE user_id = ? AND status = 'slabbed' AND locked IS NULL ORDER BY created_at DESC, id DESC")
    .bind(userId).all()).results || [];

/**
 * Check a side against what its owner holds right now and price it: the
 * snapshots the offer stores. `mine` words the refusals ("You only have" or
 * "They only have").
 */
async function buildSide(env, request, h, owner, side, mine) {
  const { collection, reverses } = await h.inventoryMap(env, owner.id);
  const who = mine ? "You" : `@${owner.handle}`;
  const cards = [];
  let value = 0;
  for (const [id, { qty, rev }] of side.cards) {
    const have = collection[id] || 0;
    const haveRev = Math.min(have, reverses[id] || 0);
    const card = await h.findCatalogCard(env, request, id);
    if (!card) fail("Unknown card.");
    if (rev > haveRev) fail(`${who} only ${mine ? "have" : "has"} ${haveRev} reverse holo ${card.name}.`, 409);
    if (qty - rev > have - haveRev) fail(`${who} only ${mine ? "have" : "has"} ${have - haveRev} ${haveRev ? "plain " : ""}${card.name}.`, 409);
    const v = Math.round(sellValue(card) * 100);
    value += v * qty;
    cards.push({ id, qty, rev, name: card.name, number: card.number, rarity: card.rarity, image: card.image, small: card.imageSmall || card.image, v });
  }
  const slabs = [];
  if (side.slabs.length) {
    const rows = new Map((await activeSlabs(env, owner.id)).map((row) => [row.id, row]));
    for (const id of side.slabs) {
      const row = rows.get(id);
      if (!row) fail(mine ? "You no longer have one of those slabs." : `@${owner.handle} no longer has one of those slabs.`, 409);
      const card = await h.findCatalogCard(env, request, row.card_id);
      if (!card) fail("That slab has no price right now.", 409);
      const v = slabCents(card, row);
      value += v;
      slabs.push({ id, cardId: row.card_id, grade: row.grade, reverse: row.reverse ? 1 : 0, bl: row.black_label ? 1 : 0,
        name: card.name, number: card.number, rarity: card.rarity, image: card.image, small: card.imageSmall || card.image, v });
    }
  }
  if (side.coins > 0) {
    const profile = await env.DB.prepare("SELECT coins FROM profiles WHERE user_id = ?").bind(owner.id).first();
    if (Math.round((profile?.coins || 0) * 100) < side.coins) fail(mine ? "You don't have that many coins." : `@${owner.handle} doesn't have that many coins.`, 409);
  }
  return { cards, slabs, coins: side.coins, value: value + side.coins };
}

/** A stored side at today's prices, in cents. A card the catalog lost keeps the value it was offered at. */
async function sideValueNow(env, request, h, cards, slabs, coinCents) {
  let value = coinCents;
  for (const c of cards) {
    const card = await h.findCatalogCard(env, request, c.id).catch(() => null);
    value += (card ? Math.round(sellValue(card) * 100) : c.v) * c.qty;
  }
  for (const s of slabs) {
    const card = await h.findCatalogCard(env, request, s.cardId).catch(() => null);
    value += card ? slabCents(card, s) : s.v;
  }
  return value;
}

/** Whether `userId` still holds a stored side: null when they do, else "cards", "slabs" or "coins". */
async function missingFrom(env, h, userId, cards, slabs, coinCents) {
  if (cards.length) {
    const { collection, reverses } = await h.inventoryMap(env, userId);
    for (const c of cards) {
      const have = collection[c.id] || 0;
      const haveRev = Math.min(have, reverses[c.id] || 0);
      if (c.rev > haveRev || c.qty - c.rev > have - haveRev) return "cards";
    }
  }
  if (slabs.length) {
    const rows = new Map((await activeSlabs(env, userId)).map((row) => [row.id, row]));
    for (const s of slabs) {
      const row = rows.get(s.id);
      if (!row || row.card_id !== s.cardId || row.grade !== s.grade || Number(row.reverse) !== s.reverse || Number(row.black_label) !== s.bl) return "slabs";
    }
  }
  if (coinCents > 0) {
    const profile = await env.DB.prepare("SELECT coins FROM profiles WHERE user_id = ?").bind(userId).first();
    if (Math.round((profile?.coins || 0) * 100) < coinCents) return "coins";
  }
  return null;
}

// ---- Who may trade -------------------------------------------------------------
async function friendsNow(env, a, b) {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM friends WHERE status = 'accepted' AND ((from_id = ?1 AND to_id = ?2) OR (from_id = ?2 AND to_id = ?1))`
  ).bind(a, b).first();
  return Number(row?.n) >= 2;
}

async function acceptFrom(env, userId) {
  const row = await env.DB.prepare("SELECT accept_from FROM trade_settings WHERE user_id = ?").bind(userId).first();
  return TRADE_FROM.includes(row?.accept_from) ? row.accept_from : "all";
}

/** The gap a player has given and got over the last 24 hours, in cents, with their daily limit. */
async function gapUse(env, userId, level, now) {
  const since = now - TRADE_RULES.gapWindowMs;
  const [given, got] = await Promise.all([
    env.DB.prepare("SELECT COALESCE(SUM(gift_cents), 0) AS n FROM trades WHERE status = 'accepted' AND gift_from = ? AND closed_at > ?").bind(userId, since).first(),
    env.DB.prepare("SELECT COALESCE(SUM(gift_cents), 0) AS n FROM trades WHERE status = 'accepted' AND gift_to = ? AND closed_at > ?").bind(userId, since).first(),
  ]);
  return { cap: gapLimit(level), given: Number(given?.n) || 0, got: Number(got?.n) || 0 };
}
const limitsView = (use) => ({ cap: coinsOf(use.cap), given: coinsOf(use.given), got: coinsOf(use.got) });

/**
 * May `from` and `to` trade at all, before any item is named? null when they
 * may, else { error, status, code, needLevel? }. A counter (`answering`) skips
 * the receiver's "who may send me offers" setting: they made the first offer.
 */
async function pairRefusal(env, from, to, { answering = false, friends = null } = {}) {
  const need = GATES.trading;
  const [mine, theirs] = await Promise.all([standingOf(env, from.id), standingOf(env, to.id)]);
  if (mine.peak < need) return { error: gateMessage("trading"), status: 403, code: "level", needLevel: need, level: mine.peak };
  if (theirs.peak < need) return { error: `@${to.handle} hasn't reached level ${need} yet, so they can't trade.`, status: 403, code: "their-level" };
  if (!answering) {
    const setting = await acceptFrom(env, to.id);
    if (setting === "none") return { error: `@${to.handle} isn't taking trade offers.`, status: 403, code: "closed" };
    if (setting === "friends" && !(friends ?? await friendsNow(env, from.id, to.id))) {
      return { error: `@${to.handle} only takes trade offers from friends.`, status: 403, code: "friends-only" };
    }
  }
  return null;
}

/**
 * The rules on a trade's two totals (js/trade-rules.js): strangers trade close
 * to even, and the gap fits the giver's and the getter's daily limits.
 * Returns { ok, code, gap, down, giver, getter, capGive, capGet, error } where
 * `error` is worded for `viewer`.
 */
async function assess(env, from, to, giveValue, takeValue, viewer, now) {
  const shape = tradeGap(giveValue, takeValue);
  const out = { ok: true, code: null, error: "", gap: shape.gap, down: shape.down, even: shape.even, giver: null, getter: null, capGive: null, capGet: null };
  if (!shape.gap) return out;
  const giver = shape.down === "give" ? from : to;
  const getter = shape.down === "give" ? to : from;
  out.giver = giver.id;
  out.getter = getter.id;
  const friends = await friendsNow(env, from.id, to.id);
  out.friends = friends;
  const you = (user, cap = false) => (user.id === viewer ? (cap ? "You" : "you") : `@${user.handle}`);
  if (!shape.even && !friends) {
    const need = coinsToEven(giveValue, takeValue);
    return { ...out, ok: false, code: "uneven", needCents: need,
      error: `That's too uneven for players who aren't friends. ${you(getter, true)} would need to add about ${words(need)} of value, or add each other as friends first.` };
  }
  const [giverLevel, getterLevel] = await Promise.all([standingOf(env, giver.id), standingOf(env, getter.id)]);
  const [giverUse, getterUse] = await Promise.all([gapUse(env, giver.id, giverLevel.peak, now), gapUse(env, getter.id, getterLevel.peak, now)]);
  out.capGive = giverUse.cap;
  out.capGet = getterUse.cap;
  const giveLeft = Math.max(0, giverUse.cap - giverUse.given);
  const getLeft = Math.max(0, getterUse.cap - getterUse.got);
  if (shape.gap > giveLeft) {
    return { ...out, ok: false, code: "gap-give", leftCents: giveLeft,
      error: `${you(giver, true)} would be ${words(shape.gap)} down on this trade, and ${giver.id === viewer ? "your" : "their"} daily limit for uneven trades has ${words(giveLeft)} left. Even it out with cards or coins.` };
  }
  if (shape.gap > getLeft) {
    return { ...out, ok: false, code: "gap-get", leftCents: getLeft,
      error: `${you(getter, true)} would come out ${words(shape.gap)} ahead, and ${getter.id === viewer ? "your" : "their"} daily limit for uneven trades has ${words(getLeft)} left. Even it out with cards or coins.` };
  }
  return out;
}

// ---- Views ---------------------------------------------------------------------
const cardView = (c) => ({ id: c.id, qty: c.qty, rev: c.rev, name: c.name, number: c.number, rarity: c.rarity, image: c.image, small: c.small, value: coinsOf(c.v) });
const slabViewOf = (s) => ({ id: s.id, cert: certNumber(s.id), cardId: s.cardId, grade: s.grade, reverse: Boolean(s.reverse), blackLabel: Boolean(s.bl),
  name: s.name, number: s.number, rarity: s.rarity, image: s.image, small: s.small, value: coinsOf(s.v) });

async function usersById(env, h, ids) {
  const unique = [...new Set(ids)];
  const out = new Map();
  if (!unique.length) return out;
  const rows = (await env.DB.prepare(`SELECT * FROM users WHERE id IN (${unique.map(() => "?").join(",")})`).bind(...unique).all()).results || [];
  for (const row of rows) out.set(row.id, row);
  return out;
}

async function userView(env, h, row) {
  if (!row) return { id: null, name: "Deleted trainer", handle: "", gone: true };
  const standing = await standingOf(env, row.id);
  return { ...h.publicUser(row), ...(await levelFields(env, row, standing)) };
}

async function tradeViews(env, h, rows, viewerId) {
  const users = await usersById(env, h, rows.flatMap((row) => [row.from_id, row.to_id]));
  const faces = new Map();
  for (const [id, row] of users) faces.set(id, await userView(env, h, row));
  const gone = { id: null, name: "Deleted trainer", handle: "", gone: true };
  return rows.map((row) => ({
    id: row.id,
    status: row.status === "open" && row.expires_at <= Date.now() ? "expired" : row.status,
    mine: row.from_id === viewerId ? "from" : "to",
    from: faces.get(row.from_id) || gone,
    to: faces.get(row.to_id) || gone,
    give: { cards: parse(row.give_cards, []).map(cardView), slabs: parse(row.give_slabs, []).map(slabViewOf), coins: coinsOf(row.give_coins) },
    take: { cards: parse(row.take_cards, []).map(cardView), slabs: parse(row.take_slabs, []).map(slabViewOf), coins: coinsOf(row.take_coins) },
    giveValue: coinsOf(row.give_value),
    takeValue: coinsOf(row.take_value),
    parentId: row.parent_id || null,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    closedAt: row.closed_at || null,
  }));
}
const tradeView = async (env, h, row, viewerId) => (await tradeViews(env, h, [row], viewerId))[0];

/** Offers past their time are closed the next time either player looks. */
async function expireFor(env, userId, now) {
  await env.DB.prepare("UPDATE trades SET status = 'expired', closed_at = ?1 WHERE status = 'open' AND expires_at <= ?1 AND (from_id = ?2 OR to_id = ?2)")
    .bind(now, userId).run();
}

/** Binder pockets that held a card which just left are emptied (same compare-and-set as selling). Best effort: a stale pocket is only a picture. */
async function tidyBinder(env, h, userId) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const profile = await env.DB.prepare("SELECT binder FROM profiles WHERE user_id = ?").bind(userId).first();
    if (!profile?.binder) return;
    const owned = await h.ownedWithSlabs(env, userId, (await h.inventoryMap(env, userId)).collection);
    const before = h.parseJson(profile.binder, []);
    const after = h.reconcileBinder(before, owned);
    if (!before.some((slot, i) => slot && !after[i])) return;
    const res = await env.DB.prepare("UPDATE profiles SET binder = ? WHERE user_id = ? AND binder IS ?").bind(JSON.stringify(after), userId, profile.binder).run();
    if (res?.meta?.changes) return;
  }
}

/** Why the swap statement was refused, worded for the player who pressed Accept (the receiver). */
function swapRefusal(code, fromRow) {
  const them = `@${fromRow?.handle || "They"}`;
  switch (code) {
    case "expired": return "That offer has expired.";
    case "closed": return "That offer is already closed.";
    case "from-cards": return `${them} no longer has all of those cards. Ask them to send a new offer.`;
    case "from-slabs": return `${them} no longer has all of those slabs. Ask them to send a new offer.`;
    case "from-coins": return `${them} no longer has those coins.`;
    case "to-cards": return "You no longer have all of the cards this offer asks for.";
    case "to-slabs": return "You no longer have all of the slabs this offer asks for. A slab in a casino game can't be traded.";
    case "to-coins": return "You don't have the coins this offer asks for.";
    case "gap-from":
    case "gap-to": return "This trade is more uneven than today's limit allows. Even it out with a counter.";
    case "no-account": return "That trainer's account is gone.";
    default: return "That trade can't go through. Try again.";
  }
}

// ---- Routes --------------------------------------------------------------------
export async function handleTrades(path, method, request, env, h) {
  if (path !== "/api/trades" && !path.startsWith("/api/trades/")) return null;
  const auth = await h.requireUser(request, env);
  if (auth.response) return auth.response;
  const me = auth.user;
  await ensureTradesSchema(env);
  try {
    if (path === "/api/trades" && method === "GET") return h.json(await listTrades(env, h, me));
    if (path === "/api/trades" && method === "POST") return h.json(await createTrade(env, request, h, me), 201);
    if (path === "/api/trades/settings" && method === "POST") return h.json(await saveSettings(env, request, h, me));
    const withMatch = path.match(/^\/api\/trades\/with\/([a-z0-9_]{3,16})$/i);
    if (withMatch && method === "GET") return h.json(await partner(env, request, h, me, withMatch[1]));
    const one = path.match(/^\/api\/trades\/([a-f0-9]{20})(?:\/(accept|decline|cancel))?$/);
    if (one && !one[2] && method === "GET") return h.json(await readTrade(env, request, h, me, one[1]));
    if (one && one[2] && method === "POST") return h.json(await closeTrade(env, request, h, me, one[1], one[2]));
  } catch (err) {
    if (err?.status && err.status < 500) return h.json({ error: err.message, ...(err.extra || {}) }, err.status);
    throw err;
  }
  return h.json({ error: "Not found." }, 404);
}

async function listTrades(env, h, me) {
  const now = Date.now();
  await expireFor(env, me.id, now);
  const [incoming, sent, history, standing, setting] = await Promise.all([
    env.DB.prepare("SELECT * FROM trades WHERE to_id = ? AND status = 'open' ORDER BY created_at DESC LIMIT 60").bind(me.id).all(),
    env.DB.prepare("SELECT * FROM trades WHERE from_id = ? AND status = 'open' ORDER BY created_at DESC LIMIT 60").bind(me.id).all(),
    env.DB.prepare("SELECT * FROM trades WHERE (from_id = ?1 OR to_id = ?1) AND status != 'open' ORDER BY closed_at DESC LIMIT ?2").bind(me.id, TRADE_RULES.historyShown).all(),
    standingOf(env, me.id),
    acceptFrom(env, me.id),
  ]);
  const rows = [...(incoming.results || []), ...(sent.results || []), ...(history.results || [])];
  const views = await tradeViews(env, h, rows, me.id);
  const nIn = (incoming.results || []).length;
  const nSent = (sent.results || []).length;
  return {
    incoming: views.slice(0, nIn),
    sent: views.slice(nIn, nIn + nSent),
    history: views.slice(nIn + nSent),
    level: standing.peak,
    needLevel: GATES.trading,
    open: standing.peak >= GATES.trading,
    limits: limitsView(await gapUse(env, me.id, standing.peak, now)),
    from: setting,
    now,
  };
}

async function saveSettings(env, request, h, me) {
  const body = await h.readJson(request);
  const from = String(body?.from || "");
  if (!TRADE_FROM.includes(from)) fail("Choose who can send you offers.");
  await env.DB.prepare(
    `INSERT INTO trade_settings(user_id, accept_from, updated_at) VALUES(?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET accept_from = excluded.accept_from, updated_at = excluded.updated_at`
  ).bind(me.id, from, Date.now()).run();
  return { from };
}

/** GET /api/trades/with/<handle>: everything the offer builder needs about the other player. */
async function partner(env, request, h, me, rawHandle) {
  const handle = h.normalizeHandle(rawHandle);
  const them = await env.DB.prepare("SELECT * FROM users WHERE handle = ?").bind(handle).first();
  if (!them) fail("Trainer not found.", 404);
  if (them.id === me.id) fail("You can't trade with yourself.");
  const now = Date.now();
  const friends = await friendsNow(env, me.id, them.id);
  // An open offer from them means they asked first, so their "who may send me offers" setting doesn't block a counter.
  const theirOffer = await env.DB.prepare("SELECT id FROM trades WHERE from_id = ? AND to_id = ? AND status = 'open' AND expires_at > ? LIMIT 1").bind(them.id, me.id, now).first();
  const refusal = await pairRefusal(env, me, them, { answering: Boolean(theirOffer), friends });
  const [mine, theirs] = await Promise.all([standingOf(env, me.id), standingOf(env, them.id)]);
  const out = {
    partner: await userView(env, h, them),
    friends,
    can: refusal ? { ok: false, code: refusal.code, error: refusal.error, needLevel: refusal.needLevel || null } : { ok: true },
    limits: { mine: limitsView(await gapUse(env, me.id, mine.peak, now)), theirs: limitsView(await gapUse(env, them.id, theirs.peak, now)) },
    rules: { evenShare: TRADE_RULES.evenShare, evenSlack: coinsOf(TRADE_RULES.evenSlackCents) },
    their: { collection: {}, reverses: {}, slabs: [] },
    mine: { slabs: [] },
  };
  if (refusal) return out;
  const slabsOf = async (userId) => {
    const list = [];
    for (const row of await activeSlabs(env, userId)) {
      const card = await h.findCatalogCard(env, request, row.card_id).catch(() => null);
      if (!card?.image) continue;
      list.push(slabViewOf({ id: row.id, cardId: row.card_id, grade: row.grade, reverse: row.reverse ? 1 : 0, bl: row.black_label ? 1 : 0,
        name: card.name, number: card.number, rarity: card.rarity, image: card.image, small: card.imageSmall || card.image, v: slabCents(card, row) }));
    }
    return list;
  };
  const inventory = await h.inventoryMap(env, them.id);
  out.their = { collection: inventory.collection, reverses: inventory.reverses, slabs: await slabsOf(them.id) };
  out.mine = { slabs: await slabsOf(me.id) };
  return out;
}

async function createTrade(env, request, h, me) {
  const body = await h.readJson(request);
  if (!body) fail("Expected JSON.");
  const requestId = String(body.requestId || "");
  if (!REQUEST_ID.test(requestId)) fail("Missing request id.");
  const existing = await env.DB.prepare("SELECT * FROM trades WHERE from_id = ? AND request_id = ?").bind(me.id, requestId).first();
  if (existing) return { trade: await tradeView(env, h, existing, me.id) };

  const them = await env.DB.prepare("SELECT * FROM users WHERE handle = ?").bind(h.normalizeHandle(body.to)).first();
  if (!them) fail("Trainer not found.", 404);
  if (them.id === me.id) fail("You can't trade with yourself.");
  const now = Date.now();

  // A counter closes the offer it answers and makes the new one in the same transaction.
  let answering = null;
  if (body.counterOf != null) {
    const id = String(body.counterOf);
    if (!TRADE_ID.test(id)) fail("That offer can't be countered.");
    answering = await env.DB.prepare("SELECT * FROM trades WHERE id = ? AND to_id = ? AND from_id = ?").bind(id, me.id, them.id).first();
    if (!answering) fail("That offer can't be countered.", 404);
    if (answering.status !== "open" || answering.expires_at <= now) fail("That offer is already closed.", 409);
  }

  const refusal = await pairRefusal(env, me, them, { answering: Boolean(answering) });
  if (refusal) fail(refusal.error, refusal.status, { code: refusal.code, ...(refusal.needLevel ? { needLevel: refusal.needLevel } : {}) });

  const [open, today] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS n FROM trades WHERE from_id = ? AND status = 'open' AND expires_at > ?").bind(me.id, now).first(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM trades WHERE from_id = ? AND created_at > ?").bind(me.id, now - 86_400_000).first(),
  ]);
  if (Number(open?.n) >= TRADE_RULES.maxOpenSent && !answering) fail(`You have ${TRADE_RULES.maxOpenSent} offers waiting. Cancel one to send another.`, 429);
  if (Number(today?.n) >= TRADE_RULES.maxPerDay) fail("That's a lot of offers for one day. Try again tomorrow.", 429);

  const giveSide = readSide(body.give, "You");
  const takeSide = readSide(body.take, `@${them.handle}`);
  if (!giveSide.cards.size && !giveSide.slabs.length && !giveSide.coins && !takeSide.cards.size && !takeSide.slabs.length && !takeSide.coins) {
    fail("Put at least one thing in the trade.");
  }
  if (giveSide.coins > 0 && takeSide.coins > 0) fail("Coins can only go one way in a trade.");
  for (const id of giveSide.cards.keys()) if (takeSide.cards.has(id)) fail("A card can't be on both sides of a trade.");

  const give = await buildSide(env, request, h, me, giveSide, true);
  const take = await buildSide(env, request, h, them, takeSide, false);
  if (give.value + take.value <= 0) fail("Put at least one thing in the trade.");
  const verdict = await assess(env, me, them, give.value, take.value, me.id, now);
  if (!verdict.ok) fail(verdict.error, 409, { code: verdict.code });

  const id = newTradeId();
  const insert = (guard) => env.DB.prepare(
    `INSERT INTO trades(id, from_id, to_id, request_id, status, parent_id, give_cards, give_slabs, give_coins, take_cards, take_slabs, take_coins,
       give_value, take_value, created_at, expires_at)
     SELECT ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? ${guard}`
  ).bind(id, me.id, them.id, requestId, answering?.id ?? null, JSON.stringify(give.cards), JSON.stringify(give.slabs), give.coins,
    JSON.stringify(take.cards), JSON.stringify(take.slabs), take.coins, give.value, take.value, now, now + TRADE_RULES.expiryMs);
  try {
    if (answering) {
      const results = await env.DB.batch([
        env.DB.prepare("UPDATE trades SET status = 'countered', closed_at = ? WHERE id = ? AND to_id = ? AND status = 'open'").bind(now, answering.id, me.id),
        insert("WHERE changes() = 1"),
      ]);
      if (!results[1]?.meta?.changes) fail("That offer is already closed.", 409);
    } else {
      await insert("").run();
    }
  } catch (err) {
    if (err?.status) throw err;
    const message = String(err?.message || err);
    if (/UNIQUE/i.test(message)) {
      const again = await env.DB.prepare("SELECT * FROM trades WHERE from_id = ? AND request_id = ?").bind(me.id, requestId).first();
      if (again) return { trade: await tradeView(env, h, again, me.id) };
    }
    if (/trade:closed/.test(message)) fail("That offer is already closed.", 409);
    if (/trade:(not-valid|empty|not-open)/.test(message)) fail("That trade is not valid.");
    throw err;
  }
  const row = await env.DB.prepare("SELECT * FROM trades WHERE id = ?").bind(id).first();
  return { trade: await tradeView(env, h, row, me.id) };
}

/** GET /api/trades/<id>: the offer, plus (while it is open) today's values and whether it could go through right now. */
async function readTrade(env, request, h, me, id) {
  const now = Date.now();
  await expireFor(env, me.id, now);
  const row = await env.DB.prepare("SELECT * FROM trades WHERE id = ? AND (from_id = ?2 OR to_id = ?2)").bind(id, me.id).first();
  if (!row) fail("Trade not found.", 404);
  const trade = await tradeView(env, h, row, me.id);
  const out = { trade, now };
  // The offer that answered this one, or the one it answered.
  const child = row.status === "countered" ? await env.DB.prepare("SELECT id FROM trades WHERE parent_id = ? LIMIT 1").bind(row.id).first() : null;
  if (child) out.counterId = child.id;
  if (row.status !== "open") return out;
  const users = await usersById(env, h, [row.from_id, row.to_id]);
  const from = users.get(row.from_id);
  const to = users.get(row.to_id);
  if (!from || !to) return { ...out, check: { ok: false, code: "no-account", error: "That trainer's account is gone." } };
  const giveCards = parse(row.give_cards, []); const giveSlabs = parse(row.give_slabs, []);
  const takeCards = parse(row.take_cards, []); const takeSlabs = parse(row.take_slabs, []);
  const [giveNow, takeNow, fromMissing, toMissing] = await Promise.all([
    sideValueNow(env, request, h, giveCards, giveSlabs, row.give_coins),
    sideValueNow(env, request, h, takeCards, takeSlabs, row.take_coins),
    missingFrom(env, h, row.from_id, giveCards, giveSlabs, row.give_coins),
    missingFrom(env, h, row.to_id, takeCards, takeSlabs, row.take_coins),
  ]);
  const verdict = await assess(env, from, to, giveNow, takeNow, me.id, now);
  const check = { ok: verdict.ok, code: verdict.code, error: verdict.error, giveValue: coinsOf(giveNow), takeValue: coinsOf(takeNow), gap: coinsOf(verdict.gap), down: verdict.down };
  const lost = (who, what) => `${who.id === me.id ? "You no longer have" : `@${who.handle} no longer has`} all of the ${what} in this offer.`;
  if (fromMissing) Object.assign(check, { ok: false, code: `from-${fromMissing}`, error: lost(from, fromMissing) });
  else if (toMissing) Object.assign(check, { ok: false, code: `to-${toMissing}`, error: lost(to, toMissing) });
  return { ...out, check };
}

async function closeTrade(env, request, h, me, id, action) {
  const now = Date.now();
  const row = await env.DB.prepare("SELECT * FROM trades WHERE id = ? AND (from_id = ?2 OR to_id = ?2)").bind(id, me.id).first();
  if (!row) fail("Trade not found.", 404);
  const role = row.from_id === me.id ? "from" : "to";
  const want = action === "accept" ? "accepted" : action === "decline" ? "declined" : "cancelled";
  if ((action === "cancel") !== (role === "from")) fail(action === "cancel" ? "Only the sender can cancel an offer." : "Only the player an offer was sent to can answer it.", 403);
  const answer = async (extra = {}) => {
    const fresh = await env.DB.prepare("SELECT * FROM trades WHERE id = ?").bind(id).first();
    return { trade: await tradeView(env, h, fresh, me.id), ...extra };
  };
  // Pressed twice, or answered on another device: the same answer again is not an error.
  if (row.status === want) return answer(action === "accept" ? { save: await h.loadSave(env, me.id) } : {});
  if (row.status !== "open") fail("That offer is already closed.", 409);
  if (row.expires_at <= now) {
    await expireFor(env, me.id, now);
    fail("That offer has expired.", 409);
  }

  if (action !== "accept") {
    const res = await env.DB.prepare(`UPDATE trades SET status = ?, closed_at = ? WHERE id = ? AND status = 'open' AND ${role}_id = ?`).bind(want, now, id, me.id).run();
    if (!res?.meta?.changes) {
      const fresh = await env.DB.prepare("SELECT status FROM trades WHERE id = ?").bind(id).first();
      if (fresh?.status !== want) fail("That offer is already closed.", 409);
    }
    return answer();
  }

  const users = await usersById(env, h, [row.from_id, row.to_id]);
  const from = users.get(row.from_id);
  if (!from) fail("That trainer's account is gone.", 409);
  const refusal = await pairRefusal(env, me, from, { answering: true });
  if (refusal) fail(refusal.error, refusal.status, { code: refusal.code, ...(refusal.needLevel ? { needLevel: refusal.needLevel } : {}) });

  const giveCards = parse(row.give_cards, []); const giveSlabs = parse(row.give_slabs, []);
  const takeCards = parse(row.take_cards, []); const takeSlabs = parse(row.take_slabs, []);
  // A graded collection has a ceiling; a trade must not push either player past it.
  for (const [userId, incoming, outgoing] of [[row.to_id, giveSlabs.length, takeSlabs.length], [row.from_id, takeSlabs.length, giveSlabs.length]]) {
    if (incoming <= outgoing) continue;
    const have = await env.DB.prepare("SELECT COUNT(*) AS n FROM graded_cards WHERE user_id = ? AND status = 'slabbed'").bind(userId).first();
    if (Number(have?.n) + incoming - outgoing > GRADING_LIMITS.maxSlabs) {
      fail(`${userId === me.id ? "You" : `@${from.handle}`} can't hold more than ${GRADING_LIMITS.maxSlabs} slabs.`, 409);
    }
  }
  const [giveNow, takeNow] = await Promise.all([
    sideValueNow(env, request, h, giveCards, giveSlabs, row.give_coins),
    sideValueNow(env, request, h, takeCards, takeSlabs, row.take_coins),
  ]);
  const verdict = await assess(env, from, me, giveNow, takeNow, me.id, now);
  if (!verdict.ok) fail(verdict.error, 409, { code: verdict.code });

  let res;
  try {
    res = await env.DB.prepare(
      `UPDATE trades SET status = 'accepted', closed_at = ?, give_value = ?, take_value = ?, gift_cents = ?, gift_from = ?, gift_to = ?, gift_cap_from = ?, gift_cap_to = ?
       WHERE id = ? AND to_id = ? AND status = 'open'`
    ).bind(now, giveNow, takeNow, verdict.gap, verdict.giver, verdict.getter, verdict.capGive, verdict.capGet, id, me.id).run();
  } catch (err) {
    const code = String(err?.message || err).match(/trade:([a-z-]+)/)?.[1];
    if (!code) throw err;
    fail(swapRefusal(code, from), 409, { code });
  }
  if (!res?.meta?.changes) {
    const fresh = await env.DB.prepare("SELECT status FROM trades WHERE id = ?").bind(id).first();
    if (fresh?.status !== "accepted") fail("That offer is already closed.", 409);
  }
  await Promise.all([tidyBinder(env, h, row.from_id), tidyBinder(env, h, row.to_id)].map((p) => p.catch((err) => console.error("trade binder", err))));
  return answer({ save: await h.loadSave(env, me.id) });
}
