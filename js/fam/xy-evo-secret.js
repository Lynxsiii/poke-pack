/**
 * Holo family xy-evo-secret: Evolutions' five secret rares (xy12 109-113: the Japanese Exeggutor, Flying Pikachu, Surfing Pikachu, Imakuni?'s Doduo, Here Comes Team Rocket!).
 *
 * Scope: the ids in CARDS (not their reverses).
 *
 * Part of the older-era holo remaster (2026-10-01; js/holo-fam.js lists every family, first claim wins). Started
 * 2026-10-02 for Noah's secret rare remake (20:09: "remake the Secret rares, most have really shitty texture and i dont
 * like the overuse of the rainbow glare as most cards dont really have that rainbow glare ... Dialga-EX 122/119, the
 * card looks amzing in person and on the site it looks like shit"). This module decides which card faces are this
 * family's and returns what to add to the face foilExtras() built: the class `fam-xy-evo-secret` (every rule in
 * css/holo/fam/xy-evo-secret.css is scoped to it), any finer classes, the family's own custom properties (per-card maps as
 * `url('...')` through `url()`, which makes a repo path absolute) and `cure: true` to get the extra `.cure` layer.
 * `base` is foilExtras()'s own result ({ classes, style, cure }) for the same face; a custom property set here comes
 * after the era's in the style attribute, so it wins (`--foil-map` included). Never import js/foil-maps.js from here.
 * Before this family the cards were xy-full-art's (that is the look to beat: `?famskip=xy-evo-secret` in the lab shows it).
 */
import { isXy } from "../xy-foil.js?v=5";

/** The prints this family draws. */
const CARDS = new Set(["xy12-109", "xy12-110", "xy12-111", "xy12-112", "xy12-113"]);

/** Whether a card face is this family's. */
export function claims(card) {
  return Boolean(card) && !card.reverse && isXy(card) && CARDS.has(String(card.id || ""));
}

export function famExtras(card, url, base) {
  if (!claims(card)) return null;
  return { classes: "fam-xy-evo-secret", style: "", cure: false };
}
