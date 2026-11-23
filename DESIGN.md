---
name: poke-pack.rip
description: Night arcade. A night-blue game screen with round panels, one chunky yellow key to press, and a colour for each area of the site. The packs and cards stay the brightest things on screen.
colors:
  night: "#16142b"
  panel: "#221f3f"
  raised: "#2d2952"
  well: "#0f0d21"
  rail: "#121027"
  text: "#f3f0fc"
  text-2: "#c3bedf"
  muted: "#a19bc6"
  key: "#ffcf33"
  key-ledge: "#c48a00"
  on-key: "#2b1b00"
  warn: "#ff7d9f"
  area-packs: "#ffcf33"
  area-collection: "#4cc3ff"
  area-casino: "#ff5d8f"
  area-community: "#3fdc9a"
  area-you: "#a98bff"
typography:
  titles: '"Lilita One", sentence case, 22px and up, one weight'
  text: '"Rubik" 400 to 700, 15px to 16px, tabular figures for money and counts'
rounded:
  control: "12px to 14px"
  panel: "20px"
  rip-key: "24px"
  object: "the object's own corner (cards, slabs, coins)"
---

# Design System: poke-pack.rip

Since 2026-11-23. Tokens and the shared parts live in `css/look.css`, which
loads after every page sheet and before the holo sheets. `css/theme.css` and
the page sheets still hold layout; where they name old tokens (`--red`,
`--paper`, `--carbon`) look.css maps them onto this look, so `--red` is the
yellow key.

## The idea

A pocket game at night. The page is deep night blue, never black; text is a
soft off-white, never pure white. Groups that belong together sit on a round
panel raised by its fill alone: no hairline boxes, no cut corners. The one
thing to press on a screen is a chunky yellow key standing on a darker ledge
it sinks onto. Packs and cards bring the rest of the colour.

What made the old looks feel generated, and what this one avoids: pure black
with a single loud accent, condensed capitals on every heading, a hairline box
around every section, small grey text everywhere, and every block given the
same weight.

## Areas

Everything on the site belongs to one of five areas, and each has a colour.
The colour marks where you are, never decoration:

| Area | Colour | Pages |
|---|---|---|
| Packs | yellow | Home, Packs, All sets, Cart |
| Collection | blue | Collection, Binder, Grading, Sleeves & coins |
| Casino | pink | Casino, Coinflip, Jackpot, Upgrader, Pack battles |
| Community | green | Social, Rankings, Trades, Friends, Discord |
| You | purple | Account, Settings, Radio, Updates |

The colour shows on the area's square in the menu, a menu link's icon, the
active tab's icon, and small figures inside the area (open tables in the
casino, a collection meter). `body[data-area]` (set by `js/app.js`) gives the
page `--area`.

## Navigation

- Phones: a floating tab bar (Home, Packs, the raised yellow Rip key,
  Collection, Casino). Your picture at the top left opens the menu: every
  other page, grouped under its area's name.
- Computers: a side menu down the left. Home, Search, then each area's name
  with its pages listed under it. Your coins, Claim and you sit in a slim bar
  across the top of the page. The menu stays open (`keepRailOpen()`).

## Type

- Lilita One for titles: page titles, section heads, the set on show, game
  names, the Rip key. Sentence case, one weight, never under 22px.
- Rubik for everything else, including buttons (600) and money (600,
  tabular figures).
- No capitals-only text anywhere except the slab's printed label.

## Shape and depth

- Panels 20px round, controls 12px to 14px, the Rip key 24px. Cards, slabs
  and coins keep their own corners.
- Depth comes from fill steps (well, night, panel, raised) and the key's
  ledge. Shadows only under floating things (the tab bar, menus, dialogs).
- The chosen option in a segmented control is a raised key in a sunken well.

## Money

The coin is `assets/coins/pp-coin-v1.svg`, a gold coin with a four-point
sparkle, drawn to read at 14px. The casino's house coin uses the same sparkle
struck in relief (`assets/casino/house-coin-v2.webp`). Amounts are the coin
then Rubik 600 figures.

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
- The moments that move: the pack tear, the card flips, the hit (line, slam,
  burst, band sweep, rolling value), a coin toss, a pack lifting out of the
  display box. One per screen.
- Endless loops are paused by `js/fx.js` when idle (`.fx-held`) and off screen
  (`.fx-paused`).
- Everything decorative switches off under `prefers-reduced-motion` and
  `body.no-motion`; hit flashes also under `body.no-flash`.

## Light and feedback

Since 2026-11-23 (`css/wow.css`, `js/wow.js`; loaded after `css/look.css`).
These are the only lit and reacting things; add to them sparingly.

- The pack on show on Home stands in a light sampled from its own wrapper
  (`--stage-light`, aimed by `--spot-x`). It floats 5px, a glint crosses it
  clipped to the wrapper's outline, and it leans to the mouse on a computer.
  The light is the wrapper's colour, never an area colour or a stock glow.
- The purse: when the balance changes in front of the player the coin flips
  (gains only), the figure rolls to the new amount and the change shows under
  it as plain figures for a moment.
- A band of light crosses the Rip keys (Home, the set page, the tab bar) every
  few seconds. No other button gets one.
- Changing page fades the new page in over 0.2s (opacity only). This is the
  one exception to "no entrance animations"; nothing fades or slides in on
  scroll.
- The ground carries a few static CSS stars. They never move.
- A casino game tile lifts the object drawn on it when hovered or pressed; the
  tile itself does not grow.

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
- No pure black grounds, no pure white text, no neon glows or coloured
  box-shadow halos. A soft area tint on one featured tile is the most.
- No box around everything: a panel only where a group belongs together.
- No walls of small tags or pills; a figure or a word does the job.
- An area colour is never used for a different area's page.
- No typefaces beyond Lilita One and Rubik (and the slab label's own face),
  no Google Fonts request at runtime; fonts live in `assets/fonts/`.
- No emoji as icons.
