/**
 * Holo family sm-gold: the Sun & Moon gold secret rares (holo accuracy overhaul; built 2026-11-23 from the audit
 * w2-sm-gold).
 *
 * Scope: exactly the faces smPattern() in js/sm-foil.js files as `foil-gold sm-gold` ("Rare Secret" Trainers, Energy
 * and Pokémon-GX of sm1-sm12, Dragon Majesty sm75 75-78, Hidden Fates SV87-SV94 including Tapu Bulu-GX SV91, and the
 * promos SM247/SM248): 101 faces in the census of 2026-11-23. Cosmic Eclipse's full-colour secrets (`sm-alt`) belong
 * to sm-fullart. Reverse faces and later products' reprints (a `foilAs` without `era: "sm"`) are not claimed.
 *
 * What it adds (the sheet's hooks; photos and facts in .claude/skills/card-textures/reference/fam-sm-gold.md):
 *   fam-sm-gold  every claimed face (css/holo/fam/sm-gold.css scopes every rule to it).
 *   smg-energy   the gold basic Energies (a stipple-sand art field that turns cool teal/green when tilted).
 *   smg-gx       the gold Pokémon-GX (a large flat gold field with a dense etch: the ridge rainbow held lower, or it
 *                covers the field as a pastel sheet).
 *   cure: true   the `.cure` span: TCG Live's etch ridges multiplied a step darker over the whole foil, so the
 *                fingerprint relief reads over bright gold too.
 */
import { isSm, smPattern } from "../sm-foil.js?v=8";

const has = (pattern, cls) => ` ${pattern || ""} `.includes(` ${cls} `);

/** Whether a card face is this family's. */
export function claims(card) {
  if (!card || card.reverse || !isSm(card)) return false;
  if (card.foilAs && card.era !== "sm") return false;
  return has(smPattern(card), "sm-gold");
}

export function famExtras(card, url, base) {
  if (!claims(card)) return null;
  const classes = ["fam-sm-gold"];
  const energy = card.supertype === "Energy" && (card.subtypes || []).includes("Basic");
  if (energy) classes.push("smg-energy");
  if (card.supertype === "Pokémon") classes.push("smg-gx");
  return { classes: classes.join(" "), style: "", cure: true };
}
