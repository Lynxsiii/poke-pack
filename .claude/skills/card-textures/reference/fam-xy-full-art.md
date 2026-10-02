# Family xy-full-art: XY full arts, secret rares and the black star full-art promos

Part of the older-era holo remaster (2026-10-01/02). Module `js/fam/xy-full-art.js`, sheet `css/holo/fam/xy-full-art.css`,
assets `assets/foil/fam/xy-full-art/` (Live etches and promo maps, 159 files, 24 MB, none over 400 KB), scripts
`scripts/fam/xy-full-art/ship_live_maps.py`, research, photos and sheets in
`/mnt/project-files/holo-remaster/xy-full-art/` (refs/SOURCES.md, sheets/, NOTES.md, REPORT.md).

## Scope (172 faces, `famcensus.mjs`)

Every `xy-fa` print outside the Radiant Collection and every `xy-secret`: full-art EX and Mega EX, full-art Supporters,
the gold Mega secrets, the shiny secrets of Ancient Origins, the gold Items, Dialga-EX 122/119 (silver), Generations'
Articuno 25 / Zapdos 29, and the black star full-art promos (g1 xyp110-126, xy8 xyp074-083, xy10 xyp103, xyp 150a / 177a /
198 / 198a / 200 / 200a). 129 prints carry a TCG Live etch map, 28 promos a Live foil map shipped as `<id>-map.webp`.

## What the real cards do

- **Full-art EX, Mega EX, Supporters** (photos: Lysandre 104, Lysandre's Trump Card 118, M Rayquaza 98; YouTube frames in
  `every-era/xy/texture-refs/f3/`): foil edge to edge, the frame and text box included; tall narrow vertical rainbow columns,
  several per card, that slide sideways with the tilt; the printed art keeps its colours; the surface is textured
  ("Textured Holofoil", Bulbapedia), TCG Live's etch map is the texture and is a contour/fingerprint field.
- **Gold secrets and gold Items** (M Charizard-EX 108, Dive Ball, Weakness Policy, Trainers' Mail photos): the same foil under gold
  ink. The rainbow shows as ONE bright band across the art and the white text box; the gold border and the lettering do not
  change hue.
- **Black star promos** (Mew XY110 photo): narrow sharp vertical rainbow bars over the background only; the Pokémon and the
  yellow border are matte (Live's promo map).
- **Dialga-EX 122/119**: silver, white line art; the foil must not wash the line art out.
Confidence: 2-3 photos per finish; none shows the micro texture (Live's maps do).

## What was built

- `.foil` (colour-dodge): vertical rainbow columns (4 spectral cycles across the card, sliding with the pointer) cut to the
  Live etch (lines full, 50% floor between) and to the card's own Live foil map (lettering matte). Every chain closes in
  `contrast(0.8)`; every layer the era sheets paint is reset first.
- `.foil::before` (etched prints): the ridges one step along the spectrum; `.glare::after`: the lamp on the ridges;
  `.glare` (overlay): the hot spot, far end clear.
- `xyf-cure` (gold Mega secrets with no Live etch, gold Items, every black star promo; module returns `cure: true`):
  the `.cure` layer paints a vertical rainbow stripe in `hard-light` (plus a fainter counter-stripe travelling the other
  way), masked to the art silhouette, the Live foil map and the scan's own luminance over a 55% floor (hard-light turns
  black ink coloured; the floor keeps near-black lettering readable). Colour-dodge cannot tint gold or white ink (a channel already near 1 stays
  there), hard-light can.
- `xyf-pale` (table `PALE` in the module, scans whose art luminance is >= 175: Wally, Shaymin-EX, Altaria-EX, Dive Ball,
  Weakness Policy, Mew xy110 ...): the dodge at half strength (it clipped pale ink to white) plus the stripe.
- `xyf-silver` (Dialga-EX 122/119): every rule of this sheet steps aside (`:not(.xyf-silver)`) except a `.cure` stripe, a
  pastel rainbow band MULTIPLIED on the silver (lightness 88%, floor about 80%); the era's multiplied-on silver recipe
  draws the rest. The dodge columns washed the line art to white, multiply cannot.
- The four "a" promos (xyp150a Yveltal-EX, 177a Karen, 198a M Camerupt-EX, 200a M Sharpedo-EX; the Premium Trainer's XY
  Collection reprints) draw smooth (the drawn etch the first pass planned was never made) and on a background-only foil map,
  never the all-white fallback (Review #1: it bleached the Pokémon and the lettering): xyp150a ships Live's xybsp 150 map
  (`assets/foil/fam/xy-full-art/xyp-xyp150a-map.webp`, `A_PRINT_MAP` in ship_live_maps.py), xyp198a / xyp200a point `--foil-map`
  at the shipped `assets/foil/maps/xyp/xyp198.webp` / `xyp200.webp` (`BORROWED_MAP`), and Karen (Live has no xybsp 177) is `xyf-pale`
  + `xyf-nomap`: half dodge and the stripe at 0.42 instead of 0.85.

## How to judge

`foil_probe.mjs --query "set=xy2&cards=108,104&proof=off&w=220&poses=rest,30:25,75:65,50:78" --browser webkit --scale 3`
(add `&fam=off` for the before). Promos need `site_cards.mjs --set g1 --ids g1-xyp110,...`. Look for: a vertical rainbow band
on gold and pale cards at 30:25, art tones kept (not milky), the lettering matte, Dialga's line art intact.

## What remains

- Dialga-EX is the era silver recipe plus a pastel stripe: striking only at the stripe, otherwise the era's look.
- The stripe is one wide pastel band; the real photos show a narrower, more saturated stripe.
- No macro photo of the real etch; the 4 "a" promos are smooth, the real ones are textured; Karen xyp177a has no map at all (the strongest lift of the four, +43 at 30:25).
- Rest state of gold prints is the scan (the stripe exists only while the card is held).
