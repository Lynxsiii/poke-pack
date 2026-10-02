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
