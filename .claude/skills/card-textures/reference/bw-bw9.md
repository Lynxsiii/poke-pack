# Black & White: Plasma Freeze (bw9)

Built 2026-10-01 (builder c3). Research: `/mnt/project-files/every-era/bw/research/bw9.md`, `bw9-products.md`, `bwp-claims.md`, `second-source-check.md`.
Release 2013-05-08. 122 cards (116 printed + six secrets: Empoleon, Sigilyph, Garbodor, Garchomp, Max Potion, Ultra Ball): C 32, U 32, Rare 22, Rare Holo 14, Rare Holo EX 6, Rare Ultra 8, Rare ACE 2, Rare Secret 6. Five promo cards (counted under bwp). Team Plasma cards as in bw8.

## Pack
Ten cards, no Energy; Ace Spec in the reverse slot: `bwSlots({ holo: .2315, ex: .0556, ultra: .038, secret: .0083, aceSpec: .0278 })`. EF #117 over 69 boxes (the biggest sample of the era); PokeBeach pages 25, 28, 35 run richer in secrets than the model (small samples). Each of the six secrets is about 1 pack in 720. EX high, rest medium. Team Plasma sub-sheets not modelled. Reverse pool: Common, Uncommon, Rare, Rare Holo.

## Scans and wrappers
Scrydex for all 122 (Nidoran at 40 and 43 is "Nidoran F / M" on TCGplayer: `norm()` in fetch_tcgplayer_prices.py now maps it). Looked at 1, 38, 67, 107, 111, 115, 117, 122 and the promos: clean. Wrappers: pokesymbols `plasma-freeze-pack-0..3`: Thundurus, Bisharp, Deoxys, Absol (the research's identification of the first as Thundurus matches the art and Bulbapedia's four names), cut with clean_pack_art.py.

## Maps
TCG Live key `bw9`: 36 of 36 foil prints (RH 14, EX 6, RU 8, RS 6, ACE 2), 14 with an etch map (the full arts and secrets); 5 promo maps from `bwbsp` (BW73, 74, 76, 79, 80). Overlaid: Absol, Deoxys-EX (both), Life Dew, Empoleon, Ultra Ball: fine.

## Prices
tcgcsv group 1382: 122 of 122 singles. Neither the pack nor the box has a tcgcsv price; TCGplayer's own product pages give $317.98 (pack 98517, `cost`) and $14,999.00 (box 98516, a single thin listing: it reads like a placeholder, kept because it is what TCGplayer says; drop `boosterBox` from data/sealed.json if the shop should not sell it).

## Products (7)
The Landorus and Druddigon 3 Pack Blisters (BW79, BW80), the Electrode and Moltres Single Pack (Checklane) Blisters (BW76; the Moltres blister's Cosmos Holo reprint is a Next Destinies card and is not simulated), the Team Plasma Box (Full Art Darkrai BW73 and Giratina BW74; three Black & White series packs, dealt as Plasma Freeze), the Mewtwo Figure Blister (two random BW packs, Bulbapedia only), the Deoxys Box (BW80 Tinsel Holo Druddigon; typically 1 Plasma Freeze + 2 Plasma Storm). All priced from their packs.
Not built: the theme decks "Frost Ray" (486243) and "Psy Crusher" (486245) (no price, no packs, no promo), the Sleeved Booster Pack Art Bundle (276602, single-source later listing), the Black & White Knock Out Collections (Supreme Victors + Undaunted + one Emerging Powers pack and HGSS Call of Legends promos: not a Black & White product to simulate), BW75 Metagross (prerelease, no product), BW77 and BW78 (never issued).
