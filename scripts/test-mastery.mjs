/* Set accents, the mastery emblem, the mastery banner id, mastery ranks, the
   remastered rewards (coins, gear gifts, era crowns) and their Worker claim.
   node scripts/test-mastery.mjs */
import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import worker from "../worker/index.js";
import { PLAYABLE_SETS, dataSetsOf, homeCards } from "../js/catalog.js";
import { ACHIEVEMENTS, achievementById, achievementsBySet, masteryRowFor } from "../js/achievements.js";
import { CROWN_ERAS, eraSlug, eraTotal, setsInEra } from "../js/achievement-eras.js";
import { MASTERY_COIN, HALF_COIN, CROWN_COIN, halfCoins, masteryCoins, crownCoins } from "../js/achievement-sets.js";
import { MASTERY_GIFTS, CROWN_GIFTS } from "../js/mastery-gifts.js";
import { ERA_CROWNS, MASTERY_RANKS, eraCrownRewards, masteryRank, masteryRewards, rankProgress } from "../js/mastery-ranks.js";
import { XP_WEIGHTS, computeXp } from "../js/xp.js";
import { LEVEL_GEAR } from "../js/levels.js";
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
eq(setAccent("nope"), { a: "#f2c14e", b: "#ff7a3d" }, "unknown set falls back");
eq(setAccent("__proto__"), { a: "#f2c14e", b: "#ff7a3d" }, "prototype keys are not sets");
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
ok(masteryEmblemHtml("sv9", { size: "lg" }).includes('class="mastery-emblem" data-size="lg" data-rank="4"'), "wrapper html");
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
eq(parseBanner(), { motion: "aurora", colors: ["gold", "ember"] }, "default parse");
eq(parseBanner("drift:aqua+rose"), { motion: "drift", colors: ["aqua", "rose"] }, "standard parse");
eq(parseBanner("pulse:violet"), { motion: "pulse", colors: ["violet", "gold"] }, "one colour gets a partner");
eq(parseBanner("beam:violet+nope"), { motion: "beam", colors: ["violet", "gold"] }, "bad colour becomes gold");
eq(parseBanner("nope:aqua+rose"), { motion: "aurora", colors: ["aqua", "rose"] }, "bad motion becomes aurora");
eq(bannerId("mist:ember+fairy"), "mist:ember+fairy", "standard id");
eq(bannerId("junk"), "aurora:gold+ember", "junk id");
eq(bannerVars("aurora:gold+violet"), { motion: "aurora", style: "--b1:#f0c14b;--b2:#9b6dff" }, "standard vars");
eq(bannerVars("beam:aqua+ocean"), { motion: "beam", style: "--b1:#5fd4ff;--b2:#2f6dff" }, "standard vars 2");
ok(!("set" in parseBanner("aurora:gold+violet")), "standard banners carry no set");


// ---- ranks: derived from owned %, never stored --------------------------------
eq(MASTERY_RANKS.map((r) => [r.id, r.pct]), [["bronze", 25], ["silver", 50], ["gold", 75], ["master", 100]], "four ranks");
const rankAt = (pct) => masteryRank(pct).rank;
eq([0, 1, 24, 24.99, 24.9999].map(rankAt), [null, null, null, null, null], "below 25% is unranked");
eq([25, 25.01, 49.99].map(rankAt), ["bronze", "bronze", "bronze"], "25 up to 49.99 is bronze");
eq([50, 74.99].map(rankAt), ["silver", "silver"], "50 up to 74.99 is silver");
eq([75, 99.99].map(rankAt), ["gold", "gold"], "75 up to 99.99 is gold");
eq([100, 150, 1e9].map(rankAt), ["master", "master", "master"], "100 and up is master");
eq([-5, NaN, undefined, null, "x", Infinity].map(rankAt), [null, null, null, null, null, null], "junk is unranked, never throws");
eq(masteryRank(24), { rank: null, index: -1, next: { id: "bronze", pct: 25, name: "Bronze" }, toNext: 1, label: "Unranked" }, "unranked shape");
eq(masteryRank(30), { rank: "bronze", index: 0, next: { id: "silver", pct: 50, name: "Silver" }, toNext: 20, label: "Bronze" }, "bronze shape");
eq(masteryRank(100), { rank: "master", index: 3, next: null, toNext: 0, label: "Master" }, "master has no next");
ok(masteryRank(49.99).toNext > 0 && masteryRank(49.99).toNext < 0.02, "49.99 is 0.01 short of silver");
masteryRank(24).next.pct = 99;
eq(MASTERY_RANKS[0].pct, 25, "the returned next rank is a copy");
// By cards: whole-card comparison, 100 only when every card is owned.
eq([24, 25, 49, 50, 74, 75, 99, 100].map((n) => rankProgress(n, 100).rank), [null, "bronze", "bronze", "silver", "silver", "gold", "gold", "master"], "boundaries by cards");
eq(rankProgress(24, 100).rank, null, "24 of 100 is unranked");
eq(rankProgress(25, 100).rank, "bronze", "25 of 100 is bronze");
eq(rankProgress(99, 100), { ...masteryRank(75), owned: 99, total: 100, pct: 99, toNextCards: 1, next: { id: "master", pct: 100, name: "Master" }, toNext: 1 }, "99 of 100 is gold, one card to master");
eq(rankProgress(100, 100).rank, "master", "all cards is master");
eq(rankProgress(100, 100).toNextCards, 0, "nothing to go");
eq(rankProgress(3, 12).rank, "bronze", "3 of 12 is exactly 25%");
eq(rankProgress(2, 12).rank, null, "2 of 12 is 16%");
eq(rankProgress(2, 12).toNextCards, 1, "one more card for bronze");
eq(rankProgress(369, 370).pct, 99, "pct floors");
eq(rankProgress(370, 370).pct, 100, "pct is 100 only when complete");
eq(rankProgress(5, 0), { ...masteryRank(0), owned: 0, total: 0, pct: 0, toNextCards: 0 }, "an empty set is safe");
eq(rankProgress(500, 100).owned, 100, "owned is clamped to the total");
eq(rankProgress(-4, 100).rank, null, "negative owned");
eq(rankProgress("x", "y").pct, 0, "junk counts");
for (const total of [12, 33, 99, 100, 101, 370]) {
  for (let have = 0; have <= total; have += 1) {
    const r = rankProgress(have, total);
    // matches masteryRank of the floored pct and never goes backwards
    eq(r.rank, masteryRank(r.pct).rank, `${have}/${total} rank agrees with floored pct`);
    if (have) ok(r.index >= rankProgress(have - 1, total).index, `${have}/${total} ranks never drop`);
  }
}

// ---- coins scale with set size ---------------------------------------------------
{
  const OLD_HALF = (n) => Math.round((n * 1.5) / 10) * 10;
  const OLD_MASTER = (n) => Math.round((500 + n * 5) / 50) * 50;
  let prevM = 0;
  let prevH = 0;
  let prevC = 0;
  for (let n = 0; n <= 1000; n += 1) {
    const m = masteryCoins(n);
    const h = halfCoins(n);
    const c = crownCoins(n * 10);
    ok(m >= prevM && h >= prevH && c >= prevC, `coins never shrink as a set grows (${n})`);
    prevM = m;
    prevH = h;
    prevC = c;
    ok(m >= MASTERY_COIN.base && m <= MASTERY_COIN.max, `mastery coins within floor and cap at ${n}`);
    ok(m % 50 === 0 && h % 10 === 0, `round amounts at ${n}`);
    if (n >= 1 && n <= 400) {
      ok(m >= OLD_MASTER(n) || m === MASTERY_COIN.max, `mastery never pays less than before at ${n}`);
      ok(h >= OLD_HALF(n), `half never pays less than before at ${n}`);
    }
  }
  eq([masteryCoins(0), masteryCoins(-5), masteryCoins(NaN), masteryCoins("x"), masteryCoins(1e9)], [600, 600, 600, 600, 4000], "bad totals fall to the floor, huge to the cap");
  ok(masteryCoins(370) > masteryCoins(12) * 4, "a big set pays far more than a tiny one");
  ok(crownCoins(eraTotal("Scarlet & Violet")) <= CROWN_COIN.max, "crown cap");
  ok(HALF_COIN.base > 0, "half floor");
  // Sizes of the payout: printed so the lead sees the liability.
  const sum = (rows) => rows.reduce((n, row) => n + row.coins, 0);
  const masters = ACHIEVEMENTS.filter((row) => row.kind === "mastery");
  const halves = ACHIEVEMENTS.filter((row) => row.kind === "half");
  const crowns = ACHIEVEMENTS.filter((row) => row.kind === "crown");
  const oldMasters = PLAYABLE_SETS.reduce((n, set) => n + OLD_MASTER(set.totalCount), 0);
  const oldHalves = PLAYABLE_SETS.reduce((n, set) => n + OLD_HALF(set.totalCount), 0);
  console.log(`mastery coins ${sum(masters)} (was ${oldMasters}), half ${sum(halves)} (was ${oldHalves}), crowns ${sum(crowns)} (new), all achievements ${sum(ACHIEVEMENTS)}`);
  ok(sum(masters) > oldMasters && sum(masters) < oldMasters * 2, "mastery pay grew, by less than double");
  // 600k with the 71 sets of 2026-10-01 morning; every era back to Base Set (171 sets) sits near 660k.
  ok(sum(ACHIEVEMENTS) < 1_000_000, "the whole achievement economy stays under 1M");
}

// ---- ids: nothing renamed, nothing duplicated ------------------------------------
{
  const all = ACHIEVEMENTS.map((row) => row.id);
  eq(new Set(all).size, all.length, "achievement ids are unique");
  for (const set of PLAYABLE_SETS) {
    ok(achievementById(`set-${set.id}-half`) && achievementById(`set-${set.id}-master`), `${set.id} keeps both legacy ids`);
    eq(achievementsBySet(set.id).length, 2, `${set.id} still has exactly its half and mastery rows`);
    eq(achievementById(`set-${set.id}-master`).goal, set.totalCount, `${set.id} master goal`);
    eq(achievementById(`set-${set.id}-half`).goal, Math.ceil(set.totalCount / 2), `${set.id} half goal`);
  }
  for (const era of CROWN_ERAS) ok(!all.includes(`era-${eraSlug(era)}-0`), "crown ids do not collide with the rung ids");
  for (const row of ACHIEVEMENTS.filter((r) => /^era-.*-\d+$/.test(r.id))) ok(!/crown/.test(row.id), "rung ids are numeric");
}

// ---- half and mastery XP -----------------------------------------------------------
{
  const half = (id) => achievementById(`set-${id}-half`);
  const sizes = PLAYABLE_SETS.map((set) => [set.totalCount, half(set.id).tier]);
  ok(sizes.every(([n, tier]) => (Math.ceil(n / 2) >= 75 ? tier === 3 : tier === 2)), "half rows are tier 2, or tier 3 from 75 cards on");
  const small = PLAYABLE_SETS.find((set) => set.totalCount < 100);
  const big = PLAYABLE_SETS.find((set) => set.totalCount > 200);
  eq(computeXp({ claimed: [half(small.id).id] }).total, XP_WEIGHTS.achievement[2], "a small half is 50 XP");
  eq(computeXp({ claimed: [half(big.id).id] }).total, XP_WEIGHTS.achievement[3], "a big half is 120 XP");
  eq(computeXp({ claimed: [`set-${big.id}-master`] }).total, XP_WEIGHTS.mastery, "a mastery is 600 XP");
  const crown = ACHIEVEMENTS.find((row) => row.kind === "crown");
  eq(computeXp({ claimed: [crown.id] }).total, XP_WEIGHTS.crown, "an era crown is 1,500 XP");
  ok(XP_WEIGHTS.crown > XP_WEIGHTS.mastery, "a crown is worth more than one mastery");
  eq(computeXp({ claimed: [crown.id, crown.id, "set-nope-master"] }).total, XP_WEIGHTS.crown, "a repeated or unknown id counts once or never");
}

// ---- gear gifts -----------------------------------------------------------------------
const gearCatalog = JSON.parse(fs.readFileSync(new URL("../data/gear.json", import.meta.url), "utf8"));
const giftJson = JSON.parse(fs.readFileSync(new URL("../data/mastery-gifts.json", import.meta.url), "utf8"));
eq(giftJson, { sets: MASTERY_GIFTS, crowns: CROWN_GIFTS }, "js/mastery-gifts.js matches data/mastery-gifts.json");
{
  // The pick rule, written out again here: foil sleeves first then id; a coin only this set owns first, then a real photo,
  // then metal, then id. A set with none of a kind gets none.
  const levelOwned = new Set(Object.values(LEVEL_GEAR).flat().map((g) => g.id));
  const of = (table, setId) => Object.values(table).filter((item) => item.sets.includes(setId) && !levelOwned.has(item.id));
  const sleeveFor = (setId) => of(gearCatalog.sleeves, setId).sort((a, b) => (b.foil ? 1 : 0) - (a.foil ? 1 : 0) || (a.id < b.id ? -1 : 1))[0];
  const coinFor = (setId) =>
    of(gearCatalog.coins, setId).sort(
      (a, b) =>
        a.sets.length - b.sets.length ||
        (a.drawn ? 1 : 0) - (b.drawn ? 1 : 0) ||
        (a.material === "metal" ? 0 : 1) - (b.material === "metal" ? 0 : 1) ||
        (a.id < b.id ? -1 : 1)
    )[0];
  eq(Object.keys(MASTERY_GIFTS).sort(), PLAYABLE_SETS.map((set) => set.id).sort(), "gifts are listed for exactly the playable sets (re-run scripts/make_mastery_gifts.py when sets change)");
  let both = 0;
  let one = 0;
  let none = 0;
  const levelIds = new Set(Object.values(LEVEL_GEAR).flat().map((g) => `${g.kind}:${g.id}`));
  for (const set of PLAYABLE_SETS) {
    for (const g of MASTERY_GIFTS[set.id]) ok(!levelOwned.has(g.id), `${set.id} gift ${g.id} is also a level gift`);
    const sleeve = sleeveFor(set.id);
    const coin = coinFor(set.id);
    const want = [sleeve && { kind: "sleeve", id: sleeve.id, name: sleeve.name }, coin && { kind: "coin", id: coin.id, name: coin.name }].filter(Boolean);
    eq(MASTERY_GIFTS[set.id], want, `${set.id} gifts follow the pick rule`);
    for (const item of MASTERY_GIFTS[set.id]) {
      const real = (item.kind === "sleeve" ? gearCatalog.sleeves : gearCatalog.coins)[item.id];
      ok(real && real.sets.includes(set.id), `${set.id} gift ${item.id} is that set's own ${item.kind}`);
    }
    const row = masteryRowFor(set.id);
    eq(row.reward.gear, want.map(({ kind, id }) => ({ kind, id })), `${set.id} row carries reward.gear`);
    if (want.length === 2) both += 1;
    else if (want.length === 1) one += 1;
    else none += 1;
    // A foil sleeve wins whenever the set has one.
    const foil = of(gearCatalog.sleeves, set.id).filter((s) => s.foil);
    if (foil.length) ok(sleeve.foil, `${set.id} prefers a foil sleeve`);
  }
  ok(both > 40 && none >= 1, `most sets give a sleeve and a coin (${both}), ${one} give one, ${none} give none`);
  console.log(`mastery gifts: ${both} sets give a sleeve and a coin, ${one} give one, ${none} give none`);
  // Crowns: one per crowned era, items that exist, from the era's own sets, not already a set or level gift.
  eq(Object.keys(CROWN_GIFTS).sort(), CROWN_ERAS.map(eraSlug).sort(), "crown gifts for exactly the crowned eras");
  const setGifts = new Set(Object.values(MASTERY_GIFTS).flat().map((g) => `${g.kind}:${g.id}`));
  for (const era of CROWN_ERAS) {
    const eraSets = new Set(setsInEra(era).map((set) => set.id));
    const picks = CROWN_GIFTS[eraSlug(era)];
    // An era with no sleeve or coin in data/gear.json yet (XY and older) has a gearless crown.
    const eraHasGear = [...eraSets].some((id) => (MASTERY_GIFTS[id] || []).length > 0);
    if (eraHasGear) ok(picks.length >= 1, `${era} crown gifts something`);
    for (const g of picks) {
      const real = (g.kind === "sleeve" ? gearCatalog.sleeves : gearCatalog.coins)[g.id];
      ok(real && real.sets.some((id) => eraSets.has(id)), `${era} crown gift ${g.id} belongs to the era`);
      ok(!setGifts.has(`${g.kind}:${g.id}`) && !levelIds.has(`${g.kind}:${g.id}`), `${era} crown gift ${g.id} is not already a set or level gift`);
    }
  }
}

// ---- masteryRewards(setId) ---------------------------------------------------------------
{
  const empty = { coins: 0, xp: 0, title: "", emblem: false, banner: false, gear: [], halfCoins: 0, halfXp: 0 };
  for (const bad of ["nope", "", undefined, null, 42, "__proto__", "constructor", "SV1"]) eq(masteryRewards(bad), empty, `masteryRewards(${String(bad)}) is the empty shape`);
  for (const set of PLAYABLE_SETS) {
    const r = masteryRewards(set.id);
    const row = masteryRowFor(set.id);
    eq(Object.keys(r).sort(), ["banner", "coins", "emblem", "gear", "halfCoins", "halfXp", "title", "xp"], `${set.id} keys`);
    eq([r.coins, r.xp, r.title, r.emblem, r.banner], [row.coins, XP_WEIGHTS.mastery, row.title, true, true], `${set.id} reward matches its row`);
    eq(r.halfCoins, achievementById(`set-${set.id}-half`).coins, `${set.id} half coins`);
    eq(r.gear.map(({ kind, id }) => ({ kind, id })), row.reward.gear, `${set.id} gear matches the row`);
    for (const g of r.gear) ok(typeof g.name === "string" && g.name.length > 0, `${set.id} ${g.id} has a name`);
  }
  const noGear = PLAYABLE_SETS.find((set) => MASTERY_GIFTS[set.id].length === 0);
  ok(noGear, "there is a playable set with no gear to test");
  eq(masteryRewards(noGear.id).gear, [], `${noGear.id} has no gear gift`);
  ok(masteryRewards(noGear.id).coins >= 600, "a set without gear still pays coins");
  eq(masteryRewards("sv1").gear.length, 2, "sv1 gifts a sleeve and a coin");
  // Crown details for the same screen.
  eq(ERA_CROWNS.map((c) => c.era), CROWN_ERAS, "one crown per crowned era");
  for (const crown of ERA_CROWNS) {
    eq(eraCrownRewards(crown.era), crown);
    eq(eraCrownRewards(crown.slug), crown);
    eq([crown.sets, crown.xp], [setsInEra(crown.era).length, XP_WEIGHTS.crown]);
    ok(crown.title.endsWith("Champion") && crown.title.length <= 32, `${crown.era} title`);
    ok(crown.gear.every((g) => g.name), `${crown.era} gear`);
    if ((CROWN_GIFTS[crown.slug] || []).length) ok(crown.gear.length > 0, `${crown.era} gear`);
  }
  eq(eraCrownRewards("nope"), null);
  eq(eraCrownRewards(undefined), null);
}

// ---- the Worker: claims pay the gear once --------------------------------------------------
const DAY = 86_400_000;
const realNow = Date.now();
const db = new DatabaseSync(":memory:");
for (const file of fs.readdirSync(new URL("../worker/migrations/", import.meta.url)).sort()) {
  db.exec(fs.readFileSync(new URL(`../worker/migrations/${file}`, import.meta.url), "utf8"));
}
const DB = {
  exec: async (sql) => { db.exec(sql); return {}; },
  prepare(sql) {
    let params = [];
    const statement = {
      bind(...values) { assert.ok(values.length <= 100, "D1 allows at most 100 bound parameters"); params = values; return statement; },
      async all() { return { results: db.prepare(sql).all(...params) }; },
      async first(column) { const r = db.prepare(sql).get(...params); return column ? r?.[column] : r || null; },
      async run() { const r = db.prepare(sql).run(...params); return { success: true, meta: { changes: Number(r.changes) } }; },
    };
    return statement;
  },
  // Like D1, a batch runs in order and as a unit: nothing else interleaves, so changes() chains hold.
  async batch(statements) { return Promise.all(statements.map((s) => s.run())); },
};
let failGear = false;
const env = {
  DB,
  SITE_ORIGIN: "https://poke-pack.rip",
  ASSETS: {
    fetch: async (request) => {
      const path = new URL(request.url).pathname;
      if (failGear && path === "/data/gear.json") return new Response("", { status: 500 });
      if (!path.startsWith("/data/")) return new Response("", { status: 404 });
      try { return new Response(fs.readFileSync(new URL(`..${path}`, import.meta.url)), { headers: { "content-type": "application/json" } }); } catch { return new Response("", { status: 404 }); }
    },
  },
};
async function request(path, method, body, sid) {
  const res = await worker.fetch(new Request(`https://poke-pack.rip${path}`, {
    method,
    headers: { "content-type": "application/json", origin: "https://poke-pack.rip", cookie: `pp_sid=${sid}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }), env);
  return { status: res.status, body: await res.json() };
}
let userNo = 0;
function addUser(coinsStart = 100) {
  userNo += 1;
  const id = `u${userNo}`;
  db.prepare("INSERT INTO users(id,name,handle,password_hash,color,created_at,last_played) VALUES(?,?,?,?,?,?,?)").run(id, id, `${id}handle`, "unused", "gold", realNow, realNow);
  db.prepare("INSERT INTO sessions(id,user_id,created_at,expires_at) VALUES(?,?,?,?)").run(`sid-${id}`, id, realNow, realNow + 3650 * DAY);
  db.prepare("INSERT INTO profiles(user_id,coins,granted,created_at,binder,claimed) VALUES(?,?,?,?,?,?)").run(id, coinsStart, coinsStart, realNow, "[]", "[]");
  return { id, sid: `sid-${id}` };
}
const cardIdsOf = (set) => homeCards(set, dataSetsOf(set).map((src) => JSON.parse(fs.readFileSync(new URL(`../${src.dataFile}`, import.meta.url), "utf8")))).map((card) => card.id);
function giveSet(user, set) {
  const insert = db.prepare("INSERT OR IGNORE INTO cards(user_id,card_id,qty,reverse_qty) VALUES(?,?,?,?)");
  db.exec("BEGIN");
  for (const id of cardIdsOf(set)) insert.run(user.id, id, 1, 0);
  db.exec("COMMIT");
}
const coinsOf = (user) => db.prepare("SELECT coins FROM profiles WHERE user_id=?").get(user.id).coins;
const gearRows = (user) => db.prepare("SELECT kind,item_id,qty FROM user_gear WHERE user_id=? ORDER BY kind,item_id").all(user.id).map((r) => ({ ...r }));
const claimedOf = (user) => JSON.parse(db.prepare("SELECT claimed FROM profiles WHERE user_id=?").get(user.id).claimed);
const claim = (user, body) => request("/api/achievements/claim", "POST", body, user.sid);
const withGear = PLAYABLE_SETS.filter((set) => masteryRowFor(set.id).reward.gear.length === 2).sort((a, b) => a.totalCount - b.totalCount);
const bare = PLAYABLE_SETS.filter((set) => masteryRowFor(set.id).reward.gear.length === 0).sort((a, b) => a.totalCount - b.totalCount)[0];
const [setA, setB, setC] = withGear;
const items = (set) => masteryRowFor(set.id).reward.gear.map(({ kind, id }) => ({ kind, item_id: id, qty: 1 }));

{
  // The gear catalogue fails to load: a claim with a gift waits (503) and spends nothing; the same claim works once it loads.
  // (Runs first: the Worker caches the catalogue after its first good load.)
  failGear = true;
  const u = addUser();
  giveSet(u, setA);
  const row = masteryRowFor(setA.id);
  const before = coinsOf(u);
  for (const body of [{ id: row.id }, { all: true }]) {
    const res = await claim(u, body);
    eq(res.status, 503, JSON.stringify(res.body).slice(0, 200));
  }
  eq([coinsOf(u), claimedOf(u), gearRows(u)], [before, [], []], "a 503 claim changes nothing");
  const half = await claim(u, { id: `set-${setA.id}-half` });
  eq(half.status, 200, "a row without a gift still claims while the catalogue is down");
  eq(claimedOf(u), [`set-${setA.id}-half`], "only the half row was spent");
  failGear = false;
  const res = await claim(u, { id: row.id });
  eq(res.status, 200, JSON.stringify(res.body).slice(0, 200));
  eq(res.body.gear.length, 2, "the gift arrives once the catalogue loads");
  eq(gearRows(u).length, 2);
  eq(claimedOf(u).sort(), [row.id, `set-${setA.id}-half`].sort());
}

{
  // One claim pays coins, the title, and the set's own sleeve and coin.
  const u = addUser();
  giveSet(u, setA);
  const row = masteryRowFor(setA.id);
  const before = coinsOf(u);
  const res = await claim(u, { id: row.id });
  eq(res.status, 200, JSON.stringify(res.body));
  eq(res.body.coins, row.coins, "pays the mastery coins");
  eq(coinsOf(u), before + row.coins, "coins credited once");
  eq(res.body.titles, [row.title], "title reported");
  eq(res.body.gear.map(({ kind, id }) => ({ kind, id })), row.reward.gear, "claim reports the gear it granted");
  ok(res.body.gear.every((g) => g.name && g.wasNew === true), "granted gear has a name and is new");
  eq(res.body.rewards[0].gear.map((g) => g.id), row.reward.gear.map((g) => g.id), "the reward row lists its gear");
  eq(gearRows(u), items(setA).sort((a, b) => (a.kind + a.item_id < b.kind + b.item_id ? -1 : 1)), "one sleeve and one coin in the user's gear");
  ok(res.body.save.gear.sleeves[row.reward.gear.find((g) => g.kind === "sleeve").id] === 1, "the returned save holds the sleeve");
  // The half row (no gear) next to it grants none.
  const half = await claim(u, { id: `set-${setA.id}-half` });
  eq([half.status, half.body.gear, half.body.rewards[0].gear], [200, [], []], "a half row gifts no gear");
  // Claiming again is refused and grants nothing more.
  const again = await claim(u, { id: row.id });
  eq(again.status, 400, "already claimed");
  eq(gearRows(u).map((r) => r.qty), [1, 1], "still one of each");
  eq(coinsOf(u), before + row.coins + half.body.coins, "no second payout");
}

{
  // Parallel claims of the same row: one wins, the gear arrives once.
  const u = addUser();
  giveSet(u, setB);
  const row = masteryRowFor(setB.id);
  const before = coinsOf(u);
  const results = await Promise.all([1, 2, 3, 4, 5].map(() => claim(u, { id: row.id })));
  eq(results.filter((r) => r.status === 200).length, 1, `exactly one claim wins: ${results.map((r) => r.status)}`);
  ok(results.every((r) => [200, 400, 409].includes(r.status)), "the rest are refused");
  eq(coinsOf(u), before + row.coins, "paid once");
  eq(gearRows(u).map((r) => r.qty), [1, 1], "gear granted once under parallel claims");
  eq(claimedOf(u).filter((id) => id === row.id).length, 1, "id stored once");
  // "Claim all" racing a single claim.
  const v = addUser();
  giveSet(v, setA);
  giveSet(v, setC);
  const mixed = await Promise.all([claim(v, { all: true }), claim(v, { all: true }), claim(v, { id: `set-${setA.id}-master` }), claim(v, { id: `set-${setC.id}-master` })]);
  ok(mixed.some((r) => r.status === 200), "someone wins");
  const rows = gearRows(v);
  eq(rows.length, 4, "two sets, a sleeve and a coin each");
  ok(rows.every((r) => r.qty === 1), `every item granted exactly once: ${JSON.stringify(rows)}`);
  const stored = claimedOf(v);
  for (const set of [setA, setC]) ok(stored.includes(`set-${set.id}-master`), `${set.id} mastery is not lost from the claimed list`);
  eq(new Set(stored).size, stored.length, "no id twice");
}

{
  // A set with no gear: the claim works, grants nothing, reports an empty list.
  const u = addUser();
  giveSet(u, bare);
  const res = await claim(u, { id: `set-${bare.id}-master` });
  eq(res.status, 200, JSON.stringify(res.body));
  eq([res.body.gear, res.body.rewards[0].gear], [[], []], "no gear to report");
  eq(gearRows(u), [], "nothing granted");
  eq(res.body.coins, masteryRowFor(bare.id).coins);
  // Unknown ids and unfinished sets grant nothing.
  eq((await claim(u, { id: "set-nope-master" })).status, 400);
  const w = addUser();
  eq((await claim(w, { id: `set-${setA.id}-master` })).status, 400, "not finished");
  eq(gearRows(w), []);
}

{
  // A mastery claimed before the remaster is never paid again, gear included.
  const u = addUser();
  giveSet(u, setA);
  db.prepare("UPDATE profiles SET claimed=? WHERE user_id=?").run(JSON.stringify([`set-${setA.id}-master`]), u.id);
  eq((await claim(u, { id: `set-${setA.id}-master` })).status, 400, "already claimed");
  const sweep = await claim(u, { all: true });
  ok(sweep.status === 200 || sweep.status === 400);
  if (sweep.status === 200) ok(!sweep.body.claimed.includes(`set-${setA.id}-master`), "a claimed mastery is not in the sweep");
  eq(gearRows(u), [], "no retroactive gear for an old claim");
  ok(claimedOf(u).includes(`set-${setA.id}-master`), "the old id is kept");
}

{
  // An era crown: own every set of the era and the crown (with its title and gear) can be claimed.
  // The smallest era whose crown gifts gear (the eras older than Sun & Moon have no gear filed yet).
  const era = [...CROWN_ERAS].filter((e) => (CROWN_GIFTS[eraSlug(e)] || []).length).sort((a, b) => eraTotal(a) - eraTotal(b))[0];
  const crown = ACHIEVEMENTS.find((row) => row.kind === "crown" && row.era === era);
  const u = addUser();
  const sets = setsInEra(era);
  for (const set of sets.slice(0, -1)) giveSet(u, set);
  const sweep = await claim(u, { all: true });
  eq(sweep.status, 200, JSON.stringify(sweep.body).slice(0, 200));
  ok(!sweep.body.claimed.includes(crown.id), "the crown waits for the last set");
  eq((await claim(u, { id: crown.id })).status, 400, "one set short is refused");
  ok(gearRows(u).length > 0, "the set masteries in the sweep gifted gear");
  giveSet(u, sets.at(-1));
  const before = coinsOf(u);
  const res = await claim(u, { id: crown.id });
  eq(res.status, 200, JSON.stringify(res.body).slice(0, 200));
  eq(res.body.coins, crown.coins, "crown coins");
  eq(res.body.titles, [`${era} Champion`], "crown title");
  eq(coinsOf(u), before + crown.coins);
  eq(res.body.gear.map(({ kind, id }) => ({ kind, id })), crown.reward.gear, "crown gear reported");
  const held = new Set(gearRows(u).map((r) => `${r.kind}:${r.item_id}`));
  for (const g of crown.reward.gear) ok(held.has(`${g.kind}:${g.id}`), `crown gift ${g.id} is held`);
  ok(gearRows(u).every((r) => r.qty === 1), "every item once");
  eq((await claim(u, { id: crown.id })).status, 400, "the crown is claimed once");
  ok(claimedOf(u).includes(crown.id));
  // The title is wearable: the account accepts it once the crown is claimed.
  const patch = await request("/api/me", "PATCH", { title: `${era} Champion` }, u.sid);
  eq(patch.status, 200, JSON.stringify(patch.body));
}

console.log(`test-mastery: ${checks} checks passed`);
