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
 *   meh-cosmos an ME-era pixel cosmos promo (`foil-holo foil-cosmos` + `cosmos-pixel`, audit group w2-me-cosmos):
 *              an achromatic ground (charcoal off the light, silver under it) with the colour only in the pixel specks.
 *              Where the same card exists as a plain holo Rare with TCG Live's map, its map is the drawn window map
 *              with the Pokémon cut out (COSMOS_MAPS, scripts/fam/me-holo/cosmos_maps.py).
 *
 * See js/holo-fam.js for the contract: famExtras(card, url, base) returns null when the face is not this family's,
 * else { classes, style, cure }; `card` has been through foilLook(); `base` is the era's own extras for the face.
 * Research and what changed: .claude/skills/card-textures/reference/fam-me-holo.md.
 */

const ME_ID = /^j?me\d(pt5)?[a-z]?-/;
const COSMOS_DIR = "assets/foil/fam/me-holo/cosmos/";

/* Pixel cosmos maps (scripts/fam/me-holo/cosmos_maps.py): drawn map min the plain print's TCG Live map where one exists
   (Pokémon cut out); the trainer-owned prints whose drawn window the owner-badge cut had wiped, redrawn; and the rest
   (no Live map, so no cut for the Pokémon) with the window held at about half until someone draws one. */
const COSMOS_MAPS = {
  "me1-34-cosmos": "me1-34-cosmos.webp",
  "me1-48-cosmos": "me1-48-cosmos.webp",
  "me1-58-cosmos": "me1-58-cosmos.webp",
  "me1-59-cosmos": "me1-59-cosmos.webp",
  "me1-64-stamp": "me1-64-stamp.webp",
  "me1-76-cosmos": "me1-76-cosmos.webp",
  "me1-88-ebgames": "me1-88-ebgames.webp",
  "me1-88-gamestop": "me1-88-gamestop.webp",
  "me1-88-stamp": "me1-88-stamp.webp",
  "me1-jtg018-cosmos": "me1-jtg018-cosmos.webp",
  "me1-jtg041-cosmos": "me1-jtg041-cosmos.webp",
  "me1-jtg085-cosmos": "me1-jtg085-cosmos.webp",
  "me1-jtg095-cosmos": "me1-jtg095-cosmos.webp",
  "me2-1-cosmos": "me2-1-cosmos.webp",
  "me2-17-stamp": "me2-17-stamp.webp",
  "me2-2-cosmos": "me2-2-cosmos.webp",
  "me2-26-cosmos": "me2-26-cosmos.webp",
  "me2-26-ebgames": "me2-26-ebgames.webp",
  "me2-26-gamestop": "me2-26-gamestop.webp",
  "me2-3-cosmos": "me2-3-cosmos.webp",
  "me2-8-stamp": "me2-8-stamp.webp",
  "me2-dri018-cosmos": "me2-dri018-cosmos.webp",
  "me2-dri036-cosmos": "me2-dri036-cosmos.webp",
  "me2-dri042-cosmos": "me2-dri042-cosmos.webp",
  "me2-dri159-cosmos": "me2-dri159-cosmos.webp",
  "me2pt5-123-cosmos": "me2pt5-123-cosmos.webp",
  "me2pt5-175-cosmos": "me2pt5-175-cosmos.webp",
  "me2pt5-20-cosmos": "me2pt5-20-cosmos.webp",
  "me2pt5-29-cosmos": "me2pt5-29-cosmos.webp",
  "me2pt5-41-cosmos": "me2pt5-41-cosmos.webp",
  "me2pt5-7-cosmos": "me2pt5-7-cosmos.webp",
  "me2pt5-8-cosmos": "me2pt5-8-cosmos.webp",
  "me3-24-stamp": "me3-24-stamp.webp",
  "me3-28-stamp": "me3-28-stamp.webp",
  "me3-50-ebgames": "me3-50-ebgames.webp",
  "me3-50-gamestop": "me3-50-gamestop.webp",
  "me3-meg010-cosmos": "me3-meg010-cosmos.webp",
  "me3-meg028-cosmos": "me3-meg028-cosmos.webp",
  "me3-meg038-cosmos": "me3-meg038-cosmos.webp",
  "me3-meg093-cosmos": "me3-meg093-cosmos.webp",
  "me4-10-ebgames": "me4-10-ebgames.webp",
  "me4-10-gamestop": "me4-10-gamestop.webp",
  "me4-13-stamp": "me4-13-stamp.webp",
  "me4-19-stamp": "me4-19-stamp.webp",
  "me4-pfl017-cosmos": "me4-pfl017-cosmos.webp",
  "me4-pfl034-cosmos": "me4-pfl034-cosmos.webp",
  "me4-pfl045-cosmos": "me4-pfl045-cosmos.webp",
  "me4-pfl053-cosmos": "me4-pfl053-cosmos.webp",
  "me5-12-stamp": "me5-12-stamp.webp",
  "me5-20-stamp": "me5-20-stamp.webp",
  "me5-40-cosmos": "me5-40-cosmos.webp",
  "me5-56-cosmos": "me5-56-cosmos.webp",
  "me5-56-stamp": "me5-56-stamp.webp",
  "me5-asc097-cosmos": "me5-asc097-cosmos.webp",
  "me5-por024-cosmos": "me5-por024-cosmos.webp",
  "me5-por028-cosmos": "me5-por028-cosmos.webp",
  "me5-por045-cosmos": "me5-por045-cosmos.webp",
  "me5-por050-cosmos": "me5-por050-cosmos.webp",
  "me6-26-stamp": "me6-26-stamp.webp",
  "me6-45-stamp": "me6-45-stamp.webp",
  "me6-53-stamp": "me6-53-stamp.webp",
  "me6-cri013-cosmos": "me6-cri013-cosmos.webp",
  "me6-cri019-cosmos": "me6-cri019-cosmos.webp",
  "me6-cri029-cosmos": "me6-cri029-cosmos.webp",
  "me6-cri042-cosmos": "me6-cri042-cosmos.webp"
};

const isExCard = (card) =>
  (card.subtypes || []).some((s) => String(s).toLowerCase() === "ex") || /(^|\s)ex$/i.test(card.name || "");

/** The family's kind for a face ("rare", "mega", "ex", "cosmos"), or "" when the face is not this family's. */
export function kindOf(card) {
  if (!card || card.reverse || card.pattern || !card.foilMap) return "";
  if (!ME_ID.test(String(card.id || ""))) return "";
  // Every ME-era cosmos promo is pixel cosmos (js/foil-maps.js pixelCosmos()).
  if (card.rarity === "Cosmos") return "cosmos";
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
  const map = kind === "cosmos" && COSMOS_MAPS[card.id];
  const style = map ? `--foil-map:url('${url(COSMOS_DIR + map)}')` : "";
  return { classes: classes.join(" "), style, cure: false };
}
