"""Draw the vertical-line grain of the Black & White Pokemon-EX holofoil (family bw-ex-ace).

What the real card does (photos and video frames in /mnt/project-files/holo-remaster/bw-ex-ace/refs/,
SOURCES.md there): a regular-art EX of Next Destinies to Legendary Treasures is the era's "vertical"
holofoil. Under a lamp the foil lights as tall vertical rainbow pillars that sweep sideways with the
tilt, and every pillar is made of fine VERTICAL lines of unequal brightness and length (Darkrai-EX
88/113 and 63/108 tilt clips: the pillar breaks into streaks, gaps between them). That line grain is the
texture Noah asked for ("some ultra rares dont have textures like in noble victories or black and
white"); the scans carry none of it (they are clean print renders), so the light layers draw it.

What this draws: one card-sized tile (no repeat anywhere on the card, so there is no seam and no grid
to find), white with the streak strength as alpha, so it only ever adds light. Columns are grouped two
to five tile pixels wide (never one, which would shimmer under the tilt's resampling), each group gets
its own random brightness that drifts slowly down the card (a streak fades in and out over a fifth of
the card height), and a slow envelope across the card bunches the streaks into looser and tighter
sheaves the way the pillars on the photos do. No fixed pitch: the column widths and strengths are
random, so there is no single horizontal frequency to beat against a phone's pixel grid (etch_metrics.py
lb stays low). A touch of horizontal blur softens the column edges.

    python3 .claude/skills/card-textures/scripts/fam/bw-ex-ace/make_ex_vlines.py
        # -> assets/foil/fam/bw-ex-ace/ex-vlines.webp (640 x 894, the card's 600:838 shape)

Re-running with the same arguments rewrites the same bytes. Once the family has shipped, write a
changed tile under a new name (--out ...-v2.webp) and point the sheet at it: /assets is cached for a year.
"""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter1d

ROOT = Path(__file__).resolve().parents[6]


def draw(w, h, seed, sigma_y, env_sigma, lo_pct, hi_pct):
    rng = np.random.default_rng(seed)
    # column groups 2-5 tile px wide (about 2-5 phone pixels at 220 CSS px x 3)
    widths, cols = [], 0
    while cols < w:
        k = int(rng.choice([2, 2, 3, 3, 3, 4, 4, 5]))
        widths.append(k)
        cols += k
    g = len(widths)
    # each group's brightness drifts down the card: long streaks that fade in and out
    base = rng.standard_normal((h, g))
    base = gaussian_filter1d(base, sigma_y, axis=0, mode="reflect")
    base /= base.std()
    # a per-group constant so some streaks are bright all the way and some never light
    base += 0.8 * rng.standard_normal(g)[None, :]
    v = np.repeat(base, widths, axis=1)[:, :w]
    # slow envelope across the card: sheaves of streaks
    env = gaussian_filter1d(rng.standard_normal(w), env_sigma, mode="reflect")
    env = 0.7 + 0.3 * env / env.std()
    v = v * env[None, :]
    lo, hi = np.percentile(v, lo_pct), np.percentile(v, hi_pct)
    a = np.clip((v - lo) / (hi - lo), 0, 1)
    # soften the column edges a little (a razor edge shimmers under the tilt)
    a = gaussian_filter1d(a, 0.7, axis=1, mode="reflect")
    return np.clip(a, 0, 1)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--width", type=int, default=640)
    ap.add_argument("--height", type=int, default=894)
    ap.add_argument("--seed", type=int, default=2012)
    ap.add_argument("--sigma-y", type=float, default=60.0, help="how slowly a streak's brightness drifts down the card (tile px)")
    ap.add_argument("--env-sigma", type=float, default=14.0, help="width of the sheaves across the card (tile px)")
    ap.add_argument("--lo", type=float, default=30.0, help="percentile drawn as no streak")
    ap.add_argument("--hi", type=float, default=94.0, help="percentile drawn as a full streak")
    ap.add_argument("--floor", type=float, default=0.45, help="alpha left between the lines, so the light still glows there")
    ap.add_argument("--out", default="assets/foil/fam/bw-ex-ace/ex-vlines.webp")
    a = ap.parse_args()
    alpha = draw(a.width, a.height, a.seed, a.sigma_y, a.env_sigma, a.lo, a.hi)
    alpha = a.floor + (1 - a.floor) * alpha
    a8 = (alpha * 255).round().astype(np.uint8)
    white = np.full_like(a8, 255)
    out = ROOT / a.out
    out.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(np.dstack([white, white, white, a8]), "RGBA").save(out, "WEBP", quality=80, alpha_quality=80, method=6)
    print(out, out.stat().st_size, "bytes; mean alpha", round(float(a8.mean()), 1))


if __name__ == "__main__":
    main()
