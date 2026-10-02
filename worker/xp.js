/**
 * XP and level rewards on the server (rules: js/xp.js and js/levels.js).
 *
 * player_xp keeps one row per player:
 *   xp2        the high-water mark of the XP this prestige cycle has been worth
 *   claimed2   the highest level already paid this cycle
 *   prestige   prestige stars (0 to PRESTIGE_CAP)
 *   cycle      JSON tallies (js/xp.js xpCounts) at the start of this cycle, null for the first
 *   original   the level a player had reached on the first curve (0 for anyone after it);
 *              unlocks count from it, and 100 there is the Original 100 title
 *   xp, claimed_level   the first curve's mark and claim (before October 2026); only
 *              read once, to move a row onto the new curve (upgradeLegacy)
 * Nothing here trusts the client: XP is worked out from the stored save on every
 * read (syncXp), and a claim reads the level from there, never from a request.
 *
 * The table is created on demand (nobody can run remote D1 migrations from a
 * session); worker/migrations/0023_player_xp.sql and 0033_prestige.sql hold the same DDL.
 */
import { LEGACY_CURVE, LEVEL_CAP, cleanCounts, levelFromXp, xpCounts, xpForLevel, xpSummary } from "../js/xp.js";
import { canPrestige, hourlyBonus, levelPayout, unlockLevel } from "../js/levels.js";
import { gearItem } from "../js/gear.js";
import { ensureGearSchema, loadGearCatalog } from "./gear.js";
import { ensureGradingSchema } from "./grading.js";

const DDL =
  "CREATE TABLE IF NOT EXISTS player_xp (user_id TEXT PRIMARY KEY, xp INTEGER NOT NULL DEFAULT 0, claimed_level INTEGER NOT NULL DEFAULT 1, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)";

/** Columns added for the second curve and prestige, as (name, ALTER): worker/migrations/0033_prestige.sql. */
export const XP_COLUMNS = [
  ["xp2", "ALTER TABLE player_xp ADD COLUMN xp2 INTEGER"],
  ["claimed2", "ALTER TABLE player_xp ADD COLUMN claimed2 INTEGER"],
  ["prestige", "ALTER TABLE player_xp ADD COLUMN prestige INTEGER NOT NULL DEFAULT 0"],
  ["cycle", "ALTER TABLE player_xp ADD COLUMN cycle TEXT"],
  ["original", "ALTER TABLE player_xp ADD COLUMN original INTEGER NOT NULL DEFAULT 0"],
];

/**
 * Noah's call on players who were at level 100 on the first curve. false: their
 * level is worked out again on the new curve (they keep what was paid and get
 * the Original 100 title). true: they are held at 100 and can prestige at once.
 */
export const KEEP_ORIGINALS_AT_CAP = false;

let schemaReady = false;
let schemaWork = null;

/** Tests only: forget the per-isolate cache so another database is checked. */
export function resetXpSchemaCache() {
  schemaReady = false;
  schemaWork = null;
}

/** Resolves true once player_xp and its columns exist; false (and retried next call) if they cannot be made. */
export async function ensureXpSchema(env) {
  if (schemaReady) return true;
  // Requests that arrive together share one upgrade, so two never race the same ALTER.
  if (!schemaWork) {
    schemaWork = (async () => {
      try {
        await env.DB.exec(`${DDL};`);
        const info = await env.DB.prepare("PRAGMA table_info(player_xp)").all();
        const have = new Set((info.results || []).map((row) => row.name));
        for (const [name, sql] of XP_COLUMNS) {
          if (have.has(name)) continue;
          try {
            await env.DB.exec(`${sql};`);
          } catch (err) {
            // Another isolate got there first.
            if (!/duplicate column/i.test(String(err?.message || err))) throw err;
          }
        }
        schemaReady = true;
        return true;
      } catch (err) {
        console.error("ensureXpSchema", err);
        return false;
      } finally {
        schemaWork = null;
      }
    })();
  }
  return schemaWork;
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
 *                             won in the casino ("won:<id>" request ids) or minted
 *                             from a bot's stake ("casino:<game>:<id>:<n>", fee 0)
 *                             is not the winner's grading.
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
       WHERE user_id = ?1 AND status IN ('slabbed', 'sold') AND request_id NOT LIKE 'won:%' AND request_id NOT LIKE 'casino:%'`
    ),
  ]);
  return {
    casinoPlayed: whole(flips.played) + whole(pots.played),
    casinoWon: whole(flips.won) + whole(pots.won),
    graded: whole(graded.n),
    gemMint: whole(graded.gem),
  };
}

/**
 * The stored row { xp, claimedLevel, xp2, claimed2, prestige, cycle, original },
 * or null (also when the table cannot be had). claimed2 is null on a row that has
 * not been moved onto the new curve yet.
 */
export async function readXpRow(env, userId) {
  if (!(await ensureXpSchema(env))) return null;
  try {
    return (
      (await env.DB.prepare(
        "SELECT xp, claimed_level AS claimedLevel, xp2, claimed2, prestige, cycle, original FROM player_xp WHERE user_id = ?"
      )
        .bind(userId)
        .first()) || null
    );
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
 * Move a row from the first curve onto the new one, once. The XP is worked out
 * afresh from the save (the old mark was in old weights); the levels already paid
 * stay paid up to the level the new curve gives, so nothing is paid twice, and
 * `original` keeps the level they had reached, so every frame, slot and title it
 * opened stays open (js/levels.js unlockLevel). The write is conditional on
 * claimed2 still being null, so two requests agree.
 */
async function upgradeLegacy(env, userId, save, stored) {
  const original = whole(stored.xp) > 0 ? levelFromXp(whole(stored.xp), LEGACY_CURVE).level : 0;
  const floor = KEEP_ORIGINALS_AT_CAP && original >= LEVEL_CAP ? xpForLevel(LEVEL_CAP) : 0;
  const summary = xpSummary(save, floor);
  const claimed2 = Math.max(1, Math.min(whole(stored.claimedLevel) || 1, summary.level));
  try {
    await env.DB.prepare(
      "UPDATE player_xp SET xp2 = MAX(COALESCE(xp2, 0), ?), claimed2 = ?, original = ? WHERE user_id = ? AND claimed2 IS NULL"
    )
      .bind(summary.total, claimed2, original, userId)
      .run();
  } catch (err) {
    if (!isMissing(err)) throw err;
  }
  return (await readXpRow(env, userId)) || { ...stored, xp2: summary.total, claimed2, original, prestige: 0, cycle: null };
}

/**
 * Work out the player's XP from `save` (the object loadSave is building: it
 * needs packsOpened, claimed, collection/graded and stats), raise the stored
 * high-water mark if the save is worth more, and return the summary the client
 * draws from, plus what is waiting to be claimed:
 *   { ...xpSummary, claimedLevel, claimable:[levels], pending:{ coins, gear, levels },
 *     prestige, canPrestige, original, peak, hourly }
 * `peak` is the level unlocks count from (js/levels.js unlockLevel); `original`
 * is true for the Original 100 title.
 * Everything is for the current prestige cycle. `row` may be passed when the
 * caller already read it (readXpRow). Never throws for a missing table: the
 * summary then simply has nothing claimable.
 */
export async function syncXp(env, userId, save, row = undefined) {
  const ready = await ensureXpSchema(env);
  let stored = row === undefined ? (ready ? await readXpRow(env, userId) : null) : row;
  if (ready && stored && stored.claimed2 == null) stored = await upgradeLegacy(env, userId, save, stored);
  const prestige = whole(stored?.prestige);
  const summary = xpSummary(save, whole(stored?.xp2), cleanCounts(stored?.cycle));
  if (ready && (!stored || summary.total > whole(stored.xp2))) {
    try {
      // One statement; MAX keeps the mark monotonic when two reads race, and a read that
      // started before a prestige (same row, fewer stars) cannot lift the fresh cycle.
      await env.DB.prepare(
        `INSERT INTO player_xp (user_id, xp, xp2, claimed2) VALUES (?1, 0, ?2, 1)
         ON CONFLICT(user_id) DO UPDATE SET xp2 = MAX(COALESCE(xp2, 0), excluded.xp2)
         WHERE player_xp.prestige = ?3 AND player_xp.claimed2 IS NOT NULL`
      )
        .bind(userId, summary.total, prestige)
        .run();
    } catch (err) {
      if (!isMissing(err)) throw err;
    }
  }
  const claimedLevel = Math.max(1, Math.min(LEVEL_CAP, whole(stored?.claimed2) || 1));
  const claimable = ready ? claimableOf(claimedLevel, summary.level) : [];
  const payout = claimable.length ? levelPayout(claimable[0], summary.level) : { coins: 0, gear: [] };
  return {
    ...summary,
    claimedLevel,
    claimable,
    pending: { coins: payout.coins, gear: payout.gear, levels: claimable.length },
    prestige,
    canPrestige: ready && canPrestige(summary.level, claimedLevel, prestige),
    original: whole(stored?.original) >= LEVEL_CAP,
    peak: unlockLevel(summary.level, prestige, whole(stored?.original)),
    hourly: hourlyBonus(summary.level, prestige),
  };
}

/**
 * { xp, level, prestige, peak } from the stored mark: `level` is the current one
 * (the badge), `peak` the one unlocks and gates count from. A player with no row
 * yet, or a row still on the first curve, is worked out once from their whole
 * save when `helpers.loadSave` is given, so a veteran is never gated out of
 * what they already use; without it they read as level 1.
 */
export async function playerXp(env, userId, helpers = {}) {
  let row = await readXpRow(env, userId);
  if ((!row || row.claimed2 == null) && typeof helpers.loadSave === "function") {
    try {
      const save = await helpers.loadSave(env, userId);
      if (save?.xp) return { xp: save.xp.total, level: save.xp.level, prestige: whole(save.xp.prestige), peak: save.xp.peak || save.xp.level };
    } catch (err) {
      console.error("playerXp", err);
    }
    row = await readXpRow(env, userId);
  }
  const xp = whole(row?.xp2);
  const level = levelFromXp(xp).level;
  const prestige = whole(row?.prestige);
  return { xp, level, prestige, peak: unlockLevel(level, prestige, whole(row?.original)) };
}

/**
 * The level unlocks and gates count from (the highest reached, js/levels.js
 * unlockLevel), from the stored mark only (cheap). 1 when unknown.
 */
export async function playerLevel(env, userId, helpers = {}) {
  return (await playerXp(env, userId, helpers)).peak;
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
 * helpers: { request, loadSave }
 */
export async function claimLevels(env, userId, { request, loadSave }) {
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
  // cannot hand over: answer 503 and let the player try again. (Levels give no
  // gifts since October 2026; this stays for when one comes back.)
  let gear = [];
  if (payout.gear.length) {
    await ensureGearSchema(env);
    const catalog = await loadGearCatalog(env, request);
    const loaded = Object.keys(catalog?.sleeves || {}).length + Object.keys(catalog?.coins || {}).length > 0;
    if (!loaded) return { error: "Gifts are unavailable right now. Try again shortly.", status: 503 };
    gear = payout.gear.filter((item) => gearItem(catalog, item.kind, item.id));
  }
  const counts = new Map();
  for (const item of gear) counts.set(`${item.kind}:${item.id}`, (counts.get(`${item.kind}:${item.id}`) || 0) + 1);
  const gifts = [...counts].map(([key, qty]) => {
    const [kind, ...id] = key.split(":");
    return { kind, id: id.join(":"), qty };
  });

  const stmts = [
    env.DB.prepare("UPDATE player_xp SET claimed2 = ? WHERE user_id = ? AND claimed2 = ? AND prestige = ?").bind(
      target,
      userId,
      xp.claimedLevel,
      whole(xp.prestige)
    ),
    env.DB.prepare(
      // No wallet cap: free coins never stop at a limit and never lower a wallet.
      "UPDATE profiles SET coins = coins + ?1, granted = granted + ?1 WHERE user_id = ?2 AND changes() = 1"
    ).bind(payout.coins, userId),
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
  return { save, paid: { levels, coins: payout.coins, gear: gear.map((item) => ({ kind: item.kind, id: item.id })) } };
}

/**
 * Prestige: from level 100 with every level claimed, go back to level 1 for a
 * star. The new cycle starts from the tallies in the server's own save (the
 * taper starts over too, js/xp.js computeXp), and the swap is conditional on
 * the stars and the claim this request read, so a double click prestiges once.
 * Returns { save, prestige } or { error, status }.
 */
export async function prestigeUp(env, userId, { loadSave }) {
  if (!(await ensureXpSchema(env))) return { error: "Levels are being prepared. Try again shortly.", status: 503 };
  const before = await loadSave(env, userId);
  const xp = before?.xp;
  if (!xp) return { error: "Levels are being prepared. Try again shortly.", status: 503 };
  if (!xp.canPrestige) {
    if (xp.level < LEVEL_CAP) return { error: `Reach level ${LEVEL_CAP} to prestige.`, status: 400 };
    if (xp.claimedLevel < LEVEL_CAP) return { error: "Claim your level rewards first.", status: 400 };
    return { error: "That is every prestige there is.", status: 400 };
  }
  const result = await env.DB.prepare(
    `UPDATE player_xp SET prestige = prestige + 1, xp2 = 0, claimed2 = 1, cycle = ?
     WHERE user_id = ? AND prestige = ? AND claimed2 = ?`
  )
    .bind(JSON.stringify(xpCounts(before)), userId, whole(xp.prestige), xp.claimedLevel)
    .run();
  const save = await loadSave(env, userId);
  if (!result.meta?.changes) return { save, prestige: whole(save?.xp?.prestige), already: true };
  return { save, prestige: whole(save?.xp?.prestige) };
}
