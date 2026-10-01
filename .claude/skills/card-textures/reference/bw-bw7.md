# Black & White: Boundaries Crossed (bw7)

Built 2026-10-01 (builder c3). Research: `/mnt/project-files/every-era/bw/research/bw7.md`, `bw7-products.md`, `bwp-claims.md`, `bw-pack-structure.md`, `second-source-check.md`.
Release 2012-11-07. 153 cards (149 printed + 4 gold secrets: Golurk, Terrakion, Altaria, Rocky Helmet), pkmn.gg and pokemontcg.io agree: C 50, U 43, Rare 17, Rare Holo 20, Rare Ultra 9 (six full-art EX and Bianca, Cheren, Skyla), Rare Holo EX 6, Rare ACE 4, Rare Secret 4. Five promo cards (counted under bwp, `bw7-bwp054`...).

## Pack
Ten cards: 5 Commons, 3 Uncommons, a reverse holo, a rare slot; no Energy (EF per-set table #114, ToyWiz "[10 Cards]", Bulbapedia Booster pack, wrapper "10 ADDITIONAL GAME CARDS"). The first Ace Specs take the REVERSE slot (EF #113/#114; pkmn.gg lists every Ace Spec as holofoil only; PokeBeach "2 Ace Specs per box"): `bwSlots({ holo: .2269, ex: .0556, ultra: .0407, secret: .0102, aceSpec: .0556 })`. EF is the one source for the numbers (a modelled 216-pack case, 28 boxes watched); PokeBeach and Flipside are coarse checks. EX high, Ace Spec medium-high, holo and the full-art / secret split (secrets are 20% of the shared sheet, EF's own "just an assumption") medium. 20,000 simulated packs reproduce every rate to the fourth decimal. Details and links: data/pullrates.json.
Reverse pool: Common, Uncommon, Rare and Rare Holo (TCGplayer lists a Reverse Holofoil price row for every one of them and for no EX, Ace Spec, full art or secret).

## Scans and wrappers
Scrydex `bw7-<n>/large` for all 153. Looked at 1, 48, 49, 107, 128, 145, 150, 153 (and the five promos): clean, no white borders, no crooked crops. Wrappers: pokesymbols `boundaries-crossed-pack-0..3` (opaque; cut with clean_pack_art.py, in place because they were new files). Keldeo, White Kyurem, Black Kyurem, Landorus, matching Bulbapedia's wrapper table. The ice-crimp top of the pack is white-blue frost in the artwork, not leftover background.
Logo: images.pokemontcg.io/bw7/logo.png; symbol: pokesymbols `boundaries-crossed`.

## Maps
TCG Live key `bw7`: 43 of 43 foil prints (Rare Holo 20, Rare Holo EX 6, Rare Ultra 9, Rare Secret 4, Rare ACE 4), none for any other card; 13 of them carry an etch map (full arts and secrets). Promo prints from `bwbsp`: BW56, BW57, BW60 (BW54 and BW55 are non-holo and have none). Overlaid on the scans (Keldeo, Keldeo-EX, Computer Search, Black Kyurem-EX FA, Golurk, Celebi-EX and the promos): they match the printed foil regions. The Ace Spec map covers the border, name strip, the ACE SPEC text and the artwork background, as Bulbapedia describes it.

## Prices
Singles: tcgcsv group 1408, 153 of 153 matched. The booster pack has no market price in the tcgcsv feed; TCGplayer's own product page (mp-search-api, product 98554) says market $246.11, which is `cost` and the `boosterPack` in data/sealed.json (the booster box has no price anywhere, so no box is sold). Thin market: sealed Black & White packs trade rarely.

## Products
Built: Keldeo Box (206308: BW60; 3 packs, typically 2 Dragons Exalted + 1 Noble Victories, Bulbapedia only), the Empoleon and Haxorus 3 Pack Blisters (BW56, BW57), the Raichu-line and Beheeyem-line Stage 1 Blisters (BW54 Pikachu, BW55 Elgyem; the Cosmos Holo reprints from Next Destinies and the Sampling Pack are not simulated). All priced from their packs (`priceDerived`): TCGplayer lists none of them but the Keldeo Box, and that has no market price.
Not built: the two theme decks "Ice Shock" (208573, no price) and "Cold Fire" (208574, $189.95 but no packs and no promo card: the shop has nothing to sell until a box-contents row exists; the bwtk/theme-deck builder owns them), the BC prerelease promo BW53 Flygon (no product; bwp builder), the jumbo Keldeo-EX.
