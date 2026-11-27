/**
 * Holo families: the older-era holo remaster of 2026-10-01 (XY back to Base Set). Every finish family (a Wizards of the
 * Coast set, Gold Star, LV.X, BREAK, the McDonald's promos, ...) has one module in js/fam/ and one sheet in
 * css/holo/fam/. A module exports `famExtras(card, url, base)`: null when the face is not the family's, else
 * { classes, style, cure } that foilExtras() in js/foil-maps.js adds to its own result. The first family in FAMILIES
 * that claims a face wins, so the cross-era and set-specific families come first.
 *
 * The modules load with Promise.allSettled, so a family that fails to load is skipped and the rest of the site still
 * draws (the era sheets then paint those cards as before). `?fam=off` in the page URL skips every family: the lab's
 * before and after. `?famskip=a,b` skips only the named families, so a remake can be judged against the look the
 * site draws today (the next family that claims the card, or the era).
 */
export const FAMILIES = [
  ["mcd-promos", 6],
  ["xy-evolutions", 3],
  ["xy-generations", 3],
  ["wotc-crystal", 3],
  ["wotc-shining", 3],
  ["wotc-base-set", 2],
  ["wotc-jungle", 2],
  ["wotc-fossil", 2],
  ["wotc-base-set-2", 2],
  ["wotc-team-rocket", 3],
  ["wotc-gym", 2],
  ["wotc-neo-genesis", 3],
  ["wotc-neo-discovery", 2],
  ["wotc-neo-revelation", 2],
  ["wotc-neo-destiny", 2],
  ["wotc-legendary-collection", 3],
  ["wotc-expedition", 3],
  ["wotc-aquapolis", 3],
  ["wotc-skyridge", 3],
  ["wotc-promos", 4],
  ["ex-gold-star", 7],
  ["ex-delta-holon", 4],
  ["ex-pokemon-ex", 4],
  ["ex-cosmos-holo", 6],
  ["ex-reverse", 4],
  ["dp-lvx", 3],
  ["dp-prime", 2],
  ["dp-legend", 2],
  ["dp-special-rares", 8],
  ["dp-sp", 4],
  ["dp-cosmos-holo", 5],
  ["dp-reverse", 4],
  ["bw-full-art", 6],
  ["bw-secret", 4],
  ["bw-ex-ace", 4],
  ["bw-radiant-collection", 3],
  ["bw-tinsel-holo", 3],
  ["bw-reverse", 4],
  ["xy-break", 2],
  ["xy-secret-silver", 2],
  ["xy-secret-gold", 1],
  ["xy-secret-shiny", 1],
  ["xy-full-art", 4],
  ["xy-ex-mega", 4],
  ["xy-sheen-holo", 6],
  ["xy-reverse", 2],
  ["me-ir", 2],
  ["sv-sir", 3],
  ["sv-ultra", 3],
  ["me55", 2],
  ["me-holo", 3],
  ["swsh-holo", 2],
  ["sm-holo", 2],
  ["me-sir", 2],
  ["swsh-fullart", 2],
  ["sv-reverse", 3],
  ["swsh-reverse", 2],
  ["swsh-gold", 2],
  ["sm-fullart", 2],
  ["sm-shiny", 2],
  ["sv-ir", 3],
  ["swsh-v", 2],
  ["swsh-vmax", 2],
  ["sv-double-rare", 3],
  ["sv-holo", 3],
  ["sm-gx", 2],
  ["sm-gold", 2],
  ["sv-tera", 3],
  ["swsh-rainbow", 2],
  ["swsh-gallery", 2],
  ["sv-gold", 3],
  ["sv-shiny", 3],
  ["sv-acespec", 3],
  ["sm-prism", 2],
  ["sm-rainbow", 2],
  ["sv-prismatic", 2],
  ["sv-promo", 3],
  ["swsh-sf-shiny", 2],
  ["swsh-special", 2],
];

const search = typeof location !== "undefined" ? location.search : "";
const off = /[?&]fam=off\b/.test(search);
const skip = new Set(decodeURIComponent(/[?&]famskip=([^&#]*)/.exec(search)?.[1] || "").split(",").filter(Boolean));
const active = off ? [] : FAMILIES.filter(([name]) => !skip.has(name));
const loaded = await Promise.allSettled(active.map(([name, v]) => import(`./fam/${name}.js?v=${v}`)));
const modules = [];
loaded.forEach((result, i) => {
  if (result.status === "fulfilled") modules.push(result.value);
  else console.warn(`holo family ${active[i][0]} did not load`, result.reason);
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
