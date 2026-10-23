/**
 * Holo family sv-shiny (holo accuracy overhaul, 2026-10-22). Scaffold: claims nothing until its fix worker fills it in.
 * See js/holo-fam.js for the contract: famExtras(card, url, base) returns null when the face is not this family's,
 * else { classes, style, cure }; `card` has been through foilLook(); `base` is the era's own extras for the face.
 */

/** Whether a card face is this family's. */
export function claims(card) {
  return false;
}

export function famExtras(card, url, base) {
  if (!claims(card, base)) return null;
  return { classes: "fam-sv-shiny", style: "", cure: false };
}
