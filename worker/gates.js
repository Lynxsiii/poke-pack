/**
 * Level gates. The pack battles, coinflip, jackpot and grading open at the
 * levels in js/levels.js (GATES). Two rules keep this from ever locking a
 * player out of something they already use:
 *   - anyone with a past game of that kind (one they hosted, a seat, a flip,
 *     a pot entry, a graded card) is let through at any level, so veterans see no change and a
 *     game in progress can always be finished;
 *   - only starting a new game, or joining someone else's as a first-timer,
 *     is checked. Reading, listing, cancelling, leaving, drawing, settling,
 *     selling winnings and collecting never call this.
 * Free bot play obeys the gate too: the gate is the casino, not the stake.
 */
import { GATES, gateMessage } from "../js/levels.js";
import { playerLevel } from "./xp.js";

/** One cheap "has this player ever done it" probe per gate. Bots (user_id NULL) never match. */
const USED = {
  battles: "SELECT 1 FROM battles WHERE host_id = ?1 UNION ALL SELECT 1 FROM battle_seats WHERE user_id = ?1 LIMIT 1",
  coinflip: "SELECT 1 FROM coinflips WHERE host_id = ?1 OR guest_id = ?1 LIMIT 1",
  jackpot: "SELECT 1 FROM jackpots WHERE host_id = ?1 UNION ALL SELECT 1 FROM jackpot_entries WHERE user_id = ?1 LIMIT 1",
  // Only a slab the player graded themselves: one won in a casino game ('won:<id>') or minted for them from a bot's stake ('casino:...') is not.
  grading: "SELECT 1 FROM graded_cards WHERE user_id = ? AND request_id NOT LIKE 'won:%' AND request_id NOT LIKE 'casino:%' LIMIT 1",
};

async function hasPlayed(env, key, userId) {
  try {
    return Boolean(await env.DB.prepare(USED[key]).bind(userId).first());
  } catch {
    return false; // the table does not exist yet, so nobody has played
  }
}

/**
 * null when the player may start or join a `key` game, otherwise the 403
 * Response `{ error, needLevel }`. `json` is helpers.json from the Worker.
 */
export async function gateResponse(env, json, userId, key) {
  const min = GATES[key];
  if (!min || min <= 1) return null;
  if (await hasPlayed(env, key, userId)) return null;
  let level = 1;
  try {
    level = await playerLevel(env, userId);
  } catch (err) {
    console.error("gateResponse", err); // an unreadable level must not shut the casino
    return null;
  }
  if (level >= min) return null;
  return json({ error: gateMessage(key), needLevel: min, level }, 403);
}
