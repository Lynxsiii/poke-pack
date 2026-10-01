# Wizards of the Coast: Gym Challenge (gym2)

Built 2026-10-01 (builder w2). Research: `/mnt/project-files/every-era/wotc/research/gym2.md`, `gym2-products.md`, `basic-energy.md`, `wotc-pack-structure.md`.
Release 2000-10-16 (Bulbapedia, PSA 9378, pkmn.gg). English Unlimited prints only. 132 cards (132 printed): Rare Holo 20, Rare 21, Uncommon 42, Common 43, **Energy 6** (127-132, the set's own). Counts match pkmn.gg. Two names carry the Nidoran signs (75 and 76: "Giovanni's Nidoran ♀ / ♂"), which `fetch_tcgplayer_prices.py` now normalises ("Giovanni's Nidoran F / M" on TCGplayer).

## Scans (the one problem)
Scrydex ids are the set id, mirrored at the two sizes. Looked at all 132 on contact sheets: clean, aligned, no borders or watermarks. **Every Pokémon and Trainer scan is the 1st Edition print** (the "Edition 1" stamp; see wotc-base5.md): none swapped, no Unlimited source.

## Pack
Eleven cards: 6 Commons, 3 Uncommons, 1 basic Energy, a rare slot; no reverse. `wotcSlots({ commons: 6, energy: 1, holo: 0.3333 })`, `energyPrint: "own"`. Holo 1 in 3 (WotC chat, PSA 9378, Flipside, Elite Fourum 10 holos at x6 and 10 at x5); the Energy slot is Elite Fourum's (11 tallied boxes) with PSA's 7 commons: medium-high. 20,000 packs: holo 0.331, 1 Energy, 6 C, 3 U, no duplicate.

## Maps and finish
No TCG Live maps. Rare Holo = `wotc-cosmos`; the rest unfoiled.

## Wrapper
Four, pokesymbols `gym-challenge-pack-N`: 0 Sabrina, 1 Blaine, 2 Koga, 3 Giovanni (PSA 9378 names the same four). Wired to the Gym Leader holos gym2-20, 17, 19, 18. Cut out in place, checked on dark.

## Prices
TCGplayer group 1440, Unlimited rows, all 132 priced ($0.51 to $584.96 Blaine's Charizard; Rocket's Mewtwo $258.69, Sabrina's Gengar rare $218.88). **Pack $419.99 (market), over $300** (thin: its low and market are both $419.99). The Unlimited box (285314) has no TCGplayer price: `booster-box` at 36 packs, $15,119.64.

## Products
Built: Booster Box. The four theme decks (Sabrina 277126 mid $999.98, Koga 277129 mid $450.00, Blaine 277112 and Giovanni 277128 unpriced) are not products here: a pack-less, promo-less deck is not offered by `promoOffers` and fails test-products if listed. Left out: the 1st Edition pack and box.
