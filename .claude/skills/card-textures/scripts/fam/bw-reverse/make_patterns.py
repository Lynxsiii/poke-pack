#!/usr/bin/env python3
"""bw-reverse: the type tiles without their cost-symbol holes.

Draws: assets/foil/fam/bw-reverse/pattern-<kind>.webp (367x512 lossless WebP), a copy of the era's tile assets/foil/bw-reverse/<kind>.webp (the type's
       shaded Energy-symbol pattern, a card-sized picture) with the black discs inpainted.
Why:   the era's tiles were cut from one TCG Live map per type, and that print's attack-cost symbols are black discs (18 px across at the left edge, about
       x 37) in the tile: grass and fighting at y 313, psychic and colorless at y 334, dragon at y 293, plasma at y 293 and a pair at y 362 (x 37, 57), fighting a pair of half discs at y 365. Where the PRINT has a cost
       symbol (or the ability box, or its attack text) on that spot the disc is hidden, but a print whose attack block starts lower or higher shows it: under the
       family's overlay sheen a black tile pixel stays black, a dull olive disc on a mint body (review #3, bw6-1 Hoppip, bw6-4 Yanma, bw6-13 Roselia, bw8-2, bw8-4, bw11-4,
       bw9-1). The era's colour-dodge hid it. A disc is a black blob (< 12 of 255; plasma: under 200 on its white field) of at least 25 px^2, at most 20 px both ways, centred x < 70 and y 262-432.
How:   cv2.inpaint (Telea, radius 7) over each disc grown by 4 px (a half-hidden disc is filled whole). Only the kinds that have a disc are written; js/fam/bw-reverse.js points `--rev-pattern`
       at them (the era's own files stay untouched).
Run:   python3 make_patterns.py   (prints the kinds written and their discs)
"""
import json
from pathlib import Path
import cv2
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parents[6]
SRC = ROOT / "assets/foil/bw-reverse"
OUT = ROOT / "assets/foil/fam/bw-reverse"
KINDS = ["colorless", "darkness", "dragon", "fighting", "fire", "grass", "lightning", "metal", "plasma", "psychic", "water"]

written = {}
for kind in KINDS:
    im = np.asarray(Image.open(SRC / f"{kind}.webp").convert("RGB"))
    grey = im.mean(-1)
    # plasma's tile is a white field: its second disc (57, 293) is mid grey, so the level is "darker than the field" there
    lab, n = ndi.label(grey < (200 if kind == "plasma" else 12))
    mask = np.zeros(grey.shape, np.uint8)
    found = []
    for i in range(1, n + 1):
        ys, xs = np.where(lab == i)
        w, h = xs.max() - xs.min() + 1, ys.max() - ys.min() + 1
        cx, cy = xs.mean(), ys.mean()
        if len(ys) >= 25 and w <= 20 and h <= 20 and cx < 70 and 262 <= cy <= 432:
            blob = (lab == i).astype(np.uint8) * 255
            if h < 10:  # the black sliver of a half-hidden disc (fighting's second row, 10 x 4): the whole disc goes, centred 3 px higher
                cv2.circle(blob, (int(round(cx)), int(round(cy)) - 3), 10, 255, -1)
            mask |= cv2.dilate(blob, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
            found.append((int(cx), int(cy), int(len(ys))))
    if not found:
        continue
    out = cv2.inpaint(np.ascontiguousarray(im), mask, 7, cv2.INPAINT_TELEA)
    OUT.mkdir(parents=True, exist_ok=True)
    Image.fromarray(out, "RGB").save(OUT / f"pattern-{kind}.webp", lossless=True, quality=60, method=4)
    written[kind] = found
print(json.dumps(written))
