# HeartGold & SoulSilver (hgss1)

Built 2026-10-01 (builder d4). Research: /mnt/project-files/every-era/hgss/research/hgss1.md, hgss-pack-structure.md, hgss-products.md, hsp-claims.md, second-source-check.md.
Released 2010-02-10 (pokemon.com + TCGplayer group 1402). 124 cards (123 printed + the Alph Lithograph ONE) plus 12 `hgss1-hspNN` promos (counted under hsp). Series `heartgold-soulsilver`, `era: "dp"`, scrydex `hgss1`, pkmn.gg slug `heartgold-soulsilver`. Rarities: 14 Rare Holo (incl. Red Gyarados 123), 21 Rare, 38 Uncommon, 32 Common, 8 own Energy (115-122, rarity "Energy"), 6 Rare Prime (105-110), 4 LEGEND (111-114), 1 Rare Secret (ONE, `alph: true`).

## Pack
Ten cards (5 Commons, 3 Uncommons, a reverse slot, a rare slot), no code card. `dpSlots({ holo: 0.2361, rareSpecial: [["legend", 0.0833], ["alph", 0.0139]], reverseSpecial: [["prime", 0.1667]], commonEnergy: 0.3306 })`, `energyPrint "own"`. Elite Fourum's sheet model (25 boxes) with Flipside as the second source for Prime and LEGEND; the Energy rate (8/121 per common slot) is Elite Fourum only. Red Gyarados sits in the holo pool at an equal share (EF has it at about half a regular holo). data/pullrates.json.

## Scans
All five sets use scrydex (pokemontcg.io ids). Looked at 8 per set (first, a Rare Holo, a Prime, a LEGEND, the last numbered card, the Alph, an Energy, a Common): clean, no white borders, no photos. The LEGEND halves bleed art across the pair: 111's art runs off its right edge into 112's left edge (the scaffold assumes the first number of a pair is the TOP half; finish agent: confirm). Alph scrydex key `hgss1-ONE` works.

## Wrappers
pokesymbols `heartgold-and-soulsilver-pack-0..3` (Ho-Oh, Donphan, Lugia, Ampharos): opaque tight photos of the pack, not the white-box renders clean_pack_art.py was written for (`--check` lists them as opaque; base1's vintage packs are skipped the same way). Looked at on a dark background: no white strip, left as downloaded (no -v2).

## Prices
TCGplayer group 1402: 124/124 singles. Booster pack market $466.66 (low $750); no box price on TCGplayer.

## Products (promos filed here, `hsp`)
HGSS01 Ho-Oh and HGSS02 Lugia (Poster Packs, 2 hgss1 + 2 pop9), HGSS03/04 Pikachu / Wobbuffet (Three Pack Blisters, 2 hgss1 + 1 dp6), HGSS05+06 Hoothoot and Noctowl (Two Pack Blister, hgss1 + pop9), HGSS07-09 Feraligatr / Meganium / Typhlosion Primes (Spring 2010 Collector's Tins, 2 hgss1 + dp6 + pl1), HGSS19-21 Raikou / Entei / Suicune (Fall 2010 Legendary Beast Tins, hgss1 + hgss3 + pl4 + pl1). One product per version. HGSS07-09 are real Primes (scans checked: spiky window): `foilAs "Rare Prime"`; HGSS19-21 are plain basics: `Rare Holo`. Cracked Ice has no finish class: HGSS16/17, 24/25 and the second prints use Rare Holo. Product photos: none (no TCGplayer sealed ids exist for these, `tcgplayerId` null). Prices are derived (packs x this set's pack price + promos): a mixed-set product (POP 9, Legends Awakened, Platinum packs) is overstated.
Left out: HGSS18 Tropical Tidal Wave (no price, no scrydex scan), the Clash of Legends Boxes (TCGplayer 206309/206310: 4 packs of unknown sets, no promo card in them), the theme decks Ember Spark / Mind Flood / Growth Clash (no lists), the Knock Out Collection (contents not found).

## Maps
No TCG Live maps for HGSS (probed 160 numbers under 40 keys by the scaffold). Window holos use the finish agents' drawn mask.
