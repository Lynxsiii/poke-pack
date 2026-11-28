/**
 * Holo family swsh-v: the regular (half-art) Sword & Shield Pokémon V (holo accuracy overhaul; built 2026-11-23 from the
 * audit w2-swsh-v).
 *
 * Scope: exactly the faces swshPattern() in js/foil-maps.js files as `foil-ex swsh-v` ("Rare Holo V" of a Sword & Shield
 * era print with no TCG Live etch map; the etched ones are full arts, swsh-fullart): 309 faces in the census of
 * 2026-11-23. The test restates swshPattern()'s branch, since a family module must not import js/foil-maps.js (it waits
 * on this module).
 *
 * What it adds (the sheet's hooks; photos and facts in .claude/skills/card-textures/reference/fam-swsh-v.md):
 *   fam-swsh-v   every claimed face (css/holo/fam/swsh-v.css scopes every rule to it): foil over the whole face except the
 *                Pokémon (TCG Live's map, no floor), a fine brushed sparkle rising to the right, narrow saturated diagonal
 *                rainbow bands that slide with the tilt, dark ink kept dark.
 *   svv-union    the V-UNION pieces (a quarter of one picture, printed sideways): Live maps far more of their art as foil,
 *                so the sheet holds their bands back.
 *   --svv-grain  the sparkle tile (scripts/fam/swsh-v/make_grain.py).
 */
const DIR = "assets/foil/fam/swsh-v";

/** A Sword & Shield era print (isSwsh() in js/foil-maps.js). */
function isSwsh(card) {
  return card?.era === "swsh" || /^(swsh|cel25|pgo)/.test(String(card?.id || ""));
}

/** swshPattern()'s regular V branch: whether the face is `foil-ex swsh-v`. */
function swshV(card) {
  if (!card || card.reverse || card.pattern) return false;
  if (!isSwsh(card) || (card.foilAs && card.era !== "swsh")) return false;
  if (card.gallery === "cc") return false;
  if (card.gallery === "sv") return false;
  if (card.rarity !== "Rare Holo V") return false;
  return !card.etchMap;
}

/** Whether a card face is this family's. */
export function claims(card) {
  return swshV(card);
}

export function famExtras(card, url, base) {
  if (!claims(card, base)) return null;
  const classes = ["fam-swsh-v"];
  if ((card.subtypes || []).includes("V-UNION")) classes.push("svv-union");
  // The Japanese scans are photos of the foil print (its bands are in the picture): the added bands a touch only.
  if (/^j/.test(String(card.id || ""))) classes.push("svv-photo");
  const style = `--svv-grain:url('${url(`${DIR}/grain-v1.webp`)}')`;
  return { classes: classes.join(" "), style, cure: false };
}
