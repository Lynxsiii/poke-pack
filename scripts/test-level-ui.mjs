// Checks the pure builders behind the Levels screens (js/level-ui.js): the
// summary fallback, the XP gain line, the tab, the road, the level-up card.
// Run: node scripts/test-level-ui.mjs
import assert from "node:assert/strict";
import { LEVEL_CAP, computeXp, levelFromXp, xpForLevel, xpSummary } from "../js/xp.js";
import { MILESTONES, levelCoins, levelPayout } from "../js/levels.js";
import {
  SOURCES,
  claimedText,
  levelReadoutHtml,
  levelUpHtml,
  levelsReadyCount,
  levelsTabHtml,
  roadModel,
  roadStops,
  sourceRows,
  unlocksBetween,
  xpGain,
  xpOf,
} from "../js/level-ui.js";

const EMOJI = /\p{Emoji_Presentation}/u;
const BAD_PUNCT = /[—–→←]|->/;
const plain = (html) => html.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/g, " ");

/** A summary the way the Worker would send it, for a given total. */
function summary(total, { claimedLevel = 1, parts } = {}) {
  const lv = levelFromXp(total);
  const claimable = [];
  for (let l = claimedLevel + 1; l <= lv.level; l++) claimable.push(l);
  const owed = levelPayout(claimedLevel + 1, lv.level);
  return {
    ...lv,
    total,
    parts: parts || computeXp({}).parts,
    banked: 0,
    claimedLevel,
    claimable,
    pending: { coins: owed.coins, gear: owed.gear, levels: claimable.length },
  };
}

// ---- xpOf: the fallback and the pass-through --------------------------------
const fresh = xpOf({});
assert.equal(fresh.level, 1);
assert.equal(fresh.total, 0);
assert.deepEqual(fresh.claimable, []);
assert.deepEqual(fresh.pending, { coins: 0, gear: [], levels: 0 });
assert.equal(fresh.parts.length, 12, "every source is listed even at zero");
assert.equal(xpOf(null).level, 1, "null save reads as a fresh one");
assert.equal(xpOf(undefined).claimable.length, 0);

// A save with real history: the fallback treats level 1 as the last level paid.
const vet = { packsOpened: 400, claimed: [], stats: { counters: { hitsPulled: 90, bonus: 50 } }, collection: { "x-1": 1, "x-2": 2 } };
const vx = xpOf(vet);
assert.equal(vx.total, xpSummary(vet).total);
assert.ok(vx.level > 5);
assert.equal(vx.claimedLevel, 1);
assert.deepEqual(vx.claimable, Array.from({ length: vx.level - 1 }, (_, i) => i + 2));
assert.equal(vx.pending.coins, levelPayout(2, vx.level).coins);
assert.equal(vx.pending.levels, vx.claimable.length);
assert.equal(levelsReadyCount(vx), vx.claimable.length);

// The Worker's own summary wins and is not recomputed.
const sent = xpOf({ packsOpened: 9999, xp: summary(1215, { claimedLevel: 6 }) });
assert.equal(sent.level, 10);
assert.equal(sent.total, 1215);
assert.deepEqual(sent.claimable, [7, 8, 9, 10]);
assert.equal(sent.claimedLevel, 6);
// A claimedLevel above the level (a sold-down fallback) never produces a negative list.
assert.deepEqual(xpOf({ xp: { ...summary(0), claimedLevel: 40 } }).claimable, []);
// Garbage in the xp object falls back to the computed summary.
assert.equal(xpOf({ xp: { total: "nope" }, packsOpened: 10 }).total, 100);

// Maxed.
const maxed = xpOf({ xp: summary(xpForLevel(LEVEL_CAP) + 500, { claimedLevel: LEVEL_CAP }) });
assert.equal(maxed.level, LEVEL_CAP);
assert.equal(maxed.maxed, true);
assert.equal(maxed.claimable.length, 0);

// ---- Header readout ------------------------------------------------------------
const readout = levelReadoutHtml(xpOf({ xp: summary(300, { claimedLevel: 5 }) }));
assert.match(readout, /<b>5<\/b>/);
assert.match(readout, /width:/);
assert.ok(!readout.includes("lvl-read-dot"), "no dot when nothing is waiting");
assert.ok(levelReadoutHtml(vx).includes("lvl-read-dot"), "a dot when rewards are waiting");
assert.match(levelReadoutHtml(maxed), /top level/);
assert.match(levelReadoutHtml(maxed), /width:100%/);

// ---- XP gain -----------------------------------------------------------------------
const part = (id, count, xp) => ({ id, label: id, count, xp });
const base = { ...summary(100, { parts: [part("packs", 5, 50), part("hits", 1, 15), part("unique", 17, 34), part("quests", 0, 0), part("battles", 0, 0)] }) };
const afterRip = {
  ...summary(125, { parts: [part("packs", 6, 60), part("hits", 2, 30), part("unique", 17, 34), part("quests", 0, 0), part("battles", 0, 0)] }),
};
const gain = xpGain(base, afterRip);
assert.equal(gain.xp, 25);
assert.equal(gain.text, "+25 XP: 1 pack, 1 hit");
assert.equal(gain.levelUp, false);
assert.equal(xpGain(base, base), null, "no gain, no message");
assert.equal(xpGain(afterRip, base), null, "a drop is not a gain");
assert.equal(xpGain(null, base), null);

// Plurals, XP without a count (a chest, a win), and a long list is cut to three.
const many = summary(400, { parts: [part("packs", 15, 150), part("hits", 4, 60), part("unique", 30, 60), part("sealed", 2, 60), part("quests", 0, 40), part("battles", 0, 40)] });
const manyGain = xpGain(base, many);
assert.match(manyGain.text, /^\+300 XP: 10 packs, 3 hits, 13 new cards and \d more$/);
const chest = xpGain(summary(100, { parts: [part("quests", 3, 60)] }), summary(140, { parts: [part("quests", 3, 100)] }));
assert.equal(chest.text, "+40 XP: chest");
const win = xpGain(summary(100, { parts: [part("battles", 2, 30)] }), summary(170, { parts: [part("battles", 3, 85)] }));
assert.equal(win.text, "+70 XP: 1 battle");

// A level-up carries the levels crossed.
const lvA = summary(xpForLevel(5) - 3);
const lvB = summary(xpForLevel(7) + 1);
const up = xpGain(lvA, lvB);
assert.equal(up.levelUp, true);
assert.deepEqual(up.levels, [5, 6, 7]);
assert.equal(up.from, 4);
assert.equal(up.to, 7);

// ---- Unlocks ----------------------------------------------------------------------------
const opened = unlocksBetween(4, 10);
assert.ok(opened.every((row) => row.level > 4 && row.level <= 10 && row.kind !== "coins"));
assert.ok(opened.some((row) => row.kind === "frame" && row.id === "bronze"));
assert.ok(opened.some((row) => row.kind === "banner" && row.id === "foil"));
assert.deepEqual(unlocksBetween(10, 10), []);

// ---- Sources --------------------------------------------------------------------------------
for (const row of fresh.parts) assert.ok(SOURCES[row.id], `source ${row.id} needs plain wording`);
const srcFresh = sourceRows(fresh);
assert.equal(srcFresh.earned.length, 0);
assert.equal(srcFresh.fresh.length, 12);
assert.ok(srcFresh.fresh.find((r) => r.id === "casino").opensAt > 1, "the casino is gated");
assert.equal(srcFresh.fresh.find((r) => r.id === "packs").opensAt, 0);
const srcVet = sourceRows(vx);
assert.ok(srcVet.earned.length >= 3);
assert.ok(srcVet.earned.every((r, i, all) => i === 0 || all[i - 1].xp >= r.xp), "earners are biggest first");
assert.ok(Math.abs(srcVet.earned.reduce((n, r) => n + r.share, 0) - 100) < 1e-6, "shares add up");

// ---- The tab ------------------------------------------------------------------------------------
const gearName = (kind, id) => (id === "psv-toolkit-2024-teal" ? '<img src=x onerror="alert(1)">' : "");
const tabFresh = levelsTabHtml(fresh, { gearName });
assert.ok(!tabFresh.includes("data-claim-levels"), "nothing to claim, no claim button");
assert.match(tabFresh, /Level 2 pays/);
assert.match(tabFresh, /Ways to earn XP/);
assert.match(tabFresh, /Opens at level 5\./);
assert.match(tabFresh, /Play your first game\./);
assert.match(tabFresh, /Packs, quests, battles and more all add XP\./);
assert.ok(!tabFresh.includes("Every bar is a share of your 0 XP"));
assert.equal((tabFresh.match(/class="lv-here"/g) || []).length, 1);

const tabVet = levelsTabHtml(xpOf({ xp: summary(xpForLevel(12) + 40, { claimedLevel: 6 }) }), { gearName });
assert.equal((tabVet.match(/data-claim-levels/g) || []).length, 1, "exactly one claim action");
assert.match(tabVet, /Levels 7 to 12 are waiting/);
assert.ok(!tabVet.includes("<img src=x"), "a gift name is escaped");
assert.ok(tabVet.includes("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"));
const owed = levelPayout(7, 12);
assert.ok(tabVet.includes(owed.coins.toLocaleString("en-US")), "the slip shows what it pays");
assert.equal((tabVet.match(/class="lv-slip-val">Gift/g) || []).length, owed.gear.length, "one slip line per gift");

const tabOne = levelsTabHtml(xpOf({ xp: summary(xpForLevel(3) + 1, { claimedLevel: 2 }) }));
assert.match(tabOne, /Level 3 is waiting/);

const tabMax = levelsTabHtml(maxed);
assert.ok(!tabMax.includes("data-claim-levels"));
assert.match(tabMax, /Every level is paid\./);
assert.match(tabMax, /Top level/);
assert.ok(!/to level 101/.test(tabMax));
assert.ok(!tabMax.includes("lv-away"), "nothing is ahead of a maxed player");
assert.ok(!tabMax.includes("is-next"));

// House style: no pills, emoji, em dashes or arrows in anything drawn.
for (const html of [tabFresh, tabVet, tabOne, tabMax, readout]) {
  const text = plain(html);
  assert.ok(!EMOJI.test(text), "emoji in " + text.slice(0, 60));
  assert.ok(!BAD_PUNCT.test(text), "dash or arrow in " + text.slice(0, 60));
  assert.ok(!/border-radius:\s*999/.test(html));
}

// Escaping in the deps: a hostile esc is still honoured, names go through it.
const tagged = levelsTabHtml(vx, { esc: (v) => `[${String(v)}]` });
assert.ok(tagged.includes("[Packs opened]"));

// ---- The road ---------------------------------------------------------------------------------------
const stops = roadStops();
assert.ok(stops.every((s, i, all) => i === 0 || all[i - 1].level < s.level), "stops ascend, no duplicates");
for (let lv = 5; lv <= LEVEL_CAP; lv += 5) assert.ok(stops.some((s) => s.level === lv), `level ${lv} is a stop`);
for (const row of MILESTONES.filter((m) => m.kind !== "coins")) {
  assert.ok(stops.find((s) => s.level === row.level)?.tiles.includes(row), `${row.kind} ${row.id} sits on its stop`);
}
for (const s of stops) assert.equal(s.coins, levelCoins(s.level));

const mid = xpOf({ xp: summary(xpForLevel(33) + 10, { claimedLevel: 20 }) });
const road = roadModel(mid);
const hereAt = road.items.findIndex((i) => i.type === "here");
assert.ok(hereAt > 0);
assert.equal(road.items.filter((i) => i.type === "here").length, 1);
const stopLevels = road.items.filter((i) => i.type === "stop").map((i) => i.level);
assert.ok(stopLevels.every((l, i, a) => i === 0 || a[i - 1] < l));
assert.ok(road.items.slice(0, hereAt).filter((i) => i.type === "stop").every((i) => i.done));
assert.ok(road.items.slice(hereAt).filter((i) => i.type === "stop").every((i) => !i.done));
assert.equal(road.items.filter((i) => i.type === "stop" && i.next).length, 1);
assert.equal(road.nextStop.level, 35, "the next unlock above 33 is the Snorlax coin / slabs at 35");
assert.ok(road.items.filter((i) => i.type === "stop" && i.done && !i.paid).every((i) => i.level > 20 && i.waiting));
// Stops behind you are folded to the last three; asking for them all unfolds.
const folded = road.items.find((i) => i.type === "past");
assert.ok(folded && folded.open === false);
assert.equal(road.items.filter((i) => i.type === "stop" && i.done).length, 3);
const open = roadModel(mid, { past: true });
assert.ok(open.items.find((i) => i.type === "past").open);
assert.ok(open.items.filter((i) => i.type === "stop" && i.done).length > 3);
// No stop is repeated, and gap notes never overlap a stop.
for (const model of [road, open]) {
  let at = 1;
  for (const item of model.items) {
    if (item.type === "gap") {
      assert.ok(item.from <= item.to && item.from > at - 0, `gap ${item.from}-${item.to} after ${at}`);
      at = item.to;
    }
    if (item.type === "stop") {
      assert.ok(item.level > at, `stop ${item.level} after ${at}`);
      at = item.level;
    }
  }
}
// Edge cases: level 1 (nothing folded, here first) and the cap.
const r1 = roadModel(fresh);
assert.equal(r1.items[0].type, "here");
assert.ok(r1.items.filter((i) => i.type === "stop").every((i) => !i.done));
const rMax = roadModel(maxed);
assert.equal(rMax.nextStop, null);
assert.equal(rMax.items.at(-1).type, "here", "the marker sits at the end of a finished road");

// ---- Level-up card ---------------------------------------------------------------------------------------
const card = levelUpHtml(up, xpOf({ xp: summary(xpForLevel(7) + 1) }), { gearName });
assert.match(card, /Levels 5 to 7/);
assert.match(card, /Bronze frame/);
assert.match(card, /data-open-levels/);
assert.match(card, /data-levelup-close/);
assert.ok(card.includes(up.text.replace(/&/g, "&amp;")));
const single = levelUpHtml(xpGain(summary(xpForLevel(2) - 1), summary(xpForLevel(2))), xpOf({ xp: summary(xpForLevel(2)) }));
assert.match(single, /<h2>Level 2<\/h2>/);
assert.match(single, /Next unlock at level 3/);
const hostile = levelUpHtml({ ...up, text: "<b>+1 XP</b>" }, mid, {});
assert.ok(!hostile.includes("<b>+1 XP</b>"), "the gain text is escaped");
assert.ok(!EMOJI.test(plain(card)));

// ---- Claim wording ---------------------------------------------------------------------------------------------
assert.equal(claimedText({ levels: [2, 3, 4], coins: 1234, gear: [{ kind: "sleeve", id: "a" }] }), "Levels 2 to 4 paid: ✦ 1,234 and 1 gift.");
assert.equal(claimedText({ levels: [9], coins: 38, gear: [] }), "Level 9 paid: ✦ 38.");
assert.equal(claimedText({}), "Levels paid: ✦ 0.");

console.log("level-ui: all checks passed");
