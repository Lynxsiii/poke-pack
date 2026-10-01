/**
 * XP and level rewards on the server (rules: js/xp.js and js/levels.js).
 *
 * player_xp keeps one row per player: `xp`, the high-water mark of the XP the
 * save has ever been worth, and `claimed_level`, the highest level already paid.
 * Nothing here trusts the client: XP is worked out from the stored save on every
 * read (syncXp), and a claim reads the level from there, never from a request.
 *
 * The table is created on demand (nobody can run remote D1 migrations from a
 * session); worker/migrations/0023_player_xp.sql holds the same DDL.
 */
import { LEVEL_CAP, levelFromXp, xpSummary } from "../js/xp.js";
import { levelPayout } from "../js/levels.js";
import { gearItem } from "../js/gear.js";
import { ensureGearSchema, loadGearCatalog } from "./gear.js";
import { ensureGradingSchema } from "./grading.js";

const DDL =
  "CREATE TABLE IF NOT EXISTS player_xp (user_id TEXT PRIMARY KEY, xp INTEGER NOT NULL DEFAULT 0, claimed_level INTEGER NOT NULL DEFAULT 1, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)";

let schemaReady = false;

/** Tests only: forget the per-isolate cache so another database is checked. */
export function resetXpSchemaCache() {
  schemaReady = false;
}

/** Resolves true once player_xp exists; false (and retried next call) if it cannot be made. */
export async function ensureXpSchema(env) {
  if (schemaReady) return true;
  try {
    await env.DB.exec(`${DDL};`);
    schemaReady = true;
    return true;
  } catch (err) {
    console.error("ensureXpSchema", err);
    return false;
  }
}

function isMissing(err) {
  const msg = String(err?.message || err).toLowerCase();
  return msg.includes("no such table") || msg.includes("no such column");
}

const whole = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

/** Statements that wipe a player's XP (account reset and deletion). */
export function clearXpStmts(env, userId) {
  return [env.DB.prepare("DELETE FROM player_xp WHERE user_id = ?").bind(userId)];
}

/**
 * Counters that live in tables other than player_stats, counted at READ time
 * with simple indexed queries (never triggers: a trigger once broke battles).
 * Every one of them is XP, so each is limited to what cannot be farmed:
 *
 *   casinoPlayed / casinoWon  settled coinflips and jackpots against real
 *                             people, and the ones the player won. A flip with
 *                             the house (bot) and a pot with fewer than two
 *                             human entries do not count. Only games since the
 *                             account (re)started, `profiles.created_at`, which
 *                             a reset moves forward; read by subquery so there
 *                             is no second round trip.
 *   graded / gemMint          slabs the player sent to grading and still holds
 *                             or sold ('slabbed', 'sold'). A cracked slab does
 *                             not count (a regrade would multiply it) and a slab
 *                             won in the casino ("won:<id>" request ids) is not
 *                             the winner's grading.
 *
 * A table that does not exist yet reads as zero.
 */
const SINCE = "COALESCE((SELECT created_at FROM profiles WHERE user_id = ?1), 0)";
export async function loadXpCounters(env, userId) {
  const run = async (sql) => {
    try {
      return (await env.DB.prepare(sql).bind(userId).first()) || {};
    } catch (err) {
      if (!isMissing(err)) throw err;
      return {};
    }
  };
  try {
    await ensureGradingSchema(env);
  } catch {
    /* the graded count below reads as zero if the table is missing */
  }
  const [flips, pots, graded] = await Promise.all([
    run(
      `SELECT
         (SELECT COUNT(*) FROM coinflips WHERE host_id = ?1 AND status = 'done' AND bot = 0 AND guest_id != 'house' AND flipped_at >= ${SINCE})
         + (SELECT COUNT(*) FROM coinflips WHERE guest_id = ?1 AND status = 'done' AND bot = 0 AND flipped_at >= ${SINCE}) AS played,
         (SELECT COUNT(*) FROM coinflips WHERE host_id = ?1 AND status = 'done' AND bot = 0 AND guest_id != 'house' AND winner = 'host' AND flipped_at >= ${SINCE})
         + (SELECT COUNT(*) FROM coinflips WHERE guest_id = ?1 AND status = 'done' AND bot = 0 AND winner = 'guest' AND flipped_at >= ${SINCE}) AS won`
    ),
    run(
      `SELECT COUNT(*) AS played, COALESCE(SUM(j.winner_seat = e.seat), 0) AS won
       FROM jackpot_entries e JOIN jackpots j ON j.id = e.jackpot_id
       WHERE e.user_id = ?1 AND j.status = 'done' AND j.drawn_at >= ${SINCE}
         AND (SELECT COUNT(*) FROM jackpot_entries h WHERE h.jackpot_id = j.id AND h.user_id IS NOT NULL) >= 2`
    ),
    run(
      `SELECT COUNT(*) AS n, COALESCE(SUM(grade = 10), 0) AS gem FROM graded_cards
       WHERE user_id = ?1 AND status IN ('slabbed', 'sold') AND request_id NOT LIKE 'won:%'`
    ),
  ]);
  return {
    casinoPlayed: whole(flips.played) + whole(pots.played),
    casinoWon: whole(flips.won) + whole(pots.won),
    graded: whole(graded.n),
    gemMint: whole(graded.gem),
  };
}

/** The stored row { xp, claimedLevel }, or null (also when the table cannot be had). */
export async function readXpRow(env, userId) {
  if (!(await ensureXpSchema(env))) return null;
  try {
    return (await env.DB.prepare("SELECT xp, claimed_level AS claimedLevel FROM player_xp WHERE user_id = ?").bind(userId).first()) || null;
  } catch (err) {
    if (isMissing(err)) return null;
    throw err;
  }
}

const claimableOf = (claimedLevel, level) => {
  const out = [];
  for (let lv = Math.max(2, claimedLevel + 1); lv <= level; lv += 1) out.push(lv);
  return out;
};

/**
 * Work out the player's XP from `save` (the object loadSave is building: it
 * needs packsOpened, claimed, collection/graded and stats), raise the stored
 * high-water mark if the save is worth more, and return the summary the client
 * draws from, plus what is waiting to be claimed:
 *   { ...xpSummary, claimedLevel, claimable:[levels], pending:{ coins, gear, levels } }
 * `row` may be passed when the caller already read it (readXpRow). Never throws
 * for a missing table: the summary then simply has nothing claimable.
 */
export async function syncXp(env, userId, save, row = undefined) {
  const ready = await ensureXpSchema(env);
  const stored = row === undefined ? (ready ? await readXpRow(env, userId) : null) : row;
  const summary = xpSummary(save, stored?.xp || 0);
  if (ready && (!stored || summary.total > stored.xp)) {
    try {
      // One statement; MAX keeps the mark monotonic when two reads race.
      await env.DB.prepare(
        `INSERT INTO player_xp (user_id, xp) VALUES (?, ?)
         ON CONFLICT(user_id) DO UPDATE SET xp = MAX(xp, excluded.xp)`
      )
        .bind(userId, summary.total)
        .run();
    } catch (err) {
      if (!isMissing(err)) throw err;
    }
  }
  const claimedLevel = Math.max(1, Math.min(LEVEL_CAP, whole(stored?.claimedLevel) || 1));
  const claimable = ready ? claimableOf(claimedLevel, summary.level) : [];
  const payout = claimable.length ? levelPayout(claimable[0], summary.level) : { coins: 0, gear: [] };
  return {
    ...summary,
    claimedLevel,
    claimable,
    pending: { coins: payout.coins, gear: payout.gear, levels: claimable.length },
  };
}

/**
 * { xp, level } from the stored mark. A player with no row yet (they have not
 * loaded their save since levels shipped) is worked out once from their whole
 * save when `helpers.loadSave` is given, so a veteran is never gated out of
 * what they already use; without it they read as level 1.
 */
export async function playerXp(env, userId, helpers = {}) {
  let row = await readXpRow(env, userId);
  if (!row && typeof helpers.loadSave === "function") {
    try {
      const save = await helpers.loadSave(env, userId);
      if (save?.xp) return { xp: save.xp.total, level: save.xp.level };
    } catch (err) {
      console.error("playerXp", err);
    }
    row = await readXpRow(env, userId);
  }
  const xp = whole(row?.xp);
  return { xp, level: levelFromXp(xp).level };
}

/** The player's level, from the stored mark only (cheap; for gates and profiles). 1 when unknown. */
export async function playerLevel(env, userId, helpers = {}) {
  return (await playerXp(env, userId, helpers)).level;
}

/**
 * Pay every unclaimed level up to the current one, exactly once.
 *
 * The level comes from the server's own copy of the save. The first statement
 * of the batch moves claimed_level forward only if it still holds the value
 * this request read (compare-and-swap); the coin credit and the gifts are tied
 * to that statement through changes(), so a request that lost the race changes
 * nothing. Returns { save, paid:{ levels, coins, gear } }; a request with
 * nothing to pay (a double click, the loser of a race) answers with an empty
 * `paid.levels`. On failure returns { error, status }.
 *
 * helpers: { request, loadSave, maxCoins }
 */
export async function claimLevels(env, userId, { request, loadSave, maxCoins = 1_000_000 }) {
  const empty = (save) => ({ save, paid: { levels: [], coins: 0, gear: [] } });
  if (!(await ensureXpSchema(env))) return { error: "Levels are being prepared. Try again shortly.", status: 503 };
  const before = await loadSave(env, userId);
  const xp = before?.xp;
  if (!xp || !xp.claimable?.length) return empty(before);

  const levels = xp.claimable;
  const target = levels[levels.length - 1];
  const payout = levelPayout(levels[0], target);
  const now = Date.now();

  // Only gifts the catalogue knows, as grantGear does. But if the catalogue itself
  // did not load, nothing is known and the claim must not advance past a gift it
  // cannot hand over: answer 503 and let the player try again.
  await ensureGearSchema(env);
  const catalog = await loadGearCatalog(env, request);
  const loaded = Object.keys(catalog?.sleeves || {}).length + Object.keys(catalog?.coins || {}).length > 0;
  if (payout.gear.length && !loaded) return { error: "Gifts are unavailable right now. Try again shortly.", status: 503 };
  const gear = payout.gear.filter((item) => gearItem(catalog, item.kind, item.id));
  const counts = new Map();
  for (const item of gear) counts.set(`${item.kind}:${item.id}`, (counts.get(`${item.kind}:${item.id}`) || 0) + 1);
  const gifts = [...counts].map(([key, qty]) => {
    const [kind, ...id] = key.split(":");
    return { kind, id: id.join(":"), qty };
  });

  const stmts = [
    env.DB.prepare("UPDATE player_xp SET claimed_level = ? WHERE user_id = ? AND claimed_level = ?").bind(target, userId, xp.claimedLevel),
    env.DB.prepare(
      // Never lowers a wallet that is already over the cap (sales and winnings can push past it);
      // `granted` counts only what was credited. Every right-hand side reads the old coins.
      `UPDATE profiles SET coins = MAX(coins, MIN(coins + ?1, ?2)),
         granted = granted + (MAX(coins, MIN(coins + ?1, ?2)) - coins)
       WHERE user_id = ?3 AND changes() = 1`
    ).bind(payout.coins, maxCoins, userId),
  ];
  if (gifts.length) {
    // changes() is the coin update's: 1 only for the request that won the swap.
    stmts.push(
      env.DB.prepare(
        `INSERT INTO user_gear (user_id, kind, item_id, qty, first_at, last_at)
         SELECT ?, json_extract(value, '$.kind'), json_extract(value, '$.id'), json_extract(value, '$.qty'), ?, ?
         FROM json_each(?) WHERE changes() = 1
         ON CONFLICT(user_id, kind, item_id) DO UPDATE SET qty = user_gear.qty + excluded.qty, last_at = excluded.last_at`
      ).bind(userId, now, now, JSON.stringify(gifts))
    );
  }
  const results = await env.DB.batch(stmts);
  const won = Boolean(results[0]?.meta?.changes);
  const save = await loadSave(env, userId);
  if (!won) return empty(save);
  const credited = Math.max(0, Math.min(payout.coins, maxCoins - whole(before.coins)));
  return { save, paid: { levels, coins: credited, gear: gear.map((item) => ({ kind: item.kind, id: item.id })) } };
}
