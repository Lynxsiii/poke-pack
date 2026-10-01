#!/usr/bin/env python3
"""Draw the e-Card frame masks (Expedition, Aquapolis, Skyridge): assets/foil/wotc-ecard/{win,body}-<layout>-v1.webp.

TCG Live published no foil maps for 2002-2003, so the e-Card holo (css/holo/wotc-ecard.css `wotc-ecard`, through
`wotcMap()` in js/wotc-foil.js) and the e-Card reverse / Crystal body foil take drawn masks. The frame is printed
identically on every card of a layout, so the art window is measured, not hand drawn: the per-pixel standard
deviation over every scan of one layout is high where the picture is and low where the frame, the name bar and
the text box are printed. Threshold it, keep the main blob, fill holes, round it, pull the edge back onto the bevel.

Layouts (all three sets share one frame; Basic and Stage 1/2 windows agree): pokemon, trainer, energy (Special
Energy: the picture runs from under the title to the text). A basic Energy is not foil in any finish.

Two files per layout, white RGBA 600 x 838 (the scan's size, so `mask-size: 100% 100%` lines up), alpha is the mask:
  win-<layout>   the art window: where the holo's cosmos is (Rare Holo, the Crystal Pokémon's picture)
  body-<layout>  everywhere else the reverse holo and the Crystal's body foil go: the card minus the window minus the
                 matte bottom band (the e logo, the (c) / illustrator / number line and the e-Reader strip, which
                 stay flat on every print: Collexy shows the 13-slot strip as plain print on holos and reverses)
Never overwrite a shipped mask: pass --suffix -v2 for a redraw.

    python3 scripts/make_wotc_ecard_masks.py --out assets/foil/wotc-ecard [--preview <png>]
"""
import argparse
import json
import os

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

W, H = 600, 838
BAND_Y = 0.925  # the bottom band starts here (fraction of the card height): (c) line, illustrator, number, e logo, strip


def layout_of(card):
    if card.get("rarity") == "Promo":
        return None
    if card["supertype"] == "Trainer":
        return "trainer"
    if card["supertype"] == "Energy":
        return "energy" if "Special" in card.get("subtypes", []) else None
    return "pokemon"


def collect(root):
    groups = {}
    for s in ("ecard1", "ecard2", "ecard3"):
        d = json.load(open(os.path.join(root, "data", f"{s}.json")))
        cards = d["cards"] if isinstance(d, dict) else d
        for c in cards:
            lay = layout_of(c)
            n = c["id"].split("-", 1)[1]
            p = os.path.join(root, "assets", "cards", s, f"{n}.webp")
            if lay and os.path.exists(p):
                groups.setdefault(lay, []).append(p)
    return groups


def load(p):
    return np.asarray(Image.open(p).convert("L").resize((W, H), Image.LANCZOS), dtype=np.float32)


def window(stack, layout):
    """The picture is different on every card, so the mean image of a layout is flat grey inside the window and sharp on
    the frame's bevel; the standard deviation cannot tell the window from the text box (its colour follows the type).
    Flood-fill the window from its centre, walled in by the strong edges of the mean image."""
    mean = stack.mean(0)
    mean = ndi.gaussian_filter(mean, 0.7)
    gy, gx = np.gradient(mean)
    g = np.hypot(gx, gy)
    wall = g > 5  # a printed edge: the same on every card of the layout
    wall = ndi.binary_dilation(wall, structure=np.ones((3, 3)), iterations=2)
    free = ~wall
    free[int(H * 0.72):] = False
    seed = (0.30, 0.50)
    lab, k = ndi.label(free)
    l0 = lab[int(H * seed[0]), int(W * seed[1])]
    if not l0:
        raise SystemExit(f"window seed fell on a wall for {layout}")
    m = lab == l0
    m = ndi.binary_fill_holes(m)
    m = ndi.binary_closing(m, structure=np.ones((9, 9)))
    m = ndi.binary_opening(m, structure=np.ones((7, 7)))
    m = ndi.binary_fill_holes(m)
    # the name bar's gaps can leak the fill up behind the HP: keep only the rows where the blob is window-wide
    if layout == "pokemon":
        # the window's top bevel: the std of a column jumps from the bevel's ~8 to the picture's ~50 at y = 0.1145 H
        m[: int(H * 0.1145)] = False
    m = ndi.binary_opening(m, structure=np.ones((15, 15)))
    return m


def save(path, mask):
    a = ndi.gaussian_filter(mask.astype(np.float32), 0.8)
    rgba = np.zeros((H, W, 4), np.uint8)
    rgba[..., :3] = 255
    rgba[..., 3] = np.clip(a * 255, 0, 255).astype(np.uint8)
    if os.path.exists(path):
        raise SystemExit(f"{path} exists: never overwrite a shipped asset, pass --suffix")
    Image.fromarray(rgba, "RGBA").save(path, "WEBP", lossless=True, quality=100, method=6)
    return rgba[..., 3]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    ap.add_argument("--out", required=True)
    ap.add_argument("--suffix", default="-v1")
    ap.add_argument("--preview")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    prev = []
    for lay, paths in collect(args.root).items():
        rng = np.random.default_rng(7)
        pick = list(rng.permutation(len(paths))[:90])
        stack = np.stack([load(paths[i]) for i in pick])
        win = window(stack, lay)
        ys, xs = np.where(win)
        print(f"{lay}: {len(paths)} scans, window x {xs.min() / W:.4f}-{(xs.max() + 1) / W:.4f} y {ys.min() / H:.4f}-{(ys.max() + 1) / H:.4f}")
        body = ~ndi.binary_dilation(win, structure=np.ones((3, 3)), iterations=1)
        body[int(H * BAND_Y):] = False
        a1 = save(os.path.join(args.out, f"win-{lay}{args.suffix}.webp"), win)
        a2 = save(os.path.join(args.out, f"body-{lay}{args.suffix}.webp"), body)
        prev += [a1, a2]
    if args.preview:
        sh = Image.new("L", (200 * len(prev), 280))
        for i, a in enumerate(prev):
            sh.paste(Image.fromarray(a).resize((200, 280)), (i * 200, 0))
        sh.save(args.preview)


if __name__ == "__main__":
    main()
