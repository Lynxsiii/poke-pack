/**
 * Holo family wotc-legendary-collection: Legendary Collection (base6) holos and fireworks reverse.
 *
 * Scope: base6 Rare Holo (Starlight) and every base6 reverse holo (the fireworks reverse).
 *
 * Part of the older-era holo remaster (2026-10-01; js/holo-fam.js lists every family, first claim wins). This module
 * decides which card faces are this family's and returns what to add to the face foilExtras() built: the class
 * `fam-wotc-legendary-collection` (every rule in css/holo/fam/wotc-legendary-collection.css is scoped to it), any finer classes, the family's own
 * custom properties (per-card maps as `url('...')` through `url()`, which makes a repo path absolute) and `cure: true` to
 * get the extra `.cure` layer. `base` is foilExtras()'s own result ({ classes, style, cure }) for the same face, so a
 * family can read what the era module decided; a custom property set here comes after the era's in the style
 * attribute, so it wins (`--foil-map` included). `card` has been through foilLook(), so a promo's rarity is its foilAs.
 * Never import js/foil-maps.js from here (it waits on this module).
 *
 * The 19 Rare Holos reprint Base Set / Jungle / Fossil / Team Rocket art over the same Starlight foil, so they are drawn as Team
 * Rocket's are. The maps (assets/foil/fam/wotc-legendary-collection/, drawn by
 * .claude/skills/card-textures/scripts/fam/wotc-legendary-collection/make_lc_maps.py from each reprint's own scan): `<n>-bg` is where
 * the foil shows (the art window's background: the window less the stage badge and the Pokémon, which stays matte), `<n>-stars` the
 * scan's own stars, and `glitter-a` / `glitter-b` the micro-streak glitter (Jungle's own halves, byte for byte). A face with maps gets
 * `lc-mapped`; the sheet draws nothing new without it. The reverse faces are claimed too: the sheet turns the era's fireworks reverse
 * (css/holo/wotc.css) the real card's cold silver-blue.
 */

import { isWotc, wotcPattern } from "../wotc-foil.js?v=6";

const set = (card) => String(card?.id || "").split("-")[0];
const has = (pattern, cls) => ` ${pattern || ""} `.includes(` ${cls} `);
const DIR = "assets/foil/fam/wotc-legendary-collection";
const V = 1;

/** Whether a card face is this family's. */
export function claims(card) {
  // The fireworks reverse is not claimed yet: its draft recolour (the sheet's last block) turned the whole card, yellow
  // border included, a cold blue-grey at rest, so the reverses keep the era recipe until it is redone.
  return Boolean(card) && isWotc(card) && set(card) === "base6" && !card.reverse && has(wotcPattern(card), "wotc-cosmos");
}

export function famExtras(card, url, base) {
  if (!claims(card)) return null;
  if (card.reverse) return { classes: "fam-wotc-legendary-collection", style: "", cure: false };
  const n = Number(String(card.id).split("-")[1]);
  if (!(n >= 1 && n <= 19)) return { classes: "fam-wotc-legendary-collection", style: "", cure: false };
  const style = [
    `--lc-bg:url('${url(`${DIR}/${n}-bg-v${V}.webp`)}')`,
    `--lc-stars:url('${url(`${DIR}/${n}-stars-v${V}.webp`)}')`,
    `--lc-glitter-a:url('${url(`${DIR}/glitter-a-v${V}.webp`)}')`,
    `--lc-glitter-b:url('${url(`${DIR}/glitter-b-v${V}.webp`)}')`,
  ].join(";");
  return { classes: "fam-wotc-legendary-collection lc-mapped", style, cure: false };
}
