#!/usr/bin/env python3
"""Neo Destiny (neo4) holo family: the per-card FOIL AREA of the art window, drawn from the card's own scan.

What the real card does (refs in /mnt/project-files/holo-remaster/wotc-neo-destiny/refs/SOURCES.md): the cosmos holofoil
shows in the art window's BACKGROUND only. The Pokémon is ink laid over a white underlay and stays matte; so do the
evolution badge printed over the window's top-left corner, the gold window frame and everything outside it. Miracle
Energy 16 has no Pokémon: its foil is the nebula field of the picture, and the two printed spheres (and their rays) are
matte ink.

So the foil area is "the window where the cosmos background shows". This module finds it per card:

1. the window: the inner edge of the gold frame, measured on each scan (the scans sit a few pixels apart);
2. the evolution badge: a disc at the window's top-left corner (every Neo Destiny holo Pokémon is a Stage 1 or 2);
3. the figure: OpenCV GrabCut inside the window, seeded by a central ellipse and steered by hand hints per card
   (`nd_hints.json`: `fg` / `bg` dabs [x, y, r] and `fgpoly` / `bgpoly` polygons, in window pixels, i.e. scan pixels
   minus the window's top-left corner), cleaned (small islands dropped, small holes filled) and grown one pixel so the
   figure's dark outline counts as figure.

`foil_area(n)` returns (bg, box): bg is a float32 array the size of the scan (1 = foil, 0 = matte, a soft 1 px edge),
box is the window rectangle (x0, y0, x1, y1) in scan pixels. `make_nd_maps.py` turns it into the shipped maps.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

cv2.setNumThreads(1)
ROOT = Path(__file__).resolve().parents[6]
SCANS = ROOT / "assets" / "cards" / "neo4"
HINTS_FILE = Path(__file__).with_name("nd_hints.json")
W, H = 600, 838
# a generous search box for the Pokémon layout's window (scan pixels); the real edge is measured inside it
POKEMON_SEARCH = (50, 85, 550, 440)


def load(n: int) -> np.ndarray:
    return np.asarray(Image.open(SCANS / f"{n}.webp").convert("RGB")).astype(np.float32) / 255.0


def hints() -> dict:
    try:
        return json.loads(HINTS_FILE.read_text())
    except FileNotFoundError:
        return {}


def _edge(profile: np.ndarray, lo: int, hi: int) -> int:
    """Index of the strongest step in a 1-D profile between lo and hi."""
    seg = np.abs(np.diff(profile[lo:hi]))
    return lo + int(np.argmax(seg)) + 1


def window_box(rgb: np.ndarray) -> tuple[int, int, int, int]:
    """The art window's inner edge (x0, y0, x1, y1), x1/y1 exclusive, measured on the scan.

    The window frame is a gold bevel about 10 px wide; the art starts with a sharp step in brightness on its inner side.
    Each side is searched in a narrow band around where the Pokémon layout puts it (the scans sit a few pixels apart),
    with the per-row (or per-column) absolute brightness step averaged over the middle of the side, so the evolution
    badge (top left) and a Pokémon that reaches the edge count for little. The result is inset by one pixel so the
    frame's own inner line stays out of the foil."""
    lum = rgb @ np.array([0.299, 0.587, 0.114], np.float32)
    dx = np.abs(np.diff(lum, axis=1))  # dx[:, i] is the step between x=i and x=i+1
    dy = np.abs(np.diff(lum, axis=0))
    rows = slice(160, 400)
    cols = slice(170, 460)
    left = 54 + int(np.argmax(dx[rows, 54:67].mean(0))) + 1
    right = 529 + int(np.argmax(dx[rows, 529:543].mean(0))) + 1
    top = 89 + int(np.argmax(dy[89:101, cols].mean(1))) + 1
    bottom = 423 + int(np.argmax(dy[423:436, cols].mean(1))) + 1
    return left + 1, top + 1, right - 1, bottom - 1


def badge_disc(rgb: np.ndarray, box) -> tuple[float, float, float]:
    """The evolution badge's disc (cx, cy, r) in scan pixels. The badge is printed at a fixed place on the frame: on the
    mean of the fifteen Neo Destiny holo Pokémon scans, aligned on their windows' top-left corners, the Hough transform
    finds its outer ring 49.4 px in radius, centred 8.5 px left of and 19.5 px above the window's corner (measured
    2026-10-01; every one of them is a Stage 1 or 2). Its lower right quarter overlaps the window and is printed ink."""
    x0, y0, _, _ = box
    return x0 - 8.5, y0 - 19.5, 49.4


def _poly_mask(shape, polys, ox, oy) -> np.ndarray:
    m = np.zeros(shape, np.uint8)
    for poly in polys:
        pts = np.array([[x, y] for x, y in poly], np.int32)
        cv2.fillPoly(m, [pts], 1)
    return m.astype(bool)


@lru_cache(maxsize=None)
def foil_area(n: int) -> tuple[np.ndarray, tuple[int, int, int, int]]:
    rgb = load(n)
    hint = hints().get(str(n), {})
    box = tuple(hint.get("box") or window_box(rgb))
    x0, y0, x1, y1 = box
    crop = rgb[y0:y1, x0:x1]
    h, w = crop.shape[:2]
    img8 = (crop * 255).astype(np.uint8)[..., ::-1].copy()  # BGR for OpenCV

    if hint.get("full"):
        figure = np.zeros((h, w), bool)
    else:
        mask = np.full((h, w), cv2.GC_PR_BGD, np.uint8)
        # seed: a central ellipse is probably the Pokémon (or the hint's own ellipse)
        ex, ey, ea, eb = hint.get("ellipse", [w / 2, h / 2, w * 0.28, h * 0.36])
        yy, xx = np.mgrid[0:h, 0:w]
        ell = ((xx - ex) / ea) ** 2 + ((yy - ey) / eb) ** 2 <= 1
        mask[ell] = cv2.GC_PR_FGD
        for x, y, r in hint.get("fg", []):
            cv2.circle(mask, (int(x), int(y)), int(r), cv2.GC_FGD, -1)
        for x, y, r in hint.get("bg", []):
            cv2.circle(mask, (int(x), int(y)), int(r), cv2.GC_BGD, -1)
        if hint.get("fgpoly"):
            mask[_poly_mask((h, w), hint["fgpoly"], 0, 0)] = cv2.GC_FGD
        if hint.get("bgpoly"):
            mask[_poly_mask((h, w), hint["bgpoly"], 0, 0)] = cv2.GC_BGD
        if hint.get("prfgpoly"):
            pm = _poly_mask((h, w), hint["prfgpoly"], 0, 0)
            mask[pm & (mask == cv2.GC_PR_BGD)] = cv2.GC_PR_FGD
        # a traced outline: well inside it is surely figure, well outside surely background, GrabCut settles the band
        if hint.get("outline"):
            band = int(hint.get("band", 5))
            inside = _poly_mask((h, w), hint["outline"], 0, 0)
            for cx, cy, rr in hint.get("outline_discs", []):
                yy2, xx2 = np.mgrid[0:h, 0:w]
                inside |= ((xx2 - cx) ** 2 + (yy2 - cy) ** 2) <= rr ** 2
            sure_in = ndi.binary_erosion(inside, iterations=band)
            sure_out = ~ndi.binary_dilation(inside, iterations=band)
            mask[:] = np.where(inside, cv2.GC_PR_FGD, cv2.GC_PR_BGD)
            mask[sure_in] = cv2.GC_FGD
            mask[sure_out] = cv2.GC_BGD
            for x, y, r in hint.get("fg", []):
                cv2.circle(mask, (int(x), int(y)), int(r), cv2.GC_FGD, -1)
            for x, y, r in hint.get("bg", []):
                cv2.circle(mask, (int(x), int(y)), int(r), cv2.GC_BGD, -1)
        if not (mask == cv2.GC_FGD).any() and not (mask == cv2.GC_PR_FGD).any():
            figure = np.zeros((h, w), bool)
        else:
            bgd = np.zeros((1, 65), np.float64)
            fgd = np.zeros((1, 65), np.float64)
            rs = np.random.RandomState(7)
            cv2.setRNGSeed(7)
            cv2.grabCut(img8, mask, None, bgd, fgd, int(hint.get("iters", 8)), cv2.GC_INIT_WITH_MASK)
            figure = (mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD)
            # clean: drop small islands of figure, fill small holes
            lab, k = ndi.label(figure)
            if k:
                sizes = ndi.sum(figure, lab, range(1, k + 1))
                keep_min = float(hint.get("min_island", 220))
                figure = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= keep_min])
            holes = ndi.binary_fill_holes(figure) & ~figure
            lab, k = ndi.label(holes)
            if k:
                sizes = ndi.sum(holes, lab, range(1, k + 1))
                hole_max = float(hint.get("max_hole", 160))
                small = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s <= hole_max])
                figure |= small
            # smooth the outline a little, then grow it so the dark line art belongs to the figure
            figure = ndi.binary_opening(figure, iterations=1)
            figure = ndi.binary_closing(figure, iterations=2)
            grow = int(hint.get("grow", 1))
            if grow > 0:
                figure = ndi.binary_dilation(figure, iterations=grow)
            elif grow < 0:
                figure = ndi.binary_erosion(figure, iterations=-grow)
        # colour-keyed figure parts GrabCut cannot tell from a background of the same hue (Dark Typhlosion's collar
        # flames over the fire): inside the polygon, a pixel whose channel is above the key is figure
        for k in hint.get("keyed", []):
            inside = _poly_mask((h, w), [k["poly"]], 0, 0)
            c = k.get("channel", "g")
            if c == "r-b":
                ch = crop[..., 0] - crop[..., 2]
            elif c == "l":
                ch = crop @ np.array([0.299, 0.587, 0.114], np.float32)
            else:
                ch = crop[..., "rgb".index(c)]
            ch = cv2.GaussianBlur(np.ascontiguousarray(ch), (0, 0), 1.0)
            keyed = inside & (ch > float(k["min"]))
            lab, nk = ndi.label(keyed)
            if nk:
                sizes = ndi.sum(keyed, lab, range(1, nk + 1))
                keyed = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= 40])
            figure |= ndi.binary_closing(keyed, iterations=1)
        # hard overrides after GrabCut
        if hint.get("fgpoly"):
            figure |= _poly_mask((h, w), hint["fgpoly"], 0, 0)
        if hint.get("bgpoly"):
            figure &= ~_poly_mask((h, w), hint["bgpoly"], 0, 0)
        for x, y, r in hint.get("fg", []):
            cv2.circle(figure.view(np.uint8), (int(x), int(y)), int(r), 1, -1)
        for x, y, r in hint.get("bg", []):
            cv2.circle(figure.view(np.uint8), (int(x), int(y)), int(r), 0, -1)

    win = (~figure).astype(np.float32)
    # translucent parts (Dark Scizor's wings): the sky and its foil show through thin pale ink, so inside the hint's
    # polygon the foil fades with the ink's lightness (dark = foil, pale = matte); strongly coloured ink (the red body)
    # stays matte. {"poly": [[x, y], ...], "lo": L where the foil is full, "hi": L where it is gone, "sat", "blur"}
    for g in hint.get("graded", []):
        inside = _poly_mask((h, w), [g["poly"]], 0, 0)
        # a median first: small bright dots in the sky are stars knocked out of the ink (bare foil), not pale ink
        lum = ndi.median_filter(crop @ np.array([0.299, 0.587, 0.114], np.float32), size=int(g.get("median", 11)))
        lum = cv2.GaussianBlur(lum, (0, 0), float(g.get("blur", 1.5)))
        sat = cv2.GaussianBlur(crop.max(2) - crop.min(2), (0, 0), 1.0)
        lo, hi = float(g.get("lo", 0.45)), float(g.get("hi", 0.78))
        t = np.clip((lum - lo) / (hi - lo), 0, 1)
        alpha = 1 - t * t * (3 - 2 * t)
        alpha[sat > float(g.get("sat", 0.35))] = 0
        win[inside] = alpha[inside]
    # bare foil the hints know of (window pixels): e.g. a big star knocked out of a translucent wing
    for x, y, r in hint.get("foil_discs", []):
        cv2.circle(win, (int(x), int(y)), int(r), 1.0, -1)
    foil = np.zeros((H, W), np.float32)
    foil[y0:y1, x0:x1] = win
    # the evolution badge is printed ink over the window corner: matte
    if not hint.get("no_badge"):
        disc = hint.get("badge") or badge_disc(rgb, box)
        if disc is not None:
            cx, cy, rr = disc
            yy, xx = np.mgrid[0:H, 0:W]
            foil[((xx - cx) ** 2 + (yy - cy) ** 2) <= (rr + 1.5) ** 2] = 0
    # matte everywhere else the hints say (scan pixels): e.g. Miracle Energy's spheres as circles
    for cx, cy, rr in hint.get("matte_discs", []):
        yy, xx = np.mgrid[0:H, 0:W]
        foil[((xx - cx) ** 2 + (yy - cy) ** 2) <= rr ** 2] = 0
    # a soft 1 px edge: the window's own edge stays crisp, the figure edge is eased in
    soft = cv2.GaussianBlur(foil, (0, 0), float(hint.get("feather", 0.8)))
    return soft.astype(np.float32), box


if __name__ == "__main__":
    import sys

    for n in map(int, sys.argv[1:] or range(1, 16)):
        rgb = load(n)
        print(n, window_box(rgb), badge_disc(rgb, window_box(rgb)))
