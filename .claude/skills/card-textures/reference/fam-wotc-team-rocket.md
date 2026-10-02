<!-- Family note for the holo family wotc-team-rocket (older-era holo remaster, 2026-10-02). Research: /mnt/project-files/holo-remaster/wotc-team-rocket/. Built on the wotc-fossil/wotc-jungle recipe with per-card background masks (scripts/fam/wotc-team-rocket/make_tr_maps.py). Differences from Fossil: .foil is screen, not colour-dodge, so the dark skies still light up; held wash opacity 0.12 + 0.3 x card-opacity (0.26 + 0.56 painted a flat lilac/teal sheet over the art). -->
# wotc-team-rocket: working notes

Scope: base5 Rare Holo 1-17 + secret Dark Raichu 83 (18 faces, all `foil-holo wotc-cosmos`, layouts: Pokemon 1-14 and 83,
Trainer 15 Here Comes Team Rocket! and 16 Rocket's Sneak Attack, Energy 17 Rainbow Energy). Scans are the 1st Edition
prints (stamp under the art on the left, outside the window).

## What the real cards do (research, 2026-10-01)

Sources (photos to be listed in refs/SOURCES.md):
- Elite Fourum topic 46034 "Team Rocket Error Identification Guide: Insufficient Black Ink Holos" (shockerb37, 2024-01-27):
  photos of EVERY TR holo, normal and low-black-ink copies, lit and diffuse (scratch copies in
  scratchpad/wotc-team-rocket/cand/ef46034/01..44; image URLs in cand/ef46034.txt). Normal-ink copies only are used as
  look references. Key ones: 13 Dark Blastoise lit, 15 Dark Charizard, 24 Dark Gyarados, 38 Here Comes TR, 40 Rocket's
  Sneak Attack, 41 Rainbow Energy lit, 42 Rainbow Energy diffuse, 43/44 Dark Raichu, 03 Dark Alakazam macro.
- eBay Dark Charizard 4/82 Unlimited, room light (refs/ebay_dark-charizard-4-unlimited_room-light.jpg).
- Elite Fourum Dark Dragonite holo / no-holo error comparison (refs/ef_dark-dragonite_holo-vs-noholo-error.png): TR cosmos
  vs LC galaxy vs non-foil error.
- every-era j1 refs: yt_base5-darkraichu-83-pokemonholo, yt_base5-darkraichu-warecollect, yt_base5-darkweezing,
  yt_base5-darkmachamp (tilt-video thumbnails), cx_582-Dark (Collexy Dragonite flat scan).

Findings:
- Pokemon holos (1-14, 83): cosmos foil (dots, discs/"circles", small four-point sparkles) over the WHOLE art window
  background, including ground, grass, furniture, rocks, the art's rays (Dark Raichu) and dark shapes (Magneton's shadow
  figure, Slowbro's smoke); the Pokemon is matte (white underlay), stage badge, frame, text flat. Dark Raichu 83 = same
  cosmos foil (two tilt-video frames + EF photos).
- Lit: the background takes the INK's colour (navy sky -> bright blue-violet, Raichu's red/green/blue rays glow red/green/
  blue, Blastoise's sky goes silvery blue with the streaks visible), and the dots flash in saturated colours, neighbours
  different (Rainbow Energy lit photo: yellow, green, cyan, red, orange dots side by side). Diffuse/room light: a dark
  background with visible blue/violet/green dots and some larger textured discs (Dark Charizard eBay photo).
- Here Comes Team Rocket! 15: foil only in the dark brown patches: the R's two counters (sparkly dark brown, clearly foil
  in the photo), the speed-line streaks top-left/left strip/between R and James' hair, and the brown streaks right of
  Jessie's glove. The R itself, people, Meowth, clothes: matte. Confidence medium (one diffuse photo + scan sparkle).
- Rocket's Sneak Attack 16: dark sky background with purple/blue dot clusters and smoke lines is foil; Jessie (incl. her
  dark navy glove/arm, earrings, collar, hair spikes) matte.
- Rainbow Energy 17: whole picture window foil (black sky + flower-petal nebula + dots), the printed orb in the centre
  matte (white with printed rainbow spokes), top bar and text box silver print, not foil. Two photos (lit, diffuse).

## Why the old recipe fails (Noah: "holographic squares", weak)
`foil-holo wotc-cosmos` (css/holo/wotc.css) masks a screened wash with the per-card spark map
(assets/foil/wotc-spark/base5/<n>-v1.webp): that map is thresholded 1-px squares + blob floors -> square specks at phone
size; the colour wash is greyish and moves little; the background between dots gets only a faint floor, so dark skies
barely light.

## Decisions (the new recipe)
- Two per-card maps drawn from each scan by `.claude/skills/card-textures/scripts/fam/wotc-team-rocket/make_tr_maps.py`
  (hints in tr_hints.json next to it), cropped to the era's window box so css uses --wotc-map-size/--wotc-map-pos:
  - `<n>-area-v1.webp` (scan scale): A = foil area (window eroded 2 px, minus stage badge [consensus of every base5
    Stage 1/2 scan], minus the figure grown 1 px). RGB = ink tint: dots removed (median 7), blurred over the background
    only (excluding a 4 px band round the figure, so no halo), normalised to full value; near-black neutral ink gets a
    broad-blur hue, half desaturated, value 0.3.
  - `<n>-fleck-v1.webp` (2x): discs (41 px median top-hat, filled, alpha 0.75) + dots/stars (9 px median top-hat, soft
    threshold), cubic upsampling (no squares); RGB = seeded random saturated hue per dot.
- Figure cut: nearest of per-card Lab colour prototypes (k-means of the window, labelled by eye), near-black neutral pixels
  join the figure within 3 px, figure pieces < min_fg (1500 default) go back to background (dots/discs), opening-based
  pruning of dot-bumps on the figure edge, hole filling where needed, polygons/circles where colour cannot tell.
- CSS (css/holo/fam/wotc-team-rocket.css, class `tr-mapped` from js/fam/wotc-team-rocket.js):
  - `.foil`: [tint multiply] x [lamp pool screen rainbow band on black], screened onto the print, masked by art x area.
    Rest: tint x soft pastel ramp at 0.45 x strength.
  - `.foil::before`: dots, own hue x light pool, `hue-rotate` by pointer position (each dot turns through the spectrum on
    its own phase), screen.
  - `.foil::after`: white glints on dots inside a 300% band sweeping with --background-x/y (mask intersect), screen.
  - `.glare`: small white screen pool masked to the foil area (text box and matte print stay flat).
  - `.glare::after` cleared. Nothing colour-dodged.

## Built so far (2026-10-01 night)
- make_tr_maps.py + tr_hints.json; maps generated for all 18 (assets/foil/fam/wotc-team-rocket/, ~2 MB, fleck maps are
  lossless 2x; re-saved with exact=False to shrink).
- Mask fixes done: 4 (min_fg 2500 so discs are foil), 7 (wing tips polygons), 8 (mouth polygon, min_fg 320, brown proto
  -> figure, disc bg circle 515,187 r26: NOT yet re-run), 13 (body polygon, fill, disc bg circle), 16 (hand/arm polygons,
  sky polygons, earrings, fill), 83 (left ear polygon, fill), 5 (fill), 15 (dark test on median, closing+fill).
- js/fam/wotc-team-rocket.js: MAPS table, `--tr-area`, `--tr-fleck`, class `tr-mapped`.
- css first draft written, not yet rendered.

## Left
- Re-run generator (all), check debug sheets of 8, 5, 7, 13, 16, 15, 83, 2, 3, 10, 11, 12 (scratch dbg/maps<n>.png).
- Render (scale 2, few cards) and tune; measure foil-minus-bare per zone (window bg, Pokemon, text box) rest + lit.
- refs/ copies + SOURCES.md; sheets (before-after Chromium + WebKit, phone-compare); gates (coverage, sweep specks, idle,
  famcensus, settings); reference/fam-wotc-team-rocket.md; LESSONS.md; REPORT.md; SubagentHandback.
