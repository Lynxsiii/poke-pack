import { C, f, pt, arc, sector, donut, around, at, lin, rg, wedges, star, spark, poly, outline, gloss, doc } from "../lib/frame-art.mjs";

/** A flame pointing up from its base centre: w is half the base width, h the height, lean tilts the tip. */
function flame(w, h, lean = 0) {
  const t = lean * w;
  return `M${-w} 0C${f(-w * 1.15)} ${f(-h * 0.34)} ${f(-w * 0.2 + t * 0.4)} ${f(-h * 0.46)} ${f(-w * 0.08 + t * 0.7)} ${f(-h * 0.7)}C${f(t * 0.9)} ${f(-h * 0.86)} ${f(t)} ${f(-h * 0.94)} ${f(t * 1.1)} ${-h}C${f(w * 0.3 + t * 0.6)} ${f(-h * 0.72)} ${f(w * 1.25)} ${f(-h * 0.6)} ${f(w * 0.98)} ${f(-h * 0.2)}C${f(w * 0.92)} ${f(-h * 0.08)} ${f(w * 0.7)} 0 ${w} 0Z`;
}

// Fourteen tongues; the crown burns tall and the foot only smoulders. Each leans away from the top.
const TONGUES = Array.from({ length: 14 }, (_, i) => {
  const deg = (i * 360) / 14 + 4;
  const up = Math.cos((deg * Math.PI) / 180);
  return [deg, 9.5 + (i % 2) * 1.5, 15 + 6.5 * up + (i % 3) * 1.2, Math.sin((deg * Math.PI) / 180) * 0.45];
});

export const frames = [
  {
    id: "type-fire",
    name: "Fire",
    group: "Types",
    of: 0.2,
    c: ["#ff8a2b", "#c92a12"],
    fx: "drift",
    fxs: 3.4,
    base: ({ ra }) => {
      const r1 = ra - 1.5;
      const r2 = ra + 9.5;
      const tongues = TONGUES.map(([deg, w, h, lean]) => {
        const d = flame(w, h, lean);
        const core = flame(w * 0.55, h * 0.62, lean * 0.6);
        return at(r2 - 4, deg, `<path d="${d}" fill="url(#fo)" stroke="#6e1406" stroke-opacity=".55" stroke-width=".8" stroke-linejoin="round"/><path d="${flame(w * 0.78, h * 0.8, lean * 0.8)}" fill="url(#fm)"/><path d="${core}" fill="url(#fc)"/>`);
      }).join("");
      const defs =
        lin("fo", [[0, "#ff4a1c"], [1, "#a4150b"]], [0, -30, 0, 0]) +
        lin("fm", [[0, "#ffb02e"], [1, "#ff5a1f"]], [0, -26, 0, 0]) +
        lin("fc", [[0, "#fff4a8"], [1, "#ffc13a"]], [0, -18, 0, 0]) +
        rg("fb", [[0, "#ffd45c"], [0.55, "#ff8a1f"], [1, "#d1280f"]], [C, C, r2]);
      const band = `<path d="${donut(r1, r2)}" fill="url(#fb)"/>`;
      const cracks = around(11, (deg, i) => `<path d="${sector(r1 + 5.5, r2 - 0.8, deg, deg + 5 + (i % 3) * 2)}" fill="#7d1607" fill-opacity=".34"/>`, 7);
      return doc(
        tongues + outline(r2 + 0.3, 1.4, "#4d0d04", 0.7) + band + cracks + gloss(r2 - 3, 1.6, 290, 20, 0.5, "#fff1b0") + outline(r1 + 0.4, 1.4, "#4d0d04", 0.55),
        defs
      );
    },
    glow: ({ ra }) => {
      const r2 = ra + 9.5;
      const embers = [[-22, 96, 1.7], [-8, 101, 1.2], [12, 97, 1.9], [27, 94, 1.3], [-42, 90, 1.2], [47, 89, 1.5], [3, 108, 1.1]]
        .map(([deg, r, s]) => `<circle cx="${f(pt(r, deg)[0])}" cy="${f(pt(r, deg)[1])}" r="${s}" fill="#ffd25a"/>`)
        .join("");
      return doc(embers + `<circle cx="100" cy="100" r="${f(r2 - 1)}" fill="none" stroke="#ffe08a" stroke-opacity=".0" stroke-width="1"/>`);
    },
  },
];
