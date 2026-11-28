/**
 * Holo family swsh-rainbow: the Sword & Shield Rainbow Rares (holo accuracy overhaul; built 2026-11-23 from the audit
 * w2-swsh-rainbow).
 *
 * Scope: exactly the faces swshPattern() in js/foil-maps.js files as `foil-ir swsh-rainbow` ("Rare Rainbow" of a Sword
 * & Shield era print, plus Crown Zenith's showcase Pikachu swsh12pt5-160, which swshPattern() routes here): 181 faces
 * in the census of 2026-11-23 (70+10 Supporters, 75 VMAX, 25 VSTAR, the Pikachu). The test restates swshPattern()'s
 * branch, since a family module must not import js/foil-maps.js (it waits on this module).
 *
 * What it adds (the sheet's hooks; photos and facts in .claude/skills/card-textures/reference/fam-swsh-rainbow.md):
 *   fam-swsh-rainbow  every claimed face (css/holo/fam/swsh-rainbow.css scopes every rule to it): the printed pastel
 *                     rainbow stays put; the foil is a coarse silver glitter (a few grains prismatic) sitting on TCG
 *                     Live's etch, visible flat, and lit a silver-grey light with a faint gold-green / silver-cyan
 *                     metallic cast on the background. No second spectrum over the print.
 *   srb-alt           the 15 alternate-art VMAX secret rares the data files as "Rare Rainbow" (Moonbreon swsh7-215 and
 *                     kin): full-colour textured paintings, no glitter rainbow stock. Drawn as the etched texture
 *                     catching a silver light, no coarse glitter. Their filing belongs in js/foil-maps.js (see the
 *                     reference note): they should ride the alt-art VMAX recipe.
 *   srb-show          Crown Zenith Pikachu swsh12pt5-160: a soft fine sparkle on the art's background and bolts only
 *                     (Live's map), weaker than the rainbow stock.
 *   --srb-grain       the glitter tile (scripts/fam/swsh-rainbow/make_grain.py).
 */
const DIR = "assets/foil/fam/swsh-rainbow";

/** A Sword & Shield era print (isSwsh() in js/foil-maps.js). */
function isSwsh(card) {
  return card?.era === "swsh" || /^(swsh|cel25|pgo)/.test(String(card?.id || ""));
}

/** swshPattern()'s rainbow branch: whether the face is `foil-ir swsh-rainbow`. */
function swshRainbow(card) {
  if (!card || card.reverse || card.pattern) return false;
  if (!isSwsh(card) || (card.foilAs && card.era !== "swsh")) return false;
  if (card.gallery === "cc" || card.gallery === "sv") return false;
  if (String(card.id || "").startsWith("cel25-") && (card.rarity === "Rare" || card.rarity === "Rare Holo")) return false;
  if (card.rarity === "Rare Rainbow" || altVmax(card)) return true;
  return card.rarity === "Rare Secret" && String(card.id || "") === "swsh12pt5-160";
}

/** An alternate-art VMAX / VSTAR filed "Rare Ultra" (the Japanese SAR and CSR prints): swshPattern()'s `swsh-alt` branch. */
function altVmax(card) {
  const subs = card.subtypes || [];
  return card.rarity === "Rare Ultra" && card.supertype !== "Trainer" && (subs.includes("VMAX") || subs.includes("VSTAR"));
}

const ALT = new Set([
  "swsh5-168", "swsh5-170", "swsh6-201", "swsh6-203", "swsh6-205", "swsh7-205", "swsh7-209", "swsh7-212",
  "swsh7-215", "swsh7-218", "swsh7-220", "swsh8-266", "swsh8-269", "swsh8-270", "swsh8-271",
]);

/** Whether a card face is this family's. */
export function claims(card) {
  return swshRainbow(card);
}

export function famExtras(card, url, base) {
  if (!claims(card, base)) return null;
  const id = String(card.id || "");
  const classes = ["fam-swsh-rainbow"];
  if (ALT.has(id) || altVmax(card)) classes.push("srb-alt");
  if (id === "swsh12pt5-160") classes.push("srb-show");
  const style = `--srb-grain:url('${url(`${DIR}/grain-v1.webp`)}')`;
  return { classes: classes.join(" "), style, cure: false };
}
