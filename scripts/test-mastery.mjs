/* Set accents, the mastery emblem and the mastery banner id.
   node scripts/test-mastery.mjs */
import assert from "node:assert/strict";
import fs from "node:fs";
import { PLAYABLE_SETS } from "../js/catalog.js";
import { SET_ACCENTS } from "../js/set-accents.js";
import {
  isMasteryBanner, masteryBannerId, masteryBannerSet, masteryEmblem, masteryEmblemHtml, masterySetIds, midStop, setAccent,
} from "../js/mastery.js";
import { DEFAULT_BANNER, bannerId, bannerVars, parseBanner } from "../js/cosmetics.js";

let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks += 1; };
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); checks += 1; };

const HEX = /^#[0-9a-f]{6}$/i;
const BG = [8, 8, 11]; // DESIGN.md black
const MIN_CONTRAST = 4.5;
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const rgb = (h) => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16));
const contrast = (h) => { const a = lum(rgb(h)); const b = lum(BG); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
const hueOf = (h) => { const [r, g, b] = rgb(h).map((v) => v / 255); const mx = Math.max(r, g, b); const mn = Math.min(r, g, b); const d = mx - mn; if (!d) return 0; let x = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; x *= 60; return x < 0 ? x + 360 : x; };

// ---- accents ----------------------------------------------------------
const json = JSON.parse(fs.readFileSync(new URL("../data/set-accents.json", import.meta.url), "utf8"));
eq(json, Object.fromEntries(Object.entries(SET_ACCENTS).map(([k, v]) => [k, { a: v.a, b: v.b }])), "js/set-accents.js matches data/set-accents.json");
eq(Object.keys(SET_ACCENTS).sort(), PLAYABLE_SETS.map((s) => s.id).sort(), "an accent pair for exactly the playable sets");
const seen = new Map();
for (const set of PLAYABLE_SETS) {
  const { a, b } = setAccent(set.id);
  ok(HEX.test(a) && HEX.test(b), `${set.id} accents are hex`);
  ok(contrast(a) >= MIN_CONTRAST, `${set.id} a ${a} contrast ${contrast(a).toFixed(2)}`);
  ok(contrast(b) >= MIN_CONTRAST, `${set.id} b ${b} contrast ${contrast(b).toFixed(2)}`);
  let dh = Math.abs(hueOf(a) - hueOf(b)); dh = Math.min(dh, 360 - dh);
  const [ra, rb] = [rgb(a), rgb(b)];
  ok(dh >= 25 || Math.abs(lum(ra) - lum(rb)) > 0.08, `${set.id} pair is a real pair`);
  const key = `${a}${b}`.toLowerCase();
  ok(!seen.has(key), `${set.id} pair is not a copy of ${seen.get(key)}`);
  seen.set(key, set.id);
}
eq(setAccent("nope"), { a: "#f2c14e", b: "#9b6dff" }, "unknown set falls back");
eq(setAccent("__proto__"), { a: "#f2c14e", b: "#9b6dff" }, "prototype keys are not sets");
ok(HEX.test(midStop("#ffd03d", "#5aa0ff")), "midStop is a hex");

// ---- emblem -----------------------------------------------------------
for (const set of PLAYABLE_SETS) {
  const svg = masteryEmblem(set.id, { size: 64, name: set.name });
  ok(svg.startsWith("<svg ") && svg.endsWith("</svg>"), `${set.id} svg wrapped`);
  ok(/viewBox="0 0 96 96"/.test(svg) && /width="64"/.test(svg), `${set.id} size`);
  ok(svg.includes(`aria-label="${set.name.replace(/&/g, "&amp;")} Master"`) || svg.includes("Master\""), `${set.id} label`);
  ok(svg.includes(`assets/cards/sets/`) && svg.includes("<image "), `${set.id} carries the set symbol`);
  ok(!/<filter|filter=/.test(svg), `${set.id} uses no SVG filter`);
  // every opened tag closes, every url(#id) has its gradient, no NaN
  ok(!/NaN|undefined/.test(svg), `${set.id} no NaN`);
  const ids = [...svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
  for (const ref of svg.matchAll(/url\(#([^)]+)\)/g)) ok(ids.includes(ref[1]), `${set.id} defines ${ref[1]}`);
  const opens = (svg.match(/<(?!\/)(?!\?)[a-zA-Z]+/g) || []).length;
  const closes = (svg.match(/<\/[a-zA-Z]+>/g) || []).length;
  const selfClosed = (svg.match(/\/>/g) || []).length;
  eq(opens, closes + selfClosed, `${set.id} balanced tags`);
}
ok(masteryEmblem("sv9").includes("<image"), "default symbol from the catalog");
ok(masteryEmblem("sv9", { symbol: "x.png" }).includes('href="x.png"'), "symbol override");
ok(!masteryEmblem("sv9", { name: 'A"<b>' }).includes('"<b>'), "name is escaped");
ok(masteryEmblem("sv9", { label: false }).includes("aria-hidden"), "decorative emblem");
ok(masteryEmblem("zzz").includes("<svg"), "unknown set still draws");
ok(masteryEmblemHtml("sv9", { size: "lg" }).includes('class="mastery-emblem" data-size="lg"'), "wrapper html");
ok(masteryEmblemHtml("sv9", { locked: true }).includes("is-locked"), "locked wrapper");
const ida = masteryEmblem("sv9").match(/id="(mem\d+)r"/)[1];
const idb = masteryEmblem("sv9").match(/id="(mem\d+)r"/)[1];
ok(ida !== idb, "gradient ids are unique per emblem");

// ---- claim ids and banner ids ------------------------------------------
eq(masterySetIds(["set-sv9-master", "set-sv9-half", "x", "set-me5-master", "set-sv9-master", "set-nope-master"]), ["sv9", "me5"], "masterySetIds");
eq(masterySetIds(new Set(["set-swsh7-master"])), ["swsh7"], "masterySetIds takes a Set");
eq(masterySetIds(null), [], "masterySetIds null");
eq(masteryBannerId("sv9"), "mastery:sv9", "masteryBannerId");
ok(isMasteryBanner("mastery:sv9") && !isMasteryBanner("aurora:gold+violet") && !isMasteryBanner(null), "isMasteryBanner");
eq(masteryBannerSet("mastery:sv9"), "sv9", "masteryBannerSet");

for (const set of PLAYABLE_SETS) {
  const id = `mastery:${set.id}`;
  const parsed = parseBanner(id);
  eq(parsed.motion, "mastery", `${id} motion`);
  eq(parsed.set, set.id, `${id} set`);
  ok(Array.isArray(parsed.colors) && parsed.colors.length === 2 && parsed.colors.every((c) => typeof c === "string"), `${id} colors stay palette ids`);
  eq(bannerId(id), id, `${id} round trips`);
  eq(bannerId(bannerId(id)), id, `${id} round trips twice`);
  const vars = bannerVars(id);
  const { a, b } = setAccent(set.id);
  eq(vars, { motion: "mastery", style: `--b1:${a};--b2:${b}` }, `${id} bannerVars`);
}
// unknown or malformed mastery ids fall back to the default banner
for (const bad of ["mastery:", "mastery:nope", "mastery:__proto__", "mastery:sv9+sv1"]) {
  eq(bannerId(bad), bannerId(DEFAULT_BANNER), `${bad} falls back`);
  eq(bannerVars(bad).motion, "aurora", `${bad} vars fall back`);
  ok(!("set" in parseBanner(bad)), `${bad} has no set`);
}

// ---- standard banners unchanged -----------------------------------------
eq(parseBanner(), { motion: "aurora", colors: ["gold", "violet"] }, "default parse");
eq(parseBanner("drift:aqua+rose"), { motion: "drift", colors: ["aqua", "rose"] }, "standard parse");
eq(parseBanner("pulse:violet"), { motion: "pulse", colors: ["violet", "gold"] }, "one colour gets a partner");
eq(parseBanner("beam:violet+nope"), { motion: "beam", colors: ["violet", "gold"] }, "bad colour becomes gold");
eq(parseBanner("nope:aqua+rose"), { motion: "aurora", colors: ["aqua", "rose"] }, "bad motion becomes aurora");
eq(bannerId("mist:ember+fairy"), "mist:ember+fairy", "standard id");
eq(bannerId("junk"), "aurora:gold+violet", "junk id");
eq(bannerVars("aurora:gold+violet"), { motion: "aurora", style: "--b1:#f0c14b;--b2:#9b6dff" }, "standard vars");
eq(bannerVars("beam:aqua+ocean"), { motion: "beam", style: "--b1:#5fd4ff;--b2:#2f6dff" }, "standard vars 2");
ok(!("set" in parseBanner("aurora:gold+violet")), "standard banners carry no set");

console.log(`test-mastery: ${checks} checks passed`);
