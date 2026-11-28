#!/usr/bin/env python3
"""Gold Items: keep the engraved ridge lines on the GOLD only (<id>-ridge-v2.webp).

The v1 ridges (make_item_ridges.py) cover the whole face, the painted object included, and the family lights them
warm white: a black hammer head turned to gold speckle and a red Poke Ball went white under the lamp (per-card
review, 2026-11-28). On the real card the engraving glints on the gold ink; over the object's own colours it is
barely seen. This reads each card's scan, measures how gold each pixel is (hue 28..62 deg, saturated, bright) and
scales the v1 ridge alpha by it (floor 0.12), so the lines stay on the gold frame, rays and watermark and fall
away over the painted object. No per-card hints.

  python3 make_item_ridges_gold.py            # every gold Item
"""
import colorsys, sys
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parents[6]
DIR = ROOT / "assets/foil/fam/xy-secret-gold"
ITEMS = ["xy5-161", "xy5-162", "xy5-163", "xy5-164", "xy6-109", "xy6-110", "xy7-99", "xy7-100"]
FLOOR = 0.12


def goldness(rgb):
    a = rgb.astype(np.float32) / 255.0
    mx, mn = a.max(2), a.min(2)
    d = mx - mn
    sat = np.where(mx > 0, d / np.maximum(mx, 1e-6), 0)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    hue = np.zeros_like(mx)
    m = d > 1e-6
    rc = np.where(m, (mx - r) / np.maximum(d, 1e-6), 0)
    gc = np.where(m, (mx - g) / np.maximum(d, 1e-6), 0)
    bc = np.where(m, (mx - b) / np.maximum(d, 1e-6), 0)
    hue = np.where(mx == r, bc - gc, np.where(mx == g, 2 + rc - bc, 4 + gc - rc)) * 60 % 360
    h = np.clip(1 - np.abs(hue - 45) / 22, 0, 1)           # 1 at 45 deg, 0 outside 23..67
    s = np.clip((sat - 0.3) / 0.25, 0, 1)
    v = np.clip((mx - 0.4) / 0.25, 0, 1)
    return h * s * v


def main():
    for cid in ITEMS:
        st, num = cid.split("-")
        scan = Image.open(ROOT / f"assets/cards/{st}/{num}.webp").convert("RGB")
        v1 = Image.open(DIR / f"{cid}-ridge-v1.webp").convert("RGBA")
        g = goldness(np.asarray(scan.resize(v1.size, Image.LANCZOS)))
        g = ndi.gaussian_filter(ndi.grey_erosion(g, size=5), 3)   # pull the gold back from the object's edge
        arr = np.asarray(v1).astype(np.float32)
        arr[..., 3] *= FLOOR + (1 - FLOOR) * np.clip(g * 1.3, 0, 1)
        out = DIR / f"{cid}-ridge-v2.webp"
        Image.fromarray(arr.round().astype(np.uint8), "RGBA").save(out, "WEBP", quality=90, alpha_quality=92, method=6)
        print(out.relative_to(ROOT), f"gold {g.mean():.2f}")


if __name__ == "__main__":
    sys.exit(main())
