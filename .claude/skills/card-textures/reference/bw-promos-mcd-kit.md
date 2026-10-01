# Black & White promos, McDonald's 2011/2012 and the BW Trainer Kits

How the c5 pieces of the Black & White era are built. Everything here is
data-driven; there is no new CSS.

## bwp (BW Black Star Promos)

- `data/sets/bwp.json` is a promo pseudo-set. The cards are only the promos
  no product claims; every other BW promo is filed by its home set as
  `<home set>-bwpNNN` (e.g. `bw5-bwp003`) and counts under "bwp" through
  `promoSeries.bwp` (pkmn.gg black-white / bw-black-star-promos, scrydex bwp).
- pkmn.gg key `BW{n:03d}`, scrydex key `BW{n:02d}` (`scrydexWide` [4, 5]),
  printed number "BW 003".
- BW77 and BW78 were never issued; BW900-902 have no scan, so they are absent.
- `BWP_PROMOS.totalCount` in `js/catalog.js` is the home-card count over
  data/bwp.json plus every BW set's own promos. Recount whenever a BW set
  lands; `scripts/test-bwp.mjs` checks that no promo number is built twice
  and that the own-file ids match.
- The 16 own promos are `kind: "event"` products priced from their
  listing; bwp030 and bwp050 have no priced product, so they carry a manual
  `price` with `priceSource`. `priceFromListing` (build_products.py) makes a
  spec use the listing price even when a manual one exists.
- Foil maps come from TCG Live: `fetch_foil_maps.py --set bwp --all --ship
  --write-data` (key bwbsp).

## McDonald's Collection 2011 and 2012 (mcd11, mcd12)

- Side sets (`"side": true`, `cards` list, `scripts/build_side_sets.py`),
  12 cards each, one card per pack, `printedHolo` slot. TCGplayer groups
  1401 (2011) and 1427 (2012). Prices come from tcgcsv (use curl; urllib is
  refused with 401).
- Catalog: `happyMeal2011to2012` factory, MCDONALDS_2011 and MCDONALDS_2012.
  The pouch art is `scripts/make_mcd_bw_wrappers.py`
  (`assets/packs/mcd11|mcd12/pack-0.avif`).
- No foil maps: `scripts/test-side-sets.mjs` has `noMap = /^mcd1[1-6]$/`.

## BW Trainer Kits (bwtk5a Zoroark, bwtk5b Excadrill)

- Each half deck is a promo set (`promoSet`, packSize 0) with the kit
  product (`bw-trainer-kit-excadrill-zoroark`, TCGplayer 98640) on both
  pages. Card 30 is the kit's holo promo: `promo: true`, `holo: true`,
  `foilAs: "Rare Holo"`, as the XY kits.
- The kit's booster pack set is not simulated: Bulbapedia says BW,
  PokeBeach says EP, so the research is unresolved.
- Accents: bwtk5a uses `#8a6fe0` (the darker purple failed the mastery
  contrast check).

## Box contents

`scripts/build_box_contents.py` `black_white()` reads
`scripts/box-research/bw.json` (ETB, kit and 21 theme decks). Rows are keyed
`<set>/<product id>` and are skipped with "not on the site yet" until the
set's deck product exists. Do not run a full regeneration over hand-added
rows; append only the keys you own.
