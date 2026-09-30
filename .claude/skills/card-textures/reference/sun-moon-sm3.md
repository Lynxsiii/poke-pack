# Burning Shadows (sm3): sources and decisions

English, released 2017-08-04, 147 printed, 169 numbered. data/sm3.json holds 191 cards (14 box promos filed as `sm3-smpNNN`, 8 box-only `a` reprints). Research: /mnt/project-files/sun-moon/research/sm3.md (pack structure, rates, products, wrappers), cross-checked by second-source-check.md there.

## Pack and odds
Energy (sm17), 5 Common, 3 Uncommon, 1 reverse holo, 1 rare slot. Code card not simulated. Plain Rare is exactly 2/3 of rare slots, holo or better 1/3 (E2 360-pack sequence), so holo is the remainder. `smSlots({ holo: 0.1579, gx: 0.1098, ultra: 0.0424, rainbow: 0.0137, secret: 0.0095 })`.
Sources (data/pullrates.json has the full text): Elite Fourum, sturzflugbombardieru's rarity guide box-ratio table https://www.elitefourum.com/t/39762/140 and its sm3 post; burpies' tally https://www.elitefourum.com/t/25220 (YouTube/Twitch packs); Derium and Danny Phantump through the first. The tallies are independent datasets that all reach us through one forum (two or more, one aggregator). Rainbow vs gold is split by the sheet model (only burpies measures it). ThePriceDex and PullRates.com are modelled from the same sheet and were not used. Pack structure sources: TCGplayer product text (mp-search-api.tcgplayer.com), ToyWiz copy, Bulbapedia Booster pack (TCG) ("one Basic Energy card in addition to the 10 other cards"), wrapper print "10 ADDITIONAL GAME CARDS". `energyPrint: "sm17"` (the 2019 redesign starts with Team Up, Bulbapedia Basic Fire Energy (TCG)).
Card pools: Rare 25, Rare Holo 13, Rare Holo GX 12, Rare Ultra 19 (13 full-art GX + 6 full-art Trainers), Rare Rainbow 13, Rare Secret 9.

## Energy, reprints, oddities
No own basic Energy in the checklist.
Eight `a` cards are not in packs (18a Charmander, 39a Tapu Fini-GX, 88a Darkrai-GX alt art, 92a Kirlia, 105a Porygon-Z, 112a Acerola, 115a Guzma, 116a Kiawe): `promo: true`, same treatment as sm2. sm3 #18 Charmander also carries a TCG Live reverse-pattern map that is not a foil print: dropped as for sm1 #1. Theme-deck holos Alolan Ninetales 28 and Lycanroc 76 are short-printed in real packs; ignored.

## Foil maps (TCG Live, key `sm3`; promos `smbsp`)
Rare Holo 13/13, Rare Holo GX 12/12, Rare Ultra 19/19 (etch), Rare Rainbow 13/13 (etch), Rare Secret 9/9 (etch), promos 14/14 (etch: SM60 full-art Charizard-GX).

## Prices
TCGplayer group via tcgcsv; 177/177 set cards; 14 of 18 promo numbers (SM41 Komala, SM57 Ho-Oh-GX, SM65 Alolan Raichu and SM71 Kommo-o-GX sit in products with no TCGplayer market price: 136598, 148418, 155504, 153454). Sealed: booster pack and box from data/sealed.json (ETB filed as product `elite-trainer-box`, 8 packs, not `eliteTrainerBox`, which the engine deals as 9).

## Products built
- Burning Shadows Elite Trainer Box (8 packs)
- Burning Shadows Prerelease Kit (4 packs, promos smp046, smp047, smp048, smp049)
- Burning Shadows Single Pack Blister [Jangmo-o] (1 packs, promos smp040)
- Burning Shadows 3 Pack Blister [Cosmog] (3 packs, promos smp042)
- Burning Shadows 3 Pack Blister [Alolan Meowth] (3 packs, promos smp043)
- Tsareena GX Box (4 packs, promos smp056)
- Charizard GX Premium Collection (6 packs, promos smp060)
- Team Skull Pin Collection (5 packs, promos smp062, smp063)
- Mysterious Powers Tin [Necrozma GX] (4 packs, promos smp058)
- Mysterious Powers Tin [Marshadow GX] (4 packs, promos smp059)
- Alolan Ninetales GX Challenge Box (2 packs)
- Lycanroc GX Challenge Box (2 packs, promos smp014)

Promo finishes (`foilAs`) were read from the TCG Live `smbsp` foil map of each number (window map: Rare Holo; GX: Rare Holo GX; whole-card map with art: Rare Ultra). Promo scans are scrydex `smp-SM06` (two digits under 100, `promoSeries.smp.scrydexKey`), build_products.py `promoSeries` knows it.
