# Holo family mcd-promos: McDonald's Collections 2011, 2012, 2014, 2015, 2016

Older-era holo remaster (2026-10-02). 60 faces (12 each of mcd11, mcd12 on the BW frame, mcd14, mcd15, mcd16 on the XY frame), all
`rarity: Promo`, `holo: true`, `foilAs: "Rare Holo"`. Files: `js/fam/mcd-promos.js`, `css/holo/fam/mcd-promos.css`,
`assets/foil/fam/mcd-promos/<id>-v1.webp` (60, drawn by `scripts/fam/mcd-promos/make_mcd_maps.py`), render and sheet helpers
`scripts/fam/mcd-promos/mcd_cards.mjs` and `compose_sheets.py`. Research and photos: `/mnt/project-files/holo-remaster/mcd-promos/`.

## The real card
- Every English print of the five sets exists only as Confetti Holofoil (no plain print, no reverse): the engine deals one printed holo
  per Happy Meal pack, so every pullable face is the holo. Data is right.
- Foil is the art window: a mosaic of irregular polygon chips, 1-2% of the card wide, each chip its own colour and level (neighbours
  differ), dense and saturated under a lamp, a sparse sprinkle of lit chips at other angles; chips switch on and off one by one as the
  card tilts. The Pokemon is matte (chips stop at its outline), as are the frame, name bar and text.
- The golden-arches "M" at the window's bottom right (2012 and 2014 only) is plain yellow: no chips on it.
- Sources: YouTube tilt frames (Zorua mcd11-9, Dewott mcd12-5, Klang mcd12-11, Axew mcd12-12, Purrloin, Scraggy mcd16-7, Pikachu
  mcd14-5, Staryu, Lotad, Zigzagoon), Collexy BW/XY overviews (section 9) and scans; the site's own scans carry the chips frozen.

## What was built (and why)
- The scan IS the chip layer, so no chip tile is drawn. Each card's map is RGBA: alpha = foil area, rgb = the scan's own chip signature
  (scan minus its sigma-5 local mean, per channel, centred on grey). The same file is `--foil-map` (mask, alpha) and `--mcd-chips`
  (colours): the chips are lit exactly where they are printed.
- Foil area from the scan: median-filtered local energy (sqrt domain) says where chips are; big compact chip-free blobs are the Pokemon
  (grown 5 px), yellow in the M box is the M, the window rectangle (52,90)-(546,414) of the 600x838 scan bounds it.
- CSS: `.foil` = chips x slow rainbow x lamp pool, colour-dodged (filter closes in contrast(0.8)); `.foil::before` = chip signature
  through `difference` against a moving grey ramp, inverted and crushed so only chips whose level matches the ramp flash, each colour
  channel at its own moment (screen); `.foil::after` = fine sand (screen); `.glare` = a soft overlay pool masked to the foil area only.
  Both era prefixes are covered with `:is(.era-bw, .era-xy)` x5 plus `.fam-mcd-promos` x6, so it beats bw.css, bw-fullart.css and xy.css.

## How to judge it
- Lab does not draw foilAs promos: use `scripts/fam/mcd-promos/mcd_cards.mjs --ids mcd11-9,... --browser webkit [--fam off]`.
- WebKit headless drops `.foil` layers on a page with many faces (12 faces: the lit poses came out flat). One card per page (4 poses).
- Window foil-minus-bare should be about +20..30 levels at the lit poses; the Pokemon and M within a few levels of bare.

## What remains
- Flat-colour art (yellow burst behind a yellow Pikachu: mcd14-5, mcd15-6) is on the STRICT threshold in make_mcd_maps.py: the relaxed one cut the
  burst and the Pokemon into camouflage patches. mcd15-6's head and ears are still partly foiled.
- Pale chip patches next to a pale Pokemon (Klink's clouds, Oshawott's splash, Torchic's silver wisps, Staryu's silver) are read as
  chip-free and get no foil: a fix is the diff against the set print (registered, see the scratch `proto_diff2.py`) in place of the energy mask.
- The M box and window rectangle are fixed; a few cards (2012 evolution frames) may cut a few pixels of foil at the window corner.


## Review #1 pass (2026-10-02): maps rebuilt with make_mcd_maps_v2.py
- v1 found the Pokemon from the scan's own chip energy: thin or pale parts (legs, ears, gears) got foil, flat or pale background got none, and
  the two Pikachu were cut wrong. v2: (1) 40 of 60 cards are reprints of a set card: the print is registered (ECC affine) and colour-fitted
  to the McD scan, and scan minus print is the chips alone, so the Pokemon, the M and the evolution circle are the chip-free blobs of the
  residual; (2) mcd14-5 and mcd15-6 take the interior of the print's black outline (flood fill), head and ears included; (3) mcd11-1, 3, 4,
  6-11 are NEW Ken Sugimori artworks with no set print (registration cc 0.2-0.5): the official artwork's alpha (refs/oa/<dex>.png) is placed
  by multi-scale edge template matching (score 0.58-0.90, overlays clean); (4) a card with neither falls back to v1 plus closing and thin-island
  absorption; (5) a seeded Voronoi chip field is blended into the signature where the scan has no chips; (6) per-card `--mcd-gain` (1 dark art,
  0.5 pale art, from the mean window luma) scales the lit foil and glare so pale art is not driven to white; lit `brightness(.85)`.
- The map files keep the `-v1` names (never shipped). Full run: `python3 make_mcd_maps_v2.py --jobs 3` (rewrites the GAIN table in js/fam/mcd-promos.js).


## Fix round, 2026-10-22: the BW sets (mcd11, mcd12) rebuilt; XY (mcd14-16) unchanged
Audit: `/home/user/holo-work/bw-mcd11-mcd12/AUDIT.json` (verdict wrong); photos and sources in `/home/user/holo-refs/bw-mcd11-mcd12/`
(SOURCES.md). Work, before/after sheets: `/home/user/holo-work/fix-mcd-promos/` (ba-mcd11-{1,5,9}.jpg, ba-mcd12-{1,5,9}.jpg).

The real card (in-hand YouTube frames and a PSA slab: Snivy mcd11-1, Alomomola mcd11-5, Zorua mcd11-9, Servine mcd12-1, Dewott mcd12-5,
Purrloin mcd12-9):
- Confetti holofoil: compact irregular polygon chips about 1.5-2% of the card wide, edge to edge over the art-window background
  (trees, rocks and foliage included: Dewott's right-hand tree carries green chips). The Pokemon (head, face, ears, tail), the M, the
  evolution circle, frame, name bar and text are matte. (zoom-window-inhand-* in mcd11-9, mcd12-5, mcd12-1, mcd12-9.)
- Each lit chip flashes its own colour, not the art's tint: gold, white-silver, cyan, blue, green, orange, pink side by side on dark art
  (Zorua, Alomomola); mostly warm gold and white on pale or green art (Snivy, Servine, Purrloin: no blue). No broad rainbow band.
- Un-lit (shallow angle) the chips switch off and the art reads cleanly, a little darker (Dewott's sky reads navy in hand); partly lit a
  sparse sprinkle; under the lamp a dense bright mosaic that nearly hides the background (Zorua). Flat chips, no etch or emboss.
- The site's scans carry the chips baked in as a LIT mosaic (Dewott's sky pale blue-white in assets/cards/mcd12/5.webp), so lighting the
  scan's own chips (the v1 approach) can never look un-lit, and lights them in the art's tint.

What changed (BW faces get the class `mcd-bw` from js/fam/mcd-promos.js; every new rule is scoped to it):
- `assets/foil/fam/mcd-promos/<id>-plate-v2.webp` (24, `scripts/fam/mcd-promos/make_mcd_bw_v2.py`): the art window (494 x 324) as the
  un-lit ink, rgb = the registered set print (2012 and Maractus, Alomomola, Audino; per-channel gain fitted on the Pokemon) or, for the
  new 2011 artworks, the scan with its chips smoothed out (Lab), darkened x(0.92 - 0.11 luma) with a cool tint; alpha = the foil area.
  `.foil` paints it with normal blend (opaque) and uses it as its only mask, so at rest the window is clean, darker art.
- Silhouettes: the eight 2012 cards the audit found foiled on the head (Servine, Pansage, Pignite, Dewott, Emolga, Drilbur, Purrloin,
  Scraggy) and Maractus mcd11-2 start from rough hand polygons (`scripts/fam/mcd-promos/bw_polys.json`) snapped by GrabCut on the
  registered print, plus every chip-free pixel (scan minus a local linear fit of the print) inside them; `:plus` / `:minus` polygons fix
  Dewott's white blades and the sky Servine's collar encloses. Alomomola's hand hull is snapped the same way; Snivy's collar notch is
  closed; Audino's stray matte blobs are dropped. Background is foil everywhere else (no chip-free-blob rule).
- `assets/foil/fam/mcd-promos/chips-bw-v2.png` and `chips-bw-warm-v2.png` (`make_mcd_chips.py`): one shared 192 px periodic Voronoi chip
  tile (~1.75% of the card per chip, 1 px seams), each chip's channels hold the ramp level at which that channel lights, so a grey
  triangle ramp through `difference`, inverted and crushed, flashes each chip in its own colour. Full palette for dark/blue art, warm
  palette (gold, white, yellow-green) for pale or green-yellow art (`WARM` in js/fam/mcd-promos.js, written by the builder).
- `.foil::before` = sparse sprinkle over the window (ramp at 125deg, 300%, 0.7-0.9 cycles per sweep: rainbow_speed passes);
  `.foil::after` = the lamp: the same chips with a wider window and a 0.25 sheen floor, masked to a radial pool at the pointer, warmed a
  touch; `.glare` off. One small plate plus one cached tile per face: the 12-face WebKit page that dropped every mcd12 layer now renders
  all faces lit.
- XY (mcd14, mcd15, mcd16) keep the v1 maps and rules: the Chromium contact of mcd14 at 40:30 matches the audit's (mean diff 1.2 levels).
- Gates (2026-10-22): foil_coverage mcd11 mcd12 mcd14 mcd15 mcd16 prints nothing; dark_specks mcd11 and mcd12 (1,5,9) ok (max 36 at
  Dewott rest, from the print's droplets registering a pixel off the scan's); rainbow_speed clean; no duplicate rule; no asset overwritten.
- Left: the 2011 new artworks have no clean print, so their rest plate is a smoothed scan (soft, a faint mosaic remains); a clean
  source for those nine arts would sharpen them. The sheet's `?v=` in index.html must be bumped by the lead.


## Fix round 2, 2026-10-22: reviewer FAIL on round 1 fixed (BW only; XY unchanged)
The round-1 `-plate-v2` / `chips-bw-v2` files above were never shipped and are gone; the BW look now uses `-plate-v3.webp`,
`-matte-v3.png` and `chips-bw-v3.png` / `chips-bw-warm-v3.png`. Work, logs, before/after sheets: `/home/user/holo-work/fix-mcd-promos/`
(`r2/varlog*.txt`, ba-mcd11-{1,5,9}.jpg, ba-mcd12-{1,5,9}.jpg).

Finish facts re-checked on the audit's photos (`/home/user/holo-refs/bw-mcd11-mcd12/`, SOURCES.md): lit Zorua (mcd11-9, in-hand video
frames) shows saturated green, cyan, orange, pink and gold chips separated by dark gaps, no milky grout; 2012 cards (Dewott, Servine,
Purrloin frames) show a sparse sprinkle of gold and white chips at most angles, not a broad pool; un-lit, Dewott's sky is dark
navy-purple and Purrloin's upper sky pale green/white. One in-hand video per card (one uploader for five of the six); Alomomola also
has a PSA-slab video from a second uploader, which agrees on the family-wide facts (chips on the window background only, Pokemon matte).

- WebKit dropped foil layers at random (12-face page): measured, not guessed. Base CSS dropped every mcd12 layer in 4 of 8 shots, the
  same CSS without the image mask on `.foil` in 0 of 8, without `::after` still 2 of 8. Rule now: no image is ever a CSS mask in this
  family's BW rules. The plate is an RGBA background of `.foil` (alpha = foil area), `.foil` has `z-index:auto` (no stacking
  context), and the chip layers carry their own matte image layered with `lighten` (white = no chips) instead of a mask. Final check:
  0 drops in 16 shots (2 runs x 4 shots, mcd12 and mcd11 pages of 12 faces).
- Window registration: `.foil` / `.glare` inset to BOX (40,75)-(562,417) of the 600x838 scan, and each card's alpha is its own window
  measured on its scan (grey side bars, dark bevel line, 2012 evolution-bar step, HP pill); Dewott's window runs to x 556, Purrloin's
  edge strips are gone. The evolution circle is found by Hough per card; the M template is shifted per card to its yellow.
- 2011 halo / Snivy tail patch: the chips' matte follows the snapped silhouette (no ring of baked chips), the new-art plates are the scan
  with chips removed by non-local means (sharper than round 1's blur), and a `mcd11-1:minus` polygon opens the gap between Snivy's tail
  and body.
- Lit chips: no invert floors (dark gaps between chips), `saturate(1.5)` (1.15 warm) on 2011, 1.25 (1.1 warm) on 2012; the 2012 lamp
  pool is thin (opacity 0.6, narrow window) so 2012 reads as a sparse gold/white sprinkle. Tile palette re-weighted (cyan, blue,
  pink, green up; WARM: white and gold). `image-rendering: pixelated` on the chip layers (an interpolated tile lit thin lines between
  chips); the ramp is shallow (40% period at 600% size) so a chip lights whole, not in stripes.
- Rest tone: Dewott (mcd12-5) plate darkened with a blue-dominant sky tone (TONE, SKY); Purrloin (mcd12-9) takes its chroma from the
  scan (pale green/white upper sky). Sheen while held: `.glare` paints the plate with `screen` at 0.45 x card opacity.
- Whole-set speck run (dark_specks --all) found two more: Audino (mcd11-12) left its ear curls out of the matte, so the print's curls
  sat beside the scan's (98 specks): its v1 hull is now closed (stray background blobs dropped) and snapped, plus `mcd11-12:plus`
  polygons that add only the curls' warm strokes (PLUS_WARM). Maractus (mcd11-2) had pale sky in its matte (NO_FREE, SKY_NOT_POKE) and
  the print's window line a pixel inside the scan's (dashed dark line at the top): every print plate now fills its outer 3 px from 4 px
  further in.
- Gates (final): foil_coverage mcd11 mcd12 mcd14 mcd15 mcd16 prints nothing; dark_specks sample (1,5,9) ok for both sets; whole set
  mcd12 ok (max 33, Dewott 30:25), mcd11 ok except Audino rest (~55: dark tree-trunk tips and leaf points of the art that the bare
  scan hides under its bright baked chips; checked at native size, they read as art, not dirt); rainbow_speed, sweep_finishes
  --check-only, check_asset_overwrites clean; test-bw, test-xy pass. Chromium contacts of mcd11 / mcd12 at 40:30 show no outlier;
  mcd14 matches the audit's contact (1.6 levels mean difference). Lead: bump `css/holo/fam/mcd-promos.css?v=` in index.html and the
  `["mcd-promos", N]` cache tag in js/holo-fam.js.
