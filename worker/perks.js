/**
 * What a player's level lets them wear and show, checked on the server. The
 * numbers live in js/levels.js; this file only applies them. One rule runs
 * through all of it: nothing a player already saved is ever cut back. A check
 * refuses to ADD past the allowance (400 "Reach level N for more slots.") but a
 * list that is already longer than the allowance stays as it is and can be
 * reordered, swapped one for one, or shortened.
 */
import { bannerMotionLevel } from "../js/cosmetics.js";
import { BANNER_MOTION_NAMES, frameInfo, levelPerks, slotMessage } from "../js/levels.js";
import { playerLevel } from "./xp.js";

/** The stored level, or 1 when it cannot be read (a failure here must not break /api/me). */
export async function levelOf(env, userId) {
  try {
    return await playerLevel(env, userId);
  } catch (err) {
    console.error("levelOf", err);
    return 1;
  }
}

/**
 * `level`, the equipped-or-best `frame` and the `perks` object, for /api/me and
 * the public profile. `row` is the users row: its `frame` column is the choice
 * (null means "the best my level has earned").
 */
export async function levelFields(env, row, level = null) {
  const lv = level ?? (await levelOf(env, row.id));
  const perks = levelPerks(lv);
  const chosen = frameInfo(row.frame);
  return { level: lv, frame: chosen && lv >= chosen.level ? chosen.id : perks.frame, perks };
}

/** A frame choice from PATCH /api/me: { value } (null = automatic) or { status, error, needLevel? }. */
export function frameChoice(raw, level) {
  if (raw == null || raw === "") return { value: null };
  const info = typeof raw === "string" ? frameInfo(raw) : null;
  if (!info) return { status: 400, error: "That frame does not exist." };
  if (level < info.level) return { status: 403, error: `Reach level ${info.level} to wear the ${info.name} frame.`, needLevel: info.level };
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
