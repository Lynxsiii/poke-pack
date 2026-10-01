/**
 * One-off coin restores, each paid exactly once.
 *
 * A restore is a row in RESTORES below. The first time that player loads their
 * save, one D1 batch credits the coins only while no receipt exists in coin_restores
 * (primary key = the restore id) and then writes that receipt, so it cannot
 * be paid twice, however often or however many times at once the save is read.
 * It is additive: coins are added to the current balance, nothing is overwritten.
 * `granted` is left alone because the coins were already counted when first earned.
 *
 * The table is created on demand (nobody can run remote D1 migrations from a
 * session); worker/migrations/0026_coin_restores.sql holds the same DDL.
 */
export const RESTORES = [
  {
    // The 2026-10-01 hourly-claim bug (PR #127) cut a wallet over 1,000,000 back to
    // exactly 1,000,000. Tivan's screen showed 1,612,959.58 just before the claim.
    id: "hourly-cap-2026-10-01-tivan",
    userId: "3171c5bb416907bc",
    coins: 612959.58,
    reason: "Hourly claim reset a 1,612,959.58 wallet to 1,000,000",
  },
];

const DDL =
  "CREATE TABLE IF NOT EXISTS coin_restores (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, coins REAL NOT NULL, reason TEXT NOT NULL, applied_at INTEGER NOT NULL)";

const done = new Set();

/** Pays this player any restore they are owed. Never throws: a failure only means the next load tries again. */
export async function applyRestores(env, userId) {
  const owed = RESTORES.filter((row) => row.userId === userId && !done.has(row.id));
  if (!owed.length) return;
  try {
    await env.DB.exec(`${DDL};`);
    for (const row of owed) {
      // Credit first, guarded by the receipt not existing; then write the receipt.
      // One batch is one transaction, so a second load sees the receipt and pays nothing.
      await env.DB.batch([
        env.DB.prepare(
          "UPDATE profiles SET coins = ROUND(coins + ?, 2) WHERE user_id = ? AND NOT EXISTS (SELECT 1 FROM coin_restores WHERE id = ?)"
        ).bind(row.coins, row.userId, row.id),
        env.DB.prepare("INSERT OR IGNORE INTO coin_restores (id, user_id, coins, reason, applied_at) VALUES (?, ?, ?, ?, ?)").bind(
          row.id,
          row.userId,
          row.coins,
          row.reason,
          Date.now()
        ),
      ]);
      done.add(row.id);
    }
  } catch (err) {
    console.error("applyRestores", err);
  }
}
