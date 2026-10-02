#!/usr/bin/env python3
"""make_lc_maps.py: the foil maps of Legendary Collection's (base6) 19 Rare Holos.

Family wotc-legendary-collection (older-era holo remaster, 2026-10-02). Every Legendary Collection holo reprints a Base Set,
Jungle, Fossil or Team Rocket card with the same art over the same 1999 Starlight foil (the frame is the same window to within a
pixel), so the art window's BACKGROUND lights up and the Pokemon, the stage badge, the frame and the text stay matte, exactly as
on the shipped families. The cut of each Pokemon is therefore not drawn again: the shipped family's own hand-checked
background map (Base Set / Jungle / Fossil / Team Rocket) is registered onto this reprint's scan (ECC affine on the art window)
and clipped to the Legendary Collection window less its stage badge. Dark Persian and Dark Vaporeon, which were plain Rares in
Team Rocket and so have no shipped cut, are cut here with Team Rocket's colour-prototype cutter (lc_hints.json).

  assets/foil/fam/wotc-legendary-collection/<n>-bg-v1.webp     600 x 838, white, ALPHA = foil (the window background), lossless
  assets/foil/fam/wotc-legendary-collection/<n>-stars-v1.webp  600 x 838, white, ALPHA = the scan's own stars plus bloom
  assets/foil/fam/wotc-legendary-collection/glitter-a-v1.webp, glitter-b-v1.webp   Jungle's halves, byte for byte (same foil)

    python3 .claude/skills/card-textures/scripts/fam/wotc-legendary-collection/make_lc_maps.py [--cards 3,4] [--preview DIR] [--write]

Deterministic. Without --write only the previews are drawn.
"""
import argparse
import importlib.util
import json
import os
import shutil

import cv2
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, *[".."] * 6))
OUT = os.path.join(ROOT, "assets/foil/fam/wotc-legendary-collection")
VER = "v1"
W, H = 600, 838
BOX = (61, 94, 539, 430)
spec = importlib.util.spec_from_file_location("tr", os.path.join(HERE, "..", "wotc-team-rocket", "make_tr_maps.py"))
tr = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tr)

# base6 number -> (shipped set id, its fam folder, its card number); None = drawn here from lc_hints.json
SRC = {
    1: ("base1", "wotc-base-set", 1), 2: ("base3", "wotc-fossil", 2), 3: ("base1", "wotc-base-set", 4),
    4: ("base5", "wotc-team-rocket", 3), 5: ("base5", "wotc-team-rocket", 5), 6: None,
    7: ("base5", "wotc-team-rocket", 83), 8: ("base5", "wotc-team-rocket", 12), 9: None,
    10: ("base2", "wotc-jungle", 3), 11: ("base3", "wotc-fossil", 5), 12: ("base1", "wotc-base-set", 6),
    13: ("base3", "wotc-fossil", 7), 14: ("base2", "wotc-jungle", 4), 15: ("base1", "wotc-base-set", 8),
    16: ("base3", "wotc-fossil", 13), 17: ("base1", "wotc-base-set", 12), 18: ("base1", "wotc-base-set", 15),
    19: ("base1", "wotc-base-set", 16),
}


def scan_of(set_id, n, data):
    return tr.load_rgb(data[set_id][str(n)]["image"])


def register(src, dst):
    """Affine warp taking the shipped scan onto this reprint (ECC on the window, blurred greys)."""
    x0, y0, x1, y1 = BOX
    g = lambda im: cv2.GaussianBlur(cv2.cvtColor(im, cv2.COLOR_RGB2GRAY), (0, 0), 1.0).astype(np.float32)
    a, b = g(dst), g(src)
    mask = np.zeros((H, W), np.uint8)
    mask[y0 + 6:y1 - 6, x0 + 6:x1 - 6] = 255
    # coarse first: phase correlation of the window, then ECC (translation, then affine) from there
    (dx, dy), _ = cv2.phaseCorrelate(a[y0:y1, x0:x1].copy(), b[y0:y1, x0:x1].copy())
    best = None
    for start in ((0.0, 0.0), (-dx, -dy), (dx, dy)):
        warp = np.eye(2, 3, dtype=np.float32)
        warp[0, 2], warp[1, 2] = start
        try:
            crit = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 300, 1e-7)
            cc, w1 = cv2.findTransformECC(a, b, warp, cv2.MOTION_TRANSLATION, crit, mask, 5)
            cc, w2 = cv2.findTransformECC(a, b, w1, cv2.MOTION_AFFINE, crit, mask, 5)
        except cv2.error:
            continue
        if best is None or cc > best[0]:
            best = (cc, w2)
    cc, warp = best
    return warp, cc


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cards", default=",".join(str(i) for i in range(1, 20)))
    ap.add_argument("--preview", default=None)
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()
    data = {s: {c["number"]: c for c in json.load(open(os.path.join(ROOT, f"data/{s}.json")))} for s in ("base1", "base2", "base3", "base5", "base6")}
    hints = json.load(open(os.path.join(HERE, "lc_hints.json")))
    win = np.asarray(Image.open(os.path.join(ROOT, "assets/foil/wotc-win/pokemon-v1.webp")))[..., 3] / 255.0
    inner = ndi.binary_erosion(win > 0.5, tr.disk(2))
    if args.preview:
        os.makedirs(args.preview, exist_ok=True)
    if args.write:
        os.makedirs(OUT, exist_ok=True)
    tiles = []
    for n in [int(x) for x in args.cards.split(",") if x]:
        card = data["base6"][str(n)]
        scan = tr.load_rgb(card["image"])
        src = SRC[n]
        x0, y0, x1, y1 = BOX
        if src:
            sset, fam, sn = src
            sscan = scan_of(sset, sn, data)
            warp, cc = register(sscan, scan)
            bgp = os.path.join(ROOT, f"assets/foil/fam/{fam}/{sn}-bg-v1.webp")
            sa = np.asarray(Image.open(bgp).convert("RGBA"))[..., 3].astype(np.float32) / 255.0
            w = cv2.warpAffine(sa, warp, (W, H), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP)
            # the shipped map is the window less badge and figure for its own scan; here clip to this scan's window
            alpha = np.clip(w, 0, 1) * ndi.gaussian_filter(inner.astype(np.float32), 0.6)
            note = f"from {sset}-{sn} cc {cc:.3f} shift ({warp[0,2]:.1f},{warp[1,2]:.1f})"
        else:
            h = hints[str(n)]
            badge = tr.badge_cut(list(data["base6"].values()))
            rgb = scan[y0:y1, x0:x1]
            fg = tr.figure(rgb, inner[y0:y1, x0:x1], h, (x0, y0))
            a = tr.area_alpha(win[y0:y1, x0:x1], badge[y0:y1, x0:x1], fg)
            alpha = np.zeros((H, W), np.float32)
            alpha[y0:y1, x0:x1] = a
            note = "drawn here"
        core = tr.sparkle(scan[BOX[1]:BOX[3], BOX[0]:BOX[2]], alpha[BOX[1]:BOX[3], BOX[0]:BOX[2]])
        stars = np.zeros((H, W), np.float32)
        stars[BOX[1]:BOX[3], BOX[0]:BOX[2]] = tr.stars_of(core, alpha[BOX[1]:BOX[3], BOX[0]:BOX[2]])
        print(f"{n:2d} {card['name']:<16} foil {alpha[y0:y1, x0:x1].mean():.2f} stars {stars.mean() * 1000:.1f}/1000  {note}")
        if args.write:
            tr.save_alpha(os.path.join(OUT, f"{n}-bg-{VER}.webp"), alpha)
            tr.save_alpha(os.path.join(OUT, f"{n}-stars-{VER}.webp"), stars)
        if args.preview:
            ov = scan.astype(np.float32).copy()
            ov = ov * (1 - alpha[..., None] * 0.45) + np.array([255, 0, 255], np.float32) * alpha[..., None] * 0.27
            t = Image.fromarray(ov[80:450, 40:560].astype(np.uint8))
            ImageDraw.Draw(t).text((6, 6), f"{n} {card['name']} {note}", fill=(255, 255, 0))
            tiles.append(t)
    if args.write:
        for half in ("a", "b"):
            shutil.copyfile(os.path.join(ROOT, f"assets/foil/fam/wotc-jungle/glitter-{half}-{VER}.webp"), os.path.join(OUT, f"glitter-{half}-{VER}.webp"))
    if args.preview and tiles:
        tw, th, cols = 520, 370, 3
        sheet = Image.new("RGB", (tw * cols, th * ((len(tiles) + cols - 1) // cols)), "white")
        for i, t in enumerate(tiles):
            sheet.paste(t, ((i % cols) * tw, (i // cols) * th))
        sheet.save(os.path.join(args.preview, "sheet.png"))


if __name__ == "__main__":
    main()
