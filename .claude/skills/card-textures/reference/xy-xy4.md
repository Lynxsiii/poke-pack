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
Built (the only ones TCGplayer prices): Phantom Forces 3 Pack Blister [Darkrai] (XY22), Gallade EX Box (XY45; 2 xy4 + 1 xy2 + 1 xy1). Left out, no TCGplayer market price: Elite Trainer Box, Shiftry and Greninja blisters (XY23, XY24), both Hoenn Collections and the Collector Chest (XY36-38), Mega Metagross (XY34, 35) and Mega Diancie (XY43, 44) Premium Collections; they stay in the config so a later run builds them once TCGplayer lists a price. Prerelease XY21 Bronzong has no product. Skipped: Talonflame galaxy-holo reprint blister and the Collector's Pin blisters (one source), theme decks (b6). The booster box has no TCGplayer price either. Pack $230.17.
Promo `foilAs`: cosmos promos Rare Holo, Mirror-holo EX promos Rare Holo EX.
