# Family xy-break: BREAK (XY, 35 faces: 27 numbered + 8 promos)

Part of the older-era holo remaster (2026-10-02). Sheet: `css/holo/fam/xy-break.css`; module: `js/fam/xy-break.js`;
research, photos and sheets: `/mnt/project-files/holo-remaster/xy-break/` (refs/SOURCES.md lists every photo).

## Scope
Every `xy-break` print: 27 numbered BREAKs in xy8 to xy12 (xy8: 12, 50, 79, 92, 104, 113; xy9: 18, 41, 47, 66, 89; xy10: 14,
19, 51, 62, 79; xy11: 8, 21, 24, 35, 66, 82, 87; xy12: 16, 32, 46, 60) and the 8 `foilAs: "Rare BREAK"` Black Star promos
(xy8-xyp134/135/136, xy10-xyp154/155, xy12-xyp180/181/182). Famous ones: Greninja BREAK xy9-41, Lugia BREAK xy10-79,
Delphox BREAK xy10-14, Xerneas BREAK xy11-82, Yveltal BREAK xy11-66, Ninetales BREAK xy12-16, Raichu BREAK xy8-50.
The BREAK scans are portrait with the card art turned sideways (the card is landscape in the hand).

## What the real card does (6 BREAK cards, 5 photographers, see SOURCES.md; no macro photo exists online)
- Foil = the art background behind the CGI Pokemon only (TCG Live's foil map white). The Pokemon (gold print), the
  printed lightning and star sparkles, the yellow sunburst border, name bar, text and rule box are matte.
- Pattern: a grid of SQUARE cells, about 3.3 percent of the card's long side (3 mm). Each cell is a sectored radial
  grating: under one lamp it shows a BOW-TIE (two triangles meeting at the cell centre, pointing along the line to
  the light), the halves in different saturated colours (cyan + gold, green + orange); several lights make a full
  pinwheel (Yveltal). Cells are registered to the card (never slide), only the light moves.
- At rest or in diffuse light the field is pale grey silver with a faint X per cell and a two-tone checker; colour
  appears only in a band of cells (the rest stay silver or go dark), and the band sweeps with the tilt.
- The site's scans are digital renders: the foil zone is a plain white glow, no frozen foil, so the layer must draw
  the cells itself (unlike the WotC scans).

## What the site draws
- `.foil` (opaque, normal blend, base hsl(235,6%,79%)): silver mosaic. Per cell four facets with 4 degree anti-aliased
  edges (light left/right, dark top/bottom), a two-cell checker, a soft white sheen at the pointer. Masked by the TCG
  Live map (data `foilMap`, the era sheet's mask). Opacity 0.94 x `--foil-strength`, at rest as lit.
- `.foil::before` and `::after`: the two halves of the bow-tie. Each is a rainbow ring (conic-free radial gradient
  centred on the pointer, 100 x 72 percent of the card so the hue changes slowly) masked per cell by a crisp conic
  wedge (+-31 degrees) whose angle is `atan2(pointer - centre)` (all bow-ties parallel, along the light), a
  two-cell checker (neighbours alternate which half leads) and a flash zone: a band square to the line to the light
  through the light, plus a blob round it, floor 0.07. Colours are saturated, alpha near 1 inside the zone.
- `.glare`: soft-light varnish, no dark end.
- No tile image, no mosaic asset (the old `assets/foil/xy-mosaic.webp` is not referenced by this family).
- Five promos have no `foilMap` in the data; `js/fam/xy-break.js` points `--foil-map` at TCG Live's map converted by
  `scripts/fam/xy-break/make_promo_maps.py` into `assets/foil/fam/xy-break/maps/`.

## How to judge it
Phone size (220 css px x 3), WebKit: at rest silver cells and nothing coloured; at 30:25 a band of saturated
bow-ties, about a third of the foil, silver around it; at 50:78 (thumb low) the band still crosses the foil above the
text. Nothing coloured on the Pokemon, text, name bar, lightning or border.

## Gates (2026-10-02, WebKit scale 3 unless noted)
- `foil_coverage.mjs xy8 xy9 xy10 xy11 xy12`: prints nothing, exit 0. `foil_probe.mjs --idle` (xy11 66, 82): no animations.
- `dark_specks.py` (Chromium, scale 2, budget 40): rest 6-36; lit poses Xerneas 76-86, Yveltal 49-52, Raichu 38-44, Marowak 39-44.
  The marked blobs are single saturated blue, red and magenta flash cells (luminance well under the white scan, by
  nature) and small fragments next to printed lightning; nothing is a glitter dot. The detector cannot tell a coloured
  cell from a dark dot; it is the one gate this family does not pass.

## What remains
- No per-cell hue randomisation (the real cells differ cell to cell under several lights); the pinwheel of a card
  under many lamps is not drawn.
- The two-tone checker is tone only; the real one also alternates facet direction.
