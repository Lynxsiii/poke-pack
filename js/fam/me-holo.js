/**
 * Holo family me-holo (holo accuracy overhaul, 2026-10-22): the Mega Evolution era's holo Rares and Double Rares
 * (me1-me5, me2pt5 and their MEP promos filed as a Rare or a Double Rare; not the 30th Celebration, me55).
 *
 * Scope: every face that the era draws as one of TCG Live's three foils for these rarities (js/app.js foilPattern(),
 * js/foil-maps.js `era-me`), and only those, each with its TCG Live foil map:
 *   meh-rare   `foil-holo foil-svholo`: the holo Rare, SV_HOLO. One narrow rainbow streak with a silver-white core over
 *              the art window's background and the silver border, fine silver glitter; the Pokémon and the print matte.
 *   meh-mega   `foil-ex foil-sunpillar has-etch-map` (Mega ex) and `foil-ex foil-tera` (Tera ex): SV_ULTRA etched,
 *              the whole face foil, a dense multicolour glitter and rainbow patches near the light.
 *   meh-ex     `foil-ex foil-sunpillar` with no etch map: the regular-frame ex, SUN_PILLAR + SouthernCross stars.
 *              Claimed so the family owns every face of its group, but drawn exactly as before (sv-double-rare.css):
 *              no photo of an ME one exists yet.
 *   meh-energy a Special Energy Rare (its art circle is nearly all foil in the Live map): the streak a little weaker.
 *
 * See js/holo-fam.js for the contract: famExtras(card, url, base) returns null when the face is not this family's,
 * else { classes, style, cure }; `card` has been through foilLook(); `base` is the era's own extras for the face.
 * Research and what changed: .claude/skills/card-textures/reference/fam-me-holo.md.
 */

const ME_ID = /^me\d(pt5)?-/;

const isExCard = (card) =>
  (card.subtypes || []).some((s) => String(s).toLowerCase() === "ex") || /(^|\s)ex$/i.test(card.name || "");

/** The family's kind for a face ("rare", "mega", "ex"), or "" when the face is not this family's. */
export function kindOf(card) {
  if (!card || card.reverse || card.pattern || !card.foilMap) return "";
  if (!ME_ID.test(String(card.id || ""))) return "";
  if (card.finish === "scodix") return "";
  if (card.rarity === "Double Rare") {
    // foil-ex foil-tera (isTeraFoil in js/app.js), then foil-ex foil-sunpillar: the etch map tells a Mega ex from a regular ex.
    if ((card.subtypes || []).includes("Tera")) return "mega";
    if (isExCard(card)) return card.etchMap ? "mega" : "ex";
    return "";
  }
  // foil-holo foil-svholo: a Rare with a map that is not an ex (an ex Rare is foil-ex).
  if (card.rarity === "Rare" && !isExCard(card)) return "rare";
  return "";
}

/** Whether a card face is this family's. */
export function claims(card) {
  return Boolean(kindOf(card));
}

export function famExtras(card, url, base) {
  const kind = kindOf(card);
  if (!kind) return null;
  const classes = ["fam-me-holo", `meh-${kind}`];
  if (kind === "rare" && (card.supertype === "Energy" || card.energy)) classes.push("meh-energy");
  return { classes: classes.join(" "), style: "", cure: false };
}
