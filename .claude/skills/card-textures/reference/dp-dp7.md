# Diamond & Pearl: Stormfront (dp7)

Built 2026-10-01 (builder d2). Research: `/mnt/project-files/every-era/dp/research/dp7.md`, `dp7-products.md`, `dpp-claims.md`, `second-source-check.md`, `dp-pack-structure.md`.
Release 2008-11-05 (Serebii and TCGplayer; pkmn.gg only gives the month). 106 cards (100 printed), plus the promos below, which are filed as `dp7-dppNN` and count under dpp.

## Cards
Rare Holo 11, LV.X 5 (96 Dusknoir, 97 Heatran, 98 Machamp, 99 Raichu, 100 Regigigas), Rare Secret 3 (101 Charmander, 102 Charmeleon, 103 Charizard: Arita's Base Set redraws, cosmos holo, NOT shiny; the brief's 'shiny Charmander line' is wrong), Rare Shining 3 (SH1 Drifloon, SH2 Duskull, SH3 Voltorb: `rarityOverrides`, reverse-only). Counts match pkmn.gg and the research table. Scans: scrydex (`dp7-<n>`), mirrored at the two sizes; I looked at the first card, a Rare Holo, the LV.X cards, a mid-set Common and the last card, plus a promo or two: all clean, none swapped. Singles from TCGplayer group (`fetch_tcgplayer_prices.py`; the Unown letter listings needed the norm() rules), a year of history from `backfill_prices.py`.

## Pack
Ten cards: 5 Commons, 3 Uncommons, a Mirror reverse (Common/Uncommon/Rare/Rare Holo), a rare slot; no Energy, no code card. `dpSlots`. Elite Fourum post 75: the holo sheet (60/216) carries the three secrets four times each (a stated guess), so secret .0276 (one in 36 packs for any of them) and holo .2502; LV.X 12/216 = .0556; the Shining Pokemon take one reverse-sheet position each, .0248 a pack, replacing the reverse (`reverseSpecial shining`). Flipside: shinies ~1:36. A PokeBeach excerpt says two Charizard-line cards a box (conflict, not used). Secrets and Shining low-medium.

## Maps
TCG Live has no maps for the generation (40 keys probed by the scaffold agent: all 404); no foil maps are shipped. The cosmos holo, LV.X and Shining finishes come from the DP finish sheets (css/holo/dp*.css) over the scrydex scans, whose printed foil sparkle is already in the image.

## Wrapper
Dusknoir, Regigigas, Torterra, Infernape (my reading from the art, one source; wired to dp7-1, 9, 11, 3).
Wrapper art: pokesymbols.com `booster-pack-art/{slug}-pack-N.avif` (N 0-3; N>=4 is a 16,817-byte 404 stub). They are flat photos of the wrappers, opaque, with a sliver of white at some edges; `scripts/clean_pack_art.py` cut all four to `pack-N-v2` (a little art trimmed at the pinched sides of a few; the uncut downloads were never shipped). Logos from images.pokemontcg.io, symbols from pokesymbols.

## Prices
Pack $545.27 market (low $852.96): thin, used as is. TCGplayer files the Shining cards as 'Drifloon (Shiny)' with number SH1 and only a Reverse Holofoil price ($60.79, $102.51, $46.52): `fetch_tcgplayer_prices.py` skips SH numbers and the Holofoil-then-Normal lookup would miss them, so I set `market` and `tcgplayerId` for SH1-SH3 once by hand (a daily `--prices-only` refresh will not update them). Box at 36 packs ($19,629.72).

## Products
Built: Booster Box, the Dusknoir (DP33) and Magnezone (DP32) three-pack blisters (2 dp7 packs), the Drifblim two-pack blister (DP34, Collector's Cache only, low), the two 2008 Fall tins (Mewtwo LV.X DP28, Rhyperior LV.X DP29) and the two 2008 Holiday tins (Heatran LV.X DP31, Regigigas LV.X DP30): 3 Diamond & Pearl-series packs each, opened as dp7 although the real tins held no Stormfront pack (the other sets are not priced here); the Holiday mixes are low confidence. DP35 and DP36 are Platinum blisters (d3). Left out: the Dark Rampage and Raging Sea theme decks (no lists, no price) and the Mothim prerelease stamp promo (one listing).
Derived product prices are packs x the pack price plus nothing for the promo (build_products' `priceDerived: "packs"`), so a tin costs about four packs.
