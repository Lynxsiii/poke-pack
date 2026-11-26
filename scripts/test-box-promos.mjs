// Booster sets and extras. A set is what comes out of its booster packs: its dex, totalCount, completion and mastery
// count pack cards only. Box promos (stamped and cosmos prints from its blisters and boxes) are listed and counted on
// their own, black star promos sit in their era's binder, and the extras (promo binders, Happy Meal, Trick or Trade,
// POP Series, Trainer Kits, fixed decks) have a collection page and no mastery.
// Run: node scripts/test-box-promos.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PLAYABLE_SETS, SET_CATEGORIES, boxPromoCards, dataSetsOf, foldKits, homeCards, isBoosterSet, isExtraSet, kitHalfName, kitHalves, kitName, setCategory } from "../js/catalog.js";
import { homeSetId, isBoxPromoId, promoHomeOf, PROMO_HOMES } from "../js/card-home.js";
import { ownedBoxPromos, ownedPerSet } from "../js/titles.js";
import { ACHIEVEMENTS, RETIRED_ACHIEVEMENTS, achievementById, achievementContext, achievementsFor, isAchievementDone, isRetired, masteryRowFor, readyToClaim } from "../js/achievements.js";
import { boosterSetsInEra, CROWN_ERAS, eraSlug, SET_INFO } from "../js/achievement-eras.js";

const root = new URL("../", import.meta.url);
const cache = new Map();
const load = (set) => {
  if (!cache.has(set.id)) {
    const data = JSON.parse(readFileSync(new URL(set.dataFile, root), "utf8"));
    cache.set(set.id, Array.isArray(data) ? data : data.cards || []);
  }
  return cache.get(set.id);
};
const listsOf = (set) => dataSetsOf(set).map(load);

// ---- categories ---------------------------------------------------------------------------
const byCat = Object.fromEntries(SET_CATEGORIES.map((cat) => [cat.id, PLAYABLE_SETS.filter((set) => setCategory(set) === cat.id)]));
assert.deepEqual(SET_CATEGORIES.map((cat) => cat.id), ["booster", "promos", "special", "decks"]);
assert.equal(Object.values(byCat).reduce((n, list) => n + list.length, 0), PLAYABLE_SETS.length, "every set has exactly one category");
for (const set of byCat.promos) assert.ok(set.promoSet && set.id in PROMO_HOMES, `${set.id} is a black star binder`);
for (const set of byCat.special) assert.match(set.id, /^(mcd|tot|pop)\d/, `${set.id} is a Happy Meal, Trick or Trade or POP pack`);
for (const set of byCat.decks) assert.ok(set.promoSet && !set.wrappers.length, `${set.id} is one box of fixed cards`);
for (const set of byCat.booster) {
  assert.ok(!set.promoSet && set.wrappers.length > 0 && set.packSize > 0, `${set.id} is a booster set: it has a pack to open`);
  assert.ok(isBoosterSet(set) && !isExtraSet(set));
}
// Every black star binder reads the sets' files too, and its own.
for (const set of byCat.promos) if (set.id !== "bp") assert.ok(set.viewOf?.length > 1, `${set.id} is a view over its era's files`);

// ---- the id test matches the data: a booster set's `promo` cards are black stars or box promos, nothing else ----------
let boxTotal = 0;
let boxSets = 0;
for (const set of PLAYABLE_SETS) {
  if (!set.dataFile) continue;
  for (const card of load(set)) {
    const star = Boolean(promoHomeOf(card.id));
    const box = isBoxPromoId(card.id);
    assert.ok(!(star && box), `${card.id} is a black star or a box promo, not both`);
    if (isBoosterSet(set)) {
      if (!star) assert.equal(box, Boolean(card.promo), `${card.id}: isBoxPromoId must match its promo flag (add its suffix to BOX_PROMO_SUFFIX in js/card-home.js)`);
      else assert.ok(card.promo, `${card.id} is a promo`);
    } else {
      assert.ok(!box, `${card.id} is an extra's own card, not a box promo`);
    }
  }
}

// ---- totals: a set is its pack cards ----------------------------------------------------------------
for (const set of PLAYABLE_SETS) {
  const lists = listsOf(set);
  const dex = homeCards(set, lists);
  const box = boxPromoCards(set, lists);
  assert.equal(dex.length, set.totalCount, `${set.id} totalCount is its dex`);
  assert.ok(dex.every((card) => !isBoxPromoId(card.id)), `${set.id} dex holds no box promo`);
  assert.ok(box.every((card) => card.promo && homeSetId(card.id) === set.id), `${set.id} box promos are its own`);
  if (isBoosterSet(set)) assert.ok(dex.every((card) => !card.promo), `${set.id} dex is pack cards only`);
  else assert.equal(box.length, 0, `${set.id} has no box promos`);
  assert.equal(new Set([...dex, ...box].map((card) => card.id)).size, dex.length + box.length);
  boxTotal += box.length;
  if (box.length) boxSets += 1;
}
assert.ok(boxTotal >= 160, `box promos are listed (${boxTotal})`);
const me1 = PLAYABLE_SETS.find((set) => set.id === "me1");
assert.equal(me1.totalCount, 188, "Mega Evolution is its 188 pack cards");
assert.equal(boxPromoCards(me1, listsOf(me1)).length, 14, "and 14 box promos on the side");

// ---- counting: box promos never count toward the set -----------------------------------------------
{
  const dex = homeCards(me1, listsOf(me1));
  const box = boxPromoCards(me1, listsOf(me1));
  const owned = Object.fromEntries(dex.map((card) => [card.id, 1]));
  let ctx = achievementContext({ collection: owned }, {});
  assert.equal(ctx.setOwned("me1"), 188);
  assert.equal(isAchievementDone(masteryRowFor("me1"), ctx), true, "every pack card masters the set, with no box promo owned");
  assert.equal(ctx.extrasOwned, 0);
  assert.equal(ctx.setsDone, 1);
  // Owning only the promos is no progress on the set.
  const promosOnly = Object.fromEntries(box.map((card) => [card.id, 2]));
  ctx = achievementContext({ collection: promosOnly }, {});
  assert.equal(ctx.setOwned("me1"), 0);
  assert.equal(ownedPerSet(promosOnly).get("me1") || 0, 0);
  assert.equal(ownedBoxPromos(promosOnly).get("me1"), 14);
  assert.equal(ctx.extrasOwned, 14, "box promos count on the extras ladder");
  assert.equal(ctx.eraOwned("Mega Evolution"), 14, "and are still cards of their era");
  assert.equal(ctx.setsStarted, 1);
  assert.equal(isAchievementDone(achievementById("promo-pile"), ctx), true);
  assert.equal(isAchievementDone(achievementById("star-collector"), ctx), false);
}
// A black star promo filed in a set's file is the binder's card in every era.
for (const [id, home] of [["sv8-svp151", "svp"], ["zsv10pt5-svp209-pc", "svp"], ["swsh12-swshp269", "swshp"], ["cel25-swshp130", "swshp"], ["sm115-smp103a", "smp"], ["det1-smp170", "smp"], ["me5-mep055", "mep"], ["svp-svp056", "svp"]]) {
  assert.equal(homeSetId(id), home, `${id} is counted under ${home}`);
  assert.equal(isBoxPromoId(id), false);
}
for (const id of ["me1-133", "sv3pt5-cosmos-metal", "sv6pt5-energy-metal", "sv8pt5-1-pb", "me55-cc11g", "swsh12-TG01", "xytk7a-30", "mcd19-6"]) assert.equal(isBoxPromoId(id), false, `${id} is not a box promo`);

// ---- mastery: booster sets only ---------------------------------------------------------------------
const liveMasters = ACHIEVEMENTS.filter((row) => row.kind === "mastery");
assert.deepEqual(liveMasters.map((row) => row.set), byCat.booster.map((set) => set.id), "one live mastery per booster set");
assert.equal(RETIRED_ACHIEVEMENTS.length, (PLAYABLE_SETS.length - byCat.booster.length) * 2, "the extras' half and mastery rows are retired");
for (const row of RETIRED_ACHIEVEMENTS) {
  assert.ok(isRetired(row) && !ACHIEVEMENTS.includes(row));
  assert.equal(achievementById(row.id), row, `${row.id} is still found by id (XP, titles and seals of whoever claimed it)`);
}
{
  // A whole Trainer Kit in the binder: nothing to claim from it, and it is not "a set" in any count.
  const kit = PLAYABLE_SETS.find((set) => set.id === "xytk7a");
  const owned = Object.fromEntries(homeCards(kit, listsOf(kit)).map((card) => [card.id, 1]));
  const ctx = achievementContext({ collection: owned }, {});
  assert.equal(ctx.setOwned("xytk7a"), kit.totalCount);
  assert.equal(isAchievementDone(masteryRowFor("xytk7a"), ctx), false);
  assert.ok(!readyToClaim(ctx, []).some((id) => /^set-xytk7a-/.test(id)));
  assert.equal(ctx.setsDone, 0);
  assert.equal(ctx.setsHalf, 0);
  assert.equal(ctx.bestSet, 0, "a kit is not the best set");
  assert.equal(ctx.extrasOwned, kit.totalCount, "its cards climb the extras ladder");
  // Claimed before the change: the wall still shows it, and only then.
  assert.equal(achievementsFor([]).length, ACHIEVEMENTS.length);
  assert.equal(achievementsFor(["set-xytk7a-master"]).length, ACHIEVEMENTS.length + 1);
}
// Crowns ask for the era's booster sets.
for (const era of CROWN_ERAS) {
  const row = achievementById(`era-${eraSlug(era)}-crown`);
  assert.equal(row.goal, boosterSetsInEra(era).length, `${era} crown`);
  const owned = {};
  for (const set of boosterSetsInEra(era)) for (const card of homeCards(set, listsOf(set))) owned[card.id] = 1;
  assert.equal(isAchievementDone(row, achievementContext({ collection: owned }, {})), true, `${era}: every booster set mastered wins the crown with no extra owned`);
}
assert.equal(achievementById("era-xy-crown").goal, 14);
assert.equal(achievementById("sets-done-all").goal, byCat.booster.length);
assert.ok([...SET_INFO.values()].every((info) => info.booster === (info.category === "booster")));
for (const id of ["extras-100", "extras-300"]) assert.ok(ACHIEVEMENTS.some((row) => row.id === id), `${id} is on the extras ladder`);

// ---- a Trainer Kit is one box: its two half-deck sets pair up, and lists show it once ------------------------
{
  const kits = byCat.decks.filter((set) => kitHalves(set));
  assert.equal(kits.length, 18, "nine kits, two half decks each");
  for (const set of kits) {
    const halves = kitHalves(set);
    assert.equal(halves.length, 2);
    assert.ok(halves.includes(set) && halves[0].id.endsWith("a") && halves[1].id.endsWith("b"));
    assert.equal(halves[0].released, halves[1].released, `${set.id}: both halves are one release`);
    assert.equal(kitName(halves[0]), kitName(halves[1]));
    assert.match(kitName(set), /Trainer Kit: .+ & .+/);
    assert.ok(kitHalfName(set) && !/Kit/.test(kitHalfName(set)), `${set.id} half is named for its Pokémon`);
  }
  for (const set of PLAYABLE_SETS) if (!byCat.decks.includes(set)) assert.equal(kitHalves(set), null, `${set.id} is not a kit half`);
  assert.equal(kitHalves(PLAYABLE_SETS.find((set) => set.id === "xy0")), null);
  assert.equal(foldKits(byCat.decks).length, 11, "nine kits and two fixed decks");
  assert.equal(foldKits(byCat.booster).length, byCat.booster.length);
  assert.equal(kitName(PLAYABLE_SETS.find((set) => set.id === "xytk7b")), "XY Trainer Kit: Bisharp & Wigglytuff");
}

console.log(`Box promo checks passed: ${byCat.booster.length} booster sets, ${byCat.promos.length} promo binders, ${byCat.special.length} special packs, ${byCat.decks.length} decks and kits; ${boxTotal} box promos on ${boxSets} sets, none counted toward a set; ${RETIRED_ACHIEVEMENTS.length} retired rows.`);
