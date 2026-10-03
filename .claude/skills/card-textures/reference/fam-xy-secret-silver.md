# Family xy-secret-silver: Dialga-EX 122/119 (Phantom Forces, 1 face)

Part of the older-era holo remaster, secret rare remake (2026-10-02). Sheet: `css/holo/fam/xy-secret-silver.css`;
module: `js/fam/xy-secret-silver.js`; research, photos, sheets and the review: `/mnt/project-files/holo-remaster/xy-secret-silver/`
(refs/SOURCES.md lists every photo).

## Why
Noah, 2026-10-02 20:09: "remake the Secret rares, most have really shitty texture and i dont like the overuse of the
rainbow glare ... Dialga-EX 122/119, the card looks amzing in person and on the site it looks like shit". Before this
family, xy-full-art's `xyf-silver` stepped aside for Dialga and the era's silver recipe (`xy-fullart.css`, a pale
rainbow multiplied on) painted it: a flat pastel wash with no texture and no metal contrast.

## What the real card does (100 eBay listings, different sellers and cameras; scans and photos under a lamp)
- A silver mirror over the whole card. The line art of Dialga is printed in a lighter silver and takes the same foil;
  only the black lettering and the coloured symbols (Energy, weakness, the gold EX and its rule box) are ink.
- High contrast in tall VERTICAL bands: dark grey, a narrow saturated rainbow stripe (red to violet, red on the dark
  side), bright white silver, two to four times across the card. They slide sideways as the card turns. Scans show
  the colour as soft pastel fringes at the band edges; under a lamp the stripes are sharp and saturated.
- Engraved edge to edge: contour lines that follow the drawing and octagon rings round the Energy symbols, exactly
  TCG Live's etch for xy4-122. At 1:1 the flat ridges mirror the band and the grooves do not: thin dark lines across a
  bright band, thin light lines across a dark one, and the stripes break into coloured strokes. No glitter.

## What the site draws
- `.foil` (hard-light, at rest and lit), bottom to top:
  - `--xss-bands` (v18, 2026-10-02 23:59): seven uneven segments over one repeat of the 200 % background (two card
    widths, so three or four bands show at once): each a dark core of its own depth (23-28 %), a ramp to bright silver
    (92-97 %, its own width), a soft fall into the next core. Written by `scripts/fam/xy-secret-silver/make_bands.py`
    (`--write` rewrites the sheet's four values; tune there). Drifts about one stripe per full sweep (rainbow_motion
    median 1.14, p75 1.18).
  - `--xss-stripe`: a spectrum on every ramp, each its own width (3.4-6 % of the card) and alpha (0.6-0.9), red over
    the dark band's edge, violet into the bright, so the stripes are uneven in spacing and strength like the photos.
  - `--xss-env` (multiply): a broad 80-100 % grey band drifting the other way (0.39), so the bands are uneven.
  - `--xss-near` (multiply): the lamp's pool, 100 % at the pointer, never under 96 %.
  - `--xss-groove-ceil` (darken) and `--xss-groove-floor` (lighten): flat greys 0.42 and 0.33 whose alpha is the
    groove (Live's etch inverted, its soft alpha stretched from 0.2-0.8 to 0-1), so every groove is held between 0.33
    and 0.42 whatever the band: dark lines on the bright band, light lines on the dark band, coloured strokes in the
    stripe. `scripts/fam/xy-secret-silver/make_groove.py`.
  - Masked by `--art` intersect `--xss-ink`. Rest: opacity 0.7, saturate(0.45) (the scans' pastel); lit 0.7 + 0.25 x
    card-opacity, saturate(1.1); both x `--foil-strength`.
- `.foil::before` (lit): a white radial pool (0.5 at the pointer) screened on the etch's ridges, only inside the bright
  part of each band (`--xss-lit`, an alpha gradient make_bands.py draws on the same segments): the lines flash near the lamp.
- `.glare` (lit): a soft overlay hot spot, white under 0.3, its far end clear. `.foil::after` and `.glare::after` off.
- Maps: TCG Live's etch at native size (`assets/foil/fam/xy-full-art/xy4-122-etch.webp`, shipped by xy-full-art,
  read-only here), the two groove maps, and an ink mask drawn from the scan
  (`assets/foil/fam/xy-secret-silver/xy4-122-ink-v1.webp`, `scripts/fam/xy-secret-silver/make_ink.py`: luma under 105
  cut, chroma over 48 lets 0.4 of the foil through, so the stripes run on across the gold rule box as in the lamp
  photo). TCG Live's foil map is not used: it leaves Dialga's line art at part strength, which the photos do not show.

## Why the grooves are clamped, not multiplied (dark_specks)
A groove multiplied darker (v8) or mixed to one grey (v13) passed the eye and failed `dark_specks.py` (127-656 and
57-81 specks a pose): wherever a band crossed the speck threshold, the grooves and ridges crossed it at different
places, and the band broke into short isolated dark strokes. Held between two greys, a groove under a dark band stays
dark enough to join it, one under a bright band stays light, and in between it follows the band, so ridges and grooves
cross together: 5 / 4 / 1 specks. Lighting the ridges near the lamp has the same trap, hence the `--xss-lit` mask:
a lit ridge next to an unlit groove in a dark band is a speck.

## Gates (2026-10-02, v17)
WebKit at 220 px x 3, rest / 30:25 / 75:65 / 50:78 against the photos (sheets/phone-compare.jpg); engraving contrast
(luminance minus a 2.5 px blur, median std of 48 px blocks over the Pokémon, 660 px wide) 9.4 / 9.6 / 9.6 / 9.6 against
8.6-20.4 on six photos and 5 before; dark_specks 5 / 4 / 1 specks a pose (budget 40); foil_coverage xy4 clean; idle
0 ms; rainbow_speed 0.99 and 0.39; every url the module emits exists; 110 px grid size clean in WebKit (no moiré).

## Open
- xy-full-art still carries its `xyf-silver` branch; it no longer runs (this family claims xy4-122 first). Remove it
  when the other secret families take the rest of xy-full-art's secrets.

## v18: uneven bands and stripes (2026-10-02 23:59)
v17 repeated one band and one stripe every half card: two identical stripes half a card apart, where the photos show
three to five, thinner and unevenly spaced (review 1's optional point 11). v18 lays seven segments of different widths,
depths and stripe strengths over two card widths (make_bands.py). Tried on the way: eight hard-edged segments read as a
barcode; soft bands with light cores (up to 38 %) looked like the scans but dropped the engraving contrast to 7.3 (the
grooves read on bright bands and dark cores, not on mid-grey shoulders), so the cores stay 23-28 % and the falls short;
the ramp under each stripe is narrower than the stripe (0.8 of it), which let the stripes widen to 3.4-6 % of the card
with no loss of engraving. Gates (WebKit 220 px x 3, rest / 30:25 / 75:65 / 50:78): engraving contrast 9.6 / 8.5 / 9.0 /
9.3 (Chromium 9.6 / 8.9 / 9.4 / 9.6; v17 9.3-9.8; photos 8.6-20.4); dark_specks 10 / 2 / 6 / 3 (budget 40);
rainbow_motion x median 1.14, p75 1.18 (v17 1.12 / 1.17); foil_coverage xy4 clean; idle 0 ms. Judged beside the lamp
photo yPgAAeSwfEhqqKse and the scan 2ewAAeSwtqBqQzB6: sheets/v18-before-after.jpg in the research folder. The lamp
photo's stripes are still wider and more saturated than these (about a tenth of the card each); most listing photos
show them nearer this width.
