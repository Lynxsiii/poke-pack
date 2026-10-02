/**
 * Holo family ex-gold-star: Gold Star (EX era).
 *
 * Scope: every Pokémon ★ print with the cosmos holo (`ex-star`), and the three refractor stars (`ex-refractor`: Gyarados ex13-102,
 * Charizard ex15-100 and Mew ex15-101, all delta) under their own class `fam-ex-gold-star-refractor`: on those the Pokémon
 * itself is the foil, so each has a Pokémon silhouette map (`<id>-refractor-v1.webp`, make_refractor_star_maps.py) that replaces
 * the era's `--foil-map` and the sheet's refractor recipe (the cosmos stars' rules are scoped to `fam-ex-gold-star` and never touch them).
 *
 * Part of the older-era holo remaster (2026-10-01; js/holo-fam.js lists every family, first claim wins). This module
 * decides which card faces are this family's and returns what to add to the face foilExtras() built: the class
 * `fam-ex-gold-star` (every rule in css/holo/fam/ex-gold-star.css is scoped to it), any finer classes, the family's own
 * custom properties (per-card maps as `url('...')` through `url()`, which makes a repo path absolute) and `cure: true` to
 * get the extra `.cure` layer. `base` is foilExtras()'s own result ({ classes, style, cure }) for the same face, so a
 * family can read what the era module decided; a custom property set here comes after the era's in the style
 * attribute, so it wins (`--foil-map` included). `card` has been through foilLook(), so a promo's rarity is its foilAs.
 * Never import js/foil-maps.js from here (it waits on this module).
 *
 * What it adds: every claimed face has its own map, drawn from its own scan by
 * .claude/skills/card-textures/scripts/fam/ex-gold-star/make_ex_gold_star_maps.py into
 * assets/foil/fam/ex-gold-star/<card id>-v1.webp (RGBA, registered to the scan): RGB is the cosmos dots the scan shows in the
 * art window, each one random hue; alpha is the foil ground, the background of the window (the Pokémon is plain ink).
 * The map goes in as `--foil-map-xg`; `cure: true` adds the `.cure` layer that lights the dots. A face with no map keeps the
 * era's recipe.
 */
import { isEx, exPattern } from "../ex-foil.js?v=8";

const has = (pattern, cls) => ` ${pattern || ""} `.includes(` ${cls} `);

/** Every face with a map, by set: "<set>:<numbers>" (an id is `<set>-<number>`). */
const MAPPED = new Set(
  [
    "ex7:107 108 109",
    "ex8:105 106 107",
    "ex10:113 114 115",
    "ex11:111 112 113",
    "ex12:90 91 92",
    "ex13:103 104",
    "ex14:100 99",
    "ex16:100 101 102",
  ].flatMap((row) => {
    const [s, nums] = row.split(":");
    return nums.split(" ").map((n) => `${s}-${n}`);
  }),
);
/** The maps' version: a map redrawn after it shipped lives under a new name (assets are cached as immutable). The v2 maps
 * (fine glitter on the window's background only) ship set by set as each set passes review; the rest keep v1. */
const V2 = new Set(["ex16"]);
const mapVersion = (card) => (V2.has(card.id.split("-")[0]) ? 2 : 1);

/** Whether a card face is this family's. */
export function claims(card) {
  return Boolean(card) && !card.reverse && isEx(card) && has(exPattern(card), "ex-star") && !has(exPattern(card), "ex-refractor");
}

/** The refractor stars with a silhouette map (the Pokémon is the foil). */
const REFRACTOR = new Set(["ex13-102", "ex15-100", "ex15-101"]);
const VR = 1;

export function famExtras(card, url, base) {
  if (Boolean(card) && !card.reverse && REFRACTOR.has(card.id) && isEx(card) && has(exPattern(card), "ex-refractor")) {
    return {
      classes: "fam-ex-gold-star-refractor",
      style: `--foil-map:url('${url(`assets/foil/fam/ex-gold-star/${card.id}-refractor-v${VR}.webp`)}')`,
      cure: false,
    };
  }
  if (!claims(card) || !MAPPED.has(card.id)) return null;
  return {
    classes: "fam-ex-gold-star",
    style: `--foil-map-xg:url('${url(`assets/foil/fam/ex-gold-star/${card.id}-v${mapVersion(card)}.webp`)}')`,
    cure: true,
  };
}
