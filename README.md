# poke-pack.rip

A fan-made Pokémon TCG booster pack simulator. Real printed pull rates, real
card scans, no real money.

Not affiliated with Nintendo, Game Freak, Wizards of the Coast, or
The Pokémon Company.

## Running it

No build step — it is static files and ES modules, so it needs a server only
because modules will not load over `file://`.

```
start.bat            # Windows: serves on http://127.0.0.1:5173
python -m http.server 5173
```

## Layout

```
index.html            markup for every view; views are sections toggled by .hidden
css/app.css           all styling, including the foil/glare and pack-tear visuals
js/app.js             views, rendering, the tear interaction, reveal flow
js/catalog.js         set definitions, rarity tables, sell values, roadmap
js/engine.js          pack generation — slot tables and pull odds
js/state.js           localStorage save, coins, daily bonus, collection
js/achievements.js    achievement table, progress, and claim rewards
js/titles.js          titles, including the ones an achievement hands over
data/<set>.json       card data per set
assets/packs/<set>/   booster wrapper art (avif with png fallback)
scripts/              python builders that generate data/ and crop wrapper art
```

## Brand assets

`py scripts/make_avatar.py` renders the square profile icon into
`assets/avatar.png` (plus a pre-rounded `assets/avatar-round.png`). The card
trio and tagline for each look live in `VARIANTS` at the top of the script;
`--variant neon|classic|warm` picks one and `--all` writes every look to
`scripts/_debug/` to compare. Everything is laid out inside the inscribed
circle, because avatars get cropped round.

`--mark` renders the same trio without the wordmark into `assets/mark.png`,
`icon-180.png` and `icon-32.png` — the tile the header, the account card, the
favicon and the home-screen icon use. The lockup is for places that show it
large; anywhere under about 64px takes the mark, because type that small is
mush and the header says the name in real text beside it anyway.

## Adding a set

1. Build `data/<id>.json` with the scripts in `scripts/`.
2. Add a set object in `js/catalog.js` (slots, odds line, wrappers, hero ids)
   and push it into `PLAYABLE_SETS`.
3. Drop wrapper art into `assets/packs/<id>/` and register it in
   `assets/packs/sources.json`.
4. Remove the set from `ROADMAP` so it does not appear twice in the catalog.
5. Run `py scripts/make_owner_masks.py` if the set has "Trainer's Pokemon"
   cards. It recovers each owner portrait from the scans and writes its foil
   window into `assets/masks/owner/`, stamping `ownerMask` onto the cards that
   use it. `--debug` drops a contact sheet in `scripts/_debug/` to check the
   cuts by eye.

## Pull rates

Odds live in each set's `slots` table in `js/catalog.js`. Pitch Black's are
taken from the TCGplayer Authentication Center sample (~4,000 packs) and a
200,000-pack simulation of `ripPack()` reproduces them within noise:

| Pull | Simulated | Printed |
|---|---|---|
| Double Rare | 1 in 4.7 | 1/5 |
| Ultra Rare | 1 in 12.1 | 1/12 |
| Illustration Rare | 1 in 9.1 | 1/9 |
| Special Illustration Rare | 1 in 81.6 | 1/80 |
| Mega Hyper Rare | 1 in 1,047 | 1/1081 |

Note that `pick()` shares a `used` set across a pack, so a single pack can
never contain a duplicate — a deliberate softening of real pack behaviour.

## Card values

`sellValue()` in `js/catalog.js` prefers a per-card `market` number (USD) from
`data/<set>.json` when one is present, converting at `COINS_PER_USD`. Cards
without a market price fall back to the flat rarity table.

## Achievements

`js/achievements.js` holds the table: each row has a `goal`, an `at(ctx)` that
reads progress out of a save, a coin reward, and sometimes a `title`. The worker
imports the same file, so `POST /api/achievements/claim` recomputes progress
server-side and pays out from the table — the client only names which row to
check. Claimed ids live in `profiles.claimed`, and the award titles at the
bottom of `js/titles.js` unlock by reading that list.

## Known gaps

- Card art is hotlinked from third-party image CDNs.
- The app is a single route — no deep links to a set or the binder.
