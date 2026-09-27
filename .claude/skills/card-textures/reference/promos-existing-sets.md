# Promos for the Mega Evolution sets, Black Bolt and White Flare

What the promo prints added to `me1`, `me2`, `me2pt5`, `me3`, `me4`, `me5`,
`zsv10pt5` and `rsv10pt5` are, where their foil data comes from, and what the
site ships for them (2026-09-27). Photos and scans of these prints, with
sources, are in `/mnt/project-files/promos-existing-sets/texture-refs/`
(`SOURCES.txt` describes each one). The promo finishes themselves
(`css/holo/promos.css`, `foilAs` handling) are owned by the "Shiny and promo
holos" thread; this file is only what was learned while adding the cards.

## Where the foil data is

| Print | TCG Live export | Site data |
|---|---|---|
| Black Bolt / White Flare stamped and pattern alts | `svalt`, e.g. `svalt/zsv10-5_en_012_alt2` | `tcgl` on the promo spec: scan and `foilMap` from TCG Live |
| Mega Evolution stamped alts | `mealt`, e.g. `mealt/me1_en_133_alt` | same |
| Cosmos, Pixel Cosmos, store-stamped cosmos | none | TCGplayer scan, `foilAs: "Cosmos"`, no map |

An alt print's front is
`https://cdn.malie.io/file/malie-io/tcgl/cards/png/en/<path>.png` and its
foil map is the same path with `.foil.png`. `scripts/build_products.py`
finds the record by that front URL (`tcgl_print()`), reads the foil type
with `foil_from_tcgl()`, and writes the map with `ship_print_map()`.

## Foil by print

| Print | Physical foil | TCG Live `foil.type` | Shipped |
|---|---|---|---|
| Unova Poster Collection Snivy, Tepig, Oshawott | tinsel holo | `TINSEL` | `foilAs: "Rare"` + map, so `foil-holo foil-svholo` |
| Victini Illustration Collection Victini | Poké Ball pattern reverse | map is a plain reverse mask | `foilAs: "Poke Ball"`, drawn as a pokeball reverse |
| BLK/WHT set-stamped Double Rares | sun pillar | `SUN_PILLAR` | `foilAs: "Double Rare"` + map |
| BLK/WHT set-stamped non-ex | cosmos | `COSMOS` | `foilAs: "Cosmos"` + map |
| Mega Evolution cosmos promos (blisters, checklanes, chest, pin and tech collections) | pixel cosmos | none | `foilAs: "Cosmos"`, `variant` says "Pixel Cosmos Holo" or "Cosmos Holo" |
| Store-stamped (GameStop, EB Games, set name, What's Your Favorite?) | pixel cosmos | none | `foilAs: "Cosmos"` |

Things to know:

- Every English cosmos promo of the Mega Evolution era is the pixel cosmos,
  even when TCGplayer lists it as plain "Cosmos Holo" (see `SOURCES.txt` for
  the collector list that confirms it). Pixel cosmos is the pre-2013 "retro"
  cosmos: stair-stepped pixel planets, plus-shaped stars, square specks and
  galaxy swirls made of specks.
- On these prints the foil covers the art background and the outer border.
  The Pokémon, the header and the text box are not foil.
- A TCG Live `COSMOS` map covers the art background only.
- The tinsel prints are drawn with the SV holo recipe for now. Real tinsel
  is a fine crinkled foil, closer to the Black & White era line holo.
