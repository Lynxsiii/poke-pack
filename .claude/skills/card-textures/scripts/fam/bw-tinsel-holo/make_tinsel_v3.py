"""Tinsel, version 3: the ridges as broken streaks of light, in patches, instead of an even line screen.

The 2026-11-28 holo check called 17 of 22 Tinsel faces bad: "uniform horizontal scanlines over art". Version 2 lifted
the whole window with one flat silver and pulled every gap between two ridges down by the same amount, so at phone
size the window read as a CRT screen. The photos (Collexy's Articuno 32/113, Umbreon 64/116, Cobalion 77/98) show
the opposite: the gaps are the print as it is and the ridges are LIGHT, each a run of short streaks of its own
brightness and pastel, dense in some patches of the window and nearly absent in others, which is what gives the foil
its depth.

Same seeded ridge list as make_tinsel.py (so the hue, tint and fleck textures of v2 still line up); three textures:

- tinsel-silver-v3.webp (512 x 1024, RGBA): the streaks. Colour: the ridge's own pale pastel (v2's hue, lightened);
  alpha: crest x a horizontal dash field x a patch field. A hard-light source: it lifts the ink under a streak and
  leaves everything else alone (transparent).
- tinsel-gaps-v3.webp (512 x 1024, RGBA): grey 0.45, alpha the gaps x the patch field x 0.55: a faint shade beside
  the streaks only where the streaks are, so they keep an edge on a pale window. Never an even rule.
- tinsel-crests-v3.webp (512 x 1024, grey): the crests x the dash field, for the held colour-dodge layer.

    python3 .claude/skills/card-textures/scripts/fam/bw-tinsel-holo/make_tinsel_v3.py [--force] [--preview <png>]
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

sys.path.insert(0, str(Path(__file__).resolve().parent))
import make_tinsel as v2  # noqa: E402

V = "v3"
GAP_GREY = 0.45
GAP_ALPHA = 0.55
STREAK_ALPHA = 0.95
STREAK_LIGHT = 0.16   # the pastel pushed this far toward white


def rank(a: np.ndarray) -> np.ndarray:
    out = np.empty(a.size)
    out[np.argsort(a, axis=None)] = np.linspace(0, 1, a.size)
    return out.reshape(a.shape)


def smooth(x: np.ndarray, lo: float, hi: float) -> np.ndarray:
    t = np.clip((x - lo) / (hi - lo), 0, 1)
    return t * t * (3 - 2 * t)


def fields(seed: int):
    rng = np.random.default_rng(seed)
    h, w = v2.H, v2.W
    # dashes: noise stretched along the ridges (about 2 ridges tall, 3-12 % of the card long)
    dash = smooth(rank(gaussian_filter(rng.standard_normal((h, w)), (2.2, 16), mode="wrap")), 0.38, 0.72)
    # patches a quarter of the window across where the foil catches the light
    patch = rank(gaussian_filter(rng.standard_normal((h, w)), (38, 46), mode="wrap"))
    patch = 0.22 + 0.78 * smooth(patch, 0.15, 0.85)
    return dash, patch


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--preview")
    args = ap.parse_args()
    ridges, relief, _glints, hue, _tint, _fleck = v2.draw(v2.SEED)
    dash, patch = fields(v2.SEED + 3)
    amp = ridges / max(ridges.max(), 1e-6)
    streak = np.clip(amp ** 0.8 * dash * patch, 0, 1)
    col = hue[:, :v2.W] + (1 - hue[:, :v2.W]) * STREAK_LIGHT
    silver = np.dstack([col, streak * STREAK_ALPHA])
    gaps_a = (1 - relief) * gaussian_filter(dash * patch, (3, 6)) * GAP_ALPHA
    gaps = np.dstack([np.full((v2.H, v2.W, 3), GAP_GREY), gaps_a])
    crests = np.clip(amp * (0.25 + 0.75 * dash * patch), 0, 1)

    def save(arr, mode, name):
        path = v2.OUT / name
        if path.exists() and not args.force:
            print("kept", name)
            return
        Image.fromarray(v2.u8(arr), mode).save(path, "WEBP", quality=92, method=6)
        print("wrote", name, path.stat().st_size)

    save(silver, "RGBA", f"tinsel-silver-{V}.webp")
    save(gaps, "RGBA", f"tinsel-gaps-{V}.webp")
    save(crests, "L", f"tinsel-crests-{V}.webp")
    if args.preview:
        base = np.full((v2.H, v2.W, 3), 0.25)
        a = silver[..., 3:]
        lit = base * (1 - a) + silver[..., :3] * a
        Image.fromarray(v2.u8(np.hstack([lit, np.dstack([crests] * 3)]))[300:700]).save(args.preview)


if __name__ == "__main__":
    main()
