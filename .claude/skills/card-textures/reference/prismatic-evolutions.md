# Prismatic Evolutions (sv8pt5): pattern prints and finish by rarity

How each print in Prismatic Evolutions is foiled, what TCG Live calls it,
and which site recipe draws it (2026-09-27, from the Prismatic Evolutions
thread). TCG Live's key is `sv8-5` (promos `svp`). The set's own recipe
is `css/holo/prismatic.css`; its textures come from
`scripts/make_prismatic_textures.py`.

## Finish table

TCG Live print ids read `<Name>_sv8-5_<n>_<variant>_<suffix>`.

| Print | Count | Variant, suffix | Site classes | Recipe lives in |
|---|---|---|---|---|
| Common, Uncommon | 46, 33 | `std`, `Common_NonFoil_None` etc. | `foil-none` | |
| Reverse (C, U, R) | 100 | `ph`, `<Rarity>_FlatSilver_Reverse` | `foil-reverse has-rev-map` | `prismatic.css` (map mask) |
| Poké Ball pattern | 100 | `sph`, `PokeBall<Rarity>_Rainbow_Etched` | `foil-reverse foil-rev-pokeball foil-prism has-foil-map` | `prismatic.css` |
| Master Ball pattern | 67 | `mph`, `MasterBall<Rarity>_Rainbow_Etched` | `foil-reverse foil-rev-masterball foil-prism has-foil-map` | `prismatic.css` |
| Rare | 21 | `std`, `Rare_SvHolo_Holo` | `foil-holo foil-svholo has-foil-map` | `celebration.css` |
| Double Rare | 10 | `DoubleRare_SunPillar_Holo_CastAndCure_SouthernCross` | `foil-ex foil-sunpillar has-foil-map` | `celebration.css` |
| Double Rare, Tera ex | 15 | `DoubleRareC_SvUltra_Etched` | `foil-ex foil-tera has-foil-map has-etch-map` | `sv-finishes.css` |
| ACE SPEC Rare | 6 | `Ace_AceFoil_Etched` | `foil-holo foil-acespec has-foil-map has-etch-map` | `sv-finishes.css` |
| Ultra Rare | 12 | `UltraRare_SunPillar_Etched` | `foil-ultra has-foil-map has-etch-map` | `sv-fullart.css` |
| Special Illustration Rare | 32 | `SpecialIllustrationRare_SvUltra_Etched` | `foil-sir has-foil-map has-etch-map` | `celebration.css` |
| Hyper Rare (gold) | 5 | `HyperRare_SvUltraScodix_Etched` | `foil-gold has-foil-map has-etch-map` | `sv-fullart.css` |

There are no Illustration Rares. The Master Ball prints are the Pokémon
only (33 C, 13 U, 21 R); Trainers get a Poké Ball print alone. The gold
cards say `SvUltraScodix`, not the usual `SvUltra`: Scodix is a raised
clear coat. The shared gold recipe ignores it for now.

## Pattern prints are cards of their own

A Poké Ball or Master Ball print is not a reverse of its base card. It has
its own TCGplayer product and price (Master Ball Umbreon sells at over a
hundred times the base card), so `scripts/build_patterns.py` writes each one as a
separate card: `sv8pt5-59-pb` has rarity "Poké Ball", `sv8pt5-59-mb` has
"Master Ball". Each carries `pattern`, `base`, `printedRarity`,
`printedNumber`, its own `market` and `tcgplayerId`, and
`foilMap: assets/foil/maps/sv8pt5/<n>-ball.webp` (the `sph` foil map, which
is the same shape for both balls). The engine deals them from
`pokeballPool` and `masterballPool` and never reverses them
(`js/engine.js` `pullReverse`).

## RAINBOW / ETCHED, as TCG Live draws it

Stacking every `sph` etch map (100 prints) and taking the per-pixel median
leaves only what all of them share:

- **Crystal shards.** The whole card outside the art window is cut into
  polygons, and each one is ruled with fine parallel lines at its own
  angle. Each shard lights at its own tilt, which is why the real card
  sparkles in patches, not as one sheet.
- **The ball.** A big unetched ball sits centred at (366, 691) with
  radius 161, in TCG Live's 733 x 1024 map. It is smooth foil, so it catches
  the light as one rainbow. The Master Ball adds two side bumps and the M.
- **The card's own foil map** keeps the Pokémon and the text off the foil.

Because the shards and the ball are the same on every card, they ship once
(about 55 KB in total) instead of an etch map per print (about 160 KB each).

- `shards.webp` stores **each shard's line angle as grey** (0 to 180 degrees
  as 0 to 255), not the lines themselves. The angle comes from a structure
  tensor on the median: take the doubled-angle gradient vector, blur it
  across the shard, and fill the non-coherent pixels (text residue, the
  ball, the bars) from the nearest shard.
- The ball's outline comes from the dark (unetched) pixels inside the
  circle. Attack names cross the Poké Ball's dome on every card, so the dome
  uses the 15th percentile instead of the median. Below the dome, use the
  Master Ball median: its prints have fewer layouts. Then mirror the shape
  left to right and close it.

## Recipes worth reusing

- **The difference-blend glint.** This lights only the facets that face the
  light, from an angle map, in pure CSS. Paint the angle map and a flat grey
  set by the pointer
  (`hsl(0,0%,calc(var(--prism-light)*100%))`), blend them with `difference`,
  then apply `filter: invert(1) brightness(.54) contrast(16)`. Only pixels
  within a few degrees of the pointer's grey survive. Screen that layer on
  and mask it to the map. Any finish with directional facets (glitter,
  cracked ice, etched lines) could use this with its own angle map.
- **Hard-light for foils that must show on white stock.** A foil that uses
  `color-dodge` or `screen` vanishes on white Trainer cards. Instead, build
  `.foil` around mid grey and set `mix-blend-mode: hard-light`. Grey is a
  no-op, lighter lifts and darker dims, so the same layer reads on black
  ink and on white.
- **Rest state.** Only `.foil` paints at rest. Keep the resting look (the
  ball's rainbow and the faint shard tint) on `.foil` itself; `::before`
  holds the glints and `::after` holds the moving rainbow on the ball.

## The regular reverse: map, not window

TCG Live's `ph` map for a Prismatic reverse has a baseline alpha of about
22 everywhere. The crystals and the card's type medallion are brighter.
`js/foil-maps.js` gives a reverse card with `reverseMap` the class
`has-rev-map` and `--rev-map`, and `prismatic.css` masks the reverse's `.foil`
with art ∩ map. This is generic: any set whose data carries `reverseMap`
gets it. Promos never copy `reverseMap`.

## Pitfalls

- Don't give the pattern prints the older `foil-rev-pokeball` recipe
  (finishes.css) alone. It tiles small balls over the card, which is the
  look of Black Bolt and White Flare, not this one.
  `data-ball-layout="prismatic"` on the card tells them apart. The doubled
  class in prismatic.css outranks it.
- The Master Ball print read invisible on light cards until the layer went
  hard-light and `--prism-strength` went to 1.25.
- TCGplayer names the prints "Umbreon - 059/131 (Master Ball Pattern)".
  `fetch_tcgplayer_prices.py` strips the pattern suffix before the number,
  and the `[...]` suffix on Professor's Research, then keys the price as
  `59-mb`.
- A reverse set recipe for sv1 to sv10 (from the Paradox Rift thread) must
  skip sv8pt5's pattern prints; they are `foil-prism`, not `.reverse`.

## Sources

- TCG Live export through malie.io: `https://cdn.malie.io/file/malie-io/tcgl/export/index.json`
- Pull rates: TCGplayer's 1,200-pack study, https://www.tcgplayer.com/content/article/Pok%C3%A9mon-TCG-Prismatic-Evolutions-Pull-Rates/d94889ea-f76a-4a13-b74d-5b0b071220a7/
- Reference photos: the Japanese Terastal Festival ex Poké Ball and Master
  Ball prints (the same pattern), used to check the resting ball colours.

## Verify

```
python3 .claude/skills/card-textures/scripts/fetch_foil_maps.py --set sv8pt5 --all --variant sph
python3 .claude/skills/card-textures/scripts/fetch_foil_maps.py --set sv8pt5 --all --variant mph
python3 scripts/make_prismatic_textures.py
node scripts/test-prismatic-evolutions.mjs
```

In the lab, `?set=sv8pt5&cards=59-pb,59-mb,59r,101-pb,125-pb` shows a dark
Pokémon, its Master Ball print, its reverse, a light Pokémon and a white
Trainer. The ball should read at rest on all of them.
