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

## Not shipped yet

- `bwfa-lines` (Next Destinies to Plasma Blast, 49 prints): TCG Live's etch over the whole card. The 2026-10-02 draft
  washed the Pokémon to pastel when held and the Live etch's background showed as a black-and-white checkerboard
  (Darkrai-EX bw5 107, Raikou-EX bw5 105), so the module gives these faces the era's recipe until it is fixed. The
  etch files are on the WIP commit above, not on master.
- Darkrai BW73, Giratina BW74 (drawn line etch) and Landorus BW43 (pebble grain): their maps were never drawn, so the
  module's DRAWN table is empty and they keep the era's recipe.
