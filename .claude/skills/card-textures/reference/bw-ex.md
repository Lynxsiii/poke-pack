# Black & White: Pokémon-EX (regular art) and Ace Spec

Sheet: `css/holo/bw-ex.css`. Classes from `bwPattern` (js/bw-foil.js): `foil-ex bw-ex` (Rare Holo EX,
Next Destinies on, Team Plasma EX included: Plasma Storm's Lugia-EX looks like any other EX apart from the
frame) and `foil-holo bw-ace` (Rare ACE, bw7 on). Full art EX, gold and shiny secrets and the Radiant Collection
(RC11 is `bw-ex bw-rc`, f3/g3's) are never matched here: every rule is `:is(.bw-ex:not(.bw-rc), .bw-ace)`.
The holo rare and reverses are g1's.

Assets of its own: `assets/foil/bw-brush-v1.webp` (512x512 white-with-alpha brushed streak tile,
`scripts/make_bw_brush.py`, 74 KB), `assets/foil/maps/bw-ex-safe.webp` and `bw-ace-safe.webp` (per-pixel median
of the 56 EX and 13 Ace maps, `scripts/make_bw_ex_safe_maps.py`, about 40 and 33 KB), wired through
`bwExSafeMap()` in js/bw-foil.js for a print TCG Live has no map for (a later reprint, a promo). Every EX and Ace
Spec print of bw4-bw11 has its own TCG Live map (key = set id, 367x512 luminance, white = foil, no etch maps), so
the sheet is built on those maps. RC11 has none (g3).

## What the real cards do (`/mnt/project-files/every-era/bw/texture-refs/g2-ex-ace/`, SOURCES.txt)

Two independent photographers (Bleeding Cool "Holographic History", iPhone stills; the "Pokemon Holo" YouTube
channel, hand-held tilt clips via YouTube's own thumbnail frames) and a third low-resolution clip (1gizmorox),
plus Bulbapedia's set pages for the plain-words description. No macro photo of either foil exists (four search
passes; Reddit, eBay, Bulbapedia and PSA return 403 here), so grain size is a judgement from phone-scale frames.

- Pokémon-EX: "part of the artwork, the rule box and the card border were holofoil, the whole card glossy"
  (Bulbapedia, Next Destinies). Photos: tall narrow rainbow prism bars (green, yellow, magenta, cyan) flash on
  the frame, the name tab, the rule box and the art ground behind the Pokémon (Chandelure-EX 77/113, Victini-EX
  24/113, Team Plasma Lugia-EX BW83 are the clearest), plus fine gold dust over the dark art. The Pokémon itself,
  the attack text box and the printed text are matte. The map agrees: ground, frame ring and rule box are white,
  the silhouette and text box black, and the "EX" logo is white (it is foil on the real card).
- Ace Spec: "holofoil on the card border, the name strip, the ACE SPEC text, the ACE SPEC game rule box and the
  background of the artwork" (Bulbapedia, Boundaries Crossed). Photos (Computer Search, G Booster, G Scope, Master
  Ball, Scramble Switch): fine horizontal brushed lines ("tinsel") on the border all round, the name strip, the
  lettering and the art ground, colour going saturated blue, magenta or green where the light falls; the object,
  the grey brushed-metal text box and the TRAINER bar matte. The map agrees to the pixel.

## What the recipe does

- EX `.foil`: a pearl screen (115deg band at alpha 0.22, plus a radial pool at 0.14) so the frame and ground
  glow even at rest. `::before` is the prism bars: a hard-edged `repeating-linear-gradient(90deg, hues, period
  13.2%)` gated by two moving lobe masks (mask-size 200% and 260%, positions driven by `--background-x` in opposite
  directions, all within 0-100%), screen, `saturate(1.1) brightness(0.88)`, opacity 0.6 + a little by
  `--pointer-from-center`. `::after` is `glitter-fine.webp` at 62% size, screen, `brightness(1.3) contrast(1.7)`:
  light only, nothing dark. `.glare` is a radial overlay at 0.32 of the card opacity. Rest: only `.foil` (opacity
  0.18). The foil map cuts all of it, so the Pokémon and the text box stay matte.
- Ace `.foil`: `--ba-ramp` (repeating hue ramp, blue 212 to violet 262 to magenta 318 to amber 42 to green 150
  to cyan 190, period 20%) slid vertically by `--background-y`, colour-dodged through
  `brightness(0.55) contrast(1.5) saturate(1.2) contrast(0.8)`. `::before` is the same ramp through the brush tile
  (the streaks, bright, not periodic: rows 1-4 px tall with random lengths, so no line screen on a phone).
  `::after` is a pale violet radial pool through a second brush, sliding the other way, screen (light only).
  The art ground is already saturated pink, red or blue, which a colour dodge cannot lift, so the lines on the
  art are laid as light on the varnish: `.bw-ace.has-foil-map .glare::after` is the brush in white (brightest at
  the lamp) cut to the foil map, with `.glare` itself keeping its overlay at card-opacity (its gradient alphas
  carry the old 0.35 so the stack does not multiply the streaks away).
- Safe maps: median of the shipped maps, so an unmapped EX or Ace never paints over its rules text.

## Mistakes and fixes (this build)

- First renders had foil over the whole card incl. text: the lab's site copy had no shipped map (404 on
  `assets/foil/maps/<set>/<n>.webp`). Maps must exist before judging a render.
- An earlier `.glare::after` tinsel was invisible: opacity 0.22 times the `.glare` 0.35, and an overlay of white
  on saturated pink moves little. Fixed by moving the 0.35 into the `.glare` gradient and using opacity 1 on the
  pseudo. Bisect with `--css` hiding layers (the reference method), not by guessing.
- The EX logo and gold name tab wash out when bars sit at full strength (the logo is foil in the map): bar
  opacity and brightness lowered. Still the weakest read, see below.
- A first brush tile was a periodic grating; replaced by random-length streaks. `etch_metrics.py` calls it
  directional (lb 299, ori 1.00) because it is directional by design: the render, not the metric, is the verdict.
- Probe timeouts under a load average of 25 to 40: the local `foil_probe.mjs` timeouts are lengthened (not
  committed). Merging a builder branch removes tracked files outside the sparse set from disk; add the asset
  dirs of the branch (never a whole `ls-tree`, that checked out 2.4 GB) before the merge.

## Verification

Chromium and WebKit (webkit-2215) at 220 px wide, 3x, poses rest, 30:25, 75:65, 50:78. Sheets in
`/mnt/project-files/every-era/bw/finish-sheets/g2-ex-ace/` (every EX and Ace Spec of bw4-bw11 in Chromium,
bw10 and bw8 in WebKit). `foil_coverage.mjs` (BATCH=60, bw4-bw11) prints nothing. `sweep_finishes.py` for bw4,
bw7, bw10: dark specks within budget; it exits 1 for g1's window-holo promos with no map (bw4-bwp033, bw10-bwp085,
bwp086, bwp099) and a shared `assets/packs/sources.json` change, neither mine. WebKit shows no pinned-channel
blocks over the ink (the dodge chains end in `contrast(0.8)`).

## Still off

- The "EX" logo is foil on the real card, so the recipe washes it with the bars at some tilts (Kyogre, Raikou,
  Groudon). Legible at rest and in most poses, but paler than the real glossy logo.
- Ace art ground: the lines are subtler than in the best photos at flat tilts; they read from about 30:25 on.
- No Dowsing Machine, Rock Guard or Life Dew photo exists; Ace Spec is one stock and the maps agree.
- Foil-strength 0.55 and 1.5 move the stack only a little (the opacity formula caps the variation).

## Benchmark

No benchmark: the simey reference has no Black & White EX or Ace Spec recipe, so the judgement is against the
photos above only.
