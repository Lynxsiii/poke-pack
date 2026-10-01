# Supreme Victors (pl3)

Built 2026-10-01 (builder d3). Research: `/mnt/project-files/every-era/hgss/research/pl3.md`, `pl-pack-structure.md`, `pl-products.md`, `pl-dpp-claims.md`, `pl-box-contents.md`.
Release 2009-08-19. 153 cards (147 printed + Legendary Bird secrets 148-150 + Shining SH7-SH9), all in the file; rarities match the research (C45 U47 R34 RH14 LV.X7 RS3 + 3 `Rare Shining`). Promo cards `pl3-dpp45..47, 49`; `totalCount` stays 153. TCGplayer lists plain numbers (no /147) in this group: the stock fetch_tcgplayer_prices.py prices none of it; priced with a scratch variant (see Prices).

## Pack
Ten cards: 5 Commons, 3 Uncommons, a reverse-slot card, a rare-slot card; no code card and no Energy at all (`energyPrint: "dp"` only for the shared pool). Rare slot: holo .2068, LV.X .0972 (3.5 a box, the most of the era), secret .0293. Reverse slot: Shining .0248 (inside the reverse sheet). Source: Elite Fourum post 81; its 28-box sample gave 3.75 LV.X a box (medium); Flipside's generic 1:18 conflicts. Sources and confidence in data/pullrates.json.

## Scans
Scrydex `pl3-<n>`, `pl3-SH4`/`RT1`/`AR1` for the subsets. Looked at first, a holo, LV.X, a secret or subset card and the last card of the set, plus the DP promos: clean full scans, no white edges, no swaps needed.

## Wrappers
pokesymbols `supreme-victors-pack-0..3`: Garchomp, Rayquaza, Absol, Charizard. Cut with clean_pack_art.py.

## Prices
TCGplayer group via a scratch variant of fetch_tcgplayer_prices.py: the stock script only matches `n/total` numbers, so it skips SH / RT / AR subset cards and plain-number groups (pl3) and does not read the Reverse Holofoil row the Shining and Rotom cards are sold under. Every card is priced. Booster pack prices are thin ($390-717 a pack) and used as listed.

## Products
Four products: the Supreme Victors Poster Pack (Dialga DP49; 2 pl3 + 2 pop9), the three Fall 2009 Collector's Tins (Garchomp C 485826, Rayquaza C 485827, both filed in TCGplayer's Platinum group 1406; Charizard G has no id; 2 pl3 + pl2 + dp7). Not built: the Overflow and Ignition theme decks (645310 has no price, no lists). Products with packs from another set (`from`) are priced at the home set's pack price per pack (`priceDerived: "packs"`); they stay hidden in the shop until those sets (dp2, dp5, dp7, pop8, pop9) are playable. Promos `foilAs`: Rare Holo for the cosmos-holo Pokémon, Rare Holo LV.X for the LV.X.
