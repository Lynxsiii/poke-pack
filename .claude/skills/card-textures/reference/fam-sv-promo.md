# Holo family sv-promo: Scarlet & Violet Black Star (SVP) cosmos promos

Module `js/fam/sv-promo.js`, sheet `css/holo/fam/sv-promo.css` (replaces the ground of the cosmos recipe in
`css/holo/promos.css`), assets `assets/foil/fam/sv-promo/` (specks-hd, specks-pixel, map-sv4-svp061,
map-sv4-svp063), generators `scripts/fam/sv-promo/make_specks.py`, `make_maps.py`. Built 2026-11-23 from the audit
w2-sv-promo.

## Scope
Cosmos faces with a foil map and an SV id that are SVP-numbered (`svp009` ...) or stamped (`12-stamp`,
`wht062-stamp`): 53 faces. Not claimed (still on the era sheets, listed in the audit): set-number cosmos blister
promos (sv3pt5 26/63/64/68/94/125/149-cosmos, sv9 52/135/136/151-cosmos, sv10 102/103/149/174-cosmos), the 151 cosmos
energies, Trick or Trade (tot24), McDonald's 2023/24 confetti, the Metal Mew (sv3pt5-205-metal), the Black White
Rares (rsv10pt5/zsv10pt5 171-173), the Costco galaxy reverses (sv3pt5 1/4/7/25-costco), and the svp067/068 Double
Rares (foil-ex, the era's look).

## Finish facts (photos)
- Foil: the whole outer border and the art-window background; Pokémon, header, text box, stamps matte.
  Sources: audit photos; Snorlax SVP 122 and Arcanine SVP 011 in-hand photos, Vaporeon SVP 168
  (`/home/user/holo-refs/w2-sv-promo/q1/08.jpg`, `q1/03.jpg`, `q3/06.jpg`).
- Flat light: border charcoal with white pinpoint dots, grey planets; the art carries the same fine dots. Clean
  Scrydex scans (all 53 claimed faces) show a plain silver border instead.
- Lit: colour only in the dots/planets; the art keeps its colours.
- SVP < 140 exist in HD and pixel prints; Smoliv 023, Pineco 061, Toxel 119 photos are pixel.

## What changed (2026-11-23)
- `.foil` (rest and lit) is now normal-blended: the speck texture (white dots, planets light grey at low alpha) over
  a charcoal outer border (3.7% W sides, 2.7% H top/bottom), masked by the foil map as before. The full-area
  12-stop rainbow screen (milky / teal / yellow washes over the art) is gone; only a 0.12 white sheen when held.
- Lit colour stays in promos.css `::before` (the sweep seen through the specks); HD masks at the same 100% scale as
  the resting specks so the dots that light are the dots shown at rest. HD specks at the card's size (pinpoints),
  not 200%.
- Smoliv 023, Pineco 061, Toxel 119 get `cosmos-pixel` from the module (a data `variant` would be the cleaner fix).
- Pineco 061: new map with the body cut out; Cetitan 063: window cleared (border only) — both shipped maps were a
  flat window over the Pokémon.

## Left
- Pixel prints' coloured stars (gold/cyan/pink) at rest are not drawn: specks are monochrome.
- Lit colour in the dots is subtle; could be pushed a little if the lead wants more flash.
- The unclaimed finishes above (confetti renders nothing, Costco cosmos needs `--cosmos-bottom`, broken set-number
  cosmos maps) need their own unit.
