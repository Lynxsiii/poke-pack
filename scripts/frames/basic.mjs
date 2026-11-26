import { pt, arc, donut, sector, around, at, lin, rg, poly, doc, f } from "../lib/frame-art.mjs";

/* Basic frames: metals, enamel, shapes and light. No characters and no card art,
   one idea per ring. Light comes from the top left everywhere. Helpers are local. */

const INK = "#07060c";
const hx = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const mix = (a, b, t) => "#" + hx(a).map((v, i) => Math.round(v + (hx(b)[i] - v) * t).toString(16).padStart(2, "0")).join("");
const ring = (r, w, stroke, o = 1, extra = "") => `<circle cx="100" cy="100" r="${f(r)}" fill="none" stroke="${stroke}"${o < 1 ? ` stroke-opacity="${o}"` : ""} stroke-width="${f(w)}"${extra}/>`;
const fill = (d, c, o = 1, extra = "") => `<path d="${d}" fill="${c}"${o < 1 ? ` fill-opacity="${o}"` : ""}${extra}/>`;
const keys = (r1, r2) => ring(r2 + 0.5, 1.2, INK, 0.6) + ring(r1 - 0.3, 1.2, INK, 0.55);

/** n marks round a circle as one dashed stroke. duty = share of each step that is drawn; `deg` turns the first mark's centre to that angle. */
function dash(r, w, stroke, n, duty = 0.5, o = 1, deg = 0) {
  const step = (2 * Math.PI * r) / n;
  const turn = deg - 90 - (duty * 360) / n / 2;
  return ring(r, w, stroke, o, ` stroke-dasharray="${f(step * duty)} ${f(step * (1 - duty))}" transform="rotate(${f(turn)} 100 100)"`);
}

/** A band whose colour runs round the circle: stops [[deg, colour], ...] from 0 to 360. Returns { defs, body }. */
function conic(id, r1, r2, stops) {
  const pts = [];
  for (let i = 0; i < stops.length - 1; i++) {
    const [a0, c0] = stops[i], [a1, c1] = stops[i + 1];
    const n = Math.ceil((a1 - a0) / 40);
    for (let k = 0; k < n; k++) pts.push([a0 + ((a1 - a0) * k) / n, mix(c0, c1, k / n)]);
  }
  pts.push(stops[stops.length - 1]);
  const rm = (r1 + r2) / 2;
  let defs = "", body = "";
  for (let i = 0; i < pts.length - 1; i++) {
    const [a0, c0] = pts[i], [a1, c1] = pts[i + 1];
    const [x1, y1] = pt(rm, a0), [x2, y2] = pt(rm, a1);
    defs += lin(`${id}${i}`, [[0, c0], [1, c1]], [f(x1), f(y1), f(x2), f(y2)]);
    body += fill(sector(r1, r2, a0, a1 + 0.5), `url(#${id}${i})`);
  }
  return { defs, body };
}

const PAL = {
  graphite: ["#15161b", "#3b3e49", "#9ba0b0"],
  steel: ["#48505d", "#98a2b1", "#f3f6fa"],
  copper: ["#5a2713", "#b9643a", "#ffcfa8"],
  silver: ["#707888", "#c6ccd8", "#ffffff"],
  gold: ["#7a5210", "#d9a534", "#fff3b8"],
  rose: ["#7c3f3a", "#d98d83", "#ffe4dc"],
  onyx: ["#050507", "#1c1c23", "#77778a"],
  platinum: ["#7d8794", "#d5dbe4", "#ffffff"],
  navy: ["#0a1230", "#1f3a8a", "#6d93ee"],
  iron: ["#0c0b0d", "#2a2729", "#6b6466"],
};
const metalStops = ([lo, mid, hi]) => [[0, mix(mid, hi, 0.35)], [40, lo], [100, mid], [135, mix(mid, hi, 0.7)], [165, mid], [220, lo], [280, mid], [315, hi], [345, mix(mid, hi, 0.5)], [360, mix(mid, hi, 0.35)]];

/** A turned-metal band with a lit outer lip and a shaded inner one. */
function metal(id, r1, r2, pal, lip = 1.5) {
  const [lo, mid, hi] = pal;
  const c = conic(id, r1, r2, metalStops(pal));
  const defs = c.defs + lin(`${id}a`, [[0, hi], [0.5, mid], [1, lo]], [30, 30, 170, 170]) + lin(`${id}b`, [[0, lo], [0.5, mid], [1, hi]], [30, 30, 170, 170]);
  const body = c.body + (lip ? ring(r2 - lip / 2, lip, `url(#${id}a)`) + ring(r1 + lip / 2, lip, `url(#${id}b)`, 0.8) : "") + keys(r1, r2);
  return { defs, body };
}
const groove = (r) => ring(r, 1.1, INK, 0.55) + ring(r + 0.95, 0.7, "#fff", 0.35);

/** Flat enamel between two metal rims. */
function enamel(r1, r2, colour, pal, rim = 2.4) {
  const a = metal("a", r2 - rim, r2, pal, 0), b = metal("b", r1, r1 + rim, pal, 0);
  const rm = (r1 + r2) / 2;
  const defs = a.defs + b.defs + lin("sh", [[0, "#fff", 0.22], [0.45, "#fff", 0], [0.6, INK, 0], [1, INK, 0.3]], [30, 30, 170, 170]);
  const body = fill(donut(r1 + rim - 0.3, r2 - rim + 0.3), colour) + fill(donut(r1 + rim - 0.3, r2 - rim + 0.3), "url(#sh)") +
    `<path d="${arc(rm + 1.2, 292, 348)}" fill="none" stroke="#fff" stroke-opacity=".38" stroke-width="1.3" stroke-linecap="round"/>` + a.body + b.body;
  return { defs, body };
}
/** A circle sub-path wound the other way: add it to a shape drawn with fill-rule evenodd to cut the avatar hole. */
const hole = (r) => { const d = donut(r, 99); return d.slice(d.indexOf("Z") + 1); };
const put = (...parts) => doc(parts.map((p) => (typeof p === "string" ? p : p.body)).join(""), parts.map((p) => (typeof p === "string" ? "" : p.defs)).join(""));
/** A soft ring of light: peak at r, gone by r - g and r + g. */
const glowDef = (id, r, g, colour, peak = 0.9, [cx, cy] = [100, 100]) => rg(id, [[f(Math.max(0, r - g) / 100), colour, 0], [f(r / 100), colour, peak], [f(Math.min(100, r + g) / 100), colour, 0]], [cx, cy, 100]);
const bead = (id, hi, mid, lo) => `<radialGradient id="${id}" cx=".36" cy=".34" r=".7"><stop offset="0" stop-color="${hi}"/><stop offset=".45" stop-color="${mid}"/><stop offset="1" stop-color="${lo}"/></radialGradient>`;
const dots = (r, n, size, paint, start = 0) => around(n, (deg) => { const [x, y] = pt(r, deg); return `<circle cx="${f(x)}" cy="${f(y)}" r="${size}" fill="${paint}"/>`; }, start);

const plainMetal = (id, name, pal, of, w, extra = () => "") => ({
  id, name, group: "Metal", of, c: [pal[1], pal[2]],
  base: (h) => { const r0 = h.ra - 1.5; return put(metal("m", r0, r0 + w, pal), extra(r0)); },
});
const plainEnamel = (id, name, colour, pal) => ({
  id, name, group: "Enamel", of: 0.15, c: [colour, pal[1]],
  base: (h) => { const r0 = h.ra - 1.5; return put(enamel(r0, r0 + 12.5, colour, pal)); },
});

export const frames = [
  /* ---- Metal ------------------------------------------------------------- */
  plainMetal("m-graphite", "Graphite", PAL.graphite, 0.12, 8),
  plainMetal("m-steel", "Steel", PAL.steel, 0.14, 10.5, (r0) => groove(r0 + 5)),
  {
    id: "m-copper", name: "Copper", group: "Metal", of: 0.15, c: [PAL.copper[1], PAL.copper[2]],
    base: (h) => { const r0 = h.ra - 1.5; return put(fill(donut(r0 + 7, r0 + 11), "#1a0c07"), metal("m", r0, r0 + 8, PAL.copper), metal("n", r0 + 10.3, r0 + 13, PAL.copper, 0)); },
  },
  {
    id: "m-silver", name: "Silver", group: "Metal", of: 0.15, c: [PAL.silver[1], PAL.silver[2]],
    base: (h) => { const r0 = h.ra - 1.5; return put(ring(r0 + 1.4, 3.2, "#2a2e38"), dash(r0 + 1.4, 2.2, "#eef1f6", 84, 0.55), metal("m", r0 + 3, r0 + 12, PAL.silver)); },
  },
  plainMetal("m-gold", "Gold", PAL.gold, 0.15, 12, (r0) => groove(r0 + 6)),
  {
    id: "m-rose", name: "Rose Gold", group: "Metal", of: 0.14, c: [PAL.rose[1], PAL.rose[2]],
    base: (h) => { const r0 = h.ra - 1.5; return put(metal("m", r0, r0 + 3.4, PAL.rose, 0), metal("n", r0 + 7, r0 + 10.4, PAL.rose, 0)); },
  },
  {
    id: "m-onyx", name: "Onyx", group: "Metal", of: 0.15, c: ["#1c1c23", "#d9a534"],
    base: (h) => { const r0 = h.ra - 1.5; return put(metal("m", r0, r0 + 11.5, PAL.onyx), { defs: lin("g", [[0, "#fff3b8"], [0.5, "#d9a534"], [1, "#8a6016"]], [30, 30, 170, 170]), body: ring(r0 + 5.75, 1.1, "url(#g)") }); },
  },
  {
    id: "m-platinum", name: "Platinum", group: "Metal", of: 0.16, c: [PAL.platinum[1], "#ffffff"], fx: "spin", fxs: 11,
    base: (h) => { const r0 = h.ra - 1.5; return put(ring(r0 + 12, 3.6, "#59616e"), dash(r0 + 12, 3.6, "#f4f7fa", 96, 0.5), ring(r0 + 14.1, 1, INK, 0.6), metal("m", r0, r0 + 10.2, PAL.platinum)); },
    glow: (h) => {
      const r0 = h.ra - 1.5, rm = r0 + 5;
      const g = (id, a, peak) => { const [x1, y1] = pt(rm, a - 20), [x2, y2] = pt(rm, a + 20); return { defs: lin(id, [[0, "#fff", 0], [0.5, "#fff", peak], [1, "#fff", 0]], [f(x1), f(y1), f(x2), f(y2)]), body: fill(sector(r0 + 0.8, r0 + 9.4, a - 20, a + 20), `url(#${id})`) }; };
      return put(g("s", 0, 0.8), g("t", 180, 0.4));
    },
  },

  /* ---- Enamel ------------------------------------------------------------ */
  plainEnamel("e-crimson", "Crimson", "#c22a35", PAL.gold),
  plainEnamel("e-cobalt", "Cobalt", "#2452c8", PAL.silver),
  plainEnamel("e-jade", "Jade", "#1f9a72", PAL.gold),
  plainEnamel("e-amethyst", "Amethyst", "#7a45c9", PAL.silver),
  plainEnamel("e-ivory", "Ivory", "#efe6d2", PAL.gold),
  plainEnamel("e-ink", "Ink", "#14141a", PAL.silver),

  /* ---- Shape ------------------------------------------------------------- */
  {
    id: "s-bezel", name: "Bezel", group: "Shape", of: 0.17, c: ["#14151a", "#c6ccd8"],
    base: (h) => {
      const r0 = h.ra - 1.5;
      return put(fill(donut(r0 + 1.6, r0 + 14), "#0e0f14"), dash(r0 + 10.8, 3, "#8b92a0", 60, 0.14), dash(r0 + 9.6, 5.4, "#f3f5f8", 12, 0.045),
        at(r0 + 9.2, 0, `<path d="M-3.6 -3.4L3.6 -3.4L0 3.6Z" fill="#e5392f"/>`), metal("a", r0 + 13.6, r0 + 16, PAL.steel, 0), metal("b", r0, r0 + 2.2, PAL.steel, 0));
    },
  },
  {
    id: "s-segments", name: "Segments", group: "Shape", of: 0.15, c: ["#98a2b1", "#f2a93b"],
    base: (h) => {
      const r0 = h.ra - 1.5, rm = r0 + 6;
      return put({ defs: lin("g", [[0, "#f3f6fa"], [0.5, "#98a2b1"], [1, "#4b5360"]], [30, 30, 170, 170]), body: around(12, (deg) => `<path d="${arc(rm, deg + 1.4, deg + 28.6)}" fill="none" stroke="${INK}" stroke-opacity=".6" stroke-width="11.6"/>`) + around(12, (deg, i) => `<path d="${arc(rm, deg + 2.1, deg + 27.9)}" fill="none" stroke="${i === 1 ? "#f2a93b" : "url(#g)"}" stroke-width="10"/>`) });
    },
  },
  {
    id: "s-dashes", name: "Dashes", group: "Shape", of: 0.16, c: ["#e9ecf2", "#6f7786"], fx: "spin", fxs: 50,
    base: (h) => { const r0 = h.ra - 1.5; return put(ring(r0 + 1.6, 4.4, INK, 0.6), ring(r0 + 1.6, 2.8, "#e9ecf2")); },
    glow: (h) => { const r0 = h.ra - 1.5; return put(dash(r0 + 9.5, 2.4, "#e9ecf2", 28, 0.6, 0.85)); },
  },
  {
    id: "s-orbit", name: "Orbit", group: "Shape", of: 0.2, c: ["#c6ccd8", "#59c2ff"], fx: "spin", fxs: 9, fx2: "spin", fxs2: 16,
    base: (h) => { const r0 = h.ra - 1.5; return put({ defs: lin("g", [[0, "#ffffff"], [0.5, "#aab2c0"], [1, "#59606e"]], [30, 30, 170, 170]), body: ring(r0 + 1.4, 4.2, INK, 0.6) + ring(r0 + 1.4, 2.8, "url(#g)") + ring(r0 + 9.5, 0.6, "#fff", 0.28) + ring(r0 + 17, 0.6, "#fff", 0.18) }); },
    glow: (h) => { const [x, y] = pt(h.ra + 8, 0); return doc(`<circle cx="${f(x)}" cy="${f(y)}" r="5.4" fill="url(#b)" stroke="${INK}" stroke-opacity=".5" stroke-width=".8"/>`, bead("b", "#ffffff", "#59c2ff", "#1b5fae")); },
    glow2: (h) => { const [x, y] = pt(h.ra + 15.5, 200); return doc(`<circle cx="${f(x)}" cy="${f(y)}" r="3.6" fill="url(#b)" stroke="${INK}" stroke-opacity=".5" stroke-width=".7"/>`, bead("b", "#ffffff", "#ffc65c", "#b06a12")); },
  },
  {
    id: "s-hexagon", name: "Hexagon", group: "Shape", of: 0.2, c: ["#262b3a", "#3fd0e6"],
    base: (h) => {
      const r0 = h.ra - 1.5;
      const hex = (R) => poly(Array.from({ length: 6 }, (_, i) => pt(R, i * 60)));
      return put({ defs: lin("g", [[0, "#3c4358"], [1, "#181b26"]], [30, 20, 170, 180]), body: `<path d="${hex(95)}${hole(r0)}" fill="url(#g)" fill-rule="evenodd" stroke="${INK}" stroke-opacity=".7" stroke-width="1.4" stroke-linejoin="round"/>` + `<path d="${hex(88.5)}" fill="none" stroke="#3fd0e6" stroke-width="1.3" stroke-linejoin="round"/>` + `<path d="${hex(94)}" fill="none" stroke="#fff" stroke-opacity=".16" stroke-width=".8" stroke-linejoin="round"/>` }, metal("m", r0, r0 + 2.6, PAL.steel, 0));
    },
  },
  {
    id: "s-facet", name: "Facet", group: "Shape", of: 0.16, c: ["#4f8fe0", "#e6f4ff"],
    base: (h) => {
      const r0 = h.ra - 1.5, rm = r0 + 6.5, r2 = r0 + 13;
      const tone = (deg, bias) => { const t = Math.min(1, Math.max(0, 0.5 + 0.42 * Math.cos(((deg - 315) * Math.PI) / 180) + bias)); return t < 0.5 ? mix("#173a78", "#4f8fe0", t * 2) : mix("#4f8fe0", "#eaf6ff", (t - 0.5) * 2); };
      const row = (a, b, n, start, flip) => around(n, (deg, i) => fill(sector(a, b, deg, deg + 360 / n + 0.3), tone(deg + 180 / n, (i % 2 ? 0.11 : -0.11) * flip)), start);
      return put(row(r0, rm, 16, 0, 1) + row(rm, r2, 16, 11.25, -1) + ring(rm, 0.5, "#fff", 0.45) + ring(r2 - 0.5, 0.8, "#fff", 0.3) + keys(r0, r2));
    },
  },
  {
    id: "s-seal", name: "Seal", group: "Shape", of: 0.17, c: ["#d9a534", "#fff3b8"],
    base: (h) => {
      const r0 = h.ra - 1.5, R = r0 + 14.5, n = 28;
      const s = f(R * Math.sin(Math.PI / n) * 1.02);
      const edge = `M${pt(R, 0).map(f).join(" ")}` + around(n, (deg) => `A${s} ${s} 0 0 1 ${pt(R, deg + 360 / n).map(f).join(" ")}`) + "Z";
      return put({ defs: lin("g", [[0, "#fff0ad"], [0.45, "#dba938"], [1, "#8a5d12"]], [30, 30, 170, 170]), body: `<path d="${edge}${hole(r0 + 2)}" fill="url(#g)" fill-rule="evenodd" stroke="${INK}" stroke-opacity=".6" stroke-width="1.2" stroke-linejoin="round"/>` + ring(R - 3.2, 0.9, "#7a5210", 0.75) + ring(R - 4.2, 0.6, "#fff6c8", 0.6) }, metal("m", r0, r0 + 3.4, PAL.gold, 0));
    },
  },
  {
    id: "s-viewfinder", name: "Viewfinder", group: "Shape", of: 0.2, c: ["#f1f3f7", "#8b92a0"],
    base: (h) => {
      const r0 = h.ra - 1.5;
      const corner = (sx, sy) => `<path d="M${100 + sx * 86} ${100 + sy * 62}V${100 + sy * 86}H${100 + sx * 62}" fill="none" stroke-linejoin="round" stroke-linecap="round"`;
      const all = (attrs) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => `${corner(x, y)} ${attrs}/>`).join("");
      return put(all(`stroke="${INK}" stroke-opacity=".6" stroke-width="5.2"`) + all(`stroke="#f1f3f7" stroke-width="3.2"`) + ring(r0 + 1.3, 3.8, INK, 0.6) + ring(r0 + 1.3, 2.2, "#f1f3f7") + dash(r0 + 5.2, 5, "#f1f3f7", 4, 0.012));
    },
  },
  {
    id: "s-eclipse", name: "Eclipse", group: "Shape", of: 0.18, c: ["#0b0b10", "#ffcf7a"], fx: "pulse", fxs: 4.2,
    base: (h) => {
      const r0 = h.ra - 1.5, r2 = r0 + 7.5;
      return put({ defs: glowDef("c", r2 + 0.5, 12, "#ffcf7a", 0.75, [97, 97]) + lin("e", [[0, "#3a3a46"], [0.4, "#0b0b10"], [1, "#000"]], [170, 170, 30, 30]), body: fill(donut(r2 - 1, 100), "url(#c)") + fill(donut(r0, r2), "#08080c") + ring(r2 - 0.6, 1.2, "url(#e)") + ring(r0 - 0.3, 1.2, INK, 0.55) });
    },
    glow: (h) => {
      const r2 = h.ra + 6, [x, y] = pt(r2 + 0.6, 315);
      return doc(fill(donut(r2 + 0.2, 100), "url(#c)") + `<circle cx="${f(x)}" cy="${f(y)}" r="9" fill="url(#d)"/><circle cx="${f(x)}" cy="${f(y)}" r="1.9" fill="#fff"/>`, glowDef("c", r2 + 1, 9, "#fff1cf", 0.7, [95.5, 95.5]) + rg("d", [[0, "#fff", 0.95], [0.3, "#ffe2a6", 0.5], [1, "#ffcf7a", 0]], [f(x), f(y), 9]));
    },
  },
  {
    id: "s-ripple", name: "Ripple", group: "Shape", of: 0.19, c: ["#8fe3f2", "#2a8fb0"], fx: "breathe", fxs: 4, fx2: "breathe", fxs2: 4, fxd2: -1.3,
    base: (h) => { const r0 = h.ra - 1.5; return put(ring(r0 + 1.7, 4.8, INK, 0.6), ring(r0 + 1.7, 3.2, "#8fe3f2")); },
    glow: (h) => put(ring(h.ra + 7.5, 1.8, "#8fe3f2", 0.75)),
    glow2: (h) => put(ring(h.ra + 13.5, 1.1, "#8fe3f2", 0.45)),
  },
  {
    id: "s-sunburst", name: "Sunburst", group: "Shape", of: 0.2, c: ["#f2c14a", "#fff3b8"], fx: "spin", fxs: 90,
    base: (h) => { const r0 = h.ra - 1.5; return put(metal("m", r0, r0 + 4.4, PAL.gold, 0)); },
    glow: (h) => {
      const r0 = h.ra - 1.5;
      const ray = (len, w) => `<path d="M${-w} 0L0 ${-len}L${w} 0Z"/>`;
      return doc(`<g fill="url(#g)">${around(48, (deg, i) => at(r0 + 6.8, deg, i % 4 === 0 ? ray(19, 1.5) : i % 2 === 0 ? ray(13, 1.25) : ray(7.5, 1))) }</g>`, rg("g", [[f((r0 + 6) / 100), "#fff0ad"], [1, "#d9a534"]], [100, 100, 100]));
    },
  },
  {
    id: "s-compass", name: "Compass", group: "Shape", of: 0.21, c: ["#16264f", "#d9a534"],
    base: (h) => {
      const r0 = h.ra - 1.5;
      const point = (len, w, a, b) => `<path d="M0 0L${-w} ${len * 0.3}L0 ${-len}Z" fill="${a}"/><path d="M0 0L${w} ${len * 0.3}L0 ${-len}Z" fill="${b}"/><path d="M0 ${-len}L${-w} ${len * 0.3}L0 0L${w} ${len * 0.3}Z" fill="none" stroke="${INK}" stroke-opacity=".6" stroke-width=".8" stroke-linejoin="round"/>`;
      return put(enamel(r0, r0 + 11, "#16264f", PAL.gold, 2.2), dash(r0 + 5.5, 2.4, "#f6e7b4", 32, 0.1, 0.8, 5.625), around(4, (deg) => at(r0 + 5.5, deg, point(6.5, 2.8, "#fff6d2", "#e3c877")), 45), around(4, (deg) => at(r0 + 8.5, deg, point(15, 5.4, "#fff0ad", "#b07a18"))));
    },
  },
  {
    id: "s-pearls", name: "Pearls", group: "Shape", of: 0.14, c: ["#f4efe6", "#b9b2c8"],
    base: (h) => { const r0 = h.ra - 1.5, n = 44, r = r0 + 5.6; return doc(ring(r, 9.6, INK, 0.5) + dots(r, n, f((Math.PI * r) / n - 0.25), "url(#b)"), bead("b", "#ffffff", "#f1ebe2", "#9b93ad")); },
  },
  {
    id: "s-studs", name: "Studs", group: "Shape", of: 0.16, c: ["#17171d", "#d9a534"],
    base: (h) => {
      const r0 = h.ra - 1.5;
      return put({ defs: lin("g", [[0, "#34343f"], [0.5, "#17171d"], [1, "#09090c"]], [30, 30, 170, 170]) + bead("b", "#fff6c8", "#d9a534", "#6e4a0e"), body: fill(donut(r0, r0 + 13), "url(#g)") + ring(r0 + 12.2, 0.8, "#fff", 0.14) + ring(r0 + 0.9, 0.8, "#000", 0.5) + keys(r0, r0 + 13) + dots(r0 + 6.5, 18, 3.3, `url(#b)" stroke="${INK}" stroke-opacity=".7" stroke-width=".8`) });
    },
  },
  {
    id: "s-stitched", name: "Stitched", group: "Shape", of: 0.16, c: ["#8a4b2a", "#f1e3c4"],
    base: (h) => {
      const r0 = h.ra - 1.5;
      return put({ defs: lin("g", [[0, "#b06a3f"], [0.5, "#8a4b2a"], [1, "#4f2713"]], [30, 30, 170, 170]), body: fill(donut(r0, r0 + 13.5), "url(#g)") + ring(r0 + 2.6, 2.2, "#3d1d0d", 0.45) + ring(r0 + 10.9, 2.2, "#3d1d0d", 0.45) + dash(r0 + 2.6, 1.3, "#f1e3c4", 44, 0.62) + dash(r0 + 10.9, 1.3, "#f1e3c4", 50, 0.62) + ring(r0 + 13, 0.8, "#fff", 0.18) + keys(r0, r0 + 13.5) });
    },
  },
  {
    id: "s-checker", name: "Checker", group: "Shape", of: 0.16, c: ["#f3f5f8", "#111217"],
    base: (h) => {
      const r0 = h.ra - 1.5, n = 30;
      return put(fill(donut(r0 + 1.8, r0 + 12.4), "#101116"), dash(r0 + 4.6, 5.1, "#f3f5f8", n, 0.5), dash(r0 + 9.7, 5.1, "#f3f5f8", n, 0.5, 1, 180 / n), metal("a", r0 + 12.2, r0 + 14.4, PAL.steel, 0), metal("b", r0, r0 + 2.2, PAL.steel, 0));
    },
  },
  {
    id: "s-stripes", name: "Stripes", group: "Shape", of: 0.15, c: ["#16264f", "#f1e9d6"],
    base: (h) => {
      const r0 = h.ra - 1.5, a = r0 + 2, b = r0 + 10.6;
      return put(fill(donut(a, b), "#16264f"), around(30, (deg) => fill(poly([pt(a, deg), pt(b, deg + 7), pt(b, deg + 13), pt(a, deg + 6)]), "#f1e9d6")), enamelRims(r0, r0 + 12.6, PAL.gold));
    },
  },

  /* ---- Light ------------------------------------------------------------- */
  {
    id: "l-aurora", name: "Aurora", group: "Light", of: 0.16, c: ["#43f0a8", "#9a5bff"], fx: "spin", fxs: 18,
    base: (h) => { const r0 = h.ra - 1.5; return put(fill(donut(r0, r0 + 12), "#0b0d16"), keys(r0, r0 + 12)); },
    glow: (h) => { const r0 = h.ra - 1.5; return put(conic("c", r0 + 1.3, r0 + 10.7, [[0, "#43f0a8"], [80, "#22cfd6"], [160, "#4a7dff"], [235, "#9a5bff"], [300, "#22cfd6"], [360, "#43f0a8"]]), ring(r0 + 9.4, 0.8, "#fff", 0.35)); },
  },
  {
    id: "l-comet", name: "Comet", group: "Light", of: 0.16, c: ["#1a1d2a", "#bfe9ff"], fx: "spin", fxs: 5.5,
    base: (h) => { const r0 = h.ra - 1.5; return put(ring(r0 + 5, 11.6, INK, 0.6), ring(r0 + 5, 10, "#121521"), ring(r0 + 5, 0.8, "#bfe9ff", 0.3)); },
    glow: (h) => {
      const r = h.ra + 3.5, n = 26, [x, y] = pt(r, 0);
      let tail = "";
      for (let i = 0; i < n; i++) { const t = i / n; tail += `<path d="${arc(r, -(i + 1) * 7 - 0.4, -i * 7)}" fill="none" stroke="#bfe9ff" stroke-opacity="${f((1 - t) ** 1.4)}" stroke-width="${f(7 - 5.6 * t)}"/>`; }
      return doc(tail + `<circle cx="${f(x)}" cy="${f(y)}" r="10" fill="url(#g)"/><circle cx="${f(x)}" cy="${f(y)}" r="4" fill="#fff"/>`, rg("g", [[0, "#fff", 0.9], [0.4, "#bfe9ff", 0.5], [1, "#bfe9ff", 0]], [f(x), f(y), 10]));
    },
  },
  {
    id: "l-ember", name: "Ember", group: "Light", of: 0.16, c: ["#2a2729", "#ff7a2a"], fx: "pulse", fxs: 3.4,
    base: (h) => { const r0 = h.ra - 1.5; return put(metal("m", r0, r0 + 12, PAL.iron), ring(r0 + 6, 2.6, "#050404"), ring(r0 + 6, 1.1, "#ff7a2a", 0.55)); },
    glow: (h) => { const r = h.ra + 4.5; return doc(fill(donut(r - 6, r + 6), "url(#g)") + ring(r, 1.2, "#ffd29a"), glowDef("g", r, 5.5, "#ff6a1a", 0.8)); },
  },
  {
    id: "l-halo", name: "Halo", group: "Light", of: 0.17, c: ["#ffffff", "#cfe0ff"], fx: "breathe", fxs: 4.6,
    base: (h) => { const r = h.ra + 3.5; return doc(fill(donut(r - 6, r + 6), "url(#g)") + ring(r, 2.2, "#ffffff"), glowDef("g", r, 5.5, "#cfe0ff", 0.55)); },
    glow: (h) => { const r = h.ra + 3.5; return doc(fill(donut(r - 11, r + 11), "url(#g)"), glowDef("g", r, 10.5, "#e4eeff", 0.6)); },
  },
  {
    id: "l-dusk", name: "Dusk", group: "Light", of: 0.15, c: ["#ff8a4c", "#7a3cff"],
    base: (h) => {
      const r0 = h.ra - 1.5, r2 = r0 + 11.5;
      return put({ defs: lin("g", [[0, "#ffc35a"], [0.4, "#ff5e7e"], [0.75, "#a23cf0"], [1, "#3a2bd0"]], [100, 6, 100, 194]) + lin("s", [[0, "#fff", 0.55], [0.5, "#fff", 0], [1, INK, 0.35]], [30, 30, 170, 170]), body: fill(donut(r0, r2), "url(#g)") + ring(r2 - 0.8, 1.3, "url(#s)") + ring(r0 + 0.8, 1.2, INK, 0.25) + keys(r0, r2) });
    },
  },
  {
    id: "l-tide", name: "Tide", group: "Light", of: 0.16, c: ["#1f3a8a", "#7fd6ff"], fx: "spin", fxs: 13, fx2: "spin", fxs2: 21,
    base: (h) => { const r0 = h.ra - 1.5; return put(metal("m", r0, r0 + 12.5, PAL.navy)); },
    glow: (h) => `${doc(`<circle cx="102.4" cy="100" r="${f(h.ra + 4.6)}" fill="none" stroke="#7fd6ff" stroke-opacity=".7" stroke-width="2"/>`)}`,
    glow2: (h) => `${doc(`<circle cx="97.4" cy="100" r="${f(h.ra + 4.9)}" fill="none" stroke="#e2f6ff" stroke-opacity=".5" stroke-width="1.1"/>`)}`,
  },
];

/** Two bare metal rims, for bands that bring their own middle. */
function enamelRims(r1, r2, pal, rim = 2.2) {
  const a = metal("a", r2 - rim, r2, pal, 0), b = metal("b", r1, r1 + rim, pal, 0);
  return { defs: a.defs + b.defs, body: a.body + b.body };
}
