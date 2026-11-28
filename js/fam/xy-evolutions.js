/**
 * Holo family xy-evolutions: Evolutions (xy12) holos and reverses.
 *
 * Scope: xy12 Rare Holo (the 1999-style Starlight reprints, `xy-starlight`) and every xy12 reverse holo; xy12's EX, Mega EX, BREAK and full arts belong to xy-ex-mega, xy-break and xy-full-art.
 *
 * Part of the older-era holo remaster (2026-10-01; js/holo-fam.js lists every family, first claim wins). This module
 * decides which card faces are this family's and returns what to add to the face foilExtras() built: the class
 * `fam-xy-evolutions` (every rule in css/holo/fam/xy-evolutions.css is scoped to it), any finer classes, the family's own
 * custom properties (per-card maps as `url('...')` through `url()`, which makes a repo path absolute) and `cure: true` to
 * get the extra `.cure` layer. `base` is foilExtras()'s own result ({ classes, style, cure }) for the same face, so a
 * family can read what the era module decided; a custom property set here comes after the era's in the style
 * attribute, so it wins (`--foil-map` included). `card` has been through foilLook(), so a promo's rarity is its foilAs.
 * Never import js/foil-maps.js from here (it waits on this module).
 *
 * What the real cards do (research, photos and sheets: /mnt/project-files/holo-remaster/xy-evolutions/; the family
 * note: .claude/skills/card-textures/reference/fam-xy-evolutions.md):
 * - The 13 Rare Holos print Collexy's "Starlight Holofoil" (the only XY set without the Sheen holo): the art background
 *   is a field of stars at two depths, sharp 8-point stars, bursts, twinkles and dots near the surface, blurred stars
 *   and blobs far away, each flashing its own colour; the Pokemon is matte. `xy12-star` gets TCG Live's map (the era's
 *   `--foil-map`), the star textures and the `.cure` layer for the sweeping light. Charizard 11's scan prints an
 *   EVOLUTIONS logo the pack card does not have, so its map has the logo cut out (map-11.webp).
 * - Every reverse is a plain mirror ("the Set Reverse Holofoil Pattern is the Mirror Pattern", Collexy; TCG Live's
 *   reverse maps of xy12 are flat white where every other XY set's carry type symbols): `xy12-rev` replaces the era's
 *   type-symbol tile with a smooth sheen, masked by the card's own TCG Live reverse map (`--xy12-rev-map`). The maps
 *   are rev-v2/<n>.webp: Live's map with the card's printed ink knocked out of the alpha, so a lit mirror cannot tint
 *   the rules text (make_rev_ink_maps.py; rev/<n>.webp, the maps without the knock-out, shipped in #166 and stay).
 */
import { isXy, xyPattern } from "../xy-foil.js?v=5";

const set = (card) => String(card?.id || "").split("-")[0];
const has = (pattern, cls) => ` ${pattern || ""} `.includes(` ${cls} `);
const DIR = "assets/foil/fam/xy-evolutions/";

/** The cards TCG Live publishes a reverse-print map for (every Common, Uncommon, Rare and Rare Holo of xy12). */
const REVERSE_MAPS = new Set([
  3, 4, 5, 6, 7, 8, 9, 10, 11, 14, 15, 17, 18, 19, 20, 23, 24, 25, 28, 29, 30, 31, 33, 34, 35, 36, 37, 38, 39, 40, 41,
  42, 43, 44, 45, 47, 48, 49, 50, 51, 53, 54, 55, 56, 57, 58, 59, 61, 62, 63, 66, 67, 68, 69, 70, 71, 73, 74, 75, 76, 77,
  78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90,
]);

/** Holo maps of our own, keyed by card id: Charizard's with the logo of its scan cut out (make_maps.py). */
const HOLO_MAPS = { "xy12-11": "map-11.webp" };

/** Whether a card face is this family's. */
export function claims(card) {
  return Boolean(card) && set(card) === "xy12" && isXy(card) && (card.reverse || has(xyPattern(card), "xy-starlight"));
}

export function famExtras(card, url, base) {
  if (!claims(card)) return null;
  if (card.reverse) {
    const n = Number(card.number);
    if (!REVERSE_MAPS.has(n)) return { classes: "fam-xy-evolutions xy12-rev", style: "", cure: false };
    return {
      classes: "fam-xy-evolutions xy12-rev xy12-rev-map",
      style: `--xy12-rev-map:url('${url(`${DIR}rev-v2/${n}.webp`)}')`,
      cure: false,
    };
  }
  const map = HOLO_MAPS[card.id];
  return {
    classes: "fam-xy-evolutions xy12-star",
    style: map ? `--foil-map:url('${url(DIR + map)}')` : "",
    cure: true,
  };
}
