"""Draw the brushed-tinsel tile the Black & White Ace Spec foil lights.

Photos of Computer Search (bw7 137), Master Ball and G Booster (bw10), Scramble Switch (bw8)
(texture-refs/g2-ex-ace) show the Ace Spec foil as fine HORIZONTAL brushed lines on the border,
the name strip, the ACE SPEC lettering and the art ground: the Black & White "tinsel". A perfect
grating of fixed pitch aliases into a line screen on a phone, so this tile is the brush, not the
rule: every row is its own random horizontal streak (correlation length tens of tile pixels, held
for one to four rows, a slow row-band envelope on top), so no row repeats at a fixed spacing and
there is no single vertical frequency to beat against the screen (etch_metrics.py judges it).
White with the streak strength as alpha: it only ever adds light.

    python3 .claude/skills/card-textures/scripts/make_bw_brush.py        # assets/foil/bw-brush-v1.webp
"""
import argparse
from pathlib import Path
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter1d

ROOT = Path(__file__).resolve().parents[4]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--size", type=int, default=512)
    ap.add_argument("--seed", type=int, default=2012)
    ap.add_argument("--sigma-x", type=float, default=34.0, help="streak length (tile px)")
    ap.add_argument("--out", default="assets/foil/bw-brush-v1.webp")
    a = ap.parse_args()
    n = a.size
    rng = np.random.default_rng(a.seed)
    # rows held for 1-4 px so a streak is 1-4 tile px tall (about one phone pixel at 220 px wide)
    heights, rows = [], 0
    while rows < n:
        h = int(rng.choice([1, 2, 2, 3, 4]))
        heights.append(h)
        rows += h
    base = np.repeat(rng.standard_normal((len(heights), n)), heights, axis=0)[:n]
    # a different horizontal phase per row group: smooth along x (wrapping), independent along y
    streak = gaussian_filter1d(base, a.sigma_x, axis=1, mode="wrap")
    streak /= streak.std()
    # slow envelope down the tile: bands of brighter and quieter rows (tens of rows), wrapping
    env = gaussian_filter1d(rng.standard_normal(n), 14, mode="wrap")
    env = 0.75 + 0.25 * env / env.std()
    v = streak * env[:, None]
    lo, hi = np.percentile(v, 28), np.percentile(v, 92)
    alpha = np.clip((v - lo) / (hi - lo), 0, 1) ** 0.95
    # a touch of vertical softening so a streak is not a razor-edged 1 px row
    alpha = gaussian_filter1d(alpha, 0.6, axis=0, mode="wrap")
    alpha8 = (np.clip(alpha, 0, 1) * 255).round().astype(np.uint8)
    white = np.full_like(alpha8, 255)
    out = ROOT / a.out
    Image.fromarray(np.dstack([white, white, white, alpha8]), "RGBA").save(out, "WEBP", quality=80, alpha_quality=85, method=6)
    print(out, out.stat().st_size, "bytes; mean alpha", round(float(alpha8.mean()), 1))


if __name__ == "__main__":
    main()
