#!/usr/bin/env python3
"""Draw the per-card foil maps of the Wizards of the Coast window holos: assets/foil/wotc-spark/<set>/<n>-v1.webp.

TCG Live has no foil maps for 1999-2003 (css/holo/wotc.css, js/wotc-foil.js `wotcMap`). A frame's art window is
the same on every card (assets/foil/wotc-win/, scripts/make_wotc_window_masks.py), but WHERE the foil shows inside
it is not: the Scrydex scans of the holos are scans of the real foil, so the sparkle the foil threw (the thin
four-point stars and brushed dashes of Base Set, Jungle, Fossil and Legendary Collection's starlight; the dots,
discs and flecks of the cosmos from Base Set 2 on) is printed into the scan, and the Pokemon, which is ink over the foil,
shows none. This script lifts that sparkle out of each scan:

  1. sparkle = how far a pixel's brightest channel stands above its 9 px median (a top-hat);
  2. only small isolated features count (a connected piece of at most 420 px and 60 px across: the drawing's ink
     lines and the bevel are long and thin, a star, a disc and a dash are not), and a feature on the bright side of a
     dark ink line (the darkest pixel within 3 px is 75+ levels under the median) is dropped;
  3. alpha = window * (sparkle + 0.22 (0.34 on the starlight sets) * the sparkle density smoothed over ~10 px): the stars and flecks are the foil
     at full strength, and the sky between them, where the density says foil is, carries a faint floor; a Pokemon
     has none (matte), so its body gets no foil.

The foil layers of css/holo/wotc.css are masked with this alpha (the engine's `--foil-map`), so a glint lights exactly
where the real card glints. The file is cropped to the frame's art window (pokemon / trainer / energy boxes below)
because the rest is empty: wotc.css places it with `mask-size` and `mask-position` per layout (the printed numbers).

    python3 scripts/make_wotc_spark_maps.py --all                 # every window holo of Base Set to Neo Destiny, Legendary, basep
    python3 scripts/make_wotc_spark_maps.py --cards base5:5,base1:4
Never overwrites a shipped map: `--suffix -v2` for a redraw.
"""
import argparse
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

W, H = 600, 838
SETS = ["base1", "base2", "base3", "base4", "base5", "gym1", "gym2", "neo1", "neo2", "neo3", "neo4", "base6", "basep"]
# crop boxes in card pixels (x0, y0, x1, y1), the integer rectangles of the window masks plus 1 px (assets/foil/wotc-win/)
BOXES = {"pokemon": (61, 94, 539, 430), "trainer": (52, 193, 551, 469), "energy": (18, 118, 583, 615)}


def layout_of(card):
    if card.get("energy") or card.get("supertype") == "Energy":
        return "energy"
    if card.get("supertype") == "Trainer":
        return "trainer"
    return "pokemon"


def is_holo(card, set_id):
    if card.get("rarity") == "Rare Shining":
        return False
    if set_id == "basep":
        return bool(card.get("holo"))
    return card.get("rarity") in ("Rare Holo", "Rare Secret")


def window_masks(win_dir):
    out = {}
    for k in BOXES:
        a = np.asarray(Image.open(os.path.join(win_dir, f"{k}-v1.webp")))[..., 3].astype(np.float32) / 255.0
        out[k] = a
    return out


def sparkle(rgb, win, amax=420, dmax=60):
    mx = rgb.max(2)
    med = ndi.median_filter(mx, size=9)
    th = np.clip(mx - med, 0, None)
    dark = ndi.minimum_filter(mx, size=7)
    edge = ndi.maximum_filter(((med - dark) > 75).astype(np.uint8), size=3) > 0
    m = (th > 14) & (win > 0.5) & ~edge
    lab, k = ndi.label(m, structure=np.ones((3, 3)))
    v = np.zeros_like(th)
    if k:
        objs = ndi.find_objects(lab)
        area = ndi.sum(m, lab, range(1, k + 1))
        keep = np.zeros(k + 1, bool)
        for i, (sl, ar) in enumerate(zip(objs, area), 1):
            h = sl[0].stop - sl[0].start
            w = sl[1].stop - sl[1].start
            if ar <= amax and max(h, w) <= dmax:
                keep[i] = True
        v = np.clip(th / 50.0, 0, 1) * keep[lab]
    v = np.maximum(v, ndi.maximum_filter(v, 3) * 0.5)
    return v


STARLIGHT = ("base1", "base2", "base3", "base6")   # sparse stars on a pale sheen: no density gate (the cosmos sets get one)


def card_map(path, layout, wins, gate=False, floor=0.22):
    rgb = np.asarray(Image.open(path).convert("RGB").resize((W, H), Image.LANCZOS)).astype(np.float32)
    win = wins[layout]
    v = sparkle(rgb, win)
    dens = ndi.gaussian_filter(v, 10)
    inside = win > 0.5
    p = np.percentile(dens[inside], 92) if inside.any() else 1.0
    dn = np.clip(dens / max(p, 1e-3), 0, 1)
    raw = dn
    dn = np.clip((dn - 0.30) / 0.45, 0, 1)
    if gate:
        # cosmos: a fleck far from the others is the Pokemon's own colour, not foil; the dots live in clusters over the sky
        v = v * np.clip((raw - 0.12) / 0.25, 0, 1)
    gain = 1.5 if layout == "trainer" else 1.0   # a Trainer's picture is mostly ink: lift what little foil its scan shows
    a = win * np.clip(gain * (v + floor * dn), 0, 1)
    x0, y0, x1, y1 = BOXES[layout]
    return a[y0:y1, x0:x1]


def save(a, path):
    rgba = np.zeros(a.shape + (4,), np.uint8)
    rgba[..., :3] = 255
    rgba[..., 3] = np.clip(a * 255 + 0.5, 0, 255).astype(np.uint8)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if os.path.exists(path):
        raise SystemExit(f"{path} exists: never overwrite a shipped asset, pass --suffix")
    Image.fromarray(rgba, "RGBA").save(path, "WEBP", quality=60, alpha_quality=70, method=6)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cards", help="set:number,set:number ...")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--out", default="assets/foil/wotc-spark")
    ap.add_argument("--win", default="assets/foil/wotc-win")
    ap.add_argument("--data", default="data")
    ap.add_argument("--scans", default="assets/cards")
    ap.add_argument("--suffix", default="-v1")
    args = ap.parse_args()
    wins = window_masks(args.win)
    todo = []
    for s in SETS:
        p = os.path.join(args.data, f"{s}.json")
        if not os.path.exists(p):
            continue
        for c in json.load(open(p)):
            num = c["id"].split("-", 1)[1]
            if args.all and is_holo(c, s):
                todo.append((s, num, c))
            elif args.cards and f"{s}:{num}" in args.cards.split(","):
                todo.append((s, num, c))
    for s, num, c in todo:
        scan = os.path.join(args.scans, s, os.path.basename(c["image"]))
        a = card_map(scan, layout_of(c), wins, gate=s not in STARLIGHT, floor=0.34 if s in STARLIGHT else 0.22)
        out = os.path.join(args.out, s, f"{num}{args.suffix}.webp")
        save(a, out)
        print(out, os.path.getsize(out), file=sys.stderr)


if __name__ == "__main__":
    main()
