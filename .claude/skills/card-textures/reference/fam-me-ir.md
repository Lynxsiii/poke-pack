# Holo family me-ir: Mega Evolution Illustration Rares (2026-10-22)

Module `js/fam/me-ir.js`, sheet `css/holo/fam/me-ir.css`, maps `assets/foil/fam/me-ir/<id>-map.webp`, generator
`scripts/fam/me-ir/ship_live_maps.py`. Audit: `/home/user/holo-work/w2-me-ir/AUDIT.json`, photos and sources:
`/home/user/holo-refs/w2-me-ir/` (`SOURCES.md`).

## Scope

Every non-reverse face with rarity (after `foilLook()`) "Illustration Rare" and an id `me1-`..`me5-` or `me2pt5-`: the
set IRs of me1, me2, me2pt5, me3, me4, me5 and the ME Black Star promos foiled as IR (stamped `-pc` / `-stamp` prints
included). 145 faces; the census matches the old `foil-ir` + `era-me` group one for one. `me55-` (30th Celebration)
is excluded and keeps celebration.css. The SV, SwSh and SM IRs are other families.

## The real finish (photos)

- TCG Live: SUN_PILLAR / HOLO with a per-card foil map, no etch (every sampled `.etch.png` 404s). The map holds the
  Pokémon, trainer and text at 0, grades the painted background by tone and has the silver border at full.
- WHERE: the Pokémon stays matte (JP M1L 064 Bulbasaur lit; JP M4 084 Chespin; SV Pawmot 209 on the same foil). High
  confidence.
- PATTERN: broad, smooth diagonal rainbow sweeps, one spectrum about a third of the card, one to three parallel bands
  with clear gaps; no streaks, no hatch, no etch (Bulbasaur zoom, Pawmot, Ralts 211).
- COLOUR: saturated over dark ink (Bulbasaur's black ground goes violet-blue and rainbow), a soft pastel tint on pale
  grounds (Chespin's light rays, Tangela's cream); the art keeps its own colours.
- TEXTURE: a fine isotropic sand sparkle under the rainbow, noticed second.
- STRENGTH: under flat light nearly plain print; a card whose map is mostly black (Erika's Tangela) stays subdued lit.

## What the site did (before) and what changed

Before: celebration.css's shared `.foil-ir.has-foil-map` recipe, and 128 of 145 faces on the all-white fallback map
(`assets/foil/maps/full.webp`). The foil covered the Pokémon and text; the colour-dodged 5% vertical sun-pillar stack
and the 128 px grain stretched to `140px 100%` drew vertical rain streaks, and the overlay glare made a milky white band
over pale art.

1. Maps: `ship_live_maps.py` fetches TCG Live's `_std.foil.png` for every face the data gives no `foilMap` (128: 101
   set cards from me1/me2/me2-5/me3/me4/me5, 27 promos from mebsp), converts it like `fetch_foil_maps.py --ship`
   (alpha = luminance, the 22/255 floor stretched to 0, 367 x 512) and writes `<id>-map.webp` (new names). The module
   sets `--foil-map` to it (`LIVE_MAP`); the 17 faces whose data already carries a map (the stamp knockouts
   `mepNNN-pc-v2.webp` included) keep theirs. No data file changed.
2. `.foil`: a neutral 50% grey with a repeating 133deg rainbow (period 28% of the gradient line, the spectrum about 10%
   of it with soft ends, transparent gaps: one to two bands on the card, about a third of the background coloured), `background-size: 250%`, hard-light onto the print. Band colours are light (lightness
   about 75%, every channel near or above 0.5), so the hard-light only lifts: dark ink lights up in vivid colour, pale
   ink takes a pastel tint and never goes milky or darker. `--mir-a` (0.56, raised by `max(1, --foil-strength)` for the
   "intense" setting, capped at 0.84) is the band's strength. First tries at 68% lightness and alpha 0.62-0.72
   painted Spewpa's grey pavement as a saturated sticker stripe; a period of 25% with a 12% spectrum covered half the
   background in rainbow on the contact sheets. Rest: opacity 0.17 x
   `--foil-strength`, saturate 0.75.
3. `.foil::before`: the sand, `glitter-fine.webp` over `glitter-flecks.webp` at 70% / 50% of the card (about 1 CSS px
   specks at 220 px), screened, opacity 0.22, brightest under the pointer. Never multiply / overlay / difference.
4. `.foil::after` and `.glare::after`: off. `.glare`: a soft white pool at the pointer (0.5 alpha to clear by 45%),
   soft-light at 0.5 x card opacity, masked by the art and the foil map, with no dark end.
5. Rainbow speed: k 2.5 / 1.6 on `--background-x/y`; `rainbow_speed.py` reads 0.66 cycles per sweep. The band
   tracks the light: at 30:25 it crosses the upper left (as the Bulbasaur photo), at 75:65 the lower right.

Result (2026-10-22, WebKit 220 px x 3): every sample's Pokémon is matte, no white band, no streaks, sand fine and
isotropic at native pixels; pale cards (me1 145, me2 98, me3 91, me3 94, me5 88) take a pastel band and never go milky.
Gates: dark_specks 0 on 20 picks over six sets, foil_coverage silent, rainbow_speed clean, no asset overwritten.
Open: Spewpa's band over its mid-grey pavement is more vivid than the one Indonesian product image (Pawmot and Ralts,
same foil, are that vivid); Live's maps light a few pupil glints (Tangela, Bulbasaur), kept as Live has them.

## Verify

```
W=/home/user/holo-work/fix-me-ir
WEBKIT=1 /home/user/holo-tools/render-slot.sh node .claude/skills/card-textures/scripts/foil_probe.mjs \
  --query "set=me1&cards=133&proof=off&w=220&poses=rest,30:25,75:65,50:78" --width 320 --scale 3 --browser webkit --boxes --out $W/x.png
```
Samples: me1 133 Bulbasaur (dark ground, should light up), me2 95 Ludicolo (subdued), me2pt5 218 Erika's Tangela
(mostly plain print), me3 89 Spewpa (pale pavement: pastel), me4 87 Chespin (soft rainbow on the light rays), me5 85
Fomantis; pale cards me1 145, me3 91, me3 94, me5 88, me2 98; stamped me1 mep009-pc, me2 mep022-pc.
