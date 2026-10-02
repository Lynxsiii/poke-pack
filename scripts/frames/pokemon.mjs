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

/* ---- the frames ------------------------------------------------------------ */

export const frames = [
  {
    id: "mon-pikachu",
    name: "Pikachu",
    group: "Pokémon",
    of: 0.24,
    c: ["#ffd530", "#e23a2e"],
    fx: "pulse",
    fxs: 2.6,
    base: ({ ra }) => {
      const r1 = ra - 1.5, r2 = ra + 10, rm = (r1 + r2) / 2;
      const ear = "M-12 4C-15 -12 -7 -30 3 -41C10 -27 16 -10 12 4Z";
      const tip = "M-3.4 -22C-1 -25 1 -28 3 -31C4.4 -28 5.6 -25.6 6.6 -22.4Z";
      let defs = diag("pb", [[0, "#fff3a0"], [0.45, "#ffd42a"], [1, "#d99a0a"]]) + tubeDefs(r1, r2) +
        lin("pe", [[0, "#ffd42a"], [0.56, "#ffe86e"], [0.6, "#17120c"], [1, "#0c0a08"]], [...pt(72, 26), ...pt(110, 26)]) +
        lin("pe2", [[0, "#ffd42a"], [0.56, "#ffe86e"], [0.6, "#17120c"], [1, "#0c0a08"]], [...pt(72, -26), ...pt(110, -26)]) +
        bb("pc", [[0, "#ff8a72"], [0.6, "#e8362b"], [1, "#a8180f"]]) +
        outward("pt", [[0, "#6d3f17"], [0.16, "#8a5524"], [0.2, "#ffe058"], [1, "#e9a812"]], 70, 118, 135);
      const ears = [-27, 27]
        .map((d) => {
          const flip = d < 0;
          return ink(shape(r2 - 6, d, ear, 0.92, flip), "#f6c71f") + `<path d="${shape(r2 - 6, d, ear, 0.92, flip)}" fill="url(#pe${flip ? "2" : ""})"/>` +
            `<path d="${shape(r2 - 6, d, "M-6 -4C-8 -14 -4 -26 1 -34", 0.92, flip)}" fill="none" stroke="#fff6bf" stroke-opacity=".7" stroke-width="1.1" stroke-linecap="round"/>`;
        })
        .join("");
      // the tail: a zigzag lightning bolt standing out of the lower right, brown at its root
      const bolt = "M-5 -50L19 -50L6 -29L19 -29L-13 6L-4 -22L-14 -22Z";
      const tail = ink(shape(r2 - 3, 135, bolt, 0.88), "url(#pt)", 1.4, 0.72) +
        `<path d="${shape(r2 - 3, 137, "M12 -46L-2 -27M-2 -25L-9 -12", 0.88)}" fill="none" stroke="#fff7c2" stroke-opacity=".75" stroke-width="1.1" stroke-linecap="round"/>`;
      const stripes = [214, 226].map((d) => `<path d="${sector(r1 + 1.5, r2 - 1.5, d, d + 5)}" fill="#7a4a18" fill-opacity=".62"/>`).join("");
      const cheeks = [90, 270]
        .map((d) => at(rm + 0.5, d, `<ellipse rx="8.4" ry="6.2" fill="${INK}" fill-opacity=".35" transform="translate(.6 .8)"/><ellipse rx="8" ry="6" fill="url(#pc)" stroke="#6e0d08" stroke-opacity=".5" stroke-width=".8"/><ellipse cx="-2.6" cy="-2.2" rx="2.8" ry="1.3" fill="#fff" fill-opacity=".6" transform="rotate(-24 -2.6 -2.2)"/>`))
        .join("");
      return doc(ears + tail + bandFor(r1, r2, "pb") + stripes + tube(r1, r2) + finish(r1, r2, { hl: "#fffbe0" }) + cheeks, defs);
    },
    glow: ({ ra }) => {
      const r2 = ra + 10;
      // sparks of static off the cheeks and the tail tip
      const zap = (d, r, s) => at(r, d, `<path d="M${f(1.4 * s)} ${f(-6 * s)}L${f(-2.6 * s)} ${f(-0.6 * s)}L${f(0)} ${f(-0.6 * s)}L${f(-1.4 * s)} ${f(5 * s)}L${f(2.8 * s)} ${f(-1.6 * s)}L${f(0.2 * s)} ${f(-1.6 * s)}Z" fill="#fff6a8" stroke="#ffb400" stroke-width=".6" stroke-linejoin="round"/>`);
      return doc(zap(66, r2 + 11, 1.6) + zap(300, r2 + 10, 1.5) + zap(104, r2 + 16, 1.1) + zap(180, r2 + 10, 1.2));
    },
  },

  {
    id: "mon-eevee",
    name: "Eevee",
    group: "Pokémon",
    of: 0.24,
    c: ["#b97a45", "#f3e2b8"],
    base: ({ ra }) => {
      const r1 = ra - 1.5, r2 = ra + 10, rm = (r1 + r2) / 2;
      const defs =
        lin("eb", [[0, "#cf9158"], [0.42, "#a96b3a"], [0.56, "#ecd8ac"], [1, "#fff4d4"]], [0, 0, 0, 200]) +
        tubeDefs(r1, r2) +
        outward("ee", [[0, "#c58850"], [0.7, "#a9693a"], [1, "#6b3f1e"]], 72, 116, 33) +
        outward("ee2", [[0, "#c58850"], [0.7, "#a9693a"], [1, "#6b3f1e"]], 72, 116, -33);
      const ear = "M-12 6C-15 -9 -8 -23 -1 -33C7 -22 15 -9 12 6Z";
      const inner = "M-6.5 2C-8 -9 -4.5 -19 -0.5 -27C3.5 -18 8 -9 6.5 2Z";
      const ears = [-33, 33]
        .map((d) => {
          const fl = d < 0;
          return ink(shape(r2 - 6, d, ear, 1.22, fl), `url(#ee${fl ? "2" : ""})`) + `<path d="${shape(r2 - 6, d, inner, 1.22, fl)}" fill="#3d2112" fill-opacity=".92"/>` +
            `<path d="${shape(r2 - 6, d, "M-9 -2C-10 -10 -6 -19 -1 -28", 1.22, fl)}" fill="none" stroke="#f0c796" stroke-opacity=".7" stroke-width="1.1" stroke-linecap="round"/>`;
        })
        .join("");
      const puffs = (n, off, rr, rs, dl) => `<g stroke="${INK}" stroke-opacity=".5" stroke-width=".9">` + around(n, (d, i) => {
          const a = d % 360;
          const k = rnd(i * 3 + dl);
          const collar = Math.max(0, Math.min(1, (Math.cos(rad(a)) * -1 - 0.1) * 3));
          const [x, y] = pt(rr + collar * 2.5, a + (k - 0.5) * 3);
          const t = Math.max(0, Math.min(1, (y - 98) / 26));
          const col = mix(mix("#c88c55", "#b07040", k), mix("#f1deb2", "#fff3d2", k), t);
          return `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1((rs + collar * 2.6) * (0.92 + k * 0.16))}" fill="${col}"/>`;
        }, off) + "</g>";
      const body = puffs(28, 6, r2 + 1.6, 8.6, 0) + puffs(28, 0, r2 + 0.2, 7, 40) + `<path d="${donut(r1, r2)}" fill="url(#eb)"/>` ;
      // soft fur strokes along the band
      const fur = around(30, (d, i) => `<path d="${shape(rm, d + 3, `M-1.4 2.6Q0 -0.5 ${f(1.4 - rnd(i) * 1.6)} -3.4`)}" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width=".9" stroke-linecap="round"/>`, 4);
      return doc(ears + body + tube(r1, r2) + finish(r1, r2, { hl: "#fff4de" }), defs);
    },
  },
  {
    id: "mon-jigglypuff",
    name: "Jigglypuff",
    group: "Pokémon",
    of: 0.22,
    c: ["#ff9fc6", "#2fb6c0"],
    base: ({ ra }) => {
      const r1 = ra - 1.5, r2 = ra + 11, rm = (r1 + r2) / 2;
      const defs =
        diag("jb", [[0, "#ffe0ec"], [0.45, "#ffa8cb"], [1, "#e46a9d"]]) + tubeDefs(r1, r2) +
        outward("je", [[0, "#ffa8cb"], [1, "#ffd6e6"]], 70, 106, 36) +
        outward("je2", [[0, "#ffa8cb"], [1, "#ffd6e6"]], 70, 106, -36) +
        lin("jc", [[0, "#ffd8e8"], [1, "#f27fae"]], [90, 8, 130, 40]) +
        bb("jy", [[0, "#c6fff4"], [0.45, "#37cfc9"], [1, "#0f7f9c"]], 0.4, 0.3, 0.8);
      const ear = "M-11 4C-11 -9 -6 -21 0 -30C7 -21 12 -9 11 4Z";
      const einner = "M-5.5 0C-5.5 -8 -3 -15 0 -21C3.5 -14 6 -8 5.5 0Z";
      const ears = [-36, 36]
        .map((d) => {
          const fl = d < 0;
          return ink(shape(r2 - 6, d, ear, 1.15, fl), `url(#je${fl ? "2" : ""})`) + `<path d="${shape(r2 - 6, d, einner, 1.15, fl)}" fill="#46356f"/><path d="${shape(r2 - 6, d, "M-5.2 -1C-5.2 -8 -3 -14 0 -19", 1.15, fl)}" fill="none" stroke="#7a68b0" stroke-width="1" stroke-linecap="round"/>`;
        })
        .join("");
      const curl = (p, w) => `<path d="${p}" fill="none" stroke="${INK}" stroke-opacity=".6" stroke-width="${w + 2.4}" stroke-linecap="round"/><path d="${p}" fill="none" stroke="url(#jc)" stroke-width="${w}" stroke-linecap="round"/><path d="${p}" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="${f(w * 0.2)}" stroke-linecap="round" transform="translate(-.9 -.9)"/>`;
      const curls = curl("M100 26C100 15 108 8 117 10C125 12 127 22 120 25C114 27 110 21 114 18", 6.6) + curl("M98 26C96 18 89 14 83 17C79 20 81 26 87 25", 4.6);
      const eyes = [90, 270]
        .map((d) => at(rm + 2.4, d, `<ellipse rx="9.6" ry="7.6" fill="${INK}" fill-opacity=".55"/><ellipse rx="8.6" ry="6.8" fill="#f4fffd"/><ellipse cx="0" cy="-0.4" rx="7.4" ry="6" fill="url(#jy)"/><ellipse cx="0.4" cy="0.2" rx="3.4" ry="3.2" fill="#0b2a44"/><circle cx="-2.4" cy="-2.2" r="1.7" fill="#fff"/><circle cx="2.4" cy="2" r=".8" fill="#fff" fill-opacity=".8"/><path d="M-8.6 -2.4Q0 -9.6 8.6 -2.4" fill="none" stroke="${INK}" stroke-opacity=".6" stroke-width="1.1"/>`))
        .join("");
      return doc(ears + `<path d="${donut(r1, r2)}" fill="url(#jb)"/>` + tube(r1, r2) + finish(r1, r2, { hl: "#fff0f6" }) + curls + eyes, defs);
    },
  },
  {
    id: "mon-gengar",
    name: "Gengar",
    group: "Pokémon",
    of: 0.24,
    c: ["#7a55c4", "#e23a58"],
    fx: "drift",
    fxs: 4,
    base: ({ ra }) => {
      const r1 = ra - 1.5, r2 = ra + 10.5, rm = (r1 + r2) / 2;
      const defs =
        diag("gb", [[0, "#b79cf0"], [0.45, "#7d58c8"], [1, "#3b2780"]]) + tubeDefs(r1, r2, 0.4, 0.4) +
        outward("gs", [[0, "#5a3aa8"], [1, "#8f6cdc"]], 72, 116, 34) + outward("gs2", [[0, "#5a3aa8"], [1, "#8f6cdc"]], 72, 116, -34) +
        lin("gt", [[0, "#fff"], [1, "#d9d2ee"]], [0, 90, 0, 110]) +
        lin("gm", [[0, "#1a0626"], [1, "#4a1048"]], [0, 90, 0, 190]);
      const ear = "M-11 5C-11 -10 -6 -26 -2 -39C5 -26 12 -10 11 5Z";
      const ears = [-34, 34].map((d) => ink(shape(r2 - 6, d, ear, 1.12, d < 0), `url(#gs${d < 0 ? "2" : ""})`) + `<path d="${shape(r2 - 6, d, "M-5.5 -1C-5.5 -12 -3 -24 -1 -33", 1.12, d < 0)}" fill="none" stroke="#e9deff" stroke-opacity=".55" stroke-width="1.1" stroke-linecap="round"/>`).join("");
      const spike = "M-6 4C-6 -4 -2 -9 1 -13C4 -8 7 -3 6.5 4Z";
      const spikes = [[56, 1.55], [74, 1.5], [91, 1.25], [269, 1.25], [286, 1.5], [304, 1.55], [118, 0.9], [242, 0.9]].map(([d, k]) => ink(shape(r2 - 3, d, spike, k, d > 180), `url(#gs${d > 180 ? "2" : ""})`)).join("");
      // the grin: a dark mouth swelling out under the band, fangs meshing across it
      const a0 = 128, a1 = 232, n = 8, st = (a1 - a0) / n, rb = r2 + 11;
      const tri = (pa, pb, tip) => `<path d="${poly([pa, pb, tip])}" fill="url(#gt)" stroke="#2a0e4a" stroke-opacity=".6" stroke-width=".6" stroke-linejoin="round"/>`;
      let mouth = `<path d="${sector(r2 - 2, rb, a0, a1)}" fill="url(#gm)" stroke="${INK}" stroke-opacity=".6" stroke-width="1.2" stroke-linejoin="round"/>`;
      for (let i = 0; i < n; i++) {
        const a = a0 + i * st;
        mouth += tri(pt(r2 - 1.5, a + 1), pt(r2 - 1.5, a + st - 1), pt(r2 + 7.2, a + st / 2));
        if (i < n - 1) mouth += tri(pt(rb - 0.8, a + st / 2 + 1), pt(rb - 0.8, a + st * 1.5 - 1), pt(rb - 7.6, a + st));
      }
      return doc(ears + spikes + mouth + `<path d="${donut(r1, r2)}" fill="url(#gb)"/>` + tube(r1, r2) + finish(r1, r2, { hl: "#efe6ff" }), defs);
    },
    glow: ({ ra }) => {
      const r2 = ra + 10.5;
      const wisp = (d, r, s) => at(r, d, `<path d="M0 3C-3 -1 -3 -5 0 -9C1 -5 3 -3 3 0C3 2 1.5 3 0 3Z" fill="#c9a8ff" fill-opacity=".85" transform="scale(${s})"/>`);
      const eye = (d, r) => at(r, d, `<path d="M-2.4 0Q0 -2.4 2.4 0Q0 1.4 -2.4 0Z" fill="#ff5a6e"/>`);
      return doc(wisp(28, r2 + 6, 1.3) + wisp(333, r2 + 8, 1) + wisp(88, r2 + 5, 0.9) + wisp(268, r2 + 6, 1.1) + wisp(160, r2 + 4, 0.7));
    },
  },
  {
    id: "mon-umbreon",
    name: "Umbreon",
    group: "Pokémon",
    of: 0.22,
    c: ["#1d1e30", "#ffd84a"],
    fx: "pulse",
    fxs: 3.2,
    base: ({ ra }) => {
      const r1 = ra - 1.5, r2 = ra + 10.5, rm = (r1 + r2) / 2;
      const defs =
        diag("ub", [[0, "#5a5f8a"], [0.45, "#22243c"], [1, "#090a12"]]) + tubeDefs(r1, r2, 0.5, 0.3) +
        outward("ue", [[0, "#2b2e4c"], [1, "#7a82bc"]], 72, 112, 31) + outward("ue2", [[0, "#2b2e4c"], [1, "#7a82bc"]], 72, 112, -31);
      const ear = "M-14 6C-15 -12 -7 -30 2 -44C9 -30 15 -12 14 6Z";
      const ears = [-31, 31].map((d) => ink(shape(r2 - 6, d, ear, 0.9, d < 0), `url(#ue${d < 0 ? "2" : ""})`, 1.3, 0.8) + `<path d="${shape(r2 - 6, d, "M-6.5 -2C-7 -14 -3 -28 2 -38", 0.9, d < 0)}" fill="none" stroke="#9aa2e0" stroke-opacity=".75" stroke-width="1.3" stroke-linecap="round"/>`).join("");
      const mark = (cx, cy, r) => `<circle cx="${f(cx)}" cy="${f(cy)}" r="${r}" fill="none" stroke="#ffd84a" stroke-width="3"/><circle cx="${f(cx)}" cy="${f(cy)}" r="${r - 1}" fill="none" stroke="#fff3a6" stroke-opacity=".8" stroke-width=".7"/>`;
      const earRings = [-28, 28].map((d) => { const [x, y] = pt(r2 + 17, d); return mark(x, y, 4.6); }).join("");
      const bandRings = [[62, 5.6], [118, 5], [242, 5], [298, 5.6]].map(([d, r]) => { const [x, y] = pt(rm, d); return mark(x, y, r); }).join("");
      const crescent = at(rm, 0, `<path d="M-9 -5Q0 9.5 9 -5Q0 2 -9 -5Z" fill="#ffd84a" stroke="#fff3a6" stroke-opacity=".7" stroke-width=".5"/>`);
      const sheen = `<path d="${arc(rm, 150, 210)}" fill="none" stroke="#7e86c8" stroke-opacity=".28" stroke-width="1.2" stroke-linecap="round"/>`;
      return doc(ears + `<path d="${donut(r1, r2)}" fill="url(#ub)"/>` + tube(r1, r2) + sheen + bandRings + crescent + finish(r1, r2, { hl: "#aab2ee", gl: 0.4 }) + earRings, defs);
    },
    glow: ({ ra }) => {
      const r2 = ra + 10.5, rm = ra - 1.5 + (r2 - ra + 1.5) / 2;
      const halo = (x, y, r) => `<circle cx="${f(x)}" cy="${f(y)}" r="${r + 4.5}" fill="url(#hg)"/>`;
      const pts = [...[[62, 5.6], [118, 5], [242, 5], [298, 5.6]].map(([d, r]) => [...pt(rm, d), r]), ...[-31, 31].map((d) => [...pt(r2 + 17, d), 4.6]), [...pt(rm, 0), 7]];
      const defs = `<radialGradient id="hg"><stop offset=".3" stop-color="#ffe45c" stop-opacity=".55"/><stop offset="1" stop-color="#ffd84a" stop-opacity="0"/></radialGradient>`;
      return doc(pts.map(([x, y, r]) => halo(x, y, r)).join(""), defs);
    },
  },

  {
    id: "mon-mew",
    name: "Mew",
    group: "Pokémon",
    of: 0.22,
    c: ["#ffb3d6", "#7fd0ff"],
    fx: "drift",
    fxs: 4.2,
    base: ({ ra }) => {
      const r1 = ra - 1.5, r2 = ra + 10, rm = (r1 + r2) / 2;
      const defs =
        diag("mb", [[0, "#ffeaf4"], [0.45, "#ffb9da"], [1, "#e47eb4"]]) + tubeDefs(r1, r2) +
        outward("me", [[0, "#ffb9da"], [1, "#ffe6f2"]], 70, 104, 30) + outward("me2", [[0, "#ffb9da"], [1, "#ffe6f2"]], 70, 104, -30) +
        lin("mt", [[0, "#ffd9ec"], [1, "#e47eb4"]], [20, 60, 70, 180]) +
        bb("mq", [[0, "#fff", 0.05], [0.7, "#bfe9ff", 0.3], [1, "#8fd0ff", 0.75]], 0.5, 0.5, 0.5) +
        bb("mj", [[0, "#fff"], [1, "#ffd9ec"]]);
      const ear = "M-11 5C-13 -8 -6 -20 1 -30C8 -19 13 -8 11 5Z";
      const ears = [-30, 30].map((d) => { const fl = d < 0; return ink(shape(r2 - 6, d, ear, 1.12, fl), `url(#me${fl ? "2" : ""})`) + `<path d="${shape(r2 - 6, d, "M-5.8 0C-6.4 -9 -3 -17 1 -24C4 -16 6.4 -8 5.8 0Z", 1.12, fl)}" fill="#ff8fc2" fill-opacity=".55"/>`; }).join("");
      // the long tail: from the foot of the ring, round the left side, ending in a bulb
      const R = r2 + 6;
      // the arc of the tail, then a curl that winds in to a bulb
      const endA = 300, jr = 10.5;
      const ae = pt(R, endA);
      const cc = [ae[0] - jr * Math.sin(rad(120)), ae[1] + jr * Math.cos(rad(120))];
      const turns = -1.25;
      const a0 = 120 - turns * 360;
      const arcTail = ribbon((t) => r2 - 2 + (R - r2 + 2) * Math.min(1, Math.sin(Math.min(1, t * 3) * Math.PI / 2)), 158, endA, 0, 0, 0, 36, (t) => 5 + 4.6 * Math.min(1, t * 1.5));
      const curlTail = curl(cc[0], cc[1], 2.4, jr, a0, turns, 2.6, 9.6);
      const tail = ink(arcTail, "url(#mt)", 1.2, 0.6) + ink(curlTail, "url(#mt)", 1.2, 0.6) +
        `<circle cx="${f(cc[0])}" cy="${f(cc[1])}" r="5.4" fill="url(#mj)" stroke="${INK}" stroke-opacity=".6" stroke-width="1.2"/><circle cx="${f(cc[0] - 1.6)}" cy="${f(cc[1] - 1.6)}" r="1.5" fill="#fff" fill-opacity=".85"/>`;
      const [bx, by] = pt(r2 + 7, 52);
      const bubble = `<circle cx="${f(bx)}" cy="${f(by)}" r="10" fill="url(#mq)" stroke="#d8f2ff" stroke-opacity=".9" stroke-width="1.1"/><ellipse cx="${f(bx - 3.2)}" cy="${f(by - 3.6)}" rx="3" ry="1.6" fill="#fff" fill-opacity=".9" transform="rotate(-38 ${f(bx - 3.2)} ${f(by - 3.6)})"/><circle cx="${f(bx + 3.6)}" cy="${f(by + 3.8)}" r="1" fill="#fff" fill-opacity=".7"/>`;
      return doc(ears + tail + `<path d="${donut(r1, r2)}" fill="url(#mb)"/>` + tube(r1, r2) + finish(r1, r2, { hl: "#fff4fa" }) + bubble, defs);
    },
    glow: ({ ra }) => {
      const r2 = ra + 10;
      const b = (d, r, s) => { const [x, y] = pt(r, d); return `<circle cx="${f(x)}" cy="${f(y)}" r="${s}" fill="#d8f4ff" fill-opacity=".5" stroke="#fff" stroke-opacity=".9" stroke-width=".8"/><circle cx="${f(x - s * 0.3)}" cy="${f(y - s * 0.35)}" r="${f(s * 0.28)}" fill="#fff"/>`; };
      return doc(b(80, r2 + 9, 3.2) + b(30, r2 + 20, 2.2) + b(112, r2 + 15, 2.4) + b(14, r2 + 10, 1.6));
    },
  },
  {
    id: "mon-bulbasaur",
    name: "Bulbasaur",
    group: "Pokémon",
    of: 0.24,
    c: ["#4fb88e", "#8fe36a"],
    base: ({ ra }) => {
      const r1 = ra - 1.5, r2 = ra + 9.5, rm = (r1 + r2) / 2;
      const defs =
        diag("bb1", [[0, "#9be8bb"], [0.45, "#4fb88e"], [1, "#237a5b"]]) + tubeDefs(r1, r2) +
        bb("bu", [[0, "#b8f27e"], [0.55, "#4cc060"], [1, "#1f7a3c"]], 0.38, 0.3, 0.85) +
        lin("lf", [[0, "#95f08a"], [1, "#2e9c4c"]], [0, 0, 0, 0]);
      const leaf = (d, len, wd) => `M0 2C${-wd} -${f(len * 0.3)} ${-wd * 0.8} -${f(len * 0.75)} 0 -${len}C${wd * 0.8} -${f(len * 0.75)} ${wd} -${f(len * 0.3)} 0 2Z`;
      // leaves burst from the bulb on top, fanned like a crown
      const cx = 100, cy = 30;
      const fan = [[-82, 56, 10.5], [82, 56, 10.5], [-58, 35, 9.4], [58, 35, 9.4], [-31, 24, 7.6], [31, 24, 7.6]];
      const leaves = fan.map(([a, len, wd], i) => `<g transform="translate(${cx} ${f(cy - 6)}) rotate(${a})"><path d="${leaf(0, len, wd)}" fill="url(#lg${i % 2})" stroke="${INK}" stroke-opacity=".6" stroke-width="1.2" stroke-linejoin="round"/><path d="M0 -1L0 -${f(len * 0.8)}" stroke="#d9ffc4" stroke-opacity=".7" stroke-width=".9"/><path d="M0 -${f(len * 0.4)}L${f(-wd * 0.5)} -${f(len * 0.55)}M0 -${f(len * 0.4)}L${f(wd * 0.5)} -${f(len * 0.55)}" stroke="#d9ffc4" stroke-opacity=".45" stroke-width=".7"/></g>`).join("");
      const defs2 = lin("lg0", [[0, "#a5f58f"], [1, "#2f9d4c"]], [0, 0, 80, 40]) + lin("lg1", [[0, "#7ee07a"], [1, "#27883f"]], [0, 0, 120, 40]);
      const spots = [[24, 6.5, 4.4, 20], [47, 4.6, 3.4, -30], [88, 5.2, 3.8, 10], [122, 6.2, 4.2, 40], [158, 4.6, 3.3, -10], [196, 6.4, 4.4, 15], [232, 5, 3.6, 30], [266, 6.2, 4.2, -20], [302, 4.8, 3.6, 10], [338, 5.8, 4.2, -25]]
        .map(([d, rx, ry, rot]) => at(rm, d, `<ellipse rx="${f(rx * 1.15)}" ry="${f(ry * 1.15)}" fill="#0d4a40" fill-opacity=".8" transform="rotate(${rot})"/><ellipse rx="${f(rx * 0.7)}" ry="${f(ry * 0.5)}" cx="-.6" cy="-.6" fill="#0c3a34" fill-opacity=".4" transform="rotate(${rot})"/>`))
        .join("");
      // the bulb: a round, ribbed bud sitting on the crown of the ring
      const bulb = `<ellipse cx="100" cy="${f(cy + 1)}" rx="22.5" ry="15" fill="${INK}" fill-opacity=".45" transform="translate(.8 1.2)"/><ellipse cx="100" cy="${f(cy + 1)}" rx="22" ry="14.5" fill="url(#bu)" stroke="${INK}" stroke-opacity=".6" stroke-width="1.3"/><path d="M91 ${f(cy - 8)}C88 ${f(cy - 2)} 88 ${f(cy + 5)} 92 ${f(cy + 11)}M100 ${f(cy - 11)}C99 ${f(cy - 3)} 99 ${f(cy + 6)} 100 ${f(cy + 12)}M109 ${f(cy - 8)}C112 ${f(cy - 2)} 112 ${f(cy + 5)} 108 ${f(cy + 11)}" fill="none" stroke="#14602f" stroke-opacity=".38" stroke-width="1"/><ellipse cx="92" cy="${f(cy - 3)}" rx="5.4" ry="2.4" fill="#fff" fill-opacity=".6" transform="rotate(-24 92 ${f(cy - 3)})"/>`;
      return doc(`<path d="${donut(r1, r2)}" fill="url(#bb1)"/>` + spots + tube(r1, r2) + finish(r1, r2, { hl: "#eafff0" }) + leaves + bulb, defs + defs2);
    },
  },

  {
    id: "mon-charizard",
    name: "Charizard",
    group: "Pokémon",
    of: 0.24,
    c: ["#f2792a", "#2fa7b8"],
    fx: "drift",
    fxs: 2.8,
    base: ({ ra }) => {
      const r1 = ra - 1.5, r2 = ra + 9.5, rm = (r1 + r2) / 2;
      const defs =
        diag("cb", [[0, "#ffc58a"], [0.45, "#f57f2b"], [1, "#b53f10"]]) + tubeDefs(r1, r2) +
        lin("cw", [[0, "#6fd6dc"], [0.5, "#2ba0b8"], [1, "#145a78"]], [0, 0, 70, 100]) +
        lin("cw2", [[0, "#6fd6dc"], [0.5, "#2ba0b8"], [1, "#145a78"]], [200, 0, 130, 100]) +
        lin("cbl", [[0, "#fff6d6"], [1, "#e9d29a"]], [60, 120, 140, 190]) +
        outward("cf", [[0, "#d1260c"], [0.4, "#ff6a1a"], [0.75, "#ffb52e"], [1, "#fff1a0"]], 66, 118, 137) +
        outward("cf2", [[0, "#ffb52e"], [1, "#fff7c0"]], 76, 116, 137);
      // a wing swept out into the top-left corner; the right is its mirror image
      const P2 = (x, y) => `${f1(x)} ${f1(y)}`;
      const W = [27, 66];
      const tips = [[6, 112], [4.5, 74], [8.5, 30], [30, 4.5], [62, 7]];
      const sc = (a, b) => { const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; return P2(m[0] + (W[0] - m[0]) * 0.3, m[1] + (W[1] - m[1]) * 0.3); };
      const rin = r2 - 2.5, S = pt(rin, 238), E = pt(rin, 338);
      let wing = `M${P2(...S)}L${P2(...tips[0])}`;
      for (let i = 1; i < tips.length; i++) wing += `Q${sc(tips[i - 1], tips[i])} ${P2(...tips[i])}`;
      wing += `Q${sc(tips[4], E)} ${P2(...E)}A${f1(rin)} ${f1(rin)} 0 0 0 ${P2(...S)}Z`;
      const bones = tips.map((t) => `M${P2(...W)}L${P2(...t)}`).join("") + `M${P2(...W)}L${P2(...pt(rin, 258))}`;
      const w1 = (m) => `<g${m ? ' transform="translate(200 0) scale(-1 1)"' : ""}><path d="${wing}" fill="url(#cw${m ? "2" : ""})" stroke="${INK}" stroke-opacity=".65" stroke-width="1.4" stroke-linejoin="round"/><path d="${bones}" fill="none" stroke="#e0652a" stroke-width="2.4" stroke-linecap="round"/><path d="${bones}" fill="none" stroke="#ffb27a" stroke-opacity=".6" stroke-width=".7" stroke-linecap="round" transform="translate(-.5 -.5)"/><circle cx="${W[0]}" cy="${W[1]}" r="3.2" fill="#f4e4b8" stroke="${INK}" stroke-opacity=".6" stroke-width="1"/></g>`;
      const flame = "M-8 5C-11 -8 -4 -15 -3 -26C0 -19 5 -22 4 -34C13 -24 14 -12 9 5Z";
      const flameIn = "M-4.5 4C-6 -4 -2 -9 -1 -16C1 -11 4 -13 3 -20C8 -13 8 -5 5.5 4Z";
      const horn = "M-3.6 3C-5 -6 -3 -13 1 -18C1.4 -9 3.6 -3 3.6 3Z";
      const horns = [-17, 17].map((d) => ink(shape(r2 - 3, d, horn, 1, d < 0), "#f4e4b8", 1, 0.6)).join("");
      const belly = `<path d="${sector(r1 + 0.4, r2 - 0.4, 122, 238)}" fill="url(#cbl)"/>` +
        around(6, (d, i) => `<path d="${`M${f(pt(r1 + 1, d)[0])} ${f(pt(r1 + 1, d)[1])}L${f(pt(r2 - 1, d)[0])} ${f(pt(r2 - 1, d)[1])}`}" stroke="#b8924a" stroke-opacity=".5" stroke-width=".8"/>`, 134);
      return doc(
        w1(false) + w1(true) + horns + ink(shape(r2 - 4, 137, flame, 1.2), "url(#cf)", 1.3, 0.7) + `<path d="${shape(r2 - 4, 137, flameIn, 1.2)}" fill="url(#cf2)"/>` +
          `<path d="${donut(r1, r2)}" fill="url(#cb)"/>` + belly + tube(r1, r2) + finish(r1, r2, { hl: "#fff1de" }),
        defs
      );
    },
    glow: ({ ra }) => {
      const r2 = ra + 9.5;
      const em = [[128, r2 + 28, 1.9], [143, r2 + 34, 1.5], [133, r2 + 39, 1.3], [150, r2 + 27, 1.2], [122, r2 + 35, 1.1]].map(([d, r, s]) => { const [x, y] = pt(r, d); return `<circle cx="${f(x)}" cy="${f(y)}" r="${s}" fill="#ffd25a"/>`; }).join("");
      return doc(em);
    },
  },
  {
    id: "mon-squirtle",
    name: "Squirtle",
    group: "Pokémon",
    of: 0.2,
    c: ["#4bb4ee", "#b97a3a"],
    base: ({ ra }) => {
      const r1 = ra - 1.5, r2 = ra + 10.5, rm = (r1 + r2) / 2;
      const defs =
        diag("sb", [[0, "#a8e6ff"], [0.45, "#4bb4ee"], [1, "#1f64ac"]]) + tubeDefs(r1, r2) +
        lin("ss", [[0, "#d9a05a"], [0.5, "#a96a30"], [1, "#5e3512"]], [30, 100, 170, 200]) +
        lin("sh", [[0, "#e49a52"], [1, "#6e3e16"]], [30, 100, 170, 200]) +
        lin("st", [[0, "#cdf1ff"], [1, "#2a78bf"]], [130, 130, 190, 190]);
      // curled tail at the lower right, spiralling out of the band
      const tr = 17, tj = pt(r2 - 2, 134);
      const tc = [tj[0] + tr * Math.sin(rad(134)), tj[1] - tr * Math.cos(rad(134))];
      const a0 = 134 + 180 - 1.4 * 360;
      const tp = curl(tc[0], tc[1], 2, tr, a0, 1.4, 5, 14);
      const tail = `<path d="${tp}" fill="url(#st)" stroke="${INK}" stroke-opacity=".6" stroke-width="1.3" stroke-linejoin="round"/><path d="${tp}" fill="none" stroke="#fff" stroke-opacity=".25" stroke-width=".8" transform="translate(-.8 -.8)"/>`;
      const hex = (d) => {
        const [x, y] = pt(rm, d);
        const hp = poly(Array.from({ length: 6 }, (_, k) => [x + 5.6 * Math.cos(rad(k * 60 + d)), y + 5.6 * Math.sin(rad(k * 60 + d))]));
        const hp2 = poly(Array.from({ length: 6 }, (_, k) => [x + 3.4 * Math.cos(rad(k * 60 + d)), y + 3.4 * Math.sin(rad(k * 60 + d))]));
        return `<path d="${hp}" fill="url(#sh)" stroke="#f6e3b0" stroke-width="1.5" stroke-linejoin="round"/><path d="${hp2}" fill="#3e2108" fill-opacity=".35"/>`;
      };
      const shell = `<path d="${sector(r1 + 0.3, r2 - 0.3, 108, 252)}" fill="url(#ss)"/>` + [118, 139.5, 161, 182, 203.5, 225, 240].slice(0, 6).map((d) => hex(d + 0)).join("") +
        `<path d="${arc(r2 - 0.8, 108, 252)}" fill="none" stroke="#f6e3b0" stroke-opacity=".8" stroke-width="1.2"/><path d="${arc(r1 + 0.9, 108, 252)}" fill="none" stroke="#f6e3b0" stroke-opacity=".8" stroke-width="1.2"/>`;
      return doc(tail + `<path d="${donut(r1, r2)}" fill="url(#sb)"/>` + shell + tube(r1, r2) + finish(r1, r2, { hl: "#eaf8ff" }), defs);
    },
  },
  {
    id: "mon-togepi",
    name: "Togepi",
    group: "Pokémon",
    of: 0.2,
    c: ["#f4e8cf", "#e5392f"],
    base: ({ ra }) => {
      const r1 = ra - 1.5, r2 = ra + 12, rm = (r1 + r2) / 2;
      const N = 14;
      const half = 180 / N;
      const defs =
        diag("tb", [[0, "#fffdf4"], [0.5, "#f3e6c8"], [1, "#c6b58f"]]) + tubeDefs(r1, r2) +
        lin("tr", [[0, "#ff6a5c"], [1, "#c1180f"]], [30, 30, 170, 170]) + lin("tbl", [[0, "#6aa8ff"], [1, "#1c4fbf"]], [30, 30, 170, 170]) +
        diag("tc", [[0, "#ffffff"], [0.5, "#f6ebd0"], [1, "#cdbd96"]]);
      // the broken shell: a ragged zig-zag crown, like the lip of a hatching egg
      const crown = [];
      const lim = (a) => 98 / Math.max(Math.abs(Math.sin(rad(a))), Math.abs(Math.cos(rad(a))));
      for (let i = 0; i < N; i++) {
        const a = i * 360 / N;
        crown.push(pt(r2 + 0.5 + rnd(i + 3) * 3, a - half + (rnd(i + 9) - 0.5) * 3));
        crown.push(pt(Math.min(r2 + 14 + rnd(i) * 7, lim(a) - 1), a + (rnd(i + 5) - 0.5) * 2));
      }
      const ci = r2 - 3;
      const crownPath = poly(crown) + `M${f(100 - ci)} 100A${f(ci)} ${f(ci)} 0 1 0 ${f(100 + ci)} 100A${f(ci)} ${f(ci)} 0 1 0 ${f(100 - ci)} 100Z`;
      // a lit left edge on every tooth
      const lit = crown.filter((_, i) => i % 2).map((p, i) => `M${f(p[0])} ${f(p[1])}L${f(crown[i * 2][0])} ${f(crown[i * 2][1])}`).join("");
      // red points outward, blue points inward: the zig-zag stripe of the shell
      const tri = (p, id, st) => `<path d="${poly(p)}" fill="url(#${id})" stroke="${st}" stroke-opacity=".4" stroke-width=".6" stroke-linejoin="round"/>`;
      const reds = around(N, (a) => tri([pt(rm - 3.8, a - half), pt(rm - 3.8, a + half), pt(rm + 4.4, a)], "tr", "#5a0a08"), 0);
      const blues = around(N, (a) => tri([pt(rm + 3.8, a - half), pt(rm + 3.8, a + half), pt(rm - 4.4, a)], "tbl", "#0a1e5a"), half);
      return doc(ink(crownPath, "url(#tc)", 1.3, 0.6) + `<path d="${lit}" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="1" stroke-linecap="round"/>` + `<path d="${donut(r1, r2)}" fill="url(#tb)"/>` + reds + blues + tube(r1, r2) + finish(r1, r2, { hl: "#fff" }), defs);
    },
  },
  {
    id: "mon-magikarp",
    name: "Magikarp",
    group: "Pokémon",
    of: 0.24,
    c: ["#ff8a2a", "#ffd9a0"],
    base: ({ ra }) => {
      const r1 = ra - 1.5, r2 = ra + 10, rm = (r1 + r2) / 2;
      const defs =
        diag("kb", [[0, "#ffd29a"], [0.45, "#ff8c2c"], [1, "#c9461a"]]) + tubeDefs(r1, r2) +
        outward("kf", [[0, "#e8421c"], [0.5, "#ff8f3c"], [1, "#ffe0a0"]], 72, 115, 0);
      // dorsal crest: a fan of spines standing on the top of the ring
      const spines = [[-40, 36], [-27, 29], [-13.5, 22], [0, 18], [13.5, 22], [27, 29], [40, 36]];
      let crest = `M${f(pt(r2 - 4, -50)[0])} ${f(pt(r2 - 4, -50)[1])}`;
      spines.forEach(([a, h], i) => {
        const p = pt(r2 + h, a), q = pt(r2 - 1, a + 6.6);
        crest += `Q${f(pt(r2 + h * 0.4, a - 6)[0])} ${f(pt(r2 + h * 0.4, a - 6)[1])} ${f(p[0])} ${f(p[1])}Q${f(pt(r2 + h * 0.35, a + 6)[0])} ${f(pt(r2 + h * 0.35, a + 6)[1])} ${f(q[0])} ${f(q[1])}`;
      });
      crest += `L${f(pt(r2 - 4, 50)[0])} ${f(pt(r2 - 4, 50)[1])}A${f(r2 - 4)} ${f(r2 - 4)} 0 0 0 ${f(pt(r2 - 4, -50)[0])} ${f(pt(r2 - 4, -50)[1])}Z`;
      const rays = spines.map(([a, h]) => `<path d="M${f(pt(r2 - 2, a)[0])} ${f(pt(r2 - 2, a)[1])}L${f(pt(r2 + h * 0.85, a)[0])} ${f(pt(r2 + h * 0.85, a)[1])}" stroke="#fff0c8" stroke-opacity=".6" stroke-width=".8"/>`).join("");
      const whisk = "M0 2C-3 -9 3 -19 12 -19C20 -19 22 -9 16 -6C11 -4 8 -9 12 -11";
      const whiskers = [97, 263].map((d) => {
        const p = shape(r2 - 3, d, whisk, 1.12, d > 180);
        return `<path d="${p}" fill="none" stroke="${INK}" stroke-opacity=".6" stroke-width="6.2" stroke-linecap="round"/><path d="${p}" fill="none" stroke="#ffe3b0" stroke-width="3.6" stroke-linecap="round"/><path d="${p}" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width=".8" stroke-linecap="round" transform="translate(-.6 -.6)"/>`;
      }).join("");
      // scales: two offset rows of arcs across the band
      const sc = (n, rr, off) => around(n, (d) => `<path d="${shape(rr, d, "M-4.4 0.4Q-4.2 -4.6 0 -5.2Q4.2 -4.6 4.4 0.4Z")}"/>`, off);
      const scales = `<g fill="#ffe0a8" fill-opacity=".2" stroke="#5e1804" stroke-opacity=".75" stroke-width="1.1" stroke-linejoin="round">${sc(30, r1 + 1.6, 0)}${sc(30, r1 + 6.3, 6)}</g>`;
      const tailfin = ink(shape(r2 - 2, 180, "M-8 3C-11 -4 -16 -9 -17 -15C-10 -12 -5 -14 0 -20C5 -14 10 -12 17 -15C16 -9 11 -4 8 3Z", 1.05), "url(#kf)", 1.2, 0.6);
      return doc(tailfin + whiskers + ink(crest, "url(#kf)", 1.3, 0.65) + rays + `<path d="${donut(r1, r2)}" fill="url(#kb)"/>` + scales + tube(r1, r2) + finish(r1, r2, { hl: "#fff2d8" }), defs);
    },
  },
  {
    id: "mon-snorlax",
    name: "Snorlax",
    group: "Pokémon",
    of: 0.22,
    c: ["#34616b", "#f4e6bf"],
    fx: "drift",
    fxs: 4.6,
    base: ({ ra }) => {
      const r1 = ra - 1.5, r2 = ra + 11, rm = (r1 + r2) / 2;
      const defs =
        diag("nb", [[0, "#69a0aa"], [0.45, "#33606b"], [1, "#16303a"]]) + tubeDefs(r1, r2) +
        lin("nc", [[0, "#fffae0"], [1, "#e4d3a2"]], [60, 120, 140, 190]) +
        outward("ne", [[0, "#2e5a65"], [1, "#6ea3ad"]], 72, 98, 31) + outward("ne2", [[0, "#2e5a65"], [1, "#6ea3ad"]], 72, 98, -31);
      const ear = "M-9.5 5C-11 -4 -6 -13 0 -17C6 -13 11 -4 9.5 5Z";
      const einner = "M-4.6 2C-5.4 -4 -2.6 -9 0 -11C2.6 -9 5.4 -4 4.6 2Z";
      const ears = [-31, 31].map((d) => ink(shape(r2 - 5, d, ear, 1, d < 0), `url(#ne${d < 0 ? "2" : ""})`) + `<path d="${shape(r2 - 5, d, einner, 1, d < 0)}" fill="#e8d7ae" fill-opacity=".8"/>`).join("");
      // the cream belly: arcs of soft fur, and a cream patch on the brow
      const belly = `<path d="${sector(r1 + 0.4, r2 - 0.4, 116, 244)}" fill="url(#nc)"/>` +
        [[r1 + 3.6, 124, 236], [rm + 0.5, 130, 230], [r2 - 3, 138, 222]].map(([r, x, y]) => `<path d="${arc(r, x, y)}" fill="none" stroke="#a8946a" stroke-opacity=".5" stroke-width=".9" stroke-linecap="round"/>`).join("") +
        `<path d="${sector(r1 + 0.4, r2 - 0.4, 346, 374)}" fill="url(#nc)" fill-opacity=".92"/>`;
      // two closed eyes, asleep
      const eyes = [-15, 15].map((d) => at(rm, d, `<path d="M-3.6 0Q0 3.6 3.6 0" fill="none" stroke="#10242b" stroke-width="1.4" stroke-linecap="round"/>`)).join("");
      return doc(ears + `<path d="${donut(r1, r2)}" fill="url(#nb)"/>` + belly + tube(r1, r2) + eyes + finish(r1, r2, { hl: "#e6f6f8" }), defs);
    },
    glow: ({ ra }) => {
      const r2 = ra + 11;
      const z = (d, r, s) => { const [x, y] = pt(r, d); return `<path d="M${f(x - 3 * s)} ${f(y - 3 * s)}H${f(x + 3 * s)}L${f(x - 3 * s)} ${f(y + 3 * s)}H${f(x + 3 * s)}" fill="none" stroke="#d6f0ff" stroke-width="${f(1.3 * s + 0.5)}" stroke-linecap="round" stroke-linejoin="round"/>`; };
      return doc(z(48, r2 + 8, 1.7) + z(62, r2 + 15, 1.2) + z(36, r2 + 20, 0.9) + `<path d="${spark(...pt(r2 + 12, 72), 3, 0.2)}" fill="#fff"/>`);
    },
  },
];
