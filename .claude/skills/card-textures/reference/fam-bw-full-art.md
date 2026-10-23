<!-- Family note for the holo family bw-full-art (older-era holo remaster, 2026-10-02). Research, photos and the family
agent's log: /mnt/project-files/holo-remaster/bw-full-art/ (AGENT-LOG-thread-b.md, thread-b-scratch/ef/ for the real-card
photos). WIP of the unfinished parts: branch claude/dp-bw-holo-remaster-szkil1, commit 1b1bd03. -->
# bw-full-art

## Shipped: the flat full arts of Black & White to Noble Victories (`bwfa-sand`) (superseded 2026-10-22, below)

Reshiram 113 and Zekrom 114 (bw1), Thundurus 97 and Tornadus 98 (bw2), Virizion, Victini, Terrakion, Cobalion and N
(bw3 97-101). Real cards (photos in thread-b-scratch/ef/, Zekrom 114 pair): smooth to the touch, a stippled grey sand
foil on the background that sparkles, the Pokémon, frame and lettering a smooth mirror that throws rainbow under the
light. `--bwfa-sil` is TCG Live's two-level map for each print (white: Pokémon, frame, lettering; black: background,
shipped by `scripts/fam/bw-full-art/ship_live_etch.py`); `sand-v1.webp` (`make_sand.py`) is cut to its black part, and
the `.cure` layer carries the bands in hard-light so white and black ink both take the colour. Checked in WebKit at
phone size (rest, 30:25, 75:65, 50:78), foil_coverage clean, dark_specks clean on all nine.

## Shipped 2026-10-02 (second pass): the engraved full arts of Next Destinies to Plasma Blast (`bwfa-lines`) (superseded 2026-10-22, below)

46 Live prints of bw4-bw10. The first draft failed review: held, the whole card washed to pastel and the Live etch's flat or
dark areas showed 20-40 px checker cells (Darkrai-EX bw5 107). `scripts/fam/bw-full-art/make_lines_v2.py` finds those
cells and redraws them as fine lines at the etch's own pitch (`etch-v2/<id>.webp`, Live's native 733 px), and the bands
are a narrow streak about a quarter of the card wide with dark gaps, at lower cure, foil and glare opacities (their own
`--bwfa-eb-*` variables), so the art keeps its colours. A few regions read as stipple (Shaymin's leaf, Iris's hair): that
is Live's own etch.

## Shipped 2026-10-02 (promos)

- Darkrai BW73 and Giratina BW74 (`bwfa-lines bwfa-promo`): line etch drawn from the scan by
  `scripts/fam/bw-full-art/make_promo_etch.py` (contour-following lines at Live's 6.5 px pitch). The shared bwfa recipe
  paints `.foil::before` (a screened white pool) at full opacity even at rest, which greyed the dark art; the
  `.bwfa-promo` block turns it off at rest and holds `.foil` at a faint sheen, so rest is the plain print.

## Landorus BW43 (shipped 2026-10-02 evening)

The real card is a hammered dimple grain edge to edge (photos: /mnt/project-files/holo-remaster/bw-full-art/landorus/),
not a line etch. Five maps failed at phone size: a dense random grain read as TV static, blurred grain as camouflage,
Voronoi cells with their own colour as stained glass or snakeskin, round dots as confetti. What passed (`etch-v9`,
`make_promo_etch.py pebble()`): soft domes lit from the top left at about 4.5 px pitch on a 733 px card, brightness
only, so the colour comes from the sheet's one broad vertical rainbow band and the grain only embosses it.

## 2026-10-22: rebuilt after the photo audit (all 58 faces)

Audit reports and photos: `/home/user/holo-work/bw-fa-*/AUDIT.json`, `/home/user/holo-refs/bw-fa-*/` (SOURCES.md in
each). Fix work and before/after sheets: `/home/user/holo-work/fix-bw-full-art/`.

What the real cards do (photos win over earlier notes):
- **bw1-bw3 flat full arts**: silver foil over the whole face, frame and text box included. Under the light,
  several narrow (2-5% of the card), crisp, fully saturated vertical spectral stripes repeat every 8-25% of the card
  and cross the Pokémon, background, frame and text box alike (Reshiram 113 EF macro, N 101 CGC slab clip, Tornadus 98
  and Thundurus 97 tilt clips; high). Dark ink stays dark: Zekrom 114's black body stays black, the stripes run on its
  white outlines and the frame (scan pair, tilt clip; high). Saturated backgrounds read as metallic ink with only a
  fine grain (Victini 98, Virizion 97 clips); a grey one shows a fine stipple (Zekrom scans; medium).
- **bw4-bw10 engraved full arts**: line etch edge to edge, following the drawing. Lit, each ridge is a thin bright
  line with the print between; the art keeps its hue (Rayquaza-EX stays deep green, two videos); light ink goes
  silver-white; dark ink stays dark (Lugia-EX and Raikou-EX PSA macros); the rainbow is ONE narrow vertical streak
  (10-20% of the card) on silver (several thin ones under a point lamp, Raikou slab). The gold outline is a glittery
  metallic gold (Rayquaza clip, White Kyurem and Latias scans). At rest the card reads as the print, lines faint.

What changed:
- New per-card maps (new names only): `inklight-v1/<id>.webp` (make_ink_light.py: the scan's light ink, 0 on black or
  navy, 1 on white and the silver frame) cuts every coloured layer, so black ink never takes a rainbow;
  `gold-v1/<id>.webp` (make_gold_outline.py: the printed gold outline found in the scan) for the glitter;
  `etch/bw2-97-v2.webp`, `bw2-98-v2.webp` (fix_genie_sil.py): Live's Genie silhouettes had the art window inverted
  (the sand speckled Thundurus and Tornadus).
- `bwfa-sand`: `.cure` is the stripe sheet (`--bwfa-stripes`, hard-light on 0.5 grey, 180% wide so it drifts one
  stripe spacing per sweep) through art x ink x a full-height column round the pointer, no silhouette and no foil map
  (the real foil covers the text box too). The sand is multiplied by the scan before it is screened, so a speck
  brightens the ink in its own hue (Victini stays red, no salt) and is invisible on white; rest opacity 0.3.
- `bwfa-lines`: held `.foil` lights only the ridges' flanks (etch minus itself shifted 1.3 px, about a fifth of the
  pixels), neutral silver with the narrow streak (`--bwfa-ln-light`), multiplied by the scan; rest is the same flanks
  at 0.28 in the room's light (no pastel tint); `.cure` is the streak in hard-light through art x ink x column;
  `.glare` a warm white soft-light gloss (the pastel hard-light and the overlay that turned green to teal are gone);
  `.cure::after` the gold glitter (sand specks screened through `--bwfa-gold`).
- `bwfa-pebble` (Landorus BW43) keeps the 2026-10-02 rules, now scoped to `.bwfa-pebble` alone.
- Mistake to avoid: a `*/` inside a header comment (a path like `bw-fa-*/`) closes the comment and silently drops the
  next rule, here the shared block that defines every variable.
- (Wrong, corrected in round 2 below: the cells that painted nothing were not a load race.)

Open: Live's dot-field etch regions (Groudon's body, Registeel, Celebi) now light as sparse flank points, not a sheet
with black holes; they were not redrawn (`make_lines_v2.py` etch-v3 is still a possible refinement). The gold map also
catches thin yellow flame flecks on fire backgrounds (Rayquaza, Entei). Still to judge: the lit band of the engraved
faces is about 16% of the card wide (`--bwfa-ln-tint`, 1.3-6.6% of a 300% gradient); a narrower band and a stronger
resting line texture (Rayquaza-EX, Dialga-EX show their lines plainly in hand) are the next tuning steps.

## 2026-10-22, round 2 (after the fresh review)

Review findings: `/home/user/holo-work/review-bw-full-art-r1/`. Work, renders and before/after/real sheets:
`/home/user/holo-work/fix-bw-full-art/r2/` (ba-<id>.jpg, cs-*.jpg).

- **Engraved streak**: it painted a smooth, near-opaque rainbow column over light ink and repainted faces (Mewtwo-EX,
  Skyla, Ghetsis). Real (Colress lit and PokeBeach photos, Lugia-EX and Raikou-EX macros): the white coat goes
  silver-white, the rainbow shows through the wavy lines, silver either side. Now `--bwfa-ln-tint` is about 60%
  saturation pre-mixed part way to the 0.5 grey (a little over half strength) with a silver-white core, `.cure` is cut
  to the etch's ridges (`--bwfa-ink` x `--bwfa-etch`), and the column round the pointer is a wide painted grey fade
  (`--bwfa-ln-fade`): the streak drifts with `--background-x` the other way from the pointer, so a tight column hid it
  at the edges.
- **Lines across the whole lit card** (lit Colress shows the line shimmer on the frame, background and coat): the held
  flanks use `--bwfa-lines-k` (1.0 under the light, 0.52 at the far corner) and brightness 1.8+, multiplied by the
  scan twice (its square), so light and mid ink shimmer in their own hue and dark ink stays dark (a dark grey Darkrai
  BW73 took a grey line screen with the scan once).
- **Genies**: Live's silhouettes only ever drew the head and torso; `etch/bw2-97-v3.webp`, `bw2-98-v3.webp`
  (fix_genie_sil.py) add Tornadus's tail and Thundurus's orbs and ring from the scan (Tornadus: anything coloured on
  the grey sky; Thundurus: dark ink, dull greys and blue to purple on the yellow sky). The v2 drafts are deleted.
- **Stripes off saturated ink** (Victini and Virizion clips: glossy metallic red and green, the rainbow on the frame):
  the flat faces' ink maps also fall off with saturated mid-tones, x clamp(1 - 2.2 S (1 - Y)) (make_ink_light.py;
  inklight-v1 of bw1-bw3 rewritten, never shipped). Bright yellow, white, the frame and pale skies keep the stripes.
- **Stripes less regular**: `--bwfa-stripes` (stripes.py) is one non-repeating run of 11 stripes, 3-4% of the card
  wide, at gaps of 12-22% and strengths 0.65-1, and the column is narrower (full within 7%, half at 19%, 0.12 at 42%),
  so two or three stripes are bright near the light (Reshiram macro) and the rest faint. rainbow_motion on bw1-113:
  median 0.91 turns.
- **WebKit dropped lit layers** (the reviewer's cells with no stripes): not a load race. A layer with three mask layers
  (one a gradient) or five blended backgrounds was dropped on some lit cards whenever several were lit at once (one
  card at a time always painted). Fixes: the flat `.cure` is masked by the ink map alone (it carries the scan's alpha,
  so it is the art mask too) with the column painted as grey; the engraved `.cure` by ink x etch; the engraved `.foil`
  by one baked flank map (`flank-v1/<id>.webp`, make_flanks.py: etch x (1 - etch shifted 1.3 px) x scan alpha,
  4 levels, about 80 KB); the sand `.foil` by art minus silhouette in two layers; `--bwfa-hold` dropped from both
  `.foil` backgrounds (they fade in by opacity). After that, 2- and 3-card WebKit renders at scale 3 paint every lit
  cell. Rule: two mask layers, four blended backgrounds at most, no gradient among the masks.
- The module preloads and decodes each face's maps as it mounts (as ex-gold-star does), so the first held frame has the
  ink map and the flanks, which only the held layers use.
- **Gold glitter**: it sat inside `.cure`, whose mask was cut to the column (15% elsewhere); with the column painted
  instead, it now glitters along the whole outline (Rayquaza-EX 123 at native size).

Open: Live's dot-field etch regions (Mewtwo-EX's tail, Groudon-EX's body) light as a fine bright sparkle, not lines;
the silver frame of the flat cards takes stripes only near the light (the clips show it rainbow at most tilts);
Landorus BW43 (`bwfa-pebble`) keeps its 2026-10-02 broad band, which no audit sampled.


## 2026-10-22, round 3 (after the second review)

Review findings: `/home/user/holo-work/review-bw-full-art-r2/`. Work and sheets: `/home/user/holo-work/fix-bw-full-art/r3/`.

- **WebKit left the scan out of the lit lines** in a probe's lower rows (engraved `.foil` = lines-k x streak x `--art` x
  `--art`, masked by the flanks): a white or blue line screen over the face (Entei-EX's lettering cut by white dashes,
  Articuno-EX's sky). Reproduced here in two of three plain 3-card WebKit probes (bw8 132/134/135 at 75:65 and 50:78:
  S 136/82/81, line energy 3x, against 172/106/91 healthy), always rows below the first screen (the probe's viewport is
  900 px; the rest takes a full-page shot). Cause, as far as the renders show: WebKit decodes a large background image
  (about 500 KB decoded and up) asynchronously when it first paints off screen, at the size it is drawn, and each pose
  draws it at another size; the mask images always painted. A first try that baked the whole lit texture into one large
  background-and-mask map lost the whole layer in those rows instead. What ships: per face, `flank-v1/<id>.webp`
  (make_lit.py: where the texture catches the light, lossless alpha, 733 x 1024, used only as a mask) and
  `tone-v1/<id>.webp` (the scan, squared for the engraved faces, at 280 x 391: small enough to decode on the spot) as
  the colour, so no layer draws `--art` and no background is a large image. The sand is a 256 px seamless tile
  (`sand-tile-v1.webp`, make_sand.py --tile 256) repeated at the sheet's own scale; `.glare` has no image mask (the
  printed card radius, 3.97% / 2.84%, rounds it). Rule for this family: large maps go in masks only.
- **Live's dot fields** (Mewtwo-EX's tail, Groudon-EX's body, Registeel-EX, Ghetsis's coat: mostly white etch with
  small black specks) lit as sandpaper; make_lit.py redraws each such region as fine lines along its long axis (6.5 px
  pitch with make_lines_v2.py's sway) before taking the flanks (real: a fine woven hatch, Mewtwo-EX eBay scan).
- **Flat cards' frame rainbow** (Victini 98 in-hand and tilt clips: the whole silver frame a vivid spectrum whose hue
  changes along it; Reshiram 113 tilted clip, N 101 slab): `frame-v1/<id>.webp` (make_frame.py: the outer 4% border
  band where the scan is near-neutral, plus the name bar joined to it) carries a broad diagonal spectrum on
  `.cure::after` (one cycle in about 0.6 of the card, sliding with the tilt; rainbow_speed 0.47), inside `.cure`'s
  hard-light, at full strength all round and a little dimmer far from the light.
- **Metallic lift**: `.glare` is a color-dodge of a near-neutral grey under the light on every face (the engraved
  faces' soft-light white paled the art 14-19%): the ink brightens in its own hue (Victini's red to a glossy pink-red,
  Virizion's green to a yellow-green glare, as in their clips), black stays black, light ink flares silver-white.
- **Landorus BW43** (`bwfa-pebble`): the old broad band (a rainbow sheet over the body) is replaced by the flat cards'
  narrow stripes, frame rainbow and gloss (its photos, /mnt/project-files/holo-remaster/bw-full-art/landorus/, show
  several narrow vertical stripes and a rainbow frame), the hammered grain a grey light on light ink through the drawn
  domes. The unused `--bwfa-eb-*` variables are gone.
- make_flanks.py is superseded by make_lit.py (which imports its constants).
- Checked: plain 3-card WebKit probes at scale 3 now give the same pixels as a tall-viewport probe with every row on
  screen (bw8 and bw5 twice each, bw4 and bw9 twice, identical numbers), lit rows' line energy at or above rest, no
  white line screen. Art-box saturation at 30:25 against rest: Entei-EX 119/127, Groudon-EX 146/150, Tornadus-EX
  108/112, Articuno-EX 174/179, Mewtwo-EX 90/96; Cresselia-EX 77/89 and Skyla 67/78 (the silver-white flare sits over
  their pale art). Gates: foil_coverage bw1-bw10 silent, dark_specks ok on every sample, rainbow_speed clean.
- Still open: Zekrom 114's white outlines take the stripes only near the light (its frame is now rainbow all round);
  the cache versions of the sheet and module (index.html, js/holo-fam.js) need a bump when this ships.
