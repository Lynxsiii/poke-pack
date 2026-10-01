# EX: Unseen Forces (ex10)

Built 2026-10-01 (builder e3). Research: `/mnt/project-files/every-era/ex/research/ex10.md`, `ex10-products.md`, `ex-pack-structure.md`, `ex-finish-types.md`, `second-source-check.md`, `box-contents.md`.
Release 2005-08-22 (Serebii and TCGplayer group 1398 agree). 145 cards in `data/ex10.json`: 115 numbered + the 28 Unown + 2 secrets. Config `data/sets/ex10.json` (pkmn.gg `ex/unseen-forces`, scrydex `ex10`, artSlug `ex-unseen-forces`).

## Cards
Common 31, Uncommon 34, Rare 16, Rare Holo 19 (1-19), Rare Holo EX 12 (101-112), Rare Holo Star 3 (113 Entei, 114 Raikou, 115 Suicune), Rare Secret 2 (116 Rocket's Persian ex, 117 Celebi ex), 28 Unown. Counts match pkmn.gg and the research.
- Unown: pkmn.gg files A-Z, ! and ? as plain "Rare"; `rarityOverrides` makes all 28 "Rare Unown" (engine pool `unown`, reverse slot). `numberAliases {"!": "EXCL", "?": "QUES"}` files the two odd ones as `ex10-EXCL` and `ex10-QUES` (printed number stays "!" and "?", scan keys `ex10-%21` and `ex10-%3F`). Their TCGplayer listings are "Unown (A)" numbered "A/28", which `fetch_tcgplayer_prices.py` now maps (a tiny additive rule at the Unown spot of price_singles): all 145 priced.
- Celebi ex 117 is IN packs (the secret rare, exSlots `secret: 0.0054`); Rocket's Persian ex 116 is the box topper (`boxTopper: true`, never dealt). The research has Persian as the topper (EF post 52, one source) and Celebi ex dealt at the guide's assumed 1 in 185.6.

## Scans
scrydex (`ex10-<n>`), mirrored at the two sizes, all 600x838. Looked at: 1 Ampharos (holo), A, EXCL and QUES (three Unown: the right glyph each time), 45 Quilava, 104 Ho-Oh ex, 113 Entei star, 117 Celebi ex, plus the automatic frame and size check of all 145 and the pack open: clean, aligned, nothing swapped.

## Pack
Nine cards (5 C, 2 U, reverse slot, rare slot), no Energy, no code card. `exSlots({ holo: 0.25, ex: 0.0687, goldStar: 0.0093, secret: 0.0054, unown: 0.1991 })` from Elite Fourum post 52 (10 boxes: 9 holos + 3 ex, or 9 holos + 2 ex + 1 Gold Star; 72 Unown in 360 packs). Gold Stars one in 108 packs (4 of 10 boxes; EF post 46's 104-box overall tally agrees); the Unown at 1 in 5 take the reverse slot (EF alone: low-medium); Celebi ex is the guide's assumption (low-medium). Sources in `data/pullrates.json`.
Reverse list 100 (31 C + 34 U + 16 R + 19 Rare Holo; Collexy's 100 matches). `reverseTwice` is EMPTY: the guide gives a 110-card sheet with 10 commons printed twice but names none. Unown never join the reverse list (rarity "Rare Unown" is not in `reverseRarities`).

## What the finish agents need
- Rare Holo, Rare Holo EX, Gold Stars, Celebi ex, Persian ex AND the Unown Collection are all cosmos (Collexy): class `foil-holo ex-cosmos ex-unown` for the Unown, `foil-ex ex-ex ex-secret` for the two secret ex.
- Reverse holo: Poke Ball pattern with the set stamp, 3D effect only at an angle (Elite Fourum 58382, Collexy); Rare and Rare Holo reverses gold name and HP, silver rarity symbol (`EX_REVERSE.ex10`).
- Theme-deck exclusives (Ho-Oh, Lugia holos) are not built (no lists).

## Wrapper art
pokesymbols `ex-unseen-forces-pack-0..3`, opaque photos, cut by `clean_pack_art.py` in place. Raikou, Steelix, Umbreon, Typhlosion (confirmed by eye), wired to ex10-114, 109, 112, 17. Logo images.pokemontcg.io (a large one, 25 KB as webp), symbol pokesymbols `unseen-forces`.

## Prices
TCGplayer has no market price for the pack in tcgcsv (nothing listed with a market): the pack is priced at TCGplayer's own price-history bucket, newest nonzero market $2,200.00 (flat since June, no sales: transactionCount 0; the Oct 2025 bucket was $699.95). That is the largest pack price of the era and thin: used as is, never rounded. Singles 145/145 from the TCGplayer group. The box (98576) has no price either: product `booster-box`, 36 packs = $79,200.

## Products
Built: Booster Box only. The Unseen Forces blisters carry POP Series 1 promos and belong to the POP builder (e5); the Persian ex topper is not simulated; the Golden Sky and Silvery Ocean theme decks (232865/232866) are left out (no card lists, no price).
