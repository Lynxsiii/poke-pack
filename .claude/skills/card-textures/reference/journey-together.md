# Journey Together (site set `sv9`)

What Journey Together's foils are, where that came from, and what the site
ships for it (2026-09-27). It is the worked example of a plain Scarlet &
Violet main set: no new finish was needed, only the right data and TCG
Live's maps.

## Ids

| Where | Id |
|---|---|
| Site data | `data/sv9.json`, cards `sv9-<n>`; `JOURNEY_TOGETHER` in `js/catalog.js` |
| TCG Live main set | `sv9` (333 prints: 190 standard plus 143 reverse holos) |
| TCG Live promos | `svbsp` (SVP 181-195 are this set's) |
| TCGplayer | set group 24073, SV promos 22872, Miscellaneous 2374 |

The key is not in `fetch_foil_maps.py`'s `SETS` table; pass `--key sv9`.

## Foil by rarity (TCG Live export v0.1.9.13)

| Rarity | Cards | `foil.type` / `foil.mask` | Cast and cure | Site classes with a map |
|---|---|---|---|---|
| Common, Uncommon | 127 | none (reverse: `FLAT_SILVER` / `REVERSE`) | | `foil-reverse` on reverses |
| Rare | 16 | `SV_HOLO` / `HOLO` | | `foil-holo foil-svholo` |
| Double Rare | 16 | `SUN_PILLAR` / `HOLO` | `SouthernCross` on all 16 | `foil-ex foil-sunpillar cure-stars` |
| Illustration Rare | 11 | `SUN_PILLAR` / `HOLO` | | `foil-ir` |
| Ultra Rare (8 ex, 3 trainers) | 11 | `SUN_PILLAR` / `ETCHED` | | `foil-ultra` + `has-etch-map` |
| Special Illustration Rare | 6 | `SV_ULTRA` / `ETCHED` | | `foil-sir` + `has-etch-map` |
| Hyper Rare (gold) | 3 | `SV_ULTRA` / `ETCHED` | | `foil-gold` + `has-etch-map` |

No Tera ex (every Double Rare is `SouthernCross`, none `SvUltra_Etched`) and
no ACE SPEC, so the shared `foil-tera` and `foil-acespec` finishes do not
apply. Every foil card has a TCG Live map (63 foil, 20 etch), so shipping
them is the whole job: `foilPattern()` already swaps in the map-aware
recipes once `foilMap` is on the card.

## What the maps fixed

- **Rares**: the old whole-window holo washed over the Pokémon (Butterfree
  went white). The map foils the art background only, as the real card does.
- **Trainer's Pokémon** (31 cards with an owner portrait of N, Iono, Lillie
  or Hop): the map already leaves the portrait black, so it replaces the
  `ownerMask` window on holo prints. Reverses still use `ownerMask`.
- **Special Illustration Rares**: the map keeps the Pokémon and trainer out
  of the foil, so Lillie's Clefairy ex no longer bleaches to grey at an angle.
- **Illustration Rares** foil the whole card except the Pokémon, text
  included. Full-art Ultra Rares and golds foil everything, with an etch.

`check_foil_maps.py` (from the Surging Sparks thread) found no swapped maps
in this set: every flagged card was a near tie between prints of the same
art (UR and gold Bellibolt, UR and gold Zoroark, the PC-stamped N's Zorua),
and the flagged holo rares matched their own scans by eye.

## Reverse holos (not shipped, worth knowing)

TCG Live also has a map for every reverse print, at
`.../png/en/sv9/sv9_en_<nnn>_ph.foil.png` (the `_ph` print, next to `_std`).
The site skips maps on reverses (`foilExtras()` returns early), and for most
cards its window mask matches: foil everywhere but the art window, with the
owner portrait cut out. Two things the reverse maps show that the site does
not draw:

- The foil is only partial where the frame's printed type pattern sits, so
  the map is grey, not white, over the body.
- Special Energy reverses (Spiky Energy, 159) are foil **only in the text
  box**; the name bar and the art are plain. The site's `foil-energy`
  reverse foils the whole card.

Shipping them would mean a `reverseMap` field and one branch in
`foilExtras()` for every set, so it was left for a cross-set change.

## Promos

| Print | TCG Live | `foilAs` |
|---|---|---|
| SVP 181-184 (prerelease, Build & Battle) | `SV_HOLO` | Rare |
| SVP 185-188 (blisters) | `COSMOS` | Cosmos |
| SVP 189 N's Zorua (ETB) | `SUN_PILLAR` / `HOLO`, Illustration Rare | Illustration Rare |
| SVP 193 Hop's Zacian ex | `SUN_PILLAR` / `HOLO`, Double Rare | Double Rare |
| SVP 194, 195 (full-art Bellibolt and Clefairy ex) | `SUN_PILLAR` / `ETCHED`, Ultra Rare | Ultra Rare (set in config) |
| N's Reshiram 167 with the set stamp (Enhanced Booster Box) | not in the export | Illustration Rare, with card 167's map |
| Cosmos Holo Wooloo, Dubwool, Tadbulb, Lillie's Pearl | not in the export | Cosmos |

Pitfall: `foil_from_tcgl()` in `scripts/build_products.py` reads any
`SUN_PILLAR` promo that is not a Double Rare as an Illustration Rare, but
full-art ex promos are `SUN_PILLAR` / `ETCHED` with `UltraRare` in the
long form id. Set `foilAs: "Ultra Rare"` in the set config for those.
