# Temporal Forces (sv5)

How the first ACE SPEC set of Scarlet & Violet was brought back with its
real foils (2026-09-27, from the Temporal Forces thread). No new recipe was
written for this set: every finish it needs is either an existing TCG Live
recipe or one of the shared Scarlet & Violet sheets other set threads own.
What is here is the mapping, and the traps found on the way.

## TCG Live data

- Export key `sv5` (`v0.1.9.13/sv5.en-US.json`), 358 records: 218 standard
  prints plus 140 reverse holos. A reverse is its own record whose
  `longFormID` has `_ph_` where the standard print has `_std_`
  (`Whimsicott_sv5_15_ph_Rare_FlatSilver_Reverse`), so filter on `_std_`
  before matching records to `data/sv5.json` by collector number.
- The export is a good checklist audit. Names, rarities, HP, attacks,
  abilities and types matched the site's data on all 218 cards; the artist
  credit did not on two (8 Roselia is Tomomi Ozaki, 9 Roserade is Gapao,
  both confirmed on the scans). The two Special Energies have no `artists`
  key at all.
- Maps: `fetch_foil_maps.py --set sv5 --key sv5 --all --ship --write-data`.
  106 cards and promos get a foil map, 43 an etch map (Ultra, SIR, Hyper,
  ACE SPEC and the Tera ex). 10.5 MB, of which 6.1 MB are the etch maps.
  Commons and Uncommons have no standard foil print, so no map.

## Finish per rarity

| Rarity (count) | TCG Live `foil.type` / `mask`, print id | Site classes | Recipe lives in |
|---|---|---|---|
| Common, Uncommon, Rare reverse (140) | `FLAT_SILVER` / `REVERSE`, `..._ph_..._FlatSilver_Reverse` | `foil-reverse` | `realism.css` (Ancient/Future reverses: the Paradox Rift thread's `rev-paradox`) |
| Rare (14) | `SV_HOLO` / `HOLO` | `foil-holo foil-svholo` | `celebration.css` (text-box fix: Twilight Masquerade thread, `sv-rare.css`) |
| Double Rare (13) | `SUN_PILLAR` / `HOLO` + `CastAndCure_SouthernCross` | `foil-ex foil-sunpillar cure-stars` | `celebration.css` |
| Tera Double Rare (2: 60 Wugtrio ex, 108 Farigiraf ex) | `SV_ULTRA` / `ETCHED`, `DoubleRareC` | `foil-ex foil-tera` | `sv-finishes.css` ([sv-tera-acespec.md](sv-tera-acespec.md)) |
| ACE SPEC Rare (7) | `ACE_FOIL` / `ETCHED`, `Ace_AceFoil_Etched` | `foil-holo foil-acespec` | `sv-finishes.css` |
| Illustration Rare (22) | `SUN_PILLAR` / `HOLO` | `foil-ir` | map-aware IR: SV base set thread |
| Ultra Rare (16) | `SUN_PILLAR` / `ETCHED` | `foil-ultra` | map-aware full art: Paradox Rift thread |
| Tera Ultra Rare (2: 190, 194) | `SV_ULTRA` / `ETCHED`, `UltraRareC` | `foil-ultra foil-tera` | `sv-finishes.css` |
| Special Illustration Rare (10) | `SV_ULTRA` / `ETCHED` | `foil-sir` | `celebration.css` (`.foil-sir.has-foil-map`) |
| Hyper Rare (6) | `SV_ULTRA` / `ETCHED` | `foil-gold` | map-aware gold: Paradox Rift thread |

The Tera cards already carried `"Tera"` in `subtypes`, which is what
`isTeraFoil()` keys on; the site data and TCG Live's `C` prints agree on all
four.

## Promos sold with the set

`build_products.py` reads each promo's foil from TCG Live's `svbsp` export
and files it as `foilAs`:

| Promos | Product | `foil.type` | `foilAs` |
|---|---|---|---|
| SVP 089-092 (prerelease stamp) | Build & Battle Box | `SV_HOLO` | Rare |
| SVP 093-096 | single and 3 pack blisters | `COSMOS` | Cosmos |
| SVP 097 Flutter Mane, 098 Iron Thorns (and their Pokémon Center stamped prints) | ETBs, Pokémon Center ETBs | `SUN_PILLAR` | Illustration Rare |
| SVP 127 Walking Wake ex, 128 Iron Leaves ex | Paradox Clash Tins | `SUN_PILLAR` | Double Rare |

The stamped Pokémon Center prints borrow the unstamped card's map: TCG Live
has no separate record for them.

## Pitfalls

- **An ACE SPEC Energy is still an Energy to `foilLayout()`.** Neo Upper
  Energy (162) is `supertype: "Energy"`, so it gets `foil-energy` before the
  ACE SPEC check can clear the layout. In Holo mode the map-aware
  `foil-acespec` rules set the mask themselves, so it draws exactly like the
  Trainer ACE SPECs (checked with `foil_probe.mjs --styles`: same
  `mask-image` stack). The Classic engine still windows it as a basic
  Energy; reorder `foilLayout()` if that matters.
- **Reverse holos never read the maps** (`foilExtras()` returns nothing for
  `card.reverse`), so shipping maps changes nothing for 140 of the set's
  prints. Any reverse-specific look has to come from the reverse classes.
- **The TCGplayer pull-rate article is rendered by script**; a plain fetch
  gets an empty page. Headless Chromium through the session proxy works if
  `--ignore-certificate-errors-spki-list` pins the key of
  `/root/.ccr/agent-proxy-ca.crt`. Pinning the first certificate in
  `ca-bundle.crt` does not (it is a public root, not the proxy's CA).

## Verify

```
node .claude/skills/card-textures/scripts/foil_probe.mjs \
  --query "set=sv5&cards=15,50,60,153,162,163,189,190,205,215&poses=rest,30:25,70:70&proof=off&w=260" \
  --out /tmp/sv5.png --width 2900
```

One card per finish: Rare, Double Rare, Tera Double Rare, ACE SPEC Trainer,
ACE SPEC Energy, IR, UR, Tera UR, SIR, Hyper Rare.
