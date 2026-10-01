# XY: Pokémon-EX, Mega EX (regular frame), BREAK, Double Crisis EX

Sheet: `css/holo/xy-ex.css`. Classes from `xyPattern` (js/xy-foil.js):
`foil-ex xy-ex` (Pokémon-EX), `foil-ex xy-ex xy-mega` (Mega EX and Primal EX,
which the data tags `Mega`), `foil-ex xy-break` (BREAK), and
`foil-ex xy-ex xy-dc` (Double Crisis' Team Aqua's Kyogre-EX and Team Magma's
Groudon-EX, ids in `XY_DC_EX`, because the data calls them Rare Ultra). Full
art EX, gold and shiny secrets and the Radiant Collection are f3's (`xy-fa`,
`xy-secret`, `xy-rc`); the holo rare and reverses are f1's.

No asset of its own except `assets/foil/xy-mosaic.webp` (BREAK mosaic tile,
`scripts/make_xy_mosaic.py`, ~0.9 KB). Every EX, Mega EX, BREAK and Double
Crisis EX print has a TCG Live map (`assets/foil/maps/<set>/<n>.webp`, key
`xy5-5` for Double Crisis), so the sheet is built on those maps and nothing
is drawn. (A first version drew four frame maps from 135 scan measurements;
they were dropped, in git history only, when the real maps turned out to
exist for all 150+ prints.)

## What the real cards do (`/mnt/project-files/every-era/xy/texture-refs/f2-ex-mega-break/`, SOURCES.txt)

Two independent photographers (Bleeding Cool "Holographic History", iPhone
stills; the "Pokemon Holo" YouTube channel, hand-held tilt clips, via
YouTube's own thumbnail frames) plus Bleeding Cool's text. No macro photos
were found: grain size is a judgement from phone-scale frames.

- EX and Mega EX: foil on the frame border, the name tab and Mega badge
  (gold), the rule strip, and the energy burst and background behind the
  Pokémon. The TCG Live map keeps the Pokémon, the text box and the print
  matte (black in the map). The foil is narrow tall VERTICAL rainbow prism
  bars (2 to 3 percent of card width each: pink, green, blue, orange) that
  slide sideways as the card tilts, with fine white sparkle dust. The text
  box has a faint pearl, no rainbow.
- BREAK: a square MOSAIC of prism tiles (each about 3 percent of the card
  wide) behind the gold CGI Pokémon: mostly light silver with a few blue,
  cyan, magenta and green tiles that flip colour as the card moves, plus
  thin lightning and pinpoint sparkle. The Pokémon, the yellow border, the
  title bar and the BREAK rules box are plain. The scans are portrait pages
  with the landscape art rotated in, and the TCG Live maps follow the same
  orientation: no rotation anywhere.
- Double Crisis EX: full-bleed art behind the text; vertical prism bars on
  the left third and across the bottom, under the printed text; art colours
  stay put.

## Recipe

EX, Mega, Double Crisis (`.xy-ex`, any `:is` guard also keeps `.xy-break`
out):
- `.foil` is screened (`mix-blend-mode: screen`, never colour-dodge: pale art
  cannot blow out and Safari has no divide-by-zero to draw). It carries a
  faint pearl sheen (115deg, 26 percent) and a pointer radial.
- `.foil::before`: the prism bars. `--xb-prism` is a 12 percent-period
  `repeating-linear-gradient` of six saturated hues (colour steps of 2
  percent: wide enough that nothing aliases into a line screen on a phone),
  masked by TWO soft single lobes (`--xb-gate`, 14 percent of a 200 and a
  260 percent wide mask image) that move against each other with
  `--background-x`, so a card shows bars where "the light finds them" and a
  quiet sheen elsewhere. Opacity `0.62 + pointer-from-center * 0.3`.
- `.foil::after`: the glitter-fine sparkle sheet, screened, light only.
- `.glare`: an overlay radial at 0.32 of the card opacity. Everything else
  of the `xy` base is reset.

BREAK (`.xy-break`):
- `.foil` is the mosaic tile at 25.6 percent (a tile is 8 x 8 squares of 3.2
  percent), repeated, `multiply`, with `hue-rotate(background-x * 5deg -
  180deg) saturate(1.2)` so the tiles shift colour as the card tilts. Seeded
  60 percent silver, the rest pastel. Rest: `hue-rotate(0) saturate(.8)`.
- `.foil::before`: the sparkle sheet, light only. `.glare`: overlay 0.4.

## What the reviews will catch (lessons from building it)

- `clamp()` inside `mask-position` with percentages is MIS-RESOLVED by
  Chromium: getComputedStyle reports the right number but the paint puts the
  lobes on the card edges. Use a plain `calc()` that already stays inside
  0..100 (`--background-x` is 37..63 percent). Found by pinning the pose and
  painting the layer red; the explicit `65.6% 0` painted right while
  `clamp(0%, 65.6%, 100%) 0` did not.
- A pseudo-element's mask position needs both `-webkit-mask-position` and
  `mask-position`; setting only the prefixed one is ignored in Chromium.
- Specificity: `body.fx-holo.fx-holo.fx-holo .tcg` + `era-xy` x5, like SM.
- Too much on a pale or dark-busy art bleaches it (Trevenant-EX, Sharpedo-EX
  were washed out by a broad sheen, a 28 percent-wide lobe and a bright
  glare). Keep the sheen at 26 percent and the glare at 0.32; the real map
  already hides the Pokémon.
- The real map is dark over the Pokémon: bars look weak on a pale Pokémon
  card and strong on busy backgrounds, as on the real cards.
- BREAK at rest has a faint pink peach glow at the map's soft edge around
  the Pokémon (the map's blurred silhouette times the pastel tiles); real
  cards show the mosaic faintly at rest too.

## Verification

Chromium and WebKit 26 (Playwright 1.56), 220 px lab scale 3, poses rest,
30:25, 75:65, 50:78: xy4 to xy12, dc1, g1, xyp (every EX, Mega, Primal,
BREAK, Double Crisis EX). `foil_coverage.mjs` prints nothing over all XY
sets; `sweep_finishes.py` no dark specks on any card of mine. Contact
sheets: `/mnt/project-files/every-era/xy/finish-sheets/f2-ex-mega-break/`.

Ancient Trait (Ancient Origins): a printed trait on ordinary Pokémon cards, not
on EX; the card keeps its own foil (f1's holo rare or plain rare), so there is
no class of its own here.
