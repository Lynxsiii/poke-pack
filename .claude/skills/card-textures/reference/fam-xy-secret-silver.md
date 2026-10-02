# Family xy-secret-silver: Dialga-EX 122/119 (Phantom Forces, 1 face)

Part of the older-era holo remaster, secret rare remake (2026-10-02). Sheet: `css/holo/fam/xy-secret-silver.css`;
module: `js/fam/xy-secret-silver.js`; research, photos and sheets: `/mnt/project-files/holo-remaster/xy-secret-silver/`
(refs/SOURCES.md lists every photo).

## Why
Noah, 2026-10-02 20:09: "remake the Secret rares, most have really shitty texture and i dont like the overuse of the
rainbow glare ... Dialga-EX 122/119, the card looks amzing in person and on the site it looks like shit". Before this
family, xy-full-art's `xyf-silver` stepped aside for Dialga and the era's silver recipe (`xy-fullart.css`, a pale
rainbow multiplied on) painted it: a flat pastel wash with no texture and no metal contrast.

## What the real card does (100 eBay listings, different sellers and cameras; scans and photos under a lamp)
- A silver mirror over the whole card. The line art of Dialga is printed in a lighter silver and takes the same foil;
  only the black lettering and the coloured symbols (Energy, weakness, the gold EX and its rule box) are ink.
- High contrast in tall VERTICAL bands: dark grey, a narrow saturated rainbow stripe (red to violet), bright white
  silver, two to four times across the card. They slide sideways as the card turns. Scans show the colour as soft
  pastel fringes at the band edges; under a lamp the stripes are sharp and saturated.
- Engraved edge to edge: contour lines that follow the drawing and octagon rings round the Energy symbols, exactly
  TCG Live's etch for xy4-122. The lines break the stripes and light up near the lamp. No glitter.

## What the site draws
- `.foil` (hard-light, at rest and lit): `--xss-sweep`, one period half a card wide (dark 23-27 % grey, a 3 % wide
  spectrum, bright 88-91 %, back to dark) at 200 %, drifting about one period per full sweep (rainbow_speed 0.99);
  `--xss-env`, a broad 80-100 % grey band the other way (0.39), multiplied on so the bands are uneven; the lamp's pool
  (100 % at the pointer, 86 % far away) multiplied on. Masked by `--art` intersect `--xss-ink` intersect (`--xss-etch`
  plus a 50 % floor), so the engraving shows at every pose. Hard-light darkens the light scan where the band is dark
  (metal must darken where the light is not) and lightens it where it is bright; colour-dodge could not. Rest:
  opacity 0.55, saturate(0.45) (the scans' pastel); lit 0.55 + 0.4 x card-opacity.
- `.foil::before` (lit): a white radial pool screened on the etched lines round the pointer: the engraving flashing.
- `.glare` (lit): a soft overlay hot spot, white under 0.5, its far end clear. `.foil::after` and `.glare::after` off.
- Maps: TCG Live's etch at native size (`assets/foil/fam/xy-full-art/xy4-122-etch.webp`, shipped by xy-full-art,
  read-only here) and an ink mask drawn from the scan (`assets/foil/fam/xy-secret-silver/xy4-122-ink-v1.webp`,
  `scripts/fam/xy-secret-silver/make_ink.py`: luma under 105 or chroma over 48, opened, dilated by 1 px). TCG Live's
  foil map is not used: it leaves Dialga's line art at part strength, which the photos do not show.

## Gates (2026-10-02)
WebKit at 220 px x 3, rest / 30:25 / 75:65 / 50:78 against the photos (sheets/phone-compare.jpg); dark_specks 4-10
specks per pose (budget 40; the dark bands count as dark area, by design); foil_coverage xy4 clean; idle 0 ms;
rainbow_speed 0.99 and 0.39; every url the module emits exists.

## Open
- xy-full-art still carries its `xyf-silver` branch; it no longer runs (this family claims xy4-122 first). Remove it
  when the other secret families take the rest of xy-full-art's secrets.
