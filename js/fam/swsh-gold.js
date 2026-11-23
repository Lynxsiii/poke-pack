/**
 * Holo family swsh-gold: the Sword & Shield gold secret rares (holo accuracy overhaul; built 2026-11-23 from the audit
 * w2-swsh-gold).
 *
 * Scope: exactly the faces swshPattern() in js/foil-maps.js files as `foil-gold swsh-gold` ("Rare Secret" of a Sword &
 * Shield era print, Crown Zenith's showcase Pikachu swsh12pt5-160 excepted): 106 faces in the census of 2026-11-23.
 * The test restates swshPattern()'s branch, since a family module must not import js/foil-maps.js (it waits on this
 * module).
 *
 * What it adds (the sheet's hooks; photos and facts in .claude/skills/card-textures/reference/fam-swsh-gold.md):
 *   fam-swsh-gold  every claimed face (css/holo/fam/swsh-gold.css scopes every rule to it).
 *   sg-glitter     the gold glitter stock (every face but the two below): gold ink over a dense multicolour glitter
 *                  foil, TCG Live's etch as fine relief lines that catch the light, black ink black.
 *   sg-dark        the black-and-gold prints of that stock (Shining Fates' Eternatus V and VMAX SV121-122, the
 *                  Trainer Gallery VMAX TG29-TG30 of swsh9-12): a deep black field with only a faint fine sparkle.
 *   sg-mirror      the Celebrations Ultra-Premium golds (Pikachu V SWSH145, Poké Ball SWSH146): smooth mirror gold with
 *                  a concentric-ring engraving and a sliding white band, no glitter.
 *   sg-silver      Champion's Path Charizard V 079/073: a silver shiny full art filed "Rare Secret" (so it rides the
 *                  gold class); drawn as silver glitter, not gold. Its filing belongs in js/foil-maps.js.
 *   cure: true     the `.cure` layer: the faint sparkle that shows over black ink (glitter stock), or the line art the
 *                  mirror scans have faded (mirror).
 */

/** A Sword & Shield era print (isSwsh() in js/foil-maps.js). */
function isSwsh(card) {
  return card?.era === "swsh" || /^(swsh|cel25|pgo)/.test(String(card?.id || ""));
}

/** swshPattern()'s gold branch: whether the face is `foil-gold swsh-gold`. */
function swshGold(card) {
  if (!card || card.reverse || card.pattern) return false;
  if (!isSwsh(card) || (card.foilAs && card.era !== "swsh")) return false;
  if (card.gallery === "cc") return false;
  if (card.rarity !== "Rare Secret") return false;
  return String(card.id || "") !== "swsh12pt5-160";
}

const MIRROR = new Set(["cel25-swshp145", "cel25-swshp146"]);
const SILVER = new Set(["swsh35-79"]);
const DARK = new Set([
  "swsh45-SV121", "swsh45-SV122",
  "swsh9-TG29", "swsh9-TG30", "swsh10-TG29", "swsh10-TG30", "swsh11-TG29", "swsh11-TG30", "swsh12-TG29", "swsh12-TG30",
]);

/** Whether a card face is this family's. */
export function claims(card) {
  return swshGold(card);
}

export function famExtras(card, url, base) {
  if (!claims(card, base)) return null;
  const id = String(card.id || "");
  const classes = ["fam-swsh-gold"];
  if (MIRROR.has(id)) classes.push("sg-mirror");
  else {
    classes.push("sg-glitter");
    if (SILVER.has(id)) classes.push("sg-silver");
    if (DARK.has(id)) classes.push("sg-dark");
  }
  // the rings are centred on the subject: Pikachu's head (the sheet's default), the Poké Ball's button
  const style = id === "cel25-swshp146" ? "--sg-ring-c:37% 51%" : "";
  return { classes: classes.join(" "), style, cure: true };
}
