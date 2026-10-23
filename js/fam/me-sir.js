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
 *   cure: true   the `.cure` span: the sparkle layer (its own colour-dodge, so it can light ink in its own hue
 *                without the relief's soft-light or the band's screen).
 */

const ME_ID = /^me\d(pt5)?-/;

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
  return { classes: "fam-me-sir", style: "", cure: true };
}
