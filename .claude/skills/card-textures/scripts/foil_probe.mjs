#!/usr/bin/env node
// Screenshot the foil lab (or any page of the site) in headless Chromium, and
// optionally check what a resting page costs.
//
//   node .claude/skills/card-textures/scripts/foil_probe.mjs \
//     --query "cards=13,24,74&poses=rest,50:50,20:15,80:30" --out /tmp/lab.png
//
//   --query  query string for lab/index.html (see lab.js for the keys)
//   --page   a repo path to open instead of the lab, e.g. "/" or "/#/binder"
//   --out    PNG to write (default: foil-probe.png in the working directory)
//   --width  viewport width in CSS px (default 1600); --scale device pixel
//            ratio (default 1; use 2 to judge fine texture)
//   --idle   after load, sit for 3 s and report main-thread work plus every
//            running animation, flagging infinite ones and any that animate
//            something other than transform, opacity or filter
//   --css    extra CSS injected after load, to isolate a layer while tuning
//            (e.g. ".tcg .glare{display:none!important}")
//   --styles print the computed paint properties of every layer (.foil,
//            ::before, ::after, .cure if the card has one, .glare, ::after)
//            of the first two cards in the first lit row, to see which rule
//            won
//
// It serves the repo itself on a free port, so nothing else needs to run.
// Needs Playwright: a local or global `playwright` package and its Chromium.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "../../../../..");
const LAB = "/.claude/skills/card-textures/lab/index.html";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith("--")) acc.push([a.slice(2), all[i + 1]?.startsWith("--") || all[i + 1] == null ? true : all[i + 1]]);
    return acc;
  }, []),
);

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    const globalRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
    return createRequire(join(globalRoot, "noop.js"))("playwright");
  }
}

const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp",
  ".svg": "image/svg+xml", ".woff2": "font/woff2",
};

function serve() {
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let file = normalize(join(ROOT, path));
    if (!file.startsWith(ROOT)) return res.writeHead(403).end();
    try {
      if ((await stat(file)).isDirectory()) file = join(file, "index.html");
    } catch {
      // The app's routes fall back to index.html, as scripts/serve.py does;
      // a missing file with an extension is a real 404.
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
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(server)));
}

const server = await serve();
const base = `http://127.0.0.1:${server.address().port}`;
const url = args.page ? base + args.page : `${base}${LAB}?${args.query || ""}`;
const out = resolve(typeof args.out === "string" ? args.out : "foil-probe.png");

// --browser webkit renders with Safari's engine (Playwright WebKit installed
// under PLAYWRIGHT_BROWSERS_PATH, see the poke-pack-webkit-testing note):
// on 2026-09-29 the VMAX etch and the gold's exclusion twin looked fine in
// Chromium and glitched on Noah's iPhone.
const pw = await loadPlaywright();
const engine = pw[args.browser === "webkit" ? "webkit" : args.browser === "firefox" ? "firefox" : "chromium"];
const browser = await engine.launch();
try {
  const page = await browser.newPage({
    viewport: { width: Number(args.width) || 1600, height: 900 },
    deviceScaleFactor: Number(args.scale) || 1,
  });
  page.on("pageerror", (e) => console.error("page error:", e.message));
  page.on("console", (m) => m.type() === "error" && console.error("console:", m.text()));
  page.on("response", (r) => r.status() >= 400 && console.error(`http ${r.status()}: ${r.url()}`));
  // The app keeps requests open (prices, the worker API), so a page waits for
  // "load" and a moment more; the lab waits until every card has decoded.
  await page.goto(url, { waitUntil: args.page ? "load" : "networkidle", timeout: 60000 });
  if (args.page) await page.waitForTimeout(1500);
  if (!args.page) await page.waitForSelector("body[data-ready='1']", { timeout: 30000 });
  if (typeof args.css === "string") await page.addStyleTag({ content: args.css });
  await page.waitForTimeout(400); // let any settle transition finish
  await page.screenshot({ path: out, fullPage: true });
  console.log(`wrote ${out}`);

  if (args.boxes) {
    // One line of JSON per lab cell: where its card sits in the screenshot
    // (CSS px, page coordinates), which pose row it is in and its caption, so
    // a script can cut the sheet up and judge each card on its own
    // (scripts/dark_specks.py does).
    const boxes = await page.evaluate(() => [...document.querySelectorAll(".lab-row")].flatMap((row) =>
      [...row.querySelectorAll(".lab-cell")].map((cell) => {
        const r = cell.querySelector(".tcg").getBoundingClientRect();
        return {
          pose: row.dataset.pose, cell: cell.className.replace("lab-cell", "").trim(),
          card: cell.querySelector(".tcg").className, finish: cell.querySelector(".tcg").dataset.finish || "",
          caption: cell.querySelector("figcaption").textContent.replace(/\s+/g, " ").trim(),
          x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height,
        };
      })));
    const boxesOut = out.replace(/\.png$/, "") + ".boxes.json";
    const { writeFileSync } = await import("node:fs");
    writeFileSync(boxesOut, JSON.stringify(boxes));
    console.log(`wrote ${boxesOut} (${boxes.length} cells)`);
  }

  if (args.styles) {
    const layers = await page.evaluate(() => {
      const keys = ["display", "opacity", "mix-blend-mode", "filter", "background-blend-mode", "background-size",
        "background-position", "mask-image", "mask-composite", "clip-path", "isolation"];
      // The first lit row: at rest the pseudo layers, .cure and .glare do not exist.
      const row = document.querySelector(".lab-row:not([data-pose='rest'])") || document.querySelector(".lab-row");
      const cells = [...row.querySelectorAll(".lab-cell")].slice(0, 2);
      return cells.map((cell) => {
        const card = cell.querySelector(".tcg");
        const rows = [];
        for (const [sel, pseudo] of [[".foil", null], [".foil", "::before"], [".foil", "::after"], [".cure", null], [".glare", null], [".glare", "::after"]]) {
          if (!card.querySelector(sel)) continue;
          const cs = getComputedStyle(card.querySelector(sel), pseudo);
          rows.push([sel + (pseudo || ""), Object.fromEntries(keys.map((k) => [k, cs.getPropertyValue(k).slice(0, 140)]))]);
        }
        return { cell: cell.className, card: card.className, rows };
      });
    });
    for (const c of layers) {
      console.log(`\n${c.cell}  [${c.card}]`);
      for (const [name, props] of c.rows) {
        console.log(`  ${name}`);
        for (const [k, v] of Object.entries(props)) if (v && v !== "none" && v !== "normal" && v !== "auto") console.log(`    ${k}: ${v}`);
      }
    }
  }

  if (args.idle) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Performance.enable");
    const read = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
    const before = await read();
    await page.waitForTimeout(3000);
    const after = await read();
    const ms = (k) => ((after[k] - before[k]) * 1000).toFixed(0);
    console.log(`idle 3 s: task ${ms("TaskDuration")} ms, style ${ms("RecalcStyleDuration")} ms, layout ${ms("LayoutDuration")} ms`);
    const anims = await page.evaluate(() => document.getAnimations().map((a) => {
      const t = a.effect?.getTiming?.() || {};
      const frames = a.effect?.getKeyframes?.() || [];
      const props = [...new Set(frames.flatMap((f) => Object.keys(f)))]
        .filter((k) => !["offset", "computedOffset", "easing", "composite"].includes(k));
      const el = a.effect?.target;
      return {
        name: a.animationName || a.transitionProperty || a.constructor.name,
        target: el ? [el.tagName.toLowerCase(), ...el.classList].join(".") : "?",
        infinite: t.iterations === Infinity, props, state: a.playState,
      };
    }));
    const cheap = new Set(["transform", "opacity", "filter", "translate", "rotate", "scale"]);
    const lines = new Map();
    for (const a of anims.filter((x) => x.state === "running")) {
      const costly = a.props.filter((p) => !cheap.has(p));
      const flag = a.infinite && costly.length ? "  <- infinite and not compositor-only" : a.infinite ? "  (infinite)" : "";
      const line = `anim ${a.name} on ${a.target}: ${a.props.join(", ") || "?"}${flag}`;
      lines.set(line, (lines.get(line) || 0) + 1);
    }
    for (const [line, n] of lines) console.log(n > 1 ? `${line}  x${n}` : line);
    if (!lines.size) console.log("no running animations");
  }
} finally {
  await browser.close();
  server.close();
}
