# Shrouded Fable (sv6pt5)

A 99-card special set (64 + 35 secret), August 2024, written up 2026-09-27
from the Shrouded Fable thread. Its one new finish is the reverse holo: every
reverse in the set, and the reverse holo basic Energy its packs can carry,
wear Poké Balls in hexagon "chains". The rest of the set uses the Scarlet &
Violet finishes other sets share; Tera ex and ACE SPEC are in
`sv-tera-acespec.md`.

## Finishes by rarity (TCG Live, key `sv6-5`)

The finish is the tail of each print's `ext.tcgl.longFormID`.

| Rarity | TCG Live | Site classes |
|---|---|---|
| Rare (7) | `SvHolo_Holo` | `foil-holo foil-svholo` + map |
| Double Rare (5) | `SunPillar_Holo_CastAndCure_SouthernCross` | `foil-ex foil-sunpillar` + `cure-stars` |
| Double Rare, Tera (15) | `SvUltra_Etched` | `foil-ex foil-tera` |
| ACE SPEC Rare (58, 60, 62) | `AceFoil_Etched` | `foil-holo foil-acespec` |
| Illustration Rare (15) | `SunPillar_Holo` | `foil-ir` + map |
| Ultra Rare (9) | `SunPillar_Etched` | `foil-ultra` + map and etch |
| Ultra Rare, Tera (81) | `SvUltra_Etched` | `foil-ultra foil-tera` |
| Special Illustration Rare (5) | `SvUltra_Etched` | `foil-sir` + map and etch |
| Hyper Rare (5, gold) | `SvUltra_Etched` | `foil-gold` + map and etch |
| Common / Uncommon / Rare reverse | `<set>_<n>_ph_<Rarity>_FlatSilver_Reverse` | `foil-reverse foil-rev-chain` |

Maps: `fetch_foil_maps.py --set sv6pt5 --key sv6-5 --all --ship --write-data`
ships 57 foil and 26 etch maps (5.9 MB), promos included. On 2026-09-27,
`check_foil_maps.py --set sv6pt5` flagged no real swaps. It did flag near
ties between prints of the same art, such as svp129 against its Pokémon
Center stamp, and between flat full-card maps (the Rares, the gold Energy).
An overlay of each flagged map on its scan confirmed all of them.

## The chain reverse (`foil-rev-chain`)

- **What it is**: a pattern pressed into flat mirror silver, with no cosmos
  texture. TCG Live calls these prints `FlatSilver_Reverse`. The `_ph_`
  segment (pattern holo) sets them apart from a normal reverse.
- **Pattern**: Poké Balls inside double-outlined, pointy-topped hexagons,
  about 19% of the card width. They sit in a staggered grid, so they run in
  diagonal chains with narrow gaps (Pecharunt's chains).
- **Where**: like any reverse, the frame, name bar and text box are foil and
  the picture window is matte.
- **Reference photos**: PokeBeach's set guide (2024-07,
  https://www.pokebeach.com/2024/07/shrouded-fable-set-guide-card-images-special-reverse-holos-and-product-list)
  shows Genesect (40), Croagunk (23) and the Grass and Water Energy as
  reverses. The pattern is plainly visible at rest as grey lines, and it
  shimmers when the card is tilted.
- **Tile**: `assets/foil/sv6pt5/chain.svg`, a 120 x 104 tile holding two
  hexagons (circumradius 30, inner outline 26) at (30, 26) and (90, 78),
  plus the copies that wrap them. It is drawn in dark #1f2933 at 2.2 with a
  light #e2e8ee line nudged up-left, the same etched look as
  `pokeball-etch.svg`. It is set at `42% auto`.
- **Recipe** (`css/holo/shrouded-fable.css`): `.foil` stacks the tile (normal
  blend) over a pointer radial (soft-light) over a 125deg pastel silver ramp
  that tracks `--background-x/y`. The whole layer is soft-light, resting at
  opacity 0.42 and reaching about 0.82 when lit. `::after` adds a screen
  hot spot.
- **Pitfall**: the first version put the tile on `.foil::before`, as the
  Poké Ball premium reverse does, and the pattern vanished at rest. base.css
  hides `.foil::before`, `::after` and `.glare` on a resting card for scroll
  speed. A pattern that the real card shows at rest must be a layer of
  `.foil` itself.

## Reverse holo basic Energy

- Shrouded Fable packs can hold a reverse holo basic Energy (SVE 001-008 in
  the chain pattern), a feature only some special sets have. TCGplayer lists
  all eight in the set's group (23529) at about $0.33 to $0.59.
- **Foil area**: the whole face except the Energy orb. The swirl and the
  frame are foil. The orb on the SVE scans is centred at 50.3% / 52.8% with
  a radius of 24.6% of the width (17.5% of the height). The recipe masks
  `--art` minus an ellipse of 25% x 17.9% there. The stock
  `.foil-reverse.foil-energy` window would leave the background matte.
- **Glare**: the stock Energy glare window ends at 64% of the height, which
  draws a hard line across a whole-face foil. The chain Energy's glare is
  masked by `--art` alone.
- **Data**: the eight cards live in `data/sv6pt5.json` as `sv6pt5-energy-*`,
  with `energy: true, reverse: true, reverseKind: "chain"`, the shared SVE
  scans, TCGplayer ids and market prices. `build_set.py` keeps cards that are
  not on the checklist, so a rebuild keeps them.
- **Engine**: `poolsFrom()` puts reverse Energy in a `reverseEnergy` pool,
  and an Energy slot with a `table` rolls between the two pools
  (`chainSlots()` in js/catalog.js).
- **Rate**: no study counts them. The site uses 1 in 6 packs, estimated from
  prices: a reverse Energy sells for about 1.7 times a reverse Common
  (median $0.22). Update it if a real count turns up.

## Verify

```
node .claude/skills/card-textures/scripts/foil_probe.mjs --query "set=sv6pt5&cards=r40,r23,energy-grass,energy-water&rev=chain&poses=rest,50:50,20:15&proof=off&w=240" --out /tmp/chain.png --width 1100
node scripts/test-shrouded-fable.mjs
```

In the lab, `r<number>` draws a card as a reverse, `rev=` names the kind,
and a card id without the set prefix works too (`energy-grass`).
