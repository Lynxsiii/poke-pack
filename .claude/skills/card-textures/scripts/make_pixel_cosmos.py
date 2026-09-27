"""Draw the "pixel" (retro) cosmos foil as one card-sized alpha texture.

Every English cosmos promo since Tinkaton SVP 140 (September 2024) is pixel
cosmos, not the smooth round-planet cosmos upstream's galaxy textures show
(the Promos for existing sets thread measured it from photos, 2026-09-27;
notes in /mnt/project-files/promos-existing-sets/texture-refs/REPORT.md):

- a square pixel grid, cells about 0.4% of the card width;
- stair-stepped blocky discs (planets), 2.5-8% of the width, a handful per
  card, each with a top-to-bottom brightness gradient;
- dense single-cell specks and 5-cell "+" shapes about 1.5% apart;
- sparse blocky crosses and 8-point starbursts, 1.3-3.5% of the width;
- zero to two swirls: arcs of dotted specks, 8-15% of the width.

The texture is white shapes on transparent, drawn on the pixel grid, at the
card's aspect and a little larger than a card so each promo can show a
different crop (`--seed-x/y` in css/holo/promos.css). The shapes carry their
brightness in alpha: a planet's shaded side and the dimmer specks are
half-alpha. Seeded, so reruns give the same file.

    python3 .claude/skills/card-textures/scripts/make_pixel_cosmos.py \\
        --out assets/foil/promo/pixel-cosmos.webp
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image

W, H = 240, 336  # cells: a card is about 200-300 pixel cells across
CELL = 3  # output pixels per cell, so a cell is 3 px at 720 px wide


def disc(canvas: np.ndarray, cx: int, cy: int, r: float, rng) -> None:
    """A stair-stepped disc with a brightness ramp down its face."""
    ys, xs = np.mgrid[0:canvas.shape[0], 0:canvas.shape[1]]
    inside = (xs - cx) ** 2 + (ys - cy) ** 2 <= r * r
    # Steps of 2-3 cells: quantise the disc edge onto a coarser grid.
    step = 2 if r < 6 else 3
    coarse = inside[::step, ::step]
    inside = np.kron(coarse, np.ones((step, step), bool))[: canvas.shape[0], : canvas.shape[1]]
    top = rng.uniform(0.85, 1.0)
    bottom = rng.uniform(0.35, 0.6)
    ramp = top + (bottom - top) * ((ys - (cy - r)) / max(2 * r, 1)).clip(0, 1)
    canvas[inside] = np.maximum(canvas[inside], ramp[inside])


def plus(canvas: np.ndarray, cx: int, cy: int, arm: int, value: float) -> None:
    h, w = canvas.shape
    for d in range(-arm, arm + 1):
        for (y, x) in ((cy + d, cx), (cy, cx + d)):
            if 0 <= y < h and 0 <= x < w:
                canvas[y, x] = max(canvas[y, x], value)


def starburst(canvas: np.ndarray, cx: int, cy: int, arm: int, value: float) -> None:
    plus(canvas, cx, cy, arm, value)
    d = max(1, arm * 2 // 3)
    for k in range(-d, d + 1):
        for (y, x) in ((cy + k, cx + k), (cy + k, cx - k)):
            if 0 <= y < canvas.shape[0] and 0 <= x < canvas.shape[1]:
                canvas[y, x] = max(canvas[y, x], value * 0.8)


def swirl(canvas: np.ndarray, cx: int, cy: int, r: float, rng) -> None:
    """An arc or spiral of dotted specks."""
    turns = rng.uniform(0.6, 1.4)
    for t in np.linspace(0, turns * 2 * np.pi, int(r * turns * 2.2)):
        rad = r * (0.35 + 0.65 * t / (turns * 2 * np.pi))
        x, y = int(cx + rad * np.cos(t)), int(cy + rad * 0.6 * np.sin(t))
        if 0 <= y < canvas.shape[0] and 0 <= x < canvas.shape[1] and rng.random() < 0.7:
            canvas[y, x] = max(canvas[y, x], rng.uniform(0.5, 1.0))


def draw(seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    canvas = np.zeros((H, W), np.float32)
    # Background specks: singles and small pluses, about one per 3.5 cells.
    for _ in range(int(W * H / 12)):
        x, y = rng.integers(0, W), rng.integers(0, H)
        v = rng.uniform(0.9, 1.0) if rng.random() < 0.45 else rng.uniform(0.35, 0.65)
        if rng.random() < 0.12:
            plus(canvas, x, y, 1, v)
        else:
            canvas[y, x] = max(canvas[y, x], v)
    # A few dense clusters, like the lower-right of the Riolu macro.
    for _ in range(4):
        cx, cy, rr = rng.integers(0, W), rng.integers(0, H), rng.uniform(10, 22)
        for _ in range(int(rr * rr * 0.9)):
            x, y = int(cx + rng.normal(0, rr / 2)), int(cy + rng.normal(0, rr / 2))
            if 0 <= y < H and 0 <= x < W:
                canvas[y, x] = max(canvas[y, x], rng.uniform(0.4, 1.0))
    # Planets: mostly 2-4% of the width (5-10 cells across), a couple bigger.
    for _ in range(16):
        r = rng.uniform(2.5, 5) if rng.random() < 0.65 else rng.uniform(6, 9.5)
        disc(canvas, rng.integers(0, W), rng.integers(0, H), r, rng)
    # Stars: crosses and starbursts, 1.3-3.5% of the width.
    for _ in range(24):
        arm = int(rng.uniform(2, 5))
        x, y = rng.integers(0, W), rng.integers(0, H)
        if rng.random() < 0.45:
            starburst(canvas, x, y, arm, rng.uniform(0.7, 1.0))
        else:
            plus(canvas, x, y, arm, rng.uniform(0.7, 1.0))
    # Swirls.
    for _ in range(2):
        swirl(canvas, rng.integers(0, W), rng.integers(0, H), rng.uniform(10, 18), rng)
    return canvas.clip(0, 1)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", required=True)
    ap.add_argument("--seed", type=int, default=2025)
    args = ap.parse_args()
    canvas = draw(args.seed)
    alpha = np.kron(canvas, np.ones((CELL, CELL), np.float32))
    a8 = (alpha * 255).round().astype(np.uint8)
    white = np.full_like(a8, 255)
    img = Image.fromarray(np.dstack([white, white, white, a8]), "RGBA")
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out, "WEBP", lossless=True, method=6)
    print(f"wrote {out} {img.size} ({out.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
