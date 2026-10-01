#!/usr/bin/env python3
"""Draw the foil masks of the Wizards promo reverses and the First Movie stamp.

Reverse holo promos (basep 34 Entei and 35 Pichu, bp 1, 2, 3, 8, 9): the foil covers the card face inside the yellow border and
stops at the art window, the name banner under it, and the small printed marks (the BEST logo, the PROMO star). Three frames:
`neo` (34, bp 1, 2, 9), `baby` (35: its gold rule banner is taller), `rocket` (bp 8: a shorter window) and `trainer` (bp 3: a picture window under a wooden TRAINER bar).
Rectangles measured on the scans (600 x 838), one soft pixel at the edges, alpha webp.

First Movie stamp (basep 2-5): the gold "Kids WB Presents / Pokemon / The First Movie" logo sits at the same place on all four
cards. Its ink is found per card (lighter than the art on the three dark ones, darker on the Dragonite's sky), the union of
the Mewtwo and Dragonite detections is kept, specks dropped, the letters thickened a pixel: `stamp-firstmovie.webp` (alpha =
where the gold foil is). The art window of those cards stays plain.

    python3 .claude/skills/card-textures/scripts/make_wotc_promo_masks.py [--out assets/foil/wotc-promo]

Never overwrites; pass --suffix -v2 to redraw. Needs numpy, scipy, opencv-python-headless, Pillow.
"""
import argparse, os, sys
import numpy as np
import scipy.ndimage as ndi
import cv2
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
W, H = 600, 838
FIELD = (21, 20, 580, 818)          # inside the yellow border: x0 y0 x1 y1

# rectangles that stay plain, per frame (x0, y0, x1, y1)
HOLES = {
    "neo": [(46, 80, 556, 478), (500, 430, 580, 492)],
    "baby": [(46, 80, 556, 478), (500, 430, 580, 492), (40, 478, 560, 548)],   # basep 35 Pichu: the baby rule's gold banner
    "rocket": [(46, 80, 556, 412), (498, 395, 580, 430)],
    "trainer": [(40, 36, 562, 140), (50, 190, 550, 472), (452, 494, 548, 542)],
}


def frame(name):
    a = np.zeros((H, W), np.float32)
    x0, y0, x1, y1 = FIELD
    a[y0:y1, x0:x1] = 1
    for hx0, hy0, hx1, hy1 in HOLES[name]:
        a[hy0:hy1, hx0:hx1] = 0
    return np.clip(ndi.gaussian_filter(a, 0.7), 0, 1)


def stamp():
    A = os.path.join(ROOT, "assets/cards/basep")
    box = (290, 85, 570, 270)
    def crop(n):
        return np.asarray(Image.open(os.path.join(A, f"basep0{n}.webp")).convert("RGB"))[box[1]:box[3], box[0]:box[2]]
    zone = np.zeros((box[3] - box[1], box[2] - box[0]), bool)
    zone[12:112, 66:244] = True
    im = crop(3)
    v = cv2.cvtColor(im, cv2.COLOR_RGB2HSV)[..., 2].astype(int)
    lighter = (v > ndi.median_filter(v, size=13) + 22) & zone
    im5 = crop(5)
    hsv = cv2.cvtColor(im5, cv2.COLOR_RGB2HSV)
    h, s, v5 = hsv[..., 0].astype(int) * 2, hsv[..., 1], hsv[..., 2].astype(int)
    darker = (v5 < ndi.median_filter(v5, size=15) - 35) & zone
    darker &= ~ndi.binary_dilation((h > 5) & (h < 50) & (s > 110), iterations=3)
    u = ndi.binary_closing(lighter | darker, iterations=1)
    l, n = ndi.label(u, structure=np.ones((3, 3)))
    sz = ndi.sum(u, l, range(1, n + 1))
    u = ndi.binary_dilation(np.isin(l, [i + 1 for i, k in enumerate(sz) if k >= 12]), iterations=1)
    a = np.zeros((H, W), np.float32)
    a[box[1]:box[3], box[0]:box[2]] = u
    return np.clip(ndi.gaussian_filter(a, 0.6) * 1.4, 0, 1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(ROOT, "assets/foil/wotc-promo"))
    ap.add_argument("--suffix", default="")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    items = [(k, frame(k)) for k in HOLES] + [("stamp-firstmovie", stamp())]
    for name, alpha in items:
        f = os.path.join(a.out, f"{name}{a.suffix}.webp")
        if os.path.exists(f):
            sys.exit(f"{f} exists: never overwrite an asset, use --suffix -v2")
        Image.fromarray((alpha * 255).astype(np.uint8), "L").save(f, lossless=True)
        print(f, int((alpha > 0.5).sum()))


if __name__ == "__main__":
    main()
