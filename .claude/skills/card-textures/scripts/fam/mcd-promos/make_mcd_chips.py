#!/usr/bin/env python3
"""McDonald's Collection 2011 and 2012 (BW frame): the shared confetti chip tile (fix round of 2026-10-22).

The real chips (in-hand photos of Zorua mcd11-9, Alomomola mcd11-5, Dewott mcd12-5, Servine mcd12-1, Purrloin mcd12-9; see
reference/fam-mcd-promos.md): compact irregular polygons about 1.5-2% of the card wide, edge to edge over the art-window background,
each chip flashing its OWN colour (gold-yellow, white-silver, cyan, blue, green, orange, pink side by side), independent of the art's
tint; most lit chips are warm gold and white. A chip lights at its own angle and is dark at others.

The tile is a periodic Voronoi mosaic (two Lloyd steps: equant, irregular polygons), 1 px dark gap between chips. Each chip has a
phase p (the tilt at which it lights) and a colour class; its three channels hold the level at which that channel lights:
  lit channel  = p + a small offset (0 = full at the peak; 0.03-0.045 = that channel partly lit, which tints the chip)
  off channel  = 0 (never matches the ramp, so the chip never shows that primary)
The CSS (css/holo/fam/mcd-promos.css, `.mcd-bw`) blends the tile with a grey triangle ramp (#333..#ccc, levels 0.2..0.8) through
`difference`, inverts and crushes it: only the channels whose level is within a few percent of the ramp light, so each chip flashes
in its own colour when the ramp passes its phase. Phases are drawn from 0.24..0.76 so every chip lights somewhere in the ramp.

    python3 make_mcd_chips.py            -> assets/foil/fam/mcd-promos/chips-bw-v3.png and chips-bw-warm-v3.png (lossless, 192 x 192)

Two palettes on the same chips: the full one (dark and blue art: Zorua, Dewott, Alomomola light every colour side by side) and a warm
one for pale or green art (Snivy, Servine, Purrloin: the photos show warm gold and white chips, no blue). make_mcd_bw_v2.py picks
the warm tile by the window's mean luma (js/fam/mcd-promos.js WARM table).

Deterministic (seeded). Needs numpy, scipy, Pillow.
"""
import os

import numpy as np
from PIL import Image
from scipy.spatial import cKDTree

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), *[".."] * 6))
OUT = os.path.join(ROOT, "assets/foil/fam/mcd-promos/chips-bw-v3.png")
OUT_WARM = os.path.join(ROOT, "assets/foil/fam/mcd-promos/chips-bw-warm-v3.png")
SIZE = 192          # tile px; the CSS shows it at 32% of the card wide, so a tile px is ~1.1 device px at 220 CSS px x3
CELL = 10.5         # mean chip pitch in tile px: ~1.75% of the card wide
OFF = None
# colour classes: (weight, (dR, dG, dB)); None = channel off. Gold and white lead (the pale and green art), the rest side by side.
# Round 2 (review of 2026-10-22: lit chips read as a pale silver-pastel mosaic; the real Zorua shows saturated green, cyan, orange and
# pink chips side by side, the 2012 cards sparse gold and white): fewer white chips in the full palette, more of every colour.
CLASSES = [
    (0.12, (0.0, 0.0, 0.0)),        # white-silver
    (0.16, (0.0, 0.012, OFF)),      # gold
    (0.08, (0.0, 0.035, OFF)),      # deep gold
    (0.08, (0.0, 0.045, OFF)),      # orange
    (0.12, (OFF, 0.0, 0.045)),      # green
    (0.05, (0.04, 0.0, OFF)),       # yellow-green
    (0.12, (OFF, 0.0, 0.0)),        # cyan
    (0.10, (OFF, 0.04, 0.0)),       # blue
    (0.10, (0.0, 0.045, 0.02)),     # pink
    (0.07, (0.035, OFF, 0.0)),      # violet
]
WARM = [
    (0.28, (0.0, 0.0, 0.0)),        # white-silver
    (0.32, (0.0, 0.012, OFF)),      # gold
    (0.14, (0.0, 0.035, OFF)),      # deep gold
    (0.07, (0.0, 0.045, OFF)),      # orange
    (0.09, (0.04, 0.0, OFF)),       # yellow-green
    (0.06, (OFF, 0.0, 0.045)),      # green
    (0.04, (0.0, 0.045, 0.02)),     # pink
]


def periodic_voronoi(rng, n):
    pts = rng.uniform(0, SIZE, (n, 2))
    offs = np.array([(dx, dy) for dx in (-SIZE, 0, SIZE) for dy in (-SIZE, 0, SIZE)], np.float64)
    ys, xs = np.mgrid[0:SIZE, 0:SIZE]
    pix = np.stack([xs.ravel() + 0.5, ys.ravel() + 0.5], 1)
    for _ in range(2):  # Lloyd: compact cells, still irregular
        tree = cKDTree((pts[None] + offs[:, None]).reshape(-1, 2))
        _, idx = tree.query(pix, k=1)
        own = idx % n
        rel = pix - pts[own]
        rel = (rel + SIZE / 2) % SIZE - SIZE / 2  # wrap
        cnt = np.bincount(own, minlength=n).astype(np.float64)
        sx = np.bincount(own, weights=rel[:, 0], minlength=n)
        sy = np.bincount(own, weights=rel[:, 1], minlength=n)
        ok = cnt > 0
        pts[ok, 0] = (pts[ok, 0] + sx[ok] / cnt[ok]) % SIZE
        pts[ok, 1] = (pts[ok, 1] + sy[ok] / cnt[ok]) % SIZE
    tree = cKDTree((pts[None] + offs[:, None]).reshape(-1, 2))
    d, idx = tree.query(pix, k=2)
    own = (idx[:, 0] % n).reshape(SIZE, SIZE)
    gap = ((d[:, 1] - d[:, 0]) < 0.9).reshape(SIZE, SIZE)  # ~1 px seam between neighbours
    return own, gap


def tile(classes, own, gap, n, seed):
    rng = np.random.default_rng(seed)
    w = np.array([c[0] for c in classes])
    cls = rng.choice(len(classes), n, p=w / w.sum())
    phase = np.random.default_rng(20261022 + 1).uniform(0.24, 0.76, n)  # same phases in both palettes
    lev = np.zeros((n, 3))
    for i in range(n):
        for ch, dl in enumerate(classes[cls[i]][1]):
            lev[i, ch] = 0.0 if dl is None else np.clip(phase[i] + dl * (1 if rng.random() < 0.5 else -1), 0.2, 0.8)
    img = lev[own]
    img[gap] = 0
    return img


def main():
    rng = np.random.default_rng(20261022)
    n = int(SIZE * SIZE / (CELL * CELL))
    own, gap = periodic_voronoi(rng, n)
    for out, classes, seed in ((OUT, CLASSES, 7), (OUT_WARM, WARM, 8)):
        Image.fromarray((tile(classes, own, gap, n, seed) * 255 + 0.5).astype(np.uint8), "RGB").save(out, optimize=True)
        print(out, n, "chips", os.path.getsize(out), "bytes")


if __name__ == "__main__":
    main()
