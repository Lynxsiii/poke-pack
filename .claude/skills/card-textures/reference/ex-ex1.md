# EX era: EX Ruby & Sapphire (ex1)

Built 2026-10-01 (builder e1). Research: `/mnt/project-files/every-era/ex/research/ex1.md`, `ex1-products.md`, `ex-pack-structure.md`, `ex-finish-types.md`, `second-source-check.md`, `np.md`. Release 2003-06-18 (TCGplayer group date plus a search excerpt of Bulbapedia/Serebii-type listings; pkmn.gg says 2003-07 at month level). 109 cards (109 printed), plus the three NP promos below, filed as `ex1-npNNN` and counted under np.

## Cards
Rare Holo 14 (1-14: Aggron, Beautifly, Blaziken, Camerupt, Delcatty, Dustox, Gardevoir, Hariyama, Manectric, Mightyena, Sceptile, Slaking, Swampert, Wailord), Rare Holo EX 8 (96-103: Chansey ex ... Sneasel ex), Rare 13 (includes Darkness, Metal and Rainbow Energy, 93-95), Uncommon 34, Common 34, basic Energy 6 (104-109, rarity "Energy", `energyPrint: "own"`). No secret, no Gold Star. Counts match pkmn.gg and the research table. Scans: scrydex (`ex1-<n>`), mirrored at the two sizes. Looked at by eye: 1, 3, 60, 80, 92, 101, 104, 109 (first, holos, Mudkip, two Trainers, Mewtwo ex, a basic Energy, the last card): straight, no borders or watermarks, none swapped; an automatic edge check (white or transparent border pixels, aspect) of all 109 flagged none. The scrydex scans carry the printed foil sparkle of the holo and ex cards already.

## Pack
Nine cards: 4 Commons, the fifth slot (common 1/3, basic Energy 1/3, holo 1/6, Pokemon-ex 1/6), 2 Uncommons, a Mirror reverse (Common/Uncommon/Rare/Rare Holo plus the six own Energy, 101 cards: `reverseRarities` and `reverseOwnEnergy`), and a Rare that is ALWAYS a plain non-holo Rare. `exSlots({early: true, holo: .1667, ex: .1667, energy: .3333})`. Elite Fourum post 35's 216-pack table with PokeGym 264/317 as the second source; the Energy rate is EF alone (medium-low). The first print run's "error" distribution (12 holos in the fifth slot, 12 ex in the rare slot) is not dealt. `reverseTwice` is empty: EF's table image lists 9 reverse cards as printed twice but the post does not name them.

## For the finish agents
Cosmos holo on the 14 holos and 8 ex (EX class `foil-ex ex-ex`). NO dot strip on the holo, ex and reverse versions (the scans show the 13-line strip at the foot of non-holo cards only); the reverse is the "Mirror" pattern (body foiled, art box plain; the foil bleeds slightly into the frame) on 101 cards including basic Energy. No refractor, cracked ice, delta, box topper or Gold Star in this set.

## Maps
TCG Live has no maps for the generation; none shipped.

## Wrapper
Manectric, Lairon, Mightyena, Sceptile (pokesymbols labels, checked by eye on a dark background; wired to ex1-9, 36, 10, 11). pokesymbols `booster-pack-art/ex-ruby-and-sapphire-pack-0..3.avif` are opaque flat scans of the wrapper; `scripts/clean_pack_art.py` cut the white margin (cut in place: nothing of them was committed before). Logo and symbol: images.pokemontcg.io / pokesymbols.

## Prices
Pack $799.99 (TCGplayer market, one listing at $999.99: thin, used as is). The box has no market price and its TCGplayer photo shows a theme deck display, so `booster-box` carries `noPhoto` (build_products) and is priced at 36 packs ($28,799.64). Card prices: all 109 matched; TCGplayer lists one Makuhita as "Makuhita - 56109" (norm() strips it). Top single: Mewtwo ex $439.98.

## Products
Built: Booster Box (98559), Single Pack Blister (488315, 1 pack, no promo identified), EX Series Collector's Tin (206390: 3 Ruby & Sapphire + 2 Sandstorm packs from TCGplayer's product text, the NP12 Pikachu and NP13 Meowth cosmos holos; manual price $3,598.22 = 3 x $799.99 + 2 x $498.75 + the promos, because the script's packs-only derivation prices all five at the home pack), EX Series Value Pack (NP20 Ludicolo; real mix 3 packs from RS/SS/DR with no split given, so it opens as 3 Ruby & Sapphire packs). Left out: the two theme decks (Ruby/Blaziken 488309, Sapphire/Swampert 488310: no card lists and the exclusive print is a stamped Energy), EX Battle Stadium Blaziken vs Gardevoir (two decks, no list), the NP12 10th Anniversary stamp and jumbo variants. The Value Pack has no photo (no TCGplayer listing).
