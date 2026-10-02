import { C, f, pt, arc, sector, donut, around, lin, rg, wedges, spark, outline, gloss, doc, rad } from "../lib/frame-art.mjs";

/* ---------- small helpers shared by the type frames ---------- */
const g = (n) => Math.round(n * 10) / 10;
/** Lean versions of the lib's poly / star / at: one decimal, so a busy frame stays under the size limit. */
const poly = (points, close = true) => `M${points.map(([x, y]) => `${g(x)} ${g(y)}`).join("L")}${close ? "Z" : ""}`;
const star = (cx, cy, R, r, n = 5, rot = 0) => poly(Array.from({ length: n * 2 }, (_, i) => {
  const a = rad(rot + (i * 180) / n);
  const rr = i % 2 ? r : R;
  return [cx + rr * Math.sin(a), cy - rr * Math.cos(a)];
}));
const at = (r, deg, inner, extra = "") => {
  const [x, y] = pt(r, deg);
  return `<g transform="translate(${g(x)} ${g(y)}) rotate(${g(deg)})${extra ? " " + extra : ""}">${inner}</g>`;
};
/** Deterministic pseudo-random in 0..1 (so a rebuild never changes the art). */
function rnd(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Furthest radius a thing can reach at this angle without leaving the box (2 unit margin). */
const rmax = (deg) => 98 / Math.max(Math.abs(Math.sin(rad(deg))), Math.abs(Math.cos(rad(deg))), 0.001);
/** A four point sparkle at (r, deg), pulled in so its tips stay inside the box. */
const sparkAt = (r, deg, R, w = 0.2) => {
  const [x, y] = pt(Math.min(r, rmax(deg) - R - 2.5), deg);
  return spark(g(x), g(y), R, w);
};
/** Ring path whose edges ripple: r(θ) = r + amp·sin(freq·θ + phase). Quadratic through midpoints keeps it small. */
function wavy(r, amp, n, freq, phase = 0) {
  const ps = [];
  for (let i = 0; i < n; i++) {
    const d = (i * 360) / n;
    ps.push(pt(r + amp * Math.sin(rad(freq * d + phase)), d));
  }
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  let out = `M${g(mid(ps[n - 1], ps[0])[0])} ${g(mid(ps[n - 1], ps[0])[1])}`;
  for (let i = 0; i < n; i++) {
    const m = mid(ps[i], ps[(i + 1) % n]);
    out += `Q${g(ps[i][0])} ${g(ps[i][1])} ${g(m[0])} ${g(m[1])}`;
  }
  return out + "Z";
}
/** Open polyline of r(θ) between two angles, as a path. */
function trace(rFn, a0, a1, step = 4) {
  let out = "";
  for (let d = a0, i = 0; d <= a1 + 0.001; d += step, i++) {
    const [x, y] = pt(rFn(d), d);
    out += `${i ? "L" : "M"}${g(x)} ${g(y)}`;
  }
  return out;
}
/** A leaf pointing up from its base: length L, half width w. */
const leaf = (L, w) => `M0 0C${g(w * 1.1)} ${g(-L * 0.25)} ${g(w * 0.9)} ${g(-L * 0.7)} 0 ${g(-L)}C${g(-w * 0.9)} ${g(-L * 0.7)} ${g(-w * 1.1)} ${g(-L * 0.25)} 0 0Z`;
const leafHalf = (L, w, side) => `M0 0C${g(side * w * 1.1)} ${g(-L * 0.25)} ${g(side * w * 0.9)} ${g(-L * 0.7)} 0 ${g(-L)}Z`;
/** A teardrop pointing up, radius r. */
const drop = (r, tail = 2.1) => `M0 ${g(-r * tail)}C${g(r * 0.2)} ${g(-r * 1.2)} ${g(r)} ${g(-r * 0.7)} ${g(r)} ${g(r * 0.1)}A${g(r)} ${g(r)} 0 0 1 ${g(-r)} ${g(r * 0.1)}C${g(-r)} ${g(-r * 0.7)} ${g(-r * 0.2)} ${g(-r * 1.2)} 0 ${g(-r * tail)}Z`;
const hexPath = (R, rot = 0) => poly(Array.from({ length: 6 }, (_, i) => [R * Math.sin(rad(rot + i * 60)), -R * Math.cos(rad(rot + i * 60))]));
const dots = (list, fill, extra = "") => list.map(([x, y, r]) => `<circle cx="${g(x)}" cy="${g(y)}" r="${r}" fill="${fill}"${extra}/>`).join("");

// ============================================================ NORMAL
const normal = {
  id: "type-normal",
  name: "Normal",
  group: "Types",
  of: 0.15,
  c: ["#efe4c8", "#a8a878"],
  base: ({ ra }) => {
    const r1 = ra - 1.5;
    const r2 = ra + 9.5;
    const rm = (r1 + r2) / 2;
    const defs =
      lin("nb", [[0, "#fffaf0"], [0.45, "#efe3c4"], [1, "#b3a27a"]], [40, 20, 160, 180]) +
      lin("ns", [[0, "#a8956a"], [1, "#6e5f40"]], [0, 90, 0, 110]) +
      rg("np", [[0, "#ffffff"], [0.6, "#f3ead3"], [1, "#b9a884"]], [C - 0.6, C - 0.6, 3]) +
      lin("nx", [[0, "#fff6d8"], [1, "#b69a5a"]], [0, -8, 0, 4]);
    const beads = `<g fill="#f3ead3" stroke="#6e5f40" stroke-opacity=".5" stroke-width=".5">${around(48, (d) => {
      const [x, y] = pt(r2 + 0.4, d);
      return `<circle cx="${g(x)}" cy="${g(y)}" r="1.9"/>`;
    }, 3.75)}</g><g fill="#fff">${around(48, (d) => {
      const [x, y] = pt(r2 + 0.4, d);
      return `<circle cx="${g(x - 0.5)}" cy="${g(y - 0.5)}" r=".7"/>`;
    }, 3.75)}</g>`;
    let starD = "";
    for (let i = 0; i < 14; i++) {
      const [x, y] = pt(rm, 8 + (i * 360) / 14);
      starD += star(x, y, 4.2, 1.8, 5, 8 + (i * 360) / 14);
    }
    const stars = `<path d="${starD}" fill="#8a7852"/><g fill="#fffaf0" stroke="#8a7852" stroke-opacity=".6" stroke-width=".6">${around(14, (d) => {
      const [x, y] = pt(rm, d);
      return `<circle cx="${g(x)}" cy="${g(y)}" r="1.5"/>`;
    }, 8 + 360 / 28)}</g>`;
    const big = [0, 90, 180, 270].map((d) => at(r2 + 1.5, d, `<path d="${star(0, 0, 8.5, 3.6, 5, 0)}" fill="url(#nx)" stroke="#6e5f40" stroke-opacity=".75" stroke-width=".9" stroke-linejoin="round"/>`)).join("");
    const body =
      outline(r2 + 3.3, 1.3, "#2a2216", 0.45) +
      beads +
      `<path d="${donut(r1, r2)}" fill="url(#nb)"/>` +
      `<path d="${arc(r1 + 2.3, 0, 359.9)}" fill="none" stroke="#8a7852" stroke-opacity=".45" stroke-width=".7"/>` +
      `<path d="${arc(r2 - 2.3, 0, 359.9)}" fill="none" stroke="#8a7852" stroke-opacity=".45" stroke-width=".7"/>` +
      stars +
      big +
      gloss(r2 - 2.2, 1.8, 290, 22, 0.7) +
      outline(r2 + 0.1, 1, "#3a2f1c", 0.5) +
      outline(r1 + 0.4, 1.4, "#2a2216", 0.55);
    return doc(body, defs);
  },
};

// ============================================================ FIRE
// One flame, unit-sized (about 20 wide and 100 tall, tip hooked sideways). Scaled per use.
const flameU = (c) => {
  const t = c * 16;
  return `M-10 0C-16-26-6-42-4-62C-3-78 ${g(t * 0.5)}-88 ${g(t)}-100C${g(t * 0.6 + 12)}-78 15-64 12-42C10-24 16-10 10 0Z`;
};
const FL = { "-1": flameU(-1), "0": flameU(0), "1": flameU(1) };
const flameAt = (dx, rot, sx, sy, curl, core) =>
  `<g transform="translate(${dx} 0) rotate(${rot}) scale(${sx} ${sy})"><path d="${FL[curl]}" fill="url(#fo)"/>${core ? `<path d="${FL[curl]}" fill="url(#fm)" transform="scale(.72 .8)"/><path d="${FL[curl]}" fill="url(#fc)" transform="scale(.4 .55)"/>` : `<path d="${FL[curl]}" fill="url(#fm)" transform="scale(.6 .7)"/>`}</g>`;

const fire = {
  id: "type-fire",
  name: "Fire",
  group: "Types",
  of: 0.24,
  c: ["#ff8a2b", "#c92a12"],
  fx: "drift",
  fxs: 3.4,
  base: ({ ra }) => {
    const r1 = ra - 1.5;
    const r2 = ra + 8;
    const N = 9;
    const clusters = around(N, (deg, i) => {
      const base = r2 - 4;
      const room = rmax(deg) - base - 4;
      const hpx = Math.min(24 + 15 * Math.cos(rad(deg)) + (i % 2) * 3, room);
      const H = hpx / 100;
      const side = Math.sin(rad(deg));
      const lean = side > 0.2 ? 1 : side < -0.2 ? -1 : i % 2 ? 1 : -1; // lean away from the top centre
      return at(
        base,
        deg,
        flameAt(-12, -22, 0.4, H * 0.62, -1, false) +
          flameAt(12, 22, 0.4, H * 0.56, 1, false) +
          flameAt(0, 0, 0.66, H, lean, true)
      );
    }, 0);
    const defs =
      lin("fo", [[0, "#c8210b"], [0.55, "#ff4a14"], [1, "#ff7a1a"]], [0, 0, 0, -100]) +
      lin("fm", [[0, "#ff8a1c"], [1, "#ffbd33"]], [0, 0, 0, -100]) +
      lin("fc", [[0, "#ffd24a"], [1, "#fffbd0"]], [0, 0, 0, -100]) +
      lin("fb", [[0, "#ffcf55"], [0.5, "#ff7a1c"], [1, "#a9170b"]], [60, 20, 140, 180]);
    const embers = around(18, (d, i) => {
      const [x, y] = pt(r1 + 3 + (i % 3) * 3.6, d);
      return `<circle cx="${g(x)}" cy="${g(y)}" r="${1 + (i % 2) * 0.5}" fill="#fff0a0" fill-opacity=".8"/>`;
    }, 5);
    const body =
      clusters +
      outline(r2 + 0.2, 1.4, "#4d0d04", 0.7) +
      `<path d="${donut(r1, r2)}" fill="url(#fb)"/>` +
      `<path d="${wavy(r1 + 4.2, 1.5, 36, 9)}" fill="none" stroke="#7d1607" stroke-opacity=".35" stroke-width="1.2"/>` +
      embers +
      gloss(r2 - 2.6, 1.6, 290, 20, 0.55, "#fff1b0") +
      outline(r1 + 0.4, 1.4, "#4d0d04", 0.6);
    return doc(body, defs);
  },
  glow: ({ ra }) => {
    const pts = [[-22, 92, 1.8], [-6, 97, 1.3], [14, 94, 2], [28, 90, 1.4], [-44, 88, 1.4], [46, 87, 1.6], [4, 99, 1.1], [-31, 96, 1.2], [38, 96, 1.2], [-14, 88, 1.1]];
    return doc(pts.map(([d, r, s]) => `<circle cx="${g(pt(Math.min(r, rmax(d) - 4), d)[0])}" cy="${g(pt(Math.min(r, rmax(d) - 4), d)[1])}" r="${s}" fill="#ffd25a"/>`).join(""));
  },
};

// ============================================================ WATER
const crest = "M-13 0C-13-13-5-25 7-26C17-27 23-19 21-11C20-6 14-5 12-9C11-12 14-14 16-13C14-18 8-17 6-11C4-5 10-2 14 0Z";
const water = {
  id: "type-water",
  name: "Water",
  group: "Types",
  of: 0.22,
  c: ["#3d7dff", "#8fd8ff"],
  fx: "breathe",
  fxs: 4,
  base: ({ ra }) => {
    const r1 = ra - 1.5;
    const r2 = ra + 8.5;
    const crests = around(12, (d, i) => {
      const k = g(Math.min(i % 2 ? 0.8 : 1, (rmax(d) - (r2 - 4.5) - 3) / 26.5));
      return at(r2 - 4.5, d, `<g transform="scale(${k})"><path d="${crest}" fill="url(#wc)" stroke="#1a3d9a" stroke-opacity=".6" stroke-width=".8" stroke-linejoin="round"/><path d="M-9 -4C-9-12-4-19 3-21" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="1.5" stroke-linecap="round"/></g>`);
    }, 0);
    const drops = [[16, 8.5], [-20, 7], [44, 6.5], [-48, 6], [143, 7], [-135, 7.5], [172, 5], [-168, 5.5], [100, 5.5], [-100, 5]].map(([d, rr], i) => {
      const [qx, qy] = pt(r2 + 14, d);
      const sc = rr / 7;
      return `<g transform="translate(${g(Math.min(Math.max(qx, 9), 191))} ${g(Math.min(Math.max(qy, 5 + 9.7 * sc), 195 - 4.6 * sc))}) scale(${g(sc)})"><path d="${drop(4.4)}" fill="url(#wd)" stroke="#1a3d9a" stroke-opacity=".6" stroke-width=".9"/><circle cx="-1.6" cy="-1" r="1.1" fill="#fff" fill-opacity=".85"/></g>`;
    }).join("");
    const defs =
      lin("wb", [[0, "#7fd0ff"], [0.5, "#2f7ff0"], [1, "#1a45b8"]], [40, 20, 160, 180]) +
      lin("wc", [[0, "#e8fbff"], [0.35, "#8fd8ff"], [1, "#2f7ff0"]], [0, -28, 0, 2]) +
      lin("wd", [[0, "#bfeaff"], [1, "#2f7ff0"]], [-3, -9, 3, 5]);
    const ripple = `<path d="${wavy(r1 + 5, 1.8, 48, 12)}" fill="none" stroke="#d6f4ff" stroke-opacity=".5" stroke-width="1"/>`;
    const body =
      crests +
      outline(r2 + 0.2, 1.4, "#0f2a78", 0.6) +
      `<path d="${donut(r1, r2)}" fill="url(#wb)"/>` +
      ripple +
      gloss(r2 - 2.6, 1.8, 290, 22, 0.6) +
      outline(r1 + 0.4, 1.4, "#0b1d5c", 0.55) +
      drops;
    return doc(body, defs);
  },
  glow: () => {
    const sp = [[-28, 90], [34, 92], [8, 99], [-52, 84], [58, 82], [150, 90], [-140, 90]];
    return doc(sp.map(([d, r], i) => `<path d="${sparkAt(r, d, 3.2 + (i % 2), 0.2)}" fill="#e8fbff"/>`).join(""));
  },
};

// ============================================================ GRASS
const grass = {
  id: "type-grass",
  name: "Grass",
  group: "Types",
  of: 0.22,
  c: ["#6fd04a", "#2f7a2a"],
  fx: "sway",
  fxs: 6,
  base: ({ ra }) => {
    const r1 = ra - 1.5;
    const r2 = ra + 8;
    const rm = (r1 + r2) / 2;
    const vine = (ph) => trace((d) => rm + 3.2 * Math.sin(rad(d * 10 + ph)), 0, 360, 5);
    const leaves = around(14, (d, i) => {
      const L = 17 + (i % 3) * 3 + 3 * Math.cos(rad(d));
      const a = i % 2 ? 38 : -38;
      return at(r2 - 4, d, `<path d="${leaf(L, 7.2)}" fill="url(#gl)" stroke="#17481a" stroke-opacity=".6" stroke-width=".8" stroke-linejoin="round"/><path d="${leafHalf(L, 7.2, 1)}" fill="url(#gd)"/><path d="M0 0L0 ${g(-L * 0.9)}" stroke="#d4f5a8" stroke-opacity=".7" stroke-width=".9" stroke-linecap="round"/>`, `rotate(${a})`);
    }, 6);
    const bud = at(r2 - 3, 0,
      `<g transform="rotate(-24)"><path d="${leaf(18, 6)}" fill="url(#gd)" stroke="#17481a" stroke-opacity=".6" stroke-width=".8"/></g><g transform="rotate(24)"><path d="${leaf(18, 6)}" fill="url(#gl)" stroke="#17481a" stroke-opacity=".6" stroke-width=".8"/></g>` +
        `<path d="M-7 -2C-9 -12-4 -20 0 -24C4 -20 9 -12 7 -2C3 1-3 1-7 -2Z" fill="url(#gp)" stroke="#8a1648" stroke-opacity=".7" stroke-width=".8" stroke-linejoin="round"/><path d="M0 0C-2.5-7-2-15 0-23" fill="none" stroke="#ffd0e6" stroke-opacity=".8" stroke-width=".9"/><path d="M-5 -3C-7 -10-3 -17-1.5 -20" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="1" stroke-linecap="round"/>`, "scale(.88)");
    const defs =
      lin("gb", [[0, "#8fe05a"], [0.5, "#3fa63a"], [1, "#1b5f26"]], [40, 20, 160, 180]) +
      lin("gl", [[0, "#d6ff8a"], [1, "#58bd3c"]], [0, -22, 0, 0]) +
      lin("gd", [[0, "#6fcf48"], [1, "#1f7a2a"]], [0, -22, 0, 0]) +
      lin("gp", [[0, "#ffb3d4"], [1, "#e0457f"]], [0, -24, 0, 0]);
    const body =
      leaves +
      outline(r2 + 0.2, 1.4, "#0f3a14", 0.6) +
      `<path d="${donut(r1, r2)}" fill="url(#gb)"/>` +
      `<path d="${vine(0)}${vine(180)}" fill="none" stroke="#0f3a14" stroke-opacity=".55" stroke-width="3.3"/>` +
      `<path d="${vine(180)}" fill="none" stroke="#7bd24a" stroke-width="2"/><path d="${vine(0)}" fill="none" stroke="#a8ee6a" stroke-width="2"/>` +
      gloss(r2 - 1.6, 1.4, 290, 22, 0.45, "#e9ffc7") +
      outline(r1 + 0.4, 1.4, "#0b2e10", 0.55) +
      bud;
    return doc(body, defs);
  },
  glow: () => {
    const sp = [[-30, 88, 3], [20, 92, 3.4], [60, 86, 2.6], [-62, 84, 2.8], [150, 90, 3], [-150, 90, 2.8]];
    return doc(sp.map(([d, r, s], i) => at(r, d, `<g transform="rotate(${i * 50})"><path d="${leaf(s * 2.2, s * 0.9)}" fill="#c9f78a" fill-opacity=".85"/></g>`)).join(""));
  },
};

// ============================================================ ELECTRIC
function bolt(L, w = 4) {
  const k = L / 26;
  const p = [[-w, 0], [w * 0.55, -8 * k], [-w * 0.3, -9 * k], [w * 0.9, -17 * k], [-w * 0.1, -18 * k], [0.5, -L], [-w * 1.5, -15 * k], [-w * 0.55, -14.2 * k], [-w * 1.7, -6 * k], [-w * 0.8, -5 * k]];
  return poly(p);
}
const electric = {
  id: "type-electric",
  name: "Electric",
  group: "Types",
  of: 0.24,
  c: ["#ffd93a", "#f08a12"],
  fx: "pulse",
  fxs: 1.8,
  base: ({ ra }) => {
    const r1 = ra - 1.5;
    const r2 = ra + 8;
    const rm = (r1 + r2) / 2;
    const N = 12;
    const bolts = around(N, (d, i) => {
      const L = Math.min((i % 2 ? 18 : 27) + 2 * Math.cos(rad(d)), rmax(d) - (r2 - 3) - 1);
      return at(r2 - 3, d, `<path d="${bolt(L, i % 2 ? 4.4 : 5.4)}" fill="url(#eb)" stroke="#7a4a00" stroke-opacity=".75" stroke-width=".9" stroke-linejoin="round"/>`);
    }, 0);
    const zig = trace((d) => rm + (Math.round(d / 6) % 2 ? 3 : -3), 0, 360, 6);
    const defs =
      lin("eb", [[0, "#fffbd0"], [0.5, "#ffe24a"], [1, "#f5a312"]], [0, 0, 0, -26]) +
      lin("er", [[0, "#fff29a"], [0.45, "#ffd426"], [1, "#d98a0a"]], [40, 20, 160, 180]);
    const body =
      bolts +
      outline(r2 + 0.2, 1.4, "#5a3600", 0.65) +
      `<path d="${donut(r1, r2)}" fill="url(#er)"/>` +
      `<path d="${zig}Z" fill="none" stroke="#7a4a00" stroke-opacity=".75" stroke-width="1.5" stroke-linejoin="miter" stroke-miterlimit="3"/>` +
      `<path d="${zig}Z" fill="none" stroke="#fffbd0" stroke-opacity=".8" stroke-width=".5" transform="translate(-.4 -.4)"/>` +
      gloss(r2 - 1.4, 1.5, 290, 22, 0.7, "#fffbe0") +
      outline(r1 + 0.4, 1.4, "#4a2c00", 0.6);
    return doc(body, defs);
  },
  glow: ({ ra }) => {
    const r2 = ra + 8;
    const sp = [[18, 96, 4], [-18, 98, 3.4], [54, 90, 3.2], [-54, 92, 3.6], [90, 94, 3], [-90, 92, 3], [140, 96, 3.4], [-140, 96, 3.6], [180, 94, 3]];
    return doc(
      `<path d="${arc(r2 + 1.5, 0, 359.9)}" fill="none" stroke="#fff3a0" stroke-opacity=".28" stroke-width="5"/>` +
        sp.map(([d, r, s]) => `<path d="${sparkAt(r, d, s * 1.4, 0.16)}" fill="#fffbe0"/>`).join("")
    );
  },
};

// ============================================================ ICE
const ice = {
  id: "type-ice",
  name: "Ice",
  group: "Types",
  of: 0.24,
  c: ["#a8ecf0", "#4fb3d6"],
  fx: "pulse",
  fxs: 3.2,
  base: ({ ra }) => {
    const r1 = ra - 1.5;
    const r2 = ra + 8;
    const R = rnd(11);
    const shard = (L, w, i) => {
      const k = 0.62;
      const left = `M${-w} 0L${g(-w * 0.8)} ${g(-L * k)}L0 ${-L}L0 0Z`;
      const right = `M0 0L0 ${-L}L${g(w * 0.8)} ${g(-L * k)}L${w} 0Z`;
      return `<path d="${left}" fill="url(#il)"/><path d="${right}" fill="url(#id)"/><path d="M0 0L0 ${-L}" stroke="#fff" stroke-opacity=".7" stroke-width=".6"/><path d="${poly([[-w, 0], [-w * 0.8, -L * k], [0, -L], [w * 0.8, -L * k], [w, 0]])}" fill="none" stroke="#2c7a9c" stroke-opacity=".7" stroke-width=".8" stroke-linejoin="round"/>`;
    };
    const big = around(9, (d, i) => {
      const want = 30 + 4 * Math.cos(rad(d)) + R() * 3 - (i % 2) * 5;
      const L = Math.min(want, rmax(d) - (r2 - 4) - 2);
      return at(r2 - 4, d, shard(L, 5.4 + (i % 2), i));
    }, 0);
    const small = around(9, (d, i) => {
      const L = Math.min(15 + R() * 4, rmax(d) - (r2 - 4) - 2);
      return at(r2 - 4, d, shard(L, 3.4, i), `rotate(${i % 2 ? 6 : -6})`);
    }, 20);
    const defs =
      lin("il", [[0, "#ffffff"], [1, "#a8ecf0"]], [-5, -30, 3, 0]) +
      lin("id", [[0, "#6fc6e0"], [1, "#2b87b3"]], [0, -30, 5, 0]) +
      lin("ib", [[0, "#effdff"], [1, "#6fc6e0"]], [40, 20, 160, 180]);
    const facets = wedges(r1, r2, 20, (i) => (i % 3 === 0 ? "#ffffff" : i % 3 === 1 ? "#bff4f7" : "#7fd0e6"), 0);
    const body =
      big + small +
      outline(r2 + 0.2, 1.4, "#14506e", 0.65) +
      `<g>${facets}</g>` +
      `<path d="${donut(r1, r2)}" fill="url(#ib)" fill-opacity=".35"/>` +
      `<path d="${arc(r1 + 4.5, 0, 359.9)}" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width=".6"/>` +
      gloss(r2 - 2, 1.6, 290, 22, 0.8) +
      outline(r1 + 0.4, 1.4, "#0f3d58", 0.6);
    return doc(body, defs);
  },
  glow: () => {
    const sp = [[-8, 98, 3.6], [24, 96, 3], [-34, 94, 2.8], [60, 92, 3.2], [-62, 90, 3], [120, 94, 2.8], [-120, 94, 3], [180, 98, 3.4]];
    return doc(sp.map(([d, r, s]) => `<path d="${sparkAt(r, d, s * 1.4, 0.15)}" fill="#ffffff"/>`).join(""));
  },
};

// ============================================================ FIGHTING
const fighting = {
  id: "type-fighting",
  name: "Fighting",
  group: "Types",
  of: 0.2,
  c: ["#d8432f", "#f3e6cf"],
  fx: "pulse",
  fxs: 2.2,
  base: ({ ra }) => {
    const r1 = ra - 1.5;
    const r2 = ra + 11.5;
    const rt1 = r1 + 1.6;
    const rt2 = r2 - 1.6;
    let seams = "";
    let hiSeams = "";
    for (let i = 0; i < 24; i++) {
      const d = i * 15;
      const [x0, y0] = pt(rt1, d);
      const [x1, y1] = pt(rt2, d + 20);
      seams += `M${g(x0)} ${g(y0)}L${g(x1)} ${g(y1)}`;
      hiSeams += `M${g(x0 + 0.9)} ${g(y0 + 0.5)}L${g(x1 + 0.9)} ${g(y1 + 0.5)}`;
    }
    const strips = `<path d="${donut(rt1, rt2)}" fill="url(#ft)"/><path d="${seams}" stroke="#8a6a42" stroke-opacity=".8" stroke-width="1.1" fill="none"/><path d="${hiSeams}" stroke="#fff" stroke-opacity=".8" stroke-width=".6" fill="none"/><path d="${arc(rt1 + 0.9, 0, 359.9)}" fill="none" stroke="#d8432f" stroke-width="1.8"/><path d="${arc(rt2 - 0.9, 0, 359.9)}" fill="none" stroke="#d8432f" stroke-width="1.8"/>`;
    const studs = around(6, (d) => at(r2 + 0.2, d, `<circle r="4.6" fill="#2a1410" fill-opacity=".75"/><circle r="3.9" fill="url(#fs)"/><circle cx="-1.2" cy="-1.3" r="1.2" fill="#fff" fill-opacity=".9"/>`), 60);
    const burst = (d, R, rot, rr) => {
      const [x, y] = pt(rr, d);
      return `<g transform="translate(${g(x)} ${g(y)}) rotate(${rot})"><path d="${star(0, 0, R, R * 0.52, 12, 0)}" fill="#c8260f" stroke="#4a0c04" stroke-width="1.2" stroke-linejoin="round"/><path d="${star(0, 0, R * 0.82, R * 0.42, 12, 15)}" fill="#ff7a1a"/><path d="${star(0, 0, R * 0.6, R * 0.32, 12, 0)}" fill="#ffd23a"/><circle r="${g(R * 0.28)}" fill="#fffbe0"/></g>`;
    };
    const defs =
      lin("fb", [[0, "#ff7a62"], [0.5, "#d8432f"], [1, "#7e1a12"]], [40, 20, 160, 180]) +
      lin("ft", [[0, "#fffdf6"], [0.5, "#f2e8d2"], [1, "#d2c3a2"]], [20, 20, 180, 180]) +
      rg("fs", [[0, "#f2f2f6"], [1, "#5a5a6c"]], [-1.5, -1.5, 5.5]);
    const body =
      outline(r2 + 0.2, 1.4, "#3d0c07", 0.65) +
      `<path d="${donut(r1, r2)}" fill="url(#fb)"/>` +
      strips +
      gloss(r2 - 2.4, 1.6, 290, 22, 0.55) +
      outline(r1 + 0.4, 1.4, "#3d0c07", 0.6) +
      studs +
      burst(47, 21, 0, 97) + burst(205, 11, 8, 92);
    return doc(body, defs);
  },
  glow: ({ ra }) => {
    const sp = [[47, 118, 4.2], [-30, 92, 3.2], [205, 106, 3]];
    return doc(sp.map(([d, r, s]) => `<path d="${sparkAt(r, d, s * 1.6, 0.2)}" fill="#fff6c8"/>`).join(""));
  },
};

// ============================================================ POISON
const dripPath = (x, y, len, w) =>
  `M${g(x - w)} ${g(y)}C${g(x - w * 0.5)} ${g(y + len * 0.35)} ${g(x - w * 0.4)} ${g(y + len * 0.6)} ${g(x - w * 1.35)} ${g(y + len - w * 1.35)}A${g(w * 1.35)} ${g(w * 1.35)} 0 1 0 ${g(x + w * 1.35)} ${g(y + len - w * 1.35)}C${g(x + w * 0.4)} ${g(y + len * 0.6)} ${g(x + w * 0.5)} ${g(y + len * 0.35)} ${g(x + w)} ${g(y)}Z`;
const poison = {
  id: "type-poison",
  name: "Poison",
  group: "Types",
  of: 0.22,
  c: ["#b24bd0", "#6a2a9a"],
  fx: "drift",
  fxs: 3.6,
  base: ({ ra }) => {
    const r1 = ra - 1.5;
    const r2 = ra + 9;
    const R = rnd(5);
    const drips = [[96, 11, 2.4], [108, 20, 3.1], [122, 14, 2.5], [136, 28, 3.4], [151, 12, 2.3], [165, 22, 3], [180, 14, 2.6], [194, 27, 3.3], [208, 11, 2.3], [223, 20, 3], [237, 14, 2.4], [251, 24, 3.2], [264, 11, 2.3]].map(([d, len, w]) => {
      const [x, y] = pt(r2 - 2, d);
      const L = Math.min(len + 6, 196 - y);
      return `<path d="${dripPath(x, y, L, w)}" fill="url(#pd)" stroke="#2a0a40" stroke-opacity=".6" stroke-width=".8"/><circle cx="${g(x - w * 0.55)}" cy="${g(y + L - w * 1.7)}" r="${g(w * 0.35)}" fill="#fff" fill-opacity=".7"/>`;
    }).join("");
    const bubbles = [[-12, 10, 5.2], [14, 6, 4.2], [-34, 6, 3.4], [38, 4, 3.8], [-62, 8, 3], [64, 7, 4.4], [-84, 3, 3]].map(([d, extra, rr]) => {
      const [x, y] = pt(r2 + extra, d);
      return `<circle cx="${g(x)}" cy="${g(y)}" r="${rr}" fill="url(#pbb)" stroke="#e9a8ff" stroke-opacity=".85" stroke-width=".9"/><circle cx="${g(x - rr * 0.35)}" cy="${g(y - rr * 0.38)}" r="${g(rr * 0.28)}" fill="#fff" fill-opacity=".9"/>`;
    }).join("");
    const mid = (r1 + r2) / 2;
    const slime = `<path d="${wavy(mid, 2.2, 40, 10)}" fill="none" stroke="#e7a0ff" stroke-opacity=".45" stroke-width="1.3"/><path d="${wavy(mid + 3.4, 1.6, 36, 14, 80)}" fill="none" stroke="#1d0833" stroke-opacity=".4" stroke-width="1"/>`;
    const defs =
      lin("pb", [[0, "#d98cf0"], [0.45, "#a040c0"], [1, "#4a1a72"]], [40, 20, 160, 180]) +
      lin("pd", [[0, "#c46ae0"], [1, "#7a2aa8"]], [0, 100, 0, 200]) +
      rg("pbb", [[0, "#f6d6ff", 0.4], [1, "#a040c0", 0.55]], [C, C, 6]);
    const body =
      drips +
      outline(r2 + 0.2, 1.4, "#2a0a40", 0.65) +
      `<path d="${donut(r1, r2)}" fill="url(#pb)"/>` +
      slime +
      gloss(r2 - 2.4, 1.8, 290, 22, 0.55, "#f6d6ff") +
      outline(r1 + 0.4, 1.4, "#1d0833", 0.6) +
      bubbles;
    return doc(body, defs);
  },
  glow: () => {
    const b = [[-24, 92, 2.4], [20, 94, 3], [52, 88, 2], [-56, 86, 2.2], [4, 99, 1.8], [-8, 90, 1.5]];
    return doc(b.map(([d, r, s]) => `<circle cx="${g(pt(Math.min(r, rmax(d) - 4), d)[0])}" cy="${g(pt(Math.min(r, rmax(d) - 4), d)[1])}" r="${s}" fill="none" stroke="#f0b6ff" stroke-width="1.1"/>`).join(""));
  },
};

// ============================================================ GROUND
const crack = (d, r1, r2, seed) => {
  const R = rnd(seed);
  let out = "";
  let a = d;
  for (let r = r1, i = 0; r <= r2; r += 2.6, i++) {
    a += (R() - 0.5) * 3.4;
    const [x, y] = pt(r, a);
    out += `${i ? "L" : "M"}${g(x)} ${g(y)}`;
  }
  return out;
};
const ground = {
  id: "type-ground",
  name: "Ground",
  group: "Types",
  of: 0.2,
  c: ["#e0c068", "#8a5a28"],
  base: ({ ra }) => {
    const r1 = ra - 1.5;
    const r2 = ra + 11.5;
    const circle = (r) => `M${g(C - r)} ${C}A${g(r)} ${g(r)} 0 1 0 ${g(C + r)} ${C}A${g(r)} ${g(r)} 0 1 0 ${g(C - r)} ${C}Z`;
    const layer = (rr, amp, freq, ph, fill) => `<path fill-rule="evenodd" d="${wavy(rr, amp, 30, freq, ph)}${circle(r1)}" fill="${fill}"/>`;
    const R = rnd(21);
    const pebbles = Array.from({ length: 17 }, (_, i) => {
      const d = 92 + i * 11.8 + R() * 4;
      const sz = 3 + R() * 3.2 + (Math.abs(d - 180) < 50 ? 1.2 : 0);
      const pts = Array.from({ length: 6 }, (_, k) => {
        const a = rad(k * 60 + R() * 30);
        const rr = sz * (0.78 + R() * 0.38);
        return [rr * Math.sin(a), -rr * Math.cos(a)];
      });
      const [x, y] = pt(r2 + sz * 0.3 + R() * 2.5, d);
      return `<g transform="translate(${g(Math.min(Math.max(x, sz + 3), 197 - sz))} ${g(Math.min(Math.max(y, sz + 3), 197 - sz))})"><path d="${poly(pts)}" fill="url(#gr${i % 2})" stroke="#4a2c12" stroke-opacity=".75" stroke-width=".8" stroke-linejoin="round"/><path d="${poly(pts.slice(0, 3).concat([[0, 0]]))}" fill="#fff" fill-opacity=".25"/></g>`;
    }).join("");
    const top = Array.from({ length: 7 }, (_, i) => {
      const d = -70 + i * 23 + R() * 6;
      const sz = 2.6 + R() * 2;
      const [x, y] = pt(r2 + sz * 0.5, d);
      return `<circle cx="${g(x)}" cy="${g(y)}" r="${g(sz)}" fill="url(#gr${i % 2})" stroke="#4a2c12" stroke-opacity=".7" stroke-width=".8"/>`;
    }).join("");
    const defs =
      lin("gr0", [[0, "#e8c88a"], [1, "#a8642a"]], [-3, -4, 4, 5]) +
      lin("gr1", [[0, "#b87a3a"], [1, "#4a2a10"]], [-3, -4, 4, 5]);
    const bigCrack = crack(150, r1 - 0.2, r2 - 0.2, 91);
    const bigCrack2 = crack(318, r1 - 0.2, r2 - 0.2, 93);
    const cracks = [`<path d="${bigCrack2}" fill="none" stroke="#1a0c04" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round"/><path d="${bigCrack}" fill="none" stroke="#1a0c04" stroke-width="3.6" stroke-linejoin="round" stroke-linecap="round"/><path d="${bigCrack}" fill="none" stroke="#f0c888" stroke-opacity=".75" stroke-width=".7" stroke-linejoin="round" transform="translate(.9 .5)"/>`]
      .concat([34, 244].map((d, i) => `<path d="${crack(d, r1 + 4, r2 - 0.5, 95 + i)}" fill="none" stroke="#1a0c04" stroke-opacity=".9" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`)).join("");
    const edge = (rr, amp, freq, ph) => `<path d="${wavy(rr, amp, 30, freq, ph)}" fill="none" stroke="#2a1608" stroke-opacity=".55" stroke-width=".9"/>`;
    const body =
      outline(r2 + 0.4, 1.4, "#2a1708", 0.7) +
      `<path d="${donut(r1, r2)}" fill="#4a2a10"/>` +
      layer(r2 - 4.2, 1.4, 7, 60, "#a8642a") + edge(r2 - 4.2, 1.4, 7, 60) +
      layer(r2 - 8.4, 1.3, 9, 150, "#e2bc7c") + edge(r2 - 8.4, 1.3, 9, 150) +
      `<path d="${wavy(r2 - 8.9, 1.3, 30, 9, 150)}" fill="none" stroke="#fff2cc" stroke-opacity=".5" stroke-width=".7" transform="translate(-.4 -.4)"/>` +
      cracks +
      gloss(r2 - 1.6, 1.4, 290, 22, 0.35, "#ffe2b0") +
      outline(r1 + 0.4, 1.4, "#2a1708", 0.65) +
      pebbles + top;
    return doc(body, defs);
  },
};

// ============================================================ FLYING
const feather = (L, w) => `M0 0C${g(w * 1.2)} ${g(-L * 0.2)} ${g(w * 1.1)} ${g(-L * 0.7)} ${g(w * 0.3)} ${g(-L)}C${g(-w * 0.2)} ${g(-L * 0.72)} ${g(-w * 1.1)} ${g(-L * 0.3)} 0 0Z`;
const flying = {
  id: "type-flying",
  name: "Flying",
  group: "Types",
  of: 0.24,
  c: ["#a890f0", "#d9ecff"],
  fx: "drift",
  fxs: 4,
  base: ({ ra }) => {
    const r1 = ra - 1.5;
    const r2 = ra + 7;
    const fit = (x, y, phi, L) => {
      const dx = Math.sin(rad(phi));
      const dy = -Math.cos(rad(phi));
      let m = L;
      if (dx > 0.01) m = Math.min(m, (194 - x) / dx);
      if (dx < -0.01) m = Math.min(m, (6 - x) / dx);
      if (dy > 0.01) m = Math.min(m, (194 - y) / dy);
      if (dy < -0.01) m = Math.min(m, (6 - y) / dy);
      return Math.max(6, m);
    };
    const wf = (L, w) => `M0 0C${g(w * 1.15)} ${g(-L * 0.15)} ${g(w * 1.25)} ${g(-L * 0.65)} ${g(w * 0.45)} ${g(-L * 0.96)}Q0 ${g(-L * 1.03)} ${g(-w * 0.25)} ${g(-L * 0.94)}C${g(-w)} ${g(-L * 0.6)} ${g(-w * 1.05)} ${g(-L * 0.2)} 0 0Z`;
    const wing = (sgn) => {
      let out = "";
      // four fans from the ring's side, back to front: shadow flight feathers, light flight feathers, two rows of coverts
      const rows = [
        { piv: 76, n: 9, rib: 0, p0: 14, p1: 112, L: [62, 16], w: 12.5, fill: "url(#fs)", st: "#2e2a78", dx: 0, so: 0.85 },
        { piv: 80, n: 8, rib: 1, p0: 20, p1: 108, L: [55, 15], w: 11.5, fill: "url(#fw)", st: "#4a5ab8", dx: 0, so: 0.8 },
        { piv: 84, n: 6, rib: 0, p0: 26, p1: 104, L: [34, 11], w: 9, fill: "url(#fm)", st: "#5a6ac0", dx: 0, so: 0.7 },
        { piv: 88, n: 5, rib: 0, p0: 32, p1: 100, L: [19, 8], w: 6.4, fill: "url(#fv)", st: "#6a7ac8", dx: 0, so: 0.6 },
      ];
      for (const row of rows) {
        const deg = sgn * row.piv;
        const [px, py] = pt(r2 - 3, deg);
        let inner = "";
        for (let i = 0; i < row.n; i++) {
          const t = i / (row.n - 1);
          const phi = sgn * (row.p0 + (row.p1 - row.p0) * t);
          const L = fit(px, py, phi, row.L[0] + (row.L[1] - row.L[0]) * Math.pow(t, 0.85));
          inner += `<g transform="rotate(${g(phi)})"><path d="${wf(L, row.w * (1 - t * 0.35))}"/>${row.rib ? `<path d="M0 -2Q.8 ${g(-L * 0.5)} .4 ${g(-L * 0.88)}" fill="none" stroke="#4a5ab8" stroke-opacity=".45" stroke-width=".6"/>` : ""}</g>`;
        }
        out += `<g transform="translate(${g(px)} ${g(py)})" fill="${row.fill}" stroke="${row.st}" stroke-opacity=".8" stroke-width=".8" stroke-linejoin="round">${inner}</g>`;
      }
      return out;
    };
    const defs =
      lin("fb", [[0, "#eaf2ff"], [0.5, "#9ab4f4"], [1, "#4a56b0"]], [40, 20, 160, 180]) +
      lin("fw", [[0, "#ffffff"], [0.55, "#d2e6ff"], [1, "#8fb0f0"]], [0, 0, 0, -52]) +
      lin("fv", [[0, "#ffffff"], [1, "#d6ecff"]], [0, 0, 0, -16]) +
      lin("fm", [[0, "#ffffff"], [0.7, "#e2f0ff"], [1, "#a8c4f4"]], [0, 0, 0, -30]) +
      lin("fs", [[0, "#8aa0ee"], [1, "#3a3f9a"]], [0, 0, 0, -56]);
    const body =
      wing(-1) + wing(1) +
      outline(r2 + 0.2, 1.4, "#2e2468", 0.6) +
      `<path d="${donut(r1, r2)}" fill="url(#fb)"/>` +
      `<path d="${arc(r1 + 4.8, 0, 359.9)}" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width=".7"/>` +
      gloss(r2 - 2, 1.6, 290, 22, 0.8) +
      outline(r1 + 0.4, 1.4, "#241a58", 0.55);
    return doc(body, defs);
  },
  glow: () => {
    const fe = [[-16, 92, 0], [24, 94, 30], [4, 98, -20], [-40, 90, 40]];
    return doc(fe.map(([d, r0, rot]) => at(Math.min(r0, rmax(d) - 14), d, `<g transform="rotate(${rot})"><path d="${feather(9, 3)}" fill="#ffffff" fill-opacity=".9"/></g>`)).join(""));
  },
};

// ============================================================ PSYCHIC
const psychic = {
  id: "type-psychic",
  name: "Psychic",
  group: "Types",
  of: 0.22,
  c: ["#ff5d9a", "#b01a6e"],
  fx: "spin",
  fxs: 16,
  base: ({ ra }) => {
    const r1 = ra - 1.5;
    const r2 = ra + 9;
    const swirls = around(22, (d) => {
      const [a, b, c, e] = [pt(r1 + 1, d), pt(r2 - 4, d + 7), pt(r2 - 1, d + 16), pt(r2 - 1, d + 19)];
      return `<path d="M${g(a[0])} ${g(a[1])}Q${g(b[0])} ${g(b[1])} ${g(c[0])} ${g(c[1])}" fill="none" stroke="#ffd0e6" stroke-opacity=".5" stroke-width="1.4" stroke-linecap="round"/>`;
    }, 12);
    const eye = at(r2 - 1, 0, `<g transform="scale(1.1)"><path d="M-15 0Q0 -17 15 0Q0 14 -15 0Z" fill="url(#ps)" stroke="#3d0a2a" stroke-width="1.3" stroke-linejoin="round"/><circle r="6.6" fill="url(#pi)"/><circle r="3.1" fill="#2a0620"/><circle cx="-1.8" cy="-1.9" r="1.4" fill="#fff"/><path d="M-12 -2Q0 -11 12 -2" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width=".9"/><path d="M0 -14L0 -16.5M-8 -12L-10 -14.5M8 -12L10 -14.5" stroke="#ffd0e6" stroke-width="1.3" stroke-linecap="round"/></g>`);
    const defs =
      lin("pb", [[0, "#ff9ac0"], [0.5, "#e02a82"], [1, "#6a0f4a"]], [40, 20, 160, 180]) +
      lin("ps", [[0, "#ffffff"], [1, "#f6c3dd"]], [0, -14, 0, 14]) +
      rg("pi", [[0, "#ff7ab8"], [0.7, "#c01a6e"], [1, "#6a0f4a"]], [C, C, 7]);
    const stars = [[-1, 0, 0], [45, 0, 4.2], [90, 1, 3], [135, 0, 4.4], [180, 1, 3.6], [225, 0, 4.2], [270, 0, 3]].slice(1).map(([d, e, s]) => `<path d="${sparkAt(r2 + 6 + e * 3, d, s * 1.5, 0.2)}" fill="#ffe6f2" stroke="#7a0f4a" stroke-width=".7" stroke-linejoin="round"/>`).join("");
    const body =
      outline(r2 + 0.2, 1.4, "#3d0a2a", 0.65) +
      `<path d="${donut(r1, r2)}" fill="url(#pb)"/>` +
      swirls +
      gloss(r2 - 2.2, 1.7, 290, 22, 0.6, "#ffe0ef") +
      outline(r1 + 0.4, 1.4, "#3d0a2a", 0.6) +
      stars + eye;
    return doc(body, defs);
  },
  glow: ({ ra }) => {
    const r = ra + 17;
    const o = [[40, 3.2], [100, 2.4], [160, 3.6], [220, 2.6], [280, 3.2], [330, 2.2]];
    return doc(
      `<path d="${arc(r, 20, 120)}" fill="none" stroke="#ffbfe0" stroke-opacity=".35" stroke-width="1" stroke-linecap="round"/><path d="${arc(r, 200, 300)}" fill="none" stroke="#ffbfe0" stroke-opacity=".35" stroke-width="1" stroke-linecap="round"/>` +
        o.map(([d, s]) => `<path d="${sparkAt(r, d, s * 1.7, 0.18)}" fill="#fff"/>`).join("")
    );
  },
};

// ============================================================ BUG
const bug = {
  id: "type-bug",
  name: "Bug",
  group: "Types",
  of: 0.22,
  c: ["#b5c52a", "#5a7a14"],
  fx: "sway",
  fxs: 4.5,
  base: ({ ra }) => {
    const r1 = ra - 1.5;
    const R1 = 6.6;
    const rA = r1 + R1 * 0.92;
    const N = 40;
    const hexAbs = (r, d, R) => {
      const [x, y] = pt(r, d);
      return poly(Array.from({ length: 6 }, (_, k) => [x + R * Math.sin(rad(d + k * 60)), y - R * Math.cos(rad(d + k * 60))]));
    };
    const rB = rA + R1 * 1.3;
    const R2 = 3.9;
    let greenD = "";
    let honeyD = "";
    for (let i = 0; i < N; i++) {
      const d = (i * 360) / N;
      if (i % 5 === 2) honeyD += hexAbs(rA, d, R1);
      else greenD += hexAbs(rA, d, R1);
      const d2 = d + 360 / N / 2;
      if (i % 4 === 1) honeyD += hexAbs(rB, d2, R2);
      else greenD += hexAbs(rB, d2, R2);
    }
    const hexes = `<g stroke="#2c3d08" stroke-opacity=".8" stroke-width=".9" stroke-linejoin="round"><path d="${greenD}" fill="url(#bg)"/><path d="${honeyD}" fill="url(#bh)"/></g>`;
    const rOut = rB + R2;
    const ant = (sgn) =>
      `<path d="M${g(100 + sgn * 7)} ${g(100 - rOut + 5)}C${g(100 + sgn * 9)} ${g(100 - rOut - 8)} ${g(100 + sgn * 17)} ${g(100 - rOut - 10)} ${g(100 + sgn * 25)} ${g(100 - rOut - 6)}" fill="none" stroke="#2c3d08" stroke-width="3.4" stroke-linecap="round"/><path d="M${g(100 + sgn * 7)} ${g(100 - rOut + 5)}C${g(100 + sgn * 9)} ${g(100 - rOut - 8)} ${g(100 + sgn * 17)} ${g(100 - rOut - 10)} ${g(100 + sgn * 25)} ${g(100 - rOut - 6)}" fill="none" stroke="url(#bb2)" stroke-width="1.8" stroke-linecap="round"/><circle cx="${g(100 + sgn * 26)}" cy="${g(100 - rOut - 6)}" r="3.6" fill="#ffd23a" stroke="#2c3d08" stroke-width="1"/><circle cx="${g(100 + sgn * 25)}" cy="${g(100 - rOut - 7.2)}" r="1.1" fill="#fff" fill-opacity=".85"/>`;
    const defs =
      lin("bg", [[0, "#dfee66"], [0.5, "#a8b820"], [1, "#5a7410"]], [40, 20, 160, 180]) +
      lin("bh", [[0, "#ffe88a"], [0.5, "#f2b21c"], [1, "#b8700a"]], [40, 20, 160, 180]) +
      lin("bb2", [[0, "#d6e45a"], [1, "#7a9a1a"]], [100, 0, 130, 30]);
    const body =
      ant(-1) + ant(1) +
      outline(rOut + 0.3, 1.3, "#1d2a04", 0.6) +
      `<path d="${donut(r1, rOut - 1)}" fill="#3f5a0c"/>` +
      hexes +
      gloss(rOut - 1.4, 1.5, 290, 20, 0.5, "#f4ffb0") +
      outline(r1 + 0.4, 1.4, "#1d2a04", 0.6);
    return doc(body, defs);
  },
  glow: () => {
    const f2 = [[-30, 92], [34, 90], [60, 94], [-62, 92], [140, 94], [-150, 96]];
    return doc(f2.map(([d, r], i) => `<circle cx="${g(pt(Math.min(r, rmax(d) - 4), d)[0])}" cy="${g(pt(Math.min(r, rmax(d) - 4), d)[1])}" r="${i % 2 ? 1.4 : 1.9}" fill="#f4ff9a"/>`).join(""));
  },
};

// ============================================================ ROCK
const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mixHex = (a, b, t) => {
  const A = hex2rgb(a);
  const B = hex2rgb(b);
  return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join("");
};
const rock = {
  id: "type-rock",
  name: "Rock",
  group: "Types",
  of: 0.22,
  c: ["#c9b062", "#6e6248"],
  base: ({ ra }) => {
    const r1 = ra - 1.5;
    const r2 = ra + 6;
    const R = rnd(33);
    const boulders = around(13, (d, i) => {
      const sz = Math.min(9.5 + R() * 4.5 + (Math.cos(rad(d)) > 0.7 ? 2 : 0), (rmax(d) - r1 - 3.5) / 2.3);
      const [cx, cy] = pt(r2 + 1 + (i % 2) * 2.2, d);
      const n = 6;
      const verts = Array.from({ length: n }, (_, k) => {
        const a = rad(k * 60 + R() * 28 - 14 + d);
        const rr = sz * (0.82 + R() * 0.36);
        return [cx + rr * Math.sin(a), cy - rr * Math.cos(a)];
      });
      const dmin = Math.min(...verts.map(([x, y]) => Math.hypot(x - 100, y - 100)));
      if (dmin < r1 + 0.8) {
        const sh = r1 + 0.8 - dmin;
        const ux = Math.sin(rad(d));
        const uy = -Math.cos(rad(d));
        for (const v of verts) { v[0] += ux * sh; v[1] += uy * sh; }
      }
      const hub = [verts.reduce((a, v) => a + v[0], 0) / n - sz * 0.15, verts.reduce((a, v) => a + v[1], 0) / n - sz * 0.2];
      let tris = "";
      for (let k = 0; k < n; k++) {
        const a = verts[k];
        const b = verts[(k + 1) % n];
        const mx = (a[0] + b[0]) / 2 - hub[0];
        const my = (a[1] + b[1]) / 2 - hub[1];
        const len = Math.hypot(mx, my) || 1;
        const lit = (-mx - my) / len / 1.4142; // 1 = faces top left
        const col = mixHex("#4c4434", "#e2d6a8", Math.max(0, Math.min(1, 0.52 + lit * 0.5)));
        tris += `<path d="${poly([hub, a, b])}" fill="${col}"/>`;
      }
      return tris + `<path d="${poly(verts)}" fill="none" stroke="#1f1a10" stroke-opacity=".8" stroke-width="1" stroke-linejoin="round"/>`;
    }, 4);
    const defs = lin("kb", [[0, "#8a7e62"], [0.5, "#5f5640"], [1, "#2e281a"]], [40, 20, 160, 180]);
    const body =
      outline(r2 + 0.2, 1.4, "#14100a", 0.6) +
      `<path d="${donut(r1, r2)}" fill="url(#kb)"/>` +
      boulders +
      outline(r1 + 0.4, 1.5, "#14100a", 0.65);
    return doc(body, defs);
  },
};

// ============================================================ GHOST
const wisp = (w, L, c) => {
  const hy = -L + w;
  return `M${-w} ${g(hy)}A${w} ${w} 0 0 1 ${w} ${g(hy)}C${g(w * 0.9)} ${g(-L * 0.45)} ${g(w * 1.2 * c)} ${g(-L * 0.28)} ${g(c * w * 1.7)} 0C${g(-w * 0.2)} ${g(-L * 0.28)} ${g(-w * 1.2)} ${g(-L * 0.5)} ${-w} ${g(hy)}Z`;
};
const WISPS = [[0, 12, 27, 1], [45, 17, 54, 1], [-45, 17, 54, -1], [90, 11.5, 28, 1], [-90, 11.5, 28, -1], [135, 15, 46, 1], [-135, 15, 46, -1], [180, 11, 25, 1]];
const ghost = {
  id: "type-ghost",
  name: "Ghost",
  group: "Types",
  of: 0.24,
  c: ["#8a6cc8", "#3c2a68"],
  fx: "breathe",
  fxs: 3.6,
  base: ({ ra }) => {
    const r1 = ra - 1.5;
    const r2 = ra + 7;
    const wisps = WISPS.map(([d, w, L, c]) => {
      const Lc = Math.min(L, rmax(d) - (r2 - 4) - 1.5);
      const ey = g(-Lc + w * 0.95);
      const ex = g(w * 0.42);
      const eyes = `<ellipse cx="${-ex}" cy="${ey}" rx="${g(w * 0.24)}" ry="${g(w * 0.36)}" fill="#1a0a3a"/><ellipse cx="${ex}" cy="${ey}" rx="${g(w * 0.24)}" ry="${g(w * 0.36)}" fill="#1a0a3a"/><ellipse cx="${-ex}" cy="${ey}" rx="${g(w * 0.17)}" ry="${g(w * 0.28)}" fill="#fff9b8"/><ellipse cx="${ex}" cy="${ey}" rx="${g(w * 0.17)}" ry="${g(w * 0.28)}" fill="#fff9b8"/>`;
      return at(r2 - 3.5, d, `<path d="${wisp(w, Lc, c)}" fill="url(#hw)" stroke="#1a0f3a" stroke-opacity=".8" stroke-width="1" stroke-linejoin="round"/><path d="${wisp(w * 0.72, Lc * 0.7, c)}" fill="url(#hc)" transform="translate(0 ${g(-Lc * 0.12)})"/>${eyes}`);
    }).join("");
    const defs =
      lin("hb", [[0, "#9a7adb"], [0.5, "#5a3f9c"], [1, "#241648"]], [40, 20, 160, 180]) +
      lin("hw", [[0, "#a888f0"], [1, "#4a2a98"]], [0, -30, 0, 0]) +
      lin("hc", [[0, "#efe4ff"], [1, "#b898f4"]], [0, -30, 0, 0]);
    const body =
      wisps +
      outline(r2 + 0.2, 1.4, "#120a2c", 0.65) +
      `<path d="${donut(r1, r2)}" fill="url(#hb)"/>` +
      `<path d="${wavy((r1 + r2) / 2, 1.8, 40, 9)}" fill="none" stroke="#c9b0ff" stroke-opacity=".4" stroke-width="1.2"/>` +
      gloss(r2 - 1.8, 1.5, 290, 22, 0.45, "#e6d6ff") +
      outline(r1 + 0.4, 1.4, "#120a2c", 0.6);
    return doc(body, defs);
  },
  glow: ({ ra }) => {
    const r2 = ra + 7;
    const halos = WISPS.map(([d, w, L]) => {
      const Lc = Math.min(L, rmax(d) - (r2 - 4) - 1);
      const [x, y] = pt(r2 - 3.5 + Lc - w, d);
      return `<circle cx="${g(x)}" cy="${g(y)}" r="${g(Math.min(w * 1.7, 96 - Math.abs(x - 100), 96 - Math.abs(y - 100)))}" fill="url(#hg)"/>`;
    }).join("");
    return doc(halos, `<radialGradient id="hg"><stop offset="0" stop-color="#d9c0ff" stop-opacity=".5"/><stop offset="1" stop-color="#8a5ae0" stop-opacity="0"/></radialGradient>`);
  },
};

// ============================================================ DRAGON
const dragon = {
  id: "type-dragon",
  name: "Dragon",
  group: "Types",
  of: 0.22,
  c: ["#6a3cf0", "#18b5a8"],
  base: ({ ra }) => {
    const r1 = ra - 1.5;
    const r2 = ra + 10.5;
    const horn = (sgn) =>
      `<g transform="translate(${g(pt(r2 - 2.5, sgn * 45)[0])} ${g(pt(r2 - 2.5, sgn * 45)[1])}) rotate(${sgn * 40}) scale(${sgn * 1.2} 1.2)"><path d="M-9 4C-11-8-5-19 6-25C13-29 21-28 26-23C18-24 13-20 11-12C9-5 10-1 11 4Z" fill="url(#dh)" stroke="#2a1d52" stroke-width="1" stroke-linejoin="round"/><path d="M-5 0C-7-8-3-16 5-21" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="1.1" stroke-linecap="round"/><path d="M-5 -5L4 -6M-4 -11L5 -12" stroke="#7a68a8" stroke-opacity=".7" stroke-width=".9"/></g>`;
    const talon = (x0, x1, h) => `<path d="M${x0} 0C${x0 - 1}-7 ${x0 + 1}-${h - 6} ${x1}-${h}C${x1 + 3}-${h - 8} ${x1 + 4}-6 ${x0 + 6} 0Z" fill="url(#dh)" stroke="#2a1d52" stroke-width=".9" stroke-linejoin="round"/>`;
    const claw = (d, tilt) => at(r2 - 1, d, talon(-7, -3, 23) + talon(-1, 4, 27) + talon(5, 11, 21), `rotate(${tilt}) scale(1.1)`);
    const rA = (r1 + r2) / 2 - 3;
    const n = 36;
    const scales = (r, off, sz) => {
      let dd = "";
      for (let i = 0; i < n; i++) {
        const a0 = off + (i * 360) / n;
        const [x0, y0] = pt(r, a0 - 4.5);
        const [x1, y1] = pt(r, a0 + 4.5);
        dd += `M${g(x0)} ${g(y0)}A${sz} ${sz} 0 0 0 ${g(x1)} ${g(y1)}`;
      }
      return dd;
    };
    const spine = (i) => `<path d="M-3.4 0L0 ${-(7 + (i % 2) * 2.4)}L3.4 0Z" fill="url(#ds)" stroke="#0e2a2e" stroke-width=".8" stroke-linejoin="round"/>`;
    const defs =
      lin("db", [[0, "#5ae0c8"], [0.4, "#3a6ee0"], [1, "#2a1a78"]], [40, 20, 160, 180]) +
      lin("dh", [[0, "#fffbe8"], [0.6, "#d8caa8"], [1, "#8a7a5e"]], [-4, -22, 8, 2]) +
      lin("ds", [[0, "#7af0d8"], [1, "#1a7a88"]], [0, -10, 0, 0]);
    const spines = [-120, -96, -72, -48, 48, 72, 96, 120].map((d, i) => at(r2 - 2, d, spine(i))).join("");
    const body =
      horn(-1) + horn(1) +
      claw(146, -8) + claw(-146, 8) +
      spines +
      outline(r2 + 0.2, 1.4, "#0a1038", 0.65) +
      `<path d="${donut(r1, r2)}" fill="url(#db)"/>` +
      `<path d="${scales(rA + 8, 0, 6)}${scales(rA + 4, 5, 6)}${scales(rA, 0, 6)}" fill="none" stroke="#0a1038" stroke-opacity=".55" stroke-width="1.1"/>` +
      `<path d="${scales(rA + 7.2, 0, 6)}${scales(rA + 3.2, 5, 6)}${scales(rA - 0.8, 0, 6)}" fill="none" stroke="#9af5e6" stroke-opacity=".5" stroke-width=".7"/>` +
      gloss(r2 - 1.8, 1.6, 290, 22, 0.55, "#d4fff6") +
      outline(r1 + 0.4, 1.4, "#0a1038", 0.6);
    return doc(body, defs);
  },
};

// ============================================================ DARK
const dark = {
  id: "type-dark",
  name: "Dark",
  group: "Types",
  of: 0.2,
  c: ["#8a6a58", "#1c1620"],
  fx: "pulse",
  fxs: 3.2,
  base: ({ ra }) => {
    const r1 = ra - 1.5;
    const r2 = ra + 10;
    const thorns = around(18, (d, i) => at(r2 - 1.5, d, `<path d="M-5 0L${i % 2 ? 1 : 0} ${-(i % 3 === 0 ? 14 : 9)}L5 0Z" fill="url(#kt)" stroke="#8a86c8" stroke-opacity=".9" stroke-width=".9" stroke-linejoin="round"/><path d="M-3 -1L0 ${-(i % 3 === 0 ? 11 : 6.5)}" stroke="#b4a4e0" stroke-opacity=".85" stroke-width=".7" fill="none"/>`), 5);
    const eye = (d) => at((r1 + r2) / 2, d, `<g transform="scale(1.75)"><path d="M-6 .4Q0 -3.6 6 -1.6Q1 2.6 -6 .4Z" fill="#150508" stroke="#ff4a3a" stroke-opacity=".9" stroke-width=".6"/><path d="M-4.6 .2Q.2 -2.6 4.8 -1.3Q1 1.6 -4.6 .2Z" fill="url(#ke)"/><path d="M-2 .2Q.4 -1.4 2.6 -.8" fill="none" stroke="#fff" stroke-opacity=".9" stroke-width=".5" stroke-linecap="round"/></g>`);
    const defs =
      lin("kb", [[0, "#a8a0d0"], [0.35, "#54486a"], [1, "#171020"]], [40, 20, 160, 180]) +
      lin("kt", [[0, "#6a5a82"], [1, "#14101c"]], [0, -14, 0, 0]) +
      lin("ke", [[0, "#ffe6d0"], [0.35, "#ff5a30"], [1, "#d01020"]], [-5, 0, 5, 0]) +
      lin("km", [[0, "#ffffff"], [0.5, "#d8cce8"], [1, "#8a7aa8"]], [-16, -16, 6, 16]);
    const moon = at(r2 + 18, 46, `<g transform="rotate(${-46 + 22}) scale(1.35)"><path d="M0 -16A16 16 0 1 0 0 16A21 21 0 0 1 0 -16Z" fill="url(#km)" stroke="#0a070e" stroke-width="1.2" stroke-linejoin="round"/><path d="M-3 -12A12 12 0 0 0 -3 12" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="1" stroke-linecap="round"/></g>`);
    const body =
      thorns +
      outline(r2 + 0.2, 1.4, "#06040a", 0.8) +
      `<path d="${donut(r1, r2)}" fill="url(#kb)"/>` +
      `<path d="${arc(r2 - 0.9, 0, 359.9)}" fill="none" stroke="#c4d0ff" stroke-opacity=".85" stroke-width=".9"/><path d="${arc(r1 + 1.3, 0, 359.9)}" fill="none" stroke="#8a96d8" stroke-opacity=".8" stroke-width=".8"/><path d="${arc(r2 - 0.9, 262, 392)}" fill="none" stroke="#fff" stroke-opacity=".9" stroke-width="1.3" stroke-linecap="round"/>` +
      `<path d="${wavy((r1 + r2) / 2, 1.5, 36, 7)}" fill="none" stroke="#6a5a78" stroke-opacity=".3" stroke-width="1"/>` +
      eye(150) + eye(210) + eye(90) + eye(270) +
      gloss(r2 - 2.2, 1.6, 290, 22, 0.35, "#e0d0f0") +
      outline(r1 + 0.4, 1.5, "#06040a", 0.75) +
      moon;
    return doc(body, defs);
  },
  glow: ({ ra }) => {
    const r = (ra - 1.5 + ra + 8.5) / 2;
    return doc([150, 210, 90, 270].map((d) => `<ellipse cx="${g(pt(r, d)[0])}" cy="${g(pt(r, d)[1])}" rx="9.5" ry="4.6" fill="#ff2a2a" fill-opacity=".5"/>`).join(""));
  },
};

// ============================================================ STEEL
const steel = {
  id: "type-steel",
  name: "Steel",
  group: "Types",
  of: 0.18,
  c: ["#c4c8d8", "#6a7088"],
  fx: "spin",
  fxs: 40,
  base: ({ ra }) => {
    const r1 = ra - 1.5;
    const r2 = ra + 8;
    const rt = r2 + 6;
    const N = 18;
    const teeth = around(N, (d) => {
      const w0 = 360 / N;
      return `<path d="${poly([pt(r2 - 2, d - w0 * 0.32), pt(rt, d - w0 * 0.2), pt(rt, d + w0 * 0.2), pt(r2 - 2, d + w0 * 0.32)])}" fill="url(#sb)" stroke="#20243a" stroke-opacity=".85" stroke-width="1" stroke-linejoin="round"/>`;
    }, 0);
    const mid = (r1 + r2) / 2;
    const bolts = around(9, (d) => at(mid, d, `<g transform="rotate(${-d})"><circle r="4" fill="#20243a" fill-opacity=".7"/><path d="${hexPath(3.5, 0)}" fill="url(#sx)" stroke="#20243a" stroke-opacity=".8" stroke-width=".6"/><path d="M-2 .4L2 -.4" stroke="#20243a" stroke-opacity=".8" stroke-width=".9"/></g>`), 20);
    let seamPath = "";
    for (let i = 0; i < 9; i++) {
      const [x0, y0] = pt(r1, i * 40);
      const [x1, y1] = pt(r2, i * 40);
      seamPath += `M${g(x0)} ${g(y0)}L${g(x1)} ${g(y1)}`;
    }
    const defs =
      lin("sb", [[0, "#f2f4fa"], [0.35, "#b4bace"], [0.7, "#7a8098"], [1, "#4a5068"]], [30, 10, 170, 190]) +
      rg("sx", [[0, "#f2f4fa"], [1, "#6a7088"]], [-1, -1, 5]);
    const body =
      outline(rt + 0.2, 1.3, "#14172a", 0.6) +
      teeth +
      outline(r2 + 0.2, 1.2, "#20243a", 0.6) +
      `<path d="${donut(r1, r2)}" fill="url(#sb)"/>` +
      `<path d="${arc(r1 + 2.2, 0, 359.9)}" fill="none" stroke="#20243a" stroke-opacity=".35" stroke-width=".7"/><path d="${arc(r2 - 2.2, 0, 359.9)}" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width=".7"/>` +
      `<path d="${seamPath}" stroke="#20243a" stroke-opacity=".7" stroke-width="1" fill="none"/>` +
      bolts +
      gloss(r2 - 1.2, 1.6, 290, 22, 0.8) +
      outline(r1 + 0.4, 1.5, "#14172a", 0.65);
    return doc(body, defs);
  },
  glow: ({ ra }) => {
    const rt = ra + 14;
    return doc(`<path d="${arc(rt - 1, 300, 346)}" fill="none" stroke="#ffffff" stroke-opacity=".8" stroke-width="2" stroke-linecap="round"/>`);
  },
};

// ============================================================ FAIRY
const bowLoop = (sgn) => `M0 0C${sgn * 4} -14 ${sgn * 20} -22 ${sgn * 27} -13C${sgn * 31} -6 ${sgn * 22} 5 ${sgn * 8} 3C${sgn * 4} 2 ${sgn * 1} 1 0 0Z`;
const FSP = [[-34, 12, 4.4], [32, 14, 5.2], [74, 9, 3.8], [-78, 10, 4.2], [128, 9, 4.4], [-128, 10, 3.6], [180, 11, 4.6]];
const fairy = {
  id: "type-fairy",
  name: "Fairy",
  group: "Types",
  of: 0.22,
  c: ["#ff9ccc", "#c06ab0"],
  fx: "pulse",
  fxs: 2.4,
  base: ({ ra }) => {
    const r1 = ra - 1.5;
    const r2 = ra + 8;
    const mid = (r1 + r2) / 2;
    const pearls = around(30, (d, i) => {
      const [x, y] = pt(mid, d);
      return `<circle cx="${g(x)}" cy="${g(y)}" r="${i % 2 ? 1.4 : 2.1}" fill="${i % 2 ? "#ffe0f0" : "#fff"}" stroke="#a04880" stroke-opacity=".55" stroke-width=".5"/>`;
    }, 24);
    const tail = (sgn) => `<path d="${arc(r2 + 0.5, sgn * 6, sgn * 58)}" fill="none" stroke="#7a2a68" stroke-width="6.4"/><path d="${arc(r2 + 0.5, sgn * 6, sgn * 58)}" fill="none" stroke="url(#yr)" stroke-width="4.4"/>`;
    const notch = (sgn) => at(r2 + 0.5, sgn * 58, `<path d="M-4 0L0 -4.4L4 0L4 3L0 .4L-4 3Z" fill="#ffb3d8" stroke="#7a2a68" stroke-width=".8" stroke-linejoin="round"/>`, `rotate(${sgn * 90})`);
    const bow = at(r2 + 2.5, 0, `<g transform="translate(0 -2) scale(.85)"><path d="${bowLoop(-1)}" fill="url(#yl)" stroke="#7a2a68" stroke-width="1.2" stroke-linejoin="round"/><path d="${bowLoop(1)}" fill="url(#yl)" stroke="#7a2a68" stroke-width="1.2" stroke-linejoin="round"/><path d="M-8 -3C-14 -9-21 -10-24 -9M8 -3C14 -9 21 -10 24 -9" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="1" stroke-linecap="round"/><path d="M-3 1L-9 11L-4 9L-1 12L1 2Z" fill="url(#yl)" stroke="#7a2a68" stroke-width="1" stroke-linejoin="round"/><path d="M3 1L9 11L4 9L1 12L-1 2Z" fill="url(#yl)" stroke="#7a2a68" stroke-width="1" stroke-linejoin="round"/><ellipse cx="0" cy="-1" rx="5" ry="4.6" fill="url(#yk)" stroke="#7a2a68" stroke-width="1.1"/><circle cx="-1.4" cy="-2.4" r="1.2" fill="#fff" fill-opacity=".85"/></g>`);
    const spk = FSP.map(([d, e, s]) => `<path d="${sparkAt(r2 + e, d, s * 1.5, 0.2)}" fill="#fff" stroke="#c0489a" stroke-width=".7" stroke-linejoin="round"/>`).join("");
    const defs =
      lin("yb", [[0, "#ffd0e6"], [0.5, "#ff9ccc"], [1, "#c8548f"]], [40, 20, 160, 180]) +
      lin("yl", [[0, "#ffe6f2"], [0.55, "#ff9ccc"], [1, "#d85a9a"]], [-20, -22, 20, 6]) +
      lin("yr", [[0, "#ffd0e6"], [1, "#e0629f"]], [60, 0, 140, 200]) +
      rg("yk", [[0, "#fff0f8"], [1, "#e0629f"]], [-1.5, -3, 6]);
    const body =
      outline(r2 + 0.2, 1.4, "#6a2058", 0.6) +
      `<path d="${donut(r1, r2)}" fill="url(#yb)"/>` +
      pearls +
      gloss(r2 - 1.6, 1.6, 290, 22, 0.7, "#fff") +
      outline(r1 + 0.4, 1.4, "#5a1848", 0.55) +
      tail(-1) + tail(1) + notch(-1) + notch(1) +
      bow + spk;
    return doc(body, defs);
  },
  glow: ({ ra }) => {
    const r2 = ra + 8;
    return doc(FSP.map(([d, e, s]) => `<path d="${sparkAt(r2 + e, d, s * 2, 0.2)}" fill="#fff" fill-opacity=".85"/>`).join(""));
  },
};

export const frames = [normal, fire, water, grass, electric, ice, fighting, poison, ground, flying, psychic, bug, rock, ghost, dragon, dark, steel, fairy];
