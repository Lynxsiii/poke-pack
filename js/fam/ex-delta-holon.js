/**
 * Holo family ex-delta-holon: Delta Species / Holon refractor holos and sheen Energy (EX era).
 *
 * Scope: only the Delta Species refractor faces listed in REDRAWN: the era silhouette (assets/foil/ex-delta/) is replaced by a
 * hand-steered GrabCut one drawn by .claude/skills/card-textures/scripts/fam/ex-delta-holon/make_delta_holon_maps.py. Every other
 * refractor face and the sheen Energy keep the era look.
 *
 * Part of the older-era holo remaster (2026-10-01; js/holo-fam.js lists every family, first claim wins). This module
 * decides which card faces are this family's and returns what to add to the face foilExtras() built: the class
 * `fam-ex-delta-holon` (every rule in css/holo/fam/ex-delta-holon.css is scoped to it), any finer classes, the family's own
 * custom properties (per-card maps as `url('...')` through `url()`, which makes a repo path absolute) and `cure: true` to
 * get the extra `.cure` layer. `base` is foilExtras()'s own result ({ classes, style, cure }) for the same face, so a
 * family can read what the era module decided; a custom property set here comes after the era's in the style
 * attribute, so it wins (`--foil-map` included). `card` has been through foilLook(), so a promo's rarity is its foilAs.
 * Never import js/foil-maps.js from here (it waits on this module).
 */
import { isEx, exPattern } from "../ex-foil.js?v=8";

/** The refractor faces whose era silhouette cuts the Pokémon short or spills onto the art; each has a redrawn map. */
const REDRAWN = new Set(["ex11-13", "ex13-12", "ex15-95"]);

const has = (pattern, cls) => ` ${pattern || ""} `.includes(` ${cls} `);

/** Whether a card face is this family's. */
export function claims(card) {
  return Boolean(card) && !card.reverse && isEx(card) && has(exPattern(card), "ex-refractor") && !has(exPattern(card), "ex-star") && REDRAWN.has(card.id);
}

export function famExtras(card, url, base) {
  if (!claims(card)) return null;
  // --foil-map is the era's silhouette variable (css/holo/ex-delta.css masks with it); the redrawn one replaces it.
  return { classes: "fam-ex-delta-holon", style: `--foil-map:url('${url(`assets/foil/fam/ex-delta-holon/${card.id}-v1.webp`)}')`, cure: false };
}
