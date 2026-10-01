#!/usr/bin/env python3
"""Platinum SP Pokemon (Dialga G, Palkia G, the GL / E4 / G prints of Rising Rivals, dpp promos): the art-window mask with the
trainer portrait cut out. assets/foil/dp-win/dp-basic-sp.webp = dp-basic.webp minus the head-and-shoulders portrait that
breaks out of the medallion into the bottom-right corner of the picture (reviewer rv-h1: with the plain window the cosmos dots
land on the portrait's face and hair). Ellipse centre (519, 395), radii (62, 70) on the 600 x 825 mask, measured on the 52 SP
Basics of pl1 and pl2 (the medallion's ring sits at (519, 420), the heads and hats rise about 45 px above it).
Never overwrite a shipped mask: pass --suffix -v2 for a redraw.

    python3 scripts/make_dp_sp_mask.py
"""
import argparse
import os

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ap = argparse.ArgumentParser()
ap.add_argument("--suffix", default="")
args = ap.parse_args()
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "foil", "dp-win")
src = Image.open(os.path.join(root, "dp-basic.webp")).convert("RGBA")
a = np.asarray(src, dtype=np.float32)[..., 3] / 255.0
H, W = a.shape
yy, xx = np.mgrid[0:H, 0:W]
cx, cy, rx, ry = 519.0, 395.0, 62.0, 70.0
cut = (((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2) <= 1.0
cut = ndi.gaussian_filter(cut.astype(np.float32), 1.2)
out = np.clip(a * (1.0 - cut), 0, 1)
rgba = np.zeros((H, W, 4), np.uint8)
rgba[..., :3] = 255
rgba[..., 3] = np.round(out * 255).astype(np.uint8)
dst = os.path.join(root, f"dp-basic-sp{args.suffix}.webp")
if os.path.exists(dst):
    raise SystemExit(f"{dst} exists; use --suffix -v2")
Image.fromarray(rgba, "RGBA").save(dst, "WEBP", lossless=True)
print("wrote", dst, os.path.getsize(dst), "bytes")
