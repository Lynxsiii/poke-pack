/**
 * Draw every file the site's logo ships as, from one drawing: three cards of our
 * own in a fan, spelling R, I, P for the .rip in the address, on the look's ground
 * (see mark() below). No real card art.
 *
 *   node scripts/make_logo.mjs
 *
 *   assets/mark-v2.png                the tile, 256: header, loading screen, sign-in, share card
 *   assets/icon-32-v2.png             browser tab (rounded corners)
 *   assets/icon-180-v2.png            iOS home screen (square, iOS rounds it)
 *   assets/icon-192-v2.png, icon-512-v2.png, icon-512-maskable-v2.png   the web manifest (worker/seo.js)
 *   assets/avatar-v2.png, avatar-round-v2.png   social profile picture, Discord webhook avatar
 *   assets/og-v2.jpg                  the link preview, 1200x630
 *   assets/fan-v3.png                 the three cards alone on nothing, for the header beside the name
 *
 * Files under assets/ are cached for a year: a redraw ships under the next -vN names
 * (bump V here) and every reference moves with it. Needs Playwright.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { join, resolve } from "node:path";

const V = 3;
/* Which faces the three cards wear: "foil" (gold, night, rainbow), "red" (all Rocket red) or "white" (white, red letters). */
const FINISH = process.env.LOGO_FINISH || "red";
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

/* The mark: three cards of our own side by side in a shallow fan, lettered R, I, P (the I upright in front), each
   with the ink line and the hard shadow, on GROUND with the red slab leaning behind. Drawn on a 512 square. Every card is drawn here: no card scans, characters or anyone else's marks go into the logo. */
const INK = "#14171b";
const GROUND = INK;
const RED = "#e3202b";
const SLAB = RED; // "" for no slab
const SHADOW = "10px 12px 0 rgb(0 0 0 / 0.4)";
const ground = GROUND;
const FACE = {
  gold: { base: "radial-gradient(circle at 50% 44%,#fffbd0 0,#ffd21f 36%,#ff9318 100%)", foil: "background:repeating-conic-gradient(from 4deg at 50% 44%,rgb(255 255 255/.5) 0 7deg,transparent 7deg 20deg)", rim: "#fff4c0" },
  night: { base: "linear-gradient(160deg,#3a2a9a,#191a3a 55%,#14171b)", foil: "background:linear-gradient(118deg,transparent 18%,#37cfe0 38%,#b56cff 52%,#ff5fa8 64%,transparent 82%);opacity:.6;mix-blend-mode:screen", rim: "#cfd8e0" },
  holo: { base: "linear-gradient(140deg,#35e3cf,#3aa2ff 32%,#a970ff 56%,#ff6fae 78%,#ffd21f)", foil: "background:repeating-linear-gradient(118deg,rgb(255 255 255/.34) 0 7px,transparent 7px 24px)", rim: "#ffffff" },
  red: { base: `radial-gradient(circle at 50% 38%,#ff5d66 0,${RED} 55%,#b3121b 100%)`, foil: "background:repeating-linear-gradient(118deg,rgb(255 255 255/.16) 0 7px,transparent 7px 24px)", rim: "#ffffff" },
  white: { base: "#ffffff", foil: "background:repeating-linear-gradient(118deg,rgb(20 23 27/.06) 0 7px,transparent 7px 24px)", rim: RED, letter: RED, edge: "#ffffff" },
};
const CARDS = { foil: ["gold", "night", "holo"], red: ["red", "red", "red"], white: ["white", "white", "white"] }[FINISH];
const LETTERS = ["R", "I", "P"];
/* One card face filling its box; k scales the line weights (1 on the 512 tile). */
const card = (i, k = 1) => {
  const f = FACE[CARDS[i]];
  return `<div style="position:absolute;inset:0;border-radius:${13 * k}px;overflow:hidden;background:${f.base}">
<i style="position:absolute;inset:0;${f.foil}"></i>
<i style="position:absolute;inset:0;border:${7 * k}px solid ${f.rim};border-radius:${13 * k}px"></i>
<i style="position:absolute;inset:${7 * k}px;border:${2.5 * k}px solid ${INK};border-radius:${7 * k}px"></i>
<b style="position:absolute;inset:0;display:grid;place-items:center;padding-right:${10 * k}px;font:${120 * k}px/1 'Kanit Title';color:${f.letter || "#fff"};-webkit-text-stroke:${17 * k}px ${f.edge || INK};paint-order:stroke fill;filter:drop-shadow(${4 * k}px ${5 * k}px 0 rgb(0 0 0/.3))">${LETTERS[i]}</b>
</div>`;
};
const mark = ({ bare = false, shadow = SHADOW } = {}) => {
  const H = 204, W = H * 0.716;
  const fan = [[0, -13, 12, 1, -127], [1, 0, -10, 3, 0], [2, 13, 12, 2, 127]]; // card, angle, drop, layer, shift: R, I, P left to right, I in front
  return `<div class="mark" style="position:relative;width:512px;height:512px;${bare ? "" : `overflow:hidden;background:${GROUND}`}">
${SLAB && !bare ? `<i style="position:absolute;left:132px;top:-40px;width:248px;height:600px;background:${SLAB};transform:skewX(-14deg)"></i>` : ""}
${fan.map(([c, r, y, z, x]) => `<div style="position:absolute;left:${256 - W / 2 + x}px;top:${256 - H / 2 + y}px;width:${W}px;height:${H}px;border-radius:13px;transform:rotate(${r}deg);z-index:${z};box-shadow:0 0 0 5px ${INK};filter:drop-shadow(${shadow})">${card(c)}</div>`).join("")}
</div>`;
};

/* One square picture: the tile at `scale` of the square on its own ground, clipped to `radius` (a CSS value). */
const tilePage = (px, { scale = 1, radius = "0" } = {}) => `<!doctype html><meta charset="utf-8"><style>${FONTS}
html, body { margin: 0; width: ${px}px; height: ${px}px; background: transparent; }
.t { width: ${px}px; height: ${px}px; display: grid; place-items: center; background: ${ground}; border-radius: ${radius}; overflow: hidden; }
.t .mark { flex: none; zoom: ${(px * scale) / 512}; }
</style><div class="t">${mark()}</div>`;

const ogPage = (markPng) => `<!doctype html><meta charset="utf-8"><style>${FONTS}
* { box-sizing: border-box; margin: 0; }
html, body { width: 1200px; height: 630px; overflow: hidden; }
body { position: relative; background-color: #0d0d0e; background-image: repeating-linear-gradient(104deg, rgb(255 255 255 / 0.04) 0 3px, transparent 3px 22px); color: #ffffff; font-family: "Kanit", sans-serif; }
.slab { position: absolute; left: 700px; top: -40px; width: 620px; height: 720px; background: ${RED}; transform: skewX(-14deg); }
.left { position: absolute; left: 68px; top: 60px; bottom: 60px; width: 620px; display: flex; flex-direction: column; }
.brand { display: flex; align-items: center; gap: 16px; font: italic 800 40px/1 "Kanit Title"; letter-spacing: -0.02em; }
.brand img { width: 68px; height: 68px; border-radius: 14px; }
h1 { margin-top: auto; font: italic 800 108px/0.92 "Kanit Title"; letter-spacing: -0.03em; }
.meta { margin-top: 26px; font: 700 31px/1.2 "Kanit"; }
.fine { margin-top: 8px; font: 600 25px/1.2 "Kanit"; color: #a0a0a8; }
.fan { position: absolute; left: 596px; top: 24px; zoom: 1.14; }
</style>
<div class="slab"></div>
<div class="fan">${mark({ bare: true, shadow: "10px 12px 0 rgb(60 0 4 / 0.45)" })}</div>
<div class="left">
  <div class="brand"><img src="data:image/png;base64,${markPng}" alt="" /><span>poke-pack.rip</span></div>
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
await shot(`<!doctype html><meta charset="utf-8"><style>${FONTS} html, body { margin: 0; background: transparent; }</style>${mark({ bare: true })}`, 512, 512, `fan-v${V}.png`, { clip: { x: 18, y: 128, width: 476, height: 268 } });
await shot(ogPage(b64(join(ASSETS, `mark-v${V}.png`))), 1200, 630, `og-v${V}.jpg`, { type: "jpeg", quality: 88, omitBackground: false });
await browser.close();
