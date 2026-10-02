/**
 * Holo family bw-radiant-collection: Legendary Treasures Radiant Collection.
 *
 * Scope: bw11 RC1-RC25 (`bw-rc`, including the RC full arts).
 *
 * Part of the older-era holo remaster (2026-10-01; js/holo-fam.js lists every family, first claim wins). This module
 * decides which card faces are this family's and returns what to add to the face foilExtras() built: the class
 * `fam-bw-radiant-collection` (every rule in css/holo/fam/bw-radiant-collection.css is scoped to it), any finer classes, the family's own
 * custom properties (per-card maps as `url('...')` through `url()`, which makes a repo path absolute) and `cure: true` to
 * get the extra `.cure` layer. `base` is foilExtras()'s own result ({ classes, style, cure }) for the same face, so a
 * family can read what the era module decided; a custom property set here comes after the era's in the style
 * attribute, so it wins (`--foil-map` included). `card` has been through foilLook(), so a promo's rarity is its foilAs.
 * Never import js/foil-maps.js from here (it waits on this module).
 *
 * The two finishes of the Collection (photos and sources: /mnt/project-files/holo-remaster/bw-radiant-collection/refs/SOURCES.md,
 * the family note: .claude/skills/card-textures/reference/fam-bw-radiant-collection.md):
 * - rcf-chips, the Confetti holofoil: the uncommons (RC3, 4, 6, 7, 10, 12, 13, 14, 19), the regular-art Meloetta-EX RC11 and the
 *   full arts RC21-RC25. A field of small round foil chips on the art window's ground and over the text box (on RC11 and the
 *   full arts: edge to edge), each flashing one saturated colour; the Pokemon itself is matte ink. The zone is a drawn map
 *   per card with the Pokemon cut out (make_rc_maps.py).
 * - rcf-stars, the star holo: the commons (RC1, 2, 5, 8, 9, 15, 16, 17, 18) and Elesa RC20: faint five-point stars, gold,
 *   cyan or white, sparse over the whole face (the art window and the text box).
 */
import { isBw, bwPattern } from "../bw-foil.js?v=8";

const has = (pattern, cls) => ` ${pattern || ""} `.includes(` ${cls} `);
const rcNumber = (card) => Number(/^bw11-RC(\d+)$/.exec(String(card?.id || ""))?.[1] || 0);

/** The commons and the Trainer: the star holo. Every other RC print is Confetti. */
const STARS = new Set([1, 2, 5, 8, 9, 15, 16, 17, 18, 20]);
/** The prints with a per-card map (the Pokemon cut out): the Confetti ones. */
const CARD_MAPS = new Set([3, 4, 6, 7, 10, 11, 12, 13, 14, 19, 21, 22, 23, 24, 25]);
/** Foil edge to edge: the regular-art EX and the full arts. */
const FULL = new Set([11, 21, 22, 23, 24, 25]);

const MAP = (n) => `assets/foil/fam/bw-radiant-collection/map-rc${n}.webp`;
const FINISH = (n) => `assets/foil/fam/bw-radiant-collection/rc-${STARS.has(n) ? "stars" : "chips"}.webp`;

/** Whether a card face is this family's. */
export function claims(card) {
  return Boolean(card) && !card.reverse && isBw(card) && has(bwPattern(card), "bw-rc") && rcNumber(card) > 0;
}

export function famExtras(card, url, base) {
  if (!claims(card)) return null;
  const n = rcNumber(card);
  const stars = STARS.has(n);
  const map = CARD_MAPS.has(n) ? MAP(n) : "assets/foil/maps/bw-rc-v1.webp";
  return {
    classes: `fam-bw-radiant-collection ${stars ? "rcf-stars" : "rcf-chips"}${FULL.has(n) ? " rcf-full" : ""}`,
    style: `--rcf-tex:url('${url(FINISH(n))}');--foil-map:url('${url(map)}')`,
    cure: true,
  };
}
