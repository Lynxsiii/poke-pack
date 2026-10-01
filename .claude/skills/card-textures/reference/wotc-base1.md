# Wizards of the Coast: Base Set (base1)

Built 2026-10-01 (builder w1). Research: `/mnt/project-files/every-era/wotc/research/base1.md`, `base1-products.md`, `theme-decks.md`, `starter-and-gift-sets.md`, `basic-energy.md`, `wotc-pack-structure.md`, `second-source-check.md`. Release 1999-01-09. 102 printed cards, English Unlimited prints only.

## Cards
Rare Holo 16, Rare 16, Uncommon 32, Common 32, and the set's own six basic Energy (numbers 97-102, rarity "Energy"; `energyPrint: "own"`, so a pack's Energy slots deal these and not the shared Energy). Machamp (base1-8) is `noPack` (the 1st Edition holo of the 2-Player Starter Set only; the engine keeps it out of packs and the starter product deals it as its one promo). Scans: scrydex (`base1-<n>`), mirrored at the two sizes. Every digital source (scrydex, pkmn.gg, pokemontcg.io) carries the 1st Edition print (the Edition 1 stamp), no Unlimited scan is available; the decision that 1st Edition and Shadowless are not separate cards stands, so the dealt art is the stamped scan. I looked at 8+ by eye (first, a holo, a Trainer, an Energy, the last, two commons); none was crooked, bordered or washed, none swapped.
Prices: TCGplayer group 604, Unlimited subtype preferred (`fetch_tcgplayer_prices.py` now takes "Unlimited Holofoil"/"Unlimited" when the group lists 1st Edition and Unlimited rows, and norm() maps the Impostor/Imposter typo); Charizard base1-4 $944.53, Blastoise $222.34. History from `backfill_prices.py` (VARIANT_ORDER gained the Unlimited names).

## Pack
Eleven cards: 5 Commons, 3 Uncommons, 2 own Energy, one rare slot (Rare Holo 1 pack in 3, `holo: 0.3333`, else a plain Rare). `wotcSlots({ commons: 5, energy: 2, holo: 0.3333 })`; no reverse. Sources are those cited above wotcSlots (WotC chat 3 Feb 2000, PSA, Flipside, Elite Fourum). No odds invented.

## Wrapper
Three wrappers (pack-0 Charizard, pack-1 Venusaur, pack-2 Blastoise, wired to base1-4, 15, 2), from the pokesymbols booster-pack-art photos; the Base Set file had a wide white margin that `scripts/clean_pack_art.py` could not remove, so it was cut by hand (scratch `cutbase1.py`) and judged on a dark background. Old files from the retired base1 wrappers remain unused under assets/packs/base1.

## Products
Booster Box (36 packs; TCGplayer lists no market for the Unlimited box, the one listing asks $100,000, so it is priced at 36 packs, `priceDerived: "manual"`, $33,392.16), 2-Player Starter Set (Machamp holo base1-8 as its promo; the deck lists are not on record, so no box-contents row), four theme decks (Blackout, Brushfire, Overgrowth, Zap!): each is `kind: "deck"`, no packs, its featured holo as the one promo (7, 12, 6, 10) and a box-contents row of the other 59 cards from the research lists (`scripts/box-research/wotc-w1.json`). Zap! and Grass Chopper prices come from stale TCGplayer history buckets (marked manual). Not built: 1st Edition boxes (not separate here), Psych Out (no price anywhere).
