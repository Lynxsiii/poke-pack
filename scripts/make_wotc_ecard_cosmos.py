#!/usr/bin/env python3
"""Draw the e-Card cosmos tile: assets/foil/wotc-ecard/cosmos-v1.webp (768 x 768, white RGBA, alpha = the foil's dots).

What the real e-Card holo shows (Pokemon Holo tilt clips of Butterfree, Mewtwo, Blastoise, Dugtrio, Tentacruel; Collexy
flat scans of Alakazam, Houndoom, Butterfree, Crobat; the Crystal scans): the cosmos holofoil of the art window is a scatter
of small snowflake clusters (a plus, an asterisk, a 3 x 3 square or a diamond of fine dots, 1.2 to 2.2 % of the card
width across), many single dots and a few fine two-dot dashes, thick in the dark sky and thin over the pale ink, each
element catching one colour (cyan, blue, white, pink, orange). It is not the Diamond & Pearl dot-matrix discs (assets/
foil/dp-cosmos-v1.webp) and not Base Set's stars. Elements are placed at random with wrap-around, so the tile repeats
without a seam, and no two neighbours share a pitch or a direction (no grating at phone size).

    python3 scripts/make_wotc_ecard_cosmos.py --out assets/foil/wotc-ecard/cosmos-v1.webp [--seed 20030512]
"""
import argparse
import os

import numpy as np
from PIL import Image

N = 768
SS = 4  # supersample


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--seed", type=int, default=20030512)
    args = ap.parse_args()
    if os.path.exists(args.out):
        raise SystemExit(f"{args.out} exists: never overwrite a shipped asset")
    rng = np.random.default_rng(args.seed)
    S = N * SS
    canvas = np.zeros((S, S), np.float32)
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)

    def dot(cx, cy, r, a=1.0):
        # wrap-around soft disc, drawn into a small window
        R = int(r + 3)
        for ox in (-S, 0, S):
            for oy in (-S, 0, S):
                x0, x1 = int(cx + ox - R), int(cx + ox + R + 1)
                y0, y1 = int(cy + oy - R), int(cy + oy + R + 1)
                if x1 < 0 or y1 < 0 or x0 >= S or y0 >= S:
                    continue
                xs0, ys0 = max(x0, 0), max(y0, 0)
                xs1, ys1 = min(x1, S), min(y1, S)
                sub = canvas[ys0:ys1, xs0:xs1]
                d = np.hypot(xx[ys0:ys1, xs0:xs1] - (cx + ox), yy[ys0:ys1, xs0:xs1] - (cy + oy))
                np.maximum(sub, a * np.clip(r - d + 0.5, 0, 1), out=sub)

    # density field: clumps of thick and thin, so the sky is dense and the "pale ink" is thin
    g = rng.random((12, 12)).astype(np.float32)
    dens = np.asarray(Image.fromarray((g * 255).astype(np.uint8)).resize((N, N), Image.BICUBIC), np.float32) / 255
    dens = 0.25 + 0.95 * dens

    def place(n, fn):
        k = 0
        while k < n:
            x, y = rng.random(2) * N
            if rng.random() < dens[int(y), int(x)]:
                fn(x * SS, y * SS)
                k += 1

    pitch = 3.3 * SS

    def flake(cx, cy):
        kind = rng.integers(0, 4)
        r = rng.uniform(1.4, 1.8) * SS
        if kind == 0:  # plus
            pts = [(0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)]
            if rng.random() < 0.5:
                pts += [(2, 0), (-2, 0), (0, 2), (0, -2)]
        elif kind == 1:  # 3 x 3 square
            pts = [(i, j) for i in (-1, 0, 1) for j in (-1, 0, 1)]
        elif kind == 2:  # asterisk
            pts = [(0, 0), (1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)]
        else:  # diamond
            pts = [(0, 0), (1, 0), (-1, 0), (0, 1), (0, -1), (2, 0), (-2, 0), (0, 2), (0, -2), (1, 1), (-1, -1), (1, -1), (-1, 1)]
        th = rng.uniform(0, np.pi / 2)
        c, s = np.cos(th), np.sin(th)
        sc = rng.uniform(0.85, 1.2)
        for (i, j) in pts:
            dot(cx + sc * pitch * (i * c - j * s), cy + sc * pitch * (i * s + j * c), r * sc * 1.3, 1.0)

    def single(cx, cy):
        dot(cx, cy, rng.uniform(1.4, 2.5) * SS, rng.uniform(0.75, 1.0))

    def dash(cx, cy):
        th = rng.uniform(0, np.pi)
        for t in (-0.5, 0.5):
            dot(cx + t * pitch * np.cos(th), cy + t * pitch * np.sin(th), 1.5 * SS, 0.9)

    place(150, flake)
    place(620, single)
    place(110, dash)
    img = Image.fromarray(np.clip(canvas * 255, 0, 255).astype(np.uint8)).resize((N, N), Image.LANCZOS)
    rgba = np.zeros((N, N, 4), np.uint8)
    rgba[..., :3] = 255
    rgba[..., 3] = np.asarray(img)
    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    Image.fromarray(rgba, "RGBA").save(args.out, "WEBP", lossless=True, quality=100, method=6)
    print("coverage", float((rgba[..., 3] > 127).mean()))


if __name__ == "__main__":
    main()
