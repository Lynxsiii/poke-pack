# XY: Evolutions (xy12), built 2026-10-01 (builder b5)

English, 2 November 2016. 108 printed; 104 cards in packs once the nine numbered basic Energy (91 to 99) are skipped (`skipNumbers`, scans not shipped), plus 34 promo cards of the priced products (data file 138, `totalCount` 104). Research: /mnt/project-files/every-era/xy/research/xy12.md, xy12-products.md.

## Data
- Cards: pkmn.gg `xy/evolutions`; scans scrydex `xy12-<n>` (checked: reprints of Base Set cards, Mega EX, BREAK, full arts, the five secrets 109 to 113). #109 has a bilingual name on TCGplayer, so `scripts/fetch_tcgplayer_prices.py` `norm()` now strips the Japanese part.
- Wrappers: pokesymbols `evolutions-pack-0..3` (Raichu is pack 0), cut out in place.
- Foil maps: TCG Live key `xy12`. 59 of 59 holo prints (including promos) have a map. The five secrets are non-holo-sheet prints and carry no map by design (they are uncommon-sheet cards).
- Prices: tcgcsv, every single priced; pack $70.07, box $2,579.99.

## Odds (per pack)
`xySlots({ holo: 0.1444, ex: 0.0713, megaEx: 0.0509, ultra: 0.0667, break: 0.0556, uncommonSecret: 0.124, commonEnergy: 0.372 })`. Sheet model from the Elite Fourum guide (30 boxes, 1,080 packs) cross-checked by Derium (2016 and 2020 tallies) and The PokeCapital. The five secrets are printed on the uncommon sheet, 15/121 per pack (low confidence: sheet model plus Flipside's "similar to uncommons"). Basic Energy sit on the commons sheet, 9/121 per common slot, about 0.37 per pack; the site deals the shared XY 2013 Energy print (art does not match the Evolutions Energy, accepted). BREAK takes the reverse slot.

## Products (26)
Two ETBs (Mega Charizard Y, Mega Blastoise), Prerelease Kit (4 packs; stamped promo not simulated), Braixen, Black Kyurem 3 pack blisters, Greninja and Weezing single blisters, two Pin Collections (all 3 packs Evolutions, real box has one random XY pack), five EX boxes (Charizard, Kangaskhan, Gengar via `from`, Dragonite, Mewtwo), Snorlax-GX box (via `from`), three Premium Collections (Beedrill, Salamence, Garchomp), BREAK Evolution Box Arcanine, Autumn 2016 Collector Chest, two Mythical Collections, two Kanto Power Collections (10 packs), two Alola Collections. Most unpriced products carry `priceDerived: "packs"`. Pack counts marked approximate where research does not document the real split.

## Oddities and open items
- Reprinted foil EX in the boxes are not simulated; Kanto Power promo numbers unresolved.
- Mythical Collection Magearna lists 7 promos (sources disagree on 6 or 7).
- build_set.py keeps skipNumbers cards in some paths and re-downloads pack art over cleaned files: rerunning it needs `git checkout assets/packs/xy12` and deleting the Energy rows by hand.
