"""Draw the horizontal tinsel lines of the Black & White ACE SPEC holofoil (family bw-ex-ace).

What the real card does (photos and video frames in /mnt/project-files/holo-remaster/bw-ex-ace/refs/,
SOURCES.md there): an ACE SPEC Trainer (Computer Search, Crystal Edge, Life Dew, Rock Guard, Master Ball,
G Booster...) is foil on the border, the name strip, the ACE SPEC lettering and the art's ground, and that
foil is ruled with fine HORIZONTAL lines, visible even in diffuse light: long streaks of unequal
brightness, each catching its own colour (green, magenta, cyan, violet), the colour sliding up and down
as the card tilts. The scans carry none of the lines (clean print renders), so the light layers draw them.

What this draws: one card-sized tile (no repeat on the card, so no seam and no grid), white with the
line strength as alpha, so it only ever adds light. Rows are grouped two to four tile pixels tall (never
one: a 1 px row shimmers under the tilt's resampling), each group gets its own random brightness that
drifts slowly along the line (a line brightens and fades over a quarter of the card width) plus a
constant of its own (some lines bright edge to edge, some never light), and a slow envelope down the card
bunches them into denser and sparser runs. No fixed pitch, so no single vertical frequency to alias into a
line screen on a phone (etch_metrics.py lb stays low).

    python3 .claude/skills/card-textures/scripts/fam/bw-ex-ace/make_ace_tinsel.py
        # -> assets/foil/fam/bw-ex-ace/ace-tinsel.webp (640 x 894, the card's 600:838 shape)

Re-running with the same arguments rewrites the same bytes. Once the family has shipped, write a
changed tile under a new name (--out ...-v2.webp) and point the sheet at it: /assets is cached for a year.
"""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter1d

ROOT = Path(__file__).resolve().parents[6]


def draw(w, h, seed, sigma_x, env_sigma, lo_pct, hi_pct):
    rng = np.random.default_rng(seed)
    heights, rows = [], 0
    while rows < h:
        k = int(rng.choice([2, 2, 2, 3, 3, 4]))
        heights.append(k)
        rows += k
    g = len(heights)
    base = rng.standard_normal((g, w))
    base = gaussian_filter1d(base, sigma_x, axis=1, mode="reflect")
    base /= base.std()
    base += 0.9 * rng.standard_normal(g)[:, None]
    v = np.repeat(base, heights, axis=0)[:h]
    env = gaussian_filter1d(rng.standard_normal(h), env_sigma, mode="reflect")
    env = 0.7 + 0.3 * env / env.std()
    v = v * env[:, None]
    lo, hi = np.percentile(v, lo_pct), np.percentile(v, hi_pct)
    a = np.clip((v - lo) / (hi - lo), 0, 1)
    a = gaussian_filter1d(a, 0.7, axis=0, mode="reflect")
    return np.clip(a, 0, 1)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--width", type=int, default=640)
    ap.add_argument("--height", type=int, default=894)
    ap.add_argument("--seed", type=int, default=2013)
    ap.add_argument("--sigma-x", type=float, default=70.0, help="how slowly a line's brightness drifts along it (tile px)")
    ap.add_argument("--env-sigma", type=float, default=12.0, help="height of the denser and sparser runs (tile px)")
    ap.add_argument("--lo", type=float, default=32.0, help="percentile drawn as no line")
    ap.add_argument("--hi", type=float, default=93.0, help="percentile drawn as a full line")
    ap.add_argument("--floor", type=float, default=0.2, help="alpha left between the lines, so the light still glows there")
    ap.add_argument("--out", default="assets/foil/fam/bw-ex-ace/ace-tinsel.webp")
    a = ap.parse_args()
    alpha = draw(a.width, a.height, a.seed, a.sigma_x, a.env_sigma, a.lo, a.hi)
    alpha = a.floor + (1 - a.floor) * alpha
    a8 = (alpha * 255).round().astype(np.uint8)
    white = np.full_like(a8, 255)
    out = ROOT / a.out
    out.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(np.dstack([white, white, white, a8]), "RGBA").save(out, "WEBP", quality=80, alpha_quality=80, method=6)
    print(out, out.stat().st_size, "bytes; mean alpha", round(float(a8.mean()), 1))


if __name__ == "__main__":
    main()
