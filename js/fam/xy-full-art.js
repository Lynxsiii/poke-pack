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
 *   xyf-cure     the gold Mega secrets, the gold Items and the promos (no etch, or gold ink the colour-dodge cannot
 *                tint): `cure: true` gives them the `.cure` layer, a vertical rainbow stripe in hard-light that rides
 *                the gold and the white text box like the stripe in the photos of the real cards.
 *   xyf-pale     the full arts whose scan is mostly pale (Wally, Altaria-EX, Shaymin-EX, Dive Ball, ...: the PALE table): the dodge at
 *                half strength so the art is not clipped to white, plus the stripe (xyf-cure).
 *   xyf-silver   Dialga-EX 122/119 (white line art on silver): every rule of the sheet steps aside except its `.cure`
 *                stripe (pastel, multiplied: it cannot wash the line art out); the era's silver recipe
 *                (css/holo/xy-fullart.css, foil multiplied on) draws the rest; the dodge columns washed it to white.
 *   The four "a" prints (xyp150a, 177a, 198a, 200a: the Premium Trainer's XY Collection reprints) are smooth like
 *   the regular prints they copy, and they must not draw on the all-white fallback map (Review #1: the unfloored
 *   dodge and the stripe covered the Pokémon and the lettering, +70 levels on the art against +28 on the sibling).
 *   xyp150a ships the foil map of Live's xybsp 150 (`xyp-xyp150a-map.webp`, LIVE_PROMO_MAP); xyp198a and xyp200a
 *   borrow the maps already shipped for xyp198 and xyp200 (BORROWED_MAP, same art, same background-only foil);
 *   Live has no 177, so Karen (a pale Supporter) is `xyf-pale` + `xyf-nomap`: half dodge and a half-strength stripe.
 *   None carries `--xyf-etch` (no etch exists for them), so no 404.
 */
import { isXy, xyPattern } from "../xy-foil.js?v=5";

const has = (pattern, cls) => ` ${pattern || ""} `.includes(` ${cls} `);
const DIR = "assets/foil/fam/xy-full-art";

/** Black star promos with a TCG Live foil map the data does not carry (shipped as <id>-map.webp). */
const LIVE_PROMO_MAP = new Set([
  "g1-xyp110", "g1-xyp111", "g1-xyp112", "g1-xyp113", "g1-xyp114", "g1-xyp115", "g1-xyp116", "g1-xyp117",
  "g1-xyp118", "g1-xyp119", "g1-xyp120", "g1-xyp121", "g1-xyp122", "g1-xyp123", "g1-xyp124", "g1-xyp125",
  "g1-xyp126", "xy8-xyp074", "xy8-xyp075", "xy8-xyp076", "xy8-xyp077", "xy8-xyp078", "xy8-xyp079", "xy8-xyp080",
  "xy8-xyp081", "xy8-xyp082", "xy8-xyp083", "xy10-xyp103", "xyp-xyp150a", "xyp-xyp177a",
]);

/** "a" prints Live has no map for whose regular print has one shipped: the same art, so the same foil (new url, same file). */
const BORROWED_MAP = {
  "xyp-xyp198a": "assets/foil/maps/xyp/xyp198.webp",
  "xyp-xyp200a": "assets/foil/maps/xyp/xyp200.webp",
};

/** Prints with no foil map anywhere (Live has no xybsp 177): the stripe at half strength (`xyf-nomap`) so it cannot cover the art. */
const NO_MAP = new Set(["xyp-xyp177a"]);

/**
 * Full arts whose scan is mostly pale (mean luminance of the art >= 175, measured on the scans 2026-10-02): colour-dodge
 * clips pale ink to white, so these take the dodge at half strength and the hard-light stripe (`xyf-pale`, `cure`).
 */
const PALE = new Set(["xy6-107", "xy10-123", "xy6-106", "xy5-160", "xy2-105", "xy5-147", "xy9-116", "xy2-106", "xy3-111", "xy7-87", "xy5-161", "xy5-164", "xy7-100",
  "g1-xyp110", "g1-xyp111", "g1-xyp112", "g1-xyp117", "xy8-xyp083", "xyp-xyp177a"]);

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
  } else {
    classes.push("xyf-smooth");
  }
  if (promo) classes.push("xyf-promo");
  // Dialga-EX 122/119 is silver: the era's multiplied-on silver recipe keeps its line art, the dodge recipe washed it white
  if (has(xyPattern(card), "xy-silver")) classes.push("xyf-silver");
  // the stripe layer: gold Items (etched, gold ink) and every smooth print (gold Mega secrets, promos)
  const pale = PALE.has(id);
  if (pale) classes.push("xyf-pale");
  const cure = pale || !card.etchMap || has(xyPattern(card), "xy-item") || has(xyPattern(card), "xy-silver");
  if (cure) classes.push("xyf-cure");
  // a print the data gives no foil map: Live's (shipped here), the regular print's (borrowed), or none (Karen: half stripe)
  const mapPath = card.foilMap ? null : BORROWED_MAP[id] || (LIVE_PROMO_MAP.has(id) ? `${DIR}/${id}-map.webp` : null);
  if (mapPath) style.push(`--foil-map:url('${url(mapPath)}')`);
  else if (!card.foilMap && NO_MAP.has(id)) classes.push("xyf-nomap");
  return { classes: classes.join(" "), style: style.join(";"), cure };
}
