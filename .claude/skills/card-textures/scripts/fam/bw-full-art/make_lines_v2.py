#!/usr/bin/env python3
"""Engraved etch for the textured full arts (Next Destinies to Plasma Blast), second pass: no squares.

TCG Live's etch for these prints is a two-level line engraving at 733 x 1024 (line pitch about 6.5 px) that, where the
art is flat or dark, degenerates into a checkerboard of 20 to 40 px cells (Darkrai-EX bw5 107's background, the bottom
of most of them). Lit at full strength that reads as "holographic squares", which the real cards do not have: there the
lines run on through those areas, fine and unbroken. So this finds the big flat cells (a cell wider than a line, found
by morphological opening of the white and of the black) and draws fine lines there instead (about 6.5 px pitch, 50 per
cent duty, a gentle wave so they look hand-cut, the angle taken from the cell's own edges), feathered into the
engraving. Everything else is Live's etch as is (floor 22 stretched to 0, sub-pixel blur 0.6 as ship_live_etch.py).

    python3 .claude/skills/card-textures/scripts/fam/bw-full-art/make_lines_v2.py            # every print
    python3 .claude/skills/card-textures/scripts/fam/bw-full-art/make_lines_v2.py --cards bw5-107 --force

Reads Live's etch PNGs from --src (default /mnt/project-files/holo-remaster/bw-full-art/thread-b-scratch/live, or it
downloads them, see ship_live_etch.py) and writes assets/foil/fam/bw-full-art/etch-v2/<set>-<n>.webp (white, alpha =
the etch).
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[5]
OUT = ROOT / "assets" / "foil" / "fam" / "bw-full-art" / "etch-v2"
BASE = "https://cdn.malie.io/file/malie-io/tcgl/cards/png/en"
FLOOR = 22
PITCH = 6.5
SETS = {"bw4": range(94, 100), "bw5": range(103, 109), "bw6": range(119, 125), "bw7": range(141, 150),
        "bw8": range(131, 136), "bw9": range(109, 117), "bw10": range(96, 102)}


def lum_of(src: Path) -> np.ndarray:
    a = np.asarray(Image.open(src).convert("RGBA")).astype(np.float32)
    lum = (0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]) * a[..., 3] / 255
    return np.clip((lum - FLOOR) * (255 / (255 - FLOOR)), 0, 255)


def disk(r: int) -> np.ndarray:
    return cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))


def big_cells(lum: np.ndarray, r: int = 5):
    """A mask of the flat cells wider than a line (opening of the white and of the black by a disk of radius r)."""
    w = (lum > 128).astype(np.uint8)
    out = np.zeros_like(w)
    for m in (w, 1 - w):
        core = cv2.erode(m, disk(r))
        out |= cv2.dilate(core, disk(r)) & m
    # Join the cells of one patch: the black and the white of a checker touch, and their seams are thin.
    return cv2.erode(cv2.dilate(out, disk(4)), disk(2))


def lines(shape, angle: float, seed: float) -> np.ndarray:
    h, w = shape
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    c, s = np.cos(angle), np.sin(angle)
    rng = np.random.default_rng(int(seed * 100))
    warp = ndimage.gaussian_filter(rng.standard_normal((h, w)).astype(np.float32), 38)
    warp *= 3.0 / max(float(np.abs(warp).max()), 1e-6)  # up to about three line pitches of sway
    phase = (x * c + y * s) / PITCH + warp
    return (0.5 + 0.5 * np.cos(2 * np.pi * phase) > 0.5).astype(np.float32) * 255


def patch_angle(lum: np.ndarray, region: np.ndarray) -> float:
    """The dominant edge direction in the region (a checker's cell edges), as the line direction."""
    gx = cv2.Sobel(lum, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(lum, cv2.CV_32F, 0, 1, ksize=3)
    m = region > 0
    if m.sum() < 50:
        return 0.6
    sxx, syy, sxy = (gx[m] ** 2).sum(), (gy[m] ** 2).sum(), (gx[m] * gy[m]).sum()
    theta = 0.5 * np.arctan2(2 * sxy, sxx - syy)  # gradient direction; the edges run perpendicular to it
    return float(theta + np.pi / 2)


def build(src: Path, sigma: float = 0.6) -> tuple[Image.Image, float]:
    lum = lum_of(src)
    big = big_cells(lum)
    # Skip tiny patches; per-patch angle so each checker keeps the lie of its own cells.
    n, lab = cv2.connectedComponents(big)
    fill = np.zeros_like(lum)
    cover = np.zeros_like(lum)
    for i in range(1, n):
        reg = (lab == i).astype(np.uint8)
        if reg.sum() < 600:
            continue
        ang = patch_angle(lum, cv2.dilate(reg, disk(2)) - cv2.erode(reg, disk(2)) if False else reg)
        # alternate each patch slightly off the cells' own direction so the lines never line up with a cell edge
        ang += 0.35
        fill = np.where(reg > 0, lines(lum.shape, ang, seed=i * 1.7), fill)
        cover = np.maximum(cover, reg.astype(np.float32))
    cover = ndimage.gaussian_filter(cv2.dilate(cover, disk(2)), 2.2)
    out = lum * (1 - cover) + fill * cover
    if sigma > 0:
        out = ndimage.gaussian_filter(out, sigma)
    out = out.round().clip(0, 255).astype(np.uint8)
    white = np.full_like(out, 255)
    return Image.fromarray(np.dstack([white, white, white, out]), "RGBA"), float(cover.mean())


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cards", default="")
    ap.add_argument("--src", default="/mnt/project-files/holo-remaster/bw-full-art/thread-b-scratch/live")
    ap.add_argument("--quality", type=int, default=80)
    ap.add_argument("--alpha-quality", type=int, default=60)
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    src_dir = Path(a.src)
    OUT.mkdir(parents=True, exist_ok=True)
    wanted = {s.strip() for s in a.cards.split(",") if s.strip()}
    for s, rng in SETS.items():
        for n in rng:
            cid = f"{s}-{n}"
            if wanted and cid not in wanted:
                continue
            out = OUT / f"{cid}.webp"
            if out.exists() and not a.force:
                continue
            src = src_dir / f"{s}_{n:03d}.etch.png"
            if not src.exists():
                src_dir.mkdir(parents=True, exist_ok=True)
                subprocess.run(["curl", "-sf", "-m", "60", "-o", str(src), f"{BASE}/{s}/{s}_en_{n:03d}_std.etch.png"], check=True)
            im, cov = build(src)
            im.save(out, "WEBP", quality=a.quality, alpha_quality=a.alpha_quality, method=6)
            print(f"  {cid}: {out.stat().st_size // 1024} KB, checker patches cover {cov * 100:.1f}%")
    return 0


if __name__ == "__main__":
    sys.exit(main())
