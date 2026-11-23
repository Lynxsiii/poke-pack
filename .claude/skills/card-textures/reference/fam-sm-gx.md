# Holo family sm-gx: Sun & Moon regular-frame Pokémon-GX and TAG TEAM GX

Module `js/fam/sm-gx.js`, sheet `css/holo/fam/sm-gx.css`, tiles `assets/foil/fam/sm-gx/` (generator
`scripts/fam/sm-gx/make_pebble.py`). Built 2026-11-23 from the audit w2-sm-gx (/home/user/holo-work/w2-sm-gx/AUDIT.json).

## Scope (207 faces, census 2026-11-23)

Exactly the faces `smPattern()` files as `foil-ex sm-gx` without `sm-shiny` (Hidden Fates shiny GX, the shiny family)
or `sm-fa` (full arts, sm-fullart): "Rare Holo GX" of sm1-sm12, sm35, sm75, sm115, det1 and the Black Star promos
(foilAs "Rare Holo GX"). 176 GX + 31 TAG TEAM (`sgx-tag`). No other family claimed any of them before. Reverse faces
and later products' reprints (foilAs without `era: "sm"`) are not claimed.

Map: `smGxMap()`'s `-gx-v1` (TCG Live's map, dark GX attack bar cut out; frame, pre-evolution box and the art
background foil, Pokémon and text matte). White Kyurem-GX SM141 (sm75-smp141): Live's map is inverted (gold
background black, Kyurem white), so the module points it at `assets/foil/maps/sm-gx-safe.webp` (text-safe median).

## The real finish (photos: /home/user/holo-refs/w2-sm-gx, SOURCES.md lists the URLs)

- Whole face foil except Pokémon, text and the dark attack bar; ink sits over the foil (dark ink dark, the art keeps
  its colours). Espeon-GX sm1 61 (bleedingcool, in hand), Charizard-GX SM195 (pocketmonster.dk, eBay),
  Pheromosa & Buzzwole sm10 1 (eBay), Golisopod sm3 17 (eBay), Raichu-GX sm115 20 (eBay), Gyarados sm4 18 (Etsy).
- Fine pebble grain, facets about 0.5-1% of the card, no direction, visible in ordinary phone photos.
- Tilted: saturated rainbow patches with ragged cloud edges gather near the light (Espeon: orange-yellow-cyan-violet
  beside Psybeam), broken into grain; away from the light a grey-silver sheen.
- Frame border: mid-grey silver, rainbow glitter flecks (lavender, cyan, green, pink) along its whole length.
- Pale Pokémon ink shows the pebble relief (Espeon's body) but no colour.

## How the sheet draws it (held; rest paints `.foil` alone)

- `.foil` multiply, masked by art and map x2: the frame ring (four strips of tinted silver, 150-214 levels, sliding
  with the tilt) over a white fade round the pointer (colour gathers near the light, never a flag), the pebble tile
  overlaid (grain inside the band), the cloud tile screened (ragged patches), then irregular-width rainbow bands
  (weakest channel about 0.4) at 260%.
- `.cure` colour-dodge gain x1.35 (warm hot spot about x1.8) with coloured facet glints screened in; the frame
  strips take a gain of only about x1.1 so the border stays mid-grey silver. `contrast(0.9)` closes the chain.
- `.glare` colour-dodge gain (rgb 92 peak) on the pebble facets (alpha tile), masked by art x pebble x (map + 0.45
  floor): pale Pokémon read as silver texture, dark ink and the attack bar stay put. A grey tile under `screen` on
  `.glare` darkened the ink in WebKit (2026-11-23), hence the alpha tile and a dodge.
- Rest: ring, pebble at a 0.55 white veil and the bands at 0.75 opacity, multiplied: grey-silver sheen with faint tint.

## Left / for the lead

- Bump `?v=` of `css/holo/fam/sm-gx.css` in index.html and the `sm-gx` entry in js/holo-fam.js's FAMILIES.
- White Kyurem SM141 rides the median map; a per-card map (gold background + frame foil, Kyurem silver) would be better.
  Its etch map is not drawn.
- The scans' printed TAG TEAM yellow bars are foil in some Live maps and take a little band tint near the light.
