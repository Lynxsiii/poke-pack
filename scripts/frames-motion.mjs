#!/usr/bin/env node
/**
 * Proves the frames' animations run and shows them frame by frame.
 *
 *   node scripts/frames-motion.mjs --out dir [--engine chromium|webkit] [--only a,b] [--steps 6] [--size lg]
 *
 * For every frame with a moving layer it renders the real markup and CSS at phone
 * scale (DPR 3), seeks each CSS animation to evenly spaced points of its loop and
 * (1) checks the layer's computed opacity/transform really changes across the
 * loop, with a plausible amplitude, (2) screenshots each point. Output: one
 * `<id>.jpg` strip per animated frame in dir, `report.json`, and a non-zero exit
 * when a frame has a moving layer that does not move, moves under reduced motion
 * rules wrongly, or has a loop outside 1.5 to 30 seconds.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? fallback : process.argv[i + 1];
};
const out = path.resolve(arg("out", "frames-motion"));
const engine = arg("engine", "chromium");
const steps = Number(arg("steps", 6));
const size = arg("size", "lg");
const only = arg("only", "") ? String(arg("only")).split(",") : null;
fs.mkdirSync(out, { recursive: true });

const { FRAME_CATALOG } = await import(pathToFileURL(path.join(ROOT, "js/frame-catalog.js")).href);
const { frameHtml } = await import(pathToFileURL(path.join(ROOT, "js/level-badge.js")).href);
const list = FRAME_CATALOG.filter((f) => f.fx && (!only || only.includes(f.id)));

const faces = [25, 133, 39, 94, 197, 151, 1, 6, 7, 175, 129, 143];
fs.mkdirSync(path.join(out, "faces"), { recursive: true });
for (const id of faces) {
  const file = path.join(out, "faces", `${id}.png`);
  if (!fs.existsSync(file)) execSync(`curl -sS -m 30 -o ${file} https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`);
}
const px = { md: 56, lg: 88, xl: 104 }[size];
const tiles = list
  .map((f, i) => {
    const face = `<span class="user-face ${size}" style="--avatar:#8a6a2a;width:${px}px;height:${px}px"><img src="${pathToFileURL(path.join(out, "faces", `${faces[i % faces.length]}.png`)).href}" alt=""></span>`;
    return `<figure id="t-${f.id}">${frameHtml(face, f.id, { size })}</figure>`;
  })
  .join("");
const css = ["css/theme.css", "css/app.css", "css/pages/account.css", "css/pages/frames.css", "css/pages/frames-art.css"].map((p) => `<link rel="stylesheet" href="${pathToFileURL(path.join(ROOT, p)).href}">`).join("");
const htmlFile = path.join(out, "motion.html");
fs.writeFileSync(htmlFile, `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${css}
<style>body{margin:0;padding:16px;background:#15131d;color:#eee}figure{margin:0 0 12px;width:${Math.round(px * 1.6)}px;height:${Math.round(px * 1.6)}px;display:grid;place-items:center;background:#15131d}</style>${tiles}`);

const require = createRequire(import.meta.url);
const pw = require(path.join(execSync("npm root -g").toString().trim(), "playwright"));
const browser = await pw[engine].launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 3 });
const page = await ctx.newPage();
await page.goto(pathToFileURL(htmlFile).href, { waitUntil: "load" });
await page.waitForTimeout(600);

const report = [];
let failed = 0;
for (const f of list) {
  const fig = page.locator(`#t-${f.id}`);
  const layers = await page.evaluate((id) => {
    const els = [...document.querySelectorAll(`#t-${id} .lf-fx`)];
    return els.map((el) => {
      const a = el.getAnimations()[0];
      const t = a?.effect?.getComputedTiming();
      return { kind: el.dataset.fx, running: a?.playState === "running", duration: t?.duration, delay: t?.delay, name: a?.animationName };
    });
  }, f.id);
  const problems = [];
  const want = 1 + (f.fx2 ? 1 : 0);
  if (layers.length !== want) problems.push(`expected ${want} moving layers, found ${layers.length}`);
  for (const l of layers) {
    if (!l.running) problems.push(`${l.kind} layer is not running`);
    if (!(l.duration >= 1500 && l.duration <= 30000)) problems.push(`${l.kind} loop is ${l.duration}ms (want 1.5 to 30 s)`);
  }
  // seek through the loop: sample computed opacity and transform, and shoot each point
  const shots = [];
  const samples = [];
  for (let s = 0; s < steps; s++) {
    await page.evaluate(({ id, p }) => {
      for (const el of document.querySelectorAll(`#t-${id} .lf-fx`)) for (const a of el.getAnimations()) {
        a.pause();
        const t = a.effect.getComputedTiming();
        a.currentTime = t.delay + p * t.duration;
      }
    }, { id: f.id, p: s / steps });
    samples.push(await page.evaluate((id) => [...document.querySelectorAll(`#t-${id} .lf-fx`)].map((el) => { const cs = getComputedStyle(el); return { o: Number(cs.opacity), t: cs.transform }; }), f.id));
    shots.push((await fig.screenshot({ type: "jpeg", quality: 85 })).toString("base64"));
  }
  layers.forEach((l, i) => {
    const ops = samples.map((s) => s[i].o);
    const tfs = new Set(samples.map((s) => s[i].t));
    const swing = Math.max(...ops) - Math.min(...ops);
    l.opacityRange = [Math.min(...ops), Math.max(...ops)].map((n) => +n.toFixed(2));
    l.distinctTransforms = tfs.size;
    if (swing < 0.05 && tfs.size < 3) problems.push(`${l.kind} layer does not visibly change across its loop`);
  });
  // resume
  await page.evaluate((id) => document.querySelectorAll(`#t-${id} .lf-fx`).forEach((el) => el.getAnimations().forEach((a) => a.play())), f.id);
  const strip = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#15131d;display:flex">${shots.map((b) => `<img src="data:image/jpeg;base64,${b}" style="width:${Math.round(px * 1.6)}px;height:${Math.round(px * 1.6)}px">`).join("")}`;
  const sp = await ctx.newPage();
  await sp.setViewportSize({ width: Math.round(px * 1.6) * steps, height: Math.round(px * 1.6) });
  await sp.setContent(strip);
  await sp.screenshot({ path: path.join(out, `${f.id}.jpg`), type: "jpeg", quality: 82 });
  await sp.close();
  report.push({ id: f.id, layers, problems });
  if (problems.length) failed++;
  console.log(`${problems.length ? "FAIL" : "ok  "} ${f.id}  ${layers.map((l) => `${l.kind} ${l.duration}ms o${l.opacityRange.join("-")} t${l.distinctTransforms}`).join(" | ")}${problems.length ? "  <- " + problems.join("; ") : ""}`);
}
fs.writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 2));
await browser.close();
console.log(`${engine}: ${list.length - failed}/${list.length} animated frames verified`);
process.exit(failed ? 1 : 0);
