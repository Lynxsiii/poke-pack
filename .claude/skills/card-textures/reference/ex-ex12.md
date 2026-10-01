# EX: Legend Maker (ex12)

Built 2026-10-01 (builder e3). Research: `/mnt/project-files/every-era/ex/research/ex12.md`, `ex12-products.md`, `ex-pack-structure.md`, `ex-finish-types.md`, `second-source-check.md`, `box-contents.md`.
Release 2006-02-13 (Serebii and TCGplayer group 1378 agree). 93 cards in `data/ex12.json` (92 printed + the Pikachu delta secret). Config `data/sets/ex12.json` (pkmn.gg `ex/legend-maker`, scrydex `ex12`, artSlug `ex-legend-maker`).

## Cards
Common 27 (48-71, 78-80), Uncommon 26, Rare 15, Rare Holo 14 (1-14), Rare Holo EX 7 (83-89), Rare Holo Star 3 (90 Regice, 91 Regirock, 92 Registeel), 93 Pikachu delta (Rare Secret, `boxTopper: true`, never dealt, the only Delta Species card). Counts match pkmn.gg and the research.

## Scans
scrydex (`ex12-<n>`), mirrored at the two sizes, all 600x838. Looked at: 1 Aerodactyl, 10 Mew (holos), 40 Misdreavus, 70 Wurmple, 83 Arcanine ex, 90 Regice and 92 Registeel (stars), 93 Pikachu delta, plus the automatic frame check of all 93 and the pack open: clean, aligned, nothing swapped.

## Pack
Nine cards, no Energy. `exSlots({ holo: 0.2685, ex: 0.0556, goldStar: 0.0093 })` from Elite Fourum post 55 (20 boxes: 10 holos + 2 ex, or 9 holos + 2 ex + 1 Gold Star; 0.35 stars a box: 4 Regice, 3 Registeel, 0 Regirock) with Flipside Gaming's general Gold Star rate (about 1:72) as the second source for the stars: Gold Star medium-high, holo and ex medium (the guide's alone). Sources in `data/pullrates.json`.
Reverse list 82 (27 C + 26 U + 15 R + 14 Rare Holo; Collexy's 82 matches). `reverseTwice` lists the 27 Commons (every Common in the set): EF post 55 fits the reverse sheet to a model in which "all 27 commons and 1 of the 26 uncommons were printed twice" on a 10x11 sheet ("RE2: not enough information on individual cards; likely all 28 commons and 1 uncommon" in its table, the 28 being a slip for the set's 27). The ONE doubled Uncommon is not named by the post, so none is doubled: the pool holds 109 cells instead of the sheet's 110. Medium confidence (one source, a fit to 144 observed reverses).

## What the finish agents need
- EVERYTHING is cosmos here: holos, ex, Gold Stars, Pikachu delta (no refractor in ex12; the stars may share the holo sheet, so the pattern is the same).
- Reverse holo: the only EX set whose reverses use the ordinary Cosmos pattern, with the set stamp; Rare and Rare Holo reverses have cosmos-holofoil name and HP and a silver rarity symbol (`EX_REVERSE.ex12`: cosmos, goldRares false).

## Wrapper art
pokesymbols `ex-legend-maker-pack-0..3`, opaque photos on a pale stone-arch wrapper, cut in place by `clean_pack_art.py`. Arcanine, Aerodactyl, Mew, Banette (confirmed by eye), wired to ex12-83, 1, 10, 85. Logo images.pokemontcg.io, symbol pokesymbols `legend-maker`.

## Prices
tcgcsv has no pack market (lowest ask $1,600): TCGplayer's price-history bucket gives $464.00 (newest nonzero market, from one October 2025 sale, flat since: the listing's lowest ask is more than three times that): used as is, flagged. Singles 92/93 priced from the group; Registeel star (92) has no tcgcsv price and takes the history value $498.00. Box (98556): 36 packs = $16,704.

## Products
Built: Booster Box only. The Legend Maker blisters carry POP Series 1 promos (March 2006: 2 LM + 1 UF packs) and the Dragon Frontiers blister a POP Series 3 pair: both belong to the POP builder (e5). The Groundbreaker and Shadowquake theme decks have no TCGplayer listing and no lists, and the Pikachu delta topper is a set card: neither is built.
