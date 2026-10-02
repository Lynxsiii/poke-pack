#!/usr/bin/env python3
"""Draw the foil area of the e-Card reverse holo, one alpha mask per frame layout.

Family wotc-expedition (Expedition ecard1, Aquapolis ecard2 and Skyridge ecard3 reverses). The real reverse is foil over
the whole face but the art window: border, name bar, evolution circle, text box, weakness bar AND the bottom strip with its
e logo and slots (photos in /mnt/project-files/holo-remaster/wotc-expedition/refs/: Expedition binder pages 7 and 8, Golem
14 PSA flat scan, Dragonite 9 and Charizard 6 reverses, Psyduck 104 Aquapolis; the strip glints with the border). The era's
body masks (assets/foil/wotc-ecard/body-*-v1.webp) stop at 0.925 of the height, so the strip stayed flat; these do not.

Input (read only): the era's measured art windows, assets/foil/wotc-ecard/win-{pokemon,trainer,energy}-v1.webp (checked on
Pokemon, Trainer, Tool and Special Energy scans of all three sets). The Basic Energy prints (ecard1 160-165) draw their
symbol art down to the strip, so their window is the Special Energy window carried down to the strip's top edge.

Output: assets/foil/fam/wotc-expedition/rev-body-<layout>-v1.webp, 600 x 838 RGBA, white, alpha = foil (1 px soft edge).
The card's own outline comes from the scan (`--art`) in the CSS mask stack, so these are full rectangles less the window.

    python3 .claude/skills/card-textures/scripts/fam/wotc-expedition/make_rev_masks.py [--check out.jpg]

Deterministic (no randomness). --check writes an overlay of every layout on scans of the three sets.
"""
import argparse
import os

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", "..", "..", ".."))
SRC = os.path.join(ROOT, "assets", "foil", "wotc-ecard")
OUT = os.path.join(ROOT, "assets", "foil", "fam", "wotc-expedition")
W, H = 600, 838
# The Basic Energy art runs down to the strip; the strip's top edge on ecard1 160-165 sits at 0.928 H (measured on 162).
BASIC_ENERGY_BOTTOM = 0.926


def window(name):
    a = np.asarray(Image.open(os.path.join(SRC, f"win-{name}-v1.webp")).convert("RGBA"))[..., 3].astype(np.float32) / 255
    assert a.shape == (H, W), a.shape
    return a


def soften(alpha):
    """1 px soft edge so the cut does not alias at phone size."""
    return ndi.gaussian_filter(alpha, 0.6)


def save(alpha, name):
    rgba = np.zeros((H, W, 4), np.uint8)
    rgba[..., :3] = 255
    rgba[..., 3] = np.clip(alpha * 255 + 0.5, 0, 255).astype(np.uint8)
    path = os.path.join(OUT, f"rev-body-{name}-v1.webp")
    Image.fromarray(rgba, "RGBA").save(path, lossless=True, quality=100, method=6)
    print(path, os.path.getsize(path), "bytes, foil share", round(float(alpha.mean()), 3))
    return alpha


def build():
    os.makedirs(OUT, exist_ok=True)
    masks = {}
    for name in ("pokemon", "trainer", "energy"):
        win = window(name)
        masks[name] = save(soften(1.0 - (win > 0.5).astype(np.float32)), name)
    # Basic Energy: the energy window carried down to the strip.
    win = window("energy") > 0.5
    ys, xs = np.nonzero(win)
    rows = np.arange(H)[:, None]
    ext = win.copy()
    bottom = int(round(BASIC_ENERGY_BOTTOM * H))
    last = ys.max()
    # the window's columns at its lower edge, kept straight down to the strip
    cols = win[last - 2]
    ext[last:bottom, :] = cols[None, :]
    masks["basic-energy"] = save(soften(1.0 - ext.astype(np.float32)), "basic-energy")
    return masks


def check(out):
    """Overlay each mask's edge on scans of every layout of the three sets."""
    items = [("ecard1/100", "pokemon"), ("ecard2/100", "pokemon"), ("ecard3/100", "pokemon"), ("ecard1/6", "pokemon"),
             ("ecard1/143", "trainer"), ("ecard2/120", "trainer"), ("ecard3/122", "trainer"), ("ecard1/159", "energy"),
             ("ecard2/144", "energy"), ("ecard3/143", "energy"), ("ecard1/162", "basic-energy"), ("ecard1/165", "basic-energy")]
    cells = []
    for card, layout in items:
        s = np.asarray(Image.open(os.path.join(ROOT, "assets", "cards", f"{card}.webp")).convert("RGB")).copy()
        m = np.asarray(Image.open(os.path.join(OUT, f"rev-body-{layout}-v1.webp")))[..., 3] > 127
        e = ndi.binary_dilation(m ^ ndi.binary_erosion(m))
        s[e] = [255, 0, 255]
        tint = s.astype(np.float32)
        tint[m] = tint[m] * 0.75 + np.array([60, 0, 60]) * 0.25
        cells.append(Image.fromarray(tint.clip(0, 255).astype(np.uint8)).resize((300, 419), Image.LANCZOS))
    sheet = Image.new("RGB", (6 * 305, 2 * 424), (0, 0, 0))
    for i, im in enumerate(cells):
        sheet.paste(im, ((i % 6) * 305, (i // 6) * 424))
    sheet.save(out, quality=88)
    print(out)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--check", help="write an overlay sheet to this path")
    args = ap.parse_args()
    build()
    if args.check:
        check(args.check)
