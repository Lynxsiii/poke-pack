#!/usr/bin/env node
// Holo family wotc-promos: screenshot cards exactly as the app draws them (a copy of scripts/site_cards.mjs with the
// options the family's before/after sheets need). It opens the real app at /packs/<set>, has the inspector build each
// card (tcgFace() in js/app.js, so foilLook() and the reverse finishes run), lays the faces out one row per pose and
// pins the pointer variables the way lab.js's pose() does.
//
//   node .claude/skills/card-textures/scripts/fam/wotc-promos/site_cards_fam.mjs --set basep \
//     --ids basep-basep09,basep-basep34 --poses rest,30:25,75:65,50:78 --w 220 --scale 3 --out /tmp/x.png \
//     [--query fam=off] [--boxes /tmp/x.json] [--bare] [--css "..."] [--browser webkit] [--rev ids]
//
// Added over site_cards.mjs:
//   --query  appended to the page URL (`fam=off` skips every holo family: the BEFORE picture)
//   --boxes  writes every card's rectangle (pose, id, x, y, w, h in CSS px) as JSON, for cropping at native pixels
//   --bare   hides .foil, .cure and .glare with opacity 0 (not display:none, which pulls the card out of its blend group
//            and resamples the print): the bare print, for foil-minus-bare measurements
//   --hold   keeps the pinned row's cards `.lit` with --card-opacity 1 (default; as site_cards.mjs)
// Writes only the PNG and JSON named on the command line.
import { createServer } from "node:http";
import { readFile, stat, writeFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = process.env.ROOT || resolve(fileURLToPath(import.meta.url), "../../../../../../..");
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith("--")) acc.push([a.slice(2), all[i + 1]?.startsWith("--") || all[i + 1] == null ? true : all[i + 1]]);
    return acc;
  }, []),
);
if (typeof args.ids !== "string" || typeof args.set !== "string") {
  console.error("usage: site_cards_fam.mjs --set <set> --ids <id,id,...> [--rev ids] [--poses ...] [--out file.png] [--query q] [--boxes f.json] [--bare]");
  process.exit(2);
}
const ids = args.ids.split(",");
const rev = typeof args.rev === "string" ? args.rev.split(",") : [];
const poses = (typeof args.poses === "string" ? args.poses : "rest,30:25,75:65,50:78").split(",");
const width = Number(args.w) || 220;
const out = resolve(typeof args.out === "string" ? args.out : "site-cards.png");
const query = typeof args.query === "string" ? `?${args.query}` : "";

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
const pw = await loadPlaywright();
const browser = await pw[args.browser === "webkit" ? "webkit" : "chromium"].launch();
try {
  const page = await browser.newPage({
    viewport: { width: Number(args.vw) || Math.max(900, (width + 18) * ids.length + 60), height: 900 },
    deviceScaleFactor: Number(args.scale) || 1,
  });
  page.on("pageerror", (e) => console.error("page error:", e.message));
  page.on("console", (m) => { if (m.type() === "warning" || m.type() === "error") console.error("console:", m.text()); });
  await page.goto(`http://127.0.0.1:${server.address().port}/packs/${args.set}${query}`, { waitUntil: "load" });
  await page.waitForTimeout(2500);
  const faces = await page.evaluate(async ({ ids, rev }) => {
    const found = [];
    for (const id of ids) {
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
    const bodyClass = document.body.className;
    document.body.innerHTML = "";
    document.body.className = bodyClass;
    document.documentElement.style.cssText = "height:auto;overflow:visible";
    document.body.style.cssText =
      "height:auto;overflow:visible;min-height:0;background:#0e0f11;padding:20px;color:#9d9fa6;font:11px monospace";
    for (const p of poses) {
      const row = document.createElement("section");
      row.dataset.pose = p;
      row.style.cssText = "display:flex;gap:18px;flex-wrap:nowrap;margin-bottom:26px";
      row.innerHTML = faces.map((f) =>
        `<figure data-id="${f.id}" style="margin:0;width:${width}px;flex:none">${f.html}</figure>`).join("");
      document.body.appendChild(row);
      if (p === "rest") continue;
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
  if (args.bare) await page.addStyleTag({ content: ".tcg .foil, .tcg .cure, .tcg .glare { opacity: 0 !important; }" });
  if (typeof args.css === "string") await page.addStyleTag({ content: args.css });
  await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))));
  await page.waitForTimeout(800);
  await page.screenshot({ path: out, fullPage: true, timeout: 240000 });
  if (typeof args.boxes === "string") {
    const boxes = await page.evaluate(() => [...document.querySelectorAll("section[data-pose] figure")].map((f) => {
      const r = f.querySelector(".tcg").getBoundingClientRect();
      return { pose: f.parentElement.dataset.pose, id: f.dataset.id, x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height };
    }));
    await writeFile(resolve(args.boxes), JSON.stringify({ scale: Number(args.scale) || 1, boxes }, null, 1));
  }
  for (const f of faces) {
    const cls = f.html.match(/class="(tcg[^"]*)"/)?.[1] || "(no card: is the id loaded on this set's page?)";
    console.log(`${f.id.padEnd(22)} ${cls.replace(/\s+/g, " ")}`);
  }
  console.log(`wrote ${out}`);
} finally {
  await browser.close();
  server.close();
}
