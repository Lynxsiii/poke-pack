# Arceus (pl4)

Built 2026-10-01 (builder d3). Research: `/mnt/project-files/every-era/hgss/research/pl4.md`, `pl-pack-structure.md`, `pl-products.md`, `pl-dpp-claims.md`, `pl-box-contents.md`.
Release 2009-11-04. 111 cards (99 printed + Arceus AR1-AR9 + Shining SH10-SH12), all in the file; rarities match the research (C32 U29 R20 RH12 LV.X6 + 9 `Rare Arceus` + 3 `Rare Shining`; no secret). Promo cards `pl4-dpp50..53, 56`; `totalCount` stays 111.

## Pack
Ten cards: 5 Commons, 3 Uncommons, a reverse-slot card, a rare-slot card; no code card and no Energy at all (`energyPrint: "dp"` only for the shared pool). Rare slot: holo .25, LV.X .0833. Reverse slot: Arceus AR .25, Shining .0186 (inside the reverse sheet). Source: Elite Fourum post 82 (14 boxes: LV.X 3.00, Arceus 8.86, Shining 0.71 a box, matching its model): medium-high; Shining low-medium. Sources and confidence in data/pullrates.json.

## Scans
Scrydex `pl4-<n>`, `pl4-SH4`/`RT1`/`AR1` for the subsets. Looked at first, a holo, LV.X, a secret or subset card and the last card of the set, plus the DP promos: clean full scans, no white edges, no swaps needed.

## Wrappers
pokesymbols `arceus-pack-0..3`: Salamence, Arceus (ice/water), Arceus (grass), Zapdos. Cut with clean_pack_art.py.

## Prices
TCGplayer group via a scratch variant of fetch_tcgplayer_prices.py: the stock script only matches `n/total` numbers, so it skips SH / RT / AR subset cards and plain-number groups (pl3) and does not read the Reverse Holofoil row the Shining and Rotom cards are sold under. Every card is priced. Booster pack prices are thin ($390-717 a pack) and used as listed.

## Products
Six products: the Arceus Poster Pack (714415; 2 pl4 + 2 pop9), Poster Box (714416; 5 packs, jumbo DP50 not simulated), the Cresselia (617025) and Darkrai (659591) Three Pack Blisters (2 pl4 + 1 dp2), the Green and Blue Collector's Tins (485829 / 485830; DP53 / DP56). The Green tin is TCGplayer's single $8,000 listing (no market price). Not built: the Happiny & Lopunny Arceus blister (645314, contents unverified), the Flamemaster and Stormshaper theme decks (no lists). Products with packs from another set (`from`) are priced at the home set's pack price per pack (`priceDerived: "packs"`); they stay hidden in the shop until those sets (dp2, dp5, dp7, pop8, pop9) are playable. Promos `foilAs`: Rare Holo for the cosmos-holo Pokémon, Rare Holo LV.X for the LV.X.
