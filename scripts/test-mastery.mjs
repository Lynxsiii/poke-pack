/* Set accents, the seal (ranks, foil rim), the composed banner, the profile shelf, the Mastery tab
   builders and the banner id.  node scripts/test-mastery.mjs */
import assert from "node:assert/strict";
import fs from "node:fs";
import { PLAYABLE_SETS, setIdentity } from "../js/catalog.js";
import { SET_ACCENTS } from "../js/set-accents.js";
import {
  SEAL_RANKS, isMasteryBanner, masteryBannerId, masteryBannerSet, masteryEmblem, masteryEmblemHtml, masterySetIds, midStop, sealRank, setAccent,
} from "../js/mastery.js";
import { DEFAULT_BANNER, bannerId, bannerVars, parseBanner } from "../js/cosmetics.js";
import { bannerBlockHtml, chaseArt, masteryBannerHtml, packArt } from "../js/mastery-banner.js";
import { masteryShelfProfileHtml } from "../js/mastery-shelf.js";
import { cardsForRank, masteryBannersHtml, masteryDetailHtml, masteryShelfHtml, setSealRank } from "../js/quest-area.js";

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
const ida = masteryEmblem("sv9").match(/id="(mem\d+)f"/)[1];
const idb = masteryEmblem("sv9").match(/id="(mem\d+)f"/)[1];
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


// ---- seal v2: ranks --------------------------------------------------------
eq([0, 24.9, 25, 49, 50, 74.9, 75, 99.9, 100, 140].map(sealRank), [0, 0, 1, 1, 2, 2, 3, 3, 4, 4], "sealRank thresholds");
eq([NaN, undefined, null, "x", -5].map(sealRank), [0, 0, 0, 0, 0], "sealRank is safe on junk");
eq(SEAL_RANKS.map((r) => r.at), [0, 25, 50, 75, 100], "seal ranks sit at 25, 50, 75, 100");
const balanced = (svg) => {
  const opens = (svg.match(/<(?!\/)(?!\?)[a-zA-Z]+/g) || []).length;
  return opens === (svg.match(/<\/[a-zA-Z]+>/g) || []).length + (svg.match(/\/>/g) || []).length;
};
for (const set of PLAYABLE_SETS) {
  for (const rank of [0, 1, 2, 3, 4]) {
    const svg = masteryEmblem(set.id, { size: 40, rank });
    ok(balanced(svg) && !/NaN|undefined|<filter|filter=/.test(svg), `${set.id} rank ${rank} is clean svg`);
    ok(svg.includes(`data-rank="${rank}"`), `${set.id} rank ${rank} attribute`);
    // below master the rim is four quarters, of which `rank` are struck in a metal
    if (rank >= 1 && rank <= 3) {
      const quarters = svg.match(/<path d="M[^"]+" fill="[^"]+"( fill-opacity="\.14")?\/>/g) || [];
      eq(quarters.length, 4, `${set.id} rank ${rank} has four quarters`);
      eq(quarters.filter((q) => !q.includes("fill-opacity")).length, rank, `${set.id} rank ${rank} strikes ${rank} of them`);
    }
    if (rank === 4) ok(/<path d="M[^"]*L[^"]*Z" fill="url\(#mem\d+f\)"\/>/.test(svg), `${set.id} master has the foil rim`);
    for (const ref of svg.matchAll(/url\(#([^)]+)\)/g)) ok(svg.includes(`id="${ref[1]}"`), `${set.id} rank ${rank} defines ${ref[1]}`);
  }
}
ok(masteryEmblem("sv9", { rank: 1 }).includes("bronze mastery") || masteryEmblem("sv9", { rank: 1 }).includes("Bronze mastery"), "rank label");
ok(masteryEmblem("sv9", { rank: 0 }).includes("not started"), "rank 0 label");
ok(masteryEmblem("sv9").includes('data-rank="4"') && masteryEmblem("sv9").includes("Master"), "default is a mastered seal");
eq(masteryEmblem("sv9", { pct: 60 }).match(/data-rank="(\d)"/)[1], "2", "pct picks the rank");
eq(masteryEmblem("sv9", { rank: "gold" }).match(/data-rank="(\d)"/)[1], "3", "a rank id works");
eq(masteryEmblem("sv9", { rank: 9 }).match(/data-rank="(\d)"/)[1], "4", "rank is clamped");
eq(masteryEmblem("sv9", { rank: "nonsense" }).match(/data-rank="(\d)"/)[1], "4", "an unknown rank id is a mastered seal, never a crash");
ok(masteryEmblemHtml("sv9", { locked: true }).includes("is-locked") && masteryEmblemHtml("sv9", { locked: true }).includes('data-rank="0"'), "locked is the silhouette");
ok(masteryEmblemHtml("sv9", { pct: 55, locked: true }).includes("is-partial") && !masteryEmblemHtml("sv9", { pct: 55, locked: true }).includes("is-locked"), "a struck rank is partial, not a silhouette");
ok(masteryEmblemHtml("sv9", { rank: 2, dim: true }).includes("is-locked"), "dim previews a stop");
ok(masteryEmblemHtml("sv9", { size: "xl" }).includes('data-size="xl"'), "xl size");
ok(masteryEmblemHtml("sv9", { size: "huge" }).includes('data-size="md"'), "unknown size is md");

// ---- chase card and wrapper art come from files that exist ----------------
const here = (p) => fs.existsSync(new URL(`../${p}`, import.meta.url));
for (const set of PLAYABLE_SETS) {
  const chase = chaseArt(set.id);
  ok(chase && here(chase.full) && here(chase.small), `${set.id} has a chase card on disk (re-run scripts/make_set_chase.mjs for a new set)`);
  const pack = packArt(set.id);
  if (pack) ok(here(pack.png) && (!pack.avif || here(pack.avif)), `${set.id} wrapper art exists`);
  ok(here(setIdentity(set).logo), `${set.id} logo exists`);
}
eq(chaseArt("nope"), null, "unknown set has no chase card");
eq(chaseArt("__proto__"), null, "prototype keys have no chase card");
eq(packArt("nope"), null, "unknown set has no wrapper");
ok(PLAYABLE_SETS.some((s) => !packArt(s.id)), "promo sets without a wrapper fall back");

// ---- the composed banner -----------------------------------------------------
for (const set of PLAYABLE_SETS) {
  for (const variant of ["hero", "wide", "tile"]) {
    const html = masteryBannerHtml(set.id, { variant });
    ok(html.startsWith("<div ") && html.endsWith("</div>"), `${set.id} ${variant} banner is one element`);
    ok(balanced(html), `${set.id} ${variant} balanced tags`);
    ok(html.includes(`data-set="${set.id}"`) && html.includes("data-motion=\"mastery\""), `${set.id} ${variant} attributes`);
    const { a, b } = setAccent(set.id);
    ok(html.includes(`--b1:${a};--b2:${b}`), `${set.id} ${variant} takes the set accents`);
    ok(html.includes(setIdentity(set).logo), `${set.id} ${variant} carries the logo`);
    ok(html.includes("mbn-card"), `${set.id} ${variant} carries the chase card`);
    ok(!/<filter|filter=/.test(html), `${set.id} ${variant} uses no svg filter`);
    ok(/aria-hidden="true"/.test(html), `${set.id} ${variant} is decorative`);
    eq(html.includes("mbn-pack"), variant !== "tile" && Boolean(packArt(set.id)), `${set.id} ${variant} wrapper only on big banners with art`);
    eq(html.includes("mbn-stamp"), variant !== "tile", `${set.id} ${variant} stamp`);
    ok(html.includes('loading="lazy"'), `${set.id} ${variant} images are lazy`);
  }
}
ok(!masteryBannerHtml("sv9", { eager: true }).includes("lazy"), "eager banners do not lazy load");
ok(!masteryBannerHtml("sv9", { stamp: false }).includes("mbn-stamp"), "stamp can be left off");
ok(masteryBannerHtml("sv9", { tag: "span" }).startsWith("<span ") && masteryBannerHtml("sv9", { tag: "span" }).endsWith("</span>"), "span tag for buttons");
ok(masteryBannerHtml("sv9", { still: true }).includes("is-still"), "still swatch");
ok(!masteryBannerHtml("sv9", { className: 'a" onload="x' }).includes('" onload="'), "class names are escaped");
eq(masteryBannerHtml("sv9", { variant: "nope" }).includes('data-variant="hero"'), true, "unknown variant is hero");
// an unknown set is still a banner: the accent fallback wash and the stamp, no images
const unknown = masteryBannerHtml("base1-nope");
ok(unknown.includes("--b1:#f2c14e;--b2:#9b6dff") && !unknown.includes("<img") && !unknown.includes("<picture") && unknown.includes("mbn-stamp"), "unknown set falls back to the accent wash");
ok(!masteryBannerHtml('x"><script>').includes("<script>"), "set id is escaped");

// bannerBlockHtml: whatever a profile saved
ok(bannerBlockHtml("mastery:sv9").includes('class="mbn"') || bannerBlockHtml("mastery:sv9").includes("mbn"), "mastery value draws the composed banner");
ok(bannerBlockHtml("mastery:sv9", { className: "acct-banner" }).includes("mbn acct-banner"), "host class is kept");
for (const old of ["aurora:gold+violet", "drift:aqua+rose", "pulse:violet", "junk", "", null, undefined, "mastery:", "mastery:nope", "mastery:__proto__", "mastery:sv9+sv1"]) {
  const html = bannerBlockHtml(old, { className: "acct-banner" });
  ok(html.startsWith('<div class="banner-wash acct-banner"') && !html.includes("mbn"), `${old} draws the plain wash`);
  ok(/data-motion="(aurora|drift|pulse|beam|mist)"/.test(html) && /--b1:#[0-9a-f]{6};--b2:#[0-9a-f]{6}/i.test(html), `${old} keeps motion and colours`);
}
eq(bannerBlockHtml("drift:aqua+rose"), `<div class="banner-wash" data-motion="drift" style="${bannerVars("drift:aqua+rose").style}"></div>`, "plain banners render as they always did");

// ---- the profile shelf ---------------------------------------------------------
const many = PLAYABLE_SETS.slice(0, 12).map((s) => s.id);
const shelf = masteryShelfProfileHtml(many, {});
ok(shelf.includes("12</b> of " + PLAYABLE_SETS.length + " sets mastered"), "shelf counts mastered of all playable sets");
eq((shelf.match(/class="msh-seal"/g) || []).length, 12, "every mastered set has a seal");
ok(shelf.includes("See all 12") && shelf.includes("<details"), "past the cap there is a see all");
eq((shelf.split("<details")[0].match(/class="msh-seal"/g) || []).length, 8, "eight seals before see all");
ok(shelf.indexOf(PLAYABLE_SETS[11].name) < shelf.indexOf(PLAYABLE_SETS[0].name), "newest first");
ok(shelf.includes("mbn") && shelf.includes("Latest:"), "no mastery banner equipped: the newest set's banner sits above the seals");
ok(!masteryShelfProfileHtml(many, { banner: "mastery:sv9" }).includes("Latest:"), "a mastery banner already in the header is not repeated");
ok(!masteryShelfProfileHtml(many.slice(0, 3), {}).includes("<details"), "no see all under the cap");
eq(masteryShelfProfileHtml([], {}), "", "nothing mastered shows nothing on another player's page");
ok(masteryShelfProfileHtml([], { mine: true }).includes("No sets mastered yet"), "your own empty shelf says how to fill it");
eq(masteryShelfProfileHtml(["nope", "__proto__", 7, null], {}), "", "unknown ids are skipped");
eq((masteryShelfProfileHtml(["sv9", "sv9", "nope", "sv1"], {}).match(/class="msh-seal"/g) || []).length, 2, "duplicates and unknown ids dropped");
eq(masteryShelfProfileHtml(null, {}), "", "null list");
ok(masteryShelfProfileHtml(["sv9"], { limit: 1 }).includes("msh-seal") && !masteryShelfProfileHtml(["sv9"], { limit: 1 }).includes("<details"), "limit equal to count has no fold");

// ---- the Mastery tab and the Look picker (pure builders with stub deps) --------
const sets = PLAYABLE_SETS.slice(0, 6).map((s, i) => (i === 1 ? { ...s, name: 'Odd <b>"Name"</b> & Co' } : s));
const deps = {
  esc: (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]),
  num: (n) => Number(n).toLocaleString("en-US"),
  eraTitle: (e) => e,
  sets,
  setIdentity,
  setById: (id) => sets.find((s) => s.id === id) || null,
  achievementsBySet: () => [],
  achievementProgress: () => ({ done: false }),
  masteryRowFor: (id) => ({ id: `set-${id}-master`, coins: 1200, title: `${id} Master`, reward: id === sets[0].id ? { sleeve: "x" } : {} }),
  masteryEmblem: masteryEmblemHtml,
  masteryBannerId,
  masteryXp: 600,
  bannerVars,
};
const rowsFor = [[0, 0.1, false], [1, 0.3, false], [2, 0.6, false], [3, 0.9, false], [4, 1, true], [5, 1, false]].map(([i, f]) => ({ set: sets[i], owned: Math.floor(sets[i].totalCount * f), total: sets[i].totalCount, pct: Math.floor(f * 100) }));
const stats = { setRows: rowsFor, claimed: new Set([`set-${sets[4].id}-master`]), ctx: {} };
const shelfHtml = masteryShelfHtml(stats, { era: sets[0].era, set: sets[1].id }, deps);
eq((shelfHtml.match(/class="qm-set[ "]/g) || []).length, 6, "a tile per set in the era");
ok(shelfHtml.includes("&lt;b&gt;") && !shelfHtml.includes("<b>\"Name"), "set names are escaped on tiles and in the panel");
ok(shelfHtml.includes("is-mastered") && shelfHtml.includes(">Master<"), "mastered tile says Master");
ok(shelfHtml.includes(">Started<") && shelfHtml.includes("Bronze") && shelfHtml.includes("Silver") && shelfHtml.includes("Gold"), "tiles name their rank");
ok(/data-rank="4"/.test(shelfHtml.split("qm-set")[0] + shelfHtml.match(/qm-set is-mastered[\s\S]*?qm-name/)[0]), "mastered tile seal is master");
ok(shelfHtml.includes("class=\"qm-detail"), "the chosen set opens its panel");
ok(shelfHtml.includes("What you get") && shelfHtml.includes("1,200 coins") && shelfHtml.includes("600 XP"), "panel lists the rewards");
ok(shelfHtml.includes('class="qm-reward is-locked"') && !shelfHtml.includes("is-earned"), "unclaimed rewards read locked");
eq((shelfHtml.match(/class="qm-reward /g) || []).length, 5, "coins, xp, title, seal and banner");
ok(shelfHtml.includes("to Bronze") || shelfHtml.includes("to Silver") || shelfHtml.includes("to Gold") || shelfHtml.includes("master the set"), "panel says what the next rank costs");
const earned = masteryDetailHtml(sets[4], rowsFor[4], stats, deps);
eq((earned.match(/class="qm-reward is-earned"/g) || []).length, 5, "a mastered set's rewards read earned");
ok(earned.includes("Mastered.") && earned.includes("mbn-stamp"), "mastered panel: stamp and wording");
ok(!masteryDetailHtml(sets[2], rowsFor[2], stats, deps).includes("mbn-stamp"), "no Master stamp on a set that is not mastered");
ok(masteryDetailHtml(sets[0], rowsFor[0], stats, deps).includes("sleeve"), "a sleeve on the mastery row shows as a reward");
eq((masteryDetailHtml(sets[0], rowsFor[0], stats, { ...deps, masteryExtras: () => [{ art: "<i></i>", name: "Extra", note: "More" }] }).match(/class="qm-reward /g) || []).length, 7, "extras from the reward side are listed");
ok(!masteryDetailHtml(sets[3], { owned: 0, total: 0 }, stats, deps).includes("NaN"), "an empty set does not break the panel");
eq(setSealRank(100, false), 3, "a full set that is not claimed is gold, not master");
eq(setSealRank(100, true), 4, "claimed is master");
eq(cardsForRank(178, 1), 45, "cards for bronze rounds up");
eq(cardsForRank(178, 4), 178, "cards for master is the whole set");
const picker = masteryBannersHtml("mastery:" + sets[4].id, new Set([`set-${sets[4].id}-master`]), deps);
ok(picker.includes("mbn") && picker.includes(`data-set-banner="mastery:${sets[4].id}"`) && picker.includes("In use"), "unlocked banner is a real thumbnail you can pick");
ok(picker.includes("<details") && picker.includes("disabled"), "locked banners fold away and cannot be picked");
ok(masteryBannersHtml("", new Set(), deps).includes("only its masters can use it"), "empty picker explains itself");

console.log(`test-mastery: ${checks} checks passed`);
