#!/usr/bin/env python3
"""The BREAK foil's prism mosaic tile (css/holo/xy-ex.css, `xy-break`).

Photos (texture-refs/f2-ex-mega-break: Marowak BREAK 79/162, Xerneas BREAK 82/114,
Nidoking BREAK 46/108; text: Bleeding Cool "square prism holographic style"):
the art area behind the gold Pokémon is a mosaic of axis-aligned square prism
tiles, each about 3 percent of the card's width, silver-grey with some tiles
blue, cyan, magenta or green, and every tile changes colour on its own as the
card turns. Not lines and not a grating: flat squares of different value next to
each other.

The tile is 8 x 8 squares of 32 px (256 px), seamless because every square is
independent; the CSS lays it at 25.6 percent of the card width, so a square is
3.2 percent. Each square carries its own hue index, the CSS rotates the hue with
the pointer (`filter: hue-rotate()`), so tiles flip colour separately.
Light only on average: values 0.62 to 1.0, silver tiles most common, so it can
be multiplied onto the white print (pale background reads silver) without a dark dot.

    python3 .claude/skills/card-textures/scripts/make_xy_mosaic.py     # assets/foil/xy-mosaic.webp
"""
import colorsys
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
N, SQ = 8, 32
rng = np.random.default_rng(1405)  # XY: 2014-2016 (BREAK 2015); fixed so reruns match


def square():
    r = rng.random()
    if r < 0.6:  # silver tile: a grey a little cool, brightness varies tile to tile
        v = 0.80 + 0.14 * rng.random()
        return colorsys.hsv_to_rgb(0.60, 0.06, v)
    # coloured tile: blue/cyan/magenta/green weighted like the photos
    hues = [0.58, 0.50, 0.83, 0.33, 0.70, 0.12]
    w = [0.28, 0.2, 0.2, 0.14, 0.12, 0.06]
    h = rng.choice(hues, p=w) + rng.normal(0, 0.02)
    return colorsys.hsv_to_rgb(h % 1, 0.3 + 0.22 * rng.random(), 0.88 + 0.12 * rng.random())


def main():
    img = np.zeros((N * SQ, N * SQ, 3), np.uint8)
    for j in range(N):
        for i in range(N):
            img[j * SQ:(j + 1) * SQ, i * SQ:(i + 1) * SQ] = np.round(np.array(square()) * 255)
    dest = os.path.join(ROOT, "assets", "foil", "xy-mosaic.webp")
    if os.path.exists(dest) and "--force" not in sys.argv:
        sys.exit(f"{dest} exists: assets are immutable, pick a -v2 name")
    Image.fromarray(img, "RGB").save(dest, "WEBP", quality=90, method=6)
    print(dest, os.path.getsize(dest), "bytes")


if __name__ == "__main__":
    main()
