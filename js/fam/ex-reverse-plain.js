/**
 * Holo family ex-reverse-plain: the EX reverses of ex5-ex16 that have no foil-area map (reverse round, 2026-11-28).
 *
 * Scope: the 18 reverse faces the ex-reverse family does not claim because its generator could not cut the Pokémon
 * from the art's background (make_ex_reverse_hints.json `skip`): ex5-12 15 25 36 56, ex6-20 39, ex7-32 34 53 55 56 76,
 * ex8-74, ex9-3, ex13-16 26 60. They were left on the era's recipe, which lays the set's pattern or sheen over the
 * whole art window, Pokémon included (symbols over the Pokémon, a milky or teal wash; 2026-11-28 reverse review).
 * This family must come AFTER ex-reverse in js/holo-fam.js: a face that gets a map later is ex-reverse's.
 *
 * What it adds: `fam-ex-reverse-plain` (css/holo/fam/ex-reverse-plain.css: one soft overlaid pool of light in the art
 * box, nothing at rest). The era's `--ex-win` (the layout's art window) is already on the face.
 *
 * `base` is foilExtras()'s own result. Never import js/foil-maps.js from here (it waits on this module).
 */
import { isEx } from "../ex-foil.js?v=10";

/** Whether a card face is this family's: an art-box EX reverse (not the ex1-ex4 / POP Mirror) nobody mapped. */
export function claims(card, base) {
  if (!card?.reverse || !isEx(card) || !/^ex\d+-/.test(String(card.id || ""))) return false;
  const classes = ` ${base?.classes || ""} `;
  return classes.includes(" ex-rev ") && !classes.includes(" ex-rev-mirror ") && /--ex-win:/.test(base?.style || "");
}

export function famExtras(card, url, base) {
  if (!claims(card, base)) return null;
  return { classes: "fam-ex-reverse-plain", style: "", cure: false };
}
