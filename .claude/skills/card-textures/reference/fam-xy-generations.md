# Family xy-generations: Generations (g1) Radiant Collection, Rare Holos and reverses

Part of the older-era holo remaster (2026-10-01/02). Module `js/fam/xy-generations.js`, sheet
`css/holo/fam/xy-generations.css` (every rule scoped to `.fam-xy-generations`), assets `assets/foil/fam/xy-generations/`
(`rc/<n>.webp`, `rev/<n>.webp`: TCG Live maps), scripts `scripts/fam/xy-generations/` (`fetch_g1_maps.py`,
`ship_g1_maps.py`). Photos, sources and sheets: `/mnt/project-files/holo-remaster/xy-generations/`.

Scope (`claims()`): g1 Radiant Collection RC1-RC32, the five g1 Rare Holos (5, 27, 35, 42, 45) and every g1 reverse
face. 37 holo faces and 124 reverse faces. g1's main-set EX / Mega EX belong to xy-ex-mega, its main-set full arts and
promos to xy-full-art.

## What the real cards do

| finish | class | real card | sources |
|---|---|---|---|
| RC Uncommon, RC EX (RC5, 6, 8, 10, 13, 15, 16, 18-22, 24, 27) | `xygen-rc` | flat MIRROR foil, no rainbow, in a picture that is different on every card: the art background (Pokemon matte) plus a hidden drawing in the text box (Charizard snowflakes, Froslass whirlpool, Jirachi wish trail and stars, Meowstic keys, Diancie castle...) and, on the two EX, the starry black border. Face-on it reads as a lighter silvery version of the ink; under a lamp it flashes white-hot in the ink's own hue. | 6+ tilt clips (Charizard, Jirachi, Sylveon-EX, Froslass, Swirlix, Dedenne), TCG Live maps |
| RC full arts RC28-RC32 | `xygen-rc xygen-fa` | the same mirror stock over the whole background (Pokemon matte), a faint web / sparkle drawing in the text area | Gardevoir-EX, Pikachu, Sylveon-EX clips |
| RC Commons | `xygen-plain` | NOT foil (TCGplayer / pokemontcg.io list only a Normal print, TCG Live has no map, Elite Fourum t/14203) | 3 |
| Rare Holo 5 / 27 / 35 / 42 / 45 | `xygen-holo` | the XY "Sheen": broad, saturated rainbow beams (magenta, orange, green, cyan, blue) on a rising diagonal with dark gaps, over the art background only, Pokemon matte; sweeps across as the card turns | Gengar tilt clip (3 frames), Salamence xy6, Delphox xy10, Collexy descriptions |
| every reverse with a TCG Live reverse map | `xygen-rev` | the whole body but the art window and the yellow border is holographic mirror, with the type's big ghosted symbols catching the light brighter than the field; tilted, soft rainbow columns slide down the body | Golem, Butterfree, Olympia, Pokemon Center Lady reverse clips |

## What was built

- `xygen-rc`: TCG Live's per-card map (`rc/<n>.webp`) is the `.foil` mask (window `--art` intersect the map, plus the
  map). `.foil` screens a soft grey reflection band that moves with the tilt, `.cure` colour-dodges a tight specular pool at
  the light, `.glare` is the varnish. The era's heart-and-star tile (`xy-rc` in xy-fullart.css) is gone for these cards:
  that tile read as "holographic squares".
- `xygen-holo` (rewritten 2026-10-02): beams are one repeating gradient multiplied by a pointer pool whose floor is 66%
  (it was 36%, which left the beams invisible away from the pointer: with the thumb on the text box the art window
  showed nothing at 75:65 and 50:78) and colour-dodged. Rest opacity 0.66, lit opacity 0.55-1.
- `xygen-rev`: map = the TCG Live reverse map (body + symbols), rainbow columns multiplied by a pool with a 68% floor,
  rest opacity 0.62 so the symbols read at rest. The layer's brightness is 0.74 + 0.3 x pointer distance (0.92 first):
  colour-dodge lifts dark ink in proportion to the source, so the lower brightness keeps the printed text darker while
  the light body and the symbols still flash.
- The pseudo-layer reset applies only to faces carrying one of the four finish classes, so a reverse face without a
  TCG Live map (the EX, full arts and promos that have no real reverse) keeps the era's drawing.

## How to judge it

`foil_probe.mjs --query "set=g1&cards=RC5,RC30,35,r26&proof=off&w=220&poses=rest,30:25,75:65,50:78" --scale 3 --browser webkit`;
add `&fam=off` for the before. The pass test: Gengar's art shows a saturated rainbow at ALL FOUR poses (not only near the
pointer), the Pokemon stays matte, RC5's snowflakes are visible at rest and flash gold when lit, RC commons do not change,
a reverse shows its type symbols at rest.

## Open

- RC mirror foil is faithful but quiet at rest on the full arts (it IS a plain mirror on the real card).
- Reverse text picks up a faint rainbow tint where the colour-dodge lifts the dark ink's anti-aliased edges; the real ink
  is opaque over the foil. A text-box ink mask would fix it.
- Real Golem reverse is gold with a gentler rainbow than the drawn columns.
