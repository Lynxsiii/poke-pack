# EX era (2003-2007): the cosmos holo and the reverse holo families (finish agent i1)

Files: `css/holo/ex.css`, `js/ex-foil.js` (`exWindow`, `exMap`, `exReverseExtras`, `EX_STAMP`), `scripts/make_ex_window_masks.py`,
`scripts/make_ex_cosmos.py`, `scripts/make_ex_reverse.py`. Photos and sources: `texture-refs/i1/SOURCES.txt` (the lead's project files).

## Facts that decided the recipes
- TCG Live has no EX maps, so every window is drawn: `assets/foil/ex-win/{pokemon,pokemon-evo,trainer,energy}.webp` and the `-i` variants for
  ex3 and ex6 (their scrydex scans are zoomed out about 5 percent, the window sits 12 px further in). Measured as the mean absolute gradient
  over 150-190 scans per layout: card bodies are type-coloured so a standard deviation fails, the printed frame shows as crisp lines.
  The Evolves-from circle is cut out of the evolution frames. Pokemon-ex and Gold Star frames use no window here (i2's masks).
- Scrydex scans of holos already carry the cosmos baked in: judge the added foil against a render with the foil hidden (`dark_specks.py`).
- The real cosmos is SPARSE blocky pixel shapes (dots, snowflakes, pluses, specks), each lit in ONE saturated colour. `ex-cosmos-v1.webp` is a
  150 x 209 cell grid at 4 px (600 x 836, 11 percent covered), seeded, drawn by `make_ex_cosmos.py`.
- Reverse holo, from the flat scans and tilt clips (not from Collexy's one-line definition "everything but the art box"): ex1-ex4 are the Mirror
  (whole card but the art box, as DP). From ex5 the card body is plain and the PATTERN sits inside the art box, registered to the print
  (identical on every card of the set): Energy columns (ex5 big, ex6 medium, ex7 small; one type symbol per column repeating down it), wheel
  (ex8, a mosaic of triangles in ten alternating wedges), Poke Ball bubbles, balls and starbursts (ex9, ex10), plain sheen (ex11, ex13-ex16),
  cosmos (ex12). ex7-ex16 print the set logo foil-free at the art box's lower right: `EX_STAMP` boxes (600 x 838 frame, read off a gridded
  montage) are cut out of the pattern. ex5/ex6 Rare and Holo Rare reverses add a holofoil type-symbol / Poke Ball stamp mid text box
  (Collexy), the later Holo Rares golden borders and name: print and watermark features, NOT drawn.
- The reverse mask is `tile AND (window MINUS stamp)`: `mask-image: tile, --ex-win, linear-gradient` with `mask-composite: intersect, subtract`
  (`source-in, source-out` for WebKit) and the stamp rectangle placed by `--st-x/y/w/h` (fractions of the card; position percentage =
  x / (1 - w)). An undefined `var()` voids the whole mask, so the basic Energy (no window) gets its own art-only rule.
- Border: the yellow border is about 1.9 percent of the width and 1.4 percent of the height: `clip-path: inset(1.4% 1.9%)` on the Mirror.

## Traps
- A dodge chain must end in `contrast(0.8)` (WebKit divides by zero); the reverse families use `screen` and `multiply` instead.
- Pseudo layers of the cosmos are masked with the same tile shifted by the card's seed: do not also mask `.foil` with the tile (cosmos reverse
  uses a full rectangle as its tile for that reason).
- The sweep (`sweep_finishes.py`) flags EX np promos as "window holo promo with no foil map" because only DP and SM are exempted: the EX window
  (exMap) is the map; add `ex\d|np|pop|extk` to its exemption.
