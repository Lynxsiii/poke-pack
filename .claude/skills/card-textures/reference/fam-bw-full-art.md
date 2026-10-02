<!-- Family note for the holo family bw-full-art (older-era holo remaster, 2026-10-02). Research, photos and the family
agent's log: /mnt/project-files/holo-remaster/bw-full-art/ (AGENT-LOG-thread-b.md, thread-b-scratch/ef/ for the real-card
photos). WIP of the unfinished parts: branch claude/dp-bw-holo-remaster-szkil1, commit 1b1bd03. -->
# bw-full-art

## Shipped: the flat full arts of Black & White to Noble Victories (`bwfa-sand`)

Reshiram 113 and Zekrom 114 (bw1), Thundurus 97 and Tornadus 98 (bw2), Virizion, Victini, Terrakion, Cobalion and N
(bw3 97-101). Real cards (photos in thread-b-scratch/ef/, Zekrom 114 pair): smooth to the touch, a stippled grey sand
foil on the background that sparkles, the Pokémon, frame and lettering a smooth mirror that throws rainbow under the
light. `--bwfa-sil` is TCG Live's two-level map for each print (white: Pokémon, frame, lettering; black: background,
shipped by `scripts/fam/bw-full-art/ship_live_etch.py`); `sand-v1.webp` (`make_sand.py`) is cut to its black part, and
the `.cure` layer carries the bands in hard-light so white and black ink both take the colour. Checked in WebKit at
phone size (rest, 30:25, 75:65, 50:78), foil_coverage clean, dark_specks clean on all nine.

## Shipped 2026-10-02 (second pass): the engraved full arts of Next Destinies to Plasma Blast (`bwfa-lines`)

46 Live prints of bw4-bw10. The first draft failed review: held, the whole card washed to pastel and the Live etch's flat or
dark areas showed 20-40 px checker cells (Darkrai-EX bw5 107). `scripts/fam/bw-full-art/make_lines_v2.py` finds those
cells and redraws them as fine lines at the etch's own pitch (`etch-v2/<id>.webp`, Live's native 733 px), and the bands
are a narrow streak about a quarter of the card wide with dark gaps, at lower cure, foil and glare opacities (their own
`--bwfa-eb-*` variables), so the art keeps its colours. A few regions read as stipple (Shaymin's leaf, Iris's hair): that
is Live's own etch.

## Shipped 2026-10-02 (promos)

- Darkrai BW73 and Giratina BW74 (`bwfa-lines bwfa-promo`): line etch drawn from the scan by
  `scripts/fam/bw-full-art/make_promo_etch.py` (contour-following lines at Live's 6.5 px pitch). The shared bwfa recipe
  paints `.foil::before` (a screened white pool) at full opacity even at rest, which greyed the dark art; the
  `.bwfa-promo` block turns it off at rest and holds `.foil` at a faint sheen, so rest is the plain print.

## Landorus BW43 (shipped 2026-10-02 evening)

The real card is a hammered dimple grain edge to edge (photos: /mnt/project-files/holo-remaster/bw-full-art/landorus/),
not a line etch. Five maps failed at phone size: a dense random grain read as TV static, blurred grain as camouflage,
Voronoi cells with their own colour as stained glass or snakeskin, round dots as confetti. What passed (`etch-v9`,
`make_promo_etch.py pebble()`): soft domes lit from the top left at about 4.5 px pitch on a 733 px card, brightness
only, so the colour comes from the sheet's one broad vertical rainbow band and the grain only embosses it.
