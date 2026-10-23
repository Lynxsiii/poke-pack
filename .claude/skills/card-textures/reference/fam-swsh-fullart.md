# Holo family swsh-fullart: Sword & Shield full arts (V and Supporter)

Module `js/fam/swsh-fullart.js`, sheet `css/holo/fam/swsh-fullart.css`, assets `assets/foil/fam/swsh-fullart/`,
generators `scripts/fam/swsh-fullart/` (bands.py writes the band gradients into the sheet; ship_live_etch.py ships
the missing native etch maps). Built 2026-10-22 from the audits w2-swsh-vfa and w2-swsh-tfa.

## Scope (425 faces, census 2026-10-22)

Exactly the faces `swshPattern()` files as `foil-ultra swsh-vfa` (292: full-art and alternate-art Pokémon V, "Rare
Ultra" not VMAX/VSTAR, and "Rare Holo V" with a Live etch) or `foil-ultra swsh-tfa` (133: full-art Supporters, Trainer
Gallery and Galarian Gallery included). Classes: `sfa-v` (275 V), `sfa-alt` (86 of them: the alternate arts listed in
`ALT`, every TG and GG V, the alt-art promo SWSH260), `sfa-t` (133 Supporters), `sfa-keep` (17 outliers the sheet
skips, so they keep the era's look: Crown Zenith Energies 152-159, illustration promos swshp282-284, gold Zacian and
Zamazenta swshp076-077, Morpeko V-UNION swshp287-290; none has photos of its real finish yet).

## The real finish (photos: /home/user/holo-refs/w2-swsh-vfa, /home/user/holo-refs/w2-swsh-tfa)

- Whole face foil, frame to text box; black ink matte; dark inks keep their hue (Serperior SIT 170 on mat, Exeggutor
  PGO 071 zoom, Hop CPA 073 scan, Chili & Cilan & Cress FST 258 in hand).
- Etched relief that follows the drawing, which is TCG Live's etch: fingerprint whorls on backgrounds, hatching on the
  Pokémon, wavy lines on the frame; visible held flat as light ridges (Serperior zoom, Charizard V SWSH050 on wood).
- Silver frame: the brightest foil, prismatic, a faint rainbow even held flat (Orbeetle VIV 166, Exeggutor PGO 071).
- V lit: broad saturated diagonal rainbow bands, about a third of the card wide, over the light inks and the white
  keylines (Charizard SWSH050, Orbeetle 166, Umbreon alt cs4aC 152).
- Supporter lit: many narrow broken diagonal streaks rising left to right, silver-white with rainbow edges, over frame,
  sky and white clothes (FST 258); the etch sparkles under a lamp (JP s12a 246 Elesa).
- Alternate arts: one broad band over the painting, a fine sparkle in the light areas, deep shadows kept (Celebi FST
  245, cs3aC 132; Giratina LOR 186; Umbreon alt).

## How the sheet draws it

- `.foil` colour-dodge, masked by art and (Live map or a 0.35 floor): black + Live's etch at 0.30 (rest) / 0.40 (lit)
  + the frame ring (four strips: silver lit, a faint rainbow at rest at 0.7) + lit, a soft grey light pool round the
  pointer (36 at the centre, black from 75%), all multiplied by the scan, so dark ink gains next to nothing (Hop's
  jacket +4 levels lit, it was +33 when the pool sat above the scan). Rest paints this layer alone (base.css).
- `.foil::before` the bands' light x the scan's luminance (luminosity blend over grey), screened into the dodge, masked
  by a pool round the pointer and the Live map. Supporters: the streaks times a breaker along their length. bands.py
  writes the gradients: light at most 0.40, tint saturation 0.36 (higher turned pale arts lime and Celebi neon).
- `.foil::after` glitter-flecks x the scan (Supporters: x the etch too), screened, in the pool.
- `.glare` multiply: the bands as pastel tints through the inverted luminance, 1 - (1 - tint) x L, masked by art and
  map, so white keylines, wings, aprons and the silver frame take colour and dark ink does not. No hard-light grey glare
  (it lifted dark ink 25-37 levels).
- WebKit drops a whole lit layer whose gradient runs to about ninety stops (seen 2026-10-22 on every Supporter of a
  render): the streaks and bands are short repeating gradients (period 14% / 26% of the line), about twenty stops.
- Thirteen faces had only the blurred `-etch-v3` map or the shared tile (the swsh45, pgo and swsh12pt5 promos, Charizard
  V SWSH050, Judge TG25): Live's etch exists for all of them (swshbsp <n>, swsh12a 025) and ships as
  `<id>-etch-v1.webp`; the module sets `--fa-etch` inline. data/*.json still points at the old maps.
