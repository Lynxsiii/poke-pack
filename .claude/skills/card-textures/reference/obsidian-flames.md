# Obsidian Flames (sv3)

What the Obsidian Flames thread learned taking a whole Scarlet & Violet main
set to its TCG Live finishes (2026-09-27). No new CSS was needed: every
print in the set is a finish the site already draws, or one of the shared
Scarlet & Violet finishes other threads built ([sv-tera-acespec.md](sv-tera-acespec.md)
for Tera ex). The work was data: the right maps on the right cards.

## The set in TCG Live's export

Key `sv3` (index abbreviation `OBF`), 406 records: 230 standard prints plus
176 reverse prints. A reverse print is the same card number with `_ph_`
instead of `_std_` in `ext.tcgl.longFormID` and `FLAT_SILVER` / `REVERSE`
foil. Count only `_std_` rows when checking the checklist.

| Rarity | Cards | `foil.type` / `mask` | Print id tail | Site classes |
|---|---|---|---|---|
| Common, Uncommon | 92, 74 | none | `NonFoil_None` | no foil; reverse prints `foil-reverse` |
| Rare | 10 | `SV_HOLO` / `HOLO` | `Rare_SvHolo_Holo` | `foil-holo foil-svholo` |
| Double Rare | 15 | `SUN_PILLAR` / `HOLO` | `DoubleRare_SunPillar_Holo_CastAndCure_SouthernCross` | `foil-ex foil-sunpillar cure-stars` |
| Double Rare, Tera | 6 | `SV_ULTRA` / `ETCHED` | `DoubleRareC_SvUltra_Etched` | `foil-ex foil-tera` |
| Ultra Rare | 8 | `SUN_PILLAR` / `ETCHED` | `UltraRare_SunPillar_Etched` | `foil-ultra` |
| Ultra Rare, Tera | 4 | `SV_ULTRA` / `ETCHED` | `UltraRareC_SvUltra_Etched` | `foil-ultra foil-tera` |
| Illustration Rare | 12 | `SUN_PILLAR` / `HOLO` | `IllustrationRare_SunPillar_Holo` | `foil-ir` |
| Special Illustration Rare | 6 | `SV_ULTRA` / `ETCHED` | `SpecialIllustrationRare_SvUltra_Etched` | `foil-sir` |
| Hyper Rare | 3 | `SV_ULTRA` / `ETCHED` | `HyperRare_SvUltra_Etched` (the Fire Energy: `HyperRareBasicEnergy_...`) | `foil-gold` |

The 8 plain Ultra Rares are the 4 non-Tera ex (Glimmora, Absol, Revavroom,
Pidgeot) and the 4 Trainers. Tera Charizard ex has a Tera DR (125) and a
Tera UR (215), but its SIR (223) and gold (228) print like any SIR and Hyper
Rare, and the Eiscue ex SIR (222) likewise: the `C` in the print id is the
signal, not the Pokémon. pkmn.gg's `subtypes` carried `"Tera"` on exactly
the 10 `C` prints plus those three, and `isTeraFoil()` only takes DR and UR,
so no data fix was needed.

Promos sold with the set (all in TCG Live's `svbsp`):

| Promo | Product | Foil | `foilAs` |
|---|---|---|---|
| SVP 036-039 Palafin, Cleffa, Togekiss, Mawile | Build & Battle Box (one of four) | `SV_HOLO` / `HOLO`, print id `RareHolo`; the map cuts out the gold Obsidian Flames stamp | `Rare` |
| SVP 040 Pawmi, 041 Paldean Wooper | single-pack blisters | `COSMOS` / `HOLO` | `Cosmos` |
| SVP 042 Houndstone, 043 Eevee | 3-pack blisters | `COSMOS` / `HOLO` | `Cosmos` |
| SVP 044 Charmander (and the Pokémon Center stamped copy) | ETB, Pokémon Center ETB | `SUN_PILLAR` / `HOLO`, print id `IllustrationRare` | `Illustration Rare` |

## Shipping the maps

```
python3 .claude/skills/card-textures/scripts/fetch_foil_maps.py --set sv3 --key sv3 --all --ship --write-data
```

Run it after `build_products.py`, so the promos exist in `data/sv3.json`
and get their `svbsp` maps too (the `svp` prefix is already in
`PROMO_KEYS`). A `-pc` stamped copy gets its base card's map. Result: 74
foil maps (64 set cards, 10 promos) and 27 etch maps (every `SV_ULTRA`
print), 6.6 MB.

## What the maps show

- **Holo Rares and the prerelease promos foil the silver border.** The
  outer 13 px of a 367 px map is full white on `SV_HOLO` prints, and the
  art background is foil with the Pokémon and any stamp black. Illustration
  Rares leave the border out (`33`, the maps' floor). So a bright rim on a
  Rare is the data, not a mask bug.
- **The maps' black is 33, not 0**: about 13% alpha everywhere off the
  foil. The site's recipes are tuned with that floor (me55 has it too).
- **SVP 044 Charmander** is foil over almost the whole card, text box
  included, at part strength: its map averages 166 against about 95 for a
  holo Rare.

## Pitfalls

- **The lab ignores `foilAs`.** `lab/lab.js` has its own copy of
  `foilPattern()` without `foilLook()`, so a promo renders as rarity
  `Promo` with no foil in the lab. Check promos in the app instead: open
  `/packs/<set>`, then `/catalog`, click the hidden
  `[data-inspect="<card id>"]` from `page.evaluate`, and hover
  `#inspect:not(.hidden) .tcg` (it is an overlay, not a `<dialog>`). The
  card's `class` attribute then shows which recipe won.
- **Wait for `load`, not `networkidle`**, when driving the app with
  Playwright: the live price refresh keeps the network busy.
- **Scroll before a full-page screenshot.** Sections fade in as they enter
  the viewport, so an unscrolled capture shows them nearly black.

## Verify

```
node .claude/skills/card-textures/scripts/foil_probe.mjs \
  --query "set=sv3&cards=25,33,125,198,213,215,223,228&poses=rest,30:25,50:50,75:70&w=260&proof=off" \
  --out /tmp/obf.png --width 2300
```

One card per finish: Scovillain (Rare), Victini ex (DR), Tera Charizard ex
(Tera DR), Gloom (IR), Glimmora ex (UR), Tera Charizard ex (Tera UR),
Charizard ex (SIR, gold).
