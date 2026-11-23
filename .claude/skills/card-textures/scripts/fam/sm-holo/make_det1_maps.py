#!/usr/bin/env python3
"""Foil maps for Detective Pikachu (det1 1-18): the art window's background foil, the Pokémon matte.

TCG Live has no map for these prints (its CDN answers 404), so the site gives them sm-holo-safe.webp, the window with a
centred oval left matte. The cards are film stills and the Pokémon often stands off-centre (Bulbasaur left, Charmander
right), so the oval foils part of the Pokémon and leaves background matte. Photos (Lickitung det1 16, Mewtwo det1 12,
Bulbasaur det1 1 in reference/fam-sm-holo.md) show the rainbow on the background only.

The map is GrabCut on the scan, started from a hand-set box around the Pokémon (BOX, fractions of the art window, read
off the scans; outside the box is sure background). Seeding from focus (the Pokémon sharp, the background soft) was
tried first and failed: the stills are sharp almost everywhere. Writes assets/foil/fam/sm-holo/maps/det1-<n>-v1.webp (alpha = foil) and, with --preview, a
contact sheet with the matte tinted red.

    python3 .claude/skills/card-textures/scripts/fam/sm-holo/make_det1_maps.py [--only 1,4] [--preview out.jpg]
"""
import argparse
import os

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../../.."))
OUT = os.path.join(ROOT, "assets/foil/fam/sm-holo/maps")
SAFE = os.path.join(ROOT, "assets/foil/maps/sm-holo-safe.webp")
SIZE = (600, 838)
W, H = 367, 512  # the size of TCG Live's maps
# Reviewed 2026-10-23 (preview sheet): prints whose cut keeps background with the Pokémon or foils the Pokémon stay on
# the safe map; js/fam/sm-holo.js DET1_MAP lists the shipped ones.
REJECT = set()
# the Pokémon's box in the art window, (left, top, right, bottom) as fractions of the window's bounding box
BOX = {
    "1": (0.03, 0.0, 0.62, 0.82), "2": (0.22, 0.0, 0.82, 1.0), "3": (0.28, 0.0, 0.70, 0.85),
    "4": (0.40, 0.08, 0.82, 0.85), "5": (0.05, 0.0, 1.0, 0.95), "6": (0.28, 0.0, 0.80, 1.0),
    "7": (0.18, 0.05, 0.72, 1.0), "8": (0.12, 0.05, 0.78, 0.95), "9": (0.25, 0.0, 0.95, 1.0),
    "10": (0.28, 0.0, 0.86, 0.92), "11": (0.25, 0.08, 0.85, 0.95), "12": (0.30, 0.0, 0.85, 1.0),
    "13": (0.13, 0.03, 0.80, 1.0), "14": (0.27, 0.10, 0.73, 1.0), "15": (0.12, 0.0, 0.90, 1.0),
    "16": (0.06, 0.03, 0.88, 1.0), "17": (0.28, 0.06, 0.76, 0.97), "18": (0.08, 0.18, 1.0, 1.0),
}
GROW = 4  # px at 600 wide, the matte grown onto the outline


def load(path):
    return np.asarray(Image.open(path).convert("RGB").resize(SIZE, Image.LANCZOS), dtype=np.float32) / 255


def window():
    """The art window: the bounding box of the safe map (its oval is open at the top, so it cannot be filled)."""
    a = np.asarray(Image.open(SAFE).getchannel("A").resize(SIZE, Image.BILINEAR), dtype=np.float32) / 255
    ys, xs = np.where(a > 0.35)
    win = np.zeros(a.shape, bool)
    win[ys.min():ys.max() + 1, xs.min():xs.max() + 1] = True
    return win


def draw(n, win):
    rgb = load(os.path.join(ROOT, f"assets/cards/det1/{n}.webp"))
    ys, xs = np.where(win)
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    l, t, r, b = BOX[n]
    box = np.zeros_like(win)
    box[int(y0 + t * (y1 - y0)):int(y0 + b * (y1 - y0)) + 1, int(x0 + l * (x1 - x0)):int(x0 + r * (x1 - x0)) + 1] = True
    gc = np.full(win.shape, cv2.GC_BGD, np.uint8)
    gc[box & win] = cv2.GC_PR_FGD
    # GrabCut inside the window only: the frame shares the type colour with the Pokémon (Charmander on an orange card)
    crop = (slice(y0, y1 + 1), slice(x0, x1 + 1))
    img = (np.clip(rgb[crop], 0, 1) * 255).astype(np.uint8)[:, :, ::-1].copy()
    g = gc[crop].copy()
    cv2.setRNGSeed(1)
    cv2.grabCut(img, g, None, np.zeros((1, 65)), np.zeros((1, 65)), 6, cv2.GC_INIT_WITH_MASK)
    matte = np.zeros_like(win)
    matte[crop] = (g == cv2.GC_FGD) | (g == cv2.GC_PR_FGD)
    matte &= win
    matte = ndi.binary_opening(matte, iterations=3)
    lab, k = ndi.label(matte)
    if k:
        sizes = ndi.sum(matte, lab, range(1, k + 1))
        keep = np.zeros(k + 1, bool)
        keep[1:] = sizes > 0.03 * win.sum()
        matte = ndi.binary_fill_holes(keep[lab])
    matte = ndi.binary_dilation(matte, iterations=GROW) & win
    fg = win & ~matte
    a = ndi.gaussian_filter(fg.astype(np.float32), 1.0)
    m = Image.fromarray((np.clip(a, 0, 1) * 255).round().astype(np.uint8), "L").resize((W, H), Image.LANCZOS)
    out = Image.new("RGBA", (W, H), (255, 255, 255, 0))
    out.putalpha(m)
    return out, rgb, fg, fg.sum() / max(win.sum(), 1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--preview", default="")
    args = ap.parse_args()
    ns = [s for s in args.only.split(",") if s] or [str(i) for i in range(1, 19)]
    win = window()
    os.makedirs(OUT, exist_ok=True)
    tiles = []
    for n in ns:
        out, rgb, fg, share = draw(n, win)
        if n not in REJECT:
            out.save(os.path.join(OUT, f"det1-{n}-v1.webp"), lossless=True)
        print(f"det1-{n}: foil {share:.2f}" + (" (rejected, not written)" if n in REJECT else ""))
        if args.preview:
            t = rgb.copy()
            matte = win & ~fg
            t[matte] = t[matte] * 0.45 + np.array([0.55, 0, 0])
            ys, xs = np.where(win)
            t = t[ys.min():ys.max(), xs.min():xs.max()]
            tiles.append(Image.fromarray((t * 255).astype(np.uint8)).resize((300, int(300 * t.shape[0] / t.shape[1]))))
    if args.preview and tiles:
        cols = 6
        rows = (len(tiles) + cols - 1) // cols
        th = tiles[0].size[1]
        sheet = Image.new("RGB", (cols * 304, rows * (th + 4)), (20, 20, 20))
        for i, t in enumerate(tiles):
            sheet.paste(t, ((i % cols) * 304, (i // cols) * (th + 4)))
        sheet.save(args.preview, quality=85)


if __name__ == "__main__":
    main()
