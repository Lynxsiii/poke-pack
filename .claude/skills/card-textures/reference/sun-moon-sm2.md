# Guardians Rising (sm2): sources and decisions

English, released 2017-05-05, 145 printed, 169 numbered. data/sm2.json holds 198 cards (18 box promos filed as `sm2-smpNNN`, 11 box-only `a` reprints). Research: /mnt/project-files/sun-moon/research/sm2.md (pack structure, rates, products, wrappers), cross-checked by second-source-check.md there.

## Pack and odds
Energy (sm17), 5 Common, 3 Uncommon, 1 reverse holo, 1 rare slot. Code card not simulated. Plain Rare is exactly 2/3 of rare slots, holo or better 1/3 (E2 360-pack sequence), so holo is the remainder. `smSlots({ holo: 0.1577, gx: 0.1112, ultra: 0.0417, rainbow: 0.0142, secret: 0.0085 })`.
Sources (data/pullrates.json has the full text): Elite Fourum, sturzflugbombardieru's rarity guide box-ratio table https://www.elitefourum.com/t/39762/140 and its sm2 post; burpies' tally https://www.elitefourum.com/t/25220 (YouTube/Twitch packs); Derium and Danny Phantump through the first. The tallies are independent datasets that all reach us through one forum (two or more, one aggregator). Rainbow vs gold is split by the sheet model (only burpies measures it). ThePriceDex and PullRates.com are modelled from the same sheet and were not used. Pack structure sources: TCGplayer product text (mp-search-api.tcgplayer.com), ToyWiz copy, Bulbapedia Booster pack (TCG) ("one Basic Energy card in addition to the 10 other cards"), wrapper print "10 ADDITIONAL GAME CARDS". `energyPrint: "sm17"` (the 2019 redesign starts with Team Up, Bulbapedia Basic Fire Energy (TCG)).
Card pools: Rare 25, Rare Holo 15, Rare Holo GX 12, Rare Ultra 15 (12 full-art GX + Hala, Hau, Mallow), Rare Rainbow 15 (Decidueye, Incineroar and Primarina GX among them, SM1 cards), Rare Secret 9.

## Energy, reprints, oddities
No own basic Energy in the checklist (the three Energy among the gold cards are Rare Secret).
Eleven `a` cards are not in packs (19a Alolan Sandshrew, 21a Alolan Vulpix, 51a Garbodor, 60a Tapu Lele-GX alt art, 92a Sylveon-GX, 121a/124a/125a/128a/130a Uncommon reverse-holo reprints, 157a Metagross-GX): `promo: true`, `foilAs` from the real print (Rare Holo for the window holos, Rare Holo GX, Rare Ultra; the five trainer reverse prints stay unset). 60a, 92a and 157a point at their original card's foil/etch map (same art, no extra file). Theme-deck holos Lunala 61 and Solgaleo 87 are short-printed in the real packs; ignored.

## Foil maps (TCG Live, key `sm2`; promos `smbsp`)
Rare Holo 15/15, Rare Holo GX 12/12, Rare Ultra 15/15 (etch), Rare Rainbow 15/15 (etch), Rare Secret 9/9 (etch), promos 18/18 (etch: SM37, SM38).

## Prices
TCGplayer group via tcgcsv; 180/180 set cards (an `a` card takes its original's listing); 18 of 19 promo numbers (SM39 Primarina-GX has no priced product: Primarina GX Premium Collection 133805 has no market price). Sealed: booster pack and box from data/sealed.json (ETB filed as product `elite-trainer-box`, 8 packs, not `eliteTrainerBox`, which the engine deals as 9).

## Products built
- Guardians Rising Elite Trainer Box (8 packs)
- Guardians Rising Prerelease Kit (4 packs, promos smp018, smp019, smp020, smp021)
- Guardians Rising Single Pack Blister [Lurantis] (1 packs, promos smp025)
- Guardians Rising Single Pack Blister [Tsareena] (1 packs, promos smp026)
- Guardians Rising 3 Pack Blister [Turtonator] (3 packs, promos smp027)
- Guardians Rising 3 Pack Blister [Vikavolt] (3 packs, promos smp028)
- Guardians Rising Single Pack Blister [Alolan Persian] (1 packs)
- Tapu Koko Figure Collection (4 packs, promos smp030)
- Tapu Koko Pin Collection (3 packs, promos smp031)
- Island Guardians Tin [Tapu Koko GX] (4 packs, promos smp033)
- Island Guardians Tin [Tapu Bulu GX] (4 packs, promos smp032)
- Bewear GX Box (4 packs, promos smp034)
- Decidueye GX Premium Collection (6 packs, promos smp037)
- Incineroar GX Premium Collection (6 packs, promos smp038)
- Espeon GX Premium Collection (6 packs, promos smp035)
- Umbreon GX Premium Collection (6 packs, promos smp036)
- Shiny Tapu Koko GX Box (4 packs, promos smp050)
- Solgaleo GX Challenge Box (2 packs)
- Lunala GX Challenge Box (2 packs)

Promo finishes (`foilAs`) were read from the TCG Live `smbsp` foil map of each number (window map: Rare Holo; GX: Rare Holo GX; whole-card map with art: Rare Ultra). Promo scans are scrydex `smp-SM06` (two digits under 100, `promoSeries.smp.scrydexKey`), build_products.py `promoSeries` knows it.
