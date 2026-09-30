# SM Black Star Promos (smp) and McDonald's 2017-2019 (mcd17, mcd18, mcd19)

Added 2026-09-30 by builder b7 of the Sun & Moon era.

## smp: the promo pseudo-set

Built like `swshp` and `svp`: no boosters, `data/smp.json` holds 33 promos that come
in products with packs of several sets, in decks or trainer kits, or at events. Promos
in one set's own boxes (ETB, blisters, tins, Build & Battle, GX boxes) stay filed under
that set as `<set>-smpNNN`. `scripts/test-smp.mjs` checks that no number is built twice.

- 33 of the 248 numbers are here. The rest belong to b1-b6 (claims table in the research
  JSONs, checked against the builders' live `promoCards`) or have no sellable source
  (staff, league, promo-only stamps). Alolan Sandslash GX Box and smp231 have no tcgcsv
  price, so they are left out rather than priced by guess.
- Scans: Scrydex keys are `smp-SM01` under 100 and `smp-SM179` from 100 up; `smp-SM001`
  is the card BACK. pkmn.gg page key is `SM001`. `build_products.py` has
  `PROMO_FORMATS["smp"]` so any builder's `promoSeries.smp` config gets both right.
- Prices: tcgcsv group 1861 for cards. Misc products are group 2374, blister exclusives
  2289 (`tcgplayerGroup` on the product). Two cards (smp004, smp078) carry their
  `tcgplayerId` where the name search was ambiguous. 33/33 cards and 27/27 products are priced.
- Foil maps: TCG Live `smbsp` (`cdn.malie.io/.../en/smbsp/smbsp_en_NNN_std.foil.png`).
  17 of 33 have a map and 3 (smp240, 241, 242) an etch map. The 16 without (004, 078,
  108-114, 127, 128, 148, 186, 237, 238, 244) have no TCG Live entry: event stamps,
  decks and the two Champions Festival cards ship plain. Every map was checked by
  overlay against its art.
- Finish: records carry `era: "sm"`, so `smPattern()` reads `foilAs`: Rare Holo for the
  prerelease and event holos, Rare Holo GX (smp239), Rare Ultra for the TAG TEAM full
  arts (smp240-242), Rare Secret for the two premium-collection rainbows/golds (247, 248),
  Cosmos for smp243.
- Products (27): two TAG TEAM Powers Collections (8 packs: 3 sm12, 2 sm11, 2 sm10,
  1 sm9), two GX Premium Collections (10 SWSH packs), the Pikachu & Eevee Poke Ball
  Collection (5 sm8), the Pikachu & Zekrom GX League Battle Deck, the Eevee theme deck,
  the Alolan Sandslash & Ninetales trainer kit, and one `kind: event` product per
  event card (launch event, Worlds 2017/2018, Ultra Prism and Forbidden Light
  prereleases, the seven I Choose You! cards, Detective Pikachu), each priced from
  that card's own listing.
- Pack mixes are "approximate" where the real split is not documented (noted on the
  product). The pack count is from Bulbapedia and TCGplayer's product text.
- Odd: the TAG TEAM Powers Collections list at about $1,850 to $1,915 on TCGplayer, and
  the price history agrees for a year, so it is left as market, not rounded down. Three
  of the four SM sets in them are other builders' and open only once those sets are
  merged (`offerPackSets` returns null until then).
- Set mark: the black star PROMO logo and symbol carry a white sticker edge like svp's.

## SM Trainer Kits

The Alolan Sandslash & Alolan Ninetales kit fits the product model with no pack set:
`kind: deck`, 0 packs, two promos (smp127, smp128), priced from its TCGplayer listing.
No other Sun & Moon Trainer Kit was checked or built here.

## McDonald's 2017, 2018, 2019

`data/sets/mcd17|18|19.json`, built by `build_side_sets.py`. 12 cards each, one random
card to a Happy Meal (Bulbapedia, TCGplayer: every card is foil only), no English pack.

- Cards carry `era: "sm"`, `holo: true` and `foilAs: "Rare Holo"`, so they get the SM
  holo finish. The print is really Confetti Holofoil; the brief's rule was the era finish,
  so the confetti look comes from the per-card art-window maps (`tcgl: "window"`, made
  from the card's art box, each overlay-checked) and not from `foilAs: "Confetti"`
  (mcd23 uses that). Flip `foilAs` if the finish owner wants the generic Confetti.
- Prices: tcgcsv groups 2148, 2364 and 2555, every card priced.
- There is no pack to buy, so a pack is one card at the mean market price of the twelve
  (`cost`, and `data/sealed.json` `boosterPack`): 8.50, 27.70, 15.47. test-side-sets
  checks the cost against the mean. Change both together after a price refresh.
- Pack art is a stand-in: `scripts/make_mcd_sm_wrappers.py` paints a Happy Meal pouch in
  the 2023 pouch's silhouette with the set's Pikachu, not a scan. Files are `pack-0`
  under `assets/packs/mcdNN/`.
- The three sets share one McDonald's logo (pokemontcg.io gives the same file).
- `data/pullrates.json` has no mcd rows (mcd23 has none either): every pack is exactly one
  holo out of 12, equal odds.
