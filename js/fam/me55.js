/**
 * Holo family me55: the 30th Celebration (set me55), every finish this set prints except its Rares, Double Rares,
 * Illustration Rares, SIRs, Cosmos promos and reverse holos (those stay on css/holo/celebration.css).
 *
 * Scope (the two audit groups of 2026-10-22, 135 faces):
 * - m55-common: the 68 foil Commons (Pokémon and Items, `foil-holo foil-rainbow`, TCG Live's RAINBOW / HOLO).
 * - m55-pika:   the 30 Pikachu Rares (`foil-holo foil-pikachu cure-rings`, PIKACHU / HOLO + StitchedRings).
 * - m55-classic: the 30 Classic Collection reprints (`foil-classic`, no TCG Live map).
 * - m55-rgb:    the three RGB Mews (`foil-future foil-rgb`).
 * - m55-future: the four Futuristic Rares (157, 158, MEP 107, MEP 109), claimed but drawn exactly as before: the
 *   sheet has no rule for them (the audit found them acceptable).
 *
 * Part of the holo accuracy overhaul (js/holo-fam.js lists every family, first claim wins). This module returns what
 * to add to the face foilExtras() built: the class `fam-me55` (every rule in css/holo/fam/me55.css is scoped to it),
 * the finer classes above and the family's custom properties, written through `url()` (which makes a repo path
 * absolute). Never import js/foil-maps.js from here (it waits on this module).
 *
 * What it adds (research and sources: .claude/skills/card-textures/reference/fam-me55.md):
 *   --foil-map  Commons and Pikachu Rares: TCG Live's map with its "not foil" floor (alpha 33/255, which put 13% of
 *               the foil over the Pokémon and the text box) taken to 0 (assets/foil/fam/me55/maps/<n>-v1.webp,
 *               scripts/fam/me55/make_me55_maps.py). Classic Collection: a map drawn from the scan (Live has none):
 *               the gold border and the art background foil, the Pokémon, the text and the stamp matte
 *               (assets/foil/fam/me55/cc/<n>-v1.webp, scripts/fam/me55/make_classic_maps.py), with `has-foil-map`.
 *   --m55-border Classic Collection: the gold border alone (<n>-border-v1.webp), for the border's own recipe.
 *   m55-item    the three Item commons (126-128): their frame puts the art window lower.
 */
const has = (pattern, cls) => ` ${pattern || ""} `.includes(` ${cls} `);
const DIR = "assets/foil/fam/me55";
const SRC_MAPS = "assets/foil/maps/me55/";
const MAP_V = 1;

/* Classic Collection prints whose map is drawn (scripts/fam/me55/make_classic_maps.py). */
const CLASSIC_MAPPED = new Set([
  "cc4", "cc5", "cc11", "cc18", "cc19", "cc25", "cc33", "cc41", "cc43", "cc47", "cc50", "cc57", "cc58", "cc69", "cc85",
  "cc89", "cc94", "cc99", "cc100", "cc101", "cc106", "cc108", "cc114", "cc11g", "cc123", "cc138", "cc149", "cc203",
  "cc106m", "cc106p",
]);

/** The finish of a face, or "" when the face is not this family's. */
export function finishOf(card) {
  if (!card || card.reverse || !String(card.id || "").startsWith("me55-")) return "";
  switch (card.rarity) {
    case "Common":
      // The foil Commons carry Live's RAINBOW map; the Eevee blister print (116-blister) is a reverse stock, not ours.
      return !card.promo && String(card.foilMap || "").startsWith(SRC_MAPS) ? "common" : "";
    case "Pikachu Rare":
      return "pika";
    case "Classic Collection":
      return "classic";
    case "RGB Rare":
      return "rgb";
    case "Futuristic Rare":
      return "future";
    default:
      return "";
  }
}

/** Whether a card face is this family's. */
export function claims(card) {
  return Boolean(finishOf(card));
}

/** The stretched copy of a Live map: assets/foil/maps/me55/<n>.webp -> assets/foil/fam/me55/maps/<n>-v<MAP_V>.webp. */
function stretchedMap(card) {
  const m = String(card.foilMap || "");
  if (!m.startsWith(SRC_MAPS) || !m.endsWith(".webp")) return "";
  return `${DIR}/maps/${m.slice(SRC_MAPS.length, -5)}-v${MAP_V}.webp`;
}

export function famExtras(card, url, base) {
  const finish = finishOf(card);
  if (!finish) return null;
  const classes = ["fam-me55", `m55-${finish}`];
  const style = [];
  if (finish === "common" || finish === "pika") {
    const map = stretchedMap(card);
    if (map) style.push(`--foil-map:url('${url(map)}')`);
    if (finish === "common" && card.supertype === "Trainer") classes.push("m55-item");
  }
  if (finish === "rgb") classes.push(`m55-rgb-${String(card.number || "").toLowerCase()}`);
  if (finish === "classic") {
    const n = String(card.number || card.id.split("-")[1]);
    if (CLASSIC_MAPPED.has(n)) {
      classes.push("has-foil-map", "m55-cc-map");
      style.push(`--foil-map:url('${url(`${DIR}/cc/${n}-v1.webp`)}')`);
      style.push(`--m55-border:url('${url(`${DIR}/cc/${n}-border-v1.webp`)}')`);
    }
  }
  return { classes: classes.join(" "), style: style.join(";"), cure: false };
}
