<!-- Family note for the holo family wotc-skyridge (older-era holo remaster, 2026-10-02). Research: /mnt/project-files/holo-remaster/wotc-skyridge/. -->
# wotc-skyridge working notes

Family: Skyridge (ecard3, 2003) Rare Holo H1-H32 (32 faces, all `wotc-ecard`, all Pokémon, Basic/Stage 1/Stage 2 in the one
e-Card frame). Crystals 145-150 = wotc-crystal; the e-Card reverse = wotc-expedition.

## What the real card does (sources in refs/SOURCES.md)

- **Where the foil is**: the art window's background (the whole window minus the Pokémon, which has a white underlay and
  stays clear), plus three frame features printed over foil: the two groups of notch bars on the left edge, the 13 slots
  along the bottom, the "e" logo + star at the bottom left. Matte: the yellow border, name bar, HP, evolution circle, the
  text box and all text, the Stage/illustrator line. (PSA 10 Gengar flat scan; Cloyster/Alakazam lamp photos; the bars
  and slots sparkle in Raichu/Raikou/Gyarados clips.)
- **The brief's hint**: "holo in the art window" = true; "text stays matte" = true; "the e-reader dot strip stays matte"
  = not applicable: an H holo has no dot strip, and its slots strip is foil-through-ink (it sparkles).
- **Pattern**: the e-Card cosmos sheet: a fine dot-matrix ground (pitch ~0.2 mm, invisible at phone size) carrying
  irregular elements: 0.3 mm dots, plus/cross shapes, 1-3.3 mm discs, 8-arm snowflakes (~2.7 mm), short dashes and pairs,
  ~0.4 per mm². The sheet repeats every ~0.8 x 0.6 card, so no repeat shows inside a window. The scan already holds the
  elements (frozen) wherever the ink lets them through.
- **Light**: each element lights one saturated colour; the colours follow a smooth spatial rainbow across the window
  (violet/blue -> cyan/green -> yellow/orange in the Cloyster photo) that slides as the card tilts. Off the specular angle
  the ground stays dark and only elements twinkle; near specular the ground goes a broad silver-white sheen (Gyarados,
  Raichu, Raikou). Ink over the foil tints the light (green foliage -> green, orange ground -> gold, red -> pink, purple ->
  pastel). In room light (PrimetimePokemon, in hand) it is a soft grey-silver sparkle with pastel specks: the art reads.
  At grazing angles in a lamp the cosmos can wash the background art out completely (Elite Fourum t/45740).
- **What stays matte while lit**: the Pokémon (no change), the text box, the border.

## Today's recipe (BEFORE) and what is wrong with it

`css/holo/wotc-ecard.css` `.wotc-ecard` + per-card `holo-ecard3-<n>-v1.webp` maps (window x blurred speck density, floored)
over the 768 px `cosmos-v1.webp` tile. Problems seen in the BEFORE renders: the tile's synthetic flakes do not line up with
the scan's real elements (two patterns on top of each other), the colour is a broad wash, the blurred density map spills
light onto the Pokémon's edges and dark bodies and leaves the frame features dark, and at rest the window is a flat
grey-ish lift. It reads as "a texture laid over the card", not as the card's own cosmos lighting up.

## Plan (built)

- Per card, from its own scan (script `scripts/fam/wotc-skyridge/make_skyridge_maps.py`):
  - `ground`: the window minus the Pokémon (GrabCut seeded by the scan's speck density and per-card hint strokes).
  - `specks`: the scan's own cosmos elements (compact bright blobs on the ground and in the frame features).
  - `frame`: the left bars, the slots and the e logo (measured once on the 32 scans).
- The light rides the scan's own elements: they light in a sliding rainbow; near the pointer the ground gets a silver
  sheen; the Pokémon, the text and the border get nothing.
