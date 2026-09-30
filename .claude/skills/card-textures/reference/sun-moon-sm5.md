# Sun & Moon: Ultra Prism (sm5)

Built 2026-09-30 (builder b2). Research: `/mnt/project-files/sun-moon/research/sm5.md`, superseded for the rates by `second-source-check.md`.
178 cards on pkmn.gg; the data file holds 176 (173 printed incl. 17 secrets, minus 5 `a` prize prints, plus `sm5-10a`, `sm5-smp101` and `sm5-smp121`).

## Pack
Eleven cards: basic Energy (`sm17`), 5 Commons, 3 Uncommons, a reverse slot, a rare slot. Prism Stars replace the reverse holo (E2 posts 140/146, PrimetimePokemon,
PokeBeach thread; the rare-slot classes sum to the packs opened without them), rate 8.5% (`reverseSpecial: [["prismStar", .085]]`, `prism` unused). Super Boost Energy ◇ is
a Prism Star (pool `prismStar`); Unit Energy is an Uncommon (pool `uncommon`). Rates: holo .1875 (= 1/3 minus the hits; plain Rare is 2/3 of packs, 1,902 of 2,844 packs counted by E2),
GX .0817, full art .0414, rainbow .0147, gold .0081 (n=6,246 packs from four tallies). The old holo .2773 of sm5.md was a card-count heuristic and is not used.
Names: pkmn.gg writes "Unit Energy GrassFireWater"; the cards say and TCGplayer lists "Unit Energy GRW" and "Unit Energy LPM", so the data uses those.

## `a` prints
`119a` Cynthia, `122a` Escape Board, `125a` Lillie, `135a` Volkner and `153a` Lusamine are Regional Championship and League Challenge prize prints: no product holds
them, left out (scans removed; a rebuild from pkmn.gg brings them back unless data/sets/sm5.json lists them in `skipNumbers` once build_set.py has that key).
`sm5-10a` is Shining Legends' Entei-GX 10a (sm35-10a) as the Legends of Johto boxes' second promo (`like: "sm35:10a"`, `keepScan`, shares the scan).

## Maps
TCG Live key `sm5`. 63 of 64 foil prints have a foil map (incl. the 6 Prism Stars, whose map is the diamond), 35 etch maps; no map only for `sm5-10a`. All overlaid on the scans.

## Products
Elite Trainer Boxes [Dawn Wings Necrozma] and [Dusk Mane Necrozma] (8 packs, no promo; TCGplayer lists the two box arts apart, and the script's `Elite Trainer Box$` match does not catch them),
the Necrozma Prism Tin [Dawn Wings Necrozma GX] (SM101), Legends of Johto GX Premium Collection Box (6 packs; SM121 Raikou-GX + Entei-GX 10a), the 3 Pack Hanger Box. Left out because TCGplayer has no market price: Lucario GX Box
(SM100), the Dusk Mane tin (SM102), the Spring 2018 Collector's Chest (SM105 to SM107) and the international Legends of Johto box. NOT built, waiting on the other builders' data: the four blisters and the Charmander Sidekick
Collection carry cosmos-holo reprints of Guardians Rising 21a and 19a, Burning Shadows 105a, 92a and 18a (research sm5.md: Alolan Vulpix 162037 3 packs, Porygon-Z 162038 3 packs, Alolan Sandshrew 162039 1 pack,
Kirlia 162040 1 pack, Charmander Sidekick 186105 1 pack); add them with `like: "sm2:21a"`-style promoCards once data/sm2.json and data/sm3.json are merged. Packs `vary by product` for the tins and boxes (SM or XY); shown as
Ultra Prism packs. Booster Box $1,450 and pack $49.67 (TCGplayer).
