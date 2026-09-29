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
| Rare Holo V | whole card | no (an etched one, the alt-art promos, is `foil-ultra swsh-vfa`) | `foil-ex swsh-v` |
| Rare Holo VMAX / VSTAR | yes | yes | `foil-ultra swsh-vmax` / `swsh-vstar` |
| Rare Ultra (full-art V, VMAX alt, Trainer) | yes | yes | `foil-ultra swsh-vfa` / `swsh-vmax swsh-alt` / `swsh-tfa` |
| Rare Rainbow | yes | yes | `foil-ir swsh-rainbow` |
| Rare Secret (gold) | yes | yes | `foil-gold swsh-gold` |
| Trainer Gallery Rare Holo (TG, GG) | yes | yes | `foil-ex swsh-tg` |
| Radiant Rare | yes | no | `foil-holo swsh-radiant` |
| Amazing Rare | window | no | `foil-holo swsh-amazing` |
| Rare Shiny (Shiny Vault) | yes | yes | `swsh-shiny` + the holo, V or VMAX classes |
| Celebrations 001-025 Rare / Rare Holo | dropped (whole face) | no | `foil-holo swsh-holo swsh-cel` |
| Classic Collection (cel25) | none (whole face) | drawn for cc15-here, cc15-rockets | `foil-holo swsh-holo swsh-classic[ swsh-classic-full]` |
| Reverse (C, U, R, Rare Holo) | tile per type | no | `foil-reverse rev-swsh rev-<type>` |

A full-art rarity with no map on the CDN falls to a white whole-card map
and the shared etch tile, so nothing in the family ever hits the illusion
rings of `realism.css`.

Shining Fates' two golds (Eternatus V SV121, VMAX SV122) are numbered in
the Shiny Vault but are `Rare Secret`: `swshPattern()` checks the rarity
before the `sv` gallery, or they take the shiny V recipe and its colour
dodge blows the black ink up blue (Noah's phone, 2026-09-29).

## The etch maps are softened (2026-09-29)

Live's etch maps for the era are hairline screens: the VMAX and VSTAR grain
is a 2 to 3 px pitch at the map's 400 px width, the gold and full-art line
art carries a fine hatch. Drawn as a hard mask under the lit layers, that
screen aliases into a wavy line pattern over the whole card on a phone
(Surfing Pikachu VMAX cel25 9, Meowth VMAX SWSH005). Every etch map of the
era (1,022 of them, `swshp` included) now ships as `<n>-etch-v3.webp`
(`soften_era_etch.py --set <id>`, which also repoints `etchMap`): the
original blurred by 1.5 px at map size, so the grain's density still
follows the drawing but no screen survives, then multiplied by a wandering
grain (a smooth random field with 2 to 3 px features, seeded per card) so
the relief still reads as texture at desktop and phone size. The plain
blur alone (v2, a few hours earlier) left the full arts looking untextured
to Noah, and the hairline original was a line screen. The originals are
gone from the tree (assets are served immutable, so a new name was the
only way). A new set of this era runs the script after `fetch_foil_maps.py`.

Whole-card finishes (the V and the full-art family) carry a 40% foil floor
under Live's map (`--swsh-floor`): Live shades the silver frame and the
copyright band dark, so under the light the lit frame stopped in a hard
line at the bottom-left corner (Charizard V SWSH260, Noah's desktop shot).
A V is foil edge to edge, so nothing on it is matte.

## Dodge-safe filters (2026-09-29)

Every finish here that colour-dodges its `.foil` onto the scan ends its
filter chain in `contrast(0.8)` when the chain would otherwise pin channels
at 1.0 (the V recipe and the whole full-art family, gold included). Colour
dodge divides the backdrop by (1 - source): at 1.0 the near-black ink of a
gold card or a VMAX's text bars becomes pure blue or red, and Safari draws
the singularity as jagged pixel blocks (Noah's Eternatus V and Surfing
Pikachu VMAX shots). Capped at 0.9 the gain is tenfold at most, so ink stays
ink. Keep the cap when retuning a filter.

Celebrations is its own case (2026-09-29, after Noah called its holos bad):
photos of Lugia 022 and Lunala 015 show every card of the 25 foil over the
whole face inside the yellow frame, a soft pearl with no brushed lines, so
`swsh-cel` drops Live's window map and cuts the face with an inset. The
Classic Collection (Charizard 4/102 is graded "Confetti Holofoil") is a
dense galaxy of light flecks over the whole face, strongest in the window,
so `swsh-classic` masks to the card art, not the window, with the frame
inset kept matte; two copies of the cosmos tile at different scales move
against each other so flecks wink. Both are colour-dodge over a dark base
at low opacity: the first two passes at 0.65 to 0.95 opacity whited the
art out at 30:25.

## What the photos say (texture-refs in the project files)

- **Rare Holo**: fine vertical brushed lines in the art window; tall bands
  of light slide sideways as the card tilts, silver to pale blue, magenta
  and gold. Recipe: 110° rainbow over 2px vertical scanlines, two
  counter-tracked bar families, a luminosity hot spot. At phone size it
  needs brightness 1.3 and a broad hot spot or it vanishes.
- **Pokémon V**: the whole card is foil with etched streaks at 55° rising
  to the right and strong rainbow flashes. `assets/foil/swsh-streaks-v2.webp`
  (512px seamless, from `make_swsh_streaks.py`) carries the streaks; they
  are masked into a brighter copy of the pillar stack and lit again in the
  glare. The first tile had 63 hairlines across the card (a 3.5 px pitch on
  a phone) and Noah saw a diagonal line screen over Surfing Pikachu V
  (2026-09-29); v2 has 16 broad soft rays that wander, as the Glaceon V
  photo shows, and the recipe's tinsel bars widened from a 4.5% to a 12%
  pitch for the same reason. A tile is a grating too: verify.md's line
  screen row applies to it.
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

## Benchmark: poke-holo.simey.me (2026-09-29)

Noah asked that ours "look the same if not better than that site". Every
SWSH finish was rendered next to the demo, same card, tilts 30:25 and
75:65 (sheet in /mnt/project-files/sword-shield/simey-compare/). Only the
regular V fell short (dim between the tinsel bars, small lit pool): #84
widened the lit bars, raised the V foil's base brightness/saturation and
opened `--v-light`. Keep the realism rules on top of the benchmark: their
full arts wash the whole card in one tile; ours follow the print's map.
Re-run the comparison with `scratchpad g/simey-shots.mjs` style shots
(their demo opens a card on click; click `.card__rotator` again to close)
when a recipe changes.

## Checks before merging

- `sweep_finishes.py --set swsh9 --poses rest,30:25,75:65` at 220px x3,
  then swsh45 (shiny, amazing, gold), swsh10 (radiant, TG), cel25 (classic),
  swsh12pt5 (GG), swsh7 (VMAX alt, full-art Trainer).
- Noah browses on an iPhone, and Safari is where the line screens and the
  dodge blow-ups showed while Chromium looked fine. Render the etched
  finishes with `foil_probe.mjs --browser webkit` too (Playwright's WebKit;
  [[poke-pack-webkit-testing]] in memory has the install), and read the
  shots at native pixels: a downscaled composite invents its own moiré.
- Count saturated pixels over dark ink: a gold or a VMAX's text bars at
  30:25 should have no pure-blue or pure-red pixels (`b > 250 and r < 100`).
- A gallery card whose foil lights a different Pokémon's silhouette has
  the wrong map: check the key and offset above, not the recipe.
- A gallery scan that is the card back has the wrong scrydex id (Lost Origin's
  30 TG scans shipped that way on 2026-09-28; `imageRemote` must use the
  `swsh11tg-` id). Check with a hash count: 30 identical scans is the back.
