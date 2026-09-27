# Scarlet & Violet side sets (tot23, tot24, mcd23, mcd24) and basic Energy runs

Written up 2026-09-27 from the "Small SV sets" thread. These are packs sold
outside the expansions: Trick or Trade BOOster Bundle mini packs (3 cards)
and McDonald's Happy Meal packs (4 cards). Every pack holds exactly one holo,
so the engine fills them by print (`holo` / `plain` pools in `js/engine.js`),
not by rarity. Each card keeps the rarity symbol printed on it and says with
`holo` whether this printing is foil.

Built by `scripts/build_side_sets.py` from `data/sets/<id>.json`; styles for
the new finish are in `css/holo/side-sets.css`.

## Finishes

| Set | Holos | TCG Live has the print? | Site classes |
|---|---|---|---|
| Trick or Trade 2023 | 10, "Mirage" (the SV holo sheen), Sword & Shield reprints too | no | `foilAs: "Rare"` -> `foil-holo foil-svholo` + map |
| Trick or Trade 2024 | 10, Cosmos on the art background and silver border | no | `foilAs: "Cosmos"` -> `foil-holo foil-cosmos` + map |
| McDonald's 2023, 2024 | 6 and 7, "Confetti" holo | no | `foilAs: "Confetti"` -> `foil-holo foil-confetti` + map |

A Rare printed without foil (TOT 2023 Banette, Lycanroc, Polteageist,
Galarian Runerigus; TOT 2024 Houndstone, Chandelure) gets `foilAs: "Common"`
from the builder, which foilLook() turns into no foil. foilLook() applies
`foilAs` to any card now, not only promos, because side-set holos can't be
promos (poolsFrom keeps promos out of packs).

The Trick or Trade pumpkin Pikachu stamp (bottom right of the art, about
75-98% across and 36.5-52.5% down) is not knocked out of the foil: on 2024
holos the Cosmos dots show through it.

## Maps without a TCG Live print

None of these prints is in the TCG Live export, but most share their art with
one that is, and a map is only "where is it foil", so the builder borrows it:

- Same art in another holo print: McDonald's Sprigatito, Fuecoco, Quaxly,
  Pikachu 2024 use their Cosmos alt prints (`svalt/sv1_en_013_alt`...);
  Klawf, Dragonite, Hydreigon, Koraidon and friends use their SV_HOLO std
  prints. TOT 2024's Darkrai, Sinistcha, Teal Mask Ogerpon and the Loyal Three
  use their `svalt` Cosmos prints; Mimikyu and Flutter Mane their SV_HOLO std.
  SV_HOLO and COSMOS maps already foil the silver border.
- `"border": true` adds the silver border ring (inside edge at
  (14, 14, 351, 498) on a 367x512 map) for finishes that foil it.
- `"tcgl": "window"` is for a holo with no printed twin (TOT's Houndoom,
  Pikachu and Gengar; McDonald's Cetitan and 2023 Pikachu; every Sword &
  Shield-frame TOT 2023 holo). It is the art window (28, 50, 338, 243),
  Pokémon included, and a Stage 1 or 2 card leaves out its evolution badge
  with `assets/masks/win-evo.png`. The Sword & Shield art window is within a
  pixel or two of the SV one, and its yellow border is not foil, so those
  cards take no `border`.

Registration check: overlay the shipped map on the scan at 367x512 and look
at the art box and the badge. All 33 holos lined up on 2026-09-27.

## Confetti (`.foil-confetti`)

The Happy Meal holo: big, sparse, angular flecks that each catch their own
colour, over a pale sheen. Recipe:

- `.foil`: the cracked-ice tile (`assets/foil/celebration/cracked-ice.webp`)
  at 34% of the card, offset per card by `--seed-x/y`, excluded against a
  7-stop rainbow that slides with `--background-y`, multiplied by a pointer
  radial; `color-dodge`, `contrast(2.1)`. Rest opacity 0.18 x strength.
- `::before`: the same tile a few pixels off, counter-shifting with the
  pointer, `difference` at 0.45, so single flecks wink on and off.
- `::after`: a broad 115deg pastel sweep in `screen`, the foil between flecks.
- `.glare`: a soft `overlay` radial.

Seeds come from `js/foil-maps.js` (Confetti is in the seeded list with
Cosmos and Classic Collection) so two copies of a card don't sparkle alike.

## Scans

TCGplayer's own photos of each stamped print (`_in_1000x1000.jpg`), since no
scan host carries Trick or Trade. Most are 570-730 px wide; four TOT 2024
holos (Darkrai, Flutter Mane, Fezandipiti, Okidogi) are only ~500 px and look
a little soft. McDonald's scans are Scrydex's.

## Basic Energy runs

`BASIC_ENERGY` in `js/catalog.js` now holds SVE 001-008 (`energy-<type>`, as
before), 009-016 on Tera crystal (`energy-<type>-tera`) and 017-024 in the
Black & White style (`energy-<type>-unova`). A set picks its run with
`energyPrint`: Stellar Crown to Destined Rivals (and Prismatic) take `tera`,
Black Bolt and White Flare take `unova`, everything else keeps 001-008.
Foil Energy is per set (Shrouded Fable's chain reverse lives in
`data/sv6pt5.json`). TCG Live has their maps: `sve/sve_en_0NN_ph` (001-008
Cosmos, 009-016 FLAT_SILVER sheen for Prismatic, 017-024 TINSEL) and
`svalt/sve_en_0NN_alt` (001-008 Shrouded Fable, 009-016 Terapagos UPC
cracked ice).
