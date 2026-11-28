#!/usr/bin/env python3
"""Draw the cosmos holo's shapes as an alpha tile: distinct round planets, few dots.

The galaxy tiles the cosmos recipe used (upstream's cosmos-middle/top, specks-hd, pixel-cosmos) are nine tenths
pinpoint specks, so at phone size a cosmos promo read as white glitter over the art and no circle could be told
(per-card review, 2026-11-28: "white speck noise", "no cosmos visible in the art box"). A real cosmos sheet is
what you see second: a handful of round planets up to about 8% of the card wide, more small ones, and sparse dust.

  python3 make_cosmos_orbs.py            # writes assets/foil/promo/cosmos-orbs-v1.webp and cosmos-orbs-pixel-v1.webp
  python3 make_cosmos_orbs.py --seed 7 --tag v2

White with alpha, card-shaped (734 x 1024), wrapping on both axes so it can be placed by the card's seed.
The pixel tile is the same field drawn on a 6 px grid: stair-stepped planets, "+" crosses, single-cell dust.
"""
import argparse
import os

import numpy as np
from PIL import Image

W, H = 734, 1024
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))


def place(rng, n, rmin, rmax, taken, gap):
    """n discs of radius rmin..rmax that keep `gap` clear of every disc already placed (wrapping)."""
    out = []
    tries = 0
    while len(out) < n and tries < n * 400:
        tries += 1
        r = rng.uniform(rmin, rmax)
        x, y = rng.uniform(0, W), rng.uniform(0, H)
        ok = True
        for (px, py, pr) in taken:
            dx = min(abs(x - px), W - abs(x - px))
            dy = min(abs(y - py), H - abs(y - py))
            if dx * dx + dy * dy < (r + pr + gap) ** 2:
                ok = False
                break
        if ok:
            taken.append((x, y, r))
            out.append((x, y, r))
    return out


def field(seed):
    rng = np.random.default_rng(seed)
    taken = []
    big = place(rng, 9, 24, 34, taken, 60)
    mid = place(rng, 46, 9, 17, taken, 16)
    small = place(rng, 130, 3.5, 6.5, taken, 7)
    dust = [(rng.uniform(0, W), rng.uniform(0, H), rng.uniform(1.3, 2.2)) for _ in range(380)]
    return rng, big, mid, small, dust


def draw_smooth(seed):
    rng, big, mid, small, dust = field(seed)
    ss = 3
    a = np.zeros((H * ss, W * ss), np.float32)
    yy, xx = np.mgrid[0:H * ss, 0:W * ss].astype(np.float32)

    def disc(x, y, r, alpha, rim):
        for ox in (-W, 0, W):
            for oy in (-H, 0, H):
                cx, cy = (x + ox) * ss, (y + oy) * ss
                R = r * ss
                if cx + R < 0 or cy + R < 0 or cx - R > W * ss or cy - R > H * ss:
                    continue
                x0, x1 = int(max(0, cx - R - 2)), int(min(W * ss, cx + R + 3))
                y0, y1 = int(max(0, cy - R - 2)), int(min(H * ss, cy + R + 3))
                d = np.hypot(xx[y0:y1, x0:x1] - cx, yy[y0:y1, x0:x1] - cy)
                body = np.clip(R - d, 0, 1.5) / 1.5
                # a planet: a little brighter towards its rim, like the embossed discs on the sheet
                shade = alpha * (1 - rim + rim * np.clip(d / R, 0, 1) ** 2)
                a[y0:y1, x0:x1] = np.maximum(a[y0:y1, x0:x1], body * shade)

    for (x, y, r) in big:
        disc(x, y, r, rng.uniform(0.75, 1.0), rng.uniform(0.25, 0.5))
    for (x, y, r) in mid:
        disc(x, y, r, rng.uniform(0.6, 1.0), rng.uniform(0.0, 0.4))
    for (x, y, r) in small:
        disc(x, y, r, rng.uniform(0.55, 1.0), 0)
    for (x, y, r) in dust:
        disc(x, y, r, rng.uniform(0.35, 0.8), 0)
    img = Image.fromarray((a * 255).astype(np.uint8)).resize((W, H), Image.LANCZOS)
    return np.asarray(img)


def draw_pixel(seed, cell=6):
    rng, big, mid, small, dust = field(seed)
    gw, gh = W // cell, H // cell
    g = np.zeros((gh, gw), np.float32)
    yy, xx = np.mgrid[0:gh, 0:gw].astype(np.float32)

    def blob(x, y, r, alpha):
        cx, cy, R = x / cell, y / cell, max(r / cell, 0.6)
        for ox in (-gw, 0, gw):
            for oy in (-gh, 0, gh):
                d = np.hypot(xx - (cx + ox), yy - (cy + oy))
                g[d <= R] = np.maximum(g[d <= R], alpha)

    def cross(x, y, arm, alpha):
        cx, cy = int(x / cell) % gw, int(y / cell) % gh
        for k in range(-arm, arm + 1):
            g[cy, (cx + k) % gw] = max(g[cy, (cx + k) % gw], alpha)
            g[(cy + k) % gh, cx] = max(g[(cy + k) % gh, cx], alpha)

    for (x, y, r) in big:
        blob(x, y, r, rng.uniform(0.75, 1.0))
    for (x, y, r) in mid:
        blob(x, y, r, rng.uniform(0.6, 1.0))
    for i, (x, y, r) in enumerate(small):
        if i % 3 == 0:
            cross(x, y, 2 if i % 2 else 1, rng.uniform(0.6, 1.0))
        else:
            blob(x, y, r, rng.uniform(0.55, 1.0))
    for (x, y, r) in dust[:260]:
        g[int(y / cell) % gh, int(x / cell) % gw] = max(g[int(y / cell) % gh, int(x / cell) % gw], rng.uniform(0.35, 0.8))
    img = Image.fromarray((g * 255).astype(np.uint8)).resize((gw * cell, gh * cell), Image.NEAREST)
    out = Image.new("L", (W, H), 0)
    out.paste(img, (0, 0))
    return np.asarray(out)


def save(alpha, name):
    rgba = np.dstack([np.full_like(alpha, 255)] * 3 + [alpha])
    path = os.path.join(ROOT, "assets", "foil", "promo", name)
    if os.path.exists(path):
        raise SystemExit(f"{path} exists: pick another --tag (never overwrite an asset)")
    Image.fromarray(rgba, "RGBA").save(path, "WEBP", lossless=True, method=6)
    print(path, os.path.getsize(path))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=20261128)
    ap.add_argument("--tag", default="v1")
    args = ap.parse_args()
    save(draw_smooth(args.seed), f"cosmos-orbs-{args.tag}.webp")
    save(draw_pixel(args.seed + 1), f"cosmos-orbs-pixel-{args.tag}.webp")
