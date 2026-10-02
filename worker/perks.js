/**
 * What a player's level lets them wear and show, checked on the server. The
 * numbers live in js/levels.js; this file only applies them. One rule runs
 * through all of it: nothing a player already saved is ever cut back. A check
 * refuses to ADD past the allowance (400 "Reach level N for more slots.") but a
 * list that is already longer than the allowance stays as it is and can be
 * reordered, swapped one for one, or shortened.
 */
import { bannerMotionLevel } from "../js/cosmetics.js";
import { BANNER_MOTION_NAMES, frameInfo, frameNeed, frameOpen, isExtraFrame, levelPerks, slotMessage } from "../js/levels.js";
import { playerLevel, playerXp } from "./xp.js";
import { ensureQuestSchema, maxStatStmt } from "./stats.js";

/**
 * { level, prestige, peak } from the stored mark (worker/xp.js playerXp), or
 * level 1 when it cannot be read (a failure here must not break /api/me).
 */
export async function standingOf(env, userId) {
  try {
    return await playerXp(env, userId);
  } catch (err) {
    console.error("standingOf", err);
    return { xp: 0, level: 1, prestige: 0, peak: 1 };
  }
}

/** The level unlocks count from (the highest reached), or 1 when it cannot be read. */
export async function levelOf(env, userId) {
  try {
    return await playerLevel(env, userId);
  } catch (err) {
    console.error("levelOf", err);
    return 1;
  }
}

/**
 * `level`, `prestige`, the equipped-or-best `frame` and the `perks` object, for
 * /api/me and the public profile. `row` is the users row: its `frame` column is
 * the choice (null means "the best my level has earned"). `standing` is
 * { level, prestige, peak } when the caller has it (a bare number is taken as
 * both the level and the peak); otherwise it is read.
 */
export async function levelFields(env, row, standing = null) {
  const s = typeof standing === "number" ? { level: standing, prestige: 0, peak: standing } : standing || (await standingOf(env, row.id));
  const perks = levelPerks(s.level, s.prestige, s.peak);
  const chosen = frameInfo(row.frame);
  return {
    level: perks.level,
    prestige: perks.prestige,
    // An extra Pokémon frame stays on once worn: it was checked when it was picked
    // (frameChoice), and the first ones were free for everyone.
    frame: chosen && (frameOpen(chosen, perks.unlockLevel, perks.prestige) || isExtraFrame(chosen.id)) ? chosen.id : null,
    perks,
  };
}

/**
 * A frame choice from PATCH /api/me: { value } (null = automatic) or { status, error, needLevel? }.
 * `level` is the level unlocks count from (levelOf).
 */
export function frameChoice(raw, level, prestige = 0, current = null) {
  if (raw == null || raw === "") return { value: null };
  const info = typeof raw === "string" ? frameInfo(raw) : null;
  if (!info) return { status: 400, error: "That frame does not exist." };
  if (!frameOpen(info, level, prestige) && !(isExtraFrame(info.id) && info.id === current)) {
    return { status: 403, error: `Reach ${frameNeed(info).toLowerCase()} to wear the ${info.name} frame.`, ...(info.level ? { needLevel: info.level } : {}) };
  }
  return { value: info.id };
}

/**
 * null when the player may switch to this banner. A motion earned by level is
 * refused below its level, unless the banner they already have uses the same
 * motion: a saved banner never changes under them.
 */
export function bannerMotionError(nextBanner, currentBanner, level) {
  const need = bannerMotionLevel(nextBanner);
  if (!need || level >= need) return null;
  if (bannerMotionLevel(currentBanner) === need && String(nextBanner).split(":")[0] === String(currentBanner).split(":")[0]) return null;
  const motion = String(nextBanner).split(":")[0];
  return { status: 403, error: `Reach level ${need} to use the ${BANNER_MOTION_NAMES[motion] || motion} banner.`, needLevel: need };
}

/**
 * null when `next` (the list being saved) may replace `existing`. Only a list
 * that grows past both the allowance and what is already saved is refused.
 * `kind` is "showcase", "slabs" or "pages".
 */
export function slotError(kind, level, existingCount, nextCount) {
  const perks = levelPerks(level);
  const allowance = kind === "showcase" ? perks.showcaseSlots : kind === "slabs" ? perks.shownSlabs : perks.binderPages;
  if (nextCount <= Math.max(allowance, existingCount)) return null;
  return { status: 400, error: slotMessage(kind, level), allowance };
}

/**
 * The most a player has had in a profile list at once ("showcase", "slabs" or
 * "pages"), kept as a bookkeeping counter in player_stats. Room to add is
 * max(level allowance, this peak): lists are edited one click at a time, so
 * without it a player whose saved list is longer than their level allows could
 * take one off and never put another on. Nobody gains room by it: the peak can
 * only come from a list that was already saved. Records `count`, returns the peak.
 */
export async function slotPeak(env, userId, kind, count) {
  const key = `_peak_${kind}`;
  try {
    if (!(await ensureQuestSchema(env))) return count;
    const row = await env.DB.prepare("SELECT value FROM player_stats WHERE user_id = ? AND key = ?").bind(userId, key).first();
    const stored = Number(row?.value) || 0;
    if (count > stored) await maxStatStmt(env, userId, key, count).run();
    return Math.max(stored, count);
  } catch (err) {
    console.error("slotPeak", err);
    return count;
  }
}
