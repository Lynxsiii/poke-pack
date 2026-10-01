/**
 * MINIMAL STAND-IN written by the perks-and-gates agent (A2) so the gates and
 * perks run on their own. Agent A1's fuller worker/xp.js (syncXp, claimLevels)
 * replaces this file on merge; the lead keeps the `playerLevel` and
 * `ensureXpSchema` signatures used by worker/perks.js and the route files.
 */
import { levelFromXp } from "../js/xp.js";

/** Same statement as the player_xp table in the contract (lazy, like worker/stats.js). */
const DDL = "CREATE TABLE IF NOT EXISTS player_xp (user_id TEXT PRIMARY KEY, xp INTEGER NOT NULL DEFAULT 0, claimed_level INTEGER NOT NULL DEFAULT 1)";

let schemaReady = false;
export async function ensureXpSchema(env) {
  if (schemaReady) return;
  await env.DB.exec(`${DDL};`);
  schemaReady = true;
}

/** The level the stored XP high-water mark puts a player at (1 for a player with no row yet). */
export async function playerLevel(env, userId) {
  await ensureXpSchema(env);
  const row = await env.DB.prepare("SELECT xp FROM player_xp WHERE user_id = ?").bind(userId).first();
  return levelFromXp(row?.xp || 0).level;
}
