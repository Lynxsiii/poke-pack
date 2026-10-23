# Holo family swsh-reverse: Sword & Shield reverse holos

Module `js/fam/swsh-reverse.js`, sheet `css/holo/fam/swsh-reverse.css`, assets `assets/foil/fam/swsh-reverse/`,
generators `scripts/fam/swsh-reverse/`. Built 2026-10-22 (holo accuracy overhaul) from the w2-swsh-reverse audit.

## Scope

2,078 faces: every Sword & Shield reverse the era paints with the chevron sheet (`rev-swsh`: Pokemon by type, Trainers)
plus the 23 Special Energy reverses, which the era left to rarities.css's generic cosmos reverse (reverseFinish() in
js/foil-maps.js returns "" for any Energy). Same faces as the old census, nothing else.

## The real card (photos in /home/user/holo-refs/w2-swsh-reverse, sources in its SOURCES.md)

- WHERE: everything type-coloured but the art window: the name band, the thin strips beside the window, the body down to
  the illustrator line. Matte: the window, the yellow border, the stage label and evolution box, the HP type circle,
  each attack's cost dots (they stay white: Oddish CRZ 001, Golduck EVS 025), Ability / Rapid / Single Strike banners,
  the weakness bar. Trainers: the text box below the picture and the strips beside it; the Supporter / Tool plates are
  printed over it (Peonia CRE 149). Special Energy: the text box only, stars in discs (Spiral Energy CRE 159).
- PATTERN: 7 columns of up-pointing chevrons, the columns offset by half a cell, one type icon per cell. TCG Live's
  maps have the right geometry: pitch 45.7-46 px, period 60 px, chevron depth 12 px at 367 x 512.
- TONE: every cell its own tone (column-dominant, with cell to cell variation: Bidoof PGO 059 runs from near-white to
  near-black columns, Oddish CRZ is gentler), every icon DARKER than its cell with its veins at the cell's tone, thin
  darker separator lines (Oddish CRZ, Golduck EVS zooms). Live alternates white icons in dark cells: never seen on a card.
- COLOUR AT REST: deeper and more saturated than the regular print our scan is (Weedle CRE 001 reverse beside its
  regular print). Body medians, photo / scan, measured on the text area (`tools/m.py` in the work dir): grass
  (89,154,53) / (174,209,76) Oddish CRZ; water (76,135,205) / (112,202,242) Golduck EVS; fire (166,68,39) /
  (244,123,71) Slugma FST; fighting (152,95,44) / (222,149,46) Claydol SSH; lightning (163,147,36) / (255,229,35)
  Blitzle CRE; metal (154,159,160) / (211,218,220) Aggron CRE; colorless (178,175,162) / (240,237,233) Bidoof PGO;
  Trainer (172,187,189) Peonia CRE; psychic (82,20,77) / (184,127,182) Hypno EVS (one dark photo: held back to about
  (100,45,95)); darkness (60,77,75) / (11,63,62) Vullaby FST (lighter than the print: slate with black moons).
- LIGHT: a broad soft glow (about 40% of the card) lifts the lit cells, the icons stay dark; faint green / peach drift,
  fine metallic grain; no rainbow bands (Zarude, Shinx, Blitzle, Porygon2, Aggron CRE).
- Celebrations (cel25) has no reverse set and Trick or Trade 2023 prints no reverses; Astral Radiance's TG01-TG12 are
  holo only. The data builds reverse faces for them (19 + 10 + 12): a data issue, flagged; the family paints them like
  their type so they at least look like a reverse. Celebrations' two full-art prints (Pikachu 005, Mew 025) get no
  reverse at all (their mask is empty): chevrons over an illustration have no real card behind them.

## The recipe

1. `.foil`, every pose: hard-light of [`--swr-tint` x (white veil `--swr-flat`) x `tone-<type>-v1.webp`]. Below 0.5 a
   multiply (cells deepen by their tone, icons to about half), above 0.5 a screen (Darkness only: the near-black teal
   lifts to slate, the moons stay black). Tints in the sheet, set from the medians above (tint = ratio / (2 x 0.72)).
2. `.glare`, lit: colour-dodge of [grain-v1 x a static green..peach drift x a pointer pool (radius about 45% of the
   card, peak `--swr-gain`: 0.52, silver types 0.28-0.3, Darkness 0.35) x the tone sheet squared]. Colour-dodge is a
   gain, so ink keeps its hue (no white veil); the squared sheet keeps icons and dark cells low.
3. Mask: `--art` x the print's own mask (`mask-v1/<set>/<n>.webp`, from Live's `<key>_en_<nnn>_ph.foil.png`; less
   Live's flat plates, its white lettering islands and anything inside the window box such as the Strike badge).
   Celebrations (no reverse map) masks the era's median alpha with Live's holo map (`swsh7-5_en_<nnn>_std.foil.png`:
   less the window rows, nothing on a full-art print). NO_MASK in the module (27 faces with no Live map: Trick or
   Trade, the TG reverses, the Classic Collection Venusaur and 4 others) falls back to the era's median alpha less the
   window.

## Generators

- `make_tiles.py`: folds Live's median tile (assets/foil/swsh-reverse/<type>.webp) onto one cell, averages every cell
  into an icon stencil and a separator stencil, redraws the lattice over the whole card at 734 x 1024 with the new tones.
  `--live-dir` with the 23 Special Energy maps also draws `energy`. Also writes `grain-v1.webp`.
- `make_masks.py --census census.json --cache DIR [--download]`: the per-print masks (Live's `_ph` reverse maps,
  `_std` holo maps for Celebrations) and the NO_MASK list.

## Results (WebKit, 220 px x 3; body median luminance rest -> lit)

Oddish CRZ / Weedle CRE rest (94,154,54) against the photos' (89,154,53) and (108,146,59); Weedle 125 -> 136..152;
Golduck (66,125,191) -> tint raised 7%; Slugma (171,68,41); Claydol (151,92,43); Blitzle (174,150,35); Aggron
(144,150,155); Bidoof (168,167,158); Peonia (181) against 182. Before/after sheets: /home/user/holo-work/fix-swsh-reverse/ba-*.jpg.

## Open

- Live's cut-outs follow the print, so a scan from another printing could be a pixel or two off; none seen.
- The lit glow is one pool for every cell; the real cards also flip whole columns light / dark with the tilt angle.
- Psychic rests on one photo; Dragon on none (tint by analogy with fighting / metal).
