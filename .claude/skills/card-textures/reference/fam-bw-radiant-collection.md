# Family bw-radiant-collection: Legendary Treasures' Radiant Collection (bw11 RC1-RC25)

Files: `js/fam/bw-radiant-collection.js`, `css/holo/fam/bw-radiant-collection.css`, `assets/foil/fam/bw-radiant-collection/`
(rc-chips-v3.webp + rc-chips-mask-v3.webp, rc-stars-v3.webp + rc-stars-mask-v3.webp, map-rc24-v3.webp, motif-rc{4,6,7,10,12,14,19}-v3.webp, motif-rc3-v2.webp),
`scripts/fam/bw-radiant-collection/`
(make_rc_textures.py, make_rc_motifs.py; make_rc_maps.py drew the 2026-10-02 per-card silhouettes, no longer used).
Photos: `/home/user/holo-refs/bw-rc/` (SOURCES.md lists every URL); the 2026-10-01 research in
`/mnt/project-files/holo-remaster/bw-radiant-collection/` (its "Pokemon is matte" conclusion was wrong, see below).

## What the real cards do (2026-10-22 audit, photos win)

- **Confetti holofoil**: uncommons RC3, 4, 6, 7, 10, 12, 13, 14, 19, the regular-art Meloetta-EX RC11 and the full arts RC21-RC25.
  Round foil sequins about 2% of the card wide, packed nearly edge to edge and overlapping, over the **whole face**: border
  (yellow, black or silver), name bar, the window **including the Pokemon**, text box. Sources: RC7 eBay photo
  (`family/rc7-pikachu-photo-chips-border-textbox-motifs.jpg`, zooms beside it: chips on Pikachu's body and the yellow border),
  two RC11 photos (`RC11/photo-*`: chips on Meloetta's face, hair, loops, the moon and the black border), RC25 lit
  (`family/rc25-meloetta-fa-lit-rainbow-chips-on-pokemon.jpg`), JP Reshiram 022/020 (`RC22/jp-sc022-*`: chips on the white body).
  In room light they read as a pale, low-contrast disc texture; tipped, single chips flash one saturated colour (lime, orange,
  blue, violet, pink, pale yellow), neighbours in a region mostly in one hue band (RC22 JP, RC24; low confidence).
  Mew RC24 is the one ambiguous card: Mew's head reads smooth in one tilted photo.
- **Motifs** (regular-art uncommons): a per-card pattern in the text box and name bar (RC7 Pikachu heads, four-point sparkles,
  hearts, bolts; RC4 rows of flowers, hearts and paws; RC14 dotted hearts; RC3, RC6, RC10, RC12, RC19 too) that reads as darker,
  smooth olive or deep-red shapes with the chips running over them (RC7 photo; RC4 real scan `RC4/scan-real-textbox-flower-motifs-dark.jpg`).
  Not in the site's scans except Purrloin RC13's. Per card (round 3, from the real images in
  `/home/user/holo-work/fix-bw-radiant-collection/refs-real/`, SOURCES.md there lists the URLs): RC4 Growlithe, eight rows of
  crisp deep-red five-petal flowers, hearts and paws between dashes, plus flowers and a heart in the name bar (Amazon scan);
  RC7 Pikachu, solid olive Pikachu heads, sparkles, hearts and bolts (eBay and Pinterest photos); RC12 Stunfisk, large outlined
  hearts, small hearts and swirls in grey-blue (kronozio scan); RC14 Eevee, a big heart filled with polka dots read as holes, a
  heart of stars, small hollow hearts (eBay photo, toywiz scan); RC10 Gardevoir, lace lighter than its dark purple box (Pinterest
  scan); RC19, diagonal stripes; RC6, bubbles.
- **Star holo**: commons RC1, 2, 5, 8, 9, 15-18 and Elesa RC20. Small five-point stars (about 3% of the card), sparse: 10-15 visible
  at once over the whole face (window and Pokemon, name bar, text box, yellow border), each one colour: gold, pink-orange, cyan-blue,
  lime, white (RC1 eBay photo, RC18 photo). No chips. The print keeps its saturation.

## What it draws (2026-10-22, round 2)

- **Zone: the whole face.** `--foil-map` is `assets/foil/maps/full.webp` for every card except RC24 (`map-rc24-v3.webp`: the old
  silhouette map lifted to 0.6 on Mew and blurred, 300 x 419). No per-card cut-outs of the Pokemon.
- **`.foil`, the sequins (or stars), at rest and held.** Texture = one flat grey facet g per sequin, clear between them, as a
  seamless 320 x 384 tile at 440 px per card width (make_rc_textures.py: random discs on a torus, each cutting a 0.7 px clear ring
  into the ones below; 77% coverage), repeated at 72.73% of the card and offset by the seed. The coverage alone is a second file
  (`rc-*-mask-v3.webp`) for the mask layer. `.foil` is masked by art ∩ zone ∩ coverage ∩ (scan luminance lifted to a 0.45 floor),
  so only the sequins paint and dark ink keeps them at about half strength.
  Under the texture: a broad hue band H (`--rcf-hue`, five hues per two cards, drifting about 1.5 bands per sweep) multiplied by a
  grey sweep s (`--rcf-sweep`, 0.35-0.85, one rise and fall per 0.8 card, sliding faster). The texture is blended `difference`
  over L = H * s and crushed (`--rcf-crush`): a sequin lights where H is high and its facet is near s, in the band's colour. A
  `contrast(0.8)` lifts every sequin to a pale floor (the rest look). Then `invert(1) brightness(0.5) invert(1)` maps the result o
  to 0.5 + o/2 and `.foil` rides **`hard-light`**, which on that range equals `screen` of o, and a closing `saturate(1.7)` (2.2 made green chips on white count as dark specks) pushes
  a lit sequin's off-channels under 0.5, where hard-light multiplies: lit chips show their hue on yellow, white and pale print
  (lime/cyan/orange chips on RC7's yellow box, chips on Meloetta's and Emolga's white faces), which a plain `screen` could not.
  Lit: c 27 + brightness 1.25. Rest (`--rcf-crush-rest`): c 33, dimmed to 0.55.
  Stars: bold five-point stars 4.6% of the card across (inner radius 0.5), about 120 per card; saturated bands (gold, white,
  cyan, lime, pink-magenta), c 43 + brightness 1.5 lit, c 30 + 1.5 at rest (round 3: c 21 lit about 30 stars on RC1; the lit window
  is about 2 / (c + 1), so c 43 gives 10-18 on RC1 and RC18, the photos' 10-15).
  Chip hue band (round 3): lime, orange-red, magenta, blue-violet, cyan (`--rcf-hue` stops 215/255/0, 255/80/0, 255/0/240,
  50/0/255, 0/235/255). A chip lights only in the channels where H is near 1, so a band of pure yellow/green lit everything lime;
  with these stops G is high in only two of five bands and lit chips come out pink, blue, violet, cyan, orange and lime.
- **`.cure`, the motifs (rcf-motif): RC3, 4, 6, 7, 10, 12, 14, 19.** Round 3 (v3, below) replaced all but RC3. Round 2 drew
  `motif-rc<n>-v2.webp` (make_rc_motifs.py from the registered
  difference maps refs/loc/rc<n>.png: smoothing sigma 1, soft ramp above a per-card threshold, pieces under 70 px dropped and a 1 px smoothing (both keep the dark-speck gate), text
  box and name bar only; no hole filling, so hollow hearts stay outlines and dotted hearts stay dotted). RGB is the multiply colour
  (RC7 olive 0.55/0.6/0.62; RC4 0.44, its real scan's bold dark-red flowers; RC3, 6, 12 0.56; the light grey boxes and the
  ragged lace lighter, RC14 0.7, RC19 0.83, RC10 0.76, which keeps them under the dark-speck gate), alpha the
  motif; drawn as a plain background in
  `multiply` with no mask, at rest too (printed look), hidden under no-shine.
- **Round 3 (2026-10-22), motifs v3 as clean shapes** (`motif-rc<n>-v3.webp`, make_rc_motifs.py, deterministic). The v2 strokes
  read as smears (RC4), brown smudges (RC12) and crumbling dots (RC14). Now: the real photo or scan is registered onto the
  site scan (SIFT + RANSAC homography, 2x), the evidence is 1 - photo / smooth gain field (text and motif excluded), cleaned
  (blur, threshold, close, fill holes, open, drop small pieces, smooth contours) and then redrawn with templates where a shape is
  known: RC4 five-petal flowers and hearts stamped where the fit is good (>= 0.62) on its eight row lines, dashes as clean bars;
  RC14 a parametric heart with the polka dots cut out on a fitted lattice, the star heart with stars on a lattice, hollow hearts
  as outlines; RC7 heads filled solid (a head the photo lost is copied from its neighbour); RC12 filled hearts and swirls from
  the scan. RC6 (bubbles: circles fitted to the old difference map, highlight holes), RC19 (stripes: period and phase fitted to
  the old map) and RC10 (lace) come from the 2026-10-01 registered difference maps refs/loc/rc<n>.png. Colours (multiply RGB):
  RC4 0.55/0.33/0.32 deep red, RC7 0.53/0.59/0.48 olive, RC12 0.6/0.64/0.68, RC14 0.72/0.72/0.77, RC19 0.82/0.82/0.86,
  RC6 0.58/0.6/0.66, RC3 (v2) 0.56. RC10 (`rcf-motif-light`) is added in `screen` with RGB 0.44/0.41/0.52: the bare foil of its
  lace reads silvery on the dark purple box.
  `.cure` now sits at z-index 2, UNDER `.foil` (z 3): the sequins light on over a motif as on the real card instead of being
  darkened with it. The unshipped v2 drafts of RC4-RC19 were deleted.
- **`.glare`** (held): a soft white pool, soft-light, about a third of the old one. The star commons add a faint pastel mottle
  sliding with the tilt; Elesa RC20 (rcf-trainer) and the Confetti cards do not.
- `.foil::before/::after` and `.glare::after` are off.

## How to judge it

WebKit, phone size (220 x 3), rest, 30:25, 75:65, 50:78, beside the photos above: sequins as pale discs over the whole face at rest,
coloured flashes in bands when held, chips on the Pokemon, text black; 10-15 visible stars on a common including the border and
name bar. Before/after sheets of 2026-10-22: `/home/user/holo-work/fix-bw-radiant-collection/ba-bw11-RC*.jpg`.

## Pitfalls met

- The era's `bw-rc` rules (bw.css, bw-fullart.css) are still in the cascade: five `.era-bw` and four family classes beat them.
- A `filter` on `.foil` applies to its pseudo layers too; layers that must not be crushed go on `.cure` or `.glare`.
- **WebKit dropped the whole `.foil` while ONE image URL was both its background and a mask layer.** Diagnostic (2026-10-22,
  `/home/user/holo-work/fix-bw-radiant-collection/r2/dropout_probe.mjs`: three cards x four poses at scale 3, screenshots at
  0.4-12 s, each against a screenshot with `.foil` hidden): with the texture in both places, 3 of 4 runs had every cell bare at
  one or more moments (0.4 s, 3 s, 5 s or 8 s) and painted at others; shrinking the image did not cure it. The same stack with the
  coverage in its own file (or no texture in the mask) painted at every moment in every run (art + zone, art + luminance art,
  a 660 px alpha image, a 320 px tile; and the shipped stack on RC11/RC22/RC18). So: never reuse a background image as a mask
  image on the same element; give the mask its own file.
- Images are kept under 128,000 px (tiles, 300 x 419 maps) as a precaution: WebKit decodes larger images asynchronously when it
  paints them outside the viewport.
- A wide crush window lit half the sequins faintly and the band's colour washed the whole card (blue over RC11 at 50:78): keep the
  window narrow and push the lit ones to full instead.
- `screen` cannot show a chip or star on yellow or white print; hard-light on 0.5 + o/2 with a closing saturate does.
- The motif difference maps look noisy downscaled; judge an extraction at native size (a 2000 px sheet made good RC14 hearts look
  like fragments).
- A thresholded difference map is never a clean motif: chip flashes in the photo punch holes and add crumbs. Fit templates
  (flower, heart, star, lattice) where the shape is known; matching templates on the raw evidence took RC4's dashes for hearts,
  so find objects on an opening first.
- Motif tone vs the dark-speck gate: a lighter multiply colour with ragged pieces raised RC6 from 40 to 44 specks (budget 40);
  clean shapes at the same tone stay under it (RC6 v3 38, RC4 19, RC14 29, RC12 17, RC7 3).

## Not as good as the real card

- RC3 keeps its v2 strokes (no clean real image found this round). RC19's bow and hearts are not drawn (stripes only), RC14's
  name-bar motifs are not drawn, and RC10's lace stays subtle. RC6 sits near the dark-speck budget (38 of 40).
- The real-image sources live in the work dir (`refs-real/`), not in `/home/user/holo-refs/bw-rc/`; copy them there before the
  work dir is cleared if the motifs are to be redrawn.
- The hue bands are broad, but at phone size neighbouring lit chips still mix two or three hues; the JP RC22 photo's regional
  bands (blue-violet top right, warm lower right) read stronger.
- The sequins do not change size with the angle, and there is no parallax between the sequin layer and the print.
