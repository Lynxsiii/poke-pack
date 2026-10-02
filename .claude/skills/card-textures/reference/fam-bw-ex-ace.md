# Family bw-ex-ace: Black & White regular-art Pokemon-EX and ACE SPEC (81 faces)

Files: `js/fam/bw-ex-ace.js` (claims every `bw-ex` and `bw-ace` face; class `fam-bw-ex-ace`), `css/holo/fam/bw-ex-ace.css`,
`assets/foil/fam/bw-ex-ace/{ex-vlines,ace-tinsel}.webp`, `scripts/fam/bw-ex-ace/{make_ex_vlines,make_ace_tinsel,ex_bands}.py`.
Research, photos, sheets: `/mnt/project-files/holo-remaster/bw-ex-ace/` (refs/SOURCES.md, sheets/, NOTES.md, LESSONS.md).
Scope: bw4 to bw11 EX and promo EX (68), ACE SPEC of bw7 to bw10 (13). Full art EX, secrets and the Radiant Collection are other
families'. The older era sheet `css/holo/bw-ex.css` still draws these cards when `&fam=off` (the BEFORE picture).

## What the real cards do (two or more independent sources each, see refs/SOURCES.md)
- Pokemon-EX: foil on the border, the art's ground, the name tab edges, the rule box and the EX logo; the Pokemon, the attack text box
  and all printed text are matte; the whole card is glossy. The foil is the "vertical" glossy pattern: fine vertical lines that light as
  TALL RAINBOW PILLARS. Under one lamp: a white-hot core with a fan of colour either side (blue at the top through green and yellow to
  orange at the foot), sliding sideways with the tilt (Darkrai-EX 88/113 tilt clip), plus a row of coloured vertical blocks along the
  frame and the foot (Lugia-EX BW83, Chandelure-EX, Victini-EX). Gold sparkle dust over dark art is printed in the scan already.
- ACE SPEC: foil on the border all round, the name strip, the ACE SPEC lettering and the art's ground; the item, the brushed-grey text
  box and the TRAINER bar matte. The foil is ruled with fine HORIZONTAL lines ("tinsel"), visible even in diffuse light, each line
  catching its own colour (cyan, magenta, violet, green) as the card tilts (Victory Piece, Life Dew, Rock Guard, Crystal Edge, Computer
  Search, Master Ball, G Booster clips; RegiPacks Rock Guard close-up).
- The TCG Live foil map of each print (assets/foil/maps/<set>/<n>.webp) draws exactly those zones; this family uses it as the mask.

## What the family draws
Everything is one `.foil` group per card, clipped by `--art` and the TCG Live map, plus the lamp layers. No tile is visible: the two
line textures are card-sized images (no repeat) and every colour comb is a gradient three card-widths wide.
- EX `.foil`: the band comb (`--bxa-bands`: a vertical band of mini-spectra every fifth of the card or so, irregular widths and gaps,
  strongest at the main pillar, printed by ex_bands.py then lifted to a 0.4 floor) over a light grey (#8c8c8c lit, #a6a6a6 at rest),
  masked by the art, a name-band fade (keeps the gold EX logo gold), `ex-vlines.webp` (fine vertical lines of unequal brightness,
  a floor baked in so the grey between lines still shows a sheen) and the map added to itself (a + a(1-a): the half-grey inked ground
  reads 0.75, the matte zero stays zero). Blend `hard-light`, `contrast(1.1..1.35) saturate(1.3)`: hard-light over neutral grey leaves
  the print alone between bands and lays a PURE colour on where a band stands, on a dark scan (Darkrai) and a pale one (Shaymin) alike;
  a colour-dodge cannot lift a saturated ground and a screen washes the gold.
- EX `::before`: the main pillar, an alpha mask about a quarter of the card wide with a 4%-wide solid core: a white core screened onto
  a hue ramp 10 degrees off upright (blue, cyan, green, yellow, orange, magenta, violet), standing under the pointer (offset per card
  by `--seed-x`). `::after`: the pointer's white pool and the glitter tile (screen, light only). `.glare`: a soft-light white radial
  (never darkens).
- ACE `.foil`: a colour ramp (blue, violet, magenta, amber, green, cyan; saturated hues at lightness 60%, bands 1/6 of the card tall)
  slid vertically by the pointer, under a white pool at the pointer, through `ace-tinsel.webp` (fine horizontal lines of unequal length and
  brightness, floor baked in) and the map; blend `hard-light`, `contrast(1.1..1.35) saturate(1.3)`. (The first build was a colour-dodge:
  on the pale silver border it returned white or a pastel and the phone-compare showed it paler than the era sheet; hard-light with a
  bright ramp lays a pure colour on border, lettering and art ground alike.) `::before`: the lamp's white-hot pool (screen). `::after`:
  a second ramp sliding the other way through the same lines, so neighbouring lines disagree in colour (lighten). The text box and the
  item are black in the map and stay matte.

## Promo EX (12 faces) and the review-1 fix (2026-10-02)
Nine promo EX (bw4-bwp036/037/038, bw6-bwp045/046/047, bw8-bwp061/062/063) carry their own TCG Live map in their data record
(`foilMap`, which foil-maps.js uses before bwMap()). The three of bw10 (BWP081 Thundurus-EX, BWP082 Deoxys-EX, BWP083 Lugia-EX) had none
and drew on the generic median map `bw-ex-safe.webp`, which counts most of their art as Pokemon: timid. TCG Live does carry them
(`cards/png/en/bwbsp/bwbsp_en_081..083_std.foil.png`, fetched with curl; urllib gets a 403): scripts/fam/bw-ex-ace/make_promo_maps.py
converts them as fetch_foil_maps.py does into `assets/foil/fam/bw-ex-ace/map-bwp081..083.webp`, and `famExtras()` sets `--foil-map` to
them. Do NOT point a promo at a regular print's map unless the art is the same: SIFT + RANSAC over the art window gave 800 to 1100
inliers for BW36/37/38 against the Next Destinies prints (a true match) and 7 to 13 for every other promo against all 56 regular EX
(BW83 Lugia-EX is not Plasma Storm 108/135's art, BW82 Deoxys-EX is the red form, BW81 Thundurus-EX shows Thundurus and Tornadus).
`.glare` is halved (0.4 of the card opacity, both recipes): the soft-light pool lifted the matte text box 7 to 9 luma levels.

## How to judge it
Phone size (220 CSS px x3), poses rest, 30:25, 75:65, 50:78, in Chromium and WebKit, beside refs/: the frame and the art ground must
carry vertical (EX) or horizontal (ACE) fine lines even at rest, a coloured pillar or colour bands must sweep the art ground and frame
on tilt, the Pokemon and every line of text must stay matte (measure foil-minus-bare in the text box: a few levels), the gold EX
logo must stay gold. No visible tile, grid or repeat; no black speckle (`dark_specks.py --set bw5 --cards 63,...`).

## What remains
- No macro photo of either grain exists; the line pitch is a judgement from phone frames. The EX pillar is wider and softer than a
  real one's hard white core on some cards; the real pillar hides behind the Pokemon, as ours does (the map is black there).
- No Dowsing Machine, Rock Guard or Life Dew photo besides the clips (ACE is one stock; the maps agree).
- The ACE is more saturated than the real clips (cyan, magenta and green lines where the real ones are paler pink and blue): kept on
  purpose, Noah asked for a flash that grabs attention.
