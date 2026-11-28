"""Cosmos, version 3: v2's glints thinned out, in patches.

The 2026-11-28 full-site check failed 36 cosmos promos for "glitter dots over the art", "hides the texture": v2 put about
9000 pinpoints on a card, the same density everywhere, plain at rest. Version 3 keeps each of v2's glints (pinpoints, dots,
stars, bubbles) with a probability that follows a patch field (about 1 in 3 in the dense patches, 1 in 12 in the quiet
ones), so the window reads as the print with a sprinkle of light on it. Same file layout as v2: cosmos-dots[-nb]-v3.webp
(RGBA, colour and coverage) and cosmos-lit[-nb]-v3.webp (RGB light on black).

    python3 .claude/skills/card-textures/scripts/fam/bw-tinsel-holo/make_cosmos_v3.py [--force]
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parents[6]
OUT = ROOT / "assets" / "foil" / "fam" / "bw-tinsel-holo"
KEEP = (0.08, 0.34)


def main():
    force = "--force" in sys.argv
    for tag in ("-nb", ""):
        dots = np.asarray(Image.open(OUT / f"cosmos-dots{tag}-v2.webp").convert("RGBA")).astype(np.float32)
        lit = np.asarray(Image.open(OUT / f"cosmos-lit{tag}-v2.webp").convert("RGB")).astype(np.float32)
        h, w = dots.shape[:2]
        rng = np.random.default_rng(20123)
        f = ndi.gaussian_filter(rng.standard_normal((h, w)), (60, 40), mode="wrap")
        r = np.empty(f.size); r[np.argsort(f, axis=None)] = np.linspace(0, 1, f.size); r = r.reshape(f.shape)
        prob = KEEP[0] + (KEEP[1] - KEEP[0]) * np.clip((r - 0.25) / 0.5, 0, 1)
        blob = np.maximum(dots[..., 3], lit.max(axis=2)) > 10
        lab, n = ndi.label(blob)
        cy, cx = np.array(ndi.center_of_mass(blob, lab, range(1, n + 1))).T
        keep = np.zeros(n + 1, bool)
        keep[1:] = rng.uniform(size=n) < prob[cy.astype(int).clip(0, h - 1), cx.astype(int).clip(0, w - 1)]
        m = ndi.gaussian_filter(ndi.binary_dilation(keep[lab], iterations=1).astype(np.float32), 0.6)
        m = np.clip(m * 1.4, 0, 1)
        dots[..., 3] *= m
        lit *= m[..., None]
        for arr, mode, name in ((dots, "RGBA", f"cosmos-dots{tag}-v3.webp"), (lit, "RGB", f"cosmos-lit{tag}-v3.webp")):
            p = OUT / name
            if p.exists() and not force:
                raise SystemExit(f"{p} exists")
            Image.fromarray(arr.clip(0, 255).astype(np.uint8), mode).save(p, quality=92, method=6)
            print("wrote", p, f"{n} glints, {int(keep.sum())} kept")


if __name__ == "__main__":
    main()
