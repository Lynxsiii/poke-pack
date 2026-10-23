"""Draw the bw-tinsel-holo family's Cosmos texture (the Black & White era's blister, box and tin promos), version 2.

What the real foil does (2026-10-22 audit; photos in /home/user/holo-refs/bw-tinsel-bw1-bw2/bw2-bwp012/,
/home/user/holo-refs/bw-tinsel-bwp-bwtk5a-bwtk5b/bwp087..bwp094/, and the earlier refs/SOURCES.md in
/mnt/project-files/holo-remaster/bw-tinsel-holo/): the window background of a Black & White cosmos promo is foil embossed
in three scales: a DENSE field of tiny hard pinpoint glints (0.3-0.5 % of the card width, many hundreds over the
window: Zorua BW12, Ducklett BW17, Empoleon BW56, Kyurem BW58/59), a few medium dots (1-2 %) and small four-point
stars, and a few LARGE soft filled translucent bubbles (4-8 % of the card width, about 6-12 a window: Leafeon BW87,
Glaceon BW90, Jolteon BW91). Glints are white-silver with a warm-gold minority; colour shows only in the glints
themselves as the card turns, never as a wash over the window. The Pokemon is matte (TCG Live's map cuts it out).

Two full-card textures, 512 x 1024 (stretched over the card; about 1.3 device px a texel on a phone at 3x), from one
list so they line up exactly:

- cosmos-dots-v2.webp: RGBA, the glints' colour (white-silver, a quarter warm gold, the bubbles pale) with alpha their
  coverage: about 9000 hard pinpoints (radius 0.55-1.0 texel, jittered 7.6 px grid so the field has no clumps and no
  visible repeat), 160 medium dots, 70 four-point stars and 30 soft bubbles (flat alpha 0.16-0.32, a brighter 1 px rim).
  Over the neutral grey of a hard-light `.foil` it lifts the print at every glint; as the `::before` mask it decides
  where the held card sparkles in colour.
- cosmos-lit-v2.webp: the same as grey on black (coverage x brightness; bubbles at half): the colour-dodged `.cure`
  layer multiplies its light by it, so only the glints flash.
- cosmos-dots-nb-v2.webp, cosmos-lit-nb-v2.webp: the same glints exactly, without the bubbles. The large bubbles are a
  Sylveon Collection feature (Leafeon BW87, Glaceon BW90, Jolteon BW91 scans); Collexy's Zorua BW12 and Ducklett BW17
  show pinpoints only, no rings (the round-2 review saw a drawn ring over Zorua's window), so every other cosmos promo
  takes the -nb pair and only BW87-94 the bubbled one.

    python3 .claude/skills/card-textures/scripts/fam/bw-tinsel-holo/make_cosmos.py [--force] [--preview <png>]

A file that exists is kept unless --force (only for a draft that has never shipped: /assets/* is cached for a year).
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[6]
OUT = ROOT / "assets" / "foil" / "fam" / "bw-tinsel-holo"
V = "v2"
W, H = 512, 1024
SS = 4                  # supersampling for anti-aliased edges
SEED = 20120
CELL = 7.6              # jittered-grid cell (px): one pinpoint per cell, about 9000 a card
SILVER = (0.95, 0.95, 0.97)
GOLD = (0.98, 0.86, 0.62)


def stamp(cov: np.ndarray, col: np.ndarray, lit: np.ndarray, cx: float, cy: float, r: float, rgb, val: float,
          kind: str = "disc", alpha: float = 1.0, ring: float = 0.0) -> None:
    """Composite one glint (disc, soft bubble or four-point star) into the supersampled buffers."""
    R = (r + 2) * SS
    x0, x1 = int(max(cx * SS - R, 0)), int(min(cx * SS + R, cov.shape[1]))
    y0, y1 = int(max(cy * SS - R, 0)), int(min(cy * SS + R, cov.shape[0]))
    if x1 <= x0 or y1 <= y0:
        return
    yy, xx = np.mgrid[y0:y1, x0:x1]
    dx, dy = (xx + 0.5) / SS - cx, (yy + 0.5) / SS - cy
    d = np.hypot(dx, dy)
    if kind == "star":
        arm = np.minimum(np.abs(dx) * (1 + 3 * np.abs(dy) / r), np.abs(dy) * (1 + 3 * np.abs(dx) / r))
        c = np.clip(0.6 - arm, 0, 1) * np.clip(r - d + 0.5, 0, 1)
        c = np.maximum(c, np.clip(0.9 - d, 0, 1))
    elif kind == "bubble":
        inside = np.clip((r - d) * SS + 0.5, 0, 1)
        rim = np.clip(1 - np.abs(d - (r - ring)) / ring, 0, 1) if ring else 0
        c = inside * alpha + rim * (0.55 - alpha) * inside
    else:
        c = np.clip((r - d) * SS + 0.5, 0, 1)
    sub_c = cov[y0:y1, x0:x1]
    a = c
    # "over" composite (premultiplied colour), max for the lit value
    sub_col = col[y0:y1, x0:x1]
    sub_col[...] = sub_col * (1 - a[..., None]) + np.asarray(rgb)[None, None, :] * a[..., None]
    sub_c[...] = sub_c + a * (1 - sub_c)
    lit[y0:y1, x0:x1] = np.maximum(lit[y0:y1, x0:x1], c * val)


def draw(seed: int, bubbles: bool = True):
    rng = np.random.default_rng(seed)
    cov = np.zeros((H * SS, W * SS))
    col = np.zeros((H * SS, W * SS, 3))
    lit = np.zeros((H * SS, W * SS))
    # bubbles first (under the glints)
    for _ in range(30):
        r = rng.uniform(10, 20)
        tint = rng.choice([0, 1, 2], p=[0.6, 0.25, 0.15])
        rgb = (0.86, 0.88, 0.9) if tint == 0 else (0.95, 0.9, 0.72) if tint == 1 else (0.72, 0.9, 0.95)
        bx, by, ba = rng.uniform(0, W), rng.uniform(0, H), rng.uniform(0.16, 0.32)   # drawn either way: the glints stay put
        if bubbles:
            stamp(cov, col, lit, bx, by, r, rgb, 0.5, "bubble", ba, 1.2)
    ys = np.arange(0, H, CELL)
    xs = np.arange(0, W, CELL)
    for gy in ys:
        for gx in xs:
            cx, cy = gx + rng.uniform(0, CELL), gy + rng.uniform(0, CELL)
            rgb = GOLD if rng.random() < 0.25 else SILVER
            stamp(cov, col, lit, cx, cy, rng.uniform(0.55, 1.0), rgb, rng.uniform(0.55, 1.0))
    for _ in range(160):
        rgb = GOLD if rng.random() < 0.3 else SILVER
        stamp(cov, col, lit, rng.uniform(0, W), rng.uniform(0, H), rng.uniform(1.4, 2.6), rgb, rng.uniform(0.6, 1.0))
    for _ in range(70):
        stamp(cov, col, lit, rng.uniform(0, W), rng.uniform(0, H), rng.uniform(3, 5), SILVER, 1.0, "star")

    def down(a):
        return a.reshape(H, SS, W, SS, *a.shape[2:]).mean(axis=(1, 3))

    cov_d = down(cov)
    col_d = down(col) / np.maximum(cov_d[..., None], 1e-6)  # col is premultiplied by coverage: unpremultiply
    return cov_d, np.clip(col_d, 0, 1), down(lit)


def u8(a: np.ndarray) -> np.ndarray:
    return np.uint8(np.clip(a, 0, 1) * 255 + 0.5)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--preview")
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    jobs = []
    for bubbles, tag in ((True, ""), (False, "-nb")):
        cov, col, lit = draw(SEED, bubbles)
        jobs += [
            (f"cosmos-dots{tag}-{V}.webp", Image.fromarray(np.dstack([u8(col), u8(cov)]), "RGBA")),
            (f"cosmos-lit{tag}-{V}.webp", Image.fromarray(u8(lit), "L")),
        ]
    for name, img in jobs:
        out = OUT / name
        if out.exists() and not args.force:
            print("kept", out.relative_to(ROOT), "(pass --force to rewrite a draft that has never shipped)")
            continue
        img.save(out, "WEBP", quality=92, method=6)
        print("wrote", out.relative_to(ROOT), out.stat().st_size, "bytes")
    if args.preview:
        bg = np.full((H, W, 3), 0.25)
        Image.fromarray(u8(bg * (1 - cov[..., None]) + col * cov[..., None])).save(args.preview)


if __name__ == "__main__":
    main()
