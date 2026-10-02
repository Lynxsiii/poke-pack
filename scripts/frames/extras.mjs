import { C, pt, arc, donut, lin, rg, spark, doc, rad } from "../lib/frame-art.mjs";

/* Extras: each frame is one made object (a gold crown on a rim, a neon sign on a plate,
   a branch, an enamel medal). Helpers are local on purpose: the lead copies this file on
   its own. One decimal everywhere, so busy frames stay under the size limit. */

const INK = "#0d0a14";
const g = (n) => Math.round(n * 10) / 10;
const rnd = (i) => {
  const x = Math.sin(i * 12.9898 + 4.1) * 43758.5453;
  return x - Math.floor(x);
};
const P = (points, close = true) => `M${points.map(([x, y]) => `${g(x)} ${g(y)}`).join("L")}${close ? "Z" : ""}`;
const sp = (x, y, R, w = 0.2) => spark(g(x), g(y), R, w);
const at = (r, deg, inner, extra = "") => {
  const [x, y] = pt(r, deg);
  return `<g transform="translate(${g(x)} ${g(y)}) rotate(${g(deg)})${extra ? " " + extra : ""}">${inner}</g>`;
};
const ring = (r, w, stroke, o = 1) => `<circle cx="100" cy="100" r="${g(r)}" fill="none" stroke="${stroke}"${o < 1 ? ` stroke-opacity="${o}"` : ""} stroke-width="${g(w)}"/>`;
const arcP = (r, a0, a1, w, stroke, o = 1) => `<path d="${arc(r, a0, a1)}" fill="none" stroke="${stroke}"${o < 1 ? ` stroke-opacity="${o}"` : ""} stroke-width="${g(w)}" stroke-linecap="round"/>`;
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
const litP = (r1, r2) => `<path d="${donut(r1, r2)}" fill="url(#lt)"/>`;
/** A slanted soft band across a rim, for a glint: returns { def, shape }. */
function band(id, r1, r2, a, w, slant, peak, col = "#fff") {
  const a0 = a - w / 2, a1 = a + w / 2;
  const A = pt(r1, a0), B = pt(r2, a0 + slant), D = pt(r1, a1), E = pt(r2, a1 + slant);
  const ex = B[0] - A[0], ey = B[1] - A[1], el = Math.hypot(ex, ey);
  const px = -ey / el, py = ex / el;
  const hw = Math.abs((D[0] - A[0]) * px + (D[1] - A[1]) * py) / 2;
  const mx = (A[0] + B[0] + D[0] + E[0]) / 4, my = (A[1] + B[1] + D[1] + E[1]) / 4;
  const def = `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${g(mx - px * hw)}" y1="${g(my - py * hw)}" x2="${g(mx + px * hw)}" y2="${g(my + py * hw)}"><stop offset="0" stop-color="${col}" stop-opacity="0"/><stop offset=".5" stop-color="${col}" stop-opacity="${peak}"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient>`;
  return { def, shape: `<path d="${P([A, B, E, D])}" fill="url(#${id})"/>` };
}
function trace(rFn, a0, a1, step = 4) {
  let out = "";
  for (let d = a0, i = 0; d <= a1 + 0.001; d += step, i++) {
    const [x, y] = pt(rFn(d), d);
    out += `${i ? "L" : "M"}${g(x)} ${g(y)}`;
  }
  return out;
}
const leaf = (L, w) => `M0 0C${g(w * 1.1)} ${g(-L * 0.25)} ${g(w * 0.9)} ${g(-L * 0.7)} 0 ${g(-L)}C${g(-w * 0.9)} ${g(-L * 0.7)} ${g(-w * 1.1)} ${g(-L * 0.25)} 0 0Z`;
const leafHalf = (L, w) => `M0 0C${g(w * 1.1)} ${g(-L * 0.25)} ${g(w * 0.9)} ${g(-L * 0.7)} 0 ${g(-L)}Z`;

// ============================================================ LAUREL
const laurel = {
  id: "gen-laurel",
  name: "Laurel Wreath",
  group: "Extras",
  of: 0.2,
  c: ["#f5d56a", "#b8801c"],
  base: ({ ra }) => {
    const rs = ra + 8;
    const A0 = 56, A1 = 304;
    const defs =
      lin("lg", [[0, "#fff3b0"], [0.4, "#f0c23e"], [1, "#9a6610"]], [-6, -14, 6, 2]) +
      lin("ls", [[0, "#ffe27a"], [0.5, "#d9a22a"], [1, "#7a4f08"]], [40, 20, 160, 180]) +
      lin("lr", [[0, "#f0586a"], [0.5, "#c8243a"], [1, "#8a1024"]], [-8, -8, 8, 10]) +
      rg("lb", [[0, "#ff9a9a"], [0.6, "#d4283c"], [1, "#7a0f1e"]], [-1, -1.5, 3.2]);
    let leaves = "";
    const n = 15;
    for (let i = 0; i < n; i++) {
      // uneven rhythm: the spacing, size and angle of every pair wobble a little
      const t = (i + (rnd(i + 3) - 0.5) * 0.5) / (n - 1);
      const deg = A0 + 12 + t * (A1 - A0 - 24);
      const dir = deg > 180 ? 1 : -1; // leaves grow from the bottom towards the open top
      const L = (13.5 + 5 * Math.sin(Math.PI * Math.min(Math.max(t, 0), 1))) * (0.84 + 0.3 * rnd(i + 11));
      const ao = 52 + (rnd(i + 21) - 0.5) * 16, ai = 118 + (rnd(i + 31) - 0.5) * 14;
      const lf = (ang, LL, w) => `<g transform="rotate(${g(dir * ang)})"><path d="${leaf(LL, w)}M0 0L0 ${g(-LL * 0.8)}"/><path d="${leafHalf(LL, w)}" fill="#6a4208" fill-opacity=".34" stroke="none"/></g>`;
      leaves += at(rs, deg, lf(ai, L - 2.5, 5.8) + lf(ao, L, 7));
    }
    const tips = [A0, A1].map((d, k) => at(rs, d, `<g transform="rotate(${k ? 28 : -28})"><path d="${leaf(14, 4.8)}M0 0L0 -11.5"/><path d="${leafHalf(14, 4.8)}" fill="#6a4208" fill-opacity=".34" stroke="none"/></g>`)).join("");
    const berries = [A0 + 5, A1 - 5].map((d) => {
      const [x, y] = pt(rs + 1, d);
      return [[-1.5, 0, 2.6], [2, 2.5, 2.3], [1, -2.8, 2.1]].map(([dx, dy, r]) => `<circle cx="${g(x + dx)}" cy="${g(y + dy)}" r="${r}" fill="url(#lb)" stroke="#4a0a14" stroke-opacity=".7" stroke-width=".6"/>`).join("");
    }).join("");
    // a proper ribbon: tails behind, two loops with a darker inside fold, a knot on top
    const K = `stroke="#4a0a18" stroke-width=".9" stroke-linejoin="round"`;
    const bow = (() => {
      const [x, y] = pt(rs + 0.6, 180);
      return `<g transform="translate(${g(x)} ${g(y)})">` +
        `<path d="M-1 2L-12 15.5L-7.6 15L-6 19.5L1 4Z" fill="url(#lr)" ${K}/>` +
        `<path d="M1 2L10.5 16.5L6.8 15.4L6 20L-1 4Z" fill="url(#lr)" ${K}/>` +
        `<path d="M-1.6 4.4L-8.4 13.6M1.6 4.4L7.6 14" stroke="#4a0a18" stroke-opacity=".55" stroke-width=".6" fill="none"/>` +
        `<path d="M0 0C-5 -9-19.5-11-21.5-3C-22.5 5-10 7 0 1Z" fill="url(#lr)" ${K}/>` +
        `<path d="M-1.5 0C-6-5-14.5-6-16-2.2C-15 1.6-8 2.4-1.5 1Z" fill="#8a1024" fill-opacity=".85"/>` +
        `<path d="M0 0C5-9 19-11.4 21-3.4C22 4.6 10 6.6 0 1Z" fill="url(#lr)" ${K}/>` +
        `<path d="M1.5 0C6-5 14-6.2 15.6-2.4C14.6 1.4 8 2.2 1.5 1Z" fill="#8a1024" fill-opacity=".85"/>` +
        `<rect x="-3.6" y="-2.2" width="7.2" height="6" rx="2.4" fill="url(#lr)" ${K}/><path d="M-2.2 -0.8H1" stroke="#ffc0c8" stroke-width=".9" stroke-linecap="round"/></g>`;
    })();
    const body =
      arcP(rs, A0, A1, 3.8, "#2e1a02", 0.85) + arcP(rs, A0, A1, 2.2, "url(#ls)") +
      `<g fill="url(#lg)" stroke="#4a2c04" stroke-opacity=".85" stroke-width=".75" stroke-linejoin="round">${leaves}${tips}</g>` +
      berries + bow;
    return doc(body, defs);
  },
};

// ============================================================ CROWN
const CROWN = { half: 40, peaks: [[-33, 12], [-16.5, 16], [0, 18.5], [16.5, 16], [33, 12]], valley: 3.6 };
const crown = {
  id: "gen-crown",
  name: "Gold Crown",
  group: "Extras",
  of: 0.24,
  c: ["#ffd95a", "#b8801c"],
  fx: "spin",
  fxs: 12,
  fx2: "pulse",
  fxs2: 5.6,
  fxd2: -2,
  base: ({ ra }) => {
    const r1 = ra - 1.5;
    const r2 = ra + 4.6;
    const Rb = r2 + 3.6; // the crown's circlet sits on the rim: it runs from r2 - 2.5 up to Rb
    const gold = [[0.14, "#5a3808"], [0.3, "#a8741a"], [0.46, "#e9bf50"], [0.6, "#fff0a0"], [0.76, "#d6a030"], [0.9, "#8e5e14"], [1, "#523406"]];
    const metal = lin("cg", [[0, "#fff4b4"], [0.24, "#ffe27a"], [0.24, "#eebd44"], [0.56, "#cf9a28"], [0.56, "#a97616"], [1, "#6e4408"]], [40, 6, 160, 60]);
    const defs = litDef(0.3, 0.32) + metal + rg("cp", [[0, "#ffffff"], [0.65, "#f3ead0"], [1, "#a89870"]], [-0.8, -0.8, 3.6]);
    // outline of the crown in polar space: spikes with a concave sweep between them
    const pk = CROWN.peaks;
    let prev = [-CROWN.half, 0];
    const path = [];
    path.push(`M${g(pt(Rb, -CROWN.half)[0])} ${g(pt(Rb, -CROWN.half)[1])}`);
    pk.forEach(([a, h], i) => {
      const [x, y] = pt(Rb + h, a);
      if (i === 0) path.push(`L${g(x)} ${g(y)}`);
      else {
        const am = (prev[0] + a) / 2;
        const [cx, cy] = pt(Rb + CROWN.valley - 3.4, am);
        path.push(`Q${g(cx)} ${g(cy)} ${g(x)} ${g(y)}`);
      }
      prev = [a, h];
    });
    path.push(`L${g(pt(Rb, CROWN.half)[0])} ${g(pt(Rb, CROWN.half)[1])}`);
    path.push(`A${g(Rb)} ${g(Rb)} 0 0 0 ${g(pt(Rb, -CROWN.half)[0])} ${g(pt(Rb, -CROWN.half)[1])}Z`);
    const outline = path.join("");
    const gemAt = (a, rr, c1, c2, rad2) => {
      const [x, y] = pt(r2 + 0.6, a);
      return `<circle cx="${g(x)}" cy="${g(y)}" r="${g(rad2 + 1)}" fill="#4a2c04" fill-opacity=".85"/><circle cx="${g(x)}" cy="${g(y)}" r="${rad2}" fill="${c1}" stroke="#1a0e02" stroke-opacity=".7" stroke-width=".6"/><circle cx="${g(x + rad2 * 0.2)}" cy="${g(y + rad2 * 0.25)}" r="${g(rad2 * 0.55)}" fill="${c2}" fill-opacity=".55"/><circle cx="${g(x - rad2 * 0.35)}" cy="${g(y - rad2 * 0.4)}" r="${g(rad2 * 0.3)}" fill="#fff" fill-opacity=".85"/>`;
    };
    const gems =
      gemAt(-28, 0, "#2a62d8", "#7aa6ff", 2.4) + gemAt(-14, 0, "#f4f0e0", "#c8bea0", 2) + gemAt(0, 0, "#d8203a", "#ff7a88", 3.2) +
      gemAt(14, 0, "#f4f0e0", "#c8bea0", 2) + gemAt(28, 0, "#2a62d8", "#7aa6ff", 2.4);
    const pearls = pk.map(([a, h]) => {
      const [x, y] = pt(Rb + h + 1.3, a);
      const R = a === 0 ? 2.8 : 2.3;
      return `<circle cx="${g(x)}" cy="${g(y)}" r="${R}" fill="url(#cp)" stroke="#3a2404" stroke-opacity=".85" stroke-width=".8"/>`;
    }).join("");
    // engraved ribs up the middle of every spike, and a lit edge on the left of each
    const ribs = pk.map(([a, h]) => `M${g(pt(Rb + 0.8, a)[0])} ${g(pt(Rb + 0.8, a)[1])}L${g(pt(Rb + h - 1.2, a)[0])} ${g(pt(Rb + h - 1.2, a)[1])}`).join("");
    const body =
      ring(r2 + 0.7, 2, INK, 0.95) + bands(r1, r2, gold) + litP(r1, r2) + ring(r1 + 0.5, 1.4, INK, 0.7) + ring(r2 - 0.4, 0.8, "#fff4c0", 0.5) +
      // contact shadow of the crown on the rim
      `<path d="${arc(r2 - 2, -CROWN.half - 2, CROWN.half + 2)}" fill="none" stroke="${INK}" stroke-opacity=".4" stroke-width="2.4"/>` +
      `<path d="${outline}" fill="url(#cg)" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>` +
      // the circlet band: darker below, a bright strip on top, keyline between it and the spikes
      arcP(Rb - 1.3, -CROWN.half + 1.5, CROWN.half - 1.5, 1, "#fff6c2", 0.8) +
      arcP(Rb - 5.4, -CROWN.half + 1.5, CROWN.half - 1.5, 1.3, INK, 0.7) +
      `<path d="${ribs}" fill="none" stroke="#7a4f08" stroke-opacity=".7" stroke-width=".9" stroke-linecap="round"/>` +
      gems + pearls;
    return doc(body, defs);
  },
  glow: ({ ra }) => {
    const r1 = ra - 1.5, r2 = ra + 4.6;
    // one slow glint travelling round the rim metal
    const a = band("c1", r1 + 0.8, r2 - 0.8, 238, 15, 8, 0.8, "#fff7cc");
    const b = band("c2", r1 + 0.8, r2 - 0.8, 238.4, 3, 8, 1, "#ffffff");
    return doc(a.shape + b.shape, a.def + b.def);
  },
  glow2: ({ ra }) => {
    const [x, y] = pt(ra + 5.6, 0);
    return doc(`<path d="${sp(x, y, 8.5, 0.07)}" fill="#fff" fill-opacity=".95"/><path d="${sp(x, y, 4, 0.3)}" fill="#fff" fill-opacity=".8"/>`);
  },
};

// ============================================================ NEON
const neon = {
  id: "gen-neon",
  name: "Neon Duo",
  group: "Extras",
  of: 0.16,
  c: ["#ff3fa4", "#2de2f0"],
  fx: "pulse",
  fxs: 3.4,
  base: ({ ra }) => {
    const r1 = ra - 1.5, r2 = ra + 13.5;
    const rIn = ra + 3.4, rOut = ra + 9.8;
    // one glass tube: edge, body, a bright hot core, a specular streak; ends in dark caps at the gap
    const tube = (r, gapA, gapW, edge, body, core) => {
      const a0 = gapA + gapW / 2, a1 = gapA - gapW / 2 + 360;
      return (
        `<path d="${arc(r, a0, a1)}" fill="none" stroke="${edge}" stroke-width="5.2" stroke-linecap="round"/>` +
        `<path d="${arc(r, a0, a1)}" fill="none" stroke="${body}" stroke-width="3.5" stroke-linecap="round"/>` +
        `<path d="${arc(r, a0, a1)}" fill="none" stroke="${core}" stroke-width="1.5" stroke-linecap="round"/>` +
        `<path d="${arc(r - 1.1, 290, 20)}" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width=".8" stroke-linecap="round"/>`
      );
    };
    const endCap = (r, a) => at(r, a, `<rect x="-3.4" y="-2" width="6.8" height="4.2" rx="1.2" fill="#2a2038" stroke="#6a5a8a" stroke-width=".6"/><rect x="-1.4" y="2" width="2.8" height="1.6" fill="#8a7ab0"/>`, "rotate(90)");
    const clip = (a) => at((rIn + rOut) / 2, a, `<rect x="-3.4" y="-9.4" width="6.8" height="18.8" rx="1.8" fill="#8a84a0" stroke="#2a2438" stroke-width=".9"/><rect x="-3.4" y="-9.4" width="3.2" height="18.8" rx="1.4" fill="#d6d2e4" fill-opacity=".7"/><circle cy="-5.2" r="1.3" fill="#2a2438"/><circle cy="5.2" r="1.3" fill="#2a2438"/>`);
    const defs =
      lin("nb", [[0, "#2c1a56"], [1, "#0a0412"]], [40, 20, 160, 180]) +
      lin("nbs", [[0, "#fff", 0.16], [0.4, "#fff", 0], [1, INK, 0.3]], [30, 22, 172, 178]);
    const halo = (r, col) => [[12, 0.1], [8, 0.12]].map(([w, o]) => ring(r, w, col, o)).join("");
    const body =
      ring(r2 + 0.7, 2, INK, 0.95) +
      `<path d="${donut(r1, r2)}" fill="url(#nb)"/><path d="${donut(r1, r2)}" fill="url(#nbs)"/>` +
      ring(r2 - 1.2, 0.8, "#6a56a8", 0.7) + ring(r1 + 1.4, 0.8, "#6a56a8", 0.5) +
      halo(rOut, "#ff3fa4") + halo(rIn, "#2de2f0") +
      tube(rIn, 150, 9, "#0c6a84", "#22d4ea", "#d8fdff") + tube(rOut, 205, 8, "#8a0c56", "#ff3a9c", "#ffe0f0") +
      endCap(rIn, 150 + 4.5) + endCap(rIn, 150 - 4.5) + endCap(rOut, 205 + 4) + endCap(rOut, 205 - 4) +
      [48, 128, 284].map(clip).join("") +
      ring(r1 + 0.5, 1.4, INK, 0.7);
    return doc(body, defs);
  },
  glow: ({ ra }) => {
    const rIn = ra + 3.4, rOut = ra + 9.8;
    const halo = (r, col, hot) =>
      [[14, 0.2], [9.5, 0.3]].map(([w, o]) => ring(r, w, col, o)).join("") + ring(r, 2.2, hot, 0.55);
    return doc(halo(rOut, "#ff3fa4", "#ffd0ea") + halo(rIn, "#2de2f0", "#d0fbff"));
  },
};

// ============================================================ PIXEL
const pixel = {
  id: "gen-pixel",
  name: "Pixel Border",
  group: "Extras",
  of: 0.16,
  c: ["#9bbc0f", "#306230"],
  base: ({ ra }) => {
    const S = 5, N = 40;
    const inner = ra - 1, outer = ra + 19.8;
    const TONES = ["#0f380f", "#306230", "#8bac0f", "#9bbc0f"];
    const DARK = TONES[0];
    const key = (i, j) => `${i},${j}`;
    const dist = (x, y) => Math.hypot(x - 100, y - 100);
    const cell = new Set();
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const corners = [[i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]].map(([a, b]) => dist(a * S, b * S));
        if (Math.min(...corners) >= inner && dist(i * S + S / 2, j * S + S / 2) <= outer) cell.add(key(i, j));
      }
    }
    const colour = new Map();
    for (const k of cell) {
      const [i, j] = k.split(",").map(Number);
      const cx = i * S + S / 2, cy = j * S + S / 2, cd = dist(cx, cy);
      const edge = ![[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => cell.has(key(i + dx, j + dy)));
      if (edge) { colour.set(k, DARK); continue; }
      const lit = (-(cx - 100) - (cy - 100)) / cd / 1.4142;
      const t = (cd - inner) / (outer - inner);
      let L = lit > 0.5 ? 3 : lit > 0 ? 2 : 1;
      // a dithered join where one tone meets the next
      if ((Math.abs(lit - 0.5) < 0.13 || Math.abs(lit) < 0.13) && (i + j) % 2) L = Math.max(1, L - 1);
      if (t < 0.34) L = Math.max(1, L - 1);
      colour.set(k, TONES[L]);
    }
    // a specular dash on the lit side: every other pixel, on the middle row
    for (const k of cell) {
      const [i, j] = k.split(",").map(Number);
      const cx = i * S + S / 2, cy = j * S + S / 2, cd = dist(cx, cy);
      const lit = (-(cx - 100) - (cy - 100)) / cd / 1.4142, t = (cd - inner) / (outer - inner);
      if (lit > 0.78 && t > 0.4 && t < 0.62 && (i + j) % 2 === 0) colour.set(k, "#d4e68a");
    }
    // the hero: a pixel heart at the top right, outlined; a counterweight star at the bottom left
    const heart = [".X.X.", "XXXXX", "XXXXX", ".XXX.", "..X.."];
    const hi = new Set(["0,1", "1,0", "1,1"]), sh = new Set(["2,4", "3,3", "1,4", "4,2", "2,3"]);
    const hc = new Set();
    heart.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === "X") hc.add(key(32 + c, 2 + r)); }));
    for (const k of hc) { const [i, j] = k.split(",").map(Number); for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (!hc.has(key(i + dx, j + dy))) colour.set(key(i + dx, j + dy), DARK); }
    heart.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === "X") colour.set(key(32 + c, 2 + r), hi.has(`${r},${c}`) ? "#ffb8a0" : sh.has(`${r},${c}`) ? "#a02c3c" : "#e0584c"); }));
    const plus = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
    const pc = new Set(plus.map(([a, b]) => key(5 + a, 34 + b)));
    for (const k of pc) { const [i, j] = k.split(",").map(Number); for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (!pc.has(key(i + dx, j + dy))) colour.set(key(i + dx, j + dy), DARK); }
    for (const k of pc) colour.set(k, k === key(5, 34) ? "#e6f2a0" : TONES[3]);
    const paths = {};
    for (let j = 0; j < N; j++) {
      let i = 0;
      while (i < N) {
        const c = colour.get(key(i, j));
        if (!c) { i++; continue; }
        let k = i;
        while (colour.get(key(k + 1, j)) === c) k++;
        paths[c] = (paths[c] || "") + `M${i * S} ${j * S}h${(k - i + 1) * S}v${S}h${-(k - i + 1) * S}z`;
        i = k + 1;
      }
    }
    return doc(`<g shape-rendering="crispEdges">${Object.entries(paths).map(([c, d]) => `<path d="${d}" fill="${c}"/>`).join("")}</g>`);
  },
};

// ============================================================ SAKURA
const petal = "M0 0C-4.6-3-5.6-9.6-2.3-11.4L0-9.8L2.3-11.4C5.6-9.6 4.6-3 0 0Z";
const T = (x, y, rot, s) => `translate(${g(x)} ${g(y)}) rotate(${g(rot)}) scale(${s})`;
const PK = `fill="url(#sp)" stroke="#a83a64" stroke-opacity=".8" stroke-width=".6" stroke-linejoin="round"`;
const open = (x, y, s, rot) =>
  `<g transform="${T(x, y, rot, s)}"><g ${PK}>${[0, 72, 144, 216, 288].map((a, i) => `<path d="${petal}" transform="rotate(${a + (rnd(i + Math.round(x)) - 0.5) * 8}) scale(${g(0.94 + 0.12 * rnd(i + Math.round(y)))})"/>`).join("")}</g><circle r="1.7" fill="#c72a62"/><path d="M0 -1.4L0 -4.4M1.3 -.5L3.6 -1.8M-1.3 -.5L-3.6 -1.8M.8 1.2L2.2 3.4M-.8 1.2L-2.2 3.4" stroke="#ffd96a" stroke-width=".55" stroke-linecap="round"/></g>`;
const half = (x, y, s, rot) =>
  `<g transform="${T(x, y, rot, s)}"><g ${PK}><path d="${petal}" transform="rotate(-62) scale(.8)" fill="#e05a8a"/><path d="${petal}" transform="rotate(62) scale(.8)" fill="#e05a8a"/><path d="${petal}" transform="rotate(-30) scale(.95)"/><path d="${petal}" transform="rotate(30) scale(.95)"/><path d="${petal}" transform="scale(1.02)"/></g><circle cy="-1" r="1.3" fill="#c72a62"/></g>`;
const bud = (x, y, s, rot) =>
  `<g transform="${T(x, y, rot, s)}"><path d="M0 0C-3.6-2-3.8-7.4 0-10C3.8-7.4 3.6-2 0 0Z" fill="url(#sp)" stroke="#a83a64" stroke-opacity=".85" stroke-width=".7"/><path d="M0 0C-2.4-1-3-3.4-2.6-4.4C-1-3.6 0-2 0 0ZM0 0C2.4-1 3-3.4 2.6-4.4C1-3.6 0-2 0 0Z" fill="#7a2a3a" stroke="#4a1428" stroke-width=".4"/></g>`;
const sakura = {
  id: "gen-sakura",
  name: "Sakura Branch",
  group: "Extras",
  of: 0.22,
  c: ["#ffb3cf", "#8a5232"],
  fx: "fall",
  fxs: 5,
  fx2: "fall",
  fxs2: 7.3,
  fxd2: -3,
  base: ({ ra }) => {
    const rb = ra + 5.4;
    const wob = (d) => rb + 1.7 * Math.sin(rad(d * 2.3));
    const A0 = 158, A1 = 424;
    // the branch is one tapering shape: thick where it enters at the bottom, a twig by the top right
    const hw = (d) => 4.1 - 2.9 * ((d - A0) / (A1 - A0)) ** 0.8;
    const outerP = [], innerP = [];
    for (let d = A0; d <= A1 + 0.01; d += 3) { outerP.push(pt(wob(d) + hw(d), d)); innerP.push(pt(wob(d) - hw(d), d)); }
    const limb = P([...outerP, ...innerP.reverse()]);
    const twig = (d, dl, len, bend, w) => {
      const [x0, y0] = pt(wob(d), d), [x1, y1] = pt(rb + len, d + dl), [cx, cy] = pt(rb + len * 0.5, d + dl * 0.2 + bend);
      const D = `M${g(x0)} ${g(y0)}Q${g(cx)} ${g(cy)} ${g(x1)} ${g(y1)}`;
      return `<path d="${D}" fill="none" stroke="#2a1306" stroke-width="${w + 1.6}" stroke-linecap="round"/><path d="${D}" fill="none" stroke="url(#sw)" stroke-width="${w}" stroke-linecap="round"/>`;
    };
    const twigs = twig(228, -8, 17, -5, 2.6) + twig(262, 6, 18, 4, 2.4) + twig(300, -4, 16, -3, 2.2) + twig(196, 8, 13, 3, 2.2) + twig(345, 3, 13, -2, 1.8) + twig(18, 5, 11, 2, 1.5);
    const defs =
      lin("sw", [[0, "#b27646"], [0.5, "#744022"], [1, "#3a1c0a"]], [40, 20, 160, 180]) +
      lin("sp", [[0, "#d8386e"], [0.4, "#ff9cc0"], [1, "#fff0f6"]], [0, 0, 0, -11.4]);
    const bark = [[172, 214], [236, 262], [284, 318]].map(([a0, a1], i) => `<path d="${arc(wob(a0 + 20) + 0.6 - i * 0.2, a0 + 6, a1 - 12)}" fill="none" stroke="#2a1306" stroke-opacity=".5" stroke-width=".8" stroke-linecap="round"/>`).join("") +
      `<path d="${trace((d) => wob(d) + hw(d) - 1.1, A0 + 8, A1 - 30, 4)}" fill="none" stroke="#e0a874" stroke-opacity=".75" stroke-width=".9" stroke-linecap="round"/>`;
    const knot = (() => { const [x, y] = pt(wob(214), 214); return `<ellipse cx="${g(x)}" cy="${g(y)}" rx="2.2" ry="1.5" fill="#3a1c0a" stroke="#1c0c02" stroke-width=".5"/>`; })();
    const cl = (v) => Math.min(Math.max(v, 12), 188);
    const place = (fn, r, a, s, rot) => { const [x, y] = pt(rb + r, a); return fn(cl(x), cl(y), s, rot); };
    const blossoms =
      // the hero cluster at ten o'clock
      place(open, 13, 281, 1.3, 14) + place(half, 11, 303, 1, -22) + place(open, 14, 260, 1, 38) + place(bud, 9, 247, 1.1, -70) +
      place(bud, 8, 316, 1.1, 35) + place(half, 10, 327, 0.85, 30) +
      // the counterweight, smaller, at eight o'clock
      place(open, 11, 208, 0.95, 28) + place(half, 8, 190, 0.8, -50) + place(bud, 8, 224, 1, 120) +
      // and the twig tip
      place(bud, 7, 18, 1, 52) + place(open, 9, 392, 0.7, 10);
    return doc(`<path d="${limb}" fill="url(#sw)" stroke="#2a1306" stroke-width="1.5" stroke-linejoin="round"/>` + bark + twigs + knot + blossoms, defs);
  },
  glow: () => doc(fall(176, 74, 0.85, 40) + fall(184, 122, 0.7, -30) + fall(164, 164, 0.8, 110)),
  glow2: () => doc(fall(134, 186, 0.7, 70) + fall(104, 192, 0.6, -20) + fall(190, 96, 0.6, 130)),
};
function fall(x, y, s, r) {
  return `<g transform="${T(x, y, r, s)}"><path d="${petal}" fill="#ffc2da" stroke="#e0709a" stroke-opacity=".75" stroke-width=".6"/></g>`;
}

// ============================================================ STARRY
const POINTS_A = [[75, 250], [78.6, 261], [74.6, 273], [78.4, 286], [75, 298]]; // one constellation
const POINTS_B = [[78, 146], [74.8, 156], [78.4, 167], [75, 179], [78.4, 190], [75.6, 202]]; // another
const starry = {
  id: "gen-starry",
  name: "Starry Night",
  group: "Extras",
  of: 0.2,
  c: ["#3a2a9a", "#ffd75e"],
  fx: "pulse",
  fxs: 3.7,
  fx2: "pulse",
  fxs2: 5.3,
  fxd2: -2.1,
  base: ({ ra }) => {
    const r1 = ra - 1.5, r2 = ra + 10.5;
    const e0 = r1 + 2, e1 = r2 - 2.6; // the enamel lies between two thin gold edges
    const gold = [[0.3, "#7a4c0c"], [0.55, "#f6d46a"], [0.8, "#d7a032"], [1, "#6a420a"]];
    const wave = (ph, amp, freq, rr) => trace((d) => rr + amp * Math.sin(rad(d * freq + ph)), 0, 360, 5) + "Z";
    const defs =
      lin("mg", [[0, "#fff6bc"], [0.3, "#ffe27a"], [0.3, "#efc04a"], [0.62, "#d49a28"], [0.62, "#a8741a"], [1, "#6a420a"]], [-18, -18, 12, 18]) +
      lin("sg", [[0, "#fff1a0"], [0.5, "#ffd24a"], [1, "#c98a18"]], [40, 20, 160, 180]);
    const pts = (L) => L.map(([r, a]) => pt(r, a));
    const lines = (L) => `<path d="${P(pts(L), false)}" fill="none" stroke="#f0c85a" stroke-width=".9" stroke-linejoin="round" stroke-linecap="round" stroke-opacity=".95"/>`;
    const dots = (L, big) => pts(L).map(([x, y], i) => `<circle cx="${g(x)}" cy="${g(y)}" r="${i === big ? 2 : 1.4}" fill="#ffe9a0" stroke="#7a4c0c" stroke-width=".5"/>`).join("");
    const moon = (() => {
      const [x, y] = pt(r2 + 2, 38);
      return `<g transform="translate(${g(x)} ${g(y)}) rotate(-18) scale(1.5)">` +
        `<path d="M1.6 -15.4A16 16 0 1 0 1.6 17.4A21 21 0 0 1 1.6 -15.4Z" fill="${INK}" fill-opacity=".45"/>` +
        `<path d="M0 -16A16 16 0 1 0 0 16A21 21 0 0 1 0 -16Z" fill="url(#mg)" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>` +
        `<path d="M-3.4 -12A12.6 12.6 0 0 0 -3.4 12" fill="none" stroke="#fffbe0" stroke-opacity=".85" stroke-width="1.1" stroke-linecap="round"/>` +
        `<circle cx="-9.4" cy="-3" r="2" fill="#8a5a10" fill-opacity=".45"/><circle cx="-7.8" cy="7.4" r="1.5" fill="#8a5a10" fill-opacity=".45"/><circle cx="-11.4" cy="3" r="1" fill="#8a5a10" fill-opacity=".4"/></g>`;
    })();
    const compass = (() => {
      const [x, y] = pt(r2 - 2.4, 214);
      return `<path d="${sp(x + 0.8, y + 1, 10, 0.2)}" fill="${INK}" fill-opacity=".5"/><path d="${sp(x, y, 6.6, 0.3)}" transform="rotate(45 ${g(x)} ${g(y)})" fill="#d8a034" stroke="#5a3606" stroke-width=".6"/><path d="${sp(x, y, 10, 0.2)}" fill="url(#sg)" stroke="#5a3606" stroke-width=".9" stroke-linejoin="round"/><circle cx="${g(x)}" cy="${g(y)}" r="1.6" fill="#4a2e90" stroke="#5a3606" stroke-width=".5"/>`;
    })();
    const body =
      ring(r2 + 0.7, 2, INK, 0.95) +
      bands(e1, r2, gold) + bands(r1, e0, [[0.5, "#f6d46a"], [1, "#7a4c0c"]]) +
      // the enamel: a flat deep indigo cell, one lighter wave, one crisp specular crescent
      `<path d="${donut(e0, e1)}" fill="#241a6e"/>` +
      `<path d="${wave(0, 1.6, 7, (e0 + e1) / 2)}" fill="none" stroke="#4a3cae" stroke-width="1.3"/>` +
      arcP((e0 + e1) / 2 + 0.6, 296, 8, 1.2, "#8e80f4", 0.85) +
      arcP((e0 + e1) / 2 - 0.2, 112, 160, 1, "#0a0640", 0.8) +
      ring(e0, 0.7, INK, 0.7) + ring(e1, 0.7, INK, 0.7) + ring(r1 + 0.5, 1.4, INK, 0.7) +
      lines(POINTS_A) + lines(POINTS_B) + dots(POINTS_A, 2) + dots(POINTS_B, 1) +
      compass + moon;
    return doc(body, defs);
  },
  glow: () => {
    const f = (L, picks) => picks.map((i) => { const [x, y] = pt(...L[i]); return `<path d="${sp(x, y, 6.4, 0.07)}" fill="#fff6c8" fill-opacity=".95"/><path d="${sp(x, y, 3, 0.3)}" fill="#fff" fill-opacity=".9"/>`; }).join("");
    return doc(f(POINTS_A, [0, 2, 4]) + (() => { const [x, y] = pt(82 + 3.5 + 2, 22); return `<path d="${sp(x, y, 6, 0.1)}" fill="#fff6c8"/>`; })());
  },
  glow2: () => {
    const f = (L, picks) => picks.map((i) => { const [x, y] = pt(...L[i]); return `<path d="${sp(x, y, 6.4, 0.07)}" fill="#fff6c8" fill-opacity=".95"/><path d="${sp(x, y, 3, 0.3)}" fill="#fff" fill-opacity=".9"/>`; }).join("");
    const [cx, cy] = pt(80.9 - 2.4 + 0, 214);
    return doc(f(POINTS_B, [1, 3, 5]) + `<path d="${sp(cx, cy, 13, 0.06)}" fill="#fff6c8" fill-opacity=".9"/>`);
  },
};

export const frames = [laurel, crown, neon, pixel, sakura, starry];
void C; void rad;
