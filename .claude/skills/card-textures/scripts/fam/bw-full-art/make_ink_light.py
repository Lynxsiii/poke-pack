#!/usr/bin/env python3
"""Draw the "light ink" map of every Black & White full art (holo family bw-full-art).

On the real cards the foil shows through light ink and is blocked by dark ink: Zekrom 114's black body stays black
while the rainbow stripes run over its white outlines and the silver frame (scan pair and tilt clip,
/home/user/holo-refs/bw-fa-bw1-bw2-bw3-bw4/outliers/), Thundurus 97's black orbs stay black, Dialga-EX's navy chest
and Ghetsis's black coat stay dark under the band (Lugia-EX and Raikou-EX macros). A hard-light rainbow colours black
ink as readily as white, so the family's CSS cuts every coloured layer by this map.

alpha = clamp((Y - LO) / (HI - LO)) ** GAMMA of the card's own scan (Y = Rec. 601 luma of the sRGB pixel), so black or
navy ink is 0, mid ink about a third, white and the silver frame 1; a 0.5 px blur so a one-pixel outline does not
alias. The flat full arts (bw1-bw3) also fall off with saturated mid-tone ink: x clamp(1 - 2.2 * S * (1 - Y)) (S = HSV
saturation), so Victini's red and Virizion's green backgrounds take no stripes (in-hand clips: glossy metallic red and
green, the rainbow on the silver frame) while white, the frame, a pale sky and bright yellow keep them (review
2026-10-22). White RGB, the map in alpha, at 450 x 628 (three quarters of the scan: a soft map, about 45 KB; the CSS
stretches it to the card).

    python3 .claude/skills/card-textures/scripts/fam/bw-full-art/make_ink_light.py            # every face
    python3 .claude/skills/card-textures/scripts/fam/bw-full-art/make_ink_light.py --cards bw1-114,bw10-99

Faces: every id in js/fam/bw-full-art.js's LIVE set and DRAWN table; scans from data/<set>.json's `image`.
Writes assets/foil/fam/bw-full-art/inklight-v1/<id>.webp and nothing else. Existing outputs are left alone unless
--force: once shipped, a changed map takes a new folder name (inklight-v2), since /assets/* is cached for a year.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[5]
OUT = ROOT / "assets" / "foil" / "fam" / "bw-full-art" / "inklight-v1"
MODULE = ROOT / "js" / "fam" / "bw-full-art.js"
LO, HI, GAMMA = 0.15, 0.70, 1.3
FALL = 2.2
SIZE = (450, 628)


def face_ids() -> list[str]:
    src = MODULE.read_text(encoding="utf-8")
    live = re.search(r"const LIVE = new Set\(\[(.*?)\]\)", src, re.S).group(1)
    drawn = re.search(r"const DRAWN = \{(.*?)\};", src, re.S).group(1)
    ids = re.findall(r'"(bw\d+-\w+)"', live) + re.findall(r'"(bw\d+-\w+)":', drawn)
    return list(dict.fromkeys(ids))


def scan_path(face_id: str) -> Path:
    s = face_id.split("-")[0]
    data = json.loads((ROOT / "data" / f"{s}.json").read_text(encoding="utf-8"))
    for c in data if isinstance(data, list) else data["cards"]:
        if c.get("id") == face_id:
            return ROOT / c["image"]
    raise SystemExit(f"{face_id}: not in data/{s}.json")


def ink_light(scan: Path, flat: bool = False) -> Image.Image:
    rgba = np.asarray(Image.open(scan).convert("RGBA"), np.float32) / 255.0
    y = 0.299 * rgba[..., 0] + 0.587 * rgba[..., 1] + 0.114 * rgba[..., 2]
    a = np.clip((y - LO) / (HI - LO), 0.0, 1.0) ** GAMMA
    if flat:
        mx, mn = rgba[..., :3].max(-1), rgba[..., :3].min(-1)
        sat = (mx - mn) / np.maximum(mx, 1e-3)
        a = a * np.clip(1.0 - FALL * sat * (1.0 - y), 0.0, 1.0)
    a = ndimage.gaussian_filter(a, 0.5) * rgba[..., 3]
    out = np.zeros(rgba.shape, np.uint8)
    out[..., :3] = 255
    out[..., 3] = np.round(a * 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA").resize(SIZE, Image.LANCZOS)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--cards", help="comma-separated ids (default: every face of the module)")
    ap.add_argument("--force", action="store_true", help="rewrite existing outputs (drafts only)")
    args = ap.parse_args()
    ids = args.cards.split(",") if args.cards else face_ids()
    OUT.mkdir(parents=True, exist_ok=True)
    for fid in ids:
        dst = OUT / f"{fid}.webp"
        if dst.exists() and not args.force:
            print(f"{fid}: exists, skipped")
            continue
        im = ink_light(scan_path(fid), flat=bool(re.match(r"bw[123]-", fid)))
        im.save(dst, "WEBP", quality=60, alpha_quality=60, method=6)
        print(f"{fid}: {dst.relative_to(ROOT)} {dst.stat().st_size // 1024} KB mean {np.asarray(im)[..., 3].mean():.0f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
