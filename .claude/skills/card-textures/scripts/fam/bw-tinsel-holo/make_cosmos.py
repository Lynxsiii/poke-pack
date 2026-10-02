"""Draw the bw-tinsel-holo family's Cosmos texture (the Black & White era's blister, box and tin promos).

What the real foil does (refs/SOURCES.md in /mnt/project-files/holo-remaster/bw-tinsel-holo/): the window background of
a Black & White cosmos promo (Snivy BW06, Axew BW26, Luxio BW34, Electrode BW76, the Snivy/Tepig/Oshawott box prints) is
foil embossed with a fine field of small round dots, pale and only a little brighter than the foil round them, about
one every 1-2 % of the card's width, with the odd bigger dot and ring; the Pokemon is matte (TCG Live's map cuts it
out). The site's scans are clean digital images, so the dots have to be drawn.

Two full-card textures, 512 x 1024 (stretched over the card; about a device pixel a texel on a phone at 3x), from one
dot list so they line up exactly:

- cosmos-dots.webp: RGBA, grey 0.74 everywhere, its alpha the dots: about 5200 anti-aliased discs (70 % tiny, radius
  0.7-1.1 px; 25 % small, 1.2-2 px; 5 % medium, 2.4-3.6 px) and 40 thin rings (radius 4-7 px), each its own
  brightness 0.45-1. Over the neutral grey of a hard-light `.foil` it lifts the print a little at every dot (the
  pattern at rest); as the colour-dodged `.cure` layer's mask it decides where the held card sparkles. The positions
  are a jittered grid, so the field has no clumps and no visible repeat (it does not tile at all).
- cosmos-lit.webp: the same dots as grey on black (value = the dot's coverage x brightness): the colour-dodged `.cure`
  layer multiplies its light by it, so only the dots flash.

    python3 .claude/skills/card-textures/scripts/fam/bw-tinsel-holo/make_cosmos.py [--force] [--preview <png>]

Writes assets/foil/fam/bw-tinsel-holo/cosmos-dots.webp and cosmos-lit.webp; --force overwrites them (only until the
family ships; after that a change is a new -vN name). A file that exists is kept unless --force.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[6]
OUT = ROOT / "assets" / "foil" / "fam" / "bw-tinsel-holo"
W, H = 512, 1024
SS = 4                  # supersampling for anti-aliased discs
SEED = 20120
GREY = 0.74             # the dots' grey: hard-light lifts the print by screen(0.48) at a full dot
CELL = 10               # jittered-grid cell (px): one dot per cell, about 5200 a card


def disc(acc: np.ndarray, cx: float, cy: float, r: float, val: float, ring: float = 0.0) -> None:
    """Max-composite an anti-aliased disc (or a ring of width `ring`) into acc (supersampled coordinates)."""
    R = r * SS
    x0, x1 = int(max(cx * SS - R - 2, 0)), int(min(cx * SS + R + 2, acc.shape[1]))
    y0, y1 = int(max(cy * SS - R - 2, 0)), int(min(cy * SS + R + 2, acc.shape[0]))
    if x1 <= x0 or y1 <= y0:
        return
    yy, xx = np.mgrid[y0:y1, x0:x1]
    d = np.hypot(xx + 0.5 - cx * SS, yy + 0.5 - cy * SS)
    if ring:
        cov = np.clip(ring * SS / 2 + 0.5 - np.abs(d - R), 0, 1)
    else:
        cov = np.clip(R + 0.5 - d, 0, 1)
    acc[y0:y1, x0:x1] = np.maximum(acc[y0:y1, x0:x1], cov * val)


def draw(seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    acc = np.zeros((H * SS, W * SS))
    for gy in range(0, H, CELL):
        for gx in range(0, W, CELL):
            cx, cy = gx + rng.uniform(0, CELL), gy + rng.uniform(0, CELL)
            u = rng.random()
            r = rng.uniform(0.7, 1.1) if u < 0.70 else rng.uniform(1.2, 2.0) if u < 0.95 else rng.uniform(2.4, 3.6)
            disc(acc, cx, cy, r, rng.uniform(0.45, 1.0))
    for _ in range(40):
        disc(acc, rng.uniform(0, W), rng.uniform(0, H), rng.uniform(4, 7), rng.uniform(0.5, 0.9), ring=1.0)
    return acc.reshape(H, SS, W, SS).mean(axis=(1, 3))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--preview")
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    alpha = draw(SEED)
    u8 = lambda a: np.uint8(np.clip(a, 0, 1) * 255 + 0.5)  # noqa: E731
    grey = np.full((H, W), GREY)
    jobs = [
        ("cosmos-dots.webp", Image.fromarray(np.dstack([u8(grey)] * 3 + [u8(alpha)]), "RGBA")),
        ("cosmos-lit.webp", Image.fromarray(u8(alpha), "L")),
    ]
    for name, img in jobs:
        out = OUT / name
        if out.exists() and not args.force:
            print("kept", out.relative_to(ROOT), "(pass --force before the family ships to rewrite it)")
            continue
        img.save(out, "WEBP", quality=92, method=6)
        print("wrote", out.relative_to(ROOT), out.stat().st_size, "bytes")
    if args.preview:
        Image.fromarray(u8(alpha), "L").save(args.preview)


if __name__ == "__main__":
    main()
