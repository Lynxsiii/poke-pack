/**
 * Holo family wotc-neo-revelation: Neo Revelation (neo3) holos.
 *
 * Scope: neo3 Rare Holo (the two Shinings belong to wotc-shining).
 *
 * Part of the older-era holo remaster (2026-10-01; js/holo-fam.js lists every family, first claim wins). This module
 * decides which card faces are this family's and returns what to add to the face foilExtras() built: the class
 * `fam-wotc-neo-revelation` (every rule in css/holo/fam/wotc-neo-revelation.css is scoped to it), any finer classes, the family's own
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
  return Boolean(card) && !card.reverse && isWotc(card) && set(card) === "neo3" && has(wotcPattern(card), "wotc-cosmos");
}

export function famExtras(card, url, base) {
  if (!claims(card)) return null;
  return { classes: "fam-wotc-neo-revelation", style: "", cure: false };
}
