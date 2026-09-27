# Paldean Fates (sv4pt5)

How the Shiny Vault set got its real foils (2026-09-27, from the Paldean
Fates thread). Two new recipes live in `css/holo/shiny-vault.css`: the
Shiny Vault's silver fingerprint etch, and the Hyper Rares' glitter gold
with a raised Scodix line. Everything else reuses a shared recipe.

## TCG Live data

- Export keys: `sv4-5` for the set (`v0.1.9.13/sv4-5.en-US.json`, 326
  records: 245 standard prints plus reverses), `svbsp` for the SVP promos
  sold with it (069-084). Filter on `_std_` in `longFormID` before matching
  by collector number, as in [temporal-forces.md](temporal-forces.md).
- Maps: `fetch_foil_maps.py --set sv4pt5 --all --ship --write-data` (the set
  now has a row in SETS; promos resolve through PROMO_KEYS). 199 cards and
  promos get a foil map; every Shiny, SIR, Hyper, UR and Tera ex also gets an
  etch map. Then `--cards <every shiny> --ship --write-data --etch-angle
  etched` adds the line-direction maps (below): 149 cards, 2.1 MB.
- `check_foil_maps.py --set sv4pt5` flags several shinies as possible swaps.
  They are not: the shiny art window is pale on both the scan and the map,
  so the overlay score has almost no margin. Checked by eye; nothing added to
  FOIL_SWAPS.

## Finish per rarity

| Rarity (count) | TCG Live print id (after `_std_`) | Site classes | Recipe lives in |
|---|---|---|---|
| Rare (16) | `Rare_SvHolo_Holo` | `foil-holo foil-svholo` | `celebration.css` |
| Double Rare (7) | `DoubleRare_SunPillar_Holo_CastAndCure_SouthernCross` | `foil-ex foil-sunpillar cure-stars` | `celebration.css` |
| Tera Double Rare (3: 2, 6, 54) | `DoubleRareC_SvUltra_Etched` | `foil-ex foil-tera` | `sv-finishes.css` ([sv-tera-acespec.md](sv-tera-acespec.md)) |
| Shiny Rare (120, 92-211; promos 069-071, 076-077, 079-080, 082-083) | `Shiny_SunPillar_Etched` | `foil-holo foil-shiny` | `shiny-vault.css` |
| Shiny Ultra Rare (12, 212-223; promos 072-074, 078, 081, 084) | `ShinyUltraRare_SunPillar_Etched` | `foil-ultra foil-shiny` | `shiny-vault.css` |
| Illustration Rare (3; promo 075) | `IllustrationRare_SunPillar_Holo` | `foil-ir` | map-aware IR: SV base set thread |
| Ultra Rare (5 full-art Supporters) | `UltraRare_SunPillar_Etched` | `foil-ultra` | map-aware full art: Paradox Rift thread |
| Special Illustration Rare (8) | `SpecialIllustrationRare_SvUltra_Etched` | `foil-sir` | `celebration.css` |
| Hyper Rare (6, 240-245) | `HyperRare_SvUltraScodix_Etched` | `foil-gold foil-scodix` (card `finish: "scodix"`) | `shiny-vault.css` |

Tera ex that are Shiny Ultra Rares (212 Forretress, 214, promo 074
Charizard) print SunPillar/Etched, not SvUltra, so `foilPattern()` checks
the shiny rarities before the Tera test.

## What the real cards look like

Photos in the project's shared folder, `paldean-fates/texture-refs/`
(sources in `SOURCES.txt`, notes in `NOTES.md`).

- **Shiny Rare**: foil in the art window (Pokémon included, weaker on some)
  and the thin silver border; name band and text box are matte ink. The
  window is mirror silver, darker than the white scan, cut with a fine
  fingerprint etch: wavy lines laid along concentric rings round the
  Pokémon, a straighter hatch on the Pokémon, the printed stars and
  sparkles smooth. Under a lamp the rings flash as bright arcs, there is a
  cyan-blue sheen, and one narrow diagonal rainbow band slides across.
- **Shiny Ultra Rare**: the same etch edge to edge, text box included, with
  two or three broad diagonal rainbow bands.
- **Hyper Rare**: not plain gold. Gold line art and fills on a teal ground,
  dense one- and two-pixel glitter over everything (bright and dark grains,
  on the gold too), a fine line etch on the gold fills, and one wide, nearly
  level rainbow band that recolours the teal as the card tips. The line art
  is a raised clear Scodix varnish (inferred from edge highlights in the
  macros; no raking-light photo).

## Recipe: Shiny Vault (`.foil-shiny`)

The whole `.foil` group hard-lights onto the scan. That is the only blend
that works on both kinds of print under this foil: the pale window (which
colour-dodge cannot brighten) goes silver-grey where the group is under
half, and the inked Pokémon and border brighten where it is over.

- `.foil` (rest and held): flat grey with the etch map drawn over it in
  white, multiplied by a silver ramp that is brighter under the pointer,
  then a narrow repeating sun-pillar band on top (`--pf-w`, `--pf-period`,
  wider on the SUR). Rest: saturate 0.3, opacity 0.3 x strength.
- `::before` (held): the fingerprint catching the light. A fine grating
  flashes where its lines face the lamp, so whole arcs of one direction
  light together. `--etch-angle` is the etch's line direction as a grey (0
  lines up and down, 1 across; structure tensor, sigma 3 px at 733 px, half
  size, q60, ~10 KB per SR). The layer is a flat colour set by the pointer,
  `--pf-p` = 0.8 x from-left + 0.2 x from-top, difference-blended over that
  map, then `filter: invert(1) brightness(0.57) contrast(15)`: 1 - |angle -
  p|, with everything more than ~0.18 away pushed to black. The flat colour
  is `rgb(p+22, p, p-22)`, so each channel matches a slightly different
  direction and the arcs get rainbow edges, like a real grating. Masked by
  the etch map, screened.
- `::after`: a cyan-to-blue radial round the pointer, masked by the etch,
  screened. `.glare`: soft white overlay only.

## Recipe: Scodix gold (`.foil-gold.foil-scodix`)

Same hard-light group.

- `.foil`: grey 76% with the etch in white, times a silver ramp; the glitter
  tile (`assets/foil/glitter-flecks.webp`, from
  `scripts/make_glitter_flecks.py`, seeded, 26 KB) twice, once
  difference-blended at an offset (grains near black) and once screened
  (grains that sparkle), so flecks show on bright gold as well as teal; a
  wide band at 176deg on a 100% x 300% layer that rolls with
  `--background-y`.
- `::before`: glitter times glitter at another scale, one copy moving with
  the pointer, `brightness(6)`: only grains that line up light, so the
  flecks wink one at a time as the card turns.
- `::after` and `.glare::after`: the raised line. The etch map twice as a
  mask, one copy nudged up to 1.5 px towards the light, composited with
  `mask-composite: subtract` (`-webkit-mask-composite: source-out`): what is
  left is a sliver on the lit side of every stroke (screened, pale gold) and,
  nudged the other way on `.glare::after`, a sliver of shadow (multiply).

## Pitfalls

- **A fine etch aliases at 400 px.** The shiny fingerprint is a 3 px pitch at
  TCG Live's 733 px; shipped at 400 px it turns to grain. That is fine as
  grain, but the rings only read through the smooth line-direction map, not
  from the etch itself.
- **Difference-blending an antialiased etch cancels out.** Where the etch
  averages to half alpha, `|1 - s|` and `s` mix to exactly half grey, which
  hard-light leaves untouched, so the window never goes silver. Draw the
  etch over a grey and multiply by the ramp instead.
- **Glitter on black cannot sit in a hard-light group as `normal`.** Black
  multiplies the card to black; screen it onto the group's grey.
- **Rest paints `.foil` only** (PR 5): pseudo layers and `.glare` exist only
  while a card is held or settling, so the resting silver and grain belong
  on `.foil`.
- **`--etch-angle` must survive the lab's reset.** `lab.js` keeps per-card
  custom properties matching its KEEP pattern; the new variable was added.
- **Stamped promo prints** (Premium Collection stamps) are filed under
  TCGplayer's Miscellaneous group 2374; `build_products.py` now takes a
  per-promo `tcgplayerGroup`.
