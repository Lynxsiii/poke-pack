/**
 * Holo family ex-reverse: EX-era reverse holos.
 *
 * Scope: every EX-era reverse holo print (the ex1-ex4 Mirror and the per-set art-box patterns of ex5-ex16).
 *
 * Part of the older-era holo remaster (2026-10-01; js/holo-fam.js lists every family, first claim wins). This module
 * decides which card faces are this family's and returns what to add to the face foilExtras() built: the class
 * `fam-ex-reverse` (every rule in css/holo/fam/ex-reverse.css is scoped to it), any finer classes, the family's own
 * custom properties (per-card maps as `url('...')` through `url()`, which makes a repo path absolute) and `cure: true` to
 * get the extra `.cure` layer. `base` is foilExtras()'s own result ({ classes, style, cure }) for the same face, so a
 * family can read what the era module decided; a custom property set here comes after the era's in the style
 * attribute, so it wins (`--foil-map` included). `card` has been through foilLook(), so a promo's rarity is its foilAs.
 * Never import js/foil-maps.js from here (it waits on this module).
 */
import { isEx, exPattern, exWindow } from "../ex-foil.js?v=8";

const setOf = (card) => String(card?.id || "").split("-")[0];

/**
 * Faces with a per-card foil-area map (assets/foil/fam/ex-reverse/<id>-v1.webp, alpha = the art window's background, the
 * Pokemon cut out, everything outside the window 0), for ex5-ex16. Generated from the asset folder (scripts/fam/ex-reverse/
 * list_maps.py); a card with no map is not claimed and keeps the era look.
 */
const MAPPED = new Set(
  [
    // BEGIN-MAPPED (list_maps.py)
    "ex5:1 3 5 6 10 16 17 18 19 21 22 23 24 28 29 30 31 33 34 35 37 40 41 44 45 46 48 49 50 52 53 54 55 57 58 59 60 61 62 63 64 65 66 67 68 69 70 71 72 73 74 75 76 79 80 81 82 84 85 86 87 88 89 90 92",
    "ex6:1 2 3 4 5 6 7 8 10 11 12 13 14 15 16 17 18 19 21 22 23 24 25 28 29 30 31 32 33 34 35 37 38 40 41 42 43 44 46 47 48 49 50 52 53 54 55 56 57 58 59 60 61 62 63 64 65 67 68 69 70 71 72 73 74 75 76 77 78 79 80 81 82 83 84 85 86 87 88 89 90 91 92 93 94 95 96 97 98 99 101 102 103",
    "ex7:1 3 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 26 27 28 30 31 33 35 36 37 38 39 40 41 42 43 44 45 46 47 48 49 50 51 52 57 58 59 61 62 63 64 65 66 67 68 69 70 71 72 73 74 75 78 80 81 82 84 87 89 90 94 95",
    "ex8:1 2 3 4 5 6 7 10 11 12 14 15 16 18 19 20 21 22 23 24 27 28 29 30 31 32 34 36 37 38 40 43 44 45 46 47 48 49 51 52 54 55 56 57 58 59 60 62 63 64 65 66 67 68 69 70 72 73 75 76 77 78 80 81 82 83 84 85 86 88 90 93 94 95",
    "ex9:1 2 4 5 6 7 8 9 10 11 12 13 14 15 16 17 19 20 21 22 23 24 25 26 27 28 30 32 34 35 38 39 40 41 42 43 44 45 46 47 48 50 52 53 55 56 57 58 59 60 61 62 63 64 65 66 68 69 70 72 73 74 76 78 79 80 81 82 83 84 86 87 88 89",
    "ex10:1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 28 30 31 33 35 36 38 39 41 42 43 44 47 48 49 50 51 53 54 55 56 57 58 59 60 61 63 64 66 69 70 72 73 74 75 76 77 78 79 81 82 83 84 85 86 87 88 89 90 91 92 93 94 95 96 97 98 99 100",
    "ex11:1 3 4 5 6 7 8 10 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 38 39 40 41 42 43 44 45 46 48 49 50 51 53 54 56 57 58 59 60 61 62 63 64 66 67 68 69 71 72 73 74 75 78 79 80 82 83 84 85 86 87 88 89 90 91 92 93 94 95 96 97 98 99 100 101 102 103 104 105 106 107",
    "ex12:1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 18 19 20 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 38 39 40 41 43 44 47 48 49 50 51 52 54 56 57 58 59 60 61 62 63 64 65 66 67 68 69 70 71 73 75 76 78 79 80 81 82",
    "ex13:1 2 3 4 7 8 9 11 12 13 14 15 17 18 19 20 21 22 23 24 25 28 30 31 32 33 34 35 36 38 39 40 41 42 43 44 45 48 49 50 51 53 54 55 56 57 59 61 62 63 64 65 67 68 69 71 72 73 74 75 76 77 78 79 80 81 82 83 84 85 86 87 88 89 90 91 92 93 94 95 96 97 98",
    "ex14:1 2 3 4 5 6 7 8 10 11 12 13 14 15 16 17 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 38 39 40 41 42 43 44 45 46 47 48 49 51 52 53 54 55 56 57 58 59 60 61 62 63 64 65 66 67 68 69 70 71 72 73 74 75 76 77 78 79 80 81 82 83 84 85 86 87 88",
    "ex15:1 2 4 5 8 9 10 11 12 13 16 17 18 19 20 21 22 26 27 29 31 34 35 36 37 38 41 42 43 44 45 46 47 48 50 51 52 53 54 55 56 57 58 59 62 63 64 65 66 67 68 69 70 71 72 73 74 75 76 77 78 79 80 81 82 83 84 85 86 87 88 89",
    "ex16:1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 26 27 28 29 30 31 32 33 34 35 36 37 38 39 40 41 42 43 44 45 46 47 48 49 50 51 52 53 54 55 56 57 58 59 61 62 63 64 65 66 67 69 70 71 72 73 74 75 76 77 78 79 80 81 82 83 84 85 86 87 88 89 90 91",
    // END-MAPPED
  ].flatMap((row) => {
    const [s, nums] = row.split(":");
    return nums.split(" ").map((n) => `${s}-${n}`);
  }),
);
/** A map redrawn after it shipped lives under a new name (assets are cached as immutable): id -> version. */
const VERSION = {
  // BEGIN-VERSION
  // END-VERSION
};

/** The patterned sets (ex5-ex10): the printed pattern is the foil; ex11-ex16 are plain rainbow, ex12 cosmos sparkle. */
const isPatterned = (card) => /^ex([5-9]|10)$/.test(setOf(card));

/** The ex1-ex4 Mirror: the whole card but the art window. */
const isMirror = (card) => /^ex[1-4]$/.test(setOf(card));

/**
 * Delta Species exception (the E4 zomus table): the foil sits ON the Pokemon, the background is matte, for the Holo Rare delta
 * cards of ex11 and ex13 and every delta card of ex14 and ex15.
 */
const isDeltaOnPokemon = (card) => {
  if (!String(card?.name || "").includes("\u03b4")) return false;
  const s = setOf(card);
  if (s === "ex14" || s === "ex15") return true;
  return (s === "ex11" || s === "ex13") && card.rarity === "Rare Holo";
};

/** Whether a card face is this family's: an ex1-ex4 reverse, or an ex5-ex16 reverse that has its map. */
export function claims(card) {
  if (!card || !card.reverse || !isEx(card)) return false;
  if (isMirror(card)) return true;
  return MAPPED.has(card.id);
}

export function famExtras(card, url, base) {
  if (!claims(card)) return null;
  if (isMirror(card)) return { classes: "fam-ex-reverse", style: "", cure: false };
  const delta = isDeltaOnPokemon(card) ? " xr-delta" : "";
  return {
    classes: `fam-ex-reverse xr-mapped${isPatterned(card) ? " xr-pat" : ""}${delta}`,
    style: `--xr-map:url('${url(`assets/foil/fam/ex-reverse/${card.id}-v${VERSION[card.id] || 1}.webp`)}')`,
    cure: false,
  };
}
