#!/usr/bin/env python3
"""Glint field for the Call of Legends Crosshatch Energy (family dp-reverse, col1 88-95).

What it draws: assets/foil/fam/dp-reverse/glints-v1.webp, a 900 x 1257 greyscale picture (black ground, white glints) of tiny
dots sitting on a diamond lattice (the two 45-degree directions of the Crosshatch), the way the real foil throws them: the CE101
PSA 10 close-ups (refs/cx_col1-91-94-ce101-zoom-crop.jpg) show a fine diagonal lattice of tiny glints, each lit one saturated
colour, only the ones the lamp reaches. The CSS colours the dots (a coloured diagonal swath is multiplied with this field), so
the field itself is colourless.

Why dots and not lines: a 2-4 px line grating aliases into a line screen on a phone, and a 3.4% ribbon lattice (the last pass) reads
as a chain-link mesh. Here the lattice pitch is 0.8% of the width (about 2 CSS px at 220 px), every node is jittered by up to
three tenths of the pitch, only about half the nodes are lit (the share follows a slow noise, so some patches are denser) and each lit dot
has its own brightness: no rows, no grid and no repeat show; at phone size it is a fine glitter that lights up in diagonal swaths.

The real foil is ruled in PATCHES (the CE101 / lowpopping close-ups): a zone of fine "\\" lines next to a zone of fine "/" lines, the
two crossing where zones overlap, hence the name. So the field has patches too: where a slow noise is strongly positive the lit
glints keep to every other row of one diagonal, where it is strongly negative to every other row of the other, and between them
(and with a few strays inside) they are scattered: dotted diagonal ruling in irregular zones, never one grid over the whole card.

Second output, hatch-v1.webp (600 x 838): the visible half of the Crosshatch, long thin silver lines in both 45-degree
directions, in BUNCHES of 5-12 near-parallel lines of random length and brightness, bunches of the two directions crossing
here and there (the plaid of the Collexy flat and the PSA 10 photo of Darkness 94). Never evenly spaced across the card,
never periodic: bunches sit at random places, line spacing inside a bunch is jittered, so no grating can alias on a phone.

Deterministic (seed 1148). Re-run: python3 make_glints.py [--out FILE] [--hatch FILE]
"""
import argparse
import os

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../../.."))
W, H = 900, 1257
PITCH = 0.008 * W  # 7.2 px
SEED = 1148


def make_hatch(path):
    from PIL import ImageDraw

    rng = np.random.default_rng(SEED + 1)
    ss = 2
    img = Image.new("L", (W * ss, H * ss), 0)
    dr = ImageDraw.Draw(img)
    for _ in range(66):
        sign = 1 if rng.uniform() < 0.5 else -1
        ang = np.deg2rad(45 * sign + rng.normal(0, 1.2))
        ux, uy = np.cos(ang), np.sin(ang)
        px, py = -uy, ux  # perpendicular
        cx, cy = rng.uniform(-0.05 * W, 1.05 * W), rng.uniform(-0.05 * H, 1.05 * H)
        base_len = rng.uniform(260, 720)
        spacing = rng.uniform(7.0, 15.0)
        n = int(rng.integers(5, 13))
        for k in range(n):
            off = (k - n / 2) * spacing + rng.normal(0, 1.6)
            sh = rng.uniform(-70, 70)
            ln = base_len * rng.uniform(0.55, 1.1)
            mx, my = cx + px * off + ux * sh, cy + py * off + uy * sh
            inten = int(255 * rng.uniform(0.35, 1.0))
            wd = max(1, int(round(rng.uniform(1.8, 3.0) * ss)))
            dr.line([((mx - ux * ln / 2) * ss, (my - uy * ln / 2) * ss), ((mx + ux * ln / 2) * ss, (my + uy * ln / 2) * ss)], fill=inten, width=wd)
    img = img.resize((600, 838), Image.LANCZOS)  # drawn at 900 wide, kept at 600: soft long lines need no more
    img.save(path, quality=80, method=6)
    print(path, img.size, os.path.getsize(path), "bytes")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(ROOT, "assets/foil/fam/dp-reverse/glints-v1.webp"))
    ap.add_argument("--hatch", default=os.path.join(ROOT, "assets/foil/fam/dp-reverse/hatch-v1.webp"))
    args = ap.parse_args()
    make_hatch(args.hatch)
    rng = np.random.default_rng(SEED)
    # slow density noise (patches), 0..1
    low = ndi.gaussian_filter(rng.standard_normal((H // 8 + 2, W // 8 + 2)), 5.0)
    low = (low - low.mean()) / (low.std() + 1e-9)
    low = np.kron(low, np.ones((8, 8)))[:H, :W]
    # nodes of a diamond lattice: u = (x + y) / sqrt2, v = (x - y) / sqrt2, both on a PITCH grid
    r2 = np.sqrt(2.0)
    n = int((W + H) / PITCH * 0.75) + 4
    ii, jj = np.meshgrid(np.arange(-n, n), np.arange(-n, n))
    uu, vv = ii * PITCH, jj * PITCH
    x = (uu + vv) / r2 + W / 2
    y = (uu - vv) / r2 + H / 2
    keep = (x > -3) & (x < W + 3) & (y > -3) & (y < H + 3)
    x = x[keep]
    y = y[keep]
    ii = ii[keep]
    jj = jj[keep]
    x = x + rng.uniform(-0.3, 0.3, x.shape) * PITCH
    y = y + rng.uniform(-0.3, 0.3, y.shape) * PITCH
    xi = np.clip(x.round().astype(int), 0, W - 1)
    yi = np.clip(y.round().astype(int), 0, H - 1)
    p_on = np.clip(0.5 + 0.2 * low[yi, xi], 0.18, 0.85)
    # ruling patches: a second, faster noise picks the direction of the rows a patch keeps
    low2 = ndi.gaussian_filter(rng.standard_normal((H // 8 + 2, W // 8 + 2)), 9.0)
    low2 = (low2 - low2.mean()) / (low2.std() + 1e-9)
    low2 = np.kron(low2, np.ones((8, 8)))[:H, :W]
    d = low2[yi, xi]
    row_a = (jj % 2 == 0)  # rows along u (constant v)
    row_b = (ii % 2 == 0)  # rows along v (constant u)
    strong = np.abs(d) > 0.55
    aligned = np.where(d > 0, row_a, row_b)
    p_on = np.where(strong, np.where(aligned, 0.78, 0.17), p_on)
    on = rng.uniform(0, 1, x.shape) < p_on
    x, y = x[on], y[on]
    amp = rng.uniform(0.45, 1.0, x.shape) ** 0.7
    PAD = 12
    canvas = np.zeros((H + 2 * PAD, W + 2 * PAD))
    sig = 0.85
    k = np.arange(-3, 4)
    for dy in k:
        for dx in k:
            ix = np.floor(x).astype(int) + dx + PAD
            iy = np.floor(y).astype(int) + dy + PAD
            fx = (ix - PAD) + 0.5 - x
            fy = (iy - PAD) + 0.5 - y
            w = amp * np.exp(-(fx * fx + fy * fy) / (2 * sig * sig))
            np.add.at(canvas, (iy, ix), w)
    img = np.clip(canvas[PAD:-PAD, PAD:-PAD], 0, 1)
    out = Image.fromarray((img * 255 + 0.5).astype(np.uint8), "L")
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    out.save(args.out, lossless=True, quality=100, method=6)
    print(args.out, out.size, f"{len(x)} glints", os.path.getsize(args.out), "bytes")


if __name__ == "__main__":
    main()
