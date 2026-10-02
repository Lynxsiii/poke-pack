/**
 * Holo family dp-special-rares: DP-era special rares.
 *
 * Scope: DP-era special rares. SHIPPED (claimed, rebuilt): Rotom RT1-RT6 (`dp-rotom`), Shining SH1-SH12 (`dp-shining`) and, for the
 * faces listed in COSMOS (they have a cosmos map), Arceus AR (`dp-ar`) and Shiny Legendary SL (`dp-shiny-legend`).
 * NOT claimed yet, so they keep the era look (css/holo/dp-secret.css, dp.css): Alph Lithograph (`dp-alph`) and the secrets
 * (`dp-secret`). Add a sub-finish to SHIPPED only together with its recipe in the sheet: the sheet's first block clears the
 * era's layers on every claimed face.
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
 *   dsr-cosmos   AR1-AR9, SL1-SL11  the live dp-cosmos-holo recipe on the art window: --foil-map = cos-<id>.webp (alpha = window minus the
 *                          Pokemon, RGB = the cosmos flecks; make_cosmos_maps.py), `cure: true` for the fleck layer; dsr-ar adds the
 *                          body ripple sheen (--dsr-win = the era's window mask), dsr-sl keeps the era's silver-border glitter
 *   dsr-shining  SH1-SH12  --dsr-mask (sh<n>-mask.webp: the Mirror foil is everywhere inside the border but the art window and
 *                          the card's own ink)
 */
import { isDp, dpPattern } from "../dp-foil.js?v=3";

const DIR = "assets/foil/fam/dp-special-rares";
const SUB = /(^|\s)dp-(shining|rotom|ar|shiny-legend|alph|secret)(\s|$)/;
/** The sub-finishes this family has finished and judged; the rest keep the era's own look (dp-secret.css, dp.css). */
const SHIPPED = new Set(["rotom", "shining", "ar", "shiny-legend"]);
/** The Arceus AR and Shiny Legendary faces that have a cosmos map (assets/foil/fam/dp-special-rares/cos-<id>.webp); a face without one keeps the era look. */
const COSMOS = new Set("pl4-AR1 pl4-AR2 pl4-AR3 pl4-AR4 pl4-AR5 pl4-AR6 pl4-AR7 pl4-AR8 pl4-AR9 col1-SL1 col1-SL2 col1-SL3 col1-SL4 col1-SL5 col1-SL6 col1-SL7 col1-SL8 col1-SL9 col1-SL10 col1-SL11".split(" "));
const COSMOS_KINDS = new Set(["ar", "shiny-legend"]);

/** Whether a card face is this family's. */
export function claims(card) {
  if (!card || card.reverse || !isDp(card)) return false;
  const kind = dpPattern(card).match(SUB)?.[2];
  if (!kind || !SHIPPED.has(kind)) return false;
  return !COSMOS_KINDS.has(kind) || COSMOS.has(String(card.id));
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
  if (COSMOS_KINDS.has(finish)) {
    classes.push("dsr-cosmos", finish === "ar" ? "dsr-ar" : "dsr-sl", "has-foil-map");
    style.push(`--foil-map:${file(`cos-${num.toLowerCase()}.webp`)}`);
    if (finish === "ar") style.push(`--dsr-win:url('${url("assets/foil/dp-win/dp-basic.webp")}')`);
    return { classes: classes.join(" "), style: style.join(";"), cure: true };
  }
  if (finish === "shining") {
    classes.push("dsr-shining");
    style.push(`--dsr-mask:${file(`${num.toLowerCase()}-mask.webp`)}`);
  }
  return { classes: classes.join(" "), style: style.join(";"), cure: false };
}
