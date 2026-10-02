# Family xy-sheen-holo: XY Sheen Rare Holo

Module `js/fam/xy-sheen-holo.js`, sheet `css/holo/fam/xy-sheen-holo.css` (every rule scoped to `.fam-xy-sheen-holo`),
generator `.claude/skills/card-textures/scripts/fam/xy-sheen-holo/draw_windows.py`, assets
`assets/foil/fam/xy-sheen-holo/win/<id>.webp`. Photos and notes: `/mnt/project-files/holo-remaster/xy-sheen-holo/`.
Scope: 174 faces (after review #1): every Sheen `xy-holo` Rare Holo of xy0-xy11, Double Crisis, the Mirror xyp promos and the
trainer kits (not Evolutions' Starlight, not Generations' Radiant Collection, not McDonald's, and NOT the 61 Cosmos black-star
promos: they fall through to the era sheets, see Review #1 below).

## What the real card does (sources: Collexy XY holofoil overview, Cardveil holo patterns, YouTube tilt clips of
Raichu xy1-43, Raikou, Infernape, Gyarados xy7-21, Furfrou, Delphox xy10-13, Gengar g1-35, Beautifly, Salamence,
Azumarill, Hawlucha, Pikachu Libre kit, Tyranitar XY130, Pangoro XY50, Celebi XY187)
- **Sheen** (numbered sets, Double Crisis, Kalos starter set, kits, "Mirror" promos): smooth foil under the art
  background, no pattern; the Pokemon and any printed logo stay matte (Tyranitar XY130: green body and the Fates
  Collide logo matte, rainbow wedge behind). Tilted, broad saturated bands (cyan, green, magenta, yellow) sweep the
  picture on a rising diagonal; a fine sand and a few glints ride on them. Frame, name bar, text box matte.
- **Cosmos** (blister/tin/collection black-star promos): dots (planets, specks) lit one colour each under the same
  broad rainbow, over the WHOLE art window including the Pokemon (Pangoro, Celebi, Mew photos).

## What is built
- `.foil` = a 55 degree spectrum (two cycles of different width, mid-brightness hues, near-black gaps between the
  bands so the art keeps its own colour and contrast between them; about 1.5 cycles cross the card) colour-dodged onto
  the scan under a pointer pool whose floor is 66% grey (so the thumb pose still shows colour), `contrast(0.8)` at the end of
  the chain for Safari. `::before` a crisp white flare band with rainbow edges that runs twice as fast. `::after`
  the era's glitter tile at two scales, screened (sand). `.cure` a pastel twin multiplied on pale art (colour-dodge
  cannot tint white: Furfrou, Pikachu Libre's sky). `.glare` a soft overlay hot spot.
- Foil area = TCG Live's per-card map where the print has one (174 faces). The 25 mapless Sheen prints (xy0 starter
  set, Mirror promos, kits) get a window drawn from their own art with the Pokemon cut out (GrabCut,
  `draw_windows.py`) and the Fates Collide logo box cut: without it the strong sheen washed the Pokemon pastel.
  The 36 mapless Cosmos promos keep the era's whole-window map, which matches the photos.

## How to judge it
Render in WebKit at 220 CSS px x 3 (rest, 30:25, 50:78) beside the real photos. Chromium draws the dodge weaker than
Safari. Matte zones (Pokemon on a mapped card, text box, frame) must stay within a few levels of the bare scan.

## History and what the passes taught
- First pass (earlier agent, 2026-10-01 22:25): spectrum with no gaps, pool floor 50%, rest opacity 0.26: in Chromium
  barely visible at the thumb pose and at rest. Pass 2 (2026-10-02): pool floor 66%, rest 0.5, sand layer; the whole
  background went pastel (Delphox native crop) because every pixel of the window got a dodge. Pass 3: dark gaps
  between broad bands (a dodge by almost nothing leaves the art alone), flare white 0.78. WebKit sheets at 220 px x 3:
  `/mnt/project-files/holo-remaster/xy-sheen-holo/sheets/`.
- BEFORE (master, `?fam=off`) at 50:78: Greninja, Talonflame, Raichu look like the plain scans; AFTER: visible
  rainbow on all three.

## Still not as good as the real card
- The real foil's sand and star glints are macro-scale detail no photo here resolves: the sand is the era's glitter tile.
- 36 mapless Cosmos promos use the era's whole-window map; if a real card shows a matte Pokemon there the cut-out
  script can draw it (add the ids to `IDS` in `draw_windows.py` and to `DRAWN` in the module).
- xyp067a (Jirachi, borderless frame) keeps the era's window.

## Review #1 (2026-10-02 17:30) and the fixes
- Blocker 1, Sheen too pale and milky: the `.foil::before` flare (white core 0.55, rainbow edges 0.9, screened into the colour-dodge
  source) took Delphox xy10-13 from saturation 112 to 36 at 30:25 (Suicune 112 to 58). Hiding it alone brought saturation
  back; spectrum lightness changes did nothing. Fix: that rule's opacity x0.35 (Delphox 66-74, Suicune 77-85, dark cards
  stay vivid). `.glare` 0.75 to 0.5 as well (it lifted matte zones 14-18 levels).
- Blocker 2, Cosmos promos drew chunky pixel squares and turned a dark body magenta: the `xysh-cosmos` `::before`/`::after` mask a
  bright rainbow through the era's `cosmos-middle-trans.webp` / `cosmos-top-trans.webp` (1-3 px square specks, drawn at
  `mask-size: 200%`, so 2x blocks). Fix: `COSMOS` ids are no longer claimed; master's look (round glitter, dark body)
  draws. The `xysh-cosmos` rules in the sheet are unused until the cosmos layer is redrawn with round soft dots.
- Measured by the reviewer: Chromium and WebKit agree within a few levels on this recipe.

## Cosmos v2 attempt (2026-10-02 18:20): rendered, judged, NOT claimed
- Built: `assets/foil/fam/xy-sheen-holo/cosmos-dots-v1.webp` (`scripts/fam/xy-sheen-holo/make_cosmos_dots.py`: 326 smooth round dots of
  three sizes on an 800 x 1120 canvas, lossless, masked at 100%), the `xysh-cosmos` rules in the sheet (rainbow screened through the dots, wink
  glints on a shifted copy, dodge ground), and per-card windows with the Pokemon cut out for the 36 mapless Cosmos ids
  (`win/`, `draw_windows.py <ids>`). `claims()` still excludes `COSMOS`, so none of it draws.
- Result in WebKit at 220 px x 3, 30:25 and 50:78, against master (`?fam=off`): Pangoro xy6-xyp050 better (dark body and white head stay
  clean, master washes them pink, round soft dots); Celebi xy12-xyp187 not better (master's fine sparkle dust on the swoosh is missing,
  and the dodge ground puts a purple cast on the dark forest); Mew xy12-xyp192 not better at 50:78 (master has more fine star sparkle).
- To finish: drop the dodge ground, add the fine sand (`glitter-fine.webp`, screened) under the round dots, re-render Celebi and Mew,
  and remove the COSMOS test from `claims()` only if all three win. Sheets: `sheets/cosmos-real-master-after-webkit.jpg`.

## Cosmos v3 (2026-10-02 18:27): claimed again
- v3 drops the colour-dodge ground (it put a purple cast on dark art): `.foil` is a plain group screened onto the print; inside it `::before` is
  fine sparkle (glitter-fine tile at two scales, one sliding with the tilt) and `::after` the round soft dots (cosmos-dots-v1.webp, one smooth
  alpha texture masked at 100%, intersected with the card's map or a drawn window), coloured by a gapless spectrum.
- WebKit 220 px x 3 vs master: Pangoro (clean dark body, round dots), Celebi (dark forest with fine sparkle, no purple cast) and Mew (dark sky with
  sparkle, no pink wash) all read closer to the real cards. The 61 Cosmos promos are claimed again; sheet `sheets/cosmos-v3-real-master-after-webkit.jpg`.
- Trade-off: master's large rainbow flashes (Mew at 30:25) are gone; the real Cosmos cards show white sparkle on dark, not a big band.

## Cosmos window QA pass (2026-10-02 19:00): full-bleed cards, motion
- The 36 mapless Cosmos promos draw a window from their own art (`win/<id>.webp`, `draw_windows.py` then `draw_windows_v2.py`). QA overlay (magenta =
  foil) found eight with foil on the Pokemon or a straight-edged block: the six FULL-BLEED prints (Fearow xy7-xyp057, Malamar xy7-xyp058,
  Salamence xy7-xyp059, Regirock xy6-xyp049, Sableye xy8-xyp092, Celebi xy8-xyp093: the art runs under the whole upper card, the Ability or
  Ancient Trait bar and the attack text are printed over it, so the era's art-window rectangle is the wrong shape and cut straight edges
  through the art), Rayquaza xy6-xyp064 (cloud cut out as "Pokemon", tail foiled) and Pikachu xy9-xyp095 (Chespin and Sylveon foiled). Master draws
  a rectangular rainbow block over the Pokemon and the Trait bar on exactly these cards (WebKit sheets `before-after-webkit-cosmos-*.jpg`).
- Fix (`scripts/fam/xy-sheen-holo/draw_windows_v2.py`, seeded): a full-bleed card's foil area is the art zone UNDER the printed bar (x 28..572, y 142..466 of
  600 x 838, fading over the last 36 px above the attack text) minus the Pokemon. The Pokemon comes from its own colours where they separate
  (Fearow warm pixels, Celebi light green, Sableye violet, Malamar saturated blue plus a belly polygon, Rayquaza green), from colour-seeded
  GrabCut (Salamence) or a hand polygon refined by a 14 px GrabCut band (Regirock: white and cream on cream). Gotcha: key INSIDE the art zone, the
  yellow card border is "warm" and "green" too and joins the Pokemon into one filled blob (Fearow first came out with 3% foil).
  Xerneas xy1-xyp005 (antlers, legs), Greninja xy12-xyp162 (dark navy limbs) and Trevenant xy3-xyp014 (brown roots, pink curl) got patches over the
  first-pass window. The 25 Live-mapped Cosmos ids were checked on an overlay of their maps: soft, art-shaped, no blocks; kept as shipped.
- Motion (Noah 18:44, "the rainbow moves way too fast"): `js/card-motion.js` drives `--background-x` over 37..63% and `-y` over 33..67%, and the
  sweep offset is (50% - bg) x multiplier on a 300% layer, so one pointer sweep moves the colours by `range x multiplier x 2 x cos/sin(55deg) /
  period` cycles. Cosmos now: period 32% of the layer (one rainbow across the card), multiplier 0.8 (the Sheen uses 1.6): 0.22 cycle across, 0.28 up the
  card, 0.5 corner to corner (twice that before). The sparkle layer that slid with the tilt drifts at x0.6 (was x1.2).
- Gates this round: foil_coverage xyp xy1..xy12 prints nothing; check_asset_overwrites ok; sweep_finishes --check-only reports nothing for this
  sheet; dark_specks xy7 xyp057,xyp058 at rest, 30:25, 50:78: 0 specks; `foil_probe --idle`: no running animations; census 61 of 61 Cosmos ids claimed.
- Open: pale art (Pikachu xy9-xyp095, Regirock's cream glow, Blissey, Ditto) shows the foil faintly because screened light cannot brighten white;
  a multiply tint would show there but was not designed tonight. No real photo exists of the full-bleed prints: judged on the layout (matte Pokemon,
  matte Trait bar and text) and on the Live-mapped Cosmos photos.
- Rest state (found 19:22, fixed): `css/holo/base.css` sets `display: none` on `.glare`, `.foil::before` and `.foil::after` of every card that is not
  `.lit` or `.settling` (binder scroll performance), so Cosmos v3's sparkle and round dots (both pseudo layers) never drew at rest: a resting
  Cosmos promo was the plain scan (lab foil-minus-bare at rest: 0.0 levels). A finish that must show at rest paints on `.foil` itself. The rest rule
  draws the dot spectrum on `.foil` with the dots as a third mask layer (`--art`, `--foil-map`, `--xysh-dots`, `mask-composite: intersect,
  intersect, add`) at opacity 0.8, so a few coloured round dots read on dark art before the card is touched; the sparkle joins in the hand.
