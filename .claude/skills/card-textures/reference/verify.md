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
| `maps` | `1` | proof copies use TCG Live's foil map as the mask (fetch first with `scripts/fetch_foil_maps.py`) |

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
  classic "light from above"), centre, bottom right. A finish that only
  looks right at one angle is wrong.
- **Crop and zoom** the part you changed (a stamp, a border, an edge) with
  PIL: at 240px wide, a 1px scanline or a 5% mask error is invisible.
- **Compare** the proof against the site copy, and both against a photo of
  the real card at a similar angle.
- `--styles` prints the computed paint properties of the first card's five
  layers, site and proof, to see which rule actually won. Specificity
  surprises are the most common reason a recipe "does nothing".
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
  (`css/holo/base.css`); nothing from the recipe may leak past it.
- **Card effects: Classic**: `body.fx-classic` without `fx-holo`, the
  pre-redesign per-rarity system in `css/app.css`. A `css/holo/` recipe
  must not change it.
- **Phones**: at 390px wide, scanlines and fine bars alias. Upstream widens
  them under `@media (max-width: 900px)`; do the same.

## Before calling it done

1. Screenshots at rest and three poses, proof next to site, zoomed on the
   change.
2. `--idle` clean on the lab and on the app page that shows the card.
3. Settings above checked.
4. `NOTICE.md` updated if anything came from upstream or a new texture file
   was added.
5. The finish's entry in `reference/finish-catalog.md` updated with what you
   learned, so the next agent starts from it.
