import { rad, pt, arc, donut, sector, around, lin, spark, doc } from "../lib/frame-art.mjs";

/* Cards: struck metal and printed stock, each one object. Helpers are local on purpose
   (the lead copies this file on its own). Light comes from the top left everywhere. */

const INK = "#0d0a14";
const f1 = (n) => Math.round(n * 10) / 10;
const rnd = (i) => {
  const x = Math.sin(i * 12.9898 + 4.1) * 43758.5453;
  return x - Math.floor(x);
};
const P = (pts, close = true) => `M${pts.map(([x, y]) => `${f1(x)} ${f1(y)}`).join("L")}${close ? "Z" : ""}`;
const hx = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const mix = (a, b, t) => "#" + hx(a).map((v, i) => Math.round(v + (hx(b)[i] - v) * t).toString(16).padStart(2, "0")).join("");
function hslHex(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const fn = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return "#" + [fn(0), fn(8), fn(4)].map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("");
}
const arcP = (r, a0, a1, w, stroke, o = 1) => `<path d="${arc(r, a0, a1)}" fill="none" stroke="${stroke}"${o < 1 ? ` stroke-opacity="${o}"` : ""} stroke-width="${f1(w)}" stroke-linecap="round"/>`;
const ring = (r, w, stroke, o = 1) => `<circle cx="100" cy="100" r="${f1(r)}" fill="none" stroke="${stroke}"${o < 1 ? ` stroke-opacity="${o}"` : ""} stroke-width="${f1(w)}"/>`;

/** Reflection bands across a rim: hard-edged strips, tones = [[outer edge 0..1, colour], ...]. */
function bands(r1, r2, tones) {
  let o = "", a = 0;
  for (const [t, c] of tones) {
    const ra = r1 + (r2 - r1) * a, rb = r1 + (r2 - r1) * t;
    o += ring((ra + rb) / 2, rb - ra + 0.35, c);
    a = t;
  }
  return o;
}
const litDef = (lit = 0.3, shade = 0.3) => lin("lt", [[0, "#fff", lit], [0.38, "#fff", 0], [0.62, INK, 0.02], [1, INK, shade]], [30, 22, 172, 178]);
const lit = (r1, r2) => `<path d="${donut(r1, r2)}" fill="url(#lt)"/>`;

/** A slanted band across the rim with soft edges (a glint): returns { def, shape }. w and slant in degrees. */
function band(id, r1, r2, a, w, slant, peak, col = "#fff") {
  const a0 = a - w / 2, a1 = a + w / 2;
  const A = pt(r1, a0), B = pt(r2, a0 + slant), D = pt(r1, a1), E = pt(r2, a1 + slant);
  const ex = B[0] - A[0], ey = B[1] - A[1], el = Math.hypot(ex, ey);
  const px = -ey / el, py = ex / el;
  const hw = Math.abs((D[0] - A[0]) * px + (D[1] - A[1]) * py) / 2;
  const mx = (A[0] + B[0] + D[0] + E[0]) / 4, my = (A[1] + B[1] + D[1] + E[1]) / 4;
  const def = `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${f1(mx - px * hw)}" y1="${f1(my - py * hw)}" x2="${f1(mx + px * hw)}" y2="${f1(my + py * hw)}"><stop offset="0" stop-color="${col}" stop-opacity="0"/><stop offset=".5" stop-color="${col}" stop-opacity="${peak}"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient>`;
  const shape = `<path d="M${f1(A[0])} ${f1(A[1])}L${f1(B[0])} ${f1(B[1])}A${f1(r2)} ${f1(r2)} 0 0 1 ${f1(E[0])} ${f1(E[1])}L${f1(D[0])} ${f1(D[1])}A${f1(r1)} ${f1(r1)} 0 0 0 ${f1(A[0])} ${f1(A[1])}Z" fill="url(#${id})"/>`;
  return { def, shape };
}

const starPts = (cx, cy, R, ri) => Array.from({ length: 10 }, (_, i) => { const a = rad(i * 36), r = i % 2 ? ri : R; return [cx + r * Math.sin(a), cy - r * Math.cos(a)]; });
/** A raised five-point star, ten flat facets shaded from the top left. */
function bevelStar(cx, cy, R, ri, lo, hi, key, kw = 1) {
  const v = starPts(cx, cy, R, ri);
  let o = "";
  for (let i = 0; i < 10; i++) {
    const A = v[i], B = v[(i + 1) % 10];
    const ex = B[0] - A[0], ey = B[1] - A[1], el = Math.hypot(ex, ey);
    let nx = ey / el, ny = -ex / el;
    if (nx * ((A[0] + B[0]) / 2 - cx) + ny * ((A[1] + B[1]) / 2 - cy) < 0) { nx = -nx; ny = -ny; }
    const b = Math.min(1, Math.max(0, 0.5 + 0.58 * ((-nx - ny) / Math.SQRT2)));
    o += `<path d="M${f1(cx)} ${f1(cy)}L${f1(A[0])} ${f1(A[1])}L${f1(B[0])} ${f1(B[1])}Z" fill="${mix(lo, hi, b)}"/>`;
  }
  return o + `<path d="${P(v)}" fill="none" stroke="${key}" stroke-width="${kw}" stroke-linejoin="round"/>`;
}

/** A four-point star in four shaded quarters, so it reads as a cut gem. */
function gemSpark(x, y, R, w = 0.2, cols = ["#ffffff", "#e3f6ff", "#bfe2f4", "#86bfe0"], key = "#3a7fa8") {
  const q = R * w;
  const T = [x, y - R], Rt = [x + R, y], B = [x, y + R], L = [x - R, y];
  const quarter = (a, ctl, b, c) => `<path d="M${f1(x)} ${f1(y)}L${f1(a[0])} ${f1(a[1])}Q${f1(ctl[0])} ${f1(ctl[1])} ${f1(b[0])} ${f1(b[1])}Z" fill="${c}"/>`;
  return (
    quarter(L, [x - q, y - q], T, cols[0]) + quarter(T, [x + q, y - q], Rt, cols[1]) +
    quarter(Rt, [x + q, y + q], B, cols[3]) + quarter(B, [x - q, y + q], L, cols[2]) +
    `<path d="${spark(x, y, R, w)}" fill="none" stroke="${key}" stroke-width=".7" stroke-linejoin="round" stroke-opacity=".85"/>`
  );
}

export const frames = [
  {
    id: "card-yellow-border",
    name: "Yellow Border",
    group: "Cards",
    of: 0.12,
    c: ["#f2c11c", "#17151a"],
    base: ({ ra }) => {
      const r1 = ra - 1.5, ro = 95.8; // ro: the outer edge of the thin gold rule
      const defs =
        lin("yc", [[0, "#f9da46"], [1, "#ecc01c"]], [10, 10, 190, 190]) +
        lin("yr", [[0, "#fff0a0"], [0.4, "#e0aa30"], [0.4, "#c0881a"], [1, "#6e4806"]], [10, 10, 190, 190]) +
        lin("yb", [[0, "#fff6c2", 0.95], [0.4, "#fff6c2", 0], [0.6, "#6a4600", 0], [1, "#6a4600", 0.8]], [10, 10, 190, 190]) +
        lin("yw", [[0, "#6a4806"], [0.5, "#b9892a"], [1, "#fff2b4"]], [30, 22, 172, 178]);
      const body =
        // a dark keyline outside, then the thin gold rule a real card's border carries
        ring(ro + 1, 2, INK, 1) +
        `<path d="${donut(ro - 1.8, ro)}" fill="url(#yr)"/>` +
        // the card stock: a thick warm yellow bezel, flat, with a lit top-left bevel and a darker bottom right
        `<path d="${donut(r1, ro - 1.8)}" fill="url(#yc)"/>` +
        ring(ro - 3.4, 1.4, "url(#yb)") + ring(ro - 1.8, 0.7, "#fff3b0", 0.8) +
        // the art window: a recessed step (dark at the top left, light at the bottom right), then the thin printed line
        `<path d="${donut(r1, r1 + 3)}" fill="url(#yw)"/>` +
        ring(r1 + 3.3, 1.3, INK, 0.85) + ring(r1 + 4.9, 0.8, "#fff4b8", 0.7) + ring(r1 + 0.3, 1.2, INK, 0.6);
      return doc(body, defs);
    },
  },
  {
    id: "card-gold-star",
    name: "Gold Star",
    group: "Cards",
    of: 0.16,
    c: ["#d4a53a", "#fff0b0"],
    fx: "spin",
    fxs: 12,
    base: ({ ra }) => {
      const r1 = ra - 1.5, r2 = ra + 13, rm = (r1 + r2) / 2;
      const gold = [[0.12, "#5e3b0b"], [0.3, "#a9761f"], [0.46, "#e9c15c"], [0.58, "#fff0a8"], [0.74, "#d9a238"], [0.9, "#92631a"], [1, "#573709"]];
      // hammered dimples: a dark crescent and a bright one, kept to a modest count
      let dk = "", lg = "";
      for (let i = 0; i < 30; i++) {
        const a = i * 12 + rnd(i) * 9, r = r1 + 2.8 + rnd(i + 40) * (r2 - r1 - 5.6), s = 1.5 + rnd(i + 80) * 0.7;
        const [x, y] = pt(r, a);
        dk += `M${f1(x - s)} ${f1(y)}a${f1(s)} ${f1(s)} 0 1 0 ${f1(2 * s)} 0a${f1(s)} ${f1(s)} 0 1 0 ${f1(-2 * s)} 0z`;
        lg += `M${f1(x - s * 0.7 + 0.6)} ${f1(y + 0.6)}a${f1(s * 0.8)} ${f1(s * 0.8)} 0 1 0 ${f1(1.6 * s)} 0a${f1(s * 0.8)} ${f1(s * 0.8)} 0 1 0 ${f1(-1.6 * s)} 0z`;
      }
      // the hero star, cast into the rim at one o'clock, and a few quiet ones at the counterweight
      const [hx0, hy0] = pt(rm + 3.5, 24);
      const sh = (x, y, R, ri, o) => `<path d="${P(starPts(x, y, R, ri))}" fill="${INK}" fill-opacity="${o}"/>`;
      const hero = sh(hx0 + 1.8, hy0 + 2.6, 22, 9.4, 0.5) + bevelStar(hx0, hy0, 22, 9.4, "#7a4d0e", "#fff3b8", INK, 1.5);
      const small = [[212, 6.4], [229, 4.7], [244, 3.4]]
        .map(([a, R]) => {
          const [x, y] = pt(rm + 0.2, a);
          return sh(x + 0.9, y + 1.1, R, R * 0.43, 0.45) + bevelStar(x, y, R, R * 0.43, "#7a4d0e", "#fff3b8", "#3d2504", 0.8);
        }).join("");
      const body =
        ring(r2 + 0.7, 2, INK, 0.95) + bands(r1, r2, gold) + lit(r1, r2) +
        `<path d="${dk}" fill="${INK}" fill-opacity=".22"/><path d="${lg}" fill="#fff4bd" fill-opacity=".34"/>` +
        ring(r1 + 0.5, 1.4, INK, 0.7) + ring(r2 - 0.4, 0.8, "#fff4c0", 0.5) + ring(r1 + 1.5, 0.7, "#fff0a8", 0.45) +
        small + hero;
      return doc(body, litDef(0.34, 0.36));
    },
    glow: ({ ra }) => {
      const r1 = ra - 1.5, r2 = ra + 13;
      const g1 = band("g1", r1 + 1, r2 - 1, 292, 15, 7, 0.78, "#fff7cc");
      const g2 = band("g2", r1 + 1, r2 - 1, 292.5, 3.4, 7, 1, "#ffffff");
      return doc(g1.shape + g2.shape, g1.def + g2.def);
    },
  },
  {
    id: "card-holo-foil",
    name: "Holo Foil",
    group: "Cards",
    of: 0.14,
    c: ["#c9d0de", "#9a7bf0"],
    fx: "spin",
    fxs: 8,
    fx2: "spin",
    fxs2: 21,
    fxd2: -7,
    base: ({ ra }) => {
      const r1 = ra - 1.5, r2 = ra + 14.5;
      const N = 24, slant = 11;
      const ia = r1 + (r2 - r1) * 0.2, ib = r1 + (r2 - r1) * 0.8, im = (ia + ib) / 2;
      let foil = "";
      for (let i = 0; i < N; i++) {
        const a0 = (i * 360) / N, a1 = a0 + 360 / N + 0.3;
        // hue travels along the rim and shifts again across each band: foil, not a wheel
        const h = 255 + 78 * Math.sin(rad(a0 + 20)) + (i % 2 ? 12 : -8);
        const l = i % 2 ? 80 : 74;
        for (const [rA, rB, dh, dl, t0, t1] of [[ia, im, -24, 5, 0, 0.5], [im, ib, 22, -2, 0.5, 1]]) {
          const s0 = slant * t0, s1 = slant * t1;
          foil += `<path d="${P([pt(rA, a0 + s0), pt(rB, a0 + s1), pt(rB, a1 + s1), pt(rA, a1 + s0)])}" fill="${hslHex(h + dh, 78, l + dl - 8)}"/>`;
        }
      }
      // thin bright facet lines between the foil bands, slanted with them
      const lines = around(N, (a) => `M${f1(pt(ia, a)[0])} ${f1(pt(ia, a)[1])}L${f1(pt(ib, a + slant)[0])} ${f1(pt(ib, a + slant)[1])}`);
      const body =
        ring(r2 + 0.7, 2, INK, 0.95) +
        bands(r1, ia, [[0.5, "#6a738d"], [1, "#eef2f9"]]) + bands(ib, r2, [[0.5, "#eef2f9"], [1, "#6a738d"]]) +
        foil + `<path d="${lines}" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width=".7"/>` + lit(r1, r2) +
        ring(r1 + 0.5, 1.4, INK, 0.7) + ring(r1 + 1.7, 0.7, "#fff", 0.45) + ring(ia, 0.7, "#3d4560", 0.6) + ring(ib, 0.7, "#3d4560", 0.6);
      return doc(body, litDef(0.3, 0.3));
    },
    glow: ({ ra }) => {
      const r1 = ra - 1.5, r2 = ra + 14.5;
      const a = band("h1", r1 + 1, r2 - 1, 318, 16, 11, 0.62, "#ffffff");
      const b = band("h2", r1 + 1, r2 - 1, 318.3, 2.6, 11, 1, "#ffffff");
      return doc(a.shape + b.shape, a.def + b.def);
    },
    glow2: ({ ra }) => {
      const r1 = ra - 1.5, r2 = ra + 14.5;
      const y = band("h5", r1 + 1, r2 - 1, 100, 24, 11, 0.4, "#ffe45e");
      const m = band("h3", r1 + 1, r2 - 1, 120, 30, 11, 0.5, "#ff5ec8");
      const c = band("h4", r1 + 1, r2 - 1, 140, 28, 11, 0.5, "#35e0ff");
      return doc(y.shape + m.shape + c.shape, y.def + m.def + c.def);
    },
  },
  {
    id: "card-reverse-holo",
    name: "Reverse Holo",
    group: "Cards",
    of: 0.14,
    c: ["#cfd6e2", "#7fa4ff"],
    fx: "spin",
    fxs: 9,
    base: ({ ra }) => {
      const r1 = ra - 1.5, r2 = ra + 14.5, sl = 9;
      const silver = [[0.1, "#6e7790"], [0.2, "#d9deea"], [0.45, "#f6f8fd"], [0.58, "#b7c0d2"], [0.8, "#e9edf6"], [0.9, "#97a1b8"], [1, "#5b647c"]];
      const ia = r1 + (r2 - r1) * 0.2, ib = r1 + (r2 - r1) * 0.9;
      const hair = (n, off) => around(n, (a) => `M${f1(pt(ia, a)[0])} ${f1(pt(ia, a)[1])}L${f1(pt(ib, a + sl)[0])} ${f1(pt(ib, a + sl)[1])}`, off);
      const body =
        ring(r2 + 0.7, 2, INK, 0.95) + bands(r1, r2, silver) + lit(r1, r2) +
        `<path d="${hair(72, 0)}" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width=".8"/>` +
        `<path d="${hair(72, 2.5)}" fill="none" stroke="#4b5470" stroke-opacity=".42" stroke-width=".7"/>` +
        ring(r1 + 0.5, 1.4, INK, 0.7) + ring(r2 - 0.4, 0.8, "#fff", 0.6);
      return doc(body, litDef(0.34, 0.3));
    },
    glow: ({ ra }) => {
      const r1 = ra - 1.5, r2 = ra + 14.5, sl = 9;
      const ia = r1 + (r2 - r1) * 0.2, ib = r1 + (r2 - r1) * 0.9;
      const a = band("r1", r1 + 1, r2 - 1, 40, 26, sl, 0.55, "#ffffff");
      const b = band("r2", r1 + 1, r2 - 1, 40.4, 3.6, sl, 1, "#ffffff");
      // the hatch catches the light inside the band: the same lines, drawn with the same fade
      const lines = around(10, (ang) => `M${f1(pt(ia, ang)[0])} ${f1(pt(ia, ang)[1])}L${f1(pt(ib, ang + sl)[0])} ${f1(pt(ib, ang + sl)[1])}`, 40 - 11.5);
      return doc(a.shape + b.shape + `<path d="${lines}" fill="none" stroke="url(#r1)" stroke-width="1.1"/>`, a.def + b.def);
    },
  },
  {
    id: "card-black-label",
    name: "Black Label",
    group: "Cards",
    of: 0.14,
    c: ["#16161b", "#e5b84a"],
    fx: "spin",
    fxs: 13,
    base: ({ ra }) => {
      const r1 = ra - 1.5, r2 = ra + 14, rm = (r1 + r2) / 2;
      const dark = [[0.1, "#08080b"], [0.26, "#24242c"], [0.4, "#454552"], [0.5, "#80808e"], [0.62, "#2a2a33"], [0.8, "#131318"], [0.86, "#050507"], [0.93, "#c4c4d2"], [1, "#6a6a7a"]];
      const defs =
        litDef(0.3, 0.2) +
        lin("kp", [[0, "#fff2b8"], [0.45, "#e9bd4a"], [0.55, "#c99524"], [1, "#8a5c0c"]], [0, -12, 0, 12]) +
        lin("kg", [[0, "#fff1ac"], [0.45, "#e6b640"], [1, "#8c5f0c"]], [60, 0, 140, 40]);
      const hair = [[r1 + 2.2, 0.9], [r2 - 2.2, 1.4]].map(([r, w]) => `<circle cx="100" cy="100" r="${f1(r)}" fill="none" stroke="url(#kg)" stroke-width="${w}"/>`).join("");
      const pw = 50, ph = 19;
      const [px, py] = pt(rm + 0.4, 0);
      const rivet = (x, y) => `<circle cx="${x}" cy="${y}" r="1.35" fill="#f1c85a" stroke="#4a2f04" stroke-width=".5"/><circle cx="${x - 0.4}" cy="${y - 0.4}" r=".5" fill="#fff"/>`;
      const plate =
        `<g transform="translate(${f1(px)} ${f1(py)})"><rect x="${-pw / 2 - 1.1}" y="${-ph / 2 - 0.6}" width="${pw + 2.2}" height="${ph + 2.6}" rx="4.6" fill="${INK}" fill-opacity=".55"/>` +
        `<rect x="${-pw / 2}" y="${-ph / 2}" width="${pw}" height="${ph}" rx="3.6" fill="url(#kp)" stroke="${INK}" stroke-opacity=".85" stroke-width="1"/>` +
        `<path d="M${-pw / 2 + 3.4} ${-ph / 2 + 0.9}H${pw / 2 - 3.4}" stroke="#fff" stroke-opacity=".75" stroke-width=".8" stroke-linecap="round"/>` +
        `<rect x="${-pw / 2 + 4.4}" y="${-ph / 2 + 3}" width="${pw - 8.8}" height="${ph - 6}" rx="1.6" fill="#0b0a0f" stroke="#f3cd68" stroke-opacity=".9" stroke-width=".7"/>` +
        `<path d="M0 -4.2L4.4 0L0 4.2L-4.4 0Z" fill="url(#kp)" stroke="#4a2f04" stroke-opacity=".8" stroke-width=".5"/>` +
        `<path d="M-17 0H-8.6M8.6 0H17" stroke="#f3cd68" stroke-opacity=".85" stroke-width=".8" stroke-linecap="round"/>` +
        rivet(-pw / 2 + 2.4, 0) + rivet(pw / 2 - 2.4, 0) + `</g>`;
      const studs = [90, 180, 270].map((a) => {
        const [x, y] = pt(rm, a);
        return `<path d="M${f1(x)} ${f1(y - 3.4)}L${f1(x + 2.8)} ${f1(y)}L${f1(x)} ${f1(y + 3.4)}L${f1(x - 2.8)} ${f1(y)}Z" fill="#e9bd4a" stroke="#4a2f04" stroke-opacity=".8" stroke-width=".5"/><path d="M${f1(x - 0.2)} ${f1(y - 2.4)}L${f1(x - 1.8)} ${f1(y)}" stroke="#fff6c8" stroke-width=".6" stroke-linecap="round"/>`;
      }).join("");
      const body =
        ring(r2 + 0.7, 2, INK, 1) + bands(r1, r2, dark) + lit(r1, r2) + hair + studs +
        ring(r1 + 0.5, 1.4, INK, 0.7) + ring(r1 + 1.7, 0.7, "#c4c4d2", 0.5) + plate;
      return doc(body, defs);
    },
    glow: ({ ra }) => {
      const r1 = ra - 1.5, r2 = ra + 14;
      // a precise highlight: one slanted sliver of light on the black metal and the gold lines
      const a = band("k1", r1 + 0.8, r2 - 0.8, 250, 12, 6, 0.6, "#fff4c8");
      const b = band("k2", r1 + 0.8, r2 - 0.8, 250.2, 2.2, 6, 0.95, "#ffffff");
      const gold = (r, w) => `<path d="${arc(r, 244, 258)}" fill="none" stroke="url(#k1)" stroke-width="${w}" stroke-linecap="round"/>`;
      return doc(a.shape + b.shape + gold(r1 + 2.2, 1.6) + gold(r2 - 2.2, 2), a.def + b.def);
    },
  },
  {
    id: "card-shiny",
    name: "Shiny Sparkle",
    group: "Cards",
    of: 0.16,
    c: ["#a9d2ea", "#ffffff"],
    fx: "pulse",
    fxs: 3.3,
    fx2: "pulse",
    fxs2: 4.7,
    fxd2: -2,
    base: ({ ra }) => {
      const r1 = ra - 1.5, r2 = ra + 12.5, rc = r1 + 5;
      const face = [[0.16, "#52819f"], [0.34, "#b0d0e6"], [0.5, "#f1f8fd"], [0.6, "#ffffff"], [0.8, "#9bbdd8"], [1, "#46728f"]];
      // the inner chamfer: faceted wedges, bright where they face the light (the bottom right of the ring)
      const N = 28;
      let chamfer = "";
      for (let i = 0; i < N; i++) {
        const a0 = (i * 360) / N, am = a0 + 360 / N / 2;
        const b = Math.min(1, Math.max(0, 0.5 + 0.5 * Math.cos(rad(am - 135)) + (i % 2 ? 0.07 : -0.07)));
        chamfer += `<path d="${sector(r1, rc, a0, a0 + 360 / N + 0.3)}" fill="${mix("#5b87a9", "#f6fcff", b)}"/>`;
      }
      const burst = (a, dr, Rm) => {
        const [x, y] = pt(r1 + (r2 - r1) / 2 + dr, a);
        const L = Rm * 0.8, S = Rm * 0.52, V = Rm * 0.2;
        const v = [];
        for (let k = 0; k < 16; k++) { const ang = rad(k * 22.5); const r = k % 2 ? V : k % 4 === 0 ? L : S; v.push([x + r * Math.sin(ang), y - r * Math.cos(ang)]); }
        let facets = "";
        for (let k = 0; k < 16; k += 2) {
          const prev = v[(k + 15) % 16], tip = v[k], next = v[k + 1];
          facets += `<path d="M${f1(x)} ${f1(y)}L${f1(prev[0])} ${f1(prev[1])}L${f1(tip[0])} ${f1(tip[1])}Z" fill="#f4fbff"/><path d="M${f1(x)} ${f1(y)}L${f1(tip[0])} ${f1(tip[1])}L${f1(next[0])} ${f1(next[1])}Z" fill="#8db6d4"/>`;
        }
        return (
          `<circle cx="${f1(x + 0.9)}" cy="${f1(y + 1.3)}" r="${f1(Rm + 0.8)}" fill="${INK}" fill-opacity=".45"/>` +
          `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(Rm)}" fill="#dceaf4" stroke="${INK}" stroke-width="1.3"/>` +
          `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(Rm * 0.84)}" fill="#2a5580"/>` +
          `<path d="${arc(Rm * 0.84 - 0.3, 0, 0)}" fill="none"/>` +
          `<path d="M${f1(x - Rm * 0.62)} ${f1(y - Rm * 0.52)}A${f1(Rm * 0.82)} ${f1(Rm * 0.82)} 0 0 1 ${f1(x + Rm * 0.2)} ${f1(y - Rm * 0.8)}" fill="none" stroke="#000" stroke-opacity=".5" stroke-width="1.2" stroke-linecap="round"/>` +
          facets + `<path d="${P(v)}" fill="none" stroke="#2d6288" stroke-width=".6" stroke-linejoin="round"/>` +
          `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(Rm * 0.16)}" fill="#fff" stroke="#2d6288" stroke-width=".5"/>`
        );
      };
      const body =
        ring(r2 + 0.7, 2, INK, 0.95) + bands(rc, r2, face) + lit(rc, r2) + chamfer +
        ring(rc, 0.8, "#1d3a56", 0.6) + ring(r1 + 0.5, 1.4, INK, 0.7) + ring(r2 - 0.5, 0.9, "#fff", 0.75) + ring(rc + 1.1, 0.6, "#fff", 0.4) +
        burst(232, 0, 9.4) + burst(150, 0, 7.2) + burst(28, 4, 16);
      return doc(body, litDef(0.34, 0.28));
    },
    // two twinkle groups on different loops: the hero starburst, then the two small ones
    glow: ({ ra }) => doc(flares(ra, [[28, 4, 16]])),
    glow2: ({ ra }) => doc(flares(ra, [[232, 0, 9.4], [150, 0, 7.2]])),
  },
];

/** A flare for each starburst: a long thin cross and a small hot centre. */
function flares(ra, list) {
  const rm = ra - 1.5 + 7;
  return list.map(([a, dr, R]) => {
    const [x, y] = pt(rm + dr, a);
    return `<path d="${spark(x, y, R * 1.5, 0.04)}" fill="#fff" fill-opacity=".9"/><circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(R * 0.14)}" fill="#fff"/>`;
  }).join("");
}
