# Diamond & Pearl: Legends Awakened (dp6)

Built 2026-10-01 (builder d2). Research: `/mnt/project-files/every-era/dp/research/dp6.md`, `dp6-products.md`, `dpp-claims.md`, `second-source-check.md`, `dp-pack-structure.md`.
Release 2008-08-20 (Serebii and TCGplayer; pkmn.gg only gives the month). 146 cards (146 printed), plus the promos below, which are filed as `dp6-dppNN` and count under dpp.

## Cards
Rare Holo 17, LV.X 7 (140 Azelf, 141 Gliscor, 142 Magnezone, 143 Mesprit, 144 Mewtwo, 145 Rhyperior, 146 Uxie); 28 Unown. Counts match pkmn.gg and the research table. Scans: scrydex (`dp6-<n>`), mirrored at the two sizes; I looked at the first card, a Rare Holo, the LV.X cards, a mid-set Common and the last card, plus a promo or two: all clean, none swapped. Singles from TCGplayer group (`fetch_tcgplayer_prices.py`; the Unown letter listings needed the norm() rules), a year of history from `backfill_prices.py`.

## Pack
Ten cards: 5 Commons, 3 Uncommons, a Mirror reverse (Common/Uncommon/Rare/Rare Holo), a rare slot; no Energy, no code card. `dpSlots`. Elite Fourum post 72: holo 60/216 = .2778, LV.X 12/216 = .0556 (two a box, seven LV.X); Flipside's 1:18 for the later sets and a search summary of two a box. LV.X medium, holo medium-low. Two reverse sheets (EF only): uniform reverse.

## Maps
TCG Live has no maps for the generation (40 keys probed by the scaffold agent: all 404); no foil maps are shipped. The cosmos holo, LV.X and Shining finishes come from the DP finish sheets (css/holo/dp*.css) over the scrydex scans, whose printed foil sparkle is already in the image.

## Wrapper
Giratina, Rhyperior, Luxray, Lucario (my reading from the art, one source; wired to dp6-4, 145, 8, 61).
Wrapper art: pokesymbols.com `booster-pack-art/{slug}-pack-N.avif` (N 0-3; N>=4 is a 16,817-byte 404 stub). They are flat photos of the wrappers, opaque, with a sliver of white at some edges; `scripts/clean_pack_art.py` cut all four to `pack-N-v2` (a little art trimmed at the pinched sides of a few; the uncut downloads were never shipped). Logos from images.pokemontcg.io, symbols from pokesymbols.

## Prices
tcgcsv lists no market price for the pack or the box. The pack is $462.94: the latest market bucket of TCGplayer's price history for product 98537 (2026-09-28, 10 sales in the year), in data/sealed.json. Box at 36 packs ($16,665.84).

## Products
Built: Booster Box, the Latias / Latios three-pack blister (2 dp6 packs; the POP 7 reprints are not simulated), the Mothim two-pack blister (1 dp6 pack), the Dialga (DP26) and Palkia (DP27) Premium Boxes (2 packs opened as dp6 plus the promo; the theme deck and jumbo are not simulated). Left out: the Metal Surge (693133) and Bombardment theme decks (no lists; the Regigigas holo of Bombardment is unconfirmed) and the August 2008 Diamond & Pearl Collection (contents not read).
Derived product prices are packs x the pack price plus nothing for the promo (build_products' `priceDerived: "packs"`), so a tin costs about four packs.
