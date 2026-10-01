#!/usr/bin/env python3
"""Draw the Legendary Collection reverse holo's fireworks: assets/foil/wotc-rev/fireworks-v1.webp (white RGBA, 600 x 838).

The real reverse of Legendary Collection (Collexy WOTC-era holofoil overview, Bulbapedia Holofoil: "fireworks pattern";
PSA 9581 "starburst"; scans of the reverse Charizard, Gengar, Pikachu, Ivysaur) is a scatter of starbursts, each a hub of
thin straight rays that fade out toward their tips, over a faint silver sheen of the whole card. wotc.css uses the alpha
as a mask for the foil layer (card minus the art window; the picture stays matte).
Drawn with a seeded RNG: Poisson-disc-ish hubs of different sizes, rays of random length, thickness and angle, each broken
into one or two dashes (a regular fan of continuous hairlines would read as a grating), at 2x and averaged down so no
ray is thinner than a pixel; a one-pixel jitter on the angles keeps neighbouring rays from lining up.
Never overwrites: pass --suffix -v2 for a redraw.
    python3 scripts/make_wotc_fireworks.py --out assets/foil/wotc-rev [--preview preview.png]
"""
import argparse
import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

W, H = 600, 838
S = 2


def hubs(rng, n=150, rmin=26):
    pts = []
    tries = 0
    while len(pts) < n and tries < 20000:
        tries += 1
        x, y = rng.uniform(-20, W + 20), rng.uniform(-20, H + 20)
        r = rng.uniform(34, 78)
        if all(math.hypot(x - a, y - b) > 0.42 * (r + c) for a, b, c in pts):
            pts.append((x, y, r))
    return pts


def draw(seed=7):
    rng = np.random.default_rng(seed)
    img = Image.new("L", (W * S, H * S), 0)
    d = ImageDraw.Draw(img)
    for x, y, r in hubs(rng):
        rays = int(rng.integers(34, 70))
        a0 = rng.uniform(0, math.tau)
        gain = rng.uniform(0.55, 1.0)
        for k in range(rays):
            a = a0 + k * math.tau / rays + rng.normal(0, 0.035)
            ln = r * rng.uniform(0.35, 1.0) ** 0.8
            width = rng.uniform(1.7, 3.0)
            # one or two dashes along the ray: a gap now and then
            r0 = rng.uniform(1.5, 6)
            segs = [(r0, ln)] if rng.random() < 0.6 else [(r0, ln * rng.uniform(0.3, 0.55)), (ln * rng.uniform(0.6, 0.72), ln)]
            for s0, s1 in segs:
                v = int(255 * gain * rng.uniform(0.55, 1.0))
                p0 = ((x + math.cos(a) * s0) * S, (y + math.sin(a) * s0) * S)
                p1 = ((x + math.cos(a) * s1) * S, (y + math.sin(a) * s1) * S)
                d.line([p0, p1], fill=v, width=max(2, int(round(width))))
        d.ellipse([(x - 1.6) * S, (y - 1.6) * S, (x + 1.6) * S, (y + 1.6) * S], fill=255)
    img = img.filter(ImageFilter.GaussianBlur(0.7 * S / 2))
    a = np.asarray(img.resize((W, H), Image.BOX), np.float32) / 255.0
    # the silver sheen between the bursts: a low floor with a little grain, uneven over the card
    from scipy import ndimage as ndi
    grain = ndi.gaussian_filter(rng.random((H, W)).astype(np.float32), 1.2)
    grain = (grain - grain.mean()) / grain.std()
    floor = np.clip(0.16 + 0.04 * grain, 0.05, 0.3)
    return np.clip(np.maximum(a * 0.95, floor), 0, 1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--suffix", default="-v1")
    ap.add_argument("--preview")
    args = ap.parse_args()
    a = draw()
    os.makedirs(args.out, exist_ok=True)
    path = os.path.join(args.out, f"fireworks{args.suffix}.webp")
    if os.path.exists(path):
        raise SystemExit(f"{path} exists: never overwrite a shipped asset, pass --suffix")
    rgba = np.zeros((H, W, 4), np.uint8)
    rgba[..., :3] = 255
    rgba[..., 3] = np.clip(a * 255 + 0.5, 0, 255).astype(np.uint8)
    Image.fromarray(rgba, "RGBA").save(path, "WEBP", quality=50, alpha_quality=70, method=6)
    print(path, os.path.getsize(path))
    if args.preview:
        Image.fromarray((a * 255).astype(np.uint8)).save(args.preview)


if __name__ == "__main__":
    main()
