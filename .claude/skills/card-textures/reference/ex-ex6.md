# EX: FireRed & LeafGreen (ex6)

Built 2026-10-01 (builder e2). Research: `/mnt/project-files/every-era/ex/research/ex6.md`, `ex6-products.md`, `ex-pack-structure.md`, `ex-finish-types.md`, `second-source-check.md`. Released 2004-08-30 (TCGplayer and an excerpt of Serebii/Bulbapedia; pkmn.gg gives the month). 116 cards (112 printed).

## Cards
Rare Holo 17, Rare Holo EX 9 (104 Blastoise ex, 105 Charizard ex, 106 Clefable ex, 107 Electrode ex, 108 Gengar ex, 109 Gyarados ex, 110 and 111 Mr. Mime ex (Magic Odds / Magic Evens), 112 Venusaur ex), Rare 14 (103 Multi Energy is a Rare special Energy, not a basic), Uncommon 36, Common 36, Rare Secret 4 (113 Charmander the box topper, `boxTopper: true`; 114 Articuno ex, 115 Moltres ex, 116 Zapdos ex: CRACKED ICE secret ex dealt in packs, `crackedIce: true`). Counts match pkmn.gg and the research. Scans: scrydex (`<id>-<n>`, byte-identical to pokemontcg.io's hires, so there was no better source to swap to), mirrored at 600 and 320 px WebP. I looked at the first card, a holo, Raichu, Wartortle, Pikachu, Multi Energy, Charizard ex, the four secrets and a Trainer: full cards, square-cropped, no white borders, no crooked crops, no watermarks; the printed foil sparkle of the holos is baked into the scan (as in the DP era). None swapped.

## Pack
Nine cards (5 C, 2 U, 1 reverse, rare slot); no Energy, no code card. `exSlots({ holo: .2222, ex: .0833, secret: .0278 })`: Elite Fourum post 44 (8 holos, 3 ex and 1 secret bird a box; the holos are cut from 9 because the set has more ex) with PokeGym 19395 ("4 ex per box in FR/LG"). Secret and ex medium to medium-high, the holo count medium-low (no second tally). Simulated 20,000 packs: holo .225, ex .0815, secret .028, no box topper.
Reverse: 103 reverse cards; EF fits a 10x10 sheet with 7 reverse commons twice, the post does not name them ("likely 7 reverse commons"): `reverseTwice` is `[]`. A Gastly rarity-error print (Uncommon symbol on a Common) exists in the real set and is ignored. Family `energy` with a holofoil Poké Ball stamp on Rare and Holo Rare reverses.

## Finish notes for the finish agents
Cracked ice on 114, 115, 116 (secret rarity with an ex name: `foil-ex ex-ex ex-secret ex-cracked-ice`); Charmander 113 is a cosmos secret that is never dealt. No Gold Stars.

Maps: none (TCG Live has no EX maps; js/ex-foil.js `exMap` is the finish agents' hook). Finish classes come from `exPattern`: Rare = `foil-none`, Rare Holo = `foil-holo ex-cosmos`, Pokémon-ex = `foil-ex ex-ex`.

## Wrapper
Pikachu, Charizard, Blastoise, Venusaur (pokesymbols labels, checked by eye; wired to ex6-74 (the only Pikachu), 105, 104, 112). Source: pokesymbols.com `ex-fire-red-and-leaf-green-pack-N.avif`, flat photos, cut with `clean_pack_art.py` in place. Usable on a dark background.

## Prices
TCGplayer pack $1,009.96 (a thin listing; low $1,999.99). All 116 singles priced; TCGplayer spells #32 "Drowsee" and #96 "PokeDex (HANDY909)", so two rules were added to `norm()` in fetch_tcgplayer_prices.py. Gengar ex $1,399.99, Blastoise ex $650. The box has no TCGplayer price: 36 packs ($36,358.56).

## Products
Booster Box (98945) and the Single Pack Blister (488312, one pack, priced as its pack). The research found no tin, value pack or blister with a stated mix that names this set. Left out: the "LeafGreen" [Ivysaur] theme deck (488299) and the FireRed deck (no list, no price).
