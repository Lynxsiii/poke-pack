/**
 * Holo family sm-fullart: the Sun & Moon full arts (holo accuracy overhaul, 2026-10-22; built 2026-11-23).
 *
 * Scope: exactly the faces smPattern() in js/sm-foil.js files as `foil-ultra sm-fa` (full-art Pokémon-GX and TAG TEAM
 * GX, the alternate-art Tag Teams and Cosmic Eclipse's full-colour secret Pokémon, `sm-alt`) or `foil-ultra sm-tfa`
 * (full-art Supporters and Trainers, Hidden Fates' Shiny Vault Supporters SV81-SV86 included): 195 + 86 faces in the
 * census of 2026-11-23, the audit groups w2-sm-fa and w2-sm-tfa. Reverse faces and later products' reprints (a
 * `foilAs` without `era: "sm"`) are not claimed, as in sm-holo.
 *
 * What it adds (the sheet's hooks; photos and facts in .claude/skills/card-textures/reference/fam-sm-fullart.md):
 *   fam-sm-fullart  every claimed face (css/holo/fam/sm-fullart.css scopes every rule to it).
 *   smf-gx          the full-art GX / TAG TEAM: silver-white foil, TCG Live's faceted line etch catching the light,
 *                   broad soft diagonal sheen bands, a faint rainbow led by the silver frame.
 *   smf-t           the full-art Supporter / Trainer: the same stock with a stronger, saturated rainbow led by the
 *                   frame and header, and a fine sparkle on the etch.
 *   smf-alt         the alternate arts and colour secrets: matte Pokémon (TCG Live's map is the truth, no floor), one
 *                   broad band and a sparkle on the scenery.
 *   smf-noetch      a print with no TCG Live etch (the data hands it the shared engraving tile): no etch drawn, since a
 *                   tile shared by every card is not the card's engraving.
 */
import { isSm, smPattern } from "../sm-foil.js?v=9";

const has = (pattern, cls) => ` ${pattern || ""} `.includes(` ${cls} `);

/** "gx", "t", "alt" or "" for a face that is not this family's. */
export function kindOf(card) {
  if (!card || card.reverse || !isSm(card)) return "";
  if (card.foilAs && card.era !== "sm") return "";
  const p = smPattern(card);
  if (!has(p, "foil-ultra")) return "";
  if (has(p, "sm-tfa")) return "t";
  if (!has(p, "sm-fa")) return "";
  return has(p, "sm-alt") ? "alt" : "gx";
}

/** Whether a card face is this family's. */
export function claims(card) {
  return kindOf(card) !== "";
}

export function famExtras(card, url, base) {
  const kind = kindOf(card);
  if (!kind) return null;
  const classes = ["fam-sm-fullart", `smf-${kind}`];
  if (!card.etchMap || !has(base?.classes, "has-etch-map")) classes.push("smf-noetch");
  // `cure`: the second span carries the multiplied shade, silver frame and tint (css/holo/fam/sm-fullart.css)
  return { classes: classes.join(" "), style: "", cure: true };
}
