/**
 * Holo family bw-ex-ace: Black & White Pokémon-EX and ACE SPEC.
 *
 * Scope: every `bw-ex` and `bw-ace` print.
 *
 * Part of the older-era holo remaster (2026-10-01; js/holo-fam.js lists every family, first claim wins). This module
 * decides which card faces are this family's and returns what to add to the face foilExtras() built: the class
 * `fam-bw-ex-ace` (every rule in css/holo/fam/bw-ex-ace.css is scoped to it), any finer classes, the family's own
 * custom properties (per-card maps as `url('...')` through `url()`, which makes a repo path absolute) and `cure: true` to
 * get the extra `.cure` layer. `base` is foilExtras()'s own result ({ classes, style, cure }) for the same face, so a
 * family can read what the era module decided; a custom property set here comes after the era's in the style
 * attribute, so it wins (`--foil-map` included). `card` has been through foilLook(), so a promo's rarity is its foilAs.
 * Never import js/foil-maps.js from here (it waits on this module).
 */
import { isBw, bwPattern } from "../bw-foil.js?v=8";

const has = (pattern, cls) => ` ${pattern || ""} `.includes(` ${cls} `);

/** Whether a card face is this family's: a Black & White regular-art Pokémon-EX (`bw-ex`) or ACE SPEC (`bw-ace`) print. */
export function claims(card) {
  if (!card || card.reverse || !isBw(card)) return false;
  const pattern = bwPattern(card);
  return has(pattern, "bw-ex") || has(pattern, "bw-ace");
}

/**
 * The three promo EX data/bw10.json has no foilMap for (BWP081 Thundurus-EX, BWP082 Deoxys-EX, BWP083 Lugia-EX) would draw on the generic
 * median map (bwExSafeMap), which counts most of their art ground as Pokémon: a timid, nearly plain card. TCG Live does carry their maps
 * (bwbsp 081 to 083); scripts/fam/bw-ex-ace/make_promo_maps.py converts them into assets/foil/fam/bw-ex-ace/map-<id>.webp. Their art is
 * no regular print's (SIFT: 7 to 13 inliers against 800+ for a true match), so no regular print's map fits them. Every other promo EX
 * (bw4-bwp036/037/038, bw6-bwp045/046/047, bw8-bwp061/062/063) already has its own map in its data record.
 */
const OWN_MAP = new Set(["bw10-bwp081", "bw10-bwp082", "bw10-bwp083"]);

export function famExtras(card, url, base) {
  if (!claims(card)) return null;
  const style = !card.foilMap && OWN_MAP.has(card.id) ? `--foil-map:url('${url(`assets/foil/fam/bw-ex-ace/map-${card.id.split("-")[1]}.webp`)}')` : "";
  return { classes: "fam-bw-ex-ace", style, cure: false };
}
