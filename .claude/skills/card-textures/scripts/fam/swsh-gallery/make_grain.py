#!/usr/bin/env python3
"""The Sword & Shield character rares' sand grain as a seamless tile (holo family swsh-gallery).

Photos (Hisuian Goodra CRZ GG21 lit, Parasect LOR TG01 under a lamp, Octillery BRS TG03; /home/user/holo-refs/
w2-swsh-gallery): a fine, dense, sand-like grain over the foil background, about 1-2 device px at 220 CSS px x3,
no streaks; it rides under the rainbow and shows as white points in dark ink.

Drawn as random round points (radius 0.6-1.1 px at 256 px; the sheet shows the tile at 30% of the card width) on
black, mostly near white, a fifth faintly tinted. Output: opaque RGB on black (a light layer).
  python3 make_grain.py <out.webp> [size=256] [seed=23] [count=9000]
"""
import sys, colorsys
import numpy as np
from PIL import Image

out = sys.argv[1]
N = int(sys.argv[2]) if len(sys.argv) > 2 else 256
rng = np.random.default_rng(int(sys.argv[3]) if len(sys.argv) > 3 else 23)
count = int(sys.argv[4]) if len(sys.argv) > 4 else 9000

img = np.zeros((N, N, 3))
yy, xx = np.mgrid[-3:4, -3:4]
for _ in range(count):
    cx, cy = rng.random(2) * N
    r = rng.uniform(0.6, 1.1)
    # a sand of faint grains (the foil's texture) with one in eight bright (the glints)
    b = rng.uniform(0.7, 1.0) if rng.random() < 0.06 else 0.1 + 0.5 * rng.random() ** 1.6
    if rng.random() < 0.2:
        h = rng.choice([0.58, 0.36, 0.92, 0.12, 0.5, 0.75]) + rng.normal(0, 0.03)
        col = np.array(colorsys.hsv_to_rgb(h % 1, rng.uniform(0.2, 0.4), 1.0))
    else:
        col = np.array([1.0, 1.0, 1.0]) - rng.uniform(0, 0.08, 3)
    ix, iy = int(cx), int(cy)
    fx, fy = cx - ix, cy - iy
    d = np.sqrt((xx - fx) ** 2 + (yy - fy) ** 2)
    w = np.clip(r + 0.5 - d, 0, 1)               # anti-aliased disc
    ys, xs = (iy + yy) % N, (ix + xx) % N
    np.maximum.at(img, (ys, xs), (w[..., None] * col * b))
img = (np.clip(img, 0, 1) * 255).astype(np.uint8)
Image.fromarray(img, "RGB").save(out, "WEBP", lossless=True, quality=100)
print(out, N, "mean", round(float(img.mean()), 1))
