# Unbroken Bonds (sm10), built 2026-09-30

English, 3 May 2019. 214 printed, 234 cards in packs (22 Rare Holo, 14 GX, 24 full art, 14 rainbow, 6 gold), plus the 11 promo cards of its sealed products (totalCount 245, as the other sets count). Research: /mnt/project-files/sun-moon/research/sm10.md.

## Data
- Cards: pkmn.gg `sun-moon/unbroken-bonds`, scans scrydex `sm10-<n>`. pkmn.gg lists 238; the four extras are prize reprints with a League Cup / Regional Championships stamp printed beside the real cards (182a and 182b Pokégear 3.0, 189a Welder, 195a Dedenne-GX), which no pack holds and the printed total does not count. `skipNumbers` in data/sets/sm10.json keeps them out (build_set.py).
- Wrappers: pokesymbols `unbroken-bonds-pack-0..3` (Machamp & Marshadow, Reshiram & Charizard, Gardevoir & Sylveon, Lucario & Melmetal), opaque, so shipped as `pack-N-v2` after clean_pack_art.py.
- Foil maps: TCG Live key `sm10`, numbers match, no swaps (every map overlaid on its scan). 80 of 80 holo prints have a map (22 Rare Holo, 14 GX, 24 full art, 14 rainbow, 6 gold), etch maps on the 44 full art, rainbow and gold cards. Plain Rares have none (not foil). Promo maps from `smbsp`: all 11.
- Prices: tcgcsv group 2420, 234 of 234 singles. `Fairy Charm L` (TCGplayer) is our Fairy Charm Lightning: a rule in `norm()` of fetch_tcgplayer_prices.py.

## Odds (per pack)
`smSlots({ holo: 0.1667, gx: 0.0985, ultra: 0.0411, rainbow: 0.0144, secret: 0.0091 })`, Energy 1 (`sm19`), 5 Common, 3 Uncommon, reverse 1 (never a Prism Star: there is none in the set), rare slot 1. Sources (all one forum, five separate tallies): Elite Fourum burpies https://www.elitefourum.com/t/25220 (3,888 packs) and sturzflugbombardieru https://www.elitefourum.com/t/39762/153 (own 2,845 full-box packs pooled with Derium 1,080, TheGameCapital 2,592, Danny Phantump); 10,405 packs in all. Pack shape: TCGplayer booster box text ("10 cards and 1 basic Energy"), Bulbapedia Booster pack (TCG). Holo 1 in 6 is one tally (his own; ThePriceDex agrees but derives from it). Rainbow and gold split 62:38 as counted (96 and 60 cards in 6,517 packs), not 14:6 by card.

## Products (10 built)
ETB is 8 packs, filed as `elite-trainer-box` (kind etb) because the standard `eliteTrainerBox` in SEALED_PRODUCTS is 9 packs (see the report). Priced from the listing's mid price, it has no market price. Build & Battle Box (smp179 to 182, pick 1), Typhlosion 3 Pack Blister (smp185), Eevee (smp184) and Pikachu (smp183) single blisters, Sceptile 3 Pack Blister (reprint promo only), Alolan Marowak-GX Box (smp187), Kangaskhan-GX Box (smp188), Blastoise-GX Premium Collection (smp189), Reshiram & Charizard-GX Figure Collection (smp201). Left out: Steelix and Wailord blisters (no TCGplayer price), the hanger box (one source). Pack mixes of the boxes are approximate where noted: one retailer listing each, never two.
Promo finish (`foilAs`): holo Pokémon `Rare Holo`; Marowak and Kangaskhan `Rare Holo GX`; Blastoise-GX and Reshiram & Charizard `Rare Ultra` (TCG Live has an etch map for both).
