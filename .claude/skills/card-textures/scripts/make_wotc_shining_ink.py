#!/usr/bin/env python3
"""Draw the line-art ink maps of the Neo Destiny Shining Pokemon (neo4 106-113): `assets/foil/wotc-shining/neo4-<n>-ink.webp`.

The real Shining figure is a smooth mirror metal with the drawing's black lines over it; the scans carry the foil baked in as
a grain, so any blend that lights the scan (colour-dodge, screen) also amplifies that grain into sandy glitter. The foil
(css/holo/wotc-special.css) is therefore painted smooth and opaque on the figure mask, and the printed lines come back from
these maps: thin dark connected strokes inside the figure (a black-hat of the blurred scan, kept only when long enough to
be a line, not a fleck), dilated a pixel, drawn as a MULTIPLY map (white = no change, down to about 0.3 where a line crosses the darkest form shading) that
the sheet multiplies onto the foil as a background layer: the lines plus the scan's low-frequency form shading (the
baked grain blurred away). L-mode webp, 600 x 838.

    python3 .claude/skills/card-textures/scripts/make_wotc_shining_ink.py [--out assets/foil/wotc-shining]

Never overwrites an existing file. Needs numpy, scipy, opencv-python-headless, Pillow.
"""
import argparse, os, sys
import numpy as np
import cv2
import scipy.ndimage as ndi
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
IDS = range(106, 114)


def ink(n, thresh=9, min_area=45, min_extent=14, kernel=7):
    im = np.asarray(Image.open(os.path.join(ROOT, f"assets/cards/neo4/{n}.webp")).convert("RGB"))
    mask = np.asarray(Image.open(os.path.join(ROOT, f"assets/foil/wotc-shining/neo4-{n}.webp")).convert("L")).astype(float) / 255
    g = cv2.GaussianBlur(cv2.cvtColor(im, cv2.COLOR_RGB2GRAY), (0, 0), 1.0)
    bh = cv2.morphologyEx(g, cv2.MORPH_BLACKHAT, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel, kernel)))
    m = (bh > thresh) & ndi.binary_erosion(mask > 0.5, iterations=2)
    lab, _ = ndi.label(m, structure=np.ones((3, 3)))
    keep = np.zeros(m.shape, bool)
    for i, sl in enumerate(ndi.find_objects(lab)):
        a = lab[sl] == i + 1
        extent = max(sl[0].stop - sl[0].start, sl[1].stop - sl[1].start)
        if a.sum() >= min_area and extent >= min_extent:
            keep[sl] |= a
    lines = np.clip(ndi.gaussian_filter(ndi.binary_dilation(keep, iterations=1).astype(np.float32), 1.1) * 1.6, 0, 1)
    # Form shading: the scan's own low-frequency light and dark (sigma 7 swallows the baked grain), 0.72 .. 1 inside the figure.
    lo_f = cv2.GaussianBlur(cv2.cvtColor(im, cv2.COLOR_RGB2GRAY), (0, 0), 7.0).astype(np.float32)
    vals = lo_f[mask > 0.5]
    p5, p95 = np.percentile(vals, 5), np.percentile(vals, 95)
    shade = 0.72 + 0.28 * np.clip((lo_f - p5) / max(p95 - p5, 1), 0, 1)
    return np.clip(1 - shade * (1 - 0.5 * lines), 0, 1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(ROOT, "assets/foil/wotc-shining"))
    a = ap.parse_args()
    for n in IDS:
        f = os.path.join(a.out, f"neo4-{n}-ink.webp")
        if os.path.exists(f):
            sys.exit(f"{f} exists: never overwrite an asset")
        alpha = ink(n)
        Image.fromarray((255 - alpha * 255).astype(np.uint8), "L").save(f, lossless=True)
        print(f, "mean grey in the figure", int(255 - alpha[np.asarray(Image.open(os.path.join(a.out, f"neo4-{n}.webp")).convert("L")) > 128].mean() * 255))


if __name__ == "__main__":
    main()
