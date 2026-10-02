#!/usr/bin/env python3
"""Draw the foil masks of the WotC Shining family (holo remaster, 2026-10-01): where each real card is foil.

Neo Destiny 106-113: the Pokemon FIGURE is the foil (photos in /mnt/project-files/holo-remaster/wotc-shining/refs/), and on
Shining Charizard the flame blast under the tail too (it shows the same sparkle grain as the body in three photos; the 2026
j3 mask called it print). Neo Revelation 65-66: the art window's BACKGROUND (the Neo galaxy foil), the Pokemon (and the kayaker
on Gyarados) matte.

How: the j3 masks (assets/foil/wotc-shining/<set>-<n>.webp, read only) or a hand polygon seed GrabCut on the scan in a band
around their edge, so the edge lands on the drawing's outline; then a smooth (Gaussian 1.4 of the binary, re-thresholded: no
staircase, no notches from the foil grain), holes filled, a 0.7 px feather. Per-card fixes: Charizard adds the flame blob, its
two shards and the tail's end (dark, V < 100, inside a hand box; the rock lines are V > 120); Noctowl and Gyarados start from a
hand polygon (the j3 cuts were jagged and cut a horn / foiled the kayaker); Steelix is smoothed harder (its edge followed the grain).

Output (new files only, white with the mask in alpha, 600 x 838 like the scans): assets/foil/fam/wotc-shining/<set>-<n>-mask-v1.webp.
    python3 .claude/skills/card-textures/scripts/fam/wotc-shining/make_masks.py [--debug DIR] [--force]
--force rewrites this family's own files (allowed until the family ships; after that, bump VERSION).
Seeded and deterministic (GrabCut runs with a fixed RNG seed).
"""
import argparse, os, sys
import numpy as np
import cv2
import scipy.ndimage as ndi
from PIL import Image, ImageDraw

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "..", ".."))
OUT = os.path.join(ROOT, "assets/foil/fam/wotc-shining")
OLD = os.path.join(ROOT, "assets/foil/wotc-shining")
VERSION = "v1"
W, H = 600, 838
CARDS = [("neo3", 65), ("neo3", 66)] + [("neo4", k) for k in range(106, 114)]


def scan(s, n):
    return np.asarray(Image.open(os.path.join(ROOT, "assets/cards", s, f"{n}.webp")).convert("RGB"))


def old(s, n):
    return np.asarray(Image.open(os.path.join(OLD, f"{s}-{n}.webp")).convert("L")).astype(np.float32) / 255 > 0.5


def poly(pts):
    P = Image.new("L", (W, H), 0)
    ImageDraw.Draw(P).polygon(pts, fill=255)
    return np.asarray(P) > 0


def window(im):
    """This scan's art window (scans sit 1-3 px apart): the median strongest frame-to-art edge on each side."""
    L = im.astype(np.float32).mean(2)
    gx, gy = np.abs(np.diff(L, axis=1)), np.abs(np.diff(L, axis=0))
    ex = lambda lo, hi: int(np.median([lo + np.argmax(gx[y, lo:hi]) for y in range(130, 400, 3)])) + 1
    ey = lambda lo, hi: int(np.median([lo + np.argmax(gy[lo:hi, x]) for x in range(100, 500, 3)])) + 1
    x0, y0, x1, y1 = ex(56, 72), ey(88, 104), ex(528, 546), ey(420, 438)
    m = np.zeros((H, W), bool)
    m[y0:y1, x0:x1] = True
    return m


def disk(r):
    y, x = np.ogrid[-r:r + 1, -r:r + 1]
    return x * x + y * y <= r * r + r


def grabcut(im, m0, band=5, it=5):
    """GrabCut seeded by m0: sure foreground deep inside, sure background well outside, probable in a band at its edge."""
    cv2.setRNGSeed(7)
    mask = np.full(m0.shape, cv2.GC_PR_BGD, np.uint8)
    mask[ndi.binary_dilation(m0, iterations=band) & ~m0] = cv2.GC_PR_BGD
    mask[m0] = cv2.GC_PR_FGD
    mask[ndi.binary_erosion(m0, iterations=band)] = cv2.GC_FGD
    mask[~ndi.binary_dilation(m0, iterations=band)] = cv2.GC_BGD
    b = np.zeros((1, 65)); f = np.zeros((1, 65))
    cv2.grabCut(cv2.cvtColor(im, cv2.COLOR_RGB2BGR), mask, None, b, f, it, cv2.GC_INIT_WITH_MASK)
    return (mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD)


def smooth(m, sigma=1.4):
    return ndi.gaussian_filter(m.astype(np.float32), sigma) > 0.5


def keep_big(m, min_px=60):
    lab, k = ndi.label(m)
    if k == 0:
        return m
    sz = ndi.sum(m, lab, range(1, k + 1))
    return np.isin(lab, [i + 1 for i, v in enumerate(sz) if v >= min_px])


def figure(s, n, im):
    """The boolean figure (the Pokemon, plus Charizard's flame) in card pixels."""
    v = im.max(axis=2).astype(int)
    if (s, n) == ("neo4", 110):
        # Noctowl: everything inside the pale glow outline: the face, both feather horns to the window top, the right cheek to
        # the window edge. Hand polygon traced on the scan (card px), then GrabCut snaps it to the glow.
        P = poly([(176, 90), (262, 90), (240, 112), (234, 130), (231, 175), (238, 210), (272, 212), (285, 185), (305, 168),
                  (366, 162), (367, 90), (480, 90), (482, 135), (515, 160), (542, 178), (542, 436), (283, 436), (275, 405),
                  (262, 382), (232, 350), (212, 320), (190, 290), (170, 270), (172, 215), (175, 150)])
        m = grabcut(im, P, band=4)
    elif s == "neo3":
        # The matte print inside the galaxy foil. j3's cut (window minus its mask) is close but blocky with a 5-10 px margin on
        # Gyarados: inside it, the figure is what is not the navy sky (red channel > 45: the sky and its cosmos dots are R < 40,
        # Gyarados's reds, creams and pale fins R > 70), small specks dropped, closed across the black outlines, holes filled.
        win = window(im)
        fig0 = win & ~old(s, n)
        R = im[..., 0].astype(int)
        cand = keep_big((R > 45) & ndi.binary_dilation(fig0, iterations=3), 80)
        cand = ndi.binary_fill_holes(ndi.binary_closing(cand, structure=disk(3)))
        m0 = keep_big(ndi.binary_opening(cand, structure=disk(1)), 300)
        if n == 65:
            # the kayaker, his boat and paddle are matte too (flat print in the angled photos; j3 foiled them): a hand polygon
            K = poly([(150, 322), (162, 318), (170, 322), (170, 334), (176, 345), (200, 350), (214, 358), (230, 360), (278, 358),
                      (284, 355), (300, 356), (312, 362), (312, 372), (298, 376), (280, 368), (258, 368), (250, 376), (250, 392),
                      (236, 406), (214, 414), (190, 414), (166, 408), (150, 402), (120, 413), (100, 412), (96, 404), (108, 398),
                      (140, 388), (146, 370), (150, 352), (148, 336)])
            m0 = m0 | K
        m = grabcut(im, m0, band=3)
    else:
        m0 = old(s, n)
        if (s, n) == ("neo4", 107):
            # the flame blast, its shards and the tail's end: dark (V < 100) inside a hand box under the tail; the rock lines are V > 120
            box = poly([(196, 352), (300, 340), (330, 330), (420, 352), (446, 380), (452, 428), (196, 428)])
            dark = (v < 100) & box
            dark = ndi.binary_opening(dark, iterations=1)
            m0 = m0 | keep_big(dark, 30)
        # background seen through gaps in the figure (Kabutops, Mewtwo, the loop of Raichu's tail): near-white patches the
        # metal never has
        gaps = keep_big(ndi.binary_opening(v > 215, iterations=1), 40)
        m = grabcut(im, m0 & ~gaps, band=4)
        if (s, n) == ("neo4", 107):
            m = m | ndi.binary_opening(((v < 100) & box), iterations=1)
    m = fill_holes(m, s, n, v)
    m = smooth(m, 2.0 if (s, n) == ("neo4", 112) else 1.4)
    return keep_big(fill_holes(m, s, n, v), 40)


def fill_holes(m, s, n, v):
    """Fill the figure's holes (GrabCut drops grain specks inside the dark metal), except real gaps of background seen
    through the figure (Kabutops between arm and body): holes of 40 px or more that are near white (mean V > 215; the
    blue rim lights on Raichu's bolt stay foil)."""
    f = ndi.binary_fill_holes(m)
    if s == "neo3":
        return f
    lab, k = ndi.label(f & ~m)
    for i in range(1, k + 1):
        h = lab == i
        if h.sum() >= 40 and v[h].mean() > 215:
            f[h] = False
    return f


def alpha_for(s, n, fig, im):
    win = window(im)
    if s == "neo4":
        a = ndi.gaussian_filter(fig.astype(np.float32), 0.7)
    else:
        # the matte figure keeps a 2 px margin so the foil stops at its outline, not on it
        g = ndi.binary_dilation(fig, iterations=2)
        a = 1 - ndi.gaussian_filter(g.astype(np.float32), 0.8)
    a = a * ndi.gaussian_filter(win.astype(np.float32), 0.5)
    return np.clip(a, 0, 1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--debug", default="")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--only", default="")
    a = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    for s, n in CARDS:
        if a.only and f"{s}-{n}" not in a.only.split(","):
            continue
        im = scan(s, n)
        fig = figure(s, n, im)
        al = alpha_for(s, n, fig, im)
        f = os.path.join(OUT, f"{s}-{n}-mask-{VERSION}.webp")
        if os.path.exists(f) and not a.force:
            sys.exit(f"{f} exists: pass --force (before the family ships) or bump VERSION")
        # an ALPHA mask (white, the mask in the alpha channel): mask-mode alpha is every engine's default, WebKit included
        rgba = np.zeros((H, W, 4), np.uint8)
        rgba[..., :3] = 255
        rgba[..., 3] = (al * 255).round().astype(np.uint8)
        Image.fromarray(rgba, "RGBA").save(f, lossless=True, quality=100, method=6)
        print(f, int((al > 0.5).sum()))
        if a.debug:
            os.makedirs(a.debug, exist_ok=True)
            e = np.hypot(*np.gradient(al)); e = np.clip(e * 3, 0, 1)[..., None]
            ov = im.astype(np.float32) * (1 - e) + np.array([255, 0, 255], np.float32) * e
            crop = Image.fromarray(ov.astype(np.uint8)).crop((60, 90, 542, 434)).resize((964, 688), Image.LANCZOS)
            crop.save(os.path.join(a.debug, f"{s}-{n}-mask.png"))


if __name__ == "__main__":
    main()
