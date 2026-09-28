# Finish catalogue

Every finish the site draws, or will need to, with where to start from.
"Upstream" paths are the vendored copies in `../upstream/` (see its README):
`swsh/` is pokemon-cards-css (Sword & Shield era), `sv151/` is
pokemon-cards-151 (Scarlet & Violet era, the closest match to this site).

## 1. Name the finish from data first

Pokémon TCG Live classifies every Scarlet & Violet and Mega Evolution print.
malie.io publishes that data, and it is the most reliable answer to "what
foil is this card":

- Set index: `https://cdn.malie.io/file/malie-io/tcgl/export/index.json`
  (keys like `sv3-5` for our `sv3pt5`, 151; 30th Celebration is `me5-5`
  for our `me55`, with its RGB Mews under `me5-5m`).
- Per set: `https://cdn.malie.io/file/malie-io/tcgl/export/<version>/<key>.en-US.json`,
  path from the index. Each card has `foil.type`, `foil.mask`, and
  `ext.tcgl.longFormID`, whose tail names any cast-and-cure pattern
  (for example `..._CastAndCure_SouthernCross`).
- Fetch with `curl`; Python's default user agent gets a 403.

Tally across every SV and ME set in the export (checked 2026-09-27):

| `foil.type` / `foil.mask` | Cards | Rarities it covers | Site class today |
|---|---|---|---|
| `FLAT_SILVER` / `REVERSE` | 3215 | Every standard reverse holo | `foil-reverse` |
| `SV_HOLO` / `HOLO` | 414 | Rare holo | `foil-holo` |
| `SUN_PILLAR` / `HOLO` | 900 | Illustration Rare, Double Rare, promos | `foil-ir`, `foil-ex` |
| `SUN_PILLAR` / `ETCHED` | 446 | Ultra Rare (full art), Shiny Rare, Shiny Ultra Rare | `foil-ultra` |
| `SV_ULTRA` / `ETCHED` | 520 | Special Illustration Rare, Hyper Rare, Ultra Rare, Mega ex Double Rares, 30th Futuristic | `foil-sir`, `foil-gold`, `foil-future` |
| `SV_ULTRA_SCODIX` / `ETCHED` | 11 | Paldean Fates hyper rares (raised clear Scodix texture) | `foil-gold` |
| `ULTRA_GOLD_RAINBOW` / `COLD_FOIL_ETCHED` | 8 | Mega Hyper Rare | `foil-gold` |
| `RAINBOW` / `ETCHED` | 171 | Prismatic Evolutions commons to rares, Black White Rare | `foil-bwr` and others |
| `RAINBOW` / `HOLO` | 76 | 30th Celebration commons, some energies | `foil-holo foil-rainbow` (me55 commons) |
| `COSMOS` / `HOLO` | 204 | Promos, some rares | `foil-holo foil-cosmos` (`css/holo/promos.css`, promos with `foilAs: "Cosmos"`) |
| `COSMOS` / `REVERSE` | 9 | Some energies and alt prints | none yet |
| `CRACKED_ICE` / `REVERSE` | 8 | Alt-print energies | none yet |
| `TINSEL` / `HOLO`, `REVERSE` | 31 | White Flare (rsv10pt5) holo rares, some energies | `foil-holo` |
| `ACE_FOIL` / `ETCHED` | 33 | ACE SPEC Rare | `foil-holo` |
| `PIKACHU` / `HOLO` | 30 | 30th Celebration Pikachu Rare | `foil-holo foil-pikachu` |
| `RGB` / `ETCHED` | 3 | 30th Celebration RGB Mew | `foil-future foil-rgb` |
| `STAMPED` / `STAMPED` | 5 | Stamped promos | none yet |

Cast-and-cure patterns (a UV-cured holographic texture printed over the card,
named in `longFormID`): `SouthernCross` (242 Double Rares: the four-point
star sparkle, which upstream 151 draws with `birthday-holo*.webp`),
`SVPokeBall` (160) and `SVMasterBall` (144) (the ball-pattern reverses),
`StitchedRings` (30, the 30th Celebration Pikachu Rares).

The masks mean: `HOLO` foil is only in some areas (usually the art, often
minus the Pokémon), `REVERSE` is everywhere except the art window, `ETCHED`
is the whole card with a textured etch that follows the art.

Sword & Shield and older cards are not in that export. For those, identify by
rarity and look (the upstream `swsh/` sheets are named after them), and by
photos.

## 2. Look at the real card

Data says which family; only the card says how it moves. Before tuning, write
down in a sentence each:

1. **Where** the foil is (whole card, art window, background only, frame
   only, a stamp).
2. **Pattern**: plain mirror, rainbow bands (sun pillar), vertical bars,
   galaxy or cosmos dots, cracked-ice shards, glitter, a repeating motif
   (Poké Balls, energy symbols, stars), or an etch that follows the painting.
3. **Colour behaviour**: full rainbow, a narrow hue range (gold, silver, one
   RGB colour), or near-white pearl.
4. **Texture** you can see without light on it (embossed lines, fingerprint
   swirls, raised clear coat).
5. **What stays matte**: text, the Pokémon, stamps, badges.

Sources, in order: TCG Live foil maps (`.../cards/png/en/<key>/<key>_en_<nnn>_std.foil.png`,
luminance: white is foil) for where; photos or video of the physical card at
an angle for pattern and colour (search the card name plus "holo close up"
or check the research notes in `/mnt/project-files/` for the set); the
upstream demo (poke-holo.simey.me, poke-151.simey.me) for how the closest
recipe already moves.

## 3. Finish by finish

Each entry: what it looks like, the upstream sheet to start from, and the
layer plan in this site's DOM (`.foil`, `.foil::before`, `.foil::after`,
`.glare`, `.glare::after`).

### Scarlet & Violet and Mega Evolution

**Rare holo (`SV_HOLO`)**. The art window's background and the silver
border are foil; the Pokémon is not. Real cards show one broad, saturated
rainbow band sweeping across the background, with a fine silver sandpaper
glitter over all of the foil. `foil-svholo` (celebration.css) draws that on
cards with a foil map; it replaced a port of `sv151/regular-holo.css` that
read too dark next to photos. Recipe, photos and pitfalls:
[sv-rare-holo.md](sv-rare-holo.md). Cards without a map keep the site's older
`foil-holo`, the Sword & Shield recipe with 1px scanlines.

**Reverse holo (`FLAT_SILVER`)**. Flat mirror foil everywhere but the art
window; a broad sheen and a diagonal dark band cross it. `sv151/reverse-holo.css`
(same as swsh). Mask: `--art` minus the window (`windows.css`).

**Poké Ball / Master Ball reverse (`CastAndCure_SVPokeBall`, `SVMasterBall`)**.
The reverse with a repeating ball motif whose rims flash rainbow. Upstream
`sv151/poke-ball-holo.css` masks two rainbow layers with the outer and inner
ball shapes (`pokeball-outer.webp`, `pokeball-inner.webp`). The site's
`foil-rev-pokeball` / `-masterball` in `finishes.css` use etched SVG motifs.

**Double Rare (`SUN_PILLAR` / `HOLO` + `SouthernCross`)**. The regular-frame
ex: sun-pillar rainbow over the card with a sparkle of four-point stars, the
Pokémon itself not foil. `sv151/ex-regular.css`: a glitter layer of
`birthday-holo-dank*.webp` (the stars), masked by the card's foil map and a
pointer radial; sunpillar with grain on the shine pseudos; two glares
(color-burn and lighten). The site has one glare element, so fold the second
glare into `.glare::after`. Shipped for the 30th Celebration as
`foil-sunpillar` plus `cure-stars`: the stars are a cast-and-cure coat, so
they sit on `.cure` (masked by the card, not the foil map) and glint over
the Pokémon too.

**Ultra Rare full art (`SUN_PILLAR` / `ETCHED`)**. Textured full art: the etch
catches bands of rainbow that slide diagonally. `sv151/ex-full-art.css` with a
per-card etch as `--foil`; without one, the no-mask branch (illusion.png at
33%, `exclusion, hue, hard-light`) is what `realism.css` ships now.

**Illustration Rare (`SUN_PILLAR` / `HOLO`)**. Full-bleed painting inside a
thin frame, a soft sun-pillar sheen over the art, no heavy texture.
`sv151/illustration-rare.css`: V-regular style sunpillar with grain, clipped
to the inner border polygon, overlay glare plus a screen glare2.

**Special Illustration Rare (`SV_ULTRA` / `ETCHED`)**. Heavily textured etch
following the painting, fine iridescent glitter, light bars that swing with
tilt. `sv151/ex-special-illustration-rare.css`: bars on `::after`
(exclusion, angle from `--rotate-x`), `--holo` on `::before`, three glitter
tiles (`iri-7/8/9.webp`) with opposite `--shift` parallax, masked by the etch
map in luminance mode, and a white glare2 masked by the foil map. The site's
per-card etch maps (`assets/foil/etch/`, `scripts/make_etch_maps.py`) stand in
for the etch. With a TCG Live map (`.foil-sir.has-foil-map`, celebration.css)
the recipe started as that port (15deg rainbow, the crossing tilt bars
gating it, glitter, a multiply glare, the etch on `.glare::after`) and was
rebuilt on 2026-09-28 because it left the art flat: now `.foil` itself is
cut to the etch, one broad light pool replaces the bars, the glare is
hard-light and the lit lines cover the whole card; prints without a Live
etch take a map drawn from their own art (`has-etch-drawn`, `scripts/make_card_etch.py`). See
[sv-fullart.md](sv-fullart.md), "Special Illustration Rare". realism.css's
no-map SIR is never used on a full art any more (the white fallback map).

**Hyper Rare, gold (`SV_ULTRA` / `ETCHED`)** and **Mega Hyper Rare
(`ULTRA_GOLD_RAINBOW`)**. The gold is printed; the foil adds etch texture,
glitter and a warm sweep. `sv151/hyper-rare.css` is structurally the SIR
recipe; `swsh/secret-rare.css` shows how gold is tinted (`linear-gradient(45deg,
gold, pale gold)` lightened in, glitter overlaid). Mega Hyper Rares are
typed "gold rainbow" in TCG Live, so expect a rainbow shift inside the gold;
confirm on photos before adding one.

**Shiny Rare / Shiny Ultra Rare (`SUN_PILLAR` / `ETCHED`)**. Paldean Fates
shinies: an etched sun-pillar foil (per TCG Live); the look is a silvery,
textured background.
`swsh/shiny-rare.css` (illusion texture, clipped window) and `swsh/shiny-v.css`.

**Black White Rare (`RAINBOW` / `ETCHED`)**. Monochrome stock, pearl or
silver etch. White stock cannot be dodged brighter, so relief has to be
multiplied in (`finishes.css` pearl and ruby).

**ACE SPEC Rare (`ACE_FOIL` / `ETCHED`)**. Full-card etched foil of its own
type; check photos for the pattern. Closest upstream: `swsh/secret-rare.css` structure
without the gold, or `rainbow-holo.css` with the colours pulled down.

**Tinsel (`TINSEL`)**. White Flare holo rares. Going by the name,
fine streaks like tinsel (confirm against the card before tuning). Build from `swsh/regular-holo.css`'s `::before` bars
with a tight `--bars` (1-1.5%) and a glitter tile.

**Cosmos (`COSMOS`)**. Galaxy dots of several sizes. `swsh/cosmos-holo.css`
with the three `cosmos-*-trans.png` layers at a per-card random offset
(`--cosmosbg`).

**Cracked ice (`CRACKED_ICE`)**. Angular shards, each a different colour at
a given angle. No upstream sheet: generate a seamless Voronoi shard tile
(`scripts/make_foil_textures.py` makes `facet.png`, the nearest existing
one), use it as the `--foil` texture over a sun-pillar ramp with
`background-blend-mode: exclusion, hue, hard-light`, and give each shard a
flat colour so it flips rather than slides.

### 30th Celebration finishes (shipped, `css/holo/celebration.css`)

Worked examples of finishes with no upstream sheet. Details and photo
sources in `30th-celebration.md`.

**Common rainbow (`RAINBOW` / `HOLO`)**. A soft wide rainbow on the art
background only. Grain plus a 112deg spectrum whose ends fade to black, so
the colour arrives in one broad band rather than a stripe pattern; a
counter-moving sweep on `::before`; a gentle glare, because a strong one
bleaches pale Pokémon that the map leaves unfoiled.

**Pikachu Rare (`PIKACHU` / `HOLO` + `StitchedRings`)**. Cracked-ice foil
in the window and in the big stamp, with firework bursts of short dashes.
A seeded Voronoi shard tile (`cracked-ice.webp`) exclusion-blended over a
sun pillar; the bursts (`stitched-rings.webp`) as a mask on a vivid
gradient in `::after`, and again, paler, on `.cure` across the whole card.

**Futuristic (`SV_ULTRA` / `ETCHED`, op-art plate)**. Opalescent inks on
silver, grid glitter, and geometric relief cells that each flash at their
own tilt. The trick is `--etch-bins`: the etch split into horizontal and
vertical line masks, each lighting a band layer that moves differently, so
neighbouring cells flash at different angles. A card with no TCG Live
maps can have them drawn: `scripts/make_futuristic_maps.py` cuts the
Pokémon out of the scan (GrabCut from hand hints), finds the text by its ink
and white keyline, places the stamp by matching a sibling card, and draws
the plate as rings round each energy orb plus hard-edged cells of rings,
hatching and chevrons at TCG Live's 2.3 px pitch.

**RGB (`RGB` / `ETCHED`)**. Transparent colour ink over mirror foil. Keep
the dodge light dim (a 62% white core) so the ink glows in its own colour
instead of going white; the map's blue channel is the bare-foil streaks,
the red channel the chrome highlights, each its own mask. The silver runs
under the whole card, frame and text box too, so the base layer is masked
by the card alone, not the map (whose green channel dims Mew and the text
box and left them looking printed); fine glitter over it sparkles like the
real card in hand.

**Classic Collection (not in TCG Live)**. One shared stock for every
reprint: dense confetti glitter, sparse puffy stars in flat colours, a gold
border that glitters, fine crosshatch. Two confetti tiles offset and moved
against each other twinkle without animation. Colour-dodged stars must
stay at mid brightness or they turn white.

### Sword & Shield and older (upstream `swsh/`, direct matches)

| Finish | Sheet |
|---|---|
| Regular holo (scanlines + bars) | `regular-holo.css` |
| Reverse holo | `reverse-holo.css` |
| Cosmos holo | `cosmos-holo.css` (ported for promos as `foil-cosmos` in `css/holo/promos.css`, textures in `assets/foil/promo/`) |
| V (holo) | `v-regular.css` |
| V full art, trainer full art | `v-full-art.css`, `trainer-full-art.css` |
| VMAX | `v-max.css` (vmaxbg.jpg texture) |
| VSTAR | `v-star.css` (ancient.png, a masked pointer radial) |
| Rainbow rare | `rainbow-holo.css` |
| Rainbow alt art | `rainbow-alt.css` |
| Gold secret rare | `secret-rare.css` (geometric.png) |
| Radiant | `radiant-holo.css` (crossed 45deg bars) |
| Amazing rare | `amazing-rare.css` |
| Shiny vault | `shiny-rare.css`, `shiny-v.css`, `shiny-vmax.css` |
| Trainer gallery | `trainer-gallery-*.css` |
| Crown Zenith Pikachu | `swsh-pikachu.css` |

### Vintage (no upstream)

Wizards-era holos (Base Set "starlight"), e-Reader, EX-era, and the
Classic Collection reprints. The Base Set holo is a fine field of tiny stars
and swirls over a rainbow that moves in wide vertical bands: a dense glitter
or star tile under a `repeating-linear-gradient(0deg, sunpillar)` at
`200% 700%`, masked to the art window, is the right start. Always work from
photos of the specific card; these vary a lot.

## 4. Primitives

When nothing upstream fits, build from these. Each is one background layer.

| Primitive | CSS | Represents |
|---|---|---|
| Sun pillar | `repeating-linear-gradient(0deg, var(--sunpillar-clr-1) calc(var(--space)*1), ... , var(--sunpillar-clr-1) calc(var(--space)*7))` at `200% 700%`, positioned `0% var(--background-y)` | The vertical rainbow bands of modern holo |
| Diagonal bars | `repeating-linear-gradient(133deg, #0e152e 0%, hsl(180,10%,60%) 3.8%, hsl(180,29%,66%) 4.5%, hsl(180,10%,60%) 5.2%, #0e152e 10%, #0e152e 12%)` at `300% 100%` | The light bars that sweep across full arts |
| Scanlines | 1px `repeating-linear-gradient(90deg, black 0 2px, #666 2px 4px)` | SwSh holo grain |
| Tilt bars | `repeating-linear-gradient(calc(var(--rotate-x) * 0.25), ...)` | Bars that swing as the card turns (151) |
| Pointer radial | `radial-gradient(farthest-corner circle at var(--pointer-x) var(--pointer-y), ...)` | The light source; glare and shading |
| Glitter | `glitter.png` or `iri-*.webp` tiles at 25% or 150px, `--shift` parallax | Sparkle |
| Etch / illusion | per-card etch map, or `illusion.png` at 33% | Embossed texture |
| Motif mask | a shape tile as `mask-image` on a rainbow layer | Poké Balls, energy symbols, stars |
| Galaxy | `cosmos-*-trans.png` stacked, random offset | Cosmos holo |
| Cast-and-cure coat | a tile on `.cure`, masked by `--art` and a pointer radial, `screen` | Clear UV patterns (SouthernCross stars, StitchedRings) that shine over ink as well as foil |
| Direction-binned etch | two layers masked by `--etch-map-h` and `--etch-map-v`, moving differently | Relief cells that flash one at a time |
| Channel mask | one colour channel of a TCG Live map as its own alpha mask | Cards whose map is RGB (the RGB Mews) |
| Per-card seed | `--seed-x/--seed-y` from the card id as a tile offset | Tiled glitter that never lines up the same way on two cards |
