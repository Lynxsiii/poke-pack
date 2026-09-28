# Sword & Shield era (swsh1 to swsh12pt5, cel25, pgo)

The seventeen Sword & Shield sets went live together (2026-09-28, the
"Sword and Shield era" thread). Every finish of the era is drawn by one new
sheet, `css/holo/swsh.css`, which loads last and keys off `era-swsh`; the
full-art family reuses the Scarlet & Violet Ultra Rare and gold recipes in
`sv-fullart.css` with tuning on top. Nothing here touches the shared sheets.

## Where the data comes from

- Cards: pkmn.gg through `scripts/build_set.py` (config in
  `data/sets/<id>.json`, `"era": "swsh"`). The era keeps `Rare Holo` as a
  rarity of its own (the plain `Rare` is not foil), so the alias that folds
  the two together is skipped for these sets.
- Scans: scrydex. The sub-galleries are filed under their own ids, and the
  bare set id returns the card back: `swsh9tg-TG01`, `swsh45sv-SV001`,
  `swsh12pt5gg-GG01`, and Celebrations' Classic Collection `cel25c-<n>_A`
  (the three number-15 reprints are `15_A1` Venusaur, `15_A2` Here Comes
  Team Rocket!, `15_A3` Rocket's Zapdos, `15_A4` Claydol). `build_set.py`
  knows all of this.
- Foil maps: TCG Live, through `fetch_foil_maps.py`. The numbered sets use
  their site id as the key; the special sets take the half-number form
  (`swsh3-5`, `swsh4-5`, `swsh7-5` for Celebrations, `swsh10-5` for Pokémon
  GO, `swsh12-5`). The Trainer Galleries are separate keys `swsh9a` to
  `swsh12a` numbered from 001, the Galarian Gallery is `swsh12-5a`, and
  Shining Fates' Shiny Vault continues the main set after its secret rares
  (SV001 is `swsh4-5` 074). Checked map by map against the scans: the
  printed count is not the offset (swsh9 TG01 under 173 gave Shaymin
  VSTAR's map to Flareon). The Classic Collection is not on the CDN.
- Prices: tcgcsv (`scripts/fetch_tcgplayer_prices.py`), which strips the
  era's bracketed print tags ("(Full Art)", "[Professor Oak]") and matches
  the galleries by their TG/SV/GG numbers. A sub-gallery is its own
  TCGplayer group, listed under `subsets[].tcgplayerGroup`.

## Which map each rarity has

| Rarity | Foil map | Etch map | Classes (`swshPattern()` in `js/foil-maps.js`) |
|---|---|---|---|
| Rare Holo | window | no | `foil-holo swsh-holo` |
| Rare Holo V | whole card | no | `foil-ex swsh-v` |
| Rare Holo VMAX / VSTAR | yes | yes | `foil-ultra swsh-vmax` / `swsh-vstar` |
| Rare Ultra (full-art V, VMAX alt, Trainer) | yes | yes | `foil-ultra swsh-vfa` / `swsh-vmax swsh-alt` / `swsh-tfa` |
| Rare Rainbow | yes | yes | `foil-ir swsh-rainbow` |
| Rare Secret (gold) | yes | yes | `foil-gold swsh-gold` |
| Trainer Gallery Rare Holo (TG, GG) | yes | yes | `foil-ex swsh-tg` |
| Radiant Rare | yes | no | `foil-holo swsh-radiant` |
| Amazing Rare | window | no | `foil-holo swsh-amazing` |
| Rare Shiny (Shiny Vault) | yes | yes | `swsh-shiny` + the holo, V or VMAX classes |
| Classic Collection (cel25) | none | none | `foil-holo swsh-holo swsh-classic[ swsh-classic-full]` |
| Reverse (C, U, R, Rare Holo) | tile per type | no | `foil-reverse rev-swsh rev-<type>` |

A full-art rarity with no map on the CDN falls to a white whole-card map
and the shared etch tile, so nothing in the family ever hits the illusion
rings of `realism.css`. The Classic Collection's full-foil reprints (ex,
GX, Shining, ★, LV.X, BREAK, LEGEND) get `swsh-classic-full`, which drops
the window mask.

## What the photos say (texture-refs in the project files)

- **Rare Holo**: fine vertical brushed lines in the art window; tall bands
  of light slide sideways as the card tilts, silver to pale blue, magenta
  and gold. Recipe: 110° rainbow over 2px vertical scanlines, two
  counter-tracked bar families, a luminosity hot spot. At phone size it
  needs brightness 1.3 and a broad hot spot or it vanishes.
- **Pokémon V**: the whole card is foil with etched streaks at 55° rising
  to the right and strong rainbow flashes. `assets/foil/swsh-streaks.webp`
  (512px seamless, from `make_swsh_streaks.py`) carries the streaks; they
  are masked into a brighter copy of the pillar stack and lit again in the
  glare.
- **Full-art V, VMAX, VSTAR, full-art Trainer**: the etch follows the art,
  with a rainbow wash over the whole card. VMAX runs hotter and wider,
  VSTAR paler and cooler with its white frame, the Trainer flatter with
  dense diagonal streaks.
- **Trainer Gallery**: a soft even pastel sheen, fine sparkle, faint etch.
- **Rainbow Rare**: the rainbow is printed; the foil is fine dense glitter
  that winks white. **Amazing Rare** is the same sparkle in the window
  under the printed splash. Kept fine and restrained (Noah, 2026-09-28).
- **Gold**: glitter plus etch, champagne under the light (the SV gold
  recipe with the era's etch).
- **Radiant Rare**: large cracked-ice facets, each its own hue, whole
  card: the cracked-ice tile at 44% with a 45° rainbow, an exclusion twin
  and drifting bands.
- **Shiny Vault**: silver with fine sparkle etch and a rainbow wash; the
  babies also carry a silver frame.
- **Reverse**: chevron tiles per type, `assets/foil/swsh-reverse/`.

## Checks before merging

- `sweep_finishes.py --set swsh9 --poses rest,30:25,75:65` at 220px x3,
  then swsh45 (shiny, amazing), swsh10 (radiant, TG), cel25 (classic),
  swsh12pt5 (GG), swsh7 (VMAX alt, full-art Trainer).
- A gallery card whose foil lights a different Pokémon's silhouette has
  the wrong map: check the key and offset above, not the recipe.
- A gallery scan that is the card back has the wrong scrydex id.
