# Sleeves: foil and gloss on the card backs

The sleeves from sealed products (Sleeves & coins page, and the card back of
every face-down card once equipped) are not cards, but they are lit by the
same engine. `css/holo/sleeves.css`; maps from `scripts/gear_foil.py`
(spec `scripts/gear/foil.json`); the research and photos in
`/mnt/project-files/sleeves-coins/holo/` (RESEARCH.md, photos/).

## What the real sleeves are (2026-10-01 research, 88 sleeves)

- **41 are plain**: a glossy print, no foil at all (every illustration sleeve,
  the Celebrations Pikachu pair, Hidden Fates birds, Dragonite, Zygarde...).
  They get only the varnish glare.
- **38 carry hot-stamped mirror foil on part of the print**: the Pokémon's
  line art or figure, the logo, a lattice or the corner panels. Silver (the
  Sun & Moon ETB figures, Pokémon GO Mewtwo, the Toolkit chrome corners,
  Calyrex, Kitakami trio), gold (the Mega Evolution outlines, Pikachu 30,
  Koraidon, Miraidon, Arceus, Crown Zenith Lucario, Giratina, the ETB Plus
  Poké Balls) or bronze/copper (Dusk Mane Necrozma, Ho-Oh, Tapu Koko, Shining
  Fates Eevee, the Silver Tempest champagne strokes). A stamped foil is a
  mirror: no texture, no rainbow bars; it flashes one broad bright band that
  slides with the tilt and goes dark on the far side, in its own metal colour.
  The ink around it stays matte.
- **Shiny Mimikyu** has a rainbow foil on its white outline and stars: a full
  spectrum along the line, drifting with the angle, white nearest the light.
- **Prismatic Evolutions ETB** is the only whole-face holo film: silver film
  under the print, showing cream, mint and lilac pearl patches wherever the
  ink is pale; the art stays put.
- 8 could not be settled from photos (Greninja, Mega Charizard X, Black Bolt,
  White Flare, the two Temporal Forces, the 30th UPC pair) and stay plain.
  Eight more rest on one photo each (Darkrai, Twilight Masquerade Ogerpon, the
  Silver Tempest sleeves, Toolkit 2023, the ETB Plus pair) and are lit.

## How it is built

- The map is drawn from the finished tile by colour: a metal family with
  hue, saturation and lightness ranges, or an explicit colour list with a
  tolerance when the foil's hue overlaps the ink (bronze on orange, the
  olive Rayquaza lattice), optionally boxed to the corner panels. Morphological
  open kills halftone speckle, close fills a figure, a soft edge of under a
  pixel. The map is a luminance webp next to the tile
  (`assets/sleeves/foil/<id>-v<v*10+mv>.webp`): never overwritten, bump `mv`.
  `gear_foil.py --dry --sheet out.png` shows tile, map and overlay; `--probe`
  prints a tile's main colours to pick thresholds from.
- `data/gear.json` carries `foil: {metal, map}`; `sleeveHtml()` adds
  `sleeve-foil sleeve-<metal>`, `--art`, `--foil-map`, a `.foil` and a
  `.glare`; plain sleeves get `sleeve-plain` and the `.glare` only.
  `cardBackHtml()` renders the equipped sleeve the same way wherever a card
  back shows (pack flip, battles, the gear page).
- Mirror metals: `.foil` masked by the map (`mask-mode: luminance`), a
  linear band at an angle driven by the tilt plus a pool under the pointer,
  `screen`, opacity rising with `--pointer-from-center`; `.foil::after`
  multiplies a dark band shifted along the same axis. Rest: 0.14.
- Rainbow outline: a spectrum gradient through `multiply` (the outline is
  white, so multiply colours it) with a white hot spot screened in so the
  nearest part stays white.
- Film: four pastel radial patches moved by the pointer over a 90% grey base,
  `multiply`, plus a white hot spot; rest 0.4.
- All layers are non-repeating gradients that cover the box at every pointer
  position, so nothing can seam.

## Judged against

The TCGplayer stack photos and the pokemon-sleeve-database flat scans in
`holo/photos/`, at 220 px x 3 in Chromium and WebKit, at rest, 30:25, 50:50,
75:65 and the thumb pose 50:78. WebKit drew the same as Chromium.
