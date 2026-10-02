/**
 * Holo family mcd-promos: McDonald's promos 2011-2016.
 *
 * Scope: every print of mcd11, mcd12 (Black & White era) and mcd14, mcd15, mcd16 (XY era). Every English print of those
 * five sets is Confetti Holofoil, so every face is a holo (there is no reverse and no plain print to deal).
 *
 * Part of the older-era holo remaster (2026-10-01; js/holo-fam.js lists every family, first claim wins). This module
 * decides which card faces are this family's and returns what to add to the face foilExtras() built: the class
 * `fam-mcd-promos` (every rule in css/holo/fam/mcd-promos.css is scoped to it), `has-foil-map` (maps.css then cuts `.foil`
 * to the card's own map) and two custom properties that point at the same per-card file,
 * assets/foil/fam/mcd-promos/<id>-v1.webp (scripts/fam/mcd-promos/make_mcd_maps.py): its alpha is where the foil is (the art
 * window minus the Pokemon, the "M" and the evolution circle), its colour is the chip signature of the card's own scan
 * (each chip's tint and level), which the sheet lights chip by chip. `--foil-map` wins over the era's (a custom property set
 * here comes after the era's in the style attribute). Never import js/foil-maps.js from here (it waits on this module).
 */
const set = (card) => String(card?.id || "").split("-")[0];
const number = (card) => Number(String(card?.id || "").split("-")[1]);
const DIR = "assets/foil/fam/mcd-promos";
// Per-card gain of the lit foil: 1 for dark art, down to 0.5 for pale art (mean luma of the window), so pale art is not driven to white.
// Written by scripts/fam/mcd-promos/make_mcd_maps_v2.py.
// GAIN-BEGIN
const GAIN = {};
// GAIN-END

/** Whether a card face is this family's. */
export function claims(card) {
  return Boolean(card) && !card.reverse && /^mcd(11|12|14|15|16)$/.test(set(card)) && number(card) >= 1 && number(card) <= 12;
}

export function famExtras(card, url, base) {
  if (!claims(card)) return null;
  const map = `url('${url(`${DIR}/${card.id}-v1.webp`)}')`;
  return { classes: "fam-mcd-promos has-foil-map", style: `--foil-map:${map};--mcd-chips:${map};--mcd-gain:${GAIN[card.id] ?? 1}`, cure: false };
}
