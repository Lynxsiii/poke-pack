# Tera ex and ACE SPEC (shared Scarlet & Violet finishes)

Two finishes that appear in most Scarlet & Violet sets, built once so every
set draws them the same way (2026-09-27, from the Shrouded Fable thread).
Rules: `css/holo/sv-finishes.css`. Hook: `foilPattern()` in `js/app.js`
(and its copy in `lab/lab.js`). Both need the card's TCG Live foil map;
without one the card keeps its older recipe.

## Which cards

| Finish | Cards | TCG Live | Site classes |
|---|---|---|---|
| Tera ex | Double Rare or Ultra Rare with `"Tera"` in `subtypes` | `SV_ULTRA` / `ETCHED`, print id ends `DoubleRareC` / `UltraRareC` | `foil-ex foil-tera` (DR), `foil-ultra foil-tera` (UR), plus `has-foil-map has-etch-map` |
| ACE SPEC Rare | rarity `ACE SPEC Rare` | `ACE_FOIL` / `ETCHED`, print id `..._Ace_AceFoil_Etched` | `foil-holo foil-acespec`, plus `has-foil-map has-etch-map` |

Counts across every SV set in the export (checked 2026-09-27): 70
`DoubleRareC`, 32 `UltraRareC`, 33 `ACE_FOIL`. A Tera Pokémon's Special
Illustration Rare and Hyper Rare print as ordinary SIR / gold (`SpecialIllustrationRare`,
`HyperRare`), so the hook only takes DR and UR.

The `Tera` subtype in `data/<set>.json` matched the `C` prints exactly in
sv5, sv6, sv6pt5 and sv7-sv8 (DR and UR only). One exception: Prismatic
Evolutions (sv8pt5) #92 is `DoubleRareC` in TCG Live but has no `Tera`
subtype in the site data; add the subtype if that card should get the finish.

`js/foil-maps.js` `cureOf()` gives mapped Double Rares the SouthernCross star
coat. Tera Double Rares are excluded: their print ids carry no cast and cure.

## Tera ex (`SV_ULTRA` / `ETCHED`)

- **Where** (foil map): the whole card, the Pokémon and the text box at part
  strength (mid grey); on full arts the crystal facets are separate grey
  steps, so the shine stays faceted.
- **Etch**: a fine line grating over everything but the attack box, cut
  with four-point sparkles (the X shapes in the etch map).
- **Pattern**: the same foil as a Special Illustration Rare. The crystal
  look is ink.
- **Recipe**: the SIR port from `celebration.css` (pokemon-cards-151's
  special illustration rare): a 15deg rainbow on `.foil` (color-dodge),
  two light bars crossing with the tilt on `::before` (hard-light), glitter
  on `::after` (plus-lighter), a multiply glare, and the etch hot spot on
  `.glare::after`. Resting, desaturated so the silver stays silver.

## ACE SPEC (`ACE_FOIL` / `ETCHED`)

- **Where** (foil map): the frame and magenta body at part strength, the
  vertical ACE SPEC banners full, the art background light, the item itself
  mostly not foil.
- **Etch**: fingerprint-like line fields over the art background, the item
  and the banners; the text box is smooth (white in the etch map).
- **Pattern**: when the finish was revealed (official Japanese pack opening,
  clipped by PokeBeach, 2024-01-20, "Footage of New ACE SPEC Holofoil
  Pattern Revealed!"), collectors called it the Radiant or crosshatch
  pattern. The video frame shows a grid of bright diamonds in the art
  background and broad diagonal light bands across the pink body.
- **Recipe**: pokemon-cards-css's `radiant-holo.css`, masked by the map:
  crossed 45deg grey bars (exclusion, darken, color-dodge over a pointer
  radial) on `.foil`; its 55deg pastel rainbow through the etch map on
  `::after`; glitter under a radial on `::before`; a hard-light glare.
- **Pitfall**: the magenta stock has an empty green channel, so no dodge
  inside `.foil` can put a rainbow on it. The pastel sweep is repeated in
  `.glare::after` (masked by the etch, with the white hot spot), where the
  glare's hard-light lifts it. That is what makes the pink body shimmer.

## Verify

```
python3 .claude/skills/card-textures/scripts/fetch_foil_maps.py --set sv6pt5 --key sv6-5 --cards 15,81,58,60,62 --ship --write-data
node .claude/skills/card-textures/scripts/foil_probe.mjs --query "set=sv6pt5&cards=15,81,58,60&poses=rest,50:50,20:15,80:30&proof=off" --out /tmp/tera-ace.png
```

Shrouded Fable: 15 and 81 are Revavroom ex (Tera DR and UR), 58, 60 and 62
the three ACE SPECs.
