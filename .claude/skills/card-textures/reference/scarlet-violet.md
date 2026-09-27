# Scarlet & Violet base set (sv1)

How the first Scarlet & Violet set was brought in with its real foils
(2026-09-27, from the Scarlet & Violet thread). No new recipe: every finish
it prints is one of the shared Scarlet & Violet sheets or a `celebration.css`
map recipe. What is here is the mapping, and what sv1 taught about the gold.

## TCG Live data

- Export key `sv1`, 444 records: 258 standard prints plus reverses (`_ph_`
  in the `longFormID`, `FlatSilver_Reverse`); filter on `_std_`.
- Maps: `fetch_foil_maps.py --set sv1 --key sv1 --all --ship --write-data`
  gives 93 cards a foil map and 38 an etch map; the 12 SVP promos sold with
  the set take theirs from `svbsp` (`--cards svp005,...,svp014-pc`).
- `check_foil_maps.py --set sv1` flags only near-ties between prints of the
  same art (227/253 Miraidon, 231/254 Koraidon, the two gold energies
  257/258); no swaps.

## Finish per rarity

| Rarity (count) | TCG Live foil / mask | Site classes | Recipe lives in |
|---|---|---|---|
| Rare (21) | `SvHolo` / `Holo` | `foil-holo foil-svholo` | `celebration.css` |
| Double Rare (10) | `SunPillar` / `Holo` + `CastAndCure_SouthernCross` | `foil-ex foil-sunpillar` + stars | `celebration.css`, `foil-maps.js` `cureOf()` |
| Tera Double Rare (2: 32 Arcanine ex, 45 Gyarados ex) | `SvUltra` / `Etched` | `foil-ex foil-tera` | `sv-finishes.css` |
| Illustration Rare (24) | `SunPillar` / `Holo`, no etch | `foil-ir has-foil-map` | `celebration.css` (`.foil-ir.has-foil-map`) |
| Ultra Rare (18) | `SunPillar` / `Etched` | `foil-ultra has-etch-map` | `sv-fullart.css` |
| Tera Ultra Rare (2: 224 Arcanine ex, 225 Gyarados ex) | `SvUltra` / `Etched` | `foil-ultra foil-tera` | `sv-finishes.css` |
| Special Illustration Rare (10) | `SvUltra` / `Etched` | `foil-sir has-foil-map` | `celebration.css` |
| Hyper Rare, gold (6, two of them Basic Energy) | `SvUltra` / `Etched` | `foil-gold has-etch-map` | `sv-fullart.css` |

Basic energy is non-foil. No ACE SPEC, no god packs. The four Tera cards
already carried `"Tera"` in `subtypes`.

Promos (`foilAs` from TCG Live's `svbsp`): SVP 005-008 Build & Battle
prerelease promos `Rare`; SVP 009-012 blister promos `Cosmos`; SVP 013
Miraidon and 014 Koraidon (ETB, and the Pokémon Center stamped prints)
`Illustration Rare`. The stamped prints borrow the unstamped card's map.

## What sv1 taught

- **Bright gold ink goes orange under a saturated dodge.** sv1's gold cards
  (Koraidon ex especially, and the near-white gold energies) are brighter
  than later sets'. pokemon-cards-151's hyper rare dodges its 15deg rainbow
  at `brightness(.6) saturate(1)`; the rainbow's red and magenta slices push
  the red channel to full and the card turns orange and red when lit.
  `soft-light` and `overlay` keep the hue but go orange-brown in the
  shadows. A paler dodge, `brightness(.5) contrast(1.5) saturate(.45)`, kept
  it gold with a rainbow tint. `sv-fullart.css` settled on `saturate(.8)`
  from Paradox Rift; check sv1 253/254/257 before raising it.
- **A Supporter glare on a pale full art hazes the face.** A brighter glare
  variant for Supporter Ultra Rares washed out 238 Miriam's face; the plain
  full-art glare is enough.
- **The alpha maps are not upstream's luminance `--foil`.** Soft-lighting
  only the etch over black squares the brightness and the full art goes dim;
  the foil map has to lift the smooth foil first. `sv-fullart.md` has the
  two-layer port that `sv-fullart.css` uses.

## Verify

```
node .claude/skills/card-textures/scripts/foil_probe.mjs \
  --query "set=sv1&cards=80,81,45,204,245,228,238,225,253,254,257&proof=off&poses=rest,30:25,70:60&w=200" \
  --out /tmp/sv1.png --width 2500
```

One card per finish: Rare, Double Rare, Tera Double Rare, IR, SIR, UR (ex
and Supporter), Tera UR, gold (ex and energy). The lab draws promos without
their `foilAs` (`foil-none`); check promos in the shop instead.
