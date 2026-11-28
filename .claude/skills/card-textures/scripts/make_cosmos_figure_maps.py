#!/usr/bin/env python3
"""Cut the Pokémon out of the cosmos promos whose foil map is a drawn box.

Most cosmos promos wear a TCG Live map that already leaves the Pokémon out. A few have none, and `cosmos_window_maps.py`
drew them either a flat art window at half alpha (the Pokémon inside it: every planet of the cosmos landed on the
figure) or no window at all (foil on the silver border only: "no cosmos in the art box"). The scans are clean digital
art with no foil grain, so `make_figure_masks.py` falls back on SAM2's salient object; this script turns its masks
into maps in TCG Live's convention: border and frame foil as the old map has them, the art window at 0.84 where the
figure is not, 0 on the figure (a 1 px feather), stamp and badge holes of the old map kept.

    python3 make_figure_masks.py --cards <ids> --zone 48,92,552,398 --models DIR --out FIG [--preview FIG/prev]
    python3 make_cosmos_figure_maps.py --figures FIG --write-data       # every id with a mask in FIG
    python3 make_cosmos_figure_maps.py --figures FIG --border-only sv3pt5-64-cosmos --write-data
    python3 make_cosmos_figure_maps.py --figures FIG --multiply --write-data   # a solid Live map: old x (1 - figure)

Look at every preview first. A card whose mask is wrong (the figure not found) goes in --border-only: its window gets
no foil at all, which is the safe side (a clean Pokémon and a cosmos border). Output is `<old name>-fg1.webp` next to
the old map; nothing is overwritten. --write-data points the card's foilMap at it.
"""
import argparse
import glob
import json
import os

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
ZONE = (48 / 600, 92 / 838, 552 / 600, 398 / 838)  # the SV art window, as fractions of the card
WINDOW_ALPHA = 215


def find(card_id):
    for path in sorted(glob.glob(os.path.join(ROOT, "data", "*.json"))):
        if os.path.basename(path) in ("sets.json",):
            continue
        try:
            data = json.load(open(path))
        except Exception:
            continue
        cards = data["cards"] if isinstance(data, dict) and "cards" in data else data
        if not isinstance(cards, list):
            continue
        for c in cards:
            if isinstance(c, dict) and c.get("id") == card_id:
                return path, data, c
    return None, None, None


def build(old_path, fig_path, border_only, multiply=False):
    old = np.asarray(Image.open(old_path).convert("RGBA"))[..., 3].astype(np.float32)
    h, w = old.shape
    if multiply:
        # a TCG Live map that is solid over the Pokemon (the holo Rare promos SVP 058/060/191/192, Trick or Trade 21/27,
        # Paldean Fates 13: lit, the sheen bars paled the Pokemon): keep every level of it, times (1 - figure)
        fig = Image.open(fig_path).convert("L").resize((w, h), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.7))
        out = old * (1 - np.asarray(fig).astype(np.float32) / 255)
        rgba = np.dstack([np.full((h, w), 255, np.uint8)] * 3 + [np.clip(out, 0, 255).astype(np.uint8)])
        return Image.fromarray(rgba, "RGBA")
    x0, y0, x1, y1 = int(ZONE[0] * w), int(ZONE[1] * h), int(ZONE[2] * w) + 1, int(ZONE[3] * h) + 1
    zone = np.zeros((h, w), bool)
    zone[y0:y1, x0:x1] = True
    # the window is what the old map did not paint as bare frame foil (full alpha) inside the zone
    window = zone & (old < 200)
    drawn_window = zone & (old > 60) & (old < 200)  # a flat half-alpha box: keep its exact shape (badge notch, stamps)
    if drawn_window.sum() > 0.5 * zone.sum():
        window = drawn_window
    out = old.copy()
    out[zone & (old < 200)] = 0
    if not border_only:
        fig = Image.open(fig_path).convert("L").resize((w, h), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.7))
        keep = 1 - np.asarray(fig).astype(np.float32) / 255
        out[window] = (WINDOW_ALPHA * keep)[window]
    rgba = np.dstack([np.full((h, w), 255, np.uint8)] * 3 + [np.clip(out, 0, 255).astype(np.uint8)])
    return Image.fromarray(rgba, "RGBA")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--figures", required=True, help="make_figure_masks.py --out directory")
    ap.add_argument("--border-only", default="", help="ids whose mask is wrong: no foil in the window")
    ap.add_argument("--multiply", action="store_true", help="old map x (1 - figure): for a Live map solid over the Pokemon")
    ap.add_argument("--write-data", action="store_true")
    args = ap.parse_args()
    border_only = set(filter(None, args.border_only.split(",")))
    dirty = {}
    for fig in sorted(glob.glob(os.path.join(args.figures, "*.png"))):
        cid = os.path.splitext(os.path.basename(fig))[0]
        path, data, card = find(cid)
        if not card or not card.get("foilMap"):
            print("skip (no card or no map):", cid)
            continue
        old = card["foilMap"]
        if "-fg" in old:
            print("already cut:", cid)
            continue
        new = old.replace(".webp", "-fg1.webp")
        target = os.path.join(ROOT, new)
        if not os.path.exists(target):
            build(os.path.join(ROOT, old), fig, cid in border_only, args.multiply).save(target, "WEBP", lossless=True, method=6)
        print(cid, "->", new, "(border only)" if cid in border_only else "")
        if args.write_data:
            dirty.setdefault(path, []).append((cid, old, new))
    for path, swaps in dirty.items():
        # a text swap, not a json.dump: the data files are hand-formatted and other work touches them
        raw = open(path).read()
        for cid, old, new in swaps:
            at = raw.index(f'"id": "{cid}"')
            k = raw.index(f'"foilMap": "{old}"', at)
            raw = raw[:k] + f'"foilMap": "{new}"' + raw[k + len(f'"foilMap": "{old}"'):]
        open(path, "w").write(raw)
        print("wrote", path)
