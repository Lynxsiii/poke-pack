#!/usr/bin/env python3
"""Draw the grain of the e-Card reverse foil: a seamless sand of fine, vertically elongated flecks.

Family wotc-expedition. The real e-Card reverse foil is not a smooth mirror: at native resolution (Skyridge Seel 94 CGC 10,
/mnt/project-files/holo-remaster/wotc-expedition/refs/ef_seel94_skyridge_reverse_cgc10.jpg) the lit text box and border
break into a fine granular sand of short vertical dashes, about 0.2-0.4 % of the card's width across and two to three times
as tall, loosely gathered into short vertical runs (the "crinkle"); under diffuse light the same grain reads as a sand under
the ink (Golem 14 PSA flat scan). No pattern, no direction but up-and-down, no repeat the eye can find.

Two tiles from one seeded noise field, so the sparkle sits on the sand:
  rev-sand-v1.webp     dense, soft: grey 0..140 (SAND_PEAK 0.55), mean about 0.15. Screened into the resting multiply tint
                       (a fleck is a spot the tint darkens less, so the grain only ever adds light).
  rev-sparkle-v1.webp  sparse, crisp: the brightest flecks of the same field (about 6 % of the area), black between them.
                       Multiplied into the lit colour-dodge gain, so the light breaks into flecks.

Both are 512 x 512, periodic (filtered in the Fourier domain, so the tile wraps with no seam), meant to be drawn at about
one card width per tile (512 px of tile per 600 px of scan, close to the scan's own resolution).

    python3 .claude/skills/card-textures/scripts/fam/wotc-expedition/make_rev_grain.py [--seed 2002] [--preview out.png]

Output: assets/foil/fam/wotc-expedition/rev-sand-v1.webp, rev-sparkle-v1.webp (grey RGB, opaque).
"""
import argparse
import os

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", "..", "..", ".."))
OUT = os.path.join(ROOT, "assets", "foil", "fam", "wotc-expedition")
N = 512

# fleck shape (tile px): narrow and tall
FLECK_SX, FLECK_SY = 0.6, 1.05
# the runs that gather flecks: a soft vertical field
RUN_SX, RUN_SY = 2.2, 9.0
RUN_GAIN = 0.35          # how much the runs modulate the fleck density
SPARKLE_SHARE = 0.05     # share of the tile that sparkles
SAND_MEAN = 0.30
SAND_PEAK = 0.55         # the sand is screened at full strength into the tint: its brightest fleck lifts 55 % of the way


def periodic_gauss(noise, sx, sy):
    """Gaussian blur of a periodic field, done in the Fourier domain so the result tiles."""
    fy = np.fft.fftfreq(noise.shape[0])[:, None]
    fx = np.fft.fftfreq(noise.shape[1])[None, :]
    kernel = np.exp(-2 * (np.pi ** 2) * ((fx * sx) ** 2 + (fy * sy) ** 2))
    return np.real(np.fft.ifft2(np.fft.fft2(noise) * kernel))


def norm(a):
    a = a - a.mean()
    return a / (a.std() + 1e-9)


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def build(seed):
    rng = np.random.default_rng(seed)
    flecks = norm(periodic_gauss(rng.standard_normal((N, N)), FLECK_SX, FLECK_SY))
    runs = norm(periodic_gauss(rng.standard_normal((N, N)), RUN_SX, RUN_SY))
    field = flecks + RUN_GAIN * runs
    field = norm(field)

    # sand: a soft ramp over the upper part of the field, mean about SAND_MEAN
    lo, hi = np.percentile(field, 45), np.percentile(field, 99.5)
    sand = smoothstep(lo, hi, field) ** 1.3
    sand *= SAND_MEAN / max(sand.mean(), 1e-6)
    sand = np.clip(sand, 0, 1) * SAND_PEAK

    # sparkle: the top SPARKLE_SHARE of the same field, crisp but antialiased
    t = np.percentile(field, 100 * (1 - SPARKLE_SHARE))
    width = 0.35
    sparkle = smoothstep(t - width * 0.5, t + width, field)
    peak = np.percentile(field, 99.7)
    sparkle *= 0.55 + 0.45 * smoothstep(t, peak, field)
    return sand, sparkle


def save(a, name):
    os.makedirs(OUT, exist_ok=True)
    g = np.clip(a * 255 + 0.5, 0, 255).astype(np.uint8)
    path = os.path.join(OUT, name)
    Image.fromarray(np.dstack([g, g, g]), "RGB").save(path, quality=90, method=6)
    print(path, os.path.getsize(path), "bytes, mean", round(float(a.mean()), 3), "share>0.5", round(float((a > 0.5).mean()), 3))


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--seed", type=int, default=2002)
    ap.add_argument("--preview", help="write a 2 x 2 tiled preview (seam check) to this path")
    args = ap.parse_args()
    sand, sparkle = build(args.seed)
    save(sand, "rev-sand-v1.webp")
    save(sparkle, "rev-sparkle-v1.webp")
    if args.preview:
        tile = np.concatenate([np.concatenate([sand, sparkle], 1)] * 2, 0)
        Image.fromarray((np.clip(tile, 0, 1) * 255).astype(np.uint8)).save(args.preview)
        print(args.preview)
