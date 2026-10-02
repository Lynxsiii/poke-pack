#!/usr/bin/env node
/**
 * Builds the extra avatar frames: one SVG (and, for animated ones, a second SVG
 * for the moving layer) per frame in assets/frames/, the catalog the site reads
 * (js/frame-catalog.js) and the rules that attach the art (css/pages/frames-art.css).
 *
 * Frames are drawn in scripts/frames/*.mjs. Each file exports `frames`, a list of
 *
 *   { id, name, group, of, c: [accent1, accent2], fx?, fxs?, fxd?, base(h), glow?(h),
 *     fx2?, fxs2?, fxd2?, glow2?(h) }
 *
 *   id     "type-fire": unique, lowercase, [a-z0-9-]
 *   group  one of GROUPS below (the order here is the order in the picker)
 *   of     how far the frame sticks out past the avatar, as a share of its size (.1 to .24)
 *   c      two accent colours: the plain ring small faces (chat, lists) wear
 *   fx     how `glow` moves: spin, pulse (opacity .55 to 1), breathe, sway, drift (rises and fades) or fall (sinks and fades); fxs is the loop in seconds
 *   base   returns the SVG for the still frame; h = { of, ra } (ra: the avatar's radius in the 200 box)
 *   fxd    delay in seconds (negative starts mid-loop), so layers do not pulse in step
 *   glow   returns the SVG for the moving layer (same box), only with fx
 *   fx2, fxs2, fxd2, glow2   an optional second moving layer with its own motion, loop and delay
 *          (twinkles in two groups, a spin under a pulse); same rules as the first
 *
 * See scripts/lib/frame-art.mjs for the drawing helpers. Files under assets/ are
 * cached for a year, so the version in VERSION goes into every file name; bump it
 * in the same change that edits any shipped art, never overwrite a shipped file.
 *
 *   node scripts/make-frames.mjs          write everything
 *   node scripts/make-frames.mjs --check  fail if the written files are stale
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { raOf } from "./lib/frame-art.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VERSION = 2;
const GROUPS = ["Pokémon", "Cards", "Extras"];
const FX = ["spin", "pulse", "breathe", "sway", "drift", "fall"];
const FILES = ["pokemon", "pokemon2", "cards", "extras"];
const MAX_SVG = 14000; // bytes; a frame is a ring, not a painting

const all = [];
for (const name of FILES) {
  const file = path.join(ROOT, "scripts/frames", `${name}.mjs`);
  if (!fs.existsSync(file)) continue;
  const mod = await import(pathToFileURL(file).href);
  for (const frame of mod.frames) all.push({ ...frame, file: name });
}

const problems = [];
const seen = new Set();
for (const fr of all) {
  const tag = `${fr.file}:${fr.id}`;
  if (!/^[a-z0-9-]+$/.test(fr.id || "")) problems.push(`${tag}: bad id`);
  if (seen.has(fr.id)) problems.push(`${tag}: duplicate id`);
  seen.add(fr.id);
  if (!fr.name || fr.name.length > 24) problems.push(`${tag}: name missing or over 24 characters`);
  if (!GROUPS.includes(fr.group)) problems.push(`${tag}: group must be one of ${GROUPS.join(", ")}`);
  if (!(fr.of >= 0.1 && fr.of <= 0.24)) problems.push(`${tag}: of must be between .1 and .24`);
  if (!Array.isArray(fr.c) || fr.c.length !== 2 || !fr.c.every((c) => /^#[0-9a-f]{6}$/i.test(c))) problems.push(`${tag}: c needs two #rrggbb colours`);
  if (fr.fx && !FX.includes(fr.fx)) problems.push(`${tag}: fx must be one of ${FX.join(", ")}`);
  if (Boolean(fr.fx) !== Boolean(fr.glow)) problems.push(`${tag}: fx and glow go together`);
  if (fr.fx2 && !FX.includes(fr.fx2)) problems.push(`${tag}: fx2 must be one of ${FX.join(", ")}`);
  if (Boolean(fr.fx2) !== Boolean(fr.glow2)) problems.push(`${tag}: fx2 and glow2 go together`);
  if (fr.fx2 && !fr.fx) problems.push(`${tag}: fx2 needs fx`);
}

const outputs = new Map(); // path relative to the repo -> contents
for (const fr of all) {
  const h = { of: fr.of, ra: raOf(fr.of) };
  const files = { base: fr.base(h), glow: fr.glow ? fr.glow(h) : null, glow2: fr.glow2 ? fr.glow2(h) : null };
  for (const [kind, svg] of Object.entries(files)) {
    if (!svg) continue;
    const tag = `${fr.file}:${fr.id}${kind === "base" ? "" : ` (${kind})`}`;
    if (!svg.startsWith("<svg ")) problems.push(`${tag}: not an svg`);
    if (/<(script|style|image|foreignObject|filter|text)\b|href=|url\((?!#)/i.test(svg)) problems.push(`${tag}: svg uses something it must not (script, style, image, filter, text or an outside link)`);
    if (/NaN|undefined|Infinity/.test(svg)) problems.push(`${tag}: svg has NaN or undefined in it`);
    if (Buffer.byteLength(svg) > MAX_SVG) problems.push(`${tag}: svg is ${Buffer.byteLength(svg)} bytes, over ${MAX_SVG}`);
    outputs.set(`assets/frames/${fr.id}${{ base: "", glow: "-fx", glow2: "-fx2" }[kind]}-v${VERSION}.svg`, svg);
  }
}

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}

const rows = [...all].sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group));

outputs.set(
  "js/frame-catalog.js",
  `/**
 * The extra avatar frames: Pokémon-themed rings, one SVG each in assets/frames/.
 * GENERATED by scripts/make-frames.mjs from scripts/frames/*.mjs. Do not edit.
 *
 * No imports, so js/levels.js (and through it the Worker) can read it.
 *
 * \`level\` is the level a frame opens at. 0 means free for everyone; how each
 * frame is earned or bought is up to the levels system, which only has to change
 * this number or filter FRAME_CATALOG (ids are stable). \`fx\` names the moving
 * layer's motion ("" for none), fx2 a second layer's. \`c\` is the plain ring small faces wear.
 */
export const FRAME_GROUPS = ${JSON.stringify(GROUPS)};
/** The -vN in the art file names under assets/frames/ (shipped art is cached for a year, so a redraw gets a new N). */
export const FRAME_ART_VERSION = ${VERSION};

export const FRAME_CATALOG = [
${rows.map((r) => `  { id: ${JSON.stringify(r.id)}, name: ${JSON.stringify(r.name)}, group: ${JSON.stringify(r.group)}, level: 0, fx: ${JSON.stringify(r.fx || "")}, fx2: ${JSON.stringify(r.fx2 || "")}, c: ${JSON.stringify(r.c)} },`).join("\n")}
];

const BY_ID = new Map(FRAME_CATALOG.map((frame) => [frame.id, frame]));

/** The catalog entry for an id, or null (also null for the level frames bronze to legend). */
export function frameCatalogInfo(id) {
  return typeof id === "string" ? BY_ID.get(id) || null : null;
}
`
);

outputs.set(
  "css/pages/frames-art.css",
  `/* Extra avatar frames (Pokémon types, Poké Balls, Pokémon, cards, extras).
   GENERATED by scripts/make-frames.mjs. Do not edit; the art is in scripts/frames/.

   Markup comes from js/level-badge.js (frameHtml): a .lvl-frame.lf-art holding the
   avatar, .lf-ring (the still art, an SVG drawn a little bigger than the avatar so
   the band sits round it) and, on the animated ones, .lf-fx (a second SVG whose
   only motion is transform or opacity). Small faces (xs, sm) get a plain ring in
   the frame's two accent colours instead, because the art is too fine to read there.
   The rules every frame shares are in css/pages/frames.css. */

/* ---- Art on faces from md up ---------------------------------------------- */
.lvl-frame.lf-art:is([data-s="md"], [data-s="lg"], [data-s="xl"]) { --of: var(--fo, .18); }
.lvl-frame.lf-art:is([data-s="md"], [data-s="lg"], [data-s="xl"]) > .lf-ring {
  -webkit-mask-image: none; mask-image: none; border-radius: 0; /* a rounded box would clip the art to a circle */
  background-repeat: no-repeat; background-position: center; background-size: 100% 100%;
}
.lf-fx {
  position: absolute; inset: calc(var(--o) * -1); display: none; pointer-events: none;
  background-repeat: no-repeat; background-position: center; background-size: 100% 100%;
}
.lvl-frame.lf-art:is([data-s="md"], [data-s="lg"], [data-s="xl"]) > .lf-fx { display: block; will-change: transform, opacity; }

/* ---- A plain ring on small faces ------------------------------------------- */
.lvl-frame.lf-art:is([data-s="xs"], [data-s="sm"]) { --of: .07; --e: 87.7%; }
.lvl-frame.lf-art[data-s="sm"] { --of: .09; --e: 84.7%; }
.lvl-frame.lf-art:is([data-s="xs"], [data-s="sm"]) > .lf-ring {
  background:
    radial-gradient(closest-side, transparent 96.5%, rgba(7, 6, 12, 0.6) 99%, transparent 100%),
    conic-gradient(from 140deg, var(--c1), var(--c2) 22%, var(--c1) 45%, var(--c2) 70%, var(--c1));
}

/* The online mark sits on the band, wherever the frame ends. */
.lvl-frame.lf-art > .lf-on { right: calc(var(--of) * -38.9% - 0.4%); bottom: calc(var(--of) * -38.9% - 0.4%); }

/* ---- Motion: transform and opacity only ----------------------------------- */
@keyframes lf-a-spin { to { transform: rotate(360deg); } }
@keyframes lf-a-pulse { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }
@keyframes lf-a-breathe { 0%, 100% { transform: scale(1); opacity: 0.7; } 50% { transform: scale(1.035); opacity: 1; } }
@keyframes lf-a-sway { 0%, 100% { transform: rotate(-2.5deg); } 50% { transform: rotate(2.5deg); } }
@keyframes lf-a-fall { 0% { transform: translateY(-4%); opacity: 0; } 22% { opacity: 1; } 100% { transform: translateY(7%); opacity: 0; } }
@keyframes lf-a-drift { 0% { transform: translateY(3%); opacity: 0; } 25% { opacity: 1; } 100% { transform: translateY(-5%); opacity: 0; } }
.lf-fx[data-fx="spin"] { animation: lf-a-spin var(--fxs, 24s) linear infinite; }
.lf-fx[data-fx="pulse"] { animation: lf-a-pulse var(--fxs, 2.8s) ease-in-out infinite; }
.lf-fx[data-fx="breathe"] { animation: lf-a-breathe var(--fxs, 3.6s) ease-in-out infinite; }
.lf-fx[data-fx="sway"] { animation: lf-a-sway var(--fxs, 5s) ease-in-out infinite; }
.lf-fx[data-fx="drift"] { animation: lf-a-drift var(--fxs, 3.2s) ease-out infinite; }
.lf-fx[data-fx="fall"] { animation: lf-a-fall var(--fxs, 5s) ease-in-out infinite; }
.lf-fx { animation-delay: var(--fxd, 0s); }
.lf-fx.lf-fx2[data-fx] { animation-duration: var(--fxs2, 3.4s); animation-delay: var(--fxd2, 0s); }
/* At rest the moving layer shows where it looks best. */
@media (prefers-reduced-motion: reduce) { .lf-fx { animation: none !important; opacity: 0.85; } }
body.no-motion .lf-fx { animation: none !important; opacity: 0.85; }

/* ---- The frames ------------------------------------------------------------ */
${rows
  .map((r) => {
    const vars = [r.fxs && `--fxs: ${r.fxs}s`, r.fxd && `--fxd: ${r.fxd}s`, r.fxs2 && `--fxs2: ${r.fxs2}s`, r.fxd2 && `--fxd2: ${r.fxd2}s`].filter(Boolean).join("; ");
    const lines = [`.lvl-frame[data-frame="${r.id}"] { --fo: ${r.of}; --c1: ${r.c[0]}; --c2: ${r.c[1]};${vars ? ` ${vars};` : ""} }`];
    lines.push(`.lvl-frame[data-frame="${r.id}"] > .lf-ring { background-image: url("../../assets/frames/${r.id}-v${VERSION}.svg"); }`);
    if (r.glow2) lines.push(`.lvl-frame[data-frame="${r.id}"] > .lf-fx2 { background-image: url("../../assets/frames/${r.id}-fx2-v${VERSION}.svg"); }`);
    if (r.glow) lines.push(`.lvl-frame[data-frame="${r.id}"] > .lf-fx { background-image: url("../../assets/frames/${r.id}-fx-v${VERSION}.svg"); }`);
    return lines.join("\n");
  })
  .join("\n")}
`
);

const check = process.argv.includes("--check");
let stale = 0;
const frameDir = path.join(ROOT, "assets/frames");
if (!check) fs.mkdirSync(frameDir, { recursive: true });
for (const [rel, text] of outputs) {
  const file = path.join(ROOT, rel);
  const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
  if (current === text) continue;
  if (check) {
    console.error(`stale: ${rel}`);
    stale++;
  } else {
    fs.writeFileSync(file, text);
  }
}
if (fs.existsSync(frameDir)) {
  for (const name of fs.readdirSync(frameDir)) {
    if (outputs.has(`assets/frames/${name}`)) continue;
    if (check) {
      console.error(`unexpected: assets/frames/${name}`);
      stale++;
    } else if (/-v\d+\.svg$/.test(name)) fs.unlinkSync(path.join(frameDir, name));
  }
}
if (check && stale) process.exit(1);
console.log(`${check ? "checked" : "wrote"} ${rows.length} frames, ${[...outputs.keys()].filter((k) => k.endsWith(".svg")).length} svgs`);
