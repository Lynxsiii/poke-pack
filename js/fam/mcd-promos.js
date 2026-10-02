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
const GAIN = {"mcd11-1":0.79,"mcd11-2":0.73,"mcd11-3":0.93,"mcd11-4":0.87,"mcd11-5":0.76,"mcd11-6":0.94,"mcd11-7":0.97,"mcd11-8":0.92,"mcd11-9":1.0,"mcd11-10":0.96,"mcd11-11":0.84,"mcd11-12":0.75,"mcd12-1":0.65,"mcd12-2":0.92,"mcd12-3":0.97,"mcd12-4":0.5,"mcd12-5":0.61,"mcd12-6":0.6,"mcd12-7":1.0,"mcd12-8":1.0,"mcd12-9":0.5,"mcd12-10":0.88,"mcd12-11":0.5,"mcd12-12":0.5,"mcd14-1":0.86,"mcd14-2":0.85,"mcd14-3":0.67,"mcd14-4":0.77,"mcd14-5":0.5,"mcd14-6":0.65,"mcd14-7":0.8,"mcd14-8":0.7,"mcd14-9":0.96,"mcd14-10":0.85,"mcd14-11":0.78,"mcd14-12":0.65,"mcd15-1":0.69,"mcd15-2":0.75,"mcd15-3":0.5,"mcd15-4":0.68,"mcd15-5":1.0,"mcd15-6":0.71,"mcd15-7":0.51,"mcd15-8":0.72,"mcd15-9":0.5,"mcd15-10":0.67,"mcd15-11":0.73,"mcd15-12":0.67,"mcd16-1":0.76,"mcd16-2":0.68,"mcd16-3":0.97,"mcd16-4":0.68,"mcd16-5":0.65,"mcd16-6":0.94,"mcd16-7":0.78,"mcd16-8":0.88,"mcd16-9":0.82,"mcd16-10":0.92,"mcd16-11":0.92,"mcd16-12":0.75};
// GAIN-END

// Held back on 2026-10-02: no set print registers above 0.8 for these, so their maps may still leak foil onto the Pokemon.
// They keep the era look until a hand-drawn silhouette (or another print) lands; resume from holo-remaster/mcd-promos/NOTES.md.
// Review #2 (18:31) held three more whose silhouette misses part of the Pokemon: Dwebble's claws (mcd12-3), Klang's small
// gear (mcd12-11), Weedle's feet and rear segments (mcd14-1); see holo-remaster/mcd-promos/REVIEW-2.md.
// Released after review #3 (hand-drawn silhouettes in scripts/fam/mcd-promos/hand/): mcd15-3, mcd15-12, mcd16-1, mcd16-2,
// mcd16-3, mcd16-5, mcd16-9; see holo-remaster/mcd-promos/REVIEW-3.md.
const HELD = new Set([
  "mcd11-5", "mcd12-7", "mcd14-3", "mcd14-12", "mcd12-3", "mcd12-11", "mcd14-1",
]);

/** Whether a card face is this family's. */
export function claims(card) {
  return Boolean(card) && !card.reverse && /^mcd(11|12|14|15|16)$/.test(set(card)) && number(card) >= 1 && number(card) <= 12 && !HELD.has(card.id);
}

export function famExtras(card, url, base) {
  if (!claims(card)) return null;
  const map = `url('${url(`${DIR}/${card.id}-v1.webp`)}')`;
  return { classes: "fam-mcd-promos has-foil-map", style: `--foil-map:${map};--mcd-chips:${map};--mcd-gain:${GAIN[card.id] ?? 1}`, cure: false };
}
