"""Tinsel, version 4: scattered streaks of light, no ridge grid.

The 2026-11-28 full-site check (every card) still called v3 a "horizontal line screen" on 30 faces and "no foil" on 13 pale
windows: v3 kept v2's evenly pitched ridge list, so its streaks sat on a regular rule, and its pale pastels (hard-light,
channels near 0.5) changed nothing on pale ink. Version 4 drops the grid: each streak is its own dash at a random height,
2-16 % of the card long, with its own brightness and colour, dense in some patches of the window and nearly absent in
others (the depth of the real foil; Collexy's Articuno 32/113, Umbreon 64/116). Colours are saturated enough to tint pale
ink (hard-light: the weak channel multiplies to about x0.6) and lift dark ink.

- tinsel-streak-v4.webp (600 x 840, RGBA): the field of fine streaks. Faint over the window at rest, plain round the lamp.
- tinsel-hot-v4.webp (720 x 840, RGBA): fewer, longer, near-white streaks with a bright core: the flash in the lamp's
  pool, slid sideways by the tilt (the layer is 120 % wide).
- tinsel-silver-v4.webp: the same long streaks, desaturated, low alpha: light for a dark window (hard-light).
- tinsel-tint-v4.webp: the fine streaks as hard-light tints that only darken (strongest channel 0.5): colour on pale ink.

    python3 .claude/skills/card-textures/scripts/fam/bw-tinsel-holo/make_tinsel_v4.py [--force] [--preview <png>]
"""
from __future__ import annotations

import argparse
import colorsys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

ROOT = Path(__file__).resolve().parents[6]
OUT = ROOT / "assets" / "foil" / "fam" / "bw-tinsel-holo"
V = "v4"
H = 840
HUES = (330, 20, 52, 140, 188, 262)


def rank(a):
    out = np.empty(a.size)
    out[np.argsort(a, axis=None)] = np.linspace(0, 1, a.size)
    return out.reshape(a.shape)


def patches(rng, h, w, sig):
    p = rank(gaussian_filter(rng.standard_normal((h, w)), sig, mode="wrap"))
    t = np.clip((p - 0.2) / 0.6, 0, 1)
    return t * t * (3 - 2 * t)


def draw(seed, w, n, length, thick, white, light, sat, floor):
    rng = np.random.default_rng(seed)
    dens = floor + (1 - floor) * patches(rng, H, w, (46, 60))
    acc = np.zeros((H, w, 3))
    alpha = np.zeros((H, w))
    xs = np.arange(w)
    made = 0
    while made < n:
        cy, cx = rng.uniform(0, H), rng.uniform(0, w)
        if rng.uniform() > dens[int(cy) % H, int(cx) % w]:
            continue
        made += 1
        ln = length[0] + (length[1] - length[0]) * rng.uniform() ** 2.2
        th = rng.uniform(*thick)
        b = rng.uniform(0.35, 1.0)
        if rng.uniform() < white:
            rgb = colorsys.hls_to_rgb(rng.uniform(), 0.9, 0.25)
        else:
            rgb = colorsys.hls_to_rgb(((rng.choice(HUES) + rng.uniform(-12, 12)) % 360) / 360, rng.uniform(*light), sat)
        # along: flat middle, soft pointed ends; across: a gaussian
        dx = np.abs(((xs - cx + w / 2) % w) - w / 2)
        along = np.clip((ln / 2 - dx) / (ln * 0.3 + 1), 0, 1)
        y0, y1 = int(cy - 3 * th - 1), int(cy + 3 * th + 2)
        for y in range(y0, y1):
            a = b * np.exp(-0.5 * ((y - cy) / th) ** 2) * along
            yy = y % H
            new = a > alpha[yy]
            alpha[yy] = np.where(new, a, alpha[yy])
            acc[yy][new] = rgb
    return np.dstack([acc, alpha])


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--preview")
    args = ap.parse_args()
    streak = draw(20411, 600, 4200, (24, 120), (0.75, 1.2), 0.4, (0.52, 0.60), 0.85, 0.1)
    hot = draw(20412, 720, 900, (40, 170), (0.9, 1.6), 0.5, (0.54, 0.62), 0.85, 0.04)
    # the long streaks as silver light for dark windows (hard-light source over 0.5: it only lifts), low alpha
    luma = hot[..., :3] @ np.array([0.299, 0.587, 0.114])
    silver = np.dstack([hot[..., :3] * 0.3 + luma[..., None] * 0.7, hot[..., 3] * 0.34])
    # the fine streaks as a tint for pale windows: each colour scaled so its strongest channel is hard-light's neutral
    # 0.5 and its weakest about 0.27 (x0.54): a coloured line on white ink, nothing on dark ink
    c = streak[..., :3]
    mx = np.maximum(c.max(axis=2, keepdims=True), 1e-3)
    tint = np.dstack([0.5 * (1 - 0.6 * (1 - c / mx)), streak[..., 3] * 0.85])
    tint[..., :3][streak[..., 3] < 1e-3] = 0.5
    for arr, name in ((streak, f"tinsel-streak-{V}.webp"), (hot, f"tinsel-hot-{V}.webp"),
                      (silver, f"tinsel-silver-{V}.webp"), (tint, f"tinsel-tint-{V}.webp")):
        path = OUT / name
        if path.exists() and not args.force:
            raise SystemExit(f"{path} exists: a changed texture needs a new version (--force only before it ships)")
        Image.fromarray((np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA").save(path, quality=92, method=6)
        print("wrote", path, path.stat().st_size)
    if args.preview:
        bg = np.zeros((H, 1320, 3))
        bg[:, :600] = streak[..., :3] * streak[..., 3:]
        bg[:, 600:] = hot[..., :3] * hot[..., 3:]
        Image.fromarray((bg * 255).astype(np.uint8)).save(args.preview)


if __name__ == "__main__":
    main()
