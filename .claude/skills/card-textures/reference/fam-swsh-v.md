# Holo family swsh-v: Sword & Shield regular (half-art) Pokémon V

Module `js/fam/swsh-v.js`, sheet `css/holo/fam/swsh-v.css`, asset `assets/foil/fam/swsh-v/grain-v1.webp`, generators
`scripts/fam/swsh-v/` (make_grain.py draws the sparkle tile; bands.py writes the band gradients into the sheet). Built
2026-11-23 from the audit w2-swsh-v (/home/user/holo-work/w2-swsh-v/AUDIT.json).

## Scope (309 faces, census 2026-11-23)

Exactly the faces `swshPattern()` files as `foil-ex swsh-v`: "Rare Holo V" of a Sword & Shield era print with no Live
etch map (the etched ones are full arts, swsh-fullart). Before: no family. `svv-union` on the 20 V-UNION pieces
(cel25 swshp139-142, swsh7 swshp155-166, swshp swshp215-218): their Live maps put far more of the art in foil, so the
bands and tint are capped at 0.6.

## The real finish (photos: /home/user/holo-refs/w2-swsh-v, SOURCES.md; re-fetched into dl/)

- Foil over the whole face (sky, frame, name bar, text box, silver bars) EXCEPT the Pokémon and foreground objects,
  which are printed over white and keep their colour at every tilt (Flying Pikachu V CEL 006 tilted; Leafeon/Eevee/
  Glaceon V Crown Zenith; Glaceon V EVS 040). Live's map draws exactly this (black on the Pokémon).
- Very fine pinpoint sparkle drawn into short streaks rising to the right (brushed glitter).
- Lit: narrow crisp rainbow bands (about a tenth of the card wide) along the same diagonal, sliding with the tilt, over
  the sky and into the text box; silver-white sparkle between (CEL 006, Pikachu V VIV 043 in a toploader).
- Rest: the print with a faint dark-silver sheen. Dark ink stays dark (Charizard V DAA 019, Sableye V SSH 120).

## What was wrong (era recipe, css/holo/swsh.css `.swsh-v`)

A 40% foil floor under the map plus an unmasked hard-light white glare washed the Pokémon milky (Beedrill's upper-left
whited out at 30:25, Tyranitar mint-white); sixteen broad soft rays for a texture; no readable rainbow; text box milky
at 75:65 / 50:78.

## How the sheet draws it (full-art architecture, reference/fam-swsh-fullart.md)

- `.foil` colour-dodge masked by art ∩ Live map, NO floor: the grain tile at 0.45 (rest 0.28) plus a soft light pool,
  all multiplied by the scan, so dark ink gains next to nothing.
- `.foil::before` the bands (122deg gradient, 200% size, two bands per 16% period, light 0.6/0.4) x the scan's
  luminance, screened, masked by a pointer pool ∩ (grain ∪ 0.5 floor): the colour lives in the sparkle.
- `.foil::after` the scan's luminance through the grain, screened in the pool: silver-white sparkle between bands.
- `.glare` the pastel tint (saturation 0.5) multiplied through the inverted scan, masked by art ∩ map: colours the text
  box and keylines, leaves dark ink and the Pokémon alone. `.glare::after` off. No hard-light glare.
- Checked 2026-11-23, WebKit 220 px, one card per render, poses rest, 20:30, 50:45, 80:60, 30:25, 75:65, 50:78:
  cel25-6, swsh10-1, swsh12pt5-13, swsh35-1, swsh5-6, swsh8-6, swsh8-158, swsh10-98, swshp-swshp217. The Pokémon keeps
  its print at every pose; Venusaur's white wind streaks light because Live's map marks them foil (correct).
- Not drawn: a faint 10-20% sparkle on the Pokémon (audit, medium confidence): .foil's map mask covers every child, so
  it would need its own unmasked layer; left out.
