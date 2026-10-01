# EX: Team Rocket Returns (ex7)

Built 2026-10-01 (builder e2). Research: `/mnt/project-files/every-era/ex/research/ex7.md`, `ex7-products.md`, `ex-pack-structure.md`, `ex-finish-types.md`, `second-source-check.md`, `np.md`. Released 2004-11-08 (Serebii and an excerpt of the fandom page; TCGplayer says 2004-11-01, a listing date: conflict recorded). 111 cards (109 printed), plus NP 031-033 filed as `ex7-np031` to `ex7-np033`.

## Cards
Rare Holo 14, Rare Holo EX 11 (96-106, all Rocket's: Articuno, Entei, Hitmonchan, Mewtwo, Moltres, Scizor, Scyther, Sneasel, Snorlax, Suicune, Zapdos), Rare Holo Star 3 (107 Mudkip, 108 Torchic, 109 Treecko: the first English Gold Stars, cosmos with a plain yellow border), Rare 14, Uncommon 35, Common 32, Rare Secret 2 (110 Charmeleon the box topper, `boxTopper: true`; 111 Here Comes Team Rocket!, a Trainer on the holo sheet, dealt). Counts match pkmn.gg and the research. Scans: scrydex (`<id>-<n>`, byte-identical to pokemontcg.io's hires, so there was no better source to swap to), mirrored at 600 and 320 px WebP. I looked at the first card, Dark Tyranitar, Togepi, R Energy, Rocket's Articuno ex, Rocket's Mewtwo ex, the Gold Stars, the secrets and a Stadium: full cards, square-cropped, no white borders, no crooked crops, no watermarks; the printed foil sparkle of the holos is baked into the scan (as in the DP era). None swapped.

## Pack
Nine cards (5 C, 2 U, 1 reverse, rare slot); no Energy, no code card. `exSlots({ holo: .2455, ex: .0741, goldStar: .0093, secret: .0045 })`: Elite Fourum posts 46-47 (14 boxes: 9 holos and 3 ex a box, a Gold Star replacing an ex in 1 box in 3, the secret an H2 card on the holo sheet at 1 in 220) with PokeGym 11875 (6 stars in 18 boxes at one prerelease, 2 in 432 packs at another). Holo and ex medium, Gold Star medium-low, secret low (one seen in 14 boxes). Simulated 20,000 packs: holo .248, ex .071, star .0101, secret .005, no box topper.
Reverse: 95 reverse cards; 15 reverse commons are printed twice (EF post 47, 110-cell sheet) but the post does not name them: `reverseTwice` is `[]`. Family `energy` with the set name stamped bottom right (silver on non-rares, orange on Rare and Holo Rare, gold name).

## Finish notes for the finish agents
Gold Stars are `Rare Holo Star`: cosmos, yellow border. The James and Jessie theme decks carry cosmos Dark Dragonite and Dark Tyranitar holos that exist only in those decks (not built). Rocket's ex have the silver ex frame (`foil-ex ex-ex`).

Maps: none (TCG Live has no EX maps; js/ex-foil.js `exMap` is the finish agents' hook). Finish classes come from `exPattern`: Rare = `foil-none`, Rare Holo = `foil-holo ex-cosmos`, Pokémon-ex = `foil-ex ex-ex`.

## Wrapper
Tyranitar, Mewtwo, Gyarados, Scyther (pokesymbols labels, checked by eye; wired to ex7-19, 99, 36, 102). Source: pokesymbols.com `ex-team-rocket-returns-pack-N.avif`, flat photos with a dark purple crimp, cut with `clean_pack_art.py` in place. Usable.

## Prices
TCGplayer lists no market price for the pack: $3,000 is its price-history value (weekly point 2026-09-28; 33 of the last 52 weeks have a point, $1,999.99 in February): thin, over $300 a pack, used as it is in `data/sealed.json` and the catalog cost. The box is 36 packs ($108,000). Singles: 107 of 111 priced from tcgcsv; Rocket's Snorlax ex and the Torchic and Treecko Gold Stars have no tcgcsv market price, so their `market` is the last point of TCGplayer's own history ($406.67, $1,200, $1,000); Mudkip ★ has neither and stays unpriced (the registry sell value applies). Rocket's Zapdos ex $1,079.99.

## Products
Booster Box (98579) and the three EX Collector's Window Tins [Moltres ex / Articuno ex / Zapdos ex] (NP 031-033, Nov 2005): three EX-series packs "Team Rocket Returns through Legend Maker era" in Bulbapedia's excerpt, the mix not given, so they open as three Team Rocket Returns packs (low-medium). The same tins are listed in the ex8-ex12 research: only ex7 files them. Left out: the James and Jessie theme decks (no list, no TCGplayer id).
