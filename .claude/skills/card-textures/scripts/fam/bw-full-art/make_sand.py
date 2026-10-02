#!/usr/bin/env python3
"""Draw the stipple "sand" of the untextured Black & White full arts (holo family bw-full-art).

Black & White, Emerging Powers and Noble Victories printed their full arts on a foil that is smooth to the touch
(the first textured English full arts are Next Destinies': Elite Fourum's rarity guide, #99 and #104) but not
plain: the art's background sits on a stippled, sand-blasted foil that sparkles as a fine grain, while the
Pokemon and the frame are smooth. A flatbed scan of a real Zekrom 114/114 (Elite Fourum thread 47932) shows the
grey sky as dense light-and-dark specks about 0.2 % of the card wide; Terrakion 99/101's brown background
sparkles green in a tilt clip. TCG Live's etch map for these sets is the same split: white on the Pokemon, the
frame and the lettering, black on the background (the family's CSS cuts the sand to the black part).

This draws one card-sized sheet of specks (733 x 1024, TCG Live's etch size, so it never repeats on a card):
seeded random points of about 1.1 to 1.9 px, each with its own brightness (a facet that catches more or less
light), on black. Opaque greyscale WebP; the CSS multiplies it by the light and screens it onto the print, so a
speck only ever adds light (glitter never darkens).

    python3 .claude/skills/card-textures/scripts/fam/bw-full-art/make_sand.py            # assets/foil/fam/bw-full-art/sand-v1.webp
    python3 .claude/skills/card-textures/scripts/fam/bw-full-art/make_sand.py --preview /tmp/sand.png
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[5]
OUT = ROOT / "assets" / "foil" / "fam" / "bw-full-art" / "sand-v1.webp"
W, H = 733, 1024


def draw(seed: int, density: float) -> np.ndarray:
    rng = np.random.default_rng(seed)
    n = int(W * H * density / 3.2)  # each speck covers about 3 px
    ys = rng.uniform(0, H, n)
    xs = rng.uniform(0, W, n)
    # A speck's brightness: most catch a little light, a few catch a lot (a sand's facets).
    level = np.clip(rng.gamma(2.2, 0.22, n), 0.15, 1.0)
    img = np.zeros((H, W), np.float32)
    iy = np.clip(ys.astype(int), 0, H - 1)
    ix = np.clip(xs.astype(int), 0, W - 1)
    np.maximum.at(img, (iy, ix), level)
    # Grow each point into a soft speck of 1.1 to 1.9 px: a max-filter, then a little blur so the edges anti-alias.
    img = ndimage.grey_dilation(img, size=(2, 2))
    img = ndimage.gaussian_filter(img, 0.45)
    img = img / max(img.max(), 1e-6)
    return np.clip(img * 255, 0, 255).astype(np.uint8)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--seed", type=int, default=5114)
    ap.add_argument("--density", type=float, default=0.30, help="share of the sheet covered by specks")
    ap.add_argument("--preview", default="", help="write a PNG here instead of shipping")
    ap.add_argument("--force", action="store_true", help="overwrite the shipped file (only before the family ships)")
    a = ap.parse_args()
    img = draw(a.seed, a.density)
    im = Image.fromarray(img, "L").convert("RGB")
    if a.preview:
        im.save(a.preview)
        print(f"wrote {a.preview}")
        return 0
    if OUT.exists() and not a.force:
        print(f"{OUT.relative_to(ROOT)} exists; a changed sheet takes a new name (-v2)")
        return 1
    OUT.parent.mkdir(parents=True, exist_ok=True)
    im.save(OUT, "WEBP", lossless=True, method=6)
    print(f"wrote {OUT.relative_to(ROOT)} {OUT.stat().st_size // 1024} KB, coverage {(img > 60).mean():.2f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
