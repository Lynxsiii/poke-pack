#!/usr/bin/env node
/**
 * Screenshot McDonald's (or any) cards exactly as the app draws them, from several sets on one sheet.
 *
 * A copy of scripts/site_cards.mjs for the mcd-promos holo family (older-era holo remaster, 2026-10-01), with:
 *   - ids from any set: the set of each id is its prefix (mcd14-5 -> /packs/mcd14); each set's page is opened in turn,
 *     the faces are built by the app's own inspector (tcgFace(), foilLook() included), then laid out on one page;
 *   - --fam off: opens the pages with ?fam=off, so js/holo-fam.js skips every family (the BEFORE picture);
 *   - --boxes: writes <out>.json with each face's rectangle (CSS px) per pose row, for cropping and per-zone measures;
 *   - --bare: hides .foil, .cure and .glare (the print alone, for foil-minus-bare measures).
 *
 *   node .claude/skills/card-textures/scripts/fam/mcd-promos/mcd_cards.mjs --ids mcd11-6,mcd14-5 \
 *     --poses rest,30:25,75:65,50:78 --w 220 --scale 3 --browser webkit --out /tmp/x.png [--fam off] [--boxes]
 *
 * Wrap every run in /home/user/holo-tools/render-slot.sh (shared box). Draws nothing into the repo.
 */
import { createServer } from "node:http";
import { readFile, stat, writeFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "../../../../../../..");
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith("--")) acc.push([a.slice(2), all[i + 1]?.startsWith("--") || all[i + 1] == null ? true : all[i + 1]]);
    return acc;
  }, []),
);
if (typeof args.ids !== "string") {
  console.error("usage: mcd_cards.mjs --ids <id,id,...> [--poses ...] [--w 220] [--scale 3] [--browser webkit] [--fam off] [--bare] [--boxes] [--out file.png]");
  process.exit(2);
}
const ids = args.ids.split(",");
const poses = (typeof args.poses === "string" ? args.poses : "rest,30:25,75:65,50:78").split(",");
const width = Number(args.w) || 220;
const out = resolve(typeof args.out === "string" ? args.out : "mcd-cards.png");
const famOff = args.fam === "off";

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
const port = server.address().port;
try {
  const page = await browser.newPage({
    viewport: { width: Number(args.vw) || 1600, height: 900 },
    deviceScaleFactor: Number(args.scale) || 1,
  });
  page.on("pageerror", (e) => console.error("page error:", e.message));
  const sets = [...new Set(ids.map((id) => id.split("-")[0]))];
  const faces = [];
  for (const set of sets) {
    await page.goto(`http://127.0.0.1:${port}/packs/${set}${famOff ? "?fam=off" : ""}`, { waitUntil: "load" });
    await page.waitForTimeout(2500);
    const got = await page.evaluate(async (want) => {
      const found = [];
      for (const id of want) {
        const button = document.createElement("button");
        button.dataset.inspect = id;
        document.getElementById("spread").appendChild(button);
        button.click();
        await new Promise((r) => setTimeout(r, 50));
        const art = document.getElementById("inspect-art").innerHTML;
        found.push({ id, html: art, line: document.querySelector("#inspect-info .kicker")?.textContent || "" });
        button.remove();
      }
      return found;
    }, ids.filter((id) => id.split("-")[0] === set));
    faces.push(...got);
  }
  faces.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
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
        `<figure style="margin:0;width:${width}px;flex:none" data-id="${f.id}">${f.html}<figcaption style="margin-top:6px">${f.id} ${p}</figcaption></figure>`).join("");
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
  if (args.bare) await page.addStyleTag({ content: ".tcg .foil,.tcg .cure,.tcg .glare{display:none!important}" });
  if (typeof args.css === "string") await page.addStyleTag({ content: args.css });
  await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))));
  await page.waitForTimeout(800);
  await page.screenshot({ path: out, fullPage: true, timeout: 240000 });
  if (args.boxes) {
    const boxes = await page.evaluate(() => [...document.querySelectorAll("section[data-pose]")].map((row) => ({
      pose: row.dataset.pose,
      cards: [...row.querySelectorAll("figure[data-id]")].map((f) => {
        // The untransformed rectangle: the figure's box (the .tcg may be scaled while lit).
        const r = f.getBoundingClientRect();
        const t = f.querySelector(".tcg")?.getBoundingClientRect();
        return { id: f.dataset.id, x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: t ? t.height / (t.width / r.width) : r.width * 1.395, tcg: t ? { x: t.left + scrollX, y: t.top + scrollY, w: t.width, h: t.height } : null };
      }),
    })));
    await writeFile(out.replace(/\.png$/, "") + ".json", JSON.stringify(boxes, null, 1));
  }
  for (const f of faces) {
    const cls = f.html.match(/class="(tcg[^"]*)"/)?.[1] || "(no card: is the id loaded on this set's page?)";
    console.log(`${f.id.padEnd(12)} ${cls.replace(/\s+/g, " ")}`);
  }
  console.log(`wrote ${out}`);
} finally {
  await browser.close();
  server.close();
}
