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
  and the banners. The text body is white in the etch map, so anything
  masked by the etch shows there at full strength.
- **What the real card does** (Surging Sparks photos, 2026-09-27, in
  `/mnt/project-files/surging-sparks/texture-refs/ace-spec_*.jpg`, notes in
  `../texture-notes.md`):
  - The **magenta body stays saturated hot pink** at every angle. It goes
    deeper red-magenta away from the light and brighter pink toward it, and
    never turns silver or pastel.
  - The **ACE SPEC banners** (the angled logo on the left, the ribbon on the
    right) are a separate **cyan metal** with prismatic flecks.
  - The **art window** runs the full rainbow with X and diamond facets
    (clearest on Scarlet & Violet base's Deluxe Bomb).
  - **Fine horizontal ridges** cross the whole card, visible even unlit,
    with a fine sparkle grain on the pink.
  - When the finish was revealed (PokeBeach, 2024-01-20), collectors called
    it the Radiant or crosshatch pattern.
- **Recipe**: every shine is a colour-dodge on `.foil`, masked by the map.
  - A dodge only lifts the channels the print already has. The magenta
    stock (empty green channel) just gets hotter pink, the banners (the
    map's full-strength zone) turn bright cyan, and the art window takes the
    whole spectrum.
  - `.foil` stacks the 3px ridges (multiply) over a 115deg rainbow (multiply)
    over pokemon-cards-css's radiant bars, crossed with `lighten` so the
    lattice lines are the bright ones. The ridges sit on `.foil`, so they
    show at rest.
  - `::after` runs a 55deg rainbow through the etch map (screen, low).
  - `::before` is glitter lit around the pointer.
  - The hard-light glare dims away from the light.
  - `.glare::after` lights only the ridge lines near the pointer, through a
    1-in-3px mask.
- **Pitfall** (the first version, fixed 2026-09-27): a white hot spot and a
  pastel sweep in `.glare::after`, masked by the etch map, bleached the text
  body and the art window at off-centre poses. The etch map is white over
  the text body, and the glare's hard-light screens anything lighter than
  mid-grey. Keep light, opaque colour out of the ACE glare, and let the
  dodge on `.foil` carry the colour.

## Verify

```
python3 .claude/skills/card-textures/scripts/fetch_foil_maps.py --set sv6pt5 --key sv6-5 --cards 15,81,58,60,62 --ship --write-data
node .claude/skills/card-textures/scripts/foil_probe.mjs --query "set=sv6pt5&cards=15,81,58,60&poses=rest,50:50,20:15,80:30&proof=off" --out /tmp/tera-ace.png
node .claude/skills/card-textures/scripts/foil_probe.mjs --query "set=sv5&cards=141,153,157,162&poses=rest,30:25,50:50,75:65&proof=off&w=250" --out /tmp/ace-sv5.png --width 1200
```

Shrouded Fable: 15 and 81 are Revavroom ex (Tera DR and UR), 58, 60 and 62
the three ACE SPECs. In Temporal Forces, 162 Neo Upper Energy and 153 Master
Ball show the pink holding at 30:25 and 75:65.
