# Sun & Moon: Hidden Fates' Shiny Vault and Shining Legends' Shining Pokemon

Sheet: `css/holo/sm-shiny.css` (classes `sm-shiny`, `sm-shiny-gx`, `sm-shining`), routed by
`smPattern()` in `js/sm-foil.js`. Finish agent f4, 2026-09-30. Photos and sources:
`/mnt/project-files/sun-moon/texture-refs/shiny-vault/` and `.../shining-legends/` (SOURCES.txt in each).
Contact sheets (Chromium and WebKit, 220 px x 3, rest / 30:25 / -30:-20 / 0:40):
`/mnt/project-files/sun-moon/finish-sheets/shiny-vault/`.

## What the real cards do

- **Shiny Rare (Hidden Fates SV1-45) and Shiny GX (SV46-80).** The brief guessed "not etched, like Shining Fates". The
  photos (Guzzlord SV26 x2, Pheromosa, Zorua PSA 9, Vulpix, Seviper forum shot; Charizard GX SV49 PSA 10 and PSA 9, Mewtwo GX)
  show the Paldean Fates kind: silver mirror foil with a fine fingerprint etch cut along the drawing (the Pokemon included), broad
  sunburst rays fanning out behind, a pastel rainbow that slides across, the printed sparkle stars left plain. The GX is
  the same edge to edge (text box and frame too). The TCG Live etch for these is a regular engraving (parallel lines), which
  is what makes it dangerous at phone size (below). So the base is Paldean Fates' `.foil-shiny`, not `sf-shiny`.
- **Rare Ultra (SV81-86)** are plain full-art Supporters and draw with `sm-tfa` (full-art family); **Rare Secret (SV87-94)**
  golds are `sm-gold` (same family). No gold photos found. Nothing here to draw.
- **Shining Legends Rare Shining (sm35 9, 27, 40, 42, 56, 57).** Photos (Mew PSA 6, Jirachi PSA 1, Arceus PSA 6,
  Rayquaza CGC 8.5): only the Pokemon is foil, a silver etch with a teal/pastel cast (Arceus goes teal-cyan, Mew silver-white,
  Rayquaza stays dark with a brown-silver sheen); background, halo, stars, frame and text are flat print. No rays. The TCG Live foil
  map is the Pokemon silhouette and its etch is a fine engraving on the same silhouette, which agrees with the photos.
- Caveat: every photo is a flat slab shot under one lamp, none is a tilt sequence. Movement is taken from the Paldean Fates notes.
- poke-holo.simey.me has no Hidden Fates shinies or Shining Legends Shining cards (Sun & Moon there is commons only). The
  benchmark is its Shining Fates shinies (`benchmark-simey-shining-fates-shinies.png`, 185 px popover, four poses).

## Recipe

- **sm-shiny (window) / sm-shiny-gx.** `.foil-shiny` from `shiny-vault.css` does the structure (silver multiplied onto the
  white scan, rainbow sun-pillar bands, etch soft-lit, etch-angle arcs on `::after` while lit, glare). The sheet adds: two soft
  conic ray sets (12 and 20 rays, broad, no seam) that turn with the pointer; the silver ramp set by `--sm-lamp/--sm-mid/--pf-lo`
  (91/85/80 % window, 96/91/83 % GX; 80 % floor so the window reads silver, not paper); a calm rest state (saturate 0.4,
  opacity 0.95); and the soft etch masks below.
- **sm-shining.** Same layers with the rays switched off (`--sm-ray-a: 0`, also at rest) and a stronger band alpha
  (0.6 lit, 0.45 at rest), since the foil area is one small silhouette.
- **Soft etch (`etchSoft`).** The 400 px Live etch of the regular-engraving cards measures lb 35-45 and coherence about 0.7
  (grating-like; see `etch_metrics.py`) and showed a diagonal line screen in WebKit at DPR 1. Per card, a Gaussian-softened copy
  (sigma 0.8 for SV1-45, 1.2 for SV46-80, 0.9 for the six Shining) is shipped as `<n>-etch-arc.webp` (white + alpha), stamped as
  `etchSoft` in the data. The sheet uses it for the `.foil` etch layer and as the mask of the arcs on `::after` and `.glare::after`.
  Line screen gone in WebKit DPR 1 and 2 (3x nearest-neighbour crops, the render-diff metric). Maps of the Shiny Vault
  also ship `<n>-etch-angle.webp` (line direction, 367 px) for the arcs; the Shining cards have no arcs (no angle map).

## Mistakes made and fixed

- First window silver too white (paper). Lamp/mid lowered to 91/85 %, floor 80 %, rest opacity up to 0.95, rays 0.5.
- The sharp 400 px etch as arc mask and as soft-light layer drew a line screen on Mew, Volcanion, GX. Soft copies above.
- `lb` goes up when a map is blurred (the dominant pitch is left), so the metric misled on Guzzlord; the WebKit render decided.
- Playwright: Chromium must run without `PLAYWRIGHT_BROWSERS_PATH` pointing at the WebKit dir; `--css ""` parses as true.
- `git add` of maps outside the sparse checkout needs `--sparse`; the files then vanish from the work tree (restore with `git archive`).

## Verification (2026-09-30)

- Chromium and WebKit contact sheets at 220 px x 3, four poses, for Shiny Rare (8 cards), Shiny GX (4) and all six Shining.
- `dark_specks.py`: at most 8 specks per card (budget 40) on SV1, 5, 13, 15, 26, 30, 49, 50, 59, 60, 69, 71, 75 and the six sm35 cards: ok.
- `foil_coverage.mjs sm115 sm35`: nothing printed. `sweep_finishes.py --set sm115` and `--set sm35`: ok, no asset changed in place.
- No colour dodge in these chains (multiply, soft-light, screen, difference), so no WebKit divide-by-zero blotches.
- No independent reviewer sub-agent: the session had no Agent tool. Self-review against the addendum list instead.
