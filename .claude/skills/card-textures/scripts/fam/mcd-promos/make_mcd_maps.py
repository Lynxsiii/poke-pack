#!/usr/bin/env python3
"""McDonald's Collection 2011-2016 (mcd11, mcd12, mcd14, mcd15, mcd16): one map per card, drawn from the card's own scan.

Why: every print of these five sets is Confetti Holofoil. The scans carry the printed chip mosaic (a few percent of the card wide, each
chip its own colour; the Pokemon is matte, the McDonald's "M" and the frame are plain). So the map is built FROM the scan:

  alpha  = where the foil is: the art window, minus the Pokemon (no chips on it in the scan), the "M" and the evolution circle.
           The chips are found as local high-pass energy (a median-filtered band-pass of the log image, so a thin Pokemon outline
           does not count); the largest chip-free blob is the Pokemon, grown a few pixels so no foil spills over its edge.
  rgb    = the chip signature: the scan minus its own local mean (sigma 5), per channel, scaled by the card's own spread and
           centred on mid grey. Each chip keeps its own tint and level, so the CSS can light the chips one by one (a moving
           grey ramp through `difference` lights the chips whose level matches it: each channel at its own moment, so every
           chip runs through its own colours) and turn their hue with the tilt, registered to the scan by construction.

Output: assets/foil/fam/mcd-promos/<id>-v1.webp (600 x 838 RGBA, lossy colour, lossless alpha). New files only.

    python3 make_mcd_maps.py [--ids mcd11-6,mcd14-5] [--qa /tmp/qa.png]      (default: all 60)

Seeded and deterministic (no random numbers). Needs numpy, scipy, opencv, Pillow.
"""
import argparse
import os
import sys

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), *[".."] * 6))
OUT = os.path.join(ROOT, "assets/foil/fam/mcd-promos")
SETS = ["mcd11", "mcd12", "mcd14", "mcd15", "mcd16"]
W, H = 600, 838
# The art window in 600 x 838 scan pixels (measured on all 60 scans: left 48..51, right 547..558, top 74..90, bottom 414..421).
WIN = (52, 90, 546, 414)  # x0, y0, x1, y1: kept a few pixels inside the real edge, the frame is never foil
# The "M" (golden arches) at the window's bottom right, on 2012 and 2014 cards only.
M_BOX = {"mcd12": (470, 336, 548, 416), "mcd14": (470, 336, 548, 416)}


def load(cid):
    s, n = cid.split("-")
    im = Image.open(f"{ROOT}/assets/cards/{s}/{n}.webp").convert("RGB")
    if im.size != (W, H):
        im = im.resize((W, H), Image.LANCZOS)
    return np.asarray(im).astype(np.float32) / 255


def chip_energy(a):
    lg = np.sqrt(a)  # sqrt, not log: chips on bright art (white water, pale metal) keep their contrast
    rel = lg - np.stack([ndi.gaussian_filter(lg[..., c], 5) for c in range(3)], -1)
    s = np.stack([ndi.gaussian_filter(rel[..., c], 0.7) for c in range(3)], -1)
    gx = np.stack([ndi.sobel(s[..., c], axis=1) for c in range(3)], -1)
    gy = np.stack([ndi.sobel(s[..., c], axis=0) for c in range(3)], -1)
    e = np.sqrt((gx ** 2 + gy ** 2).sum(-1))
    return rel, e


def otsu(x):
    h, edges = np.histogram(x, bins=128)
    h = h.astype(float)
    p = h / h.sum()
    w = np.cumsum(p)
    mu = np.cumsum(p * (edges[:-1] + edges[1:]) / 2)
    mt = mu[-1]
    sb = (mt * w - mu) ** 2 / (w * (1 - w) + 1e-9)
    return (edges[np.argmax(sb)] + edges[np.argmax(sb) + 1]) / 2


def foil_alpha(cid, a, rel, e):
    s = cid.split("-")[0]
    x0, y0, x1, y1 = WIN
    win = np.zeros((H, W), bool)
    win[y0:y1, x0:x1] = True
    le = np.log(e + 1e-3)
    # median of the log energy: thin outlines drop out, chip fields stay high
    q = np.clip((le + 5) / 6, 0, 1)
    q8 = (q * 255).astype(np.uint8)
    med = cv2.medianBlur(q8, 15).astype(np.float32) / 255
    med = cv2.GaussianBlur(med, (0, 0), 2.0)
    thr = otsu(med[win]) - float(os.environ.get('MCD_THR_OFFSET', '0.04'))
    chip = (med > thr) & win
    # fill small background holes, drop small chip islands (they sit inside the Pokemon)
    inv = (~chip) & win
    lab, n = ndi.label(inv)
    if n:
        sizes = ndi.sum(inv, lab, range(1, n + 1))
        for i, sz in enumerate(sizes, 1):
            if sz < 260:
                chip[lab == i] = True
    lab, n = ndi.label(chip)
    if n:
        sizes = ndi.sum(chip, lab, range(1, n + 1))
        for i, sz in enumerate(sizes, 1):
            if sz < 700:
                chip[lab == i] = False
    # the Pokemon: the big compact chip-free blobs of the window. Bright chips (white water, pale metal) also read as chip-free,
    # but they come as ragged patches, so a blob stays only when it is large next to the biggest one or big and compact.
    free = (~chip) & win
    lab, n = ndi.label(free)
    poke = np.zeros((H, W), bool)
    if n:
        sizes = ndi.sum(free, lab, range(1, n + 1))
        big = float(sizes.max())
        for i, sz in enumerate(sizes, 1):
            if sz < 400:
                continue
            comp = (lab == i).astype(np.uint8)
            cnts, _ = cv2.findContours(comp, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            hull = cv2.contourArea(cv2.convexHull(max(cnts, key=cv2.contourArea))) if cnts else 1.0
            solid = sz / max(hull, 1.0)
            if sz >= 0.10 * big or (sz >= 1500 and solid >= 0.72):
                poke |= lab == i
    poke = ndi.binary_dilation(poke, structure=np.ones((3, 3)), iterations=5) & win
    # the "M": yellow arches in the bottom-right corner of 2012 and 2014 windows
    if s in M_BOX:
        mx0, my0, mx1, my1 = M_BOX[s]
        hsv = cv2.cvtColor((a * 255).astype(np.uint8), cv2.COLOR_RGB2HSV).astype(np.float32)
        yel = (hsv[..., 0] > 14) & (hsv[..., 0] < 32) & (hsv[..., 1] > 150) & (hsv[..., 2] > 170)
        box = np.zeros((H, W), bool)
        box[my0:my1, mx0:mx1] = True
        m = yel & box
        m = ndi.binary_dilation(m, iterations=7)
        m = ndi.binary_closing(m, iterations=6)
        poke |= m
    mask = win & ~poke
    # smooth the edge by a pixel or two
    al = cv2.GaussianBlur(mask.astype(np.float32), (0, 0), 1.3)
    return np.clip(al * 1.15 - 0.05, 0, 1)


def signature(rel, alpha):
    m = alpha > 0.5
    std = float(np.sqrt((rel[m] ** 2).mean())) if m.any() else 0.1
    sig = 0.5 + 0.5 * np.clip(rel / (3.2 * std), -1, 1)
    return sig


def build(cid):
    a = load(cid)
    rel, e = chip_energy(a)
    al = foil_alpha(cid, a, rel, e)
    sig = signature(rel, al)
    rgba = np.concatenate([sig, al[..., None]], -1)
    return a, rgba


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ids", default="")
    ap.add_argument("--qa", default="")
    ap.add_argument("--no-write", action="store_true")
    args = ap.parse_args()
    ids = args.ids.split(",") if args.ids else [f"{s}-{n}" for s in SETS for n in range(1, 13)]
    os.makedirs(OUT, exist_ok=True)
    tiles = []
    for cid in ids:
        a, rgba = build(cid)
        if not args.no_write:
            im = Image.fromarray((np.clip(rgba, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA")
            im.save(f"{OUT}/{cid}-v1.webp", quality=88, alpha_quality=100, method=6)
        if args.qa:
            al = rgba[..., 3:4]
            ov = a * (0.35 + 0.65 * (1 - al)) + np.array([1, 0, 0.2]) * al * 0.28
            crop = (np.clip(ov, 0, 1)[60:430, 30:570] * 255).astype(np.uint8)
            tiles.append(crop)
        print(cid, "foil share of window %.2f" % (rgba[..., 3][WIN[1]:WIN[3], WIN[0]:WIN[2]].mean()), flush=True)
    if args.qa and tiles:
        cols = 4
        rows = [np.concatenate(tiles[i:i + cols] + [np.zeros_like(tiles[0])] * (cols - len(tiles[i:i + cols])), 1) for i in range(0, len(tiles), cols)]
        Image.fromarray(np.concatenate(rows, 0)).save(args.qa)


if __name__ == "__main__":
    main()
