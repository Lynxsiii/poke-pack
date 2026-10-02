#!/usr/bin/env python3
"""Draw Dialga-EX 122/119's groove map: the engraving as light and shade, for the silver's own gradient to multiply.

TCG Live's etch for the card (assets/foil/fam/xy-full-art/xy4-122-etch.webp, 733 x 1024) is white where the engraving
leaves a ridge (strips about 4.5 px wide) and clear in the grooves between them (about 2 px). On the real card the ridges
are the bright, wide strokes and the grooves the thin dark lines (eBay scans and lamp photos at 1:1,
/mnt/project-files/holo-remaster/xy-secret-silver/refs/). Cutting the foil to the etch only changed how much foil each
pixel had, so a bright band showed ghost lines (a fresh-eyes review measured the engraving at a third of the photos'
contrast). This map instead shades the grooves: opaque, white on the ridges, 255 x (1 - DEPTH) in the grooves, so the
foil's own colour (dark band, stripe or bright silver) is multiplied darker along every groove, at rest and lit alike.
The etch also has wide areas with no ridges at all (Dialga's eye, a crescent at the chest, a few panels): on the card
they are smooth mirror, a plain mid grey in the photos, not a dark hole, so a clear area wider than WIDE px takes only
WIDE_SHARE of the groove's shade.

    python3 .claude/skills/card-textures/scripts/fam/xy-secret-silver/make_groove.py [--depth 0.3]
writes assets/foil/fam/xy-secret-silver/xy4-122-groove-v1.webp (opaque grey, the etch's own size, never softened).
"""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[6]
WIDE = 5          # a clear area this many px across (at 733 px wide) or more is smooth mirror, not a groove
WIDE_SHARE = 0.4  # the shade such an area takes, as a share of a groove's


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--depth", type=float, default=0.3, help="how much darker a groove is than a ridge (0..1)")
    a = ap.parse_args()
    etch = Image.open(ROOT / "assets/foil/fam/xy-full-art/xy4-122-etch.webp")
    ridge = np.asarray(etch)[..., 3].astype(np.float32) / 255
    clear = ridge < 0.5
    disk = np.hypot(*np.mgrid[-2:3, -2:3]) <= WIDE / 2
    wide = ndimage.binary_dilation(ndimage.binary_opening(clear, structure=disk), structure=disk) & clear
    depth = np.where(ndimage.gaussian_filter(wide.astype(np.float32), 1.0) > 0.5, a.depth * WIDE_SHARE, a.depth)
    grey = (255 * (1 - depth * (1 - ridge))).round().astype(np.uint8)
    out = ROOT / "assets/foil/fam/xy-secret-silver/xy4-122-groove-v1.webp"
    Image.fromarray(grey, "L").convert("RGB").save(out, "WEBP", lossless=True, method=6)
    print(out.relative_to(ROOT), f"{out.stat().st_size:,} bytes; grooves {float((clear & ~wide).mean()):.0%} of the card,"
          f" smooth areas {float(wide.mean()):.0%}")


if __name__ == "__main__":
    main()
