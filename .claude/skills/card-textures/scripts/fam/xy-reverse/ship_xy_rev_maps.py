"""Ship Pokemon TCG Live's XY reverse-holo maps as site masks for the xy-reverse holo family.

Reads the cache fetch_xy_rev_maps.py fills and writes alpha masks (white, alpha = the map's luminance with TCG Live's
"not foil" floor of 22/255 stretched to 0, as scripts/fetch_foil_maps.py's alpha_mask() does) into
assets/foil/fam/xy-reverse/rev/<set>-<n>.webp for every card of xy1-xy11 and dc1 that the reverse slot can deal
(Common, Uncommon, Rare, Rare Holo; no Energy) and that TCG Live has a ``ph`` map for.

INK KNOCK-OUT (the lesson of xy-generations review #1 and xy-evolutions): the printed text is opaque black ink over the
foil on the real card, but TCG Live's map covers the text lines and a colour-dodge lifts the ink to the rainbow's
colour. The scan (assets/cards/<set>/<n>.webp, 600 x 838) is read for ink = pixels darker than 0.70 x the local body
colour (25 px median of the luma) and under luma 150; the mask is dilated 3 x 3, blurred 0.7 px and the map's alpha is
multiplied by (1 - ink) at the scan's resolution, then saved at 440 x 614 (alpha quality 70) so thin strokes survive
and a thousand maps stay about 30 KB each.

    python3 ship_xy_rev_maps.py [--cache DIR] [--dry] [--overwrite]

Never overwrites a file whose bytes differ unless --overwrite (only while the family has not shipped).
"""
from __future__ import annotations

import argparse
import io
import json
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[5]
OUT = ROOT / "assets" / "foil" / "fam" / "xy-reverse" / "rev"
DEFAULT_CACHE = Path("/tmp/claude-0/-home-user-poke-pack/6032daf4-813b-52e1-a08d-2db4b199665a/scratchpad/xy-reverse/tcgl")
FLOOR = 22  # TCG Live's "not foil" luminance
SCAN_W, SCAN_H = 600, 838
OUT_SIZE = (440, 614)
SETS = [f"xy{n}" for n in range(1, 12)] + ["dc1"]
POOL = {"Common", "Uncommon", "Rare", "Rare Holo"}


def ink_mask(scan_path: Path) -> np.ndarray:
    rgb = np.asarray(Image.open(scan_path).convert("RGB").resize((SCAN_W, SCAN_H), Image.LANCZOS)).astype(np.float32)
    luma = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]
    bg = cv2.medianBlur(luma.round().astype(np.uint8), 25).astype(np.float32)
    ink = ((luma < 0.70 * bg) & (luma < 150)).astype(np.uint8)
    ink = cv2.dilate(ink, np.ones((3, 3), np.uint8))
    ink = cv2.GaussianBlur(ink.astype(np.float32), (0, 0), 0.7)
    return ink.clip(0, 1)


def build(job: tuple[str, str, str]) -> tuple[str, bytes]:
    src, scan, dest = job
    a = np.asarray(Image.open(src).convert("RGBA")).astype(np.float32)
    lum = (0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]) * a[..., 3] / 255
    lum = ((lum - FLOOR) * (255 / (255 - FLOOR))).clip(0, 255)
    big = cv2.resize(lum, (SCAN_W, SCAN_H), interpolation=cv2.INTER_LINEAR)
    big = big * (1 - ink_mask(Path(scan)))
    lum = cv2.resize(big, OUT_SIZE, interpolation=cv2.INTER_AREA).clip(0, 255).round().astype(np.uint8)
    white = np.full_like(lum, 255)
    img = Image.fromarray(np.dstack([white, white, white, lum]), "RGBA")
    buf = io.BytesIO()
    img.save(buf, "WEBP", quality=85, alpha_quality=70, method=6)
    return dest, buf.getvalue()


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--overwrite", action="store_true")
    args = ap.parse_args()
    jobs = []
    for sid in SETS:
        for c in json.loads((ROOT / "data" / f"{sid}.json").read_text()):
            n = str(c.get("number", ""))
            src = args.cache / f"{sid}-{n}.ph.foil.png"
            scan = ROOT / "assets" / "cards" / sid / f"{n}.webp"
            if n.isdigit() and c.get("rarity") in POOL and c.get("supertype") != "Energy" and src.exists() and scan.exists():
                jobs.append((str(src), str(scan), str(OUT / f"{sid}-{n}.webp")))
    total, clash = 0, []
    with ProcessPoolExecutor(max_workers=2) as pool:
        for dest, data in pool.map(build, jobs, chunksize=8):
            total += len(data)
            d = Path(dest)
            if d.exists() and d.read_bytes() != data and not args.overwrite:
                clash.append(d)
                continue
            if not args.dry:
                d.parent.mkdir(parents=True, exist_ok=True)
                d.write_bytes(data)
    print(f"{len(jobs)} masks, {total / 1e6:.2f} MB" + (" (dry run)" if args.dry else f" in {OUT}"))
    if clash:
        sys.exit("refused to overwrite (bytes differ): " + ", ".join(str(c) for c in clash[:5]))


if __name__ == "__main__":
    main()
