# Sun & Moon box contents, built 2026-09-30

What the sealed products of the Sun & Moon sets deal besides packs and promos (the "deck box contents" work of #104, for the era). Table: `data/box-contents.json` (keys `<set>/<product id>`), built by `scripts/build_box_contents.py`; how `js/catalog.js` `boxCardList`, the Worker `openSealed` and `js/app.js` read it is in that script's docstring and in memory note poke-pack-box-contents. Full research with links: `/mnt/project-files/sun-moon/research/box-contents.md`; the same data in machine form: `scripts/box-research/sun-moon.json` (sources, confidence and notes on every row).

## What ships (sm10, sm11)
| product | row | why |
|---|---|---|
| sm10 `elite-trainer-box`, sm11 `elite-trainer-box` | `spread` 40 Energy, print `sm19` | real box: 45 Energy = 5 of each of nine types, Fairy included; the site has no Fairy Energy, so 5 of each of the other eight |
| sm10 `blastoise-gx-premium-collection` | Squirtle `sm10-33`, Wartortle `sm10-34` | Cosmos-holo reprints, TCGplayer text + Bulbapedia |

Waiting for other sets (written, verified, nothing to do but re-run the builder): sm11 Umbreon and Espeon Premium Checklane Blisters (Umbreon `sm8-120` / Espeon `sm8-89` + one Ultra Prism Eevee `sm5-104` or `sm5-105`, dealt as one of the two), needs sm5 and sm8.

Held back, single source: the **Evolution packs of every Build & Battle Box / Prerelease Kit** (sm1-sm12, 12 entries written, sm10 and sm11 included). Structure has 3 sources (pokemon.com, TCGplayer, Bulbapedia), the card-by-card group lists only Bulbapedia; no second card-level source is reachable (same outcome as the SWSH and Mega Evolution kits, deck-boxes/parts/verify-bnb-me-swsh.md). Not shipped per the 2-source rule.

Not modelled, by design: jumbo/oversize cards, sleeves, dice, coins, pins, markers, figures, playmats, code cards, the 5 Fairy Energy per ETB, theme decks inside the GX Challenge Boxes.

## Energy
- ETB: 45 Energy everywhere (Bulbapedia ETB page "increased to 45 from XY"; TCGplayer text; pokemon.com Team Up page; ToyWiz). Split 5 each of nine types: Bulbapedia Team Up "five copies of each basic Energy card (45 total)" and Shining Legends "the nine Sun & Moon Series basic Energy cards". Only Bulbapedia states the split; it is what 45 is (9 x 5).
- Print follows the set's `energyPrint`: `sm17` for sm1-sm8 and sm75 (Dragon Majesty, Sept 2018), `sm19` for sm9 (Team Up, Feb 2019) onward. The builder reads `energyPrint` from js/catalog.js and reports a problem when it disagrees with `etb.print` in the research file.
- Shared card ids `energy-<type>-sm17` / `energy-<type>-sm19` (js/catalog.js ENERGY_PRINTS); no Fairy.

## Rules for the rest of the era: what to run when a set lands
Rows are matched by **set + TCGplayer id** (products.json `tcgplayerId`), so the product ids the set builders chose do not matter; ETBs by `kind: "etb"`. Nothing in the script is per set except the research file.
1. `python3 scripts/build_box_contents.py /mnt/project-files/deck-boxes/parts` after each set's products and data are merged. It rewrites data/box-contents.json (all eras, deterministic: with no Sun & Moon change it reproduces the file byte for byte) and prints SKIPPED (why a row is held: `waiting for sm5, sm8` means those sets' data are not on the site yet), PROBLEMS (a card id the site lacks, a promo that is not the product's, a print mismatch) and NOTES.
2. Every Sun & Moon ETB appears by itself: set has `etb.print` in sun-moon.json (all 15 do) and a product of kind `etb` (the brief files it as `elite-trainer-box`; a leftover `eliteTrainerBox` in sealed.json also gets a row). Two-art ETBs (sm1 Solgaleo/Lunala, sm5 Dawn Wings/Dusk Mane) get a row each.
3. The "waiting" rows appear when their cards and product exist: sm2 Decidueye / Incineroar / Primarina-GX Premium Collections, sm3 Charizard-GX Premium Collection and Team Skull Pin Collection, sm35 Raichu-GX Special Collection, the GX Challenge Boxes (sm1 209655 230425 656924 244313 244314 656996, sm2 218327 218328, sm3 218320 218321), sm11 checklane blisters. If the set builder filed the GX reprint itself as the product's promo (`like:`), the builder deals it once (the promo copy is dropped from the box row).
4. Held rows stay out until a second source exists: edit `scripts/box-research/sun-moon.json`, add the source to `sources` and set `"confidence": "verified"`, re-run step 1. Rows: sm2 Espeon-GX / Umbreon-GX Premium Collections (137523, 137524: Umbreon-GX / Espeon-GX + Eevee reprints, Bulbapedia only), sm9 Gyarados / Raichu checklane blisters (624521, 624522) and sm10 Steelix / Wailord blisters (240188, 240189): reprinted set and number are Bulbapedia only. The sm10 blisters are not on the site yet. Build & Battle Box Evolution packs: all twelve (`buildBattle`), a second card-level list per kit. `python3 scripts/build_box_contents.py <parts> --trial` writes them to /tmp/box-contents-trial.json to try the deal (tested: with sm1-sm12 data present, every recipe deals to 23 cards; needs the Trainer pools' sets on the site).
5. When a row ships, its product's `note` in data/sets/<id>.json ("isn't simulated", "the real box also held ...") goes stale: the builder prints which ones under NOTES; edit the note there and re-run `python3 scripts/build_products.py <id>`.
6. Missing from the research on purpose (no TCGplayer id or no second source): Cosmic Eclipse's Target Arcanine / Melmetal blisters (UNB 21, 22, 128, 129 by Bulbapedia + PokeGuardian, no product id in the set research), sm5 and sm6 kit TCGplayer ids (the builder finds the set's one product of kind `battle` when the id is null), alternate-art reprints (CST 10a, GR 60a, BS 39a, CIN 63a, SL 10a ... these are the products' promos, file them in the set config), the GX Challenge Boxes' and Battle Arena theme decks (60-card lists need their own 2-source check).
7. `python3 scripts/box-research/sm_bnb.py <set> ...` re-reads a kit from Bulbapedia (all twelve pages exist; sm75, sm115 and det1 have no kit).
8. Tests: `node scripts/test-box-contents.mjs` covers every row it finds: real product, real cards (including `energy-*-sm17/-sm19`), decks dealt 200 times to full size, an ETB of each present set opened through the Worker (8 rows of 5), the Blastoise collection. No test change is needed for new rows.

## Sources
- Bulbapedia (MediaWiki API wikitext): Elite Trainer Box (TCG); Sun & Moon TCG Series merchandise (per-product sections: Team Up / Unbroken Bonds / Unified Minds ETBs, Blastoise-GX Premium Collection, the Stage 1 Blisters sections, GX Challenge Boxes, Premium Collections); `<Set> Build & Battle Box (TCG)` and `<Set> Prerelease Kit (TCG)`; Basic Fairy Energy (TCG), Basic Energy card (TCG).
- TCGplayer product text (`mp-search-api.tcgplayer.com/v1/product/<id>/details`): ETBs 181704, 185719, 193052, 129890, 145847, 149377, 164303, 170277, 175511, 194729, 199308; Blastoise-GX Premium Collection 192230; checklane blisters 229579, 229580, 624521, 624522; Steelix 240188; kits 189823, 195612; Challenge Boxes and Premium Collections listed in the research.
- pokemon.com Team Up ETB page (via r.jina.ai), pokemon.com / pokemonblog.com Build & Battle Box articles (structure), PokeGuardian (UNM checklane blisters, CE checklane blisters), ToyWiz (Sun & Moon ETB).
- Tried, nothing card-level: PokeBeach, Serebii, pkmncards, Cardmarket, pokemoncenter.com, the PokéCommunity thread.

## Oddities
- The 45th-card Fairy: 5 Energy per ETB are not dealt, so the label reads "40 basic Energy". If Fairy Energy is ever added as a site card (`energy-fairy-sm17/-sm19`), give `boxCardList` and the builder's ENERGY_TYPES a ninth type and deal 45 (5 of each of nine); the research `etb` block already records 45 and 9.
- Unified Minds' kit: groups of 8 cards add up to 21 with the promo and Bulbapedia's "4 Supporters"; the pack is 23, so the pool fills the rest (the recipe fills to 23).
- Team Up's Zapdos group carries its own Trainers (the pool then has 3 Supporters per Bulbapedia): the fill-to-23 covers it.
- The Eevee paired with each Unified Minds checklane blister (UPR 104 vs 105) is not documented: one of the two at random.
- Nothing for the products the research lists that only hold a promo and a coin: no row, the box opens as before.
