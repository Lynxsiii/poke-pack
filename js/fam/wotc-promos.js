/**
 * Holo family wotc-promos: Wizards Black Star Promos, Best of Game and Southern Islands.
 *
 * Scope: the seven cosmos window holos and the four First Movie stamp promos of basep (the promo reverses and Southern Islands stay on the era recipe).
 *
 * Part of the older-era holo remaster (2026-10-01; js/holo-fam.js lists every family, first claim wins). This module
 * decides which card faces are this family's and returns what to add to the face foilExtras() built: the class
 * `fam-wotc-promos` (every rule in css/holo/fam/wotc-promos.css is scoped to it), any finer classes, the family's own
 * custom properties (per-card maps as `url('...')` through `url()`, which makes a repo path absolute) and `cure: true` to
 * get the extra `.cure` layer. `base` is foilExtras()'s own result ({ classes, style, cure }) for the same face, so a
 * family can read what the era module decided; a custom property set here comes after the era's in the style
 * attribute, so it wins (`--foil-map` included). `card` has been through foilLook(), so a promo's rarity is its foilAs.
 * Never import js/foil-maps.js from here (it waits on this module).
 *
 * The finishes (photos and sources: /mnt/project-files/holo-remaster/wotc-promos/refs/SOURCES.md):
 * - `wp-win`: cosmos window holo (basep 9, 10, 11, 13, 15, 17, 24). Foil = the art window minus the Pokémon (printed on
 *   a white underlay, matte) minus the Stage box; `--wp-field`, and `--wp-dots` (the cosmos dots the scan froze).
 * - `wp-stamp`: First Movie promos (basep 2-5), a flat card with gold foil lettering (`--wp-stamp`).
 * Maps: assets/foil/fam/wotc-promos/, drawn by .claude/skills/card-textures/scripts/fam/wotc-promos/make_promo_maps.py.
 */
import { isWotc, wotcPattern } from "../wotc-foil.js?v=6";

const has = (pattern, cls) => ` ${pattern || ""} `.includes(` ${cls} `);
const DIR = "assets/foil/fam/wotc-promos/";

const HOLO = new Set(["basep-basep09", "basep-basep10", "basep-basep11", "basep-basep13", "basep-basep15", "basep-basep17", "basep-basep24"]);
const STAMP = new Set(["basep-basep02", "basep-basep03", "basep-basep04", "basep-basep05"]);

/**
 * Whether a card face is this family's: the seven cosmos window holos and the four First Movie stamp promos. The promo reverses
 * (basep 34, 35; bp 1, 2, 3, 8, 9) and Southern Islands are left to the era recipe: no photo of them showed a tint worth
 * claiming (the draft's type tint was a saturated, muddy sheet), and Southern Islands being foil at all rests on one source.
 */
export function claims(card) {
  const id = String(card?.id || "");
  return Boolean(card) && !card.reverse && isWotc(card) && (HOLO.has(id) || STAMP.has(id));
}

export function famExtras(card, url, base) {
  if (!claims(card)) return null;
  const id = String(card.id);
  const map = (name) => `url('${url(`${DIR}${name}-${id}.webp`)}')`;
  if (HOLO.has(id) && has(wotcPattern(card), "wotc-cosmos")) {
    return { classes: "fam-wotc-promos wp-win", style: `--wp-field:${map("field")};--wp-dots:${map("dots")}`, cure: true };
  }
  if (STAMP.has(id)) {
    return { classes: "fam-wotc-promos wp-stamp", style: `--wp-stamp:${map("stamp")}`, cure: false };
  }
  return null;
}
