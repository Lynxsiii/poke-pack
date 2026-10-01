# EX generation: Nintendo black star promos, POP Series 1-5 and the EX Trainer Kits (e5)

Everything here is data; there is no new CSS. Research: `/mnt/project-files/every-era/ex/research/` (np, exp-claims, pop-series,
trainer-kits-and-energy, ex-products, theme-decks, box-contents). Scaffold: `ex/SCAFFOLD-NOTES.md`. Template: `dp-promos-pop-kits.md`.

## np (NP Black Star Promos, NP001-NP040)

- Pseudo-set with no boosters (`NP_PROMOS` in `js/catalog.js`, in `PLAYABLE_SETS`; named "NP Black Star Promos" so "<name> Master" fits
  a 32-character title). A promo an EX set's product claims is filed by that set's builder as `<set>-npNNN` (`ex1-np012`) and counted
  under `np` (card-home.js `PROMO_HOMES`); `data/np.json` holds the 24 that no EX product claims (`np-npNNN`, numbers `np001`..`np040`,
  printed "NP 001"). pkmn.gg: series `np`, slug `nintendo-black-star-promos`, page key `001`; scrydex key `np-<n>` UNPADDED.
- **data/np.json (24)**: NP1, 2 (Nintendo Power), 3, 4, 8, 9, 10, 11 (e-League 2003), 5 (POP tournaments), 14, 15 (Pokemon Heroes DVD), 21
  (Jirachi DVD), 22, 24, 25 (e-League 2004), 26 (2004 Worlds), 16-19 (EX Deck Tins), 29, 30 (Collector's Carry Tin), 35 (Value Pack),
  40 (Value Box / Trainer's Challenge Set). Each is an `event` product: the card alone, priced from its own TCGplayer listing. The tins and
  value packs among them (16-19, 29, 30, 35, 40) held packs of a mix no source gives (np.md, "contents not established"), so they cannot
  be sold as tins: card alone, named for the product in the title and note.
- **Filed in the EX sets by e1-e4** (their products pack EX boosters): NP12, 13 (EX Series Collector's Tin, ex1/ex2), NP20 (EX Series
  Value Pack), NP31-33 (Collector's Window Tins), NP34 (Value Pack II), NP37-39 (Collector's Tins). See the merge state at the end.
- **Not built, and why**: NP6, NP7 (POP tournament Torchic and Treecko), NP23 (Stadium Challenge Metang), NP27, NP28, NP36 (Worlds 2005
  Tropical Tidal Wave, Championship Arena, 2006 Tropical Tidal Wave) have no TCGplayer market price at all (tcgcsv has no row, the
  marketplace pricepoints API says null, pkmn.gg says 0), so there is nothing to price an event product from (the DP05 rule); a price
  would be invented. NP900 Shadow Lugia is a jumbo with no TCGplayer product. Winner-stamped, Staff, placement-stamped, jumbo and
  Target snack-bar variants are not modelled.
- NP5 Mudkip: no tcgcsv row; TCGplayer's own pricepoints API reports a $1,500.00 market price (pkmn.gg agrees), thin (no listings).
  The event product carries it by hand with a `priceSource`. NP4, NP9, NP11: TCGplayer lists only the Winner-stamped copy, and the scrydex
  scan is the Winner print (visible "WINNER" stamp), so the price is that listing's. NP24 Chimecho is priced at the plain listing
  (84293, $11.90; the Winner copy is $34.33) and its scan is the plain print.
- Finish: `foilAs: "Rare Holo"` on the 11 holo promos of data/np.json (1, 2, 5, 16-19, 29, 30, 35, 40; the 23 of np.md in all, the rest
  in the EX sets), `reverse: true` on the three e-League reverse holos (3, 8, 10). NP1 and NP2: the magazine copy (Oct 2003) is not
  holo, the holofoil copy went to Ruby & Sapphire Challenge players in Aug 2003 (Bulbapedia via search excerpt, Collexy); the brief
  asks for the holo, so they show as cosmos holo but are priced at the magazine print's normal listing ($43.82, $31.10; the holofoil
  listings are $314.66 and $130.75): the daily refresh reads that same listing. NP35: the holo is the only TCGplayer listing ($261.08,
  `priceFromListing`).
- Released "October 1, 2003" is pkmn.gg's month-level set date; Bulbapedia and the Card Guide wiki ("starting October 2003", search
  excerpts) agree. pkmn.gg dates NP8 and NP9 (e-League 2003) Sept 2003, earlier than the set date: month-level, not used.
- Scans: all 24 viewed on a sheet: clean scrydex scans, no borders, none swapped.
- Symbol: pokesymbols' generic promo star (`_promo`, as dpp); logo pokemontcg.io `np`.
- `totalCount`: see the merge state in the report; scripts/test-np.mjs checks it exactly against every file present.

## POP Series 1-5 (pop1..pop5)

- Ordinary sets from pkmn.gg (series `pop`, slug `pop-series-N`, scrydex `popN`, TCGplayer groups 1422 / 1447 / 1442 / 1452 / 1439), 17
  cards each, `era: "ex"`, edition and catalog era "EX", `packSize` 2. `exPopSeries` in catalog.js (the DP `popSeries` helper
  hardcodes the DP edition). Slots `popSlots({rare: .1, rareAt})`: the Rare is the SECOND card in POP 1-2, the first in POP 3-5 (POP 4-5
  assumed); the other card is a Common or an Uncommon (20/121). One source (Elite Fourum posts 45, 53, 56, 59, 63): low-medium. No box.
- In-pack cards are not foil (pkmn.gg "Found in Booster Packs" normal; the holo versions are the retail blister, tin and value-pack
  prints of exp-claims.md section B, which this work does not build: no promo product of ours carries them). Armaldo ex (POP 1) and the POP 5
  Gold Stars Espeon and Umbreon might have been foil in the pack: unresolved, all stay rarity "Rare" (class `foil-none`). The Gold Stars
  are NOT "Rare Holo Star" on purpose: that rarity's sell value is $1,366.76.
- Pack cost = TCGplayer's market price of the single pack (products 141227, 141228, 190532, 190533, 190534): $100.08, $149.69, $169.68,
  $171.94 and **$2,290.00 for POP 5** (thin markets, used as listed; note anything over $300 a pack: only POP 5).
- Card prices are `fetch_tcgplayer_prices.py`'s (Normal for Commons and Uncommons, Holofoil for Rares, as for POP 6-9). POP 4 #17 Deoxys ex
  has no tcgcsv row: its price is $250.00 from TCGplayer's pricepoints API / pkmn.gg, written by hand (the daily refresh will not
  overwrite a card it cannot match). POP 5 #16 Espeon Star and #17 Umbreon Star have no price anywhere (no listings; pkmn.gg null): left
  without `market`, so the site's rarity fallback prices them. The fetch script now spells a leading "δ" as "Delta" (POP 5 #9 δ Rainbow
  Energy); that one line in `norm()` is the only edit to it.
- Wrapper art: pokesymbols `pop-series-N-pack-0.avif` (one per series), opaque photos of the real packs; `clean_pack_art.py` cut the white
  edge (judged on a dark background: clean, no white strips). Names match the art: POP 1 Blaziken, POP 2 Venusaur, POP 3 Eeveelutions
  (Jolteon, Vaporeon and Flareon together; cardId pop3-3 Jolteon), POP 4 Deoxys, POP 5 Ho-Oh.
- Scans: all 17 of each viewed on a sheet; no crooked crops, borders or backs, nothing swapped. Symbols pokesymbols `pop-N`, logos
  pokemontcg.io (the same Organized Play image as POP 6-9).
- Released: pkmn.gg's month of first distribution (Sept 2004, Aug 2005, Apr 2006, Aug 2006, Mar 2007).

## EX Trainer Kits (extk1a Latias, extk1b Latios, extk2a Plusle, extk2b Minun)

- Side sets (`"side": true`, `build_side_sets.py`), modelled on dptk3a: one set per half deck (pkmn.gg tk1a, tk1b, tk2a, tk2b; scrydex the
  same, NOT crossed here: tk1a is Latias, tk2a Plusle), rarity "Promo", 10, 10, 12, 12 cards (pkmn.gg + TCGplayer), the holofoil
  `holo: true, promo: true, foilAs "Rare Holo"` (Latias 4, Latios 2, Plusle 6, Minun 6). TCGplayer groups 1543 (kit 1, product 98950) and
  1542 (kit 2, product 98951). The kit is the two half decks only: the research found no booster pack that any source names, so none is
  simulated or sold.
- Kit product `ex-trainer-kit-latias-latios` / `ex-trainer-kit-2-plusle-minun` (kind `deck`, packs 0) on both half decks' pages. The kit
  listings carry no price, so the price is the different cards' market prices added up, one of each: **$13.62** (kit 1, 20 cards) and
  **$21.27** (kit 2, 24 cards), floors (the real decks held duplicates: Bulbapedia's "10 unique cards" in a 30-card deck; CardMavin's
  quantities sum to about 20 a deck, not reconciled).
- Box contents: `scripts/box-research/ex-kits.json` and `data/box-contents.json` rows `<half>/<product id>` (both halves, the half's
  own holo excluded). EX theme decks: NO rows. theme-decks.md says plainly it has deck names, TCGplayer ids and the deck-exclusive prints
  only, "NOT full 60-card lists"; no list exists in the research, so no deck is built (never invent a list).
- IMPORTANT for reruns: `build_products.py` drops a card flagged `promo: true` that the config's `promoCards` does not list (the holos).
  After any `build_products.py extk1a ...` run, run `build_side_sets.py` on the same ids again. And `build_products.py` rewrites
  data/products.json sorted by key (a whole-file diff): fold only your own keys into the committed file.
- Symbols: pokesymbols `ex-trainer-kit-latias`, `-latios`, `-2-plusle`, `-2-minun`; no logo (as the DP kits).

## Shared files touched

js/catalog.js (NP_PROMOS, exPopSeries and exTrainerKit blocks, PLAYABLE_SETS tail, POKESYMBOLS_SLUG tail), js/set-accents.js,
scripts/make_set_accents.py, data/set-accents.json, data/pullrates.json, data/sealed.json, data/products.json, data/box-contents.json,
assets/packs/sources.json, scripts/build_box_contents.py (EX_KITS_RESEARCH, 3 lines), scripts/fetch_tcgplayer_prices.py (the δ line),
scripts/test-np.mjs (real mode plus POP, kit and np-file checks).
