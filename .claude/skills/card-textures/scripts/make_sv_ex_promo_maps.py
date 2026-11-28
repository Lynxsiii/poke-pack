#!/usr/bin/env python3
"""Foil maps for Scarlet & Violet ex promos that TCG Live has no map for (SVP 067 Roaring Moon ex, 068 Iron Valiant ex).

Without a map such a promo fell to the old whole-face `foil-ex` recipe (a teal or milky wash over the whole card, the
Pokémon included: per-card review 2026-11-28). With one it is a Double Rare like its set siblings (js/fam/
sv-double-rare.js claims any SV ex with a map).

The layout of a Double Rare's foil (frame, name bar, text box, rule box) is the same on every card of a set, so it is
taken from the set's own Live maps: the per-pixel median of every Double Rare ex map of the set gives the frame and the
text box; the 85th percentile gives the art background's level where the Pokémon differ. The Pokémon is then cut out
with the card's figure mask (make_figure_masks.py --zone 20,70,580,470 --spill).

    python3 make_sv_ex_promo_maps.py --figures FIG --write-data     # every id with a mask in FIG

Output: assets/foil/maps/<set>/<number>-fg1.webp; nothing is overwritten.
"""
import argparse
import glob
import json
import os

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
ART = (70 / 838, 470 / 838)  # the band of the card the art (and the Pokémon) can be in


def is_ex(c):
    return any(str(s).lower() == "ex" for s in c.get("subtypes") or []) or str(c.get("name", "")).endswith(" ex")


def template(cards, size):
    maps = []
    for c in cards:
        if c.get("rarity") == "Double Rare" and c.get("foilMap") and is_ex(c) and "Tera" not in (c.get("subtypes") or []):
            p = os.path.join(ROOT, c["foilMap"])
            if os.path.exists(p):
                maps.append(np.asarray(Image.open(p).convert("RGBA").resize(size))[..., 3])
    stack = np.stack(maps).astype(np.float32)
    med, hi = np.median(stack, 0), np.percentile(stack, 85, 0)
    h = size[1]
    out = med.copy()
    y0, y1 = int(ART[0] * h), int(ART[1] * h)
    out[y0:y1] = hi[y0:y1]
    return out, len(maps)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--figures", required=True)
    ap.add_argument("--write-data", action="store_true")
    args = ap.parse_args()
    for fig in sorted(glob.glob(os.path.join(args.figures, "*.png"))):
        cid = os.path.splitext(os.path.basename(fig))[0]
        st = cid.split("-")[0]
        path = os.path.join(ROOT, "data", f"{st}.json")
        raw = open(path).read()
        data = json.loads(raw)
        cards = data["cards"] if isinstance(data, dict) else data
        card = next((c for c in cards if c.get("id") == cid), None)
        if not card or card.get("foilMap"):
            print("skip:", cid)
            continue
        size = (367, 512)
        base, n = template(cards, size)
        figure = Image.open(fig).convert("L").resize(size, Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.7))
        alpha = np.clip(base * (1 - np.asarray(figure).astype(np.float32) / 255), 0, 255).astype(np.uint8)
        new = f"assets/foil/maps/{st}/{card['number']}-fg1.webp"
        target = os.path.join(ROOT, new)
        if not os.path.exists(target):
            rgba = np.dstack([np.full_like(alpha, 255)] * 3 + [alpha])
            Image.fromarray(rgba, "RGBA").save(target, "WEBP", lossless=True, method=6)
        print(cid, "->", new, f"(layout from {n} maps)")
        if args.write_data:
            at = raw.index(f'"id": "{cid}"')
            k = raw.index('"image":', at)
            indent = raw[raw.rfind("\n", 0, k) + 1:k]
            raw = raw[:k] + f'"foilMap": "{new}",\n{indent}' + raw[k:]
            open(path, "w").write(raw)
