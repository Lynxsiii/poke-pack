"""McDonald's Collection 2017-2019 Confetti Holofoil (family sm-holo, `smh-confetti`): the flake tiles.

  python3 .claude/skills/card-textures/scripts/fam/sm-holo/make_confetti.py [--v 1]

The real foil (Pikipek mcd17 11, Pikachu mcd18 4, Psyduck mcd18 2, Caterpie mcd19 1): separate irregular 4-7 sided
polygon flakes, each about 5 CSS px on a 220 px card (2.3% of the card's width), each its own colour (silver-white,
pink, mint, cyan, copper/gold) and each catching the light on its own, no broad rainbow band.

Writes three seamless 384 x 384 tiles, assets/foil/fam/sm-holo/confetti-a-v<N>.webp, -b-, -c-: the same Voronoi
cells (jittered grid, 17 px apart: the sheet shows a tile at 50% of the card's width, 3.5 tile px per CSS px) with the
same colour per cell, but each tile lights a different random quarter of the cells. The sheet stacks them and cross-
fades by the pointer (b with --pointer-from-left, c with --pointer-from-top), so different flakes flash at different
tilts. They are hard-light sources: 0.5 grey leaves the print alone, a lit flake screens its colour on, an unlit one
sits a hair under neutral, and a 1 px seam a little darker outlines the polygons.
"""
import argparse
import os

import numpy as np
from PIL import Image
from scipy.spatial import cKDTree

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../../.."))
OUT = os.path.join(ROOT, "assets/foil/fam/sm-holo")
N = 384
STEP = 17

PALETTE = np.array([
    (238, 240, 246),  # silver-white
    (255, 150, 206),  # pink
    (150, 252, 200),  # mint
    (128, 220, 255),  # cyan
    (244, 186, 112),  # copper / gold
]) / 255
WEIGHTS = np.array([0.34, 0.17, 0.17, 0.17, 0.15])


def cells(rng):
    k = N // STEP
    gy, gx = np.mgrid[0:k, 0:k]
    pts = np.stack([(gx + 0.5 + rng.uniform(-0.45, 0.45, gx.shape)) * N / k,
                    (gy + 0.5 + rng.uniform(-0.45, 0.45, gy.shape)) * N / k], -1).reshape(-1, 2)
    # periodic copies for a seamless tile
    offs = [(dx, dy) for dx in (-N, 0, N) for dy in (-N, 0, N)]
    allp = np.concatenate([pts + o for o in offs])
    idx = np.tile(np.arange(len(pts)), len(offs))
    tree = cKDTree(allp)
    yy, xx = np.mgrid[0:N, 0:N]
    q = np.stack([xx.ravel() + 0.5, yy.ravel() + 0.5], -1)
    d, nn = tree.query(q, k=2)
    owner = idx[nn[:, 0]].reshape(N, N)
    edge = (d[:, 1] - d[:, 0]).reshape(N, N) < 1.1  # about 1 px seam between cells
    return len(pts), owner, edge


def tile(rng, count, owner, edge, colour):
    lit = rng.random(count) < 0.26
    level = np.where(lit, rng.uniform(0.75, 1.0, count), rng.uniform(0.0, 0.22, count))
    neutral = 0.47
    c = colour[owner]  # N x N x 3
    lv = level[owner][..., None]
    src = neutral + lv * (c - neutral)
    src = np.where(edge[..., None], neutral - 0.05, src)
    return np.clip(src, 0, 1)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--v", type=int, default=1)
    args = p.parse_args()
    os.makedirs(OUT, exist_ok=True)
    rng = np.random.default_rng(1722)
    count, owner, edge = cells(rng)
    colour = PALETTE[rng.choice(len(PALETTE), count, p=WEIGHTS)]
    for name in "abc":
        t = tile(rng, count, owner, edge, colour)
        path = os.path.join(OUT, f"confetti-{name}-v{args.v}.webp")
        Image.fromarray((t * 255).round().astype(np.uint8), "RGB").save(path, "WEBP", lossless=True)
        print("wrote", os.path.relpath(path, ROOT), "cells", count, "mean", (t.mean((0, 1)) * 255).round(1))


if __name__ == "__main__":
    main()
