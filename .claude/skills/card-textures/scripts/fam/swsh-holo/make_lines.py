#!/usr/bin/env python3
"""The Sword & Shield Rare Holo's line screen (holo family swsh-holo, css/holo/fam/swsh-holo.css).

The real "Line" holofoil is a grating of fine vertical lines, about 120-160 across the card (FFT of same-art Japanese
and Chinese lit scans: ~120-125; Infernape BRS ~140; Rapidash SIT ~155). The sheet stretches this strip over the whole
card (background-size 100% 100%), so the pitch follows the card: LINES periods across, whatever the card's size.

Each line is a sinusoid, not a hard bar: drawn at PX source pixels per line and downscaled by the browser to about 4.7
device pixels per line on a phone (220 CSS px x 3), a band-limited profile cannot alias into a moiré or a hairline
screen, which a two-colour repeating gradient does in WebKit. Grey around 128: the sheet blends it in hard-light /
soft-light, where 0.5 is neutral, so AMP alone sets how strongly the lines show.

    python3 make_lines.py                       # assets/foil/fam/swsh-holo/lines-v1.webp
    python3 make_lines.py --amp 18 --out assets/foil/fam/swsh-holo/lines-soft-v1.webp

lines-soft-v1 is the screens of 1.5 dppx or less: there a 220 px card gives a line only 1.6 device px, past what the
pixel grid can draw, so the full-strength strip aliases into a coarser beat; at a third of the swing it reads as grain.
"""
import argparse
import math

import numpy as np
from PIL import Image

LINES = 140   # lines across the card width
PX = 10       # source pixels per line
AMP = 46      # grey swing either side of 128 (the sheet scales it further with opacity)
HEIGHT = 4    # rows (the lines are vertical, the strip is stretched)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="assets/foil/fam/swsh-holo/lines-v1.webp")
    ap.add_argument("--amp", type=float, default=AMP)
    a = ap.parse_args()
    w = LINES * PX
    x = (np.arange(w) + 0.5) / PX
    row = 128 + a.amp * np.cos(2 * math.pi * x)
    img = np.tile(np.clip(np.round(row), 0, 255).astype(np.uint8), (HEIGHT, 1))
    Image.fromarray(img, "L").convert("RGB").save(a.out, "WEBP", lossless=True)
    print(a.out, img.shape)


if __name__ == "__main__":
    main()
