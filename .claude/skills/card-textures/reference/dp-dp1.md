# Diamond & Pearl: Diamond & Pearl (dp1)

Built 2026-10-01 (builder d1). Research: `/mnt/project-files/every-era/dp/research/dp1.md`, `dp1-products.md`, `dpp-claims.md`, `dp-pack-structure.md`, `second-source-check.md`.
Release 2007-05-23 (Serebii, Bulbapedia, TCGplayer). 130 cards as pkmn.gg lists them (C 39 + 8 basic Energy, U 38, R 25, RH 17, LV.X 3), plus six promos filed as `dp1-dppNN` and counted under the DP Black Star Promos.

## Pack
Ten cards (5 Commons, 3 Uncommons, a Mirror reverse, a rare slot), no code card. Rare slot from Elite Fourum's sheet model (216 packs): Rare .6667, Rare Holo .3056, LV.X .0278 (one a box; Flipside Gaming's "about 1:36" is the second source). The eight basic Energy 123-130 are on the commons sheet, 1 of 121 each, so 0.33 a pack (`commonEnergy`, `energyPrint: "own"`). Medium confidence; the holo split has no second tally. data/pullrates.json.

## Scans and wrappers
Scrydex ids `dp1-<n>`. Looked at the first (Dialga), Lucario, Palkia, Gengar, the three LV.X and the last (Metal Energy): clean, no white borders. Nothing swapped.
Wrappers: pokesymbols `diamond-and-pearl-pack-0..3` are opaque photos on white; `clean_pack_art.py` cut them in place (never committed before). Palkia, Lucario, Dialga, Electivire (names match the art on a dark background).

## Maps
TCG Live has none for this generation (scaffold probe, 40 keys). Nothing under assets/foil/. The scrydex scans of the holos have the cosmos sparkle baked in.

## Products
Six built (no TCGplayer listing for any of them, so no photo; priced as packs x the $195 pack plus the promo, `priceDerived: "packs"`): the Three Pack Blisters [Turtwig] DP01, [Chimchar] DP02, [Piplup] DP03 (2 dp1 packs; the real blister also held one late EX pack, not simulated) and the Collector's Tins [Torterra LV.X] DP09, [Infernape LV.X] DP10, [Empoleon LV.X] DP11 (2 dp1 + 2 dp2 packs: one source, medium-low; the international tin was four dp1 packs).
Left out: booster box (TCGplayer 98524 has no price, so no box offer, as for xy4), the three theme decks (228804-6: only a lowest listing of $399.99 for two of them, none for Royal Frost; no deck list and no known deck-exclusive holo, so nothing to open), Pachirisu two-pack blister DP04 (one source, set mix unread), Special Edition Blister, Spring 2007 Collector's Tin and Enhanced Value Pack (EX-series packs only, no price source), Classic Trio Box (low).
The $195 TCGplayer pack is thin; used as it stands.
