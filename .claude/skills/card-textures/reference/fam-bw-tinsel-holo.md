# Family bw-tinsel-holo: Black & White Tinsel Rare Holo (255 faces claimed; none left on the era look)

Files: `js/fam/bw-tinsel-holo.js` (claims every `bw-holo` face; one class `bwt-<finish>` per face; per-face `--foil-map` and
`--bwc-bare`), `css/holo/fam/bw-tinsel-holo.css` (one copy of each rule), `assets/foil/fam/bw-tinsel-holo/` (textures, `maps/`,
`bare/`), `scripts/fam/bw-tinsel-holo/` (seeded, re-runnable generators that refuse to overwrite without `--force`):
`make_tinsel.py`, `make_cosmos.py`, `make_cracked_ice.py`, `make_crosshatch.py`, `make_maps.py`, `make_bare_foil.py`.
Research: `/mnt/project-files/holo-remaster/bw-tinsel-holo/` (refs/SOURCES.md, LESSONS.md) and the 2026-10-22 audit's photos in
`/home/user/holo-refs/bw-tinsel-*/` (one SOURCES.md per group). `&fam=off` in the lab draws the era sheet `css/holo/bw.css` (the old
look: every card Tinsel, a flat sheen over a 2-4 px line tile).

## Which faces (`finishOf()` in the module)
| class | faces | what the real card has |
|---|---|---|
| bwt-tinsel | 164 | every set Rare Holo bw1-bw11, the Tinsel promos (BW01-05, BW20-22, BW32, BW60), the Trainer Kit holos |
| bwt-vault | 21 | Dragon Vault: the same Tinsel, stronger |
| bwt-cosmos | 42 | blister, box and tin promos Collexy/Pokumon/TCGplayer file as Cosmos, and the Snivy/Tepig/Oshawott box prints |
| bwt-ice | 13 | Cracked Ice: the theme-deck reprints (`bw1-5-cracked-ice` ...) and the promos BW13, BW25, BW34, BW70-72 |
| bwt-mirror | 6 | Genesect BW99 and the Dragon Vault stamped Latias, Latios, Rayquaza, Haxorus, Druddigon |
| bwt-rev-mirror | 4 | Thundurus BW41, Tornadus BW42, Lillipup BW52, N BW100 (body foil; the TCG Live map decides) |
| bwt-rev-ball | 1 | Battle City BW39 (TCG Live's map carries the Poke Balls) |
| bwt-rev-cross | 3 | Victory Cup BW29-31 (Crosshatch, built 2026-10-22; was on the era look) |
| bwt-matte | 1 | Meowth BW35: not foil (TCGplayer sells it Normal only, Pokumon files it Non-Holo) |

## What the real foil does (2026-10-22 audit photos unless marked)
- Tinsel (bw1-57 Reuniclus, bw1-5, bw1-bwp003 Oshawott, bw3-84, bw4-33/85, bw5-3 Venusaur, bw6-59/90, bw7-41/81, bw9-16/83,
  bw10-16 Blastoise, bw11 Articuno/Meloetta/Serperior, dv Shelgon): the background of the art window is FINE HORIZONTAL RIDGES,
  0.74-0.95 % of the card height apart (FFT of flat scans: about 105-135 a card), thin bright crests a third of the pitch wide with
  dark gaps, each ridge its own brightness, broken into streaks. Visible at rest as light and dark rules (about 20 % luma modulation
  on the Reuniclus scan). Under a lamp each crest flashes its OWN colour (pink, peach, yellow, mint, cyan, lavender or near white,
  changing ridge to ridge and in short flecks along one), never one rainbow sheet over the window. How much colour shows depends
  on the ink: over PALE ink the ridges are plainly pastel (Articuno 32/113 tilted: pink, peach, green, lavender ridges); over DARK,
  grey or saturated ink they stay silver-white lines with at most faint pastel flecks and the ink keeps its colour (the Victini
  14/101 tilt video stays red; the Klinklang 90/135 zoom, bright-pixel saturation median 22; Umbreon 64/116), the colour in a
  local patch at the lamp, not across the window (round-2 review). Dragon Vault scans show more colour (the JP Dragon Selection
  Shelgon: rainbow ridges over the dark window; Kyurem 21/20: pink top, teal bottom). The Pokemon is matte. TCG Live's maps hold inked backgrounds at part alpha (Dragonite bw9-83 0.61,
  Blastoise 0.63, Blissey 0.14) but the real cards are foiled at full strength there.
- Cosmos (bw1-bwp017 Ducklett, bw2-bwp012 Zorua, bwp087-094): a DENSE field of tiny hard pinpoint glints (0.3-0.5 % of the card
  width, hundreds a window), a few medium dots and four-point stars, a few large soft bubbles (4-8 %); white-silver with a gold
  minority; colour only in the glints. The large bubbles are only on the Sylveon Collection BW87-94 (Collexy BW87/BW90, PSA BW91);
  Zorua BW12 and Ducklett BW17 show pinpoints, no rings. Where the window ink is white (Eevee BW94) the card shows bare grey metal.
- Cracked Ice (bw1/bw2/bw3 theme-deck reprints, Pokumon scans; Collexy BW13; bw8-bwp070-072): large irregular shards, each its own
  value from dark to bright silver-blue, a few pastel; the ink keeps its colour and darkness; a few shards flash at a time.
- Crosshatch (Collexy scans of BW29-31 incl. a 2x zoom of BW31's text panel, `bw-tinsel-bw1-bw2/bwp-victory-cup/`, Collexy's BW
  holofoil overview): a reverse-style foil over the card BODY (frame, TRAINER header, the whole text panel) in a plaid of fine
  horizontal ridges crossed by +-45 degree pinstripes and soft bands; silver, plainly metallic at rest; rainbow sparkle points.
  The art window is not foil (Collexy's BW29 and BW31: dark window, no lattice); the Battle Road stamp and blue rule bar are ink.
- Mirror (Dragon Vault stamped): a broad silver sheet with soft rainbow edges (the stamped Rayquaza photo: a small cyan/yellow
  patch); low confidence; the site's scans of these are soft photos of the foil card.

## What the family draws
A reset block clears every paint property of `.foil`, its pseudo-elements, `.glare` and `.cure`; each finish paints its own.
`.foil` is masked by the face's map (`--foil-map`) and `--art`.
- Maps: tinsel, vault, cosmos and mirror faces use `make_maps.py`'s copy of TCG Live's map, alpha smoothstepped 0.04-0.40 (where the
  foil is kept, how strong dropped), Blastoise closed over its spray holes, the Trainer Kit Zoroark eroded off its paw.
  `assets/foil/fam/bw-tinsel-holo/maps/<set>/<n>-v1.webp`; a changed copy needs `MAP_V` bumped and a new name.
- Tinsel/vault (`tinsel-{crests,gaps,glints,hue,tint}-v2.webp`, one seeded ridge list, aperiodic 6.5-9.5 px pitch at 1024):
  `.foil` hard-light: per-ridge hue (`tinsel-hue-v2`: pale, HSL lightness 0.70-0.78, saturation <= 0.40, a third of the ridges
  near white, HSV saturation median 19/255; 200 % wide, slides with `--background-x`) under a silver lamp ellipse that covers it
  everywhere but a narrow band at the lamp (62 % x 15 % of the card; silver alpha 0.45 at the centre, 0.62 at 25 %, 0.85 at 55 %;
  `--bwt-silver` 64 % lifts the crests), under the gaps (grey 0.43 = x0.86, the dark-speck budget) so ridges read at rest.
  `::before` screens glints x hue in a 52 % x 12 % band. `.cure` (held only) dodges the crests x [a tight neutral flash at the
  lamp, screened over the broader band x `tinsel-tint-v2`], `brightness(0.5)` (vault 0.6). `tinsel-tint-v2` is the same ridges'
  hues as a colour-dodge GAIN (HSV value 0.62, saturation up to 0.9): a dodge tints ink in proportion to its brightness, so pale
  ink takes the pastel and black ink none. Never use it as a hard-light or screen source: hard-light tints dark ink twice as much as
  the same source tints pale ink (2(1-B)), which is what made round 1's saturated hue texture a rainbow line screen on Victini,
  Cobalion, Weezing, Electivire, Meloetta and Eelektross.
- Pale windows (`bwt-pale`, 30 faces, `make_pale.py`: alpha-weighted luma under the map >= 0.62 and <= 12 % dark ink, plus
  Blastoise bw10-16 on its pack-pull photo): lit, the `.foil` hue is grey 0.46 dodged by the tint texture (channels about 0.49-1)
  in a wider band (80 % x 22 %), so Articuno, Oshawott BW03, Serperior bw1-5, Gardevoir show pastel ridges.
- Vault lit: the same pale hue through a wider band with less silver (85 % x 24 %, silver 0.2 at the centre).
- Dragonite bw9-83: `--bwt-silver: 40, 10%, 71%` from the module (`WASH`): a lighter, warmer silver that washes the sky toward
  silver as on the in-hand frame.
- Cosmos (`cosmos-{dots,lit}-nb-v2.webp`: ~9000 jittered pinpoints, 160 dots, 70 stars; the Sylveon Collection (`bwt-bubbles`)
  takes `cosmos-{dots,lit}-v2.webp`, the same glints plus 30 bubbles): `.foil` hard-light dots over a
  near-neutral grey (no spectrum wash); `::before` the spectrum through the dots' alpha (screen); `.cure` lit dots x lamp. BW94 adds
  `bare/bwp-bwp094-v1.webp` (grey 0.24 where the scan is near white: white x0.48).
- Cracked Ice (`ice-{facets,tint}-v2.webp`, shards about 36 px, tint per shard: 34 % icy-blue neutral, 32 % dark blue (0.19-0.31:
  the shards that read on a pale sky; 0.12 broke the dark-speck budget on Serperior), 26 % bright (0.84-0.98), 8 % pastel):
  `.foil` in `overlay` at 0.94 rest / 1 held (black and white ink stay put); `.cure` picks the facets within 0.1 of the pointer's
  angle, `invert(1) brightness(0.5263) contrast(19) brightness(0.42)` (gain <= 1.7: at 3.3 lit shards whitened Serperior).
- Crosshatch (`crosshatch-v1.webp` plaid around 0.50, darks squeezed to >= 0.44 (dark-speck budget; the scan already shows
  the panel's grey metal), `crosshatch-sparkle-v1.webp`, per-card
  `maps/bwp/bwp0NN-cross-v1.webp` read from each scan: body 1, window 0, rule bar 0.3, stamp 0): `.foil` hard-light texture
  under a white lamp sheen; `::before` sparkle x spectrum (screen).
- Mirror (Genesect, dvstamp): a near-white sheet at the lamp (centre held in the window by `--bwt-sheen-y`) inside a narrow
  ring where `--bwt-pastel` (the spectrum at 50 % saturation) shows at most half mixed (the soft fringe; the full spectrum there
  made a flat magenta sheet on Druddigon and Genesect), x0.94 silver outside and at rest (window lift +24/+16/+12
  levels at 30:25/75:65/50:78 on Druddigon; it was +17 everywhere, the sheet sat off the window). Rev-mirror and rev-ball: the
  spectrum through a grey that thins to a flat ellipse at the lamp.

## 2026-10-22 fix (round 1), what changed
Tinsel textures v1 -> v2 (pitch 7.5-13.5 -> 6.5-9.5 px, per-ridge hue instead of a 400 % rainbow sheet; Weezing neon and
Meloetta/Braviary washes gone), full-strength maps (Dragonite, Blastoise, Venusaur, Garchomp foiled where the photos show it),
cosmos v2 (dense pinpoints, no lime/teal flood on Zorua), ice v2 in overlay (ink stays dark, shards readable), Victory Cup built,
Eevee BW94 bare metal, mirror sheen. Old v1 textures (`tinsel-crests.webp` etc.) are on master and now unreferenced.

## 2026-10-22 fix (round 2), what changed
The round-1 review failed the Tinsel lit colour on dark, grey and saturated windows (a rainbow line screen). The hue texture is now
pale and covered by silver outside a narrow lamp band; the colour moved into the `.cure` dodge (`tinsel-tint-v2`), which tints
pale ink and leaves dark ink silver; pale-window faces (`bwt-pale`) take a stronger hue. Also: Victory Cup window alpha 0; cosmos
bubbles on BW87-94 only; mirror fringe pastel and narrower; ice shards smaller, darker and brighter at rest, flash gain 1.7;
Dragonite's lighter silver; the vault's wider coloured band.

## How to judge it
`WEBKIT=1 render-slot.sh node .claude/skills/card-textures/scripts/foil_probe.mjs --query "set=bw1&cards=57,5,bwp003&proof=off&w=220&poses=rest,30:25,75:65,50:78" --width 800 --scale 3 --browser webkit --boxes --out <png>`
(promos render in the lab by number: `set=bwp&cards=bwp029`). Ridges must show at rest at native pixels; lit crests in many
colours on pale windows (`bwt-pale`), silver-white with faint flecks on dark, grey and saturated ones, never one sheet;
dark ink stays dark. Check a dark window (bw3-14 Victini, bw8-58 Weezing, bw7-54 Electivire), a grey one
(bw3-84 Cobalion) and a pale one (bw11-32 Articuno) at 30:25 and 75:65.

## Open
- Venusaur bw5-3: the real foil desaturates the cliffs at rest; hard-light cannot desaturate.
- Blastoise bw10-16 (in `bwt-pale` on its pack-pull photo) is still subtler lit than that photo's rainbow streak blocks.
- Dragon Vault: the Japanese Dragon Selection scans (Shelgon 007) show strong rainbow lines over the black space, the in-hand
  frames (Fraxure DV14) ink-coloured lines; the vault follows the in-hand look (faint pastel crests), a scanner lamp is not a hand.
- Data (outside this family's paths): dv1-9/10/16 regular faces use stamped scans; the dvstamp scans are soft glare photos; Meowth
  BW35's finish and N BW100's, Kyurem BW44's cosmos and Genesect BW99's mirror are single-source.
