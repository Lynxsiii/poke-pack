"""Find TCG Live foil or etch maps filed under the wrong card.

TCG Live's export is not always right: Surging Sparks' Amulet of Hope (162)
and Brilliant Blender (164) have each other's foil maps, while their etch maps
are correct. A swapped map looks fine on its own and only shows up as foil in
the wrong places, so check every set before shipping it.

A map and a scan are different pictures (a grey mask against a painting), so
plain correlation or edge matching picks whichever scan is busiest. Mutual
information does not care what the map's greys mean, only that they follow
the scan's regions. Scores are double-centred so a busy scan or a flat map
doesn't win every row, then each map's best-scoring scan should be its own.

    python3 .claude/skills/card-textures/scripts/check_foil_maps.py --set sv8

Run it after fetch_foil_maps.py has filled lab/cache/<set>/. It prints each
map whose best match is another card. Near ties are expected between prints
of the same art (a gold Hyper Rare and the Ultra Rare it recolours), so look
at those by eye; a real swap wins by a wide margin, and the other card's map
points straight back. Fix a swap with FOIL_SWAPS in fetch_foil_maps.py.
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
CACHE = HERE.parent / "lab" / "cache"
SIZE = (73, 102)


def scan_bins(path: Path) -> np.ndarray:
    im = Image.open(path).convert("RGBA")
    flat = Image.new("RGBA", im.size, (0, 0, 0, 255))
    flat.alpha_composite(im)
    q = (np.asarray(flat.convert("RGB").resize(SIZE), np.float32) // 64).astype(int)
    return (q[..., 0] * 16 + q[..., 1] * 4 + q[..., 2]).ravel()


def map_bins(path: Path) -> np.ndarray:
    im = Image.open(path).convert("RGBA")
    flat = Image.new("RGBA", im.size, (0, 0, 0, 255))
    flat.alpha_composite(im)
    return np.minimum(np.asarray(flat.convert("L").resize(SIZE), np.float32) // 32, 7).astype(int).ravel()


def mutual_information(a: np.ndarray, b: np.ndarray) -> float:
    h = np.zeros((8, 64))
    np.add.at(h, (a, b), 1)
    p = h / h.sum()
    outer = p.sum(1, keepdims=True) @ p.sum(0, keepdims=True)
    nz = p > 0
    return float((p[nz] * np.log(p[nz] / outer[nz])).sum())


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--set", required=True, help="site set id, e.g. sv8")
    args = ap.parse_args()
    cache = CACHE / args.set
    scans = ROOT / "assets" / "cards" / args.set
    for kind in ("foil", "etch"):
        nums = sorted((p.name.split(".")[0] for p in cache.glob(f"*.{kind}.png")), key=lambda n: (len(n), n))
        nums = [n for n in nums if (scans / f"{n}.webp").exists()]
        if len(nums) < 2:
            continue
        s = [scan_bins(scans / f"{n}.webp") for n in nums]
        m = [map_bins(cache / f"{n}.{kind}.png") for n in nums]
        x = np.array([[mutual_information(mi, sj) for sj in s] for mi in m])
        x = x - x.mean(0, keepdims=True) - x.mean(1, keepdims=True) + x.mean()
        flagged = 0
        for i, n in enumerate(nums):
            j = int(x[i].argmax())
            if j != i:
                flagged += 1
                back = " (and its map points back: likely a swap)" if int(x[j].argmax()) == i else ""
                print(f"{kind} {n}: best match is card {nums[j]} ({x[i, j]:.3f} vs its own {x[i, i]:.3f}){back}")
        print(f"{kind}: {len(nums)} maps checked, {flagged} to look at")


if __name__ == "__main__":
    main()
