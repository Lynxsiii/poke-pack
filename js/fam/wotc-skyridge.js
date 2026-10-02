/**
 * Holo family wotc-skyridge: Skyridge (ecard3) holos.
 *
 * Scope: ecard3 Rare Holo H1-H32 (`wotc-ecard`) but H29 Steelix; Crystals belong to wotc-crystal, the reverse to wotc-expedition.
 *
 * Part of the older-era holo remaster (2026-10-02; js/holo-fam.js lists every family, first claim wins). This module
 * decides which card faces are this family's and returns what to add to the face foilExtras() built: the class
 * `fam-wotc-skyridge` (every rule in css/holo/fam/wotc-skyridge.css is scoped to it), any finer classes, the family's own
 * custom properties (per-card maps as `url('...')` through `url()`, which makes a repo path absolute) and `cure: true` to
 * get the extra `.cure` layer. `base` is foilExtras()'s own result ({ classes, style, cure }) for the same face, so a
 * family can read what the era module decided; a custom property set here comes after the era's in the style
 * attribute, so it wins (`--foil-map` included). `card` has been through foilLook(), so a promo's rarity is its foilAs.
 * Never import js/foil-maps.js from here (it waits on this module).
 *
 * Each claimed holo has its own map, assets/foil/fam/wotc-skyridge/H<n>-v1.webp (alpha: the foil area, the art
 * window's background less the matte Pokemon plus the notch bars, the 13 slots and the e logo; RGB: the card's own
 * printed dots), drawn by .claude/skills/card-textures/scripts/fam/wotc-skyridge/make_skyridge_maps.py. It is both
 * `--foil-map` (so the shared map rules cut the same area) and `--sk-map` (the family sheet paints its dots).
 * H29 Steelix is not claimed: a black body on a red swirl whose foil the maps cannot separate; it stays on the era recipe.
 */
import { isWotc, wotcPattern } from "../wotc-foil.js?v=6";

const set = (card) => String(card?.id || "").split("-")[0];
const has = (pattern, cls) => ` ${pattern || ""} `.includes(` ${cls} `);
/** H1-H32 but H29. */
const number = (card) => {
  const n = String(card?.id || "").split("-")[1] || "";
  return /^H([1-9]|1[0-9]|2[0-8]|3[0-2]|30)$/.test(n) ? n : "";
};

/** Whether a card face is this family's. */
export function claims(card) {
  return Boolean(card) && !card.reverse && isWotc(card) && set(card) === "ecard3" && has(wotcPattern(card), "wotc-ecard") && Boolean(number(card));
}

export function famExtras(card, url, base) {
  if (!claims(card)) return null;
  const map = url(`assets/foil/fam/wotc-skyridge/${number(card)}-v1.webp`);
  return { classes: "fam-wotc-skyridge", style: `--foil-map:url('${map}');--sk-map:url('${map}')`, cure: false };
}
