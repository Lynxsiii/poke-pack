/**
 * Holo family xy-ex-mega: XY Pokémon-EX and Mega EX.
 *
 * Scope: every `xy-ex` print that is an EX or Mega EX (the Double Crisis EX, Evolutions' and Generations' main-set EX included).
 *
 * Part of the older-era holo remaster (2026-10-01; js/holo-fam.js lists every family, first claim wins). This module
 * decides which card faces are this family's and returns what to add to the face foilExtras() built: the class
 * `fam-xy-ex-mega` (every rule in css/holo/fam/xy-ex-mega.css is scoped to it), any finer classes, the family's own
 * custom properties (per-card maps as `url('...')` through `url()`, which makes a repo path absolute) and `cure: true` to
 * get the extra `.cure` layer. `base` is foilExtras()'s own result ({ classes, style, cure }) for the same face, so a
 * family can read what the era module decided; a custom property set here comes after the era's in the style
 * attribute, so it wins (`--foil-map` included). `card` has been through foilLook(), so a promo's rarity is its foilAs.
 * Never import js/foil-maps.js from here (it waits on this module).
 *
 * What it adds (the sheet's hooks; research in reference/fam-xy-ex-mega.md):
 *   --foil-map  TCG Live's foil map for the 40 black star promos of the family that data/*.json carries none for
 *               (assets/foil/fam/xy-ex-mega/<id>-map.webp, scripts/fam/xy-ex-mega/ship_promo_maps.py): foil on the frame
 *               and the art background, the Pokémon and the text box matte. Before, they drew on a median "safe" map
 *               (the average of the family's maps), which cuts the wrong shapes on every one of them.
 *   xm-pale     the prints whose foil area scans pale (mean luminance of the scan under Live's map >= 146, measured
 *               2026-10-02): the prism bars in hard-light over neutral grey, so a bar stays colour and not white.
 *   --xm-ink    every print: its lettering as a mask the bars and the lamp step around (assets/foil/fam/xy-ex-mega/<id>-ink-v2.webp,
 *               make_ink_masks_v2.py): the name plate's dark ink, the gold EX (found by its shape since 2026-10-22: v1 missed it on
 *               28 yellow, green and orange plates), the evolution circle, the white rule-box header lettering, and the small
 *               islands TCG Live's map marks foil inside the matte Pokémon (eye highlights) or below the art.
 *   Double Crisis: Team Aqua's Kyogre-EX and Team Magma's Groudon-EX take the family's prism bars over their Live map (which
 *               covers the whole face). The English prints have the bars (audit w2-xy-ex, 2026-10-22: an eBay lamp photo of 6/34,
 *               Pokemon Holo's tilt frames, an English 15/34); the shattered-glass facets drawn before (xm-dc, -facets-v1 /
 *               -tint-v1, make_dc_facets.py) are the JAPANESE 006/034 and 015/034 foil, so they are no longer used.
 *   Pyroar xy2-xyp026 (a Stage 1 the data files as "Rare Holo EX") is not an EX and is not claimed.
 */
import { isXy, xyPattern } from "../xy-foil.js?v=5";

const has = (pattern, cls) => ` ${pattern || ""} `.includes(` ${cls} `);
const DIR = "assets/foil/fam/xy-ex-mega";

/** Black star promos of the family with TCG Live's foil map shipped here (data/*.json has none for them). */
const PROMO_MAP = new Set([
  "g1-xyp148", "xy1-xyp009", "xy10-xyp104", "xy10-xyp133", "xy10-xyp149", "xy10-xyp150", "xy10-xyp151", "xy12-xyp157",
  "xy12-xyp158", "xy12-xyp167", "xy12-xyp168", "xy12-xyp170", "xy12-xyp171", "xy2-xyp018", "xy2-xyp019", "xy2-xyp020",
  "xy2-xyp025", "xy2-xyp026", "xy4-xyp034", "xy4-xyp035", "xy4-xyp043", "xy4-xyp044", "xy4-xyp045", "xy5-xyp041",
  "xy5-xyp042", "xy5-xyp061", "xy6-xyp055", "xy6-xyp062", "xy6-xyp063", "xy6-xyp066", "xy7-xyp070", "xy7-xyp073",
  "xy8-xyp084", "xy8-xyp085", "xy8-xyp086", "xy8-xyp087", "xy8-xyp102", "xy9-xyp106", "xy9-xyp107", "xy9-xyp108",
]);

/**
 * Prints whose foil area (frame and background under Live's map) is mostly pale: mean luminance of the scan under the map
 * >= 146, measured 2026-10-02 (57 of 185; REVIEW-1 also saw M Rayquaza xy6-76 at 148 and Chesnaught xyp018 at 147 wash out).
 * Colour-dodge clips pale ink to white, so these take the prism bars in hard-light over neutral grey instead (`xm-pale`).
 */
const PALE = new Set([
  "xy10-85", "xy3-xyp030", "xy12-21", "xy5-38", "xy6-26", "xy4-xyp045", "xy7-57", "xy10-83", "xy5-105",
  "xy10-xyp149", "xy8-34", "xy12-72", "xy7-25", "xy2-xyp020", "xy12-26", "xy4-23", "xy12-52", "xy3-xyp029", "xy12-1",
  "xy8-xyp102", "xy7-36", "xy5-xyp041", "xy4-xyp034", "xy7-68", "g1-24", "xy3-20", "xy7-27", "xy10-54", "xy12-64",
  "xy3-64", "xy6-35", "xy12-12", "g1-10", "xy4-65", "g1-28", "xy7-43", "xy12-xyp170", "xy9-31", "xy5-91", "xy2-12",
  "xy12-2", "g1-37", "g1-13", "g1-17", "xy6-58", "xy4-62", "xy8-xyp085", "xy9-32", "xy12-65", "xy6-76", "xy2-xyp019",
  "xy7-28", "xy7-xyp072", "xy2-xyp018", "xy12-27", "xy8-35", "xy1-29",
  // rendered, not scanned: the big bright full-bleed Mega arts that the dodge washed out at the thumb pose (50:78, L +30 on master, S -10)
  "xy2-69", "xy12-22",
]);

/** An EX or a Mega EX (the data's subtypes, or the name when a promo's subtypes lack it). Pyroar xyp026 is a Stage 1 filed under foilAs "Rare Holo EX". */
const isEx = (card) => (card.subtypes || []).some((s) => /^(ex|mega)$/i.test(String(s))) || /(^|[\s-])EX$/.test(String(card.name || ""));

/** Whether a card face is this family's. */
export function claims(card) {
  return Boolean(card) && !card.reverse && isXy(card) && has(xyPattern(card), "xy-ex") && isEx(card);
}

export function famExtras(card, url, base) {
  if (!claims(card)) return null;
  const id = String(card.id);
  const classes = ["fam-xy-ex-mega"];
  // --xm-ink: the card's lettering knocked out of the bars and the lamp (scripts/fam/xy-ex-mega/make_ink_masks_v2.py)
  const style = [`--xm-ink:url('${url(`${DIR}/${id}-ink-v2.webp`)}')`];
  if (PALE.has(id)) classes.push("xm-pale");
  if (!card.foilMap && PROMO_MAP.has(id)) style.push(`--foil-map:url('${url(`${DIR}/${id}-map.webp`)}')`);
  return { classes: classes.join(" "), style: style.join(";"), cure: true };
}
