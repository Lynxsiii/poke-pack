# Family xy-ex-mega: XY Pokémon-EX, Mega EX, Double Crisis EX

Scope: every `xy-ex` face that is an EX or Mega EX (186: xy1-xy12, dc1, g1 main-set EX, Evolutions' M Blastoise/Venusaur-EX, 39 black star
promos). Full arts and gold secrets are xy-full-art's. Pyroar xy2-xyp026 is a Stage 1 (data says `foilAs "Rare Holo EX"`, wrongly) and stays
unclaimed. Files: `js/fam/xy-ex-mega.js`, `css/holo/fam/xy-ex-mega.css`, `assets/foil/fam/xy-ex-mega/` (sparkle-v1.webp, 40 `<id>-map.webp`,
186 `<id>-ink.webp`, dc1 `-facets-v1` / `-tint-v1`), `scripts/fam/xy-ex-mega/` (make_sparkle.py, ship_promo_maps.py, make_ink_masks.py,
make_dc_facets.py, make_dc_ink.py, list_claimed.mjs). Photos and notes: `/mnt/project-files/holo-remaster/xy-ex-mega/` (refs/SOURCES.md, sheets/).

## The real card
Regular EX / Mega EX (Bleeding Cool, Pokemon Holo x5 cards, Daniel Ortiz, SNC Grading, Double K, KauGon):
- Foil: the frame, the art background behind the Pokémon, the bottom strip and the gold plates (name tab, Mega badge, rule strip,
  Pokémon-EX rule box). Matte: the Pokémon, the text box and ALL lettering (the gold "EX", "Evolves from", HP stay ink while the plate flashes).
- Pattern: fine sparkle grain; the rainbow is tall saturated vertical columns that slide sideways as the card tilts, brightest near the lamp.

Double Crisis EX (Rare Ultra; dc1-6 Team Aqua's Kyogre-EX, dc1-15 Team Magma's Groudon-EX; ddog281330 x2, Hakuhodo, Sieye):
- A shattered-glass / cracked-ice texture over the whole print: many small angular facets (a few mm), each reflecting its own colour
  (green, magenta, orange, blue) as the tilt crosses it, so the card glitters in patches instead of sliding columns. Pokémon colours stay intact.
- TCG Live has no etch for xy5-5 (probed, 404). Confidence MEDIUM: Japanese-print photos and video frames, no macro; the English frames are tiny.

## What was built
- `.foil` colour-dodge: vertical rainbow columns x a pointer-centred radial, `brightness .55 .. .85`, `saturate(2.8)`, closing in
  `contrast(0.8)`, masked to ink-knockout x art x the card's Live map, rest opacity 0.28. The rainbow is slow: columns move at 0.35 / 0.07
  of the background position (about one spectral cycle per pointer sweep) and the stripes follow 0.6 of the pointer (`--xm-px`).
- `.foil::after`: sparkle-v1 grain, screened (adds light only), shifts 30 percent of the excess.
- `.cure` (module `cure: true`): hard-light two-stripe rainbow for the gold plates and pale frames the dodge cannot tint.
- `.glare`: overlay lamp, masked to the Live map and the ink knockout (1:1 with the pointer on purpose).
- Name-plate knockout: `--xm-ink` (per card, inline from the module) is one more intersect mask layer on `.foil`, `.cure`, `.glare`
  (default solid so a missing asset keeps the mask valid).
- `xm-pale` (59 prints; scan luminance under the map >= 146, plus xy2-69 and xy12-22): hard-light columns, `contrast(1.1) saturate(1.5)`,
  opacity `.2 + card-opacity * .6`: keeps colour on pale prints, saturation and chroma >= master.
- `xm-dc` (dc1-6, dc1-15 only): faint hard-light tint (0.12 + 0.12 x card-opacity, floor 0.2) keeps the art, `.cure` is the facet layer: a grey angle
  per facet gated by a pointer-driven grey (`difference` then `invert / brightness / contrast(15)`, a quarter of the facets lit at once), multiplied by a
  per-facet pastel tint, `screen`, floor 0.3. NO rainbow columns on `.glare::after` (review 2: they coated the face); `.glare` is only the hot spot.
  The per-card `-ink.webp` of these two also knocks the text rows out (make_dc_ink.py). Self-contained: the pair ships without the rest of the family.
- 40 promos: Live's xybsp foil maps shipped as `<id>-map.webp` (they ran on a median safe map); xyp026's map is unused until a family claims it.

## Judge it
Phone size, WebKit and Chromium, poses rest / 30:25 / 50:78. Frame and background flash a saturated rainbow at 30:25, a soft sheen at rest,
still colour at 50:78; Pokémon and text box within a few levels of the bare scan; name, EX, "Evolves from", HP and the circle stay readable
and in colour at every pose; no card weaker than master (`fam=off`) in HSV saturation or chroma in the foil zone; one rainbow cycle at most
over a full sweep. Double Crisis: facets visible at rest, a different set lights at every pose, art colour intact.

## Open
Foil strength 0.35 / 1.6 checked on dc1 and xy8 in round 2; shine off, reduced motion, tilt off and Classic not re-run; ink masks have some false positives
in art right under the plate (harmless); mid-bright cards are brighter than master (chroma >= master); DC facet size / colours MEDIUM confidence; the lit DC shards are paler than the Japanese photos' saturated glints (next step: a hard-light shard layer).
