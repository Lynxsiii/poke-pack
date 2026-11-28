/**
 * Holo family sv-shiny (holo accuracy overhaul, 2026-10-22; built 2026-11-23 from the audit w2-sv-shiny): the Paldean
 * Fates (sv4pt5) Shiny Rares and Shiny Ultra Rares, including the set's SVP promo prints filed under sv4pt5.
 *
 * Scope: exactly the faces js/app.js files as `foil-holo foil-shiny` / `foil-ultra foil-shiny` with a Scarlet & Violet
 * id and a TCG Live foil map (149 faces in the census of 2026-11-23: 129 Shiny Rare, 20 Shiny Ultra Rare). Hidden
 * Fates (sm-shiny) and Shining Fates (swsh) shinies are other families.
 *
 * TCG Live prints them SUN_PILLAR / ETCHED: grey mirror silver with a fingerprint etch in whorls round the Pokémon.
 * A Shiny Rare is foil in the art window and the border; a Shiny Ultra Rare is foil edge to edge. The data's foil,
 * etch and etch-angle maps are right, so this module adds no asset, only classes:
 *   fam-sv-shiny  every claimed face (css/holo/fam/sv-shiny.css scopes every rule to it).
 *   ssh-sur       the Shiny Ultra Rares: broader, stronger bands over a darker ground.
 * The stamped Great Tusk promo's card image is a photo of a foil card (silver and glare baked in), so its foil is
 * lighter. Research and what changed: .claude/skills/card-textures/reference/fam-sv-shiny.md.
 */

/** Scarlet & Violet set and promo ids (sv1-, sv4pt5-, rsv10pt5-, svp-; not me-). */
const DIR = "assets/foil/fam/sv-shiny";
const SV_ID = /^(?:[zrj]?sv\d|svp-)/;

/** Whether a card face is this family's. */
export function claims(card) {
  if (!card || card.reverse || card.pattern || !card.foilMap) return false;
  if (!SV_ID.test(String(card.id || ""))) return false;
  return card.rarity === "Shiny Rare" || card.rarity === "Shiny Ultra Rare";
}

export function famExtras(card, url, base) {
  if (!claims(card, base)) return null;
  const classes = card.rarity === "Shiny Ultra Rare" ? "fam-sv-shiny ssh-sur" : "fam-sv-shiny";
  // The Pokémon cut out of Live's foil map (make_shiny_masks.py): set after the era's --foil-map, so it wins.
  const id = String(card.id);
  const cut = id.indexOf("-");
  const map = `--foil-map:url('${url(`${DIR}/${id.slice(0, cut)}/${id.slice(cut + 1)}-foil-v1.webp`)}')`;
  // The stamped promos' images are photos of the foil card (silver and glare baked in): a light touch only.
  const style = /-stamp$/.test(id) ? `${map};--foil-strength:0.3` : map;
  return { classes, style, cure: false };
}
