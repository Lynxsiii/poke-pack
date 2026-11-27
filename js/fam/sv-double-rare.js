/**
 * Holo family sv-double-rare (holo accuracy overhaul, 2026-10-22; built 2026-11-23): the Scarlet & Violet Double Rare
 * ex on TCG Live's SUN_PILLAR foil with the SouthernCross star coat (`foil-ex foil-sunpillar` + `cure-stars`).
 *
 * Scope: every face the app draws as `foil-ex foil-sunpillar` (js/app.js foilPattern(): a Double Rare ex with a foil
 * map, not Tera) whose id is a Scarlet & Violet one (sv1-sv10, the pt5 sets, rsv/zsv, and the SVP black-star promos).
 * The 36 SVP faces miss `era-sv` (js/foil-maps.js tests /^[zrj]?sv\d/), so the sheet is scoped to the family class
 * alone and draws them like their set siblings. Mega Evolution Double Rares stay with me-holo; Tera ex are foil-tera.
 *
 * See js/holo-fam.js for the contract: famExtras(card, url, base) returns null when the face is not this family's,
 * else { classes, style, cure }; `card` has been through foilLook(); `base` is the era's own extras for the face.
 * Research and what changed: .claude/skills/card-textures/reference/fam-sv-double-rare.md.
 */

const SV_ID = /^([zrj]?sv\d|svp-)/;

const isExCard = (card) =>
  (card.subtypes || []).some((s) => String(s).toLowerCase() === "ex") || /(^|\s)ex$/i.test(card.name || "");

/** Whether a card face is this family's. */
export function claims(card) {
  if (!card || card.reverse || card.pattern || !card.foilMap) return false;
  if (!SV_ID.test(String(card.id || ""))) return false;
  if (card.rarity !== "Double Rare" || card.finish === "scodix") return false;
  if ((card.subtypes || []).includes("Tera")) return false;
  return isExCard(card);
}

export function famExtras(card, url, base) {
  if (!claims(card, base)) return null;
  return { classes: "fam-sv-double-rare", style: "", cure: false };
}
