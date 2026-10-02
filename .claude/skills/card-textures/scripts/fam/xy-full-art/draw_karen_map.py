#!/usr/bin/env python3
"""Draw a background-only foil map for Karen xyp177a (the one "a" promo TCG Live ships no map for).

What the siblings with a Live map show (xyp198, xyp200, xyp150): foil only on the background of the art; the Pokémon or
the character, the name bar, the text box and the border are matte. This draws the same from the scan: the dark red
rose background and the orange tick marks are keyed by colour (HSV), the character is whatever is left (blue hair, skin,
yellow top, white shorts, black outline), cleaned of small islands, refined with cv2.grabCut seeded from the key, grown a few
pixels over the outline, and every pixel outside the art window (header, name bar, text box, border) is zeroed.
Output: assets/foil/fam/xy-full-art/xyp-xyp177a-map.webp, 367 x 512, white with alpha = foil (same format as Live's).

    python3 .claude/skills/card-textures/scripts/fam/xy-full-art/draw_karen_map.py [--debug out.png]
"""
import argparse
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[6]
SCAN = ROOT / "assets" / "cards" / "xyp" / "xyp177a.webp"
OUT = ROOT / "assets" / "foil" / "fam" / "xy-full-art" / "xyp-xyp177a-map.webp"
# the art window in the 600 x 838 scan: below the name bar, above the text box, inside the silver frame
WIN = (34, 140, 566, 704)  # x0, y0, x1, y1


def key_background(rgb: np.ndarray) -> np.ndarray:
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    h, s, v = hsv[..., 0].astype(int), hsv[..., 1].astype(int), hsv[..., 2].astype(int)
    # the rose background is red (hue <= 10 or >= 160); the orange tick marks along both edges are hue up to 16, but there the
    # yellow top (hue 14-20) cannot be, so the wider hue band only applies in the two side strips
    xs = np.arange(rgb.shape[1])[None, :]
    side = (xs < 76) | (xs > 524)
    red = (((h <= 10) | (h >= 160)) | (side & (h <= 16))) & (s >= 120) & (v >= 40)
    return red


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--debug", default="", help="write an overlay (foil in magenta) here")
    ap.add_argument("--no-grabcut", action="store_true")
    a = ap.parse_args()
    rgb = np.asarray(Image.open(SCAN).convert("RGB"))
    H, W = rgb.shape[:2]
    x0, y0, x1, y1 = WIN
    win = np.zeros((H, W), bool)
    win[y0:y1, x0:x1] = True

    bg = key_background(rgb) & win
    k3 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    bg = cv2.morphologyEx(bg.astype(np.uint8), cv2.MORPH_OPEN, k3).astype(bool)
    # small background islands inside the figure (the Poké Ball, red shading) are not background; small figure islands in the
    # background (an orange tick the key missed) are
    n, lab, stats, _ = cv2.connectedComponentsWithStats(bg.astype(np.uint8), connectivity=8)
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] < 1500:
            bg[lab == i] = False
    fg = win & ~bg
    n, lab, stats, _ = cv2.connectedComponentsWithStats(fg.astype(np.uint8), connectivity=8)
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] < 600:
            fg[lab == i] = False
            bg[lab == i] = True

    if not a.no_grabcut:
        mask = np.full((H, W), cv2.GC_BGD, np.uint8)
        mask[win & bg] = cv2.GC_PR_BGD
        mask[win & fg] = cv2.GC_PR_FGD
        mask[win & cv2.erode(bg.astype(np.uint8), np.ones((9, 9), np.uint8)).astype(bool)] = cv2.GC_BGD
        mask[win & cv2.erode(fg.astype(np.uint8), np.ones((11, 11), np.uint8)).astype(bool)] = cv2.GC_FGD
        bgd, fgd = np.zeros((1, 65)), np.zeros((1, 65))
        cv2.grabCut(cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR), mask, None, bgd, fgd, 4, cv2.GC_INIT_WITH_MASK)
        fg = win & ((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD))
        bg = win & ~fg
    # grow the figure over its black outline and anti-aliasing, drop thin background slivers, keep it soft
    fg_grown = cv2.dilate(fg.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))).astype(bool)
    foil = (win & ~fg_grown).astype(np.uint8)
    foil = cv2.morphologyEx(foil, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
    alpha = cv2.GaussianBlur(foil.astype(np.float32) * 255, (0, 0), 1.6)
    alpha = cv2.resize(alpha, (367, 512), interpolation=cv2.INTER_AREA).clip(0, 255).round().astype(np.uint8)
    white = np.full_like(alpha, 255)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(np.dstack([white, white, white, alpha]), "RGBA").save(OUT, "WEBP", quality=90, alpha_quality=90, method=6)
    print(f"{OUT.relative_to(ROOT)}: {OUT.stat().st_size} bytes, foil covers {100 * (alpha > 127).mean():.1f}% of the card")
    if a.debug:
        al = cv2.resize(alpha, (W, H), interpolation=cv2.INTER_LINEAR).astype(np.float32) / 255
        over = rgb.astype(np.float32) * (0.35 + 0.65 * (1 - al[..., None])) + np.array([255, 0, 255], np.float32) * 0.45 * al[..., None]
        Image.fromarray(over.clip(0, 255).astype(np.uint8)).save(a.debug)
    return 0


if __name__ == "__main__":
    sys.exit(main())
