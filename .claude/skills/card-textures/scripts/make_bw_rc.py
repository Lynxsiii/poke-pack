"""Draw the Black & White Radiant Collection's Confetti foil: the window masks and the chip tile.

Legendary Treasures' Radiant Collection (RC1-RC20, regular frame) is Confetti holofoil (Collexy's BW holofoil overview, section 9:
"a holofoil pattern that looks like confetti or pixels ... only in Legendary Treasures, specifically the subset Radiant Collection";
the flat scans of the McDonald's 2011 Blitzle and the Radiant Gardevoir RC10 show it, see
/mnt/project-files/every-era/bw/texture-refs/g1/SOURCES.txt). The art window is a mosaic of small irregular flat chips, each a
different colour and brightness, about 1.6% of the card wide, with the Pokemon matte. TCG Live has no map for the Radiant
Collection, so the window is drawn here from the layout masks make_bw_reverse.py cut from bw1's plain reverse maps (the window is
the hole in them).

    python3 .claude/skills/card-textures/scripts/make_bw_rc.py

Writes assets/foil/bw-rc/window-basic.webp, window-trainer.webp (alpha masks, 367 x 512, alpha = window) and
assets/foil/bw-confetti.webp (256 x 256 RGB chip tile, seamless). Never over an existing file.
"""
from __future__ import annotations

import colorsys
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parents[4]
REV = ROOT / "assets" / "foil" / "bw-reverse"
OUT = ROOT / "assets" / "foil" / "bw-rc"
TILE = ROOT / "assets" / "foil" / "bw-confetti.webp"
N = 256
PITCH = 9.0  # px between chip centres; the CSS draws the tile 45% of the card wide, so a chip is ~1.6% of the card


def window(layout: str, seed: tuple[int, int], rect: tuple[int, int, int, int] | None = None) -> Image.Image:
    a = np.array(Image.open(REV / f"layout-{layout}.webp").convert("RGBA"))[..., 3] > 127
    hole = ~a
    if rect:  # the basic frame's window leaks into the margin through a wide gap: cut it to the window's own box
        box = np.zeros_like(hole)
        box[rect[1]:rect[3], rect[0]:rect[2]] = True
        hole &= box
    # the window leaks into the card margin through hairline gaps in the frame: open it with a disc wider than the gaps, find the
    # window, then grow it back inside the original hole
    yy, xx = np.mgrid[-5:6, -5:6]
    disc = (xx * xx + yy * yy) <= 25
    core = ndi.binary_opening(hole, structure=disc)
    lab, _ = ndi.label(core)
    comp = lab == lab[seed[1], seed[0]]
    comp = ndi.binary_dilation(comp, structure=disc, iterations=1) & hole
    comp = ndi.binary_fill_holes(comp)
    comp = ndi.binary_erosion(comp, iterations=1)  # stay inside the frame's lip
    out = np.zeros(a.shape + (4,), np.uint8)
    out[..., :3] = 255
    out[..., 3] = (ndi.gaussian_filter(comp.astype(float), 0.6) * 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def confetti() -> Image.Image:
    rng = np.random.default_rng(2013)
    g = int(N / PITCH)
    step = N / g
    gx, gy = np.meshgrid(np.arange(g), np.arange(g))
    seeds = np.stack([(gx + rng.random((g, g))) * step, (gy + rng.random((g, g))) * step], -1).reshape(-1, 2)
    wrap = np.concatenate([seeds + (dx * N, dy * N) for dx in (-1, 0, 1) for dy in (-1, 0, 1)])
    ids = np.tile(np.arange(len(seeds)), 9)
    ys, xs = np.mgrid[0:N, 0:N]
    pts = np.stack([xs.ravel() + 0.5, ys.ravel() + 0.5], -1)
    d, idx = cKDTree(wrap).query(pts, k=2)
    cell = ids[idx[:, 0]].reshape(N, N)
    edge = ((d[:, 1] - d[:, 0]) < 0.9).reshape(N, N)  # a thin dark seam between chips
    # one colour and one brightness per chip: mostly lit chips in the colours of a lit mosaic, a third dark
    n = len(seeds)
    hue = rng.choice([0.0, 0.07, 0.13, 0.33, 0.5, 0.58, 0.78, 0.9], n) + rng.normal(0, 0.03, n)
    val = 0.35 + 0.65 * rng.random(n) ** 0.8
    val[rng.random(n) < 0.3] = 0.05
    sat = 0.55 + 0.45 * rng.random(n)
    rgb = np.array([colorsys.hsv_to_rgb(h % 1.0, s, v) for h, s, v in zip(hue, sat, val)])
    img = rgb[cell]
    img[edge] *= 0.2
    return Image.fromarray((img * 255).astype(np.uint8), "RGB")


def main() -> None:
    OUT.mkdir(exist_ok=True)
    jobs = [(OUT / "window-basic.webp", lambda: window("basic", (183, 150), (26, 48, 340, 268))), (OUT / "window-trainer.webp", lambda: window("trainer", (183, 150), (22, 78, 346, 268))), (TILE, confetti)]
    for path, make in jobs:
        if path.exists():
            sys.exit(f"{path} exists; pick a new name (assets are immutable)")
    for path, make in jobs:
        make().save(path, "WEBP", quality=92, method=6)
        print("wrote", path.relative_to(ROOT), path.stat().st_size)


if __name__ == "__main__":
    main()
