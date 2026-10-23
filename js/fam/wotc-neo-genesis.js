/**
 * Holo family wotc-neo-genesis: Neo Genesis (neo1) holos.
 *
 * Scope: neo1 Rare Holo, including Metal Energy 19.
 *
 * Part of the older-era holo remaster (2026-10-01; js/holo-fam.js lists every family, first claim wins). This module
 * decides which card faces are this family's and returns what to add to the face foilExtras() built: the class
 * `fam-wotc-neo-genesis` (every rule in css/holo/fam/wotc-neo-genesis.css is scoped to it), any finer classes, the family's own
 * custom properties (per-card maps as `url('...')` through `url()`, which makes a repo path absolute) and `cure: true` to
 * get the extra `.cure` layer. `base` is foilExtras()'s own result ({ classes, style, cure }) for the same face, so a
 * family can read what the era module decided; a custom property set here comes after the era's in the style
 * attribute, so it wins (`--foil-map` included). `card` has been through foilLook(), so a promo's rarity is its foilAs.
 * Never import js/foil-maps.js from here (it waits on this module).
 *
 * The maps (assets/foil/fam/wotc-neo-genesis/, drawn by .claude/skills/card-textures/scripts/fam/wotc-neo-genesis/make_neo1_maps.py
 * from each card's own scan): `<n>-bg` is where the foil's metallic sheen shows and how strongly (the art window's background:
 * the window less the Pokémon and the evolution badge corner, weighted down where the sky ink is near-black or opaque white;
 * Metal Energy's also holds the ENERGY wordmark's letters), `<n>-fleck-a` / `-b` the scan's own cosmos flecks in two halves,
 * each fleck one random hue (RGBA). A face with maps gets `ng-mapped`; the sheet draws nothing new without it.
 */
import { isWotc, wotcPattern } from "../wotc-foil.js?v=6";

const set = (card) => String(card?.id || "").split("-")[0];
const DIR = "assets/foil/fam/wotc-neo-genesis";
const V = 2;
/** The Rare Holo numbers whose maps are drawn (the 18 Pokémon and Metal Energy 19). */
const MAPPED = new Set(Array.from({ length: 19 }, (_, i) => String(i + 1)));
/** Per-card strength of the flecks (--ng-fleck) where the real card shows fewer, dimmer ones than its scan: Ampharos' near-black
 * sky lights only a few dim dots (Pokemon Holo's tilt frames, two in-hand photos). */
const FLECK = { 1: 0.5 };
const has = (pattern, cls) => ` ${pattern || ""} `.includes(` ${cls} `);

/** Whether a card face is this family's. */
export function claims(card) {
  return Boolean(card) && !card.reverse && isWotc(card) && set(card) === "neo1" && has(wotcPattern(card), "wotc-cosmos");
}

export function famExtras(card, url, base) {
  if (!claims(card)) return null;
  const n = String(card.id).split("-")[1];
  if (!MAPPED.has(n)) return { classes: "fam-wotc-neo-genesis", style: "", cure: false };
  const style = [
    `--ng-bg:url('${url(`${DIR}/${n}-bg-v${V}.webp`)}')`,
    `--ng-fa:url('${url(`${DIR}/${n}-fleck-a-v${V}.webp`)}')`,
    `--ng-fb:url('${url(`${DIR}/${n}-fleck-b-v${V}.webp`)}')`,
  ];
  if (FLECK[n]) style.push(`--ng-fleck:${FLECK[n]}`);
  // Metal Energy's maps cover the picture box and the ENERGY wordmark above it: 565 x 587 card px at (18, 28)
  if (n === "19") style.push("--ng-win-size:94.167% 70.048%", "--ng-win-pos:51.43% 11.155%");
  // cure: the `.cure` layer carries the flecks (css/holo/fam/wotc-neo-genesis.css)
  return { classes: "fam-wotc-neo-genesis ng-mapped", style: style.join(";"), cure: true };
}
