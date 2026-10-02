#!/usr/bin/env python3
"""Legendary Treasures' Radiant Collection: the two foil textures every RC card shares.

What the real cards carry (research and photos: /mnt/project-files/holo-remaster/bw-radiant-collection/refs/SOURCES.md):

- Uncommons, RC11 and the full arts (RC21-RC25): "Confetti" holofoil, a dense field of small round foil chips over
  the whole card (Collexy's BW holofoil overview: "looks like confetti or pixels"). Measured on the Serebii and
  TCGplayer scans registered onto the site's scans: chips about 1.45% of the card wide, nearest neighbour about
  2.4%; in the Bleeding Cool photo of Pikachu RC7 each chip flashes ONE saturated colour and only a share of them is
  lit at a time.
- Commons (RC1, 2, 5, 8, 9, 15-18 and Elesa RC20): a "star holo": a dense field of five-point stars about 3.3% of
  the card wide, nearest neighbour about 4.5%, over the whole card (Ursaring RC16 and Snivy RC1 scans; the eBay
  photos of Snivy show single stars flashing gold, cyan or white).

Both textures are RGBA: alpha is the chip's (star's) coverage, anti-aliased, and RGB is the same grey value g in
0.35..0.85 over the whole chip: its "facet". css/holo/fam/bw-radiant-collection.css picks which chips are lit at a
pose by blending a pointer-driven colour ramp L over the texture with `difference` and crushing the result with
invert/brightness/contrast, so a chip lights in a channel where |g - L| is small. Outside a chip the texture is
transparent, so the blend shows L itself there, which the crush always sends to black: no ring ever lights round an
unlit chip (a grey-on-black texture would light every chip's anti-aliased edge where it crosses L).

Chips never touch (Poisson disc spacing larger than two radii): two touching chips of different g would light a hairline
where the browser interpolates between them.

The textures are 125% of the card wide at phone size (220 CSS px x 3 = 660 device px per card), drawn at
`background-size: 125% auto` and offset per card by --seed-x/--seed-y, so no two cards show the same chips and none
repeats inside a card.

    python3 .claude/skills/card-textures/scripts/fam/bw-radiant-collection/make_rc_textures.py

Writes assets/foil/fam/bw-radiant-collection/rc-chips.webp and rc-stars.webp (lossless). Seeded: reruns give the
same files.
"""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[6]
OUT = ROOT / "assets" / "foil" / "fam" / "bw-radiant-collection"
CARD = 660                      # card width in device px at phone size
W = round(CARD * 1.25)          # texture: 125% of the card
H = round(W * 838 / 600)        # the scans' aspect
SS = 4                          # supersampling for the coverage
G_LO, G_HI = 0.35, 0.85         # facet range


def poisson(rng: np.random.Generator, w: int, h: int, r: float, k: int = 30) -> np.ndarray:
    """Bridson's Poisson disc sampling: points at least r apart, filling w x h."""
    cell = r / math.sqrt(2)
    gw, gh = int(math.ceil(w / cell)), int(math.ceil(h / cell))
    grid = -np.ones((gh, gw), int)
    pts: list[tuple[float, float]] = []
    active: list[int] = []

    def fits(x: float, y: float) -> bool:
        gx, gy = int(x / cell), int(y / cell)
        for yy in range(max(0, gy - 2), min(gh, gy + 3)):
            for xx in range(max(0, gx - 2), min(gw, gx + 3)):
                j = grid[yy, xx]
                if j >= 0 and (pts[j][0] - x) ** 2 + (pts[j][1] - y) ** 2 < r * r:
                    return False
        return True

    x0, y0 = rng.uniform(0, w), rng.uniform(0, h)
    pts.append((x0, y0)); active.append(0); grid[int(y0 / cell), int(x0 / cell)] = 0
    while active:
        i = active[rng.integers(len(active))]
        px, py = pts[i]
        for _ in range(k):
            a = rng.uniform(0, 2 * math.pi); d = rng.uniform(r, 2 * r)
            x, y = px + d * math.cos(a), py + d * math.sin(a)
            if 0 <= x < w and 0 <= y < h and fits(x, y):
                pts.append((x, y)); active.append(len(pts) - 1); grid[int(y / cell), int(x / cell)] = len(pts) - 1
                break
        else:
            active.remove(i)
    return np.array(pts)


def stamp(rgba: np.ndarray, cx: float, cy: float, reach: float, inside, g: float) -> None:
    """Rasterise one shape (inside(dx, dy) -> bool on the supersampled grid) into the RGBA float canvas."""
    h, w = rgba.shape[:2]
    x0, x1 = int(math.floor(cx - reach)) - 1, int(math.ceil(cx + reach)) + 1
    y0, y1 = int(math.floor(cy - reach)) - 1, int(math.ceil(cy + reach)) + 1
    x0c, y0c, x1c, y1c = max(0, x0), max(0, y0), min(w, x1), min(h, y1)
    if x1c <= x0c or y1c <= y0c:
        return
    sx = (np.arange(x0c * SS, x1c * SS) + 0.5) / SS - cx
    sy = (np.arange(y0c * SS, y1c * SS) + 0.5) / SS - cy
    dx, dy = np.meshgrid(sx, sy)
    cov = inside(dx, dy).astype(np.float32)
    cov = cov.reshape(y1c - y0c, SS, x1c - x0c, SS).mean(axis=(1, 3))
    a = rgba[y0c:y1c, x0c:x1c, 3]
    new = np.maximum(a, cov)
    grow = cov > a
    rgba[y0c:y1c, x0c:x1c, 0][grow] = g
    rgba[y0c:y1c, x0c:x1c, 3] = new


def chips(seed: int = 2013) -> Image.Image:
    rng = np.random.default_rng(seed)
    spacing = 0.0175 * CARD                  # minimum centre distance: 11.6 px
    pts = poisson(rng, W, H, spacing)
    rgba = np.zeros((H, W, 4), np.float32)
    rmax = spacing / 2 - 0.7                 # never touching
    for cx, cy in pts:
        R = min(rmax, 0.00725 * CARD * rng.uniform(0.82, 1.12))   # diameter about 1.45% of the card
        harm = [(k, rng.uniform(0, 0.07), rng.uniform(0, 2 * math.pi)) for k in (2, 3, 4, 5)]
        scale = 1 / (1 + sum(a for _, a, _ in harm))                 # keep the bumps inside rmax

        def inside(dx, dy, R=R, harm=harm, scale=scale):
            th = np.arctan2(dy, dx)
            rho = 1 + sum(a * np.cos(k * th + p) for k, a, p in harm)
            return np.hypot(dx, dy) <= R * scale * rho

        stamp(rgba, cx, cy, R, inside, rng.uniform(G_LO, G_HI))
    return to_image(rgba)


def stars(seed: int = 2013) -> Image.Image:
    rng = np.random.default_rng(seed + 1)
    spacing = 0.042 * CARD                   # minimum centre distance: 27.7 px
    pts = poisson(rng, W, H, spacing)
    rgba = np.zeros((H, W, 4), np.float32)
    for cx, cy in pts:
        R = min(spacing / 2 - 0.8, 0.0165 * CARD * rng.uniform(0.86, 1.08))   # outer diameter about 3.3%
        rot = rng.uniform(0, 2 * math.pi / 5)
        inner = 0.46
        angles = rot - math.pi / 2 + np.arange(10) * math.pi / 5
        radii = np.where(np.arange(10) % 2 == 0, R, R * inner)
        poly = np.stack([np.cos(angles) * radii, np.sin(angles) * radii], 1)

        def inside(dx, dy, poly=poly):
            # even-odd rule point in polygon, vectorised over the supersampled patch
            res = np.zeros(dx.shape, bool)
            n = len(poly)
            for i in range(n):
                xa, ya = poly[i]; xb, yb = poly[(i + 1) % n]
                cond = (ya > dy) != (yb > dy)
                xint = (xb - xa) * (dy - ya) / (yb - ya + 1e-12) + xa
                res ^= cond & (dx < xint)
            return res

        stamp(rgba, cx, cy, R, inside, rng.uniform(G_LO, G_HI))
    return to_image(rgba)


def to_image(rgba: np.ndarray) -> Image.Image:
    g = rgba[..., 0]
    out = np.zeros(rgba.shape[:2] + (4,), np.uint8)
    on = rgba[..., 3] > 0
    v = np.round(g * 255).astype(np.uint8)
    out[..., 0][on] = v[on]; out[..., 1][on] = v[on]; out[..., 2][on] = v[on]
    out[..., 3] = np.round(rgba[..., 3] * 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, fn in (("rc-chips.webp", chips), ("rc-stars.webp", stars)):
        img = fn()
        path = OUT / name
        img.save(path, lossless=True, quality=100, method=6, exact=True)
        print(f"{path.relative_to(ROOT)}  {img.size[0]}x{img.size[1]}  {path.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
