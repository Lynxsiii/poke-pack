#!/usr/bin/env python3
"""Draw the star-field tile of the Wizards reverse promos and the Neo Revelation Shining background.

The foil on a Wizards-era cosmos reverse (basep 34 Entei, 35 Pichu, Best of Game) is a scatter of white discs, dots, plus
signs and a few six-armed snowflakes on a mirror (photos: PSA 9 Entei #34, the 790 px Entei scan, Neo Revelation Shining
Magikarp). The tile is white on transparent, 512 x 512, seamless (every shape is also drawn shifted by one tile), seeded, so
it is a mask: lit by a moving spectrum it is the stars catching the light. About 4 percent of the area is lit, like the photos.

    python3 .claude/skills/card-textures/scripts/make_wotc_stars.py [--out assets/foil/wotc-stars-v1.webp] [--seed 1999]

Never overwrites an existing file. Needs numpy, scipy, Pillow.
"""
import argparse, math, os, sys
import numpy as np
import scipy.ndimage as ndi
from PIL import Image

N = 512
SS = 2


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "assets/foil/wotc-stars-v1.webp"))
    ap.add_argument("--seed", type=int, default=1999)
    a = ap.parse_args()
    out = os.path.abspath(a.out)
    if os.path.exists(out):
        sys.exit(f"{out} exists: never overwrite an asset")
    rng = np.random.default_rng(a.seed)
    M = N * SS
    img = np.zeros((M, M), np.float32)
    yy, xx = np.mgrid[0:M, 0:M].astype(np.float32)

    def stamp(fn, cx, cy, reach):
        for dx in (-M, 0, M):
            for dy in (-M, 0, M):
                x, y = cx + dx, cy + dy
                if x + reach < 0 or x - reach > M or y + reach < 0 or y - reach > M:
                    continue
                x0, x1 = int(max(0, x - reach)), int(min(M, x + reach + 1))
                y0, y1 = int(max(0, y - reach)), int(min(M, y + reach + 1))
                sub = fn(xx[y0:y1, x0:x1] - x, yy[y0:y1, x0:x1] - y)
                img[y0:y1, x0:x1] = np.maximum(img[y0:y1, x0:x1], sub)

    def disc(r, soft, gain):
        return lambda X, Y: np.clip((r + soft - np.hypot(X, Y)) / max(soft, 1e-3), 0, 1) * gain

    def arms(n, L, w, gain, rot):
        def f(X, Y):
            best = np.zeros_like(X)
            for k in range(n):
                t = rot + math.pi * k / n * (2 if n % 2 == 0 and n != 6 else 1) if n != 6 else rot + math.pi * k / 3
                c, s = math.cos(t), math.sin(t)
                u, v = X * c + Y * s, -X * s + Y * c
                best = np.maximum(best, np.clip(1 - np.abs(v) / w, 0, 1) * np.clip(1 - np.abs(u) / L, 0, 1))
            return best * gain
        return f

    for _ in range(950):                                  # fine dots
        x, y = rng.uniform(0, M, 2); r = rng.uniform(0.9, 1.6) * SS * 0.6
        stamp(disc(r, 0.8 * SS, rng.uniform(0.5, 0.9)), x, y, r + 2 * SS)
    for _ in range(95):                                   # discs
        x, y = rng.uniform(0, M, 2); r = rng.uniform(2, 5.5) * SS
        stamp(disc(r, 1.2 * SS, rng.uniform(0.6, 1.0)), x, y, r + 3 * SS)
    for _ in range(12):                                   # big pale discs
        x, y = rng.uniform(0, M, 2); r = rng.uniform(5.5, 8.5) * SS
        stamp(disc(r, 2.5 * SS, rng.uniform(0.4, 0.7)), x, y, r + 4 * SS)
    for _ in range(90):                                   # plus signs
        x, y = rng.uniform(0, M, 2); L = rng.uniform(3.5, 7) * SS
        stamp(arms(2, L, 0.9 * SS, rng.uniform(0.6, 1.0), 0), x, y, L + 2 * SS)
    for _ in range(22):                                   # snowflakes
        x, y = rng.uniform(0, M, 2); L = rng.uniform(5, 9) * SS
        stamp(arms(6, L, 0.9 * SS, rng.uniform(0.6, 1.0), rng.uniform(0, 1)), x, y, L + 2 * SS)
    img = ndi.zoom(ndi.gaussian_filter(img, 0.5 * SS, mode="wrap"), 1 / SS, order=1)
    img = np.clip(img * 1.1, 0, 1)
    rgba = np.zeros((N, N, 4), np.uint8)
    rgba[..., :3] = 255
    rgba[..., 3] = (img * 255).astype(np.uint8)
    Image.fromarray(rgba, "RGBA").save(out, lossless=True)
    print(out, f"lit {float((img > 0.3).mean()) * 100:.1f}%")


if __name__ == "__main__":
    main()
