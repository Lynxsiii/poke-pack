/**
 * Draw each set's link-preview image: assets/og/sets/<set>-v1.jpg, 1200x630.
 *
 * worker/seo.js puts it in the head of /packs/<set>, so a set link pasted
 * into Discord, iMessage or X shows that set (its logo, a wrapper and its
 * chase cards on a red band) instead of the home page's card. The Worker
 * falls back to assets/og.jpg for a set that has no image yet, so a new set
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
 * Built with the site's own parts: Sofia Sans from assets/fonts, the set logo
 * and wrapper art from assets/, the card scans the set lists as its heroes.
 * Needs Playwright (installed globally in the sandbox).
 */
import { createServer } from "node:http";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { extname, join, resolve } from "node:path";
import { PLAYABLE_SETS, setIdentity } from "../js/catalog.js";

const VERSION = 1;
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
@font-face { font-family: "Sofia Sans"; src: url(/assets/fonts/sofia-sans-latin.woff2) format("woff2"); font-weight: 1 1000; }
@font-face { font-family: "Sofia Sans Semi Condensed"; src: url(/assets/fonts/sofia-sans-semi-condensed-latin.woff2) format("woff2"); font-weight: 1 1000; }
@font-face { font-family: "Sofia Sans Extra Condensed"; src: url(/assets/fonts/sofia-sans-extra-condensed-latin.woff2) format("woff2"); font-weight: 1 1000; }
* { box-sizing: border-box; margin: 0; }
html, body { width: 1200px; height: 630px; overflow: hidden; background: #0b0b0c; }
body { position: relative; font-family: "Sofia Sans", sans-serif; color: #f3f1ec; }
.left { position: absolute; left: 64px; top: 56px; bottom: 56px; width: 470px; display: flex; flex-direction: column; }
.brand { display: flex; align-items: center; gap: 12px; font: 700 26px/1 "Sofia Sans Semi Condensed", sans-serif; letter-spacing: 0.02em; }
.brand img { width: 44px; height: 44px; border-radius: 3px; }
.logo { margin-top: auto; max-width: 440px; max-height: 190px; object-fit: contain; object-position: left center; align-self: flex-start; }
.kicker { margin-top: 26px; font: 800 44px/0.9 "Sofia Sans Extra Condensed", sans-serif; text-transform: uppercase; letter-spacing: 0.005em; }
.meta { margin-top: 12px; font: 500 23px/1.3 "Sofia Sans", sans-serif; color: #a3a3ab; }
.url { margin-top: auto; padding-top: 22px; font: 700 24px/1 "Sofia Sans Semi Condensed", sans-serif; letter-spacing: 0.03em; color: #c9c7c2; }
.band { position: absolute; left: 560px; right: 0; top: 248px; height: 150px; background: #e3132b; }
.stage { position: absolute; left: 580px; top: 0; width: 600px; height: 630px; }
.card { position: absolute; top: 120px; height: 380px; border-radius: 14px; transform-origin: 50% 90%; }
.pack { position: absolute; left: 50%; top: 50%; height: 560px; transform: translate(-50%, -50%); z-index: 5; filter: drop-shadow(0 18px 24px rgba(0,0,0,.55)); }
</style></head><body>
<div class="band"></div>
<div class="stage">${cards}${wrapperArt ? `<img class="pack" src="/${esc(wrapperArt)}" />` : ""}</div>
<div class="left">
  <div class="brand"><img src="/assets/mark.png" />poke-pack.rip</div>
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
