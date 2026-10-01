# Black & White: Dragon Vault (dv1)

Built 2026-10-01 (builder c2). Research: `dv1.md`, `dv1-products.md`, `bwp-claims.md`.
Released 2012-10-05. 21 cards (20 numbered + Kyurem 21/20); the five Dragon Vault stamped Mirror Holo blister promos are filed as `dv1-9-dvstamp`, `dv1-10-dvstamp`, `dv1-11-dvstamp`, `dv1-16-dvstamp` and `dv1-17-dvstamp` (promo: true, `like` the set cards), so `totalCount` is 26.

## Pack
Five holofoil cards a pack, no commons, Energy or reverse, sold only in the 3-pack Dragon Vault Blister (Bulbapedia, Pokemon.com's blurb, TCGplayer's product text, the wrapper text "5 ADDITIONAL GAME CARDS"). Elite Fourum #107 reconstructs a single 121-position sheet; Kyurem prints once, so 5/121 = 0.0413 a pack (`scarce` pool). That is the only odds source (low confidence); the other 20 cards deal uniformly.
Pack $265.25 is TCGplayer's market price (product 98948; mpapi pricepoints says the same, no sellers behind it; tcgcsv's feed omits it, so `data/sealed.json` carries it by hand). Blister: $1,995.90, TCGplayer market (98947), also absent from tcgcsv, set by `price` and `priceSource` in the config.
`rarityOverrides` {18, 19, 21: "Rare Holo"} (Exp. Share, First Ticket and Kyurem have no rarity on pkmn.gg; every card is foil), `cardFlags` {21: scarce}. `data/dv1.json` was patched with the same fields without re-running build_set.py (it would redownload the wrapper art over the cleaned files).

## Scans
Scrydex; looked at 1, 5, 11, 18, 19, 21: clean. The five stamped promos are TCGplayer product photos (145864-145868) trimmed by replace_scan; they show the Dragon Vault stamp but carry the foil baked in (a little bright and soft next to the scrydex scans). If a finish pass wants them clean: `keepScan` on the config (the stamp then disappears).

## Maps
TCG Live key `bw6-5`: all 21 cards, no etch. Overlaid on 5, 11, 19, 21: the art window only. The stamped promos have no map (no TCG Live print), their finish is `foil-holo bw-holo bw-vault` through the dv1- id.

## Wrappers
pokesymbols `dragon-vault-pack-0..4`: Dragonite, Rayquaza, Druddigon, Salamence, Haxorus (Bulbapedia agrees). The renders have a dark foil edge that is part of the pack.

## Products
Dragon Vault 3 Pack Blister (3 packs, one of the five stamped promos, `pick: 1`). No booster box exists. Reprints (Cosmos Dragonite and Salamence, Crosshatch Bagon, Shelgon, Salamence, World Championships Super Rod) are other products and not simulated.
