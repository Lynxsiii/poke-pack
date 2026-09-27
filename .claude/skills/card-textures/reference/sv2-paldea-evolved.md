# Paldea Evolved (sv2): which finish each card prints

A worked example of taking an early Scarlet & Violet set onto the site with
nothing but TCG Live data and the shared SV recipes (2026-09-27). No new
finish was needed; the work was reading the data right and shipping maps.

## The tally

From `https://cdn.malie.io/file/malie-io/tcgl/export/v0.1.9.13/sv2.en-US.json`,
grouping every print by rarity, `foil.type` / `foil.mask` and the tail of
`ext.tcgl.longFormID`:

| Rarity | Cards | TCG Live print | Site classes |
|---|---|---|---|
| Common, Uncommon | 81, 70 | `NonFoil`; reverse `FlatSilver_Reverse` | none; reverse `foil-reverse` |
| Rare | 25 | `SV_HOLO` / `HOLO` (`SvHolo_Holo`) | `foil-holo foil-svholo` |
| Double Rare | 14 | `SUN_PILLAR` / `HOLO` + `CastAndCure_SouthernCross` | `foil-ex foil-sunpillar cure-stars` |
| Double Rare, Tera | 3 (Forretress, Slowking, Dedenne) | `SV_ULTRA` / `ETCHED`, no coat | `foil-ex foil-tera` (sv-tera-acespec.md) |
| Ultra Rare | 23 | `SUN_PILLAR` / `ETCHED` | `foil-ultra` |
| Ultra Rare, Tera | 3 | `SV_ULTRA` / `ETCHED` | `foil-ultra foil-tera` |
| Illustration Rare | 36 | `SUN_PILLAR` / `HOLO` | `foil-ir` |
| Special Illustration Rare | 15 | `SV_ULTRA` / `ETCHED` | `foil-sir` (map-aware port in celebration.css) |
| Hyper Rare | 9, including two gold basic Energies | `SV_ULTRA` / `ETCHED` | `foil-gold` |

Reverses exist for every Common, Uncommon and Rare, Trainers and the four
Special Energies (Jet, Luminous, Reversal, Therapeutic) included: the
default `reverseRarities` is right. The Special Energies are printed
Uncommon.

The rule that fell out: in these sets the Tera subtype in `data/sv2.json`
matched TCG Live's `SV_ULTRA` Double and Ultra Rares exactly, and every
other Double Rare carried `SouthernCross`. So `cureOf()` giving stars to
mapped non-Tera Double Rares is correct here without a per-card list.

## Promos

The set's product promos come from `svbsp`, which `fetch_foil_maps.py`
already resolves from the `svp` prefix:

| Promo | Print | `foilAs` |
|---|---|---|
| SVP 019-022, Build & Battle | `SV_HOLO` / `HOLO` | Rare |
| SVP 023-026, blisters | `COSMOS` / `HOLO` | Cosmos |
| SVP 027 Pikachu, ETB | `SUN_PILLAR` / `HOLO`, `IllustrationRare` | Illustration Rare |

`svp027-pc` (the Pokémon Center stamp) gets the unstamped print's map, so
the stamp is foiled like the art around it. Fine at card size; worth a stamp
knockout if anyone zooms in on it.

## Running it for a set not in `SETS`

```
python3 .claude/skills/card-textures/scripts/fetch_foil_maps.py --set sv2 --key sv2 --all --ship --write-data
```

`--key` avoids editing the shared `SETS` table. Re-run after
`build_products.py` so the promo cards get maps too (the cache means only
the new ones are fetched).

Weight: 138 cards, 13.4 MB. The 53 etch maps (Ultra, SIR, gold, Tera) are
about 150 KB each and are most of it; the foil maps are 20-60 KB.

## Research notes

- pullrates.gg answered 503 all day on 2026-09-27, so `fetch_pullrates.py`
  could not run. TCGplayer's pull-rate articles render client-side: WebFetch
  gets an empty page, but headless Chromium from the global Playwright
  (`/opt/node22/lib/node_modules/playwright`) through `HTTPS_PROXY` reads the
  tables, confidence intervals included.
- pkmn.gg's `sortPrice` is TCGplayer market for the pack print (its
  `variantMap` names the TCGplayer product id); it matched tcgcsv.com to the
  cent or within a day's drift for every card checked.
