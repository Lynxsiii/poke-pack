# Family wotc-neo-genesis: Neo Genesis (neo1) holos

Scope: the 18 neo1 Rare Holo Pokémon and Metal Energy 19 (`wotc-cosmos` pattern). Files: `js/fam/wotc-neo-genesis.js`,
`css/holo/fam/wotc-neo-genesis.css`, `assets/foil/fam/wotc-neo-genesis/<n>-bg-v2.webp`, `<n>-fleck-a-v2.webp`, `<n>-fleck-b-v2.webp`,
`scripts/fam/wotc-neo-genesis/make_neo1_maps.py`. Photos: `/mnt/project-files/holo-remaster/wotc-neo-genesis/refs/` (SOURCES.md);
audit `/home/user/holo-work/w2-wotc-neo-genesis/AUDIT.json` (2026-10-22).

## The real card
- Where: cosmos foil on the art window's background only (sky, scenery, rays); the Pokémon, frame, text box and evolution badge are matte.
  Metal Energy: the picture-box sky and the ENERGY wordmark letters are foil (Elite Fourum PSA 9 sheet, Pokemon Holo JP tilt).
- Pattern: printed flecks (pinpoints, dots, rimmed discs, snowflakes, swirls); each lights in ONE saturated colour that changes with the
  tilt, neighbours differ (Pichu and Ampharos tilt frames, Poke Historian's Lugia macro); at some tilts many flash white/gold together.
- Ground: a metallic sheen band (silver core, gold/copper one side, navy-violet the other), bright on light skies (Lugia), while navy and
  near-black skies keep their depth (Pichu, Togetic, Ampharos, Steelix: only flecks light). No texture beyond the flecks.

## What is built
- `.foil`: the sheen, screened, cut to `--ng-bg` (foil area weighted by how much the ink lets through). `.cure` (lit): the scan's own flecks,
  one hue each, hue-rotated with the tilt. `.glare`: a white-gold band cut to the flecks (they flash together). Pichu's eye holes and the
  Togetic halo of the v1 maps are fixed in v2.
- 2026-11-23 review (fix2): the sheen core was near-white (L 88-91 %) at opacity up to 0.95, so the band milked navy skies to lavender at
  centre poses (Togetic 50:45, Pichu 20:30), unlike the photos. Core lowered to L 58-63 %, wings darker, opacity `.2 + .5 x card-opacity`;
  the flecks (scan colours, mean saturation 0.42) are `saturate(2.4)` (was 1.6) so they read as saturated colour like the photos.

## Judge it
WebKit at phone size, one card per render, poses rest, 20:30, 30:25, 50:45, 80:60, 75:65, 50:78: dark and navy skies stay dark, flecks
change colour, Lugia's light sky takes a silver-gold sheen, the Pokémon stays as printed.
