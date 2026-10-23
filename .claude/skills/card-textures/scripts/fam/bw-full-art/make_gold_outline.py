#!/usr/bin/env python3
"""Draw the gold outline map of the engraved Black & White full arts (holo family bw-full-art).

From Next Destinies to Plasma Blast the full-art Pokemon-EX carry a printed gold outline round the Pokemon, and on the
real card it is a glittery metallic gold that flashes as discrete gold-white points under the light (Rayquaza-EX 123
tilt clip, White Kyurem-EX 146 and Latias-EX 112 scans, Raikou-EX 105 macro: /home/user/holo-refs/bw-fa-bw5-bw6-bw7/,
bw-fa-bw8-bw9-bw10/). The scan prints it as a flat yellow line. This finds that line in the scan: yellow-gold pixels
(hue 38 to 62 degrees, saturation over 0.45, value over 0.5) that belong to a thin structure (removed by a 2 px
opening, so a yellow head or a flame field is left out), grown half a pixel and softened. White RGB, the map in alpha,
450 x 628 (the CSS stretches it to the card); the CSS screens a sparkle sheet through it.

    python3 .claude/skills/card-textures/scripts/fam/bw-full-art/make_gold_outline.py            # every bw4-bw10 face
    python3 .claude/skills/card-textures/scripts/fam/bw-full-art/make_gold_outline.py --cards bw6-123 --preview /tmp/g.png

Faces: the bw4-bw10 ids of js/fam/bw-full-art.js's LIVE set and the line-etched DRAWN promos. Writes
assets/foil/fam/bw-full-art/gold-v1/<id>.webp and nothing else; existing outputs are left alone unless --force (a
changed map takes a new folder name once shipped: /assets/* is cached for a year).
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parent))
from make_ink_light import ROOT, face_ids, scan_path  # noqa: E402

OUT = ROOT / "assets" / "foil" / "fam" / "bw-full-art" / "gold-v1"
SIZE = (450, 628)


def gold(scan: Path) -> np.ndarray:
    rgba = np.asarray(Image.open(scan).convert("RGBA"), np.float32) / 255.0
    rgb = rgba[..., :3]
    mx, mn = rgb.max(-1), rgb.min(-1)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    # Hue in degrees, only needed where red or green leads (yellow-gold).
    d = np.maximum(mx - mn, 1e-6)
    hue = np.where(mx == r, 60 * ((g - b) / d % 6), np.where(mx == g, 60 * ((b - r) / d + 2), 60 * ((r - g) / d + 4)))
    yellow = (hue >= 38) & (hue <= 62) & (sat > 0.45) & (mx > 0.5)
    yellow = ndimage.binary_opening(yellow, iterations=1)  # drop single stray pixels
    broad = ndimage.binary_opening(yellow, structure=np.ones((5, 5)))  # fields wider than the outline
    broad = ndimage.binary_dilation(broad, iterations=2)
    line = yellow & ~broad
    # Keep only line pieces long enough to be an outline (not a flame's yellow fleck).
    lab, n = ndimage.label(line, structure=np.ones((3, 3)))
    if n:
        sizes = ndimage.sum(line, lab, range(1, n + 1))
        keep = np.zeros(n + 1, bool)
        keep[1:] = sizes >= 40
        line = keep[lab]
    a = ndimage.gaussian_filter(line.astype(np.float32), 0.6)
    a = np.clip(a * 1.6, 0, 1) * rgba[..., 3]
    return a


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--cards", help="comma-separated ids (default: every engraved face)")
    ap.add_argument("--force", action="store_true", help="rewrite existing outputs (drafts only)")
    ap.add_argument("--preview", help="write the map of the first card here as a PNG and stop")
    args = ap.parse_args()
    ids = args.cards.split(",") if args.cards else [i for i in face_ids() if not i.startswith(("bw1-", "bw2-", "bw3-", "bw4-bwp043"))]
    if args.preview:
        a = gold(scan_path(ids[0]))
        Image.fromarray(np.round(a * 255).astype(np.uint8)).save(args.preview)
        return 0
    OUT.mkdir(parents=True, exist_ok=True)
    for fid in ids:
        dst = OUT / f"{fid}.webp"
        if dst.exists() and not args.force:
            print(f"{fid}: exists, skipped")
            continue
        a = gold(scan_path(fid))
        rgba = np.zeros(a.shape + (4,), np.uint8)
        rgba[..., :3] = 255
        rgba[..., 3] = np.round(a * 255).astype(np.uint8)
        im = Image.fromarray(rgba, "RGBA").resize(SIZE, Image.LANCZOS)
        im.save(dst, "WEBP", quality=60, alpha_quality=70, method=6)
        print(f"{fid}: {dst.relative_to(ROOT)} {dst.stat().st_size // 1024} KB cover {(a > 0.3).mean() * 100:.1f}%")
    return 0


if __name__ == "__main__":
    sys.exit(main())
