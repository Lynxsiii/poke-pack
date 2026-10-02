"""Redraw the Evolutions (xy12) reverse foil maps with the card's printed ink knocked out: rev-v2/<n>.webp.

The reverse foil is a mirror over the whole body, so its map (rev/<n>.webp, TCG Live's `<key>_en_<nnn>_ph.foil.png`,
shipped by make_maps.py) covers the rules text and the attack names as well. A bright rainbow column over dark ink
lifts and colours it: at 30:25 and 50:78 Charmeleon 10's name went teal and its "90" green, which the real card never
does (the tilt frames in /mnt/project-files/holo-remaster/xy-evolutions/refs/ show black text over the mirror).

The fix, prototyped by the xy-generations reviewer (/mnt/project-files/holo-remaster/xy-generations/REVIEW-1.md) and
reused here: find the ink on the card's own scan and multiply it out of the map's alpha, so no layer paints the glyphs.

    ink   = (L < INK_REL * median25(L)) & (L < INK_ABS)      # dark against the local body colour
    ink   = blur(dilate(ink, 3x3), 0.7 px)                   # a hair wider than the glyphs, soft edged
    alpha = map.alpha * (1 - ink)

    python3 .claude/skills/card-textures/scripts/fam/xy-evolutions/make_rev_ink_maps.py [--only 10,24,80]

Reads assets/foil/fam/xy-evolutions/rev/<n>.webp (shipped, never written) and the scans assets/cards/xy12/<n>.webp,
writes assets/foil/fam/xy-evolutions/rev-v2/<n>.webp (367 x 512, white with alpha, webp q70: the same size as the
maps it replaces). js/fam/xy-evolutions.js points at rev-v2. Re-runnable: the same bytes every run.
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[6]
FAM = ROOT / "assets" / "foil" / "fam" / "xy-evolutions"
SRC = FAM / "rev"
OUT = FAM / "rev-v2"
SCANS = ROOT / "assets" / "cards" / "xy12"

INK_REL = 0.70        # a pixel is ink when it is this much darker than its own neighbourhood
INK_ABS = 150         # ... and dark in absolute terms (so a mid-tone picture is not "ink")
MEDIAN = 25           # neighbourhood for the local body colour, scan px
DILATE = 3            # grow the glyphs by a pixel (the anti-aliased edge)
FEATHER = 0.7         # and feather that edge, scan px


def luma(rgb: np.ndarray) -> np.ndarray:
    return 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]


def median25(lum: np.ndarray) -> np.ndarray:
    """The local body colour. OpenCV where it is installed, else a box mean of a coarse grid (close enough here)."""
    try:
        import cv2

        return cv2.medianBlur(lum.astype(np.uint8), MEDIAN).astype(np.float32)
    except Exception:
        from scipy import ndimage as ndi

        return ndi.uniform_filter(lum, MEDIAN)


def ink_mask(scan_path: Path, size: tuple[int, int]) -> np.ndarray:
    """0..1, 1 where the card prints dark ink, at the map's size."""
    scan = np.asarray(Image.open(scan_path).convert("RGB")).astype(np.float32)
    lum = luma(scan)
    ink = ((lum < INK_REL * median25(lum)) & (lum < INK_ABS)).astype(np.float32)
    img = Image.fromarray((ink * 255).astype(np.uint8), "L")
    img = img.filter(ImageFilter.MaxFilter(DILATE)).filter(ImageFilter.GaussianBlur(FEATHER))
    if img.size != size:
        img = img.resize(size, Image.LANCZOS)
    return np.asarray(img).astype(np.float32) / 255


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", help="comma separated card numbers (default: every map in rev/)")
    args = ap.parse_args()
    nums = (
        [int(n) for n in args.only.split(",")]
        if args.only
        else sorted(int(p.stem) for p in SRC.glob("*.webp"))
    )
    OUT.mkdir(parents=True, exist_ok=True)
    for n in nums:
        src = SRC / f"{n}.webp"
        scan = SCANS / f"{n}.webp"
        if not src.exists() or not scan.exists():
            print(f"skip {n}: missing {'map' if not src.exists() else 'scan'}")
            continue
        m = np.asarray(Image.open(src).convert("RGBA")).astype(np.float32)
        h, w = m.shape[:2]
        alpha = m[..., 3] * (1 - ink_mask(scan, (w, h)))
        white = np.full((h, w), 255, np.uint8)
        out = np.dstack([white, white, white, alpha.round().clip(0, 255).astype(np.uint8)])
        Image.fromarray(out, "RGBA").save(OUT / f"{n}.webp", "WEBP", quality=70, alpha_quality=80, method=6)
    total = sum(p.stat().st_size for p in OUT.glob("*.webp"))
    print(f"{len(list(OUT.glob('*.webp')))} maps in {OUT}, {total // 1024} KB")


if __name__ == "__main__":
    main()
