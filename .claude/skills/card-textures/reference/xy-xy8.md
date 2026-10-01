# XY: BREAKthrough (xy8), built 2026-10-01 (builder b3)

English, 4 November 2015 (pokemontcg.io, Bulbapedia and TCGplayer group 1661 agree). 162 printed, 164 cards in packs (16 Rare Holo, 6 BREAK, 8 Rare Holo EX of which 4 Mega, 10 full art, 2 gold secret), plus the 8 promo cards of the priced products (data file 172, `totalCount` 164). Research: /mnt/project-files/every-era/xy/research/xy8.md, xy8-products.md.

## Data
- Cards: pkmn.gg `xy/breakthrough`, scans scrydex `xy8-<n>` (checked: 1, Hippopotas, Chesnaught BREAK, Raichu BREAK, Mewtwo-EX gold 164, the Mega Mewtwo and Houndoom EX). 146a Professor's Letter (A stamp, 2018 copyright) is a prize print in no product: `skipNumbers`, scan not shipped.
- BREAK scans come from scrydex upright-rotated: the card is printed landscape and the scan is the portrait page with the text running up the side; the TCG Live maps follow the same orientation (checked by overlay), the finish agents should know.
- Wrappers: pokesymbols `breakthrough-pack-0..3` (Mega Mewtwo X, Mega Mewtwo Y, Mega Houndoom, Zoroark BREAK, from the research's Bulbapedia table; the second wrapper looks to me like plain Mewtwo and the first like a Mega Mewtwo, unresolved).
- Foil maps: TCG Live key `xy8`. 42 of 42 holo prints have a map (16 Rare Holo, 6 BREAK, 8 EX, 10 full art, 2 secret) and 7 promos (49 files); etch maps on the 12 full art and secret cards. No holo print lacks a map.
- Prices: tcgcsv group 1661, 165 of 165 singles. Pack $64.50, box $3,248.29.

## Odds (per pack)
`xySlots({ holo: 0.1778, ex: 0.0444, megaEx: 0.0444, ultra: 0.0587, secret: 0.008, break: 0.0778 })`: BREAK takes the reverse slot (E2 post 131-132, PokeBeach box report 1025, Elite Fourum thread 30934, Dripshop): a pack can hold a BREAK and an EX together. E2 model against his own 30-box tally (1,080 packs), Danny Phantump and Derium (1,008 packs): high for holo, EX, full art and BREAK; Mega split and secret low. See data/pullrates.json.

## Products
Built: Elite Trainer Boxes [Mewtwo X] and [Mewtwo Y] (8 packs; the TCGplayer photo is a 200 px contents layout, so the box is cropped out of it), Jirachi single blister (XY67), Collector Chest (XY88 to XY90), Mega Mewtwo Collection X (XY100), Mega Aerodactyl EX Premium Collection (XY97 to XY99; XY99 is a non-holo Tool, no `foilAs`). Left out for no market price (all configured, so a rerun adds them when TCGplayer prices them): Sableye and Celebi 3 Pack Blisters, Hawlucha blister, the pin blisters and Zoroark pin collection, Blaziken and Swampert Premium Collections (XY86, XY87), both Legendary Collections (XY74 to XY85, Rare Ultra full arts and EX), Mega Mewtwo Collection Y (XY101), Aurorus EX Box (XY102), BREAK Evolution Box [Empoleon] (XY134 to XY136, `Rare BREAK`). XY54 and XY55 are filed under xy6's Hoenn Power Tins, not repeated here. Prerelease Chesnaught XY68: event only, not built.
