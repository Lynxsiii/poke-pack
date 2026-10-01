# XY: Kalos Starter Set (xy0), built 2026-10-01 (builder b5)

English, 8 November 2013. Three fixed 39-card decks (Chespin, Fennekin, Froakie), filed as products like the Sun & Moon trainer kits; the set has no packs, `promoSet: true`, packSize 0, no wrappers. 39 cards plus three holo prints (one per deck: Chesnaught, Delphox, Greninja), data file 42, `totalCount` 42. Research: /mnt/project-files/every-era/xy/research/xy0.md, trainer-kits-and-energy.md, box-contents.md.

## Data
- Cards: pkmn.gg `xy/kalos-starter-set`, 39 of 39; scans scrydex `xy0-<n>`. pkmn.gg rarities were null for the set; they are normalised (Common and so on) in the data, and the holo prints are patched to Holofoil prices with printedNumber "n/39". TCG Live has no foil maps for xy0: foil map coverage 0 of 3 (the holo prints use `keepScan` and `foilAs: Rare Holo`, so the engine falls back to the rarity pattern).
- Prices: tcgcsv group 1522; singles priced. TCGplayer has no market price for the sealed decks, so each deck is priced manually as the sum of its singles, with `priceSource` set and `priceDerived: "manual"` (81.02 Chespin, 26.04 Fennekin, 44.08 Froakie).

## Decks
Deck lists live in data/box-contents.json (label "40-card deck" style rows). Confidence medium: read from search extracts of Bulbapedia and pokemoncard.io deck pages; two sources agree on the totals. The single holo per deck is inferred from "final evolutions holofoil".

## Oddities and open items
- Theme decks, Legendary Battle Decks, Deluxe Kalos decks and the Mini Pack were not built.
- No pull rates (no packs).
