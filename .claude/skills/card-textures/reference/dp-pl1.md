# Platinum (pl1)

Built 2026-10-01 (builder d3). Research: `/mnt/project-files/every-era/hgss/research/pl1.md`, `pl-pack-structure.md`, `pl-products.md`, `pl-dpp-claims.md`, `pl-box-contents.md`.
Release 2009-02-11. 133 cards on pkmn.gg, scrydex and TCGplayer (127 printed + Haymaker secrets 128-130 + Shining SH4-SH6), all in the file; rarities match the research (C39 U42 R23 RH17 LV.X6 RS3 + 3 `Rare Shining`). Seven promo cards `pl1-dpp35..40, 44` (DP35 Porygon-Z, DP36 Gliscor, DP37-39 the Spring LV.X promos, DP40 Regigigas, DP44 Magnezone); counted under dpp, `totalCount` stays 133.

## Pack
Ten cards: 5 Commons, 3 Uncommons, a reverse-slot card, a rare-slot card; no code card and no Energy at all (`energyPrint: "dp"` only for the shared pool). Rare slot: holo .2502, LV.X .0556, secret .0275 (the Haymaker trio, EF assumes the holo sheet: low-medium). Reverse slot: Shining .0278 (three cards, own sheet, EF one per box, 10 pulls: medium). Source: Elite Fourum post 76 with Flipside's 1:18 LV.X. Sources and confidence in data/pullrates.json.

## Scans
Scrydex `pl1-<n>`, `pl1-SH4`/`RT1`/`AR1` for the subsets. Looked at first, a holo, LV.X, a secret or subset card and the last card of the set, plus the DP promos: clean full scans, no white edges, no swaps needed.

## Wrappers
pokesymbols `platinum-pack-0..3`: Shaymin (Sky Forme), Giratina (Origin), Palkia, Dialga (second source: pokesymbols' Booster Pack Art list, and my look at each file). Opaque renders on white: `clean_pack_art.py` cut them in place (never committed uncut).

## Prices
TCGplayer group via a scratch variant of fetch_tcgplayer_prices.py: the stock script only matches `n/total` numbers, so it skips SH / RT / AR subset cards and plain-number groups (pl3) and does not read the Reverse Holofoil row the Shining and Rotom cards are sold under. Every card is priced. Booster pack prices are thin ($390-717 a pack) and used as listed.

## Products
Seven products: Porygon-Z and Gliscor Three Pack Blisters (2 pl1 + 1 dp2 pack), the three Spring 2009 Collector's Tins (Dialga 485825, Shaymin 485824, Giratina has no TCGplayer id; 2 pl1 + dp2 + dp7), the Regigigas Colossal Box (3 pl1 packs; its two other D&P-series packs are not named by the sources, not simulated), the Platinum Poster Pack (2 pl1 + 2 pop8). Not built: the Flourish and Rebellion theme decks (no deck lists in the research; TCGplayer 229173/229175 have no price), the Platinum Player's Guide (DP41, disputed source, no packs: left for the dpp pseudo-set), the Platinum Series Collection Box (contents medium-low, its three promos are not DP numbers). Products with packs from another set (`from`) are priced at the home set's pack price per pack (`priceDerived: "packs"`); they stay hidden in the shop until those sets (dp2, dp5, dp7, pop8, pop9) are playable. Promos `foilAs`: Rare Holo for the cosmos-holo Pokémon, Rare Holo LV.X for the LV.X.
