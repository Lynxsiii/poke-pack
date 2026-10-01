# XY Black Star Promos (xyp), McDonald's 2014-2016 (mcd14-16) and the XY Trainer Kits (xytk*)

Added 2026-10-01 by builder b6 of the XY era.

## xyp: the promo pseudo-set

Same pattern as `smp` and `mep`: no boosters, `data/xyp.json` holds 31 promos that no main set claims
(events, decks, premium collections, blisters with packs of several sets). Promos in one set's own boxes stay
filed under that set as `<set>-xypNNN` and count under xyp through `js/card-home.js`. `XYP_PROMOS.totalCount`
is a recount of all XY files plus its own (209 after the merge, checked by `scripts/test-xyp.mjs`).

- Missing numbers: 31-33, 47, 48, 91, 143. 091 (Champions Festival) has no price anywhere and is left out;
  143 is the EU-only Shiny Mega Gyarados Box promo with no US product; 31-33 and 47-48 have no listing in
  pkmn.gg or tcgcsv.
- Scans: Scrydex `xyp-XY01` under 100, `xyp-XY124` from 100 (`PROMO_FORMATS["xyp"]`); pkmn.gg key `XY{n:03d}`.
- Prices: tcgcsv group 1451. Champions Festival 027 and 176 have no tcgcsv row; their prices (200 / 420) are
  TCGplayer details marketPrice, stored as `price` plus `priceSource` in `data/sets/xyp.json`.
- Foil maps: TCG Live key `xybsp`; 21 of 31 have one. The maps for 027 and 176 only marked the stamp text and
  were removed (no foil over a stamp).
- Products (about 23): events (Champions Festival, regional/state kits), Premium Trainer's XY Collection,
  Mega Camerupt / Mega Sharpedo premium collections (cross-set packs via `from`), Mega Powers Collection,
  Giratina 3-pack blister. Pack mixes with a single source are marked approximate in the notes; mixes nobody
  documented (Premium Trainer's, Mega Powers) simulate no packs.

## mcd14, mcd15, mcd16

Side sets built with `scripts/build_side_sets.py`: twelve XY reprints each, Confetti Holofoil, one card per
Happy Meal (`packSize 1`, every card `holo`, `foilAs "Rare Holo"`, `era "xy"`). 2016 was Europe only.
TCGplayer groups 1692, 1694, 3087; there is no TCG Live map for any of them, so the holos carry the finish
only (`scripts/test-side-sets.mjs` allows that for these three). The pack price is the mean of the twelve
cards (16.87, 19.81, 110.37; `data/sealed.json`). The pouch art is a stand-in drawn by
`scripts/make_mcd_xy_wrappers.py`. Scans for 2014 and 2015 are 320x448 at the source; pokemontcg.io 404s,
pkmn.gg is blurrier, TCGplayer is 200x286. The 2016 release date differs between sources (Aug 5 vs Aug 19);
Aug 19 (pkmn.gg) is used.

## The eight XY Trainer Kit half decks (xytk6a ... xytk9b)

Each kit holds two fixed 30-card half decks. Engine pools cannot deal fixed lists, so each half deck is its own
promoSet-style set of 30 cards (pkmn.gg tk6a ... tk9b; card 30 is the holofoil Pokemon, flagged `promo`), and
the kit product is sold on both halves' pages. Opening it deals every card of both halves except the product's
own promo via `data/box-contents.json` rows (`scripts/box-research/xy-kits.json`, `xy_kits()` in
`scripts/build_box_contents.py`). Set names are "XY Kit <Pokemon>" so "<name> Master" fits 32 characters.
Kit prices 1-3 are the sum of the 60 cards (no kit listing); kit 4 uses TCGplayer mid 415.
Known side effect: `promoSet` counts kit cards toward the "Own a Black Star promo" achievement; a `kitSet`
flag in `js/achievement-eras.js` would fix it. Theme decks got no rows (lists incomplete, one source).
