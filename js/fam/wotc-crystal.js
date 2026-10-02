/**
 * Holo family wotc-crystal: the Crystal Pokémon of Aquapolis (ecard2 148-150) and Skyridge (ecard3 145-150).
 *
 * Scope: the nine `wotc-crystal` holo faces (wotcPattern "foil-holo wotc-crystal"); their reverse holos (Skyridge only)
 * are wotc-expedition's.
 *
 * Part of the older-era holo remaster (2026-10-01; js/holo-fam.js lists every family, first claim wins). This module
 * decides which card faces are this family's and returns what to add to the face foilExtras() built: the class
 * `fam-wotc-crystal` (every rule in css/holo/fam/wotc-crystal.css is scoped to it), any finer classes, the family's own
 * custom properties (per-card maps as `url('...')` through `url()`, which makes a repo path absolute) and `cure: true` to
 * get the extra `.cure` layer. `base` is foilExtras()'s own result ({ classes, style, cure }) for the same face, so a
 * family can read what the era module decided; a custom property set here comes after the era's in the style
 * attribute, so it wins (`--foil-map` included). `card` has been through foilLook(), so a promo's rarity is its foilAs.
 * Never import js/foil-maps.js from here (it waits on this module).
 *
 * The real card (photos and frames: /mnt/project-files/holo-remaster/wotc-crystal/refs/): an e-Card HOLO whose cosmos
 * foil shows in the art window's background, the see-through parts of the "crystal" drawing, the slot dashes, the strip's
 * 13 slots and the e logo; the Pokémon, the frame, the name bar, the text box and the Crystal Type banner are matte.
 * Each card has its own maps, drawn from its scan by
 * .claude/skills/card-textures/scripts/fam/wotc-crystal/make_crystal_maps.py into assets/foil/fam/wotc-crystal/:
 *   --foil-map         where the card is foil (replaces the era's crystal-<id>-v1 density map)
 *   --foil-map-dots-a  the scan's own sparkle flecks, one half (lit by .foil::before)
 *   --foil-map-dots-b  the other half (lit by .foil::after); both wink white on .glare
 * The names start with `--foil-map` so the lab's pose reset keeps them, like the era's map.
 */
import { isWotc, wotcPattern } from "../wotc-foil.js?v=6";

const has = (pattern, cls) => ` ${pattern || ""} `.includes(` ${cls} `);
const DIR = "assets/foil/fam/wotc-crystal";

/** The map version of each card (bump one card's entry when its maps are redrawn under a new -vN name). */
const MAPS = {
  "ecard2-148": "v1", // Kingdra
  "ecard2-149": "v1", // Lugia
  "ecard2-150": "v1", // Nidoking
  "ecard3-145": "v1", // Celebi
  "ecard3-146": "v1", // Charizard
  "ecard3-147": "v1", // Crobat
  "ecard3-148": "v1", // Golem
  "ecard3-149": "v1", // Ho-Oh
  "ecard3-150": "v1", // Kabutops
};

/** Whether a card face is this family's. */
export function claims(card) {
  return Boolean(card) && !card.reverse && isWotc(card) && has(wotcPattern(card), "wotc-crystal");
}

export function famExtras(card, url, base) {
  if (!claims(card)) return null;
  const v = MAPS[card.id];
  if (!v) return { classes: "fam-wotc-crystal", style: "", cure: false };
  const map = (kind) => `url('${url(`${DIR}/${card.id}-${kind}-${v}.webp`)}')`;
  return {
    classes: "fam-wotc-crystal cr-mapped",
    style: `--foil-map:${map("foil")};--foil-map-dots-a:${map("dots-a")};--foil-map-dots-b:${map("dots-b")}`,
    cure: false,
  };
}
