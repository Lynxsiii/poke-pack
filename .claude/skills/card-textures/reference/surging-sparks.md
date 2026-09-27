# Surging Sparks (site set `sv8`)

What Surging Sparks' foils are, where that came from, and what the site ships
for it (2026-09-27, from the Surging Sparks thread). No new recipe was
written: every finish is an existing TCG Live recipe or one of the shared
Scarlet & Violet sheets. The set is the worked example of two things the
others don't have: a TCG Live map filed under the wrong card, and a Tera ex
chase (Stellar Tera Pikachu ex) printed at every rarity from Double Rare to
gold.

## Ids

| Where | Id |
|---|---|
| Site data | `data/sv8.json`, cards `sv8-<n>`, promos `sv8-svp<n>`; `SURGING_SPARKS` in `js/catalog.js` |
| TCG Live main set | `sv8` (417 prints: 252 standard plus 165 reverse holos) |
| TCG Live promos | `svbsp` (SVP 151-159 are this set's) |
| TCGplayer | set group 23651, SV promos 22872 |
| TCGdex (live prices) | `sv08` in `TCGDEX_SET`, `js/liveprices.js` |

## Foil by rarity (TCG Live export v0.1.9.13)

Filter the export on `_std_` in `longFormID` before matching by number; the
`_ph_` records are the reverses (all 165 are `FlatSilver_Reverse`, one per
Common, Uncommon and Rare).

| Rarity (cards) | `longFormID` tail | Site classes | Recipe lives in |
|---|---|---|---|
| Common, Uncommon (149) | `NonFoil_None`; reverse `FlatSilver_Reverse` | `foil-reverse` on reverses | `realism.css` (Ancient/Future: Paradox Rift thread) |
| Rare (16) | `Rare_SvHolo_Holo` | `foil-holo foil-svholo` | `celebration.css` (Ancient/Future text box: `sv-rare.css`, [sv-rare-holo.md](sv-rare-holo.md)) |
| Double Rare (9) | `DoubleRare_SunPillar_Holo_CastAndCure_SouthernCross` | `foil-ex foil-sunpillar cure-stars` | `celebration.css` |
| Tera Double Rare (9) | `DoubleRareC_SvUltra_Etched` | `foil-ex foil-tera` | `sv-finishes.css` ([sv-tera-acespec.md](sv-tera-acespec.md)) |
| ACE SPEC Rare (8) | `Ace_AceFoil_Etched` | `foil-holo foil-acespec` | `sv-finishes.css` |
| Illustration Rare (23) | `IllustrationRare_SunPillar_Holo` | `foil-ir` | `celebration.css` (map-aware IR: SV base set thread) |
| Ultra Rare (14) | `UltraRare_SunPillar_Etched` | `foil-ultra` | `sv-fullart.css` ([sv-fullart.md](sv-fullart.md)) |
| Tera Ultra Rare (7) | `UltraRareC_SvUltra_Etched` | `foil-ultra foil-tera` | `sv-finishes.css` |
| Special Illustration Rare (11, 3 of them Tera) | `SpecialIllustrationRare_SvUltra_Etched` | `foil-sir` | `celebration.css` (`.foil-sir.has-foil-map`) |
| Hyper Rare (6, 2 of them Tera) | `HyperRare_SvUltra_Etched` | `foil-gold` | `sv-fullart.css` |

The `C` on `DoubleRareC` / `UltraRareC` is what marks a Tera print. The
Tera Special Illustration Rares (238 Pikachu ex, 240 Hydreigon ex, 242
Alolan Exeggutor ex) and Tera golds (247 Pikachu ex, 248 Alolan Exeggutor ex)
have no `C` print and take the ordinary SIR and gold recipes, which is what
`isTeraFoil()` already does by only matching Double and Ultra Rares. Stellar
Tera Pikachu ex (57, 219) prints the same `SV_ULTRA` etch as the other Tera
cards; there is no separate Stellar foil in the export.

Maps: `fetch_foil_maps.py --set sv8 --key sv8 --all --ship --write-data`.
113 cards get a foil map and 55 an etch map (every Tera, ACE SPEC, Ultra,
SIR and gold). 12 MB, of which 7.2 MB are the etch maps.

## A swapped map: Amulet of Hope and Brilliant Blender

TCG Live files Amulet of Hope's (162) foil map under Brilliant Blender (164)
and the other way round; their etch maps are right. Nothing looks broken on
either card alone; the ACE SPEC shine just lands on the other card's shapes.
`FOIL_SWAPS` in `fetch_foil_maps.py` fetches each card's foil from the other
number.

Found with `check_foil_maps.py --set sv8`, which scores every map against
every scan by mutual information and flags a map whose best scan is another
card. Only 162 and 164 pointed at each other. The other flags were near ties
between prints of one art (247 gold Pikachu against 219 UR Pikachu, 248
against 225), which are fine by eye. Plain correlation or edge matching does
not work for this: it flags almost every card, because the busiest scan wins
every row.

Run the check on every set before shipping its maps.

## Ancient and Future cards

Six cards carry the Ancient or Future frame: 38 Gouging Fire (Rare), 55
Iron Bundle, 69 Miraidon, 96 Flutter Mane, 116 Koraidon (Uncommons) and 132
Iron Crown (Rare). The two Rares get `frame-paradox` from `foilExtras()`, so
`sv-rare.css` keeps their text boxes from going black under the SV holo. Their
reverses wait on the Paradox Rift thread's shared reverse; nothing here is
set-specific.

## Promos sold with the set

| Promos | Product | TCG Live `longFormID` tail | `foilAs` |
|---|---|---|---|
| SVP 151 Gouging Fire, 152 Chien-Pao, 153 Magneton, 154 Indeedee (prerelease stamp) | Build & Battle Box, pick 1 | `RareHolo_SvHolo_Holo` | Rare |
| SVP 155 Wooper, 156 Quagsire, 157 Zapdos, 158 Pachirisu | single and 3 pack blisters | `Rare_Cosmos_Holo` | Cosmos |
| SVP 159 Magneton (and its Pokémon Center stamped print) | ETB, Pokémon Center ETB | `IllustrationRare_SunPillar_Holo` | Illustration Rare |

No full-art ex promo, so the Journey Together pitfall (an `UltraRare`
`SUN_PILLAR` / `ETCHED` promo read as an IR) does not come up. The stamped
print `svp159-pc` is `{"like": "svp159", "variant": "Pokémon Center stamp"}`
in `data/sets/sv8.json` and borrows the unstamped map.

## Pitfalls

- **Enriching Energy (191) is an ACE SPEC Energy**, so `foilLayout()` gives it
  `foil-energy` first, as Temporal Forces found with Neo Upper Energy. The
  map-aware `foil-acespec` rules set their own mask, so it still draws like
  the Trainer ACE SPECs in Holo mode.
- **Commons and Uncommons have no `_std_` foil**, so 149 cards have no map;
  their reverse maps (`_ph.foil.png`) exist but the site does not read maps on
  reverses.
- **TCGplayer names drop symbols and accents** ("Nidoran F", "Flabebe").
  `scripts/fetch_tcgplayer_prices.py` folds both before it compares names; a
  set it refuses for a name mismatch is usually one of these, not drift.

## Verify

```
python3 .claude/skills/card-textures/scripts/check_foil_maps.py --set sv8
node .claude/skills/card-textures/scripts/foil_probe.mjs \
  --query "set=sv8&cards=11,4,57,162,191,192,215,219,238,247&poses=rest,30:25,70:70&proof=off&w=260" \
  --out /tmp/sv8.png --width 2900
```

One card per finish: Rare, Double Rare, Tera Double Rare, ACE SPEC Trainer,
ACE SPEC Energy, IR, UR, Tera UR, Tera SIR, Tera gold.
