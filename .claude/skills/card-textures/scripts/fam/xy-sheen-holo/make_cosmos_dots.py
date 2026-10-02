#!/usr/bin/env python3
"""xy-sheen-holo: the Cosmos dot field as ONE smooth alpha texture (no pixel specks).

Real XY Cosmos promos (Pangoro XY50, Celebi XY187, Mew XY192 frames) carry round soft dots of several sizes
(planets 1-1.4% of the card width, mid dots, fine specks) that light up one colour each. The era's cosmos-*-trans.webp
textures hold 1-3 px square specks, which a 200% mask turned into chunky blocks (review #1). This draws the dots as
smooth radial profiles (soft disc + halo for planets, gaussians for specks) on an 800 x 1120 card-shaped canvas, so the
sheet masks it at 100% (never magnified into squares) and no tile repeats. Seeded; re-run: python3 make_cosmos_dots.py
Output: assets/foil/fam/xy-sheen-holo/cosmos-dots-v1.webp (white RGB, the dots as alpha, lossless).
"""
import numpy as np
from PIL import Image

W, H = 800, 1120
rng = np.random.default_rng(20261002)
A = np.zeros((H, W), np.float32)

# a few loose clusters (a galaxy field is not uniform noise)
clusters = np.array([[0.22, 0.30], [0.70, 0.22], [0.50, 0.46], [0.78, 0.40], [0.30, 0.44]]) * [W, H]

def place(n, rmin, rmax, kind):
    placed = []
    tries = 0
    while len(placed) < n and tries < n * 60:
        tries += 1
        if rng.random() < 0.5:
            x, y = rng.uniform(0.04 * W, 0.96 * W), rng.uniform(0.07 * H, 0.52 * H)
        else:
            c = clusters[rng.integers(len(clusters))]
            x, y = rng.normal(c[0], 0.13 * W), rng.normal(c[1], 0.07 * H)
        if not (0.03 * W < x < 0.97 * W and 0.06 * H < y < 0.55 * H):
            continue
        r = rng.uniform(rmin, rmax)
        if all((x - px) ** 2 + (y - py) ** 2 > (1.6 * r + 1.6 * pr) ** 2 for px, py, pr in placed_all):
            placed.append((x, y, r))
            placed_all.append((x, y, r))
    return placed

placed_all = []
def stamp(x, y, r, kind, gain):
    reach = int(r * (3.2 if kind == "planet" else 2.4 if kind == "mid" else 3.0)) + 2
    x0, x1 = max(0, int(x) - reach), min(W, int(x) + reach + 1)
    y0, y1 = max(0, int(y) - reach), min(H, int(y) + reach + 1)
    yy, xx = np.mgrid[y0:y1, x0:x1]
    d = np.hypot(xx - x, yy - y) / r
    if kind == "planet":
        core = np.clip((1.0 - d) / 0.35, 0, 1) ** 1.5 if False else np.clip((1.0 - d) / 0.45, 0, 1)
        core = core * core * (3 - 2 * core)
        halo = 0.30 * np.exp(-(d / 1.7) ** 2)
        a = np.maximum(core, halo)
    elif kind == "mid":
        core = np.clip((1.0 - d) / 0.6, 0, 1)
        core = core * core * (3 - 2 * core)
        a = np.maximum(core, 0.18 * np.exp(-(d / 1.5) ** 2))
    else:
        a = np.exp(-(d / 0.75) ** 2)
    A[y0:y1, x0:x1] = np.maximum(A[y0:y1, x0:x1], (a * gain).astype(np.float32))

for kind, n, rmin, rmax in (("planet", 16, 7.0, 11.5), ("mid", 70, 3.2, 5.2), ("speck", 240, 1.1, 2.0)):
    for x, y, r in place(n, rmin, rmax, kind):
        stamp(x, y, r, kind, rng.uniform(0.62, 1.0) if kind != "speck" else rng.uniform(0.5, 0.95))

# cover the art window region only a little beyond: the sheet intersects this with the card's own foil map
rgba = np.dstack([np.full((H, W, 3), 255, np.uint8), np.clip(A * 255, 0, 255).astype(np.uint8)])
out = "/home/user/poke-pack/assets/foil/fam/xy-sheen-holo/cosmos-dots-v1.webp"
Image.fromarray(rgba, "RGBA").save(out, lossless=True, quality=100, method=6)
import os
print(out, os.path.getsize(out) // 1024, "KB; dots:", sum(1 for _ in placed_all))
