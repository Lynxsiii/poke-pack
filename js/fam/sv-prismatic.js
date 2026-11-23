/**
 * Holo family sv-prismatic (holo accuracy overhaul, 2026-10-22; built 2026-11-23 from the audit w2-sv-prismatic):
 * Prismatic Evolutions' Poké Ball and Master Ball pattern prints.
 *
 * Scope: exactly the faces js/app.js paints `foil-reverse foil-rev-<ball> foil-prism` (a card with `pattern`) that
 * carry a TCG Live foil map, in sv8pt5: 167 faces in the census of 2026-11-23 (100 Poké Ball, 67 Master Ball). The
 * regular sv8pt5 reverses stay with sv-reverse.
 *
 * The recipe stays css/holo/prismatic.css; css/holo/fam/sv-prismatic.css retunes it (neutral silver base, a pastel
 * ball gradient that spans the ball, a darker Master Ball) and this module adds the ink knockout:
 *   --prism-ink  assets/foil/fam/sv-prismatic/<n>-ink.webp, alpha 0 on the card's black ink (most `-ball` maps do
 *                not cut the text out, so the hard-lit foil recoloured it). Drawn by
 *                .claude/skills/card-textures/scripts/fam/sv-prismatic/make_ink_masks.py, one per card number.
 * Research and what changed: .claude/skills/card-textures/reference/fam-sv-prismatic.md.
 */

/** Whether a card face is this family's. */
export function claims(card) {
  if (!card || card.reverse || !card.pattern || !card.foilMap) return false;
  return /^sv8pt5-/.test(String(card.id || ""));
}

export function famExtras(card, url, base) {
  if (!claims(card, base)) return null;
  const n = String(card.number || "").split("-")[0];
  const style = n ? `--prism-ink:url('${url(`assets/foil/fam/sv-prismatic/${n}-ink.webp`)}')` : "";
  return { classes: n ? "fam-sv-prismatic svpr-ink" : "fam-sv-prismatic", style, cure: false };
}
