/**
 * Holo family xy-generations: Generations (g1) Radiant Collection, holos and reverses.
 *
 * Scope: g1 Radiant Collection RC1-RC27 (`xy-rc`), g1 Rare Holo and every g1 reverse; g1's main-set EX and Mega EX belong to
 * xy-ex-mega, its full arts (main set and the Radiant Collection's RC28-RC32, since 2026-10-02) to xy-full-art.
 *
 * Part of the older-era holo remaster (2026-10-01; js/holo-fam.js lists every family, first claim wins). This module
 * decides which card faces are this family's and returns what to add to the face foilExtras() built: the class
 * `fam-xy-generations` (every rule in css/holo/fam/xy-generations.css is scoped to it), any finer classes, the family's own
 * custom properties (per-card maps as `url('...')` through `url()`, which makes a repo path absolute) and `cure: true` to
 * get the extra `.cure` layer. `base` is foilExtras()'s own result ({ classes, style, cure }) for the same face, so a
 * family can read what the era module decided; a custom property set here comes after the era's in the style
 * attribute, so it wins (`--foil-map` included). `card` has been through foilLook(), so a promo's rarity is its foilAs.
 * Never import js/foil-maps.js from here (it waits on this module).
 *
 * What the real cards do (photos and sources: /mnt/project-files/holo-remaster/xy-generations/refs/SOURCES.md; the
 * family note .claude/skills/card-textures/reference/fam-xy-generations.md):
 * - Radiant Collection Uncommons and the two RC EX (`xygen-rc`): holofoil in a picture that is different on every card:
 *   the art background (the Pokémon matte) and a hidden drawing in the text box (Charizard's snowflakes, Froslass's
 *   whirlpool, Jirachi's wish trail, Meowstic's keys, Diancie's castle...), plus the starry black border of the two EX.
 *   TCG Live publishes each card's map (key xy9-5r), shipped by scripts/fam/xy-generations/ship_g1_maps.py as
 *   assets/foil/fam/xy-generations/rc/<n>.webp; it replaces the era's shared `rc` safe map. Under a lamp the picture
 *   throws a pastel rainbow sheen (Bleeding Cool's photo of Jirachi RC13: pink, white and blue across the window and
 *   the wish trail), not the flat grey mirror #171 drew (Noah 2026-10-02: "lost their spark"). The five full arts
 *   (RC28-RC32) are xy-full-art's, on its textured full-art recipe with these maps.
 * - Radiant Collection Commons (`xygen-plain`): not foil at all (TCGplayer and pokemontcg.io list only a "Normal"
 *   print, TCG Live has no map, Elite Fourum t/14203: "The Common Radiant Collection cards ... are ALL Non-Foil").
 * - Rare Holo (`xygen-holo`, 5 / 27 / 35 / 42 / 45): the XY Sheen holo, broad saturated rainbow beams over the art
 *   background, the Pokémon matte; TCG Live's own map (data `foilMap`).
 * - Reverse holo (`xygen-rev`): the whole body but the art window, holographic, with the type's ghosted symbols;
 *   TCG Live's map of each card's reverse print (key xy9-5, `ph`), shipped as rev/<n>.webp, as `--xygen-rev`, with the
 *   printed ink knocked out of it (the text is opaque ink over the foil on the real card; ship_g1_maps.py reads the
 *   scan for dark ink). RC5 and RC8 have the same knock-out in their text boxes (rc/5.webp, rc/8.webp).
 */
import { isXy, xyPattern } from "../xy-foil.js?v=5";

const set = (card) => String(card?.id || "").split("-")[0];
const has = (pattern, cls) => ` ${pattern || ""} `.includes(` ${cls} `);
const DIR = "assets/foil/fam/xy-generations";

/** "3-5,9" -> Set {"3","4","5","9"} */
function numbers(spec) {
  const out = new Set();
  for (const part of spec.split(",")) {
    const [a, b = a] = part.split("-").map(Number);
    for (let n = a; n <= b; n++) out.add(String(n));
  }
  return out;
}

/** Radiant Collection numbers TCG Live has a foil map for: the 12 Uncommons and the 7 Ultra Rares. The 13 Commons are not foil. */
const RC_FOIL = numbers("5,6,8,10,13,15,16,18-22,24,27-32");
/** Main-set numbers whose reverse print TCG Live maps: every card the reverse slot can deal (Common to Rare Holo, no EX, no full art). */
const REV_MAPS = numbers("3-9,14-16,19-23,26,27,30-36,38-45,47-74");

/** Whether a card face is this family's (the Radiant Collection full arts, `xy-fa xy-rc`, are xy-full-art's). */
export function claims(card) {
  if (!card || set(card) !== "g1" || !isXy(card)) return false;
  if (card.reverse) return true;
  const pattern = xyPattern(card);
  return (has(pattern, "xy-rc") && !has(pattern, "xy-fa")) || has(pattern, "xy-holo");
}

export function famExtras(card, url, base) {
  if (!claims(card)) return null;
  const n = String(card.number || "");
  if (card.reverse) {
    if (!REV_MAPS.has(n)) return { classes: "fam-xy-generations", style: "", cure: false };
    return { classes: "fam-xy-generations xygen-rev", style: `--xygen-rev:url('${url(`${DIR}/rev/${n}.webp`)}')`, cure: false };
  }
  const rc = /^RC(\d+)$/.exec(n);
  if (rc) {
    if (!RC_FOIL.has(rc[1])) return { classes: "fam-xy-generations xygen-plain", style: "", cure: false };
    return { classes: "fam-xy-generations xygen-rc", style: `--foil-map:url('${url(`${DIR}/rc/${rc[1]}.webp`)}')`, cure: true };
  }
  return { classes: "fam-xy-generations xygen-holo", style: "", cure: false };
}
