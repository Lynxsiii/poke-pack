#!/usr/bin/env python3
"""Draw the art-window masks of the EX generation's regular frames: assets/foil/ex-win/<layout>[-i].webp.

TCG Live has no foil maps for 2003-2007, so the window holo (css/holo/ex.css `ex-cosmos`, through `exMap()` in js/ex-foil.js)
and the Mirror reverse of ex1-ex4 (the whole card minus the window, `--ex-win`) take a drawn mask per frame. The window of an EX
frame is a fixed rectangle, so it is measured, not drawn by hand: the mean absolute gradient over every scan of one layout
(about 150 to 190 scans per layout in ex1-ex16) shows the printed frame as crisp lines, because the picture's own edges average
out, while the frame, the grey bevel round the picture, the "BASIC" tab and the Evolves-from circle stay put (the DP notes used
the per-pixel standard deviation; the EX bodies are coloured by type, so the standard deviation would take the body too).
Peak positions of those profiles, in px of the 600 x 838 scan (picture edge = the gradient peak, +1 px inside):

    Pokemon (Basic, Stage 1, Stage 2; the Trainer Kit and POP Pokemon, the delta Pokemon too)
        x 41 - 558, y 75 - 390 (scrydex crops jitter 2 px from scan to scan, so the mask sits 2 px inside).
        The grey bevel ring round the picture (about 10 px) is frame, not picture.
        Stage 1 / 2 add the Evolves-from circle, centre (57, 411), radius 42 (ring included 46), cut out of the corner.
    Trainer (Item, Supporter, Stadium, Tool, TM): x 53 - 545, y 119 - 409, inside a double bevel.
    Special Energy: the picture bleeds to both sides of the frame: x 10 - 589, y 73 - 582.
    ex3 and ex6 (the `-i` variants): their scrydex scans are zoomed out about 5 percent round the card's middle, so the
        whole frame sits inwards: Pokemon x 53 - 546, y 86 - 391, circle (69, 410) r 40 (ring 44); Trainer x 67 - 533, y 129 - 409.
        Per-card peaks over every Pokemon of ex1-ex16: 14 sets at x 39-42, ex3 and ex6 at x 53 (34 + 26 of the 45-50 cards each).

Output: white RGBA, alpha is the window, 600 x 838 (the scan's own size, so `mask-size: 100% 100%` lines up), edges antialiased
by area, lossless webp, well under 1 KB each. Never overwrite a shipped mask: `--suffix -v2` for a redraw.

    python3 scripts/make_ex_window_masks.py --out assets/foil/ex-win [--preview <png>]
"""
import argparse
import os

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

W, H = 600, 838
# x0, y0, x1, y1 of the picture, the foil kept 2 px inside the printed edge so it never lands on the bevel
RECT = {
    "pokemon": (43.0, 77.5, 556.5, 388.5),
    "trainer": (54.0, 120.0, 544.0, 407.5),
    "energy": (11.0, 74.5, 588.5, 580.5),
    "pokemon-i": (55.0, 88.0, 544.5, 389.5),
    "trainer-i": (69.0, 131.0, 532.0, 408.0),
}
CIRCLE = (57.0, 411.0, 46.0)  # Evolves-from circle, ring included
CIRCLE_I = (69.0, 410.5, 44.0)


def rect_mask(x0, y0, x1, y1):
    ys, xs = np.mgrid[0:H, 0:W]
    # coverage of each pixel by the rectangle, so the edge is antialiased by area
    cx = np.clip(np.minimum(xs + 1, x1) - np.maximum(xs, x0), 0, 1)
    cy = np.clip(np.minimum(ys + 1, y1) - np.maximum(ys, y0), 0, 1)
    return cx * cy


def circle_cut(cx, cy, r):
    ys, xs = np.mgrid[0:H, 0:W]
    d = np.hypot(xs + 0.5 - cx, ys + 0.5 - cy)
    return np.clip(r + 0.5 - d, 0, 1)


def save(name, alpha, out, suffix):
    path = os.path.join(out, f"{name}{suffix}.webp")
    if os.path.exists(path):
        raise SystemExit(f"{path} exists: never overwrite a shipped asset, pass --suffix")
    rgba = np.zeros((H, W, 4), np.uint8)
    rgba[..., :3] = 255
    rgba[..., 3] = np.clip(np.round(alpha * 255), 0, 255).astype(np.uint8)
    Image.fromarray(rgba, "RGBA").save(path, "WEBP", lossless=True, quality=100, method=6)
    return path


def masks():
    out = {}
    out["pokemon"] = rect_mask(*RECT["pokemon"])
    out["pokemon-evo"] = out["pokemon"] * (1 - circle_cut(*CIRCLE))
    out["trainer"] = rect_mask(*RECT["trainer"])
    out["energy"] = rect_mask(*RECT["energy"])
    out["pokemon-i"] = rect_mask(*RECT["pokemon-i"])
    out["pokemon-evo-i"] = out["pokemon-i"] * (1 - circle_cut(*CIRCLE_I))
    out["trainer-i"] = rect_mask(*RECT["trainer-i"])
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--suffix", default="")
    ap.add_argument("--preview", help="write a contact sheet of the masks here")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    prev = []
    for name, a in masks().items():
        print(save(name, a, args.out, args.suffix))
        prev.append(a)
    if args.preview:
        sh = Image.new("L", (300 * len(prev), 419))
        for i, a in enumerate(prev):
            sh.paste(Image.fromarray((a * 255).astype(np.uint8)).resize((300, 419)), (i * 300, 0))
        sh.save(args.preview)


if __name__ == "__main__":
    main()
