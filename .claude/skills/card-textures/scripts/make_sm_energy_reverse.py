#!/usr/bin/env python3
"""Seamless type-symbol tiles for the Sun & Moon basic Energy reverse holo.

The Pokémon reverse tiles (assets/foil/sm-reverse/<type>.webp, make_sm_reverse.py)
carry the symbol field only over the right of the body; an Energy's foil covers
the whole coloured field, so it needs the field as a repeating tile. The field
is a skewed lattice: symbols every 45 px across, each row 41 px lower and 15 px
to the right (of a 367 x 512 tile), so three rows repeat exactly: a 45 x 123 px
cell, taken here from the clean part of the field and saved at twice that size.

    python3 .claude/skills/card-textures/scripts/make_sm_energy_reverse.py

Writes assets/foil/sm-reverse/energy-<type>.webp for the eight basic Energy types
(new files; assets are immutable-cached, never overwrite).
"""
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
DIR = os.path.join(ROOT, "assets", "foil", "sm-reverse")
TYPES = ["grass", "fire", "water", "lightning", "psychic", "fighting", "darkness", "metal"]
PX, PY = 45, 123  # one period of the lattice, in 367 x 512 px


def main() -> None:
    for t in TYPES:
        dest = os.path.join(DIR, f"energy-{t}.webp")
        if os.path.exists(dest) and "--force" not in sys.argv:
            print(dest, "exists, skipped")
            continue
        im = Image.open(os.path.join(DIR, f"{t}.webp")).convert("RGBA")
        w, h = im.size
        x0, y0 = int(w * 0.55) + 100, int(h * 0.57) + 10
        cell = im.crop((x0, y0, x0 + PX, y0 + PY))
        grey = np.asarray(cell)[..., 0]
        out = Image.merge("RGBA", [Image.fromarray(grey)] * 3 + [Image.new("L", cell.size, 255)])
        out.resize((PX * 2, PY * 2), Image.LANCZOS).save(dest, "WEBP", quality=88, method=6)
        print(dest, os.path.getsize(dest), "bytes")


if __name__ == "__main__":
    main()
