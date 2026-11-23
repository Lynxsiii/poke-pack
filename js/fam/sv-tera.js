/**
 * Holo family sv-tera (holo accuracy overhaul, 2026-10-22; built 2026-11-23 from the audit w2-sv-tera): the Scarlet &
 * Violet Tera Pokémon ex, the crystal-pattern Double Rares and their full-art Ultra Rares.
 *
 * Scope: exactly the faces js/app.js files as `foil-ex foil-tera` / `foil-ultra foil-tera` (isTeraFoil(): a Double or
 * Ultra Rare with the Tera subtype and a TCG Live foil map) whose id is a Scarlet & Violet one (sv1-sv10, the pt5 sets,
 * rsv/zsv, and the SVP black-star promos, which miss `era-sv`). 103 faces in the census of 2026-11-23 (68 Double Rare,
 * 35 Ultra Rare). The Mega Evolution era's six Tera faces stay with me-holo (me-finishes.css). The test restates
 * isTeraFoil(), since a family module must not import js/app.js.
 *
 * TCG Live prints them SV_ULTRA / ETCHED: the whole face is foil under the ink, the Pokémon and the text box at part
 * strength, a fine fingerprint etch with four-point sparkles over the art and frame. The data's foil and etch maps are
 * right, so this module adds no asset, only classes:
 *   fam-sv-tera  every claimed face (css/holo/fam/sv-tera.css scopes every rule to it).
 *   svt-fa       the full-art Ultra Rares: a softer pastel band and the weave etch that reads held flat.
 *   cure: true   the `.cure` layer carries the glitter's sparkle over the dodge, so it shows on the bright inks too.
 * Research and what changed: .claude/skills/card-textures/reference/fam-sv-tera.md.
 */

/** Scarlet & Violet set and promo ids (sv1-, sv3pt5-, rsv10pt5-, zsv10pt5-, svp-; not me-). */
const SV_ID = /^(?:[zr]?sv\d|svp-)/;

/** Whether a card face is this family's. */
export function claims(card) {
  if (!card || card.reverse || card.pattern || !card.foilMap) return false;
  if (!SV_ID.test(String(card.id || ""))) return false;
  if (card.finish === "scodix") return false;
  if (!(card.subtypes || []).includes("Tera")) return false;
  return card.rarity === "Double Rare" || card.rarity === "Ultra Rare";
}

export function famExtras(card, url, base) {
  if (!claims(card, base)) return null;
  const classes = card.rarity === "Ultra Rare" ? "fam-sv-tera svt-fa" : "fam-sv-tera";
  return { classes, style: "", cure: true };
}
