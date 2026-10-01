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
- The sweep (`sweep_finishes.py`) flagged EX np promos as "window holo promo with no foil map" because only DP and SM were exempted: the EX window
  (exMap) is the map; the exemption now covers `ex\d|np-|pop[1-5]|extk|tk[12][ab]` (rv-i1).

## Review (rv-i1, fresh-context reviewer, 2026-10-01)

Checked: Chromium and WebKit lab renders at 220 px x 3 (rest, 30:25, -30:-20, 50:78) of holos from ex1, ex2, ex3, ex4, ex5, ex6, ex7, ex8, ex9 (Pokémon and
Emerald holo Energy), ex10, ex12, ex14, ex16, np (np005, np019, np035, np040, np001/np002), the kit holos (extk1a Latias, extk2b Minun) and POP; reverses of
a Basic, an evolution, a Trainer and a Rare of every set (mirror ex1-ex4, Energy ex5-ex7, wheel ex8, Poke Ball ex9-ex10, plain ex11 and ex13-ex16, cosmos ex12);
the stamp boxes drawn over Collexy's reverse scans (all ten line up with the printed logos; ex14's box also matches Crystal Guardians 30/100 and 34/100); the
real app at iPhone 13 size (ripped ex9, ex1 and ex7, opened the inspector of a holo, a Poke Ball, a Mirror and an Energy-symbol reverse); settings (foil
strength 0.55 / 1.5, no-shine, no-tilt, reduced motion, Classic); the DOM classes of every card of the family (all rarities reach their class; `era` gating
holds for the np and in-set promos); `foil_coverage.mjs` for every EX set (silent), `dark_specks` through the sweep (no card over budget).

Found and changed:
- The Mirror (ex1-ex4, np reverse promos, basic Energy) was a seven-band rainbow barcode over the name bar and rules text; the Cascoon tilt clips
  (yt_ex1-cascoon-rev hq1..3) show two or three soft pastel hues at once. Bands are now 2.4 times wider (about one spectrum across the card), the grey
  stripe layer too. `css/holo/ex.css`.
- The set-stamp hole was a hard-edged rectangle. The site's scans are the plain prints and carry no logo, so the hole read as a dark box on the art
  (ex8 Donphan, ex10 Curse Powder). It is now a rounded box with a soft edge: `assets/foil/ex-reverse/stamp-soft-v1.webp` (192 x 64, alpha only) in place
  of the old hard gradient layer, same `--st-*` placement. The boxes themselves are right.
- `sweep_finishes.py` exempted only DP and SM promos from "window holo promo with no foil map": EX np, POP, kit and in-set np promos now pass.

Remains (not mine or not decidable here):
- Pokémon-ex promos (np001, np002, ex9-np037 to np039, ex11-np031 to np033) get `foil-ex ex-ex` but no map: `exExMap()` only draws a ring for rarity
  "Rare Holo EX" and "Rare Secret", a Promo falls through. They still look contained in the lab (ex-ex.css fallback) but are the Pokémon-ex sheet's to map.
- No POP card is a holo in the data (in-pack POP cards are non-holo by the research; the cosmos prints come from blisters and tins), so there is no
  POP holo to render. A card with `holo: true` on a POP id would take the kit recipe and work for a Pokémon, but a Pokémon-ex with `holo: true` (Tyranitar ex
  POP1 17) would get `foil-holo ex-cosmos ex-kit` with no window map: send it to the ex-ex finish if such a print is ever added.
- The reverse stamp is only a gap in the pattern: no logo is drawn (print, not foil, and no clean asset); ex8's wide box (the DEOXYS wordmark) is the
  most visible gap.
- Cosmos shapes at 30:25 are a little louder than the Collexy flat scans and much louder than the Pokemon Holo clips at their angle; judged acceptable
  (the real foil glints brightly at the right angle, and the scan already carries the baked cosmos), not changed.
