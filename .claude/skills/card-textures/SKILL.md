---
name: card-textures
description: Recreate a real Pokémon card's foil texture (holo, reverse, etched, glitter, stamps) in poke-pack's CSS to the standard of simeydotme's pokemon-cards-css. Use when adding or fixing a card finish or a rarity's holo, masking foil around something printed on the card (such as the 30th Celebration Pikachu stamp), or when the site's foils look fake next to the real card.
---

# Card textures

This skill is how to make a card on poke-pack.rip shine the way the physical
card does. The bar is Simon Goellner's
[pokemon-cards-css](https://github.com/simeydotme/pokemon-cards-css) and
[pokemon-cards-151](https://github.com/simeydotme/pokemon-cards-151): copies
of both are in `upstream/`, and the site's foil engine (`css/holo/`) is
already derived from the first.

## What makes a texture look real

In order of how much they matter:

1. **Where the foil is.** Real foil stops at the Pokémon, the text, the
   stamps. Upstream uses a per-card foil map for every card; the site uses
   whole-window rectangles, so its holo washes over the Pokémon and cuts
   through stamps. A perfect gradient on the wrong area still looks fake.
   Get the mask right first ([reference/masks.md](reference/masks.md)).
2. **The pattern.** Sun-pillar rainbow, light bars, glitter, cosmos, an
   etch that follows the painting. Each finish has one; name it from data
   and photos before touching CSS
   ([reference/finish-catalog.md](reference/finish-catalog.md)).
3. **How it moves.** Upstream layers run in opposite directions, bars
   swing with the tilt, brightness rises towards grazing angles. All of it
   comes from a few pointer variables
   ([reference/variables.md](reference/variables.md)).
4. **What the light does to the ink.** Blend modes decide whether the foil
   brightens colours, recolours them, or only shows in dark areas
   ([reference/blend-and-mask.md](reference/blend-and-mask.md)).

## The physical card, as CSS layers

A foil card is ink printed over a metallised foil sheet. Where the ink is
thin or has no white underlay, the foil shows through; its embossed pattern
diffracts light into colour that shifts as the card turns. Some cards add an
etched texture, or a clear UV-cured pattern on top (TCG Live's "cast and
cure"). The surface gloss throws a soft highlight.

| Physical | Site layer | Typical CSS |
|---|---|---|
| The printed card | `.tcg > img` (the scan) | untouched |
| Foil pattern, colour shift | `.foil` | big gradients or textures at 200-400%, moved by `--background-x/y`; `color-dodge`, `overlay` or `hard-light` onto the scan |
| Pattern detail: bars, glitter, etch, grain | `.foil::before`, `.foil::after` | blended inside the `.foil` group (it is isolated by its own filter and blend) |
| Where the foil is | `mask-image` on `.foil` and `.glare` | `--art` (the scan's alpha) plus window, stamp and per-card masks |
| Surface gloss, specular | `.glare`, `.glare::after` | `radial-gradient` at `--pointer-x/y`, `overlay` or `soft-light` |

## The site's rules (read before writing CSS)

- **DOM**: `.tcg > img + span.foil + span.glare`, built by `tcgFace()` in
  `js/app.js`. Classes: rarity key (`pikachu-rare`, `double-rare`, ...),
  `holo` or `rare-glow`, a pattern (`foil-holo`, `foil-reverse`, `foil-ex`,
  `foil-ultra`, `foil-ir`, `foil-sir`, `foil-gold`, `foil-future`, ...), a
  layout (`foil-evo`, `foil-owner`, `foil-trainer`, `foil-energy`) and
  `data-finish` for special stock. The scan is inline as `--art`.
- **Selectors** are prefixed `body.fx-holo.fx-holo.fx-holo` to beat the
  Classic engine in `css/app.css`. Sheet order: `holo/windows.css`,
  `base.css`, `rarities.css`, `finishes.css`, `realism.css`.
- **Rest state** (PR 5): a resting card paints only `.foil`;
  `.foil::before`, `.foil::after` and `.glare` are `display: none` until
  `.lit` or `.settling`. The resting sheen lives on `.foil` at about
  `0.16-0.18 x --foil-strength`.
- **Performance**: animate only `transform`, `opacity`, `filter`; no
  infinite `background-position` or `@property` animations.
- **URLs in custom properties**: write them root-relative
  (`/assets/masks/...`); browsers have disagreed on what a relative one
  resolves against.
- **Assets** are self-hosted under `assets/`. Never hotlink upstream's CDN or
  TCG Live. `.claude/` is not deployed, so nothing the site needs may live
  here.
- **Licence**: the site is GPL-3 because of upstream; credit anything new in
  `NOTICE.md`.

## Workflow

1. **Identify the finish.** For Scarlet & Violet and Mega Evolution cards,
   read the card's `foil.type`, `foil.mask` and cast-and-cure pattern from
   the TCG Live export (finish-catalog §1). Then look at photos of the real
   card at an angle and write down where the foil is, the pattern, the
   colour behaviour, the texture, and what stays matte (§2).
2. **Measure the mask.** `scripts/fetch_foil_maps.py` puts TCG Live's foil
   map for the card in the lab's gitignored cache; it shows exactly what is
   foil. Build the site's mask from geometry, consensus
   (`scripts/find_overlay.py` finds any printed mark on every card of a
   set) or the scan. TCG Live maps are for measuring only unless Noah
   decides to ship them (masks.md).
3. **Pick the upstream recipe** (finish-catalog §3) and read it in
   `upstream/`. Map its layers onto the site's with the table in
   `upstream/README.md`.
4. **Port it into `lab/lab.css`** under
   `body.fx-holo.fx-holo.fx-holo .lab-proof ...`, so the lab shows it next
   to what the site draws today.
5. **Tune against the photos** in the lab: rest plus at least three poses,
   zoomed on what you changed ([reference/verify.md](reference/verify.md)).
   `scripts/foil_probe.mjs` takes the screenshots; `--styles` shows which
   rule won.
6. **Check the cost and the settings**: `foil_probe.mjs --idle` clean, and
   foil strength, reduced motion, tilt off, shine off, Classic, phone width
   (verify.md).
7. **Ship**: move the rules into `css/holo/`, masks into `assets/masks/`,
   per-card data into `data/<set>.json`, update `NOTICE.md`, and record what
   you learned in the finish's catalogue entry.

## Pitfalls

- **Specificity.** A rule without the triple `fx-holo` prefix silently loses.
  Check with `foil_probe.mjs --styles`.
- **`clip-path` intersects with every mask.** A window clip-path cannot be
  combined with "plus a stamp outside the window"; drop it and use the
  window as a mask layer (`--win-holo`, `--win-evo`, ...).
- **`mask-composite`** lists one operator per layer, top first, and the
  bottom layer composites onto nothing: give it an explicit `add`. The
  `-webkit-` keywords differ (`source-in`, `source-out`, `source-over`).
- **Luminance vs alpha.** TCG Live maps and upstream's `--mask` are
  luminance (`mask-mode: luminance`); the scan and the site's window PNGs
  are alpha. Mixed stacks need `mask-mode` per layer.
- **High contrast over the whole window** (upstream's `contrast(3)`) is
  tuned for a background-only mask. Over the Pokémon it blows out; soften
  it if the mask cannot exclude the Pokémon.
- **Blend modes on white or black stock** do nothing: `color-dodge` cannot
  brighten white, and `overlay` leaves both white and black untouched.
  Multiply relief in or screen colour on instead (blend-and-mask.md).
- **`--rotate-delta`** is not written by the site; upstream formulas that
  use it should treat it as `0deg`.

## 30th Celebration

The set's finishes, foil maps and the Pikachu stamp are in
[reference/30th-celebration.md](reference/30th-celebration.md). In short:
the small stamp is never foil, but the window holo clips through it; the
Pikachu Rare's big stamp is foil but gets none. `lab/lab.css` sections 1 and
2 fix both and have been checked in Chromium; the stamp placements are in
`lab/masks/stamp30.json` (187 cards; the other 4 have no stamp). The
reference file explains how to move the fix into the site.

## Files

| Path | What |
|---|---|
| `reference/variables.md` | Pointer variables, upstream formulas, rest state |
| `reference/blend-and-mask.md` | Blend modes, filters, masks and textures by job |
| `reference/finish-catalog.md` | Identify a finish; recipe per finish; primitives |
| `reference/masks.md` | Mask sources, `find_overlay.py`, mask algebra |
| `reference/30th-celebration.md` | This set's foil, maps, stamp fix and how to ship it |
| `reference/verify.md` | Lab, screenshots, performance and settings checks |
| `lab/` | The foil lab page, proof recipes (`lab.css`), stamp masks |
| `scripts/foil_probe.mjs` | Headless screenshots, computed styles, idle cost |
| `scripts/find_overlay.py` | Recover a printed mark and place it on every card |
| `scripts/fetch_foil_maps.py` | TCG Live foil and etch maps into the lab cache |
| `upstream/` | Unmodified upstream sheets and components, GPL-3 |
