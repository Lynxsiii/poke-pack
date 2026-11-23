/**
 * Holo family sv-ir: the Scarlet & Violet Illustration Rares (holo accuracy overhaul, 2026-11-23).
 *
 * Scope: every non-reverse face whose rarity (after foilLook(), so a promo's foilAs) is "Illustration Rare" in the
 * Scarlet & Violet sets: ids `sv<n>-`, `rsv10pt5-`, `zsv10pt5-` (the faces foilExtras() marks `era-sv`) and the
 * SV Black Star promos filed under set `svp-` (no `era-sv`: Miraidon ex 028, Koraidon ex 029, Pikachu 088, Marnie's
 * Morpeko 206, Steven's Beldum 207). 441 faces on 2026-11-23, the census' old `foil-ir` + era sv group one for one.
 * Not the Mega Evolution IRs (me-ir) and not the 30th Celebration's.
 *
 * TCG Live prints them SUN_PILLAR / HOLO with a per-card foil map, which the data already carries for every face
 * (white with alpha: the Pokemon and dark ink near 0, the painted background and the text graded, the silver
 * border near 0). The look is css/holo/fam/sv-ir.css, scoped to `.fam-sv-ir` (photos and facts:
 * reference/fam-sv-ir.md).
 *
 *   fam-sv-ir  the class every rule of the sheet is scoped to.
 *   svir-ex    Miraidon ex / Koraidon ex (SVP 028/029): regular ex-frame promos that Live files as IR. The real
 *              card is foil over the whole face, Pokemon included (Shopee and Amazon photos), so they paint
 *              through the all-white map instead of Live's (which blacks out the Pokemon).
 */

const SV_ID = /^([zr]?sv\d|svp-)/;
const WHOLE_FACE = new Set(["svp-svp028", "svp-svp029"]);

/** Whether a card face is this family's. */
export function claims(card) {
  if (!card || card.reverse || card.pattern) return false;
  if (card.rarity !== "Illustration Rare") return false;
  return SV_ID.test(String(card.id || ""));
}

export function famExtras(card, url, base) {
  if (!claims(card)) return null;
  if (WHOLE_FACE.has(String(card.id))) {
    return { classes: "fam-sv-ir svir-ex", style: `--foil-map:url('${url("assets/foil/maps/full.webp")}')`, cure: false };
  }
  return { classes: "fam-sv-ir", style: "", cure: false };
}
