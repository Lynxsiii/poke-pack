/**
 * Shopping cart checkouts and the sealed collection (kept, unopened product).
 *
 *   GET  /api/vault                the caller's kept sealed product
 *   POST /api/cart/checkout        { requestId, expectedCents?, lines: [{ setId, productId, qty, mode }] }
 *   POST /api/vault/open           { requestId, items: [{ setId, productId, qty }] }
 *   GET  /api/orders/<requestId>   the body the POST that made that order returned
 *
 * The contract is /mnt/project-files/cart-sealed/CONTRACT.md. In short, every
 * order is applied exactly once however often it is sent:
 *
 *  - Everything an order opens is rolled first, with the same code a single
 *    "Open box" uses (rollSealedProduct), and counted with the same math
 *    (tallyOpened). The rows it will write are stored in `plan`, what the player
 *    sees in `result`.
 *  - Phase 1 is one D1 batch (one transaction): the order row, the charge and
 *    the vault change. The order's UNIQUE(user_id, request_id) stops a second
 *    submit and its CHECK(coins_after >= 0) an unaffordable one; the vault's
 *    CHECK(qty >= 0) stops opening more than is kept. Any of them rolls the
 *    whole batch back.
 *  - Phase 2 writes the plan in chunks. Each chunk's batch starts by inserting
 *    its marker into sealed_order_chunks, so a chunk sent twice (a retry, two
 *    tabs, a dead isolate's successor) aborts as a whole and is skipped. The
 *    last chunk flips the order to 'done'. A pure "keep sealed" checkout has no
 *    phase 2.
 */
import { money } from "../js/catalog.js";
import { ORDER_LIMITS, cartEligible, lineCents, normalizeLines } from "../js/orders-rules.js";
import { ensureGearSchema, prepareGrant } from "./gear.js";
import { bestHistory, resolveSealedOffer, rollSealedProduct, tallyOpened } from "./sealed-roll.js";
import { bumpStatStmt, ensureQuestSchema, eventStmt, isMissingTable, loadCounters, maxStatStmt } from "./stats.js";

const DDL = [
  `CREATE TABLE IF NOT EXISTS sealed_vault (
    user_id TEXT NOT NULL,
    set_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    qty INTEGER NOT NULL DEFAULT 0 CHECK (qty >= 0),
    first_at INTEGER NOT NULL,
    last_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, set_id, product_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS sealed_orders (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    request_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('checkout', 'open')),
    fingerprint TEXT NOT NULL,
    cost_cents INTEGER NOT NULL CHECK (cost_cents >= 0),
    coins_after REAL NOT NULL CHECK (coins_after >= 0),
    status TEXT NOT NULL CHECK (status IN ('paid', 'done')),
    plan TEXT,
    result TEXT,
    created_at INTEGER NOT NULL,
    done_at INTEGER,
    UNIQUE (user_id, request_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS sealed_order_chunks (
    order_id TEXT NOT NULL,
    chunk INTEGER NOT NULL,
    PRIMARY KEY (order_id, chunk),
    FOREIGN KEY (order_id) REFERENCES sealed_orders(id) ON DELETE CASCADE
  )`,
  "CREATE INDEX IF NOT EXISTS idx_sealed_orders_user_status ON sealed_orders(user_id, status)",
];

// Phase 2 sizing: [card rows per statement, pack_log rows per statement, a
// pack_log row's weight (it holds its pack's cards), weight per chunk, statements
// per chunk]. D1 once ran out of memory on one huge statement in this project;
// these keep every statement and every batch small whatever the order's size.
// Each plan stores the sizing it was made with, so a deploy that changes this
// never re-cuts the chunks of an order already half applied.
const CHUNKING = [200, 60, 4, 600, 30];
// Stale paid orders finished on the way through a vault or order route, and
// how old one must be before loading a save finishes it.
const RESUME_LIMIT = 2;
const STALE_MS = 15_000;

let schemaReady = false;

/** Tests only: forget the per-isolate cache so another database is checked. */
export function resetOrdersSchemaCache() {
  schemaReady = false;
}

/** Same statements as worker/migrations/0021_sealed_orders.sql, so a deploy needs no manual step. */
export async function ensureOrdersSchema(env) {
  if (schemaReady) return;
  try {
    for (const sql of DDL) await env.DB.exec(`${sql.replace(/\s+/g, " ").trim()};`);
    schemaReady = true;
  } catch (err) {
    console.error("ensureOrdersSchema", err);
    throw err;
  }
}

/** Run `fn` with the tables in place; a database swapped under a warm isolate loses them, so make them again once. */
async function withSchema(env, fn) {
  await ensureOrdersSchema(env);
  try {
    return await fn();
  } catch (err) {
    if (!isMissingTable(err)) throw err;
    schemaReady = false;
    await ensureOrdersSchema(env);
    return fn();
  }
}

/** Total kept sealed products, for `save.vaultKept`. Never throws: 0 when anything is off. */
export async function vaultKept(env, userId) {
  try {
    return await withSchema(env, async () => {
      // The same read notices an order a dead isolate left half applied a while
      // ago and finishes it, so a lost checkout tab still gets its cards on the
      // next page load. A fresh one is left to the request still running it.
      const row = await env.DB.prepare(
        `SELECT COALESCE((SELECT SUM(qty) FROM sealed_vault WHERE user_id = ? AND qty > 0), 0) AS n,
           (SELECT id FROM sealed_orders WHERE user_id = ? AND status = 'paid' AND created_at < ? LIMIT 1) AS stale`
      )
        .bind(userId, userId, Date.now() - STALE_MS)
        .first();
      if (row?.stale) await resumeStale(env, userId);
      return Number(row?.n) || 0;
    });
  } catch (err) {
    console.error("vaultKept", err);
    return 0;
  }
}

/** `{ items: [{ setId, productId, qty, firstAt, lastAt }], kept }`, newest first. */
export async function readVault(env, userId) {
  const rows =
    (
      await env.DB.prepare(
        `SELECT set_id, product_id, qty, first_at, last_at FROM sealed_vault
         WHERE user_id = ? AND qty > 0 ORDER BY last_at DESC, set_id, product_id`
      )
        .bind(userId)
        .all()
    ).results || [];
  const items = rows.map((row) => ({
    setId: row.set_id,
    productId: row.product_id,
    qty: row.qty,
    firstAt: row.first_at,
    lastAt: row.last_at,
  }));
  return { items, kept: items.reduce((sum, item) => sum + item.qty, 0) };
}

function error(message, status = 400, extra = {}) {
  throw Object.assign(new Error(message), { status, extra });
}

function newOrderId() {
  return [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function requestIdOf(body) {
  const id = String(body?.requestId || "");
  if (!ORDER_LIMITS.requestIdPattern.test(id)) error("That order is missing its request id. Try again.");
  return id;
}

/** Normalized lines, or a 400 with the rules module's message. */
function linesOf(raw, options) {
  try {
    return normalizeLines(raw, options);
  } catch (err) {
    error(err?.message || "That order is not valid.");
  }
}

/** The same cart (or the same vault open) always gives the same string, whatever the line order. */
function fingerprintOf(kind, lines) {
  const rows = lines
    .map((line) => (kind === "checkout" ? [line.setId, line.productId, line.mode, line.qty] : [line.setId, line.productId, line.qty]))
    .sort((a, b) => `${a[0]}/${a[1]}/${a[2]}`.localeCompare(`${b[0]}/${b[1]}/${b[2]}`));
  return JSON.stringify([kind, rows]);
}

async function findOrder(env, userId, requestId) {
  return env.DB.prepare(
    `SELECT id, request_id, kind, fingerprint, cost_cents, status, plan, result FROM sealed_orders
     WHERE user_id = ? AND request_id = ?`
  )
    .bind(userId, requestId)
    .first();
}

/**
 * The offer behind one line, checked the way the shop sells it: a live set, a
 * priced product whose packs are all open, and not an "event" promo (a single
 * card that keeps its own buy button).
 */
async function resolveLine(env, request, line, deps) {
  const label = `${line.setId}/${line.productId}`;
  let resolved;
  try {
    resolved = await resolveSealedOffer(env, request, line.setId, line.productId, deps);
  } catch (err) {
    if (err?.status !== 400) throw err;
    error(`That product (${label}) isn't sold right now. Remove it and try again.`);
  }
  if (!cartEligible(resolved.offer)) error(`${resolved.offer.name} (${label}) can't go through the cart. Buy it from its own page.`);
  const packs =
    resolved.groups.reduce((sum, group) => sum + group.count, 0) +
    Object.values(resolved.offer.special || {}).reduce((sum, n) => sum + (Number(n) || 0), 0);
  return { ...resolved, packs, cents: lineCents(resolved.offer, 1) };
}

/**
 * Roll every copy of every open line, in line order, and work out the rows the
 * opening writes (`plan`) and what the player sees (`result`, the OpenResult).
 * Reads only: nothing is written until phase 1.
 */
async function planOpen(env, request, userId, openLines, deps, at) {
  const rolled = [];
  for (const line of openLines) {
    for (let i = 0; i < line.qty; i += 1) {
      rolled.push(await rollSealedProduct(env, request, line.setId, line.productId, deps, line.resolved));
    }
  }

  // Counters first: an old account's lifetime hits are read out of pack_log
  // here, before this order writes its own rows there (as openPacks does).
  const statsReady = await ensureQuestSchema(env);
  let run = 0;
  if (statsReady) {
    await loadCounters(env, userId);
    run = (await env.DB.prepare("SELECT packs_since_hit FROM profiles WHERE user_id = ?").bind(userId).first())?.packs_since_hit || 0;
  }
  const ids = [
    ...new Set(rolled.flatMap((box) => [...box.promos, ...box.boxCards, ...box.packs.flatMap((pack) => pack.pulls)]).map((card) => card.id)),
  ];
  const ownedQty = {};
  const ownedReverse = {};
  // D1 caps bound parameters per query at 100.
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90);
    const rows =
      (
        await env.DB.prepare(
          `SELECT card_id, qty, reverse_qty FROM cards WHERE user_id = ? AND card_id IN (${chunk.map(() => "?").join(",")})`
        )
          .bind(userId, ...chunk)
          .all()
      ).results || [];
    for (const row of rows) {
      ownedQty[row.card_id] = row.qty;
      ownedReverse[row.card_id] = row.reverse_qty;
    }
  }
  const counted = tallyOpened(rolled, { qty: ownedQty, reverseQty: ownedReverse, run });

  // Sleeves and coins: new only for the first box that hands one out, and only
  // when the player held none before.
  const grant = await prepareGrant(env, userId, rolled.flatMap((box) => box.gearItems), at);
  const heldBefore = new Set(grant.granted.filter((item) => !item.wasNew).map((item) => `${item.kind}:${item.id}`));
  const gearSeen = new Set();
  const boxGear = rolled.map((box) => {
    const counts = new Map();
    for (const item of box.gearItems) {
      const key = `${item.kind}:${item.id}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return [...counts].map(([key, qty]) => {
      const [kind, id] = key.split(":");
      const wasNew = !heldBefore.has(key) && !gearSeen.has(key);
      gearSeen.add(key);
      return { kind, id, qty, wasNew };
    });
  });

  const cards = [];
  for (const [id, n] of Object.entries(counted.qty)) {
    const add = n - (ownedQty[id] || 0);
    const addReverse = (counted.reverseQty[id] || 0) - (ownedReverse[id] || 0);
    if (add > 0 || addReverse > 0) cards.push([id, add, addReverse]);
  }
  const history = bestHistory(counted.boxes).map(({ card, wrapperId }) => [
    card.id,
    String(card.name || ""),
    String(card.rarity || ""),
    card.reverse ? 1 : 0,
    card.wasNew ? 1 : 0,
    wrapperId,
  ]);
  // Each product's price split over its own packs in cents, the last pack
  // taking the remainder. A deck has no packs, so nothing goes to pack_log.
  const log = [];
  counted.boxes.forEach((box, b) => {
    const cents = Math.round(rolled[b].offer.price * 100);
    const n = box.packs.length;
    const share = n ? Math.floor(cents / n) : 0;
    box.packs.forEach((pack, i) => {
      log.push([
        (pack.set || rolled[b].live).id,
        pack.wrapper.id,
        money((i === n - 1 ? cents - share * (n - 1) : share) / 100),
        JSON.stringify(pack.cards.map((card) => ({ id: card.id, reverse: card.reverse, rarity: card.rarity }))),
      ]);
    });
  });
  const packs = log.length;
  const plan = {
    v: 1,
    chunking: CHUNKING,
    at,
    // The player's active set becomes the last opened product's, as one box does.
    setId: rolled[rolled.length - 1].live.id,
    packs,
    pulls: counted.pulled,
    sinceHit: counted.sinceHit,
    cards,
    history,
    log,
    gear: grant.granted.map((item) => [item.kind, item.id, item.qty]),
    stats: statsReady
      ? { hits: counted.hits, fresh: counted.fresh, reverses: counted.reverses, drought: packs ? counted.drought : null, sealed: rolled.length }
      : null,
  };
  const result = {
    totals: {
      products: rolled.length,
      packs,
      cards: counted.pulled,
      newCards: counted.fresh,
      hits: counted.hits,
      reverses: counted.reverses,
    },
    boxes: counted.boxes.map((box, b) => ({
      setId: rolled[b].live.id,
      productId: rolled[b].offer.id,
      name: rolled[b].offer.name,
      short: rolled[b].offer.short || "",
      noun: rolled[b].offer.noun || "",
      price: rolled[b].offer.price,
      packs: box.packs.map((pack) => ({
        setId: (pack.set || rolled[b].live).id,
        wrapperId: pack.wrapper.id,
        cards: pack.cards.map((card) => ({
          id: card.id,
          reverse: card.reverse,
          ...(card.reverse && card.reverseKind ? { reverseKind: card.reverseKind } : {}),
          wasNew: card.wasNew,
        })),
      })),
      promos: box.promos.map((card) => ({ id: card.id, wasNew: card.wasNew })),
      boxCards: box.boxCards.map((card) => ({ id: card.id, n: card.n, wasNew: card.wasNew })),
      gear: boxGear[b],
    })),
  };
  return { plan, result };
}

/** Phase 2's statements for an order, as plain `{ sql, args, weight }`: a pure function of the stored plan. */
function planStatements(order, plan, userId) {
  const [cardRows, logRows, logWeight] = plan.chunking;
  const out = [];
  for (let i = 0; i < plan.cards.length; i += cardRows) {
    const rows = plan.cards.slice(i, i + cardRows);
    out.push({
      sql: `INSERT INTO cards (user_id, card_id, qty, reverse_qty)
            SELECT ?, json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]') FROM json_each(?) WHERE true
            ON CONFLICT(user_id, card_id) DO UPDATE SET qty = cards.qty + excluded.qty,
              reverse_qty = cards.reverse_qty + excluded.reverse_qty`,
      args: [userId, JSON.stringify(rows)],
      weight: rows.length,
    });
  }
  // sinceHit is -1 when nothing hit, else the dry packs after the last hit.
  out.push({
    sql: `UPDATE profiles SET packs_opened = packs_opened + ?, pulls = pulls + ?,
            packs_since_hit = CASE WHEN ? >= 0 THEN ? ELSE packs_since_hit + ? END, active_set_id = ?
          WHERE user_id = ?`,
    args: [plan.packs, plan.pulls, plan.sinceHit, plan.sinceHit, plan.packs, plan.setId, userId],
    weight: 1,
  });
  out.push({ sql: "UPDATE users SET last_played = MAX(last_played, ?) WHERE id = ?", args: [plan.at, userId], weight: 1 });
  if (plan.history.length) {
    out.push({
      sql: `INSERT INTO history (user_id, card_id, name, rarity, reverse, was_new, pack_id, at)
            SELECT ?, json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]'),
              json_extract(value, '$[3]'), json_extract(value, '$[4]'), json_extract(value, '$[5]'), ? FROM json_each(?)`,
      args: [userId, plan.at, JSON.stringify(plan.history)],
      weight: plan.history.length,
    });
    // History keeps 24 rows (trimHistory in worker/index.js).
    out.push({
      sql: `DELETE FROM history WHERE user_id = ? AND id NOT IN (
              SELECT id FROM (SELECT id FROM history WHERE user_id = ? ORDER BY at DESC, id DESC LIMIT 24))`,
      args: [userId, userId],
      weight: 1,
    });
  }
  for (let i = 0; i < plan.log.length; i += logRows) {
    const rows = plan.log.slice(i, i + logRows);
    out.push({
      sql: `INSERT INTO pack_log (user_id, set_id, wrapper_id, cost, cards, at)
            SELECT ?, json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]'), json_extract(value, '$[3]'), ?
            FROM json_each(?)`,
      args: [userId, plan.at, JSON.stringify(rows)],
      weight: rows.length * logWeight,
    });
  }
  if (plan.gear.length) {
    // prepareGrant's upsert, for every item at once.
    out.push({
      sql: `INSERT INTO user_gear (user_id, kind, item_id, qty, first_at, last_at)
            SELECT ?, json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]'), ?, ? FROM json_each(?) WHERE true
            ON CONFLICT(user_id, kind, item_id) DO UPDATE SET qty = user_gear.qty + excluded.qty, last_at = excluded.last_at`,
      args: [userId, plan.at, plan.at, JSON.stringify(plan.gear)],
      weight: plan.gear.length,
    });
  }
  const stats = plan.stats;
  if (stats) {
    const event = (kind, amount) => ({ stmt: "event", kind, amount });
    const rows = [];
    if (stats.hits) rows.push(event("hits", stats.hits), { stmt: "bump", key: "hitsPulled", amount: stats.hits });
    if (stats.fresh) rows.push(event("newcards", stats.fresh));
    if (stats.reverses) rows.push(event("reverses", stats.reverses));
    if (stats.drought != null) rows.push({ stmt: "max", key: "maxDrought", amount: stats.drought });
    // A product opened is one `sealed` quest step and one on the lifetime counter, however many there are.
    if (stats.sealed) rows.push(event("sealed", stats.sealed), { stmt: "bump", key: "sealed", amount: stats.sealed });
    for (const row of rows) out.push({ stat: row, weight: 1 });
  }
  out.push({
    sql: "UPDATE sealed_orders SET status = 'done', done_at = ? WHERE id = ? AND status = 'paid'",
    args: [plan.at, order.id],
    weight: 1,
    last: true,
  });
  return out;
}

/** Group phase 2's statements into chunks (batches), in order. The 'done' flip rides in the last one. */
export function planChunks(order, plan, userId) {
  const [, , , maxWeight, maxStmts] = plan.chunking;
  const chunks = [];
  let current = [];
  let weight = 0;
  for (const spec of planStatements(order, plan, userId)) {
    if (!spec.last && current.length && (weight + spec.weight > maxWeight || current.length >= maxStmts)) {
      chunks.push(current);
      current = [];
      weight = 0;
    }
    current.push(spec);
    weight += spec.weight;
  }
  chunks.push(current);
  return chunks;
}

function toStatement(env, userId, spec, at) {
  if (spec.stat) {
    const { stmt, kind, key, amount } = spec.stat;
    if (stmt === "event") return eventStmt(env, userId, kind, amount, at);
    if (stmt === "bump") return bumpStatStmt(env, userId, key, amount);
    return maxStatStmt(env, userId, key, amount);
  }
  return env.DB.prepare(spec.sql).bind(...spec.args);
}

/**
 * Phase 2: write the stored plan, starting at the first chunk not yet applied.
 * Safe to run twice at once: the second runner's copy of a chunk hits that
 * chunk's marker, aborts as a whole, and is skipped.
 */
async function applyPlan(env, userId, order) {
  const plan = typeof order.plan === "string" ? JSON.parse(order.plan) : order.plan;
  if (!plan) return;
  // The stats and gear tables are made lazily elsewhere; a chunk needs them now.
  if (plan.stats) await ensureQuestSchema(env);
  if (plan.gear.length) await ensureGearSchema(env);
  const chunks = planChunks(order, plan, userId);
  const applied = new Set(
    ((await env.DB.prepare("SELECT chunk FROM sealed_order_chunks WHERE order_id = ?").bind(order.id).all()).results || []).map(
      (row) => row.chunk
    )
  );
  for (let i = 0; i < chunks.length; i += 1) {
    if (applied.has(i)) continue;
    try {
      await env.DB.batch([
        env.DB.prepare("INSERT INTO sealed_order_chunks (order_id, chunk) VALUES (?, ?)").bind(order.id, i),
        ...chunks[i].map((spec) => toStatement(env, userId, spec, plan.at)),
      ]);
    } catch (err) {
      // Another runner applied this chunk first: its marker is there, and ours rolled back whole.
      const there = await env.DB.prepare("SELECT 1 AS ok FROM sealed_order_chunks WHERE order_id = ? AND chunk = ?")
        .bind(order.id, i)
        .first();
      if (!there) throw err;
    }
  }
}

/** Finish an order if it still needs it, and answer with the body its POST returns. */
async function respond(env, userId, order, replayed, deps) {
  if (order.status === "paid") await applyPlan(env, userId, order);
  const result = typeof order.result === "string" ? JSON.parse(order.result) : order.result ?? null;
  return deps.json({
    order: {
      id: order.id,
      kind: order.kind,
      requestId: order.request_id,
      costCents: order.cost_cents,
      replayed,
      status: "done",
    },
    save: await deps.loadSave(env, userId),
    vault: await readVault(env, userId),
    opened: result,
  });
}

/** Finish a few of this player's orders a dead isolate left half applied. Best effort. */
async function resumeStale(env, userId, skipRequestId = "") {
  try {
    const rows =
      (
        await env.DB.prepare(
          "SELECT id, request_id, kind, cost_cents, status, plan FROM sealed_orders WHERE user_id = ? AND status = 'paid' LIMIT ?"
        )
          .bind(userId, RESUME_LIMIT)
          .all()
      ).results || [];
    for (const row of rows) {
      if (row.request_id !== skipRequestId) await applyPlan(env, userId, row);
    }
  } catch (err) {
    if (isMissingTable(err)) throw err; // withSchema makes the tables and runs the route again
    console.error("resumeStale", err);
  }
}

/** An order with this request id already exists: replay it, or refuse a different cart under the same id. */
function replayOrRefuse(env, userId, prior, fingerprint, deps) {
  if (prior.fingerprint !== fingerprint) {
    error("That checkout id was already used for a different order. Refresh and try again.", 409, { code: "request_reused" });
  }
  return respond(env, userId, prior, true, deps);
}

/** Phase 1, then phase 2. `stmts` are the order's own phase 1 statements after the order row. */
async function commit(env, userId, order, insert, stmts, refusal, deps) {
  try {
    await env.DB.batch([insert, ...stmts]);
  } catch (err) {
    // A duplicate submit lost the race (the request id is taken), or the guard held.
    const prior = await findOrder(env, userId, order.request_id);
    if (prior) return replayOrRefuse(env, userId, prior, order.fingerprint, deps);
    if (/constraint/i.test(String(err?.message || err))) error(refusal);
    throw err;
  }
  return respond(env, userId, order, false, deps);
}

async function checkout(env, request, user, body, deps) {
  const requestId = requestIdOf(body);
  const lines = linesOf(body.lines);
  const fingerprint = fingerprintOf("checkout", lines);
  await resumeStale(env, user.id, requestId);
  const prior = await findOrder(env, user.id, requestId);
  if (prior) return replayOrRefuse(env, user.id, prior, fingerprint, deps);

  for (const line of lines) line.resolved = await resolveLine(env, request, line, deps);
  const totalCents = lines.reduce((sum, line) => sum + line.resolved.cents * line.qty, 0);
  if (body.expectedCents != null) {
    const expected = Number(body.expectedCents);
    if (!Number.isFinite(expected)) error("That checkout's total is not a number.");
    if (expected !== totalCents) {
      error("Prices changed since you filled the cart. Check the new total and try again.", 409, { code: "price_changed", totalCents });
    }
  }
  const openLines = lines.filter((line) => line.mode === "open");
  const openPacks = openLines.reduce((sum, line) => sum + line.resolved.packs * line.qty, 0);
  if (openPacks > ORDER_LIMITS.maxOpenPacks) {
    error(`An order can open up to ${ORDER_LIMITS.maxOpenPacks} packs at once (this one has ${openPacks}). Keep the rest sealed.`);
  }
  const profile = await env.DB.prepare("SELECT coins FROM profiles WHERE user_id = ?").bind(user.id).first();
  if (!profile) error("Missing profile.", 500);
  if (Math.round(Number(profile.coins) * 100) < totalCents) error("Not enough coins.");

  const now = Date.now();
  const { plan, result } = openLines.length ? await planOpen(env, request, user.id, openLines, deps, now) : { plan: null, result: null };
  const order = {
    id: newOrderId(),
    request_id: requestId,
    kind: "checkout",
    fingerprint,
    cost_cents: totalCents,
    status: plan ? "paid" : "done",
    plan: plan ? JSON.stringify(plan) : null,
    result: result ? JSON.stringify(result) : null,
  };
  const insert = env.DB.prepare(
    `INSERT INTO sealed_orders (id, user_id, request_id, kind, fingerprint, cost_cents, coins_after, status, plan, result, created_at, done_at)
     VALUES (?, ?, ?, 'checkout', ?, ?, ROUND((SELECT coins FROM profiles WHERE user_id = ?) - ?, 2), ?, ?, ?, ?, ?)`
  ).bind(order.id, user.id, requestId, fingerprint, totalCents, user.id, totalCents / 100, order.status, order.plan, order.result, now, plan ? null : now);
  const stmts = [env.DB.prepare("UPDATE profiles SET coins = ROUND(coins - ?, 2) WHERE user_id = ?").bind(totalCents / 100, user.id)];
  const keep = lines.filter((line) => line.mode === "keep").map((line) => [line.setId, line.resolved.offer.id, line.qty]);
  if (keep.length) {
    stmts.push(
      env.DB.prepare(
        `INSERT INTO sealed_vault (user_id, set_id, product_id, qty, first_at, last_at)
         SELECT ?, json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]'), ?, ? FROM json_each(?) WHERE true
         ON CONFLICT(user_id, set_id, product_id) DO UPDATE SET qty = sealed_vault.qty + excluded.qty, last_at = excluded.last_at`
      ).bind(user.id, now, now, JSON.stringify(keep))
    );
  }
  return commit(env, user.id, order, insert, stmts, "Not enough coins.", deps);
}

async function openKept(env, request, user, body, deps) {
  const requestId = requestIdOf(body);
  if (!Array.isArray(body.items) || !body.items.length) error("Pick a sealed product to open.");
  const items = linesOf(body.items, { modeless: true });
  const fingerprint = fingerprintOf("open", items);
  await resumeStale(env, user.id, requestId);
  const prior = await findOrder(env, user.id, requestId);
  if (prior) return replayOrRefuse(env, user.id, prior, fingerprint, deps);

  const short = "You don't have that much sealed product.";
  const held = new Map((await readVault(env, user.id)).items.map((item) => [`${item.setId}/${item.productId}`, item.qty]));
  if (items.some((item) => (held.get(`${item.setId}/${item.productId}`) || 0) < item.qty)) error(short);
  for (const item of items) item.resolved = await resolveLine(env, request, item, deps);
  const packs = items.reduce((sum, item) => sum + item.resolved.packs * item.qty, 0);
  if (packs > ORDER_LIMITS.maxOpenPacks) {
    error(`You can open up to ${ORDER_LIMITS.maxOpenPacks} packs at once (that is ${packs}). Open fewer.`);
  }

  const now = Date.now();
  const { plan, result } = await planOpen(env, request, user.id, items, deps, now);
  const order = {
    id: newOrderId(),
    request_id: requestId,
    kind: "open",
    fingerprint,
    cost_cents: 0,
    status: "paid",
    plan: JSON.stringify(plan),
    result: JSON.stringify(result),
  };
  const list = JSON.stringify(items.map((item) => [item.setId, item.productId, item.qty]));
  const match = "json_extract(j.value, '$[0]') = sealed_vault.set_id AND json_extract(j.value, '$[1]') = sealed_vault.product_id";
  const insert = env.DB.prepare(
    `INSERT INTO sealed_orders (id, user_id, request_id, kind, fingerprint, cost_cents, coins_after, status, plan, result, created_at, done_at)
     VALUES (?, ?, ?, 'open', ?, 0, MAX(ROUND((SELECT coins FROM profiles WHERE user_id = ?), 2), 0), 'paid', ?, ?, ?, NULL)`
  ).bind(order.id, user.id, requestId, fingerprint, user.id, order.plan, order.result, now);
  const stmts = [
    // A product no longer kept gets a row at 0 first, so taking from it trips CHECK(qty >= 0) like any shortfall.
    env.DB.prepare(
      `INSERT INTO sealed_vault (user_id, set_id, product_id, qty, first_at, last_at)
       SELECT ?, json_extract(value, '$[0]'), json_extract(value, '$[1]'), 0, ?, ? FROM json_each(?) WHERE true
       ON CONFLICT(user_id, set_id, product_id) DO NOTHING`
    ).bind(user.id, now, now, list),
    env.DB.prepare(
      `UPDATE sealed_vault SET qty = qty - (SELECT json_extract(j.value, '$[2]') FROM json_each(?) AS j WHERE ${match})
       WHERE user_id = ? AND EXISTS (SELECT 1 FROM json_each(?) AS j WHERE ${match})`
    ).bind(list, user.id, list),
    env.DB.prepare("DELETE FROM sealed_vault WHERE user_id = ? AND qty = 0").bind(user.id),
  ];
  return commit(env, user.id, order, insert, stmts, short, deps);
}

/** Routes for /api/vault, /api/cart/checkout and /api/orders/<requestId>. */
export async function handleOrders(path, method, request, env, deps) {
  const { json, requireUser, readJson } = deps;
  const route =
    path === "/api/vault" && method === "GET" ? "vault"
    : path === "/api/cart/checkout" && method === "POST" ? "checkout"
    : path === "/api/vault/open" && method === "POST" ? "open"
    : path.startsWith("/api/orders/") && method === "GET" ? "order"
    : null;
  if (!route) return json({ error: "Not found." }, 404);
  const auth = await requireUser(request, env);
  if (auth.response) return auth.response;
  const user = auth.user;
  try {
    return await withSchema(env, async () => {
      if (route === "vault") {
        await resumeStale(env, user.id);
        return json(await readVault(env, user.id));
      }
      if (route === "order") {
        const requestId = decodeURIComponent(path.slice("/api/orders/".length));
        if (!ORDER_LIMITS.requestIdPattern.test(requestId)) return json({ error: "Order not found." }, 404);
        const order = await findOrder(env, user.id, requestId);
        if (!order) return json({ error: "Order not found." }, 404);
        return respond(env, user.id, order, true, deps);
      }
      const body = await readJson(request);
      if (!body) return json({ error: "Expected JSON." }, 400);
      return route === "checkout" ? checkout(env, request, user, body, deps) : openKept(env, request, user, body, deps);
    });
  } catch (err) {
    if (err?.status && err.status < 500) return json({ error: err.message, ...(err.extra || {}) }, err.status);
    throw err;
  }
}
