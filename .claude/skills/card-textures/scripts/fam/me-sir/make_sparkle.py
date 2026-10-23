#!/usr/bin/env python3
"""Draw the me-sir family's sparkle tile: neutral silver pinpoints on black, seamless.

Photos of the real Mega Evolution SIRs (Japanese SARs, reference/fam-me-sir.md): a dense, fine silver pinpoint
sparkle over the art, the text box and the frame; on the yellow rule box the same points glitter gold. The tile is
colour-dodged on its own layer (`.cure`, css/holo/fam/me-sir.css), so a neutral grey point lights the ink under it
in the ink's own hue (white on the silver frame, blue-white on navy, gold on the yellow rule box) and leaves black
ink black. Values stay under 0.8 so the dodge never divides by zero (Safari draws that as pixel blocks).

Points are one device pixel (the sheet draws one tile pixel per device pixel on a 220 px card at 3x), a few with a
dim four-pixel cross, so at phone size they read as pinpoints, not as a grain or a screen. Seeded: reruns give the
same file. Never overwrite a shipped name; bump the suffix.

    python3 .claude/skills/card-textures/scripts/fam/me-sir/make_sparkle.py --out assets/foil/fam/me-sir/sparkle-v1.webp
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image


def sparkle(size: int, density: float, seed: int, peak: float) -> Image.Image:
    rng = np.random.default_rng(seed)
    img = np.zeros((size, size), np.float32)
    count = int(size * size * density)
    for _ in range(count):
        x, y = (int(v) for v in rng.integers(0, size, 2))
        # most points are dim; about one in six catches the light hard
        val = rng.uniform(0.62, 1.0) if rng.random() < 0.16 else rng.uniform(0.22, 0.5)
        val *= peak
        img[y, x] = max(img[y, x], val)
        if val > 0.6 * peak:
            # a bright point gets a faint cross, so it reads as a glint rather than a dead pixel
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                yy, xx = (y + dy) % size, (x + dx) % size
                img[yy, xx] = max(img[yy, xx], val * 0.32)
    rgb = np.repeat(img[..., None], 3, axis=2)
    return Image.fromarray((rgb * 255).round().astype(np.uint8), "RGB")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", required=True)
    ap.add_argument("--size", type=int, default=256, help="tile size in px")
    ap.add_argument("--density", type=float, default=0.012, help="points per pixel")
    ap.add_argument("--peak", type=float, default=0.78, help="brightest value (under 0.8: the dodge stays finite)")
    ap.add_argument("--seed", type=int, default=1181)
    args = ap.parse_args()
    out = Path(args.out)
    if out.exists():
        raise SystemExit(f"{out} exists: assets are cached for a year, write a new -vN name")
    out.parent.mkdir(parents=True, exist_ok=True)
    sparkle(args.size, args.density, args.seed, args.peak).save(out, "WEBP", lossless=True, method=6)
    print(f"wrote {out} ({out.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
