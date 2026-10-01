# XY: Ancient Origins (xy7), built 2026-10-01 (builder b3)

English, 12 August 2015 (pokemontcg.io, Bulbapedia and TCGplayer group 1576 agree). 98 printed, 100 cards in packs (8 Rare Holo, 11 Rare Holo EX of which 3 Mega, 12 full art, 5 secret), plus the 3 promo cards of the priced products (data file 103, `totalCount` 100). Research: /mnt/project-files/every-era/xy/research/xy7.md, xy7-products.md.

## Data
- Cards: pkmn.gg `xy/ancient-origins`, scans scrydex `xy7-<n>` (checked: 1, Registeel, Sceptile-EX full art, Trainers' Mail secret, last card). 75a Hex Maniac (Rare Ultra, "A" stamp, 2018 copyright) is a prize print in no product: `skipNumbers`, scan not shipped.
- The five Rare Secret cards are the three shiny full arts (Primal Kyogre-EX 96, Primal Groudon-EX 97, M Rayquaza-EX 98, TCGplayer "Shiny Full Art", printed inside 98) and the two gold Trainers (99, 100). They share the one `secret` roll, uniform over the five.
- Wrappers: pokesymbols `ancient-origins-pack-0..3` (Hoopa Unbound, Shiny Mega Rayquaza, Shiny Primal Groudon, Mega Tyranitar), cut out in place.
- Foil maps: TCG Live key `xy7`. 36 of 36 holo prints have a map (8 Rare Holo, 11 EX, 12 full art, 5 secret) and all 3 promos (39 files), etch maps on the 17 full art and secret cards.
- Prices: tcgcsv group 1576, 101 of 101 singles. Booster pack $143.45; the booster box has no market price (low $8,233.99), so no `boosterBox` in data/sealed.json.

## Odds (per pack)
`xySlots({ holo: 0.1556, ex: 0.0808, megaEx: 0.0303, ultra: 0.0587, secret: 0.008 })`, no Energy. E2 sheet model against his own 28-box tally (holo 5.64, EX 4.11, full art 2.32 per box) and PokeBeach's 7 boxes (EX 4.71, full art 2.00, secret 0.43): medium; Mega split (3 of 11) and secret rate low. See data/pullrates.json.

## Products
Built: Shiny Rayquaza EX Box (XY69), Powers Beyond Tins Hoopa (XY71) and Latios (XY72), two Ancient Origins packs each (the real mix adds Roaring Skies and Primal Clash packs). Left out for no market price: the Elite Trainer Box (also the one product whose contents are inferred from other XY ETBs), both 3 Pack and both Single Pack Blisters (XY56 to XY59), both pin blisters, Tyrantrum EX Box (XY70), Rayquaza tin (XY73). Prerelease Gyarados XY60: event only, not built. Promo `foilAs`: `Rare Holo EX` for the Mirror EX promos.
