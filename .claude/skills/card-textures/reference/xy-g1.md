# XY: Generations (g1)

Built 2026-10-01 (builder b4). Research: `/mnt/project-files/every-era/xy/research/g1.md`, `g1-products.md`, `xyp-claims.md`.
117 cards on pkmn.gg (83 printed + 2 prize `a` prints + RC1-RC32); the file holds 106: the 9 numbered basic Energy (75-83) and the `a` prints 28a Jolteon-EX and 73a Team Flare Grunt are `skipNumbers` (Energy comes from the `xy` Energy print, see below), plus 18 promo cards `g1-xyp110..126, 148`. `printedTotal` stays 83. Radiant Collection cards are flagged `rc: true` (`rcNumbers` in the config; pkmn.gg lists them in the main checklist, no separate page, so the config's `subsets` entry is `inline: true` and only names TCGplayer group 1729 for the prices).
**Articuno 25 and Zapdos 29** are the embossed full arts of the packs; pkmn.gg, TCGplayer and pokemontcg.io call them Rare Holo. `rarityOverrides` in the config files them as Rare Ultra (build_set.py supports the key), so they sit in the ultra pool and finish as full arts.

## Pack
10 cards, no booster box ever (Bulbapedia, E2 post 134): 4 commons (one rolls a basic Energy, `commonEnergy` .893: E2 sheet model only, low), 2 uncommons, a reverse, a Radiant common (pool `rcCommon`), a Radiant uncommon-or-ultra (`rcUncommon` .72 / `rcUltra` .28: sheet photo and 208 of 686 packs, forum Mythical-box tally agrees, medium), and the rare slot: rare .6667, holo .1056, EX .1542, Mega EX .0514, full art .0222. Pools `rcCommon`, `rcUncommon`, `rcUltra` are three lines in js/engine.js poolsFrom (added by b4 next to `radiantCollection`; the engine owner should keep them). The Energy of the packs (75-83) is the XY 2013 print here: same art, other number line.

## Scans
Scrydex `g1-<n>` and `g1-RC<n>`. Checked 1, 5, 25, 29, RC1, RC32 and pixel-compared every scan against pkmn.gg: clean.

## Wrappers
pokesymbols `generations-pack-0..3`: Pikachu, Charizard, Venusaur, Blastoise (cut in place, viewed on dark).

## Maps
TCG Live key `xy9-5`, numbers 001-046: 19 foil prints have a map (all holo, EX incl. Mega, Articuno, Zapdos), 2 etch maps. The 7 Radiant Collection holo cards (RC6, RC21, RC28-RC32) have no map (TCG Live has none for them).

## Products
Generations ETB (10 packs, XY148 Shaymin-EX), the eleven Mythical Pokémon Collection boxes (2 packs, XY110-120, full arts), the four Red & Blue Collections (4 packs, XY121-124 full-art EX), the Mew & Mewtwo Super-Premium Collection (10 packs, XY125/126). Prices: TCGplayer where it has one, else its packs at the $311.42 booster pack price (`priceDerived: "packs"`). Promo `foilAs`: Rare Ultra for the full arts (checked on the scans), Rare Holo EX for XY148.
