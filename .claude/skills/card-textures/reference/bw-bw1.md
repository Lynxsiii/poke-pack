# Black & White: Black & White (bw1)

Built 2026-10-01 (builder c1). Research: `/mnt/project-files/every-era/bw/research/bw1.md`, `bw1-products.md`, `bwp-claims.md`, `second-source-check.md`, `theme-decks.md`.
Released 2011-04-25 (pokemontcg.io, pkmn.gg and Bulbapedia agree). 114 printed, 115 with the secret Pikachu, plus 3 theme-deck Cracked Ice reprints = `totalCount` 118 (the 14 `bw1-bwpNNN` promos home to `bwp`). Series `black-white`, `era: "bw"`, scrydex `bw1`, TCGplayer group 1400, wrapper art `black-and-white` (pokesymbols).

## Pack
Ten cards (5 Common, 3 Uncommon, 1 reverse, 1 rare slot), no Energy slot (Bulbapedia Booster pack page, ToyWiz "[10 Cards]", wrapper text, Elite Fourum #99). `bwSlots({ holo: .2639, ultra: .0556, secret: .0139, commonEnergy: .4444 })`: full art 1/18 (EF 12/216 + PokeBeach "2 per box, one of each" + Flipside 1:36 read per card), secret Pikachu 1/72 (EF 7 in 14 boxes + Flipside; PokeBeach's 2011 "1 in 108" dissents), holo medium-high.
The eight basic Energy 105-112 are the set's own cards (`energyPrint: "own"`, rarity "Energy"), printed once each on the commons sheet (EF only). The research gives "about 1 pack in 18 each": 8/18 = 0.444 a pack, one common slot rolling [common, energy]. Low confidence, no tally. A reverse Energy is not dealt (the engine's reverse pool excludes Energy; EF models one, pkmn.gg shows only Lightning).
Reverse pool `["Common","Uncommon","Rare","Rare Holo"]`.

## Scans
scrydex, 115 of 115. Checked by eye: 1, 5, 26, 47, 71, 113, 114, 115. **Energy 105, 106 and 112 on scrydex (and pokemontcg.io) are the Pokemon League stamped prints** (the League logo bottom right); the pack prints have no stamp. Replaced with pkmn.gg's `bw1-105v2` etc. (clean 599x836 scans of the unstamped Normal variant, the TCGplayer ids 85881, 85466, 87352), `imageRemote` points at them. Energy 107-111 are unstamped on scrydex.

## Maps
TCG Live key `bw1`: 15 of 15 foil prints have a map (12 Rare Holo, 113, 114, 115), no extras. Overlaid on scans (Serperior, Reshiram, Zoroark, Pikachu): art windows line up; Pikachu's map follows the art and the bolt shape. 113, 114 and 115 also ship **etch maps** although Bulbapedia calls the first-set full arts untextured: the finish agents decide (bwEtched() excludes bw1-bw3 today).
The 11 promos filed under bw1 also have bwbsp maps (all but the three non-holo BW14-16).

## Products (15 configured, all built)
Packs of bw1 only where the real packs were bw1.
- New Legends Tins [Reshiram] 98615 / [Zekrom] 98616, 4 packs, BW004 / BW005 (Tinsel Holo).
- Victini Box 98613, 5 packs (TCGplayer's own text), BW09 Zoroark. Collector's Album Box 98614, 2 packs, BW10 Axew.
- Three Pack Blisters [Snivy] / [Tepig] / [Oshawott], 3 packs, BW06 / BW07 / BW08 (no TCGplayer product; priced from the packs, `priceDerived`). Two Pack Blister [Ducklett], 1 pack, BW17. Toys R Us Booster Two-Pack, 2 packs, one of BW14 / BW15 / BW16 (non-holo, `pick: 1`).
- Sneak-Peek Tins [Snivy] 206404 / [Tepig] 206403 / [Oshawott] 206405: BW01-BW03 (Tinsel Holo). The real tin held four Platinum-HGSS series packs, not Black & White ones, so `packs: 0`; priced at the promo's market (`priceSource`).
- Theme decks Green Tornado 98610 / Red Frenzy 98611 / Blue Assault 98612: sold with the deck's Cracked Ice Holo showcase card as a `like` reprint (`5-cracked-ice`, `19-cracked-ice`, `31-cracked-ice`; TCGplayer listings 213003, 155561, 204231, group "Deck Exclusives" 1840; `keepScan`, `keepMaps`). TCGplayer prices Red Frenzy ($110, one listing) and Blue Assault ($85); Green Tornado has none, so its price is the sum of its 42 non-Energy cards (deck list: Bulbapedia, `theme-decks.md`).
- Left out: the unresolved "3 Pack Booster Blister Special Edition [Wigglytuff]" 454432 (single source, unidentified promo), Preview Pack 647775 (5 cards, no pack), the Worlds decks.
Pack counts of everything but the Victini Box are Bulbapedia only (medium); `note` says so on each product. Prices: booster pack $203.49 (TCGplayer; the box has no market price), so packs-derived prices are large.
