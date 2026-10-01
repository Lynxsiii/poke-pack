# Diamond & Pearl generation (dp1 to dp7, pl1 to pl4, hgss1 to hgss4, col1, dpp, hsp, pop6-9, kits)

Built on 2026-10-01 by the "Every era, every set" thread: one lead, five set
builders (d1 to d5), three finish agents (h1 to h3) and a fresh-context
reviewer per family (rv-h1 to rv-h3). Covers Diamond & Pearl, Platinum,
HeartGold & SoulSilver and Call of Legends. Era overview; set and family
notes are linked at the end.

## Shape of the era

| Piece | Where |
|---|---|
| Era plumbing (`isDp`, `dpPattern`, `dpFrame`, `dpLayout`, `dpWindow`, `dpMap`, `dpSpecialMap`, `dpEtched`, `legendHalf`, `isAlph`, `dpReverseFinish`, `dpReverseExtras`) | `js/dp-foil.js` (hooked into `js/foil-maps.js`) |
| Three finish sheets, keyed by `era-dp` x5 | `css/holo/dp.css` (cosmos holo, Mirror reverse, Crosshatch Energy, plain glare), `dp-special.css` (LV.X, Prime, LEGEND), `dp-secret.css` (Shining, Rotom, Arceus AR, Shiny Legendary, Alph Lithograph, secrets) |
| Pack slots | `dpSlots({...})` in `js/catalog.js` (10 cards: 5 Commons, 3 Uncommons, a Mirror reverse, a rare slot; own basic Energy on the commons sheet) |
| Masks | **TCG Live published no foil maps for 2007-2011**, so every mask is drawn: window masks `assets/foil/dp-win/<frame>-<layout>.webp` measured from the per-pixel std of the scans (`scripts/make_dp_window_masks.py`; frames `dp` and `hgss`, layouts basic, stage, trainer, senergy), the SP portrait cut `dp-basic-sp.webp` (`make_dp_sp_mask.py`), LV.X / Prime / LEGEND masks `assets/foil/dp-special/` (`make_dp_special_masks.py`, `-v2` after the review) |
| Tiles | `assets/foil/dp-cosmos-v1.webp` (`make_dp_cosmos.py`), `dp-cracked-ice-v1.webp` (`make_dp_cracked_ice.py`) |
| Research, photos, sheets | `/mnt/project-files/every-era/dp/research/`, `texture-refs/<family>/SOURCES.txt`, `finish-sheets/<family>/` |

## Finish families

- **Cosmos Rare Holo** in the art window only (dot-matrix galaxy, one colour
  per element sweeping with the tilt); the scans already carry the printed
  dots, so the foil adds light, not structure.
- **Mirror reverse** on every non-holo: everything but the window and border,
  vertical spectrum stripes, multiplied so ink stays black.
- **Crosshatch** on the Call of Legends Energy (88-95) only.
- **LV.X** confetti on the frame, **Prime** a normal-blend pearl paint over
  the near-white frame, **LEGEND** halves joined across the pair.
- **Shining, Rotom shards, Arceus rings, Shiny Legendary silver border, Alph
  Lithograph (textured stone, not holo), secrets**.

## What the independent reviews caught

- **Frames, not sets, decide the window**: the HGSS window is taller and sits
  lower; promos carry their home set's id, so `dpFrame` reads the id prefix.
  A mask built from what the cards share misses what varies per card (the
  Prime HP digit, the SP portrait): measure the mask outline on real scans
  of every frame variant.
- **Screen cannot colour a near-white scan.** The Prime frame bleached to
  white when lit; it is a normal-blend translucent paint now. Likewise
  screening flecks onto a cream border changed nothing (Shiny Legendary):
  multiply a cool ramp and screen the flecks into the same background.
- **Multiply, not colour-dodge, for a mirror over ink**: dodge made the text
  box white and the attack text vanished.
- **Crosshatch as a union of lines needs `lighten` between line sets**, soft
  ribbons at 3.4% pitch, never hairlines (they alias into a screen in
  WebKit); rainbow under them at 5% or the Energy symbol tints.
- **The scans bake the foil in** (Rotom shards, Arceus rings, Shining
  stripes): anything drawn on top doubles it. Look at the scan with
  `.foil, .glare` hidden first, and measure foil-minus-bare per zone.
- **Gold ink takes no sheen**: cut the name box out of the frame alpha and
  gleam it with overlay or soft-light.
- **Pointer pools veil dark windows** (+45..80 levels made Azelf grey-blue):
  pool under 0.3 alpha, band halved; the window should gain about +20..30.
- **`sweep_finishes.py`'s "window holo promo with no foil map" check skips
  this era**; the drawn window is the map. The blue-pixel WebKit heuristic
  can read a smooth cyan band core as a speck; `dark_specks.py` is the gate.
- Open: Time-Space Distortion's border glitter is not drawn; the Classic
  Collection reprints of these frames carry no `era: dp` and never reach
  `dpSpecialMap`.

## Sets, oldest first

[dp1](dp-dp1.md) Diamond & Pearl, [dp2](dp-dp2.md) Mysterious Treasures,
[dp3](dp-dp3.md) Secret Wonders, [dp4](dp-dp4.md) Great Encounters,
[dp5](dp-dp5.md) Majestic Dawn, [dp6](dp-dp6.md) Legends Awakened,
[dp7](dp-dp7.md) Stormfront, [pl1](dp-pl1.md) Platinum, [pl2](dp-pl2.md)
Rising Rivals, [pl3](dp-pl3.md) Supreme Victors, [pl4](dp-pl4.md) Arceus,
[hgss1](dp-hgss1.md) HeartGold & SoulSilver, [hgss2](dp-hgss2.md) Unleashed,
[hgss3](dp-hgss3.md) Undaunted, [hgss4](dp-hgss4.md) Triumphant,
[col1](dp-col1.md) Call of Legends, [dpp, hsp, POP Series 6-9 and the
Trainer Kits](dp-promos-pop-kits.md).

Finish notes: [dp-holo-reverse.md](dp-holo-reverse.md),
[dp-lvx-prime-legend.md](dp-lvx-prime-legend.md), [dp-secret.md](dp-secret.md).
