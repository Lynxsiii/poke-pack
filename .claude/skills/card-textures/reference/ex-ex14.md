# EX era: EX Crystal Guardians (ex14)

Built 2026-10-01 (builder e4). Research: `ex14.md`, `ex14-products.md`, `ex-pack-structure.md`, `ex-finish-types.md`, `second-source-check.md`. Release August 30, 2006. 100 cards (printed 100).

## Cards
Common 29, Uncommon 30, Rare 16, Rare Holo 13, Rare Holo EX 10, Rare Holo Star 2 (99 Alakazam, 100 Celebi); no secret, no holo Energy, no box topper.
Mixed finish, decided per card from the scans and written into `cardFlags` on all 25 holo-class cards: `refractor: true` + `deltaSheet: true` on 2 Blastoise delta, 4 Charizard delta, 6 Ludicolo delta (Rare Holo) and 96 Sceptile ex delta (Rare Holo EX): the scans show the foil on the Pokémon with a calmer backdrop (research: refractor, EF post 58 and Collexy, with a holofoil yellow border on the reverses of the three holos). `refractor: false` on the other ten holos (Banette ... Wigglytuff), the nine other ex and both Gold Stars: a speckled cosmos sparkle across the art box in the scans. This matches EF post 58 and Collexy; the engine's `deltaSheet` pools deal the four delta cards only through `deltaHolo` / `deltaEx`. The reverse holos of the three delta holos get golden borders (EX_REVERSE border "delta"); Sceptile ex has no reverse.
Scans: scrydex (`<set>-<n>`), mirrored at the two sizes by `mirror_images.py`'s per-set function only (the CLI also re-encodes every shared Energy and set logo into a sparse tree: do not run it with a set argument in a sparse worktree). Checked by eye: first card, a holo, an ex, the Gold Stars, an Energy, a Trainer and the last card; an automated border check (aspect 1.397 +/- 0.02, no white or transparent edge ring) found nothing in any card. None swapped for pokemontcg.io hires.

## Pack
Nine cards, late layout. `exSlots({ holo: .1873, deltaHolo: .0556, ex: .0741, deltaEx: .0093, goldStar: .0071 })`: EF post 58's four rare-slot sheets (42 / 12 / 16 / 2 per 216 packs, seven boxes tallied) with PokeGym 41117 and 40141 (24 boxes, 3.04 ex a box, 0.17 stars). Boxes really vary from 1 to 6 ex; each pack here is independent. Gold Stars low-medium (the two samples disagree), the delta split is the sheet model. `reverseTwice` empty: EF post 58 says "22 reverse commons twice" on a 10x11 sheet but its table says "not enough information on individual cards", so no card is named.

## Wrappers
Jirachi, Blaziken, Charizard, Delcatty (pokesymbols, light-blue crystal backdrop; cut in place; wired to ex14-94, 90, 4, 91).

## Prices and products
Pack $1,299.99 (market, a low sample; lowest listing $2,299.99). Singles 100 of 100 priced. Built: Booster Box (98567, 36 packs = $46,799.64). The three NP Collector's Tins (Kyogre ex, Groudon ex, Rayquaza ex: 2 Emerald + 2 Crystal Guardians packs) are filed under ex9 by e3 with `from: {ex9: 2, ex14: 2}`, so their ex14 packs are priced from this pack. Not built: the three theme decks (no TCGplayer listing, no lists), the CG blister (3 packs, mix not stated, POP2 Pidgeot and Tauros holos), the Crystal Trainer Set (POP3 Blastoise holo, contents not established).
