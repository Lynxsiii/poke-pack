# Sun & Moon: Pokémon-GX, TAG TEAM GX, Prism Star

Sheet: `css/holo/sm-gx.css`. Covers `foil-ex sm-gx` (regular-frame GX and the
regular-frame TAG TEAM GX, which rides on `sm-gx`) and `foil-holo sm-prism`
(Prism Star Pokémon, Stadium, Supporter, Energy). `.sm-shiny` (Hidden Fates
shiny GX) belongs to sm-shiny.css and `sm-fa` full arts to sm-fullart.css:
every selector here says `:not(.sm-shiny)` and never matches `sm-fa`.

Assets: `assets/foil/sm-peel.webp` (256 px seamless isotropic facet tile,
white on alpha, light only, ~25 KB) made by `scripts/make_sm_peel.py`.

## Photos (`/mnt/project-files/sun-moon/texture-refs/gx-tag-prism/`, SOURCES.txt)

Two independent sources (bleedingcool "Holographic History" tilt shots by
one photographer, justinbasil.com texture guide) plus TCG Live maps.
No photo was found of a Prism Star Trainer or Energy; the maps show the same
window + strip + diamond layout, so they follow the Pokémon.

- GX, TAG TEAM GX: the whole face is foil except the Pokémon silhouette
  and the text (black in the TCG Live map). The silver border flashes
  rainbow loudest. A broad rainbow beam rises to the right; a specular
  pool shows a crumpled "orange peel" relief of irregular dimples (about 1%
  of card width, no direction: not a grating). Yellow Tag Team accents stay
  matte. There is no etch map (404 for `_std.etch.png`): the relief is part
  of the foil.
- Prism Star: black frame matte. Foil only in the art window (minus the
  Pokémon), the rules strip, and the big diamond (star cut-out matte). The
  diamond is silver with broad straight rainbow bars at about 60 degrees; the
  window has a wavy gold and rainbow foil. The map also marks the outer
  3.5% rim as foil, the photos show it matte: cut with an inset.

poke-holo.simey.me has NO Sun & Moon GX, Tag Team or Prism recipe (its
cards.json holds three SM commons; its JS only maps rare holo, V, VMAX, VSTAR,
ultra, rainbow, amazing, radiant). A GX renders as a plain card there, so the
benchmark is its sunpillar V/holo, which the GX stack follows.

## Recipes

**GX / TAG TEAM GX.** `.foil` is a colour-dodged stack (sunpillar 0deg pillar
ramp, broad 150deg beam bars, exclusion twin sliding the other way), masked
by art ∩ foil map, with a 40% flat pool floor added back so a map hole
(Pokémon) is not dead. Filter ends in `contrast(0.8)`. `.foil::before` is the
silver border ring: an `evenodd` clip-path polygon (3.4% / 2.4% inset) with
a hotter stack. `.glare` is hard-light at 55% strength, masked art ∩ map ∪
flat floor so text is never washed; `.glare::after` tiles `sm-peel.webp` at
55% width, radial white, light only (this is the orange peel). Tag Team uses
the same recipe: there is no separate `sm-tag` rule (the real card prints
the same foil; only the yellow accents differ, and the map keeps them dark).

**Prism Star.** `.foil` (window + strip) is clipped with `inset()` to the
area above `--p-gate` (51% Pokémon, 52.6% `.foil-trainer`, 64.6%
`.foil-energy`: measured as the strip bottom on the TCG Live maps, tip of
the diamond is at or below) and inset 2.6% / 3.6% from the edge so the black
frame stays matte. `.glare` is the diamond below the gate: a 300% sunpillar
ramp at 150deg blended with `multiply` (colour-dodge on a pale silver scan
only reaches white, multiply tints it like a silver sheet) with
`saturate(1.3) brightness(1.22)`; `.glare::after` adds the peel sparkle.

## Mistakes made and fixed

- First peel tile: dense specks; second: directional specular made diagonal
  worm strands (a grating at phone size). Final: isotropic band-passed height
  peaks, soft-thresholded blobs (`--lo 2.6 --hi 6`).
- Full-card hard-light glare washed text and the Pokémon: glare masked to
  art ∩ map ∪ floor, lower opacity, peel scaled 42% to 55% and lower alpha.
- WebKit ignores gradient-layer mask composites on `.foil` (inset and gate
  strips vanished or leaked) while image-layer mask maps work: the gate and
  ring are `clip-path` (inset / evenodd polygon), which holds in both
  engines. The flat floor and radial pool gradients as `add` layers do work.
- Prism rim: the map says foil, photos say black. Inset, not the map.
- Colour-dodge on the silver diamond: only ever white. Use multiply.
- Lab cards were found by number, which collides across sets: per-set
  scratch data.

## Verification

Chromium and WebKit (Playwright) at 220 px × 3, poses rest, 30:25, 75:65,
50:78, cards sm5 (GX 13 39 63 90 100 116, Prism 58 62 77 89 120 136), sm8
(GX 17 52 149, Prism 19 154 178 182), sm9 (Tag 1 33 53 113 120, GX 43 67,
Prism 10 51 134 158), sm12 (Tag 22 75 143 156 158 165, GX 4 63), sm1-61.
`foil_coverage.mjs` printed nothing; `dark_specks.py`: no card over budget
(0 specks). Contact sheets: `/mnt/project-files/sun-moon/finish-sheets/gx-tag-prism/`.

## Still off

GX at 75:65 is paler than the photo's vivid beam and has no big specular
pool on the Pokémon (the Pokémon is knocked out of the foil, as it is on the
real card). Prism Trainer and Energy windows only spot-checked against the map
geometry, no real photo.
