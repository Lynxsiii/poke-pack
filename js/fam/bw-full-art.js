/**
 * Holo family bw-full-art: Black & White full arts.
 *
 * Scope: every `bw-fa` print: full-art Pokémon-EX and Pokémon (bw1-bw3 too) and full-art Supporters.
 *
 * Part of the older-era holo remaster (2026-10-01; js/holo-fam.js lists every family, first claim wins). This module
 * decides which card faces are this family's and returns what to add to the face foilExtras() built: the class
 * `fam-bw-full-art` (every rule in css/holo/fam/bw-full-art.css is scoped to it), any finer classes, the family's own
 * custom properties (per-card maps as `url('...')` through `url()`, which makes a repo path absolute) and `cure: true` to
 * get the extra `.cure` layer. `base` is foilExtras()'s own result ({ classes, style, cure }) for the same face, so a
 * family can read what the era module decided; a custom property set here comes after the era's in the style
 * attribute, so it wins (`--foil-map` included). `card` has been through foilLook(), so a promo's rarity is its foilAs.
 * Never import js/foil-maps.js from here (it waits on this module).
 *
 * What the real cards do (photos and sources: /mnt/project-files/holo-remaster/bw-full-art/refs/SOURCES.md,
 * .claude/skills/card-textures/reference/fam-bw-full-art.md) and the class each face gets:
 * - `bwfa-lines`: Next Destinies (bw4) to Plasma Blast (bw10); also the Team Plasma box's Darkrai BW73 and Giratina BW74 (bw9-bwp073/074, no stamps), with a drawn line etch.
 *   Engraved edge to edge with fine lines that follow the drawing; each ridge catches the light, so the texture
 *   shows at rest and flashes in streaks of rainbow that sweep across as the card tilts, the art keeping its colours.
 *   `--bwfa-etch` is TCG Live's etch at its native 733 px with the checkerboard cells it degenerates into in flat
 *   or dark areas redrawn as fine lines (assets/foil/fam/bw-full-art/etch-v2/, make_lines_v2.py); Live has none for
 *   the two promos, whose etch is drawn from the scan (assets/foil/fam/bw-full-art/<id>-etch-v1.webp, make_promo_etch.py).
 * - `bwfa-sand`: Black & White to Noble Victories (bw1-bw3: Reshiram, Zekrom, the Genies, the Swords of Justice,
 *   Victini, N). Smooth to the touch, but the background is a stippled sand foil that sparkles, the Pokémon and
 *   the frame a smooth mirror under the bands. `--bwfa-sil` is Live's two-level map for them (white: Pokémon, frame,
 *   lettering; black: background), the sand is cut to its black part.
 * - `bwfa-pebble`: Landorus BW43 (Forces of Nature Collection, 2012), a hammered pebble grain edge to edge, Pokémon
 *   included, with the same bands (`--bwfa-etch`: drawn hammered dimples, assets/foil/fam/bw-full-art/bw4-bwp043-etch-v9.webp, make_promo_etch.py; it takes
 *   `bwfa-promo` too, so a resting card is the plain print).
 * Each also gets the `.cure` layer, which carries the smooth rainbow bands (hard-light: they colour white ink as the
 * real foil does through it, which a screen or colour dodge cannot).
 */
import { isBw, bwPattern } from "../bw-foil.js?v=8";

const has = (pattern, cls) => ` ${pattern || ""} `.includes(` ${cls} `);
const DIR = "assets/foil/fam/bw-full-art";

// TCG Live's etch for every numbered Rare Ultra of bw1..bw10: bw1-bw3 as silhouettes (etch/, ship_live_etch.py), bw4-bw10 as engravings (etch-v2/).
const LIVE = new Set([
  "bw1-113", "bw1-114", "bw2-97", "bw2-98", "bw3-97", "bw3-98", "bw3-99", "bw3-100", "bw3-101",
  "bw4-94", "bw4-95", "bw4-96", "bw4-97", "bw4-98", "bw4-99",
  "bw5-103", "bw5-104", "bw5-105", "bw5-106", "bw5-107", "bw5-108",
  "bw6-119", "bw6-120", "bw6-121", "bw6-122", "bw6-123", "bw6-124",
  "bw7-141", "bw7-142", "bw7-143", "bw7-144", "bw7-145", "bw7-146", "bw7-147", "bw7-148", "bw7-149",
  "bw8-131", "bw8-132", "bw8-133", "bw8-134", "bw8-135",
  "bw9-109", "bw9-110", "bw9-111", "bw9-112", "bw9-113", "bw9-114", "bw9-115", "bw9-116",
  "bw10-96", "bw10-97", "bw10-98", "bw10-99", "bw10-100", "bw10-101",
]);
// Faces Live has no etch for (Darkrai BW73, Giratina BW74: engraved lines; Landorus BW43: hammered dimples): their maps are
// drawn by make_promo_etch.py.
const DRAWN = {
  "bw4-bwp043": ["bwfa-pebble bwfa-promo", "bw4-bwp043-etch-v9.webp"],
  "bw9-bwp073": ["bwfa-lines bwfa-promo", "bw9-bwp073-etch-v1.webp"],
  "bw9-bwp074": ["bwfa-lines bwfa-promo", "bw9-bwp074-etch-v1.webp"],
};

/** Whether a card face is this family's. */
export function claims(card) {
  return Boolean(card) && !card.reverse && isBw(card) && has(bwPattern(card), "bw-fa");
}

export function famExtras(card, url, base) {
  if (!claims(card)) return null;
  const id = String(card.id || "");
  if (LIVE.has(id)) {
    if (/^bw[123]-/.test(id)) return { classes: "fam-bw-full-art bwfa-sand", style: `--bwfa-sil:url('${url(`${DIR}/etch/${id}.webp`)}')`, cure: true };
    return { classes: "fam-bw-full-art bwfa-lines", style: `--bwfa-etch:url('${url(`${DIR}/etch-v2/${id}.webp`)}')`, cure: true };
  }
  if (DRAWN[id]) {
    const [cls, path] = DRAWN[id];
    return { classes: `fam-bw-full-art ${cls}`, style: `--bwfa-etch:url('${url(`${DIR}/${path}`)}')`, cure: true };
  }
  // A full art this table does not know yet: the era's recipe (the class alone matches no rule of the sheet).
  return { classes: "fam-bw-full-art", style: "", cure: false };
}
