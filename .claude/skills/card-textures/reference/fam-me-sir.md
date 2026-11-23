# Holo family me-sir: Mega Evolution Special Illustration Rares

Module `js/fam/me-sir.js`, sheet `css/holo/fam/me-sir.css` (every rule scoped to `.fam-me-sir`), generators
`scripts/fam/me-sir/make_sir_masks.py` (per-card masks) and `scripts/fam/me-sir/make_specks.py` (the speck tiles),
assets `assets/foil/fam/me-sir/` (`<set>/<n>-map-v1.webp`, `specks-v1.webp`, `glints-v1.webp`). Audit group
`w2-me-sir` (2026-10-22); rebuilt 2026-11-23 on the sv-sir recipe.

## Scope

Every non-reverse face whose rarity is "Special Illustration Rare" in me1-me5 and me2pt5 (not me55, the 30th
Celebration), drawn on a foil map: 55 faces, every one with TCG Live's foil and etch maps (`has-foil-map has-etch-map
era-me`). Census 2026-11-23: 55.

## The real card (photos: /home/user/holo-refs/w2-me-sir, URLs in its SOURCES.md)

Japanese SARs of the same cards (same foil): Mega Charizard X ex 125 (studio and desk photos), Mega Starmie ex 118
(lit), Mega Greninja ex 116 (flat light), Mega Zeraora ex 114 (in hand and sleeved), Mega Darkrai ex 116 (flat),
Mega Venusaur ex 177 (PSA slab).

- Where: the whole face is foil under the ink; the Pokémon is matte ink, black text stays black.
- Frame: silver, from light (Charizard X studio) to mid-dark (Zeraora sleeved, Darkrai) with a grain; the swirl
  engraving shows in the photos at full resolution.
- Under a lamp: dense fine sparkle over the art, text and frame; rainbow sand / a rainbow band on the frame near the
  light (Starmie's and Darkrai's left frame, Charizard X's left frame). No rainbow over the painting.
- The painting keeps its saturation and blacks; Darkrai stays black with pale line work.

## What it draws (2026-11-23)

The earlier pass (soft-light etch relief, colour-dodged sparkle tile, a rainbow band masked by the map cubed) left
the frame a smooth flat grey with no grain, showed no sparkle at native pixels and laid the band right across
Darkrai's painting (its art is mapped at 0.8, so map^3 did not hold it to the frame). Now, as css/holo/fam/sv-sir.css:

- `--mesir-map`: Live's foil map times a keep-dark pass from the scan (dark neutral ink out, grown one pixel).
- `.foil`: colour-dodge speck tile (`specks-v1`, pitch 7, saturation 0.6) at 0.6, rest and lit; `::after` the etch as
  a dim sheen around the pointer.
- `.cure`: multiply, a 72% grey plus Live's etch in white at 0.45 (`::before`), masked to a geometric frame ring (the
  scan's border: 4% / 3% of the card) and the mask: the grainy silver frame, lifting to bright silver round the
  pointer when lit. Pikachu ex 277's rainbow-printed frame (`mesir-prism-frame`) is only dimmed to 90%.
- `.glare`: hard-light on 50% grey, two drifting copies of `glints-v1` (pitch 3.6, saturation 0.6), pool round the
  pointer; `::after` one spectral band at 0.8, near the pointer only, masked to the frame ring: rainbow on the frame,
  never on the painting.

Gates 2026-11-23: foil_coverage clean, dark_specks ok on all six sets, rainbow_speed clean, sweep --check-only nothing
for me-sir, check_asset_overwrites nothing for me-sir.

## Open

- The swirl engraving does not read as swirls at phone size: Live's etch is a ~5 device-px line field whose swirl is
  in the orientation of the lines, which flat CSS cannot light directionally. It shows as a faint texture.
- The band position is a guess (photos show where, not how it moves).
- Gold glint on the yellow rule box is only the hard-light specks tinting yellow, not a separate gold layer.
