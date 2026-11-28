#!/usr/bin/env python3
"""Cut an official Pokémon Center Online box render (product on a pure #fff page) with no white left.

The ortho hull in build_products.py traces edges by colour, so a box whose art is white where it meets the page
(Japanese Black Bolt / White Flare) loses bites of box. Here the page is flood-filled from the border (only exact
#fff-ish pixels; the box's own white is textured and darker), and with --mirror the left-right symmetric box shape
fills a bite on one side from the other side's edge.

Usage: python3 scripts/cut_box_render.py <render.jpg> <out.webp> [inset px] [--mirror]
"""
import sys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ndi
src, out = sys.argv[1], sys.argv[2]
inset = float(sys.argv[3]) if len(sys.argv) > 3 else 2
im = Image.open(src).convert("RGB")
a = np.asarray(im).astype(int)
page = a.min(axis=2) >= 251
lab, n = ndi.label(page)
border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
bg = np.isin(lab, list(border))
box = ~bg
lab2, n2 = ndi.label(box)
sizes = ndi.sum(box, lab2, range(1, n2 + 1))
box = lab2 == (np.argmax(sizes) + 1)
box = ndi.binary_fill_holes(box)
if '--mirror' in sys.argv:
    # A box render is symmetric: where white art meets the white page on one side, the other side's edge stands in.
    rows = np.flatnonzero(box.any(axis=1))
    ls = np.array([np.flatnonzero(box[y])[0] for y in rows]); rs = np.array([np.flatnonzero(box[y])[-1] for y in rows])
    lo = len(rows) * 2 // 3
    axis2 = int(round(np.median(ls[lo:] + rs[lo:])))  # body rows: left + right = 2 * centre
    flip = np.zeros_like(box)
    xs = np.arange(box.shape[1]); src = axis2 - xs; ok = (src >= 0) & (src < box.shape[1])
    flip[:, xs[ok]] = box[:, src[ok]]
    box = box | flip
    for y in rows:
        xx = np.flatnonzero(box[y]); box[y, xx[0]:xx[-1] + 1] = True
box = ndi.binary_opening(box, iterations=2)
# inset: erode then soften
box = ndi.binary_erosion(box, iterations=int(inset))
alpha = Image.fromarray((box * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.7))
rgba = im.copy(); rgba.putalpha(alpha)
bb = alpha.getbbox(); rgba = rgba.crop(bb)
rgba.save(out, quality=92, method=6)
print(out, rgba.size)
