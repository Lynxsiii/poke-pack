# SWSH Black Star Promos (swshp)

Added 2026-09-29. `swshp` is a promo pseudo-set like `svp`: no boosters, 60 cards in
`data/swshp.json` from products that hold packs of several sets (tins, V boxes,
premium collections, decks). A promo that ships in one set's own boxes (ETB, Build &
Battle Box, blisters, V-UNION collections) is filed under that set as
`<set>-swshpNNN`, so a number is built once (`scripts/test-swshp.mjs`).

- Scans: scrydex files these as `swshp-SWSH004`; the bare `swshp-4` is the card BACK.
  `promoSeries.swshp.pkmnKey` (`SWSH{n:03d}`) in every swsh set config drives both
  the pkmn.gg page and the image URL.
- Maps: TCG Live key `swshbsp` (numbers match), fetched with fetch_foil_maps.py
  (`--set <set> --cards swshp...`; PROMO_KEYS has `swshp`). Promo records carry
  `era: "swsh"`, so swshPattern() reads `foilAs`: V -> Rare Holo V, VMAX/VSTAR their
  own, full art -> Rare Ultra, plain holo -> Rare Holo.
- Pack mixes of mixed-set boxes are approximate where noted ("Pack mix approximate").
