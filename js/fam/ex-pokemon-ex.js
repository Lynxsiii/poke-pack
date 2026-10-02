/**
 * Holo family ex-pokemon-ex: Pokémon-ex (EX era).
 *
 * Scope: every `ex-ex` print that is not a refractor: Pokémon-ex, secret ex, promo ex, the cracked-ice ex of ex5 and ex6.
 *
 * Part of the older-era holo remaster (2026-10-01; js/holo-fam.js lists every family, first claim wins). This module
 * decides which card faces are this family's and returns what to add to the face foilExtras() built: the class
 * `fam-ex-pokemon-ex` (every rule in css/holo/fam/ex-pokemon-ex.css is scoped to it), any finer classes, the family's own
 * custom properties (per-card maps as `url('...')` through `url()`, which makes a repo path absolute) and `cure: true` to
 * get the extra `.cure` layer. `base` is foilExtras()'s own result ({ classes, style, cure }) for the same face, so a
 * family can read what the era module decided; a custom property set here comes after the era's in the style
 * attribute, so it wins (`--foil-map` included). `card` has been through foilLook(), so a promo's rarity is its foilAs.
 * Never import js/foil-maps.js from here (it waits on this module).
 *
 * What it adds: every claimed face has its own map, drawn from its own scan by
 * .claude/skills/card-textures/scripts/fam/ex-pokemon-ex/make_ex_pokemon_ex_maps.py into
 * assets/foil/fam/ex-pokemon-ex/<card id>.webp (RGBA, registered to the scan). Alpha is where the real card is foil:
 * the outer silver border (the e-Reader foot of ex1-ex4 included) and the art window, the Pokémon too (its ink is printed
 * over the foil); the name bar, body, text box and evolution ring are matte. RGB is the pattern the scan caught, each
 * cosmos dot (or each cracked-ice shard, on the six ice faces) one random hue, on black. The map goes in as
 * `--foil-map-xp`; `cure: true` adds the `.cure` layer that lights the dots and shards. A face with no map (a card added
 * later) gets nothing from here and keeps the era's recipe.
 */
import { isEx, exPattern } from "../ex-foil.js?v=8";

const has = (pattern, cls) => ` ${pattern || ""} `.includes(` ${cls} `);

/** Every face with a map, by set: "<set>:<numbers>" (an id is `<set>-<number>`). */
const MAPPED = new Set(
  [
    "np:np001 np002",
    "ex1:100 101 102 103 96 97 98 99",
    "ex2:100 94 95 96 97 98 99",
    "ex3:89 90 91 92 93 94 95 96 97",
    "ex4:89 90 91 92 93 94 95",
    "ex5:100 101 93 94 95 96 97 98 99",
    "ex6:104 105 106 107 108 109 110 111 112 114 115 116",
    "ex7:100 101 102 103 104 105 106 96 97 98 99",
    "ex8:100 101 102 103 104 108 96 97 98 99",
    "ex9:100 90 91 92 93 94 95 96 97 98 99 np037 np038 np039",
    "ex10:101 102 103 104 105 106 107 108 109 110 111 112 116 117",
    "ex11:108 109 110 np031 np032 np033",
    "ex12:83 84 85 86 87 88 89",
    "ex13:100 101 99",
    "ex14:89 90 91 92 93 94 95 97 98",
    "ex16:92 93 94 95 96 97 98 99",
  ].flatMap((row) => {
    const [s, nums] = row.split(":");
    return nums.split(" ").map((n) => `${s}-${n}`);
  }),
);
/** The maps' version: a map redrawn after it shipped lives under a new name (assets are cached as immutable). */
const V = 1;

/** Whether a card face is this family's. */
export function claims(card) {
  return Boolean(card) && !card.reverse && isEx(card) && has(exPattern(card), "ex-ex") && !has(exPattern(card), "ex-refractor");
}

export function famExtras(card, url, base) {
  if (!claims(card) || !MAPPED.has(card.id)) return null;
  const ice = has(exPattern(card), "ex-cracked-ice");
  return {
    classes: ice ? "fam-ex-pokemon-ex fam-ex-pokemon-ex-ice" : "fam-ex-pokemon-ex",
    style: `--foil-map-xp:url('${url(`assets/foil/fam/ex-pokemon-ex/${card.id}-v${V}.webp`)}')`,
    cure: true,
  };
}
