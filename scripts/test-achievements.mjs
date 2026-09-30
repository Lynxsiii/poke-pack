// Checks the achievement table (js/achievements.js and js/achievement-*.js) and
// the award titles that ride on it. Run: node scripts/test-achievements.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PLAYABLE_SETS, RARITY_ORDER } from "../js/catalog.js";
import {
  ACH_CATEGORIES,
  ACHIEVEMENTS,
  achievementById,
  achievementContext,
  achievementFace,
  achievementProgress,
  achievementsBySet,
  claimTotal,
  isAchievementDone,
  isSecret,
  masteryRowFor,
  readyToClaim,
} from "../js/achievements.js";
import { AWARD_TITLES, TITLES, isTitleUnlocked, titleContext, masteryTitle } from "../js/titles.js";
import { nameHas, isTagTeamName, SM_FINISHES } from "../js/achievement-kit.js";
import { FINISH_PRINTERS, RARITIES_IN_PRINT, isPrinted } from "../js/achievement-eras.js";
import { halfCoins, masteryCoins } from "../js/achievement-sets.js";
import { eraTotal as setsEraTotal } from "../js/achievement-eras.js";

// The 30 achievements that shipped before the remaster, from
// `git show origin/master:js/achievements.js`: id, goal, coins. Players have
// already claimed and been paid for these, so none may change or disappear.
const LEGACY = [
  ["first-pack", 1, 25], ["ten-packs", 10, 60], ["box-worth", 36, 150], ["century", 100, 300],
  ["marathon", 250, 700], ["case-cracker", 500, 1500], ["first-hit", 1, 40], ["double-up", 1, 40],
  ["reverse", 1, 25], ["ultra", 1, 90], ["illustrator", 1, 110], ["special-art", 1, 260],
  ["hit-stack", 25, 450], ["monochrome", 1, 400], ["gold-chase", 1, 500], ["unique-10", 10, 30],
  ["binder-page", 9, 70], ["unique-50", 50, 120], ["halfway", 50, 200], ["binder-three", 27, 220],
  ["unique-150", 150, 400], ["master-set", 100, 1200], ["double-master", 2, 3000], ["clocked-in", 1, 25],
  ["loaded", 250, 60], ["banked", 1000, 240], ["vaulted", 5000, 900], ["named", 1, 50],
  ["pull-machine", 500, 250], ["conveyor", 2000, 800],
];
const LEGACY_TITLES = {
  "box-worth": "Box Breaker", "case-cracker": "Case Cracker", "special-art": "Artisan", "hit-stack": "Chase Addict",
  monochrome: "Monochrome", "gold-chase": "Goldsmith", "binder-three": "Curator", "unique-150": "Dex Keeper",
  "master-set": "Set Master", "double-master": "Completionist", banked: "High Roller", vaulted: "Vaulted", conveyor: "Conveyor",
};
const INSTANT = new Set(["named", "clocked-in"]);

// ---- ids, fields, house style -------------------------------------------
const ids = ACHIEVEMENTS.map((row) => row.id);
assert.equal(new Set(ids).size, ids.length, "achievement ids must be unique");
for (const [id, goal, coins] of LEGACY) {
  const row = achievementById(id);
  assert.ok(row, `legacy achievement ${id} is missing`);
  assert.equal(row.goal, goal, `${id} goal changed`);
  assert.equal(row.coins, coins, `${id} coins changed`);
  if (LEGACY_TITLES[id]) assert.equal(row.title, LEGACY_TITLES[id], `${id} title changed`);
}
assert.equal(LEGACY.length, 30);

const catIds = new Set(ACH_CATEGORIES.map((cat) => cat.id));
assert.equal(catIds.size, ACH_CATEGORIES.length, "category ids must be unique");
const EMOJI = /\p{Emoji_Presentation}/u;
const BAD_PUNCT = /[—–→←]|->|--/;
for (const row of ACHIEVEMENTS) {
  const at = `row ${row.id}`;
  assert.match(row.id, /^[a-z0-9][a-z0-9-]*$/, `${at}: id shape`);
  assert.ok(catIds.has(row.cat), `${at}: unknown category ${row.cat}`);
  assert.ok(Number.isInteger(row.tier) && row.tier >= 1 && row.tier <= 4, `${at}: tier`);
  for (const key of ["mark", "name", "note"]) assert.ok(typeof row[key] === "string" && row[key].trim(), `${at}: ${key}`);
  assert.ok(row.mark.length <= 5, `${at}: mark "${row.mark}" is too long for a badge`);
  assert.ok(Number.isFinite(row.goal) && row.goal > 0, `${at}: goal`);
  assert.ok(Number.isInteger(row.coins) && row.coins > 0 && row.coins <= 5000, `${at}: coins ${row.coins}`);
  assert.equal(typeof row.at, "function", `${at}: at()`);
  for (const key of ["name", "note", "hint", "mark"]) {
    if (row[key]) {
      assert.ok(!EMOJI.test(row[key]), `${at}: emoji in ${key}`);
      assert.ok(!BAD_PUNCT.test(row[key]), `${at}: em dash or arrow in ${key}: ${row[key]}`);
    }
  }
  if (row.secret) {
    assert.equal(row.secret, true);
    assert.ok(row.hint && row.hint.length >= 8, `${at}: secret needs a hint`);
    assert.ok(!row.hint.toLowerCase().includes(row.name.toLowerCase()), `${at}: hint gives the name away`);
  } else {
    assert.ok(!row.hint, `${at}: only secrets carry a hint`);
  }
}

// ---- contexts: empty, brand new, maxed -----------------------------------
const emptyCtx = achievementContext({}, {});
const newCtx = achievementContext({ coins: 0, collection: {}, claimed: [] }, { signed: false });
const bareCtx = achievementContext(null, null);
for (const row of ACHIEVEMENTS) {
  for (const ctx of [emptyCtx, newCtx, bareCtx]) {
    const at = row.at(ctx);
    assert.ok(Number.isFinite(at), `${row.id}: at() must be finite on an empty context, got ${at}`);
  }
  assert.equal(achievementProgress(row, newCtx).pct, 0, `${row.id} should start at 0% for a new player`);
}
const signedCtx = achievementContext({ coins: 0, collection: {}, lastDaily: 1 }, { signed: true });
const instant = ACHIEVEMENTS.filter((row) => achievementProgress(row, signedCtx).at > 0).map((row) => row.id);
assert.deepEqual(new Set(instant), INSTANT, "only named and clocked-in are instant");
assert.equal(readyToClaim(newCtx, []).length, 0);

// The maxed player owns every card in the catalog and has huge counters.
const cards = [];
const collection = {};
const reverses = {};
for (const set of PLAYABLE_SETS) {
  const list = JSON.parse(readFileSync(new URL(`../${set.dataFile}`, import.meta.url), "utf8"));
  assert.equal(list.length, set.totalCount, `${set.id} totalCount matches its data file`);
  for (const card of list) {
    cards.push({ id: card.id, name: card.name, rarity: card.rarity, setId: set.id });
    collection[card.id] = 30;
    reverses[card.id] = 1;
  }
}
const counters = Object.fromEntries(
  ["sold", "bonus", "sealed", "battles", "battleWins", "questsClaimed", "hitsPulled", "maxDrought", "streak", "streakBest"].map((key) => [key, 1_000_000])
);
const maxedSave = {
  coins: 10_000_000,
  packsOpened: 1_000_000,
  pulls: 1_000_000,
  lastDaily: 1,
  collection,
  reverses,
  binder: Array.from({ length: 360 }, (_, i) => ({ id: cards[i].id, reverse: false })),
  claimed: ACHIEVEMENTS.map((row) => row.id),
  stats: { setPacks: Object.fromEntries(PLAYABLE_SETS.map((set) => [set.id, 1000])), counters, friends: 100 },
};
const maxedCtx = achievementContext(maxedSave, { signed: true, cards });
for (const row of ACHIEVEMENTS) {
  const at = row.at(maxedCtx);
  assert.ok(Number.isFinite(at), `${row.id}: at() must be finite on a maxed context`);
  assert.ok(isAchievementDone(row, maxedCtx), `${row.id} should be done for a player who owns everything (at ${at}, goal ${row.goal})`);
}
// Every finish a set prints has a place in RARITY_ORDER (the binder, best pull and
// "full spectrum" read it) and counts as printed, and a finish held back until
// its sets arrive (FINISH_PRINTERS) is printed by at least one playable set.
{
  const inData = new Set(cards.map((card) => card.rarity));
  for (const rarity of inData) {
    assert.ok(RARITY_ORDER.includes(rarity), `rarity "${rarity}" is in a data file but not in RARITY_ORDER (js/catalog.js)`);
    assert.ok(isPrinted(rarity), `rarity "${rarity}" is printed but FINISH_PRINTERS does not list its sets`);
  }
  for (const rarity of Object.keys(FINISH_PRINTERS)) {
    assert.equal(RARITIES_IN_PRINT.includes(rarity), inData.has(rarity), `${rarity}: FINISH_PRINTERS and the data files disagree`);
  }
  assert.ok(RARITIES_IN_PRINT.every((rarity) => inData.has(rarity)), "full spectrum asks for a rarity no playable card has");
  for (const rarity of SM_FINISHES) assert.ok(RARITY_ORDER.includes(rarity), `${rarity} missing from RARITY_ORDER`);
}

// Sun & Moon: a Tag Team is named by its two Pokémon and ends in -GX.
assert.equal(isTagTeamName("Pheromosa & Buzzwole-GX"), true);
assert.equal(isTagTeamName("Reshiram & Charizard-GX"), true);
assert.equal(isTagTeamName("Buzzwole-GX"), false);
assert.equal(isTagTeamName("Cynthia & Caitlin"), false);
assert.equal(isTagTeamName("Tapu Koko-GX"), false);
assert.equal(isTagTeamName(""), false);
{
  const list = [
    { id: "a-1", name: "Pheromosa & Buzzwole-GX", rarity: "Rare Holo GX" },
    { id: "a-2", name: "Pheromosa & Buzzwole-GX", rarity: "Rare Ultra" },
    { id: "a-3", name: "Buzzwole-GX", rarity: "Rare Holo GX" },
    { id: "a-4", name: "Cynthia & Caitlin", rarity: "Rare Ultra" },
  ];
  const ctx = achievementContext({ collection: { "a-1": 1, "a-2": 1, "a-3": 1, "a-4": 1 } }, { cards: list });
  assert.equal(ctx.tagTeams, 2, "two different Tag Team cards, the Supporter and the plain GX do not count");
  assert.equal(ctx.count("Rare Holo GX"), 2);
  assert.equal(isAchievementDone(achievementById("tag-team"), ctx), true);
  assert.equal(isAchievementDone(achievementById("rare-gx"), ctx), true);
  assert.equal(isAchievementDone(achievementById("tag-team-10"), ctx), false);
  assert.equal(achievementContext({}, {}).tagTeams, 0);
}
// The Sun & Moon era rung ids follow the slug rule and never outgrow the era.
for (const row of ACHIEVEMENTS.filter((r) => r.id.startsWith("era-sun-moon-"))) {
  assert.ok(row.goal <= setsEraTotal("Sun & Moon"), `${row.id} asks for more cards than the era has`);
}

// findCard works as well as cards, and the two agree.
const byId = new Map(cards.map((card) => [card.id, card]));
const viaFind = achievementContext(maxedSave, { signed: true, findCard: (id) => byId.get(id) });
assert.equal(readyToClaim(viaFind, []).length, ACHIEVEMENTS.length);
// Without any card list the name rows quietly stay at zero instead of throwing.
const blind = achievementContext(maxedSave, { signed: true });
assert.equal(blind.has("Pikachu"), false);
assert.equal(blind.countName("Pikachu"), 0);
assert.equal(claimTotal(ids) > 0, true);

// ---- name matching --------------------------------------------------------
assert.equal(nameHas("Mewtwo ex", "Mew"), false);
assert.equal(nameHas("Mew VMAX", "Mew"), true);
assert.equal(nameHas("Team Rocket's Mewtwo ex", "Mewtwo"), true);
assert.equal(nameHas("Lance's Charizard V", "charizard"), true);
assert.equal(nameHas("Mega Charizard X ex", "Mega Charizard X"), true);
assert.equal(nameHas("Ho-Oh V", "Ho-Oh"), true);
assert.equal(nameHas("", "Mew"), false);
{
  const small = achievementContext(
    { collection: { "a-1": 1, "a-2": 1, "a-3": 1 } },
    { cards: [{ id: "a-1", name: "Eevee ex", rarity: "Double Rare" }, { id: "a-2", name: "Eevee V", rarity: "Rare Holo V" }, { id: "a-3", name: "Umbreon ex", rarity: "Double Rare" }] }
  );
  assert.equal(small.countName("eevee"), 2);
  assert.equal(small.countName("Umbreon"), 1);
  assert.equal(small.has("Vaporeon"), false);
  assert.equal(small.species(["Eevee", "Umbreon", "Vaporeon"]), 2);
  assert.equal(small.count("Double Rare"), 2);
  assert.equal(small.raritiesOwned, 2);
}

// ---- sets -----------------------------------------------------------------
const setIds = PLAYABLE_SETS.map((set) => set.id);
assert.equal(new Set(setIds).size, setIds.length);
const titleNames = new Set();
for (const title of TITLES) {
  const key = title.name.toLowerCase();
  assert.ok(!titleNames.has(key), `duplicate title name ${title.name}`);
  titleNames.add(key);
  assert.ok(title.name.length <= 32, `title ${title.name} is longer than the 32 characters the account keeps`);
}
for (const set of PLAYABLE_SETS) {
  const rows = achievementsBySet(set.id);
  assert.equal(rows.length, 2, `${set.id} has a half row and a mastery row`);
  const half = achievementById(`set-${set.id}-half`);
  const master = achievementById(`set-${set.id}-master`);
  assert.ok(half && master, `${set.id} rows`);
  assert.equal(masteryRowFor(set.id), master);
  assert.equal(master.kind, "mastery");
  assert.equal(master.cat, "sets");
  assert.equal(half.cat, "sets");
  assert.equal(half.set, set.id);
  assert.equal(master.set, set.id);
  assert.equal(master.goal, set.totalCount);
  assert.equal(half.goal, Math.ceil(set.totalCount / 2));
  assert.equal(half.coins, Math.round((set.totalCount * 1.5) / 10) * 10);
  assert.equal(master.coins, Math.round((500 + set.totalCount * 5) / 50) * 50);
  assert.equal(half.coins, halfCoins(set.totalCount));
  assert.equal(master.coins, masteryCoins(set.totalCount));
  assert.ok(master.name.startsWith(set.name) && half.name.startsWith(set.name));
  assert.equal(master.title, masteryTitle(set.name));
  const award = AWARD_TITLES.find((row) => row.ach === master.id);
  assert.ok(award, `${set.id} needs an award title`);
  assert.equal(award.name, master.title);
  const claimedCtx = titleContext({ claimed: [master.id] }, { signed: true });
  assert.equal(isTitleUnlocked(master.title, claimedCtx), true, `${master.title} unlocks on claim`);
  assert.equal(isTitleUnlocked(master.title, titleContext({ claimed: [] }, { signed: true })), false, `${master.title} stays locked`);
}
assert.equal(masteryRowFor("nope"), null);
assert.deepEqual(achievementsBySet("nope"), []);
assert.equal(masteryTitle("Pitch Black"), "Pitch Black Master");
assert.equal(masteryTitle("McDonald's Match Battle 2023"), "Match Battle 2023 Master");

// Every award title points at a real row that says so, and vice versa.
for (const award of AWARD_TITLES) {
  const row = achievementById(award.ach);
  assert.ok(row, `award title ${award.name} points at missing achievement ${award.ach}`);
  assert.equal(row.title, award.name, `${award.ach} should name its title ${award.name}`);
}
for (const row of ACHIEVEMENTS) {
  if (row.title) assert.ok(AWARD_TITLES.some((award) => award.ach === row.id && award.name === row.title), `${row.id} promises title ${row.title} that titles.js lacks`);
}

// Set progress: one card short is never done, is 99 percent, and trips "So close".
{
  const set = PLAYABLE_SETS.find((item) => item.id === "sv1");
  const nearly = {};
  for (let i = 1; i < set.totalCount; i += 1) nearly[`sv1-${i}`] = 1;
  const ctx = achievementContext({ collection: nearly }, {});
  assert.equal(ctx.setOwned("sv1"), set.totalCount - 1);
  assert.equal(ctx.setTotal("sv1"), set.totalCount);
  assert.equal(ctx.setPct("sv1"), 99);
  assert.equal(ctx.bestSet, 99);
  assert.equal(ctx.setsDone, 0);
  assert.equal(ctx.setsAlmost, 1);
  assert.equal(isAchievementDone(achievementById("so-close"), ctx), true);
  assert.equal(isAchievementDone(achievementById("master-set"), ctx), false);
  assert.equal(isAchievementDone(masteryRowFor("sv1"), ctx), false);
  assert.equal(isAchievementDone(achievementById("set-sv1-half"), ctx), true);
  nearly[`sv1-${set.totalCount}`] = 1;
  const full = achievementContext({ collection: nearly }, {});
  assert.equal(isAchievementDone(masteryRowFor("sv1"), full), true);
  assert.equal(isAchievementDone(achievementById("master-set"), full), true);
  assert.equal(full.setsDone, 1);
  assert.equal(full.setPct("sv1"), 100);
  assert.equal(full.setPct("nope"), 0);
}
// Sets that share a prefix are not confused: sv1 must not swallow sv10 or sv1x.
{
  const ctx = achievementContext({ collection: { "sv10-1": 1, "sv1-1": 1 } }, {});
  assert.equal(ctx.setOwned("sv1"), 1);
  assert.equal(ctx.setOwned("sv10"), 1);
}

// ---- secrets ---------------------------------------------------------------
const secrets = ACHIEVEMENTS.filter(isSecret);
assert.ok(secrets.length >= 20, `want at least 20 secrets, have ${secrets.length}`);
{
  const row = secrets[0];
  const hidden = achievementFace(row, false);
  assert.equal(hidden.masked, true);
  assert.equal(hidden.name, "???");
  assert.equal(hidden.note, row.hint);
  assert.ok(!JSON.stringify(hidden).includes(row.name));
  const shown = achievementFace(row, true);
  assert.equal(shown.masked, false);
  assert.equal(shown.name, row.name);
  assert.equal(isSecret(achievementById("first-pack")), false);
}

// ---- stats feed the counters, and bad stats are ignored -------------------
{
  const ctx = achievementContext(
    { packsOpened: 12, stats: { counters: { sold: 7, maxDrought: "41", bonus: -3, junk: "x" }, setPacks: { me5: 9, me4: 3 }, friends: 2 } },
    {}
  );
  assert.equal(ctx.stat("sold"), 7);
  assert.equal(ctx.stat("maxDrought"), 41);
  assert.equal(ctx.stat("bonus"), 0);
  assert.equal(ctx.stat("junk"), 0);
  assert.equal(ctx.stat("nothing"), 0);
  assert.equal(ctx.setPacks("me5"), 9);
  assert.equal(ctx.setPacks("sv1"), 0);
  assert.equal(ctx.bestSetPacks, 9);
  assert.equal(ctx.setsRipped, 2);
  assert.equal(ctx.friends, 2);
  assert.equal(isAchievementDone(achievementById("dry-spell"), ctx), true);
  assert.equal(isAchievementDone(achievementById("desert-crossing"), ctx), false);
  assert.equal(isAchievementDone(achievementById("sold-1"), ctx), true);
  assert.equal(isAchievementDone(achievementById("friends-1"), ctx), true);
  assert.equal(isAchievementDone(achievementById("friends-3"), ctx), false);
}

// ---- report ------------------------------------------------------------------
const perCat = new Map();
for (const cat of ACH_CATEGORIES) perCat.set(cat.id, { rows: 0, secret: 0, coins: 0 });
for (const row of ACHIEVEMENTS) {
  const bucket = perCat.get(row.cat);
  bucket.rows += 1;
  bucket.coins += row.coins;
  if (row.secret) bucket.secret += 1;
}
const total = ACHIEVEMENTS.reduce((n, row) => n + row.coins, 0);
console.log("achievement rows by category (rows / secret / coins if all claimed)");
for (const cat of ACH_CATEGORIES) {
  const b = perCat.get(cat.id);
  console.log(`  ${cat.id.padEnd(8)} ${String(b.rows).padStart(4)} ${String(b.secret).padStart(4)} ${String(b.coins).padStart(8)}`);
}
const masteryCoinsTotal = ACHIEVEMENTS.filter((row) => row.kind === "mastery").reduce((n, row) => n + row.coins, 0);
const halfCoinsTotal = ACHIEVEMENTS.filter((row) => row.kind === "half").reduce((n, row) => n + row.coins, 0);
console.log(`total ${ACHIEVEMENTS.length} rows, ${secrets.length} secret, ${PLAYABLE_SETS.length} mastery, coins ${total}`);
console.log(`mastery coins ${masteryCoinsTotal}, halfway coins ${halfCoinsTotal}, award titles ${AWARD_TITLES.length}, rarities ${RARITY_ORDER.length}`);
assert.ok(ACHIEVEMENTS.length >= 250, `want 250+ rows, have ${ACHIEVEMENTS.length}`);
console.log("test-achievements: ok");
