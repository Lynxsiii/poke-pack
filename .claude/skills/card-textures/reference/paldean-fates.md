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

Rewritten 2026-09-27 (the "Shiny and promo holo fix" thread; the first
version's hard-light group left the window paper white because the etch's
white ridges pushed the group over half, where hard-light screens). The
scan is white where the silver is, so the silver has to darken it: `.foil`
multiplies onto the card.

- `.foil` (rest and held), bottom up: a silver radial centred on the
  pointer (97% under the lamp, 92% at a quarter, `--pf-lo` 85% far off:
  a mirror reads from the hot spot, not from a dark far side); the
  sun-pillar bands, pastel and translucent (`--pf-a` 0.62, so over the
  silver they come out as tinted silver, not paint; `--pf-w` 9% every
  30%); the etch map soft-lit on top, which at card size is grain, not
  lines. Rest: saturate 0.6, opacity 0.85. The SUR (`.foil-ultra.foil-shiny`)
  widens the bands to 13% every 26%, `--pf-a` 0.85, `--pf-lo` 81%.
  Until 2026-09-28 the far side was 74% (SUR 68%) under a glare that went
  to 30% black: with a thumb low on the text box, where a phone is held,
  the whole art window multiplied down to grey while the glare's white
  lifted the matte text box, and Murkrow 181 came out washed and muddy in
  the reveal (Noah). The photos show the silver bright wherever the lamp
  is not.
- `::before` (held): the same bands, saturated, screened at `--pf-screen`
  (0.38, SUR 0.5), so a band that crosses the Pokémon's ink lightens it
  with colour.
- `::after` (held): the fingerprint catching the light. `--etch-angle` is
  the etch's line direction as a grey (0 lines up and down, 1 across;
  structure tensor, sigma 3 px at 733 px, half size, q60, ~10 KB per SR).
  A flat colour set by the pointer, `--pf-p` = 0.15 + 0.8 x (0.8 x
  from-left + 0.2 x from-top), is difference-blended over that map, then
  `filter: invert(1) brightness(0.6) contrast(6)`: 1 - |angle - p|, with
  everything more than ~0.2 away fading to black. Softer than the first
  version's `contrast(15)`, so the arcs read as ripples rather than wires.
  The flat colour is `rgb(p+24, p, p-24)`, so each channel matches a
  slightly different direction and the arcs get rainbow edges. Masked by
  the etch map, screened at 0.9.
- `.glare::after` (held): the ridges facing away, half a turn round the
  whorl (`--pf-q: mod(calc(var(--pf-p) + 0.5), 1)`), the same difference
  trick multiplied in at 0.45: the dark half of the same ripples. Browsers
  without `mod()` drop the rule and lose only the dark half.
- `.glare`: a white overlay highlight, 0.55 under the lamp, 0.18 at a
  quarter, 12% black far off, at 0.7 (was 0.75 / 0.25 / 30% black at 0.8:
  the white doubled the matte ink's darks where the thumb sat and the
  black dimmed the art).

Stamped shinies (svp072-stamp, svp073-stamp) cut the Paldean Fates logo out
of the map: [promos.md](promos.md).

## Recipe: Scodix gold (`.foil-gold.foil-scodix`)

Same hard-light group. Judge it beside
`texture-refs/hyper-rare_242-chien-pao-ex_whole-card-glitter-rainbow-pillar_photo.jpg`
and the flat-light Ting-Lu ex photo: smooth satin gold, the line art as
darker gold outlines, a fine pinpoint grain on the teal, text crisp, one
broad level rainbow band.

- `.foil` (rebuilt twice on 2026-09-28; the second time after Noah's
  Chien-Pao ex viewer screenshot, "I really hope this isnt the one it
  pushed": flat yellow blobs, a rough speckle over the teal and the text):
  white, the **soft engraving** difference-blended onto it, a 40% floor
  screened on so a solid outline stops at 40%, the light pool multiplied in
  (56% at the pointer, 44% far: plain foil sits at hard-light's neutral),
  **one** copy of the fine glitter tile screened on at 170 px, and the
  band at 176deg (`--pf-a` 0.55) on a 100% x 300% layer that rolls with
  `--background-y`: one level pillar 12.5% of the layer tall (about a
  third of the card, the Chien-Pao ex photo's pillar), never a wash. At
  15% and 0.8 it recoloured the teal like a plain rainbow holo, and at 28%
  it washed the whole card when the card was tilted sideways in the
  viewer (Noah's second screenshot). Rest is opacity 0.6, band 0.2,
  saturate 0.55: the
  official scan is flat gold fills on teal, so the engraving is the only
  line detail the Pokémon has and it must read in any light.
- The soft engraving is `etchSoft` on the card (`--etch-soft` from
  `js/foil-maps.js`), `assets/foil/maps/<set>/<n>-etch-soft.webp`, drawn by
  `scripts/soften_etch.py --set <set> --all`: TCG Live's etch blurred by
  1.2 px at map size, gain 1.2, then raised to the power 2.6, so the thick
  line art keeps nearly all its depth (about 0.9) while the 3 px hatch on
  the gold fills averages to about 0.47, a satin tone. Why: at viewer size
  (a 300 px card on a desktop, 220 px on a phone) the sharp hatch lands
  between pixels and, difference-blended at full strength, aliased into
  speckle over every gold fill; the photos show that hatch only as satin.
- The glitter is `assets/foil/glitter-fine.webp` (256 px,
  `scripts/make_glitter_flecks.py --density 0.03 --seed 4242`: 0.14% of
  pixels bright, 4% lit at all), screened once. The old stack laid the
  dense tile (`glitter-flecks.webp`, 0.3% bright, 16% lit) twice at 96 and
  112 px, one copy difference-blended to near black: that copy put dark
  grain over the text box and the teal, and both together read as sand
  before anything else at phone size.
- `::before`: fine glitter times fine glitter at 170 and 214 px, one copy
  moving with the pointer, `brightness(3)` at 0.4: only grains that line up
  light, a few points that change as the card turns (was the dense tile at
  3.5 and 0.6: speckle).
- `::after` and `.glare::after`: the raised line. The soft engraving twice
  as a mask, one copy nudged up to 1.5 px towards the light, composited
  with `mask-composite: subtract` (`-webkit-mask-composite: source-out`):
  what is left is a sliver on the lit side of every stroke (screened, pale
  gold, 0.55) and, nudged the other way on `.glare::after`, a sliver of
  shadow (multiply, 0.35). Both took the sharp etch at 0.9 and 0.55 before,
  which lit the whole hatch as a shimmer.

Prismatic Evolutions' five Hyper Rares (sv8pt5 176-180) share the recipe
and carry their own `etchSoft`.

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
