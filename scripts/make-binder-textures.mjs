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
  const T = 4;
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
  const alphas = [0.08, 0.13, 0.19];
  for (let i = 0; i < 760; i++) {
    const x = rand() * W;
    const y = rand() * W;
    const angle = ((62 + (rand() - 0.5) * 70) * Math.PI) / 180;
    const len = 1.1 + rand() * 1.6;
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
  const C = 4;
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
  // ridges at 63 degrees (rise 2 for every 1 across), each its own width and strength so no two
  // neighbours match: 24 x 48 wraps, every ridge running off one side and back in at the other
  const W = 24;
  const H = 48;
  const rand = rng(53);
  let body = "";
  for (let i = 0; i < 12; i++) {
    const x = i * 2 + rand() * 1.2;
    const light = i % 2 === 0;
    const alpha = f(light ? 0.04 + rand() * 0.08 : 0.06 + rand() * 0.1);
    const w = f(0.9 + rand() * 0.9);
    for (const dx of [-W, 0, W]) {
      body += `<path d='M${f(x + dx + W)} 0L${f(x + dx)} ${H}' stroke='${light ? "#fff" : "#000"}' stroke-opacity='${alpha}' stroke-width='${w}' fill='none'/>`;
    }
  }
  return uri(svg(W, H, body));
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
  // faint cloudy mottling, the way dyed yarn never lays quite even
  const mottle = [];
  for (let i = 0; i < 26; i++) {
    const x = rand() * W;
    const y = rand() * W;
    const r = 10 + rand() * 22;
    const light = rand() > 0.5;
    mottle.push(wrapped(W, W, x, y, r, (px, py) => `<circle cx='${f(px)}' cy='${f(py)}' r='${f(r)}' fill='url(#${light ? "ml" : "md"})'/>`));
  }
  body = `<defs><radialGradient id='ml'><stop offset='0' stop-color='#fff' stop-opacity='.07'/><stop offset='1' stop-color='#fff' stop-opacity='0'/></radialGradient><radialGradient id='md'><stop offset='0' stop-color='#000' stop-opacity='.09'/><stop offset='1' stop-color='#000' stop-opacity='0'/></radialGradient></defs>` + mottle.join("") + body;
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
  silver: { stops: ["#fbfcfd", "#b7bcc4", "#6f757e", "#e6e9ed"], line: "#4b5058", plate: ["#4b4e56", "#25272c"] },
  brass: { stops: ["#fff0b8", "#d3aa52", "#8a6a22", "#efd488"], line: "#5b4413", plate: ["#5a4a2c", "#2c2415"] },
  black: { stops: ["#b4b8c0", "#53565e", "#1c1d21", "#686b73"], line: "#0b0b0d", plate: ["#3c3e44", "#16171a"] },
};
/** A dark mounting plate with two rivets, centred on cx. */
function mountPlate(cx, w) {
  const x = f(cx - w / 2);
  const y = 3;
  const h = 28;
  return (
    `<rect x='${x}' y='${y}' width='${w}' height='${h}' rx='3' fill='#000' fill-opacity='.4' transform='translate(.8 1.5)'/>` +
    `<rect x='${x}' y='${y}' width='${w}' height='${h}' rx='3' fill='url(#pl)' stroke='#050506' stroke-width='.8'/>` +
    `<rect x='${f(cx - w / 2 + 0.9)}' y='${y + 0.9}' width='${w - 1.8}' height='${h - 1.8}' rx='2.2' fill='none' stroke='#fff' stroke-opacity='.16' stroke-width='.7'/>` +
    [y + 5.5, y + h - 5.5].map((ry) => `<circle cx='${cx}' cy='${f(ry)}' r='1.7' fill='url(#rv)' stroke='#050506' stroke-width='.5'/>`).join("")
  );
}
/**
 * A D-ring on its plate, on a w x 34 tile. `d` is the loop's outline, `px` and `pw` the plate's centre
 * and width, `edges` the x ranges of the tile that lie over paper and `holes` the punched holes
 * (cx, cy, rx, ry) that show there, shadowed.
 */
function dring(metal, { w, d, px, pw, edges, holes }) {
  const m = METALS[metal];
  const h = 34;
  const grad = `<linearGradient id='g' gradientUnits='userSpaceOnUse' x1='0' y1='4' x2='0' y2='30'><stop offset='0' stop-color='${m.stops[0]}'/><stop offset='.36' stop-color='${m.stops[1]}'/><stop offset='.7' stop-color='${m.stops[2]}'/><stop offset='1' stop-color='${m.stops[3]}'/></linearGradient>`;
  const plate = `<linearGradient id='pl' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${m.plate[0]}'/><stop offset='1' stop-color='${m.plate[1]}'/></linearGradient><radialGradient id='rv' cx='.35' cy='.3' r='.8'><stop offset='0' stop-color='${m.stops[0]}'/><stop offset='1' stop-color='${m.stops[2]}'/></radialGradient>`;
  const clips = edges.map(([lo, hi], i) => `<clipPath id='c${i}'><rect x='${lo}' y='0' width='${hi - lo}' height='${h}'/></clipPath>`).join("");
  let body = `<defs>${grad}${plate}${clips}</defs>`;
  // the punched holes in the paper, only where the paper is
  for (const [cx, cy, rx, ry] of holes) {
    edges.forEach(([lo, hi], k) => {
      if (lo <= cx + rx && hi >= cx - rx) body += `<ellipse cx='${cx}' cy='${cy}' rx='${rx}' ry='${ry}' fill='#000' fill-opacity='.5' clip-path='url(#c${k})'/>`;
    });
  }
  // contact shadow, the loop, its highlight, then the plate it is riveted to
  body += `<path d='${d}' fill='none' stroke='#000' stroke-opacity='.34' stroke-width='4.6' stroke-linejoin='round' transform='translate(1.3 2.4)'/>`;
  body += `<path d='${d}' fill='none' stroke='${m.line}' stroke-width='4.6' stroke-linejoin='round'/>`;
  body += `<path d='${d}' fill='none' stroke='url(#g)' stroke-width='3.3' stroke-linejoin='round'/>`;
  body += `<path d='${d}' fill='none' stroke='#fff' stroke-opacity='.5' stroke-width='.9' stroke-linejoin='round' transform='translate(-.3 -.9)' stroke-dasharray='20 200'/>`;
  body += mountPlate(px, pw);
  return uri(svg(w, h, body));
}

// ---- Zip around: a chain of interlocking teeth (two tones, 7px apart), and the pull ---------------
function zipTeeth(vertical) {
  const L = 14;
  const T = 6;
  const body =
    `<defs><linearGradient id='a' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#f6f7f9'/><stop offset='1' stop-color='#b9bec6'/></linearGradient>` +
    `<linearGradient id='b' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#b4bac2'/><stop offset='1' stop-color='#737984'/></linearGradient></defs>` +
    `<rect x='0' y='2.6' width='${L}' height='.9' fill='#000' fill-opacity='.55'/>` +
    `<rect x='.5' y='.2' width='6' height='3.1' rx='1' fill='url(#a)' stroke='#3a3e45' stroke-width='.6'/>` +
    `<rect x='7.5' y='2.7' width='6' height='3.1' rx='1' fill='url(#b)' stroke='#2f3238' stroke-width='.6'/>`;
  if (!vertical) return uri(svg(L, T, body));
  // turned a quarter: teeth alternate left and right going down
  return uri(svg(T, L, `<g transform='translate(${T} 0) rotate(90)'>${body}</g>`));
}
function zipPull() {
  const tab = `M5 4.2h24.5a4 4 0 0 1 4 4v3.4a4 4 0 0 1-4 4H5a4 4 0 0 1-4-4V8.2a4 4 0 0 1 4-4zM6.2 8.2h14a2.1 2.1 0 0 1 2.1 2.1v.3a2.1 2.1 0 0 1-2.1 2.1h-14a2.1 2.1 0 0 1-2.1-2.1v-.3a2.1 2.1 0 0 1 2.1-2.1z`;
  const body =
    `<defs><linearGradient id='t' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#f4f5f8'/><stop offset='.45' stop-color='#bcc1c9'/><stop offset='1' stop-color='#7b818b'/></linearGradient>` +
    `<linearGradient id='s' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='#d7dbe1'/><stop offset='.55' stop-color='#8d939d'/><stop offset='1' stop-color='#585d66'/></linearGradient></defs>` +
    // the tab lies along the chain: a rounded rectangle with a slot
    `<path fill-rule='evenodd' d='${tab}' fill='#000' fill-opacity='.38' transform='translate(.8 2)'/>` +
    `<path fill-rule='evenodd' d='${tab}' fill='url(#t)' stroke='#3a3e45' stroke-width='.8'/>` +
    `<path d='M5.4 5.4h23.8' stroke='#fff' stroke-opacity='.85' stroke-width='1' stroke-linecap='round'/>` +
    // the slider body on the chain, the tab hanging from its eye
    `<rect x='29' y='1.4' width='17' height='13' rx='3.5' fill='#000' fill-opacity='.38' transform='translate(.8 2)'/>` +
    `<rect x='29' y='1.4' width='17' height='13' rx='3.5' fill='url(#s)' stroke='#2c2f35' stroke-width='.8'/>` +
    `<path d='M31.5 2.8h12' stroke='#fff' stroke-opacity='.7' stroke-width='1' stroke-linecap='round'/>` +
    `<rect x='33.5' y='5.4' width='7' height='5' rx='1.6' fill='#25272c' fill-opacity='.7'/>`;
  return uri(svg(48, 22, body));
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
tiles["zip-h"] = zipTeeth(false);
tiles["zip-v"] = zipTeeth(true);
tiles["zip-pull"] = zipPull();
for (const metal of Object.keys(METALS)) {
  // 44 wide: the cover frame is 34px (the page edge at x=34), a plate at the cover edge, the loop crossing onto the page
  tiles[`ring-${metal}`] = dring(metal, { w: 44, d: "M10 5H28A12 12 0 0 1 28 29H10", px: 8, pw: 10, edges: [[34, 44]], holes: [[34, 17, 7, 11]] });
  // 64 wide: centred on a 30px gutter (page edges at x=17 and x=47), a plate in the spine, a loop each way
  tiles[`gutter-${metal}`] = dring(metal, { w: 64, d: "M20 5H44A12 12 0 0 1 44 29H20A12 12 0 0 1 20 5Z", px: 32, pw: 12, edges: [[0, 17], [47, 64]], holes: [[17, 17, 7, 11], [47, 17, 7, 11]] });
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
