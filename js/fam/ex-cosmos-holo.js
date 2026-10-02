/**
 * Holo family ex-cosmos-holo: EX-era cosmos Rare Holo.
 *
 * Scope: every `ex-cosmos` print that is not a refractor: Rare Holo of ex1-ex16, the cosmos promos (np), Unown, cosmos secrets, the holo Energy of ex9, kit holos.
 *
 * Part of the older-era holo remaster (2026-10-01; js/holo-fam.js lists every family, first claim wins). This module
 * decides which card faces are this family's and returns what to add to the face foilExtras() built: the class
 * `fam-ex-cosmos-holo` (every rule in css/holo/fam/ex-cosmos-holo.css is scoped to it), any finer classes, the family's own
 * custom properties (per-card maps as `url('...')` through `url()`, which makes a repo path absolute) and `cure: true` to
 * get the extra `.cure` layer. `base` is foilExtras()'s own result ({ classes, style, cure }) for the same face, so a
 * family can read what the era module decided; a custom property set here comes after the era's in the style
 * attribute, so it wins (`--foil-map` included). `card` has been through foilLook(), so a promo's rarity is its foilAs.
 * Never import js/foil-maps.js from here (it waits on this module).
 *
 * What it adds: every claimed face has its own map, drawn from its own scan by
 * .claude/skills/card-textures/scripts/fam/ex-cosmos-holo/make_ex_cosmos_maps.py into
 * assets/foil/fam/ex-cosmos-holo/<card id>.webp: one alpha sprite of three panels, [foil area | cosmos dots A | dots B].
 * The area is the art window's foil (the background; the Pokémon, printed on white, is matte); the dots are the
 * cosmos shapes the scan already shows, so the light lands on the printed pattern. The sprite goes in as
 * `--foil-map-xc` (the lab's reset keeps `--foil-map*`), and `cure: true` adds the `.cure` layer that lights the dots.
 * A face with no map (a card added later) gets nothing from here and keeps the era's recipe.
 */
import { isEx, exPattern } from "../ex-foil.js?v=8";

const has = (pattern, cls) => ` ${pattern || ""} `.includes(` ${cls} `);

/** Every face with a map, by set: "<set>:<numbers>" (an id is `<set>-<number>`). */
const MAPPED = new Set(
  [
    "ex1:1 10 11 12 13 14 2 3 4 5 6 7 8 9 np012 np013 np020",
    "ex2:1 10 11 12 13 14 2 3 4 5 6 7 8 9",
    "ex3:1 10 100 11 12 2 3 4 5 6 7 8 9 98 99",
    "ex4:1 10 11 12 2 3 4 5 6 7 8 9 96 97 np034",
    "ex5:1 10 102 11 12 13 14 15 2 3 4 5 6 7 8 9",
    "ex6:1 10 11 113 12 13 14 15 16 17 2 3 4 5 6 7 8 9",
    "ex7:1 10 11 110 111 12 13 14 2 3 4 5 6 7 8 9",
    "ex8:1 10 11 12 13 14 15 2 3 4 5 6 7 8 9",
    "ex9:1 10 101 102 103 104 105 106 107 11 2 3 4 5 6 7 8 9",
    "ex10:1 10 11 12 13 14 15 16 17 18 19 2 3 4 5 6 7 8 9 A B C D E EXCL F G H I J K L M N O P Q QUES R S T U V W X Y Z",
    "ex11:114 np029 np030",
    "ex12:1 10 11 12 13 14 2 3 4 5 6 7 8 9 93",
    "ex13:111",
    "ex14:1 10 11 12 13 3 5 7 8 9",
    "ex16:1 10 11 12 13 2 3 4 5 6 7 8 9",
    "extk1a:4",
    "extk1b:2",
    "extk2a:6",
    "extk2b:6",
    "np:np005 np035 np040",
  ].flatMap((row) => {
    const [s, nums] = row.split(":");
    return nums.split(" ").map((n) => `${s}-${n}`);
  }),
);
/** A map redrawn after it shipped lives under a new name (assets are cached as immutable): id -> version. */
const VERSION = { "ex10-O": 2 };

/** Whether a card face is this family's. */
export function claims(card) {
  return Boolean(card) && !card.reverse && isEx(card) && has(exPattern(card), "ex-cosmos") && !has(exPattern(card), "ex-refractor");
}

export function famExtras(card, url, base) {
  if (!claims(card) || !MAPPED.has(card.id)) return null;
  const v = VERSION[card.id] ? `-v${VERSION[card.id]}` : "";
  return {
    classes: "fam-ex-cosmos-holo",
    style: `--foil-map-xc:url('${url(`assets/foil/fam/ex-cosmos-holo/${card.id}${v}.webp`)}')`,
    cure: true,
  };
}
