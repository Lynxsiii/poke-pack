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

/* ---- struck-medal helpers (one object: metal lips, enamel field, cast ornaments) ---------- */

const KEY = "#0d0a14";
const P = ([x, y]) => `${f1(x)} ${f1(y)}`;
/** Local (x across, y up = outward) to box coordinates for a motif placed at radius r, angle d. */
function place(r, d, s = 1, flip = false) {
  const [ox, oy] = pt(r, d), a = rad(d), ca = Math.cos(a), sa = Math.sin(a);
  return ([x, y]) => {
    x *= s * (flip ? -1 : 1); y *= s;
    return [ox + x * ca - y * sa, oy + x * sa + y * ca];
  };
}
/** Cubic bezier sample. */
const bez = (p0, p1, p2, p3, t) => {
  const u = 1 - t;
  return [0, 1].map((k) => u * u * u * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t * t * t * p3[k]);
};
/** A tapered ribbon along a centreline given as sampled [x,y] points, widths w0 to w1. */
function tape(pts, w0, w1) {
  const L = [], R = [];
  pts.forEach((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], m = Math.hypot(dx, dy) || 1;
    const w = (w0 + (w1 - w0) * (i / (pts.length - 1))) / 2;
    L.push([p[0] - (dy / m) * w, p[1] + (dx / m) * w]);
    R.push([p[0] + (dy / m) * w, p[1] - (dx / m) * w]);
  });
  return poly([...L, ...R.reverse()]);
}
/** Hard-edged concentric reflection bands across a ring: bands = [[to (0..1 across), colour], ...]. */
function bands(r1, r2, list) {
  let out = "", from = 0;
  for (const [to, col] of list) {
    out += `<path d="${donut(r1 + (r2 - r1) * from, r1 + (r2 - r1) * to + 0.05)}" fill="${col}"/>`;
    from = to;
  }
  return out;
}
/** A hard-edged diagonal sheen over a metal part: bright top left, a dark turn at the bottom right. */
const sheenDef = (id, hi = 0.3, lo = 0.3) =>
  lin(id, [[0, "#fff", hi], [0.3, "#fff", hi], [0.3, "#fff", 0], [0.6, "#fff", 0], [0.6, KEY, lo], [1, KEY, lo]], [26, 18, 174, 182]);
/** Outer keyline, inner keyline and the thin bright catch-lines every frame in the set shares. */
const KLDEF = lin("kl", [[0, "#fff", 0.2], [0.42, "#fff", 0], [0.6, KEY, 0], [1, KEY, 0.26]], [26, 18, 174, 182]);
const docK = (body, defs) => doc(body, defs + KLDEF);
function edges(r1, r2, hl = "#fff") {
  return (
    `<path d="${donut(r1, r2)}" fill="url(#kl)"/>` +
    `<circle cx="100" cy="100" r="${f(r1 + 1.3)}" fill="none" stroke="${hl}" stroke-opacity=".34" stroke-width=".8"/>` +
    `<circle cx="100" cy="100" r="${f(r2 - 0.9)}" fill="none" stroke="${hl}" stroke-opacity=".24" stroke-width=".8"/>` +
    `<circle cx="100" cy="100" r="${f(r2 + 0.9)}" fill="none" stroke="${KEY}" stroke-width="2"/>` +
    `<circle cx="100" cy="100" r="${f(r1 + 0.1)}" fill="none" stroke="${KEY}" stroke-opacity=".75" stroke-width="1.4"/>` +
    `<path d="${arc(r1 + 2.1, 250, 395)}" fill="none" stroke="${hl}" stroke-opacity=".5" stroke-width=".9" stroke-linecap="round"/>` +
    `<path d="${arc(r2 - 1.6, 262, 388)}" fill="none" stroke="${hl}" stroke-opacity=".6" stroke-width="1" stroke-linecap="round"/>`
  );
}
/** A small crescent catch-light. */
const cres = (x, y, rx, ry, rot, o = 0.6) => `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${rx}" ry="${ry}" fill="#fff" fill-opacity="${o}" transform="rotate(${rot} ${f1(x)} ${f1(y)})"/>`;
const keyed = (d, fill, w = 1.4, o = 1) => `<path d="${d}" fill="${fill}" stroke="${KEY}" stroke-opacity="${o}" stroke-width="${w}" stroke-linejoin="round"/>`;
/** A soft contact shadow under a cast ornament. */
const shadow = (d) => `<path d="${d}" fill="${KEY}" fill-opacity=".4" transform="translate(1 1.6)"/>`;
const clipDonut = (id, r1, r2) => `<clipPath id="${id}"><path d="${donut(r1, r2)}" clip-rule="evenodd"/></clipPath>`;

/* ---- the frames ------------------------------------------------------------ */

export const frames = [
  /* Bulbasaur: a green enamel ring with a dark vine rim, a plump split bulb at one o'clock bursting into leaves, a small sprout at eight. */
  {
    id: "mon-bulbasaur",
    name: "Bulbasaur",
    group: "Pokémon",
    of: 0.24,
    c: ["#4fb88e", "#8fe36a"],
    base: ({ ra }) => {
      const r1 = ra - 1.5, r2 = ra + 9.5, rm = (r1 + r2) / 2;
      const defs = sheenDef("bs") + clipDonut("bc", r1 + 2.2, r2 - 2.6);
      const rim =
        `<path d="${donut(r1, r2)}" fill="#1d4f3b"/>` +
        `<path d="${donut(r1 + 2.2, r2 - 2.6)}" fill="#58b48a"/>` +
        // darker band along the lower edge of the enamel, a hard step (flat colour, no blend)
        `<path d="${donut(r1 + 2.2, r1 + 4.4)}" fill="#3f9a78"/>` +
        // Bulbasaur's patches, off the hero's side
        `<g clip-path="url(#bc)">` +
        [[100, 5.6, 3.7, 20], [148, 4.8, 3.2, -25], [182, 6, 3.8, 10], [268, 5.8, 3.8, -15], [318, 5, 3.4, 25], [352, 4.6, 3.2, 0]]
          .map(([d, rx, ry, rot]) => at(rm, d, `<ellipse rx="${rx}" ry="${ry}" fill="#245f4c" transform="rotate(${rot})"/><ellipse cx="-1.2" cy="-1" rx="${f1(rx * 0.45)}" ry="${f1(ry * 0.35)}" fill="#fff" fill-opacity=".14" transform="rotate(${rot})"/>`))
          .join("") +
        `</g>` +
        // the vine: a lighter twist laid along the outer lip
        `<path d="${poly(Array.from({ length: 121 }, (_, i) => pt(r2 - 1.3 + 0.8 * Math.sin((i / 120) * Math.PI * 2 * 24), (i / 120) * 360)), false)}" fill="none" stroke="#7dcf6c" stroke-opacity=".85" stroke-width="1.2" stroke-linejoin="round"/>` +
        `<path d="${donut(r2 - 2.6, r2)}" fill="url(#bs)"/>`;
      const leaf = (a, len, wd, shade) => {
        const half = (s) => `M0 0C${f1(s * wd)} ${f1(-len * 0.28)} ${f1(s * wd * 0.8)} ${f1(-len * 0.72)} 0 ${-len}Z`;
        return `<g transform="translate(0 -17) rotate(${a})"><path d="${half(-1)}" fill="${shade ? "#5fcf62" : "#7fe27a"}"/><path d="${half(1)}" fill="${shade ? "#2f9a4a" : "#3aae52"}"/><path d="M0 0C${-wd} ${f1(-len * 0.28)} ${f1(-wd * 0.8)} ${f1(-len * 0.72)} 0 ${-len}C${f1(wd * 0.8)} ${f1(-len * 0.72)} ${wd} ${f1(-len * 0.28)} 0 0Z" fill="none" stroke="${KEY}" stroke-width="1.3" stroke-linejoin="round"/></g>`;
      };
      const D = 44;
      const hero = at(r2 - 4, D,
        // leaves first (behind the bulb), burst fan, uneven
        leaf(-60, 13, 6.2, 1) + leaf(-28, 17, 7.2, 0) + leaf(6, 20, 7.8, 1) + leaf(36, 16, 7, 0) + leaf(66, 12, 5.8, 1) +
        `<ellipse cx="0" cy="-9" rx="18.5" ry="13.4" fill="${KEY}" fill-opacity=".4" transform="translate(1 1.6)"/>` +
        `<ellipse cx="0" cy="-9" rx="18" ry="13" fill="#2f8f43" stroke="${KEY}" stroke-width="1.5"/>` +
        `<ellipse cx="-1.6" cy="-10.4" rx="15" ry="10.6" fill="#55bd57"/>` +
        // the split seam, a notch that opens toward the leaves
        `<path d="M0 -21.6L-2.6 -15L1.4 -10.6L-1 -4.4" fill="none" stroke="#1b5a2a" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>` +
        `<path d="M1.2 -19L-0.6 -14L2.9 -10L1.4 -5" fill="none" stroke="#9de88c" stroke-opacity=".7" stroke-width=".9" stroke-linecap="round" stroke-linejoin="round"/>` +
        `<path d="M-14 -9C-13 -14 -10 -18 -6 -19.6" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="2" stroke-linecap="round"/>`,
      "scale(1.11)");
      // the counterweight: a little sprout with two leaves and a curl, at eight o'clock
      const sprout = at(r2 - 4, 233,
        `<path d="M0 2C3 -6 -4 -12 2 -19C6 -23 12 -20 10 -15C8 -12 5 -14 6 -16" fill="none" stroke="${KEY}" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round"/>` +
        `<path d="M0 2C3 -6 -4 -12 2 -19C6 -23 12 -20 10 -15C8 -12 5 -14 6 -16" fill="none" stroke="#3aae52" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>` +
        `<g transform="translate(-1 -8) rotate(-62)"><path d="M0 0C-4 -4 -4 -10 0 -14C4 -10 4 -4 0 0Z" fill="#6fd86c" stroke="${KEY}" stroke-width="1.2" stroke-linejoin="round"/></g>` +
        `<g transform="translate(2 -14) rotate(52)"><path d="M0 0C-3.4 -3.6 -3.4 -8 0 -11.6C3.4 -8 3.4 -3.6 0 0Z" fill="#46bb58" stroke="${KEY}" stroke-width="1.2" stroke-linejoin="round"/></g>`,
      "scale(1.11)");
      return docK(sprout + hero + rim + edges(r1, r2, "#eafff0"), defs);
    },
  },

  /* Charizard: orange scaled ring with a cream belly plate, two ribbed wings with panelled membranes, a flame tail at five o'clock. */
  {
    id: "mon-charizard",
    name: "Charizard",
    group: "Pokémon",
    of: 0.24,
    c: ["#f2792a", "#2fa7b8"],
    fx: "drift",
    fxs: 7.5,
    fxd: -2.5,
    fx2: "breathe",
    fxs2: 2.6,
    fxd2: -0.8,
    base: ({ ra }) => {
      const r1 = ra - 1.5, r2 = ra + 9.5, rm = (r1 + r2) / 2;
      const defs = sheenDef("cs") + clipDonut("cc", r1 + 2, r2 - 2.4);
      const rin = r2 - 2.5;
      const S = pt(rin, 283), B = pt(rin, 338), Wr = [17, 40];
      const T = [[20, 8], [45, 7], [71, 16]];
      const scal = (a, b, k = 0.34) => { const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; return [m[0] + (Wr[0] - m[0]) * k, m[1] + (Wr[1] - m[1]) * k]; };
      const arm = `Q${P([7, 66])} ${P(Wr)}`;
      const outline = `M${P(S)}${arm}L${P(T[0])}Q${P(scal(T[0], T[1]))} ${P(T[1])}Q${P(scal(T[1], T[2]))} ${P(T[2])}Q${P(scal(T[2], B, 0.2))} ${P(B)}A${f1(rin)} ${f1(rin)} 0 0 0 ${P(S)}Z`;
      const panel = (a, b) => `M${P(Wr)}L${P(a)}Q${P(scal(a, b))} ${P(b)}Z`;
      const panels = `<path d="${panel(T[0], T[1])}" fill="#1b7592"/><path d="${panel(T[1], T[2])}" fill="#58c4d2"/>`;
      const bone = (d, w = 1) => `<path d="${d}" fill="none" stroke="${KEY}" stroke-width="${f1(4.8 * w)}" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="#e8772c" stroke-width="${f1(2.8 * w)}" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="#ffc58a" stroke-opacity=".7" stroke-width=".9" stroke-linecap="round" transform="translate(-.5 -.6)"/>`;
      const bones = bone(`M${P(S)}${arm}`, 1.2) + T.map((t) => bone(`M${P(Wr)}L${P(t)}`)).join("");
      const claw = `<path d="M${Wr[0] - 4} ${Wr[1] - 1}L${Wr[0] - 11} ${Wr[1] - 10}L${Wr[0] + 2} ${Wr[1] - 6}Z" fill="#f4e4b8" stroke="${KEY}" stroke-width="1.3" stroke-linejoin="round"/>`;
      const wing = `<path d="${outline}" fill="#2ba0b4"/>` + panels + `<path d="${outline}" fill="none" stroke="${KEY}" stroke-width="1.6" stroke-linejoin="round"/>` + bones + claw +
        `<circle cx="${Wr[0]}" cy="${Wr[1]}" r="3.6" fill="#f4e4b8" stroke="${KEY}" stroke-width="1.2"/>`;
      const wings = `<g>${wing}</g><g transform="translate(200 0) scale(-1 1) rotate(-1.2 100 100)">${wing}</g>`;
      // belly plate with ridges, a hard-edged cream arc at the bottom
      const belly =
        `<path d="${sector(r1 + 2, r2 - 2.4, 120, 240)}" fill="#f6e6b8"/>` +
        `<path d="${sector(r1 + 2, r1 + 4.2, 120, 240)}" fill="#e3cd96"/>` +
        around(7, (d) => `<path d="M${P(pt(r1 + 2, d))}L${P(pt(r2 - 2.4, d))}" stroke="#a98648" stroke-width="1.1"/>`, 132) +
        `<path d="${arc(r1 + 2, 120, 240)}" fill="none" stroke="#a98648" stroke-width="1" /><path d="${arc(r2 - 2.4, 120, 240)}" fill="none" stroke="#a98648" stroke-width="1"/>`;
      const scales = `<g clip-path="url(#cc)" fill="none" stroke="#a8420f" stroke-width="1.1" stroke-linejoin="round" stroke-linecap="round">` +
        around(36, (d) => `<path d="M${P(pt(rm + 2.6, d))}L${P(pt(rm - 1.8, d + 5))}L${P(pt(rm + 2.6, d + 10))}"/>`, 0) +
        `</g>` +
        `<g clip-path="url(#cc)" fill="none" stroke="#ffc88a" stroke-opacity=".5" stroke-width=".8" stroke-linecap="round">` +
        around(36, (d) => `<path d="M${P(pt(rm + 2.6 + 0.2, d + 0.6))}L${P(pt(rm - 1.8 + 0.2, d + 5))}"/>`, 0) + `</g>`;
      const rim =
        `<path d="${donut(r1, r2)}" fill="#a64a14"/>` +
        `<path d="${donut(r1 + 2, r2 - 2.4)}" fill="#ee7b25"/>` +
        `<path d="${donut(r1 + 2, r1 + 4)}" fill="#da6519"/>` +
        scales + belly +
        `<path d="${donut(r1, r1 + 2)}" fill="#c5551a"/>` +
        `<path d="${donut(r2 - 2.4, r2)}" fill="#f7a550"/>` +
        `<path d="${donut(r1, r1 + 2)}" fill="url(#cs)"/><path d="${donut(r2 - 2.4, r2)}" fill="url(#cs)"/>`;
      // the tail at five o'clock: it grows out of the rim, curves up and ends in a layered flame
      const stem = Array.from({ length: 15 }, (_, i) => bez([0, 3], [-8, -16], [13, -19], [14, -29], i / 14));
      const sp = tape(stem, 13, 6);
      const tail = at(r2 - 3, 136,
        shadow(sp) + keyed(sp, "#e8772c", 1.5) +
        `<g transform="translate(13 -26) rotate(-122) scale(.82)">` +
        keyed("M-9 2C-14 -9 -7 -15 -6 -25C-1 -19 3 -21 3 -30C13 -22 14 -11 9 2Z", "#ee6a22", 2) +
        `<path d="M-4.6 2C-7 -5 -3 -9.6 -2.4 -16C1 -11.4 3.4 -13 3.6 -18.4C8 -12 8 -5 5 2Z" fill="#ffc43a"/></g>`
      );
      return docK(wings + tail + rim + edges(r1, r2, "#fff1de"), defs);
    },
    glow: ({ ra }) => {
      const r2 = ra + 9.5;
      const drop = (x, y, k) => `<path d="M${f1(x)} ${f1(y - 3.6 * k)}C${f1(x + 2 * k)} ${f1(y - 1.2 * k)} ${f1(x + 2.2 * k)} ${f1(y + 0.8 * k)} ${f1(x)} ${f1(y + 2 * k)}C${f1(x - 2.2 * k)} ${f1(y + 0.8 * k)} ${f1(x - 2 * k)} ${f1(y - 1.2 * k)} ${f1(x)} ${f1(y - 3.6 * k)}Z" fill="#ffb02e"/>`;
      const em = [[130, r2 + 38, 1.0], [145, r2 + 31, 0.8], [123, r2 + 32, 0.75]].map(([d, r, k]) => drop(...pt(r, d), k * 1.35)).join("");
      return doc(em);
    },
    glow2: ({ ra }) => {
      const r2 = ra + 9.5;
      return doc(at(r2 - 3, 136, `<g transform="translate(13 -26) rotate(-122) scale(.82)"><path d="M-2 -6C-3.2 -10 -0.6 -12.6 -0.2 -16.4C1.8 -13.4 3.2 -14.2 3.2 -18C5.6 -14.2 5.4 -9.6 3.6 -6Z" fill="#fff0a0"/></g>`));
    },
  },

  /* Squirtle: a brown and cream shell ring of hex plates, a blue curled tail at four o'clock, a water drop at ten. */
  {
    id: "mon-squirtle",
    name: "Squirtle",
    group: "Pokémon",
    of: 0.2,
    c: ["#4bb4ee", "#b97a3a"],
    fx: "drift",
    fxs: 6.4,
    fxd: -2.2,
    base: ({ ra }) => {
      const r1 = ra - 1.5, r2 = ra + 12.5, rm = (r1 + r2) / 2;
      const defs = sheenDef("ss") + clipDonut("sc", r1 + 1.6, r2 - 1.8);
      const N = 22, step = 360 / N;
      const poly1 = (a) => `M${a.map(P).join("L")}Z`;
      const pw = 2 * Math.PI * rm / N * 0.5 + 0.4, ph = (r2 - 1.8 - (r1 + 1.6)) / 2 - 0.5;
      const hexPts = (d, sx, sy) => { const g = place(rm, d + step / 2); return [[-pw * sx, 0], [-pw * sx / 2, -ph * sy], [pw * sx / 2, -ph * sy], [pw * sx, 0], [pw * sx / 2, ph * sy], [-pw * sx / 2, ph * sy]].map(g); };
      const plates =
        `<g stroke="#5a3010" stroke-width="1.1" stroke-linejoin="round">${Array.from({ length: N }, (_, i) => `<path d="${poly1(hexPts(i * step, 1, 1))}" fill="${i % 2 ? "#9a5a24" : "#a8672b"}"/>`).join("")}</g>` +
        Array.from({ length: N }, (_, i) => `<path d="${poly1(hexPts(i * step, 0.62, 0.6))}" fill="${i % 2 ? "#b3743a" : "#bd8043"}"/>`).join("") +
        `<path d="${Array.from({ length: N }, (_, i) => { const g = place(rm, i * step + step / 2); return `M${P(g([-pw * 0.62, -ph * 0.1]))}L${P(g([-pw * 0.3, -ph * 0.62]))}`; }).join("")}" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1.2" stroke-linecap="round"/>`;
      const rim =
        `<path d="${donut(r1, r2)}" fill="#f1dfb0"/>` +
        `<g clip-path="url(#sc)">${plates}</g>` +
        `<path d="${donut(r1, r1 + 1.6)}" fill="#cfb57c"/><path d="${donut(r2 - 1.8, r2)}" fill="#f8ecc6"/>` +
        `<path d="${donut(r1, r1 + 1.6)}" fill="url(#ss)"/><path d="${donut(r2 - 1.8, r2)}" fill="url(#ss)"/>`;
      // the curled tail: thick at the root, a tight curl at the tip, a pale underside
      const tr = 17.5, tj = pt(r2 - 2.5, 128);
      const tc = [tj[0] + tr * Math.sin(rad(128)), tj[1] - tr * Math.cos(rad(128))];
      const a0 = 128 + 180 - 1.3 * 360;
      const tp = curl(tc[0], tc[1], 2, tr, a0, 1.3, 5.5, 16, 30);
      const tail =
        shadow(tp) + keyed(tp, "#3f98d0", 1.5) +
        `<path d="${spiral(tc[0], tc[1], 3.4, tr - 4, a0, 1.3, 1, 24)}" fill="none" stroke="#a8e0fa" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>` +
        `<path d="${spiral(tc[0], tc[1], 4.6, tr - 1, a0 + 8, 0.9, 1, 16)}" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width=".9" stroke-linecap="round" transform="translate(-1.2 -1.4)"/>`;
      // a water drop at ten o'clock, cast onto the rim
      const drop = at(r2 - 0.5, 306,
        shadow("M0 -15C-6 -7 -8.4 -3 -8.4 1C-8.4 6 -4.6 9.4 0 9.4C4.6 9.4 8.4 6 8.4 1C8.4 -3 6 -7 0 -15Z") +
        keyed("M0 -15C-6 -7 -8.4 -3 -8.4 1C-8.4 6 -4.6 9.4 0 9.4C4.6 9.4 8.4 6 8.4 1C8.4 -3 6 -7 0 -15Z", "#2e7fc0", 1.5) +
        `<path d="M-0.6 -11.6C-4.6 -6 -6.2 -2.6 -6.2 0.6C-6.2 4.4 -3.4 6.6 -0.6 6.6C1.4 6.6 2.6 5.8 3.4 4.8C0.4 4.4 -1 2 -0.8 -2C-0.6 -6 -0.6 -9 -0.6 -11.6Z" fill="#59b8ee"/>` +
        `<path d="M-4.6 0C-4.6 -2.6 -3.6 -4.6 -2.4 -6.4" fill="none" stroke="#fff" stroke-opacity=".85" stroke-width="1.6" stroke-linecap="round"/>`
      );
      return docK(tail + rim + edges(r1, r2, "#fff7dc") + drop, defs);
    },
    glow: ({ ra }) => {
      const r2 = ra + 12.5;
      const b = (d, r, s) => { const [x, y] = pt(r, d); return `<circle cx="${f1(x)}" cy="${f1(y)}" r="${s}" fill="#d6f2ff" fill-opacity=".28" stroke="#e8f8ff" stroke-width="1.2"/><circle cx="${f1(x - s * 0.36)}" cy="${f1(y - s * 0.38)}" r="${f1(s * 0.28)}" fill="#fff"/>`; };
      return doc(b(310, r2 + 22, 3.8) + b(318, r2 + 30, 2.6));
    },
  },

  /* Togepi: a hatching egg. Cream shell ring with a red and blue zigzag, a few clean shell teeth on top, one small chip at seven. */
  {
    id: "mon-togepi",
    name: "Togepi",
    group: "Pokémon",
    of: 0.24,
    c: ["#f4e8cf", "#e5392f"],
    base: ({ ra }) => {
      const r1 = ra - 1.5, r2 = ra + 11, rm = (r1 + r2) / 2;
      const defs = sheenDef("ts") + clipDonut("tc", r1 + 2.8, r2 - 3.4);
      const f1r = r1 + 2.8, f2r = r2 - 3.4, N = 20, step = 360 / N;
      const cell = (pts, fill) => `<path d="${poly(pts)}" fill="${fill}" stroke="${KEY}" stroke-width="1.2" stroke-linejoin="round"/>`;
      const reds = around(N, (a) => cell([pt(f1r, a), pt(f1r, a + step), pt(f2r, a + step / 2)], "#d8453b"), 0);
      const blues = around(N, (a) => cell([pt(f2r, a + step / 2), pt(f2r, a + step * 1.5), pt(f1r, a + step)], "#3a62c4"), 0);
      const rim =
        `<path d="${donut(r1, r2)}" fill="#e5d2a0"/>` +
        `<g clip-path="url(#tc)">${reds}${blues}</g>` +
        `<path d="${donut(r1, f1r)}" fill="#f1e2b6"/><path d="${donut(f2r, r2)}" fill="#fbf3d6"/>`+
        `<path d="${arc(f1r, 0, 359.9)}" fill="none" stroke="${KEY}" stroke-opacity=".55" stroke-width="1"/><path d="${arc(f2r, 0, 359.9)}" fill="none" stroke="${KEY}" stroke-opacity=".55" stroke-width="1"/>` +
        `<path d="${donut(r1, f1r)}" fill="url(#ts)"/><path d="${donut(f2r, r2)}" fill="url(#ts)"/>`;
      // teeth: clean triangles of broken shell, lit left facet and shaded right facet
      const lim = (a) => 98 / Math.max(Math.abs(Math.sin(rad(a))), Math.abs(Math.cos(rad(a))));
      const tooth = (a0, a1, h, lean) => {
        const b0 = pt(r2 - 4, a0), b1 = pt(r2 - 4, a1), ap = pt(Math.min(r2 - 4 + h, lim((a0 + a1) / 2 + lean) - 2.5), (a0 + a1) / 2 + lean);
        const bm = pt(r2 - 4, (a0 + a1) / 2 + lean * 0.5);
        return keyed(poly([b0, ap, b1]), "#e6d3a2", 1.5) +
          `<path d="${poly([b0, ap, bm])}" fill="#fbf2d4"/>` +
          `<path d="${poly([b0, ap, b1])}" fill="none" stroke="${KEY}" stroke-width="1.5" stroke-linejoin="round"/>`;
      };
      // one centred crown: five teeth of broken shell, symmetric, the middle one tallest
      const T = [[-65, -39, 11, 0], [-39, -13, 17, 0], [-13, 13, 22, 0], [13, 39, 17, 0], [39, 65, 11, 0]];
      const crown = T.map((t) => tooth(...t)).join("");
      return docK(crown + rim + edges(r1, r2, "#fff"), defs);
    },
  },

  /* Magikarp: two rows of overlapping scales, a fanned dorsal fin at one o'clock, a forked tail at seven, whiskers growing from the rim. */
  {
    id: "mon-magikarp",
    name: "Magikarp",
    group: "Pokémon",
    of: 0.24,
    c: ["#ff8a2a", "#ffd9a0"],
    fx: "spin",
    fxs: 13,
    fxd: -3,
    base: ({ ra }) => {
      const r1 = ra - 1.5, r2 = ra + 11.5, rm = (r1 + r2) / 2;
      const defs = sheenDef("ks") + clipDonut("kc", r1 + 1.8, r2 - 1.8);
      const N = 26, step = 360 / N;
      const row = (rr, off, a, b) => {
        const pts = Array.from({ length: N }, (_, i) => pt(rr, i * step + off));
        return `<g stroke="#7a2a0c" stroke-width="1.1">${pts.map(([x, y], i) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="5.8" fill="${i % 2 ? a : b}"/>`).join("")}</g>` +
          `<path d="${pts.map(([x, y], i) => { const g = place(rr, i * step + off); return `M${P(g([-3.6, -1.6]))}L${P(g([-1.6, -3.6]))}`; }).join("")}" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1.1" stroke-linecap="round"/>`;
      };
      const rim =
        `<path d="${donut(r1, r2)}" fill="#8e2f0e"/>` +
        `<g clip-path="url(#kc)">${row(rm + 3.2, step / 2, "#f5681f", "#ff8a2e")}${row(rm - 3.2, 0, "#ff8a2e", "#f5681f")}</g>` +
        `<path d="${donut(r1, r1 + 1.8)}" fill="#c9501a"/><path d="${donut(r2 - 1.8, r2)}" fill="#ffc07a"/>` +
        `<path d="${donut(r1, r1 + 1.8)}" fill="url(#ks)"/><path d="${donut(r2 - 1.8, r2)}" fill="url(#ks)"/>`;
      // the dorsal crest: a fan of five rays with a scalloped membrane, leaning clockwise, set at one o'clock
      const lim = (a) => 98 / Math.max(Math.abs(Math.sin(rad(a))), Math.abs(Math.cos(rad(a))));
      const rays = [[38, 16, 4], [52, 28, 5], [66, 20, 4], [78, 11, 3]];
      const base0 = r2 - 5, A0 = 30, A1 = 88;
      const apex = rays.map(([a, h, l]) => pt(Math.min(base0 + h + 6, lim(a + l) - 2.5), a + l));
      const dip = (p, q, k = 0.16) => { const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; return [m[0] + (100 - m[0]) * k, m[1] + (100 - m[1]) * k]; };
      let crest = `M${P(pt(base0, A0))}`;
      apex.forEach((p, i) => { crest += `Q${P(dip(i ? apex[i - 1] : pt(base0, A0), p))} ${P(p)}`; });
      crest += `L${P(pt(base0, A1))}A${f1(base0)} ${f1(base0)} 0 0 0 ${P(pt(base0, A0))}Z`;
      const panelP = (i) => `M${P(apex[i])}Q${P(dip(apex[i], apex[i + 1]))} ${P(apex[i + 1])}L${P(pt(base0, rays[i + 1][0]))}L${P(pt(base0, rays[i][0]))}Z`;
      const fin = keyed(crest, "#e5521f", 1.6) + [0, 2].map((i) => `<path d="${panelP(i)}" fill="#f77a2c"/>`).join("") +
        rays.map(([a], i) => `<path d="M${P(pt(base0, a))}L${P(apex[i])}" fill="none" stroke="${KEY}" stroke-width="4" stroke-linecap="round"/><path d="M${P(pt(base0, a))}L${P(apex[i])}" fill="none" stroke="#ffd08c" stroke-width="2.1" stroke-linecap="round"/>`).join("") +
        `<path d="${crest}" fill="none" stroke="${KEY}" stroke-width="1.6" stroke-linejoin="round"/>`;
      // the forked tail fin
      const tailfin = at(r2 - 4, 214, `<g transform="scale(1.2)">` +
        shadow("M-7 4C-9 -5 -14 -12 -21 -23C-10 -21 -4 -18 0 -11C4 -18 10 -21 21 -23C14 -12 9 -5 7 4Z") +
        keyed("M-7 4C-9 -5 -14 -12 -21 -23C-10 -21 -4 -18 0 -11C4 -18 10 -21 21 -23C14 -12 9 -5 7 4Z", "#e5521f", 1.6) +
        `<path d="M-3 0C-5 -7 -8 -13 -13 -19M3 0C5 -7 8 -13 13 -19M0 -2L0 -10" fill="none" stroke="#ffcf8a" stroke-width="1.3" stroke-linecap="round"/></g>`
      );
      // whiskers: a long lazy S, fixed to the rim by an enamel boss
      const whisker = (d, flip) => {
        const g = place(r2 - 1.6, d, 1, flip);
        const pts = Array.from({ length: 28 }, (_, i) => { const t = i / 27; return g([(t < 0.12 ? t * 2 : 0.24 + (t - 0.12) * 1.1) * 34, -10 * Math.min(1, t * 5) - 5 * Math.sin(t * Math.PI * 1.9) * Math.min(1, t * 4) - 5 * t]); });
        const tp = tape(pts, 7, 2.2);
        const [bx, by] = g([0, 0]);
        return shadow(tp) + keyed(tp, "#ffe6a6", 1.4) +
          `<path d="${poly(pts.slice(2, 20), false)}" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width=".9" stroke-linecap="round" transform="translate(-.6 -.8)"/>` +
          `<circle cx="${f1(bx + 0.8)}" cy="${f1(by + 1.2)}" r="4.2" fill="${KEY}" fill-opacity=".4"/>` +
          `<circle cx="${f1(bx)}" cy="${f1(by)}" r="4.2" fill="#ffd66a" stroke="${KEY}" stroke-width="1.4"/>` +
          `<circle cx="${f1(bx)}" cy="${f1(by)}" r="1.9" fill="#b8431a"/>` +
          `<path d="M${f1(bx - 2.8)} ${f1(by - 0.6)}Q${f1(bx - 2.2)} ${f1(by - 2.6)} ${f1(bx - 0.4)} ${f1(by - 3)}" fill="none" stroke="#fff" stroke-opacity=".85" stroke-width=".9" stroke-linecap="round"/>`;
      };
      return docK(fin + tailfin + rim + edges(r1, r2, "#fff2d8") + whisker(99, false) + whisker(261, true), defs);
    },
    glow: ({ ra }) => {
      const r1 = ra - 1.5, r2 = ra + 11.5;
      // a narrow glint that travels round the outer lip, bright at its head and fading behind
      return doc(
        `<path d="${arc(r2 - 1, -13, 5)}" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="1.7" stroke-linecap="round"/>` +
          `<path d="${arc(r2 - 1, -3, 5)}" fill="none" stroke="#fff" stroke-opacity=".95" stroke-width="1.9" stroke-linecap="round"/>`
      );
    },
  },

  /* Snorlax: a dark teal ring with a cream belly arc, two small ears, sleepy eyes, z's drifting very slowly. */
  {
    id: "mon-snorlax",
    name: "Snorlax",
    group: "Pokémon",
    of: 0.22,
    c: ["#34616b", "#f4e6bf"],
    fx: "drift",
    fxs: 12,
    fxd: -3,
    fx2: "drift",
    fxs2: 14,
    fxd2: -9,
    base: ({ ra }) => {
      const r1 = ra - 1.5, r2 = ra + 11.5, rm = (r1 + r2) / 2;
      const defs = sheenDef("ns", 0.26, 0.3);
      const rim =
        bands(r1, r2, [[0.14, "#14323c"], [0.4, "#2b5f6d"], [0.52, "#1b434e"], [0.8, "#3a7886"], [0.88, "#86b9c3"], [1, "#214b58"]]) +
        `<path d="${donut(r1, r2)}" fill="url(#ns)"/>`;
      const belly =
        `<path d="${sector(r1 + 1.4, r2 - 1.4, 118, 242)}" fill="#f4e8c4"/>` +
        `<path d="${sector(r1 + 1.4, r1 + 4.2, 118, 242)}" fill="#e0cf9c"/>` +
        [[rm + 0.4, 126, 234], [r2 - 3.2, 134, 226]].map(([r, a, b]) => `<path d="${arc(r, a, b)}" fill="none" stroke="#a8946a" stroke-width="1" stroke-linecap="round"/>`).join("") +
        `<path d="${arc(r1 + 1.4, 118, 242)}" fill="none" stroke="#8f7b52" stroke-width="1"/><path d="${arc(r2 - 1.4, 118, 242)}" fill="none" stroke="#8f7b52" stroke-width="1"/>`;
      const ear = "M-8.4 5C-10.4 -3 -6.4 -9.6 0 -10C6.4 -9.6 10.4 -3 8.4 5Z";
      const earAt = (d, s, tilt, fl) => at(r2 - 2, d, `<g transform="rotate(${tilt})">${keyed(ear, "#2d6674", 1.5).replace("<path", `<path transform="scale(${s})"`)}<path d="M-4 1C-4.6 -3 -2.4 -6 0 -6.6C2.4 -6 4.6 -3 4 1Z" fill="#e8d7ae" fill-opacity=".85" transform="scale(${s})"/></g>`);
      const ears = earAt(-40, 2.0, -8) + earAt(38, 1.8, 6);
      const eyes = [-15, 14].map((d) => at(rm, d, `<path d="M-4 -0.6Q0 3.2 4 -0.6" fill="none" stroke="${KEY}" stroke-width="1.7" stroke-linecap="round"/>`)).join("");
      return docK(ears + rim + belly + eyes + edges(r1, r2, "#e6f6f8"), defs);
    },
    glow: ({ ra }) => {
      const r2 = ra + 11.5;
      return doc(zz(r2 + 14, 47, 1.0) + zz(r2 + 17, 58, 1.3));
    },
    glow2: ({ ra }) => {
      const r2 = ra + 11.5;
      return doc(zz(r2 + 16, 68, 1.8));
    },
  },
];

/** A sleeper's Z, a light stroke over a dark one. */
function zz(r, d, s) {
  const [x, y] = pt(r, d), k = 3.2 * s;
  const p = `M${f1(x - k)} ${f1(y - k)}H${f1(x + k)}L${f1(x - k)} ${f1(y + k)}H${f1(x + k)}`;
  return `<path d="${p}" fill="none" stroke="${KEY}" stroke-opacity=".55" stroke-width="${f1(2 * s + 1.8)}" stroke-linecap="round" stroke-linejoin="round"/><path d="${p}" fill="none" stroke="#dff3f0" stroke-width="${f1(2 * s + 0.4)}" stroke-linecap="round" stroke-linejoin="round"/>`;
}
