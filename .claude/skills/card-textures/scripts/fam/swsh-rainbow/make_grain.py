#!/usr/bin/env python3
"""The Sword & Shield Rainbow Rare's glitter grain as a seamless tile (holo family swsh-rainbow).

Photos (Alcremie VMAX SHF 073 lit, Leafeon VMAX EVS 204 on wood, Mewtwo VSTAR PGO 079 flat, Charizard VMAX CPA 074 in a
toploader; /home/user/holo-refs/w2-swsh-rainbow): coarse, dense, round glitter points, each about 0.25-0.3 mm (about
1 CSS px on a 220 px card), mostly silver-white with neighbours tinted blue, green, pink and gold; random brightness,
no pitch, no streaks.

Drawn as random round points (radius 0.7-1.4 px at 256 px, the sheet shows the tile at 40% of the card width, so a
grain is about 1 CSS px) on black, each with its own colour: half near white, half tinted from a spectrum at
moderate saturation. Output: opaque RGB on black (a light layer for screen / colour-dodge).
  python3 make_grain.py <out.webp> [size=256] [seed=11] [count=6500]
"""
import sys, colorsys
import numpy as np
from PIL import Image

out = sys.argv[1]
N = int(sys.argv[2]) if len(sys.argv) > 2 else 256
rng = np.random.default_rng(int(sys.argv[3]) if len(sys.argv) > 3 else 11)
count = int(sys.argv[4]) if len(sys.argv) > 4 else 6500

img = np.zeros((N, N, 3))
yy, xx = np.mgrid[-3:4, -3:4]
for _ in range(count):
    cx, cy = rng.random(2) * N
    r = rng.uniform(0.7, 1.4)
    # a sand of faint grains (the foil's texture) with one in eight bright (the glints)
    b = rng.uniform(0.8, 1.0) if rng.random() < 0.12 else 0.14 + 0.6 * rng.random() ** 1.5
    if rng.random() < 0.5:
        h = rng.choice([0.58, 0.36, 0.92, 0.12, 0.5, 0.75]) + rng.normal(0, 0.03)
        col = np.array(colorsys.hsv_to_rgb(h % 1, rng.uniform(0.35, 0.65), 1.0))
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
