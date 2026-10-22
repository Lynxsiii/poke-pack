# Family note: bw-reverse (Black & White reverse holos)

Status (2026-10-22, fifth run, after two audits that called every card "wrong": a saturated two-cycle rainbow over every body):
1,072 prints claimed (bw1 104, bw2 96, bw3 96, bw4 87, bw5 96, bw6 99, bw7 130, bw8 119, bw9 100, bw10 74, bw11 71). The overlay spectrum
recipe below ("What was built", runs 1-4) is REPLACED by the shade / flash recipe of this section.

## What the real card does (2026-10-22, photos; sources in /home/user/holo-refs/bw-rev-a/SOURCES.md and bw-rev-b/SOURCES.md)
- WHERE: the body inside the yellow border (text box, stat rows, frame strip round the art window, name bar) is foil; the art window, the
  border and the printed symbols are not. TCG Live's per-print maps match (confidence high).
- COLOUR: the body KEEPS its printed type colour (translucent ink over silver): purple Whirlipede bw2-39 and Drifblim bw10-35 stay purple,
  orange Excadrill bw2-56 stays copper, blue Cubchoo / Beartic / Wartortle stay blue, green Surskit / Cradily / Cottonee stay green, Darkness
  Liepard bw7-91 / Purrloin / Vullaby stay near-black slate, Dragon Altaria bw6-84 / Gible / Deino stay olive. No body-wide rainbow (high).
- PATTERN (bw2-bw11): the Energy-symbol tile shows as darker and lighter shades of the body colour: the symbol OUTLINES, veins, rings and
  crescents (WHITE in TCG Live's map) read DARKER than the body away from the light (Excadrill's dark-brown fists, Surskit's and Cradily's dark
  veins, Drifblim's dark eyes, Wartortle's darker drop outlines), the fills a little lighter. Trainers are the exception: the Poke Balls keep
  the tile's own polarity (Caitlin bw10-78: the dark upper halves and centre bands are the tile's dark parts). bw1 is a plain mirror: a soft
  mottle of wide pale vertical bands in the type colour (Snivy bw1-1, Collexy Blitzle / Lillipup scans). Darkness: the crescents are only a
  little LIGHTER grey than the near-black body (high).
- LIGHT: a white hot spot about a quarter of the card wide, tinted by the ink (pink-white on Whirlipede, gold-white on Excadrill), the symbols
  nearest it flashing; at some angles ONE narrow vertical rainbow streak (10-15% of the card, pink / gold / green / blue) crosses the text box
  and slides with the tilt (Cubchoo bw8-40 in hand, Gible bw6-86, Emolga tilt frame). Silver bodies (Colorless, Metal, Trainer) show a soft
  pastel rainbow when lit (Braviary bw2-88; the broad vertical bands on flatbed scans are the scanner lamp) (medium).
- INK: black text stays black, white text on Darkness and Dragon bodies stays white (high).

## What was built (run 5)
1. `.foil` = the type's SHADE map, `mix-blend-mode: multiply`, at every pose, at the type's share `--bwr-k` (js/fam/bw-reverse.js `TONE`).
   `make_shades.py` draws `shade-<kind>.webp` / `flash-<kind>.webp` for all 14 tile kinds from the era's tiles: the source print's black discs,
   dividers and rule-box frame are inpainted (cv2 Telea; this also ends the dull discs at the weakness/resistance/retreat row, 152 prints), the
   relief r = clip((t - p50) / (p98 - p50))^1.15 (white strokes 1, median body 0; Trainers: what is darker than the median; plasma: the shield),
   shade = 1 - 0.30 r, flash = 0.55 + 0.45 r. Multiply keeps the hue and black ink black. `--bwr-k` is set per type so a stroke is at most
   about 36 levels darker than the body's lighter parts (36 / (0.30 x the type's 95th-percentile text-box luminance on the scans: Dragon 165,
   Fire 187, Psychic / Fighting / Grass 210, Water 223, Lightning 231, Colorless 242, Metal / Trainer 248)): `dark_specks.py` counts any flat
   print darkened by more than 40 levels in a small blob as a speck, and at K = 0.30 on light bodies Ferrothorn showed 237-474 (the scan's
   printed hatch chops the strokes into blobs). Trainers take 0.8 (their shade is broad Poke Ball halves, counted as area, not specks).
   bw1 (`bw-rev-plain`): the mottle map at half the share (capped at 0.57).
2. Darkness Pokemon (`bwr-dark`): the shade inverted and dimmed (`filter: invert(1) brightness(0.3)`), screen-blended: the crescents about 20
   levels lighter, neutral, no tint (bw1's mirror: brightness 0.2).
3. `.glare` (lit) = screen of [one narrow streak, 12% of the card, pink -> gold -> green -> blue at alpha 0.42, a 200% layer positioned by
   --pointer-from-left: one band, one card of travel per full sweep] over [a warm-white pointer pool (ellipse 36% x 26%) multiplied by the flash
   map]. Darkness: a neutral silver pool at 0.3, no streak.
4. Silver bodies (`bwr-silver`: Colorless and Metal Pokemon, Trainers, Energy): a pastel rainbow (saturation <= 45%, one cycle per card) on the
   `.cure` layer (the module returns `cure: true`), `mix-blend-mode: color` (the hue moves, the luminosity stays: no darker strokes), masked like
   the foil, lit only, opacity 0.55.
5. Masks `-v2` (`make_masks_v2.py`, all 1,072 prints, from the shipped masks and the scans): the DARK ink outside the text zone (name, HP,
   "Evolves from", weakness labels, illustrator line) is cut too (the streak had tinted the HP digits); Dragon prints (white text on olive): the
   66-233 grain holes of the old dark-ink cut are filled and the WHITE text is cut instead. The old `<number>.webp` masks and `pattern-<kind>.webp`
   tiles stay on master, unreferenced (immutable cache: never overwritten).
Judged in WebKit at 220 px x3 against the refs: before/after/real sheets in /home/user/holo-work/fix-bw-reverse/ba-<set>-<n>.jpg (16 samples).
Gates (run 5): foil_coverage bw1-bw11 prints nothing; dark_specks bw1 / bw2 / bw6 / bw7 / bw10 samples ok (max 17 specks, most 0);
rainbow_speed nothing; sweep --check-only no duplicate in this sheet; check_asset_overwrites ok; test-bw ok.
Open: Caitlin's Poke Balls and Lairon's chevrons are fainter than the photos (the speck gate caps a light body's stroke at about 36 levels);
the 13 bw6 prints and 41 bw10 / bw11 prints without a trusted mask still draw the era look; bw6-23 / bw6-26 scans carry a League stamp (data);
Dragon Vault and Radiant Collection reverse faces probably do not exist (data).

## Run 5, round 2 (review of round 1: FAIL on one blocker)
- Blocker, grain holes: the shipped dark-ink cut (make_masks.py: darker than 110, 40 from the local median, dilated) took darker GRAIN spots of
  a mid body for ink. They are '+'-shaped holes of 5-17 px^2 that stay matte while the lit body around them is screened brighter, so they read
  as dirt: about 10 above "30" of Metal Claw on Excadrill bw2-56, and the same cluster (rows 270-290, the top of the text zone) on 97 of 98
  Fighting prints, plus smaller ones on Metal and Water prints. Masks are now `-v3` (`make_masks_v3.py`, all 1,072 prints; the unshipped -v2
  drafts were deleted). Each text-zone hole of 24 px^2 or less is checked against the FULL-SIZE scan (600 x 838): printed ink is black and its
  darkest pixel there is under 45, grain's is 55-110. A hole whose darkest pixel is 50 or lighter, and not red Ability ink, is filled. That
  filled 1,877 holes on Fighting prints, 2,171 on Metal and 846 on Water. Small holes left per print: Fighting at most 2, the others at most 7
  (all real punctuation). Watch out: Fighting's copper grain is (160, 70, 10). A plain "R - G > 80" red-ink test keeps it, so red ink must be
  R > 150, G < 50 and R - G > 110. Dragon prints still fill every text-zone hole of 40 px^2 or less (their text is white).
- Dragon white text: the dilated cut left a matte olive ring round each white letter, and inside the lit hot spot it read as a dark rim
  (Altaria bw6-84 and Vibrava bw7-98 at 75:65). There were two causes. (1) The shipped dark-ink cut had punched word-shaped blobs of olive body
  round the white words, because the 11 px median there is lifted by the letters. A text-zone hole that is 80% or more olive body (within 60 of
  the zone's median body colour) or white letter is now filled whole. The cost circles, the Ability badge and the red names are not, and stay
  cut. (2) Even an undilated letter cut has a soft edge, because the 367 px mask is drawn 1.8x larger at phone size, and that edge stayed half-lit.
  So the glare now has its own mask for the 32 Dragon prints: `<n>-v3g.webp`, the mask before the white letters are cut, plus the small holes
  (400 px^2 or less) that are 70% or more olive. The module adds `bwr-dragon` and `--bwr-glare-layout`, and the sheet masks `.glare` with it. A
  screen leaves white ink white. The foil mask still cuts the letters (with no dilation, plus any 5 px^2 piece that has a pixel lighter than 190),
  so at rest the shade never greys them.
- Stronger pattern, deeper body: shade = B - K r. Coloured kinds use B 0.875 and K 0.375, Metal 0.90 / 0.36, Colorless 0.82 / 0.36, Energy
  0.84 / 0.36, Trainer 0.90 / 0.20, and Darkness keeps 1 / 0.30. At the type's `--bwr-k` (k x the type's light body is about 120 levels for
  every type) that makes a coloured body about 15 levels deeper and its strokes about 45 levels below the body (round 1: about 36 levels below
  an untouched body). Colorless and Energy bodies get about 20 levels deeper and Metal about 12 (the photos' mid-grey Lairon and Braviary). Thin relief lines are thickened by 1 px (grey
  dilation at 0.85) and softened (Gaussian 0.6 px), so a stroke stays one line at phone size and never breaks into specks. Metal is a
  special case. Its prints carry a printed diagonal hatch over the body (Ferrothorn bw2-72, Lairon bw10-58, Durant bw3-83), and dark_specks
  does not count the hatch's edges. So a thin stroke across the hatch counts as dozens of short dark dashes (185-236 'specks' at rest with
  B 0.80 and the thin stroke). Metal strokes are drawn WIDE instead (5 px grey dilation at 0.9, Gaussian 1 px) with B 0.90, which gives 24 or
  fewer. Trainers also darken
  the Poke Balls' thin bright RINGS (a 5 px white top-hat of the tile), which the Caitlin photo shows as mid-grey outlines, and their flash
  map is even (0.8), so the rings do not flash away under the pool.
- Light: the pointer pool is broader (ellipse 72% x 52%, with a hot core at 12%). Its tail never reaches black (a 16% warm grey at the far edge),
  so a lit card lifts all over and glares where the light falls. Silver bodies (`bwr-silver`) take it at 0.75, so their light body does not go
  milky. Darkness: a silver-blue pool, 60% x 44%, at 0.5 (was 0.3, 36% x 26%). bw1's Darkness mirror mottle is fainter (brightness 0.2 -> 0.12).
- Judged in WebKit at 220 px x3 against the refs. The round 1 / round 2 / real sheets are in /home/user/holo-work/fix-bw-reverse/r2/r12-<set>-<n>.jpg,
  and the zooms are in r2/z*.jpg.

## Run 5, round 3 (review of round 2: FAIL on one blocker, four tuning items)
- Blocker, Pokedex-bar spurs: round 2 left grain holes joined to the BOTTOM of the Pokedex-bar cut (two '+' spurs of 15-33 px^2 at mask rows
  269-275, cols 277-299, and one at cols 24-28) on 95 prints, mostly Fighting (bw1-58..65, bw3-61..74, bw8-76 Riolu ...). Lit, they stayed matte
  in the screened body: red-brown specks under "WT: 44.5 lbs.". Round 2 only cleared spurs in rows 266-271 that touched nothing else, and these
  ran on to row 275. `make_masks_v3.py` `bar_spurs` now takes what a 5 px opening removes from any hole that reaches above the text zone, splits
  it into 8-connected pieces of 3-80 px^2 that end by row 292, and tests each piece's OWN pixels against the full-size scan: the darkest is 77-97
  on the Fighting spurs (grain) and 50-55 on the Trainer rule's anti-aliased corner (kept); 60 or lighter and not red ink is filled. Metal is
  skipped (its printed hatch starts at the bar). All 1,072 -v3 masks were redrawn in place (never on master). Spur scan after: 0 on every
  type but Metal (hatch, kept), Trainer (real rule ink) and two 3 px Fire slivers on row 268 (red body = red-ink test, invisible).
- Body depth (Psychic and Grass much paler than the photos): a grey multiply only darkens; the photos are deeper AND more saturated. Text-box
  medians, scan -> photo (HSV): Drifblim / Drifloon / Munna S 0.19 -> 0.23-0.34, V 0.80 -> 0.62-0.65; Cradily / Virizion S 0.51-0.58 ->
  0.83-0.89, V 0.83 -> 0.71; Wartortle S 0.38 -> 0.65, V 0.95 -> 0.74; Dragons V 0.43 -> 0.21-0.33. Ink over foil reads as the ink twice, so the
  shade map is now multiplied by a TINT (`background-color: var(--bwr-tint)`, `background-blend-mode: multiply`): white mixed with the type's median
  body colour on the scans (every third claimed print; the p10-p90 spread is under 20 levels per channel, so one colour stands for every print of a
  type). Js `TINT`: Psychic #b993c0 and Grass #accd4c (the body colour whole), Water #a0d6f3 (0.8), Fighting #efc89a and Lightning #feec9d (0.6),
  Fire #f6bba2 and Dragon #b6b49c (0.5); silver and Darkness white. `--bwr-k`: Psychic 0.7, Grass 0.8, Water 0.7, Fighting 0.62, Lightning 0.6
  (others as round 2). Renders at rest (text-box median S / V; photos above): Drifblim 0.29 / 0.55, Whirlipede 0.32 / 0.55, Surskit 0.76 / 0.58,
  Virizion 0.73 / 0.58, Wartortle 0.51 / 0.78, Excadrill 0.60 / 0.73 (round 2: Drifblim 0.19 / 0.67, Wartortle 0.37 / 0.83). Black ink stays black. Tried first: the print itself (`var(--art)`) as a second background of `.foil`. WebKit decodes
  that large image asynchronously and the probe caught cards with the layer unpainted (one of four copies of Wartortle painted it, lit Excadrill
  lost the shade): never use the card image as a background layer here.
- Lit pool (bleached half the text box on Excadrill and Riolu; Snivy saturation 0.44 at 50:78): on coloured bodies it is now a tall narrow spot,
  radii 30% x 40% of the card, core hsl(42 60% 84%), tail an 8% warm grey (at 14% the whole lit box lost saturation), so the lit body is a lighter tint of
  its ink and only the symbols nearest the light flash near white. Snivy bw1-1 text-box saturation (median): rest 0.63, 30:25 0.58, 75:65 0.52,
  50:78 0.52 (round 2: 0.37 at 50:78 by the same measure). Silver bodies keep the round-2 broad pool at 0.75.
- Dragon white text in the hot spot: `bwr-dragon` glare at 0.6 (`--bwr-dragon-glare`), so the lit swirl stays a step darker than the letters.
- Caitlin's Poke Balls: Trainer shade B 0.88, K 0.34 (was 0.90 / 0.20), the ring top-hat from 10 levels over 24 (was 12 over 30).
- Judged in WebKit at 220 px x3 against the refs: real / round 2 (the reviewer's cells) / round 3 sheets in
  /home/user/holo-work/fix-bw-reverse/r3/ba-<set>-<n>.jpg (21 cards), dex-line zoom r3/z-dexline.jpg, Dragon text zoom r3/z-dragon.jpg; Chromium contact
  sheets of all 1,072 claimed prints at 40:30 in r3/contact/. Gates: foil_coverage bw1-bw11 prints nothing; dark_specks ok on 39 cards in bw1-bw3 and
  bw6-bw10 (worst: Druddigon bw8-94 32 at rest, letter counters inside its white text; Lairon 28, Sharpedo 21, Caitlin 21); rainbow_speed nothing;
  sweep --check-only nothing in this sheet; check_asset_overwrites ok; test-bw ok.
- Open: Metal strokes are wider than the printed lines (the hatch rule above); the League-stamped scans of bw6-23 / bw6-26 / bw8-120 (data); 124
  unclaimed reverse faces (the lead's call).

# History (runs 1-4, superseded where run 5 says so)

Status (2026-10-02, fourth run): 1,072 prints claimed (bw1 104, bw2 96, bw3 96, bw4 87, bw5 96, bw6 99, bw7 130, bw8 119, bw9 100, bw10 74,
bw11 71). Files: `js/fam/bw-reverse.js`, `css/holo/fam/bw-reverse.css`, `assets/foil/fam/bw-reverse/<set>/<number>.webp` (1,072 masks, about 4.3 MB) and
`mirror-mottle.webp`, six type tiles `pattern-<kind>.webp` (~260 KB), `scripts/fam/bw-reverse/make_masks.py`, `make_masks_bw6.py` (+ `bw6_matches.json`), `make_mirror_mottle.py`, `make_patterns.py`. Review #1
(/mnt/project-files/holo-remaster/bw-reverse/REVIEW-1.md) failed the first pass (imperceptible lift, bw1's plain mirror read as no holo); review #2
(REVIEW-2.md) found three blockers, all fixed in run 3: (1) ink took the foil colour, (2) dark bodies were darker than the era look under the thumb,
(3) bw10-3 Lileep had foil on its art window. Review #3 (REVIEW-3.md) verified those and found one more, fixed in run 4: a dull olive disc above the attack-cost symbol
of single-attack prints (see "Type tiles" below).

## What the real card does
- bw1 reverse = the plain "mirror": the body (text box and frame, not the art window) is a soft mottle of wide pale vertical bands with cool
  and warm tints over the type colour (Collexy scans of Blitzle 40, Lillipup 81, Emboar 20: /mnt/project-files/every-era/bw/texture-refs/g1/).
  Blitzle: yellow body with teal and blue clouds and bright vertical bands; Emboar: red body with pale blotches and darker mottling.
- Emerging Powers on: the shaded Energy-symbol pattern of the type (Poke Balls on Trainers) over the body; Plasma sets (bw8-bw10): the Team
  Plasma shield in the text area; Special Energy: picture box matte, text box foil.
- The ink is printed over the foil and stays black; the art window is matte.
- Sources: Collexy photos (3 bw1, 1 bw5), TCG Live foil maps (the mask: `cdn.malie.io/.../<set>_en_<NNN>_ph.foil.png`). Confidence: shape high,
  colour behaviour medium (no tilt video of a bw1 reverse was found; the colours are judged from the scans).

## What was built
1. Per-print mask (`make_masks.py`): `clip(R*A/255 / 24, 0, 1)` of TCG Live's map, then (a) a stray alpha under 0.25 is zero (bw10-3's art window carried
   0.2: blocker 3), (b) holes under 12 px^2 are filled (specks only), (c) the foil is eroded by a 2 px disc (the anti-aliased rim of a symbol or the
   window frame is mid grey and the overlay drew a dark or orange ring around every symbol), (d) the INK is cut out of the foil from the print's own
   scan: TCG Live leaves the body text (attacks, rules, Trainer and Energy text) UNDER the foil in its map, like the real card whose ink is opaque, and an
   overlay on a dark or grey letter gives 2 x ink x sheen, a green or yellow letter (review #2, Float Stone, DCE). In the text zone (rows 266-476 of 512)
   a pixel is ink when it is darker than 110 (of 255) and differs from the local body colour (11 px median) by more than 40 in RGB distance; dilated 1 px,
   alpha 0. Near-black bodies (zone median under 75: Darkness, white text) get none: white stays white under an overlay and the gaps between its
   letters are not ink (the first try, any contrast over 40, cut half of Weavile's text zone and the Team Plasma shield outline). What stays a hole:
   the art window, the attack-cost circles, the weakness/resistance/retreat icons, the evolution notch, the names TCG Live cuts out.
   `js/fam/bw-reverse.js` sets it as `--bw-layout`; the era rule (`css/holo/bw.css`, `.bw-rev .foil` and `.glare`) already intersects `--art` with it.
   Special Energy had no `--bw-layout` in the era (an undefined variable voids the mask list); it now has one.
2. Sheen, `css/holo/fam/bw-reverse.css`: `.foil` = tile x saturated 100deg spectrum band x pointer pool, **mix-blend-mode: overlay** (not the era's
   colour-dodge), `filter: brightness(2.35) contrast(1) saturate(1.8)`, opacity rest 0.7 / lit 0.8 + 0.2 x pointer, both x foil-strength.
   Why overlay: colour-dodge on a light body saturates to white (no visible change) and lifts dark ink to red or cyan (the text bled); overlay
   keeps a dark ink dark (at most x2) while a light body takes the tints and the flash. Tile = the type's pattern (bw2+) or, for bw1, the
   mottled-mirror map `mirror-mottle.webp` (card-sized, drawn once, no tiling; soft vertical clouds + wide pale bands, `make_mirror_mottle.py`).
   Dark bodies (Darkness 0.12-0.15, Dragon 0.40: the module adds `bwr-dark`) use `brightness(3.2)`: overlay doubles a dark body at most (2 x body x
   sheen), so with 2.35 the lit text box was 19 to 21 levels BELOW the era look (Weavile); 3.2 saturates the sheen and lifts the body instead.
   bw1 also gets a lit-only white pool in `.foil::after` (screen) so the overlay flashes under the pointer. The glare keeps the era's mask and
   blend but its dark end is 0.08 instead of 0.3 (a tilted reverse never reads darker than before).
3. Type tiles (`make_patterns.py`, run 4): the era's tiles `assets/foil/bw-reverse/<kind>.webp` were cut from ONE TCG Live map per type, and that print's attack-cost
   symbols are black discs in them (18 px across, x 37 / 57 of the 367x512 tile: grass and fighting y 313, psychic and colorless y 334, dragon y 293, plasma y 293 and 363,
   fighting's second row y 365). Under the overlay a black tile pixel stays black, so a print with no cost symbol, ability box or dark ink on that spot (one attack, no ability,
   short text) showed a dull olive disc on the mint body (review #3: bw6-1, bw6-4, bw6-13, bw8-2, bw8-4, bw11-4, bw9-1); the era's colour-dodge hid it. The fix is in the tile, not the
   mask: `pattern-<kind>.webp` is the era's tile with the discs inpainted (cv2 Telea, lossless; only the disc areas change), and `js/fam/bw-reverse.js` sets `--rev-pattern` to it for
   colorless, dragon, fighting, grass, plasma and psychic (kind read from the era's `bw-rev-<kind>` class in `base.classes`; `--rev-pattern` also feeds the lit `.foil::after`
   screen layer). A matte hole in the mask would have shown the raw scan (olive) against the foil body: the same dot. Exposed prints (mask alpha >= 0.9 over a disc): 106 of the 530
   in the six kinds, listed in /mnt/project-files/holo-remaster/bw-reverse/DISC-LIST.md. Check a new set: render its single-attack prints at rest and look above the cost symbol.
4. Rainbow speed (Noah 2026-10-02): the band is 260% of the card, 100deg, two spectra per 100% of the 3.19-card gradient line (period 1.6 cards);
   the pointer shifts it 1.6 cards across a full horizontal sweep = 0.99 spectrum (1.2 corner to corner). Limit 1.5.
   `rainbow_speed.py` does not parse `--pointer-from-left` layers, so this was computed by hand.

## Judge it
`foil_probe.mjs --query "set=bw1&cards=r7,r3&proof=off&w=220&poses=rest,30:25,75:65,50:78" --width 1000 --scale 3` (reverse = `cards=r<n>`; add
`&fam=off` for the before). Look for: colour bands in the text box at rest and tilted, the art window and name bar matte, the ink black and untinted.
Text-box mean luminance is a poor metric on pale bodies (hue bands cost luminance, and the era's colour-dodge lifts and washes the ink, which the
before counts as light): use it for DARK bodies, and the darkest-ink RGB / ink chroma for pale ones. Run 3, 220 px x3, Chromium (WebKit within 2 levels), text-box
window, after - before at rest / 30:25 / 75:65 / 50:78: dark bodies Weavile bw9-66 +19.2 / +22.3 / +11.2 / +10.6 (was -19 / -21 at 75:65 / 50:78 in
review #2), Umbreon bw9-64 +17.6 / +20.0 / +8.7 / +7.1, Hydreigon bw9-78 +17.0 / +18.5 / +7.1 / +6.2, Houndoom bw6-75 +9.8 / +15.5 / +14.0 / +12.7,
Dragon Gible bw6-86 +24.9 / +33.8 / +23.0 / +19.2, Druddigon bw8-94 +23.1 / +21.4 / +6.8 / +3.9. Pale bodies (vivid pastel, ink black):
DCE +1.5 / -3.4 / -8.5 / -9.9, Torterra +3.8 / -1.6 / -11.0 / -12.7, Float Stone +3.2 / -0.1 / -1.2 / -2.0, Plasma Energy +5.1 / +3.3 / -1.8 / -3.0, bw1
Pansage +2.6 / -1.0 / +6.7 / +9.8. Darkest ink (mean of the darkest 0.5%, 50:78), before -> after: DCE (20,9,9) -> (16,7,6), Float Stone (70,59,54) -> (43,36,32)
(the era's glare hazes the thin text; chroma 16 -> 10), Plasma Energy (1,0,39) -> (0,0,33), Braviary (29,24,20) -> (19,15,13); ink chroma never above the
before. Lileep art window after - before 1.8-3.5 levels, as Tirtouga (2.6-4.6). Look at the sheets in /mnt/project-files/holo-remaster/bw-reverse/sheets/ (`r3-*`).
Gates run: foil_coverage bw1-bw11 prints nothing; rainbow_speed prints nothing; dark_specks (reverse faces, max per card and pose, budget 40): bw1 0, bw11 DCE 14, bw8 Torterra 9, bw6 Braviary 21, bw9 Weavile 8; foil_probe --idle clean (bw9-66 + bw9-99, bw6-86 + bw6-1).

## bw6 Dragons Exalted (matched by image)
TCG Live's DRX files for bw6-1 to 49 are duplicated/misnumbered (44 of them are other cards' maps). `make_masks_bw6.py` + `bw6_matches.json` write each
bw6 mask from either the print's own file (65: precision of holes-on-printed-pixels >= 0.93 against its own scan) or a DONOR print of the same layout
(34: same attack-cost rows and ability, donor fit >= 0.94, or >= 0.92 with a margin >= 0.10 over the runner-up; e.g. bw6-1 Hoppip uses bw7-90's map,
bw6-45 Emolga uses bw11-49's). Checked by overlaying the mask holes on the scans (art window, cost symbols, weakness/resistance/retreat symbols
all holed). Left on the era look (13, not sure): bw6-2 3 5 6 10 18 19 21 33 34 47 48 49. A donor's text holes can differ from the card's own text
by a line (Hoppip's second attack text), so for donor prints every hole under 100 px^2 is filled (no ghost text) and the ink comes from the print's own
scan, as above (own-file and donor prints alike).

## What remains
- bw6: the 13 prints above.
- Pale bodies lose 5 to 13 levels of text-box mean luminance at 75:65 / 50:78 (vivid pastel bands on white or cream, ink now black): DCE, Torterra, Lileep,
  Tirtouga about -10. Review #2 accepted the same band as non-blocking; a pale print is not made lighter than the era's haze without washing out the colour.
- The ink cut is a scan heuristic (dark pixels, rows 266-476): a print whose body text is light on a mid-tone body (Dragon prints use dark text, fine) would need
  its own rule; check any new set with the contact sheet (magenta = cut ink).
- The metal pattern (diagonal hatch) is TCG Live's real one but reads as fine lines at 30:25 on Escavalier-type prints; not changed here.
- No tilt-video reference for the bw2+ colour behaviour; bw1 colours are matched to scans only.
