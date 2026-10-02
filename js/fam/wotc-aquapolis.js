/**
 * Holo family wotc-aquapolis: Aquapolis (ecard2) holos.
 *
 * Scope: ecard2 Rare Holo H1-H32 (`wotc-ecard`); Crystals belong to wotc-crystal, the reverse to wotc-expedition.
 *
 * Part of the older-era holo remaster (2026-10-01; js/holo-fam.js lists every family, first claim wins). This module
 * decides which card faces are this family's and returns what to add to the face foilExtras() built: the class
 * `fam-wotc-aquapolis` (every rule in css/holo/fam/wotc-aquapolis.css is scoped to it), any finer classes, the family's own
 * custom properties (per-card maps as `url('...')` through `url()`, which makes a repo path absolute) and `cure: true` to
 * get the extra `.cure` layer. `base` is foilExtras()'s own result ({ classes, style, cure }) for the same face, so a
 * family can read what the era module decided; a custom property set here comes after the era's in the style
 * attribute, so it wins (`--foil-map` included). `card` has been through foilLook(), so a promo's rarity is its foilAs.
 * Never import js/foil-maps.js from here (it waits on this module).
 *
 * Each of the 32 claimed holos has its own map, assets/foil/fam/wotc-aquapolis/H<n>-v1.webp (alpha: the foil area, the art
 * window's background less the matte Pokemon plus the ladder bars, the 13 slots and the e logo; RGB: the card's own
 * printed dots), drawn by .claude/skills/card-textures/scripts/fam/wotc-aquapolis/make_aquapolis_maps.py. It is both
 * `--foil-map` (so the shared map rules cut the same area) and `--aq-map` (the family sheet paints its dots).
 */
import { isWotc, wotcPattern } from "../wotc-foil.js?v=6";

const set = (card) => String(card?.id || "").split("-")[0];
const has = (pattern, cls) => ` ${pattern || ""} `.includes(` ${cls} `);
/** H1-H32. */
const number = (card) => {
  const n = String(card?.id || "").split("-")[1] || "";
  return /^H([1-9]|[12][0-9]|3[0-2])$/.test(n) ? n : "";
};

/** Whether a card face is this family's. */
export function claims(card) {
  return Boolean(card) && !card.reverse && isWotc(card) && set(card) === "ecard2" && has(wotcPattern(card), "wotc-ecard") && Boolean(number(card));
}

export function famExtras(card, url, base) {
  if (!claims(card)) return null;
  const n = number(card);
  const map = url(`assets/foil/fam/wotc-aquapolis/${n}-${n === "H16" ? "v2" : "v1"}.webp`);
  // H16 Magneton uses the redrawn -v2 map (Magnemites matte by hand and ink colour).
  return { classes: "fam-wotc-aquapolis", style: `--foil-map:url('${map}');--aq-map:url('${map}')`, cure: false };
}
