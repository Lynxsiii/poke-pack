# Family dp-lvx: Pokemon LV.X (Diamond & Pearl, Platinum)

Module `js/fam/dp-lvx.js`, sheet `css/holo/fam/dp-lvx.css` (every rule scoped to `.fam-dp-lvx`). Research, photos, the first agent's
working log and review #1: `/mnt/project-files/holo-remaster/dp-lvx/` (refs/, AGENT-LOG-thread-b.md, REVIEW-1.md, sheets/).

## Cards claimed (75 faces)
Every `dp-lvx` print (rarity "Rare Holo LV.X", promos through their foilAs): dp1-dp7, pl1-pl3, pl4 (Arceus x3, Gengar, Salamence,
Tangrowth) and the DP promos (dpp, Arceus dpp53 / dpp56 included), SP LV.X (G, GL, FB, E4, C) included. The five Arceus LV.X
(pl4-94, 95, 96, dpp53, dpp56) were left on the era look in the first pass and are claimed in the second: the era map's border,
header and window fit their frame (overlaid on the scans); only their text box (printed silver rings) differs, and it stays matte.
Not checked against a real photo of an Arceus LV.X: whether the printed rings are foil on the real card.

## What the real card does (Bleeding Cool's Mesprit / Uxie / Azelf LV.X photos, Pokemon Holo's Darkrai DP19, Honchkrow, Machamp,
Dialga G, Garchomp C tilt clips; confidence: three photo sources plus video frames, no macro photo exists)
- Art window: cosmos holofoil, a galaxy of confetti glints (cyan, gold, pink, white) over a silver sheen, under the Pokemon's ink.
- Silver border and the strips round the window: big star-shaped sparkles and fine sand, one hot spot that slides with the tilt.
- LEVEL-UP ribbon and the rule box under the text: gold sparkle.
- Matte: the text box, the name plate, the attack text, the type and HP print. SP LV.X: the trainer badge on the art is plain print.

## What is built
The foil map is the era's (`assets/foil/dp-special/lvx.webp`, `lvx-sp.webp`, handed out by `dpSpecialMap()`): alpha = border, strips,
window and rule boxes. maps.css cuts the foil group to it. No new assets. Recipe (all screen blend, nothing colour-dodged, no black speck):
- `.foil`: a soft rainbow band whose alpha follows `--card-opacity` (0.05 rest, 0.2 lit), a faint pointer pool (white 0.06) and the pale
  cosmos tile. Opacity 0.78 at rest, 0.98 lit (the era's rest was 0.34). Filter saturate(1.5).
- `.foil::before`: the cosmos confetti. MASK = the two cosmos alpha tiles added, nothing else. A luminance layer intersected in (the
  era's way, and this family's first pass) draws almost nothing in WebKit: review #1 saw sparse pale confetti under a milky veil on
  dp4-104 and pl1-123 on the iPhone engine, fainter than `&fam=off`. Colour = a repeating 75deg spectrum, period about one card width
  (several saturated hues in the window at once), 200% wide, sliding with `--pointer-from-left`: 0.85 spectrum per full sweep.
  Opacity 0.68 + 0.16 x card-opacity.
- `.foil::after`: glitter tile multiplied by a saturated spectrum (one colour per fleck), brightness 1.3 contrast 1.4 saturate 1.8, over
  border and window; 0.67 spectrum per full sweep.
- `.glare`: light overlay pool (opacity card-opacity x 0.3, the era's level), dark end clear (alpha 0 grey), so a card under the
  thumb at 50:78 stays bright.
- `::before` / `::after` opacity is scaled by `max(1, --foil-strength)`, so "intense" does something; the foil group by `--foil-strength`.

## Judge it (the numbers that decided it, WebKit 26, 220 px x 3, window zone of the card; before = `&fam=off`)
Share of window pixels that are clear sparkles (local contrast over 25 levels) / the share of those that are saturated:
dp4-104 rest 4.7 / 0.8 -> 6.4 / 1.5; 30:25 6.8 / 0.9 -> 7.7 / 3.2; 75:65 8.0 / 1.4 -> 9.7 / 4.4; 50:78 8.1 / 1.6 -> 9.9 / 5.0.
pl1-123 Drapion, pl2-109 Luxray GL (SP), pl4-94 Arceus the same direction (sparkle 1.2-1.9x the before, coloured sparkle 2-6x).
Mean window saturation is within 0.01-0.04 of the before (a little lower when lit: the pale tile and band add light).
Foil layers only vs bare on a matte zone (Mesprit, 30:25, Chromium): text box +0.0 levels, rule box +0.5, name bar +9 (its edge touches the
frame). `dark_specks.py`: 0 specks on dp4-104/105, pl2-109/105, pl4-94/97. `foil_coverage.mjs dp1-dp7 pl1-pl4`: prints nothing.
`foil_probe --idle`: no running animation, 0 ms. Foil strength 0.55 and 1.5 render fine. Rainbow speed (cycles per full sweep, the
`rainbow_speed.py` tool only reads `--background-x` layers so these are computed by hand): band 0.16, confetti 0.85, sand 0.67; limit 1.5.
Sheets: `/mnt/project-files/holo-remaster/dp-lvx/sheets/`: phone-compare.jpg (real | before | after, 30:25, WebKit),
webkit-dp4-104-before-after-*.jpg (all four poses), webkit-drapion-luxray-arceus-before-after.jpg.

## Lessons
- WebKit and a multi-layer mask whose layers mix `mask-mode: luminance` and `alpha` (with `intersect`): draws almost nothing. Two alpha
  layers added work, and so does the foil group's own `art intersect map` pair. Test a new mask list in WebKit in isolation first
  (`--css` hiding `.foil` background and `::after`).
- A pale screened tile plus a white pool reads as a milky veil in WebKit; keep the pool at 0.06 and let the band's alpha follow
  `--card-opacity` so it is faint at rest.
- A measured check beats eyeballing: the sparkle share and the coloured-sparkle share of the window against `&fam=off` per pose.
- Chromium and WebKit are both in the box: `PLAYWRIGHT_BROWSERS_PATH` is preset for Chromium (`/opt/pw-browsers`); set it inline for one
  WebKit command (`PLAYWRIGHT_BROWSERS_PATH=/home/user/pw-webkit node ...`), never `export` it for the rest of the shell.

## Open
- The Pokemon in the window gets confetti and sand like the background; on the real card its ink hides most of it. A per-card map
  (window minus the Pokemon at about 25%) would match better: the first agent's BiRefNet silhouettes (scratch only) are the start.
- The rule box under the text and the LEVEL-UP ribbon are not lit gold on their own: the era map has no alpha there (measured +0.5
  levels), so the real card's gold sparkle on them is missing.
- Not run: Classic mode, reduced motion, a WebKit pass on the five Arceus promos and the pl3 SP cards beyond pl4-94 and pl2-109.
