/**
 * Holo family dp-special-rares: DP-era special rares.
 *
 * Scope: DP-era special rares. SHIPPED (claimed, rebuilt): Rotom RT1-RT6 (`dp-rotom`) and Shining SH1-SH12 (`dp-shining`).
 * NOT claimed yet, so they keep the era look (css/holo/dp-secret.css, dp.css): Arceus AR (`dp-ar`), Shiny Legendary (`dp-shiny-legend`),
 * Alph Lithograph (`dp-alph`) and the secrets (`dp-secret`). Add a sub-finish to SHIPPED only together with its recipe in the
 * sheet: the sheet's first block clears the era's layers on every claimed face.
 *
 * Part of the older-era holo remaster (2026-10-01; js/holo-fam.js lists every family, first claim wins). This module
 * decides which card faces are this family's and returns what to add to the face foilExtras() built: the class
 * `fam-dp-special-rares` (every rule in css/holo/fam/dp-special-rares.css is scoped to it), any finer classes, the family's own
 * custom properties (per-card maps as `url('...')` through `url()`, which makes a repo path absolute) and `cure: true` to
 * get the extra `.cure` layer. `base` is foilExtras()'s own result ({ classes, style, cure }) for the same face, so a
 * family can read what the era module decided; a custom property set here comes after the era's in the style
 * attribute, so it wins (`--foil-map` included). `card` has been through foilLook(), so a promo's rarity is its foilAs.
 * Never import js/foil-maps.js from here (it waits on this module).
 *
 * Finer classes (one per sub-finish, each its own recipe in the sheet) and the per-card maps they read, all drawn from
 * the card's own scan by .claude/skills/card-textures/scripts/fam/dp-special-rares/ into
 * assets/foil/fam/dp-special-rares/ (reference: .claude/skills/card-textures/reference/fam-dp-special-rares.md):
 *   dsr-rotom    RT1-RT6   --dsr-ice (shard colours + where the foil is), --dsr-px / --dsr-py (each shard's tilt phase),
 *                          --dsr-tint (how saturated a flash is: the yellow Pokemon ink whitens it, Charon's grey does not)
 *   dsr-shining  SH1-SH12  --dsr-mask (sh<n>-mask.webp: the Mirror foil is everywhere inside the border but the art window and
 *                          the card's own ink)
 */
import { isDp, dpPattern } from "../dp-foil.js?v=3";

const DIR = "assets/foil/fam/dp-special-rares";
const SUB = /(^|\s)dp-(shining|rotom|ar|shiny-legend|alph|secret)(\s|$)/;
/** The sub-finishes this family has finished and judged; the rest keep the era's own look (dp-secret.css, dp.css). */
const SHIPPED = new Set(["rotom", "shining"]);

/** Whether a card face is this family's. */
export function claims(card) {
  return Boolean(card) && !card.reverse && isDp(card) && SUB.test(dpPattern(card)) && SHIPPED.has(dpPattern(card).match(SUB)[2]);
}

const ROTOM = new Set(["RT1", "RT2", "RT3", "RT4", "RT5", "RT6"]);

export function famExtras(card, url, base) {
  if (!claims(card)) return null;
  const finish = dpPattern(card).match(SUB)[2];
  const [set, num = ""] = String(card.id).split("-");
  const file = (name) => `url('${url(`${DIR}/${name}`)}')`;
  const classes = ["fam-dp-special-rares"];
  const style = [];
  if (finish === "rotom" && set === "pl2" && ROTOM.has(num)) {
    const n = num.toLowerCase();
    classes.push("dsr-rotom");
    style.push(`--dsr-ice:${file(`${n}-ice.webp`)}`, `--dsr-px:${file(`${n}-px.webp`)}`, `--dsr-py:${file(`${n}-py.webp`)}`,
      `--dsr-tint:${num === "RT6" ? 0.6 : 0.3}`);
  }
  if (finish === "shining") {
    classes.push("dsr-shining");
    style.push(`--dsr-mask:${file(`${num.toLowerCase()}-mask.webp`)}`);
  }
  return { classes: classes.join(" "), style: style.join(";"), cure: false };
}
