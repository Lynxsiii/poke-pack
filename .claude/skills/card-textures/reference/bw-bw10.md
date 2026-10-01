# Black & White: Plasma Blast (bw10)

Built 2026-10-01 (builder c4). Research: `/mnt/project-files/every-era/bw/research/bw10.md`, `bw10-products.md`, `bw-pack-structure.md`, `second-source-check.md`, `bwp-claims.md`.
Release 2013-08-14. 105 cards (101 printed + 4 secrets) on pkmn.gg, scrydex and TCGplayer, all in the file; rarities match the research (C26 U33 R15 RH11 EX6 RU6 ACE4 RS4). Promo cards `bw10-bwp081..083, 085, 086, 099` (counted under bwp, `totalCount` stays 105).

## Pack
Ten cards: 5 Commons, 3 Uncommons, a reverse, a rare slot; no Energy. Ace Specs (92-95, "Rare ACE") take the REVERSE slot (`aceSpec` .0417). Rare slot: holo .2407, EX .0556, full art .0281, secret .0089 (full art and the four gold secrets share one sheet: secret is 24% of it, an EF assumption). Source: Elite Fourum's 216-pack model against its 29-box tally, PokeBeach box reports, Flipside; only EF is a tally (medium; medium-low for the ultra / secret split and the Ace Spec rate). The Team Plasma blue-border sub-sheets are not modelled. `reverseRarities` = C/U/R (Rare Holos have no reverse print in BW). Sources in data/pullrates.json.

## Scans
Scrydex `bw10-<n>`. Looked at 1, 11 (EX), 66, 74 (holo), 97, 101 (full arts), 93 (Ace Spec), 102 and 105 (secrets): clean, no white edges. Promo scans (scrydex `bwp-BW81`...) checked.

## Wrappers
pokesymbols `plasma-blast-pack-0..3`: Porygon-Z, Genesect, Palkia, Dialga (second source Bulbapedia's booster-pack table). Flat rectangular renders, no wrapper silhouette, so `clean_pack_art.py --check` lists them as opaque but they have no white margin strip (left/right 8 px: 0-11% near-white, only where the art is white); not cut. Viewed on a dark background: clean.

## Maps
TCG Live key `bw10`: 31 of 31 foil prints have a map (11 Rare Holo, 6 EX, 6 full art, 4 ACE, 4 secret), each with an etch map, none for the other 74 cards (they are not foil). Overlaid on the scans (Porygon-Z, Palkia-EX, Genesect-EX FA, Exeggcute, G Scope): aligned. Full arts and secrets come out near all-white, as TCG Live draws them.

## Products
Ten products built (23 with bw11): Elite Trainer Box (8 packs, no TCGplayer listing, B + ToyWiz), the Sleeved Art Bundle (276604), Lucario and Genesect Three Pack Blisters (BW85 / BW86 Cosmos Holo), Blaziken and Krookodile Single Pack Blisters (the Cosmos reprints of bw5 cards are not simulated), the three Team Plasma Tins (137095-137097, BW81 Thundurus-EX, BW82 Deoxys-EX, BW83 Lugia-EX; 4 packs "typically 2 bw10 + 1 bw9 + 1 bw8", Bulbapedia only), Red Genesect Collection (BW99; its Parallel Holo deck is not simulated; the pack set is not named by the source: two bw10). Theme decks Mind Wipe / Solar Strike are box contents (c5). Prices: TCGplayer where listed (Lugia tin $3,500, Deoxys tin $1,000), else packs x the $275.45 pack plus the promos (`priceDerived: "packs"`). Booster box has no TCGplayer price. BW84 Porygon-Z (Prerelease) has no product: left to the bwp pseudo-set. All BW promos are listed Holofoil on TCGplayer: `foilAs` Rare Holo EX for the tins, Rare Holo for the rest.
`build_products.py` now accepts a product with no `tcgplayerId` (no market lookup, no photo, price from packs).
