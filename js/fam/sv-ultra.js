/**
 * Holo family sv-ultra: the Scarlet & Violet full-art Ultra Rares, Pokémon ex and Supporters (holo accuracy overhaul,
 * 2026-10-22).
 *
 * Scope: every non-reverse face whose rarity (after foilLook(), so a promo's foilAs) is "Ultra Rare" in the Scarlet &
 * Violet sets (ids `sv<n>-`, `rsv10pt5-`, `zsv10pt5-` and the SV Black Star promos `svp-`, which carry no `era-sv`
 * class), drawn on a foil map: the app's `foil-ultra` pattern. Not the Tera ex (`foil-ultra foil-tera`, sv-tera), the
 * Shiny Ultra Rares (their own rarity, sv-shiny), the Scodix golds or the Hyper Rares (`foil-gold`). 225 faces on
 * 2026-10-22 (census: era sv, foil-ultra, not foil-tera, not foil-shiny).
 *
 * TCG Live prints them SUN_PILLAR / ETCHED: the whole face is foil under the ink (Live's map: frame ~0.96, figure
 * 0.4-0.9) with a fingerprint etch over all of it; every face here has Live's foil and etch maps in the data, which are
 * right, so this module adds no asset. It only adds the class `fam-sv-ultra`: the look is css/holo/fam/sv-ultra.css
 * (narrow parallel diagonal rainbow bands that show only toward grazing angles, the ink keeping its printed colour
 * between them, a fine glitter grain, the etch at rest), which overrides the era's recipe in css/holo/sv-fullart.css.
 * Research and photos: .claude/skills/card-textures/reference/fam-sv-ultra.md.
 */

/** Scarlet & Violet set and promo ids (sv1-, sv3pt5-, rsv10pt5-, zsv10pt5-, svp-; not sve- energies or me-). */
const SV_ID = /^(?:[zr]?sv\d|svp-)/;

/** Whether a card face is this family's. */
export function claims(card, base) {
  if (!card || card.reverse || card.pattern) return false;
  if (!SV_ID.test(String(card.id || ""))) return false;
  if (card.rarity !== "Ultra Rare" || card.finish === "scodix") return false;
  // Tera ex full arts are `foil-ultra foil-tera` (js/app.js isTeraFoil): sv-tera's
  if (card.foilMap && (card.subtypes || []).includes("Tera")) return false;
  // drawn on a foil map (the data's, or foilExtras()' white fallback): the map recipe, never the no-map one
  return Boolean(card.foilMap) || / has-foil-map /.test(` ${base?.classes || ""} `);
}

export function famExtras(card, url, base) {
  if (!claims(card, base)) return null;
  return { classes: "fam-sv-ultra", style: "", cure: false };
}
