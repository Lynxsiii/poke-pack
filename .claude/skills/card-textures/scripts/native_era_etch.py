#!/usr/bin/env python3
"""Ship a Sword & Shield print's etch map at TCG Live's own size, barely softened.

The era's etch maps were blurred 1.5 px at 400 px wide and grained
(`soften_era_etch.py`, -etch-v3) so hairlines would not alias into a line
screen on a phone. That worked, but it also threw away the etch itself: the
real cards, and poke-holo.simey.me's copies of them, show fine engraved lines
and swirls that follow the drawing, where ours showed soft mottling like
camouflage (holo benchmark, 2026-09-29). This keeps the lines: the map at
TCG Live's native size (733 x 1024; the first three sets only have 367 x 512
from Live), floor stretched to 0 as alpha_mask() does, and only a
sub-pixel blur (sigma 0.6 by default) so a one-pixel hatch does not turn into
a moire when the browser resamples it to phone size. No grain: the grain was
the blotches.

    python3 .claude/skills/card-textures/scripts/native_era_etch.py --set swsh7
    python3 .claude/skills/card-textures/scripts/native_era_etch.py --set swsh9 --cards 18,186

Reads lab/cache/<set>/<n>.etch.png (fetch_foil_maps.py fills the cache),
writes assets/foil/maps/<set>/<n>-etch-v4.webp (white with alpha = the etch)
and points the card's `etchMap` at it. Never overwrites: /assets/* is cached
immutable for a year, so a changed map gets a new name.
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
CACHE = HERE.parent / "lab" / "cache"
FLOOR = 22
SUFFIX = "-etch-v4.webp"


def build(src: Path, sigma: float) -> Image.Image:
    a = np.asarray(Image.open(src).convert("RGBA")).astype(np.float32)
    lum = (0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]) * a[..., 3] / 255
    lum = np.clip((lum - FLOOR) * (255 / (255 - FLOOR)), 0, 255)
    if sigma > 0:
        lum = ndimage.gaussian_filter(lum, sigma)
    lum = lum.round().astype(np.uint8)
    white = np.full_like(lum, 255)
    return Image.fromarray(np.dstack([white, white, white, lum]), "RGBA")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--set", required=True)
    ap.add_argument("--cards", default="", help="comma-separated card numbers (default: every card with an etch map)")
    ap.add_argument("--sigma", type=float, default=0.6)
    ap.add_argument("--quality", type=int, default=75)
    ap.add_argument("--alpha-quality", type=int, default=50, help="lossy alpha: 50 is about half the bytes of 75 with no visible change")
    ap.add_argument("--no-data", action="store_true", help="write the files but leave data/<set>.json alone")
    a = ap.parse_args()
    path = ROOT / "data" / f"{a.set}.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    records = data if isinstance(data, list) else data["cards"]
    wanted = {s.strip() for s in a.cards.split(",") if s.strip()}
    made = changed = missing = 0
    for c in records:
        n = str(c.get("number"))
        if wanted and n not in wanted:
            continue
        cur = c.get("etchMap")
        if not cur or cur.endswith(SUFFIX):
            continue
        src = CACHE / a.set / f"{n}.etch.png"
        if not src.exists() and "-" in n:
            src = CACHE / a.set / f"{n.split('-')[0]}.etch.png"
        if not src.exists():
            print(f"  {c['id']}: no cached etch ({src.relative_to(ROOT)}), left on {cur}")
            missing += 1
            continue
        rel = f"assets/foil/maps/{a.set}/{n}{SUFFIX}"
        out = ROOT / rel
        if not out.exists():
            out.parent.mkdir(parents=True, exist_ok=True)
            build(src, a.sigma).save(out, "WEBP", quality=a.quality, alpha_quality=a.alpha_quality, method=4)
            made += 1
        if not a.no_data:
            c["etchMap"] = rel
            changed += 1
    if changed:
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{a.set}: {made} written, {changed} repointed, {missing} without a cached etch")
    return 0


if __name__ == "__main__":
    sys.exit(main())
