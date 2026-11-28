/**
 * Draw each set's link-preview image: assets/og/sets/<set>-v2.jpg, 1200x630.
 *
 * worker/seo.js puts it in the head of /packs/<set>, so a set link pasted
 * into Discord, iMessage or X shows that set (its logo, a wrapper and its
 * chase cards on the cyan slab) instead of the home page's card. The Worker
 * falls back to assets/og-v3.jpg for a set that has no image yet, so a new set
 * works before this is run; run it after adding one:
 *
 *   node scripts/make_og_sets.mjs            every playable set missing an image
 *   node scripts/make_og_sets.mjs me5 sv3    just these (overwrites them: only
 *                                            for images not yet merged)
 *
 * Files under assets/ are cached for a year, so a redraw of a merged image
 * must ship under the next version: bump SET_IMAGE_VERSION in worker/seo.js
 * and here, then run with --all.
 *
 * Built with the site's own parts: Kanit from assets/fonts, the set logo
 * and wrapper art from assets/, the card scans the set lists as its heroes.
 * Needs Playwright (installed globally in the sandbox).
 */
import { createServer } from "node:http";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { extname, join, resolve } from "node:path";
import { PLAYABLE_SETS, setIdentity } from "../js/catalog.js";

const VERSION = 2;
const ROOT = resolve(new URL("..", import.meta.url).pathname);
const OUT = join(ROOT, "assets", "og", "sets");

const args = process.argv.slice(2);
const all = args.includes("--all");
const only = args.filter((a) => !a.startsWith("--"));

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require("playwright");
} catch {
  playwright = require(join(execSync("npm root -g").toString().trim(), "playwright"));
}

/* Every card's scan, by id, from the data files. */
const scans = new Map();
for (const file of readdirSync(join(ROOT, "data"))) {
  if (!file.endsWith(".json")) continue;
  let rows;
  try {
    rows = JSON.parse(readFileSync(join(ROOT, "data", file), "utf8"));
  } catch {
    continue;
  }
  if (!Array.isArray(rows)) continue;
  for (const card of rows) if (card?.id && card.image && !scans.has(card.id)) scans.set(card.id, card.image);
}

const MIME = { ".html": "text/html", ".webp": "image/webp", ".png": "image/png", ".avif": "image/avif", ".jpg": "image/jpeg", ".woff2": "font/woff2" };
const pages = new Map();
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (pages.has(path)) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(pages.get(path));
    return;
  }
  const file = join(ROOT, path);
  if (!file.startsWith(ROOT) || !existsSync(file)) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
  res.end(readFileSync(file));
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const base = `http://127.0.0.1:${server.address().port}`;

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function monthYear(released) {
  const d = new Date(released);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

function pageFor(set) {
  const logo = setIdentity(set).logo;
  const wrapper = (set.wrappers || []).find((w) => w.artFallback || w.art);
  const wrapperArt = wrapper ? wrapper.artFallback || wrapper.art : "";
  const heroes = (set.heroIds || []).map((id) => scans.get(id)).filter(Boolean).slice(0, wrapperArt ? 2 : 4);
  const meta = [set.era || set.edition, monthYear(set.released), set.totalCount ? `${set.totalCount} cards` : ""].filter(Boolean).join(", ");
  const promo = Boolean(set.promoSet) || !set.packSize;
  const line = promo ? "Promos" : "Booster packs";
  // Cards fan out from behind the wrapper, the best one nearest the front.
  const fan = wrapperArt
    ? [
        { x: 20, r: -14, z: 1 },
        { x: 270, r: 14, z: 2 },
      ]
    : [
        { x: 10, r: -16, z: 1 },
        { x: 280, r: 15, z: 2 },
        { x: 105, r: -5, z: 3 },
        { x: 205, r: 6, z: 4 },
      ];
  const cards = heroes
    .map((src, i) => {
      const f = fan[i];
      return `<img class="card" src="/${esc(src)}" style="left:${f.x}px;transform:rotate(${f.r}deg);z-index:${f.z}" />`;
    })
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8" />
<style>
@font-face { font-family: "Kanit Title"; src: url(/assets/fonts/kanit-800i-latin-v1.woff2) format("woff2"); font-style: italic; font-weight: 800; }
@font-face { font-family: "Kanit"; src: url(/assets/fonts/kanit-600-latin-v1.woff2) format("woff2"); font-weight: 600; }
@font-face { font-family: "Kanit"; src: url(/assets/fonts/kanit-700-latin-v1.woff2) format("woff2"); font-weight: 700; }
* { box-sizing: border-box; margin: 0; }
html, body { width: 1200px; height: 630px; overflow: hidden; }
body { position: relative; background-color: #eef2f3; background-image: radial-gradient(rgb(20 23 27 / 0.09) 2.4px, transparent 2.6px); background-size: 22px 22px; font-family: "Kanit", sans-serif; color: #14171b; }
.left { position: absolute; left: 64px; top: 52px; bottom: 52px; width: 470px; display: flex; flex-direction: column; }
.brand { display: flex; align-items: center; gap: 13px; font: italic 800 31px/1 "Kanit Title"; letter-spacing: -0.02em; }
.brand img { width: 54px; height: 54px; border-radius: 12px; }
.brand i { display: inline-block; margin-left: -7px; padding: 4px 9px 6px 7px; border-radius: 4px; background: #14171b; transform: skewX(-14deg); font-style: inherit; }
.brand b { display: block; color: #ffd21f; transform: skewX(14deg); font-weight: inherit; }
.logo { margin-top: auto; max-width: 440px; max-height: 190px; object-fit: contain; object-position: left center; align-self: flex-start; filter: drop-shadow(0 0 1.5px #14171b) drop-shadow(0 0 1.5px #14171b) drop-shadow(4px 5px 0 rgb(0 40 50 / 0.2)); }
.kicker { margin-top: 24px; align-self: flex-start; position: relative; z-index: 0; padding: 7px 18px 9px 14px; font: italic 800 34px/1 "Kanit Title"; color: #14171b; }
.kicker::before { content: ""; position: absolute; inset: 0; z-index: -1; background: #ffd21f; border: 3px solid #14171b; transform: skewX(-14deg); }
.meta { margin-top: 14px; font: 600 24px/1.3 "Kanit", sans-serif; color: #566069; }
.url { margin-top: auto; padding-top: 20px; font: 700 24px/1 "Kanit", sans-serif; color: #14171b; }
.slab { position: absolute; left: 700px; top: -40px; width: 620px; height: 720px; background: #00b4c8; transform: skewX(-14deg); }
.stage { position: absolute; left: 580px; top: 0; width: 600px; height: 630px; }
.card { position: absolute; top: 120px; height: 380px; border-radius: 14px; transform-origin: 50% 90%; filter: drop-shadow(8px 10px 0 rgb(0 40 50 / 0.28)); }
.pack { position: absolute; left: 50%; top: 50%; height: 560px; transform: translate(-50%, -50%); z-index: 5; filter: drop-shadow(10px 12px 0 rgb(0 40 50 / 0.3)); }
</style></head><body>
<div class="slab"></div>
<div class="stage">${cards}${wrapperArt ? `<img class="pack" src="/${esc(wrapperArt)}" />` : ""}</div>
<div class="left">
  <div class="brand"><img src="/assets/mark-v3.png" /><span>poke-pack</span><i><b>.rip</b></i></div>
  <img class="logo" src="/${esc(logo)}" />
  <div class="kicker">${esc(line)}</div>
  <div class="meta">${esc(meta)}</div>
  <div class="url">poke-pack.rip/packs/${esc(set.id)}</div>
</div>
</body></html>`;
}

mkdirSync(OUT, { recursive: true });
const browser = await playwright.chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
let made = 0;
for (const set of PLAYABLE_SETS) {
  if (only.length && !only.includes(set.id)) continue;
  const file = join(OUT, `${set.id}-v${VERSION}.jpg`);
  if (!only.length && !all && existsSync(file)) continue;
  pages.set(`/og-${set.id}.html`, pageFor(set));
  await page.goto(`${base}/og-${set.id}.html`, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  const broken = await page.evaluate(() => [...document.images].filter((img) => !img.naturalWidth).map((img) => img.getAttribute("src")));
  if (broken.length) console.warn(`  ${set.id}: missing ${broken.join(", ")}`);
  await page.screenshot({ path: file, type: "jpeg", quality: 84 });
  made += 1;
  console.log(`  assets/og/sets/${set.id}-v${VERSION}.jpg`);
}
await browser.close();
server.close();
console.log(`${made} images`);
