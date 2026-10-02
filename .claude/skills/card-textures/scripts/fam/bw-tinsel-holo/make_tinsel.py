"""Draw the bw-tinsel-holo family's Tinsel textures (the Black & White era's Rare Holo foil).

What the real foil does (photos and links: /mnt/project-files/holo-remaster/bw-tinsel-holo/refs/SOURCES.md): the art
window of every Black & White Rare Holo, Dragon Vault card and Tinsel promo is a field of fine HORIZONTAL ridges,
about 100 over the card's height (measured on Collexy's flat scans of Cobalion 77/98, Virizion 13/101 and Serperior
6/114: one ridge every 0.9-1.1 % of the card height), each lit a little differently from its neighbours and broken
into streaks of different lengths; the Pokemon is matte (TCG Live's per-card map keeps it out). The site's scans are
clean digital images with no foil in them, so the ridges have to be drawn.

Three full-card textures, 512 x 1024 (the CSS stretches them over the card, so a texture pixel is about one device
pixel on a phone at 3x), drawn from one seeded ridge list so they line up exactly. Crests are 0.55-1.0 bright (skewed
bright), each varying along its length in streak segments 40-360 px long with the odd dead stretch. Spacing is
aperiodic (7.5-13.5 px) and the profiles are soft, flat-topped cosines (a crest is about half its pitch wide), so
there is no single frequency for the browser's resampling to beat against: a regular 2-4 px grating aliases into a
line screen on a phone (SKILL.md), a random ridge field only into a little noise.

- tinsel-crests.webp: the crests, grey on black. The colour-dodged `.cure` layer multiplies its light by it, so only
  the crests flash (and the gaps add nothing).
- tinsel-gaps.webp: where the foil is NOT a lit crest. Grey 0.43 everywhere, its alpha 1 in the gaps between crests and
  falling to 0 at a bright crest's centre (a dim crest keeps some alpha). Laid over the tint in the hard-light `.foil`
  it pulls the gaps back to a grey just under neutral, so the gaps shade the print a little (x0.86, at rest as well)
  and only the crests carry the tint.
- tinsel-glints.webp: short bright segments on about a third of the same crests, narrower than the crest, on black:
  the threads that flash first as the card turns (screened on only while the card is held).

    python3 .claude/skills/card-textures/scripts/fam/bw-tinsel-holo/make_tinsel.py [--force] [--preview <png>]

Writes assets/foil/fam/bw-tinsel-holo/tinsel-crests.webp, tinsel-gaps.webp and tinsel-glints.webp. It refuses to
overwrite them unless --force (allowed only until the family ships; after that a change is a new -vN name: /assets/*
is cached for a year).
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, gaussian_filter1d

ROOT = Path(__file__).resolve().parents[6]
OUT = ROOT / "assets" / "foil" / "fam" / "bw-tinsel-holo"
W, H = 512, 1024
SEED = 20111
GAP_GREY = 0.43       # the grey the gaps are pulled to (hard-light: x0.86, at most 36 levels on white)
PITCH = (7.5, 13.5)   # px between crests at 1024 px card height (about 100 ridges a card)


def segments(rng: np.random.Generator, base: float, lo: float, hi: float, dead: float) -> np.ndarray:
    """A crest's brightness along x: piecewise levels in segments lo-hi px long, softened at the joins."""
    amp = np.empty(W)
    pos = -rng.uniform(0, hi)
    while pos < W:
        length = rng.uniform(lo, hi)
        level = base * rng.uniform(0.62, 1.0)
        if rng.random() < dead:
            level *= 0.3
        a, b = int(max(pos, 0)), int(min(pos + length, W))
        if b > a:
            amp[a:b] = level
        pos += length
    return gaussian_filter1d(amp, 9, mode="nearest")


def draw(seed: int) -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(seed)
    ridges = np.zeros((H, W))
    glints = np.zeros((H, W))
    x = np.arange(W)
    y = rng.uniform(0, PITCH[0])
    while y < H + PITCH[1]:
        pitch = rng.uniform(*PITCH)
        half = pitch * rng.uniform(0.40, 0.52)
        base = 0.55 + 0.45 * rng.random() ** 0.6
        amp = segments(rng, base, 40, 360, 0.12)
        # a slow wobble on top, so even a long segment is not one flat value
        amp *= 1 + 0.12 * np.sin(2 * np.pi * (x / rng.uniform(140, 420)) + rng.uniform(0, 2 * np.pi))
        r0, r1 = int(np.floor(y - half)) - 1, int(np.ceil(y + half)) + 2
        rows = np.arange(max(r0, 0), min(r1, H))
        if rows.size:
            d = (rows - y) / half
            prof = np.where(np.abs(d) < 1, 0.5 * (1 + np.cos(np.pi * d)), 0.0) ** 0.6  # flat-topped crest
            ridges[rows] = np.maximum(ridges[rows], prof[:, None] * amp[None, :])
            if rng.random() < 0.34:
                g = np.zeros(W)
                for _ in range(rng.integers(1, 4)):
                    c, w = rng.uniform(0, W), rng.uniform(18, 110)
                    g = np.maximum(g, rng.uniform(0.55, 1.0) * np.exp(-0.5 * ((x - c) / (w / 2.4)) ** 2))
                gd = (rows - y) / (half * 0.62)
                gprof = np.where(np.abs(gd) < 1, 0.5 * (1 + np.cos(np.pi * gd)), 0.0)
                glints[rows] = np.maximum(glints[rows], gprof[:, None] * g[None, :])
        y += pitch
    ridges = gaussian_filter(np.clip(ridges, 0, 1), (0.6, 1.2))
    glints = gaussian_filter(np.clip(glints, 0, 1), (0.5, 1.5))
    return ridges, glints


def save(img: Image.Image, path: Path, force: bool) -> None:
    if path.exists() and not force:
        sys.exit(f"{path} exists; pass --force before the family ships, or pick a new -vN name")
    img.save(path, "WEBP", quality=92, method=6)
    print("wrote", path.relative_to(ROOT), path.stat().st_size, "bytes")


def u8(arr: np.ndarray) -> np.ndarray:
    return np.uint8(np.clip(arr, 0, 1) * 255 + 0.5)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--preview", help="also write a PNG of both textures side by side here")
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    ridges, glints = draw(SEED)
    gaps = 1 - ridges
    grey = np.full((H, W), GAP_GREY)
    save(Image.fromarray(u8(ridges), "L"), OUT / "tinsel-crests.webp", args.force)
    save(Image.fromarray(np.dstack([u8(grey)] * 3 + [u8(gaps)]), "RGBA"), OUT / "tinsel-gaps.webp", args.force)
    save(Image.fromarray(u8(glints), "L"), OUT / "tinsel-glints.webp", args.force)
    if args.preview:
        Image.fromarray(u8(np.hstack([gaps, glints])), "L").save(args.preview)


if __name__ == "__main__":
    main()
