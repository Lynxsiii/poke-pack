#!/usr/bin/env python3
"""Draw the Diamond & Pearl cracked-ice tile: assets/foil/dp-cracked-ice-v1.webp.

The real Rising Rivals Rotom foil (YouTube tilt clips of Fan, Wash, Heat and Mow Rotom, see
/mnt/project-files/every-era/dp/texture-refs/h3/SOURCES.txt) is a field of LARGE flat shards, 6 to 12 per cent of
the card's width: triangles and kites with straight edges and no outline, each one a single flat tone, most of
them barely lighter than the print and a minority flashing bright and, tipped, a saturated colour. The Celebration
cracked-ice tile (assets/foil/celebration/cracked-ice.webp) is a 3 per cent Voronoi crumb, far too fine for it.

This is a seamless Delaunay triangulation of jittered points (wrapped, so it tiles), one flat grey per triangle:
about 55 per cent dim, 30 per cent mid, 15 per cent bright. Greyscale: the colour comes from the CSS sweep.
The edge between two shards is a straight anti-aliased step, never a dark line, so there is no hairline to alias.

    python3 scripts/make_dp_cracked_ice.py --out assets/foil/dp-cracked-ice-v1.webp [--seed 2009]
"""
import argparse
import random

import numpy as np
from PIL import Image, ImageDraw
from scipy.spatial import Delaunay

SIZE = 768   # tile edge; css lays it at about 100% of the card width (card scale 600 px)
SS = 3
POINTS = 215  # about 2 x POINTS triangles, side about 56 px at card scale


def points(rnd):
    # jittered grid: even coverage, no tiny slivers, no visible lattice once triangulated
    n = int(round(POINTS ** 0.5))
    step = SIZE / n
    pts = []
    for i in range(n):
        for j in range(n):
            pts.append(((i + 0.5 + rnd.uniform(-0.48, 0.48)) * step, (j + 0.5 + rnd.uniform(-0.48, 0.48)) * step))
    return np.array(pts)


def tone(rnd):
    r = rnd.random()
    if r < 0.55:
        return rnd.uniform(0.10, 0.38)
    if r < 0.85:
        return rnd.uniform(0.38, 0.72)
    return rnd.uniform(0.80, 1.0)


def draw(seed):
    rnd = random.Random(seed)
    base = points(rnd)
    big = np.vstack([base + np.array([ox * SIZE, oy * SIZE]) for ox in (-1, 0, 1) for oy in (-1, 0, 1)])
    tri = Delaunay(big)
    W = SIZE * SS
    img = Image.new("L", (W, W), 0)
    d = ImageDraw.Draw(img)
    # a triangle's tone depends on its centroid modulo the tile so the copies in the 3x3 block agree
    memo = {}
    for s in tri.simplices:
        p = big[s]
        c = p.mean(axis=0)
        if c[0] < -SIZE * 0.25 or c[0] > SIZE * 1.25 or c[1] < -SIZE * 0.25 or c[1] > SIZE * 1.25:
            continue
        key = (round((c[0] % SIZE) / 2.0), round((c[1] % SIZE) / 2.0))
        if key not in memo:
            memo[key] = tone(rnd)
        v = int(memo[key] * 255)
        d.polygon([(x * SS, y * SS) for x, y in p], fill=v)
    return img.resize((SIZE, SIZE), Image.LANCZOS)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--seed", type=int, default=2009)
    a = ap.parse_args()
    draw(a.seed).save(a.out, quality=92, method=6)
    print("wrote", a.out)
