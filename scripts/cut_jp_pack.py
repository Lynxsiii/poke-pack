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


def cut(src, stem, hole_at=None, dump=None):
    im = Image.open(src).convert("RGB")
    rgb = np.asarray(im).astype(np.int16)
    h, w, _ = rgb.shape
    ink = non_white(rgb, 18)

    # Official shop renders (Pokémon Center Online) sit in a white square with a
    # caption under the pack: keep only the tallest run of inked rows, and the
    # columns inked within it.
    rows = ink.mean(axis=1) > 0.02
    runs, start = [], None
    for y, on in enumerate(list(rows) + [False]):
        if on and start is None:
            start = y
        elif not on and start is not None:
            if runs and start - runs[-1][1] < 12:
                runs[-1] = (runs[-1][0], y)  # a short white gap inside the pack
            else:
                runs.append((start, y))
            start = None
    y0r, y1r = max(runs, key=lambda r: r[1] - r[0])
    y0r, y1r = max(0, y0r - 3), min(h, y1r + 3)
    colsr = np.flatnonzero(ink[y0r:y1r].mean(axis=0) > 0.05)
    x0r, x1r = max(0, colsr[0] - 3), min(w, colsr[-1] + 4)
    im = im.crop((x0r, y0r, x1r, y1r))
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

    # Hang hole: the round cut-out near the top centre, found by its rim. It is
    # filled with the pack art around it rather than punched through: English
    # wrappers show no hole, and on the tear screen a see-through hole read as a
    # dark disc and a dark band across the torn strip (Noah, 11-27).
    if hole_at:
        # Measured by eye, as fractions of the pack's width (x, r) and height (y).
        fx, fy, fr = hole_at
        cx, cy, cr, score = fx * w, fy * h, fr * w, 0.0
    else:
        cx, cy, cr, score = find_hole(rgb, w, h)
        if score < 8.0:
            cx, cy, cr = w * 0.485, h * 0.072, w * 0.045
    if dump:
        im.save(dump)
    rgb_f = fill_disc(np.asarray(im).astype(np.float32), cx, cy, cr * 1.22 + 2)
    im = Image.fromarray(rgb_f.clip(0, 255).astype(np.uint8), "RGB")
    hole = (round(cx), round(cy), round(cr), round(score, 1))

    # Crop to the outline and save.
    ys, xs = np.nonzero(alpha > 0)
    box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
    out = np.dstack([np.asarray(im), alpha.clip(0, 255).astype(np.uint8)])
    art = Image.fromarray(out, "RGBA").crop(box)
    if art.width > 640:
        art = art.resize((640, round(art.height * 640 / art.width)), Image.LANCZOS)
    art.save(f"{stem}.png", optimize=True)
    art.save(f"{stem}.avif", quality=90)
    print(f"{stem}: {art.size}, hole {hole}")


def fill_disc(img, cx, cy, r):
    """Fill a disc from its surroundings: repeated neighbour averaging (a heat
    fill) from the ring just outside, then a little grain so it isn't a smear."""
    h, w, _ = img.shape
    x0, x1 = int(max(0, cx - r - 4)), int(min(w, cx + r + 5))
    y0, y1 = int(max(0, cy - r - 4)), int(min(h, cy + r + 5))
    win = img[y0:y1, x0:x1].copy()
    yy, xx = np.mgrid[y0:y1, x0:x1]
    m = (xx - cx) ** 2 + (yy - cy) ** 2 <= r * r
    ring = ((xx - cx) ** 2 + (yy - cy) ** 2 <= (r + 4) ** 2) & ~m
    win[m] = win[ring].mean(axis=0)
    for _ in range(int(r * 6)):
        avg = (np.roll(win, 1, 0) + np.roll(win, -1, 0) + np.roll(win, 1, 1) + np.roll(win, -1, 1)) / 4
        win[m] = avg[m]
    grain = np.random.default_rng(7).normal(0, win[ring].std(axis=0).mean() * 0.15, win.shape)
    win[m] += grain[m]
    img[y0:y1, x0:x1] = win
    return img


def find_hole(rgb, w, h):
    """The hang hole: a calm, even disc that stands apart from what surrounds it
    (white or grey on a printed wrapper). Score = how far the disc's colour is
    from the ring just outside it, minus how busy the disc is."""
    img = rgb.astype(np.float32)
    best = (0, 0, 0, -1)
    a_in = np.linspace(0, 2 * np.pi, 16, endpoint=False)
    a_out = np.linspace(0, 2 * np.pi, 32, endpoint=False)
    for r in np.arange(w * 0.034, w * 0.06, w * 0.004):
        for cy in np.arange(h * 0.035, h * 0.12, max(2, h * 0.003)):
            for cx in np.arange(w * 0.36, w * 0.64, max(2, w * 0.004)):
                pin = []
                for k in (0.0, 0.35, 0.7):
                    if k == 0:
                        pin.append(img[int(cy), int(cx)][None])
                    else:
                        pin.append(img[(cy + np.sin(a_in) * r * k).astype(int), (cx + np.cos(a_in) * r * k).astype(int)])
                pin = np.vstack(pin)
                pout = img[(cy + np.sin(a_out) * r * 1.35).astype(int).clip(0, h - 1), (cx + np.cos(a_out) * r * 1.35).astype(int).clip(0, w - 1)]
                gap = np.abs(pin.mean(axis=0) - pout.mean(axis=0)).mean()
                busy = pin.std(axis=0).mean()
                score = gap - 1.5 * busy
                if score > best[3]:
                    best = (cx, cy, r, score)
    return best


if __name__ == "__main__":
    # Optional third argument: the hole as x,y,r fractions (see cut()).
    at = tuple(float(v) for v in sys.argv[3].split(",")) if len(sys.argv) > 3 and sys.argv[3] != "-" else None
    cut(sys.argv[1], sys.argv[2], at, sys.argv[4] if len(sys.argv) > 4 else None)
