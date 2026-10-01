# Diamond & Pearl finishes, family h3: Shining, Rotom, Arceus AR, Shiny Legendary, Alph Lithograph, secrets

Sheet: css/holo/dp-secret.css. JS: my lines in js/dp-foil.js (`dpPattern`, `dpMap`, `dpEtched`). Asset: assets/foil/dp-cracked-ice-v1.webp
(scripts/make_dp_cracked_ice.py). Photo evidence and the Alph decision: /mnt/project-files/every-era/dp/texture-refs/h3/SOURCES.txt.
Contact sheets: /mnt/project-files/every-era/dp/finish-sheets/h3/ (WebKit and Chromium, phone size, rest / 30:25 / 50:78).

## What the real cards look like, and what the recipe draws
| class | real card | recipe |
|---|---|---|
| `dp-rotom` (RT1-RT6) | cracked-ice shards over everything but the art window | art-minus-window mask, Delaunay shard tile twice (130%, 95%) under the spectrum, colour-dodge, closing contrast(0.8), low rest opacity |
| `dp-shining` (SH1-SH12) | the Platinum reverse's mirror stripes on a shiny-colour card, art window plain | a copy of dp.css's `.dp-rev` recipe keyed on `dp-shining` (keep the two in step) |
| `dp-ar` (AR1-AR9) | cosmos on the art window, ripple rings printed into the body | dp.css cosmos (`dp-holo`) plus a soft 112deg sheen over the body; NO drawn rings |
| `dp-shiny-legend` (SL1-SL11) | cosmos art holo, silver glittery border | dp.css cosmos plus fine screened flecks on the border ring |
| `dp-alph` | stone slab with relief, no rainbow | the scan lit through grayscale soft-light plus warm radial and flecks; `dpEtched` is false |
| secrets (`dp-secret`) | the era's normal cosmos on the window | nothing of its own; dp.css `dp-holo` |

## Lessons
1. **The scans bake the foil in.** Scrydex scans of Rotom show the shards, Arceus the rings, reverses the mirror. Anything drawn on top
   doubles it. Arceus rings drawn over the baked rings made dark bands; the fix was a soft sheen only. Always look at the scan with the
   foil off (`.foil` hidden) before drawing, and draw light, not structure.
2. **Reuse h1's masks.** `dpMap(card)` returns `dpWindow(card)` for Rare Arceus, Rare Shiny Legendary, Rare Rotom and Rare Shining; the
   mask is `--foil-map` (assets/foil/dp-win/<frame>-<layout>.webp, alpha = window). "Everything but the window" is
   `mask-image: var(--art), var(--foil-map)` with `mask-composite: subtract` (WebKit `source-out`), sizes `contain, 100% 100%`; the yellow
   border is cut with `clip-path: inset(1.5% 2.1% 1.4% 2.1%)` like h1. My first pass drew my own window rectangles; they were thrown away.
3. **Rotom ice tile.** A random Delaunay shard tile (facets of different brightness) reads as cracked ice; hairline cracks alias on phones,
   so the facets carry the look and the edges are soft. Needs `brightness(0.5) contrast(1.5) saturate(1.7) contrast(0.8)` on the
   colour-dodge chain or it blows out.
4. **Alph decision.** The Alph Lithograph is a textured stone card, not a rainbow holo (5 clips, 5 uploaders, medium confidence). The
   scaffold's etch tile was a hatch (aliasing risk), so `dpEtched` returns false and the scan's own relief is the texture.
5. **Specificity.** Five `.era-dp` repeats plus `body.fx-holo` three times, like sm.css, or dp.css's rules win.
6. **`.glare::after`/`.foil::before/::after` are reset** for the five classes so dp.css's reverse layers do not leak in.
7. **Blue-pixel heuristic.** The WebKit "blue pixel" check on Shining sh1/sh2 read 106 from a smooth cyan band core, not a speck.
   Lowering the filter brightness made it worse (it raises saturation share). Treat it as a heuristic and look at the render;
   `dark_specks.py` (takes `--out`, not `--out-dir`) is the real black-speck gate.
8. **Evidence limits.** Only clip thumbnails exist for these cards (Pokemon Holo, Card Spinner channels). No macros. Fine pitch is estimated.

## Open issues (honest list)
- SL and AR windows read faint under h1's cosmos at the poses tested (30:25 helps); SL's border reads cream-silver, not silver.
- Stage-layout (evolution circle) cards go through `dpMap` but were checked on few cards.
- (SL border and AR/SL window strength: resolved by the review below.) An independent review has run (rv-h3).

## Tooling notes
- Chromium: `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`; WebKit needs its own browsers path (the g1 agent's pw-webkit). Using the wrong path
  throws at launch, with no sheet written.
- WebKit sheets time out above 2 cards x 3 poses or scale 3; use 2 cards at scale 2.
- A sparse worktree has no assets/cards, so `sweep_finishes.py` shows broken card images; render through the untracked probe set
  (data/dph3.json + assets/cards/dph3, NEVER committed) with `foil_probe.mjs --query "set=dph3&cards=...&proof=off"`.
- Gates run: foil_coverage.mjs (dph3, dp1, dp2, dp3) prints nothing; sweep_finishes.py --check-only exit 0, no duplicate rule in dp-secret.css.

## Review (rv-h3, 2026-10-01): first pass on the REAL pl1-pl4, hgss1-hgss4, col1 and dp7 cards
Sheets: /mnt/project-files/every-era/dp/finish-sheets/h3-review/ (h3r-*.jpg: Chromium and WebKit at 220 px x3, rest / 30:25 / -30:-20 / 50:78, with the
clip frames of the real cards on top). Method: every RT, SH, AR, SL, Alph and secret rendered; each family also rendered with `.foil, .glare` hidden
(`--css`) and the art-window and body mean luminance compared per pose (a measurement, not a feeling).
- **What the scans bake in.** Scrydex scans of Shining and reverse prints already carry the mirror stripes (a bare SH2 body is dark indigo, the real card is
  a light purple with one bright band), Rotom its shards, Arceus its rings, AR9 a metal hatch. The overlay of Rotom and Shining is therefore light by
  design: Shining darkens the body by 5 to 12 levels at rest and 30:25, leaves the art exactly alone, and has FEWER blue pixels than the bare scan in
  WebKit (SH2: 118 bare, 8 to 44 foiled; the old "106" was the scan's own stripe). Nothing to fix; the rest of the darkness is the scan.
- **Found and fixed (css/holo/dp-secret.css ?v=4):**
  1. SL border was invisible. The flecks were screened onto a cream border (screen cannot lighten cream) inside an overlay glare: no change at all
     in the render (border bare vs foiled identical). Real SL border (Entei, Raikou, Rayquaza clips) is silver with fine glitter. Now the SL glare is
     a cool-grey multiply ramp (floor 80%, white-ish at the pointer) with the fleck tile screened into the SAME background (`background-blend-mode: screen`):
     border reads silver, flecks glint, nothing black. First try multiplied the fleck tile alone and blacked the border out: glitter-fine.webp is white
     specks on an OPAQUE BLACK tile, so it only ever goes through screen.
  2. AR and SL windows were half as bright as a plain Rare Holo's at 30:25 (+12 to +18 levels against +28 to +32), because both cut `.glare` to the body or
     the border, taking the window's hot spot away. A pointer pool is back on `.foil` (screen, alpha 0.22) and the cosmos dots light at brightness 1.6;
     now about +25 to +32.
  3. Alph ONE (the light sand card) bleached to white glyph tiles at 30:25 (+22 levels): fleck and glare strengths trimmed (now +16).
  4. scripts/test-dp.mjs had three stale assertions (dp-holo in AR/SL class strings, LV.X map, Alph without the etch tile); it passes again.
- **Checked, fine:** DOM classes of all 66 family cards (each rarity gets its own class; stage cards get `foil-evo` and the stage window, trainers
  `foil-trainer`; no card falls through to the generic engine). Evolution circle on Charmeleon/Charizard 102-103 and Milotic SH7 stays clean of cosmos.
  Promos with `foilAs` and Trainer-Kit cards (hgss1-hsp01, hsp07 Prime, dp2-dpp12 LV.X, dp2-21-theme, dptk3a-4/5): the window holo only or nothing,
  never the whole card. foil_coverage (11 sets) prints nothing; `sweep_finishes --check-only` has no duplicate rule in dp-secret.css; dark_specks: 0 specks
  on RT, AR, SL, SH, secrets, Alph. Settings (foil strength 0.55/1.5, no-shine, classic, no-tilt) on SL, AR, RT, Alph, SH in the lab; the
  real app at iPhone 13 size rips a Platinum Arceus pack and opens AR5 in the inspector (`dp-holo dp-ar has-foil-map lit`).
- **Not fixed / open:** (a) the real Time-Space Distortion (dp2-124) has glitter along its grey border and a denser cosmos than ours; only a trainer-frame
  border fleck is missing (the same glare trick as SL would do it). (b) the Arceus rings in the scans are much heavier than the real card's gloss; they are
  in the pixels. (c) Alph evidence is weaker than SOURCES.txt says: four of the five clips' `max` frames are YouTube placeholders; the hq frames show a
  matte, sleeved card with no rainbow in any of them, which supports "not holo" at low-to-medium confidence, nothing more. (d) the Shining scans' baked stripes
  make the card darker than the real photos at rest. (e) a dp-holo strength change by the h1 review would stack with this review's AR/SL boost; re-measure.
