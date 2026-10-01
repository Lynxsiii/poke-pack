#!/usr/bin/env python3
"""Draw the Legendary Collection reverse holo's fireworks: assets/foil/wotc-rev/fireworks-v2.webp (RGBA, 600 x 838).

The real reverse of Legendary Collection (Collexy WOTC-era holofoil overview, Bulbapedia Holofoil: "fireworks pattern";
PSA 9581 "starburst"; scans of the reverse Charizard, Gengar, Pikachu, Ivysaur) is a scatter of starbursts, each a hub of
thin straight rays that fade out toward their tips, over a faint silver sheen of the whole card. wotc.css uses the alpha
as a mask for the foil layer (card minus the art window; the picture stays matte).
Drawn with a seeded RNG: Poisson-disc-ish hubs of different sizes, rays of random length, thickness and angle, each broken
into one or two dashes (a regular fan of continuous hairlines would read as a grating), at 2x and averaged down so no
ray is thinner than a pixel; a one-pixel jitter on the angles keeps neighbouring rays from lining up.
Never overwrites: pass --suffix=-vN for a redraw (with an equals sign: argparse reads a bare -v2 as an option).
The shipped sheet, v2 (review rv-j1: v1's 150 big hubs and a 0.16 floor read far fainter than the real reverse at phone size, so v1
was dropped before it ever shipped): smaller, denser bursts, a firmer sheen, and the rays alone in the colour channels so that
wotc.css can light them white (`mask-mode: luminance`) over the silver veil the alpha masks:
    python3 scripts/make_wotc_fireworks.py --out assets/foil/wotc-rev --suffix=-v2 --rays-in-rgb --n 380 --rlo 22 --rhi 58 --floor 0.32 --gain-lo 0.8 --ray-mul 1.5
"""
import argparse
import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

W, H = 600, 838
S = 2


def hubs(rng, n=150, rmin=26, rlo=34, rhi=78):
    pts = []
    tries = 0
    while len(pts) < n and tries < 20000:
        tries += 1
        x, y = rng.uniform(-20, W + 20), rng.uniform(-20, H + 20)
        r = rng.uniform(rlo, rhi)
        if all(math.hypot(x - a, y - b) > 0.42 * (r + c) for a, b, c in pts):
            pts.append((x, y, r))
    return pts


def draw(seed=7, n=150, rlo=34, rhi=78, floor0=0.16, gain_lo=0.55, ray_mul=1.0):
    rng = np.random.default_rng(seed)
    img = Image.new("L", (W * S, H * S), 0)
    d = ImageDraw.Draw(img)
    for x, y, r in hubs(rng, n=n, rlo=rlo, rhi=rhi):
        rays = int(rng.integers(34, 70) * ray_mul)
        a0 = rng.uniform(0, math.tau)
        gain = rng.uniform(gain_lo, 1.0)
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
    floor = np.clip(floor0 + 0.04 * grain, 0.05, 0.45)
    return np.clip(np.maximum(a * 0.95, floor), 0, 1), np.clip(a, 0, 1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--suffix", default="-v1")
    ap.add_argument("--preview")
    # v1 (150 big hubs, floor 0.16) read far fainter than the real reverse at phone size (review rv-j1): v2 is smaller, denser bursts
    # on a firmer sheen: --n 420 --rlo 20 --rhi 44 --floor 0.26 --gain-lo 0.7
    ap.add_argument("--ray-mul", type=float, default=1.0)
    ap.add_argument("--rays-in-rgb", action="store_true")
    ap.add_argument("--n", type=int, default=150)
    ap.add_argument("--rlo", type=float, default=34)
    ap.add_argument("--rhi", type=float, default=78)
    ap.add_argument("--floor", type=float, default=0.16)
    ap.add_argument("--gain-lo", type=float, default=0.55)
    args = ap.parse_args()
    a, rays = draw(n=args.n, rlo=args.rlo, rhi=args.rhi, floor0=args.floor, gain_lo=args.gain_lo, ray_mul=args.ray_mul)
    os.makedirs(args.out, exist_ok=True)
    path = os.path.join(args.out, f"fireworks{args.suffix}.webp")
    if os.path.exists(path):
        raise SystemExit(f"{path} exists: never overwrite a shipped asset, pass --suffix")
    rgba = np.zeros((H, W, 4), np.uint8)
    # v2: the colour channels carry the rays alone (luminance), so wotc.css can mask a white layer to the bright rays
    # (`mask-mode: luminance`) while the alpha (rays over a sheen floor) masks the silver veil
    rgba[..., :3] = np.clip(rays * 255 + 0.5, 0, 255).astype(np.uint8)[..., None] if args.rays_in_rgb else 255
    rgba[..., 3] = np.clip(a * 255 + 0.5, 0, 255).astype(np.uint8)
    Image.fromarray(rgba, "RGBA").save(path, "WEBP", quality=50, alpha_quality=70, method=6)
    print(path, os.path.getsize(path))
    if args.preview:
        Image.fromarray((a * 255).astype(np.uint8)).save(args.preview)


if __name__ == "__main__":
    main()
