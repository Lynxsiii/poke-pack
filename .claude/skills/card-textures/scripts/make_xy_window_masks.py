"""Draw the art-window masks of the XY era's regular frames (TCG Live has no foil maps for XY).

Measured on the scrydex scans (734 x 1024) as the per-pixel standard deviation of ~50 cards of a layout:
the printed frame is the same on every card, so the art window is the region where the cards differ.
Edges are the first pixel the art starts at, inset 0.25% so the window's frame line stays matte.

    XY (xy1 to xy11, g1, dc1, promos): Pokémon window x .088-.912, y .105-.494; a Stage 1 / Stage 2
        card's evolution circle (centre .108,.1128, radius .076 of the width) and its "Evolves from"
        plate (window top .113) are punched out of it; a Trainer's picture x .104-.896, y .163-.512.
    Evolutions (xy12) has its own retro frame: Pokémon x .112-.880, y .142-.526 (Stage and Basic share it,
        the badge sits on the frame); Trainer x .098-.900, y .235-.557.

Each mask is white with the window as alpha, so `mask-mode: alpha` on `--foil-map` works the way the
shipped TCG Live maps do (css/holo/maps.css).  New files only (assets are cached for a year):

    python3 .claude/skills/card-textures/scripts/make_xy_window_masks.py
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[4]
OUT = ROOT / "assets" / "foil" / "xy-win"
W, H = 734, 1024
SS = 4  # supersample for anti-aliased edges
INSET = 0.0025

# name: (x0, y0, x1, y1, circle, extra boxes to cut)  -- fractions of the card
FRAMES = {
    "pokemon": (0.088, 0.105, 0.912, 0.494, None, ()),
    "pokemon-evo": (0.088, 0.113, 0.912, 0.494, (0.108, 0.1128, 0.076), ()),
    "trainer": (0.104, 0.163, 0.896, 0.512, None, ()),
    "evo12-pokemon": (0.112, 0.142, 0.880, 0.526, None, ()),
    # Charizard 11/108 prints the EVOLUTIONS logo over its art: the foil stops at the logo
    "evo12-pokemon-11": (0.112, 0.142, 0.880, 0.526, None, ((0.463, 0.447, 0.862, 0.530),)),
    "evo12-trainer": (0.098, 0.235, 0.900, 0.557, None, ()),
}


def draw(x0, y0, x1, y1, circle, cuts):
    w, h = W * SS, H * SS
    ys, xs = np.mgrid[0:h, 0:w]
    fx, fy = (xs + 0.5) / w, (ys + 0.5) / h
    m = (fx >= x0 + INSET) & (fx <= x1 - INSET) & (fy >= y0 + INSET * 0.72) & (fy <= y1 - INSET * 0.72)
    if circle:
        cx, cy, r = circle
        m &= ((fx - cx) * W) ** 2 + ((fy - cy) * H) ** 2 > (r * W) ** 2
    for bx0, by0, bx1, by1 in cuts:
        m &= ~((fx >= bx0) & (fx <= bx1) & (fy >= by0) & (fy <= by1))
    a = m.reshape(H, SS, W, SS).mean(axis=(1, 3))
    rgba = np.zeros((H, W, 4), np.uint8)
    rgba[..., :3] = 255
    rgba[..., 3] = np.round(a * 255).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, spec in FRAMES.items():
        path = OUT / f"{name}.webp"
        if path.exists():
            print("exists, kept:", path.name)
            continue
        draw(*spec).save(path, "WEBP", lossless=True, method=6)
        print(path.relative_to(ROOT), path.stat().st_size, "bytes")


if __name__ == "__main__":
    main()
