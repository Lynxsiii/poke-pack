/**
 * Holo family xy-secret-shiny: XY shiny secret EX with the gold border: Ancient Origins, BREAKthrough, BREAKpoint, Fates Collide and Steam Siege.
 *
 * Scope: the ids in CARDS (not their reverses).
 *
 * Part of the older-era holo remaster (2026-10-01; js/holo-fam.js lists every family, first claim wins). Started
 * 2026-10-02 for Noah's secret rare remake (20:09: "remake the Secret rares, most have really shitty texture and i dont
 * like the overuse of the rainbow glare as most cards dont really have that rainbow glare ... Dialga-EX 122/119, the
 * card looks amzing in person and on the site it looks like shit"). This module decides which card faces are this
 * family's and returns what to add to the face foilExtras() built: the class `fam-xy-secret-shiny` (every rule in
 * css/holo/fam/xy-secret-shiny.css is scoped to it), any finer classes, the family's own custom properties (per-card maps as
 * `url('...')` through `url()`, which makes a repo path absolute) and `cure: true` to get the extra `.cure` layer.
 * `base` is foilExtras()'s own result ({ classes, style, cure }) for the same face; a custom property set here comes
 * after the era's in the style attribute, so it wins (`--foil-map` included). Never import js/foil-maps.js from here.
 * Before this family the cards were xy-full-art's (that is the look to beat: `?famskip=xy-secret-shiny` in the lab shows it).
 */
import { isXy } from "../xy-foil.js?v=5";

/**
 * Live's etch at its native 733 x 1024, shipped by xy-full-art (read only here): the engraving, used as the layers' line mask.
 * DIR holds this family's own three smooth ridge-direction weight maps per card (0, 60 and 120 degrees; scripts/fam/xy-secret-shiny/make_dir_maps.py).
 */
const ETCH = "assets/foil/fam/xy-full-art";
const DIR = "assets/foil/fam/xy-secret-shiny";

/** The prints this family draws. */
const CARDS = new Set(["xy7-96", "xy7-97", "xy7-98", "xy8-163", "xy8-164", "xy9-123", "xy10-125", "xy11-115", "xy11-116"]);

/** Whether a card face is this family's. */
export function claims(card) {
  return Boolean(card) && !card.reverse && isXy(card) && CARDS.has(String(card.id || ""));
}

export function famExtras(card, url, base) {
  if (!claims(card)) return null;
  const id = String(card.id);
  const style = [
    `--xyss-etch:url('${url(`${ETCH}/${id}-etch.webp`)}')`,
    `--xyss-dir-a:url('${url(`${DIR}/${id}-dir-a.webp`)}')`,
    `--xyss-dir-b:url('${url(`${DIR}/${id}-dir-b.webp`)}')`,
    `--xyss-dir-c:url('${url(`${DIR}/${id}-dir-c.webp`)}')`,
  ];
  return { classes: "fam-xy-secret-shiny", style: style.join(";"), cure: true };
}
