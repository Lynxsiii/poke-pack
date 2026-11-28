#!/usr/bin/env python3
"""A figure mask from SAM2 with the prompt points given, for the scans make_figure_masks.py gets wrong.

make_figure_masks.py finds its own prompts from the scan's foil grain. On a clean digital scan with a dark or white
Pokémon it can pick the background as the figure (Aegislash SVP 060) or half the figure (Iron Bundle SVP 058). Here the
points are stated: positive on the Pokémon, negative on the background, in scan pixels at 600 wide. Same output as
make_figure_masks.py (8-bit PNG, 255 = figure, the scan's size), so the map generators take it unchanged.

    figure_mask_points.py --card sv4-svp060 --pos 300,250 --neg 80,120;520,120 --models DIR --out DIR [--preview DIR]
"""
import argparse
import glob
import json
import os

import numpy as np
from PIL import Image

import make_figure_masks as mfm

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))


def pts(s):
    return [tuple(float(v) for v in p.split(",")) for p in s.split(";") if p]


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--card", required=True)
    ap.add_argument("--pos", required=True)
    ap.add_argument("--neg", default="")
    ap.add_argument("--zone", default="48,92,552,398")
    ap.add_argument("--models", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--preview")
    a = ap.parse_args()
    st = a.card.split("-")[0]
    card = next(c for c in json.load(open(os.path.join(ROOT, "data", f"{st}.json"))) if c["id"] == a.card)
    im = Image.open(os.path.join(ROOT, card["image"])).convert("RGB")
    k = im.width / 600
    x0, y0, x1, y1 = [int(round(float(v) * k)) for v in a.zone.split(",")]
    rgb = np.asarray(im)
    sam = mfm.Sam(a.models)
    state = sam.encode(rgb[y0:y1, x0:x1])
    pos, neg = pts(a.pos), pts(a.neg)
    points = [(x * k - x0, y * k - y0) for x, y in pos + neg]
    cands = sam.decode(state, points, [1] * len(pos) + [0] * len(neg))
    area = (y1 - y0) * (x1 - x0)
    ok = [(iou, m) for m, iou in cands if 0.08 < m.sum() / area < 0.6] or [(iou, m) for m, iou in cands]
    iou, m = max(ok, key=lambda t: t[0])
    full = np.zeros(rgb.shape[:2], bool)
    full[y0:y1, x0:x1] = mfm.clean(m, area)
    os.makedirs(a.out, exist_ok=True)
    Image.fromarray((full * 255).astype(np.uint8)).save(os.path.join(a.out, a.card + ".png"))
    print(a.card, "cover", round(float(full.sum() / area), 3), "iou", round(iou, 3))
    if a.preview:
        os.makedirs(a.preview, exist_ok=True)
        mfm.preview(rgb, full.astype(np.float32), (x0, y0, x1, y1), os.path.join(a.preview, a.card + ".jpg"))
