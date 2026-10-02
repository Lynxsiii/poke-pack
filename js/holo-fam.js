/**
 * Holo families: the older-era holo remaster of 2026-10-01 (XY back to Base Set). Every finish family (a Wizards of the
 * Coast set, Gold Star, LV.X, BREAK, the McDonald's promos, ...) has one module in js/fam/ and one sheet in
 * css/holo/fam/. A module exports `famExtras(card, url, base)`: null when the face is not the family's, else
 * { classes, style, cure } that foilExtras() in js/foil-maps.js adds to its own result. The first family in FAMILIES
 * that claims a face wins, so the cross-era and set-specific families come first.
 *
 * The modules load with Promise.allSettled, so a family that fails to load is skipped and the rest of the site still
 * draws (the era sheets then paint those cards as before). `?fam=off` in the page URL skips every family: the lab's
 * before and after.
 */
export const FAMILIES = [
  ["mcd-promos", 4],
  ["xy-evolutions", 3],
  ["xy-generations", 2],
  ["wotc-crystal", 3],
  ["wotc-shining", 2],
  ["wotc-base-set", 2],
  ["wotc-jungle", 2],
  ["wotc-fossil", 2],
  ["wotc-base-set-2", 2],
  ["wotc-team-rocket", 2],
  ["wotc-gym", 2],
  ["wotc-neo-genesis", 2],
  ["wotc-neo-discovery", 2],
  ["wotc-neo-revelation", 2],
  ["wotc-neo-destiny", 2],
  ["wotc-legendary-collection", 3],
  ["wotc-expedition", 2],
  ["wotc-aquapolis", 3],
  ["wotc-skyridge", 3],
  ["wotc-promos", 4],
  ["ex-gold-star", 3],
  ["ex-delta-holon", 3],
  ["ex-pokemon-ex", 2],
  ["ex-cosmos-holo", 4],
  ["ex-reverse", 2],
  ["dp-lvx", 3],
  ["dp-prime", 2],
  ["dp-legend", 2],
  ["dp-special-rares", 6],
  ["dp-sp", 4],
  ["dp-cosmos-holo", 5],
  ["dp-reverse", 4],
  ["bw-full-art", 5],
  ["bw-secret", 2],
  ["bw-ex-ace", 3],
  ["bw-radiant-collection", 2],
  ["bw-tinsel-holo", 2],
  ["bw-reverse", 1],
  ["xy-break", 2],
  ["xy-full-art", 3],
  ["xy-ex-mega", 3],
  ["xy-sheen-holo", 3],
  ["xy-reverse", 2],
];

const off = typeof location !== "undefined" && /[?&]fam=off\b/.test(location.search);
const loaded = off ? [] : await Promise.allSettled(FAMILIES.map(([name, v]) => import(`./fam/${name}.js?v=${v}`)));
const modules = [];
loaded.forEach((result, i) => {
  if (result.status === "fulfilled") modules.push(result.value);
  else console.warn(`holo family ${FAMILIES[i][0]} did not load`, result.reason);
});

/** The first family's additions for a card face, or null. A family that throws is skipped for that face. */
export function famExtras(card, url, base) {
  for (const family of modules) {
    let extra = null;
    try {
      extra = family.famExtras?.(card, url, base) || null;
    } catch (error) {
      console.warn("holo family failed on", card?.id, error);
    }
    if (extra) return extra;
  }
  return null;
}
