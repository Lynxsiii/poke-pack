/**
 * Holo family wotc-gym: Gym Heroes and Gym Challenge (gym1, gym2) holos.
 *
 * Scope: gym1 and gym2 Rare Holo (the 39 faces).
 *
 * Part of the older-era holo remaster (js/holo-fam.js lists every family, first claim wins). This module
 * decides which card faces are this family's and returns what to add to the face foilExtras() built: the class
 * `fam-wotc-gym` (every rule in css/holo/fam/wotc-gym.css is scoped to it), any finer classes, the family's own
 * custom properties (per-card maps as `url('...')` through `url()`, which makes a repo path absolute) and `cure: true` to
 * get the extra `.cure` layer. `base` is foilExtras()'s own result ({ classes, style, cure }) for the same face, so a
 * family can read what the era module decided; a custom property set here comes after the era's in the style
 * attribute, so it wins (`--foil-map` included). `card` has been through foilLook(), so a promo's rarity is its foilAs.
 * Never import js/foil-maps.js from here (it waits on this module).
 *
 * The maps (assets/foil/fam/wotc-gym/, drawn by .claude/skills/card-textures/scripts/fam/wotc-gym/make_gym_masks.py from each
 * card's own scan): `<set>-<n>-bg` is where the foil shows (the art window's background, less the evolution badge and the
 * figure), `<set>-<n>-dots` the scan's own dots and stars; `glitter-a` / `glitter-b` are Jungle's halves (same foil). A face
 * with maps gets `gym-mapped`; the sheet draws nothing new without it.
 */
import { isWotc, wotcPattern } from "../wotc-foil.js?v=6";

const set = (card) => String(card?.id || "").split("-")[0];
const has = (pattern, cls) => ` ${pattern || ""} `.includes(` ${cls} `);
const DIR = "assets/foil/fam/wotc-gym";
const V = 1;
/** Mapped faces: every Pokémon and Trainer holo of both sets (the maps are all drawn). */
const MAPPED = {
  gym1: new Set([...Array.from({ length: 19 }, (_, i) => String(i + 1))]),
  gym2: new Set([...Array.from({ length: 20 }, (_, i) => String(i + 1))]),
};
/** Trainers (a wide short art window): gym1 15-19, gym2 17-20. */
const TRAINERS = { gym1: new Set(["15", "16", "17", "18", "19"]), gym2: new Set(["17", "18", "19", "20"]) };

/** Whether a card face is this family's. */
export function claims(card) {
  return Boolean(card) && !card.reverse && isWotc(card) && /^gym[12]$/.test(set(card)) && has(wotcPattern(card), "wotc-cosmos");
}

export function famExtras(card, url, base) {
  if (!claims(card)) return null;
  const s = set(card);
  const n = String(card.id).split("-")[1];
  if (!MAPPED[s]?.has(n)) return { classes: "fam-wotc-gym", style: "", cure: false };
  const style = [
    `--gym-bg:url('${url(`${DIR}/${s}-${n}-bg-v${V}.webp`)}')`,
    `--gym-dots:url('${url(`${DIR}/${s}-${n}-dots-v${V}.webp`)}')`,
    `--gym-glitter-a:url('${url(`${DIR}/glitter-a-v${V}.webp`)}')`,
    `--gym-glitter-b:url('${url(`${DIR}/glitter-b-v${V}.webp`)}')`,
  ].join(";");
  return { classes: `fam-wotc-gym gym-mapped ${TRAINERS[s]?.has(n) ? "gym-trainer" : "gym-pokemon"}`, style, cure: false };
}
