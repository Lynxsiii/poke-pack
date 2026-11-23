#!/usr/bin/env python3
"""Bake the lit flanks of the engraved Black & White full arts (holo family bw-full-art, `bwfa-lines`) into one map each.

Superseded (round 3, 2026-10-22): make_lit.py now writes flank-v1/<id>.webp itself, with Live's dot fields redrawn as
lines before the flanks are taken, plus a small tone map per face, and imports faces(), SHIFT and LEVELS from here.
This script's own main() only says so (running it would write the flanks without the redraw).

The held and resting `.foil` of an engraved face lights the ridges' flanks only: the etch minus itself shifted 1.3 etch
pixels right and down, which leaves thin lines (about a fifth of the pixels) with the print between them. The sheet used
to build that in CSS as a three-layer mask (the card art, the etch, the shifted etch), but WebKit dropped whole lit layers
with three mask layers when several cards were lit at once (review 2026-10-22: no lines, no streak on some cells), and
one layer paints every time. So this does the subtraction offline, at Live's native 733 x 1024, and multiplies in the
scan's own alpha (the rounded corners the art mask gave):

    flank = etch * (1 - etch shifted by (1.3, 1.3) px) * scan alpha, quantised to 4 levels (0, 1/3, 2/3, 1)

White RGB, the map in alpha, lossless WebP (the four levels keep it about 80 KB).

    python3 .claude/skills/card-textures/scripts/fam/bw-full-art/make_flanks.py            # every line-etched face
    python3 .claude/skills/card-textures/scripts/fam/bw-full-art/make_flanks.py --cards bw8-135

Faces: js/fam/bw-full-art.js's LIVE ids of bw4-bw10 (etch from etch-v2/<id>.webp) and its DRAWN faces with
`bwfa-lines` (the drawn etch named there). Writes assets/foil/fam/bw-full-art/flank-v1/<id>.webp only; existing outputs
are left alone unless --force (drafts only: a shipped map that changes takes a new folder name, flank-v2).
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
DIR = ROOT / "assets" / "foil" / "fam" / "bw-full-art"
OUT = DIR / "flank-v1"
MODULE = ROOT / "js" / "fam" / "bw-full-art.js"
SHIFT = 1.3
LEVELS = 4


def faces() -> dict[str, Path]:
    src = MODULE.read_text(encoding="utf-8")
    live = re.search(r"const LIVE = new Set\(\[(.*?)\]\)", src, re.S).group(1)
    out = {fid: DIR / "etch-v2" / f"{fid}.webp" for fid in re.findall(r'"(bw\d+-\w+)"', live)
           if not re.match(r"bw[123]-", fid)}
    drawn = re.search(r"const DRAWN = \{(.*?)\};", src, re.S).group(1)
    for fid, cls, path in re.findall(r'"(bw\d+-\w+)":\s*\["([^"]+)",\s*"([^"]+)"\]', drawn):
        if "bwfa-lines" in cls.split():
            out[fid] = DIR / path
    return out


def scan_alpha(face_id: str, shape: tuple[int, int]) -> np.ndarray:
    s = face_id.split("-")[0]
    data = json.loads((ROOT / "data" / f"{s}.json").read_text(encoding="utf-8"))
    card = next(c for c in (data if isinstance(data, list) else data["cards"]) if c.get("id") == face_id)
    im = Image.open(ROOT / card["image"]).convert("RGBA").resize((shape[1], shape[0]), Image.LANCZOS)
    return np.asarray(im, np.float32)[..., 3] / 255.0


def flank(face_id: str, etch: Path) -> Image.Image:
    e = np.asarray(Image.open(etch).convert("RGBA"), np.float32)[..., 3] / 255.0
    shifted = ndimage.shift(e, (SHIFT, SHIFT), order=1, mode="nearest")
    f = e * (1.0 - shifted) * scan_alpha(face_id, e.shape)
    q = np.round(np.clip(f, 0, 1) * (LEVELS - 1)) / (LEVELS - 1)
    out = np.zeros(e.shape + (4,), np.uint8)
    out[..., :3] = 255
    out[..., 3] = np.round(q * 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def main() -> int:
    print("make_flanks.py is superseded: run make_lit.py (it writes flank-v1/ and tone-v1/)", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
