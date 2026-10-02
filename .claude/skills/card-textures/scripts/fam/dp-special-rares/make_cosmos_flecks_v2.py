#!/usr/bin/env python3
"""Cosmos maps v2 for Arceus AR, Shiny Legendary SL and the 13 secrets: assets/foil/fam/dp-special-rares/cos-<id>-v2.webp.

The live maps (cos-<id>.webp, never rewritten) carry the right ALPHA (art window minus the Pokemon, from the SAM cut-outs judged earlier) but a poor
fleck layer: dp-cosmos-holo's generator draws 2-3 px SQUARE pixels in lattice-like clusters, all primary colours, which reads as "holographic squares"
at phone size (Noah, 2026-10-02: "really shitty texture"). The real DP cosmos holo (refs/: Articuno 148, Zapdos 150, Charizard 103, Pikachu 112 tilt
frames) is silver: a fine round glitter, mostly white or a pale tint with a minority of saturated dots (blue, violet, cyan, green, gold), thickened in
irregular patches, with a few round discs and rings of dots, no lattice and no plus signs.

This script keeps each live map's alpha byte for byte and replaces the RGB with a new fleck field drawn from the card id (reruns give the same bytes):
  patches   low-frequency noise (sigma 34 px, scale 600 px) sets where the glitter is dense (x0.15 .. x2.2), so it clusters and leaves clear sky;
  glitter   fine round dots, radius 0.7-1.5 px, soft gaussian edge (no square pixel), peak 0.55-1.0, about 1 per 60 px^2 of foil before the patch weighting;
  grains    larger round dots, radius 1.6-2.8 px, about 1 per 700 px^2;
  discs     soft round orbs with a small white core, radius 4-8 px, about 1 per 14000 px^2 (the green orb on Zapdos, the ring blobs on Articuno);
  beads     the saturated round glints of the real AR4 and Articuno frames: radius 2.4-4.2 px, a coloured (never white) core at full strength, about
            1 per 5200 px^2 before the patch weighting: sparse, but the dots the eye picks out at phone size (v2.1);
  rings     8-18 fine dots on a circle of radius 6-14 px, about 1 per 11000 px^2;
  colour    white 36 %, gold 12, cyan 12, blue 10, violet 10, green 8, magenta 6, orange 6; white stays white under the page's hue-rotate, so the silver
            stays silver while the coloured dots turn with the tilt.
Light only: the page screens this layer, nothing here can darken the print. Everything is multiplied by the live alpha, so no fleck lands on the Pokemon,
the frame or the text.

    python3 make_cosmos_flecks_v2.py [--ids pl3-150 pl1-129 ...] [--preview DIR]     (default: the 33 cards below)
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

from dsr_common import OUT, ROOT, W, H, rng_for

IDS = ([f"pl4-AR{i}" for i in range(1, 10)] + [f"col1-SL{i}" for i in range(1, 12)] +
       "dp2-124 dp7-101 dp7-102 dp7-103 pl1-128 pl1-129 pl1-130 pl2-112 pl2-113 pl2-114 pl3-148 pl3-149 pl3-150".split())

PALETTE = [  # (weight, rgb at full light)
    (0.36, (1.00, 1.00, 1.00)),   # white / silver
    (0.12, (1.00, 0.86, 0.30)),   # gold
    (0.12, (0.15, 0.95, 1.00)),   # cyan
    (0.10, (0.25, 0.50, 1.00)),   # blue
    (0.10, (0.68, 0.34, 1.00)),   # violet
    (0.08, (0.30, 1.00, 0.50)),   # green
    (0.06, (1.00, 0.30, 0.82)),   # magenta
    (0.06, (1.00, 0.58, 0.22)),   # orange
]
_W = np.array([p[0] for p in PALETTE]); _W /= _W.sum()
_C = np.array([p[1] for p in PALETTE], np.float32)


def old_name(cid: str) -> str:
    set_, num = cid.split("-", 1)
    return f"cos-{num.lower()}.webp" if cid.startswith(("pl4-AR", "col1-SL")) else f"cos-{cid.lower()}.webp"


def splat(canvas: np.ndarray, x: float, y: float, r: float, rgb, peak: float) -> None:
    """A soft round dot: gaussian, sigma = 0.6 r, kept by max so overlaps do not saturate to squares."""
    s = max(r * 0.6, 0.45)
    k = int(np.ceil(3 * s)) + 1
    x0, y0 = int(np.floor(x)) - k, int(np.floor(y)) - k
    xs = np.arange(x0, x0 + 2 * k + 2); ys = np.arange(y0, y0 + 2 * k + 2)
    ok_x = (xs >= 0) & (xs < W); ok_y = (ys >= 0) & (ys < H)
    if not ok_x.any() or not ok_y.any():
        return
    gx = np.exp(-((xs[ok_x] + 0.5 - x) ** 2) / (2 * s * s)); gy = np.exp(-((ys[ok_y] + 0.5 - y) ** 2) / (2 * s * s))
    g = (gy[:, None] * gx[None, :] * peak).astype(np.float32)
    sub = canvas[ys[ok_y][0]:ys[ok_y][-1] + 1, xs[ok_x][0]:xs[ok_x][-1] + 1]
    np.maximum(sub, g[..., None] * np.asarray(rgb, np.float32), out=sub)


def make(cid: str) -> tuple[np.ndarray, np.ndarray]:
    old = np.asarray(Image.open(OUT / old_name(cid)).convert("RGBA"))
    alpha8 = old[..., 3]
    a = alpha8.astype(np.float32) / 255.0
    inside = a > 0.5
    n_in = int(inside.sum())
    rng = rng_for(cid, "flecks-v2")
    noise = ndi.gaussian_filter(rng.standard_normal((H, W)).astype(np.float32), 34)
    noise = (noise - noise.mean()) / (noise.std() + 1e-6)
    dens = np.clip(0.55 + 0.60 * noise, 0.15, 2.2)
    ys, xs = np.nonzero(inside)
    wts = dens[ys, xs]; wts = wts / wts.sum()
    canvas = np.zeros((H, W, 3), np.float32)

    def pick(n: int):
        idx = rng.choice(len(xs), size=n, p=wts)
        return xs[idx] + rng.random(n), ys[idx] + rng.random(n)

    def colours(n: int):
        return _C[rng.choice(len(_C), size=n, p=_W)]

    n1 = int(n_in / 60); px, py = pick(n1); col = colours(n1)
    for i in range(n1):
        splat(canvas, px[i], py[i], rng.uniform(0.7, 1.5), col[i], rng.uniform(0.55, 1.0))
    n2 = int(n_in / 700); px, py = pick(n2); col = colours(n2)
    for i in range(n2):
        splat(canvas, px[i], py[i], rng.uniform(1.6, 2.8), col[i], rng.uniform(0.7, 1.0))
    n3 = max(2, int(n_in / 14000)); px, py = pick(n3); col = colours(n3)
    for i in range(n3):
        r = rng.uniform(4.0, 8.0)
        splat(canvas, px[i], py[i], r, col[i], 0.55)
        splat(canvas, px[i], py[i], r * 0.22, (1, 1, 1), 0.7)
    n5 = max(4, int(n_in / 5200)); px, py = pick(n5)
    bead = _C[1:][rng.choice(len(_C) - 1, size=n5, p=_W[1:] / _W[1:].sum())]   # saturated colours only
    for i in range(n5):
        r = rng.uniform(2.4, 4.2)
        splat(canvas, px[i], py[i], r, bead[i], 1.0)
        splat(canvas, px[i], py[i], r * 0.45, np.minimum(bead[i] * 0.5 + 0.55, 1.0), 0.9)
    n4 = max(2, int(n_in / 11000)); px, py = pick(n4); col = colours(n4)
    for i in range(n4):
        R = rng.uniform(6.0, 14.0); m = int(rng.integers(8, 19)); ph = rng.uniform(0, 2 * np.pi)
        for j in range(m):
            t = ph + 2 * np.pi * j / m
            splat(canvas, px[i] + R * np.cos(t), py[i] + R * np.sin(t), rng.uniform(0.8, 1.3), col[i], rng.uniform(0.7, 1.0))
    canvas *= a[..., None]
    return np.clip(canvas, 0, 1), alpha8


def save(cid: str, rgb: np.ndarray, alpha8: np.ndarray) -> Path:
    arr = np.dstack([np.round(rgb * 255).astype(np.uint8), alpha8])
    dst = OUT / old_name(cid).replace(".webp", "-v2.webp")
    Image.fromarray(arr, "RGBA").save(dst, "WEBP", lossless=True, quality=100, method=6, exact=True)
    return dst


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--ids", nargs="*", default=IDS)
    ap.add_argument("--preview", type=Path)
    a = ap.parse_args()
    for cid in a.ids:
        rgb, al = make(cid)
        dst = save(cid, rgb, al)
        print(f"{cid}: {dst.relative_to(ROOT)} {dst.stat().st_size / 1024:.0f} KB, flecks on {float((rgb.max(-1) > 0.08).mean()) * 100:.1f}% of the card")
        if a.preview:
            a.preview.mkdir(parents=True, exist_ok=True)
            Image.fromarray((rgb * 255).astype(np.uint8)).save(a.preview / f"{cid}-flecks.png")


if __name__ == "__main__":
    main()
