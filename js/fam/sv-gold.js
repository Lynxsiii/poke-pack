/**
 * Holo family sv-gold (holo accuracy overhaul, 2026-10-22; built 2026-11-23 from the audit w2-sv-gold): the Scarlet &
 * Violet Hyper Rare golds.
 *
 * Scope: every non-reverse face js/app.js files as `foil-gold` (a Hyper Rare on a TCG Live foil map, scodix included)
 * whose id is a Scarlet & Violet one (sv1-sv10, the pt5 sets, rsv/zsv, svp-). 76 faces in the census of 2026-11-23:
 * 65 plain golds (SV_ULTRA / ETCHED) and 11 Scodix golds (Paldean Fates sv4pt5 240-245, Prismatic Evolutions sv8pt5
 * 176-180). The Mega Evolution era's Mega Hyper Rares stay with me-ultra / the era sheet.
 *
 * What it adds (the sheet's hooks; facts and photos in .claude/skills/card-textures/reference/fam-sv-gold.md):
 *   fam-sv-gold  every claimed face (css/holo/fam/sv-gold.css scopes every rule to it).
 *   sgv-energy   the gold Basic and special Energy cards: the rainbow flare held to a hint, so the printed purple,
 *                green, red field keeps its colour (Psychic Energy 207 at three tilts).
 *   sgv-pf       Paldean Fates Scodix golds: the shiny-vault.css recipe, retuned (steel-teal ground, brass gold, dense
 *                multicolour glitter, a stronger rainbow pillar).
 *   sgv-pre      Prismatic Evolutions Scodix golds: warm gold, no rainbow band, colour only in the glitter near the
 *                light, and the bold black line art the scans lack, traced from Live's soft etch into
 *                assets/foil/fam/sv-gold/<id>-lines-v1.webp (`--sgv-lines`, drawn by `.cure` at every pose).
 *   cure: true   the `.cure` layer carries the glitter's sparkle over the dodge (gated by the scan's luminance, so
 *                black ink stays black).
 */

/** Scarlet & Violet set and promo ids (sv1-, sv3pt5-, rsv10pt5-, zsv10pt5-, svp-; not me-). */
const SV_ID = /^(?:[zr]?sv\d|svp-)/;

/** Prismatic Evolutions golds with traced line art (scripts/fam/sv-gold/make_pre_lines.py). */
const PRE_LINES = new Set(["sv8pt5-176", "sv8pt5-177", "sv8pt5-178", "sv8pt5-179", "sv8pt5-180"]);

/** Whether a card face is this family's. */
export function claims(card, base) {
  if (!card || card.reverse || card.pattern || !card.foilMap) return false;
  if (!SV_ID.test(String(card.id || ""))) return false;
  return card.rarity === "Hyper Rare";
}

export function famExtras(card, url, base) {
  if (!claims(card, base)) return null;
  const classes = ["fam-sv-gold"];
  let style = "";
  const id = String(card.id || "");
  if (card.finish === "scodix") {
    const pre = PRE_LINES.has(id);
    classes.push(pre ? "sgv-pre" : "sgv-pf");
    if (pre) style = `--sgv-lines:url('${url(`assets/foil/fam/sv-gold/${id}-lines-v1.webp`)}')`;
  }
  if (card.supertype === "Energy" || card.energy) classes.push("sgv-energy");
  return { classes: classes.join(" "), style, cure: true };
}
