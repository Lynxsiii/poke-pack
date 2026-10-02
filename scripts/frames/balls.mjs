import { C, f, pt, arc, sector, donut, around, at, lin, rg, wedges, star, spark, poly, outline, gloss, doc } from "../lib/frame-art.mjs";

/**
 * The shape every ball shares: a ring that is cap-coloured on top and white below,
 * a black equator broken by the button on the right. `top` and `bottom` are gradient
 * stop lists; `button` draws the push button; `extra` adds decoration.
 */
function ball({ top, bottom, band = "#17171e", button = "#f5f5f7", extra = () => "", defsExtra = "" }) {
  return ({ ra }) => {
    const r1 = ra - 1.5;
    const r2 = ra + 12;
    const rm = (r1 + r2) / 2;
    const defs =
      lin("bt", top, [40, 20, 150, 120]) +
      lin("bb", bottom, [40, 100, 150, 200]) +
      lin("bk", [[0, "#3a3a46"], [1, "#0d0d12"]], [60, 80, 140, 120]) +
      defsExtra;
    const body =
      `<path d="${sector(r1, r2, 277, 453)}" fill="url(#bt)"/>` + // top, 277 to 93 over the top
      `<path d="${sector(r1, r2, 93, 277)}" fill="url(#bb)"/>` +
      `<path d="${sector(r1, r2, 83, 97)}" fill="url(#bk)"/><path d="${sector(r1, r2, 263, 277)}" fill="url(#bk)"/>` +
      extra({ r1, r2, rm }) +
      `<path d="${arc(r1 + 0.7, 93, 263)}" fill="none" stroke="#14141a" stroke-opacity=".28" stroke-width="1.4"/>` +
      gloss(r2 - 3.2, 2.2, 292, 8, 0.6) +
      outline(r2 + 0.4, 1.5) + outline(r1 + 0.3, 1.2, "#07060c", 0.5);
    const btn = at(rm, 90, `<g transform="rotate(-90)"><circle r="11.6" fill="#0e0e14"/><circle r="9.2" fill="${button}"/><circle r="6.2" fill="#fff" fill-opacity=".9" stroke="#14141a" stroke-opacity=".45" stroke-width="1"/><circle r="3.2" fill="${button}" stroke="#14141a" stroke-opacity=".25" stroke-width=".8"/><path d="M-7.4 -3.4A8.2 8.2 0 0 1 -2 -7.9" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width="1.4" stroke-linecap="round"/></g>`);
    return doc(body + btn, defs);
  };
}

export const frames = [
  {
    id: "ball-poke",
    name: "Poké Ball",
    group: "Poké Balls",
    of: 0.14,
    c: ["#ee1c25", "#f4f4f6"],
    base: ball({
      top: [[0, "#ff6b5f"], [0.5, "#e8222a"], [1, "#a90f1a"]],
      bottom: [[0, "#ffffff"], [1, "#b9bdc8"]],
    }),
  },
];
