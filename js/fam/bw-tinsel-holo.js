/**
 * Holo family bw-tinsel-holo: Black & White Tinsel Rare Holo.
 *
 * Scope: every `bw-holo` print: Rare Holo of bw1-bw11, Dragon Vault, the bwp and theme-deck holos (cosmos and cracked-ice promos included).
 *
 * Part of the older-era holo remaster (2026-10-01; js/holo-fam.js lists every family, first claim wins). This module
 * decides which card faces are this family's and returns what to add to the face foilExtras() built: the class
 * `fam-bw-tinsel-holo` (every rule in css/holo/fam/bw-tinsel-holo.css is scoped to it), any finer classes, the family's own
 * custom properties (per-card maps as `url('...')` through `url()`, which makes a repo path absolute) and `cure: true` to
 * get the extra `.cure` layer. `base` is foilExtras()'s own result ({ classes, style, cure }) for the same face, so a
 * family can read what the era module decided; a custom property set here comes after the era's in the style
 * attribute, so it wins (`--foil-map` included). `card` has been through foilLook(), so a promo's rarity is its foilAs.
 * Never import js/foil-maps.js from here (it waits on this module).
 */
import { isBw, bwPattern } from "../bw-foil.js?v=8";

const set = (card) => String(card?.id || "").split("-")[0];
const has = (pattern, cls) => ` ${pattern || ""} `.includes(` ${cls} `);

/** Whether a card face is this family's. */
export function claims(card) {
  return Boolean(card) && !card.reverse && isBw(card) && has(bwPattern(card), "bw-holo");
}

export function famExtras(card, url, base) {
  if (!claims(card)) return null;
  return { classes: "fam-bw-tinsel-holo", style: "", cure: false };
}
