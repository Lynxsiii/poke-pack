/**
 * Holo family sv-holo (holo accuracy overhaul, 2026-10-22; built 2026-11-23): the Scarlet & Violet holo Rare, TCG Live's
 * SV_HOLO / HOLO (`foil-holo foil-svholo`): every non-ex Rare with a foil map whose id is a Scarlet & Violet one (sv1-sv10,
 * the pt5 sets, rsv/zsv, the SVP promos) or a Trick or Trade 2023 reprint (tot23, which misses `era-sv`).
 * Mega Evolution holo Rares stay with me-holo; me55 (30th Celebration) with me55.
 *
 * Extra classes for two faces whose assets fight the foil (see the reference note):
 *   svh-rectmap  tot23-21 Houndoom: its foil map is a plain art-window rectangle (no cut for the Pokémon), so the band
 *                and glitter are held weaker until someone draws a map.
 *   svh-baked    sv10-96-prerelease: its scan has the real card's foil sparkle baked in, so no glitter on top.
 *   svh-late     Surging Sparks onward (sv8 and later): the glitter a step more visible, as the photos show.
 *
 * See js/holo-fam.js for the contract: famExtras(card, url, base) returns null when the face is not this family's,
 * else { classes, style, cure }; `card` has been through foilLook(); `base` is the era's own extras for the face.
 * Research and what changed: .claude/skills/card-textures/reference/fam-sv-holo.md.
 */

const SV_ID = /^([zr]?sv\d|svp-|tot23-)/;
const RECT_MAP = new Set(["tot23-21"]);
const BAKED = new Set(["sv10-96-prerelease"]);
/* Surging Sparks onward: the photos show the fine glitter a step more visible. */
const LATE = /^(sv8|sv8pt5|sv9|sv10|rsv10pt5|zsv10pt5)-/;

const isExCard = (card) =>
  (card.subtypes || []).some((s) => String(s).toLowerCase() === "ex") || /(^|\s)ex$/i.test(card.name || "");

/** Whether a card face is this family's. */
export function claims(card) {
  if (!card || card.reverse || card.pattern || !card.foilMap) return false;
  if (!SV_ID.test(String(card.id || ""))) return false;
  if (card.rarity !== "Rare" || card.finish === "scodix") return false;
  return !isExCard(card);
}

export function famExtras(card, url, base) {
  if (!claims(card, base)) return null;
  const classes = ["fam-sv-holo"];
  if (RECT_MAP.has(card.id)) classes.push("svh-rectmap");
  if (BAKED.has(card.id)) classes.push("svh-baked");
  if (LATE.test(card.id)) classes.push("svh-late");
  return { classes: classes.join(" "), style: "", cure: false };
}
