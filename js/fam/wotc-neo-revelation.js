/**
 * Holo family wotc-neo-revelation: Neo Revelation (neo3) holos.
 *
 * Scope: neo3 Rare Holo 1-14 (the two Shinings belong to wotc-shining).
 *
 * Part of the older-era holo remaster (2026-10-01; js/holo-fam.js lists every family, first claim wins). This module
 * decides which card faces are this family's and returns what to add to the face foilExtras() built: the class
 * `fam-wotc-neo-revelation` (every rule in css/holo/fam/wotc-neo-revelation.css is scoped to it), the family's own
 * custom properties (per-card maps as `url('...')` through `url()`, which makes a repo path absolute). `base` is
 * foilExtras()'s own result for the same face; a custom property set here comes after the era's in the style attribute.
 * Never import js/foil-maps.js from here (it waits on this module).
 *
 * Every face has its own two maps, drawn from its own scan by
 * .claude/skills/card-textures/scripts/fam/wotc-neo-revelation/make_neo3_maps.py:
 * `<n>-area-v1.webp` (alpha: the foil area, the window's dark background with the Pokemon, the painted-on-white parts, the
 * badge and the frame cut out; RGB white; the foil layers use it as their mask) and `<n>-fleck-v1.webp` (alpha: the cosmos
 * elements; RGB: each element's colour). A face without maps is left to the era recipe. A changed map gets a new -vN name
 * (assets are cached for a year).
 */
import { isWotc, wotcPattern } from "../wotc-foil.js?v=6";

const set = (card) => String(card?.id || "").split("-")[0];
const num = (card) => String(card?.id || "").split("-")[1] || "";
const has = (pattern, cls) => ` ${pattern || ""} `.includes(` ${cls} `);
const DIR = "assets/foil/fam/wotc-neo-revelation/";
const MAPS = { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1, 8: 1, 9: 1, 10: 1, 11: 1, 12: 1, 13: 1, 14: 1 };

/** Whether a card face is this family's: the fourteen neo3 Rare Holo faces with maps. */
export function claims(card) {
  return Boolean(card) && !card.reverse && isWotc(card) && set(card) === "neo3" && has(wotcPattern(card), "wotc-cosmos")
    && MAPS[num(card)] > 0;
}

export function famExtras(card, url, base) {
  if (!claims(card)) return null;
  const n = num(card);
  const v = MAPS[n];
  return {
    classes: "fam-wotc-neo-revelation",
    style: `--nr-area:url('${url(`${DIR}${n}-area-v${v}.webp`)}');--nr-fleck:url('${url(`${DIR}${n}-fleck-v${v}.webp`)}')`,
    cure: false,
  };
}
