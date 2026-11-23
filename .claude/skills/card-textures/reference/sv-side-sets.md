# Scarlet & Violet side sets (tot23, tot24, mcd23, mcd24, mcd26) and basic Energy runs

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

## McDonald's Collection 2026 (mcd26)

Added 2026-11-23. TCGplayer group 24938 ("McDonald's Promos 2026", code M26,
001/015 to 015/015, regulation H, Scarlet & Violet frame). US Happy Meals from
November 10 to December 14, 2026 (Canada November 3 to December 7).

What the sources say (checked 2026-11-23):

- **Two cards to a Happy Meal**, not four: Nintendo Wire ("two different
  trading cards out of a total of 15"), Nerd Snack ("a pack of 2 promo
  cards"), Axee Tech ("a booster of two cards"), God is a Geek. PokeBeach's
  pre-launch rumour of four cards with one holo was wrong.
- **Seven foils**: Pokémon.com's announcement via Nintendo Wire, Nerd Snack
  and Axee Tech. Which seven: TCGplayer lists only a Holofoil printing for
  002 Chandelure, 003 Palafin, 004 Pikachu, 005 Mimikyu, 006 Lucario, 008
  Tyranitar and 012 Jirachi (Normal only for the rest), and Nerd Snack names
  the same seven.
- **One holo a pack** is one source only (a reviewer's blog, Joseph Writer
  Anderson: "one holo card and one regular", "unique confetti foil"). Nerd
  Snack and Axee Tech say McDonald's has not said. The site keeps the 2023 and
  2024 rule (`printSlots(1)`: one plain, one holo). Revisit if pulls show
  two-holo or no-holo packs.
- **Finish**: confetti per the same blog, as in 2023/2024 (`foilAs:
  "Confetti"`). Not seen on a scan, since Scrydex's scans are flat.
- No sealed pack on TCGplayer, so the pack costs the average holo plus the
  average non-holo (2.90 on 2026-11-23), written by hand into data/sealed.json
  and `cost`, as for the 2011-2019 McDonald's sets.
- No pack scan online: the pouch is drawn by scripts/make_mcd_sm_wrappers.py.
  No mark on pokesymbols.com either: the logo is Scrydex's McDonald's mark
  (images.scrydex.com/pokemon/mcd26-logo/logo) and the symbol is the M24
  badge relettered M26 (Scrydex's own is 38x18).

Every card reprints a Scarlet & Violet or Mega Evolution card's art. Maps:
Palafin and Tyranitar borrow their SV_HOLO std prints (sv3 062, sv2 135),
Pikachu and Lucario the `svalt` alt prints of sv5 051 and sv1 114 (Lucario's
has the Scarlet & Violet stamp at the art's bottom right, which leaves a thin
outline of the stamp plain), all with `border`. Chandelure, Mimikyu and Jirachi
have no holo twin in TCG Live and use `"tcgl": "window"`. Registration checked
on all seven.

pkmn.gg misreads three attack names (Chandelure "Combustion Burning",
Lucario "Vengeful Knuckles", Metagross "[C][C][C] Lustrous Blast"); the
scans print the original names, so the config copies those cards' attacks
from sv3-38, sv1-114 and sv5-115 with `"set"`.
