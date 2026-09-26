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
css/app.css           all styling, including the classic foil and pack-tear visuals
css/theme.css         design tokens, self-hosted fonts, and the shared component look
css/holo/             the holofoil engine, derived from pokemon-cards-css
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

## Card effects

Two foil engines ship, switched in Settings → Card effects and by a body
class:

- **Holo** (`body.fx-holo`, `css/holo/`) is derived from
  [pokemon-cards-css](https://github.com/simeydotme/pokemon-cards-css). This
  is why the project is GPL-3 — see [NOTICE.md](NOTICE.md).
- **Classic** (`body.fx-classic`, the `.tcg` rules in `css/app.css`) is the
  original per-rarity system. Untouched, and kept because it reads the printed
  holo windows more literally.

Holo uses the upstream glitter and VMAX surface textures from
`assets/foil/reference/`. Double Rares use the star foil in `ex-stars.svg`;
Reshiram and Victini have pearl and red-metal finishes in `finishes.css`.
The older gradients and generated etch maps are restricted to Classic mode.
Holo gets only printed-window geometry from `windows.css`, so the old radial
engraving and glint animation cannot paint over the new materials.
Touch release clears the interaction; reduced-motion mode keeps the light
but removes tilt and spring animation.

The difference that matters is not in the gradients — both use the same family
of counter-tracked bars under `color-dodge`. It is that Holo runs the pointer
through a **damped spring** (`Spring` in `js/app.js`, stiffness 0.066, damping
0.25, matching svelte/motion's integrator) before it reaches the CSS
variables. Reading the pointer straight, which is what Classic does and what
this file used to do everywhere, pins the highlight to the cursor exactly, and
a highlight that cannot lag or overshoot reads as a texture sliding under
glass rather than light moving on foil. The release uses a looser spring
(0.01 / 0.06) so a card drifts home instead of snapping. The overshoot is the
point; it is not a bug to damp out.

Rarity mapping is in the header of `css/holo/rarities.css`. Upstream is built
for Sword & Shield rarity names, so each effect is matched to the printing it
most resembles rather than to a name.

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

## Deep links

`/packs/<set id>` (for example `/packs/me5`) opens the Packs page on that set,
and the address follows along when the player switches sets there. `/packs` and
unknown ids settle on the set that is showing. `/u/<handle>/binder/<n>` opens a
profile scrolled to its shared binder page `n` (the page number the owner sees in
their binder); turning pages updates the address, each page has a Copy link
button, and a link to a page that is no longer displayed falls back to
`/u/<handle>`. Routing lives in `viewFromPath()` and `pathForView()` in
`js/app.js`.

## Current opening flow

The home page lets a signed-in player switch among featured sets and open the
selected set's first wrapper directly. `/packs` keeps every playable expansion
in a compact chooser; the full era list remains in the sidebar. The opening
overlay offers another pack or a direct path to the collection after the spread.
Those actions use the existing `/api/packs/rip` endpoint and save model.

## Sealed product

Packs also sells Booster Boxes (36 packs), Elite Trainer Boxes (9) and Booster
Bundles (6). `SEALED_PRODUCTS` in `js/catalog.js` holds the pack counts, and a
set offers a product only when `data/sealed.json` has a market price for it, so
special sets with no booster box show only ETB and bundle. The price is charged
once. `POST /api/sealed/open` opens every pack on the server and saves them
before responding, then logs each one in `pack_log` with its share of the
price, so quests count a box as 36 packs. The client deals the packs one at a
time and can skip to a summary of every hit. `node scripts/test-sealed.mjs`
runs these rules against the real Worker.

## Shared binder pages

Each binder page has a Display on profile toggle. Basic profiles may display four pages; the backend enforces the limit, validates page indices, and reads only the selected pages from the current saved binder. Removing a card or selling it changes the public display without publishing a copy. Empty pages cannot be newly selected. Existing empty selections remain removable.

`js/profile-pages.js` shares the selection rules. `scripts/test-profile-pages.mjs` exercises the real Worker API against an in-memory SQLite database, including authentication, limits, public visibility, edits and removal. Add `--serve` for a disposable, prepopulated UI preview on port 5174; this does not use production accounts or model credentials.

Card hover motion is in `js/card-motion.js`. Each card settles independently using a critically damped spring, with reduced-motion support. Card display layouts are in `css/card-displays.css`.

## Removing the retired bot roster from production

Deploy this Worker first so the scheduled bot tick is gone. Then apply
`wrangler d1 migrations apply poke-pack --remote` to the production D1 database.
Migration `0009_remove_bots.sql` deletes only users marked `bot = 1`; it removes
their social records explicitly; foreign-key cascades remove sessions, cards and
other core records. It then drops the bot table and marker column. Migration
`0010_quests.sql` creates the quest tables, and `0011_cleanup_orphan_social.sql`
cleans orphaned rows from older installations. The old migrations
remain so a fresh database can replay the full schema history. Remove the unused
`BOT_SECRET` and `NVIDIA_API_KEY` Worker secrets from Cloudflare afterward.
