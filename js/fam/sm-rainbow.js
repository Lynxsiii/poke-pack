/**
 * Holo family sm-rainbow: the Sun & Moon Rainbow Rares (holo accuracy overhaul; built 2026-11-23 from the audit
 * w2-sm-rainbow).
 *
 * Scope: exactly the faces smPattern() in js/sm-foil.js files as `foil-ir sm-rainbow` ("Rare Rainbow" of sm1-sm12,
 * sm35, sm75, sm115, plus the promo prints filed foilAs "Rare Rainbow"). Reverse faces and later products' reprints
 * (a `foilAs` without `era: "sm"`) are not claimed.
 *
 * What it adds (the sheet's hooks; photos and facts in .claude/skills/card-textures/reference/fam-sm-rainbow.md):
 *   fam-sm-rainbow  every claimed face (css/holo/fam/sm-rainbow.css scopes every rule to it): the printed pastel
 *                   rainbow stays put; the foil is TCG Live's fingerprint etch drawn as relief (darker grooves, bright
 *                   crests) at rest, and lit a warm-white specular pool that brightens the print and lights the crests.
 *                   No spectrum layer over the printed rainbow (Noah, 2026-10-02: too much "rainbow glare").
 */
import { isSm, smPattern } from "../sm-foil.js?v=9";

const has = (pattern, cls) => ` ${pattern || ""} `.includes(` ${cls} `);

/** Whether a card face is this family's. */
export function claims(card) {
  if (!card || card.reverse || !isSm(card)) return false;
  if (card.foilAs && card.era !== "sm") return false;
  return has(smPattern(card), "sm-rainbow");
}

export function famExtras(card, url, base) {
  if (!claims(card)) return null;
  // a photographed print (the Japanese scans): the foil grain is already in the picture, so the sheet runs quieter
  const photo = /^j/.test(String(card.id || ""));
  return { classes: `fam-sm-rainbow${photo ? " smrb-photo" : ""}`, style: "", cure: false };
}
