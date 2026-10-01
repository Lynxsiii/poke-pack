#!/usr/bin/env node
// Screenshot cards exactly as the app draws them, in a grid of pinned poses.
//
// The lab (lab/lab.js) keeps its own copy of the class logic and skips
// foilLook(), so promos, retailer prints, reverse kinds and Energies with a
// `foilAs` render wrong there. This opens the real app instead, has its
// inspector build each card (tcgFace() in js/app.js), then lays the faces out
// one row per pose and pins the pointer variables the way lab.js's pose() does.
//
//   node .claude/skills/card-textures/scripts/site_cards.mjs --set sv3pt5 \
//     --ids sv3pt5-25-costco,sv3pt5-94-cosmos,sv3pt5-25 --rev sv3pt5-25 \
//     --poses rest,30:25,65:70 --out /tmp/cards.png
//
//   --set    the set whose /packs/<set> page to open (its cards must be loaded)
//   --ids    card ids to draw, in order
//   --rev    ids to draw as a pulled reverse holo
//   --poses  rows: "rest" or x:y in 0-100 (default rest,30:25,50:50,75:70)
//   --w      card width in px (default 260); --vw viewport width (default 1600)
//   --scale  device pixel ratio (default 1)
//   --css    extra CSS injected after layout, to isolate a layer
//   --browser webkit to render with Safari's engine (default chromium)
//
// Prints each card's class list, so you can see which recipe won. It serves
// the repo itself on a free port (the app's routes fall back to index.html).
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "../../../../..");
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith("--")) acc.push([a.slice(2), all[i + 1]?.startsWith("--") || all[i + 1] == null ? true : all[i + 1]]);
    return acc;
  }, []),
);
if (typeof args.ids !== "string" || typeof args.set !== "string") {
  console.error("usage: site_cards.mjs --set <set> --ids <id,id,...> [--rev ids] [--poses ...] [--out file.png]");
  process.exit(2);
}
const ids = args.ids.split(",");
const rev = typeof args.rev === "string" ? args.rev.split(",") : [];
const poses = (typeof args.poses === "string" ? args.poses : "rest,30:25,50:50,75:70").split(",");
const width = Number(args.w) || 260;
const out = resolve(typeof args.out === "string" ? args.out : "site-cards.png");

const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp",
  ".avif": "image/avif", ".svg": "image/svg+xml", ".woff2": "font/woff2",
};
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let file = normalize(join(ROOT, path));
  if (!file.startsWith(ROOT)) return res.writeHead(403).end();
  try {
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
  } catch {
    if (extname(path)) return res.writeHead(404).end();
    file = join(ROOT, "index.html");
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    const globalRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
    return createRequire(join(globalRoot, "noop.js"))("playwright");
  }
}
// --browser webkit renders with Safari's engine (see foil_probe.mjs).
const pw = await loadPlaywright();
const browser = await pw[args.browser === "webkit" ? "webkit" : "chromium"].launch();
try {
  const page = await browser.newPage({
    viewport: { width: Number(args.vw) || 1600, height: 900 },
    deviceScaleFactor: Number(args.scale) || 1,
  });
  page.on("pageerror", (e) => console.error("page error:", e.message));
  // "load", not "networkidle": the live price refresh keeps the network busy.
  await page.goto(`http://127.0.0.1:${server.address().port}/packs/${args.set}`, { waitUntil: "load" });
  await page.waitForTimeout(2500);
  const faces = await page.evaluate(async ({ ids, rev }) => {
    const found = [];
    for (const id of ids) {
      // The app opens its inspector from any [data-inspect] click in #spread.
      const button = document.createElement("button");
      button.dataset.inspect = id;
      if (rev.includes(id)) button.dataset.reverse = "1";
      document.getElementById("spread").appendChild(button);
      button.click();
      await new Promise((r) => setTimeout(r, 50));
      const art = document.getElementById("inspect-art").innerHTML;
      found.push({ id, html: art, line: document.querySelector("#inspect-info .kicker")?.textContent || "missing" });
      button.remove();
    }
    return found;
  }, { ids, rev });
  await page.evaluate(({ faces, poses, width }) => {
    const bodyClass = document.body.className; // keeps fx-holo and the settings
    document.body.innerHTML = "";
    document.body.className = bodyClass;
    document.documentElement.style.cssText = "height:auto;overflow:visible";
    document.body.style.cssText =
      "height:auto;overflow:visible;min-height:0;background:#0e0f11;padding:20px;color:#9d9fa6;font:11px monospace";
    for (const p of poses) {
      const row = document.createElement("section");
      row.style.cssText = "display:flex;gap:18px;flex-wrap:wrap;margin-bottom:26px";
      row.innerHTML = `<h2 style="width:100%;margin:0;font-size:11px">pose ${p}</h2>` + faces.map((f) =>
        `<figure style="margin:0;width:${width}px">${f.html}<figcaption style="margin-top:8px">${f.id}<br>${f.line}</figcaption></figure>`).join("");
      document.body.appendChild(row);
      if (p === "rest") continue;
      // Same variables as lab.js's pose().
      const [x, y] = p.split(":").map(Number);
      const px = x / 100, py = y / 100, radius = Math.min(1, Math.hypot(px - 0.5, py - 0.5) * 2);
      const rx = (0.5 - px) * 28, ry = (py - 0.5) * 28;
      const set = {
        "--pointer-x": `${x}%`, "--pointer-y": `${y}%`, "--pointer-from-left": px, "--pointer-from-top": py,
        "--pointer-from-center": radius, "--card-opacity": 1, "--card-scale": 1.05,
        "--rotate-x": `${rx}deg`, "--rotate-y": `${ry}deg`,
        "--background-x": `${37 + px * 26}%`, "--background-y": `${33 + py * 34}%`,
        "--mx": `${x}%`, "--my": `${y}%`, "--px": px, "--py": py, "--hyp": radius,
        "--tilt-x": `${ry}deg`, "--tilt-y": `${rx}deg`,
      };
      for (const el of row.querySelectorAll(".tcg")) {
        for (const [k, v] of Object.entries(set)) el.style.setProperty(k, String(v));
        el.classList.add("lit");
      }
    }
  }, { faces, poses, width });
  if (typeof args.css === "string") await page.addStyleTag({ content: args.css });
  await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))));
  await page.waitForTimeout(600);
  await page.screenshot({ path: out, fullPage: true, timeout: 240000 });
  for (const f of faces) {
    const cls = f.html.match(/class="(tcg[^"]*)"/)?.[1] || "(no card: is the id loaded on this set's page?)";
    console.log(`${f.id.padEnd(22)} ${cls.replace(/\s+/g, " ")}`);
  }
  console.log(`wrote ${out}`);
} finally {
  await browser.close();
  server.close();
}
