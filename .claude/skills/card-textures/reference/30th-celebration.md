# 30th Celebration (site set `me55`)

What is known about this set's foil, where it came from, and what the site
does about it today. The research thread's notes, when they land, are at
`/mnt/project-files/30th-celebration/texture-research.md` with reference
images in `/mnt/project-files/30th-celebration/texture-refs/`; read them too,
and where they disagree with this file, trust photos of the physical card.

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

| Rarity | `foil.type` / `foil.mask` | Cast and cure | Site pattern today |
|---|---|---|---|
| Common | `RAINBOW` / `HOLO` | | `foil-holo` |
| Rare | `SV_HOLO` / `HOLO` | | `foil-holo` (Sword & Shield recipe) |
| Double Rare | `SUN_PILLAR` / `HOLO` | `SouthernCross` (star sparkle) | `foil-ex` |
| Illustration Rare | `SUN_PILLAR` / `HOLO` | | `foil-ir` |
| Special Illustration Rare | `SV_ULTRA` / `ETCHED` | | `foil-sir` |
| Futuristic Rare | `SV_ULTRA` / `ETCHED` | | `foil-future` |
| Pikachu Rare | `PIKACHU` / `HOLO` | `StitchedRings` | `foil-holo` |
| RGB Rare | `RGB` / `ETCHED` | | `foil-future` + `data-finish` red, green, blue |
| Classic Collection | not in the export yet | | `foil-holo`, or `foil-ultra` for EX, GX, V, BREAK, LEGEND |

`PIKACHU`, `RGB` and `StitchedRings` exist only in this set. `StitchedRings`
is a UV texture of rings, going by the name; confirm its look on photos of a
Pikachu Rare before drawing it.

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
  a fingerprint-swirl etch across the background (the etch skips the
  Pokémon); the rainbow stamp is not foil.

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

**Shipping it.** Noah chose on 2026-09-27 to ship TCG Live's foil maps,
and they settle the stamp for every card that has one: the small stamp is
black in the map and the Pikachu Rare's big stamp is white, minus its text.
So:

1. **The 161 cards with maps** (158 numbered plus the RGB Mews): run
   `fetch_foil_maps.py --set me55 --all --ship --write-data` and wire
   `foilMap` into `tcgFace()` and `css/holo/windows.css` as
   [masks.md](masks.md) "Shipping foil maps" shows. No stamp rules needed.
2. **The 30 Classic Collection cards** have no map (TCG Live's `me5-5c` is
   empty), so they need the stamp knockout from `stamp30.json`. `.claude/`
   is not deployed (`scripts/prepare-cf-assets.mjs` copies only
   `index.html`, `_headers`, `css`, `js`, `data`, `assets`), so rerun
   `find_overlay.py` with `--out assets/masks/stamp`, put each card's
   `position` and `size` on its record in `data/me55.json` the way
   `make_owner_masks.py` adds `ownerMask`, set `--stamp-mask`,
   `--stamp-pos`, `--stamp-size` and `has-stamp` in `tcgFace()`, and move
   section 1 of `lab/lab.css` into `css/holo/windows.css` under the site's
   prefix. Classic cards drawn with `foil-ultra` (EX, GX, V, BREAK, LEGEND)
   cover the whole card, so theirs is the two-layer "card minus a stamp"
   from the mask algebra table. Custom property URLs must be root-relative
   (`/assets/masks/stamp/stamp30.png`).

Section 2 (the Pikachu Rare union mask) is only a fallback now; the maps do
it better.

## What the lab showed

- The stamp knockout and the three-layer evolution mask composite correctly
  in Chromium (`mask-composite: intersect, subtract, add`).
- A straight port of 151's Scarlet & Violet regular holo onto the Rares
  (`lab.css` section 3) is right in movement but too harsh across the whole
  window: its high contrast is meant to land on the background only. With
  the TCG Live map as the mask (`?maps=1`) the Pokémon stays clean and the
  card reads like the real one. Per-card foil maps matter more than any
  gradient tuning for this set, which is why they ship. On cards without a
  map, soften the port (lower `contrast`, lower `.foil` opacity) rather
  than use it at full strength.
- Shipped maps (alpha WebP) and raw maps (luminance PNG) render the same.

## Open for the texture thread

- `RAINBOW` holo on commons versus `SV_HOLO` on Rares: how do they differ on
  the physical card?
- `StitchedRings` on Pikachu Rares and `SouthernCross` on Double Rares:
  pattern, scale, and whether the stars show at rest.
- `RGB` etch on the Mews and `SV_ULTRA` etch on Futuristic Rares: the etch
  map is a fingerprint swirl; `scripts/make_etch_maps.py` can synthesise a
  similar map from our own scans.
- Classic Collection reprints: each should follow its original card's foil
  (for example Base Set starlight holo), plus the stamp.
