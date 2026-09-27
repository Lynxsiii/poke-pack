# Masks: putting the foil only where the real card is foil

The biggest single difference between pokemon-cards-css and a generic "holo
effect" is not the gradients. It is that every upstream card has a per-card
foil map, so the shine stops exactly where the physical foil stops: around
the Pokémon, at the text box, at a stamp. Get the mask right before tuning a
single gradient; a perfect rainbow on the wrong area still looks fake.

## What the site already has

| Mask | Where | Used by |
|---|---|---|
| `--art` | inline on every `.tcg` (the scan URL) | every foil and glare, as the alpha base: rounded corners, scan padding |
| Art window rectangle | `clip-path: inset(9.318% 7.302% 52.727% 7.937%)` in `windows.css`; `--win-holo` SVG in `app.css` | `foil-holo` (intersect) and `foil-reverse` (subtract) |
| Evolution badge punch | `assets/masks/win-evo.png`, from `scripts/make_window_masks.py` | Stage 1/2 window holos and reverses |
| Owner portrait punch | `assets/masks/owner/<owner>[-evo].png`, from `scripts/make_owner_masks.py` | Trainer's Pokémon window holos and reverses |
| Energy and Trainer windows | `--win-holo-energy`, `--win-holo-trainer`, clip-paths | those layouts |
| Per-card etch maps | `assets/foil/etch/<set>/<n>.webp`, from `scripts/make_etch_maps.py` | Classic engine SIR/BWR only, today |

## Sources for a new mask, best first

1. **A per-card foil map.** TCG Live publishes one for every SV and ME
   print (`https://cdn.malie.io/file/malie-io/tcgl/cards/png/en/<key>/<key>_en_<nnn>_std.foil.png`,
   367x512: white is foil, grey is partial, black is none), plus an
   `.etch.png` for etched prints. This is what upstream uses, and it gets the
   Pokémon cut-out and every stamp exactly right. **Noah decided on
   2026-09-27 that the site ships these maps** (it had avoided TCG Live
   files before; `scripts/make_etch_maps.py` still says so). Use
   `../scripts/fetch_foil_maps.py`; see "Shipping foil maps" below.
   Sets TCG Live does not carry (Sword & Shield and older, the 30th
   Celebration's Classic Collection) still need the sources below.
2. **Geometry.** A rectangle, a rounded rect, a circle punch. Exact and
   free. Measure on the 600x838 scans (`assets/cards/<set>/<n>.webp`).
3. **Consensus across cards.** Anything printed identically on many cards
   (a frame element, a stamp, a portrait badge) can be recovered by asking,
   per pixel, whether the scans agree. `make_owner_masks.py` does it for
   portraits; `../scripts/find_overlay.py` does it for any mark and then
   finds that mark on every card of a set, at any position and scale.
4. **Derived from the scan.** Edges and hatching (`make_etch_maps.py`'s
   difference-of-Gaussians), colour keys (a gold border), or "where this card
   differs from the template" (the attack text printed over the Pikachu
   Rare's stamp, which `find_overlay.py --cutouts` removes).
5. **Hand-drawn SVG.** Last resort, for one-off shapes.

Separating the Pokémon from its background (which SV holo rares, Double Rares
and commons need, per the TCG Live maps) cannot be done reliably from the
scan alone. Without a per-card map, keep the foil across the whole window
and say so; do not ship a half-right automatic cut-out.

## Shipping foil maps

```
python3 .claude/skills/card-textures/scripts/fetch_foil_maps.py --set me55 --all --ship --write-data
```

This fetches every card's maps (raw PNGs into the gitignored `lab/cache/`),
writes the site's copies to `assets/foil/maps/<set>/<n>.webp` and
`<n>-etch.webp`, and adds `foilMap` / `etchMap` paths to each card in
`data/<set>.json`. The copies are **alpha** masks (white, with the map's
brightness as alpha), like every other mask on the site, so no `mask-mode`
is needed. For the 30th Celebration: 161 cards (158 plus the RGB Mews),
about 6 MB (3.5 MB of foil maps, 2.3 MB of etch maps for the 15 etched
cards); the 30 Classic Collection cards have no map. Look at a card with
the lab's `?maps=1`, which prefers the shipped copy.

Wiring it into the site (the texture work does this, not the fetch):

- `tcgFace()` in `js/app.js`: when `card.foilMap` is set, add
  `--foil-map:url('${assetUrl(card.foilMap)}')` to the inline style and a
  `has-foil-map` class (`assetUrl()` because inline relative URLs resolve
  against the stylesheet, see its comment).
- `css/holo/windows.css`, after the window rules so it wins:

```css
body.fx-holo.fx-holo.fx-holo .tcg.has-foil-map .foil {
  clip-path: none;
  -webkit-mask-image: var(--art), var(--foil-map);
  -webkit-mask-composite: source-in, source-over;
  mask-image: var(--art), var(--foil-map);
  mask-composite: intersect, add;
  -webkit-mask-size: contain, 100% 100%;
  mask-size: contain, 100% 100%;
  -webkit-mask-position: center;
  mask-position: center;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
}
```

  The map replaces the window clip, the evolution and owner punches and the
  stamp knockout at once: all of them are already black in it. Decide per
  finish whether `.glare` keeps its window (a gloss on the art only) or
  lights the whole card as upstream's masked cards do (`clip-path: none;
  mask-image: var(--art)`); the lab's section 4 does the latter.
- Etched finishes (SIR, Futuristic, RGB) use `etchMap` where upstream uses
  `--foil` in its etched sheets, masking the texture layers.
- `NOTICE.md`: add a row crediting the maps to Pokémon TCG Live, via
  malie.io.

Maps and scans line up: both are the full card, 367x512 and 600x838 are the
same shape, and the Pokémon silhouettes and stamp holes match when overlaid.


## find_overlay.py

```
python3 .claude/skills/card-textures/scripts/find_overlay.py \
  --set me55 --template-rarity "Double Rare" --box 0.66,0.33,1.0,0.56 \
  --cutouts "Pikachu Rare" --overrides .claude/skills/card-textures/lab/masks/stamp30-overrides.json \
  --debug --name stamp30 --out assets/masks/stamp
```

- `--template-rarity` picks a group where the mark sits in one place over
  artwork that varies (full arts are ideal: no frame to agree with).
- `--box` is where the mark sits on that group, as card fractions. Give it
  some margin.
- Output: `stamp30.png` (the mark's alpha), `stamp30-rgb.png` (its colours,
  for debugging), `stamp30.json` (per card: `left`, `top`, `width`,
  `height` as card fractions, plus CSS-ready `position` and `size`, the
  `score`, and `found_by`: `colour` match, `outline` match for recoloured
  marks, `rarity` when a text-covered card takes its rarity's shared spot, or
  `hand` from `--overrides`), and with `--debug` a `stamp30-check.jpg` sheet
  with every placement outlined. Look at the sheet. Anything in `missing`
  needs a human decision: pin it in an overrides file (`--overrides`,
  `{"<card id>": {"left": f, "top": f, "width": f}}`), or `null` if the card
  has no mark; nulls are listed under `unmarked`. A run takes about three
  minutes for 191 cards.
- `--cutouts <rarities>` also writes a full-card mask per card of those
  rarities: the mark minus anything printed over it.

Placing the shared template per card in CSS (no per-card files):

```css
.tcg.has-stamp .foil {
  -webkit-mask-image: var(--art), var(--stamp-mask);
  -webkit-mask-composite: source-out;
  mask-image: var(--art), var(--stamp-mask);
  mask-composite: subtract, add;
  mask-size: contain, var(--stamp-size);
  mask-position: center, var(--stamp-pos);
  mask-repeat: no-repeat;
}
```

with `--stamp-mask`, `--stamp-size` and `--stamp-pos` set inline per card
from the JSON (in `tcgFace()`, or copied onto the card records in
`data/<set>.json` the way `make_owner_masks.py` stamps `ownerMask`).

## Mask algebra cheat sheet

Composite keywords, the layer on top being the source (see blend-and-mask.md):

| Want | `mask-image` (top first) | `mask-composite` |
|---|---|---|
| Card, trimmed to the scan | `var(--art)` | none |
| Window only | `var(--art), var(--win)` | `intersect, add` |
| Everything but the window (reverse) | `var(--art), var(--win)` | `subtract, add` |
| Window minus a stamp | `var(--art), var(--win), var(--stamp)` | `intersect, subtract, add` |
| Window plus a stamp elsewhere | `var(--art), var(--win), var(--stamp)` | `intersect, add, add` |
| Card minus a stamp (full arts) | `var(--art), var(--stamp)` | `subtract, add` |

A `clip-path` on the same element intersects with all of it, so a window
clip-path cannot be combined with a "plus a stamp outside the window" mask.
Drop the clip-path and use the window as a mask layer instead.
