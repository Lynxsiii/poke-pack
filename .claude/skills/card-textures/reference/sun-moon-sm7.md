# Celestial Storm (sm7)

Built 2026-09-30 (builder b3). 168 printed, 195 cards in `data/sm7.json`: 183 pack cards, the 10a and 177a prints and 10 box promos. Research:
`/mnt/project-files/sun-moon/research/sm7.md`.

## Sources
- Cards pkmn.gg `sun-moon/celestial-storm`, scans scrydex `sm7-<n>`. Pack as sm6 (1 Energy
  `sm17`, 5 C, 3 U, 1 reverse, 1 rare slot; Face to Face Games, ToyWiz, GoNintendo,
  Bulbapedia).
- Odds, four tallies pooled (n=4,720, research/second-source-check.md in the shared sun-moon folder (Elite Fourum https://www.elitefourum.com/t/39762/148 per-card box counts, burpies https://www.elitefourum.com/t/pull-rates-in-sun-moon-sword-shield-sets/25220, Derium YouTube); one is a PokeBeach shop
  owner's 12 boxes, https://www.pokebeach.com/forums/threads/celestial-storm-pull-rates.147911/):
  GX 11.14%, Prism Star 5.51%, full art 3.71%, rainbow 1.32%, gold 0.85%.
- Prism Stars in the reverse slot (`reverseSpecial`). Holo = 1/3 minus the hits (0.1631):
  plain Rare is 2/3 of packs (1,199 of 1,800 counted) even though the set has 18 Rare Holo
  against 17 Rare, so the card-count split is not the pack split. Earlier builds used 0.168.
- Gold is Trainers and Energy only (Acro Bike, Hustle Belt, Life Herb, PokeNav, Rainbow
  Brush, Rainbow Energy).

## Maps
TCG Live key `sm7`. All 64 holo-class set cards have a foil map (19 Rare Holo minus the
10a print, 11 GX, 3 Prism Star, 17 Rare Ultra, 9 Rainbow, 6 Secret) and 32 an etch map.
Promos smp103, 104, 129, 130, 131, 132, 146, 147, 61, 92 have `smbsp` maps. No map: 10a
and 177a.

## Oddities
- `a` prints: 10a Sceptile (holo; used by sm10's Sceptile blister through `like`) and
  177a Rayquaza-GX (full-art shiny, the Hidden Fates Premium Powers / Ultra-Premium
  Collections' alt-art card, sm115's `altArtCards`) are kept as `promo: true` and sold as
  singles (`sceptile-10a`, `rayquaza-gx-177a`, kind `event`, group 1938). 123a Acro Bike
  (Pokemon League) and 148a Tate & Liza are in no product: `skipNumbers`.
- Celestial Storm Tapu Koko is pkmn.gg's `SM30a` (the blister's cosmos holo; plain `SM30`
  is the 2017 card): the 3-pack Tapu Koko and Tapu Lele blisters have no TCGplayer market
  price today and are left out, as is the promo. Products built: Build & Battle Box
  (smp129 to smp132, pick 1), Tapu Bulu and Tapu Fini single blisters (smp61, smp92),
  Solgaleo GX Box (smp104) and Lunala GX Box (smp103) (4 packs: "packs vary by
  product"), Evolution Celebration Tins Glaceon-GX (smp147) and Leafeon-GX (smp146) with
  2 Celestial Storm packs each (the tin holds 4 packs in all, 2 Celestial Storm + 1
  Crimson Invasion + 1 Roaring Skies, one source). ETB: 8 packs as `elite-trainer-box`.
- Not built: Evolution Celebration Tin [Sylveon GX] (promo is Guardians Rising 92a,
  needs sm2): `{"id":"evolution-celebration-tin-sylveon-gx","name":"Evolution Celebration Tin [Sylveon GX]","kind":"tin","tcgplayerId":175557,"packs":2,"promos":["sm2:92a"]}`.
- Booster pack $65.83 and box $2,485.83 are TCGplayer's market today; not rounded down.
