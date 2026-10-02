#!/usr/bin/env python3
"""bw-reverse: the mottled mirror of Black & White's own reverse holo (bw1, "plain mirror").

Draws: assets/foil/fam/bw-reverse/mirror-mottle.webp, a 184x256 greyscale (stored RGB) card-sized map, drawn ONCE over the card
       (never repeated, so it has no tile), soft cloud-like blotches stretched vertically plus a few wide pale vertical bands.
From:  the real bw1 reverses (Collexy scans of Emboar 20, Blitzle 40, Lillipup 81 in /mnt/project-files/every-era/bw/texture-refs/g1/):
       the body carries soft vertical mottle, pale silvery bands 15-30% of the card wide with darker cloudy gaps and colour tints.
Seeded (SEED below); re-run gives the same file. Values run 0.30 (cloud) .. 1.0 (bright band); the site multiplies it with a moving
rainbow band and colour-dodges the product (css/holo/fam/bw-reverse.css).
"""
import numpy as np
from pathlib import Path
from PIL import Image
from scipy.ndimage import gaussian_filter

SEED = 1107
ROOT = Path(__file__).resolve().parents[6]
W, H = 184, 256
rng = np.random.default_rng(SEED)

def field(sy, sx):
    f = gaussian_filter(rng.standard_normal((H, W)), (sy, sx), mode="wrap")
    return (f - f.mean()) / f.std()

n1 = field(34, 7)      # big vertical clouds
n2 = field(15, 3.2)    # finer vertical mottle
n3 = field(6, 2.0)     # faint grain of the foil
x = np.linspace(0, 1, W)[None, :] * np.ones((H, 1))
bands = 0.5 + 0.5 * np.sin(2 * np.pi * (x * 2.1 + 0.15 + 0.16 * n1))   # wide vertical bands, wobbled by the clouds
m = 0.50 * n1 + 0.30 * n2 + 0.06 * n3 + 0.95 * (bands - 0.5)
lo, hi = np.percentile(m, 3), np.percentile(m, 97)
m = np.clip((m - lo) / (hi - lo), 0, 1)
m = m * m * (3 - 2 * m)                       # smoothstep: clouds and bands read, no hard edge
m = 0.30 + 0.70 * m
img = Image.fromarray(np.round(m * 255).astype(np.uint8), "L").convert("RGB")
out = ROOT / "assets/foil/fam/bw-reverse/mirror-mottle.webp"
img.save(out, lossless=True, method=4)
print(out, out.stat().st_size, "bytes; mean", round(float(m.mean()), 3))
