# Sun & Moon (sm1): sources and decisions

English, released 2017-02-03, 149 printed, 163 numbered. data/sm1.json holds 178 cards (14 box promos filed as `sm1-smpNNN`, 1 box-only `a` reprints). Research: /mnt/project-files/sun-moon/research/sm1.md (pack structure, rates, products, wrappers), cross-checked by second-source-check.md there.

## Pack and odds
Energy (sm17 print, never reverse), 5 Common, 3 Uncommon, 1 reverse holo (Common/Uncommon/Rare/Rare Holo, no special cards), 1 rare slot. Code card not simulated. Plain Rare is exactly 2/3 of rare slots, holo or better 1/3 (E2 360-pack sequence), so holo is the remainder. `smSlots({ holo: 0.1567, gx: 0.1114, ultra: 0.0421, rainbow: 0.0139, secret: 0.0092 })`.
Sources (data/pullrates.json has the full text): Elite Fourum, sturzflugbombardieru's rarity guide box-ratio table https://www.elitefourum.com/t/39762/140 and its sm1 post; burpies' tally https://www.elitefourum.com/t/25220 (YouTube/Twitch packs); Derium and Danny Phantump through the first. The tallies are independent datasets that all reach us through one forum (two or more, one aggregator). Rainbow vs gold is split by the sheet model (only burpies measures it). ThePriceDex and PullRates.com are modelled from the same sheet and were not used. Pack structure sources: TCGplayer product text (mp-search-api.tcgplayer.com), ToyWiz copy, Bulbapedia Booster pack (TCG) ("one Basic Energy card in addition to the 10 other cards"), wrapper print "10 ADDITIONAL GAME CARDS". `energyPrint: "sm17"` (the 2019 redesign starts with Team Up, Bulbapedia Basic Fire Energy (TCG)).
Card pools: Rare 17, Rare Holo 16, Rare Holo GX 11, Rare Ultra 12 (8 full-art GX + 4 full-art Trainers), Rare Rainbow 8, Rare Secret 6 (two of them Energy).

## Energy, reprints, oddities
pkmn.gg lists nine unnumbered 2017 basic Energy as sm1 #164-172 (rarity Common). They are the pack Energy, which the site deals as its shared sm17 prints, so `skipNumbers` leaves them out of data/sm1.json (164 of pkmn.gg's 173 entries). TCGplayer files them as "(2017 Unnumbered)".
`101a` Eevee is the Cosmos holo of the Espeon/Umbreon GX Premium Collections; kept with `promo: true` (out of pack pools), `foilAs: Rare Holo`, no map. TCG Live has a foil map for sm1 #1 Caterpie, but it is the reverse-holo pattern map of a plain Common, not a foil print: dropped (fetch_foil_maps.py stamps it again on every run; remove `foilMap` from sm1-1 and delete assets/foil/maps/sm1/1.webp).

## Foil maps (TCG Live, key `sm1`; promos `smbsp`)
Rare Holo 16/16, Rare Holo GX 11/11, Rare Ultra 12/12 (with etch), Rare Rainbow 8/8 (etch), Rare Secret 6/6 (etch), promos 14/14 (no etch). No map: 101a, every Common/Uncommon/Rare (not foil).

## Prices
TCGplayer group via tcgcsv; 164/164 set cards priced; 14 of 16 promo cards (smp008 Litten and smp014 Lycanroc-GX have no priced product: TCGplayer has no market price for the Litten 3 Pack Blister 126054 or the Lycanroc GX Box 131865). Sealed: booster pack and box from data/sealed.json (ETB filed as product `elite-trainer-box`, 8 packs, not `eliteTrainerBox`, which the engine deals as 9).

## Products built
- Sun & Moon Elite Trainer Box [Solgaleo] (8 packs)
- Sun & Moon Elite Trainer Box [Lunala] (8 packs)
- Sun & Moon Prerelease Kit (4 packs, promos smp010, smp011, smp012, smp013)
- Sun & Moon Single Blister Pack [Rockruff] (1 packs, promos smp006)
- Sun & Moon Single Blister Pack [Pikipek] (1 packs, promos smp007)
- Sun & Moon Base Set 3 Pack Blister [Togedemaru] (3 packs, promos smp009)
- Zygarde Complete Forme Pin Collection (3 packs, promos smp015)
- Mimikyu Pin Collection (3 packs, promos smp029)
- Legends of Alola Tin [Solgaleo GX] (4 packs, promos smp016)
- Legends of Alola Tin [Lunala GX] (4 packs, promos smp017)
- Spring 2017 Collector's Chest Tin (5 packs, promos smp022, smp023, smp024)
- Sun & Moon GX Challenge Box [Incineroar] (2 packs)
- Sun & Moon GX Challenge Box [Decidueye] (2 packs)
- Sun & Moon GX Challenge Box [Primarina] (2 packs)

Promo finishes (`foilAs`) were read from the TCG Live `smbsp` foil map of each number (window map: Rare Holo; GX: Rare Holo GX; whole-card map with art: Rare Ultra). Promo scans are scrydex `smp-SM06` (two digits under 100, `promoSeries.smp.scrydexKey`), build_products.py `promoSeries` knows it.
