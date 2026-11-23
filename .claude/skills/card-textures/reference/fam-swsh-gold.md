# Holo family swsh-gold: Sword & Shield gold secret rares

Module `js/fam/swsh-gold.js`, sheet `css/holo/fam/swsh-gold.css`. No assets or generators (everything is CSS over the
scan and TCG Live's `-etch-v4` maps already in `data/`). Built 2026-11-23 from the audit w2-swsh-gold
(/home/user/holo-work/w2-swsh-gold/AUDIT.json).

## Scope (106 faces, census 2026-11-23)

Exactly the faces `swshPattern()` files as `foil-gold swsh-gold` ("Rare Secret" of a Sword & Shield era print, Crown
Zenith's showcase Pikachu swsh12pt5-160 excepted); before this family no family claimed them. Classes:

- `sg-glitter` (104): the gold glitter stock. Of them `sg-dark` (10): Eternatus V/VMAX swsh45-SV121/SV122 and the
  Trainer Gallery VMAX TG29/TG30 of swsh9-12 (black field, gold line art); `sg-silver` (1): Champion's Path Charizard V
  swsh35-79, a silver shiny full art filed "Rare Secret" (it should be refiled in js/foil-maps.js; drawn here with a
  neutral light so it is at least not gold).
- `sg-mirror` (2): the Celebrations UPC golds cel25-swshp145 Pikachu V and swshp146 Poké Ball.

## The real finish (photos: /home/user/holo-refs/w2-swsh-gold, SOURCES.md lists the URLs)

- Foil edge to edge; gold ink over a dense multicolour glitter that shows held flat, over gold, coloured art and
  (faintly) black ink (Zacian 211 Italian phone photo, Serperior 210 on stone, Eternatus SV121 FR and JP s4a photos).
- TCG Live's etch is the engraved relief: fine lines and stipple that catch the light near the lamp.
- Under the light a local champagne hot spot; elsewhere the card keeps its warm amber and its darks. No rainbow.
- Black-and-gold prints: deep black field with a faint fine sparkle; the gold lines carry the glitter.
- UPC golds: smooth mirror gold, concentric-ring engraving round the subject, a white band that slides, crisp black
  line art, no glitter (mercari SWSH145 macro, JP s8a-G 001).

## How the sheet draws it

- `.foil` colour-dodge, masked by art and (Live map + 0.7 floor). Lit: a warm light pool (red > green > blue, so lit
  gold stays near hue 41-47 instead of going lemon: the red channel clips first and a neutral lift then raises green),
  plus Live's etch at 0.4 lit by a warm lamp round the pointer. Rest: the etch at 0.2 and the glitter tile, through
  `brightness(0.5)` (held flat the sparkle shows). Dodge cannot lift black, so dark ink stays dark. The chain ends in
  `brightness(0.9)`: no source reaches 1.0 (Safari's dodge blocks).
- `.foil::after` two copies of `glitter-flecks.webp` (46% / 71% tiles), screened into the dodge, brightness 0.55.
- `.glare` a small warm overlay hot spot (gone by 38%); no hard-light veil (that was the milky wash).
- `.cure` (`cure: true`) screened: the sparse `glitter-fine.webp` sparkle (saturate 0.45; the only light black ink gets)
  plus the etch lines lit champagne near the pointer. Screen is needed because the scans' gold is saturated lemon with a
  blue channel near 0, which a dodge cannot whiten (Eternatus looked flat lit for this reason).
- Mirror: no glitter; `.foil` dodges a CSS repeating-radial ring engraving (0.7% pitch, about 1.5 CSS px at 220 px,
  centred by `--sg-ring-c`, 44% 40% by default, 37% 51% on the Poké Ball) plus a sliding warm-white band; `.glare`
  screens the rings near the lamp; `.cure` multiplies the scan's own faded line art back in (grayscale, blur 0.6 px,
  brightness/contrast stretch of the 197-vs-211 luminance gap, sepia 0.7, opacity 0.4), masked to the drawing (not the
  border, header or small print, which crushed to brown dots under dark_specks.py).

## Measured (WebKit 220 px x3, Zacian 211, region far from the pointer at 30:25)

Bare lit card 168, live recipe 183, this sheet 176 (lift +8, was +15). Gold hue stays 35-46 by pose.

## Left / for the lead

- swsh35-79 Charizard V belongs on a silver full-art recipe: refile it in `swshPattern()` (js/foil-maps.js).
- The UPC gold scans (cel25 swshp145/146) are lemon with faded line art; a better scan would help more than CSS.
  Their line art is recovered only while lit (`.cure`, like every lit layer, is hidden at rest).
- Bump `?v=` of `css/holo/fam/swsh-gold.css` in index.html and the `swsh-gold` entry in js/holo-fam.js's FAMILIES.
