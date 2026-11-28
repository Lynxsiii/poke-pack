#!/usr/bin/env python3
"""The Sword & Shield Rare Holo's fine foil texture (holo family swsh-holo, css/holo/fam/swsh-holo.css).

Replaces the line strip (make_lines.py) on the site: at phone size the periodic 140-line grating read as a uniform
vertical line screen over the whole art box (2026-11-28 per-card review, 117 cards). This is the same foil without a
period: white noise smoothed a little more down the card than across it (short vertical fibres, the brushed look of
the real sheet), band-limited so it cannot alias, normalised round 128 for a soft-light / hard-light blend where 0.5
is neutral. Stretched over the card (background-size 100% 100%).

    python3 make_grain.py            # assets/foil/fam/swsh-holo/grain-v2.webp
"""
import argparse

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="assets/foil/fam/swsh-holo/grain-v2.webp")
    ap.add_argument("--amp", type=float, default=24)
    ap.add_argument("--sx", type=float, default=0.9)
    ap.add_argument("--sy", type=float, default=1.6)
    ap.add_argument("--seed", type=int, default=7)
    a = ap.parse_args()
    w, h = 512, 716
    n = np.random.default_rng(a.seed).standard_normal((h, w))
    g = gaussian_filter(n, (a.sy * 0.7, a.sx * 0.7), mode="wrap")
    g -= gaussian_filter(g, 6, mode="wrap")          # no blotches: keep the fine band only
    g /= g.std()
    img = np.clip(np.round(128 + a.amp * np.clip(g, -2.5, 2.5)), 0, 255).astype(np.uint8)
    Image.fromarray(img, "L").convert("RGB").save(a.out, "WEBP", quality=78)
    print(a.out, img.shape)


if __name__ == "__main__":
    main()
