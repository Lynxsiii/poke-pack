# XY: Roaring Skies (xy6), built 2026-10-01 (builder b3)

English, 6 May 2015 (pokemontcg.io, Bulbapedia and TCGplayer group 1534 agree). 108 printed, 110 cards in packs (10 Rare Holo, 11 Rare Holo EX of which 4 Mega, 11 full art, 2 secret), plus the 2 promo cards of the products TCGplayer prices (data file 112, `totalCount` 110: promos are counted under xyp). Research: /mnt/project-files/every-era/xy/research/xy6.md, xy6-products.md.

## Data
- Cards: pkmn.gg `xy/roaring-skies`, scans scrydex `xy6-<n>` (checked by eye: 1, a Rare Holo, Gallade-EX and M Gallade-EX, Shaymin-EX, the two secrets; no crooked crops or white edges). pkmn.gg lists 112; 77a (Shaymin-EX, Rare Ultra) and 92a (Trainers' Mail) are Play! Pokemon prize prints with the "A" stamp and a 2017-2018 copyright, in no product (claims table, research) so `skipNumbers` leaves them out and their scans are not shipped.
- Wrappers: pokesymbols `roaring-skies-pack-0..3` (Mega Gallade, Mega Latios, Mega Rayquaza, Deoxys; Bulbapedia Booster pack (TCG) XY table plus the card art), tight photos of the wrapper, cut out with clean_pack_art.py in place (never live before, so no -v2).
- Foil maps: TCG Live key `xy6`, numbers match the set. 36 of 36 holo prints have a map (10 Rare Holo, 11 EX, 11 full art, 2 secret), etch maps on the 13 full art and secret cards. Promos: both. Plain Rares have none. Overlaid on a few scans: windows line up.
- Prices: tcgcsv group 1534, 112 of 112 singles. Booster pack $78.12, box $4,280.92 (TCGplayer market).

## Odds (per pack)
`xySlots({ holo: 0.1556, ex: 0.0707, megaEx: 0.0404, ultra: 0.0587, secret: 0.008 })`: 5 Common, 3 Uncommon, 1 reverse, 1 rare slot, no basic Energy (E2 sheet tables; Bulbapedia Booster pack (TCG): Energy only from Sun & Moon; wrapper "10 ADDITIONAL GAME CARDS"). E2's sheet model (plain Rare 240 of 360) against his own 31-box tally (holo 5.48, EX 4.06, full art 2.42 per box) and PokeBeach's box thread (9 boxes: EX 3.67, full art 2.11, secret 0.33): medium. The Mega share of the EX roll is the card share (4 of 11), low confidence. Full text in data/pullrates.json.

## Products
Built (TCGplayer has a market price): Elite Trainer Box (`elite-trainer-box`, 98028, 8 packs, $7,899.99), Mega Latios pin blister (1 pack), Dragonite pin 3 pack blister (2 packs), Hoenn Power Tins Sceptile (xyp053) and Blaziken (xyp054), pack mixes from retail extracts so only the set's own packs shown. Left out for no market price: both 3 Pack Blisters (XY49 Regirock, XY50 Pangoro), the Rayquaza pin blister, the Swampert tin (XY55), Mega Absol EX Premium Collection (XY62, XY63), Rayquaza EX Box (XY66), Mega Rayquaza (XY64) and Mega Latios (XY65) Collections. No TCGplayer product at all: the Heliolisk and Meowstic single blisters (XY47, XY48). Prerelease Altaria XY46 has no product (event only), not built. Promo finish `foilAs`: Cosmos holos `Rare Holo`, Mirror EX promos `Rare Holo EX`. Theme decks (Aurora Blast, Storm Rider) are b6's.

## Oddities
- Prices are TCGplayer's, never rounded. Wrapper cut-outs come from low-resolution photos (about 360 px wide).
