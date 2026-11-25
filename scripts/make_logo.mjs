/**
 * Draw every file the site's logo ships as, from one drawing: three card scans
 * in a fan on the look's ground (see mark() below).
 *
 *   node scripts/make_logo.mjs
 *
 *   assets/mark-v2.png                the tile, 256: header, loading screen, sign-in, share card
 *   assets/icon-32-v2.png             browser tab (rounded corners)
 *   assets/icon-180-v2.png            iOS home screen (square, iOS rounds it)
 *   assets/icon-192-v2.png, icon-512-v2.png, icon-512-maskable-v2.png   the web manifest (worker/seo.js)
 *   assets/avatar-v2.png, avatar-round-v2.png   social profile picture, Discord webhook avatar
 *   assets/og-v2.jpg                  the link preview, 1200x630
 *
 * Files under assets/ are cached for a year: a redraw ships under -v3 names
 * (bump V here) and every reference moves with it. Needs Playwright.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { join, resolve } from "node:path";

const V = 2;
const ROOT = resolve(new URL("..", import.meta.url).pathname);
const ASSETS = join(ROOT, "assets");
const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require("playwright");
} catch {
  playwright = require(join(execSync("npm root -g").toString().trim(), "playwright"));
}

const b64 = (p) => readFileSync(p).toString("base64");
const font = (name, file, style, weight) =>
  `@font-face { font-family: "${name}"; font-style: ${style}; font-weight: ${weight}; src: url(data:font/woff2;base64,${b64(join(ASSETS, "fonts", file))}) format("woff2"); }`;
const FONTS = [
  font("Kanit Title", "kanit-800i-latin-v1.woff2", "italic", 800),
  font("Kanit", "kanit-600-latin-v1.woff2", "normal", 600),
  font("Kanit", "kanit-700-latin-v1.woff2", "normal", 700),
].join("\n");

/* The mark: three card scans in a fan (gold tallest at the back, the dark card left, the bright one in front), each
   with the ink line and the hard shadow, on GROUND with the cyan slab leaning behind. Drawn on a 512 square. */
const CARDS = ["me2-125", "me2pt5-290", "me2pt5-294"];
const GROUND = "#14171b";
const SLAB = "#00b4c8"; // "" for no slab
const SHADOW = "10px 12px 0 rgb(0 0 0 / 0.4)";
const ground = GROUND;
const card = (id) => {
  const i = id.lastIndexOf("-");
  return `data:image/webp;base64,${b64(join(ASSETS, "cards", id.slice(0, i), `${id.slice(i + 1)}.webp`))}`;
};
const mark = () => {
  const H = 262, W = H * 0.716;
  const fan = [[2, -2, -78, 1], [0, -27, 22, 2], [1, 24, 30, 3]]; // card, angle, drop, layer
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><foreignObject width="512" height="512"><div xmlns="http://www.w3.org/1999/xhtml" style="position:relative;width:512px;height:512px;overflow:hidden;background:${GROUND}">
${SLAB ? `<i style="position:absolute;left:132px;top:-40px;width:248px;height:600px;background:${SLAB};transform:skewX(-14deg)"></i>` : ""}
${fan.map(([c, r, y, z]) => `<img src="${card(CARDS[c])}" style="position:absolute;left:${256 - W / 2}px;top:${256 - H / 2 + y + 22}px;width:${W}px;height:${H}px;border-radius:13px;transform-origin:50% 120%;transform:rotate(${r}deg);z-index:${z};box-shadow:0 0 0 5px #14171b;filter:drop-shadow(${SHADOW})" />`).join("")}
</div></foreignObject></svg>`;
};

/* One square picture: the tile at `scale` of the square on its own ground, clipped to `radius` (a CSS value). */
const tilePage = (px, { scale = 1, radius = "0" } = {}) => `<!doctype html><meta charset="utf-8"><style>
html, body { margin: 0; width: ${px}px; height: ${px}px; background: transparent; }
.t { width: ${px}px; height: ${px}px; display: grid; place-items: center; background: ${ground}; border-radius: ${radius}; overflow: hidden; }
.t svg { width: ${px * scale}px; height: ${px * scale}px; display: block; }
</style><div class="t">${mark()}</div>`;

const ogPage = () => `<!doctype html><meta charset="utf-8"><style>${FONTS}
* { box-sizing: border-box; margin: 0; }
html, body { width: 1200px; height: 630px; overflow: hidden; }
body { position: relative; background-color: #eef2f3; background-image: radial-gradient(rgb(20 23 27 / 0.09) 2.4px, transparent 2.6px); background-size: 22px 22px; color: #14171b; font-family: "Kanit", sans-serif; }
.slab { position: absolute; left: 700px; top: -40px; width: 620px; height: 720px; background: #00b4c8; transform: skewX(-14deg); }
.left { position: absolute; left: 68px; top: 60px; bottom: 60px; width: 620px; display: flex; flex-direction: column; }
.brand { display: flex; align-items: center; gap: 16px; font: italic 800 40px/1 "Kanit Title"; letter-spacing: -0.02em; }
.brand svg { width: 68px; height: 68px; border-radius: 14px; }
.brand i { display: inline-block; margin-left: -8px; padding: 5px 11px 7px 9px; border-radius: 5px; background: #14171b; transform: skewX(-14deg); font-style: inherit; }
.brand b { display: block; color: #ffd21f; transform: skewX(14deg); font-weight: inherit; }
h1 { margin-top: auto; font: italic 800 108px/0.92 "Kanit Title"; letter-spacing: -0.03em; }
.meta { margin-top: 26px; font: 700 31px/1.2 "Kanit"; }
.fine { margin-top: 8px; font: 600 25px/1.2 "Kanit"; color: #566069; }
.fan { position: absolute; left: 790px; top: 150px; width: 250px; height: 350px; }
.fan img { position: absolute; inset: 0; width: 250px; height: 349px; border-radius: 12px; transform-origin: 50% 110%; filter: drop-shadow(8px 10px 0 rgb(0 40 50 / 0.28)); }
</style>
<div class="slab"></div>
<div class="fan">
  <img src="${card(CARDS[0])}" style="transform: rotate(-17deg) translateX(-34px)" />
  <img src="${card(CARDS[1])}" style="transform: rotate(-1deg) translateY(-22px)" />
  <img src="${card(CARDS[2])}" style="transform: rotate(15deg) translateX(34px)" />
</div>
<div class="left">
  <div class="brand">${mark()}<span>poke-pack</span><i><b>.rip</b></i></div>
  <h1>Rip packs.<br />Fill the binder.</h1>
  <p class="meta">Real odds, real scans, real prices</p>
  <p class="fine">Free forever, fan-made, no real money</p>
</div>`;

const browser = await playwright.chromium.launch();
async function shot(html, w, h, file, opts = {}) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(ASSETS, file), omitBackground: true, ...opts });
  await page.close();
  console.log(`  assets/${file}`);
}
await shot(tilePage(256), 256, 256, `mark-v${V}.png`);
await shot(tilePage(32, { radius: "22%" }), 32, 32, `icon-32-v${V}.png`);
await shot(tilePage(180), 180, 180, `icon-180-v${V}.png`);
await shot(tilePage(192, { radius: "22%" }), 192, 192, `icon-192-v${V}.png`);
await shot(tilePage(512, { radius: "22%" }), 512, 512, `icon-512-v${V}.png`);
await shot(tilePage(512, { scale: 0.74 }), 512, 512, `icon-512-maskable-v${V}.png`);
await shot(tilePage(512), 512, 512, `avatar-v${V}.png`);
await shot(tilePage(512, { scale: 0.8, radius: "50%" }), 512, 512, `avatar-round-v${V}.png`);
await shot(ogPage(), 1200, 630, `og-v${V}.jpg`, { type: "jpeg", quality: 88, omitBackground: false });
await browser.close();
