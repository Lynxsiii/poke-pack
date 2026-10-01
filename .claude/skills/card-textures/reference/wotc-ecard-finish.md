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
- `scripts/make_wotc_ecard_holo_maps.py` (rv-j2): per Rare Holo, `holo-<set>-<n>-v1.webp` (96 files): window x the scan's smoothed sparkle
  density with a 0.22 floor, so the added cosmos stays in the sky and the ground and the Pokemon's dark body stays clean (see the review).
  `ecardMap()` returns it for every `Rare Holo`; the shared `win-pokemon-v1` is now only the Crystal's base and the window the holo maps start from.
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

## Review (rv-j2, fresh-context, 2026-10-01)
Checked: renders of Expedition (Charizard 6, Butterfree 5, Mewtwo 20, Gengar 13, reverses of Wartortle 92 / Dugtrio 44 / Bill's
Maintenance 137), Aquapolis (Houndoom H11, Umbreon H29, Exeggutor H10, Suicune H25, the Special Energy reverses 144-147) and Skyridge
(Gengar H9, Umbreon H30, Raichu H25, Alakazam H1, Crystals Ho-oh 149, Charizard 146, Celebi 145, Kabutops 150), each in Chromium and
WebKit at 220 px x 3 and poses rest, 30:25, -30:-20, 50:78, beside the Pokemon Holo clips and the Collexy reverse scans; foil-minus-bare
per zone (the window gains +8 at rest, +37 at 30:25, +10 at the other two; frame, name bar, text box and strip gain exactly 0 on a holo);
`foil_coverage.mjs ecard1 ecard2 ecard3` clean, `sweep_finishes.py` for the three sets with no dark dots, the app at iPhone 13 size
(a pack of each set ripped in Chromium and WebKit, reveal grid and inspector at three tilts), the settings (strong, subtle, no-shine,
Classic, no-tilt, reduced motion) on a reverse in the inspector, two no-map cards (Scan-Tastic promos 51 / 52, a plain Rare), no colour-dodge
anywhere in the sheet (so no WebKit dodge blotch on dark ink: Gengar, Umbreon, Houndoom looked clean).
Found: (1) the shared window mask let the added cosmos flakes sit over the Pokemon: screened onto Gengar's near-black belly, Mewtwo's legs
and Umbreon's body they read as white blocks stuck on the drawing, where the clips show the dots in the sky and the ground and the Pokemon
nearly clear (Mewtwo 20, Butterfree 5, Nidoking H18, Blastoise 4). Fixed with per-card maps (above); the Crystal note's "Pokemon clear" is
therefore true of every e-Card holo, only more so for the Crystal. (2) The Special Energy and Trainer reverse masks are right (foil stops at
the art and the strip). A Basic Energy would not fit `body-energy` (its art runs to 0.92 H, the mask's window stops at 0.65) but the
e-Card sets deal no basic Energy reverse (reverseRarities excludes "Energy"), so nothing reaches it; draw a basic-Energy layout before
adding one.
Not done: the poke-holo.simey.me comparison (its host fails Chromium's certificate check through the proxy; not verified whether the demo carries e-Card
cards); the Crystal reverse prints (Skyridge Crystals as reverse) are not modelled; the reverse of an Expedition Rare Holo draws the
holo scan, so its window keeps the printed cosmos (one scan per number). Classic mode paints the old engine's grey marble reverse over the
text box of an e-Card reverse (css/app.css, outside this family).
