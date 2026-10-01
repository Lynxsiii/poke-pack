# Diamond & Pearl: Majestic Dawn (dp5)

Built 2026-10-01 (builder d2). Research: `/mnt/project-files/every-era/dp/research/dp5.md`, `dp5-products.md`, `dpp-claims.md`, `second-source-check.md`, `dp-pack-structure.md`.
Release 2008-05-21 (Serebii and TCGplayer; pkmn.gg only gives the month). 100 cards (100 printed), plus the promos below, which are filed as `dp5-dppNN` and count under dpp.

## Cards
Rare Holo 14, LV.X 4 (97 Garchomp, 98 Glaceon, 99 Leafeon, 100 Porygon-Z); no secret. Counts match pkmn.gg and the research table. Scans: scrydex (`dp5-<n>`), mirrored at the two sizes; I looked at the first card, a Rare Holo, the LV.X cards, a mid-set Common and the last card, plus a promo or two: all clean, none swapped. Singles from TCGplayer group (`fetch_tcgplayer_prices.py`; the Unown letter listings needed the norm() rules), a year of history from `backfill_prices.py`.

## Pack
Ten cards: 5 Commons, 3 Uncommons, a Mirror reverse (Common/Uncommon/Rare/Rare Holo), a rare slot; no Energy, no code card. `dpSlots`. Elite Fourum post 71: holo 66/216 = .3056, LV.X 6/216 = .0278; Flipside's LV.X 1:36. Same confidence as dp4. The 25 'extra' reverse spaces are not identified: uniform reverse.

## Maps
TCG Live has no maps for the generation (40 keys probed by the scaffold agent: all 404); no foil maps are shipped. The cosmos holo, LV.X and Shining finishes come from the DP finish sheets (css/holo/dp*.css) over the scrydex scans, whose printed foil sparkle is already in the image.

## Wrapper
Garchomp, Hippowdon, Darkrai, Empoleon (my reading from the art, one source; wired to dp5-97, 21, 3, 17).
Wrapper art: pokesymbols.com `booster-pack-art/{slug}-pack-N.avif` (N 0-3; N>=4 is a 16,817-byte 404 stub). They are flat photos of the wrappers, opaque, with a sliver of white at some edges; `scripts/clean_pack_art.py` cut all four to `pack-N-v2` (a little art trimmed at the pinched sides of a few; the uncut downloads were never shipped). Logos from images.pokemontcg.io, symbols from pokesymbols.

## Prices
tcgcsv lists no market price for the pack or the box. The pack is $450.00: the latest market bucket of TCGplayer's own price history for product 98585 (2026-09-28, 2 sales in the year), written into data/sealed.json. The box (98584) has no history either: `booster-box` at 36 packs ($16,200).

## Products
Built: Booster Box, the Mime Jr. (DP22) and Glameow (DP23) three-pack blisters (2 dp5 packs), the Manaphy two-pack blister (1 dp5 pack, POP 6 reprint not simulated), the Darkrai Premium Box (DP24; real contents were EX Crystal Guardians and EX Dragon Frontiers packs, a Secret Wonders theme deck and a jumbo, none of it a dp5 pack, so it opens as the DP24 promo alone at that promo's TCGplayer market price, $57.30: `price` plus `priceSource`). Left out: the Polar Frost (229132) and Forest Force (229134) theme decks (TCGplayer lists them but no card list exists and the holos are reprints) and the June 2008 Starter Blister Packs (contents not read).
Derived product prices are packs x the pack price plus nothing for the promo (build_products' `priceDerived: "packs"`), so a tin costs about four packs.
