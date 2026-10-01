#!/usr/bin/env python3
"""Draw the EX generation's cosmos holofoil as one card-sized alpha tile: assets/foil/ex-cosmos-v1.webp.

What the real foil is (Collexy's flat scans of ex1-ex16 holos, Pokemon Holo's tilt clips of Dark Steelix, Torkoal, Rapidash,
Salamence, Charizard PK, Sharpedo; see texture-refs/i1/SOURCES.txt): a SPARSE field of blocky, pixel-stepped shapes over the whole
art window, Pokemon included. Stair-stepped round dots (the "planets", 2-4% of the card width), 8-point snowflakes and
plus signs (1.5-4%), and single-pixel specks; every shape lights in ONE saturated colour (teal, cyan, green, orange, magenta,
yellow) and the colour changes as the card tips. Much sparser and blockier than the Diamond & Pearl dot-matrix cosmos
(dp-cosmos-v1.webp) and sparser than the smooth planets of the modern promo cosmos.

The tile is white shapes on transparent, 600 x 838 (a card, so `mask-size: 100% auto` is the card's width), drawn on a square
cell grid of 4 px (150 x 209 cells: a cell is 0.67% of the card, 4.4 device px at the 220 px x 3 phone size, so the steps never
alias). Brightness is carried in alpha: a dot's lower half is dimmer, half the specks are dimmer. Seeded; reruns give the same
file. No hairlines: every shape is at least 1 cell and the field has no regular pitch.

    python3 scripts/make_ex_cosmos.py --out assets/foil/ex-cosmos-v1.webp
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image

W, H = 150, 209
CELL = 4


def put(c, x, y, v):
    if 0 <= x < W and 0 <= y < H:
        c[y, x] = max(c[y, x], v)


def dot(c, cx, cy, r, rng):
    """A stair-stepped round dot, edge quantised to 1-2 cells, lower half dimmer."""
    ys, xs = np.mgrid[0:H, 0:W]
    inside = (xs - cx) ** 2 + (ys - cy) ** 2 <= r * r
    top = rng.uniform(0.85, 1.0)
    bot = rng.uniform(0.45, 0.7)
    ramp = top + (bot - top) * ((ys - (cy - r)) / max(2 * r, 1)).clip(0, 1)
    c[inside] = np.maximum(c[inside], ramp[inside])


def plus(c, cx, cy, arm, v):
    for d in range(-arm, arm + 1):
        put(c, cx + d, cy, v)
        put(c, cx, cy + d, v)


def snowflake(c, cx, cy, arm, v):
    plus(c, cx, cy, arm, v)
    d = max(1, int(arm * 0.7))
    for k in range(-d, d + 1):
        put(c, cx + k, cy + k, v * 0.85)
        put(c, cx + k, cy - k, v * 0.85)
    put(c, cx, cy, 1.0)


def draw(seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    c = np.zeros((H, W), np.float32)
    # singles and 2-cell specks: about one per 80 cells, half of them dim
    for _ in range(int(W * H / 70)):
        x, y = int(rng.integers(0, W)), int(rng.integers(0, H))
        v = rng.uniform(0.85, 1.0) if rng.random() < 0.5 else rng.uniform(0.4, 0.65)
        put(c, x, y, v)
        if rng.random() < 0.3:
            put(c, x + 1, y, v)
        if rng.random() < 0.12:
            put(c, x, y + 1, v)
    # small pluses (arm 1)
    for _ in range(int(W * H / 420)):
        plus(c, int(rng.integers(0, W)), int(rng.integers(0, H)), 1, rng.uniform(0.7, 1.0))
    # snowflakes and big pluses
    for _ in range(int(W * H / 600)):
        arm = int(rng.integers(2, 4))
        x, y = int(rng.integers(0, W)), int(rng.integers(0, H))
        (snowflake if rng.random() < 0.7 else plus)(c, x, y, arm, rng.uniform(0.75, 1.0))
    # dots: mostly 2-3.5 cells radius (about 3% of the width across), a few bigger
    for _ in range(int(W * H / 520)):
        r = rng.uniform(1.8, 3.4) if rng.random() < 0.8 else rng.uniform(3.8, 5.2)
        dot(c, int(rng.integers(0, W)), int(rng.integers(0, H)), r, rng)
    return c.clip(0, 1)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", required=True)
    ap.add_argument("--seed", type=int, default=2003)
    args = ap.parse_args()
    out = Path(args.out)
    if out.exists():
        raise SystemExit(f"{out} exists: never overwrite a shipped asset, use a new -vN name")
    c = draw(args.seed)
    a8 = (np.kron(c, np.ones((CELL, CELL), np.float32)) * 255).round().astype(np.uint8)
    white = np.full_like(a8, 255)
    img = Image.fromarray(np.dstack([white, white, white, a8]), "RGBA")
    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out, "WEBP", lossless=True, method=6)
    print(f"wrote {out} {img.size} ({out.stat().st_size / 1024:.0f} KB), coverage {float((c > 0).mean()):.3f}")


if __name__ == "__main__":
    main()
