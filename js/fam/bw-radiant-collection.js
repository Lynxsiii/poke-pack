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
 * The two finishes of the Collection (photos: /home/user/holo-refs/bw-rc/SOURCES.md, the 2026-10-22 audit; the family note:
 * .claude/skills/card-textures/reference/fam-bw-radiant-collection.md):
 * - rcf-chips, the Confetti holofoil: the uncommons (RC3, 4, 6, 7, 10, 12, 13, 14, 19), the regular-art Meloetta-EX RC11 and the
 *   full arts RC21-RC25. Packed round foil sequins (about 2% of the card wide, edge to edge) over the WHOLE face: border, name
 *   bar, window with the Pokemon, text box (photos of RC7, RC11, RC22, RC25). At rest a pale disc texture; lit, single chips flash
 *   one saturated colour. At rest `.foil` draws the pale disc mosaic (rc-chips-rest-v4); held, `.glare` carries the same mosaic and
 *   `.foil` the flashes. Mew-EX RC24 keeps a soft reduction on Mew (map-rc24-v3). The regular-art uncommons also carry a dark
 *   motif pattern in the text box and name bar (rcf-motif, drawn on `.cure`: make_rc_motifs.py).
 * - rcf-stars, the star holo: the commons (RC1, 2, 5, 8, 9, 15, 16, 17, 18) and Elesa RC20 (rcf-trainer): small five-point
 *   stars over the whole face, sparse (10-15 lit at once), each one colour (gold, pink-orange, cyan, lime, white).
 */
import { isBw, bwPattern } from "../bw-foil.js?v=8";

const has = (pattern, cls) => ` ${pattern || ""} `.includes(` ${cls} `);
const rcNumber = (card) => Number(/^bw11-RC(\d+)$/.exec(String(card?.id || ""))?.[1] || 0);

/** The commons and the Trainer: the star holo. Every other RC print is Confetti. */
const STARS = new Set([1, 2, 5, 8, 9, 15, 16, 17, 18, 20]);
/** The regular-art uncommons whose text box and name bar carry a motif pattern the scans lack (make_rc_motifs.py; Purrloin RC13's
 *  is printed in its scan). */
const MOTIFS = new Set([3, 4, 6, 7, 10, 12, 14, 19]);
/** Motifs redrawn as clean shapes (v3: RC4, 7, 12, 14 from photos and scans of the real cards, RC6, RC10 and RC19 from the earlier
 *  registered difference maps); RC3 keeps v2. Gardevoir RC10's lace is drawn light (`rcf-motif-light`): on its dark purple
 *  box the bare foil reads silvery in the real scan. */
const MOTIF_V3 = new Set([4, 6, 7, 10, 12, 14, 19]);
/** Round 4: Piplup RC6's bubbles redrawn soft and light (the JP Shiny Collection 006/020 scan), Cinccino RC19's stripes without the
 *  ragged cut-outs. */
const MOTIF_V4 = new Set([6, 19]);
/** Foil edge to edge on a black or silver border: the regular-art EX and the full arts. */
const FULL = new Set([11, 21, 22, 23, 24, 25]);

const DIR = "assets/foil/fam/bw-radiant-collection";
const ZONE = (n) => (n === 24 ? `${DIR}/map-rc24-v3.webp` : "assets/foil/maps/full.webp");
/** The facets (the background) and their coverage (the mask) are two files: WebKit dropped the whole layer at times while one
 *  URL was both (make_rc_textures.py). */
const FINISH = (n, mask) => `${DIR}/rc-${STARS.has(n) ? "stars" : "chips"}${mask ? "-mask" : ""}-${STARS.has(n) ? "v3" : "v4"}.webp`;

/** Whether a card face is this family's. */
export function claims(card) {
  return Boolean(card) && !card.reverse && isBw(card) && has(bwPattern(card), "bw-rc") && rcNumber(card) > 0;
}

export function famExtras(card, url, base) {
  if (!claims(card)) return null;
  const n = rcNumber(card);
  const stars = STARS.has(n);
  const motif = MOTIFS.has(n);
  const classes = ["fam-bw-radiant-collection", stars ? "rcf-stars" : "rcf-chips"];
  if (FULL.has(n)) classes.push("rcf-full");
  if (n === 20) classes.push("rcf-trainer");
  if (motif) classes.push("rcf-motif");
  if (n === 10) classes.push("rcf-motif-light");
  let style = `--rcf-tex:url('${url(FINISH(n))}');--rcf-mask:url('${url(FINISH(n, true))}');--foil-map:url('${url(ZONE(n))}')`;
  if (!stars) style += `;--rcf-rest:url('${url(`${DIR}/rc-chips-rest-v4.webp`)}')`;
  if (motif) style += `;--rcf-motif:url('${url(`${DIR}/motif-rc${n}-v${MOTIF_V4.has(n) ? 4 : MOTIF_V3.has(n) ? 3 : 2}.webp`)}')`;
  return { classes: classes.join(" "), style, cure: motif };
}
