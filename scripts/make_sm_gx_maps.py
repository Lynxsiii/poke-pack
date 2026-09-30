#!/usr/bin/env python3
"""Bake the Sun & Moon GX / TAG TEAM GX foil maps (`<n>-gx-v1.webp`).

TCG Live's map (367x512) marks the attack bar, the GX attack's dark navy
box, as foil. On the real cards (LegitApp, YouTube "Pokemon Holo" stills and
the bleedingcool tilt shots, texture-refs/gx-v2) that bar stays dark and
un-iridescent, and on an iPhone the dodge over it drew blocky colour. So:
  1. the map is upscaled smoothly to the scan's size (600x838) so the mask is
     never a 3x nearest-stepped image;
  2. it is multiplied by a protect factor of the scan's own luminance: smooth
     from 0 at luma 0.06 to 1 at 0.20 (floor 0.04), so very dark ink (the
     attack bar, the black outline) takes no foil, while mid and light art,
     and dark-but-semi-transparent ink such as a purple body, keep it.
Output sits beside the source map; js/sm-foil.js smGxMap() points a
`foil-ex sm-gx` card at it (the old map stays, -v names never overwrite).

  python3 scripts/make_sm_gx_maps.py            # every regular GX / TAG TEAM GX
  python3 scripts/make_sm_gx_maps.py sm115-20   # one card
"""
import json, subprocess, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
LO, HI, FLOOR = 0.06, 0.20, 0.04


def smooth(x):
    t = np.clip((x - LO) / (HI - LO), 0, 1)
    return t * t * (3 - 2 * t)


SAFE = "assets/foil/maps/sm-gx-safe.webp"


def dest(card):
    """Beside the card's own map, or (a GX with no TCG Live map: sm35-10a, sm4-63a,
    sm5-10a) by the scan's path, baked from the text-safe median map."""
    if card["foilMap"]:
        return ROOT / card["foilMap"].replace(".webp", "-gx-v1.webp")
    folder, name = Path(card["image"]).parent.name, Path(card["image"]).stem
    return ROOT / "assets/foil/maps" / folder / f"{name}-gx-v1.webp"


def bake(card):
    scan = Image.open(ROOT / card["image"]).convert("RGBA")
    m = Image.open(ROOT / (card["foilMap"] or SAFE)).convert("RGBA").split()[3]
    m = m.resize(scan.size, Image.BICUBIC)
    a = np.asarray(m, dtype=np.float32) / 255
    rgb = np.asarray(scan.convert("RGB").filter(ImageFilter.GaussianBlur(1.2)), dtype=np.float32) / 255
    luma = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]
    out = a * (FLOOR + (1 - FLOOR) * smooth(luma))
    img = Image.fromarray(np.dstack([np.full(out.shape + (1,), 255, np.uint8).repeat(3, 2)[..., :3],
                                     (np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8)[..., None]]).astype(np.uint8), "RGBA")
    dst = dest(card)
    img.save(dst, "WEBP", quality=92, alpha_quality=100, method=4)
    return dst


def main():
    cards = json.loads(subprocess.check_output(["node", str(ROOT / "scripts/list_sm_gx.mjs")]))
    only = set(sys.argv[1:])
    # Two prints (a stamped "a" reprint and the plain card) can share one map file:
    # one worker per file, the plain card winning, so the result is deterministic.
    by_dst = {}
    for c in cards:
        if only and c["id"] not in only:
            continue
        d = dest(c)
        if d not in by_dst or Path(by_dst[d]["image"]).stem.endswith("a") and not Path(c["image"]).stem.endswith("a"):
            by_dst[d] = c
    todo = list(by_dst.values())
    from multiprocessing import Pool
    with Pool() as pool:
        pool.map(bake, todo, chunksize=4)
    print(f"baked {len(todo)} maps")


if __name__ == "__main__":
    main()
