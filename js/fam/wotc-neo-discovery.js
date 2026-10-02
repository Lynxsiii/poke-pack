/**
 * Holo family wotc-neo-discovery: Neo Discovery (neo2) holos.
 *
 * Scope: neo2 Rare Holo, 1-17.
 *
 * Part of the older-era holo remaster (2026-10-01; js/holo-fam.js lists every family, first claim wins). This module
 * decides which card faces are this family's and returns what to add to the face foilExtras() built: the class
 * `fam-wotc-neo-discovery` (every rule in css/holo/fam/wotc-neo-discovery.css is scoped to it), the family's own
 * custom properties (per-card maps as `url('...')` through `url()`, which makes a repo path absolute). `base` is
 * foilExtras()'s own result for the same face; a custom property set here comes after the era's in the style attribute.
 * Never import js/foil-maps.js from here (it waits on this module).
 *
 * The real card (refs in /mnt/project-files/holo-remaster/wotc-neo-discovery/refs/): the cosmos holofoil, in the art
 * window's BACKGROUND only; the Pokemon, the frame and the text are matte. Each card has two maps drawn from its own scan by
 * .claude/skills/card-textures/scripts/fam/wotc-neo-discovery/make_neo2_cosmos_maps.py into assets/foil/fam/wotc-neo-discovery/,
 * both crops of the art window (card box 61,94-539,430 of the 600x838 scan), placed by the era's --wotc-map-size/-pos:
 *   --foil-map-bg     alpha: where the foil shows (window less the Pokemon, the evolution badge and dense black ink)
 *   --foil-map-fleck  RGB on black: the scan's own flecks, each tinted its own pale hue
 * The names start with `--foil-map` so the lab's pose reset keeps them. A changed map gets a new -vN name.
 */
import { isWotc, wotcPattern } from "../wotc-foil.js?v=6";

const set = (card) => String(card?.id || "").split("-")[0];
const num = (card) => String(card?.id || "").split("-")[1] || "";
const has = (pattern, cls) => ` ${pattern || ""} `.includes(` ${cls} `);
const DIR = "assets/foil/fam/wotc-neo-discovery/";
/** Pale-ink windows (Espeon's teal watercolour): a dodge would bleach them, so their sheen is held low. */
const PALE = new Set(["1"]);
const MAPS = { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1, 8: 1, 9: 1, 10: 1, 11: 1, 12: 1, 13: 1, 14: 1, 15: 1, 16: 1, 17: 1 };

/** Whether a card face is this family's: the neo2 Rare Holo faces that have maps. */
export function claims(card) {
  return Boolean(card) && !card.reverse && isWotc(card) && set(card) === "neo2" && has(wotcPattern(card), "wotc-cosmos")
    && MAPS[num(card)] > 0;
}

export function famExtras(card, url, base) {
  if (!claims(card)) return null;
  const n = num(card);
  const v = MAPS[n];
  return {
    classes: PALE.has(n) ? "fam-wotc-neo-discovery nd-pale" : "fam-wotc-neo-discovery",
    style: `--foil-map-bg:url('${url(`${DIR}${n}-bg-v${v}.webp`)}');--foil-map-fleck:url('${url(`${DIR}${n}-fleck-v${v}.webp`)}')`,
    cure: false,
  };
}
