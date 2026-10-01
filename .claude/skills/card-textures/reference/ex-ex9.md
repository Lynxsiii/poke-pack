# EX: Emerald (ex9)

Built 2026-10-01 (builder e3). Research: `/mnt/project-files/every-era/ex/research/ex9.md`, `ex9-products.md`, `ex-pack-structure.md`, `ex-finish-types.md`, `second-source-check.md`, `box-contents.md`, `np.md`.
Release 2005-05-09 (Serebii and TCGplayer group 1410 agree). 107 cards in `data/ex9.json` (106 printed, plus the Farfetch'd secret, plus 3 NP promos filed as `ex9-np037` to `ex9-np039`, which count under np). Config `data/sets/ex9.json` (pkmn.gg `ex/emerald`, scrydex `ex9`, artSlug `ex-emerald`, TCGplayer 1410).

## Cards
Common 32, Uncommon 32, Rare 14, Rare Holo 11 (1-11, cosmos), Rare Holo EX 11 (90-100, Altaria to Registeel ex), six holofoil basic Energy 101-106 (pkmn.gg "Rare Holo", supertype Energy: build_set turns them into rarity "Energy" with `holoEnergy: true`), 107 Farfetch'd (Rare Secret, `boxTopper: true`, never dealt). Counts match pkmn.gg and the research. Regice, Regirock and Registeel ex (98-100) are plain cosmos here: cracked ice is ex5/ex6 only.

## Scans
scrydex (`ex9-<n>`), mirrored at the two sizes (600 and 320 wide, all 600x838). Looked at: 1 Blaziken (holo), 10 Sceptile, 35 Loudred, 60 Pikachu, 96 Milotic ex, 101 and 106 (the holo Energy), 107 Farfetch'd, plus an automatic frame-colour and size check of all 107: all clean, aligned, full-frame with the yellow border, no white edges, no watermark. Nothing swapped. The holo scans carry the printed sparkle in the art box already (the foil is baked in, dimly); the Energy scans are the dark foil pattern.

## Pack
Nine cards: 5 Commons, 2 Uncommons, a reverse slot, a rare slot (late layout), no Energy slot, no code card. `exSlots({ holo: 0.25, ex: 0.0833, holoEnergy: 0.3333 })`: Elite Fourum post 51 (7 boxes tallied, 6 with exactly 12 holo Energy) and PokeGym 19395 ("12 matrix energy per box ... replaces reverse foil", "3 ex in a box"): holo 9 a box, ex 3 a box, the six holofoil Energy in the REVERSE slot one pack in three (the engine pool `holoEnergy`; the Energy never join the rest of the reverse list). High on the Energy and ex counts (two sources), medium-high on holo (one box report). Sources in `data/pullrates.json`.
Reverse list: Common, Uncommon, Rare, Rare Holo = 89 cards (Collexy's 89 matches). `reverseTwice` is EMPTY: Elite Fourum post 51 says only that "21 commons appear on the sheet twice" on a 110-card reverse sheet and does not name them (its images are the 110/121 model table and the rare raw data, no card names), so none are listed.

## What the finish agents need
- Rare Holo 1-11 and Rare Holo EX 90-100: cosmos holofoil (Collexy, Elite Fourum).
- Energy 101-106: cosmos (Collexy; PokeGym calls the pattern "Matrix"), `holoEnergy: true`, class `foil-holo ex-cosmos ex-energy`; separate sheet from the reverses.
- Reverse holo: Poke Ball pattern in the art box with the set stamp bottom right; Rare and Rare Holo reverses add gold name, gold HP and a silver rarity symbol (`EX_REVERSE.ex9`).
- 107 Farfetch'd: Rare Secret, cosmos (`foil-holo ex-cosmos ex-secret`), box topper only.
- No refractor, no cracked ice, no delta in this set. The EX-era dot strip is gone from every card.

## Wrapper art
pokesymbols `ex-emerald-pack-0..3` (a flat photo of each wrapper, opaque, a sliver of white at the sides): `clean_pack_art.py` cut all four in place (never committed uncut). Names checked by eye on a dark background: Deoxys (Speed), Rayquaza, Groudon, Kyogre, wired to ex9-2, 9, 5, 6. Logo from images.pokemontcg.io, symbol from pokesymbols `emerald`.

## Prices
TCGplayer booster pack $1,000.00 market (low $1,500; thin, no listing sold in a year): used as is. The set's cards come from the TCGplayer group (107/107 priced), a year of history from `backfill_prices.py`. The box has no market price: it is the product `booster-box`, 36 packs = $36,000.

## Products
Built: Booster Box (98547, 36 packs); the three EX Collector's Tins (Kyogre ex NP37, Groudon ex NP38, Rayquaza ex NP39: 2 Emerald + 2 Crystal Guardians packs, from `{ex9: 2, ex14: 2}`), priced at 4 packs of the Emerald pack price plus the promo (about $4,180 to $4,650). The tins are filed here because Emerald is the first set of their mix; Crystal Guardians' builder (e4) may file the same promos under ex14: whichever lands, np counts each promo once. Pack mix and tin contents come from pkmn.gg and Bulbapedia's search excerpt only (low-medium). Left out: the Hydrobloom and Wildfire theme decks (TCGplayer 232874/232875, no card lists in the research and no price), the Farfetch'd box topper (a set card, not a promo, so a product cannot carry it).
