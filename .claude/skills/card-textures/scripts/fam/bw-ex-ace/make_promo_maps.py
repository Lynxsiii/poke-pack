#!/usr/bin/env python3
"""TCG Live foil maps for the three Black & White promo EX that data/bw10.json has no foilMap for (BW81 Thundurus-EX, BW82 Deoxys-EX,
BW83 Lugia-EX; every other promo EX already carries its own in assets/foil/maps/<set>/bwp0nn.webp). Fetches
cards/png/en/bwbsp/bwbsp_en_0nn_std.foil.png from the TCG Live CDN (curl; urllib gets a 403) and converts it exactly as
scripts/fetch_foil_maps.py's alpha_mask() does (white with alpha = luminance x alpha, TCG Live's 22/255 "not foil" floor stretched to 0),
writing assets/foil/fam/bw-ex-ace/map-bwp0nn.webp (367x512, WebP q85). The art of these promos is not that of any regular print
(SIFT + RANSAC against all 56 regular EX: 7 to 13 inliers, a true match gives 800 to 1100), so a regular print's map would put
foil on their Pokemon.   python3 make_promo_maps.py [cache_dir]"""
import subprocess, sys
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[6]
OUT = ROOT / "assets/foil/fam/bw-ex-ace"
CACHE = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/tmp/bw-promo-maps")
FLOOR = 22
URL = "https://cdn.malie.io/file/malie-io/tcgl/cards/png/en/bwbsp/bwbsp_en_{n}_std.foil.png"


def alpha_mask(path):
    a = np.asarray(Image.open(path).convert("RGBA")).astype(np.float32)
    lum = (0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]) * a[..., 3] / 255
    lum = ((lum - FLOOR) * (255 / (255 - FLOOR))).clip(0, 255).round().astype(np.uint8)
    white = np.full_like(lum, 255)
    return Image.fromarray(np.dstack([white, white, white, lum]), "RGBA")


CACHE.mkdir(parents=True, exist_ok=True)
for n in ("081", "082", "083"):
    src = CACHE / f"foil-{n}.png"
    if not src.exists():
        subprocess.run(["curl", "-sfL", "--max-time", "30", URL.format(n=n), "-o", str(src)], check=True)
    alpha_mask(src).save(OUT / f"map-bwp{n}.webp", "WEBP", quality=85, alpha_quality=80, method=6)
    print("wrote", OUT / f"map-bwp{n}.webp")
