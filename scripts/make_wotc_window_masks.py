#!/usr/bin/env python3
"""Draw the art-window masks of the Wizards of the Coast generation: assets/foil/wotc-win/<layout>-v1.webp.

TCG Live published no foil maps for 1999-2003 (probed 2026-10-01, see fetch_foil_maps.py), so the window holos
(css/holo/wotc.css `wotc-cosmos`, `wotc-starlight`) and the Legendary Collection reverse (the whole card minus
the window) take a drawn mask per FRAME, not per card. The window of a frame is printed in the same place on
every card of it, so it is measured: a pixel that differs from the median image of the stack in most of the cards
is picture, a pixel that never differs is frame, bevel, name bar or text box. (The per-pixel std DP used is thrown
by one card whose art spills over the frame; "fraction of cards that differ from the median" is not.)

Measured on the Scrydex scans of base1-base6, gym1, gym2, neo1-neo4 and basep (600 x 838): ONE Pokemon window
fits every set (x 0.103-0.897, y 0.112-0.513 of the card, the Base, Gym, Rocket, Neo, Legendary and promo frames
differ by under 0.4%), so the Neo frame is not a separate file. Layouts:
    pokemon  Basic, Stage 1 / 2 and Baby Pokemon (the evolution badge sits outside the window)
    trainer  Trainer, Supporter-style cards of Gym Heroes / Challenge, Team Rocket, Neo, Legendary Collection
    energy   Special Energy: the picture runs under the sides of the frame, below the ENERGY title bar
Output: white RGBA, alpha is the window, 600 x 838 (the scans' size, so `mask-size: 100% 100%` lines up),
antialiased; about 1 KB each. Never overwrite a shipped mask: `--suffix -v2` for a redraw.

    python3 scripts/make_wotc_window_masks.py --out assets/foil/wotc-win [--preview <png>]
"""
import argparse
import json
import os

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

W, H = 600, 838
POKEMON_SETS = ["base1", "base2", "base3", "base4", "base5", "gym1", "gym2", "neo1", "neo2", "neo3", "neo4", "base6", "basep"]
TRAINER_SETS = ["base4", "base5", "gym1", "gym2", "neo1", "neo3", "neo4", "base6"]
# the Special Energy art box, measured on the Rainbow, Metal and Miracle Energy (the three holo ones) and the
# Full Heal, Potion and Double Colorless: picture under the sides of the frame, from under the ENERGY bar to the text box
ENERGY_BOX = (0.0300, 0.1415, 0.9720, 0.7330)


def layout_of(card):
    st = card.get("subtypes") or []
    if card.get("supertype") == "Trainer":
        return "trainer"
    if card.get("supertype") == "Energy":
        return "energy" if "Basic" in st else "senergy"
    return "pokemon"


def load(path):
    return np.asarray(Image.open(path).convert("L").resize((W, H), Image.LANCZOS), dtype=np.float32)


def stack(root, data, sets, layout, skip_holo_scans=False):
    out = []
    for s in sets:
        p = os.path.join(data, f"{s}.json")
        if not os.path.exists(p):
            continue
        for c in json.load(open(p)):
            if layout_of(c) != layout:
                continue
            f = os.path.join(root, s, os.path.basename(c.get("image", "")))
            if os.path.exists(f):
                out.append(load(f))
    return np.stack(out)


def window(st, thr=0.5):
    med = np.median(st, 0)
    frac = ndi.uniform_filter((np.abs(st - med) > 22).mean(0), 5)
    m = frac > thr
    m[int(H * 0.66):] = False
    m = ndi.binary_opening(m, structure=np.ones((7, 7)))
    lab, k = ndi.label(m)
    sizes = ndi.sum(m, lab, range(1, k + 1))
    m = lab == (1 + int(np.argmax(sizes)))
    m = ndi.binary_fill_holes(m)
    m = ndi.binary_closing(m, structure=np.ones((5, 5)))
    m = ndi.binary_fill_holes(m)
    # the 5 px blur widens the blob a little: pull the edge back so the foil stops on the bevel
    return ndi.binary_erosion(m, structure=np.ones((3, 3)), iterations=1)


def save(m, out, name, suffix):
    a = ndi.gaussian_filter(m.astype(np.float32), 0.7)
    rgba = np.zeros((H, W, 4), np.uint8)
    rgba[..., :3] = 255
    rgba[..., 3] = np.clip(a * 255, 0, 255).astype(np.uint8)
    path = os.path.join(out, f"{name}{suffix}.webp")
    if os.path.exists(path):
        raise SystemExit(f"{path} exists: never overwrite a shipped asset, pass --suffix")
    Image.fromarray(rgba, "RGBA").save(path, "WEBP", lossless=True, quality=100, method=6)
    return rgba[..., 3]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cards", default="assets/cards")
    ap.add_argument("--data", default="data")
    ap.add_argument("--out", required=True)
    ap.add_argument("--suffix", default="-v1")
    ap.add_argument("--preview")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    masks = {}
    for name, sets in (("pokemon", POKEMON_SETS), ("trainer", TRAINER_SETS)):
        st = stack(args.cards, args.data, sets, name)
        m = window(st)
        ys, xs = np.where(m)
        print(f"{name}: {len(st)} scans, x {xs.min() / W:.4f}-{(xs.max() + 1) / W:.4f}, y {ys.min() / H:.4f}-{(ys.max() + 1) / H:.4f}")
        masks[name] = m
    x0, y0, x1, y1 = ENERGY_BOX
    m = np.zeros((H, W), bool)
    m[int(round(y0 * H)):int(round(y1 * H)), int(round(x0 * W)):int(round(x1 * W))] = True
    masks["energy"] = m
    alphas = {k: save(v, args.out, k, args.suffix) for k, v in masks.items()}
    if args.preview:
        sh = Image.new("L", (300 * len(alphas), 419))
        for i, a in enumerate(alphas.values()):
            sh.paste(Image.fromarray(a).resize((300, 419)), (i * 300, 0))
        sh.save(args.preview)


if __name__ == "__main__":
    main()
