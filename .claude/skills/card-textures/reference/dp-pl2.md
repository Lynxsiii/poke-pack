# Rising Rivals (pl2)

Built 2026-10-01 (builder d3). Research: `/mnt/project-files/every-era/hgss/research/pl2.md`, `pl-pack-structure.md`, `pl-products.md`, `pl-dpp-claims.md`, `pl-box-contents.md`.
Release 2009-05-16. 120 cards (111 printed + Pikachu secrets 112-114 + Rotom RT1-RT6), all in the file; rarities match the research (C33 U32 R24 RH13 LV.X9 RS3 + 6 `Rare Rotom`; RT6 Charon's Choice is a Supporter filed as Rotom like the other five). Promo cards `pl2-dpp42, 43`; `totalCount` stays 120.

## Pack
Ten cards: 5 Commons, 3 Uncommons, a reverse-slot card, a rare-slot card; no code card and no Energy at all (`energyPrint: "dp"` only for the shared pool). Rare slot: holo .2502, LV.X .0556, secret .0275. Reverse slot: Rotom .0556 (six cards, cracked-ice reverse foil on their own sheet, EF two a box: medium). Source: Elite Fourum post 80, Flipside, Collexy for the cracked ice. Sources and confidence in data/pullrates.json.

## Scans
Scrydex `pl2-<n>`, `pl2-SH4`/`RT1`/`AR1` for the subsets. Looked at first, a holo, LV.X, a secret or subset card and the last card of the set, plus the DP promos: clean full scans, no white edges, no swaps needed.

## Wrappers
pokesymbols `rising-rivals-pack-0..3`: Rotom, Leafeon, Scizor, Houndoom. Cut with clean_pack_art.py.

## Prices
TCGplayer group via a scratch variant of fetch_tcgplayer_prices.py: the stock script only matches `n/total` numbers, so it skips SH / RT / AR subset cards and plain-number groups (pl3) and does not read the Reverse Holofoil row the Shining and Rotom cards are sold under. Every card is priced. Booster pack prices are thin ($390-717 a pack) and used as listed.

## Products
Two products: the Carnivine G and Probopass G Three Pack Blisters (2 pl2 + 1 dp5). Not built: the Drill Point and Cutting Edge theme decks (no TCGplayer ids, no lists), the Value Box (no promo number, not in the claims). Products with packs from another set (`from`) are priced at the home set's pack price per pack (`priceDerived: "packs"`); they stay hidden in the shop until those sets (dp2, dp5, dp7, pop8, pop9) are playable. Promos `foilAs`: Rare Holo for the cosmos-holo Pokémon, Rare Holo LV.X for the LV.X.
