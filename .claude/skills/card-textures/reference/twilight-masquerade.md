# Twilight Masquerade (sv6): finish by rarity

How each rarity in Twilight Masquerade prints, what TCG Live calls it, and
which site recipe draws it (2026-09-27, from the Twilight Masquerade thread).
Foil and etch maps come from TCG Live's export (key `sv6`, promos `svbsp`);
105 cards ship maps under `assets/foil/maps/sv6/`. No new recipe was needed
beyond the text box fix in [sv-rare-holo.md](sv-rare-holo.md); every other
row uses a shared finish.

## Finish table

TCG Live print ids read `<Name>_sv6_<n>_std_<suffix>`; the suffix is below.

| Rarity | Count | TCG Live suffix | Site classes | Recipe lives in |
|---|---|---|---|---|
| Common, Uncommon | 76, 55 | `Common_NonFoil_None`, `Uncommon_NonFoil_None` | `foil-none` | |
| Reverse (C, U, R) | every C/U/R | `..._ph_<Rarity>_FlatSilver_Reverse` | `foil-reverse` | the older reverse recipe; no map needed |
| Rare | 16 | `Rare_SvHolo_Holo` | `foil-holo foil-svholo has-foil-map` (+ `frame-paradox` on Future/Ancient) | `celebration.css`, `sv-rare.css` |
| Double Rare | 7 | `DoubleRare_SunPillar_Holo_CastAndCure_SouthernCross` | `foil-ex foil-sunpillar has-foil-map cure-stars` | `celebration.css` |
| Double Rare, Tera ex | 7 | `DoubleRareC_SvUltra_Etched` | `foil-ex foil-tera has-foil-map has-etch-map` | `sv-finishes.css` |
| ACE SPEC Rare | 6 | `Ace_AceFoil_Etched` | `foil-holo foil-acespec has-foil-map has-etch-map` | `sv-finishes.css` |
| Ultra Rare | 14 | `UltraRare_SunPillar_Etched` | `foil-ultra has-foil-map has-etch-map` | `sv-fullart.css` (from the Paradox Rift thread; older full-art recipe until it lands) |
| Ultra Rare, Tera ex | 7 | `UltraRareC_SvUltra_Etched` | `foil-ultra foil-tera has-foil-map has-etch-map` | `sv-finishes.css` |
| Illustration Rare | 21 | `IllustrationRare_SunPillar_Holo` | `foil-ir has-foil-map` | `celebration.css` (the SV base set thread is making it map-aware) |
| Special Illustration Rare | 11 | `SpecialIllustrationRare_SvUltra_Etched` | `foil-sir has-foil-map has-etch-map` | `celebration.css` |
| Hyper Rare (gold) | 6 | `HyperRare_SvUltra_Etched` | `foil-gold has-foil-map has-etch-map` | `sv-fullart.css` (from the Paradox Rift thread; older full-art recipe until it lands) |

The Tera ex are the `C` prints: DR 25, 29, 40, 64, 106, 112, 130 and UR 190,
191, 192, 194, 198, 199, 200. Their SIRs (e.g. 211 Teal Mask Ogerpon ex)
print as ordinary SIRs. `scripts/test-twilight-masquerade.mjs` asserts the
list and that each one ships an etch map.

## Promos (SVP 115 to 123)

Promos don't pull from packs, so they borrow a pack rarity's recipe with
`foilAs` in `data/sv6.json` (`foilLook()` in `js/app.js` reads it).

| Promo | Product | TCG Live suffix | `foilAs` |
|---|---|---|---|
| 115 to 118 Thwackey, Infernape, Froslass, Tatsugiri | Build & Battle Box (one each) | `RareHolo_SvHolo_Holo` | `Rare` |
| 119 Toxel, 120 Pupitar | single pack blisters | `Rare_Cosmos_Holo` | `Cosmos` |
| 121 Revavroom, 122 Snorlax | 3 pack blisters | `Rare_Cosmos_Holo` | `Cosmos` |
| 123 Teal Mask Ogerpon | Elite Trainer Box (the Pokémon Center ETB has a stamped print, `svp123-pc`) | `IllustrationRare_SunPillar_Holo` | `Illustration Rare` |

## Pitfalls

- The lab (`lab/lab.js`) has no `foilAs` handling, so a promo shows up
  there without foil. Check promos in the app's inspector instead (open
  the set's pack page and click a promo on its product card).
- `check_foil_maps.py --set sv6` flags 10 foil and 6 etch maps. None are
  swaps. The one pair it calls a likely swap, 190 and 221, is Teal Mask
  Ogerpon ex as Ultra Rare and as gold Hyper Rare: the same artwork, so
  both maps fit both scans. The same goes for `svp123-pc` against
  `svp123`. The rest are Rares and promos with busy art (Ting-Lu 110,
  Infernape 33) scoring slightly above a faint map. Overlay the flagged
  map on its own scan before believing a swap.
- A Future or Ancient Rare (19 Iron Leaves, 63 Walking Wake) went black
  across its attacks under the old Rare recipe. The current one keeps them
  readable (see [sv-rare-holo.md](sv-rare-holo.md)).

## Verify

```
python3 scripts/build_products.py sv6   # adds the promos first, so --all maps them too
python3 .claude/skills/card-textures/scripts/fetch_foil_maps.py --set sv6 --key sv6 --all --ship --write-data
python3 .claude/skills/card-textures/scripts/check_foil_maps.py --set sv6
node .claude/skills/card-textures/scripts/foil_probe.mjs --query "set=sv6&cards=19,23,25,152,168,189,214,221&poses=rest,20:15,50:50,80:70&proof=off" --out /tmp/twm.png
node scripts/test-twilight-masquerade.mjs
```

One card per row of the table: 19 Rare (Future), 23 DR, 25 Tera DR,
152 ACE SPEC, 168 IR, 189 UR, 214 SIR (Greninja ex), 221 gold.
