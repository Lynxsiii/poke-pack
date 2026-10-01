# EX: Deoxys (ex8)

Built 2026-10-01 (builder e2). Research: `/mnt/project-files/every-era/ex/research/ex8.md`, `ex8-products.md`, `ex-pack-structure.md`, `ex-finish-types.md`, `second-source-check.md`. Released 2005-02-14 (Serebii and TCGplayer agree). 108 cards (107 printed).

## Cards
Rare Holo 15, Rare Holo EX 9 (96 Crobat ex, 97 Deoxys ex Normal Forme, 98 Deoxys ex Attack Forme, 99 Deoxys ex Defense Forme, 100 Hariyama ex, 101 Manectric ex, 102 Rayquaza ex, 103 Salamence ex, 104 Sharpedo ex), Rare Holo Star 3 (105 Latias, 106 Latios, 107 Rayquaza), Rare 14, Uncommon 34, Common 32, Rare Secret 1 (108 Rocket's Raikou ex, the box topper, `boxTopper: true`, never dealt). Counts match pkmn.gg and the research. Scans: scrydex (`<id>-<n>`, byte-identical to pokemontcg.io's hires, so there was no better source to swap to), mirrored at 600 and 320 px WebP. I looked at the first card, a Rare Deoxys, Vigoroth, Scramble Energy, Deoxys ex, Rayquaza ex, the three Gold Stars, Rocket's Raikou ex and a Stadium: full cards, square-cropped, no white borders, no crooked crops, no watermarks; the printed foil sparkle of the holos is baked into the scan (as in the DP era). None swapped.

## Pack
Nine cards (5 C, 2 U, 1 reverse, rare slot); no Energy, no code card. `exSlots({ holo: .25, ex: .0741, goldStar: .0093 })`: Elite Fourum posts 46 and 48 (only 4 box openings exist on YouTube: all 9 holos, 3 ex and no Gold Star; the star rate is an assumption borrowed from the other sets, one box in 3, the star replacing an ex), the same sheet design as Team Rocket Returns minus the secret. Low-medium throughout, no second tally. Simulated 20,000 packs: holo .251, ex .0756, star .0095, no box topper.
Reverse: 95 reverse cards; 15 reverse commons twice (EF post 48), unnamed: `reverseTwice` is `[]`. Family `wheel` (ten alternating wedges in the art box) with the set stamp; the only set with this pattern.

## Finish notes for the finish agents
Gold Stars are cosmos with a yellow border. Theme-deck exclusives (Starcharge's holo Deoxys, Jetstream's holo Rayquaza, PKGG only) are not built.

Maps: none (TCG Live has no EX maps; js/ex-foil.js `exMap` is the finish agents' hook). Finish classes come from `exPattern`: Rare = `foil-none`, Rare Holo = `foil-holo ex-cosmos`, Pokémon-ex = `foil-ex ex-ex`.

## Wrapper
Deoxys Attack Forme style, Deoxys Normal, Rayquaza, Deoxys Defense Forme style (the pokesymbols labels name only packs 2 and 3; packs 0, 1 and 3 are named by eye from the art: orange spiked arms, the brown Normal body, the orange shield; wired to ex8-98, 97, 102, 99). Source: pokesymbols.com `ex-deoxys-pack-N.avif`, flat photos, cut with `clean_pack_art.py` in place. Usable; the Defense wrapper has a slightly ragged lower edge.

## Prices
TCGplayer lists no market price for the pack (lowest ask about $4,000): $1,699.99 is its price-history value (weekly, 2026-09-28; $1,599.99 a year ago): thin, over $300 a pack, used as it is in `data/sealed.json` and the catalog cost. The box is 36 packs ($61,199.64). Singles: Latias ★ and Rayquaza ★ have no tcgcsv market price, so their `market` is the last point of TCGplayer's history ($1,550, $2,500.99); Latios ★ $1,500.

## Products
Booster Box (98563) only. The EX Collector's Window Tins (NP 031-033) are filed under ex11 by builder e3. Left out: the Starcharge and Jetstream theme decks (no lists, no market price), the DF blister (POP 3 promos: the POP series builder) and the EX Collector's Box [Deoxys] / [Rayquaza] (210198 / 210199: three packs and two POP Series 1 packs of an unstated set, one TCGplayer text, low).
