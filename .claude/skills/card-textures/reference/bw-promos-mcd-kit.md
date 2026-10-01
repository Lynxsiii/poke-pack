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
  --write-data` (key bwbsp). See "Promo maps" below for the prints Live lacks.

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

## Promo maps (finish sweep, 2026-10-01, branch bw/promo-maps)

The finish sweep listed 31 BW holo prints as "window holo promo with no foil
map". Every one now has a map; `sweep_finishes.py --set <bw set>` lists none.
Sources and photos: `/mnt/project-files/every-era/bw/texture-refs/promo-maps/SOURCES.txt`,
sheets in `finish-sheets/promo-maps/`.

- **Real Live maps** (bwbsp, `.../en/bwbsp/bwbsp_en_<nnn>_std.foil.png`, numbering
  = promo number, overlaid on the scans): bw10-bwp085 Lucario, bwp086 Genesect,
  bwp099 Genesect, bw11-bwp097 Eevee, bwp098 Mew (`fetch_foil_maps.py --set bw10
  --cards bwp085,bwp086,bwp099 --ship --write-data`, same for bw11). Probed 001-110:
  Live has no bwbsp map for 014-016, 029-031, 033, 054, 055, 065, 100, 101 (the
  first group are non-holo, the rest are the cards below).
- **Drawn, one script** (`scripts/make_bw_promo_maps.py`, new files only, 367x512 like
  Live's):
  - *Cracked Ice reprints* (bw2-40, bw2-62, bw3-12, bw3-80, and the three bw1 ones):
    the set card is a plain Rare, so no map to borrow; the Pokumon scans show facets
    over the whole window INCLUDING the Pokémon, so the map is the evolution window
    (p95 of 74 Live Stage maps, circle notch kept) at 0.8, nothing cut out:
    `assets/foil/bw-promo/window-evo-v1.webp`, shared. bw1-5/19/31 had used the set
    holo's map, whose Pokémon is matte: wrong area, repointed.
  - *Cosmos / holo promos on a Pokémon frame* (bw2-bw1-1/15/27-cosmos, bw4-bwp033
    Riolu, bwtk5a-30, bwtk5b-30): the window at 0.8 with the Pokémon cut out by GrabCut,
    as Live's cosmos and tinsel promo maps do. Their art differs from bwp001-003, so
    those maps cannot be reused.
  - *Victory Cup BW29-31 and N BW100*: Trainer prints whose foil is the text panel
    (and the Victory Cup's window); hand boxes in the script, holes over the rules text,
    placement line and the Battle Road stamp (the real Victory Cup shows foil under the
    text; our rule is no foil over text). N's League print leaves the window plain.
  - *Dragon Vault stamped promos* (dv1-9/10/11/16/17-dvstamp): the plain card's Live
    map with the DRAGON VAULT wordmark cut out (box). They were `foil-none` in
    `bwPattern` (photos with foil baked in); they now take `foil-holo bw-holo bw-vault`
    like the set cards, with the map keeping the Tinsel off the wordmark.
- **Still approximate**: the Cracked Ice reprints draw Tinsel lines, not facets (a
  `bw-cracked` tile like `dp-cracked-ice-v1.webp` would be the next step); the Trainer
  Kit holos' finish word is stated nowhere, so they draw Tinsel; N's real print is a
  stamped Mirror holo, ours has no stamp in the scan.
