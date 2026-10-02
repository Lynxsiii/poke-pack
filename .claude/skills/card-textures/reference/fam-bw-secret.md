# Family bw-secret: Black & White secret rares (32 faces)

Part of the older-era holo remaster (2026-10-01/02). Module `js/fam/bw-secret.js`, sheet
`css/holo/fam/bw-secret.css`, maps `assets/foil/fam/bw-secret/`, generator
`scripts/fam/bw-secret/make_bw_secret_maps.py`, coverage check `scripts/fam/bw-secret/foil_coverage_mine.mjs`.
Research, photos, sheets and the review notes: `/mnt/project-files/holo-remaster/bw-secret/`.

## The faces

| Class | Cards | What the real card is |
| --- | --- | --- |
| `bws-gold` | bw7-150..153, bw8-136..138, bw9-117..122, bw10-102..105 (17) | Boundaries Crossed to Plasma Blast gold secrets and gold Items: brushed gold frame, holo art window with stipple and swirls, type symbol flashing, text box matte |
| `bws-goldfull` | bw11-114, bw11-115 (2) | Legendary Treasures gold Reshiram and Zekrom: the whole face mirror gold, the dragon engraved into it, ink text on top |
| `bws-yellow` | bw4-100..103, bw5-109..111, bw6-125..128 (11) and bw1-115, bw3-102 | Yellow-border secrets (the shiny reprints, Pokémon Catcher): matte yellow frame, only the Pokémon (or the Item) and the text-box type symbol are foil |
| `bws-grain` (with `bws-yellow`) | bw1-115 Pikachu, bw3-102 Meowth (2) | The same, and the scenery is pebbled varnish (a frosted look under a lamp) |

Every face gets `fam-bw-secret`, `--bws-etch` (TCG Live's etch at native 733 x 1024, alpha = what is etched) and
`cure: true`. `claims()` needs the per-card maps, so a face without them keeps the era look.

## What the real cards do (sources: refs/SOURCES.md, two or more clips per finish)

- Gold secret: frame and name band are brushed gold metal, an ochre gold under room light with a pale gold-white
  sheen where the lamp is and streaks of green, pink and orange as it tilts. The art window is holo (a sparkly
  stipple on the Pokémon, etched swirls behind it, a vertical rainbow column, a white hot spot). The type symbol in
  the text box flashes; the rest of the text box is matte.
- Gold full (Reshiram, Zekrom): mirror gold everywhere, dark ochre where it reflects the room, blown out to white
  gold under the lamp; the dragon is an engraving (dense line work in the etch) that catches the light; the black
  ink does not.
- Yellow secret: yellow frame, scenery and text are matte print. The Pokémon flashes a cyan, green and rust rainbow
  in a band that moves across it, with glitter in the band; the text-box type symbol is a faint rainbow strip.
- Pikachu and Meowth: the same on the Pokémon, and the art window around it is covered in small raised bumps that
  each throw a point of light.

## What is built (one layer each, never a recipe copied from another family)

`.foil` carries the base (rest and lit), `.cure` exists only while a card is held (display none at rest), `.glare`
is the lamp. Each of them is its own blended group: a pseudo-layer of `.foil` composites inside the `.foil` group
and then takes the group's blend mode, so a pale sheen in `.foil::before` under a `multiply` `.foil` vanishes.

- `bws-gold` (v1 of the earlier pass, kept): `.foil` hard-light metal over `--bws-metal` (the frame) plus a quarter
  of `--bws-holo` (the window); `.foil::before` the brushed hatch lit (the etch); `.cure` the rainbow column on the
  window and symbol (colour-dodge, ends in `contrast(0.8)`); `.cure::before` the stipple and swirls; `.glare` the lamp.
- `bws-goldfull`: `.foil` multiply bands of deeper gold (so the face is never one flat yellow), `.cure` screen: a
  hot spot at the pointer and a mirror band that crosses with the tilt, masked by the card's own scan as a
  LUMINANCE mask (`mask-image: var(--art); mask-mode: luminance`) so the black ink is left out of the wash;
  `.glare` colour-dodge: the etch (the engraving) flashing rainbow gold.
- `bws-yellow`: `.foil` hard-light: one sweeping rainbow band (transparent ends, so the Pokémon keeps its own
  colour outside the band) over the Live foil map squared (`--foil-map` intersect itself) and a vertical mask that
  holds the text box to 30 percent (the Live map has the type symbol at full strength); `.foil::before` the etch
  as white glitter; `.glare` soft-light lamp on the same shape.
- `bws-grain`: `.foil` also draws the two bump fields (`--bws-grain-a`, `-b`) as background images and its mask is
  the union of the Pokémon shape and the bumps, so a card at rest already glints; `.cure::before/::after` follow
  the tilt (bumps lit from the upper left when the lamp is left, from the lower right when it is right).

## Judge it

Phone size (220 px x 3), Chromium and WebKit, rest and 30:25, 75:65, 50:78, next to refs/photo_*.jpg:
gold frame bright at rest and flashing rainbow lit; Reshiram a mirror with a white hot spot and black text;
the yellow frame and the scenery never change colour; only the Pokémon bands. Failure signs: the frame or the
text box recoloured, one flat yellow on bw11, a fully recoloured Pokémon (a full-spectrum gradient), a grey or
brown rest (an era rest rule's filter leaking back, see LESSONS), visible tiles in the grain.

## Open (2026-10-02)

- Pikachu and Meowth grain is sparser than the real frost (the bump maps cover about 1 percent); it glints faintly at rest
  and fully when held.
- The bw11 hot spot is pale gold; the real card blows out to white there. The etch flash on the engraving is subtle.
- Judged against low-resolution video frames, in headless Chromium and WebKit; nothing was seen on a real iPhone.
- Seen at phone size: bw7-150/152/153, bw8-136/138, bw9-120/122, bw10-102/103/105, bw1-115, bw3-102, bw5-109/111,
  bw6-127/128, bw11-114. The other faces use the same recipe with their own Live maps.
- Version tags: `index.html` links `css/holo/fam/bw-secret.css?v=1` and `js/holo-fam.js` lists `["bw-secret", 1]`; bump
  both if the paused first version was ever served.
