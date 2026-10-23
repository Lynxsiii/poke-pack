# Holo family sv-sir: Scarlet & Violet Special Illustration Rares

Module `js/fam/sv-sir.js`, sheet `css/holo/fam/sv-sir.css` (every rule scoped to `.fam-sv-sir`), generators
`scripts/fam/sv-sir/make_sir_masks.py` (per-card masks) and `scripts/fam/sv-sir/make_specks.py` (the glitter tile),
assets `assets/foil/fam/sv-sir/`. Holo accuracy overhaul, 2026-10-22 (audit group `w2-sv-sir`).

## Scope

Every non-reverse face whose rarity after `foilLook()` is "Special Illustration Rare" in the Scarlet & Violet sets
(`sv<n>-`, `rsv10pt5-`, `zsv10pt5-`: the faces `foilExtras()` marks `era-sv`), drawn on a foil map: the app's
`foil-sir`. 172 faces on 2026-10-22, exactly the census group (era sv, `foil-sir`), including the 18 Future/Ancient
prints (`frame-paradox`, no effect on SIRs), the Prismatic Evolutions promos svp174-176 (`has-etch-angle`, ignored
here like everywhere else for SIRs) and Team Rocket's Moltres ex with its Destined Rivals stamp (sv10 229-stamp, whose
Live map already cuts the stamp out). Not the Mega Evolution or 30th Celebration SIRs: they keep the shared recipe in
`css/holo/celebration.css` (Noah liked the ME one, #147).

## The real card (photos: /home/user/holo-refs/w2-sv-sir, sources in its SOURCES.md)

TCG Live: SV_ULTRA / ETCHED for every SV SIR, so the group's photos carry over between cards.

- Where: the whole face is foil, frame and text box included; the Pokémon is matte ink over the foil with much less
  glitter. Live's maps agree (frame ~0.97, Pokémon 0.06-0.35, background 0.3-0.7): they are right.
  (Mew ex PAF 232 macro, Latias ex SSP 239 macro, Gardevoir ex SVI 245 text box macro.)
- Pattern: dense pinpoint glitter, each speck one saturated spectral colour, 0.1-0.2 mm (1-2 device px on a 220 px
  card at 3x), over fingerprint ridges about 0.15 mm apart that are sub-pixel at phone size: the ridges read as grain
  and a direction in the sheen, never as visible lines (Mew, Latias, Charizard ex PAF 234, Miraidon ex SVI 244).
- Colour: the painting keeps its saturation and its darks under normal light. The rainbow is the specks' sparkle
  plus one local spectral flare near the light (Charizard ex's Tera bar, Iono PAF 237's border). Only at a grazing
  angle does the whole card wash pale silver (Latias angle photo).
- Frame: mid to dark grey silver with a dense visible grain even in diffuse light (Iron Leaves ex 203 toploader photo,
  Durant ex 236 top edge, Volcanion ex 182 sleeved scan, the JP Garchomp SAR scan); a rainbow edge near the light.
- Ink: black text, HP numbers and line art stay black at every angle.
- Live's etch maps are 400 px stylised fields (a maze on Durant 236, contour rings on Garchomp 245) at about 0.6 mm
  pitch, four times coarser than the real ridges: drawn as lines at phone size they read as wallpaper.

## What the family draws (2026-10-22)

The old look (celebration.css `.foil-sir.has-foil-map.era-sv`) cut a colour-dodged 15deg rainbow to the Live etch with
a 12% floor, lit the etch white on `.glare::after` and laid a 62/47/34% grey hard-light glare over everything: the
etch showed as mazes, rings and line screens, the glare washed every painting milky and turned the black text grey,
the frame rested as a smooth light-grey gradient and no pinpoint glitter showed at all. Now, each layer in its own
blend so none of them can lift the ink:

- `--svsir-map` (`<set>/<n>-map-v1.webp`, the scan's size): Live's foil map times a keep-dark pass from the scan
  (dark and neutral pixels, value under 0.10-0.22 and chroma under 0.05-0.13, grown one pixel), so every layer leaves
  the black text, numbers and outlines alone. Navy and deep reds stay in (translucent inks the glitter shows through).
- `.foil`: colour-dodge, the speck tile (`specks-v1.webp`, 256 px at 38.8% of the card: one tile pixel per device
  pixel at 220 x 3) at 0.6, rest and lit alike: the sandy grain of the photos in diffuse light, strongest on the frame,
  faint on the Pokémon. `::after` (lit): the Live etch as a dim sheen around the pointer inside the dodge.
- `.cure` (the module asks for it): multiply, a 72% grey masked to the frame by the map to the sixth power: the
  silver frame's mid grey at rest and lit, lifting to bright silver around the pointer as the light fades in
  (`--card-opacity`, so touching the card does not pop the frame). It is shown at rest, and hidden with shine off, on
  unowned cards in the bulk grid and on a failed scan, like the foil. The 19 Stellar Tera prints whose frame is printed
  as a rainbow crystal (STELLAR_FRAME in the module: frame chroma over 0.4 in the scan; Pikachu ex SSP 238 in hand
  shows it bright) take `svsir-prism-frame`: dimmed to 90%, not greyed.
- `.glare` (lit): hard-light on a neutral 50% grey: two copies of the speck tile drifting against each other and
  turning hue with the tilt, a small light pool; masked by the art, a pool around the pointer (full within about a
  third of the card's width, 0.2 beyond) and the map over itself (2m - m^2). `::after`: one hard-edged spectral band,
  about a third of the card wide, near the pointer only (its own pool), masked once more by the map so it stays off
  the Pokémon.

Measured on Durant 236 (WebKit, 220 x 3, art box 0.1-0.35 x 0.35-0.5): saturation at 30:25 0.33 against 0.39 at rest
(the old look: 0.18 against 0.37), darkest 5% of the art 0.10 against 0.10 at rest (old: 0.24). dark_specks ok on all
sample sets; foil_coverage and rainbow_speed clean.

## Open

- The band is a guess at where the flare sits: the photos show one, near the light, but not how it moves.
- Okidogi 90 and other cards whose painting is mostly the Pokémon show little glitter: Live's map holds the Pokémon
  near 0, as the photos of other SIRs do; no photo of Okidogi itself under a lamp.
