# Family xy-secret-gold: the XY gold secret rares (gold Items and gold Mega EX secrets)

Part of the older-era holo remaster, the secret rare remake of 2026-10-02 (Noah, 20:09: "most have really shitty texture and i
dont like the overuse of the rainbow glare as most cards dont really have that rainbow glare"). Module `js/fam/xy-secret-gold.js`,
sheet `css/holo/fam/xy-secret-gold.css`, assets `assets/foil/fam/xy-secret-gold/` (15 files, 4.3 MB, none over 310 KB),
scripts `scripts/fam/xy-secret-gold/` (`make_item_ridges.py`, `make_mega_etch.py`), research, photos and sheets in
`/mnt/project-files/holo-remaster/xy-secret-gold/` (refs/SOURCES.md, sheets/, REPORT.md, LESSONS.md). The module is listed in
`js/holo-fam.js` before `xy-full-art`, whose recipe (vertical rainbow columns colour-dodged over everything) it replaces for
these faces; `?famskip=xy-secret-gold` in the lab draws that old look for a before and after.

## Scope (15 faces)

Gold Items (class `xsg-item`): xy5-161 Dive Ball, 162 Enhanced Hammer, 163 Switch, 164 Weakness Policy, xy6-109 Energy Switch,
110 VS Seeker, xy7-99 Energy Retrieval, 100 Trainers' Mail. Gold Mega EX secrets (`xsg-mega`): xy2-107 and 108 M Charizard-EX,
109 M Kangaskhan-EX, xy3-112 M Heracross-EX, 113 M Lucario-EX, xy4-120 M Manectric-EX, 121 M Gengar-EX. Not their reverses.

## What the real cards do (photos and clips in refs/, 2+ per finish)

- **Gold Item**: a gold-engraved card. The gold runs from dark ochre to bright yellow-white as the card tilts and the engraved
  lines flash (fine diagonal guilloche in the border, rules in the header, concentric rings in the Poke Ball watermark, a hatch in
  the art: exactly TCG Live's etch). The gold never turns rainbow. Colour is ONE narrow pastel stripe (cyan, pink, yellow) that
  crosses only what TCG Live's foil map marks: the TRAINER header, the ITEM badge, the object, the watermark ring, the blue footer
  bar. The white text box stays plain.
- **Gold Mega secret**: gold frame, rule boxes and lightning that glint yellow-white; a fine pebbled grain; one or two tall
  saturated vertical bands (green, cyan, blue, violet, orange-red) that cross the card as it turns, strongest on the kanji, effect
  lines and rule-box outlines; the whole art lights up only at the full-reflection angle (worn card, lamp, toploader).

## What was built

- Class and hooks: the module adds `fam-xy-secret-gold`, `xsg-item` or `xsg-mega`, `--xsg-lines` (the card's engraved lines as an
  alpha mask at 733 x 1024), `--xsg-safe` (the shared text-safe map, `assets/foil/xy-safe-item-v1.webp` / `-mega-v1.webp`: art 1,
  text box 0.4 to 0.6) and `cure: true`.
- `.foil` (hard-light, rest and lit): a lamp ramp centred on the pointer, neutral (50%, no change) at the pointer and down to
  hsl(36, 14%, 40%) at the far corner (multiplies the scan to 83% luminance), cut to art x safe map so the text box is not greyed.
  It never lifts: hard-light above 50% screens, and screen lifts the blacks of a dark scan into a milky wash (M Gengar's body
  went grey in the first pass); the light is in the lines and the glare.
- `.foil::before` (rest and lit; the rest rule overrides base.css's `display: none`): the lines, inside the hard-light group, tinted
  by a radial lamp at the pointer (white at the pointer, nothing at the far side) plus a diagonal band of light sliding with the
  tilt. Hard-light adds light where the line colour is above 50% and the ramp darkens elsewhere, so the lines flash and nothing
  ever darkens into a speck. Items: the ridge crests of Live's native etch (`<id>-ridge-v1.webp`: the etch minus its 7 px local
  mean, rescaled, lossless, never blurred). Megas: an etch drawn from the card's own scan with `make_card_etch.etch_from`
  (`<id>-etch-v1.webp`, pitch 4.4 px at 733 px, lossy q80), cut to foil map x 100% plus a 12% floor (`--xsg-floor-lo`) so the
  gold frames and kanji carry the grain and the Pokémon keeps a little.
- `.glare` (lit, overlay): a small warm hot spot (overlay scales with the local colour: gold glows, black ink stays black), cut to
  art x safe map. The Megas get a softer, warmer spot (hsla(46, 100%, 80%) at 0.32, 0.14 at 24%, clear by 55%): their Pokémon are
  inked dark or cool over the gold, and the Items' near-white 0.55 spot frosted them (review 1, below). `.foil::after` and
  `.glare::after` are reset to nothing.
- `.cure` (lit, hard-light): the one stripe, a 38% wide (Items: cyan, pink, yellow; saturated mid-lightness, not pastel) or 30% wide
  (Megas: green, cyan, blue, violet) band whose centre moves 0.4 of the pointer's travel (1.05 and 1.33 spectral cycles per full
  pointer sweep). Items: mask art x foil map (colour only where the real card has it). Megas: art x safe map x (foil map + 25% floor, `--xsg-floor`).
- Foil strength scales every lit layer (`--xsg-lift` is `--foil-strength` itself, not `max(1, ...)`, so "subtle" is subtler).

## Pitfalls found

- `mask-mode: luminance` on the `--art` scan inside the `.cure` mask stack made the whole stripe vanish in the lab's WebKit
  (rendered with and without it: sheets/debug-luminance-mask.jpg, LESSONS.md 6); keep every layer `alpha`.
- Hard-light with a source whose channels are all above 50% (pastel pink, cyan) cannot tint white paper or a pale object (a
  channel at s above 0.5 screens, and screen on 1.0 stays 1.0); the stripe colours need one channel below 50% (lightness 55 to 63%).
- Live's foil map for the Items leaves the gold border out: the border gets only the ramp and the lines, so it stays gold.
- `rainbow_speed.py` does not parse stripe stops built from `calc(var(--xsg-sx) +- n%)`; the cycle counts above are worked out by hand.

## Review 1 (2026-10-02): the lamp frosted the dark Megas

A fresh-eyes review passed the 8 Items and 4 Megas and held M Charizard-EX xy2-108, M Lucario-EX xy3-113 and M Gengar-EX
xy4-121: at 30:25 the pool at the pointer turned Gengar's purple forehead khaki grey (L 0.21 to 0.43, saturation 0.58 to
0.40) and paled the blue Charizard and Lucario, while the photos keep them deep-coloured outside the band. Hiding one layer
at a time showed it was the sum (glare most, then the lines, the ramp, the stripe). Fix: the Megas' warm, softer `.glare`
above, the stripe's floor off the foil map 45% to 25% and the lines' 22% to 12%. After it Gengar keeps its purple, the gold
frames and kanji keep the band; dark_specks 0 on all 7 Megas at rest, 30:25, 75:65 and 50:78; foil_coverage xy2-xy7 silent.
The gold-on-gold Pokémon (107, 109, 120) only got calmer. Open (taste): the band over a Pokémon's neck is fainter than the
photos' vivid one; the Mega grain is a bold fingerprint like Live's XY etch, not the photos' fine orange-peel.

## Rebuild

`python3 .claude/skills/card-textures/scripts/fam/xy-secret-gold/make_item_ridges.py` (reads the xy-full-art etches, read-only) and
`.../make_mega_etch.py` (reads the card scans; `--debug` writes a sheet to /tmp). Changed assets take a new `-vN` name (and the
module's path), the sheet's `?v=` in index.html and the family's version in `js/holo-fam.js` go up.
