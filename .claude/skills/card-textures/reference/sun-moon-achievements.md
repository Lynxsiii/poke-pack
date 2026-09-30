# Sun & Moon in quests, achievements and set mastery

Added 2026-09-30 on `sm-int/ach`. The system (PR #105: `js/achievement-*.js`,
`js/achievements.js`, `js/mastery.js`, `js/titles.js`, `worker/stats.js`, `js/quests.js`)
reads the catalog, so most of the era needs no edit. What was added is the part that is
era specific in Sword & Shield: the ladder, the finishes, a few Pokedex rows and the
"every finish" secret. Nothing shipped changed: no id renamed, no goal or coin value of
an existing row touched (only `era-all` was renamed "Every era", the goal already followed
`ERA_NAMES`, and the `rare-ultra` note now names both eras).

## Finish registry (js/catalog.js)

`Rare Holo GX`, `Rare Prism Star`, `Rare Shining` and `Rare Shiny GX` were in the engine's
`HIT_RARITIES` but nowhere else, so a GX ranked below a Common in best-pull lookups and the
binder filter. They are now in `RARITY_ORDER`, `RARITY_LABEL`, `RARITY_MARK` and
`SELL_VALUE` (fallback only; medians of the real prices). Tag Team is a subtype, not a
rarity: a Tag Team is `Rare Holo GX`, `Rare Ultra`, `Rare Rainbow` or `Rare Secret`.

`scripts/test-achievements.mjs` fails if any data file carries a rarity that is not in
`RARITY_ORDER`, so a new finish cannot be forgotten.

## Rows that wait for their sets

`js/achievement-eras.js` has `hasSets(...ids)`, `anySets(...ids)` and `FINISH_PRINTERS`
(`Rare Prism Star` from sm5 sm6 sm7 sm75 sm8 sm9, `Rare Shining` from sm35,
`Rare Shiny GX` from sm115). A row whose cards only some sets print exists only when those
sets are in `PLAYABLE_SETS`, and `RARITIES_IN_PRINT` (what "Full spectrum" and the finish
count read) leaves out finishes nobody prints yet. That keeps the maxed-player test green
while the sets land one at a time, and the rows appear by themselves.

The gates were checked against the card data of every builder branch (sm1 to sm12, det1,
mcd17 to mcd19). If a gate set is renamed, update the id in the row and
`FINISH_PRINTERS`.

## What was added

| Where | Rows | Appears when |
| --- | --- | --- |
| `achievement-sets.js` `ERA_LADDERS["Sun & Moon"]` | `era-sun-moon-250` Alola bound (100), `-1000` Alola regular (400), `-2000` Alola local (1100) | the era's playable total reaches the goal (250 now, all three once about 2,000 cards are in) |
| `achievement-sets.js` | `sets-started-50` (2000), `sets-started-60` (2500) | the catalog has that many sets |
| `achievement-misc.js` finishes | `rare-gx` GX (50), `tag-team` (120) | now |
| | `prism-star` (200) | any of sm5 sm6 sm7 sm75 sm8 sm9 |
| | `rare-shining` (250) | sm35 |
| | `shiny-gx` (350) | sm115 |
| `achievement-misc.js` depth | `gx-25` (300), `tag-team-10` (250), `tag-team-25` (600) | now |
| | `gx-75` (800) | sm1 sm2 sm3 sm8 |
| | `tag-team-75` (1500) | sm9 sm12 |
| | `prism-10` (500) | sm5 sm6 |
| | `shiny-gx-10` (400) | sm115 |
| | `finishes-35` (3200) | 35 finishes in print (all of Sun & Moon) |
| `achievement-secrets.js` | `alola-sweep` (2000): every Sun & Moon finish (Rare Holo, GX, Prism Star, Shining, Shiny, Shiny GX, Ultra, Rainbow, Secret) | every one of them is printed by a playable set |
| `achievement-dex.js` | `ultra-beast-6` Beast hunter (200) | now |
| | `ultra-beast-all` Beast keeper (600, all 12) | sm4 |
| | `alolan-40` Alola native (300) | sm2 sm4 sm9 sm11 |
| | `alola-finals` (120), `alola-lines` (350) | sm1 |
| | `shining-six` (400) | sm35 |

With the catalog as it is today (sm10, sm11): 7 new rows, 1,620 coins. With every Sun & Moon
set in: 25 new rows, 18,590 coins, plus two rows per set (halfway and mastery, below).

Tag Team has no rarity, so `achievementContext` gained `tagTeams`: the number of different
owned cards whose name matches `isTagTeamName` (two names and `-GX`: "Pheromosa &
Buzzwole-GX"). The Worker only knows id, name and rarity, so the name is the test. It
matches 111 of the 121 Tag Team prints in the data; the 10 it skips are Cosmic Eclipse's
Tag Team Supporters ("Red & Blue"), which carry no GX. `LEGEND_GROUPS`, `CAST` and the other
lists behind a shipped goal are untouched; the Ultra Beasts and the Shining six are their
own lists.

## Data driven, nothing to do

Per playable set, from `PLAYABLE_SETS`: `set-<id>-half` and `set-<id>-master` (coins by
`halfCoins` / `masteryCoins`), the `master-<id>` award title (`"<name> Master"`), the
mastery banner `mastery:<id>`, the emblem and the account-page shelf. Era totals, the era
ladder rungs, "Time traveler", "Every era", sets started / halfway / done, "Grand tour" and
"Every last set". `McDonald's` and `Black Star` rows (Happy meal, Happy ending, Black star,
Promo pile, Star collector) read `edition` and `promoSet`, so mcd17 to mcd19 (edition
"McDonald's") and smp (`promoSet`) join them. Quests and `worker/stats.js` never look at a
set or an era: hits are `isHit` from the engine, which already lists the Sun & Moon finishes.

## Touch list when a set arrives

Nothing in js/achievement-*.js. Per set, the builder already does these, and the tests
enforce them:

1. `js/set-accents.js`, `data/set-accents.json` and the OVERRIDES in
   `scripts/make_set_accents.py` need a pair for the set (`test-mastery.mjs` requires
   exactly the playable sets, with contrast on the dark page and two distinct colours).
2. `totalCount` = length of the data file, promo cards included
   (`test-achievements.mjs`).
3. `era: "Sun & Moon"` on the set, `edition: "Sun & Moon"` (mcd17 to mcd19: edition
   "McDonald's", era "Sun & Moon"; smp: `promoSet: true`).
4. The name must fit "<name> Master" in 32 characters (a McDonald's brand is dropped
   first). The test now fails on a name that would be cut mid-word: call the promo set
   "SM Black Star Promos" (like "SWSH Black Star Promos"), not "Sun & Moon Black Star
   Promos". mcd17 to mcd19 land as "Collection 2017 Master" and so on.
5. A new finish rarity goes into `RARITY_ORDER` / `RARITY_LABEL` / `RARITY_MARK` /
   `SELL_VALUE`, and into `FINISH_PRINTERS` if only some sets print it.

Sets that change a gate above: sm1, sm2, sm3, sm4, sm5, sm6, sm7, sm75, sm8, sm9, sm12,
sm35, sm115 (listed in the table). sm10, sm11, det1, smp, mcd17 to mcd19 gate nothing.

## Things to know

- `Rare Shiny` is the Shiny Vault of both Shining Fates and Hidden Fates, so the old
  `shiny-vault` row covers both; only the GX half has a row of its own.
- Prism Stars include Trainers and Energy ("Cyrus ◇", "Super Boost Energy ◇"); they count
  as `Rare Prism Star` whatever they are.
- Before sm5 lands nothing asks for a Prism Star; once it lands `prism-star` and the
  `Rare Prism Star` slot in "Full spectrum" appear together. A player who already holds
  the unclaimed "Full spectrum" sees its goal grow by one for each of those finishes, as it did
  when earlier eras were added; a claimed row stays claimed.
