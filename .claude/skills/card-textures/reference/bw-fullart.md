# Black & White full arts, secret rares and the Radiant Collection (css/holo/bw-fullart.css)

Family g3 of the Black & White era (branch `bw/g3`). Classes come from `bwPattern()` in js/bw-foil.js
(`era-bw` marks every print):

| class string | prints |
| --- | --- |
| `foil-ultra bw-fa bw-flat` | flat full arts of bw1-bw3 (Reshiram, Zekrom, Thundurus, Tornadus, Terrakion...) and N |
| `foil-ultra bw-fa` | textured full-art Pokemon-EX, bw4-bw10 (Team Plasma ones too) |
| `foil-ultra bw-fa bw-tfa` | full-art Supporters (Bianca, Cheren, Skyla, Colress, Ghetsis, Juniper, Iris) |
| `foil-ultra bw-secret bw-yellow` | yellow-bordered secrets: bw1 Pikachu, bw3 Meowth, the shiny reprints of bw4-bw6 |
| `foil-ultra bw-secret bw-gold` (+ `bw-item`) | gold-bordered secrets of bw7-bw10 and the gold Items |
| `foil-gold bw-secret bw-gold bw-goldfull` | Legendary Treasures' gold Reshiram and Zekrom (bw11-114, 115) |
| `foil-holo bw-rc` / `foil-holo bw-rc bw-rc-fa` | Radiant Collection RC1-RC20 / RC11 and RC21-RC25 |

Photo research with every caveat: `/mnt/project-files/every-era/bw/texture-refs/g3/SOURCES.txt`
(about 177 frames, six subfolders). Contact sheets: `/mnt/project-files/every-era/bw/finish-sheets/g3/`.

## What the real cards say

Evidence is YouTube tilt-clip thumbnail frames plus Bulbapedia, PokeBeach and TCG Live's own maps; no macro photo could be had
(YouTube download, eBay and Bulbapedia image pages are walled off from the container). Confidence: medium-high on where the
foil is and how it moves, medium on the micro texture.

- **Flat full arts (bw1-bw3).** Silver foil on the whole face. The tell is the silver frame and name bar: one narrow
  vertical rainbow band (pink, yellow, green, blue) on the lit side that slides as the card tilts. On the art the foil is a pearl
  sheen that keeps the painting's colours (Reshiram stays white); dark art (Zekrom) reads as polished chrome. No etch, no glitter.
  TCG Live's etch for these three sets is a two-level silhouette of the Pokemon (a mask, not a relief), so no etch is drawn.
- **Textured full-art EX (bw4-bw10).** Foil edge to edge, a dense fine horizontal-line texture in rainbow over the face, the
  Pokemon outlined in gold line work, broad cyan-green and magenta-gold rays crossing the art, the frame silver to rainbow.
  Team Plasma full arts carry a blue-violet cast.
- **Full-art Supporters.** Narrow vertical spectrum bands on the silver frame; the textured era widens them and adds a warm-to-cyan
  pool on the character; the text box has fine horizontal ruling; no glitter.
- **Yellow secrets.** A normal yellow-bordered card whose only foil is the Pokemon (and the type symbol); the scenery, text and
  border are matte. Shiny reprints add a ring etch in the art window.
- **Gold secrets (bw7-bw10).** The regular layout inside a brushed-gold holo border with a rainbow flash and a holo art window
  with an etched swirl; the text box stays matte. Items: gold border, sparkle window, foil Poke Ball.
- **bw11 gold Reshiram / Zekrom.** Whole card flat mirror gold, the Pokemon an engraved outline, no rainbow, text in black.
- **Radiant Collection.** Yellow border, pastel art; a confetti of tiny round glitter dots over the art window and a patterned foil
  band across the lower half, frame and name bar matte; RC21-RC25 sparkle over the whole face with gold four-point stars printed
  in the art. White and pastel, finer than the main-set full arts, no rainbow bands. TCG Live has NO map for it.

## What the recipes do

- **bw-fa / bw-tfa** reuse sv-fullart's prismatic stock (sunpillar `--fa-pillar`, bars, pointer pool, etch twin) retuned: the
  colour-dodge chain closes with `contrast(0.8)`, the mask is `--art` x `--fa-light` over the TCG Live `--foil-map` with a 0.5 floor
  so the frame and text box still catch light, glare is soft (0.6 / 0.4 opacity). `bw-tfa` adds a grey radial glare for the silver frame.
- **bw-flat** blanks `--fa-etch` and the etch twin, replaces the bars with a narrow vertical spectrum (`#0e152e` troughs, one
  4%-wide band), a darker rest filter.
- **bw-yellow** is a dedicated block. A colour dodge does nothing to yellow, so the foil is a rainbow laid in with `overlay` plus a
  pearl pool in `soft-light`, masked by the foil map only (silhouette and symbol). No etch.
- **bw-gold** keeps the foil-ultra stack with the gold border flash; **bw-goldfull** is sv-fullart's gold stock retuned like
  sm-gold: closed `contrast(0.8)`, lit etch cut to the foil map so the black rules text stays black.
- **bw-rc**: `.foil` is a screen-blended sparkle tile at two scales that move opposite ways with the pointer, masked by our own
  map (`--bwrc-map`, `bw-rc-v1.webp` for the art window and lower band, `bw-rc-fa-v1.webp` for the full arts); a pastel wash
  in `soft-light` on `.glare`; the pseudo layers are reset. Tile and maps come from
  `scripts/make_bw_rc_sparkle.py` (new files only: `assets/foil/bw-rc-sparkle-v1.webp`, `assets/foil/maps/bw-rc-v1.webp`,
  `bw-rc-fa-v1.webp`). The maps are returned by `bwMap(card)` in bw-foil.js; the CSS reads its own `--bwrc-map`, so
  it holds whatever `--foil-map` the print got.

## Mistakes worth not repeating

- Secrets started as `foil-gold`; the real ones are `foil-ultra` (ring etch, gold border flash). Gold is only bw11 114-115.
- The first yellow-secret render used the dodge stack and was invisible on a yellow Pikachu. Judge a recipe on the actual card.
- TCG Live's etch for bw1-bw3 is a silhouette: showing it as an engraving draws a Pokemon-shaped halo.
- The Radiant Collection has no TCG Live map; probing a non-holo card number first made the whole BW block look mapless.
- Etch maps shipped by builders are 400x559 (native Live is 733x1024); a hairline hatch at that scale can alias in WebKit.
  Checked: no moire at 220 px x 3 in WebKit on bw4 94, 98, 100 and the RC sheet.

## Verification

Chromium and WebKit at 220 px x 2 and x 3, poses rest, 30:25, 40:30, 75:70, 50:78: bw1 113-115, bw3, bw4 94/98/100/102/103, bw7 150-153,
RC7/RC22/RC24. `foil_coverage.mjs bw1..bw11` prints nothing. `sweep_finishes.py` per set: no card over the dark-speck budget.

## Independent review (rv-g3, 2026-10-01)

Fresh-context review in Chromium and WebKit at 220 px x 3, poses rest, 30:25, -30:-20, 50:78, beside the clip frames in
`texture-refs/g3/`; sheets in `/mnt/project-files/every-era/bw/finish-sheets/g3-review/`. Also: `foil_coverage.mjs bw1..bw11`
prints nothing; `dark_specks` over the family's picks (bw1, bw3, bw4, bw7, bw9, bw10, bw11) is 0 dark dots on every card at every
pose; `etch_metrics` on all 87 shipped etch maps; the real app (iPhone 13, Chromium and WebKit, local worker) for bw4 98, bw4 100,
bw7 147, bw9 117, bw11 114/115 and RC24 (Chromium) with foil strength 0.55 and 1.5, no-shine, Classic, no-tilt and reduced motion; one pack of Next Destinies ripped.

Found and fixed (bw-fullart.css ?v=4 to 6):
- **Full-art Supporters went pastel at 30:25** (builder's note, confirmed): Bianca's saturation fell from 78 (rest) to 48 (HSV 0-255)
  because the rainbow dodge and the silver hard-light glare both whitened a pale painting; the binder photos stay vivid. The held
  state now dodges darker, keeps the foil at 70% and halves the glare: 67 at 30:25, 74 at -30:-20, 80 at 50:78.
- **Yellow secrets recoloured dark ink** (not in the builder's list): Emboar's black body went olive and Zoroark's mauve fur green
  under the overlay rainbow (opacity 0.65-1.0, saturate 1.15); the clips keep the body black with a blue shimmer. Overlay is now
  0.4-0.65 at saturate 0.8.
- **bw11 gold "lemon when lit"**: measured against the Zekrom 115 clip it is faithful (clip: R/G 0.83 dark to 0.91 lit, hue 0.13 to
  0.14; ours 0.82 to 0.88-0.90, 0.13 to 0.15). What was wrong is that the lit glare and etch glare covered the engraved outline
  (Zekrom's drawing disappeared at 30:25 while the clip keeps it dark gold). Glare 0.3 to 0.15, etch glare 0.45+0.35 to 0.2+0.25,
  `.foil::after` 0.25+0.4 to 0.12+0.2: outline visible at every pose, lit green drift 20 to 16 levels.

Checked, no change:
- **Radiant Collection dots on the grey frame**: the Mew-EX and Meloetta-EX clips show the same dotted sparkle on the grey frame, and
  the rest sparkle is on `.foil` only; kept. The full-art map has frame alpha 0.8 like the art, text box 0.42. If Noah finds the
  frame busy, the knob is a `bw-rc-fa-v2.webp` with the outer 4% ring at about 0.5 (never overwrite v1).
- **Etch maps at 400 px**: a native 733 x 1024 etch for bw4 98 (Live's PNG through `native_era_etch.build`) rendered beside the
  shipped 400 px one in WebKit at 340 px x 3 is indistinguishable (same weave, no moire, no camouflage); native is about 150 KB
  against 113 KB. Not shipped. `etch_metrics`: lb 7 to 30 on all but bw10 96 (112), bw4 97 (58), bw11 114 (22) and the ring etches of
  the yellow secrets (bw1 115, bw3 102, bw4 100: lb 44 to 47, ring maps by design); bw10 96 and bw4 97 are Live's own hatch and
  render without a screen in WebKit at 220 and 340 px (checked at native pixels).
- Flat full arts, textured EX, gold secrets, Items: match the clips (narrow vertical band on the lit side, rainbow frame, gold
  outline on the Pokemon, matte text). WebKit shows no dodge blotches on the dark cards (Zekrom 114, Heatran, Dusknoir).
- No bw full art reaches the app without a map; every Rare Ultra, Rare Secret and RC card gets its family class (checked by running
  `bwPattern` over bw1-bw11).

Remains: the yellow secrets' ring etch is not drawn (the recipe is deliberately etchless, the
clips show only a faint swirl); window-holo promos bwp033 (Riolu), bwp097 (Eevee) and bwp098 (Mew) still have no foil map
(`sweep_finishes.py` lists them; the promo owner's); the sweep's asset check names `assets/packs/sources.json` (shared tail file).
