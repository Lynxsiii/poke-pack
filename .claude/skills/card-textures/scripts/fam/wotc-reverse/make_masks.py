#!/usr/bin/env python3
"""Foil masks of the wotc-reverse family: where a Base Set to Neo Destiny reverse face is foil.

White (alpha 1) = foil: the printed face inside the yellow border, less the layout's art window. The window is the
era's own (assets/foil/wotc-win/<layout>-v1.webp, make_wotc_window_masks.py), grown by a few pixels so the gold bevel
round the picture stays matte on every scan (the scans sit a few pixels apart), and feathered.

    python3 make_masks.py            # writes assets/foil/fam/wotc-reverse/<layout>-v1.webp
"""
import os

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), *[".."] * 6))
OUT = os.path.join(ROOT, "assets/foil/fam/wotc-reverse")
VERSION = "v1"
W, H = 600, 838
BORDER = (29, 29)  # the yellow border, x and y, in pixels of a 600 x 838 scan
GROW = 5           # the window grows by this much (MaxFilter size 2 * GROW + 1)


def main():
    os.makedirs(OUT, exist_ok=True)
    for layout in ("pokemon", "trainer", "energy"):
        win = Image.open(os.path.join(ROOT, f"assets/foil/wotc-win/{layout}-v1.webp")).getchannel("A").resize((W, H))
        win = win.filter(ImageFilter.MaxFilter(2 * GROW + 1))
        face = Image.new("L", (W, H), 0)
        face.paste(255, (BORDER[0], BORDER[1], W - BORDER[0], H - BORDER[1]))
        a = np.asarray(face, dtype=np.float32) * (1 - np.asarray(win, dtype=np.float32) / 255)
        alpha = Image.fromarray(a.astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.5))
        out = Image.merge("RGBA", [Image.new("L", (W, H), 255)] * 3 + [alpha])
        path = os.path.join(OUT, f"{layout}-{VERSION}.webp")
        if os.path.exists(path):
            raise SystemExit(f"{path} exists: shipped masks are immutable, bump VERSION")
        out.save(path, lossless=True)
        print(path)


if __name__ == "__main__":
    main()
