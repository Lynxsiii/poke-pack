/**
 * Holo family bw-reverse: Black & White reverse holos.
 *
 * Scope: the reverse holos of bw1-bw11 (1,072 prints). Dragons Exalted (bw6): 99 of its 112 prints. TCG Live's files for bw6-1 to 49 are
 * duplicated and misnumbered, so each mask there was matched to the print by IMAGE (.claude/skills/card-textures/scripts/fam/bw-reverse/make_masks_bw6.py,
 * bw6_matches.json); the 13 it is not sure of (bw6-2 3 5 6 10 18 19 21 33 34 47 48 49) stay on the era's look.
 *
 * What the real card does (2026-10-22 audits, photos in /home/user/holo-refs/bw-rev-a and bw-rev-b): the foil covers the card except the art
 * window, the type and weakness symbols, the evolution notch and the printed names; the ink is printed over the foil and never takes its colour.
 * The body KEEPS its printed type colour (purple stays purple, dark stays dark): the Energy-symbol pattern shows as lighter and darker shades of
 * it, its strokes (white in TCG Live's map) darker away from the light (bw1: a plain mottled mirror); a lamp throws a white hot spot tinted by
 * the ink and at most one narrow rainbow streak; silver bodies take a soft pastel rainbow.
 * The era's reverse recipe (css/holo/bw.css, `.bw-rev`) masks with three generic layouts; this family swaps in each print's OWN mask
 * (`--bw-layout`: assets/foil/fam/bw-reverse/<set>/<number>-v3.webp, make_masks.py + make_masks_v3.py: TCG Live's map with the print's ink cut
 * out from its own scan) and its own sheen (css/holo/fam/bw-reverse.css): `--bwr-shade` (multiplied at the type's share `--bwr-k`) and
 * `--bwr-flash` (lit by the pointer pool), drawn from the era's type tile with the source print's discs and lines inpainted (make_shades.py);
 * bw1 uses the mottled-mirror map for both (make_mirror_mottle.py). Classes: `bwr-dark` (Darkness Pokemon: the pattern is lifted, not
 * darkened), `bwr-silver` (Colorless and Metal Pokemon, Trainers, Energy: a `color`-blended pastel rainbow on the `.cure` layer when lit), `bwr-dragon`
 * (Dragon Pokemon: the glare takes the mask before the white letters were cut, `--bwr-glare-layout`).
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
/* The shade's share per body type (see famExtras): about 120 / the type's 95th-percentile body luminance; Darkness lifts instead (css, `bwr-dark`).
   Round 3: Psychic and Grass (and Water, Fighting, Lightning a little) raised, with the tint below. */
const TONE = { Darkness: 1, Dragon: 0.73, Fire: 0.64, Psychic: 0.7, Fighting: 0.62, Grass: 0.8, Water: 0.7, Lightning: 0.6, Energy: 0.52, Colorless: 0.49, Metal: 0.49, Trainer: 0.8 };
/* The colour the shade layer is multiplied by (`--bwr-tint`): ink over foil reads as the ink twice (deeper AND more saturated), which a grey shade cannot give.
   Measured on the text box (scan -> photo, HSV): Drifblim / Drifloon / Munna S 0.19 -> 0.23-0.34, V 0.80 -> 0.62-0.65; Cradily / Virizion S 0.51-0.58 -> 0.83-0.89,
   V 0.83 -> 0.71; Wartortle S 0.38 -> 0.65, V 0.95 -> 0.74; Excadrill V 0.91 -> 0.55; Dragons V 0.43 -> 0.21-0.33. The tint is white mixed with the type's median
   body colour (scans of every third claimed print; p10-p90 spread under 20 levels per channel, so one colour per type stands for the print): Psychic (185 147 192)
   and Grass (172 205 76) whole, Water (136 204 240) at 0.8, Fighting (229 163 87) and Lightning (253 224 91) at 0.6, Fire (236 119 69) and Dragon (109 105 57)
   at 0.5. With the share 0.7-0.8 the body lands near the photos (renders: Drifblim S 0.30, Surskit S 0.76, Wartortle S 0.50). Silver and Darkness bodies take none (white). */
const TINT = { Psychic: "#b993c0", Grass: "#accd4c", Water: "#a0d6f3", Fighting: "#efc89a", Lightning: "#feec9d", Fire: "#f6bba2", Dragon: "#b6b49c" };
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
  // `-v3` (make_masks_v3.py, 2026-10-22): the ink of the name bar, the HP and the bottom lines cut out too; the text zone's grain holes (a dark grain spot taken
  // for ink: Fighting's copper, Metal, Water, every Dragon) filled, checked against the full-size scan; the Dragon prints' white text cut without a rim.
  let style = `--bw-layout:url('${url(`assets/foil/fam/bw-reverse/${s}/${n}-v3.webp`)}')`;
  // The sheen's two maps (css/holo/fam/bw-reverse.css): `--bwr-shade` is multiplied onto the body at every pose (white = untouched, the pattern's strokes
  // darker), `--bwr-flash` is what the pointer pool lights (make_shades.py). bw1's reverse is the plain mirror: its mottled mirror map (card-sized, drawn once) is both.
  const kind = /(?:^|\s)bw-rev-([a-z-]+)(?:\s|$)/.exec(base?.classes || "")?.[1];
  if (s === "bw1" || !kind || kind === "plain") {
    const mottle = url("assets/foil/fam/bw-reverse/mirror-mottle.webp");
    style += `;--bwr-shade:url('${mottle}');--bwr-flash:url('${mottle}')`;
  } else {
    style += `;--bwr-shade:url('${url(`assets/foil/fam/bw-reverse/shade-${kind}.webp`)}');--bwr-flash:url('${url(`assets/foil/fam/bw-reverse/flash-${kind}.webp`)}')`;
  }
  // How much of the shade map a print takes (`--bwr-k`, the `.foil` opacity): the map (shade = B - K x relief, make_shades.py) deepens the body by 1 - B and its
  // strokes by K more, and a light body would lose more levels than a dark one; the share is set per type so k x the body's lighter parts is about 120 levels
  // (the type's 95th-percentile text-box luminance, measured on the scans: Dragon 165, Fire 187, Psychic / Fighting / Grass 210, Water 223, Lightning 231,
  // Colorless 242, Metal / Trainer 248): a coloured body about 15 levels deeper, its strokes about 45 below it.
  const tone = card.supertype === "Trainer" ? "Trainer" : card.supertype === "Energy" ? "Energy" : card.types?.[0];
  style += `;--bwr-k:${TONE[tone] ?? 0.55};--bwr-tint:${TINT[tone] ?? "#fff"}`;
  const classes = ["fam-bw-reverse"];
  // Darkness Pokemon (body luminance 0.12-0.15, white text): a multiply cannot darken near-black, so their pattern is LIFTED a little instead (`bwr-dark`).
  const pokemon = card.supertype !== "Trainer" && card.supertype !== "Energy";
  if (pokemon && card.types?.[0] === "Darkness") classes.push("bwr-dark");
  // Silver bodies (Colorless and Metal Pokemon, Trainers, Energy) show a soft pastel rainbow over the silver when lit (Braviary bw2-88): `bwr-silver`.
  // It rides the `.cure` layer (a `color` blend: the hue moves, the luminosity stays, so it never darkens a stroke or the ink).
  // Dragon Pokemon (white text on olive): the glare takes the mask before the white letters were cut (`<n>-v3g.webp`, make_masks_v3.py), since a screen leaves
  // white ink white and a cut letter's soft edge stayed half-lit inside the hot spot (a dark rim round every letter, review of 2026-10-22).
  if (pokemon && card.types?.[0] === "Dragon") {
    classes.push("bwr-dragon");
    style += `;--bwr-glare-layout:url('${url(`assets/foil/fam/bw-reverse/${s}/${n}-v3g.webp`)}')`;
  }
  const silver = !pokemon || card.types?.[0] === "Colorless" || card.types?.[0] === "Metal";
  if (silver) classes.push("bwr-silver");
  return { classes: classes.join(" "), style, cure: silver };
}
