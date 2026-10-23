#!/usr/bin/env python3
"""Draw the sv-sir family's glitter tile: pinpoint prismatic specks on transparent.

Photos of the real Scarlet & Violet SIRs (Mew ex, Latias ex and Charizard ex macros, reference/fam-sv-sir.md):
dense pinpoint glitter, each speck a single saturated spectral colour, about 0.1-0.2 mm. A card is 63 mm and
220 CSS px wide on a phone at 3 device px per CSS px (660 px), so a speck is 1-2 device px. The tile is drawn at
one tile pixel per device pixel at that size: 256 px shown at 38.8% of the card's width (the sheet's
`--svsir-tile`). About one speck per 7 x 7 px, most one pixel, some a pixel with dimmer neighbours; the hue is one
of seven spectral colours, never darker than 0.35 in any channel: under hard-light (on the sheet's neutral grey) a
speck lifts its own hue to full and takes the others down by at most 30%, so it reads as a vivid coloured point
on the sand, the navy and the white alike without leaving a dark dot (dark_specks.py), and under colour-dodge it
only adds light.
Seamless: positions wrap.

    python3 .claude/skills/card-textures/scripts/fam/sv-sir/make_specks.py            # assets/foil/fam/sv-sir/specks-v1.webp
"""
import argparse
import colorsys
import sys
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[5]
HUES = [0.0, 0.08, 0.15, 0.33, 0.5, 0.62, 0.78]  # red, orange, yellow, green, cyan, blue, violet
LOW = 0.35  # the darkest channel of a speck


def speck_rgb(h: float) -> np.ndarray:
    r, g, b = colorsys.hsv_to_rgb(h, 1.0, 1.0)
    c = np.array([r, g, b])
    return LOW + (1 - LOW) * c


def build(size: int, pitch: float, seed: int) -> Image.Image:
    rng = np.random.default_rng(seed)
    n = int(size * size / (pitch * pitch))
    rgba = np.zeros((size, size, 4), np.float32)
    ys = rng.integers(0, size, n)
    xs = rng.integers(0, size, n)
    hues = rng.integers(0, len(HUES), n)
    lev = rng.uniform(0.7, 1.0, n)
    big = rng.random(n) < 0.45
    for y, x, hi, a, b in zip(ys, xs, hues, lev, big):
        col = speck_rgb(HUES[hi] + rng.uniform(-0.02, 0.02))
        pts = [(0, 0, a)]
        if b:
            dy, dx = [(0, 1), (1, 0), (1, 1)][rng.integers(0, 3)]
            pts.append((dy, dx, a * 0.75))
        for dy, dx, al in pts:
            yy, xx = (y + dy) % size, (x + dx) % size
            if al > rgba[yy, xx, 3]:
                rgba[yy, xx, :3] = col
                rgba[yy, xx, 3] = al
    return Image.fromarray((rgba * 255).round().astype(np.uint8), "RGBA")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--size", type=int, default=256)
    ap.add_argument("--pitch", type=float, default=7.0, help="mean spacing of the specks in tile px")
    ap.add_argument("--seed", type=int, default=2026)
    ap.add_argument("--out", default=str(ROOT / "assets" / "foil" / "fam" / "sv-sir" / "specks-v1.webp"))
    a = ap.parse_args()
    out = Path(a.out)
    if out.exists():
        print(f"{out} exists: assets are cached immutable, write a new name", file=sys.stderr)
        return 1
    build(a.size, a.pitch, a.seed).save(out, "WEBP", lossless=True, method=6)
    print(out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
