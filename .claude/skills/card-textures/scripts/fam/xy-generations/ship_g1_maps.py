"""Ship Pokemon TCG Live's Generations maps as site masks for the xy-generations holo family.

Reads the cache fetch_g1_maps.py fills and writes alpha masks (white, alpha = the map's luminance with TCG Live's
"not foil" floor of 22/255 stretched to 0, exactly as scripts/fetch_foil_maps.py's alpha_mask() does; 367 x 512,
the size TCG Live publishes) into assets/foil/fam/xy-generations/:

- ``rc/<n>.webp``   the Radiant Collection's own map for RC<n> (std print, key xy9-5r): the art background and the
  hidden foil picture of the text box (snowflakes, hearts, keys, a castle ...). TCG Live has one for the 12
  Uncommons and the 7 Ultra Rares; the 13 Commons are not foil (no map, TCGplayer lists them "Normal" only).
- ``rev/<n>.webp``  the reverse holo print's map of main-set card <n> (ph print, key xy9-5): the whole body but the
  art window, the type's ghosted symbols in grey, the energy costs and rule lines cut out.

Checked 2026-10-01: TCG Live's renders of RC5, RC6, RC24, RC30, 3, 35 and 66 line up with the site's Scrydex scans
at scale 1.000 and offset 0 (edge correlation 0.97-0.98), so the maps need no warp.

    python3 ship_g1_maps.py [--cache DIR] [--dry]

Never overwrites a file whose bytes differ (an asset is cached for a year under its name): it stops and says so,
unless --suffix -v2 (etc.) is given, which writes <n>-v2.webp instead.
"""
from __future__ import annotations

import argparse
import io
import sys
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[5]
OUT = ROOT / "assets" / "foil" / "fam" / "xy-generations"
DEFAULT_CACHE = Path("/tmp/claude-0/-home-user-poke-pack/6032daf4-813b-52e1-a08d-2db4b199665a/scratchpad/xy-generations/tcgl")
FLOOR = 22  # TCG Live's "not foil" luminance (fetch_foil_maps.py)


def alpha_mask(path: Path) -> Image.Image:
    a = np.asarray(Image.open(path).convert("RGBA")).astype(np.float32)
    lum = (0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]) * a[..., 3] / 255
    lum = (lum - FLOOR) * (255 / (255 - FLOOR))
    lum = lum.clip(0, 255).round().astype(np.uint8)
    white = np.full_like(lum, 255)
    return Image.fromarray(np.dstack([white, white, white, lum]), "RGBA")


def encode(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, "WEBP", quality=85, alpha_quality=80, method=6)
    return buf.getvalue()


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--suffix", default="", help="written as <n><suffix>.webp, for a redraw after shipping")
    ap.add_argument("--dry", action="store_true")
    args = ap.parse_args()
    jobs = []
    for f in sorted(args.cache.glob("rc*.std.foil.png")):
        n = int(f.name[2:].split(".")[0])
        jobs.append((f, OUT / "rc" / f"{n}{args.suffix}.webp"))
    # Only the reverse prints the site can deal: main-set cards in data/g1.json (the basic Energy 75-83 are not
    # in it; the packs use the XY 2013 Energy print).
    import json
    numbers = {str(c["number"]) for c in json.loads((ROOT / "data" / "g1.json").read_text()) if not c.get("rc")}
    for f in sorted(args.cache.glob("*.ph.foil.png")):
        n = int(f.name.split(".")[0])
        if str(n) in numbers:
            jobs.append((f, OUT / "rev" / f"{n}{args.suffix}.webp"))
    total, clash = 0, []
    for src, dest in jobs:
        data = encode(alpha_mask(src))
        total += len(data)
        if dest.exists() and dest.read_bytes() != data:
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
