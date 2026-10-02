#!/usr/bin/env python3
"""Draw the etch of Generations' five Radiant Collection full arts (g1 RC28-RC32), which TCG Live ships a foil map
for (key xy9-5r) but no etch.

Generations kept the standard textured full-art holo for its Radiant Collection full arts (codedyellow's Radiant
Collection notes: "the sparkly holographic pattern used in the Legendary Treasures set was replaced with the standard
holographic pattern for full art cards"; Bleeding Cool's photo of Sylveon-EX RC32 under a lamp shows the fine grain
and the cyan-green sheen of an XY full art, /mnt/project-files/holo-remaster/xy-generations/refs/). So they take
xy-full-art's etched recipe, and each card gets its own etch drawn from its scan by make_card_etch.etch_from (a
fingerprint that follows the drawing, seeded by the card id; never a tile or a grating), written as white with the
etch as alpha at 400 px wide, like make_card_etch.py's maps, to assets/foil/fam/xy-full-art/<id>-etch-drawn-v<N>.webp
(the next name that never existed on master, so a redraw never lands on a cached file).

It also prints each card's mean luminance over its foil map, the measure behind the module's PALE table (>= 175).

    python3 .claude/skills/card-textures/scripts/fam/xy-full-art/draw_rc_etch.py [--write]
"""
import argparse
import io
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
SCRIPTS = HERE.parents[1]
sys.path.insert(0, str(SCRIPTS))
from make_card_etch import etch_from  # noqa: E402
from check_asset_overwrites import ever_existed  # noqa: E402

ROOT = HERE.parents[5]
OUT = ROOT / "assets" / "foil" / "fam" / "xy-full-art"
CARDS = ["RC28", "RC29", "RC30", "RC31", "RC32"]


def name_for(card_id: str) -> Path:
    n = 1
    while True:
        rel = f"assets/foil/fam/xy-full-art/{card_id}-etch-drawn-v{n}.webp"
        if not ever_existed(rel):
            return ROOT / rel
        n += 1


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--write", action="store_true", help="write the etches (otherwise only report)")
    a = ap.parse_args()
    for num in CARDS:
        card_id = f"g1-{num}"
        scan = Image.open(ROOT / "assets" / "cards" / "g1" / f"{num}.webp")
        etch, _ = etch_from(scan, card_id)
        fmap = Image.open(ROOT / "assets" / "foil" / "fam" / "xy-generations" / "rc" / f"{num[2:]}.webp")
        fa = np.asarray(fmap.split()[-1] if fmap.mode in ("RGBA", "LA") else fmap.convert("L"), np.float32) / 255
        rgb = np.asarray(scan.convert("RGB").resize(fmap.size, Image.LANCZOS), np.float32)
        luma = 0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]
        pale = float((luma * fa).sum() / max(fa.sum(), 1))
        line = f"{card_id}: {float((etch > 0.5).mean()):.0%} etched, mean luminance on the foil {pale:.0f}"
        if a.write:
            alpha = (etch * 255).astype(np.uint8)
            rgba = np.dstack([np.full_like(alpha, 255)] * 3 + [alpha])
            buf = io.BytesIO()
            Image.fromarray(rgba, "RGBA").save(buf, "WEBP", quality=80, alpha_quality=80, method=6)
            dest = name_for(card_id)
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(buf.getvalue())
            line += f" -> {dest.relative_to(ROOT)} ({len(buf.getvalue()):,} bytes)"
        print(line)
    return 0


if __name__ == "__main__":
    sys.exit(main())
