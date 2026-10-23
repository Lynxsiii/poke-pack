#!/usr/bin/env python3
"""Draw the silver frame map of the flat Black & White full arts (holo family bw-full-art, `bwfa-sand`, bw1-bw3, and
Landorus BW43, `bwfa-pebble`).

On the real cards the silver frame and the name bar throw the strongest rainbow: a vivid spectrum along the left, right
and top borders at most tilts, its hue changing along the border (Victini 98 in-hand and tilt clips, Reshiram 113 tilted
clip, N 101 CGC slab; /home/user/holo-refs/bw-fa-bw1-bw2-bw3-bw4/; Landorus BW43 photos in
/mnt/project-files/holo-remaster/bw-full-art/landorus/). The stripe sheet only reaches the frame near the light, so the
CSS paints a broad rainbow through this map at full strength (`.cure::after` of `bwfa-sand` and `bwfa-pebble`).

frame = the outer border band (about 4% of the card on each side, measured on the nine scans: 28-32 px at 733 px wide)
        where the scan is near-neutral (HSV S < 0.25: the silver or, on Reshiram 113, white border; not art that bleeds
        to the edge), plus the name bar's neutral pixels (top 9% of the card, S < 0.18, value 0.3-0.97) joined to that
        band, a 0.7 px blur, x the scan's alpha.

White RGB, the map in alpha, lossless WebP at 733 x 1024.

    python3 .claude/skills/card-textures/scripts/fam/bw-full-art/make_frame.py            # the flat faces and BW43
    python3 .claude/skills/card-textures/scripts/fam/bw-full-art/make_frame.py --cards bw3-98

Writes assets/foil/fam/bw-full-art/frame-v1/<id>.webp only; existing outputs are left alone unless --force (drafts
only: once shipped, a changed map takes a new folder name, frame-v2).
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parent))
from make_lit import DIR, MODULE, ROOT, module_ids, scan  # noqa: E402

OUT = DIR / "frame-v1"
SIDE, TOP, BOTTOM = 30, 33, 30   # border band at 733 x 1024
BAR = 95                         # the name bar sits above this row


def frame(face_id: str) -> Image.Image:
    s = scan(face_id)
    rgb, a = s[..., :3], s[..., 3]
    mx, mn = rgb.max(-1), rgb.min(-1)
    sat = (mx - mn) / (mx + 1e-6)
    h, w = a.shape
    yy, xx = np.mgrid[0:h, 0:w]
    band = (xx < SIDE) | (xx >= w - SIDE) | (yy < TOP) | (yy >= h - BOTTOM)
    band &= sat < 0.25
    bar = (yy < BAR) & (sat < 0.18) & (mx > 0.3) & (mx < 0.97)
    lab, _ = ndimage.label(bar | band, structure=np.ones((3, 3)))
    keep = np.unique(lab[band])
    joined = np.isin(lab, keep[keep > 0])
    f = ndimage.gaussian_filter(joined.astype(np.float32), 0.7) * a
    out = np.zeros((h, w, 4), np.uint8)
    out[..., :3] = 255
    out[..., 3] = np.round(np.clip(f, 0, 1) * 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--cards", help="comma-separated ids (default: the module's flat and pebble faces)")
    ap.add_argument("--force", action="store_true", help="rewrite existing outputs (drafts only)")
    args = ap.parse_args()
    _, flat = module_ids()
    drawn = re.search(r"const DRAWN = \{(.*?)\};", MODULE.read_text(encoding="utf-8"), re.S).group(1)
    flat += [fid for fid, cls in re.findall(r'"(bw\d+-\w+)":\s*\["([^"]+)"', drawn) if "bwfa-pebble" in cls.split()]
    ids = args.cards.split(",") if args.cards else flat
    OUT.mkdir(parents=True, exist_ok=True)
    for fid in ids:
        dst = OUT / f"{fid}.webp"
        if dst.exists() and not args.force:
            print(f"{fid}: exists, skipped")
            continue
        im = frame(fid)
        im.save(dst, "WEBP", lossless=True, method=6)
        print(f"{fid}: {dst.relative_to(ROOT)} {dst.stat().st_size // 1024} KB cover {np.asarray(im)[..., 3].mean() / 255:.3f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
