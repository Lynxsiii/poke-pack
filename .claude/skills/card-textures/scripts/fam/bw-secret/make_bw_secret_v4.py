#!/usr/bin/env python3
"""Fourth pass of the bw-secret maps (2026-10-22, after the photo audits bw-secret-a and bw-secret-b). Writes NEW
files only (names git has never seen) into assets/foil/fam/bw-secret/; nothing shipped is touched.

  fm/<id>-v4.webp       the 13 yellow-border faces: fm/<id>-v3 (TCG Live's foil map with the eyes and cheeks knocked
                        out) with everything outside the art window removed except the big text-box type symbol. Live's
                        map also holds the HP symbol, the attack-cost and weakness/retreat energy circles and the
                        "BASIC" lettering; the band turned Pikachu's lightning symbols green and cyan (audit a).
  stip/<id>.webp        the 13 yellow-border faces: the Pokemon's own fine dense stipple (audit b: dots about 1 px at
                        733 px, packed; audit a: a regular metallic dot stipple that keeps the ink colour, no white
                        specks on black). Random dots (sigma 0.55 px, about one per 7 px^2) inside the window part of
                        fm-v4, weighted by the scan's luminance (dark ink keeps an eighth) so a black body stays glossy
                        dark metal, not dust or stars. It replaces the shared glint-v3 speck map (sparse, coarse, 3-4x too big).
  grain/<id>-a-v3.webp, -b-v3.webp
                        Pikachu 115, Meowth 102: the pebbled scenery as a fine dense relief (bumps a third of v2's
                        diameter, three times as many), lit from the upper left (a) and lower right (b). The CSS shows
                        them only when lit and only near the pointer (audit a: v2 read as snowfall at rest).
  disc/<id>.webp        the gold Items (bw7-153, bw8-138, bw9-121, bw9-122, bw10-105): the big Poke Ball of the text box
                        from Live's foil map (0.45 there, normalised to 0.9); the CSS paints it a cool silver-grey disc,
                        visible at rest (audit b: the JP Random Receiver scan, the Rare Candy photo).

    python3 .claude/skills/card-textures/scripts/fam/bw-secret/make_bw_secret_v4.py [--only fm,stip,grain,disc] [--force]
"""
from __future__ import annotations

import argparse
import importlib.util
import sys
import zlib
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("bws_v2", HERE / "make_bw_secret_v2.py")
v2 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v2)
v1 = v2.v1
ROOT, OUT = v2.ROOT, v2.OUT
W, H = 733, 1024
YELLOW = ["bw1-115", "bw3-102", "bw4-100", "bw4-101", "bw4-102", "bw4-103", "bw5-109", "bw5-110", "bw5-111",
          "bw6-125", "bw6-126", "bw6-127", "bw6-128"]
GOLD_ITEMS = ["bw7-153", "bw8-138", "bw9-121", "bw9-122", "bw10-105"]
GRAIN = ["bw1-115", "bw3-102"]
TRAINER = {"bw5-111"}


def alpha_of(path: Path, size=(W, H)) -> np.ndarray:
    im = Image.open(path).convert("RGBA")
    if im.size != size:
        im = im.resize(size, Image.BICUBIC)
    return np.asarray(im, dtype=np.float32)[..., 3] / 255


def window(cid: str, scale: float = W / 367) -> tuple[int, int, int, int]:
    box = v1.ART["trainer" if cid in TRAINER else "pokemon"]
    return tuple(int(round(v * scale)) for v in box)


def scan_lum(cid: str) -> np.ndarray:
    s, n = cid.split("-")
    im = Image.open(ROOT / "assets" / "cards" / s / f"{n}.webp").convert("RGB").resize((W, H), Image.BILINEAR)
    a = np.asarray(im, dtype=np.float32) / 255
    return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]


def fm4(cid: str) -> np.ndarray:
    fm = alpha_of(OUT / "fm" / f"{cid}-v3.webp")
    x0, y0, x1, y1 = window(cid)
    inside = np.zeros_like(fm, dtype=bool)
    inside[y0:y1, x0:x1] = True
    out = np.where(inside, fm, 0)
    # outside the window: keep only the big text-box symbol (components over 2500 px and 100 px tall below the window)
    below = np.zeros_like(fm, dtype=bool)
    below[y1 + 4:H - 20, 20:W - 20] = True
    lab, n = ndimage.label((fm > 0.12) & below)
    if n:
        sizes = ndimage.sum(np.ones_like(fm), lab, index=np.arange(1, n + 1))
        tall = np.array([(sl[0].stop - sl[0].start) >= 100 for sl in ndimage.find_objects(lab)])
        keep = np.isin(lab, 1 + np.flatnonzero((sizes >= 2500) & tall))  # a row of energy circles is wide, not tall
        keep = ndimage.binary_dilation(keep, iterations=2)
        out = np.where(keep & below, fm, out)
    return out


def stipple(cid: str, fm: np.ndarray) -> np.ndarray:
    rng = np.random.default_rng(zlib.crc32((cid + "-stip").encode()))
    x0, y0, x1, y1 = window(cid)
    pok = np.zeros_like(fm)
    pok[y0:y1, x0:x1] = np.clip((fm[y0:y1, x0:x1] - 0.45) / 0.35, 0, 1)  # the Pokemon, not Live's 0.3-0.4 background
    seeds = (rng.random((H, W)) < 1 / 7.0).astype(np.float32) * rng.uniform(0.55, 1.0, (H, W)).astype(np.float32)
    dots = ndimage.gaussian_filter(seeds, 0.55) * (2 * np.pi * 0.55 ** 2)
    dots = np.clip(dots / 0.75, 0, 1)
    lum = scan_lum(cid)
    gate = 0.12 + 0.88 * np.clip((lum - 0.15) / 0.45, 0, 1)  # dark ink keeps an eighth: glossy, not dusty
    return dots * pok * gate


def grain4(cid: str, fm: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    x0, y0, x1, y1 = window(cid)
    region = np.zeros((H, W), dtype=np.float32)
    region[y0 + 3:y1 - 2, x0 + 3:x1 - 3] = 1
    region *= ~ndimage.binary_dilation(fm > 0.12, iterations=3)
    region = ndimage.gaussian_filter(region, 1.2)
    rng = np.random.default_rng(zlib.crc32((cid + "-grain-v3").encode()))
    cell, prob, rad = 5.0, 0.62, 1.35
    dome = np.zeros((H, W), dtype=np.float32)
    ny, nx = int(H / cell) + 2, int(W / cell) + 2
    yy, xx = np.mgrid[-4:5, -4:5].astype(np.float32)
    for j in range(ny):
        for i in range(nx):
            if rng.random() > prob:
                continue
            cx, cy = (i + rng.random()) * cell, (j + rng.random()) * cell
            ix, iy = int(round(cx)), int(round(cy))
            s = rad * rng.uniform(0.8, 1.25)
            patch = np.exp(-(((xx - (cx - ix)) ** 2 + (yy - (cy - iy)) ** 2) / (2 * s ** 2)))
            ya, xa = iy - 4, ix - 4
            if ya < 0 or xa < 0 or ya + 9 > H or xa + 9 > W:
                continue
            dome[ya:ya + 9, xa:xa + 9] = np.maximum(dome[ya:ya + 9, xa:xa + 9], patch)
    gy, gx = np.gradient(ndimage.gaussian_filter(dome, 0.7))
    out = []
    for dx, dy in ((-1, -1), (1, 1)):
        shade = -(gx * dx + gy * dy) / np.sqrt(2)
        shade /= max(float(np.percentile(shade, 99.5)), 1e-6)
        out.append(np.clip((shade - 0.15) / 0.7, 0, 1) * region)
    return out


def disc(cid: str) -> np.ndarray:
    """The big Poke Ball of a gold Item's text box: Live's foil map (0.45 there; read only) below the art window, inside
    the frame, normalised to 0.9. The centre band and the button are 0 in Live's map, so they stay the light print."""
    s, n = cid.split("-")
    live = alpha_of(ROOT / "assets" / "foil" / "maps" / s / f"{n}.webp", (367, 512))
    x0, y0, x1, y1 = v1.ART["trainer"]
    out = np.zeros_like(live)
    out[y1 + 6:445, x0 + 4:x1 - 3] = live[y1 + 6:445, x0 + 4:x1 - 3]
    return ndimage.gaussian_filter(np.clip(out / 0.45, 0, 1) * 0.9, 0.4)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", default="fm,stip,grain,disc")
    ap.add_argument("--quality", type=int, default=80)
    ap.add_argument("--alpha-quality", type=int, default=80)
    ap.add_argument("--force", action="store_true", help="rewrite files of this pass that exist (only before it ships)")
    a = ap.parse_args()
    only = {s.strip() for s in a.only.split(",") if s.strip()}

    def save(arr: np.ndarray, p: Path) -> None:
        if a.force or not p.exists():
            v2.save_alpha(arr, p, a.quality, a.alpha_quality)

    for cid in YELLOW:
        fm = fm4(cid)
        if "fm" in only:
            save(fm, OUT / "fm" / f"{cid}-v4.webp")
        if "stip" in only:
            save(stipple(cid, fm), OUT / "stip" / f"{cid}.webp")
        if "grain" in only and cid in GRAIN:
            ga, gb = grain4(cid, fm)
            save(ga, OUT / "grain" / f"{cid}-a-v3.webp")
            save(gb, OUT / "grain" / f"{cid}-b-v3.webp")
    if "disc" in only:
        for cid in GOLD_ITEMS:
            save(disc(cid), OUT / "disc" / f"{cid}.webp")
    return 0


if __name__ == "__main__":
    sys.exit(main())
