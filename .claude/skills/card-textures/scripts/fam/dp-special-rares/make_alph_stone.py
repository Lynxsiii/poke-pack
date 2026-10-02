#!/usr/bin/env python3
"""Alph Lithograph ONE-FOUR (hgss1-ONE .. hgss4-FOUR): where the stone is, assets/foil/fam/dp-special-rares/alph-stone.webp.

The real card is a textured, matte stone slab with no foil (refs/SOURCES.md; the photos in refs/). Its relief catches a raking light, so the page
lays the card's own greyscale over itself twice, offset the pointer's way, as an emboss (css/holo/fam/dp-special-rares.css, dsr-alph). That emboss must
reach the stone only: the tablet of Unown tiles (the art window) and the lettered slab below it (the text box), not the yellow border, the
trainer banner, the card's name or the illustrator line, which are printed, not carved.

One mask serves all four cards (they share the HGSS trainer frame): alpha = the frame's art window (assets/foil/dp-win/hgss-trainer.webp) united
with the text box, kept 4 px off their bevels, 1 px soft. 600 x 838, like the scans, so the page lays it over the card with `100% 100%`.

    python3 make_alph_stone.py [--check DIR]    writes the mask; --check also writes the mask's edge over each of the four scans
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

from dsr_common import OUT, ROOT, W, H, load_scan

CARDS = ["hgss1-ONE", "hgss2-TWO", "hgss3-THREE", "hgss4-FOUR"]
TEXT_BOX = (45, 340, 555, 770)          # the lettered slab (card pixels, measured on the four scans)


def stone() -> np.ndarray:
    win = np.asarray(Image.open(ROOT / "assets" / "foil" / "dp-win" / "hgss-trainer.webp").convert("RGBA").resize((W, H), Image.BILINEAR))[..., 3] > 128
    x0, y0, x1, y1 = TEXT_BOX
    box = np.zeros_like(win)
    box[y0:y1, x0:x1] = True
    return ndi.binary_erosion(win | box, iterations=4)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", type=Path)
    a = ap.parse_args()
    m = ndi.gaussian_filter(stone().astype(np.float32), 1.0)
    rgba = np.zeros((H, W, 4), np.uint8)
    rgba[..., :3] = 255
    rgba[..., 3] = np.round(np.clip(m, 0, 1) * 255).astype(np.uint8)
    dst = OUT / "alph-stone.webp"
    Image.fromarray(rgba, "RGBA").save(dst, "WEBP", lossless=True, quality=100, method=6)
    print("wrote", dst.relative_to(ROOT), f"{dst.stat().st_size / 1024:.1f} KB", f"stone = {float((m > 0.5).mean()) * 100:.0f}% of the card")
    if a.check:
        a.check.mkdir(parents=True, exist_ok=True)
        edge = (m > 0.5) ^ ndi.binary_erosion(m > 0.5, iterations=2)
        tiles = []
        for cid in CARDS:
            rgb, _ = load_scan(cid)
            rgb = rgb.copy()
            rgb[edge] = (1, 0, 0.2)
            rgb[(m > 0.5) & ~edge] *= 0.75
            tiles.append((np.clip(rgb, 0, 1) * 255).astype(np.uint8))
        Image.fromarray(np.concatenate(tiles, axis=1)).save(a.check / "alph-stone-check.jpg", quality=88)


if __name__ == "__main__":
    main()
