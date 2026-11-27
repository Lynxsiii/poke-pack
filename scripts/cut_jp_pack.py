#!/usr/bin/env python3
"""Cut a Japanese booster pack photo (TCGplayer, pack on white) into clean art.

TCGplayer's Japanese pack photos fill the frame edge to edge, but the corners
beside the crimps, the gaps between the crimp teeth, a thin rim down the sides
and the hang hole are all photo white. A colour key leaves a pale fringe on
every edge (Noah saw it on his iPhone), so this cuts by shape instead:

- the sides are straight lines fitted to where the pack starts on each row,
- the top and bottom are straight lines through the roots of the crimp teeth,
- the corners are slightly rounded,
- everything is pulled 2 px inside those lines so no white rim survives,
- the hang hole (a pale round blob near the top, enclosed by the pack) is
  punched out so it shows what is behind the pack.

Usage: python3 scripts/cut_jp_pack.py <photo.jpg> <out-stem>
writes <out-stem>.png and <out-stem>.avif (q90).
"""

import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

INSET = 2.0  # px pulled inside the fitted edges, at the photo's own scale
SS = 4  # supersampling for the antialiased outline


def non_white(rgb, thresh):
    return (255 - rgb.min(axis=2)) > thresh


def fit_side(points):
    """Robust x = a*y + b through (y, x) points: drop the worst quarter twice."""
    pts = np.array(points, dtype=float)
    for _ in range(3):
        a, b = np.polyfit(pts[:, 0], pts[:, 1], 1)
        err = np.abs(pts[:, 1] - (a * pts[:, 0] + b))
        keep = err <= np.percentile(err, 75) + 0.5
        if keep.all():
            break
        pts = pts[keep]
    return a, b


def cut(src, stem):
    im = Image.open(src).convert("RGB")
    rgb = np.asarray(im).astype(np.int16)
    h, w, _ = rgb.shape
    ink = non_white(rgb, 18)

    # Sides: first and last inked pixel of each row through the pack's middle.
    left, right = [], []
    for y in range(int(h * 0.12), int(h * 0.88)):
        xs = np.flatnonzero(ink[y])
        if xs.size < w * 0.5:
            continue
        left.append((y, xs[0]))
        right.append((y, xs[-1]))
    la, lb = fit_side(left)
    ra, rb = fit_side(right)

    # Top and bottom: per column, where ink starts; the teeth roots are the deep end.
    cols = range(int(w * 0.1), int(w * 0.9))
    tops = [np.flatnonzero(ink[:, x])[0] for x in cols if ink[:, x].any()]
    bots = [np.flatnonzero(ink[:, x])[-1] for x in cols if ink[:, x].any()]
    top = float(np.percentile(tops, 92))
    bot = float(np.percentile(bots, 8))

    def lx(y):
        return la * y + lb + INSET

    def rx(y):
        return ra * y + rb - INSET

    y0, y1 = top + INSET, bot - INSET
    r = w * 0.012  # corner radius
    poly = []
    # Walk the outline clockwise with rounded corners (quarter circles approximated).
    steps = 6
    for i in range(steps + 1):  # top-left
        t = np.pi + (np.pi / 2) * i / steps
        poly.append((lx(y0 + r) + r + r * np.cos(t), y0 + r + r * np.sin(t)))
    for i in range(steps + 1):  # top-right
        t = -np.pi / 2 + (np.pi / 2) * i / steps
        poly.append((rx(y0 + r) - r + r * np.cos(t), y0 + r + r * np.sin(t)))
    for i in range(steps + 1):  # bottom-right
        t = (np.pi / 2) * i / steps
        poly.append((rx(y1 - r) - r + r * np.cos(t), y1 - r + r * np.sin(t)))
    for i in range(steps + 1):  # bottom-left
        t = np.pi / 2 + (np.pi / 2) * i / steps
        poly.append((lx(y1 - r) + r + r * np.cos(t), y1 - r + r * np.sin(t)))

    big = Image.new("L", (w * SS, h * SS), 0)
    ImageDraw.Draw(big).polygon([(x * SS, y * SS) for x, y in poly], fill=255)
    alpha = np.asarray(big.resize((w, h), Image.LANCZOS)).astype(np.float32)

    # Hang hole: the round cut-out near the top centre. Found by its rim (a
    # circle of strong edges around a calm disc), wherever its fill is white,
    # grey or see-through; if a photo shows none, use where the other packs have it.
    cx, cy, cr, score = find_hole(rgb, w, h)
    if score < 2.0:
        cx, cy, cr = w * 0.485, h * 0.072, w * 0.045
    yy, xx = np.mgrid[0:h, 0:w]
    d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
    hole_a = np.clip((d - (cr * 1.18 + 1.5)) / 1.2, 0, 1)  # 0 inside, soft 1 px rim
    alpha = alpha * hole_a
    hole = (round(cx), round(cy), round(cr), round(score, 1))

    # Crop to the outline and save.
    ys, xs = np.nonzero(alpha > 0)
    box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
    out = np.dstack([np.asarray(im), alpha.clip(0, 255).astype(np.uint8)])
    art = Image.fromarray(out, "RGBA").crop(box)
    if art.width > 520:
        art = art.resize((520, round(art.height * 520 / art.width)), Image.LANCZOS)
    art.save(f"{stem}.png", optimize=True)
    art.save(f"{stem}.avif", quality=90)
    print(f"{stem}: {art.size}, hole {hole}")


def find_hole(rgb, w, h):
    """Best circle in the top band: strong edges on the rim, little texture inside."""
    grey = rgb.mean(axis=2)
    gy, gx = np.gradient(grey)
    grad = np.hypot(gx, gy)
    best = (0, 0, 0, -1)
    angles = np.linspace(0, 2 * np.pi, 72, endpoint=False)
    for r in np.arange(w * 0.032, w * 0.058, w * 0.003):
        ring_x = np.cos(angles) * r
        ring_y = np.sin(angles) * r
        inner = np.linspace(0, 2 * np.pi, 24, endpoint=False)
        for cy in np.arange(h * 0.035, h * 0.115, 2):
            for cx in np.arange(w * 0.36, w * 0.64, 2):
                px = (cx + ring_x).astype(int)
                py = (cy + ring_y).astype(int)
                rim = grad[py, px]
                rim_score = np.percentile(rim, 25)  # most of the rim, not one hot spot
                ix = (cx + np.cos(inner) * r * 0.55).astype(int)
                iy = (cy + np.sin(inner) * r * 0.55).astype(int)
                calm = grey[iy, ix].std() + grad[iy, ix].mean()
                score = rim_score - calm
                if score > best[3]:
                    best = (cx, cy, r, score)
    return best


if __name__ == "__main__":
    cut(sys.argv[1], sys.argv[2])
