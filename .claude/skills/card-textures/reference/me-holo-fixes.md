# Mega Evolution holo fixes (agent m1, 2026-10-01)

The independent holo audit (`/mnt/project-files/every-era/audit/holo-report.md`,
ME table) graded three Mega Evolution finishes WRONG: Double Rare (88 cards),
holo Rare (81) and Mega Attack Rare (7). All three were on the old no-map
recipes (`foil-ex` moire hatch, `foil-holo` vertical scanline grating,
`foil-mega-attack` whole-card lavender cast). TCG Live **does** publish maps
for these prints; the first ME probes had used non-holo card numbers.

Rules: `css/holo/me-finishes.css` (new), `css/holo/sv-double-rare.css`
(`era-me` added to its scope), JS: one line in `js/foil-maps.js`
(`era-me` class). Evidence: `/mnt/project-files/every-era/audit/texture-refs/m1/`
(SOURCES.txt). Sheets: `/mnt/project-files/every-era/audit/holo-sheets/m1/`.

## What TCG Live says (malie export v0.1.9.13, `me1 me2 me2-5 me3 me4 me5`)

| Site rarity | TCG Live | Cards | How it is told apart on the site |
|---|---|---|---|
| Rare | `SV_HOLO` / `HOLO` | 81 | `foil-holo foil-svholo` once the map ships (js/app.js already does this) |
| Double Rare, Mega ex and Tera ex | `SV_ULTRA` / `ETCHED`, no cast-and-cure | 50 | ships a foil map **and an etch map**: `has-etch-map` |
| Double Rare, regular-frame ex | `SUN_PILLAR` / `HOLO` + `SouthernCross` stars | 38 | foil map only: `foil-sunpillar cure-stars` |
| Mega Attack Rare | `SV_ULTRA` / `ETCHED` | 7 | foil map + etch map |

The ME Double Rare is therefore **two finishes**. `finish-catalog.md` lists
"Mega ex Double Rares" under SV_ULTRA and that is the half the photos show
(Mega Zeraora, Mega Charizard Y). The etch map is the discriminator: no JS
needed, `.foil-sunpillar.has-etch-map` is a Mega ex, `.foil-sunpillar` alone is
a regular ex. Tera ex Double Rares in ME sets already become `foil-tera` the
moment a map ships (isTeraFoil) and take the same recipe as the Mega ex.

## Maps fetched (`scripts/fetch_foil_maps.py`, rows added to SETS)

Key: site `me1 me2 me3 me4 me5` use their own id; **`me2pt5` is `me2-5`**.
Probed first with real filenames: `me1 003` foil+etch 200, `me1 010` foil 200
(Rare, no etch), `me3 050` foil 200, `me5 027` foil+etch 200, `me2-5 022`.
Only my three rarities were fetched with `--cards` (the other ME rarities keep
their white fallback map and drawn etch; nothing of theirs changed).

| Set | Foil maps | Etch maps (Double Rare Mega/Tera ex, Mega Attack) |
|---|---|---|
| me1 | 22 (10 DR + 12 Rare) | 10 |
| me2 | 20 (10 DR + 10 Rare) | 6 |
| me2pt5 | 71 (39 DR + 25 Rare + 7 MAR) | 26 (19 + 7) |
| me3 | 20 (9 + 11) | 4 |
| me4 | 22 (10 + 12) | 5 |
| me5 | 21 (10 + 11) | 6 |
| total | 176 | 57 |

Names and rarities matched Live card by card (no mismatches). All new files
under `assets/foil/maps/<set>/`, none overwritten (`check_asset_overwrites.py`
ok against the branch point).

## What the real cards look like, and the recipe for each

### Rare (SV_HOLO): nothing to write, the map was the fix
Photos: Meganium 010 (ME01), Gengar 050 (ME03), SSP Togekiss (same foil).
The art window's background and the silver border are foil; Pokémon, frame,
name bar and text box are print. A pale rainbow glare crosses the art window
with a fine glitter, the border sparkles. With the map the shared
`foil-svholo` recipe (celebration.css, `sv-rare-holo.md`) draws exactly that:
smooth gradients, no grating at any pose in WebKit at native pixels. The old
`foil-holo` hatch was a no-map recipe.

### Regular-frame Double Rare (SUN_PILLAR + stars): the SV streaks
No ME photo of one exists yet; TCG Live's foil data equals the SV ex Double
Rare's, so `sv-double-rare.css` (thin sharp rainbow streaks, stars on `.cure`)
now covers `era-me` too (`:is(.era-sv, .era-me)`). `era-me` = ids `me<digit>`
and `me2pt5-`, not `me55` (the 30th keeps celebration.css's own look).

### Mega ex and Tera ex Double Rare (SV_ULTRA etched): `me-finishes.css`
Photos (Mega Zeraora ex 027, Mega Charizard Y ex 022, plus SV Tera ex
Arcanine/Gyarados for the grain): the whole face is foil. A **dense, fine,
multicolour glitter** covers art, frame and text box (the text box is
glittery gold, not milky); under the light broad **saturated rainbow patches**
(pink, green, yellow, blue) sit over the art while the art's own colours
stay saturated. No star shapes (the stars are the cure coat of the other
half).
Recipe: the Tera recipe retuned. `.foil` is the 15deg spectrum colour-dodged
(`brightness(.72) contrast(1.5) saturate(1.3) contrast(.8)`); `::before` two
tilt bars gate where the rainbow shows (black 18%, grey 30%, black 42%);
`::after` glitter (`plus-lighter`); `.glare::after` lights the etch lines;
`.cure` is hidden (`.cure-stars.has-etch-map`). Rest: saturation .5.

### Mega Attack Rare: not a dodge at all
Photos (Mega Dragonite ex 271 in a PSA 10 slab and hand-held, Mega Hawlucha
ex 268): the art keeps **every** colour (cream stays cream, the magenta and
teal swooshes stay), fine glitter densest low on the card, a rainbow shimmer
across the lower third, the blue Japanese attack lettering and the stars
sparkle. First attempt (the SIR recipe on the Live map and etch) bleached the
cream to white and washed the art pastel: colour-dodge onto a light ground
goes to white. The shipped recipe tints with `hard-light` over 50% grey as
`foil-svholo` does: one spectrum band (a 300%-tall grey gradient with a clear
gap, 30% of the card tall, sliding with `--py`) hard-lit onto the print,
cut to the Live map and the etch with a 60% floor, saturate .85; `::before`
screened glitter (glitter.png over flecks, as svholo); a soft overlay glare
with no dark end.

## Lessons

- **Probe a known holo number first.** `me2 010` 404s because it is not a
  holo; the site's own rarity says which numbers to fetch. `me2pt5` is
  `me2-5`.
- **Read `foil.type` per card, not per rarity.** One site rarity (Double
  Rare) was two TCG Live foils; the etch map's presence is the free
  discriminator.
- **Colour-dodge bleaches light grounds** (cream, pale text box). A foil on a
  cream full art tints with hard-light over neutral grey instead.
- **Fetch only the cards you own.** `--cards` limits `--write-data`, which
  would otherwise stamp maps (and delete fields) on every card of the set.
- Every colour-dodged chain ends in `contrast(0.8)` (WebKit divide-by-zero).
- **Sparse worktrees**: `test-mep` and `test-side-sets` need `assets/cards/sets`,
  `assets/cards/me55 mcd* tot*`, `assets/packs/me55 mcd* tot*`, `assets/foil/maps`
  (add them to the sparse set before running).
- `site_cards.mjs` / `foil_probe.mjs` screenshots time out at 30 s when the
  shared machine is at load 30+; the timeout is 240 s now.
- Photos: Playwright cannot reach videos (YouTube wants a sign-in), only
  `i.ytimg.com/vi/<id>/maxresdefault.jpg` thumbnails.

## Verify

```
node .claude/skills/card-textures/scripts/site_cards.mjs --set me2pt5 --ids me2pt5-22,me2pt5-26,me2pt5-6,me2pt5-271,me2pt5-268 --poses rest,30:25,-30:-20,50:78 --w 220 --scale 3 --vw 1500 [--browser webkit]
node .claude/skills/card-textures/scripts/foil_probe.mjs --query "set=me2pt5&cards=22,26,6,271,268&poses=rest,30:25,-30:-20,50:78&w=220&proof=off" --scale 3 --width 1500 [--browser webkit]
BATCH=60 node .claude/skills/card-textures/scripts/foil_coverage.mjs me1 me2 me2pt5 me3 me4 me5
python3 .claude/skills/card-textures/scripts/dark_specks.py --set me2pt5 --cards 22,26,38,6,265,268,269,271
```
Cards: me2pt5 22 Mega Charizard Y ex (Mega ex), 26 Ethan's Ho-Oh ex (regular
ex), 38 Cinderace ex (Tera ex), 6 Erika's Victreebel (Rare), 271 Mega
Dragonite ex and 268 Mega Hawlucha ex (Mega Attack Rare); me1 10 Meganium and
me3 50 Gengar (the photographed Rares); me5 27 Mega Zeraora ex.

## Still off / not verified

- No photo of a regular-frame ME Double Rare; SV evidence stands in.
- Photos are 480x360 to 1280x720 video frames: colour and strength, not
  micro-texture.
- The Mega ex glare multiplies (Tera's, 62% grey far end), so up to about 5%
  of the card is darkened by up to ~63 levels in the far corner at the thumb
  pose; not specks (dark_specks counts 0 to 5), but a softer far end would
  match the "nothing darkens" rule more strictly.
- Rare holo ships the shared SV recipe untouched; the audit's "SV Rare holo:
  band faint except in the thumb pose" applies to it too.
