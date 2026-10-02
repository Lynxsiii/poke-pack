"""Ship Pokemon TCG Live's Generations maps as site masks for the xy-generations holo family.

Reads the cache fetch_g1_maps.py fills and writes alpha masks (white, alpha = the map's luminance with TCG Live's
"not foil" floor of 22/255 stretched to 0, exactly as scripts/fetch_foil_maps.py's alpha_mask() does; 367 x 512,
the size TCG Live publishes) into assets/foil/fam/xy-generations/:

- ``rc/<n>.webp``   the Radiant Collection's own map for RC<n> (std print, key xy9-5r): the art background and the
  hidden foil picture of the text box (snowflakes, hearts, keys, a castle ...). TCG Live has one for the 12
  Uncommons and the 7 Ultra Rares; the 13 Commons are not foil (no map, TCGplayer lists them "Normal" only).
- ``rev/<n>.webp``  the reverse holo print's map of main-set card <n> (ph print, key xy9-5): the whole body but the
  art window, the type's ghosted symbols in grey, the energy costs and rule lines cut out. INK KNOCK-OUT (review #1,
  2026-10-02): the printed text is opaque black ink over the foil on the real card (Golem reverse frames), but TCG
  Live's map covers the text lines, and the colour-dodge lifts the ink to the rainbow column's colour (Olympia became a
  rainbow sentence). The scan (assets/cards/g1/<n>.webp, 600 x 838) is read for ink = pixels darker than 0.70 x the
  local body colour (25 px median) and under luma 150; the mask is dilated 3 x 3, blurred 0.7 px and the map's alpha is
  multiplied by (1 - ink) at the scan's resolution, then saved at 480 x 670 so thin strokes survive. The same knock-out
  can be applied to chosen RC maps' text box (--rc-ink 5,8: rows below 0.53 of the card only, so the art window's dark
  outlines stay foil; not for the EX and full arts, whose black star border would lose its inner edge).

Checked 2026-10-01: TCG Live's renders of RC5, RC6, RC24, RC30, 3, 35 and 66 line up with the site's Scrydex scans
at scale 1.000 and offset 0 (edge correlation 0.97-0.98), so the maps need no warp.

    python3 ship_g1_maps.py [--cache DIR] [--dry]

Never overwrites a file whose bytes differ (an asset is cached for a year under its name): it stops and says so,
unless --suffix -v2 (etc.) is given, which writes <n>-v2.webp instead, or --overwrite (only while the family has not
shipped: origin/master has no assets/foil/fam/xy-generations).
"""
from __future__ import annotations

import argparse
import io
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[5]
OUT = ROOT / "assets" / "foil" / "fam" / "xy-generations"
DEFAULT_CACHE = Path("/tmp/claude-0/-home-user-poke-pack/6032daf4-813b-52e1-a08d-2db4b199665a/scratchpad/xy-generations/tcgl")
FLOOR = 22  # TCG Live's "not foil" luminance (fetch_foil_maps.py)
SCANS = ROOT / "assets" / "cards" / "g1"
SCAN_W, SCAN_H = 600, 838  # the site's scans
REV_SIZE = (480, 670)  # the knocked-out maps are larger than TCG Live's 367 x 512 so thin strokes survive
RC_INK_FROM = 0.53  # RC maps: knock the ink out of the text box only (rows below this share of the card height)


def ink_mask(scan_path: Path, from_row: float = 0.0) -> np.ndarray:
    """Float 0..1 at 600 x 838: 1 where the scan is dark ink against the local body colour.

    ink = luma < 0.70 x (25 px median of the luma) and luma < 150; dilated 3 x 3, blurred 0.7 px. Rows above
    ``from_row`` (a share of the height) are left alone."""
    rgb = np.asarray(Image.open(scan_path).convert("RGB").resize((SCAN_W, SCAN_H), Image.LANCZOS)).astype(np.float32)
    luma = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]
    bg = cv2.medianBlur(luma.round().astype(np.uint8), 25).astype(np.float32)
    ink = ((luma < 0.70 * bg) & (luma < 150)).astype(np.uint8)
    ink = cv2.dilate(ink, np.ones((3, 3), np.uint8))
    ink = cv2.GaussianBlur(ink.astype(np.float32), (0, 0), 0.7)
    if from_row > 0:
        ink[: int(SCAN_H * from_row)] = 0
    return ink.clip(0, 1)


def alpha_mask(path: Path, scan: Path | None = None, from_row: float = 0.0, out_size: tuple[int, int] | None = None) -> Image.Image:
    a = np.asarray(Image.open(path).convert("RGBA")).astype(np.float32)
    lum = (0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]) * a[..., 3] / 255
    lum = (lum - FLOOR) * (255 / (255 - FLOOR))
    lum = lum.clip(0, 255)
    if scan is not None:
        big = cv2.resize(lum, (SCAN_W, SCAN_H), interpolation=cv2.INTER_LINEAR)
        big = big * (1 - ink_mask(scan, from_row))
        lum = cv2.resize(big, out_size or (SCAN_W, SCAN_H), interpolation=cv2.INTER_AREA)
    lum = lum.clip(0, 255).round().astype(np.uint8)
    white = np.full_like(lum, 255)
    return Image.fromarray(np.dstack([white, white, white, lum]), "RGBA")


def encode(img: Image.Image, alpha_quality: int = 80) -> bytes:
    buf = io.BytesIO()
    img.save(buf, "WEBP", quality=85, alpha_quality=alpha_quality, method=6)
    return buf.getvalue()


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--suffix", default="", help="written as <n><suffix>.webp, for a redraw after shipping")
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--overwrite", action="store_true", help="replace files whose bytes differ (family not shipped yet)")
    ap.add_argument("--no-ink", action="store_true", help="reverse maps without the ink knock-out (TCG Live's map as is)")
    ap.add_argument("--rc-ink", default="", help="RC numbers (comma list, e.g. 5,8) whose text box gets the ink knock-out too")
    ap.add_argument("--alpha-quality", type=int, default=70)
    args = ap.parse_args()
    rc_ink = {int(x) for x in args.rc_ink.split(",") if x.strip()}
    jobs = []
    for f in sorted(args.cache.glob("rc*.std.foil.png")):
        n = int(f.name[2:].split(".")[0])
        jobs.append((f, OUT / "rc" / f"{n}{args.suffix}.webp", ("RC", n)))
    # Only the reverse prints the site can deal: main-set cards in data/g1.json (the basic Energy 75-83 are not
    # in it; the packs use the XY 2013 Energy print).
    import json
    numbers = {str(c["number"]) for c in json.loads((ROOT / "data" / "g1.json").read_text()) if not c.get("rc")}
    for f in sorted(args.cache.glob("*.ph.foil.png")):
        n = int(f.name.split(".")[0])
        if str(n) in numbers:
            jobs.append((f, OUT / "rev" / f"{n}{args.suffix}.webp", ("REV", n)))
    total, clash = 0, []
    for src, dest, (kind, n) in jobs:
        if kind == "REV" and not args.no_ink:
            img = alpha_mask(src, SCANS / f"{n}.webp", 0.0, REV_SIZE)
        elif kind == "RC" and n in rc_ink:
            img = alpha_mask(src, SCANS / f"RC{n}.webp", RC_INK_FROM, REV_SIZE)
        else:
            img = alpha_mask(src)
        data = encode(img, args.alpha_quality)
        total += len(data)
        if dest.exists() and dest.read_bytes() != data and not args.overwrite:
            clash.append(dest)
            continue
        if not args.dry:
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(data)
    print(f"{len(jobs)} masks, {total / 1e6:.2f} MB" + (" (dry run)" if args.dry else f" in {OUT}"))
    if clash:
        sys.exit("refused to overwrite (bytes differ; ship under a new --suffix): " + ", ".join(str(c) for c in clash))


if __name__ == "__main__":
    main()
