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

## Not shipped yet

- Darkrai BW73, Giratina BW74 (drawn line etch) and Landorus BW43 (pebble grain): their maps were never drawn, so the
  module's DRAWN table is empty and they keep the era's recipe.
