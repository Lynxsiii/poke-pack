/**
 * Holo family dp-legend: LEGEND (HeartGold & SoulSilver).
 *
 * Scope: both halves of every LEGEND (`dp-legend`): hgss1 111-114, hgss2 90-95, hgss3 87-90, hgss4 99-102 (18 faces).
 *
 * Part of the older-era holo remaster (2026-10-01; js/holo-fam.js lists every family, first claim wins). This module
 * decides which card faces are this family's and returns what to add to the face foilExtras() built: the class
 * `fam-dp-legend` (every rule in css/holo/fam/dp-legend.css is scoped to it), `fam-dp-legend-top` / `-bottom` (the half,
 * so the two halves of a pair carry one continuous sheen across the join), the card's own foil map as `--foil-map`
 * (assets/foil/fam/dp-legend/legend-<set>-<n>.webp, from scripts/fam/dp-legend/make_legend_maps.py: alpha = the
 * picture, swooshes and attack text that are foil; the pearl plates, energy orbs and cream border are matte) and
 * `cure: true` for the extra `.cure` layer (the cosmos glints). A LEGEND without a map is not claimed and keeps the era
 * look. Never import js/foil-maps.js from here (it waits on this module).
 */
import { isDp, dpPattern, legendHalf } from "../dp-foil.js?v=3";

// The faces that have a map (checked against the scans: scripts/fam/dp-legend/make_legend_maps.py --debug).
const MAPPED = new Set("hgss1-111 hgss1-112 hgss1-113 hgss1-114 hgss2-90 hgss2-91 hgss2-92 hgss2-93 hgss2-94 hgss2-95 hgss3-87 hgss3-88 hgss3-89 hgss3-90 hgss4-99 hgss4-100 hgss4-101 hgss4-102".split(" "));
const has = (pattern, cls) => ` ${pattern || ""} `.includes(` ${cls} `);

/** Whether a card face is this family's. */
export function claims(card) {
  return Boolean(card) && !card.reverse && isDp(card) && has(dpPattern(card), "dp-legend") && MAPPED.has(String(card.id));
}

export function famExtras(card, url, base) {
  if (!claims(card)) return null;
  const half = legendHalf(card);
  const map = `assets/foil/fam/dp-legend/legend-${card.id}.webp`;
  return { classes: `fam-dp-legend${half ? ` fam-dp-legend-${half}` : ""} has-foil-map`, style: `--foil-map:url('${url(map)}')`, cure: true };
}
