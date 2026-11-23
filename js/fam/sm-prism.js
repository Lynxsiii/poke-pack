/**
 * Holo family sm-prism: the Sun & Moon Prism Star cards (holo accuracy overhaul; built 2026-11-23 from the audit
 * w2-sm-prism).
 *
 * Scope: exactly the faces smPattern() in js/sm-foil.js files as `foil-holo sm-prism` ("Rare Prism Star" of sm5-sm9
 * and sm75): 27 faces in the census of 2026-11-23 (16 Pokémon, 9 Trainers, 2 Energy). Reverse faces and later
 * products' reprints (a `foilAs` without `era: "sm"`) are not claimed.
 *
 * What it adds (the sheet's hooks; photos and facts in .claude/skills/card-textures/reference/fam-sm-prism.md):
 *   fam-sm-prism  every claimed face (css/holo/fam/sm-prism.css scopes every rule to it): Live's map is the foil (black
 *                 frame rim, window minus the Pokémon, rules strip, diamond minus its star). The window throws
 *                 diagonal streak bands near the light (overlay, so dark ink stays dark), the strip stays silver with
 *                 separate colour bars (multiply, so its text stays black), the diamond is a dark mirror that flashes
 *                 silver near the light, and the black frame shows faint dark-rainbow streaks only when lit.
 */
import { isSm, smPattern } from "../sm-foil.js?v=8";

const has = (pattern, cls) => ` ${pattern || ""} `.includes(` ${cls} `);

/** Whether a card face is this family's. */
export function claims(card) {
  if (!card || card.reverse || !isSm(card)) return false;
  if (card.foilAs && card.era !== "sm") return false;
  return has(smPattern(card), "sm-prism");
}

export function famExtras(card, url, base) {
  if (!claims(card)) return null;
  return { classes: "fam-sm-prism", style: "", cure: false };
}
