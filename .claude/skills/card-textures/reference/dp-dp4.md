# Diamond & Pearl: Great Encounters (dp4)

Built 2026-10-01 (builder d2). Research: `/mnt/project-files/every-era/dp/research/dp4.md`, `dp4-products.md`, `dpp-claims.md`, `second-source-check.md`, `dp-pack-structure.md`.
Release 2008-02-13 (Serebii and TCGplayer; pkmn.gg only gives the month). 106 cards (106 printed), plus the promos below, which are filed as `dp4-dppNN` and count under dpp.

## Cards
Rare Holo 11, LV.X 4 (103 Cresselia, 104 Darkrai, 105 Dialga, 106 Palkia); no secret, no Shining. Counts match pkmn.gg and the research table. Scans: scrydex (`dp4-<n>`), mirrored at the two sizes; I looked at the first card, a Rare Holo, the LV.X cards, a mid-set Common and the last card, plus a promo or two: all clean, none swapped. Singles from TCGplayer group (`fetch_tcgplayer_prices.py`; the Unown letter listings needed the norm() rules), a year of history from `backfill_prices.py`.

## Pack
Ten cards: 5 Commons, 3 Uncommons, a Mirror reverse (Common/Uncommon/Rare/Rare Holo), a rare slot; no Energy, no code card. `dpSlots`. Elite Fourum post 69's 216-pack table: holo 66/216 = .3056, LV.X 6/216 = .0278 (one a box); Flipside's LV.X 1:36 for the first sets. LV.X medium, holo split medium-low (no second tally). The 19 doubled reverse cards (Pachirisu holo among them) are not weighted: the reverse is uniform.

## Maps
TCG Live has no maps for the generation (40 keys probed by the scaffold agent: all 404); no foil maps are shipped. The cosmos holo, LV.X and Shining finishes come from the DP finish sheets (css/holo/dp*.css) over the scrydex scans, whose printed foil sparkle is already in the image.

## Wrapper
Darkrai, Palkia, Cresselia, Dialga (confirmed by Elite Fourum post 68 for the four names; wired to dp4-3, 26, 2, 16).
Wrapper art: pokesymbols.com `booster-pack-art/{slug}-pack-N.avif` (N 0-3; N>=4 is a 16,817-byte 404 stub). They are flat photos of the wrappers, opaque, with a sliver of white at some edges; `scripts/clean_pack_art.py` cut all four to `pack-N-v2` (a little art trimmed at the pinched sides of a few; the uncut downloads were never shipped). Logos from images.pokemontcg.io, symbols from pokesymbols.

## Prices
TCGplayer pack $323.33 market (low $599.99): thin, used as is. The box has no market price: it is the product `booster-box`, priced at 36 packs ($11,639.88).

## Products
Built: Booster Box (98544), the three 2008 Spring Collector's Tins (Dialga/Palkia/Darkrai LV.X, DP17-DP19, 4 packs opened as dp4), Magmortar (DP20) and Raichu (DP21) three-pack blisters (the two dp4 packs only), the Riolu two-pack blister (1 dp4 pack, POP 6 reprint not simulated). Left out: the three theme decks (Endless Night, Eternal Time, Infinite Space: no card lists and no price, the exclusive Dialga 16/106 and Palkia 26/106 holos are reprints), the Dialga LV.X and Palkia LV.X Constructed Standard Decks (one source, no list), the Porygon2 prerelease stamp promo (one TCGplayer listing, no kit contents).
Derived product prices are packs x the pack price plus nothing for the promo (build_products' `priceDerived: "packs"`), so a tin costs about four packs.
