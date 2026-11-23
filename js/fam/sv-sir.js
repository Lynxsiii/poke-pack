/**
 * Holo family sv-sir: the Scarlet & Violet Special Illustration Rares (holo accuracy overhaul, 2026-10-22).
 *
 * Scope: every non-reverse face whose rarity (after foilLook(), so a promo's foilAs) is "Special Illustration Rare"
 * in the Scarlet & Violet sets (ids `sv<n>-`, `rsv10pt5-`, `zsv10pt5-`: the faces foilExtras() marks `era-sv`), drawn
 * on a foil map: the app's `foil-sir` pattern with `.has-foil-map.era-sv`. 172 faces on 2026-10-22 (the census: era
 * sv, foil-sir), the 18 Future/Ancient (`frame-paradox`) prints, the three Prismatic Evolutions promos that carry
 * `has-etch-angle` (svp174-176) and Team Rocket's Moltres ex with its Destined Rivals stamp (sv10 229-stamp) among
 * them. Not the Mega Evolution SIRs (`era-me`, me-sir) and not the 30th Celebration's.
 *
 * TCG Live prints them SV_ULTRA / ETCHED: the whole face is foil under the ink (Live's map: frame ~0.97, art
 * background 0.3-0.7, the Pokémon 0.06-0.35) with a fingerprint etch over all of it. Photos of the real cards
 * (reference/fam-sv-sir.md): dense pinpoint glitter, each speck one saturated spectral colour, over sub-pixel ridges;
 * the painting keeps its colours and its black ink; a grainy mid-grey silver frame; one local spectral flare near the
 * light.
 *
 * What it adds (the look is css/holo/fam/sv-sir.css, which overrides the shared SIR recipe in css/holo/celebration.css):
 *   fam-sv-sir   the class every rule of the sheet is scoped to.
 *   --svsir-map  the card's own mask (assets/foil/fam/sv-sir/<set>/<n>-map-v1.webp, drawn by
 *                scripts/fam/sv-sir/make_sir_masks.py): TCG Live's foil map (the stamp already cut out of Moltres'),
 *                times a keep-dark pass from the scan, so black text, HP numbers and line art stay matte black under
 *                every layer.
 *   cure: true   the `.cure` span: the silver frame's own layer (a multiplied mid grey, masked to the frame by the map
 *                to the sixth power), which `.foil`'s colour-dodge cannot darken.
 *   svsir-prism-frame  the Stellar Tera prints whose frame is printed as a rainbow crystal (STELLAR_FRAME: frame chroma
 *                over 0.4 in the scan, measured 2026-10-22; Surging Sparks' Pikachu ex 238 in hand: a bright rainbow
 *                frame), which the frame layer only dims a little instead of greying.
 */

/** Scarlet & Violet set ids (sv1-, sv3pt5-, rsv10pt5-, zsv10pt5-): the faces foilExtras() marks `era-sv`. */
const SV_ID = /^[zr]?sv\d/;
const DIR = "assets/foil/fam/sv-sir";

/** Stellar Tera SIRs with a printed rainbow crystal frame (the rest have the plain silver one). */
const STELLAR_FRAME = new Set([
  "sv7-168", "sv7-170", "sv8-238", "sv8-240", "sv8-242", "sv8pt5-144", "sv8pt5-146", "sv8pt5-147", "sv8pt5-149",
  "sv8pt5-150", "sv8pt5-153", "sv8pt5-155", "sv8pt5-156", "sv8pt5-161", "sv8pt5-167", "sv8pt5-169", "sv8pt5-svp174",
  "sv8pt5-svp175", "sv8pt5-svp176",
]);

/** Whether a card face is this family's. */
export function claims(card, base) {
  if (!card || card.reverse || card.pattern) return false;
  if (card.rarity !== "Special Illustration Rare" || card.finish === "scodix") return false;
  if (!SV_ID.test(String(card.id || ""))) return false;
  // drawn on a foil map (the data's, or foilExtras()' white fallback): the map recipe, never the no-map one
  return Boolean(card.foilMap) || / has-foil-map /.test(` ${base?.classes || ""} `);
}

/** The mask's path: `<set>/<number>` from the id (sv10-229-stamp -> sv10/229-stamp). */
function maskPath(card) {
  const id = String(card.id);
  const cut = id.indexOf("-");
  return `${DIR}/${id.slice(0, cut)}/${id.slice(cut + 1)}-map-v1.webp`;
}

export function famExtras(card, url, base) {
  if (!claims(card, base)) return null;
  // Every claimed face has a Live foil map in the data (2026-10-22); a face without one keeps the era's recipe
  // inputs and paints through the white fallback, with the sheet's keep-dark mask falling back to --foil-map.
  const style = card.foilMap ? `--svsir-map:url('${url(maskPath(card))}')` : "";
  const classes = STELLAR_FRAME.has(String(card.id)) ? "fam-sv-sir svsir-prism-frame" : "fam-sv-sir";
  return { classes, style, cure: true };
}
