# Expedition Base Set (ecard1)

Built 2026-10-01 (builder w4). Research: `/mnt/project-files/every-era/wotc/research/ecard1.md`, `ecard1-products.md`, `basep.md`, `box-contents.md`; `SCAFFOLD-NOTES.md`.
Release 2002-09-15. 165 cards (165 printed): Rare Holo 32, Rare 40, Uncommon 38, Common 49, Energy 6. `data/ecard1.json` holds 167 records: the two Scan-Tastic promos are filed as `ecard1-basep51` / `-basep52` (Wizards Black Star Promos, rarity "Promo", promoSeries `basep`) and are not in `totalCount` (they home to basep).

## Cards and scans
Scrydex scans (`ecard1-<n>`), mirrored at two sizes through `mirror_images.mirror_set()` called directly (the CLI would have mirrored shared and other sets' logos). Looked at the first card, the holos, a mid Common, the Energy and the last card: clean, no swaps. Rare Holo uses `foil-holo wotc-ecard`; the printed foil is in the scan, the finish sheet adds the e-Card holo look.

## Pack
Nine cards: 5 Commons (one of which is the holo slot: `commonHolo` holo 0.3333), 2 Uncommons, a reverse holo (`reverseSlot`, Common/Uncommon/Rare/Rare Holo), a guaranteed plain Rare. No 1st Edition, no basic Energy in packs. Elite Fourum's sheet model (72/216 packs holo), PSA 9581/9747, WotC's "1 in 3 foil", Flipside 1:3. Sources in `data/pullrates.json`.

## Wrapper
Feraligatr, Venusaur, Charizard, Blastoise (art `pack-0..3`, pokesymbols `booster-pack-art/expedition-pack-N.avif`; names matched by looking at each file). Vintage tight photos: `clean_pack_art.py` (modern silhouette template) was not used; the downloads are shipped as they are.

## Prices
TCGplayer singles by group 1375 (`fetch_tcgplayer_prices.py`), a year of history from `backfill_prices.py`. The pack: TCGplayer lists it only at a $4,800 low with no market price, so `data/sealed.json` carries PriceCharting's sealed $1,499.99 (a thin market). The box has no TCGplayer price: product `booster-box` priced at 36 packs.

## Products
Booster Box (36 packs; the four e-Card box toppers are not simulated) and Scan-Tastic Spectacular Promo Pack (Nintendo Power, TCGplayer 477048, group 1418): no packs, basep51 Rapidash and basep52 Ho-oh. Theme decks left out (no card lists, no prices).
