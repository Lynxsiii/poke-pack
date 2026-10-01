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

## Rule zero: realism

Noah, 2026-09-28: "remember we're trying to go for realism here." Every
texture is judged beside a photo of the real card, at phone size (220 px
wide, three device pixels per CSS pixel), before it merges. Flashy is not
the bar; the photo is. Three tells that a recipe has drifted from it:

- **Glitter you notice first.** On the real cards the grain is under the
  sheen, noticed second (the Mew ex SIR macros). Turn it down until the
  etch and the art lead.
- **A texture that ignores the drawing.** A real etch follows the line
  art, and no two cards share one: TCG Live's map, or one drawn from the
  card's own scan, never a tile.
- **Light that does not behave like foil.** One pool around the pointer
  and a band that slides with the tilt, brightest at grazing angles,
  matte ink staying matte. A wash over the whole face, or a hot spot that
  paints the text box, is not foil.

Photos live in the project's shared folder (`paldean-fates/texture-refs/`,
`30th-celebration/`, per-set folders); the reference notes say which ones
each recipe was judged against. When there is no photo, find one before
tuning.

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
| Cast-and-cure coat (clear UV pattern over ink and foil alike) | `.cure` | a texture tile masked by the scan only, never by the foil map; `screen` |
| Surface gloss, specular | `.glare`, `.glare::after` | `radial-gradient` at `--pointer-x/y`, `overlay` or `soft-light` |

## The site's rules (read before writing CSS)

- **DOM**: `.tcg > img + span.foil + [span.cure] + span.glare`, built by
  `tcgFace()` in `js/app.js`. Classes: rarity key (`pikachu-rare`,
  `double-rare`, ...), `holo` or `rare-glow`, a pattern (`foil-holo`,
  `foil-reverse`, `foil-ex`, `foil-ultra`, `foil-ir`, `foil-sir`,
  `foil-gold`, `foil-future`, ...), a layout (`foil-evo`, `foil-owner`,
  `foil-trainer`, `foil-energy`) and `data-finish` for special stock. The
  scan is inline as `--art`. `js/foil-maps.js` adds the per-card data:
  `has-foil-map` (`--foil-map`), `has-etch-map`, `has-etch-tile`, `has-etch-bins`,
  `has-foil-rgb`, `has-stamp` and `cure-<kind>` (which also adds the
  `.cure` span). A full-art finish (Illustration Rare, Special
  Illustration Rare, Ultra Rare, Hyper Rare, Mega Hyper Rare) with no map
  gets `has-foil-map` with the all-white `assets/foil/maps/full.webp`, so
  the map recipes paint it edge to edge instead of the older no-map ones.
- **New finishes ride on a second class** next to the old pattern class
  (`foil-holo foil-rainbow`, `foil-ex foil-sunpillar`), so the Classic
  engine, which keys on the old classes, is untouched. The new rules then
  have to set every paint property the older recipes set, pseudo layers
  included (celebration.css's shared resets).
- **Selectors** are prefixed `body.fx-holo.fx-holo.fx-holo` to beat the
  Classic engine in `css/app.css`. Sheet order: `holo/windows.css`,
  `base.css`, `rarities.css`, `finishes.css`, `realism.css`, `maps.css`,
  `celebration.css`, `sv-fullart.css`, `promos.css`, `sv-finishes.css`,
  `sv-rare.css`, `shrouded-fable.css`, `shiny-vault.css`, `prismatic.css`,
  `sv151.css`, `side-sets.css`, `sv-reverse.css`, `sv-double-rare.css`, then the
  era sheets and last `sleeves.css` (the card sleeves' foil and gloss,
  [reference/sleeves.md](reference/sleeves.md)).
  Later sheets win ties, which the map rules rely on; the lab loads the
  same list in the same order (check `lab/index.html` against `index.html`
  when a sheet is added).
- **Rest state** (PR 5): a resting card paints only `.foil`;
  `.foil::before`, `.foil::after`, `.cure` and `.glare` are `display: none`
  until `.lit` or `.settling`. The resting sheen lives on `.foil` at about
  `0.16-0.18 x --foil-strength`.
- **Performance**: animate only `transform`, `opacity`, `filter`; no
  infinite `background-position` or `@property` animations.
- **URLs in custom properties**: write them root-relative
  (`/assets/masks/...`); browsers have disagreed on what a relative one
  resolves against.
- **Assets** are self-hosted under `assets/`. Never hotlink upstream's CDN or
  TCG Live; ship copies. `.claude/` is not deployed, so nothing the site needs may live
  here.
- **Licence**: the site is GPL-3 because of upstream; credit anything new in
  `NOTICE.md`.

## Workflow

1. **Identify the finish.** For Scarlet & Violet and Mega Evolution cards,
   read the card's `foil.type`, `foil.mask` and cast-and-cure pattern from
   the TCG Live export (finish-catalog §1). Then look at photos of the real
   card at an angle and write down where the foil is, the pattern, the
   colour behaviour, the texture, and what stays matte (§2).
2. **Get the mask.** For Scarlet & Violet and Mega Evolution cards, ship
   TCG Live's per-card foil map (Noah's decision, 2026-09-27):
   `scripts/fetch_foil_maps.py --set <set> --all --ship --write-data`, wired
   in as masks.md "Shipping foil maps" shows. For cards without one, build
   the mask from geometry, consensus (`scripts/find_overlay.py` finds any
   printed mark on every card of a set) or the scan (masks.md). A
   Futuristic Rare TCG Live has not published yet gets both maps drawn from
   its scan by `scripts/make_futuristic_maps.py`. A full-art print TCG Live
   has no map for at all (the Mega Evolution sets, Black Bolt, White Flare,
   the ME Black Star promos) needs nothing: `foilExtras()` gives it the
   all-white map and the same recipe as the mapped prints. A stamped print (Pokémon
   Center, set logo, Prerelease, store stamp) gets its stamp cut out by
   `scripts/stamp_knockout.py` ([reference/promos.md](reference/promos.md)).
3. **Pick the upstream recipe** (finish-catalog §3) and read it in
   `upstream/`. Map its layers onto the site's with the table in
   `upstream/README.md`.
4. **Port it into `lab/lab.css`** under
   `body.fx-holo.fx-holo.fx-holo .lab-proof ...`, so the lab shows it next
   to what the site draws today. (Or, once the finish has its own class,
   straight into `css/holo/`: the lab loads every site sheet, so
   `proof=off` shows the site's version.)
5. **Tune against the photos** in the lab: rest plus at least three poses,
   zoomed on what you changed ([reference/verify.md](reference/verify.md)).
   `scripts/foil_probe.mjs` takes the screenshots; `--styles` shows which
   rule won. Also render the same finish on poke-holo.simey.me at the same
   tilt (30:25 and 75:65, about 275 px x 2): ours matches or beats it, with
   our realism rules on top (Noah, 2026-09-29: "make sure our cards look
   the same if not better than that site"). Judge the whole family of
   finishes, not only the card that was reported: the first Sword and Shield
   pass called everything matched after looking at one V, and the full arts
   were still worse ([reference/sword-shield.md](reference/sword-shield.md)).
6. **Sweep the set at phone size**:
   `scripts/sweep_finishes.py --set <set>` (`--all` after touching a shared
   sheet or `js/foil-maps.js`; `--stamped` after touching stamps, boxes or
   photos) first refuses to run while any `css/holo/` sheet holds the same
   rule twice, lists every window holo promo without a map (exit 1), then
   renders one card of every finish
   at rest, lit from the top left and with a thumb low on the text box, at
   220 px x 3, one sheet per set, and then runs `scripts/dark_specks.py`
   on the same picks (each card with and without its foil; any card the
   foil dotted dark fails the sweep). Read every sheet against the table of
   failure signs in [reference/verify.md](reference/verify.md) (rings, flat
   full arts, speckle, a line screen, dark dots, a silhouette at rest, a
   card gone grey under the thumb). Nothing merges without it: on
   2026-09-28 eight cards Noah screenshotted on his phone had passed the
   lab at desktop size. The sweep renders in Chromium, so then render every
   etched or colour-dodged finish again in Safari's engine
   (`foil_probe.mjs --browser webkit`; the install is in the
   poke-pack-webkit-testing memory note): Noah's iPhone showed hairline line
   screens and colour-dodge pixel blocks that Chromium never drew (#79).
7. **Check the cost and the settings**: `foil_probe.mjs --idle` clean, and
   foil strength, reduced motion, tilt off, shine off, Classic, phone width
   (verify.md).
8. **Ship**: move the rules into `css/holo/`, masks into `assets/masks/`,
   per-card data into `data/<set>.json`, update `NOTICE.md`, bump the
   `?v=` of every sheet and script you changed in `index.html` (every CSS or
   JS change, however small: Cloudflare's edge kept serving a stylesheet under
   its unchanged tag and Noah saw #79's fixed glitches six hours late, #80),
   run `node .claude/skills/card-textures/scripts/foil_coverage.mjs <sets>` (it must print nothing), and
   record what you learned in the finish's catalogue entry.

## Pitfalls

- **Specificity.** A rule without the triple `fx-holo` prefix silently loses.
  Check with `foil_probe.mjs --styles`.
- **`clip-path` intersects with every mask.** A window clip-path cannot be
  combined with "plus a stamp outside the window"; drop it and use the
  window as a mask layer (`--win-holo`, `--win-evo`, ...).
- **`mask-composite`** lists one operator per layer, top first, and the
  bottom layer composites onto nothing: give it an explicit `add`. The
  `-webkit-` keywords differ (`source-in`, `source-out`, `source-over`).
- **Luminance vs alpha.** Raw TCG Live PNGs and upstream's `--mask` are
  luminance (`mask-mode: luminance`); the scan, the site's window PNGs and
  the shipped foil maps are alpha. A mixed stack needs `mask-mode` per
  layer.
- **High contrast over the whole window** (upstream's `contrast(3)`) is
  tuned for a background-only mask. Over the Pokémon it blows out; soften
  it if the mask cannot exclude the Pokémon.
- **Blend modes on white or black stock** do nothing: `color-dodge` cannot
  brighten white, and `overlay` leaves both white and black untouched.
  Multiply relief in or screen colour on instead (blend-and-mask.md).
- **`--rotate-delta`** is not written by the site; upstream formulas that
  use it should treat it as `0deg`.
- **Old recipes leak into new ones.** rarities.css and realism.css put
  filters, blends and masks on `::before`, `::after` and `.glare::after`
  (`contrast(4)` on a holo `::after`, for one). A finish added as a second
  class inherits all of it unless it resets every paint property first.
- **Pseudo-elements cannot go inside `:is()`**: `:is(.foil::before)` is
  invalid and drops the whole rule. Write each selector out.
- **Colour-dodge a colour at mid brightness, not full.** A bright tint
  dodges to white; about 0.5-0.85 brightness leaves it coloured (the
  Classic Collection stars).
- **Silver on a white scan must darken it.** A shiny's art window scans
  white; `color-dodge`, `screen` and a hard-light group over half leave it
  white. Multiply a pointer-centred silver ramp onto it (shiny-vault.css).
- **`.foil`'s opacity multiplies its pseudo layers.** Specks at
  `opacity: 1` inside a `.foil` at 0.4 show at 0.4. Put translucency in a
  gradient's alpha and keep `.foil` near 1 while held.
- **A TCG Live map is not binary.** An inked art background comes out at
  about half alpha, the bare border at full, and "not foil" is 22/255, not
  0. Tune for the border and let the map scale the window; the shipped
  maps have had the floor stretched to 0 since 2026-09-27.
- **A promo's stamp is not in any map.** TCG Live's map of a stamped promo
  is the plain print's. `scripts/stamp_knockout.py` cuts the stamp out
  ([reference/promos.md](reference/promos.md)); name stamped prints
  `<base id>-<suffix>` so it finds them.
- **Never let a full art fall to the no-map recipes.** realism.css's
  `foil-sir`, `foil-ex` and `foil-ultra` recipes are upstream's fallback for
  unmapped cards: they stretch the op-art textures `illusion.png` and
  `illusion2.png` over the whole card. In headless Chromium that reads as a
  faint texture; on a phone it is hard concentric rings across the art and
  text (Espeon ex MEP 108 and White Flare's Keldeo ex, 2026-09-28). A new
  finish or set without TCG Live maps must still get `has-foil-map`, via
  the white fallback map in `js/foil-maps.js`, and judge its look on a
  phone or at `--scale 2`, not only in the lab at desktop size.
- **A stamped print with no plain copy is still a stamped print.** The
  Pokémon Horizons promos (Sprigatito svp191, Fuecoco svp192) and the
  Paradox Rift Build & Battle promos (svp057 to svp060) only exist with
  their logo, so they carry no `-stamp` suffix and no TCG Live map, and
  filed as `foilAs: "Rare"` they fell to the old window recipe: its
  `clip-path` cut straight through the logo and its bands streaked over it
  (Noah, 2026-09-28: "the badge is fucked here"). A window holo promo with
  no map is always on that recipe. Give the plain id a hand box in
  `scripts/stamp_boxes.json` (a list of boxes hugs a crest over a
  wordmark) and `stamp_knockout.py` draws its window-and-frame map with the
  logo cut out; `sweep_finishes.py` lists every window holo promo without
  a map and exits 1, and `--stamped` sheets every stamped print
  ([reference/promos.md](reference/promos.md)).
- **The thumb sits on the text box, not on the art.** On a phone the
  pointer is wherever the card is held, usually low on the card, so every
  finish is judged with the light there too (`50:78` in the sweep). A
  multiply ramp on `.foil` that falls to 70% away from the pointer turns
  the art window grey, and a glare whose white end is 0.75 doubles the
  matte ink's darks under the thumb while its 30% black end dims the art:
  Murkrow 181's Shiny Rare came out washed and muddy in the reveal
  (2026-09-28). Real silver stays bright wherever the lamp is not, so a
  multiply floor stays at 80% or above, a glare's white under 0.6 and its
  black end under 0.15 (`shiny-vault.css`).
- **One copy of every rule.** An edit that pastes a sheet's old text after
  the new rules leaves the later copy painting, and the change "does
  nothing" while the lab and the live site agree with each other: PR #55's
  Paldean Fates gold fix shipped that way and never showed. The sweep
  script checks every `css/holo/` sheet for a rule defined twice at the top
  level before it renders (`--check-only` runs just that), and an
  identical copy stops it. `foil_probe.mjs --styles` shows which rule won.
- **A Special Illustration Rare is engraved edge to edge.** Photos of the
  real cards (Latias ex, Charizard ex 151, Erika's Invitation, Mew ex PAF):
  fine etched lines run over the whole face, frame, text box and Pokémon
  included, and they are what catches the light, under a sand of glitter
  and a broad pastel rainbow. A recipe that only masks a glare hot spot
  with the etch, or gates the rainbow to two narrow light bars, leaves the
  art flat and the card reads as an Illustration Rare (Team Rocket's Mewtwo
  ex and Cynthia's Garchomp ex, 2026-09-28). The shared recipe
  (`celebration.css`, `.foil-sir.has-foil-map`) therefore cuts `.foil` to
  the etch (art, map, etch with a 45% floor, `mask-composite: intersect,
  intersect, add, add`), lights the lines over the whole card on
  `.glare::after` inside a hard-light glare, and lays two glitter tiles on
  `.foil::after`. Prints without a Live etch carry a map drawn from their
  own art (`etchMap` + `etchDrawn`, `scripts/make_card_etch.py`, class
  `has-etch-map has-etch-drawn`), held at a flat 45% in the map's place;
  the shared tile (`has-etch-tile`, `assets/foil/sir-etch.webp`) is only
  the fallback for a print nobody has drawn yet, and the sweep fails on it.
  The same holds for the other etched full arts: full-art Ultra Rares and
  golds light their etch over the whole card at every pose
  (`sv-fullart.css`) and take the drawn map the same way. Details: [reference/sv-fullart.md](reference/sv-fullart.md).
  Where the scan itself is flat (Paldean Fates' Scodix golds: gold fills on
  teal, the line art only in the etch), the etch has to read at rest too,
  so it is drawn on `.foil` dark and the rest opacity is raised, and it is
  drawn soft (`etchSoft`, `scripts/soften_etch.py`: the etch blurred so
  the hatch on the fills is a satin tone and only the line art stays dark),
  because a sharp 3 px hatch difference-blended at full strength aliases
  into speckle at viewer size (Chien-Pao ex, 2026-09-28)
  ([reference/paldean-fates.md](reference/paldean-fates.md)).
- **Glitter never darkens.** A fleck catches the light or does nothing;
  it never leaves a dark dot. A glitter or grain tile through
  `difference`, `exclusion`, `multiply`, `hard-light` or `overlay` darkens
  the print wherever the tile is dark and reads as dirt at phone size
  (Chien-Pao ex; the Illustration Rare grain with its glare's black end,
  Noah 2026-09-28: black speckles "make it look glitchy"). Tiles ride
  `screen`, `color-dodge`, `lighten` or `plus-lighter` only; a glare's far
  end stays above about 25% grey (or black under 0.3 alpha), and a glare
  that is not masked to the foil also sits on the matte photo of a reverse
  or window holo, so its far end must not shade it; shadow belongs to the
  engraving, drawn soft on `.foil`. `scripts/dark_specks.py` counts the
  dots a foil adds and the sweep fails on them (verify.md).
- **A drawn etch is a fingerprint, not a grating.** Any straight grating,
  however fine or bent, has one frequency and one direction over a patch,
  and the browser's scaling turns it into a diagonal line screen over the
  card. Espeon ex MEP 108 was redrawn three times (a regular grating, a
  soft-wobble grating, a grating per Voronoi cell) and Noah still saw it
  ("still broken", 2026-09-29): a painterly print has little edge
  structure, so the drawn direction collapsed to two or three facets, each
  a fixed pitch. Live's etch and the real engraving are short, curving,
  breaking ridges (the macro photos in `paldean-fates/texture-refs/`,
  `shiny-ultra-rare_217-gardevoir-ex_macro-fingerprint-etch-over-pokemon`),
  so `make_card_etch.py` now band-passes white noise to one fine ridge
  pitch in 24 orientations and mixes the ones near the drawing's direction
  (`PITCH`, `RADIAL_BW`, `ANGLE_BW`, `STEER`, `GAIN`). Contour rings
  (distance to the drawing's edges) were tried and read as a swirled
  fingerprint blob field on a flat body. Judge a map by
  `scripts/etch_metrics.py` (direction coherence `coh` 0.3 to 0.6 like
  Live's, not 0.7; `lb` under about 18) and then by a WebKit render at 220
  and 340 CSS px x 3 beside a Live-etch print; the 204 drawn maps were all
  redrawn as `-v3` on 2026-09-29.
- **An asset changed under its old name is invisible for a year.** `_headers`
  serves `/assets/*` as `immutable, max-age=31536000`, so a phone that has
  seen a map, scan or tile keeps that copy and never asks again. Espeon ex
  MEP 108 stayed screened on Noah's phone after PR #73 redrew its etch map
  in place (2026-09-29), and 109 stamp and cosmos maps from #44 and #68 had
  been stale the same way. A changed asset gets a new filename (`-v2`,
  `-v3`: a name that never existed, since an old name may be cached with
  its old bytes) and the data points at it; `scripts/make_card_etch.py
  --ship` does this by itself, `scripts/check_asset_overwrites.py` lists
  every in-place change against master (`--fix` renames and rewrites the
  references) and the sweep fails on one. Only `css/`, `js/`, `data/` and
  the pages are `no-cache`; a changed sheet still needs its `?v=` bump in
  index.html.
- **A hairline texture aliases into a line screen at phone size.** Any
  streak, hatch or etch whose pitch is 2 to 4 px at the map's width beats
  against the browser's scaling and shows as a wavy or diagonal screen over
  the whole card (Espeon ex, Surfing Pikachu VMAX, Meowth VMAX). Read shots
  at native pixels, since a downscaled composite invents its own moiré. A
  *drawn* etch is fixed by drawing it as a fingerprint (above); a *TCG
  Live* etch is never softened, blurred or grained: use it at its native
  size (`scripts/native_era_etch.py`, 733 x 1024, sigma 0.6). The 400 px
  blurred and grained maps killed the screen and the engraving with it, and
  read as camouflage blotches beside the demo's fine lines (#92).
- **A tile narrower than its own pointer travel wraps into a seam.** A
  repeating layer whose `background-size` is smaller than the range its
  `background-position` is driven over (a negative position, or over 100%)
  drops the tile's edge inside the card, and it draws as a hard vertical
  line that moves with the tilt (V, VMAX, VSTAR, ultra and IR, Double
  Rares, holo bars, gold, Tera, Classic Collection; #87, #90, #91). Keep
  every oversized layer's position within 0 to 100%, mirrored as `100% -
  position` where it ran backwards. `scripts/foil_coverage.mjs` renders
  the lab at six pinned poses and prints every layer that fails; run it
  over the sets you touched.
- **Colour-dodge divides by (1 - source), and Safari draws the divide by
  zero.** A dodged `.foil` whose filter chain pins a channel at 1.0 turns
  near-black ink (gold's line art, a VMAX's text bars) into pure blue or
  red, drawn as jagged pixel blocks in WebKit only. End the chain in
  `contrast(0.8)` (or a closing `brightness(0.92)`) so the gain stays
  finite, and keep the cap when retuning
  ([reference/sword-shield.md](reference/sword-shield.md)).
- **A colour wash is a stack of layers, so bisect before touching a
  number.** Hide the layers one at a time (`foil_probe.mjs --css
  ".glare{display:none}"`, then `.foil::before`, then `.foil`), find the
  one that carries the cast, and turn that one down. The Sword and Shield
  full arts were three layers, each fine alone: a full-opacity hard-light
  glare, the etch-masked twin covering the painting once the etch went
  native, and saturation tuned for the old blotches (#92 to #94). Compare
  with the reference for what the art does, not for how bright the rainbow
  is: the demo keeps the art's own colours and lets the rainbow ride over
  them.
- **No two cards share a texture.** A real SIR, full-art Ultra Rare or
  gold is engraved along its own drawing, so one tile repeated over two
  hundred prints reads as wallpaper (Noah, 2026-09-28: "I want every
  texture to be unique to each card"). Every etched print needs its own
  etch map: TCG Live's, or one drawn from the scan by
  `scripts/make_card_etch.py` (fingerprint ridges steered by the art's
  edges, the ink left smooth; judge it with `--compare` beside Live's
  sv4pt5 232 Mew ex and 234 Charizard ex maps). `sweep_finishes.py` fails
  on a print left on the tile.
- **Glitter is a grain under the sheen, not a sparkle over it.** The Mew ex
  photos (`paldean-fates/texture-refs/`) show pinpoint glitter you notice
  second, after the etch and the rainbow. The SIR sand at brightness 1.5
  contrast 2.2, opacity 0.3 + 0.45 from-center, was the first thing seen on
  a phone (Noah, 2026-09-28: "a little overpowering"); it sits at 1.35 /
  1.9 / 0.16 + 0.3 now. When a glitter layer leads at phone size, turn it
  down until the etch does. Never lay a glitter copy difference-blended
  over a text box: the Scodix golds did, and it read as dark grain over the
  rules text; one screened copy of the sparse tile
  (`assets/foil/glitter-fine.webp`) is the grain the photos show.
- **The lab must mirror the site.** It had no `foilLook()` and did not
  load `promos.css`, so promos looked nothing like the site; a recipe
  judged there was judged on the wrong render. Check `lab/index.html`'s
  sheet list against `index.html` when a sheet is added.

## What has shipped, set by set

Each set thread wrote its research and what it shipped in `reference/`.
Read the set's note before touching its cards; the shared-finish notes
cover recipes several sets use.

Shared finishes:

- [reference/finish-catalog.md](reference/finish-catalog.md): identify a
  finish from TCG Live's print id and photos; recipe per finish.
- [reference/sv-rare-holo.md](reference/sv-rare-holo.md): the Scarlet &
  Violet holo Rare (`SV_HOLO`, `foil-svholo`, `sv-rare.css`).
- [reference/sv-fullart.md](reference/sv-fullart.md): full-art Ultra Rare
  and gold Hyper Rare (`sv-fullart.css`), reverse holos per era, Double
  Rare tuning.
- [reference/sv-tera-acespec.md](reference/sv-tera-acespec.md): Tera ex
  and ACE SPEC (`sv-finishes.css`).
- [reference/sun-moon.md](reference/sun-moon.md): the Sun & Moon era
  overview (pack structure, data gotchas, the four finish sheets
  `sm.css`, `sm-gx.css`, `sm-fullart.css`, `sm-shiny.css`, what the
  reviews caught) and the index of its set and family notes, among them
  [sun-moon-gx.md](reference/sun-moon-gx.md) (Pokémon-GX, TAG TEAM GX, Prism
  Star), [sun-moon-fullart.md](reference/sun-moon-fullart.md),
  [sun-moon-holo-reverse.md](reference/sun-moon-holo-reverse.md) and
  [sun-moon-shiny-vault.md](reference/sun-moon-shiny-vault.md).
- [reference/sv-reverse.md](reference/sv-reverse.md): the Scarlet & Violet
  reverse holos, one pattern per type, and the Mega Evolution mirror
  (`sv-reverse.css`, `scripts/make_sv_reverse.py`).
- [reference/sv-double-rare.md](reference/sv-double-rare.md): the Scarlet
  & Violet Double Rare streaks (`sv-double-rare.css`, scoped by `era-sv`).
- [reference/me-holo-fixes.md](reference/me-holo-fixes.md): Mega Evolution
  Double Rare, holo Rare and Mega Attack Rare (TCG Live maps, two Double
  Rare foils, `css/holo/me-finishes.css`, `era-me`).
- [reference/promos.md](reference/promos.md): cosmos (smooth and pixel),
  shiny promos, stamped prints and `stamp_knockout.py`.
- [reference/svp-promos.md](reference/svp-promos.md): the SV Black Star
  Promos set and the products each promo came in.
- [reference/promos-existing-sets.md](reference/promos-existing-sets.md):
  promos of the Mega Evolution sets, Black Bolt and White Flare (pixel
  cosmos, tinsel).
- [reference/sv-side-sets.md](reference/sv-side-sets.md): Trick or Trade,
  McDonald's and the basic Energy runs.

Sets, oldest first:

- [reference/scarlet-violet.md](reference/scarlet-violet.md) (sv1)
- [reference/sv2-paldea-evolved.md](reference/sv2-paldea-evolved.md) (sv2)
- [reference/obsidian-flames.md](reference/obsidian-flames.md) (sv3)
- [reference/151.md](reference/151.md) (sv3pt5): Costco reverse cosmos,
  metal Mew, cosmos Energy (`sv151.css`)
- [reference/paldean-fates.md](reference/paldean-fates.md) (sv4pt5): the
  Shiny Vault and Scodix gold (`shiny-vault.css`)
- [reference/temporal-forces.md](reference/temporal-forces.md) (sv5)
- [reference/twilight-masquerade.md](reference/twilight-masquerade.md) (sv6)
- [reference/shrouded-fable.md](reference/shrouded-fable.md) (sv6pt5)
- [reference/stellar-crown.md](reference/stellar-crown.md) (sv7)
- [reference/surging-sparks.md](reference/surging-sparks.md) (sv8)
- [reference/prismatic-evolutions.md](reference/prismatic-evolutions.md)
  (sv8pt5): Poké Ball and Master Ball prints (`prismatic.css`)
- [reference/journey-together.md](reference/journey-together.md) (sv9)
- [reference/destined-rivals.md](reference/destined-rivals.md) (sv10)
- [reference/30th-celebration.md](reference/30th-celebration.md) (me55):
  all nine finishes (`celebration.css`), foil maps, the Pikachu stamp
  knockout; also the worked example of taking a whole set from research to
  CSS.

Paradox Rift (sv4, live since 2026-09-27) has no note of its own: its
thread's work is the shared notes
[reference/sv-fullart.md](reference/sv-fullart.md) (full-art Ultra Rare and
gold Hyper Rare), [reference/sv-reverse.md](reference/sv-reverse.md) and
[reference/sv-double-rare.md](reference/sv-double-rare.md).

## Files

| Path | What |
|---|---|
| `reference/variables.md` | Pointer variables, upstream formulas, rest state |
| `reference/blend-and-mask.md` | Blend modes, filters, masks and textures by job |
| `reference/finish-catalog.md` | Identify a finish; recipe per finish; primitives |
| `reference/masks.md` | Mask sources, `find_overlay.py`, mask algebra |
| `reference/verify.md` | Lab, screenshots, performance and settings checks |
| `reference/promos.md` | Cosmos promos, shiny promos, stamped prints |
| `reference/<set>.md` | One note per shipped set (the list above) |
| `lab/` | The foil lab page, proof recipes (`lab.css`), stamp masks |
| `scripts/foil_probe.mjs` | Headless screenshots, computed styles, idle cost; `--boxes` writes each lab cell's card rectangle and caption as JSON beside the PNG |
| `scripts/sweep_finishes.py` | One card of every finish a set prints (`--stamped`: every stamped print), at phone size, at rest, lit from the top left and under a thumb on the text box, one sheet per set, after checking that no `css/holo/` sheet defines a rule twice and no window holo promo lacks a map: the check before merging (verify.md) |
| `scripts/find_overlay.py` | Recover a printed mark and place it on every card |
| `scripts/fetch_foil_maps.py` | TCG Live foil and etch maps: into the lab cache, or shipped as site assets (with RGB channel masks and `--etch-bins`) |
| `scripts/ship_stamp.py` | Ship a mark found by `find_overlay.py`: mask into `assets/masks/stamp/`, placements into `data/<set>.json` |
| `scripts/make_futuristic_maps.py` | Draw a Futuristic Rare's foil map, etch and etch bins from its scan when TCG Live has none (hints in `lab/masks/futuristic/`) |
| `scripts/stamp_knockout.py` | Cut a stamped print's stamp (Pokémon Center, set logo, Prerelease, store) out of its foil map: difference of the two scans, template match, or a box from `scripts/stamp_boxes.json` (a list of boxes for a crest over a wordmark; a plain id with a box is a print whose only copy is the stamped one); draws a window-and-frame map when a window holo's plain print has none (a full-art print needs its TCG Live map fetched first) |
| `scripts/make_pixel_cosmos.py` | Draws the pixel cosmos texture in `assets/foil/promo/` (seeded) |
| `scripts/make_card_etch.py` | Draws a per-card etch map from the scan for an etched print TCG Live has no map for (`--all --ship --write-data`; `--all --force --ship` redraws a set's drawn maps; `--compare` beside a Live map): a fine fingerprint of short ridges steered by the drawing's edges, soft, with grain |
| `scripts/etch_metrics.py` | Line-screen numbers for etch maps (`lb`, `ori`, `mid`, direction coherence `coh`); Live's maps are the range to sit in |
| `scripts/dark_specks.py` | Glitter never darkens: renders a set's picks with and without their foil, counts the dark dots the foil adds per card and pose, boxes them red on `<out>/<set>-<n>-specks.png`, exits 1 over budget; the sweep runs it |
| `scripts/make_sir_etch.py` | Draws the fallback engraving tile `assets/foil/sir-etch.webp` (diagonal hatch, seamless), for a print nobody has drawn yet |
| `scripts/make_etch_hd.py` | Ships TCG Live's etch at its native 733 px as `<n>-etch-hd.webp` (`etchHd`), for a recipe that draws the rings as an image (Shining Fates' `sf-shiny`); never overwrites, `--suffix` for a redraw |
| `scripts/native_era_etch.py` | Ships TCG Live's etch for a Sword and Shield era set at its native size (`<n>-etch-v4.webp`, sigma 0.6, no grain); never soften a Live etch |
| `scripts/soften_era_etch.py` | The older blurred and grained era etch (`-etch-v3`), kept for a card with no cached Live etch |
| `scripts/foil_coverage.mjs` | Finds every oversized repeating layer whose position lets its tile edge into the card (the moving vertical seam); prints nothing when clean; `BATCH=60` for every card of a set |
| `scripts/cosmos_window_maps.py` | Redraws the cosmos promos' drawn window-and-frame maps at TCG Live strength (window at alpha 130, frame full, owner badge cut, the plain print's Live window when it has one); `--all` or `--set <set> --cards <n>` |
| `scripts/soften_etch.py` | Draws a gold print's soft engraving `assets/foil/maps/<set>/<n>-etch-soft.webp` from its etch map (blurred, curved) and sets `etchSoft` (`--set <set> --all`: every `finish: "scodix"` print) |
| `scripts/make_glitter_flecks.py` | Draws a seeded glitter tile (`glitter-flecks.webp` dense, `glitter-fine.webp` sparse: `--density 0.03 --seed 4242`) |
| `scripts/check_asset_overwrites.py` | Lists every file under `assets/` changed in place against master (cached for a year under that name); `--fix` renames each to the next never-used `-vN` and rewrites the references in data, js, css and index.html. The sweep runs it last. |
| `scripts/check_foil_maps.py` | Flag foil maps that may be swapped between cards |
| `upstream/` | Unmodified upstream sheets and components, GPL-3 |

On the site side:

| Path | What |
|---|---|
| `js/foil-maps.js` | Per-card map, etch, stamp and cast-and-cure classes and variables for `tcgFace()` (shared with the lab) |
| `css/holo/maps.css` | Foil maps as the mask, the stamp knockout, the `.cure` layer |
| `assets/foil/maps/full.webp` | The all-white map full-art prints without a TCG Live map fall back to |
| `assets/foil/maps/<set>/<n>-etch.webp` | An etched print's etch map: TCG Live's, or drawn from the card (`etchDrawn`, `has-etch-drawn`) |
| `assets/foil/maps/<set>/<n>-etch-hd.webp` | TCG Live's etch at its native 733 px as a luminance texture (`etchHd`, `--etch-hd`, `has-etch-hd`), for a recipe that draws the rings as an image rather than a mask (Shining Fates' `sf-shiny`) |
| `assets/foil/sir-etch.webp` | The fallback engraving tile for an etched full art with no etch map at all (`has-etch-tile`); the sweep fails on such a print |
| `assets/foil/maps/<set>/<n>-etch-soft.webp` | A Scodix gold's soft engraving (`etchSoft`, `--etch-soft`): the line art dark, the hatch a satin tone |
| `css/holo/celebration.css` | The 30th Celebration finishes, and the shared SV holo Rare, Double Rare, IR and SIR map recipes |
| `css/holo/promos.css` | Cosmos, smooth and pixel (`foil-cosmos`, `cosmos-pixel`) |
| `css/holo/shiny-vault.css` | Shiny Rare, Shiny Ultra Rare and Scodix gold |
| `scripts/make_celebration_textures.py` | Draws the texture tiles in `assets/foil/celebration/` (seeded, tileable) |
