/**
 * Holo family me-sir: the Mega Evolution Special Illustration Rares (holo accuracy overhaul, 2026-10-22).
 *
 * Scope: every non-reverse face whose rarity (after foilLook(), so a promo's foilAs) is "Special Illustration Rare" in
 * the Mega Evolution sets (ids `me1-` to `me5-` and `me2pt5-`; not `me55-`, the 30th Celebration keeps its own family)
 * and that is drawn on a foil map: the app's `foil-sir` pattern with `.has-foil-map.era-me`. 55 faces on 2026-10-23,
 * every one with TCG Live's foil map and etch map in the data (`has-foil-map has-etch-map era-me`).
 *
 * TCG Live prints them SV_ULTRA / ETCHED: the whole face is foil under the ink (Live's map: the frame at full, the
 * painted background graded by tone, the Pokémon at 0), with a fingerprint etch over all of it. Photos of the real
 * cards (Japanese SARs of the same cards, reference/fam-me-sir.md): a neutral silver frame whose swirl engraving reads
 * even in flat light, fine silver pinpoint sparkle over the art, the text and the frame (gold on the yellow rule box),
 * the painting keeping its own saturation and its blacks, and rainbow only as one narrow band on the frame at a
 * grazing angle.
 *
 * What it adds (the look is css/holo/fam/me-sir.css, which overrides the shared SIR recipe in css/holo/celebration.css
 * for these faces only):
 *   fam-me-sir   the class every rule of the sheet is scoped to.
 *   --mesir-map  the card's mask: Live's foil map with the black ink cut out
 *                (assets/foil/fam/me-sir/<set>/<n>-map-v1.webp, scripts/fam/me-sir/make_sir_masks.py), so no layer
 *                lifts the text or Darkrai's black ground.
 *   cure: true   the `.cure` span: the silver frame (a multiplied grey with the swirl engraving in it).
 */

// me55 too since 2026-11-28 (the shared SIR recipe hazed the 30th Celebration SIRs white); those use Live's map as it is
const ME_ID = /^j?me(\d(pt5)?[a-z]?|55)-/;
const DIR = "assets/foil/fam/me-sir";

/** Prints whose frame is printed as a rainbow, not silver (frame chroma over 0.4 in the scan; the only one of the 55 on
 * 2026-11-23: Ascended Heroes' Pikachu ex 277): the frame layer dims it a little instead of greying it. */
const PRISM_FRAME = new Set(["me2pt5-277"]);

/** The mask's path: `<set>/<number>` from the id (me2pt5-284 -> me2pt5/284). */
function maskPath(card) {
  const id = String(card.id);
  const cut = id.indexOf("-");
  return `${DIR}/${id.slice(0, cut)}/${id.slice(cut + 1)}-map-v1.webp`;
}

/** Whether a card face is this family's. */
export function claims(card, base) {
  if (!card || card.reverse || card.pattern) return false;
  if (card.rarity !== "Special Illustration Rare" || card.finish === "scodix") return false;
  if (!ME_ID.test(String(card.id || ""))) return false;
  // drawn on a foil map (the data's, or foilExtras()' white fallback): the map recipe, never the no-map one
  return Boolean(card.foilMap) || / has-foil-map /.test(` ${base?.classes || ""} `);
}

export function famExtras(card, url, base) {
  if (!claims(card, base)) return null;
  // Every claimed face has a Live foil map (2026-10-23); one without paints through the white fallback, the sheet's
  // mask falling back to --foil-map.
  const style = card.foilMap && !String(card.id).startsWith("me55-") ? `--mesir-map:url('${url(maskPath(card))}')` : "";
  const classes = PRISM_FRAME.has(String(card.id)) ? "fam-me-sir mesir-prism-frame" : "fam-me-sir";
  return { classes, style, cure: true };
}
