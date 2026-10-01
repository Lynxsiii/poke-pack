#!/usr/bin/env python3
"""Draw the EX generation's reverse-holo pattern tiles: assets/foil/ex-reverse/<family>.webp (600 x 838 white-on-transparent alpha).

The EX reverse holo is a different pattern in almost every set (Collexy's "Holofoil Overview EX Series era", the Elite Fourum
reverse threads 16005 and 58382, and the flat scans and tilt clips listed in texture-refs/i1/SOURCES.txt). From Hidden Legends on the
pattern sits in the ART WINDOW (the card body is plain), registered to the print, so it is the same on every card of a set. This
script draws the patterns that need a picture; the others are CSS (the Mirror of ex1-ex4, the Plain sheen of ex11 and ex13-ex16, the cosmos of
ex12 reuses ex-cosmos-v1.webp):

  energy-l  ex5  Hidden Legends: columns of big type symbols (leaf, flame, drop, bolt, eye, fist, moon, hex, star), one symbol per column
                 repeating down it, 6 percent of the card wide, a few sparkles between
  energy-m  ex6  FireRed & LeafGreen: the same columns at 4.3 percent, tighter
  energy-s  ex7  Team Rocket Returns: the same columns at 3.3 percent, dense
  wheel     ex8  Deoxys: a lattice of small triangles whose brightness fans round a centre in ten wedges, a few stars on it
  pokeball  ex9, ex10  Emerald, Unseen Forces: big translucent bubbles, a few Poke Balls (a ring and a band) and starbursts

Output is white shapes whose alpha is the foil's brightness, drawn on a 4 px cell grid for the pixel tiles and antialiased
for the others, seeded (reruns give the same files). Never overwrite a shipped tile: pass --suffix -v2 for a redraw.

    python3 scripts/make_ex_reverse.py --out assets/foil/ex-reverse
"""
from __future__ import annotations

import argparse
import math
import os

import numpy as np
from PIL import Image, ImageDraw

W, H = 600, 838
SS = 8  # supersample of the glyphs


def glyph(kind: str, n: int = 64) -> Image.Image:
    """A type symbol as a white-on-transparent n x n image (drawn at 8x, reduced)."""
    s = n * SS
    im = Image.new("L", (s, s), 0)
    d = ImageDraw.Draw(im)
    c = s / 2

    def P(*pts):
        return [(x * s, y * s) for x, y in pts]

    if kind == "grass":  # leaf: a pointed lens along the diagonal with a vein cut out
        pts = []
        for t in np.linspace(0, 1, 40):
            pts.append((0.12 + 0.76 * t, 0.88 - 0.76 * t))
        lens = Image.new("L", (s, s), 0)
        ld = ImageDraw.Draw(lens)
        ld.ellipse(P((0.04, 0.2), (0.96, 0.8)), fill=255)
        lens = lens.rotate(45, resample=Image.BICUBIC)
        im.paste(255, mask=lens)
        d.line(P((0.2, 0.8), (0.72, 0.28)), fill=0, width=int(s * 0.035))
        d.line(P((0.42, 0.58), (0.42, 0.34)), fill=0, width=int(s * 0.03))
        d.line(P((0.5, 0.5), (0.66, 0.5)), fill=0, width=int(s * 0.03))
    elif kind == "fire":  # flame
        d.polygon(P((0.5, 0.04), (0.74, 0.34), (0.86, 0.6), (0.78, 0.84), (0.5, 0.96), (0.22, 0.84), (0.14, 0.6), (0.26, 0.4), (0.36, 0.5), (0.4, 0.26)), fill=255)
        d.ellipse(P((0.36, 0.62), (0.64, 0.9)), fill=0)
    elif kind == "water":  # drop
        d.ellipse(P((0.2, 0.4), (0.8, 0.98)), fill=255)
        d.polygon(P((0.5, 0.02), (0.78, 0.6), (0.22, 0.6)), fill=255)
        d.ellipse(P((0.34, 0.6), (0.48, 0.74)), fill=0)
    elif kind == "lightning":  # bolt
        d.polygon(P((0.62, 0.02), (0.2, 0.56), (0.46, 0.56), (0.34, 0.98), (0.82, 0.4), (0.54, 0.4)), fill=255)
    elif kind == "psychic":  # eye
        d.pieslice(P((0.04, 0.3), (0.96, 1.3)), 200, 340, fill=255)
        d.pieslice(P((0.04, -0.3), (0.96, 0.7)), 20, 160, fill=255)
        d.ellipse(P((0.3, 0.3), (0.7, 0.7)), fill=0)
        d.ellipse(P((0.4, 0.4), (0.6, 0.6)), fill=255)
    elif kind == "fighting":  # fist
        d.rounded_rectangle(P((0.2, 0.34), (0.8, 0.9)), radius=int(s * 0.1), fill=255)
        for i in range(4):
            x0 = 0.2 + i * 0.15
            d.rounded_rectangle(P((x0, 0.12), (x0 + 0.15, 0.4)), radius=int(s * 0.06), fill=255)
            if i:
                d.line(P((x0, 0.16), (x0, 0.4)), fill=0, width=int(s * 0.025))
    elif kind == "dark":  # crescent
        d.ellipse(P((0.1, 0.1), (0.9, 0.9)), fill=255)
        d.ellipse(P((0.34, 0.02), (1.1, 0.8)), fill=0)
    elif kind == "metal":  # hexagon with a hole
        pts = [(0.5 + 0.46 * math.cos(math.radians(60 * k + 30)), 0.5 + 0.46 * math.sin(math.radians(60 * k + 30))) for k in range(6)]
        d.polygon(P(*pts), fill=255)
        d.polygon(P((0.5, 0.28), (0.72, 0.64), (0.28, 0.64)), fill=0)
    else:  # colorless: six-point star
        pts = []
        for k in range(12):
            r = 0.48 if k % 2 == 0 else 0.22
            a = math.radians(30 * k - 90)
            pts.append((0.5 + r * math.cos(a), 0.5 + r * math.sin(a)))
        d.polygon(P(*pts), fill=255)
    return im.resize((n, n), Image.LANCZOS)


KINDS = ["grass", "fire", "water", "lightning", "psychic", "fighting", "dark", "metal", "colorless"]


def star4(canvas, cx, cy, arm, v):
    h, w = canvas.shape
    for k in range(-arm, arm + 1):
        for (x, y) in ((cx + k, cy), (cx, cy + k)):
            if 0 <= x < w and 0 <= y < h:
                canvas[y, x] = max(canvas[y, x], v * (1 - 0.6 * abs(k) / (arm + 1)))


def paste_max(canvas, g, x0, y0, v):
    h, w = canvas.shape
    gh, gw = g.shape
    xs0, ys0 = max(x0, 0), max(y0, 0)
    xs1, ys1 = min(x0 + gw, w), min(y0 + gh, h)
    if xs1 <= xs0 or ys1 <= ys0:
        return
    sub = g[ys0 - y0:ys1 - y0, xs0 - x0:xs1 - x0] * v
    canvas[ys0:ys1, xs0:xs1] = np.maximum(canvas[ys0:ys1, xs0:xs1], sub)


# the picture's rectangle on the card (scripts/make_ex_window_masks.py), patterns are drawn a little beyond it
WIN = (30, 66, 570, 400)


def energy(size: int, colw: int, rowh: int, stars: float, seed: int) -> np.ndarray:
    """Columns of one type symbol each, the same symbol repeating down the column (Collexy: "energy symbols in a vertical sequence where
    the same energy symbols appear underneath each other"), a few four-point sparkles between."""
    rng = np.random.default_rng(seed)
    cv = np.zeros((H, W), np.float32)
    gl = {k: np.asarray(glyph(k, size), np.float32) / 255 for k in KINDS}
    x0, y0, x1, y1 = WIN
    ncol = int((x1 - x0) / colw) + 2
    order = [KINDS[int(i)] for i in rng.permutation(len(KINDS))]
    for c in range(ncol):
        kind = order[c % len(order)]
        x = x0 + c * colw + (colw - size) // 2
        y = y0 + int(rng.integers(0, rowh // 2))
        while y < y1 + rowh:
            paste_max(cv, gl[kind], x, y, rng.uniform(0.75, 1.0))
            y += rowh
    for _ in range(int((x1 - x0) * (y1 - y0) * stars)):
        sx, sy = int(rng.integers(x0, x1)), int(rng.integers(y0, y1))
        star4(cv, sx, sy, int(rng.integers(2, 4)), rng.uniform(0.5, 1.0))
    return cv


def wheel(seed: int) -> np.ndarray:
    """Triangles of side 28 px; each one's brightness comes from its angle round the wheel's centre, ten wedges of alternating
    light and dark, with a little per-triangle jitter; a few small stars sit on lighter triangles."""
    rng = np.random.default_rng(seed)
    img = Image.new("L", (W * 2, H * 2), 0)
    d = ImageDraw.Draw(img)
    side = 56  # at 2x
    hh = side * math.sqrt(3) / 2
    cx, cy = W * 0.38 * 2, H * 0.33 * 2
    rows = int(H * 2 / hh) + 2
    cols = int(W * 2 / side) + 3
    for r in range(rows):
        for c in range(cols):
            x = c * side + (side / 2 if r % 2 else 0) - side
            y = r * hh
            for up in (True, False):
                if up:
                    tri = [(x, y + hh), (x + side, y + hh), (x + side / 2, y)]
                else:
                    tri = [(x + side / 2, y), (x + side * 1.5, y), (x + side, y + hh)]
                mx = sum(p[0] for p in tri) / 3
                my = sum(p[1] for p in tri) / 3
                ang = math.atan2(my - cy, mx - cx)
                wedge = int(((ang + math.pi) / (2 * math.pi)) * 10) % 10
                v = (0.32 if wedge % 2 else 0.78) + rng.uniform(-0.12, 0.12)
                if not up:
                    v *= 0.9
                d.polygon(tri, fill=int(255 * min(max(v, 0), 1)))
    cv = np.asarray(img.resize((W, H), Image.LANCZOS), np.float32) / 255
    out = cv * 0.62
    # small stars on the lattice
    for _ in range(46):
        sx, sy = int(rng.integers(40, 560)), int(rng.integers(70, 400))
        star4(out, sx, sy, int(rng.integers(3, 6)), rng.uniform(0.8, 1.0))
    return np.clip(out, 0, 1)


def pokeball(seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    big = Image.new("L", (W * 2, H * 2), 0)
    d = ImageDraw.Draw(big)
    x0, y0, x1, y1 = WIN
    # translucent bubbles: filled discs with a brighter rim
    for _ in range(34):
        r = rng.uniform(16, 54) * 2
        cx, cy = rng.uniform(x0, x1) * 2, rng.uniform(y0, y1) * 2
        fill = int(255 * rng.uniform(0.18, 0.4))
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=fill)
        d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=int(255 * rng.uniform(0.5, 0.8)), width=3)
    # Poke Balls: ring, band and centre button
    for _ in range(9):
        r = rng.uniform(18, 34) * 2
        cx, cy = rng.uniform(x0 + 20, x1 - 20) * 2, rng.uniform(y0 + 20, y1 - 20) * 2
        d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=255, width=int(r * 0.12))
        d.rectangle((cx - r, cy - r * 0.07, cx + r, cy + r * 0.07), fill=255)
        d.ellipse((cx - r * 0.3, cy - r * 0.3, cx + r * 0.3, cy + r * 0.3), fill=0, outline=255, width=int(r * 0.1))
    cv = np.asarray(big.resize((W, H), Image.LANCZOS), np.float32) / 255
    # starbursts: a plus and a cross of thin rays
    for _ in range(26):
        sx, sy = int(rng.integers(x0, x1)), int(rng.integers(y0, y1))
        arm = int(rng.integers(6, 15))
        for ang in np.arange(0, math.pi, math.pi / 4):
            for t in range(-arm, arm + 1):
                px, py = int(sx + t * math.cos(ang)), int(sy + t * math.sin(ang))
                if 0 <= px < W and 0 <= py < H:
                    cv[py, px] = max(cv[py, px], 0.85 * (1 - abs(t) / (arm + 1)))
    return np.clip(cv, 0, 1)


def save(a: np.ndarray, path: str):
    if os.path.exists(path):
        raise SystemExit(f"{path} exists: never overwrite a shipped asset, pass --suffix")
    a8 = np.clip(np.round(a * 255), 0, 255).astype(np.uint8)
    rgba = np.dstack([np.full_like(a8, 255)] * 3 + [a8])
    Image.fromarray(rgba, "RGBA").save(path, "WEBP", lossless=True, quality=100, method=6)
    print(path, f"{os.path.getsize(path) / 1024:.0f} KB")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", required=True)
    ap.add_argument("--suffix", default="")
    ap.add_argument("--only", default="")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    tiles = {
        "energy-l": lambda: energy(38, 56, 82, 0.00012, 5),
        "energy-m": lambda: energy(26, 40, 46, 0.0003, 6),
        "energy-s": lambda: energy(20, 32, 34, 0.0005, 7),
        "wheel": lambda: wheel(8),
        "pokeball": lambda: pokeball(9),
    }
    for name, fn in tiles.items():
        if args.only and name not in args.only.split(","):
            continue
        save(fn(), os.path.join(args.out, f"{name}{args.suffix}.webp"))


if __name__ == "__main__":
    main()
