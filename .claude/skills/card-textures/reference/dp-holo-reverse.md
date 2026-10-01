# Diamond & Pearl through Call of Legends: cosmos holo, Mirror reverse, Crosshatch Energy

Family h1 (`css/holo/dp.css`, `js/dp-foil.js`: `dpMap`, `dpReverseExtras`, `dpWindow`, `dpLayout`, `dpFrame`).
Photos and sources: `/mnt/project-files/every-era/dp/texture-refs/h1/` (SOURCES.txt). Sheets:
`/mnt/project-files/every-era/dp/finish-sheets/h1/`. TCG Live published no foil maps for 2007-2011, so every mask here is drawn.

## What the real cards look like

- **Cosmos (Rare Holo, secret reprints, POP and promo holos).** A dot-matrix galaxy in the art window only. Discs, plus and
  diamond clusters, comma flecks and single specks, all made of the same fine dots (pitch about 0.6% of the card width), thick in
  the sky and thin around the Pokemon. Each element lights in one saturated colour (teal, green, cyan, magenta); the colour sweeps
  over the card as it tips. It is not Base Set's star field and not the smooth round planets of the Scarlet & Violet promos.
- **Mirror reverse (every non-holo, DP to Call of Legends).** Everything except the art window and the yellow border is a smooth
  mirror with no pattern of its own. Tipped, it throws vertical spectrum stripes (violet, blue, cyan, green, yellow, red) of
  unequal widths, 1.5-5% of the card, brightest in a broad band that slides sideways. Ink stays black; the name bar, attacks and
  text box all take the stripes; the picture stays matte.
- **Call of Legends Energy (88-95, Play! Pokemon logo, reverse-only).** Crosshatch: textured lines in two directions, 45 degrees
  each way, over the whole face; silvery, tinting as it turns. (The brief gives Energy no reverse finish; this is the exception.)

## Recipe

- `dp-holo` (`.foil`): the window mask (`--foil-map`, from `dpMap`) cuts the foil to the art window of the layout. Layers: a faint ground,
  `::before` a spectrum multiplied with a pointer pool, masked by the drawn cosmos tile (`assets/foil/dp-cosmos-v1.webp`, 736 px,
  lossless, seamless, seeded by `scripts/make_dp_cosmos.py`) shifted per card by `--seed-x/y`; `::after` white glints (tile at 78%
  intersected with a moving 118deg band); `.glare` overlay. The dot grid is jittered and the dot size varied so no single
  frequency beats against the phone's pixel grid.
- Mirror (`.foil-reverse.dp-rev .foil`): two vertical stripe sets of different pitch (a spectrum and a grey set), a pointer ellipse
  fading to white at the sides, `mix-blend-mode: multiply`, `filter: brightness(1.12) saturate(1.2)`, mask = card minus the layout's
  window (`--dp-win`, `mask-composite: subtract`), `clip-path` inset for the border.
- Crosshatch (`.dp-rev-cross`): two 45-degree line sets (lighten) over a dim sliding rainbow, `screen`, art mask only.
- Window masks (`assets/foil/dp-win/<frame>-<layout>.webp`, 600 x 825 alpha): measured, not hand drawn. The per-pixel std of every scan
  of one layout is high where the picture is and zero where the frame is printed; `scripts/make_dp_window_masks.py` thresholds
  it, keeps the main blob and cuts the BASIC tab and the evolution circle. Two frames: `dp` (DP, Platinum, POP, DP promos) and
  `hgss` (HGSS, Call of Legends, promos); four layouts: basic, stage, trainer, senergy (basic Energy has no window).

## Lessons

1. **Multiply, not colour-dodge, for a mirror over ink.** The first Mirror was colour-dodge; at the pointer it washed the text box white
   and the attack text vanished (Poke Ball text unreadable at 70:60). Dodge multiplies dark ink up by 1/(1 - blend). Pastel stripes
   multiplied onto the card keep black ink black and still show on the white text box; the pool is the lack of white at the sides, not more light.
   No dodge chain, so the closing `contrast(0.8)` rule does not apply (the earlier dodge version had it).
2. **Crosshatch as union of lines needs `lighten` between line sets**, not `multiply`: multiplying two soft ribbons gives a quilted
   dot screen (pillows), not crossing lines. Draw lines white-on-black, `lighten` them, and let `screen` add them; keep the rainbow
   under them dim (10% lightness) or the Energy symbol turns green.
3. **Soft ribbons, never hairlines.** The Crosshatch pitch is 3.4% of the width (about 7 CSS px at 220 px), ribbons with a 0.7% line.
   Finer lines aliased into a line screen in WebKit in earlier eras.
4. **The cosmos mask is a tile, but it only needs to read as stars:** at DPR 3 the dot pitch is 4.6 card-px; bigger discs were
   not needed. Shift the tile by `--seed-pos`, keep every position in 0-100%.
5. **A haze from the ground layer.** The ground of the holo `.foil` painted a milky film over the window; found by hiding layers
   with `--css`, fixed by cutting the ground alphas to 0.12/0.06 radial and 0.08/0.07 linear.
6. **Frames, not sets, decide the window**: the HGSS window is taller and sits lower than the DP window; promos carry their home
   set's id, so `dpFrame` reads the id prefix (`hgss\d|col1|hgsstk|hsp` is HGSS).
7. **Special Energy** pictures bleed to both card edges and run under the title; its mask is a rectangle, cut at 0.76 of the height.
8. **Probing a reverse in the lab**: `r<number>` needs a digit after the r, so a set whose card numbers are `dp1_23` is probed with data entries
   carrying `reverse: true`. The id must keep its set prefix (`col1-88`), because the Crosshatch class reads it.
9. **Sweep and promos**: `sweep_finishes.py` flagged DP promos as "window holo promo with no foil map" because they have no Live map;
   they take `dpMap`'s drawn window instead, so the check now skips the DP era (same as Sun & Moon).
10. **Load**: under a load average above 30 the probe's 30 s screenshot timeout fails; run with a longer timeout.

## Review (rv-h1, fresh-context reviewer, 2026-10-01)

Sheets: `/mnt/project-files/every-era/dp/finish-sheets/h1-review/`. Verdict: ship after the fixes below.

Checked. Window masks measured on real scans, 6-9 cards per frame and layout with the mask outline drawn on the scan: DP basic, stage,
trainer and Special Energy (dp1, dp3, pl1, pl2, POP 6-9, dpp, Trainer Kits) and HGSS basic, stage, trainer and Special Energy (scratch
scans of hgss1, hgss3, col1, hgsstk4: never committed); the mask sits on the printed window edge to within about 3 to 8 px of 600
(per-side offsets: median -3..-13 px top/left, +2..+9 bottom/right, sd 2-5), the BASIC tab and the evolution circle are cut cleanly.
The Platinum SP frame (Rising Rivals) shares the DP window, but its trainer portrait breaks out of the medallion into the window's
bottom-right corner (see Fixed). Holo and Mirror in Chromium and WebKit at 220 px x 3, rest, 30:25, -30:-20, 50:78, beside the
Collexy photos (Flygon pl2-5, Feraligatr hgss1-20, Dusknoir dp1-2 reverse); real app at iPhone 13 size (reveal and inspector of a holo
and a reverse); foil strength 0.55 / 1.5, no-shine, no-tilt, Classic, reduced motion (Chromium, app); `foil_coverage.mjs` with
`BATCH=60` over dp1 dp3 pl1 pl2 pop6-9 dpp dptk3a/b hgsstk4a/b col1 hgss1 hgss3: nothing; `sweep_finishes.py` pl2 dp3 pop8 pl1: dark
specks within budget; class check of every rarity of the family (Rare Holo, Rare Secret, SP holo, promo-as-holo with `foilAs` and
`era`, Rare, Common, Trainer, Special Energy, Energy, reverses of each; promos and kits without a map paint nothing, no `foil-holo`).

Fixed.
1. Crosshatch tint and one-sided lattice. The dim rainbow under the lines was 10% lightness, and the two 45-degree sets were 13% and
   27% grey. Measured against the bare print (WebKit, pose 30:25): dark pixels of Darkness 94 and Metal 95 gained +43 levels and
   +13 to +18 chroma (teal); only "/" lines read. Now both sets 18%, rainbow 5%, pool 0.05: +27 levels, neutral (+2 chroma), a true
   two-direction lattice like the TeamPoketown clip. The builder's "faint rainbow tint in dark symbols" caveat is confirmed and fixed.
2. SP portrait. Cosmos dots covered the face and hair of the Gym Leader / Elite Four / Galactic portrait. New mask
   `assets/foil/dp-win/dp-basic-sp.webp` (`scripts/make_dp_sp_mask.py`: dp-basic minus an ellipse at (519, 395), radii 62 x 70 on 600 x 825),
   returned by `dpMap()` for SP Rare Holo / promo-as-holo. The Mirror reverse still uses the plain window (no photo says whether the
   reverse sheet foils the portrait).
3. `scripts/test-dp.mjs` still expected the bare `rev-mirror era-dp dp-rev` string; updated, plus the Crosshatch and SP assertions.

Learned.
- The Scrydex scans of holo cards carry the real card's cosmos dots baked in (the "no-shine" render of a holo is already sparkly). Judge
  the added foil against a render with `.foil, .glare` hidden (`--css`), not against the idea of a flat print. The window holo adds about
  +25..+34 levels to the window mean at 30:25 (screen, cyan lean R+20 G+32 B+38): ground gradient about 12, glare about 10, the dot
  layers only about 5. Left as is (no photo shows a wash either way) but it is the first knob if Noah finds the window veiled.
- `--foil-strength` is set on `body`, not `:root`: a test that sets it on the root does nothing.
- To open the inspector in a scripted app run: append a `button[data-inspect=<id>][data-reverse=1]` inside `#view-home` and click it
  (the delegated handlers sit on the view containers, not the document).
- Under a load average of 20+ the probe's 30 s screenshot timeout fails at 3x; copy the probe and raise it.

Remains. (a) Crosshatch only exists in the lab: col1 has no data in the app, so the inspector and pack reveal of Call of Legends were not
exercised; WebKit pointer tilt in the inspector did not engage under Playwright (the lab renders cover WebKit). (b) The real
Crosshatch lines are much finer than the 3.4% ribbons used here (the clip shows a hairline diamond lattice); coarser is deliberate (no
line screens). (c) The mirror is more saturated than Collexy's flat reverse scans at rest; at tilt it matches the clips. (d) Basic Energy
reverses of the DP sets (dp-rev-energy without `--dp-win`) are foiled edge to edge by design; no photo checks it. (e) The reverse of a
Rare Holo prints on the holo scan, so the baked dots show in the art (the engine does not deal that reverse; lab-only).
