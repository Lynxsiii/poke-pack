# Family dp-reverse: the Diamond & Pearl generation reverse holos (Mirror) and the Call of Legends Crosshatch Energy

Files: `js/fam/dp-reverse.js`, `css/holo/fam/dp-reverse.css`, `assets/foil/fam/dp-reverse/` (masks `<frame>-<layout>.webp`,
`hgss-energy-v2.webp`, `glints-v1.webp`, `hatch-v1.webp`), `scripts/fam/dp-reverse/make_masks.py` and `make_glints.py`.
Research and photos: `/mnt/project-files/holo-remaster/dp-reverse/` (refs/SOURCES.md, NOTES.md, sheets/). Built 2026-10-02 in two
bursts; review #1 (REVIEW-1.md) sent the SP frame back, fixed in the second.

## Claimed

Every reverse face of dp1-dp7, pl1-pl4, hgss1-hgss4 and col1 (`DEALT_SET`, an id guard: isDp also matches dpp, hsp, POP 6-9 and the
kits, which are never reverse) except a basic Energy; plus the Call of Legends basic Energy col1-88..95 (`dpr-cross`).
Census 2026-10-02: 1,941 faces. Left on the era look (dp.css): the basic Energy of dp1 (123-130) and hgss1 (115-122), which no pack
deals as a reverse (the engine's reverse slot is Common/Uncommon/Rare/Rare Holo), and every non-main-set id.

## The Mirror (everything but col1 88-95)

Real card (CE101 slab photos, Collexy flat scans, Pokemon Holo tilt clips; 3 sources, 20+ cards): foil on everything inside the yellow
border EXCEPT the picture (art window, evolution circle's picture on Stage cards, a Special Energy's picture, the Pokemon SP owner
portrait). Name bar, attacks, text box, weakness row and HP take it. A smooth mirror throwing VERTICAL rainbow bands of unequal width
(4-12% of the card), strongest on the light areas, tinted by the ink, brightest in one broad white-cyan column that slides sideways;
black text stays black; the Trainer's white box is a silver mirror with fine rainbow lines.

- Mask `--dpr-mask` (per card, `famExtras`): `<dp|hgss>-<basic|stage|trainer|senergy|sp>.webp`, 600x838, white where foil. Drawn from the
  SITE'S OWN scans by `make_masks.py` (mean + spread of every dealt card of a frame x layout; pictures are the high-spread regions).
  The SP mask also punches the owner portrait (a bowl at x 462-576, y 395-472 and the head above it, two ellipses `PORTRAIT`).
- `.foil` multiply: saturated vertical rainbow, repeat-x 300% wide, slides with `--background-x` at factor 0.6 (the lead slowed it: Noah
  said the rainbow must not race; never raise it), a white veil fades it to the ink away from the lamp column. Trainer: saturate 0.72.
- `.glare` OVERLAY (not screen): lamp column + a 50% grey veil (identity under overlay) over a vivid rainbow. Overlay keeps black text
  black and gives the frame's mid-tones the bands; screen washed all text grey. No colour-dodge anywhere (no WebKit pixel blocks).

## The Crosshatch (col1 88-95, class `dpr-cross`)

Real card (4 sources: CE101 PSA 10 slabs of Lightning, Psychic, Darkness; lowpopping Darkness photo; Collexy flats of Fire (the file
named "water" is Fire 89), Grass, Darkness; TeamPoketown clip; Collexy and Bulbapedia text): the WHOLE art and the bottom strip carry
a silver crosshatch: long fine lines in both 45 degree directions, in bunches that cross (a plaid), and on top of them a lattice of
tiny single-colour glints (blue, cyan, green, some magenta) ruled in patches, "\" in one zone, "/" in the next, lit only where the
lamp reaches. The white ENERGY title bar is opaque white with no lattice (its dark letters and the type disc do glint); the yellow
border is matte. The last pass drew a regular 3.4% diamond mesh (a visible chain-link grid: Noah's "holographic squares").

- Mask `hgss-energy-v2.webp`: the whole face inside the border minus the white bar fill (white in the mean of the 8 scans, spread
  low), letters and disc stay foil. The old `hgss-energy.webp` (whole face) is live and immutable, so this is a new name.
- `glints-v1.webp` (900x1257, `make_glints.py`): jittered dots on a diamond lattice (pitch 0.8% of the width), about half lit, dotted
  rows kept in two kinds of patch. `.foil`: glints multiplied by a coloured 135 degree swath (black between swaths), screened on.
- `hatch-v1.webp` (600x838): bunches of 5-12 near-parallel thin silver lines, random length and brightness, two directions, crossing;
  `.foil::before`, multiplied by a lamp pool, screened in at 30%. Irregular on purpose: no grid, no period, no grating.
- `.glare` hard-light (50% grey is the identity): the same swaths as a faint colour wash plus the lamp pool.
- Slide factor 0.6 like the Mirror.

## How to judge

`foil_probe.mjs --query "set=col1&cards=r94,r89&proof=off&w=220&poses=rest,30:25,75:65,50:78"` (`&fam=off` = before). Mirror: window and
border match the base scan, black text black, rest pose reads as foil, no grey at 50:78. SP: the portrait face is the same as the
before. Crosshatch: silver weave plus glitter, ENERGY bar matte white, no mesh.

## Open

- Mirror bands are fuller than the real card at a grazing angle (chosen for the phone); the Crosshatch swath wash is more colourful
  than the silvery real card (glints and lines carry the real look).
- Special Energy masks (7 cards) and the Stage evolution circle are from the earlier pass, not re-checked here.
- Immutable live masks: dp-basic, dp-senergy, dp-stage, dp-trainer, hgss-basic, hgss-energy, hgss-senergy, hgss-stage, hgss-trainer.
  Never rerun `make_masks.py` without `--only <new name>`.
