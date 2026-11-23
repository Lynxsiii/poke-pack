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
 *   Victini, N). Smooth silver foil over the whole face; under the light, several narrow, crisp, saturated vertical
 *   spectral stripes cross the Pokémon, background, frame and text box alike, and the background has a fine sand grain.
 *   Live's two-level map for them (white: Pokémon, frame, lettering; black: background; the Genies' turned the right
 *   way round and completed, fix_genie_sil.py, etch/<id>-v3.webp) cuts the sand to the background: `--bwfa-flank`
 *   (make_lit.py) is that background. `--bwfa-frame` (make_frame.py) is the silver frame and name bar, which throw the
 *   strongest rainbow.
 * - `bwfa-pebble`: Landorus BW43 (Forces of Nature Collection, 2012), a hammered pebble grain edge to edge, Pokémon
 *   included, with the flat faces' narrow stripes and frame rainbow (`--bwfa-etch`: drawn hammered dimples,
 *   assets/foil/fam/bw-full-art/bw4-bwp043-etch-v9.webp, make_promo_etch.py; it takes `bwfa-promo` too, so a resting
 *   card is the plain print).
 * Each also gets the `.cure` layer, which carries the rainbow (hard-light: it colours white ink as the real foil does
 * through it, which a screen or colour dodge cannot), and `--bwfa-ink`, the scan's light ink (make_ink_light.py,
 * assets/foil/fam/bw-full-art/inklight-v1/<id>.webp), which cuts that colour off black ink: the real foil only shows
 * through light ink (Zekrom 114's black body stays black under the stripes, Dialga-EX's navy chest under the band).
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

/** Fetch and decode a face's maps as it mounts, so its first lit frame has them (the ink map and the flanks are only
 * used by the held layers, which do not exist at rest). Browser only; the census runs this module in Node. */
const decoded = new Set();
function preload(src) {
  if (typeof Image === "undefined" || decoded.has(src)) return;
  decoded.add(src);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = src;
    if (img.decode) img.decode().catch(() => {});
  } catch {
    /* a preload is only a hint */
  }
}
const map = (url, path) => {
  const src = url(path);
  preload(src);
  return `url('${src}')`;
};

/** Where a face's texture catches the light and the colour it takes there (make_lit.py): `--bwfa-flank` (flank-v1, the
 * engraved ridges' lit flanks, or the flat faces' background under the sand) is the lit layer's mask, `--bwfa-tone`
 * (tone-v1, a small copy of the scan, squared for the engraved faces) its colour, so no lit layer draws the card art:
 * WebKit left the art out of the lit lines in a probe's lower rows (a large background image decoded off screen). */
const tex = (url, id) => `--bwfa-flank:${map(url, `${DIR}/flank-v1/${id}.webp`)};--bwfa-tone:${map(url, `${DIR}/tone-v1/${id}.webp`)}`;

/** The line-etched faces' own maps: the texture above and the printed gold outline, lit as glitter (make_gold_outline.py). */
const lit = (url, id) => `;${tex(url, id)};--bwfa-gold:${map(url, `${DIR}/gold-v1/${id}.webp`)}`;

/** Whether a card face is this family's. */
export function claims(card) {
  return Boolean(card) && !card.reverse && isBw(card) && has(bwPattern(card), "bw-fa");
}

export function famExtras(card, url, base) {
  if (!claims(card)) return null;
  const id = String(card.id || "");
  const known = LIVE.has(id) || Boolean(DRAWN[id]);
  const ink = known ? `--bwfa-ink:${map(url, `${DIR}/inklight-v1/${id}.webp`)}` : "";
  if (LIVE.has(id)) {
    if (/^bw[123]-/.test(id)) {
      // The background under the sand (make_lit.py from Live's silhouette, the Genies' turned the right way round) and
      // the scan's colour, and the silver frame and name bar (make_frame.py) for the frame's rainbow.
      const flat = `${tex(url, id)};--bwfa-frame:${map(url, `${DIR}/frame-v1/${id}.webp`)}`;
      return { classes: "fam-bw-full-art bwfa-sand", style: `${flat};${ink}`, cure: true };
    }
    return { classes: "fam-bw-full-art bwfa-lines", style: `--bwfa-etch:${map(url, `${DIR}/etch-v2/${id}.webp`)};${ink}${lit(url, id)}`, cure: true };
  }
  if (DRAWN[id]) {
    const [cls, path] = DRAWN[id];
    // Landorus BW43 shares the flat faces' stripes and frame rainbow (make_frame.py draws its frame too).
    const lines = cls.includes("bwfa-lines") ? lit(url, id) : `;--bwfa-frame:${map(url, `${DIR}/frame-v1/${id}.webp`)}`;
    return { classes: `fam-bw-full-art ${cls}`, style: `--bwfa-etch:${map(url, `${DIR}/${path}`)};${ink}${lines}`, cure: true };
  }
  // A full art this table does not know yet: the era's recipe (the class alone matches no rule of the sheet).
  return { classes: "fam-bw-full-art", style: "", cure: false };
}
