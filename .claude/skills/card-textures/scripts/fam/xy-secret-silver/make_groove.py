#!/usr/bin/env python3
"""Draw Dialga-EX 122/119's groove maps: the engraving's grooves, for `.foil` to hold between two greys.

TCG Live's etch for the card (assets/foil/fam/xy-full-art/xy4-122-etch.webp, 733 x 1024) is white where the engraving
leaves a ridge (strips about 4.5 px wide) and clear in the grooves between them (about 2 px). Photos of the real card
at 1:1 (/mnt/project-files/holo-remaster/xy-secret-silver/refs/) show what a groove does: it does not mirror the lamp
the way the flat ridges do, so it shows a middling grey whatever the band: thin dark lines across a bright band, thin
light lines across a dark one. So `.foil` clamps its silver to [FLOOR, CEIL] in the grooves and leaves the ridges alone:
`--xss-groove-ceil` (darken: grey CEIL, alpha the groove) and `--xss-groove-floor` (lighten: grey FLOOR, same alpha).
Holding the grooves inside that range, not at one grey, keeps them on the same side of the dark-speck threshold as the
ridges round them (dark_specks.py): a groove under a dark band stays dark enough to join it, one under a bright band
stays light, and between the two the groove follows the band, so the band never breaks into isolated dark strokes.

Live's etch is soft (a groove's centre sits at alpha 0.2, a ridge's at 0.83 or more), so its alpha is stretched from
LO..HI to 0..1 first: a tone curve per pixel, so the lines keep their width and anti-aliasing. The etch also has wide
areas with no ridges at all (Dialga's eye, a crescent at the chest, a few panels): on the card they are smooth mirror,
a plain grey in the photos, not a dark hole, so a clear area wider than WIDE px takes only WIDE_SHARE of the clamp.

    python3 .claude/skills/card-textures/scripts/fam/xy-secret-silver/make_groove.py
writes assets/foil/fam/xy-secret-silver/xy4-122-groove-{ceil,floor}-v1.webp (flat grey, the groove as alpha, the
etch's own size, never softened).
"""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[6]
LO, HI = 0.2, 0.8  # the etch's alpha at a groove's centre and where a ridge starts
WIDE = 5           # a clear area this many px across (at 733 px wide) or more is smooth mirror, not a groove
WIDE_SHARE = 0.3   # how much of the clamp such an area takes


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--ceil", type=float, default=0.45, help="the brightest a groove gets (0..1)")
    ap.add_argument("--floor", type=float, default=0.33, help="the darkest a groove gets (0..1)")
    a = ap.parse_args()
    etch = Image.open(ROOT / "assets/foil/fam/xy-full-art/xy4-122-etch.webp")
    alpha = np.asarray(etch)[..., 3].astype(np.float32) / 255
    clear = alpha < 0.5
    disk = np.hypot(*np.mgrid[-2:3, -2:3]) <= WIDE / 2
    wide = ndimage.binary_dilation(ndimage.binary_opening(clear, structure=disk), structure=disk) & clear
    share = np.where(ndimage.gaussian_filter(wide.astype(np.float32), 1.0) > 0.5, WIDE_SHARE, 1.0)
    groove = (1 - np.clip((alpha - LO) / (HI - LO), 0, 1)) * share
    a8 = (255 * groove).round().astype(np.uint8)
    for name, grey in (("ceil", a.ceil), ("floor", a.floor)):
        g8 = np.full_like(a8, round(255 * grey))
        out = ROOT / f"assets/foil/fam/xy-secret-silver/xy4-122-groove-{name}-v1.webp"
        Image.fromarray(np.dstack([g8, g8, g8, a8]), "RGBA").save(out, "WEBP", lossless=True, method=6)
        print(out.relative_to(ROOT), f"{out.stat().st_size:,} bytes")
    print(f"grooves {float((clear & ~wide).mean()):.0%} of the card, smooth areas {float(wide.mean()):.0%}")


if __name__ == "__main__":
    main()
