/**
 * Holo family sv-promo (holo accuracy overhaul, 2026-10-22; built 2026-11-23 from the audit w2-sv-promo): the
 * Scarlet & Violet Black Star promos printed in cosmos holo, their stamped prints included.
 *
 * Scope: a face whose finish is Cosmos (foilLook() has run), with a TCG Live foil map and a Scarlet & Violet id
 * (sv1-sv10, the pt5 sets, zsv/rsv, svp-), that is an SVP-numbered promo (`svp009` ...) or a stamped print
 * (`12-stamp`, `wht062-stamp`). 53 faces in the census of 2026-11-23. Not claimed, left to the era sheets: the
 * set-number cosmos blister promos (sv3pt5 26-cosmos, sv9 135-cosmos ...), the 151 cosmos energies, Trick or Trade,
 * McDonald's confetti, the Metal Mew, the Black White Rares and the Costco galaxy reverses (see the reference note).
 *
 * The cosmos recipe stays css/holo/promos.css; css/holo/fam/sv-promo.css replaces its ground: at rest the clean
 * scans get the charcoal border and the white speck field the real card shows in flat light; lit, the colour lives
 * only in the specks (promos.css ::before) and the art keeps its colours (no full-area rainbow screen).
 *   cosmos-pixel  added for Smoliv SVP 023, Pineco SVP 061 and Toxel SVP 119: photos show the retro (pixel) print,
 *                 although SVP numbers below 140 default to the smooth one (js/foil-maps.js pixelCosmos()).
 *   --foil-map    Pineco SVP 061 and Cetitan SVP 063: the shipped maps were a flat window over the Pokémon; ours cut
 *                 Pineco out and keep Cetitan's foil to the border (assets/foil/fam/sv-promo/map-<id>.webp).
 * Research and what changed: .claude/skills/card-textures/reference/fam-sv-promo.md.
 */

const SV_ID = /^(?:[zrj]?sv\d|svp-)/;
const PIXEL = new Set(["sv2-svp023", "sv4-svp061", "sv6-svp119"]);
/** Shipped maps that put the window's foil over the Pokémon; redrawn by scripts/fam/sv-promo/make_maps.py. */
const OWN_MAP = new Set(["sv4-svp061", "sv4-svp063"]);

/** Whether a card face is this family's. */
export function claims(card) {
  if (!card || card.reverse || card.pattern || !card.foilMap) return false;
  if (card.rarity !== "Cosmos") return false;
  const id = String(card.id || "");
  if (!SV_ID.test(id)) return false;
  return /^svp\d/i.test(String(card.number || "")) || /-stamp$/.test(id);
}

export function famExtras(card, url, base) {
  if (!claims(card, base)) return null;
  const classes = PIXEL.has(card.id) ? "fam-sv-promo cosmos-pixel" : "fam-sv-promo";
  const style = OWN_MAP.has(card.id) ? `--foil-map:url('${url(`assets/foil/fam/sv-promo/map-${card.id}.webp`)}')` : "";
  return { classes, style, cure: false };
}
