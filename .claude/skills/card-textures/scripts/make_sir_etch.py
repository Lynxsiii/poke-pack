#!/usr/bin/env python3
"""Draw the engraving tile a Special Illustration Rare uses when TCG Live has
no etch map for it (the Mega Evolution sets, Black Bolt, White Flare, the ME
Black Star promos): assets/foil/sir-etch.webp.

The real etch is fine hatching that follows each painting (reference/
sv-fullart.md, "Special Illustration Rare"). Without the painting's own
lines, this is a diagonal hatch (57 x 88 lines across the tile, so it tiles
without a seam) that waves gently, thins in patches like the Live maps' grey
areas, and carries a fainter crossing family in cells (Durant ex's border
crosshatch). No closed whorls: those read as op-art rings on a phone, the
fault PR 50 removed. Alpha is the etch; RGB is white. css/holo/celebration.css
masks the SIR's foil and etch glare with it at 100% of the card's width,
seeded per card by --seed-pos.

    python3 .claude/skills/card-textures/scripts/make_sir_etch.py
"""
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
OUT = os.path.join(ROOT, "assets", "foil", "sir-etch.webp")
W = 512


def main():
    y, x = np.mgrid[0:W, 0:W].astype(np.float64) / W
    tau = 2 * np.pi
    # The warp's gradient stays under half the hatch's own, so lines wave
    # by 30 degrees at most and never close.
    warp = (0.02 * np.sin(tau * x) * np.sin(tau * y)
            + 0.012 * np.sin(tau * (2 * x + y + 0.15))
            + 0.008 * np.cos(tau * (x - 3 * y + 0.4))
            + 0.005 * np.sin(tau * (4 * x + 2 * y)))
    lines = 0.5 + 0.5 * np.cos(tau * (57 * x + 88 * y + 104 * warp))
    density = 0.5 + 0.5 * np.sin(tau * (x + 0.7)) * np.cos(tau * (2 * y - 0.1))
    threshold = 0.3 + 0.4 * density
    hatch = np.clip((lines - threshold) / (1 - threshold), 0, 1) ** 0.7
    warp2 = 0.015 * np.cos(tau * y) * np.sin(tau * x) + 0.01 * np.sin(tau * (x + 2 * y))
    lines2 = 0.5 + 0.5 * np.cos(tau * (88 * x - 57 * y + 104 * warp2))
    cells = np.clip(np.sin(tau * (2 * x - y + 0.4)) * np.cos(tau * (x + y)), 0, 1) ** 2
    cross = np.clip((lines2 - 0.6) / 0.4, 0, 1) * cells * 0.7
    alpha = np.clip(np.maximum(hatch, cross), 0, 1)
    img = np.zeros((W, W, 4), np.uint8)
    img[..., :3] = 255
    img[..., 3] = (alpha * 255).astype(np.uint8)
    Image.fromarray(img, "RGBA").save(OUT, "WEBP", quality=80, method=6)
    print(f"wrote {os.path.relpath(OUT, ROOT)}: {W}x{W}, etched {alpha.mean():.0%}, {os.path.getsize(OUT)} bytes")


if __name__ == "__main__":
    sys.exit(main())
