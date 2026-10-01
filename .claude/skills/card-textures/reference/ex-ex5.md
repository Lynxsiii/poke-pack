# EX: Hidden Legends (ex5)

Built 2026-10-01 (builder e2). Research: `/mnt/project-files/every-era/ex/research/ex5.md`, `ex5-products.md`, `ex-pack-structure.md`, `ex-finish-types.md`, `second-source-check.md`, `np.md`. Released 2004-06-14 (Serebii and TCGplayer agree; pkmn.gg gives the month). 102 cards (101 printed).

## Cards
Rare Holo 15, Rare Holo EX 9 (93 Groudon ex, 94 Kyogre ex, 95 Metagross ex, 96 Ninetales ex, 100 Vileplume ex, 101 Wigglytuff ex on the cosmos sheet; 97 Regice ex, 98 Regirock ex, 99 Registeel ex CRACKED ICE), Rare 12, Uncommon 33, Common 32, Rare Secret 1 (102 Groudon, the box topper: `boxTopper: true`, never dealt). Counts match pkmn.gg and the research. Cracked ice is flagged on 97-99 (`crackedIce: true`; js/ex-foil.js `isCrackedIce` already knows the set rule). Scans: scrydex (`<id>-<n>`, byte-identical to pokemontcg.io's hires, so there was no better source to swap to), mirrored at 600 and 320 px WebP. I looked at the first card, five holos, a Rare, an ex, the three Regis, the secret, a Trainer (the Technical Machine) and the last card: full cards, square-cropped, no white borders, no crooked crops, no watermarks; the printed foil sparkle of the holos is baked into the scan (as in the DP era). None swapped.

## Pack
Nine cards: 5 Commons, 2 Uncommons, 1 reverse, 1 rare slot (late layout); no Energy, no code card. `exSlots({ holo: .25, ex: .0556, exCracked: .0278 })`: Elite Fourum post 40 (8 boxes, 216-pack table: 54 holo, 12 cosmos ex, 6 cracked-ice ex) with PokeGym 19395 (3 ex a box). The cracked-ice split is one source: medium-low. Simulated 20,000 packs: 9 distinct cards each, holo .254, ex .083, no box topper.
Reverse: 92 reverse cards (`reverseRarities` Common/Uncommon/Rare/Rare Holo), uniform. EF's 110-cell reverse sheet doubles 2 commons but the post names none (table note "RE2 not enough information"), so `reverseTwice` is `[]`. Family `energy` (js/ex-foil.js EX_REVERSE: a column of type symbols in the art box, a holofoil type stamp on Rare and Holo Rare reverses).

## Finish notes for the finish agents
Cracked ice: the three Regi ex only (97, 98, 99); some real copies peeled to plain cosmos. Groudon 102 is cosmos but never appears in packs. Gold Star: none in the set. The dot strip is gone from this set on.

Maps: none (TCG Live has no EX maps; js/ex-foil.js `exMap` is the finish agents' hook). Finish classes come from `exPattern`: Rare = `foil-none`, Rare Holo = `foil-holo ex-cosmos`, Pokémon-ex = `foil-ex ex-ex`.

## Wrapper
Metagross, Regirock, Registeel, Regice (pokesymbols labels, checked by eye against the art; wired to ex5-11, 98, 99, 97). Source: pokesymbols.com `booster-pack-art/ex-hidden-legends-pack-N.avif` (N 0-3): flat photos of the real wrappers, opaque with a white margin; `scripts/clean_pack_art.py` cut them in place (new files, so no -v2). A little soft; judged on a dark background: usable.

## Prices
TCGplayer pack $800.00 (market, a thin listing; low $1,000). All 102 singles priced (Groudon ex $313, Registeel ex $300). The box has no market price: its one listing ($52,400, the mid price) is used as it is, so a box costs more than 36 packs ($28,800).

## Products
Booster Box (98596, 36 packs). EX Value Pack II [Typhlosion] (NP 034, Sep 2006; three EX packs, one each of Magma/Aqua, Hidden Legends and Team Rocket Returns: Bulbapedia via a search excerpt, low-medium) was built here first (`from` {ex4: 1, ex5: 1, ex7: 1}) and then DROPPED: builder e1 had already filed NP 034 under ex4 (`ex4-np034`), and a promo number is built once (test-np). Left out: the two theme decks "Forest Guardian" and "Wish Maker" and the deck display (no card lists, no market price).
