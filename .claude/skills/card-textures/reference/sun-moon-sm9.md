# Team Up (sm9), built 2026-09-30

English, 1 February 2019. 181 printed, 196 cards in packs (19 Rare Holo, 11 GX of which 5 TAG TEAM, 4 Prism Star, 23 full art, 10 rainbow, 5 gold), plus the 8 promo cards of its sealed products (totalCount 204, as the other sets count). The first TAG TEAM GX set. Research: /mnt/project-files/sun-moon/research/sm9.md.

## Data
- Cards: pkmn.gg `sun-moon/team-up`, scans scrydex `sm9-<n>`. pkmn.gg lists 198, not the 196 real cards: the two extras are 152a and 152b Pokémon Communication (2020 International Championships promo, Trainer's Toolkit exclusive; Bulbapedia Team Up (TCG) set list), which no pack holds and the printed total does not count. `skipNumbers` in data/sets/sm9.json keeps them out. The research's "196 total" (pokemontcg.io, tcgdex) agrees.
- Wrappers: pokesymbols `team-up-pack-0..3` (Eevee & Snorlax, Gengar & Mimikyu, Pikachu & Zekrom, Venusaur & Celebi), opaque, shipped as `pack-N-v2` after clean_pack_art.py.
- Foil maps: TCG Live key `sm9`, numbers match. 72 of 72 holo prints have a map (19 Rare Holo, 11 GX, 4 Prism Star, 23 full art, 10 rainbow, 5 gold); etch maps on the 38 full art, rainbow and gold cards. Plain Rares have none. Promo maps from `smbsp`: all 8, etch only on the two TAG TEAM tin full arts (smp167, smp169). No swaps (check_foil_maps.py flags only same-drawing rainbow and full-art pairs).
- Prices: tcgcsv group 2377, 196 of 196 singles (Prism Star diamond rule in `norm()`).
- Energy print: `sm19` (the 2019 design starts with Team Up: Bulbapedia Basic Fire Energy (TCG); TCGplayer group 2377 lists the nine "Energy (2019 Unnumbered)" products, Lost Thunder's group does not).

## Odds (per pack)
`smSlots({ holo: 0.1667, gx: 0.102, ultra: 0.0425, rainbow: 0.0136, secret: 0.0102, reverseSpecial: [["prismStar", 0.0562]] })`, Energy 1, 5 Common, 3 Uncommon, reverse 1 (a Prism Star replaces it 1 pack in 18), rare slot 1. Sources: Elite Fourum burpies https://www.elitefourum.com/t/25220 (872 packs) and sturzflugbombardieru https://www.elitefourum.com/t/39762/151 (own 2,016 full-box packs, pooled with Derium 2,999 and Danny Phantump): 5,887 packs. Burpies is the low outlier on secret rares (1.72% against 2.3 to 2.7%); the pool is used. No source splits TAG TEAM from single GX in pulls, so the `gx` roll is uniform over the 11 regular GX cards and the `rareUltra` roll over the 23 full arts. Holo 1 in 6 is one tally. Full text in data/pullrates.json.

## Products (Elite Trainer Box and 7 more built)
ETB is 8 packs, filed as `elite-trainer-box` (kind etb, TCGplayer 181704). Build & Battle Box (smp158 to 161, pick 1, TCGplayer 183975, the Prerelease Kit), Pikachu (smp162) and Mimikyu (smp163) single blisters, TAG TEAM Tins Celebi & Venusaur (smp167) and Eevee & Snorlax (smp169). Configured but left out by build_products.py because TCGplayer has no market price: Deoxys and Ultra Necrozma 3 Pack Blisters (smp164, smp165), Gyarados and Raichu Premium Checklane Blisters, Towering Splash-GX Box (smp166), Melmetal-GX Box (smp177, smp178), Pikachu & Zekrom TAG TEAM Tin (smp168). Tin and box pack mixes are undocumented ("pack mix approximate": the set's own packs).
Promo finish (`foilAs`): B&B and blister Pokémon `Rare Holo`, Meltan `Rare Holo`; Towering Splash, the three TAG TEAM tin cards and Melmetal-GX are full arts (checked on the scans), so `Rare Ultra`.

## Oddities
- Prices are TCGplayer's: a Team Up pack is $300.96, the box $11,725.00, the ETB $4,000.00.
