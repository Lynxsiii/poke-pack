# Diamond & Pearl generation: LV.X, Prime, LEGEND (family h2)

Sheet: `css/holo/dp-special.css`. Masks: `assets/foil/dp-special/` (drawn by `scripts/make_dp_special_masks.py`).
Hook: `dpSpecialMap()` in `js/dp-foil.js` (called first by `dpMap()`). Photos and the claims they back:
`/mnt/project-files/every-era/dp/texture-refs/h2/SOURCES.txt`. Sheets: `/mnt/project-files/every-era/dp/finish-sheets/h2/`.

## What the real cards do
- **LV.X** (dp1-dp7, pl1-pl4, Arceus LV.X too): cosmos holofoil in the art window (multicolour confetti glints, cyan, pink, gold,
  over a silver sheen); the silver border and the strips round the window sparkle with a fine multicolour sand and one hot spot
  that slides along them; the LEVEL-UP rule box has a gold sparkle; the text box is matte. The name plate is matte print.
- **SP LV.X** (Dialga G, Palkia G, Luxray GL, Absol G, Electivire FB ...): the same foil. Only the mask differs: the trainer
  badge on the window's lower right is printed picture (`lvx-sp.webp` cuts a disc there). Detect by `subtypes` containing `SP`
  or the name suffix (G, GL, FB, E4, C) + LV.X.
- **Prime**: the frame is the foil (cream-silver border, the spikes round the art window, plates): a broad band of pearl, gold
  and rainbow plus a fine sand. The art is matte. The name is gold foil lettering. The STAGE / Evolves-from line is matte.
- **LEGEND**: the whole face is galaxy foil, text printed over it; two cards make one picture. First card of a pair is the TOP
  half (name bar down the left edge, picture runs off the right edge), the second the BOTTOM half (header plate on top, picture
  runs off the left edge, attack text on the right). hgss1 111-114, hgss2 90-95, hgss3 87-90, hgss4 99-102.

## How the masks work
One RGBA webp per frame, stretched over the card (`has-foil-map`, `--foil-map`): **alpha = where the foil is**, **luminance =
the zone a layer lights specially** (LV.X art window; Prime name box). `maps.css` cuts `.foil` to `--art` and the alpha; a layer
that wants only the zone re-uses the same file as `mask-mode: luminance` (works in WebKit 26 and Chromium).
- `lvx`, `lvx-sp`: geometry measured on 600x825 scans (fractions, so stretch-proof).
- `prime-basic`, `prime-evo`: DATA, not geometry. The printed frame is identical on every Prime, so the foil region is where the
  26 Primes of hgss1-hgss4 do not differ (per-pixel standard deviation under 25/255), largest connected component. That gives the
  border, spikes, plates and bottom edge and leaves out art, text box, HP and the type symbol. The name box is 30% alpha with
  luminance 1 (the sheen would bleach gold lettering, the gleam on `.glare::after` reads the luminance). The STAGE line is cut.
  `-evo` also cuts the evolution portrait circle.
- `legend-top`, `legend-bottom`: whole face minus the name bar / header plate / footer; the attack text panel keeps about a third
  of the foil (text is printed over foil on the real card, but a full-strength sheen under small text is unreadable).
- `dpSpecialMap()` returns the file for `dp-lvx`, `dp-prime`, `dp-legend` cards; `DP_FULL_ART` is now empty (LEGEND no longer
  takes the all-white full-art map).

## The recipe (all screen blend, nothing colour-dodged, so no closing contrast(0.8) was needed)
- `.foil`: a resting card paints only this: a dim glitter tile + a pointer-centred hot spot + a 300%-wide pastel sweep (112deg)
  moved by `--background-x`. Rest opacity comes from the shared reset block at the top of the sheet (0.34 x foil strength).
- `.foil::before`: a repeating 82deg spectrum, 400% x 900%, lit by the pointer, masked to the cosmos tiles (`--dp-cosmos-mid`
  and `-top` at 110%) intersected with the map's luminance: confetti in the LV.X window only. Prime: a rainbow lobe (mask
  gradient) sliding across the frame. LEGEND: the same cosmos over the whole face.
- `.foil::after`: the glitter tile multiplied by a spectrum (so a fleck is one colour), then screened, brightness 1.5 contrast
  1.6: coloured sand. No black pixels (screen only).
- `.glare`: overlay, dark end 0.3 alpha black, white end `hsl(180 100% 95%)`; opacity `card-opacity * 0.3`. Prime's
  `.glare::after` is the gold gleam on the name box (`soft-light`, masked by the map's luminance).
- LEGEND join: field 300% wide; top half background-x = `pointer-from-left * 0.8 * 50%`, bottom = the same + `--lg-join` (0 or 1)
  x 50%; cosmos mask positions 0% / 100% at 200% size, so what leaves one half's right edge enters the other's left edge.
  Seeds cannot be shared per pair (no pair data in the card), so LEGEND uses no seed on the cosmos.

## Lessons from the build
- **First LV.X pass was glitter you notice first.** Cosmos tiles at 200% were paint blobs; 110% and a lower `::before` opacity
  (0.2 + card-opacity * 0.4) give confetti. The white pointer pool in `::before` read as a milky veil: removed. The `.foil`
  sheen over a pale window (Uxie, Arceus) washes it out: keep the pool under 0.3 alpha.
- **LEGEND at grazing light** whitened the whole face (sheen + glare). Pool 0.2, band 0.26, `::before` 0.1 + card-opacity * 0.28.
- **Do not put a sheen on gold ink.** Screen lifts gold to white: the first Prime pass bleached the name and the STAGE line.
  Cut them out of the frame alpha and let a soft-light gold band do the gleam.
- A foil layer's oversized background positions stay inside 0-100% (no `clamp()` with percentages in `mask-position`); the
  coverage script prints nothing.
- `foil_probe.mjs` times out screenshotting many lit cards at scale 3: 2-4 cards, one pose per run, or scale 2.
- WebKit (Playwright 26.0, `PLAYWRIGHT_BROWSERS_PATH=<dir with webkit-2215>`) renders all three finishes like Chromium,
  including `mask-mode: luminance` and the `source-in` / `intersect` composites.

## Gates run
`foil_coverage.mjs` on the probe set (22 cards: every frame variant) and dp1-dp3: prints nothing. `sweep_finishes.py --set dp1 dp3
--scale 2`: dark-speck check ok (the default scale 3 times out on the sheet writer). `foil_probe.mjs --idle`: no running animation,
0 ms main-thread work. Chromium and WebKit contact sheets: finish-sheets/h2/.

## Open
- No macro photo exists of any of these frames; grain size is tuned to video frames.
- Which LEGEND half goes on top when joined is the card order (first = top).
- Prime art: read as matte from three photos; if a better photo shows foil in the art window, light it with the cosmos tile
  and the same luminance zone.

## Review (rv-h2, fresh-context, first pass on the REAL hgss1-hgss4 scans; Chromium + WebKit 26, 220 px x 2-3)
Checked: all 26 Primes, all 18 LEGEND halves (hgss1-hgss4; col1 prints none of the three), 56 LV.X by mask choice and 30 rendered
(dp1-dp7, pl1-pl4, 15 SP incl. every pl2/pl3 one), poses rest 30:25 -30:-20 50:78, foil minus bare per zone (matte stays matte),
`dark_specks.py`, `foil_coverage.mjs`, the real app at iPhone 13 size (one hgss4 pack, the inspector of a Prime, a LEGEND half and
an SP LV.X, no-shine, Classic, foil strength 0.55 / 1.5), WebKit sheets of each finish. Sheets (rows: bare scan, 30:25, -30:-20, 50:78):
`/mnt/project-files/every-era/dp/finish-sheets/h2-review/` primes-chromium-1..3, legend-chromium-1..2, lvx-chromium-1..3, webkit-sample-1..2.
- LEGEND halves: the first number of each pair IS the top half on every scan (name bar down the left edge, art off the right
  edge); `legendHalf()` is right for all 9 pairs and the field join (the 300% field, 50% shift per half; cosmos masks 0% / 100%
  at 200%) carries the art across the pair.
- Found: LV.X and LEGEND veiled the art (mean +45..+80 levels in the window at 30:25: pointer pool 0.26, band 0.24 on a dark
  window turns it milky; Azelf, Magnezone, Mewtwo read grey-blue). Halved pool and band, `::before` confetti 0.12 + 0.26.
  Window now +20..25, the confetti and the sand on the silver border still lead.
- Found: the Prime frame bleached to plain white when lit (screen on a near-white scan cannot add colour, and it erased the spike
  shading). Rebuilt: `.foil` is a NORMAL-blend translucent paint over the frame (cool silver cast, a pearl / gold / blue / pink
  band sliding with the tilt, a pointer brightening); the rainbow lobe is normal too; the dust is the fleck tile used as a
  luminance mask over a spectrum (light pigments, never a screened tile). Rest stays the printed cream with a faint cast.
- Found: the consensus frame covered the last HP digit (the digits differ per card): `prime-*-v2.webp` cut the HP figure. The name
  box is alpha 1 / luminance 1 in v2 and `.foil` subtracts the luminance (`mask-composite: subtract`), so the gold lettering takes no
  sheen at all; the gleam (`.glare::after`) is `overlay` now, which lifts the mid-tone gold and leaves the cream / black plate alone
  (it was 30% soft-light, invisible).
- Found: the LEGEND attack panel was a hard-edged box (alpha step 1 -> 0.35). `legend-bottom-v2.webp`: the panel is feathered
  (9 px) and keeps 45%. The shipped v1 files stay as they were (never overwrite).
- Not changed: the glare (`.glare`, whole card, art-masked by the shared maps.css) adds +10 levels under the pointer on art and rules text of
  every finish here; it is the shared gloss, small, and the text stays legible. The name box leaves a visible clean rectangle on
  the pale plate of an hgss1 Prime (the plate is print on the real card too). Prime foil colours are tuned against three photos
  (Mew, Umbreon, Typhlosion) and no macro: if a macro turns up, the dust size (mask sizes 60 / 47 / 36%) is the thing to tune.
- Lessons: measure foil-minus-bare per zone (the sheet script is in the review folder's notes), do it on the REAL scans of every
  frame variant; a mask built from "what the 26 cards share" misses anything that varies per card (HP); a finish whose scan is near
  white must paint colour with a normal / multiply / colour blend, not screen.
- Gates after the fixes: `foil_coverage.mjs` on hgss1-4, dp1-7, pl1-4, col1 prints nothing; `dark_specks.py` on all 26 Primes and 18 LEGEND
  halves ok (the run straddled the Prime rewrite; the final CSS was checked by eye in the sheets); no existing asset touched.
- Open for the lead: `scripts/test-dp.mjs` already died at line 39 on the lead branch (dp-ar class string is now `foil-holo dp-holo dp-ar`)
  and, in a sparse checkout, at the missing `assets/cards/shared/` energy art; neither is this family. The Classic Collection reprints
  of these frames (cel25-cc107 Prime, cc109 / cc145 LV.X, me55-cc99 / cc100 LEGEND) carry no `era: dp`, so they never reach dpSpecialMap.
