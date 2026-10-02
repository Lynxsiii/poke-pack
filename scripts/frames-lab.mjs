#!/usr/bin/env node
/**
 * Contact sheet for the extra avatar frames, drawn by the real markup and CSS.
 *
 *   node scripts/frames-lab.mjs --out sheet.png [--size md|lg|xl] [--only a,b] [--group Types]
 *        [--engine chromium|webkit] [--cols 3] [--online] [--anim] [--width 390] [--scale 3]
 *
 * Needs Playwright (global install) and, for --engine webkit, its WebKit build
 * (see the poke-pack-webkit-testing note). Pokémon art for the faces is fetched
 * once from the sprite repo and kept next to the output.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? fallback : process.argv[i + 1]?.startsWith("--") || process.argv[i + 1] === undefined ? true : process.argv[i + 1];
};
const out = path.resolve(arg("out", "frames-sheet.png"));
const size = arg("size", "md");
const only = arg("only", "") ? String(arg("only")).split(",") : null;
const group = arg("group", "");
const cols = Number(arg("cols", 3));
const width = Number(arg("width", 390));
const scale = Number(arg("scale", 3));
const engine = arg("engine", "chromium");

const { FRAME_CATALOG } = await import(pathToFileURL(path.join(ROOT, "js/frame-catalog.js")).href);
const { frameHtml } = await import(pathToFileURL(path.join(ROOT, "js/level-badge.js")).href);

const dir = path.dirname(out);
const faces = [25, 133, 39, 94, 197, 151, 1, 6, 7, 175, 129, 143];
fs.mkdirSync(path.join(dir, "faces"), { recursive: true });
for (const id of faces) {
  const file = path.join(dir, "faces", `${id}.png`);
  if (!fs.existsSync(file)) execSync(`curl -sS -m 30 -o ${file} https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`);
}
const colours = ["#f0c14b", "#5ec8ff", "#ff7a7a", "#8cf0a0", "#c79bff", "#ffa94d"];

const list = FRAME_CATALOG.filter((f) => (!only || only.includes(f.id)) && (!group || f.group === group));
const size_px = { xs: 22, sm: 32, md: 56, lg: 88, xl: 104 }[size];
const tiles = list
  .map((f, i) => {
    const face = `<span class="user-face ${size}" style="--avatar:${colours[i % colours.length]};border-radius:50%;width:${size_px}px;height:${size_px}px"><img src="${pathToFileURL(path.join(dir, "faces", `${faces[i % faces.length]}.png`)).href}" alt=""></span>`;
    return `<figure><div class="art">${frameHtml(face, f.id, { size, online: process.argv.includes("--online") })}</div><figcaption>${f.name}<small>${f.id}</small></figcaption></figure>`;
  })
  .join("");
const css = ["css/theme.css", "css/app.css", "css/pages/account.css", "css/pages/frames.css", "css/pages/frames-art.css"].map((p) => `<link rel="stylesheet" href="${pathToFileURL(path.join(ROOT, p)).href}">`).join("");
const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${css}
<style>
  body { margin: 0; padding: 16px; background: #0c0b12; color: #eee; font: 13px/1.3 system-ui, sans-serif; }
  .grid { display: grid; grid-template-columns: repeat(${cols}, 1fr); gap: 10px; }
  figure { margin: 0; display: grid; justify-items: center; gap: 4px; padding: 14px 4px 10px; background: #15131d; border: 1px solid #262333; border-radius: 8px; text-align: center; }
  .art { display: grid; place-items: center; min-height: ${Math.round(size_px * 1.55)}px; }
  figcaption { font-weight: 650; } figcaption small { display: block; color: #8c88a0; font-weight: 400; font-size: 11px; }
</style>
<div class="grid">${tiles}</div>`;
const htmlFile = out.replace(/\.png$/, ".html");
fs.writeFileSync(htmlFile, html);

const require = createRequire(import.meta.url);
const globalRoot = execSync("npm root -g").toString().trim();
const pw = require(path.join(globalRoot, "playwright"));
const browser = await pw[engine].launch();
const ctx = await browser.newContext({ viewport: { width, height: 800 }, deviceScaleFactor: scale });
const page = await ctx.newPage();
await page.goto(pathToFileURL(htmlFile).href, { waitUntil: "load" });
if (!process.argv.includes("--anim")) await page.addStyleTag({ content: ".lf-fx { animation: none !important; opacity: 1 !important; }" });
await page.waitForTimeout(500);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log(`${list.length} frames -> ${out}`);
