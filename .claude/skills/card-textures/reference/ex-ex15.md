# EX era: EX Dragon Frontiers (ex15)

Built 2026-10-01 (builder e4). Research: `ex15.md`, `ex15-products.md`, `ex-pack-structure.md`, `ex-finish-types.md`, `second-source-check.md`. Release November 8, 2006. 101 cards (printed 101).

## Cards
Common 30, Uncommon 31, Rare 16, Rare Holo 12, Rare Holo EX 10, Rare Holo Star 2 (100 Charizard delta, 101 Mew delta); no secret, no Energy in packs (88 is delta Rainbow Energy, an Uncommon), no box topper.
Finish: the whole set is refractor ("no cosmos at all", COL and EF post 60), including both Gold Stars (their yellow border is plain, not foil); js/ex-foil.js's per-set rule already covers Rare Holo, Rare Holo EX and Rare Holo Star, so no `refractor` flag was needed.  The holo reverses get golden borders.
Scans: scrydex (`<set>-<n>`), mirrored at the two sizes by `mirror_images.py`'s per-set function only (the CLI also re-encodes every shared Energy and set logo into a sparse tree: do not run it with a set argument in a sparse worktree). Checked by eye: first card, a holo, an ex, the Gold Stars, an Energy, a Trainer and the last card; an automated border check (aspect 1.397 +/- 0.02, no white or transparent edge ring) found nothing in any card. None swapped for pokemontcg.io hires.

## Pack
Nine cards, late layout. `exSlots({ holo: .2417, ex: .0833, goldStar: .0083 })`: EF post 60's table (holo 54/216, ex 18/216, the two stars twice each on the 121-cell holo sheet; six boxes tallied, an uncut-sheet photo). Medium on holo and ex, low-medium on the stars. `reverseTwice` empty: EF post 60 says "21 commons twice" but gives no names.

## Wrappers
Latios & Latias, Salamence & Dragonair, Tyranitar & Tropius, Nidoking & Arbok (pokesymbols; cut in place; wired to ex15-96, 98, 99, 6).

## Prices and products
The booster pack has NO tcgcsv market price (lowest listing $3,499.99, mid $3,750): the cost is the latest market bucket of TCGplayer's own price history, $1,999.99 (weekly buckets all the way back, no recorded sale), the way dp5 and dp6 were done; `data/sealed.json` ex15 boosterPack 1999.99 and its history from backfill_prices. Singles 99 of 101 priced (100 and 101, the Gold Stars, have no market). Built: Booster Box (98532, 36 packs = $71,999.64) and the Single Blister Pack (616216, one pack, no promo named). Not built: the Power Wave and Shadow Blaze theme decks (no listing, no lists), the DF blister (2 DF + 1 other pack, POP3 Minun and Plusle holos), the checklane blister (1 DF + 1 POP2 pack, POP4 Pikachu holo).
