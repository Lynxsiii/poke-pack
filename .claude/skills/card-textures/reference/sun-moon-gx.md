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

## iPhone blocks on the attack bar (Raichu-GX SM213 and 20/68, Noah 2026-09-30)

Blocky red, black, blue and magenta patches, stair-stepped, over the dark
attack bar and the red ground, on iOS Safari's inspector (two screenshots,
the second after the first fix). **Not reproducible in Playwright WebKit on
Linux** (lab, real app, real inspector at 393x852 DPR 3, pinned and mouse
poses, extreme poses, foil strength 1.5, an injected 5 percent noise layer, a
stage-by-stage 8-bit filter emulation): all clean. So the cause is inferred,
not seen, and "fixed" means "no longer built the way that fails", confirmed
by Noah's phone, not by us.

What the layer was: the shipped chain was brightness up to 1.37, contrast
2.3, saturate 2.4, then the closing contrast(0.8). Rendered on its own it is
near-binary: 63 percent of pixels sit at about 0.09 and most of the rest at
0.77, pure colour plateaus with steep edges, and a colour-dodge divides the
dark ink under it by one minus that (10x at the 0.9 cap). The Pokémon V
recipe, the same structure (3-layer mask, dodge, exclusion twin) with
brightness 0.62 up, contrast 2.2, saturate 1.25, has a max layer near 0.6
and has always looked right on his phone. A `brightness(0.85)` cap (#113)
kept the plateaus, and did not help.

Fix (this sheet, v=5, and js/sm-foil.js `smGxMap`):
- GX chain at V-level gain: brightness 0.64 + 0.45r, contrast 2.1, saturate
  1.35, closing contrast(0.8); the border ring's chain calmed to brightness
  0.95, contrast 1.3, saturate 1.3.
- **The attack bar takes no foil**, as on the real cards (three sources:
  bleedingcool Espeon, YouTube stills of Reshiram & Zekrom and Charizard-GX:
  the navy bar stays dark, the bands stop at its edges). TCG Live's map
  marks it foil, so `scripts/make_sm_gx_maps.py` bakes `<n>-gx-v1.webp` per
  GX / TAG TEAM GX (204 cards, `scripts/list_sm_gx.mjs` lists them): the
  367x512 map smoothed up to the scan's 600x838 (a mask that is never a
  3x-stepped image) times a protect factor of the scan's luminance, 0 at
  luma 0.06 to 1 at 0.20 (floor 0.04). Bar luma is 0.01 to 0.12, art at
  least 0.2. The old map files stay; `foilMap` in the data is unchanged and
  `smGxMap()` renames at draw time. Re-run the script after any GX change.
Lessons: (1) keep a dodged layer's channels off the rails: a recipe whose
filter chain multiplies to more than about 3 (contrast x saturate x 0.8)
makes a near-binary layer, and only the V numbers are proven on an iPhone;
(2) dark print should be protected by the map, which is what the real card
does; (3) a Linux WebKit render cannot clear an iPhone-only glitch: ask for
a phone screenshot and say so.

Texture (texture-refs/gx-v2/findings.md, 3 photographers): a pebble relief
(0.5 to 1 percent of card width, no direction, seen only inside a band or
glare) on Espeon and Solgaleo & Lunala, which `.glare::after`'s peel already
is; one real Raichu & Alolan Raichu TAG TEAM shows fine ruled lines (0.8
percent, one card), not drawn because a line screen aliases at phone size.

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
