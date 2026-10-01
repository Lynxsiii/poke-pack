# Wizards of the Coast: cosmos and starlight window holos, the Legendary Collection fireworks reverse

Family j1 (`css/holo/wotc.css`, `js/wotc-foil.js`: `wotcMap`, `wotcWindowMap`, `wotcLegendaryExtras`, `isStarlight`).
Photos and sources: `/mnt/project-files/every-era/wotc/texture-refs/j1/` (SOURCES.txt). Sheets:
`/mnt/project-files/every-era/wotc/finish-sheets/j1/`. TCG Live published no foil maps for 1999-2003, so every mask is drawn.

## What the real cards look like

- **Starlight (Base Set, Jungle, Fossil, Legendary Collection holos).** Thin four-point stars of different sizes, a little blurry, on a pale
  shimmer over the whole picture. The Pokemon is ink over the foil and stays matte; frame, name, text flat. (Legendary Collection is a one-text-source
  claim: Collexy; the scans agree.)
- **Cosmos (Base Set 2, Team Rocket, Gym, Neo, the seven cosmos basep promos, Dark Raichu).** Dots, discs, squares and crosses over the window, each lit in one
  colour (cyan and teal lead), thick in dark sky, thin over pale ink. Southern Islands is plain.
- **Fireworks reverse (Legendary Collection, base6).** Starbursts of thin straight rays over the whole card except the art window (name bar, text, border
  included), silver, lit in a band as it tips.

## Recipe

- One art window fits every WotC frame (measured over 1001 scans, so there is no separate Neo frame): `assets/foil/wotc-win/{pokemon,trainer,energy}-v1.webp`
  (`scripts/make_wotc_window_masks.py`).
- The Scrydex scans of the holos carry the real foil: `scripts/make_wotc_spark_maps.py` lifts each card's sparkle (a top-hat above a 9 px median, small
  isolated pieces only, not beside ink lines) into `assets/foil/wotc-spark/<set>/<n>-v1.webp` (216 cards, 4.7 MB), a crop of the window placed by
  `--wotc-map-size/-pos` per layout. Cosmos sets gate by local density (a lone fleck is the Pokemon's colour); starlight sets carry a stronger floor.
- `.wotc-cosmos .foil`: screen-blended pointer pool and a spectrum wash, masked by `--art` x the card's map; `::before` the spectrum multiplied with a pool;
  `::after` white glints gated by a moving band; `.glare` overlay. `.wotc-starlight` repaints it paler and cooler (`--wotc-silver`). Nothing is colour-dodged.
- Fireworks: `assets/foil/wotc-rev/fireworks-v1.webp` (`scripts/make_wotc_fireworks.py`, seeded, 150 hubs, broken dashes) as the mask of a silver veil
  (normal blend), minus the layout's window, extra specificity (`.foil-reverse.wotc-rev.wotc-rev-legendary`) so it beats the generic mirror rules.

## Known limits

- The maps are what the scan shows, so a Trainer holo (mostly ink) lights faintly, as the real one does.
- base1 and base5 scans are 1st Edition prints (data issue, not a finish issue).
