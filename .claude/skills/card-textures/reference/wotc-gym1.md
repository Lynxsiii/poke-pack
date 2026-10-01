# Wizards of the Coast: Gym Heroes (gym1)

Built 2026-10-01 (builder w2). Research: `/mnt/project-files/every-era/wotc/research/gym1.md`, `gym1-products.md`, `basic-energy.md`, `wotc-pack-structure.md`, `second-source-check.md`.
Release 2000-08-14 (Bulbapedia, PSA 9353, PokeBeach, pokemon1999.org, pkmn.gg; TCGplayer's 2000-10-14 is wrong). English Unlimited prints only. 132 cards (132 printed): Rare Holo 19, Rare 23, Uncommon 42, Common 42, **Energy 6** (127-132, the set's own basic Energy, rarity `Energy` after build_set; pkmn.gg's Common 48 includes them). Energy Flow 122 is a Trainer. Counts match pkmn.gg.

## Scans (the one problem)
Scrydex ids are the set id, mirrored at the two sizes. Looked at all 132 on contact sheets: clean, aligned, no borders or watermarks. **Every Pokémon and Trainer scan is the 1st Edition print** (black "Edition 1" stamp on the left under the art; the same image on every source, see wotc-base5.md); the six basic Energy carry the small 1st Edition mark in the top corner on most. No Unlimited scan exists on a mirrorable source: none swapped. A rescan or a retouch of the stamp is the fix.

## Pack
Eleven cards: 6 Commons, 3 Uncommons, **1 basic Energy**, a rare slot; no reverse. `wotcSlots({ commons: 6, energy: 1, holo: 0.3333 })`, `energyPrint: "own"` (the Energy are the set's own 127-132, uniform: Elite Fourum's one at x21, five at x20 per 121). Holo 1 in 3 (WotC chat, PSA 9353, Flipside, Elite Fourum); the Energy slot rests on Elite Fourum with PSA's "7 commons" consistent: medium-high. 20,000 packs: holo 0.336, 1 Energy, 6 C, 3 U, no duplicate. Stadiums are non-holo (PSA 9353).

## Maps and finish
No TCG Live maps for the era. Rare Holo = `wotc-cosmos` over the art window; Rare / Common / Uncommon / Energy unfoiled.

## Wrapper
Four, pokesymbols `gym-heroes-pack-N`: 0 Lt. Surge, 1 Erika, 2 Brock, 3 Misty (PSA 9353 names the four). Wired to the Gym Leader holos gym1-17, 16, 15, 18 (Lt. Surge, Erika, Brock, Misty). Cut out with clean_pack_art.py in place and checked on dark. These are Unlimited wrappers (no 1st Edition circle).

## Prices
TCGplayer group 1441, Unlimited rows, all 132 priced ($0.41 to $505.36 Sabrina's Gengar; Blaine's Moltres $138.50). **Pack $269.72 (market)**, near $300. TCGplayer lists no box price (208708): `booster-box` at 36 packs, $9,709.92 (`priceDerived: packs`).

## Products
Built: Booster Box. The four theme decks Misty (234501), Brock (234502), Erika (234503), Lt. Surge (451095) are not products here: TCGplayer lists them with no price at all (never invent one) and a pack-less deck cannot be offered by `promoOffers`; their lists are in `theme-decks.md`. Left out: the 1st Edition pack and box. A Gym Heroes pack is one of the three in the Thunderstorm / Tempest gift box (gift sets are w5's).
