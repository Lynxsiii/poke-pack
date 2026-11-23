# Holo family swsh-rainbow: Sword & Shield Rainbow Rares

Module `js/fam/swsh-rainbow.js`, sheet `css/holo/fam/swsh-rainbow.css`, grain generator
`scripts/fam/swsh-rainbow/make_grain.py` -> `assets/foil/fam/swsh-rainbow/grain-v1.webp`. Built 2026-11-23 from the audit
w2-swsh-rainbow (`/home/user/holo-work/w2-swsh-rainbow/AUDIT.json`).

## Scope (census 2026-11-23: 181 faces)

Exactly what `swshPattern()` files as `foil-ir swsh-rainbow`: every "Rare Rainbow" of a Sword & Shield era print (80
Supporters, 75 VMAX, 25 VSTAR) plus Crown Zenith Pikachu `swsh12pt5-160` (a "Rare Secret" swshPattern routes here;
swsh-gold excludes it). Sub-classes:

- `srb-alt`: 15 alternate-art VMAX secret rares the data files as "Rare Rainbow" (swsh5-168, 170; swsh6-201, 203, 205;
  swsh7-205, 209, 212, 215, 218, 220; swsh8-266, 269, 270, 271). They are full-colour textured paintings, not rainbow
  stock (Umbreon VMAX EVS 215 in hand; PSA label "FA/UMBREON VMAX"; limitlesstcg numbering: 214 is the rainbow, 215
  the alt). Drawn here as a finer, fainter glitter with a neutral light. Better long term: route them in
  `js/foil-maps.js` to the alt-art VMAX recipe (swsh-vmax `svm-alt`), which needs a foil-maps change and swsh-vmax's
  claim widened.
- `srb-show`: Pikachu 160, weaker, neutral. The real card's foil is the lightning bolts and eyes (green/silver flash)
  and a soft relief sparkle on the background figures; Live's map already keeps the yellow border matte.

## The real finish (photos: /home/user/holo-refs/w2-swsh-rainbow, SOURCES.md there)

- The rainbow is printed, pastel, fixed. The whole face is foil; Live's map: background full, figure about half, black
  text matte.
- Foil = coarse dense glitter, round grains about 1 CSS px at 220 px card width, mostly silver-white, some blue, green,
  pink, gold. Visible lying flat (Mewtwo PGO 079 on a table, Leafeon EVS 204 on wood). Strongest on the background and
  text box, smoother on the figure.
- Lit: a silver-grey light, the background taking a metallic cast (gold-green / silver-cyan, Alcremie SHF 073); the
  figure keeps its print. Not a second spectrum on top (Noah's Sun & Moon note: too much "rainbow glare").
- Medium confidence, not drawn: a broad vertical spectral band at some tilts (Charizard CPA 074 slab photo).

## What the sheet does

`.foil` (also at rest) dodges the grain tile multiplied by Live's etch over a floor, so grains on the ridges are
brighter and the fingerprint etch shows as points, never lines. `.foil::before` screens a silver pool round the pointer,
tinted by a broad gold-green / silver / silver-cyan gradient that slides with the tilt, masked by the map again (the
figure keeps its print). `.foil::after` is the wink: the grain times itself at another pitch, one copy moving with the
pointer. `.glare` is a faint soft white gloss that fades out; the era's dark hard-light glare (greyed the print, a
milky veil over dark alt-art ink) and its etch-line `.glare::after` are off.

## Lessons

- Dodge-only grain: glitter never darkens, so the real foil's darker sandpaper interstices are not drawn; density
  (6500 grains per 256 px tile, most faint, one in eight bright) is what makes it read as texture rather than snow.
- A sparse white grain (the era's glitter.png at 30%) reads as dust; at phone size the grain must cover a quarter or
  more of the area.
