#!/usr/bin/env python3
"""The XY Pokémon-EX sparkle grain: one large, non-repeating sheet of small angular foil flecks.

What it draws, and from what: the regular-art XY Pokémon-EX and Mega EX foil is a dense, fine SPARKLE grain of tiny
angular flecks (Bleeding Cool's iPhone photo of Leafeon-EX 10/83 at native pixels, Pokemon Holo's tilt frames of
Mewtwo-EX 62/162; /mnt/project-files/holo-remaster/xy-ex-mega/refs/). The rainbow lights it in narrow vertical
columns; the column colour comes from the CSS, so the sheet itself is grey: white flecks of mixed brightness on black.

- One sheet larger than the card (1000 x 1396 px, the card's aspect), placed per card by --seed-x/--seed-y, so no
  card shows a repeat and no two cards show the same crop ("holographic squares": nothing here tiles).
- Flecks are irregular 3 to 6 sided shards, 2 to 7 px across at this size (about 0.3 to 0.9 percent of the card's
  width, 1 to 2 CSS px on a 220 px phone card: never a 1 px point, which would alias into a screen).
- Brightness is skewed low with a few bright shards, the way a real grain twinkles: most flecks are dim, a few catch.
- Drawn at 3x and downsampled, so every edge is anti-aliased. Seeded: the same file every run.

    python3 .claude/skills/card-textures/scripts/fam/xy-ex-mega/make_sparkle.py [--out PATH] [--seed N]

Writes assets/foil/fam/xy-ex-mega/sparkle-v1.webp (a new name for any change: /assets is cached for a year).
"""
from __future__ import annotations

import argparse
import math
import random
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[5]
W, H = 1000, 1396
SS = 3


def shard(rng: random.Random, cx: float, cy: float, r: float) -> list[tuple[float, float]]:
    """An irregular convex-ish polygon: 3 to 6 corners at jittered angles and radii."""
    n = rng.choice((3, 4, 4, 5, 5, 6))
    start = rng.uniform(0, 2 * math.pi)
    angles = sorted(start + rng.uniform(0, 2 * math.pi) for _ in range(n))
    stretch = rng.uniform(1.0, 1.9)  # shards are a little elongated, at any angle
    tilt = rng.uniform(0, math.pi)
    pts = []
    for a in angles:
        rr = r * rng.uniform(0.55, 1.0)
        x, y = math.cos(a) * rr * stretch, math.sin(a) * rr
        pts.append((cx + x * math.cos(tilt) - y * math.sin(tilt), cy + x * math.sin(tilt) + y * math.cos(tilt)))
    return pts


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", default=str(ROOT / "assets/foil/fam/xy-ex-mega/sparkle-v1.webp"))
    ap.add_argument("--seed", type=int, default=20141106)  # Flashfire's release date
    ap.add_argument("--density", type=float, default=0.0105, help="flecks per output pixel")
    ap.add_argument("--quality", type=int, default=72)
    args = ap.parse_args()
    rng = random.Random(args.seed)

    img = Image.new("L", (W * SS, H * SS), 0)
    d = ImageDraw.Draw(img)
    count = int(W * H * args.density)
    for _ in range(count):
        # size: mostly 1 to 2 px radius, a tail of bigger shards
        r = (1.0 + rng.random() ** 2.2 * 2.6) * SS
        cx, cy = rng.uniform(0, W * SS), rng.uniform(0, H * SS)
        # brightness: skewed low, a few bright ones
        v = 0.22 + 0.78 * rng.random() ** 2.4
        d.polygon(shard(rng, cx, cy, r), fill=int(round(v * 255)))
    small = img.resize((W, H), Image.LANCZOS)
    # A breath of softness so a shard never lands as a hard single-pixel step after the browser scales it.
    small = small.filter(ImageFilter.GaussianBlur(0.35))
    a = np.asarray(small).astype(np.float32)
    # Keep the flecks' peaks bright after the blur.
    a = np.clip(a * 1.25, 0, 255).astype(np.uint8)
    out = Image.fromarray(a, "L").convert("RGB")
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    out.save(args.out, "WEBP", quality=args.quality, method=6)
    cover = float((a > 40).mean())
    print(f"wrote {args.out} ({Path(args.out).stat().st_size / 1024:.0f} KB, {count} flecks, {cover:.1%} of the sheet lit)")


if __name__ == "__main__":
    main()
