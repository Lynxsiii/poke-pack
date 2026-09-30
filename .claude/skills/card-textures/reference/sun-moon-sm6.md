# Forbidden Light (sm6)

Built 2026-09-30 (builder b3). 131 printed, 149 cards in `data/sm6.json`: 146 pack cards, the 2a print and
the two box promos smp133 and smp134. Research:
`/mnt/project-files/sun-moon/research/sm6.md`.

## Sources
- Cards: pkmn.gg `sun-moon/forbidden-light` through `build_set.py`; scans scrydex `sm6-<n>`.
- Pack: 1 basic Energy (`sm17`, the 2017 print), 5 Commons, 3 Uncommons, 1 reverse holo
  (C/U/R/Rare Holo), 1 rare slot. Face to Face Games, ToyWiz and GoNintendo product text
  ("each pack contains 10 cards and 1 basic Energy"), Bulbapedia "Booster pack (TCG)".
- Odds, three tallies pooled (n=3,668, research/second-source-check.md in the shared sun-moon folder (Elite Fourum https://www.elitefourum.com/t/39762/147 per-card box counts, burpies https://www.elitefourum.com/t/pull-rates-in-sun-moon-sword-shield-sets/25220, Derium YouTube)): GX 7.94%, Prism Star 8.04%, full art 3.90%,
  rainbow 1.23%, gold 0.90%. Weak corroboration: Elite Fourum post 2018-06-07
  (https://www.elitefourum.com/t/official-pull-rates/20546).
- **Prism Stars are in the reverse slot** (`reverseSpecial: [["prismStar", 0.0804]]`), so
  they are not part of the rare slot's hits (Elite Fourum 39762/140 and /146, PokeBeach
  "Prism Star cards take the place of the Reverse Holo", and the rare-slot classes already
  sum to every pack).
- **Holo is measured, not assumed**: plain Rare is exactly 2/3 of packs (939 of 1,404
  counted) and holo-or-better is 12.0 per 36, so holo = 1/3 minus the hits (0.1937).
  Earlier builds used 0.2028 from the sm8 to sm11 ratio; superseded by the second-source check.
- Gold cards are all Trainers and Energy (Beast Ring, Eneporter, Metal Frying Pan,
  Mysterious Treasure, Unit Energy FDY, Energy Recycler).

## Maps
TCG Live key `sm6` (numbered, only holo prints). All 52 holo-class cards of the set (11
Rare Holo, 8 GX, 5 Prism Star, 13 Rare Ultra, 9 Rainbow, 6 Secret) have a
foil map, 28 of them (Ultra, Rainbow, Secret) an etch map. Overlaid on the scans: GX and
full arts are whole card, the Rare Holos the art window. The box promos smp133 and smp134
(Thundurus-GX, Tornadus-GX) have maps from `smbsp`. No map: 2a (see below).

## Oddities
- pkmn.gg files 4 `a` prints inside the set. 2a Alolan Exeggutor (holo) is the special-art
  reprint in Lost Thunder's blister, used by sm8 through `like: "sm6:2a"`: kept, `promo:
  true`, `foilAs` Rare Holo, sold as a single at its TCGplayer listing (group 1938
  "Alternate Art Promos"; product `alolan-exeggutor-2a`, kind `event`) so the set can be
  completed. The three League prints (102a Beast Ring League Cup, 112a and 113a
  Pokemon League) are not in any product: `skipNumbers`.
- Promo scan keys: pkmn.gg page `SM001`, scrydex `smp-SM01` (`SM001` is the card back):
  `promoSeries.smp.pkmnKey` and `scrydexKey`; a trailing letter (`smp30a`) is carried
  through by build_products.py.
- Products left out because TCGplayer has no market price today (re-run
  `build_products.py sm6` when it does): Single Pack Blisters Exeggcute (smp119) and
  Rockruff (smp120), Dawn Wings / Dusk Mane Necrozma Premium Collections (both hold
  smp123 and smp124).
- Not built, needs other sets' data (paste into `products` once sm2 and sm4 are merged):
  `{"id":"forbidden-light-3-pack-blister-garbodor","name":"Forbidden Light 3 Pack Blister [Garbodor]","kind":"blister","tcgplayerId":164298,"packs":3,"promos":["sm2:51a"]}`,
  `{"id":"forbidden-light-3-pack-blister-regigigas","name":"Forbidden Light 3 Pack Blister [Regigigas]","kind":"blister","tcgplayerId":164299,"packs":3,"promos":["sm4:84a"]}`.
- Not built, inferred only: the international Dawn Wings / Dusk Mane Necrozma Boxes
  (TCGplayer 246414 / 246415). Prerelease Kit (166413) and Theme Decks skipped by research.
- ETB: 8 packs, filed as product `elite-trainer-box` (the engine's ETB is 9), no promo.
- fetch_tcgplayer_prices.py norm(): `◇` is "Prism Star" on TCGplayer, "Unit Energy FDY"
  matches the spelled-out type names.
- Wrapper art is opaque on white: `clean_pack_art.py` output shipped as `-v2`, the uncut
  originals never shipped.
