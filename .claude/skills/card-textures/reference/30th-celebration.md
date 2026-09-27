# 30th Celebration (site set `me55`)

What is known about this set's foil, where it came from, and what the site
ships for it (2026-09-27). The research notes are at
`/mnt/project-files/30th-celebration/texture-research.md` with reference
images in `/mnt/project-files/30th-celebration/texture-refs/`; where they
disagree with this file, trust photos of the physical card.

## Ids

| Where | Id |
|---|---|
| Site data | `data/me55.json`, cards `me55-<n>`; `CELEBRATION_30TH` in `js/catalog.js` |
| TCG Live main set | `me5-5` (158 cards) |
| TCG Live RGB Mews | `me5-5m` (3 cards) |
| TCG Live Classic Collection | `me5-5c` (empty in the export as of 2026-09-27) |

The whole set is foil on the site (`ALL_FOIL` in `js/catalog.js`), which is
right: every card in the TCG Live export has a foil type.

## Foil by rarity (TCG Live export, 2026-09-27)

| Rarity | `foil.type` / `foil.mask` | Cast and cure | Site classes (shipped) |
|---|---|---|---|
| Common | `RAINBOW` / `HOLO` | | `foil-holo foil-rainbow` |
| Rare | `SV_HOLO` / `HOLO` | | `foil-holo foil-svholo` |
| Double Rare | `SUN_PILLAR` / `HOLO` | `SouthernCross` (star sparkle) | `foil-ex foil-sunpillar cure-stars` |
| Illustration Rare | `SUN_PILLAR` / `HOLO` | | `foil-ir` + `has-foil-map` |
| Special Illustration Rare | `SV_ULTRA` / `ETCHED` | | `foil-sir` + `has-foil-map has-etch-map` |
| Futuristic Rare | `SV_ULTRA` / `ETCHED` | | `foil-future` + `has-etch-bins` |
| Pikachu Rare | `PIKACHU` / `HOLO` | `StitchedRings` | `foil-holo foil-pikachu cure-rings` |
| RGB Rare | `RGB` / `ETCHED` | | `foil-future foil-rgb` + `has-foil-rgb` |
| Classic Collection | not in the export yet | | `foil-holo` or `foil-ultra`, plus `foil-classic has-stamp` |

`PIKACHU`, `RGB` and `StitchedRings` exist only in this set. The first
pattern class is what the Classic engine keys on; the second is the new
finish, in `css/holo/celebration.css`.

## Where the foil is (TCG Live foil maps)

Fetch the maps with `scripts/fetch_foil_maps.py --set me55 --all` and look
(raw PNGs land in `lab/cache/me55/`).
What they show:

- **Commons, Rares, Double Rares, Illustration Rares, Trainers**: the art
  background is foil, in grades that follow the painting. The Pokémon (or
  the item) is not foil. Text is not foil. **The small 30 Pikachu stamp is
  not foil.**
- **Pikachu Rare**: the art background is foil, Pikachu is not, and the big
  Pikachu stamp across the attack box **is** foil, except where the attack
  name and text are printed over it.
- **Special Illustration Rare**: the whole card in grades, with a separate
  etch map; the stamp and text are not foil.
- **Futuristic Rare**: the whole card, the Pokémon at partial strength, with
  a geometric op-art etch (rings, chevrons, hatching in separate cells)
  across the background that skips the Pokémon; the rainbow stamp is not
  foil.
- **RGB Mews**: colour maps, not greyscale. Red is Mew's highlights and the
  frame lines, green the whole card, blue the sunburst streaks.
  `fetch_foil_maps.py` ships each channel as its own mask.

## The Pikachu stamp

Every card carries the 30 Pikachu stamp except the RGB Mews and `cc100`,
whose scan shows none. On regular frames it sits at the bottom right of the
art window, straddling the window's bottom edge; on full arts it sits on
the art.

**What was wrong.** `foil-holo` clips the foil to the art window with
`clip-path: inset(9.318% 7.302% 52.727% 7.937%)`. The stamp crosses the
window edge, so the holo paints over its top part and stops in a straight
line through Pikachu's face. On the real card the stamp is not foil at all.
On Pikachu Rares the big foil stamp sits outside the window, so it gets no
foil.

**The fix, proven in the lab** (`lab/lab.css` sections 1 and 2, screenshots
in the PR):

1. Knock the stamp out of the foil and glare: mask
   `var(--art), var(--stamp-mask)` with `mask-composite: subtract, add`, the
   stamp placed per card with `--stamp-pos` and `--stamp-size`. Stage 1 and
   2 cards already use a mask layer for the evolution badge, so theirs is
   three layers: `var(--art), var(--win-evo), var(--stamp-mask)` with
   `intersect, subtract, add`.
2. Pikachu Rares: drop the window clip-path and build the area from masks,
   `var(--art), var(--win-holo), var(--stamp-cut)` with
   `intersect, add, add`, where `--stamp-cut` is that card's own cut-out
   (the stamp minus the attack text over it).

Full arts (IR, SIR, Futuristic, Double Rare ex) need the same knockout as
two layers on whatever mask their pattern already has.

**Placements.** `scripts/find_overlay.py` recovered the stamp from the
Double Rares and placed it on every card:
`lab/masks/stamp30.json` (187 cards: 176 by colour, 7 by their rarity's
shared spot where text covers the stamp, 1 by outline, 3 pinned by hand in
`lab/masks/stamp30-overrides.json`), `lab/masks/stamp30.png` (the stamp's
shape) and `lab/masks/stamp30/<n>.png` (the 30 Pikachu Rare cut-outs).
Unmarked: the three RGB Mews and `cc100` (the right half of the Darkrai &
Cresselia LEGEND, whose scan shows no stamp). Rebuild with:

```
python3 .claude/skills/card-textures/scripts/find_overlay.py --set me55 \
  --template-rarity "Double Rare" --box 0.66,0.33,1.0,0.56 \
  --cutouts "Pikachu Rare" --overrides <overrides.json> --debug \
  --name stamp30 --out <dir>
```

**How it shipped.**

1. **The 161 cards with maps** (158 numbered plus the RGB Mews):
   `fetch_foil_maps.py --set me55 --all --ship --write-data --etch-bins 157,158`
   wrote `assets/foil/maps/me55/` and the `foilMap`, `etchMap`,
   `foilMapR/G/B` and `etchMapH/V` fields. The small stamp is black in the
   maps and the Pikachu Rare's big stamp white minus its text, so no stamp
   rule is needed on these cards.
2. **The 30 Classic Collection cards** have no map (TCG Live's `me5-5c` is
   empty), so `scripts/ship_stamp.py` copied `stamp30.png` to
   `assets/masks/stamp/` and wrote `stampPos` and `stampSize` onto every
   card with a stamp; `has-stamp` in `css/holo/maps.css` cuts it out of the
   foil. `cc100` has no stamp, so no `has-stamp`.

## What shipped, finish by finish

Recipes in `css/holo/celebration.css`, textures from
`scripts/make_celebration_textures.py` (seeded, so reruns are identical).
Every finish is masked by its card's foil map unless noted.

| Finish | What the real card does | Recipe |
|---|---|---|
| Common `foil-rainbow` | Soft wide rainbow on the art background only | Grain plus a 112deg spectrum with black ends, colour-dodged; a counter sweep on `::before`, a radial falloff on `::after`; a soft glare so pale Pokémon do not bleach |
| Rare `foil-svholo` | Scarlet & Violet regular holo | 151's regular holo: 10deg spectrum at 400%, tilt bars, luminosity radial |
| Double Rare `foil-sunpillar` + `cure-stars` | Diagonal sun-pillar bars; SouthernCross star glints over the whole card, ink included | 115deg spectral bars plus light bars, mirrored exclusion `::after`. Stars on `.cure`: `southern-cross.webp`, screen, each card's hue cycling with the pointer |
| Pikachu Rare `foil-pikachu` + `cure-rings` | Cracked-ice foil in the window, the big foil stamp; StitchedRings firework bursts of dashes | Cracked ice over a sun pillar, a difference twinkle, a vivid gradient masked by `stitched-rings.webp`; paler rings on `.cure` over the whole card |
| Illustration Rare `foil-ir` | Soft light pillars on chosen parts of the painting | 151's illustration rare with the map |
| SIR `foil-sir` | Organic contour etch, glitter, low sheen | 151's SIR: 15deg rainbow shown only inside two crossing bars, glitter, a multiply glare; the etch glare lights the contour lines |
| Futuristic `foil-future` + `has-etch-bins` | Opalescent inks, grid glitter, op-art cells flashing at their own tilt | Grid glitter and a pastel opal; op-art bands on `::before` and `::after`, masked by the horizontal and vertical halves of the etch so cells flash separately |
| RGB `foil-rgb` | Transparent colour ink on mirror foil over the whole card, bare-foil streaks, striped chrome on Mew | A radial light and fine glitter over the whole card (masked by the card, not the map); a white radial through the blue channel (streaks); 1px ridges through the red channel |
| Classic `foil-classic` | One shared stock: confetti glitter, puffy stars, gold border, crosshatch | Two confetti tiles with counter parallax over a band spectrum; puffy stars at mid brightness so they stay coloured; crosshatch and radial `::after` |

Checked: the lab at rest and three poses per finish, the real site's
inspector (default, shine off, Classic engine), phone width, and
`foil_probe.mjs --idle` (the lab idles at 0 ms; the home page's cost is the
headline shimmer and pack glint it already had).

## The Pikachu ex Futuristic promos

Two YOSHIROTTEN Pikachu ex Futuristic Rares, a day and a night version, are
numbered in the promo line, not the set: MEP 107 and MEP 109, from the
Ultra-Premium Collections (MEP 108 Espeon ex and 110 Umbreon ex, by REND,
are not Futuristic). They are in `data/me55.json` as `me55-mep107` and
`me55-mep109` with `promo: true`; Noah chose on 2026-09-27 to let them drop
from packs, each as often as Mewtwo ex or Mew ex (1/240 apiece, the
`futuristicPromo` slot in `js/catalog.js`).

TCG Live's export stopped at MEP 101 on 2026-09-27, so their maps are drawn
by `scripts/make_futuristic_maps.py` from the scans, laid out like 157's:
the card foil, Pikachu at part strength, text and stamp not foil, and an
op-art plate with rings round each energy orb. The hints (GrabCut strokes,
orb centres) are in `lab/masks/futuristic/me55.json` and the cuts beside
them. When TCG Live adds MEP 107 and 109 (`mebsp` in the export), fetch
their real maps instead: add them to `SETS` in `fetch_foil_maps.py`.

## Still open

- YOSHIROTTEN Energy: the real cards have their own art with a wide
  rainbow panel foil; the site still shows the shared Energy art.
- Classic Collection per-card relief (light emboss following each
  original's art) is not drawn; the shared stock is.
- No set symbol icon (Scrydex has none).
