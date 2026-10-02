#!/usr/bin/env python3
"""
Pokémon silhouette maps of the three refractor Gold Stars of the EX era (ex13-102 Gyarados, ex15-100 Charizard, ex15-101 Mew,
all delta species): on these real cards the POKÉMON is the rainbow foil and the art background is flat print (photos in
/mnt/project-files/holo-remaster/ex-gold-star/refs/).

Writes assets/foil/fam/ex-gold-star/<card id>-refractor-v1.webp, a 300 x 419 RGBA webp registered to the scan whose ALPHA is the
Pokémon (1) inside the art window and nothing elsewhere (no border, no frame, no text). The silhouette is GrabCut seeded from a
hand-drawn outline (Charizard: `OUTLINE`, a generous polygon in preview-crop pixels, scan minus OFF) or, for Gyarados and Mew,
from the era's hints (make_ex_delta_masks.py), then cleaned and feathered. Deterministic. Usage (repo root):
  python3 .claude/skills/card-textures/scripts/fam/ex-gold-star/make_refractor_star_maps.py [--preview DIR]
Needs opencv, numpy, scipy, Pillow.
"""
import argparse
import importlib.util
import os

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, *[".."] * 6))
OUT = os.path.join(ROOT, "assets/foil/fam/ex-gold-star")
_s = importlib.util.spec_from_file_location("exd", os.path.join(HERE, "..", "..", "make_ex_delta_masks.py"))
exd = importlib.util.module_from_spec(_s)
_s.loader.exec_module(exd)
W, H = 600, 838
OFF = (36, 70)

# Charizard: the Pokémon's outline, preview-crop pixels (wings, head, torso, arms, legs, tail; the fire is not Pokémon)
OUTLINE = {
    "ex15-100": [
        [(95, 8), (180, 8), (262, 38), (292, 40), (262, 70), (240, 100), (268, 92), (285, 62), (320, 42), (348, 40),
         (338, 70), (342, 100), (350, 70), (368, 45), (440, 28), (515, 15), (518, 80), (480, 130), (420, 152), (435, 175),
         (430, 215), (405, 232), (385, 215), (350, 205), (345, 260), (338, 300), (300, 318), (262, 316), (250, 290), (215, 285),
         (150, 282), (100, 268), (80, 235), (100, 205), (125, 215), (160, 205), (200, 218), (235, 200), (250, 160), (235, 130),
         (200, 105), (150, 65)],
    ],
}
# dabs outside it that are surely not Pokémon (fire breath, flame spots, green and black background)
NOT = {"ex15-100": [(60, 120, 40), (130, 150, 22), (470, 195, 22), (410, 255, 18), (30, 240, 25), (500, 250, 25), (120, 60, 25)]}


def segment_outline(rgb, cid):
    x0, y0 = OFF
    poly = np.array([[x + x0, y + y0] for x, y in OUTLINE[cid][0]], np.int32)
    ys, xs = np.mgrid[0:H, 0:W]
    pm = np.zeros((H, W), np.uint8)
    cv2.fillPoly(pm, [poly], 1)
    pm = pm.astype(bool)
    near = ndi.binary_dilation(pm, iterations=9)
    core = ndi.binary_erosion(pm, iterations=8)
    m = np.full((H, W), cv2.GC_BGD, np.uint8)
    m[near] = cv2.GC_PR_BGD
    m[pm] = cv2.GC_PR_FGD
    m[core] = cv2.GC_FGD
    for (px, py, r) in NOT.get(cid, []):
        cv2.circle(m, (px + x0, py + y0), r, cv2.GC_BGD, -1)
    cv2.setRNGSeed(7)
    cv2.grabCut(np.ascontiguousarray(rgb), m, None, np.zeros((1, 65)), np.zeros((1, 65)), 5, cv2.GC_INIT_WITH_MASK)
    return (m == cv2.GC_FGD) | (m == cv2.GC_PR_FGD)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--preview", default="")
    a = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    for cid in ("ex13-102", "ex15-100", "ex15-101"):
        s, n = cid.split("-")
        im = Image.open(os.path.join(ROOT, "assets/cards", s, f"{n}.webp")).convert("RGBA")
        rgb = np.array(Image.alpha_composite(Image.new("RGBA", im.size, (128, 128, 128, 255)), im).convert("RGB"))
        win = exd.window_alpha(cid, "star", False)
        if cid in OUTLINE:
            sil = segment_outline(rgb, cid) & (win > 0.5)
        else:
            sil = exd.segment(rgb, win, exd.HINTS.get(cid, {}))
        sil = exd.clean(sil, win)
        alpha = np.clip((ndi.gaussian_filter(sil.astype(np.float32), 1.4) - 0.15) / 0.7, 0, 1) * win
        small = Image.fromarray((alpha * 255 + 0.5).astype(np.uint8)).resize((300, 419), Image.LANCZOS)
        out = Image.new("RGBA", (300, 419), (255, 255, 255, 0))
        out.putalpha(small)
        path = os.path.join(OUT, f"{cid}-refractor-v1.webp")
        out.save(path, "WEBP", quality=88, alpha_quality=90, method=6, exact=True)
        print(cid, round(float(alpha.mean()), 3), os.path.getsize(path))
        if a.preview:
            os.makedirs(a.preview, exist_ok=True)
            ov = rgb.astype(np.float32) * (0.2 + 0.8 * alpha[..., None])
            Image.fromarray(ov[70:395, 36:564].astype(np.uint8)).resize((1056, 650)).save(os.path.join(a.preview, f"{cid}.png"))


if __name__ == "__main__":
    main()
