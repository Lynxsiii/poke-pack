/**
 * Level badge and avatar frame markup. Pure string builders, no DOM, so the
 * Worker tests and every list on the site can call them. The look lives in
 * css/pages/frames.css.
 *
 *   levelBadgeHtml(level, {size})        a small square stamp with the level
 *   frameHtml(avatarHtml, frameId, {size, online})   a frame around any avatar
 *   userFrame(user)                      which frame a user wears, or null
 *
 * `avatarHtml` is markup the caller already built and escaped; it is passed
 * through untouched. Everything else that reaches the output is a number or a
 * value picked from a fixed list, so nothing a user typed can land in it.
 */
import { FRAMES, LEVEL_CAP, frameForLevel, frameInfo, frameNeed, frameOpen } from "./levels.js";

const SIZES = ["xs", "sm", "md", "lg", "xl"];
/** Frames that carry a gem on the rim and a moving glint. Bronze and silver are plain metal. */
const GEM = new Set(["gold", "platinum", "prismatic", "legend"]);

/** Avatar sizes in px, upper bound of each step: 22px chat faces up to 100px+ profile faces. */
function sizeStep(size) {
  if (typeof size === "number" || /^\d+(\.\d+)?(px)?$/.test(String(size))) {
    const px = parseFloat(size);
    if (!(px > 0)) return "md";
    return px <= 28 ? "xs" : px <= 44 ? "sm" : px <= 72 ? "md" : px <= 104 ? "lg" : "xl";
  }
  return SIZES.includes(size) ? size : "md";
}

/** A whole level from 1 to LEVEL_CAP, or null when the value is not a usable level. */
function wholeLevel(level) {
  if (level === null || level === undefined || level === "" || typeof level === "boolean") return null;
  const n = Math.floor(Number(level));
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.min(LEVEL_CAP, n);
}

/**
 * The frame a user wears: the id the server sends in `frame` (equipped, or the
 * best earned), else the best frame for their level. A user with neither has
 * no frame, so a list row that carries no level draws exactly as before.
 */
export function userFrame(user) {
  if (!user) return null;
  if (frameInfo(user.frame)) return user.frame;
  const level = wholeLevel(user.level);
  return level ? frameForLevel(level) : null;
}

/**
 * Wrap an avatar in its frame. An unknown or missing frame id returns the
 * avatar unchanged, so callers never have to check first. The frame is drawn
 * by CSS around whatever box the avatar already has and scales with it;
 * `size` (a step name or a pixel width) only decides how much detail to draw.
 * `online` adds the live mark that the avatar's own ring would have carried.
 * `color` is the avatar's ring colour as a hex, used for the gem on gold and up.
 */
export function frameHtml(avatarHtml, frameId, { size = "md", online = false, color = "" } = {}) {
  const avatar = String(avatarHtml ?? "");
  if (!frameInfo(frameId)) return avatar;
  const step = sizeStep(size);
  const rich = GEM.has(frameId);
  const gem = /^#[0-9a-f]{3,8}$/i.test(String(color)) ? ` style="--gem:${color}"` : "";
  return `<span class="lvl-frame" data-frame="${frameId}" data-s="${step}"${gem}>${avatar}<i class="lf-ring" aria-hidden="true"></i>${
    rich ? `<i class="lf-sheen" aria-hidden="true"></i><i class="lf-gem" aria-hidden="true"></i>` : ""
  }${online ? `<i class="lf-on" aria-hidden="true"></i>` : ""}</span>`;
}

/**
 * A square stamp with the level in it, coloured like the frame that level
 * wears. Below level 5 there is no frame, so the stamp is plain. Returns an
 * empty string when there is no level, so a row that has none stays as it was.
 * `prestige` (1 to 10) adds a gold star with the count on the stamp's corner,
 * and a prestiged stamp keeps the top tier's colour.
 */
export function levelBadgeHtml(level, { size = "md", prestige = 0 } = {}) {
  const n = wholeLevel(level);
  if (!n) return "";
  const stars = Math.max(0, Math.min(10, Math.floor(Number(prestige) || 0)));
  const tier = stars ? "legend" : frameForLevel(n) || "none";
  const step = SIZES.includes(size) ? size : "md";
  const label = `Level ${n}${stars ? `, prestige ${stars}` : ""}`;
  const badge = (attrs) => `<span class="lvl-badge" data-frame="${tier}" data-s="${step}" data-n="${String(n).length}"${attrs}><span class="lb-n" aria-hidden="true">${n}</span></span>`;
  if (!stars) return badge(` role="img" aria-label="${label}" title="${label}"`);
  // The star sits outside the stamp: the top tiers clip the stamp to its shape.
  return `<span class="lvl-badge-p" data-s="${step}" role="img" aria-label="${label}" title="${label}">${badge(` aria-hidden="true"`)}<span class="lb-star" aria-hidden="true">${stars}</span></span>`;
}

/**
 * The frame chooser in the Look tab: a flat tile per frame wearing the
 * player's own avatar, locked ones dimmed with the level they open at, and
 * Auto first (always the best frame earned). `frame` is the equipped id, or
 * empty for Auto. `avatar` is the finished avatar markup, drawn at the same
 * size in every tile.
 */
export function framePicksHtml({ level, prestige = 0, frame, avatar, color = "" }) {
  const lv = wholeLevel(level) || 1;
  const best = frameForLevel(lv);
  const equipped = frameInfo(frame) ? frame : "";
  const art = (id) => `<span class="frame-pick-art">${id ? frameHtml(avatar, id, { size: "md", color }) : avatar}</span>`;
  const auto = `<button type="button" class="frame-pick${equipped ? "" : " on"}" data-set-frame="" aria-pressed="${!equipped}">${art(best)}<b>Auto</b><small>${
    best ? `Wears ${frameInfo(best).name}` : `A frame opens at level ${FRAMES[0].level}`
  }</small></button>`;
  const tiles = FRAMES.map((f) => {
    const locked = !frameOpen(f, lv, prestige);
    const on = equipped === f.id;
    return `<button type="button" class="frame-pick${on ? " on" : ""}${locked ? " locked" : ""}" ${
      locked ? `data-frame-locked="${f.id}" aria-disabled="true"` : `data-set-frame="${f.id}" aria-pressed="${on}"`
    }>${art(f.id)}<b>${f.name}</b><small>${frameNeed(f)}</small></button>`;
  }).join("");
  return `<div class="frame-picks" role="group" aria-label="Avatar frame">${auto}${tiles}</div>`;
}

export { FRAMES };
