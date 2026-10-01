# Black & White: Legendary Treasures (bw11) and the Radiant Collection

Built 2026-10-01 (builder c4). Research: `/mnt/project-files/every-era/bw/research/bw11.md`, `bw11-products.md`, `bw-pack-structure.md`, `second-source-check.md`, `bwp-claims.md`.
Release 2013-11-06. 140 cards: 115 main set (113 printed + 2 gold secrets, Reshiram 114 and Zekrom 115) and RC1-RC25 (`rcNumbers`, flagged `rc: true`; pkmn.gg and scrydex list them inside bw11, TCGplayer files them in group 1465, the config's inline `subsets` entry names it so all 140 price). Promo cards `bw11-bwp097, bwp098` (counted under bwp).
RC11 Meloetta-EX (regular art) is "Rare" on pkmn.gg; `rarityOverrides {"RC11": "Rare Holo EX"}` files it as an EX so the shared `rcUltra` pool (Rare Ultra or Rare Holo EX: RC11, RC21-25) has six cards as in EF's model. Double Colorless Energy 113 is an Uncommon trainer-like card, dealt as one.

## Pack
Ten cards, unlike any other BW set: 4 Commons, 2 Uncommons, a slot that is a reverse holo or a Rare Holo with equal odds (`holoReverse` .5, `holo: 0`), a rare slot (EX .1667, gold secret .0093, else plain Rare), then two Radiant cards: slot A an RC uncommon (.70) or an RC ultra (.30), slot B always an RC common (all holofoil prints). Source: Elite Fourum #119 (sheet model, tables) against PokeBeach's box reports (6.0 regular EX and 10.7 Radiant ultras a box), Flipside's EX 1:9 dissents. Medium-high for EX, high for the RC ultra total, medium for the 50/50 slot, medium-low for the gold secrets. No Energy in packs; no reverse Energy.

## Scans
Scrydex `bw11-<n>` and `bw11-RC<n>`. Looked at 1, 29 (EX), 113, 114 and 115 (gold secrets), RC1, RC6, RC11, RC21 and RC25 (the last card): clean. The gold secrets are all-gold Full Arts as pkmn.gg shows.

## Wrappers
pokesymbols `legendary-treasures-pack-0..3`: Genesect, Reshiram, Mewtwo, Zekrom. Packs 0 and 3 are the white wrapper design and are cropped tight at the top (no crimp, the logo touches the edge), unlike packs 1 and 2; there is no better source (Bulbapedia is behind a challenge). Viewed on dark: usable.

## Maps
TCG Live key `bw11`: 44 of 44 foil prints (30 Rare Holo, 12 EX, 2 secrets) have a map and an etch map. NONE for RC1-RC25 (probed again: not in the export), nor for the Energy: the finish agents draw those through `bwMap()`. RC cards: 25 without a map, the other 95 cards are non-foil.

## Products
Thirteen products: the Sleeved Art Bundle (276608), Eevee and Mew Three Pack Blisters (BW97 / BW98 Smooth Cosmos Holo), Aggron and Ampharos Single Pack Blisters (reprints not simulated), Legendary Dragons of Unova Collection (206316, 4 packs of the unnamed "Black & White Series"), the two Black & White Two Pack Blisters, and the five Best of Black & White Tins (4 packs "typically 1 bw10 + 1 bw9 + 2 bw8", their EX promos are the first release's cards filed with bw6 and bw8, not rebuilt here). Everything except the bundle and the Unova box is Bulbapedia-only (medium-low). Prices: packs x the $382.43 pack where TCGplayer has none; the bundle is $3,000 on TCGplayer. BW96 Tornadus-EX (Prerelease) has no product: left to bwp.
