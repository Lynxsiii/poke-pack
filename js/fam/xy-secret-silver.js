/**
 * Holo family xy-secret-silver: XY silver secret rare: Dialga-EX 122/119 (Phantom Forces).
 *
 * Scope: the ids in CARDS (not their reverses).
 *
 * Part of the older-era holo remaster (2026-10-01; js/holo-fam.js lists every family, first claim wins). Started
 * 2026-10-02 for Noah's secret rare remake (20:09: "remake the Secret rares, most have really shitty texture and i dont
 * like the overuse of the rainbow glare as most cards dont really have that rainbow glare ... Dialga-EX 122/119, the
 * card looks amzing in person and on the site it looks like shit"). This module decides which card faces are this
 * family's and returns what to add to the face foilExtras() built: the class `fam-xy-secret-silver` (every rule in
 * css/holo/fam/xy-secret-silver.css is scoped to it), any finer classes, the family's own custom properties (per-card maps as
 * `url('...')` through `url()`, which makes a repo path absolute) and `cure: true` to get the extra `.cure` layer.
 * `base` is foilExtras()'s own result ({ classes, style, cure }) for the same face; a custom property set here comes
 * after the era's in the style attribute, so it wins (`--foil-map` included). Never import js/foil-maps.js from here.
 * Before this family the cards were xy-full-art's (that is the look to beat: `?famskip=xy-secret-silver` in the lab shows it).
 *
 * The real card is a silver mirror engraved edge to edge (TCG Live's etch: contour lines and octagon rings round the
 * Energy symbols) with tall vertical rainbow stripes between dark and bright bands of silver; only the black lettering
 * and the coloured symbols are ink. Each card gets:
 *   --xss-etch  TCG Live's etch at its native size (xy-full-art shipped it; read-only here, never softened)
 *   --xss-ink   where the ink is (alpha 0), drawn from the scan by scripts/fam/xy-secret-silver/make_ink.py
 */
import { isXy } from "../xy-foil.js?v=5";

/** The prints this family draws, with their etch (TCG Live's, native size) and ink mask. */
const CARDS = new Map([
  ["xy4-122", { etch: "assets/foil/fam/xy-full-art/xy4-122-etch.webp", ink: "assets/foil/fam/xy-secret-silver/xy4-122-ink-v1.webp" }],
]);

/** Whether a card face is this family's. */
export function claims(card) {
  return Boolean(card) && !card.reverse && isXy(card) && CARDS.has(String(card.id || ""));
}

export function famExtras(card, url, base) {
  if (!claims(card)) return null;
  const maps = CARDS.get(String(card.id));
  const style = [`--xss-etch:url('${url(maps.etch)}')`, `--xss-ink:url('${url(maps.ink)}')`];
  return { classes: "fam-xy-secret-silver", style: style.join(";"), cure: false };
}
