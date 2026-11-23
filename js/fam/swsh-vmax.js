/**
 * Holo family swsh-vmax: the regular Sword & Shield Pokémon VMAX and VSTAR (holo accuracy overhaul; built 2026-11-23
 * from the audit w2-swsh-vmax).
 *
 * Scope: exactly the faces swshPattern() in js/foil-maps.js files as `foil-ultra swsh-vmax` ("Rare Holo VMAX") or
 * `foil-ultra swsh-vstar` ("Rare Holo VSTAR") of a Sword & Shield era print: 111 + 56 faces in the census of
 * 2026-11-23. Not the Shiny Vault VMAX (`sf-shiny sf-vmax`) and not the "Rare Ultra" alternate-art VMAX/VSTAR
 * (`swsh-vmax swsh-alt`, none in the data today). The test restates swshPattern()'s branch, since a family module must
 * not import js/foil-maps.js (it waits on this module).
 *
 * What it adds (the sheet's hooks; photos and facts in .claude/skills/card-textures/reference/fam-swsh-vmax.md):
 *   fam-swsh-vmax  every claimed face (css/holo/fam/swsh-vmax.css scopes every rule to it): whole-card foil, Pokémon
 *                  included; TCG Live's fingerprint etch as ridges that catch the light; narrow rainbow bands rising
 *                  to the right that ride the ridges; dark ink kept dark.
 *   svm-vstar      the VSTAR: the same stock with paler, pastel bands (white frame, pale starburst).
 *   svm-alt        the Trainer Gallery and Galarian Gallery VMAX/VSTAR (TG/GG numbers): painted alt arts, the bands
 *                  and the glare held back over the painting.
 */

/** A Sword & Shield era print (isSwsh() in js/foil-maps.js). */
function isSwsh(card) {
  return card?.era === "swsh" || /^(swsh|cel25|pgo)/.test(String(card?.id || ""));
}

/** swshPattern()'s VMAX / VSTAR branches: "vmax", "vstar" or "". */
function swshVmax(card) {
  if (!card || card.reverse || card.pattern) return "";
  if (!isSwsh(card) || (card.foilAs && card.era !== "swsh")) return "";
  if (card.gallery === "cc" || card.gallery === "sv") return "";
  if (card.rarity === "Rare Holo VMAX") return "vmax";
  if (card.rarity === "Rare Holo VSTAR") return "vstar";
  return "";
}

/** Whether a card face is this family's. */
export function claims(card) {
  return swshVmax(card) !== "";
}

export function famExtras(card, url, base) {
  const kind = swshVmax(card);
  if (!kind) return null;
  const classes = ["fam-swsh-vmax"];
  if (kind === "vstar") classes.push("svm-vstar");
  if (card.gallery === "tg" || card.gallery === "gg" || /-(TG|GG)\d/.test(String(card.id || ""))) classes.push("svm-alt");
  return { classes: classes.join(" "), style: "", cure: false };
}
