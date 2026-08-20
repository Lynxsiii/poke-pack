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
data/<set>.json       card data per set
assets/packs/<set>/   booster wrapper art (avif with png fallback)
scripts/              python builders that generate data/ and crop wrapper art
```

## Adding a set

1. Build `data/<id>.json` with the scripts in `scripts/`.
2. Add a set object in `js/catalog.js` (slots, odds line, wrappers, hero ids)
   and push it into `PLAYABLE_SETS`.
3. Drop wrapper art into `assets/packs/<id>/` and register it in
   `assets/packs/sources.json`.
4. Remove the set from `ROADMAP` so it does not appear twice in the catalog.

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

## Known gaps

- Progress is localStorage only; export/import from the Account panel is the
  only way to move a save between browsers.
- Card art is hotlinked from third-party image CDNs.
- The app is a single route — no deep links to a set or the binder.
