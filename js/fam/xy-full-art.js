/**
 * Holo family xy-full-art: XY full arts and secret rares.
 *
 * Scope: every `xy-fa` print outside the Generations Radiant Collection (full-art EX, Mega EX, Supporters) and every `xy-secret` (gold Items, Mega and shiny secrets).
 *
 * Part of the older-era holo remaster (2026-10-01; js/holo-fam.js lists every family, first claim wins). This module
 * decides which card faces are this family's and returns what to add to the face foilExtras() built: the class
 * `fam-xy-full-art` (every rule in css/holo/fam/xy-full-art.css is scoped to it), any finer classes, the family's own
 * custom properties (per-card maps as `url('...')` through `url()`, which makes a repo path absolute) and `cure: true` to
 * get the extra `.cure` layer. `base` is foilExtras()'s own result ({ classes, style, cure }) for the same face, so a
 * family can read what the era module decided; a custom property set here comes after the era's in the style
 * attribute, so it wins (`--foil-map` included). `card` has been through foilLook(), so a promo's rarity is its foilAs.
 * Never import js/foil-maps.js from here (it waits on this module).
 *
 * What it adds (the sheet's hooks; the research is in reference/fam-xy-full-art.md):
 *   --xyf-etch   TCG Live's etch at its native 733 x 1024 (assets/foil/fam/xy-full-art/<id>-etch.webp,
 *                scripts/fam/xy-full-art/ship_live_maps.py) for every print whose data carries Live's etch, with
 *                `xyf-etched`; the real cards are textured edge to edge (fine ridges the rainbow rides on).
 *   xyf-smooth   a print Live ships no etch for: the gold Mega secrets of Flashfire, Furious Fists and Phantom
 *                Forces, and the black star promos (smooth mirror foil in the photos).
 *   --foil-map   TCG Live's foil map for the promos the data has none for (<id>-map.webp, same script): the foil
 *                is only the background there, the Pokémon and the yellow border are matte.
 *   xyf-promo    those promos and the other xyp prints of the family (smooth, map-masked sheen).
 *   xyf-drawn    the four "a" prints Live has nothing for (xyp150a, 177a, 198a, 200a): a fingerprint etch drawn
 *                from the scan (<id>-etch-drawn.webp, scripts/fam/xy-full-art/draw_a_print_etch.py).
 */
import { isXy, xyPattern } from "../xy-foil.js?v=5";

const has = (pattern, cls) => ` ${pattern || ""} `.includes(` ${cls} `);
const DIR = "assets/foil/fam/xy-full-art";

/** Black star promos with a TCG Live foil map the data does not carry (shipped as <id>-map.webp). */
const LIVE_PROMO_MAP = new Set([
  "g1-xyp110", "g1-xyp111", "g1-xyp112", "g1-xyp113", "g1-xyp114", "g1-xyp115", "g1-xyp116", "g1-xyp117",
  "g1-xyp118", "g1-xyp119", "g1-xyp120", "g1-xyp121", "g1-xyp122", "g1-xyp123", "g1-xyp124", "g1-xyp125",
  "g1-xyp126", "xy8-xyp074", "xy8-xyp075", "xy8-xyp076", "xy8-xyp077", "xy8-xyp078", "xy8-xyp079", "xy8-xyp080",
  "xy8-xyp081", "xy8-xyp082", "xy8-xyp083", "xy10-xyp103",
]);
/** The "a" prints of the Premium Trainer's XY Collection and friends: textured, no Live map (drawn etch). */
const DRAWN = new Set(["xyp-xyp150a", "xyp-xyp177a", "xyp-xyp198a", "xyp-xyp200a"]);

/** Whether a card face is this family's. */
export function claims(card) {
  return Boolean(card) && !card.reverse && isXy(card) && (has(xyPattern(card), "xy-fa") || has(xyPattern(card), "xy-secret")) && !has(xyPattern(card), "xy-rc");
}

export function famExtras(card, url, base) {
  if (!claims(card)) return null;
  const id = String(card.id);
  const classes = ["fam-xy-full-art"];
  const style = [];
  const promo = /-xyp\d/.test(id);
  if (card.etchMap) {
    classes.push("xyf-etched");
    style.push(`--xyf-etch:url('${url(`${DIR}/${id}-etch.webp`)}')`);
  } else if (DRAWN.has(id)) {
    classes.push("xyf-etched", "xyf-drawn");
    style.push(`--xyf-etch:url('${url(`${DIR}/${id}-etch-drawn.webp`)}')`);
  } else {
    classes.push("xyf-smooth");
  }
  if (promo) classes.push("xyf-promo");
  if (!card.foilMap && LIVE_PROMO_MAP.has(id)) style.push(`--foil-map:url('${url(`${DIR}/${id}-map.webp`)}')`);
  return { classes: classes.join(" "), style: style.join(";"), cure: false };
}
