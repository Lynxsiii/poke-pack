#!/usr/bin/env python3
"""Tiles for the Sun & Moon regular Pokemon-GX foil (holo family sm-gx).

The real GX foil is a fine pebble / glitter grain: irregular facets about 0.5-1% of the card's width, no direction,
each catching the light at its own angle (Espeon-GX sm1 61 and Raichu-GX sm115 20 photos). Four seamless tiles:

  pebble-v1.webp  every facet a flat grey level with a slight in-facet slope (the facet's tilt), mid-weighted, so it
                  can break a band into grain (screened over the band colours) without a line screen.
  pebble-a-v1.webp  the same facets as white with the facet level as alpha: a light-only relief for the varnish (a
                  grey tile under a blend WebKit may drop would darken the ink).
  glint-v1.webp   the same facets, only the few that face the lamp: black with sparse bright facets, each its own
                  pastel hue (cyan, blue, lavender, pink, green, gold: the frame's rainbow flecks), screened into the
                  light gain.
  cloud-v1.webp   soft low-frequency noise (no facets), used to tear the rainbow bands into ragged cloud-like patches.

Shown at about 30% of the card's width (512 px tile -> about 1% of the card per facet). Seamless: the Voronoi seeds
and the noise wrap around.

    python3 make_pebble.py <repo root>
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter
from scipy.spatial import cKDTree

N = 512
CELLS = 1100
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else ".") / "assets/foil/fam/sm-gx"


def voronoi(rng):
    pts = rng.random((CELLS, 2)) * N
    tiled = np.concatenate([pts + np.array([dx, dy]) for dx in (-N, 0, N) for dy in (-N, 0, N)])
    owner = np.tile(np.arange(CELLS), 9)
    yy, xx = np.mgrid[0:N, 0:N]
    q = np.stack([xx.ravel() + 0.5, yy.ravel() + 0.5], 1)
    d, i = cKDTree(tiled).query(q, k=2)
    cell = owner[i[:, 0]].reshape(N, N)
    edge = (d[:, 1] - d[:, 0]).reshape(N, N)  # distance to the facet's border
    near = tiled[i[:, 0]]
    rel = (q - near).reshape(N, N, 2)
    return cell, edge, rel


def main():
    rng = np.random.default_rng(20261123)
    cell, edge, rel = voronoi(rng)
    level = rng.beta(2.2, 2.2, CELLS)  # mid-weighted facet brightness
    tilt = rng.normal(0, 1, (CELLS, 2)) * 0.006  # in-facet slope per px
    v = level[cell] + (rel[..., 0] * tilt[cell, 0] + rel[..., 1] * tilt[cell, 1])
    v = v * np.clip(edge / 1.6, 0.55, 1.0)  # a faint dark seam between facets
    v = gaussian_filter(v, 0.6, mode="wrap")
    v = np.clip(v, 0, 1)
    OUT.mkdir(parents=True, exist_ok=True)
    Image.fromarray((v * 255).astype(np.uint8), "L").save(OUT / "pebble-v1.webp", quality=92)

    a = np.zeros((N, N, 4), np.uint8)
    a[..., :3] = 255
    a[..., 3] = (v * 255).astype(np.uint8)
    Image.fromarray(a, "RGBA").save(OUT / "pebble-a-v1.webp", quality=92)

    lit = level > np.quantile(level, 0.9)  # one facet in ten faces the lamp
    g = np.where(lit[cell], np.clip((level[cell] - 0.55) / 0.45, 0, 1), 0.0)
    g = g * np.clip(edge / 2.0, 0, 1)
    g = gaussian_filter(g, 0.7, mode="wrap")
    hues = np.array([[120, 230, 255], [130, 160, 255], [200, 150, 255], [255, 150, 210], [150, 255, 170],
                     [255, 220, 130], [235, 240, 255]], float) / 255
    hue = hues[rng.integers(0, len(hues), CELLS)][cell]
    rgb = np.clip(g[..., None] * hue, 0, 1)
    Image.fromarray((rgb * 255).astype(np.uint8), "RGB").save(OUT / "glint-v1.webp", quality=92)

    c = np.zeros((N, N))
    for s, a in ((48, 1.0), (24, 0.5), (12, 0.25)):
        c += gaussian_filter(rng.random((N, N)), s, mode="wrap") * a
    c = (c - c.min()) / (c.max() - c.min())
    c = np.clip((c - 0.5) * 2.2 + 0.5, 0, 1)
    Image.fromarray((c * 255).astype(np.uint8), "L").save(OUT / "cloud-v1.webp", quality=90)
    for n in ("pebble-v1", "pebble-a-v1", "glint-v1", "cloud-v1"):
        im = np.asarray(Image.open(OUT / f"{n}.webp"))
        print(n, im.shape, int(im.mean()), int(im.std()))


if __name__ == "__main__":
    main()
