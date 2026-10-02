/**
 * Holo family wotc-team-rocket: Team Rocket (base5) holos.
 *
 * Scope: base5 Rare Holo 1-17 (Dark Pokémon, the two Trainers, Rainbow Energy) and the secret Dark Raichu 83.
 *
 * Part of the older-era holo remaster (2026-10-01; js/holo-fam.js lists every family, first claim wins). This module
 * decides which card faces are this family's and returns what to add to the face foilExtras() built: the class
 * `fam-wotc-team-rocket` (every rule in css/holo/fam/wotc-team-rocket.css is scoped to it), any finer classes, the family's own
 * custom properties (per-card maps as `url('...')` through `url()`, which makes a repo path absolute) and `cure: true` to
 * get the extra `.cure` layer. `base` is foilExtras()'s own result ({ classes, style, cure }) for the same face, so a
 * family can read what the era module decided; a custom property set here comes after the era's in the style
 * attribute, so it wins (`--foil-map` included). `card` has been through foilLook(), so a promo's rarity is its foilAs.
 * Never import js/foil-maps.js from here (it waits on this module).
 *
 * The maps (assets/foil/fam/wotc-team-rocket/, drawn by .claude/skills/card-textures/scripts/fam/wotc-team-rocket/make_tr_maps.py
 * from each card's own scan): `<n>-bg` is where the foil shows (the art window's background: the window less the stage badge
 * and the figure, which is printed over a white underlay and stays matte), `<n>-stars` the scan's own cosmos
 * dots, stars and sparkle, and `glitter-a` / `glitter-b` the micro-streak glitter the tilt clips show under a lamp (Jungle's own
 * halves, byte for byte: same foil). A face with maps gets `tr-mapped`; the sheet draws nothing new without it.
 */
import { isWotc, wotcPattern } from "../wotc-foil.js?v=6";

const set = (card) => String(card?.id || "").split("-")[0];
const has = (pattern, cls) => ` ${pattern || ""} `.includes(` ${cls} `);
const DIR = "assets/foil/fam/wotc-team-rocket";
const V = 1;
/** The faces whose maps are drawn (all eighteen). */
const MAPPED = new Set(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "83"]);
/** The art window's layout: 15 and 16 are Trainers (a wide short window), 17 is the Energy (a big square one). */
const LAYOUT = { 15: "tr-trainer", 16: "tr-trainer", 17: "tr-energy" };

/** Whether a card face is this family's. */
export function claims(card) {
  return Boolean(card) && !card.reverse && isWotc(card) && set(card) === "base5" && has(wotcPattern(card), "wotc-cosmos");
}

export function famExtras(card, url, base) {
  if (!claims(card)) return null;
  const n = String(card.id).split("-")[1];
  if (!MAPPED.has(n)) return { classes: "fam-wotc-team-rocket", style: "", cure: false };
  const style = [
    `--tr-bg:url('${url(`${DIR}/${n}-bg-v${V}.webp`)}')`,
    `--tr-stars:url('${url(`${DIR}/${n}-stars-v${V}.webp`)}')`,
    `--tr-glitter-a:url('${url(`${DIR}/glitter-a-v${V}.webp`)}')`,
    `--tr-glitter-b:url('${url(`${DIR}/glitter-b-v${V}.webp`)}')`,
  ].join(";");
  return { classes: `fam-wotc-team-rocket tr-mapped ${LAYOUT[n] || "tr-pokemon"}`, style, cure: false };
}
