---
name: poke-pack.rip
description: A collector's ledger for opening virtual Pokémon TCG boosters.
colors:
  bg: "#0e0f11"
  surface: "#15171a"
  surface-2: "#1b1e22"
  surface-3: "#24272c"
  line: "rgba(255, 255, 255, .08)"
  line-2: "rgba(255, 255, 255, .15)"
  ink: "#edece8"
  ink-2: "#c9c9c4"
  muted: "#9d9fa6"
  faint: "#6c6f77"
  action-coral: "#ff6b4a"
  action-coral-hover: "#ff8466"
  coin-gold: "#e9b949"
  coin-gold-light: "#f3cf72"
  ok: "#5fcf8a"
typography:
  display:
    fontFamily: '"Archivo", system-ui, sans-serif'
    fontWeight: 700
    fontStretch: "108%"
    fontSize: "clamp(44px, 5.4vw, 80px)"
    lineHeight: 0.98
    letterSpacing: "-.035em"
  page-title:
    fontFamily: '"Archivo", system-ui, sans-serif'
    fontWeight: 700
    fontStretch: "108%"
    fontSize: "clamp(30px, 3.4vw, 44px)"
    letterSpacing: "-.025em"
  body:
    fontFamily: '"Archivo", system-ui, sans-serif'
    fontSize: "15px"
    lineHeight: 1.5
  figure:
    fontFamily: '"IBM Plex Mono", ui-monospace, monospace'
    fontVariantNumeric: "tabular-nums"
  label:
    fontFamily: '"IBM Plex Mono", ui-monospace, monospace'
    fontSize: "11px"
    fontWeight: 500
    letterSpacing: ".06em"
    textTransform: "uppercase"
rounded:
  control: "4px"
  surface: "6px"
components:
  button-primary:
    backgroundColor: "{colors.action-coral}"
    textColor: "#1a0f0b"
    rounded: "{rounded.control}"
  button-ghost:
    backgroundColor: "transparent"
    borderColor: "{colors.line-2}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
  chip-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.bg}"
  panel:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.line}"
    rounded: "{rounded.surface}"
---

# Design System: poke-pack.rip

## Overview

**North star: "The collector's ledger."** The interface is a quiet, dark
graphite table. The only saturated colour on screen should be the pack wrappers
and card scans; the UI around them is neutral, flat and precise, with numbers
set like entries in a price guide.

Tokens live in `css/theme.css`, which loads after `css/app.css` and before the
holo sheets. `app.css` reads the same tokens, so new rules should use them
rather than literal colours or radii.

## Colour rules

- **Neutral structure.** `bg` for the page, `surface` for panels, `surface-2`
  and `surface-3` for tiles inside panels and for hover/selected states.
  Separation comes from these steps and `line` hairlines, never gradients or glows.
- **Coral is the action.** Only the primary button of a screen (open, rip,
  buy, claim, send) is coral.
- **Gold is money.** Coins, prices, values and the daily claim. Gold never marks
  selection, focus, links or headings.
- **Ink is selection.** Active nav items, selected tabs, chips and switches, and
  the focus ring all use `ink`.
- **Green only means live.** The small dot on a live set.

## Typography

- **Archivo** (self-hosted variable font in `assets/fonts/`) for everything
  that is words. Headings use weight 700 at 108% width with negative tracking.
- **IBM Plex Mono** for figures (coins, prices, counts, odds, card numbers) with
  tabular numerals, and for the small uppercase labels (eyebrows, tags, set
  dates). There is one label style; don't invent new tracked-caps variants.
- Every view opens with the same page head: a page-title heading, one line of
  muted copy, then a hairline.

## Shape and depth

- Two radii only: `4px` for controls (buttons, inputs, chips, tabs) and `6px`
  for surfaces (panels, cards, tiles). Avatars and status dots stay round.
- Panels are flat: `surface` fill and a `line` border, no shadow. Shadows are
  reserved for real objects (pack wrappers, cards) and floating menus.
- Hover changes fill or border, not position. Only pack art moves.

## Components

- **Nav:** plain text links; the current page is ink with a 2px ink underline.
- **Buttons:** primary is coral fill; secondary is a ghost with a `line-2`
  border. Disabled ghosts keep their outline and dim the text.
- **Segmented controls and tab rows:** a `surface` track with a 2px inset; the
  selected segment is `surface-3` with ink text.
- **Filter chips and set pickers:** outlined; selected is solid ink with dark
  text.
- **Switches:** neutral track; on is an ink track with a dark thumb.
- **Featured stage:** a `surface` panel with a faint top light behind the pack,
  hairline rules above and below the art, and the set name, price and odds
  printed underneath.

## Don'ts

- Don't add gradients, glows, or coloured shadows to panels or buttons.
- Don't use gold for anything that isn't coins or value.
- Don't add new radii, pill shapes, or tracked-uppercase text in the body font.
- Don't restyle the card faces or foil; that work lives in `css/holo/` and the
  card section of `app.css` and is out of scope for the UI theme.
