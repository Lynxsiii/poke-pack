# Family sm-prism: Sun & Moon Prism Star cards

Module `js/fam/sm-prism.js`, sheet `css/holo/fam/sm-prism.css`. Claims exactly the faces `smPattern()` files as
`foil-holo sm-prism` ("Rare Prism Star"): 27 faces in the census of 2026-11-23 (16 Pokémon, 9 Trainers, 2 Energy;
sm5-sm9, sm75). All were unclaimed before. Every rule needs `.has-foil-map` (all 27 have Live's map).

## Real finish (audit w2-sm-prism; photos in /home/user/holo-refs/w2-sm-prism, SOURCES.md there)

- Foil = Live's map: black outer frame, window minus the Pokémon, bevels, rules strip, diamond minus its star,
  triangle, the ◇ by the name. Card body, text box, Pokémon matte.
- The black frame is foil under black ink (sun-moon-gx.md said matte: wrong): black most of the time, faint
  dark-rainbow streaks when lit (Celebi in hand, Solgaleo flat, Jirachi JP scan).
- Window: diagonal streak foil rising right (~40 deg) in broad soft bands; dark ink stays dark, pale art goes bright
  silver (Victini clouds), saturated Trainer art keeps its colour (Heat Factory).
- Strip: silver mirror with separate colour bars (blue, green, magenta, orange), white between, text black (Ditto).
- Diamond: smooth mirror, dark grey-violet off-angle, flashing silver-white with broad pastel bars near the light
  (Celebi, Diancie, Arceus, Victini).

## What the sheet does (2026-11-23)

No colour-dodge, no hard-light. Region split by the map rows, measured on all 27 maps (strip edges `--pp-top` /
`--pp-bot`: Pokémon 41 / 50.5%, Trainer 44 / 52.5%, Energy 54.5 / 61.5%).

- `.foil` (multiply group, art x map, visible at rest): white down to the strip's foot, then the diamond as a dark
  mirror: white at the pointer, grey-violet away from it.
- `.foil::before`: the strip's colour bars (repeating, irregular), faded to white away from the pointer.
- `.glare` (overlay group, art x map): above the strip, irregular rainbow bands times soft 2.4 px diagonal lines,
  faded to neutral grey away from the pointer (window: rainbow streaks with dark ink kept dark; frame: faint dark
  streaks). `.glare::after`: below the strip, broad silver-white and pastel bars (diamond flash, faint on the frame).
- Patterns are repeating gradients on a 200% tile positioned inside 0-100% (foil_coverage: no wrap seams).
- A pseudo-element paints inside its parent's blend group and its parent's clip and mask; gradient masks composited
  with the map are dropped by WebKit, so fades are cover gradients in the blend's no-op colour.

## Left

- The window lift on bright yellow art (Celebi) is modest: overlay cannot turn yellow ink blue. Photos show more
  colour there at a steep angle; a stronger recipe would need a blend that recolours pale ink without lifting black.
- `css/holo/sm-gx.css` still holds the old Prism Star block and the "frame matte" comment; this sheet overrides it.
