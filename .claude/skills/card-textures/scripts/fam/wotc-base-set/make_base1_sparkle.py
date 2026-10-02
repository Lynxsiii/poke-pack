#!/usr/bin/env python3
"""Draw the Base Set (base1) holo sparkle maps: the starlight the foil printed into each card's own scan.

Family wotc-base-set (older-era holo remaster, 2026-10-01). The Starlight foil of a 1999 Base Set holo is a mirror
embossed with short streaks and thin four-point stars; under a lamp those catch the light one after another as the card
turns, while the ink over them glows in its own colour. The scans (assets/cards/base1/<n>.webp) carry that pattern frozen
in (the streaks and stars are the bright specks of the window's background), and the pattern is not registered to the
art (two copies of a card put their stars in different places), so each card's map is cut from its own scan:

  1. The matte parts (the Pokémon, its underlay halo, the badge: the complement of the card's foil mask
     assets/foil/fam/wotc-base-set/<n>-bg-v1.webp, drawn by make_base1_masks.py) are filled in from the background
     around them (cv2.inpaint), so the outline of the Pokémon does not read as a bright rim.
  2. The sparkle is the positive part of a band-pass of the luminance (sigma 0.6 minus sigma 3: streaks and star cores)
     plus a coarser one (sigma 1.5 minus sigma 8: the bodies of the big stars), normalised per card on its 99.5th
     percentile, so a dark card and a light card get the same density of specks.
  3. It is thresholded softly (0.18 to 0.85, gamma 1.3), cut to the foil mask, and split into two halves by connected
     speck (seeded), so the CSS can light the halves with two bands that slide different ways: the specks wink in turn.

Output (new files only; assets are cached for a year, so a change is a new -vN name):
  assets/foil/fam/wotc-base-set/<n>-spark-a-v<k>.webp, <n>-spark-b-v<k>.webp   600 x 838, white, ALPHA = sparkle, lossless.
Debug: --preview DIR writes <n>-spark.png (both halves, a red and b green over the darkened scan).

  python3 .claude/skills/card-textures/scripts/fam/wotc-base-set/make_base1_sparkle.py --preview /tmp/x [--only 4,2] [--write]
"""
from __future__ import annotations

import argparse
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

cv2.setNumThreads(1)
ROOT = Path(__file__).resolve().parents[6]
OUT = ROOT / "assets" / "foil" / "fam" / "wotc-base-set"
W, H = 600, 838
SEED = 1999


def load(n: int) -> tuple[np.ndarray, np.ndarray]:
    rgb = np.array(Image.open(ROOT / "assets" / "cards" / "base1" / f"{n}.webp").convert("RGB"))
    bg = np.array(Image.open(OUT / f"{n}-bg-v1.webp"))[..., 3].astype(np.float32) / 255.0
    return rgb, bg


def sparkle(rgb: np.ndarray, bg: np.ndarray) -> np.ndarray:
    """Sparkle strength 0..1 over the foil, from the scan's own bright specks."""
    hole = (bg < 0.5).astype(np.uint8)
    # fill the matte parts from the background around them; outside the window the fill is irrelevant (cut below)
    filled = cv2.inpaint(rgb, hole, 5, cv2.INPAINT_TELEA)
    L = filled.astype(np.float32) @ np.array([0.299, 0.587, 0.114], np.float32)
    fine = cv2.GaussianBlur(L, (0, 0), 0.6) - cv2.GaussianBlur(L, (0, 0), 3.0)
    coarse = cv2.GaussianBlur(L, (0, 0), 1.5) - cv2.GaussianBlur(L, (0, 0), 8.0)
    s = np.maximum(fine, 0) + 0.6 * np.maximum(coarse, 0)
    inside = bg > 0.9
    p = float(np.percentile(s[inside], 99.5)) if inside.any() else 1.0
    s = s / max(p, 1e-3)
    a = np.clip((s - 0.18) / (0.85 - 0.18), 0, 1) ** 1.3
    # the foil mask, pulled in by a pixel so no speck sits on the Pokémon's outline
    inner = cv2.GaussianBlur(np.clip((bg - 0.5) * 2, 0, 1), (0, 0), 0.8)
    return a * inner * bg


def split(a: np.ndarray, seed: int) -> tuple[np.ndarray, np.ndarray]:
    """Two halves by connected speck: every speck (and its soft fringe) goes to one half, chosen at random."""
    core = a > 0.12
    lab, n = ndi.label(core, structure=np.ones((3, 3)))
    rng = np.random.default_rng(seed)
    side = np.concatenate([[0], rng.integers(0, 2, n)])  # 0 or 1 per speck
    # the fringe below the core threshold takes its nearest speck's side
    if n:
        _, (iy, ix) = ndi.distance_transform_edt(lab == 0, return_indices=True)
        near = lab[iy, ix]
    else:
        near = lab
    pick = side[near]
    return a * (pick == 0), a * (pick == 1)


def save(alpha: np.ndarray, path: Path) -> None:
    rgba = np.zeros((H, W, 4), np.uint8)
    rgba[..., :3] = 255
    rgba[..., 3] = np.round(np.clip(alpha, 0, 1) * 255).astype(np.uint8)
    Image.fromarray(rgba, "RGBA").save(path, "WEBP", lossless=True, quality=100, method=6)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--preview", default="")
    ap.add_argument("--version", type=int, default=1)
    ap.add_argument("--write", action="store_true", help="write the maps into assets/foil/fam/wotc-base-set/")
    args = ap.parse_args()
    nums = [int(s) for s in args.only.split(",") if s] or list(range(1, 17))
    prev = Path(args.preview) if args.preview else None
    if prev:
        prev.mkdir(parents=True, exist_ok=True)
    for n in nums:
        rgb, bg = load(n)
        a = sparkle(rgb, bg)
        ha, hb = split(a, SEED + n)
        cover = float((a > 0.25).sum() / max(1, (bg > 0.5).sum()))
        print(n, "sparkle cover of the foil", round(cover, 3))
        if args.write:
            for half, name in ((ha, "a"), (hb, "b")):
                out = OUT / f"{n}-spark-{name}-v{args.version}.webp"
                save(half, out)
                print("  wrote", out.relative_to(ROOT), out.stat().st_size, "bytes")
        if prev:
            base = rgb.astype(np.float32) * 0.45
            vis = base + np.stack([ha, hb, np.zeros_like(ha)], -1) * 255 * 0.9
            Image.fromarray(np.clip(vis, 0, 255).astype(np.uint8)).save(prev / f"{n}-spark.png")


if __name__ == "__main__":
    main()
