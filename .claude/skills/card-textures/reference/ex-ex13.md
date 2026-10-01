# EX era: EX Holon Phantoms (ex13)

Built 2026-10-01 (builder e4). Research: `/mnt/project-files/every-era/ex/research/ex13.md`, `ex13-products.md`, `ex-pack-structure.md`, `ex-finish-types.md`, `second-source-check.md`. Release May 3, 2006 (Serebii and TCGplayer agree). 111 cards (printed 110).

## Cards
Common 31, Uncommon 30, Rare 20, Rare Holo 17 (all Delta Species), Rare Holo EX 3 (Crawdaunt, Mew, Mightyena), Rare Holo Star 3 (102 Gyarados delta, 103 Mewtwo, 104 Pikachu), Energy 6 (105-110, the holofoil Energy, `holoEnergy: true` set by build_set), Rare Secret 1 (111 Mew). Counts match pkmn.gg and the research.
Flags: `111 boxTopper` (never dealt); `102 refractor: true` (Gyarados Star is the one refractor star: EF post 57 puts it on the Delta holo sheet, the other two stars are cosmos; yellow border plain). The 17 Rare Holo are refractor by js/ex-foil.js's per-set rule, the three ex and two stars are cosmos, the six Energy sheen.
Scans: scrydex (`<set>-<n>`), mirrored at the two sizes by `mirror_images.py`'s per-set function only (the CLI also re-encodes every shared Energy and set logo into a sparse tree: do not run it with a set argument in a sparse worktree). Checked by eye: first card, a holo, an ex, the Gold Stars, an Energy, a Trainer and the last card; an automated border check (aspect 1.397 +/- 0.02, no white or transparent edge ring) found nothing in any card. None swapped for pokemontcg.io hires.

## Pack
Nine cards: 5 Commons, 2 Uncommons, a reverse slot, a rare slot; late layout. `exSlots({ holo: .2936, ex: .0278, goldStar: .012, holoEnergy: .3333 })`: Elite Fourum post 57's 216-pack table with PokeGym 33957 (1 ex and a third of a star a box, 12 holofoil Energy a box). The holofoil Energy replace the reverse slot (sheet separate from the reverses). Gold Star rate: .0093 for Mewtwo and Pikachu plus an assumed .0027 for Gyarados (EF's guess): medium / low. `reverseTwice` is empty: EF post 57's reverse chart is rarity-level (96 observed of a 110 sheet, "likely 12 commons" twice, "not enough information on individual cards"), no card names, so none are listed.

## Wrappers
Zangoose, Mewtwo, Kabutops, Gyarados (pokesymbols `ex-holon-phantoms-pack-0..3`, checked against the images; wired to ex13-34, 103, 9, 8). They are opaque photos of the wrappers: `clean_pack_art.py` cut them in place (the files were untracked, so no -v2 name); judged on a dark background.

## Prices and products
Pack $1,901.99 (TCGplayer market, a low sample; lowest listing $2,999.99): thin, used as is. Singles 110 of 111 priced; 103 Mewtwo Star has no market today (its history stops at $325, 2026-09-28) so it sells at the Gold Star fallback. Built: Booster Box (98523, no market price, 36 packs = $68,471.64). Not built: the FireMist and FloodRush theme decks (TCGplayer 232850 / 232851 have no price and no source gives the 60-card lists), the HP blister (3 packs, mix not stated, holo POP1 Rayquaza and POP2 Venusaur promos that belong to the POP sets).
