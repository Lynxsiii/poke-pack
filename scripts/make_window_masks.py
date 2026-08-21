"""Generate the holo window masks in assets/masks/.

The illustration window is a plain rectangle, but the Stage 1/2 evolution badge
sits on top of its corner and must be punched out or the foil runs straight
over it. Generating the variants from one set of measurements rather than
hand-drawing them keeps the rect and the punch from drifting apart.

Coordinates are in the 733x1024 space of the card scans. Each punch is drawn
solid to `SOLID` of its radius then faded to the edge, so the cut blends
instead of reading as a shape stamped on the shine.

    py scripts/make_window_masks.py
"""
from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "masks"

SIZE = (733, 1024)
# Illustration window, measured off the unpadded scans.
RECT = (58, 95, 679, 483)

# Evolution badge: circle, matching the mask already in use.
EVO = (72, 128, 68)          # cx, cy, r

# The owner portrait is NOT punched here. Its plate is fixed but the character
# spilling out of it is different for every owner, so no single shape fits —
# scripts/make_owner_masks.py recovers each one from the scans and writes its
# own window into assets/masks/owner/.

SOLID = 0.88   # fraction of the punch drawn at full strength before fading
FEATHER = 5    # px of soft edge on the rounded-rect punch


def base_rect() -> Image.Image:
    img = Image.new("RGBA", SIZE, (255, 255, 255, 0))
    ImageDraw.Draw(img).rectangle(RECT, fill=(255, 255, 255, 255))
    return img


def punch_circle(img: Image.Image, cx: int, cy: int, r: int) -> None:
    px = img.load()
    for y in range(max(0, cy - r - 2), min(SIZE[1], cy + r + 2)):
        for x in range(max(0, cx - r - 2), min(SIZE[0], cx + r + 2)):
            d = math.hypot(x - cx, y - cy)
            if d > r:
                continue
            t = d / r
            cut = 1.0 if t <= SOLID else max(0.0, 1.0 - (t - SOLID) / (1 - SOLID))
            r_, g_, b_, a = px[x, y]
            px[x, y] = (255, 255, 255, int(round(a * (1 - cut))))


def build(evo: bool, owner: bool = False) -> Image.Image:
    img = base_rect()
    if evo:
        punch_circle(img, *EVO)
    return img


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    jobs = [
        ("win-evo.png", True, False),
    ]
    for name, evo, owner in jobs:
        path = OUT / name
        build(evo, owner).save(path, optimize=True)
        print(f"  {path.relative_to(ROOT)}  {path.stat().st_size:,} bytes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
