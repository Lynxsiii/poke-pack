"""Draw a tileable glitter texture: coloured flecks on black.

Scarlet & Violet gold and special cards are thick with glitter: one to two
pixel flecks of every colour, a few of them far brighter than the rest.
The site's older glitter tiles are pale confetti; this one is denser and
full colour, for finishes that screen it over foil (css/holo/shiny-vault.css
uses it for the Paldean Fates Hyper Rares). Seeded, so reruns give the same
file.

    python3 .claude/skills/card-textures/scripts/make_glitter_flecks.py \
        --out assets/foil/glitter-flecks.webp
"""
from __future__ import annotations

import argparse
import colorsys
from pathlib import Path

import numpy as np
from PIL import Image


def flecks(size: int, density: float, seed: int) -> Image.Image:
    rng = np.random.default_rng(seed)
    img = np.zeros((size, size, 3), np.float32)
    count = int(size * size * density)
    for _ in range(count):
        x, y = rng.integers(0, size, 2)
        # Mostly single pixels, some 2x2 and a few 2x1 slivers.
        w, h = [(1, 1), (2, 2), (2, 1), (1, 2)][rng.choice(4, p=[0.5, 0.3, 0.1, 0.1])]
        hue = rng.random()
        sat = rng.uniform(0.35, 0.9)
        # Most flecks are dim; one in eight catches the light hard.
        val = rng.uniform(0.85, 1.0) if rng.random() < 0.125 else rng.uniform(0.25, 0.6)
        rgb = colorsys.hsv_to_rgb(hue, sat, val)
        for dy in range(h):
            for dx in range(w):
                img[(y + dy) % size, (x + dx) % size] = rgb
    return Image.fromarray((img * 255).round().astype(np.uint8), "RGB")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", required=True)
    ap.add_argument("--size", type=int, default=256, help="tile size in px")
    ap.add_argument("--density", type=float, default=0.09, help="flecks per pixel")
    ap.add_argument("--seed", type=int, default=2024)
    args = ap.parse_args()
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    flecks(args.size, args.density, args.seed).save(out, "WEBP", lossless=True, method=6)
    print(f"wrote {out} ({out.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
