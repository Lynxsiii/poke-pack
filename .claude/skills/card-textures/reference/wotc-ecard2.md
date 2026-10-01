# Aquapolis (ecard2)

Built 2026-10-01 (builder w4). Research: `/mnt/project-files/every-era/wotc/research/ecard2.md`, `ecard2-products.md`, `box-contents.md`; `SCAFFOLD-NOTES.md`.
Release 2003-01-15. 182 cards (147 printed + 32 numbered holos H1-H32 + 3 Crystal): Rare Holo 32, Rare 48, Uncommon 48, Common 51, Rare Crystal 3 (148 Kingdra, 149 Lugia, 150 Nidoking via `rarityOverrides`). TCGdex's a/b e-reader variants of Golduck, Drowzee, Mr. Mime and Porygon are one card each (`skipNumbers: ["103b"]`; the "a" listing is the card).

## Scans
Scrydex (`ecard2-<n>`, `ecard2-H<n>`), mirrored at two sizes. Checked the first card, holos, Crystals, a Common and the last: clean, none swapped. Crystal finish `wotc-crystal`; Aquapolis Crystals have no reverse print so `reverseRarities` is Common/Uncommon/Rare only.

## Pack
Nine cards as ecard1; commonHolo holo 0.3061, crystal 0.0273 (Elite Fourum sheet model: Crystal Types x3 on the 110-position holo sheet, 3/110; checked against Flipside 1:36, a 7-box tally of 1.0 a box, PSA 9721). Medium confidence; the holo split is medium-low. Sources in `data/pullrates.json`.

## Wrapper
Tyranitar, Entei, Scizor, Arcanine (pokesymbols `aquapolis-pack-N`). Shipped uncut.

## Prices
TCGplayer group 1397 singles; the H01 style numbers map through `numKey`, and `fetch_tcgplayer_prices.py` got Greek-letter and `H08/H32` handling plus a reverse-holo fallback and the `050a/147` to "a" listing rule. Pack: TCGplayer's one recorded sale $1,999.99 (PriceCharting sealed $1,033.15, not used: a single sale is thin and is the oddity to know). Box: `booster-box` at 36 packs.

## Products
Booster Box only (box toppers, theme decks left out: no lists, no prices).
