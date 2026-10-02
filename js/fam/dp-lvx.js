/**
 * Holo family dp-lvx: LV.X (Diamond & Pearl, Platinum).
 *
 * Scope: every `dp-lvx` print (dp1 to pl4 and the DP promos), SP LV.X and the five Arceus LV.X (pl4-94, 95, 96, dpp53, dpp56)
 * included: 75 faces. The Arceus frame has the same border, header and art window as the others (the era's map fits it, checked
 * over the scans); only its text box differs (printed silver rings, matte here like every LV.X text box).
 *
 * Part of the older-era holo remaster (2026-10-01; js/holo-fam.js lists every family, first claim wins). This module
 * decides which card faces are this family's and returns what to add to the face foilExtras() built: the class
 * `fam-dp-lvx` (every rule in css/holo/fam/dp-lvx.css is scoped to it), any finer classes, the family's own
 * custom properties (per-card maps as `url('...')` through `url()`, which makes a repo path absolute) and `cure: true` to
 * get the extra `.cure` layer. `base` is foilExtras()'s own result ({ classes, style, cure }) for the same face, so a
 * family can read what the era module decided; a custom property set here comes after the era's in the style
 * attribute, so it wins (`--foil-map` included). `card` has been through foilLook(), so a promo's rarity is its foilAs.
 * Never import js/foil-maps.js from here (it waits on this module).
 *
 * The foil map is the era's own (assets/foil/dp-special/lvx.webp, lvx-sp.webp via dpSpecialMap): alpha = border, strips,
 * art window and rule boxes, luminance = the art window (the cosmos confetti lights only there). The look is the sheet's.
 */
import { isDp, dpPattern } from "../dp-foil.js?v=3";

const has = (pattern, cls) => ` ${pattern || ""} `.includes(` ${cls} `);

/** Whether a card face is this family's. */
export function claims(card) {
  return Boolean(card) && !card.reverse && isDp(card) && has(dpPattern(card), "dp-lvx");
}

export function famExtras(card, url, base) {
  if (!claims(card)) return null;
  return { classes: "fam-dp-lvx", style: "", cure: false };
}
