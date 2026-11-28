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
 * The foil map is the card's own (assets/foil/fam/dp-lvx/<id>.webp, 2026-11-28): alpha = the era frame map (border, strips, art
 * window, rule boxes; assets/foil/dp-special/lvx.webp, lvx-sp.webp) MINUS the Pokemon, which is matte ink on the real card and
 * breaks out of the window; RGB = the cosmos flecks of that card's scan. Drawn by scripts/make_figure_masks.py (the Pokemon, from
 * the scan's foil grain and SAM2) and scripts/make_cosmos_flecks.py --family dp-lvx. A face without a map is not claimed and
 * keeps the era look. The look is the sheet's.
 */
import { isDp, dpPattern } from "../dp-foil.js?v=3";

const has = (pattern, cls) => ` ${pattern || ""} `.includes(` ${cls} `);

// The faces that have a map (make_cosmos_flecks.py prints this list).
const MAPPED = new Set("dp1-120 dp1-121 dp1-122 dp1-dpp09 dp1-dpp10 dp1-dpp11 dp2-121 dp2-122 dp2-123 dp2-dpp12 dp3-131 dp3-132 dp4-103 dp4-104 dp4-105 dp4-106 dp4-dpp17 dp4-dpp18 dp4-dpp19 dp5-100 dp5-97 dp5-98 dp5-99 dp6-140 dp6-141 dp6-142 dp6-143 dp6-144 dp6-145 dp6-146 dp7-100 dp7-96 dp7-97 dp7-98 dp7-99 dp7-dpp28 dp7-dpp29 dp7-dpp30 dp7-dpp31 pl1-122 pl1-123 pl1-124 pl1-125 pl1-126 pl1-127 pl1-dpp37 pl1-dpp38 pl1-dpp39 pl2-103 pl2-104 pl2-105 pl2-106 pl2-107 pl2-108 pl2-109 pl2-110 pl2-111 pl3-141 pl3-142 pl3-143 pl3-144 pl3-145 pl3-146 pl3-147 pl3-dpp45 pl3-dpp46 pl3-dpp47 pl4-94 pl4-95 pl4-96 pl4-97 pl4-98 pl4-99 pl4-dpp53 pl4-dpp56".split(" "));

/** Whether a card face is this family's. */
export function claims(card) {
  return Boolean(card) && !card.reverse && isDp(card) && has(dpPattern(card), "dp-lvx") && MAPPED.has(String(card.id));
}

export function famExtras(card, url, base) {
  if (!claims(card)) return null;
  return { classes: "fam-dp-lvx has-foil-map", style: `--foil-map:url('${url(`assets/foil/fam/dp-lvx/${card.id}.webp`)}')`, cure: false };
}
