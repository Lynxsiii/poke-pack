#!/usr/bin/env python3
"""Text-safe foil maps for the XY prints TCG Live has no foil map for: the
Generations Radiant Collection (RC1-RC32), the "a" full-art prints (g1-28a,
g1-73a) and the Evolutions flats. The full arts and secrets of xy1-xy12 and
dc1 take TCG Live's own maps (fetch_foil_maps.py); these files are the
fallback `xyMap()` hands out for the rest (js/xy-foil.js).

A full-art EX is foil edge to edge, but its attack text, name bar and rule box
are printed straight onto the art with no panel, so a colour-dodged foil laid
flat over them recolours the lettering. The frames are identical from card to
card (only the Pokemon moves), so the MEDIAN of where thin black print sits,
over every scan of one frame, is a map that keeps the lettering calm and
foils the rest: the same idea as make_sm_safe_maps.py, drawn from the scans
because there are no maps to take a median of.

    python3 .claude/skills/card-textures/scripts/make_xy_safe_maps.py [--debug]

Frames: `ex` (Basic full-art EX and the gold-border secret EX), `mega` (full-art
Mega EX, shiny Mega, gold Mega: the extra Mega ability bar and rule box),
`tfa` (full-art Supporter), `item` (gold Trainer Items: a white text box under
a window), `rc` (Radiant Collection, regular frame: art window full, lettering calm). Writes assets/foil/xy-safe-<frame>-v1.webp (367x512 white, alpha =
foil strength; new files, never overwritten: assets are immutable-cached).
"""
import glob
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
W, H = 367, 512


def frame_of(c):
    subs = [str(s).upper() for s in c.get("subtypes", [])]
    name = str(c.get("name", ""))
    if c.get("supertype") == "Trainer" or "SUPPORTER" in subs or "ITEM" in subs:
        return "item" if c.get("rarity") == "Rare Secret" else "tfa"
    if "MEGA" in subs or name.startswith("M ") or "Primal" in name:
        return "mega"
    return "ex"


# Where the lettering sits on each frame, measured on the scans (xy6 to xy8 and
# the Evolutions / Generations frames print the same boxes): (x0, y0, x1, y1,
# foil strength) in percent of the card, feathered by FEATHER px. A median of
# the scans' thin black print was tried first and came out blotchy (Pokemon
# outlines read as lettering on a third of the cards), so the boxes are drawn.
BOXES = {
    "ex": [(12, 2.5, 62, 8, 0.45), (70, 2.5, 94, 8, 0.45), (4, 53, 96, 84, 0.32),
           (4, 85, 44, 94, 0.32), (46, 85.5, 96, 93, 0.30), (4, 94, 96, 97.5, 0.40)],
    "mega": [(12, 2.5, 62, 8, 0.45), (70, 2.5, 94, 8, 0.45), (14, 8, 96, 18, 0.32),
             (5, 56, 96, 69.5, 0.30), (4, 70, 96, 85, 0.32), (4, 85, 44, 94, 0.32),
             (46, 85.5, 96, 93, 0.30), (4, 94, 96, 97.5, 0.40)],
    "tfa": [(3, 2, 97, 8.5, 0.40), (6, 9, 70, 13.5, 0.35), (5, 57, 95, 75, 0.32),
            (5, 87, 95, 95, 0.32), (4, 95.5, 96, 98, 0.40)],
    "rc": [(3, 1.5, 97, 9, 0.50), (4, 52, 96, 85, 0.26), (4, 85, 96, 97.5, 0.30)],
    "item": [(3, 2, 97, 8.5, 0.40), (6, 9, 70, 13.5, 0.30), (5, 51, 95, 88, 0.38),
             (5, 88, 95, 95, 0.30), (4, 95.5, 96, 98, 0.40)],
}
FEATHER = 3.0


def drawn(frame):
    m = np.ones((H, W), np.float32)
    for x0, y0, x1, y1, s in BOXES[frame]:
        box = np.zeros((H, W), np.float32)
        box[int(H * y0 / 100):int(H * y1 / 100), int(W * x0 / 100):int(W * x1 / 100)] = 1
        box = ndimage.gaussian_filter(box, FEATHER)
        m = np.minimum(m, 1 - box * (1 - s))
    return m


def collect():
    frames = {}
    for f in sorted(glob.glob(os.path.join(ROOT, "data", "xy*.json")) + glob.glob(os.path.join(ROOT, "data", "g1.json"))):
        data = json.load(open(f, encoding="utf-8"))
        for c in data["cards"] if isinstance(data, dict) else data:
            if c.get("rc") and c.get("rarity") != "Rare Ultra":
                frames.setdefault("rc", []).append(c["image"])
                continue
            if c.get("rarity") not in ("Rare Ultra", "Rare Secret") or c.get("rc") or c.get("foilAs"):
                continue
            p = c.get("image")
            if p and os.path.exists(os.path.join(ROOT, p)):
                frames.setdefault(frame_of(c), []).append(p)
    return frames


def main():
    frames = collect()
    dbg = []
    for fr, paths in frames.items():
        strength = drawn(fr)
        alpha = np.round(strength * 255).astype(np.uint8)
        img = np.zeros((H, W, 4), np.uint8)
        img[..., :3] = 255
        img[..., 3] = alpha
        dest = os.path.join(ROOT, "assets", "foil", f"xy-safe-{fr}-v1.webp")
        if os.path.exists(dest) and "--force" not in sys.argv:
            print(dest, "exists; skipped")
        else:
            Image.fromarray(img, "RGBA").save(dest, "WEBP", quality=85, alpha_quality=90, method=6)
            print(fr, len(paths), "cards,", os.path.getsize(dest), "bytes")
        if "--debug" in sys.argv:
            ref = Image.open(os.path.join(ROOT, paths[0])).convert("RGB").resize((W, H))
            a = np.asarray(ref).astype(np.float32) * (0.25 + 0.75 * strength[..., None])
            dbg.append(Image.fromarray(a.astype(np.uint8)))
            dbg.append(Image.fromarray(alpha))
    if dbg:
        sheet = Image.new("RGB", (len(dbg) * (W + 6), H), (40, 40, 40))
        for i, im in enumerate(dbg):
            sheet.paste(im.convert("RGB"), (i * (W + 6), 0))
        out = os.path.join(ROOT, "scripts", "_debug", "xy-safe.png")
        os.makedirs(os.path.dirname(out), exist_ok=True)
        sheet.save(out)
        print("debug ->", out)


if __name__ == "__main__":
    main()
