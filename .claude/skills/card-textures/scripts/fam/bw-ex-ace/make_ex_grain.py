"""Draw the sparkle grain of the Black & White Pokemon-EX pillar (family bw-ex-ace).

What the real card does (audit 2026-10-22: Darkrai-EX 88/113 tilt frames, /home/user/holo-refs/bw-ex-a/shared/
ph-darkrai-ex-bw5-63_3frames.jpg; Kyogre-EX and Keldeo-EX in-hand frames): under one lamp the EX foil lights as ONE narrow
pillar, and the pillar is not a smooth bar: it is speckled, a column of short bright vertical flecks with dark gaps between
them, its hue drifting down its length. ex-vlines.webp (the line grain of the whole foil) is too long and too soft for it.

What this draws: one card-sized tile (no repeat on the card, so no seam or grid), white with the fleck strength as alpha:
white noise blurred a little, a touch more along the card's height than across it (short sparkle flecks about 2 by 3 tile
px, about 4 by 6 phone px), the top part of it stretched to full alpha, and no floor (round 3: the reviewer found the
round-2 floor of about 0.8 left almost no speckle). It is the mask of .glare::after, a brightened second copy of the pillar
over the solid, mottled pillar on .glare itself, so the light breaks into sparkle without the pillar going dim (a floor of
0.3-0.5 on the only pillar layer left it nearly invisible at phone size).

    python3 .claude/skills/card-textures/scripts/fam/bw-ex-ace/make_ex_grain.py
        # -> assets/foil/fam/bw-ex-ace/ex-grain.webp (320 x 447, stretched over the card)

Re-running with the same arguments rewrites the same bytes. Once shipped, write a changed tile under a new name.
"""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

ROOT = Path(__file__).resolve().parents[6]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--width", type=int, default=320)
    ap.add_argument("--height", type=int, default=447)
    ap.add_argument("--seed", type=int, default=2014)
    ap.add_argument("--sigma-y", type=float, default=1.2, help="fleck length (tile px)")
    ap.add_argument("--sigma-x", type=float, default=0.6, help="fleck width (tile px)")
    ap.add_argument("--lo", type=float, default=40.0, help="percentile drawn as no fleck")
    ap.add_argument("--hi", type=float, default=86.0, help="percentile drawn as a full fleck")
    ap.add_argument("--floor", type=float, default=0.0)
    ap.add_argument("--out", default="assets/foil/fam/bw-ex-ace/ex-grain.webp")
    a = ap.parse_args()
    rng = np.random.default_rng(a.seed)
    v = gaussian_filter(rng.standard_normal((a.height, a.width)), (a.sigma_y, a.sigma_x), mode="wrap")
    lo, hi = np.percentile(v, a.lo), np.percentile(v, a.hi)
    al = np.clip((v - lo) / (hi - lo), 0, 1) ** 1.3
    al = a.floor + (1 - a.floor) * al
    a8 = (al * 255).round().astype(np.uint8)
    white = np.full_like(a8, 255)
    out = ROOT / a.out
    out.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(np.dstack([white, white, white, a8]), "RGBA").save(out, "WEBP", quality=70, alpha_quality=70, method=6)
    print(out, out.stat().st_size, "bytes; mean alpha", round(float(a8.mean()), 1))


if __name__ == "__main__":
    main()
