# Family xy-secret-shiny: the XY shiny secret EX with the gold border

Remade 2026-10-02 after Noah ("remake the Secret rares, most have really shitty texture and i dont like the overuse of the
rainbow glare as most cards dont really have that rainbow glare"). Module `js/fam/xy-secret-shiny.js`, sheet
`css/holo/fam/xy-secret-shiny.css`, assets `assets/foil/fam/xy-secret-shiny/` (27 files, about 9 KB each, 0.26 MB), script
`scripts/fam/xy-secret-shiny/make_dir_maps.py`, research, photos and sheets in `/mnt/project-files/holo-remaster/xy-secret-shiny/`
(refs/SOURCES.md, sheets/, REPORT.md, LESSONS.md). Registered in `js/holo-fam.js` before xy-full-art, whose look this replaces
for these nine prints (`?famskip=xy-secret-shiny` in the lab shows the old one).

## Scope (9 faces, `famcensus.mjs`)

xy7-96 Primal Kyogre-EX, xy7-97 Primal Groudon-EX, xy7-98 M Rayquaza-EX (Ancient Origins), xy8-163 and xy8-164 Mewtwo-EX
(BREAKthrough), xy9-123 Gyarados-EX (BREAKpoint), xy10-125 Alakazam-EX (Fates Collide), xy11-115 Volcanion-EX and xy11-116
Gardevoir-EX (Steam Siege). All nine carry TCG Live's foil map and etch map.

## What the real cards do (20 frames and photos, refs/SOURCES.md)

- Engraved ("textured holofoil"): fine ridges edge to edge, rungs across the gold border, wavy streaks in the art, rings round
  the type symbol. They show as thin bright white-gold lines that flash and go dark as the card turns, brightest near the lamp.
  TCG Live's etch is that engraving (pitch about 5.6 px at 733 px wide).
- Gold border: bright satin gold, the ridges across it, white-gold at the lamp. Not a rainbow.
- Rainbow is a narrow beam: a few thin vertical lines flat under room light, one or two bands a tenth to a fifth of the card
  wide when tilted under a lamp, and not where the glare is. Between them the card is gold, white and its own colours.
- The Pokémon's body is matte on the six lighter cards (Live's foil map); on the dark Ancient Origins trio the foil runs through
  the dark art, so they carry the most light.

## What was built (every rule scoped to `fam-xy-secret-shiny`, specificity beats the era sheets)

- LINES = the Live etch turned inside out. `.foil` and `.cure` are masked `art, foil-map, linear-gradient(#000,#000), etch` with
  `intersect, intersect, exclude, add` (WebKit `source-in, source-in, xor, source-over`): scan x foil map x (1 - etch), so light
  lands in the grooves as thin lines at 30 to 40 percent duty. Painting through the etch's own alpha (first build) lit 60 to 70
  percent of the card and greyed it (LESSONS.md 1).
- `.foil` (screen): white-gold on the lines, faint and even at rest (a soft glow in the middle), a lamp patch round the pointer
  when held. On the Ancient Origins trio (class `xy-shiny`, `js/xy-foil.js`) `.foil` is `overlay` instead: Live's map holds
  their black ability bar, rule headings and bodies at 0.85-0.91, and screen lifted that ink milky (review 1, below). `.foil::before` / `::after` (lit) and `.cure::after` (lit): the lines at 0, 60 and 120 degrees, each with opacity
  `0.2 + 0.8 x |lamp offset . ridge normal|` (CSS `max(calc(x), calc(-x))`), so the lines across from the lamp flash and the rest
  go dark. Their masks are three SMOOTH direction-weight maps per card (`<id>-dir-a|b|c.webp`, 183 x 256, from the etch's
  structure tensor); the parent's line mask cuts them, so each shows exactly its own direction's lines.
- `.cure` (screen): a small white hot spot on the lines right under the pointer; `.cure::before`: the ONE rainbow beam (a seventh
  of the card wide, drawn twice for depth, on the lines only), mirrored to the far side of the pointer (centre `50% + (50% - pointer-x) x 0.7`,
  so the white lines never wash it out), one spectrum per sweep.
- `.glare` (multiply): the metal darkens away from the lamp, floor 84 percent on every channel, scan x foil map. No colour-dodge anywhere.

## Gates (WebKit 220 px x 3 unless noted; 2026-10-02)

foil_coverage on xy7 xy8 xy9 xy10 xy11: no output. dark_specks on all nine cards at rest, 30:25 and 50:78: 0 specks, 0 dark area.
foil_probe --idle on the lab (two pages) and on `/`: no running animations, task 0 ms on the lab. rainbow_speed.py: prints nothing,
exit 0 (it cannot read a stop-based beam; by hand: one 14 percent wide spectrum, travel 0.7 of the card, one cycle per sweep).
Census: 9 faces. Every url the module emits exists (27 own maps + 9 shared etches, 1.7 MB for the nine cards). Settings in a
script: no-shine 0.00 mean levels from "layers hidden", Classic untouched, foil strength 0.55 / 1 / 1.5 gives 7.8 / 12.9 / 13.4 (monotonic).

## Weak points

- The beam is cut to the lines and the foil map, so where it lands on a matte Pokémon (Gyarados, Gardevoir) it is not there:
  on those cards the pose decides whether any spectral colour shows.
- Restrained by design: the real clips (Kyogre, Groudon) show a livelier flare than one narrow beam. `--xyss-beam` (alpha, width) is
  the knob.
- The texture is Live's etch; at card sizes under about 100 CSS px the lines average out to a faint veil. With screen, the dark
  trio showed grey beat bands on their black bodies at 110 px and below (review 1); overlay keeps those bodies black, and the
  six lighter cards can still show faint bands on dark areas at thumbnail size (same as the other Live-etch families).

## Review 1 (2026-10-02): the dark trio went milky

A fresh-eyes review passed the six lighter cards and held Primal Kyogre-EX, Primal Groudon-EX and M Rayquaza-EX: screening the
white-gold rest glow and the lamp patch through Live's map, which holds their dark bars and bodies at 0.85-0.91, dropped the
ability bar's text contrast from 9.1-10.2:1 to 3.2-3.9:1 and turned the black bodies grey (black pixels 20-25% to 2-8%); the
real cards keep the black black and light only the lines. Fix: `mix-blend-mode: overlay` on the trio's `.foil` (one rule, by the
`xy-shiny` class); `.cure` stays screen. After it: bar contrast 10.1-10.9:1 at rest, 30:25, 75:65 and 50:78, rule headings
11.5-15.5:1, bodies 4-30% black pixels by pose (bare 17-25%), the lines still light on the dark art and the gold border; dark_specks
0, foil_coverage silent, 110 and 340 px checked. Also `--xyss-lift` is now `--foil-strength` itself (was `max(1, ...)`, which
ignored "subtle"). Open (taste): the beam is quiet on the six lighter cards; a second thin beam would match the eBay Rayquaza photo.

## Changing it

Edit the CSS (no template); keep one copy of each rule and brace balance. A changed ridge map gets a new `-vN` name (`make_dir_maps.py --suffix`).
Bump `css/holo/fam/xy-secret-shiny.css?v=` in index.html and the family's number in `js/holo-fam.js` with every change.
