# XY: Steam Siege (xy11), built 2026-10-01 (builder b5)

English, 3 August 2016 (pokemontcg.io, Bulbapedia and TCGplayer group 1815 agree). 114 printed, 116 cards in packs (the two extras are the gold secrets), plus 12 promo cards of the priced products (data file 128, `totalCount` 116). Research: /mnt/project-files/every-era/xy/research/xy11.md, xy11-products.md.

## Data
- Cards: pkmn.gg `xy/steam-siege`, 116 of 116 matching the checklist; scans scrydex `xy11-<n>` (checked: first card, a Mega EX, a BREAK, a full art, both secrets).
- Wrappers: pokesymbols `steam-siege-pack-0..3`, cut out in place: Xerneas BREAK, Yveltal BREAK, Shiny Mega Gardevoir, Volcanion.
- Foil maps: TCG Live key `xy11`. 42 of 42 holo prints in the data file (promos included) have a map; no holo print lacks one (52 files shipped counting etch maps).
- Prices: tcgcsv, every single priced; booster pack $31.70, booster box $1,299.99 (data/sealed.json). Elite Trainer Box was taken out of sealed.json as a duplicate of the product row.

## Odds (per pack)
`xySlots({ holo: 0.2, ex: 0.0444, megaEx: 0.0222, ultra: 0.0587, secret: 0.008, break: 0.0667 })`. Sheet model from the Elite Fourum guide (360-pack sequence, own tally of 28 boxes), cross-checked against Derium and Danny Phantump box tallies (1,008 packs each). BREAK takes the reverse slot (Elite Fourum thread 30934 and PokeBeach). Confidence high for holo, EX, full art, BREAK; low for the Mega split (card-share assumption) and the secrets. See data/pullrates.json.

## Products
Built, all with TCGplayer ids: Elite Trainer Box (8 packs), Prerelease Kit (4 packs, one of four foil promos xyp144 to xyp147; the 23-card prerelease pack is not simulated), Lucario and Floette single pack blisters, Azelf and Rayquaza 3 pack blisters, two Collectible Pin 3 pack blisters, three Battle Heart Tins (xyp173 to 175), Mega Gyarados Collection Box (one pack each from xy6, xy5, xy11, xy8), Hoopa-EX Challenge Box (2 packs), Battle Arena Decks Keldeo vs Rayquaza (xyp177 only; decks not simulated). Products TCGplayer has no price for carry `priceDerived: "packs"` (Rayquaza blister, both pin blisters, Hoopa box).

## Oddities and open items
- XYP numbers for the Mega Gyarados box promo are unresolved in research, so it ships without one; Hoopa-EX box foil not simulated.
- Prerelease promo stamps are not simulated.
- `era: "xy"` is required in the config; promos are homed under xyp (`promoSeries.xyp`).
