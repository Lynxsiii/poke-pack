/**
 * Holo family dp-cosmos-holo: DP-era cosmos Rare Holo.
 *
 * Scope: every plain `dp-holo` Rare Holo of dp1-dp7, pl1-pl4, hgss1-hgss4, col1, the dpp and hsp promos, POP 6-9 and the kits (not SP, not the special rares).
 *
 * Part of the older-era holo remaster (2026-10-01; js/holo-fam.js lists every family, first claim wins). This module
 * decides which card faces are this family's and returns what to add to the face foilExtras() built: the class
 * `fam-dp-cosmos-holo` (every rule in css/holo/fam/dp-cosmos-holo.css is scoped to it), any finer classes, the family's own
 * custom properties (per-card maps as `url('...')` through `url()`, which makes a repo path absolute) and `cure: true` to
 * get the extra `.cure` layer. `base` is foilExtras()'s own result ({ classes, style, cure }) for the same face, so a
 * family can read what the era module decided; a custom property set here comes after the era's in the style
 * attribute, so it wins (`--foil-map` included). `card` has been through foilLook(), so a promo's rarity is its foilAs.
 * Never import js/foil-maps.js from here (it waits on this module).
 */
import { isDp, dpPattern } from "../dp-foil.js?v=3";

// The faces that have a map (assets/foil/fam/dp-cosmos-holo/<set>/<n>.webp, from scripts/fam/dp-cosmos-holo/gen_maps.py).
// A plain dp-holo face without one is not claimed and keeps the era's look.
// Every plain dp-holo face of the scope has a map (2026-10-02): none is left on the era look. (fix-4 re-cut hgss4-8 Rapidash, flames now matte,
// and dp2-dpp07 Cranidos, head dome now matte, after review fix-3 had held them back.)
const MAPPED = new Set("col1-1 col1-10 col1-11 col1-12 col1-13 col1-14 col1-15 col1-16 col1-17 col1-18 col1-19 col1-2 col1-20 col1-21 col1-22 col1-3 col1-4 col1-5 col1-6 col1-7 col1-8 col1-9 col1-hsp24 col1-hsp25 dp1-1 dp1-10 dp1-11 dp1-12 dp1-13 dp1-14 dp1-15 dp1-16 dp1-17 dp1-2 dp1-3 dp1-4 dp1-5 dp1-6 dp1-7 dp1-8 dp1-9 dp1-dpp01 dp1-dpp02 dp1-dpp03 dp1-dpp04 dp2-1 dp2-10 dp2-11 dp2-12 dp2-13 dp2-14 dp2-15 dp2-16 dp2-17 dp2-18 dp2-2 dp2-21-theme dp2-3 dp2-33-theme dp2-4 dp2-5 dp2-6 dp2-7 dp2-8 dp2-9 dp2-dpp06 dp2-dpp07 dp2-dpp08 dp3-1 dp3-10 dp3-11 dp3-12 dp3-13 dp3-14 dp3-15 dp3-16 dp3-17 dp3-18 dp3-19 dp3-2 dp3-20 dp3-3 dp3-4 dp3-5 dp3-6 dp3-7 dp3-8 dp3-9 dp3-dpp13 dp3-dpp14 dp3-dpp15 dp3-dpp16 dp4-1 dp4-10 dp4-11 dp4-2 dp4-3 dp4-4 dp4-5 dp4-6 dp4-7 dp4-8 dp4-9 dp4-dpp20 dp4-dpp21 dp5-1 dp5-10 dp5-11 dp5-12 dp5-13 dp5-14 dp5-2 dp5-3 dp5-4 dp5-5 dp5-6 dp5-7 dp5-8 dp5-9 dp5-dpp22 dp5-dpp23 dp5-dpp24 dp6-1 dp6-10 dp6-11 dp6-12 dp6-13 dp6-14 dp6-15 dp6-16 dp6-17 dp6-2 dp6-3 dp6-4 dp6-5 dp6-6 dp6-7 dp6-8 dp6-9 dp6-dpp26 dp6-dpp27 dp7-1 dp7-10 dp7-11 dp7-2 dp7-3 dp7-4 dp7-5 dp7-6 dp7-7 dp7-8 dp7-9 dp7-dpp32 dp7-dpp33 dp7-dpp34 dptk3a-4 dptk3b-3 hgss1-1 hgss1-10 hgss1-11 hgss1-12 hgss1-123 hgss1-13 hgss1-2 hgss1-3 hgss1-4 hgss1-5 hgss1-6 hgss1-7 hgss1-8 hgss1-9 hgss1-hsp01 hgss1-hsp02 hgss1-hsp03 hgss1-hsp04 hgss1-hsp05 hgss1-hsp06 hgss1-hsp19 hgss1-hsp20 hgss1-hsp21 hgss2-1 hgss2-10 hgss2-11 hgss2-2 hgss2-3 hgss2-4 hgss2-5 hgss2-6 hgss2-7 hgss2-8 hgss2-9 hgss2-hsp10 hgss2-hsp11 hgss2-hsp12 hgss2-hsp13 hgss3-1 hgss3-10 hgss3-2 hgss3-3 hgss3-4 hgss3-5 hgss3-6 hgss3-7 hgss3-8 hgss3-9 hgss3-hsp14 hgss3-hsp15 hgss3-hsp16 hgss3-hsp17 hgss4-1 hgss4-10 hgss4-11 hgss4-12 hgss4-2 hgss4-3 hgss4-4 hgss4-5 hgss4-6 hgss4-7 hgss4-8 hgss4-9 hgss4-hsp22 hgss4-hsp23 hgsstk4a-30 hgsstk4b-30 pl1-1 pl1-10 pl1-11 pl1-13 pl1-14 pl1-15 pl1-16 pl1-2 pl1-3 pl1-4 pl1-5 pl1-6 pl1-8 pl1-9 pl1-dpp35 pl1-dpp36 pl1-dpp40 pl1-dpp44 pl2-1 pl2-13 pl2-5 pl2-7 pl3-10 pl3-12 pl3-13 pl3-14 pl3-5 pl3-6 pl3-7 pl3-dpp49 pl4-1 pl4-10 pl4-11 pl4-2 pl4-3 pl4-4 pl4-5 pl4-6 pl4-7 pl4-8 pl4-9 pl4-dpp50 pl4-dpp51 pl4-dpp52".split(" "));

/** Whether a card face is this family's. */
export function claims(card) {
  return Boolean(card) && !card.reverse && isDp(card) && dpPattern(card) === "foil-holo dp-holo" && !(card.subtypes || []).includes("SP") && MAPPED.has(String(card.id));
}

export function famExtras(card, url, base) {
  if (!claims(card)) return null;
  const id = String(card.id);
  const cut = id.indexOf("-");
  const map = `assets/foil/fam/dp-cosmos-holo/${id.slice(0, cut)}/${id.slice(cut + 1)}.webp`;
  return { classes: "fam-dp-cosmos-holo has-foil-map", style: `--foil-map:url('${url(map)}')`, cure: true };
}
