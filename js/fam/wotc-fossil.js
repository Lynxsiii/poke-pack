/**
 * Holo family wotc-fossil: Fossil (base3) holos.
 *
 * Scope: base3 Rare Holo 1-15 (Starlight).
 *
 * Part of the older-era holo remaster (2026-10-01; js/holo-fam.js lists every family, first claim wins). This module
 * decides which card faces are this family's and returns what to add to the face foilExtras() built: the class
 * `fam-wotc-fossil` (every rule in css/holo/fam/wotc-fossil.css is scoped to it), any finer classes, the family's own
 * custom properties (per-card maps as `url('...')` through `url()`, which makes a repo path absolute) and `cure: true` to
 * get the extra `.cure` layer. `base` is foilExtras()'s own result ({ classes, style, cure }) for the same face, so a
 * family can read what the era module decided; a custom property set here comes after the era's in the style
 * attribute, so it wins (`--foil-map` included). `card` has been through foilLook(), so a promo's rarity is its foilAs.
 * Never import js/foil-maps.js from here (it waits on this module).
 *
 * The maps (assets/foil/fam/wotc-fossil/, drawn by .claude/skills/card-textures/scripts/fam/wotc-fossil/make_fossil_maps.py
 * from each card's own scan): `<n>-bg` is where the foil shows (the art window's background: the window less the evolution
 * badge and the Pokémon, which is printed over a white underlay and stays matte), `<n>-stars` the scan's own starlight
 * stars and sparkle, and `glitter-a` / `glitter-b` the micro-streak glitter the tilt clips show under a lamp (Jungle's own
 * halves, byte for byte: same foil). A face with maps gets `wf-mapped`; the sheet draws nothing new without it.
 */
import { isWotc, wotcPattern } from "../wotc-foil.js?v=6";

const set = (card) => String(card?.id || "").split("-")[0];
const has = (pattern, cls) => ` ${pattern || ""} `.includes(` ${cls} `);
const DIR = "assets/foil/fam/wotc-fossil";
const V = 1;
/** The Rare Holo numbers whose maps are drawn (all fifteen). */
const MAPPED = new Set(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"]);

/** Whether a card face is this family's. */
export function claims(card) {
  return Boolean(card) && !card.reverse && isWotc(card) && set(card) === "base3" && has(wotcPattern(card), "wotc-cosmos");
}

export function famExtras(card, url, base) {
  if (!claims(card)) return null;
  const n = String(card.id).split("-")[1];
  if (!MAPPED.has(n)) return { classes: "fam-wotc-fossil", style: "", cure: false };
  const style = [
    `--wf-bg:url('${url(`${DIR}/${n}-bg-v${V}.webp`)}')`,
    `--wf-stars:url('${url(`${DIR}/${n}-stars-v${V}.webp`)}')`,
    `--wf-glitter-a:url('${url(`${DIR}/glitter-a-v${V}.webp`)}')`,
    `--wf-glitter-b:url('${url(`${DIR}/glitter-b-v${V}.webp`)}')`,
  ].join(";");
  return { classes: "fam-wotc-fossil wf-mapped", style, cure: false };
}
