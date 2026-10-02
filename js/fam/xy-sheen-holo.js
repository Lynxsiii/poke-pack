/**
 * Holo family xy-sheen-holo: XY Sheen Rare Holo.
 *
 * Scope: every `xy-holo` Rare Holo of xy0-xy11, Double Crisis, the xyp promos and the kits (not Evolutions, not Generations, not McDonald's).
 *
 * Part of the older-era holo remaster (2026-10-01; js/holo-fam.js lists every family, first claim wins). This module
 * decides which card faces are this family's and returns what to add to the face foilExtras() built: the class
 * `fam-xy-sheen-holo` (every rule in css/holo/fam/xy-sheen-holo.css is scoped to it), any finer classes, the family's own
 * custom properties (per-card maps as `url('...')` through `url()`, which makes a repo path absolute) and `cure: true` to
 * get the extra `.cure` layer. `base` is foilExtras()'s own result ({ classes, style, cure }) for the same face, so a
 * family can read what the era module decided; a custom property set here comes after the era's in the style
 * attribute, so it wins (`--foil-map` included). `card` has been through foilLook(), so a promo's rarity is its foilAs.
 * Never import js/foil-maps.js from here (it waits on this module).
 *
 * Two finishes (research: /mnt/project-files/holo-remaster/xy-sheen-holo/, reference/fam-xy-sheen-holo.md):
 * - `xysh-sheen`: the Sheen holofoil of the numbered sets, Double Crisis, the Kalos starter set, the trainer kits
 *   and the "Mirror" black-star promos (prerelease, league and event promos). Smooth foil, no pattern: broad
 *   saturated spectral bands sweep the foil area on tilt.
 * - `xysh-cosmos`: the black-star promos printed on Cosmos holofoil (blister, tin and collection promos), the
 *   dotted cosmos foil (Pokumon's finish taxonomy, cross-checked against photos).
 * `DRAWN` gives the prints TCG Live has no map for (the starter set, the kits and many promos) a window drawn from
 * their own art with the Pokemon and any printed logo cut out (scripts/fam/xy-sheen-holo/draw_windows.py), in place of
 * the era's plain window that foiled the Pokemon too.
 */
import { isXy, xyPattern } from "../xy-foil.js?v=5";

const has = (pattern, cls) => ` ${pattern || ""} `.includes(` ${cls} `);

/** Black-star promos on Cosmos holofoil (claimed again with Cosmos v3, 2026-10-02: fine sparkle under round soft dots, `xysh-cosmos` in the sheet). 25 of them have a TCG Live map; the other 36 draw their window below. */
const COSMOS = new Set([
  "xy1-xyp005", "xy1-xyp006", "xy2-xyp011", "xy2-xyp012", "xy3-xyp014", "xy3-xyp015", "xy3-xyp016",
  "xy4-xyp022", "xy4-xyp023", "xy4-xyp024", "xy5-xyp040", "xy5-xyp051", "xy5-xyp052",
  "xy6-xyp049", "xy6-xyp050", "xy6-xyp064", "xy6-xyp065", "xy7-xyp056", "xy7-xyp057", "xy7-xyp058", "xy7-xyp059",
  "xy8-xyp067", "xy8-xyp088", "xy8-xyp089", "xy8-xyp090", "xy8-xyp092", "xy8-xyp093", "xy8-xyp100", "xy8-xyp101",
  "xy9-xyp095", "xy9-xyp096", "xy9-xyp109",
  "xy10-xyp131", "xy10-xyp132", "xy10-xyp137", "xy10-xyp138", "xy10-xyp152",
  "xy11-xyp139", "xy11-xyp140", "xy11-xyp141", "xy11-xyp142",
  "xy12-xyp160", "xy12-xyp161", "xy12-xyp162", "xy12-xyp163", "xy12-xyp164", "xy12-xyp165", "xy12-xyp179",
  "xy12-xyp187", "xy12-xyp188", "xy12-xyp189", "xy12-xyp190", "xy12-xyp191", "xy12-xyp192", "xy12-xyp193",
  "xy12-xyp194", "xy12-xyp195", "xy12-xyp196", "xy12-xyp197",
  "xyp-xyp178", "xyp-xyp184",
]);

/** Drawn windows for the prints with no TCG Live map: id -> file in assets/foil/fam/xy-sheen-holo/win/. */
const DRAWN = new Set([
  "xy0-k10", "xy0-k14", "xy0-k5", "xy1-xyp001", "xy1-xyp002", "xy1-xyp003", "xy1-xyp004",
  "xy10-xyp127", "xy10-xyp128", "xy10-xyp129", "xy10-xyp130", "xy10-xyp153", "xy10-xyp156",
  "xy4-xyp036", "xy4-xyp037", "xy4-xyp038",
  "xytk6a-30", "xytk6b-30", "xytk7a-30", "xytk7b-30", "xytk8a-30", "xytk8b-30", "xytk9a-30", "xytk9b-30",
  // Cosmos promos with no Live map: window drawn from the art, Pokemon cut out (so the dots stay on the background).
  // draw_windows.py cut the first pass; draw_windows_v2.py redrew the full-bleed cards (Fearow xy7-xyp057, Malamar xy7-xyp058,
  // Salamence xy7-xyp059, Regirock xy6-xyp049, Sableye xy8-xyp092, Celebi xy8-xyp093: the art runs under the Ability / Trait bar and
  // the attack text, so the era's art-window rectangle was the wrong shape), Rayquaza xy6-xyp064, Pikachu xy9-xyp095, Xerneas
  // xy1-xyp005, Greninja xy12-xyp162 and Trevenant xy3-xyp014 (2026-10-02 19:00 QA pass).
  "xy1-xyp005",
  "xy1-xyp006",
  "xy10-xyp131",
  "xy10-xyp132",
  "xy10-xyp137",
  "xy10-xyp138",
  "xy10-xyp152",
  "xy11-xyp141",
  "xy12-xyp160",
  "xy12-xyp161",
  "xy12-xyp162",
  "xy12-xyp179",
  "xy2-xyp011",
  "xy2-xyp012",
  "xy3-xyp014",
  "xy3-xyp015",
  "xy4-xyp022",
  "xy4-xyp023",
  "xy4-xyp024",
  "xy5-xyp040",
  "xy5-xyp051",
  "xy5-xyp052",
  "xy6-xyp049",
  "xy6-xyp050",
  "xy6-xyp064",
  "xy6-xyp065",
  "xy7-xyp056",
  "xy7-xyp057",
  "xy7-xyp058",
  "xy7-xyp059",
  "xy8-xyp092",
  "xy8-xyp093",
  "xy8-xyp101",
  "xy9-xyp095",
  "xy9-xyp096",
  "xy9-xyp109",
]);

/** Cosmos promos held on the era look: review #2 (2026-10-02 19:50) found Pikachu xy9-xyp095's drawn window only 8% of the
 * card (slivers between the characters), so it read as the plain scan and master's window holo looked better. */
const HELD = new Set(["xy9-xyp095"]);

/** Whether a card face is this family's. */
export function claims(card) {
  // The 61 Cosmos black-star promos are claimed (Cosmos v3, 2026-10-02 18:27). Review #1 had un-claimed them for the v1 pixel
  // squares (era smooth-cosmos masks drawn at 2x, Pangoro xy6-xyp050 turned magenta); v3 is fine sparkle under round soft dots
  // (cosmos-dots-v1.webp) with no dodge ground, and the mapless ones draw a window with the Pokemon cut out. Judged against master
  // in WebKit at 220 px x 3 (30:25 and 50:78): Pangoro, Celebi xy12-xyp187 and Mew xy12-xyp192 read closer to the real cards, and
  // on the full-bleed cards (Fearow, Malamar, Salamence, Regirock, Sableye, Celebi xy8-xyp093) master drew a rectangular rainbow
  // block over the Pokemon and the Trait bar that this family no longer does.
  return Boolean(card) && !card.reverse && isXy(card) && has(xyPattern(card), "xy-holo") && !has(xyPattern(card), "xy-starlight") && !has(xyPattern(card), "xy-rc") && !HELD.has(String(card.id || ""));
}

export function famExtras(card, url, base) {
  if (!claims(card)) return null;
  const id = String(card.id || "");
  const finish = COSMOS.has(id) ? "xysh-cosmos" : "xysh-sheen";
  const style = DRAWN.has(id) ? `--foil-map:url('${url(`assets/foil/fam/xy-sheen-holo/win/${id}.webp`)}')` : "";
  return { classes: `fam-xy-sheen-holo ${finish}`, style, cure: true };
}
