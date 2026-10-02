/**
 * Holo family xy-secret-gold: XY gold secret rares: the gold Items of Primal Clash, Roaring Skies and Ancient Origins and the gold Mega EX secrets of Flashfire, Furious Fists and Phantom Forces.
 *
 * Scope: the ids in CARDS (not their reverses).
 *
 * Part of the older-era holo remaster (2026-10-01; js/holo-fam.js lists every family, first claim wins). Started
 * 2026-10-02 for Noah's secret rare remake (20:09: "remake the Secret rares, most have really shitty texture and i dont
 * like the overuse of the rainbow glare as most cards dont really have that rainbow glare ... Dialga-EX 122/119, the
 * card looks amzing in person and on the site it looks like shit"). This module decides which card faces are this
 * family's and returns what to add to the face foilExtras() built: the class `fam-xy-secret-gold` (every rule in
 * css/holo/fam/xy-secret-gold.css is scoped to it), any finer classes, the family's own custom properties (per-card maps as
 * `url('...')` through `url()`, which makes a repo path absolute) and `cure: true` to get the extra `.cure` layer.
 * `base` is foilExtras()'s own result ({ classes, style, cure }) for the same face; a custom property set here comes
 * after the era's in the style attribute, so it wins (`--foil-map` included). Never import js/foil-maps.js from here.
 * Before this family the cards were xy-full-art's (that is the look to beat: `?famskip=xy-secret-gold` in the lab shows it).
 */
import { isXy } from "../xy-foil.js?v=5";

/** The prints this family draws. */
const CARDS = new Set(["xy5-161", "xy5-162", "xy5-163", "xy5-164", "xy6-109", "xy6-110", "xy7-99", "xy7-100", "xy2-107", "xy2-108", "xy2-109", "xy3-112", "xy3-113", "xy4-120", "xy4-121"]);

/** Whether a card face is this family's. */
export function claims(card) {
  return Boolean(card) && !card.reverse && isXy(card) && CARDS.has(String(card.id || ""));
}

export function famExtras(card, url, base) {
  if (!claims(card)) return null;
  return { classes: "fam-xy-secret-gold", style: "", cure: false };
}
