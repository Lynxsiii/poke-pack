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
