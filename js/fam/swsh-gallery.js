/**
 * Holo family swsh-gallery: the Sword & Shield Trainer Gallery and Galarian Gallery character rares (holo accuracy
 * overhaul; built 2026-11-23 from the audit w2-swsh-gallery).
 *
 * Scope: exactly the faces swshPattern() in js/foil-maps.js files as `foil-ex swsh-tg` ("Trainer Gallery Rare Holo" of
 * a Sword & Shield era print): 68 faces in the census of 2026-11-23 (Brilliant Stars, Lost Origin and Silver Tempest
 * TG01-TG11, Crown Zenith GG01-GG34). The gallery V/VMAX/VSTAR and Trainers are other families' (swsh-fullart,
 * swsh-vmax, swsh-gold), and Astral Radiance's character rares are filed "Rare Holo" (swsh-holo). The test restates
 * swshPattern()'s branch, since a family module must not import js/foil-maps.js (it waits on this module).
 *
 * What it adds (the sheet's hooks; photos and facts in .claude/skills/card-textures/reference/fam-swsh-gallery.md):
 *   fam-swsh-gallery  every claimed face (css/holo/fam/swsh-gallery.css scopes every rule to it): Live's map keeps the
 *                     Pokémon, people, border and text matte; the scenery is a fine sand grain that throws a broad,
 *                     smooth rainbow round the light (several hues at once, pastel over pale art, vivid over mid
 *                     tones), dark ink kept dark; no etched lines (these cards have none).
 *   --sgl-grain       the sand tile (scripts/fam/swsh-gallery/make_grain.py).
 */
const DIR = "assets/foil/fam/swsh-gallery";

/** A Sword & Shield era print (isSwsh() in js/foil-maps.js). */
function isSwsh(card) {
  return card?.era === "swsh" || /^(swsh|cel25|pgo)/.test(String(card?.id || ""));
}

/** swshPattern()'s character-rare branch: whether the face is `foil-ex swsh-tg`. */
function swshGallery(card) {
  if (!card || card.reverse || card.pattern) return false;
  if (!isSwsh(card) || (card.foilAs && card.era !== "swsh")) return false;
  if (card.gallery === "cc" || card.gallery === "sv") return false;
  return card.rarity === "Trainer Gallery Rare Holo";
}

/** Whether a card face is this family's. */
export function claims(card) {
  return swshGallery(card);
}

export function famExtras(card, url, base) {
  if (!claims(card, base)) return null;
  const style = `--sgl-grain:url('${url(`${DIR}/grain-v1.webp`)}')`;
  return { classes: "fam-swsh-gallery", style, cure: false };
}
