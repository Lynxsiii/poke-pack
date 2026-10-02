import { C, f, rad, pt, poly, arc, sector, donut, around, at, lin, rg, wedges, star, spark, outline, gloss, doc } from "../lib/frame-art.mjs";

/* ---- helpers shared by the Pokémon frames --------------------------------- */

const INK = "#07060c";
const f1 = (n) => Math.round(n * 10) / 10;

/** Map a path drawn in local units (origin at radius r, angle d, "up" = outward) into the 200 box. M L Q C Z with absolute pairs only. */
function shape(r, d, path, s = 1, flip = false) {
  const [ox, oy] = pt(r, d);
  const a = rad(d), ca = Math.cos(a), sa = Math.sin(a);
  return path.replace(/(-?\d*\.?\d+)[ ,]+(-?\d*\.?\d+)/g, (m, x, y) => {
    x = Number(x) * s * (flip ? -1 : 1);
    y = Number(y) * s;
    return `${f1(ox + x * ca - y * sa)} ${f1(oy + x * sa + y * ca)}`;
  });
}
/** A gradient running outward along angle d, from radius r0 to r1. */
const outward = (id, stops, r0, r1, d) => lin(id, stops, [...pt(r0, d), ...pt(r1, d)]);
const ink = (d, fill, w = 1.3, o = 0.62) => `<path d="${d}" fill="${fill}" stroke="${INK}" stroke-opacity="${o}" stroke-width="${w}" stroke-linejoin="round"/>`;
const rnd = (i) => {
  const x = Math.sin(i * 12.9898 + 4.1) * 43758.5453;
  return x - Math.floor(x);
};
const mix = (a, b, t) => {
  const p = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("");
};

/** A band's tube shading: a dark root at both edges and a lit crown, then light from the top left. */
function tubeDefs(r1, r2, sheen = 0.45, shade = 0.34) {
  const k = r1 / r2;
  return (
    rg("ts", [[k, INK, 0.5], [k + (1 - k) * 0.22, INK, 0.07], [k + (1 - k) * 0.52, "#fff", 0.2], [k + (1 - k) * 0.8, INK, 0.07], [1, INK, 0.5]], [C, C, r2]) +
    lin("tl", [[0, "#fff", sheen], [0.4, "#fff", 0], [0.62, INK, 0.04], [1, INK, shade]], [30, 22, 172, 178])
  );
}
const tube = (r1, r2) => `<path d="${donut(r1, r2)}" fill="url(#ts)"/><path d="${donut(r1, r2)}" fill="url(#tl)"/>`;
/** Inner lip, rim catch, gloss and the outline the whole family shares. */
function finish(r1, r2, { gl = 0.5, hl = "#fff" } = {}) {
  return (
    `<path d="${arc(r1 + 0.8, 0, 359.9)}" fill="none" stroke="${INK}" stroke-opacity=".34" stroke-width="1.4"/>` +
    `<path d="${arc(r1 + 2.1, 262, 408)}" fill="none" stroke="${hl}" stroke-opacity=".3" stroke-width=".8" stroke-linecap="round"/>` +
    `<path d="${arc(r2 - 1, 268, 400)}" fill="none" stroke="${hl}" stroke-opacity=".28" stroke-width=".8" stroke-linecap="round"/>` +
    gloss((r1 + r2) / 2 + 1.5, 2.6, 292, 346, gl, hl) +
    outline(r2 + 0.4, 1.5) +
    outline(r1 + 0.3, 1.2, INK, 0.55)
  );
}
/** A radial bubble gradient in objectBoundingBox units. */
const bb = (id, stops, cx = 0.35, cy = 0.3, r = 0.8) =>
  `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a !== undefined ? ` stop-opacity="${a}"` : ""}/>`).join("")}</radialGradient>`;
/** A tapered ribbon along a circular arc: widths w0 to w1, radius wobbles by wob. Returns a path. */
function ribbon(R, a0, a1, w0, w1, wob = 0, n = 26, prof = null) {
  const top = [], bot = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = a0 + (a1 - a0) * t;
    const r = typeof R === "function" ? R(t) : R + wob * Math.sin(t * Math.PI * 2);
    const w = (prof ? prof(t) : w0 + (w1 - w0) * t) / 2;
    top.push(pt(r + w, a));
    bot.push(pt(r - w, a));
  }
  return poly([...top, ...bot.reverse()]);
}

/** A spiral stroke path, centre (cx, cy), from radius r0 growing/shrinking to r1 over `turns`. */
function spiral(cx, cy, r0, r1, a0, turns, dir = 1, n = 40) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = rad(a0 + dir * turns * 360 * t);
    const r = r0 + (r1 - r0) * t;
    pts.push([cx + r * Math.sin(a), cy - r * Math.cos(a)]);
  }
  return poly(pts, false);
}

/** A tapered spiral (a curled tail): width w0 at the centre end, w1 at the far end. */
function curl(cx, cy, r0, r1, a0, turns, w0, w1, n = 48) {
  const L = [], R = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = rad(a0 + turns * 360 * t), r = r0 + (r1 - r0) * t;
    const x = cx + r * Math.sin(a), y = cy - r * Math.cos(a);
    const dr = (r1 - r0) / n / (turns * rad(360) / n), nx = Math.sin(a), ny = -Math.cos(a);
    const tx = dr * nx + r * Math.cos(a), ty = dr * ny + r * Math.sin(a);
    const m = Math.hypot(tx, ty) || 1, w = (w0 + (w1 - w0) * t) / 2;
    L.push([x - (ty / m) * w, y + (tx / m) * w]);
    R.push([x + (ty / m) * w, y - (tx / m) * w]);
  }
  return poly([...L, ...R.reverse()]);
}

const bandFor = (r1, r2, id, stops) => `<path d="${donut(r1, r2)}" fill="url(#${id})"/>`;
const diag = (id, stops) => lin(id, stops, [30, 22, 172, 178]);

/* ---- the struck-medal kit: one metal rim carries everything ------------------- */

const KEY = "#0d0a14"; // the outer keyline every frame shares
/** A gradient with hard colour changes: bands = [[end 0..1, colour], ...]. */
function hard(id, bands, a, b) {
  const s = [];
  let at0 = 0;
  for (const [e, c] of bands) {
    s.push([at0, c], [e, c]);
    at0 = e;
  }
  return lin(id, s, [...a, ...b]);
}
/** hard() running outward along angle d from radius r0 to r1. */
const hardOut = (id, bands, r0, r1, d) => hard(id, bands, pt(r0, d), pt(r1, d));

// Light comes from the top left (315 deg). Tones run bright to dark core; each side of the
// light gets its own run of reflections so the ring reads as struck metal, not a blend.
const POS = [[9, 0], [30, 1], [62, 2], [95, 3], [128, 4], [150, 2], [166, 3], [180, 4]];
const NEG = [[14, 1], [28, 0], [44, 1], [80, 2], [112, 3], [140, 4], [158, 2], [180, 3]];
const POS_B = [[16, 0], [60, 1], [120, 3], [180, 4]];
const NEG_B = [[24, 1], [76, 2], [140, 3], [180, 4]];
function metalFace(r1, r2, tones, pos = POS, neg = NEG, light = 315) {
  const by = tones.map(() => "");
  let prev = 0;
  for (const [e, t] of pos) {
    by[t] += sector(r1, r2, light + prev, light + e + 0.5);
    prev = e;
  }
  prev = 0;
  for (const [e, t] of neg) {
    by[t] += sector(r1, r2, light - e - 0.5, light - prev);
    prev = e;
  }
  return tones.map((c, i) => (by[i] ? `<path d="${by[i]}" fill="${c}"/>` : "")).join("");
}
/**
 * The rim as struck metal: hard reflection bands on the face, a bevel on the outside
 * lit from the same side and one on the inside lit from the other, and an inner keyline.
 * tones: [highlight, light, mid, dark, core].
 */
function rim(r1, r2, tones, { edge = 2.2, lip = 1.8, shift = 0 } = {}) {
  return (
    `<path d="${donut(r1, r2)}" fill="${tones[3]}"/>` +
    metalFace(r1 + lip, r2 - edge, tones, POS, NEG, 315 + shift) +
    metalFace(r2 - edge, r2, tones.map((_, i) => tones[Math.max(0, i - 1)]), POS_B, NEG_B, 315 + shift) +
    `<path d="${donut(r1, r1 + lip)}" fill="${tones[3]}"/>` +
    `<path d="${sector(r1, r1 + lip, 80 + shift, 200 + shift)}" fill="${tones[1]}"/>` +
    `<path d="${sector(r1, r1 + lip, 128 + shift, 160 + shift)}" fill="${tones[0]}"/>` +
    `<path d="${arc(r1 + 0.35, 0, 359.9)}" fill="none" stroke="${KEY}" stroke-width="1.5"/>` +
    `<path d="${arc(r1 + lip + 0.5, 286 + shift, 372 + shift)}" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width=".7" stroke-linecap="round"/>`
  );
}
/** The ring of keyline outside the rim, drawn first so ornaments that grow out of the rim cover it. */
const rimKey = (r2) => `<circle cx="100" cy="100" r="${f(r2 + 1)}" fill="none" stroke="${KEY}" stroke-width="2"/>`;
/** An ornament cast in one piece with the rim: keyline, metal bezel, then the fill with its own inner keyline. */
const cast = (d, fill, bez, { k = 7.6, b = 3.8, w = 1.4 } = {}) =>
  `<path d="${d}" fill="${KEY}" stroke="${KEY}" stroke-width="${k}" stroke-linejoin="round"/>` +
  `<path d="${d}" fill="${bez}" stroke="${bez}" stroke-width="${b}" stroke-linejoin="round"/>` +
  `<path d="${d}" fill="${fill}" stroke="${KEY}" stroke-width="${w}" stroke-linejoin="round"/>`;
/** Just the keyline and fill, for soft parts (fur) that have no metal bezel. */
const solid = (d, fill, { k = 4, w = 1.2 } = {}) =>
  `<path d="${d}" fill="${KEY}" stroke="${KEY}" stroke-width="${k}" stroke-linejoin="round"/>` +
  `<path d="${d}" fill="${fill}" stroke="${KEY}" stroke-width="${w}" stroke-linejoin="round" stroke-opacity=".7"/>`;
/** A crisp specular crescent: a stroked arc segment along an enamel's lit edge. */
const spec = (d, w = 1.2, o = 0.7, c = "#fff") => `<path d="${d}" fill="none" stroke="${c}" stroke-opacity="${o}" stroke-width="${w}" stroke-linecap="round"/>`;
/** An enamel cell set into the rim: bezel, keyline, flat fill (given as a path d). */
const cell = (d, fill, bez, w = 1.5) =>
  `<path d="${d}" fill="${bez}" stroke="${bez}" stroke-width="3.4" stroke-linejoin="round"/><path d="${d}" fill="${fill}" stroke="${KEY}" stroke-width="${w}" stroke-linejoin="round"/>`;
/** A narrow glint travelling the rim: a bright head with a short fading tail, for a layer that spins. */
function glint(r, a, { len = 16, w = 3.2, tail = 30, c = "#fff" } = {}) {
  return (
    `<path d="${arc(r, a - tail, a)}" fill="none" stroke="${c}" stroke-opacity=".28" stroke-width="${f(w * 0.7)}" stroke-linecap="round"/>` +
    `<path d="${arc(r, a - len * 0.4, a + len * 0.6)}" fill="none" stroke="${c}" stroke-opacity=".9" stroke-width="${w}" stroke-linecap="round"/>`
  );
}
/** An ellipse as a path in a local frame (so it can go through shape() and `at`), 4 curves. */
const ell = (cx, cy, rx, ry) => `M${cx - rx} ${cy}C${cx - rx} ${cy - ry * 0.56} ${cx - rx * 0.56} ${cy - ry} ${cx} ${cy - ry}C${cx + rx * 0.56} ${cy - ry} ${cx + rx} ${cy - ry * 0.56} ${cx + rx} ${cy}C${cx + rx} ${cy + ry * 0.56} ${cx + rx * 0.56} ${cy + ry} ${cx} ${cy + ry}C${cx - rx * 0.56} ${cy + ry} ${cx - rx} ${cy + ry * 0.56} ${cx - rx} ${cy}Z`;

/** Stretch a local path sideways (x only) so a motif can be fatter without being longer. */
const wide = (path, k) => path.replace(/(-?\d*\.?\d+)[ ,]+(-?\d*\.?\d+)/g, (m, x, y) => `${f1(Number(x) * k)} ${y}`);

/** A ring (donut) as a path around (cx, cy): outer radius ro, hole radius ri. */
const ringD = (cx, cy, ro, ri) => `M${f1(cx - ro)} ${f1(cy)}A${ro} ${ro} 0 1 1 ${f1(cx + ro)} ${f1(cy)}A${ro} ${ro} 0 1 1 ${f1(cx - ro)} ${f1(cy)}ZM${f1(cx - ri)} ${f1(cy)}A${ri} ${ri} 0 1 0 ${f1(cx + ri)} ${f1(cy)}A${ri} ${ri} 0 1 0 ${f1(cx - ri)} ${f1(cy)}Z`;

/** A tapering strand along a centre line (array of [x, y]); width wf(s), s 0 to 1 along it. Returns a closed path. */
function strand(P, wf) {
  const L = [], R = [];
  for (let i = 0; i < P.length; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], m = Math.hypot(dx, dy) || 1;
    const w = wf(i / (P.length - 1)) / 2;
    L.push([P[i][0] - (dy / m) * w, P[i][1] + (dx / m) * w]);
    R.push([P[i][0] + (dy / m) * w, P[i][1] - (dx / m) * w]);
  }
  return poly([...L, ...R.reverse()]);
}

/* ---- the frames ------------------------------------------------------------ */

const GOLD = ["#fff7c8", "#fbdc55", "#eab52a", "#c08416", "#7d4e0b"];

export const frames = [
  {
    id: "mon-pikachu",
    name: "Pikachu",
    group: "Pokémon",
    of: 0.24,
    c: ["#f6cf3e", "#d6402f"],
    fx: "spin",
    fxs: 11,
    base: ({ ra }) => {
      const r1 = ra - 1.5, r2 = ra + 10, rm = (r1 + r2) / 2;
      const defs =
        hardOut("pe", [[0.12, "#a97b10"], [0.6, "#f2c82e"], [0.62, "#161008"], [1, "#161008"]], r2 - 6, r2 + 36, 35) +
        hardOut("pe2", [[0.12, "#a97b10"], [0.6, "#f2c82e"], [0.62, "#161008"], [1, "#161008"]], r2 - 6, r2 + 36, -35) +
        hardOut("pt", [[0.2, "#74441a"], [0.26, "#f1c42c"], [0.7, "#f6d646"], [0.76, "#e9b824"], [1, "#d9a01a"]], r2 - 6, r2 + 46, 124);
      // big ears with black enamel tips, leaning out and not quite the same size
      const ear = "M-15 1C-20 -10 -11 -27 3 -40C13 -28 22 -10 15 1Z";
      const ears = [[-35, 0.96, 1], [34, 1.04, 0]].map(([d, s, fl]) => {
        const p = shape(r2 - 5, d, ear, s, !!fl);
        return cast(p, `url(#pe${fl ? "2" : ""})`, "#d49c1a") + spec(shape(r2 - 5, d, "M-11 -1C-14 -11 -9 -23 -1 -33", s, !!fl), 1.3, 0.75, "#fff8c8");
      }).join("");
      // the tail: a thick zigzag cast out of the lower right of the rim, brown at the root
      const bolt = "M-8 1L-9 -8L-21 -12L-5 -34L-12 -36L8 -60L24 -60L9 -42L22 -40L5 -4L10 1Z";
      const tp = shape(r2 - 6, 124, wide(bolt, 1.3), 0.82);
      const tail = cast(tp, "url(#pt)", "#b8820f", { k: 7.6, b: 3.4 }) +
        spec(shape(r2 - 6, 124, wide("M-20 -14L-5 -33M-8 -42L9 -57", 1.3), 0.82), 1.3, 0.8, "#fffbd8");
      // brown markings on the back, set in the rim at 7 to 8 o'clock
      const marks = [214, 226].map((d) => cell(sector(r1 + 2.6, r2 - 2.6, d - 2.4, d + 2.4), "#7a4719", "#d49c1a", 1.1)).join("");
      // red enamel cheeks, set into the rim
      const cheekD = (d) => shape(rm, d, ell(0, 0, 8, 4.6));
      const cheeks = [89, 271].map((d) => cell(cheekD(d), "#d5412f", "#e6b52a") + spec(shape(rm, d, "M-5.2 -1.2C-4.2 -2.8 -2 -3.4 0 -3.2", 1), 1.1, 0.72)).join("");
      return doc(rimKey(r2) + ears + tail + rim(r1, r2, GOLD) + marks + cheeks, defs);
    },
    glow: ({ ra }) => {
      const r1 = ra - 1.5, r2 = ra + 10, rm = (r1 + r2) / 2;
      return doc(glint(rm, 330, { len: 18, w: 4.2, tail: 40, c: "#fffbe0" }));
    },
  },

  {
    id: "mon-eevee",
    name: "Eevee",
    group: "Pokémon",
    of: 0.24,
    c: ["#b3702f", "#f6e6c0"],
    base: ({ ra }) => {
      const r1 = ra - 1.5, r2 = ra + 10, rm = (r1 + r2) / 2;
      const defs =
        hardOut("ee", [[0.1, "#6b3e19"], [0.62, "#bd7d3f"], [0.64, "#a76a30"], [1, "#a76a30"]], r2 - 6, r2 + 38, 33) +
        hardOut("ee2", [[0.1, "#6b3e19"], [0.62, "#bd7d3f"], [0.64, "#a76a30"], [1, "#a76a30"]], r2 - 6, r2 + 38, -33) +
        rg("fu", [[(r2 - 3) / 100, "#b98650"], [(r2 + 4) / 100, "#e6c993"], [(r2 + 12) / 100, "#f8ebc9"], [1, "#fff6dd"]]) +
        rg("fb", [[(r2 - 3) / 100, "#a9743f"], [(r2 + 6) / 100, "#d8b87f"], [1, "#ecd6a4"]]);
      // big ears, the left a little taller than the right
      const ear = "M-16 1C-21 -11 -12 -27 -2 -40C10 -27 22 -11 16 1Z";
      const inner = "M-8.5 -2C-11 -11 -6 -22 -2 -30C3 -22 10 -11 8.5 -2Z";
      const ears = [[-31, 1.02, 1], [30, 0.94, 0]].map(([d, s, fl]) => {
        const p = shape(r2 - 3, d, ear, s, !!fl);
        return solid(p, `url(#ee${fl ? "2" : ""})`, { k: 4, w: 1.2 }) +
          `<path d="${shape(r2 - 3, d, inner, s, !!fl)}" fill="#3a2010"/>` +
          spec(shape(r2 - 3, d, "M-13 -4C-15 -13 -10 -24 -4 -34", s, !!fl), 1.3, 0.55, "#f3c795") +
          `<path d="${shape(r2 - 3, d, "M-2 -3L-4.4 -8.8M2.4 -3L1.8 -9.6M6 -3L6.6 -8", s, !!fl)}" fill="none" stroke="#e6c993" stroke-width="1.5" stroke-linecap="round"/>`;
      }).join("");
      // the fur collar: irregular tufts, longest below and to the left, drawn in two layers
      // one ruff per layer: a single outline with irregular curved points, so it reads as fur and not as leaves
      const ruff = (a0, a1, n, rb, len, seed, fill, lw, lines) => {
        const q = (p) => `${f1(p[0])} ${f1(p[1])}`;
        const lim = (a) => 96 / Math.max(Math.abs(Math.sin(rad(a))), Math.abs(Math.cos(rad(a))));
        let d = `M${q(pt(rb, a0))}`, fur = "";
        let prev = pt(rb + 1.5, a0), pa = a0;
        for (let i = 0; i < n; i++) {
          const t = (i + 0.5 + (rnd(i + seed) - 0.5) * 0.7) / n;
          const a = a0 + (a1 - a0) * t;
          const prof = 0.45 + 0.55 * Math.abs(Math.sin(rad((a - 182) * 1.5)) * 0.7 + 0.3);
          const L = Math.min(len * prof * (0.75 + 0.5 * rnd(i * 3 + seed + 7)), lim(a) - rb - 3);
          const lean = (a - 182) * 0.09 + (rnd(i * 5 + seed + 11) - 0.5) * 5;
          const aV = a0 + (a1 - a0) * ((i + 1) / n) + (rnd(i * 7 + seed) - 0.5) * 2;
          const T = pt(rb + L, a + lean), V = pt(rb + 1.5 + L * 0.26, i === n - 1 ? a1 : aV);
          d += `Q${q(pt(rb + 0.3 * L + 2, pa + (a - pa) * 0.2))} ${q(T)}Q${q(pt(rb + 0.62 * L, (a + lean + (i === n - 1 ? a1 : aV)) / 2 + 1))} ${q(V)}`;
          fur += `M${q(pt(rb + 1.5 + L * 0.3, a - 0.8))}Q${q(pt(rb + L * 0.55, a + lean * 0.3))} ${q(pt(rb + L * 0.86, a + lean * 0.9))}`;
          pa = i === n - 1 ? a1 : aV;
        }
        d += `L${q(pt(rb - 2, a1))}A${f1(rb - 2)} ${f1(rb - 2)} 0 0 0 ${q(pt(rb - 2, a0))}Z`;
        return `<path d="${d}" fill="${fill}" stroke="${KEY}" stroke-width="${lw}" stroke-linejoin="round"/>` + (lines ? `<path d="${fur}" fill="none" stroke="#a87a45" stroke-opacity=".55" stroke-width=".9" stroke-linecap="round"/>` : "");
      };
      const back = ruff(98, 266, 11, r2 - 3, 28, 3, "url(#fb)", 2.6, true);
      const front = ruff(108, 256, 9, r2 - 2.6, 19, 40, "url(#fu)", 1.8, true);
      const shade = `<path d="${arc(r2 + 0.6, 112, 252)}" fill="none" stroke="${KEY}" stroke-opacity=".38" stroke-width="2.2"/>`;
      return doc(rimKey(r2) + ears + back + rim(r1, r2, ["#f6dcae", "#dca160", "#b3702f", "#824a1d", "#47270d"]) + shade + front, defs);
    },
  },
  {
    id: "mon-jigglypuff",
    name: "Jigglypuff",
    group: "Pokémon",
    of: 0.24,
    c: ["#f08fb8", "#fff1f6"],
    base: ({ ra }) => {
      const r1 = ra - 1.5, r2 = ra + 12, rm = (r1 + r2) / 2;
      const ROSE = ["#fff7fb", "#f5d3e2", "#d397b5", "#9d6285", "#54304c"];
      const defs =
        hardOut("je", [[0.1, "#d9588f"], [0.6, "#ff9cc6"], [0.62, "#ff8fbd"], [1, "#ff8fbd"]], r2 - 6, r2 + 38, 40) +
        hardOut("je2", [[0.1, "#d9588f"], [0.6, "#ff9cc6"], [0.62, "#ff8fbd"], [1, "#ff8fbd"]], r2 - 6, r2 + 38, -40);
      const ear = "M-14 1C-17 -12 -10 -26 -1 -38C9 -26 18 -12 14 1Z";
      const einner = "M-7 -3C-9 -12 -5 -21 -1 -29C4 -21 8 -12 7 -3Z";
      const ears = [[-41, 1.02, 1], [40, 0.95, 0]].map(([d, s, fl]) => {
        const p = shape(r2 - 3, d, ear, s, !!fl);
        return cast(p, `url(#je${fl ? "2" : ""})`, "#d397b5") + `<path d="${shape(r2 - 3, d, einner, s, !!fl)}" fill="#4a3677" stroke="${KEY}" stroke-width="1" stroke-linejoin="round"/>` +
          spec(shape(r2 - 3, d, "M-10 -4C-12 -13 -8 -23 -3 -31", s, !!fl), 1.3, 0.8, "#fff");
      }).join("");
      // the curl of hair: a thick tapering spiral growing out of the rim, left of the top
      const tuft = curl(76, 19, 12.5, 2.6, 106, -1.3, 8.4, 4.2, 48);
      const hair = cast(tuft, "#ff8fbd", "#d397b5", { k: 6.2, b: 2.6, w: 1.2 }) + spec("M66 13C68 9.4 72 8 77 8.6", 1.1, 0.85);
      // pink enamel set between metal edges
      const e1 = r1 + 4.2, e2 = r2 - 4.6;
      const enamel =
        `<path d="${donut(e1, e2)}" fill="#ff8fbd" stroke="${KEY}" stroke-width="1.3" stroke-linejoin="round"/>` +
        `<path d="${arc(e1 + 1.9, 138, 232)}" fill="none" stroke="#d9588f" stroke-width="1.5" stroke-linecap="round" stroke-opacity=".8"/>` +
        spec(arc((e1 + e2) / 2 + 0.7, 292, 352), 1.5, 0.9);
      return doc(rimKey(r2) + ears + hair + rim(r1, r2, ROSE) + enamel, defs);
    },
  },

  {
    id: "mon-gengar",
    name: "Gengar",
    group: "Pokémon",
    of: 0.24,
    c: ["#6a49b4", "#d6405a"],
    fx: "spin",
    fxs: 13,
    base: ({ ra }) => {
      const r1 = ra - 1.5, r2 = ra + 10.5, rm = (r1 + r2) / 2;
      const VIO = ["#d6c4fa", "#9371dc", "#6a49b4", "#47327f", "#261a4f"];
      const defs =
        hardOut("gs", [[0.12, "#35255f"], [0.5, "#6d4cb8"], [0.52, "#5a3da0"], [1, "#5a3da0"]], r2 - 6, r2 + 40, 34) +
        hardOut("gs2", [[0.12, "#35255f"], [0.5, "#6d4cb8"], [0.52, "#5a3da0"], [1, "#5a3da0"]], r2 - 6, r2 + 40, -34) +
        lin("gm", [[0, "#12041a"], [1, "#3e0f40"]], [0, 150, 0, 200]);
      // spikes: uneven in length, width and lean, all cast out of the rim; no two alike
      const spikeD = (L, w, lean) => `M${f1(-w / 2)} 2Q${f1(-w * 0.34 + lean * 0.2)} ${f1(-L * 0.5)} ${f1(lean)} ${f1(-L)}Q${f1(w * 0.46 + lean * 0.3)} ${f1(-L * 0.42)} ${f1(w / 2)} 2Z`;
      const sp = [[54, 13, 14, 3], [67, 23, 15, 7], [82, 16, 13, -2], [96, 10, 12, 3], [110, 8, 10, 2], [248, 9, 10, -3], [262, 20, 15, -6], [278, 13, 13, 2], [292, 25, 15, -8], [322, 10, 11, -3]];
      const spD = sp.map(([d, L, w, ln]) => shape(r2 - 3, d, spikeD(L, w, ln))).join("");
      const spikes = cast(spD, "#5a3da0", "#8e6bd6", { b: 2.6, k: 6.4, w: 1.2 }) +
        spec(sp.map(([d, L, w, ln]) => shape(r2 - 3, d, `M${f1(-w * 0.22)} -2Q${f1(-w * 0.2)} ${f1(-L * 0.45)} ${f1(ln * 0.8)} ${f1(-L * 0.8)}`)).join(""), 1, 0.5, "#e6dbff");
      // two big ears, the right one a little shorter and bent
      const earL = "M-15 1C-19 -11 -10 -27 -3 -41C7 -27 20 -11 15 1Z";
      const earR = "M-14 1C-18 -10 -9 -23 2 -32C6 -35 9 -33 8 -29C14 -21 20 -9 15 1Z";
      const ears = cast(shape(r2 - 3, -31, earL, 1), "url(#gs2)", "#8e6bd6") + cast(shape(r2 - 3, 32, earR, 1), "url(#gs)", "#8e6bd6") +
        spec(shape(r2 - 3, -31, "M-11 -4C-14 -13 -9 -25 -4 -35", 1), 1.2, 0.6, "#e6dbff") + spec(shape(r2 - 3, 32, "M-10 -4C-13 -12 -8 -21 0 -27", 1), 1.2, 0.6, "#e6dbff");
      // the grin: a dark mouth under the rim, lopsided (heavier to the left), teeth uneven, one big fang
      const a0 = 112, a1 = 250, N = 22;
      const hAt = (t) => 16 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.78)), 0.85);
      const outer = [], inner = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N, a = a0 + (a1 - a0) * t;
        outer.push(pt(r2 + 1 + hAt(t), a));
        inner.push(pt(r2 - 2, a));
      }
      const mouthD = poly([...outer, ...inner.reverse()]);
      const tooth = (p, q2, tip) => `<path d="${poly([p, q2, tip])}"/>`;
      let teeth = "";
      const top = [[121, 7, 5], [131, 8.5, 7.4], [141, 7, 6], [151, 9, 8.6], [162, 7, 6.2], [172, 11, 11.5], [184, 7.5, 6.4], [194, 9, 8], [204, 7, 5.6], [214, 10, 9.4], [225, 7, 5.6], [235, 8, 6.4], [244, 6, 4.4]];
      for (const [a, w, h] of top) teeth += tooth(pt(r2 - 1.4, a - w / 2), pt(r2 - 1.4, a + w / 2), pt(r2 - 1.4 + h, a + 1));
      const bot = [[126, 7, 4.4], [137, 8, 5.8], [156, 9, 6.4], [167, 7, 5], [190, 8, 6], [200, 7, 4.8], [210, 9, 6.6], [220, 7, 5], [239, 6, 3.6]];
      for (const [a, w, h] of bot) {
        const t = (a - a0) / (a1 - a0), ro = r2 + 1 + hAt(t) - 0.6;
        teeth += tooth(pt(ro, a - w / 2), pt(ro, a + w / 2), pt(ro - h, a));
      }
      const mouth = `<path d="${mouthD}" fill="url(#gm)" stroke="${KEY}" stroke-width="2.4" stroke-linejoin="round"/><g fill="#f4eefc" stroke="#240c3c" stroke-opacity=".7" stroke-width=".7" stroke-linejoin="round">${teeth}</g>`;
      return doc(rimKey(r2) + spikes + ears + mouth + rim(r1, r2, VIO), defs);
    },
    glow: ({ ra }) => {
      const r1 = ra - 1.5, r2 = ra + 10.5;
      return doc(glint((r1 + r2) / 2, 300, { len: 18, w: 4.2, tail: 40, c: "#f3ecff" }));
    },
  },
  {
    id: "mon-umbreon",
    name: "Umbreon",
    group: "Pokémon",
    of: 0.22,
    c: ["#383d6b", "#ffd84a"],
    fx: "pulse",
    fxs: 6,
    base: ({ ra }) => {
      const r1 = ra - 1.5, r2 = ra + 10.5, rm = (r1 + r2) / 2;
      const DARK = ["#a9b2e8", "#5b6399", "#383d6b", "#222543", "#0f1122"];
      const defs =
        hardOut("ue", [[0.1, "#131528"], [0.55, "#2c3159"], [0.57, "#242848"], [1, "#242848"]], r2 - 6, r2 + 38, 31) +
        hardOut("ue2", [[0.1, "#131528"], [0.55, "#2c3159"], [0.57, "#242848"], [1, "#242848"]], r2 - 6, r2 + 38, -31);
      // pointed ears with a rim light down the lit edge
      const ear = "M-15 1C-17 -10 -9 -24 1 -35C10 -23 18 -10 15 1Z";
      const ears = [[-30, 1, 1], [30, 0.97, 0]].map(([d, s, fl]) => {
        const p = shape(r2 - 3, d, ear, s, !!fl);
        return cast(p, `url(#ue${fl ? "2" : ""})`, "#59609a") +
          spec(shape(r2 - 3, d, "M-11 -3C-13 -12 -7 -22 0 -30", s, !!fl), 1.4, 0.9, "#9aa6f0") +
          at(r2 + 13, d, `<path d="${ringD(0, 0, 3.7, 1.6)}" fill="#ffd84a" stroke="${KEY}" stroke-width="1" stroke-linejoin="round"/>`, `rotate(${fl ? 14 : -10})`);
      }).join("");
      // the yellow markings as enamel set in the dark rim
      const mark = (d, ro, ri) => { const [x, y] = pt(rm, d); return cell(ringD(x, y, ro, ri), "#f6cf3c", "#59609a", 1.3) + spec(`M${f1(x - ro * 0.62)} ${f1(y - ro * 0.34)}A${ro * 0.7} ${ro * 0.7} 0 0 1 ${f1(x - ro * 0.12)} ${f1(y - ro * 0.72)}`, 0.9, 0.85, "#fff6bd"); };
      const rings = mark(64, 4.8, 1.9) + mark(122, 4.2, 1.7) + mark(236, 3.8, 1.5) + mark(298, 4.6, 1.8);
      // the forehead crescent: set into the top of the rim, off to the left
      const [cx, cy] = pt(rm + 0.2, -6);
      const crescent = cell(`M${f1(cx - 8)} ${f1(cy - 2)}C${f1(cx - 4)} ${f1(cy + 6.4)} ${f1(cx + 4)} ${f1(cy + 6.4)} ${f1(cx + 8)} ${f1(cy - 2)}C${f1(cx + 4)} ${f1(cy + 1.6)} ${f1(cx - 4)} ${f1(cy + 1.6)} ${f1(cx - 8)} ${f1(cy - 2)}Z`, "#f6cf3c", "#59609a", 1.3);
      return doc(rimKey(r2) + ears + rim(r1, r2, DARK) + rings + crescent, defs);
    },
    glow: ({ ra }) => {
      const r1 = ra - 1.5, r2 = ra + 10.5, rm = (r1 + r2) / 2;
      const defs = `<radialGradient id="hg"><stop offset=".35" stop-color="#ffe45c" stop-opacity=".6"/><stop offset="1" stop-color="#ffd84a" stop-opacity="0"/></radialGradient>`;
      const pts = [[64, 4.8], [122, 4.2], [236, 3.8], [298, 4.6]].map(([d, r]) => [...pt(rm, d), r]);
      const ears = [-30, 30].map((d) => [...pt(r2 + 10, d), 3.7]);
      const all = [...pts, ...ears];
      const halos = all.map(([x, y, r]) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r * 2.5)}" fill="url(#hg)"/>`).join("");
      const lit = all.map(([x, y, r]) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1((r + 1.9) / 2 + 0.2)}" fill="none" stroke="#fff2a0" stroke-width="${f1(r - 1.8)}" stroke-opacity=".85"/>`).join("");
      return doc(halos + lit, defs);
    },
  },
  {
    id: "mon-mew",
    name: "Mew",
    group: "Pokémon",
    of: 0.22,
    c: ["#f4a3cb", "#9fd8ff"],
    fx: "drift",
    fxs: 6.5,
    fxd: -2,
    base: ({ ra }) => {
      const r1 = ra - 1.5, r2 = ra + 10.5, rm = (r1 + r2) / 2;
      const PEARL = ["#fff6fb", "#ffd3e8", "#f4a3cb", "#c96ea6", "#843f70"];
      const defs =
        hardOut("me", [[0.1, "#c4619a"], [0.6, "#ffc3de"], [0.62, "#f9aed0"], [1, "#f9aed0"]], r2 - 6, r2 + 36, 30) +
        hardOut("me2", [[0.1, "#c4619a"], [0.6, "#ffc3de"], [0.62, "#f9aed0"], [1, "#f9aed0"]], r2 - 6, r2 + 36, -30) +
        hard("mt", [[0.2, "#ffe0ee"], [0.45, "#ffc0dc"], [0.7, "#f3a0c8"], [1, "#d07bab"]], [20, 120], [80, 200]) +
        `<radialGradient id="mq" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff" stop-opacity=".04"/><stop offset=".72" stop-color="#cfeeff" stop-opacity=".28"/><stop offset="1" stop-color="#9fd8ff" stop-opacity=".8"/></radialGradient>`;
      const ear = "M-14 1C-17 -10 -9 -24 0 -35C9 -23 18 -10 14 1Z";
      const einner = "M-7 -3C-9 -11 -5 -19 0 -26C5 -19 9 -11 7 -3Z";
      const ears = [[-31, 1.02, 1], [30, 0.96, 0]].map(([d, s, fl]) => {
        const p = shape(r2 - 3, d, ear, s, !!fl);
        return cast(p, `url(#me${fl ? "2" : ""})`, "#d98bb6") + `<path d="${shape(r2 - 3, d, einner, s, !!fl)}" fill="#ff8fc2" fill-opacity=".7"/>` + spec(shape(r2 - 3, d, "M-10 -4C-12 -12 -8 -21 -3 -29", s, !!fl), 1.3, 0.85);
      }).join("");
      // the tail: heavy at the root where it leaves the foot of the rim, running round outside it, then curling out to a bulb
      const P = [];
      const aS = 166, aE = 232, nA = 26;
      for (let i = 0; i <= nA; i++) {
        const t = i / nA, sm = t * t * (3 - 2 * t);
        P.push(pt(r2 - 3 + 12.5 * sm, aS + (aE - aS) * t));
      }
      const pe = P[P.length - 1], pp = P[P.length - 2];
      const hx = pe[0] - pp[0], hy = pe[1] - pp[1], hm = Math.hypot(hx, hy);
      const Rc = 10.5, ccx = pe[0] + (hy / hm) * Rc, ccy = pe[1] - (hx / hm) * Rc; // left of the heading, outward
      const a1 = (Math.atan2(pe[0] - ccx, -(pe[1] - ccy)) * 180) / Math.PI;
      const nC = 34, turns = 1.3;
      for (let i = 1; i <= nC; i++) {
        const t = i / nC, aa = rad(a1 - turns * 360 * t), rr = Rc + (3.6 - Rc) * Math.pow(t, 0.85);
        P.push([ccx + rr * Math.sin(aa), ccy - rr * Math.cos(aa)]);
      }
      const tailD = strand(P, (s2) => 5.4 + 11 * Math.pow(1 - s2, 1.25));
      const tip = P[P.length - 1];
      const tail = cast(tailD, "url(#mt)", "#d98bb6", { k: 6.4, b: 2.6, w: 1.2 }) +
        `<circle cx="${f1(tip[0])}" cy="${f1(tip[1])}" r="5.6" fill="#ffd0e6" stroke="${KEY}" stroke-width="1.3"/><circle cx="${f1(tip[0] - 1.8)}" cy="${f1(tip[1] - 1.9)}" r="1.6" fill="#fff" fill-opacity=".9"/>`;
      // one bubble, off to the upper right, as the counterweight
      const [bx, by] = pt(r2 + 11, 54);
      const bubble = `<circle cx="${f1(bx)}" cy="${f1(by)}" r="7.4" fill="url(#mq)" stroke="#e3f6ff" stroke-opacity=".95" stroke-width="1.1"/><circle cx="${f1(bx)}" cy="${f1(by)}" r="8.7" fill="none" stroke="${KEY}" stroke-opacity=".5" stroke-width="1"/>` + spec(`M${f1(bx - 4.4)} ${f1(by - 1.4)}A4.6 4.6 0 0 1 ${f1(bx - 0.8)} ${f1(by - 4.7)}`, 1.3, 0.95);
      return doc(rimKey(r2) + ears + tail + rim(r1, r2, PEARL) + bubble, defs);
    },
    glow: ({ ra }) => {
      const r2 = ra + 10.5;
      const b = (d, r, k) => { const [x, y] = pt(r, d); return `<circle cx="${f1(x)}" cy="${f1(y)}" r="${k}" fill="#d8f4ff" fill-opacity=".35" stroke="#fff" stroke-opacity=".95" stroke-width=".9"/><circle cx="${f1(x - k * 0.32)}" cy="${f1(y - k * 0.36)}" r="${f1(k * 0.26)}" fill="#fff"/>`; };
      return doc(b(86, r2 + 8, 3.6) + b(104, r2 + 15, 2.4) + b(72, r2 + 17, 1.9));
    },
  },
];
