# SV Black Star Promos (svp)

Scarlet & Violet's promo line, SVP 001 to 225 (2023 to 2025), added on
2026-09-27 as a promo set: no boosters, and every card comes in the product
it was sold in. 77 cards live in `data/svp.json`. The rest of the SVP
numbers are filed under the set whose own boxes carry them (an ETB, a Build
& Battle Box, a blister), so a set thread that already built a promo keeps
it; `scripts/test-svp.mjs` fails if a number is built twice.

## What TCG Live says (key `svbsp`)

`fetch_foil_maps.py` maps `--set svp` to TCG Live's `svbsp` through
`PROMO_KEYS`, and our numbers (`svp056`) to its (`56`).

| Promo finish in TCG Live | Cards | `foilAs` | Site class |
|---|---|---|---|
| `SV_HOLO` / `HOLO` (the three starters) | 001 002 003 | Rare | `foil-holo foil-svholo` + map |
| `SUN_PILLAR` / `HOLO`, `DoubleRare`, `SouthernCross` cure | 37 (ex promos, most tins and boxes) | Double Rare | `foil-ex foil-sunpillar` + `cure-stars` + map |
| `SUN_PILLAR` / `HOLO`, `IllustrationRare` | 028 029 088 206 207 | Illustration Rare | `foil-ir` + map |
| `SV_ULTRA` / `ETCHED`, `UltraRare` | 056 124 166 | Ultra Rare | `foil-ultra` + map + etch |
| `SUN_PILLAR` / `ETCHED`, `UltraRare_SunPillar_Etched` | 125 | Ultra Rare (set by hand) | `foil-ultra` + map + etch |
| `SV_ULTRA` / `ETCHED`, Tera `DoubleRare` | 196 | Double Rare | Tera etch via the map |
| `COSMOS` / `HOLO` | 099 | Cosmos | the cosmos holo |
| `STAMPED` only (Paradise Resort) | 045 150 224 | none | plain card with its stamp |
| no foil | 015 101 107-109 111-114 148 219-223 | none | plain card |

- 125 (full-art Armarouge ex) reads as an Illustration Rare through
  `foil_from_tcgl()`, the same pitfall as other full-art ex promos. It is
  an Ultra Rare: `promoCards` in `data/sets/svp.json` pins `foilAs`.
- 191 and 192 (Sprigatito and Fuecoco, Grand Adventure Collection) are
  not in TCG Live. They are holo in hand, so `foilAs: "Rare"` without a
  map gets the older window holo (`foil-holo`); `foil-svholo` needs a map
  to keep off the Pokémon.
- Not in TCG Live at all, so no map: 085 (Van Gogh Pikachu), 102, 190,
  191, 192, 213 to 215 (Illustration Contest), 225 (Worlds 2025 Pikachu).
- The Paradise Resort promos' `STAMPED` maps cover the stamp only, and
  224's is offset from the art. They ship but are unused, because those
  cards have no `foilAs` and render as the plain cards they are.
- The battle deck and Battle Academy promos (101, 107 to 114, 148,
  219 to 223) are non-foil prints in TCG Live and in hand.

## Shipping the maps

```
python3 .claude/skills/card-textures/scripts/fetch_foil_maps.py --set svp --all --ship --write-data
python3 .claude/skills/card-textures/scripts/check_foil_maps.py --set svp
```

53 foil maps and 5 etch maps, 2.6 MB. `check_foil_maps.py` flags 150, 197
and 224: 150 and 224 are the stamp-only maps above (a near tie is expected
when a map is one small stamp), and 197's map matches its Koraidon art, so
none is a swap.

## Set mark

TCG's black star mark is black on clear and disappears on the site's dark
page. `assets/cards/sets/svp-logo.webp` and `svp-symbol.webp` carry a white
sticker edge (the alpha dilated by 5 px on the 200 px logo and 18 px on the
514 px symbol, filled near white, the mark on top). Re-running
`mirror_images.py` with `--force` would bring back the plain black mark.

## Not simulated yet

- The Cosmos holo extras some tins and boxes carried beside their promo.
- Jumbo cards from the premium collections.
- Staff and prerelease stamp variants.
