# XY: Phantom Forces (xy4)

Built 2026-10-01 (builder b2). Research: `/mnt/project-files/every-era/xy/research/xy4.md`, `xy4-products.md`, `xyp-claims.md`, `second-source-check.md`.
Release 2014-11-05. pkmn.gg lists 124 cards; the data file holds 122 (119 printed + 3 secrets) plus the 2 promos below (counted under xyp).

## Pack
Ten cards: 5 Commons, 3 Uncommons, a reverse, a rare slot; no basic Energy (Bulbapedia "Booster pack (TCG)", the wrapper text, E2's sheet model, the pokemontcg.io list).
Rates are Elite Fourum E2's 360-pack sheet counts checked against E2's own 28 boxes and a 30-box PokeBeach hand tally: holo .1944 (the two Team Flare Hyper Gear red-border holos are in it), EX .0685, Mega EX .0228 (card-share split, low), full art .0387, secret .0088 (low). Medium confidence; sources in data/pullrates.json.

## `a` prints
`24a` M Manectric-EX and `65a` Aegislash-EX are full-art "Yellow A Alternate" prints from the 2017 Mega Powers Collection and Premium Trainer's XY Collection (pkmncards, Bulbapedia). No product in the research uses them: left out (`skipNumbers`, scans removed).

## Names
pkmn.gg writes "Battle Compressor Team Flare Gear" (and Hyper Gear on Head Ringer, Jamming Net); the cards and TCGplayer say "Battle Compressor" etc., so data/xy4.json uses those (the price matcher refused the set otherwise). A rebuild with build_set.py brings the long names back: fix them again.

## Maps
TCG Live key `xy4`: 32 of 32 foil prints (14 Rare Holo, 8 Rare Holo EX, 7 Rare Ultra, 3 Rare Secret) have a foil map, 8 etch maps. Overlaid on the scans (Diancie, Manectric-EX, Gengar-EX FA, silver Dialga-EX): they line up.

## Products
Every product the research confirms is built (13): Elite Trainer Box (8 packs), the Darkrai (XY22), Shiftry (XY23) and Greninja (XY24) blisters, Gallade EX Box (XY45; 2 xy4 + 1 xy2 + 1 xy1), both Hoenn Collections and the 2014 Collector Chest (XY36-38; the collections are 2 xy4 + 1 xy3, the chest's mix was not found), the Mega Metagross (XY34, 35; 2 packs each of xy1-xy4) and Mega Diancie (XY43, 44) Premium Collections, the two Collector's Pin 3 Pack Blisters and the Talonflame single-pack blister (its galaxy-holo reprint card is not simulated).
TCGplayer prices only the Darkrai blister (low-price fallback in tcgcsv), the Gallade box and nothing else here, so the rest carry `priceDerived: "packs"`: their packs at the set's pack price ($230.17) plus the promos' market. Prerelease XY21 Bronzong has no sealed product. Theme decks are b6's. The booster box has no TCGplayer price.
Promo `foilAs`: cosmos promos Rare Holo, Mirror-holo EX promos Rare Holo EX (Treecko, Torchic, Mudkip, Mirror, as Rare Holo).
