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
  `has-foil-map` (`--foil-map`), `has-etch-map`, `has-etch-bins`,
  `has-foil-rgb`, `has-stamp` and `cure-<kind>` (which also adds the
  `.cure` span).
- **New finishes ride on a second class** next to the old pattern class
  (`foil-holo foil-rainbow`, `foil-ex foil-sunpillar`), so the Classic
  engine, which keys on the old classes, is untouched. The new rules then
  have to set every paint property the older recipes set, pseudo layers
  included (celebration.css's shared resets).
- **Selectors** are prefixed `body.fx-holo.fx-holo.fx-holo` to beat the
  Classic engine in `css/app.css`. Sheet order: `holo/windows.css`,
  `base.css`, `rarities.css`, `finishes.css`, `realism.css`, `maps.css`,
  `celebration.css`, `sv-fullart.css`, `promos.css`, `sv-finishes.css`,
  `sv-rare.css`, `shrouded-fable.css`, `shiny-vault.css`, `prismatic.css`.
  Later sheets win ties, which the map rules rely on; the lab loads the
  same list in the same order.
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
   its scan by `scripts/make_futuristic_maps.py`. A stamped print (Pokémon
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
   rule won.
6. **Check the cost and the settings**: `foil_probe.mjs --idle` clean, and
   foil strength, reduced motion, tilt off, shine off, Classic, phone width
   (verify.md).
7. **Ship**: move the rules into `css/holo/`, masks into `assets/masks/`,
   per-card data into `data/<set>.json`, update `NOTICE.md`, bump the
   `?v=` of every sheet and script you changed in `index.html`, and record
   what you learned in the finish's catalogue entry.

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

Paradox Rift (sv4) has no note yet; its thread's finish work is in
[reference/sv-fullart.md](reference/sv-fullart.md).

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
| `scripts/foil_probe.mjs` | Headless screenshots, computed styles, idle cost |
| `scripts/find_overlay.py` | Recover a printed mark and place it on every card |
| `scripts/fetch_foil_maps.py` | TCG Live foil and etch maps: into the lab cache, or shipped as site assets (with RGB channel masks and `--etch-bins`) |
| `scripts/ship_stamp.py` | Ship a mark found by `find_overlay.py`: mask into `assets/masks/stamp/`, placements into `data/<set>.json` |
| `scripts/make_futuristic_maps.py` | Draw a Futuristic Rare's foil map, etch and etch bins from its scan when TCG Live has none (hints in `lab/masks/futuristic/`) |
| `scripts/stamp_knockout.py` | Cut a stamped print's stamp (Pokémon Center, set logo, Prerelease, store) out of its foil map: difference of the two scans, template match, or a box from `scripts/stamp_boxes.json`; draws a window-and-frame map when a window holo's plain print has none (a full-art print needs its TCG Live map fetched first) |
| `scripts/make_pixel_cosmos.py` | Draws the pixel cosmos texture in `assets/foil/promo/` (seeded) |
| `scripts/check_foil_maps.py` | Flag foil maps that may be swapped between cards |
| `upstream/` | Unmodified upstream sheets and components, GPL-3 |

On the site side:

| Path | What |
|---|---|
| `js/foil-maps.js` | Per-card map, etch, stamp and cast-and-cure classes and variables for `tcgFace()` (shared with the lab) |
| `css/holo/maps.css` | Foil maps as the mask, the stamp knockout, the `.cure` layer |
| `css/holo/celebration.css` | The 30th Celebration finishes, and the shared SV holo Rare, Double Rare, IR and SIR map recipes |
| `css/holo/promos.css` | Cosmos, smooth and pixel (`foil-cosmos`, `cosmos-pixel`) |
| `css/holo/shiny-vault.css` | Shiny Rare, Shiny Ultra Rare and Scodix gold |
| `scripts/make_celebration_textures.py` | Draws the texture tiles in `assets/foil/celebration/` (seeded, tileable) |
