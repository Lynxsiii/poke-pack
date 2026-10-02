import { C, pt, arc, donut, around, lin, rg, spark, outline, gloss, doc, rad } from "../lib/frame-art.mjs";

/* ---------- helpers (one decimal, so busy frames stay under the size limit) ---------- */
const g = (n) => Math.round(n * 10) / 10;
const poly = (points, close = true) => `M${points.map(([x, y]) => `${g(x)} ${g(y)}`).join("L")}${close ? "Z" : ""}`;
const star = (cx, cy, R, r, n = 5, rot = 0) =>
  poly(Array.from({ length: n * 2 }, (_, i) => {
    const a = rad(rot + (i * 180) / n);
    const rr = i % 2 ? r : R;
    return [cx + rr * Math.sin(a), cy - rr * Math.cos(a)];
  }));
const at = (r, deg, inner, extra = "") => {
  const [x, y] = pt(r, deg);
  return `<g transform="translate(${g(x)} ${g(y)}) rotate(${g(deg)})${extra ? " " + extra : ""}">${inner}</g>`;
};
const sp = (x, y, R, w = 0.2) => spark(g(x), g(y), R, w);
function trace(rFn, a0, a1, step = 4) {
  let out = "";
  for (let d = a0, i = 0; d <= a1 + 0.001; d += step, i++) {
    const [x, y] = pt(rFn(d), d);
    out += `${i ? "L" : "M"}${g(x)} ${g(y)}`;
  }
  return out;
}
const leaf = (L, w) => `M0 0C${g(w * 1.1)} ${g(-L * 0.25)} ${g(w * 0.9)} ${g(-L * 0.7)} 0 ${g(-L)}C${g(-w * 0.9)} ${g(-L * 0.7)} ${g(-w * 1.1)} ${g(-L * 0.25)} 0 0Z`;
const circlePath = (r) => `M${g(C - r)} ${C}A${g(r)} ${g(r)} 0 1 0 ${g(C + r)} ${C}A${g(r)} ${g(r)} 0 1 0 ${g(C - r)} ${C}Z`;

// ============================================================ LAUREL
const laurel = {
  id: "gen-laurel",
  name: "Laurel Wreath",
  group: "Extras",
  of: 0.2,
  c: ["#f5d56a", "#b8801c"],
  base: ({ ra }) => {
    const rs = ra + 8;
    const A0 = 56;
    const A1 = 304;
    const defs =
      lin("lg", [[0, "#fff6bc"], [0.45, "#f0c23e"], [1, "#8e5e0a"]], [-6, -14, 6, 2]) +
      lin("ls", [[0, "#ffe27a"], [0.5, "#d9a22a"], [1, "#7a4f08"]], [40, 20, 160, 180]) +
      lin("lr", [[0, "#ff6a6a"], [1, "#a01428"]], [-6, -6, 6, 6]) +
      rg("lb", [[0, "#ff9a9a"], [0.6, "#d4283c"], [1, "#7a0f1e"]], [-1, -1.5, 3.2]);
    let leaves = "";
    const n = 17;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const deg = A0 + 12 + t * (A1 - A0 - 24);
      const left = deg > 180;
      const dir = left ? 1 : -1; // leaves grow from the bottom towards the open top
      const L = 16.5 - 3 * Math.abs(t - 0.5) * 2 * 0.5;
      const out = `<g transform="rotate(${dir * (90 - 40)})"><path d="${leaf(L, 6.4)}M0 0L0 ${g(-L * 0.82)}"/></g>`;
      const inn = `<g transform="rotate(${dir * (90 + 26)})"><path d="${leaf(L - 2.5, 5.2)}M0 0L0 ${g(-(L - 2.5) * 0.82)}"/></g>`;
      leaves += at(rs, deg, inn + out);
    }
    // the two ends: a terminal leaf and a cluster of berries
    const tips = [A0, A1].map((d, k) => at(rs, d, `<g transform="rotate(${k ? 28 : -28})"><path d="${leaf(14, 4.8)}M0 0L0 -11.5"/></g>`)).join("");
    const berries = [A0 + 5, A1 - 5].map((d) => {
      const [x, y] = pt(rs + 1, d);
      return `<circle cx="${g(x - 1.5)}" cy="${g(y)}" r="2.6" fill="url(#lb)"/><circle cx="${g(x + 2)}" cy="${g(y + 2.5)}" r="2.3" fill="url(#lb)"/><circle cx="${g(x + 1)}" cy="${g(y - 2.8)}" r="2.1" fill="url(#lb)"/>`;
    }).join("");
    const bow = at(rs + 1, 180, `<g transform="rotate(180)"><path d="M0 0C-3 7-12 11-15 5C-17-1-8-4 0 0Z" fill="url(#lr)" stroke="#5a0a18" stroke-width=".9" stroke-linejoin="round"/><path d="M0 0C3 7 12 11 15 5C17-1 8-4 0 0Z" fill="url(#lr)" stroke="#5a0a18" stroke-width=".9" stroke-linejoin="round"/><path d="M-1 3L-6 12L-2 10.5L0 14L1 3ZM1 3L6 12L2 10.5L0 14L-1 3Z" fill="url(#lr)" stroke="#5a0a18" stroke-width=".8" stroke-linejoin="round"/><circle cy="1.5" r="3" fill="url(#lb)" stroke="#5a0a18" stroke-width=".8"/></g>`);
    const body =
      `<path d="${arc(rs, A0, A1)}" fill="none" stroke="#3a2404" stroke-opacity=".75" stroke-width="3.8" stroke-linecap="round"/>` +
      `<path d="${arc(rs, A0, A1)}" fill="none" stroke="url(#ls)" stroke-width="2.4" stroke-linecap="round"/>` +
      `<g fill="url(#lg)" stroke="#5a3a06" stroke-opacity=".8" stroke-width=".75" stroke-linejoin="round">${leaves}${tips}</g>` +
      berries + bow;
    return doc(body, defs);
  },
};

// ============================================================ CROWN
const crown = {
  id: "gen-crown",
  name: "Gold Crown",
  group: "Extras",
  of: 0.24,
  c: ["#ffd95a", "#b8801c"],
  fx: "pulse",
  fxs: 2.8,
  base: ({ ra }) => {
    const r1 = ra - 1.5;
    const r2 = ra + 8;
    const rm = (r1 + r2) / 2;
    const yb = 100 - r2 + 8.6;
    const gems = [[50, "#e0283c", "#ff9aa0"], [92, "#2a6ae0", "#9ac4ff"], [136, "#1fb070", "#9af0c8"], [180, "#e0283c", "#ff9aa0"], [224, "#1fb070", "#9af0c8"], [268, "#2a6ae0", "#9ac4ff"], [310, "#e0283c", "#ff9aa0"]]
      .map(([d, c1, c2], i) => {
        const [x, y] = pt(rm, d);
        return `<circle cx="${g(x)}" cy="${g(y)}" r="3.5" fill="#4a3004" fill-opacity=".8"/><circle cx="${g(x)}" cy="${g(y)}" r="2.7" fill="${c1}" stroke="#2a1a02" stroke-opacity=".7" stroke-width=".6"/><circle cx="${g(x - 0.8)}" cy="${g(y - 0.9)}" r=".9" fill="${c2}"/>`;
      }).join("");
    const filigree = trace((d) => rm + 2.4 * Math.sin(rad(d * 14)), 0, 360, 5);
    const crownBody = `M-28 0L-30 -20L-20.5 -11L-14.5 -23L-7.5 -11L0 -27L7.5 -11L14.5 -23L20.5 -11L30 -20L28 0Z`;
    const balls = [[-30, -20, 2.7], [-14.5, -23, 2.5], [0, -27, 3.1], [14.5, -23, 2.5], [30, -20, 2.7]]
      .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#cp)" stroke="#6a4208" stroke-opacity=".8" stroke-width=".7"/>`).join("");
    const crownSvg =
      `<g transform="translate(100 ${g(yb)}) scale(1.28 .98)"><path d="${crownBody}" fill="url(#cg)" stroke="#4a2c04" stroke-width="1.4" stroke-linejoin="round"/>` +
      `<path d="M-25 -3L-27 -17L-20 -10L-14 -19L-8 -10M25 -3L27 -17L20 -10L14 -19L8 -10" fill="none" stroke="#fff6c0" stroke-opacity=".55" stroke-width=".8" stroke-linejoin="round"/>` +
      `<path d="M-28 0L28 0L28.6 -8L-28.6 -8Z" fill="url(#cb)" stroke="#4a2c04" stroke-width="1.2" stroke-linejoin="round"/>` +
      `<path d="M-27 -4Q0 -1.5 27 -4" fill="none" stroke="#fff6c0" stroke-opacity=".6" stroke-width=".8"/>` +
      balls +
      `<path d="M0 -4.2L3.6 -1.8L0 0.6L-3.6 -1.8Z" fill="#e0283c" stroke="#3a0a10" stroke-width=".7" transform="translate(0 -9.5) scale(1.1)"/>` +
      `<circle cx="-16" cy="-4" r="2" fill="#2a6ae0" stroke="#10285a" stroke-width=".6"/><circle cx="16" cy="-4" r="2" fill="#1fb070" stroke="#0a3a24" stroke-width=".6"/><circle cx="0" cy="-4" r="2.6" fill="#e0283c" stroke="#3a0a10" stroke-width=".6"/><circle cx="-.8" cy="-5" r=".8" fill="#ffb0b6"/></g>`;
    const defs =
      lin("cg", [[0, "#fff4b0"], [0.4, "#f2c230"], [1, "#9a640a"]], [-30, -28, 30, 2]) +
      lin("cb", [[0, "#ffe27a"], [0.5, "#d9a22a"], [1, "#7a4f08"]], [0, -8, 0, 0]) +
      lin("cr", [[0, "#fff1a0"], [0.4, "#efbd2e"], [1, "#8a5808"]], [40, 20, 160, 180]) +
      rg("cp", [[0, "#ffffff"], [0.7, "#f6e8c0"], [1, "#b8a070"]], [-0.8, -0.8, 3.4]);
    const body =
      outline(r2 + 0.2, 1.5, "#2a1802", 0.7) +
      `<path d="${donut(r1, r2)}" fill="url(#cr)"/>` +
      `<path d="${filigree}Z" fill="none" stroke="#7a4f08" stroke-opacity=".6" stroke-width=".9"/>` +
      `<path d="${arc(r2 - 1.5, 0, 359.9)}" fill="none" stroke="#fff6c0" stroke-opacity=".5" stroke-width=".7"/>` +
      gems +
      gloss(r2 - 2.2, 1.6, 290, 22, 0.55, "#fffbe0") +
      outline(r1 + 0.4, 1.4, "#2a1802", 0.65) +
      crownSvg;
    return doc(body, defs);
  },
  glow: ({ ra }) => {
    const yb = 100 - (ra + 8) + 8.6;
    const pts = [[100, yb - 24, 4.4], [70, yb - 22, 3.2], [130, yb - 22, 3.2], [100 + 80, 100, 3.6], [100 - 80, 100, 3.6], [100, 100 + 82, 3.4]];
    return doc(pts.map(([x, y, s]) => `<path d="${sp(x, y, s * 1.5, 0.18)}" fill="#fffbe0"/>`).join(""));
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
  fxs: 2.6,
  base: ({ ra }) => {
    const r1 = ra - 1.5;
    const r2 = ra + 13.5;
    const rIn = ra + 3.4;
    const rOut = ra + 10;
    const tube = (r, c1, c2) =>
      `<circle cx="100" cy="100" r="${g(r)}" fill="none" stroke="#0a0412" stroke-opacity=".85" stroke-width="5.6"/>` +
      `<circle cx="100" cy="100" r="${g(r)}" fill="none" stroke="url(#${c1})" stroke-width="3.4"/>` +
      `<circle cx="100" cy="100" r="${g(r)}" fill="none" stroke="#fff" stroke-opacity=".85" stroke-width="1.1"/>` +
      `<path d="${arc(r - 0.6, 288, 18)}" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width=".8" stroke-linecap="round"/>`;
    const clip = (d) => at((rIn + rOut) / 2, d, `<rect x="-3" y="-8.5" width="6" height="17" rx="1.6" fill="#1b1030" stroke="#5a4a80" stroke-width=".8"/><circle cy="-4" r="1" fill="#8a7ab0"/><circle cy="4" r="1" fill="#8a7ab0"/>`);
    const defs =
      lin("nb", [[0, "#2a1450"], [1, "#0a0412"]], [40, 20, 160, 180]) +
      lin("np", [[0, "#ff9ad0"], [0.5, "#ff2f9a"], [1, "#c00a70"]], [40, 20, 160, 180]) +
      lin("nc", [[0, "#b8fbff"], [0.5, "#2de2f0"], [1, "#0a8aa8"]], [40, 20, 160, 180]);
    const body =
      outline(r2 + 0.2, 1.4, "#05020a", 0.75) +
      `<path d="${donut(r1, r2)}" fill="url(#nb)"/>` +
      `<path d="${arc(r2 - 1, 0, 359.9)}" fill="none" stroke="#5a3a9a" stroke-opacity=".6" stroke-width=".8"/>` +
      tube(rIn, "nc") + tube(rOut, "np") +
      [45, 135, 225, 315].map(clip).join("") +
      outline(r1 + 0.4, 1.4, "#05020a", 0.7);
    return doc(body, defs);
  },
  glow: ({ ra }) => {
    const rIn = ra + 3.4;
    const rOut = ra + 10;
    const halo = (r, col) => [[11, 0.22], [7.5, 0.3]].map(([w, o]) => `<circle cx="100" cy="100" r="${g(r)}" fill="none" stroke="${col}" stroke-opacity="${o}" stroke-width="${w}"/>`).join("");
    return doc(halo(rOut, "#ff3fa4") + halo(rIn, "#2de2f0"));
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
    const S = 5;
    const N = 40;
    const inner = ra - 1.5;
    const outer = ra + 16.5;
    const DARK = "#0f380f";
    const MID = "#306230";
    const LIGHT = "#8bac0f";
    const HI = "#9bbc0f";
    const cell = new Map();
    const key = (i, j) => `${i},${j}`;
    const dist = (x, y) => Math.hypot(x - 100, y - 100);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const corners = [[i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]].map(([a, b]) => dist(a * S, b * S));
        const cd = dist(i * S + S / 2, j * S + S / 2);
        if (Math.min(...corners) >= inner && cd <= outer) cell.set(key(i, j), true);
      }
    }
    const colour = new Map();
    for (const k of cell.keys()) {
      const [i, j] = k.split(",").map(Number);
      const cx = i * S + S / 2;
      const cy = j * S + S / 2;
      const cd = dist(cx, cy);
      const lit = (-(cx - 100) - (cy - 100)) / cd / 1.4142; // 1 = top left
      const t = (cd - inner) / (outer - inner);
      const row = t < 0.3 ? 0 : t > 0.72 ? 2 : 1;
      let c;
      if (lit > 0.1) c = [LIGHT, HI, LIGHT][row];
      else if (lit > -0.35) c = [MID, LIGHT, MID][row];
      else c = [DARK, MID, MID][row];
      if (row === 1 && (i + j) % 4 === 0) c = c === HI ? LIGHT : c === LIGHT ? HI : MID === c ? DARK : c;
      colour.set(k, c);
    }
    // little pixel sparkles outside the ring, at the diagonals
    const plus = (ci, cj, arm, c) => {
      for (let d = -arm; d <= arm; d++) {
        colour.set(key(ci + d, cj), c);
        colour.set(key(ci, cj + d), c);
      }
    };
    for (const [ci, cj] of [[4, 4], [35, 4], [4, 35], [35, 35]]) plus(ci, cj, 2, DARK);
    for (const [ci, cj] of [[4, 4], [35, 4], [4, 35], [35, 35]]) plus(ci, cj, 1, HI);
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
    const body = `<g shape-rendering="crispEdges">${Object.entries(paths).map(([c, d]) => `<path d="${d}" fill="${c}"/>`).join("")}</g>`;
    return doc(body);
  },
};

// ============================================================ SAKURA
const petal = "M0 0C-4.6-3-5.6-9.6-2.3-11.4L0-9.8L2.3-11.4C5.6-9.6 4.6-3 0 0Z";
const blossom = (x, y, s, rot) =>
  `<g transform="translate(${g(x)} ${g(y)}) rotate(${rot}) scale(${s})"><g fill="url(#sp)" stroke="#b8446e" stroke-opacity=".75" stroke-width=".55" stroke-linejoin="round"><path d="${petal}"/><path d="${petal}" transform="rotate(72)"/><path d="${petal}" transform="rotate(144)"/><path d="${petal}" transform="rotate(216)"/><path d="${petal}" transform="rotate(288)"/></g><circle r="1.5" fill="#d8386e"/><path d="M0 -1.4L0 -4M1.2 -.5L3.4 -1.6M-1.2 -.5L-3.4 -1.6M.7 1.2L2 3.2M-.7 1.2L-2 3.2" stroke="#ffd96a" stroke-width=".5" stroke-linecap="round"/></g>`;
const sakura = {
  id: "gen-sakura",
  name: "Sakura Branch",
  group: "Extras",
  of: 0.22,
  c: ["#ffb3cf", "#8a5232"],
  fx: "drift",
  fxs: 4.4,
  base: ({ ra }) => {
    const rb = ra + 4.4;
    const wob = (d) => rb + 1.6 * Math.sin(rad(d * 2.4));
    const seg = (a0, a1, w) => `<path d="${trace(wob, a0, a1, 3)}" fill="none" stroke="#2e1608" stroke-opacity=".8" stroke-width="${w + 1.6}" stroke-linecap="round" stroke-linejoin="round"/><path d="${trace(wob, a0, a1, 3)}" fill="none" stroke="url(#sw)" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
    const twig = (d, dl, len, bend) => {
      const [x0, y0] = pt(wob(d), d);
      const [x1, y1] = pt(rb + len, d + dl);
      const [cx, cy] = pt(rb + len * 0.5, d + dl * 0.2 + bend);
      return `<path d="M${g(x0)} ${g(y0)}Q${g(cx)} ${g(cy)} ${g(x1)} ${g(y1)}" fill="none" stroke="#2e1608" stroke-opacity=".8" stroke-width="3.2" stroke-linecap="round"/><path d="M${g(x0)} ${g(y0)}Q${g(cx)} ${g(cy)} ${g(x1)} ${g(y1)}" fill="none" stroke="url(#sw)" stroke-width="1.8" stroke-linecap="round"/>`;
    };
    const twigs = twig(232, -6, 15, -4) + twig(268, 4, 16, 3) + twig(306, -2, 15, -3) + twig(200, 8, 12, 2);
    const blossoms = [
      [pt(rb + 14.5, 224), 1.0, 10], [pt(rb + 15, 270), 0.95, 40], [pt(rb + 14, 306), 1.05, -20], [pt(rb + 10.5, 205), 0.8, 25],
      [pt(rb + 9, 188), 0.75, 15], [pt(rb + 12, 247), 1.1, -12], [pt(rb + 9, 286), 0.9, 30], [pt(rb + 10, 330), 0.85, 50],
    ].map(([[x, y], s, r]) => blossom(Math.min(Math.max(x, 14), 186), Math.min(Math.max(y, 14), 186), s, r)).join("");
    const buds = [[pt(rb + 7, 258), 2.3], [pt(rb + 7, 298), 2], [pt(rb + 8, 320), 2.2]].map(([[x, y], r]) => `<circle cx="${g(x)}" cy="${g(y)}" r="${r}" fill="url(#sp)" stroke="#b8446e" stroke-opacity=".8" stroke-width=".6"/>`).join("");
    const defs =
      lin("sw", [[0, "#a86a3c"], [0.5, "#6a3a1c"], [1, "#3a1c0a"]], [40, 20, 160, 180]) +
      lin("sp", [[0, "#e0407a"], [0.45, "#ff9cc0"], [1, "#fff0f6"]], [0, 0, 0, -11.4]);
    const wire = `<path d="${arc(rb, 14, 168)}" fill="none" stroke="#7a2a48" stroke-opacity=".55" stroke-width="2.2" stroke-linecap="round"/><path d="${arc(rb, 14, 168)}" fill="none" stroke="#ffc6da" stroke-opacity=".7" stroke-width=".9" stroke-linecap="round"/>`;
    const body =
      wire +
      seg(176, 250, 5.4) + seg(246, 292, 4.2) + seg(288, 340, 3) +
      twigs +
      `<path d="${arc(rb - 3.2, 180, 342)}" fill="none" stroke="#1a0a02" stroke-opacity=".5" stroke-width="1"/>` +
      blossoms + buds;
    return doc(body, defs);
  },
  glow: ({ ra }) => {
    const fall = (x, y, s, r) => `<g transform="translate(${x} ${y}) rotate(${r}) scale(${s})"><path d="${petal}" fill="#ffc2da" stroke="#e0709a" stroke-opacity=".7" stroke-width=".6"/></g>`;
    return doc(fall(178, 112, 0.9, 40) + fall(166, 158, 0.8, -30) + fall(128, 184, 0.7, 70) + fall(184, 70, 0.7, 120) + fall(176, 138, 0.6, 10));
  },
};

// ============================================================ STARRY
const starry = {
  id: "gen-starry",
  name: "Starry Night",
  group: "Extras",
  of: 0.2,
  c: ["#3a2a9a", "#ffd75e"],
  fx: "pulse",
  fxs: 3,
  base: ({ ra }) => {
    const r1 = ra - 1.5;
    const r2 = ra + 9.5;
    const rm = (r1 + r2) / 2;
    const swirl = (ph, amp, freq) => trace((d) => rm + amp * Math.sin(rad(d * freq + ph)), 0, 360, 5) + "Z";
    const specks = around(26, (d, i) => {
      const [x, y] = pt(r1 + 2.2 + ((i * 7) % 6) * 1.2, d + (i % 3) * 3);
      return `<circle cx="${g(x)}" cy="${g(y)}" r="${i % 4 === 0 ? 0.9 : 0.55}"/>`;
    }, 4);
    const moon = at(r2 + 2, 36, `<g transform="rotate(-16)"><path d="M0 -16A16 16 0 1 0 0 16A21 21 0 0 1 0 -16Z" fill="url(#mg)" stroke="#6a4208" stroke-width="1.1" stroke-linejoin="round"/><path d="M-3.5 -12A12.5 12.5 0 0 0 -3.5 12" fill="none" stroke="#fffbe0" stroke-opacity=".8" stroke-width="1" stroke-linecap="round"/></g>`);
    const stars = [[-30, 8, 6.2], [-72, 6, 4.8], [96, 5, 5.4], [150, 6, 4.6], [-130, 5, 5.2], [10, 7, 3.8]].map(([d, e, R]) => {
      const [x, y] = pt(r2 + e + R * 0.4, d);
      return `<path d="${star(x, y, R, R * 0.42, 5, d)}"/>`;
    }).join("");
    const defs =
      rg("ig", [[0, "#5a46c8"], [0.55, "#2a1e86"], [1, "#0e0a3c"]], [C, C, r2]) +
      lin("mg", [[0, "#fff6b8"], [0.5, "#ffd75e"], [1, "#b8801c"]], [-16, -16, 8, 16]) +
      lin("sg", [[0, "#fff1a0"], [0.5, "#ffd24a"], [1, "#d89a1c"]], [40, 20, 160, 180]) +
      lin("ig2", [[0, "#7a66e8"], [1, "#150e50"]], [40, 20, 160, 180]);
    const body =
      outline(r2 + 0.2, 1.4, "#070320", 0.7) +
      `<path d="${donut(r1, r2)}" fill="url(#ig)"/>` +
      `<path d="${donut(r1, r2)}" fill="url(#ig2)" fill-opacity=".45"/>` +
      `<path d="${swirl(0, 2.4, 9)}" fill="none" stroke="#8a78f0" stroke-opacity=".55" stroke-width="1.1"/><path d="${swirl(90, 2.4, 9)}" fill="none" stroke="#c0b4ff" stroke-opacity=".35" stroke-width=".8"/>` +
      `<g fill="#fff3b8">${specks}</g>` +
      `<path d="${arc(r2 - 1.2, 0, 359.9)}" fill="none" stroke="#ffd75e" stroke-opacity=".75" stroke-width=".9"/><path d="${arc(r1 + 1.2, 0, 359.9)}" fill="none" stroke="#ffd75e" stroke-opacity=".5" stroke-width=".7"/>` +
      gloss(r2 - 2.6, 1.5, 290, 22, 0.35, "#c8bcff") +
      outline(r1 + 0.4, 1.4, "#070320", 0.65) +
      `<g fill="url(#sg)" stroke="#6a4208" stroke-width=".8" stroke-linejoin="round">${stars}</g>` +
      moon;
    return doc(body, defs);
  },
  glow: ({ ra }) => {
    const r2 = ra + 9.5;
    const s = [[-30, 8, 6.2], [-72, 6, 4.8], [96, 5, 5.4], [150, 6, 4.6], [-130, 5, 5.2], [10, 7, 3.8]];
    return doc(s.map(([d, e, R]) => {
      const [x, y] = pt(r2 + e + R * 0.4, d);
      return `<path d="${sp(x, y, R * 1.55, 0.14)}" fill="#fff6c8" fill-opacity=".9"/>`;
    }).join(""));
  },
};

export const frames = [laurel, crown, neon, pixel, sakura, starry];
