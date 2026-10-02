import { C, f, rad, pt, poly, arc, sector, donut, around, at, lin, rg, wedges, star, spark, outline, gloss, doc } from "../lib/frame-art.mjs";

/* The base layer is clipped to the avatar's circle (the box's inscribed circle), so
   everything below stays inside radius ~98. Helpers are local on purpose: the lead
   copies this file on its own. */

const INK = "#07060c";
const f1 = (n) => Math.round(n * 10) / 10;
const rnd = (i) => {
  const x = Math.sin(i * 12.9898 + 4.1) * 43758.5453;
  return x - Math.floor(x);
};
function tubeDefs(r1, r2, sheen = 0.45, shade = 0.34, crown = 0.2) {
  const k = r1 / r2;
  return (
    rg("ts", [[k, INK, 0.5], [k + (1 - k) * 0.22, INK, 0.07], [k + (1 - k) * 0.52, "#fff", crown], [k + (1 - k) * 0.8, INK, 0.07], [1, INK, 0.5]], [C, C, r2]) +
    lin("tl", [[0, "#fff", sheen], [0.4, "#fff", 0], [0.62, INK, 0.04], [1, INK, shade]], [30, 22, 172, 178])
  );
}
const tube = (r1, r2) => `<path d="${donut(r1, r2)}" fill="url(#ts)"/><path d="${donut(r1, r2)}" fill="url(#tl)"/>`;
function finish(r1, r2, { gl = 0.5, hl = "#fff", outer = true } = {}) {
  return (
    `<path d="${arc(r1 + 0.8, 0, 359.9)}" fill="none" stroke="${INK}" stroke-opacity=".34" stroke-width="1.4"/>` +
    `<path d="${arc(r1 + 2.1, 262, 408)}" fill="none" stroke="${hl}" stroke-opacity=".3" stroke-width=".8" stroke-linecap="round"/>` +
    (outer ? `<path d="${arc(r2 - 1, 268, 400)}" fill="none" stroke="${hl}" stroke-opacity=".28" stroke-width=".8" stroke-linecap="round"/>` + gloss((r1 + r2) / 2 + 1.5, 2.6, 292, 346, gl, hl) + outline(r2 + 0.4, 1.5) : "") +
    outline(r1 + 0.3, 1.2, INK, 0.55)
  );
}
const diag = (id, stops) => lin(id, stops, [30, 22, 172, 178]);
const hsl = (h, s, l) => `hsl(${Math.round(h)} ${s}% ${l}%)`;

/** A closed outline whose radius is r(a): used for notched and scalloped outer edges. */
function shapeAt(rOf, n = 120, dr = 0) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i * 360) / n;
    pts.push(pt(rOf(a) + dr, a));
  }
  return poly(pts);
}
const circleCcw = (r) => `M${f(100 - r)} 100A${f(r)} ${f(r)} 0 1 0 ${f(100 + r)} 100A${f(r)} ${f(r)} 0 1 0 ${f(100 - r)} 100Z`;

export const frames = [
  {
    id: "card-yellow-border",
    name: "Yellow Border",
    group: "Cards",
    of: 0.12,
    c: ["#ffd01f", "#17151a"],
    base: ({ ra }) => {
      const r1 = ra - 1.5, r2 = ra + 16.5;
      // the 1999 card: a thick yellow edge, a black keyline, and a notch at each corner
      const notch = (a) => {
        let d = 0;
        for (const c of [45, 135, 225, 315]) {
          const t = Math.min(Math.abs(a - c), 360 - Math.abs(a - c)) / 6;
          d = Math.max(d, 7.4 * Math.exp(-t * t * 1.5));
        }
        return d;
      };
      const R = (a) => r2 - notch(a);
      const defs =
        diag("yb", [[0, "#fff09a"], [0.4, "#ffd21f"], [1, "#d49a05"]]) + tubeDefs(r1, r2, 0.5, 0.3, 0.18) +
        rg("yv", [[0.78, "#fff3b0", 0], [0.93, "#fff3b0", 0.35], [1, "#fff3b0", 0]], [C, C, r2]);
      const outer = shapeAt(R, 120);
      const keyline = shapeAt(R, 120, -2.6);
      const keyline2 = shapeAt(R, 120, -5.4);
      const body =
        `<path d="${outer + circleCcw(r1)}" fill="url(#yb)"/>` +
        `<path d="${outer + circleCcw(r1)}" fill="url(#ts)"/>` +
        `<path d="${outer + circleCcw(r1)}" fill="url(#tl)"/>` +
        `<path d="${keyline}" fill="none" stroke="${INK}" stroke-opacity=".78" stroke-width="1.5" stroke-linejoin="round"/>` +
        `<path d="${keyline2}" fill="none" stroke="#fff6c4" stroke-opacity=".55" stroke-width=".8" stroke-linejoin="round"/>` +
        // a fine dark line near the window, like the card's inner frame
        `<path d="${arc(r1 + 4.2, 0, 359.9)}" fill="none" stroke="#8a5a00" stroke-opacity=".5" stroke-width=".9"/>` +
        `<path d="${arc(r1 + 5.3, 262, 408)}" fill="none" stroke="#fff6c4" stroke-opacity=".5" stroke-width=".8" stroke-linecap="round"/>` +
        // corner marks: small dark cut-in dots where the notches bite
        [45, 135, 225, 315].map((a) => { const [x, y] = pt(r2 - 3.2, a); return `<circle cx="${f(x)}" cy="${f(y)}" r="1.4" fill="${INK}" fill-opacity=".55"/>`; }).join("") +
        `<path d="${outer}" fill="none" stroke="${INK}" stroke-opacity=".7" stroke-width="1.5" stroke-linejoin="round"/>`;
      return doc(body + gloss(r2 - 6.5, 3, 292, 344, 0.55, "#fff") + finish(r1, r2, { outer: false }), defs);
    },
  },
  {
    id: "card-gold-star",
    name: "Gold Star",
    group: "Cards",
    of: 0.16,
    c: ["#c8962a", "#ffe9a0"],
    fx: "pulse",
    fxs: 3,
    base: ({ ra }) => {
      const r1 = ra - 1.5, r2 = ra + 13, rm = (r1 + r2) / 2;
      const defs =
        diag("gb", [[0, "#e2b64a"], [0.45, "#a6741c"], [1, "#5a3a08"]]) + tubeDefs(r1, r2, 0.4, 0.35, 0.16) +
        lin("gs", [[0, "#fff6bf"], [0.5, "#f0c24a"], [1, "#b57d12"]], [-14, -14, 14, 14]).replace("userSpaceOnUse", "objectBoundingBox").replace(/x1="[^"]*" y1="[^"]*" x2="[^"]*" y2="[^"]*"/, 'x1="0" y1="0" x2="1" y2="1"');
      const emboss = (cx, cy, R, ri, rot = 0, rich = false) => {
        const d = star(cx, cy, R, ri, 5, rot);
        const o = R * 0.09;
        return `<path d="${d}" fill="${INK}" fill-opacity=".5" transform="translate(${f(o * 1.4)} ${f(o * 1.6)})"/>` +
          `<path d="${d}" fill="url(#gs)" stroke="#6a4308" stroke-opacity=".8" stroke-width="${f(Math.max(0.6, R * 0.07))}" stroke-linejoin="round"/>` +
          (rich ? `<path d="${star(cx - R * 0.02, cy - R * 0.03, R * 0.62, ri * 0.55, 5, rot)}" fill="#fff6bf" fill-opacity=".35"/>` +
          `<path d="${poly([[cx, cy - R * 0.9], [cx - R * 0.18, cy - R * 0.2], [cx - R * 0.8, cy - R * 0.28]], false)}" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="${f(Math.max(0.5, R * 0.06))}" stroke-linecap="round" stroke-linejoin="round"/>` : "");
      };
      const small = Array.from({ length: 11 }, (_, i) => 28 + i * 30.4)
        .map((a, i) => { const [x, y] = pt(rm, a); return emboss(x, y, 6.4, 2.7, a); })
        .join("");
      // fine ribbing along the band, between the stars
      const ribs = `<path d="${arc(r1 + 2, 0, 359.9)}" stroke-dasharray="1 2.6"/><path d="${arc(r2 - 2, 0, 359.9)}" stroke-dasharray="1 2.6"/>`;
      const [bx, by] = pt(rm + 0.6, 0);
      return doc(
        `<path d="${donut(r1, r2)}" fill="url(#gb)"/><g fill="none" stroke="#f3cd68" stroke-opacity=".4" stroke-width=".9">${ribs}</g>` +
          tube(r1, r2) + finish(r1, r2, { hl: "#ffeeb0" }) + small +
          // the one big star, set on the crown of the band
          `<circle cx="${f(bx)}" cy="${f(by)}" r="16.2" fill="${INK}" fill-opacity=".35"/>` + emboss(bx, by + 2.6, 14, 6.1, 0, true),
        defs
      );
    },
    glow: ({ ra }) => {
      const rm = ra - 1.5 + 7.25;
      const [bx, by] = pt(rm + 0.6, 0);
      return doc(`<path d="${spark(bx - 4, by - 5, 12, 0.14)}" fill="#fff6c8"/><path d="${spark(bx + 16, by + 8, 5, 0.16)}" fill="#fff"/><path d="${spark(...pt(rm, 150), 4.5, 0.16)}" fill="#fff"/><path d="${spark(...pt(rm, 232), 4, 0.16)}" fill="#fff"/>`);
    },
  },
  {
    id: "card-holo-foil",
    name: "Holo Foil",
    group: "Cards",
    of: 0.14,
    c: ["#c9d0de", "#8a63ff"],
    fx: "spin",
    fxs: 14,
    base: ({ ra }) => {
      const r1 = ra - 1.5, r2 = ra + 14.5;
      const N = 18;
      const pal = ["#f6f8fd", "#c7cedc", "#9aa3b8", "#e4e9f3", "#b2bacb", "#dde2ee", "#8b94aa", "#eef1f8"];
      // shard-cut: each facet has its own slant, so the cuts run on a diagonal across the band
      const cuts = Array.from({ length: N }, (_, i) => (i * 360) / N + (rnd(i) - 0.5) * 8);
      let shards = "";
      for (let i = 0; i < N; i++) {
        const a0 = cuts[i], a1 = cuts[(i + 1) % N] + (i + 1 === N ? 360 : 0);
        const s0 = 5 + rnd(i + 30) * 3, s1 = 5 + rnd(i + 31) * 3;
        const ro = r2 - rnd(i + 60) * 1.2;
        shards += `<path d="${poly([pt(r1, a0), pt(ro, a0 + s0), pt(ro, a1 + s1), pt(r1, a1)])}" fill="${pal[(i * 3 + Math.floor(rnd(i) * 3)) % pal.length]}" stroke="#3d4560" stroke-opacity=".5" stroke-width=".6" stroke-linejoin="round"/>`;
      }
      const facets = Array.from({ length: N }, (_, i) => {
        const a = cuts[i] + 4 + rnd(i + 90) * 6;
        return `<path d="${poly([pt(r1 + 2 + rnd(i + 5) * 3, a), pt(r2 - 2, a + 6), pt(r2 - 2 - rnd(i + 8) * 5, a + 9.5)])}" fill="#fff" fill-opacity="${f(0.16 + rnd(i + 11) * 0.22)}"/>`;
      }).join("");
      const defs = tubeDefs(r1, r2, 0.5, 0.3, 0.14);
      return doc(shards + facets + tube(r1, r2) + finish(r1, r2, { hl: "#fff" }), defs);
    },
    glow: ({ ra }) => {
      const r1 = ra - 1.5, r2 = ra + 14.5, n = 36;
      // a rainbow sheen: hue around the ring, brighter in two lobes, spun slowly
      const w = around(n, (a, i) => {
        const o = 0.34 + 0.34 * Math.max(Math.cos(rad(a * 2)), 0) ** 2;
        return `<path d="${sector(r1 + 1, r2 - 1, a - 0.2, a + 360 / n + 0.2)}" fill="${hsl((i * 360) / n, 95, 62)}" fill-opacity="${f(o)}"/>`;
      }, 0);
      return doc(w + `<path d="${spark(...pt((r1 + r2) / 2, 40), 6, 0.15)}" fill="#fff" fill-opacity=".9"/><path d="${spark(...pt((r1 + r2) / 2, 220), 5, 0.15)}" fill="#fff" fill-opacity=".9"/>`);
    },
  },
  {
    id: "card-reverse-holo",
    name: "Reverse Holo",
    group: "Cards",
    of: 0.14,
    c: ["#cfd6e2", "#7fa4ff"],
    fx: "pulse",
    fxs: 3.2,
    base: ({ ra }) => {
      const r1 = ra - 1.5, r2 = ra + 14.5;
      const defs =
        diag("rb", [[0, "#fbfcff"], [0.3, "#c5cddc"], [0.55, "#eef1f8"], [0.8, "#a3adc2"], [1, "#d3d9e6"]]) + tubeDefs(r1, r2, 0.4, 0.28, 0.12);
      // fine diagonal foil: slanted hairlines, lighter and darker in turn
      const hair = (n, off, col, o) => around(n, (a) => `<path d="M${f(pt(r1, a)[0])} ${f(pt(r1, a)[1])}L${f(pt(r2, a + 8)[0])} ${f(pt(r2, a + 8)[1])}" />`, off);
      const lines = `<g fill="none" stroke="#fff" stroke-opacity=".7" stroke-width=".8">${hair(90, 0)}</g><g fill="none" stroke="#586178" stroke-opacity=".4" stroke-width=".7">${hair(90, 2)}</g>`;
      return doc(`<path d="${donut(r1, r2)}" fill="url(#rb)"/>` + lines + tube(r1, r2) + finish(r1, r2, { hl: "#fff" }), defs);
    },
    glow: ({ ra }) => {
      const rm = ra - 1.5 + 7.25;
      const g = [[20, 7], [75, 4.2], [128, 5.4], [190, 7], [246, 4.2], [305, 5.6], [340, 3.4]].map(([a, s]) => `<path d="${spark(...pt(rm + (a % 2 ? 0 : 0), a), s, 0.15)}" fill="#fff"/>`).join("");
      return doc(g);
    },
  },
  {
    id: "card-black-label",
    name: "Black Label",
    group: "Cards",
    of: 0.14,
    c: ["#16161b", "#e5b84a"],
    fx: "spin",
    fxs: 10,
    base: ({ ra }) => {
      const r1 = ra - 1.5, r2 = ra + 14, rm = (r1 + r2) / 2;
      const defs =
        diag("kb", [[0, "#4a4a56"], [0.35, "#1b1b22"], [1, "#060608"]]) + tubeDefs(r1, r2, 0.5, 0.2, 0.16) +
        lin("kg", [[0, "#fff1ac"], [0.45, "#e6b640"], [1, "#8c5f0c"]], [60, 0, 140, 40]) +
        lin("kp", [[0, "#fff2b8"], [0.5, "#e9bd4a"], [1, "#9a6a10"]], [70, 4, 130, 28]);
      // hairlines in gold: two round the band, one down its middle
      const hair = [[r1 + 2.4, 1, 0.95], [rm, 0.5, 0.55], [r2 - 2.2, 1.6, 1]].map(([r, w, o]) => `<path d="${arc(r, 0, 359.9)}" fill="none" stroke="url(#kg)" stroke-width="${w}" stroke-opacity="${o}"/>`).join("");
      // the label plate: a gold slab set on the crown, dark inset, a diamond
      const pw = 54, ph = 20;
      const [px, py] = pt(rm + 0.4, 0);
      const plate =
        `<g transform="translate(${f(px)} ${f(py)})"><rect x="${-pw / 2 - 1}" y="${-ph / 2 - 1}" width="${pw + 2}" height="${ph + 2}" rx="4.4" fill="${INK}" fill-opacity=".5"/>` +
        `<rect x="${-pw / 2}" y="${-ph / 2}" width="${pw}" height="${ph}" rx="3.6" fill="url(#kp)" stroke="#5a3a05" stroke-opacity=".8" stroke-width=".9"/>` +
        `<rect x="${-pw / 2 + 2.6}" y="${-ph / 2 + 2.6}" width="${pw - 5.2}" height="${ph - 5.2}" rx="2" fill="#0c0b10" stroke="#f3cd68" stroke-opacity=".85" stroke-width=".7"/>` +
        `<path d="M0 -4.4L4.6 0L0 4.4L-4.6 0Z" fill="url(#kp)" stroke="#5a3a05" stroke-opacity=".7" stroke-width=".5"/>` +
        `<path d="M-18 0H-9M9 0H18" stroke="#f3cd68" stroke-opacity=".8" stroke-width=".8" stroke-linecap="round"/>` +
        `<path d="M-${pw / 2 - 1} -${ph / 2 - 1.4}H${pw / 2 - 1}" stroke="#fff" stroke-opacity=".6" stroke-width=".8" stroke-linecap="round"/></g>`;
      const studs = [90, 180, 270].map((a) => { const [x, y] = pt(rm, a); return `<path d="M${f(x)} ${f(y - 3.4)}L${f(x + 3)} ${f(y)}L${f(x)} ${f(y + 3.4)}L${f(x - 3)} ${f(y)}Z" fill="url(#kp)" stroke="#5a3a05" stroke-opacity=".7" stroke-width=".5"/>`; }).join("");
      return doc(`<path d="${donut(r1, r2)}" fill="url(#kb)"/>` + tube(r1, r2) + hair + studs + finish(r1, r2, { hl: "#9a9aa8", gl: 0.35 }) + plate, defs);
    },
    glow: ({ ra }) => {
      const r1 = ra - 1.5, r2 = ra + 14, rm = (r1 + r2) / 2;
      // a gold glint that travels round the hairlines
      const defs = `<linearGradient id="kgl" gradientUnits="userSpaceOnUse" x1="${f(pt(rm, 250)[0])}" y1="${f(pt(rm, 250)[1])}" x2="${f(pt(rm, 292)[0])}" y2="${f(pt(rm, 292)[1])}"><stop offset="0" stop-color="#fff2b8" stop-opacity="0"/><stop offset=".8" stop-color="#fff2b8" stop-opacity=".95"/><stop offset="1" stop-color="#fff" stop-opacity="1"/></linearGradient>`;
      return doc(`<path d="${arc(r1 + 2.4, 250, 292)}" fill="none" stroke="url(#kgl)" stroke-width="2" stroke-linecap="round"/><path d="${arc(r2 - 2.4, 250, 292)}" fill="none" stroke="url(#kgl)" stroke-width="2" stroke-linecap="round"/><path d="${spark(...pt(rm, 293), 6, 0.15)}" fill="#fff"/>`, defs);
    },
  },
  {
    id: "card-shiny",
    name: "Shiny Sparkle",
    group: "Cards",
    of: 0.16,
    c: ["#bdeeff", "#ffffff"],
    fx: "pulse",
    fxs: 2.4,
    base: ({ ra }) => {
      const r1 = ra - 1.5, r2 = ra + 12.5, rm = (r1 + r2) / 2;
      const defs =
        diag("sb", [[0, "#ffffff"], [0.4, "#c5f1ff"], [0.75, "#8ed3f0"], [1, "#b9ecff"]]) + tubeDefs(r1, r2, 0.5, 0.26, 0.2) +
        lin("sp", [[0, "#fff"], [1, "#cdf3ff"]], [0, 0, 20, 20]).replace("userSpaceOnUse", "objectBoundingBox").replace(/x1="[^"]*" y1="[^"]*" x2="[^"]*" y2="[^"]*"/, 'x1="0" y1="0" x2="1" y2="1"');
      const sp = (x, y, R, w = 0.14) => `<path d="${spark(x, y, R + 0.8, w)}" fill="#3a7aa8" fill-opacity=".4"/><path d="${spark(x, y, R, w)}" fill="url(#sp)" stroke="#6bb6dc" stroke-opacity=".7" stroke-width=".4" stroke-linejoin="round"/>`;
      const list = [[8, 6.2], [38, 3.4], [70, 5], [103, 3.2], [132, 6.4], [162, 3.6], [196, 5.4], [228, 3.4], [258, 6], [292, 3.6], [322, 5.2], [350, 3]];
      const sparks = list.map(([a, R], i) => { const [x, y] = pt(rm + (i % 2 ? 1.2 : -1.2), a); return sp(x, y, R); }).join("");
      const dust = around(36, (a, i) => { const [x, y] = pt(rm + (rnd(i) - 0.5) * 8, a + rnd(i + 3) * 8); return `<circle cx="${f(x)}" cy="${f(y)}" r="${f(0.5 + rnd(i + 7) * 0.5)}" fill="#fff" fill-opacity=".8"/>`; }, 4).replace(/ /g, " ");
      return doc(`<path d="${donut(r1, r2)}" fill="url(#sb)"/>` + dust + tube(r1, r2) + finish(r1, r2, { hl: "#fff" }) + sparks, defs);
    },
    glow: ({ ra }) => {
      const rm = ra - 1.5 + 7;
      const g = [[22, 9], [88, 6.5], [148, 8.5], [215, 6.5], [275, 8.8], [335, 6]].map(([a, R], i) => { const [x, y] = pt(rm + (i % 2 ? 4 : -2), a); return `<path d="${spark(x, y, R + 3, 0.1)}" fill="#fff" fill-opacity=".45"/><path d="${spark(x, y, R, 0.14)}" fill="#fff"/>`; }).join("");
      return doc(g);
    },
  },
];
