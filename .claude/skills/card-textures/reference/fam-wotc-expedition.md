<!-- Family note for the holo family wotc-expedition (older-era holo remaster, 2026-10-02). Research: /mnt/project-files/holo-remaster/wotc-expedition/. -->
# wotc-expedition: working notes

Family scope: Expedition (ecard1) Rare Holo 1-32 and the reverse holo of every e-Card print (ecard1, ecard2, ecard3).
Research and photo list: refs/SOURCES.md.

## What the real cards do (from the photos)

### e-Card reverse holo (one recipe for all three sets; Expedition, Aquapolis and Skyridge photos agree)
- Foil everywhere but the art window: border, name bar, evolution circle, text box, weakness bar, the bottom strip, the e logo,
  the ladder marks and the strip slots. The art window is matte paper.
- Ink over foil, so the observed colour is the ink times the foil's light: pale ink (Trainer grey, light text boxes) takes the
  full rainbow; strong ink tints it (water card blue-violet, fire card red-orange); dark ink stays dark (Tyranitar's text box).
- Under a lamp: a vivid full-spectrum rainbow in broad bands or arcs around the light point (Dragonite 9 reverse: red core
  under the light, then orange, yellow, green, cyan, blue, violet outward; one cycle about 0.55-0.6 card widths), brighter than
  paper at the peak (factor about 1.3-1.4 per channel, measured against the matte window's white in psyduck104aqP_7), darker
  and greyer away from it (factor about 0.7, drag9revP_13 text box).
- The yellow border is yellow ink over foil: ochre-gold away from the light, bright yellow-gold at the specular, orange where
  the foil goes red, olive where it goes blue (zard6revP_21 crop). Ladder marks and slots carry no yellow: they show the foil's
  own colour (blue-violet, cyan, red-brown, bright yellow-white at the specular).
- Texture: a fine granular sand, slightly elongated vertically (Seel 94 CGC 10 native photo: cells about 0.2-0.4 % of the
  card width, 2-3 times taller than wide), visible at rest as a sand under the ink, sparkling in the lit zone.
- Real reverse prints have ladder marks + slots + the gold e logo (like the holo); the scans of the non-holo prints show the
  e-Reader dot code and the blue e logo. Scan mismatch: open item.
- The reverse of an Expedition Rare Holo prints the NON-holo twin's window (Charizard 6 reverse = the teal aurora of 40,
  Dragonite 9 reverse = the pale sky of 43, Golem 14 reverse = the red ground of 49). The site draws the holo scan
  (starfield): wrong.

### Expedition Rare Holo
- Foil: the art window's background (bare foil wherever the holo print drops the background ink: a dark navy starfield with
  pixel-cluster cosmos in the scan) plus the ladder marks, the 13 strip slots and the e logo. Pokemon (ink) matte; border,
  name bar, text box flat print.
- Lit: the bare background flashes a bright metallic sheen (green-silver, pink-red-silver) with dense fine glitter and
  coloured pixel clusters (cyan, red, grey); ladder marks glint silver/green; slots mostly dark with a green glint; e logo
  silver/gold.
- Cards that keep their background ink (Gengar 13, Alakazam 1, Blastoise 4): the ink is printed over foil, darker than the
  twin and sparkled; lit, the background goes silvery with white pinpoint glitter (blast4holoP_14/16, gengar13P_18).

## Plan
- Reverse: `.foil` multiply group (metal tint x grain at rest; lit rainbow rings around the pointer in `::before`, a
  falloff away from the light in `::after`); `.glare` colour-dodge gain pool (rainbow-tinted, x grain sparkle) capped with
  contrast(0.8). New foil-area masks per layout that keep the bottom strip.
- Reverse of a Rare Holo (ecard1 1-32): composite scan = holo frame + twin window (registered), shown through
  `content: var(--exp-scan)` on the img; shared change proposed for a data field.
- Holo: per-card map from holo vs registered twin (bare foil = 1, ink over foil = partial, Pokemon = 0) plus ladder, slots,
  e logo; `.foil` screen sheen (rest soft, lit metallic flash), `::before` the scan's own clusters lit in colour (map RGB),
  `::after` white wink under a moving band, `.glare` hot spot.

## Log
- 22:40 research done (19 photos), census done, masks checked: era win-*-v1 masks fit every layout of the three sets.
- 23:05 (before the 5-hour stop) BUILT, all on disk:
  - scripts in .claude/skills/card-textures/scripts/fam/wotc-expedition/: make_rev_masks.py (rev-body-{pokemon,trainer,energy,
    basic-energy}-v1.webp: card minus the era's window, strip kept), make_rev_grain.py (rev-sand-v1 / rev-sparkle-v1, 512 px
    seamless, seed 2002; second version: rounder flecks, sand peak 0.55), twins.py (pairs holo n with its twin by name + window
    NCC, SIFT affine on the frame, refined on the window, colour match on the frame; pairs: 4->37, 6->40, 12->47, 18->54,
    28->65, 30->68, others n+32), make_rev_scans.py (rev-scan-ecard1-<n>-v1 + -sm-v1: holo frame + twin window; checked,
    clean edges), make_holo_maps.py (holo-ecard1-<n>-v1: alpha = smoothstep(9,30) of Lab dE holo vs twin, guided filter,
    plus ladder/slots/e logo; RGB = the scan's own dots and clusters).
  - js/fam/wotc-expedition.js: exp-holo (+ --foil-map = my map), exp-rev (+ exp-basic for Basic Energy), exp-twin
    (+ --exp-scan / --exp-scan-sm) for the reverse of ecard1 1-32.
  - css/holo/fam/wotc-expedition.css: reverse = .foil multiply group (tint 0.9 + sand screened + soft sheen; ::before
    rainbow rings round the pointer, ::after dimming away), .glare colour-dodge coloured gain + white core, .glare::after
    sparkle flecks; twin swap via `content: var(--exp-scan)` on the img (works in Chromium); holo = .foil screen sheen
    (rest: map RGB + soft gradient at 0.32; lit: pool + sweeping hue band + silver floor), ::before map RGB x cosmos colours,
    ::after white wink band, .glare small hot spot.
  - First Chromium render of the reverse (rev_v1.png in scratch): looks like the real photos (Dragonite rainbow arcs over the
    text box, Master Ball pink/yellow); the sand read as white vertical scratches -> regenerated rounder and softer, not
    re-rendered yet.
- LEFT: holo maps leak onto some Pokemon (Arbok 3, Clefable 7, Cloyster 8: the holo's ink differs from the twin's) -> PROTECT
  polygons or a texture test; render holo; tune both finishes; WebKit check of `content:` swap; before/after sheets
  (Chromium + WebKit, beside photos), phone-compare; gates (coverage, sweep x3 sets, idle, census); family note, LESSONS,
  REPORT; delete scripts/__pycache__.
