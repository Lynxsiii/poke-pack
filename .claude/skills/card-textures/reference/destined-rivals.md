# Destined Rivals (sv10)

Scarlet & Violet, May 2025. 244 numbered cards (182 + 62 secret), brought
back as a playable set on 2026-09-27. A worked example of a plain SV main
set: every finish it prints is one the site already draws, so the whole job
was shipping TCG Live's maps and checking them. Use it as the template for
other SV main sets.

## What TCG Live says (export `v0.1.9.13/sv10.en-US.json`, key `sv10`)

| Rarity | Cards | `foil.type` / `foil.mask` | Cast and cure | Site class |
|---|---|---|---|---|
| Common, Uncommon | 85 + 62 | none (reverse print: `FLAT_SILVER` / `REVERSE`) | none | `foil-reverse` on the reverse only |
| Rare | 18 | `SV_HOLO` / `HOLO` (reverse: `FLAT_SILVER` / `REVERSE`) | none | `foil-holo foil-svholo` |
| Double Rare | 17 | `SUN_PILLAR` / `HOLO` | `SouthernCross` on all 17 | `foil-ex foil-sunpillar` + `cure-stars` |
| Illustration Rare | 23 | `SUN_PILLAR` / `HOLO` | none | `foil-ir` + map |
| Ultra Rare | 22 | `SUN_PILLAR` / `ETCHED` | none | `foil-ultra` + map + etch |
| Special Illustration Rare | 11 | `SV_ULTRA` / `ETCHED` | none | `foil-sir` + map + etch |
| Hyper Rare (gold) | 6 | `SV_ULTRA` / `ETCHED` | none | `foil-gold` + map + etch |

No Tera ex, no ACE SPEC, no special reverse pattern (the Poké Ball and
Master Ball reverses are 151, Prismatic and the Unova sets only).

## Shipping the maps

The skill script's `SETS` table has no sv10 row; pass the key instead:

```
python3 .claude/skills/card-textures/scripts/fetch_foil_maps.py --set sv10 --key sv10 --all --ship --write-data
python3 .claude/skills/card-textures/scripts/check_foil_maps.py --set sv10
```

- 97 cards have a foil map, 39 of them an etch map. Commons and Uncommons
  have none: TCG Live has no map for a reverse, and `foilExtras()` skips
  maps on reverses anyway.
- 9.5 MB shipped, two thirds of it etch maps (about 160 KB each at 400 px).
  A full-art etch is a fine texture over the whole card, so it compresses
  worse than a Rare's mostly black foil map.
- The download is slow (about 4 minutes for 244 cards; the CDN takes a
  second or more per miss). It resumes from `lab/cache/sv10/`.
- The swap check flags three foil maps and eight etch maps, and none is a
  swap. Overlaid on their scans, each map follows its own card's outline
  (Misty's Gyarados, Team Rocket's Tyranitar, Wobbuffet, Giovanni). The etch
  near-ties are SIR, UR and Hyper Rare prints of the same Pokémon, whose
  etch is mostly the same uniform texture. When a check is ambiguous,
  multiply the map into the scan and look.

## What the maps show that the old windows got wrong

- **Trainer's Pokémon holo Rares** stop the foil at the owner portrait in
  the art's bottom-right corner, not just at the Pokémon. That confirms what
  `scripts/make_owner_masks.py` assumed for the window masks; with a map
  shipped, the map does it exactly and the owner window only matters for
  reverses.
- **Team Rocket's Pokémon** carry the same portrait badge (seven different
  portraits, `team-rocket` to `team-rocket-7` in `assets/masks/owner/`),
  but TCG Live tags only Ethan's, Cynthia's, Arven's, Marnie's, Misty's and
  Steven's cards as `TRAINERS_POKEMON`; none of the 136 Team Rocket's prints
  has the tag. Don't use the tag to find portrait cards.
- **Rare holo** (`SV_HOLO`): foil only on the art background. The frame, the
  Pokémon, the portrait and the text box are all black in the map.
- **Double Rare**: everything but the Pokémon and the text is foil, the
  frame and text box included; the SouthernCross stars go over the Pokémon
  too (they are a varnish, `.cure`).
- **Illustration Rare**: each painting chooses its own foil areas (Yanma:
  the water and lily pads, not the dragonfly).
- **UR, SIR, Hyper Rare**: the foil map covers the whole card at part
  strength and the etch carries the detail. The SIR etches have a few solid
  bright regions (Team Rocket's Mewtwo ex SIR: parts of Giovanni) over the
  fine texture.

## Promo variants

Collection promos that are the set's own cards with a stamp or a cosmos
foil (the Build & Battle Box prerelease promos, the Destined Rivals-stamped
Team Rocket's Moltres ex from its Ultra-Premium Collection, the cosmos
Gible, Gabite, Meowth and Giovanni) are built with `like` in
`data/sets/sv10.json`. A `like` copy does not keep the base card's foil map,
so it draws with its `foilAs` rarity's older recipe. TCGplayer has no photo
of the cosmos Cynthia's Gible (product 637611, 403 on every size); its scan
is the base card's.

Related: the shared SV finishes (Tera ex, ACE SPEC in `sv-tera-acespec.md`;
map-aware Ultra Rare and gold are owned by the Paradox Rift thread) apply
to this set as soon as they land, because they key on the classes above.
