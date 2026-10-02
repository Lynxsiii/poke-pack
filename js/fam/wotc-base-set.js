/**
 * Holo family wotc-base-set: Base Set (base1) holos.
 *
 * Scope: base1 Rare Holo 1-16 (Starlight) and the CD-ROM Machamp base4-cdrom8 that reuses the base1 scan.
 *
 * Part of the older-era holo remaster (2026-10-01; js/holo-fam.js lists every family, first claim wins). This module
 * decides which card faces are this family's and returns what to add to the face foilExtras() built: the class
 * `fam-wotc-base-set` (every rule in css/holo/fam/wotc-base-set.css is scoped to it), any finer classes, the family's own
 * custom properties (per-card maps as `url('...')` through `url()`, which makes a repo path absolute) and `cure: true` to
 * get the extra `.cure` layer. `base` is foilExtras()'s own result ({ classes, style, cure }) for the same face, so a
 * family can read what the era module decided; a custom property set here comes after the era's in the style
 * attribute, so it wins (`--foil-map` included). `card` has been through foilLook(), so a promo's rarity is its foilAs.
 * Never import js/foil-maps.js from here (it waits on this module).
 *
 * The maps (assets/foil/fam/wotc-base-set/, drawn from each card's own scan by the scripts in
 * .claude/skills/card-textures/scripts/fam/wotc-base-set/; reference/fam-wotc-base-set.md):
 *   <n>-bg-v1     where the foil shows: the art window's background, less the Pokémon (printed over a white underlay,
 *                 matte), its ~6 px underlay halo on the cards that print one, and the evolution badge;
 *   <n>-spark-v1  the scan's own starlight (the four-point stars and the streaks the foil printed into the scan),
 *                 split into two halves, <n>-spark-a-v1 and <n>-spark-b-v1, that wink in turn.
 * A face with maps gets `wbs-mapped`; the sheet draws nothing new without it. The CD-ROM Machamp is dealt with the
 * base1/8 scan, so it takes base1/8's maps.
 */
import { isWotc, wotcPattern } from "../wotc-foil.js?v=6";

const set = (card) => String(card?.id || "").split("-")[0];
const has = (pattern, cls) => ` ${pattern || ""} `.includes(` ${cls} `);
const DIR = "assets/foil/fam/wotc-base-set";
const V = 1;
/** The base1 number whose scan (and so whose maps) a face uses: its own, or the scan a reprint borrows. */
const SCAN = { "base4-cdrom8": "8" };
const MAPPED = new Set(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16"]);

/** Whether a card face is this family's. */
export function claims(card) {
  return Boolean(card) && !card.reverse && isWotc(card) && (set(card) === "base1" || card.id === "base4-cdrom8") && has(wotcPattern(card), "wotc-cosmos");
}

export function famExtras(card, url, base) {
  if (!claims(card)) return null;
  const n = SCAN[card.id] || String(card.id).split("-")[1];
  if (!MAPPED.has(n)) return { classes: "fam-wotc-base-set", style: "", cure: false };
  const style = [
    `--wbs-bg:url('${url(`${DIR}/${n}-bg-v${V}.webp`)}')`,
    `--wbs-spark-a:url('${url(`${DIR}/${n}-spark-a-v${V}.webp`)}')`,
    `--wbs-spark-b:url('${url(`${DIR}/${n}-spark-b-v${V}.webp`)}')`,
  ].join(";");
  return { classes: "fam-wotc-base-set wbs-mapped", style, cure: false };
}
