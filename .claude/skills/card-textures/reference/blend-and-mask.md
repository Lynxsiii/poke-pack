# Blend modes, filters and masks: what each one is for

pokemon-cards-css looks real because every layer is chosen for a physical
reason. This is the reasoning behind the choices, so a new finish can be built
the same way instead of by trial and error.

## The two blending stages

1. **`background-blend-mode`** mixes the images *inside one layer* (a texture
   with a gradient with a radial). It takes one value per image boundary;
   with N images, the first N-1 values apply and the last image is the base.
2. **`mix-blend-mode`** mixes the finished layer *onto everything below it*
   (the scan, then earlier layers). This is where foil meets print.

`filter` runs between them: it is applied to the layer's own composited
background before `mix-blend-mode` puts it on the card. That order is the
whole trick behind "crush then dodge" below.

## mix-blend-mode, by job

| Mode | Use it for | Why |
|---|---|---|
| `color-dodge` | The main shine of almost every holo | Brightens the print by the layer's value and does nothing where the layer is black. Pre-crush the layer with `contrast(2-3)` so most of it is black and only bright bands survive: those read as light, not paint. Fails on near-white print (nothing left to brighten). |
| `overlay` | Glare on regular holos, textures that should keep print contrast | Darkens darks and lightens lights, so detail survives under the hotspot. |
| `hard-light` | Glare on full arts, V/ex glare | A harder, more contrasty overlay; with a radial that ends dark it also shades the far side of the card. |
| `soft-light` | Texture relief (illusion, grain) on the ::after copy | Gentle modulation: ridges show, colour does not flood. |
| `exclusion`, `difference` | The second, opposite-running rainbow copy on full arts | Inverts where it overlaps: two crossing ramps produce the shifting complementary colours of real prismatic foil. |
| `luminosity` | A radial on regular holo that brightens around the pointer without adding hue | Keeps the rainbow's colour and replaces its brightness. |
| `multiply` | Shadows, white-stock pearl, glare on reverses that should dim | Darkens only. The only way to make relief visible on white or pale cards. |
| `lighten`, `darken` | Picking the brighter/darker of two copies (VMAX, 151 glitter) | Keeps sparkle points without washing the rest. |
| `plus-lighter` | Glitter tiles on SV SIR and hyper rare (151) | Pure additive light, for pinpoint sparkles. |
| `hue`, `color`, `saturation` | Recolouring one layer by another (RGB Mews, silver vs gold) | Carries only hue (and saturation) across. |

## background-blend-mode inside the foil stack

Typical full-art stack from upstream (v-full-art, shiny, ex-full-art), top to
bottom:

```
var(--foil)                                 texture or etch map
repeating-linear-gradient(0deg, sunpillar)  the rainbow bands
repeating-linear-gradient(133deg, dark/pale/dark)  diagonal "scan" bars
radial-gradient(at pointer, faint dark)     shading toward the far side
background-blend-mode: soft-light, hue, hard-light;
```

Read it bottom up: the bars hard-light onto the shading radial, the rainbow
contributes only its `hue` to those bars, and the texture `soft-light`s on
top so the bands catch on its ridges. Swapping `soft-light` for `exclusion`
on the texture (what upstream does when no per-card mask exists) makes the
illusion pattern itself shimmer.

## Filters

- `contrast(2-3)` before `color-dodge`: the crush. Most of the layer goes to
  black and disappears; highlights stay.
- `brightness(calc(base + pointer-from-center * k))`: the angle of incidence.
  Base 0.3-0.5 for full arts, k 0.3-0.75.
- `saturate(<1)` on the main shine and `saturate(>1)` on the ::after is
  common: a pale sheen with a vivid edge.
- Keep filters off `.foil` at rest where you can. A filter is a paint cost on
  every resting card in a grid (see verify.md).

## Masks

`mask-image` decides *where* a layer exists. Everything about "the foil is
only where the real card is foil" is masks.

- **Alpha vs luminance.** The site's masks (`--art`, `win-evo.png`, owner
  masks, stamp masks, and the foil maps `fetch_foil_maps.py --ship`
  writes) are alpha: white on transparent. Raw TCG Live PNGs and upstream
  151's `--mask` are luminance: white on black. Set `mask-mode: luminance`
  for those, per layer.
- **`--art` as a mask.** Masking with the scan's own alpha trims the foil to
  the card's rounded corners and to any transparent padding in the scan.
  Every foil and glare starts from it.
- **clip-path vs mask.** `clip-path` is cheap and exact for rectangles (the
  window holo uses `inset(...)`). Anything with a silhouette (evolution badge,
  owner portrait, stamp, a Pokémon) needs a mask image.
- **Composite order.** Layers are listed top first and combined bottom up.
  Each layer's `mask-composite` keyword says how it combines with the result
  of everything below it, with the layer itself as the *source*:
  - `add`: union. `intersect`: keep only where both are. `subtract`: source
    minus below. `exclude`: either but not both.
  - So "A minus B" is `mask-image: A, B; mask-composite: subtract;`
    (A on top is the source). The site's reverse holo does exactly this:
    `var(--art), var(--win-holo)` with `subtract` is card minus window.
  - Three layers, "art AND window, minus the stamp":
    `mask-image: var(--art), var(--win), var(--stamp);`
    `mask-composite: intersect, subtract, add;` reads bottom up as
    `stamp`, then `win - stamp`, then `art ∩ that`. Give the bottom layer
    `add` explicitly: a short list repeats to cover every layer, and a
    repeated `intersect` or `subtract` on the bottom layer composites it
    against nothing.
  - WebKit's prefixed keywords are Porter-Duff: `source-over` (add),
    `source-in` (intersect), `source-out` (subtract), `xor` (exclude). Write
    both properties.
- **Sizing and placing a layer.** `mask-size` and `mask-position` take one
  value per layer. `contain` fits a full-card mask to the card. A small
  stamp mask uses `mask-size: 24.83% auto` and a percentage
  `mask-position`, where `P%` puts the image's own P% point on the box's P%
  point: an image of width w at left offset L sits at `L / (W - w)`.
  `find_overlay.py` writes these for you.
- **Masks are per element.** `.foil`, `.foil::before`, `.foil::after` and
  `.glare` each need the mask they should have. Pseudo-elements do not
  inherit the parent's mask shape for their own blending; a parent mask does
  clip them visually, but a pseudo that needs a *different* area (a stamp that
  is foil while the window is not) has to be masked on its own and cannot
  escape a stricter parent mask or clip-path.

## Textures

- **Registered vs sliding.** Anything that is physically stamped into the
  card (etch, emboss, the illusion pattern, glitter) stays fixed to the print:
  `background-position: center` (or a tiny `--shift` parallax). Only light
  (gradients, radials) moves with the pointer. A sliding texture reads as a
  sticker overlay.
- **Tile size in % of the card**, not px, so the pattern scales with the card
  (upstream uses `33%`, `25%`, `18% 15%`). Px tiles are right only for
  sub-pixel noise (glitter at `150px`).
- **Seamless.** Check a texture tiles without seams at the size you use.
  `scripts/make_foil_textures.py` generates the site's own seamless tiles.
- **Root-relative URLs.** A relative `url()` inside a custom property has
  resolved against the stylesheet that *uses* it on this site: `assetUrl()`
  in `js/app.js` records inline `--art` paths being fetched from
  `css/assets/...`, and `css/holo/base.css` redeclares the window masks
  root-relative for the same reason. Browsers and spec drafts have
  disagreed here, so write `url("/assets/foil/...")` (or an absolute URL
  from `assetUrl()` for inline values) and it cannot matter.
