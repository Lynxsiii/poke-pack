# Wizards of the Coast: Legendary Collection (base6)

Built 2026-10-01 (builder w2). Research: `/mnt/project-files/every-era/wotc/research/base6.md`, `base6-products.md`, `wotc-pack-structure.md`, `second-source-check.md`, `theme-decks.md`.
Release 2002-05-24 (Bulbapedia, pkmn.gg). pkmn.gg files it under series `other`. A reprint set (all 19 holos are Base Set to Team Rocket cards), **Unlimited only** (no 1st Edition exists). 110 cards (110 printed): Rare Holo 19, Rare 19, Uncommon 36, Common 36 (Full Heal Energy 100 and Potion Energy 101 are special Energy, Uncommon; no basic Energy). Counts match pkmn.gg and the research. The reverse print of every card is dealt from the pack, not a card of its own.

## Scans
Scrydex ids are the set id (`base6-<n>`), mirrored at the two sizes. Looked at all 110 on contact sheets: clean, aligned, no stamp (these are the right prints), no borders. The holo scans carry the printed starburst foil already, as the other vintage holos do. None swapped.

## Pack and the reverse slot
Eleven cards: 6 Commons, 3 Uncommons, **one reverse holo**, a rare slot; no Energy. `wotcSlots({ commons: 6, holo: 0.3333, reverseSlot: true })`, `reverseRarities ["Common", "Uncommon", "Rare", "Rare Holo"]`: the reverse is any of the 110 cards, uniform (Elite Fourum's reverse sheet, one of each: 1 pack in 110; Bulbapedia "each card ... also available as Reverse Foils"), so a holo's reverse can come out (about 0.17 of packs; medium). PSA 9582 for the 3 U + 6 C + 1 reverse + 1 rare and holo 1 in 3; Elite Fourum's combined sheet reproduces 2.95 U and 6.06 C. 20,000 packs: 11 cards, exactly one reverse, holo 0.339, no duplicate.

## Finish
Regular holos: `wotc-cosmos`. The reverse is the new Legendary Collection reverse (foil over everything but the art, the "fireworks" / "wheel" pattern: Bulbapedia, PSA 9581/9582): `reverseFinish` returns `wotc-legendary` by set id (js/wotc-foil.js; `foilExtras` adds `wotc-rev-legendary`). Nothing in the data. No TCG Live maps.

## Wrapper
Four trios, pokesymbols `legendary-collection-pack-N`: 0 Kanto starters (Venusaur, Charizard, Blastoise), 1 the legendary birds, 2 Flareon, Vaporeon, Jolteon, 3 Mewtwo, Machamp, Alakazam. PS only (PSA 9582 does not name them): medium. Wired to base6-3, 19, 10, 15. Cut out in place, checked on dark.

## Prices
TCGplayer group 1374, Normal / Holofoil rows, all 110 priced ($0.32 to $899.99 Charizard; Gengar $289.99, Dark Dragonite $243.11). **Oddity: the pack has no tcgcsv market price** (lowest listing $7,000). `data/sealed.json` carries **$2,499.99**: the market bucket of TCGplayer's own price history for product 138150 (weekly through 2026-09-28, 0 sales in every bucket), the same fallback dp5 and dp6 used. Far over $300 a pack. The box (691155) has no price or history: `booster-box` at 36 packs, $89,999.64.

## Products
Built: Booster Box (kind `collection`). **Box toppers not simulated**: one of four oversize (126.5 x 90.0 mm) reverse-holo cards per box (S1 Charizard 210841, S2 Dark Blastoise 210842, S3 Dark Raichu 210843, S4 Mewtwo 210844, TCGplayer group 1528; PSA 9582, Bulbapedia): not pkmn.gg cards, three have no price (only S2 has: $399.99), and the Mewtwo S4 has no card of this set to copy. The Lava (450748) and Turmoil (451094) theme decks are not products here: no TCGplayer price and a pack-less deck cannot be offered (61 cards with a random reverse and non-holo prints of Charizard / Dark Blastoise / Dark Raichu; lists in `theme-decks.md`).
