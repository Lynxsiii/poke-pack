# Wizards of the Coast: the e-Card finishes (holo, reverse, Crystal)

Sheet: `css/holo/wotc-ecard.css`. Hook: `wotcMap()` in `js/wotc-foil.js` asks `ecardMap(card)` in
`js/wotc-ecard-maps.js` first. Photos and the claim list (2+ sources each): `/mnt/project-files/every-era/wotc/texture-refs/j2/SOURCES.txt`.
Contact sheets (photo | Chromium | WebKit, phone size, three tilts): `/mnt/project-files/every-era/wotc/finish-sheets/j2/`.

## What the photos show
- **e-Card holo** (Expedition, Aquapolis, Skyridge Rare Holo): cosmos, but only in the ART WINDOW. A scatter of small
  snowflake, plus and square clusters and single dots, each lit in one colour (cyan, blue, white, pink, orange), thick over dark sky and thin over
  pale ink. Frame, name bar, text box and the e-reader strip are flat print. The DP dot-matrix tile is NOT this: the e-Card cosmos has its own
  tile, `assets/foil/wotc-ecard/cosmos-v1.webp`.
- **e-Card reverse** (`wotc-rev-ecard`, class `wotc-rev wotc-rev-ecard`): one smooth mirror over everything except the art window and the
  bottom strip. It throws broad smooth bands (violet, blue, cyan, green, yellow, orange) that slide sideways. Ink stays dark, the picture stays
  matte. No pattern in the mirror.
- **Crystal** (`wotc-crystal`, ecard2 148-150, ecard3 145-150): the mirror on the body AND cosmos in the art-window BACKGROUND only. The Pokemon
  figure stays clear, which is the whole look.

## Masks (no TCG Live maps in this era; all drawn from the scans)
- `scripts/make_wotc_ecard_masks.py`: flood-fills the art window from the mean image of each layout (Pokemon, Trainer, Energy), walled by
  gradient edges, Pokemon rows above 0.1145H cut (the name bar leaks otherwise). Writes `win-*-v1.webp` and `body-*-v1.webp` (body = not window,
  dilated 1px, nothing below 0.925H where the strip is). The std-based threshold leaked into the text box; the mean-image gradient fill does not.
- `scripts/make_wotc_crystal_masks.py`: per card, window x a smoothed density of the scan's baked sparkle (white top-hat > 38, gaussian sigma 11).
  This is what keeps the Pokemon clear: the real print leaves it out of the cosmos.
- `scripts/make_wotc_ecard_cosmos.py`: seeded tileable 768px tile: 150 fused flakes, 620 singles, 110 dashes.

## Recipe notes
- Holo: `.foil` is a screen pointer pool plus colour wash cut to the window map; `::before` is the cosmos tile lit in the spectrum
  (multiply, brightness 1.25, saturate 1.2); `::after` is a white second pass at another scale gated by a moving band. No colour-dodge, so no
  closing `contrast(0.8)` is needed.
- Reverse and Crystal body: pointer ellipse, narrow band gradient (330% wide, moves x2.2), broad hue gradient (210% wide, moves x1.6), overlay,
  masked to `--art` intersect `--wotc-body` (Trainer and Energy override `--wotc-body`).
- Crystal cosmos lives on `.glare` (screen, masked to tile x per-card map x art); the engine hides the glare at rest, the scan's baked sparkle
  carries the rest state.

## Lessons
- A tile built with `r*SS` applied twice made dots four times too big; check dot radius at 1x before shipping.
- A regular grid of dots reads as a grating. Fuse dots into flakes, jitter, vary size.
- Do not draw a mask from the scan's std image: text-box texture leaks in.
- Chromium and WebKit agreed on every sheet; set `PLAYWRIGHT_BROWSERS_PATH` inline for WebKit only.

## Not settled
- Crystal body mirror rests on one tilt clip plus the scans; no continuous video (YouTube download blocked, thumbnails only).
- Reverse rest opacity (0.5) is untested against a photo at rest; no photo of a Trainer or Energy e-Card reverse exists in the refs.
- Skyridge Crystals also exist as reverse prints; not modelled separately.
- The strip is matte per the brief, but the real holo's slots and e logo do sparkle.
