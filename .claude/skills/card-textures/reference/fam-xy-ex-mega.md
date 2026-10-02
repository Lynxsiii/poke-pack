# Family xy-ex-mega: XY Pokémon-EX, Mega EX, Double Crisis EX (regular art)

Scope: every `xy-ex` face (187: xy1-xy12, dc1, g1 main-set EX, Evolutions' M Blastoise/Venusaur-EX, 40 black star promos).
Full arts and gold secrets are xy-full-art's. Files: `js/fam/xy-ex-mega.js`, `css/holo/fam/xy-ex-mega.css`,
`assets/foil/fam/xy-ex-mega/` (sparkle-v1.webp, 40 `<id>-map.webp`), `scripts/fam/xy-ex-mega/` (make_sparkle.py,
ship_promo_maps.py). Photos and notes: `/mnt/project-files/holo-remaster/xy-ex-mega/` (refs/SOURCES.md, sheets/).

## The real card (6 photographers: Bleeding Cool Leafeon-EX, Pokemon Holo Mewtwo-EX / Charizard-EX / M Blastoise-EX /
M Venusaur-EX / Gengar-EX / Team Aqua Kyogre-EX, Daniel Ortiz + SNC Grading + Double K M Charizard-EX, KauGon M Rayquaza-EX)
- Foil: the frame, the art background behind the Pokémon, the bottom strip and the gold plates (name tab, Mega badge, rule
  strip, Pokémon-EX rule box). Matte: the Pokémon, the text box, all lettering. TCG Live's per-card foil map says exactly this.
- Pattern: a fine sparkle grain; the rainbow is tall saturated VERTICAL columns of it (full spectrum in 3-4 percent of the card
  width, two or three per card) that slide sideways as the card tilts, brightest near the lamp (Mewtwo-EX 62 frames a/b).
- Not found: a true macro of the grain; a Team Magma's Groudon-EX photo.

## What was built (2026-10-02, from the shipped xy-full-art recipe, which passed review)
- `.foil` colour-dodge: four-cycle vertical rainbow columns x a pointer-centred radial, `brightness .62 .. 1`, closing in
  `contrast(0.8)`, masked to art AND the card's Live map (`--foil-map`), rest opacity 0.22, lit 0.22 + 0.78 x card-opacity.
- `.foil::after`: sparkle-v1 grain twice (second copy shifts with the light), screened: adds light only.
- `.cure` (module `cure: true`): hard-light two-stripe rainbow over art x map x scan-luminance floor 55 percent: tints the gold
  plates and pale frames the dodge cannot, keeps lettering matte.
- `.glare`: overlay hot spot, far end transparent (never dark).
- `xm-pale` (11 prints whose foil area scans pale, luminance under the map >= 165): dodge at half strength.
- 40 promos: Live's xybsp foil maps shipped as `<id>-map.webp` (they ran on a median safe map).

## Judge it
Phone size, WebKit and Chromium, poses rest / 30:25 / 75:65 / 50:78. Frame and background flash a saturated rainbow at 30:25
and 75:65, a soft sheen at rest, still colour at 50:78; Pokémon and text box within a few levels of the bare scan.

## Open
Gold "EX" in the name pales under the dodge (same as the old recipe's cream); no per-card etch exists (Live has none for
regular EX); foil strength low/high, shine off, reduced motion and Classic mode not re-tested this pass.
