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

const DIR = "assets/foil/fam/xy-secret-gold";

/** The prints this family draws. */
const CARDS = new Set(["xy5-161", "xy5-162", "xy5-163", "xy5-164", "xy6-109", "xy6-110", "xy7-99", "xy7-100", "xy2-107", "xy2-108", "xy2-109", "xy3-112", "xy3-113", "xy4-120", "xy4-121"]);

/** The gold Items (a gold-engraved card; the rest are gold Mega EX secrets, dark gold with a fine pebbled grain). */
const ITEMS = new Set(["xy5-161", "xy5-162", "xy5-163", "xy5-164", "xy6-109", "xy6-110", "xy7-99", "xy7-100"]);

/** Whether a card face is this family's. */
export function claims(card) {
  return Boolean(card) && !card.reverse && isXy(card) && CARDS.has(String(card.id || ""));
}

/**
 * What it adds (the sheet's hooks):
 *   xsg-item / xsg-mega  the finish: gold Item or gold Mega secret (the sheet's stripe, mask and line recipes differ).
 *   --xsg-lines          the card's own engraved lines as an alpha mask at 733 x 1024: the Items' ridge crests, cut from TCG Live's
 *                        native etch (<id>-ridge-v1.webp, scripts/fam/xy-secret-gold/make_item_ridges.py: the crest of each
 *                        ridge against its neighbourhood, not a blur), the Megas' etch drawn from the card's scan
 *                        (<id>-etch-v1.webp, make_mega_etch.py: Live ships none for them).
 *   --xsg-safe           the shared text-safe map of the frame (art 1, the text box about 0.4): the lamp ramp and the glare are
 *                        cut to it so the white text box and the lettering are not greyed.
 *   cure: true           the `.cure` layer, which carries the one stripe.
 */
export function famExtras(card, url, base) {
  if (!claims(card)) return null;
  const id = String(card.id);
  const item = ITEMS.has(id);
  const lines = `${DIR}/${id}-${item ? "ridge" : "etch"}-v1.webp`;
  const safe = `assets/foil/xy-safe-${item ? "item" : "mega"}-v1.webp`;
  return {
    classes: `fam-xy-secret-gold ${item ? "xsg-item" : "xsg-mega"}`,
    style: `--xsg-lines:url('${url(lines)}');--xsg-safe:url('${url(safe)}')`,
    cure: true,
  };
}
