#!/usr/bin/env python3
"""Draw Dialga-EX 122/119's ink mask: where the silver foil shows (alpha 1) and where printed ink covers it (alpha 0).

On the real card (eBay scans and photos in /mnt/project-files/holo-remaster/xy-secret-silver/refs/) the black lettering
stays black when the rainbow columns cross it, and the gold EX logo, the gold Pokémon-EX rule box and the red and purple
icons keep their colour with only a little of the stripe showing through (the lamp photo: the stripes run on across the
rule box); the silver (the grey field and Dialga's white line art) takes it all. So the mask is the scan's non-ink: dark
pixels (luma under DARK) are cut out, coloured ones (chroma over CHROMA) let COLOURED of the foil through, both grown by
a pixel and softened, at the Live etch's 733 x 1024.

    python3 .claude/skills/card-textures/scripts/fam/xy-secret-silver/make_ink.py
writes assets/foil/fam/xy-secret-silver/xy4-122-ink-v1.webp (white, the mask as alpha).
"""
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[6]
W, H = 733, 1024
DARK = 105     # luma under this is ink (the scan's silver field sits near 200, the line art near 235)
CHROMA = 48    # max-min of RGB over this is coloured ink (gold EX logo, rule box, icons)
COLOURED = 0.4 # the share of the foil that shows through coloured ink


def main() -> None:
    scan = Image.open(ROOT / "assets/cards/xy4/122.webp").convert("RGB").resize((W, H), Image.LANCZOS)
    rgb = np.asarray(scan).astype(np.float32)
    luma = 0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]
    chroma = rgb.max(axis=2) - rgb.min(axis=2)
    dark = ndimage.binary_opening(luma < DARK, iterations=1) | (luma < DARK - 30)  # drop lone scan specks, keep thin text
    dark = ndimage.binary_dilation(dark, iterations=1)
    colour = ndimage.binary_dilation(ndimage.binary_opening(chroma > CHROMA, iterations=1), iterations=1) & ~dark
    ink = dark | colour
    cover = np.maximum(ndimage.gaussian_filter(dark.astype(np.float32), 0.7),
                       (1 - COLOURED) * ndimage.gaussian_filter(colour.astype(np.float32), 0.7))
    alpha = 1.0 - cover
    a8 = (np.clip(alpha, 0, 1) * 255).astype(np.uint8)
    rgba = np.dstack([np.full_like(a8, 255)] * 3 + [a8])
    out = ROOT / "assets/foil/fam/xy-secret-silver/xy4-122-ink-v1.webp"
    Image.fromarray(rgba, "RGBA").save(out, "WEBP", quality=85, alpha_quality=90, method=6)
    print(out.relative_to(ROOT), f"{out.stat().st_size:,} bytes; ink {float(ink.mean()):.1%} of the card")


if __name__ == "__main__":
    main()
