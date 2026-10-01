# EX: Delta Species (ex11)

Built 2026-10-01 (builder e3). Research: `/mnt/project-files/every-era/ex/research/ex11.md`, `ex11-products.md`, `ex-pack-structure.md`, `ex-finish-types.md`, `second-source-check.md`, `box-contents.md`, `np.md`.
Release 2005-10-31 (Serebii and TCGplayer group 1429 agree). 114 cards in `data/ex11.json` (113 printed + the Azumarill secret, plus 5 NP promos `ex11-np029` to `np033`). Config `data/sets/ex11.json` (pkmn.gg `ex/delta-species`, scrydex `ex11`, artSlug `ex-delta-species`).

## Cards
Common 34, Uncommon 35, Rare 20, Rare Holo 18 (1-18, every one a Delta Species), Rare Holo EX 3 (108 Flareon ex, 109 Jolteon ex, 110 Vaporeon ex), Rare Holo Star 3 (111 Groudon, 112 Kyogre, 113 Metagross), 114 Azumarill (Rare Secret, `boxTopper: true`, never dealt). Counts match pkmn.gg and the research.

## Scans
scrydex (`ex11-<n>`), mirrored at the two sizes, all 600x838. Looked at: 1 Beedrill delta and 18 Vaporeon delta (holos, coloured delta borders), 50 Persian, 95 Holon Researcher (a Trainer), 108 Flareon ex, 111 and 113 (stars), 114 Azumarill, plus the automatic frame check of all 114 and the pack open: clean, aligned, nothing swapped.

## Pack
Nine cards, no Energy. `exSlots({ holo: 0.2963, ex: 0.0278, goldStar: 0.0093 })` from Elite Fourum post 54 (a box is 11 holos + 1 ex, or 10 holos + 1 ex + 1 Gold Star: the stars replace a HOLO here because they sit on their own cosmos sheet) and the guide's thread https://www.elitefourum.com/t/ex-power-keepers-pull-rate/28369 for one ex a box in the 3-ex sets (two sources: high on the ex count); the Gold Star rate is the guide's assumed 1 in 3 boxes (low-medium); holo medium. Sources in `data/pullrates.json`.
Reverse list 107 (34 C + 35 U + 20 R + 18 Rare Holo; Collexy's 107 matches). `reverseTwice` is EMPTY: the guide's model A (a 110-card sheet with 37 commons for the 34 in the set) means three commons are printed twice, but the post does not name them.

## What the finish agents need
- REFRACTOR: all 18 Rare Holo (1-18) are refractor ("inverse": the Pokemon is foiled, the background is not; Collexy, EF 54). `exRefractor` already matches ex11 Rare Holo, so no per-card flag is set; confidence medium-high (two sources agree). The three ex and the three Gold Stars are cosmos. Azumarill 114 (secret, a plain Pokemon): finish not stated by either source, so it gets the default `foil-holo ex-cosmos ex-secret`.
- Reverse holo: "Plain" pattern (faint sheen, no pattern in the art box; EF calls it "refractor"), set stamp bottom right; Rare and Rare Holo reverses gold name and HP, silver rarity symbol, and the Rare Holo (Delta) reverses add a holofoil border (`EX_REVERSE.ex11`: pattern plain, border holo). Elite Fourum says the Delta Species reverses reflect light better than Holon Phantoms or Crystal Guardians.
- Delta border colours are printed in the scans (the holos' borders follow the type).

## Wrapper art
pokesymbols `ex-delta-species-pack-0..3`, opaque photos, cut in place by `clean_pack_art.py`. Metagross, Salamence, Dragonite, Flareon (confirmed by eye), wired to ex11-11, 14, 3, 5. Logo images.pokemontcg.io, symbol pokesymbols `delta-species`.

## Prices
tcgcsv has no pack market price: TCGplayer's price-history bucket gives $999.00 (newest nonzero, flat, no sales; Oct 2025 bucket $749.95): used as is. Singles 112/114 priced from the group; Kyogre star (112) has no tcgcsv price and takes TCGplayer's price-history value $1,602.99, Metagross star (113) has none anywhere (it keeps the Gold Star sell value, and its history is empty). Box (98943) has no price: 36 packs = $35,964.

## Products
Built: Booster Box; the EX Collector's Carry Tin [Celebi & Suicune] (NP29 + NP30, 3 packs) and the three EX Collector's Window Tins (Moltres ex NP31, Articuno ex NP32, Zapdos ex NP33, 3 packs each). Filing the tins here is a CHOICE, flagged low-medium: np.md and pkmn.gg say only "3 EX packs" (the window tins "Team Rocket Returns through Legend Maker", Bulbapedia's excerpt; a November 2005 tin cannot hold Legend Maker, which came out in February 2006), so they open as Delta Species packs, the newest set that month (31 Oct 2005). Each is priced 3 packs of the Delta Species pack price plus its promo(s). The Breakthrough and Steeplechase theme decks (232863/232864) are left out (no card lists, no price), as is the Azumarill topper.
