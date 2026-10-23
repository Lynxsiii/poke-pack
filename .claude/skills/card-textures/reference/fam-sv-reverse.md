# Holo family sv-reverse: Scarlet & Violet standard reverse holos

Module `js/fam/sv-reverse.js`, sheet `css/holo/fam/sv-reverse.css`, tiles `assets/foil/fam/sv-reverse/`, generator
`scripts/fam/sv-reverse/make_sv_reverse_tiles.py`. Era context (read-only): `css/holo/sv-reverse.css`,
`reference/sv-reverse.md`.

## Scope

Every reverse print of sv1-sv10, 151 (sv3pt5), Paldean Fates (sv4pt5), Shrouded Fable (sv6pt5), Prismatic Evolutions
(sv8pt5), Black Bolt (zsv10pt5) and White Flare (rsv10pt5): 2,134 faces, exactly the census rows `reverse && era == sv`
(audit group w2-sv-reverse; checked with `census.mjs`: 2134 claimed, 0 missing, 0 extra). Not claimed: pattern prints
(Prismatic's Poké Ball / Master Ball cards carry `pattern`), a promo's `foilAs` frame foil, and a face whose
`reverseKind` is pokeball, masterball or galaxy. In the sheet every rule also steps aside for `.foil-rev-pokeball` and
`.foil-rev-masterball` (an owned Black Bolt / White Flare copy the app resolves to a Poké Ball print through the set's
`reverseFoil`), so those keep finishes.css / prismatic.css.

## The real cards (photos: /home/user/holo-refs/w2-sv-reverse, SOURCES.md lists every URL)

- Pattern: TCG Live's per-type "cobblestone": pebbles, the type symbol, a 12-spoke badge behind the attacks; Trainers
  get Poké Balls and a Poké Ball wheel; Colorless gets star pebbles. Foil = coloured frame, name bar, text box and
  bottom strip; art window, evolution/owner circle and silver border matte. (Exeggcute SSP 001, Caterpie JTG 001,
  Pansear WHT 014, Claydol DRI 084, Penny SVI 183, Eevee PRE 074.)
- Room light: the pattern is plain to see, and it is the INVERSE of TCG Live's map: the map's white network (bare foil)
  is the darkest part, a deeper and more saturated shade of the frame colour (Exeggcute macro: network/pebble ratio
  0.75 in red, 0.87 in green; Toxel SVI 071, Grimer SVI 126); stars, symbols and the badge ring read lightest.
  On white frames the network is mid-grey metal against the paper (Chansey SVI 144, Swablu PAR 152, Drampa JTG 130).
- Lit: the type colour stays saturated, pebbles go pale (Greavard PAF), a broad soft pastel rainbow at grazing angles,
  warm amber / green / violet along an edge (Gumshoos OBF 177, Swablu PAR 152). In the hard specular hotspot the bare
  network itself turns brightest (Greavard macro, Gumshoos): the pattern inverts there. Two photos; not modelled (see
  below).
- Texture: fine sandy pinpoint grain over the foil, noticed second (Grimer and Greavard macros).
- Shrouded Fable: hexagon + Poké Ball chain instead of the cobblestone, bold double outlines darker than the frame,
  lighter cells, silver border plain (Joltik SFA 001, Genesect SFA 040, Horsea SFA 010).
- Ancient / Future: plain mirror, no pebbles, broad soft rainbow / gold swirl (Flutter Mane PRE 043; one photo, low
  confidence).

## The recipe (2026-10-22, round 1)

1. `.foil`, every pose: a flat ink MULTIPLIED onto the card through the mask scan ∩ `--svr-dark` − layout window.
   `--svr-dark` (`<type>-dark-v1.webp`) is TCG Live's map turned into darkness alpha: d = clip((grey − 0.35)/0.65)^1.4
   inside the region (network 1, pebbles 0.25-0.7, symbols 0). Ink on a coloured frame = 0.94 · (1 − k(1 − c²)), c the
   type's median frame colour, k 0.6 (Darkness 0.45), so the weak channels drop most and the network is a deeper shade
   of the frame, never olive (`make_sv_reverse_tiles.py inks` prints them). White/silver frames (Colorless, Metal,
   Trainer, Special Energy): a cool grey, hsl(215 9% 53%).
2. `.foil::before`, lit: a 4-stop pastel wash (pink-violet, green, amber, violet) at 250% moved by --background-x/y,
   opacity bow × (0.25 + 0.75 · pointer-from-center), inside the multiply group, so it tints the metal and never paper.
3. `.cure` (module `cure: true`), lit: white pool at the pointer + soft −45° streak, OVERLAY, through scan ∩
   (region − (dark ∪ window)): the light lands on pebbles and symbols, the network stays coloured, the pattern survives
   every pose. `.cure::after`: grain-v1.webp (white specks, 64 px tile), brighter in the pool.
4. Mirror (Ancient/Future): flat light ink over the whole region, the pool over all of it, stronger rainbow.
5. Chain (`.foil-rev-chain`): chain-v1.svg multiplied inside the region; lit, the pool through chain-light-v1.svg
   (alpha: cells 1, field 0.75, outlines 0.2) so the outlines stay visible under the light.
6. Special Energy: no layout window (the region is the text box).

## Lessons

- WebKit (Safari) paints an element with a CSS background IMAGE only once that image is decoded; screenshots of a dozen
  cards caught the pattern (and once the whole `.foil`) missing on random cells, even with the card scan itself as the
  background. Gradients plus mask images painted in every render. So every pattern here is a mask and every colour a
  gradient. (The chain svg background is the one exception; it rendered every time, it is tiny.)
- mask-composite lists: one operator per layer, top first; give the bottom layer `add` explicitly. The era sheet's
  `intersect, subtract` over three layers repeats to `intersect` on the bottom layer.
- `--win-owner` is set by app.js only, never by the lab: an unset var makes the whole mask-image invalid (mask none,
  the multiply covers the card). The sheet falls back to `var(--win-owner, var(--win-holo))`, so in the lab an owner
  card's portrait circle is not excluded; on the site it is.
- Weighting the lit pool by the darkness map (physically right at the hotspot) washes the pattern out over most of the
  card at the audit poses (the crossover); weighting it by 1 − d keeps the pattern, which is what every photo shows at
  phone size.

## What changed (round 1)

Before: the era sheet's colour-dodge only (faint pattern at rest, white frames blank, lit washed to pale yellow-white,
no rainbow, no grain); Black Bolt / White Flare on the old cosmos crackle (the era regex missed `rsv`/`zsv`); Shrouded
Fable's chain over the silver border with grey hairlines; Prismatic's has-rev-map camouflage. After: the family above
for all 2,134 faces. Before/after/real sheets: /home/user/holo-work/fix-sv-reverse/ba-*.jpg.

Open: owned Black Bolt / White Flare copies still resolve to a Poké Ball print (data: `reverseFoil: 'pokeball'` in
js/catalog.js); the hotspot inversion is not modelled; chain outlines are a neutral grey multiply, not frame-tinted.
