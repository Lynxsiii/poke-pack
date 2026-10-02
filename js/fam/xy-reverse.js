/**
 * Holo family xy-reverse: XY reverse holos.
 *
 * Scope: every XY era reverse holo outside Evolutions, Generations and McDonald's (xy1-xy11, Double Crisis, the Kalos
 * Starter Set, the promos and kits; those three families come earlier in js/holo-fam.js and claim theirs first).
 *
 * Part of the older-era holo remaster (2026-10-01; js/holo-fam.js lists every family, first claim wins). This module
 * decides which card faces are this family's and returns what to add to the face foilExtras() built: the class
 * `fam-xy-reverse` (every rule in css/holo/fam/xy-reverse.css is scoped to it), any finer classes, the family's own
 * custom properties (per-card maps as `url('...')` through `url()`, which makes a repo path absolute) and `cure: true` to
 * get the extra `.cure` layer. `base` is foilExtras()'s own result ({ classes, style, cure }) for the same face, so a
 * family can read what the era module decided; a custom property set here comes after the era's in the style
 * attribute, so it wins (`--foil-map` included). `card` has been through foilLook(), so a promo's rarity is its foilAs.
 * Never import js/foil-maps.js from here (it waits on this module).
 *
 * What the real cards do (Collexy's photos of Illumise xy1-9, Rhyperior xy5-77, Braixen xy10-12, Blacksmith xy6-88; the
 * family note .claude/skills/card-textures/reference/fam-xy-reverse.md): the body but the art window and the yellow border
 * is one holographic mirror with the type's big ghosted symbols (Poke Balls on a Trainer) brighter than the field, the
 * printed text over it in opaque ink. TCG Live's map of each card's reverse print (key xyN, `ph`; Double Crisis xy5-5)
 * draws that area and the symbols; scripts/fam/xy-reverse/ship_xy_rev_maps.py ships it as rev/<set>-<n>.webp with the
 * printed ink knocked out of it (a colour-dodge would tint black ink). A face with no map (xy0, kits, promos, Energy)
 * keeps the era's tile drawing.
 */
import { isXy } from "../xy-foil.js?v=5";

const set = (card) => String(card?.id || "").split("-")[0];
const DIR = "assets/foil/fam/xy-reverse";

/** "3-5,9" -> Set {"3","4","5","9"} */
function numbers(spec) {
  const out = new Set();
  for (const part of spec.split(",")) {
    const [a, b = a] = part.split("-").map(Number);
    for (let n = a; n <= b; n++) out.add(String(n));
  }
  return out;
}

/** Card numbers per set whose reverse print TCG Live maps and the site ships (generated from assets/foil/fam/xy-reverse/rev/). */
const MAPS = {
/*MAPS*/
/*END*/
};
for (const key of Object.keys(MAPS)) MAPS[key] = numbers(MAPS[key]);

/** Whether a card face is this family's: an XY reverse that Evolutions, Generations and McDonald's do not own. */
export function claims(card) {
  return Boolean(card) && Boolean(card.reverse) && isXy(card) && !/^(xy12-\d|g1-|mcd)/.test(String(card.id || ""));
}

export function famExtras(card, url, base) {
  if (!claims(card)) return null;
  const s = set(card);
  const n = String(card.number || "");
  if (!MAPS[s]?.has(n)) return { classes: "fam-xy-reverse", style: "", cure: false };
  return { classes: "fam-xy-reverse xyrev-map", style: `--xyrev-map:url('${url(`${DIR}/rev/${s}-${n}.webp`)}')`, cure: false };
}
