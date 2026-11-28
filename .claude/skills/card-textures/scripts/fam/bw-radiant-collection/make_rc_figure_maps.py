"""Radiant Collection Confetti: zone maps that hold the sequins off the Pokémon.

The 2026-11-28 full-site check failed 14 of the 15 Confetti faces for "glitter dots over the Pokémon": the zone map was the
all-white full.webp, so the flashes and the disc mosaic ran over the figure at full strength. The figure is cut from each
scan by the generic scripts/make_figure_masks.py (SAM2); this script turns those masks into the family's zone map:
alpha = 1 - KEEP_OFF x the figure (feathered), times the card's earlier zone map where it had one (Mew-EX RC24).

    python3 .claude/skills/card-textures/scripts/make_figure_masks.py --cards bw11-RC3,...,bw11-RC19 --zone 48,90,552,438 \
        --models <dir> --out <figs>            # regular art: the window
    python3 .claude/skills/card-textures/scripts/make_figure_masks.py --cards bw11-RC11,bw11-RC21,...,bw11-RC25 \
        --zone 20,60,580,470 --spill --models <dir> --out <figs>   # the EX and the full arts
    python3 .claude/skills/card-textures/scripts/fam/bw-radiant-collection/make_rc_figure_maps.py <figs>
Writes assets/foil/fam/bw-radiant-collection/map-rc<N>-fig-v1.webp and prints the list for js/fam/bw-radiant-collection.js.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

ROOT = Path(__file__).resolve().parents[6]
OUT = ROOT / "assets" / "foil" / "fam" / "bw-radiant-collection"
KEEP_OFF = 0.88   # how much of the foil the figure loses
V = 1
PRIOR = {24: OUT / "map-rc24-v3.webp"}
FULL = {11, 21, 22, 23, 24, 25}
WINDOW = (48, 90, 552, 438)


def main():
    figs = Path(sys.argv[1])
    done = []
    for f in sorted(figs.glob("bw11-RC*.png")):
        n = int(f.stem.split("RC")[1])
        fig = np.asarray(Image.open(f).convert("L").resize((600, 838), Image.LANCZOS)).astype(np.float32) / 255
        a = 1 - KEEP_OFF * np.clip(gaussian_filter(fig, 2.0), 0, 1)
        if n not in FULL:
            # regular art: SAM misses a tail or a wing on about a third of them (Purrloin, Stunfisk, Growlithe), so the
            # whole art window is held to half as well; the border, name bar and text box keep the sequins in full
            x0, y0, x1, y1 = WINDOW
            a[y0:y1, x0:x1] *= 0.5
        if n in PRIOR:
            p = Image.open(PRIOR[n]).convert("RGBA").resize((600, 838))
            a *= np.asarray(p)[..., 3].astype(np.float32) / 255
        out = np.dstack([np.full((838, 600, 3), 255, np.uint8), (a * 255 + 0.5).astype(np.uint8)])
        path = OUT / f"map-rc{n}-fig-v{V}.webp"
        if path.exists() and "--force" not in sys.argv:
            raise SystemExit(f"{path} exists: bump V")
        Image.fromarray(out, "RGBA").save(path, quality=90, method=6)
        done.append(n)
    print("FIG =", sorted(done))


if __name__ == "__main__":
    main()
