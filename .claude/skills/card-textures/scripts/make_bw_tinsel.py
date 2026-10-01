"""Draw the Black & White era's Tinsel holofoil tile.

Tinsel is the standard Rare Holo of the era (Collexy's BW holofoil overview, CardVeil's holo-pattern guide; the flat
scans of Snivy BW01, Serperior BW20, Keldeo BW60 and Dragon Vault's Fraxure show it, see
/mnt/project-files/every-era/bw/texture-refs/g1/SOURCES.txt): the art window is a field of fine HORIZONTAL ridges, each one lit
a little differently from its neighbours, so the window reads as a bundle of horizontal light threads with dark gaps. The
colour comes from the angle (vertical bands of green, yellow, silver that slide sideways with the tilt); the lines never run
across the Pokemon (TCG Live's map keeps the body matte).

The tile is a grey texture: one value per ridge row (random, skewed towards bright with a few dark gaps), each row wobbling
slowly along its length so the thread flickers instead of reading as a ruled page. It is seamless in both directions, the
rows are broad enough (the CSS draws 1.5 CSS px per row, 4.5 device pixels at 3x) never to beat against the screen, and a
random row sequence has no single frequency to alias into a line screen. Grey is the shine: the CSS multiplies the
spectrum by it and colour-dodges the result onto the print.

    python3 .claude/skills/card-textures/scripts/make_bw_tinsel.py

Writes assets/foil/bw-tinsel.webp (128 x 256) and never over an existing file.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parents[4]
OUT = ROOT / "assets" / "foil" / "bw-tinsel.webp"
W, H = 128, 256
ROWS = 64  # 4 image rows per ridge


def main() -> None:
    if OUT.exists():
        sys.exit(f"{OUT} exists; pick a new name (assets are immutable)")
    rng = np.random.default_rng(1103)
    u = rng.random(ROWS)
    row = 0.22 + 0.78 * u ** 1.6          # most ridges bright, some dark gaps
    gap = rng.random(ROWS) < 0.14
    row[gap] *= 0.25
    x = np.arange(W) / W
    tile = np.zeros((ROWS, W))
    for i in range(ROWS):
        k = rng.integers(1, 3)
        ph = rng.random() * 2 * np.pi
        wob = 1 + 0.28 * np.sin(2 * np.pi * k * x + ph)
        tile[i] = row[i] * wob
    img = np.repeat(tile, H // ROWS, axis=0)
    img = ndi.gaussian_filter(img, (0.9, 0), mode="wrap")     # soft ridge edges, still horizontal
    img = img / img.max()
    Image.fromarray(np.uint8(np.clip(img, 0, 1) * 255), "L").save(OUT, "WEBP", quality=90)
    print("wrote", OUT, OUT.stat().st_size, "bytes")


if __name__ == "__main__":
    main()
