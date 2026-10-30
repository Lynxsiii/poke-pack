---
name: poke-pack.rip
description: A black handheld with red controls. The page is black, panels are carbon with one hairline, red is what you press and the hit. The packs and cards bring all the colour.
colors:
  ground: "#0b0b0c"
  carbon: "#151517"
  graphite: "#1f1f23"
  line: "#303036"
  line-2: "#45454d"
  well: "#070708"
  paper: "#f3f1ec"
  ink-2: "#c9c7c2"
  smoke: "#a3a3ab"
  faint: "#8e8e96"
  red: "#e3132b"
  red-deep: "#8c0a19"
  red-text: "#ff4b5c"
  on-red: "#ffffff"
  label: "#e8e6e1"
  ok: "#5bc98a"
  gold: "#f2c14e"
typography:
  text:
    family: '"Sofia Sans", system-ui, sans-serif'
    fontWeight: "400 to 700"
    fontSize: "15px to 16px"
    lineHeight: 1.45
  figures:
    family: '"Sofia Sans Semi Condensed", sans-serif'
    fontWeight: 700
    fontVariantNumeric: tabular-nums
    note: "prices, balances, counts, the receipt, button labels (uppercase, 0.03em)"
  titles:
    family: '"Sofia Sans Extra Condensed", sans-serif'
    fontWeight: 800
    textTransform: uppercase
    letterSpacing: "0.005em"
    lineHeight: 0.9
    note: "page titles, section heads, the set on show, the hit; 24px and up only"
  signage:
    fontSize: "clamp(52px, 9vw, 88px)"
  page-title:
    fontSize: "clamp(38px, 4.4vw, 48px)"
  section-title:
    fontSize: "28px"
  hit-value:
    fontSize: "clamp(56px, 5vw, 72px), 46px on a phone"
rounded:
  control: "3px"
  surface: "3px"
  object: "4px, or the object's own corner (cards, slabs, coins)"
  round: "only the avatar, the coin and the raised Rip button"
components:
  button-primary:
    backgroundColor: "{colors.red}"
    textColor: "{colors.on-red}"
    ledge: "0 3px 0 {colors.red-deep}; pressed it sinks 3px onto the ledge and turns red-deep"
    minHeight: "44px (52px for the rip action)"
  button-secondary:
    backgroundColor: "transparent"
    border: "1px solid {colors.paper}"
    textColor: "{colors.paper}"
  claim:
    ready: "paper fill, black label"
    waiting: "transparent, line border, smoke label"
  segmented:
    track: "{colors.well}, 3px inset"
    selected: "paper fill, black label"
  picker-word:
    textColor: "{colors.smoke}"
    selected: "paper text, a 2px red bar under the word"
  price-label:
    backgroundColor: "{colors.paper}"
    textColor: "#0b0b0c"
    font: "{typography.figures}"
    note: "packs, sealed product and singles alike; square, level, no shadow"
  tab-bar:
    note: "under 960px: Home, Packs, the raised round red Rip button, Collection, Binder, More, on a floating carbon bar"
---

# Design System: poke-pack.rip

## The idea

**A black handheld with red controls.** The site is the console you rip packs
on: a black body, carbon panels, hard edges, and red buttons you press. Nothing
on it glows. The packs, the cards, the foils and the coins are the only colour
on the screen, so they always win.

The shop is still the floor plan: the counter the featured pack stands on, the
pack wall with paper labels, the open display box, the case of top-loaders and
the receipt after a pack. They are drawn flat now, in carbon and graphite, with
no light pools, laminate or felt.

**Discipline:** red marks two things only, what you press and the hit. A screen
that is red everywhere has lost the hit. If the art were hidden, the page should
still read as a set of plain, easy controls on a black device.

The reference is "Handheld, black and red" (look-handheld-dark.html), version 2
of the redesign mockups at https://claude.ai/artifact/R3J6bb3FWacwFNZ1f1GQqm,
which Noah picked on 2026-10-23.

## Colour

- **Ground** (`#0b0b0c`) is every page. **Carbon** is the header, panels,
  dialogs, the footer and the tab bar, each with one `line` hairline.
  **Graphite** is a raised thing inside a panel. **Well** is sunken: progress
  tracks, fields, an empty card slot.
- **Red is the press and the hit.** Primary buttons, the raised Rip button, the
  current tab's bar, the band behind a hit, a hit row on the receipt, the "New"
  mark. Never a page ground, a gradient or a glow. Red as words on black uses
  `red-text`. Labels on red are white (`on-red`): paper on red fails 4.5:1.
- **Paper** is text and the inverted fills: Claim when it's ready, the chosen
  segment, price labels.
- **Smoke** is secondary text and stays 4.5:1 or better on carbon and graphite.
- **Green only means up or live** (a price chart, a live dot). Gold only marks
  rarity and tiers.
- **Money** is the Meowth house coin (`assets/coins/house-coin-sm.webp`) and a
  Semi Condensed number in paper, or a paper price label. No gold text, no
  sparkle glyph.
- Never violet, indigo or purple in the interface. The art can be any colour.

## Type

- **Sofia Sans** in three widths, self-hosted in `assets/fonts/` (SIL OFL, see
  NOTICE.md), latin and latin-ext subsets.
- **Extra Condensed 800 capitals** are the titles: every page's title, section
  heads, the set on show (signage) and the hit's name and value. Only at 24px
  and up.
- **Semi Condensed 700** prints figures with tabular numerals (balances,
  prices, counts, the receipt) and button labels (uppercase, 0.03em).
- **Sofia Sans** is everything you read.
- No italics, no text shadows. Slab labels keep their own printed face
  (Bricolage, `css/slab.css`); that is part of the object.

## Shape and depth

- 3px corners on controls, surfaces and dialogs. Real objects keep their own
  corner (cards, slabs, coins, wrappers).
- Depth is a ledge, not a shadow: a red button sits on a 3px `red-deep` ledge
  and sinks onto it when pressed. No soft drop shadows on controls.
- No tilted stickers, no gradients on surfaces, no glass, no blur behind panels.

## Money

- One helper renders money: the coin image (aria-hidden) plus the number, with
  "coins" for screen readers. In plain-text places (toasts, `title`, document
  titles, `aria-label`) write "6 coins".
- Whole amounts drop `.00` (2,500, 6). Cents show only when they are not zero
  (0.22, 217.40).
- No ▲▼ percentages or sparklines in lists. A price history lives on the card's
  or product's own chart, a flat line over a flat tint.

## Components

- **Header:** carbon with one hairline. The mark and name, the sections as
  plain words (the current one in paper with a 2px red bar under it), the
  balance in Semi Condensed, Claim, the level and the avatar.
- **HUD (the header under 960px):** 64px. The trainer on the left (their face in
  a ring that fills red toward the next level, "Lv N" on a graphite tag under
  it, a red dot when level rewards wait); it opens the menu. Then the coins,
  Claim (a paper tile: a coin in a ring that fills back up over the hour, the
  word over the amount; a hairline outline while it counts down) and the Lite
  switch. The mark and name move onto Home's shelf.
- **Tab bar (under 960px):** a floating carbon bar of five keys: Home, Packs,
  the raised round red **Rip** button in the middle, Collection, Binder. Rip
  opens the set on show (a promo set opens the shop instead). Everything else,
  Search included, is in the menu the trainer opens. The current tab has a red
  bar on its top edge.
- **Home's shelf:** the newest sets' packs on a carbon shelf with a graphite
  lip, the middle one half as big again, the ones beside it turned toward it in
  the shade. Under it a black plank with the set's name on one line, then the
  price a pack, the wrapper and round wrapper buttons (a red ring on the chosen
  one).
- **Set page:** the set tabs (a small pack beside each name, the red bar under
  the set on show, All sets at the end), the set's logo with its era, date,
  size and the player's count under it, the wrappers in a row (the chosen one
  outlined in red and lifted 4px), then the Booster pack plate (price, wrapper
  line, the page's one red Rip button), the odds plate, the chase grid and the
  sealed grid (photos standing on the ground; name, contents, price, slim
  buttons). Two columns from 961px.
- **Collection:** Cards | Sealed, the set tabs (All sets opens the sets by
  era), COLLECTION over the set's name with Sort at the right (Semi Condensed
  capitals and an arrows mark), the count over a bar ticked every 10 cards,
  Worth and the spares sale as a text link, the five rarity groups, search
  and a Show select, then a slot for every card: carbon with the card, or a
  well with the card's number and name in a hairline frame; under each, the
  number and printed mark on the left and the value on the right. Copies sit
  on a graphite tag on the card's corner. Selling one card is in the card's
  details.
- **Buttons:** primary red on a ledge (one per screen), secondary a paper
  outline, otherwise an underlined text link (red underline, 3px offset). 44px
  minimum. Hover changes colour, never size.
- **Pickers:** a row of words with a red bar under the chosen one. Segmented
  control (well track, paper chosen segment) for 2 to 4 filters; the
  collection's five rarity groups are the one five-way, the paper key sliding
  to the chosen group. Never a row of same-shaped pills.
- **Inputs:** 44px, `well` fill, `line-2` border, 16px text.
- **Switches:** square, red when on, white key.
- **Panels and dialogs:** carbon, one `line` hairline, 3px.
- **Parts** (`css/theme.css`): a **plate** is a panel with its top-right
  corner cut (a 13px triangle of ground and the hairline across it) and a head
  of an Extra Condensed title with a smoke aside; a **ground heading** is the
  same title straight on the black; **rows** split by hairlines (a picture, two
  lines, a figure); the **odds** table (printed mark, rarity, "1 in N"); the
  **progress** figure over a sunken track ticked every 13th of the way, filled
  red; the graphite **In binder** tag; the **chase grid** (cards straight on
  the ground, three across on a phone, each with its name, value and In binder
  tag).
- **Section heads:** a title alone. Add one line under it only when it states a
  fact the player needs (odds, a count).
- **The hit:** the card lands on a full-width red band; a paper line sweeps
  across it once. The value sits above the name in Extra Condensed figures.
  Common pulls get no band.
- **Receipt:** a carbon panel of rows in Semi Condensed figures; a hit row is
  red with white text; the total is bold.
- **Badges** ("New", "Promo"): small, inert, rare. Never a row of them.

## Copy

Talk like the person behind the counter: short, specific, with contractions
and hobby words (rip, pull, hit, chase, bulk, slab, binder).

- No section that explains itself, no reassurance filler ("Changes save as you
  make them"). Say each thing once.
- No em dashes. Use a comma or a full stop.
- Meta lines join with a comma or a line break ("Mega Evolution, July 2026,
  130 cards"). The middle dot is kept only where the card itself prints one:
  card data lines like "116/084 · Special Illustration Rare".
- Links are underlined words. No arrow after link or button text.
- Headings never end in a full stop. No idiom headings ("On the hunt", "The
  long game"). No fragment pairs ("Real X. Real Y."), no punchy openers
  ("Kalos in chaos."). Lead with the fact.
- Odds, prices and counts are always the real numbers.

## Motion

- Only transform, opacity and filter animate.
- Presses sink onto their ledge and come back without overshoot. Nothing
  bounces.
- No entrance animations on page content: no fade-up on scroll, no staggered
  reveals, no hover-grow. Progress bars draw at their value; they animate only
  when the value changes in front of the player (after a rip or a sale).
- The moments that move: the pack tear, the card flips, the hit's band sweep,
  a coin toss, a pack lifting out of the display box. One per screen.
- Endless loops are paused by `js/fx.js` when idle (`.fx-held`) and off screen
  (`.fx-paused`).
- Everything decorative switches off under `prefers-reduced-motion` and
  `body.no-motion`; hit flashes also under `body.no-flash`.

## Performance rules that hold everywhere

- Collection and set grids render only the cards near the viewport
  (`windowFaces()`), and foil layers paint only while a card is tilted.
- Never put an outline or box-shadow on `.tcg` itself; anything around a card
  follows the art's alpha.
- Textures are small tiled images (under 100 KB) or CSS; never a large layer
  that repaints.
- Changed art needs a new filename; `/assets/*` is cached for a year.

## Don'ts

- No restyling of card faces, foils (`css/holo/`), the tear (`css/tear.css`,
  `js/tear.js`) or the slabs' printed labels.
- No red grounds, red gradients or red glows. No neon, no coloured
  box-shadow halos.
- No see-through panels, no box around everything, no 2×2 or 3-up grids of
  icon feature cards, no KPI stat rows, no left-border accent cards.
- No typefaces beyond Sofia Sans's three widths (and the slab label's own
  face), no Google Fonts request at runtime; fonts live in `assets/fonts/`.
- No emoji or sparkle glyphs as icons.
- No rounded pill buttons, no tilted stickers, no cartoon outlines.
