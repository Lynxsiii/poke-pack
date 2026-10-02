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
  ["mcd-promos", 1],
  ["xy-evolutions", 1],
  ["xy-generations", 1],
  ["wotc-crystal", 2],
  ["wotc-shining", 1],
  ["wotc-base-set", 2],
  ["wotc-jungle", 2],
  ["wotc-fossil", 2],
  ["wotc-base-set-2", 1],
  ["wotc-team-rocket", 2],
  ["wotc-gym", 2],
  ["wotc-neo-genesis", 1],
  ["wotc-neo-discovery", 2],
  ["wotc-neo-revelation", 1],
  ["wotc-neo-destiny", 2],
  ["wotc-legendary-collection", 1],
  ["wotc-expedition", 1],
  ["wotc-aquapolis", 1],
  ["wotc-skyridge", 1],
  ["wotc-promos", 1],
  ["ex-gold-star", 1],
  ["ex-delta-holon", 1],
  ["ex-pokemon-ex", 1],
  ["ex-cosmos-holo", 1],
  ["ex-reverse", 1],
  ["dp-lvx", 1],
  ["dp-prime", 1],
  ["dp-legend", 1],
  ["dp-special-rares", 1],
  ["dp-sp", 1],
  ["dp-cosmos-holo", 1],
  ["dp-reverse", 1],
  ["bw-full-art", 2],
  ["bw-secret", 1],
  ["bw-ex-ace", 1],
  ["bw-radiant-collection", 1],
  ["bw-tinsel-holo", 1],
  ["bw-reverse", 1],
  ["xy-break", 1],
  ["xy-full-art", 1],
  ["xy-ex-mega", 1],
  ["xy-sheen-holo", 1],
  ["xy-reverse", 1],
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
