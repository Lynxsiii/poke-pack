# Family dp-special-rares: the Diamond & Pearl special rares

Family module `js/fam/dp-special-rares.js`, sheet `css/holo/fam/dp-special-rares.css`, assets `assets/foil/fam/dp-special-rares/`,
generators `scripts/fam/dp-special-rares/`, research and sheets `/mnt/project-files/holo-remaster/dp-special-rares/`.
Older-era holo remaster of 2026-10-01 / 02. Era notes: `dp.md`, `dp-secret.md` (the pass this one replaces for the cards below).

## What is claimed (and what is not)

`claims()` takes a face only when its DP pattern (`dpPattern()` in `js/dp-foil.js`) names a sub-finish listed in `SHIPPED`:

| sub-finish | cards | state |
|---|---|---|
| `dp-rotom` | Rising Rivals RT1-RT6 (6 faces) | rebuilt, shipped (`dsr-rotom`) |
| `dp-shining` | SH1-SH12 (dp7 SH1-3, pl1 SH4-6, pl3 SH7-9, pl4 SH10-12) | rebuilt, shipped (`dsr-shining`) |
| `dp-ar` Arceus AR1-AR9 (pl4), `dp-shiny-legend` SL1-SL11 (col1), `dp-alph` Alph Lithograph, the secrets (`dp-secret`: dp7 101-103, dp2 124, pl1 128-130, pl2 112-114, pl3 148-150) | 37 faces | NOT claimed: they keep the era look (`dp-holo` cosmos + `dp-secret.css`) |

Why the rest is not done: the finish is a cosmos art-window holo (`dp-holo`, the Rare Holo recipe) plus a printed extra (Arceus
ripple rings, the Shiny Legendary's silver border, the Alph stone). The cosmos is the dp-cosmos-holo family's recipe and was being
rebuilt in parallel; drawing a second cosmos here would only double it. See "What remains".

## The real cards

- **Rotom RT1-RT6** (Rising Rivals, 2009). Cracked-ice foil over everything inside the yellow border except the art window:
  flat angular shards, 5-13 % of the card wide, each a small mirror at its own angle. Tipped, a shard lights ALL at once in ONE
  colour and goes dark a few degrees later; many shards are lit at a time, more near the light. Through the yellow ink of RT1-RT5
  the flashes read white-yellow with pale cyan and green; on Charon's Choice (RT6, grey card) every colour shows (hot pink, cyan,
  yellow, white). The art window and the yellow border are plain. Sources: two tilt videos (RT6 vnqUgOX-d_U, RT2 rNfgFYJEA44),
  Collexy (Platinum overview, cracked ice reverse), Elite Fourum; the scans themselves show every shard.
- **Shining SH1-SH12** (Platinum sets). Printed on the reverse sheet: the "Mirror". Everything inside the border but the art
  window is one smooth silver mirror with a vertical rainbow comb: a band about a half card wide made of two or three
  spectrum cycles (violet, blue, cyan, green, yellow, orange, pink) with hard vertical edges, brightest in the middle, that slides
  sideways as the card tips; the art window (the shiny-colour picture) is plain; text is ink over foil. No cells, no dots.
  Sources: two tilt videos of real Shining cards (Shining Bagon SH10, a3kKHVneT5Y; Shining Shinx SH12, vsNIDQJwf_0), a Platinum
  Mirror reverse (Milotic 9IDDukewm4), Collexy and Elite Fourum (Shining cards share the reverse sheet). Confidence high for the look,
  medium for the ten cards not on video. The real foil is softer and more pastel than ours (a gold or silver mirror with a pastel
  comb); the sheet runs brighter on purpose.

## What was built

### Rotom (`dsr-rotom`)

The scan already carries every shard, frozen in whatever colour the scanner's lamp gave it, so the sheet draws LIGHT only.
`make_rotom_ice.py` segments the shards from the scan (ink inpainted away, mean-shift, watershed on low-gradient cores, regions
redrawn as simplified polygons so the cracks are straight, regions bigger than a real shard split along straight Voronoi edges)
and writes per card three files: `rt<n>-ice.webp` (RGBA: alpha = where the foil is, RGB = the colour each shard flashes),
`rt<n>-px.webp` and `rt<n>-py.webp` (greyscale: each shard's tilt phase along x and y).

The sheet gates each shard by `|phase - pointer ramp|` (a `difference` blend of the phase map and a 300 % wide ramp driven by
`--pointer-from-left` / `-top`), inverted and pushed through `contrast(10)`: a shard is white only while the card is tipped to
its own angle, in x AND y (two gates multiplied); a radial multiplied under it widens the gate near the light. `.foil` = shard colour
x gate x gate, colour-dodged onto the print (light only, the dark ink stays dark). `.glare` = the same colours where the gates are
open and white elsewhere (screen of the inverted gates), multiplied: it pulls a lit shard's other channels down so a flash is
saturated, not pastel; `--dsr-tint` (0.3, RT6 0.6) says how much (the yellow ink of RT1-RT5 turns every flash white-yellow anyway).
At rest `.foil` paints the shard colours faintly (opacity 0.2).

### Shining (`dsr-shining`)

One mask per card (`sh<n>-mask.webp`, `make_shining_mask.py`): inside the printed border, minus the art window (the era's drawn
`dp-basic` window mask), the window's bevel and the dex strip at 0.45, and minus the card's own ink (text, numbers, rules: a pixel
darker than the grey-closing of its 11 px neighbourhood by 0.12-0.26 and dark in itself; a luminance threshold would eat a dark red
card). Without the ink cut the black text turns blue and pink under the dodge (seen in the first render). `.foil` is a 300 % wide
gradient, slid by `--pointer-from-left`, of a three-cycle spectrum comb (centre bright, side cycles at 35 % and 60 % lightness) over
a grey sheen band, colour-dodged onto the print (light only, `contrast(0.8)` last). `.glare` is a soft white radial at the pointer,
screened (never dark). No tile, no repeat, no grating: the only repeating thing is the spectrum, and it is stops in one gradient.
The scan of a Shining card already holds a strong comb (it is a photograph of the foil), so the gain over the era look is the
tilt response (the comb now travels across the card and flashes) and the legible text, not a new static picture.

## How to judge

1. Phone size (220 CSS px x 3), rest, 30:25, 75:65, 50:78, Chromium AND WebKit (2-3 cards a WebKit page), beside the photos in
   `refs/`. Rotom: flat polygons, a few flash at a time in saturated colour, the window and border plain. Shining: ONE comb that
   moves, the window plain, the text dark.
2. `foil_coverage.mjs pl2 pl4 dp7 pl1 pl3` prints nothing; `sweep_finishes.py --set pl2` (and the others) specks pass.
3. `foil_probe.mjs --idle` on RT1 and SH11: no infinite or off-property animation.

## What remains

- Arceus AR1-AR9: the real ripple rings flare silver on tilt; the scan holds them as dark rings, which a light layer could pick
  up (ring mask from the scan) and move through the spectrum. Needs the cosmos window from dp-cosmos-holo first.
- Shiny Legendary SL1-SL11: cosmos window plus a silver border that glitters; the border mask and glitter are small jobs.
- Alph Lithograph: sources disagree (Elite Fourum "textured, non-holo"; Collexy "cosmos holofoil"); the era agent decided
  from photos: stone relief, no hue. Left as is.
- Secrets (dp7 Charizard 103 and the rest): cosmos holo on the window, famous cards; wait for the dp-cosmos-holo recipe and
  claim them with a per-card cosmos window map.
- Shining: the comb is brighter and more saturated than the real pastel one (deliberate); only SH10 and SH12 have a photo.

## Extension 2026-10-02 (evening): Arceus AR and Shiny Legendary SL on the live DP cosmos recipe

`js/fam/dp-special-rares.js` now also claims `ar` and `shiny-legend` faces that are in `COSMOS` (a face without a map keeps the era look):
pl4 AR1-AR4, AR6-AR9 and col1 SL1, SL3-SL7, SL9, SL10 (16 cards; the census count of the family is 34). Recipe: the live dp-cosmos-holo sheet copied under
`.dsr-cosmos` (card map `cos-<id>.webp` = art window minus the Pokemon with the flecks in RGB; `.foil` colour-dodge sheen at brightness(0.5);
`.cure` hue-turning flecks and a glint band); `.dsr-ar` keeps the era's body ripple sheen (cut with the era window mask `--dsr-win`, not the card
map), `.dsr-sl` keeps the era's silver-border `.glare`. Maps: `make_cosmos_maps.py` (runs dp-cosmos-holo's auto_mask.py + gen_maps.py).
Judged by overlaying each map on its scan (the map's alpha tinted green over the scan: the Pokemon must stay untinted).
Second pass 2026-10-02 (19:00 UTC): the four cards left out are now in as well, 20 cards (census count 38). `auto_mask.py` took the wrong thing
on them (AR5: the dark sky for Arceus, foil on the creature; SL2: holes in Dialga; SL8: a patch on Palkia's arm; SL11: the whole window), so
`make_cosmos_masks_manual.py` re-cuts them with SAM2 prompted by hand-picked points (positives on the Pokemon, negatives on the background,
the window box; candidate picked by eye: AR5, SL2, SL11 candidate 1, SL8 candidate 2) and the maps come from dp-cosmos-holo's `gen_maps.py` run
on those masks. New files `cos-ar5.webp`, `cos-sl2.webp`, `cos-sl8.webp`, `cos-sl11.webp` (the 16 earlier maps are live and never rewritten).
Alph and the 13 secrets: see the section below.

## Extension 2026-10-02 (19:25): the 13 secret rares (`dsr-secret`)

`js/fam/dp-special-rares.js` claims `secret` faces that are in `COSMOS`: dp2-124 Time-Space Distortion, dp7-101..103 (the retro Charmander line),
pl1-128..130 (Electabuzz, Hitmonchan, Scyther), pl2-112..114 (the three Pikachu), pl3-148..150 (the Legendary Birds). Census 38 -> 51.
Real cards (refs/SOURCES.md: five photographed in a glove, the scans, Collexy and Bulbapedia): the ordinary DP cosmos holo on the art window, the
Pokemon plain. So they take the live `.dsr-cosmos` recipe unchanged, with `dsr-secret` adding dp-cosmos-holo's light varnish (a soft-light gloss, never dark);
the only new CSS is that one rule pair at the end of the sheet. Maps: `cos-<set>-<number>.webp` (new names; `cos-dp7-103.webp`), `make_cosmos_maps.py`'s pipeline
(auto_mask.py then gen_maps.py), with `make_cosmos_masks_manual.py` for the cards where the automatic cut was wrong: dp7-103 (took the dark flames and the whole
red background), pl1-129 (patches of the green ground), pl2-112 (lost the tail), pl2-113 (holes in Pikachu), pl2-114 (lost the tail), pl3-148 (took the dark blue
sky, where the photo shows the flecks), pl3-149 (purple patches), dp2-124 (took the dark void between the four creatures); `k/n` in `--pick` keeps the n largest
blobs of candidate k (drops stray patches). The other five (dp7-101, dp7-102, pl1-128, pl1-130, pl3-150) are the automatic cut, judged by overlay.
Time-Space Distortion is a Trainer: its map is `dp-trainer` window minus the four creatures PLUS the card's outer border ring (about 11 px of the scan's outline,
distance transform of the scan's alpha), because its scan shows the glitter on that ring (refs/secret-tsd124-border-zoom_scrydex-scan.jpg); the silver frame, the
header and the text box stay flat. Its window file is drawn on the fly in scratch (not shipped: only the finished map is).

Judge: tint each map's alpha green over the scan (the Pokemon must stay untinted, the background tinted); render at 220 CSS px x3, rest / 30:25 / 50:78.

## Alph Lithograph: researched, NOT claimed (the era look stays)

Four sources agree the print is a textured matte stone slab with no foil (refs/SOURCES.md: Elite Fourum thread, two posters; the earlier photo review; four
sleeved cards on carpet; the scans), one text source (Collexy) says cosmos holo and two databases list Holofoil by default. The era's `dp-alph` rule
(css/holo/dp-secret.css) already draws what the photos show: raking light on the stone's own relief, a warm hot spot, no hue. Foil only where the real card has
it, so nothing is added. A glint layer was tried (blob detection on the scan, then seeded dots guided by the relief): the stone is irregular, the blobs sit on
the card's edges and printed rules, and seeded dots would be an invention; dropped, not shipped.
