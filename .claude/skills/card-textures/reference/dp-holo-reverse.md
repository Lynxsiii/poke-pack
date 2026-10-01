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
