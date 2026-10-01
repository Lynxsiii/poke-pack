# Wizards of the Coast: Neo Genesis (neo1)

Built 2026-10-01 (builder w3). Research: `/mnt/project-files/every-era/wotc/research/neo1.md`, `neo1-products.md`, `wotc-pack-structure.md`, `theme-decks.md`, `second-source-check.md`.
Release 2000-12-16. English Unlimited prints only. 111 cards (printed 111): Rare Holo 19, Rare 16, Uncommon 35, Common 35, **Energy 6** (106-111, the set's own basic Energy, rarity `Energy` after build_set). Counts match pkmn.gg.

## Scans
Scrydex ids equal the set id. Contact sheets of all 111 checked: aligned, no borders. **Every Pokémon scan is the 1st Edition print** (black "Edition 1" stamp); every source (scrydex, pokemontcg.io, pkmn.gg, TCGdex) serves the same image, so nothing was swapped. neo1-109 `types` fixed by hand after build_set.

## Pack
Eleven cards: 6 Commons, 3 Uncommons, **1 basic Energy**, a rare slot; no reverse. `wotcSlots({ commons: 6, energy: 1, holo: 0.3333 })`, `energyPrint: "own"`. Holo 1 in 3 (WotC chat, PSA 9409, Flipside, Elite Fourum), the Energy slot Elite Fourum's alone: medium-high.

## Maps and finish
No TCG Live maps. Rare Holo = `wotc-cosmos` over the art window; everything else unfoiled.

## Wrapper
Four, pokesymbols `neo-genesis-pack-N`: Meganium, Feraligatr, Typhlosion, Lugia, wired to neo1-10, 4, 17, 9. Cut with clean_pack_art.py in place and checked on dark.

## Prices
TCGplayer group 1396, Unlimited rows, all 111 priced ($0.37 to $531.39 Lugia; Typhlosion $201.63). **Pack $632.32** (tcgcsv market, thin). Booster box 193335: tcgcsv lists no price, so a manual $14,000 (the history's Unopened bucket, no sales in the window; 36 x the pack would be $22,763.52). Theme deck Cold Fusion 234505: no market price, shop price is the mid $437.50, visible through its promo (holo Kingdra neo1-8). Its 60-card list is a box-contents row (scripts/box-research/wotc-neo.json).
