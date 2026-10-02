# Family bw-secret: Black & White secret rares (32 faces)

Part of the older-era holo remaster (2026-10-01/02), remade 2026-10-02 (v2, Noah: "most have really shitty texture
and i dont like the overuse of the rainbow glare as most cards dont really have that rainbow glare") and fixed after
review #2 (v3). Module `js/fam/bw-secret.js`, sheet `css/holo/fam/bw-secret.css`, maps `assets/foil/fam/bw-secret/`,
generators `scripts/fam/bw-secret/make_bw_secret_maps.py` (v1 maps), `make_bw_secret_v2.py` (the `-v2` maps) and
`make_bw_secret_v3.py` (the `-v3` maps and the re-encoded unshipped `-v2` files), coverage check
`scripts/fam/bw-secret/foil_coverage_mine.mjs`. Research, photos, sheets and the review notes:
`/mnt/project-files/holo-remaster/bw-secret/` (sheets: `v2-compare-<finish>.jpg` real | live | new, `v3-compare.jpg`
real | v2 | v3).

## The faces

| Class | Cards | What the real card is |
| --- | --- | --- |
| `bws-gold` | bw7-150..153, bw8-136..138, bw9-117..122, bw10-102..105 (17) | Boundaries Crossed to Plasma Blast gold secrets and gold Items: brushed gold frame, holo art window with stipple and swirls, type symbol flashing, text box matte |
| `bws-goldfull` | bw11-114, bw11-115 (2) | Legendary Treasures gold Reshiram and Zekrom: the whole face mirror gold, the dragon engraved into it, ink text on top |
| `bws-yellow` | bw4-100..103, bw5-109..111, bw6-125..128 (11) and bw1-115, bw3-102 | Yellow-border secrets (the shiny reprints, Pokémon Catcher): matte yellow frame, only the Pokémon (or the Item) and the text-box type symbol are foil |
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
| `etch/<id>.webp` (v1) | none now | Live's etch of the yellow faces is the window-background swirls and the text-box rings, not the Pokémon: it is no longer loaded |

## What the real cards do (sources: refs/SOURCES.md, two or more clips per finish)

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
