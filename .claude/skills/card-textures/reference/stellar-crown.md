# Stellar Crown (sv7)

Worked example of taking a Scarlet & Violet set from "retired" to fully
foiled using only TCG Live data and the shared recipes (2026-09-27, from
the Stellar Crown thread). No new finish was needed; what is here is the
mapping and the traps.

## Finishes, from TCG Live

TCG Live key `sv7` (the same as the site id). Tally of the `_std_` prints:

| Rarity | Cards | `foil.type` / `foil.mask` | Print id tail | Site classes |
|---|---|---|---|---|
| Rare | 15 | `SV_HOLO` / `HOLO` | `Rare_SvHolo_Holo` | `foil-holo foil-svholo` |
| Double Rare | 10 | `SUN_PILLAR` / `HOLO` | `DoubleRare_SunPillar_Holo_CastAndCure_SouthernCross` | `foil-ex foil-sunpillar cure-stars` |
| Double Rare, Stellar Tera | 4 (28, 32, 51, 128) | `SV_ULTRA` / `ETCHED` | `DoubleRareC_SvUltra_Etched` | `foil-ex foil-tera` (sv-tera-acespec.md) |
| ACE SPEC Rare | 3 | `ACE_FOIL` / `ETCHED` | `Ace_AceFoil_Etched` | `foil-holo foil-acespec` |
| Illustration Rare | 13 | `SUN_PILLAR` / `HOLO` | `IllustrationRare_SunPillar_Holo` | `foil-ir` + map |
| Ultra Rare | 8 | `SUN_PILLAR` / `ETCHED` | `UltraRare_SunPillar_Etched` | `foil-ultra` + map |
| Ultra Rare, Stellar Tera | 3 (157-159) | `SV_ULTRA` / `ETCHED` | `UltraRareC_SvUltra_Etched` | `foil-ultra foil-tera` |
| Special Illustration Rare | 6 | `SV_ULTRA` / `ETCHED` | `SpecialIllustrationRare_SvUltra_Etched` | `foil-sir` + map |
| Hyper Rare | 3 | `SV_ULTRA` / `ETCHED` | `HyperRare_SvUltra_Etched` | `foil-gold` + map |
| Reverse (C, U, R) | 125 | `FLAT_SILVER` / `REVERSE` | `_ph_` prints | `foil-reverse` |

Commons and Uncommons have no `std` foil at all (`foil` is null); only
their `_ph_` reverse print is foil. Nothing in the set is Poké Ball or
Master Ball patterned.

The `C` in `DoubleRareC` / `UltraRareC` is the Tera print. In sv7 it lines
up exactly with `"Tera"` in the card's `subtypes`, which is what the shared
hook reads. The Tera Pokémon's SIR (168, 170) and gold (173) are ordinary
`SpecialIllustrationRare` / `HyperRare` prints.

## What the Stellar Tera print looks like in the maps

- **Foil map**: mid grey over the whole card, Pokémon and text box
  included. Every part of the card is foil at part strength; the crystals
  are ink.
- **Etch map**: a fine fingerprint grating (tight wavy line fields that
  change direction patch by patch) over the art and the frame, cut by
  smooth, un-etched shapes: the four-point sparkles printed in the art,
  the speed streaks, Terapagos's eye, and the attack box. Smooth reads as
  mirror on the real card, so the sparkles flash as a block while the
  grating shimmers. The shared recipe's etch hot spot on `.glare::after`
  already draws this; nothing Stellar-specific was needed.

## Promos (`data/sets/sv7.json`)

- The Terapagos ex Ultra-Premium Collection promos are Tera prints in TCG
  Live (`UltraRare_SvUltra_Etched`), but SVP 163 Cinderace ex and SVP 164
  Lapras ex are printed gold, like a Hyper Rare. `foil_from_tcgl()` would
  make them Ultra Rares, so the config overrides them with
  `"foilAs": "Hyper Rare"`. SVP 165 Terapagos ex is a silver full art and
  keeps TCG Live's answer (`Ultra Rare`, which the Tera hook then takes).
  Look at the scan of every `SV_ULTRA` promo before trusting the mapping.
- Blister promos 137-140 are `COSMOS` / `HOLO`; the Build & Battle promos
  133-136 are `SV_HOLO` with the Stellar Crown logo stamped over the art.
  Unlike the 30th Celebration's flat-ink Pikachu stamp, this logo is foil:
  its letters are white in the foil map, so the map alone draws it right.

## Shipping the maps without editing the shared script

`fetch_foil_maps.py` resolves the TCG Live key from `--key` before its
`SETS` table, and promo numbers (`svp141`, `svp141-pc`) through
`PROMO_KEYS`. So a set whose key is known needs no edit to the script:

```
python3 .claude/skills/card-textures/scripts/fetch_foil_maps.py --set sv7 --key sv7 --all --ship --write-data
```

That shipped 78 cards (every non-reverse foil print plus 13 promos), about
7 MB in `assets/foil/maps/sv7/`.

Surging Sparks found TCG Live maps filed under the wrong card, and its
thread's `check_foil_maps.py` flags any map whose best-matching scan is
another card. On sv7 it flagged 17 foil and 6 etch maps; every one was
checked by eye against its scan and none is a swap. Why they flag:

- **Same art, different print**: 157/158 against the gold UPC promos
  SVP 163/164, 173 against SVP 165, SVP 141-pc against 141. These even
  "point back" at each other, which the script calls a likely swap. Look
  before fixing anything: the maps are identical because the art is.
- **Flat silhouettes**: a Rare whose map is one black Pokémon shape in a
  grey window (Alcremie 65, Melmetal 104, Bouffalant 119, the Horsea promo)
  scores almost nothing against its own busy scan, so any other window-holo
  map wins. Their own scores were near zero (0.008-0.04), not beaten by a
  margin.

## Verify

```
node .claude/skills/card-textures/scripts/foil_probe.mjs \
  --query "set=sv7&cards=1,28,128,134,3,143,157,160,170,173&proof=off&poses=rest,25:20,50:50,80:75&w=260" \
  --out /tmp/sv7.png --width 2500
```

1 Venusaur ex (star coat), 28 and 128 Stellar Tera ex, 134 ACE SPEC,
3 Rare, 143 Illustration Rare, 157 Tera full art, 160 full art, 170 SIR,
173 gold.
