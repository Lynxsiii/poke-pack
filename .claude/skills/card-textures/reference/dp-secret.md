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
- No independent reviewer has run on this family.

## Tooling notes
- Chromium: `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`; WebKit needs its own browsers path (the g1 agent's pw-webkit). Using the wrong path
  throws at launch, with no sheet written.
- WebKit sheets time out above 2 cards x 3 poses or scale 3; use 2 cards at scale 2.
- A sparse worktree has no assets/cards, so `sweep_finishes.py` shows broken card images; render through the untracked probe set
  (data/dph3.json + assets/cards/dph3, NEVER committed) with `foil_probe.mjs --query "set=dph3&cards=...&proof=off"`.
- Gates run: foil_coverage.mjs (dph3, dp1, dp2, dp3) prints nothing; sweep_finishes.py --check-only exit 0, no duplicate rule in dp-secret.css.
