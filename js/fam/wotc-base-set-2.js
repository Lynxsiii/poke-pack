/**
 * Holo family wotc-base-set-2: Base Set 2 (base4) holos.
 *
 * Scope: base4 Rare Holo 1-20 (Cosmos), not base4-cdrom8.
 *
 * Part of the older-era holo remaster (2026-10-01; js/holo-fam.js lists every family, first claim wins). This module
 * decides which card faces are this family's and returns what to add to the face foilExtras() built: the class
 * `fam-wotc-base-set-2` (every rule in css/holo/fam/wotc-base-set-2.css is scoped to it), any finer classes, the family's own
 * custom properties (per-card maps as `url('...')` through `url()`, which makes a repo path absolute) and `cure: true` to
 * get the extra `.cure` layer. `base` is foilExtras()'s own result ({ classes, style, cure }) for the same face, so a
 * family can read what the era module decided; a custom property set here comes after the era's in the style
 * attribute, so it wins (`--foil-map` included). `card` has been through foilLook(), so a promo's rarity is its foilAs.
 * Never import js/foil-maps.js from here (it waits on this module).
 *
 * The maps (assets/foil/fam/wotc-base-set-2/, drawn by .claude/skills/card-textures/scripts/fam/wotc-base-set-2/make_b2_maps.py:
 * each card's Base Set / Jungle foil map carried onto the base4 scan): `<n>-bg` is where the foil shows (the art window's
 * background; the Pokémon, its underlay halo and the evolution badge stay matte), `<n>-stars` the scan's own sparkle, and
 * `glitter-a` / `glitter-b` the shared micro-streak glitter. A face with maps gets `wb2-mapped`.
 */
import { isWotc, wotcPattern } from "../wotc-foil.js?v=6";

const set = (card) => String(card?.id || "").split("-")[0];
const has = (pattern, cls) => ` ${pattern || ""} `.includes(` ${cls} `);
const DIR = "assets/foil/fam/wotc-base-set-2";
const V = 1;
/** The Rare Holo numbers whose maps are drawn (all twenty). */
const MAPPED = new Set(Array.from({ length: 20 }, (_, i) => String(i + 1)));

/** Whether a card face is this family's. */
export function claims(card) {
  return Boolean(card) && !card.reverse && isWotc(card) && set(card) === "base4" && card.id !== "base4-cdrom8" && has(wotcPattern(card), "wotc-cosmos");
}

export function famExtras(card, url, base) {
  if (!claims(card)) return null;
  const n = String(card.id).split("-")[1];
  if (!MAPPED.has(n)) return { classes: "fam-wotc-base-set-2", style: "", cure: false };
  const style = [
    `--wb2-bg:url('${url(`${DIR}/${n}-bg-v${V}.webp`)}')`,
    `--wb2-stars:url('${url(`${DIR}/${n}-stars-v${V}.webp`)}')`,
    `--wb2-glitter-a:url('${url(`${DIR}/glitter-a-v${V}.webp`)}')`,
    `--wb2-glitter-b:url('${url(`${DIR}/glitter-b-v${V}.webp`)}')`,
  ].join(";");
  return { classes: "fam-wotc-base-set-2 wb2-mapped", style, cure: false };
}
