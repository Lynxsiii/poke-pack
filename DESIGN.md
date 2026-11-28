---
name: poke-pack.rip
description: Rotom menu. A modern Pokémon game menu in cyan, white and black. A pale dotted ground, thick ink lines, slanted plates for the things you press, one yellow key, progress as an HP bar. The pack or card is the biggest thing on every screen.
colors:
  ink: "#14171b"
  ink-2: "#566069"
  ink-3: "#6f7a83"
  ground: "#eef2f3"
  box: "#ffffff"
  rule: "#d9e0e3"
  rule-2: "#b4bec4"
  cyan: "#00b4c8"
  cyan-2: "#008fa6"
  cyan-wash: "#d3f1f5"
  yellow: "#ffd21f"
  hp-green: "#35d15a"
  red: "#f5333f"
typography:
  titles: '"Kanit" italic 800 (the --font-xc family "Kanit Title"), sentence case, tight tracking'
  labels: '"Kanit" 600 and 700 (--font-h): names, figures, keys, tabs'
  text: '"M PLUS 1p" 500, 700, 800 (--font), 14px to 16px'
rounded:
  box: "0 (--r)"
  key: "0, on a 14 degree slant"
  tag: "0 (--r-tag)"
  object: "the object's own corner (cards, slabs, coins, faces)"
---

# Design System: poke-pack.rip

Since 2026-11-25. Noah picked the "F1, Rotom menu" mockup after rejecting the
night-blue look as generated. Tokens and the shared parts live in
`css/rotom.css`, which loads after every page sheet and before the holo
sheets. `js/rotom.js` runs the page-change motion and the purse. Older sheets
name old tokens (`--red`, `--paper`, `--carbon`, `--graphite`); rotom.css maps
them onto this look, so `--red` is the yellow key and `--paper` is ink.

## House style (2026-11-28)

A friend of Noah's called the site "AI slop" and said it was easy to tell. The
audit that followed found that the work was real and the wrapping was generic:
one recipe stamped on every screen. These rules exist so it does not drift
back. They win over anything older in this file. Before shipping a screen,
read it against this list.

**Shape**

- Corners are square. `--r`, `--r-sm`, `--r-lg` and `--r-tag` are all 0 and
  every box, key, tag, field and bar uses them; never write a pixel radius.
  Noah: "all the round edges" read as generated. Round is kept for things that
  are round or round-cornered in the hand: a card, a coin, a slab, a binder, a
  player's face, a Poké Ball pip.
- A box (the ink line around a group) is for a real object or a form. A list
  is rows with a divider. A page is not a stack of boxes, and two boxes next
  to each other must not be the same box with different words.
- The slab and the ground art are the theme's, not decoration to repeat: a
  page may move or drop its slab when it has a hero of its own.

**Type**

- The heavy italic (`--font-xc`) is the page title and the one main key.
  Tabs, labels, tags and small notes are upright (`--font-h` 600 or 700).
  If everything is italic 800 nothing is.
- Reading text is M PLUS 1p, the square-ended sibling of the rounded face the
  site used before. Do not bring a rounded face back.
- No small tag above a heading unless it adds a fact the heading lacks (a
  date, "New", "Beta"). "Continue" above "Welcome back" adds nothing.
- At most one row of word tabs above a title.

**Words**

- No sentence under a title that says what the page is. "Wishlist" does not
  need "Cards you want, and where to find them."
- Rules of a game go on that game's page, once, as plain steps. A menu of
  games lists names and what is happening there now (open tables, the pot),
  not a tagline each.
- Do not write lines to a rhythm. Three clipped beats joined by commas, on
  four cards in a row, is the giveaway. Say the fact; let lines be uneven.
- A notice (free play, not affiliated) appears once per page at most.
- Write it the way you'd say it across the counter at a card shop.

**Furniture**

- Nothing starts by itself over the page: no tour, no welcome card, no
  what's-new sheet. A new visitor's first screen is the pack and one key.
- The menu arrow (`.rt-go`) is on one key per screen, never on rows or cards.
- An empty place shows the thing itself, empty (a shelf, a binder page, two
  seats at a table), not a dashed box with an icon, a sentence and a button.
- No four-point sparkle anywhere: it is the mark AI products use for
  themselves. The coin's face is a booster pack (`pp-coin-v2.svg`).
- Icons are drawn for this site in the logo's thick line. No stock icon set.
- Text never overlaps or runs under the tab bar, and a row of tabs that
  scrolls shows that it does.

## The idea

The menu of a modern Pokémon game. The page is a pale grey-blue ground with a
faint dot grid. One cyan slab leans across it. Everything is drawn with one
thick ink line (2.5px). The pack or the card is the biggest thing on the
screen and everything else is quiet around it.

Two kinds of thing, told apart by shape:

- **Things you press are slanted.** Keys, tabs, the purse, the Rip key, the
  wrapper slots and the page you are on in the menu all lean 14 degrees.
- **Things that hold information are straight.** Square boxes with the ink
  line, only where the house style allows a box: a set's progress, a form.

One yellow (`--yel`): the key that moves you forward on this screen, the
cursor's edge on the chosen thing, the name plate of a hit. Never decoration.
Cyan is the slab and the active icon; it is not a button colour. Red is the
"New" tag and warnings. Green is HP.

What made the old looks feel generated, and what this one avoids: dark
navy/purple gradients, a different colour per area, glows and soft shadows,
hard-shadow lettering, rays, a rounded panel around every group, small grey
text everywhere, pills.

## Tokens (css/rotom.css)

Use the look's own names in new code: `--k` ink, `--k-2`, `--k-3` quieter
text, `--bg` ground, `--box` white box, `--box-2` a cell inside a box,
`--rule` thin divider, `--rule-2` dashed empties, `--cy`, `--cy-2` (cyan on
white: icons, links), `--cy-3` wash, `--yel`, `--yel-2`, `--hp`, `--hp-mid`,
`--hp-low`, `--line-w` 2.5px, `--skew` -14deg, `--unskew` 14deg, `--drop` and
`--drop-sm` hard shadows, `--dots`, `--font-h` Kanit, `--font-xc` the title
face, `--font` M PLUS, `--ease-out`, `--ease-pop`, and the rarity colours
`--ty-*`.

`.rt-dark` on a container turns the tokens to the ink ground (white text,
dark boxes). The pack opening and other full-screen stages use it.

## Themes (Settings, Look)

The player picks two things, and both are saved with their settings
(`theme` and `palette` in `js/state.js`): light, dark or device, and a colour
theme. Light Rotom is the default. `js/app.js applyTheme()` puts
`data-theme="dark"` and `data-palette="<id>"` on `<html>`; an inline script in
`index.html` does the same from `localStorage["pp-look"]` before first paint.

- **Dark** (`html[data-theme="dark"]` in `css/rotom.css`): ink and paper trade
  places. The ground and boxes go to ink, `--k` (text, lines, plates) goes
  light, so an "ink plate" is a light plate with ink text. The slab deepens
  (`--slab`). Yellow, cyan and green keep ink lettering.
- **Colour themes** (`css/themes.css`, listed in `js/themes.js`): Rocket (the
  default since 2026-11-28, Noah's pick), Rotom, Haunt, Emerald, Magma, Gold
  star, Prism, Sunset, Dot matrix, Surf, Volt, Rival, Berry. Noah found the
  first set (a hue shift of the slab) "lame", so a theme now repaints the
  whole look: ground, boxes, lines, slab, key, the hard shadow's colour, the
  pattern on the ground (`--dots`, `--dots-size`) and slanted bands or a foil
  sheet fixed behind the page (`--ground-art`, drawn by `html::before`).
  Shapes, type, layout and motion never change. Every theme but Rotom is
  light or dark by itself (`mode` in `js/themes.js`); it puts
  `data-theme="dark"` or `"light"` on `<html>` itself, so dark-only rules
  keep working, and the Light/Dark setting only moves Rotom. They are
  generated: edit `scripts/build_themes.mjs`, run it, bump `themes.css?v=`.
  Keep bright thin lines of the ground art at the screen's edges (past 90%),
  never where text runs, and keep slabs mid-tone so words that cross them read.
- **Locking**: each theme in `js/themes.js` has `locked`. A locked theme shows
  a lock on its tile and can't be chosen unless `canUseTheme()` is given its
  id as unlocked. Nothing is locked and nothing sells them yet.
- The dark stages (`.rt-dark`: pack opening, battle table) look the same in
  every theme. Under dark, the opening's card panel and end page follow the
  dark page.

Rules for new CSS so every theme keeps working:

| You want | Write | Never |
|---|---|---|
| Text or marks on an ink plate (`background: var(--k)`) | `var(--on-k)` | `#fff` |
| Text on yellow, green, cyan or art | `var(--k0)` | `var(--k)` |
| White that stays white (on red, on a photo) | `var(--w0)` | |
| Yellow lettering on an ink plate | `var(--yel-k)` | `var(--yel)` |
| A white surface | `var(--box)` | `#fff` |
| A see-through white fill | `rgb(var(--box-rgb) / 0.5)` | `rgb(255 255 255 / 0.5)` |
| The slab's fill | `var(--slab)` | `var(--cy)` as a large fill |

A new theme: add it to `scripts/build_themes.mjs` and run it, add it to
`THEMES` in `js/themes.js` with its `mode` and ground colour, and check Home, a set page, Collection, the casino and Settings in
both modes at phone size.

## Parts (css/rotom.css)

| Part | Class | Notes |
|---|---|---|
| Yellow key | `.solid`, `.buy` | The plate is `::before` (slanted, ink line, 6px ledge); the label stays upright. One per screen. |
| White key | `.ghost` | Every other key. |
| Small key | `.solid.sm`, `.ghost.sm` | Straight, 38px. |
| Main key with the cursor | add `.rt-go` | Draws the menu arrow at the left; the arrow nudges. The page's one main action only. |
| Box | `.plate`, `.rt-box` | White, ink line, square. |
| Row | `.rt-row` with `.rt-row-lab`, `.rt-row-name` (+ `small`), `.rt-row-val` | A list entry: ink label cut on the slant, name, value. |
| HP bar | `.bar > i`, `.meter > i`, or `.rt-hp` with `<em>` label and `.rt-track > i` | Ink track, green fill. Every progress meter on the site. |
| Word tab | `.rt-word` (`.on` / `aria-pressed` / `aria-selected`) | Italic word; the chosen one stands on an ink plate. Segmented controls (`.seg-btn`, `.seg-key`) look the same. |
| Red tag | `.rt-tag` | "New", a date. |
| Type badge | `.rt-type[data-ty]` | A rarity, coloured like a Pokémon type: common, uncommon, rare, holo, double, ultra, illus, sir, hyper, promo, secret. |
| Poké Ball pip | `.rt-ball` (`.e` empty, `.now` current) | Steps of a count: card 3 of 11, round 2 of 5. |
| Empty place | `.rt-empty` | Dashed line, half-white; a missing card shows a hollow ball. |
| Hard shadow | `.rt-drop` | `filter: drop-shadow(var(--drop))` for wrappers, boxes, slabs. Never on `.tcg`. |
| Purse | `.balance` | Coins on a slanted ink plate. |

A slanted thing whose content must stay upright: slant the plate with a
pseudo-element, or slant the element and counter-slant its one child
(`transform: skewX(var(--unskew))`).

## Navigation

- Phones: a white tab bar with an ink line across its top (Home, Packs, the
  raised ink Rip key, Collection, Casino). The active tab is ink with a cyan
  icon. Your picture at the top left opens the menu sheet: every other page,
  grouped.
- Computers: a white side menu with an ink line down its right edge. Home,
  Search, then each group's name with its pages under it. The page you are on
  stands on a slanted ink plate with a yellow edge. Coins, Claim and you sit
  at the top right of the page. The menu stays open (`keepRailOpen()`).
- The groups have no colours. `body[data-area]` and `body[data-view]` (set by
  `js/app.js`) exist for layout only.

## Type

- Titles (page title, set name, section heads, keys, tabs): Kanit italic 800,
  sentence case, letter-spacing -0.025em at large sizes. The page title is the
  largest text on the page: 36px to 54px on a phone, up to 92px on a
  computer's Home.
- Names, figures and money: Kanit 600 or 700, upright, `tabular-nums`.
- Reading text: M PLUS 1p 500; labels and small meta 700.
- Figures in Kanit are always one width: "Kanit Tab" (digits cut from Kanit and
  re-spaced, `assets/fonts/kanit-tab-*`) sits in front of Kanit in `--font-h`,
  so amounts that roll or sit in columns never jitter. Titles (`--font-xc`)
  keep Kanit's own figures.
- No capitals-only text anywhere except the slab's printed label.
- No hard shadows, outlines or gradients on lettering.
- Fonts are subset to Latin and self-hosted in `assets/fonts/` with their OFL
  licence files beside them. No font request leaves the site.

## Shape and depth

- One line weight: 2.5px ink. Corners are square (see House style).
- Depth is the hard offset shadow (`--drop`) under real objects and floating
  sheets, and the 6px ledge under a key. No blur shadows, no glows, no
  gradients as surfaces.
- The slab is `body::after`: one per page, top right, behind the content.
  A page may add one more slab of its own behind its hero (Home's pack, the
  opening's stage). Text that crosses the slab must be ink or white.

## Money

The coin is `assets/coins/pp-coin-v2.svg` (a booster pack on its face; v1 had a four-point star). Amounts are the coin then Kanit 700
figures. The casino's house coin is `assets/casino/house-coin-v2.webp`.

## Copy

Talk like the person behind the counter: short, specific, with contractions
and hobby words (rip, pull, hit, chase, bulk, slab, binder).

- No section that explains itself, no reassurance filler. Say each thing once.
- No em dashes. Use a comma or a full stop.
- Meta lines join with a comma ("Mega Evolution, 148 cards, 11 per pack").
  The middle dot is kept only where the card itself prints one.
- Links are underlined words. No arrow after link or button text.
- Headings never end in a full stop. Lead with the fact.
- Odds, prices and counts are always the real numbers.

## Motion

Noah asked for more smooth animation throughout (2026-11-25). The site should
feel like a game menu: things slide in on the slant, plates snap to what you
choose, bars fill, figures roll.

- Only transform, opacity and filter animate. Never width, height, top, left,
  background-position, or anything on a large fixed layer.
- Changing page: `js/rotom.js` puts `body.rt-enter` on for about a second.
  The slab swings in, the page's top-level blocks rise in turn (14px, 0.42s,
  50ms apart), and HP bars fill from empty. A block that is pinned to the
  screen, or holds something pinned, carries `.rt-still`.
- The shell: once the page scrolls, the phone header and the computer's purse
  row gain a solid bar with an ink line (`body.rt-scrolled`); a marker
  (`.rt-tabmark`) slides along the tab bar to the section you are in; the menu
  sheet dims the page and deals its entries in; the purse bumps when the
  amount moves. A place that is loading is `.rt-skel`: a dashed box with a
  cyan band crossing it.
- Choosing: an ink plate grows under the chosen tab or menu item (0.2s). Rows
  nudge 4px toward the cursor on hover. Keys sink 3px onto their ledge.
- Arriving things (a sheet, a dialog, a toast, a new row) rise and settle in
  0.2s to 0.3s with `--ease-out`. A small overshoot (`--ease-pop`) is allowed
  on slanted plates and badges landing, nowhere else.
- Lists that load may stagger their first screen of rows (up to 8, 30ms
  apart). Never animate a whole long grid, and never on scroll.
- Figures that change in front of the player roll to the new value.
- The big moments keep their own choreography: the pack tear, the card
  flips, the hit, a coin toss, a battle reveal.
- Endless loops are small (the cursor arrow, a glint on the Rip key) and are
  paused by `js/fx.js` when idle (`.fx-held`) and off screen (`.fx-paused`).
- Everything decorative switches off under `prefers-reduced-motion` and
  `body.no-motion`; hit flashes also under `body.no-flash`.

## Performance rules that hold everywhere

- Collection and set grids render only the cards near the viewport
  (`windowFaces()`), and foil layers paint only while a card is tilted.
- Never put an outline or box-shadow on `.tcg` itself; anything around a card
  follows the art's alpha.
- No `backdrop-filter` on large layers. No animation inside a filtered
  element.
- Textures are CSS or small tiled images (under 100 KB).
- Changed art needs a new filename; `/assets/*` is cached for a year.

## Don'ts

- No restyling of card faces, foils (`css/holo/`, `js/*-foil.js`), the tear
  (`css/tear.css`, `js/tear.js`) or the slabs' printed labels.
- No dark page grounds outside `.rt-dark` stages, the dark theme and the dark
  colour themes. No glows, blur shadows or coloured halos; no gradients
  outside a theme's ground art (Prism's foil sheet).
- No second accent on a page: one slab colour and one key. Colour comes from
  the packs, the cards and the rarity badges. (A colour theme changes which
  slab colour that is; it never adds another.)
- No box around everything: a box only where a group belongs together.
- No walls of small tags or pills; pickers are slanted words or flat tiles.
- No typefaces beyond Kanit and M PLUS 1p (and the slab label's own
  face). No emoji as icons.
