#!/usr/bin/env python3
"""Split TCG Live's etch map of each XY shiny secret EX into three ridge-orientation maps.

Why: the real cards are engraved ("textured holofoil"): fine raised ridges that run along the drawing (rungs across the
gold border, wavy streaks in the art, rings round the type symbol). A ridge only throws light at the eye when the lamp is
off to one side of it, so on a real card different ridges flash as it turns. One mask lit by one pool cannot do that.
This script reads each card's native-size Live etch (733 x 1024, the alpha channel is the etch), measures the ridge
direction at every pixel with a structure tensor (smoothed over about 5 px, so a 5.6 px ridge pitch gives one stable
direction), and writes three alpha maps, one per ridge direction (0, 60 and 120 degrees from horizontal). The three
sum back to the etch (a soft split, triangular weights: a ridge at 30 degrees is half in the 0 map, half in the 60 map).
Where the direction is undefined (stipple, dots, solid blobs: low coherence) each map gets a third.

Input (read only): assets/foil/fam/xy-full-art/<id>-etch.webp (Live's etch, shipped by xy-full-art).
Output: assets/foil/fam/xy-secret-shiny/<id>-ridge-a.webp (0 deg), -b (60 deg), -c (120 deg): white, alpha = the share of
the etch in that direction, lossless. Deterministic (no random numbers). Re-runnable; once the family ships a change goes
to a new `-vN` name (--suffix).

    python3 make_ridge_bins.py [--ids xy7-96,xy8-163] [--suffix -v2] [--preview DIR]
"""
import argparse
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), *[".."] * 6))
SRC = os.path.join(ROOT, "assets/foil/fam/xy-full-art")
OUT = os.path.join(ROOT, "assets/foil/fam/xy-secret-shiny")
IDS = ["xy7-96", "xy7-97", "xy7-98", "xy8-163", "xy8-164", "xy9-123", "xy10-125", "xy11-115", "xy11-116"]
CENTERS = np.deg2rad([0.0, 60.0, 120.0])


def ridge_split(alpha, sigma_grad=0.8, sigma_tensor=5.0):
    """alpha float 0..1 (h, w). Returns (weights (3, h, w) summing to 1, coherence)."""
    a = ndi.gaussian_filter(alpha, sigma_grad)
    gy, gx = np.gradient(a)
    j11 = ndi.gaussian_filter(gx * gx, sigma_tensor)
    j22 = ndi.gaussian_filter(gy * gy, sigma_tensor)
    j12 = ndi.gaussian_filter(gx * gy, sigma_tensor)
    theta_g = 0.5 * np.arctan2(2 * j12, j11 - j22)  # direction of steepest change
    theta = theta_g + np.pi / 2  # ridge direction (screen coordinates, y down)
    coh = np.sqrt((j11 - j22) ** 2 + 4 * j12**2) / (j11 + j22 + 1e-9)
    w = []
    for c in CENTERS:
        d = np.abs(((theta - c) + np.pi / 2) % np.pi - np.pi / 2)  # circular distance, period 180 deg
        w.append(np.clip(1.0 - d / np.deg2rad(60.0), 0.0, 1.0))
    w = np.stack(w)
    w /= w.sum(axis=0, keepdims=True) + 1e-9
    k = np.clip((coh - 0.12) / 0.30, 0.0, 1.0)  # trust the direction only where the lines are coherent
    w = k * w + (1.0 - k) / 3.0
    # quarter steps: fewer alpha levels (the Live etch has 12), so the maps compress; the residue goes to the strongest map
    q = np.round(w * 4.0) / 4.0
    top = np.argmax(w, axis=0)
    resid = 1.0 - q.sum(axis=0)
    for i in range(3):
        q[i] += np.where(top == i, resid, 0.0)
    return np.clip(q, 0.0, 1.0), coh


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ids", default=",".join(IDS))
    ap.add_argument("--suffix", default="")
    ap.add_argument("--preview", default="")
    args = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    for cid in [s for s in args.ids.split(",") if s]:
        src = os.path.join(SRC, f"{cid}-etch.webp")
        im = Image.open(src).convert("RGBA")
        alpha = np.asarray(im)[..., 3].astype(np.float32) / 255.0
        w, coh = ridge_split(alpha)
        total = 0
        for name, wk in zip("abc", w):
            out = np.zeros((*alpha.shape, 4), np.uint8)
            out[..., :3] = 255
            out[..., 3] = np.clip(np.round(alpha * wk * 255.0), 0, 255).astype(np.uint8)
            path = os.path.join(OUT, f"{cid}-ridge-{name}{args.suffix}.webp")
            Image.fromarray(out, "RGBA").save(path, "WEBP", lossless=False, quality=80, alpha_quality=75, method=6)
            total += os.path.getsize(path)
        print(f"{cid}: 3 maps, {total // 1024} KB, mean coherence {coh.mean():.2f}, mean weights {[round(float((alpha * wk).mean()), 3) for wk in w]}")
        if args.preview:
            os.makedirs(args.preview, exist_ok=True)
            rgb = np.stack([w[0] * alpha, w[1] * alpha, w[2] * alpha], axis=-1)
            Image.fromarray(np.clip(rgb * 255, 0, 255).astype(np.uint8), "RGB").save(os.path.join(args.preview, f"{cid}-ridge-rgb.png"))


if __name__ == "__main__":
    sys.exit(main())
