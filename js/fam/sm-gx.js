/**
 * Holo family sm-gx: the Sun & Moon regular-frame Pokémon-GX and TAG TEAM GX (holo accuracy overhaul; built
 * 2026-11-23 from the audit w2-sm-gx).
 *
 * Scope: exactly the faces smPattern() in js/sm-foil.js files as `foil-ex sm-gx` (rarity "Rare Holo GX", or a promo
 * whose foilAs is) that are not Hidden Fates' shiny GX (`sm-shiny`, the shiny family) nor a full art (`sm-fa`, the
 * sm-fullart family): 207 faces in the census of 2026-11-23 (176 GX, 31 TAG TEAM). Reverse faces and later products'
 * reprints (a `foilAs` without `era: "sm"`) are not claimed, as in sm-holo.
 *
 * What it adds (the sheet's hooks; photos and facts in .claude/skills/card-textures/reference/fam-sm-gx.md):
 *   fam-sm-gx   every claimed face (css/holo/fam/sm-gx.css scopes every rule to it).
 *   sgx-tag     a TAG TEAM (same foil; the yellow TAG TEAM bars stay matte).
 *   cure: true  the `.cure` span: the colour-dodged light gain (with the facet glints) over the multiplied band colour.
 *
 * The map stays js/sm-foil.js smGxMap()'s `-gx-v1` (TCG Live's map with the dark GX attack bar cut out), except
 * White Kyurem-GX SM141 (sm75-smp141), whose Live map is inverted (the gold background black, Kyurem white): it takes
 * the shared text-safe GX median (background and frame foil, a typical Pokémon matte).
 */
import { isSm, smPattern } from "../sm-foil.js?v=9";

const has = (pattern, cls) => ` ${pattern || ""} `.includes(` ${cls} `);

/** Live maps that are inverted against the real card: the shared GX median instead. */
const SAFE_MAP = new Set(["sm75-smp141"]);

/** Whether a card face is this family's. */
export function claims(card) {
  if (!card || card.reverse || !isSm(card)) return false;
  if (card.foilAs && card.era !== "sm") return false;
  const p = smPattern(card);
  return has(p, "sm-gx") && !has(p, "sm-shiny") && !has(p, "sm-fa");
}

export function famExtras(card, url, base) {
  if (!claims(card)) return null;
  const id = String(card.id || "");
  const classes = ["fam-sm-gx"];
  if (has(smPattern(card), "sm-tag")) classes.push("sgx-tag");
  const style = SAFE_MAP.has(id) ? `--foil-map:url('${url("assets/foil/maps/sm-gx-safe.webp")}')` : "";
  return { classes: classes.join(" "), style, cure: true };
}
