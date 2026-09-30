# Sun & Moon: Pokémon-GX, TAG TEAM GX, Prism Star

Sheet: `css/holo/sm-gx.css`. Covers `foil-ex sm-gx` (regular-frame GX and the
regular-frame TAG TEAM GX, which rides on `sm-gx`) and `foil-holo sm-prism`
(Prism Star Pokémon, Stadium, Supporter, Energy). `.sm-shiny` (Hidden Fates
shiny GX) belongs to sm-shiny.css and `sm-fa` full arts to sm-fullart.css:
every selector here says `:not(.sm-shiny)` and never matches `sm-fa`.

Assets: `assets/foil/sm-peel.webp` (256 px seamless isotropic facet tile,
white on alpha, light only, ~25 KB) made by `scripts/make_sm_peel.py`, and
the text-safe fallback maps `assets/foil/maps/sm-gx-safe.webp` and
`sm-prism-safe.webp` (per-pixel median of the site's own TCG Live maps of the
layout, `scripts/make_sm_safe_maps.py`; js/sm-foil.js `smSafeMap()` hands one
to a GX or Prism Star Pokémon with no map of its own, so `has-foil-map` is
always set).

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

**Prism Star.** Two layers, split at the strip's top edge (`--p-strip`: 41%
Pokémon, 40.4% Trainer, 52% Energy, measured on the TCG Live maps). `.foil`
is the window only: a colour-dodged stack plus exclusion twin, clipped with
`inset()` so the frame stays black, masked art ∩ map. Trainers and Energy get
a held-back stack (contrast 1.6, saturate 0.75, twin at 60%) because their
art is already saturated and the photos keep it. `.glare` is the rules strip
and the diamond together, from `--p-strip` down: a 300% sunpillar ramp at
150deg blended with `multiply`, `saturate(1.3) brightness(1.22)`, masked
art ∩ map. A multiply cannot lighten, so the strip stays white with black
text, and the pale silver diamond takes the rainbow bars (colour-dodge only
reaches white on silver). No map (base rules): the window is a plain box
(`--p-top`) and the strip and diamond stay matte.

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
- Review 2026-09-30 (an independent reviewer, WebKit): (1) the strip's text
  went neon green because the colour dodge and the exclusion twin covered the
  strip too: dark ink under a dodge or exclusion is recoloured. Strip now
  multiplied (above). (2) Trainer windows were electric blue / pink / green to
  red: held back (above). (3) The peel was inert (at most 12 of 255 levels): it
  sat inside `.glare`, whose hard-light blend and 0.55 opacity cut it. Raised
  to a measured 26 levels at most (p99 16), a flecked sheen, deliberately
  quiet: stronger reads as glitter. (4) No-map alternate-art GX (sm35-10a,
  sm4-63a, sm5-10a) painted the whole card: they are different artworks, not
  stamped prints of sm35-10 / sm4-63 (the "A" mark is the promo logo in the
  footer, outside the foil), so stamp_knockout.py has nothing to cut and the
  plain print's map has the wrong Pokémon. They take the text-safe median
  map instead. (5) `.sm-prism` without a map painted from the card top: it
  now degrades to a box. The GX beam was raised (brightness floor 0.72 to
  0.92, saturate 1.8 to 2.4) to sit nearer the Espeon photo. `.glare` now
  scales with the foil-strength setting too (`.foil::before` and `::after`
  already did, being inside `.foil`).
- Lab cards were found by number, which collides across sets: per-set
  scratch data.

## iPhone blocks on the attack bar (Raichu-GX SM213, Noah 2026-09-30)

Blocky red, blue and magenta patches over the dark-blue attack bar (and a
green fleck in the bright art) on iOS Safari's inspector, at phone size.
**Not reproducible in Playwright WebKit on Linux** (lab, real app, real
inspector with a mouse, corner and out-of-range poses, foil strength 1.5:
all clean), so the cause is inferred, not seen. The GX `.foil` chain was
the only one in the era that drives the layer up to the closing
`contrast(0.8)` cap (brightness up to 1.37, contrast 2.3, saturate 2.4);
the other SM chains top out well below 0.9. A colour dodge divides the dark
ink by 1 minus the layer, so at 0.9 the gain is 10x and a one-step error in
any of the four 8-bit filter stages becomes a 15 to 20 percent colour jump
per channel (a numpy simulation of the chain: worst step 0.16). iOS runs the
filter list stage by stage; Skia on Linux fuses it in floats. Fix: one more
`brightness(0.85)` after the closing `contrast(0.8)` (layer cap 0.765, gain
4.3x, worst simulated step 0.05); the look is a touch calmer, not different.
Lesson: a hot dodge chain on a card with dark ink needs a **lower cap, not
just the closing contrast(0.8)**, and a Linux WebKit render cannot clear an
iPhone-only glitch: ask for a phone screenshot after shipping.

## Verification

Chromium and WebKit (Playwright) at 220 px × 3, poses rest, 30:25, 75:65,
50:78, cards sm5 (GX 13 39 63 90 100 116, Prism 58 62 77 89 120 136), sm8
(GX 17 52 149, Prism 19 154 178 182), sm9 (Tag 1 33 53 113 120, GX 43 67,
Prism 10 51 134 158), sm12 (Tag 22 75 143 156 158 165, GX 4 63), sm1-61.
`foil_coverage.mjs` printed nothing; `dark_specks.py`: no card over budget
(0 specks). Contact sheets: `/mnt/project-files/sun-moon/finish-sheets/gx-tag-prism/`.

## Still off

GX at 75:65 is still less vivid than the Espeon photo's beam and has no big
specular pool on the Pokémon (the Pokémon is knocked out of the foil, as it is
on the real card); the relief is a quiet sheen, not the photo's macro pebbles. Prism Trainer and Energy windows only spot-checked against the map
geometry, no real photo.
