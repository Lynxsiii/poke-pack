#!/usr/bin/env python3
"""Text-safe fallback foil maps for Black & White Pokémon-EX and Ace Spec prints that have
no TCG Live map of their own (a reprint in a product, a promo TCG Live lacks).

Same idea as make_sm_safe_maps.py: the maps of one layout share their frame, text box and
rule box; only the Pokémon's silhouette moves. The per-pixel median of every shipped map of
the layout keeps the rules text and a typical Pokémon matte and foils the rest. Soft where
the maps disagree, so a bigger Pokémon only loses a little foil at its edge.

    python3 .claude/skills/card-textures/scripts/make_bw_ex_safe_maps.py

Writes assets/foil/maps/bw-ex-safe.webp (regular-art Pokémon-EX of bw4-bw11, not the
Radiant Collection's) and bw-ace-safe.webp (Ace Spec Items and Tools of bw7-bw10). New files:
assets are immutable-cached, so it refuses to overwrite (--force for a first draft not yet
shipped). js/bw-foil.js bwExSafeMap() hands them to a card with no foilMap.
"""
import glob
import json
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
SIZE = (367, 512)


def stack(pred):
    out = []
    for f in sorted(glob.glob(os.path.join(ROOT, "data", "bw*.json"))):
        data = json.load(open(f, encoding="utf-8"))
        for c in data["cards"] if isinstance(data, dict) else data:
            path = c.get("foilMap")
            if pred(c) and path and os.path.exists(os.path.join(ROOT, path)):
                im = Image.open(os.path.join(ROOT, path)).convert("RGBA")
                if im.size != SIZE:
                    im = im.resize(SIZE, Image.LANCZOS)
                out.append(np.asarray(im)[..., 3].astype(np.float32) / 255)
    return np.array(out)


def save(name, maps):
    med = np.median(maps, 0)
    img = np.zeros((SIZE[1], SIZE[0], 4), np.uint8)
    img[..., :3] = 255
    img[..., 3] = np.round(med * 255).astype(np.uint8)
    dest = os.path.join(ROOT, "assets", "foil", "maps", name)
    if os.path.exists(dest) and "--force" not in sys.argv:
        sys.exit(f"{dest} exists: assets are immutable, pick a new name")
    Image.fromarray(img, "RGBA").save(dest, "WEBP", quality=85, alpha_quality=90, method=6)
    print(name, len(maps), "maps,", os.path.getsize(dest), "bytes")


save("bw-ex-safe.webp", stack(lambda c: c.get("rarity") == "Rare Holo EX" and c.get("supertype") == "Pokémon"
                              and not c.get("rc") and not str(c.get("number", "")).startswith("RC") and not c.get("foilAs")))
save("bw-ace-safe.webp", stack(lambda c: c.get("rarity") == "Rare ACE"))
