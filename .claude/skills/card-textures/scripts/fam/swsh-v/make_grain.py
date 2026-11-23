#!/usr/bin/env python3
"""The regular Sword & Shield V's brushed sparkle foil as a seamless tile (holo family swsh-v).

Photos (Flying Pikachu V CEL 006 tilted, Pikachu V VIV 043 in a toploader, Charizard V DAA 019): the foil behind the
Pokemon is a very fine pinpoint sparkle drawn out into short streaks along one diagonal rising to the right (about 58
degrees from horizontal), random brightness, no regular pitch. Drawn as random points convolved (circularly, so the
tile is seamless) with a Gaussian stretched along that diagonal, then pushed so most grains are faint and a few bright.

Output: white RGB, the grain in alpha (usable as a mask or, over black, as a light layer).
  python3 make_grain.py <out.webp> [size=384] [seed=7]
"""
import sys
import numpy as np
from PIL import Image

out = sys.argv[1]
N = int(sys.argv[2]) if len(sys.argv) > 2 else 384
rng = np.random.default_rng(int(sys.argv[3]) if len(sys.argv) > 3 else 7)

pts = np.zeros((N, N))
count = int(N * N * 0.045)
ys, xs = rng.integers(0, N, count), rng.integers(0, N, count)
pts[ys, xs] = rng.random(count) ** 2.2  # most grains faint, a few bright

# Gaussian stretched along the streak axis: rising to the right at 58 deg (image y points down)
ang = np.deg2rad(58.0)
u = np.array([np.cos(ang), -np.sin(ang)])          # along the streak
v = np.array([np.sin(ang), np.cos(ang)])           # across it
yy, xx = np.mgrid[0:N, 0:N]
dx = ((xx + N // 2) % N) - N // 2
dy = ((yy + N // 2) % N) - N // 2
a = dx * u[0] + dy * u[1]
c = dx * v[0] + dy * v[1]
kern = np.exp(-0.5 * ((a / 4.2) ** 2 + (c / 0.75) ** 2))
kern /= kern.max()
g = np.real(np.fft.ifft2(np.fft.fft2(pts) * np.fft.fft2(kern)))
g = np.clip(g / np.percentile(g, 99.7), 0, 1) ** 1.15
alpha = (g * 255).astype(np.uint8)
rgba = np.dstack([np.full((N, N), 255, np.uint8)] * 3 + [alpha])
Image.fromarray(rgba, "RGBA").save(out, "WEBP", lossless=True, quality=100)
print(out, N, "mean alpha", round(float(alpha.mean()), 1))
