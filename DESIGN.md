---
name: poke-pack.rip
description: A card shop after hours. The pack wall, the counter, the glass case and the binders are lit; everything else is the shop's dark back wall.
colors:
  wall: "#221e1a"
  wall-dark: "#161411"
  line: "#38322b"
  line-2: "#4d453c"
  ink: "#f1ebe0"
  ink-2: "#c4b9a8"
  muted: "#a39887"
  orange: "#ff6b2b"
  orange-hover: "#ff7c42"
  on-orange: "#1d0d04"
  paper: "#f2efe6"
  label: "#e9e5da"
  print: "#1a1714"
  print-2: "#5a544a"
  counter: "#463e36"
  felt: "#110e0b"
  mat: "#1c1e1f"
  thermal: "#f3f1ea"
  ok: "#5bc98a"
  bad: "#ff6b6b"
typography:
  family: '"Bricolage Grotesque", system-ui, sans-serif'
  signage:
    fontWeight: 800
    fontVariationSettings: '"opsz" 96, "wdth" 80'
    fontSize: "clamp(56px, 9vw, 92px)"
    lineHeight: 0.9
    letterSpacing: "-0.02em"
  page-title:
    fontWeight: 700
    fontVariationSettings: '"opsz" 48'
    fontSize: "clamp(30px, 4vw, 40px)"
    lineHeight: 1.05
  section-title:
    fontWeight: 700
    fontSize: "24px to 30px"
  body:
    fontWeight: 430
    fontSize: "15px to 16px"
    lineHeight: 1.45
  price-gun:
    family: '"Antonio", sans-serif'
    fontWeight: 700
    note: "price stickers and price tags only"
  receipt:
    family: '"Share Tech Mono", monospace'
    textTransform: uppercase
    note: "the pack receipt and nothing else"
rounded:
  control: "6px"
  sticker: "2px"
  card: "4.5% / 3.2% (the card's own printed corner)"
  mat: "18px"
  pill: "only the coin balance, avatar and small inert badges"
components:
  button-primary:
    backgroundColor: "{colors.orange}"
    textColor: "{colors.on-orange}"
    minHeight: "44px (52px for the rip action)"
    rounded: "{rounded.control}"
  button-secondary:
    backgroundColor: "transparent"
    border: "1px solid {colors.line-2}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
  picker-word:
    textColor: "{colors.ink-2}"
    selected: "ink text, 2px ink line under the word"
  price-sticker:
    backgroundColor: "{colors.orange}"
    textColor: "{colors.on-orange}"
    font: "{typography.price-gun}"
    note: "on packs and sealed product"
  price-tag:
    backgroundColor: "#f7f6f1"
    textColor: "#17130f"
    font: "{typography.price-gun}"
    note: "on singles: cards in the case, in the collection, in a slab"
---

# Design System: poke-pack.rip

## The idea

**The card shop after hours.** The lights are down except over the counter,
along the pack wall and inside the glass case. You walk up, pick a pack off the
wall or out of the open booster box, rip it on the playmat, and the till prints
you a receipt. Your cards go in your binder or the bulk box.

The interface is built from the real objects of that shop, not from generic web
parts. A price is a price-gun sticker, not gold text with a sparkle. The most
valuable cards stand in top-loaders in a lit case, not in a ranked text list. A
pack's total is a till receipt, not a row of pills. The parts of the old site
that already looked made by a person (the slabs, the binder pages, the wrapper
art, the scans, the foils, the Meowth coin) were all copies of real objects;
everything here follows that rule.

A warm near-black page with one orange accent is, on its own, a stock
"premium dark" look. What keeps this from being that is the light and the
materials: the pools of light over the counter and in the case, the laminate,
the felt, the paper labels and receipts. A screen that is only dark wall and
orange buttons has missed the brief.

**Discipline:** materials go only on things that are objects. Navigation,
buttons, tabs, inputs, settings, tables and plain text stay plain: ink on the
dark wall, hairlines, space. If the art were hidden, the page should still read
as a card shop, and the controls should still read as easy.

The reference mockups are in the Counter row of the redesign canvas
(Home, Pitch Black packs, pack opening, at 1440 and 390 wide).

## Where materials go

| Object | Where | How |
|---|---|---|
| The pack wall | Home, shop | Wrappers on shelves, a shelf-edge strip under each row holding paper labels (set name, code badge, price per pack) |
| The open booster box | Shop (wrapper choice) | The set's display box, lid folded back, the four wrappers standing in it; the chosen one lifts |
| The counter | Home and shop hero, opening | Warm laminate top under a pendant light pool, aluminium front edge |
| The glass case | Most valuable cards, chase cards, showcase | Dark felt, a warm strip light along the top, cards in top-loaders standing on a glass shelf, a white price tag on each |
| The playmat | Pack opening, casino tables | Charcoal neoprene with a stitched edge; cards are laid on it |
| The receipt | After a pack, after a box | Thermal paper, Share Tech Mono, uppercase, the pulls with values and the total |
| Shelf talker / rate card | Pull rates | A laminated card in an acrylic holder |
| Binders, slabs, coins, sleeves | Binder, grading, gear | The existing objects (css/binder/, css/slab.css, css/casino-coin.css); keep them |

Everything not in that table is the plain back wall.

## Colour

- **The wall** (`wall`, a warm near-black, not blue-black, not wrapper-tinted)
  is every page's ground. The nav and footer sit on `wall-dark`. No glow from
  the top of the page, no tint from the wrapper, no gradient washes.
- **Orange is the price gun.** Price stickers on packs and sealed product, and
  the one primary action per screen (rip, open another, buy). So the action
  carries the same mark as the price. Nothing else is orange.
- **Money** is shown with the Meowth house coin (`assets/coins/house-coin-sm.webp`)
  and a number in ink, or on a sticker or tag. No gold text, no sparkle glyph.
- **Ink is selection**: the current nav item, a chosen picker word, focus.
- **Green only means live or done, red only means a loss.** No status dots that
  are the same on every row.
- **Never violet, indigo or purple** in the interface. The art can be any colour.
- Light comes from a source you could point to (the pendant over the counter,
  the strip light in the case). No neon halos, no coloured box-shadow glows on
  controls.

## Type

- **Bricolage Grotesque** (self-hosted, `assets/fonts/`). At `opsz 96`,
  `wdth 80`, weight 800 it is the shop's signage: set names on set pages and the
  hit's name in the opening. At `opsz 12–14` it is the UI and body text.
- **Antonio 700** (self-hosted) prints price stickers and tags, nothing else.
- **Share Tech Mono** (self-hosted) prints the receipt, nothing else.
- Signage is the largest thing only on pages about a set or a pull. Utility
  pages (cart, settings, social, notes, account) get a page title of 30–40px.
- No tracked uppercase labels, except the receipt (a real thermal print).
- Figures use tabular numerals.

## Money

- One helper renders money: the coin image (aria-hidden) plus the number, with
  "coins" for screen readers. In plain-text places (toasts, `title`, document
  titles, `aria-label`) write "6 coins".
- Whole amounts drop `.00` (2,500, 6). Cents show only when they are not zero
  (0.22, 217.40).
- No ▲▼ percentages or sparklines in lists. A price history lives on the card's
  or product's own chart.

## Components

- **Header:** the mark and name, the nav as plain words (current one in ink
  with a 2px ink line under it), the balance (coin + number), a quiet "Claim
  100" outline button, the avatar. Nothing glows.
- **Tab bar (under 960px):** Home, Packs, Collection, Binder, More. Line icons,
  22–24px. Friends and the radio live in the header or More, never as floating
  corner bubbles.
- **Buttons:** primary orange (one per screen), secondary outline, otherwise an
  underlined text link. 44px minimum height. Hover changes colour, never size.
- **Pickers:** a row of words with a 2px ink line under the chosen one (sets,
  eras, account tabs, categories). Square segmented control for 2–4 filters.
  Never a row of same-shaped pills.
- **Inputs:** 44px, `wall-dark` fill, `line-2` border, ink on focus.
- **Section heads:** a title alone. Add one line under it only when it states a
  fact the player needs (odds, a count). No idiom titles, no explaining the
  section.
- **Lists and tables:** rows between hairlines. Cards always show their art as
  a thumbnail.
- **Empty states:** one sentence pointing at the next action, in the voice
  below, or better, show something real (a bot table to join, the next pack).
- **Dialogs:** `wall-dark` with a `line-2` border, 6px radius.
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
- No entrance animations on page content: no fade-up on scroll, no staggered
  reveals, no hover-grow. Progress bars draw at their value; they animate only
  when the value changes in front of the player (after a rip or a sale).
- The moments that move: the pack tear, the card flips, the hit, a coin toss,
  a pack lifting out of the display box. One per screen.
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
- No see-through white panels, no box around everything, no 2×2 or 3-up grids
  of icon feature cards, no KPI stat rows, no left-border accent cards.
- No new typefaces beyond the three above, no Google Fonts request at runtime;
  fonts live in `assets/fonts/`.
- No emoji or sparkle glyphs as icons.
- No materials on controls: no wood buttons, no tape, no handwriting fonts.
