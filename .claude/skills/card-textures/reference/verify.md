# Verifying a texture

A texture is done when it has been looked at, at several angles, next to
the card as the site draws it today and next to a photo of the real card,
and when a resting page costs nothing. Never judge from the CSS alone.

## The lab

`lab/index.html` renders real cards with the site's own DOM, class logic and
stylesheets, then `lab/lab.css` on top. Every card appears twice: **site**
(exactly what poke-pack.rip draws) and **proof** (the same card with the
lab's recipes, which only apply inside `.lab-proof`). Put a new recipe in
`lab.css` under `body.fx-holo.fx-holo.fx-holo .lab-proof ...` first; move it
to `css/holo/` only once the screenshots say it is right.

Open it by hand: `python3 scripts/serve.py`, then
`http://127.0.0.1:5173/.claude/skills/card-textures/lab/index.html` (give
`index.html` explicitly; the dev server sends bare folders to the app).
Move the pointer over a card to drive it with the site's own springs.

Query string (see `lab/lab.js` for the full list):

| Key | Example | Meaning |
|---|---|---|
| `set` | `me55` | which `data/<set>.json` |
| `cards` | `1,2,12,23,126` | card numbers; default is one card per rarity and layout |
| `proof` | `split`, `on`, `off` | both copies, proof only, site only |
| `poses` | `rest,50:50,20:15,80:30` | one row per pointer pose (x:y, 0-100), pinned |
| `w` | `320` | card width in px |
| `maps` | `1` | proof copies use the card's foil map as the mask: the shipped copy in `assets/foil/maps/` if there is one, else the raw map from `scripts/fetch_foil_maps.py` |

`window.lab.pose(x, y)` and `window.lab.rest()` pose every card from the
console.

## Screenshots

```
node .claude/skills/card-textures/scripts/foil_probe.mjs \
  --query "cards=1,2,12,23&poses=rest,30:25,70:70&w=380" --out /tmp/lab.png --width 2600
```

It serves the repo itself and needs Playwright with Chromium (installed in
the cloud container; on a Mac, `npm i -g playwright && npx playwright install chromium`).
Read the PNG and look. Useful habits:

- **Poses.** Always `rest` plus at least three lit poses: top left (the
  classic "light from above"), centre, bottom right, and a thumb low on
  the text box (`50:78`): on a phone the pointer is wherever the thumb
  rests, usually well below the art, and a finish that only looks right
  with the light on the art is wrong (Murkrow 181, 2026-09-28: the shiny's
  silver went grey and the card washed out with the thumb on the text box).
- **Crop and zoom** the part you changed (a stamp, a border, an edge) with
  PIL: at 240px wide, a 1px scanline or a 5% mask error is invisible.
- **Compare** the proof against the site copy, and both against a photo of
  the real card at a similar angle.
- `--styles` prints the computed paint properties of the first two cards'
  layers (`.foil`, its pseudo layers, `.cure` when there is one, `.glare`
  and `::after`) in the first lit row, to see which rule actually won.
  Specificity surprises are the most common reason a recipe "does nothing".
- `--css "<rules>"` injects CSS after load: hide a layer
  (`.tcg .glare{display:none!important}`) to see what each one adds.
- `proof=off` in the query hides the proof column, for a site-only sheet
  once a finish has shipped.
- `--scale 2` for fine textures (glitter, etch).
- `--page "/"` screenshots a page of the app instead of the lab.

## Performance (the PR 5 rules)

- Animate only `transform`, `opacity` and `filter`. Pointer-driven custom
  properties are fine; they only change while a card is lit.
- No infinite animations of `background-position`, gradients or
  `@property` values anywhere.
- Resting cards paint `.foil` only: `.foil::before`, `.foil::after` and
  `.glare` are `display: none` until `.lit` or `.settling`
  (`css/holo/base.css`). A finish's resting look (the faint sheen you see
  on a card lying in the binder) must live on `.foil` itself, around
  `0.16-0.18 x --foil-strength` opacity.
- Masks and blend modes cost paint time per lit card, not per frame at rest.
  Prefer one extra mask layer over one extra element.

`foil_probe.mjs --idle` sits on the page for 3 s after load and prints
main-thread work plus every running animation, flagging infinite ones that
animate anything but compositor properties. On the lab at rest it should
print `task 0 ms` and `no running animations`. Run it on `--page "/"` too
after touching shared CSS.

## Settings to check

The site's settings (`applySettings()` in `js/app.js`) change the foil path;
a texture has to survive all of them:

- **Foil strength** (subtle, normal, intense) sets `--foil-strength` to
  0.55, 1 or 1.5. Scale the recipe's opacities by it, and check intense
  does not blow out and subtle still reads as foil.
- **Reduced motion** (`prefers-reduced-motion`) and **Card tilt** off
  (`body.no-tilt`): the card stays flat, `--rotate-*` stay 0, and the light
  jumps to the pointer without springs. Tilt-driven bars must still look
  right at 0deg.
- **Card shine** off: `body.no-shine` hides `.foil` and `.glare`
  (`css/holo/base.css`) and `.cure` (`css/holo/maps.css`); nothing from
  the recipe may leak past it.
- **Card effects: Classic**: `body.fx-classic` without `fx-holo`, the
  pre-redesign per-rarity system in `css/app.css`. A `css/holo/` recipe
  must not change it.
- **Phones**: at 390px wide, scanlines and fine bars alias. Upstream widens
  them under `@media (max-width: 900px)`; do the same.

The lab cannot toggle body classes. To check settings on the real app, drive
it with Playwright: open `/packs/<set>` then `/catalog`, click a hidden
`[data-inspect="<card id>"]` button from `page.evaluate` (the catalog tiles
exist before the view shows them) to open the inspector, move the mouse over
`dialog[open] .tcg` to light it, and toggle `no-shine` / `fx-classic` on
`body` between screenshots.

## The sweep (before merging)

Every finish a set prints, one card each, at phone size, at rest and lit,
on one sheet per set:

```
python3 .claude/skills/card-textures/scripts/sweep_finishes.py --set <set>     # the set you touched
python3 .claude/skills/card-textures/scripts/sweep_finishes.py --all           # after touching a shared sheet or js/foil-maps.js
```

The script first checks every `css/holo/` sheet for a rule defined twice
at the top level and stops on an identical copy, lists every promo the site
draws as a window holo without a foil map (exit 1: it is on the old window
recipe), then renders each set at rest, lit from the top left and with a
thumb low on the text box. `--stamped` sheets every stamped print instead
of one card per finish: the stamp sweep, after any change to
`stamp_knockout.py`, `stamp_boxes.json`, a card photo or `windows.css`.

Read every sheet. Noah found four kinds of failure on 2026-09-28 that the
lab at desktop size had hidden (Espeon ex MEP 108, Keldeo ex, Team
Rocket's Mewtwo ex, Cynthia's Garchomp ex, Iron Crown ex, Chien-Pao ex,
Chi-Yu ex); each has a sign on the sheet, a cause and a fix:

| Sign on the sheet | Cause | Fix |
|---|---|---|
| Concentric rings or op-art waves over a full art | The card fell to realism.css's no-map recipes (`illusion.png`, `illusion2.png` stretched over the card) | It needs `has-foil-map`: a TCG Live map, or the all-white fallback `foilExtras()` gives every IR, SIR, UR, HR and MHR |
| A SIR, UR or gold with no relief: flat art, a glittery frame, reads like an Illustration Rare | The etch only masks a glare hot spot, or is gated to the light bars | The etch cuts `.foil` and lights the lines over the whole card at every pose (celebration.css SIR, sv-fullart.css UR and gold); no Live etch means a map drawn from the card (`make_card_etch.py`) |
| Every SIR (or UR, or gold) of a set shows the same hatch: the texture of one is the texture of all, and it ignores the drawing | The print has no etch map and fell to the shared tile (`has-etch-tile`) | `make_card_etch.py --set <set> --all --ship --write-data`; the sweep lists any print still on the tile. Each texture must be unique to its card (Noah, 2026-09-28) |
| The glitter is the first thing seen at phone size: the art and the etch sit under a sand | The sand layer is too bright or too opaque (SIR `.foil::after` was brightness 1.5 contrast 2.2 at 0.3 + 0.45 from-center) | Turn it down until the etch leads (1.35 / 1.9 / 0.16 + 0.3 since 2026-09-28); the Mew ex photos show a pinpoint grain under the sheen, noticed second |
| A gold whose fills are flat yellow blobs under a rough speckle that also covers the teal and the text (Chien-Pao ex 242 in the viewer, Noah 2026-09-28) | The sharp etch difference-blended at full strength: its 3 px hatch lands between pixels at viewer size and aliases to grain; plus a dense glitter tile laid twice, one copy difference-blended to near black over the text | A soft engraving (`scripts/soften_etch.py`, `etchSoft`): the etch blurred so the hatch is a satin tone and only the line art stays dark; one screened copy of the fine tile (`glitter-fine.webp`); winks at brightness 3, opacity 0.4 (paldean-fates.md) |
| A Pokémon that is a flat silhouette at rest | The scan itself is flat (Paldean Fates' Scodix golds) and the etch, the only line detail, was a lit-only relief | Draw the engraving on `.foil` dark with a floor (the soft one, see the row above), and raise the rest opacity so it reads in any light |
| Rings on a Shiny, stripes on a reverse, a white disc in a glare | Wrong map variant, tile pitch or hot-spot size | The finish's own note in `reference/` |
| The whole card grey and washed in the thumb-on-the-text-box pose, fine in the others | A multiply ramp on `.foil` that falls to 70% far from the pointer, under a glare whose white lifts the matte ink and whose black end darkens the art | Keep a multiply floor at 80% or above (real silver stays bright away from the lamp), the glare's white under 0.6 and its black end under 0.15 (shiny-vault.css Shiny Rare, 2026-09-28) |
| A stamp or logo printed in the art with foil bands streaking over it and a hard edge cutting through it | A promo the site draws as a window holo (`foilAs: "Rare"`, Cosmos, a holo rarity) with no foil map: the old window recipe clips the art window through the logo | A TCG Live map, or a hand box for its plain id in `stamp_boxes.json` and `stamp_knockout.py` (Sprigatito svp191, 2026-09-28); the sweep lists such promos and exits 1 |
| A recipe change that does nothing, or the old look back after a merge | The sheet holds the same rule twice at the top level and the later copy wins: PR #55 pasted the pre-change sheet after the new rules | `sweep_finishes.py` refuses to run while a sheet holds an identical rule twice (`--check-only` runs just that check); delete the stale copy |

The sheet is 220 CSS px at 3x by default: a phone. A desktop-size lab
render (`w=380`, scale 1) averages a 1 px etch to grey and a 2 px glitter
grain to nothing, which is exactly how every one of those shipped.

## Before calling it done

1. Screenshots at rest and three poses, proof next to site, zoomed on the
   change.
2. The sweep above, for the set you touched, or `--all` after a shared
   sheet or `js/foil-maps.js` changed. Every sheet read, none of the signs.
3. `--idle` clean on the lab and on the app page that shows the card.
4. Settings above checked.
5. `NOTICE.md` updated if anything came from upstream or a new texture file
   was added.
6. The finish's entry in `reference/finish-catalog.md` updated with what you
   learned, so the next agent starts from it.
