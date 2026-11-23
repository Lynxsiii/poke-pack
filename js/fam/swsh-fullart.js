/**
 * Holo family swsh-fullart: the Sword & Shield full arts, Pokémon V and Supporters (holo accuracy overhaul, 2026-10-22).
 *
 * Scope: exactly the faces swshPattern() in js/foil-maps.js files as `foil-ultra swsh-vfa` (full-art and alternate-art
 * Pokémon V: "Rare Ultra" that is not VMAX or VSTAR, and "Rare Holo V" with a TCG Live etch, the alt-art Black Star
 * promos) or `foil-ultra swsh-tfa` (full-art Supporters, Trainer Gallery and Galarian Gallery included): 292 + 133 faces
 * in the census of 2026-10-22. The test below restates swshPattern()'s branches for those two, since a family module
 * must not import js/foil-maps.js (it waits on this module).
 *
 * What it adds (the sheet's hooks; the photos and facts are in reference/fam-swsh-fullart.md):
 *   fam-swsh-fullart  every claimed face (css/holo/fam/swsh-fullart.css scopes every rule to it).
 *   sfa-v / sfa-t     the full-art Pokémon V (broad diagonal rainbow bands) / the full-art Supporter (narrow broken
 *                     diagonal streaks and a sparkling etch).
 *   sfa-alt           the alternate arts and the painted gallery arts (Trainer Gallery and Galarian Gallery V, the
 *                     alt-art promos): one broad rainbow band and a fine sparkle in the light areas, deep shadows kept.
 *   sfa-keep          faces the audit could not confirm a finish for: Crown Zenith's yellow-bordered Energies (152-159)
 *                     and illustration promos (swshp282-284), the gold Zacian and Zamazenta promos (swshp076-077) and
 *                     the Morpeko V-UNION pieces (swshp287-290). The sheet skips them, so they keep the era's look.
 *   --fa-etch         TCG Live's etch at its native size for the thirteen faces whose data has only the blurred
 *                     -etch-v3 map or no etch at all (LIVE_ETCH; assets/foil/fam/swsh-fullart/<id>-etch-v1.webp).
 *   sfa-soft          a print left with a blurred map or the shared tile (none on 2026-10-22): the etch is drawn
 *                     fainter there so the blotches do not lead.
 */

const has = (pattern, cls) => ` ${pattern || ""} `.includes(` ${cls} `);

/** A Sword & Shield era print (isSwsh() in js/foil-maps.js). */
function isSwsh(card) {
  return card?.era === "swsh" || /^(swsh|cel25|pgo)/.test(String(card?.id || ""));
}

/** swshPattern()'s full-art V / full-art Trainer branches: "vfa", "tfa" or "". */
export function swshFullArt(card) {
  if (!card || card.reverse || card.pattern) return "";
  if (!isSwsh(card) || (card.foilAs && card.era !== "swsh")) return "";
  if (card.gallery === "cc") return "";
  const id = String(card.id || "");
  if (id.startsWith("cel25-") && (card.rarity === "Rare" || card.rarity === "Rare Holo")) return "";
  if (card.gallery === "sv" && card.rarity !== "Rare Secret") return "";
  const subs = card.subtypes || [];
  if (card.rarity === "Rare Ultra") {
    if (card.supertype === "Trainer") return "tfa";
    if (subs.includes("VMAX") || subs.includes("VSTAR")) return "";
    return "vfa";
  }
  if (card.rarity === "Rare Holo V" && card.etchMap) return "vfa";
  return "";
}

/** Outliers the audit could not confirm a finish for: left on the era's recipe (see the header). */
const KEEP = new Set([
  "swsh12pt5-152", "swsh12pt5-153", "swsh12pt5-154", "swsh12pt5-155", "swsh12pt5-156", "swsh12pt5-157",
  "swsh12pt5-158", "swsh12pt5-159", "swsh12pt5-swshp282", "swsh12pt5-swshp283", "swsh12pt5-swshp284",
  "swshp-swshp076", "swshp-swshp077", "swsh12pt5-swshp287", "swsh12pt5-swshp288", "swsh12pt5-swshp289",
  "swsh12pt5-swshp290",
]);

/**
 * Alternate arts: the second print of a V in its set's secret run (a painted scene, not the flat-colour full art on a
 * patterned background), Fusion Strike's Celebi (alt only) and the alt-art Charizard V promo SWSH260.
 */
const ALT = new Set([
  "swsh5-146", "swsh5-151", "swsh5-153", "swsh5-155",
  "swsh6-164", "swsh6-166", "swsh6-168", "swsh6-170", "swsh6-172", "swsh6-174", "swsh6-177", "swsh6-179", "swsh6-183",
  "swsh6-185",
  "swsh7-167", "swsh7-175", "swsh7-180", "swsh7-182", "swsh7-184", "swsh7-186", "swsh7-189", "swsh7-192", "swsh7-194",
  "swsh7-196", "swsh7-198",
  "swsh8-245", "swsh8-251", "swsh8-255", "swsh8-257",
  "swsh9-154", "swsh9-156", "swsh9-162", "swsh9-166",
  "swsh10-161", "swsh10-163", "swsh10-172", "swsh10-175",
  "swsh11-177", "swsh11-180", "swsh11-184", "swsh11-186",
  "swsh12-177", "swsh12-181", "swsh12-184", "swsh12-186",
  "swshp-swshp260",
]);

/**
 * Faces whose data carries no native etch (the blurred -etch-v3 map, or none: Judge TG25 drew the shared tile): TCG
 * Live's etch at its native size, shipped by scripts/fam/swsh-fullart/ship_live_etch.py as <id>-etch-v1.webp.
 */
const LIVE_ETCH = new Set([
  "swsh35-swshp050", "swsh45-swshp084", "swsh45-swshp085", "swsh45-swshp086", "swsh45-swshp096", "swsh45-swshp098",
  "pgo-swshp226", "pgo-swshp227", "pgo-swshp228", "pgo-swshp229", "swsh12pt5-swshp292", "swsh12pt5-swshp293",
  "swsh12-TG25",
]);
const DIR = "assets/foil/fam/swsh-fullart";

/** Whether a card face is this family's. */
export function claims(card) {
  return swshFullArt(card) !== "";
}

export function famExtras(card, url, base) {
  const kind = swshFullArt(card);
  if (!kind) return null;
  const id = String(card.id || "");
  const classes = ["fam-swsh-fullart"];
  if (KEEP.has(id)) {
    classes.push("sfa-keep");
    return { classes: classes.join(" "), style: "", cure: false };
  }
  classes.push(kind === "tfa" ? "sfa-t" : "sfa-v");
  // the painted gallery V (Trainer Gallery TG, Galarian Gallery GG) and the alternate arts
  if (kind === "vfa" && (ALT.has(id) || card.gallery === "tg" || card.gallery === "gg" || /-(TG|GG)\d/.test(id))) {
    classes.push("sfa-alt");
  }
  const style = [];
  if (LIVE_ETCH.has(id)) {
    // the sheet reads the etch through --fa-etch (css/holo/sv-fullart.css sets it from --etch-map or the tile)
    style.push(`--fa-etch:url('${url(`${DIR}/${id}-etch-v1.webp`)}')`, "--fa-etch-size:100% 100%", "--fa-etch-pos:center", "--fa-etch-repeat:no-repeat");
  } else if (!card.etchMap || /-etch-v3\.webp$/.test(String(card.etchMap)) || !has(base?.classes, "has-etch-map")) {
    classes.push("sfa-soft");
  }
  return { classes: classes.join(" "), style: style.join(";"), cure: false };
}
