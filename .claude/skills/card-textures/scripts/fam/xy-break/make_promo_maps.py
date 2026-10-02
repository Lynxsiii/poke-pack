#!/usr/bin/env python3
"""make_promo_maps.py: the foil maps of the five BREAK promos the site had no TCG Live map for.

Draws: nothing. It converts TCG Live's raw foil maps (the `xybsp_*.foil.png` luminance PNGs saved in
/mnt/project-files/holo-remaster/xy-break/raw-maps/ by fetch_foil_maps.py's source, one per card) to the site's
map format the way fetch_foil_maps.alpha_mask() does (white, alpha = luminance x alpha, TCG Live's "not foil"
floor of 22/255 stretched to 0) and writes them to assets/foil/fam/xy-break/maps/<number>-v1.webp.
The 26 numbered BREAKs and the three Evolutions promos already carry a map in data/*.json; these five
(xy8-xyp134/135/136, xy10-xyp154/155) fell to the median xy-ex-safe-break map, which lets the foil over the
name bar's edge and the rule box. Deterministic; rerun: python3 make_promo_maps.py
"""
from pathlib import Path
import numpy as np
from PIL import Image

RAW = Path("/mnt/project-files/holo-remaster/xy-break/raw-maps")
OUT = Path(__file__).resolve().parents[6] / "assets/foil/fam/xy-break/maps"
FLOOR = 22
PROMOS = {"xybsp_134": "xyp134", "xybsp_135": "xyp135", "xybsp_136": "xyp136", "xybsp_154": "xyp154", "xybsp_155": "xyp155"}

OUT.mkdir(parents=True, exist_ok=True)
for src, name in PROMOS.items():
    a = np.asarray(Image.open(RAW / f"{src}.foil.png").convert("RGBA")).astype(np.float32)
    lum = (0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]) * a[..., 3] / 255
    lum = ((lum - FLOOR) * (255 / (255 - FLOOR))).clip(0, 255).round().astype(np.uint8)
    white = np.full_like(lum, 255)
    img = Image.fromarray(np.dstack([white, white, white, lum]), "RGBA")
    dest = OUT / f"{name}-v1.webp"
    img.save(dest, "WEBP", lossless=True, quality=100, method=6)
    print(dest, img.size, "foil share %.2f" % (lum.mean() / 255))
