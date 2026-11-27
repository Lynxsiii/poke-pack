#!/usr/bin/env node
// Renderer for holo_check.py: draws many cards of one set per page load in the foil lab, lit at a pinned pose, then
// again with every foil layer hidden (the plain print), in one browser, and writes per job
//   <out>/<tag>-on.png, <tag>-off.png, <tag>.boxes.json
//
//   node holo_check_render.mjs --jobs jobs.json --out DIR [--browser webkit] [--w 220] [--scale 3] [--poses rest,35:35]
//
// jobs.json: [{ "tag": "ex13-0", "set": "ex13", "cards": ["16", "r16", "59-pb"] }, ...]
// Jobs whose three files already exist are skipped, so a cut-off run resumes.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "../../../../..");
const LAB = "/.claude/skills/card-textures/lab/index.html";
const HIDE = ".tcg .foil, .tcg .glare, .tcg .cure, .tcg .shine, .tcg .relief { display: none !important }";
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith("--")) acc.push([a.slice(2), all[i + 1]?.startsWith("--") || all[i + 1] == null ? true : all[i + 1]]);
  return acc;
}, []));
const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp",
  ".avif": "image/avif", ".svg": "image/svg+xml", ".woff2": "font/woff2",
};

function serve() {
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let file = normalize(join(ROOT, path));
    if (!file.startsWith(ROOT)) return res.writeHead(403).end();
    try {
      if ((await stat(file)).isDirectory()) file = join(file, "index.html");
      const body = await readFile(file);
      res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(server)));
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    const g = execSync("npm root -g", { encoding: "utf8" }).trim();
    return createRequire(join(g, "noop.js"))("playwright");
  }
}

const jobs = JSON.parse(readFileSync(args.jobs, "utf8"));
const out = resolve(args.out || "holo-check");
const w = Number(args.w) || 220, scale = Number(args.scale) || 3, poses = args.poses || "rest,35:35";
const server = await serve();
const base = `http://127.0.0.1:${server.address().port}`;
const pw = await loadPlaywright();
const browser = await pw[args.browser === "chromium" ? "chromium" : "webkit"].launch();
const page = await browser.newPage({ viewport: { width: 1900, height: 900 }, deviceScaleFactor: scale });
page.on("pageerror", (e) => console.error("page error:", e.message));
let done = 0;
try {
  for (const job of jobs) {
    const p = (s) => join(out, `${job.tag}${s}`);
    if (existsSync(p("-on.png")) && existsSync(p("-off.png")) && existsSync(p(".boxes.json"))) { done++; continue; }
    const q = `set=${job.set}&cards=${job.cards.join(",")}&proof=off&w=${w}&poses=${poses}&tilt=0`;
    try {
      await page.goto(`${base}${LAB}?${q}`, { waitUntil: "load", timeout: 90000 });
      await page.waitForSelector("body[data-ready='1']", { timeout: 60000 });
      await page.waitForTimeout(Number(args.wait) || 2500); // masks are CSS images and decode late in WebKit
      const boxes = await page.evaluate(() => [...document.querySelectorAll(".lab-row")].flatMap((row) =>
        [...row.querySelectorAll(".lab-cell")].map((cell, i) => {
        const t = cell.querySelector(".tcg"), r = t.getBoundingClientRect();
        return { i, pose: row.dataset.pose, cls: t.className.replace(/\s*\blit\b/, ""), finish: t.dataset.finish || "",
          caption: cell.querySelector("figcaption").textContent.replace(/\s+/g, " ").trim(),
          x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height };
      })));
      const perRow = boxes.filter((b) => b.pose === boxes[0].pose).length;
      boxes.forEach((b) => { b.token = perRow === job.cards.length ? job.cards[b.i] : null; });
      await page.screenshot({ path: p("-on.png"), fullPage: true, timeout: 240000 });
      await page.addStyleTag({ content: HIDE });
      await page.waitForTimeout(300);
      await page.screenshot({ path: p("-off.png"), fullPage: true, timeout: 240000 });
      writeFileSync(p(".boxes.json"), JSON.stringify({ job, scale, boxes }));
      done++;
      if (done % 10 === 0) console.error(`${done}/${jobs.length}`);
    } catch (e) {
      console.error(`job ${job.tag} failed: ${e.message.split("\n")[0]}`);
    }
  }
} finally {
  await browser.close();
  server.close();
}
console.error(`rendered ${done}/${jobs.length}`);
