#!/usr/bin/env python3
"""bw-reverse: the Dragons Exalted (bw6) reverse masks, matched to the print by IMAGE, not by number.

Draws: assets/foil/fam/bw-reverse/bw6/<number>.webp (367x512 lossless WebP, white with alpha), same recipe as make_masks.py
       (mask = ink_cut(erode(clip(R*A/255 / 24, 0, 1), disc of radius 2)) of a TCG Live reverse foil map; the ink comes from the print's own scan).
Why:   TCG Live's Dragons Exalted files for numbers 1-49 are duplicated and misnumbered: 44 of them are copies of other cards' maps (bw6-1's file
       is not Hoppip's). The earlier pass (agent log: /mnt/project-files/holo-remaster/bw-reverse/AGENT-LOG-thread-b.md) validated every map
       against its card's own scan (every hole on printed pixels: precision) and, for each wrong file, picked the donor map of another print of the same layout
       (same attack-cost rows, same ability) whose holes best fit THIS card's scan.
From:  bw6_matches.json beside this script: "own" = prints whose own TCG Live file fits its scan (precision >= 0.93; bw6-50 on and a few of 1-49) and
       "donor" = {card: donor print} for the wrong files whose best donor fits >= 0.94, or >= 0.92 with a clear margin (>= 0.10) over the runner-up.
       "skipped" = the 13 prints it is not sure of (bw6-2 3 5 6 10 18 19 21 33 34 47 48 49): left on the era look.
Run:   python3 make_masks_bw6.py --cache <dir with <set>_<NNN>.png TCG Live maps of bw6 and the donors' sets>
Prints the JS list of the bw6 numbers written, for js/fam/bw-reverse.js (MASKS.bw6).
"""
import argparse, json
from pathlib import Path
import cv2
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[5] if (HERE.parents[5] / "data").exists() else HERE.parents[6]
ap = argparse.ArgumentParser()
ap.add_argument("--cache", required=True)
args = ap.parse_args()
cache = Path(args.cache)
m = json.loads((HERE / "bw6_matches.json").read_text())
out = ROOT / "assets/foil/fam/bw-reverse/bw6"
out.mkdir(parents=True, exist_ok=True)
DISK = np.hypot(*np.mgrid[-2:3, -2:3]) <= 2.2   # same 2 px erosion as make_masks.py


def clean(m):
    """Own TCG Live file: as make_masks.py (stray alpha < 0.25 -> 0, specks < 12 px^2 filled, 2 px erosion; the print's own text holes stay: ink matte)."""
    m = np.where(m < 0.25, 0.0, m)
    lab, n = ndi.label(m < 0.9)
    sizes = ndi.sum(np.ones_like(lab), lab, range(1, n + 1))
    small = np.isin(lab, [i + 1 for i, z in enumerate(sizes) if z < 12])
    return ndi.grey_erosion(np.where(small, 1.0, m), footprint=DISK)


def clean_donor(m):
    """A DONOR map: its text holes belong to another print (ghost text), so every hole under 100 px^2 is filled; then the same 2 px erosion."""
    m = np.where(m < 0.25, 0.0, m)
    lab, n = ndi.label(m < 0.9)
    sizes = ndi.sum(np.ones_like(lab), lab, range(1, n + 1))
    m = np.where(np.isin(lab, [i + 1 for i, z in enumerate(sizes) if z < 100]), 1.0, m)
    return ndi.grey_erosion(m, footprint=DISK)


def scan_ink(cid):
    """The DARK ink of THIS print, from its own scan (as make_masks.py): text zone rows 266-476, a pixel darker than 110 (of 255) that differs from the local
    body colour (11 px median) by more than 40 in RGB distance, dilated 1 px; none on a near-black body (zone median under 75: white text stays white under
    an overlay). Cut out of the foil after the erosion, for own-file and donor prints alike (TCG Live leaves the body text under the foil and an
    overlay tints a dark letter)."""
    scan = np.asarray(Image.open(ROOT / DATA[cid]["image"]).convert("RGB").resize((367, 512), Image.LANCZOS))
    sf = scan.astype(np.float32)
    lum = 0.2126 * sf[..., 0] + 0.7152 * sf[..., 1] + 0.0722 * sf[..., 2]
    if np.median(lum[266:476]) < 75:
        return np.zeros(lum.shape, bool)
    bg = cv2.medianBlur(np.ascontiguousarray(scan), 11).astype(np.float32)
    ink = (np.sqrt(((sf - bg) ** 2).sum(-1)) > 40) & (lum < 110)
    zone = np.zeros_like(ink)
    zone[266:476] = True
    return ndi.binary_dilation(ink & zone, iterations=1)


DATA = {c["id"]: c for c in json.loads((ROOT / "data/bw6.json").read_text())}
src = {cid: cid for cid in m["own"]}
src.update(m["donor"])
nums = []
for cid, from_id in sorted(src.items(), key=lambda kv: int(kv[0].split("-")[1])):
    s, n = from_id.split("-")
    f = cache / f"{s}_{int(n):03d}.png"
    a = np.asarray(Image.open(f).convert("RGBA")).astype(np.float32)
    g0 = np.clip(a[..., 0] * a[..., 3] / 255.0 / 24.0, 0, 1)
    g = clean(g0) if cid in m["own"] else clean_donor(g0)
    g = np.where(scan_ink(cid), 0.0, g)
    rgba = np.zeros(g.shape + (4,), np.uint8)
    rgba[..., :3] = 255
    rgba[..., 3] = np.round(g * 255).astype(np.uint8)
    Image.fromarray(rgba, "RGBA").save(out / f"{cid.split('-')[1]}.webp", lossless=True, quality=60, method=1, exact=True)
    nums.append(int(cid.split("-")[1]))
print(f"// {len(nums)} bw6 masks ({len(m['own'])} own, {len(m['donor'])} donor)")
print('  bw6: "' + " ".join(map(str, sorted(nums))) + '",')
