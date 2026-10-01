# Diamond & Pearl generation: black star promo sets, POP Series 6-9 and the Trainer Kits (d5)

Everything here is data; there is no new CSS. Research: `/mnt/project-files/every-era/dp/research/` (dpp-claims, pop6-pop9,
trainer-kits-and-energy, theme-decks, box-contents) and `hgss/research/` (hsp-claims, pl-dpp-claims, hgss-trainer-kits-and-energy,
hgss-box-contents). Scaffold: `dp/SCAFFOLD-NOTES.md`.

## dpp (DP Black Star Promos) and hsp (HGSS Black Star Promos)

- Pseudo-sets with no boosters (`DPP_PROMOS`, `HSP_PROMOS` in `js/catalog.js`, both in `PLAYABLE_SETS`). A promo a set's own
  product carries is filed by that set's builder as `<set>-dppNN` / `<set>-hspNN` (card-home.js `PROMO_HOMES`) and counted under
  `dpp` / `hsp`; `data/dpp.json` and `data/hsp.json` hold only the promos no product claims (`dpp-dppNN`, `hsp-hspNN`).
- pkmn.gg key `DP{n:03d}` / `HGSS{n:03d}`, scrydex key `DP{n:02d}` / `HGSS{n:02d}` (`printedWidth` 2), printed number "DP 48".
- **data/dpp.json (2 cards)**: DP48 Tropical Wind (2009 Worlds, $249 market, TCGplayer 90056 and pkmn.gg agree; tcgcsv has no
  row for it, so the event product carries the price by hand with `priceSource`) and DP41 Toxicroak G ($67.53, cosmos holo, filed
  as an event: the Platinum Player's Guide insert; sources disagree on where it came from, see the product note).
- **Not built, and why**: DP05 and DP25 (Tropical Wind, Worlds 2007 and 2008) and HGSS18 (Tropical Tidal Wave, Worlds 2010) have
  no TCGplayer market price at all (tcgcsv, the marketplace pricepoints API and pkmn.gg all say null or 0; DP05 has one listing, DP25
  and HGSS18 none), so there is nothing to price an event product from, and `build_products.py` leaves out a promo no priced product
  sells. A price here would be invented. HGSS18 also has no scrydex scan (scrydex answers the 186,316-byte card back; pkmn.gg's
  image is `assets.pkmn.gg/images/cards/hsp/hsp-HGSS018v2.png`), so adding it needs a spec `image` override in `build_products.py`
  as well as a price. DP54 Beginning Door and DP55 Ultimate Zone were French-only (two sources: PokeBeach 2010-03, Bulbapedia), no
  English product; DP900 and DP901 are Black & White-era jumbos (Zoroark movie cards). Staff-stamped, jumbo and Worlds-deck
  variants of the same numbers are not built.
- `data/hsp.json` is an empty list. Every other HGSS promo has a retail carrier in `hsp-claims.md` (poster pack, blisters, tins):
  the HGSS set builders file them.
- `totalCount` (DPP 48, HSP 24) is the count once the 11 Diamond & Pearl / Platinum sets and the 5 HGSS sets are in; `scripts/
  test-dpp.mjs` checks it exactly as soon as every set file is present and as an upper bound before. RECOUNT at integration.
- Hero ids point at promos the set builders file (`pl3-dpp47`, `pl3-dpp45`, `pl1-dpp38`; `hgss1-hsp02`, `hgss1-hsp01`, `hgss2-hsp11`,
  `hgss1-hsp09`); the test only requires them to exist once their set file is there.
- Symbols: pokesymbols' generic promo star (`_promo`); logos from pokemontcg.io (the black star "PROMO" mark).

## POP Series 6-9 (pop6, pop7, pop8, pop9)

- Ordinary sets from pkmn.gg (`series: pop`, slug `pop-series-N`, scrydex `popN`, TCGplayer groups 1432 / 1414 / 1450 / 1446), 17 cards
  each (5 Rares, 5 or 6 Uncommons, 6 or 7 Commons), `era: "dp"`, edition and catalog era "Diamond & Pearl". No box exists; TCGplayer
  sells single packs only, so each set is one pack product (`sealed.json` `boosterPack`).
- Packs: `popSlots` (scaffold). POP 6 two cards, a Rare in every pack (a production error: Bulbapedia, Elite Fourum #66, high);
  POP 7 two cards, Rare 0.10 (EF's assumption, low-medium); POP 8 and 9 three cards (an `energyPrint: "dp"` Energy, a Common, and a
  Common / Uncommon / Rare slot at 0.165 Rare and 0.335 Uncommon, low: one source, a hypothesis EF says fits its counts). In-pack cards
  are never foil (Bulbapedia; Collexy lists every POP holo as a retail extra), so no holo is dealt; the `Rare` class string is
  `foil-none`. Sources and confidence: `data/pullrates.json`.
- Pack cost: POP 7 $48.49 and POP 8 $28.92 are TCGplayer's market prices (products 190535, 190536; thin). POP 6 (141229) and POP 9
  (190537) have no market price, so their cost is what a fair draw is worth at the cards' own market prices ($40.45, $15.16: the
  McDonald's approach); say so if anyone asks why POP 6 costs more than POP 9.
- Card prices are `fetch_tcgplayer_prices.py`'s (Normal for Commons and Uncommons, Holofoil for Rares). Five POP 6 / 9 Rares have a
  separate holofoil listing (blister reprint) that is a few dollars dearer than the in-pack print (Manaphy $10.03 holo, $6.64 normal);
  the daily recorder (`worker/prices.js`) also prefers Holofoil, so data and history agree.
- Wrapper art: pokesymbols `pop-series-N-pack-0.avif` (one wrapper per set; `-pack-1..3` are 404 stubs). They are tight opaque photos
  of the real packs; `clean_pack_art.py` cut the white edge out (checked on a dark background, no white strips left). Wrapper
  Pokémon match the card list: Lucario (pop6-2), Gallade (pop7-2), Heatran (pop8-1), Garchomp (pop9-1).
- Scans: scrydex, all 17 of each viewed on a sheet (no crooked crops, no white borders, no card back).
- Symbols: pokesymbols `pop-6` .. `pop-9`; logo: pokemontcg.io's Organized Play logo (the same image for the four sets).
- Released: pkmn.gg's month-of-first-distribution (Sept 2007, Mar 2008, Sept 2008, Mar 2009).

## Trainer Kits (dptk3a Manaphy, dptk3b Lucario, hgsstk4a Gyarados, hgsstk4b Raichu)

- Side sets (`"side": true`, `scripts/build_side_sets.py`) modelled on `bwtk5a`: one promo set per half deck (`promoSet`,
  `packSize 0`), the kit product on both half decks' pages, rarity "Promo", the holofoil `holo: true, promo: true, foilAs "Rare Holo"`.
  pkmn.gg kit sets tk3a / tk3b (12 and 11 cards) and tk4a / tk4b (30 each); scrydex `tk3a`, `tk3b` (the DP halves match pkmn.gg) and `tk4b`, `tk4a` (crossed, see below); TCGplayer groups 1541 (DP kit,
  sealed product 98949) and 1540 (HGSS kit, product 98731), neither priced.
- WATCH OUT: scrydex labels the HGSS halves the other way round (scrydex `tk4a` is the Raichu deck, `tk4b` the Gyarados deck; pkmn.gg's
  tk4a is Gyarados). The configs' `scrydexId` is therefore crossed (hgsstk4a -> tk4b, hgsstk4b -> tk4a); check any rebuilt scan sheet by eye.
- HGSS kits: cards 1-30 each, #30 the holofoil Gyarados / Raichu (alternate art; pkmn.gg + Collexy), and the kit's row deals all 60 cards.
- DP kits: pkmn.gg lists 12 (Manaphy deck, holo #4) and 11 (Lucario deck, holo #3) different cards; the copies of each a half deck held
  are in no source. The kit's row therefore deals one of each different card (22 beside the promo), and the product price is the
  23 cards' market prices added up ($29.56, a floor). The real kits also held one booster pack: not simulated (the sources disagree
  on which set's for the BW kit and say only "a HeartGold & SoulSilver pack" or "a late EX or DP-series pack" here).
- Product prices are manual (`priceSource` says how): $29.56 (DP) and $203.04 (HGSS: the 60 cards added up).
- Product photos are TCGplayer's: the HGSS blister is crisp, the DP box photo is only 197 px wide (that is all TCGplayer has).
- IMPORTANT for reruns: `build_products.py` drops a card flagged `promo: true` that the config's `promoCards` does not list (the kits'
  holo #4 / #3 / #30). After any `build_products.py dptk3a ...` run, run `build_side_sets.py` on the same ids again.

## Box contents

`scripts/box-research/dp.json` + `dp_kits()` in `scripts/build_box_contents.py` give the four kit rows (`<half>/<product id>`, both
halves, own promo excluded). Rows were folded in additively (only these keys; no full regeneration). **No DP, Platinum or HGSS
theme-deck rows**: the research has names, TCGplayer ids and the deck-exclusive holo only (theme-decks.md, hgss-products.md,
pl-products.md), not a single 60-card list, so nothing can be built without inventing cards. When a source with real lists turns up
(pokemon.com decklists, Bulbapedia's deck pages), add them to `dp.json` as `decks` and teach `dp_kits()`'s sibling the way
`black_white()` does it.

## Gaps and open points

- DP05, DP25, HGSS18: no price (above). DP04, DP06, DP15, DP16 (dp1, dp2, dp3 carriers in dpp-claims.md) and DP24 (dp5) were not yet in any builder's file
  when `totalCount` 48 was counted; if all five land, `DPP_PROMOS.totalCount` becomes 52 (test-dpp checks it once every set file is there).
- The two `Staff` prints of the Worlds Tropical Winds, the jumbo prints (DP24, DP26, DP27, DP40, DP50) and the French DP54 / DP55
  are not modelled.
