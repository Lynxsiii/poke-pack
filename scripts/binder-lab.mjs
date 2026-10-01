/**
 * Binder lab: renders the binder object (css/binder/*.css, js/binder-looks.js,
 * js/binder-object.js) on its own, with the site's real stylesheets and real card
 * art, so a material can be judged without the app, an account or a Worker.
 *
 *   node scripts/binder-lab.mjs --sheet materials                    contact sheet, both engines
 *   node scripts/binder-lab.mjs --sheet colors --material suede      24 colours + "cards"
 *   node scripts/binder-lab.mjs --case '{"material":"carbon","color":"ink","hardware":"zip","name":"Noah"}'
 *   node scripts/binder-lab.mjs --sheet wide --engine chromium --scale 1
 *   node scripts/binder-lab.mjs --list                               sheet names
 *
 * Options: --engine chromium|webkit|both (default both)  --scale N (sheet device
 * scale, default 2; --case always renders at iPhone 13, 390x844 @3x unless
 * --width is given)  --width N  --leaves 1|2  --clip x,y,w,h (CSS px, to look at native pixels)  --out DIR (default ./binder-lab-out)
 *
 * Playwright comes from the global install (or NODE_PATH). WebKit needs its own
 * browser dir: set PLAYWRIGHT_BROWSERS_PATH to a folder where
 * `npx playwright install webkit` was run; Chromium is looked up in
 * PLAYWRIGHT_BROWSERS_PATH too, so with two dirs run the engines one at a time.
 */
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith("--")) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : "1"]);
    return acc;
  }, [])
);

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".webp": "image/webp", ".avif": "image/avif",
  ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".ico": "image/x-icon",
};

function serve() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://x");
      const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
      const file = join(ROOT, rel || "index.html");
      if (!file.startsWith(ROOT)) throw new Error("outside root");
      const body = await readFile(file);
      res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
      res.end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(server)));
}

const require = createRequire(import.meta.url);
function loadPlaywright() {
  for (const base of [undefined, process.env.NODE_PATH, "/opt/node22/lib/node_modules/"]) {
    try {
      return base ? createRequire(base.endsWith("/") ? base : `${base}/`)("playwright") : require("playwright");
    } catch {}
  }
  throw new Error("playwright not found (install it or set NODE_PATH)");
}

async function main() {
  if (args.list) {
    const html = await readFile(join(ROOT, "scripts/binder-lab.html"), "utf8");
    console.log([...html.matchAll(/^\s{2}"?([\w-]+)"?: \{ width/gm)].map((m) => m[1]).join("\n"));
    return;
  }
  if (!args.sheet && !args.case) throw new Error("give --sheet NAME or --case JSON (see --list)");
  const pw = loadPlaywright();
  const server = await serve();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const out = resolve(args.out || "binder-lab-out");
  await mkdir(out, { recursive: true });
  const engines = args.engine && args.engine !== "both" ? [args.engine] : ["chromium", "webkit"];
  const written = [];
  for (const engine of engines) {
    let browser;
    try {
      browser = await pw[engine].launch();
    } catch (error) {
      console.warn(`${engine}: could not launch (${String(error.message).split("\n")[0]})`);
      continue;
    }
    const query = new URLSearchParams();
    let context;
    let name;
    if (args.sheet) {
      query.set("sheet", args.sheet);
      if (args.material) query.set("material", args.material);
      context = await browser.newContext({ viewport: { width: 1700, height: 900 }, deviceScaleFactor: Number(args.scale || 2), colorScheme: "dark" });
      name = `${args.sheet}${args.material ? `-${args.material}` : ""}-${engine}.png`;
    } else {
      query.set("case", args.case);
      if (args.leaves) query.set("leaves", args.leaves);
      const base = args.width ? { viewport: { width: Number(args.width), height: 900 }, deviceScaleFactor: Number(args.scale || 3) } : pw.devices["iPhone 13"];
      context = await browser.newContext({ ...base, colorScheme: "dark" });
      const look = JSON.parse(args.case);
      name = args.name ? `${args.name}-${engine}.png` : `case-${look.material || "classic"}-${look.color || "ink"}-${engine}${args.width ? `-${args.width}` : ""}.png`;
    }
    const page = await context.newPage();
    // --block materials.css,textures.css  renders without those sheets (to compare against the bare page)
    for (const name of (args.block || "").split(",").filter(Boolean)) await page.route(`**/${name}`, (route) => route.abort());
    page.on("pageerror", (e) => console.log(`[${engine}] pageerror`, e.message));
    page.on("console", (m) => ["error", "warning"].includes(m.type()) && console.log(`[${engine}] console ${m.type()}`, m.text()));
    await page.goto(`${origin}/scripts/binder-lab.html?${query}`);
    await page.waitForFunction(() => /ready$/.test(document.title), null, { timeout: 30000 });
    await page.waitForTimeout(300);
    const file = join(out, name);
    const clip = args.clip ? (([x, y, width, height]) => ({ x, y, width, height }))(args.clip.split(",").map(Number)) : null;
    await page.screenshot({ path: file, fullPage: true, ...(clip ? { clip } : {}) });
    written.push(file);
    await browser.close();
  }
  server.close();
  for (const file of written) console.log(file);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
