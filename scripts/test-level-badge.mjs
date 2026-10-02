/* Level badge, avatar frame and frame chooser markup.
   node scripts/test-level-badge.mjs */
import assert from "node:assert/strict";
import { EXTRA_FRAMES, FRAMES, LEVEL_CAP, frameForLevel, frameOpen } from "../js/levels.js";
import { PRESTIGE_CAP } from "../js/xp.js";
import { frameHtml, framePicksHtml, levelBadgeHtml, userFrame } from "../js/level-badge.js";
import { FRAME_CATALOG, FRAME_GROUPS, frameCatalogInfo } from "../js/frame-catalog.js";
import { frameInfo } from "../js/levels.js";
import { frameChoice } from "../worker/perks.js";
import fs from "node:fs";

let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks += 1; };
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); checks += 1; };

const AVATAR = `<span class="user-face md"><img src="x.png" alt="" /></span>`;

// ---- frameHtml ---------------------------------------------------------
// Bronze to legend were retired as avatar frames (2026-10-02): they draw nothing now.
for (const frame of FRAMES) {
  eq(frameHtml(AVATAR, frame.id, { size: 56 }), AVATAR, `${frame.id} is retired: the avatar comes back unframed`);
}

// unknown or missing frame ids leave the avatar exactly as it was
for (const bad of ["", null, undefined, "diamond", "MON-PIKACHU", "mon-pikachu ", '"><script>alert(1)</script>', "__proto__", "constructor", 5, {}, []]) {
  eq(frameHtml(AVATAR, bad), AVATAR, `unknown frame ${JSON.stringify(bad)} returns the avatar`);
}
eq(frameHtml(undefined, "mon-pikachu").includes("undefined"), false, "a missing avatar is an empty string, not 'undefined'");
eq(frameHtml(null, "nope"), "", "a missing avatar with no frame is empty");

// size steps
const step = (size) => /data-s="(\w+)"/.exec(frameHtml(AVATAR, "mon-pikachu", { size }))[1];
eq(step(22), "xs", "22px");
eq(step(28), "xs", "28px");
eq(step(36), "sm", "36px");
eq(step("40px"), "sm", "40px string");
eq(step(56), "md", "56px");
eq(step(88), "lg", "88px");
eq(step(120), "xl", "120px");
eq(step("lg"), "lg", "named step");
eq(step("huge"), "md", "unknown name falls back to md");
eq(step('"><b>'), "md", "hostile size falls back to md and cannot reach the markup");
eq(step(-4), "md", "negative size");
eq(step(undefined), "md", "no size");
ok(!frameHtml(AVATAR, "mon-pikachu", { size: '"><img src=x onerror=alert(1)>' }).includes("onerror"), "size is never echoed");

// online mark
ok(frameHtml(AVATAR, "mon-eevee", { online: true }).includes("lf-on"), "online adds the live mark");
ok(!frameHtml(AVATAR, "mon-eevee").includes("lf-on"), "offline does not");

// ---- levelBadgeHtml ----------------------------------------------------
const badge = (level, opts) => levelBadgeHtml(level, opts);
for (const [level, tier] of [[1, "none"], [4, "none"], [5, "bronze"], [14, "bronze"], [15, "silver"], [30, "gold"], [50, "platinum"], [75, "prismatic"], [100, "legend"]]) {
  const html = badge(level);
  ok(html.includes(`data-frame="${tier}"`), `level ${level} is stamped ${tier}`);
  ok(html.includes(`aria-label="Level ${level}"`), `level ${level} has a spoken label`);
  ok(html.includes(`>${level}</span>`), `level ${level} shows its numeral`);
  eq(tier === "none" ? null : frameForLevel(level), tier === "none" ? null : tier, `level ${level} agrees with levels.js`);
}
eq(badge(250).includes('aria-label="Level 200"'), true, "levels above the cap read as the cap");
eq(badge(7.9).includes('aria-label="Level 7"'), true, "a fractional level is floored");
eq(badge("42").includes('aria-label="Level 42"'), true, "a numeric string works");
eq(badge(100).includes('data-n="3"'), true, "three digits are flagged so they can be set narrower");
eq(badge(9).includes('data-n="1"'), true, "one digit");
for (const missing of [undefined, null, "", 0, -3, NaN, "abc", Infinity, false, true, {}, []]) {
  eq(badge(missing), "", `no badge for ${String(JSON.stringify(missing))}`);
}
ok(!badge('5"><script>x</script>').includes("script"), "a hostile level string is not echoed");
eq(badge(12, { size: "xl" }).includes('data-s="xl"'), true, "size step");
eq(badge(12, { size: '"><b>' }).includes("<b>"), false, "hostile size is not echoed");
eq(badge(12, { size: "nope" }).includes('data-s="md"'), true, "unknown size falls back to md");
ok(!/<(div|p|button|a)\b/.test(badge(30)), "a badge is inline markup, safe inside a heading or a bold name");

// ---- userFrame ---------------------------------------------------------
eq(userFrame({ frame: "mon-pikachu", level: 5 }), "mon-pikachu", "the server's frame wins");
eq(userFrame({ level: 60 }), null, "no automatic frame from the level");
eq(userFrame({ frame: null, level: 100 }), null, "null frame means none");
eq(userFrame({ frame: "legend", level: 100 }), null, "a retired frame is dropped");
eq(userFrame({ frame: "nonsense", level: 31 }), null, "an unknown id is no frame");
eq(userFrame(null), null, "no user");
eq(userFrame(undefined), null, "no user");

// ---- framePicksHtml ----------------------------------------------------
const picks = (opts) => framePicksHtml({ avatar: AVATAR, color: "#f0c14b", ...opts });
const level12 = picks({ level: 12, frame: "" });
ok(level12.includes('data-set-frame=""') && level12.includes(">No frame</b>"), "No frame comes first");
ok(/frame-pick on[^>]*data-set-frame=""/.test(level12), "No frame is on when nothing is equipped");
ok(FRAMES.every((f) => !level12.includes(`"${f.id}"`)), "the retired frames are not offered");
const equipped = picks({ level: 60, frame: "mon-togepi" });
ok(/frame-pick on[^>]*data-set-frame="mon-togepi"/.test(equipped), "the equipped frame is on");
ok(!/frame-pick on[^>]*data-set-frame=""/.test(equipped), "No frame is off then");
ok(/frame-pick on[^>]*data-set-frame=""/.test(picks({ level: 100, frame: "legend" })), "a retired frame reads as none");
ok(!picks({ level: 100, frame: "x\"><script>" }).includes("script"), "a hostile equipped value is not echoed");
ok(picks({ level: 40, frame: "" }).split(AVATAR).length - 1 >= EXTRA_FRAMES.length + 1, "every tile wears the player's own avatar");

// ---- the extra Pokémon frames (js/frame-catalog.js) --------------------
ok(FRAME_CATALOG.length >= 24, `the extra frames are there (${FRAME_CATALOG.length})`);
eq(new Set(FRAME_CATALOG.map((f) => f.id)).size, FRAME_CATALOG.length, "catalog ids are unique");
for (const f of FRAME_CATALOG.filter((f) => !/^(type|ball)-/.test(f.id))) {
  ok(/^[a-z0-9-]+$/.test(f.id) && FRAME_GROUPS.includes(f.group), `${f.id}: safe id and a known group`);
  ok(!FRAMES.some((l) => l.id === f.id), `${f.id}: does not shadow a badge tier`);
  eq(frameInfo(f.id)?.id, f.id, `${f.id}: frameInfo finds it`);
  ok(fs.existsSync(new URL(`../assets/frames/${f.id}-v2.svg`, import.meta.url)), `${f.id}: art file exists`);
  if (f.fx) ok(fs.existsSync(new URL(`../assets/frames/${f.id}-fx-v2.svg`, import.meta.url)), `${f.id}: moving layer exists`);
  if (f.fx2) ok(fs.existsSync(new URL(`../assets/frames/${f.id}-fx2-v2.svg`, import.meta.url)), `${f.id}: second moving layer exists`);
  const html = frameHtml(AVATAR, f.id, { size: 56, online: true });
  ok(html.startsWith('<span class="lvl-frame lf-art"') && html.includes(`data-frame="${f.id}"`) && html.includes(AVATAR), `${f.id}: one wrapper round the avatar`);
  ok(html.indexOf(AVATAR) < html.indexOf("lf-ring") && html.includes("lf-on"), `${f.id}: ring after the avatar, online mark kept`);
  eq(html.includes("lf-fx"), Boolean(f.fx), `${f.id}: moving layer only when it has one`);
  const need = frameInfo(f.id);
  eq(frameChoice(f.id, need.level || 1, need.prestige || 0).value, f.id, `${f.id}: the server lets it be worn once earned`);
  if (need.level > 1) {
    eq(frameChoice(f.id, need.level - 1).status, 403, `${f.id}: refused a level short`);
    eq(frameChoice(f.id, need.level - 1, 0, f.id).value, f.id, `${f.id}: a frame already worn stays wearable`);
  }
  if (need.prestige) eq(frameChoice(f.id, LEVEL_CAP, need.prestige - 1).status, 403, `${f.id}: refused a star short`);
  ok(userFrame({ frame: f.id }) === f.id, `${f.id}: userFrame keeps it`);
}
eq(frameCatalogInfo("gold"), null, "level frames are not in the catalog");
eq(frameCatalogInfo({ id: "x" }), null, "a non-string id is not a frame");
const open = picks({ level: 1, frame: "" });
ok(EXTRA_FRAMES.every((f) => open.includes(`data-set-frame="${f.id}"`) === frameOpen(f, 1, 0)), "at level 1 only the free extra frames are pickable");
ok(!EXTRA_FRAMES.some((f) => /^(type|ball)-/.test(f.id)), "the Types and Poké Ball frames are retired");
eq(frameInfo("type-fire"), null, "a retired frame is not a frame any more");
eq(frameChoice("ball-master", LEVEL_CAP, PRESTIGE_CAP).status, 400, "a retired frame cannot be picked");
ok(EXTRA_FRAMES.length >= 20 && EXTRA_FRAMES.every((f) => !frameOpen(f, 1, 0)), "every kept extra frame is earned");
ok(EXTRA_FRAMES.every((f) => (f.level || 0) <= LEVEL_CAP && (f.prestige || 0) <= PRESTIGE_CAP), "every extra frame can be earned");
const all = picks({ level: LEVEL_CAP, prestige: PRESTIGE_CAP, frame: "" });
ok(EXTRA_FRAMES.every((f) => all.includes(`data-set-frame="${f.id}"`)), "every extra frame is pickable at the cap with every star");
ok(picks({ level: 1, frame: "" }).includes('data-frame-locked="mon-pikachu"') && picks({ level: 1, frame: "" }).includes("<small>Level 3</small>"), "a locked extra frame says its level");
ok(picks({ level: 1, frame: "mon-mew" }).includes('data-set-frame="mon-mew"'), "a worn extra frame is never locked under the player");
ok(FRAME_GROUPS.every((g) => !EXTRA_FRAMES.some((f) => f.group === g) === !open.includes(`<h3>${g}</h3>`)), "tiles sit under their group names, retired groups gone");
ok(/frame-pick on[^>]*data-set-frame="mon-mew"/.test(picks({ level: 1, frame: "mon-mew" })), "an equipped extra frame is on");

console.log(`level badge: ${checks} checks passed`);
