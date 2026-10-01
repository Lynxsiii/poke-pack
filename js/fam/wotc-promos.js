/**
 * Holo family wotc-promos: Wizards Black Star Promos, Best of Game and Southern Islands.
 *
 * Scope: every foil print of basep, bp and si1 (cosmos holos, the First Movie stamps, the promo reverses) and any other Wizards print outside the numbered sets.
 *
 * Part of the older-era holo remaster (2026-10-01; js/holo-fam.js lists every family, first claim wins). This module
 * decides which card faces are this family's and returns what to add to the face foilExtras() built: the class
 * `fam-wotc-promos` (every rule in css/holo/fam/wotc-promos.css is scoped to it), any finer classes, the family's own
 * custom properties (per-card maps as `url('...')` through `url()`, which makes a repo path absolute) and `cure: true` to
 * get the extra `.cure` layer. `base` is foilExtras()'s own result ({ classes, style, cure }) for the same face, so a
 * family can read what the era module decided; a custom property set here comes after the era's in the style
 * attribute, so it wins (`--foil-map` included). `card` has been through foilLook(), so a promo's rarity is its foilAs.
 * Never import js/foil-maps.js from here (it waits on this module).
 */
import { isWotc, wotcPattern } from "../wotc-foil.js?v=6";

const set = (card) => String(card?.id || "").split("-")[0];
const has = (pattern, cls) => ` ${pattern || ""} `.includes(` ${cls} `);

/** Whether a card face is this family's. */
export function claims(card) {
  return Boolean(card) && isWotc(card) && !/^(base[1-6]|gym[12]|neo[1-4]|ecard[123])$/.test(set(card)) && Boolean(card.reverse || (wotcPattern(card) && wotcPattern(card) !== "foil-none"));
}

export function famExtras(card, url, base) {
  if (!claims(card)) return null;
  return { classes: "fam-wotc-promos", style: "", cure: false };
}
