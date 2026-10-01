#!/usr/bin/env python3
"""Draw the EX generation's cracked-ice tile: assets/foil/ex-cracked-ice-v1.webp.

The real foil (Hidden Legends' Regirock, Regice and Registeel ex, FireRed & LeafGreen's secret Articuno, Moltres and Zapdos ex;
PokePrice's hand-held photos of Registeel ex and Regirock ex, Collexy's flat scans; see texture-refs/ex-ex/SOURCES.txt): the whole
face of the card is a sheet of flat angular FACETS (triangles, kites and quadrilaterals with straight edges and no outline), 3 to
12 per cent of the card's width, very different in size next to each other. Every facet is one flat tone; most are barely lighter
than the print and a minority flash bright, silver-white or a saturated cyan, orange, magenta or yellow, and which ones do changes
as the card tips. The art window and the silver frame take it strongest.

This tile is RGBA and seamless: a Delaunay triangulation of jittered points at two scales (a coarse grid of 54 px cells at card
scale, a third of them split into four finer points), one flat colour per triangle: 40 per cent silver-white, 60 per cent a hue
from the whole circle; alpha is the facet's brightness (about 40 per cent faint, 35 per cent mid, 25 per cent bright). css/holo/ex-ex.css
screens it onto the print and turns its hue with the tilt, so the facets flip colour. The edge of a facet is a straight
anti-aliased step, never a line, so nothing can alias into a screen at phone size.

    python3 scripts/make_ex_cracked_ice.py --out assets/foil/ex-cracked-ice-v1.webp [--seed 2004]
"""
import argparse
import colorsys
import random

import numpy as np
from PIL import Image, ImageDraw
from scipy.spatial import Delaunay

SIZE = 600   # tile edge at card scale (css lays it at 100% of the card width, and again at about 60%)
SS = 3
CELL = 54


def points(rnd):
    n = SIZE // CELL
    step = SIZE / n
    pts = []
    for i in range(n):
        for j in range(n):
            cx, cy = (i + 0.5) * step, (j + 0.5) * step
            if rnd.random() < 0.33:
                for dx, dy in ((-0.25, -0.25), (0.25, -0.25), (-0.25, 0.25), (0.25, 0.25)):
                    pts.append((cx + (dx + rnd.uniform(-0.18, 0.18)) * step, cy + (dy + rnd.uniform(-0.18, 0.18)) * step))
            else:
                pts.append((cx + rnd.uniform(-0.46, 0.46) * step, cy + rnd.uniform(-0.46, 0.46) * step))
    return np.array(pts)


def facet_colour(rnd):
    r = rnd.random()
    a = rnd.uniform(0.04, 0.16) if r < 0.40 else (rnd.uniform(0.2, 0.5) if r < 0.75 else rnd.uniform(0.55, 0.95))
    if rnd.random() < 0.40:
        c = rnd.uniform(0.82, 1.0)
        rgb = (c, c, min(1.0, c + 0.02))
    else:
        h = rnd.random()
        rgb = colorsys.hls_to_rgb(h, rnd.uniform(0.5, 0.62), rnd.uniform(0.85, 1.0))
    return tuple(int(255 * v) for v in rgb) + (int(255 * a),)


def draw(seed):
    rnd = random.Random(seed)
    base = points(rnd)
    # wrap: 3 x 3 copies so triangles crossing the tile edge close up
    allp, owner = [], []
    for ox in (-SIZE, 0, SIZE):
        for oy in (-SIZE, 0, SIZE):
            for k, (x, y) in enumerate(base):
                allp.append((x + ox, y + oy))
                owner.append(k)
    allp = np.array(allp)
    tri = Delaunay(allp)
    # one colour per triangle, keyed by its owner-independent centroid so copies agree
    cols = {}
    W = SIZE * SS
    img = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for s in tri.simplices:
        p = allp[s]
        cx, cy = p[:, 0].mean(), p[:, 1].mean()
        # canonical centroid inside the tile
        key = (round((cx % SIZE) * 4), round((cy % SIZE) * 4))
        if key not in cols:
            cols[key] = facet_colour(rnd)
        if p[:, 0].max() < -4 or p[:, 0].min() > SIZE + 4 or p[:, 1].max() < -4 or p[:, 1].min() > SIZE + 4:
            continue
        d.polygon([(x * SS, y * SS) for x, y in p], fill=cols[key])
    return img.resize((SIZE, SIZE), Image.LANCZOS)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--seed", type=int, default=2004)
    a = ap.parse_args()
    im = draw(a.seed)
    im.save(a.out, "WEBP", lossless=True, quality=100, method=6)
    arr = np.asarray(im)
    print(a.out, im.size, "mean alpha %.3f" % (arr[..., 3].mean() / 255))
