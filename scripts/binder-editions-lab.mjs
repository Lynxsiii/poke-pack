#!/usr/bin/env node
/**
 * Lab for the animated binder editions (css/binder/editions.css, js/binder-editions.js).
 * Serves the repo statically and draws real .binder-object blocks (real
 * binderObjectHtml, real me55 cards) so every edition can be looked at on a
 * few colours, scrubbed to fixed points of its loop, and measured.
 *
 *   node scripts/binder-editions-lab.mjs --serve [--port N]      just serve; open /__lab.html
 *   node scripts/binder-editions-lab.mjs shots --out DIR [--browser chromium|webkit]
 *        [--editions aurora,tide] [--colors navy,rust] [--fracs 0,.25,.5,.75] [--pages 1] [--bare 420] [--reduced] [--sheet]
 *   node scripts/binder-editions-lab.mjs check
 *        Pass/fail checks: loops pause under fx-held, pause offscreen (watchBinderFx),
 *        idle rest through the real js/fx.js (takes ~30s), and stop under body.no-motion
 *        and prefers-reduced-motion with a non-blank still pose.
 *   node scripts/binder-editions-lab.mjs perf --out DIR [--editions ...]
 *        Chromium trace of an idle edition: counts Paint / commit / raster events
 *        per second, and reports layers and animation targets.
 *
 * /__lab.html?edition=holo&color=navy&pages=1&material=leather&motion=off&bare=420&swatches=1
 *   bare=H draws the cover alone, H px tall, with no pages over it.
 *   Without css/binder/materials.css the lab draws a plain stand-in cover so the
 *   fx layer has a box to fill; with it, the real materials are used.
 *
 * Playwright comes from the repo's node_modules, or the global install
 * (PLAYWRIGHT_MODULE overrides). For WebKit set PLAYWRIGHT_BROWSERS_PATH.
 */
import http from "node:http";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".webp": "image/webp", ".avif": "image/avif", ".png": "image/png",
  ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".woff": "font/woff",
};
const HAS_MATERIALS = existsSync(join(ROOT, "css/binder/materials.css"));
const COLORS = ["navy", "rust", "bone", "jade", "wine", "ink"];
const EDITIONS = ["aurora", "tide", "ember", "starfield", "prism", "holo"];

const STANDIN = `
.binder-object { position: relative; padding: 14px; border-radius: 14px; isolation: isolate; }
.binder-cover { position: absolute; inset: 0; z-index: -1; border-radius: inherit; overflow: hidden;
  background: var(--b-main); box-shadow: inset 0 0 0 1px rgb(255 255 255 / .1); }
.binder-spread { position: relative; display: grid; gap: 14px; }
.binder-hardware, .binder-plate { display: none; }`;

function labHtml(q) {
  const edition = q.get("edition") || "";
  const color = q.get("color") || "navy";
  const pages = Math.max(1, Math.min(6, Number(q.get("pages")) || 1));
  const material = q.get("material") || "leather";
  const motion = q.get("motion") === "off";
  const swatches = q.get("swatches") === "1";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Binder editions lab</title>
<link rel="stylesheet" href="/css/app.css"><link rel="stylesheet" href="/css/theme.css">
<link rel="stylesheet" href="/css/pages/collection.css">
${HAS_MATERIALS ? '<link rel="stylesheet" href="/css/binder/materials.css">' : `<style>${STANDIN}</style>`}
<link rel="stylesheet" href="/css/binder/editions.css">
<style>body{padding:16px var(--gutter,16px) 40px} .lab-sw{display:flex;gap:10px;flex-wrap:wrap;margin:12px 0}
.lab-sw div{font-size:11px;color:var(--muted)}</style></head>
<body class="${motion ? "no-motion" : ""}">
<main id="lab"></main>
<script type="module">
import { resolveBinderLook } from "/js/binder-looks.js";
import { binderObjectHtml } from "/js/binder-object.js";
import { watchBinderFx } from "/js/binder-editions.js";
${q.get("fx") === "1" ? 'import { initFx } from "/js/fx.js"; initFx();' : ""}
const cards = await (await fetch("/data/me55.json")).json();
const pick = cards.filter((c) => c.image).slice(0, 54);
const pocket = (c) => '<div class="pocket filled"><div class="pocket-card"><div class="tcg"><img src="/' + c.imageSmall + '" alt=""></div></div></div>';
const page = (n) => '<div class="binder-page"><div class="binder-pockets">' + pick.slice(n * 9, n * 9 + 9).map(pocket).join("") + '</div></div>';
const bare = ${Number(q.get("bare")) || 0};
const spread = bare ? '<div class="binder-spread" style="height:' + bare + 'px"></div>' : '<div class="binder-spread">' + Array.from({ length: ${pages} }, (_, n) => page(n)).join("") + '</div>';
const look = { material: ${JSON.stringify(material)}, color: ${JSON.stringify(color)}, edition: ${JSON.stringify(edition)}, hardware: "none", pockets: "clear", page: "well" };
const resolved = resolveBinderLook(look, { cards: pick });
let html = binderObjectHtml({ innerHtml: spread, resolved, id: "lab-binder" });
${swatches ? `html += '<div class="lab-sw">' + ${JSON.stringify(EDITIONS)}.map((e) => '<div><span class="edition-swatch" data-edition="' + e + '" style="' + resolved.style + '"></span><br>' + e + '</div>').join("") + '</div>';` : ""}
document.getElementById("lab").innerHTML = html;
watchBinderFx(document);
window.__ready = true;
</script></body></html>`;
}

export function serve(port = 0) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    if (url.pathname === "/__lab.html") {
      res.writeHead(200, { "content-type": MIME[".html"], "cache-control": "no-store" });
      return res.end(labHtml(url.searchParams));
    }
    const file = normalize(join(ROOT, decodeURIComponent(url.pathname)));
    if (!file.startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404);
      return res.end("not found");
    }
    res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(readFileSync(file));
  });
  return new Promise((ok) => server.listen(port, "127.0.0.1", () => ok(server)));
}

async function loadPlaywright() {
  const tries = [process.env.PLAYWRIGHT_MODULE, "playwright", "/opt/node22/lib/node_modules/playwright/index.mjs"].filter(Boolean);
  for (const t of tries) {
    try { return await import(t); } catch { /* next */ }
  }
  throw new Error("playwright not found; set PLAYWRIGHT_MODULE");
}

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? fallback : args[i + 1]?.startsWith("--") || args[i + 1] === undefined ? true : args[i + 1];
};
const list = (v, fallback) => (typeof v === "string" ? v.split(",") : fallback);

async function launch(pw, browserName, reduced) {
  const type = pw[browserName];
  const browser = await type.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    reducedMotion: reduced ? "reduce" : "no-preference",
  });
  return { browser, context };
}

// Put every running animation at a fixed point of its own cycle (alternating
// loops are scrubbed across both directions), so frames are repeatable.
const SCRUB = `(f) => { for (const a of document.getAnimations()) {
  const t = a.effect.getTiming(); const c = a.effect.getComputedTiming();
  const span = (Number(t.duration) || 0) * (t.direction === "alternate" ? 2 : 1);
  a.pause(); a.currentTime = (Number(t.delay) || 0) + f * span; } }`;

async function shots() {
  const pw = await loadPlaywright();
  const out = resolve(String(flag("out", "/tmp/binder-editions-shots")));
  mkdirSync(out, { recursive: true });
  const browserName = String(flag("browser", "chromium"));
  const reduced = flag("reduced", false) === true;
  const fracs = list(flag("fracs"), ["0", "0.25", "0.5", "0.75"]).map(Number);
  const pages = String(flag("pages", "1"));
  const bare = String(flag("bare", "0"));
  const sheet = flag("sheet", false) === true;
  const taken = {};
  const server = await serve(Number(flag("port", 0)));
  const { browser, context } = await launch(pw, browserName, reduced);
  const page = await context.newPage();
  for (const edition of list(flag("editions"), EDITIONS)) {
    for (const color of list(flag("colors"), COLORS.slice(0, 3))) {
      await page.goto(`http://127.0.0.1:${server.address().port}/__lab.html?edition=${edition}&color=${color}&pages=${pages}&bare=${bare}`);
      await page.waitForFunction("window.__ready");
      await page.waitForTimeout(400);
      const box = await page.locator("#lab-binder").boundingBox();
      for (const f of reduced ? [0] : fracs) {
        if (!reduced) await page.evaluate(`(${SCRUB})(${f})`);
        await page.waitForTimeout(120);
        const name = `${browserName}-${edition}-${color}${reduced ? "-still" : `-f${String(f).replace("0.", "")}`}.png`;
        const path = join(out, name);
        await page.screenshot({ path, clip: { x: 0, y: Math.max(0, box.y - 8), width: 390, height: Math.min(box.height + 16, 844) } });
        (taken[edition] ||= []).push({ color, path });
      }
    }
  }
  if (sheet) {
    for (const [edition, files] of Object.entries(taken)) {
      const cols = reduced ? 1 : fracs.length;
      const imgs = files.map((f) => `<img src="data:image/png;base64,${readFileSync(f.path).toString("base64")}">`).join("");
      await page.setViewportSize({ width: cols * 226, height: 600 });
      await page.setContent(`<body style="margin:0;background:#000;display:grid;grid-template-columns:repeat(${cols},220px);gap:6px">${imgs}<style>img{width:220px;display:block}</style></body>`);
      await page.waitForTimeout(200);
      await page.screenshot({ path: join(out, `sheet-${browserName}-${edition}${reduced ? "-still" : ""}.png`), fullPage: true });
    }
  }
  await browser.close();
  server.close();
  console.log("shots in", out);
}

async function perf() {
  const pw = await loadPlaywright();
  const out = resolve(String(flag("out", "/tmp/binder-editions-shots")));
  mkdirSync(out, { recursive: true });
  const server = await serve(Number(flag("port", 0)));
  const { browser, context } = await launch(pw, "chromium", false);
  const page = await context.newPage();
  const rows = [];
  // "control" is a deliberate repaint (background-position on a gradient) so the
  // counters can be seen to move when something is wrong.
  for (const edition of [...list(flag("editions"), EDITIONS), "control"]) {
    await page.goto(`http://127.0.0.1:${server.address().port}/__lab.html?edition=${edition === "control" ? "aurora" : edition}&color=navy&pages=1`);
    await page.waitForFunction("window.__ready");
    if (edition === "control") {
      await page.addStyleTag({ content: `.binder-fx > i { animation: none !important; } .binder-fx { background: repeating-linear-gradient(90deg, #fff3 0 8px, transparent 8px 16px) 0 0 / 32px 32px !important; animation: ctl 1s linear infinite !important; } @keyframes ctl { to { background-position: 32px 0; } }` });
    }
    await page.waitForTimeout(1500);
    const info = await page.evaluate(() => {
      const anims = document.getAnimations().filter((a) => a.effect?.target?.closest?.(".binder-fx") || a.effect?.target?.matches?.(".binder-fx"));
      const props = new Set();
      for (const a of anims) for (const kf of a.effect.getKeyframes()) for (const k of Object.keys(kf)) if (!["offset", "easing", "composite", "computedOffset"].includes(k)) props.add(k);
      const fx = document.querySelector(".binder-fx");
      return { running: anims.filter((a) => a.playState === "running").length, props: [...props], layers: fx.querySelectorAll(":scope > i").length };
    });
    const cdp = await context.newCDPSession(page);
    await cdp.send("Tracing.start", { traceConfig: { includedCategories: ["devtools.timeline", "toplevel", "cc", "disabled-by-default-devtools.timeline"] }, transferMode: "ReturnAsStream" });
    const done = new Promise((ok) => cdp.once("Tracing.tracingComplete", ok));
    await page.waitForTimeout(4000);
    await cdp.send("Tracing.end");
    const { stream } = await done;
    let text = "";
    for (;;) {
      const chunk = await cdp.send("IO.read", { handle: stream });
      text += chunk.data;
      if (chunk.eof) break;
    }
    const events = JSON.parse(text).traceEvents || JSON.parse(text);
    const count = (re) => events.filter((e) => re.test(e.name)).length;
    const hist = {};
    for (const e of events) hist[e.name] = (hist[e.name] || 0) + 1;
    if (flag("hist", false)) console.log(edition, Object.entries(hist).filter(([k]) => /Raster|Paint|Layer|Layout|Style|Decode/.test(k)).map(([k, v]) => `${k}:${v}`).join(" "));
    const like = (re) => Object.entries(hist).filter(([k]) => re.test(k)).reduce((n, [, v]) => n + v, 0);
    rows.push({
      edition, anims: info.running, props: info.props.join("+"), layers: info.layers,
      mainFrames: count(/^ProxyMain::BeginMainFrame$/), commits: count(/^Commit$/), draws: count(/^MainFrame\.Draw$/),
      paint: count(/^(Paint|PrePaint|Layerize|UpdateLayer)$/), styleLayout: count(/^(UpdateLayoutTree|Layout|RecalculateStyles)$/),
      raster: like(/Raster(Task|erTask)|RasterBuffer/),
    });
    await cdp.detach();
  }
  console.table(rows);
  await browser.close();
  server.close();
}

async function check() {
  const pw = await loadPlaywright();
  const out = resolve(String(flag("out", "/tmp/binder-editions-shots")));
  mkdirSync(out, { recursive: true });
  const server = await serve(Number(flag("port", 0)));
  const base = `http://127.0.0.1:${server.address().port}/__lab.html`;
  const results = [];
  const ok = (name, pass, detail = "") => { console.error(pass ? "pass" : "FAIL", name); results.push({ check: name, pass: pass ? "PASS" : "FAIL", detail }); };
  const running = `document.getAnimations().filter((a) => a.playState === "running" && a.effect?.target?.closest?.(".binder-fx")).length`;
  const { browser, context } = await launch(pw, String(flag("browser", "chromium")), false);
  const page = await context.newPage();
  for (const edition of list(flag("editions"), EDITIONS)) {
    await page.goto(`${base}?edition=${edition}&color=navy&pages=1&bare=300`);
    await page.waitForFunction("window.__ready");
    const n = await page.evaluate(running);
    await page.evaluate(() => document.querySelectorAll(".binder-fx > i").forEach((el) => el.classList.add("fx-held")));
    const held = await page.evaluate(running);
    ok(`${edition}: loops run, then fx-held pauses all`, n > 0 && held === 0, `running ${n} -> ${held}`);
  }
  // Offscreen: a tall binder, scrolled past.
  await page.goto(`${base}?edition=aurora&color=navy&pages=4`);
  await page.waitForFunction("window.__ready");
  await page.waitForTimeout(300);
  const inView = await page.evaluate(`${running}`);
  await page.evaluate(() => { document.body.style.paddingTop = "6000px"; document.getElementById("lab").style.marginTop = "0"; window.scrollTo(0, 0); });
  await page.evaluate(() => { const el = document.getElementById("lab-binder"); el.style.marginTop = "6000px"; });
  await page.waitForTimeout(1500);
  const offscreen = await page.evaluate(`${running}`);
  const cls = await page.evaluate(() => document.querySelector(".binder-fx").classList.contains("fx-paused"));
  ok("offscreen binder is paused by watchBinderFx", inView > 0 && offscreen === 0 && cls, `running in view ${inView}, offscreen ${offscreen}, fx-paused ${cls}`);
  await page.evaluate(() => document.getElementById("lab-binder").scrollIntoView({ behavior: "instant" }));
  await page.waitForTimeout(1500);
  ok("scrolled back into view, loops run again", (await page.evaluate(running)) > 0);
  // Idle rest through the real fx.js.
  await page.goto(`${base}?edition=holo&color=navy&pages=1&bare=300&fx=1`);
  await page.waitForFunction("window.__ready");
  const before = await page.evaluate(running);
  await page.waitForTimeout(Number(flag("idle", 29000)));
  const after = await page.evaluate(running);
  const heldCount = await page.evaluate(() => document.querySelectorAll(".binder-fx > i.fx-held").length);
  ok("fx.js idle rest holds the edition loops", before > 0 && after === 0 && heldCount > 0, `running ${before} -> ${after}, .fx-held on ${heldCount} layers`);
  await page.mouse.move(10, 10);
  await page.mouse.move(40, 40);
  await page.waitForTimeout(300);
  ok("input wakes them", (await page.evaluate(running)) > 0);
  await context.close();
  // body.no-motion and reduced motion.
  const modes = [["body.no-motion", false, "&motion=off"], ["prefers-reduced-motion", true, ""]];
  for (const [name, reduced, extra] of modes) {
    const L = await launch(pw, String(flag("browser", "chromium")), reduced);
    const c = L.context;
    const pg = await c.newPage();
    for (const edition of list(flag("editions"), EDITIONS)) {
      await pg.goto(`${base}?edition=${edition}&color=navy&pages=1&bare=300${extra}`);
      await pg.waitForFunction("window.__ready");
      const anims = await pg.evaluate(`document.getAnimations().filter((a) => a.effect?.target?.closest?.(".binder-fx")).length`);
      const file = join(out, `still-${name.replace(/[^a-z]/g, "")}-${edition}.png`);
      await pg.locator("#lab-binder").screenshot({ path: file });
      ok(`${name}: ${edition} has no animations`, anims === 0, `${anims} animations, still at ${file}`);
    }
    await L.browser.close();
  }
  console.table(results);
  await browser.close();
  server.close();
  if (results.some((r) => r.pass === "FAIL")) process.exitCode = 1;
}

const cmd = args[0];
if (flag("serve", false)) {
  const server = await serve(Number(flag("port", 0)));
  console.log(`lab on http://127.0.0.1:${server.address().port}/__lab.html?edition=aurora&color=navy`);
} else if (cmd === "shots") await shots();
else if (cmd === "perf") await perf();
else if (cmd === "check") await check();
else console.log("usage: binder-editions-lab.mjs --serve | shots | perf (see header)");
