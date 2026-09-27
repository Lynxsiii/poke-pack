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
   367x512, luminance: white is foil, grey is partial, black is none). This
   is what upstream uses, and it gets the Pokémon cut-out and every stamp
   exactly right. **This repo has chosen not to ship TCG Live assets**
   (`scripts/make_etch_maps.py`: "synthesised from our own scans, not
   third-party TCG Live dumps"). Until Noah says otherwise, use these maps to
   *measure* where the foil is and to check your own masks, not as files
   served by the site. If that decision changes, record it here.
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
scan alone. Without per-card maps, keep the foil across the whole window
and say so; do not ship a half-right automatic cut-out.

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
