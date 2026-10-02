/**
 * Holo family wotc-neo-destiny: Neo Destiny (neo4) holos.
 *
 * Scope: neo4 Rare Holo including Miracle Energy 16 (the eight Shinings belong to wotc-shining).
 *
 * Part of the older-era holo remaster (2026-10-01; js/holo-fam.js lists every family, first claim wins). This module
 * decides which card faces are this family's and returns what to add to the face foilExtras() built: the class
 * `fam-wotc-neo-destiny` (every rule in css/holo/fam/wotc-neo-destiny.css is scoped to it), any finer classes, the family's own
 * custom properties (per-card maps as `url('...')` through `url()`, which makes a repo path absolute) and `cure: true` to
 * get the extra `.cure` layer. `base` is foilExtras()'s own result ({ classes, style, cure }) for the same face, so a
 * family can read what the era module decided; a custom property set here comes after the era's in the style
 * attribute, so it wins (`--foil-map` included). `card` has been through foilLook(), so a promo's rarity is its foilAs.
 * Never import js/foil-maps.js from here (it waits on this module).
 */
import { isWotc, wotcPattern } from "../wotc-foil.js?v=6";

const set = (card) => String(card?.id || "").split("-")[0];
const num = (card) => String(card?.id || "").split("-")[1] || "";
const has = (pattern, cls) => ` ${pattern || ""} `.includes(` ${cls} `);

/* Every face has its own two maps, drawn from its own scan by
   .claude/skills/card-textures/scripts/fam/wotc-neo-destiny/make_nd_maps.py (reference/fam-wotc-neo-destiny.md):
   `<n>-area-v2.webp` (alpha: the window's background, the Pokemon, badge and frame cut out; RGB: white;
   the foil layers use it as their mask) and `<n>-fleck-v2.webp` (alpha: the cosmos elements; RGB: each element's colour). A face without maps (none
   today) is left to the era recipe. A changed map gets a new -vN name (assets are cached for a year). */
const DIR = "assets/foil/fam/wotc-neo-destiny/";
const MAPS = { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 2, 8: 2, 9: 2, 10: 2, 11: 2, 12: 2, 13: 2, 14: 2, 15: 2, 16: 2 };

/** Whether a card face is this family's: the sixteen neo4 Rare Holo faces (Miracle Energy 16 included) with maps. */
export function claims(card) {
  return Boolean(card) && !card.reverse && isWotc(card) && set(card) === "neo4" && has(wotcPattern(card), "wotc-cosmos")
    && MAPS[num(card)] > 0;
}

export function famExtras(card, url, base) {
  if (!claims(card)) return null;
  const n = num(card);
  const v = MAPS[n];
  const energy = card.supertype === "Energy" || Boolean(card.energy);
  return {
    classes: `fam-wotc-neo-destiny ${energy ? "nd-energy" : "nd-window"}`,
    style: `--nd-area:url('${url(`${DIR}${n}-area-v${v}.webp`)}');--nd-fleck:url('${url(`${DIR}${n}-fleck-v${v}.webp`)}')`,
    cure: false,
  };
}
