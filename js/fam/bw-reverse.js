/**
 * Holo family bw-reverse: Black & White reverse holos.
 *
 * Scope: the reverse holos of bw1-bw11 (1,072 prints). Dragons Exalted (bw6): 99 of its 112 prints. TCG Live's files for bw6-1 to 49 are
 * duplicated and misnumbered, so each mask there was matched to the print by IMAGE (.claude/skills/card-textures/scripts/fam/bw-reverse/make_masks_bw6.py,
 * bw6_matches.json); the 13 it is not sure of (bw6-2 3 5 6 10 18 19 21 33 34 47 48 49) stay on the era's look.
 *
 * What the real card does: the foil covers the card except the art window, the type and weakness symbols, the evolution notch and
 * the printed names TCG Live cuts out; the ink of the body text is printed over the foil and stays black (bw1 a plain mirror, the
 * rest the shaded Energy-symbol pattern; Plasma sets a shield). The era's reverse recipe (css/holo/bw.css, `.bw-rev`) draws that with
 * three generic layout masks; this family swaps in each print's OWN mask, cut from TCG Live's foil map and from the print's own scan
 * (assets/foil/fam/bw-reverse/<set>/<number>.webp, .claude/skills/card-textures/scripts/fam/bw-reverse/make_masks.py): TCG Live leaves the
 * body text under the foil and an overlay sheen tints dark or grey letters, so the mask also cuts the ink out of the foil (review #2).
 * The sheen (css/holo/fam/bw-reverse.css) is an overlay-blended spectrum band over the type's pattern, so a light body takes the colour
 * and the ink stays dark; Darkness Pokémon (near-black body) get `bwr-dark`, a stronger sheen, so a lit text box is never darker than the
 * era look. The era's type tiles of colorless, dragon, fighting, grass, plasma and psychic carry black cost-symbol discs (one per source print), which the
 * overlay turns into dull dots on prints without a symbol there: this family passes its own tiles without them (`pattern-<kind>.webp`, make_patterns.py).
 * bw1's plain mirror (no pattern on the real card) draws a mottled-mirror map instead
 * (`--bw-mottle`, assets/foil/fam/bw-reverse/mirror-mottle.webp, make_mirror_mottle.py).
 *
 * Part of the older-era holo remaster (2026-10-01; js/holo-fam.js lists every family, first claim wins). This module
 * decides which card faces are this family's and returns what to add to the face foilExtras() built: the class
 * `fam-bw-reverse` (every rule in css/holo/fam/bw-reverse.css is scoped to it), any finer classes, the family's own
 * custom properties (per-card maps as `url('...')` through `url()`, which makes a repo path absolute) and `cure: true` to
 * get the extra `.cure` layer. `base` is foilExtras()'s own result ({ classes, style, cure }) for the same face, so a
 * family can read what the era module decided; a custom property set here comes after the era's in the style
 * attribute, so it wins (`--foil-map` included). `card` has been through foilLook(), so a promo's rarity is its foilAs.
 * Never import js/foil-maps.js from here (it waits on this module).
 */
import { isBw } from "../bw-foil.js?v=8";

/* Prints with a mask file, per set: card numbers. */
const MASKS = {
  bw1: "1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 38 39 40 41 42 43 44 45 46 47 48 49 50 51 52 53 54 55 56 57 58 59 60 61 62 63 64 65 66 67 68 69 70 71 72 73 74 75 76 77 78 79 80 81 82 83 84 85 86 87 88 89 90 91 92 93 94 95 96 97 98 99 100 101 102 103 104",
  bw2: "1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 38 39 40 41 42 43 44 45 46 47 48 49 50 51 52 53 54 55 56 57 58 59 60 61 62 63 64 65 66 67 68 69 70 71 72 73 74 75 76 77 78 79 80 81 82 83 84 85 86 87 88 89 90 91 92 93 94 95 96",
  bw3: "1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 38 39 40 41 42 43 44 45 46 47 48 49 50 51 52 53 54 55 56 57 58 59 60 61 62 63 64 65 66 67 68 69 70 71 72 73 74 75 76 77 78 79 80 81 82 83 84 85 86 87 88 89 90 91 92 93 94 95 96",
  bw4: "1 2 3 4 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 39 40 41 42 43 44 45 46 47 48 49 50 52 53 55 56 57 58 59 60 61 62 63 64 65 66 67 68 69 70 71 72 73 74 75 76 77 78 79 80 81 83 84 85 86 87 88 89 90 91 92 93",
  bw5: "1 2 3 4 5 6 7 8 9 10 11 12 14 15 16 17 18 19 20 21 22 23 24 25 27 28 29 30 31 32 33 34 35 36 37 39 40 41 42 43 44 45 46 47 48 49 50 51 52 53 55 56 57 58 59 60 61 62 64 65 66 67 68 69 70 71 72 73 74 75 76 77 78 79 80 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99 100 101 102",
  bw6: "1 4 7 8 9 11 12 13 14 15 16 17 20 23 24 25 26 27 28 29 30 31 32 35 36 37 38 39 40 41 42 43 44 45 50 51 52 53 54 55 56 57 58 59 60 61 62 63 64 65 66 67 68 69 70 72 73 74 75 76 77 78 79 80 82 83 84 86 87 88 89 90 91 93 94 95 96 97 98 99 100 101 102 103 104 105 106 107 108 109 110 111 112 113 114 115 116 117 118",
  bw7: "1 2 3 4 5 6 7 8 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 38 39 40 41 42 43 44 45 46 47 48 50 51 52 53 54 55 56 57 58 59 60 61 62 63 64 65 66 68 69 70 71 72 73 74 75 76 77 78 79 80 81 82 83 84 85 86 87 88 90 91 92 93 94 95 96 97 98 99 100 102 104 105 106 107 108 109 110 111 112 113 114 115 116 117 118 119 120 121 122 123 124 125 126 127 128 129 130 131 132 133 134 135 136",
  bw8: "1 2 3 4 5 6 7 8 9 10 11 12 13 15 16 17 19 20 21 22 23 24 26 27 28 29 30 31 32 33 34 35 36 37 38 39 40 41 42 43 44 45 46 47 49 50 51 52 53 54 55 56 57 58 59 60 61 62 63 64 65 66 67 68 69 70 71 72 73 74 75 76 77 78 79 80 81 82 83 84 85 86 87 88 89 90 91 92 94 97 98 99 100 101 102 103 104 105 106 107 109 110 111 112 113 114 115 116 117 118 119 120 121 122 123 124 125 126 127",
  bw9: "1 2 3 4 5 6 7 8 9 10 11 12 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 39 40 41 42 43 44 45 46 47 48 49 50 51 52 54 55 56 57 58 59 60 61 62 63 64 65 66 67 68 69 70 71 72 73 74 75 76 77 78 79 80 81 82 83 84 87 88 89 90 91 92 93 94 95 96 97 99 100 101 102 103 104 105 106",
  bw10: "1 2 3 4 5 6 7 8 10 12 13 14 15 17 18 19 20 21 22 23 24 25 26 27 28 29 31 32 34 35 36 38 39 40 42 43 44 45 47 48 50 51 52 53 55 57 58 59 61 62 63 67 68 70 71 72 73 75 76 77 78 79 80 81 82 83 84 85 86 87 88 89 90 91",
  bw11: "1 2 3 4 5 6 7 9 10 11 13 14 17 18 20 21 25 26 30 31 33 34 35 36 37 38 40 41 42 47 48 49 55 56 57 58 59 60 61 62 63 64 65 67 69 70 71 73 74 75 76 79 81 83 86 87 89 92 94 95 97 98 103 104 106 107 109 110 111 112 113",
};
/* Type tiles with their cost-symbol discs inpainted (assets/foil/fam/bw-reverse/pattern-<kind>.webp, make_patterns.py): the era's own tile of these kinds
   carries black discs where the source print's attack-cost symbols were, and a print without a symbol on that spot showed a dull dot (review #3). */
const PATTERNS = new Set(["colorless", "dragon", "fighting", "grass", "plasma", "psychic"]);
const HAVE = new Map(Object.entries(MASKS).map(([s, n]) => [s, new Set(n.split(" "))]));

/* Only plain set prints (`bw4-1`): the promo, Cracked Ice and cosmos variants carry longer ids and are not in this pool. */
const split = (card) => String(card?.id || "").match(/^(bw\d+)-(\d+)$/)?.slice(1) || [];

/** Whether a card face is this family's: a reverse holo of bw1-bw11 that has its own mask file. */
export function claims(card) {
  if (!card || !card.reverse || !isBw(card)) return false;
  const [s, n] = split(card);
  return Boolean(HAVE.get(s)?.has(n));
}

export function famExtras(card, url, base) {
  if (!claims(card)) return null;
  const [s, n] = split(card);
  // `--bw-layout` is the alpha mask the era's reverse rule intersects with the art mask: the print's own.
  let style = `--bw-layout:url('${url(`assets/foil/fam/bw-reverse/${s}/${n}.webp`)}')`;
  // bw1's reverse is the plain mirror: its mottled mirror map (a card-sized picture drawn once, never tiled).
  if (s === "bw1") style += `;--bw-mottle:url('${url("assets/foil/fam/bw-reverse/mirror-mottle.webp")}')`;
  // The era's tile (`--rev-pattern`, from the `bw-rev-<kind>` class it chose) minus its black discs: the family's property comes later in the style, so it wins.
  const kind = /(?:^|\s)bw-rev-([a-z-]+)(?:\s|$)/.exec(base?.classes || "")?.[1];
  if (PATTERNS.has(kind)) style += `;--rev-pattern:url('${url(`assets/foil/fam/bw-reverse/pattern-${kind}.webp`)}')`;
  // Darkness (body luminance about 0.12 to 0.15) and Dragon (0.40) Pokémon have a dark body: `bwr-dark` raises the sheen so a lit text box is never darker than the era look.
  const dark = card.supertype !== "Trainer" && card.supertype !== "Energy" && (card.types?.[0] === "Darkness" || card.types?.[0] === "Dragon");
  return { classes: dark ? "fam-bw-reverse bwr-dark" : "fam-bw-reverse", style, cure: false };
}
