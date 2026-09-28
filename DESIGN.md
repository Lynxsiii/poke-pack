---
name: poke-pack.rip
description: A card shop's pack wall at night. The wrapper you're looking at lights the room.
colors:
  black: "#08080b"
  bg: "color-mix(in oklab, #08080b 90%, rgb(var(--ambient)))"
  surface: "rgba(255, 255, 255, .045)"
  surface-2: "rgba(255, 255, 255, .075)"
  surface-3: "rgba(255, 255, 255, .11)"
  well: "rgba(0, 0, 0, .32)"
  line: "rgba(255, 255, 255, .07)"
  line-2: "rgba(255, 255, 255, .14)"
  ink: "#f3f1ec"
  ink-2: "#cfcdc7"
  muted: "#918f97"
  faint: "#5f5e66"
  rip: "#ff5a3c"
  rip-hover: "#ff7a60"
  gold: "#f2c14e"
  gold-2: "#f8d47a"
  ok: "#56d38a"
  bad: "#ff6b6b"
typography:
  family: '"Bricolage Grotesque", system-ui, sans-serif'
  set-name:
    fontWeight: 800
    fontVariationSettings: '"opsz" 96'
    fontSize: "clamp(56px, 15vw, 128px)"
    lineHeight: 0.88
    letterSpacing: "-0.045em"
  page-title:
    fontWeight: 800
    fontVariationSettings: '"opsz" 96'
    fontSize: "clamp(38px, 5vw, 60px)"
    lineHeight: 0.95
    letterSpacing: "-0.035em"
  section-title:
    fontWeight: 700
    fontSize: "24px"
    letterSpacing: "-0.02em"
  body:
    fontWeight: 430
    fontSize: "15px"
    lineHeight: 1.5
  caption:
    fontWeight: 500
    fontSize: "13px"
    color: "{colors.muted}"
  figure:
    fontWeight: 600
    fontVariantNumeric: "tabular-nums"
rounded:
  control: "8px"
  surface: "14px"
  stage: "22px"
  pill: "999px"
components:
  button-primary:
    backgroundColor: "{colors.rip}"
    textColor: "#1c0904"
    minHeight: "44px"
    rounded: "{rounded.control}"
  button-secondary:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
  chip:
    backgroundColor: "{colors.surface-2}"
    rounded: "{rounded.pill}"
    selected: "ink fill, black text"
  segmented:
    track: "{colors.well}"
    selected: "{colors.surface-3}"
    rounded: "{rounded.pill}"
  panel:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.line}"
    rounded: "{rounded.surface}"
  object:
    backgroundColor: "{colors.well}"
    rounded: "{rounded.surface}"
    note: "binder pages, stages, the price chart: things that are real objects sit in a well"
---

# Design System: poke-pack.rip

## The idea

**The pack wall.** A card shop at night: the wall of boosters is the only thing
lit, and the wrapper you are looking at colours the room. Every page mixes the
featured set's colour (`--ambient`, sampled from the wrapper by `js/fx.js`)
into a near-black page and glows from the top edge. Pitch Black makes the site
wine-dark; 30th Celebration makes it gold; Surging Sparks makes it electric.
The art does the colouring, so the interface itself stays uncoloured: ink,
hairlines, space.

One typeface does everything. Bricolage Grotesque, a variable font with an
optical-size axis, is quirky and hand-cut at 96 opsz (the giant set names read
like shop signage) and plain at text sizes. Figures use its tabular numerals.
There is no second face, no monospace, no tracked uppercase.

On a phone the sections live in a bottom tab bar under the thumb. The header
keeps only the mark, coins, the daily claim and the avatar.

Tokens live in `css/theme.css`, which loads after `css/app.css` and restyles
its controls and surfaces. Each page has its own sheet in `css/pages/`, loaded
after the theme. The holo sheets (`css/holo/*`), the tear (`css/tear.css`,
`js/tear.js`) and the card faces are separate systems and are not restyled here.

## Colour rules

- **The wrapper is the palette.** `body { --bg }` is computed from `--ambient`;
  `body::before` paints the glow. Page sheets never set their own page colour.
  Surfaces are translucent white so the tint shows through them.
- **Coral is the one action.** Rip, buy, open, claim-from-badges, send. One per
  screen, coral fill. Everything else is a secondary (`surface-2` fill) or a
  text link.
- **Gold is money.** Coins, prices, values, the daily claim. Nowhere else.
- **Ink is selection.** The active tab, a chosen chip, a switch that is on, the
  focus ring.
- **Green only means live**, red only means a loss.
- Hover changes fill, never position; only objects (packs, cards) move.

## Typography

- Set names are the largest thing on any page that has one: weight 800,
  `font-variation-settings: "opsz" 96`, tight tracking, line-height under 0.9.
  Let them wrap to two lines on a phone rather than shrinking them.
- Page titles 38–60px, section titles 24px, body 15px at weight 430 (the
  regular weight reads thin on dark), captions 13px muted.
- Captions and eyebrows are sentence case in the body face. Do not add
  uppercase, letter-spacing, or a monospace anywhere.
- Meta lines join with a space or a line break, not a middle dot, when they are
  headings or captions; card data lines ("029/150 · Common") keep the dot.
- Links are underlined words, not words with an arrow after them.

## Shape and depth

- Three radii with jobs: 8px controls, 14px surfaces, 22px stages (the featured
  pack, dialogs). Chips, segmented controls, the coins pill and the tab bar's
  menu are pills.
- Panels are flat and translucent. Shadows belong to objects and floating
  menus only. A real object (a binder page, a stage, the price chart) sits in a
  `well`, a shade darker than the page, so it reads as a thing on the table.
- Don't box everything. A section is a title, one line under it, and content
  on the open page. Use a panel only when the content is a self-contained
  object or list.

## Components

- **Header:** mark and wordmark, the nav as plain words with an ink dot under
  the current one, coins pill, gold claim, avatar chip.
- **Tab bar (under 720px):** Home, Packs, Collection, Binder, More. Line icons,
  24px, stroke 1.75. Anything with `.nav-btn[data-view]` is painted active by
  `paintNav`.
- **Buttons:** primary coral, secondary `surface-2`, both 44px tall on phones.
- **Segmented controls:** a sunk pill track (`well`) with a raised pill.
- **Chips:** `surface-2` pills; chosen is ink on black. Chip rows scroll
  sideways on a phone with `scroll-snap`, never wrap into a wall.
- **Inputs:** 44px, `surface` fill, hairline, brighter on focus.
- **Stages** (the featured pack, the shop hero): edge to edge on a phone
  (`.bleed`), 22px radius on larger screens, the pack art with a real drop
  shadow, a masked glint that moves by transform.

## Motion

- Only transform, opacity and filter animate. No infinite `background-position`
  or `background-clip: text` loops, no animation inside an element that has a
  `filter`, no `backdrop-filter` on a large layer over moving content.
- Endless loops are paused by `js/fx.js` when idle (`.fx-held`) and off screen
  (`.fx-paused`); new loops get that for free.
- One orchestrated moment per page (the set changing colour, a pack rising into
  the stage), not an entrance on every card.
- Everything decorative switches off under `prefers-reduced-motion` and
  `body.no-motion`; hit flashes also under `body.no-flash`.

## Performance rules that hold everywhere

- Collection and set grids render only the cards near the viewport
  (`windowFaces()`), and foil layers paint only while a card is tilted.
- Never put an outline or box-shadow on `.tcg` itself; anything around a card
  follows the art's alpha.
- Changed card art needs a new filename; `/assets/*` is cached for a year.

## Don'ts

- No page colour of its own, no coloured panels, no gradients as decoration.
- No uppercase labels, no monospace, no numbered markers on things that are not
  a sequence.
- No new typefaces. No Google Fonts request; fonts are in `assets/fonts/`.
- No restyling of card faces, foils (`css/holo/`), or the tear.
