# Family bw-secret: Black & White secret rares (32 faces)

Part of the older-era holo remaster (2026-10-01/02), remade 2026-10-02 (v2, Noah: "most have really shitty texture
and i dont like the overuse of the rainbow glare as most cards dont really have that rainbow glare") and fixed after
review #2 (v3). Module `js/fam/bw-secret.js`, sheet `css/holo/fam/bw-secret.css`, maps `assets/foil/fam/bw-secret/`,
generators `scripts/fam/bw-secret/make_bw_secret_maps.py` (v1 maps), `make_bw_secret_v2.py` (the `-v2` maps) and
`make_bw_secret_v3.py` (the `-v3` maps and the re-encoded unshipped `-v2` files), `make_bw_secret_v4.py` (2026-10-22: `fm/-v4`,
`stip/`, `grain/-v3`, `disc/`), coverage check
`scripts/fam/bw-secret/foil_coverage_mine.mjs`. Research, photos, sheets and the review notes:
`/mnt/project-files/holo-remaster/bw-secret/` (sheets: `v2-compare-<finish>.jpg` real | live | new, `v3-compare.jpg`
real | v2 | v3).

## The faces

| Class | Cards | What the real card is |
| --- | --- | --- |
| `bws-gold` | bw7-150..153, bw8-136..138, bw9-117..122, bw10-102..105 (17) | Boundaries Crossed to Plasma Blast: a shiny Pokémon on a type-coloured card with a GOLD BORDER (every one of them, Exeggcute, Virizion and Dusknoir 102-104 included), and the gold Items. Foil border with a fine diagonal hatch and a rainbow-gold sheen, holo art window along Live's etch, type symbol flashing, the Items' Poké Ball a silver-grey disc, text box otherwise matte |
| `bws-goldfull` | bw11-114, bw11-115 (2) | Legendary Treasures gold Reshiram and Zekrom: the whole face mirror gold, the dragon engraved into it, ink text on top |
| `bws-yellow` | bw4-100..103, bw5-109..111, bw6-125..128 (11) and bw1-115, bw3-102 | Yellow-border secrets (the shiny reprints, Pokémon Catcher `bws-item`): matte yellow frame and text; the window background is etched concentric arcs, the Pokémon (or the Item) a metallic sheen over a fine stipple, the text-box type symbol etched rings |
| `bws-grain` (with `bws-yellow`) | bw1-115 Pikachu, bw3-102 Meowth (2) | The same, and the scenery is pebbled varnish (a frosted look under a lamp) |

Every face gets `fam-bw-secret` and `cure: true`; the finish adds its maps (below). `claims()` needs the per-card
maps, so a face without them keeps the era look.

## Maps (assets/foil/fam/bw-secret/, immutable once live: a changed map gets a new `-v2` name)

All are TCG Live's own maps (cdn.malie.io, the foil map 367 x 512 and the etch 733 x 1024), split by zone so each CSS
layer paints only the zone it belongs to. The etch is converted to white with alpha = line (sigma 0.6 blur only).

| Folder / file | Used by | What |
| --- | --- | --- |
| `metal/<id>.webp`, `holo/<id>.webp` (v1) | gold | `metal`: the frame zone (foil map outside the art window); `holo` kept for reference |
| `hatch/<id>-v2.webp` | gold | Live's etch inside the FRAME only: the brushed hatch of the border, name band and bars |
| `tex/<id>-v2.webp` | gold | Live's etch inside the art WINDOW plus the type SYMBOL of the text box: stipple, swirls, rings |
| `eng/<id>-v2.webp` | goldfull | the whole etch (the engraved dragon) with the printed ink knocked out |
| `ink/<id>-v3.webp` | goldfull | alpha 1 on the gold of the scan, 0 on the ink, the symbols and 2 px around them (one plain alpha mask for `.foil`, `.cure` and `.glare`) |
| `fm/<id>-v3.webp` | yellow, grain | TCG Live's foil map (the shipped `assets/foil/maps/<set>/<n>.webp`, read only) at 733 x 1024 with the compact round features of the print knocked out inside the art window: pupils (brown-grey, darker than the face around them), nostrils, the red of cheeks, an open mouth, Meowth's two white eyes. Hard-light lifts any dark pixel the band crosses, so the band turned an eye cyan and a cheek violet. 0.4-6 percent of the Pokémon per face; a limb, an outline or a dark or red body keeps its foil (shapes over 46 px or 1400 px are skipped) |
| `glint-v3.webp` | yellow, grain | ONE full-card speck map (733 x 1024, fine round gaussian specks, jittered, no repeat), shared by the 13 faces |
| `grain/<id>-a-v2.webp`, `-b-v2.webp` | grain | the pebbled scenery bumps: round, larger, fewer (v3 rewrote them in place, they were unshipped), lit from the upper left (a) and the lower right (b) |
| `etch/<id>.webp` (v1) | yellow (v4) | Live's etch of the yellow faces: the window-background arcs and the text-box symbol's rings (alpha = line, 0 on the Pokémon). Loaded again in v4 as `--bws-etch` |
| `fm/<id>-v4.webp` | yellow (v4) | `fm/<id>-v3` with everything outside the art window removed but the big text-box symbol (components over 2500 px and 100 px tall): Live's map also holds the HP symbol, the attack-cost and weakness/retreat energy circles and "BASIC", which the band turned green and cyan |
| `stip/<id>.webp` | yellow (v4) | the Pokémon's own fine stipple: random dots (sigma 0.55 px, one per 7 px^2) inside the Pokémon part of fm-v4, weighted by the scan's luminance (dark ink keeps an eighth). Replaces the shared `glint-v3` speck map |
| `grain/<id>-a-v3.webp`, `-b-v3` | grain (v4) | the pebbled scenery a third of v2's bump size, about three times as dense |
| `disc/<id>.webp` | gold Items (v4) | the text box's big Poké Ball from Live's foil map (0.45 there, normalised to 0.9; band and button 0) |

## What the real cards do (sources: refs/SOURCES.md, two or more clips per finish)

(v3 research; the 2026-10-22 photo audits corrected it: see "v4" below, which wins where they differ.)

- Gold secret: frame and name band are brushed gold metal: an ochre gold under room light, pale gold-white where the
  lamp is, fine hatch lines (horizontal on the bars, vertical on the sides, diagonal on the name band). At most a
  faint green-gold tint at a grazing edge; no pink, no rainbow. The art window is the holo: sparkly stipple on the
  Pokémon, etched swirls behind it, ONE narrow vertical rainbow column, a white hot spot. The text box is matte
  except the type symbol, an embossed ring pattern that flashes pale.
- Gold full (Reshiram, Zekrom): mirror gold everywhere, ochre where it reflects the room, blown out to white-gold
  under the lamp, no rainbow; the dragon is an engraving that catches the light; the black ink does not.
- Yellow secret: yellow frame, scenery and text are matte print. The Pokémon is a glitter foil; as the card moves
  one narrow band of cyan, green and rust crosses it; the text-box type symbol is a faint strip.
- Pikachu and Meowth: the same on the Pokémon (Meowth only green and cyan), and the art window around it is covered
  in small raised bumps that each throw a point of light.

## What is built (one layer each, never a recipe copied from another family)

(The v3 recipe. v4 rebuilt `bws-yellow`, `bws-grain` and parts of `bws-gold` and `bws-goldfull`: see "v4" below.)

`.foil` carries the base (rest and lit), `.cure` exists only while a card is held (display none at rest), `.glare`
is the lamp. Each is its own blended group: a pseudo-layer of `.foil` composites inside the `.foil` group and then
takes the group's blend mode. No colour-dodge anywhere (Safari paints blocks); the blends are hard-light, screen and
soft-light. `.foil::before/::after` and `.glare` are `display: none` at rest in base.css, so this sheet sets
`display: block` (the last rule hides them again under `no-shine`).

- `bws-gold`: `.foil` hard-light, `--bws-field` (brushed CHAMPAGNE: bluish tops, see below) plus a pale hot spot at the
  pointer, masked by `--bws-metal` so it touches the FRAME only (rest: the field parked, `filter: none`);
  `.foil::before` the brushed hatch (`--bws-hatch`) in pale gold; `.cure` clipped by `clip-path: inset(...)` to the art
  window (`--bws-wt/wr/wb/wl`, other insets for `bws-trainer`): a hot spot and one narrow rainbow column (screen);
  `.cure::before` rainbow glints through `--bws-tex`, multiplied by a radial vignette so they follow the lamp;
  `.glare` pale silver glints through `--bws-tex` (stipple, swirls, symbol rings) that fall off away from the lamp
  (a uniform glint over Live's dense etch is a white veil and a line screen).
- `bws-goldfull`: `.foil` hard-light, `--bws-gfield` (deeper ochre bands, hue 40-53) through `--bws-ink` (one baked
  alpha mask: 1 on the gold, 0 on the ink) so hard-light cannot lift the black ink to brown; `.foil::before` the
  engraving in pale gold, `.foil::after` the same engraving in dark ochre that fades near the lamp (pale where the light
  catches it, dark between); `.cure` a hard white hot spot (the real card blows out to white, refs/g11_crops.jpg) and a
  mirror band (screen), through `--bws-ink`; `.glare` soft-light lamp, through `--bws-ink`.
- `bws-yellow`: `.foil` hard-light: ONE narrow band (cyan, green, lime, rust: 4 percent of a 300 percent layer, about
  13 percent of the card width; the 68-degree second band tinted an eye cyan and a cheek violet and is gone) over the
  baked foil map `--bws-fm` squared (`--bws-fm` intersect itself: Live's foil map with the eyes and cheeks knocked out) and a vertical mask that holds the text box to 30 percent. At
  rest the band is parked off the card (`background-position: 0% 0%`) and `.foil` is at 0.9: glitter only until the
  card is held. `.foil::before` the white glitter: `--bws-glint` (the speck map) through the Pokémon-shaped `.foil`
  mask, so the specks land on the Pokémon only (rest opacity 0.8); `.glare` soft-light lamp on the same shape.
  (v2 drew Live's etch here: it is the window-background swirl and the text-box rings, so it intersected the
  Pokémon-shaped mask almost nowhere and a resting shiny reprint was the bare scan.)
- `bws-grain`: `.foil` also draws the two bump fields as background images and its mask is the union of the Pokémon
  shape and the bumps, so a card at rest already glints; `.cure::before/::after` follow the tilt.

Gold frame colour (v3): hard-light cannot desaturate a yellow print with warm tones (it multiplies red and green down
and lifts blue only with a pale top colour). The brushed champagne of the real frame (refs gold_crops*, the PSA Charizard
8SgN7hCVvC8) therefore comes from BLUISH top colours (hue 226-236, lightness 50-74): over the print they land on olive
(193,178,86), (238,222,110) and pale champagne (255,228,150). One field serves rest and lit (a separate rest field popped
when the card was picked up or let go).

Rainbow budget: every layer is under rainbow_speed.py 1.5 (it reports nothing); `--background-x` runs 37-63 percent
and each band is a no-repeat layer, so one spectrum crosses the card per full sweep at most.

## v4 (2026-10-22): what the photo audits found, and what changed

Audits `bw-secret-a` and `bw-secret-b` (reports and photos: /home/user/holo-work/bw-secret-a|b/AUDIT.json,
/home/user/holo-refs/bw-secret-a|b; before/after sheets: /home/user/holo-work/fix-bw-secret/ba-*.jpg).

Finish facts (sources in the audits' SOURCES.md):
- Yellow shiny secrets (bw4-bw6): the art-window BACKGROUND is dense concentric etched arcs (Live's etch exactly),
  glinting silver-white tilted and visible front-on (Chandelure slab, two photos; Gardevoir zoom). The Pokémon is a
  smooth metallic sheen (Emboar flashes cool cyan-white) over a fine dense stipple that keeps the ink colour and takes a
  soft rainbow near the lamp (Reuniclus face, Rayquaza head); black ink stays glossy black, no white specks. The big
  text-box type symbol is foil with etched rings, a faint pink-silver strip (Reuniclus, Krookodile). Frame, name band
  and text matte.
- Pikachu 115: broad mirror-rainbow blocks on Pikachu (silver-white, cyan, gold, orange), no glitter; the scenery's
  pebble relief is a frosted sheen near the light only, invisible at rest (PSA slab, three poses).
- Gold border secrets (bw7-bw10, all of them, not only Plasma Blast 102-104): the BORDER is foil, a fine diagonal etched
  hatch, metal gold from olive/ochre shade to bright gold, with a rainbow-gold sheen (orange, yellow, a pink flash at an
  edge) as it tilts (Virizion x3, Dusknoir, Golurk). The window is holo along Live's etch (wavy lines on the Pokémon,
  whorls behind), the colour follows the etch near the lamp, a SMALL hot spot, the art stays readable (Altaria, Dusknoir).
- Gold Items: the text box's big Poké Ball is a silver-grey disc, clearly visible at rest (JP Random Receiver scan,
  Rare Candy photo). Rare Candy's candy reads pale silver-grey (one photo, low confidence).
- Gold Reshiram/Zekrom: old gold (hue about 40, saturation 55-70 percent), every zone of the dragon a deep etched line
  field that reads at rest, a small white hot spot, no rainbow (PriceCharting scan, a sleeved JP Zekrom, Reshiram x3).

Changes:
- `bws-yellow`: `.foil` is a screen container with no paint of its own; `.foil::before` Live's etch (`--bws-etch`,
  window arcs and symbol rings; the symbol held to 0.45 by `--bws-textbox2`), silver-white near the lamp, 0.22 at rest;
  `.foil::after` the per-card stipple (`--bws-stip`) in a soft pastel rainbow near the lamp, 0.24 at rest; `.glare` the
  metallic sheen (a broad soft band of cool white and pale gold, screen) through `--bws-fm` (v4). No hard-light hue band
  (it repainted heads and wings), no `glint-v3` specks. `bws-item` (Pokémon Catcher): a white-gold sheen only.
- `bws-grain`: the bumps are out of the rest state; `.cure::before/::after` show the finer v3 bumps within about a third
  of the card around the pointer; `.glare` is hard-light with two soft blocks (silver-white/cyan, gold/orange).
- `bws-gold`: the frame field is metal gold (greyish-blue and greyish-violet tops: olive shade, orange gold, bright
  gold, see the CSS); the hatch carries a rainbow gold (`--bws-rgold`) that moves with the tilt; the window's hot spot is
  a tenth of its old radius, the column feathered and dark, the etch's rainbow glints a screen layer of their own (no
  grey specks inside the hot spot) with a wider vignette; the Items' `.glare` is hard-light and also paints `--bws-disc`
  a cool grey.
- `bws-goldfull`: the field desaturated to old gold at about the print's luminance and the engraving dark old gold
  everywhere but near the lamp (pale white-gold there). The shade cannot go as dark as the audit's (170,120,50):
  `dark_specks.py` fails a field more than 40 levels under the print once the engraving cuts it into pieces.
- Not changed (left for a later round): Rare Candy's candy is still the print's cyan (the desaturating layer needs a
  blend group of its own, and the gold Items have none free); the yellow symbol's narrow rainbow streak.

## v5 (2026-10-22, round 2: the fresh review failed v4)

What the review found in WebKit at phone size, and what changed (maps: make_bw_secret_v5.py):
- Rayquaza/Krookodile: white stars on dark ink at 30:25. Cause: on bw6 Live's etch also holds a stipple over the
  Pokémon, drawn silver-white near the lamp. `etch/<id>-v2` is Live's etch without the Pokémon; `stip/<id>-v2` has no
  dots below luminance 0.2. The real black body's localised green/pink sheen near the head is `.cure` through
  `dark/<id>` (the Pokémon's dark ink), screen, a green/cyan/pink cycle under a small lamp vignette.
- Gold-border frame at rest was the bare print: the v4 field sat on its pale stops along the left border and the pale
  rest hatch drew it back. v5: a 200 percent field of mostly mid and shade gold with narrow highlights and a cross-grain
  mottle; the rest hatch is a mid tone (texture, not light). WebKit, left border strip x 22-34, rows 300-800: about
  (225,185,46) with std 20 (v4: (242,197,20), std 5). Lit: a lamp on the frame and a broad orange/gold/lime/pink band.
- Virizion: no wave etch at rest. v5 `.glare` is hard-light through `pok/<id>` (the Pokémon from Live's foil map, alpha
  over about 0.6): a 40 percent grey deepens the ink (deep metallic pink), the lamp is a small white core with a warm
  red-orange ring; `.glare::after` draws `wave/<id>` (Live's etch on the Pokémon, none on dark ink) as pale lines, so
  the etch reads at every angle. No darkened lines: dark_specks counts darkened line fragments as specks.
- Rare Candy cyan: `bws-silver` paints the ball (ellipse 11.4% x 8.2% at 50% 34.85%) a warm grey under hard-light,
  which lands the printed cyan on a pale silver-grey teal; the wrappers stay deep blue (the photo agrees).
- Gold window: no rainbow column (Sigilyph's colour sheet). `.cure::before` puts the rainbow along `texg/<id>` (Live's
  window etch, none on dark ink) near the lamp; `.cure::after` is the small hot spot, clipped to the window.
- Pikachu: a crisp elliptical mirror block at the lamp (silver-white core, cyan, gold, orange rim), hard-light,
  clipped to the window (the lightning watermark stays print) and held inside the window when the thumb is low; the
  scenery pebbles are half as bright and within about a quarter of the card of the pointer.
- Reuniclus: the yellow `.foil` container is hard-light now (every top light or transparent), so the stipple's dots
  take colour instead of whitening; the lit etch is cyan-green white at the lamp and fades away from it (no even silver
  ring target over the whole window).
- bw11 corners: the layer reset set border-radius 0, so the gold-full field painted the scan's corner pixels outside
  the rounded edge. The reset keeps the card radius (3.97% / 2.84%, app.css). The hot spot is about a quarter smaller.
- Virizion's body (real: deep metallic crimson-pink at every angle, 2 photos): `bws-pink` gives it a crimson top
  (hsl(338, 46%, 33%)) instead of the grey, and `pok/bw10-103` keeps only the pink ink (hue 305-5, saturated) thinned
  so no pink loses over about 36 levels (stronger failed dark_specks between the pale etch lines). Still lighter than
  the photos; deeper needs a darker map between the etch lines without counting as specks.
- Gold border lit: the rainbow gold (`--bws-rgold` on the hatch) is 200 percent wide (was 300) and the hatch lamp
  reaches 22 percent (was 30), so each pose shows two or three of orange, pale gold, lime and salmon-pink along the
  border instead of one lemon wash near the lamp.
- Left open: Reshiram (bw11-114) faint at rest; Reuniclus' stipple colours are pale; the lime and pink of the border
  stay weak on the lemon print (hard-light of a lime or pink top over yellow lands on yellow-lime and salmon-orange).

## v6 (2026-10-22, round 3: the fresh review failed v5)

Finish facts the review added (photos in /home/user/holo-refs/bw-secret-a and -b):
- Gold Items: the text box's Poké Ball is a matte silver-grey disc and the rules text stays black at every pose (JP
  Random Receiver 079/070 scan, Rare Candy photo). No light of its own, no rainbow.
- Gold border (Virizion slab crop and tilt crop): the fine diagonal hatch throws orange, yellow, GREEN and PINK patches
  along the border as it tilts; gold still dominates.
- Virizion's body: median of the photo's pink pixels (124,45,64), luminance 33 percent: a deep crimson, not candy pink.
- Gold windows: the rainbow (red, gold, green, cyan, violet) runs along Live's whorls near the lamp, over the Pokémon
  too (gloved Dusknoir tilt, JP Terrakion crest).

What changed:
- Items' disc ring: the cause was the lamp (`--bws-lamp`, a white core with orange and red rings) in the hard-light
  `.glare`, whose mask holds the disc: with the thumb on the text box it drew a red/orange/yellow ring and turned the
  rules text orange. The lamp is gone from `.glare` (`--bws-glamp: none`; only Virizion has a crimson specular there).
  The hot spot `.cure::after` is masked to the window rect plus `--bws-symmask` (the symbol's rings on the Pokémon,
  nothing on the Items). The spark `.cure::before` is clipped to the window.
- Gold window rainbow: `.cure` is hard-light (screen only whitened the light ink), the spark's tops are light (62-74
  percent lightness, so no dot loses luminance) with a cycle of about 0.43 card widths, and it fades by an alpha mask
  (texg intersected with a radial: full at the lamp, about 0.3 over the rest of the window, so a thumb on the text box
  still lights the whorls), never toward black.
- Gold border: `--bws-band` (in `.foil`, between the hatch lines) is a repeating 112deg cycle of saturated hard-light
  tops (orange (225,95,25), green (25,205,95), rose pink (235,60,225)) clear on gold, in step with the hatch's
  `--bws-rgold` (the same cycle in lighter tints). A light veil over the lit field keeps every border pixel within 40
  levels of the print: lighter hatch lines cut the field's shade stops into pieces that dark_specks.py counted as 170+
  specks per card. Measured on the real Virizion crop's border strips: gold 53-73 percent, orange 21-31, green 5-21
  (its pink reads salmon); the band's alphas (orange 0.6, green 0.55 and pink 0.85 on short plateaus) aim near that while keeping a rose
  pink, and a pale gold covers about half of the band away from the lamp, so the colours sit where the light catches
  the border (v5 measured gold 100 percent, everything else 0).
- Virizion: pok/bw10-103 at full strength (make_bw_secret_v5.py, PINK no longer thinned), `--bws-deep`
  hsl(338,32%,20%), the etched lines a lighter crimson hsl(342,40%,33%) that still sits over 40 levels under the
  print, so lines and body are one dark area for dark_specks.py. Lit, a crimson-red specular (`--bws-glamp`, `--bws-wlit`).
- Yellow faces: dark/ holds only near-black ink (luminance under about 0.22: no brown Krookodile head, no grey Zoroark
  legs); its sheen is a short cycle of green, pink and gold within about 19 percent of the lamp at 0.5. The stipple
  tint is a repeating cycle of about half a card width (a face grades through two or three hues; Reuniclus).
- Pikachu and Meowth: no stipple (`.foil::after` off); the mirror flash is a tall ellipse (9 x 24 percent) at the
  pointer of hard-edged bands (a wide silver-white core, a cyan-blue rgb(20,90,240) ring, gold, then orange fading
  out), so the colours run nearly vertical with soft ends; v5's round rings with soft cyan-to-gold ramps read as a
  lime stripe.
- Left open: Reshiram (bw11-114) is still low in contrast at rest (a paler field was tried: it lifted the gold but not the
  contrast, because a lighter hard-light top compresses the print's own shading; reverted). The yellow window arcs (nit)
  were not changed.

## Judge it

Phone size (390 px x 2), Chromium and WebKit, rest and 30:25, 75:65, 50:78, next to refs/photo_*.jpg and the
sheets `v2-compare-*.jpg`: gold frame brushed ochre and white-gold (no green, no pink); the window holds the rainbow
column and a stipple that stays near the lamp; text box matte; Reshiram a mirror with a white hot spot, black text and
engraved lines; the yellow frame and the scenery never change colour; only the Pokémon bands, and at rest it only
glitters. Failure signs: the frame or the text box recoloured, a veil of white lines over the window, one flat
yellow on bw11, a fully recoloured Pokémon, grey or brown rest (an era rest rule's filter leaking back, see LESSONS),
visible tiles in the grain, grey text on the gold (hard-light lifting black ink).

## Open (2026-10-02)

- Judged against low-resolution video frames, in headless Chromium and WebKit; nothing was seen on a real iPhone.
- The etch lines are 1 px at 733 px: on a 1x display of a 390 px card they are half a pixel and read as fine noise.
- The gold full face is more saturated than the real card in a video frame (the real one is a duller olive gold).
- The eye and cheek knock-out (`fm/`) keys on colour and shape of the scan: Pikachu keeps both eyes, both cheeks and the
  mouth; Meowth (`SLIT_EYES` in make_bw_secret_v3.py) keeps both white eyes (a 30 px disc around each slit pupil: the
  band's cyan edge turned a white eye cyan); a limb-sized dark marking or a red body is not protected. Look at every
  pose, not just 75:65 and 50:78, when a face is added.
- Rendering: Chromium sometimes dies on the screenshot ("Target crashed") when other agents render too; retry (rr3.sh does).
- Never use a four-layer `mask-composite` fold for an ink knock-out: Chromium draws it, WebKit draws no foil at all. Bake
  the knock-out into a map instead (`ink/<id>-v3.webp`).
- Version tags: `index.html` links `css/holo/fam/bw-secret.css?v=` and `js/holo-fam.js` lists `["bw-secret", n]`; bump both
  for the v2 files (the new `-v2` maps have new names, so they need no bump).
