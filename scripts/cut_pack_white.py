#!/usr/bin/env python3
"""Cut the white wedges off booster pack art whose silhouette kept paper.

The Sword & Shield packs from Brilliant Stars to Silver Tempest, and Pokémon GO,
came with real alpha but a flat-white block left in the corners and along the
bottom crimp (the render was cut from a white page with a rectangle, not along
the pinched wrapper). On the site's dark background that shows as a white
notch. clean_pack_art.py only handles packs whose side margins are fully
opaque, so it reports "no opaque packs" for these.

This takes every pixel within 6% of the image edge that is either transparent
or near-white (min channel >= 236) and connected to the image border, and makes
it transparent with a feathered edge. Interior white (a white Zekrom pack, the
pale crimp inside the silhouette) is not touched because it is not connected to
the border through white.

/assets/ is immutable for a year, so a tracked file is never overwritten: the
art goes to the next free -vN name (pack-3.avif -> pack-3-v2.avif) with its
.png fallback, the old pair is deleted, and the script prints the paths for
js/catalog.js (`boosterWrappers(setId, faces, version)` takes the -vN number).

    python3 scripts/cut_pack_white.py --check            # list packs with white wedges
    python3 scripts/cut_pack_white.py swsh9 swsh10 ...    # cut every pack of those sets
    python3 scripts/cut_pack_white.py --all-flagged       # cut every set that has a flagged pack
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

sys.path.insert(0, str(Path(__file__).resolve().parent))
import clean_pack_art as cpa  # noqa: E402

ROOT = cpa.ROOT
PACKS = cpa.PACKS
THRESHOLD = 236
DEPTH = 0.06
# Share of the image that is opaque white and connected to the border above
# which a pack counts as having a wedge. Clean packs measure under 1.8%; the
# bad ones 2.1% and up.
FLAG = 0.02
# Packs whose art is white on purpose (the 151 Mew pack's pattern is white).
WHITE_ART = {"sv3pt5/mew.avif"}


def border_white(path: Path) -> tuple[np.ndarray, float]:
    x = np.asarray(Image.open(path).convert("RGBA")).astype(np.float32)
    rgb, a = x[..., :3], x[..., 3] / 255
    h, w = a.shape
    white = (rgb.min(axis=2) >= THRESHOLD) & (a >= 0.5)
    zone = np.zeros(white.shape, bool)
    dy, dx = int(h * DEPTH), int(w * DEPTH)
    zone[:dy] = zone[-dy:] = True
    zone[:, :dx] = zone[:, -dx:] = True
    lab, _ = ndi.label(((white | (a < 0.5)) & zone), structure=np.ones((3, 3)))
    edge_ids = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    kill = np.isin(lab, list(edge_ids))
    return kill, float((kill & white).sum() / (h * w))


def cut(path: Path) -> Image.Image:
    x = np.asarray(Image.open(path).convert("RGBA")).astype(np.float32)
    kill, _ = border_white(path)
    soft = ndi.gaussian_filter(kill.astype(np.float32), 0.8)
    alpha = x[..., 3] / 255 * (1 - np.clip(soft * 1.2, 0, 1))
    return Image.fromarray(np.dstack([x[..., :3], alpha * 255]).clip(0, 255).astype(np.uint8), "RGBA")


def packs_of(set_id: str) -> list[Path]:
    return sorted(p for p in (PACKS / set_id).glob("*.avif"))


def flagged_sets() -> dict[str, list[Path]]:
    out: dict[str, list[Path]] = {}
    for avif in sorted(PACKS.glob("*/*.avif")):
        if avif.parent.name in cpa.SKIP_DIRS or avif.relative_to(PACKS).as_posix() in WHITE_ART:
            continue
        if border_white(avif)[1] >= FLAG:
            out.setdefault(avif.parent.name, []).append(avif)
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("sets", nargs="*")
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--all-flagged", action="store_true")
    args = ap.parse_args()
    if args.check or args.all_flagged:
        flagged = flagged_sets()
        for s, files in flagged.items():
            for f in files:
                print(f"white wedge {border_white(f)[1]:.1%}  {f.relative_to(ROOT)}")
        if args.check:
            return 1 if flagged else 0
        args.sets = list(flagged)
    for set_id in args.sets:
        for avif in packs_of(set_id):
            img = cut(avif)
            dest = cpa.next_version(avif) if cpa.is_tracked(avif) else avif
            img.save(dest, "AVIF", quality=cpa.AVIF_QUALITY)
            img.save(dest.with_suffix(".png"), "PNG", optimize=True)
            if dest != avif:
                avif.unlink()
                avif.with_suffix(".png").unlink(missing_ok=True)
            print(f"{avif.relative_to(ROOT)} -> {dest.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
