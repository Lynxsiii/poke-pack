# XY era (xy0 to xy12, dc1, g1, xyp, mcd14-16, xytk6a to xytk9b)

Built on 2026-10-01 by the "Every era, every set" thread: one lead, six set
builders (b1 to b6), three finish agents (f1 to f3) and a fresh-context
reviewer per finish family (rv-f1 to rv-f3) before the merge. This is the era
overview; every set and finish family has a note of its own, linked at the
end. Read this first, then the set or family note you need.

## Shape of the era

| Piece | Where |
|---|---|
| Era plumbing (`isXy`, `xyPattern`, `xyMap`, `xyHoloMap`, `xyFullArtMap`, `xyExSafeMap`, `xyReverseFinish`, `xyReverseExtras`) | `js/xy-foil.js` (hooked into `js/foil-maps.js`) |
| Three finish sheets, keyed by `era-xy` with repeated-class specificity | `css/holo/xy.css` (Sheen holo, Starlight, reverse, plain glare), `xy-ex.css` (Pokémon-EX, Mega EX, BREAK, Double Crisis), `xy-fullart.css` (full arts, Supporters, gold secrets, Items, shiny AO, Dialga silver, Radiant Collection) |
| Pack slots | `xySlots({...})` in `js/catalog.js` (10 cards: 5 Commons, 3 Uncommons, a reverse, a rare slot, no Energy slot; `commonEnergy` where the basic Energy sit on the commons sheet; `radiant`/`rcSlots` for Generations) |
| Foil maps | TCG Live publishes per-card maps for every XY set (`assets/foil/maps/<set>/`); drawn window masks `assets/foil/xy-win/` (`make_xy_window_masks.py`) for the mapless promos, kits and McDonald's; per-frame median "safe" maps `assets/foil/xy-safe-*-v1.webp`, `xy-ex-safe-*-v1.webp` (`make_xy_safe_maps.py`, `make_xy_ex_safe_maps.py`) for `foilAs` reprints |
| Reverse tiles | `assets/foil/xy-reverse/<type>.webp` (`make_xy_reverse.py`, from TCG Live's `_ph.foil.png` reverse maps) |
| Research | `/mnt/project-files/every-era/xy/research/` (per set, `xyp-claims.md`, `second-source-check.md`) |
| Photos and sheets | `/mnt/project-files/every-era/xy/texture-refs/<family>/SOURCES.txt`, `finish-sheets/<family>/` |

## Finish families

- **Sheen Rare Holo**, not cosmos: broad saturated rainbow bands on a rising
  diagonal with dark gaps, over the art background, Pokémon matte where the
  map says so. **Starlight** on the 13 Evolutions (xy12) reprints only.
- **Reverse**: whole body but the window, mottled mirror with ghosted type
  symbols (Poké Balls on Trainers), one tile per type.
- **EX / Mega EX / BREAK**: textured bars on the frame, name tab and strips
  from the real map; BREAK's gold mosaic (`xy-mosaic.webp`).
- **Full arts, Supporters, secrets, Items, RC**: per-card Live etch where it
  exists, smooth foil where Live ships none (the Mega secrets).

## What the independent reviews caught

- **The era gate must exclude the era's own promos.** `xyFullArtFrame`
  returned nothing for any card with `foilAs`, but the XY promos filed under
  their home set are `era: "xy"` with `foilAs: "Rare Ultra"`: about 32 of
  them painted over the rules text. Gate on `era !== "xy"`, never on the
  presence of `foilAs`. The same class of bug: `isEvolutions` matched every
  `xy12-` id, so the xy12 promos drew Starlight.
- **A reprint with no map must take a median map, not a loud fallback.**
  66 `foilAs` EX and BREAK reprints fell to the bar recipe unmasked. The
  per-frame median of the real maps (`xyExSafeMap`) is the answer.
- **Colour-dodge cannot brighten white.** Starlight read as nothing on
  Chansey and Mew's sky; a multiplied pastel wash through the same mask
  fixed it. Screen lifts gold to white (the EX lettering, the Mega rule
  strip's black ink): use overlay there.
- **`clamp()` in `mask-position` mis-paints in Chromium** even though
  getComputedStyle reports the right number; keep positions inside 0..100%
  with plain `calc()`. Both `-webkit-mask-position` and `mask-position` are
  needed.
- **An undefined variable in a mask list drops the whole declaration**
  (`--xy-win` on the Energy reverse): the glare went unmasked.
- **The shared engraving tile as a line screen**: prints with no etch map
  took `sir-etch` as one regular hatch; hide it on `has-etch-tile` without
  `has-etch-map` and ship them smooth.
- **Metal commons' diagonal hatch is the printed frame**, not foil; judge
  against the scan with `.foil, .glare` hidden.

## Sets, oldest first

[xy0](xy-xy0.md) Kalos Starter Set, [xy1](xy-xy1.md) XY,
[xy2](xy-xy2.md) Flashfire, [xy3](xy-xy3.md) Furious Fists,
[xy4](xy-xy4.md) Phantom Forces, [xy5](xy-xy5.md) Primal Clash,
[dc1](xy-dc1.md) Double Crisis, [xy6](xy-xy6.md) Roaring Skies,
[xy7](xy-xy7.md) Ancient Origins, [xy8](xy-xy8.md) BREAKthrough,
[xy9](xy-xy9.md) BREAKpoint, [g1](xy-g1.md) Generations (with the Radiant
Collection), [xy10](xy-xy10.md) Fates Collide, [xy11](xy-xy11.md) Steam
Siege, [xy12](xy-xy12.md) Evolutions, [xyp, McDonald's 2014 to 2016 and the
Trainer Kits](xy-b6-promos-mcd-kits.md).

Finish notes: [xy-holo-reverse.md](xy-holo-reverse.md),
[xy-ex.md](xy-ex.md), [xy-fullart.md](xy-fullart.md).
