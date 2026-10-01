#!/usr/bin/env python3
"""Draw the Shining Pokemon foil masks of Neo Revelation (neo3 65-66) and Neo Destiny (neo4 106-113).

TCG Live has no maps for this generation, and a Shining's foil is not the art window: the real cards put the foil on the
Pokemon figure only (Neo Destiny) or on the background only (Neo Revelation), so each card needs its own silhouette.
The silhouettes are cut from the scan (the figure is dark or distinctly coloured against the art, and the scan's own foil
grain marks it): colour seeds into GrabCut, the largest component, holes filled, a one pixel soften. Neo Destiny keeps the
figure, Neo Revelation keeps the art window minus the figure. Output: assets/foil/wotc-shining/<set>-<n>.webp, 600 x 838
alpha (the Neo frame's art window is x 65-537, y 95-429 of 600 x 838), lossless. Never overwrites: pass --suffix -v2 for a redraw.

    python3 .claude/skills/card-textures/scripts/make_wotc_shining_masks.py [--out assets/foil/wotc-shining] [--suffix ""]

Needs opencv-python-headless and scipy. The crop used for the drawing is (58, 93)-(548, 440); window rect below is inside it.
"""
import argparse, os, sys
import numpy as np
import cv2
import scipy.ndimage as ndi
from PIL import Image, ImageDraw

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
CROP = (58, 93, 548, 440)
WIN = (65, 95, 537, 429)   # art window in card pixels, x0 y0 x1 y1


def load(s, n):
    im = np.asarray(Image.open(os.path.join(ROOT, "assets/cards", s, f"{n}.webp")).convert("RGB"))
    return im[CROP[1]:CROP[3], CROP[0]:CROP[2]].copy()


def hsv(im):
    h = cv2.cvtColor(im, cv2.COLOR_RGB2HSV)
    return h[..., 0].astype(int) * 2, h[..., 1].astype(int), h[..., 2].astype(int)


def ero(m, i):
    return ndi.binary_erosion(m, iterations=i)


def lcc(m):
    l, n = ndi.label(m)
    if n == 0:
        return m
    sz = ndi.sum(m, l, range(1, n + 1))
    return l == (1 + int(np.argmax(sz)))


def gc(im, fg, bg, it=6):
    mask = np.full(im.shape[:2], cv2.GC_PR_BGD, np.uint8)
    mask[bg] = cv2.GC_BGD
    mask[fg] = cv2.GC_FGD
    b = np.zeros((1, 65)); f = np.zeros((1, 65))
    cv2.grabCut(cv2.cvtColor(im, cv2.COLOR_RGB2BGR), mask, None, b, f, it, cv2.GC_INIT_WITH_MASK)
    return (mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD)


def tidy(m, open_=2):
    return ndi.binary_fill_holes(lcc(ndi.binary_opening(m, iterations=open_)))


def poly(pts):
    P = Image.new("L", (CROP[2] - CROP[0], CROP[3] - CROP[1]), 0)
    ImageDraw.Draw(P).polygon(pts, fill=255)
    return np.asarray(P) > 0


def figure(s, n):
    im = load(s, n)
    h, sa, v = hsv(im)
    if (s, n) == ("neo4", 106):        # Celebi: black figure on magenta
        return tidy(gc(im, ero(v < 70, 2), ero((v > 120) & (sa > 100), 3) | ero(v > 200, 2)), 1)
    if (s, n) == ("neo4", 107):        # Charizard: navy figure on pale yellow; the flame blob at the bottom is print, not foil
        m = gc(im, ero((v < 95) & (sa > 60), 2), ero(v > 150, 3))
        m[240:, :335] = False
        return tidy(m, 1)
    if (s, n) == ("neo4", 108):        # Kabutops
        return tidy(gc(im, ero(v < 70, 2), ero(v > 150, 3)), 1)
    if (s, n) == ("neo4", 109):        # Mewtwo: blue figure in a white glow on purple
        m = gc(im, ero((h > 200) & (h < 250) & (sa > 90) & (v < 150), 2),
               ero(((h > 255) | (h < 190)) & (v > 100), 3) | ero((v > 200) & (sa < 80), 2))
        return tidy(m)
    if (s, n) == ("neo4", 110):        # Noctowl: the figure is the region inside the pale outline glow
        glow = (v > 150) & (sa < 110)
        lab, _ = ndi.label(ndi.binary_opening(~glow, iterations=2))
        m = ndi.binary_closing(lab == lab[100, 250], iterations=10)
        return ndi.binary_fill_holes(ndi.binary_dilation(m, iterations=3))
    if (s, n) == ("neo4", 111):        # Raichu: olive figure on blue and white
        m = gc(im, ero((h > 50) & (h < 110) & (sa > 60) & (v < 170), 2),
               ero(((h > 180) & (h < 230) & (sa > 60) & (v > 150)) | (v > 215), 3))
        return tidy(m)
    if (s, n) == ("neo4", 112):        # Steelix: dark green figure in a yellow glow
        hh = h // 2
        m = gc(im, ero((h > 60) & (h < 190) & (v < 110), 2), ero((sa > 110) & (v > 110), 3) | ero((h > 240) & (v > 60), 2))
        return tidy(m, 1)
    if (s, n) == ("neo4", 113):        # Tyranitar: grey figure in a yellow glow on a starfield
        return tidy(gc(im, ero((v < 85) & (sa < 120), 3), ero((sa > 150) & (v > 150), 2)))
    if (s, n) == ("neo3", 66):         # Magikarp: yellow figure on a dark star field
        return tidy(gc(im, ero((h > 40) & (h < 75) & (sa > 45) & (v > 150), 1), ero(v < 100, 3)), 1)
    if (s, n) == ("neo3", 65):         # Gyarados: the serpent, hand polygon then colour
        P = poly([(245, 40), (300, 20), (380, 25), (430, 40), (440, 110), (425, 250), (410, 310), (335, 312), (345, 235), (325, 175), (265, 165), (240, 135)])
        fg = ero(P, 8) & (v > 85)
        bg = ~ndi.binary_dilation(P, iterations=6)
        m = gc(im, fg, bg) & ndi.binary_dilation(P, iterations=4)
        return ndi.binary_fill_holes(ndi.binary_closing(ndi.binary_opening(m, iterations=1), iterations=3))
    raise SystemExit(f"no recipe for {s}-{n}")


def to_card(m_crop, keep_figure=True):
    """Place a crop-space boolean into a 600 x 838 alpha, clipped to the art window."""
    full = np.zeros((838, 600), np.float32)
    win = np.zeros_like(full)
    win[WIN[1]:WIN[3], WIN[0]:WIN[2]] = 1
    f = np.zeros_like(full)
    f[CROP[1]:CROP[3], CROP[0]:CROP[2]] = m_crop
    if keep_figure:
        f = ndi.gaussian_filter(ndi.binary_erosion(f > 0, iterations=1).astype(np.float32), 0.8)
    else:
        g = ndi.binary_fill_holes(ndi.binary_closing(f > 0, iterations=9))   # the figure stays matte, with a margin
        f = 1 - ndi.gaussian_filter(ndi.binary_dilation(g, iterations=4).astype(np.float32), 1.0)
    return np.clip(f * win, 0, 1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(ROOT, "assets/foil/wotc-shining"))
    ap.add_argument("--suffix", default="")
    ap.add_argument("--debug", default="")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    for s, n in [("neo3", 65), ("neo3", 66)] + [("neo4", k) for k in range(106, 114)]:
        m = figure(s, n)
        alpha = to_card(m, keep_figure=(s == "neo4"))
        f = os.path.join(a.out, f"{s}-{n}{a.suffix}.webp")
        if os.path.exists(f):
            sys.exit(f"{f} exists: never overwrite an asset, use --suffix -v2")
        Image.fromarray((alpha * 255).astype(np.uint8), "L").save(f, lossless=True)
        print(f, int((alpha > 0.5).sum()))
        if a.debug:
            os.makedirs(a.debug, exist_ok=True)
            im = np.asarray(Image.open(os.path.join(ROOT, "assets/cards", s, f"{n}.webp")).convert("RGB")).copy()
            ov = im.copy(); k = alpha > 0.5; ov[k] = (0.5 * ov[k] + 0.5 * np.array([255, 0, 255])).astype(np.uint8)
            Image.fromarray(np.hstack([im, ov])).save(os.path.join(a.debug, f"{s}-{n}.png"))


if __name__ == "__main__":
    main()
