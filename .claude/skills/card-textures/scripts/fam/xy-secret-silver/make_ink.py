#!/usr/bin/env python3
"""Draw Dialga-EX 122/119's ink mask: where the silver foil shows (alpha 1) and where printed ink covers it (alpha 0).

On the real card (eBay scans and photos in /mnt/project-files/holo-remaster/xy-secret-silver/refs/) the black lettering,
the energy and weakness icons, the gold EX logo and the gold Pokémon-EX rule box stay their own colour when the rainbow
columns cross them; only the silver (the grey field and Dialga's white line art) takes the colour. So the mask is the
scan's non-ink: dark pixels (luma under DARK) and coloured ones (chroma over CHROMA: the gold, the red and purple icons)
are cut out, grown by a pixel and softened, at the Live etch's 733 x 1024.

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


def main() -> None:
    scan = Image.open(ROOT / "assets/cards/xy4/122.webp").convert("RGB").resize((W, H), Image.LANCZOS)
    rgb = np.asarray(scan).astype(np.float32)
    luma = 0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]
    chroma = rgb.max(axis=2) - rgb.min(axis=2)
    ink = (luma < DARK) | (chroma > CHROMA)
    ink = ndimage.binary_opening(ink, iterations=1) | (luma < DARK - 30)  # drop lone scan specks, keep thin text
    ink = ndimage.binary_dilation(ink, iterations=1)
    alpha = 1.0 - ndimage.gaussian_filter(ink.astype(np.float32), 0.7)
    a8 = (np.clip(alpha, 0, 1) * 255).astype(np.uint8)
    rgba = np.dstack([np.full_like(a8, 255)] * 3 + [a8])
    out = ROOT / "assets/foil/fam/xy-secret-silver/xy4-122-ink-v1.webp"
    Image.fromarray(rgba, "RGBA").save(out, "WEBP", quality=85, alpha_quality=90, method=6)
    print(out.relative_to(ROOT), f"{out.stat().st_size:,} bytes; ink {float(ink.mean()):.1%} of the card")


if __name__ == "__main__":
    main()
