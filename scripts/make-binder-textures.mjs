/**
 * Generates the tiny seamless SVG tiles css/binder/textures.css lays under the
 * binder covers (pebbled leather, linen, suede nap, carbon twill, denim, brushed
 * metal, ring hardware) as custom properties on .binder-object in
 * css/binder/textures.css.
 *
 * No SVG filters (they alias on iPhone Safari): plain shapes and gradients only,
 * every mark is black or white at low alpha so the cover colour (--b-main)
 * stays the colour. Seeded, so re-running changes nothing.
 *
 *   node scripts/make-binder-textures.mjs
 */
import { writeFileSync } from "node:fs";

const FILE = new URL("../css/binder/textures.css", import.meta.url);

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const f = (n) => String(Math.round(n * 10) / 10);

const uri = (svg) =>
  `url("data:image/svg+xml,${svg.replace(/%/g, "%25").replace(/</g, "%3C").replace(/>/g, "%3E").replace(/#/g, "%23").replace(/"/g, "'").replace(/\s+/g, " ")}")`;

const svg = (w, h, body, extra = "") =>
  `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'${extra}>${body}</svg>`;

/** Draw a mark at (x, y) and at its wrapped copies, so a tile has no seam. */
function wrapped(w, h, x, y, reach, draw) {
  const xs = [x];
  const ys = [y];
  if (x < reach) xs.push(x + w);
  if (x > w - reach) xs.push(x - w);
  if (y < reach) ys.push(y + h);
  if (y > h - reach) ys.push(y - h);
  return xs.flatMap((px) => ys.map((py) => draw(px, py))).join("");
}

// ---- Pebbled leather: a periodic Voronoi of domed cells over dark crevices --------------------
function pebble() {
  const W = 72;
  const H = 72;
  const cols = 8;
  const rows = 8;
  const rand = rng(11);
  const sites = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const jitter = 0.34;
      sites.push([
        ((c + 0.5 + (r % 2 ? 0.5 : 0) + (rand() - 0.5) * jitter * 2) * W) / cols,
        ((r + 0.5 + (rand() - 0.5) * jitter * 2) * H) / rows,
      ]);
    }
  }
  const images = [];
  for (const [x, y] of sites) for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) images.push([x + i * W, y + j * H]);
  const clip = (poly, [px, py], [qx, qy]) => {
    // keep the side of the bisector of p and q that holds p
    const mx = (px + qx) / 2;
    const my = (py + qy) / 2;
    const nx = qx - px;
    const ny = qy - py;
    const side = ([x, y]) => (x - mx) * nx + (y - my) * ny;
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const sa = side(a);
      const sb = side(b);
      if (sa <= 0) out.push(a);
      if (sa <= 0 !== sb <= 0) {
        const t = sa / (sa - sb);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    return out;
  };
  const cells = [];
  for (const site of sites) {
    let poly = [[site[0] - 40, site[1] - 40], [site[0] + 40, site[1] - 40], [site[0] + 40, site[1] + 40], [site[0] - 40, site[1] + 40]];
    for (const img of images) {
      if (img[0] === site[0] && img[1] === site[1]) continue;
      if (Math.hypot(img[0] - site[0], img[1] - site[1]) > 30) continue;
      poly = clip(poly, site, img);
      if (poly.length < 3) break;
    }
    cells.push({ site, poly, alpha: 0.55 + rand() * 0.45 });
  }
  const drawCell = ({ site, poly, alpha }, dx, dy) => {
    const shrink = 0.9;
    const pts = poly.map(([x, y]) => [site[0] + (x - site[0]) * shrink + dx, site[1] + (y - site[1]) * shrink + dy]);
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const first = mid(pts[pts.length - 1], pts[0]);
    let d = `M${f(first[0])} ${f(first[1])}`;
    for (let i = 0; i < pts.length; i++) {
      const m = mid(pts[i], pts[(i + 1) % pts.length]);
      d += `Q${f(pts[i][0])} ${f(pts[i][1])} ${f(m[0])} ${f(m[1])}`;
    }
    return `<path d='${d}Z' fill-opacity='${f(alpha)}'/>`;
  };
  let body = `<defs><radialGradient id='d' cx='.36' cy='.3' r='.8'><stop offset='0' stop-color='#fff' stop-opacity='.3'/><stop offset='.5' stop-color='#fff' stop-opacity='.04'/><stop offset='1' stop-color='#000' stop-opacity='.2'/></radialGradient></defs>`;
  body += `<rect width='${W}' height='${H}' fill='#000' fill-opacity='.34'/><g fill='url(#d)'>`;
  for (const cell of cells) {
    for (const dx of [-W, 0, W]) {
      for (const dy of [-H, 0, H]) {
        const [sx, sy] = [cell.site[0] + dx, cell.site[1] + dy];
        if (sx < -12 || sx > W + 12 || sy < -12 || sy > H + 12) continue;
        body += drawCell(cell, dx, dy);
      }
    }
  }
  body += `</g>`;
  return uri(svg(W, H, body));
}

// ---- Cloth: plain weave (3px threads, over/under) and linen slubs -----------------------------
function weave() {
  const T = 3;
  const N = 4;
  let body = `<defs><linearGradient id='v' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#fff' stop-opacity='.2'/><stop offset='.5' stop-color='#fff' stop-opacity='0'/><stop offset='1' stop-color='#000' stop-opacity='.3'/></linearGradient>`;
  body += `<linearGradient id='h' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='#000' stop-opacity='.26'/><stop offset='.45' stop-color='#fff' stop-opacity='.02'/><stop offset='1' stop-color='#fff' stop-opacity='.14'/></linearGradient></defs>`;
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      body += `<rect x='${c * T}' y='${r * T}' width='${T}' height='${T}' fill='url(#${(r + c) % 2 ? "v" : "h"})'/>`;
    }
  }
  return uri(svg(T * N, T * N, body));
}
function slub() {
  const W = 96;
  const rand = rng(5);
  let body = "";
  for (let i = 0; i < 30; i++) {
    const horizontal = i % 2 === 0;
    const len = 8 + rand() * 30;
    const x = Math.floor(rand() * W);
    const y = Math.floor(rand() * W);
    const light = rand() > 0.45;
    const alpha = 0.03 + rand() * 0.05;
    const thick = 1 + Math.floor(rand() * 2);
    body += wrapped(W, W, x, y, len, (px, py) =>
      `<rect x='${px}' y='${py}' width='${horizontal ? f(len) : thick}' height='${horizontal ? thick : f(len)}' fill='${light ? "#fff" : "#000"}' fill-opacity='${f(alpha)}'/>`);
  }
  return uri(svg(W, W, body));
}

// ---- Suede: a nap of short fibres, one prevailing direction -----------------------------------
function nap() {
  const W = 96;
  const rand = rng(23);
  const groups = { "#fff": [[], [], []], "#000": [[], [], []] };
  const alphas = [0.06, 0.1, 0.14];
  for (let i = 0; i < 900; i++) {
    const x = rand() * W;
    const y = rand() * W;
    const angle = ((62 + (rand() - 0.5) * 70) * Math.PI) / 180;
    const len = 0.7 + rand() * 1.5;
    const dx = Math.cos(angle) * len;
    const dy = -Math.sin(angle) * len;
    const colour = rand() > 0.5 ? "#fff" : "#000";
    const bucket = Math.floor(rand() * 3);
    groups[colour][bucket].push(wrapped(W, W, x, y, 4, (px, py) => `M${f(px)} ${f(py)}l${f(dx)} ${f(dy)}`));
  }
  let body = "";
  for (const [colour, buckets] of Object.entries(groups)) {
    buckets.forEach((list, i) => {
      body += `<path d='${list.join("")}' stroke='${colour}' stroke-opacity='${alphas[i]}' stroke-width='.9' stroke-linecap='round' fill='none'/>`;
    });
  }
  return uri(svg(W, W, body));
}

// ---- Carbon: 2x2 twill, tows lit differently, gaps in shadow ----------------------------------
function twill() {
  const C = 5;
  const N = 4;
  let body = `<defs><linearGradient id='a' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#fff' stop-opacity='.14'/><stop offset='.5' stop-color='#fff' stop-opacity='.02'/><stop offset='1' stop-color='#000' stop-opacity='.17'/></linearGradient>`;
  body += `<linearGradient id='b' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='#000' stop-opacity='.08'/><stop offset='.55' stop-color='#fff' stop-opacity='.04'/><stop offset='1' stop-color='#000' stop-opacity='.22'/></linearGradient></defs>`;
  body += `<g stroke='#000' stroke-opacity='.2' stroke-width='.4'>`;
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const horizontal = (((c - r) % 4) + 4) % 4 < 2;
      body += `<rect x='${c * C + 0.3}' y='${r * C + 0.3}' width='${C - 0.6}' height='${C - 0.6}' fill='url(#${horizontal ? "a" : "b"})'/>`;
    }
  }
  body += `</g>`;
  return uri(svg(C * N, C * N, body));
}

// ---- Denim: steep twill ridges, and uneven yarn streaks ---------------------------------------
function denimTwill() {
  const body =
    `<path d='M0 6L3 0M-3 6L0 0M3 6L6 0' stroke='#fff' stroke-opacity='.1' stroke-width='1.1' fill='none'/>` +
    `<path d='M1.5 6L4.5 0M-1.5 6L1.5 0M4.5 6L7.5 0' stroke='#000' stroke-opacity='.13' stroke-width='1' fill='none'/>`;
  return uri(svg(3, 6, body));
}
function denimStreak() {
  const W = 128;
  const rand = rng(41);
  let body = "";
  for (let i = 0; i < 44; i++) {
    const x = Math.floor(rand() * W);
    const y = rand() * W;
    const len = 18 + rand() * 90;
    const w = 1 + Math.floor(rand() * 3);
    const light = rand() > 0.5;
    const alpha = f(0.04 + rand() * 0.07);
    body += wrapped(W, W, x, y, len, (px, py) =>
      `<rect x='${px}' y='${f(py)}' width='${w}' height='${f(len)}' fill='${light ? "#fff" : "#000"}' fill-opacity='${alpha}'/>`);
  }
  // a few white weft flecks, as in raw denim
  for (let i = 0; i < 48; i++) {
    const x = rand() * W;
    const y = rand() * W;
    const w = f(1 + rand() * 2.2);
    const alpha = f(0.14 + rand() * 0.14);
    body += wrapped(W, W, x, y, 3, (px, py) => `<rect x='${f(px)}' y='${f(py)}' width='${w}' height='.9' fill='#fff' fill-opacity='${alpha}'/>`);
  }
  return uri(svg(W, W, body));
}

// ---- Brushed metal: long horizontal scratches --------------------------------------------------
function brush() {
  const W = 256;
  const H = 96;
  const rand = rng(77);
  let body = "";
  for (let i = 0; i < 190; i++) {
    const y = Math.floor(rand() * H);
    const x = rand() * W;
    const len = 30 + rand() * 200;
    const light = rand() > 0.42;
    const alpha = f(0.025 + rand() * (light ? 0.07 : 0.06));
    const h = 0.6;
    const draw = (px) => `<rect x='${f(px)}' y='${y}' width='${f(len)}' height='${h}' fill='${light ? "#fff" : "#000"}' fill-opacity='${alpha}'/>`;
    body += draw(x);
    if (x + len > W) body += draw(x - W);
  }
  return uri(svg(W, H, body));
}

// ---- Ring hardware: one ring on its tile; CSS repeats it three times down the page ------------
const METALS = {
  silver: { stops: ["#fbfcfd", "#b7bcc4", "#6f757e", "#e6e9ed"], line: "#4b5058" },
  brass: { stops: ["#fff0b8", "#d3aa52", "#8a6a22", "#efd488"], line: "#5b4413" },
  black: { stops: ["#b4b8c0", "#53565e", "#1c1d21", "#686b73"], line: "#0b0b0d" },
};
/**
 * One ring on its tile. `edges` are the x ranges of the tile that lie over paper, where the
 * punched hole shows; `mount` puts a small riveted base on the cover side (the stacked leaf).
 */
function ring(metal, { w, rx, edges, mount, k = 1 }) {
  const m = METALS[metal];
  const h = 20 * k;
  const cx = w / 2 + (mount ? 2 : 0);
  const cy = h / 2;
  const ry = 5.6 * k;
  const grad = `<linearGradient id='g' gradientUnits='userSpaceOnUse' x1='0' y1='${f(cy - ry)}' x2='0' y2='${f(cy + ry)}'><stop offset='0' stop-color='${m.stops[0]}'/><stop offset='.38' stop-color='${m.stops[1]}'/><stop offset='.72' stop-color='${m.stops[2]}'/><stop offset='1' stop-color='${m.stops[3]}'/></linearGradient>`;
  const clips = edges
    .map(([lo, hi], i) => `<clipPath id='c${i}'><rect x='${lo}' y='0' width='${hi - lo}' height='${h}'/></clipPath>`)
    .join("");
  const plate = `<linearGradient id='p' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='${m.stops[0]}'/><stop offset='.5' stop-color='${m.stops[1]}'/><stop offset='1' stop-color='${m.stops[2]}'/></linearGradient>`;
  let body = `<defs>${grad}${plate}${clips}</defs>`;
  // the punched hole: the ring's interior, only where it lies over paper
  edges.forEach((_, i) => {
    body += `<ellipse cx='${cx}' cy='${cy}' rx='${rx - 1.5}' ry='${ry - 1.5}' fill='#000' fill-opacity='.38' clip-path='url(#c${i})'/>`;
  });
  // contact shadow on the paper, the riveted base, then the ring itself
  body += `<ellipse cx='${cx + 1.2}' cy='${cy + 2.4}' rx='${rx}' ry='${ry}' fill='none' stroke='#000' stroke-opacity='.32' stroke-width='${3 * k}'/>`;
  if (mount) {
    body += `<rect x='1.5' y='${cy - 6.5}' width='7.5' height='13' rx='2' fill='#000' fill-opacity='.35' transform='translate(.8 1.4)'/>`;
    body += `<rect x='1.5' y='${cy - 6.5}' width='7.5' height='13' rx='2' fill='url(#p)' stroke='${m.line}' stroke-width='.8'/>`;
    body += `<circle cx='5.25' cy='${cy - 3}' r='.9' fill='${m.line}' fill-opacity='.7'/><circle cx='5.25' cy='${cy + 3}' r='.9' fill='${m.line}' fill-opacity='.7'/>`;
  }
  body += `<ellipse cx='${cx}' cy='${cy}' rx='${rx}' ry='${ry}' fill='none' stroke='${m.line}' stroke-width='${3 * k}'/>`;
  body += `<ellipse cx='${cx}' cy='${cy}' rx='${rx}' ry='${ry}' fill='none' stroke='url(#g)' stroke-width='${2.2 * k}'/>`;
  return uri(svg(w, h, body));
}

const tiles = {
  pebble: pebble(),
  weave: weave(),
  slub: slub(),
  nap: nap(),
  twill: twill(),
  "denim-twill": denimTwill(),
  "denim-streak": denimStreak(),
  brush: brush(),
};
for (const metal of Object.keys(METALS)) {
  // 28 wide: a base on the cover, the page edge at x=11, the ring's right part over the page
  tiles[`ring-${metal}`] = ring(metal, { w: 28, rx: 10, edges: [[11, 28]], mount: true });
  // 52 wide: centred on a 30px gutter, the page edges at x=11 and x=41
  tiles[`gutter-${metal}`] = ring(metal, { w: 52, rx: 22.5, edges: [[0, 11], [41, 52]], k: 1.3 });
}

const css = `/* Seamless tiles for the binder covers, generated by scripts/make-binder-textures.mjs: do not edit.
   Marks are black or white at low alpha, so the cover colour stays the colour. No filters. */
.binder-object {
${Object.entries(tiles)
  .map(([name, value]) => `  --bt-${name}: ${value};`)
  .join("\n")}
}
`;
writeFileSync(FILE, css);
const sizes = Object.entries(tiles).map(([k, v]) => `${k} ${v.length}`).join(", ");
console.log(`textures written: ${sizes}`);
