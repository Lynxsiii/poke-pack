# EX era: EX Power Keepers (ex16)

Built 2026-10-01 (builder e4). Research: `ex16.md`, `ex16-products.md`, `ex-pack-structure.md`, `ex-finish-types.md`, `second-source-check.md`. Release February 14, 2007 (Serebii; TCGplayer says Feb 1 and pkmn.gg Feb 2, which chain: conflict recorded, Serebii used). 108 cards (printed 108), the last EX main set.

## Cards
Common 32, Uncommon 31, Rare 15, Rare Holo 19 (13 Pokémon + 103-108 holofoil Energy, rarity "Energy" with `holoEnergy: true` from build_set), Rare Holo EX 8, Rare Holo Star 3 (100 Flareon, 101 Jolteon, 102 Vaporeon); no secret, no box topper.
Finish: cosmos for the holos, ex and Gold Stars (no refractor flag anywhere), sheen for the six Energy. Reverse holos have gold name/HP, silver rarity symbol and NO golden border (EX_REVERSE border "").
Scans: scrydex (`<set>-<n>`), mirrored at the two sizes by `mirror_images.py`'s per-set function only (the CLI also re-encodes every shared Energy and set logo into a sparse tree: do not run it with a set argument in a sparse worktree). Checked by eye: first card, a holo, an ex, the Gold Stars, an Energy, a Trainer and the last card; an automated border check (aspect 1.397 +/- 0.02, no white or transparent edge ring) found nothing in any card. None swapped for pokemontcg.io hires.

## Pack
Nine cards, late layout. `exSlots({ holo: .2376, ex: .0833, goldStar: .0124, holoEnergy: .2479 })`: EF post 62 (121-cell sheets; holofoil Energy five of 121 reverse positions each; 15 boxes tallied, 6 stars, 4 from one box) and PokeGym 48790 (10 boxes: 30 ex, 5 stars). EF thread 28369's recollection of 5-7 ex a box is not used. `reverseTwice` empty: all 91 reverses are printed once on the 121 sheet (EF), so there are no doubled cards.

## Wrappers
Walrein, Absol, Aggron, Raichu (pokesymbols; cut in place; wired to ex16-99, 92, 1, 12). The set's symbol and logo already shipped with the scaffold.

## Prices and products
Pack $949.99 (market, low sample; lowest $1,599.99). Singles 108 of 108 priced. Built: Booster Box (98528, 36 packs = $34,199.64) and the Single Blister Pack (616213, one pack: TCGplayer's text "Each blister comes with a booster pack containing 9 cards", $949.99). Not built: the Dark Blast and Mind Game theme decks (no listing, no lists), the PK blister (3 packs, mix not stated; POP4 Deoxys delta and Mew holos), the PK 2-pack blister (POP4 Wobbuffet holo).
