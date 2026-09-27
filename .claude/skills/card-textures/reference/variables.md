# The pointer variables

Every foil on the site is a function of a handful of custom properties that
`js/card-motion.js` writes onto the held `.tcg` each frame. They are the same
names and ranges pokemon-cards-css uses, so upstream formulas port unchanged.

## What is written

`card-motion.js` runs three springs per card (pointer position, light, tilt)
and writes these each frame while a card is `.lit` (held) or `.settling`
(springing back after release). A resting card has none of them inline; it
falls back to the rest values declared on `.tcg` in `css/holo/base.css`.

| Variable | Range | Rest | Meaning |
|---|---|---|---|
| `--pointer-x`, `--pointer-y` | `0%`..`100%` | `50%` | Pointer on the card face. The light source. Use for radial glare centres. |
| `--pointer-from-left`, `--pointer-from-top` | `0`..`1` | `0.5` | The same, unitless, for `calc()` multipliers. |
| `--pointer-from-center` | `0`..`1` | `0` | Distance from the centre, 1 at the edges. The angle of incidence: real foil is darker head-on and flares at grazing angles, so brightness and opacity usually scale with it. |
| `--background-x` | `37%`..`63%` | `50%` | Pointer x squashed into a narrow band. Drives `background-position` of big (200-400%) gradients so they slide a little, not wildly. |
| `--background-y` | `33%`..`67%` | `50%` | The same for y. |
| `--card-opacity` | `0`..`1` | `0` | The light spring: 1 while held, eases to 0 after release. Multiply every shine and glare opacity by it. |
| `--rotate-x`, `--rotate-y` | about `-14deg`..`14deg` | `0deg` | Tilt. `rotate-x` is the Y-axis turn (left/right), `rotate-y` the X-axis turn. Upstream 151 drives gradient angles off `--rotate-x` so bars swing as the card turns. |
| `--card-scale` | `1`..`1.05` | `1` | Lift while held. |

The site also writes legacy names the Classic engine reads (`--mx`, `--my`,
`--px`, `--py`, `--hyp`, `--tilt-x`, `--tilt-y`). New foil work uses the
upstream names above.

Not written here but used upstream:

- `--rotate-delta`: upstream's popover spin (the 360° turn when a card is
  clicked open). The site has no popover spin; substitute `0deg`.
- `--seedx`, `--seedy`, `--cosmosbg`: a random per-card offset so two cards of
  the same rarity do not show the identical glitter or galaxy crop. Set them
  once per card if a recipe needs them (for example from the card number in
  `tcgFace()`), never per frame.
- `--mask`, `--foil`: upstream's per-card foil and etch maps. The site's
  equivalents are `--art` (the scan, used as an alpha mask), the window masks
  in `css/holo/windows.css`, and whatever per-card map a recipe adds (see
  [masks.md](masks.md)).

## The formulas upstream uses, and what they do

Read these as tools. Each one answers "how far and which way should this layer
move as the light moves".

```css
/* Slide a big gradient against the pointer, amplified. 2.6x and 3.5x are the
   SwSh regular holo's rainbow; bigger factors = faster colour change. */
background-position:
  calc(((50% - var(--background-x)) * 2.6) + 50%)
  calc(((50% - var(--background-y)) * 3.5) + 50%);

/* Follow the pointer, clamped to the middle 80% so a 400% gradient never
   shows its end. Cosmos, Poké Ball. */
background-position:
  calc(10% + (var(--pointer-from-left) * 80%))
  calc(10% + (var(--pointer-from-top) * 80%));

/* Opposite directions on two layers: the ::after copy runs negative, so the
   two ramps cross as the card turns. This crossing is the oil-slick shimmer. */
.foil        { background-position: var(--background-x) var(--background-y); }
.foil::after { background-position: calc(var(--background-x) * -1) calc(var(--background-y) * -1); }

/* Diagonal drift: x picks up some y, so a vertical pointer move still slides
   the bands sideways. Full arts. */
calc(var(--background-x) + (var(--background-y) * 0.2)) var(--background-y)

/* A few px of parallax between two glitter tiles, so sparkles twinkle
   instead of sliding. --shift is 1-3px. Secret and hyper rares. */
background-position:
  calc(50% - ((var(--shift) * 2) * var(--pointer-from-left)) + var(--shift))
  calc(50% - ((var(--shift) * 2) * var(--pointer-from-top)) + var(--shift));

/* Brightness that grows toward the edges: dark head-on, hot at grazing
   angles. The base (0.3-0.5) is the resting darkness; the factor is the flare. */
filter: brightness(calc((var(--pointer-from-center) * 0.4) + 0.4)) contrast(2) saturate(1.5);

/* Bars whose angle follows the tilt (151 regular holo, SIR, hyper rare). */
repeating-linear-gradient(calc((var(--rotate-x) - var(--rotate-delta, 0deg)) * 0.25), ...)

/* Opacity that fades in only once the light is well off-centre. */
opacity: calc((1.5 * var(--card-opacity)) - var(--pointer-from-center));
```

## Rest state

After PR 5 (`css/holo/base.css`), a card that is neither `.lit` nor
`.settling` renders only the `.foil` element's own background at
`0.16-0.18 * --foil-strength` opacity. Its `::before`, `::after` and the whole
`.glare` are `display: none`. So:

- Whatever a finish should look like in a binder (the pearl white of a
  Futuristic Rare, the gold of a hyper rare) has to come from `.foil`'s own
  `background-image` stack, evaluated at the rest values above.
- Do not rely on a pseudo layer to darken or tint the resting card; it is not
  there.
- Check the resting look separately. `lab.rest()` in the foil lab shows it.
