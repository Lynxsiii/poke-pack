// Writes the <link rel="modulepreload"> list in index.html from the site's module graph.
//
//   node scripts/build_modulepreload.mjs          rewrite the block in index.html
//   node scripts/build_modulepreload.mjs --check  exit 1 if the block is out of date
//
// Why: a browser only finds a module's imports after it has downloaded that module, and every file under
// /js is served no-cache (revalidated on each visit, see _headers). js/app.js reaches about 190 modules
// 15 imports deep, plus the holo families js/holo-fam.js imports once it has run, so a phone on a real
// network waited one round trip per level before the site could start. Listing every module up front lets
// the browser ask for all of them at once.
//
// Each href is the exact URL the import resolves to, ?v= included, so the preload is the copy the import
// uses. Run this after adding a module, removing one or bumping an import's ?v=. A stale entry costs one
// wasted request and a missing one only the old wait; nothing breaks either way.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const root = new URL("..", import.meta.url);
const INDEX = new URL("index.html", root);
const START = "<!-- modulepreload:start (scripts/build_modulepreload.mjs) -->";
const END = "<!-- modulepreload:end -->";

/** Static imports and re-exports of a module source; dynamic import() is left to load when it is asked for. */
function specifiers(src) {
  const out = [];
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const m of code.matchAll(/(?:^|[;\n])\s*(?:import|export)\s+(?:[^"'`;]*?\sfrom\s*)?["']([^"']+)["']/g)) out.push(m[1]);
  return out;
}

const seen = new Map(); // "/js/x.js?v=2" -> true
const byPath = new Map(); // "/js/x.js" -> Set of full urls
function walk(url) {
  if (seen.has(url)) return;
  const path = url.split("?")[0];
  const file = new URL("." + path, root);
  if (!existsSync(file)) {
    console.warn(`missing module ${url}`);
    return;
  }
  seen.set(url, true);
  if (!byPath.has(path)) byPath.set(path, new Set());
  byPath.get(path).add(url);
  for (const spec of specifiers(readFileSync(file, "utf8"))) {
    if (!spec.startsWith(".") && !spec.startsWith("/")) continue;
    const next = new URL(spec, "https://x" + url);
    walk(next.pathname + next.search);
  }
}

const html = readFileSync(INDEX, "utf8");
const entries = [...html.matchAll(/<script type="module" src="([^"]+)"/g)].map((m) => "/" + m[1].replace(/^\//, ""));
for (const entry of entries) walk(entry);

// js/holo-fam.js imports every holo family with a computed URL: `./fam/${name}.js?v=${v}` from FAMILIES.
const fam = readFileSync(new URL("js/holo-fam.js", root), "utf8");
const list = fam.slice(fam.indexOf("export const FAMILIES"), fam.indexOf("];", fam.indexOf("export const FAMILIES")));
for (const m of list.matchAll(/\["([\w-]+)",\s*(\d+)\]/g)) walk(`/js/fam/${m[1]}.js?v=${m[2]}`);

for (const [path, urls] of byPath) {
  if (urls.size > 1) console.warn(`${path} is imported under ${urls.size} URLs (${[...urls].join(", ")}): each one is a separate copy of the module`);
}

// The entry scripts are already in the page; preload what they pull in.
const urls = [...seen.keys()].filter((url) => !entries.includes(url));
const block = [START, ...urls.map((url) => `    <link rel="modulepreload" href="${url.slice(1)}" />`), `    ${END}`].join("\n");

const at = html.indexOf(START);
const next = at >= 0
  ? html.slice(0, at) + block + html.slice(html.indexOf(END, at) + END.length)
  : html.replace(/\n(\s*)<\/head>/, `\n    ${block}\n$1</head>`);

if (process.argv.includes("--check")) {
  if (next !== html) {
    console.error("index.html modulepreload list is out of date: run node scripts/build_modulepreload.mjs");
    process.exit(1);
  }
  console.log(`modulepreload list is current (${urls.length} modules)`);
} else {
  writeFileSync(INDEX, next);
  console.log(`index.html: ${urls.length} modules preloaded`);
}
