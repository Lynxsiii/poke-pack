# Wizards of the Coast: Team Rocket (base5)

Built 2026-10-01 (builder w2). Research: `/mnt/project-files/every-era/wotc/research/base5.md`, `base5-products.md`, `wotc-pack-structure.md`, `second-source-check.md`, `theme-decks.md`.
Release 2000-04-24 (Bulbapedia, PSA 9247). English Unlimited prints only. 83 cards (82 printed): Rare Holo 17 (the 14 Dark Pokémon holos 1-14, Here Comes Team Rocket! 15, Rocket's Sneak Attack 16, Rainbow Energy 17), Rare 17, Uncommon 24, Common 24, **Rare Secret 1 (83 Dark Raichu)**. Counts match pkmn.gg and the research. The 1-17 holos have non-holo twins at 18-34 ("Dark Alakazam 1 / 18" and so on: two cards of the same name).

## Scans (the one problem)
Scrydex ids are the set id (`base5-<n>`), mirrored at the two sizes. I looked at all 83 on contact sheets (first, a holo, the Trainers, both special Energy, Dark Raichu, the last): clean crops, no borders, no white edges, aligned, no photo. **But every scan is the 1st Edition print** (the black "Edition 1" stamp under the art on the left): scrydex, pokemontcg.io, TCGdex, TCGplayer's listing photo and pkmn.gg all serve the same 1st Edition image (the listing is shared by both runs), pokellector's is watermarked and rotated, Bulbapedia's is 350 px and only the non-holo twin. No Unlimited scan of the holos exists on a source we may mirror, so none was swapped. A rescan of the real Unlimited cards (or retouching the stamp out) is the fix; it changes nothing but the stamp. The 4 wrappers are 1st Edition packs too (the "Edition 1" circle).

## Pack
Eleven cards: 7 Commons, 3 Uncommons, a rare slot; no basic Energy, no reverse. `wotcSlots({ holo: 0.3151, secret: 0.0182 })`: holo 1 pack in 3 (WotC chat, PSA 9247, Flipside, Elite Fourum), Dark Raichu on the holo sheet at 1 pack in 55 (Elite Fourum x6; Flipside 1:54-108, same order: medium). 20,000 simulated packs: holo 0.311, Dark Raichu 0.018, 11 cards, no duplicate. The 1st Edition run and the Dark Dragonite 5/82 error print (an uncommon-sheet oddity, Elite Fourum) are not modelled.

## Maps and finish
TCG Live has no maps for the era (probed by the scaffold agent, recorded in fetch_foil_maps.py): none shipped. Rare Holo = `wotc-cosmos` (Base Set 2 on, so Team Rocket is cosmos, not starlight); Dark Raichu "Rare Secret" is dealt as a holo card and foils like one (`wotcPattern`); Rainbow Energy 17 is a holo Energy; plain Rares are `foil-none`.

## Wrapper
Four, pokesymbols `team-rocket-pack-N` (N 0-3): 0 the Rocket gang (Giovanni, Jessie and James, Gyarados, Slowbro, Meowth), 1 Dark Gyarados, 2 Jessie and James, 3 Giovanni. Names checked against the art; wired to base5-4, 8, 15 (Here Comes Team Rocket!) and 73 (The Boss's Way). The downloads are opaque photos on white: `scripts/clean_pack_art.py` cut them in place (nothing was committed before, so no -v2; the uncut files were never shipped); checked on a dark background.

## Prices
TCGplayer group 1373, Unlimited / Unlimited Holofoil rows (`fetch_tcgplayer_prices.py` and `backfill_prices.py` and worker/prices.js now pick Unlimited over 1st Edition for this era), all 83 priced ($0.43 to $378.10 Dark Charizard; Dark Dragonite $218, Dark Blastoise $216, Dark Raichu $140). **Pack $325.52 (market), a Team Rocket pack is over $300.** Box: TCGplayer lists the Unlimited box (209437) at $36,000 with no market price and no sales history: `booster-box` at that price (36 packs would be $11,718.72). A year of card history from `backfill_prices.py`.

## Products
Built: Booster Box (kind `collection`, 36 packs). The two theme decks Devastation (TCGplayer 176942, mid $329.99, low $320) and Trouble (176943, mid $259.94, low $254.96) are NOT products here: a WotC theme deck has no pack and no promo, `promoOffers` offers nothing without one, and test-products ("every product is on sale") fails if one is listed. Their 60-card lists are in `theme-decks.md` (Base Set 2 / Team Rocket / Gym Energy numbers) for a box-contents row once the lead decides how a pack-less deck is sold. Left out: the 1st Edition pack and box (1st Edition is not a separate card here).
