/**
 * Holo family wotc-shining: Shining Pokémon (Neo Revelation, Neo Destiny).
 *
 * Scope: neo3 65-66 and neo4 106-113 (`wotc-shining`).
 *
 * Part of the older-era holo remaster (2026-10-01; js/holo-fam.js lists every family, first claim wins). This module
 * decides which card faces are this family's and returns what to add to the face foilExtras() built: the class
 * `fam-wotc-shining` (every rule in css/holo/fam/wotc-shining.css is scoped to it), any finer classes, the family's own
 * custom properties (per-card maps as `url('...')` through `url()`, which makes a repo path absolute) and `cure: true` to
 * get the extra `.cure` layer. `base` is foilExtras()'s own result ({ classes, style, cure }) for the same face, so a
 * family can read what the era module decided; a custom property set here comes after the era's in the style
 * attribute, so it wins (`--foil-map` included). `card` has been through foilLook(), so a promo's rarity is its foilAs.
 * Never import js/foil-maps.js from here (it waits on this module).
 */
import { isWotc, wotcPattern } from "../wotc-foil.js?v=6";

const set = (card) => String(card?.id || "").split("-")[0];
const has = (pattern, cls) => ` ${pattern || ""} `.includes(` ${cls} `);

const DIR = "assets/foil/fam/wotc-shining/";
const V = 1;
/**
 * The lit tint of each Neo Destiny figure (what the lamp makes of the metal, from the photos in
 * /mnt/project-files/holo-remaster/wotc-shining/refs/): hue, saturation %, lightness %. Neo Revelation's haze is one
 * silver-lavender for both.
 */
const TINT = {
  "neo3-65": [250, 30, 80],
  "neo3-66": [250, 30, 80],
  "neo4-106": [350, 38, 82],
  "neo4-107": [265, 36, 80],
  "neo4-108": [38, 22, 82],
  "neo4-109": [275, 28, 82],
  "neo4-110": [52, 40, 70],
  "neo4-111": [46, 62, 70],
  "neo4-112": [42, 40, 74],
  "neo4-113": [44, 46, 76],
};

/** Whether a card face is this family's. */
export function claims(card) {
  return Boolean(card) && !card.reverse && isWotc(card) && has(wotcPattern(card), "wotc-shining");
}

export function famExtras(card, url, base) {
  if (!claims(card)) return null;
  const id = String(card.id);
  const t = TINT[id];
  if (!t) return { classes: "fam-wotc-shining", style: "", cure: false };
  const style = [
    `--ws-mask:url('${url(`${DIR}${id}-mask-v${V}.webp`)}')`,
    `--ws-lit:url('${url(`${DIR}${id}-lit-v${V}.webp`)}')`,
    `--ws-spark:url('${url(`${DIR}${id}-spark-v${V}.webp`)}')`,
    `--ws-h:${t[0]}`,
    `--ws-s:${t[1]}%`,
    `--ws-l:${t[2]}%`,
  ].join(";");
  return { classes: `fam-wotc-shining ws-mapped ${set(card) === "neo3" ? "ws-bg" : "ws-fig"}`, style, cure: false };
}
